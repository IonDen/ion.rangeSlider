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

// Pins behaviour. Mutation this catches: the warning ignoring the mode (values mode and grid_snap set the units).
test('no grid_num warning in values mode or under grid_snap', (t) => {
  let a, b;
  createSlider(t, '<input>', { values: ['a', 'b'], grid: true, grid_num: -4 }, (window) => { a = warnings(window); });
  createSlider(t, '<input>', { min: 0, max: 10, grid: true, grid_snap: true, grid_num: -4 }, (window) => { b = warnings(window); });
  assert.equal(a.concat(b).filter((m) => /grid_num/.test(m)).length, 0);
});

// Pins behaviour. Mutation this catches: a value above 50 clamped in validate() (options.grid_num would read 50).
test('grid_num above 50 reads back as given', (t) => {
  assert.equal(createSlider(t, '<input>', { min: 0, max: 100, grid: true, grid_num: 60 }).slider.options.grid_num, 60);
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
