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

test('does not mutate the caller-supplied values array (#506)', (t) => {
  const values = ['12', '13', 'c'];
  const original = values.slice();

  const { slider } = createSlider(t, '<input>', { values: values });

  // The reported bug: numeric-looking strings were coerced to numbers
  // in place, so the caller's own array changed shape after init.
  assert.deepEqual(plain(values), original, 'caller array must be untouched');
  // The plugin must still see coerced values internally (values mode works).
  assert.deepEqual(plain(slider.options.values), [12, 13, 'c']);

  slider.update({ from: 1 });

  // A later update() re-runs validate(); it must not reach back into the
  // array the caller originally passed either.
  assert.deepEqual(plain(values), original, 'caller array must stay untouched after update()');
});
