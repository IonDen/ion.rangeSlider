import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INVARIANTS, checkInvariants } from '../browser/lib/invariants.mjs';
import { KNOWN_BUGS, matchKnownBug } from '../browser/lib/known-bugs.mjs';

// #877: the thirteen readme invariants, fed hand-built State objects. Every failing
// fixture below is a state a one-line plugin change could really produce, and the
// matching passing fixture is the state the readme promises instead, so each test
// names the bug it catches in its comment.

const box = (x, width) => ({ x, y: 100, width, height: 20 });

/** Deep merge of plain objects; arrays and primitives replace. */
function merge(target, over) {
    const out = Array.isArray(target) ? target.slice() : { ...target };
    for (const key of Object.keys(over || {})) {
        const value = over[key];
        const current = out[key];
        const bothPlain = value && typeof value === 'object' && !Array.isArray(value)
            && current && typeof current === 'object' && !Array.isArray(current);
        out[key] = bothPlain ? merge(current, value) : value;
    }
    return out;
}

/** A healthy single-type State: 0..100 step 1, from 30, no grid, nothing hidden. */
function base(over = {}) {
    return merge({
        input: { value: '30', disabled: false, dataFrom: 30, dataTo: null, classes: ['irs-hidden-input'] },
        container: { exists: true, classes: ['irs', 'irs--flat', 'js-irs-0'] },
        labels: {
            single: { text: '30', visible: true },
            from: { text: '', visible: false },
            to: { text: '', visible: false },
            min: { text: '0', visible: true },
            max: { text: '100', visible: true }
        },
        handles: { single: { box: box(180, 16), classes: ['irs-handle', 'single'] } },
        line: box(0, 600),
        bar: null,
        shadows: {},
        grid: { present: false, texts: [], visibleTexts: [], pols: 0 },
        mask: false,
        events: [],
        values: { from: 30, to: null }
    }, over);
}

/** A healthy double-type State: 0..100 step 1, from 20, to 40, both labels shown. */
function doubleState(over = {}) {
    const state = base({
        input: { value: '20;40', dataFrom: 20, dataTo: 40 },
        labels: {
            single: { text: '20 — 40', visible: false },
            from: { text: '20', visible: true },
            to: { text: '40', visible: true }
        },
        values: { from: 20, to: 40 }
    });
    state.handles = {
        from: { box: box(120, 16), classes: ['irs-handle', 'from'] },
        to: { box: box(240, 16), classes: ['irs-handle', 'to'] }
    };
    state.bar = box(128, 120);
    return merge(state, over);
}

const SINGLE = { min: 0, max: 100, step: 1 };
const DOUBLE = { type: 'double', min: 0, max: 100, step: 1 };

const ctxOf = (state, cfg, stage = 'S1', prev = null, expectations = {}) => ({ state, cfg, stage, prev, expectations });
const ids = (ctx) => checkInvariants(ctx).map((f) => f.id);

/** One recorded callback entry in the fixture's shape (test/fixtures/slider.html). */
const cb = (type, over = {}) => ({
    type, which: 1, from: 30, to: null, min: 0, max: 100,
    from_percent: 30, to_percent: 0, from_value: null, to_value: null,
    from_min: null, from_max: null, to_min: null, to_max: null,
    from_pretty: '30', to_pretty: '', min_pretty: '0', max_pretty: '100',
    ...over
});

const INIT_EVENTS = [cb('onStart'), cb('onInit')];

// ------------------------------------------------------------------ structure

// Task 6 iterates this exact id list to retire register entries, so a renamed or
// dropped invariant must be visible here.
// Bug caught: exporting twelve invariants, or one without its readme citation.
test('INVARIANTS carries the thirteen documented ids, each with a readme citation', () => {
    assert.deepEqual(INVARIANTS.map((i) => i.id), [
        'bounds', 'scale', 'limits', 'intervals', 'fixed', 'input', 'labels',
        'grid', 'dom', 'callbacks', 'keys', 'inert', 'destroy'
    ]);
    for (const inv of INVARIANTS) {
        assert.equal(typeof inv.check, 'function', `${inv.id} needs a check()`);
        assert.ok(inv.readme && inv.readme.length > 20, `${inv.id} needs its readme citation`);
    }
});

// Bug caught: an invariant that fires on a healthy slider would make every matrix
// entry red and the suite useless.
test('a healthy slider reports nothing at S0 or after a drag', () => {
    assert.deepEqual(checkInvariants(ctxOf(base({ events: INIT_EVENTS }), SINGLE, 'S0', null, { changed: false })), []);

    const prev = base({ input: { value: '20', dataFrom: 20 }, labels: { single: { text: '20' } }, values: { from: 20 }, events: INIT_EVENTS });
    const state = base({ events: [...INIT_EVENTS, cb('onChange'), cb('onFinish')] });
    assert.deepEqual(checkInvariants(ctxOf(state, { min: 0, max: 100, step: 10 }, 'S1', prev, { changed: true, handle: 'single' })), []);
});

// checkInvariants is the only entry point the matrix spec uses; its shape is part of
// the contract (matrix.spec.mjs reads f.id and f.message).
// Bug caught: returning bare strings instead of { id, message } entries.
test('checkInvariants returns { id, message } entries naming the stage', () => {
    const failures = checkInvariants(ctxOf(base({ values: { from: 101 }, input: { value: '101', dataFrom: 101 }, labels: { single: { text: '101' } } }), SINGLE, 'S3'));
    const bounds = failures.find((f) => f.id === 'bounds');
    assert.ok(bounds, 'bounds should be reported');
    assert.match(bounds.message, /^bounds: /);
    assert.match(bounds.message, /after S3$/);
});

// --------------------------------------------------------------------- bounds

// readme settings table: min "Minimum value", max "Maximum value".
// Bug caught: dropping the max clamp in validate(), so a drag can overshoot.
test('bounds: a from above max is reported, a from at max is not', () => {
    const at = base({ values: { from: 100 }, input: { value: '100', dataFrom: 100 }, labels: { single: { text: '100' } } });
    assert.ok(!ids(ctxOf(at, SINGLE, 'S1')).includes('bounds'));

    const over = base({ values: { from: 101 }, input: { value: '101', dataFrom: 101 }, labels: { single: { text: '101' } } });
    assert.ok(ids(ctxOf(over, SINGLE, 'S1')).includes('bounds'));
});

// readme settings table: from is "the left one", to "the right one".
// Bug caught: removing the from <= to resolution, so the handles cross.
test('bounds: from above to in double type is reported', () => {
    const crossed = doubleState({ values: { from: 60, to: 40 }, input: { value: '60;40', dataFrom: 60, dataTo: 40 }, labels: { from: { text: '60' }, to: { text: '40' } } });
    assert.ok(ids(ctxOf(crossed, DOUBLE, 'S2')).includes('bounds'));
});

// ---------------------------------------------------------------------- scale

// readme note "step": every value is min plus whole steps.
// Bug caught: the fake/real percent mix-up that lands a dragged handle off the step
// grid (the #696/#825 family).
test('scale: a dragged value off the step grid is reported, one on it is not', () => {
    const cfg = { min: 0, max: 100, step: 10 };
    const prev = base({ values: { from: 20 }, input: { value: '20', dataFrom: 20 }, labels: { single: { text: '20' } }, events: INIT_EVENTS });
    const onGrid = base({ events: [...INIT_EVENTS, cb('onChange'), cb('onFinish')] });
    assert.ok(!ids(ctxOf(onGrid, cfg, 'S1', prev, { changed: true })).includes('scale'));

    const offGrid = base({
        values: { from: 33 }, input: { value: '33', dataFrom: 33 }, labels: { single: { text: '33' } },
        events: [...INIT_EVENTS, cb('onChange', { from: 33, from_pretty: '33' }), cb('onFinish', { from: 33, from_pretty: '33' })]
    });
    assert.ok(ids(ctxOf(offGrid, cfg, 'S1', prev, { changed: true })).includes('scale'));
});

// The architecture reference and the #742 fix make this explicit: validate() clamps
// but never step-snaps, so an off-grid starting value survives until the first
// interaction, and reset() puts it back. Reporting either would be a false alarm.
// Bug caught: running the scale rule at init (the S0 case) or on a reset (the S7
// case) instead of only on what an interaction produced.
test('scale: an off-grid starting value is not reported at S0, nor after reset()', () => {
    const cfg = { min: 0, max: 100, step: 10 };
    const offGrid = base({
        values: { from: 33 }, input: { value: '33', dataFrom: 33 }, labels: { single: { text: '33' } }, events: INIT_EVENTS
    });
    assert.ok(!ids(ctxOf(offGrid, cfg, 'S0', null, { changed: false })).includes('scale'));

    const beforeReset = base({ values: { from: 50 }, input: { value: '50', dataFrom: 50 }, labels: { single: { text: '50' } }, events: INIT_EVENTS });
    const afterReset = base({
        values: { from: 33 }, input: { value: '33', dataFrom: 33 }, labels: { single: { text: '33' } },
        events: [...INIT_EVENTS, cb('onUpdate', { from: 33, from_pretty: '33', from_percent: 33 })]
    });
    assert.ok(!ids(ctxOf(afterReset, cfg, 'S7', beforeReset, { update: true })).includes('scale'));
});

// --------------------------------------------------------------------- limits

// readme settings table: from_min "Minimum limit for the from handle", from_max,
// to_min, to_max.
// Bug caught: comparing the wrong handle in the clamp, the #831 bug.
test('limits: a from below from_min is reported, a from at from_min is not', () => {
    const cfg = { min: 0, max: 100, step: 1, from_min: 20 };
    const at = base({ values: { from: 20 }, input: { value: '20', dataFrom: 20 }, labels: { single: { text: '20' } } });
    assert.ok(!ids(ctxOf(at, cfg, 'S1')).includes('limits'));

    const below = base({ values: { from: 19 }, input: { value: '19', dataFrom: 19 }, labels: { single: { text: '19' } } });
    assert.ok(ids(ctxOf(below, cfg, 'S1')).includes('limits'));
});

// Bug caught: applying to_max to `from` (the pre-#831 code did exactly that).
test('limits: a to above to_max is reported', () => {
    const cfg = { type: 'double', min: 0, max: 100, step: 1, to_max: 30 };
    const over = doubleState();
    assert.ok(ids(ctxOf(over, cfg, 'S2')).includes('limits'));
});

// ------------------------------------------------------------------ intervals

// readme settings table: min_interval "Smallest interval between the handles",
// max_interval "Largest interval between the handles".
// Bug caught: dropping checkMinInterval, so the handles can close past the limit.
test('intervals: a gap under min_interval is reported, a gap at it is not', () => {
    const cfg = { type: 'double', min: 0, max: 100, step: 1, min_interval: 20 };
    assert.ok(!ids(ctxOf(doubleState(), cfg, 'S2')).includes('intervals'));

    const tight = doubleState({ values: { to: 25 }, input: { value: '20;25', dataTo: 25 }, labels: { to: { text: '25' } } });
    assert.ok(ids(ctxOf(tight, cfg, 'S2')).includes('intervals'));
});

// Bug caught: dropping checkMaxInterval, so the interval can grow past the limit.
test('intervals: a gap over max_interval is reported', () => {
    const cfg = { type: 'double', min: 0, max: 100, step: 1, max_interval: 10 };
    assert.ok(ids(ctxOf(doubleState(), cfg, 'S2')).includes('intervals'));
});

// #877: readme settings table, drag_interval: "Let the user drag the whole interval by
// its bar. Double type only" -- the bar moves the pair, so the interval keeps the width
// it had before the drag. A limit stops both handles together; one handle stopping
// while the other keeps following the pointer is the stretch this reports.
// Bug caught: the "both" branch clamping each handle on its own, so a bar drag against
// from_max leaves from behind and stretches the interval (the trailing-edge stretch).
test('intervals: a bar drag keeps the interval width', () => {
    const cfg = { type: 'double', min: 0, max: 100, step: 5, drag_interval: true, from_max: 30 };
    const prev = doubleState();                                   // 20 to 40, width 20
    const withPair = (from, to) => doubleState({
        values: { from, to },
        input: { value: `${from};${to}`, dataFrom: from, dataTo: to },
        labels: { from: { text: String(from) }, to: { text: String(to) } }
    });

    const together = withPair(25, 45);
    assert.ok(!ids(ctxOf(together, cfg, 'S5', prev, { bar: true, changed: true })).includes('intervals'));

    const stopped = withPair(30, 50);                             // both stopped at from_max
    assert.ok(!ids(ctxOf(stopped, cfg, 'S5', prev, { bar: true, changed: true })).includes('intervals'));

    const stretched = withPair(30, 60);                           // from stopped, to ran on
    assert.ok(ids(ctxOf(stretched, cfg, 'S5', prev, { bar: true, changed: true })).includes('intervals'));

    // A handle drag is free to change the width: only the bar drag stage is judged.
    assert.ok(!ids(ctxOf(stretched, cfg, 'S2', prev, { changed: true, handle: 'to' })).includes('intervals'));
});

// ---------------------------------------------------------------------- fixed

// readme settings table: from_fixed "Fix the position of the from handle".
// Bug caught: forgetting the from_fixed/to_fixed guard on a handle path (the #825
// review finding).
test('fixed: a moved from_fixed handle is reported, an unmoved one is not', () => {
    const cfg = { type: 'double', min: 0, max: 100, step: 1, from_fixed: true };
    const prev = doubleState();
    const moved_to_only = doubleState({ values: { to: 70 }, input: { value: '20;70', dataTo: 70 }, labels: { to: { text: '70' } } });
    assert.ok(!ids(ctxOf(moved_to_only, cfg, 'S2', prev, { changed: true })).includes('fixed'));

    const moved_from = doubleState({ values: { from: 30 }, input: { value: '30;40', dataFrom: 30 }, labels: { from: { text: '30' } } });
    assert.ok(ids(ctxOf(moved_from, cfg, 'S1', prev, { changed: false })).includes('fixed'));
});

// ---------------------------------------------------------------------- input

// readme settings table: input_values_separator "Separator in the input value in
// double type: <input value="25;42">".
// Bug caught: writing only `from` to the input in double type.
test('input: a double slider input must carry both values with the separator', () => {
    assert.ok(!ids(ctxOf(doubleState(), DOUBLE, 'S2')).includes('input'));

    const halved = doubleState({ input: { value: '20' } });
    assert.ok(ids(ctxOf(halved, DOUBLE, 'S2')).includes('input'));
});

// Bug caught: ignoring input_values_separator when writing the value back.
test('input: a custom input_values_separator is honoured', () => {
    const cfg = { ...DOUBLE, input_values_separator: '-' };
    const dashed = doubleState({ input: { value: '20-40' } });
    assert.ok(!ids(ctxOf(dashed, cfg, 'S2')).includes('input'));
    assert.ok(ids(ctxOf(doubleState(), cfg, 'S2')).includes('input'));
});

// readme "Callback data": the input carries raw values, the labels carry the
// prettified ones.
// Bug caught: writing the prettified text into the input.
test('input: a prettified value in the input is reported', () => {
    const cfg = { min: 0, max: 100000, step: 1 };
    const pretty = base({
        values: { from: 10000 }, input: { value: '10 000', dataFrom: 10000 },
        labels: { single: { text: '10 000' }, max: { text: '100 000' } }
    });
    assert.ok(ids(ctxOf(pretty, cfg, 'S1')).includes('input'));
});

// Bug caught: writeToInput no longer updating the jQuery data the plugin exposes.
test('input: data-from out of step with the value is reported', () => {
    const stale = base({ input: { dataFrom: 20 } });
    assert.ok(ids(ctxOf(stale, SINGLE, 'S1')).includes('input'));
});

// --------------------------------------------------------------------- labels

// readme settings table: prefix/postfix and the prettify options decide the label
// text; hide_from_to "Hide the from and to value labels".
// Bug caught: decorating the label with the wrong value.
test('labels: a single label that does not match the decorated value is reported', () => {
    const cfg = { min: 0, max: 100, step: 1, prefix: '$' };
    const right = base({ labels: { single: { text: '$30' }, min: { text: '$0' }, max: { text: '$100' } } });
    assert.ok(!ids(ctxOf(right, cfg, 'S1')).includes('labels'));

    const wrong = base({ labels: { single: { text: '30' }, min: { text: '$0' }, max: { text: '$100' } } });
    assert.ok(ids(ctxOf(wrong, cfg, 'S1')).includes('labels'));
});

// Bug caught: hide_from_to hiding only the merged label.
test('labels: a visible value label with hide_from_to is reported', () => {
    const cfg = { min: 0, max: 100, step: 1, hide_from_to: true };
    const hidden = base({ labels: { single: { visible: false } } });
    assert.ok(!ids(ctxOf(hidden, cfg, 'S1')).includes('labels'));
    assert.ok(ids(ctxOf(base(), cfg, 'S1')).includes('labels'));
});

// readme settings table: values_separator and decorate_both describe the merged
// label, which replaces the from/to pair when they collide.
// Bug caught: showing the merged label and the pair at the same time.
test('labels: in double type exactly one of the merged label and the pair is visible', () => {
    assert.ok(!ids(ctxOf(doubleState(), DOUBLE, 'S2')).includes('labels'));

    const merged = doubleState({ labels: { single: { visible: true }, from: { visible: false }, to: { visible: false } } });
    assert.ok(!ids(ctxOf(merged, DOUBLE, 'S2')).includes('labels'));

    const both = doubleState({ labels: { single: { visible: true } } });
    assert.ok(ids(ctxOf(both, DOUBLE, 'S2')).includes('labels'));

    const none = doubleState({ labels: { from: { visible: false }, to: { visible: false } } });
    assert.ok(ids(ctxOf(none, DOUBLE, 'S2')).includes('labels'));
});

// #877 n035/n037. With the two handles on the same value the plugin draws the from
// label alone: the to label is hidden behind it and the merged label, though it holds
// "50 - 50", is hidden too. Characterization -- the readme describes the merged label
// for handles that collide but says nothing about handles that sit on one value, and a
// zero-width interval showing one number is a defensible reading. The rule accepts it
// only while from equals to, and still pins the text.
// Bug caught: accepting a lone from label on a slider whose handles are apart (a to
// label that stopped rendering would go unreported), or accepting any text in it.
test('labels: with from equal to to the lone from label is accepted, with its own text', () => {
    const coincident = (fromText) => doubleState({
        input: { value: '50;50', dataFrom: 50, dataTo: 50 },
        labels: {
            single: { text: '50 — 50', visible: false },
            from: { text: fromText, visible: true },
            to: { text: '50', visible: false }
        },
        values: { from: 50, to: 50 }
    });
    assert.ok(!ids(ctxOf(coincident('50'), DOUBLE, 'S0')).includes('labels'));
    assert.ok(ids(ctxOf(coincident('51'), DOUBLE, 'S0')).includes('labels'), 'the lone from label must still read the from value');

    // Handles apart: a single visible from label is still the "neither" case.
    const apart = doubleState({ labels: { to: { visible: false } } });
    assert.ok(ids(ctxOf(apart, DOUBLE, 'S2')).includes('labels'));

    // Coincident handles with nothing visible at all stay a finding.
    const blank = doubleState({
        input: { value: '50;50', dataFrom: 50, dataTo: 50 },
        labels: { single: { visible: false }, from: { text: '50', visible: false }, to: { visible: false } },
        values: { from: 50, to: 50 }
    });
    assert.ok(ids(ctxOf(blank, DOUBLE, 'S0')).includes('labels'));
});

// Bug caught: merging with the wrong separator, or decorating only one side.
test('labels: the merged label text follows values_separator and decorate_both', () => {
    const cfg = { ...DOUBLE, prefix: '$', values_separator: ' to ', decorate_both: true };
    const good = doubleState({ labels: { single: { text: '$20 to $40', visible: true }, from: { visible: false }, to: { visible: false }, min: { text: '$0' }, max: { text: '$100' } } });
    assert.ok(!ids(ctxOf(good, cfg, 'S2')).includes('labels'));

    const bad = doubleState({ labels: { single: { text: '$20 — $40', visible: true }, from: { visible: false }, to: { visible: false }, min: { text: '$0' }, max: { text: '$100' } } });
    assert.ok(ids(ctxOf(bad, cfg, 'S2')).includes('labels'));
});

// readme settings table: hide_min_max "Hide the min and max labels". A min or max
// label the plugin hides under a value label is allowed; wrong text is not.
// Bug caught: routing the min label through the wrong prettify surface.
test('labels: min and max follow hide_min_max, and a visible min label must read the decorated min', () => {
    const cfg = { min: 0, max: 100, step: 1, hide_min_max: true };
    assert.ok(ids(ctxOf(base(), cfg, 'S1')).includes('labels'));

    const hidden = base({ labels: { min: { visible: false }, max: { visible: false } } });
    assert.ok(!ids(ctxOf(hidden, cfg, 'S1')).includes('labels'));

    const covered = base({ labels: { min: { text: '0', visible: false } } });
    assert.ok(!ids(ctxOf(covered, SINGLE, 'S1')).includes('labels'));

    const wrongMin = base({ labels: { min: { text: '1' } } });
    assert.ok(ids(ctxOf(wrongMin, SINGLE, 'S1')).includes('labels'));
});

// ----------------------------------------------------------------------- grid

// readme settings table: grid "Show the value grid below the slider"; grid_num
// "Number of grid units the value range is cut into, at most 50".
// Bug caught: appendGrid drawing grid_num labels instead of grid_num + 1.
test('grid: the default four units give five labels at the unit boundaries', () => {
    const cfg = { min: 0, max: 100, step: 1, grid: true };
    const texts = ['0', '25', '50', '75', '100'];
    const good = base({ grid: { present: true, texts, visibleTexts: texts, pols: 21 } });
    assert.ok(!ids(ctxOf(good, cfg, 'S0')).includes('grid'));

    const short = base({ grid: { present: true, texts: texts.slice(1), visibleTexts: texts.slice(1), pols: 21 } });
    assert.ok(ids(ctxOf(short, cfg, 'S0')).includes('grid'));

    const skewed = base({ grid: { present: true, texts: ['0', '26', '50', '75', '100'], visibleTexts: [], pols: 21 } });
    assert.ok(ids(ctxOf(skewed, cfg, 'S0')).includes('grid'));
});

// Bug caught: rendering the grid without the grid option, or swallowing it with it.
test('grid: present only with grid: true', () => {
    assert.ok(ids(ctxOf(base({ grid: { present: true } }), SINGLE, 'S0')).includes('grid'));
    assert.ok(ids(ctxOf(base(), { ...SINGLE, grid: true }, 'S0')).includes('grid'));
});

// readme settings table: grid_snap "Use one grid unit per step instead of grid_num.
// Still capped at 50 units".
// Bug caught: keeping grid_num while grid_snap is on.
test('grid: grid_snap gives one unit per step, capped at 50', () => {
    const snap = { min: 0, max: 100, step: 10, grid: true, grid_snap: true };
    const texts = ['0', '10', '20', '30', '40', '50', '60', '70', '80', '90', '100'];
    assert.ok(!ids(ctxOf(base({ grid: { present: true, texts, visibleTexts: texts, pols: 11 } }), snap, 'S0')).includes('grid'));

    const capped = { min: 0, max: 500, step: 1, grid: true, grid_snap: true };
    const capTexts = Array.from({ length: 51 }, (_, i) => String(i * 10));
    assert.ok(!ids(ctxOf(base({ grid: { present: true, texts: capTexts, visibleTexts: capTexts, pols: 51 } }), capped, 'S0')).includes('grid'));
    assert.ok(ids(ctxOf(base({ grid: { present: true, texts: capTexts.slice(0, 50), visibleTexts: [], pols: 51 } }), capped, 'S0')).includes('grid'));
});

// #877 B1. readme settings table: prefix/postfix/min_prefix/max_prefix/max_postfix
// are all documented "for values"; the grid rows say nothing about decoration, and the
// plugin draws its ticks through the prettify chain alone (with prefix "$" and postfix
// "k" the min/max labels read "$0k"/"$100k" while the grid reads 0, 25, 50, 75, 100).
// Characterization: the readme does not say whether grid labels are decorated; the
// plugin never has.
// Bug caught: running a grid label through decorate(), which reds every decorated
// entry of the matrix against labels the plugin never draws that way.
test('grid: the tick labels are prettified but not decorated', () => {
    const cfg = { min: 0, max: 100, step: 1, grid: true, prefix: '$', postfix: 'k', max_postfix: '+', min_prefix: 'From: ', max_prefix: 'Up to: ' };
    const plain = ['0', '25', '50', '75', '100'];
    const state = base({
        grid: { present: true, texts: plain, visibleTexts: plain, pols: 21 },
        labels: { single: { text: '$30k' }, min: { text: 'From: $0k' }, max: { text: 'Up to: $100+k' } }
    });
    assert.ok(!ids(ctxOf(state, cfg, 'S0')).includes('grid'));

    const decorated = ['$0k', '$25k', '$50k', '$75k', '$100k'];
    const wrong = base({
        grid: { present: true, texts: decorated, visibleTexts: decorated, pols: 21 },
        labels: { single: { text: '$30k' }, min: { text: 'From: $0k' }, max: { text: 'Up to: $100+k' } }
    });
    assert.ok(ids(ctxOf(wrong, cfg, 'S0')).includes('grid'));
});

// readme note "values": "The grid gets one labelled tick per entry".
// Bug caught: labelling the grid with indexes instead of entries.
test('grid: values mode gets one label per entry, showing the entries', () => {
    const cfg = { values: [10, 1000, 100000], grid: true };
    const texts = ['10', '1 000', '100 000'];
    assert.ok(!ids(ctxOf(base({ grid: { present: true, texts, visibleTexts: texts, pols: 3 } }), cfg, 'S0')).includes('grid'));

    const indexed = base({ grid: { present: true, texts: ['0', '1', '2'], visibleTexts: [], pols: 3 } });
    assert.ok(ids(ctxOf(indexed, cfg, 'S0')).includes('grid'));
});

// #877 B2. readme note "step": "Every value is min plus a whole number of steps,
// rounded to the decimals of step ... min: 0.5, step: 1 gives 0.5, 2, 3, 4". A grid
// unit boundary is a value like any other, so the boundary at 50 % of a 0.5..10.5
// range -- 5.5, which the slider cannot hold -- is labelled 6, and the last boundary
// is max itself.
// Bug caught: labelling the boundaries with the raw evenly-spaced arithmetic
// (0.5, 1.5, 2.5 ...), which no slider on this scale can reach.
test('grid: the unit boundaries sit on the step scale, and the last one is max', () => {
    const cfg = { min: 0.5, max: 10.5, step: 1, grid: true, grid_num: 10 };
    const onScaleTexts = ['0.5', '2', '3', '4', '5', '6', '7', '8', '9', '10', '10.5'];
    assert.ok(!ids(ctxOf(base({ grid: { present: true, texts: onScaleTexts, visibleTexts: onScaleTexts, pols: 11 } }), cfg, 'S0')).includes('grid'));

    const rawSpacing = ['0.5', '1.5', '2.5', '3.5', '4.5', '5.5', '6.5', '7.5', '8.5', '9.5', '10.5'];
    assert.ok(ids(ctxOf(base({ grid: { present: true, texts: rawSpacing, visibleTexts: [], pols: 11 } }), cfg, 'S0')).includes('grid'));
});

// Same readme sentence, second example: "min: 1.2, step: 4 gives 1.2, 5, 9, 13".
// Bug caught: rounding the boundary to the decimals of the boundary itself instead of
// snapping it to the scale (6.2 and 11.2 would pass, though the slider holds 5 and 13).
test('grid: a min 1.2 step 4 scale labels its boundaries 1.2, 5, 13, 17 and max', () => {
    const cfg = { min: 1.2, max: 21.2, step: 4, grid: true, grid_num: 4 };
    const snapped = ['1.2', '5', '13', '17', '21.2'];
    assert.ok(!ids(ctxOf(base({ grid: { present: true, texts: snapped, visibleTexts: snapped, pols: 9 } }), cfg, 'S0')).includes('grid'));

    const unsnapped = ['1.2', '6.2', '11.2', '16.2', '21.2'];
    assert.ok(ids(ctxOf(base({ grid: { present: true, texts: unsnapped, visibleTexts: [], pols: 9 } }), cfg, 'S0')).includes('grid'));
});

// A range that does not divide into whole units is no longer a characterization gap:
// every boundary is a value on the step scale, so every label has an expected text.
// Bug caught: checking only the first and last label, which would let the three
// middle ticks of a 0..100 grid_num 3 slider read anything at all.
test('grid: every label of a non-dividing range is checked, not just the ends', () => {
    const cfg = { min: 0, max: 100, step: 1, grid: true, grid_num: 3 };
    const snapped = ['0', '33', '67', '100'];
    assert.ok(!ids(ctxOf(base({ grid: { present: true, texts: snapped, visibleTexts: snapped, pols: 16 } }), cfg, 'S0')).includes('grid'));

    const middleOff = base({ grid: { present: true, texts: ['0', '33.3', '66.7', '100'], visibleTexts: [], pols: 16 } });
    assert.ok(ids(ctxOf(middleOff, cfg, 'S0')).includes('grid'));

    const wrongEnd = base({ grid: { present: true, texts: ['0', '33', '67', '99'], visibleTexts: [], pols: 16 } });
    assert.ok(ids(ctxOf(wrongEnd, cfg, 'S0')).includes('grid'));
});

// ------------------------------------------------------------------------ dom

// readme settings table: skin "Skin (flat, big, modern, round, sharp, square)";
// extra_classes "Extra CSS classes for the slider container".
// Bug caught: the skin option no longer reaching the container class.
test('dom: the skin and extra_classes must be on the container', () => {
    const cfg = { min: 0, max: 100, step: 1, skin: 'big', extra_classes: 'foo bar' };
    const good = base({ container: { classes: ['irs', 'irs--big', 'js-irs-0', 'foo', 'bar'] } });
    assert.ok(!ids(ctxOf(good, cfg, 'S0')).includes('dom'));

    const wrongSkin = base({ container: { classes: ['irs', 'irs--flat', 'js-irs-0', 'foo', 'bar'] } });
    assert.ok(ids(ctxOf(wrongSkin, cfg, 'S0')).includes('dom'));

    const noExtra = base({ container: { classes: ['irs', 'irs--big', 'js-irs-0'] } });
    assert.ok(ids(ctxOf(noExtra, cfg, 'S0')).includes('dom'));
});

// readme settings table: type "single for one handle, double for two handles".
// Bug caught: rendering the single template for a double slider.
test('dom: the handles rendered must match the type', () => {
    assert.ok(!ids(ctxOf(doubleState(), DOUBLE, 'S0')).includes('dom'));
    assert.ok(ids(ctxOf(base(), DOUBLE, 'S0')).includes('dom'));
});

// #877 B3. readme settings table: disable "Disable the slider and the input, so its
// value is not submitted with the form"; block "Block the slider but keep the input
// enabled. Value is still submitted with the form". Both states cover the slider with
// the same mask -- smoke.spec.mjs pins it ("disable shows the mask and disables the
// input; block keeps the input enabled") -- and only disable reaches the input.
// Bug caught: block disabling the input, so its value stops being submitted; and the
// mirror mistake of reading the mask as a disable-only marker, which reds every
// blocked entry of the matrix.
test('dom: the mask follows disable or block, the disabled input follows disable alone', () => {
    const blocked = { min: 0, max: 100, step: 1, block: true };
    assert.ok(!ids(ctxOf(base({ mask: true }), blocked, 'S0')).includes('dom'));
    assert.ok(ids(ctxOf(base(), blocked, 'S0')).includes('dom'), 'a blocked slider without its mask');
    assert.ok(ids(ctxOf(base({ mask: true, input: { disabled: true } }), blocked, 'S0')).includes('dom'), 'block must not disable the input');

    const disabled = { min: 0, max: 100, step: 1, disable: true };
    assert.ok(!ids(ctxOf(base({ mask: true, input: { disabled: true } }), disabled, 'S0')).includes('dom'));
    assert.ok(ids(ctxOf(base({ mask: true }), disabled, 'S0')).includes('dom'), 'disable must disable the input');
    assert.ok(ids(ctxOf(base({ input: { disabled: true } }), disabled, 'S0')).includes('dom'), 'a disabled slider without its mask');

    const plain = { min: 0, max: 100, step: 1 };
    assert.ok(!ids(ctxOf(base(), plain, 'S0')).includes('dom'));
    assert.ok(ids(ctxOf(base({ mask: true }), plain, 'S0')).includes('dom'), 'a mask on a slider that is neither disabled nor blocked');
});

// ------------------------------------------------------------------ callbacks

// readme settings table: onStart "Fires once when the slider is created, before its
// first render"; onInit "Fires once when the slider is created and its first render
// is done"; onChange "Fires on each value change made by the user".
// Bug caught: a callback path that fires onChange during init (the #742 family).
test('callbacks: S0 is onStart then onInit, with no onChange', () => {
    assert.ok(!ids(ctxOf(base({ events: INIT_EVENTS }), SINGLE, 'S0', null, { changed: false })).includes('callbacks'));

    const reversed = base({ events: [cb('onInit'), cb('onStart')] });
    assert.ok(ids(ctxOf(reversed, SINGLE, 'S0', null, { changed: false })).includes('callbacks'));

    const noisy = base({ events: [...INIT_EVENTS, cb('onChange')] });
    assert.ok(ids(ctxOf(noisy, SINGLE, 'S0', null, { changed: false })).includes('callbacks'));
});

// readme "Callback data": the payload holds the current from and to.
// Bug caught: firing onChange before result is rewritten, so the payload trails the
// slider by one change.
test('callbacks: an onChange payload whose from differs from the value is reported', () => {
    const prev = base({ input: { value: '20', dataFrom: 20 }, labels: { single: { text: '20' } }, values: { from: 20 }, events: INIT_EVENTS });
    const stale = base({ events: [...INIT_EVENTS, cb('onChange', { from: 20, from_pretty: '20' }), cb('onFinish')] });
    assert.ok(ids(ctxOf(stale, SINGLE, 'S1', prev, { changed: true })).includes('callbacks'));
});

// readme settings table: onFinish "Fires when an interaction ends: a handle is
// released (even without moving), the track ... is clicked, or a key is pressed".
// Bug caught: dropping the onFinish that a click with no movement still owes, or
// firing it twice per interaction.
test('callbacks: every interaction ends with exactly one onFinish, changed or not', () => {
    const prev = base({ events: INIT_EVENTS });
    const still = base({ events: [...INIT_EVENTS, cb('onFinish')] });
    assert.ok(!ids(ctxOf(still, SINGLE, 'S3', prev, { click: true, changed: false })).includes('callbacks'));

    const silent = base({ events: [...INIT_EVENTS] });
    assert.ok(ids(ctxOf(silent, SINGLE, 'S3', prev, { click: true, changed: false })).includes('callbacks'));

    const twice = base({ events: [...INIT_EVENTS, cb('onFinish'), cb('onFinish')] });
    assert.ok(ids(ctxOf(twice, SINGLE, 'S3', prev, { click: true, changed: false })).includes('callbacks'));
});

// Bug caught: a click that changes nothing still firing onChange.
test('callbacks: an onChange with no value change is reported', () => {
    const prev = base({ events: INIT_EVENTS });
    const noisy = base({ events: [...INIT_EVENTS, cb('onChange'), cb('onFinish')] });
    assert.ok(ids(ctxOf(noisy, SINGLE, 'S3', prev, { click: true, changed: false })).includes('callbacks'));
});

// readme settings table: onChange is "Not fired by update(), reset() or a container
// resize"; onUpdate "Fires when the slider is modified by update() or reset()".
// Bug caught: update() taking the onChange branch in drawHandles().
test('callbacks: an update stage gives exactly one onUpdate and no onChange', () => {
    const prev = base({ events: INIT_EVENTS });
    const updated = base({ values: { from: 50 }, input: { value: '50', dataFrom: 50 }, labels: { single: { text: '50' } }, events: [...INIT_EVENTS, cb('onUpdate', { from: 50, from_pretty: '50', from_percent: 50 })] });
    assert.ok(!ids(ctxOf(updated, SINGLE, 'S6', prev, { update: true })).includes('callbacks'));

    const withChange = base({ values: { from: 50 }, input: { value: '50', dataFrom: 50 }, labels: { single: { text: '50' } }, events: [...INIT_EVENTS, cb('onUpdate', { from: 50, from_pretty: '50', from_percent: 50 }), cb('onChange', { from: 50, from_pretty: '50', from_percent: 50 })] });
    assert.ok(ids(ctxOf(withChange, SINGLE, 'S6', prev, { update: true })).includes('callbacks'));

    const twice = base({ values: { from: 50 }, input: { value: '50', dataFrom: 50 }, labels: { single: { text: '50' } }, events: [...INIT_EVENTS, cb('onUpdate', { from: 50, from_pretty: '50', from_percent: 50 }), cb('onUpdate', { from: 50, from_pretty: '50', from_percent: 50 })] });
    assert.ok(ids(ctxOf(twice, SINGLE, 'S6', prev, { update: true })).includes('callbacks'));
});

// readme "Callback data": "from_value": null, "the entry at this index when values
// is used". The parenthetical in that block records today's behaviour, where the
// field turns undefined after the first update() on a slider without values; this
// invariant reports it, so the matrix surfaces it as a finding.
// Bug caught: from_value carrying a value on a slider that has no values array.
test('callbacks: from_value and to_value must each be null without values, at every stage', () => {
    const prev = base({ events: INIT_EVENTS });
    const updated = (over) => base({
        values: { from: 50 }, input: { value: '50', dataFrom: 50 }, labels: { single: { text: '50' } },
        events: [...INIT_EVENTS, cb('onUpdate', { from: 50, from_pretty: '50', from_percent: 50, ...over })]
    });

    const fromDropped = checkInvariants(ctxOf(updated({ from_value: undefined }), SINGLE, 'S6', prev, { update: true }));
    assert.ok(fromDropped.some((f) => f.id === 'callbacks' && f.message.includes('from_value')));

    const toDropped = checkInvariants(ctxOf(updated({ to_value: undefined }), SINGLE, 'S6', prev, { update: true }));
    assert.ok(toDropped.some((f) => f.id === 'callbacks' && f.message.includes('to_value')));

    // A slider without values reports nothing while both fields stay null.
    assert.ok(!ids(ctxOf(updated({}), SINGLE, 'S6', prev, { update: true })).includes('callbacks'));
});

// readme "Callback data": "from_value and to_value hold the actual entry at that
// index".
// Bug caught: from_value carrying the index instead of the entry.
test('callbacks: in values mode from_value is the entry at the index', () => {
    const cfg = { values: ['low', 'mid', 'high'] };
    const state = base({
        values: { from: 1 }, input: { value: 'mid', dataFrom: 1 },
        labels: { single: { text: 'mid' }, min: { text: 'low' }, max: { text: 'high' } },
        events: [cb('onStart', { from: 1, min: 0, max: 2, from_percent: 50, from_value: 'mid', from_pretty: 'mid', min_pretty: 'low', max_pretty: 'high' }), cb('onInit', { from: 1, min: 0, max: 2, from_percent: 50, from_value: 'mid', from_pretty: 'mid', min_pretty: 'low', max_pretty: 'high' })]
    });
    assert.ok(!ids(ctxOf(state, cfg, 'S0', null, { changed: false })).includes('callbacks'));

    const indexed = base({
        values: { from: 1 }, input: { value: 'mid', dataFrom: 1 },
        labels: { single: { text: 'mid' }, min: { text: 'low' }, max: { text: 'high' } },
        events: [cb('onStart', { from: 1, min: 0, max: 2, from_percent: 50, from_value: 1, from_pretty: 'mid', min_pretty: 'low', max_pretty: 'high' })]
    });
    assert.ok(ids(ctxOf(indexed, cfg, 'S0', null, { changed: false })).includes('callbacks'));
});

// readme "Callback data": min_pretty "MIN formatted", max_pretty "MAX formatted",
// from_percent "FROM value in percent".
// Bug caught: dropping min_pretty/max_pretty from the payload (#639), or leaking a
// percent computed in the fake percent space.
test('callbacks: every payload carries min_pretty and max_pretty and percents within 0..100', () => {
    const prev = base({ events: INIT_EVENTS });
    const missing = base({ events: [...INIT_EVENTS, cb('onFinish', { min_pretty: undefined })] });
    assert.ok(ids(ctxOf(missing, SINGLE, 'S3', prev, { click: true, changed: false })).includes('callbacks'));

    const over = base({ events: [...INIT_EVENTS, cb('onFinish', { from_percent: 104 })] });
    assert.ok(ids(ctxOf(over, SINGLE, 'S3', prev, { click: true, changed: false })).includes('callbacks'));
});

// Bug caught: the matrix attributing a stage's callbacks to the wrong stage by
// reading the whole log instead of the entries recorded since the previous state.
test('callbacks: only the entries recorded since the previous state are judged', () => {
    const prev = base({ events: [...INIT_EVENTS, cb('onChange'), cb('onFinish')] });
    const state = base({ events: [...prev.events, cb('onFinish')] });
    assert.ok(!ids(ctxOf(state, SINGLE, 'S3', prev, { click: true, changed: false })).includes('callbacks'));
});

// #877 B4-B6. readme settings table, onFinish: "Fires when an interaction ends: a
// handle is released (even without moving), the track ... is clicked, or a key is
// pressed"; onChange: "Fires on each value change made by the user". One press is one
// interaction and at most one value change.
// Bug caught: letting the 300 ms idle render loop fold several presses into one
// callback pair, so a caller that logs each change sees one entry for four presses.
test('callbacks: a key press that moved the value gives exactly one onChange and one onFinish', () => {
    const cfg = { min: 0, max: 100, step: 5 };
    const prev = afterPress(10, INIT_EVENTS);

    const one = afterPress(15, [...INIT_EVENTS, ...pressEvents(15)]);
    assert.ok(!ids(ctxOf(one, cfg, 'S4a', prev, { key: '+', changed: true })).includes('callbacks'));

    const noFinish = afterPress(15, [...INIT_EVENTS, ...pressEvents(15).slice(0, 1)]);
    assert.ok(ids(ctxOf(noFinish, cfg, 'S4a', prev, { key: '+', changed: true })).includes('callbacks'));

    const twoFinishes = afterPress(15, [...INIT_EVENTS, ...pressEvents(15), ...pressEvents(15).slice(1)]);
    assert.ok(ids(ctxOf(twoFinishes, cfg, 'S4a', prev, { key: '+', changed: true })).includes('callbacks'));

    const twoChanges = afterPress(15, [...INIT_EVENTS, ...pressEvents(15).slice(0, 1), ...pressEvents(15)]);
    assert.ok(ids(ctxOf(twoChanges, cfg, 'S4a', prev, { key: '+', changed: true })).includes('callbacks'));
});

// Same two readme rows from the other side, and the half smoke.spec.mjs already pins:
// "an arrow key press at the range edge fires onFinish only, no onChange (#851)".
// Bug caught: dropping the "did from/to actually change" check from drawHandles()'s
// onChange condition, or swallowing the onFinish a blocked press still owes.
test('callbacks: a key press that moved nothing gives no onChange and still one onFinish', () => {
    const cfg = { min: 0, max: 100, step: 5 };
    const prev = afterPress(0, INIT_EVENTS);
    const finishOnly = cb('onFinish', { from: 0, from_pretty: '0', from_percent: 0 });

    const quiet = afterPress(0, [...INIT_EVENTS, finishOnly]);
    assert.ok(!ids(ctxOf(quiet, cfg, 'S4d', prev, { key: '-', changed: false })).includes('callbacks'));

    const silent = afterPress(0, [...INIT_EVENTS]);
    assert.ok(ids(ctxOf(silent, cfg, 'S4d', prev, { key: '-', changed: false })).includes('callbacks'));

    const noisy = afterPress(0, [...INIT_EVENTS, cb('onChange', { from: 0, from_pretty: '0', from_percent: 0 }), finishOnly]);
    assert.ok(ids(ctxOf(noisy, cfg, 'S4d', prev, { key: '-', changed: false })).includes('callbacks'));
});

// ----------------------------------------------------------------------- keys

// #877 B4-B6: the matrix presses the four keys of S4 one at a time, 400 ms apart, and
// reads a state after each press, so every rule below judges ONE press (stages S4a to
// S4d) instead of the net effect of a burst.

/** A single-type state at `value`, with the events of one settled key press. */
const afterPress = (value, events) => base({
    values: { from: value },
    input: { value: String(value), dataFrom: value },
    labels: { single: { text: String(value) } },
    events
});

/** The recorded pair a press that moved the value to `value` owes. */
const pressEvents = (value) => [
    cb('onChange', { from: value, from_pretty: String(value), from_percent: value }),
    cb('onFinish', { from: value, from_pretty: String(value), from_percent: value })
];

// readme settings table: keyboard "Keyboard controls. Left: <-, v, A, S. Right: ->,
// ^, W, D", with step "Step size" as the unit of movement.
// Bug caught: adding a real-percent step to a fake-percent pointer, which makes a
// press consume two steps (#696/#825).
test('keys: one press moves the targeted handle by exactly one step', () => {
    const cfg = { min: 0, max: 100, step: 5 };
    const prev = afterPress(10, INIT_EVENTS);

    const up = afterPress(15, [...INIT_EVENTS, ...pressEvents(15)]);
    assert.ok(!ids(ctxOf(up, cfg, 'S4a', prev, { key: '+', changed: true })).includes('keys'));

    const doubled = afterPress(20, [...INIT_EVENTS, ...pressEvents(20)]);
    assert.ok(ids(ctxOf(doubled, cfg, 'S4a', prev, { key: '+', changed: true })).includes('keys'));

    const down = afterPress(5, [...INIT_EVENTS, ...pressEvents(5)]);
    assert.ok(!ids(ctxOf(down, cfg, 'S4d', prev, { key: '-', changed: true })).includes('keys'));

    const wrongWay = afterPress(15, [...INIT_EVENTS, ...pressEvents(15)]);
    assert.ok(ids(ctxOf(wrongWay, cfg, 'S4d', prev, { key: '-', changed: true })).includes('keys'), 'a decrease key that moved the handle up');
});

// readme settings table: from_max "Maximum limit for the from handle" -- a key move
// stops there instead of overshooting.
// Bug caught: the keyboard path skipping checkDiapason, so a press walks past the
// handle's own limit.
test('keys: a press stopped by a limit must sit exactly on the limit', () => {
    const cfg = { min: 0, max: 100, step: 5, from_max: 12 };
    const prev = afterPress(10, INIT_EVENTS);

    const clamped = afterPress(12, [...INIT_EVENTS, ...pressEvents(12)]);
    assert.ok(!ids(ctxOf(clamped, cfg, 'S4a', prev, { key: '+', changed: true })).includes('keys'));

    const past = afterPress(15, [...INIT_EVENTS, ...pressEvents(15)]);
    assert.ok(ids(ctxOf(past, cfg, 'S4a', prev, { key: '+', changed: true })).includes('keys'));
});

// readme settings table: min_interval "Smallest interval between the handles" stops a
// key move just as a limit does.
// Bug caught: moveByKey() resolving through a path that skips checkMinInterval.
test('keys: a press stopped by min_interval must sit exactly on the interval edge', () => {
    const cfg = { type: 'double', min: 0, max: 100, step: 5, min_interval: 18 };
    const prev = doubleState({ events: INIT_EVENTS });
    const withFrom = (value) => doubleState({
        values: { from: value },
        input: { value: `${value};40`, dataFrom: value },
        labels: { from: { text: String(value) } },
        events: [...INIT_EVENTS,
            cb('onChange', { from: value, to: 40, from_pretty: String(value), to_pretty: '40', from_percent: value, to_percent: 40 }),
            cb('onFinish', { from: value, to: 40, from_pretty: String(value), to_pretty: '40', from_percent: value, to_percent: 40 })]
    });

    assert.ok(!ids(ctxOf(withFrom(22), cfg, 'S4a', prev, { key: '+', changed: true })).includes('keys'));
    assert.ok(ids(ctxOf(withFrom(25), cfg, 'S4a', prev, { key: '+', changed: true })).includes('keys'));
});

// A press that moved nothing leaves no trace of which handle it targeted (in double
// type that is the last-touched handle, which the State deliberately does not expose),
// and a press blocked by a bound, a fixed handle or an inert slider is allowed to do
// nothing -- the callbacks rule is what judges those.
// Bug caught: the rule assuming `from` was the target and reporting every blocked
// press of a double slider.
test('keys: a press that moved nothing is left to the callbacks rule', () => {
    const cfg = { type: 'double', min: 0, max: 100, step: 5, from_fixed: true };
    const prev = doubleState({ events: INIT_EVENTS });
    const still = doubleState({ events: [...INIT_EVENTS, cb('onFinish', { from: 20, to: 40, from_pretty: '20', to_pretty: '40', from_percent: 20, to_percent: 40 })] });
    assert.ok(!ids(ctxOf(still, cfg, 'S4a', prev, { key: '+', changed: false })).includes('keys'));
});

// ---------------------------------------------------------------------- inert

// readme settings table: disable "Disable the slider and the input, so its value is
// not submitted with the form"; block "Block the slider but keep the input enabled".
// Bug caught: an interaction path that skips the disable/block guard.
test('inert: a disabled slider keeps its values and carries the mask', () => {
    const cfg = { min: 0, max: 100, step: 1, disable: true };
    const prev = base({ mask: true, input: { disabled: true } });
    const still = base({ mask: true, input: { disabled: true } });
    assert.ok(!ids(ctxOf(still, cfg, 'S1', prev, { changed: false })).includes('inert'));

    const moved = base({ mask: true, input: { value: '40', disabled: true, dataFrom: 40 }, labels: { single: { text: '40' } }, values: { from: 40 } });
    assert.ok(ids(ctxOf(moved, cfg, 'S1', prev, { changed: false })).includes('inert'));
});

// #877 B3. Same pair of readme rows, seen from the inert rule: block covers the
// slider with the mask like disable does, and leaves the input enabled.
// Bug caught: block disabling the input (its value would stop being submitted), or
// losing the mask that tells the user the slider is inert.
test('inert: a blocked slider carries the mask and keeps its input enabled', () => {
    const cfg = { min: 0, max: 100, step: 1, block: true };
    const prev = base({ mask: true });
    assert.ok(!ids(ctxOf(base({ mask: true }), cfg, 'S1', prev, { changed: false })).includes('inert'));
    assert.ok(ids(ctxOf(base(), cfg, 'S1', prev, { changed: false })).includes('inert'), 'a blocked slider without its mask');
    assert.ok(ids(ctxOf(base({ mask: true, input: { disabled: true } }), cfg, 'S1', prev, { changed: false })).includes('inert'), 'block must not disable the input');
});

// -------------------------------------------------------------------- destroy

// readme "Public methods": "After destroy() the input is back to normal and can be
// initialized again."
// Bug caught: destroy() leaving the container, the hidden-input class or the
// disabled state behind.
test('destroy: the container is gone and the input is back to normal', () => {
    const gone = base({
        container: { exists: false, classes: [] },
        input: { classes: [] },
        labels: { single: { visible: false }, min: { visible: false }, max: { visible: false } },
        events: INIT_EVENTS
    });
    assert.deepEqual(checkInvariants(ctxOf(gone, SINGLE, 'S8', base({ events: INIT_EVENTS }), { destroyed: true })), []);

    const left = base({ input: { classes: [] }, events: INIT_EVENTS });
    assert.ok(ids(ctxOf(left, SINGLE, 'S8', base({ events: INIT_EVENTS }), { destroyed: true })).includes('destroy'));

    const stillHidden = base({ container: { exists: false, classes: [] }, events: INIT_EVENTS });
    assert.ok(ids(ctxOf(stillHidden, SINGLE, 'S8', base({ events: INIT_EVENTS }), { destroyed: true })).includes('destroy'));

    const stillDisabled = base({ container: { exists: false, classes: [] }, input: { classes: [], disabled: true }, events: INIT_EVENTS });
    assert.ok(ids(ctxOf(stillDisabled, { ...SINGLE, disable: true }, 'S8', base({ events: INIT_EVENTS }), { destroyed: true })).includes('destroy'));
});

// ------------------------------------------------------------- known-bug register

// The entries themselves live in test/unit/browser-known-bugs.test.mjs; what is pinned
// here is the lookup the matrix spec calls, against an entry of known shape.
// Bug caught: a lookup that ignores the invariant id (every failure of a matched config
// would be annotated away), or one that stops at the first entry whatever it answers.
test('matchKnownBug answers per invariant id and per config', () => {
    const ctx = ctxOf(base(), SINGLE, 'S1');
    assert.equal(matchKnownBug(ctx, 'bounds'), null, 'a healthy single slider has no bounds bug on the register');

    KNOWN_BUGS.push({ issue: 9999, title: 'sample', matches: (c, id) => id === 'scale' && c.cfg.step === 1 });
    try {
        assert.equal(matchKnownBug(ctx, 'bounds'), null);
        assert.equal(matchKnownBug(ctx, 'scale').issue, 9999);
        assert.equal(matchKnownBug(ctxOf(base(), { ...SINGLE, step: 5 }, 'S1'), 'scale'), null);
    } finally {
        KNOWN_BUGS.pop();
    }
});
