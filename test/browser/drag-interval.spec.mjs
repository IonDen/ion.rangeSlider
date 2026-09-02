import { test, expect } from '@playwright/test';
import { open, events, input, LABEL } from './helpers.mjs';

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
 * Same as `fineDrag`, but waits a tick between each mouse.move so WebKit
 * (which coalesces closely-spaced synthetic mousemove events more
 * aggressively than Chromium/Firefox, observed here as several 1px moves
 * landing as a single, coarser DOM event) cannot merge moves together --
 * needed only by the two "does the very first tick move too far" checks
 * below, which care about the granularity of the FIRST recorded onChange.
 * The width/split-frame tests don't need this: they only care about the
 * eventual, settled values, not which specific tick first reports them.
 */
async function fineDragUncoalesced(page, selector, startFraction, stepPx, count) {
  const bar = await page.locator(selector).boundingBox();
  const line = await page.locator('.irs-line').boundingBox();
  const y = bar.y + bar.height / 2;
  let x = line.x + line.width * startFraction;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 0; i < count; i++) {
    x += stepPx;
    await page.mouse.move(x, y);
    await page.waitForTimeout(5);
  }
  await page.mouse.up();
}

/**
 * Same fine-drag loop as `fineDrag`, but also samples a selector's inline
 * CSS `left` (as a percent) every `sampleEvery` ticks during the drag --
 * the page-observable proxy for a handle's real-percent position, which
 * jsdom (test/unit/drag-interval-both.test.mjs) has no layout to render.
 */
async function fineDragSamplingLeft(page, selector, startFraction, stepPx, count, sampleEvery, sampleSelector) {
  const bar = await page.locator(selector).boundingBox();
  const line = await page.locator('.irs-line').boundingBox();
  const y = bar.y + bar.height / 2;
  let x = line.x + line.width * startFraction;
  const samples = [];
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 0; i < count; i++) {
    x += stepPx;
    await page.mouse.move(x, y);
    if (i % sampleEvery === 0) {
      const left = await page.locator(sampleSelector).evaluate((el) => parseFloat(el.style.left));
      samples.push(left);
    }
  }
  await page.mouse.up();
  return samples;
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
    // drag actually grabs it off its own center. It is also close enough to
    // the "from" handle (small p_gap_left) that the fix-round-2 real/fake
    // percent mismatch below (a separate test) is big enough to cross a
    // step boundary.
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

  // #319 fix-round regression: the first onChange must not resolve behind
  // (from < 300) the drag's actual start, and from must advance
  // monotonically throughout a monotonic rightward drag. RED on 9dc3ea0
  // (fix round 1) in a real browser: changeLevel's "both" case captured
  // p_gap_left/p_gap_right in fake percent but calc()'s "both" case adds
  // them onto real percent, so the very first tick resolved several steps
  // backward before catching up. Uses fineDragUncoalesced (see its
  // comment) rather than fineDrag: this assertion needs every 1px move to
  // survive as its own event, which WebKit does not guarantee for
  // tightly-spaced moves the way Chromium/Firefox do.
  test('dragging the bar right never resolves a tick behind where the drag started (#319 fix-round regression)', async ({ page }) => {
    await open(page, CONFIG);
    await fineDragUncoalesced(page, '.irs-bar', 0.40, 1, 20);

    const changes = (await events(page)).filter((e) => e.type === 'onChange');
    expect(changes.length).toBeGreaterThan(0);

    const first = changes[0];
    expect(first.from, `first onChange from=${first.from}`).toBeGreaterThanOrEqual(300);
    expect(
      Math.abs(first.from - 300),
      `first onChange must land within one step of the drag start, from=${first.from}`
    ).toBeLessThanOrEqual(5);

    let prevFrom = 300;
    for (const e of changes) {
      expect(e.from, `from=${e.from} after prevFrom=${prevFrom}`).toBeGreaterThanOrEqual(prevFrom);
      prevFrom = e.from;
    }
  });

  // Leftward mirror of the against-the-drag regression above -- fix-round
  // regression, not the original #319 double-fire. "from <= 300" alone
  // would not catch the mismatch leftward (a 2-step overshoot still
  // satisfies "<= 300"), so the within-one-step check is what actually
  // reds on 9dc3ea0 (fix round 1) here.
  test('dragging the bar left never resolves a tick ahead of where the drag started (#319 fix-round regression)', async ({ page }) => {
    await open(page, CONFIG);
    await fineDragUncoalesced(page, '.irs-bar', 0.40, -1, 20);

    const changes = (await events(page)).filter((e) => e.type === 'onChange');
    expect(changes.length).toBeGreaterThan(0);

    const first = changes[0];
    expect(first.from, `first onChange from=${first.from}`).toBeLessThanOrEqual(300);
    expect(
      Math.abs(first.from - 300),
      `first onChange must land within one step of the drag start, from=${first.from}`
    ).toBeLessThanOrEqual(5);

    let prevFrom = 300;
    for (const e of changes) {
      expect(e.from, `from=${e.from} after prevFrom=${prevFrom}`).toBeLessThanOrEqual(prevFrom);
      prevFrom = e.from;
    }
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
  //
  // Catching mutation (verified in the unit test file): make "to"'s
  // checkMinInterval compare against a stale, pre-tick "from" instead of
  // the fresh, same-tick one -- the mirror of the original bug applied to
  // the other handle. That reds this exact scenario leftward.
  test('dragging the bar left keeps the interval exactly 500 wide on every onChange (#319, characterization)', async ({ page }) => {
    await open(page, CONFIG);
    await fineDrag(page, '.irs-bar', 0.40, -1, 60);

    const changes = (await events(page)).filter((e) => e.type === 'onChange');
    expect(changes.length).toBeGreaterThan(0);

    for (const e of changes) {
      expect(e.to - e.from, `onChange from=${e.from} to=${e.to}`).toBe(500);
    }
  });

  // #319 fix-round regression: the reorder above lets checkMinInterval push
  // "from" past its own from_min floor with no re-clamp, once the drag has
  // gone well past the point where "from" first hits from_min -- see
  // test/unit/drag-interval-both.test.mjs for the full analysis (that file
  // also covers the analogous default-floor and to_max cases, which don't
  // need a browser to observe). Page-observable proxy for the handle's real
  // percent, since jsdom never renders layout: the from handle's own inline
  // `left` CSS (set by drawHandles()), sampled periodically during the
  // drag, must never go negative. RED on 9dc3ea0 (fix round 1): every
  // recorded onChange's `from` eventually drops well under 100, and the
  // `.irs-handle.from` element's `left` goes negative. Mutation this
  // catches: dropping the checkDiapason(from_min, from_max) re-clamp that
  // runs right after checkMinInterval("from").
  test('dragging the bar left past from_min keeps from pinned at the floor, no negative handle position (#319 fix-round regression)', async ({ page }) => {
    await open(page, { ...CONFIG, from_min: 100 });

    const samples = await fineDragSamplingLeft(page, '.irs-bar', 0.40, -1, 350, 10, '.irs-handle.from');
    for (const left of samples) {
      expect(left, 'the from handle\'s CSS left% must never go negative').toBeGreaterThanOrEqual(0);
    }

    const changes = (await events(page)).filter((e) => e.type === 'onChange');
    expect(changes.length).toBeGreaterThan(0);
    for (const e of changes) {
      expect(e.from, `onChange from=${e.from}`).toBeGreaterThanOrEqual(100);
    }

    const [from] = (await input(page).inputValue()).split(';').map(Number);
    expect(from).toBeGreaterThanOrEqual(100);

    // Secondary page-observable check on the "from" value label (a
    // different element than the handle: .irs-from is the number bubble,
    // .irs-handle.from is the draggable handle) after the drag settles.
    const labelLeft = await page.locator('.irs-from').evaluate((el) => parseFloat(el.style.left));
    expect(labelLeft, 'the from label\'s CSS left% must never go negative after the drag settles').toBeGreaterThanOrEqual(0);
  });
});
