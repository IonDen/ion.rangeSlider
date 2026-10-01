import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSlider } from './helpers.mjs';

// #898: readme Settings, hide_from_to: "Hide the from and to value labels", off by default,
// so a double slider shows its values. When the from and to value labels would overlap,
// drawLabels() shows the merged label in their place; when the two handles sit on one
// value it shows ONE value label instead (the merged one would read "30 — 30"): the label
// of the handle being moved, and the from label when no handle is moving. A track click
// with drag_interval moves the whole interval, so the slider's target is the interval, not
// one handle, and up to 2.5.0 drawLabels() showed no label at all for it: the merged label
// and both value labels came out hidden, and every key press after the click (which moves
// the interval the same way) drew the same nothing. The fix shows the from label for any
// target that is not one handle, as the no-target case already did: for a pair on one
// value its text and its place are the to label's.
//
// jsdom has no layout (see helpers.mjs), so the geometry is stubbed the way the other drag
// and click tests stub it: a 600 px track with 16 px handles, plus widths for the value
// labels, which drawLabels() compares to decide whether they overlap (30 px for a value
// label, 60 px for the merged one). The gestures go through the real pointerClick(),
// pointerDown()/pointerMove()/pointerUp() and keydown paths; drawHandles() is the render
// tick the idle loop would run next, and drawLabels() runs inside it. What is read is
// what the page shows: the visibility the plugin writes on each label and the label text.

const RIGHT = 39;
const TRACK = 600;
const HANDLE = 16;

function primeGeometry(slider) {
  slider.$cache.rs.outerWidth = function () { return TRACK; };
  slider.$cache.rs.offset = function () { return { left: 0 }; };
  slider.$cache.s_from.outerWidth = function () { return HANDLE; };
  slider.$cache.s_to.outerWidth = function () { return HANDLE; };
  slider.$cache.from.outerWidth = function () { return 30; };
  slider.$cache.to.outerWidth = function () { return 30; };
  slider.$cache.single.outerWidth = function () { return 60; };
  // One real drawHandles() pass now that width exists, as the other drag tests do, so the
  // resize branch settles before the first gesture and the labels are drawn once.
  slider.drawHandles();
}

function openDouble(t, from, to, extra) {
  const { $, $input, slider } = createSlider(t, '<input>', Object.assign({
    type: 'double', min: 0, max: 100, from: from, to: to, step: 1, drag_interval: true
  }, extra));
  primeGeometry(slider);
  return { $, $input, slider };
}

/** The pixel a value of the 0..100 range sits under: the centre of a handle on it, whole pixels. */
function pixelOf(value) {
  return Math.round(HANDLE / 2 + value / 100 * (TRACK - HANDLE));
}

/** A click on the track over `value`, then the render tick that follows it. */
function clickTrackOn(slider, value) {
  slider.pointerClick('click', { pageX: pixelOf(value), preventDefault: function () {} });
  slider.drawHandles();
}

/** One key press on the track the click focused, then the render tick that draws it. */
function press(slider, $, which) {
  slider.$cache.line.trigger($.Event('keydown', { which: which }));
  slider.drawHandles();
}

/** Every value label on show, merged label first, with the text it reads. */
function shownLabels(slider) {
  return ['single', 'from', 'to']
    .filter(function (k) { return slider.$cache[k][0].style.visibility !== 'hidden'; })
    .map(function (k) { return { label: k === 'single' ? 'merged' : k, text: slider.$cache[k].text() }; });
}

// ---- the fix: a target that is not one handle --------------------------------------------

// The issue's own example: built on 50 and 50, one label (50) on show; a click on the track
// over 30 carries the pair to 30 and 30, and the from label reads 30.
// Bugs caught: the label pass back to `} else if (!this.target) {` (the 2.5.0 code: no label
// at all after the click); the new branch showing the to label instead
// (`this.$cache.to[0].style.visibility = "visible";`); the merged label left on show
// (dropping `this.$cache.single[0].style.visibility = "hidden";` from the branch for a pair
// on one value, so it reads "30 — 30" over the handles).
test('a pair on one value with drag_interval: a track click keeps the from label on show, reading the clicked value (#898)', (t) => {
  const { $input, slider } = openDouble(t, 50, 50);
  assert.deepEqual(shownLabels(slider), [{ label: 'from', text: '50' }], 'setup: one label, 50, before the click');

  clickTrackOn(slider, 30);

  assert.equal($input.val(), '30;30', 'the click carries the pair to 30');
  assert.deepEqual(shownLabels(slider), [{ label: 'from', text: '30' }]);
});

// moveByKey() moves the pair the way the click did, and the slider keeps the click's target,
// so before the fix every press after the click drew no label either.
// Bugs caught: the same three as above.
test('a pair on one value with drag_interval: a right-arrow press after the track click keeps the from label on show (#898)', (t) => {
  const { $, $input, slider } = openDouble(t, 50, 50);
  clickTrackOn(slider, 30);

  press(slider, $, RIGHT);

  assert.equal($input.val(), '31;31', 'the press carries the pair one step');
  assert.deepEqual(shownLabels(slider), [{ label: 'from', text: '31' }]);
});

// The bar drag of drag_interval is the other whole-interval target. A pair on one value has
// a bar with no width, so a mouse rarely lands on it, but the label pass treats the bar
// drag exactly as the click: before the fix it showed no label during the drag or after the
// release. The last move before the release is never drawn here (no drawHandles() after
// it), so the labels only reach 20 through the redraw the release itself runs.
// Bugs caught: the same three as above; and for the release, `this.updateScene();` deleted
// from pointerUp(): the labels keep the drawn 30 after the release.
test('a pair on one value with drag_interval: a bar drag keeps the from label on show during the drag and after the release (#898)', (t) => {
  const { $input, slider } = openDouble(t, 50, 50);

  slider.pointerDown('both', { pageX: pixelOf(50), preventDefault: function () {} });
  slider.pointerMove({ pageX: pixelOf(30) });
  slider.drawHandles();

  assert.equal(slider.result.from, 30, 'the drag carries from to 30');
  assert.equal(slider.result.to, 30, 'the drag carries to to 30');
  assert.deepEqual(shownLabels(slider), [{ label: 'from', text: '30' }], 'during the drag');

  slider.pointerMove({ pageX: pixelOf(20) });
  slider.pointerUp({});

  assert.equal($input.val(), '20;20', 'the release carries the last move to the input');
  assert.deepEqual(shownLabels(slider), [{ label: 'from', text: '20' }], 'after the release');
});

// With from_fixed the pair cannot move: calc()'s whole-interval case breaks out without
// touching the coordinates, so the click moves nothing. The click still leaves the slider on
// that target, so the label pass sees it all the same: the from label stays on show, reading 50.
// Bug caught: the label pass back to `} else if (!this.target) {`: no label after the click.
test('a pair on one value with drag_interval and from_fixed: a track click that cannot move it keeps the from label on show (#898)', (t) => {
  const { $input, slider } = openDouble(t, 50, 50, { from_fixed: true });
  assert.deepEqual(shownLabels(slider), [{ label: 'from', text: '50' }], 'setup: one label, 50, before the click');

  clickTrackOn(slider, 30);

  assert.equal($input.val(), '50;50', 'the click moves nothing');
  assert.deepEqual(shownLabels(slider), [{ label: 'from', text: '50' }]);
});

// ---- unchanged: one handle in charge, no target, a pair apart ----------------------------
// These rows are green before and after the fix: they pin the cases the fix must leave as
// they are, and each names the one-line change that reds it.

// A drag of the from handle onto the to handle stops it there and leaves the from handle in
// charge: the from label shows.
// Bug caught: the from branch showing the other handle's label
// (`if (this.target === "from") { this.$cache.to[0].style.visibility = "visible"; }`).
test('a from handle dragged onto the to handle shows the from label (#898, unchanged)', (t) => {
  const { $input, slider } = openDouble(t, 40, 60);

  slider.pointerDown('from', { pageX: pixelOf(40), preventDefault: function () {} });
  slider.pointerMove({ pageX: pixelOf(80) });
  slider.pointerUp({});

  assert.equal($input.val(), '60;60', 'the from handle stops on the to handle');
  assert.deepEqual(shownLabels(slider), [{ label: 'from', text: '60' }]);
});

// The mirror: the to handle dragged onto the from handle leaves the to handle in charge,
// and its label shows.
// Bug caught: the to branch dropped (`} else if (this.target === "to") {` and its line
// removed), so the to target falls through to the from label.
test('a to handle dragged onto the from handle shows the to label (#898, unchanged)', (t) => {
  const { $input, slider } = openDouble(t, 40, 60);

  slider.pointerDown('to', { pageX: pixelOf(60), preventDefault: function () {} });
  slider.pointerMove({ pageX: pixelOf(20) });
  slider.pointerUp({});

  assert.equal($input.val(), '40;40', 'the to handle stops on the from handle');
  assert.deepEqual(shownLabels(slider), [{ label: 'to', text: '40' }]);
});

// A slider built with both handles on one value has no target after its first render: the
// from label shows.
// Bug caught: the branch for any other target showing the to label
// (`} else { this.$cache.to[0].style.visibility = "visible"; }`).
test('a pair built on one value shows the from label before any interaction (#898, unchanged)', (t) => {
  const { slider } = openDouble(t, 50, 50);

  assert.deepEqual(shownLabels(slider), [{ label: 'from', text: '50' }]);
});

// A pair 4 apart: the 30 px value labels overlap, so the merged label shows in their place,
// and the track click that moves the pair keeps it that way.
// Bug caught: the branch for a pair on one value taken by any overlapping pair
// (`if (this.result.from === this.result.to) {` becomes `if (true) {`): the from label
// alone shows, "48" before the click.
test('an overlapping pair apart shows the merged label after a track click (#898, unchanged)', (t) => {
  const { $input, slider } = openDouble(t, 48, 52);
  assert.deepEqual(shownLabels(slider), [{ label: 'merged', text: '48 — 52' }], 'setup: the merged label before the click');

  clickTrackOn(slider, 30);

  assert.equal($input.val(), '28;32', 'the click centres the 4-wide interval on 30');
  assert.deepEqual(shownLabels(slider), [{ label: 'merged', text: '28 — 32' }]);
});

// A pair far apart: both value labels show and the merged label stays hidden, after the
// click as before it.
// Bug caught: the overlap test reversed (`>=` becomes `<` in
// `this.labels.p_from_left + this.labels.p_from_fake >= this.labels.p_to_left`): the pair
// far apart takes the overlap branch and shows the merged label alone.
test('a pair far apart shows both value labels after a track click (#898, unchanged)', (t) => {
  const { $input, slider } = openDouble(t, 20, 80);

  clickTrackOn(slider, 60);

  assert.equal($input.val(), '30;90', 'the click centres the 60-wide interval on 60');
  assert.deepEqual(shownLabels(slider), [{ label: 'from', text: '30' }, { label: 'to', text: '90' }]);
});
