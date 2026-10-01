/**
 * #877 browser suite -- the known-bug register.
 *
 * A filed bug turns a red matrix cell into an annotation instead of a failure, and
 * the day the bug is fixed the entry itself fails ("no longer reproduces here"), so
 * a fix has to retire its register line. Nothing here skips or loosens a test.
 *
 * An entry is:
 *   {
 *     issue: 896,                                   // the filed GitHub issue number
 *     title: 'a slider whose min equals max fires no onFinish when a handle is released',   // one line, in the glossary's words
 *     what: /exactly one onFinish/,                  // the failure MESSAGES this bug produces
 *     matches(ctx, id) { return id === 'callbacks' && isInteractionStage(ctx) && !isInert(ctx.cfg) && rangeOf(ctx.cfg).min === rangeOf(ctx.cfg).max; }
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
 *   - `cfg`, the option set the plugin was built with, including the two fields
 *     matrix.spec.mjs adds for the register: `__hidden_at_init` (the fixture built the
 *     slider inside a display:none container) and `__value_attr` (the input carried this
 *     value attribute, which is how the entry placed its from/to; rebuiltPair() reads it).
 *     Both are configuration -- the readme documents the hidden container and the value
 *     attribute as ways to build a slider -- and neither can be read off the option set
 *     alone.
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

import { isValuesMode, nearestOnScale, onScale, rangeOf, scalePoint } from './scale.mjs';
import { keyStops, INVARIANTS } from './invariants.mjs';
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
 * S9 moves nothing: it builds the slider a second time, and its clamps run on the pair that
 * build is handed (rebuiltPair), not on the one the destroyed slider left.
 *
 * @param {object} ctx
 * @returns {{from: number|null, to: number|null}}
 */
function valuesUnderStage(ctx) {
    const cfg = ctx.cfg;
    if (stageOf(ctx) === 'S9') return rebuiltPair(ctx);
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
 * does, and the entries written for that pair (#882, #894) apply to it unchanged.
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
 * One handle's value clamped to the range and to its own per-handle limits, the way
 * validate() clamps it, and then rounded onto the scale when a limit left it off (that
 * rounding is issue #882; the render does it).
 *
 * @param {number|null} value
 * @param {'from'|'to'} handle
 * @param {object} cfg
 * @returns {number|null}
 */
function clampedToLimits(value, handle, cfg) {
    if (!isNum(value)) return null;
    const { min, max } = rangeOf(cfg);
    const lo = Math.max(min, isNum(cfg[handle + '_min']) ? cfg[handle + '_min'] : min);
    const hi = Math.min(max, isNum(cfg[handle + '_max']) ? cfg[handle + '_max'] : max);
    const held = Math.min(Math.max(value, lo), Math.min(Math.max(hi, lo), max));
    return onScale(held, cfg) ? held : nearestOnScale(held, cfg);
}

/**
 * The pair the slider is built with, clamped as validate() clamps it BEFORE it applies the
 * interval limits.
 *
 * validate() clamps the configured from/to to the range and to the per-handle limits,
 * and a limit off the documented scale then takes the handle to the nearest scale point
 * (that rounding is issue #882). Since #885 it then applies min_interval and max_interval
 * as well, which settledPair() models; this helper stops before that step. pinnedOther()
 * reads a fixed handle from it, and the interval step never moves a fixed handle.
 *
 * @param {object} cfg
 * @returns {{from: number|null, to: number|null}}
 */
function startingPair(cfg) {
    return { from: clampedToLimits(cfg.from, 'from', cfg), to: clampedToLimits(cfg.to, 'to', cfg) };
}

/**
 * The pair validate() settles on for a double slider with an interval limit (#885).
 *
 * The handed pair is clamped as startingPair() says. Then, for min_interval and then for
 * max_interval, the handles move so the interval holds. The preferred handle (the to handle
 * at build time and on reset(); the from handle when update() changed from alone; the other
 * one when the preferred handle is fixed; nothing when both are) moves first, inside its
 * window: the range narrowed by its own per-handle limits, or its own value for a fixed
 * handle (limitWindow()). When the window stops it short, it stays on the window's edge and
 * the other handle moves the rest of the way inside its own window. When neither can make
 * room, a limit and the interval cannot both hold (#894): the pair is then settled as if
 * every free handle could use the whole range, and the per-handle limits applied last put
 * the limit back and leave the interval broken. An
 * interval wider than the range is first lowered to the range, as validate() does, and a
 * min_interval above max_interval gives way to it. The mirror of applyIntervals() and
 * fitIntervals() in js/ion.rangeSlider.js, except that a moved handle stands exactly the
 * interval away instead of being rounded onto the scale.
 *
 * @param {object} cfg
 * @param {{from: number|null, to: number|null}} handed   the pair the build or update() is handed
 * @param {'from'|'to'} preferred                          the handle the plugin moves first
 * @returns {{from: number|null, to: number|null}}
 */
function settledPair(cfg, handed, preferred) {
    const start = startingPair({ ...cfg, ...handed });
    if (!isDouble(cfg) || !hasInterval(cfg) || !isNum(start.from) || !isNum(start.to)) return start;
    if (cfg.from_fixed && cfg.to_fixed) return start;
    const { min, max } = rangeOf(cfg);
    const lowered = (interval) => (isNum(interval) && interval > 0 ? Math.min(interval, max - min) : 0);
    const minInterval = lowered(cfg.min_interval);
    const maxInterval = lowered(cfg.max_interval);
    const minYields = maxInterval > 0 && minInterval > maxInterval;
    let moveFrom = preferred === 'from';
    if (moveFrom ? cfg.from_fixed : cfg.to_fixed) moveFrom = !moveFrom;
    const windowOf = (handle, ownLimits) => {
        if (cfg[handle + '_fixed']) return { lo: start[handle], hi: start[handle] };
        return ownLimits ? limitWindow(handle, cfg) : { lo: min, hi: max };
    };
    // One pass over both intervals; null when ownLimits is set and no handle can make room.
    const fit = (ownLimits) => {
        const f = windowOf('from', ownLimits);
        const t = windowOf('to', ownLimits);
        if (ownLimits && (f.lo > f.hi + EPS || t.lo > t.hi + EPS)) return null;
        let { from, to } = start;
        if (minInterval && to - from < minInterval - EPS) {
            if (moveFrom) {
                if (to - minInterval >= f.lo - EPS) from = Math.min(from, to - minInterval);
                else if (f.lo + minInterval <= t.hi + EPS) { from = f.lo; to = f.lo + minInterval; }
                else if (ownLimits && !minYields) return null;
            } else if (from + minInterval <= t.hi + EPS) {
                to = Math.max(to, from + minInterval);
            } else if (t.hi - minInterval >= f.lo - EPS) {
                to = t.hi;
                from = t.hi - minInterval;
            } else if (ownLimits && !minYields) {
                return null;
            }
        }
        if (maxInterval && to - from > maxInterval + EPS) {
            if (moveFrom) {
                if (!ownLimits || to - maxInterval <= f.hi + EPS) from = Math.max(from, to - maxInterval);
                else if (f.hi + maxInterval >= t.lo - EPS) { from = f.hi; to = f.hi + maxInterval; }
                else return null;
            } else if (!ownLimits || from + maxInterval >= t.lo - EPS) {
                to = Math.min(to, from + maxInterval);
            } else if (t.lo - maxInterval <= f.hi + EPS) {
                to = t.lo;
                from = t.lo - maxInterval;
            } else {
                return null;
            }
        }
        return { from, to };
    };
    const { from, to } = fit(true) || fit(false);
    return { from: clampedToLimits(from, 'from', cfg), to: clampedToLimits(to, 'to', cfg) };
}

/**
 * The pair update({from: mid}) at S6 leaves: validate() sets from to the middle of the
 * range, pulls it back onto a to handle it crossed, clamps it, and the call changed from
 * alone, so the from handle is the one the interval step moves first (when the clamp leaves
 * from where it stood, the call changed nothing and the to handle is preferred).
 *
 * @param {object} ctx
 * @returns {{from: number|null, to: number|null}}
 */
function updatedPair(ctx) {
    const cfg = ctx.cfg;
    const before = valuesOf(ctx.prev);
    const { min, max } = rangeOf(cfg);
    let from = Math.min(Math.max(midValue(cfg), min), max);
    if (isNum(before.to) && from > before.to) from = before.to;
    const heldFrom = (() => {
        const lo = isNum(cfg.from_min) ? cfg.from_min : -Infinity;
        const hi = isNum(cfg.from_max) ? cfg.from_max : Infinity;
        return Math.min(Math.max(from, lo), hi);
    })();
    const changed = !isNum(before.from) || Math.abs(heldFrom - before.from) > EPS;
    return settledPair(cfg, { from: from, to: before.to }, changed ? 'from' : 'to');
}

/**
 * Does the pair validate() settled on at this build or update stage, or the one a stage that
 * moved nothing carried on from there, still break an interval limit?
 *
 * That happens only where the per-handle limits (a fixed handle's value included) leave no
 * pair that holds the interval, whichever handle moves: the limit wins at build time and on
 * update(), and the interval is left broken (#894). Which handle moves first, and where a
 * pair that cannot settle ends up, change the pair settledPair() returns but never this
 * answer: once the limits are applied, no pair inside them holds such an interval. S0 and
 * S9 are builds handed the configured pair and the pair rebuiltPair() says; S6 is
 * update({from: mid}); S7 is reset(), which re-runs validate() on the pair S6 left with the
 * to handle preferred. An interaction stage that moved nothing
 * (a disabled, blocked or fixed slider) carries the broken pair on; one that moved a handle
 * re-applies the interval through calc(), which the interaction half of the entry covers.
 *
 * @param {object} ctx
 * @returns {boolean}
 */
function intervalLeftBroken(ctx) {
    const cfg = ctx.cfg;
    if (!isDouble(cfg) || !hasInterval(cfg) || valuesUnreadableAtInit(ctx)) return false;
    const stage = stageOf(ctx);
    const gapOf = (pair) => gapBetween(pair.from, pair.to);
    if (stage === 'S0') return breaksInterval(gapOf(settledPair(cfg, { from: cfg.from, to: cfg.to }, 'to')), cfg);
    if (stage === 'S9') return breaksInterval(gapOf(settledPair(cfg, rebuiltPair(ctx), 'to')), cfg);
    if (stage === 'S6') return breaksInterval(gapOf(updatedPair(ctx)), cfg);
    const before = valuesOf(ctx.prev);
    if (stage === 'S7') return breaksInterval(gapOf(settledPair(cfg, before, 'to')), cfg);
    if (!isInteractionStage(ctx) || promised(ctx).changed) return false;
    // Only a pair validate() left broken: one broken by an interaction is another entry's.
    const built = settledPair(cfg, { from: cfg.from, to: cfg.to }, 'to');
    return breaksInterval(gapOf(built), cfg) && breaksInterval(gapBetween(before.from, before.to), cfg);
}

/**
 * The pair S9's second build is handed, before validate() runs on it.
 *
 * matrix.spec.mjs calls ionRangeSlider() on the destroyed input again with the entry's own
 * config literal, and the input still carries the entry's data-* attributes. Its value is the
 * pair reset() left at S7, which is also what the S8 state read off it (`prev` here).
 * destroy() leaves no from or to behind in the input's jQuery data (#911), so the second build
 * resolves its pair the way the first one did: a from/to the configuration gives -- the JS
 * config or a data-* attribute -- wins over the input's value, and the handle is handed the
 * value S0 was handed; a handle the value attribute placed, or nothing placed, is handed the
 * input's value. Every matrix entry places its from and to through one route, so the value
 * attribute (`__value_attr`) says which of the two applies. In values mode the input's value
 * names entries, not indexes, and the second build looks them up in the values array once
 * more; since #914 that lookup finds the entry the input names, numeric-looking strings
 * included, so the handle is handed the index the S8 state read off the input.
 *
 * Like S0's configured pair, this is what the build is GIVEN; startingPair() says where
 * validate()'s clamps leave it, and settledPair() where validate() leaves it once the
 * interval limits are applied too.
 *
 * @param {object} ctx
 * @returns {{from: number|null, to: number|null}}
 */
function rebuiltPair(ctx) {
    const cfg = ctx.cfg;
    const before = valuesOf(ctx.prev);
    const configured = typeof cfg.__value_attr !== 'string';
    const pick = (handle) => {
        if (configured && isNum(cfg[handle])) return cfg[handle];
        return isNum(before[handle]) ? before[handle] : null;
    };
    return { from: pick('from'), to: pick('to') };
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
            // one that started inside can be carried back out (m063's S5 bar drag). At S9 it
            // is the pair the second build is handed, which for most entries is the
            // configured one again.
            return pushedIntoAnOffScaleLimit(valuesUnderStage(ctx), cfg);
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
        issue: 894,
        title: 'a handle limit and an interval that cannot both hold: a drag breaks the limit, a build or update() breaks the interval',
        what: /passed (below|above) (from|to)_(min|max)|closed past min_interval|opened past max_interval|key press must move/,
        // m006, m010, m011, m018, m019, m025, m076 and m083: each pins one handle
        // (to_fixed, or from_fixed in m025) and then asks for an interval the other
        // handle's own limits leave no room for. The interval wins, so the moving handle
        // leaves its limit -- and where even the range is not wide enough for it, the
        // interval is left broken as well.
        //
        // At a build and on update() or reset() it is the other way round (#885 made
        // validate() apply the intervals): when neither handle can make room inside its
        // own limits, the per-handle limits are applied last there, so the limit holds and
        // the interval is left broken. That half reaches further than a pinned handle: m001
        // (a from_min of 2.4 on a track only min_interval wide) and m060 (from_fixed
        // against to_min) break it too, and m077 is m025's twin. A pair that one handle's
        // limit stops short but the other handle can complete is settled, and is not this
        // bug. A slider that moves nothing afterwards (disabled, blocked, fixed) carries a
        // broken pair on. intervalLeftBroken() says where.
        matches(ctx, id) {
            if (id === 'intervals' && intervalLeftBroken(ctx)) return true;
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
    }
];

/**
 * The register entry that covers this failure, if any.
 *
 * With a message, an entry answers only when its `what` pattern covers that message: two
 * entries can match the same configuration and rule (a values-mode slider built hidden
 * carries both #888 and #897 on the callbacks rule at S0), and the message is what tells
 * them apart. Without one the question is the
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
