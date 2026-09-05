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

// #681: for every other option an empty data-* attribute means "not set" and
// the strip loop below deletes it, but for prettify_separator the empty
// string IS the meaningful value (it disables the thousands separator).
// jsdom has no layout (see helpers.mjs), so result.from_pretty is never
// computed here -- _prettify() is the pure formatting method the existing
// prettify.test.mjs suite already exercises directly for the same reason.
// Mutation: remove the `prop !== "prettify_separator"` exception from the
// data-* strip loop.
test('data-prettify-separator="" disables the thousands separator (#681)', (t) => {
  const { slider } = createSlider(t, '<input data-prettify-separator="">', { min: 0, max: 10000000, from: 1234567 });
  assert.equal(slider.options.prettify_separator, '');
  assert.equal(slider._prettify(1234567), '1234567');
});

// #681: data-* attributes override JS options (see the first test in this
// file); the empty attribute must win over a non-empty JS option instead of
// being silently dropped in its favor. Mutation: same as above.
test('data-prettify-separator="" overrides a non-empty JS prettify_separator option (#681)', (t) => {
  const { slider } = createSlider(t, '<input data-prettify-separator="">', {
    min: 0, max: 10000000, from: 1234567, prettify_separator: ','
  });
  assert.equal(slider.options.prettify_separator, '');
  assert.equal(slider._prettify(1234567), '1234567');
});

// #681 guard: the exception is scoped to prettify_separator alone -- every
// other empty data-* attribute must still be stripped ("" still means "not
// set" for them). extra_classes and postfix both already default to "", so
// widening the exception to every key (dropping the `prop !==
// "prettify_separator"` test) would NOT turn either of those red -- said
// honestly rather than glossed over. grid_num defaults to 4, a non-""
// value, so it is the one attribute here that actually distinguishes a
// correctly-scoped exception from a widened one: an un-stripped "" would
// override the default 4, and validate() coerces that leftover "" to 0.
test('the prettify_separator exception does not leak into other empty data-* attributes (#681)', (t) => {
  const { slider } = createSlider(t, '<input data-extra-classes="" data-postfix="" data-grid-num="">', { min: 0, max: 100 });
  assert.equal(slider.options.extra_classes, '');   // stripped -- matches the untouched default
  assert.equal(slider.options.postfix, '');         // stripped -- matches the untouched default
  assert.equal(slider.options.grid_num, 4);         // stripped -- the default, not 0
});

// #681 sanity: the strip predicate must stay a strict `=== ""` check, not a
// falsiness check. jQuery's .data() reads a numeric-looking attribute value
// as a number, so data-prettify-separator="0" arrives as the number 0, never
// as the string "". This already passes on 2.4.1 (a pin, unrelated to the
// prettify_separator exception); proven live by mutating the strip loop's
// `=== undefined` check to `!config_from_data[prop]`, which treats the
// falsy number 0 as "unset" and deletes it, reverting the separator to the
// default " ".
test('data-prettify-separator="0" keeps the numeric-zero separator (#681)', (t) => {
  const { slider } = createSlider(t, '<input data-prettify-separator="0">', { min: 0, max: 10000000, from: 1234567 });
  assert.equal(slider.options.prettify_separator, 0);
  assert.equal(slider._prettify(1234567), '102340567');
});
