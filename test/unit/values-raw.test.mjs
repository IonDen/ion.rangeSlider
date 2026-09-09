import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSlider, plain } from './helpers.mjs';

// #505: "values: ['17.5', '12.2b', '20.0']" silently turned the last entry
// into the number 20 (in options.values, result.from_value/to_value, the
// input's posted value and the labels), so a backend matching against its
// own "20.0" string could never find it. values_raw (default false, so
// every existing data-values/JS-values setup is byte-identical) keeps a
// values entry exactly as given instead of converting a numeric-looking
// string to a number. jsdom has no layout (see helpers.mjs): calc() bails
// before it ever reaches the values-mode from_value/to_value assignment, so
// every from_value/to_value/input-value assertion below drives update() (or
// reset()) first, the way values-mode-result.test.mjs's update() test does,
// to run updateResult() without needing real geometry.

test('values_raw keeps a values entry exactly as given -- the numeric guard converts "20.0" to the number 20 without it (#505)', (t) => {
  const values = ['17.5', '12.2b', '20.0'];
  const { slider } = createSlider(t, '<input>', { values: values, values_raw: true, from: 2 });

  assert.deepEqual(plain(slider.options.values), values);

  slider.update({ from: 2 });
  assert.equal(slider.result.from_value, '20.0');
  assert.equal(typeof slider.result.from_value, 'string');
});

test('values_raw off is byte-identical to 2.4.2 -- numeric-looking strings still convert to numbers (characterization; mutation: invert the o.values_raw guard) (#505)', (t) => {
  const { slider } = createSlider(t, '<input>', { values: ['17.5', '12.2b', '20.0'], from: 2 });

  assert.deepEqual(plain(slider.options.values), [17.5, '12.2b', 20]);

  slider.update({ from: 2 });
  assert.equal(slider.result.from_value, 20);
  assert.equal(typeof slider.result.from_value, 'number');
});

test('values_raw keeps p_values entries as given -- without the guard p_values is still built from +v[i] (#505)', (t) => {
  const { slider } = createSlider(t, '<input>', { values: ['17.5', '12.2b', '20.0'], values_raw: true, from: 2 });

  assert.deepEqual(plain(slider.options.p_values), ['17.5', '12.2b', '20.0']);

  slider.update({ from: 2 });
  assert.equal(slider.result.from_pretty, '20.0');
});

test('values_raw exempts entries that are already numbers -- characterization, green with or without values_raw; the typeof check is what makes it stay green (mutation: drop `typeof v[i] !== "number"` from the guard, keeping only `o.values_raw`) (#505)', (t) => {
  const { slider } = createSlider(t, '<input>', { values: [1000, 2000], values_raw: true, from: 0 });

  assert.deepEqual(plain(slider.options.p_values), ['1 000', '2 000']);

  slider.update({ from: 0 });
  assert.equal(slider.result.from_pretty, '1 000');
});

test('values_raw does not bypass prettify_all_values -- a raw string entry reaches a custom prettify only when it is explicitly on (#505)', (t) => {
  const seen_off = [];
  createSlider(t, '<input>', {
    values: ['17.5', '12.2b', '20.0'],
    values_raw: true,
    prettify: (n) => { seen_off.push(n); return n; }
  });
  assert.deepEqual(seen_off, [], 'no raw string entry may reach a custom prettify by default');

  const seen_on = [];
  createSlider(t, '<input>', {
    values: ['17.5', '12.2b', '20.0'],
    values_raw: true,
    prettify_all_values: true,
    prettify: (n) => { seen_on.push(n); return n; }
  });
  assert.deepEqual(seen_on, ['17.5', '12.2b', '20.0']);
});

test('data-values-raw maps to values_raw, matching every other data-* attribute in the constructor (#505)', (t) => {
  const { slider } = createSlider(t, '<input data-values="17.5,12.2b,20.0" data-values-raw="true" data-from="2">', {});
  assert.equal(slider.options.values_raw, true);

  slider.update({ from: 2 });
  assert.equal(slider.result.from_value, '20.0');
});

test('data-values-raw="false" overrides a JS values_raw: true option (#505)', (t) => {
  const { slider } = createSlider(t, '<input data-values="17.5,12.2b,20.0" data-values-raw="false" data-from="2">', { values_raw: true });
  assert.equal(slider.options.values_raw, false);

  slider.update({ from: 2 });
  assert.equal(slider.result.from_value, 20);
  assert.equal(typeof slider.result.from_value, 'number');
});

test('update() and reset() keep a raw entry raw -- validate() runs again on each, and a re-conversion would turn "20.0" back into a number the second time (#505)', (t) => {
  const { slider } = createSlider(t, '<input>', { values: ['17.5', '12.2b', '20.0'], values_raw: true, from: 2 });

  slider.update({ from: 0 });
  assert.equal(slider.result.from_value, '17.5');

  slider.update({ from: 2 });
  assert.equal(slider.result.from_value, '20.0');

  // reset() re-runs update() with no arguments, so it re-validates against
  // whatever options.from currently is (2, set by the update() call above,
  // not the from: 2 passed at construction -- see smoke.spec.mjs's "update()
  // rewrites the options, reset() returns to them" contract).
  slider.reset();
  assert.equal(slider.result.from_value, '20.0');
});

test('values_raw trims data-values entries split on the comma (#505)', (t) => {
  const { slider } = createSlider(t, '<input data-values="10, 20, 30" data-values-raw="true" data-from="0">', {});
  assert.deepEqual(plain(slider.options.values), ['10', '20', '30']);

  slider.update({ from: 0 });
  assert.equal(slider.result.from_value, '10');
});

test('values_raw never trims a JS values array -- only data-values entries come from a comma split (#505)', (t) => {
  const { slider } = createSlider(t, '<input>', { values: [' 5 '], values_raw: true, from: 0 });
  assert.deepEqual(plain(slider.options.values), [' 5 ']);
});

test("the input's value is the raw entry when values_raw is on -- writeToInput must not read a converted copy (#505)", (t) => {
  const { slider, $input } = createSlider(t, '<input>', { values: ['17.5', '12.2b', '20.0'], values_raw: true, from: 2 });

  slider.update({ from: 2 });
  assert.equal($input.val(), '20.0');
});

test("the input's value in double mode joins both raw entries with input_values_separator when values_raw is on (#505)", (t) => {
  const { slider, $input } = createSlider(t, '<input>', {
    type: 'double', values: ['17.5', '12.2b', '20.0'], values_raw: true, from: 0, to: 2
  });

  slider.update({ from: 0, to: 2 });
  assert.equal($input.val(), '17.5;20.0');
});
