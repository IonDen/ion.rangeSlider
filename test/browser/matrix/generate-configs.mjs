#!/usr/bin/env node
/**
 * #877 browser suite -- the deterministic greedy pairwise generator for the
 * combination matrix driven by test/browser/matrix/matrix.spec.mjs.
 *
 * `generate(seed)` repeatedly draws a batch of candidates (one level per dimension)
 * from a seeded PRNG, scores each by how many still-uncovered, non-excluded
 * dimension-level pairs it would cover, and commits the best-scoring candidate in the
 * batch (ties broken by draw order) until every non-excluded pair is covered. Run
 * directly (`node generate-configs.mjs`), it writes configs.json.
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DIMENSIONS, EXCLUSIONS, NAMED_CASES } from './dimensions.mjs';

const DIMENSION_NAMES = Object.keys(DIMENSIONS);

// A safety valve only: real runs finish in well under this many batches. Hitting it
// means a dimension/exclusion change made some pair uncoverable, a bug to fix, not to
// paper over by raising the cap.
const MAX_ROUNDS = 500;
// A larger pool per round scores more candidates before committing one, so the greedy
// loop needs fewer generated entries to reach full coverage (measured: 97 entries at
// 300, 85 at 3000, 84 at 5000 -- past 3000 the return is a handful of entries for
// roughly double the run time, so 3000 is where this stops paying for itself).
const CANDIDATES_PER_ROUND = 3000;

/**
 * Deterministic PRNG (mulberry32) so `generate(seed)` is reproducible byte for byte.
 *
 * @param {number} seed
 * @returns {() => number} a function returning a float in [0, 1)
 */
function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * True when any EXCLUSIONS predicate flags this (partial or full) picked-levels map.
 * Every predicate in dimensions.mjs reads at most two dimensions, so this same check
 * works both for a full 15-dimension candidate and for a single dimension pair.
 *
 * @param {Record<string, string>} picked
 * @returns {boolean}
 */
function isExcluded(picked) {
    return EXCLUSIONS.some((fn) => fn(picked));
}

/**
 * @param {string} d1
 * @param {string} l1
 * @param {string} d2
 * @param {string} l2
 * @returns {string} a canonical (dimension-name-ordered) key for the pair
 */
function pairKey(d1, l1, d2, l2) {
    return d1 < d2 ? `${d1}=${l1}|${d2}=${l2}` : `${d2}=${l2}|${d1}=${l1}`;
}

/**
 * Every dimension-level pair that at least one valid (non-excluded) candidate could
 * cover -- the coverage target `generate()` stops at.
 *
 * @returns {Set<string>}
 */
function requiredPairs() {
    const required = new Set();
    for (let i = 0; i < DIMENSION_NAMES.length; i++) {
        for (let j = i + 1; j < DIMENSION_NAMES.length; j++) {
            const d1 = DIMENSION_NAMES[i];
            const d2 = DIMENSION_NAMES[j];
            for (const l1 of DIMENSIONS[d1]) {
                for (const l2 of DIMENSIONS[d2]) {
                    if (isExcluded({ [d1]: l1.id, [d2]: l2.id })) continue;
                    required.add(pairKey(d1, l1.id, d2, l2.id));
                }
            }
        }
    }
    return required;
}

/**
 * The C(15,2) pair keys within one fully-picked candidate.
 *
 * @param {Record<string, string>} pickedIds
 * @returns {string[]}
 */
function pairsOf(pickedIds) {
    const pairs = [];
    for (let i = 0; i < DIMENSION_NAMES.length; i++) {
        for (let j = i + 1; j < DIMENSION_NAMES.length; j++) {
            const d1 = DIMENSION_NAMES[i];
            const d2 = DIMENSION_NAMES[j];
            pairs.push(pairKey(d1, pickedIds[d1], d2, pickedIds[d2]));
        }
    }
    return pairs;
}

/**
 * Runs every dimension's apply(entry) in DIMENSIONS' key order (values/scale before
 * type, type before the levels that branch on double, everything before route,
 * container last) against a fresh entry.
 *
 * The route level is the one that snapshots `entry.effective` (the option set as the
 * plugin will see it) before it moves keys into `attrs`; the fallback below keeps the
 * field present even if a future dimension set ever drops the route dimension.
 *
 * @param {Record<string, {id: string, apply(entry: object): void}>} pickedLevels
 * @returns {{ config: object, effective: object, attrs: object|null, extra: object, notes: string[] }}
 */
function buildEntry(pickedLevels) {
    const entry = { config: {}, effective: null, attrs: null, extra: {}, notes: [] };
    for (const dim of DIMENSION_NAMES) pickedLevels[dim].apply(entry);
    if (!entry.effective) entry.effective = effectiveOf(entry.config);
    return entry;
}

/**
 * A standalone copy of a config, for entries that never pass through a route level
 * (the named cases, which travel entirely through the JS config).
 *
 * @param {object} config
 * @returns {object}
 */
function effectiveOf(config) {
    const effective = Object.assign({}, config);
    if (Array.isArray(config.values)) effective.values = config.values.slice();
    return effective;
}

/**
 * Draws one random level per dimension from the PRNG.
 *
 * @param {() => number} rng
 * @returns {{ pickedIds: Record<string, string>, pickedLevels: Record<string, object> }}
 */
function drawCandidate(rng) {
    const pickedIds = {};
    const pickedLevels = {};
    for (const dim of DIMENSION_NAMES) {
        const levels = DIMENSIONS[dim];
        const lvl = levels[Math.floor(rng() * levels.length)];
        pickedIds[dim] = lvl.id;
        pickedLevels[dim] = lvl;
    }
    return { pickedIds, pickedLevels };
}

/**
 * The greedy pairwise combination matrix: generated entries first (deterministic for
 * a given seed), then every NAMED_CASES entry, unchanged, in its source order.
 *
 * @param {number} [seed]
 * @returns {Array<{ id: string, name: string, dims?: Record<string,string>, config: object, effective: object, attrs: object|null, extra: object }>}
 */
export function generate(seed = 1) {
    const rng = mulberry32(seed);
    const required = requiredPairs();
    const covered = new Set();
    const generated = [];
    let counter = 1;

    for (let round = 0; round < MAX_ROUNDS && covered.size < required.size; round++) {
        let best = null;
        let bestScore = 0;
        for (let c = 0; c < CANDIDATES_PER_ROUND; c++) {
            const { pickedIds, pickedLevels } = drawCandidate(rng);
            if (isExcluded(pickedIds)) continue;
            const pairs = pairsOf(pickedIds);
            let score = 0;
            for (const key of pairs) {
                if (required.has(key) && !covered.has(key)) score++;
            }
            if (score > bestScore) {
                bestScore = score;
                best = { pickedIds, pickedLevels, pairs };
            }
        }
        if (!best) continue; // an unlucky round drew nothing useful; the next round's draws still improve coverage
        for (const key of best.pairs) {
            if (required.has(key)) covered.add(key);
        }
        const entry = buildEntry(best.pickedLevels);
        generated.push({
            id: 'm' + String(counter++).padStart(3, '0'),
            name: DIMENSION_NAMES.map((d) => `${d}=${best.pickedIds[d]}`).join(','),
            dims: best.pickedIds,
            config: entry.config,
            effective: entry.effective,
            attrs: entry.attrs,
            extra: entry.extra,
            notes: entry.notes
        });
    }

    if (covered.size < required.size) {
        throw new Error(`generate(${seed}): ${required.size - covered.size} required pairs are still uncovered after ${MAX_ROUNDS} rounds -- raise CANDIDATES_PER_ROUND or MAX_ROUNDS, or check for an uncoverable pair`);
    }

    const named = NAMED_CASES.map((nc, i) => {
        const entry = {
            id: 'n' + String(i + 1).padStart(3, '0'),
            name: nc.name,
            config: nc.config,
            effective: effectiveOf(nc.config),
            attrs: nc.attrs || null,
            extra: nc.extra || {},
            notes: nc.notes || []
        };
        // Only the handful of cases that need a stage target of their own carry the
        // field, so configs.json does not gain a null on every other entry.
        if (nc.stages) entry.stages = nc.stages;
        return entry;
    });

    return [...generated, ...named];
}

// CLI: `node test/browser/matrix/generate-configs.mjs` regenerates configs.json.
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
    const seed = 1;
    const entries = generate(seed);
    const generatedCount = entries.filter((e) => e.id.startsWith('m')).length;
    // Seed only, no date: the generator is deterministic for a seed, so stamping the day of
    // the run would rewrite the committed configs.json on every regeneration.
    const header = { _generated: `seed ${seed}`, _count: entries.length };
    const outPath = fileURLToPath(new URL('./configs.json', import.meta.url));
    writeFileSync(outPath, JSON.stringify([header, ...entries], null, 2) + '\n');
    console.log(`generate-configs: wrote ${entries.length} entries (${generatedCount} generated + ${entries.length - generatedCount} named) to configs.json`);
}
