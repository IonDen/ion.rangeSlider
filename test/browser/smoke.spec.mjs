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

  // #851: pointerUp() redraws through drawHandles() with a forced redraw,
  // and the onChange guard there never checked whether from/to actually
  // changed -- only whether is_resize/is_update/is_start/is_finish was set.
  // Releasing the button motionless, after the last pointer-move tick has
  // already been drawn (which is how most real mouse/touch drags end -- the
  // browser's own animation-frame loop renders while the button is still
  // held), fired onChange a second time with the exact value already
  // reported. Holding the button for a while before releasing, below, gives
  // the page a real animation frame to render the last move before mouseup.
  test('releasing a drag that has already rendered does not repeat the last onChange (#851)', async ({ page }) => {
    await open(page, { min: 0, max: 100, from: 0 });
    const h = await page.locator('.irs-handle.single').boundingBox();
    const l = await page.locator('.irs-line').boundingBox();
    const x = h.x + h.width / 2, y = h.y + h.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + l.width * 0.5, y, { steps: 12 });
    await page.waitForTimeout(150);
    await page.mouse.up();

    const ev = await events(page);
    const types = ev.map((e) => e.type);
    expect(types.at(-1)).toBe('onFinish');

    // One-line bug this catches: dropping the "did from/to actually change"
    // check from drawHandles()'s onChange condition -- the release below
    // adds one more onChange carrying the exact same from/to as the one
    // right before it.
    for (let i = 1; i < ev.length; i++) {
      if (ev[i].type === 'onChange' && ev[i - 1].type === 'onChange') {
        expect(ev[i].from === ev[i - 1].from && ev[i].to === ev[i - 1].to).toBe(false);
      }
    }

    const last = ev[ev.length - 1];
    const beforeLast = ev[ev.length - 2];
    expect(beforeLast.type).toBe('onChange');
    expect(beforeLast.from).toBe(last.from);
    expect(beforeLast.to).toBe(last.to);
  });

  test('clicking the line jumps to the clicked value', async ({ page }) => {
    await open(page, { min: 0, max: 100, from: 0 });
    const l = await page.locator('.irs-line').boundingBox();
    await page.mouse.click(l.x + l.width * 0.75, l.y + l.height / 2);
    await expect.poll(async () => Number(await input(page).inputValue())).toBeGreaterThanOrEqual(70);
    expect(Number(await input(page).inputValue())).toBeLessThanOrEqual(80);
    await expect.poll(() => eventTypes(page)).toContain('onFinish');
  });

  // #742: a deliberate click that lands on the current value (no move) must
  // still fire onFinish -- that is intentional (force_redraw in
  // pointerClick/drawHandles), not the #742 bug. The bug was focus alone
  // synthesizing that same click with no user interaction at all. step: 50
  // widens the "still resolves to from: 50" bucket to roughly 25%..75% of
  // the line (calcWithStep's nearest-step rounding), so the click can land
  // well clear of the handle's own 16px hit box -- which intercepts
  // mousedown at its own position and never reaches pointerClick -- while
  // still characterizing "click at the current value". Must stay green
  // both before and after the #742 fix.
  test('clicking the line near the current value still fires onFinish, value unchanged (#742)', async ({ page }) => {
    await open(page, { min: 0, max: 100, from: 50, step: 50 });
    const before = (await events(page)).length;
    const l = await page.locator('.irs-line').boundingBox();
    await page.mouse.click(l.x + l.width * 0.5 + 20, l.y + l.height / 2);
    await expect.poll(() => eventTypes(page)).toContain('onFinish');
    await expect(input(page)).toHaveValue('50');
    expect((await events(page)).length).toBeGreaterThan(before);
  });

  // #742: focusing the slider with no interaction (a bare Tab, or a
  // programmatic .focus()) must not report any change. Before the fix,
  // pointerFocus() synthesized a click at the current handle's own position
  // whenever this.target was null, and force_redraw made drawHandles()
  // treat that as a real interaction -- firing onChange and onFinish for a
  // value that never moved. Mutation this catches: reinstating that
  // synthetic click.
  test('focusing the line with no interaction fires no callbacks beyond onStart (#742)', async ({ page }) => {
    await open(page, { min: 0, max: 100, from: 30 });
    await page.locator('.irs-line').focus();
    await expect(page.locator('.irs-line')).toBeFocused();
    // The idle render loop (updateScene's 300ms setTimeout) is where a
    // focus-triggered force_redraw would actually reach drawHandles() and
    // fire its callbacks, so give it a full cycle before asserting nothing
    // arrived.
    await page.waitForTimeout(400);
    expect(await eventTypes(page)).toEqual(['onStart']);
  });

  // #742's own repro chain (issue reporter: change a value, rotate the
  // phone, tap elsewhere -- onFinish fires with nothing changed). A resize
  // is what re-arms the bug: drawHandles() detects the width change, sets
  // target to "base" for one calc() pass, and that pass nulls this.target
  // back to null (the same state a fresh page load starts in) -- so the
  // very next focus hits the same synthesized-click path a bare initial
  // focus would.
  test('a resize after a drag does not make the next line focus fire spurious callbacks (#742)', async ({ page }) => {
    await open(page, { min: 0, max: 100, from: 0 });
    await drag(page, '.irs-handle.single', 0.5);
    await expect.poll(() => eventTypes(page)).toContain('onFinish');
    const before = (await events(page)).length;

    await page.evaluate(() => {
      document.getElementById('wrap').style.width = '400px';
    });
    // Resize is only detected on the idle render loop's 300ms poll.
    await page.waitForTimeout(400);

    // The drag above already left the line focused -- pointerDown() itself
    // calls .trigger("focus") at the end of a drag -- so refocusing it
    // without first moving focus away would be a no-op on an
    // already-focused element and fire no "focus" event at all. Blur first
    // so the refocus below is a genuine DOM focus transition.
    await page.evaluate(() => {
      if (document.activeElement) {
        document.activeElement.blur();
      }
    });
    await page.locator('.irs-line').focus();
    await expect(page.locator('.irs-line')).toBeFocused();
    await page.waitForTimeout(400);

    expect((await events(page)).length).toBe(before);
  });

  // #557 / #577: the two #742 focus tests above pin CALLBACKS only, on an
  // ON-GRID value (from: 30, step not set) -- they never exercise the
  // actual #557/#577 symptom, which is the pre-#742 pointerFocus() also
  // mutating the VALUE (the third #742 test, "clicking the line near the
  // current value", does assert a value, but that is a deliberate click,
  // not focus alone). Before #742, pointerFocus() synthesized a click that
  // read the handle's own on-screen position back through the pixel<->value
  // conversion, and that introduced a small positional bias -- one that
  // grows as the slider gets narrower. The synthesized click always fired
  // onChange/onFinish, but whether the reported VALUE visibly moved
  // depended on the step size relative to that bias: an off-grid value on a
  // coarse step snapped straight onto the grid regardless of width (33 ->
  // 30 at step 10), while a value already sitting on a fine step only moved
  // once the slider was narrow enough for the bias to cross half a step
  // (2.9 -> "3" at step 0.1 -- see the measured width sweep on the #577
  // test below). #742 (commit ee29de2) reduced pointerFocus() to arming
  // keyboard state only, so all three tests below are green both before and
  // after that fix (characterization pins), proven by the mutation-evidence
  // protocol -- reinstating the 2.3.2-era focus handler (any commit before
  // ee29de2; copied here from 40b1ceb) -- rather than red-first, since the
  // fix already shipped in 2.4.0.

  /**
   * Real keyboard Tab from document.body to the slider's `.irs-line`,
   * mirroring #557's actual repro (tabbing out of a preceding field, or
   * into the slider from nothing) rather than a programmatic .focus() call.
   * The fixture page has no other tabbable element -- toggleInput() forces
   * the real (hidden) input's tabindex to -1 on init -- so a single press
   * normally reaches it; loop defensively in case that ever changes.
   */
  async function tabToLine(page) {
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
      if (await page.locator('.irs-line').evaluate((el) => el === document.activeElement)) {
        return;
      }
    }
  }

  // #557: an off-grid initial value (from: 33, step: 10 -- validate() never
  // step-snaps from/to at init) must stay exactly as given after a real Tab
  // lands focus on the slider, with no onChange/onFinish. Mutation this
  // catches: reinstating the pre-#742 pointerFocus() synthesized click,
  // which step-snaps 33 to the nearest multiple of 10 (30) and fires
  // onChange then onFinish for a value the user never touched.
  test('tabbing onto the slider does not snap an off-grid value or fire onChange (#557)', async ({ page }) => {
    await open(page, { min: 0, max: 100, from: 33, step: 10 });
    await tabToLine(page);
    await expect(page.locator('.irs-line')).toBeFocused();
    // Outlast the 300ms idle render poll -- the only place a
    // focus-triggered force_redraw would actually reach drawHandles() and
    // fire callbacks.
    await page.waitForTimeout(400);
    await expect(page.locator('.irs-single')).toHaveText('33');
    await expect(input(page)).toHaveValue('33');
    expect(await eventTypes(page)).toEqual(['onStart']);
  });

  // #577: mirrors the report's step (0.1) and from (2.9) at a width inside
  // its stated "<= 325px" range -- the report's own fiddle used min 1..10,
  // this fixture keeps min 0..10, so this is the report's step and a width
  // inside its stated range, not a byte-for-byte reproduction. Measured
  // against the mutation below across a width sweep: the synthesized
  // click's positional bias (see the header comment above) is too small to
  // move 2.9 off its own step at 600px or 400px; from 326px down to 200px
  // it crosses half a step and the value becomes "3" (the fixture renders
  // "3", not "3.0" -- same numeric value as the report, and roughly
  // matching its own "<= 325px" threshold); at 100px it overshoots further,
  // to 3.1. 300px lands inside the "becomes 3" band. The width param is
  // additive (test/fixtures/slider.html, #577) and load-bearing here -- the
  // boundingBox() check right after open() guards against a broken or
  // misspelled width param passing silently.
  test('tabbing onto a narrow slider does not round a fractional value or fire onChange (#577)', async ({ page }) => {
    await open(page, { min: 0, max: 10, from: 2.9, step: 0.1 }, { width: '300' });
    // parseInt('abc', 10) is NaN, so a typo'd width would leave #wrap's CSS
    // width unset -- the slider would then render at this fixture's
    // default 600px, at which 2.9 never moves even under the mutation (see
    // the width sweep above), so every assertion below would still pass
    // without ever exercising the narrow-width path this test exists to
    // cover. `.irs` is the exact element the plugin measures for all
    // pixel<->value conversion (this.$cache.rs / coords.w_rs), so pinning
    // its rendered width here ties the guard to the mechanism the rest of
    // the test depends on. The outer container span also carries the
    // "irs" class (js/ion.rangeSlider.js `append()`), so a bare `.irs`
    // locator matches two elements and hits a strict-mode violation;
    // scope to the inner descendant that $cache.rs actually is -- the
    // fixture renders a single slider, always instance 0.
    const box = await page.locator('.js-irs-0 .irs').boundingBox();
    expect(box.width).toBe(300);
    await tabToLine(page);
    await expect(page.locator('.irs-line')).toBeFocused();
    await page.waitForTimeout(400);
    await expect(page.locator('.irs-single')).toHaveText('2.9');
    await expect(input(page)).toHaveValue('2.9');
    expect(await eventTypes(page)).toEqual(['onStart']);
  });

  // #557 in double mode, via a programmatic .focus() rather than a real
  // Tab -- the other half of the focus contract (arriving by .focus()
  // alone must be exactly as inert as arriving by Tab), the same path the
  // #742 focus tests above already use, and the cheapest way to exercise
  // double mode here without stringing together a real Tab sequence. Pins
  // that BOTH handles stay exactly as given and no onChange/onFinish
  // fires. Mutation this catches: reinstating the 2.3.2-era focus handler,
  // which always targeted "from" whenever type !== "single" ($handle =
  // this.$cache.from) -- its synthesized click only ever snapped "from"
  // (to 30 here), leaving "to" untouched at 67. That asymmetry is an
  // artifact of the old handler's own hardcoded target, not a claim this
  // test otherwise makes.
  test('double: programmatic focus leaves both handles untouched and fires no onChange (#557)', async ({ page }) => {
    await open(page, { type: 'double', min: 0, max: 100, from: 33, to: 67, step: 10 });
    await page.locator('.irs-line').focus();
    await expect(page.locator('.irs-line')).toBeFocused();
    await page.waitForTimeout(400);
    await expect(page.locator('.irs-from')).toHaveText('33');
    await expect(page.locator('.irs-to')).toHaveText('67');
    await expect(input(page)).toHaveValue('33;67');
    expect(await eventTypes(page)).toEqual(['onStart']);
  });

  test('keyboard moves by one step and fires onFinish', async ({ page }) => {
    await open(page, { min: 0, max: 100, from: 50, step: 5 });
    await page.locator('.irs-line').focus();
    await expect(page.locator('.irs-line')).toBeFocused();
    // The idle render loop is where a focus-triggered force_redraw would
    // actually fire its callbacks (#742) -- wait out a full cycle so a
    // still-buggy pointerFocus() cannot hide inside the same idle pass the
    // upcoming key press consumes (a pending is_click and a pending is_key
    // reaching drawHandles() together only fire one onChange/onFinish
    // pair, not two, which would otherwise mask the bug here).
    await page.waitForTimeout(400);
    expect(await eventTypes(page)).toEqual(['onStart']);
    await page.keyboard.press('ArrowRight');
    await expect(input(page)).toHaveValue('55');
    await page.keyboard.press('ArrowLeft');
    await expect(input(page)).toHaveValue('50');
    // Each press fires onChange then onFinish exactly once (#742): if focus
    // no longer arms this.target the way pointerFocus must, the keyboard
    // press moves nothing and this never reaches ['onStart', 'onChange',
    // 'onFinish', 'onChange', 'onFinish']. This pins the target half only --
    // this.current_plugin already equals this.plugin_count from construction
    // (both init to/at 0) for this fixture's one slider, so pointerFocus's
    // current_plugin assignment is unexercised here; it matters once a
    // second slider is on the page, which this suite does not cover.
    await expect.poll(() => eventTypes(page)).toEqual(['onStart', 'onChange', 'onFinish', 'onChange', 'onFinish']);
  });

  // #851: an arrow-key press with the handle already at the range edge is
  // a no-op -- the value cannot move any further -- but the pre-fix
  // onChange guard did not check for that, so it fired onChange for a
  // value that never changed, right before the (correct) onFinish.
  test('an arrow key press at the range edge fires onFinish only, no onChange (#851)', async ({ page }) => {
    await open(page, { min: 0, max: 100, from: 0 });
    await page.locator('.irs-line').focus();
    await expect(page.locator('.irs-line')).toBeFocused();
    // Outlast the idle render poll so a still-buggy focus handler cannot
    // hide inside the same idle pass the key press below consumes (mirrors
    // the keyboard test above).
    await page.waitForTimeout(400);
    const before = (await events(page)).length;

    await page.keyboard.press('ArrowLeft');
    await expect.poll(async () => (await events(page)).length).toBeGreaterThan(before);

    const added = (await events(page)).slice(before).map((e) => e.type);
    // One-line bug this catches: dropping the "did from/to actually change"
    // check from drawHandles()'s onChange condition -- the no-op press
    // above still reports onChange before onFinish.
    expect(added).toEqual(['onFinish']);
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

  // #759: keyboard controls in double mode. These assert on the input value
  // rather than on callback counts/order, since that is #759's actual
  // concern -- #742's focus-alone spurious onChange/onFinish pair is
  // covered separately by the dedicated focus tests above.

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
