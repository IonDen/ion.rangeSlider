import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSlider } from './helpers.mjs';

test('prettify groups thousands with the separator', (t) => {
  assert.equal(createSlider(t, '<input>', { min: 0, max: 10000000 }).slider.prettify(10000000), '10 000 000');
  assert.equal(createSlider(t, '<input>', { min: 0, max: 10000, prettify_separator: ',' }).slider.prettify(1234567), '1,234,567');
});

test('a custom prettify function replaces the default', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 0, max: 100, prettify: (n) => `<${n}>` });
  assert.equal(slider._prettify(42), '<42>');
});

test('a prettify option given as a global function name resolves it (#535)', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 0, max: 100, prettify: 'my_prettify' }, (window) => {
    window.my_prettify = function (n) { return '#' + n; };
  });
  assert.equal(slider._prettify(42), '#42');
});

test('data-prettify resolves a global function by name -- the motivating vue-form-generator path (#535)', (t) => {
  const { slider } = createSlider(t, '<input data-prettify="my_prettify">', { min: 0, max: 100 }, (window) => {
    window.my_prettify = function (n) { return '~' + n; };
  });
  assert.equal(slider._prettify(7), '~7');
});

test('an unresolvable prettify name falls back to default formatting, no throw (#535)', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 0, max: 10000000, prettify: 'does_not_exist_fn' });
  assert.equal(slider._prettify(10000000), '10 000 000');
});

test('update({ prettify: "name" }) resolves a global function named after init (#535)', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 0, max: 100 }, (window) => {
    window.late_prettify = function (n) { return '*' + n + '*'; };
  });
  assert.equal(slider._prettify(5), '5');           // default formatting before update
  slider.update({ prettify: 'late_prettify' });
  assert.equal(slider._prettify(5), '*5*');
});

test('decorate adds prefix, postfix and max_postfix only on the max value', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 0, max: 100, prefix: '$', postfix: 'k', max_postfix: '+' });
  assert.equal(slider.decorate('50', 50), '$50k');
  assert.equal(slider.decorate('100', 100), '$100+ k');
});
