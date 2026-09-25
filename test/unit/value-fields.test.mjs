import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSlider } from './helpers.mjs';

// #883: readme "Callback data": from_value and to_value are "the entry at this index when
// values is used (null on a slider without values)". updateFrom() and updateTo() tested
// `if (this.options.values)`, which is true for the empty array validate() leaves on a
// slider without values, and then read `this.options.values[this.result.from]` from that
// empty array: the first update() or reset() turned both fields undefined, and nothing
// wrote them back, so every later onChange and onFinish carried undefined too.
//
// Each callback hands out the same result object, rewritten in place, so the recorder
// copies the two fields at the moment the callback runs; what a test reads afterwards is
// what that callback's handler saw.
//
// jsdom has no layout (see helpers.mjs), so calc() bails at init and on update(); the drag
// rows stub the slider to 600 px with 16 px handles, the pattern
// drag-end-callbacks.test.mjs uses, and then drive the real pointerDown / pointerMove /
// pointerUp code. Real geometry and rendering belong to the browser suite
// (test/browser/contract/callbacks.spec.mjs).

const TYPES = ['single', 'double'];

const PLAIN = {
  single: { type: 'single', min: 0, max: 100, from: 30, step: 1 },
  double: { type: 'double', min: 0, max: 100, from: 30, to: 70, step: 1 }
};

// Strings, so an entry can never be mistaken for its index.
const ENTRIES = ['a', 'b', 'c', 'd', 'e'];
const VALUES = {
  single: { type: 'single', values: ENTRIES, from: 1 },
  double: { type: 'double', values: ENTRIES, from: 1, to: 3 }
};
// to_value of each VALUES slider after an update() that keeps its `to`.
const LAST_TO = { single: 'e', double: 'd' };

/** Callbacks that copy what each handler saw, in firing order. */
function recorder() {
  const events = [];
  const record = (type) => (data) => {
    events.push({ type, from: data.from, from_value: data.from_value, to_value: data.to_value });
  };
  return {
    events,
    options: {
      onStart: record('onStart'),
      onChange: record('onChange'),
      onFinish: record('onFinish'),
      onUpdate: record('onUpdate')
    }
  };
}

/** The events recorded since `n`, as the two fields under test. */
const valueFields = (rec, n) => rec.events.slice(n).map((e) => ({ type: e.type, from_value: e.from_value, to_value: e.to_value }));

/**
 * Give the current DOM a 600 px track and 16 px handles, then settle one draw so the
 * resize it looks like is not mistaken for the drag. update() and reset() rebuild the
 * DOM, so this runs again after either.
 */
function prime(slider) {
  const $c = slider.$cache;
  $c.rs.outerWidth = () => 600;
  $c.rs.offset = () => ({ left: 0 });
  for (const handle of [$c.s_single, $c.s_from, $c.s_to]) {
    if (handle) handle.outerWidth = () => 16;
  }
  slider.drawHandles();
}

/**
 * Drag the single handle (or the from handle) to real percent `real` and release it.
 * The press lands exactly on the handle, so the pointer's offset from the handle stays 0
 * and the move converts straight to the value at `real`.
 */
function dragFromTo(slider, real) {
  prime(slider);
  const single = slider.options.type === 'single';
  const fake = single ? slider.coords.p_single_fake : slider.coords.p_from_fake;
  slider.pointerDown(single ? 'single' : 'from', { pageX: fake / 100 * 600, preventDefault() {} });
  slider.pointerMove({ pageX: slider.convertToFakePercent(real) / 100 * 600 });
  slider.pointerUp({});
}

// ------------------------------------------------------------ a slider without values

for (const type of TYPES) {
  // Green before and after the #883 fix: the constructor's result object starts both
  // fields at null and nothing writes them before onStart.
  // Mutation caught: the constructor's result object -> `from_value: null,` becomes
  // `from_value: undefined,` (or `to_value: null,` becomes `to_value: undefined,`).
  test(`${type}, no values: onStart carries from_value and to_value null (#883)`, (t) => {
    const rec = recorder();
    createSlider(t, '<input>', { ...PLAIN[type], ...rec.options });
    assert.deepEqual(valueFields(rec, 0), [{ type: 'onStart', from_value: null, to_value: null }]);
  });

  // Red before the fix: onUpdate carried undefined/undefined.
  // Mutation caught: updateFrom() -> `if (this.options.values.length) {` becomes
  // `if (this.options.values) {` (the truthiness check #883 fixed), and from_value comes
  // back undefined; the same change in updateTo() does it to to_value.
  test(`${type}, no values: update({ from }) hands onUpdate from_value and to_value null (#883)`, (t) => {
    const rec = recorder();
    const { slider } = createSlider(t, '<input>', { ...PLAIN[type], ...rec.options });
    const n = rec.events.length;

    slider.update({ from: 40 });

    assert.equal(rec.events.at(-1).from, 40, 'setup: update() must have moved from to 40');
    assert.deepEqual(valueFields(rec, n), [{ type: 'onUpdate', from_value: null, to_value: null }]);
  });

  // Red before the fix, for the same reason: reset() rewrites the result through
  // updateResult() and then runs update().
  // Mutation caught: the truthiness check back in updateFrom() or updateTo(), as above.
  test(`${type}, no values: reset() hands onUpdate from_value and to_value null (#883)`, (t) => {
    const rec = recorder();
    const { slider } = createSlider(t, '<input>', { ...PLAIN[type], ...rec.options });
    const n = rec.events.length;

    slider.reset();

    assert.deepEqual(valueFields(rec, n), [{ type: 'onUpdate', from_value: null, to_value: null }]);
  });

  // Red before the fix: calc() writes neither field on a slider without values, so the
  // undefined left by update() or reset() reached every later onChange and onFinish.
  // Mutation caught: the truthiness check back in updateFrom() or updateTo(), as above.
  test(`${type}, no values: a drag after update() and reset() hands onChange and onFinish from_value and to_value null (#883)`, (t) => {
    const rec = recorder();
    const { slider } = createSlider(t, '<input>', { ...PLAIN[type], ...rec.options });
    slider.update({ from: 40 });
    slider.reset();
    const n = rec.events.length;

    dragFromTo(slider, 60);

    assert.equal(slider.result.from, 60, 'setup: the drag must land on 60');
    assert.deepEqual(valueFields(rec, n), [
      { type: 'onChange', from_value: null, to_value: null },
      { type: 'onFinish', from_value: null, to_value: null }
    ]);
  });

  // A slider that leaves values mode through update() is a slider without values from
  // then on, and its fields go back to null; before the fix they came back undefined, and
  // a fix without the null branch would keep the last entry.
  // Mutation caught: the null branch removed from updateFrom() (`} else {
  // this.result.from_value = null; }` deleted), and from_value keeps "b"; the same
  // deletion in updateTo() leaves to_value on the entry it held. This is the only row
  // that catches it: a slider built without values starts at null and would stay there.
  test(`${type}: update({ values: [] }) leaves values mode with from_value and to_value null (#883)`, (t) => {
    const rec = recorder();
    const { slider } = createSlider(t, '<input>', { ...VALUES[type], ...rec.options });
    // Guard: the fields must hold entries before the update, or a missing null branch
    // would have nothing stale to keep and this row would prove nothing. jsdom's init
    // leaves them null (calc() bails), so an update() writes them first.
    slider.update({ from: 1 });
    assert.equal(rec.events.at(-1).from_value, 'b', 'setup: values mode must report the entry first');
    // The entry at `to`: 3 on the double slider, and max (4) on a single one, which
    // validate() gives the `to` it was never set. The single half relies on updateTo()
    // filling a single slider's to_value after an update: until then it is null (the
    // values-mode twin of #909). If that ever changes, this guard fires first, and the
    // double row still covers updateTo()'s null branch.
    assert.equal(rec.events.at(-1).to_value, LAST_TO[type], 'setup: to_value must hold its entry first');
    const n = rec.events.length;

    slider.update({ values: [], min: 0, max: 100, from: 40, to: 70 });

    assert.equal(rec.events.at(-1).from, 40, 'setup: the update must leave values mode');
    assert.deepEqual(valueFields(rec, n), [{ type: 'onUpdate', from_value: null, to_value: null }]);
  });
}

// -------------------------------------------------------------------------- values mode

// Values mode is untouched by #883; these rows are green before and after the fix.

// Mutation caught (single): calc() -> the single branch's
// `this.result.from_value = this.options.values[this.result.from];` deleted, and the drag
// reports from_value null. Double: the same line, or its to_value twin, deleted from
// calc()'s double branch.
test('single, values mode: a drag before any update() hands onChange and onFinish the entry', (t) => {
  const rec = recorder();
  const { slider } = createSlider(t, '<input>', { ...VALUES.single, ...rec.options });
  const n = rec.events.length;

  dragFromTo(slider, 50);

  assert.equal(slider.result.from, 2, 'setup: the drag must land on index 2');
  assert.deepEqual(rec.events.slice(n).map((e) => [e.type, e.from_value]), [
    ['onChange', 'c'],
    ['onFinish', 'c']
  ]);
});

test('double, values mode: a drag before any update() hands onChange and onFinish the entries', (t) => {
  const rec = recorder();
  const { slider } = createSlider(t, '<input>', { ...VALUES.double, ...rec.options });
  const n = rec.events.length;

  dragFromTo(slider, 50);

  assert.equal(slider.result.from, 2, 'setup: the drag must land on index 2');
  assert.deepEqual(valueFields(rec, n), [
    { type: 'onChange', from_value: 'c', to_value: 'd' },
    { type: 'onFinish', from_value: 'c', to_value: 'd' }
  ]);
});

// Mutation caught: updateFrom() -> `this.result.from_value = this.options.values[this.result.from];`
// becomes `this.result.from_value = null;` (a fix for #883 that forgot values mode), and
// onUpdate reports from_value null; in updateTo() the same change reds the double row's
// to_value.
test('single, values mode: update() hands onUpdate the entry, and a later drag the next one', (t) => {
  const rec = recorder();
  const { slider } = createSlider(t, '<input>', { ...VALUES.single, ...rec.options });
  const n = rec.events.length;

  slider.update({ from: 3 });
  dragFromTo(slider, 25);

  assert.deepEqual(rec.events.slice(n).map((e) => [e.type, e.from, e.from_value]), [
    ['onUpdate', 3, 'd'],
    ['onChange', 1, 'b'],
    ['onFinish', 1, 'b']
  ]);
});

test('double, values mode: update() hands onUpdate the entries', (t) => {
  const rec = recorder();
  const { slider } = createSlider(t, '<input>', { ...VALUES.double, ...rec.options });
  const n = rec.events.length;

  slider.update({ from: 0, to: 4 });

  assert.deepEqual(valueFields(rec, n), [{ type: 'onUpdate', from_value: 'a', to_value: 'e' }]);
});

// reset() goes back to the from and to the slider was created or last updated with, and
// hands onUpdate the entries there, not the ones the drag left.
// Mutation caught: the same `= null;` change in updateFrom() or updateTo() as above.
test('single, values mode: reset() after a drag hands onUpdate the entry it goes back to', (t) => {
  const rec = recorder();
  const { slider } = createSlider(t, '<input>', { ...VALUES.single, ...rec.options });
  dragFromTo(slider, 75);
  assert.equal(rec.events.at(-1).from_value, 'd', 'setup: the drag must land on "d"');
  const n = rec.events.length;

  slider.reset();

  assert.deepEqual(rec.events.slice(n).map((e) => [e.type, e.from, e.from_value]), [['onUpdate', 1, 'b']]);
});

test('double, values mode: reset() after a drag hands onUpdate the entries it goes back to', (t) => {
  const rec = recorder();
  const { slider } = createSlider(t, '<input>', { ...VALUES.double, ...rec.options });
  dragFromTo(slider, 50);
  assert.equal(rec.events.at(-1).from_value, 'c', 'setup: the drag must land on "c"');
  const n = rec.events.length;

  slider.reset();

  assert.deepEqual(valueFields(rec, n), [{ type: 'onUpdate', from_value: 'b', to_value: 'd' }]);
});
