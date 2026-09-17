// #877 browser suite -- the combination matrix: every entry of configs.json is built
// in a real browser and driven through one fixed interaction script (S0 init, S1/S2
// handle drags, S3 track click, S4a to S4d one key press each, S5 bar drag,
// S6 update(), S7 reset(), S8 destroy()), with the thirteen readme invariants of
// ../lib/invariants.mjs checked after every stage.
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
import { INVARIANTS, checkInvariants } from '../lib/invariants.mjs';
import { matchKnownBug } from '../lib/known-bugs.mjs';
import { isValuesMode, nearestOnScale, rangeOf } from '../lib/scale.mjs';

/** Outlasts the plugin's 300 ms idle render poll (see the testing reference). */
const IDLE_TICK = 400;

/**
 * Track fraction S1 drags the from (or single) handle to, shared by every entry.
 *
 * A named case may override it with `stages: { s1: <fraction> }` in dimensions.mjs when
 * its bug lives somewhere the shared script never visits -- edge:min-interval-top needs
 * the from handle driven to the very top of the track, which 0.3 never reaches. This is
 * the whole override mechanism: one optional number per entry, read here, defaulted
 * below, so the interaction script itself stays one script for all 128 entries.
 */
const S1_TARGET = 0.3;

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
    await open(page, configLiteral(entry.config), extra);

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
      const real = [];
      for (const failure of failures) {
        const known = matchKnownBug(ctx, failure.id);
        if (known) testInfo.annotations.push({ type: 'known bug', description: `#${known.issue} ${known.title} (${stage}/${failure.id})` });
        else real.push(failure);
      }
      // A register entry that no longer reproduces has to be retired, or the suite
      // would keep excusing a bug that is already fixed.
      for (const invariant of INVARIANTS) {
        if (stageSkipped.indexOf(invariant.id) >= 0) continue;
        const known = matchKnownBug(ctx, invariant.id);
        if (known && !failures.some((f) => f.id === invariant.id)) {
          real.push({ id: invariant.id, message: `bug #${known.issue} no longer reproduces here; remove its register entry` });
        }
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

    // A slider whose effective min equals its max (edge:min-eq-max, or a one-entry
    // values array) has one reachable value and nowhere for a handle to go. The readme
    // gives that slider no interaction semantics at all: every interaction row it
    // documents -- the drag, the track click, the keyboard, onChange, onFinish -- is
    // written for a handle that can move, and it never says what a press with nowhere to
    // go owes. Rather than judge the stages against a promise the readme does not make,
    // the script runs the two stages that ARE documented for it (the slider is built,
    // and it is destroyed) and skips the rest. No rule is relaxed: every invariant still
    // runs, at S0 and S8, exactly as for any other entry.
    const range = rangeOf(cfg);
    const zeroRange = range.min === range.max;
    if (zeroRange) {
      testInfo.annotations.push({ type: 'skipped stage', description: 'zero range: interaction stages skipped' });
    }

    if (!zeroRange) {
      const s1Target = entry.stages && typeof entry.stages.s1 === 'number' ? entry.stages.s1 : S1_TARGET;
      await dragHandleTo(page, dbl ? 'from' : 'single', s1Target);
      await page.waitForTimeout(IDLE_TICK);
      await assertStage('S1', { changed: !inert && !cfg.from_fixed, handle: dbl ? 'from' : 'single' });

      if (dbl) {
        await dragHandleTo(page, 'to', 0.7);
        await page.waitForTimeout(IDLE_TICK);
        await assertStage('S2', { changed: !inert && !cfg.to_fixed, handle: 'to' });
      } else {
        testInfo.annotations.push({ type: 'skipped stage', description: 'S2 single type has no to handle' });
      }

      await clickTrackAt(page, 0.5);
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
        await dragBarBy(page, 0.1);
        await page.waitForTimeout(IDLE_TICK);
        await assertStage('S5', { bar: true, changed: !inert && !cfg.from_fixed && !cfg.to_fixed });
      } else {
        testInfo.annotations.push({ type: 'skipped stage', description: 'S5 needs double type with drag_interval' });
      }

      await page.evaluate((m) => window.__irs.slider.update({ from: m }), midValue(cfg));
      await page.waitForTimeout(IDLE_TICK);
      await assertStage('S6', { update: true });

      await page.evaluate(() => window.__irs.slider.reset());
      await page.waitForTimeout(IDLE_TICK);
      await assertStage('S7', { update: true });
    }

    await page.evaluate(() => window.__irs.slider.destroy());
    await assertStage('S8', { destroyed: true });
  });
}
