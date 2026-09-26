import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSlider, plain } from './helpers.mjs';

// jsdom has no layout: give the slider a measured track and handle, and every grid label a width, then let
// calcGridLabels() measure. A 200 px track with a 20 px handle (p_handle 10) and grid_margin on has a 180 px grid
// box; a 36 px label is 20% of it, so its half-width margin is -10%.
function measured(t, w_rs, p_handle, label_w) {
  const { slider } = createSlider(t, '<input>', { min: 0, max: 100, grid: true, grid_num: 4 });
  slider.coords.w_rs = w_rs;
  slider.coords.p_handle = p_handle;
  slider.coords.grid_gap = slider.toFixed(p_handle / 2 - 0.1);
  slider.$cache.grid_labels.forEach(($label) => { $label.outerWidth = () => label_w; });
  slider.calcGridLabels();
  return plain(slider.$cache.grid_labels.map(($label) => $label[0].style.marginLeft));   // jsdom-realm array
}

// Mutation: the labels measured against the whole slider (`grid_w = this.coords.w_rs`): 36 / 200 gives -9%, and
// the label no longer centres on its tick.
test('grid labels are measured in the grid box: a 36 px label in a 180 px box gets margin-left -10%', (t) => {
  assert.deepEqual(measured(t, 200, 10, 36), ['-10%', '-10%', '-10%', '-10%', '-10%']);
});

// Mutation: the guard written `if (!grid_w)`: a handle wider than the track gives a negative box, and the labels
// get margins computed from it.
test('a grid box of 0 px or less is not measured', (t) => {
  assert.deepEqual(measured(t, 10, 160, 36), ['', '', '', '', '']);
});

// calcGridCollision(start, finish) driven directly: stub labels and coords, read the visibility it writes. jsdom
// has no layout, so real label widths belong to the browser rows.
function stubLabels(slider, texts, visibility) {
  const labels = texts.map((text) => ({ 0: { style: visibility === undefined ? {} : { visibility }, innerHTML: text } }));
  slider.$cache.grid_labels = labels;
  slider.coords.big_num = texts.length;
  slider.coords.big_empty = texts.map((text) => text === '');
  return labels;
}
function sweep(t, boxes) {                     // boxes: [[start, finish, text], ...] in percent of the grid box
  const { slider } = createSlider(t, '<input>', { min: 0, max: 100 });
  const labels = stubLabels(slider, boxes.map((b) => b[2]));
  slider.calcGridCollision(boxes.map((b) => b[0]), boxes.map((b) => b[1]));
  return labels.map((l) => l[0].style.visibility !== 'hidden');
}

// Mutations: the "keep the last label" branch removed (the sweep then never shows the last label); or the
// right-neighbour comparison removed (`|| finish[i] <= start[last]` dropped: once the last is shown, `!show[last]`
// alone is always false, so no middle label can clear it either and 1-3 go hidden too).
test('the last label stays visible when it clears its neighbours', (t) => {
  assert.deepEqual(sweep(t, [[0, 6, '0'], [20, 26, '1'], [40, 46, '2'], [60, 66, '3'], [96, 102, 'max']]), [true, true, true, true, true]);
});
// Mutation: the `&&` between "clears the previous shown label" and "clears the last" written as `||` (clearing
// the previous alone is then enough: 'x' clears '0' at 6 <= 90 and shows despite still overlapping 'max').
test('a middle label that would overlap the last is hidden, the last stays', (t) => {
  assert.deepEqual(sweep(t, [[0, 6, '0'], [90, 97, 'x'], [95, 101, 'max']]), [true, false, true]);
});
// Mutation: the first/last collision not handled (both shown, overlapping).
test('first and last colliding: the first stays, the last is hidden', (t) => {
  assert.deepEqual(sweep(t, [[0, 60, 'wide'], [50, 100, 'wide2']]), [true, false]);
});
// Mutations: empty labels taking part, either as "first" (`if (!empty[i])` dropped from the first/last scan) or in
// the middle (`if (empty[i]) continue;` dropped: the empty box then blocks "b").
test('empty labels take no part; the first non-empty label is first', (t) => {
  assert.deepEqual(sweep(t, [[0, 6, ''], [10, 16, 'a'], [96, 102, 'b']]), [false, true, true]);
  assert.deepEqual(sweep(t, [[0, 10, 'a'], [11, 20, ''], [15, 30, 'b'], [90, 100, 'c']]), [true, false, true, true]);
});
// Mutation: visibility written only for labels being hidden (a second pass never shows a label again).
test('a second pass shows labels again after the grid gets wider', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 0, max: 100 });
  const labels = stubLabels(slider, ['x', 'x', 'x']);
  slider.calcGridCollision([0, 40, 90], [60, 70, 100]);        // narrow: the middle label overlaps the first
  assert.equal(labels[1][0].style.visibility, 'hidden');
  slider.calcGridCollision([0, 40, 90], [10, 50, 100]);        // wide: it fits
  assert.notEqual(labels[1][0].style.visibility, 'hidden');
});
// Mutation: a shown label written as "visible" instead of "" (an inline visible would override a site stylesheet
// that hides the first or last grid label), or a shown label not written at all (an earlier "hidden" would stay).
test('a shown label carries no inline visibility', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 0, max: 100 });
  const labels = stubLabels(slider, ['0', '50', '100'], 'hidden');
  slider.calcGridCollision([0, 45, 95], [5, 55, 100]);
  assert.deepEqual(labels.map((l) => l[0].style.visibility), ['', '', '']);
});

// Mutation: the emptiness check written on the HTML (`.html() === ""`) instead of the rendered text
// (`.text() === ""`): a label holding only markup, like a prettify_grid returning "<b></b>", has non-empty HTML
// and so would not count as empty even though it shows nothing.
test('a label with markup but no text counts as empty', (t) => {
  const { slider } = createSlider(t, '<input>', {
    min: 0, max: 100, grid: true, grid_num: 4,
    prettify_grid: function (n) { return n === 0 ? '<b></b>' : String(n); }
  });
  slider.coords.w_rs = 200;
  slider.coords.p_handle = 10;
  slider.coords.grid_gap = slider.toFixed(10 / 2 - 0.1);
  slider.$cache.grid_labels.forEach(($label) => { $label.outerWidth = () => 20; });
  slider.calcGridLabels();
  assert.equal(slider.coords.big_empty[0], true);
});
