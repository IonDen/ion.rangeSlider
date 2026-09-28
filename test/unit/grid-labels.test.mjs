import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSlider } from './helpers.mjs';

// #772: a range holding fewer steps than grid_num used to snap two
// neighbouring ticks to the same value, and the same label text was emitted
// twice (min: 1, max: 4 rendered ["1","2","3","3","4"]). The fix blanked a
// label that repeats the last kept one, in a pass after the tick loop; a
// repeat landing on the last tick (exactly max) keeps that tick's label and
// blanks the earlier twin instead. Since #906 (rule 3) such a range gets one
// tick per step, so the pass only meets a custom prettify_grid that maps two
// values to one text. Values mode is left untouched.

function gridTexts(slider) {
  return slider.$cache.grid.find('.irs-grid-text').map(function () { return this.textContent; }).get();
}

// Flipped by the grid guardrails (#906 rule 3): a range holding fewer steps
// than grid_num gets one tick per step, so no two ticks name the same value
// and nothing is blanked (before #906: ['1', '2', '3', '', '4']). Mutation
// this catches: rule 3 deleted from calcGridTicks() -- the five evenly spaced
// ticks and the blanked twin come back.
test('a range with fewer steps than grid_num gets one tick per step, none repeated (#772, #906)', (t) => {
  const { slider } = createSlider(t, '<input>', {
    min: 1, max: 4, from: 1, to: 4, hide_min_max: true, grid: true
  });

  assert.deepEqual(gridTexts(slider), ['1', '2', '3', '4']);
  assert.equal(slider.$cache.grid.find('.irs-grid-text').length, 4);
  assert.equal(slider.coords.big_num, 4);
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

// Flipped by the grid guardrails (#906 rule 5): min: 1, max: 7 (grid_num at
// its default of 4) holds six steps; the even split's boundaries 2.5 and 5.5
// fall between steps, and its ticks labelled 3 and 6 sat 8.3% of the track
// from where the handle stops on them, so the grid uses three units of two
// steps (before #906: ['1', '3', '4', '6', '7']). Mutation this catches:
// rule 5 deleted from calcGridTicks() -- the even split comes back.
test('a range that does not divide into grid_num units gets even units of whole steps (#772, #906)', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 1, max: 7, grid: true });
  assert.deepEqual(gridTexts(slider), ['1', '3', '5', '7']);
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
// rounding down to the nearest even number: the tick values 1, 2, 3, 4 -- one
// per step since #906 rule 3 -- become "0", "2", "2", "4"). The guard must
// compare the label strings produced after prettify_grid runs, not the raw
// values. Mutation this catches: comparing the pre-prettify numeric value
// instead of the post-prettify label string -- the third tick's raw value (3)
// differs from the second's (2), so it keeps its "2" label,
// ['0','2','2','4'], where the string comparison blanks it, ['0','2','','4'].
// (Before #906, with five ticks: ['0','2','','','4'].)
test('a custom prettify_grid that maps two values to the same text also gets deduplicated (#772)', (t) => {
  const { slider } = createSlider(t, '<input>', {
    min: 1, max: 4, from: 1, to: 4, grid: true,
    prettify_grid: function (num) { return String(num - (num % 2)); }
  });
  assert.deepEqual(gridTexts(slider), ['0', '2', '', '4']);
});

// Flipped by the grid guardrails (#906 rule 3): min: 1, max: 2 is one step,
// so the grid is its two values (before #906: ['1', '', '', '', '2']).
// Mutation this catches: rule 3 deleted from calcGridTicks().
test('a one-step range shows min and max, nothing repeated (#772, #906)', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 1, max: 2, grid: true });
  assert.deepEqual(gridTexts(slider), ['1', '2']);
});

// Retargeted by the grid guardrails (#906): since rule 3 no two ticks name the
// same value, so only a prettify_grid that merges texts can land a repeat on
// the last tick. n + n % 2 maps the ticks 1, 2, 3, 4 to "2", "2", "4", "4":
// the dedup pass keeps the last tick's "4" (it is max) and blanks its earlier
// twin. (Before #906 the grid had five ticks here, ['2','','','','4'].)
// Mutation this catches: dropping the last-tick branch (the
// `i === texts.length - 1 && kept !== 0` check) -- the last tick would blank
// instead of its earlier twin, ['2','','4',''].
test('a repeat that lands on the last tick keeps that tick over its earlier twin (#772)', (t) => {
  const { slider } = createSlider(t, '<input>', {
    min: 1, max: 4, grid: true,
    prettify_grid: function (n) { return String(n + n % 2); }
  });
  assert.deepEqual(gridTexts(slider), ['2', '', '', '4']);
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

// Grid labels go through the same convertToValue() rounding as
// result.from/to (issue #760). appendGrid() runs during init() even in
// jsdom -- it only needs a width for the CSS "left" offsets, not for the
// label text -- so the rendered .irs-grid-text nodes are directly
// assertable here without a browser.
//
// Reporter's config: {min: -39.9, max: 111, step: 1, grid: true,
// grid_num: 4}. Before #760 convertToValue() rounded its final result to
// the decimals of options.step only, so the shift-back from the negative-min
// offset leaked noise into one grid tick: "-1.8999999999999986" (then chopped
// into "-1.8 999 999 999 999 986" by the default thousands-separator
// prettifier). Mutation: drop min_decimals/max_decimals from the final
// rounding precision (use the step's own decimals alone).
test('.irs-grid-text labels are free of binary float noise for a fractional-min config (#760)', (t) => {
  const { slider } = createSlider(t, '<input>', {
    type: 'double', min: -39.9, max: 111, step: 1, grid: true, grid_num: 4,
  });
  assert.deepEqual(gridTexts(slider), ['-39.9', '-1.9', '35.1', '73.1', '111']);
});
