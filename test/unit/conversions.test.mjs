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
