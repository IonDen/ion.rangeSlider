import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSlider } from './helpers.mjs';

// #869: `step_from_min` (new, default false) counts the step scale from
// `min` instead of from zero. Off, convertToValue() rounds its result to the
// decimals of `step`, so an integer step always lands on whole numbers and a
// fractional `min` is dropped: {min: 0.5, max: 10.5, step: 1} snaps to 2, 3,
// 4 rather than to its own scale 1.5, 2.5, 3.5. On, the value is min plus a
// whole number of steps, so the scale starts at min and the final rounding
// only cleans binary float noise.
//
// Turning this on by default would move values for anyone using a config
// like {min: 0.01, step: 1} to keep zero out of the range (1, 2, 3 would
// become 1.01, 2.01, 3.01), which is why it is opt-in. The tests below pin
// both sides: the new scale when the option is on, and today's values when
// it is off.
//
// jsdom has no layout (see helpers.mjs), so convertToValue() and appendGrid()
// are exercised directly; the two tests that need a real handle position stub
// the geometry the way the drag tests do. The user-visible surface (bubbles,
// input value, grid text, keyboard) is covered in
// test/browser/step-from-min.spec.mjs.

/**
 * jsdom has no real layout: stub $cache.rs.outerWidth()/.offset() to a fixed
 * 600px-wide slider and the single handle to 16px, mirroring the browser
 * fixture's flat-skin geometry (the same primeSingle() as
 * test/unit/drag-end-callbacks.test.mjs). The one drawHandles() pass settles
 * the resize branch, which is also what round-trips the initial `from`
 * through calc()'s "base" case and convertToValue().
 */
function primeSingle(slider) {
  slider.$cache.rs.outerWidth = function () { return 600; };
  slider.$cache.rs.offset = function () { return { left: 0 }; };
  slider.$cache.s_single.outerWidth = function () { return 16; };
  slider.drawHandles();
}

function gridTexts(slider) {
  return slider.$cache.grid.find('.irs-grid-text').map(function () { return this.textContent; }).get();
}

// T1. One-line bug this catches: no `step_from_min` branch in
// convertToValue() at all (the option is read but ignored) -- the existing
// integer-step path rounds to whole numbers and returns 2 and 3.
test('step_from_min puts {min: 0.5, max: 10.5, step: 1} on its own 0.5, 1.5, 2.5 scale (#869)', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 0.5, max: 10.5, step: 1, step_from_min: true });

  assert.equal(slider.convertToValue(10), 1.5);
  assert.equal(slider.convertToValue(20), 2.5);
});

// T2. One-line bug this catches: rounding the result to the step's decimals
// instead of snapping to the min-anchored lattice -- 0.75 and 1.25 would come
// back as 0.8 and 1.3 (the step has one decimal, the scale needs two).
test('step_from_min keeps a min with more decimals than the step, {0.25, 9.75, 0.5} (#869)', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 0.25, max: 9.75, step: 0.5, step_from_min: true });

  const p1 = slider.convertToPercent(0.75);
  assert.equal(slider.convertToValue(p1), 0.75, `convertToValue(${p1}) must be the first point above min`);

  const p2 = slider.convertToPercent(1.25);
  assert.equal(slider.convertToValue(p2), 1.25, `convertToValue(${p2}) must be the second point above min`);
});

// T3. One-line bug this catches: anchoring the lattice at zero rather than at
// min -- the three presses would read 1, 2, 3 instead of 1.01, 2.01, 3.01.
// Drives the real keyboard path (pointerFocus + moveByKey), so it also proves
// the option survives calc()'s step snapping, not just a direct call.
test('step_from_min: arrow keys walk {min: 0.01, max: 10, step: 1} as 1.01, 2.01, 3.01 (#869)', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 0.01, max: 10, step: 1, step_from_min: true });
  primeSingle(slider);

  assert.equal(slider.result.from, 0.01, 'the handle starts at min');

  slider.pointerFocus({});
  assert.equal(slider.target, 'single', 'a fresh focus must arm the single handle');

  const seen = [];
  for (let i = 0; i < 3; i++) {
    slider.moveByKey(true);
    seen.push(slider.result.from);
  }
  assert.deepEqual(seen, [1.01, 2.01, 3.01]);
});

// T4. One-line bug this catches: applying the existing negative-min shift
// inside the new branch (or rounding to the step's one decimal) -- both give
// the 2.4.2 values -39.9 and -39.8, half a step off this config's own scale.
test('step_from_min keeps a negative min with more decimals than the step, {-39.95, 111, 0.1} (#869)', (t) => {
  const { slider } = createSlider(t, '<input>', { type: 'double', min: -39.95, max: 111, step: 0.1, step_from_min: true });

  const p1 = slider.convertToPercent(-39.85);
  assert.equal(slider.convertToValue(p1), -39.85, `convertToValue(${p1}) must be min + one step`);

  const p2 = slider.convertToPercent(-39.75);
  assert.equal(slider.convertToValue(p2), -39.75, `convertToValue(${p2}) must be min + two steps`);
});

// T5. One-line bug this catches: the same rounding-to-step-decimals defect at
// a two-decimal negative min with a half step -- the three step positions
// would read -198, -197.5, -197 instead of staying on min's own scale.
test('step_from_min walks {-198.53, 100, 0.5} from min in half steps (#869)', (t) => {
  const { slider } = createSlider(t, '<input>', { type: 'double', min: -198.53, max: 100, step: 0.5, step_from_min: true });

  const snapped = (k) => slider.calcWithStep(slider.coords.p_step * k);
  const seen = [1, 2, 3].map((k) => slider.convertToValue(snapped(k)));

  assert.deepEqual(seen, [-198.03, -197.53, -197.03]);
});

// T6. Regression guard for #760, green before and after this feature: with
// the option on, {min: -39.9, max: 111, step: 1} must still produce the clean
// lattice points and grid labels #760 fixed. The mutation with catching power
// here: size the new branch's final rounding from the step's decimals alone
// (`precision = this.getDecimalPlaces(this.options.step)`) -- the binary float
// noise comes straight back, 0.10000000000000142 / -15.899999999999999 and a
// "-1.9000000000000057" grid label.
test('step_from_min leaves the #760 config free of float noise, values and grid (#869)', (t) => {
  const { slider } = createSlider(t, '<input>', {
    type: 'double', min: -39.9, max: 111, step: 1, step_from_min: true, grid: true, grid_num: 4
  });

  const nearZero = slider.convertToPercent(0);
  assert.equal(slider.convertToValue(nearZero), 0.1);

  const near16 = slider.convertToPercent(-16);
  assert.equal(slider.convertToValue(near16), -15.9);

  assert.deepEqual(gridTexts(slider), ['-39.9', '-1.9', '35.1', '73.1', '111']);
});

// T7. Controls: for a config whose scale already starts on a step boundary
// the option must change nothing at all. Compared against a second slider
// built with the option off, so any drift shows up as a difference rather
// than needing a hand-maintained expectation, and against the literal values
// so a defect shared by both paths cannot hide. One-line bug this catches: an
// off-by-one in the step count (`Math.round(offset / step) + 1`) -- every
// value below moves one step up.
test('step_from_min is a no-op for configs whose scale already starts on a step (#869)', (t) => {
  const cases = [
    { config: { min: 1.5, max: 2.5, step: 0.25 }, percents: [0, 25, 50, 75, 100], expected: [1.5, 1.75, 2, 2.25, 2.5] },
    { config: { min: 0, max: 100, step: 1 }, percents: [0, 25, 50, 75, 100], expected: [0, 25, 50, 75, 100] },
    { config: { min: 10, max: 20, step: 0.5 }, percents: [5, 25, 50, 75, 100], expected: [10.5, 12.5, 15, 17.5, 20] },
    { config: { min: 0, max: 1, step: 1e-8 }, percents: [12, 33, 50], expected: [0.12, 0.33, 0.5] }
  ];

  for (const { config, percents, expected } of cases) {
    const on = createSlider(t, '<input>', { ...config, step_from_min: true }).slider;
    const off = createSlider(t, '<input>', config).slider;
    const label = JSON.stringify(config);

    assert.deepEqual(percents.map((p) => on.convertToValue(p)), expected, `step_from_min on, ${label}`);
    assert.deepEqual(percents.map((p) => off.convertToValue(p)), expected, `step_from_min off, ${label}`);
  }
});

// T8. One-line bug this catches: reading the option only on the handle path,
// so grid ticks keep the from-zero rounding -- the labels would read 2.6 and
// 7.4 where this config's scale has 2.75 and 7.25.
test('step_from_min moves the grid labels onto the same scale, {0.25, 9.75, 0.5} (#869)', (t) => {
  const { slider } = createSlider(t, '<input>', {
    min: 0.25, max: 9.75, step: 0.5, step_from_min: true, grid: true
  });

  assert.deepEqual(gridTexts(slider), ['0.25', '2.75', '5.25', '7.25', '9.75']);
});

// T8b, grid_snap: every tick is one step apart, so the whole scale is visible
// at once. Same one-line bug as T8.
test('step_from_min with grid_snap labels every step from min, {0.25, 9.75, 0.5} (#869)', (t) => {
  const { slider } = createSlider(t, '<input>', {
    min: 0.25, max: 9.75, step: 0.5, step_from_min: true, grid: true, grid_snap: true
  });

  const expected = [];
  for (let i = 0; i <= 19; i++) {
    expected.push(String(0.25 + i * 0.5));
  }
  assert.deepEqual(gridTexts(slider), expected);
});

// T9. One-line bug this catches: reading the option only inside the keyboard
// or drag paths -- calc()'s "base" case round-trips the initial `from` through
// convertToValue() on the first render, so an off-scale initial value would be
// rewritten to 3 at first paint even though nobody touched the handle.
test('step_from_min keeps an initial from: 2.5 at 2.5, at first render and after update() (#869)', (t) => {
  const { slider } = createSlider(t, '<input>', {
    min: 0.5, max: 10.5, step: 1, from: 2.5, step_from_min: true
  });
  primeSingle(slider);

  assert.equal(slider.result.from, 2.5, 'first render must keep the initial value');

  slider.update({});
  primeSingle(slider);

  assert.equal(slider.result.from, 2.5, 'update() must keep the initial value');
});

// T9b, the default-off twin: characterization of today's behavior, green
// before and after. Mutation with catching power: make the new branch
// unconditional (drop the `this.options.step_from_min` test) -- from would
// stay 2.5 here instead of being rewritten to 3.
test('without step_from_min an initial from: 2.5 still renders as 3 (#869)', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 0.5, max: 10.5, step: 1, from: 2.5 });
  primeSingle(slider);

  assert.equal(slider.result.from, 3);
});

// T10. Default-off twins for T1, T2 and T4: characterization of the 2.4.2
// values, green before and after. Same mutation as T9b: making the new branch
// unconditional turns every one of these into its min-anchored counterpart
// (1.5 / 2.5, 0.75 / 1.25, -39.85 / -39.75).
test('with step_from_min off every scale stays exactly where 2.4.2 put it (#869)', (t) => {
  const a = createSlider(t, '<input>', { min: 0.5, max: 10.5, step: 1 }).slider;
  assert.equal(a.convertToValue(10), 2);
  assert.equal(a.convertToValue(20), 3);

  const b = createSlider(t, '<input>', { min: 0.25, max: 9.75, step: 0.5 }).slider;
  assert.equal(b.convertToValue(b.convertToPercent(0.75)), 0.8);
  assert.equal(b.convertToValue(b.convertToPercent(1.25)), 1.3);

  const c = createSlider(t, '<input>', { type: 'double', min: -39.95, max: 111, step: 0.1 }).slider;
  assert.equal(c.convertToValue(c.convertToPercent(-39.85)), -39.9);
  assert.equal(c.convertToValue(c.convertToPercent(-39.75)), -39.8);
});

// T11. One-line bug this catches: no `step_from_min: $inp.data("stepFromMin")`
// line in config_from_data -- the attribute is silently ignored and the JS
// option survives. The strict equal also pins jQuery's data() string->boolean
// coercion: a stray .attr() read would leave the string "true".
test('data-step-from-min="true" turns the option on (#869)', (t) => {
  const { slider } = createSlider(t, '<input data-step-from-min="true">', { min: 0.5, max: 10.5, step: 1 });

  assert.equal(slider.options.step_from_min, true);
  assert.equal(slider.convertToValue(10), 1.5);
});

// T11b, the other direction, so a wiring that only honours a truthy attribute
// (an `||` instead of the `undefined`/"" strip config_from_data already uses)
// is caught too.
test('data-step-from-min="false" overrides a JS step_from_min: true (#869)', (t) => {
  const { slider } = createSlider(t, '<input data-step-from-min="false">', {
    min: 0.5, max: 10.5, step: 1, step_from_min: true
  });

  assert.equal(slider.options.step_from_min, false);
  assert.equal(slider.convertToValue(10), 2);
});

// The default itself, so a change of mind about opting in shows up here.
test('step_from_min defaults to false (#869)', (t) => {
  const { slider } = createSlider(t, '<input>', { min: 0, max: 100 });

  assert.equal(slider.options.step_from_min, false);
});

// T12. Known limit of the scale, pinned on purpose so a change to it is a
// deliberate one. Limits are clamped in percent and the clamped percent then
// lands on the nearest scale point like any other value, so a from_max that
// is not on the scale is crossed by half a step: from_max 5 on the 0.5, 1.5,
// ... scale becomes 5.5 (round half up). The default path does the same for
// integer steps (from_min 2.4 lands on 2). Reds if the clamp helpers learn
// to snap inward (ceil for a lower limit, floor for an upper one), which is
// the fix a follow-up issue tracks; the readme row therefore asks users to
// put limits on the scale.
test('a from_max off the scale is crossed by half a step with step_from_min on, pinned (#869)', (t) => {
  const { slider } = createSlider(t, '<input>', {
    min: 0.5, max: 10.5, step: 1, from_max: 5, step_from_min: true
  });

  assert.equal(slider.convertToValue(slider.convertToPercent(5)), 5.5);
});
