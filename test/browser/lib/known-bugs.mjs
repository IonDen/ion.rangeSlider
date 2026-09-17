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
 *     matches(ctx, id) { return id === 'grid' && gridBoundariesOffScale(ctx.cfg); }
 *   }
 *
 * `matches` receives the same ctx the invariants get ({ state, cfg, stage, prev,
 * expectations }) plus the failing invariant id. What a predicate may read:
 *
 *   - `cfg`, the option set the plugin was built with, including the two fields
 *     matrix.spec.mjs adds for the register: `__hidden_at_init` (the fixture built the
 *     slider inside a display:none container) and `__value_attr` (the input carried this
 *     value attribute). Both are configuration -- the readme documents the hidden
 *     container and the value attribute as ways to build a slider -- and neither can be
 *     read off the option set alone.
 *   - `stage`, and `expectations`, the stage's own promise.
 *   - `prev`, the state the stage STARTED from.
 *
 * What a predicate may NOT read: `ctx.state`, the outcome being judged, and the entry
 * id. The outcome is off limits because a predicate that watched the value it excuses
 * would quietly stop matching the day the bug is fixed, and the "no longer reproduces"
 * check would never fire; the entry id is off limits because the generator renumbers its
 * entries whenever a dimension changes, and an entry keyed on an id would silently stop
 * matching. Predicate on the CONFIG FIELDS, the stage, and where needed the pair the
 * stage started from.
 *
 * Each entry says, in its comment, which matrix entries it was written against and which
 * stages reproduce -- a predicate wider than that annotates healthy cells away, and one
 * narrower leaves the matrix red on a bug that is already filed.
 */

import { isValuesMode, nearestOnScale, onScale, rangeOf, scaleDecimals, scalePoint } from './scale.mjs';
import { builtinPrettify, valuesEntry } from './format.mjs';
import { gridUnits, keyStops } from './invariants.mjs';

/** Values sit on a step grid, so only float representation noise is tolerated. */
const EPS = 1e-9;

/** readme settings table: the four per-handle limits, with the side each one guards. */
const LIMITS = [
    { handle: 'from', key: 'from_min', side: -1 },
    { handle: 'from', key: 'from_max', side: 1 },
    { handle: 'to', key: 'to_min', side: -1 },
    { handle: 'to', key: 'to_max', side: 1 }
];

/** The fraction of the track S5 drags the bar to the right (matrix.spec.mjs). */
const BAR_DRAG_FRACTION = 0.1;

const isNum = (value) => typeof value === 'number' && Number.isFinite(value);
const isDouble = (cfg) => cfg.type === 'double';
const isInert = (cfg) => !!(cfg.disable || cfg.block);
const stageOf = (ctx) => String(ctx.stage);
const isKeyStage = (ctx) => /^S4/.test(stageOf(ctx));
const isInteractionStage = (ctx) => /^S[1-5]/.test(stageOf(ctx));
const valuesOf = (state) => (state && state.values) || { from: null, to: null };
const promised = (ctx) => ctx.expectations || {};

/**
 * The value S6's update() moves the from handle to.
 *
 * The same middle-of-the-range value matrix.spec.mjs computes; kept here rather than
 * imported because the spec imports this module (importing it back would be a cycle).
 * A change to the spec's S6 target has to be made in both places, which the comment on
 * each side says.
 *
 * @param {object} cfg
 * @returns {number}
 */
function midValue(cfg) {
    if (isValuesMode(cfg)) return Math.floor(cfg.values.length / 2);
    const { min, max } = rangeOf(cfg);
    return nearestOnScale((min + max) / 2, cfg);
}

/**
 * At init a values-mode slider built inside a hidden container reports nothing at all --
 * its input is empty and its from/to are null (#888) -- so every rule that judges a
 * VALUE passes there and must not be excused by another entry.
 *
 * @param {object} ctx
 * @returns {boolean}
 */
function valuesUnreadableAtInit(ctx) {
    return stageOf(ctx) === 'S0' && !!ctx.cfg.__hidden_at_init && isValuesMode(ctx.cfg);
}

/** The per-handle limits that do not sit on the documented scale. */
function offScaleLimits(cfg) {
    return LIMITS.filter((limit) => isNum(cfg[limit.key]) && !onScale(cfg[limit.key], cfg));
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
    if (stage === 'S0' || stage === 'S6' || stage === 'S7') return true;  // onStart/onInit, onUpdate
    if (!isInert(ctx.cfg)) return true;                             // a live slider reports every interaction
    // An inert slider is silent under the mouse; a blocked one still answers the
    // keyboard, which is bug #890 and the only payload it produces.
    return !!ctx.cfg.block && isKeyStage(ctx);
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
 * in charge, and on an inert slider the mask swallows it, so a blocked slider keeps the
 * ordinary key path (and bug #890 with it).
 *
 * @param {object} cfg
 * @returns {boolean}
 */
function intervalKeyboardIsDead(cfg) {
    return isDouble(cfg) && !!cfg.drag_interval && !!(cfg.from_fixed || cfg.to_fixed) && !isInert(cfg);
}

/** Does the input's value attribute name entries the plugin's lookup cannot find? */
function valueAttrLookupFails(cfg) {
    if (typeof cfg.__value_attr !== 'string' || !isValuesMode(cfg)) return false;
    // The constructor turns each half of the attribute into a number when it looks
    // numeric, then looks THAT up in the values array exactly as the caller passed it:
    // a numeric-looking string entry is never found and the handle falls back.
    return [cfg.from, cfg.to].some((index) => {
        if (!Number.isInteger(index) || index < 0 || index >= cfg.values.length) return false;
        const entry = cfg.values[index];
        if (typeof entry === 'number') return false;
        const text = String(entry).trim();
        return text !== '' && Number.isFinite(Number(text));
    });
}

/** @type {Array<{issue: number, title: string, matches: (ctx: object, id: string) => boolean}>} */
export const KNOWN_BUGS = [
    {
        issue: 882,
        title: 'a handle limit off the step scale is crossed by up to half a step',
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
            // where that state has no value to give (a slider built hidden reports none
            // until it is revealed, so the first stage after the reveal starts from the
            // configured pair).
            const before = stageOf(ctx) === 'S0' ? {} : valuesOf(ctx.prev);
            const values = {
                from: isNum(before.from) ? before.from : cfg.from,
                to: isNum(before.to) ? before.to : cfg.to
            };
            return pushedIntoAnOffScaleLimit(values, cfg);
        }
    },

    {
        issue: 883,
        title: 'from_value and to_value turn undefined after the first update() or reset()',
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
        // validate() clamps from/to against the per-handle limits but never against the
        // interval limits, so the starting pair (S0) and the pair update() leaves behind
        // (S6, and S7, where reset() rebuilds from the very same options) can break them.
        // The violation then SURVIVES every stage that does not move a handle -- a
        // disabled, blocked or fixed slider carries it to the end of the run -- which is
        // why the pair the stage started from is read here. A stage that does move a
        // handle re-applies the interval, so the rule passes there and the entry must not
        // match.
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
        // Every stage that records a payload on a slider with prettify_enabled: false and
        // numeric values behind it. _prettify() returns its argument unchanged there, so
        // the "formatted" half of every pair is the raw number the readme shows as text.
        matches(ctx, id) {
            if (id !== 'callbacks') return false;
            return prettyFieldsAreNumbers(ctx.cfg) && payloadStage(ctx);
        }
    },

    {
        issue: 890,
        title: 'block leaves the keyboard working, so a blocked slider still changes value',
        // The mask swallows the mouse but the track keeps its tabindex, so every key
        // stage of a blocked slider reports callbacks it should not (and moves the value
        // when nothing else holds it). A blocked slider whose keyboard the interval-drag
        // bug already killed (#891) reports nothing at all, so there is no failure there.
        matches(ctx, id) {
            const cfg = ctx.cfg;
            if (!cfg.block || cfg.disable) return false;
            if (!isKeyStage(ctx) || intervalKeyboardIsDead(cfg)) return false;
            if (id === 'callbacks') return true;
            // The inert rule only fires when the press actually moved the value, which
            // the configuration alone cannot say (a fixed handle or a limit may hold it).
            // The stage's own promise carries it, and it survives a fix: once block stops
            // answering the keyboard the callbacks half above reds as "no longer
            // reproduces", so the retirement of this entry does not depend on this line.
            return id === 'inert' && !!promised(ctx).changed;
        }
    },

    {
        issue: 888,
        title: 'a values-mode slider built in a hidden container leaves its input empty',
        // At S0 the input is empty, from is null and the onStart/onInit payloads carry
        // from_value null. One idle tick after the container is revealed the slider fills
        // everything in -- and that filling-in reads as a value change that never
        // happened, so the first stage after the reveal reports a moved fixed handle, a
        // changed value on an inert slider and a missing onChange. All of it is the empty
        // input working its way out, which is why S1 is part of the entry.
        matches(ctx, id) {
            const cfg = ctx.cfg;
            const stage = stageOf(ctx);
            if (!cfg.__hidden_at_init || !isValuesMode(cfg)) return false;
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
        // The click leaves the interval path in charge of the keyboard, and its
        // fixed-handle guard drops the whole press, callbacks included -- so the press
        // owes an onFinish it never fires. An inert slider is silent anyway, which is why
        // disable/block are left out (the callbacks rule passes there).
        matches(ctx, id) {
            const cfg = ctx.cfg;
            return id === 'callbacks' && isKeyStage(ctx) && intervalKeyboardIsDead(cfg) && !isInert(cfg);
        }
    },

    {
        issue: 892,
        title: 'grid labels name values off the step scale on a range that does not divide',
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
        // S8 only, and only for disable: nothing undoes the input's disabled property, so
        // the field stays out of form submission for good.
        matches(ctx, id) {
            return id === 'destroy' && stageOf(ctx) === 'S8' && !!ctx.cfg.disable;
        }
    },

    {
        issue: 893,
        title: 'a key press skips a value on a scale whose reported values are rounded',
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
            const direction = promised(ctx).key === '+' ? 1 : promised(ctx).key === '-' ? -1 : 0;
            if (!direction) return false;
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
        issue: 880,
        title: 'the input value attribute cannot name a numeric-looking values entry',
        // m024 and m064: the lookup misses, both handles fall back, and from_min then
        // lifts `from` above the `to` that fell to the first entry -- the crossing the
        // bounds rule reports. It stands until a stage actually moves a handle (m064's
        // `to` drag repairs it; m024 is blocked and carries it to the end), so the
        // crossing the stage started from and the stage's own promise decide. Without a
        // from_min the two handles land on the same entry and nothing is reportable: the
        // slider is silently wrong, which is the finding the issue carries but no
        // invariant can see.
        matches(ctx, id) {
            // A crossed pair has a NEGATIVE gap, so it breaks a min_interval along with
            // the ordering (both are the fallen-back lookup, not a second bug) -- and it
            // can never break a max_interval, which no negative gap exceeds.
            if (id !== 'bounds' && id !== 'intervals') return false;
            const cfg = ctx.cfg;
            if (id === 'intervals' && !(isNum(cfg.min_interval) && cfg.min_interval > 0)) return false;
            if (!valueAttrLookupFails(cfg) || !isDouble(cfg) || !isNum(cfg.from_min) || !(cfg.from_min > 0)) return false;
            const stage = stageOf(ctx);
            if (stage === 'S0') return true;
            if (stage === 'S8') return false;
            const before = valuesOf(ctx.prev);
            // A slider built hidden reports no pair at S0; the crossing is there all the
            // same, which is what the "unknown counts as crossed" branch says.
            const startedCrossed = isNum(before.from) && isNum(before.to) ? before.to < before.from - EPS : true;
            return startedCrossed && !promised(ctx).changed;
        }
    },

    {
        issue: 887,
        title: 'the built-in thousands separator is inserted into the fractional part',
        // n041 (edge:tiny, step 0.0001). Whether a label shows it depends on the value the
        // label carries: at init that is the configured from/to (0 formats cleanly), and
        // after reset() it is the pair the last update() left, which reset() rebuilds from
        // the same options. Every stage in between moves the handle onto the
        // four-decimal grid, where the separator always lands inside the fraction.
        matches(ctx, id) {
            const cfg = ctx.cfg;
            if (id !== 'labels' && id !== 'grid') return false;
            if (id === 'grid' && !cfg.grid) return false;
            if (!builtinFormattingActive(cfg) || isValuesMode(cfg)) return false;
            if (scaleDecimals(cfg) < 4) return false;
            const stage = stageOf(ctx);
            if (stage === 'S8') return false;
            if (id === 'labels' && (stage === 'S0' || stage === 'S7')) {
                const before = valuesOf(ctx.prev);
                const shown = stage === 'S0' ? [cfg.from, cfg.to] : [before.from, before.to];
                return shown.some((value) => separatorSplitsFraction(value, cfg));
            }
            return true;
        }
    },

    {
        issue: 879,
        title: 'a bar drag against from_max stretches the interval instead of moving it',
        // n042 (edge:bar-drag-from-max) and any drag_interval entry whose from handle is
        // within one bar drag of its from_max. The interval path clamps each handle on its
        // own, so the trailing handle stops at the limit while the leading one keeps
        // following the pointer.
        matches(ctx, id) {
            if (id !== 'intervals' || stageOf(ctx) !== 'S5') return false;
            const cfg = ctx.cfg;
            if (!isDouble(cfg) || !cfg.drag_interval || isInert(cfg)) return false;
            if (cfg.from_fixed || cfg.to_fixed) return false;   // the whole drag is dropped then
            if (!isNum(cfg.from_max)) return false;
            const before = valuesOf(ctx.prev);
            if (!isNum(before.from)) return false;
            const { min, max } = rangeOf(cfg);
            return before.from + BAR_DRAG_FRACTION * (max - min) > cfg.from_max + EPS;
        }
    },

    {
        issue: 884,
        title: 'max_postfix followed by a postfix renders a space the readme never asks for',
        // n011 (the site's age demo, postfix " years"). The plugin writes a space of its
        // own between the two, which doubles the space of a postfix that already starts
        // with one. Any label carrying the max value shows it, the max label included, so
        // every stage that draws a label reproduces.
        matches(ctx, id) {
            const cfg = ctx.cfg;
            return id === 'labels' && stageOf(ctx) !== 'S8' && !!cfg.max_postfix && !!cfg.postfix;
        }
    },

    {
        issue: 894,
        title: 'a handle limit and an interval limit that cannot both hold push the handle past its own limit',
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
                // that -- a blocked slider under the mouse, m019 and m083 through S1 to
                // S3 -- the rule passes and must not be annotated away.
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
        issue: 895,
        title: 'a bar drag collapses the interval to zero width when it sits at max_interval',
        // m080 (max_interval 6000 on a range of a million). Once the clamp has settled the
        // pair at exactly max_interval, the trailing handle travels the whole drag while
        // max_interval holds the leading one where it is, and the two meet: both labels
        // read the same value and the bar has no width left to grab.
        //
        // It takes a drag wider than the interval itself. S5 moves the pair by a tenth of
        // the range (matrix.spec.mjs), which is room enough to cross an interval of 6000
        // in a million and nowhere near enough to cross m068's four units of ten -- that
        // pair travels as a unit and keeps its width, so its cell stays healthy.
        //
        // Only S5 drags the bar, and only a live slider with two free handles gets that
        // drag at all: a fixed handle drops it, and the mask swallows it on a disabled or
        // blocked one. Not #879, which needs a from_max for the trailing handle to stop
        // against and stretches the pair instead of collapsing it.
        matches(ctx, id) {
            if (id !== 'intervals' || stageOf(ctx) !== 'S5') return false;
            const cfg = ctx.cfg;
            if (!isDouble(cfg) || !cfg.drag_interval || isInert(cfg)) return false;
            if (cfg.from_fixed || cfg.to_fixed) return false;
            if (!(isNum(cfg.max_interval) && cfg.max_interval > 0)) return false;
            const { min, max } = rangeOf(cfg);
            if (BAR_DRAG_FRACTION * (max - min) <= cfg.max_interval + EPS) return false;
            const before = valuesOf(ctx.prev);
            const gap = gapBetween(before.from, before.to);
            return isNum(gap) && Math.abs(gap - cfg.max_interval) <= EPS;
        }
    }
];

/**
 * The register entry that covers this failure, if any.
 *
 * @param {object} ctx   the invariant context ({ state, cfg, stage, prev, expectations })
 * @param {string} id    the failing invariant id
 * @returns {object|null}
 */
export function matchKnownBug(ctx, id) {
    for (const bug of KNOWN_BUGS) {
        if (bug && typeof bug.matches === 'function' && bug.matches(ctx, id)) return bug;
    }
    return null;
}
