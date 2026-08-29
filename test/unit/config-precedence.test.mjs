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

test('data-prettify-all-values maps to prettify_all_values (#276)', (t) => {
  const { slider } = createSlider(t, '<input data-values="a,b,c" data-prettify-all-values="true">', {});
  assert.equal(slider.options.prettify_all_values, true);
});

test('data-prettify-grid and data-prettify-min-max override the JS prettify_grid/prettify_min_max options (#306)', (t) => {
  const { slider } = createSlider(t, '<input data-prettify-grid="fromData" data-prettify-min-max="fromData">', {
    min: 0, max: 100,
    prettify_grid: 'fromJs',
    prettify_min_max: 'fromJs',
  });
  assert.equal(slider.options.prettify_grid, 'fromData');
  assert.equal(slider.options.prettify_min_max, 'fromData');
});

test('the input is written on init and the instance handle is stored', (t) => {
  const { slider, $input, $ } = createSlider(t, '<input>', { min: 0, max: 10, from: 3 });
  assert.equal($input.val(), '3');
  assert.equal($input.data('from'), 3);
  assert.equal($.data($input[0], 'ionRangeSlider'), slider);
});
