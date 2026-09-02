import { test, expect } from '@playwright/test';
import { open, events, LABEL } from './helpers.mjs';

// #319: with drag_interval, dragging the whole interval (the ".irs-bar")
// fired onChange TWICE per logical step moving right -- once with only "to"
// advanced, then again with "from" catching up a tick later -- and the
// width was wrong (505 instead of 500) on the frames in between. Root
// cause: calc()'s "both" case resolved "from" (including its
// checkMinInterval call) before it ever recomputed "to", so "from" was
// checked against the previous tick's "to" instead of this tick's. See
// test/unit/drag-interval-both.test.mjs for the full analysis and the
// deterministic jsdom reproduction.
//
// The existing `drag(page, selector, fraction)` helper (test/browser/
// helpers.mjs) does one coarse mouse.move -- exactly why this bug was hard
// to pin down from a live drag ("depends on mouse accuracy"). This spec
// drives a genuinely fine-grained drag instead: mouse down on the bar at an
// off-center point, then many separate 1px mouse.move calls, so the browser
// has a real chance to render (and record onChange for) every intermediate
// tick rather than coalescing several calc() calls into one animation
// frame.

/**
 * Mouse-down on `selector` at `startFraction` of the `.irs-line`'s width,
 * then step `stepPx`-at-a-time for `count` ticks, then mouse-up. Each
 * page.mouse.move is awaited individually (not Playwright's `steps` option)
 * so the browser gets a real chance to process/render each tick separately.
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
 * translate drag. This is distinct from an exact repeat (neither changed),
 * which pointerUp's own final force-redraw pass can legitimately produce
 * and which is unrelated to #319.
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

const CONFIG = { type: 'double', min: 0, max: 1000, from: 300, to: 800, step: 5, drag_interval: true };

test.describe(`drag_interval both-handle drag (${LABEL})`, () => {
  // RED on master: some onChange frames report a width of 505 instead of
  // 500 (the "to"-advances-alone frame of the split), and the onChange
  // count exceeds the number of logical step moves because each split
  // produces two onChange events instead of one. Mutation this catches:
  // reverting the "both" case in calc() to resolve "from" (including its
  // checkMinInterval call) before "to" is recomputed -- see the unit test
  // file for the exact one-line change.
  test('dragging the bar right keeps the interval exactly 500 wide on every onChange (#319)', async ({ page }) => {
    await open(page, CONFIG);
    // Click at 40% of the line -- the interval spans 30%-80%, so this is
    // off-center inside the bar (not its 55% midpoint), matching how a real
    // drag actually grabs it off its own center.
    await fineDrag(page, '.irs-bar', 0.40, 1, 60);

    const changes = (await events(page)).filter((e) => e.type === 'onChange');
    expect(changes.length).toBeGreaterThan(0);

    for (const e of changes) {
      expect(e.to - e.from, `onChange from=${e.from} to=${e.to}`).toBe(500);
    }

    // No split onChange (one handle moving alone while the other lags a
    // frame behind) -- the doubled-onChange half of #319.
    expect(countSplitChanges(changes)).toBe(0);
  });

  // Leftward mirror, same off-center click and same exactly-500-wide,
  // step-5-aligned config. This is a characterization/regression-guard
  // test, not red-first evidence: the unit-test analysis (see
  // test/unit/drag-interval-both.test.mjs) proved this direction is
  // already correct on master for a step-aligned interval width -- the
  // stale-checkMinInterval comparison this PR fixes can only ever produce
  // a false clamp when the dragged interval is moving in the direction that
  // narrows the gap against the stale reference, which for this ordering is
  // rightward only. Kept here so a future edit to the "both" case that
  // breaks left-drag symmetry still gets caught.
  test('dragging the bar left keeps the interval exactly 500 wide on every onChange (#319, characterization)', async ({ page }) => {
    await open(page, CONFIG);
    await fineDrag(page, '.irs-bar', 0.40, -1, 60);

    const changes = (await events(page)).filter((e) => e.type === 'onChange');
    expect(changes.length).toBeGreaterThan(0);

    for (const e of changes) {
      expect(e.to - e.from, `onChange from=${e.from} to=${e.to}`).toBe(500);
    }
  });
});
