import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSlider } from './helpers.mjs';

// #679: min_prefix/max_prefix add literal text in front of the min/max bubble
// value, the same way max_postfix already appends literal text after it.
// decorate(num, original) is the single call site that both statics
// (setMinMax(), called unconditionally from init()) and the live from/to/
// single labels route through, so the unit tests exercise decorate()
// directly (pure, no layout needed) and setMinMax()'s rendered output
// (jsdom runs setMinMax() during init() even with zero-width layout).

test('unset min_prefix/max_prefix leave decorate() byte-identical to 2.3.2 (#679)', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 0, max: 100, prefix: '$', postfix: 'k', max_postfix: '+' });
  assert.equal(slider.decorate('0', 0), '$0k');
  assert.equal(slider.decorate('50', 50), '$50k');
  assert.equal(slider.decorate('100', 100), '$100+ k');
});

test('unset min_prefix/max_prefix render the same min/max label text as 2.3.2 (#679)', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 0, max: 100 });
  assert.equal(slider.$cache.min.html(), '0');
  assert.equal(slider.$cache.max.html(), '100');
});

test('decorate() adds min_prefix only when original is the min, max_prefix only when original is the max (#679)', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 0, max: 100, min_prefix: 'from ', max_prefix: 'up to ' });
  assert.equal(slider.decorate('0', 0), 'from 0');
  assert.equal(slider.decorate('100', 100), 'up to 100');
  assert.equal(slider.decorate('50', 50), '50');
});

test('min_prefix/max_prefix combine with a global prefix, space-separated (#679)', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 0, max: 100, prefix: '$', min_prefix: 'from ', max_prefix: 'up to ' });
  assert.equal(slider.decorate('0', 0), '$ from 0');
  assert.equal(slider.decorate('100', 100), '$ up to 100');
  assert.equal(slider.decorate('50', 50), '$50');
});

test('min_prefix and max_postfix combine independently on the max value (#679)', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 0, max: 100, min_prefix: 'from ', max_prefix: 'up to ', postfix: 'k', max_postfix: '+' });
  assert.equal(slider.decorate('0', 0), 'from 0k');
  assert.equal(slider.decorate('100', 100), 'up to 100+ k');
});

test('the rendered min/max labels carry min_prefix/max_prefix (#679)', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 0, max: 100, min_prefix: 'from ', max_prefix: 'up to ' });
  assert.equal(slider.$cache.min.html(), 'from 0');
  assert.equal(slider.$cache.max.html(), 'up to 100');
});

test('min_prefix/max_prefix apply in values mode keyed off the prettified min/max entry (#679)', (t) => {
  const { slider } = createSlider(t, '<input>', { values: ['a', 'b', 'c'], min_prefix: 'from ', max_prefix: 'up to ' });
  assert.equal(slider.$cache.min.html(), 'from a');
  assert.equal(slider.$cache.max.html(), 'up to c');
});

test('a from/to label that sits exactly on min or max also picks up min_prefix/max_prefix, matching max_postfix precedent (#679)', (t) => {
  const { slider } = createSlider(t, '<input>', {
    type: 'double', min: 0, max: 100, from: 0, to: 100,
    min_prefix: 'from ', max_prefix: 'up to '
  });
  assert.equal(slider.decorate(String(slider.result.from), slider.result.from), 'from 0');
  assert.equal(slider.decorate(String(slider.result.to), slider.result.to), 'up to 100');
});

test('data-min-prefix/data-max-prefix map to min_prefix/max_prefix and override JS options (#679)', (t) => {
  const { slider } = createSlider(
    t,
    '<input data-min-prefix="From: " data-max-prefix="Up to: ">',
    { min: 0, max: 100, min_prefix: 'x', max_prefix: 'y' }
  );
  assert.equal(slider.options.min_prefix, 'From: ');
  assert.equal(slider.options.max_prefix, 'Up to: ');
  assert.equal(slider.$cache.min.html(), 'From: 0');
  assert.equal(slider.$cache.max.html(), 'Up to: 100');
});

test('update({min_prefix, max_prefix}) re-renders the min/max labels (#679)', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 0, max: 100 });
  assert.equal(slider.$cache.min.html(), '0');
  assert.equal(slider.$cache.max.html(), '100');

  slider.update({ min_prefix: 'from ', max_prefix: 'up to ' });

  assert.equal(slider.options.min_prefix, 'from ');
  assert.equal(slider.options.max_prefix, 'up to ');
  assert.equal(slider.$cache.min.html(), 'from 0');
  assert.equal(slider.$cache.max.html(), 'up to 100');
});
