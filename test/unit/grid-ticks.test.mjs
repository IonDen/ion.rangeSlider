import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSlider, plain } from './helpers.mjs';

// Mutation this catches: calcGridTicks() returning lefts, values or small counts other than the ones appendGrid()
// renders, or another rule name.
test('calcGridTicks() returns the even split appendGrid() renders, kept by rule 1', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 0, max: 100, grid: true, grid_num: 4 });
  const r = slider.calcGridTicks();
  assert.equal(r.rule, 1);
  assert.deepEqual(plain(r.ticks.map((k) => [k.left, k.value, k.small])), [[0, 0, 4], [25, 25, 4], [50, 50, 4], [75, 75, 4], [100, 100, 4]]);
  // Mutation this catches: `coords.big_num = r.ticks.length - 1` in appendGrid() -- cacheGridLabels() would
  // then cache one fewer label than calcGridTicks() computed ticks.
  assert.equal(slider.$cache.grid_labels.length, r.ticks.length);
});

// Mutation this catches: `coords.big_num = r.ticks.length - 1` in appendGrid() -- for a zero range (rule 0,
// exactly one tick) that reads back as 0, so cacheGridLabels() caches no label at all.
test('cacheGridLabels() caches exactly one label for a zero range', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 5, max: 5, grid: true });
  const r = slider.calcGridTicks();
  assert.equal(r.ticks.length, 1);
  assert.equal(slider.$cache.grid_labels.length, r.ticks.length);
});

// Mutation this catches: the short capped last unit given fewer small ticks than the others, or its prev moved off
// 98 (the step-7 grid's small tick at 99% moves or disappears).
test('grid_snap keeps the full small count in its short capped last unit', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 0, max: 100, step: 7, grid: true, grid_snap: true });
  const ticks = slider.calcGridTicks().ticks;
  const last = ticks[ticks.length - 1];
  assert.deepEqual(plain([ticks.length, last.left, last.small, last.prev]), [16, 100, 1, 98]);
  assert.equal(last.small, ticks[1].small);
});

// Mutation this catches: a threshold of _gridSmallMax() moved by one (each boundary is pinned on both sides).
test('_gridSmallMax() thins the small ticks at 4, 7, 14 and 28 units', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 0, max: 100 });
  assert.deepEqual([4, 5, 7, 8, 14, 15, 28, 29].map((u) => slider._gridSmallMax(u)), [4, 3, 3, 2, 2, 1, 1, 0]);
});

// ---- #906 rules. Expected values: the worked examples of #906, each checked against the rules' reference.
const mk = (t, o) => createSlider(t, '<input>', Object.assign({ min: 0, max: 100 }, o)).slider;
const rule = (t, o) => mk(t, Object.assign({ grid: true }, o)).calcGridTicks().rule;
const gridTexts = (s) => s.$cache.grid.find('.irs-grid-text').map(function () { return this.textContent; }).get();
const grid = (t, o) => gridTexts(mk(t, Object.assign({ grid: true }, o)));
const bigLefts = (s) => s.$cache.grid.find('.irs-grid-pol:not(.small)').map(function () { return this.style.left; }).get();

// Call budget: node:test cannot interrupt a synchronous loop, so count convertToValue calls instead of timing.
function withBudget(slider, max) {
  const proto = Object.getPrototypeOf(slider), real = proto.convertToValue;
  let calls = 0;
  proto.convertToValue = function () { if (++calls > max) throw new Error('convertToValue budget exceeded: ' + calls); return real.apply(this, arguments); };
  return { restore: () => { proto.convertToValue = real; }, calls: () => calls };
}
const budgetGrid = (t, o) => {                  // build with the grid off, then turn it on under a call budget
  const s = createSlider(t, '<input>', Object.assign({ grid: false }, o)).slider;
  const b = withBudget(s, 2000);
  try { s.update(Object.assign({ grid: true }, o)); } finally { b.restore(); }
  return { rule: s.calcGridTicks().rule, texts: gridTexts(s) };
};

// Mutation this catches: a wrong last index (the floor without its adjustment loops), or max_off decided by
// arithmetic instead of the converted value (0.6..9.9 step 1: v(9) rounds to 10 and clamps to 9.9, which is max).
test('_gridScaleInfo gives the last step index and whether max is off the scale', (t) => {
  assert.deepEqual(plain(mk(t, { step: 10 })._gridScaleInfo()), { s_last: 10, max_off: false });
  assert.deepEqual(plain(mk(t, { step: 30 })._gridScaleInfo()), { s_last: 3, max_off: true });
  assert.deepEqual(plain(mk(t, { min: 0.6, max: 9.9, step: 1 })._gridScaleInfo()), { s_last: 9, max_off: false });
});

// Mutation this catches: _gridOnScale trying the offsets from -2 up (a value on its own index then costs three
// conversions), or missing a value one index away.
test('_gridOnScale finds a value on its own index with one conversion', (t) => {
  const s = mk(t, { step: 10 });
  const info = s._gridScaleInfo();
  const b = withBudget(s, 100);
  let on;
  try { on = s._gridOnScale(40, info); } finally { b.restore(); }
  assert.deepEqual([on, b.calls()], [true, 1]);
  assert.equal(s._gridOnScale(45, info), false);
  assert.equal(s._gridOnScale(100, info), true);
});

// Mutation this catches: any helper that loops over steps (a timestamp range with 2.6e9 steps).
test('the scale helpers stay within a call budget on a timestamp range', (t) => {
  const s = mk(t, { min: 1262304000000, max: 1262304000000 + 2.6e9, step: 1 });
  const b = withBudget(s, 2000);
  try {
    const info = s._gridScaleInfo();
    assert.equal(info.max_off, false);
    assert.equal(s._gridOnScale(s._gridValueAt(123456789), info), true);
  } finally { b.restore(); }
  assert.equal(b.calls(), 3);
});

// Mutation this catches: rule 1 deleted (the grid falls through to "even"), or checked after rule 4 once rule 4
// exists (rule 4 would move the ticks to 33% and 67%).
test('rule 1: 0..100 with grid_num 3 is kept as the even split, ticks included', (t) => {
  const s = mk(t, { grid: true, grid_num: 3 });
  assert.equal(s.calcGridTicks().rule, 1);
  assert.deepEqual(gridTexts(s), ['0', '33', '67', '100']);
  assert.deepEqual(bigLefts(s), ['0%', '33.333333333333336%', '66.66666666666667%', '100%']);
});

// Mutation this catches: _gridOnScale trying only a value's own index (`offsets = [0]`). 251 is the value at step
// index 250, while round(convertToPercent(251) / p_step) is 251, one index away, so rule 1 would reject this grid
// (on this branch it then stays "even"; with every rule in place it becomes rule 4: 0.5, 250, 500, 750, 1 000.5).
test('rule 1: 0.5..1000.5 is kept, 251 found one step index from its rounded position', (t) => {
  const s = mk(t, { min: 0.5, max: 1000.5, step: 1, grid: true });
  assert.equal(s.calcGridTicks().rule, 1);
  assert.deepEqual(gridTexts(s), ['0.5', '251', '501', '751', '1 000.5']);
  assert.deepEqual(bigLefts(s), ['0%', '25%', '50%', '75%', '100%']);
});

// Mutation this catches: rule 1 rejecting values mode past 51 entries (the named entries are spaced unevenly,
// but every tick is within 1% of its entry).
test('rule 1: values past 51 entries stay as the even split', (t) => {
  const s = createSlider(t, '<input>', { values: Array.from({ length: 60 }, (_, i) => String(1970 + i)), grid: true }).slider;
  assert.equal(s.calcGridTicks().rule, 1);
  assert.equal(s.$cache.grid.find('.irs-grid-text').length, 51);
});

// Pins behaviour (passes before the guard exists: nothing evaluates a scale yet). Mutation this catches: the
// unsafe-scale guard deleted from calcGridTicks(). The wrapped _gridScaleInfo throws
// the moment the scale is evaluated: past 2^53 steps (1e17, step 1: p_step 1e-15) and with p_step rounded to 0
// (1e23, step 1) the grid must stay the even split without touching the scale.
test('past 2^53 steps or with p_step 0 the grid stays the even split and the scale is never evaluated', (t) => {
  for (const [max, p_step] of [[1e17, 1e-15], [1e23, 0]]) {
    const s = createSlider(t, '<input>', { min: 0, max, step: 1, grid: false }).slider;
    assert.equal(s.coords.p_step, p_step);
    const proto = Object.getPrototypeOf(s), real = proto._gridScaleInfo;
    proto._gridScaleInfo = () => { throw new Error('the scale was evaluated'); };
    try {
      s.update({ grid: true });
      const r = s.calcGridTicks();
      assert.equal(r.rule, 'even');
      assert.deepEqual(plain(r.ticks), plain(s._gridTicksEven()));
    } finally { proto._gridScaleInfo = real; }
  }
});

// Mutation this catches: any rule looping over steps. The timestamp grid is kept (rule 1).
test('a timestamp grid (about 2.6e9 steps) stays within the call budget and is kept', (t) => {
  const g = budgetGrid(t, { min: 1262304000000, max: 1262304000000 + 2.6e9, step: 1 });
  assert.equal(g.rule, 1);
  assert.equal(g.texts.length, 5);
});

// Mutation this catches: _gridStride keeping a short remainder as its own unit, or dropping s_last.
test('_gridStride folds a remainder under k / 2 and keeps s_last', (t) => {
  const s = mk(t, {});
  assert.deepEqual(plain(s._gridStride(11, 3)), [0, 3, 6, 9, 11]);   // remainder 2 is at least 1.5: its own unit
  assert.deepEqual(plain(s._gridStride(13, 3)), [0, 3, 6, 9, 13]);   // remainder 1 is under 1.5: folded
});

// Mutation this catches: rule 3 deleted (1..4 falls back to five ticks with a blanked twin, #772).
test('rule 3: 1..4 shows every step', (t) => {
  assert.equal(rule(t, { min: 1, max: 4 }), 3);
  assert.deepEqual(grid(t, { min: 1, max: 4 }), ['1', '2', '3', '4']);
  assert.deepEqual(grid(t, { min: 1, max: 4, grid_num: 50 }), ['1', '2', '3', '4']);   // 3 units, fewer than grid_num
});
// Mutation this catches: "replace" and "tail" swapped in rule 3 (0, 30, 60, 90, 100).
test('rule 3: 0..100 step 30, max replaces 90 (the remainder 10 is under half a step)', (t) => {
  assert.equal(rule(t, { min: 0, max: 100, step: 30 }), 3);
  assert.deepEqual(grid(t, { min: 0, max: 100, step: 30 }), ['0', '30', '60', '100']);
});
// Mutation this catches: the lone-tick guard in _gridTicksFrom (`idx.length > 1`) removed: max replaces min.
test('rule 3 with s_last 0: a step wider than the range gives min and max', (t) => {
  assert.equal(rule(t, { min: 0, max: 10, step: 25 }), 3);
  assert.deepEqual(grid(t, { min: 0, max: 10, step: 25 }), ['0', '10']);
});

// Mutation this catches: small counts not scaled by steps (the tail's two small ticks become four).
test('a tail unit gets proportionally fewer small ticks, in the data and on the page', (t) => {
  const s = mk(t, { step: 40, grid: true });   // s_last 2 (0, 40, 80); the remainder 20 is half a step: a tail
  const r = s.calcGridTicks();
  assert.equal(r.rule, 3);
  assert.deepEqual(plain(r.ticks.map((k) => [k.value, k.small])), [[0, 4], [40, 4], [80, 4], [100, 2]]);
  // small ticks rendered between consecutive big ticks: two regular units, then the tail
  const between = [];
  let count = null;
  s.$cache.grid.find('.irs-grid-pol').each(function () {
    if (this.className.indexOf('small') >= 0) count++;
    else { if (count !== null) between.push(count); count = 0; }
  });
  assert.deepEqual(between, [4, 4, 2]);
});

// Mutation this catches: no 50-unit guard on the tail in _gridTicksFrom (52 ticks, 51 units).
test('a tail never makes a 51st unit (rule 3, grid_num 50)', (t) => {
  assert.equal(rule(t, { min: 0, max: 101, step: 2, grid_num: 50 }), 3);
  const got = grid(t, { min: 0, max: 101, step: 2, grid_num: 50 });
  assert.equal(got.length, 51);
  assert.deepEqual(got.slice(-2), ['98', '101']);
});

// Mutation this catches: _gridPickUnits preferring fewer units on a tie, reaching past the window, or allowing
// one unit on a range of two steps.
test('_gridPickUnits: the divisor nearest t in the window, ties to more units, 0 when none', (t) => {
  const s = mk(t, {});
  assert.deepEqual([s._gridPickUnits(10, 4), s._gridPickUnits(15, 4), s._gridPickUnits(11, 4), s._gridPickUnits(5, 2), s._gridPickUnits(2600000000, 4)], [5, 5, 0, 0, 4]);
});

// Mutation this catches: rule 5 deleted (the even split, 0, 25, 50, 75, 100, comes back).
test('rule 5: 0..100 step 10 with 4 units becomes 0, 20, 40, 60, 80, 100', (t) => {
  assert.equal(rule(t, { min: 0, max: 100, step: 10 }), 5);
  assert.deepEqual(grid(t, { min: 0, max: 100, step: 10 }), ['0', '20', '40', '60', '80', '100']);
});
test('rule 5: 0..10 with 4 becomes six even ticks', (t) => {
  assert.equal(rule(t, { min: 0, max: 10 }), 5);
  assert.deepEqual(grid(t, { min: 0, max: 10 }), ['0', '2', '4', '6', '8', '10']);
});
// Mutation this catches: the fallback stride (k = max(round(s_last / t), ceil(s_last / 50))) replaced by k = 1.
test('rule 5 fallback: prime s_last 11', (t) => {
  assert.equal(rule(t, { min: 0, max: 11 }), 5);
  assert.deepEqual(grid(t, { min: 0, max: 11 }), ['0', '3', '6', '9', '11']);
});
// Mutation this catches: the window's lower bound max(2, ...) dropped (one unit: 0, 10).
test('rule 5: two steps never collapse to min and max', (t) => {
  assert.equal(rule(t, { min: 0, max: 10, step: 2, grid_num: 2 }), 5);
  assert.deepEqual(grid(t, { min: 0, max: 10, step: 2, grid_num: 2 }), ['0', '6', '10']);
});
// Mutation this catches: "replace" and "tail" swapped in rule 5 (0..105 grows a 100 tick; 0..7.6 loses its 7).
test('rule 5: max replaces the last tick under half a unit, and follows as a tail from half a unit', (t) => {
  assert.deepEqual([rule(t, { min: 0, max: 105, step: 10 }), rule(t, { min: 0, max: 7.6, step: 1 })], [5, 5]);
  assert.deepEqual(grid(t, { min: 0, max: 105, step: 10 }), ['0', '20', '40', '60', '80', '105']);
  assert.deepEqual(grid(t, { min: 0, max: 7.6, step: 1 }), ['0', '1', '2', '3', '4', '5', '6', '7', '7.6']);
});
// Mutation this catches: t not capped at 50 inside the rules (grid_num 60 then gives 39 labels).
test('grid_num above 50 is capped inside the rules and reads back unchanged', (t) => {
  const s = mk(t, { min: 0, max: 300, step: 4, grid: true, grid_num: 60 });
  assert.equal(s.calcGridTicks().rule, 5);
  assert.equal(s.$cache.grid.find('.irs-grid-text').length, 26);
  assert.equal(s.options.grid_num, 60);
});
// Mutation this catches: a rule placing ticks at the even split instead of the resting position.
test('uneven scale: ticks sit at the resting positions (0.5..10.5)', (t) => {
  const s = mk(t, { min: 0.5, max: 10.5, grid: true });
  assert.equal(s.calcGridTicks().rule, 5);
  assert.deepEqual(bigLefts(s), ['0%', '25%', '45%', '65%', '85%', '100%']);
});
// Mutation this catches: the `value === o.max ? 100 :` clause dropped from _gridTicksFrom (0..7 ends on
// convertToPercent(7), 99.99999999999999%).
test('the max tick sits at exactly 100%', (t) => {
  const s = mk(t, { min: 0, max: 7, grid: true });
  assert.equal(s.calcGridTicks().rule, 5);
  assert.deepEqual(gridTexts(s), ['0', '1', '2', '3', '4', '5', '6', '7']);
  assert.equal(bigLefts(s).slice(-1)[0], '100%');
});
// Mutation this catches: no 50-unit guard on the tail (rule 5 with grid_num 49 then ends 98, 100, 101).
test('a tail never makes a 51st unit (rule 5, grid_num 49)', (t) => {
  assert.equal(rule(t, { min: 0, max: 101, step: 2, grid_num: 49 }), 5);
  assert.deepEqual(grid(t, { min: 0, max: 101, step: 2, grid_num: 49 }).slice(-2), ['98', '101']);
  assert.equal(grid(t, { min: 0, max: 101, step: 2, grid_num: 49 }).length, 51);
});
// Mutation this catches: update() rebuilding the grid without the rules.
test('update() rebuilds the grid under the rules', (t) => {
  const s = mk(t, { grid: true });
  s.update({ step: 10, grid_num: 4 });
  assert.equal(s.calcGridTicks().rule, 5);
  assert.deepEqual(gridTexts(s), ['0', '20', '40', '60', '80', '100']);
});

// Mutation this catches: _gridStrideStep looping over the wrong window, or returning a unit count instead of steps.
test('_gridStrideStep finds an even divisor through unit counts', (t) => {
  const s = mk(t, {});
  assert.deepEqual([s._gridStrideStep(99, 50), s._gridStrideStep(1000, 50), s._gridStrideStep(142, 49), s._gridStrideStep(2600000000, 50)],
    [3, 20, 3, 52000000]);   // 142 = 2 * 71 has no divisor in [3, 6], so c itself
});

// Mutation this catches: rule 2 deleted (grid_snap keeps the even split: 50 units of 20, no step values).
test('rule 2: grid_snap past 50 steps uses whole steps with a folded remainder and max as the tail', (t) => {
  const s = mk(t, { min: 0, max: 1000, step: 7, grid: true, grid_snap: true });
  assert.equal(s.calcGridTicks().rule, 2);
  const got = gridTexts(s);
  assert.equal(got.length, 49);
  assert.deepEqual(got.slice(-3), ['966', '994', '1 000']);
});
// Mutation this catches: rule 2's one-tick-per-step branch placing ticks at the even split (10%, 20% ...).
test('rule 2: grid_snap on an uneven scale puts one tick per step at its resting position', (t) => {
  const s = mk(t, { min: 0.5, max: 10.5, step: 1, grid: true, grid_snap: true });
  assert.equal(s.calcGridTicks().rule, 2);
  assert.deepEqual(bigLefts(s), ['0%', '15%', '25%', '35%', '45%', '55%', '65%', '75%', '85%', '95%', '100%']);
});
// Mutation this catches: no 50-unit guard on the tail (grid_snap on 0..101 step 2 ends 98, 100, 101).
test('a tail never makes a 51st unit (rule 2, grid_snap)', (t) => {
  assert.equal(rule(t, { min: 0, max: 101, step: 2, grid_snap: true }), 2);
  const got = grid(t, { min: 0, max: 101, step: 2, grid_snap: true });
  assert.equal(got.length, 51);
  assert.deepEqual(got.slice(-2), ['98', '101']);
});

// Mutation this catches: _gridRoundness without its `r !== 0` guard (5 would read as 10^20) or with an absolute
// tolerance.
test('_gridRoundness: the largest power of ten that divides the number', (t) => {
  const s = mk(t, {});
  assert.deepEqual([5, 330, 250000, 0.5, 0.25].map((x) => s._gridRoundness(x)), [0, 1, 4, -1, -2]);
  assert.equal(s._gridRoundness(0), Infinity);
});

// Mutation this catches: rule 4 deleted (the site demo falls to rule 5: 1 000, 334 000, 667 000, 1 000 000).
test('rule 4: the site demo snaps to round scale points', (t) => {
  assert.equal(rule(t, { min: 1000, max: 1000000, step: 1000 }), 4);
  assert.deepEqual(grid(t, { min: 1000, max: 1000000, step: 1000 }), ['1 000', '250 000', '500 000', '750 000', '1 000 000']);
});
// Mutation this catches: the 1% bound on the rounder point dropped (30 would win over 35).
test('rule 4: evenness wins over roundness', (t) => {
  assert.equal(rule(t, { min: 0, max: 100, step: 5, grid_num: 3 }), 4);
  assert.deepEqual(grid(t, { min: 0, max: 100, step: 5, grid_num: 3 }), ['0', '35', '65', '100']);
});
// Mutation this catches: the roundness preference removed (the nearest points 335 and 665 win).
test('rule 4: a rounder point within one step and 1% wins', (t) => {
  assert.equal(rule(t, { min: 0, max: 1000, step: 5, grid_num: 3 }), 4);
  assert.deepEqual(grid(t, { min: 0, max: 1000, step: 5, grid_num: 3 }), ['0', '330', '670', '1 000']);
});
// Mutation this catches: _gridSnap without its first/last pin (0..1003 would end on 1 000).
test('rule 4 keeps max as the last tick', (t) => {
  assert.equal(rule(t, { min: 0, max: 1003, step: 10 }), 4);
  assert.deepEqual(grid(t, { min: 0, max: 1003, step: 10 }), ['0', '250', '500', '750', '1 003']);
});
// Mutation this catches: the `v === o.max ? 100 :` clause dropped from _gridSnap (7 would sit at 99.99999999999999%).
test('rule 4: the max tick sits at exactly 100%', (t) => {
  const s = mk(t, { min: 0, max: 7, step: 0.02, grid: true });
  assert.equal(s.calcGridTicks().rule, 4);
  assert.deepEqual(gridTexts(s), ['0', '1.76', '3.5', '5.26', '7']);
  assert.equal(bigLefts(s).slice(-1)[0], '100%');
});
// Mutation this catches: _gridSnap's candidate filter restored to `d > this.coords.p_step + 1e-9 || d >
// unit / 10 + 1e-9` (a tighter window than _gridCanSnap's own unit / 10 check) -- on an extreme float range
// _gridCanSnap finds every tick a candidate within unit / 10, but the old filter's p_step term (far smaller
// than unit / 10 here) rejects all of them, leaving `near` null and throwing inside the constructor so the
// slider is never built.
test('rule 4: an extreme float range builds without throwing and keeps every tick reachable', (t) => {
  for (const cfg of [
    { min: 1e9, max: 1000000000.000005, step: 1e-8, grid: true },
    { min: 1e10, max: 10000000000.00005, step: 1e-7, grid: true },
  ]) {
    const s = mk(t, cfg);
    const r = s.calcGridTicks();
    assert.equal(r.rule, 4);
    const info = s._gridScaleInfo();
    // Rule 4 moves a tick at most a tenth of a unit away from its place in the even split.
    const unit = 100 / (r.ticks.length - 1);
    r.ticks.forEach((tick, i) => {
      assert.equal(s._gridOnScale(tick.value, info), true);
      assert.ok(Math.abs(tick.left - i * unit) <= unit / 10 + 1e-9);
    });
  }
});

// Mutation this catches: any rule looping over steps, on the rule-4 path (the most conversions of any rule).
test('a huge range that reaches rule 4 stays within the call budget', (t) => {
  const g = budgetGrid(t, { min: 0, max: 10000000, step: 7, grid_num: 4 });
  assert.equal(g.rule, 4);
  assert.deepEqual(g.texts, ['0', '2 500 001', '5 000 002', '7 500 003', '10 000 000']);
});
