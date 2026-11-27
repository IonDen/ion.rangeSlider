import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { createSlider } from './helpers.mjs';

const PLUGIN = readFileSync(new URL('../../js/ion.rangeSlider.js', import.meta.url), 'utf8');
const JQUERY_1_8_3 = readFileSync(new URL('../vendor/jquery-1.8.3.js', import.meta.url), 'utf8');

/** Same as createSlider(), on the vendored jQuery 1.8.3 instead of the npm build (see destroy.test.mjs). */
function createSlider183(t, html, options) {
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  window.eval(JQUERY_1_8_3);
  const $ = window.jQuery;
  window.eval(PLUGIN);
  const $input = $('input').first();
  let slider;
  t.after(() => { if (slider && slider.input) slider.destroy(); window.close(); });
  $input.ionRangeSlider(options);
  slider = $.data($input[0], 'ionRangeSlider');
  return { window, $, $input, slider };
}

const BUILDS = [
  { label: 'jQuery 3.7.1', create: createSlider },
  { label: 'jQuery 1.8.3', create: createSlider183 },
];

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

// #921: the mask block lays over the slider covers the slider's own width (-1% to 101%), but a
// value label wider than the handle is not kept inside the slider without force_edges, so near the
// ends of the track a long label sticks out past the mask and a press on that part reaches the
// label's own mousedown/touchstart handler. Up to 2.6.0 that press moved the blocked slider with
// the full onChange/onFinish stream. The fix makes pointerDown() and pointerClick() return at once
// while block is on, before they call preventDefault() (the page treats the press as it treats a
// press on the mask), reading block on every press so update({block: false}) gives the pointer back.
//
// jsdom has no layout, so the overhang itself is measured in the browser spec
// (test/browser/block-label-overhang.spec.mjs); here every element that carries a pointer handler
// gets the press through the handlers the plugin bound, the way the page delivers it, and the
// geometry is stubbed as in the #890 tests above.

/** One press, a move and the release for one gesture: mousedown on `$el`, mousemove on the body, mouseup on the window. */
function gesture(slider, $, $el, type, x, moveTo) {
  const down = $.Event(type, type === 'touchstart'
    ? { originalEvent: { touches: [{ pageX: x }] } }
    : { pageX: x });
  $el.trigger(down);
  slider.$cache.body.trigger($.Event(type === 'touchstart' ? 'touchmove' : 'mousemove',
    type === 'touchstart' ? { originalEvent: { touches: [{ pageX: moveTo }] } } : { pageX: moveTo }));
  slider.$cache.win.trigger($.Event(type === 'touchstart' ? 'touchend' : 'mouseup', { pageX: moveTo }));
  slider.drawHandles();
  slider.drawHandles();
  return down;
}

/** The fields a pointer interaction writes, copied for a before/after comparison. */
function interactionState(slider) {
  return {
    target: slider.target,
    current_plugin: slider.current_plugin,
    is_active: slider.is_active,
    dragging: slider.dragging,
    is_click: slider.is_click,
    coincident_pending: slider.coincident_pending
  };
}

// Elements that bind pointerDown() (a handle or a label) and elements that bind pointerClick()
// (the track, the shadow handles, and the bar except on a double slider with drag_interval, where
// the bar starts a whole-interval drag through pointerDown("both")).
const DOWN_SINGLE = ['single', 's_single'];
const CLICK_SINGLE = ['line', 'bar', 'shad_single'];
const DOWN_DOUBLE = ['from', 's_from', 'to', 's_to', 'single'];
const CLICK_DOUBLE = ['line', 'shad_from', 'shad_to'];

for (const { label, create } of BUILDS) {
  // Bug caught: pointerDown() not reading block (the behaviour up to 2.6.0): a press on the label
  // starts a drag and the value goes 30 -> 60 with onChange and onFinish. A guard that covers only
  // pointerClick() leaves every row of this test red; one placed after `e.preventDefault()` leaves
  // the isDefaultPrevented() assertion red; one that only checks the mouse (`e.type === "mousedown"
  // && this.options.block`) leaves the touchstart rows red.
  test(`a blocked single slider ignores a press on a handle or a label, mouse and touch, and leaves it to the page, ${label} (#921)`, (t) => {
    const rec = recorder();
    const { $, $input, slider } = create(t, '<input>', {
      type: 'single', min: 0, max: 100, from: 30, step: 1, block: true,
      onChange: rec.onChange, onFinish: rec.onFinish
    });
    primeSingle(slider);
    const start = interactionState(slider);
    const handle_x = slider.coords.p_single_fake / 100 * 600;
    const target_x = slider.convertToFakePercent(60) / 100 * 600;
    let fieldEvents = 0;
    $input.on('change input', () => { fieldEvents++; });

    for (const name of DOWN_SINGLE) {
      for (const type of ['mousedown', 'touchstart']) {
        const down = gesture(slider, $, slider.$cache[name], type, handle_x, target_x);
        assert.equal(down.isDefaultPrevented(), false, `${name} ${type}: the press reaches the page`);
      }
    }

    assert.deepEqual(interactionState(slider), start);
    assert.equal($input.val(), '30');
    assert.equal(fieldEvents, 0, 'no change or input event on the field');
    assert.deepEqual(rec.events, []);
  });

  // Bug caught: pointerClick() not reading block: a press on the track-side elements, the shadow
  // handles or the bar sets is_click and calc() jumps the handle to the pointer (30 -> 60) with
  // onChange and onFinish. A guard in pointerDown() alone leaves every row red.
  test(`a blocked single slider ignores a press on the shadow handle, the bar or the track, ${label} (#921)`, (t) => {
    const rec = recorder();
    const { $, $input, slider } = create(t, '<input>', {
      type: 'single', min: 0, max: 100, from: 30, step: 1, block: true,
      onChange: rec.onChange, onFinish: rec.onFinish
    });
    primeSingle(slider);
    const start = interactionState(slider);
    const target_x = slider.convertToFakePercent(60) / 100 * 600;

    for (const name of CLICK_SINGLE) {
      for (const type of ['mousedown', 'touchstart']) {
        const down = gesture(slider, $, slider.$cache[name], type, target_x, target_x);
        assert.equal(down.isDefaultPrevented(), false, `${name} ${type}: the press reaches the page`);
      }
    }

    assert.deepEqual(interactionState(slider), start);
    assert.equal($input.val(), '30');
    assert.deepEqual(rec.events, []);
  });

  // The double type binds a different set of elements (from, to and their handles; the bar as a
  // whole-interval drag with drag_interval). Bug caught: a guard that covers only single type
  // (`if (this.options.block && this.options.type === "single")`) leaves 20;80 moving. With
  // drag_interval the bar goes through pointerDown("both"); the next test holds the bar as a click.
  test(`a blocked double slider with drag_interval ignores a press on a label, a handle, the bar, a shadow handle or the track too, ${label} (#921)`, (t) => {
    const rec = recorder();
    const { $, $input, slider } = create(t, '<input>', {
      type: 'double', min: 0, max: 100, from: 20, to: 80, step: 1, drag_interval: true, block: true,
      onChange: rec.onChange, onFinish: rec.onFinish
    });
    primeDouble(slider);
    const start = interactionState(slider);
    const from_x = slider.coords.p_from_fake / 100 * 600;
    const to_x = slider.coords.p_to_fake / 100 * 600;
    const target_x = slider.convertToFakePercent(50) / 100 * 600;

    for (const name of DOWN_DOUBLE.concat(['bar'])) {
      for (const type of ['mousedown', 'touchstart']) {
        const x = name === 'to' || name === 's_to' ? to_x : from_x;
        const down = gesture(slider, $, slider.$cache[name], type, x, target_x);
        assert.equal(down.isDefaultPrevented(), false, `${name} ${type}: the press reaches the page`);
      }
    }
    for (const name of CLICK_DOUBLE) {
      for (const type of ['mousedown', 'touchstart']) {
        const down = gesture(slider, $, slider.$cache[name], type, target_x, target_x);
        assert.equal(down.isDefaultPrevented(), false, `${name} ${type}: the press reaches the page`);
      }
    }

    assert.deepEqual(interactionState(slider), start);
    assert.equal($input.val(), '20;80');
    assert.deepEqual(rec.events, []);
  });

  // Without drag_interval the bar of a double slider is a click target like the track, so it goes
  // through pointerClick(). Bug caught: a pointerClick() guard that skips the bar on double type
  // (`this.options.block && !(this.options.type === "double" && target === "click" && e.currentTarget
  // === this.$cache.bar[0])`), or that guards mouse and single type only (`this.options.block &&
  // (e.type === "mousedown" || this.options.type === "single")`): 20;80 jumps to the pointer.
  test(`a blocked double slider without drag_interval ignores a press on the bar, a shadow handle or the track, mouse and touch, ${label} (#921)`, (t) => {
    const rec = recorder();
    const { $, $input, slider } = create(t, '<input>', {
      type: 'double', min: 0, max: 100, from: 20, to: 80, step: 1, block: true,
      onChange: rec.onChange, onFinish: rec.onFinish
    });
    primeDouble(slider);
    const start = interactionState(slider);
    const target_x = slider.convertToFakePercent(50) / 100 * 600;

    for (const name of CLICK_DOUBLE.concat(['bar'])) {
      for (const type of ['mousedown', 'touchstart']) {
        const down = gesture(slider, $, slider.$cache[name], type, target_x, target_x);
        assert.equal(down.isDefaultPrevented(), false, `${name} ${type}: the press reaches the page`);
      }
    }

    assert.deepEqual(interactionState(slider), start);
    assert.equal($input.val(), '20;80');
    assert.deepEqual(rec.events, []);
  });

  // Control: the same gestures on a slider without block move it, so the blocked tests above cannot
  // pass on an event that never arrived. A press the slider answers is also consumed: bug caught,
  // a guard that returns for every slider (`if (this.options.block !== undefined)`; block is
  // never undefined after init, its default is false) leaves the value on 30.
  test(`the same gestures move a slider without block, and update({block: false}) gives the pointer back, ${label} (#921, control)`, (t) => {
    const rec = recorder();
    const { $, $input, slider } = create(t, '<input>', {
      type: 'single', min: 0, max: 100, from: 30, step: 1, block: true,
      onChange: rec.onChange, onFinish: rec.onFinish
    });
    primeSingle(slider);
    const handle_x = slider.coords.p_single_fake / 100 * 600;
    const target_x = slider.convertToFakePercent(60) / 100 * 600;
    gesture(slider, $, slider.$cache.single, 'mousedown', handle_x, target_x);
    assert.equal($input.val(), '30', 'setup: blocked, the gesture does nothing');

    slider.update({ block: false });
    primeSingle(slider);
    const down = gesture(slider, $, slider.$cache.single, 'mousedown', slider.coords.p_single_fake / 100 * 600, target_x);

    assert.equal($input.val(), '60');
    assert.equal(down.isDefaultPrevented(), true, 'the press the slider answered is not passed on');
    assert.deepEqual(rec.events.map((e) => e.type), ['onChange', 'onFinish']);
    assert.equal(rec.events[0].from, 60);

    // The click path has its own control: a press on the track of the unblocked slider jumps the
    // handle to the pointer. Bug caught: a pointerClick() guard that returns for every slider.
    // A click centres the handle on the pointer, so aim half a 16 px handle right of the 90 position.
    const track_x = slider.convertToFakePercent(90) / 100 * 600 + 8;
    const click = gesture(slider, $, slider.$cache.line, 'mousedown', track_x, track_x);

    assert.equal($input.val(), '90');
    assert.equal(click.isDefaultPrevented(), true, 'the click the slider answered is not passed on');
  });

  // Bug caught: pointerDown() not reading block, so a live slider that update({block: true}) blocks
  // later still moves on a press (the value goes to 60). This row pins the toggle path on its own:
  // the options the guard reads are the ones update() just wrote.
  test(`update({block: true}) makes a live slider ignore the pointer, ${label} (#921)`, (t) => {
    const rec = recorder();
    const { $, $input, slider } = create(t, '<input>', {
      type: 'single', min: 0, max: 100, from: 30, step: 1,
      onChange: rec.onChange, onFinish: rec.onFinish
    });
    primeSingle(slider);
    slider.update({ block: true });
    primeSingle(slider);
    rec.events.length = 0;

    gesture(slider, $, slider.$cache.single, 'mousedown', slider.coords.p_single_fake / 100 * 600,
      slider.convertToFakePercent(60) / 100 * 600);

    assert.equal($input.val(), '30');
    assert.deepEqual(rec.events, []);
  });
}
