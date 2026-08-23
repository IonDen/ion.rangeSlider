import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSlider, plain } from './helpers.mjs';

test('input value sets from/to, JS options override it, data-* override JS options', (t) => {
  const { slider } = createSlider(t, '<input value="25;42" data-max="500">', { type: 'double', min: 0, max: 100, to: 60 });
  assert.equal(slider.options.from, 25);    // from the value attribute
  assert.equal(slider.options.to, 60);      // JS option beats the value attribute
  assert.equal(slider.options.max, 500);    // data-max beats the JS option
});

test('data-values is split on commas; an input value is looked up in the JS values array', (t) => {
  const { slider } = createSlider(t, '<input value="b" data-values="a,b,c">', { values: ['x'] });
  assert.deepEqual(plain(slider.options.values), ['a', 'b', 'c']);
  assert.equal(slider.options.from, 0);     // 'b' is not in ['x'] → index -1 → clamped to min
});

test('the input is written on init and the instance handle is stored', (t) => {
  const { slider, $input, $ } = createSlider(t, '<input>', { min: 0, max: 10, from: 3 });
  assert.equal($input.val(), '3');
  assert.equal($input.data('from'), 3);
  assert.equal($.data($input[0], 'ionRangeSlider'), slider);
});
