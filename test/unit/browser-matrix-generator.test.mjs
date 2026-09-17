import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { DIMENSIONS, EXCLUSIONS, NAMED_CASES } from '../browser/matrix/dimensions.mjs';
import { generate } from '../browser/matrix/generate-configs.mjs';
import { scalePoint } from '../browser/lib/scale.mjs';

// #877: unit tests for the pairwise combination-matrix generator. These pin the generator
// itself -- dimensions.mjs's levels and exclusions, generate-configs.mjs's pairwise
// algorithm -- never the plugin. test/browser/matrix/matrix.spec.mjs is what drives
// configs.json through js/ion.rangeSlider.js.

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
// calls for all 34 demo inits across the three page_demo*.js files, plus the edge cases
// -- 7 from the design and the two configurations that carry the bar-drag stretch and
// the top-edge interval violation into the matrix).
test('NAMED_CASES carries the 34 site demo inits plus the 9 edge cases', () => {
    const demo = NAMED_CASES.filter((c) => c.name.startsWith('demo:'));
    const edge = NAMED_CASES.filter((c) => c.name.startsWith('edge:'));
    assert.equal(demo.length, 34);
    assert.equal(edge.length, 9);
    assert.equal(NAMED_CASES.length, 43);
    assert.equal(new Set(NAMED_CASES.map((c) => c.name)).size, NAMED_CASES.length, 'case names must be unique');
});

// The two cases that exist to reach a bug the pairwise entries never reach: a bar drag
// that runs the leading handle into from_max while the trailing one keeps going, and a
// from handle dragged to the very top of a range whose max sits off the step scale.
// Bug caught: an edited config that no longer reproduces -- a bar-drag case without
// from_max between from and the track's right end, or a top-edge case whose max is a
// whole number of steps above min (both would make the matrix pass while the plugin
// bugs are still there, and would red their register entries as "no longer
// reproduces").
test('the two bug-reaching edge cases keep the configuration that reaches the bug', () => {
    const bar = NAMED_CASES.find((c) => c.name === 'edge:bar-drag-from-max');
    assert.ok(bar, 'edge:bar-drag-from-max must stay in the named cases');
    assert.equal(bar.config.drag_interval, true);
    assert.equal(bar.config.type, 'double');
    assert.ok(bar.config.from < bar.config.from_max, 'from must start below from_max, or the drag never reaches the limit');
    assert.ok(bar.config.from_max < bar.config.to, 'from_max must sit inside the interval, so only the leading handle is stopped');
    // Where the from handle stands when the bar drag starts is the whole point of this
    // case, and the fixed script decides it: S1 drags the handle to its own fraction of
    // the track, the four key presses add three steps and take one back, and S5 carries
    // the pair a tenth of the range to the right. The shared S1 fraction (0.2 of a 0 to
    // 1000 track) leaves the drag stopping at 310, a hundred short of the limit, so the
    // case carries an S1 target of its own.
    // Bug caught: an S1 override -- or a script fraction it was written against -- that
    // leaves the pair too far left for the bar drag to reach from_max, which makes the
    // matrix pass while the plugin bug is still there and reds #879 as "no longer
    // reproduces" for want of a cell.
    assert.equal(bar.stages.s1, 0.3);
    const range = bar.config.max - bar.config.min;
    const atBarDrag = bar.config.min + bar.stages.s1 * range + 2 * bar.config.step;
    assert.ok(atBarDrag + 0.1 * range > bar.config.from_max, `the bar drag must carry from (${atBarDrag}) past from_max ${bar.config.from_max}`);

    const top = NAMED_CASES.find((c) => c.name === 'edge:min-interval-top');
    assert.ok(top, 'edge:min-interval-top must stay in the named cases');
    assert.ok(top.config.min_interval > 0, 'the case is about min_interval');
    // min 0.5 with step 1 reports 0.5, 2, 3 ... 10, so max (10.5) is NOT one of the
    // scale's own points, and the top reachable value sits half a step below it. That
    // half step is the gap the interval clamp then allows.
    const k = Math.round((top.config.max - top.config.min) / top.config.step);
    assert.notEqual(scalePoint(k, top.config), top.config.max, 'max must sit off the step scale, which is what opens the gap');
    // This case needs the from handle driven all the way to the top edge, which the
    // shared S1 fraction never reaches, so it carries its own S1 target.
    assert.equal(top.stages.s1, 1);
});

// Bug caught: generate() dropping a named case's `stages` override, so matrix.spec.mjs
// would drive edge:min-interval-top to the shared S1 fraction and never reach the edge.
test('a named case carries its stage overrides into the generated entry', () => {
    const named = ALL.slice(ALL.length - NAMED_CASES.length);
    const top = named.find((e) => e.name === 'edge:min-interval-top');
    assert.ok(top, 'the entry must be generated');
    assert.deepEqual(top.stages, { s1: 1 });

    const bar = named.find((e) => e.name === 'edge:bar-drag-from-max');
    assert.ok(bar, 'the bar-drag entry must be generated');
    assert.deepEqual(bar.stages, { s1: 0.3 });

    const plain = named.find((e) => e.name === 'edge:coincident');
    assert.equal(plain.stages, undefined, 'a case without overrides carries no stages field');
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

// ---------------------------------------------------------------------------------------
// entry.effective -- the merged option set as the PLUGIN will see it, snapshotted before
// the route dimension moves keys into attrs or the input's value attribute. matrix.spec.mjs
// hands it to the invariants and the label oracle, which have to read `type`, `min`,
// `values`, `hide_from_to` and friends even for an entry whose `config` is empty because
// the whole option set travelled as data-* attributes.
// ---------------------------------------------------------------------------------------

/** `data-from-min` -> `from_min` (the readme's Data-Attr column names, kebab for snake). */
function dataAttrToKey(name) {
    return name.slice('data-'.length).replace(/-/g, '_');
}

// Bug caught: a route level snapshotting `effective` AFTER it deletes the moved keys (or
// not snapshotting at all) -- every data-route entry would then hand the invariants an
// empty option set, and the matrix would silently check a double slider as a single one.
test('every entry carries an effective option set that is a superset of its config', () => {
    for (const entry of ALL) {
        assert.ok(entry.effective && typeof entry.effective === 'object', `${entry.id} (${entry.name}) has no effective option set`);
        for (const key of Object.keys(entry.config)) {
            assert.deepEqual(entry.effective[key], entry.config[key], `${entry.id} (${entry.name}): effective.${key} does not match config.${key}`);
        }
    }
});

// Bug caught: a data-route entry whose effective set lost an option the route moved into
// attrs -- e.g. `type` going to data-type while effective keeps no `type`, which would
// make the bounds/labels/dom invariants judge a double slider against the single-type rules.
test('every data-* attribute of a route=data entry has its option in the effective set', () => {
    const dataRouted = ALL.filter((entry) => entry.dims && entry.dims.route === 'data');
    assert.ok(dataRouted.length > 0, 'the generated matrix must contain route=data entries');
    for (const entry of dataRouted) {
        for (const name of Object.keys(entry.attrs || {})) {
            if (name.indexOf('data-') !== 0) continue;
            const key = dataAttrToKey(name);
            assert.ok(key in entry.effective, `${entry.id} (${entry.name}): ${name} has no effective.${key}`);
        }
    }
});

// Bug caught: the value-attr route dropping from/to from the effective set along with the
// config -- the oracle would then have no starting values to compare the first stage against.
test('a route=value-attr entry keeps from (and to in double type) in its effective set', () => {
    const valueRouted = ALL.filter((entry) => entry.dims && entry.dims.route === 'value-attr');
    assert.ok(valueRouted.length > 0, 'the generated matrix must contain route=value-attr entries');
    for (const entry of valueRouted) {
        assert.equal(entry.config.from, undefined, `${entry.id}: from must have left the config for the value attribute`);
        assert.equal(typeof entry.effective.from, 'number', `${entry.id}: effective.from is missing`);
        if (entry.effective.type === 'double') {
            assert.equal(typeof entry.effective.to, 'number', `${entry.id}: effective.to is missing`);
        }
    }
});

// Bug caught: effective sharing the config's `values` array by reference, so a later
// mutation of one silently rewrites the other.
test('effective does not share the values array with the config', () => {
    const withValues = ALL.filter((entry) => Array.isArray(entry.config.values));
    assert.ok(withValues.length > 0, 'the generated matrix must contain values-mode entries on the JS route');
    for (const entry of withValues) {
        assert.notEqual(entry.effective.values, entry.config.values, `${entry.id}: effective.values is the same array object as config.values`);
        assert.deepEqual(entry.effective.values, entry.config.values);
    }
});

// ---------------------------------------------------------------------------------------
// The input `value` attribute route in values mode.
// ---------------------------------------------------------------------------------------

/**
 * The readme's config-resolution rule, written out independently of the generator:
 * "with a `values` array the value is looked up as an index" -- so the markup names an
 * ENTRY and the slider resolves its index. A numeric-looking attribute value is read as
 * a number first (readme note "values": "A numeric-looking entry such as "20.0" is
 * converted to the number 20 unless values_raw is on"), which is why the lookup is tried
 * both ways: with values_raw the entries stay strings and only the string form matches.
 */
function lookupIndex(values, text) {
    const asNumber = text !== '' && Number.isFinite(Number(text)) ? Number(text) : text;
    const numeric = values.indexOf(asNumber);
    return numeric >= 0 ? numeric : values.indexOf(text);
}

// Bug caught: writing the INDEX into the input's value attribute in values mode. The
// plugin looks the attribute up in the values array, so "1" on a [10, 20, 30, 40, 50]
// slider is not entry 1 but a value that is not in the array at all, and the matrix
// would drive a configuration no markup can produce.
test('a route=value-attr entry in values mode names the entries, not the indexes', () => {
    const entries = ALL.filter((e) => e.dims && e.dims.route === 'value-attr' && Array.isArray(e.effective.values));
    assert.ok(entries.length > 0, 'the generated matrix must contain a values-mode entry on the value-attribute route');
    for (const entry of entries) {
        const cfg = entry.effective;
        const sep = typeof cfg.input_values_separator === 'string' ? cfg.input_values_separator : ';';
        const parts = String(entry.attrs.value).split(sep);
        assert.equal(parts.length, cfg.type === 'double' ? 2 : 1, `${entry.id}: the value attribute must carry one entry per handle`);
        assert.equal(lookupIndex(cfg.values, parts[0]), cfg.from, `${entry.id}: value attribute ${JSON.stringify(entry.attrs.value)} does not resolve to from index ${cfg.from}`);
        if (cfg.type === 'double') {
            assert.equal(lookupIndex(cfg.values, parts[1]), cfg.to, `${entry.id}: value attribute ${JSON.stringify(entry.attrs.value)} does not resolve to to index ${cfg.to}`);
        }
    }
});

// Bug caught: the same route writing the prettified or decorated text instead of the
// raw value on a numeric slider, which the plugin reads back with +val and turns into
// NaN.
test('a route=value-attr entry outside values mode names the raw numbers', () => {
    const entries = ALL.filter((e) => e.dims && e.dims.route === 'value-attr' && !Array.isArray(e.effective.values));
    assert.ok(entries.length > 0, 'the generated matrix must contain a numeric entry on the value-attribute route');
    for (const entry of entries) {
        const cfg = entry.effective;
        const sep = typeof cfg.input_values_separator === 'string' ? cfg.input_values_separator : ';';
        const parts = String(entry.attrs.value).split(sep);
        assert.equal(Number(parts[0]), cfg.from, `${entry.id}: value attribute ${JSON.stringify(entry.attrs.value)} does not carry from ${cfg.from}`);
        if (cfg.type === 'double') assert.equal(Number(parts[1]), cfg.to, `${entry.id}: value attribute does not carry to ${cfg.to}`);
    }
});

// Bug caught: a named case whose config is read off the wall clock -- configs.json is
// committed and reviewed, so an entry that changes with the calendar (page_demo.js
// #demo_6 starts its month slider at `new Date().getMonth()`) rewrites the file on
// every regeneration and makes a matrix failure unreproducible a month later. Loading
// the module again with a clock that refuses to be read is what proves it: a value
// assertion alone would pass on the one month of the year that happens to match.
test('the named cases hold no wall-clock value', () => {
    const monthDemo = NAMED_CASES.find((c) => c.name === 'demo:page_demo:demo_6');
    assert.ok(monthDemo, 'the month demo must stay in the named cases');
    assert.equal(monthDemo.config.from, 5, 'the month demo starts on a fixed month index');

    const moduleUrl = new URL('../browser/matrix/dimensions.mjs', import.meta.url).href;
    const script = `
        const RealDate = Date;
        globalThis.Date = class extends RealDate {
            constructor(...args) {
                if (args.length === 0) throw new Error('a named case read the current date');
                super(...args);
            }
            static now() { throw new Error('a named case read the current time'); }
        };
        const { NAMED_CASES } = await import(${JSON.stringify(moduleUrl)});
        process.stdout.write(JSON.stringify(NAMED_CASES));
    `;
    const printed = execFileSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' });
    assert.equal(printed, JSON.stringify(NAMED_CASES), 'the named cases must not depend on when they are built');
});

// Bug caught: a named case built with `new Date(y, m, d)`, which resolves in the machine's
// local time zone -- the date demo's committed timestamps then differ between a generator run
// in Amsterdam and one under TZ=UTC, so configs.json is rewritten by a regeneration that
// changed nothing. Reading the module in two far-apart zones is what proves it; asserting the
// committed numbers alone would pass on the one zone they were generated in.
test('the named cases hold the same values in every time zone', () => {
    const moduleUrl = new URL('../browser/matrix/dimensions.mjs', import.meta.url).href;
    const script = `
        const { NAMED_CASES } = await import(${JSON.stringify(moduleUrl)});
        process.stdout.write(JSON.stringify(NAMED_CASES));
    `;
    const inZone = (tz) => execFileSync(process.execPath, ['--input-type=module', '-e', script], {
        encoding: 'utf8',
        env: { ...process.env, TZ: tz }
    });
    assert.equal(inZone('UTC'), inZone('Pacific/Kiritimati'), 'a named case resolves against the local time zone');
});

// Bug caught: the generator stamping the current date into configs.json's header, so every
// regeneration rewrites the committed file and buries the change that was actually made.
test('the committed configs.json header names the seed alone, with no generation date', () => {
    const header = JSON.parse(readFileSync(new URL('../browser/matrix/configs.json', import.meta.url), 'utf8'))[0];
    assert.match(header._generated, /^seed \d+$/, 'the header must not carry a date');
    assert.equal(header._count, generate(1).length, 'the committed entry count must match a fresh generate(1)');
});
