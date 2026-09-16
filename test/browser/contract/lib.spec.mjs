import { test, expect } from '@playwright/test';
import { open, LABEL } from '../helpers.mjs';
import { readState } from '../lib/state.mjs';
import { dragHandleTo, clickTrackAt, dragBarBy, focusTrack, pressKeys } from '../lib/interact.mjs';

test.describe(`browser lib (${LABEL})`, () => {
  // Bug caught: xForFraction without the half-handle offset lands at 29 or 31 on a 16px handle.
  test('dragHandleTo lands on the value for the fraction: 0.3 of 0..100 step 1 is 30', async ({ page }) => {
    await open(page, { min: 0, max: 100, from: 50, step: 1 });
    await dragHandleTo(page, 'single', 0.3);
    await expect(page.locator('#slider')).toHaveValue('30');
    const s = await readState(page);
    expect(s.labels.single.text).toBe('30');
    expect(s.input.dataFrom).toBe(30);
  });
  test('clickTrackAt 0.75 moves the single handle to 75', async ({ page }) => {
    await open(page, { min: 0, max: 100, from: 10, step: 1 });
    await clickTrackAt(page, 0.75);
    await expect(page.locator('#slider')).toHaveValue('75');
  });
  test('dragBarBy 0.1 moves a 20..40 interval to 30..50', async ({ page }) => {
    await open(page, { type: 'double', min: 0, max: 100, from: 20, to: 40, step: 1, drag_interval: true });
    await dragBarBy(page, 0.1);
    await expect(page.locator('#slider')).toHaveValue('30;50');
  });
  test('pressKeys ArrowRight x2 on the focused track moves by two steps', async ({ page }) => {
    await open(page, { min: 0, max: 100, from: 10, step: 5 });
    await focusTrack(page);
    await pressKeys(page, ['ArrowRight', 'ArrowRight']);
    await expect(page.locator('#slider')).toHaveValue('20');
  });
  test('readState reports hidden labels as not visible', async ({ page }) => {
    await open(page, { min: 0, max: 100, from: 10, hide_min_max: true, hide_from_to: true });
    const s = await readState(page);
    expect(s.labels.min.visible).toBe(false);
    expect(s.labels.single.visible).toBe(false);
    expect(s.mask).toBe(false);
  });
  // Bug caught: parsing the input's raw text with a hardcoded ';' instead of
  // cfg.input_values_separator, or with Number() instead of values.indexOf --
  // either turns a correct index into NaN.
  test('readState reports the values-mode index for from and to via the third argument', async ({ page }) => {
    const cfg = { type: 'double', values: ['a', 'b', 'c', 'd'], from: 1, to: 3 };
    await open(page, cfg);
    const s = await readState(page, 1, cfg);
    expect(s.values).toEqual({ from: 1, to: 3 });
  });
  test('readState reports plain numeric from/to when the config carries no values array', async ({ page }) => {
    const cfg = { type: 'double', min: 0, max: 100, from: 20, to: 80 };
    await open(page, cfg);
    const s = await readState(page, 1, cfg);
    expect(s.values).toEqual({ from: 20, to: 80 });
  });
});
