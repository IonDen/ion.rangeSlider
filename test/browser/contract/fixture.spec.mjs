import { test, expect } from '@playwright/test';
import { open, events, drag, LABEL } from '../helpers.mjs';

test.describe(`fixture additions (${LABEL})`, () => {
  // Mutation caught: dropping the onInit branch from the recorder -> the sequence stays ['onStart'].
  test('record_init=1 records onInit after onStart', async ({ page }) => {
    await open(page, { min: 0, max: 100, from: 30 }, { record_init: '1' });
    expect((await events(page)).map((e) => e.type)).toEqual(['onStart', 'onInit']);
  });
  // Mutation caught: not wiring the second input -> #slider2 has no .irs-line sibling.
  // (base_html nests an inner <span class="irs"> inside the container span, so
  // `.irs` itself matches 2 elements per instance -- `.irs-line` is unique per
  // instance and is what the plan's "one .irs container per slider" intent needs.)
  test('count=2 renders two independent sliders', async ({ page }) => {
    await open(page, { min: 0, max: 100, from: 30 }, { count: '2', config2: JSON.stringify({ min: 0, max: 10, from: 7 }) });
    await expect(page.locator('.irs-line')).toHaveCount(2);
    await expect(page.locator('#slider')).toHaveValue('30');
    await expect(page.locator('#slider2')).toHaveValue('7');
    const ev = await events(page);
    expect(ev.filter((e) => e.which === 2).map((e) => e.type)).toEqual(['onStart']);
  });
  // Mutation caught: not binding the DOM listeners -> no dom:* entries after a drag.
  test('dom_events=1 records the change and input events the plugin triggers on the input', async ({ page }) => {
    await open(page, { min: 0, max: 100, from: 30 }, { dom_events: '1' });
    await drag(page, '.irs-handle.single', 0.2);
    const types = (await events(page)).map((e) => e.type);
    expect(types).toContain('dom:change');
    expect(types).toContain('dom:input');
  });
});
