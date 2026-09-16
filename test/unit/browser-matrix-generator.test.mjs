import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DIMENSIONS, EXCLUSIONS, NAMED_CASES } from '../browser/matrix/dimensions.mjs';
import { generate } from '../browser/matrix/generate-configs.mjs';

// #877: unit tests for the pairwise combination-matrix generator (docs/2026-09-15-
// browser-suite-design.md, "Combination matrix"). These pin the generator itself --
// dimensions.mjs's levels and exclusions, generate-configs.mjs's pairwise algorithm --
// never the plugin. matrix.spec.mjs (a later task) is what drives configs.json
// through js/ion.rangeSlider.js.

const DIMENSION_NAMES = Object.keys(DIMENSIONS);

function isExcluded(partial) {
    return EXCLUSIONS.some((fn) => fn(partial));
}

function pairKey(d1, l1, d2, l2) {
    return d1 < d2 ? `${d1}=${l1}|${d2}=${l2}` : `${d2}=${l2}|${d1}=${l1}`;
}

// Derived straight from DIMENSIONS + EXCLUSIONS, independently of generate-configs.mjs's
// own bookkeeping, so a bug in the generator's internal pair tracking can't also blind
// this check.
function requiredPairsIndependent() {
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

function pairsOfDims(dims) {
    const pairs = [];
    for (let i = 0; i < DIMENSION_NAMES.length; i++) {
        for (let j = i + 1; j < DIMENSION_NAMES.length; j++) {
            const d1 = DIMENSION_NAMES[i];
            const d2 = DIMENSION_NAMES[j];
            pairs.push(pairKey(d1, dims[d1], d2, dims[d2]));
        }
    }
    return pairs;
}

function generatedOnly(entries) {
    return entries.filter((e) => e.id && e.id.startsWith('m'));
}

// generate(1) scores thousands of candidates per round (see generate-configs.mjs's
// CANDIDATES_PER_ROUND comment) to keep the generated count near the design's 70-90
// estimate, so it is computed once here and reused -- every test below except the
// determinism check itself, which needs a second, independent call.
const ALL = generate(1);

// Bug caught: an exclusion predicate written as `picked.x !== 'default-id'` instead of
// checking presence first -- `undefined !== 'default-id'` is true, so a partial pair
// that never mentions dimension `x` at all would be wrongly excluded. This collapsed
// the required-pairs count from ~2049 to 119 and the generated matrix from ~70-90
// entries down to 17 before it was caught here.
test('an exclusion predicate never fires on a pair that omits every dimension it checks', () => {
    assert.equal(isExcluded({ type: 'single', skin: 'flat' }), false, 'unrelated to intervals/drag/limits/fixed/decoration/values/scale');
    assert.equal(isExcluded({ formatting: 'default', container: '600' }), false, 'unrelated to every exclusion');
});

// Bug caught: the same regression above, seen from the required-pairs count itself --
// a magnitude canary loose enough to survive a dimension/level tweak but tight enough
// to catch a predicate collapsing coverage the way the fix above did (119 required).
test('the independently-derived required-pairs count is in the low thousands, not a fraction of it', () => {
    const required = requiredPairsIndependent();
    assert.ok(required.size > 1500, `required.size ${required.size} looks collapsed (expected roughly 2000+)`);
});

// Bug caught: the generator stopping before every non-excluded pair of levels (across
// every two of the fifteen dimensions) is exercised by at least one generated entry --
// e.g. dropping a dimension from scoring, or capping rounds before coverage completes.
test('every non-excluded pair of levels is covered by at least one generated entry', () => {
    const required = requiredPairsIndependent();
    const covered = new Set();
    for (const entry of generatedOnly(ALL)) {
        for (const key of pairsOfDims(entry.dims)) covered.add(key);
    }
    const missing = [...required].filter((key) => !covered.has(key));
    assert.deepEqual(missing, [], `${missing.length} required pairs are not covered: ${missing.slice(0, 5).join(', ')}`);
});

// Bug caught: a candidate combining two levels an EXCLUSIONS predicate marks
// impossible (e.g. single type with min_interval, or values mode with a custom
// scale) slipping into configs.json instead of being discarded.
test('no generated entry violates an exclusion', () => {
    for (const entry of generatedOnly(ALL)) {
        assert.equal(isExcluded(entry.dims), false, `${entry.id} (${entry.name}) violates an exclusion`);
    }
});

// Bug caught: seeding the candidate stream from wall-clock time, Math.random(), or
// object key iteration order instead of the `seed` argument -- two calls would then
// disagree, and the committed configs.json would drift on every regeneration.
test('the same seed gives byte-identical output', () => {
    assert.equal(JSON.stringify(ALL), JSON.stringify(generate(1)));
});

// Bug caught: forgetting a named case, reordering the site demos ahead of the
// generated entries, or a generated candidate accidentally sharing (and mutating) a
// named case's config object.
test('every named case is appended unchanged, after the generated entries', () => {
    const named = ALL.slice(ALL.length - NAMED_CASES.length);
    assert.equal(named.length, NAMED_CASES.length);
    named.forEach((entry, i) => {
        assert.equal(entry.name, NAMED_CASES[i].name);
        assert.deepEqual(entry.config, NAMED_CASES[i].config);
        assert.deepEqual(entry.attrs ?? null, NAMED_CASES[i].attrs ?? null);
    });
});

// Bug caught: NAMED_CASES silently losing a site demo file or an edge case (the design
// calls for all 34 demo inits across the three page_demo*.js files plus 7 edge cases).
test('NAMED_CASES carries the 34 site demo inits plus the 7 edge cases', () => {
    const demo = NAMED_CASES.filter((c) => c.name.startsWith('demo:'));
    const edge = NAMED_CASES.filter((c) => c.name.startsWith('edge:'));
    assert.equal(demo.length, 34);
    assert.equal(edge.length, 7);
    assert.equal(NAMED_CASES.length, 41);
    assert.equal(new Set(NAMED_CASES.map((c) => c.name)).size, NAMED_CASES.length, 'case names must be unique');
});

// Bug caught: a pool or round cap raised "to make coverage pass" without bound,
// quietly bloating the committed configs.json and the CI run time it drives.
test('the generated count stays under 100 and the total under 150', () => {
    const generatedCount = generatedOnly(ALL).length;
    assert.ok(generatedCount < 100, `generated count ${generatedCount} is not under 100`);
    assert.ok(ALL.length < 150, `total count ${ALL.length} is not under 150`);
});

// Bug caught: a dimension level computed off the wrong range (e.g. the "to" limits
// level, or the type=double from/to fractions, read against the scalar min/max instead
// of the values-mode index range) producing from > to or a limit outside min..max --
// exactly the "self-inflicted failure" the design forbids. Scoped to generated
// entries: several named edge cases (edge:from-above-to, edge:min-eq-max) exist
// specifically to break this on purpose, against the plugin's own validate(), not
// against this generator.
test('every generated config passes the from/to and limits sanity check', () => {
    for (const entry of generatedOnly(ALL)) {
        const cfg = entry.config;
        if (cfg.type === 'double' && cfg.from !== undefined && cfg.to !== undefined) {
            assert.ok(cfg.from <= cfg.to, `${entry.id}: from ${cfg.from} > to ${cfg.to}`);
        }
        const values = Array.isArray(cfg.values) ? cfg.values : null;
        const min = values ? 0 : (cfg.min ?? 10);
        const max = values ? values.length - 1 : (cfg.max ?? 100);
        for (const key of ['from_min', 'from_max', 'to_min', 'to_max']) {
            if (cfg[key] === undefined) continue;
            assert.ok(cfg[key] >= min && cfg[key] <= max, `${entry.id}: ${key} ${cfg[key]} outside ${min}..${max}`);
        }
    }
});
