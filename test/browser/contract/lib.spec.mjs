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
  // Bug caught: clickTrackAt targeting the raw fraction of the line instead of the
  // handle-centred position, which lands a 0.75 click on 74 or 76 on a 600px track.
  test('clickTrackAt 0.75 moves the single handle to 75', async ({ page }) => {
    await open(page, { min: 0, max: 100, from: 10, step: 1 });
    await clickTrackAt(page, 0.75);
    await expect(page.locator('#slider')).toHaveValue('75');
  });
  // Bug caught: dragBarBy measuring its travel against the full line width instead of the
  // usable travel (line minus one handle), which moves the pair by more than the fraction asks.
  test('dragBarBy 0.1 moves a 20..40 interval to 30..50', async ({ page }) => {
    await open(page, { type: 'double', min: 0, max: 100, from: 20, to: 40, step: 1, drag_interval: true });
    await dragBarBy(page, 0.1);
    await expect(page.locator('#slider')).toHaveValue('30;50');
  });
  // Bug caught: pressKeys firing the presses with no pause, so the plugin's 300 ms idle render
  // loop folds them into one move and two presses advance a single step.
  test('pressKeys ArrowRight x2 on the focused track moves by two steps', async ({ page }) => {
    await open(page, { min: 0, max: 100, from: 10, step: 5 });
    await focusTrack(page);
    await pressKeys(page, ['ArrowRight', 'ArrowRight']);
    await expect(page.locator('#slider')).toHaveValue('20');
  });
  // Bug caught: readState reading visibility off the element's existence instead of its
  // computed style -- a hidden label is in the DOM, so every hide_* rule would pass blindly.
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
  // Bug caught: resolving the input text against the RAW entries (String(v) === part)
  // instead of the converted ones -- the plugin writes "20" for the entry "20.0"
  // (readme note "values": a numeric-looking entry is converted unless values_raw),
  // so a raw comparison finds no match and the index reads back as null.
  test('readState resolves a numeric-string entry the way the plugin writes it: "20.0" reads back as index 1', async ({ page }) => {
    const cfg = { values: ['10', '20.0', '30'], from: 1 };
    await open(page, cfg);
    await expect(page.locator('#slider')).toHaveValue('20');
    const s = await readState(page, 1, cfg);
    expect(s.values.from).toBe(1);
  });
  // Bug caught: running the values-mode lookup on a config with no values array, which would
  // turn every plain number into null.
  test('readState reports plain numeric from/to when the config carries no values array', async ({ page }) => {
    const cfg = { type: 'double', min: 0, max: 100, from: 20, to: 80 };
    await open(page, cfg);
    const s = await readState(page, 1, cfg);
    expect(s.values).toEqual({ from: 20, to: 80 });
  });
  // readme "Public methods": the instance is fetched with $("#range").data("ionRangeSlider"),
  // and after destroy() "the input is back to normal and can be initialized again".
  // Bug caught: reading the handle off window.__irs.slider (which survives destroy()) instead
  // of the input's own jQuery data, so the destroy rule could never see the handle left behind.
  test('readState reports the instance handle while the slider lives and not after destroy()', async ({ page }) => {
    await open(page, { min: 0, max: 100, from: 30 });
    expect((await readState(page)).input.dataHandle).toBe(true);
    await page.evaluate(() => window.__irs.slider.destroy());
    expect((await readState(page)).input.dataHandle).toBe(false);
  });
});
