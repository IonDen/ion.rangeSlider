import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSlider, plain } from './helpers.mjs';

// Mutation this catches: calcGridTicks() returning lefts, values or small counts other than the ones appendGrid()
// renders, or another rule name.
test('calcGridTicks() returns the even split appendGrid() renders, as rule "even"', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 0, max: 100, grid: true, grid_num: 4 });
  const r = slider.calcGridTicks();
  assert.equal(r.rule, 'even');
  assert.deepEqual(plain(r.ticks.map((k) => [k.left, k.value, k.small])), [[0, 0, 4], [25, 25, 4], [50, 50, 4], [75, 75, 4], [100, 100, 4]]);
  // Mutation this catches: `coords.big_num = r.ticks.length - 1` in appendGrid() -- cacheGridLabels() would
  // then cache one fewer label than calcGridTicks() computed ticks.
  assert.equal(slider.$cache.grid_labels.length, r.ticks.length);
});

// Mutation this catches: `coords.big_num = r.ticks.length - 1` in appendGrid() -- for a zero range (rule 0,
// exactly one tick) that reads back as 0, so cacheGridLabels() caches no label at all.
test('cacheGridLabels() caches exactly one label for a zero range', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 5, max: 5, grid: true });
  const r = slider.calcGridTicks();
  assert.equal(r.ticks.length, 1);
  assert.equal(slider.$cache.grid_labels.length, r.ticks.length);
});

// Mutation this catches: the short capped last unit given fewer small ticks than the others, or its prev moved off
// 98 (the step-7 grid's small tick at 99% moves or disappears).
test('grid_snap keeps the full small count in its short capped last unit', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 0, max: 100, step: 7, grid: true, grid_snap: true });
  const ticks = slider.calcGridTicks().ticks;
  const last = ticks[ticks.length - 1];
  assert.deepEqual(plain([ticks.length, last.left, last.small, last.prev]), [16, 100, 1, 98]);
  assert.equal(last.small, ticks[1].small);
});

// Mutation this catches: a threshold of _gridSmallMax() moved by one (each boundary is pinned on both sides).
test('_gridSmallMax() thins the small ticks at 4, 7, 14 and 28 units', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 0, max: 100 });
  assert.deepEqual([4, 5, 7, 8, 14, 15, 28, 29].map((u) => slider._gridSmallMax(u)), [4, 3, 3, 2, 2, 1, 1, 0]);
});
