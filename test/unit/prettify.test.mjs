import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSlider, plain } from './helpers.mjs';

test('prettify groups thousands with the separator', (t) => {
  assert.equal(createSlider(t, '<input>', { min: 0, max: 10000000 }).slider.prettify(10000000), '10 000 000');
  assert.equal(createSlider(t, '<input>', { min: 0, max: 10000, prettify_separator: ',' }).slider.prettify(1234567), '1,234,567');
});

test('a custom prettify function replaces the default', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 0, max: 100, prettify: (n) => `<${n}>` });
  assert.equal(slider._prettify(42), '<42>');
});

test('a prettify option given as a global function name resolves it (#535)', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 0, max: 100, prettify: 'my_prettify' }, (window) => {
    window.my_prettify = function (n) { return '#' + n; };
  });
  assert.equal(slider._prettify(42), '#42');
});

test('data-prettify resolves a global function by name -- the motivating vue-form-generator path (#535)', (t) => {
  const { slider } = createSlider(t, '<input data-prettify="my_prettify">', { min: 0, max: 100 }, (window) => {
    window.my_prettify = function (n) { return '~' + n; };
  });
  assert.equal(slider._prettify(7), '~7');
});

test('an unresolvable prettify name falls back to default formatting, no throw (#535)', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 0, max: 10000000, prettify: 'does_not_exist_fn' });
  assert.equal(slider._prettify(10000000), '10 000 000');
});

test('update({ prettify: "name" }) resolves a global function named after init (#535)', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 0, max: 100 }, (window) => {
    window.late_prettify = function (n) { return '*' + n + '*'; };
  });
  assert.equal(slider._prettify(5), '5');           // default formatting before update
  slider.update({ prettify: 'late_prettify' });
  assert.equal(slider._prettify(5), '*5*');
});

test('prettify: "eval" is refused even in values mode with prettify_all_values -- no code execution (#535 security)', (t) => {
  const payload = 'window.__pwned = true';
  const { window, slider } = createSlider(t, '<input>', {
    values: ['a', payload, 'c'],
    prettify: 'eval',
    prettify_all_values: true,
  });
  assert.equal(window.__pwned, undefined);                 // the payload string was never executed
  assert.equal(slider.options.p_values[1], payload);        // fell back to default formatting: no digits to group, string passes through unchanged
});

test('the other code-exec globals (Function, setTimeout, setInterval, execScript) are refused the same way (#535 security)', (t) => {
  ['Function', 'setTimeout', 'setInterval', 'execScript'].forEach((name) => {
    const { slider } = createSlider(t, '<input>', { min: 0, max: 10000000, prettify: name });
    assert.equal(slider._prettify(10000000), '10 000 000');   // default formatting, not window[name] bound as prettify
  });
});

test('values mode threads a string-resolved prettify into p_values -- resolution runs before the values loop (#535)', (t) => {
  const { slider } = createSlider(t, '<input>', { values: [10, 20, 30], prettify: 'my_values_prettify' }, (window) => {
    window.my_values_prettify = function (n) { return '#' + n; };
  });
  assert.deepEqual(plain(slider.options.p_values), ['#10', '#20', '#30']);
});

test('an empty string prettify is treated as unset -- default formatting, no throw (#535)', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 0, max: 10000000, prettify: '' });
  assert.equal(slider._prettify(10000000), '10 000 000');
});

test('decorate adds prefix, postfix and max_postfix only on the max value', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 0, max: 100, prefix: '$', postfix: 'k', max_postfix: '+' });
  assert.equal(slider.decorate('50', 50), '$50k');
  assert.equal(slider.decorate('100', 100), '$100+ k');
});

// #884: before this fix, decorate() wrote its own separator between max_postfix and
// postfix unconditionally, so a postfix that already opens with whitespace (the site's
// age demo, postfix " years") came out with two: "100+  years". The rule the issue
// asked for is readme.md's max_postfix/postfix pair joined by one space, unless the
// postfix already brings its own.
// Mutation caught: drop the `!/^\s/.test(o.postfix)` guard back to an unconditional
// `decorated += " ";` -- this test reds with '100+  years' (two spaces).
test('a max_postfix and a postfix that already opens with whitespace get exactly one space between them, brought by the postfix (#884)', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 0, max: 100, max_postfix: '+', postfix: ' years' });
  assert.equal(slider.decorate('100', 100), '100+ years');
});

// Pins the plain-postfix case the #884 fix must leave exactly as it is: no leading
// whitespace still gets the plugin's own separator space, matching readme's own example
// ("0 - 100+" / "100k" combined reads "100+ k").
// Mutation caught: drop the space insertion altogether (e.g. `if (false)` around
// `decorated += " ";`) -- this test reds with '100+k' (no space).
test('a max_postfix followed by a plain postfix keeps its own separator space (#884 pin)', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 0, max: 100, max_postfix: '+', postfix: 'k' });
  assert.equal(slider.decorate('100', 100), '100+ k');
});

// A tab is whitespace too -- the fix tests against /^\s/, not a literal space character.
// Mutation caught: narrowing the guard to `o.postfix.charAt(0) !== ' '` instead of the
// \s regex -- a tab-led postfix would still gain the plugin's own separator space and
// this test reds with '100+ \tunits'.
test('a postfix opening with a tab also brings its own separator, no space added (#884)', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 0, max: 100, max_postfix: '+', postfix: '\tunits' });
  assert.equal(slider.decorate('100', 100), '100+\tunits');
});

// The guard belongs inside the `if (o.max_postfix)` block; without max_postfix a
// whitespace-leading postfix is untouched by the fix.
// Mutation caught: moving the guard onto the unconditional `if (o.postfix) { decorated
// += o.postfix; }` line at the bottom of decorate() -- a whitespace-leading postfix
// would then be dropped even with no max_postfix, and this test reds with '50' / '100'
// (the postfix missing) instead of '50 years' / '100 years'.
test('without max_postfix a whitespace-leading postfix is unchanged (#884)', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 0, max: 100, postfix: ' years' });
  assert.equal(slider.decorate('50', 50), '50 years');
  assert.equal(slider.decorate('100', 100), '100 years');
});

// Values mode: the max_postfix branch compares `num` against `o.p_values[o.max]`, not
// `original` -- the last entry needs its own case rather than relying on the numeric
// branch above.
// Mutation caught: revert only the values-mode branch's guard to an unconditional
// `if (o.postfix) { decorated += " "; }` (leaving the numeric branch's guard alone) --
// this test reds with 'c+  years' (two spaces); no other #884 test is affected.
test('values mode: max_postfix and a whitespace-leading postfix at the last entry get one space, from the postfix (#884)', (t) => {
  const { slider } = createSlider(t, '<input>', { values: ['a', 'b', 'c'], max_postfix: '+', postfix: ' years' });
  const last = slider.options.p_values[slider.options.max];
  assert.equal(slider.decorate(last), last + '+ years');
});

test('prettify_grid and prettify_min_max fall back to prettify when unset, and use their own function when set (#306)', (t) => {
  const { slider: shared } = createSlider(t, '<input>', { min: 0, max: 10000000, prettify: (n) => `P:${n}` });
  assert.equal(shared._prettifyGrid(1000), 'P:1000');      // no prettify_grid -> falls back to prettify
  assert.equal(shared._prettifyMinMax(1000), 'P:1000');    // no prettify_min_max -> falls back to prettify

  const { slider: perSurface } = createSlider(t, '<input>', {
    min: 0, max: 10000000,
    prettify: (n) => `P:${n}`,
    prettify_grid: (n) => `G:${n}`,
    prettify_min_max: (n) => `M:${n}`,
  });
  assert.equal(perSurface._prettifyGrid(1000), 'G:1000');
  assert.equal(perSurface._prettifyMinMax(1000), 'M:1000');
  assert.equal(perSurface._prettify(1000), 'P:1000');      // handle labels still use the shared prettify, untouched
});

// #889: _prettifyMinMax (via _prettifySurface) now returns the string form of the number
// when prettify is off, matching _prettify() and keeping result.min_pretty/max_pretty
// strings; _prettifyGrid is untouched because no callback field carries a grid tick's
// text (appendGrid() always coerces its return with String() before it reaches the DOM).
// Mutation caught: reverting _prettifySurface()'s disabled branch to `return num;` --
// this reds with 1000 !== '1000'.
test('prettify_enabled: false disables prettify_grid and prettify_min_max exactly like prettify, and returns min/max as a string (#306, #889)', (t) => {
  const { slider } = createSlider(t, '<input>', {
    min: 0, max: 10000000,
    prettify_enabled: false,
    prettify_grid: (n) => `G:${n}`,
    prettify_min_max: (n) => `M:${n}`,
  });
  assert.equal(slider._prettifyGrid(1000), 1000);
  assert.equal(slider._prettifyMinMax(1000), '1000');
  assert.equal(typeof slider._prettifyMinMax(1000), 'string');
});

test('prettify_grid and prettify_min_max given as global function names resolve them (#306)', (t) => {
  const { slider } = createSlider(t, '<input>', {
    min: 0, max: 100,
    prettify_grid: 'my_grid_prettify',
    prettify_min_max: 'my_minmax_prettify',
  }, (window) => {
    window.my_grid_prettify = function (n) { return 'G#' + n; };
    window.my_minmax_prettify = function (n) { return 'M#' + n; };
  });
  assert.equal(slider._prettifyGrid(42), 'G#42');
  assert.equal(slider._prettifyMinMax(42), 'M#42');
});

test('an unresolvable prettify_grid/prettify_min_max name falls back to default formatting, no throw (#306)', (t) => {
  const { slider } = createSlider(t, '<input>', {
    min: 0, max: 10000000,
    prettify_grid: 'does_not_exist_grid_fn',
    prettify_min_max: 'does_not_exist_minmax_fn',
  });
  assert.equal(slider._prettifyGrid(10000000), '10 000 000');
  assert.equal(slider._prettifyMinMax(10000000), '10 000 000');
});

test('the prettify_grid and prettify_min_max denylist refusal mirrors prettify -- eval is never bound (#306 security)', (t) => {
  const { slider } = createSlider(t, '<input>', {
    min: 0, max: 10000000,
    prettify_grid: 'eval',
    prettify_min_max: 'eval',
  });
  assert.equal(slider._prettifyGrid(10000000), '10 000 000');   // default formatting, not window.eval bound as prettify_grid
  assert.equal(slider._prettifyMinMax(10000000), '10 000 000'); // default formatting, not window.eval bound as prettify_min_max
});

test('data-prettify-grid and data-prettify-min-max resolve global functions set as HTML attributes (#306)', (t) => {
  const { slider } = createSlider(t, '<input data-prettify-grid="my_grid_fn" data-prettify-min-max="my_minmax_fn">', { min: 0, max: 100 }, (window) => {
    window.my_grid_fn = function (n) { return 'g~' + n; };
    window.my_minmax_fn = function (n) { return 'm~' + n; };
  });
  assert.equal(slider._prettifyGrid(7), 'g~7');
  assert.equal(slider._prettifyMinMax(7), 'm~7');
});

// #661: in values mode, result.from/to hold the INDEX into options.values, not the
// value itself. calc()'s single/double branches and updateFrom()/updateTo() (the
// update()/reset() path) called `this._prettify(this.result.from)` -- prettifying
// the index -- while the rendered bubble (drawLabels()) and options.p_values (built
// once in validate()) always used the real value. calc()'s branches never run in
// jsdom (w_rs is 0 -- see helpers.mjs), so these tests drive the same defect through
// update()/updateFrom()/updateTo() instead; the calc() sites get their red evidence
// from the browser test.

test('values mode: update() computes from_pretty from the real value, not the index (#661)', (t) => {
  const calls = [];
  const prettify = (n) => { calls.push(n); return 'V' + n; };
  const { slider } = createSlider(t, '<input>', { values: [1, 5, 20, 100, 1000], prettify });

  slider.update({ from: 2 });

  assert.equal(slider.result.from, 2);
  assert.equal(slider.result.from_value, 20);
  // One-line bug: updateFrom() does `this._prettify(this.result.from)`, prettifying
  // the index (2) instead of options.values[2] (20). RED on master: 'V2'.
  assert.equal(slider.result.from_pretty, 'V20');
  // prettify is only ever handed real entry values (1, 5, 20, 100, 1000, possibly
  // repeated across validate() runs) -- never a bare index like the 2 above.
  assert.ok(
    calls.every((n) => [1, 5, 20, 100, 1000].includes(n)),
    'prettify saw a bare index, not just real entry values: ' + JSON.stringify(calls)
  );
});

test('values mode double: update() computes to_pretty from the real value, not the index (#661)', (t) => {
  const prettify = (n) => 'V' + n;
  const { slider } = createSlider(t, '<input>', { values: [1, 5, 20, 100, 1000], type: 'double', prettify });

  slider.update({ from: 1, to: 3 });

  assert.equal(slider.result.to, 3);
  assert.equal(slider.result.to_value, 100);
  // One-line bug: updateTo() does `this._prettify(this.result.to)`, prettifying the
  // index (3) instead of options.values[3] (100). RED on master: 'V3'.
  assert.equal(slider.result.to_pretty, 'V100');
});

test('values mode with string entries: from_pretty is the real entry text, not the index (#661)', (t) => {
  const { slider } = createSlider(t, '<input>', { values: ['apple', 'banana', 'cherry'] });

  slider.update({ from: 1 });

  assert.equal(slider.result.from, 1);
  // One-line bug: updateFrom() prettifies the index (1) through the default number
  // formatter instead of reading options.p_values[1] ('banana'). RED on master: '1'.
  assert.equal(slider.result.from_pretty, 'banana');
});

test('values mode with string entries and prettify_all_values: from_pretty runs the custom prettify on the real value, never an index (#661)', (t) => {
  const calls = [];
  const prettify = (n) => { calls.push(n); return '<' + n + '>'; };
  const { slider } = createSlider(t, '<input>', { values: ['apple', 'banana', 'cherry'], prettify_all_values: true, prettify });

  slider.update({ from: 1 });

  // One-line bug: updateFrom() calls _prettify(1) -- the bare numeric index -- instead
  // of routing through options.p_values[1] (already prettified from 'banana' in
  // validate()). RED on master: '<1>'.
  assert.equal(slider.result.from_pretty, '<banana>');
  assert.ok(!calls.includes(1), 'prettify must never see the bare numeric index 1: ' + JSON.stringify(calls));
});

test('numeric mode: from_pretty via update() is unchanged by the values-mode fix (#661 characterization)', (t) => {
  const prettify = (n) => 'P:' + n;
  const { slider } = createSlider(t, '<input>', { min: 0, max: 100, prettify });

  slider.update({ from: 42 });

  // Green before AND after the fix -- pins that numeric mode keeps calling
  // _prettify(this.result.from) directly (no values.length branch applies).
  // Catching mutation: swap the branches of the values.length if/else added for
  // #661 (or delete the else) in updateFrom() -- this goes red (from_pretty becomes
  // undefined or index-shaped instead of 'P:42').
  assert.equal(slider.result.from_pretty, 'P:42');
});

// ------------------------------------------------------- #889 *_pretty fields as strings
//
// readme "Callback data" documents every *_pretty field as a string ("from_pretty":
// "10 000"). With prettify_enabled off, _prettify() returned its argument unchanged -- a
// number -- so {min: 0, max: 100, from: 30, prettify_enabled: false} fired onStart with
// from_pretty: 30, min_pretty: 0 and max_pretty: 100 as numbers instead of the strings the
// readme promises. Code that concatenates or compares from_pretty as text got a number.
// jsdom has no layout (helpers.mjs), so only the field TYPES are tested here; the rendered
// label text was never wrong either way (test/browser/contract/prettify.spec.mjs).
//
// calc() bails with no width (w_rs stays 0), so a slider's from_pretty/to_pretty are not
// set at construction here -- min_pretty/max_pretty are, through setMinMax(), which does
// not need geometry. prime() (value-fields.test.mjs's pattern, its #909 section) gives the
// slider a 600 px track and settles one draw: the first calc() to actually complete, which
// runs the exact code calc() would run at a real onStart with real geometry. The browser
// suite (test/browser/contract/prettify.spec.mjs) covers the literal onStart payload.

/** Give the slider a 600 px track and 16 px handles, then settle one draw. */
function prime(slider) {
  const $c = slider.$cache;
  $c.rs.outerWidth = () => 600;
  $c.rs.offset = () => ({ left: 0 });
  for (const handle of [$c.s_single, $c.s_from, $c.s_to]) {
    if (handle) handle.outerWidth = () => 16;
  }
  slider.drawHandles();
}

test('single, prettify_enabled: false: from_pretty, min_pretty and max_pretty are strings once calc() completes, matching what onStart carries with real geometry (#889)', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 0, max: 100, from: 30, prettify_enabled: false });
  prime(slider);
  // One-line bug: _prettify()'s disabled branch did `return num;` -- from_pretty comes
  // back the number 30, not the string '30'.
  assert.equal(slider.result.from_pretty, '30');
  assert.equal(typeof slider.result.from_pretty, 'string');
  // One-line bug: _prettifySurface()'s disabled branch did `return num;` -- min_pretty
  // and max_pretty come back the numbers 0 and 100.
  assert.equal(slider.result.min_pretty, '0');
  assert.equal(typeof slider.result.min_pretty, 'string');
  assert.equal(slider.result.max_pretty, '100');
  assert.equal(typeof slider.result.max_pretty, 'string');
});

test('double, prettify_enabled: false: to_pretty is a string too, once calc() completes (#889)', (t) => {
  const { slider } = createSlider(t, '<input>', { type: 'double', min: 0, max: 100, from: 30, to: 70, prettify_enabled: false });
  prime(slider);
  // One-line bug: the double branch's _prettify(this.result.to) call returned the
  // number 70 with prettify disabled.
  assert.equal(slider.result.to_pretty, '70');
  assert.equal(typeof slider.result.to_pretty, 'string');
});

test('prettify_enabled: false: from_pretty stays a string through update() and a later onChange/onFinish (#889)', (t) => {
  const seen = {};
  const { slider } = createSlider(t, '<input>', {
    min: 0, max: 100, from: 30, step: 1, prettify_enabled: false,
    onChange: (data) => { seen.onChange = data.from_pretty; },
    onFinish: (data) => { seen.onFinish = data.from_pretty; },
    onUpdate: (data) => { seen.onUpdate = data.from_pretty; }
  });

  slider.update({ from: 42 });
  // One-line bug: updateFrom() also reads _prettify(this.result.from) -- same defect,
  // a different call site.
  assert.equal(seen.onUpdate, '42');
  assert.equal(typeof seen.onUpdate, 'string');

  // Arm keyboard control the way a real focus does (#742) and press one step -- a real
  // calc() through the single branch, the same code path a drag or a click-on-line would
  // take.
  prime(slider);
  slider.pointerFocus({});
  assert.equal(slider.target, 'single', 'setup: a fresh focus must arm the single handle');
  slider.key('keyboard', { which: 39, preventDefault: function () {} }); // ArrowRight
  slider.drawHandles();

  // One-line bug: calc()'s single branch has its own _prettify(this.result.from) call,
  // read by both onChange and onFinish here (result is one object mutated in place).
  assert.equal(seen.onChange, '43');
  assert.equal(typeof seen.onChange, 'string');
  assert.equal(seen.onFinish, '43');
  assert.equal(typeof seen.onFinish, 'string');
});

test('values mode, prettify_enabled: false: from_pretty/to_pretty are strings for numeric entries, via p_values (#889)', (t) => {
  const { slider } = createSlider(t, '<input>', {
    type: 'double', values: [10, 20, 30, 40, 50], prettify_enabled: false
  });

  // One-line bug: the values-mode loop in validate() calls this._prettify(value) on every
  // numeric entry -- with prettify disabled the loop kept the number, so p_values held
  // [10, 20, 30, 40, 50] instead of their string form.
  assert.deepEqual(plain(slider.options.p_values), ['10', '20', '30', '40', '50']);
  assert.ok(slider.options.p_values.every((v) => typeof v === 'string'));

  slider.update({ from: 1, to: 3 });
  assert.equal(slider.result.from_pretty, '20');
  assert.equal(typeof slider.result.from_pretty, 'string');
  assert.equal(slider.result.to_pretty, '40');
  assert.equal(typeof slider.result.to_pretty, 'string');
});

test('values mode, prettify_enabled: false, values_raw: true: a raw non-numeric entry is untouched, a numeric one still becomes a string (#889)', (t) => {
  // #505: values_raw keeps a values entry exactly as given unless it is already a
  // number (see the loop's own comment). "17.5" stays the raw string; the number 1000
  // is exempt from that guard and still goes through _prettify(), so its p_values entry
  // must be the string form even with prettify off, never the number.
  const { slider } = createSlider(t, '<input>', {
    values: ['17.5', 1000], values_raw: true, prettify_enabled: false
  });

  assert.deepEqual(plain(slider.options.p_values), ['17.5', '1000']);
  assert.equal(typeof slider.options.p_values[0], 'string');
  assert.equal(typeof slider.options.p_values[1], 'string');

  slider.update({ from: 1 });
  // from_value keeps the raw entry -- a number, untouched by this fix (the ruling: only
  // *_pretty fields change type, from_value/to_value keep their raw entries as today).
  assert.equal(slider.result.from_value, 1000);
  assert.equal(typeof slider.result.from_value, 'number');
  assert.equal(slider.result.from_pretty, '1000');
  assert.equal(typeof slider.result.from_pretty, 'string');
});

// Green before AND after the fix -- pins that prettify_enabled: true (the default) is
// untouched: the built-in formatter already returns a string, so nothing about this fix
// changes an enabled slider's from_pretty/min_pretty/max_pretty.
// Mutation caught: inverting `!this.options.prettify_enabled` in _prettify() sends an
// enabled slider down the disabled branch, which returns the raw String(num) instead of
// running it through the separator formatter -- from_pretty comes back '10000', not
// '10 000'.
test('prettify_enabled: true (default): from_pretty/min_pretty/max_pretty are unchanged strings (#889 characterization)', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 0, max: 100000, from: 10000 });
  prime(slider);
  assert.equal(slider.result.from_pretty, '10 000');
  assert.equal(slider.result.min_pretty, '0');
  assert.equal(slider.result.max_pretty, '100 000');
});

// Ruling (#889 brief): "A custom prettify function's return value is not coerced by this
// fix (it is the user's; prettify_enabled true)." Pins that a custom prettify returning a
// number is left exactly as it is today -- the fix scopes to the DISABLED branch only.
// Mutation caught: applying String() to the enabled branch's custom-function call
// (`return String(this.options.prettify(num));`) -- this reds with typeof 'string'
// instead of 'number'.
test('a custom prettify function returning a number is not coerced -- the fix only touches the disabled branch (#889)', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 0, max: 100, prettify: (n) => n * 2 });
  const result = slider._prettify(21);
  assert.equal(result, 42);
  assert.equal(typeof result, 'number');
});

// ------------------------------------------------- #887 the separator inside the fraction
//
// The built-in formatting ran its thousands-grouping regex over the whole formatted
// number, decimals included, so a value with four or more decimals came out with the
// separator inserted into its fraction (1.2345 -> "1.2 345", the issue's own example).
// The fix groups only the integer part of each number in the text; a "." counts as a
// decimal point only when a digit sits on both sides of it, and the digits after a real
// decimal point are appended untouched -- a value with no fraction, or one of three
// digits or fewer either side of a decimal point, was never touched by the grouping
// regex either way and renders exactly as it did before.

test("prettify() keeps the thousands separator out of the decimal part -- the issue's four values (#887)", (t) => {
  const { slider } = createSlider(t, '<input>', { min: 0, max: 2000, step: 0.0001 });
  // One-line bug (the shipped defect): prettify() ran its grouping regex over
  // num.toString() directly, decimals included, instead of splitting on the decimal
  // point first. RED on master: '1.2 345', '0.0 003', '1 234.5 678', '-1 234.5'.
  // Mutation caught: return `run.replace(groupRegex, ...)` instead of
  // `int_part.replace(groupRegex, ...) + fraction` so the whole matched run is grouped,
  // fraction included -- reds 3 of these 4 assertions with '1.2 345', '0.0 003' and
  // '1 234.5 678' (the sign case is untouched either way: its fraction, '.5', is one
  // digit short of the grouping threshold with or without the split).
  assert.equal(slider.prettify(1.2345), '1.2345');
  assert.equal(slider.prettify(0.0003), '0.0003');
  assert.equal(slider.prettify(1234.5678), '1 234.5678');
  assert.equal(slider.prettify(-1234.5), '-1 234.5');
});

test('prettify() with prettify_separator "," keeps the same split (#887)', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 0, max: 2000, step: 0.0001, prettify_separator: ',' });
  // Mutation caught: same whole-run grouping as above -- both the first and second
  // assertions red, with '1.2,345' and '1,234.5,678'.
  assert.equal(slider.prettify(1.2345), '1.2345');
  assert.equal(slider.prettify(1234.5678), '1,234.5678');
  assert.equal(slider.prettify(-1234.5), '-1,234.5');
});

// A third separator spelling, "." -- readme.md's prettify_separator row names only a
// space and a comma as examples, so this test picks a third separator spelling (#887).
// The output is genuinely ambiguous with this separator (a reader cannot tell the
// grouping dot from the decimal point on sight), but that is the user's own setting, not
// a defect the fraction fix introduces or could remove: the fraction itself is still
// carried through untouched, one decimal point among possibly several dots.
test('prettify() with prettify_separator "." still keeps the fraction intact, ambiguous reading and all (#887)', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 0, max: 2000, step: 0.0001, prettify_separator: '.' });
  assert.equal(slider.prettify(1234.5), '1.234.5');
  // Mutation caught: same whole-run grouping -- this second assertion reds with
  // '1.2.345' (the ".5" fraction above is too short to change either way, so the
  // mutation is only visible here, not on the first assertion).
  assert.equal(slider.prettify(1.2345), '1.2345');
});

// Pins behaviour: the current implementation never handles the sign explicitly -- "-"
// matches neither the digit-run split nor the grouping regex, so it is simply left
// where it started, in front of the grouped digits. Tried and confirmed NOT to red this
// test: widening the split regex to sweep the sign into the run (/-?\d+(?:\.\d+)?/g),
// and widening the grouping regex's capture to a character class that includes "-"
// ([\d-]{1,3}...) -- in both cases "-" still never satisfies \d, so it is skipped by
// the grouping regex exactly as before and the output is unchanged. No mutation of the
// split/group logic was found that moves the sign without also breaking the four-value
// grouping test above it, so this stays a characterization of the new code rather than
// a mutation-caught test.
test('prettify() keeps the sign in front of the grouped integer part (#887 characterization)', (t) => {
  const { slider } = createSlider(t, '<input>', { min: -2000000, max: 0 });
  assert.equal(slider.prettify(-1234567), '-1 234 567');
});

// A number JavaScript itself writes in exponent form keeps today's text: the "e" breaks
// the digit run just as a "." always did. For 1e-7 and 1e+21 neither side of the "e" ever
// reaches the grouping threshold: JavaScript's own exponential notation always
// normalizes the mantissa to exactly one digit before the "." (scientific form requires
// 1 <= mantissa < 10) and the exponent itself never exceeds 3 digits (the largest
// magnitude a double supports is around 308/-324).
// Pins behaviour (first two assertions): no mutation of the split/group logic can red
// either. Confirmed live: merging the mantissa and exponent into one matched run
// (changing the split regex to /\d+(?:\.\d+)?(?:e[+-]?\d+)?/g) still leaves both passing,
// because "1" and "7" (or "1" and "21") are each too short to group even combined.
// The mantissa's own fraction can still run long, e.g. 1.2345e-7 -- the fix never groups
// the digits after a decimal point regardless of how many there are, so that stays
// untouched too, not because it is too short.
// Mutation caught (third assertion): revert prettify() to the pre-#887 whole-text single
// grouping pass (group num.toString() directly with the thousands regex, no digit-run
// split, no decimal-point guard at all) -- this value's own mantissa fraction has enough
// digits to cross the grouping threshold, so it reds with '1.2 345e-7' instead of
// '1.2345e-7'.
test('prettify() leaves a number in exponent form untouched, same as before the fix (#887 characterization)', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 0, max: 100 });
  assert.equal(slider.prettify(1e-7), '1e-7');
  assert.equal(slider.prettify(1e21), '1e+21');
  assert.equal(slider.prettify(1.2345e-7), '1.2345e-7');
});

// Pins: a value with no fraction, or a fraction of three digits or fewer, renders
// exactly as it did before the fix.
// Mutation caught: drop `+ fraction` from the return (group the integer part and stop,
// discarding whatever came after the ".") -- '1234.5' reds with '1 234' instead of
// '1 234.5'.
test('prettify() renders a value with 0-3 decimals exactly as before the fix (pin) (#887)', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 0, max: 2000, step: 0.001 });
  assert.equal(slider.prettify(1234), '1 234');
  assert.equal(slider.prettify(1234.5), '1 234.5');
  assert.equal(slider.prettify(1234.56), '1 234.56');
  assert.equal(slider.prettify(1234.567), '1 234.567');

  const { slider: commaSlider } = createSlider(t, '<input>', { min: 0, max: 2000, step: 0.001, prettify_separator: ',' });
  assert.equal(commaSlider.prettify(1234.567), '1,234.567');
});

// The value label and its result.from_pretty payload field: see prime() above (#889) --
// calc() needs real geometry to reach the branch that writes from_pretty, so this stubs a
// 600 px track and settles one draw, the same way the #889 tests above do.
test('a four-decimal slider carries the fixed text on its value label and from_pretty (#887)', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 0, max: 2, step: 0.0001, from: 1.2345 });
  prime(slider);
  // One-line bug: same as above, reached through calc()'s single branch this time.
  // RED on master: '1.2 345'.
  assert.equal(slider.result.from_pretty, '1.2345');
  assert.equal(slider.$cache.single.text(), '1.2345');
});

// The min and max labels: setMinMax() writes result.min_pretty/max_pretty and the label
// DOM text at construction, with no geometry needed (#889's comment above), so this needs
// no prime().
test('a four-decimal slider carries the fixed text on its min and max labels (#887)', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 0, max: 0.0025, step: 0.0001, from: 0 });
  assert.equal(slider.result.min_pretty, '0');
  assert.equal(slider.result.max_pretty, '0.0025');
  assert.equal(slider.$cache.min.text(), '0');
  assert.equal(slider.$cache.max.text(), '0.0025');
});

// #887: prettify() runs over more than JS numbers -- values mode with
// prettify_all_values: true and no custom prettify function sends every raw, non-numeric
// values entry through this same built-in formatter (see the values-mode loop in
// validate()). Splitting the whole text on its first "." (an earlier version of this fix)
// treats any unrelated "." earlier in the text -- an abbreviation, a decimal-looking
// substring -- as the number's decimal point, so the digits after it land in the
// untouched "fraction" and never get grouped: 'Jan. 10000' rendered unchanged instead of
// 'Jan. 10 000'.
// Mutation caught: revert prettify() to 450ddeb's whole-text single split (sign, one
// indexOf('.') split, group the integer part, append the fraction untouched) -- the
// digit run after the stray "." in 'Jan. 10000' and '1.5k - 25000' never reaches the
// grouping regex, and this reds with 'Jan. 10000' and '1.5k - 25000' (both unchanged)
// instead of grouped. RED on 450ddeb.
test('prettify_all_values with no custom prettify keeps a text entry\'s digit runs grouped, not just a JS number\'s (#887)', (t) => {
  const { slider } = createSlider(t, '<input>', {
    values: ['Jan. 10000', '1.5k - 25000', 'x'],
    prettify_all_values: true,
  });
  assert.deepEqual(plain(slider.options.p_values), ['Jan. 10 000', '1.5k - 25 000', 'x']);
});

// #887: a "." is a decimal point only when a digit sits on both sides of it. A dot-led
// digit run used to be treated as a fraction outright, with no check for a digit before
// the dot, so a "." that closes an abbreviation right before a number -- 'Jan.10000',
// 'No.12345', no space either side -- left the digits after it ungrouped, same as a real
// decimal point would.
// Mutation caught: revert prettify() to 3b8c228's leading-dot check (split digit runs
// with /\.?\d+/g, leave a run untouched whenever it starts with ".") -- neither digit run
// has a digit before its "." once the "." is swallowed into the run, so both assertions
// red with 'Jan.10000' and 'No.12345' (both unchanged) instead of grouped. RED on 3b8c228.
test('prettify_all_values treats a "." as a decimal point only between two digits (#887)', (t) => {
  const { slider } = createSlider(t, '<input>', {
    values: ['Jan.10000', 'No.12345'],
    prettify_all_values: true,
  });
  assert.deepEqual(plain(slider.options.p_values), ['Jan.10 000', 'No.12 345']);
});
