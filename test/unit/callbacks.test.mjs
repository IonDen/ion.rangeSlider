import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSlider } from './helpers.mjs';

// #359: onInit is a new callback that fires once per construction, after the
// initial render pass (init() calls this.drawHandles() directly, then
// this.callOnInit(), before arming the idle render loop via
// this.updateScene() -- gated by `!is_update` so update()/reset() never fire
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

// #359 fix round: a throwing onInit handler must not leave the idle
// 300ms render loop armed. this.update_tm (see js/ion.rangeSlider.js,
// updateScene()) is only ever scheduled via `setTimeout(fn, 300)`; nothing
// else in the plugin schedules a 300ms timer, so counting THOSE calls
// through the window realm's own setTimeout isolates the render loop
// specifically. is_active stays false for the whole test (no drag ever
// starts), so updateScene() always takes the setTimeout branch, never rAF.
test('a throwing onInit leaves no armed idle-render timer behind (#359)', (t) => {
  let timeoutCalls = 0;
  let threw = false;
  let created;

  try {
    created = createSlider(t, '<input>', {
      min: 0, max: 100, from: 10,
      onInit: () => { throw new Error('boom'); }
    }, (window) => {
      const realSetTimeout = window.setTimeout.bind(window);
      window.setTimeout = function (fn, delay) {
        if (delay === 300) {
          timeoutCalls++;
        }
        return realSetTimeout(fn, delay);
      };
    });
  } catch (e) {
    threw = true;
  }

  // Cannot pass vacuously: prove the exception actually escaped
  // construction (and so $.data(...) registration, and therefore
  // destroy(), was genuinely never reached) rather than this assertion
  // trivially holding because onInit never ran or its throw was swallowed
  // somewhere on the way out.
  assert.equal(threw, true, 'the onInit exception must propagate out of construction');
  assert.equal(created, undefined, 'construction must never reach $.data registration when onInit throws');

  // One-line bug this catches: calling this.callOnInit() after
  // this.updateScene() in init() (the ordering before this fix round) --
  // updateScene() would already have armed the idle render loop
  // (this.update_tm = setTimeout(this.updateScene.bind(this), 300)) before
  // onInit gets a chance to throw. Since the exception then escapes the
  // constructor, $.fn.ionRangeSlider never reaches $.data(...), so
  // destroy() is unreachable and that armed timer just keeps rescheduling
  // itself (each firing re-arms via the same 300ms branch) with nothing
  // left to ever cancel it.
  assert.equal(timeoutCalls, 0, 'no idle render timer must be armed when onInit throws');
});
