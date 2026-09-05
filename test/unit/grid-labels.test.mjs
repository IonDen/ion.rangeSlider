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
    type: 'integer', min: 1, max: 4, from: 1, to: 4, postfix: '', hide_min_max: true, grid: true
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

// Pin: grid_snap: true derives the tick count from the step, so it never
// produces a repeated label in the first place -- this fix must not touch
// that path. Same over-eager-guard mutation as above catches this.
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
// convertToValue -- otherwise the middle two ticks would both render "2"
// instead of the third one going blank. Mutation this catches: comparing
// the pre-prettify numeric value instead of the post-prettify label string.
test('a custom prettify_grid that maps two values to the same text also gets deduplicated (#772)', (t) => {
  const { slider } = createSlider(t, '<input>', {
    type: 'integer', min: 1, max: 4, from: 1, to: 4, grid: true,
    prettify_grid: function (num) { return String(num - (num % 2)); }
  });
  assert.deepEqual(gridTexts(slider), ['0', '2', '', '', '4']);
});
