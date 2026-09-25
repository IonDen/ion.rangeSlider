/**
 * #877 browser suite -- the known-bug register.
 *
 * A filed bug turns a red matrix cell into an annotation instead of a failure, and
 * the day the bug is fixed the entry itself fails ("no longer reproduces here"), so
 * a fix has to retire its register line. Nothing here skips or loosens a test.
 *
 * An entry is:
 *   {
 *     issue: 892,                                   // the filed GitHub issue number
 *     title: 'grid labels name values off the step scale',   // one line, in the glossary's words
 *     what: /grid label at unit/,                   // the failure MESSAGE this bug produces
 *     matches(ctx, id) { return id === 'grid' && gridBoundariesOffScale(ctx.cfg); }
 *   }
 *
 * `what` is the second half of the entry and is not optional: `matches` says which
 * configurations and stages carry the bug, `what` says which of that rule's messages the bug
 * accounts for. A rule reports many different things -- the callbacks rule alone speaks for
 * onStart, onChange, onFinish, the payload's values and its formatted text -- and an entry
 * without `what` would annotate all of them away on any cell it matched. A failure of a
 * matched invariant whose message the pattern does not cover stays REAL.
 *
 * `matches` receives the same ctx the invariants get ({ state, cfg, stage, prev,
 * expectations, env }) plus the failing invariant id. What a predicate may read:
 *
 *   - `cfg`, the option set the plugin was built with, including the field
 *     matrix.spec.mjs adds for the register: `__hidden_at_init` (the fixture built the
 *     slider inside a display:none container). It is configuration -- the readme
 *     documents the hidden container as a way to build a slider -- and cannot be read
 *     off the option set alone.
 *   - `stage`, and `expectations`, the stage's own promise.
 *   - `prev`, the state the stage STARTED from.
 *   - `env`, the environment the run is in (./env.mjs): today, whether the jQuery build
 *     under test measures a hidden track as zero. It is neither configuration nor the
 *     outcome being judged; it decides what a slider built hidden reports at init (see
 *     builtBlind below).
 *
 * What a predicate may NOT read: `ctx.state`, the outcome being judged, and the entry
 * id. The outcome is off limits because a predicate that watched the value it excuses
 * would quietly stop matching the day the bug is fixed, and the "no longer reproduces"
 * check would never fire; the entry id is off limits because the generator renumbers its
 * entries whenever a dimension changes, and an entry keyed on an id would silently stop
 * matching. Predicate on the CONFIG FIELDS, the stage, the stage's own `expectations`, the
 * `env` the run is in, and where needed the pair the stage started from.
 *
 * Each entry says, in its comment, which matrix entries it was written against and which
 * stages reproduce -- a predicate wider than that annotates healthy cells away, and one
 * narrower leaves the matrix red on a bug that is already filed.
 *
 * judgeStage() at the foot of this file is what matrix.spec.mjs calls with a stage's
 * failures: it annotates what the register covers, keeps everything else real, and reports
 * an entry that matches a cell where NO failure of its own answers `what` -- the bug is
 * fixed there, and the entry has to be retired.
 */

import { isValuesMode, nearestOnScale, onScale, rangeOf, scaleDecimals, scalePoint } from './scale.mjs';
import { builtinPrettify, valuesEntry } from './format.mjs';
import { gridUnits, keyStops, INVARIANTS } from './invariants.mjs';
// Where the fixed interaction script aims: the same numbers matrix.spec.mjs drives the
// slider with. A predicate that has to say "this stage pushes the handle into its own
// limit" can only say it from those, and reading them from the script is what keeps the
// two from drifting apart.
import { BAR_DRAG_FRACTION, S1_TARGET, S2_TARGET, S3_CLICK, midValue } from '../matrix/script.mjs';

/** Values sit on a step grid, so only float representation noise is tolerated. */
const EPS = 1e-9;

/** readme settings table: the four per-handle limits, with the side each one guards. */
const LIMITS = [
    { handle: 'from', key: 'from_min', side: -1 },
    { handle: 'from', key: 'from_max', side: 1 },
    { handle: 'to', key: 'to_min', side: -1 },
    { handle: 'to', key: 'to_max', side: 1 }
];

/**
 * The handle a drag stage drives and the value it aims it at, or null for a stage that
 * drives nothing of its own.
 *
 * Aimed at, not always moved: on a coincident or overlapping pair the press lands on the
 * handle lying on top, so the handle named here is the one the script reached for. The
 * predicates that read this ask whether a stage drove a handle INTO its own limit, which
 * is a question about where the script aimed.
 *
 * @param {object} ctx
 * @returns {{handle: 'from'|'to', value: number}|null}
 */
function aimedByStage(ctx) {
    const stage = stageOf(ctx);
    if (stage !== 'S1' && stage !== 'S2') return null;
    const fraction = stage === 'S1' ? S1_TARGET : S2_TARGET;
    const { min, max } = rangeOf(ctx.cfg);
    return { handle: stage === 'S1' ? 'from' : 'to', value: min + fraction * (max - min) };
}

/**
 * Where the two handles stand while THIS stage's clamps run: the pair it started from, with
 * the move the fixed script makes applied.
 *
 * S1 and S2 aim one handle at their own fraction of the track and S5 carries the pair a tenth
 * of the range to the right; a mask (disable/block) swallows all three, and a fixed handle
 * ignores its own. Every other stage leaves the pair where the previous one left it. The point
 * of the whole helper is that a handle can be driven INTO a limit by the stage itself (m063 at
 * S1) and carried back OUT of it by the next one (m063 at S5), and a predicate that reads only
 * where the handle started gets both ends wrong.
 *
 * @param {object} ctx
 * @returns {{from: number|null, to: number|null}}
 */
function valuesUnderStage(ctx) {
    const cfg = ctx.cfg;
    const before = stageOf(ctx) === 'S0' ? {} : valuesOf(ctx.prev);
    const values = {
        from: isNum(before.from) ? before.from : cfg.from,
        to: isNum(before.to) ? before.to : cfg.to
    };
    if (isInert(cfg)) return values;
    const { min, max } = rangeOf(cfg);
    const aimed = aimedByStage(ctx);
    if (aimed) {
        if (!cfg[aimed.handle + '_fixed']) values[aimed.handle] = aimed.value;
        return values;
    }
    if (stageOf(ctx) === 'S5' && cfg.drag_interval && !cfg.from_fixed && !cfg.to_fixed) {
        const travel = BAR_DRAG_FRACTION * (max - min);
        if (isNum(values.from)) values.from += travel;
        if (isNum(values.to)) values.to += travel;
    }
    return values;
}

/** The value S3's track click lands on. */
function clickedValue(cfg) {
    const { min, max } = rangeOf(cfg);
    return min + S3_CLICK * (max - min);
}

const isNum = (value) => typeof value === 'number' && Number.isFinite(value);
const isDouble = (cfg) => cfg.type === 'double';
const isInert = (cfg) => !!(cfg.disable || cfg.block);
const stageOf = (ctx) => String(ctx.stage);
const isKeyStage = (ctx) => /^S4/.test(stageOf(ctx));
const isInteractionStage = (ctx) => /^S[1-5]/.test(stageOf(ctx));
const valuesOf = (state) => (state && state.values) || { from: null, to: null };
const promised = (ctx) => ctx.expectations || {};

/**
 * Was the slider built hidden on a jQuery build that measures a hidden track as zero?
 *
 * Inside a display:none container the slider's `width: 100%` stays unresolved, and the
 * browser reports its computed width as "100%". jQuery before 3.3 parses that as 100 px, so a
 * slider built hidden there renders at init as a visible one does. jQuery 3.3 and later refuse
 * a width that is not in pixels and report 0, because an element inside a display:none
 * container has no rendered box (3.3 reads offsetWidth; 3.4 and later skip it for a hidden
 * element and return 0 directly), and the slider has no track to place its handles on until
 * the container is shown. What the register says of a slider built hidden (#888, #897)
 * happens on the second kind of build only, and matrix.spec.mjs reads which kind the run is
 * on into ctx.env (./env.mjs).
 *
 * @param {object} ctx
 * @returns {boolean}
 * @throws {Error} when the slider was built hidden and ctx.env carries no boolean
 *   hiddenTrackMeasuresZero: a default would claim, or leave real, every hidden cell on one
 *   side of the jQuery 3.3 split without a word.
 */
function builtBlind(ctx) {
    if (!ctx.cfg.__hidden_at_init) return false;
    const env = ctx.env;
    if (!env || typeof env.hiddenTrackMeasuresZero !== 'boolean') {
        throw new Error('known-bugs: a slider built hidden was judged without a boolean ctx.env.hiddenTrackMeasuresZero (read it with readEnv() from lib/env.mjs)');
    }
    return env.hiddenTrackMeasuresZero;
}

/**
 * At init a values-mode slider built hidden on a jQuery build that measures a hidden track
 * as zero (3.3 and later) reports nothing at all -- its input is empty and its from/to are
 * null (#888) -- so every rule that judges a VALUE passes there and must not be excused by
 * another entry. On an older build the same slider reports at init the pair a visible one
 * does, and the entries written for that pair (#882, #885) apply to it unchanged.
 *
 * @param {object} ctx
 * @returns {boolean}
 */
function valuesUnreadableAtInit(ctx) {
    return stageOf(ctx) === 'S0' && builtBlind(ctx) && isValuesMode(ctx.cfg);
}

/**
 * The per-handle limits a clamp would carry the handle PAST: off the documented scale, and
 * rounded onto the wrong side of themselves.
 *
 * readme note "step_from_min": "A value that does not sit on the scale is moved to the
 * nearest point that does." That sentence is written for the step_from_min scale. For the
 * plain step scale the readme states no such rule; there, with a min at or above zero, the
 * plugin rounds the limit to the decimals of step (convertToValue()), which on the
 * whole-number step of the example below lands on the nearest scale point (2 or 3), but on
 * a scale such as min 0 / step 1000 leaves a from_min of 2400 where it is. This helper
 * models the landing with nearestOnScale(), which agrees with the plugin only when step is
 * 1; no matrix stage pushes a handle into such a limit today. Where the limit does move,
 * which way it goes
 * decides whether it holds. On min 0.5 with step 1 the plain scale is 0.5, 2, 3 ... (readme
 * note "step"), so a from_min of 2.4 lands on 2, below the limit and against the readme; a
 * from_min of 2.9 lands on 3, above it and perfectly legal (m061). A maximum limit is the
 * mirror: the crossing is the one that rounds up.
 *
 * @param {object} cfg
 * @returns {Array<{handle: string, key: string, side: number}>}
 */
function offScaleLimits(cfg) {
    return LIMITS.filter((limit) => {
        const value = cfg[limit.key];
        if (!isNum(value) || onScale(value, cfg)) return false;
        const landed = nearestOnScale(value, cfg);
        return limit.side < 0 ? landed < value - EPS : landed > value + EPS;
    });
}

/**
 * Is a handle at or past one of the off-scale limits in the given pair of values? That
 * is when the clamp runs and the handle is rounded onto the wrong side of the limit.
 *
 * @param {{from: number|null, to: number|null}} values
 * @param {object} cfg
 * @returns {boolean}
 */
function pushedIntoAnOffScaleLimit(values, cfg) {
    return offScaleLimits(cfg).some((limit) => {
        const value = values[limit.handle];
        if (!isNum(value)) return false;
        return limit.side < 0 ? value <= cfg[limit.key] + EPS : value >= cfg[limit.key] - EPS;
    });
}

/**
 * The pair the slider is built with, as validate() leaves it.
 *
 * validate() clamps the configured from/to to the range and to the per-handle limits,
 * and a limit off the documented scale then takes the handle to the nearest scale point
 * (that rounding is issue #882). It never applies the interval limits -- that is exactly
 * what issue #885 is about, so this helper stops where validate() stops.
 *
 * @param {object} cfg
 * @returns {{from: number|null, to: number|null}}
 */
function startingPair(cfg) {
    const { min, max } = rangeOf(cfg);
    const clamp = (value, handle) => {
        if (!isNum(value)) return null;
        const lo = Math.max(min, isNum(cfg[handle + '_min']) ? cfg[handle + '_min'] : min);
        const hi = Math.min(max, isNum(cfg[handle + '_max']) ? cfg[handle + '_max'] : max);
        const held = Math.min(Math.max(value, lo), Math.min(Math.max(hi, lo), max));
        return onScale(held, cfg) ? held : nearestOnScale(held, cfg);
    };
    return { from: clamp(cfg.from, 'from'), to: clamp(cfg.to, 'to') };
}

/** Does the config carry an interval limit at all? */
function hasInterval(cfg) {
    return (isNum(cfg.min_interval) && cfg.min_interval > 0) || (isNum(cfg.max_interval) && cfg.max_interval > 0);
}

/** Does this gap between the handles break one of the configured interval limits? */
function breaksInterval(gap, cfg) {
    if (!isNum(gap)) return false;
    if (isNum(cfg.min_interval) && cfg.min_interval > 0 && gap < cfg.min_interval - EPS) return true;
    return isNum(cfg.max_interval) && cfg.max_interval > 0 && gap > cfg.max_interval + EPS;
}

/** The distance between two handle values, or null when either is unknown. */
function gapBetween(from, to) {
    return isNum(from) && isNum(to) ? to - from : null;
}

/**
 * Where S3's track click aims the pair of a drag_interval slider: centred on the value the
 * click landed on.
 *
 * calc()'s "both_one" case reads the width the pair had, puts its middle on the click and
 * holds the pair inside the range by moving BOTH handles, so the width survives the range
 * edges. Only the per-handle limits are left, which is what clampSplitsThePair() asks
 * about.
 *
 * @param {{from: number, to: number}} before   the pair the stage started from
 * @param {object} cfg
 * @returns {{from: number, to: number}}
 */
function clickCentredPair(before, cfg) {
    const { min, max } = rangeOf(cfg);
    const width = before.to - before.from;
    let from = clickedValue(cfg) - width / 2;
    if (from < min) from = min;
    if (from + width > max) from = max - width;
    return { from: from, to: from + width };
}

/**
 * Would the interval path's per-handle clamp change the width of the pair a whole-interval
 * move aims at?
 *
 * Each handle is clamped into its OWN from_min/from_max (to_min/to_max) window, one after
 * the other, so the width only survives a limit that holds both handles back by the same
 * amount. Usually it holds one of them and lets the other follow the pointer, which is the
 * stretch the intervals rule reports.
 *
 * @param {{from: number, to: number}} target   where the move aims the two handles
 * @param {object} cfg
 * @returns {boolean}
 */
function clampSplitsThePair(target, cfg) {
    const heldBack = (handle) => {
        const lo = isNum(cfg[handle + '_min']) ? cfg[handle + '_min'] : -Infinity;
        const hi = isNum(cfg[handle + '_max']) ? cfg[handle + '_max'] : Infinity;
        return Math.min(Math.max(target[handle], lo), hi) - target[handle];
    };
    return Math.abs(heldBack('from') - heldBack('to')) > EPS;
}

/**
 * The window a handle's own limits leave it, inside the slider's range.
 *
 * readme settings table: from_min "Minimum limit for the from handle", from_max, to_min,
 * to_max.
 *
 * @param {'from'|'to'} handle
 * @param {object} cfg
 * @returns {{lo: number, hi: number}}
 */
function limitWindow(handle, cfg) {
    const { min, max } = rangeOf(cfg);
    return {
        lo: isNum(cfg[handle + '_min']) ? Math.max(min, cfg[handle + '_min']) : min,
        hi: isNum(cfg[handle + '_max']) ? Math.min(max, cfg[handle + '_max']) : max
    };
}

/**
 * Where the OTHER handle stands while this one moves, or null when it is free to come
 * and meet it.
 *
 * Two configurations pin a handle down: to_fixed / from_fixed hold it on the value
 * validate() built it with, and a to_min plus a to_max (or a from_min plus a from_max)
 * pen it into a window. A handle with one limit or none can travel most of the range, so
 * whatever the interval asks for, the pair can go and find it together.
 *
 * @param {'from'|'to'} handle   the handle that moves
 * @param {object} cfg
 * @returns {{lo: number, hi: number}|null}
 */
function pinnedOther(handle, cfg) {
    const other = handle === 'from' ? 'to' : 'from';
    if (cfg[other + '_fixed']) {
        const value = startingPair(cfg)[other];
        return isNum(value) ? { lo: value, hi: value } : null;
    }
    if (isNum(cfg[other + '_min']) && isNum(cfg[other + '_max'])) return limitWindow(other, cfg);
    return null;
}

/**
 * Where the moving handle has to stand for the interval limits to hold, given where the
 * other one is pinned.
 *
 * readme settings table: min_interval "Smallest interval between the handles",
 * max_interval "Largest interval between the handles", from "the left one" with to "the
 * right one". An open end is infinite: 0 means no limit.
 *
 * @param {'from'|'to'} handle
 * @param {{lo: number, hi: number}} pin   where the other handle stands
 * @param {object} cfg
 * @returns {{lo: number, hi: number}}
 */
function intervalWindow(handle, pin, cfg) {
    const minInterval = isNum(cfg.min_interval) && cfg.min_interval > 0 ? cfg.min_interval : 0;
    const maxInterval = isNum(cfg.max_interval) && cfg.max_interval > 0 ? cfg.max_interval : 0;
    if (handle === 'from') {
        return { lo: maxInterval ? pin.lo - maxInterval : -Infinity, hi: pin.hi - minInterval };
    }
    return { lo: pin.lo + minInterval, hi: maxInterval ? pin.hi + maxInterval : Infinity };
}

/**
 * The handle whose own limit and the configured interval cannot both hold, with what the
 * plugin's clamp does about it -- or null when the two promises can live together.
 *
 * The interval wins: the handle is carried to the near edge of the window the interval
 * asks for, whether or not its own limit allows it, and stops at the range edge when even
 * that is not far enough (`unreachable`, where the interval stays broken for good).
 *
 * @param {object} cfg
 * @returns {{handle: 'from'|'to', tooClose: boolean, limitBroken: boolean, unreachable: boolean}|null}
 */
function unsatisfiableInterval(cfg) {
    if (!isDouble(cfg) || !hasInterval(cfg)) return null;
    const { min, max } = rangeOf(cfg);
    for (const handle of ['from', 'to']) {
        if (cfg[handle + '_fixed']) continue;          // a fixed handle is not the one moving
        const pin = pinnedOther(handle, cfg);
        if (!pin) continue;
        const own = limitWindow(handle, cfg);
        const need = intervalWindow(handle, pin, cfg);
        const tooClose = own.lo > need.hi + EPS;       // it cannot get far enough away
        const tooFar = own.hi < need.lo - EPS;         // it cannot get close enough
        if (!tooClose && !tooFar) continue;
        const wanted = tooClose ? need.hi : need.lo;   // the near edge of what the interval asks
        const landing = Math.min(Math.max(wanted, min), max);
        return {
            handle: handle,
            tooClose: tooClose,
            limitBroken: landing < own.lo - EPS || landing > own.hi + EPS,
            unreachable: wanted < min - EPS || wanted > max + EPS
        };
    }
    return null;
}

/**
 * Does max sit off the slider's own step scale?
 *
 * readme note "step": the reachable values are min plus whole steps ROUNDED to the
 * decimals of step, so min 0.5 with step 1 reports 0.5, 2, 3 ... 10 while max is 10.5 --
 * half a step above the highest value a handle can rest on.
 *
 * @param {object} cfg
 * @returns {boolean}
 */
function maxOffScale(cfg) {
    if (isValuesMode(cfg)) return false;
    const { min, max, step } = rangeOf(cfg);
    if (!(step > 0)) return false;
    return scalePoint(Math.round((max - min) / step), cfg) !== max;
}

/**
 * Do the values this slider REPORTS sit off the percent grid it moves on?
 *
 * The scale's first point after min is min + step rounded to the decimals of step. When
 * that rounding shifts the point by half a step or more, every reported value is at
 * least half a step away from the grid position it came from (min 0.5 with step 1
 * reports 2 for the grid point 1.5), and a key press spends part of its travel on the
 * re-snap. A gentler rounding (min 1.2 with step 4 reports 5 for 5.2) never crosses a
 * grid point, and step_from_min removes the rounding altogether.
 *
 * @param {object} cfg
 * @returns {boolean}
 */
function reportedValuesOffGrid(cfg) {
    if (isValuesMode(cfg) || cfg.step_from_min) return false;
    const { min, step } = rangeOf(cfg);
    if (!(step > 0)) return false;
    return Math.abs(scalePoint(1, cfg) - (min + step)) >= step / 2 - EPS;
}

/**
 * Does a grid unit boundary fall between two scale points?
 *
 * readme settings table, grid_num: "A labelled tick mark sits at each unit boundary",
 * and note "step": every value is min plus whole steps. The plugin rounds a boundary to
 * the DECIMALS of step instead of snapping it onto the step scale, so the two agree on a
 * range that divides into whole steps and part ways on one that does not (0 to 10 with
 * step 2 and four units: the boundary at 2.5 is labelled 3, a value the handle cannot
 * take). Only the inner boundaries are checked: the first is min and the last is max.
 *
 * @param {object} cfg
 * @returns {boolean}
 */
function gridBoundariesOffScale(cfg) {
    if (!cfg.grid || isValuesMode(cfg)) return false;
    // step_from_min removes the rounding from the scale altogether (every value is min
    // plus whole steps), and the plugin's boundaries land on it: the seven step_from_min
    // entries of the matrix all label their grid the way the readme says.
    if (cfg.step_from_min) return false;
    const { min, max } = rangeOf(cfg);
    const units = gridUnits(cfg);
    const decimals = scaleDecimals(cfg);
    for (let i = 1; i < units; i++) {
        const raw = min + (i * (max - min)) / units;
        if (+raw.toFixed(decimals) !== nearestOnScale(raw, cfg)) return true;
    }
    return false;
}

/** Is the built-in number formatting the one drawing this config's labels? */
function builtinFormattingActive(cfg) {
    if (cfg.prettify_enabled === false) return false;
    if (typeof cfg.__prettify === 'function' || typeof cfg.__prettify_grid === 'function' || typeof cfg.__prettify_min_max === 'function') return false;
    return (typeof cfg.prettify_separator === 'string' ? cfg.prettify_separator : ' ') !== '';
}

/**
 * Would the built-in formatting put its separator inside this value's fraction?
 *
 * The plugin runs the grouping over the whole formatted number instead of its integer
 * part, so a value carrying four or more decimals is rendered with a separator in the
 * middle of its fraction ("0.0 003").
 *
 * @param {number} value
 * @param {object} cfg
 * @returns {boolean}
 */
function separatorSplitsFraction(value, cfg) {
    if (!isNum(value)) return false;
    const separator = typeof cfg.prettify_separator === 'string' ? cfg.prettify_separator : ' ';
    const wholeString = String(value).replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1' + separator);
    return wholeString !== builtinPrettify(value, separator);
}

/** Does this stage record a callback payload at all? */
function payloadStage(ctx) {
    const stage = stageOf(ctx);
    if (stage === 'S8') return false;                               // destroy() records nothing
    // S9 builds the slider a second time straight from the entry's config literal, which
    // carries no recorder, so nothing of that slider's own callbacks is recorded either.
    if (stage === 'S9') return false;
    if (stage === 'S0' || stage === 'S6' || stage === 'S7') return true;  // onStart/onInit, onUpdate
    // A disabled or blocked slider is silent to every interaction: the mask swallows the
    // mouse, and neither answers the keyboard (a disabled slider binds no key handler, and
    // block drops every press since #890).
    if (isInert(ctx.cfg)) return false;
    // A key press on a slider whose keyboard the interval-drag bug killed (#891) is dropped
    // whole, callbacks included, so there is no payload for any field of it to be wrong in.
    if (isKeyStage(ctx) && intervalKeyboardIsDead(ctx.cfg)) return false;
    return true;                                                    // a live slider reports every interaction
}

/** Are the payload's *_pretty fields numbers rather than formatted text? */
function prettyFieldsAreNumbers(cfg) {
    if (cfg.prettify_enabled !== false) return false;
    if (!isValuesMode(cfg)) return true;
    // In values mode the fields carry the entries, which are only numbers when the
    // entries themselves are (a string array formats to text with prettify off).
    const last = cfg.values.length - 1;
    return typeof valuesEntry(cfg, 0) === 'number' || typeof valuesEntry(cfg, last) === 'number';
}

/**
 * Is the keyboard dead after the track click (#891)?
 *
 * It takes a click that reaches the plugin: the click is what leaves the interval path
 * in charge. On an inert slider the mask swallows the click, and the keyboard is silent
 * there anyway (a disabled slider binds no key handler, and block drops every press since
 * #890), so this only describes the configuration the bug needs; the callers rule an
 * inert slider out on their own (isInert), before they ask.
 *
 * @param {object} cfg
 * @returns {boolean}
 */
function intervalKeyboardIsDead(cfg) {
    return isDouble(cfg) && !!cfg.drag_interval && !!(cfg.from_fixed || cfg.to_fixed);
}

/** @type {Array<{issue: number, title: string, matches: (ctx: object, id: string) => boolean}>} */
export const KNOWN_BUGS = [
    {
        issue: 882,
        title: 'a handle limit off the step scale is crossed by up to half a step',
        what: /passed (below|above) (from|to)_(min|max)/,
        // Matrix entries: every one carrying a limit that is not a scale point -- the
        // `limits=off-scale` level puts from_min at min + 2.4 steps -- and a handle the
        // stage pushes into it (m001, m011, m016, m024, m043, m052 among them). An entry
        // whose handle stays well above such a limit never runs the clamp, which is why
        // the pair of values the stage starts from is part of the predicate.
        matches(ctx, id) {
            if (id !== 'limits' || stageOf(ctx) === 'S8') return false;
            if (valuesUnreadableAtInit(ctx)) return false;
            const cfg = ctx.cfg;
            // The pair the stage starts from: the previous state, or the configuration
            // where that state has no value to give (a values-mode slider built hidden on
            // a jQuery build that measures a hidden track as zero, 3.3 and later, reports
            // none until it is revealed, so the first stage after the reveal starts from
            // the configured pair).
            // Where the handles stand while this stage's clamp runs: the handle need not
            // START inside the limit (m063's S1 drag aims below an off-scale from_min), and
            // one that started inside can be carried back out (m063's S5 bar drag).
            return pushedIntoAnOffScaleLimit(valuesUnderStage(ctx), cfg);
        }
    },

    {
        issue: 883,
        title: 'from_value and to_value turn undefined after the first update() or reset()',
        what: /from_value|to_value/,
        // Every slider without a values array, at S6 and S7: the onUpdate payload carries
        // undefined where the readme documents null, and the field stays that way.
        matches(ctx, id) {
            if (id !== 'callbacks') return false;
            const stage = stageOf(ctx);
            return (stage === 'S6' || stage === 'S7') && !isValuesMode(ctx.cfg);
        }
    },

    // The two interval entries overlap once a gap is open: this one names the cause
    // (the top edge the scale cannot reach), so it is asked first.
    {
        issue: 881,
        title: 'min_interval is violated at the top edge when max sits off the step scale',
        what: /closed past min_interval/,
        // n043 (edge:min-interval-top). The top reachable value is half a step below max,
        // so a `to` resting on max is closer to a `from` driven to the top than
        // min_interval allows, and the clamp lets it stand. It takes that resting `to`:
        // the four other matrix entries on the same scale keep their `to` well inside the
        // range and honour the interval throughout. Once the gap has been opened it
        // stands for the rest of the run, which is the second half of the predicate.
        matches(ctx, id) {
            if (id !== 'intervals' || !isInteractionStage(ctx)) return false;
            const cfg = ctx.cfg;
            if (!isDouble(cfg) || !isNum(cfg.min_interval) || !(cfg.min_interval > 0) || !maxOffScale(cfg)) return false;
            const before = valuesOf(ctx.prev);
            const restingOnMax = isNum(before.to) && Math.abs(before.to - rangeOf(cfg).max) <= EPS;
            // S1 is the stage that drives the from handle, and on this entry it drives it
            // to the very top of the track (its own s1 target), into the `to` resting on
            // the max the scale cannot reach.
            if (restingOnMax && promised(ctx).handle === 'from') return true;
            // From there the gap stands while nothing moves a handle; a stage that does
            // move one re-applies the clamp and the rule passes again.
            return breaksInterval(gapBetween(before.from, before.to), cfg) && !promised(ctx).changed;
        }
    },

    {
        issue: 885,
        title: 'min_interval and max_interval are not applied at init or by update()',
        what: /closed past min_interval|opened past max_interval/,
        // validate() clamps from/to against the per-handle limits but never against the
        // interval limits, so the starting pair (S0) and the pair update() leaves behind
        // (S6, and S7, where reset() rebuilds from the very same options) can break them.
        // The violation then SURVIVES every stage that does not move a handle -- a
        // disabled, blocked or fixed slider carries it to the end of the run -- which is
        // why the pair the stage started from is read here. A stage that does move a
        // handle re-applies the interval, so the rule passes there and the entry must not
        // match.
        //
        // A values-mode slider built hidden on a jQuery build that measures a hidden track
        // as zero (3.3 and later) reports no pair at S0, so there is no interval to judge
        // there (valuesUnreadableAtInit). On an older build it reports the pair it was
        // built with, and m025 breaks its locked interval at S0 exactly as it would built
        // visible.
        matches(ctx, id) {
            if (id !== 'intervals') return false;
            const cfg = ctx.cfg;
            if (!isDouble(cfg) || !hasInterval(cfg) || valuesUnreadableAtInit(ctx)) return false;
            const stage = stageOf(ctx);
            if (stage === 'S8') return false;
            if (stage === 'S0') {
                const start = startingPair(cfg);
                return breaksInterval(gapBetween(start.from, start.to), cfg);
            }
            if (stage === 'S6') return breaksInterval(gapBetween(midValue(cfg), valuesOf(ctx.prev).to), cfg);
            const before = valuesOf(ctx.prev);
            if (!breaksInterval(gapBetween(before.from, before.to), cfg)) return false;
            return stage === 'S7' || !promised(ctx).changed;
        }
    },

    {
        issue: 889,
        title: 'the *_pretty callback fields come back as numbers with prettify_enabled off',
        // The number is what this entry speaks for: `got 0`, `got -50`, never `got undefined`.
        // On a jQuery build that measures a hidden track as zero (3.3 and later) a slider
        // built hidden drops its two handle fields at init instead of turning them into
        // numbers (#897), and there the five entries that are built hidden AND with prettify
        // off (m018, m019, m065, m067, m068) report both at S0 -- a pattern wide enough to
        // cover "got undefined" would swallow the missing text along with the numbers and
        // leave #897 looking as if it had never reproduced. On an older build those five
        // render at init, their handle fields come back as numbers too, and all four are
        // this entry's.
        what: /_pretty must be the formatted [a-z]+ value \(expected .*, got -?\d/,
        // Every stage that records a payload on a slider with prettify_enabled: false and
        // numeric values behind it. _prettify() returns its argument unchanged there, so
        // the "formatted" half of every pair is the raw number the readme shows as text.
        matches(ctx, id) {
            if (id !== 'callbacks') return false;
            return prettyFieldsAreNumbers(ctx.cfg) && payloadStage(ctx);
        }
    },

    {
        issue: 897,
        title: 'a slider built inside a hidden container reports no from_pretty or to_pretty in onStart and onInit',
        what: /(from|to)_pretty must be the formatted [a-z]+ value \(expected .*, got undefined\)/,
        // All twenty-two container=hidden entries, at S0 alone, on a jQuery build that
        // measures a hidden track as zero (3.3 and later): the onStart and onInit payloads
        // carry the from and to values but no text for them, while min_pretty and max_pretty
        // are filled in correctly -- so only the two handle fields are claimed here, and a
        // missing min_pretty or max_pretty stays a finding of its own. One idle tick after
        // the container is revealed every later payload carries the text, which is why no
        // stage after S0 is matched. On an older build the slider renders at init and its
        // payloads carry the text from the start, so nothing is claimed there (builtBlind).
        matches(ctx, id) {
            return id === 'callbacks' && stageOf(ctx) === 'S0' && builtBlind(ctx);
        }
    },

    {
        issue: 888,
        title: 'a values-mode slider built in a hidden container leaves its input empty',
        what: /must be a number|must be one of the values entries|must carry one value per handle|_value must be the entry|handle moved|changed its (from|to) value|must fire onChange/,
        // On a jQuery build that measures a hidden track as zero (3.3 and later): at S0 the
        // input is empty, from is null and the onStart/onInit payloads carry from_value
        // null. One idle tick after the container is revealed the slider fills everything
        // in -- and that filling-in reads as a value change that never happened, so the
        // first stage after the reveal reports a moved fixed handle, a changed value on an
        // inert slider and a missing onChange. All of it is the empty input working its way
        // out, which is why S1 is part of the entry. On an older build the slider fills its
        // input at init and none of this happens (builtBlind).
        matches(ctx, id) {
            const cfg = ctx.cfg;
            const stage = stageOf(ctx);
            if (!builtBlind(ctx) || !isValuesMode(cfg)) return false;
            if (stage === 'S0') return id === 'input' || id === 'bounds' || id === 'callbacks';
            if (stage !== 'S1') return false;
            // Which rule sees the phantom change depends on the slider: a fixed handle
            // reports a move, an inert one reports a changed value, and a live one owes
            // the onChange the plugin never fired for it.
            if (id === 'fixed') return !!(cfg.from_fixed || cfg.to_fixed);
            if (id === 'inert') return isInert(cfg);
            return id === 'callbacks' && !isInert(cfg);
        }
    },

    {
        issue: 891,
        title: 'after a track click drag_interval with a fixed handle makes every key press a no-op',
        // The one callbacks line this speaks for: the press owes the onFinish the readme
        // promises every key press. The rule's other onFinish sentences (the one an inert
        // slider must not fire, the one update() must not) belong to other entries.
        what: /exactly one onFinish/,
        // The click leaves the interval path in charge of the keyboard, and its
        // fixed-handle guard drops the whole press, callbacks included -- so the press
        // owes an onFinish it never fires. An inert slider is silent anyway, which is why
        // disable/block are left out (the callbacks rule passes there).
        matches(ctx, id) {
            const cfg = ctx.cfg;
            if (id !== 'callbacks' || !isKeyStage(ctx) || !intervalKeyboardIsDead(cfg) || isInert(cfg)) return false;
            // What the keyboard inherits is the BAR: the click has to land between the two
            // handles for the interval path to take the press over. A pair too narrow to
            // reach the click (m085, held two units wide by a locked interval while the click
            // sits at 55 % of the range) leaves the press on the ordinary key path, where it
            // reports the onFinish it owes. The pair is read from the state the press started
            // from -- a press this bug drops moves nothing, so that pair is still the one the
            // click saw.
            const before = valuesOf(ctx.prev);
            const clicked = clickedValue(cfg);
            return isNum(before.from) && isNum(before.to)
                && clicked >= before.from - EPS && clicked <= before.to + EPS;
        }
    },

    {
        issue: 892,
        title: 'grid labels name values off the step scale on a range that does not divide',
        what: /grid label at unit/,
        // n008 (the site's 1000 to 1000000 step 1000 demo) and n034 (0 to 10 step 2): the
        // grid is built once at init and redrawn unchanged, so every stage but the
        // destroyed one shows the same wrong labels.
        matches(ctx, id) {
            return id === 'grid' && stageOf(ctx) !== 'S8' && gridBoundariesOffScale(ctx.cfg);
        }
    },

    {
        issue: 886,
        title: 'destroy() leaves the input disabled when the slider was built with disable',
        what: /must leave the input enabled/,
        // S8 only, and only for disable: nothing undoes the input's disabled property, so
        // the field stays out of form submission for good.
        matches(ctx, id) {
            return id === 'destroy' && stageOf(ctx) === 'S8' && !!ctx.cfg.disable;
        }
    },

    {
        issue: 893,
        title: 'a key press skips a value on a scale whose reported values are rounded',
        what: /key press must move/,
        // m017 (single type) and m036 (double, the to handle), both on min 0.5, max 10.5,
        // step 1. A press re-snaps the reported value onto the percent grid before adding
        // its step, so it can advance two reported values -- and a press the other way can
        // land back where it started.
        //
        // A stop hides it: a press whose own step already runs into a bound, a per-handle
        // limit or the interval is clamped there, and the plugin's overshoot is clamped to
        // the very same value, so the rule passes. Which handle a press moves is not
        // knowable from the configuration (in double type it is the last touched one), so
        // the question is asked of EVERY handle the press could move: a press that might
        // have landed on a stop is not excused. That is what keeps n043 -- the same scale,
        // with min_interval holding its from handle at the predicted stop -- out.
        //
        // A press that moved nothing is left to the callbacks rule, which is why the
        // stage's promise is read here; it stays true once the bug is fixed, so the entry
        // still retires.
        matches(ctx, id) {
            if (id !== 'keys' || !isKeyStage(ctx)) return false;
            const cfg = ctx.cfg;
            if (!reportedValuesOffGrid(cfg) || !promised(ctx).changed) return false;
            // Only the presses that move the handle UP skip a value. A decrease press that
            // moves at all lands on the scale point one step below (m017 goes 10.5 -> 10),
            // which is what the keys rule predicts once it snaps its one-step target onto the
            // scale, so the rule passes there and there is nothing to excuse; a decrease press
            // that moves nothing never reaches this rule at all.
            if (promised(ctx).key !== '+') return false;
            const direction = 1;
            const before = valuesOf(ctx.prev);
            const { step } = rangeOf(cfg);
            const movable = isDouble(cfg)
                ? [cfg.from_fixed ? null : 'from', cfg.to_fixed ? null : 'to'].filter(Boolean)
                : ['from'];
            if (!movable.length) return false;
            return movable.every((handle) => {
                const start = before[handle];
                if (!isNum(start)) return false;
                const other = handle === 'from' ? before.to : before.from;
                const stops = keyStops(handle, cfg, isNum(other) ? other : null);
                const overshoot = start + 2 * direction * step;
                return overshoot >= stops.lo - EPS && overshoot <= stops.hi + EPS;
            });
        }
    },

    {
        issue: 887,
        title: 'the built-in thousands separator is inserted into the fractional part',
        what: /label text|grid label at|_pretty must be/,
        // n041 (edge:tiny, step 0.0001). Whether a label shows it depends on the value the
        // label carries: at init that is the configured from/to (0 formats cleanly), and
        // after reset() it is the pair the last update() left, which reset() rebuilds from
        // the same options. Every stage in between moves the handle onto the
        // four-decimal grid, where the separator always lands inside the fraction.
        matches(ctx, id) {
            const cfg = ctx.cfg;
            if (id !== 'labels' && id !== 'grid' && id !== 'callbacks') return false;
            if (id === 'grid' && !cfg.grid) return false;
            // The payload's from_pretty/to_pretty carry the same text the value label does,
            // so a stage that records a payload reports the same split fraction (n041 at S1).
            if (id === 'callbacks' && !payloadStage(ctx)) return false;
            if (!builtinFormattingActive(cfg) || isValuesMode(cfg)) return false;
            if (scaleDecimals(cfg) < 4) return false;
            const stage = stageOf(ctx);
            if (stage === 'S8') return false;
            // S0, S7 and S9 all show a pair the slider was BUILT with rather than one a
            // handle was dragged to: the configured from/to at init, and the pair reset()
            // restored (which the second build then reads back off the input) after that.
            // The grid is the exception -- it is drawn across the whole range whatever the
            // handles do.
            if (id !== 'grid' && (stage === 'S0' || stage === 'S7' || stage === 'S9')) {
                const before = valuesOf(ctx.prev);
                const shown = stage === 'S0' ? [cfg.from, cfg.to] : [before.from, before.to];
                return shown.some((value) => separatorSplitsFraction(value, cfg));
            }
            return true;
        }
    },

    {
        issue: 879,
        title: 'a whole-interval move against from_max or to_min stretches the interval instead of moving it',
        what: /moves the whole interval/,
        // n042 (edge:bar-drag-from-max) and any drag_interval entry whose from handle is
        // within one bar drag of its from_max. The interval path clamps each handle on its
        // own, so the trailing handle stops at the limit while the leading one keeps
        // following the pointer.
        //
        // The track click goes down that same path -- calc()'s "both_one" centres the pair
        // on the click and then runs the very same per-handle clamp -- so a click that
        // carries one handle into its own limit leaves the other following the pointer and
        // stretches the pair exactly as the bar drag does. That is this bug, not a second
        // one, which is why both stages are read here and `what` names the half of the
        // message the two width failures share. No matrix entry reaches it at S3: the click
        // sits at 55 % of the range and every entry brings it a pair that centres well
        // inside its own limits, so the S3 half stands ready rather than excusing a cell.
        //
        // Each stage is asked about its own move: the bar drag adds a tenth of the range to
        // the pair the stage started from, the click re-centres that pair on the value it
        // landed on. The bar drag only ever travels right, so the limit its trailing handle
        // runs into is from_max, which is the one the S5 half reads; a to_max the leading
        // handle reached first would be the same bug, and no matrix entry gets there.
        matches(ctx, id) {
            if (id !== 'intervals') return false;
            const stage = stageOf(ctx);
            if (stage !== 'S3' && stage !== 'S5') return false;
            const cfg = ctx.cfg;
            if (!isDouble(cfg) || !cfg.drag_interval || isInert(cfg)) return false;
            if (cfg.from_fixed || cfg.to_fixed) return false;   // the whole move is dropped then
            const before = valuesOf(ctx.prev);
            if (!isNum(before.from)) return false;
            if (stage === 'S5') {
                if (!isNum(cfg.from_max)) return false;
                const { min, max } = rangeOf(cfg);
                return before.from + BAR_DRAG_FRACTION * (max - min) > cfg.from_max + EPS;
            }
            return isNum(before.to) && clampSplitsThePair(clickCentredPair(before, cfg), cfg);
        }
    },

    {
        issue: 884,
        title: 'max_postfix followed by a postfix that starts with a space renders two spaces',
        what: /label text/,
        // n011 (the site's age demo, postfix " years"), the only matrix entry carrying both
        // options. The plugin writes its separator whatever the postfix looks like, so a
        // postfix that already opens with whitespace is shown with two spaces. A postfix
        // that brings none is a different matter: one space is what the issue's own fix
        // keeps there ("100+ k"), the label is right today, and claiming it here would
        // annotate a healthy cell away -- and red this entry as "no longer reproduces" on
        // any cell where that pair is all there is. Any label carrying the max value shows
        // the doubled space, the max label included, so every stage that draws a label
        // reproduces.
        matches(ctx, id) {
            const cfg = ctx.cfg;
            if (id !== 'labels' || stageOf(ctx) === 'S8') return false;
            return !!cfg.max_postfix && typeof cfg.postfix === 'string' && /^\s/.test(cfg.postfix);
        }
    },

    {
        issue: 894,
        title: 'a handle limit and an interval limit that cannot both hold push the handle past its own limit',
        what: /passed (below|above) (from|to)_(min|max)|closed past min_interval|opened past max_interval|key press must move/,
        // m006, m010, m011, m018, m019, m025, m076 and m083: each pins one handle
        // (to_fixed, or from_fixed in m025) and then asks for an interval the other
        // handle's own limits leave no room for. The interval wins, so the moving handle
        // leaves its limit -- and where even the range is not wide enough for it, the
        // interval is left broken as well.
        //
        // Only the interaction stages: validate() re-applies the per-handle limits at
        // init, at update() and at reset(), so the pair S0, S6 and S7 leave behind is
        // #885's half of the story, not this one.
        matches(ctx, id) {
            if (!isInteractionStage(ctx)) return false;
            const cfg = ctx.cfg;
            const conflict = unsatisfiableInterval(cfg);
            if (!conflict) return false;

            if (id === 'limits') {
                // A handle with room of its own to stop in (m006, m025: no limit on the
                // moving handle at all) never leaves one, so there is nothing to excuse.
                if (!conflict.limitBroken) return false;
                // It goes out on the first stage that drives it and stays out: before
                // that the rule passes and must not be annotated away. A blocked slider
                // (m019, m083) is driven by no stage at all -- the mask swallows the
                // mouse and block drops every key press (#890) -- so it passes throughout.
                const own = limitWindow(conflict.handle, cfg);
                const before = valuesOf(ctx.prev)[conflict.handle];
                const alreadyOut = isNum(before) && (before < own.lo - EPS || before > own.hi + EPS);
                return alreadyOut || !!promised(ctx).changed;
            }

            if (id === 'intervals') {
                // The handle is asked for a value the range does not hold (m006, m010,
                // m025, m083), so it stops at the edge and the gap is wrong at every
                // interaction stage.
                if (conflict.unreachable) return true;
                // m011: with drag_over_limit a genuine DRAG clamps the handle to its own
                // limit and pushes the far handle instead, and never applies
                // min_interval -- so a drag of the handle that cannot get far enough away
                // leaves the interval broken. S1 drags the from handle and S2 the to
                // handle (matrix.spec.mjs). Every other path -- the track click, a key
                // press, a drag without drag_over_limit -- ends on the interval clamp,
                // which honours the interval and breaks the limit instead.
                const dragStage = conflict.handle === 'from' ? 'S1' : 'S2';
                return conflict.tooClose && !!cfg.drag_over_limit && stageOf(ctx) === dragStage;
            }

            // The same conflict read from the keyboard rule's side: with the interval
            // unsatisfiable, the window the rule clamps its prediction into has closed to
            // nothing and it predicts a value past the range (m006 and m083 predict an
            // index of -1, m019 the from_max the plugin ignored). A press that moved
            // nothing leaves the rule silent, which is why the stage's promise is read
            // here; that half stays true once the bug is fixed, so the entry still
            // retires.
            return id === 'keys' && isKeyStage(ctx) && !!promised(ctx).changed;
        }
    },

    {
        issue: 896,
        // The one callbacks line this speaks for: the interaction that owes an onFinish and
        // fires none. An inert slider owes none in the first place, which the guard below
        // keeps out and this pattern could not.
        what: /exactly one onFinish/,
        title: 'a slider whose min equals max fires no onFinish when a handle is released',
        // n038 (edge:min-eq-max), and any slider with one reachable value -- a one-entry
        // values array is the same thing. Every interaction stage: the press and release, the
        // track click and each key press all end without the onFinish the readme promises
        // "even without moving". Only the callbacks rule, and only its onFinish line: the
        // handle really does stay where it is, so every other rule holds and stays armed.
        //
        // A disabled or blocked slider is silent by the readme's own account, and the rule
        // judges it by the other half of its callbacks branch ("must not fire on a disabled
        // or blocked slider"), which passes: there is no failure for this entry to answer,
        // and claiming the cell would red it as "no longer reproduces".
        matches(ctx, id) {
            if (id !== 'callbacks' || !isInteractionStage(ctx) || isInert(ctx.cfg)) return false;
            const { min, max } = rangeOf(ctx.cfg);
            return min === max;
        }
    },

    {
        issue: 898,
        title: 'a track click hides every value label while drag_interval holds both handles on the same value',
        what: /neither the merged label nor both value labels/,
        // m080, from S3 on. What puts its two handles on one value is a drag: 6000 of a
        // range of a million is under four pixels of track, so the pair overlaps and the
        // press of a handle drag lands on whichever handle is on TOP (`to` at init, the
        // last touched one after that) rather than the one the stage aimed at -- then the
        // crossing guard parks the pressed handle on the other one. A user reaches the same
        // state by dragging one handle onto the other; the click that follows is what hides
        // the labels, and it takes both. With the handles on one value the plugin shows the
        // label of the handle last touched and hides the rest, and a track click under
        // drag_interval leaves neither handle in charge: the merged label AND both value
        // labels come out hidden. Every later key press travels the same whole-interval
        // path and redraws the same nothing, so the click stage and the four key stages all
        // report it.
        //
        // Where it stops: S5 drags the bar, which pulls the two handles apart again and
        // brings a label back (m080 shows the merged label from S5 on), and S6/S7 rebuild
        // the whole DOM through update() and reset(). Matching those would claim a healthy
        // cell and red the entry as "no longer reproduces", so the stage half stops at S4.
        //
        // The pair is read from the state the stage STARTED from, which is the click's own
        // reading at S3 and stays the click's reading afterwards: on this path a press
        // carries both handles by one step, so a pair coincident when the click landed is
        // still coincident at every press that follows, and the "started coincident" and
        // "was coincident at the click" readings are the same pair. A press that did pull
        // the handles apart would leave this entry silent at the next stage, which is the
        // honest answer -- the labels come back with the interval.
        matches(ctx, id) {
            if (id !== 'labels') return false;
            const cfg = ctx.cfg;
            if (stageOf(ctx) !== 'S3' && !isKeyStage(ctx)) return false;
            if (!isDouble(cfg) || !cfg.drag_interval || isInert(cfg)) return false;
            // With hide_from_to on, the rule judges that every value label is hidden and
            // never reports this message at all, so there would be nothing to excuse.
            if (cfg.hide_from_to) return false;
            const before = valuesOf(ctx.prev);
            return isNum(before.from) && isNum(before.to) && Math.abs(before.to - before.from) <= EPS;
        }
    }
];

/**
 * The register entry that covers this failure, if any.
 *
 * With a message, an entry answers only when its `what` pattern covers that message: two
 * entries can match the same configuration and rule (m065 carries both #889 and #891 on the
 * callbacks rule), and the message is what tells them apart. Without one the question is the
 * weaker "does any entry claim this configuration and rule at all", which is what the
 * retirement check in judgeStage() asks.
 *
 * @param {object} ctx        the invariant context ({ state, cfg, stage, prev, expectations, env })
 * @param {string} id         the failing invariant id
 * @param {string} [message]  the failure message
 * @returns {object|null}
 */
export function matchKnownBug(ctx, id, message) {
    for (const bug of KNOWN_BUGS) {
        if (!bug || typeof bug.matches !== 'function' || !bug.matches(ctx, id)) continue;
        if (typeof message === 'string' && !(bug.what instanceof RegExp && bug.what.test(message))) continue;
        return bug;
    }
    return null;
}

/**
 * Judges one stage's failures against the register.
 *
 * A failure a filed bug accounts for -- its entry matches the configuration and stage AND its
 * `what` covers the message -- becomes an annotation. Everything else stays real. On top of
 * that, an entry that matches this cell while NO failure of its rule answers its `what` is
 * reported as real: the bug does not reproduce here any more, and its register line has to go,
 * or the suite would keep excusing a cell that is already healthy.
 *
 * @param {Array<{id: string, message: string}>} failures   what checkInvariants() reported
 * @param {object} ctx                                      the invariant context
 * @param {string[]} [skippedIds]  invariant ids this stage did not check (no usable oracle),
 *                                 which are neither annotated nor retired on
 * @returns {{real: Array<{id: string, message: string}>, annotations: Array<object>}}
 */
export function judgeStage(failures, ctx, skippedIds) {
    const skipped = skippedIds || [];
    const stage = stageOf(ctx);
    const real = [];
    const annotations = [];

    for (const failure of failures || []) {
        const known = matchKnownBug(ctx, failure.id, failure.message);
        if (known) annotations.push({ issue: known.issue, title: known.title, id: failure.id, stage: stage, message: failure.message });
        else real.push(failure);
    }

    for (const invariant of INVARIANTS) {
        if (skipped.indexOf(invariant.id) >= 0) continue;
        for (const bug of KNOWN_BUGS) {
            if (!bug || typeof bug.matches !== 'function' || !bug.matches(ctx, invariant.id)) continue;
            const reproduced = (failures || []).some((failure) =>
                failure.id === invariant.id && bug.what instanceof RegExp && bug.what.test(failure.message));
            if (!reproduced) {
                real.push({ id: invariant.id, message: `${invariant.id}: bug #${bug.issue} no longer reproduces here; remove its register entry (after ${stage})` });
            }
        }
    }

    return { real: real, annotations: annotations };
}
