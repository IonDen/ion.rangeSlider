import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSlider } from './helpers.mjs';

// #890: readme settings table, block: "Block the slider but keep the input enabled.
// Value is still submitted with the form". The mask block adds keeps the mouse and touch
// off the handles, but the track keeps its tabindex and its keydown handler, so up to
// 2.5.0 a focused blocked slider still answered the arrow keys: the value moved, the
// input changed and onChange/onFinish fired. The fix makes key() drop every press while
// block is on. Focus is still allowed (the markup is unchanged); a focused blocked
// slider just does not move.
//
// jsdom has no layout (see helpers.mjs), so each slider gets the same stubbed 600 px
// geometry as test/unit/drag-end-callbacks.test.mjs, re-applied after every update()
// because update() rebuilds the DOM the stubs sit on. Keys and focus are dispatched
// as events on the track, through the handlers the plugin bound there, rather than by
// calling key() directly (drag-end-callbacks.test.mjs does that): a user's key press
// travels that route, and the tests then hold whichever way block is enforced (an early
// return in key(), or a keydown handler that is never bound).

const RIGHT = 39;
const UP = 38;

function primeSingle(slider) {
  slider.$cache.rs.outerWidth = function () { return 600; };
  slider.$cache.rs.offset = function () { return { left: 0 }; };
  slider.$cache.s_single.outerWidth = function () { return 16; };
  // One real drawHandles() pass settles the resize branch before the first press.
  slider.drawHandles();
}

function primeDouble(slider) {
  slider.$cache.rs.outerWidth = function () { return 600; };
  slider.$cache.rs.offset = function () { return { left: 0 }; };
  slider.$cache.s_from.outerWidth = function () { return 16; };
  slider.$cache.s_to.outerWidth = function () { return 16; };
  slider.drawHandles();
}

function recorder() {
  const events = [];
  return {
    events,
    onChange(r) { events.push({ type: 'onChange', from: r.from, to: r.to }); },
    onFinish(r) { events.push({ type: 'onFinish', from: r.from, to: r.to }); },
    onUpdate(r) { events.push({ type: 'onUpdate', from: r.from, to: r.to }); }
  };
}

/** Focus the track the way a Tab does: the focus event reaches pointerFocus() through its binding. */
function focusTrack(slider) {
  slider.$cache.line.trigger('focus');
}

/**
 * One key press on the focused track, then the idle tick that renders it: drawHandles()
 * is where a press writes the input and fires its callbacks.
 */
function press(slider, $, which) {
  slider.$cache.line.trigger($.Event('keydown', { which }));
  slider.drawHandles();
}

// Bug caught: key() not reading block (the behaviour up to 2.5.0) -- the two presses
// move the handle 30 -> 31 -> 32, write "32" to the input and fire onChange and
// onFinish for each.
test('a blocked single slider ignores the arrow keys: the input and the callbacks stay quiet (#890)', (t) => {
  const rec = recorder();
  const { $, $input, slider } = createSlider(t, '<input>', {
    type: 'single', min: 0, max: 100, from: 30, step: 1, block: true,
    onChange: rec.onChange, onFinish: rec.onFinish
  });
  primeSingle(slider);
  assert.equal($input.val(), '30', 'setup: the input starts on 30');

  focusTrack(slider);
  press(slider, $, RIGHT);
  press(slider, $, UP);

  assert.equal($input.val(), '30');
  assert.deepEqual(rec.events, []);
});

// Double type arms the from handle on focus and walks a different branch of
// moveByKey(), so it is pinned on its own.
// Bug caught: the same missing block check; and, on its own, a check that only covers
// single type (`if (this.options.block && this.options.type === "single")`), which leaves
// this slider moving from 20 to 22.
test('a blocked double slider ignores the arrow keys too (#890)', (t) => {
  const rec = recorder();
  const { $, $input, slider } = createSlider(t, '<input>', {
    type: 'double', min: 0, max: 100, from: 20, to: 80, step: 1, block: true,
    onChange: rec.onChange, onFinish: rec.onFinish
  });
  primeDouble(slider);
  assert.equal($input.val(), '20;80', 'setup: the input starts on 20;80');

  focusTrack(slider);
  press(slider, $, RIGHT);
  press(slider, $, UP);

  assert.equal($input.val(), '20;80');
  assert.deepEqual(rec.events, []);
});

// Control: the same presses on a slider without block. It also proves the focus and
// keydown dispatch above reach the plugin at all, so the blocked tests cannot pass on
// an event that never arrived.
// Bug caught: a block check that drops every press, e.g. one written as
// `if (this.options.block !== undefined)` (block is always a boolean after init).
test('a slider without block still answers the arrow keys (#890, control)', (t) => {
  const rec = recorder();
  const { $, $input, slider } = createSlider(t, '<input>', {
    type: 'single', min: 0, max: 100, from: 30, step: 1,
    onChange: rec.onChange, onFinish: rec.onFinish
  });
  primeSingle(slider);

  focusTrack(slider);
  press(slider, $, RIGHT);

  assert.equal($input.val(), '31');
  assert.deepEqual(rec.events, [
    { type: 'onChange', from: 31, to: 100 },
    { type: 'onFinish', from: 31, to: 100 }
  ]);
});

// Bug caught: a fix that turns the keyboard option off while blocked (in append()'s block
// branch, `this.options.keyboard = false;`): the option outlives the block, so after
// update({block: false}) the handler is never bound again and the press does nothing.
test('update({block: false}) gives the keyboard back (#890)', (t) => {
  const rec = recorder();
  const { $, $input, slider } = createSlider(t, '<input>', {
    type: 'single', min: 0, max: 100, from: 30, step: 1, block: true,
    onChange: rec.onChange, onFinish: rec.onFinish
  });
  primeSingle(slider);
  focusTrack(slider);
  press(slider, $, RIGHT);
  assert.equal($input.val(), '30', 'setup: blocked, the press does nothing');

  slider.update({ block: false });
  primeSingle(slider);
  focusTrack(slider);
  press(slider, $, RIGHT);

  assert.equal($input.val(), '31');
  assert.deepEqual(rec.events, [
    { type: 'onChange', from: 31, to: 100 },
    { type: 'onFinish', from: 31, to: 100 }
  ]);
});

// Bug caught: key() not reading block (a live slider blocked later keeps moving to 32);
// and a block check fed a stale value, e.g. update() keeping the block it had
// (`$.extend(this.options, options, { block: this.options.block })`).
test('update({block: true}) takes the keyboard away from a live slider (#890)', (t) => {
  const rec = recorder();
  const { $, $input, slider } = createSlider(t, '<input>', {
    type: 'single', min: 0, max: 100, from: 30, step: 1,
    onChange: rec.onChange, onFinish: rec.onFinish
  });
  primeSingle(slider);
  focusTrack(slider);
  press(slider, $, RIGHT);
  assert.equal($input.val(), '31', 'setup: live, the press moves the handle');
  rec.events.length = 0;

  slider.update({ block: true });
  primeSingle(slider);
  focusTrack(slider);
  press(slider, $, RIGHT);

  assert.equal($input.val(), '31');
  assert.deepEqual(rec.events, []);
});

// The readme says nothing about block and update(). Today update() moves a blocked
// slider -- block stops the user, and update() is the page's own call -- and that stays.
// Characterization: green before and after the #890 fix.
// Bug caught: stretching block over the public methods (`if (!this.input ||
// this.options.block) { return; }` at the top of update()), which leaves the input on 30.
test('update() still moves a blocked slider: block stops the user, not the page (#890, characterization)', (t) => {
  const rec = recorder();
  const { $input, slider } = createSlider(t, '<input>', {
    type: 'single', min: 0, max: 100, from: 30, step: 1, block: true,
    onChange: rec.onChange, onFinish: rec.onFinish, onUpdate: rec.onUpdate
  });
  primeSingle(slider);

  slider.update({ from: 60 });
  primeSingle(slider);

  assert.equal($input.val(), '60');
  assert.deepEqual(rec.events, [{ type: 'onUpdate', from: 60, to: 100 }]);
});
