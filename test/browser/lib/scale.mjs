/**
 * #877 browser suite -- the value scale, derived from readme.md only.
 *
 * The oracle for this module is the readme, never js/ion.rangeSlider.js: a suite
 * that re-implements the plugin's arithmetic can only ever agree with it. Every
 * rule below quotes the sentence it comes from, and a disagreement between this
 * module and the plugin is a finding for the known-bug register, not a reason to
 * relax the rule.
 *
 * readme.md "Notes on some options" -> "step":
 *   "Every value is min plus a whole number of steps, rounded to the decimals of
 *    step. With a whole-number step that rounding produces whole numbers, so
 *    min: 0.5, step: 1 gives 0.5, 2, 3, 4 and min: 1.2, step: 4 gives 1.2, 5, 9,
 *    13; a negative min keeps its decimals instead (min: -0.5, step: 1 gives
 *    -0.5, 0.5, 1.5). With a fractional step the values keep the decimals of step
 *    (min: 0.3, step: 0.25 gives 0.3, 0.55, 0.8). step_from_min keeps every value
 *    exactly on min plus whole steps in all cases."
 *
 * readme.md "Notes on some options" -> "values":
 *   "The slider works on array indexes instead of numbers: whatever you pass for
 *    min, max and step is replaced by 0, values.length - 1 and 1."
 */

/** readme settings table defaults: min 10, max 100, step 1. */
const DEFAULT_MIN = 10;
const DEFAULT_MAX = 100;
const DEFAULT_STEP = 1;

/** Scale points are compared exactly; this tolerance is only for the k search window. */
const K_WINDOW = 2;

/**
 * Decimal places of a number as it is written, exponent form included.
 *
 * @param {number} n
 * @returns {number}
 */
export function decimalsOf(n) {
    if (typeof n !== 'number' || !Number.isFinite(n)) return 0;
    const s = String(Math.abs(n));
    const e = s.indexOf('e');
    if (e < 0) {
        const dot = s.indexOf('.');
        return dot < 0 ? 0 : s.length - dot - 1;
    }
    const exp = Number(s.slice(e + 1));
    const mantissa = s.slice(0, e);
    const dot = mantissa.indexOf('.');
    const mantissaDecimals = dot < 0 ? 0 : mantissa.length - dot - 1;
    return Math.max(0, mantissaDecimals - exp);
}

/**
 * True when the config is in values mode, i.e. the slider works on array indexes.
 *
 * @param {object} cfg
 * @returns {boolean}
 */
export function isValuesMode(cfg) {
    return Array.isArray(cfg.values) && cfg.values.length > 0;
}

/**
 * The effective min, max and step of a config.
 *
 * readme "values": in values mode min, max and step are replaced by 0,
 * values.length - 1 and 1, whatever the caller passed.
 *
 * @param {object} cfg
 * @returns {{min: number, max: number, step: number}}
 */
export function rangeOf(cfg) {
    if (isValuesMode(cfg)) return { min: 0, max: cfg.values.length - 1, step: 1 };
    return {
        min: typeof cfg.min === 'number' ? cfg.min : DEFAULT_MIN,
        max: typeof cfg.max === 'number' ? cfg.max : DEFAULT_MAX,
        step: typeof cfg.step === 'number' ? cfg.step : DEFAULT_STEP
    };
}

/**
 * Decimals every scale point is rounded to.
 *
 * readme "step": "rounded to the decimals of step", except a negative min, which
 * "keeps its decimals instead". readme "step_from_min": every value sits exactly
 * on min plus whole steps, so nothing may be rounded away -- the widest of the
 * step, min and max decimals is kept.
 *
 * @param {object} cfg
 * @returns {number}
 */
export function scaleDecimals(cfg) {
    if (isValuesMode(cfg)) return 0;                       // indexes are whole numbers
    const { min, max, step } = rangeOf(cfg);
    const stepDecimals = decimalsOf(step);
    if (cfg.step_from_min) return Math.max(stepDecimals, decimalsOf(min), decimalsOf(max));
    if (min < 0 && stepDecimals === 0) return decimalsOf(min);
    return stepDecimals;
}

/**
 * The k-th point of the documented scale, counting from min.
 *
 * readme "step": every value is "min plus a whole number of steps, rounded to the
 * decimals of step" -- and the readme's own sequences start at min itself
 * ("min: 0.5, step: 1 gives 0.5, 2, 3, 4", "min: 1.2, step: 4 gives 1.2, 5, 9,
 * 13"), so k = 0 is min as written, never min rounded. That is why 1 is not a
 * point of the 0.5/step 1 scale although 0.5 rounds to it.
 *
 * @param {number} k         whole number of steps from min, 0 or more
 * @param {object} cfg
 * @returns {number}
 */
export function scalePoint(k, cfg) {
    if (isValuesMode(cfg)) return k;
    const { min, step } = rangeOf(cfg);
    if (k === 0) return min;
    return +(min + k * step).toFixed(scaleDecimals(cfg));
}

/**
 * Does this value sit on the documented scale?
 *
 * readme "values": in values mode the slider works on array indexes, so only whole
 * indexes inside the array are on the scale. Otherwise the value must equal one of
 * the scale points above. The search window around the estimated k covers the shift
 * the rounding can introduce (at most half a step for a whole step, far less for a
 * fractional one).
 *
 * Values below min are off the scale: the readme says every value is min PLUS a
 * whole number of steps, so k is never negative. A value above max is left to the
 * bounds invariant; this function only answers the scale question.
 *
 * max itself is a scale point, exactly the way min is. When the range is not a whole
 * number of steps wide -- min 0, max 10, step 25, or the milder min 0, max 100, step 3
 * -- the readme's two sentences pull apart: "Maximum value" says the handle reaches max,
 * while "min plus a whole number of steps" says it may not stop there. A handle can only
 * honour one of them, and stopping at max is the half every slider takes, so the rule
 * accepts it. Nothing else is loosened: a value strictly between two scale points, max
 * excluded, is still reported.
 *
 * @param {number} value
 * @param {object} cfg
 * @returns {boolean}
 */
export function onScale(value, cfg) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return false;
    if (isValuesMode(cfg)) return Number.isInteger(value) && value >= 0 && value <= cfg.values.length - 1;
    const { min, max, step } = rangeOf(cfg);
    if (value === max) return true;
    if (!(step > 0) || !Number.isFinite(min)) return false;
    const estimate = Math.round((value - min) / step);
    if (!Number.isFinite(estimate)) return false;
    for (let k = Math.max(0, estimate - K_WINDOW); k <= estimate + K_WINDOW; k++) {
        if (scalePoint(k, cfg) === value) return true;
    }
    return false;
}

/**
 * The scale point closest to a value.
 *
 * readme "step_from_min": "A value that does not sit on the scale is moved to the
 * nearest point that does." The readme does not say which way a value exactly
 * between two points goes; this helper takes the higher one (characterization,
 * matching Math.round's half-up rule) and no test depends on the tie.
 *
 * The result is always a value onScale() accepts, min and max are not applied as
 * clamps: a caller that needs clamping owns that decision.
 *
 * @param {number} value
 * @param {object} cfg
 * @returns {number}
 */
export function nearestOnScale(value, cfg) {
    if (isValuesMode(cfg)) {
        const last = cfg.values.length - 1;
        return Math.min(Math.max(Math.round(value), 0), last);
    }
    const { min, step } = rangeOf(cfg);
    if (!(step > 0) || !Number.isFinite(value)) return min;
    const estimate = Math.round((value - min) / step);
    let best = min;
    let bestDistance = Infinity;
    for (let k = Math.max(0, estimate - K_WINDOW); k <= estimate + K_WINDOW; k++) {
        const point = scalePoint(k, cfg);
        const distance = Math.abs(value - point);
        if (distance < bestDistance || (distance === bestDistance && point > best)) {
            best = point;
            bestDistance = distance;
        }
    }
    return best;
}
