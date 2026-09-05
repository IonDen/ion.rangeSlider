import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSlider } from './helpers.mjs';

// #507: with type: "double" and from === to, both handle spans render at
// the same spot. setTopHandler() gives .type_last (the top z-index) to
// s_to when the pair is not at max, and to s_from at max, based only on the
// INITIAL from/to values -- a real mousedown/touchstart always lands on
// that top handle, pointerDown() commits this.target to it, and calc()'s
// "from" may not pass "to" / "to" may not pass "from" crossing guards then
// only let that handle move AWAY from the other one -- dragging TOWARD the
// other value moves nothing at all, and the buried handle is unreachable
// until something else (a click on the line elsewhere) reassigns
// .type_last. Keyboard has the same gap via pointerFocus()'s default
// target.
//
// jsdom has no real layout (see helpers.mjs): $cache.rs.outerWidth()/
// .offset() are stubbed to a fixed 600px-wide slider and
// $cache.s_from/s_to.outerWidth() to a 16px handle, mirroring the browser
// fixture's flat-skin geometry (test/browser/drag-interval.spec.mjs),
// giving a non-zero p_handle so real and fake percent actually differ (see
// drag-interval-both.test.mjs for why that matters). coords.w_rs is primed
// via one drawHandles() call before each drag so pointerDown()/
// pointerMove() drive the real production calc() path deterministically.

function primeWidth(slider) {
  slider.$cache.rs.outerWidth = function () { return 600; };
  slider.$cache.rs.offset = function () { return { left: 0 }; };
  slider.$cache.s_from.outerWidth = function () { return 16; };
  slider.$cache.s_to.outerWidth = function () { return 16; };
  // One real drawHandles() pass, now that width is available, so the
  // resize-detection branch it runs settles coords.w_rs_old and
  // force_redraw *before* the drag starts -- otherwise pointerDown()'s own
  // updateScene() call would hit that same branch on frame one and stomp
  // the hit target back to "base".
  slider.drawHandles();
}

/**
 * Drives a real drag through the actual pointerDown/pointerMove production
 * code, one calc() per simulated pixel of movement, recording (from, to)
 * after every tick.
 */
function fineDrag(slider, hitTarget, startX, stepPx, count) {
  const ticks = [];
  slider.pointerDown(hitTarget, { pageX: startX, preventDefault: function () {} });
  for (let i = 1; i <= count; i++) {
    slider.pointerMove({ pageX: startX + stepPx * i });
    ticks.push({ from: slider.result.from, to: slider.result.to });
  }
  slider.pointerUp({});
  return ticks;
}

test('coincident 50/50: dragging the hit "to" handle left moves "from" down, "to" stays put (#507)', (t) => {
  const { slider } = createSlider(t, '<input>', {
    type: 'double', min: 0, max: 100, from: 50, to: 50, step: 1
  });
  primeWidth(slider);

  // One-line bug this catches: dropping pointerDown()/pointerMove()'s
  // direction-based reassignment of this.target (the "#507" flag) --
  // calc()'s "to" case clamps p_to_real to p_from_real on every leftward
  // tick, so both from and to would stay pinned at 50 the whole drag.
  const ticks = fineDrag(slider, 'to', 300, -1, 60);

  for (const tick of ticks) {
    assert.equal(tick.to, 50, 'to must stay at 50 while the drag reveals from, got to=' + tick.to);
  }
  const last = ticks[ticks.length - 1];
  assert.ok(last.from < 50, 'from must have moved down from 50, got from=' + last.from);
});

test('coincident 50/50: dragging the hit "from" handle right moves "to" up, "from" stays put (#507, mirror)', (t) => {
  const { slider } = createSlider(t, '<input>', {
    type: 'double', min: 0, max: 100, from: 50, to: 50, step: 1
  });
  primeWidth(slider);

  // Mirror of the test above, hitting the other handle. One-line bug this
  // catches: same dropped reassignment -- calc()'s "from" case clamps
  // p_from_real to p_to_real on every rightward tick, so both values would
  // stay pinned at 50.
  const ticks = fineDrag(slider, 'from', 300, 1, 60);

  for (const tick of ticks) {
    assert.equal(tick.from, 50, 'from must stay at 50 while the drag reveals to, got from=' + tick.from);
  }
  const last = ticks[ticks.length - 1];
  assert.ok(last.to > 50, 'to must have moved up from 50, got to=' + last.to);
});

// Boundary pairs: setTopHandler() already special-cases "at max" (gives
// "from" priority, since decreasing it away from a maxed "to" is always the
// unblocked direction) and "not at max" -- which also covers the exact min
// pair -- gives "to" priority (increasing it away from "from" is always the
// unblocked direction). Both boundary configurations below therefore drag
// in their own already-unblocked direction and are characterization tests
// (green before AND after the fix): they pin that the new direction-based
// reassignment never second-guesses a hit target that was already correct,
// which a naive implementation (e.g. always trusting the raw left/right
// comparison over the from_fixed/to_fixed-mirroring guard) could regress.
// Their catching mutation is different from the two tests above, though:
// dropping the reassignment entirely leaves this.target exactly as
// pointerDown() set it, so these two stay green with or without it -- they
// are regression guards on the shared code path, not red-first evidence for
// these two specific configs. What DOES catch them is direction inversion
// (swapping pointerMove()'s two ternary branches, so a leftward move
// resolves to the "increase" handle and vice versa): at 100/100 that would
// misresolve the leftward drag to "to" instead of "from", and "to" cannot
// decrease below the coincident "from" either, so it would stay pinned at
// 100 and the test's `last.from < 100` would fail. The from_fixed/to_fixed
// guard mutation below is a separate concern -- neither config here sets
// from_fixed or to_fixed, so that mutation reds only the dedicated
// from_fixed test further down, not these two.

test('coincident pair at max (100/100): dragging the hit "from" handle left moves it down (#507, characterization)', (t) => {
  const { slider } = createSlider(t, '<input>', {
    type: 'double', min: 0, max: 100, from: 100, to: 100, step: 1
  });
  primeWidth(slider);

  const ticks = fineDrag(slider, 'from', 300, -1, 60);

  for (const tick of ticks) {
    assert.equal(tick.to, 100, 'to must stay at max while from moves, got to=' + tick.to);
  }
  const last = ticks[ticks.length - 1];
  assert.ok(last.from < 100, 'from must have moved down from 100, got from=' + last.from);
});

test('coincident pair at min (0/0): dragging the hit "to" handle right moves it up (#507, characterization)', (t) => {
  const { slider } = createSlider(t, '<input>', {
    type: 'double', min: 0, max: 100, from: 0, to: 0, step: 1
  });
  primeWidth(slider);

  const ticks = fineDrag(slider, 'to', 300, 1, 60);

  for (const tick of ticks) {
    assert.equal(tick.from, 0, 'from must stay at min while to moves, got from=' + tick.from);
  }
  const last = ticks[ticks.length - 1];
  assert.ok(last.to > 0, 'to must have moved up from 0, got to=' + last.to);
});

// #507 fix round: a press-and-release with no movement must change nothing
// and must fire onFinish exactly once. What #507 adds is the
// coincident_pending flag, and that flag must not outlive the gesture it
// was set for -- verified below by immediately reusing the same instance
// for a completely unrelated, non-coincident drag and checking it moves
// exactly as it always has.

test('coincident 50/50: a press-and-release with no movement changes nothing, and does not corrupt the next drag (#507)', (t) => {
  let finishCalls = 0, lastFinish;
  const { slider } = createSlider(t, '<input>', {
    type: 'double', min: 0, max: 100, from: 50, to: 50, step: 1,
    onFinish: function (d) { finishCalls++; lastFinish = d; }
  });
  primeWidth(slider);
  finishCalls = 0;

  slider.pointerDown('to', { pageX: 300, preventDefault: function () {} });
  slider.pointerUp({});

  assert.equal(finishCalls, 1, 'a press with no movement must fire onFinish exactly once');
  assert.equal(lastFinish.from, 50, 'onFinish must report from unchanged');
  assert.equal(lastFinish.to, 50, 'onFinish must report to unchanged');
  assert.equal(slider.result.from, 50, 'from must be unchanged');
  assert.equal(slider.result.to, 50, 'to must be unchanged');

  // One-line bug this catches: leaving this.coincident_pending set in
  // pointerUp() -- pointerDown() only ever sets the flag to true, it never
  // resets it to false on a non-coincident hit, so a left-set flag would
  // leak into this second, unrelated, NON-coincident drag and
  // pointerMove()'s direction check would fire against the stale down-x
  // left over from the press above, reassigning this.target mid-drag and
  // moving the wrong handle.
  slider.update({ from: 20, to: 80 });
  primeWidth(slider); // update() rebuilds $cache; re-stub its geometry.
  // Started below the earlier press's down-x (300, still on
  // coincident_pending_x if the flag leaked): a leaked flag would compare
  // every tick's x against that stale 300 instead of this drag's own down
  // position, and since every tick here is below 300 it would misresolve
  // this "to" grab to "from" on the very first tick.
  const ticks = fineDrag(slider, 'to', 100, -1, 30);
  for (const tick of ticks) {
    assert.equal(tick.from, 20, 'a following ordinary drag must leave "from" alone, got from=' + tick.from);
  }
  assert.ok(ticks[ticks.length - 1].to < 80, 'a following ordinary drag must still move "to" down as normal');
});

// Non-coincident control: proves the fix only ever engages when from===to
// at the moment of the press.

test('non-coincident (20/80): dragging the hit "to" handle left moves it down as before, "from" untouched (#507, control)', (t) => {
  const { slider } = createSlider(t, '<input>', {
    type: 'double', min: 0, max: 100, from: 20, to: 80, step: 1
  });
  primeWidth(slider);

  // Mutation this (or the tests above) catches: making the flag
  // unconditional (dropping the `this.result.from === this.result.to`
  // check in pointerDown()) -- this drag's first leftward tick would then
  // get re-targeted to "from" instead of continuing to move "to", and "to"
  // would stay pinned at 80 instead of decreasing.
  const ticks = fineDrag(slider, 'to', 500, -1, 30);

  for (const tick of ticks) {
    assert.equal(tick.from, 20, 'from must stay untouched by a "to" drag, got from=' + tick.from);
  }
  const last = ticks[ticks.length - 1];
  assert.ok(last.to < 80, 'to must have moved down from 80, got to=' + last.to);
});

// Keyboard path: pointerFocus() always arms "from" by default (double
// mode). At a coincident pair the increase key on "from" hits the same
// crossing guard the mouse path does; the decrease key on "from" was
// already unblocked (moving away from "to") and stays that way.

test('coincident 50/50: the increase key from a fresh focus moves "to" to 51 (#507)', (t) => {
  const { slider } = createSlider(t, '<input>', {
    type: 'double', min: 0, max: 100, from: 50, to: 50, step: 1
  });
  primeWidth(slider);

  slider.pointerFocus({});
  assert.equal(slider.target, 'from', 'a fresh focus must arm "from" by default');

  // One-line bug this catches: dropping the keyboard target switch --
  // moveByKey()'s "from" case clamps p_from_real to p_to_real (both 50), so
  // the increase key would leave both values at 50.
  slider.moveByKey(true);
  assert.equal(slider.result.to, 51, 'the increase key must move "to" to 51, got to=' + slider.result.to);
  assert.equal(slider.result.from, 50, 'from must stay at 50');
});

test('coincident 50/50: the decrease key from a fresh focus moves "from" to 49, unaffected by the fix (#507)', (t) => {
  const { slider } = createSlider(t, '<input>', {
    type: 'double', min: 0, max: 100, from: 50, to: 50, step: 1
  });
  primeWidth(slider);

  slider.pointerFocus({});
  assert.equal(slider.target, 'from', 'a fresh focus must arm "from" by default');

  // Already-unblocked direction: "from" decreasing away from "to" was never
  // blocked by the coincidence bug. Kept as a control alongside the test
  // above so an over-broad fix (e.g. one that switches on every keypress
  // rather than only the blocked direction) is caught here instead.
  slider.moveByKey(false);
  assert.equal(slider.result.from, 49, 'the decrease key must move "from" to 49, got from=' + slider.result.from);
  assert.equal(slider.result.to, 50, 'to must stay at 50');
});

// from_fixed: a fixed handle must never be the one the direction switch
// picks -- mirrors chooseHandle()'s own from_fixed/to_fixed ternary. Value-
// only assertions on a leftward drag alone cannot distinguish "the guard
// correctly kept target at 'to', which then clamped against the fixed
// 'from'" from "target got reassigned to the fixed 'from', which no-ops
// unconditionally" -- both leave from/to at 50. This test tells them apart
// with a SINGLE continuous drag that goes left first (where an ungarded
// switch would misfire) and then, without releasing, past the start and
// on to the right: the resolved target is locked in for the rest of that
// one gesture (pointerMove() only resolves it once), so if the initial
// leftward ticks wrongly latched target onto the fixed "from", the later
// rightward ticks stay stuck too (calc()'s own from_fixed guard blocks
// every "from" candidate) -- "to" would never rise above 50. This is
// therefore a green-before-and-after-the-#507-fix regression guard for the
// guard itself, not red-first evidence of a #507 bug (from_fixed is not
// part of the reported bug): verified by a targeted mutation on the fixed
// source (dropping the "this.options.to_fixed ? \"from\" : \"to\"" /
// "this.options.from_fixed ? \"to\" : \"from\"" ternary down to the bare
// direction check) -- that mutation reds exactly this test.
test('coincident 50/50 with from_fixed: a drag that goes left then right within one gesture still ends with "to" raised (#507)', (t) => {
  const { slider } = createSlider(t, '<input>', {
    type: 'double', min: 0, max: 100, from: 50, to: 50, step: 1, from_fixed: true
  });
  primeWidth(slider);

  const ticks = [];
  slider.pointerDown('to', { pageX: 300, preventDefault: function () {} });
  for (let i = 1; i <= 20; i++) {
    slider.pointerMove({ pageX: 300 - i });
    ticks.push({ from: slider.result.from, to: slider.result.to });
  }
  for (let i = -20; i <= 60; i++) {
    slider.pointerMove({ pageX: 300 + i });
    ticks.push({ from: slider.result.from, to: slider.result.to });
  }
  slider.pointerUp({});

  for (const tick of ticks) {
    assert.equal(tick.from, 50, 'the fixed "from" handle must never move');
  }
  assert.ok(
    ticks[ticks.length - 1].to > 50,
    'once the same drag swings back past the start, "to" must rise again, got to=' + ticks[ticks.length - 1].to
  );
});

// #507 fix round: the keyboard resolution must be re-evaluated on every
// press while the pair is still coincident, not consumed by the first one.
// At 100/100 the increase key resolves to "to", which is already at max, so
// nothing moves and the pair stays coincident; the decrease key that follows
// must still be able to reach "from". One-line bug this catches: clearing
// coincident_key_pending on the first press regardless of whether a value
// moved -- the second press would then step the stranded "from" target...
// which cannot pass "to", so from would stay at 100.
test('coincident pair at max (100/100): increase then decrease from a fresh focus moves "from" to 99 (#507)', (t) => {
  const { slider } = createSlider(t, '<input>', {
    type: 'double', min: 0, max: 100, from: 100, to: 100, step: 1
  });
  primeWidth(slider);

  slider.pointerFocus({});
  slider.moveByKey(true);
  assert.equal(slider.result.to, 100, 'to is already at max and must stay there');
  assert.equal(slider.result.from, 100, 'the blocked increase must not move from');

  slider.moveByKey(false);
  assert.equal(slider.result.from, 99, 'the decrease key must reach "from", got from=' + slider.result.from);
  assert.equal(slider.result.to, 100, 'to must stay at 100');
});

// Mirror at min: the decrease key from 0/0 resolves to "from", already at
// min, so nothing moves; the increase key that follows must reach "to".
// Same mutation as above.
test('coincident pair at min (0/0): decrease then increase from a fresh focus moves "to" to 1 (#507)', (t) => {
  const { slider } = createSlider(t, '<input>', {
    type: 'double', min: 0, max: 100, from: 0, to: 0, step: 1
  });
  primeWidth(slider);

  slider.pointerFocus({});
  slider.moveByKey(false);
  assert.equal(slider.result.from, 0, 'from is already at min and must stay there');

  slider.moveByKey(true);
  assert.equal(slider.result.to, 1, 'the increase key must reach "to", got to=' + slider.result.to);
  assert.equal(slider.result.from, 0, 'from must stay at 0');
});

// #507 fix round: a press interrupted before pointerMove()/pointerUp()
// (touchcancel, a mouseup outside the window) must not leave the flag armed
// for the next, unrelated press. drag_interval's bar press ("both") never
// arms the flag itself; with a stale one, the first move of the bar drag
// would re-target the whole-interval drag onto a single handle. One-line
// bug this catches: dropping the `else { coincident_pending = false; }`
// branch in pointerDown().
test('an interrupted coincident press does not hijack the next drag_interval bar drag (#507)', (t) => {
  const { slider } = createSlider(t, '<input>', {
    type: 'double', min: 0, max: 100, from: 50, to: 50, step: 1, drag_interval: true
  });
  primeWidth(slider);

  // Interrupted press on the stacked handles: no move, no release.
  slider.pointerDown('to', { pageX: 300, preventDefault: function () {} });
  assert.equal(slider.coincident_pending, true, 'setup: the coincident press must arm the flag');

  // A fresh bar press replaces it.
  slider.pointerDown('both', { pageX: 300, preventDefault: function () {} });
  for (let i = 1; i <= 30; i++) {
    slider.pointerMove({ pageX: 300 + i });
  }
  slider.pointerUp({});

  assert.ok(slider.result.from > 50 && slider.result.to > 50, 'the whole interval must have moved right, got ' + slider.result.from + '/' + slider.result.to);
  assert.equal(slider.result.from, slider.result.to, 'the pair must move together under a bar drag, got ' + slider.result.from + '/' + slider.result.to);
});

// #507 fix round: an update() (or reset()) rebuilds the instance through
// init(); a flag armed by a press just before it must not survive into the
// rebuilt instance. Here the interrupted press's flag would otherwise make
// the first post-update move re-target onto "from" and drag it. One-line bug
// this catches: dropping the flag reset in init().
test('update() clears a pending coincident press so the rebuilt slider is not dragged by a stale flag (#507)', (t) => {
  const { slider } = createSlider(t, '<input>', {
    type: 'double', min: 0, max: 100, from: 50, to: 50, step: 1
  });
  primeWidth(slider);

  slider.pointerDown('to', { pageX: 300, preventDefault: function () {} });
  assert.equal(slider.coincident_pending, true, 'setup: the coincident press must arm the flag');

  slider.update({ from: 20, to: 80 });
  assert.equal(slider.coincident_pending, false, 'update() must clear the pending press');
  assert.equal(slider.coincident_key_pending, false, 'update() must clear the pending keyboard flag');

  primeWidth(slider);
  // A stray move after the rebuild (the pointer is still down as far as the
  // page is concerned) must not resolve a target from the stale flag.
  slider.pointerMove({ pageX: 250 });
  assert.equal(slider.result.from, 20, 'from must be untouched after update(), got ' + slider.result.from);
  assert.equal(slider.result.to, 80, 'to must be untouched after update(), got ' + slider.result.to);
});

// #507 fix round: the keyboard path toggles .type_last directly; it must
// not go through changeLevel(), which also adds state_hover, a class only
// pointerUp() removes (2.4.1's keyboard never added it). One-line bug this
// catches: calling changeLevel() when the key press switches the target.
test('a keyboard switch to "to" moves .type_last but never adds state_hover (#507)', (t) => {
  const { slider } = createSlider(t, '<input>', {
    type: 'double', min: 0, max: 100, from: 50, to: 50, step: 1
  });
  primeWidth(slider);

  slider.pointerFocus({});
  slider.moveByKey(true);
  assert.equal(slider.result.to, 51, 'setup: the increase key must have moved "to"');

  assert.equal(slider.$cache.s_to.hasClass('type_last'), true, '"to" must carry .type_last after the switch');
  assert.equal(slider.$cache.s_from.hasClass('type_last'), false, '"from" must have lost .type_last');
  assert.equal(slider.$cache.s_to.hasClass('state_hover'), false, 'the keyboard must not add state_hover to "to"');
  assert.equal(slider.$cache.s_from.hasClass('state_hover'), false, 'the keyboard must not add state_hover to "from"');
});

// #507 fix round, chosen behavior pinned: with drag_over_limit on, a press
// on a coincident pair opens the range in the drag direction instead of
// pushing both handles along (2.4.1 pushed both to 45/45 here and could
// never open the range leftwards). Once the handles are apart, the push
// behavior is unchanged (covered by drag-over-limit.test.mjs). Catcher: a
// mutation that skips the coincident resolution when drag_over_limit is
// on -- "to" would then push "from" and the pair would end at 45/45.
test('coincident 50/50 with drag_over_limit: dragging left opens the range instead of pushing both handles (#507)', (t) => {
  const { slider } = createSlider(t, '<input>', {
    type: 'double', min: 0, max: 100, from: 50, to: 50, step: 1, drag_over_limit: true
  });
  primeWidth(slider);

  const ticks = fineDrag(slider, 'to', 300, -1, 30);
  const last = ticks[ticks.length - 1];
  assert.ok(last.from < 50, 'from must have moved down, got from=' + last.from);
  assert.equal(last.to, 50, 'to must stay at 50, got to=' + last.to);
});

// #507 fix round: the keyboard resolution must never pick a fixed handle.
// With to_fixed, the increase key at a coincident pair has no handle it may
// move (the default "from" cannot pass "to", and "to" is fixed), so the
// press is a no-op and the target stays "from"; the decrease key then moves
// "from". One-line bug this catches: dropping the `!to_fixed` /
// `!from_fixed` conditions in moveByKey()'s resolution -- the blocked press
// would commit the target to the fixed "to" (calc() still no-ops it, so the
// values alone would not tell; the target assertion does).
test('keyboard resolution at a coincident pair never picks a fixed handle (#507)', (t) => {
  const { slider } = createSlider(t, '<input>', {
    type: 'double', min: 0, max: 100, from: 50, to: 50, step: 1, to_fixed: true
  });
  primeWidth(slider);

  slider.pointerFocus({});
  slider.moveByKey(true);
  assert.equal(slider.result.to, 50, 'the fixed "to" must not move');
  assert.equal(slider.result.from, 50, 'from cannot pass "to", so it must not move either');
  assert.equal(slider.target, 'from', 'the target must stay on the non-fixed handle');

  slider.moveByKey(false);
  assert.equal(slider.result.from, 49, 'the decrease key must move "from"');
  assert.equal(slider.result.to, 50, 'the fixed "to" must still not move');
});
