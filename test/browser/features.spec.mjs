import { test, expect } from '@playwright/test';
import { open, events, eventTypes, input, drag, LABEL } from './helpers.mjs';

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

    // #535 data-* route: the string-resolution also needs to reach
    // options.prettify via a data-prettify HTML attribute, not just the JS
    // config object exercised above -- the server-markup channel the
    // feature was built for (vue-form-generator-style config has no way to
    // express a function value). Mutation this catches: dropping the
    // `prettify: $inp.data("prettify"),` line from config_from_data
    // (js/ion.rangeSlider.js) -- the attribute would never reach
    // options.prettify, so it stays unset and the label falls back to
    // default formatting ("50" instead of "X50"). The resolution-gate
    // mutation on the test above also reds this one (both routes end at the
    // same window[name] lookup), but only the config_from_data mapping
    // mutation pins the data-attribute merge specifically.
    test('data-prettify resolves a global function set as an HTML attribute (#535)', async ({ page }) => {
      await page.addInitScript(() => {
        window.myFormatter = function (n) { return 'X' + n; };
      });
      await open(page, { min: 0, max: 100, from: 50 }, { attrs: JSON.stringify({ 'data-prettify': 'myFormatter' }) });
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
      // Page-observable fallback check: the rendered label, not slider
      // internals -- the payload string passed through default formatting
      // unchanged (no digits to group), instead of being executed.
      await expect(page.locator('.irs-single')).toHaveText('window.__pwned = true');
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
      // Routed through open()'s extra-params argument (not a hand-built URL)
      // so this test still honors the IRS_SLIM/IRS_MIN env selection like
      // every other test -- otherwise the one test that independently pins
      // the #831 validate() clamp would silently run against the wrong
      // jQuery/plugin build in the CI matrix cells that set those env vars.
      await open(page, { type: 'double', min: 0, max: 100, from: 10, to: 80, to_max: 50 }, { hidden: '1' });

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

  test.describe('#306 per-surface prettify (prettify_grid / prettify_min_max)', () => {
    // Mutation this catches: routing appendGrid()'s numeric-mode tick text
    // and/or setMinMax()'s min/max labels through the shared _prettify()
    // instead of the new _prettifyGrid()/_prettifyMinMax() fallback helpers
    // (js/ion.rangeSlider.js) -- the grid and min/max labels would then
    // render the handle bubble's "L" formatting instead of their own "G"/"M"
    // formatting. grid_num: 1 keeps the grid to exactly two ticks (min, max)
    // so js-grid-text-0/1 are unambiguous.
    test('one slider, three formatters: grid, min/max and the handle bubble each use their own (#306)', async ({ page }) => {
      const configStr = "{ min: 0, max: 100, from: 50, grid: true, grid_num: 1, "
        + "prettify: function (n) { return 'L' + n; }, "
        + "prettify_grid: function (n) { return 'G' + n; }, "
        + "prettify_min_max: function (n) { return 'M' + n; } }";
      await open(page, configStr);
      await expect(page.locator('.js-grid-text-0')).toHaveText('G0');
      await expect(page.locator('.js-grid-text-1')).toHaveText('G100');
      await expect(page.locator('.irs-min')).toHaveText('M0');
      await expect(page.locator('.irs-max')).toHaveText('M100');
      await expect(page.locator('.irs-single')).toHaveText('L50');
    });

    // Characterization test: green both before and after the feature (#306
    // is purely additive -- an existing single-`prettify` setup must keep
    // behaving exactly as it does today). Mutation this catches: making the
    // fallback in _prettifyGrid()/_prettifyMinMax() skip the shared
    // `prettify` option when the surface option is unset (e.g. falling
    // straight to the built-in thousands-separator formatter instead of
    // this._prettify()) -- the grid/min/max labels would then read plain
    // "0"/"50"/"100" instead of "L0"/"L50"/"L100".
    test('fallback: only prettify set -- grid and min/max both use it, same as before #306 (#306)', async ({ page }) => {
      const configStr = "{ min: 0, max: 100, from: 50, grid: true, grid_num: 1, "
        + "prettify: function (n) { return 'L' + n; } }";
      await open(page, configStr);
      await expect(page.locator('.js-grid-text-0')).toHaveText('L0');
      await expect(page.locator('.js-grid-text-1')).toHaveText('L100');
      await expect(page.locator('.irs-min')).toHaveText('L0');
      await expect(page.locator('.irs-max')).toHaveText('L100');
      await expect(page.locator('.irs-single')).toHaveText('L50');
    });

    // #306 data-* route: mirrors the #535 data-prettify coverage above, this
    // time for one of the two new options. Mutation this catches: dropping
    // the `prettify_grid: $inp.data("prettifyGrid"),` line from
    // config_from_data (js/ion.rangeSlider.js) -- the attribute would never
    // reach options.prettify_grid, so it stays unset and the grid ticks fall
    // back to default number formatting ("0"/"100" instead of "X0"/"X100").
    test('data-prettify-grid resolves a global function set as an HTML attribute (#306)', async ({ page }) => {
      await page.addInitScript(() => {
        window.myGridFormatter = function (n) { return 'X' + n; };
      });
      await open(page, { min: 0, max: 100, grid: true, grid_num: 1 }, { attrs: JSON.stringify({ 'data-prettify-grid': 'myGridFormatter' }) });
      await expect(page.locator('.js-grid-text-0')).toHaveText('X0');
      await expect(page.locator('.js-grid-text-1')).toHaveText('X100');
    });
  });

  test.describe('#359 onInit callback', () => {
    // #359: onInit fires once, after the initial render pass (init() calls
    // this.drawHandles() directly, then this.callOnInit(), before arming the
    // idle render loop via this.updateScene()) -- unlike onStart, which
    // fires earlier in init(), before that render pass ever runs. Registered
    // directly on the config object rather than through the fixture's
    // generic recorder (slider.html's names loop only wires onStart/
    // onChange/onFinish/onUpdate) so the handler can read page-observable
    // render state at the exact synchronous moment it is called, then push
    // its own entry onto the same shared events array the generic recorder
    // uses -- which also preserves call order relative to the recorded
    // onStart entry.
    test('onInit fires once, after the handle and labels are actually rendered, in order after onStart (#359)', async ({ page }) => {
      const configStr = "{ min: 0, max: 100, from: 30, "
        + "onInit: function (data) { "
        + "  var handle = document.querySelector('.irs-handle'); "
        + "  window.__irs.events.push({ "
        + "    type: 'onInit', from: data.from, to: data.to, "
        + "    handle_left: handle ? handle.style.left : '' "
        + "  }); "
        + "} }";
      await open(page, configStr);

      const ev = await events(page);
      const initEv = ev.filter((e) => e.type === 'onInit');
      expect(initEv.length).toBe(1);
      // Mutation this catches: firing onInit before this.drawHandles() runs
      // in init() -- the handle span never gets an inline "left" written
      // until drawHandles() runs (see js/ion.rangeSlider.js, the
      // s_single/s_from/s_to assignments), so reading it any earlier would
      // see "" instead of a percentage. (.irs-min's text is not checked
      // here: the base template pre-seeds it with "0" at append(), and
      // setMinMax() writes it before either callback runs, so that
      // assertion could never catch a mis-ordering -- only handle_left can.)
      expect(initEv[0].handle_left).not.toBe('');
      expect(ev.map((e) => e.type)).toEqual(['onStart', 'onInit']);
    });

    // #359's own motivating scenario: a DOM edit made inside onStart (e.g.
    // rewriting the .irs-min label) gets overwritten, because onStart fires
    // in init() before the render pass that follows it (drawHandles(), whose
    // first call is forced by force_redraw and re-runs setMinMax()); onInit
    // fires after that pass, so the same edit made there survives, including
    // past the idle 300ms render tick. Needs slider.html's onStart chaining
    // (added for #359) to let a real onStart body run at all -- normally the
    // fixture's recorder owns onStart/onChange/onFinish/onUpdate entirely.
    test('a DOM edit made in onInit survives the idle render tick; the same edit made in onStart does not (#359)', async ({ page }) => {
      const configStr = "{ min: 0, max: 100, from: 30, "
        + "onStart: function () { "
        + "  window.__onStartRan = true; "
        + "  var el = document.querySelector('.irs-min'); "
        + "  if (el) { el.textContent = 'START-EDIT'; } "
        + "}, "
        + "onInit: function () { "
        + "  var el = document.querySelector('.irs-min'); "
        + "  if (el) { el.textContent = 'INIT-EDIT'; } "
        + "} }";
      await open(page, configStr);

      // Proves onStart's handler actually ran (and so really attempted its
      // edit) -- without this, "the label reads INIT-EDIT" alone would not
      // distinguish "onStart's edit got clobbered" from "onStart's body
      // never ran at all".
      expect(await page.evaluate(() => window.__onStartRan)).toBe(true);

      // Mutation this catches: firing onInit before the render pass (moving
      // the callOnInit() call ahead of this.updateScene() in init(), or
      // dropping it) -- setMinMax() would then run after onInit's edit (or
      // the edit would never happen), leaving the plain "0" label, not
      // "INIT-EDIT".
      await expect(page.locator('.irs-min')).toHaveText('INIT-EDIT');

      // Outlast the 300ms idle render poll (see the testing reference) --
      // proves this is settled state, not a value about to be clobbered on
      // the next tick.
      await page.waitForTimeout(400);
      await expect(page.locator('.irs-min')).toHaveText('INIT-EDIT');
    });
  });

  test.describe('#661 values mode: prettify receives the value, not the index', () => {
    // #661: calc()'s single branch (js/ion.rangeSlider.js) called
    // this._prettify(this.result.from) unconditionally. In values mode
    // result.from is the INDEX into options.values, not the value, so the
    // custom prettify above got the index instead of the real entry -- and,
    // at load, an extra 0-index call from init()'s calc(true) plus
    // drawHandles()'s force_redraw re-calc(true) (the "two 0s at init" half
    // of the bug report). Mutation this catches: reverting calc()'s
    // `if (this.options.values.length) {...} else {...}` split back to the
    // unconditional this._prettify(this.result.from) -- from_pretty would
    // then read index-shaped text ("V2" instead of "V20"), and the drag
    // that settles on index 2 (value 20) would push the bare index 2 into
    // window.__pretty instead of 20, which is what assertion (b) below
    // catches.
    test('a real drag: from_pretty matches the rendered bubble, and the custom prettify only ever sees real entry values (#661)', async ({ page }) => {
      await page.addInitScript(() => { window.__pretty = []; });
      const configStr = "{ values: [1, 5, 20, 100, 1000], "
        + "prettify: function (n) { window.__pretty.push(n); return 'V' + n; } }";
      await open(page, configStr);

      // Drag to the middle of the line: 5 entries (indices 0-4) snap to the
      // middle index, 2 -- value 20. Chosen deliberately unequal to its own
      // index so a bugged (index-prettified) result is unambiguous ("V2").
      await drag(page, '.irs-handle.single', 0.5);
      await expect.poll(() => eventTypes(page)).toContain('onFinish');

      // (a) the rendered bubble and the last recorded event's from_pretty agree.
      const label = await page.locator('.irs-single').textContent();
      const ev = await events(page);
      const last = ev.filter((e) => e.type === 'onChange' || e.type === 'onFinish').at(-1);
      expect(last.from_pretty).toBe(label);
      expect(label).toBe('V20');

      // (b) the custom prettify function was only ever handed real entry
      // values -- never a bare index (0-4, only coincidentally overlapping
      // with the real value 1) and never the spurious 0 the pre-fix double
      // calc(true) at init produced.
      const pretty = await page.evaluate(() => window.__pretty);
      expect(pretty.every((n) => [1, 5, 20, 100, 1000].includes(n))).toBe(true);
    });
  });
});
