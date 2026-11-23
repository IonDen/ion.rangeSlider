import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSlider } from './helpers.mjs';

// #896: readme settings table, onFinish: "Fires when an interaction ends: a handle is released
// (even without moving), the track (the line the handles move on) is clicked, or a key is
// pressed". onChange: "Fires on each value change made by the user."
//
// A slider whose min equals max ({min: 5, max: 5}, or a values array with one entry) has one
// value and nowhere to move. Up to 2.6.0 it bound no mouse, touch, focus or key handler at all
// (bindEvents() returned at once on a zero value range), so a press, a click or a key press on it
// fired nothing, not even the onFinish the readme promises "even without moving". The fix
// binds the same handlers every other slider gets: each interaction fires exactly one
// onFinish, never an onChange, never a change or input event on the field, and the value
// stays where it is. disable keeps it silent and keyboard: false keeps its keys silent, as on
// any slider. A blocked slider whose min equals max binds no handler at all: its value label
// can stick out past the mask, which covers only the slider's own width (the same gap on a
// blocked slider with a value range is #921).
//
// jsdom has no layout (see helpers.mjs), so the geometry is stubbed the way the other drag and
// key tests stub it: a 600 px track with 16 px handles, settled by one drawHandles() pass, and
// stubbed again after every update(), which rebuilds the DOM the stubs sit on. The gestures go
// through the handlers the plugin binds: a mousedown on a handle, a label, the bar or the
// track, a mousemove on the body, the mouseup on the window, the focus and keydown events on
// the track. drawHandles() is the render tick the idle loop would run next; a click and a key
// press fire their onFinish there, so each gesture is followed by two ticks and the count is
// read after the second (a later tick must not fire it again).

const LEFT = 37;
const RIGHT = 39;
const TRACK = 600;
const HANDLE = 16;

/** The fields of one callback payload, copied when it fires (result is one object mutated in place). */
function snapshot(type, r) {
  return {
    type: type,
    min: r.min, max: r.max,
    from: r.from, to: r.to,
    from_percent: r.from_percent, to_percent: r.to_percent,
    from_pretty: r.from_pretty, to_pretty: r.to_pretty,
    from_value: r.from_value, to_value: r.to_value
  };
}

/** Puts width under a slider (again after an update()) and settles the resize branch. */
function prime(slider) {
  slider.$cache.rs.outerWidth = function () { return TRACK; };
  slider.$cache.rs.offset = function () { return { left: 0 }; };
  const handles = slider.options.type === 'single' ? [slider.$cache.s_single] : [slider.$cache.s_from, slider.$cache.s_to];
  for (const h of handles) h.outerWidth = function () { return HANDLE; };
  slider.drawHandles();
}

/**
 * Builds a slider with a recorder on every callback, primes its geometry and starts counting
 * the change and input events on its field after init.
 */
function open(t, options) {
  const events = [];
  const record = (type) => function (r) { events.push(snapshot(type, r)); };
  const { window, $, $input, slider } = createSlider(t, '<input>', Object.assign({}, options, {
    onStart: record('onStart'), onChange: record('onChange'), onFinish: record('onFinish'), onUpdate: record('onUpdate')
  }));
  prime(slider);
  let fieldEvents = 0;
  $input.on('change input', function () { fieldEvents++; });
  return { window, $, $input, slider, events, fieldEvents: () => fieldEvents };
}

/** Two render ticks: the one that fires a click's or a key's callbacks, and one after it. */
function ticks(slider) {
  slider.drawHandles();
  slider.drawHandles();
}

/** A press on `$el` at pixel `x`, an optional move to `moveTo`, and the release on the window. */
function pressOn(slider, $, $el, x, moveTo) {
  $el.trigger($.Event('mousedown', { pageX: x }));
  if (typeof moveTo === 'number') slider.$cache.body.trigger($.Event('mousemove', { pageX: moveTo }));
  slider.$cache.win.trigger($.Event('mouseup', { pageX: typeof moveTo === 'number' ? moveTo : x }));
  ticks(slider);
}

/** A click on the bare track at pixel `x`. */
function clickTrack(slider, $, x) {
  slider.$cache.line.trigger($.Event('mousedown', { pageX: x }));
  slider.$cache.win.trigger($.Event('mouseup', { pageX: x }));
  ticks(slider);
}

/** Focus on the track (a Tab), then one key press on it. */
function key(slider, $, which) {
  slider.$cache.line.trigger('focus');
  slider.$cache.line.trigger($.Event('keydown', { which: which }));
  ticks(slider);
}

const after = (events, n) => events.slice(n).map((e) => e.type);

/**
 * The slider's own handlers on an element, counted per event type: those in its `.irs_N`
 * namespace, so a test's own listeners are left out.
 */
function ownHandlers($, slider, el) {
  const all = $._data(el, 'events') || {};
  const ns = 'irs_' + slider.plugin_count;
  const counts = {};
  for (const type of Object.keys(all)) {
    const n = all[type].filter((h) => h.namespace === ns).length;
    if (n) counts[type] = n;
  }
  return counts;
}

/** What bindEvents() puts on the page outside the slider's own markup: one handler of each. */
const PAGE_HANDLERS = { window: { mouseup: 1, touchend: 1 }, body: { mousemove: 1, touchmove: 1 } };
const pageHandlers = ($, window, slider) => ({
  window: ownHandlers($, slider, window),
  body: ownHandlers($, slider, window.document.body)
});

/** The payload a zero-range 5..5 slider reports: from = to = min, percents 0, the text "5". */
const FIVE = {
  min: 5, max: 5, from: 5, to: 5, from_percent: 0, to_percent: 0,
  from_pretty: '5', to_pretty: '5', from_value: null, to_value: null
};

// ---- single type ---------------------------------------------------------------------------

// Bug caught: bindEvents() keeping its `if (this.no_diapason) { return; }` (2.6.0): the press
// binds nothing and fires nothing.
test('min equals max, single: a press and release on the handle fires one onFinish, no onChange, nothing moves (#896)', (t) => {
  const { $, $input, slider, events, fieldEvents } = open(t, { min: 5, max: 5 });
  const n = events.length;

  pressOn(slider, $, slider.$cache.s_single, 8);

  assert.deepEqual(after(events, n), ['onFinish']);
  assert.equal($input.val(), '5');
  assert.equal(fieldEvents(), 0, 'no change or input event on the field');
});

// The payload is the one a rendered zero-range slider reports in onStart (the browser suite
// compares the two; jsdom has no width at init, so its onStart carries no text): from = to =
// min, both percents 0 and the formatted text, no NaN anywhere.
// Bugs caught: the bindEvents() early return (no payload at all); pointerUp()'s callback
// condition `if ($.contains(this.$cache.cont[0], e.target) || this.dragging) {` becoming
// `if (false) {` (the release fires nothing).
test('min equals max, single: a drag of the handle fires one onFinish with from = to = min and percents 0 (#896)', (t) => {
  const { $, $input, slider, events, fieldEvents } = open(t, { min: 5, max: 5 });
  const n = events.length;

  pressOn(slider, $, slider.$cache.s_single, 8, 400);

  assert.deepEqual(events.slice(n), [{ type: 'onFinish', ...FIVE }]);
  assert.equal($input.val(), '5');
  assert.equal(fieldEvents(), 0, 'no change or input event on the field');
});

// Bug caught: the bindEvents() early return: the click binds nothing and fires nothing.
test('min equals max, single: a click on the track fires one onFinish (#896)', (t) => {
  const { $, $input, slider, events, fieldEvents } = open(t, { min: 5, max: 5 });
  const n = events.length;

  clickTrack(slider, $, 450);

  assert.deepEqual(events.slice(n), [{ type: 'onFinish', ...FIVE }]);
  assert.equal($input.val(), '5');
  assert.equal(fieldEvents(), 0, 'no change or input event on the field');
});

// Bug caught: the bindEvents() early return: no focus or keydown handler, so neither key fires.
test('min equals max, single: each arrow key fires one onFinish, right and left (#896)', (t) => {
  const { $, $input, slider, events, fieldEvents } = open(t, { min: 5, max: 5 });
  const n = events.length;

  key(slider, $, RIGHT);
  assert.deepEqual(after(events, n), ['onFinish'], 'the right arrow');
  key(slider, $, LEFT);
  assert.deepEqual(after(events, n), ['onFinish', 'onFinish'], 'the left arrow');

  assert.deepEqual(events[events.length - 1], { type: 'onFinish', ...FIVE });
  assert.equal($input.val(), '5');
  assert.equal(fieldEvents(), 0, 'no change or input event on the field');
});

// A touch on the handle goes through the touchstart binding and the window's touchend, the same
// path as on any slider.
// Bug caught: bindEvents() without `this.$cache.s_single.on("touchstart.irs_" + this.plugin_count,
// this.pointerDown.bind(this, "single"));`, so the touch fires nothing.
test('min equals max, single: a touch on the handle fires one onFinish (#896)', (t) => {
  const { $, $input, slider, events, fieldEvents } = open(t, { min: 5, max: 5 });
  const n = events.length;
  const touch = (type) => $.Event(type, { originalEvent: { touches: [{ pageX: 8 }], preventDefault: function () {} } });

  slider.$cache.s_single.trigger(touch('touchstart'));
  slider.$cache.win.trigger(touch('touchend'));
  ticks(slider);

  assert.deepEqual(events.slice(n), [{ type: 'onFinish', ...FIVE }]);
  assert.equal($input.val(), '5');
  assert.equal(fieldEvents(), 0, 'no change or input event on the field');
});

// ---- double type ---------------------------------------------------------------------------

// Every way a user reaches a double slider: each handle (pressed still and dragged both ways,
// which is what resolves a coincident pair), each value label, the bar, the track and both
// arrow keys. Each is one interaction and one onFinish.
// Bug caught: the bindEvents() early return: none of the gestures fires anything.
test('min equals max, double: every handle, label, bar, track and key gesture fires exactly one onFinish (#896)', (t) => {
  const { $, $input, slider, events, fieldEvents } = open(t, { type: 'double', min: 5, max: 5 });
  const c = slider.$cache;
  const gestures = [
    ['from handle, still', () => pressOn(slider, $, c.s_from, 8)],
    ['from handle, dragged right', () => pressOn(slider, $, c.s_from, 8, 300)],
    ['to handle, still', () => pressOn(slider, $, c.s_to, 8)],
    ['to handle, dragged right', () => pressOn(slider, $, c.s_to, 8, 500)],
    ['to handle, dragged left', () => pressOn(slider, $, c.s_to, 300, 20)],
    ['from label, still', () => pressOn(slider, $, c.from, 8)],
    ['from label', () => pressOn(slider, $, c.from, 8, 200)],
    ['to label', () => pressOn(slider, $, c.to, 8, 200)],
    ['merged label', () => pressOn(slider, $, c.single, 8, 200)],
    ['bar', () => pressOn(slider, $, c.bar, 8)],
    ['track', () => clickTrack(slider, $, 300)],
    ['right arrow', () => key(slider, $, RIGHT)],
    ['left arrow', () => key(slider, $, LEFT)]
  ];
  for (const [name, gesture] of gestures) {
    const n = events.length;
    gesture();
    assert.deepEqual(events.slice(n), [{ type: 'onFinish', ...FIVE }], name);
  }
  assert.equal($input.val(), '5;5');
  assert.equal(fieldEvents(), 0, 'no change or input event on the field');
});

// With drag_interval a press on the bar drags the whole interval ("both"), a track click centres
// it on the click ("both_one"), and the keyboard then moves the whole interval. None of that can
// move a pair on the only value there is, and each is still one interaction.
// Bugs caught: the bindEvents() early return; pointerUp()'s callback condition becoming
// `if (false) {`, which silences the bar drag.
test('min equals max, double with drag_interval: bar drag, track click and the keys after each fire one onFinish (#896)', (t) => {
  const { $, $input, slider, events, fieldEvents } = open(t, { type: 'double', min: 5, max: 5, drag_interval: true });
  const c = slider.$cache;
  const gestures = [
    ['bar dragged right', () => pressOn(slider, $, c.bar, 8, 300)],
    ['right arrow after the bar', () => key(slider, $, RIGHT)],
    ['track', () => clickTrack(slider, $, 400)],
    ['left arrow after the track', () => key(slider, $, LEFT)]
  ];
  for (const [name, gesture] of gestures) {
    const n = events.length;
    gesture();
    assert.deepEqual(events.slice(n), [{ type: 'onFinish', ...FIVE }], name);
  }
  assert.equal($input.val(), '5;5');
  // Bug caught: pointerUp() without `this.restoreOriginalMinInterval();`, so the bar drag's
  // borrowed min_interval is never given back and old_min_interval keeps the saved 0.
  assert.equal(slider.old_min_interval, null, 'the bar drag gives back the min_interval it borrowed');
  assert.equal(fieldEvents(), 0, 'no change or input event on the field');
});

// ---- values mode ---------------------------------------------------------------------------

// A values array with one entry is the same slider reached the other way: min and max are both
// index 0.
// Bug caught: the bindEvents() early return: the press and the key fire nothing.
test('one values entry: a drag and a key press each fire one onFinish carrying the entry (#896)', (t) => {
  const { $, $input, slider, events, fieldEvents } = open(t, { values: ['only'] });
  const n = events.length;
  const ONLY = {
    min: 0, max: 0, from: 0, to: 0, from_percent: 0, to_percent: 0,
    from_pretty: 'only', to_pretty: 'only', from_value: 'only', to_value: 'only'
  };

  pressOn(slider, $, slider.$cache.s_single, 8, 300);
  assert.deepEqual(events.slice(n), [{ type: 'onFinish', ...ONLY }], 'the drag');
  key(slider, $, RIGHT);
  assert.deepEqual(events.slice(n + 1), [{ type: 'onFinish', ...ONLY }], 'the key press');

  assert.equal($input.val(), 'only');
  assert.equal(fieldEvents(), 0, 'no change or input event on the field');
});

// ---- no NaN on any path --------------------------------------------------------------------

// A zero value range has a step of 0 % (coords.p_step), and calcWithStep() divided by it. The end
// value came out right only because checkDiapason() turned the NaN back into 0 a statement
// later; between the two, the handle's coordinate was NaN. This watches every coordinate the
// plugin writes while a full set of gestures runs, including the drag_over_limit push. (validate()
// sets min_interval and max_interval to 0 on a zero value range, so their clamps never run here.)
// The onFinish count per slider proves the gestures reached the handlers, so the check cannot
// pass on a slider that binds nothing.
// Bugs caught: calcWithStep() without its zero-range answer: `Math.round(x / 0) * 0` is NaN, and
// calc() stores it in coords.p_single_real / p_from_real / p_to_real; the 2.6.0 early return
// `if (this.no_diapason) { return; }` put back: no gesture reaches a handler and the onFinish
// count is 0.
test('min equals max: no gesture writes NaN or Infinity into a handle position or a payload field (#896)', (t) => {
  const configs = [
    [{ min: 5, max: 5 }, 4],
    [{ type: 'double', min: 5, max: 5, drag_over_limit: true }, 6],
    [{ type: 'double', min: 5, max: 5, drag_interval: true }, 6]
  ];
  for (const [options, finishes] of configs) {
    const { $, slider, events } = open(t, options);
    const bad = [];
    const coords = slider.coords;
    slider.coords = new Proxy(coords, {
      set(target, prop, value) {
        if (typeof value === 'number' && !isFinite(value)) bad.push(`${String(prop)} = ${value}`);
        target[prop] = value;
        return true;
      }
    });
    const c = slider.$cache;
    const n = events.length;
    if (options.type === 'double') {
      pressOn(slider, $, c.s_from, 8, 300);
      pressOn(slider, $, c.s_to, 300, 20);
      pressOn(slider, $, c.bar, 8, 300);
    } else {
      pressOn(slider, $, c.s_single, 8, 300);
    }
    clickTrack(slider, $, 400);
    key(slider, $, RIGHT);
    key(slider, $, LEFT);
    const label = JSON.stringify(options);
    assert.deepEqual(bad, [], `${label}: coordinates written`);
    assert.deepEqual(after(events, n), Array(finishes).fill('onFinish'), `${label}: one onFinish per gesture`);
    for (const e of events.slice(n)) {
      for (const f of ['from', 'to', 'from_percent', 'to_percent']) {
        assert.ok(Number.isFinite(e[f]), `${label}: ${e.type}.${f} is ${e[f]}`);
      }
    }
  }
});

// The method on its own: a zero value range has one point, 0 %, whatever percent comes in.
// Bug caught: calcWithStep() without its zero-range answer: 37 / 0 is Infinity, rounded and
// times 0 is NaN; 0 / 0 is NaN.
test('min equals max: calcWithStep() answers 0 for any percent, not NaN (#896)', (t) => {
  const { slider } = open(t, { min: 5, max: 5 });
  assert.equal(slider.calcWithStep(37), 0);
  assert.equal(slider.calcWithStep(0), 0);
  assert.equal(slider.calcWithStep(100), 0);
});

// Characterization (green before and after the fix): the same method on a slider with a value
// range is untouched. The guard compares min and max; a guard on `!(this.coords.p_step > 0)`
// would pass this suite too, so that choice is not pinned here.
// Bug caught: calcWithStep()'s zero-range test true for a value range too (`this.options.min ===
// this.options.max` becoming `this.options.min <= this.options.max`), which answers 0 here.
test('a slider with a value range: calcWithStep() still snaps to its step (#896 pin)', (t) => {
  const { slider } = open(t, { min: 0, max: 100, step: 10 });
  assert.equal(slider.calcWithStep(37), 40);
  assert.equal(slider.calcWithStep(100), 100);
});

// ---- silent where the readme says so -------------------------------------------------------

// Characterization (green before and after the fix, silent both times). readme disable:
// "Disable the slider and the input"; a disabled slider answers nothing, with or without a value
// range. The gestures are the ones that fire onFinish on the same slider without disable above.
// Bug caught: append() calling bindEvents() whether or not disable is on (the call moved out of
// its `else`), so the disabled slider fires an onFinish per gesture.
test('min equals max with disable: presses, clicks and keys stay silent (#896)', (t) => {
  const { $, $input, slider, events, fieldEvents } = open(t, { min: 5, max: 5, disable: true });
  const n = events.length;

  pressOn(slider, $, slider.$cache.s_single, 8, 300);
  clickTrack(slider, $, 400);
  key(slider, $, RIGHT);

  assert.deepEqual(after(events, n), []);
  assert.equal($input.val(), '5');
  assert.equal(fieldEvents(), 0);
});

// Characterization (green before and after the fix): a blocked slider's mask covers only the
// slider's own width, and a value label wider than the handle is not kept inside the container
// without force_edges. On a zero value range the handle sits at the left end, so a long label
// sticks out past the mask's left edge and a press there reaches the label (on a blocked slider
// with a value range the same gap is #921). A blocked slider whose min equals max therefore binds
// no handler, as in 2.6.0: no press on any part of it, no click and no key reports anything, in
// single and double type, numeric or values mode.
// Bugs caught: `this.options.block ||` dropped from the gate in bindEvents() (every press fires
// an onFinish, all four rows red); the block test narrowed to values mode (`(this.options.block
// && this.options.values.length) ||`), which reds the two numeric rows; the block test narrowed
// to single type (`(this.options.block && this.options.type === "single") ||`), which reds the
// two double rows.
const BLOCKED_ZERO = [
  ['single, one values entry', { values: ['Not available'], block: true }],
  ['single, min 5 max 5', { min: 5, max: 5, block: true }],
  ['double, min 5 max 5', { type: 'double', min: 5, max: 5, block: true }],
  ['double, one values entry, drag_interval', { type: 'double', values: ['Not available'], drag_interval: true, block: true }]
];
for (const [label, options] of BLOCKED_ZERO) {
  test(`min equals max with block (${label}): a press on the value label or a handle, a click and a key fire nothing (#896)`, (t) => {
    const { window, $, $input, slider, events, fieldEvents } = open(t, options);
    const c = slider.$cache;
    const handle = options.type === 'double' ? c.s_from : c.s_single;
    const value = $input.val();
    const n = events.length;

    assert.deepEqual(pageHandlers($, window, slider), { window: {}, body: {} }, 'nothing bound on the page');
    pressOn(slider, $, c.single, 8);
    pressOn(slider, $, handle, 8);
    if (options.type === 'double') pressOn(slider, $, c.bar, 8);
    clickTrack(slider, $, 400);
    key(slider, $, RIGHT);
    assert.deepEqual(after(events, n), [], 'blocked');
    assert.equal($input.val(), value);
    assert.equal(fieldEvents(), 0, 'no change or input event on the field');
  });
}

// The block toggle through update() on the first of those sliders: update() that turns block
// off binds the handlers; turning it back on unbinds them, so the page is left with none.
// Bugs caught: the 2.6.0 early return `if (this.no_diapason) { return; }` put back in
// bindEvents(): the first red assertion is "block turned off: the page handlers are bound";
// remove() without `this.$cache.win.off("mouseup.irs_" + this.plugin_count);`: the mouseup
// handler bound while block was off stays on the window after block is turned back on.
test('min equals max with block: update() turning block off binds the handlers, turning it on unbinds them (#896)', (t) => {
  const { window, $, $input, slider, events, fieldEvents } = open(t, { values: ['Not available'], block: true });

  slider.update({ block: false });
  prime(slider);
  assert.deepEqual(pageHandlers($, window, slider), PAGE_HANDLERS, 'block turned off: the page handlers are bound');
  let m = events.length;
  pressOn(slider, $, slider.$cache.single, 8);
  assert.deepEqual(after(events, m), ['onFinish'], 'block turned off by update()');

  slider.update({ block: true });
  prime(slider);
  assert.deepEqual(pageHandlers($, window, slider), { window: {}, body: {} }, 'block turned back on: no page handler left');
  m = events.length;
  pressOn(slider, $, slider.$cache.single, 8);
  assert.deepEqual(after(events, m), [], 'block turned back on by update()');

  assert.equal($input.val(), 'Not available');
  assert.equal(fieldEvents(), 0, 'no change or input event on the field');
});

// Characterization (green before and after the fix): a blocked slider with a value range keeps
// its handlers, as it always has; its mask covers the track, and key() drops the keys (#890).
// Only a blocked slider whose min equals max binds none.
// Bug caught: the block test moved out of the zero-range part of the gate (`if (isNaN(range) ||
// this.options.block || (range === 0 && (...)))`), which unbinds every blocked slider.
test('a blocked slider with a value range still binds its handlers (#896 pin)', (t) => {
  const { window, $, slider } = open(t, { min: 0, max: 100, block: true });
  assert.deepEqual(pageHandlers($, window, slider), PAGE_HANDLERS);
});

// readme keyboard: "Keyboard controls". With it off there is no keyboard interaction to report;
// the mouse still is one.
// Bug caught: bindEvents() binding keydown whatever `keyboard` says (`if (this.options.keyboard)`
// becomes `if (true)`), so each press fires an onFinish.
test('min equals max with keyboard: false: keys stay silent, a press still fires one onFinish (#896)', (t) => {
  const { $, slider, events } = open(t, { min: 5, max: 5, keyboard: false });
  const n = events.length;

  key(slider, $, RIGHT);
  key(slider, $, LEFT);
  assert.deepEqual(after(events, n), [], 'the keys');

  pressOn(slider, $, slider.$cache.s_single, 8);
  assert.deepEqual(after(events, n), ['onFinish'], 'the press');
});

// ---- a slider with a value range is unchanged ----------------------------------------------------

// Characterization (green before and after the fix): the same gestures on a slider with a value range
// report exactly what they reported before. A still press fires onFinish alone; a drag, a click
// and a key press move the value and fire onChange then onFinish.
// Bugs caught: pointerUp()'s callback condition becoming `if (false) {` (the still press and
// the drag lose their onFinish); calcWithStep()'s zero-range test true for a value range too
// (`this.options.min <= this.options.max`), so the drag and the key move nothing.
test('a slider with a value range: still press, drag, click and key report as before (#896 pin)', (t) => {
  const { $, $input, slider, events } = open(t, { min: 0, max: 100, from: 0, step: 1 });
  const c = slider.$cache;

  let n = events.length;
  pressOn(slider, $, c.s_single, 8);
  assert.deepEqual(after(events, n), ['onFinish'], 'still press');
  assert.equal($input.val(), '0');

  n = events.length;
  pressOn(slider, $, c.s_single, 8, 300);
  assert.deepEqual(after(events, n), ['onChange', 'onFinish'], 'drag');
  assert.equal($input.val(), '50');

  n = events.length;
  key(slider, $, RIGHT);
  assert.deepEqual(after(events, n), ['onChange', 'onFinish'], 'key');
  assert.equal($input.val(), '51');
});

// ---- update() and destroy() ----------------------------------------------------------------

// update() tears the slider down and builds it again, so a slider that goes from a value range to a
// zero value range binds its handlers once, not twice and not never.
// A second mouseup handler left bound by remove() would not show in the callback count (the
// first call clears is_active and the second returns early), so the page handlers are counted
// too.
// Bugs caught: the bindEvents() early return (nothing after the update); pointerUp()'s callback
// condition becoming `if (false) {` (the drag fires nothing); remove() keeping the window's
// mouseup (`this.$cache.win.off("mouseup.irs_" ...)` dropped), two mouseup handlers.
test('update() from a value range to a zero value range: each interaction then fires exactly one onFinish (#896)', (t) => {
  const { window, $, $input, slider, events } = open(t, { min: 0, max: 100, from: 30, step: 1 });
  slider.update({ min: 5, max: 5, from: 5 });
  prime(slider);
  assert.equal($input.val(), '5', 'setup: the update landed on the only value');
  assert.deepEqual(pageHandlers($, window, slider), PAGE_HANDLERS, 'one handler of each on the page');

  let n = events.length;
  pressOn(slider, $, slider.$cache.s_single, 8, 300);
  assert.deepEqual(after(events, n), ['onFinish'], 'drag');
  n = events.length;
  clickTrack(slider, $, 400);
  assert.deepEqual(after(events, n), ['onFinish'], 'track');
  n = events.length;
  key(slider, $, RIGHT);
  assert.deepEqual(after(events, n), ['onFinish'], 'key');
  assert.equal($input.val(), '5');
});

// Characterization (green before and after the fix): on 2.6.0 the update re-ran bindEvents()
// with the flag cleared, so nothing inert is left behind once the value range is back. The
// page-handler count is new: the zero-range slider now binds its own, and update() must leave
// exactly one of each.
// Bugs caught: init() keeping the zero value range's 0 % step through update() (`this.coords.p_step =
// is_update ? this.coords.p_step : this.convertToPercent(this.options.step, true);`), so the
// click and the key move nothing; calcWithStep()'s zero-range test true for a value range too;
// remove() keeping the window's mouseup, two mouseup handlers.
test('update() from a zero value range to a value range: the slider moves again with one onFinish per interaction (#896)', (t) => {
  const { window, $, $input, slider, events } = open(t, { min: 5, max: 5 });
  slider.update({ max: 15 });
  prime(slider);
  assert.equal($input.val(), '5', 'setup: from stays on 5');
  assert.deepEqual(pageHandlers($, window, slider), PAGE_HANDLERS, 'one handler of each on the page');

  let n = events.length;
  clickTrack(slider, $, 300);
  assert.deepEqual(after(events, n), ['onChange', 'onFinish'], 'track');
  assert.equal($input.val(), '10');

  n = events.length;
  key(slider, $, RIGHT);
  assert.deepEqual(after(events, n), ['onChange', 'onFinish'], 'key');
  assert.equal($input.val(), '11');

  n = events.length;
  pressOn(slider, $, slider.$cache.s_single, 308);
  assert.deepEqual(after(events, n), ['onFinish'], 'still press');
});

// destroy() leaves nothing of the slider on the page: no handler on the window or the body. With
// a zero value range now binding its handlers like any other slider, destroy() has them to
// remove.
// Bugs caught: remove() keeping the window's mouseup (`this.$cache.win.off("mouseup.irs_" ...)`
// dropped) or the body's mousemove (`this.$cache.body.off("mousemove.irs_" ...)` dropped): a
// handler of the destroyed slider stays on the page.
test('destroy() on a former zero-range slider leaves no handler behind (#896)', (t) => {
  const { window, $, slider } = open(t, { min: 5, max: 5 });
  assert.deepEqual(pageHandlers($, window, slider), PAGE_HANDLERS, 'setup: the live slider has its page handlers');

  slider.destroy();

  assert.deepEqual(pageHandlers($, window, slider), { window: {}, body: {} }, 'window and body');
});

// ---- what a press changes in the DOM -------------------------------------------------------

// A press on a zero-range handle does to the markup what a press does on any slider whose pair
// sits on one value and does not move: the pressed handle takes type_last (so it stays on top),
// state_hover lasts only while the button is down, and the track takes the focus.
// Bug caught: the bindEvents() early return: no class changes and the focus stays where it was.
test('min equals max, double: a press leaves the same classes and focus as on a pair sharing one value (#896)', (t) => {
  const zero = open(t, { type: 'double', min: 5, max: 5 });
  const range = open(t, { type: 'double', min: 0, max: 100, from: 0, to: 0, step: 1 });
  const classesOf = (s) => [s.$cache.s_from.attr('class'), s.$cache.s_to.attr('class')];

  for (const s of [zero, range]) {
    s.slider.$cache.s_from.trigger(s.$.Event('mousedown', { pageX: 8 }));
  }
  assert.deepEqual(classesOf(zero.slider), classesOf(range.slider), 'while the button is down');
  assert.match(zero.slider.$cache.s_from.attr('class'), /state_hover/);

  for (const s of [zero, range]) {
    s.slider.$cache.win.trigger(s.$.Event('mouseup', { pageX: 8 }));
    ticks(s.slider);
  }
  assert.deepEqual(classesOf(zero.slider), classesOf(range.slider), 'after the release');
  // Bug caught: pointerUp() without `this.$cache.cont.find(".state_hover").removeClass("state_hover");`,
  // so the hover state outlives the release (on both sliders alike, which the comparison above
  // cannot see).
  assert.doesNotMatch(zero.slider.$cache.s_from.attr('class'), /state_hover/, 'no hover state after the release');
  assert.equal(zero.window.document.activeElement, zero.slider.$cache.line[0], 'the track has the focus');
});

// ---- a value range that is not a number stays inert ----------------------------------------

// Characterization (green before and after the fix): validate() turns a min or max that is not a
// number into NaN: `min: 'abc'`, or `data-max="1,000"` (the comma stops the number). Such a slider
// has no scale to move on, and its result holds a NaN: result.from with `min: 'abc'`, result.to
// with `data-max="1,000"`. drawHandles() compares the old and new values with `!==`, and NaN is
// never equal to itself, so a bound slider would fire onChange and change/input on every press,
// key and click, once per frame through a held drag. It binds no handler, as it never has.
// Bug caught: `isNaN(range) ||` dropped from the gate in bindEvents(): each gesture fires
// onChange, onFinish and change/input.
for (const [html, options, label] of [
  ['<input>', { min: 'abc', max: 10 }, "min: 'abc'"],
  ['<input data-max="1,000">', {}, 'data-max="1,000"']
]) {
  test(`a value range that is not a number (${label}): presses, keys and clicks fire nothing (#896)`, (t) => {
    const events = [];
    const record = (type) => function (r) { events.push(type); };
    const { $, $input, slider } = createSlider(t, html, Object.assign({}, options, {
      onChange: record('onChange'), onFinish: record('onFinish'), onUpdate: record('onUpdate')
    }));
    assert.ok(isNaN(slider.options.max - slider.options.min), 'setup: validate() left a value range that is not a number');
    prime(slider);
    let fieldEvents = 0;
    $input.on('change input', function () { fieldEvents++; });
    const n = events.length;

    pressOn(slider, $, slider.$cache.s_single, 8, 300);
    key(slider, $, RIGHT);
    clickTrack(slider, $, 400);

    assert.deepEqual(events.slice(n), []);
    assert.equal(fieldEvents, 0, 'no change or input event on the field');
  });
}

// Characterization (green before and after the fix): a min of Infinity comes out of validate()
// with max raised to Infinity too, whether it is set with `data-min="Infinity"` or with
// `{min: Infinity, max: 5}` or `{min: Infinity, max: -Infinity}`. Infinity minus Infinity is
// NaN, so this value range is not a number either, and the slider stays inert as in 2.6.0: no
// handler on the page, no callback after a press, a key or a click, no change or input event.
// Bugs caught: the gate's `isNaN(range)` keyed on each end instead (`isNaN(this.options.min) ||
// isNaN(this.options.max)`), which binds these sliders; `isNaN(range) ||` dropped from the gate.
for (const [html, options, label] of [
  ['<input data-min="Infinity">', {}, 'data-min="Infinity"'],
  ['<input>', { min: Infinity, max: 5 }, '{min: Infinity, max: 5}'],
  ['<input>', { min: Infinity, max: -Infinity }, '{min: Infinity, max: -Infinity}']
]) {
  test(`min and max both Infinity (${label}): no handler is bound, and presses, keys and clicks fire nothing (#896)`, (t) => {
    const events = [];
    const record = (type) => function (r) { events.push(type); };
    const { window, $, $input, slider } = createSlider(t, html, Object.assign({}, options, {
      onChange: record('onChange'), onFinish: record('onFinish'), onUpdate: record('onUpdate')
    }));
    assert.equal(slider.options.min, Infinity, 'setup: min');
    assert.equal(slider.options.max, Infinity, 'setup: max');
    prime(slider);
    let fieldEvents = 0;
    $input.on('change input', function () { fieldEvents++; });
    const n = events.length;

    assert.deepEqual(pageHandlers($, window, slider), { window: {}, body: {} }, 'nothing bound on the page');
    pressOn(slider, $, slider.$cache.s_single, 8);
    key(slider, $, RIGHT);
    clickTrack(slider, $, 400);

    assert.deepEqual(events.slice(n), []);
    assert.equal(fieldEvents, 0, 'no change or input event on the input');
  });
}

// ---- a zero value range of values that are not the same number stays inert ---------------

// Characterization (green before and after the fix): validate() converts only strings, so a min
// or max given as a boolean, an array or a Number object stays one: `{min: 0, max: false}`,
// `{min: 1, max: true}` (also `data-max="false"`, which jQuery's .data() reads as the boolean
// false), `{min: [5], max: [5]}`, `{min: 5, max: new Number(5)}` and `{min: true, max: true}`,
// and one Number object or one array given as both min and max. Their difference is 0, but min and max are not the same
// number, and 2.6.0 bound nothing for them. They stay inert, blocked or not: no handler on the
// page, no callback after a press on a handle or the value label, a key or a click, and no change
// or input event. (An earlier form of this fix bound them, which these rows caught.)
// Bugs caught: the gate as `if (isNaN(this.options.max - this.options.min) ||
// (this.options.block && this.options.min === this.options.max))`, which binds every row; the
// `typeof this.options.min !== "number"` test dropped, which binds the two rows that pass one
// object as both min and max and the `{min: true, max: true}` row; that test narrowed to
// `typeof this.options.min === "object"`, which binds the `{min: true, max: true}` row; the
// `this.options.min !== this.options.max` test dropped, which binds the unblocked rows
// `{min: 0, max: false}`, `{min: 1, max: true}`, `data-max="false"` and `{min: 5, max: new
// Number(5)}` (`{min: true, max: true}` stays inert there through the typeof test); the blocked
// twins stay inert through the block test and catch the earlier `block && min === max` form of the
// gate.
const ONE_NUMBER_OBJECT = new Number(5);
const ONE_ARRAY = [5];
const NOT_THE_SAME_NUMBER = [
  ['<input>', { min: 0, max: false }, '{min: 0, max: false}'],
  ['<input>', { min: 1, max: true }, '{min: 1, max: true}'],
  ['<input>', { min: [5], max: [5] }, '{min: [5], max: [5]}'],
  ['<input>', { min: 5, max: new Number(5) }, '{min: 5, max: new Number(5)}'],
  ['<input data-max="false">', { min: 0 }, 'data-max="false" with min 0'],
  ['<input>', { min: ONE_NUMBER_OBJECT, max: ONE_NUMBER_OBJECT }, 'one Number object as min and max'],
  ['<input>', { min: ONE_ARRAY, max: ONE_ARRAY }, 'one array as min and max'],
  ['<input>', { min: true, max: true }, '{min: true, max: true}'],
  ['<input>', { min: 0, max: false, block: true }, '{min: 0, max: false, block: true}'],
  ['<input>', { min: 1, max: true, block: true }, '{min: 1, max: true, block: true}'],
  ['<input>', { min: [5], max: [5], block: true }, '{min: [5], max: [5], block: true}'],
  ['<input>', { min: 5, max: new Number(5), block: true }, '{min: 5, max: new Number(5), block: true}']
];
for (const [html, options, label] of NOT_THE_SAME_NUMBER) {
  test(`a zero value range of values that are not the same number (${label}): no handler, nothing fires (#896)`, (t) => {
    const events = [];
    const record = (type) => function (r) { events.push(type); };
    const { window, $, $input, slider } = createSlider(t, html, Object.assign({}, options, {
      onChange: record('onChange'), onFinish: record('onFinish'), onUpdate: record('onUpdate')
    }));
    assert.equal(slider.options.max - slider.options.min, 0, 'setup: the value range is zero');
    prime(slider);
    let fieldEvents = 0;
    $input.on('change input', function () { fieldEvents++; });
    const n = events.length;

    assert.deepEqual(pageHandlers($, window, slider), { window: {}, body: {} }, 'nothing bound on the page');
    pressOn(slider, $, slider.$cache.single, 8);
    pressOn(slider, $, slider.$cache.s_single, 8, 300);
    key(slider, $, RIGHT);
    clickTrack(slider, $, 400);

    assert.deepEqual(events.slice(n), []);
    assert.equal(fieldEvents, 0, 'no change or input event on the input');
  });
}

// Characterization (green before and after the fix): a value range from -Infinity to Infinity
// is not zero and not NaN, so the slider binds its handlers, as it did in 2.6.0.
// Bug caught: the gate's first test widened to `!isFinite(this.options.max - this.options.min)`,
// which leaves this slider without handlers.
test('min -Infinity, max Infinity: the slider still binds its handlers (#896 pin)', (t) => {
  const { window, $, slider } = createSlider(t, '<input>', { min: -Infinity, max: Infinity });
  assert.deepEqual(pageHandlers($, window, slider), PAGE_HANDLERS);
});

// ---- the layout of a zero value range computes no NaN -------------------------------------

// calc()'s "base" case lays the handles out from the result (at build, update(), reset() and on
// every width change). It divided by `(max - min) / 100`, which is 0 on a zero value range, and
// wrote NaN into p_single_real, p_from_real and p_to_real until checkDiapason() turned it into 0
// a statement later. This watches the three positions the "base" case writes, from the first
// layout on: the first width (jsdom has none at build, so the first layout runs when the width
// arrives), an update(), and a width change between mousedown and mouseup. Only the *_real
// positions are watched: right after update() jsdom has no width again, so p_handle (handle width
// over track width) is 0 / 0 on any slider, which has nothing to do with the value range.
// Bug caught: the "base" case without its zero-range branch, so f and t come from 0 / 0.
for (const options of [{ min: 5, max: 5 }, { type: 'double', min: 5, max: 5 }]) {
  test(`min equals max (${options.type || 'single'}): no layout writes NaN into the coordinates (#896)`, (t) => {
    const events = [];
    const record = (type) => function (r) { events.push(type); };
    const { $, slider } = createSlider(t, '<input>', Object.assign({}, options, {
      onChange: record('onChange'), onFinish: record('onFinish')
    }));
    const bad = [];
    slider.coords = new Proxy(slider.coords, {
      set(target, prop, value) {
        if (/_real$/.test(String(prop)) && !isFinite(value)) bad.push(`${String(prop)} = ${value}`);
        target[prop] = value;
        return true;
      }
    });
    prime(slider);

    slider.update({ from: 5 });
    prime(slider);

    const handle = options.type === 'double' ? slider.$cache.s_from : slider.$cache.s_single;
    handle.trigger($.Event('mousedown', { pageX: 8 }));
    slider.$cache.rs.outerWidth = function () { return 500; };
    slider.drawHandles();
    slider.$cache.win.trigger($.Event('mouseup', { pageX: 8 }));
    ticks(slider);

    assert.deepEqual(bad, []);
    assert.deepEqual(events, ['onFinish'], 'the press across the width change still ends with one onFinish');
  });
}
