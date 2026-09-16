/**
 * #877 browser suite -- the fifteen combination-matrix dimensions, their levels, the
 * impossible-combination predicates and the named cases, per
 * docs/2026-09-15-browser-suite-design.md, "Combination matrix".
 *
 * Consumed by generate-configs.mjs to build configs.json. Every level's apply(entry)
 * mutates entry = { config, attrs, extra, notes }; the fraction-to-value arithmetic
 * reuses test/browser/lib/scale.mjs (the same readme-derived oracle matrix.spec.mjs's
 * invariants use), on purpose: a level built here is never a re-implementation of the
 * plugin's own arithmetic, so a level always produces a config the readme allows
 * (from <= to, limits inside min..max, from/to on the documented scale) -- a matrix
 * test failing means the plugin disagrees with the readme, never that the level
 * mis-built its own config.
 */

import { rangeOf, scalePoint, isValuesMode } from '../lib/scale.mjs';

// ---------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------

/** A dimension level: `{ id, apply(entry) }`. */
function level(id, apply) {
    return { id, apply };
}

/** Strips float noise (e.g. 0.1 + 0.2) without rounding away an intentionally off-scale value. */
function clean(n) {
    return Math.round(n * 1e9) / 1e9;
}

/** The value at `fraction` of the config's effective range, snapped to the documented scale. */
function fractionOnScale(cfg, fraction) {
    const { min, max, step } = rangeOf(cfg);
    const k = Math.round((fraction * (max - min)) / step);
    return scalePoint(k, cfg);
}

// ---------------------------------------------------------------------------------------
// type -- readme settings table "type"; values mode uses fixed indexes per the design.
// ---------------------------------------------------------------------------------------

const type = [
    level('single', (entry) => {
        const cfg = entry.config;
        cfg.from = isValuesMode(cfg) ? 1 : fractionOnScale(cfg, 0.4);
    }),
    level('double', (entry) => {
        const cfg = entry.config;
        cfg.type = 'double';
        if (isValuesMode(cfg)) {
            cfg.from = 1;
            cfg.to = 3;
        } else {
            cfg.from = fractionOnScale(cfg, 0.3);
            cfg.to = fractionOnScale(cfg, 0.7);
        }
    })
];

// ---------------------------------------------------------------------------------------
// scale -- readme settings table "min"/"max"/"step"/"step_from_min".
// ---------------------------------------------------------------------------------------

const scale = [
    level('default', () => {}), // plugin defaults: 10..100 step 1
    level('0-100', (entry) => Object.assign(entry.config, { min: 0, max: 100, step: 1 })),
    level('neg', (entry) => Object.assign(entry.config, { min: -50, max: 50, step: 5 })),
    level('frac', (entry) => Object.assign(entry.config, { min: 0, max: 1, step: 0.1 })),
    level('half', (entry) => Object.assign(entry.config, { min: 0.5, max: 10.5, step: 1 })),
    level('big', (entry) => Object.assign(entry.config, { min: 0, max: 1000000, step: 1000 })),
    level('sfm', (entry) => Object.assign(entry.config, { min: 0.25, max: 9.75, step: 0.5, step_from_min: true }))
];

// ---------------------------------------------------------------------------------------
// values -- readme settings table "values"/"values_raw".
// ---------------------------------------------------------------------------------------

const values = [
    level('off', () => {}),
    level('numbers', (entry) => { entry.config.values = [10, 20, 30, 40, 50]; }),
    level('strings', (entry) => { entry.config.values = ['a', 'b', 'c', 'd', 'e']; }),
    level('numstr', (entry) => { entry.config.values = ['10', '20', '30', '40', '50']; }),
    level('numstr-raw', (entry) => {
        entry.config.values = ['10', '20', '30', '40', '50'];
        entry.config.values_raw = true;
    })
];

// ---------------------------------------------------------------------------------------
// limits -- readme settings table "from_min"/"from_max"/"to_min"/"to_max". `to` and
// `all` require double type (excluded otherwise below).
// ---------------------------------------------------------------------------------------

const limits = [
    level('none', () => {}),
    level('from', (entry) => {
        const cfg = entry.config;
        cfg.from_min = fractionOnScale(cfg, 0.25);
        cfg.from_max = fractionOnScale(cfg, 0.60);
    }),
    level('to', (entry) => {
        const cfg = entry.config;
        cfg.to_min = fractionOnScale(cfg, 0.40);
        cfg.to_max = fractionOnScale(cfg, 0.90);
    }),
    level('all', (entry) => {
        const cfg = entry.config;
        cfg.from_min = fractionOnScale(cfg, 0.25);
        cfg.from_max = fractionOnScale(cfg, 0.60);
        cfg.to_min = fractionOnScale(cfg, 0.40);
        cfg.to_max = fractionOnScale(cfg, 0.90);
    }),
    level('off-scale', (entry) => {
        const cfg = entry.config;
        const { min, step } = rangeOf(cfg);
        // Deliberately off the documented scale (2.4 steps from min is never a whole
        // number of steps), unlike every other limits level above.
        cfg.from_min = clean(min + 2.4 * step);
    })
];

// ---------------------------------------------------------------------------------------
// intervals -- readme settings table "min_interval"/"max_interval". Double type only
// (excluded with single below).
// ---------------------------------------------------------------------------------------

const intervals = [
    level('none', () => {}),
    level('min', (entry) => { entry.config.min_interval = clean(2 * rangeOf(entry.config).step); }),
    level('max', (entry) => { entry.config.max_interval = clean(6 * rangeOf(entry.config).step); }),
    level('locked', (entry) => {
        const w = clean(4 * rangeOf(entry.config).step);
        entry.config.min_interval = w;
        entry.config.max_interval = w;
    })
];

// ---------------------------------------------------------------------------------------
// fixed -- readme settings table "from_fixed"/"to_fixed". to_fixed is double only
// (excluded with single below).
// ---------------------------------------------------------------------------------------

const fixed = [
    level('none', () => {}),
    level('from_fixed', (entry) => { entry.config.from_fixed = true; }),
    level('to_fixed', (entry) => { entry.config.to_fixed = true; })
];

// ---------------------------------------------------------------------------------------
// drag ("interval drag" in the design table) -- readme settings table "drag_interval"/
// "drag_over_limit". Both are double only (excluded with single below).
// ---------------------------------------------------------------------------------------

const drag = [
    level('off', () => {}),
    level('drag_interval', (entry) => { entry.config.drag_interval = true; }),
    level('drag_over_limit', (entry) => { entry.config.drag_over_limit = true; }),
    level('both', (entry) => {
        entry.config.drag_interval = true;
        entry.config.drag_over_limit = true;
    })
];

// ---------------------------------------------------------------------------------------
// grid -- readme settings table "grid"/"grid_num"/"grid_snap"/"grid_margin".
// ---------------------------------------------------------------------------------------

const grid = [
    level('off', () => {}),
    level('num4', (entry) => { entry.config.grid = true; entry.config.grid_num = 4; }),
    level('num10', (entry) => { entry.config.grid = true; entry.config.grid_num = 10; }),
    level('snap', (entry) => { entry.config.grid = true; entry.config.grid_snap = true; }),
    level('no-margin', (entry) => { entry.config.grid = true; entry.config.grid_margin = false; })
];

// ---------------------------------------------------------------------------------------
// formatting -- readme settings table "prettify_enabled"/"prettify_separator"/
// "prettify"/"prettify_grid"/"prettify_min_max". configs.json is plain JSON, which
// cannot hold a function, so a custom prettify's SOURCE is stored as a string under
// config.__prettify_src (and, for the two-surface level, __prettify_grid_src /
// __prettify_min_max_src) for the matrix spec to inline -- the same split
// test/browser/lib/format.mjs documents for its own cfg.__prettify test-side copy.
// ---------------------------------------------------------------------------------------

const CUSTOM_PRETTIFY_SRC = 'function (n) { return n + "x"; }';
const CUSTOM_PRETTIFY_GRID_SRC = 'function (n) { return "g" + n; }';
const CUSTOM_PRETTIFY_MIN_MAX_SRC = 'function (n) { return "mm" + n; }';

const formatting = [
    level('default', () => {}),
    level('no-prettify', (entry) => { entry.config.prettify_enabled = false; }),
    level('sep-comma', (entry) => { entry.config.prettify_separator = ','; }),
    level('sep-empty', (entry) => { entry.config.prettify_separator = ''; }),
    level('custom', (entry) => {
        entry.config.__prettify_src = CUSTOM_PRETTIFY_SRC;
        entry.notes.push('prettify is a function; only its source is kept in config.__prettify_src (JSON cannot hold a function) for the matrix spec to inline.');
    }),
    level('surfaces', (entry) => {
        entry.config.__prettify_grid_src = CUSTOM_PRETTIFY_GRID_SRC;
        entry.config.__prettify_min_max_src = CUSTOM_PRETTIFY_MIN_MAX_SRC;
        entry.notes.push('prettify_grid/prettify_min_max are functions; only their source is kept in config.__prettify_grid_src / __prettify_min_max_src for the matrix spec to inline.');
    })
];

// ---------------------------------------------------------------------------------------
// decoration -- readme settings table "prefix"/"postfix"/"min_prefix"/"max_prefix"/
// "max_postfix"/"decorate_both"/"values_separator". decorate_both is double only
// (excluded with single below).
// ---------------------------------------------------------------------------------------

const decoration = [
    level('none', () => {}),
    level('prefix-postfix', (entry) => { entry.config.prefix = '$'; entry.config.postfix = 'k'; }),
    level('min-max-prefix', (entry) => {
        entry.config.min_prefix = 'From: ';
        entry.config.max_prefix = 'Up to: ';
        entry.config.max_postfix = '+';
    }),
    level('decorate-both-off', (entry) => {
        entry.config.decorate_both = false;
        entry.config.values_separator = ' to ';
    })
];

// ---------------------------------------------------------------------------------------
// visibility -- readme settings table "hide_min_max"/"hide_from_to"/"force_edges"/
// "from_shadow"/"to_shadow".
// ---------------------------------------------------------------------------------------

const visibility = [
    level('default', () => {}),
    level('hide-min-max', (entry) => { entry.config.hide_min_max = true; }),
    level('hide-from-to', (entry) => { entry.config.hide_from_to = true; }),
    level('force-edges', (entry) => { entry.config.force_edges = true; }),
    level('shadows', (entry) => {
        entry.config.from_shadow = true;
        if (entry.config.type === 'double') entry.config.to_shadow = true;
    })
];

// ---------------------------------------------------------------------------------------
// state -- readme settings table "disable"/"block"/"keyboard".
// ---------------------------------------------------------------------------------------

const state = [
    level('default', () => {}),
    level('disable', (entry) => { entry.config.disable = true; }),
    level('block', (entry) => { entry.config.block = true; }),
    level('no-keyboard', (entry) => { entry.config.keyboard = false; })
];

// ---------------------------------------------------------------------------------------
// skin -- readme settings table "skin".
// ---------------------------------------------------------------------------------------

const skin = ['flat', 'big', 'modern', 'round', 'sharp', 'square'].map(
    (name) => level(name, (entry) => { entry.config.skin = name; })
);

// ---------------------------------------------------------------------------------------
// route -- JS config (default); data-* attributes (every option with a Data-Attr twin
// in readme.md's settings table, lines 143-197 in this worktree; `scope` and the five
// callbacks have none and are never moved); the input `value` attribute for from/to.
// ---------------------------------------------------------------------------------------

/**
 * The config keys with a `data-*` twin: readme.md settings table, lines 145-191 (the
 * Data-Attr column). `scope` (line 192) and the five callbacks (lines 193-197) have
 * "-" there and so are never moved to attrs.
 */
const DATA_TWIN_KEYS = new Set([
    'skin', 'type', 'min', 'max', 'from', 'to', 'step', 'step_from_min',
    'min_interval', 'max_interval', 'drag_interval', 'drag_over_limit',
    'values', 'values_raw', 'from_fixed', 'from_min', 'from_max', 'from_shadow',
    'to_fixed', 'to_min', 'to_max', 'to_shadow',
    'prettify_enabled', 'prettify_separator', 'prettify', 'prettify_grid', 'prettify_min_max', 'prettify_all_values',
    'force_edges', 'keyboard', 'grid', 'grid_margin', 'grid_num', 'grid_snap',
    'hide_min_max', 'hide_from_to',
    'prefix', 'min_prefix', 'max_prefix', 'postfix', 'max_postfix',
    'decorate_both', 'values_separator', 'input_values_separator',
    'disable', 'block', 'extra_classes'
]);

function toDataAttrName(key) {
    return 'data-' + key.replace(/_/g, '-');
}

function toDataAttrValue(v) {
    if (Array.isArray(v)) return v.join(',');
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    return String(v);
}

const route = [
    level('js', () => {}),
    level('data', (entry) => {
        entry.attrs = entry.attrs || {};
        for (const key of Object.keys(entry.config)) {
            if (!DATA_TWIN_KEYS.has(key)) continue;
            const value = entry.config[key];
            if (typeof value === 'function') continue; // left in config, per the interface note
            entry.attrs[toDataAttrName(key)] = toDataAttrValue(value);
            delete entry.config[key];
        }
    }),
    level('value-attr', (entry) => {
        const cfg = entry.config;
        const sep = typeof cfg.input_values_separator === 'string' ? cfg.input_values_separator : ';';
        entry.attrs = entry.attrs || {};
        entry.attrs.value = cfg.to !== undefined ? `${cfg.from}${sep}${cfg.to}` : `${cfg.from}`;
        delete cfg.from;
        delete cfg.to;
    })
];

// ---------------------------------------------------------------------------------------
// container -- the fixture's `width`/`hidden`/`wrap` query params (test/fixtures/
// slider.html). 600 px is the fixture's own default, so that level is a no-op.
// ---------------------------------------------------------------------------------------

const container = [
    level('600', () => {}),
    level('300', (entry) => { entry.extra.width = '300'; }),
    level('hidden', (entry) => { entry.extra.hidden = '1'; }),
    level('flex', (entry) => { entry.extra.wrap = 'flex'; })
];

// ---------------------------------------------------------------------------------------
// DIMENSIONS -- keys ordered so a level can read what an earlier dimension already put
// in entry.config: values/scale before type (from/to fractions need the range), type
// before limits/intervals/fixed/drag/decoration/visibility (double-only levels read
// entry.config.type), everything before route (route reads the finished config), and
// container last (touches entry.extra only, no dependency on config).
// ---------------------------------------------------------------------------------------

export const DIMENSIONS = {
    values,
    scale,
    type,
    limits,
    intervals,
    fixed,
    drag,
    grid,
    formatting,
    decoration,
    visibility,
    state,
    skin,
    route,
    container
};

// ---------------------------------------------------------------------------------------
// EXCLUSIONS -- predicates over the picked `{ dimension: levelId }` map; true means the
// combination is impossible. Every predicate here reads at most two dimensions, which
// is what lets generate-configs.mjs treat "pair excluded" and "full candidate excluded"
// as the same check (see that file's isExcluded/requiredPairs).
// ---------------------------------------------------------------------------------------

// Every predicate is also evaluated against a *partial* two-key picked map (just the
// pair being tested, by requiredPairs()/pairsOf() below and by the independent check
// in test/unit/browser-matrix-generator.test.mjs), not only a full 15-key candidate.
// A clause written as `picked.x !== 'default-id'` is true when `picked.x` is simply
// absent from a partial map (undefined !== 'default-id'), which would wrongly exclude
// every pair that doesn't mention that dimension at all -- so every clause here checks
// presence (`!== undefined`) before checking the non-default condition, or (where
// possible) is written as an equality check against a specific non-default id, which
// is safe under a partial map on its own (undefined === 'to' is already false).
export const EXCLUSIONS = [
    // readme: min_interval/max_interval are "Double type only".
    (picked) => picked.type === 'single' && picked.intervals !== undefined && picked.intervals !== 'none',
    // readme: drag_interval and drag_over_limit are both "Double type only".
    (picked) => picked.type === 'single' && picked.drag !== undefined && picked.drag !== 'off',
    // readme: to_min/to_max only affect a `to` handle that doesn't exist in single type.
    (picked) => picked.type === 'single' && (picked.limits === 'to' || picked.limits === 'all'),
    // readme: to_fixed fixes a `to` handle that doesn't exist in single type.
    (picked) => picked.type === 'single' && picked.fixed === 'to_fixed',
    // readme: decorate_both is "Double type only".
    (picked) => picked.type === 'single' && picked.decoration === 'decorate-both-off',
    // readme "values": min/max/step are replaced by 0, values.length - 1 and 1, so a
    // custom scale (including the step_from_min level 'sfm') would be silently
    // discarded -- not a real combination. The default scale level is a no-op and so
    // is the only one that combines with a values level.
    (picked) => picked.values !== undefined && picked.values !== 'off' && picked.scale !== undefined && picked.scale !== 'default',
    // values_raw only makes sense paired with numeric-looking string entries. This is
    // structurally guaranteed by the `values` level design above (numstr-raw is the
    // only level that sets values_raw, and it never combines with a different values
    // level in the same candidate), so this predicate can never fire; it is kept so
    // the exclusion the design calls out stays documented and grep-able here.
    () => false
];

// ---------------------------------------------------------------------------------------
// NAMED_CASES -- the 34 site demo inits (website/src/a/plugins/ion.rangeSlider/res/
// page_demo.js, page_demo_adv.js, page_demo_int.js; those three files use CRLF line
// endings, unrelated to this file), `skin` and every callback dropped, everything else
// kept; plus 7 hand-picked edge cases. Function-valued options (prettify and friends)
// are captured as __*_src source strings for the same JSON-safety reason the `custom`
// and `surfaces` formatting levels above use.
// ---------------------------------------------------------------------------------------

// page_demo.js #demo_5: custom_values.indexOf(10) and .indexOf(10000), resolved here
// since the site demo computes them from a shared array at runtime.
const PAGE_DEMO_CUSTOM_VALUES = [0, 10, 100, 1000, 10000, 100000, 1000000];

// page_demo_adv.js #demo_4: dateToTS(new Date(year, month, day)) with year = 2018,
// resolved the same way the site demo computes it (date.valueOf(), local time zone).
function dateToTS(y, m, d) {
    return new Date(y, m, d).valueOf();
}

export const NAMED_CASES = [
    // ---- page_demo.js (13 inits) ----
    { name: 'demo:page_demo:demo_0', config: { min: 100, max: 1000, from: 550 } },
    { name: 'demo:page_demo:demo_1', config: { type: 'double', grid: true, min: 0, max: 1000, from: 200, to: 800, prefix: '$' } },
    { name: 'demo:page_demo:demo_2', config: { type: 'double', grid: true, min: -1000, max: 1000, from: -500, to: 500 } },
    { name: 'demo:page_demo:demo_3', config: { type: 'double', grid: true, min: -1000, max: 1000, from: -500, to: 500, step: 250 } },
    { name: 'demo:page_demo:demo_4', config: { type: 'double', grid: true, min: -12.8, max: 12.8, from: -3.2, to: 3.2, step: 0.1 } },
    {
        name: 'demo:page_demo:demo_5',
        config: {
            type: 'double',
            grid: true,
            from: PAGE_DEMO_CUSTOM_VALUES.indexOf(10),
            to: PAGE_DEMO_CUSTOM_VALUES.indexOf(10000),
            values: PAGE_DEMO_CUSTOM_VALUES.slice(),
            force_edges: true
        },
        notes: ['from/to are custom_values.indexOf(10) and .indexOf(10000) in the site demo, resolved here to 1 and 4.']
    },
    {
        name: 'demo:page_demo:demo_6',
        config: {
            grid: true,
            from: new Date().getMonth(),
            values: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
            force_edges: true
        },
        notes: ['from is new Date().getMonth() in the site demo -- always a valid 0..11 index, but this named case is time-dependent: regenerating configs.json on a different month changes it.']
    },
    { name: 'demo:page_demo:demo_7', config: { grid: true, min: 1000, max: 1000000, from: 100000, step: 1000, prettify_enabled: true } },
    {
        name: 'demo:page_demo:demo_8',
        config: {
            grid: true,
            min: 1,
            max: 1024,
            from: 256,
            __prettify_src: 'function my_prettify (n) {\n    var num = Math.log2(n);\n    return n + " -> " + (+num.toFixed(3));\n}'
        },
        notes: ['prettify was the function my_prettify; only its source is kept in config.__prettify_src for the matrix spec to inline. The site demo\'s "&rarr;" HTML entity is written here as a plain arrow since this is a plain string, not HTML.']
    },
    { name: 'demo:page_demo:demo_9', config: { grid: true, min: 0, max: 100, from: 50, step: 5, max_postfix: '+', prefix: '$' } },
    { name: 'demo:page_demo:demo_10', config: { grid: true, min: 0, max: 100, from: 21, max_postfix: '+', prefix: 'Age: ', postfix: ' years' } },
    { name: 'demo:page_demo:demo_11', config: { type: 'double', grid: true, min: 0, max: 100, from: 47, to: 53, prefix: 'Weight: ', postfix: ' million pounds' } },
    { name: 'demo:page_demo:demo_12', config: { type: 'double', grid: true, min: -100000, max: 100000, from: -100000, to: 50000, step: 10000 } },

    // ---- page_demo_adv.js (15 inits) ----
    { name: 'demo:page_demo_adv:demo_0', config: { min: 0, max: 10000, from: 777, step: 1, grid: true, grid_num: 4, grid_snap: false } },
    { name: 'demo:page_demo_adv:demo_1', config: { type: 'double', min: 0, max: 10, from: 2, to: 8, grid: true, grid_snap: true, from_fixed: false, to_fixed: false } },
    { name: 'demo:page_demo_adv:demo_2', config: { type: 'single', min: 0, max: 1000, from: 500, grid: true, from_min: 250, from_max: 750, from_shadow: true } },
    {
        name: 'demo:page_demo_adv:demo_3',
        config: { type: 'double', min: 0, max: 1000, from: 400, to: 600, drag_interval: true, min_interval: null, max_interval: null }
    },
    {
        name: 'demo:page_demo_adv:demo_4',
        config: {
            type: 'double',
            force_edges: true,
            grid: true,
            grid_num: 2,
            min: dateToTS(2018, 10, 1),
            max: dateToTS(2018, 11, 1),
            from: dateToTS(2018, 10, 8),
            to: dateToTS(2018, 10, 23),
            __prettify_src: 'function tsToDate (ts) {\n    var d = new Date(ts);\n    return d.toLocaleDateString(lang, { year: "numeric", month: "long", day: "numeric" });\n}'
        },
        notes: [
            'min/max/from/to are dateToTS(new Date(year, month, day)) with year = 2018 in the site demo, resolved here with Date#valueOf() (local time zone, same as the site demo).',
            'prettify was the function tsToDate; only its source is kept in config.__prettify_src. It closes over the demo page\'s `lang` variable, which does not exist once inlined elsewhere -- Task 6\'s concern, not this generator\'s.'
        ]
    },
    { name: 'demo:page_demo_adv:demo_5', config: { type: 'double', min: 0, max: 100, from: 20, to: 80, min_prefix: 'From: ', max_prefix: 'Up to: ' } },
    // prettify here is already a string (a global function name), not a function value -- no __prettify_src needed.
    { name: 'demo:page_demo_adv:demo_6', config: { min: 0, max: 40, from: 21, prettify: 'global_prettify_demo' } },
    {
        name: 'demo:page_demo_adv:demo_7',
        config: {
            grid: true,
            values: [1, 5, 10, 25, 'Ask for a quote'],
            from: 4,
            __prettify_src: 'function weight_tier_prettify (v) {\n    return typeof v === "number" ? v + " kg" : v;\n}',
            prettify_all_values: true
        },
        notes: ['prettify was the function weight_tier_prettify; only its source is kept in config.__prettify_src.']
    },
    {
        name: 'demo:page_demo_adv:demo_8',
        config: {
            type: 'double',
            grid: true,
            min: 0,
            max: 1000000,
            from: 250000,
            to: 750000,
            __prettify_grid_src: 'function shrink_to_k (n) {\n    return (n / 1000) + "k";\n}',
            __prettify_min_max_src: 'function label_limit (n) {\n    return "Limit " + n;\n}'
        },
        notes: ['prettify_grid/prettify_min_max were the functions shrink_to_k/label_limit; only their source is kept in config.__prettify_grid_src / __prettify_min_max_src.']
    },
    { name: 'demo:page_demo_adv:demo_9', config: { type: 'double', min: 0, max: 100, from: 20, to: 80, from_min: 10, from_max: 40, to_min: 60, to_max: 90 } },
    { name: 'demo:page_demo_adv:demo_10', config: { type: 'double', min: 0, max: 100, from: 30, to: 70, drag_over_limit: true } },
    { name: 'demo:page_demo_adv:demo_11', config: { type: 'double', min: 0, max: 100, from: 30, to: 70, drag_over_limit: false } },
    { name: 'demo:page_demo_adv:demo_12', config: { type: 'double', min: 0, max: 100, from: 30, to: 70 } },
    { name: 'demo:page_demo_adv:demo_13', config: { min: 0.5, max: 10.5, step: 1, from: 2.5, grid: true, step_from_min: true } },
    { name: 'demo:page_demo_adv:demo_14', config: { values: ['17.5', '12.2b', '20.0'], from: 2, values_raw: true } },

    // ---- page_demo_int.js (6 inits) ----
    { name: 'demo:page_demo_int:demo_0', config: { min: 0, max: 10, from: 5 } },
    { name: 'demo:page_demo_int:demo_1', config: { type: 'double', min: 0, max: 10000, from: 5000, to: 8000 } },
    {
        name: 'demo:page_demo_int:demo_2',
        config: { type: 'double', values: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], from: 1, to: 10 }
    },
    { name: 'demo:page_demo_int:demo_3', config: { min: 0, max: 10000, from: 5000 } },
    { name: 'demo:page_demo_int:demo_4', config: { type: 'double', min: 0, max: 10000, from: 4000, to: 6000 } },
    { name: 'demo:page_demo_int:demo_5', config: { type: 'double', min: 0, max: 10, from: 4, to: 6, grid: true, step: 2 } },

    // ---- edge cases (7) ----
    { name: 'edge:coincident', config: { type: 'double', min: 0, max: 100, from: 50, to: 50 } },
    { name: 'edge:one-step', config: { min: 0, max: 1, step: 1 } },
    { name: 'edge:from-above-to', config: { type: 'double', min: 0, max: 100, from: 80, to: 20 } },
    { name: 'edge:min-eq-max', config: { min: 5, max: 5 } },
    { name: 'edge:step-gt-range', config: { min: 0, max: 10, step: 25 } },
    { name: 'edge:huge', config: { min: 0, max: 1e9, step: 1 } },
    { name: 'edge:tiny', config: { min: 0, max: 0.001, step: 0.0001 } }
];
