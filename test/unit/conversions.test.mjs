import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSlider } from './helpers.mjs';

test('jsdom has no layout (canary for anyone adding geometry tests here)', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 0, max: 100 });
  assert.equal(slider.coords.w_rs, 0);
});

test('convertToPercent / convertToValue round-trip with a positive range', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 0, max: 200, step: 1 });
  assert.equal(slider.convertToPercent(50), 25);
  assert.equal(slider.convertToValue(25), 50);
  assert.equal(slider.convertToValue(0), 0);
  assert.equal(slider.convertToValue(100), 200);
});

test('negative min and fractional step keep the decimals of the step', (t) => {
  const { slider } = createSlider(t, '<input>', { min: -1, max: 1, step: 0.1 });
  assert.equal(slider.convertToPercent(0), 50);
  assert.equal(slider.convertToValue(50), 0);
  assert.equal(slider.convertToValue(75), 0.5);
});

test('convertToValue keeps an exponent-notation step (1e-8) interior instead of collapsing to min (#684)', (t) => {
  // Bug: (1e-8).toString() is "1e-8" (no "."), so the old
  // `this.options.step.toString().split(".")[1]` detector returns undefined,
  // convertToValue() falls into the "integer step" branch and rounds every
  // interior value with toFixed(0) -- collapsing it to 0. Mutation that
  // reproduces this exactly: revert the step site in convertToValue() to
  // `this.options.step.toString().split(".")[1]`.
  const { slider } = createSlider(t, '<input>', { min: 0, max: 6.226e-6, step: 1e-8 });
  const mid = slider.convertToValue(50);
  const near10 = slider.convertToValue(10);
  assert.ok(Math.abs(mid - 3.113e-6) <= 1e-8, `convertToValue(50) = ${mid}, expected within one step of 3.113e-6`);
  assert.ok(Math.abs(near10 - 6.226e-7) <= 1e-8, `convertToValue(10) = ${near10}, expected within one step of 6.226e-7`);
});

test('convertToValue keeps a tiny exponent-notation step (1e-7) interior and monotonic over a normal range (#684)', (t) => {
  // Same one-line bug as above, exercised on a normal-magnitude range so it is
  // clear the defect is in step-decimal detection, not the min/max magnitude.
  // Mutation: revert the step site in convertToValue() to
  // `this.options.step.toString().split(".")[1]`.
  const { slider } = createSlider(t, '<input>', { min: 0, max: 1, step: 1e-7 });
  const at12 = slider.convertToValue(12);
  assert.ok(Math.abs(at12 - 0.12) <= 1e-7, `convertToValue(12) = ${at12}`);
  const v10 = slider.convertToValue(10);
  const v20 = slider.convertToValue(20);
  const v30 = slider.convertToValue(30);
  assert.ok(v10 < v20 && v20 < v30, `expected a monotonic increase, got ${v10}, ${v20}, ${v30}`);
});

test('convertToValue at 1e21 magnitude (min/max/step with no decimal digits) stays exact and never NaNs (#684)', (t) => {
  // Characterization: 5e21 and 1e21 stringify as "5e+21"/"1e+21" -- no "." at
  // all, whether read through the old split(".") detector or the new
  // getDecimalPlaces(), so this case is green both before and after the fix
  // (confirmed by hand: reverting the min/max sites changes nothing here,
  // since neither mantissa has a decimal digit to begin with). What DOES have
  // real catching power over it: dropping the `Math.max(0, ...)` floor in
  // getDecimalPlaces() -- the step's mantissa has 0 decimals and exponent 21,
  // so the unclamped `0 - 21 = -21` reaches `number.toFixed(-21)`, which
  // throws a RangeError instead of returning a value.
  const { slider } = createSlider(t, '<input>', { min: 0, max: 5e21, step: 1e21 });
  const mid = slider.convertToValue(50);
  assert.ok(!Number.isNaN(mid), `convertToValue(50) must not be NaN, got ${mid}`);
  assert.equal(mid, 2.5e21);
});

test('convertToValue with an ordinary 2-decimal step (0.01) is byte-identical to before the fix (#684)', (t) => {
  // Regression guard: 0.01 never stringifies in exponent form, so
  // getDecimalPlaces(0.01) must return exactly 2, matching the old
  // `.split(".")[1].length`. Mutation this catches: an off-by-one undercount
  // in getDecimalPlaces() (e.g. returning `dec.length - 1`) -- convertToValue
  // would then round to 1 decimal instead of 2 and return 0.3 instead of
  // 0.33. (A `toFixed(20)`-and-strip detector was tried during analysis and
  // rejected for this class of bug -- it happens to round-trip back to the
  // same double for this particular value, so it does not catch this guard;
  // the undercount above does.)
  const { slider } = createSlider(t, '<input>', { min: 0, max: 1, step: 0.01 });
  assert.equal(slider.convertToValue(33), 0.33);
});

test('getDecimalPlaces counts decimals through exponent notation (#684)', (t) => {
  // Mutation: drop the exponent branch (always take the plain
  // `.split(".")[1]` path) -- 1e-8, 2.5e21 and 1e21 have no "." in their
  // string form, so they would all come back as 0 instead of 8/0/0 (2.5e21
  // and 1e21 already happen to be 0, which is exactly why the 1e-8 assertion
  // is the one that catches the drop).
  const { slider } = createSlider(t, '<input>', { min: 0, max: 100 });
  assert.equal(slider.getDecimalPlaces(1e-8), 8);
  assert.equal(slider.getDecimalPlaces(6.226e-6), 9);
  assert.equal(slider.getDecimalPlaces(0.000006226), 9);
  assert.equal(slider.getDecimalPlaces(2.5e21), 0);
  assert.equal(slider.getDecimalPlaces(1e21), 0);
  assert.equal(slider.getDecimalPlaces(0.01), 2);
  assert.equal(slider.getDecimalPlaces(5), 0);
  assert.equal(slider.getDecimalPlaces(-0.001), 3);
});

test('calcWithStep snaps a percent to the step grid and clamps at 100', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 0, max: 10, step: 2 }); // p_step = 20
  assert.equal(slider.calcWithStep(29), 20);
  assert.equal(slider.calcWithStep(31), 40);
  assert.equal(slider.calcWithStep(100), 100);
});

test('checkDiapason clamps to from_min/from_max, falling back to min/max', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 0, max: 100, from_min: 20, from_max: 80 });
  assert.equal(slider.checkDiapason(10, 20, 80), 20);
  assert.equal(slider.checkDiapason(90, 20, 80), 80);
  assert.equal(slider.checkDiapason(50, null, null), 50);
});

test('checkMinInterval / checkMaxInterval enforce the gap in double mode', (t) => {
  const { slider } = createSlider(t, '<input>', { type: 'double', min: 0, max: 100, from: 40, to: 60, min_interval: 10, max_interval: 30 });
  assert.equal(slider.checkMinInterval(55, 60, 'from'), 50);
  assert.equal(slider.checkMaxInterval(10, 60, 'from'), 30);
  assert.equal(slider.checkMinInterval(45, 40, 'to'), 50);
});
