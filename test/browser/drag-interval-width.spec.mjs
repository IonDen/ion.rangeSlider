import { test, expect } from '@playwright/test';
import { open, events, input, LABEL } from './helpers.mjs';

// #867: with drag_interval, calc()'s "both" case (the whole-interval bar
// drag) step-snapped "from" and "to" INDEPENDENTLY. When the dragged
// interval's width is not a whole number of steps, the two independent
// roundings drift in and out of sync as the pointer moves, so the reported
// width alternates between two neighboring values instead of staying pinned
// at the width the user actually grabbed -- and every alternation is a
// genuine value change, doubling the onChange rate and (through the drag's
// temporary min_interval pin) writing "from" off the step grid. Fixed by
// snapping only "from" and deriving "to" as from_snapped + the exact width
// captured at drag start, instead of snapping "to" independently. See
// test/unit/drag-interval-off-grid-width.test.mjs for the full analysis and
// the deterministic jsdom reproduction; this spec asserts the same behavior
// through page-observable state (onChange payloads, the input value,
// data-from/data-to, and a keyboard follow-up), driven by a real drag.
//
// The `width` fixture query param (test/fixtures/slider.html) renders the
// slider's line at an exact pixel width instead of the default 600px --
// used here so min:0/max:1000/step:5 gives a clean 5px-per-step line,
// matching the unit test's stubbed geometry and letting 1px mouse moves land
// exactly on and off the step grid.
//
// fineDrag and countSplitChanges are copied from test/browser/drag-interval.spec.mjs
// (see that file for why fineDrag drives 1px-at-a-time mouse.move calls
// instead of the coarse `drag()` helper).

/**
 * Mouse-down on `selector` at `startFraction` of the `.irs-line`'s width,
 * then step `stepPx`-at-a-time for `count` ticks, then mouse-up.
 */
async function fineDrag(page, selector, startFraction, stepPx, count) {
  const bar = await page.locator(selector).boundingBox();
  const line = await page.locator('.irs-line').boundingBox();
  const y = bar.y + bar.height / 2;
  let x = line.x + line.width * startFraction;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 0; i < count; i++) {
    x += stepPx;
    await page.mouse.move(x, y);
  }
  await page.mouse.up();
}

/**
 * A "split" onChange is one where exactly one of from/to differs from the
 * previous onChange -- both should always move together (or neither) in a
 * translate drag.
 */
function countSplitChanges(changes) {
  let splits = 0;
  for (let i = 1; i < changes.length; i++) {
    const fromChanged = changes[i - 1].from !== changes[i].from;
    const toChanged = changes[i - 1].to !== changes[i].to;
    if (fromChanged !== toChanged) {
      splits++;
    }
  }
  return splits;
}

/**
 * The value 40% of the way into the interval's CURRENT span, as a fraction
 * of the full 0-1000 line -- matching how a real second drag grabs the bar
 * wherever it now sits after an earlier drag moved it, not a fixed pixel
 * unrelated to the bar's new position. Range is 0-1000 over a 1000px line
 * (the `width` fixture param below), so value and line-fraction coincide.
 */
async function barGrabFraction(page) {
  const [from, to] = (await input(page).inputValue()).split(';').map(Number);
  return (from + 0.4 * (to - from)) / 1000;
}

const CONFIG = { type: 'double', min: 0, max: 1000, from: 300, to: 802, step: 5, drag_interval: true };
const WIDE = { width: 1000 };

test.describe(`drag_interval off-grid width (${LABEL})`, () => {
  // B1: one-line bug this catches -- independently step-snapping "to"
  // instead of deriving it from the snapped "from" + width. Reds on master:
  // some recorded onChange report a width of 505 instead of 502.
  test('B1 every recorded onChange during a fine bar drag reports to - from === 502 (#867)', async ({ page }) => {
    await open(page, CONFIG, WIDE);
    await fineDrag(page, '.irs-bar', 0.40, 1, 60);

    const changes = (await events(page)).filter((e) => e.type === 'onChange');
    expect(changes.length).toBeGreaterThan(0);

    for (const e of changes) {
      expect(e.to - e.from, `onChange from=${e.from} to=${e.to}`).toBe(502);
    }
  });

  // B2: same root cause as B1, viewed as split onChange pairs. Reds on
  // master in both directions.
  test('B2 a fine bar drag has zero split onChange, right and left (#867)', async ({ page }) => {
    await open(page, CONFIG, WIDE);
    await fineDrag(page, '.irs-bar', 0.40, 1, 60);
    const right = (await events(page)).filter((e) => e.type === 'onChange');
    expect(countSplitChanges(right)).toBe(0);

    await open(page, CONFIG, WIDE);
    await fineDrag(page, '.irs-bar', 0.40, -1, 60);
    const left = (await events(page)).filter((e) => e.type === 'onChange');
    expect(countSplitChanges(left)).toBe(0);
  });

  // B3: the fix's own accepted trade-off (see the code comment at the fix
  // site) is that "to" sits off the step grid whenever the width itself
  // does -- what the fix guarantees instead is that "from" stays on it on
  // every onChange while neither end is pushed against a range limit (at
  // the far edge the pair settles at 498/1000, which U5 pins), not just the
  // settled end state.
  // Reds on master: the drag's own checkMinInterval pin (min_interval set
  // to the pre-drag width, not a multiple of step) pulls "from" through a
  // value-space round-trip that lands it off the grid mid-drag, e.g. 303.
  test('B3 every onChange during the drag reports a from that stays on the step grid (#867)', async ({ page }) => {
    await open(page, CONFIG, WIDE);
    await fineDrag(page, '.irs-bar', 0.40, 1, 60);

    const changes = (await events(page)).filter((e) => e.type === 'onChange');
    expect(changes.length).toBeGreaterThan(0);
    for (const e of changes) {
      expect(e.from % 5, `onChange from=${e.from}`).toBe(0);
    }

    // Also confirmed page-observable through the input's own from/to cache
    // (writeToInput() stores it via jQuery's .data(), not a reflected
    // data-from/data-to DOM attribute -- see features.spec.mjs and
    // value-precision.spec.mjs) after the drag settles.
    await page.waitForTimeout(400);
    const dataFrom = await page.evaluate(() => window.jQuery('#slider').data('from'));
    expect(dataFrom % 5, `data-from=${dataFrom}`).toBe(0);
  });

  // B4: successive short drags (release, re-grab, drag a little more) must
  // never grow the interval. Reds on master starting with the second drag
  // (the first happens to release on a clean frame).
  test('B4 two short bar drags in sequence leave the width at 502 (#867)', async ({ page }) => {
    await open(page, CONFIG, WIDE);

    await fineDrag(page, '.irs-bar', await barGrabFraction(page), 1, 3);
    // The 300ms idle render loop can otherwise coalesce this drag's
    // trailing write with the next drag's -- wait it out before both
    // reading the settled value and starting the second drag.
    await page.waitForTimeout(400);
    await expect(input(page)).toHaveValue('305;807');

    await fineDrag(page, '.irs-bar', await barGrabFraction(page), 1, 3);
    await page.waitForTimeout(400);
    await expect(input(page)).toHaveValue('310;812');
  });

  // B5: #825 interaction coverage -- moveIntervalByKey() (the keyboard path
  // for a drag_interval bar drag) shifts p_from_real/p_to_real by exactly
  // one step directly, without re-deriving them through calcWithStep, so it
  // preserves whatever off-grid position a preceding bar drag left behind.
  // Characterization: already correct on master (this ticket's bug is in
  // the mouse path only) -- asserted as a relative shift (not the drag's
  // absolute landing value, which the #867 fix itself changes: 303;805 on
  // master vs 305;807 fixed) so this genuinely proves the keyboard path
  // regardless of which one produced the pre-press state. The rendered
  // handle position is asserted too, not just the input value: result.from/
  // result.to (and so the input value) come from p_from_real/p_to_real,
  // which moveIntervalByKey() always writes, so dropping the
  // `this.coords.p_from_fake = ...` / `this.coords.p_to_fake = ...` writes
  // (the catching mutation, verified in js/ion.rangeSlider.js) leaves the
  // input value correct while the handle silently never moves on screen --
  // an input-value-only assertion would not catch that.
  test('B5 after a bar drag one ArrowRight on the focused line moves the pair by one step, width kept (#867, characterization)', async ({ page }) => {
    await open(page, CONFIG, WIDE);
    await fineDrag(page, '.irs-bar', await barGrabFraction(page), 1, 3);
    await page.waitForTimeout(400);
    const [beforeFrom, beforeTo] = (await input(page).inputValue()).split(';').map(Number);
    const fromLeftBefore = await page.locator('.irs-handle.from').evaluate((el) => parseFloat(el.style.left));
    const toLeftBefore = await page.locator('.irs-handle.to').evaluate((el) => parseFloat(el.style.left));

    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(400);
    const [afterFrom, afterTo] = (await input(page).inputValue()).split(';').map(Number);
    const fromLeftAfter = await page.locator('.irs-handle.from').evaluate((el) => parseFloat(el.style.left));
    const toLeftAfter = await page.locator('.irs-handle.to').evaluate((el) => parseFloat(el.style.left));

    expect(afterFrom - beforeFrom, `from ${beforeFrom} -> ${afterFrom}`).toBe(5);
    expect(afterTo - beforeTo, `to ${beforeTo} -> ${afterTo}`).toBe(5);
    expect(afterTo - afterFrom, 'width must be unchanged by the key press').toBe(beforeTo - beforeFrom);
    expect(fromLeftAfter, `from handle left% ${fromLeftBefore} -> ${fromLeftAfter}`).toBeGreaterThan(fromLeftBefore);
    expect(toLeftAfter, `to handle left% ${toLeftBefore} -> ${toLeftAfter}`).toBeGreaterThan(toLeftBefore);
  });
});
