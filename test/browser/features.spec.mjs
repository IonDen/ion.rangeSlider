import { test, expect } from '@playwright/test';
import { open, events, eventTypes, input, drag, JQUERY, LABEL } from './helpers.mjs';

// Real-browser coverage for the five changes shipped so far in 2.4.0. Each of
// these already has jsdom unit coverage; these tests exercise the same fixes
// through actual layout, a real pointer drag and the render loop, which the
// unit suite (zero layout, see test/unit/helpers.mjs) cannot reach. Every
// test names, in its own comment, the one-line source mutation that would
// make it fail.

test.describe(`2.4.0 feature coverage (${LABEL})`, () => {
  // #276: prettify_all_values opts non-numeric values-mode entries into the
  // custom prettify. Mutation this catches: gating `o.prettify_all_values`
  // off in validate()'s values loop (js/ion.rangeSlider.js, the values-mode
  // p_values build) -- the non-numeric entry would render as raw "a" instead
  // of the prettified "<a>".
  test('values mode with prettify_all_values: true prettifies a non-numeric entry (#276)', async ({ page }) => {
    // config carries a function expression, so it is passed as a raw JS
    // object literal (not JSON, which drops function-valued properties) --
    // the fixture evals the query param, per test/fixtures/slider.html.
    // Brackets, not angle brackets: decorate()'s output is set via jQuery's
    // .html(), so a literal "<a>" would parse as markup instead of text.
    const configStr = "{ values: ['a', 10, 20], from: 0, prettify_all_values: true, prettify: function (n) { return '[' + n + ']'; } }";
    await open(page, configStr);
    await expect(page.locator('.irs-single')).toHaveText('[a]');
  });

  // #503: from_min/from_max/to_min/to_max are mirrored onto the result
  // object handed to every callback. Mutation this catches: dropping the
  // mirroring in the constructor's initial result object (the `from_min:
  // this.options.from_min` line) -- the limit fields would read null/
  // undefined in the fired events instead of the configured values.
  test('double slider with all four diapason limits: a real drag reports from_min/from_max/to_min/to_max (#503)', async ({ page }) => {
    await open(page, {
      type: 'double', min: 0, max: 100, from: 20, to: 60,
      from_min: 5, from_max: 45, to_min: 55, to_max: 95
    });
    await drag(page, '.irs-handle.from', 0.1);
    await expect.poll(() => eventTypes(page)).toContain('onFinish');

    const ev = await events(page);
    const changeEv = ev.find((e) => e.type === 'onChange');
    const finishEv = ev.filter((e) => e.type === 'onFinish').at(-1);

    expect(changeEv, 'onChange must have fired during the drag').toBeTruthy();
    expect(finishEv, 'onFinish must have fired at the end of the drag').toBeTruthy();
    for (const e of [changeEv, finishEv]) {
      expect(e).toMatchObject({ from_min: 5, from_max: 45, to_min: 55, to_max: 95 });
    }
  });

  // #679: min_prefix/max_prefix add literal text in front of the min/max
  // bubble value. Mutation this catches: dropping the min_prefix/max_prefix
  // branch from decorate() (or forcing its condition to never match) -- the
  // labels would render the bare "0"/"100" instead of the prefixed text.
  test('min_prefix/max_prefix render on the min/max labels (#679)', async ({ page }) => {
    await open(page, { min: 0, max: 100, min_prefix: 'Min: ', max_prefix: 'Max: ' });
    await expect(page.locator('.irs-min')).toHaveText('Min: 0');
    await expect(page.locator('.irs-max')).toHaveText('Max: 100');
  });

  test.describe('#535 prettify by global function name', () => {
    // Mutation this catches: disabling the `typeof window[o.prettify] ===
    // "function"` resolution branch in validate() -- prettify stays the raw
    // string, _prettify() falls back to default number formatting, and the
    // label reads "50" instead of "X50".
    test('a string names a global function and it formats the label', async ({ page }) => {
      await page.addInitScript(() => {
        window.myFormatter = function (n) { return 'X' + n; };
      });
      await open(page, { min: 0, max: 100, from: 50, prettify: 'myFormatter' });
      await expect(page.locator('.irs-single')).toHaveText('X50');
    });

    // Mutation this catches: dropping (or emptying) prettify_denylist's
    // check in validate() -- "eval" would then resolve via the same
    // window[name] lookup as any other name, and with prettify_all_values
    // threading raw values-mode entries into _prettify(), the malicious
    // entry below would execute instead of being formatted as a string.
    test('"eval" is refused -- no code execution, default formatting used (#535 security)', async ({ page }) => {
      const configStr = "{ values: ['a', 'window.__pwned = true', 'c'], from: 1, prettify_all_values: true, prettify: 'eval' }";
      await open(page, configStr);
      expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
      expect(await page.evaluate(() => window.__irs.slider.options.p_values[1])).toBe('window.__pwned = true');
    });
  });

  test.describe('#831 to_max applied at init', () => {
    // Characterization test, not an independent #831 regression pin: once
    // real layout runs, drawHandles() -> calc()'s "base" case re-derives the
    // handle position from result.to and re-clamps it through
    // checkDiapason(..., to_min, to_max) unconditionally (js/ion.rangeSlider.js,
    // calc()'s "base" case) -- so this immediate/visible-container path stays
    // green even against the #831 identifier-swap mutation on its own; only
    // the hidden-at-init sibling below (where that render pass never runs)
    // independently pins that line. Kept anyway because it pins the
    // documented public contract (input value, jQuery data cache, onStart
    // payload) for this scenario, which the code must keep honoring however
    // it gets there.
    test('to_max clamps to at init even though from sits under it', async ({ page }) => {
      await open(page, { type: 'double', min: 0, max: 100, from: 10, to: 80, to_max: 50 });
      await expect(input(page)).toHaveValue('10;50');
      // writeToInput() stores "to" through jQuery's .data() cache, not as a
      // reflected data-to DOM attribute -- read it back the same way.
      expect(await page.evaluate(() => jQuery('#slider').data('to'))).toBe(50);
      const ev = await events(page);
      expect(ev[0]).toMatchObject({ type: 'onStart', to: 50 });
    });

    // The test that actually pins #831: with the container hidden, drawHandles()
    // returns before it ever reaches calc()'s "base" case (its `w_rs` guard),
    // so the checkDiapason() safety net described above never runs and
    // onStart's payload reflects validate()'s clamp alone. Mutation this
    // catches: reverting that clamp in validate() from `o.to > o.to_max`
    // back to `o.from > o.to_max` -- `to` (80) sits above to_max (50) but
    // `from` (10) does not, so the pre-fix comparison never fires and
    // onStart fires with to: 80 instead of 50. The container is then
    // revealed and the render loop's resize detection (drawHandles(), on the
    // idle 300ms timer) must redraw the handle at that same already-clamped
    // value.
    test('to_max clamps onStart even with the container hidden at init, and the handle settles there once revealed', async ({ page }) => {
      const params = new URLSearchParams({
        jquery: JQUERY,
        config: JSON.stringify({ type: 'double', min: 0, max: 100, from: 10, to: 80, to_max: 50 }),
        hidden: '1'
      });
      await page.goto(`/test/fixtures/slider.html?${params}`);
      await page.waitForFunction(() => window.__irs && window.__irs.ready);

      const ev = await events(page);
      expect(ev[0]).toMatchObject({ type: 'onStart', to: 50 });

      await page.evaluate(() => {
        document.getElementById('wrap').style.display = '';
      });

      const fraction = async () => {
        const h = await page.locator('.irs-handle.to').boundingBox();
        const l = await page.locator('.irs-line').boundingBox();
        if (!h || !l || !l.width) return -1;
        return (h.x + h.width / 2 - l.x) / l.width;
      };
      await expect.poll(fraction, { timeout: 3000 }).toBeGreaterThan(0.4);
      expect(await fraction()).toBeLessThan(0.6);
    });
  });
});
