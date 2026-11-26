import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { createSlider } from './helpers.mjs';

const PLUGIN = readFileSync(new URL('../../js/ion.rangeSlider.js', import.meta.url), 'utf8');
const JQUERY_1_8_3 = readFileSync(new URL('../vendor/jquery-1.8.3.js', import.meta.url), 'utf8');

/**
 * Same as createSlider(), on the vendored jQuery 1.8.3 instead of the npm build. #919: on 1.x
 * the old toggleInput() removeProp("tabindex") wrote tabIndex = undefined, which leaves
 * tabindex="0" behind (from 2.0 it does nothing), so the restore has to be proved on that
 * build as well.
 */
function createSlider183(t, html, options) {
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  window.eval(JQUERY_1_8_3);
  const $ = window.jQuery;
  window.eval(PLUGIN);
  const $input = $('input').first();
  let slider;
  t.after(() => { if (slider && slider.input) slider.destroy(); window.close(); });
  $input.ionRangeSlider(options);
  slider = $.data($input[0], 'ionRangeSlider');
  return { window, $, $input, slider };
}

/** The tabindex attribute as the DOM holds it: its string, or null when there is none. */
function tabindexAttr(input) {
  const node = input.getAttributeNode('tabindex');
  return node && node.specified ? node.value : null;
}

// readme, "Public methods": "After destroy() the input is back to normal and can be
// initialized again." Two things used to stay behind on the input:
//
// - #911: writeToInput() keeps the current from and to in the input's jQuery data, and the
//   constructor reads its data-* settings through the same .data() call, so a slider built
//   after destroy() read the destroyed slider's pair as if the input carried data-from and
//   data-to, and data-* wins over the JS options by design.
// - #886: append() sets the input's disabled property on every build (true with disable,
//   false without), and destroy() never put it back.
//
// jsdom has no layout, but none of this needs one: writeToInput() runs from onStart and
// onUpdate whatever the width, and the input's value and disabled property are plain DOM.

/**
 * Builds a new slider on an input whose first slider was destroyed, hands it to `check`,
 * and destroys it afterwards. The helper's own teardown only knows the first instance, and
 * it closes the window before any hook registered here would run.
 */
function withRebuilt($, $input, options, check) {
  $input.ionRangeSlider(options);
  const rebuilt = $.data($input[0], 'ionRangeSlider');
  try {
    check(rebuilt);
  } finally {
    if (rebuilt && rebuilt.input) rebuilt.destroy();
  }
}

// ------------------------------------------------------------ #911 stale from and to

// Mutation: destroy() -> drop `this.$cache.input.removeData("from");`, and the rebuilt
// slider starts on 60, the pair the destroyed one stored.
test('a single slider built after destroy() starts on the from it is given (#911)', (t) => {
  const { slider, $, $input } = createSlider(t, '<input>', { min: 0, max: 100, from: 30 });
  slider.update({ from: 60 });
  assert.equal($input.data('from'), 60, 'setup: the destroyed slider stored its from on the input');
  slider.destroy();

  withRebuilt($, $input, { min: 0, max: 100, from: 70 }, (rebuilt) => {
    assert.equal($input.val(), '70');
    assert.equal(rebuilt.result.from, 70);
  });
});

// Mutation: destroy() -> drop `this.$cache.input.removeData("to");`, and the stored to (60)
// still wins over the to the call gives, so the rebuilt slider does not start on 70;90.
test('a double slider built after destroy() starts on the from and to it is given (#911)', (t) => {
  const { slider, $, $input } = createSlider(t, '<input>', { type: 'double', min: 0, max: 100, from: 30, to: 50 });
  slider.update({ from: 40, to: 60 });
  assert.equal($input.data('to'), 60, 'setup: the destroyed slider stored its to on the input');
  slider.destroy();

  withRebuilt($, $input, { type: 'double', min: 0, max: 100, from: 70, to: 90 }, (rebuilt) => {
    assert.equal($input.val(), '70;90');
    assert.equal(rebuilt.result.from, 70);
    assert.equal(rebuilt.result.to, 90);
  });
});

// A real data-from attribute still wins over the JS option after a rebuild (settings table,
// Data-Attr column): removing the cached entry makes .data() read the attribute again, it does
// not make the constructor ignore data-from. Red before the fix too (the cached 60 won).
// Mutation: destroy() -> `this.$cache.input.removeData("from");` becomes
// `this.$cache.input.removeData("from").removeAttr("data-from");` (a fix that clears the
// attribute along with the cache), and the rebuilt slider starts on 70.
// Dropping `from: $inp.data("from"),` from the constructor (data-from ignored altogether)
// reds it as well, one step earlier: the first build then starts on the JS 30.
test('a data-from attribute still wins over the JS from after destroy() and a rebuild (#911)', (t) => {
  const { slider, $, $input } = createSlider(t, '<input data-from="40">', { min: 0, max: 100, from: 30 });
  assert.equal($input.val(), '40', 'setup: data-from wins over the JS from at the first build');
  slider.update({ from: 60 });
  slider.destroy();

  withRebuilt($, $input, { min: 0, max: 100, from: 70 }, (rebuilt) => {
    assert.equal($input.val(), '40');
    assert.equal(rebuilt.result.from, 40);
  });
});

// destroy() removes only the two entries writeToInput() stores; any other jQuery data on the
// input belongs to the page. A guard, green from its first run: the fix already names its keys.
// Mutation: destroy() -> `this.$cache.input.removeData("from");` becomes
// `this.$cache.input.removeData();` (no key), which passes every other test in this file and
// wipes the page's entry.
test("destroy() leaves the page's own jQuery data on the input (#911)", (t) => {
  const { slider, $input } = createSlider(t, '<input>', { min: 0, max: 100, from: 30 });
  $input.data('mine', 1);
  slider.destroy();

  assert.equal($input.data('mine'), 1);
});

// ------------------------------------------ #911 values mode: the rebuild reads the input

// In values mode writeToInput() writes the ENTRY into the input's value (from_value), not its
// index. With no from or to left in the input's jQuery data (#911), a values-mode slider
// rebuilt without a from of its own reopens on the entry the input's value names, which the
// constructor looks up in the values array; since #914 that lookup finds number-like strings
// and data-values entries too.
//
// These four pass on the code before the #911 fix as well, for the wrong reason: the rebuild
// read the destroyed slider's index back out of the jQuery data, and that index happened to be
// the right one. What they guard is that the rebuild still lands on the entry now that the
// input's value is the only route to it.
//
// Each moves the slider with update(), which writes the entry into the input, to an entry that
// is neither the first nor the last, so a rebuild that finds nothing (and falls back to the
// first entry, or clamps to the last) goes red. They read the index the rebuild opens on,
// result.from (and result.to), not the input afterwards: jsdom has no layout, and a fresh
// values-mode build sets from_value only in calc(), which needs a width, so here it writes no
// entry into the input (the path #888 files for a slider built hidden). The setup lines read
// result.from as well, which the input-value mutations below leave alone, so each named
// mutation reds the final assertions.

// Mutation: writeToInput() -> drop `this.$cache.input.prop("value", this.result.from_value);`
// (the single-type values branch), and the rebuild finds an empty input and opens on "a".
test('a values-mode slider rebuilt after destroy() without a from reopens on its entry: JS letter values (#911)', (t) => {
  const values = ['a', 'b', 'c', 'd', 'e'];
  const { slider, $, $input } = createSlider(t, '<input>', { values, from: 1 });
  slider.update({ from: 2 });
  assert.equal(slider.result.from, 2, 'setup: the slider stands on "c"');
  slider.destroy();

  withRebuilt($, $input, { values }, (rebuilt) => {
    assert.equal(rebuilt.result.from, 2);
  });
});

// Mutations: the single-type values-branch write above; and constructor ->
// `from_index = this.findValueIndex(val[0], entries, trim_entries, !raw_values);` becomes
// `from_index = -1;` (the lookup before #914), which searches the array for the number 30,
// finds nothing, and opens on "10".
test('a values-mode slider rebuilt after destroy() without a from reopens on its entry: JS number-like string values (#911)', (t) => {
  const values = ['10', '20', '30', '40'];
  const { slider, $, $input } = createSlider(t, '<input>', { values, from: 1 });
  slider.update({ from: 2 });
  assert.equal(slider.result.from, 2, 'setup: the slider stands on "30"');
  slider.destroy();

  withRebuilt($, $input, { values }, (rebuilt) => {
    assert.equal(rebuilt.result.from, 2);
  });
});

// Mutations: the single-type values-branch write above; and constructor -> drop the lookup's
// data-values branch (`} else if (config_from_data.values) { ... }`), which leaves the lookup
// no list to search, so the letter reads as no number and the rebuild opens on "a".
test('a values-mode slider rebuilt after destroy() without a from reopens on its entry: data-values (#911)', (t) => {
  const { slider, $, $input } = createSlider(t, '<input data-values="a,b,c,d,e">', { from: 1 });
  slider.update({ from: 2 });
  assert.equal(slider.result.from, 2, 'setup: the slider stands on "c"');
  slider.destroy();

  withRebuilt($, $input, {}, (rebuilt) => {
    assert.equal(rebuilt.result.from, 2);
  });
});

// Mutations: writeToInput() -> drop `this.$cache.input.prop("value", this.result.from_value +
// this.options.input_values_separator + this.result.to_value);` (the double-type values
// branch), and the rebuild finds an empty input and opens on the whole range; and the
// data-values branch of the lookup dropped as above, which reads "20;30" as the numbers 20
// and 30 and clamps both handles to the last entry.
test('a double values-mode slider rebuilt after destroy() without a from or to reopens on its entries: data-values (#911)', (t) => {
  const { slider, $, $input } = createSlider(t, '<input data-values="10,20,30,40,50">', { type: 'double', from: 0, to: 3 });
  slider.update({ from: 1, to: 2 });
  assert.equal(slider.result.from, 1, 'setup: the from handle stands on "20"');
  assert.equal(slider.result.to, 2, 'setup: the to handle stands on "30"');
  slider.destroy();

  withRebuilt($, $input, { type: 'double' }, (rebuilt) => {
    assert.equal(rebuilt.result.from, 1);
    assert.equal(rebuilt.result.to, 2);
  });
});

// The four above cannot tell the fix from the code before it: the stale index and the entry
// the input names agree there. Here the rebuild is handed a reordered values list that puts
// "c" first. The input's value names "c", so the rebuild opens on index 0. Before the #911 fix
// the destroyed slider's index 2 still sat in the jQuery data and won, and the rebuild opened
// on "b", the entry at index 2 of the new list.
// Mutation: destroy() -> drop `this.$cache.input.removeData("from");`, and the rebuild opens
// on 2.
test('a values-mode slider rebuilt after destroy() on a reordered values list opens on the entry the input names, not the old index (#911)', (t) => {
  const { slider, $, $input } = createSlider(t, '<input>', { values: ['a', 'b', 'c', 'd', 'e'] });
  slider.update({ from: 2 });
  assert.equal(slider.result.from, 2, 'setup: the slider stands on "c"');
  slider.destroy();

  withRebuilt($, $input, { values: ['c', 'a', 'b'] }, (rebuilt) => {
    assert.equal(rebuilt.result.from, 0);
  });
});

// ------------------------------------------------------------- #886 disabled state

// readme settings table, disable: "Disable the slider and the input, so its value is not
// submitted with the form." After destroy() the input is back to the enabled field it was.
// Mutation: destroy() -> drop `this.$cache.input[0].disabled = this.input_disabled;`, and
// the input stays disabled.
test('destroy() re-enables an input the slider disabled (#886)', (t) => {
  const { slider, $input } = createSlider(t, '<input>', { min: 0, max: 100, from: 30, disable: true });
  assert.equal($input[0].disabled, true, 'setup: disable turns the input off');
  slider.destroy();

  assert.equal($input[0].disabled, false);
});

// update() and reset() rebuild through append(), which writes the disabled property again
// each time; none of that may replace what the input had before the first build. The reset()
// at the end is a rebuild that follows a disabled build: with only the two toggles, a capture
// re-read on every build would read the enabled state the previous build left and restore
// "enabled" by accident.
// Mutation: the capture moved into append() (`this.input_disabled =
// this.$cache.input[0].disabled;` at its top, the constructor line dropped), and destroy()
// restores the disabled state the build before reset() left.
test('update() and reset() do not change what destroy() restores (#886)', (t) => {
  const { slider, $input } = createSlider(t, '<input>', { min: 0, max: 100, from: 30, disable: true });
  slider.update({ disable: false });
  assert.equal($input[0].disabled, false, 'setup: update({disable: false}) turns the input on');
  slider.update({ disable: true });
  assert.equal($input[0].disabled, true, 'setup: update({disable: true}) turns it off again');
  slider.reset();
  slider.destroy();

  assert.equal($input[0].disabled, false);
});

// An input the page disabled before the slider was built comes back disabled. A slider built
// without disable turns the input on (append() writes disabled = false), so before this fix
// destroy() handed back an enabled input here.
// Mutation: constructor -> `this.input_disabled = input.disabled;` becomes
// `this.input_disabled = false;`, and the input comes back enabled.
test('destroy() hands back an input that was disabled before the slider was built still disabled (#886)', (t) => {
  const { slider, $input } = createSlider(t, '<input disabled>', { min: 0, max: 100, from: 30 });
  slider.destroy();

  assert.equal($input[0].disabled, true);
});

// destroy() puts the captured state back only while the plugin's own last write (disabled
// exactly when disable is on) is still in place. A slider built without disable whose input
// the page then disabled itself, with no update() in between, hands the input back disabled:
// that state is the page's, not the slider's.
// Mutation: destroy() -> `if (this.$cache.input[0].disabled === !!this.options.disable) {`
// becomes `if (true) {`, and the input comes back enabled.
test('destroy() keeps a disabled state the page set while the slider was alive (#886)', (t) => {
  const { slider, $input } = createSlider(t, '<input>', { min: 0, max: 100, from: 30 });
  $input.prop('disabled', true);
  slider.destroy();

  assert.equal($input[0].disabled, true);
});

// ---------------------------------------------- #919 tab order and readonly state

// readme: "After destroy() the input is back to normal". The slider sets the input's tabindex
// to -1 (so the hidden input is skipped when tabbing) and makes it readonly while it is
// built. destroy() has to give both back the way the input had them: tabindex as the
// attribute it was (or no attribute at all), readonly as the property it was. It did neither:
// the removeProp("tabindex") that was meant to undo the -1 does nothing from jQuery 2.0 on
// (the input stayed at -1 and left the Tab order) and leaves tabindex="0" on 1.x, and
// readonly was always set back to false.
//
// The rows run on the default jQuery and on 1.8.3, where the old removeProp() branch wrote
// tabindex="0". The tabindex is read through the attribute node (tabindexAttr() here,
// readTabindexAttr() in the plugin) because the tabIndex property answers 0 both for an input
// with no tabindex attribute and for tabindex="0".
const BUILDS = [
  { label: 'jQuery 3.7.1', create: createSlider },
  { label: 'jQuery 1.8.3', create: createSlider183 },
];

for (const { label, create } of BUILDS) {
  // Mutation: destroy() -> drop the `this.$cache.input.removeAttr("tabindex");` line of the
  // tabindex restore, and the input keeps tabindex="-1" on both builds. With only the old
  // toggleInput() removeProp() branch put back, the 3.7.1 rows stay green and the 1.8.3
  // tabindex rows go red (the attribute ends on "0").
  test(`destroy() leaves an input that had no tabindex attribute without one, ${label} (#919)`, (t) => {
    const { slider, $input } = create(t, '<input>', { min: 0, max: 100, from: 30 });
    assert.equal(tabindexAttr($input[0]), '-1', 'setup: the slider takes the input out of the Tab order');
    slider.destroy();

    assert.equal(tabindexAttr($input[0]), null);
  });

  // Mutation: constructor -> drop the capture of the tabindex attribute (`this.input_tabindex
  // = ...`), so input_tabindex is undefined, `.attr("tabindex", undefined)` writes nothing, and the
  // input keeps the slider's "-1". The no-attribute row, the update/reset row, the
  // update-over-a-page-change row and the exact-text rows below go red with it.
  test(`destroy() gives an input its own tabindex back, ${label} (#919)`, (t) => {
    const { slider, $input } = create(t, '<input tabindex="3">', { min: 0, max: 100, from: 30 });
    assert.equal(tabindexAttr($input[0]), '-1', 'setup: the slider took the input out of the Tab order');
    slider.destroy();

    assert.equal(tabindexAttr($input[0]), '3');
  });

  // update() and reset() rebuild the input's state (init() sets -1 again each time); neither
  // may replace what the input had before the first build. Both an input with a tabindex and
  // one without go through them.
  // Mutation: the capture moved into init() (read before toggleInput(), the constructor
  // lines dropped), and every rebuild after the first captures the -1 the previous build
  // left: the "3" input comes back with -1, the plain one with a tabindex="-1" it never had.
  test(`update() and reset() do not change the tabindex destroy() restores, ${label} (#919)`, (t) => {
    const withTab = create(t, '<input tabindex="3">', { min: 0, max: 100, from: 30 });
    withTab.slider.update({ from: 40 });
    withTab.slider.reset();
    withTab.slider.destroy();
    assert.equal(tabindexAttr(withTab.$input[0]), '3');

    const plain = create(t, '<input>', { min: 0, max: 100, from: 30 });
    plain.slider.update({ from: 40 });
    plain.slider.reset();
    plain.slider.destroy();
    assert.equal(tabindexAttr(plain.$input[0]), null);
  });

  // A tabindex the page changed since the slider was last built is the page's (update() and
  // reset() rebuild it, as in #886): destroy() puts the captured tabindex back only while
  // the plugin's -1 is still in place.
  // Mutation: destroy() -> the guard `if (readTabindexAttr(...) === "-1") {` becomes `if (true) {`,
  // and the "5" the page set is replaced by the captured "3".
  test(`destroy() keeps a tabindex the page set while the slider was alive, ${label} (#919)`, (t) => {
    const { slider, $input } = create(t, '<input tabindex="3">', { min: 0, max: 100, from: 30 });
    $input[0].setAttribute('tabindex', '5');
    slider.destroy();

    assert.equal(tabindexAttr($input[0]), '5');
  });

  // The page removed the attribute itself since the slider was last built. Same guard; on 1.8.3
  // there is a second way to get this wrong: toggleInput()'s removeProp("tabindex") writes
  // tabIndex = undefined, which would turn "no attribute" into tabindex="0" behind the page.
  // Mutation: destroy() -> the guard dropped as above (the captured "3" comes back); on 1.8.3
  // also toggleInput() -> restore its `else { this.$cache.input.removeProp("tabindex"); }`
  // branch (the attribute becomes "0").
  test(`destroy() keeps a tabindex the page removed while the slider was alive, ${label} (#919)`, (t) => {
    const { slider, $input } = create(t, '<input tabindex="3">', { min: 0, max: 100, from: 30 });
    $input[0].removeAttribute('tabindex');
    slider.destroy();

    assert.equal(tabindexAttr($input[0]), null);
  });

  // The page's change counts only since the slider was last built: update() rebuilds it, and
  // the rebuild's own -1 replaces the "5" the page set, so destroy() hands back the "3" the
  // input had before the first build.
  // Mutation: toggleInput() -> `if (this.has_tab_index) {` becomes
  // `if (this.has_tab_index && (readTabindexAttr(this.$cache.input[0]) === this.input_tabindex || readTabindexAttr(this.$cache.input[0]) === "-1")) {`
  // (a rebuild that spares the page's change), and the input keeps "5" after update(): the
  // setup assertion goes red.
  test(`destroy() restores the tabindex after update() rebuilt over a change the page made, ${label} (#919)`, (t) => {
    const { slider, $input } = create(t, '<input tabindex="3">', { min: 0, max: 100, from: 30 });
    $input[0].setAttribute('tabindex', '5');
    slider.update({ from: 40 });
    assert.equal(tabindexAttr($input[0]), '-1', 'setup: the rebuild takes the input out of the Tab order again');
    slider.destroy();

    assert.equal(tabindexAttr($input[0]), '3');
  });

  // Mutation: destroy() -> drop the readonly restore (`this.$cache.input[0].readOnly =
  // this.input_readonly;`), and the input stays readonly.
  test(`destroy() makes an input the slider set readonly editable again, ${label} (#919)`, (t) => {
    const { slider, $input } = create(t, '<input>', { min: 0, max: 100, from: 30 });
    assert.equal($input[0].readOnly, true, 'setup: the slider makes the input readonly');
    slider.destroy();

    assert.equal($input[0].readOnly, false);
  });

  // Mutation: constructor -> `this.input_readonly = input.readOnly;` becomes
  // `this.input_readonly = false;`, and the input comes back editable.
  test(`destroy() hands back an input that was readonly before the slider was built still readonly, ${label} (#919)`, (t) => {
    const { slider, $input } = create(t, '<input readonly>', { min: 0, max: 100, from: 30 });
    slider.destroy();

    assert.equal($input[0].readOnly, true);
    assert.equal($input[0].hasAttribute('readonly'), true);
  });

  // Mutation: the capture moved into append() (`this.input_readonly = this.$cache.input[0].readOnly;`
  // at its top, the constructor line dropped), and the reset() rebuild reads the readonly the
  // previous build set: the input comes back readonly although it was a plain one.
  test(`update() and reset() do not change what destroy() restores for readonly, ${label} (#919)`, (t) => {
    const { slider, $input } = create(t, '<input>', { min: 0, max: 100, from: 30 });
    slider.update({ from: 40 });
    slider.reset();
    slider.destroy();

    assert.equal($input[0].readOnly, false);
  });

  // Same guard as #886: the readonly is put back only while the plugin's own write (true) is
  // still in place. The page made a readonly input editable since the slider was last built.
  // Mutation: destroy() -> the guard `if (this.$cache.input[0].readOnly === true) {` becomes
  // `if (true) {`, and the captured readonly comes back over the page's change.
  test(`destroy() keeps an editable state the page set while the slider was alive, ${label} (#919)`, (t) => {
    const { slider, $input } = create(t, '<input readonly>', { min: 0, max: 100, from: 30 });
    $input[0].readOnly = false;
    slider.destroy();

    assert.equal($input[0].readOnly, false);
  });

  // The page's change counts only since the slider was last built: update() and reset()
  // rebuild it, and the rebuild's own write (readonly true) replaces the page's. The page
  // made a readonly input editable, update() built the slider again, and destroy() hands the
  // input back readonly, as it was before the first build.
  // Mutation: append() -> `this.$cache.input.prop("readonly", true);` becomes
  // `if (this.$cache.input.prop("readonly") === this.input_readonly) { this.$cache.input.prop("readonly", true); }`
  // (a rebuild that spares the page's change), and the input ends editable.
  test(`destroy() restores readonly after update() rebuilt over a change the page made, ${label} (#919)`, (t) => {
    const { slider, $input } = create(t, '<input readonly>', { min: 0, max: 100, from: 30 });
    $input[0].readOnly = false;
    slider.update({ from: 40 });
    assert.equal($input[0].readOnly, true, 'setup: the rebuild makes the input readonly again');
    slider.destroy();

    assert.equal($input[0].readOnly, true);
  });

  // Not every tabindex attribute is a plain number string: destroy() has to write back the
  // text the input had. Mutation: destroy() -> `this.$cache.input.attr("tabindex",
  // this.input_tabindex);` becomes `this.$cache.input.prop("tabindex", this.input_tabindex);`,
  // and the property turns "03" into "3" and "" into "0".
  for (const written of ['03', '']) {
    test(`destroy() puts back a tabindex attribute written as "${written}", ${label} (#919)`, (t) => {
      const { slider, $input } = create(t, `<input tabindex="${written}">`, { min: 0, max: 100, from: 30 });
      assert.equal(tabindexAttr($input[0]), '-1', 'setup: the slider took the input out of the Tab order');
      slider.destroy();

      assert.equal(tabindexAttr($input[0]), written);
    });
  }
}
