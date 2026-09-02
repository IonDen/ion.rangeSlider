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
// this.coords.p_to_real from the PREVIOUS pointer-move tick instead of this
// tick's fresh "to" candidate. Moving right, that stale "to" lags behind, so
// the gap looks narrower than it really is and "from" gets falsely clamped
// back for one tick; "to" advances alone; the next tick "from" catches up
// alone. The fix computes both fresh candidates first, then runs both
// checkMinInterval calls against same-tick values.
//
// jsdom has no real layout (see helpers.mjs): $cache.rs.outerWidth()/
// .offset() are stubbed to a fixed 600px-wide slider (so 1px of pointer
// movement is 100/600 real percent) and $cache.s_from/s_to.outerWidth() are
// stubbed to a 16px handle -- both mirror the browser fixture's flat-skin
// geometry (test/browser/drag-interval.spec.mjs), giving a non-zero
// p_handle (~2.667%). That matters: with p_handle 0 (an earlier, unstubbed
// version of this file) the real and fake percent spaces are numerically
// identical, which hid a second bug (see the "against-the-drag" tests
// below) that only shows up once real and fake percent actually differ.
// coords.w_rs is primed via one drawHandles() call before the drag starts.
// That lets pointerDown()/pointerMove() drive the real production calc()
// path deterministically, including the drag_interval temp min_interval pin
// from setTempMinInterval() -- without a browser. The click point is
// off-center inside the bar (not the interval's midpoint) so
// p_gap_left != p_gap_right, matching how a real drag actually grabs the
// bar.

function primeWidth(slider) {
  slider.$cache.rs.outerWidth = function () { return 600; };
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

test('drag_interval moving right keeps the interval exactly 500 wide on every tick (#319)', (t) => {
  const { slider } = createSlider(t, '<input>', {
    type: 'double', min: 0, max: 1000, from: 300, to: 800, step: 5, drag_interval: true
  });
  primeWidth(slider);

  // Click at 400/600 (~67%: off-center, the interval spans 30%-80%, its
  // midpoint is 55%), then drag right 1px at a time across several step
  // widths (a step is 3px at this width: p_step is 0.5% and 0.5% of 600px
  // is 3px).
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
  // above -- "from" gets clamped back for one tick while "to" advances
  // alone, then "from" catches up alone the next tick.
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
// red-first evidence of a leftward bug in this configuration -- a
// non-step-aligned width does show a genuine, separate leftward defect,
// out of scope here and tracked in a separate issue.
//
// Catching mutation (verified): make "to"'s checkMinInterval compare
// against a stale, pre-tick "from" (the value coords.p_from_real held
// BEFORE this tick's own assignment) instead of the fresh, same-tick one --
// the mirror of the original bug applied to the other handle. That reds
// this exact test.
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

// #319 regression: the reorder above computes both fresh
// candidates and runs both checkMinInterval calls, but checkMinInterval can
// itself push a handle's value past its OWN diapason bound to hold the
// pinned min_interval gap open (it only knows about the gap, not about
// from_min/from_max/to_min/to_max). Once "from" hit its own from_min floor
// (or the default min), its checkDiapason-clamped value got OVERWRITTEN by
// checkMinInterval("from") using "to"'s independently-drifting fresh
// candidate -- with no re-clamp afterward, so coords.p_from_real (and, once
// convertToValue's own clamp couldn't hide it any longer, result.from) kept
// sliding past from_min the further left the drag continued. The right
// edge (to/to_max) was not exposed the same way, because "to" is checked
// SECOND, against an already-diapason-valid "from" -- see U7 below.

test('drag_interval moving left past from_min keeps from pinned at the floor, width preserved (#319)', (t) => {
  const { slider } = createSlider(t, '<input>', {
    type: 'double', min: 0, max: 1000, from: 300, to: 800, step: 5, drag_interval: true, from_min: 100
  });
  primeWidth(slider);

  // Drag well past the point where "from" first reaches its from_min floor
  // (100), so the regression has room to keep sliding.
  const ticks = fineDrag(slider, 400, -1, 350);

  for (const tick of ticks) {
    // One-line bug this catches: dropping the checkDiapason(from_min,
    // from_max) re-clamp that runs right after checkMinInterval("from") --
    // result.from reaches 0 (ignores from_min entirely) instead of pinning
    // at 100.
    assert.ok(
      tick.from >= 100,
      'from must never drop below from_min (100), got from=' + tick.from
    );
    assert.equal(tick.to - tick.from, 500, 'width must stay pinned at 500, got from=' + tick.from + ' to=' + tick.to);
  }

  const last = ticks[ticks.length - 1];
  assert.equal(last.from, 100, 'from must settle exactly at from_min once overdragged');
  assert.equal(last.to, 600, 'to must settle at from + width (100 + 500)');
});

test('drag_interval moving left past the default floor never reports a negative handle position (#319)', (t) => {
  const { slider } = createSlider(t, '<input>', {
    type: 'double', min: 0, max: 1000, from: 300, to: 800, step: 5, drag_interval: true
  });
  primeWidth(slider);

  const ticks = [];
  slider.pointerDown('both', { pageX: 400, preventDefault: function () {} });
  for (let i = 1; i <= 350; i++) {
    slider.pointerMove({ pageX: 400 - i });
    ticks.push({ from: slider.result.from, to: slider.result.to, p_from_real: slider.coords.p_from_real });
  }
  slider.pointerUp({});

  for (const tick of ticks) {
    // result.from alone cannot catch this: convertToValue() independently
    // clamps to options.min (0) regardless of what coords.p_from_real holds,
    // so result.from reads 0 on the reorder-only version of this fix even
    // while the handle's own real percent has gone negative underneath it.
    // coords.p_from_real is the real percent the handle's CSS `left` is
    // derived from (see drawHandles()/convertToFakePercent) -- reading it
    // here is the only way to observe the visible detach a
    // page-observable proxy (the input value, from_percent on a callback)
    // can't reveal in jsdom, since jsdom never renders layout (see
    // helpers.mjs). The browser test (drag-interval.spec.mjs) asserts the
    // page-observable equivalent: the handle element's inline `left` style.
    assert.ok(
      tick.p_from_real >= 0,
      'the from handle\'s real percent must never go negative, got ' + tick.p_from_real + ' (from=' + tick.from + ')'
    );
    assert.ok(tick.from >= 0, 'from must never drop below the default floor (0), got from=' + tick.from);
  }
});

// Right-edge mirror, characterization: "to" was never exposed to the same
// unclamped-overwrite bug as "from" (it is checked SECOND, against an
// already from_min/from_max-valid "from"), so this is green both on the
// reorder-only version of this fix and after the from_min fix above. Kept
// as a regression guard.
// Catching mutation (verified): drop the checkDiapason(to_min, to_max)
// call that runs on "to"'s fresh candidate BEFORE either checkMinInterval
// call -- width drops to 495 (from=405, to=900) instead of staying pinned
// at 500 once the drag has gone well past to_max.
test('drag_interval moving right past to_max keeps to pinned at the ceiling, width preserved (#319, characterization)', (t) => {
  const { slider } = createSlider(t, '<input>', {
    type: 'double', min: 0, max: 1000, from: 300, to: 800, step: 5, drag_interval: true, to_max: 900
  });
  primeWidth(slider);

  const ticks = fineDrag(slider, 400, 1, 350);

  for (const tick of ticks) {
    assert.ok(tick.to <= 900, 'to must never exceed to_max (900), got to=' + tick.to);
    assert.equal(tick.to - tick.from, 500, 'width must stay pinned at 500, got from=' + tick.from + ' to=' + tick.to);
  }

  const last = ticks[ticks.length - 1];
  assert.equal(last.to, 900, 'to must settle exactly at to_max once overdragged');
  assert.equal(last.from, 400, 'from must settle at to - width (900 - 500)');
});

// #319 regression, second half: changeLevel's "both" case
// captured p_gap_left/p_gap_right in FAKE percent (p_pointer - p_from_fake),
// but calc()'s "both" case adds them onto convertToRealPercent(handle_x) --
// REAL percent. With p_handle 0 (an earlier version of this file) those two
// spaces are numerically identical, so the mismatch was invisible; with a
// real, non-zero handle width (primeWidth stubs 16px on a 600px slider) the
// resolved "to" candidate sits (p_handle/100)*(to-from) below its true
// value, and the very first pointer-move tick of a drag can resolve to a
// position BEHIND where the drag started -- a visible step backward before
// the drag has even gone one step forward. The reorder fix above didn't
// cause this (the mixed-space gaps predate #319 entirely and were flagged
// as a separate, out-of-scope issue in the original brief), but the
// pre-#319 stale-checkMinInterval bug happened to mask it: the stale
// reference kept pulling the resolved position back up to the previous,
// unaffected tick's value. Once the reorder fixed the staleness, the
// masked mismatch became directly observable. Fixed by capturing the gaps
// in real percent in changeLevel's "both" case instead.

test('drag_interval moving right never resolves a tick behind where the drag started (#319)', (t) => {
  const { slider } = createSlider(t, '<input>', {
    type: 'double', min: 0, max: 1000, from: 300, to: 800, step: 5, drag_interval: true
  });
  primeWidth(slider);

  // This test needs a click point close enough to "from" (small
  // p_gap_left, large p_gap_right) that the mismatch's constant offset
  // (see the comment above) is big enough to cross a step boundary --
  // 240/600 (40%) is; 400/600 (~67%, used by the other tests in this file)
  // is not: the offset shrinks as the grab point moves right, and at
  // 400/600 it is under half a step.
  const ticks = fineDrag(slider, 240, 1, 60);

  // One-line bug this catches: capturing p_gap_left/p_gap_right in FAKE
  // percent (this.coords.p_pointer - this.coords.p_from_fake) instead of
  // real percent -- the first tick resolves to from=290 (behind the 300
  // start, and more than one step off) instead of from=300.
  assert.ok(ticks[0].from >= 300, 'the first tick must not move from backward, got from=' + ticks[0].from);
  assert.ok(
    Math.abs(ticks[0].from - 300) <= 5,
    'the first tick must land within one step of the drag start, got from=' + ticks[0].from
  );

  let prevFrom = 300;
  for (const tick of ticks) {
    assert.ok(
      tick.from >= prevFrom,
      'from must be monotonically non-decreasing while dragging right, got ' + tick.from + ' after ' + prevFrom
    );
    prevFrom = tick.from;
  }

  // The geometrically ideal endpoint for this exact drag (60px right from
  // this click point) is from=405 -- verified against the fixed source.
  // Within one step tolerates legitimate step-boundary rounding without
  // masking the ~2-step drift this bug produces.
  const last = ticks[ticks.length - 1];
  assert.ok(
    Math.abs(last.from - 405) <= 5,
    'the drag must end within one step of the geometrically ideal position, got from=' + last.from
  );
});

test('drag_interval moving left never resolves a tick ahead of where the drag started (#319)', (t) => {
  const { slider } = createSlider(t, '<input>', {
    type: 'double', min: 0, max: 1000, from: 300, to: 800, step: 5, drag_interval: true
  });
  primeWidth(slider);

  const ticks = fineDrag(slider, 240, -1, 60);

  // One-line bug this catches: same fake/real percent mismatch as above --
  // the first tick resolves to from=290, a 2-step jump on 1px of movement,
  // instead of landing within one step of the 300 start. "from <= 300"
  // alone would not catch this (290 still satisfies it for a leftward
  // drag), which is why the geometrically-ideal-within-one-step check
  // below is the one that actually reds on the reorder-only version of
  // this fix.
  assert.ok(ticks[0].from <= 300, 'the first tick must not move from ahead of the drag, got from=' + ticks[0].from);
  assert.ok(
    Math.abs(ticks[0].from - 300) <= 5,
    'the first tick must land within one step of the drag start, got from=' + ticks[0].from
  );

  let prevFrom = 300;
  for (const tick of ticks) {
    assert.ok(
      tick.from <= prevFrom,
      'from must be monotonically non-increasing while dragging left, got ' + tick.from + ' after ' + prevFrom
    );
    prevFrom = tick.from;
  }

  // The geometrically ideal endpoint for this exact drag (60px left from
  // this click point) is from=195 -- verified against the fixed source.
  const last = ticks[ticks.length - 1];
  assert.ok(
    Math.abs(last.from - 195) <= 5,
    'the drag must end within one step of the geometrically ideal position, got from=' + last.from
  );
});
