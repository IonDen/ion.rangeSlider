import { test, expect } from '@playwright/test';
import { open, eventTypes, events, drag, LABEL } from './helpers.mjs';

// Real-browser coverage for issue #760: convertToValue() rounded its final
// result to the decimals of options.step only, so a fractional min/max with
// an integer step leaked binary float noise into the grid labels, the handle
// bubbles and the input's stored from/to. The jsdom unit suite (zero layout,
// see test/unit/helpers.mjs) already covers convertToValue() and the grid
// text directly; these tests exercise the same fix through actual layout and
// a real pointer drag, which the unit suite cannot reach.

test.describe(`value precision coverage (${LABEL})`, () => {
  test.describe('#760 fractional-min/max precision', () => {
    // Reporter's exact config. Mutation this catches: dropping
    // min_decimals/max_decimals from the final rounding precision in
    // convertToValue() (js/ion.rangeSlider.js), i.e. rounding to the step's
    // own decimals alone -- the second tick would render
    // "-1.8999999999999986" (then grouped by the default thousands
    // separator into "-1.8 999 999 999 999 986") instead of "-1.9".
    test('grid labels carry no binary float noise for a fractional-min, integer-step config (#760)', async ({ page }) => {
      await open(page, { type: 'double', min: -39.9, max: 111, step: 1, grid: true, grid_num: 4 });

      const texts = await page.locator('.irs-grid-text').allTextContents();
      expect(texts).toEqual(['-39.9', '-1.9', '35.1', '73.1', '111']);
    });

    // Same config, exercised through a real drag rather than the grid.
    // Mutation this catches: the same drop of min_decimals/max_decimals
    // described above -- the from bubble and the input's stored from would
    // both carry a long decimal tail (e.g. "-15.899999999999999") instead of
    // stopping at one decimal place.
    test('dragging the from handle keeps the bubble and the stored from value to at most one decimal (#760)', async ({ page }) => {
      await open(page, { type: 'double', min: -39.9, max: 111, step: 1 });

      // 20% of the line lands on a value whose shift-back subtraction
      // (31 - 39.9, in the pre-fix shifted-then-unshifted arithmetic) is
      // exactly where the bug leaks noise -- verified against the unfixed
      // source, which renders "-8.899 999 999 999 999" (the default
      // thousands separator grouping "-8.899999999999999") here.
      await drag(page, '.irs-handle.from', 0.2);
      await expect.poll(() => eventTypes(page)).toContain('onFinish');

      const label = await page.locator('.irs-from').textContent();
      // Moved guard: min ("-39.9") also satisfies the format regex below, so
      // without this a drag that silently failed to move the handle would
      // still pass the assertion without proving the noise fix at all.
      expect(label).not.toBe('-39.9');
      expect(label).toMatch(/^-?\d+(\.\d)?$/);

      // -16 to 16 is the window (in this config) where 2.4.1's shift-back
      // subtraction reintroduced binary float noise.
      const finish = (await events(page)).find((e) => e.type === 'onFinish');
      expect(finish.from).toBeGreaterThan(-16);
      expect(finish.from).toBeLessThan(16);

      // writeToInput() stores "from" through jQuery's .data() cache, not a
      // reflected data-from DOM attribute -- read it back the same way (the
      // #831 tests in features.spec.mjs use the same pattern).
      const dataFrom = await page.evaluate(() => window.jQuery('#slider').data('from'));
      expect(String(dataFrom)).toMatch(/^-?\d+(\.\d)?$/);
    });
  });
});
