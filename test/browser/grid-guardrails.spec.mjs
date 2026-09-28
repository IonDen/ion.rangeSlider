import { test, expect } from '@playwright/test';
import { open, LABEL } from './helpers.mjs';
import { readEnv } from './lib/env.mjs';

const gridTexts = (page) => page.$$eval('#wrap .irs-grid-text', (els) => els.map((e) => e.textContent));

async function labelOffsets(page) {                // label centre minus tick centre, px, for visible interior labels
  return page.evaluate(() => {
    const centre = (el) => { const r = el.getBoundingClientRect(); return r.left + r.width / 2; };
    const ticks = Array.prototype.slice.call(document.querySelectorAll('#wrap .irs-grid-pol:not(.small)'));
    const labels = Array.prototype.slice.call(document.querySelectorAll('#wrap .irs-grid-text'));
    return labels.map((label, i) => ({ i, shown: getComputedStyle(label).visibility === 'visible', off: centre(label) - centre(ticks[i]) }))
      .filter((x) => x.shown && x.i > 0 && x.i < labels.length - 1);
  });
}

test.describe(`grid guardrails: inputs (${LABEL})`, () => {
  // Mutation that reds it: `o.grid_num = 4;` removed from validate()'s fallback (no ticks for "abc").
  test('data-grid-num="abc" falls back to 4 units', async ({ page }) => {
    await open(page, { min: 0, max: 100, grid: true }, { attrs: JSON.stringify({ 'data-grid-num': 'abc' }) });
    expect(await gridTexts(page)).toEqual(['0', '25', '50', '75', '100']);
  });

  // Mutation that reds it: rule 0 removed from calcGridTicks() ("NaN").
  test('min equal to max draws one grid label', async ({ page }) => {
    await open(page, { min: 5, max: 5, grid: true, grid_snap: true });
    expect(await gridTexts(page)).toEqual(['5']);
  });

  // Mutation that reds it: the try/catch in _tryGridFormatter() removed (the slider is never created).
  test('a throwing prettify_grid still gives a working slider', async ({ page }) => {
    await open(page, '{ min: 0, max: 100, from: 40, grid: true, prettify_grid: function () { throw new Error("x"); } }');
    await expect(page.locator('#slider')).toHaveValue('40');
    expect(await gridTexts(page)).toEqual(['0', '25', '50', '75', '100']);
  });
});

test.describe(`grid guardrails: the grid box (${LABEL})`, () => {
  // Mutation that reds it: calcGridLabels() measuring against the whole slider (`grid_w = this.coords.w_rs`): with
  // grid_margin on, every label then sits right of its tick by label_w * p_handle / 200 px, about 2 px for a 30 px
  // label with the flat skin's 16 px handle at 120 px.
  test('grid labels are centred on their ticks in a 120 px slider with grid_margin', async ({ page }) => {
    await open(page, { min: 0, max: 1000000, grid: true, grid_num: 10 }, { width: '120' });
    await page.waitForTimeout(400);
    const offsets = await labelOffsets(page);
    expect(offsets.length).toBeGreaterThan(0);
    for (const o of offsets) expect(Math.abs(o.off)).toBeLessThanOrEqual(1);
  });
});

async function visibleBoxes(page) {
  return page.$$eval('#wrap .irs-grid-text', (els) => els
    .filter((e) => getComputedStyle(e).visibility === 'visible' && e.textContent !== '')
    .map((e) => { const r = e.getBoundingClientRect(); return { text: e.textContent, left: r.left, right: r.right }; }));
}
// $cache.rs -- the inner, unclassed `.irs` inside the outer skin-classed container -- is the
// box calcGridLabels() measures as coords.w_rs and the box force_edges promises to keep the
// first and last grid labels inside. calcGridMargin() insets the narrower `.irs-grid` box
// inside it by grid_gap when grid_margin is on, but never touches coords.w_rs or `.irs` itself,
// so the container is the same element either way. A bare '.irs' also matches the outer
// container (a strict-mode violation), so this scopes to the descendant.
async function containerBox(page) {
  return page.evaluate(() => {
    const r = document.querySelector('#wrap .irs .irs').getBoundingClientRect();
    return { left: r.left, right: r.right };
  });
}
async function expectReadable(page, first, last) {
  const boxes = await visibleBoxes(page);
  expect(boxes[0].text).toBe(first);
  expect(boxes[boxes.length - 1].text).toBe(last);
  for (let i = 1; i < boxes.length; i++) expect(boxes[i].left).toBeGreaterThanOrEqual(boxes[i - 1].right - 1);
}

test.describe(`grid guardrails: readable labels (${LABEL})`, () => {
  // Mutation that reds these: calcGridCollision() without the "keep the last label" branch, or without the
  // right-neighbour comparison.
  for (const width of ['300', '600']) {
    test(`grid_num 50 at ${width} px keeps 0 and 100 and never overlaps`, async ({ page }) => {
      await open(page, { min: 0, max: 100, grid: true, grid_num: 50 }, { width });
      await page.waitForTimeout(400);
      await expectReadable(page, '0', '100');
    });
  }
  for (const width of ['120', '200', '300']) {
    test(`long labels (0..1 000 000, grid_num 50) at ${width} px never overlap`, async ({ page }) => {
      await open(page, { min: 0, max: 1000000, grid: true, grid_num: 50 }, { width });
      await page.waitForTimeout(400);
      await expectReadable(page, '0', '1 000 000');
    });
  }
  for (const width of ['300', '400']) {
    test(`twelve months at ${width} px keep January and December`, async ({ page }) => {
      await open(page, { values: ['January','February','March','April','May','June','July','August','September','October','November','December'], grid: true }, { width });
      await page.waitForTimeout(400);
      await expectReadable(page, 'January', 'December');
    });
  }
  // readme note "grid": "With force_edges the first and last grid labels stay inside the
  // container." Symmetric six-digit labels on both ends (-1 000 000 and 1 000 000) so the clamp
  // is actually needed on BOTH sides on BOTH rows below -- without force_edges the first label
  // overhangs the left by about 17 px (grid_margin on) or 25 px (off), and the last overhangs the
  // right by about 15 px (on) or 23 px (off); a shorter first label ("0", tried in an earlier
  // round) left enough margin inset that the left clamp never engaged with grid_margin on.
  // force_edges doesn't just keep the labels from overhanging, it puts their clamped edge flush
  // with the container: calcGridLabels() clamps to -edge/100+edge in the (narrower, when
  // grid_margin is on) grid box, and edge converts grid_gap so that position lands exactly at the
  // container's own 0%/100% -- asserted here as both edges within 1 px, not just non-overhanging.
  // Mutation that reds it (both rows, on the right): the `finish[last] > 100 + edge` clamp
  // dropped from calcGridLabels()'s force_edges block.
  // Mutation that reds it (both rows, on the left): the `start[first] < -edge` clamp dropped
  // from the same block.
  // Mutation that reds it (grid_margin on only, on the right, by about 8 px -- half a handle):
  // `edge` forced to 0, so the clamp lands at the grid box's own edge instead of the container's
  // (a no-op with grid_margin off, where `edge` is already 0).
  // Mutation that reds it (grid_margin on only, on the right, by just over 1 px): the pre-#906
  // last-label formula `big_p[last] - grid_gap` in place of `big[last] - start[last]` (also a
  // no-op with grid_margin off, where `grid_gap` is 0 and the two formulas coincide).
  for (const grid_margin of [true, false]) {
    test(`force_edges puts the first and last grid labels flush with the container (grid_margin ${grid_margin})`, async ({ page }) => {
      await open(page, { min: -1000000, max: 1000000, grid: true, grid_num: 10, force_edges: true, grid_margin }, { width: '400' });
      await page.waitForTimeout(400);
      await expectReadable(page, '-1 000 000', '1 000 000');
      const container = await containerBox(page);
      const boxes = await visibleBoxes(page);
      expect(boxes[0].left).toBeGreaterThanOrEqual(container.left - 1);
      expect(boxes[0].left).toBeLessThanOrEqual(container.left + 1);
      expect(boxes[boxes.length - 1].right).toBeGreaterThanOrEqual(container.right - 1);
      expect(boxes[boxes.length - 1].right).toBeLessThanOrEqual(container.right + 1);
    });
  }
  // On both sides of jQuery 3.3: below it a grid built hidden measures a 100 px box and the sweep runs on it;
  // from 3.3 on it measures 0 and the sweep waits. Either way the reveal must give the fresh build's labels.
  // Mutation that reds it on builds below 3.3 (the 1.8.3 cell): calcGridCollision() writing visibility only for the
  // labels it hides (labels hidden on the 100 px box stay hidden after the reveal).
  test('a grid built hidden shows the same labels after the reveal as a fresh build', async ({ page }) => {
    await open(page, { min: 0, max: 100, grid: true, grid_num: 50 }, { width: '300' });
    await page.waitForTimeout(400);
    const fresh = (await visibleBoxes(page)).map((b) => b.text);
    await open(page, { min: 0, max: 100, grid: true, grid_num: 50 }, { hidden: '1', width: '300' });
    const env = await readEnv(page);
    const side = `jQuery ${env.jquery}: a hidden track measures ${env.hiddenTrackMeasuresZero ? '0 px' : 'more than 0 px'}`;
    await page.evaluate(() => { document.getElementById('wrap').style.display = 'block'; });
    await page.waitForTimeout(700);
    expect((await visibleBoxes(page)).map((b) => b.text), side).toEqual(fresh);
    await expectReadable(page, '0', '100');
  });
  // Mutation that reds it: the same "only hidden labels written" change (a label hidden at 250 px stays hidden at
  // 600 px).
  test('a resize 600 -> 250 -> 600 gives the same visible labels as a fresh build at each width', async ({ page }) => {
    const fresh = async (w) => { await open(page, { min: 0, max: 100, grid: true, grid_num: 20 }, { width: w }); await page.waitForTimeout(400); return (await visibleBoxes(page)).map((b) => b.text); };
    const at600 = await fresh('600'); const at250 = await fresh('250');
    await open(page, { min: 0, max: 100, grid: true, grid_num: 20 }, { width: '600' });
    await page.evaluate(() => { document.getElementById('wrap').style.width = '250px'; });
    await page.waitForTimeout(700);
    expect((await visibleBoxes(page)).map((b) => b.text)).toEqual(at250);
    await page.evaluate(() => { document.getElementById('wrap').style.width = '600px'; });
    await page.waitForTimeout(700);
    expect((await visibleBoxes(page)).map((b) => b.text)).toEqual(at600);
  });
  // Empty labels take no part in the sweep; the unit test 'empty labels take no part; the first non-empty label
  // is first' carries the logic. 50 units on a 120 px slider, every label blanked except multiples of 4 -- and
  // the max label (100, itself a multiple of 4) is blanked too, so the truly first and last non-empty labels
  // (0 and 96) are not simply the endpoints.
  // Mutation that reds it: `if (!empty[i])` dropped from calcGridCollision()'s first/last scan (the sweep then
  // treats the blank label at index 50 as the last one, and hides 96 in favour of 80).
  test('empty labels from prettify_grid take no part in the sweep', async ({ page }) => {
    await open(page, '{ min: 0, max: 100, grid: true, grid_num: 50, prettify_grid: function (n) { return n === 100 || n % 4 ? "" : String(n); } }', { width: '120' });
    await page.waitForTimeout(400);
    await expectReadable(page, '0', '96');
  });
});

test.describe(`grid guardrails: the site's date demo (${LABEL})`, () => {
  // tsToDate formats in the browser's time zone: UTC makes the labels the same on every machine and in CI.
  test.use({ timezoneId: 'UTC' });

  // demo_advanced.html's demo_4 with its own tsToDate and lang (min and max are its dateToTS(new Date(2018, 10, 1))
  // and dateToTS(new Date(2018, 11, 1)) in UTC). The labels were captured from master before the tick rules: the grid
  // is truthful, so rule 1 keeps it. Mutation that reds it: the sweep letting two labels overlap. Speed is not judged
  // here: call budgets do that (test/unit/grid-ticks.test.mjs), never a timeout.
  test('the timestamp demo keeps its labels and none overlap', async ({ page }) => {
    await page.addInitScript(() => {
      window.lang = 'en-US';
      window.tsToDate = function (ts) {
        var d = new Date(ts);
        return d.toLocaleDateString(lang, { year: 'numeric', month: 'long', day: 'numeric' });
      };
    });
    await open(page, '{ type: "double", force_edges: true, grid: true, grid_num: 2, min: 1541030400000, max: 1543622400000, from: 1541635200000, to: 1542931200000, prettify: tsToDate }');
    await page.waitForTimeout(400);
    expect(await gridTexts(page)).toEqual(['November 1, 2018', 'November 16, 2018', 'December 1, 2018']);
    await expectReadable(page, 'November 1, 2018', 'December 1, 2018');
  });
});

test.describe(`grid guardrails: reachable labels (${LABEL})`, () => {
  // Mutation that reds it: rule 5 deleted from calcGridTicks() (the labels go back to 0, 25, 50, 75, 100).
  test('0..100 step 10 labels 0, 20, 40, 60, 80, 100', async ({ page }) => {
    await open(page, { min: 0, max: 100, from: 0, step: 10, grid: true });
    expect(await gridTexts(page)).toEqual(['0', '20', '40', '60', '80', '100']);
  });

  // On an uneven scale (min 0.5, step 1) the handle stops on 5 at 45% (4.5 of the range's 10), while the even split
  // into these five units puts the tick labelled 5 at 40%. (On 0..100 step 10 the two coincide, so that grid cannot
  // tell them apart.) Mutations that red it: rule 5 deleted (the labels go back to 0.5, 3, 6, 8, 10.5), or a rule
  // placing ticks at the step position instead of the resting position (`left = pts[i].value === o.max ? 100 :
  // pts[i].steps * this.coords.p_step` in _gridTicksFrom: the tick of 5 sits 5% of the grid box left of the handle,
  // about 29 px on the fixture's 600 px slider with the flat skin).
  test('0.5..10.5 labels 0.5, 3, 5, 7, 9, 10.5, and the tick of 5 sits where the handle stops on 5', async ({ page }) => {
    await open(page, { min: 0.5, max: 10.5, from: 0.5, step: 1, grid: true });
    expect(await gridTexts(page)).toEqual(['0.5', '3', '5', '7', '9', '10.5']);
    await page.evaluate(() => window.__irs.slider.update({ from: 5 }));
    await page.waitForTimeout(400);
    const gap = await page.evaluate(() => {
      const centre = (el) => { const r = el.getBoundingClientRect(); return r.left + r.width / 2; };
      const tick = document.querySelectorAll('#wrap .irs-grid-pol:not(.small)')[2];   // the tick labelled 5
      return centre(tick) - centre(document.querySelector('#wrap .irs-handle.single'));
    });
    expect(Math.abs(gap)).toBeLessThanOrEqual(1);
  });

  // The site demo (demo.html, demo_7). Mutation that reds it: rule 4 deleted from calcGridTicks() (the demo falls to
  // rule 5: 1 000, 334 000, 667 000, 1 000 000).
  test('the site demo 1 000 to 1 000 000 step 1 000 labels round quarters', async ({ page }) => {
    await open(page, { min: 1000, max: 1000000, from: 100000, step: 1000, grid: true });
    expect(await gridTexts(page)).toEqual(['1 000', '250 000', '500 000', '750 000', '1 000 000']);
  });

  // The call budget in the browser, on the rule-4 path (the most conversions of any rule), with the built file the
  // cell loads. Mutation that reds it: a rule looping over the 1.4 million steps (thousands of calls).
  test('a huge rule-4 grid stays within a call budget in the browser', async ({ page }) => {
    await open(page, { min: 0, max: 10000000, step: 7, grid_num: 4 });
    const calls = await page.evaluate(() => {
      const slider = window.__irs.slider, proto = Object.getPrototypeOf(slider), real = proto.convertToValue;
      let n = 0;
      proto.convertToValue = function () { n++; return real.apply(this, arguments); };
      try { slider.update({ grid: true }); } finally { proto.convertToValue = real; }
      return n;
    });
    expect(calls).toBeLessThan(2000);
    expect(await gridTexts(page)).toEqual(['0', '2 500 001', '5 000 002', '7 500 003', '10 000 000']);
  });
});
