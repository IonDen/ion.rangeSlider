import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSlider } from './helpers.mjs';

// #893: readme note "step": "Every value is min plus a whole number of steps, rounded to the
// decimals of step. With a whole-number step that rounding produces whole numbers, so min: 0.5,
// step: 1 gives 0.5, 2, 3, 4". readme settings table, keyboard: "Keyboard controls. Left: ←, ↓,
// A, S. Right: →, ↑, W, D". The issue states the rule held here: a press moves to the next or the
// previous value on the scale, the values a drag lands on. On that scale the slider moves on
// points half a step away from the values it reports (the point at 60 % stands for 6.5, reported
// as 7), and in 2.5.0 a key press started from the reported value's own position, so the snap
// back onto a point used up part of the press: from 7 the right arrow landed on 9, and from 9
// the left arrow moved nothing. The fix starts every press from the point that reports the
// current value.
//
// jsdom has no layout (see helpers.mjs), so the geometry is stubbed the way the other key tests
// stub it: a 600 px track with 16 px handles, settled by one drawHandles() pass. Presses and
// focus go through the handlers the plugin binds on the track; drawHandles() is the render tick
// the idle loop would run next, where a press writes the input and fires its callbacks.

const LEFT = 37;
const RIGHT = 39;
const TRACK = 600;
const HANDLE = 16;

/** The issue's scale: min 0.5, max 10.5, step 1. */
const ROUNDED = { min: 0.5, max: 10.5, step: 1 };

/** readme note "step": the values on that scale, in order. */
const ROUNDED_VALUES = [0.5, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10.5];

function open(t, options) {
  const finishes = [];
  const { $, $input, slider } = createSlider(t, '<input>', Object.assign({}, options, {
    onFinish: function (r) { finishes.push({ from: r.from, from_percent: r.from_percent }); }
  }));
  slider.$cache.rs.outerWidth = function () { return TRACK; };
  slider.$cache.rs.offset = function () { return { left: 0 }; };
  ['s_single', 's_from', 's_to'].forEach(function (name) {
    if (slider.$cache[name]) slider.$cache[name].outerWidth = function () { return HANDLE; };
  });
  // One real drawHandles() pass now that width exists, so the resize branch settles before
  // the first gesture.
  slider.drawHandles();
  return { $, $input, slider, finishes };
}

/** The pixel under the centre of a handle that stands at `percent` of the value range. */
function pixelOf(percent) {
  return Math.round(HANDLE / 2 + percent / 100 * (TRACK - HANDLE));
}

/** One key press on the track, then the render tick that draws it. */
function press(slider, $, which) {
  slider.$cache.line.trigger($.Event('keydown', { which: which }));
  slider.drawHandles();
}

/** `count` presses of one key; the input's value after each press. */
function presses(slider, $, $input, which, count) {
  const seen = [];
  for (let i = 0; i < count; i++) {
    press(slider, $, which);
    seen.push($input.val());
  }
  return seen;
}

/** A press and release on a handle at `percent` of the value range, with no movement. */
function pressHandle(slider, $, handle, percent) {
  slider.$cache[handle].trigger($.Event('mousedown', { pageX: pixelOf(percent) }));
  slider.$cache.win.trigger($.Event('mouseup'));
  slider.drawHandles();
}

/** A drag of the single handle from `from` to `to`, both in percent of the value range. */
function dragSingle(slider, $, from, to) {
  slider.$cache.s_single.trigger($.Event('mousedown', { pageX: pixelOf(from) }));
  slider.$cache.body.trigger($.Event('mousemove', { pageX: pixelOf(to) }));
  slider.$cache.win.trigger($.Event('mouseup'));
  slider.drawHandles();
}

/**
 * The values a drag lands on, read off the slider itself: a slider built on `options` with its
 * single handle on min, one press on the handle and a move across the whole track one pixel at a
 * time, reading the input after each move. `values` lists them in the order the drag meets them;
 * `at[x]` is the value under pixel x.
 */
function dragAcross(t, options) {
  const { $, $input, slider } = open(t, Object.assign({}, options, { from: options.min }));
  const values = [];
  const at = [];
  slider.$cache.s_single.trigger($.Event('mousedown', { pageX: pixelOf(0) }));
  for (let x = 1; x <= TRACK; x++) {   // from 1: the plugin reads a pageX of 0 as missing
    slider.$cache.body.trigger($.Event('mousemove', { pageX: x }));
    slider.drawHandles();
    at[x] = $input.val();
    if (values[values.length - 1] !== at[x]) values.push(at[x]);
  }
  slider.$cache.win.trigger($.Event('mouseup'));
  return { values, at };
}

/** min 0.5, max 13.5, step 1: a scale where float noise makes two grid points report one value. */
const NOISY = { min: 0.5, max: 13.5, step: 1 };

const strings = (list) => list.map(String);

// ---- the fix: one press reaches the next or the previous value --------------------------------

// The issue's two presses. Bug caught: moveByKey() adding the step to the handle's own position
// again (the snap removed): from 7 the press lands on 9.
test('min 0.5, step 1: from 7 the right arrow gives 8 (#893)', (t) => {
  const { $, $input, slider } = open(t, Object.assign({}, ROUNDED, { from: 7 }));
  slider.$cache.line.trigger('focus');

  press(slider, $, RIGHT);

  assert.equal($input.val(), '8');
});

// Bugs caught: the snap removed (the press stays on 9); the snap picking the point above the
// handle instead of the one that reports its value (90 % reports 10, so the press lands back on
// 9 again).
test('min 0.5, step 1: from 9 the left arrow gives 8 (#893)', (t) => {
  const { $, $input, slider } = open(t, Object.assign({}, ROUNDED, { from: 9 }));
  slider.$cache.line.trigger('focus');

  press(slider, $, LEFT);

  assert.equal($input.val(), '8');
});

// A slider built on a value places its handle from that value (calc()'s "base" case, the path
// init, resize and update() take), the same off-grid position a press leaves, so the very first
// press is affected too. Bugs caught: the snap removed, or the snap picking the point above the
// handle instead of the one that reports its value: either way the first press lands on 7.
test('min 0.5, step 1: a slider built on from 5 gives 6 on its first right arrow (#893)', (t) => {
  const { $, $input, slider } = open(t, Object.assign({}, ROUNDED, { from: 5 }));
  slider.$cache.line.trigger('focus');

  press(slider, $, RIGHT);

  assert.equal($input.val(), '6');
});

// The whole scale, one press at a time: every value once on the way up and once on the way
// down, and no press stays put before an end. The extra press at each end stays on it.
// Bugs caught: the snap removed (the walk up goes 2, 4, 6, 8, 9, 10.5); the snap picking the
// point above the handle instead of the one that reports its value (the walk up goes 2, 4, 6, 8,
// 10, 10.5).
test('min 0.5, step 1: single type walks every value up from 0.5 to 10.5 and back, one press each (#893)', (t) => {
  const { $, $input, slider } = open(t, Object.assign({}, ROUNDED, { from: 0.5 }));
  slider.$cache.line.trigger('focus');

  assert.deepEqual(presses(slider, $, $input, RIGHT, 11), strings(ROUNDED_VALUES.slice(1).concat([10.5])));
  assert.deepEqual(presses(slider, $, $input, LEFT, 11), strings(ROUNDED_VALUES.slice(0, -1).reverse().concat([0.5])));
});

// The same walk for the to handle of a double slider, selected by a press on it at max (a
// point on the grid, so the press itself moves nothing). The walk down ends on the from handle
// at 0.5.
// Bugs caught: the snap removed from moveByKey()'s "to" case alone, or the snap reading
// result.from instead of result.to there (the handle then never stands at 0.5's position, so
// every press takes the old path): either way the walk down goes 10, 9 and stays on 9.
test('min 0.5, step 1: the to handle walks every value down from 10.5 to 0.5 and back, one press each (#893)', (t) => {
  const { $, $input, slider } = open(t, Object.assign({}, ROUNDED, { type: 'double', from: 0.5, to: 10.5 }));
  pressHandle(slider, $, 's_to', 100);
  assert.equal($input.val(), '0.5;10.5', 'setup: the press on the to handle moves nothing');

  const down = presses(slider, $, $input, LEFT, 11);
  assert.deepEqual(down, ROUNDED_VALUES.slice(0, -1).reverse().concat([0.5]).map((to) => `0.5;${to}`));
  const up = presses(slider, $, $input, RIGHT, 11);
  assert.deepEqual(up, ROUNDED_VALUES.slice(1).concat([10.5]).map((to) => `0.5;${to}`));
});

// The issue's two presses on the from handle of a double slider, which a focus on the track
// arms. Bugs caught: moveByKey()'s "from" case back to `p_real = this.coords.p_from_real + step;`
// (the press from 7 lands on 9, the press from 9 stays on 9); the snap there reading result.to
// instead of result.from (the handle never stands at 10.5's position, so the press takes the
// old path, with the same outcome).
test('min 0.5, step 1: the from handle moves from 7 to 8 with the right arrow and from 9 to 8 with the left (#893)', (t) => {
  const right = open(t, Object.assign({}, ROUNDED, { type: 'double', from: 7, to: 10.5 }));
  right.slider.$cache.line.trigger('focus');
  press(right.slider, right.$, RIGHT);
  assert.equal(right.$input.val(), '8;10.5');

  const left = open(t, Object.assign({}, ROUNDED, { type: 'double', from: 9, to: 10.5 }));
  left.slider.$cache.line.trigger('focus');
  press(left.slider, left.$, LEFT);
  assert.equal(left.$input.val(), '8;10.5');
});

// The walk of the to handle above, for the from handle: up from 0.5 to the to handle at 10.5,
// then back down to 0.5, one value per press. Bugs caught: the same two as the row above; with
// the "from" case back to the handle's own position the walk up goes 2, 4, 6, 8, 9, 10.5.
test('min 0.5, step 1: the from handle walks every value up from 0.5 to 10.5 and back, one press each (#893)', (t) => {
  const { $, $input, slider } = open(t, Object.assign({}, ROUNDED, { type: 'double', from: 0.5, to: 10.5 }));
  slider.$cache.line.trigger('focus');

  const up = presses(slider, $, $input, RIGHT, 11);
  assert.deepEqual(up, ROUNDED_VALUES.slice(1).concat([10.5]).map((from) => `${from};10.5`));
  const down = presses(slider, $, $input, LEFT, 11);
  assert.deepEqual(down, ROUNDED_VALUES.slice(0, -1).reverse().concat([0.5]).map((from) => `${from};10.5`));
});

// readme note "step": min 0.5 with step 1 and a max of 10 gives 0.5, 2, 3 ... 9 and max itself,
// 10, so the last step is half a step long. Every value sits a hair away from the half-way
// point between two grid points here, on whichever side float noise puts it, and one step from
// the value's own position can land on the far side of the next half-way point.
// Bug caught: the press kept on the handle's own position whenever the grid point nearest to it
// reports its value (gridPercentOf()'s quarter-step check replaced by
// `found === this.calcWithStep(p_real)`): the walk up goes 2, 4, 5, 7, 8, 10.
test('min 0.5, max 10, step 1: single type walks every value up and back, one press each (#893)', (t) => {
  const { $, $input, slider } = open(t, { min: 0.5, max: 10, step: 1, from: 0.5 });
  slider.$cache.line.trigger('focus');

  assert.deepEqual(presses(slider, $, $input, RIGHT, 10), strings([2, 3, 4, 5, 6, 7, 8, 9, 10, 10]));
  assert.deepEqual(presses(slider, $, $input, LEFT, 10), strings([9, 8, 7, 6, 5, 4, 3, 2, 0.5, 0.5]));
});

// Float noise can make two neighbouring grid points report the same value: on min 0.5, max 13.5,
// step 1 the points at 2 and 3 steps both report 3, those at 5 and 6 steps both report 6 and
// those at 11 and 12 steps both report 12, and no point reports 4 or 8 (a matter of
// convertToValue(), not of the keyboard). A press from such a value has to start from the point
// further along its direction, or its one step lands on the other point that reports the same
// value and moves nothing. The rule is the one the issue states: a press moves to the next or the
// previous of the values a drag lands on, so the expected walk is that drag scale, read off a drag
// across the whole track. The setup checks the float premise through the same drag (the 2-step
// and the 3-step points both report 3), so a change to the rounding fails here instead of
// silently testing a different scale.
// One press differs from the drag scale: the point 13 steps up sits at 99.99999999999999 %, a hair
// under max at 100 %, and reports 13, and the first press down from max lands on 12. This is an
// older gap, not fixed here; this test pins today's result and is meant to change when that gap
// is fixed.
// Bugs caught: gridPercentOf() taking the first point that reports the value instead of the one
// furthest along the press (`found === null &&` added to its match check), or trying its
// candidates against the direction of the press (`m = right ? m0 - j : m0 + j`): either way the
// walk up stops on 3; gridPercentOf() trying only the point p_real rounds to and the next one
// along the press (`for (j = 0; j <= 1; j++)`): the walk up skips 10 (2, 3, 5, 6, 7, 9, 11, ...),
// with every press still moving.
test('min 0.5, max 13.5, step 1: where two grid points report one value, the walk up visits every value a drag lands on (#893)', (t) => {
  const { values: scale, at } = dragAcross(t, NOISY);
  assert.deepEqual([at[pixelOf(200 / 13)], at[pixelOf(300 / 13)]], ['3', '3'], 'setup: a drag to the 2-step point and one to the 3-step point both land on 3');
  assert.deepEqual(scale.slice(-2), ['13', '13.5'], 'setup: the drag lands on 13 just before max');

  const { $, $input, slider } = open(t, Object.assign({}, NOISY, { from: 0.5 }));
  slider.$cache.line.trigger('focus');

  assert.deepEqual(presses(slider, $, $input, RIGHT, 14), scale.slice(1).concat(['13.5', '13.5', '13.5']));
  // From max the first press skips 13 (see above).
  const down = scale.slice(0, -1).reverse().filter((v) => v !== '13');
  assert.deepEqual(presses(slider, $, $input, LEFT, 14), down.concat(['0.5', '0.5', '0.5', '0.5']));
});

// validate() keeps a start value that no point reports: on the same scale a drag never lands on
// 4, yet a slider built on from: 4 shows 4. With no point to start from, the press takes one step
// from 4's own position, which lands on the neighbouring values of the drag scale: 5 to the right,
// 3 to the left. Bug caught: gridPercentOf() without its check for a value no point reports
// (`found === null || ` deleted from its final check): the press starts from the bottom of the
// track instead, and the right arrow lands on 2.
test('min 0.5, max 13.5, step 1: from 4, a value no point reports, the arrows give 5 and 3 (#893)', (t) => {
  const { values: scale } = dragAcross(t, NOISY);
  assert.ok(!scale.includes('4'), `setup: no drag lands on 4: ${scale.join(', ')}`);

  const right = open(t, Object.assign({}, NOISY, { from: 4 }));
  assert.equal(right.$input.val(), '4', 'setup: the slider is built on 4');
  right.slider.$cache.line.trigger('focus');
  press(right.slider, right.$, RIGHT);
  assert.equal(right.$input.val(), '5');

  const left = open(t, Object.assign({}, NOISY, { from: 4 }));
  left.slider.$cache.line.trigger('focus');
  press(left.slider, left.$, LEFT);
  assert.equal(left.$input.val(), '3');
});

// The press moves the value, not the slider's geometry: the handle stays where its value sits,
// (8 - 0.5) / (10.5 - 0.5) = 75 % of the range, the position a drag onto 8 gives it and where
// the grid tick for 8 is drawn. Bug caught: the snap applied to the drag path instead (calc()
// moving the handle onto the point that reports its value after every move, and the key press
// left as it was): the press lands on 9 at 80 %.
test('min 0.5, step 1: a press from 7 reports 8 at its own position, 75 % (#893)', (t) => {
  const { $, slider, finishes } = open(t, Object.assign({}, ROUNDED, { from: 7 }));
  slider.$cache.line.trigger('focus');

  press(slider, $, RIGHT);

  assert.deepEqual(finishes, [{ from: 8, from_percent: 75 }]);
});

// drag_interval: a click on the track hands the keyboard to the whole interval, and each press
// moves the pair by one step around its middle. The middle was taken from the two values' own
// positions, half a step off the grid on this scale, and calc() snaps each end back onto it, so
// a press skipped values or moved nothing just as a single handle did. The click at 30 % leaves
// the pair 3;5 where it is. Only presses in the middle of the track: at either end calc() keeps
// the width the pair has between its two values' positions, which this change does not touch.
// Bug caught: moveByKey()'s "both_one" case taking the middle from result.from_percent and
// result.to_percent again: the first press lands on 5;7.
test('min 0.5, step 1, drag_interval: after a track click each press moves the interval one value (#893)', (t) => {
  const { $, $input, slider } = open(t, Object.assign({}, ROUNDED, { type: 'double', from: 3, to: 5, drag_interval: true }));
  slider.$cache.line.trigger($.Event('mousedown', { pageX: pixelOf(30) }));
  slider.drawHandles();
  assert.equal($input.val(), '3;5', 'setup: the click leaves the pair where it is');

  assert.deepEqual(presses(slider, $, $input, RIGHT, 4), ['4;6', '5;7', '6;8', '7;9']);
  assert.deepEqual(presses(slider, $, $input, LEFT, 4), ['6;8', '5;7', '4;6', '3;5']);
});

// The same interval key path on a pair that reports one value, on the scale where two points
// report 3 (see above): a pair on 3;3 and a track click at 3 that leaves it there. The middle of
// the pair has to start from the point further along the press, or its step lands on the other
// point that reports 3 and the pair stays. Each arrow moves the pair to the next value of the
// drag scale: 5;5 to the right, 2;2 to the left. Bug caught: gridPercentOf() trying its
// candidates against the direction of the press (`m = right ? m0 - j : m0 + j`): the press stays
// on 3;3.
test('min 0.5, max 13.5, step 1, drag_interval: a pair on 3;3 moves on the first press after a track click (#893)', (t) => {
  const options = Object.assign({}, NOISY, { type: 'double', from: 3, to: 3, drag_interval: true });

  const right = open(t, options);
  right.slider.$cache.line.trigger(right.$.Event('mousedown', { pageX: pixelOf(250 / 13) }));
  right.slider.drawHandles();
  assert.equal(right.$input.val(), '3;3', 'setup: the click at 3 leaves the pair on 3;3');
  press(right.slider, right.$, RIGHT);
  assert.equal(right.$input.val(), '5;5');

  const left = open(t, options);
  left.slider.$cache.line.trigger(left.$.Event('mousedown', { pageX: pixelOf(250 / 13) }));
  left.slider.drawHandles();
  assert.equal(left.$input.val(), '3;3', 'setup: the click at 3 leaves the pair on 3;3');
  press(left.slider, left.$, LEFT);
  assert.equal(left.$input.val(), '2;2');
});

// ---- unchanged: the drag, the values on the grid, the end of the track -------------------------
// These rows are green before and after the fix: the fix stays in the key path, and a press goes
// exactly where it went before on a scale whose values sit on the points the slider moves on,
// from a value within a quarter step of its point, from max when no point up to the end of the
// track reports it, and where a value does not survive the trip to its position and back. Each
// names the one-line change that reds it.

// A drag on the issue's scale lands on the value under the pointer, 7 for a pointer at 62 %, and
// reports it at its own position, 65 %. Bug caught: the snap applied to the drag path instead
// (calc() moving the handle onto the point that reports its value after every move), which
// reports from_percent 60.
test('min 0.5, step 1: a drag still lands on 7 at 65 % (#893, unchanged)', (t) => {
  const { $, slider, finishes } = open(t, Object.assign({}, ROUNDED, { from: 0.5 }));

  dragSingle(slider, $, 0, 62);

  assert.deepEqual(finishes, [{ from: 7, from_percent: 65 }]);
});

// min 0, step 1: every value is a whole number and sits on the grid; the walk is the same one
// press per value it was before the fix. Bug caught: the snap accepting any neighbouring point
// instead of the one that reports the value (its value check replaced by `true`), so each right
// arrow skips a value: 2, 4, 6, 8, 10.
test('min 0, step 1: the walk from 0 to 10 and back is unchanged (#893, unchanged)', (t) => {
  const { $, $input, slider } = open(t, { min: 0, max: 10, step: 1, from: 0 });
  slider.$cache.line.trigger('focus');

  assert.deepEqual(presses(slider, $, $input, RIGHT, 11), strings([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10]));
  assert.deepEqual(presses(slider, $, $input, LEFT, 11), strings([9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 0]));
});

// min 0 with a max half a step past the last whole step: the values 0, 1, 2, 3 sit on the grid
// and max, 3.5, sits at 99.99999999999999 % after float noise, a hair under the end of the track
// (the setup checks it in the onFinish of the press that reaches it). The press from max is one
// step of 1 to 2.5, half-way between 2 and 3, and lands on 2, skipping 3. This is an older gap,
// not fixed here; this test pins today's result and is meant to change when that gap is fixed.
// Bug caught: gridPercentOf() without its check for a value no point reports (`found === null || `
// deleted from its final check): no point up to 100 % reports max here, and the right arrow at
// max lands on 1.
test('min 0, max 3.5, step 1: the walk from 0 to 3.5 and back is unchanged (#893, unchanged)', (t) => {
  const { $, $input, slider, finishes } = open(t, { min: 0, max: 3.5, step: 1, from: 0 });
  slider.$cache.line.trigger('focus');

  assert.deepEqual(presses(slider, $, $input, RIGHT, 5), strings([1, 2, 3, 3.5, 3.5]));
  assert.deepEqual(finishes[3], { from: 3.5, from_percent: 99.99999999999999 }, 'setup: max sits a hair under 100 %');
  assert.deepEqual(presses(slider, $, $input, LEFT, 4), strings([2, 1, 0, 0]));
});

// min 0 with max 28.5, half a step past the last whole step: the values are 0, 1, ..., 28 and
// max, 28.5, which float noise puts at 100.00000000000001 %, a hair past the end of the track
// (the setup checks it in the onFinish of a right arrow at max, which stays there). The two grid
// points past 28 lie beyond the end of the track, and clamped onto it both report 28.5. The left
// arrow from max moves to the previous value, 28, as it did before this change. Bug caught:
// gridPercentOf() matching a point that reaches the end of the track only by clamping (`|| m *
// p_step > 100` deleted from its skip): the press starts from the end of the track and lands on
// 27.
test('min 0, max 28.5, step 1: from max the left arrow gives 28 (#893, unchanged)', (t) => {
  const { $, $input, slider, finishes } = open(t, { min: 0, max: 28.5, step: 1, from: 28.5 });
  slider.$cache.line.trigger('focus');
  press(slider, $, RIGHT);
  assert.deepEqual(finishes, [{ from: 28.5, from_percent: 100.00000000000001 }], 'setup: max sits a hair past 100 %');

  press(slider, $, LEFT);

  assert.equal($input.val(), '28');
});

// A value within a quarter step of the only point that reports it starts its press from its own
// position, as before this change. On min -1.45, max 1.95, step 0.2 the point 16 steps up stands
// for 1.75 and reports 1.8, and a drag lands on 1.8 and then on 1.9, which the point 17 steps up
// reports from a hair under the end of the track. From 1.8 the right arrow moves to that next
// value, 1.9. Bug caught: gridPercentOf() without its quarter-step check (`|| (count === 1 &&
// Math.abs(p_real - found) < p_step / 4)` deleted from its final check): the press stays on 1.8.
test('min -1.45, max 1.95, step 0.2: from 1.8 the right arrow gives 1.9 (#893, unchanged)', (t) => {
  const scale = { min: -1.45, max: 1.95, step: 0.2 };
  const { values } = dragAcross(t, scale);
  assert.equal(values[values.indexOf('1.8') + 1], '1.9', `setup: a drag lands on 1.9 after 1.8: ${values.join(', ')}`);

  const { $, $input, slider } = open(t, Object.assign({}, scale, { from: 1.8 }));
  assert.equal($input.val(), '1.8', 'setup: the slider is built on 1.8');
  slider.$cache.line.trigger('focus');

  press(slider, $, RIGHT);

  assert.equal($input.val(), '1.9');
});

// readme note "step_from_min": "min: 0.5 with step: 1 gives 0.5, 1.5, 2.5 and so on": the values
// sit on the grid, so the walk is the one it was before the fix. Bug caught: the snap's value
// check replaced by `true`, as above: 2.5, 4.5, 6.5.
test('min 0.5, step 1, step_from_min: the walk from 0.5 to 10.5 and back is unchanged (#893, unchanged)', (t) => {
  const { $, $input, slider } = open(t, Object.assign({}, ROUNDED, { from: 0.5, step_from_min: true }));
  slider.$cache.line.trigger('focus');

  assert.deepEqual(presses(slider, $, $input, RIGHT, 11), strings([1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5, 10.5, 10.5]));
  assert.deepEqual(presses(slider, $, $input, LEFT, 11), strings([9.5, 8.5, 7.5, 6.5, 5.5, 4.5, 3.5, 2.5, 1.5, 0.5, 0.5]));
});

// A negative min with a fractional step (min -0.05, step 0.1) is a different case: a value does
// not survive the trip to its position and back (0.2 sits at 83 %, where 0.25 is reported), so
// the handle does not stand where its value sits and there is no point to start a press from.
// The key path there stays the one it was, oddities included: the literals are what the
// unchanged code gives: a drag lands on -0.05, 0.2 and 0.25 (the grid also labels 0.1, which no
// drag reaches); the first left arrow from max stays on 0.25, the next ones stick on 0.2 and
// never reach min. This is an older gap, not fixed here; this test pins today's result and is meant to
// change when that gap is fixed. Bug caught: gridPercentOf() without its check that the handle
// stands at its value's own position: once the first left press has left 0.25 at 83 %, the next
// ones start from max again and every left press stays on 0.25.
test('min -0.05, step 0.1: a scale whose values do not survive the trip to their position keeps its key path (#893, unchanged)', (t) => {
  const { $, $input, slider } = open(t, { min: -0.05, max: 0.25, step: 0.1, from: -0.05 });
  slider.$cache.line.trigger('focus');

  assert.deepEqual(presses(slider, $, $input, RIGHT, 3), strings([0.2, 0.25, 0.25]));
  assert.deepEqual(presses(slider, $, $input, LEFT, 3), strings([0.25, 0.2, 0.2]));
});
