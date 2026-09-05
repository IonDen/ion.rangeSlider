import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSlider } from './helpers.mjs';

// #852: setMinMax() returned early when options.hide_min_max is true, right
// after hiding the .irs-min/.irs-max nodes and BEFORE either branch (values
// mode / numeric) computed and wrote result.min_pretty/result.max_pretty. A
// slider built with hide_min_max: true therefore handed every callback a
// result object missing those two fields, and after an update that changed
// min/max while hidden, the fields kept the PREVIOUS configuration's values.

test('hide_min_max: true still sets result.min_pretty/max_pretty on the onStart payload and on slider.result (#852)', (t) => {
  let seen;
  const { slider } = createSlider(t, '<input>', {
    min: 0, max: 100, from: 30, hide_min_max: true,
    onStart: (data) => { seen = data; }
  });
  // One-line bug this catches: the early `if (this.options.hide_min_max) {
  // ...; return; }` sitting above the numeric branch's result writes --
  // min_pretty/max_pretty would read undefined here instead of "0"/"100".
  assert.equal(seen.min_pretty, '0');
  assert.equal(seen.max_pretty, '100');
  assert.equal(slider.result.min_pretty, '0');
  assert.equal(slider.result.max_pretty, '100');
});

test('update({ hide_min_max: true, max: 500 }) refreshes max_pretty to the new max instead of keeping the stale one (#852)', (t) => {
  let seen;
  const { slider } = createSlider(t, '<input>', {
    min: 0, max: 100, from: 30,
    onUpdate: (data) => { seen = data; }
  });

  slider.update({ hide_min_max: true, max: 500 });

  // One-line bug this catches: same early return as above -- max_pretty
  // would keep reading "100" (the value from before the update) instead of
  // recomputing to "500", because setMinMax() returns before it ever
  // reaches the numeric branch's result writes.
  assert.equal(seen.max_pretty, '500');
  assert.equal(slider.result.max_pretty, '500');
});

test('values mode with hide_min_max: true still sets result.min_pretty/max_pretty to the prettified entries (#852)', (t) => {
  const { slider } = createSlider(t, '<input>', { values: ['a', 'b', 'c'], hide_min_max: true });
  // One-line bug this catches: the early return sitting above the values
  // branch's result writes (this.result.min_pretty =
  // this.options.p_values[this.options.min], and the max_pretty line).
  assert.equal(slider.result.min_pretty, 'a');
  assert.equal(slider.result.max_pretty, 'c');
});

test('hide_min_max: true still routes min/max through prettify_min_max, not the plain number formatter (#852)', (t) => {
  const { slider } = createSlider(t, '<input>', {
    min: 0, max: 100, hide_min_max: true,
    prettify_min_max: function (n) { return '<' + n + '>'; }
  });
  // One-line bug this catches: computing the hidden-path strings with
  // this._prettify(...) instead of this._prettifyMinMax(...) -- the min/max
  // formatter would never run and min_pretty/max_pretty would fall back to
  // plain number formatting ("0"/"100" instead of "<0>"/"<100>").
  assert.equal(slider.result.min_pretty, '<0>');
  assert.equal(slider.result.max_pretty, '<100>');
});

test('hide_min_max: true keeps .irs-min/.irs-max hidden, at init and after an update that turns hiding on (#852 restructure guard)', (t) => {
  const { slider: initSlider } = createSlider(t, '<input>', { min: 0, max: 100, from: 30, hide_min_max: true });
  assert.equal(initSlider.$cache.min[0].style.display, 'none', 'hidden at init');
  assert.equal(initSlider.$cache.max[0].style.display, 'none', 'hidden at init');

  const { slider: updatedSlider } = createSlider(t, '<input>', { min: 0, max: 100, from: 30 });
  updatedSlider.update({ hide_min_max: true, max: 500 });
  // Characterization pin: green before and after the #852 fix (2.4.1 already
  // hid the labels; only the result writes were missing). One-line bug this
  // catches: dropping the `style.display = "none"` lines during the
  // restructure -- the labels would fall back to visible instead of staying
  // hidden once the pretty-string writes moved above the check.
  assert.equal(updatedSlider.$cache.min[0].style.display, 'none', 'hidden after update');
  assert.equal(updatedSlider.$cache.max[0].style.display, 'none', 'hidden after update');
});
