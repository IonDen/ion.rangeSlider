import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSlider } from './helpers.mjs';

// #891: readme settings table, onFinish: "Fires when an interaction ends: a handle is released
// (even without moving), the track (the line the handles move on) is clicked, or a key is
// pressed". from_fixed: "Fix the position of the from handle" (to_fixed the same for the to
// handle). drag_interval: "Let the user drag the whole interval by its bar."
//
// With drag_interval a press on the bar starts a drag of the whole interval, and after the
// release the slider keeps the whole interval in charge of the keyboard: the next arrow key
// moves both handles by one step. With a fixed handle the whole interval cannot move, which
// the mouse already respects: a bar drag moves nothing. In 2.3.2 the press still ran calc()
// and was reported (an onChange and an onFinish, the input unchanged); from 2.4.0 to 2.5.0
// the keyboard dropped it altogether: no handle moved, nothing was redrawn and onFinish did
// not fire, for that press and every later one, until something else on the slider was
// pressed. The fix keeps
// the move refused and reports the press: one onFinish per press, no onChange, no change or
// input event on the field, the input unchanged.
//
// jsdom has no layout (see helpers.mjs), so the geometry is stubbed the way the other drag
// and key tests stub it: a 600 px track with 16 px handles, settled by one drawHandles()
// pass. The gestures go through the handlers the plugin binds: a mousedown on the bar or on
// the track, the mouseup on the window, the focus and keydown events on the track.
// drawHandles() is the render tick the idle loop would run next; it is where a press writes
// the input and fires its callbacks.

const LEFT = 37;
const RIGHT = 39;
const TRACK = 600;
const HANDLE = 16;

/** The issue's slider: 0..100, step 1, from 30, to 70, drag_interval on. */
const ISSUE = { type: 'double', min: 0, max: 100, from: 30, to: 70, step: 1, drag_interval: true };

function open(t, extra) {
  const events = [];
  const record = (type) => function (r) { events.push({ type: type, from: r.from, to: r.to }); };
  const { $, $input, slider } = createSlider(t, '<input>', Object.assign({}, ISSUE, extra, {
    onChange: record('onChange'), onFinish: record('onFinish')
  }));
  slider.$cache.rs.outerWidth = function () { return TRACK; };
  slider.$cache.rs.offset = function () { return { left: 0 }; };
  slider.$cache.s_from.outerWidth = function () { return HANDLE; };
  slider.$cache.s_to.outerWidth = function () { return HANDLE; };
  // One real drawHandles() pass now that width exists, so the resize branch settles before
  // the first gesture.
  slider.drawHandles();
  let fieldEvents = 0;
  $input.on('change input', function () { fieldEvents++; });
  return { $, $input, slider, events, fieldEvents: () => fieldEvents };
}

/** The pixel a value of the 0..100 range sits under: the centre of a handle on it, whole pixels. */
function pixelOf(value) {
  return Math.round(HANDLE / 2 + value / 100 * (TRACK - HANDLE));
}

/** A press on the bar over `value` and its release, with no movement in between. */
function clickBar(slider, $, value) {
  slider.$cache.bar.trigger($.Event('mousedown', { pageX: pixelOf(value) }));
  slider.$cache.win.trigger($.Event('mouseup'));
}

/** A click on the bare track over `value`, then the render tick that follows it. */
function clickTrack(slider, $, value) {
  slider.$cache.line.trigger($.Event('mousedown', { pageX: pixelOf(value) }));
  slider.drawHandles();
}

/** One key press on the track, then the render tick that draws it. */
function press(slider, $, which) {
  slider.$cache.line.trigger($.Event('keydown', { which: which }));
  slider.drawHandles();
}

const types = (events) => events.map((e) => e.type);

// ---- the fix: a press after a bar click with a fixed handle ------------------------------

// The issue's own example: a click on the bar at the middle of 30..70, then the right arrow.
// The pair cannot move, and the press is reported with one onFinish.
// Bugs caught: the fixed-handle guard in moveIntervalByKey() back to a bare `return;` (the
// 2.5.0 code: the press fires nothing); the guard dropped, so the press moves the pair past
// the fixed handle to "31;71" with an onChange.
test('drag_interval with from_fixed: a key press after a click on the bar fires one onFinish and moves nothing (#891)', (t) => {
  const { $, $input, slider, events, fieldEvents } = open(t, { from_fixed: true });
  clickBar(slider, $, 50);
  assert.deepEqual(types(events), ['onFinish'], 'setup: the click on the bar reports its own onFinish');

  press(slider, $, RIGHT);

  assert.equal($input.val(), '30;70');
  assert.deepEqual(events.slice(1), [{ type: 'onFinish', from: 30, to: 70 }]);
  assert.equal(fieldEvents(), 0, 'no change or input event on the field');
});

// The keyboard is not dead after that first press: every press that follows is reported the
// same way, in both directions.
// Bug caught: the guard back to a bare `return;`: none of the three presses fires anything.
test('drag_interval with from_fixed: every key press after the bar click fires one onFinish, left and right (#891)', (t) => {
  const { $, $input, slider, events, fieldEvents } = open(t, { from_fixed: true });
  clickBar(slider, $, 50);

  press(slider, $, RIGHT);
  assert.deepEqual(types(events), ['onFinish', 'onFinish'], 'the first right-arrow press');
  press(slider, $, RIGHT);
  assert.deepEqual(types(events), ['onFinish', 'onFinish', 'onFinish'], 'the second right-arrow press');
  press(slider, $, LEFT);
  assert.deepEqual(types(events), ['onFinish', 'onFinish', 'onFinish', 'onFinish'], 'the left-arrow press');

  assert.equal($input.val(), '30;70');
  assert.equal(fieldEvents(), 0, 'no change or input event on the field');
});

// The same with the to handle fixed, the other half of the guard's condition.
// Bugs caught: the guard back to a bare `return;`; the guard narrowed to
// `if (this.options.from_fixed) {`, so this slider takes the free path and the press moves
// the pair past its fixed to handle, to "31;71".
test('drag_interval with to_fixed: every key press after the bar click fires one onFinish and moves nothing (#891)', (t) => {
  const { $, $input, slider, events, fieldEvents } = open(t, { to_fixed: true });
  clickBar(slider, $, 50);
  assert.deepEqual(types(events), ['onFinish'], 'setup: the click on the bar reports its own onFinish');

  press(slider, $, RIGHT);
  assert.equal($input.val(), '30;70', 'after the right-arrow press');
  assert.deepEqual(types(events), ['onFinish', 'onFinish'], 'the right-arrow press');
  press(slider, $, LEFT);
  assert.equal($input.val(), '30;70', 'after the left-arrow press');
  assert.deepEqual(types(events), ['onFinish', 'onFinish', 'onFinish'], 'the left-arrow press');

  assert.equal(fieldEvents(), 0, 'no change or input event on the field');
});

// ---- unchanged: the cases next to it --------------------------------------------------------
// These rows are green before and after the fix: they pin the paths the fix must leave as
// they are, and each names the one-line change that reds it.

// Without a fixed handle the same click and press move the whole pair one step, with one
// onChange and one onFinish, as the issue describes.
// Bug caught: the fixed-handle guard taken by every slider (its condition replaced by
// `true`): the free pair stays on "30;70" and fires onFinish alone.
test('drag_interval without a fixed handle: a key press after the bar click moves the pair one step (#891, unchanged)', (t) => {
  const { $, $input, slider, events, fieldEvents } = open(t, {});
  clickBar(slider, $, 50);

  press(slider, $, RIGHT);

  assert.equal($input.val(), '31;71');
  assert.deepEqual(events.slice(1), [{ type: 'onChange', from: 31, to: 71 }, { type: 'onFinish', from: 31, to: 71 }]);
  assert.equal(fieldEvents(), 2, 'one change and one input event on the field');
});

// With no click the focus arms the from handle, and a press on it is the ordinary key path:
// the fixed handle does not move, and the press fires one onFinish.
// Bugs caught: calc()'s "from" case with its from_fixed check turned off
// (`if (this.options.from_fixed) {` becomes `if (false) {`): the press moves the from handle
// to "31;70" with an onChange; moveByKey() without `this.is_key = true;` before its calc()
// call: the press fires nothing.
test('drag_interval with from_fixed and no click: a key press fires one onFinish and moves nothing (#891, unchanged)', (t) => {
  const { $, $input, slider, events, fieldEvents } = open(t, { from_fixed: true });
  slider.$cache.line.trigger('focus');

  press(slider, $, RIGHT);

  assert.equal($input.val(), '30;70');
  assert.deepEqual(events, [{ type: 'onFinish', from: 30, to: 70 }]);
  assert.equal(fieldEvents(), 0, 'no change or input event on the field');
});

// A click on the bare track (right of the bar here) is the other whole-interval path:
// calc()'s "both_one" case refuses to move a pair with a fixed handle, and a key press after
// it goes through calc() all the same, so it has always reported its onFinish.
// Bugs caught: calc()'s "both_one" case without its fixed-handle check (the
// `if (this.options.from_fixed || this.options.to_fixed) { break; }` dropped): the click
// centres the pair on 85, "60;100"; moveByKey() without `this.is_key = true;` before its
// calc() call: the press fires nothing.
test('drag_interval with from_fixed: a key press after a click on the bare track fires one onFinish and moves nothing (#891, unchanged)', (t) => {
  const { $, $input, slider, events, fieldEvents } = open(t, { from_fixed: true });
  clickTrack(slider, $, 85);
  assert.equal($input.val(), '30;70', 'setup: the click moves nothing');
  assert.deepEqual(types(events), ['onFinish'], 'setup: the click reports its own onFinish');

  press(slider, $, RIGHT);

  assert.equal($input.val(), '30;70');
  assert.deepEqual(events.slice(1), [{ type: 'onFinish', from: 30, to: 70 }]);
  assert.equal(fieldEvents(), 0, 'no change or input event on the field');
});
