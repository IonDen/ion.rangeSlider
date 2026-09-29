import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSlider } from './helpers.mjs';

// #910: a click on the track of a double slider moves the handle NEARER the click.
// chooseHandle() ("Find closest handle to pointer click") compared the click with the
// point halfway between the two handles on two different percent scales: the click as
// the position of a handle's left edge (0 to 100 - p_handle, the scale that edge
// travels), the halfway point on the full track (0 to 100). The click therefore always
// read a little low, and a click just past the middle moved the FARTHER handle, "from",
// where the nearer "to" was meant (a click exactly halfway is meant to move "to": the
// comparison is `>=`).
//
// jsdom has no layout (see helpers.mjs), so the geometry is stubbed the way the other
// drag tests stub it: $cache.rs.outerWidth() is the track width and both handles have
// one width, 16 px unless a test says otherwise (the handle of the default flat skin).
// The click goes through the real pointerClick() -> calc() -> chooseHandle() path, one
// integer pixel as a mouse gives it, and the assertions read result.from / result.to,
// what the callbacks report.

function primeGeometry(slider, track_px, handle_px) {
  slider.$cache.rs.outerWidth = function () { return track_px; };
  slider.$cache.rs.offset = function () { return { left: 0 }; };
  slider.$cache.s_from.outerWidth = function () { return handle_px; };
  slider.$cache.s_to.outerWidth = function () { return handle_px; };
  // One real drawHandles() pass now that width exists, as the other drag tests do, so
  // the handle share of the track and the handles' own positions are computed.
  slider.drawHandles();
}

/** Clicks the track at pixel `x`, one whole pixel as a mouse gives it. */
function clickAtPixel(slider, x) {
  slider.pointerClick('click', { pageX: x, preventDefault: function () {} });
}

/** Clicks the track on `value` of a 0..100 range: the pixel that value sits under, whole pixels. */
function clickOnValue(slider, track_px, value) {
  const handle_px = 16;
  clickAtPixel(slider, Math.round(handle_px / 2 + value / 100 * (track_px - handle_px)));
}

function openDouble(t, track_px, from, to, extra, handle_px) {
  const { slider } = createSlider(t, '<input>', Object.assign(
    { type: 'double', min: 0, max: 100, from: from, to: to, step: 1 }, extra || {}
  ));
  primeGeometry(slider, track_px, handle_px || 16);
  return slider;
}

// The issue's first example: a 600 px track, handles on 20 and 80, a click on 51. It is
// 29 from "to" and 31 from "from", and "to" moves. Before the fix the click read as
// about 49.7 against a halfway point of 50, and "from" moved: "51;80".
// One-line bug this catches: chooseHandle() -> the `real_x` conversion dropped, i.e.
// `var real_x = handle_x,` (without the conversion the pair reads 51 and 80).
test('600 px, handles 20 and 80: a click on 51 moves "to" (#910)', (t) => {
  const slider = openDouble(t, 600, 20, 80);
  clickOnValue(slider, 600, 51);
  assert.equal(slider.result.from, 20, '"from" is the farther handle and must stay');
  assert.equal(slider.result.to, 51, '"to" is the nearer handle and must move to the click');
});

// The issue's second example: a 300 px track (the handle takes 5.3 % of it, so the two
// scales differ most), handles on 80 and 100. Clicks on 91 to 94 are 9 to 6 from "to"
// and 11 to 14 from "from"; each used to move "from" (the pair read "91;100" and so on).
// One-line bug this catches: the same dropped conversion as above.
for (const value of [91, 92, 93, 94]) {
  test(`300 px, handles 80 and 100: a click on ${value} moves "to" (#910)`, (t) => {
    const slider = openDouble(t, 300, 80, 100);
    clickOnValue(slider, 300, value);
    assert.equal(slider.result.from, 80, '"from" is the farther handle and must stay');
    assert.equal(slider.result.to, value, '"to" is the nearer handle and must move to the click');
  });
}

// A click exactly halfway moves "to": chooseHandle()'s comparison is `>=`. "Exactly
// halfway" is the pixel midway between the two handle centres, and it is pinned on three
// geometries, so a conversion that is right for one of them only goes red on the others:
// one hard-coded to a 600 px track and 16 px handles, or one that reads the click as the
// pointer position (`real_x = handle_x + p_handle / 2`, exact only when the handles sit
// symmetrically about the middle of the track). `x` is the whole pixel, worked out by hand
// from the geometry (a handle centre sits at handle / 2 + value / 100 * (track - handle)),
// and `at` the halfway value that pixel converts to with no rounding. No whole pixel is
// exactly 90 on the issue's 300 px track with 16 px handles (the click on 90 is pixel 264,
// 90.1), which is why that row has 20 px handles.
//
// The rows are also picked so that the plugin's own float arithmetic lands on the halfway
// point exactly. It does not everywhere: a 500 px track with 20 px handles on 40 and 100
// lands one ulp below it at pixel 346 and moves "from". That is harmless (both handles
// are equally near), but a tie row is only valid on a geometry checked to be exact.
//
// Before the fix the pixel read as 48.7 (600/16), 24.25 (800/24) and 84 (300/20), each
// below its halfway point (50, 25, 90), and "from" moved.
// One-line bug this catches: chooseHandle() -> `if (real_x >= m_point) {` becomes
// `if (real_x > m_point) {`, and the click on exactly halfway moves "from"; the dropped
// conversion and the two conversions named above red the rows they are wrong for too.
const TIES = [
  // Centres at 8 + 0.2 * 584 = 124.8 and 8 + 0.8 * 584 = 475.2.
  { track: 600, handle: 16, from: 20, to: 80, x: 300, at: 50 },
  // Centres at 12 + 0.1 * 776 = 89.6 and 12 + 0.4 * 776 = 322.4.
  { track: 800, handle: 24, from: 10, to: 40, x: 206, at: 25 },
  // Centres at 10 + 0.8 * 280 = 234 and 10 + 1 * 280 = 290.
  { track: 300, handle: 20, from: 80, to: 100, x: 262, at: 90 }
];
for (const g of TIES) {
  const where = `${g.track} px track, ${g.handle} px handles on ${g.from} and ${g.to}`;

  test(`${where}: a click exactly halfway (pixel ${g.x}) moves "to" (#910)`, (t) => {
    const slider = openDouble(t, g.track, g.from, g.to, null, g.handle);
    clickAtPixel(slider, g.x);
    assert.equal(slider.result.from, g.from, 'the halfway click does not move "from"');
    assert.equal(slider.result.to, g.at, 'the halfway click belongs to "to"');
  });

  // One pixel either side, the other two values of the boundary: nearer "from" moves
  // "from", nearer "to" moves "to". The left pixel is green before and after the fix
  // (pins behaviour: guards against over-correcting; the `if (true)` mutation reds it).
  test(`${where}: the pixel left of halfway (${g.x - 1}) moves "from" (#910)`, (t) => {
    const slider = openDouble(t, g.track, g.from, g.to, null, g.handle);
    clickAtPixel(slider, g.x - 1);
    assert.notEqual(slider.result.from, g.from, '"from" is the nearer handle and must move');
    assert.equal(slider.result.to, g.to, '"to" is the farther handle and must stay');
  });

  // Red before the fix (the pixel read below the halfway point and "from" moved); the
  // dropped conversion reds it.
  test(`${where}: the pixel right of halfway (${g.x + 1}) moves "to" (#910)`, (t) => {
    const slider = openDouble(t, g.track, g.from, g.to, null, g.handle);
    clickAtPixel(slider, g.x + 1);
    assert.equal(slider.result.from, g.from, '"from" is the farther handle and must stay');
    assert.notEqual(slider.result.to, g.to, '"to" is the nearer handle and must move');
  });
}

// The other side of the halfway point: a click one value below it, and one far from it,
// are nearer "from" and move "from". Pins behaviour: guards against over-correcting.
// Green before and after the fix (the old bias only ever leaned towards "from"), so the
// fix is not what they prove; the mutation that reds them is the over-correction.
// One-line bug this catches: chooseHandle() -> `if (real_x >= m_point) {` becomes
// `if (true) {`, and every click moves "to".
for (const value of [10, 49]) {
  test(`600 px, handles 20 and 80: a click on ${value} moves "from" (#910)`, (t) => {
    const slider = openDouble(t, 600, 20, 80);
    clickOnValue(slider, 600, value);
    assert.equal(slider.result.from, value, '"from" is the nearer handle and must move to the click');
    assert.equal(slider.result.to, 80, '"to" is the farther handle and must stay');
  });
}

// The same on the 300 px track, 80 and 100: a click on 89 is 9 from "from" and 11 from
// "to", and still moves "from" (the fix must not tip clicks below the halfway point of
// 90 the wrong way round on the narrow track either). Pins behaviour: guards against
// over-correcting; green before and after the fix.
// One-line bug this catches: the `if (true)` mutation above.
test('300 px, handles 80 and 100: a click on 89 moves "from" (#910)', (t) => {
  const slider = openDouble(t, 300, 80, 100);
  clickOnValue(slider, 300, 89);
  assert.equal(slider.result.from, 89);
  assert.equal(slider.result.to, 100);
});

// A fixed handle never moves, so a click that is nearer to it goes to the other handle.
// These two are characterization (green before and after the fix: the choice they pin is
// the ternary in chooseHandle(), which the fix does not touch), and each names the
// mutation that reds it.
// One-line bug this catches: chooseHandle() -> `return this.options.from_fixed ? "to" :
// "from";` becomes `return "from";` and the click, nearer the fixed "from", moves nothing.
test('from_fixed: a click nearer the fixed from handle moves "to" instead (#910)', (t) => {
  const slider = openDouble(t, 600, 20, 80, { from_fixed: true });
  clickOnValue(slider, 600, 30);
  assert.equal(slider.result.from, 20, 'the fixed handle stays');
  assert.equal(slider.result.to, 30, 'the click goes to the other handle');
});

// One-line bug this catches: chooseHandle() -> `return this.options.to_fixed ? "from" :
// "to";` becomes `return "to";` and the click, nearer the fixed "to", moves nothing.
test('to_fixed: a click nearer the fixed to handle moves "from" instead (#910)', (t) => {
  const slider = openDouble(t, 600, 20, 80, { to_fixed: true });
  clickOnValue(slider, 600, 70);
  assert.equal(slider.result.to, 80, 'the fixed handle stays');
  assert.equal(slider.result.from, 70, 'the click goes to the other handle');
});
