import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSlider } from './helpers.mjs';

// #503: the result object handed to every callback (onStart/onChange/onFinish/
// onUpdate) omitted the already-configured from_min/from_max/to_min/to_max
// diapason limits, forcing consumers to track them in a separate variable.
// jsdom has no layout (helpers.mjs), so onChange/onFinish never fire through
// a real drag/click here; callOnChange()/callOnFinish() are invoked directly
// (same production code path drawHandles() calls) to check the payload they
// hand to the callback without needing geometry.

test('unset diapason limits default to null on the result object (#503)', (t) => {
  const { slider } = createSlider(t, '<input>', { type: 'double', min: 0, max: 100 });
  assert.equal(slider.options.from_min, null);
  assert.equal(slider.options.from_max, null);
  assert.equal(slider.options.to_min, null);
  assert.equal(slider.options.to_max, null);
  assert.equal(slider.result.from_min, null);
  assert.equal(slider.result.from_max, null);
  assert.equal(slider.result.to_min, null);
  assert.equal(slider.result.to_max, null);
});

test('configured diapason limits land on the result object matching the options (#503)', (t) => {
  const { slider } = createSlider(t, '<input>', {
    type: 'double', min: 0, max: 100,
    from_min: 10, from_max: 40, to_min: 60, to_max: 90
  });
  assert.equal(slider.result.from_min, 10);
  assert.equal(slider.result.from_max, 40);
  assert.equal(slider.result.to_min, 60);
  assert.equal(slider.result.to_max, 90);
});

test('data-from-min/data-from-max/data-to-min/data-to-max override JS options and land on the result (#503)', (t) => {
  const { slider } = createSlider(
    t,
    '<input data-from-min="5" data-from-max="45" data-to-min="55" data-to-max="95">',
    { type: 'double', min: 0, max: 100, from_min: 1, from_max: 2, to_min: 3, to_max: 4 }
  );
  assert.equal(slider.result.from_min, 5);
  assert.equal(slider.result.from_max, 45);
  assert.equal(slider.result.to_min, 55);
  assert.equal(slider.result.to_max, 95);
});

test('onStart receives the four diapason limit fields (#503)', (t) => {
  let seen;
  createSlider(t, '<input>', {
    type: 'double', min: 0, max: 100, from_min: 10, from_max: 40, to_min: 60, to_max: 90,
    onStart: (data) => { seen = data; }
  });
  assert.ok(seen, 'onStart must have fired');
  assert.equal(seen.from_min, 10);
  assert.equal(seen.from_max, 40);
  assert.equal(seen.to_min, 60);
  assert.equal(seen.to_max, 90);
});

test('onUpdate receives the refreshed diapason limit fields (#503)', (t) => {
  let seen;
  const { slider } = createSlider(t, '<input>', {
    type: 'double', min: 0, max: 100, from_min: 10, from_max: 40, to_min: 60, to_max: 90,
    onUpdate: (data) => { seen = data; }
  });
  // Changed values, not a no-op update: an update() that left the refresh
  // lines out entirely would still pass this test if the limits didn't move.
  slider.update({ from_min: 25, from_max: 45, to_min: 65, to_max: 95 });
  assert.ok(seen, 'onUpdate must have fired');
  assert.equal(seen.from_min, 25);
  assert.equal(seen.from_max, 45);
  assert.equal(seen.to_min, 65);
  assert.equal(seen.to_max, 95);
});

test('onChange/onFinish receive the four diapason limit fields (#503)', (t) => {
  let changeSeen, finishSeen;
  const { slider } = createSlider(t, '<input>', {
    type: 'double', min: 0, max: 100, from_min: 10, from_max: 40, to_min: 60, to_max: 90,
    onChange: (data) => { changeSeen = data; },
    onFinish: (data) => { finishSeen = data; }
  });
  // Same call sites drawHandles() uses once geometry resolves a real change;
  // invoked directly here because jsdom never gives coords.w_rs a non-zero
  // value (see helpers.mjs).
  slider.callOnChange();
  slider.callOnFinish();
  assert.ok(changeSeen, 'onChange must have fired');
  assert.ok(finishSeen, 'onFinish must have fired');
  assert.equal(changeSeen.from_min, 10);
  assert.equal(changeSeen.from_max, 40);
  assert.equal(changeSeen.to_min, 60);
  assert.equal(changeSeen.to_max, 90);
  assert.equal(finishSeen.from_min, 10);
  assert.equal(finishSeen.from_max, 40);
  assert.equal(finishSeen.to_min, 60);
  assert.equal(finishSeen.to_max, 90);
});

test('update({from_min, from_max, to_min, to_max}) refreshes the result fields (#503)', (t) => {
  const { slider } = createSlider(t, '<input>', {
    type: 'double', min: 0, max: 100, from_min: 10, from_max: 40, to_min: 60, to_max: 90
  });
  assert.equal(slider.result.from_min, 10);

  slider.update({ from_min: 25, from_max: 45, to_min: 65, to_max: 95 });

  assert.equal(slider.options.from_min, 25);
  assert.equal(slider.result.from_min, 25);
  assert.equal(slider.result.from_max, 45);
  assert.equal(slider.result.to_min, 65);
  assert.equal(slider.result.to_max, 95);
});
