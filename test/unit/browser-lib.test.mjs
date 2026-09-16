import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onScale, scaleDecimals, nearestOnScale, scalePoint } from '../browser/lib/scale.mjs';
import { builtinPrettify, decorate, expectedLabel, expectedMerged, valuesEntry } from '../browser/lib/format.mjs';

// #877: unit tests for the browser suite's readme-derived oracles. The oracle for
// every expected value below is a readme sentence, quoted in the test comment; the
// plugin's own arithmetic is deliberately not consulted, so a value these modules
// and js/ion.rangeSlider.js disagree on is a finding, not a test to relax.

// ---------------------------------------------------------------- scale.mjs

// readme note "step": "Every value is min plus a whole number of steps, rounded to
// the decimals of step. With a whole-number step that rounding produces whole
// numbers, so min: 0.5, step: 1 gives 0.5, 2, 3, 4".
// Bug caught: dropping the toFixed() rounding (1.5 would become a scale point).
test('onScale: a whole step from a fractional min lands on whole numbers after min itself', () => {
  const cfg = { min: 0.5, max: 10.5, step: 1 };
  assert.equal(onScale(0.5, cfg), true);
  assert.equal(onScale(2, cfg), true);
  assert.equal(onScale(3, cfg), true);
  assert.equal(onScale(4, cfg), true);
  assert.equal(onScale(1.5, cfg), false);
  // The readme's sequence starts 0.5, 2 -- the rounding of min itself never
  // produces a scale point, so 1 is off the scale.
  // Bug caught: rounding min (k = 0) instead of keeping it, which would admit 1.
  assert.equal(onScale(1, cfg), false);
});

// readme note "step": "min: 1.2, step: 4 gives 1.2, 5, 9, 13".
// Bug caught: rounding k * step instead of min + k * step (4, 5.2 or 9.2 would pass).
test('onScale: min 1.2 with step 4 gives 1.2, 5, 9, 13', () => {
  const cfg = { min: 1.2, max: 20, step: 4 };
  for (const v of [1.2, 5, 9, 13]) assert.equal(onScale(v, cfg), true, `${v} should be on the scale`);
  for (const v of [4, 5.2, 9.2, 6]) assert.equal(onScale(v, cfg), false, `${v} should be off the scale`);
});

// readme note "step": "a negative min keeps its decimals instead (min: -0.5,
// step: 1 gives -0.5, 0.5, 1.5)".
// Bug caught: rounding to the step's decimals for a negative min (0.5 would fail, 1 would pass).
test('onScale: a negative min keeps its own decimals (-0.5, 0.5, 1.5)', () => {
  const cfg = { min: -0.5, max: 10, step: 1 };
  assert.equal(onScale(-0.5, cfg), true);
  assert.equal(onScale(0.5, cfg), true);
  assert.equal(onScale(1.5, cfg), true);
  assert.equal(onScale(1, cfg), false);
});

// Same readme sentence, with the decimals far from zero so float noise in
// min + k * step is visible: -39.9 + 1 is -38.900000000000006.
// Bug caught: comparing min + k * step without rounding it first.
test('onScale: a negative min with more decimals stays exact (-39.9, -38.9)', () => {
  const cfg = { min: -39.9, max: 39.9, step: 1 };
  assert.equal(onScale(-38.9, cfg), true);
  assert.equal(onScale(-38, cfg), false);
});

// readme note "step": "With a fractional step the values keep the decimals of step
// (min: 0.3, step: 0.25 gives 0.3, 0.55, 0.8)".
// Bug caught: rounding to the decimals of min rather than of step.
test('onScale: a fractional step keeps the step decimals (0.3, 0.55, 0.8)', () => {
  const cfg = { min: 0.3, max: 1.3, step: 0.25 };
  assert.equal(onScale(0.3, cfg), true);
  assert.equal(onScale(0.55, cfg), true);
  assert.equal(onScale(0.8, cfg), true);
  assert.equal(onScale(0.5, cfg), false);
});

// readme note "step_from_min": "min: 0.5 with step: 1 gives 0.5, 1.5, 2.5 and so on
// instead of 0.5, 2, 3".
// Bug caught: ignoring step_from_min, which would accept 2 and reject 1.5.
test('onScale: step_from_min keeps min plus whole steps (0.5, 1.5, 2.5)', () => {
  const cfg = { min: 0.5, max: 10.5, step: 1, step_from_min: true };
  assert.equal(onScale(1.5, cfg), true);
  assert.equal(onScale(2.5, cfg), true);
  assert.equal(onScale(2, cfg), false);
});

// Same rule with two decimals in min: 0.01 plus whole steps is 0.01, 1.01, 2.01.
// Bug caught: taking the decimals from step alone under step_from_min (1.01 would
// round to 1 and the whole scale would collapse to the integers).
test('onScale: step_from_min with min 0.01 gives 1.01 and 2.01, not 1 and 2', () => {
  const cfg = { min: 0.01, max: 10, step: 1, step_from_min: true };
  assert.equal(onScale(0.01, cfg), true);
  assert.equal(onScale(1.01, cfg), true);
  assert.equal(onScale(2.01, cfg), true);
  assert.equal(onScale(1, cfg), false);
  assert.equal(onScale(2, cfg), false);
});

// readme note "values": "whatever you pass for min, max and step is replaced by 0,
// values.length - 1 and 1".
// Bug caught: reading cfg.min/cfg.step in values mode instead of the index range.
test('onScale: values mode accepts only integer indexes inside the array', () => {
  const cfg = { min: 10, max: 100, step: 5, values: ['a', 'b', 'c'] };
  assert.equal(onScale(0, cfg), true);
  assert.equal(onScale(2, cfg), true);
  assert.equal(onScale(3, cfg), false);
  assert.equal(onScale(1.5, cfg), false);
  assert.equal(onScale(-1, cfg), false);
});

// readme note "step": the scale is min PLUS a whole number of steps, so it starts at
// min and runs upward.
// Bug caught: allowing a negative k, which would call -10 a scale point of 0..100.
test('onScale: a value below min is not on the scale', () => {
  assert.equal(onScale(-10, { min: 0, max: 100, step: 10 }), false);
});

// readme settings table defaults: min 10, max 100, step 1.
// Bug caught: defaulting a missing step to 0 (every value would be on the scale).
test('onScale: an omitted min/step falls back to the documented defaults (min 10, step 1)', () => {
  assert.equal(onScale(11, {}), true);
  assert.equal(onScale(11.5, {}), false);
  assert.equal(onScale(9, {}), false);
});

// Bug caught: reading the decimals off min instead of step in the default path.
test('scaleDecimals: the decimals of step, or of step, min and max together under step_from_min', () => {
  assert.equal(scaleDecimals({ min: 0.5, max: 10.5, step: 1 }), 0);
  assert.equal(scaleDecimals({ min: 0, max: 0.001, step: 0.0001 }), 4);
  assert.equal(scaleDecimals({ min: 0.01, max: 10, step: 1, step_from_min: true }), 2);
  assert.equal(scaleDecimals({ values: ['a', 'b'] }), 0);
});

// Bug caught: an off-by-one in the k index (scalePoint(1) returning min).
test('scalePoint: k 0 is min itself and later points follow the rounding rule', () => {
  const cfg = { min: 0.5, max: 10.5, step: 1 };
  assert.equal(scalePoint(0, cfg), 0.5);
  assert.equal(scalePoint(1, cfg), 2);
  assert.equal(scalePoint(2, cfg), 3);
});

// readme note "step_from_min": "A value that does not sit on the scale is moved to
// the nearest point that does."
// Bug caught: flooring instead of rounding (36 would come back as 30).
test('nearestOnScale rounds to the closest scale value', () => {
  assert.equal(nearestOnScale(33, { min: 0, max: 100, step: 10 }), 30);
  assert.equal(nearestOnScale(36, { min: 0, max: 100, step: 10 }), 40);
});

// The nearest point of a negative-min scale keeps min's decimals, so the answer is
// 1.5, not 2. Bug caught: rounding the result to the step's decimals.
test('nearestOnScale returns a point onScale accepts, negative min included', () => {
  const cfg = { min: -0.5, max: 10, step: 1 };
  assert.equal(nearestOnScale(1.2, cfg), 1.5);
  assert.equal(onScale(nearestOnScale(1.2, cfg), cfg), true);
  const frac = { min: 0.3, max: 1.3, step: 0.25 };
  assert.equal(nearestOnScale(0.5, frac), 0.55);
  assert.equal(onScale(nearestOnScale(0.5, frac), frac), true);
});

// --------------------------------------------------------------- format.mjs

// readme settings table, prettify_enabled ("10000000 -> 10 000 000") and
// prettify_separator ("set it to "," for 10,000,000, or to an empty string to turn
// the separator off").
// Bug caught: grouping the fractional part as well (1234.5 would become 1 234.500).
test('builtinPrettify groups the integer part in threes with the separator', () => {
  assert.equal(builtinPrettify(10000000, ' '), '10 000 000');
  assert.equal(builtinPrettify(1234, ','), '1,234');
  assert.equal(builtinPrettify(999, ' '), '999');
  assert.equal(builtinPrettify(1234.5, ''), '1234.5');
  assert.equal(builtinPrettify(1234.5, ' '), '1 234.5');
  assert.equal(builtinPrettify(-1234, ' '), '-1 234');
  assert.equal(builtinPrettify(0.001, ' '), '0.001');
});

// readme settings table: prefix "$100", postfix "100k", max_postfix "0 - 100+",
// min_prefix "From: 0 - 100", max_prefix "0 - Up to: 100".
// Bug caught: applying min_prefix by surface instead of by value, or dropping the
// mutual exclusion between min_prefix and max_prefix.
test('expectedLabel applies prefix, postfix, max_postfix and the min/max prefixes in the documented order', () => {
  const cfg = { min: 0, max: 100, step: 1, prettify_enabled: true, prettify_separator: ' ', prefix: '$', postfix: 'k', max_postfix: '+', min_prefix: 'From: ', max_prefix: 'Up to: ' };
  assert.equal(expectedLabel(50, cfg, 'handle'), '$50k');
  assert.equal(expectedLabel(100, cfg, 'handle'), 'Up to: $100+ k');
  assert.equal(expectedLabel(0, cfg, 'min'), 'From: $0k');
  assert.equal(expectedLabel(100, cfg, 'max'), 'Up to: $100+ k');
});

// min === max makes both prefixes eligible; the plugin resolves it to min_prefix.
// Bug caught: turning the else-if into two ifs (both prefixes would be emitted).
test('decorate: with min equal to max only min_prefix is used', () => {
  const cfg = { min: 5, max: 5, min_prefix: 'From: ', max_prefix: 'Up to: ' };
  assert.equal(decorate('5', 5, cfg, 'handle'), 'From: 5');
});

// readme settings table: prettify_enabled false turns the formatting off.
// Bug caught: ignoring prettify_enabled (the label would read "10 000").
test('expectedLabel with prettify_enabled false shows the bare number', () => {
  assert.equal(expectedLabel(10000, { min: 0, max: 20000, step: 1, prettify_enabled: false, prettify_separator: ' ' }, 'handle'), '10000');
});

// readme settings table: decorate_both "decorate both values ($10k - $100k) instead
// of only the merged pair ($10 - 100k)"; values_separator sits between them.
// Bug caught: decorating the merged text against `from` instead of `to`.
test('expectedMerged follows decorate_both and values_separator', () => {
  const cfg = { min: 0, max: 100, step: 1, prettify_enabled: true, prettify_separator: ' ', prefix: '$', postfix: 'k', values_separator: ' — ', decorate_both: true };
  assert.equal(expectedMerged(10, 90, cfg), '$10k — $90k');
  assert.equal(expectedMerged(10, 90, { ...cfg, decorate_both: false }), '$10 — 90k');
  assert.equal(expectedMerged(10, 90, { ...cfg, values_separator: ' to ' }), '$10k to $90k');
});

// readme note "prettify_grid": "When it is not set, the grid labels fall back to
// prettify, and then to the built-in number formatting"; same for prettify_min_max.
// Bug caught: routing every surface through cfg.__prettify, so prettify_grid would
// never reach the grid labels.
test('expectedLabel routes each surface through its own prettify with the documented fallback', () => {
  const base = { min: 0, max: 100, step: 1, prettify_separator: ' ' };
  const all = { ...base, __prettify: (n) => `<${n}>` };
  assert.equal(expectedLabel(50, all, 'handle'), '<50>');
  assert.equal(expectedLabel(50, all, 'grid'), '<50>');
  assert.equal(expectedLabel(0, all, 'min'), '<0>');

  const split = { ...all, __prettify_grid: (n) => `g${n}`, __prettify_min_max: (n) => `m${n}` };
  assert.equal(expectedLabel(50, split, 'handle'), '<50>');
  assert.equal(expectedLabel(50, split, 'grid'), 'g50');
  assert.equal(expectedLabel(0, split, 'min'), 'm0');
  assert.equal(expectedLabel(100, split, 'max'), 'm100');

  // No custom function anywhere: the built-in formatting.
  assert.equal(expectedLabel(10000, base, 'grid'), '10 000');
});

// readme note "values": "A numeric-looking entry such as "20.0" is converted to the
// number 20 unless values_raw is on"; the payload block: from_pretty is "the
// prettified entry, not the index".
// Bug caught: labelling the index instead of the entry.
test('expectedLabel in values mode shows the entry at the index, not the index', () => {
  const nums = { values: [10, 1000, 100000], prettify_separator: ' ' };
  assert.equal(expectedLabel(1, nums, 'handle'), '1 000');
  assert.equal(expectedLabel(2, nums, 'grid'), '100 000');

  const strings = { values: ['low', 'mid', 'high'] };
  assert.equal(expectedLabel(0, strings, 'handle'), 'low');
  assert.equal(expectedLabel(2, strings, 'max'), 'high');
});

// readme note "values_raw": ""20.0" becomes 20 ... Turn values_raw on to keep the
// entry exactly as written."
// Bug caught: converting numeric-looking entries even with values_raw on.
test('valuesEntry converts a numeric-looking entry unless values_raw keeps it', () => {
  assert.equal(valuesEntry({ values: ['10', '20.0', '30'] }, 1), 20);
  assert.equal(valuesEntry({ values: ['10', '20.0', '30'], values_raw: true }, 1), '20.0');
  assert.equal(expectedLabel(1, { values: ['10', '20.0', '30'] }, 'handle'), '20');
  assert.equal(expectedLabel(1, { values: ['10', '20.0', '30'], values_raw: true }, 'handle'), '20.0');
});

// readme settings table: prettify_all_values "In values mode, also run prettify on
// non-numeric entries".
// Bug caught: passing non-numeric entries to prettify without the option, or never
// passing them at all.
test('expectedLabel runs a custom prettify on non-numeric entries only with prettify_all_values', () => {
  const cfg = { values: ['low', 1000], prettify_separator: ' ', __prettify: (v) => `[${v}]` };
  assert.equal(expectedLabel(0, cfg, 'handle'), 'low');
  assert.equal(expectedLabel(1, cfg, 'handle'), '[1000]');
  assert.equal(expectedLabel(0, { ...cfg, prettify_all_values: true }, 'handle'), '[low]');
});

// readme note "values" again: in values mode min and max are the first and last
// index, so min_prefix must fire on index 0 and max_prefix on the last index.
// Bug caught: comparing the index against cfg.min/cfg.max (10 and 100 by default),
// so neither prefix would ever appear in values mode.
test('expectedLabel decorates values-mode labels against the index range', () => {
  const cfg = { values: ['a', 'b', 'c'], min_prefix: 'From: ', max_prefix: 'Up to: ' };
  assert.equal(expectedLabel(0, cfg, 'min'), 'From: a');
  assert.equal(expectedLabel(2, cfg, 'max'), 'Up to: c');
  assert.equal(expectedLabel(1, cfg, 'handle'), 'b');
});
