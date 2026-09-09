import { test, expect } from '@playwright/test';
import { open, events, input, drag, LABEL } from './helpers.mjs';

// Real-browser coverage for #505: "values: ['17.5', '12.2b', '20.0']" silently
// turned the last entry into the number 20 everywhere a user can see it (the
// bubble, the min/max labels, the input's posted value, every callback
// payload), so a backend matching against its own "20.0" string never found
// it. values_raw (default false, so every existing setup renders
// byte-identical to before) keeps a values entry exactly as given instead.
// The jsdom unit suite (test/unit/values-raw.test.mjs) already covers the
// option-state side of this; these tests exercise the same fix through
// actual layout, a real pointer drag and the render loop, which the unit
// suite cannot reach.

test.describe(`values_raw coverage (${LABEL})`, () => {
  // Mutation this catches: dropping the `o.values_raw && typeof v[i] !==
  // "number"` guard from validate()'s values loop (js/ion.rangeSlider.js) --
  // the bubble, the max label, the input, the onStart payload and the grid
  // labels would all read "20" instead of "20.0".
  test('values_raw keeps the raw entry on the bubble, the max label, the input and the onStart payload (#505)', async ({ page }) => {
    await open(page, { values: ['17.5', '12.2b', '20.0'], from: 2, values_raw: true, grid: true });

    await expect(page.locator('.irs-single')).toHaveText('20.0');
    await expect(page.locator('.irs-max')).toHaveText('20.0');
    await expect(input(page)).toHaveValue('20.0');

    // Values mode snaps the grid to one tick per entry (validate() derives
    // grid_num/grid_snap from the values array), so the grid must carry the
    // same raw entries as the bubble/label/input above, in order.
    const gridTexts = await page.locator('.irs-grid-text').allTextContents();
    expect(gridTexts).toEqual(['17.5', '12.2b', '20.0']);

    const ev = await events(page);
    const startEv = ev.find((e) => e.type === 'onStart');
    expect(startEv, 'onStart must have fired').toBeTruthy();
    expect(startEv.from_value).toBe('20.0');
  });

  // Same config, but the raw entry is reached through a real drag instead of
  // init -- catches a fix that only patches the initial render (e.g. one
  // that special-cases init() instead of fixing validate()/writeToInput()
  // for every render).
  test('a real drag to the first entry keeps it raw too, not only at init (#505)', async ({ page }) => {
    await open(page, { values: ['17.5', '12.2b', '20.0'], from: 2, values_raw: true });

    // from starts at index 2 (100% along the line, 3 values 0-2, step 1); a
    // leftward move past the 25% mark (the index 0/1 rounding boundary)
    // lands on index 0. Kept short of a full-line overshoot so the pointer
    // release stays on screen -- Playwright's Firefox driver drops the
    // mouseup (and with it onFinish) when it lands off-viewport.
    await drag(page, '.irs-handle.single', -0.9);

    await expect(page.locator('.irs-single')).toHaveText('17.5');
    await expect(input(page)).toHaveValue('17.5');

    const ev = await events(page);
    const finishEv = ev.find((e) => e.type === 'onFinish');
    expect(finishEv, 'onFinish must have fired').toBeTruthy();
    expect(finishEv.from_value).toBe('17.5');
  });

  // Characterization: values_raw defaults to false, so this must render
  // exactly like 2.4.2. Mutation this catches: inverting the `o.values_raw`
  // guard (js/ion.rangeSlider.js) -- the bubble/label/input would read
  // "20.0" and from_value would come back as the string "20.0" here too.
  test('values_raw off (the default) still converts the numeric-looking entry to a number (#505)', async ({ page }) => {
    await open(page, { values: ['17.5', '12.2b', '20.0'], from: 2 });

    await expect(page.locator('.irs-single')).toHaveText('20');
    await expect(input(page)).toHaveValue('20');

    const ev = await events(page);
    const startEv = ev.find((e) => e.type === 'onStart');
    expect(startEv, 'onStart must have fired').toBeTruthy();
    expect(startEv.from_value).toBe(20);
  });

  // Same assertions as the first test, through the data-* attribute route
  // instead of the JS config object. Mutation this catches: removing the
  // `values_raw: $inp.data("valuesRaw")` line from config_from_data
  // (js/ion.rangeSlider.js) -- data-values-raw would be silently ignored and
  // this would render "20" like the values_raw-off test above.
  test('data-values-raw="true" with data-values and data-from produces the same raw entry (#505)', async ({ page }) => {
    await open(page, {}, {
      attrs: JSON.stringify({ 'data-values': '17.5,12.2b,20.0', 'data-values-raw': 'true', 'data-from': '2' })
    });

    await expect(page.locator('.irs-single')).toHaveText('20.0');
    await expect(page.locator('.irs-max')).toHaveText('20.0');
    await expect(input(page)).toHaveValue('20.0');

    const ev = await events(page);
    const startEv = ev.find((e) => e.type === 'onStart');
    expect(startEv, 'onStart must have fired').toBeTruthy();
    expect(startEv.from_value).toBe('20.0');
  });
});
