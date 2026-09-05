import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSlider } from './helpers.mjs';

// #772: appendGrid() places grid_num + 1 evenly spaced big ticks and labels
// each with convertToValue(big_w), which snaps the tick's percent to the
// step grid. When the range holds fewer steps than grid_num, two
// neighbouring ticks snap to the same value and the same label text is
// emitted twice (min: 1, max: 4, grid_num left at its default of 4 renders
// ["1","2","3","3","4"]). The fix keeps every `.irs-grid-pol` mark and
// `.irs-grid-text` span (so tick count and position are unchanged) but
// blanks the text of a tick whose label repeats the previous tick's label.

function gridTexts(slider) {
  return slider.$cache.grid.find('.irs-grid-text').map(function () { return this.textContent; }).get();
}

// Mutation this catches: dropping the "equals previous label" guard in
// appendGrid()'s tick loop -- the third and fourth ticks would both render
// "3" instead of the fourth one going blank.
test('a range with fewer steps than grid_num blanks the repeated label instead of showing it twice (#772)', (t) => {
  const { slider } = createSlider(t, '<input>', {
    min: 1, max: 4, from: 1, to: 4, hide_min_max: true, grid: true
  });

  assert.deepEqual(gridTexts(slider), ['1', '2', '3', '', '4']);
  assert.equal(slider.$cache.grid.find('.irs-grid-text').length, 5);
  assert.equal(slider.coords.big_num, 5);
});

// Pin: a range wide enough that no two big ticks ever snap to the same
// value must render exactly as before #772. Mutation this catches: an
// over-eager guard that blanks every label after the first, regardless of
// whether it actually repeats the previous one -- ["0","","","",""] instead
// of the five distinct labels.
test('a default 0-100 grid with no repeated ticks renders unchanged (#772)', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 0, max: 100, grid: true });
  assert.deepEqual(gridTexts(slider), ['0', '25', '50', '75', '100']);
});

// Pin: min: 1, max: 7 (grid_num stays at its default of 4) already renders
// uneven tick spacing on 2.4.1 -- inherent to a non-snapped grid, not part
// of this fix -- but none of its five ticks repeat, so the fix must leave
// it untouched. Same over-eager-guard mutation as above catches this.
test('a range with uneven but non-repeating ticks renders unchanged (#772)', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 1, max: 7, grid: true });
  assert.deepEqual(gridTexts(slider), ['1', '3', '4', '6', '7']);
});

// Pin: snapped ticks are one step apart, so the guard never triggers here
// unless prettify_grid merges neighbours. Same over-eager-guard mutation as
// above catches this.
test('grid_snap: true is unaffected (#772)', (t) => {
  const { slider } = createSlider(t, '<input>', {
    type: 'integer', min: 1, max: 4, from: 1, to: 4, grid: true, grid_snap: true
  });
  assert.deepEqual(gridTexts(slider), ['1', '2', '3', '4']);
});

// A custom prettify_grid can map two distinct values to the same text (here,
// rounding down to the nearest even number: the reporter's raw tick values
// 1, 2, 3, 3, 4 become "0", "2", "2", "2", "4"). The guard must compare the
// label strings produced after prettify_grid runs, not the raw values from
// convertToValue. Mutation this catches: comparing the pre-prettify numeric
// value instead of the post-prettify label string -- under that mutation the
// third tick's raw value (3) differs from the second's (2), so it keeps its
// "2" label instead of blanking, ['0','2','2','','4']; the fixed output
// compares strings and blanks two ticks, ['0','2','','','4'].
test('a custom prettify_grid that maps two values to the same text also gets deduplicated (#772)', (t) => {
  const { slider } = createSlider(t, '<input>', {
    min: 1, max: 4, from: 1, to: 4, grid: true,
    prettify_grid: function (num) { return String(num - (num % 2)); }
  });
  assert.deepEqual(gridTexts(slider), ['0', '2', '', '', '4']);
});

// Pin: min: 1, max: 2 repeats its tick value three times running into the
// last tick, which is exactly max -- the fix keeps the first label ("1")
// and the last label ("2"), blanking every repeat in between. Mutation this
// catches: dropping the last-tick branch (the `i === texts.length - 1 &&
// kept !== 0` check) -- the last tick would blank like the rest,
// ['1','','2','',''], losing the right-edge label entirely.
test('a run of repeats ending on the last tick keeps the first and the last label (#772)', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 1, max: 2, grid: true });
  assert.deepEqual(gridTexts(slider), ['1', '', '', '', '2']);
});

// Pin: min: 1, max: 3 repeats twice, with the second repeat landing on the
// last tick -- the fix drops the earlier repeat but keeps the last tick's
// label ("3") since it is the true max, rather than treating the two
// repeats identically. Mutation this catches: dropping the last-tick
// branch -- the last tick would blank instead of its earlier twin,
// ['1','2','','3',''].
test('a repeat that lands on the last tick keeps that tick over its earlier twin (#772)', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 1, max: 3, grid: true });
  assert.deepEqual(gridTexts(slider), ['1', '2', '', '', '3']);
});

// Pin: values mode is exempt from the dedup pass -- each entry is a real
// user-supplied value, so two equal entries or a merging prettify reflect
// the user's own data, not a rendering bug. Mutation this catches: removing
// the values-mode gate (`if (!o.values.length)`) -- the dedup pass would
// run over the values-mode labels too and blank the second "1",
// ['1','','2'].
test('values mode keeps duplicate entry labels, the dedup pass does not apply (#772)', (t) => {
  const { slider } = createSlider(t, '<input>', { values: [1, 1, 2], grid: true });
  assert.deepEqual(gridTexts(slider), ['1', '1', '2']);
});
