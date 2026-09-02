import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSlider, plain } from './helpers.mjs';

// #639: setMinMax()'s values branch writes the DOM min/max labels from
// options.p_values but never mirrors that onto result.min_pretty/max_pretty
// the way the numeric branch does (result.min_pretty = this._prettifyMinMax(...)).
// Callback consumers reading result.min_pretty/max_pretty in values mode see
// undefined while the on-screen labels show the real prettified value.

test('values mode sets result.min_pretty/max_pretty to the prettified min/max entries -- setMinMax()\'s values branch never assigned them, only the DOM labels (#639)', (t) => {
  const { slider } = createSlider(t, '<input>', { values: ['apple', 'banana', 'cherry'], from: 1 });
  assert.equal(slider.result.min_pretty, 'apple');
  assert.equal(slider.result.max_pretty, 'cherry');
});

test('values mode prettifies numeric entries into result.min_pretty/max_pretty through the same p_values pipeline the DOM labels already use (#639)', (t) => {
  const { slider } = createSlider(t, '<input>', { values: [1.5, 3.141592, 42] });
  // p_values is built by validate() and already correct on master; pinning it
  // here shows the two assertions below aren't accidentally testing p_values
  // itself but result.min_pretty/max_pretty mirroring it.
  assert.deepEqual(plain(slider.options.p_values), ['1.5', '3.141 592', '42']);
  assert.equal(slider.result.min_pretty, '1.5');
  assert.equal(slider.result.max_pretty, '42');
});

test('numeric mode result.min_pretty/max_pretty are unchanged (characterization -- green before and after the #639 fix; catches a regression that breaks the numeric branch while fixing the values branch)', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 0, max: 100 });
  assert.equal(slider.result.min_pretty, '0');
  assert.equal(slider.result.max_pretty, '100');
});

test('update({ values }) refreshes result.min_pretty/max_pretty for the new array -- setMinMax() re-runs on init(true) inside update() (#639)', (t) => {
  const { slider } = createSlider(t, '<input>', { values: ['apple', 'banana', 'cherry'], from: 1 });
  assert.equal(slider.result.min_pretty, 'apple');

  slider.update({ values: ['fig', 'grape', 'honeydew'] });

  assert.equal(slider.result.min_pretty, 'fig');
  assert.equal(slider.result.max_pretty, 'honeydew');
});
