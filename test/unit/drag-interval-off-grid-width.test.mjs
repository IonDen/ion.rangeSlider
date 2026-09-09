import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSlider } from './helpers.mjs';

// #867: with drag_interval, calc()'s "both" case snapped "from" and "to" to
// the step grid INDEPENDENTLY (each its own convertToRealPercent + step-round
// candidate). When the dragged interval's width is not a whole number of
// steps, the two independent roundings drift in and out of sync as the
// pointer moves: on roughly half of the pointer positions "from" rounds one
// way and "to" rounds the other, so the reported width alternates between
// two neighboring values (e.g. 505/502 for a 502-wide interval on a step-5
// grid) instead of staying pinned at the width the user actually grabbed.
// Every alternation is also a genuine value change, so it doubles the
// onChange rate and (via the drag's temporary min_interval pin, see
// setTempMinInterval()) can write "from" off the step grid entirely.
//
// Fix: snap only "from" to the grid, then derive "to" as
// from_snapped + (p_gap_left + p_gap_right) -- the exact width captured at
// drag start (changeLevel()'s "both" case) -- so the interval's width is
// preserved verbatim instead of being independently re-rounded on both ends.
// "to" is therefore off-grid whenever the width itself is off-grid; that is
// the documented, accepted trade-off (see the code comment at the fix site).
//
// Geometry stubbing and the fineDrag/countSplitFrames helpers are copied
// from test/unit/drag-interval-both.test.mjs (see that file's header for why
// they drive the real pointerDown/pointerMove/pointerUp path deterministically
// without a browser). The stubbed track here is 1000px wide instead of 600px
// so that, with min:0/max:1000/step:5, one step is a clean 5px
// (0.5% of 1000px) -- letting 1px pointer moves land exactly on and off the
// step grid instead of needing sub-pixel precision.

const CONFIG = { type: 'double', min: 0, max: 1000, step: 5, from: 300, to: 802, drag_interval: true };

function primeWidth(slider) {
  slider.$cache.rs.outerWidth = function () { return 1000; };
  slider.$cache.rs.offset = function () { return { left: 0 }; };
  slider.$cache.s_from.outerWidth = function () { return 16; };
  slider.$cache.s_to.outerWidth = function () { return 16; };
  // One real drawHandles() pass, now that width is available, so the
  // resize-detection branch it runs settles coords.w_rs_old and
  // force_redraw *before* the drag starts -- otherwise pointerDown()'s own
  // updateScene() call would hit that same branch on frame one and stomp
  // target="both" back to "base".
  slider.drawHandles();
}

/**
 * Drives a real drag_interval ("both") drag through the actual pointerDown/
 * pointerMove production code, one calc() per simulated pixel of movement,
 * and records (from, to) after every tick.
 */
function fineDrag(slider, startX, stepPx, count) {
  const ticks = [];
  slider.pointerDown('both', { pageX: startX, preventDefault: function () {} });
  for (let i = 1; i <= count; i++) {
    slider.pointerMove({ pageX: startX + stepPx * i });
    ticks.push({ from: slider.result.from, to: slider.result.to });
  }
  slider.pointerUp({});
  return ticks;
}

function countSplitFrames(ticks) {
  let splits = 0;
  let prev = null;
  for (const tick of ticks) {
    if (prev) {
      const fromChanged = prev.from !== tick.from;
      const toChanged = prev.to !== tick.to;
      // A "split" frame is one where exactly one side moved -- both should
      // always move together (or neither) in a translate drag.
      if (fromChanged !== toChanged) {
        splits++;
      }
    }
    prev = tick;
  }
  return splits;
}

/**
 * Same drag loop as fineDrag, but also calls drawHandles() after every
 * pointerMove tick. pointerMove() alone only runs calc() (which computes
 * result.from/result.to); onChange is decided and fired from drawHandles(),
 * which in a real browser runs once per animation frame via the rAF-driven
 * updateScene() loop. This helper reproduces that per-frame render inside
 * jsdom so onChange fires exactly the way it would during a real drag --
 * needed only for the onChange-count test (U3); the other tests here read
 * slider.result directly and don't need a render pass.
 */
function fineDragRendered(slider, startX, stepPx, count) {
  slider.pointerDown('both', { pageX: startX, preventDefault: function () {} });
  for (let i = 1; i <= count; i++) {
    slider.pointerMove({ pageX: startX + stepPx * i });
    slider.drawHandles();
  }
  slider.pointerUp({});
}

// U1: one-line bug this catches -- independently step-snapping "to" instead
// of deriving it from the snapped "from" + width. Reds on master: the first
// tick already reports from=300, to=805 (width 505) instead of 502.
test('U1 rightward bar drag keeps to - from === 502 on every tick (#867)', (t) => {
  const { slider } = createSlider(t, '<input>', CONFIG);
  primeWidth(slider);

  const ticks = fineDrag(slider, 500, 1, 60);

  for (const tick of ticks) {
    assert.equal(
      tick.to - tick.from, 502,
      'interval width must stay exactly 502 on every tick, got from=' + tick.from + ' to=' + tick.to
    );
  }
});

// U2: same root cause as U1, viewed as split frames -- a tick where only one
// of from/to advances is exactly what an independent, out-of-sync rounding
// produces. Reds on master: 12 split frames over this 60-tick drag.
test('U2 rightward drag has zero split frames (#867)', (t) => {
  const { slider } = createSlider(t, '<input>', CONFIG);
  primeWidth(slider);

  const ticks = fineDrag(slider, 500, 1, 60);
  const splits = countSplitFrames(ticks);

  assert.equal(splits, 0, 'no tick should move only one of from/to, got ' + splits + ' split frames');
});

// U3: every alternation between the two independently-rounded widths is a
// genuine value change, so it fires its own onChange -- on-grid, a full drag
// like this normally settles into a value change roughly once per step; an
// off-grid width instead flips (near-)every tick that straddles a step
// boundary, roughly doubling the count. Reds on master: 25 onChange for the
// off-grid drag against 12 for the byte-for-byte-comparable on-grid control
// (same drag, only to: 800 instead of 802).
test('U3 rightward drag fires the same number of onChange as the on-grid control (#867)', (t) => {
  let offGridCalls = 0;
  const { slider } = createSlider(t, '<input>', { ...CONFIG, onChange: function () { offGridCalls++; } });
  primeWidth(slider);
  fineDragRendered(slider, 500, 1, 60);

  let controlCalls = 0;
  const { slider: control } = createSlider(t, '<input>', { ...CONFIG, to: 800, onChange: function () { controlCalls++; } });
  primeWidth(control);
  fineDragRendered(control, 500, 1, 60);

  assert.equal(
    offGridCalls, controlCalls,
    'an off-grid interval width must not fire more onChange than the same drag on an on-grid width, got ' +
      offGridCalls + ' vs ' + controlCalls
  );
});

// U4: leftward mirror of U1 + U2. Reds on master for the same reason as U1:
// the independent step-snap on each side drifts out of sync while dragging
// left too (298/800 width 502, then 295/800 width 505, ...).
test('U4 leftward drag keeps to - from === 502 on every tick with zero split frames (#867)', (t) => {
  const { slider } = createSlider(t, '<input>', CONFIG);
  primeWidth(slider);

  // A non-integer start pixel dodges a landmine unrelated to #867:
  // pointerMove() reads `e.pageX || ...`, so a pageX of exactly 0 (an
  // integer startX minus an equal integer offset) is falsy and falls
  // through to the touch-event branch, which throws on a synthetic event
  // with no `originalEvent`. Not this ticket's bug; just avoided here.
  const ticks = fineDrag(slider, 500.5, -1, 60);

  for (const tick of ticks) {
    assert.equal(
      tick.to - tick.from, 502,
      'interval width must stay exactly 502 on every tick, got from=' + tick.from + ' to=' + tick.to
    );
  }
  assert.equal(countSplitFrames(ticks), 0, 'no tick should move only one of from/to');
});

// U5: characterization -- already green on master and still green after the
// fix (both formulas devolve to the same diapason/checkMinInterval-driven
// settling once a handle is pinned at its own edge). Catching mutation
// (verified): drop the "+ this.coords.p_gap_left + this.coords.p_gap_right"
// derivation so "to" collapses onto "from" -- the settled positions move
// off these values entirely (288/790 at the right edge instead of 498/1000)
// because "to" no longer carries the drag's own width into the
// checkMinInterval pin.
test('U5 dragging far past either edge settles at the width-preserving limit (#867, characterization)', (t) => {
  const { slider: right } = createSlider(t, '<input>', CONFIG);
  primeWidth(right);
  const rightTicks = fineDrag(right, 500, 1, 700);
  const rightLast = rightTicks[rightTicks.length - 1];
  assert.equal(rightLast.from, 498, 'far-right drag must settle from at 498');
  assert.equal(rightLast.to, 1000, 'far-right drag must settle to at the max, 1000');

  const { slider: left } = createSlider(t, '<input>', CONFIG);
  primeWidth(left);
  const leftTicks = fineDrag(left, 500.5, -1, 700);
  const leftLast = leftTicks[leftTicks.length - 1];
  assert.equal(leftLast.from, 0, 'far-left drag must settle from at the min, 0');
  assert.equal(leftLast.to, 502, 'far-left drag must settle to at 502');
});

// U6: characterization -- the from_fixed/to_fixed guard at the top of the
// "both" case is untouched by this fix and still short-circuits before any
// of the changed code runs, on master and after the fix alike. Catching
// mutation (verified): delete the
// `if (this.options.from_fixed || this.options.to_fixed) { break; }` guard
// -- the interval then drags freely to 360/862 instead of staying pinned.
test('U6 from_fixed and to_fixed each leave the interval unmoved through a full bar drag (#867, characterization)', (t) => {
  const { slider } = createSlider(t, '<input>', { ...CONFIG, from_fixed: true, to_fixed: true });
  primeWidth(slider);

  const ticks = fineDrag(slider, 500, 1, 60);

  for (const tick of ticks) {
    assert.equal(tick.from, 300, 'from_fixed/to_fixed must keep from at 300');
    assert.equal(tick.to, 802, 'from_fixed/to_fixed must keep to at 802');
  }
});

// U7: characterization -- proves the fix leaves an on-grid width's tick
// sequence byte-for-byte identical to master (fineDrag renders nothing, so
// onChange is not counted here; U3 covers the count). This does
// NOT hold for the two candidate mutations one might expect to catch it:
// verified that neither reverting to master's independent-snap code nor
// swapping which side gets snapped (snap "to", derive "from" instead) can
// diverge this sequence -- when the width is an exact multiple of the step,
// both handles round to the grid the same way regardless of which one is
// snapped first, which is exactly why the original bug only ever showed up
// on an off-grid width. The catching mutation actually verified against this
// test is the same one that catches U5: drop
// the "+ this.coords.p_gap_left + this.coords.p_gap_right" term so "to"
// collapses onto "from" -- the recorded sequence below is not reproduced at
// all (the first tick alone reports from=0, to=500 instead of 300, 800).
test('U7 on-grid control produces the identical tick sequence recorded from master (#867, characterization)', (t) => {
  const { slider } = createSlider(t, '<input>', { ...CONFIG, to: 800 });
  primeWidth(slider);

  const ticks = fineDrag(slider, 500, 1, 60);

  // Recorded once from the unmodified (pre-#867-fix) source and confirmed
  // identical after the fix -- an on-grid width is invariant to which side
  // gets snapped first (see comment above).
  const RECORDED_FROM_MASTER = [
    300, 300, 305, 305, 305, 305, 305, 310, 310, 310, 310, 310, 315, 315, 315,
    315, 315, 320, 320, 320, 320, 320, 325, 325, 325, 325, 325, 330, 330, 330,
    330, 335, 335, 335, 335, 335, 340, 340, 340, 340, 340, 345, 345, 345, 345,
    345, 350, 350, 350, 350, 350, 355, 355, 355, 355, 355, 360, 360, 360, 360
  ];
  assert.equal(ticks.length, RECORDED_FROM_MASTER.length);
  for (let i = 0; i < ticks.length; i++) {
    assert.equal(ticks[i].from, RECORDED_FROM_MASTER[i], 'tick ' + i + ' from mismatch');
    assert.equal(ticks[i].to - ticks[i].from, 500, 'tick ' + i + ' width must stay 500');
  }
});

// U8: successive short drags (release, re-grab, drag a little more) must
// never grow the interval. One-line bug this catches: dragging the bar off
// a "wide" (505) frame left it wide for good, since the NEXT drag's own
// setTempMinInterval() reads the width from that already-corrupted
// result.to - result.from and re-pins to it. Reds on master starting with
// the second drag: the first short drag happens to release on a clean
// (502) frame, but the second releases on a 505 frame and every drag after
// that inherits and keeps the wider pin.
test('U8 six successive short bar drags never grow the width (#867)', (t) => {
  const { slider } = createSlider(t, '<input>', CONFIG);
  primeWidth(slider);

  for (let i = 0; i < 6; i++) {
    // Click 40% into the interval's CURRENT span, matching how a real
    // second drag grabs the bar wherever it now sits after the first one
    // moved it -- not a fixed pixel unrelated to the bar's new position.
    const startX = slider.result.from + 0.4 * (slider.result.to - slider.result.from);
    const ticks = fineDrag(slider, startX, 1, 3);
    const last = ticks[ticks.length - 1];
    assert.equal(
      last.to - last.from, 502,
      'drag ' + i + ' must leave the width at 502, got from=' + last.from + ' to=' + last.to
    );
  }
});

// U9: same bug as U1, on a non-integer step. A step of 0.1 with this
// width happens not to reproduce -- floating-point rounding
// to the step's own decimal places happens to land both candidates on the
// same lattice point for that particular width -- so this uses step: 0.25
// instead, which does. Reds on master: width alternates 50.25/50.1 instead
// of staying at 50.1.
test('U9 step 0.25 keeps a non-integer width exact through a drag (#867)', (t) => {
  const { slider } = createSlider(t, '<input>', {
    type: 'double', min: 0, max: 100, step: 0.25, from: 30, to: 80.1, drag_interval: true
  });
  primeWidth(slider);

  const ticks = fineDrag(slider, 500, 1, 60);

  for (const tick of ticks) {
    assert.equal(
      +(tick.to - tick.from).toFixed(5), 50.1,
      'interval width must stay exactly 50.1, got from=' + tick.from + ' to=' + tick.to
    );
  }
});

// U10: min_interval smaller than the dragged width (so it is "satisfied"
// and never binds) must not mask the bug -- calc()'s "both" case runs the
// same independent-snap code regardless of min_interval. Reds on master for
// the same reason as U1.
test('U10 a satisfied min_interval still keeps the width at 502 through the drag (#867)', (t) => {
  const { slider } = createSlider(t, '<input>', { ...CONFIG, min_interval: 200 });
  primeWidth(slider);

  const ticks = fineDrag(slider, 500, 1, 60);

  for (const tick of ticks) {
    assert.equal(
      tick.to - tick.from, 502,
      'interval width must stay exactly 502 on every tick, got from=' + tick.from + ' to=' + tick.to
    );
  }
});
