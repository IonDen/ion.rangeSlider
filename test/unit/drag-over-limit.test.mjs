import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSlider } from './helpers.mjs';

// #302: drag_over_limit lets a dragged handle push the other handle instead
// of clamping against it. Off by default (byte-identical to today). These
// pin the option surface only -- calc()'s push math needs real layout and
// belongs to the Playwright suite (test/browser/drag-over-limit.spec.mjs).

test('drag_over_limit defaults to false (#302)', (t) => {
  const { slider } = createSlider(t, '<input>', { type: 'double', min: 0, max: 100 });
  assert.equal(slider.options.drag_over_limit, false);
});

// Mutation this catches: no `drag_over_limit: $inp.data("dragOverLimit")`
// line in config_from_data -- the attribute is silently ignored and the JS
// option (false) survives unchanged instead of being overridden to true.
// The strict equal also pins jQuery's data() string->boolean coercion: a
// stray .attr() read would leave the string "true", which fails === true.
test('data-drag-over-limit="true" overrides a JS drag_over_limit: false (#302)', (t) => {
  const { slider } = createSlider(t, '<input data-drag-over-limit="true">', {
    type: 'double', min: 0, max: 100, drag_over_limit: false
  });
  assert.equal(slider.options.drag_over_limit, true);
});

// Mirrors the test above in the other direction, so a fix that only wires
// up the data-attribute for a truthy value (e.g. an `||` instead of the
// `undefined`/"" strip config_from_data already uses for every other
// option) still gets caught.
test('data-drag-over-limit="false" overrides a JS drag_over_limit: true (#302)', (t) => {
  const { slider } = createSlider(t, '<input data-drag-over-limit="false">', {
    type: 'double', min: 0, max: 100, drag_over_limit: true
  });
  assert.equal(slider.options.drag_over_limit, false);
});
