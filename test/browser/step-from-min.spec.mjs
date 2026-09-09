import { test, expect } from '@playwright/test';
import { open, drag, eventTypes, input, LABEL } from './helpers.mjs';

// Real-browser coverage for issue #869: the new `step_from_min` option
// (default false) counts the step scale from `min` instead of from zero, so
// {min: 0.5, max: 10.5, step: 1} runs 0.5, 1.5, 2.5 rather than snapping to
// whole numbers. The jsdom suite (zero layout, see test/unit/helpers.mjs)
// covers convertToValue() and the grid text directly; these tests drive the
// same option through real layout, a real drag and real key presses, and
// assert only what the page shows: the handle bubble, the input's value and
// the grid labels.

test.describe(`step_from_min coverage (${LABEL})`, () => {
  // B1. Against 2.4.2 this renders "3": calc()'s "base" case round-trips the
  // initial `from` through convertToValue(), which rounds to the step's
  // decimals and drops min's half. One-line bug this catches: no
  // `step_from_min` branch in convertToValue().
  test('an initial from of 2.5 stays 2.5 in the bubble and the input (#869)', async ({ page }) => {
    await open(page, { type: 'single', min: 0.5, max: 10.5, step: 1, from: 2.5, step_from_min: true });

    await expect(page.locator('.irs-single')).toHaveText('2.5');
    await expect(input(page)).toHaveValue('2.5');

    await page.evaluate(() => window.__irs.slider.update({}));

    await expect(page.locator('.irs-single')).toHaveText('2.5');
    await expect(input(page)).toHaveValue('2.5');
  });

  // B2. Same config through a real pointer drag, so the option is proven on
  // the interaction path and not only on the initial render. Against 2.4.2
  // the handle lands on a whole number. One-line bug this catches: reading
  // the option only in calc()'s "base" case.
  test('a drag lands on the min-anchored scale, not on a whole number (#869)', async ({ page }) => {
    await open(page, { type: 'single', min: 0.5, max: 10.5, step: 1, from: 2.5, step_from_min: true });

    await drag(page, '.irs-handle.single', 0.3);
    await expect.poll(() => eventTypes(page)).toContain('onFinish');

    const label = await page.locator('.irs-single').textContent();
    // Moved guard: the starting value 2.5 also matches the pattern below, so
    // without this a drag that silently moved nothing would still pass.
    expect(label).not.toBe('2.5');
    expect(label).toMatch(/^\d+\.5$/);
    await expect(input(page)).toHaveValue(label);
  });

  // B3. Against 2.4.2 the three presses read 1, 2, 3: the from-zero rounding
  // discards min's 0.01. One-line bug this catches: the lattice anchored at
  // zero rather than at min.
  test('arrow keys walk a 0.01 minimum as 1.01, 2.01, 3.01 (#869)', async ({ page }) => {
    await open(page, { type: 'single', min: 0.01, max: 10, step: 1, step_from_min: true });

    await expect(input(page)).toHaveValue('0.01');
    await page.locator('.irs-line').focus();
    await expect(page.locator('.irs-line')).toBeFocused();
    // Outlast the 300 ms idle render poll so a callback pending from the
    // focus cannot coalesce with the first key press.
    await page.waitForTimeout(400);

    for (const value of ['1.01', '2.01', '3.01']) {
      await page.keyboard.press('ArrowRight');
      await expect(input(page)).toHaveValue(value);
    }
  });

  // B4. Grid ticks label themselves through the same convertToValue(), so the
  // option has to reach them too. Against 2.4.2 the labels read "2.6" and
  // "7.4" (rounded to the step's one decimal) where this config's own scale
  // has 2.75 and 7.25. One-line bug this catches: reading the option only on
  // the handle path.
  test('grid labels follow the min-anchored scale (#869)', async ({ page }) => {
    await open(page, { type: 'single', min: 0.25, max: 9.75, step: 0.5, grid: true, step_from_min: true });

    const texts = await page.locator('.irs-grid-text').allTextContents();
    expect(texts).toEqual(['0.25', '2.75', '5.25', '7.25', '9.75']);
  });

  // B5. The default-off twin of B1: characterization of today's behavior,
  // green before and after. Mutation with catching power: make the new branch
  // in convertToValue() unconditional (drop the `this.options.step_from_min`
  // test) -- the bubble would read "2.5" here instead of "3".
  test('without the option an initial from of 2.5 still renders as 3 (#869)', async ({ page }) => {
    await open(page, { type: 'single', min: 0.5, max: 10.5, step: 1, from: 2.5 });

    await expect(page.locator('.irs-single')).toHaveText('3');
    await expect(input(page)).toHaveValue('3');
  });

  // B6. The data-attribute route, the channel server-rendered markup uses.
  // One-line bug this catches: no `step_from_min: $inp.data("stepFromMin")`
  // line in config_from_data -- the attribute is ignored and the bubble falls
  // back to "3".
  test('data-step-from-min="true" has the same effect as the JS option (#869)', async ({ page }) => {
    await open(
      page,
      { type: 'single', min: 0.5, max: 10.5, step: 1, from: 2.5 },
      { attrs: JSON.stringify({ 'data-step-from-min': 'true' }) }
    );

    await expect(page.locator('.irs-single')).toHaveText('2.5');
    await expect(input(page)).toHaveValue('2.5');
  });
});
