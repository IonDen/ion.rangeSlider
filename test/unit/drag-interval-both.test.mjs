import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSlider } from './helpers.mjs';

// #319: with drag_interval, dragging the whole interval (calc()'s "both"
// case) fired onChange TWICE per logical step moving right -- once with only
// "to" advanced, then again a tick later with "from" catching up -- and the
// width oscillated 505/500 instead of staying pinned at 500 the whole time.
//
// Root cause: the unfixed "both" case fully resolves "from" (candidate,
// step-snap, diapason clamp, checkMinInterval) and WRITES it to
// this.coords.p_from_real before it even starts recomputing "to" -- so
// "from"'s checkMinInterval compares its fresh candidate against
// this.coords.p_to_real from the PREVIOUS tick instead of this tick's fresh
// "to" candidate. Moving right, that stale "to" lags behind, so the gap
// looks narrower than it really is and "from" gets falsely clamped back for
// one frame; "to" advances alone; the next frame "from" catches up alone.
// The fix computes both fresh candidates first, then runs both
// checkMinInterval calls against same-tick values.
//
// jsdom has no real layout (see helpers.mjs): $cache.rs.outerWidth()/
// .offset() are stubbed to a fixed 1000px-wide slider (so 1px of pointer
// movement is exactly 0.1% real percent) and coords.w_rs is primed via one
// drawHandles() call before the drag starts. That lets pointerDown()/
// pointerMove() drive the real production calc() path deterministically,
// including the drag_interval temp min_interval pin from
// setTempMinInterval() -- without a browser. The click point is off-center
// inside the bar (not the interval's midpoint) so p_gap_left != p_gap_right,
// matching how a real drag actually grabs the bar.

function primeWidth(slider) {
  slider.$cache.rs.outerWidth = function () { return 1000; };
  slider.$cache.rs.offset = function () { return { left: 0 }; };
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

test('drag_interval moving right keeps the interval exactly 500 wide on every tick (#319)', (t) => {
  const { slider } = createSlider(t, '<input>', {
    type: 'double', min: 0, max: 1000, from: 300, to: 800, step: 5, drag_interval: true
  });
  primeWidth(slider);

  // Click at 40% (off-center: the interval spans 30%-80%, its midpoint is
  // 55%), then drag right 1px ("0.1%") at a time across several step
  // widths (a step is 5px here).
  const ticks = fineDrag(slider, 400, 1, 60);

  for (const tick of ticks) {
    // One-line bug this catches: the unfixed "both" case's "from"
    // checkMinInterval call comparing against the stale this.coords.p_to_real
    // -- width oscillates 505/500 instead of staying exactly 500.
    assert.equal(
      tick.to - tick.from, 500,
      'interval width must stay exactly 500 on every tick, got from=' + tick.from + ' to=' + tick.to
    );
  }
});

test('drag_interval moving right never moves only one handle in a tick -- no split frames (#319)', (t) => {
  const { slider } = createSlider(t, '<input>', {
    type: 'double', min: 0, max: 1000, from: 300, to: 800, step: 5, drag_interval: true
  });
  primeWidth(slider);

  const ticks = fineDrag(slider, 400, 1, 60);
  const splits = countSplitFrames(ticks);

  // One-line bug this catches: same stale-checkMinInterval comparison as
  // above -- "from" gets clamped back for one frame while "to" advances
  // alone, then "from" catches up alone the next frame. On master this is
  // 24 split frames across 60 ticks (12 step boundaries x 2 split frames
  // each); the fix must bring it to 0.
  assert.equal(splits, 0, 'no tick should move only one of from/to, got ' + splits + ' split frames');
});

// Leftward mirror of the two tests above, using the SAME off-center click
// and the SAME exactly-500-wide, step-5-aligned config. Unlike the
// rightward case, this is a characterization test: it is already green on
// unfixed master. Investigation (traced every checkMinInterval call across
// a full leftward drag, and independently confirmed by applying the fix in
// isolation) showed the stale-comparison bug is direction-specific for a
// step-aligned width -- "from" is always the side checked against a stale
// reference, and moving left only ever WIDENS the gap relative to that
// stale reference (never narrows it), so checkMinInterval's "< min_interval"
// guard can never trip leftward here, on master or after the fix. Kept as a
// same-branch regression guard for the reordered "both" case, not as
// red-first evidence of a leftward bug in this configuration -- see the PR
// evidence for a config (a non-step-aligned width) where a genuine, but
// separate and out-of-scope, leftward defect does reproduce.
test('drag_interval moving left keeps the interval exactly 500 wide on every tick (#319, characterization)', (t) => {
  const { slider } = createSlider(t, '<input>', {
    type: 'double', min: 0, max: 1000, from: 300, to: 800, step: 5, drag_interval: true
  });
  primeWidth(slider);

  const ticks = fineDrag(slider, 400, -1, 60);

  for (const tick of ticks) {
    assert.equal(
      tick.to - tick.from, 500,
      'interval width must stay exactly 500 on every tick, got from=' + tick.from + ' to=' + tick.to
    );
  }
  assert.equal(countSplitFrames(ticks), 0);
});
