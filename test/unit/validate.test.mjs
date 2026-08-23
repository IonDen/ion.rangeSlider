import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSlider, plain } from './helpers.mjs';

test('strings are coerced; single mode clamps from but leaves to alone', (t) => {
  const { slider } = createSlider(t, '<input>', { min: '10', max: '20', from: '5', to: '99', step: '0' });
  assert.deepEqual([slider.options.min, slider.options.max], [10, 20]);
  assert.equal(slider.options.from, 10);
  assert.equal(slider.options.to, 99);      // 2.3.1 only clamps `to` in double mode
  assert.equal(slider.options.step, 1);     // invalid step falls back to 1
});

test('double mode clamps both from and to into [min, max]', (t) => {
  const { slider } = createSlider(t, '<input>', { type: 'double', min: 10, max: 20, from: 5, to: 99 });
  assert.deepEqual([slider.options.from, slider.options.to], [10, 20]);
});

test('max below min collapses to min', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 50, max: 10 });
  assert.equal(slider.options.max, 50);
});

test('values mode rewrites min/max/step and prettifies numeric entries', (t) => {
  const { slider } = createSlider(t, '<input>', { values: ['a', 1000, 'c'] });
  const o = slider.options;
  assert.deepEqual([o.min, o.max, o.step, o.grid_snap], [0, 2, 1, true]);
  assert.deepEqual(plain(o.p_values), ['a', '1 000', 'c']);
});

test('intervals larger than the range are clamped', (t) => {
  const { slider } = createSlider(t, '<input>', { type: 'double', min: 0, max: 10, min_interval: 50, max_interval: -3 });
  assert.equal(slider.options.min_interval, 10);
  assert.equal(slider.options.max_interval, 0);
});
