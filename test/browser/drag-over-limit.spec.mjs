import { test, expect } from '@playwright/test';
import { open, input, drag, LABEL } from './helpers.mjs';

// #302: drag_over_limit lets a dragged handle push the other handle along
// instead of clamping against it once they meet. v1 is mouse/touch drag only
// (calc()'s "from" and "to" cases) -- keyboard keeps today's clamp even with
// the option on. Off by default: existing double-slider setups are
// unaffected. Every test names, in its own comment, the one-line source
// mutation (or the pre-#302 baseline) that would make it fail.

test.describe(`drag_over_limit (${LABEL})`, () => {
  // RED on master: today's crossing clamp in calc()'s "from" case sets
  // p_from_real = p_to_real (the *unmoved* to), so from stops at 40 instead
  // of advancing past it, and to never moves. Mutation this catches:
  // reverting the "from" case's drag_over_limit branch back to the plain
  // crossing clamp.
  test('drag_over_limit: true -- dragging "from" well past "to" pushes "to" along, gap 0 (#302)', async ({ page }) => {
    await open(page, { type: 'double', min: 0, max: 100, from: 20, to: 40, step: 1, drag_over_limit: true });
    await drag(page, '.irs-handle.from', 0.5);
    const [from, to] = (await input(page).inputValue()).split(';').map(Number);
    expect(from).toBeGreaterThan(40);
    expect(to).toBe(from);
  });

  // Mirror of the test above, dragging "to" down past "from". RED on
  // master for the same reason, mirrored: the "to" case's crossing clamp
  // pins to at the unmoved from (60) instead of pushing it down.
  test('drag_over_limit: true -- dragging "to" well below "from" pushes "from" along, gap 0 (#302)', async ({ page }) => {
    await open(page, { type: 'double', min: 0, max: 100, from: 60, to: 80, step: 1, drag_over_limit: true });
    await drag(page, '.irs-handle.to', -0.5);
    const [from, to] = (await input(page).inputValue()).split(';').map(Number);
    expect(to).toBeLessThan(60);
    expect(from).toBe(to);
  });

  // RED on master: to_max never enters the "from" case's crossing clamp at
  // all today, so "to" stays wherever it already was (40, still inside
  // to_max) and "from" clamps there instead of at to_max. Mutation this
  // catches: dropping the checkDiapason(to_min, to_max) clamp from the push
  // helper, which would let "to" sail past its own to_max instead of
  // stopping there.
  test('drag_over_limit: true -- to_max stops the push, "from" clamps against the stopped "to" (#302)', async ({ page }) => {
    await open(page, { type: 'double', min: 0, max: 100, from: 20, to: 40, step: 1, drag_over_limit: true, to_max: 60 });
    await drag(page, '.irs-handle.from', 0.7);
    await expect(input(page)).toHaveValue('60;60');
  });

  // Characterization: green both before and after #302 -- to_fixed already
  // blocks the "to" handle from moving, and the crossing clamp in the "from"
  // case doesn't consult drag_over_limit at all, so "from" clamps flush
  // against the fixed "to" either way. Pins the to_fixed contract: mutation
  // this catches: dropping the `next_fixed` guard in the push helper, which
  // would let "to" move even though it's fixed, landing on the dragged
  // value instead of staying at 40.
  test('drag_over_limit: true -- to_fixed blocks the push entirely, "from" clamps at "to" (#302, characterization)', async ({ page }) => {
    await open(page, { type: 'double', min: 0, max: 100, from: 20, to: 40, step: 1, drag_over_limit: true, to_fixed: true });
    await drag(page, '.irs-handle.from', 0.5);
    await expect(input(page)).toHaveValue('40;40');
  });

  // Characterization: default is false, so this is byte-identical to
  // today's clamp behavior -- green both before and after #302. Mutation
  // this catches: dropping the `options.drag_over_limit` guard so the push
  // branch always runs regardless of the option, which would let "from"
  // advance past 40 (pushing "to" toward 100) instead of clamping there.
  test('drag_over_limit: default false -- dragging "from" past "to" still clamps exactly as before (#302, characterization)', async ({ page }) => {
    await open(page, { type: 'double', min: 0, max: 100, from: 20, to: 40, step: 1 });
    await drag(page, '.irs-handle.from', 0.5);
    await expect(input(page)).toHaveValue('40;40');
  });

  // v1 scope pin: keyboard keeps today's clamp even with the option on.
  // Catches someone later wiring drag_over_limit into moveByKey() without
  // tests -- mutation this catches: dropping the `!this.is_key` half of the
  // "from"/"to" case guard, which would let the second ArrowRight push "to"
  // to 41 (no to_max to stop it) instead of clamping "from" at 40.
  test('drag_over_limit: true -- keyboard still clamps at the crossing point, push is mouse/touch only (#302)', async ({ page }) => {
    await open(page, { type: 'double', min: 0, max: 100, from: 39, to: 40, step: 1, drag_over_limit: true });
    await page.locator('.irs-line').focus();
    await page.keyboard.press('ArrowRight');
    // The 400ms wait outlasts the 300ms idle render poll keyboard input
    // rides on (see the testing reference) -- without it, the assertion
    // right after the second press can match a stale pre-render DOM value
    // that happens to already read "40;40" from the first press, passing
    // without ever observing whether the second press pushed "to" or
    // clamped "from".
    await page.waitForTimeout(400);
    await expect(input(page)).toHaveValue('40;40');
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(400);
    await expect(input(page)).toHaveValue('40;40');
  });

  // min_interval interplay: pushing preserves the configured gap instead of
  // letting it collapse. RED on master: without drag_over_limit,
  // checkMinInterval stops "from" at to - min_interval (30) and never moves
  // "to" -- so "from" never gets past 30 and "to" never leaves 40, unlike
  // the assertions below. Mutation this catches: reusing the old
  // checkMinInterval call (which stops the dragged handle) instead of the
  // push helper (which advances the other handle) in the drag_over_limit
  // branch.
  test('drag_over_limit: true with min_interval -- "to" starts moving once the gap reaches min_interval and stays exactly that wide (#302)', async ({ page }) => {
    await open(page, { type: 'double', min: 0, max: 100, from: 20, to: 40, step: 1, drag_over_limit: true, min_interval: 10 });
    await drag(page, '.irs-handle.from', 0.5);
    const [from, to] = (await input(page).inputValue()).split(';').map(Number);
    expect(from).toBeGreaterThan(30);
    expect(to).toBeGreaterThan(40);
    expect(to - from).toBe(10);
  });

  // Probe-confirmed fix-round regression: the push target was computed from
  // the dragged handle's RAW pointer position, before checkDiapason clamped
  // it to from_max. Dragging "from" past both "to" and from_max pushed "to"
  // all the way to the raw (unclamped) drag position, then clamped "from"
  // back to from_max afterward -- leaving "to" stranded ahead of "from" with
  // a stale gap that should never have opened, instead of both handles
  // settling together at the limit "from" actually reaches. Mutation this
  // catches: computing the push target from p_from_real before the
  // checkDiapason(from_min, from_max) clamp (i.e. reverting the fix-round
  // reordering) -- "to" would land near the raw drag position (well past
  // 50) instead of also settling at 50.
  test('drag_over_limit: true with from_max -- pushing past the limit settles both handles there, no stale gap (#302 fix)', async ({ page }) => {
    await open(page, { type: 'double', min: 0, max: 100, from: 20, to: 40, step: 1, drag_over_limit: true, from_max: 50 });
    await drag(page, '.irs-handle.from', 0.5);
    await expect(input(page)).toHaveValue('50;50');
  });

  // Mirror of the from_max test above, dragging "to" down past "from" and
  // to_min. Kept as the one representative "to"-side mirror since pushHandle
  // is shared by both calc() cases (per the fix-round brief).
  test('drag_over_limit: true with to_min -- pushing past the limit settles both handles there, no stale gap (#302 fix)', async ({ page }) => {
    await open(page, { type: 'double', min: 0, max: 100, from: 60, to: 80, step: 1, drag_over_limit: true, to_min: 50 });
    await drag(page, '.irs-handle.to', -0.5);
    await expect(input(page)).toHaveValue('50;50');
  });

  // Same stale-gap bug, compounded with max_interval: because the pre-fix
  // stale gap (21) exceeded max_interval (5), checkMaxInterval pulled "from"
  // back OUT toward the stranded "to" -- past from_max a second time, worse
  // than leaving it at the from_max clamp alone. Mutation this catches: same
  // as above (push target computed from the raw, unclamped drag position) --
  // "from" would settle above 50 (checkMaxInterval dragging it toward the
  // stranded "to") instead of exactly at from_max.
  test('drag_over_limit: true with from_max and max_interval -- the dragged handle never exceeds its own limit (#302 fix)', async ({ page }) => {
    await open(page, { type: 'double', min: 0, max: 100, from: 20, to: 40, step: 1, drag_over_limit: true, from_max: 50, max_interval: 5 });
    await drag(page, '.irs-handle.from', 0.5);
    await expect(input(page)).toHaveValue('50;50');
  });

  // Pins pushHandle's gap-preserving reclamp branch specifically (the "push
  // got stuck against the other handle's own limit" path), which the
  // min_interval test above never reaches -- there, the push always
  // succeeds, so the reclamp branch (`current = next - min_gap`) never runs.
  // Here to_max stops the push short, forcing the reclamp to fire. Mutation
  // this catches: replacing the gap-preserving `current = next - min_gap;`
  // with a flush `current = next;` -- "from" would land at 45 (flush with
  // the stuck "to"), collapsing the mandatory min_interval gap to 0 instead
  // of holding it at 10.
  test('drag_over_limit: true with min_interval and a stuck push -- the gap stays exactly min_interval wide (#302)', async ({ page }) => {
    await open(page, { type: 'double', min: 0, max: 100, from: 20, to: 40, step: 1, drag_over_limit: true, min_interval: 10, to_max: 45 });
    await drag(page, '.irs-handle.from', 0.5);
    await expect(input(page)).toHaveValue('35;45');
  });
});
