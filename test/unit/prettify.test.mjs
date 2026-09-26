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

test('prettify_enabled: false disables prettify_grid and prettify_min_max exactly like prettify (#306)', (t) => {
  const { slider } = createSlider(t, '<input>', {
    min: 0, max: 10000000,
    prettify_enabled: false,
    prettify_grid: (n) => `G:${n}`,
    prettify_min_max: (n) => `M:${n}`,
  });
  assert.equal(slider._prettifyGrid(1000), 1000);
  assert.equal(slider._prettifyMinMax(1000), 1000);
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
