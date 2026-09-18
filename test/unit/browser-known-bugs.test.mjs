import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KNOWN_BUGS, judgeStage, matchKnownBug } from '../browser/lib/known-bugs.mjs';
import { INVARIANTS } from '../browser/lib/invariants.mjs';
import { BAR_DRAG_FRACTION, S1_TARGET, S2_TARGET, S3_CLICK } from '../browser/matrix/script.mjs';

// #877: the known-bug register. Every entry below is fed the minimal configuration from
// its issue -- the one the matrix reproduces the bug with -- and a neighbouring
// configuration that differs in exactly the option the bug needs. An entry that matched
// the neighbour would annotate a healthy cell away; an entry that missed its own
// configuration would leave the matrix red on a bug that is already filed. Both halves
// are what these tests pin.
//
// The register never reads the outcome state (ctx.state): a predicate that watched the
// value it is excusing would stop matching the day the bug is fixed, and the matrix's
// "no longer reproduces" check -- the thing that forces a fix to retire its register
// line -- would never fire. Config, stage, the stage's own promise and the state the
// stage STARTED from (ctx.prev) are all a predicate may read, which is exactly what the
// contexts below carry.

const INVARIANT_IDS = INVARIANTS.map((inv) => inv.id);

/** A matrix context in the shape matrix.spec.mjs builds, minus the outcome state. */
const ctxOf = (cfg, stage, over = {}) => ({
    cfg,
    stage,
    prev: over.prev || null,
    expectations: over.expectations || {},
    state: { values: { from: null, to: null }, container: { exists: true, classes: [] }, events: [] }
});

/** The state a stage started from, as far as the register is allowed to read it. */
const prevOf = (from, to = null) => ({ values: { from, to } });

/** The issue number the register matches with, or null. */
const hit = (cfg, stage, id, over) => {
    const found = matchKnownBug(ctxOf(cfg, stage, over), id);
    return found ? found.issue : null;
};

/**
 * The issue number the register answers ONE failure message with, or null: two entries can
 * match the same configuration and rule, and the message is what tells them apart.
 */
const answers = (cfg, stage, id, message, over) => {
    const found = matchKnownBug(ctxOf(cfg, stage, over), id, message);
    return found ? found.issue : null;
};

/**
 * One payload-text failure of the callbacks rule, spelled the way lib/invariants.mjs
 * reports it (its report() writes "<id>: <what> (expected <x>, got <y>) after <stage>", and
 * a string expectation is quoted while a number is not).
 *
 * @param {string} type    the callback the payload came from
 * @param {string} field   from_pretty, to_pretty, min_pretty or max_pretty
 * @param {string} expected the text the readme promises
 * @param {string} got     the value the payload carried, as the report prints it
 * @param {string} [stage]
 * @returns {string}
 */
const prettyFailure = (type, field, expected, got, stage = 'S0') =>
    `callbacks: ${type} payload: ${field} must be the formatted ${field.slice(0, field.indexOf('_'))} value `
    + `(expected ${JSON.stringify(expected)}, got ${got}) after ${stage}`;

/** Every (stage, invariant) pair the register matches for a config. */
const allHits = (cfg, over) => {
    // Every stage of the matrix script, S9 -- the build that follows destroy() -- included.
    const stages = ['S0', 'S1', 'S2', 'S3', 'S4a', 'S4b', 'S4c', 'S4d', 'S5', 'S6', 'S7', 'S8', 'S9'];
    const found = [];
    for (const stage of stages) {
        for (const id of INVARIANT_IDS) {
            const issue = hit(cfg, stage, id, over);
            if (issue) found.push(`${stage}/${id}=#${issue}`);
        }
    }
    return found;
};

// ------------------------------------------------------------------- structure

// Bug caught: an entry filed without its issue number or its one-line title, which would
// annotate a matrix cell with nothing a reader could look up.
test('every register entry carries an issue number, a title, a predicate and a message pattern', () => {
    assert.equal(KNOWN_BUGS.length, 19);
    const issues = KNOWN_BUGS.map((bug) => bug.issue);
    assert.deepEqual(issues, [...new Set(issues)], 'an issue must have one entry');
    for (const bug of KNOWN_BUGS) {
        assert.equal(typeof bug.issue, 'number', 'issue number');
        assert.ok(bug.title && bug.title.length > 15, `#${bug.issue} needs a one-line title`);
        assert.equal(typeof bug.matches, 'function', `#${bug.issue} needs a predicate`);
        // Bug caught: an entry without its `what` pattern, which would annotate away every
        // failure of an invariant it was filed against instead of the one it describes.
        assert.ok(bug.what instanceof RegExp, `#${bug.issue} needs a what pattern`);
    }
});

// The register exists to excuse filed bugs, not to blanket a matrix cell.
// Bug caught: a predicate that forgot to check its own option (e.g. `id === 'limits'`
// alone), which would annotate away every failure of a healthy slider.
//
// The two callbacks lines that remain are #883, which every slider without a values
// array carries: update() and reset() turn from_value and to_value undefined whatever
// else the configuration holds, so a plain slider is expected to match exactly there and
// nowhere else.
test('a plain healthy slider matches only the bug every slider without values carries', () => {
    assert.deepEqual(allHits({ min: 0, max: 100, from: 30, step: 1, grid: true }), [
        'S6/callbacks=#883', 'S7/callbacks=#883'
    ]);
    assert.deepEqual(allHits({ type: 'double', min: 0, max: 100, from: 20, to: 60, step: 1 }), [
        'S6/callbacks=#883', 'S7/callbacks=#883'
    ]);
    // In values mode even that one is gone.
    assert.deepEqual(allHits({ values: [10, 20, 30], from: 1 }), []);
});

// ------------------------------------------------------------------ the script

// Half of what a predicate knows comes from the script matrix.spec.mjs drives the slider
// with: #882 asks whether a drag stage drove a handle INTO its own limit, #891 whether the
// track click landed between the two handles, #879 how far the bar drag carries them. Those
// numbers live in test/browser/matrix/script.mjs, which the spec and the register both read,
// and the fractions below are taken from there rather than typed out -- so this test moves
// with the script and fails when the register stops moving with it.
// Bug caught: the register keeping drag targets of its own (the STAGE_DRAG_TARGETS /
// S3_CLICK_FRACTION pair it used to carry), which goes on excusing cells at the old target
// the day the script aims somewhere else.
test('the register predicates aim where the script aims', () => {
    const track = { type: 'double', min: 0, max: 1000, step: 10, from: 300, to: 700 };
    const at = (fraction) => track.min + fraction * (track.max - track.min);

    // S1 drives the from handle to its fraction of the track. A from_min just above where
    // it lands is an off-scale limit the clamp rounds below (#882); one just under is a
    // limit the drag stops short of, and nothing is excused.
    const s1 = { prev: prevOf(300, 700), expectations: { changed: true, handle: 'from' } };
    assert.equal(hit({ ...track, from_min: at(S1_TARGET) + 4 }, 'S1', 'limits', s1), 882);
    assert.equal(hit({ ...track, from_min: at(S1_TARGET) - 6 }, 'S1', 'limits', s1), null);

    // S2 drives the to handle the other way, so its mirror is a to_max the clamp rounds
    // above.
    const s2 = { prev: prevOf(300, 700), expectations: { changed: true, handle: 'to' } };
    assert.equal(hit({ ...track, to_max: at(S2_TARGET) - 4 }, 'S2', 'limits', s2), 882);
    assert.equal(hit({ ...track, to_max: at(S2_TARGET) + 6 }, 'S2', 'limits', s2), null);

    // S3 clicks the track, and #891 takes a click that landed on the bar between the two
    // handles: the pair that brackets it carries the bug, the pair left of it does not.
    const clicked = at(S3_CLICK);
    const deadKeyboard = { ...track, drag_interval: true, from_fixed: true };
    const press = (from, to) => ({ prev: prevOf(from, to), expectations: { key: '+', changed: false } });
    // The two pairs are bracketed twenty units either side of the click on a thousand-wide
    // track, so a register aiming at a click fraction of its own misses the first pair and
    // claims the second.
    assert.equal(hit(deadKeyboard, 'S4a', 'callbacks', press(clicked - 20, clicked + 20)), 891);
    assert.equal(hit(deadKeyboard, 'S4a', 'callbacks', press(clicked - 200, clicked - 20)), null);

    // S5 carries the pair one bar drag to the right, so a from_max inside that travel is
    // reached (#879) and one beyond it is not.
    const travel = BAR_DRAG_FRACTION * (track.max - track.min);
    const barDrag = { prev: prevOf(300, 500), expectations: { bar: true, changed: true } };
    assert.equal(hit({ ...track, drag_interval: true, from_max: 300 + travel - 10 }, 'S5', 'intervals', barDrag), 879);
    assert.equal(hit({ ...track, drag_interval: true, from_max: 300 + travel + 10 }, 'S5', 'intervals', barDrag), null);
});

// ------------------------------------------------------------ #882 limits off scale

// A limit that is not a point of the documented scale is crossed by up to half a step:
// the handle is clamped to the limit and then rounded onto the scale, downward.
test('#882 matches a limit off the step scale, not one on it', () => {
    const off = { min: 0.5, max: 10.5, step: 1, from: 1.5, from_min: 2.4 };
    assert.equal(hit(off, 'S0', 'limits'), 882);

    // 3 is a point of the 0.5 / step 1 scale (0.5, 2, 3, 4 ...), so nothing is rounded away.
    const on = { min: 0.5, max: 10.5, step: 1, from: 1.5, from_min: 3 };
    assert.equal(hit(on, 'S0', 'limits'), null);

    // The same off-scale limit is no excuse for a different invariant.
    assert.equal(hit(off, 'S0', 'bounds'), null);
    assert.equal(hit(off, 'S0', 'scale'), null);
});

// The handle need not START inside the limit: S1 drives the from handle to the low end of the
// track and S2 the to handle to the high end (matrix.spec.mjs's shared fractions), and a drag
// that runs into an off-scale limit is clamped onto the wrong side of it just the same (m063).
// Bug caught: a predicate that only looks at the pair the stage started from, which leaves the
// matrix red on the very stage that drives the handle into the limit.
test('#882 matches the drag stage that drives a handle into an off-scale limit', () => {
    const cfg = { type: 'double', min: 0, max: 1, step: 0.1, from: 0.3, to: 0.7, from_min: 0.24 };
    const s1 = { prev: prevOf(0.3, 0.7), expectations: { changed: true, handle: 'from' } };
    assert.equal(hit(cfg, 'S1', 'limits', s1), 882);

    // A limit the drag stops short of is no excuse: S1 aims at 20 % of the range.
    const reachable = { ...cfg, from_min: 0.14 };
    assert.equal(hit(reachable, 'S1', 'limits', s1), null);

    // Only the stages that drive a handle themselves: a key press from a pair well above the
    // limit is left to the keys and limits rules.
    assert.equal(hit(cfg, 'S4a', 'limits', { prev: prevOf(0.3, 0.7), expectations: { key: '+', changed: true } }), null);

    // The to handle is driven the other way, to the high end of the track. A maximum limit is
    // crossed when the clamp rounds UP off it (0.76 lands on 0.8).
    const toLimit = { type: 'double', min: 0, max: 1, step: 0.1, from: 0.3, to: 0.7, to_max: 0.76 };
    const s2 = { prev: prevOf(0.3, 0.7), expectations: { changed: true, handle: 'to' } };
    assert.equal(hit(toLimit, 'S2', 'limits', s2), 882);
    assert.equal(hit({ ...toLimit, to_max: 0.86 }, 'S2', 'limits', s2), null, 'a limit above the drag target is never reached');

    // A drag the slider never feels leaves the handle where it was: the mask swallows it on a
    // blocked or disabled slider (m059, m081), and a fixed handle ignores it (m081).
    assert.equal(hit({ ...cfg, block: true }, 'S1', 'limits', s1), null);
    assert.equal(hit({ ...cfg, disable: true }, 'S1', 'limits', s1), null);
    assert.equal(hit({ ...cfg, from_fixed: true }, 'S1', 'limits', s1), null);
});

// An off-scale limit is only crossed when the clamp ROUNDS THE WRONG WAY: from_min 2.4 on the
// 0.5 / step 1 scale lands on 2, below the limit, while from_min 2.9 lands on 3, above it and
// perfectly legal (m061).
// Bug caught: a predicate that reads "off the scale" as "crossed", which annotates away a
// healthy slider whose limit happens to round in its favour.
test('#882 matches a limit the clamp rounds below it, not one it rounds above', () => {
    const roundsDown = { min: 0.5, max: 10.5, step: 1, from: 1.5, from_min: 2.4 };
    assert.equal(hit(roundsDown, 'S0', 'limits'), 882);

    const roundsUp = { min: 0.5, max: 10.5, step: 1, from: 1.5, from_min: 2.9 };
    assert.equal(hit(roundsUp, 'S0', 'limits'), null);
    assert.equal(hit(roundsUp, 'S1', 'limits', { prev: prevOf(4), expectations: { changed: true, handle: 'from' } }), null);

    // The mirror case on a maximum limit: a to_max the clamp rounds ABOVE is the crossing.
    const maxRoundsUp = { type: 'double', min: 0.5, max: 10.5, step: 1, from: 2, to: 6, to_max: 5.6 };
    assert.equal(hit(maxRoundsUp, 'S0', 'limits'), 882);
    const maxRoundsDown = { type: 'double', min: 0.5, max: 10.5, step: 1, from: 2, to: 6, to_max: 5.4 };
    assert.equal(hit(maxRoundsDown, 'S0', 'limits'), null);
});

// S5 drags the whole interval a tenth of the range to the right, which carries a handle back
// out of the limit it was sitting in (m063): the clamp does not run there and the rule passes.
// Bug caught: a predicate that reads only where the handle STARTED, which would keep claiming
// every stage after the one that freed the handle.
test('#882 stops claiming once the bar drag carries the handle out of the limit', () => {
    const cfg = { type: 'double', min: 0, max: 1, step: 0.1, from: 0.3, to: 0.7, from_min: 0.24, min_interval: 0.2, drag_interval: true };
    const s5 = (from, to) => ({ prev: prevOf(from, to), expectations: { bar: true, changed: true } });
    assert.equal(hit(cfg, 'S5', 'limits', s5(0.2, 0.5)), null, 'the drag adds a tenth of the range and clears the limit');
    assert.equal(hit(cfg, 'S5', 'limits', s5(0.1, 0.4)), 882, 'a pair far enough left is still inside the limit after the drag');

    // A fixed handle or an inert slider gets no bar drag at all, so the handle stays put.
    assert.equal(hit({ ...cfg, from_fixed: true }, 'S5', 'limits', s5(0.2, 0.5)), 882);
    assert.equal(hit({ ...cfg, block: true }, 'S5', 'limits', s5(0.2, 0.5)), 882);
});

// ------------------------------------------------------- #883 from_value after update

// readme "Callback data": from_value is null without a values array; after the first
// update() or reset() it comes back undefined instead.
test('#883 matches the update and reset stages of a slider without values', () => {
    const plain = { min: 0, max: 100, from: 30, step: 1 };
    assert.equal(hit(plain, 'S6', 'callbacks'), 883);
    assert.equal(hit(plain, 'S7', 'callbacks'), 883);
    assert.equal(hit(plain, 'S1', 'callbacks'), null, 'a drag does not turn the field undefined');

    // In values mode the field carries the entry and is never dropped.
    const values = { values: [10, 20, 30], from: 1 };
    assert.equal(hit(values, 'S6', 'callbacks'), null);
});

// ------------------------------------------------------------ #885 intervals at init

// min_interval / max_interval are applied by the interaction paths only: the starting
// from/to and the pair update() leaves behind are never checked against them.
test('#885 matches a starting pair that breaks its own interval, not one that respects it', () => {
    const tooWide = { type: 'double', min: 0, max: 100, step: 1, from: 30, to: 70, max_interval: 6 };
    assert.equal(hit(tooWide, 'S0', 'intervals'), 885);
    // reset() rebuilds from the options update() left, so the pair it restores is the
    // one the previous stage ended on, not the configured one.
    assert.equal(hit(tooWide, 'S7', 'intervals', { prev: prevOf(30, 70) }), 885);
    assert.equal(hit(tooWide, 'S7', 'intervals', { prev: prevOf(30, 34) }), null, 'a pair update() left inside the interval is restored intact');

    const tooClose = { type: 'double', min: 0, max: 100, step: 1, from: 48, to: 52, min_interval: 20 };
    assert.equal(hit(tooClose, 'S0', 'intervals'), 885);

    // The violation survives every stage that moves nothing (a disabled, blocked or
    // fixed slider carries it to the end of the run); a stage that does move a handle
    // re-applies the interval, and the rule passes there.
    assert.equal(hit(tooClose, 'S3', 'intervals', { prev: prevOf(48, 52), expectations: { click: true, changed: false } }), 885);
    assert.equal(hit(tooClose, 'S3', 'intervals', { prev: prevOf(48, 52), expectations: { click: true, changed: true } }), null);

    // A starting pair that already honours both limits has nothing to excuse.
    const healthy = { type: 'double', min: 0, max: 100, step: 1, from: 20, to: 50, min_interval: 20, max_interval: 40 };
    assert.equal(hit(healthy, 'S0', 'intervals'), null);

    // No interval option at all: never.
    const noIntervals = { type: 'double', min: 0, max: 100, step: 1, from: 30, to: 70 };
    assert.equal(hit(noIntervals, 'S0', 'intervals'), null);

    // The starting pair is the one validate() built, limits included: a from lifted to an
    // off-scale from_min lands on the scale point below it (that rounding is #882) and can
    // close the gap past the interval, which is still this bug.
    const liftedByALimit = { type: 'double', values: ['10', '20', '30', '40', '50'], from: 1, to: 3, from_min: 2.4, min_interval: 2 };
    assert.equal(hit(liftedByALimit, 'S0', 'intervals'), 885);
    const sameWithoutTheLimit = { type: 'double', values: ['10', '20', '30', '40', '50'], from: 1, to: 3, min_interval: 2 };
    assert.equal(hit(sameWithoutTheLimit, 'S0', 'intervals'), null, 'the configured pair honours the interval');

    // update({from: mid}) is judged against the pair the stage started from.
    const updated = { type: 'double', min: 0, max: 100, step: 1, from: 10, to: 90, min_interval: 30 };
    assert.equal(hit(updated, 'S6', 'intervals', { prev: prevOf(10, 60) }), 885, 'mid 50 against a to of 60 leaves 10');
    assert.equal(hit(updated, 'S6', 'intervals', { prev: prevOf(10, 90) }), null, 'mid 50 against a to of 90 leaves 40');
});

// -------------------------------------------------------- #889 pretty fields as numbers

// readme "Callback data" shows every *_pretty field as a string; with prettify_enabled
// off the plugin hands back the raw number instead.
test('#889 matches a payload stage of a slider with prettify_enabled off', () => {
    const off = { min: 0, max: 100, from: 30, step: 1, prettify_enabled: false };
    assert.equal(hit(off, 'S0', 'callbacks'), 889);
    assert.equal(hit(off, 'S3', 'callbacks'), 889);
    assert.equal(hit(off, 'S8', 'callbacks'), null, 'destroy() records no payload at all');

    const on = { min: 0, max: 100, from: 30, step: 1 };
    assert.equal(hit(on, 'S0', 'callbacks'), null);

    // A disabled slider reports nothing during an interaction, so there is no payload
    // to be wrong -- but it still fires onStart, onInit and onUpdate.
    const disabled = { min: 0, max: 100, from: 30, step: 1, prettify_enabled: false, disable: true };
    assert.equal(hit(disabled, 'S1', 'callbacks'), null);
    assert.equal(hit(disabled, 'S0', 'callbacks'), 889);

    // Values mode with text entries formats to text even with prettify off.
    const textValues = { values: ['low', 'mid', 'high'], from: 1, prettify_enabled: false };
    assert.equal(hit(textValues, 'S0', 'callbacks'), null);
    const numberValues = { values: [10, 20, 30], from: 1, prettify_enabled: false };
    assert.equal(hit(numberValues, 'S0', 'callbacks'), 889);
});

// ------------------------------------------- #897 the init payload of a hidden slider

// readme "Callback data": from_pretty is "FROM formatted" and to_pretty the same for the to
// value. A slider built inside a display:none container hands both back undefined in its
// onStart and onInit payloads, while min_pretty and max_pretty are filled in correctly.
test('#897 matches the missing payload text of a slider built hidden, not of a visible one', () => {
    // m002's configuration (values=off, scale=neg, container=hidden), with the two fields the
    // bug drops. prettify_separator is empty there, so the text is the bare number.
    const m002 = {
        type: 'double', min: -50, max: 50, step: 5, from: -20, to: 20,
        from_min: -25, from_max: 10, to_min: -10, to_max: 40, min_interval: 10,
        to_fixed: true, grid: true, grid_num: 4, prettify_separator: '', force_edges: true,
        skin: 'sharp', __hidden_at_init: true
    };
    const missingFrom = prettyFailure('onStart', 'from_pretty', '-20', 'undefined');
    const missingTo = prettyFailure('onInit', 'to_pretty', '20', 'undefined');
    assert.equal(answers(m002, 'S0', 'callbacks', missingFrom), 897);
    assert.equal(answers(m002, 'S0', 'callbacks', missingTo), 897);

    // The same slider in a visible container reports the text, so there is nothing to excuse.
    const visible = { ...m002, __hidden_at_init: undefined };
    assert.equal(answers(visible, 'S0', 'callbacks', missingFrom), null);

    // Only the two handle fields. min_pretty and max_pretty are filled in at init whatever the
    // container does, so a missing one there is a finding of its own and must stay real.
    assert.equal(answers(m002, 'S0', 'callbacks', prettyFailure('onStart', 'min_pretty', '-50', 'undefined')), null);
    assert.equal(answers(m002, 'S0', 'callbacks', prettyFailure('onStart', 'max_pretty', '50', 'undefined')), null);

    // Init alone: one idle tick after the reveal every payload carries its text again.
    const afterReveal = { prev: prevOf(-20, 20), expectations: { changed: true, handle: 'from' } };
    assert.equal(answers(m002, 'S1', 'callbacks', prettyFailure('onChange', 'from_pretty', '-30', 'undefined', 'S1'), afterReveal), null);

    // And only the payload text: everything else the callbacks rule says stays armed.
    assert.equal(answers(m002, 'S0', 'callbacks', 'callbacks: onStart fires once (expected 1, got 2) after S0'), null);
});

// m018, m019, m065, m067 and m068 are built hidden AND with prettify_enabled off, so their
// init payloads carry the two bugs at once: the handle fields come back undefined (#897)
// while min_pretty and max_pretty come back as the raw numbers (#889). The message is the
// only thing that tells them apart.
// Bug caught: #889 keeping a `what` wide enough to claim "got undefined" as well, which files
// the missing text under the prettify bug and leaves #897 looking as if it never reproduced.
test("the init payload of m018 is split between #897 and #889 by the message", () => {
    // m018's configuration (formatting=no-prettify, container=hidden, route=data).
    const m018 = {
        type: 'double', min: 0, max: 100, step: 1, from: 30, to: 70,
        from_min: 25, from_max: 60, min_interval: 4, max_interval: 4,
        to_fixed: true, drag_interval: true, drag_over_limit: true, grid: true, grid_num: 10,
        prettify_enabled: false, decorate_both: false, values_separator: ' to ',
        hide_from_to: true, keyboard: false, skin: 'square', __hidden_at_init: true
    };
    const missingFrom = prettyFailure('onStart', 'from_pretty', '30', 'undefined');
    const missingTo = prettyFailure('onStart', 'to_pretty', '70', 'undefined');
    const numericMin = prettyFailure('onStart', 'min_pretty', '0', '0');
    const numericMax = prettyFailure('onStart', 'max_pretty', '100', '100');
    assert.equal(answers(m018, 'S0', 'callbacks', missingFrom), 897);
    assert.equal(answers(m018, 'S0', 'callbacks', missingTo), 897);
    assert.equal(answers(m018, 'S0', 'callbacks', numericMin), 889);
    assert.equal(answers(m018, 'S0', 'callbacks', numericMax), 889);

    // Judged together, as the matrix judges them: the starting pair also breaks the interval
    // it was built with (#885), and nothing of the stage is left real.
    const interval = {
        id: 'intervals',
        message: 'intervals: the handles opened past max_interval (expected "<= 4", got 40) after S0'
    };
    const failures = [missingFrom, missingTo, numericMin, numericMax]
        .map((message) => ({ id: 'callbacks', message }))
        .concat(interval);
    const { real, annotations } = judgeStage(failures, ctxOf(m018, 'S0'), []);
    assert.deepEqual(real, []);
    assert.deepEqual(annotations.map((a) => a.issue).sort(), [885, 889, 889, 897, 897]);

    // The same slider in a visible container: every field comes back a number, and all four
    // are #889's -- the narrowing must not cost that entry the cells it was filed for.
    const shown = { ...m018, __hidden_at_init: undefined };
    assert.equal(answers(shown, 'S0', 'callbacks', prettyFailure('onStart', 'from_pretty', '30', '30')), 889);
    assert.equal(answers(shown, 'S0', 'callbacks', numericMin), 889);
    // A negative value is a number too (m065 runs from -50 to 50).
    assert.equal(answers(shown, 'S0', 'callbacks', prettyFailure('onStart', 'min_pretty', '-50', '-50')), 889);
});

// ------------------------------------------------------------- #890 block and the keys

// block masks the mouse but leaves the track focusable, so the arrow keys still move the
// value and fire the full callback set on a slider that should be inert.
test('#890 matches the key stages of a blocked slider, never a disabled one', () => {
    const blocked = { min: 0, max: 100, from: 30, step: 1, block: true };
    assert.equal(hit(blocked, 'S4a', 'callbacks'), 890);
    assert.equal(hit(blocked, 'S4a', 'inert', { expectations: { key: '+', changed: true } }), 890);
    assert.equal(hit(blocked, 'S4a', 'inert', { expectations: { key: '+', changed: false } }), null, 'a press that moved nothing leaves the inert rule passing');
    assert.equal(hit(blocked, 'S1', 'callbacks'), null, 'the mask does stop the mouse');

    const disabled = { min: 0, max: 100, from: 30, step: 1, disable: true };
    assert.equal(hit(disabled, 'S4a', 'callbacks'), null);
    assert.equal(hit(disabled, 'S4a', 'inert', { expectations: { key: '+', changed: true } }), null);

    // The interval-drag bug needs a track click that reaches the plugin, and the mask
    // swallows it, so a blocked slider keeps the ordinary key path and this bug with it
    // (every blocked drag_interval entry of the matrix fires its onFinish at S4a).
    const alsoBlocked = { type: 'double', min: 0, max: 100, from: 30, to: 70, step: 1, block: true, drag_interval: true, from_fixed: true };
    assert.equal(hit(alsoBlocked, 'S4a', 'callbacks'), 890);
});

// -------------------------------------------------- #888 hidden container in values mode

// A values-mode slider built inside a display:none container writes nothing to its input
// and reports from_value null, so a form posted before it is ever shown submits an empty
// field. __hidden_at_init is set by matrix.spec.mjs for the entries the fixture hides.
test('#888 matches a values-mode slider built hidden, not a numeric one', () => {
    const hidden = { values: [10, 20, 30, 40, 50], from: 1, __hidden_at_init: true };
    assert.equal(hit(hidden, 'S0', 'input'), 888);
    assert.equal(hit(hidden, 'S0', 'bounds'), 888);
    // The callbacks rule at S0 is shared with #897, which speaks for the payload TEXT the
    // same hidden container drops; this entry answers for the value behind it, so the two
    // are separated by the message.
    assert.equal(answers(hidden, 'S0', 'callbacks', 'callbacks: onStart payload: from_value must be the entry at the index (expected 20, got null) after S0'), 888);
    assert.equal(answers(hidden, 'S0', 'callbacks', prettyFailure('onStart', 'from_pretty', '20', 'undefined')), 897);
    assert.equal(hit(hidden, 'S1', 'input'), null, 'the input fills in once the container is revealed');

    const hiddenNumeric = { min: 0, max: 100, from: 30, step: 1, __hidden_at_init: true };
    assert.equal(hit(hiddenNumeric, 'S0', 'input'), null);

    const shownValues = { values: [10, 20, 30, 40, 50], from: 1 };
    assert.equal(hit(shownValues, 'S0', 'input'), null);

    // The values the reveal fills in read as a change that never happened, and which rule
    // sees it depends on the slider: only a fixed handle "moves", only an inert slider
    // has a value it should not change, and only a live one owes an onChange.
    const fixedHandle = { ...hidden, from_fixed: true };
    assert.equal(hit(fixedHandle, 'S1', 'fixed'), 888);
    assert.equal(hit(fixedHandle, 'S1', 'callbacks'), 888);
    assert.equal(hit(fixedHandle, 'S1', 'inert'), null, 'this slider is not inert, so that rule has nothing to say');

    const blocked = { ...hidden, block: true };
    assert.equal(hit(blocked, 'S1', 'inert'), 888);
    assert.equal(hit(blocked, 'S1', 'fixed'), null, 'no handle is fixed here');
    assert.equal(hit(blocked, 'S1', 'callbacks'), null, 'a blocked slider fires nothing for the reveal to be missing from');

    assert.equal(hit(fixedHandle, 'S2', 'fixed'), null, 'one stage carries the reveal, not the whole run');
});

// ------------------------------------------- #891 drag_interval plus a fixed handle

// After the track click the interval path owns the keyboard, and its fixed-handle guard
// drops the whole press -- callbacks included -- so the slider owes an onFinish it never
// fires.
test('#891 matches the key stages of a drag_interval slider whose bar the click landed on', () => {
    const dead = { type: 'double', min: 0, max: 100, from: 30, to: 70, step: 1, drag_interval: true, from_fixed: true };
    const onBar = { prev: prevOf(30, 70), expectations: { key: '+', changed: false } };
    assert.equal(hit(dead, 'S4a', 'callbacks', onBar), 891);
    assert.equal(hit(dead, 'S4d', 'callbacks', onBar), 891);
    assert.equal(hit(dead, 'S3', 'callbacks', onBar), null, 'the click itself still reports');

    // The bar is what the keyboard inherits: a pair too narrow to reach the click leaves the
    // press on the ordinary key path, where it reports its onFinish (m085, whose locked
    // interval keeps the pair well left of the click).
    assert.equal(hit(dead, 'S4a', 'callbacks', { prev: prevOf(10, 40), expectations: { key: '+', changed: false } }), null);

    const noDrag = { type: 'double', min: 0, max: 100, from: 30, to: 70, step: 1, from_fixed: true };
    assert.equal(hit(noDrag, 'S4a', 'callbacks', onBar), null);

    const noFixed = { type: 'double', min: 0, max: 100, from: 30, to: 70, step: 1, drag_interval: true };
    assert.equal(hit(noFixed, 'S4a', 'callbacks', onBar), null);

    // The onFinish line it answers is the one a key press owes, spelled the way the rule
    // reports it.
    // Bug caught: a message pattern that drifts from the rule's wording, which leaves the
    // dropped press unexplained and the cell red.
    assert.equal(answers(dead, 'S4a', 'callbacks', 'callbacks: an interaction ends with exactly one onFinish (expected 1, got 0) after S4a', onBar), 891);

    // An inert slider never gets the click that arms the interval path, so its keyboard
    // stays ordinary: that is #890's case, not this one.
    const blocked = { type: 'double', min: 0, max: 100, from: 30, to: 70, step: 1, drag_interval: true, to_fixed: true, block: true };
    assert.notEqual(hit(blocked, 'S4a', 'callbacks', onBar), 891);
});

// ------------------------------------------------------------- #892 grid off the scale

// A grid boundary is rounded to the decimals of step instead of being snapped onto the
// step scale, so a tick names a value the handle can never rest on.
test('#892 matches a grid whose boundaries fall between scale points', () => {
    const siteDemo = { grid: true, min: 1000, max: 1000000, from: 100000, step: 1000, prettify_enabled: true };
    assert.equal(hit(siteDemo, 'S0', 'grid'), 892);

    const stepTwo = { type: 'double', min: 0, max: 10, from: 4, to: 6, grid: true, step: 2 };
    assert.equal(hit(stepTwo, 'S0', 'grid'), 892);

    // A range that divides into whole steps labels every boundary with a real value.
    const dividing = { grid: true, min: 0, max: 100, from: 30, step: 1 };
    assert.equal(hit(dividing, 'S0', 'grid'), null);

    const noGrid = { min: 0, max: 10, from: 4, step: 2 };
    assert.equal(hit(noGrid, 'S0', 'grid'), null);

    assert.equal(hit(stepTwo, 'S8', 'grid'), null, 'a destroyed slider draws no grid');
});

// ------------------------------------------------------- #886 destroy leaves it disabled

// readme "Public methods": after destroy() the input is back to normal. A slider built
// with disable: true leaves it disabled for good.
test('#886 matches destroy() on a slider built disabled', () => {
    const disabled = { min: 0, max: 100, from: 30, step: 1, disable: true };
    assert.equal(hit(disabled, 'S8', 'destroy'), 886);
    assert.equal(hit(disabled, 'S0', 'destroy'), null, 'nothing is destroyed at init');

    const blocked = { min: 0, max: 100, from: 30, step: 1, block: true };
    assert.equal(hit(blocked, 'S8', 'destroy'), null, 'block never touches the input');

    const plain = { min: 0, max: 100, from: 30, step: 1 };
    assert.equal(hit(plain, 'S8', 'destroy'), null);
});

// ------------------------------------------------ #893 a key press on a rounded scale

// With min 0.5 and step 1 the reported values (0.5, 2, 3 ...) sit half a step off the
// percent grid the slider moves on, so a press spends part of its travel on the re-snap.
test('#893 matches a key press on a scale whose reported values are off the grid', () => {
    const rounded = { min: 0.5, max: 10.5, step: 1, from: 5 };
    assert.equal(hit(rounded, 'S4b', 'keys', { prev: prevOf(7), expectations: { key: '+', changed: true } }), 893);

    // A press whose own step runs into max is clamped there, and so is the overshoot:
    // the two agree and the rule passes (m017's third press, from 10 on a 10.5 max).
    assert.equal(hit(rounded, 'S4c', 'keys', { prev: prevOf(10), expectations: { key: '+', changed: true } }), null);
    // Only the presses that move the handle UP skip a value. A decrease press that moves at
    // all lands on the scale point one step down (m017 goes 10.5 -> 10), which is exactly what
    // the keys rule predicts once it snaps its one-step target onto the scale, so there is
    // nothing to excuse; a decrease press that moves nothing is the callbacks rule's business.
    assert.equal(hit(rounded, 'S4d', 'keys', { prev: prevOf(10.5), expectations: { key: '-', changed: true } }), null);
    const limited = { min: 0.5, max: 10.5, step: 1, from: 5, from_min: 4 };
    assert.equal(hit(limited, 'S4d', 'keys', { prev: prevOf(5), expectations: { key: '-', changed: true } }), null);

    // In double type the question is asked of every handle the press could move. With
    // min_interval holding the from handle at the stop the readme predicts, a press might
    // land there and show nothing, so the entry stays out (n043, on this very scale).
    const paired = { type: 'double', min: 0.5, max: 10.5, step: 1, from: 6, to: 8, min_interval: 1 };
    assert.equal(hit(paired, 'S4a', 'keys', { prev: prevOf(6, 8), expectations: { key: '+', changed: true } }), null);

    // With the from handle fixed there is only one handle left to move, and its press has
    // room to overshoot: the skip is on show (m036, the to handle of a max_interval pair).
    const oneFree = { type: 'double', min: 0.5, max: 10.5, step: 1, from: 4, to: 6, max_interval: 6, from_fixed: true };
    assert.equal(hit(oneFree, 'S4a', 'keys', { prev: prevOf(4, 6), expectations: { key: '+', changed: true } }), 893);

    // step_from_min keeps every reported value on the grid, which is the readme's own fix.
    const onGrid = { min: 0.5, max: 10.5, step: 1, from: 5, step_from_min: true };
    assert.equal(hit(onGrid, 'S4b', 'keys', { prev: prevOf(7.5), expectations: { key: '+', changed: true } }), null);

    // A whole min with a whole step rounds nothing away.
    const plain = { min: 0, max: 100, step: 1, from: 30 };
    assert.equal(hit(plain, 'S4b', 'keys', { prev: prevOf(30), expectations: { key: '+', changed: true } }), null);

    // min 1.2 with step 4 rounds by 0.2, far less than half a step: no press skips.
    const mild = { min: 1.2, max: 21.2, step: 4, from: 5 };
    assert.equal(hit(mild, 'S4b', 'keys', { prev: prevOf(5), expectations: { key: '+', changed: true } }), null);

    assert.equal(hit(rounded, 'S1', 'keys', { prev: prevOf(7) }), null, 'a drag is not a key press');
});

// --------------------------------------- #880 the value attribute in a string values array

// The input's value attribute is looked up in the values array before the array's own
// numeric conversion runs, so a numeric-looking string entry can never be named. Both
// handles fall back to the first entry; what the matrix can SEE is the crossing a
// from_min then opens by lifting `from` above the `to` that fell to entry 0. Without
// that limit the slider is silently wrong -- two handles on the first entry, an input
// that reads back as valid -- and no invariant can report it.
test('#880 matches the crossing a fallen-back value attribute leaves behind', () => {
    const strings = { type: 'double', values: ['10', '20', '30', '40', '50'], from: 1, to: 3, from_min: 1, __value_attr: '20;40' };
    assert.equal(hit(strings, 'S0', 'bounds'), 880);
    assert.equal(hit(strings, 'S0', 'input'), null, 'the input reads back a real entry, so that rule passes');
    // The crossing stands until a stage moves a handle: a blocked or fixed slider
    // carries it to the end of the run, a `to` drag repairs it.
    assert.equal(hit(strings, 'S1', 'bounds', { prev: prevOf(1, 0), expectations: { changed: false } }), 880);
    assert.equal(hit(strings, 'S2', 'bounds', { prev: prevOf(1, 0), expectations: { changed: true } }), null, 'a stage that moves a handle writes a real index');
    assert.equal(hit(strings, 'S2', 'bounds', { prev: prevOf(1, 3), expectations: { changed: false } }), null, 'nothing to excuse once the pair is in order');

    const numbers = { type: 'double', values: [10, 20, 30, 40, 50], from: 1, to: 3, from_min: 1, __value_attr: '20;40' };
    assert.equal(hit(numbers, 'S0', 'bounds'), null, 'a number array is found by the lookup');

    const jsRoute = { type: 'double', values: ['10', '20', '30', '40', '50'], from: 1, to: 3, from_min: 1 };
    assert.equal(hit(jsRoute, 'S0', 'bounds'), null, 'the JS route never goes through the lookup');

    const noLimit = { type: 'double', values: ['10', '20', '30', '40', '50'], from: 1, to: 3, __value_attr: '20;40' };
    assert.equal(hit(noLimit, 'S0', 'bounds'), null, 'without from_min both handles land on entry 0 and nothing is reportable');

    // A values-mode slider built hidden reports no pair at all at S0 (#888), so the bounds
    // rule reports a missing number there, never a crossing -- this entry must not claim it
    // (m024), or it would look as if the crossing had stopped reproducing.
    const hidden = { ...strings, __hidden_at_init: true };
    const entry880 = KNOWN_BUGS.find((bug) => bug.issue === 880);
    assert.equal(entry880.matches(ctxOf(hidden, 'S0'), 'bounds'), false);
    assert.equal(entry880.matches(ctxOf(strings, 'S0'), 'bounds'), true, 'a visible slider still reports the crossing');

    // A crossed pair has a negative gap, so an interval limit is broken along with the
    // ordering; that is the same fallen-back lookup, not a second bug.
    const withInterval = { ...strings, min_interval: 2 };
    assert.equal(hit(withInterval, 'S0', 'intervals'), 880);
    assert.equal(hit(strings, 'S0', 'intervals'), null, 'no interval option, nothing to excuse');
    const withMaxInterval = { ...strings, max_interval: 6 };
    assert.equal(hit(withMaxInterval, 'S0', 'intervals'), null, 'a negative gap never exceeds a max_interval, so that rule passes');
});

// ------------------------------------------- #887 the separator inside the fraction

// The built-in formatting runs its grouping over the whole number, so a value with more
// than three decimals is rendered with a separator inside its fraction.
test('#887 matches a scale fine enough to put four decimals in a label', () => {
    const tiny = { min: 0, max: 0.001, step: 0.0001, from: 0 };
    assert.equal(hit(tiny, 'S1', 'labels'), 887);
    assert.equal(hit(tiny, 'S1', 'grid'), null, 'this slider draws no grid');
    assert.equal(hit({ ...tiny, grid: true }, 'S1', 'grid'), 887);
    assert.equal(hit(tiny, 'S0', 'labels'), null, 'the handle starts on 0, which formats correctly');

    // Three decimals never reach a grouping boundary.
    const coarse = { min: 0, max: 1, step: 0.001, from: 0 };
    assert.equal(hit(coarse, 'S1', 'labels'), null);

    // No separator, nothing to insert.
    const noSeparator = { min: 0, max: 0.001, step: 0.0001, from: 0, prettify_separator: '' };
    assert.equal(hit(noSeparator, 'S1', 'labels'), null);

    // A custom prettify replaces the built-in formatting altogether.
    const custom = { min: 0, max: 0.001, step: 0.0001, from: 0, __prettify: (n) => String(n) };
    assert.equal(hit(custom, 'S1', 'labels'), null);

    // The callback payload carries the same text the label does, so it breaks on the same
    // stages (n041 reports both at S1).
    assert.equal(hit(tiny, 'S1', 'callbacks'), 887);
    assert.equal(hit(tiny, 'S0', 'callbacks'), null, 'the payload starts on 0, which formats correctly');
    assert.equal(hit(tiny, 'S8', 'callbacks'), null, 'destroy() records no payload');
    assert.equal(hit(coarse, 'S1', 'callbacks'), null);
});

// ------------------------------------- #879 a whole-interval move against a handle limit

// The interval-drag path clamps each handle on its own, so a bar drag that runs the
// trailing handle into from_max lets the leading one keep going and stretches the pair.
test('#879 matches a bar drag that reaches from_max, not one that stops short', () => {
    const cfg = { type: 'double', min: 0, max: 1000, step: 5, from: 300, to: 800, drag_interval: true, from_max: 400 };
    assert.equal(hit(cfg, 'S5', 'intervals', { prev: prevOf(310, 710) }), 879, 'the 10 % drag adds 100 and passes from_max');
    assert.equal(hit(cfg, 'S5', 'intervals', { prev: prevOf(200, 600) }), null, 'the same drag stops short of from_max');

    const noLimit = { type: 'double', min: 0, max: 1000, step: 5, from: 300, to: 800, drag_interval: true };
    assert.equal(hit(noLimit, 'S5', 'intervals', { prev: prevOf(310, 710) }), null);

    assert.equal(hit(cfg, 'S2', 'intervals', { prev: prevOf(310, 710) }), null, 'a handle drag moves one handle and owes no width');
});

// The track click takes the same interval path: calc() centres the pair on the click and
// then clamps each handle into its own limits, so a click that carries one handle into
// from_max leaves the other following the pointer. Same bug, same register entry -- which
// is what the widened message pattern is for, since the two stages word their failure
// differently ("a bar drag ..." and "a track click with drag_interval ...").
// Bug caught: a pattern still tied to the bar drag, which leaves the click's stretch
// unexplained and the matrix red on a bug that is already filed; and a predicate that claims
// the click stage without asking whether the clamp splits the pair, which excuses every
// drag_interval cell at S3 and retires the entry on the first one that is healthy.
test('#879 answers the track click that stretches the pair, and leaves an untouched pair alone', () => {
    // n042's option set. Its own pair at S3 -- 300 to 800, five hundred wide -- is already
    // centred on the click at 55 % of the range, so the click moves nothing there; the
    // matrix run bears the rest out, with #879 annotating n042's bar drag and nothing else.
    const n042 = { type: 'double', min: 0, max: 1000, step: 5, from: 300, to: 800, drag_interval: true, from_max: 400 };
    const stretch = 'intervals: a track click with drag_interval moves the whole interval, so its width is unchanged (expected 200, got 250) after S3';
    const narrowPair = { prev: prevOf(500, 700), expectations: { click: true, changed: true } };
    assert.equal(answers(n042, 'S3', 'intervals', stretch, narrowPair), 879, 'centred on 550 the from handle is asked for 450, past its from_max');
    assert.equal(hit(n042, 'S3', 'intervals', { prev: prevOf(300, 800), expectations: { click: true, changed: true } }), null, 'the pair the entry itself brings to the click centres inside its limits');

    // The same click with no limit to run into clamps nothing and keeps the width.
    const noLimit = { ...n042, from_max: undefined };
    assert.equal(answers(noLimit, 'S3', 'intervals', stretch, narrowPair), null);

    // A limit that holds BOTH handles back by the same amount moves the pair as a unit, so
    // the width survives and there is nothing to excuse.
    const bothHeld = { ...n042, from_max: 440, to_max: 640 };
    assert.equal(hit(bothHeld, 'S3', 'intervals', narrowPair), null);

    // The bar drag's own wording is still answered, and the widened pattern still leaves
    // the interval-limit failures of the same rule to the entries filed for them.
    const barDrag = 'intervals: a bar drag moves the whole interval, so its width is unchanged (expected 500, got 600) after S5';
    assert.equal(answers(n042, 'S5', 'intervals', barDrag, { prev: prevOf(310, 710) }), 879);
    assert.equal(answers({ ...n042, min_interval: 100 }, 'S5', 'intervals', 'intervals: the handles closed past min_interval (expected ">= 100", got 40) after S5', { prev: prevOf(310, 710) }), null);
});

// ---------------------------------------- #881 min_interval at a top edge off the scale

// With max half a step above the last reachable value, a from handle driven to the top
// closes to within half the min_interval of a to handle resting on max.
test('#881 matches an interval slider whose to handle rests on an unreachable max', () => {
    const offScaleTop = { type: 'double', min: 0.5, max: 10.5, step: 1, from: 8, to: 10.5, min_interval: 1, drag_over_limit: true };
    const s1 = { prev: prevOf(8, 10.5), expectations: { changed: true, handle: 'from' } };
    assert.equal(hit(offScaleTop, 'S1', 'intervals', s1), 881);

    // The gap stands while nothing moves a handle, and goes once a stage does: the to
    // drag at S2 closes it, and the rule passes there.
    assert.equal(hit(offScaleTop, 'S3', 'intervals', { prev: prevOf(10, 10.5), expectations: { click: true, changed: false } }), 881);
    assert.equal(hit(offScaleTop, 'S2', 'intervals', { prev: prevOf(10, 10.5), expectations: { changed: true, handle: 'to' } }), null);

    // The same scale with the to handle inside the range honours the interval: four
    // matrix entries sit there and must not be excused.
    const insideRange = { type: 'double', min: 0.5, max: 10.5, step: 1, from: 4, to: 8, min_interval: 2 };
    assert.equal(hit(insideRange, 'S1', 'intervals', { prev: prevOf(4, 8), expectations: { changed: true, handle: 'from' } }), null);

    // max on the scale: the top reachable value is max itself and the clamp holds.
    const onScaleTop = { type: 'double', min: 0, max: 10, step: 1, from: 8, to: 10, min_interval: 1, drag_over_limit: true };
    assert.equal(hit(onScaleTop, 'S1', 'intervals', { prev: prevOf(8, 10), expectations: { changed: true, handle: 'from' } }), null);

    const noInterval = { type: 'double', min: 0.5, max: 10.5, step: 1, from: 8, to: 10.5, drag_over_limit: true };
    assert.equal(hit(noInterval, 'S1', 'intervals', s1), null);

    assert.equal(hit(offScaleTop, 'S0', 'intervals'), null, 'the starting pair is a matter for #885');
});

// --------------------------------------------- #884 max_postfix run into a postfix

// The plugin writes a space of its own between max_postfix and postfix. One space is what
// the fix asks for, so a plain postfix ("100+ k") is already right and only a postfix that
// opens with whitespace of its own comes out doubled -- the site's age demo, postfix
// " years". Claiming the plain pair as well would annotate a healthy label away and, on the
// day the register line is written for a cell that never fails, red it as "no longer
// reproduces".
test('#884 matches a postfix that brings its own space after max_postfix', () => {
    const spaced = { min: 0, max: 100, from: 21, prefix: 'Age: ', postfix: ' years', max_postfix: '+' };
    assert.equal(hit(spaced, 'S0', 'labels'), 884);

    const plain = { min: 0, max: 100, from: 21, postfix: 'k', max_postfix: '+' };
    assert.equal(hit(plain, 'S0', 'labels'), null, 'one space is what the label should carry');

    const maxOnly = { min: 0, max: 100, from: 21, max_postfix: '+' };
    assert.equal(hit(maxOnly, 'S0', 'labels'), null);

    const postfixOnly = { min: 0, max: 100, from: 21, postfix: ' years' };
    assert.equal(hit(postfixOnly, 'S0', 'labels'), null);

    assert.equal(hit(spaced, 'S8', 'labels'), null, 'a destroyed slider draws no label');
});

// ------------------------- #894 a handle limit and an interval that cannot both hold

// readme settings table: from_max "Maximum limit for the from handle", max_interval
// "Largest interval between the handles", to_fixed "Fix the position of the to handle".
// With the to handle pinned there is exactly one place the interval leaves for the from
// handle, and the from limit forbids it. The plugin honours the interval and carries the
// handle past its own limit, where it stays for the rest of the run.
test('#894 matches the handle limit a conflicting interval pushes the handle past', () => {
    // The first configuration of the repro: to is pinned at 70, so from has to be at
    // least 66, while from_max says at most 60.
    const pushedUp = { type: 'double', min: 0, max: 100, step: 1, from: 30, to: 70, to_fixed: true, from_max: 60, max_interval: 4 };
    assert.equal(hit(pushedUp, 'S1', 'limits', { prev: prevOf(30, 70), expectations: { changed: true, handle: 'from' } }), 894);
    // Once out, the handle stays out: a later stage that moves nothing still reports it.
    assert.equal(hit(pushedUp, 'S3', 'limits', { prev: prevOf(66, 70), expectations: { click: true, changed: false } }), 894);
    assert.equal(hit(pushedUp, 'S5', 'limits', { prev: prevOf(66, 70), expectations: { bar: true, changed: false } }), 894);
    // Before the first stage that drives the handle there is nothing to excuse: a blocked
    // slider keeps its starting value through every mouse stage, inside its own limit.
    const blocked = { ...pushedUp, block: true };
    assert.equal(hit(blocked, 'S1', 'limits', { prev: prevOf(30, 70), expectations: { changed: false, handle: 'from' } }), null);
    assert.equal(hit(blocked, 'S4a', 'limits', { prev: prevOf(30, 70), expectations: { key: '+', changed: true } }), 894, 'the keyboard still moves a blocked handle (#890), and the conflict pushes it out');

    // The interval itself holds once the handle has been pushed, so that rule passes and
    // must not be excused here.
    assert.equal(hit(pushedUp, 'S1', 'intervals', { prev: prevOf(30, 70), expectations: { changed: true, handle: 'from' } }), null);
    assert.equal(hit(pushedUp, 'S0', 'limits', { prev: null, expectations: { changed: false } }), null, 'validate() keeps the starting value inside the limit');
    assert.equal(hit(pushedUp, 'S6', 'limits', { prev: prevOf(66, 70), expectations: { update: true } }), null, 'update() re-validates and puts the handle back');

    // Neighbours, each differing in exactly the option the conflict needs.
    const roomEnough = { ...pushedUp, from_max: 70 };
    assert.equal(hit(roomEnough, 'S1', 'limits', { prev: prevOf(30, 70), expectations: { changed: true, handle: 'from' } }), null, 'a limit the interval can live with');
    const noInterval = { type: 'double', min: 0, max: 100, step: 1, from: 30, to: 70, to_fixed: true, from_max: 60 };
    assert.equal(hit(noInterval, 'S1', 'limits', { prev: prevOf(30, 70), expectations: { changed: true, handle: 'from' } }), null, 'no interval limit, no conflict');
    const nothingPinned = { type: 'double', min: 0, max: 100, step: 1, from: 30, to: 70, from_max: 60, max_interval: 4 };
    assert.equal(hit(nothingPinned, 'S1', 'limits', { prev: prevOf(30, 70), expectations: { changed: true, handle: 'from' } }), null, 'a free to handle comes to meet the from handle');
});

// The mirror image, from the repro's second configuration: to is pinned at index 3, so
// from has to be at index -1, which is off the bottom of the range. The handle stops at
// min, outside its own from_min, and the interval stays broken as well -- so the interval
// rule reports it at every interaction stage, and a key press that moved the handle is
// measured against a clamp window that has closed to nothing.
test('#894 matches the interval and the key press when the conflict runs out of range', () => {
    const pushedDown = { type: 'double', values: [10, 20, 30, 40, 50], from: 1, to: 3, to_fixed: true, from_min: 1, min_interval: 4 };
    const firstPress = { prev: prevOf(1, 3), expectations: { key: '+', changed: true } };
    assert.equal(hit(pushedDown, 'S4a', 'limits', firstPress), 894);
    assert.equal(hit(pushedDown, 'S4a', 'intervals', firstPress), 894);
    assert.equal(hit(pushedDown, 'S4a', 'keys', firstPress), 894);

    // A press that moved nothing leaves the keys rule silent (it judges the handle a
    // press actually moved), so there is nothing to excuse.
    assert.equal(hit(pushedDown, 'S4b', 'keys', { prev: prevOf(0, 3), expectations: { key: '+', changed: false } }), null);
    assert.equal(hit(pushedDown, 'S1', 'keys', { prev: prevOf(1, 3), expectations: { changed: true, handle: 'from' } }), null, 'a drag is not a key press');

    // Without a limit of its own the handle stops at min and only the interval is broken:
    // the limits rule has nothing to report there and must not be annotated away.
    const noLimit = { type: 'double', values: [10, 20, 30, 40, 50], from: 1, to: 3, to_fixed: true, min_interval: 4 };
    assert.equal(hit(noLimit, 'S4a', 'intervals', firstPress), 894);
    assert.equal(hit(noLimit, 'S4a', 'limits', firstPress), null);

    // An interval the remaining room can satisfy: from_min 1 and min_interval 2 leave the
    // handle index 1, which is exactly where it starts.
    const satisfiable = { ...pushedDown, min_interval: 2 };
    assert.equal(hit(satisfiable, 'S4a', 'intervals', firstPress), null);
    assert.equal(hit(satisfiable, 'S4a', 'keys', firstPress), null);

    // The same conflict with the from handle pinned instead: the to handle is the one
    // asked for a value the range does not hold.
    const fromPinned = { type: 'double', values: [10, 20, 30, 40, 50], from: 1, to: 3, from_fixed: true, min_interval: 4 };
    assert.equal(hit(fromPinned, 'S2', 'intervals', { prev: prevOf(1, 3), expectations: { changed: true, handle: 'to' } }), 894);

    // A pinned handle is what makes the conflict readable off the configuration; with
    // both handles free the pair can open up and honour the interval.
    const bothFree = { type: 'double', values: [10, 20, 30, 40, 50], from: 1, to: 3, from_min: 1, min_interval: 4 };
    assert.equal(hit(bothFree, 'S4a', 'intervals', firstPress), null);
});

// A pair that closes under a whole-interval move was filed as #895 and is no bug: on the
// entry it was found on (m080, 6000 of a million) the interval's bar is under four pixels
// wide and lies beneath two sixteen-pixel handles, so the press aimed at it grabs a handle,
// and a handle dragged onto the other one closes the gap with no min_interval to stop it.
// The suite now recognises a bar narrower than a handle and does not judge that stage on its
// width (test/browser/matrix/matrix.spec.mjs), so there is no failure left for a register
// entry to answer for -- which is what the register-size assertion at the top of this file
// and the width tests in browser-invariants.test.mjs pin between them.

// --------------------------------------------------------------- min equals max (#896)

// readme settings table, onFinish: "Fires when an interaction ends: a handle is released
// (even without moving), the track ... is clicked, or a key is pressed". A slider whose min
// equals max swallows the whole press and fires nothing.
test('#896 matches the interaction stages of a slider with no range, not one with a range', () => {
    const degenerate = { min: 5, max: 5 };
    assert.equal(hit(degenerate, 'S1', 'callbacks'), 896);
    assert.equal(hit(degenerate, 'S3', 'callbacks'), 896);
    assert.equal(hit(degenerate, 'S0', 'callbacks'), null, 'init is not an interaction');
    // S6 is update(), which is not an interaction: the entry that answers there is #883,
    // the from_value every slider without a values array loses.
    assert.equal(hit(degenerate, 'S6', 'callbacks'), 883);
    assert.equal(hit(degenerate, 'S1', 'bounds'), null, 'every other rule stays armed');

    const withRange = { min: 5, max: 6 };
    assert.equal(hit(withRange, 'S1', 'callbacks'), null);

    // A one-entry values array is the same slider, reached the other way.
    const oneEntry = { values: ['only'] };
    assert.equal(hit(oneEntry, 'S1', 'callbacks'), 896);
    const twoEntries = { values: ['a', 'b'] };
    assert.equal(hit(twoEntries, 'S1', 'callbacks'), null);

    // The onFinish line it answers is the one an interaction owes, spelled the way the rule
    // reports it.
    // Bug caught: a message pattern that drifts from the rule's wording, which leaves the
    // failure unexplained and the cell red.
    assert.equal(answers(degenerate, 'S1', 'callbacks', 'callbacks: an interaction ends with exactly one onFinish (expected 1, got 0) after S1'), 896);

    // A disabled or blocked slider owes no onFinish in the first place: the rule judges it
    // by "onFinish must not fire on a disabled or blocked slider", which passes, so there is
    // no failure here for the entry to answer.
    // Bug caught: claiming the inert cells, where the entry would red as "no longer
    // reproduces" on a slider that never had the bug.
    assert.equal(hit({ ...degenerate, disable: true }, 'S1', 'callbacks'), null);
    assert.equal(hit({ ...degenerate, block: true }, 'S3', 'callbacks'), null);
});

// --------------------------------------- #898 the vanishing value labels of a click

// readme settings table, hide_from_to "Hide the from and to value labels": with it off a
// double slider shows the two value labels or the merged one in their place. With the two
// handles on one value the plugin shows the label of the handle last pressed instead, and a
// track click under drag_interval presses neither -- so all three come out hidden, and every
// key press after it redraws the same nothing.
test('#898 matches the track click of a coincident drag_interval pair, not a pair with an interval left', () => {
    // m080's option set, the entry the bug was found on. What puts its handles on one value
    // is a drag: 6000 of a million-wide range is a few pixels of track, so the pair overlaps,
    // the press of a handle drag lands on whichever handle is on top and the crossing guard
    // parks it on the other -- the state a user reaches by dragging one handle onto the
    // other. The click that follows is what hides the labels.
    const m080 = {
        min: 0, max: 1000000, step: 1000, type: 'double', from: 300000, to: 700000,
        from_min: 2400, max_interval: 6000, drag_interval: true, grid: true, grid_margin: false,
        prettify_separator: ',', decorate_both: false, values_separator: ' to ', skin: 'square',
        __hidden_at_init: true, __value_attr: '300000;700000'
    };
    const coincident = { prev: prevOf(700000, 700000), expectations: { click: true, changed: true } };
    assert.equal(hit(m080, 'S3', 'labels', coincident), 898);

    // The keyboard inherits the same whole-interval path, so the four key stages report it too.
    const held = { prev: prevOf(548000, 548000), expectations: { key: '+', changed: true } };
    assert.equal(hit(m080, 'S4a', 'labels', held), 898);
    assert.equal(hit(m080, 'S4d', 'labels', { prev: prevOf(551000, 551000), expectations: { key: '-', changed: true } }), 898);

    // The bar drag pulls the handles apart again and a label comes back, and update()/reset()
    // rebuild the DOM: claiming those stages would annotate a healthy cell and hide the day
    // the bug is fixed.
    assert.equal(hit(m080, 'S5', 'labels', { prev: prevOf(550000, 550000), expectations: { bar: true, changed: true } }), null);
    assert.equal(hit(m080, 'S6', 'labels', { prev: prevOf(550000, 550000), expectations: { update: true } }), null);

    // Before the click there is nothing to excuse: S1 drags one handle and the labels hold.
    assert.equal(hit(m080, 'S1', 'labels', { prev: prevOf(700000, 700000), expectations: { changed: true, handle: 'from' } }), null);

    // A pair with an interval still open between the handles draws its two labels as usual.
    assert.equal(hit(m080, 'S3', 'labels', { prev: prevOf(694000, 700000), expectations: { click: true, changed: true } }), null);

    // Every option the state needs, removed one at a time.
    const noBarDrag = { ...m080, drag_interval: undefined };
    assert.equal(hit(noBarDrag, 'S3', 'labels', coincident), null, 'without drag_interval the click moves one handle and the labels stay');
    const single = { ...m080, type: 'single', to: undefined };
    assert.equal(hit(single, 'S3', 'labels', coincident), null, 'a single slider has no interval to click');
    // The mask swallows the click, so the whole-interval path never runs.
    assert.equal(hit({ ...m080, block: true }, 'S3', 'labels', coincident), null);
    assert.equal(hit({ ...m080, disable: true }, 'S3', 'labels', coincident), null);
    // With hide_from_to on, the rule judges that every value label is hidden and never
    // reports this message, so an entry claiming that cell could never be retired.
    assert.equal(hit({ ...m080, hide_from_to: true }, 'S3', 'labels', coincident), null);

    // The same click is no excuse for a different rule.
    assert.equal(hit(m080, 'S3', 'intervals', coincident), null);
    assert.equal(hit(m080, 'S3', 'grid', coincident), null);
});

// The labels rule speaks for the text of every label as well as for which of them is drawn.
// Bug caught: a `what` wide enough to cover "label text", which would annotate away a label
// reading the wrong value on the very configurations this bug already makes hard to read.
test('#898 answers for the hidden labels, never for the text of one that is drawn', () => {
    const m080 = {
        min: 0, max: 1000000, step: 1000, type: 'double', from: 300000, to: 700000,
        from_min: 2400, max_interval: 6000, drag_interval: true, grid: true, grid_margin: false,
        prettify_separator: ',', decorate_both: false, values_separator: ' to ', skin: 'square'
    };
    const coincident = { prev: prevOf(700000, 700000), expectations: { click: true, changed: true } };
    const hidden = 'labels: neither the merged label nor both value labels are visible (expected "one of them", got "neither") after S3';
    assert.equal(answers(m080, 'S3', 'labels', hidden, coincident), 898);

    for (const message of [
        'labels: the from label text (expected "548,000", got "700,000") after S3',
        'labels: the to label text (expected "548,000", got "700,000") after S3',
        'labels: the merged label text (expected "548,000 to 548,000", got "700,000 to 700,000") after S3',
        'labels: the max label text (expected "1,000,000", got "1000000") after S3',
        'labels: the merged label and the from/to labels are visible together (expected "one of them", got "both") after S3'
    ]) {
        assert.equal(answers(m080, 'S3', 'labels', message, coincident), null, message);
    }
});

// ------------------------------------------------------------------------ judgeStage

// judgeStage is what matrix.spec.mjs calls per stage: it turns a stage's failures into the
// ones that are still real and the annotations for the ones a filed bug covers, and it fails
// when a registered entry stops reproducing.

const DISABLED = { min: 0, max: 100, from: 30, step: 1, disable: true };
const DESTROY_FAILURE = {
    id: 'destroy',
    message: 'destroy: destroy() must leave the input enabled (expected false, got true) after S8'
};

// Bug caught: judgeStage reporting a failure a filed bug already covers, which would leave the
// matrix red on every known bug and make the suite unrunnable.
test('judgeStage annotates a failure its register entry was filed for', () => {
    const { real, annotations } = judgeStage([DESTROY_FAILURE], ctxOf(DISABLED, 'S8'), []);
    assert.deepEqual(real, []);
    assert.equal(annotations.length, 1);
    assert.equal(annotations[0].issue, 886);
    assert.equal(annotations[0].id, 'destroy');
    assert.equal(annotations[0].stage, 'S8');
    assert.equal(annotations[0].message, DESTROY_FAILURE.message);
});

// Bug caught: judgeStage staying silent when a bug is fixed, so the register would keep
// excusing a cell that is healthy again and nobody would retire the entry.
test('judgeStage reports a register entry that no longer reproduces', () => {
    const { real, annotations } = judgeStage([], ctxOf(DISABLED, 'S8'), []);
    assert.deepEqual(annotations, []);
    assert.equal(real.length, 1);
    assert.equal(real[0].id, 'destroy');
    assert.match(real[0].message, /#886 no longer reproduces/);

    // A rule the stage did not check at all (no oracle for it) cannot be retired on.
    assert.deepEqual(judgeStage([], ctxOf(DISABLED, 'S8'), ['destroy']), { real: [], annotations: [] });
});

// Bug caught: judgeStage matching on the invariant id alone -- a second, unrelated failure of
// the same rule on a configuration that carries a filed bug would be annotated away with it.
test('judgeStage keeps a failure whose message the entry was not filed for', () => {
    const other = {
        id: 'destroy',
        message: 'destroy: destroy() must remove the slider container (expected false, got true) after S8'
    };
    const { real, annotations } = judgeStage([DESTROY_FAILURE, other], ctxOf(DISABLED, 'S8'), []);
    assert.equal(annotations.length, 1);
    assert.deepEqual(real, [other]);

    // On a configuration no entry covers, every failure stays real.
    const plain = { min: 0, max: 100, from: 30, step: 1 };
    const bounds = { id: 'bounds', message: 'bounds: from rose above max (expected "<= 100", got 101) after S1' };
    const judged = judgeStage([bounds], ctxOf(plain, 'S1'), []);
    assert.deepEqual(judged.real, [bounds]);
    assert.deepEqual(judged.annotations, []);
});

// m065 carries both bugs: prettify_enabled is off (#889) and drag_interval with a fixed handle
// kills the keyboard after the track click (#891). The missing onFinish is #891's, and #889 is
// listed first -- an id-only lookup hands the failure to the wrong issue.
// Bug caught: annotating by invariant id alone, which files m065's dead keyboard under the
// prettify bug and would leave #891 looking as if it no longer reproduced.
test('the missing onFinish of m065 is answered by #891, not by #889', () => {
    const m065 = {
        min: -50, max: 50, step: 5, type: 'double', from: -20, to: 20,
        from_min: -25, from_max: 10, to_min: -10, to_max: 40, max_interval: 30,
        to_fixed: true, drag_interval: true, prettify_enabled: false,
        prefix: '$', postfix: 'k', hide_from_to: true, skin: 'flat'
    };
    const failure = {
        id: 'callbacks',
        message: 'callbacks: an interaction ends with exactly one onFinish (expected 1, got 0) after S4a'
    };
    // The same stage also carries the interval the starting pair breaks (#885), which is what
    // m065 really reports at S4a; judging the two together is what the matrix does.
    const interval = {
        id: 'intervals',
        message: 'intervals: the handles opened past max_interval (expected "<= 30", got 40) after S4a'
    };
    const ctx = ctxOf(m065, 'S4a', { prev: prevOf(-20, 20), expectations: { key: '+', changed: false } });

    assert.equal(matchKnownBug(ctx, 'callbacks', failure.message).issue, 891);
    const { real, annotations } = judgeStage([failure, interval], ctx, []);
    assert.deepEqual(real, [], 'the dead keyboard records no payload, so #889 has nothing to retire on');
    assert.deepEqual(annotations.map((a) => a.issue).sort(), [885, 891]);
});
