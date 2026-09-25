import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSlider } from './helpers.mjs';

const texts = (s) => s.$cache.grid.find('.irs-grid-text').map(function () { return this.textContent; }).get();
const warnings = (window) => { const seen = []; window.console.warn = (m) => seen.push(String(m)); return seen; };

// Red first. Mutation this catches: the "below 1 -> 4" branch dropped; grid_num 0 prints one "NaN" label.
// Captures console.warn via the 4th `setup` argument (matching the other grid_num tests below) so the
// fallback's warning does not leak into test output, and asserts exactly one was recorded. Mutation this
// reds: the console.warn call in validate() removed (0 warnings recorded, not 1).
test('grid_num 0 falls back to the documented default 4', (t) => {
  let seen;
  const { slider } = createSlider(t, '<input>', { min: 0, max: 100, grid: true, grid_num: 0 }, (window) => { seen = warnings(window); });
  assert.deepEqual(texts(slider), ['0', '25', '50', '75', '100']);
  assert.equal(seen.filter((m) => /^grid_num:/.test(m)).length, 1);
});

// Red first. Mutations this catches: `o.grid_num = 4;` removed from the fallback ("abc" yields no ticks); the
// warning printing the converted value instead of the value as given ("grid_num: NaN ...").
test('a non-numeric data-grid-num falls back to 4 and the warning prints it as given', (t) => {
  let seen;
  const { slider } = createSlider(t, '<input data-grid-num="abc">', { min: 0, max: 100, grid: true }, (window) => { seen = warnings(window); });
  assert.deepEqual(texts(slider), ['0', '25', '50', '75', '100']);
  assert.deepEqual(seen.filter((m) => /grid_num/.test(m)), ['grid_num: abc is not a whole number of at least 1, using 4']);
});

// Red first. Mutation this catches: no rounding; 2.5 units then end on a short last unit (0, 36, 72, 90).
test('a fractional grid_num is rounded (2.5 becomes 3)', (t) => {
  assert.deepEqual(texts(createSlider(t, '<input>', { min: 0, max: 90, grid: true, grid_num: 2.5 }).slider), ['0', '30', '60', '90']);
});

// Pins behaviour (passes before the change too). Mutation this catches: rounding moved after the "below 1" check
// (0.6 would become 4).
test('grid_num 0.6 rounds to 1 unit', (t) => {
  assert.deepEqual(texts(createSlider(t, '<input>', { min: 0, max: 100, grid: true, grid_num: 0.6 }).slider), ['0', '100']);
});

// Red first for the read-back (the grid itself already had 51 labels). Mutation this catches: the +Infinity
// branch removed (options.grid_num would read Infinity), or +Infinity treated as invalid (4 units).
test('grid_num Infinity means the 50-unit cap', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 0, max: 100, grid: true, grid_num: Infinity });
  assert.equal(texts(slider).length, 51);
  assert.equal(slider.options.grid_num, 50);
});

// Red first. Mutation this catches: the instance flag dropped; each update() with a bad grid_num warns again.
test('an invalid grid_num warns once per slider, not on every update()', (t) => {
  let seen;
  const { slider } = createSlider(t, '<input>', { min: 0, max: 100, grid: true, grid_num: -4 }, (window) => { seen = warnings(window); });
  slider.update({ grid_num: -4 });
  slider.update({ grid_num: -4 });
  assert.equal(seen.filter((m) => /grid_num/.test(m)).length, 1);
});

// Pins behaviour. Mutation this catches: the warning ignoring the mode (values mode and grid_snap set the
// units) or, for the third slider, `o.grid &&` dropped from the warning condition (grid: false would still warn).
test('no grid_num warning in values mode, under grid_snap, or with the grid off', (t) => {
  let a, b, c;
  createSlider(t, '<input>', { values: ['a', 'b'], grid: true, grid_num: -4 }, (window) => { a = warnings(window); });
  createSlider(t, '<input>', { min: 0, max: 10, grid: true, grid_snap: true, grid_num: -4 }, (window) => { b = warnings(window); });
  createSlider(t, '<input>', { min: 0, max: 10, grid: false, grid_num: -4 }, (window) => { c = warnings(window); });
  assert.equal(a.concat(b).concat(c).filter((m) => /grid_num/.test(m)).length, 0);
});

// Pins behaviour. Mutation this catches: a value above 50 clamped in validate() (options.grid_num would read 50).
test('grid_num above 50 reads back as given', (t) => {
  assert.equal(createSlider(t, '<input>', { min: 0, max: 100, grid: true, grid_num: 60 }).slider.options.grid_num, 60);
});

// Mutation this catches: the `typeof o.grid_num === "number"` guard dropped from validate() -- Math.round(true)
// is 1, so grid_num: true would become 1 unit (2 labels) instead of falling back to the documented default 4.
test('grid_num true is not a number and falls back to 4', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 0, max: 100, grid: true, grid_num: true }, (window) => { warnings(window); });
  assert.deepEqual(texts(slider), ['0', '25', '50', '75', '100']);
  assert.equal(slider.options.grid_num, 4);
});

// Mutation this catches: the `o.grid_num === Number.POSITIVE_INFINITY` check widened to
// `Math.abs(o.grid_num) === Infinity` -- grid_num: -Infinity would then become the 50-unit cap (51 labels)
// instead of falling back to 4.
test('grid_num -Infinity is not the 50-unit cap and falls back to 4', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 0, max: 100, grid: true, grid_num: -Infinity }, (window) => { warnings(window); });
  assert.deepEqual(texts(slider), ['0', '25', '50', '75', '100']);
  assert.equal(slider.options.grid_num, 4);
});

// Mutation this catches: rule 0 removed from calcGridTicks(); grid_snap on 5..5 prints "NaN", 5..5 prints five
// ticks, and a max below min (clamped to min) does the same.
test('a zero range draws one tick with the min label', (t) => {
  assert.deepEqual(texts(createSlider(t, '<input>', { min: 5, max: 5, grid: true, grid_snap: true }).slider), ['5']);
  assert.deepEqual(texts(createSlider(t, '<input>', { min: 5, max: 5, grid: true }).slider), ['5']);
  assert.deepEqual(texts(createSlider(t, '<input>', { min: 5, max: 2, grid: true }).slider), ['5']);
});

// Mutation this catches: rule 0 not covering values mode; a one-entry array prints "undefined".
test('a one-entry values array draws one tick with the entry', (t) => {
  assert.deepEqual(texts(createSlider(t, '<input>', { values: ['only'], grid: true }).slider), ['only']);
});

// Mutation this catches: rule 0 removed (5..5 gives five ticks, the one-entry array one tick at NaN).
test('calcGridTicks() gives a zero range exactly one tick at 0% naming min, as rule 0', (t) => {
  for (const [options, value] of [[{ min: 5, max: 5, grid: true }, 5], [{ values: ['only'], grid: true }, 0]]) {
    const r = createSlider(t, '<input>', options).slider.calcGridTicks();
    assert.equal(r.rule, 0);
    assert.equal(r.ticks.length, 1);
    assert.ok(Number.isFinite(r.ticks[0].left) && Number.isFinite(r.ticks[0].value));
    assert.deepEqual([r.ticks[0].left, r.ticks[0].value], [0, value]);
  }
});

// Mutation this catches: the tolerance dropped; 2.7 / 0.3 is 9.000000000000002 units with a blank twin tick.
test('grid_snap counts 2.7 / 0.3 as exactly 9 units', (t) => {
  assert.deepEqual(texts(createSlider(t, '<input>', { min: 0, max: 2.7, step: 0.3, grid: true, grid_snap: true }).slider),
    ['0', '0.3', '0.6', '0.9', '1.2', '1.5', '1.8', '2.1', '2.4', '2.7']);
});

// Golden regression (#906), pinned to master's own output (computed on 25efb76 with
// `git show 25efb76:js/ion.rangeSlider.js`): a range far smaller than one step makes the raw unit count round
// to 0, not to a whole number close to itself, so it must stay fractional and fall through to the even split's
// two edge ticks (0% and 100%, labelled min and max) instead of dividing by a zero unit count. Before this fix
// both configs collapsed to one tick labelled "NaN". Mutation this catches: the "Math.round(big_num) >= 1 &&"
// guard dropped from the tolerance check in _gridTicksEven().
test('grid_snap tolerance only snaps to a whole unit count of at least 1, matching master', (t) => {
  assert.deepEqual(
    texts(createSlider(t, '<input>', { min: 0.3, max: 0.1 + 0.2, step: 0.01, grid: true, grid_snap: true }).slider),
    ['0.3', '0.30 000 000 000 000 004']
  );
  assert.deepEqual(
    texts(createSlider(t, '<input>', { min: 0, max: 1e-10, step: 1, grid: true, grid_snap: true }).slider),
    ['0', '1e-10']
  );
});

// Mutation this catches: `Math.abs` dropped from the tolerance check in _gridTicksEven() -- 100 / 6 is
// 16.666666666666668 units, and without Math.abs the negative difference from 17 (-0.333...) passes the
// one-sided "<=" check against a tiny positive threshold, wrongly snapping to 17 whole units.
test('grid_snap tolerance holds from both sides: a count comfortably short of the next whole number', (t) => {
  assert.deepEqual(
    texts(createSlider(t, '<input>', { min: 0, max: 100, step: 6, grid: true, grid_snap: true }).slider),
    ['0', '6', '12', '18', '24', '30', '36', '42', '48', '54', '60', '66', '72', '78', '84', '90', '96', '100']
  );
});

// Mutation this catches: the tolerance widened from 1e-9 to 1e-3 -- 4.001 / 1 is 4.001 units, outside the real
// tolerance but inside a widened one, which would wrongly snap to 4 units and lose the '4' tick.
test('grid_snap tolerance does not widen past 1e-9: a count genuinely short of the next whole number', (t) => {
  assert.deepEqual(
    texts(createSlider(t, '<input>', { min: 0, max: 4.001, step: 1, grid: true, grid_snap: true }).slider),
    ['0', '1', '2', '3', '4', '4.001']
  );
});

// Mutation this catches: either undefined/null check in _prettifyGrid() narrowed to undefined alone; the labels
// then read "null" or skip prettify.
test('a formatter that returns undefined or null hands the grid label on: prettify_grid to prettify to built-in', (t) => {
  for (const nothing of [undefined, null]) {
    const grid = (options) => texts(createSlider(t, '<input>', Object.assign({ min: 0, max: 1000, grid: true }, options)).slider);
    assert.deepEqual(grid({ prettify_grid: () => nothing }), ['0', '250', '500', '750', '1 000']);
    assert.deepEqual(grid({ prettify_grid: () => nothing, prettify: (n) => 'p' + n }), ['p0', 'p250', 'p500', 'p750', 'p1000']);
    assert.deepEqual(grid({ prettify: () => nothing }), ['0', '250', '500', '750', '1 000']);
  }
});

// Mutation this catches: the try/catch in _tryGridFormatter() removed; the throw escapes the constructor.
test('a prettify_grid that throws gets the built-in formatting and one warning naming prettify_grid', (t) => {
  let seen;
  const { slider } = createSlider(t, '<input>', { min: 0, max: 100, grid: true, prettify_grid: () => { throw new Error('boom'); } },
    (window) => { seen = warnings(window); });
  assert.deepEqual(texts(slider), ['0', '25', '50', '75', '100']);
  assert.equal(seen.filter((m) => /^prettify_grid:/.test(m)).length, 1);
});

// Mutation this catches: the warning always naming prettify_grid, or prettify's throw on the grid path escaping.
// from: 0 keeps the value label and the min and max labels (their prettify calls are not guarded) off 50, so only
// the 50 tick meets the throw.
test('a prettify that throws for one grid value builds the slider, that label falls back, the warning names prettify', (t) => {
  let seen;
  const { slider } = createSlider(t, '<input>', {
    min: 0, max: 100, from: 0, grid: true,
    prettify: (n) => { if (n === 50) throw new Error('x'); return String(n); }
  }, (window) => { seen = warnings(window); });
  assert.deepEqual(texts(slider), ['0', '25', '50', '75', '100']);
  assert.equal(seen.filter((m) => /^prettify:/.test(m)).length, 1);
});

// Mutation this catches: the `this.grid_formatter_warned = false;` reset removed from appendGrid() (the rebuild
// after update() stays silent).
test('the formatter warning comes once per grid build: update() rebuilds and warns again', (t) => {
  let seen;
  const { slider } = createSlider(t, '<input>', { min: 0, max: 100, grid: true, prettify_grid: () => { throw new Error('boom'); } },
    (window) => { seen = warnings(window); });
  slider.update({ from: 10 });
  assert.equal(seen.filter((m) => /^prettify_grid:/.test(m)).length, 2);
});

// Pins behaviour. Mutation this catches: "" treated as a failure.
test('a prettify_grid that returns "" still blanks the label', (t) => {
  const s = createSlider(t, '<input>', { min: 0, max: 100, grid: true, prettify_grid: (n) => (n === 50 ? '' : String(n)) }).slider;
  assert.deepEqual(texts(s), ['0', '25', '', '75', '100']);
});

// Pins behaviour. Mutation this catches: the formatter called as a plain function (`var fn = ...; fn(num)`), which
// loses the options object as `this`; a formatter reading this.grid_num then throws and falls back.
test('a grid formatter is still called with the options object as this', (t) => {
  const s = createSlider(t, '<input>', { min: 0, max: 100, grid: true, prettify_grid: function (n) { return this.grid_num + ':' + n; } }).slider;
  assert.deepEqual(texts(s), ['4:0', '4:25', '4:50', '4:75', '4:100']);
});

// Mutation this catches: the try around the detail (`" (" + e + ")"`) removed from _tryGridFormatter() -- a
// thrown value with no string form (Object.create(null) has no toString or valueOf) then throws while the
// warning message itself is being built, escaping the constructor instead of falling back.
test('a prettify_grid that throws a value with no string form still falls back', (t) => {
  const { slider } = createSlider(t, '<input>', {
    min: 0, max: 100, grid: true,
    prettify_grid: function () { throw Object.create(null); }
  }, (window) => { warnings(window); });
  assert.deepEqual(texts(slider), ['0', '25', '50', '75', '100']);
});

// Mutation this catches: the `typeof console !== "undefined"` guard removed from _tryGridFormatter() (throwing
// prettify_grid) or from the grid_num warning in validate() (grid_num: 0) -- either one, with no console object
// present, throws a ReferenceError building the warning instead of silently skipping it and falling back.
test('a slider with no console object still builds when grid_num and a formatter both need to warn', (t) => {
  const { slider } = createSlider(t, '<input>', {
    min: 0, max: 100, grid: true, grid_num: 0,
    prettify_grid: function () { throw new Error('x'); }
  }, (window) => { delete window.console; });
  assert.deepEqual(texts(slider), ['0', '25', '50', '75', '100']);
});
