/**
 * #877 browser suite -- the fourteen readme invariants checked after every stage of
 * the combination matrix.
 *
 * Each entry carries the readme sentence it derives from, so a failure names the
 * promise that broke rather than an implementation detail. The readme is the oracle
 * throughout: where it is silent the rule says so and is marked characterization,
 * and where the plugin disagrees with it the failure is a finding for the known-bug
 * register (test/browser/lib/known-bugs.mjs), not a rule to relax.
 *
 * Context (built by test/browser/matrix/matrix.spec.mjs):
 *   ctx = {
 *     state,          // the State from lib/state.mjs, read after the stage settled
 *     cfg,            // the configuration the slider was built with
 *     stage,          // 'S0'..'S9'
 *     prev,           // the State before this stage, or null at S0
 *     expectations    // what the stage promised: { changed }, { changed, handle },
 *                     // { click, changed }, { key: '+'|'-', changed },
 *                     // { bar, changed, bar_narrower_than_handle }, { update: true },
 *                     // { destroyed: true } or { reinitialised: true }
 *   }
 *
 * State fields these rules read (the contract with lib/state.mjs):
 *   input { value, disabled, dataFrom, dataTo, classes[], dataHandle }
 *   container { exists, classes[] }
 *   labels { single, from, to, min, max } each { text, visible }
 *   handles { single?, from?, to? }
 *   grid { present, texts[] }
 *   mask
 *   events[]   the recorded callbacks, in the fixture's entry shape
 *   values { from, to }
 */

import { isValuesMode, nearestOnScale, onScale, rangeOf } from './scale.mjs';
import { expectedGridLabel, expectedLabel, expectedMerged, expectedPretty, valuesEntry } from './format.mjs';

/** Values sit on a step grid, so only float representation noise is tolerated. */
const EPS = 1e-9;

/**
 * The stages of the matrix script that drive the slider through a user interaction:
 * S1 and S2 the handle drags, S3 the track click, S4a to S4d one key press each (the
 * keys are pressed one at a time so every press is judged on its own), S5 the bar drag.
 */
const INTERACTION_STAGE_PATTERN = /^S[1-5]/;

/** readme settings table default for input_values_separator. */
const DEFAULT_INPUT_SEPARATOR = ';';

/** readme settings table default for grid_num. */
const DEFAULT_GRID_NUM = 4;

/** readme settings table: grid_num is "at most 50", and grid_snap is "capped at 50 units". */
const GRID_UNIT_CAP = 50;

const isDouble = (cfg) => cfg.type === 'double';
const isInteraction = (ctx) => INTERACTION_STAGE_PATTERN.test(String(ctx.stage));
/** The direction of the key this stage pressed: 1 for an increase key, -1 for a decrease key, 0 for no key. */
const keyDirection = (ctx) => {
    const key = ctx.expectations && ctx.expectations.key;
    return key === '+' ? 1 : key === '-' ? -1 : 0;
};
const alive = (ctx) => !!(ctx.state && ctx.state.container && ctx.state.container.exists);
const valuesOf = (state) => (state && state.values) || { from: null, to: null };
const labelOf = (state, name) => (state && state.labels && state.labels[name]) || { text: '', visible: false };
const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const near = (a, b) => Math.abs(a - b) <= EPS;
/**
 * Are these two readings of a handle the same value?
 *
 * The values travel through the percent conversions, so two readings of one value can differ
 * in the last bits; two numbers are compared with the same epsilon the rest of the file uses.
 * Anything that is not a number (null, the reading of an empty input) is compared exactly, so
 * a value appearing where there was none stays a change.
 *
 * @param {number|null} a
 * @param {number|null} b
 * @returns {boolean}
 */
const sameValue = (a, b) => (isNumber(a) && isNumber(b) ? near(a, b) : a === b);

const show = (value) => (typeof value === 'string' || Array.isArray(value) ? JSON.stringify(value) : String(value));

/**
 * One failure line: "<id>: <what> (expected <x>, got <y>) after <stage>".
 *
 * @returns {string}
 */
const report = (id, what, expected, got, stage) =>
    `${id}: ${what} (expected ${show(expected)}, got ${show(got)}) after ${stage}`;

/**
 * The callbacks recorded since the previous state, newest stage only.
 *
 * The matrix drives the first slider, so a second instance's stream (which: 2) is
 * left to the multi-instance contract test. The DOM change/input entries the
 * fixture records under dom:* are not callbacks and are checked there too.
 *
 * @param {object} ctx
 * @returns {Array<object>}
 */
function entriesSince(ctx) {
    const all = (ctx.state && ctx.state.events) || [];
    const start = ctx.prev && Array.isArray(ctx.prev.events) ? ctx.prev.events.length : 0;
    return all.slice(start).filter((entry) =>
        entry && typeof entry.type === 'string'
        && entry.type.slice(0, 4) !== 'dom:'
        && (entry.which === undefined || entry.which === 1));
}

/** Did this stage move either handle? */
function moved(ctx) {
    if (!ctx.prev) return false;
    const now = valuesOf(ctx.state);
    const before = valuesOf(ctx.prev);
    return !sameValue(now.from, before.from) || !sameValue(now.to, before.to);
}

/**
 * Number of grid units, per readme grid_num / grid_snap / values.
 *
 * Exported for the known-bug register, whose grid entry has to walk the same unit
 * boundaries this rule checks (a second copy of the rule there could drift from it).
 *
 * @param {object} cfg
 * @returns {number}
 */
export function gridUnits(cfg) {
    const { min, max, step } = rangeOf(cfg);
    // readme note "values": "The grid gets one labelled tick per entry, up to the
    // 50-unit cap, because grid_num and grid_snap are set for you."
    if (isValuesMode(cfg)) return Math.min(cfg.values.length - 1, GRID_UNIT_CAP);
    // readme settings table: grid_snap "Use one grid unit per step instead of
    // grid_num. Still capped at 50 units".
    if (cfg.grid_snap) return Math.min(Math.round((max - min) / step), GRID_UNIT_CAP);
    // readme settings table: grid_num "Number of grid units the value range is cut
    // into, at most 50", default 4.
    const num = Number(cfg.grid_num);
    return Math.min(Number.isFinite(num) && num > 0 ? num : DEFAULT_GRID_NUM, GRID_UNIT_CAP);
}

/**
 * The values the grid's unit boundaries carry.
 *
 * readme settings table, grid_num: "A labelled tick mark sits at each unit boundary",
 * and note "step": "Every value is min plus a whole number of steps, rounded to the
 * decimals of step". A boundary is a value like any other, so an evenly spaced
 * position that falls between two scale points is labelled with the point it sits on:
 * on min 0.5 / step 1 the boundary at 50 % of the range is 5.5, which the slider
 * cannot hold, and the tick there reads 6. The last boundary is max itself, which the
 * scale only reaches when the range divides into whole steps.
 *
 * @param {object} cfg
 * @param {number} units
 * @returns {number[]}   one value per boundary, units + 1 of them
 */
function gridUnitValues(cfg, units) {
    const { min, max } = rangeOf(cfg);
    const values = [];
    for (let i = 0; i < units; i++) {
        values.push(nearestOnScale(min + (i * (max - min)) / units, cfg));
    }
    values.push(max);
    return values;
}

/**
 * Where one handle may travel: the lowest and highest value a single key press can
 * land it on.
 *
 * readme settings table: min/max, from_min/from_max/to_min/to_max ("limit for the
 * ... handle"), min_interval/max_interval ("interval between the handles"), and from
 * being "the left one" with to "the right one".
 *
 * Exported for the known-bug register, whose keyboard entry has to ask where a press
 * would be stopped -- a press that lands on a stop hides the bug it carries, and a
 * second copy of this arithmetic there could drift from this one.
 *
 * @param {'from'|'to'} target
 * @param {object} cfg
 * @param {number|null} other   the value of the handle that did not move
 * @returns {{lo: number, hi: number}}
 */
export function keyStops(target, cfg, other) {
    const { min, max } = rangeOf(cfg);
    const minInterval = isNumber(cfg.min_interval) && cfg.min_interval > 0 ? cfg.min_interval : 0;
    const maxInterval = isNumber(cfg.max_interval) && cfg.max_interval > 0 ? cfg.max_interval : 0;
    let lo = min;
    let hi = max;

    if (target === 'from') {
        if (isNumber(cfg.from_min)) lo = Math.max(lo, cfg.from_min);
        if (isNumber(cfg.from_max)) hi = Math.min(hi, cfg.from_max);
        if (isDouble(cfg) && isNumber(other)) {
            hi = Math.min(hi, other - minInterval);
            if (maxInterval) lo = Math.max(lo, other - maxInterval);
        }
    } else {
        if (isNumber(cfg.to_min)) lo = Math.max(lo, cfg.to_min);
        if (isNumber(cfg.to_max)) hi = Math.min(hi, cfg.to_max);
        if (isNumber(other)) {
            lo = Math.max(lo, other + minInterval);
            if (maxInterval) hi = Math.min(hi, other + maxInterval);
        }
    }
    return { lo, hi };
}

export const INVARIANTS = [
    {
        id: 'bounds',
        readme: 'settings table: min "Minimum value", max "Maximum value", from "Start value of the from handle (the left one...)", to "Start value of the to handle (the right one)"; note "values": the slider works on array indexes',
        check(ctx) {
            if (!alive(ctx)) return [];
            const { cfg, stage } = ctx;
            const { min, max } = rangeOf(cfg);
            const { from, to } = valuesOf(ctx.state);
            const msgs = [];

            if (!isNumber(from)) {
                msgs.push(report('bounds', 'the from value must be a number', 'a number', from, stage));
            } else {
                if (from < min - EPS) msgs.push(report('bounds', 'from dropped below min', `>= ${min}`, from, stage));
                if (from > max + EPS) msgs.push(report('bounds', 'from rose above max', `<= ${max}`, from, stage));
            }

            if (isDouble(cfg)) {
                if (!isNumber(to)) {
                    msgs.push(report('bounds', 'the to value must be a number in double type', 'a number', to, stage));
                } else {
                    if (to < min - EPS) msgs.push(report('bounds', 'to dropped below min', `>= ${min}`, to, stage));
                    if (to > max + EPS) msgs.push(report('bounds', 'to rose above max', `<= ${max}`, to, stage));
                    if (isNumber(from) && to < from - EPS) msgs.push(report('bounds', 'the handles crossed: to is left of from', `>= ${from}`, to, stage));
                }
            }
            return msgs;
        }
    },

    {
        id: 'scale',
        readme: 'note "step": "Every value is min plus a whole number of steps, rounded to the decimals of step ... a negative min keeps its decimals instead"; note "step_from_min"',
        check(ctx) {
            // The rule applies to what an INTERACTION produced, so only a value this
            // stage moved is judged. The readme's "step" note covers the starting from
            // and to as well, and the plugin keeps a starting value off the scale until
            // the first interaction instead of moving it onto one, which is filed as
            // #900: the opening stage is left out here because of that defect, not
            // because the readme allows it. Fixing #900 does not lift the exclusion by
            // itself: three guards keep an untouched starting value out of this rule
            // (`!isInteraction(ctx)` and `!ctx.prev` in the return below, and the
            // `value === before[name]` skip in the loop), and they stay until they are
            // removed by hand. The #900 test.fail in the option routes spec is what will
            // prompt that: it turns into an unexpected pass the day the fix lands.
            // History: the plugin rendered an off-scale starting value as given at init
            // before #742 too; what the #742 fix removed is the focus-synthesized click
            // that used to snap such a value onto the scale on the first focus.
            if (!alive(ctx) || !isInteraction(ctx) || !ctx.prev) return [];
            const { cfg, stage } = ctx;
            const { min, step } = rangeOf(cfg);
            const now = valuesOf(ctx.state);
            const before = valuesOf(ctx.prev);
            const msgs = [];

            for (const name of ['from', 'to']) {
                if (name === 'to' && !isDouble(cfg)) continue;
                const value = now[name];
                if (!isNumber(value) || value === before[name]) continue;
                if (!onScale(value, cfg)) {
                    msgs.push(report('scale', `${name} left the documented scale`, `min ${min} plus whole steps of ${step}`, value, stage));
                }
            }
            return msgs;
        }
    },

    {
        id: 'limits',
        readme: 'settings table: from_min "Minimum limit for the from handle", from_max, to_min, to_max',
        check(ctx) {
            if (!alive(ctx)) return [];
            const { cfg, stage } = ctx;
            const { from, to } = valuesOf(ctx.state);
            const msgs = [];

            if (isNumber(from)) {
                if (isNumber(cfg.from_min) && from < cfg.from_min - EPS) msgs.push(report('limits', 'from passed below from_min', `>= ${cfg.from_min}`, from, stage));
                if (isNumber(cfg.from_max) && from > cfg.from_max + EPS) msgs.push(report('limits', 'from passed above from_max', `<= ${cfg.from_max}`, from, stage));
            }
            if (isNumber(to)) {
                if (isNumber(cfg.to_min) && to < cfg.to_min - EPS) msgs.push(report('limits', 'to passed below to_min', `>= ${cfg.to_min}`, to, stage));
                if (isNumber(cfg.to_max) && to > cfg.to_max + EPS) msgs.push(report('limits', 'to passed above to_max', `<= ${cfg.to_max}`, to, stage));
            }
            return msgs;
        }
    },

    {
        id: 'intervals',
        readme: 'settings table: min_interval "Smallest interval between the handles. 0 means no limit. Double type only", max_interval "Largest interval between the handles", drag_interval "Let the user drag the whole interval by its bar. Double type only"; the width a track click owes is characterization, the readme documents the bar drag only',
        check(ctx) {
            if (!alive(ctx) || !isDouble(ctx.cfg)) return [];
            const { cfg, stage } = ctx;
            const { from, to } = valuesOf(ctx.state);
            if (!isNumber(from) || !isNumber(to)) return [];
            const gap = to - from;
            const msgs = [];

            if (isNumber(cfg.min_interval) && cfg.min_interval > 0 && gap < cfg.min_interval - EPS) {
                msgs.push(report('intervals', 'the handles closed past min_interval', `>= ${cfg.min_interval}`, gap, stage));
            }
            if (isNumber(cfg.max_interval) && cfg.max_interval > 0 && gap > cfg.max_interval + EPS) {
                msgs.push(report('intervals', 'the handles opened past max_interval', `<= ${cfg.max_interval}`, gap, stage));
            }

            // readme settings table, drag_interval: "Let the user drag the whole interval
            // by its bar. Double type only". Two stages move the pair as a unit and owe
            // the width it had: S5 drags the bar, which is the sentence above, and with
            // drag_interval on a track click carries the whole interval to the click as
            // well. That second half is CHARACTERIZATION -- the readme documents the bar
            // as the way to move an interval and says nothing about the click, and the
            // centre move is the plugin's shipped behaviour, which the suite's
            // interactions contract records as "line clicks (nearest handle, drag_interval
            // centre move, click on a handle position)". Both are judged the same way, and
            // a failure of either is a finding for the register rather than a rule to
            // relax. When a bound or a limit stops the move it stops BOTH handles together
            // and the width still holds; one handle stopping while the other follows the
            // pointer stretches the interval, which is what this reports.
            const wholeIntervalMove = stage === 'S5'
                ? 'a bar drag moves the whole interval, so its width is unchanged'
                : stage === 'S3' && cfg.drag_interval
                    ? 'a track click with drag_interval moves the whole interval, so its width is unchanged'
                    : null;
            if (wholeIntervalMove && ctx.prev) {
                const was = valuesOf(ctx.prev);
                const width = isNumber(was.from) && isNumber(was.to) ? was.to - was.from : null;
                // A bar narrower than the handles standing on it cannot be pressed: the bar
                // runs from one handle's centre to the other's, so the press aimed at its
                // centre lands on a handle and the stage is an ordinary handle drag, which
                // may close the pair without breaking any promise. The width has nothing to
                // say there. matrix.spec.mjs measures the bar of the state the stage started
                // from and passes the answer in, which keeps this rule free of pixel reads;
                // the bounds, limits, interval and callback rules still judge the stage. The
                // click keeps its track whatever the handles are doing, so S3 is unaffected.
                const expectations = ctx.expectations || {};
                const pressedAHandle = stage === 'S5' && !!expectations.bar_narrower_than_handle;
                const hasBar = isNumber(width) && !pressedAHandle;
                if (hasBar && !near(gap, width)) {
                    msgs.push(report('intervals', wholeIntervalMove, width, gap, stage));
                }
            }
            return msgs;
        }
    },

    {
        id: 'fixed',
        readme: 'settings table: from_fixed "Fix the position of the from handle", to_fixed "Fix the position of the to handle"',
        check(ctx) {
            if (!alive(ctx) || !isInteraction(ctx) || !ctx.prev) return [];
            const { cfg, stage } = ctx;
            const now = valuesOf(ctx.state);
            const before = valuesOf(ctx.prev);
            const msgs = [];

            if (cfg.from_fixed && !sameValue(now.from, before.from)) {
                msgs.push(report('fixed', 'a from_fixed handle moved', before.from, now.from, stage));
            }
            if (cfg.to_fixed && isDouble(cfg) && !sameValue(now.to, before.to)) {
                msgs.push(report('fixed', 'a to_fixed handle moved', before.to, now.to, stage));
            }
            return msgs;
        }
    },

    {
        id: 'input',
        readme: 'settings table: input_values_separator "Separator in the input value in double type: <input value=\\"25;42\\">"; note "values_raw": the entry is written to the input as given',
        check(ctx) {
            if (!alive(ctx)) return [];
            const { cfg, stage } = ctx;
            const state = ctx.state;
            const separator = typeof cfg.input_values_separator === 'string' && cfg.input_values_separator
                ? cfg.input_values_separator
                : DEFAULT_INPUT_SEPARATOR;
            const text = String((state.input && state.input.value) || '');
            const parts = text.split(separator);
            const wanted = isDouble(cfg) ? 2 : 1;
            const msgs = [];

            if (parts.length !== wanted) {
                msgs.push(report('input', 'the input must carry one value per handle, joined by input_values_separator', `${wanted} part(s) split on ${show(separator)}`, text, stage));
                return msgs;
            }

            parts.forEach((part, index) => {
                const name = index === 0 ? 'from' : 'to';
                if (isValuesMode(cfg)) {
                    const entries = cfg.values.map((_, k) => String(valuesEntry(cfg, k)));
                    if (entries.indexOf(part) < 0) {
                        msgs.push(report('input', `the input's ${name} must be one of the values entries`, entries, part, stage));
                    }
                    return;
                }
                const num = Number(part);
                if (part.trim() === '' || !Number.isFinite(num)) {
                    msgs.push(report('input', `the input's ${name} must be a plain number, not formatted text`, 'a number', part, stage));
                } else if (String(num) !== part.trim()) {
                    msgs.push(report('input', `the input's ${name} must be the raw value`, String(num), part, stage));
                }
            });

            // The readme documents data-from / data-to as the attribute route INTO the
            // slider and says nothing about the write-back, so mirroring it is
            // characterization of the shipped behaviour. What writeToInput() actually
            // writes is the jQuery data of the input (input.data("from"/"to")), which is
            // what lib/state.mjs reads back, not the DOM attribute -- the message says so.
            // It still fails loudly if writeToInput() stops updating it. Values mode is
            // left out: the readme does not say whether the index or the entry is written
            // there.
            if (!isValuesMode(cfg)) {
                const values = valuesOf(state);
                const data = state.input || {};
                if (isNumber(values.from) && data.dataFrom !== values.from) {
                    msgs.push(report('input', "the jQuery data 'from' the plugin writes must mirror the from value", values.from, data.dataFrom, stage));
                }
                if (isDouble(cfg) && isNumber(values.to) && data.dataTo !== values.to) {
                    msgs.push(report('input', "the jQuery data 'to' the plugin writes must mirror the to value", values.to, data.dataTo, stage));
                }
            }
            return msgs;
        }
    },

    {
        id: 'labels',
        readme: 'settings table: hide_from_to "Hide the from and to value labels", hide_min_max "Hide the min and max labels", decorate_both and values_separator for the merged label, prefix/postfix/min_prefix/max_prefix/max_postfix and the prettify options for the text',
        // Coincident handles (from === to) are the one case where a double slider shows
        // neither both value labels nor their merged pair: the plugin draws ONE of the two
        // value labels -- the from label while nothing has been touched, the label of the
        // handle the press went to after that -- hides the other behind it and leaves the
        // merged label hidden with its "50 - 50" text unused. Which handle the press went
        // to is not always the one a drag aimed at: on a coincident pair it lands on the
        // handle lying on top, `to` at init and the last touched one afterwards. That is
        // edge:from-above-to, whose from: 80 with to: 20 validate() parks on one value
        // (from comes down onto to) before a single handle is drawn -- so the pair is
        // coincident from init, and the to label is what shows from S1 on because `to` is
        // the handle the S1 press landed on. Characterization
        // -- the readme describes the merged label for handles that COLLIDE and says
        // nothing about handles that sit on the same value, and one number for a
        // zero-width interval is a defensible reading of it. Accepted only while the two
        // values are equal, and the text of that lone label is still pinned to its own
        // handle's value below, so a label that stopped rendering or started reading the
        // wrong value is still reported.
        check(ctx) {
            if (!alive(ctx)) return [];
            const { cfg, stage, state } = ctx;
            const { min, max } = rangeOf(cfg);
            const { from, to } = valuesOf(state);
            const msgs = [];

            if (cfg.hide_from_to) {
                for (const name of ['single', 'from', 'to']) {
                    if (labelOf(state, name).visible) {
                        msgs.push(report('labels', `the ${name} value label is visible with hide_from_to on`, false, true, stage));
                    }
                }
            } else if (!isDouble(cfg)) {
                const single = labelOf(state, 'single');
                if (!single.visible) {
                    msgs.push(report('labels', 'the single value label must be visible', true, false, stage));
                } else if (isNumber(from) && single.text !== expectedLabel(from, cfg, 'handle')) {
                    msgs.push(report('labels', 'the single value label text', expectedLabel(from, cfg, 'handle'), single.text, stage));
                }
            } else {
                const merged = labelOf(state, 'single');
                const fromLabel = labelOf(state, 'from');
                const toLabel = labelOf(state, 'to');

                // The coincident-handle rendering documented on this rule: with from on
                // the same value as to, the from label alone is what the plugin draws.
                const coincident = isNumber(from) && isNumber(to) && near(from, to);
                const lonely = coincident && fromLabel.visible !== toLabel.visible;

                if (merged.visible && (fromLabel.visible || toLabel.visible)) {
                    msgs.push(report('labels', 'the merged label and the from/to labels are visible together', 'one of them', 'both', stage));
                } else if (!merged.visible && !(fromLabel.visible && toLabel.visible) && !lonely) {
                    msgs.push(report('labels', 'neither the merged label nor both value labels are visible', 'one of them', 'neither', stage));
                }

                if (merged.visible && isNumber(from) && isNumber(to)) {
                    const wanted = expectedMerged(from, to, cfg);
                    if (merged.text !== wanted) msgs.push(report('labels', 'the merged label text', wanted, merged.text, stage));
                }
                if (!merged.visible) {
                    if (fromLabel.visible && isNumber(from) && fromLabel.text !== expectedLabel(from, cfg, 'handle')) {
                        msgs.push(report('labels', 'the from label text', expectedLabel(from, cfg, 'handle'), fromLabel.text, stage));
                    }
                    if (toLabel.visible && isNumber(to) && toLabel.text !== expectedLabel(to, cfg, 'handle')) {
                        msgs.push(report('labels', 'the to label text', expectedLabel(to, cfg, 'handle'), toLabel.text, stage));
                    }
                }
            }

            if (cfg.hide_min_max) {
                for (const name of ['min', 'max']) {
                    if (labelOf(state, name).visible) {
                        msgs.push(report('labels', `the ${name} label is visible with hide_min_max on`, false, true, stage));
                    }
                }
            } else {
                // A hidden min or max label is allowed: the plugin hides it once a value
                // label covers it. Only its text is pinned.
                const minLabel = labelOf(state, 'min');
                const maxLabel = labelOf(state, 'max');
                if (minLabel.visible && minLabel.text !== expectedLabel(min, cfg, 'min')) {
                    msgs.push(report('labels', 'the min label text', expectedLabel(min, cfg, 'min'), minLabel.text, stage));
                }
                if (maxLabel.visible && maxLabel.text !== expectedLabel(max, cfg, 'max')) {
                    msgs.push(report('labels', 'the max label text', expectedLabel(max, cfg, 'max'), maxLabel.text, stage));
                }
            }
            return msgs;
        }
    },

    {
        id: 'grid',
        readme: 'settings table: grid "Show the value grid below the slider", grid_num "Number of grid units the value range is cut into, at most 50. A labelled tick mark sits at each unit boundary", grid_snap "Use one grid unit per step instead of grid_num"; note "values": one labelled tick per entry',
        check(ctx) {
            if (!alive(ctx)) return [];
            const { cfg, stage, state } = ctx;
            const grid = state.grid || { present: false, texts: [] };
            const wantGrid = !!cfg.grid;

            if (!!grid.present !== wantGrid) {
                return [report('grid', 'the grid is rendered only with grid: true', wantGrid, !!grid.present, stage)];
            }
            if (!wantGrid) return [];

            const msgs = [];
            const units = gridUnits(cfg);
            const texts = grid.texts || [];
            if (texts.length !== units + 1) {
                msgs.push(report('grid', 'one label per unit boundary', units + 1, texts.length, stage));
                return msgs;
            }

            if (isValuesMode(cfg)) {
                texts.forEach((text, i) => {
                    const wanted = expectedGridLabel(i, cfg);
                    if (text !== wanted) msgs.push(report('grid', `the grid label at index ${i}`, wanted, text, stage));
                });
                return msgs;
            }

            const values = gridUnitValues(cfg, units);
            texts.forEach((text, i) => {
                const wanted = expectedGridLabel(values[i], cfg);
                if (text !== wanted) msgs.push(report('grid', `the grid label at unit ${i}`, wanted, text, stage));
            });
            return msgs;
        }
    },

    {
        id: 'dom',
        readme: 'settings table: skin "Skin (flat, big, modern, round, sharp, square)", type "single for one handle, double for two handles", extra_classes "Extra CSS classes for the slider container", disable "Disable the slider and the input", block "Block the slider but keep the input enabled"',
        check(ctx) {
            if (!alive(ctx)) return [];
            const { cfg, stage, state } = ctx;
            const classes = (state.container && state.container.classes) || [];
            const msgs = [];

            if (classes.indexOf('irs') < 0) msgs.push(report('dom', 'the container must carry the irs class', 'irs', classes, stage));

            const skin = typeof cfg.skin === 'string' && cfg.skin ? cfg.skin : 'flat';
            if (classes.indexOf(`irs--${skin}`) < 0) msgs.push(report('dom', 'the skin class on the container', `irs--${skin}`, classes, stage));

            if (!classes.some((name) => /^js-irs-\d+$/.test(name))) {
                msgs.push(report('dom', 'the container must carry its js-irs-N instance class', 'js-irs-<n>', classes, stage));
            }

            const extra = String(cfg.extra_classes || '').split(/\s+/).filter(Boolean);
            for (const name of extra) {
                if (classes.indexOf(name) < 0) msgs.push(report('dom', 'an extra_classes class is missing from the container', name, classes, stage));
            }

            const handles = state.handles || {};
            if (isDouble(cfg)) {
                if (!handles.from || !handles.to) msgs.push(report('dom', 'double type renders a from and a to handle', 'from and to', Object.keys(handles), stage));
                if (handles.single) msgs.push(report('dom', 'double type must not render the single handle', 'from and to', Object.keys(handles), stage));
            } else {
                if (!handles.single) msgs.push(report('dom', 'single type renders one handle', 'single', Object.keys(handles), stage));
                if (handles.from || handles.to) msgs.push(report('dom', 'single type must not render the from/to handles', 'single', Object.keys(handles), stage));
            }

            // Both inert states are masked: disable and block put the same
            // .irs-disable-mask over the slider (pinned by smoke.spec.mjs, "disable
            // shows the mask and disables the input; block keeps the input enabled").
            // Only disable reaches the input, which is the whole difference the readme
            // draws between the two rows.
            const inert = !!(cfg.disable || cfg.block);
            if (!!state.mask !== inert) msgs.push(report('dom', 'the mask covers a disabled or blocked slider and nothing else', inert, !!state.mask, stage));

            const input = state.input || {};
            if (!!input.disabled !== !!cfg.disable) msgs.push(report('dom', 'the input is disabled only with disable', !!cfg.disable, !!input.disabled, stage));

            // The readme does not name the irs-hidden-input class, but the plugin's
            // contract with a form is that the original input stays in it while the
            // slider is alive; the class is how that is done (characterization).
            if (Array.isArray(input.classes) && input.classes.indexOf('irs-hidden-input') < 0) {
                msgs.push(report('dom', 'the original input keeps the irs-hidden-input class while the slider exists', 'irs-hidden-input', input.classes, stage));
            }
            return msgs;
        }
    },

    {
        id: 'callbacks',
        readme: 'settings table: onStart "Fires once when the slider is created, before its first render", onInit "...and its first render is done", onChange "Fires on each value change made by the user. Not fired by update(), reset() or a container resize", onFinish "Fires when an interaction ends: a handle is released (even without moving), the track ... is clicked, or a key is pressed", onUpdate "Fires when the slider is modified by update() or reset()"; "Callback data" for the payload',
        check(ctx) {
            const { cfg, stage, state } = ctx;
            const expectations = ctx.expectations || {};
            const entries = entriesSince(ctx);
            const count = (type) => entries.filter((entry) => entry.type === type).length;
            const inert = !!(cfg.disable || cfg.block);
            const msgs = [];

            if (stage === 'S0') {
                const types = entries.map((entry) => entry.type);
                if (types.indexOf('onStart') !== 0) {
                    msgs.push(report('callbacks', 'onStart must be the first callback of a new slider', 'onStart', types[0], stage));
                }
                if (count('onStart') !== 1) msgs.push(report('callbacks', 'onStart fires once', 1, count('onStart'), stage));
                // onInit is only recorded with the fixture's record_init flag, so its
                // absence is not judged here -- its order and count are.
                if (count('onInit') > 1) msgs.push(report('callbacks', 'onInit fires once', 1, count('onInit'), stage));
                if (count('onInit') === 1 && types.indexOf('onInit') < types.indexOf('onStart')) {
                    msgs.push(report('callbacks', 'onInit must come after onStart', 'onStart then onInit', types, stage));
                }
                for (const noisy of ['onChange', 'onFinish', 'onUpdate']) {
                    if (count(noisy)) msgs.push(report('callbacks', `${noisy} must not fire while the slider is created`, 0, count(noisy), stage));
                }
            } else if (expectations.update) {
                if (count('onUpdate') !== 1) msgs.push(report('callbacks', 'update() and reset() fire exactly one onUpdate', 1, count('onUpdate'), stage));
                if (count('onChange')) msgs.push(report('callbacks', 'onChange is not fired by update() or reset()', 0, count('onChange'), stage));
                if (count('onFinish')) msgs.push(report('callbacks', 'onFinish belongs to an interaction, not to update()', 0, count('onFinish'), stage));
            } else if (expectations.destroyed) {
                for (const noisy of ['onStart', 'onChange', 'onFinish', 'onUpdate']) {
                    if (count(noisy)) msgs.push(report('callbacks', `${noisy} must not fire from destroy()`, 0, count(noisy), stage));
                }
            } else if (isInteraction(ctx) && ctx.prev) {
                // A key stage is one press, so what it changed is read off the state
                // the matrix took right after that press; a drag or a click is judged
                // on the movement between its own two states.
                const isPress = keyDirection(ctx) !== 0;
                const changed = isPress ? !!expectations.changed : moved(ctx);
                if (inert) {
                    // A disabled or blocked slider has no interaction to report.
                    if (count('onChange')) msgs.push(report('callbacks', 'onChange must not fire on a disabled or blocked slider', 0, count('onChange'), stage));
                    if (count('onFinish')) msgs.push(report('callbacks', 'onFinish must not fire on a disabled or blocked slider', 0, count('onFinish'), stage));
                } else {
                    if (isPress) {
                        // readme onChange: "Fires on each value change made by the
                        // user"; onFinish: "...or a key is pressed". One press is one
                        // interaction and at most one value change, so a press that
                        // moved a handle owes exactly one of each, and a press that
                        // moved nothing owes the onFinish alone -- the half
                        // smoke.spec.mjs pins as "an arrow key press at the range edge
                        // fires onFinish only, no onChange (#851)".
                        if (changed && count('onChange') !== 1) {
                            msgs.push(report('callbacks', 'a key press that changed the value fires onChange once', 1, count('onChange'), stage));
                        }
                    } else if (changed && count('onChange') < 1) {
                        // A drag reports every intermediate value it passes through, so
                        // its onChange count is only bounded from below.
                        msgs.push(report('callbacks', 'a value the user changed must fire onChange', '1 or more', 0, stage));
                    }
                    if (!changed && count('onChange')) {
                        msgs.push(report('callbacks', 'onChange fires only on a value change', 0, count('onChange'), stage));
                    }
                    if (count('onFinish') !== 1) {
                        msgs.push(report('callbacks', 'an interaction ends with exactly one onFinish', 1, count('onFinish'), stage));
                    }
                    if (changed) {
                        // Only the last onChange can be compared against the state read
                        // after the stage; the intermediate payloads are checked for
                        // range below.
                        const last = entries.filter((entry) => entry.type === 'onChange').pop();
                        const values = valuesOf(state);
                        if (last && isNumber(values.from) && last.from !== values.from) {
                            msgs.push(report('callbacks', 'the last onChange payload must carry the value the slider ended on', values.from, last.from, stage));
                        }
                        if (last && isDouble(cfg) && isNumber(values.to) && last.to !== values.to) {
                            msgs.push(report('callbacks', 'the last onChange payload must carry the to value the slider ended on', values.to, last.to, stage));
                        }
                    }
                }
            }

            // Payload shape, on every callback of this stage.
            const { min, max } = rangeOf(cfg);
            for (const entry of entries) {
                const where = `${entry.type} payload`;
                if (isNumber(entry.min) && !near(entry.min, min)) msgs.push(report('callbacks', `${where}: min`, min, entry.min, stage));
                if (isNumber(entry.max) && !near(entry.max, max)) msgs.push(report('callbacks', `${where}: max`, max, entry.max, stage));
                // readme "Callback data": "from_pretty": "10 000" -- "FROM formatted (values
                // mode: the prettified entry, not the index)", with to_pretty, min_pretty
                // "MIN formatted" and max_pretty the same for the other three values. The
                // text is what the label is built from, before the prefixes and postfixes
                // decorate it, so the oracle is the plain prettify chain of each surface.
                //
                // An entry whose custom prettify cannot run outside the page has no honest
                // expected text (matrix.spec.mjs marks it on the cfg), so the four
                // comparisons stand down there, exactly as the labels and grid rules do.
                if (!cfg.__skip_label_invariants) {
                    const formatted = [['from_pretty', entry.from, 'handle'], ['min_pretty', min, 'min'], ['max_pretty', max, 'max']];
                    if (isDouble(cfg)) formatted.push(['to_pretty', entry.to, 'handle']);
                    for (const [field, value, surface] of formatted) {
                        // A value the payload does not carry (a slider that has not rendered
                        // yet reports null) is the bounds rule's business, not this one; in
                        // values mode only an index the array holds has an entry to format.
                        if (!isNumber(value)) continue;
                        if (isValuesMode(cfg) && !(Number.isInteger(value) && value >= 0 && value <= cfg.values.length - 1)) continue;
                        const wanted = expectedPretty(value, cfg, surface);
                        if (entry[field] !== wanted) {
                            msgs.push(report('callbacks', `${where}: ${field} must be the formatted ${field.slice(0, field.indexOf('_'))} value`, wanted, entry[field], stage));
                        }
                    }
                }

                for (const name of ['from_percent', 'to_percent']) {
                    const percent = entry[name];
                    if (name === 'from_percent' && !isNumber(percent)) {
                        msgs.push(report('callbacks', `${where}: ${name} must be a number`, 'a number', percent, stage));
                    } else if (isNumber(percent) && (percent < -EPS || percent > 100 + EPS)) {
                        msgs.push(report('callbacks', `${where}: ${name} outside 0..100`, '0..100', percent, stage));
                    }
                }

                if (isNumber(entry.from) && (entry.from < min - EPS || entry.from > max + EPS)) {
                    msgs.push(report('callbacks', `${where}: from outside the range`, `${min}..${max}`, entry.from, stage));
                }

                if (!isValuesMode(cfg)) {
                    // readme "Callback data": "from_value": null without a values array
                    // ("null on a slider without values"), at every stage, update() and
                    // reset() included (#883).
                    if (entry.from_value !== null) msgs.push(report('callbacks', `${where}: from_value without a values array`, null, entry.from_value, stage));
                    if (entry.to_value !== null) msgs.push(report('callbacks', `${where}: to_value without a values array`, null, entry.to_value, stage));
                } else {
                    const last = cfg.values.length - 1;
                    if (Number.isInteger(entry.from) && entry.from >= 0 && entry.from <= last) {
                        const wanted = valuesEntry(cfg, entry.from);
                        if (entry.from_value !== wanted) msgs.push(report('callbacks', `${where}: from_value must be the entry at the index`, wanted, entry.from_value, stage));
                    }
                    if (isDouble(cfg) && Number.isInteger(entry.to) && entry.to >= 0 && entry.to <= last) {
                        const wanted = valuesEntry(cfg, entry.to);
                        if (entry.to_value !== wanted) msgs.push(report('callbacks', `${where}: to_value must be the entry at the index`, wanted, entry.to_value, stage));
                    }
                }
            }
            return msgs;
        }
    },

    {
        id: 'keys',
        readme: 'settings table: keyboard "Keyboard controls. Left: left arrow, down arrow, A, S. Right: right arrow, up arrow, W, D"; step "Step size"; the limits and intervals stop the move',
        check(ctx) {
            // One press per stage (S4a to S4d), so this judges a single press: the
            // matrix waits out the idle render tick between presses. A burst judged on
            // its net effect could not tell a press that moved two steps from one that
            // moved none.
            const direction = keyDirection(ctx);
            if (!alive(ctx) || !ctx.prev || !direction) return [];

            // A press that moved nothing leaves no trace of which handle it targeted
            // (in double type that is the last touched handle, which the State does not
            // expose), and a press blocked by a bound, a fixed handle or an inert
            // slider is allowed to do nothing. The callbacks rule judges those.
            if (!ctx.expectations.changed) return [];

            const { cfg, stage, state } = ctx;
            const { step } = rangeOf(cfg);
            const now = valuesOf(state);
            const before = valuesOf(ctx.prev);
            const fromMoved = !sameValue(now.from, before.from);
            const toMoved = isDouble(cfg) && !sameValue(now.to, before.to);

            // Both handles moving is the interval key path (drag_interval), where the
            // readme promises a width-preserving move rather than one targeted handle.
            if (fromMoved && toMoved) return [];

            const target = fromMoved ? 'from' : toMoved ? 'to' : null;
            if (!target || !isNumber(before[target])) return [];

            const other = target === 'from' ? now.to : now.from;
            const stops = keyStops(target, cfg, other);
            // readme note "step": every value is min plus WHOLE steps, so one step from a
            // value that is itself on the scale is the next scale point -- on min 0.5 with
            // step 1 (0.5, 2, 3 ...) the step below 2 is min itself, not the 1 the bare
            // arithmetic gives. The bound, limit and interval stops are applied to that point.
            const onScaleTarget = nearestOnScale(before[target] + direction * step, cfg);
            const wanted = Math.min(Math.max(onScaleTarget, stops.lo), stops.hi);
            const actual = now[target];

            if (!isNumber(actual) || !near(actual, wanted)) {
                const which = direction > 0 ? 'increase' : 'decrease';
                return [report('keys', `one ${which} key press must move ${target} by one step of ${step} from ${before[target]} unless a bound, limit or interval stops it`, wanted, actual, stage)];
            }
            return [];
        }
    },

    {
        id: 'inert',
        readme: 'settings table: disable "Disable the slider and the input, so its value is not submitted with the form", block "Block the slider but keep the input enabled. Value is still submitted with the form"',
        check(ctx) {
            const { cfg, stage, state } = ctx;
            if (!cfg.disable && !cfg.block) return [];
            if (!alive(ctx)) return [];
            const msgs = [];

            if (isInteraction(ctx) && ctx.prev) {
                const now = valuesOf(state);
                const before = valuesOf(ctx.prev);
                if (now.from !== before.from) msgs.push(report('inert', 'a disabled or blocked slider changed its from value', before.from, now.from, stage));
                if (isDouble(cfg) && now.to !== before.to) msgs.push(report('inert', 'a disabled or blocked slider changed its to value', before.to, now.to, stage));
            }

            // The mask marks both inert states; the input is what tells them apart
            // (readme: disable turns the input off "so its value is not submitted with
            // the form", block keeps it enabled and submitted).
            if (!state.mask) {
                msgs.push(report('inert', 'a disabled or blocked slider is covered by the mask', true, !!state.mask, stage));
            }
            const input = state.input || {};
            if (!!input.disabled !== !!cfg.disable) {
                msgs.push(report('inert', 'block keeps the input enabled, disable turns it off', !!cfg.disable, !!input.disabled, stage));
            }
            return msgs;
        }
    },

    {
        id: 'destroy',
        readme: 'Public methods: "Remove the slider and restore the original input" and "After destroy() the input is back to normal and can be initialized again"',
        check(ctx) {
            const expectations = ctx.expectations || {};
            if (!expectations.destroyed) return [];
            const { stage, state } = ctx;
            const input = state.input || {};
            const msgs = [];

            if (state.container && state.container.exists) {
                msgs.push(report('destroy', 'destroy() must remove the slider container', false, true, stage));
            }
            if (input.disabled) {
                msgs.push(report('destroy', 'destroy() must leave the input enabled', false, true, stage));
            }
            // readme "Public methods": the instance is fetched with
            // $("#range").data("ionRangeSlider"), so that handle is part of what "restore the
            // original input" gives back. An input that still carries it looks initialised,
            // and the readme's "can be initialized again" call would be a silent no-op.
            if (input.dataHandle) {
                msgs.push(report('destroy', "destroy() must drop the input's ionRangeSlider instance handle", false, true, stage));
            }
            if (!Array.isArray(input.classes)) {
                msgs.push(report('destroy', 'the state reader must expose input.classes so the restored input can be checked', 'an array of class names', input.classes, stage));
            } else if (input.classes.indexOf('irs-hidden-input') >= 0) {
                msgs.push(report('destroy', 'destroy() must take the irs-hidden-input class off the input', 'no irs-hidden-input', input.classes, stage));
            }
            return msgs;
        }
    },

    {
        id: 'reinit',
        readme: 'Public methods: "After destroy() the input is back to normal and can be initialized again"',
        // The one stage that runs after destroy(): matrix.spec.mjs calls ionRangeSlider()
        // on the same input again and reads the page as S9. A destroy() that leaves
        // anything behind -- the instance handle on the input's data, a class, an
        // attribute -- makes that second call do nothing, which is what this reports.
        check(ctx) {
            const expectations = ctx.expectations || {};
            if (!expectations.reinitialised) return [];
            const { stage, state } = ctx;
            const input = state.input || {};
            const msgs = [];

            if (!(state.container && state.container.exists)) {
                msgs.push(report('reinit', 'a destroyed input must build a slider again', true, false, stage));
            }
            if (!input.dataHandle) {
                msgs.push(report('reinit', 'the rebuilt slider must be reachable through the input again', true, !!input.dataHandle, stage));
            }
            return msgs;
        }
    }
];

/**
 * Run every invariant against one stage.
 *
 * @param {object} ctx   { state, cfg, stage, prev, expectations }
 * @returns {Array<{id: string, message: string}>}
 */
export function checkInvariants(ctx) {
    if (!ctx || !ctx.state) return [];
    const failures = [];
    for (const invariant of INVARIANTS) {
        for (const message of invariant.check(ctx) || []) {
            failures.push({ id: invariant.id, message });
        }
    }
    return failures;
}
