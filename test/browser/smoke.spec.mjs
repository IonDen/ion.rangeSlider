import { test, expect } from '@playwright/test';
import { open, events, eventTypes, input, drag, LABEL } from './helpers.mjs';

test.describe(`smoke (${LABEL})`, () => {
  test('init renders, writes the input and fires onStart once', async ({ page }) => {
    await open(page, { min: 0, max: 100, from: 30 });
    await expect(page.locator('.irs--flat')).toHaveCount(1);
    await expect(input(page)).toHaveValue('30');
    const ev = await events(page);
    expect(ev.map((e) => e.type)).toEqual(['onStart']);
    expect(ev[0]).toMatchObject({ from: 30, min: 0, max: 100 });
    expect(await page.evaluate(() => window.__irs.jqueryVersion)).toBeTruthy();
  });

  test('dragging the single handle changes the value, onChange then onFinish', async ({ page }) => {
    await open(page, { min: 0, max: 100, from: 0 });
    await drag(page, '.irs-handle.single', 0.5);
    await expect.poll(async () => Number(await input(page).inputValue())).toBeGreaterThanOrEqual(45);
    expect(Number(await input(page).inputValue())).toBeLessThanOrEqual(55);
    const types = await eventTypes(page);
    expect(types).toContain('onChange');
    expect(types.at(-1)).toBe('onFinish');
  });

  test('clicking the line jumps to the clicked value', async ({ page }) => {
    await open(page, { min: 0, max: 100, from: 0 });
    const l = await page.locator('.irs-line').boundingBox();
    await page.mouse.click(l.x + l.width * 0.75, l.y + l.height / 2);
    await expect.poll(async () => Number(await input(page).inputValue())).toBeGreaterThanOrEqual(70);
    expect(Number(await input(page).inputValue())).toBeLessThanOrEqual(80);
    await expect.poll(() => eventTypes(page)).toContain('onFinish');
  });

  test('keyboard moves by one step and fires onFinish', async ({ page }) => {
    await open(page, { min: 0, max: 100, from: 50, step: 5 });
    await page.locator('.irs-line').focus();
    await expect(page.locator('.irs-line')).toBeFocused();
    const before = (await events(page)).length;   // focus alone already fires onChange+onFinish (#742), so count from here
    await page.keyboard.press('ArrowRight');
    await expect(input(page)).toHaveValue('55');
    await page.keyboard.press('ArrowLeft');
    await expect(input(page)).toHaveValue('50');
    await expect.poll(async () => (await events(page)).length).toBeGreaterThan(before);
    expect((await eventTypes(page)).at(-1)).toBe('onFinish');
  });

  test('double: two handles, the input holds "from;to", dragging "to" keeps from', async ({ page }) => {
    await open(page, { type: 'double', min: 0, max: 100, from: 20, to: 40 });
    await expect(input(page)).toHaveValue('20;40');
    await drag(page, '.irs-handle.to', 0.4);
    await expect.poll(async () => (await input(page).inputValue()).split(';').map(Number)[1]).toBeGreaterThan(60);
    const to = Number((await input(page).inputValue()).split(';')[1]);
    expect(to).toBeLessThan(90);
    expect((await input(page).inputValue()).split(';')[0]).toBe('20');
  });

  // #759: keyboard controls in double mode. Focusing the line alone already fires
  // onChange+onFinish (#742, not fixed here), so these assert on the input value
  // rather than on callback counts/order.

  test('double: with no handle touched, the keyboard moves "from" by default (#759)', async ({ page }) => {
    await open(page, { type: 'double', min: 0, max: 100, from: 20, to: 40, step: 1 });
    await page.locator('.irs-line').focus();
    await page.keyboard.press('ArrowRight');
    await expect(input(page)).toHaveValue('21;40');
    await page.keyboard.press('ArrowLeft');
    await expect(input(page)).toHaveValue('20;40');
  });

  test('double: after clicking "to", the keyboard moves "to" and leaves "from" alone (#759)', async ({ page }) => {
    await open(page, { type: 'double', min: 0, max: 100, from: 20, to: 40, step: 1 });
    await drag(page, '.irs-handle.to', 0.05);
    const [fromAfterDrag, toAfterDrag] = (await input(page).inputValue()).split(';').map(Number);
    await page.keyboard.press('ArrowRight');
    await expect(input(page)).toHaveValue(`${fromAfterDrag};${toAfterDrag + 1}`);
    await page.keyboard.press('ArrowLeft');
    await expect(input(page)).toHaveValue(`${fromAfterDrag};${toAfterDrag}`);
  });

  // #696: moveByKey() advanced the tracked pointer by a REAL-percent step size
  // (options.step scaled by the value range) but added it straight to
  // coords.p_pointer, which lives in FAKE-percent space (0 to 100 - p_handle,
  // the compressed space handle "left" is drawn in). Every keyboard press
  // therefore overshot the true one-step distance by a factor of
  // 100 / (100 - p_handle); each press still snapped to the nearest step, so
  // individual presses looked fine, but the overshoot compounded press over
  // press until it crossed half a step, at which point exactly one press
  // silently consumed two steps (a value got skipped). With this fixture
  // (from=20, to=40, min=0, max=100, step=1) that crossing lands on the 5th
  // press: from goes 21, 22, 23, 24, then jumps to 26 instead of 25.
  test('double: five arrow-key presses move "from" by exactly one step each, no doubling (#696)', async ({ page }) => {
    await open(page, { type: 'double', min: 0, max: 100, from: 20, to: 40, step: 1 });
    await page.locator('.irs-line').focus();
    const expected = ['21;40', '22;40', '23;40', '24;40', '25;40'];
    for (const value of expected) {
      await page.keyboard.press('ArrowRight');
      await expect(input(page)).toHaveValue(value);
    }
  });

  // General regression coverage for keyboard clamping (not a #696 pin —
  // checkDiapason already clamped correctly pre-fix; this just guards that
  // the #696 fix's real-percent-anchored moveByKey() keeps resolving through
  // that same clamp exactly, with no drift past min after repeated presses).
  // Mirrors the original reporter's repro direction (drag/move "from" toward
  // the edge, then keep stepping past it).
  test('double: ArrowLeft past the minimum stays clamped at min, no drift (#696)', async ({ page }) => {
    await open(page, { type: 'double', min: 0, max: 100, from: 2, to: 40, step: 1 });
    await page.locator('.irs-line').focus();
    const expected = ['1;40', '0;40', '0;40', '0;40', '0;40'];
    for (const value of expected) {
      await page.keyboard.press('ArrowLeft');
      await expect(input(page)).toHaveValue(value);
    }
  });

  // #696 follow-up: coords.p_step (reused by the fix from calcWithStep's own
  // grid) is derived from options.step, so a fractional step must keep
  // landing exactly on the step grid too, not just integer steps. Runs
  // through the 6th press deliberately: against the pre-#696 moveByKey()
  // this exact fixture doubles there (5.5 -> 5.7, skipping 5.6), so stopping
  // at 5.5 would not actually pin the regression.
  test('single: fractional step (0.1) moves by exactly one step each press (#696)', async ({ page }) => {
    await open(page, { min: 0, max: 10, from: 5, step: 0.1 });
    await page.locator('.irs-line').focus();
    const expected = ['5.1', '5.2', '5.3', '5.4', '5.5', '5.6', '5.7'];
    for (const value of expected) {
      await page.keyboard.press('ArrowRight');
      await expect(input(page)).toHaveValue(value);
    }
  });

  // #825: with drag_interval, moveByKey() did not resolve the "both" (bar
  // drag) or "both_one" (line click) targets at all, so it fell back to
  // adding a REAL-percent step size straight to the FAKE-percent tracked
  // pointer -- the exact pre-#696 mistake #824 had already fixed for
  // single/from/to, just never extended to these two targets. Each press
  // overshot the true one-step distance, and once the overshoot crossed
  // half a step, one press silently doubled the move.

  test('drag_interval: after dragging the bar, one ArrowRight press moves the whole interval by exactly one step, width preserved (#825)', async ({ page }) => {
    await open(page, { type: 'double', min: 0, max: 100, from: 20, to: 40, step: 1, drag_interval: true });
    await drag(page, '.irs-bar', 0.1);
    await expect(input(page)).toHaveValue('30;50');
    // Mutation this catches: reinstating the pre-#825 pointer fallback for
    // "both" -- the first press alone already overshoots "from" by a
    // second step (from jumps to 32, not 31) while "to" only advances by
    // one, shrinking the interval from width 20 to 19.
    await page.keyboard.press('ArrowRight');
    await expect(input(page)).toHaveValue('31;51');
  });

  test('drag_interval: after dragging the bar, one ArrowLeft press moves the whole interval by exactly one step, width preserved (#825)', async ({ page }) => {
    await open(page, { type: 'double', min: 0, max: 100, from: 20, to: 40, step: 1, drag_interval: true });
    await drag(page, '.irs-bar', 0.1);
    await expect(input(page)).toHaveValue('30;50');
    // Mutation this catches: a left-direction-only regression in
    // moveIntervalByKey() (e.g. a `step < 0` early return, or a sign error
    // that only breaks the negative direction) -- the whole #825 suite
    // otherwise presses ArrowRight exclusively, so a bug confined to
    // leftward stepping would slip through untested.
    await page.keyboard.press('ArrowLeft');
    await expect(input(page)).toHaveValue('29;49');
  });

  // #825 fix-round regression: moveIntervalByKey() must honor from_fixed/
  // to_fixed the same way calc()'s own "both" branch does (the guard right
  // above the "both" case, js/ion.rangeSlider.js). Mutation this catches:
  // dropping the `if (this.options.from_fixed || this.options.to_fixed) {
  // return; }` guard at the top of moveIntervalByKey() -- a bar drag
  // correctly leaves a from_fixed interval pinned at 20;40 (calc()'s own
  // guard still applies to the mouse path), but the keyboard press that
  // follows would then move it anyway, to 21;41 -- unlike every other
  // interaction (mouse drag, and the pre-#825 code) which leaves fixed
  // handles unmoved.
  test('drag_interval: a from_fixed interval stays pinned after a bar drag and a keyboard press (#825)', async ({ page }) => {
    await open(page, { type: 'double', min: 0, max: 100, from: 20, to: 40, step: 1, drag_interval: true, from_fixed: true });
    await drag(page, '.irs-bar', 0.1);
    await expect(input(page)).toHaveValue('20;40');
    await page.keyboard.press('ArrowRight');
    // The input is only rewritten by the idle render loop's 300ms
    // setTimeout (not synchronously on keydown), and the pre-press value
    // already equals the expected "unchanged" value -- toHaveValue()'s
    // polling stops at its first (immediate, stale) match, so asserting
    // right away would pass trivially whether or not the guard exists.
    // Wait out the render cycle first so the assertion observes the
    // settled state.
    await page.waitForTimeout(400);
    await expect(input(page)).toHaveValue('20;40');
  });

  // #825 fix-round regression: the from_fixed test above only proves the
  // guard fires for from_fixed; a mutation that narrows it to
  // `if (this.options.from_fixed) { return; }` (dropping the `|| this.options.to_fixed`
  // half) would still pass that test while leaving a to_fixed-only interval
  // free to move on a keyboard press. Mutation this catches: guard narrowed
  // to from_fixed-only.
  test('drag_interval: a to_fixed interval stays pinned after a bar drag and a keyboard press (#825)', async ({ page }) => {
    await open(page, { type: 'double', min: 0, max: 100, from: 20, to: 40, step: 1, drag_interval: true, to_fixed: true });
    await drag(page, '.irs-bar', 0.1);
    await expect(input(page)).toHaveValue('20;40');
    await page.keyboard.press('ArrowRight');
    // See the from_fixed test above: the input is only rewritten by the
    // idle render loop's 300ms setTimeout, so the assertion must wait out
    // the render cycle before observing the settled state.
    await page.waitForTimeout(400);
    await expect(input(page)).toHaveValue('20;40');
  });

  test('drag_interval: after clicking the line, one ArrowRight press moves the whole interval by exactly one step, width preserved (#825)', async ({ page }) => {
    // A wider range than the bar-drag case: with min=0, max=100 the
    // "both_one" doubling this pins does not land until well past the
    // right edge (see the repeat-press test below for that shape instead),
    // so this uses max=200 to get a clean, edge-free doubling within two
    // presses.
    await open(page, { type: 'double', min: 0, max: 200, from: 20, to: 40, step: 1, drag_interval: true });
    const l = await page.locator('.irs-line').boundingBox();
    await page.mouse.click(l.x + l.width * 0.4, l.y + l.height / 2);
    await expect(input(page)).toHaveValue('69;89');
    await expect.poll(() => eventTypes(page)).toContain('onFinish');
    await page.keyboard.press('ArrowRight');
    await expect(input(page)).toHaveValue('70;90');
    // Mutation this catches: reinstating the pre-#825 pointer fallback for
    // "both_one" -- the second press doubles ("to" jumps 90 -> 92,
    // skipping 91) instead of landing on 71;91.
    await page.keyboard.press('ArrowRight');
    await expect(input(page)).toHaveValue('71;91');
  });

  // Repeat-press coverage, mirroring the #696 pin above: a single press can
  // look fine while the underlying overshoot still compounds silently over
  // many presses. This fixture's pre-#825 fallback shows two distinct
  // failure shapes across the run -- an immediate asymmetric jump on the
  // very first press, and a later symmetric double-step once the
  // compounding overshoot crosses half a step again -- so a longer run is
  // needed to pin both, not just the first press.
  test('drag_interval: repeated ArrowRight presses on a dragged interval never drift or double-step (#825)', async ({ page }) => {
    await open(page, { type: 'double', min: 0, max: 100, from: 20, to: 40, step: 1, drag_interval: true });
    await drag(page, '.irs-bar', 0.1);
    await expect(input(page)).toHaveValue('30;50');
    for (let i = 1; i <= 20; i++) {
      await page.keyboard.press('ArrowRight');
      await expect(input(page)).toHaveValue(`${30 + i};${50 + i}`);
    }
  });

  // Mirrors the ArrowRight repeat-press test above, in the untested
  // direction. Mutation this catches: a left-direction-only regression
  // (e.g. a `step < 0` early return, or a sign error confined to negative
  // steps) that a suite pressing only ArrowRight would never see.
  test('drag_interval: repeated ArrowLeft presses on a dragged interval never drift or double-step (#825)', async ({ page }) => {
    await open(page, { type: 'double', min: 0, max: 100, from: 20, to: 40, step: 1, drag_interval: true });
    await drag(page, '.irs-bar', 0.1);
    await expect(input(page)).toHaveValue('30;50');
    for (let i = 1; i <= 20; i++) {
      await page.keyboard.press('ArrowLeft');
      await expect(input(page)).toHaveValue(`${30 - i};${50 - i}`);
    }
  });

  // Edge clamp: a real bar-drag past the max edge is width-preserving only
  // because pointerDown holds min_interval at the pre-drag width for the
  // whole gesture (setTempMinInterval()); a keyboard step has no such
  // window, so moveByKey() must reproduce that same width-preserving
  // clamp itself. Mutation this catches: clamping "from"/"to" independently
  // (plain checkDiapason, no width-preserving shift) -- the interval would
  // land at 89;100 (shrunk to width 11) instead of flush against the edge
  // at 80;100 (width 20), matching what the bar-drag reference produces.
  test('drag_interval: driving the interval to the max edge by keyboard clamps the same way a bar-drag to the max edge does (#825)', async ({ page }) => {
    const config = { type: 'double', min: 0, max: 100, from: 20, to: 40, step: 1, drag_interval: true };

    await open(page, config);
    await drag(page, '.irs-bar', 0.1);
    await expect(input(page)).toHaveValue('30;50');
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press('ArrowRight');
    }
    await expect(input(page)).toHaveValue('80;100');

    // Reference: the same starting drag, continued in one motion past the
    // max edge instead of being released and stepped by keyboard.
    const page2 = await page.context().newPage();
    await open(page2, config);
    const h = await page2.locator('.irs-bar').boundingBox();
    const l = await page2.locator('.irs-line').boundingBox();
    const x = h.x + h.width / 2, y = h.y + h.height / 2;
    await page2.mouse.move(x, y);
    await page2.mouse.down();
    await page2.mouse.move(x + l.width * 0.1, y, { steps: 12 });
    await page2.mouse.move(x + l.width * 2, y, { steps: 12 });
    await page2.mouse.up();
    await expect(input(page2)).toHaveValue('80;100');
  });

  // Mirrors the max-edge test above, in the untested direction, and
  // specifically exercises moveIntervalByKey()'s "from" shortfall branch
  // (the max-edge test above only exercises the "to" overflow branch).
  // Mutation this catches: dropping or breaking the
  // `if (new_from < from_bound_min) { ... }` shift -- the interval would
  // land at 0;11 (from clamped flush at 0, to independently clamped by
  // checkDiapason with the gap-based reconstruction, shrinking width to
  // 11) instead of flush against the edge at 0;20 (width 20), matching
  // what the bar-drag reference produces.
  test('drag_interval: driving the interval to the min edge by keyboard clamps the same way a bar-drag to the min edge does (#825)', async ({ page }) => {
    const config = { type: 'double', min: 0, max: 100, from: 20, to: 40, step: 1, drag_interval: true };

    await open(page, config);
    await drag(page, '.irs-bar', 0.1);
    await expect(input(page)).toHaveValue('30;50');
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('ArrowLeft');
    }
    await expect(input(page)).toHaveValue('0;20');

    // Reference: the same starting drag, continued in one motion past the
    // min edge instead of being released and stepped by keyboard.
    const page2 = await page.context().newPage();
    await open(page2, config);
    const h = await page2.locator('.irs-bar').boundingBox();
    const l = await page2.locator('.irs-line').boundingBox();
    const x = h.x + h.width / 2, y = h.y + h.height / 2;
    await page2.mouse.move(x, y);
    await page2.mouse.down();
    await page2.mouse.move(x + l.width * 0.1, y, { steps: 12 });
    await page2.mouse.move(x - l.width * 2, y, { steps: 12 });
    await page2.mouse.up();
    await expect(input(page2)).toHaveValue('0;20');
  });

  test('values mode writes the label, not the index', async ({ page }) => {
    await open(page, { values: ['S', 'M', 'L', 'XL'], from: 2 });
    await expect(input(page)).toHaveValue('L');
    expect((await events(page))[0]).toMatchObject({ from: 2, from_value: 'L' });
  });

  test('update() rewrites the options, reset() returns to them, destroy() restores the input', async ({ page }) => {
    await open(page, { min: 0, max: 100, from: 10 });
    await drag(page, '.irs-handle.single', 0.5);
    await page.evaluate(() => window.__irs.slider.reset());
    await expect(input(page)).toHaveValue('10');             // reset undoes the drag
    await page.evaluate(() => window.__irs.slider.update({ from: 70 }));
    await expect(input(page)).toHaveValue('70');
    await expect.poll(() => eventTypes(page)).toContain('onUpdate');
    await page.evaluate(() => window.__irs.slider.reset());
    await expect(input(page)).toHaveValue('70');             // update() changed the options themselves
    await page.evaluate(() => window.__irs.slider.destroy());
    await expect(page.locator('.irs')).toHaveCount(0);
    expect(await page.evaluate(() => jQuery.data(document.getElementById('slider'), 'ionRangeSlider'))).toBeFalsy();
  });

  test('disable shows the mask and disables the input; block keeps the input enabled', async ({ page }) => {
    await open(page, { min: 0, max: 100, from: 10, disable: true });
    await expect(page.locator('.irs-disable-mask')).toHaveCount(1);
    await expect(input(page)).toBeDisabled();
    await open(page, { min: 0, max: 100, from: 10, block: true });
    await expect(page.locator('.irs-disable-mask')).toHaveCount(1);
    await expect(input(page)).toBeEnabled();
  });
});
