import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSlider } from './helpers.mjs';

test('a throwing constructor still triggers teardown (t.after is registered before ionRangeSlider() runs)', (t) => {
  // $.extend(config, options) reads every enumerable property of `options`
  // synchronously inside the IonRangeSlider constructor, well before this.init()
  // ever runs -- a getter that throws simulates a constructor failure. If
  // t.after were registered after $input.ionRangeSlider(options) (the bug this
  // guards against), it would never be reached and window.close() would never run.
  const boom = Object.defineProperty({}, 'min', {
    enumerable: true,
    get() { throw new Error('boom'); },
  });
  assert.throws(() => createSlider(t, '<input>', boom), /boom/);
});
