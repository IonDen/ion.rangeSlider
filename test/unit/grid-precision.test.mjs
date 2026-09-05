import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSlider } from './helpers.mjs';

/**
 * Grid labels go through the same convertToValue() rounding as
 * result.from/to (issue #760). appendGrid() runs during init() even in
 * jsdom -- it only needs a width for the CSS "left" offsets, not for the
 * label text -- so the rendered .irs-grid-text nodes are directly
 * assertable here without a browser.
 */

test('.irs-grid-text labels are free of binary float noise for a fractional-min config (#760)', (t) => {
  // Reporter's config: {min: -39.9, max: 111, step: 1, grid: true, grid_num: 4}.
  // convertToValue() rounds its final result to the decimals of options.step
  // only, so the shift-back from the negative-min offset leaks noise into
  // one grid tick: "-1.8999999999999986" (then chopped into
  // "-1.8 999 999 999 999 986" by the default thousands-separator
  // prettifier). Mutation: drop min_decimals/max_decimals from the final
  // rounding precision (use the step's own decimals alone).
  const { slider } = createSlider(t, '<input>', {
    type: 'double', min: -39.9, max: 111, step: 1, grid: true, grid_num: 4,
  });
  const texts = slider.$cache.grid.find('.irs-grid-text').map(function () {
    return this.textContent;
  }).get();
  assert.deepEqual(texts, ['-39.9', '-1.9', '35.1', '73.1', '111']);
});
