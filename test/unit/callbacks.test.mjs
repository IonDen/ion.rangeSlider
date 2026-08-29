import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSlider } from './helpers.mjs';

// #359: onInit is a new callback that fires once per construction, after the
// initial render pass (init() calls this.callOnInit() right after
// this.updateScene(), gated by `!is_update` so update()/reset() never fire
// it again). jsdom never gives coords.w_rs a non-zero value (see
// helpers.mjs), so calc()/drawHandles() bail out early on every render run
// here -- which means these assertions inherently also pin the "a slider
// that is hidden/has no layout at construction time still gets onInit"
// contract from the brief: there is no way for a jsdom-backed test to
// observe a real render pass, only that the callback still fired.

test('onInit fires exactly once at construction, with the configured from/to on the payload (#359)', (t) => {
  let calls = 0;
  let seen;
  createSlider(t, '<input>', {
    type: 'double', min: 0, max: 100, from: 20, to: 60,
    onInit: (data) => { calls++; seen = data; }
  });
  // One-line bug this catches: removing the `this.callOnInit();` call from
  // init() -- calls would stay 0 instead of reaching 1.
  assert.equal(calls, 1, 'onInit must fire exactly once at construction');
  assert.equal(seen.from, 20);
  assert.equal(seen.to, 60);
});

test('update() and reset() do not fire onInit again; onUpdate still fires as before (#359)', (t) => {
  let initCalls = 0;
  let updateCalls = 0;
  const { slider } = createSlider(t, '<input>', {
    min: 0, max: 100, from: 10,
    onInit: () => { initCalls++; },
    onUpdate: () => { updateCalls++; }
  });
  assert.equal(initCalls, 1);

  slider.update({ from: 50 });
  // One-line bug this catches: dropping the `!is_update` gate around
  // `this.callOnInit()` in init() (i.e. calling it unconditionally) --
  // onInit would fire again here, taking initCalls to 2.
  assert.equal(initCalls, 1, 'update() must not fire onInit again');
  assert.equal(updateCalls, 1, 'update() must still fire onUpdate, unchanged');

  slider.reset();
  assert.equal(initCalls, 1, 'reset() must not fire onInit again');
  assert.equal(updateCalls, 2, 'reset() (itself an update()) must still fire onUpdate, unchanged');
});
