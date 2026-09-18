/**
 * #877 browser suite -- the numbers of the matrix's fixed interaction script.
 *
 * matrix.spec.mjs drives all 128 entries through one script, and the known-bug register
 * (../lib/known-bugs.mjs) has to answer questions the script alone decides: where a drag
 * aims, what value the click lands on, how far the bar travels. Both sides read those
 * numbers from here, so a change to the script cannot leave the register predicating on
 * the old ones. This module imports nothing from either of them, so neither import is a
 * cycle.
 */

import { isValuesMode, nearestOnScale, rangeOf } from '../lib/scale.mjs';

/**
 * The three track fractions the mouse stages aim at: S1 drives the from (or single)
 * handle, S2 the to handle, S3 clicks the track.
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
 * the whole override mechanism: one optional number per entry, read by the spec and
 * defaulted to S1_TARGET, so the interaction script itself stays one script for all 128
 * entries. The two named cases with an s1 target of their own (n042 and n043) carry no
 * off-scale limit, so the shared fraction is the one the register's predicates read.
 */
export const S1_TARGET = 0.2;
export const S2_TARGET = 0.8;
export const S3_CLICK = 0.55;

/**
 * The fraction of the track S5 drags the bar to the right.
 *
 * It is a bar drag only while there is a bar to press. The press aims at the bar's centre
 * and the bar runs from one handle's centre to the other's, so each handle covers half its
 * own width of the bar and the centre of a bar no wider than a handle lies under one of
 * them: m080 holds 6000 of a range of a million, under four pixels of track beneath two
 * sixteen-pixel handles. matrix.spec.mjs reads that off the geometry and the width promise
 * stands down, so a pair that stage closes is a handle drag doing what a handle drag may --
 * no register entry speaks for it (that was #895, closed as an artefact of this harness).
 */
export const BAR_DRAG_FRACTION = 0.1;

/**
 * The value S6's update() moves the from handle to: the middle of the range, snapped to
 * the documented scale (values mode works on indexes, so the middle index).
 *
 * @param {object} cfg
 * @returns {number}
 */
export function midValue(cfg) {
    if (isValuesMode(cfg)) return Math.floor(cfg.values.length / 2);
    const { min, max } = rangeOf(cfg);
    return nearestOnScale((min + max) / 2, cfg);
}
