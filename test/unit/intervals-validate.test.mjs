import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSlider } from './helpers.mjs';

// #885: min_interval and max_interval were applied only once a handle moved. validate()
// clamped the starting from/to and the pair update() is handed against min/max and the
// per-handle limits, but never against the two interval options, so a form could submit a
// pair that breaks them. validate() now applies them too: at build time the to handle
// moves; on update() the handle the call changed moves (from alone moves from; to alone,
// both or neither moves to); a fixed handle never moves; the moved handle lands where
// calc() would put it for that gap (the other handle's value plus or minus the interval,
// rounded onto the scale by convertToPercent()/convertToValue()), inside min and max and
// inside its own from_min/from_max (to_min/to_max). When those stop it short, the other
// handle moves the rest of the way inside its own limits; when neither can make room, a
// limit and the interval cannot both hold (#894) and the limit wins.
//
// jsdom has no layout, so calc() bails and result.from/to (and the input's value, which
// writeToInput() fills from result in callOnStart()/callOnUpdate()) are exactly the pair
// validate() leaves. That pair is what a form submits, so every test reads the input.

/** A double slider on 0..100, step 1, with the given options on top. */
const double = (options) => ({ type: 'double', min: 0, max: 100, step: 1, ...options });

/** The pair the slider holds, read the three ways a caller can see it. */
function pairOf(slider, $input) {
  return {
    from: slider.result.from,
    to: slider.result.to,
    input: $input.prop('value')
  };
}

// ------------------------------------------------------------------ at build time

// Issue #885, first example. Mutation: the build-time branch removed (applyIntervals()
// returning while update_check is empty), or the applyIntervals() call dropped from
// validate() -- the slider opens 40 apart and the input holds "30;70".
test('#885 max_interval at build: from 30, to 70, max_interval 6 opens on 30 and 36, and onStart sees it', (t) => {
  let started = null;
  const { slider, $input } = createSlider(t, '<input>', double({
    from: 30, to: 70, max_interval: 6,
    onStart: (data) => { started = { from: data.from, to: data.to }; }
  }));
  assert.deepEqual(pairOf(slider, $input), { from: 30, to: 36, input: '30;36' });
  assert.equal(slider.options.to, 36);
  assert.deepEqual(started, { from: 30, to: 36 });
});

// Issue #885, second example. Mutation: the build-time branch removed -- the input holds
// "48;52", 4 apart against a min_interval of 20.
test('#885 min_interval at build: from 48, to 52, min_interval 20 opens on 48 and 68', (t) => {
  const { slider, $input } = createSlider(t, '<input>', double({ from: 48, to: 52, min_interval: 20 }));
  assert.deepEqual(pairOf(slider, $input), { from: 48, to: 68, input: '48;68' });
});

// Values mode counts the interval in entries, as calc()'s checkMinInterval() does (min 0,
// max values.length - 1, step 1). Mutation: the build-time branch removed -- from 0 and to
// 4 stay four entries apart against a max_interval of 1.
// The input is not read here: at build time a values-mode slider fills from_value/to_value
// in calc(), which jsdom's zero width skips, so the input holds "null;null" whatever
// validate() does. intervals.spec.mjs reads it in a browser.
test('#885 values mode at build: max_interval 1 moves the to handle one entry past from', (t) => {
  const { slider } = createSlider(t, '<input>', {
    type: 'double', values: [10, 20, 30, 40, 50], from: 0, to: 4, max_interval: 1
  });
  assert.equal(slider.result.from, 0);
  assert.equal(slider.result.to, 1);
  assert.equal(slider.options.to, 1);
});

// When the to handle cannot get far enough away inside max, it stops on max and the from
// handle moves the rest of the way. Mutation: the max fallback removed (the to handle is
// only clamped to max) -- the pair opens on 90 and 100, 10 apart against 20.
test('#885 min_interval at build near max: from 90, to 95, min_interval 20 opens on 80 and 100', (t) => {
  const { slider, $input } = createSlider(t, '<input>', double({ from: 90, to: 95, min_interval: 20 }));
  assert.deepEqual(pairOf(slider, $input), { from: 80, to: 100, input: '80;100' });
});

// A fixed handle never moves, so the other one does. Two things keep it still, and either
// one alone does it here: the preferred handle passing to the other one, and the fixed
// handle's window being its own value. Mutation: both removed -- the to handle moves to 36
// although to_fixed holds it on 70.
test('#885 to_fixed at build: the from handle moves instead, from 30, to 70, max_interval 6 opens on 64 and 70', (t) => {
  const { slider, $input } = createSlider(t, '<input>', double({ from: 30, to: 70, max_interval: 6, to_fixed: true }));
  assert.deepEqual(pairOf(slider, $input), { from: 64, to: 70, input: '64;70' });
});

// With both handles fixed nothing may move, so the broken pair is left as validate() has it.
// Mutation: the both-fixed return removed -- to_fixed hands the move to the from handle,
// which goes to 64 although from_fixed holds it.
test('#885 both handles fixed: the pair is left as it is', (t) => {
  const { slider, $input } = createSlider(t, '<input>', double({ from: 30, to: 70, max_interval: 6, from_fixed: true, to_fixed: true }));
  assert.deepEqual(pairOf(slider, $input), { from: 30, to: 70, input: '30;70' });
});

// to_fixed holds the to handle on 15, and the from handle would have to go to -5, below min.
// No free handle can make room inside min and max, so the pair is left as validate() has it
// rather than half-corrected. Mutations: the fallback ignoring to_fixed -- the from handle
// goes to 0 and to_fixed's handle to 20; or a pair no handle can settle keeping the moves
// made inside the windows instead of being left as it was (the from handle stopped on min)
// -- "0;15".
test('#885 an interval no free handle can reach inside min and max leaves the pair as it is', (t) => {
  const { slider, $input } = createSlider(t, '<input>', double({ from: 10, to: 15, min_interval: 20, to_fixed: true }));
  assert.deepEqual(pairOf(slider, $input), { from: 10, to: 15, input: '10;15' });
});

// validate() lowers a min_interval wider than the value range to the value range itself
// (max - min, pinned in validate.test.mjs), so the value range always has room for it and
// the handles open on min and max, where calc() puts them on the first drag. Mutation: the
// max fallback removed -- the pair opens on 3 and 10, 7 apart against the 10 validate()
// kept.
test('#885 a min_interval wider than the value range opens the handles on min and max', (t) => {
  const { slider, $input } = createSlider(t, '<input>', { type: 'double', min: 0, max: 10, step: 1, from: 3, to: 5, min_interval: 50 });
  assert.equal(slider.options.min_interval, 10);
  assert.deepEqual(pairOf(slider, $input), { from: 0, to: 10, input: '0;10' });
});

// 0.1 + 0.2 is 0.30000000000000004 in floating point. The moved handle lands where calc()
// would put it, rounded onto the 0.1 scale. Mutation: the step rounding removed (the raw
// from + min_interval kept) -- the input holds "0.1;0.30000000000000004".
test('#885 a fractional step: the moved handle lands on the scale', (t) => {
  const { slider, $input } = createSlider(t, '<input>', { type: 'double', min: 0, max: 1, step: 0.1, from: 0.1, to: 0.15, min_interval: 0.2 });
  assert.deepEqual(pairOf(slider, $input), { from: 0.1, to: 0.3, input: '0.1;0.3' });
});

// Nothing changes for a pair that already holds both intervals, off-scale values included
// (validate() never rounds a starting value onto the scale). 50.3 - 30.3 is
// 19.999999999999996 in floating point, a hair under the min_interval of 20, and
// calc()'s value for that gap rounds to 50, below where the to handle already stands.
// Mutation: the "value > to" guard removed (always take calc()'s value) -- the to handle
// is pulled back from 50.3 to 50.
test('#885 a pair that already holds the intervals is left exactly as it is', (t) => {
  const { slider, $input } = createSlider(t, '<input>', double({ from: 30.3, to: 50.3, min_interval: 20, max_interval: 40 }));
  assert.deepEqual(pairOf(slider, $input), { from: 30.3, to: 50.3, input: '30.3;50.3' });
});

// ------------------------------- a per-handle limit stops the moved handle: the other one moves

// The moved handle stays inside its own from_min/from_max (to_min/to_max), and when that
// stops it short of the interval, the other handle moves the rest of the way inside its own
// limits. Every expected pair below is worked out from the options: the moved handle stands
// on its limit and the other one exactly the interval away.

// max_interval 6 asks the to handle to come in to 36, and to_min stops it on 40; the from
// handle then comes up to 34, which every limit allows. Mutations: the window clamp removed
// (the to handle goes to 36 inside min and max, and the closing clamp puts it back on 40), or
// the second-handle step removed -- either way the input holds "30;40", 10 apart.
test('#885 max_interval at build: to_min stops the to handle on 40 and the from handle comes up to 34', (t) => {
  const { slider, $input } = createSlider(t, '<input>', double({ from: 30, to: 70, to_min: 40, max_interval: 6 }));
  assert.deepEqual(pairOf(slider, $input), { from: 34, to: 40, input: '34;40' });
});

// min_interval 20 asks the to handle to go out to 110; to_max stops it on 96 and the from
// handle goes down to 76. Mutations: the window clamp removed (the to handle stops on max,
// the from handle goes to 80, and the closing clamp puts the to handle back on 96), or the
// second-handle step removed -- either way "80;96", 16 apart.
test('#885 min_interval at build: to_max stops the to handle on 96 and the from handle goes down to 76', (t) => {
  const { slider, $input } = createSlider(t, '<input>', double({ from: 90, to: 95, to_max: 96, min_interval: 20 }));
  assert.deepEqual(pairOf(slider, $input), { from: 76, to: 96, input: '76;96' });
});

// Well inside min and max: min_interval 30 asks the to handle to go out to 90, to_max stops
// it on 70, and the from handle goes down to 40. Mutations: the window clamp removed or the
// second-handle step removed -- "60;70", 10 apart.
test('#885 min_interval at build: to_max stops the to handle on 70 and the from handle goes down to 40', (t) => {
  const { slider, $input } = createSlider(t, '<input>', double({ from: 60, to: 65, to_max: 70, min_interval: 30 }));
  assert.deepEqual(pairOf(slider, $input), { from: 40, to: 70, input: '40;70' });
});

// update({from: 50, min_interval: 30}) moves the from handle, which the call set: the wider
// interval asks it back to 35, from_min stops it on 45, and the to handle goes out to 75.
// (The starting pair, 45 and 65, holds the first min_interval of 20.) Mutations: the window
// clamp removed or the second-handle step removed -- "45;65", 20 apart.
test('#885 update({from: 50, min_interval: 30}) with from_min 45: the from handle stops on 45 and the to handle goes out to 75', (t) => {
  const { slider, $input } = createSlider(t, '<input>', double({ from: 45, to: 65, from_min: 45, min_interval: 20 }));
  slider.update({ from: 50, min_interval: 30 });
  assert.deepEqual(pairOf(slider, $input), { from: 45, to: 75, input: '45;75' });
});

// The max_interval side of the same thing: update({from: 2, max_interval: 5}) moves the from
// handle, which the call set; max_interval asks it up to 17, from_max stops it on 12, and the
// to handle comes in to 17. Mutations: the window clamp removed or the second-handle step
// removed -- "12;22", 10 apart.
test('#885 update({from: 2, max_interval: 5}) with from_max 12: the from handle stops on 12 and the to handle comes in to 17', (t) => {
  const { slider, $input } = createSlider(t, '<input>', double({ from: 12, to: 22, from_max: 12, max_interval: 10 }));
  slider.update({ from: 2, max_interval: 5 });
  assert.deepEqual(pairOf(slider, $input), { from: 12, to: 17, input: '12;17' });
});

// ------------------------------------------- a per-handle limit the interval cannot hold with

// to_fixed holds the to handle on 70, so max_interval 4 needs the from handle at 66, and
// from_max says at most 60: the limit and the interval cannot both hold (#894). No handle can
// make room inside its own limits, so the pair is settled as if the handles had only min and
// max for limits (the from handle on 66) and the per-handle limits are applied once more at
// the end. calc()'s "base" branch, which draws the pair a slider is built or updated with,
// clamps each handle to its own limits after validate(), so the limit wins there; clamping
// in validate() too keeps the input on the pair the slider draws, also for a slider built
// hidden, where that branch does not run. Mutations: the closing per-handle clamp removed
// from applyIntervals() -- the input holds "66;70", past from_max; a pair no handle can
// settle being left untouched by the interval instead of settled as before -- "30;70"; or
// the preferred handle no longer passing from a fixed handle to the other one, so that the
// settling moves the fixed to handle in to 34 -- "30;34".
test('#885 an interval that would carry the moved handle past its own limit stops it on the limit (#894)', (t) => {
  const { slider, $input } = createSlider(t, '<input>', double({ from: 30, to: 70, from_max: 60, max_interval: 4, to_fixed: true }));
  assert.deepEqual(pairOf(slider, $input), { from: 60, to: 70, input: '60;70' });
});

// to_max stops the to handle on 70, 30 above 40, and from_min stops the from handle on 45:
// the two limits leave the pair 25 at most against a min_interval of 30 (#894). The pair is
// then left where it was before this rule read the per-handle limits: the to handle goes
// out inside max and the closing clamp brings it back to 70, and the from handle stays.
// Characterization (the same result as before the per-handle limits were read). Mutations:
// a pair no handle can settle keeping the moves made inside the windows (both handles on
// their limits) -- "45;70"; or being left untouched by the interval -- "60;65".
test('#885 min_interval that neither handle can make inside its own limits: the to handle stops on to_max and the from handle stays', (t) => {
  const { slider, $input } = createSlider(t, '<input>', double({ from: 60, to: 65, to_max: 70, from_min: 45, min_interval: 30 }));
  assert.deepEqual(pairOf(slider, $input), { from: 60, to: 70, input: '60;70' });
});

// from_fixed holds the from handle on entry 1 of five, and min_interval 4 asks the to handle
// for entry 5, past the last one. The track has no room, so the pair is left exactly as
// given. Characterization (unchanged by the per-handle limit rule). Mutation: a pair no
// handle can settle keeping the moves made inside the windows -- the to handle half-moves
// to the last entry, 4. The input is not read here: see the values-mode test above.
test('#885 values mode, from_fixed and a min_interval the track cannot hold: the pair is left as it is', (t) => {
  const { slider } = createSlider(t, '<input>', {
    type: 'double', values: [10, 20, 30, 40, 50], from: 1, to: 3, min_interval: 4, max_interval: 4, from_fixed: true
  });
  assert.deepEqual({ from: slider.result.from, to: slider.result.to }, { from: 1, to: 3 });
});

// ------------------------------------------------------------------- odd settings

// With step 0.1, from_min 0.1 and to_max 0.3 leave exactly the min_interval of 0.2 between
// them, but 0.3 - 0.2 is 0.09999999999999998 in floating point, a hair under from_min. The
// to handle stops on to_max and the from handle goes down to from_min. Mutation: the float
// slack dropped from the window comparisons -- the pair counts as one no handle can settle,
// and the input holds "0.2;0.3", 0.1 apart.
test('#885 limits exactly min_interval apart are reached despite float noise', (t) => {
  const { slider, $input } = createSlider(t, '<input>', {
    type: 'double', min: 0, max: 1, step: 0.1, from: 0.2, to: 0.25, from_min: 0.1, to_max: 0.3, min_interval: 0.2
  });
  assert.deepEqual(pairOf(slider, $input), { from: 0.1, to: 0.3, input: '0.1;0.3' });
});

// A to_min above the to_max leaves the to handle no window: validate() clamps it to to_min
// and then to to_max, 35, and no handle can make room for the max_interval of 5 inside its
// own limits, so the pair is left where validate() has it. Mutation: the no-window check
// removed -- the to handle is taken for one that can stop on to_min 52, the from handle comes
// up to 47, and the closing clamp puts the to handle back on 35: the handles cross, "47;35".
test('#885 limits that leave a handle no window: the pair stays as validate() clamps it, uncrossed', (t) => {
  const { slider, $input } = createSlider(t, '<input>', double({ from: 22, to: 88, to_min: 52, to_max: 35, max_interval: 5 }));
  assert.deepEqual(pairOf(slider, $input), { from: 22, to: 35, input: '22;35' });
});

// A min_interval of 9 above a max_interval of 3 is a self-contradictory setting: the two
// checks run in turn and the later one wins. Here the min_interval cannot be made inside
// the limits (to_max is max, 10, and from_min 2 would need 1), and the max_interval can: the
// to handle comes in to 7, 3 from the from handle. Mutation: a min_interval that gives way to
// max_interval counted as a pair no handle can settle -- the pair is settled as before the
// limits were read and clamped to "2;6", 4 apart, past the max_interval that wins.
test('#885 a min_interval above max_interval gives way: the max_interval holds', (t) => {
  const { slider, $input } = createSlider(t, '<input>', { type: 'double', min: 0, max: 10, step: 1, from: 4, to: 9, from_min: 2, to_min: 6, min_interval: 9, max_interval: 3 });
  assert.deepEqual(pairOf(slider, $input), { from: 4, to: 7, input: '4;7' });
});

// A min_interval above max_interval (min_yields) normally leaves a min_interval violation as
// it is, because the max_interval check overrides it anyway -- but from_min can cross the
// handles before applyIntervals() ever runs (validate() clamps from to from_min on its own,
// 14 here, without rechecking against to, 7), and "left as it is" would then hand the crossed
// pair straight out. The crossed gap (7 - 14 = -7) also reads as satisfying max_interval (-7
// is not greater than 5), so neither check would otherwise touch it. own_limits's guard now
// also gives up on a crossed pair, so the call falls back to the whole-range pass, which
// settles from and to inside plain min/max and uncrosses them; the closing per-handle clamp
// then brings from back up to from_min without re-crossing to.
// Mutation: the guard reverted to `own_limits && !min_yields` -- the own-limits pass keeps
// the entry pair exactly as validate() handed it, from above to, and the fallback pass never
// runs: the input holds "14;7" and from > to.
test('#885 a self-contradictory min_interval/max_interval pair never leaves the handles crossed', (t) => {
  const { slider, $input } = createSlider(t, '<input>', {
    type: 'double', min: 0, max: 20, from: 3, to: 7, from_min: 14, min_interval: 7, max_interval: 5
  });
  assert.deepEqual(pairOf(slider, $input), { from: 14, to: 18, input: '14;18' });
  assert.ok(slider.result.from <= slider.result.to, 'from must not be greater than to');
});

// A single slider has no interval. Mutation: the single-type return removed -- the to value
// a single slider keeps is moved to 50.
test('#885 a single slider is unaffected', (t) => {
  const { slider, $input } = createSlider(t, '<input>', { type: 'single', min: 0, max: 100, step: 1, from: 30, to: 32, min_interval: 20 });
  assert.equal(slider.result.from, 30);
  assert.equal(slider.result.to, 32);
  assert.equal($input.prop('value'), '30');
});

// ------------------------------------------------------------------- on update()

// Issue #885, third example: update() handed a from alone moves the from handle, which is
// the handle the call set. Mutation: the update branch moving the wrong handle (always the
// to handle) -- the pair ends on 2 and 4 ("30;50"); before the fix it ended on 2 and 3,
// one entry apart.
test('#885 values mode update({from: 2}) with min_interval 2 moves the from handle back to 1', (t) => {
  const { slider, $input } = createSlider(t, '<input>', { type: 'double', values: [10, 20, 30, 40, 50], from: 1, to: 3, min_interval: 2 });
  slider.update({ from: 2 });
  assert.deepEqual(pairOf(slider, $input), { from: 1, to: 3, input: '20;40' });
  assert.equal(slider.result.to - slider.result.from, 2);
});

// update() handed a to alone moves the to handle. Mutation: the update branch moving the
// wrong handle (the from handle whenever the call changed a value) -- the pair ends on 10
// and 30.
test('#885 update({to: 30}) with min_interval 20 moves the to handle out to 40', (t) => {
  let updated = null;
  const { slider, $input } = createSlider(t, '<input>', double({
    from: 20, to: 60, min_interval: 20,
    onUpdate: (data) => { updated = { from: data.from, to: data.to }; }
  }));
  slider.update({ to: 30 });
  assert.deepEqual(pairOf(slider, $input), { from: 20, to: 40, input: '20;40' });
  assert.deepEqual(updated, { from: 20, to: 40 });
});

// Both handed: the to handle moves. Mutation: the update branch moving the wrong handle
// (the from handle whenever from changed, whatever to did) -- the pair ends on 35 and 55.
test('#885 update({from: 50, to: 55}) with min_interval 20 moves the to handle out to 70', (t) => {
  const { slider, $input } = createSlider(t, '<input>', double({ from: 20, to: 60, min_interval: 20 }));
  slider.update({ from: 50, to: 55 });
  assert.deepEqual(pairOf(slider, $input), { from: 50, to: 70, input: '50;70' });
});

// Neither handed: an update() that only tightens the interval moves the to handle.
// Mutation: the applyIntervals() call dropped from validate() -- the pair stays 40 apart,
// "30;70".
test('#885 update({max_interval: 5}) moves the to handle in to 35', (t) => {
  const { slider, $input } = createSlider(t, '<input>', double({ from: 30, to: 70 }));
  slider.update({ max_interval: 5 });
  assert.deepEqual(pairOf(slider, $input), { from: 30, to: 35, input: '30;35' });
});

// A from handed alone that cannot move far enough away inside min stops on min, and the to
// handle moves the rest of the way. Mutation: the min fallback removed (the from handle is
// only clamped to min) -- the pair ends on 0 and 20, 20 apart against 30.
test('#885 update({from: 5, min_interval: 30}) near min: the from handle stops on 0 and the to handle moves to 30', (t) => {
  const { slider, $input } = createSlider(t, '<input>', double({ from: 0, to: 20 }));
  slider.update({ from: 5, min_interval: 30 });
  assert.deepEqual(pairOf(slider, $input), { from: 0, to: 30, input: '0;30' });
});

// from_fixed holds the from handle, so the to handle moves although the call set from.
// Two things keep a fixed handle still, and either one alone does it here: the preferred
// handle passing to the other one, and the fixed handle's window being its own value.
// Mutation: both removed -- the from handle is pulled back to 40.
test('#885 from_fixed on update({from: 50}): the to handle moves out to 70 instead', (t) => {
  const { slider, $input } = createSlider(t, '<input>', double({ from: 20, to: 60, min_interval: 20, from_fixed: true }));
  slider.update({ from: 50 });
  assert.deepEqual(pairOf(slider, $input), { from: 50, to: 70, input: '50;70' });
});
