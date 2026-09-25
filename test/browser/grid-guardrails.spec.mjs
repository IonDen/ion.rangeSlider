import { test, expect } from '@playwright/test';
import { open, LABEL } from './helpers.mjs';

const gridTexts = (page) => page.$$eval('#wrap .irs-grid-text', (els) => els.map((e) => e.textContent));

test.describe(`grid guardrails: inputs (${LABEL})`, () => {
  // Mutation that reds it: `o.grid_num = 4;` removed from validate()'s fallback (no ticks for "abc").
  test('data-grid-num="abc" falls back to 4 units', async ({ page }) => {
    await open(page, { min: 0, max: 100, grid: true }, { attrs: JSON.stringify({ 'data-grid-num': 'abc' }) });
    expect(await gridTexts(page)).toEqual(['0', '25', '50', '75', '100']);
  });

  // Mutation that reds it: rule 0 removed from calcGridTicks() ("NaN").
  test('min equal to max draws one grid label', async ({ page }) => {
    await open(page, { min: 5, max: 5, grid: true, grid_snap: true });
    expect(await gridTexts(page)).toEqual(['5']);
  });

  // Mutation that reds it: the try/catch in _tryGridFormatter() removed (the slider is never created).
  test('a throwing prettify_grid still gives a working slider', async ({ page }) => {
    await open(page, '{ min: 0, max: 100, from: 40, grid: true, prettify_grid: function () { throw new Error("x"); } }');
    await expect(page.locator('#slider')).toHaveValue('40');
    expect(await gridTexts(page)).toEqual(['0', '25', '50', '75', '100']);
  });
});
