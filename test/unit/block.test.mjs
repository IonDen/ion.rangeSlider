import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSlider } from './helpers.mjs';

// #890: readme settings table, block: "Block the slider but keep the input enabled.
// Value is still submitted with the form". The mask block adds keeps the mouse and touch
// off the handles, but the track keeps its tabindex and its keydown handler, so up to
// 2.5.0 a focused blocked slider still answered the arrow keys: the value moved, the
// input changed and onChange/onFinish fired. The fix makes key() drop every press while
// block is on, before it calls preventDefault(), so the key goes on to the page as it
// does on a slider with keyboard: false. Focus is still allowed (the markup is
// unchanged); a focused blocked slider just does not move.
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
 * is where a press writes the input and fires its callbacks. The caller builds the
 * jQuery event (`$.Event('keydown', { which })`) and keeps it, so it can ask afterwards
 * whether the plugin called preventDefault() on it.
 */
function press(slider, ev) {
  slider.$cache.line.trigger(ev);
  slider.drawHandles();
}

// Bug caught: key() not reading block (the behaviour up to 2.5.0) -- the two presses
// move the handle 30 -> 31 -> 32, write "32" to the input and fire onChange and
// onFinish for each.
// The change and input events the plugin triggers on the input are what a page listening
// to the field sees. Bug caught: the block check moved from key() into writeToInput()
// after the first render (`if (this.options.block && !this.is_start) { return; }`),
// freezing the field instead of the slider -- the field keeps "30", but the handle still
// moves and every press triggers change and input on it.
// A press the blocked slider does not answer is not its to consume: the key reaches the
// page. Bug caught: the block check moved from key() into moveByKey(), which runs after
// key() has called preventDefault() -- nothing moves, but the press is swallowed.
test('a blocked single slider ignores the arrow keys: no value, field event or callback, and the key reaches the page (#890)', (t) => {
  const rec = recorder();
  const { $, $input, slider } = createSlider(t, '<input>', {
    type: 'single', min: 0, max: 100, from: 30, step: 1, block: true,
    onChange: rec.onChange, onFinish: rec.onFinish
  });
  primeSingle(slider);
  assert.equal($input.val(), '30', 'setup: the input starts on 30');
  let fieldEvents = 0;
  $input.on('change input', () => { fieldEvents++; });

  focusTrack(slider);
  const right = $.Event('keydown', { which: RIGHT });
  const up = $.Event('keydown', { which: UP });
  press(slider, right);
  press(slider, up);

  assert.equal($input.val(), '30');
  assert.equal(fieldEvents, 0, 'no change or input event on the field');
  assert.deepEqual(rec.events, []);
  assert.equal(right.isDefaultPrevented(), false, 'the right-arrow press reaches the page');
  assert.equal(up.isDefaultPrevented(), false, 'the up-arrow press reaches the page');
});

// Double type arms the from handle on focus and walks a different branch of
// moveByKey(), so it is pinned on its own.
// Bug caught: the same missing block check; and, on its own, a check that only covers
// single type (`if (this.options.block && this.options.type === "single")`), which leaves
// this slider moving from 20 to 22. The key must reach the page here too; bug caught: the
// block check moved from key() into moveByKey(), after preventDefault().
test('a blocked double slider ignores the arrow keys too, and the key reaches the page (#890)', (t) => {
  const rec = recorder();
  const { $, $input, slider } = createSlider(t, '<input>', {
    type: 'double', min: 0, max: 100, from: 20, to: 80, step: 1, block: true,
    onChange: rec.onChange, onFinish: rec.onFinish
  });
  primeDouble(slider);
  assert.equal($input.val(), '20;80', 'setup: the input starts on 20;80');

  focusTrack(slider);
  const right = $.Event('keydown', { which: RIGHT });
  const up = $.Event('keydown', { which: UP });
  press(slider, right);
  press(slider, up);

  assert.equal($input.val(), '20;80');
  assert.deepEqual(rec.events, []);
  assert.equal(right.isDefaultPrevented(), false, 'the right-arrow press reaches the page');
  assert.equal(up.isDefaultPrevented(), false, 'the up-arrow press reaches the page');
});

// Control: the same presses on a slider without block. It also proves the focus and
// keydown dispatch above reach the plugin at all, so the blocked tests cannot pass on
// an event that never arrived.
// Bug caught: a block check that drops every press, e.g. one written as
// `if (this.options.block !== undefined)` (block is never undefined after init: its
// default is false). A slider that answers the key consumes it, so the page does not
// scroll under the handle; bug caught: dropping the `e.preventDefault()` key() calls
// before `this.moveByKey(true)`.
test('a slider without block still answers the arrow keys and consumes them (#890, control)', (t) => {
  const rec = recorder();
  const { $, $input, slider } = createSlider(t, '<input>', {
    type: 'single', min: 0, max: 100, from: 30, step: 1,
    onChange: rec.onChange, onFinish: rec.onFinish
  });
  primeSingle(slider);

  focusTrack(slider);
  const right = $.Event('keydown', { which: RIGHT });
  press(slider, right);

  assert.equal($input.val(), '31');
  assert.deepEqual(rec.events, [
    { type: 'onChange', from: 31, to: 100 },
    { type: 'onFinish', from: 31, to: 100 }
  ]);
  assert.equal(right.isDefaultPrevented(), true, 'the press the slider answered is not passed on');
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
  press(slider, $.Event('keydown', { which: RIGHT }));
  assert.equal($input.val(), '30', 'setup: blocked, the press does nothing');

  slider.update({ block: false });
  primeSingle(slider);
  focusTrack(slider);
  press(slider, $.Event('keydown', { which: RIGHT }));

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
  press(slider, $.Event('keydown', { which: RIGHT }));
  assert.equal($input.val(), '31', 'setup: live, the press moves the handle');
  rec.events.length = 0;

  slider.update({ block: true });
  primeSingle(slider);
  focusTrack(slider);
  press(slider, $.Event('keydown', { which: RIGHT }));

  assert.equal($input.val(), '31');
  assert.deepEqual(rec.events, []);
});

// The readme says nothing about block and update(). Today update() moves a blocked
// slider -- block stops the user, and update() is the page's own call -- and that stays.
// Characterization: green before and after the #890 fix.
// reset() is not pinned here because it never moves a blocked slider: it returns to the
// from/to of the last update() (or of the build), every update() -- the one that sets
// block included -- makes the current value that point, and no user input can move a
// blocked slider away from it.
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
