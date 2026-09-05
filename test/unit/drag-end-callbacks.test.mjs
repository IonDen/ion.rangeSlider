import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSlider } from './helpers.mjs';

// #851: pointerUp() redraws through drawHandles() with force_redraw set, and
// the callback condition guarding onChange never checked whether from/to
// actually changed -- only whether is_resize/is_update/is_start/is_finish
// was set (is_finish is never assigned true anywhere in the file, so that
// part of the guard is dead code). A drag whose last pointer-move tick was
// already drawn -- the normal way most mouse/touch drags end -- therefore
// fired onChange a second time with the exact values it had already
// reported, immediately followed by onFinish. The fix computes
// `changed = old_from !== result.from || old_to !== result.to` once, before
// old_from/old_to are overwritten, and gates onChange on it (reusing the
// same comparison the change/input DOM-event trigger already made).
//
// jsdom has no real layout (see helpers.mjs): $cache.rs.outerWidth()/
// .offset() are stubbed to a fixed 600px-wide slider and the handle
// elements' outerWidth() to 16px, mirroring the browser fixture's flat-skin
// geometry (test/browser/drag-interval.spec.mjs) and the pattern used by
// test/unit/drag-interval-both.test.mjs's primeWidth(). Clicking exactly on
// the handle's own current pixel position keeps coords.p_gap at 0 for the
// whole gesture, so a target real-percent value V converts to a pointer
// pixel of convertToFakePercent(V) / 100 * 600 with no extra offset to track
// -- letting each test drive the real pointerDown/pointerMove/pointerUp
// production code to an exact, predictable value.

function primeSingle(slider) {
  slider.$cache.rs.outerWidth = function () { return 600; };
  slider.$cache.rs.offset = function () { return { left: 0 }; };
  slider.$cache.s_single.outerWidth = function () { return 16; };
  // One real drawHandles() pass so the resize-detection branch settles
  // coords.w_rs_old/force_redraw/is_resize *before* the drag starts --
  // otherwise this first pass firing during the drag itself would land
  // inside the callback-gated block with is_resize still true and mask
  // what we're testing.
  slider.drawHandles();
}

function primeDouble(slider) {
  slider.$cache.rs.outerWidth = function () { return 600; };
  slider.$cache.rs.offset = function () { return { left: 0 }; };
  slider.$cache.s_from.outerWidth = function () { return 16; };
  slider.$cache.s_to.outerWidth = function () { return 16; };
  slider.drawHandles();
}

/** pixel offset that lands calc() exactly on real-percent value `real` */
function pxForReal(slider, real) {
  return slider.convertToFakePercent(real) / 100 * 600;
}

function recorder() {
  var events = [];
  return {
    events: events,
    onChange: function (r) { events.push({ type: 'onChange', from: r.from, to: r.to }); },
    onFinish: function (r) { events.push({ type: 'onFinish', from: r.from, to: r.to }); }
  };
}

test('a motionless release after the last move has already drawn reports the value once, not twice (#851)', (t) => {
  var rec = recorder();
  var { slider } = createSlider(t, '<input>', {
    type: 'single', min: 0, max: 100, from: 30, step: 1,
    onChange: rec.onChange, onFinish: rec.onFinish
  });
  primeSingle(slider);

  var startX = slider.coords.p_single_fake / 100 * 600; // click exactly on the handle, p_gap stays 0
  slider.pointerDown('single', { pageX: startX, preventDefault: function () {} });

  var targetX = pxForReal(slider, 40);
  slider.pointerMove({ pageX: targetX });
  assert.equal(slider.result.from, 40, 'setup: the move must land exactly on 40 before the draw runs');

  // Let the pending draw run, as a real animation frame would while the
  // button is still held -- this is the tick that reports the move.
  slider.drawHandles();

  // Release motionless: no further pointerMove.
  slider.pointerUp({});

  // One-line bug this catches: dropping `changed &&` from the onChange
  // condition in drawHandles() -- pointerUp's forced redraw re-fires
  // onChange(40) a second time even though nothing changed since the draw
  // above already reported it.
  assert.deepEqual(rec.events, [
    { type: 'onChange', from: 40, to: 100 },
    { type: 'onFinish', from: 40, to: 100 }
  ]);
});

// Characterization: green both before and after the #851 fix (the unfixed
// condition already fires onChange here for the same reason the fix does --
// neither is_resize/is_update/is_start/is_finish are set, and the fix's
// `changed` is true too, since this is the pending draw's first look at the
// moved value). Kept as a guard against the *wrong* fix for #851 -- setting
// is_finish = true in pointerUp instead of gating on `changed` -- which the
// brief for #851 explicitly rejects because it would suppress this onChange
// instead of the duplicate one.
test('a motionless release with no prior draw still reports the final value once (#851, characterization)', (t) => {
  var rec = recorder();
  var { slider } = createSlider(t, '<input>', {
    type: 'single', min: 0, max: 100, from: 30, step: 1,
    onChange: rec.onChange, onFinish: rec.onFinish
  });
  primeSingle(slider);

  var startX = slider.coords.p_single_fake / 100 * 600;
  slider.pointerDown('single', { pageX: startX, preventDefault: function () {} });

  var targetX = pxForReal(slider, 40);
  slider.pointerMove({ pageX: targetX });
  assert.equal(slider.result.from, 40, 'setup: the move must land exactly on 40');

  // Release immediately -- no drawHandles() call between the move and the
  // release, so pointerUp's own forced redraw is the ONLY draw that ever
  // sees this value change.
  slider.pointerUp({});

  // Mutation this catches (verified below, not on the committed source):
  // setting this.is_finish = true in pointerUp before updateScene() --
  // that would suppress this draw's onChange entirely (is_finish blocks the
  // condition), losing the final value change instead of just the
  // duplicate.
  assert.deepEqual(rec.events, [
    { type: 'onChange', from: 40, to: 100 },
    { type: 'onFinish', from: 40, to: 100 }
  ]);
});

test('dragging "to" by two steps with a draw between them reports each distinct pair once, then one onFinish (#851)', (t) => {
  var rec = recorder();
  var { slider } = createSlider(t, '<input>', {
    type: 'double', min: 0, max: 100, from: 20, to: 80, step: 1,
    onChange: rec.onChange, onFinish: rec.onFinish
  });
  primeDouble(slider);

  var startX = slider.coords.p_to_fake / 100 * 600; // click exactly on the "to" handle
  slider.pointerDown('to', { pageX: startX, preventDefault: function () {} });

  slider.pointerMove({ pageX: pxForReal(slider, 81) });
  assert.equal(slider.result.to, 81, 'setup: first move must land exactly on to=81');
  slider.drawHandles();

  slider.pointerMove({ pageX: pxForReal(slider, 82) });
  assert.equal(slider.result.to, 82, 'setup: second move must land exactly on to=82');
  slider.drawHandles();

  // Release motionless: no further pointerMove.
  slider.pointerUp({});

  // One-line bug this catches: same as the single-handle test above -- the
  // forced redraw in pointerUp reports a THIRD onChange for the (20, 82)
  // pair the second draw above already delivered.
  assert.deepEqual(rec.events, [
    { type: 'onChange', from: 20, to: 81 },
    { type: 'onChange', from: 20, to: 82 },
    { type: 'onFinish', from: 20, to: 82 }
  ]);
});

test('an arrow key press at the range edge (no movement) fires onFinish only, no onChange (#851)', (t) => {
  var rec = recorder();
  var { slider } = createSlider(t, '<input>', {
    type: 'single', min: 0, max: 100, from: 0, step: 1,
    onChange: rec.onChange, onFinish: rec.onFinish
  });
  primeSingle(slider);

  // Arms keyboard state exactly like a real focus does (#742) -- must not
  // itself run calc() or fire callbacks.
  slider.pointerFocus({});
  assert.equal(rec.events.length, 0, 'setup: focus alone must not record anything');

  slider.key('keyboard', { which: 37, preventDefault: function () {} }); // ArrowLeft
  assert.equal(slider.is_key, true, 'setup: the key press must arm is_key for the pending draw');

  // Let the pending draw run, as the idle render loop would.
  slider.drawHandles();

  assert.equal(slider.result.from, 0, 'setup: from must stay at the min, unmoved');

  // One-line bug this catches: dropping `changed &&` from the onChange
  // condition -- a no-op key press at the edge still reports onChange for a
  // value that never moved, before onFinish.
  assert.deepEqual(rec.events, [
    { type: 'onFinish', from: 0, to: 100 }
  ]);
});

// The commonest real-world trigger of pointerUp's forced redraw: a press and
// release on a handle with no movement at all (a tap on a touch screen).
// pointerDown() never runs calc(), so pointerUp's redraw is the first pass
// through the callback block since the press.
test('pressing and releasing a handle without moving it fires onFinish only (#851)', (t) => {
  var rec = recorder();
  var { slider } = createSlider(t, '<input>', {
    type: 'single', min: 0, max: 100, from: 30, step: 1,
    onChange: rec.onChange, onFinish: rec.onFinish
  });
  primeSingle(slider);

  var startX = slider.coords.p_single_fake / 100 * 600; // exactly on the handle
  slider.pointerDown('single', { pageX: startX, preventDefault: function () {} });
  slider.pointerUp({});

  assert.equal(slider.result.from, 30, 'setup: the value must not move');

  // One-line bug this catches: dropping `changed &&` from the onChange
  // condition -- 2.4.1 reported onChange(30) for a value that never moved,
  // then onFinish.
  assert.deepEqual(rec.events, [
    { type: 'onFinish', from: 30, to: 100 }
  ]);
});
