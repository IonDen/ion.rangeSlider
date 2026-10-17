import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSlider } from './helpers.mjs';

// #881: readme settings table, min_interval: "Smallest interval between the handles. 0 means no
// limit. Double type only"; drag_over_limit: "Let a dragged handle push the other handle instead of
// stopping at it. [...] it still respects `min_interval`". readme note "step": "Every value is `min`
// plus a whole number of steps, rounded to the decimals of `step`. With a whole-number `step` that
// rounding produces whole numbers, so `min: 0.5, step: 1` gives 0.5, 2, 3, 4".
//
// On min 0.5, max 10.5, step 1 the values are 0.5, 2, 3 ... 10, 10.5. The min_interval clamp put a
// from handle 1 below a to handle resting on max, at 9.5, and that position reports 10: 10;10.5, a
// gap of 0.5. The mirror at min: on min 0.4, max 10.4 a to handle stopped 1 above a from handle on
// 0.4 reported 1. When the other handle rests on min or max and the value the clamp's position
// reports breaks min_interval, the handle now goes to the nearest point a drag can reach whose
// value holds it. Everything else keeps the old clamp.
//
// jsdom has no layout (see helpers.mjs), so the gesture tests stub the geometry the way the #893
// tests do: a 600 px track with 16 px handles, settled by one drawHandles() pass; drags, presses
// and clicks go through the handlers the plugin binds. Builds and update() need no geometry: the
// input holds the pair validate() leaves.

const LEFT = 37;
const RIGHT = 39;
const TRACK = 600;
const HANDLE = 16;

/** The issue's slider: min 0.5, max 10.5, step 1, min_interval 1 (values 0.5, 2, 3 ... 10, 10.5). */
const ISSUE = { type: 'double', min: 0.5, max: 10.5, step: 1, min_interval: 1 };

/** The mirror: min 0.4, max 10.4, step 1, min_interval 1 (values 0.4, 1, 2 ... 10, 10.4). */
const MIRROR = { type: 'double', min: 0.4, max: 10.4, step: 1, min_interval: 1 };

function open(t, options) {
  const finishes = [];
  const percents = [];
  const { $, $input, slider } = createSlider(t, '<input>', Object.assign({}, options, {
    onFinish: function (r) { finishes.push([r.from, r.to]); percents.push([r.from_percent, r.to_percent]); }
  }));
  slider.$cache.rs.outerWidth = function () { return TRACK; };
  slider.$cache.rs.offset = function () { return { left: 0 }; };
  ['s_single', 's_from', 's_to'].forEach(function (name) {
    if (slider.$cache[name]) slider.$cache[name].outerWidth = function () { return HANDLE; };
  });
  slider.drawHandles();
  return { $, $input, slider, finishes, percents };
}

/** The pixel under the centre of a handle that stands at `percent` of the value range. */
function pixelOf(percent) {
  return Math.round(HANDLE / 2 + percent / 100 * (TRACK - HANDLE));
}

/** A drag of one handle ("s_from", "s_to") from `from` to `to`, both in percent of the range. */
function drag(s, handle, from, to) {
  s.slider.$cache[handle].trigger(s.$.Event('mousedown', { pageX: pixelOf(from) }));
  s.slider.$cache.body.trigger(s.$.Event('mousemove', { pageX: Math.max(1, pixelOf(to)) }));
  s.slider.$cache.win.trigger(s.$.Event('mouseup'));
  s.slider.drawHandles();
  return s.$input.val();
}

/** A drag of the bar (drag_interval) from pixel `x0` to pixel `x1`. */
function dragBar(s, x0, x1) {
  s.slider.$cache.bar.trigger(s.$.Event('mousedown', { pageX: x0 }));
  s.slider.$cache.body.trigger(s.$.Event('mousemove', { pageX: x1 }));
  s.slider.drawHandles();
  s.slider.$cache.win.trigger(s.$.Event('mouseup'));
  s.slider.drawHandles();
  return s.$input.val();
}

/** One key press on the track, then the render tick that draws it. */
function press(s, which) {
  s.slider.$cache.line.trigger(s.$.Event('keydown', { which: which }));
  s.slider.drawHandles();
  return s.$input.val();
}

/** The pair validate() leaves at build time, read off the input. */
function built(t, options) {
  const { $input } = createSlider(t, '<input>', options);
  return $input.prop('value');
}

/** The pair validate() leaves after update(`changes`) on a slider built on `options`. */
function updated(t, options, changes) {
  const { $input, slider } = createSlider(t, '<input>', options);
  slider.update(changes);
  return $input.prop('value');
}

// ---- the fix ------------------------------------------------------------------------------------

// The issue without drag_over_limit: from driven to the top stops on 9, the nearest value at
// least 1 below 10.5. Before: 10;10.5. Bug caught: checkMinInterval()'s from case handing back
// `this.convertToPercent(next - o.min_interval)` without the helper: 10;10.5.
test('#881 issue slider: from dragged to the top stops on 9 below a to on max 10.5', (t) => {
  const s = open(t, Object.assign({}, ISSUE, { from: 5, to: 10.5 }));

  assert.equal(drag(s, 's_from', 45, 100), '9;10.5');
  assert.deepEqual(s.finishes, [[9, 10.5]]);
});

// The issue's own configuration, with drag_over_limit: the to handle on max cannot be pushed
// further and the dragged from handle is clamped back. Before: 10;10.5. Bug caught: pushHandle()
// returning `this.convertToPercent(current)` for the clamped-back handle without the helper.
test('#881 issue slider with drag_over_limit: from dragged to the top stops on 9 below a to on max', (t) => {
  const s = open(t, Object.assign({}, ISSUE, { drag_over_limit: true, from: 5, to: 10.5 }));

  assert.equal(drag(s, 's_from', 45, 100), '9;10.5');
  assert.deepEqual(s.finishes, [[9, 10.5]]);
});

// The right arrow from 8, on the from handle a focus on the track arms (as in the #893 tests):
// the first press reaches 9 (gap 1.5), the second is refused by the
// interval and the pair stays 9;10.5. Before: the second press gave 10;10.5. Bug caught: the
// helper's grid walk going toward the other handle instead of away from it (`down ? -1 : 1` ->
// `down ? 1 : -1`): no holding point is found and the old 10 stands.
test('#881 issue slider: the right arrow from 8 reaches 9, then stays on 9;10.5', (t) => {
  const s = open(t, Object.assign({}, ISSUE, { from: 8, to: 10.5 }));
  s.slider.$cache.line.trigger('focus');

  assert.equal(press(s, RIGHT), '9;10.5');
  assert.equal(press(s, RIGHT), '9;10.5');
  assert.equal(press(s, RIGHT), '9;10.5');
});

// A click on the track near the right end. With to fixed on max the click moves the from handle
// (chooseHandle()), and the interval stops it on 9. Before: 10;10.5. Bug caught: the end check
// dropping max (`next !== o.min && next !== o.max` -> `next !== o.min`): 10;10.5.
test('#881 issue slider: a track click near the right end moves from to 9 below a fixed to on max', (t) => {
  const s = open(t, Object.assign({}, ISSUE, { from: 8, to: 10.5, to_fixed: true }));

  s.slider.$cache.line.trigger(s.$.Event('mousedown', { pageX: 590 }));
  s.slider.drawHandles();

  assert.equal(s.$input.val(), '9;10.5');
  assert.deepEqual(s.finishes, [[9, 10.5]]);
});

// Built on 10;10.5, the to handle is preferred but already on max, so the from handle moves
// (fitIntervals()) and opens on 9. Before: 10;10.5. Bug caught: fitIntervals()'s "to stops on its
// window's edge" branch keeping `this.convertToValue(this.convertToPercent(to_hi - o.min_interval))`.
test('#881 issue slider built on 10;10.5 opens on 9;10.5', (t) => {
  assert.equal(built(t, Object.assign({}, ISSUE, { from: 10, to: 10.5 })), '9;10.5');
});

// update({from: 10}) on 5;10.5 prefers the from handle, which the interval holds on 9. Before:
// 10;10.5 (the rounded 9.5 is not below 10, so nothing moved). Bug caught: fitIntervals()'s
// preferred-from branch keeping `this.convertToValue(this.convertToPercent(to - o.min_interval))`.
test('#881 issue slider: update({from: 10}) on 5;10.5 leaves 9;10.5', (t) => {
  assert.equal(updated(t, Object.assign({}, ISSUE, { from: 5, to: 10.5 }), { from: 10 }), '9;10.5');
});

// The mirror at min: the to handle driven down onto a from on 0.4 stops on 2, the nearest value
// at least 1 above 0.4 (1 is only 0.6 above it). Before: 0.4;1. Bug caught: the end check
// dropping min (`next !== o.min && next !== o.max` -> `next !== o.max`): 0.4;1.
test('#881 mirror: to dragged to the bottom stops on 2 above a from on min 0.4', (t) => {
  const s = open(t, Object.assign({}, MIRROR, { from: 0.4, to: 5 }));

  assert.equal(drag(s, 's_to', 46, 0), '0.4;2');
});

// The mirror with drag_over_limit (pushHandle()'s clamp back of the to handle). Before: 0.4;1.
// Bug caught: the same end check dropping min: 0.4;1.
test('#881 mirror with drag_over_limit: to dragged to the bottom stops on 2', (t) => {
  const s = open(t, Object.assign({}, MIRROR, { drag_over_limit: true, from: 0.4, to: 5 }));

  assert.equal(drag(s, 's_to', 46, 0), '0.4;2');
});

// The left arrow on the to handle against a from on min 0.4 (the mirror). A press and release on
// the to handle picks it for the keyboard; the first press goes from 3 to 2 and the next ones are
// refused by the interval (1 is only 0.6 above 0.4): 0.4;2 three times. Before: the second press
// gave 0.4;1. Bug caught: checkMinInterval()'s to case returning
// `this.convertToPercent(next + o.min_interval)` without the helper: 0.4;1.
test('#881 mirror: the left arrow on to from 3 reaches 2, then stays on 0.4;2', (t) => {
  const s = open(t, Object.assign({}, MIRROR, { from: 0.4, to: 3 }));
  s.slider.$cache.s_to.trigger(s.$.Event('mousedown', { pageX: pixelOf(26) }));
  s.slider.$cache.win.trigger(s.$.Event('mouseup'));
  s.slider.drawHandles();

  assert.equal(press(s, LEFT), '0.4;2');
  assert.equal(press(s, LEFT), '0.4;2');
  assert.equal(press(s, LEFT), '0.4;2');
});

// drag_over_limit with the pushed handle fixed: to_fixed on max 10.5 (the issue's slider), the
// from handle dragged to the right end. pushHandle() does not push a fixed handle, so it clamps
// the dragged from handle back to 1 below the to handle, and that clamp back goes through the
// helper: 9;10.5. Before: 10;10.5. Bug caught: pushHandle() returning
// `this.convertToPercent(current)` for the clamped-back handle without the helper: 10;10.5.
test('#881 issue slider with drag_over_limit and to_fixed: from dragged to the top stops on 9', (t) => {
  const s = open(t, Object.assign({}, ISSUE, { drag_over_limit: true, to_fixed: true, from: 5, to: 10.5 }));

  assert.equal(drag(s, 's_from', 45, 100), '9;10.5');
  assert.deepEqual(s.finishes, [[9, 10.5]]);
});

// The mirror built on 0.4;1: the to handle is preferred and opens on 2. Before: 0.4;1. Bug
// caught: fitIntervals()'s preferred-to branch keeping
// `this.convertToValue(this.convertToPercent(from + o.min_interval))`: 0.4;1.
test('#881 mirror built on 0.4;1 opens on 0.4;2', (t) => {
  assert.equal(built(t, Object.assign({}, MIRROR, { from: 0.4, to: 1 })), '0.4;2');
});

// update({from: 0.4, min_interval: 1}) on 0.6;1 prefers the from handle, which stops on min, so
// the to handle goes the interval away from it, to 2. Before: 0.4;1. Bug caught: fitIntervals()'s
// "from stops on its window's edge" branch keeping
// `this.convertToValue(this.convertToPercent(from_lo + o.min_interval))`: 0.4;1.
test('#881 mirror: update({from: 0.4, min_interval: 1}) on 0.6;1 leaves 0.4;2', (t) => {
  const options = { type: 'double', min: 0.4, max: 10.4, step: 1, from: 0.6, to: 1 };
  assert.equal(updated(t, options, { from: 0.4, min_interval: 1 }), '0.4;2');
});

// On min 0.4, max 10.9, step 1 the grid's last point lies past 100 %, where calcWithStep() puts
// a handle on 100 % (max). The to handle driven down onto a from on 0.4 with min_interval 10
// stopped on 10.4, reported as 10 (gap 9.6). It now goes to max, at 100 %. Bug caught: the walk
// not capping its point at 100 (`Math.min(100, m * p_step)` -> `m * p_step`): to_percent
// 104.76, a handle past the end of the track.
test('#881 the walk stops on 100 %: to on a scale whose last point is past max goes to max', (t) => {
  const s = open(t, { type: 'double', min: 0.4, max: 10.9, step: 1, min_interval: 10, from: 0.4, to: 10.9 });

  assert.equal(drag(s, 's_to', 100, 0), '0.4;10.9');
  assert.deepEqual(s.percents, [[0, 100]]);
});

// ---- the guard and the cases left as they were --------------------------------------------------

// The guard keeps the old result when the nearest holding point is outside the moved handle's own
// limit. On the issue's slider that point, 9, is below from_min 9.2: 10;10.5, as before. On the
// mirror it is 2, above to_max 1.6: 0.4;1, as before. Bugs caught: the guard's own-limit checks
// dropped, `(typeof lo !== "number" || value >= lo)` -> `true` (9;10.5) and
// `(typeof hi !== "number" || value <= hi)` -> `true` (0.4;2).
test('#881 guard: a point outside the moved handle\'s own limit leaves the old clamp', (t) => {
  const top = open(t, Object.assign({}, ISSUE, { from_min: 9.2, from: 9.2, to: 10.5 }));
  assert.equal(drag(top, 's_from', 87, 100), '10;10.5');

  const bottom = open(t, Object.assign({}, MIRROR, { to_max: 1.6, from: 0.4, to: 1.6 }));
  assert.equal(drag(bottom, 's_to', 12, 0), '0.4;1');
});

// A build whose limits leave no pair (#894): on the issue's scale with min_interval 2 and to_max
// 1.8, a from of 10 cannot sit 2 below any to inside its own window. fitIntervals() then puts the
// to handle on max 10.5, and the last clamp pulls it back to 1.8, so the handles cross whatever the
// from handle does. Against a to that is outside its own to_max the old clamp stands: 9;1.8, as
// before. Bug caught: the helper's to_max/from_max exit dropped (the
// `next > (down ? o.to_max : o.from_max)` line removed from its exit test): 8;1.8. The
// to_min/from_min half of that exit is kept for symmetry; no build tried reaches it.
test('#881 a build whose limits leave no pair keeps the old clamp: 9;1.8', (t) => {
  assert.equal(built(t, Object.assign({}, ISSUE, { min_interval: 2, to_max: 1.8, from: 10, to: 10.5 })), '9;1.8');
});

// With max_interval set as well the old clamp stands, because the nearest point that holds
// min_interval can break max_interval instead. On min 0.123, max 10.123, step 1 the values are
// 0.123, 1, 2 ...; a to handle 1 to 1.4 above a from on 0.123 would need a value from 1.123 to
// 1.523, and there is none. The old result 0.123;1 breaks min_interval by 0.123; moving to 2 would
// break max_interval by 0.477. Built on 0.123;1, the slider opens there. Built on 0.123;1.5 (a pair
// that holds both; validate() never snaps it, and the first render shows 2), the to handle
// dragged fully left (also with drag_over_limit) stops on 1. Bug caught: the helper's
// max_interval exit dropped (`o.max_interval ||` removed from its exit test): 0.123;2 each time.
test('#881 with max_interval set the old clamp stands on min 0.123, max 10.123: 0.123;1', (t) => {
  const both = { type: 'double', min: 0.123, max: 10.123, step: 1, min_interval: 1, max_interval: 1.4, from: 0.123, to: 1 };
  assert.equal(built(t, both), '0.123;1');

  const plain = open(t, Object.assign({}, both, { to: 1.5 }));
  assert.equal(plain.$input.val(), '0.123;2');
  assert.equal(drag(plain, 's_to', 13.77, 0), '0.123;1');

  const pushing = open(t, Object.assign({}, both, { to: 1.5, drag_over_limit: true }));
  assert.equal(pushing.$input.val(), '0.123;2');
  assert.equal(drag(pushing, 's_to', 13.77, 0), '0.123;1');
});

// The same exit at the top end of the issue's scale: with max_interval 1.4 a pair built on
// 10;10.5 keeps the to handle on max. Moving from down to 9 would open 1.5, past max_interval, and
// max_interval then pulls the to handle in to 10: 9;10, a to that has left max. Bug caught: the
// helper's max_interval exit dropped: 9;10.
test('#881 with max_interval set the issue slider built on 10;10.5 keeps 10;10.5', (t) => {
  assert.equal(built(t, Object.assign({}, ISSUE, { max_interval: 1.4, from: 10, to: 10.5 })), '10;10.5');
});

// An end on the grid. On {0, 10, 1} with min_interval 1 the clamp lands on 9, exactly 1 below
// the to handle on 10: 9;10, as before, and it keeps the on-grid case covered. Bug caught: the
// float allowance's sign flipped (`noise = (o.max - o.min) * 1e-9` -> `(o.min - o.max) * 1e-9`),
// which reads an exact interval as broken and walks on to 8: 8;10 (the decimals half below reds
// on it too). On {0.3, 50.3, 0.1} with min_interval 20 the clamp lands on 30.3, and 50.3 - 30.3 is
// 19.999999999999996 in floats: 30.3;50.3, as before. Bug caught: the float allowance dropped
// (`noise = (o.max - o.min) * 1e-9` -> `noise = 0`): 30.2;50.3.
test('#881 an end on the grid keeps the old clamp: 9;10 and 30.3;50.3', (t) => {
  const grid = open(t, { type: 'double', min: 0, max: 10, step: 1, min_interval: 1, from: 5, to: 10 });
  assert.equal(drag(grid, 's_from', 50, 100), '9;10');

  const decimals = open(t, { type: 'double', min: 0.3, max: 50.3, step: 0.1, min_interval: 20, from: 10.3, to: 50.3 });
  assert.equal(drag(decimals, 's_from', 20, 100), '30.3;50.3');
});

// An interval off the step that the clamp's value already holds: {0, 10, 1}, min_interval 1.6,
// to on 10, the clamp's 8.4 (84 %) reports 8, which holds. The handle stays at 84 %, as before.
// Bug caught: the helper's break check dropped, so it walks anyway and moves the handle onto the
// grid point at 80 % (same value, a different position).
test('#881 a clamp whose value already holds keeps its position: 8;10 at 84 %', (t) => {
  const s = open(t, { type: 'double', min: 0, max: 10, step: 1, min_interval: 1.6, from: 2, to: 10 });

  assert.equal(drag(s, 's_from', 20, 100), '8;10');
  assert.deepEqual(s.percents, [[84, 100]]);
});

// The other handle away from min and max keeps the old clamp: {0, 10, 1}, min_interval 1.3, to
// on 8, the clamp's 6.7 reports 7: 7;8, as before. Bug caught: the end check dropped (`(next
// !== o.min && next !== o.max)` -> `false`): 6;8.
test('#881 the other handle off the ends keeps the old clamp: 7;8', (t) => {
  const s = open(t, { type: 'double', min: 0, max: 10, step: 1, min_interval: 1.3, from: 2, to: 8 });

  assert.equal(drag(s, 's_from', 20, 100), '7;8');
});

// step_from_min keeps its documented nearest-point rounding. On the issue's slider min_interval 1
// lands on a scale point (9.5) and holds anyway, so min_interval 1.3 is used here: the clamp's
// 9.2 rounds to 9.5, as before. Bug caught: the step_from_min exit dropped: 8.5;10.5.
test('#881 step_from_min keeps its nearest-point rounding: 9.5;10.5', (t) => {
  const s = open(t, Object.assign({}, ISSUE, { step_from_min: true, min_interval: 1.3, from: 5.5, to: 10.5 }));

  assert.equal(drag(s, 's_from', 50, 100), '9.5;10.5');
});

// Values mode keeps the old clamp. A whole-entry interval always holds there, so a min_interval of
// 1.5 entries is used: the clamp's index 2.5 reports 3 ("d"), as before. Bug caught: the values
// mode exit dropped: c;e.
test('#881 values mode keeps the old clamp: d;e', (t) => {
  const s = open(t, { type: 'double', values: ['a', 'b', 'c', 'd', 'e'], min_interval: 1.5, from: 1, to: 4 });

  assert.equal(drag(s, 's_from', 25, 100), 'd;e');
});

// A bar drag pins min_interval to the pair's own width for the gesture (#879 covers what it does
// at the ends). Dragged to the right end, the bar 3;5 ends on 9;10.5, as before. Bug caught: the
// temporary-interval exit dropped (`this.old_min_interval !== null` -> `false`): 8;10.5.
test('#881 a drag_interval bar drag to the right end keeps the old clamp: 9;10.5', (t) => {
  const s = open(t, Object.assign({}, ISSUE, { drag_interval: true, from: 3, to: 5 }));

  assert.equal(dragBar(s, pixelOf(30), 599), '9;10.5');
});
