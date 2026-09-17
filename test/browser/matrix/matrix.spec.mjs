// #877 browser suite -- the combination matrix: every entry of configs.json is built
// in a real browser and driven through one fixed interaction script (S0 init, S1/S2
// handle drags, S3 track click, S4a to S4d one key press each, S5 bar drag,
// S6 update(), S7 reset(), S8 destroy(), S9 build it again on the same input), with the
// fourteen readme invariants of ../lib/invariants.mjs checked after every stage.
//
// Nothing here carries a per-case expected value: the expectations come from the
// readme through the invariants and the label/scale oracles, so a failure always names
// the documented promise that broke. A failure is a finding to file, never a rule to
// relax -- a filed bug gets a ../lib/known-bugs.mjs entry, which turns the red cell
// into an annotation and fails again the day the bug is fixed.
//
// One test per configuration, so a failure names the configuration in its title.

import { test, expect } from '@playwright/test';
import configs from './configs.json' with { type: 'json' };
import { open } from '../helpers.mjs';
import { readState } from '../lib/state.mjs';
import { dragHandleTo, dragBarBy, clickTrackAt, focusTrack, pressKeys } from '../lib/interact.mjs';
import { checkInvariants } from '../lib/invariants.mjs';
import { judgeStage } from '../lib/known-bugs.mjs';
import { isValuesMode, nearestOnScale, rangeOf } from '../lib/scale.mjs';

/** Outlasts the plugin's 300 ms idle render poll (see the testing reference). */
const IDLE_TICK = 400;

/**
 * The three track fractions the mouse stages aim at.
 *
 * A generated double entry starts with its from handle at 30 % of the range and its to
 * handle at 70 % (dimensions.mjs), so those two fractions are the one place a drag would
 * move nothing: S1 and S2 aim outside the starting pair instead, and each drag really
 * travels. The click is off the midpoint for the same reason -- 0.5 is exactly halfway
 * between a 0.3 and a 0.7 pair, where which handle the plugin picks comes down to float
 * noise, while 0.55 always resolves to the to handle.
 *
 * A named case may override the S1 fraction with `stages: { s1: <fraction> }` in
 * dimensions.mjs when its bug lives somewhere the shared script never visits --
 * edge:min-interval-top needs the from handle driven to the very top of the track. That is
 * the whole override mechanism: one optional number per entry, read here, defaulted below,
 * so the interaction script itself stays one script for all 128 entries.
 */
const S1_TARGET = 0.2;
const S2_TARGET = 0.8;
const S3_CLICK = 0.55;

/**
 * The three function-valued prettify options, as
 * [source key in the config, option name on the page, oracle key on the cfg].
 *
 * configs.json is plain JSON and cannot hold a function, so the generator stores the
 * SOURCE of a custom prettify. The page gets it back as a real function expression
 * inside the fixture's eval'd config literal; the oracle in ../lib/format.mjs gets its
 * own copy under the `__`-prefixed key, compiled here.
 */
const PRETTIFY_SOURCES = [
  ['__prettify_src', 'prettify', '__prettify'],
  ['__prettify_grid_src', 'prettify_grid', '__prettify_grid'],
  ['__prettify_min_max_src', 'prettify_min_max', '__prettify_min_max']
];

/** The invariants whose expected values come from the prettify oracle. */
const ORACLE_DEPENDENT = ['labels', 'grid'];

/**
 * S4, one press per stage: three increase keys then one decrease key, as
 * [stage, Playwright key, direction]. Pressed and read one at a time so a press that
 * moves nothing, a press that moves two steps and a press whose callbacks were folded
 * into a neighbour's are all distinguishable.
 */
const KEY_PRESSES = [
  ['S4a', 'ArrowRight', '+'],
  ['S4b', 'ArrowRight', '+'],
  ['S4c', 'ArrowRight', '+'],
  ['S4d', 'ArrowLeft', '-']
];

/**
 * Did either handle move between two states?
 *
 * @param {object|null} before
 * @param {object} after
 * @returns {boolean}
 */
function valuesMoved(before, after) {
  if (!before || !before.values || !after || !after.values) return false;
  return before.values.from !== after.values.from || before.values.to !== after.values.to;
}

/**
 * Is this state's bar too narrow to press?
 *
 * dragBarBy aims at the bar's CENTRE (../lib/interact.mjs), and the bar runs from the from
 * handle's centre to the to handle's centre -- so each handle covers half of its own width
 * of the bar, and the centre of a bar no wider than a handle lies under one of them. The
 * press grabs that handle and S5 is an ordinary handle drag, free to close the pair where
 * nothing holds it open. An interval clamp is what leaves a bar that thin: m080 holds 6000
 * of a range of a million, under four pixels of a 600 px track beneath two sixteen-pixel
 * handles. The answer is read off the state the stage STARTED from and handed to the
 * intervals rule, which stands its width promise down on it.
 *
 * @param {object|null} state
 * @returns {boolean}
 */
function barNarrowerThanHandle(state) {
  if (!state) return false;
  const handles = state.handles || {};
  const widths = Object.keys(handles).map((name) => (handles[name].box ? handles[name].box.width : 0));
  const widest = widths.length ? Math.max(...widths) : 0;
  // A pair walked onto one value renders no bar at all, which is a bar of no width.
  const bar = state.bar ? state.bar.width : 0;
  return bar <= widest;
}

/**
 * Page-level variables the captured site demos close over.
 *
 * page_demo_adv.js declares `var lang = "en-US"` (line 187) and its tsToDate prettify
 * reads it. Inlined into the fixture that variable does not exist, the plugin's first
 * prettify call throws a ReferenceError and the slider never finishes initialising, so
 * the entry cannot be driven at all. Putting the demo page's own value back is what
 * makes it the same configuration the site runs. Applied only to the entries whose
 * captured source needs it (see attachPrettifyOracles).
 */
const DEMO_PAGE_GLOBALS = { lang: 'en-US' };

/**
 * A JS object literal for the fixture's `config` query param (the fixture evals it, so
 * a function expression survives the trip -- JSON.stringify would drop it).
 *
 * @param {object} config the entry's config, exactly as configs.json holds it
 * @returns {string}
 */
function configLiteral(config) {
  const parts = [];
  for (const key of Object.keys(config)) {
    const mapping = PRETTIFY_SOURCES.find((row) => row[0] === key);
    if (mapping) parts.push(`${JSON.stringify(mapping[1])}: ${config[key]}`);
    else parts.push(`${JSON.stringify(key)}: ${JSON.stringify(config[key])}`);
  }
  return `{${parts.join(', ')}}`;
}

/**
 * Compiles the entry's custom prettify sources into test-side copies on `cfg`, so the
 * label and grid oracles format a value the same way the page does.
 *
 * A source is only usable here when it compiles AND runs outside the page: a site demo
 * function that closes over a page-level variable (page_demo_adv's tsToDate reads the
 * demo page's `lang`) throws when it is called from the test process. There is no
 * honest expected label text for that entry, so it is marked instead of guessed at.
 *
 * @param {object} cfg the entry's effective option set (mutated)
 * @returns {boolean} false when a source could not be made to run here
 */
function attachPrettifyOracles(cfg) {
  const probe = isValuesMode(cfg) ? 0 : rangeOf(cfg).min;
  let usable = true;
  for (const [sourceKey, , oracleKey] of PRETTIFY_SOURCES) {
    const source = cfg[sourceKey];
    if (typeof source !== 'string') continue;
    try {
      const fn = new Function(`return (${source})`)();
      if (typeof fn !== 'function') throw new TypeError(`${sourceKey} is not a function expression`);
      fn(probe);
      cfg[oracleKey] = fn;
    } catch {
      usable = false;
    }
  }
  return usable;
}

/**
 * The value S6's update() moves the from handle to: the middle of the range, snapped to
 * the documented scale (values mode works on indexes, so the middle index).
 *
 * @param {object} cfg
 * @returns {number}
 */
function midValue(cfg) {
  if (isValuesMode(cfg)) return Math.floor(cfg.values.length / 2);
  const { min, max } = rangeOf(cfg);
  return nearestOnScale((min + max) / 2, cfg);
}

for (const entry of configs.filter((c) => c.id)) {
  test(`matrix ${entry.id} ${entry.name}`, async ({ page }, testInfo) => {
    // Nine stages, each followed by an idle-tick wait and a full state read; 20 s (the
    // shared default) is not enough for the slowest entries.
    test.setTimeout(45_000);

    // The option set the PLUGIN sees, which is not always the one the page is handed:
    // the route dimension moves options into data-* attributes or the input's value
    // attribute, leaving `config` partly (for a data-route entry, entirely) empty.
    const cfg = entry.effective;
    const oracleUsable = attachPrettifyOracles(cfg);
    if (!oracleUsable) {
      // Marked on the cfg so a reader of a failure message can see why the label and
      // grid rules were left out for this entry.
      cfg.__skip_label_invariants = true;
      testInfo.annotations.push({ type: 'oracle', description: 'prettify source not evaluable outside the page; labels and grid are not checked for this entry' });
      // The same source still has to RUN on the page, or the slider never initialises.
      await page.addInitScript((globals) => {
        for (const name in globals) window[name] = globals[name];
      }, DEMO_PAGE_GLOBALS);
    }
    const skipped = oracleUsable ? [] : ORACLE_DEPENDENT;

    const extra = {
      record_init: '1',
      dom_events: '1',
      ...(entry.extra || {}),
      ...(entry.attrs ? { attrs: JSON.stringify(entry.attrs) } : {})
    };
    const literal = configLiteral(entry.config);
    await open(page, literal, extra);

    // readme, onInit: "for a slider that starts hidden, edit its DOM only after it
    // first becomes visible" -- a slider built inside a display:none container has no
    // finished render yet, so its value labels still hold the template's placeholder
    // text and the from/to versus merged choice has not been made. The other twelve
    // rules hold: the input, the grid and the callbacks are all written at init.
    //
    // Only the labels are carved out. In values mode a slider built hidden also leaves
    // its input empty at S0, which is NOT exempted here: the readme's note covers the
    // DOM the slider draws, not the value the input carries into a form, so the input
    // rule stays armed and keeps reporting it as a finding.
    const hiddenAtInit = !!(entry.extra && entry.extra.hidden === '1');
    if (hiddenAtInit) testInfo.annotations.push({ type: 'container', description: 'built hidden: the labels rule is not checked at S0, the slider renders once visible' });

    // Two things the register's predicates need that the option set alone cannot carry:
    // the container the slider was built in, and the input's value attribute. Both are
    // configuration in the readme's sense (it documents the hidden container under
    // onInit and the value attribute under config resolution), and a bug that only
    // happens on one of those routes can only be recognised by them.
    if (hiddenAtInit) cfg.__hidden_at_init = true;
    if (entry.attrs && typeof entry.attrs.value === 'string') cfg.__value_attr = entry.attrs.value;

    let prev = null;
    /**
     * Reads the state this stage left behind and judges it.
     *
     * `expectations` may be a function of (state, prev): the key stages below promise
     * "this press changed the value" or "this press changed nothing", which can only be
     * said once the state after the press has been read.
     */
    const assertStage = async (stage, expectations) => {
      const state = await readState(page, 1, cfg);
      const promised = typeof expectations === 'function' ? expectations(state, prev) : expectations;
      const ctx = { state, cfg, stage, prev, expectations: promised };
      const stageSkipped = hiddenAtInit && stage === 'S0' ? skipped.concat('labels') : skipped;
      const failures = checkInvariants(ctx).filter((f) => stageSkipped.indexOf(f.id) < 0);
      // ../lib/known-bugs.mjs decides what a filed bug already accounts for, what is still
      // real, and which register entry has stopped reproducing here and has to be retired.
      const { real, annotations } = judgeStage(failures, ctx, stageSkipped);
      for (const known of annotations) {
        testInfo.annotations.push({ type: 'known bug', description: `#${known.issue} ${known.title} (${known.stage}/${known.id}): ${known.message}` });
      }
      expect(real, `${stage}: ${real.map((f) => f.message).join('\n')}`).toEqual([]);
      prev = state;
    };

    await assertStage('S0', { changed: false });

    if (hiddenAtInit) {
      // readme note on onInit: a slider built inside a hidden container renders once
      // the container becomes visible. Every stage from here on measures geometry, so
      // the container is revealed and given one idle tick to lay itself out.
      await page.evaluate(() => { document.getElementById('wrap').style.display = ''; });
      await page.waitForTimeout(IDLE_TICK);
      testInfo.annotations.push({ type: 'container', description: 'built hidden, revealed after S0' });
    }

    const dbl = cfg.type === 'double';
    const inert = !!(cfg.disable || cfg.block);

    const s1Target = entry.stages && typeof entry.stages.s1 === 'number' ? entry.stages.s1 : S1_TARGET;
    await dragHandleTo(page, dbl ? 'from' : 'single', s1Target);
    await page.waitForTimeout(IDLE_TICK);
    await assertStage('S1', { changed: !inert && !cfg.from_fixed, handle: dbl ? 'from' : 'single' });

    if (dbl) {
      await dragHandleTo(page, 'to', S2_TARGET);
      await page.waitForTimeout(IDLE_TICK);
      await assertStage('S2', { changed: !inert && !cfg.to_fixed, handle: 'to' });
    } else {
      testInfo.annotations.push({ type: 'skipped stage', description: 'S2 single type has no to handle' });
    }

    await clickTrackAt(page, S3_CLICK);
    await page.waitForTimeout(IDLE_TICK);
    await assertStage('S3', { click: true, changed: !inert });

    if (cfg.keyboard !== false) {
      await focusTrack(page);
      // One press per stage, each given its own idle tick to render: while the slider
      // sits idle the render loop is a 300 ms setTimeout, so presses fired inside one
      // window are drawn together and their callbacks collapse into a single pair.
      // Paced this way every press is judged on what it alone did -- how far it moved
      // the targeted handle, and which callbacks it owes.
      for (const [stage, key, direction] of KEY_PRESSES) {
        await pressKeys(page, [key]);
        await page.waitForTimeout(IDLE_TICK);
        await assertStage(stage, (state, before) => ({ key: direction, changed: valuesMoved(before, state) }));
      }
    } else {
      testInfo.annotations.push({ type: 'skipped stage', description: 'S4 keyboard off' });
    }

    if (dbl && cfg.drag_interval) {
      // A bar no wider than the handles standing on it cannot be pressed (see
      // barNarrowerThanHandle): the press lands on a handle and the stage is an ordinary
      // handle drag. The intervals rule stands down on the width there
      // (../lib/invariants.mjs) and every other rule judges the stage as the handle drag it
      // is, so the reader is told which it was.
      const narrowBar = barNarrowerThanHandle(prev);
      if (narrowBar) {
        testInfo.annotations.push({ type: 'narrow bar', description: 'the S5 drag lands on a handle, the width check does not apply' });
      }
      await dragBarBy(page, 0.1);
      await page.waitForTimeout(IDLE_TICK);
      await assertStage('S5', {
        bar: true,
        changed: !inert && !cfg.from_fixed && !cfg.to_fixed,
        bar_narrower_than_handle: narrowBar
      });
    } else {
      testInfo.annotations.push({ type: 'skipped stage', description: 'S5 needs double type with drag_interval' });
    }

    await page.evaluate((m) => window.__irs.slider.update({ from: m }), midValue(cfg));
    await page.waitForTimeout(IDLE_TICK);
    await assertStage('S6', { update: true });

    await page.evaluate(() => window.__irs.slider.reset());
    await page.waitForTimeout(IDLE_TICK);
    await assertStage('S7', { update: true });

    await page.evaluate(() => window.__irs.slider.destroy());
    await assertStage('S8', { destroyed: true });

    // readme, Public methods: "After destroy() the input is back to normal and can be
    // initialized again." The same input is handed the same configuration a second time --
    // anything destroy() left behind (the instance handle above all) makes this call a
    // silent no-op, and the slider never comes back.
    await page.evaluate((config) => {
      const el = document.getElementById('slider');
      // eval, like the fixture's own config parsing: the literal can carry a prettify
      // function expression, which JSON.parse could not read back.
      jQuery(el).ionRangeSlider(eval('(' + config + ')'));
      window.__irs.slider = jQuery.data(el, 'ionRangeSlider');
    }, literal);
    await page.waitForTimeout(IDLE_TICK);
    await assertStage('S9', { reinitialised: true });
  });
}
