import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KNOWN_BUGS, matchKnownBug } from '../browser/lib/known-bugs.mjs';
import { INVARIANTS } from '../browser/lib/invariants.mjs';

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

/** Every (stage, invariant) pair the register matches for a config. */
const allHits = (cfg, over) => {
    const stages = ['S0', 'S1', 'S2', 'S3', 'S4a', 'S4b', 'S4c', 'S4d', 'S5', 'S6', 'S7', 'S8'];
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
test('every register entry carries an issue number, a title and a predicate', () => {
    assert.equal(KNOWN_BUGS.length, 17);
    const issues = KNOWN_BUGS.map((bug) => bug.issue);
    assert.deepEqual(issues, [...new Set(issues)], 'an issue must have one entry');
    for (const bug of KNOWN_BUGS) {
        assert.equal(typeof bug.issue, 'number', 'issue number');
        assert.ok(bug.title && bug.title.length > 15, `#${bug.issue} needs a one-line title`);
        assert.equal(typeof bug.matches, 'function', `#${bug.issue} needs a predicate`);
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
    assert.equal(hit(hidden, 'S0', 'callbacks'), 888);
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
test('#891 matches the key stages of a drag_interval slider with a fixed handle', () => {
    const dead = { type: 'double', min: 0, max: 100, from: 30, to: 70, step: 1, drag_interval: true, from_fixed: true };
    assert.equal(hit(dead, 'S4a', 'callbacks'), 891);
    assert.equal(hit(dead, 'S4d', 'callbacks'), 891);
    assert.equal(hit(dead, 'S3', 'callbacks'), null, 'the click itself still reports');

    const noDrag = { type: 'double', min: 0, max: 100, from: 30, to: 70, step: 1, from_fixed: true };
    assert.equal(hit(noDrag, 'S4a', 'callbacks'), null);

    const noFixed = { type: 'double', min: 0, max: 100, from: 30, to: 70, step: 1, drag_interval: true };
    assert.equal(hit(noFixed, 'S4a', 'callbacks'), null);

    // An inert slider never gets the click that arms the interval path, so its keyboard
    // stays ordinary: that is #890's case, not this one.
    const blocked = { type: 'double', min: 0, max: 100, from: 30, to: 70, step: 1, drag_interval: true, to_fixed: true, block: true };
    assert.notEqual(hit(blocked, 'S4a', 'callbacks'), 891);
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
    assert.equal(hit(rounded, 'S4d', 'keys', { prev: prevOf(10.5), expectations: { key: '-', changed: true } }), 893);
    // The same at the bottom of a limited range.
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
});

// ------------------------------------------------- #879 a bar drag against from_max

// The interval-drag path clamps each handle on its own, so a bar drag that runs the
// trailing handle into from_max lets the leading one keep going and stretches the pair.
test('#879 matches a bar drag that reaches from_max, not one that stops short', () => {
    const cfg = { type: 'double', min: 0, max: 1000, step: 5, from: 300, to: 800, drag_interval: true, from_max: 400 };
    assert.equal(hit(cfg, 'S5', 'intervals', { prev: prevOf(310, 710) }), 879, 'the 10 % drag adds 100 and passes from_max');
    assert.equal(hit(cfg, 'S5', 'intervals', { prev: prevOf(200, 600) }), null, 'the same drag stops short of from_max');

    const noLimit = { type: 'double', min: 0, max: 1000, step: 5, from: 300, to: 800, drag_interval: true };
    assert.equal(hit(noLimit, 'S5', 'intervals', { prev: prevOf(310, 710) }), null);

    assert.equal(hit(cfg, 'S2', 'intervals', { prev: prevOf(310, 710) }), null, 'only the bar drag stage moves the pair as a unit');
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

// The plugin writes a space of its own between max_postfix and postfix, which doubles the
// space of a postfix that already starts with one (the site's own age demo).
test('#884 matches a label carrying both max_postfix and postfix', () => {
    const both = { min: 0, max: 100, from: 21, prefix: 'Age: ', postfix: ' years', max_postfix: '+' };
    assert.equal(hit(both, 'S0', 'labels'), 884);

    const maxOnly = { min: 0, max: 100, from: 21, max_postfix: '+' };
    assert.equal(hit(maxOnly, 'S0', 'labels'), null);

    const postfixOnly = { min: 0, max: 100, from: 21, postfix: ' years' };
    assert.equal(hit(postfixOnly, 'S0', 'labels'), null);

    assert.equal(hit(both, 'S8', 'labels'), null, 'a destroyed slider draws no label');
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

// ------------------------------------ #895 a bar drag collapses a max_interval pair

// readme settings table: drag_interval "Let the user drag the whole interval by its bar",
// max_interval "Largest interval between the handles". Once the clamp has settled the pair
// at exactly max_interval, the next bar drag runs the trailing handle into the leading one
// and the interval disappears.
test('#895 matches a bar drag on a pair sitting at max_interval', () => {
    const cfg = { type: 'double', min: 0, max: 1000000, step: 1000, from: 300000, to: 700000, max_interval: 6000, drag_interval: true };
    assert.equal(hit(cfg, 'S5', 'intervals', { prev: prevOf(499000, 505000), expectations: { bar: true, changed: true } }), 895);

    // A pair the clamp has not yet closed to max_interval survives the drag intact.
    assert.equal(hit(cfg, 'S5', 'intervals', { prev: prevOf(499000, 504000), expectations: { bar: true, changed: true } }), null);

    // An interval wider than the drag itself travels as a unit: the trailing handle never
    // reaches the leading one, and the pair keeps its width.
    const wideInterval = { type: 'double', min: 0.5, max: 10.5, step: 1, from: 4, to: 8, from_min: 4, from_max: 7, min_interval: 4, max_interval: 4, drag_interval: true };
    assert.equal(hit(wideInterval, 'S5', 'intervals', { prev: prevOf(5, 9), expectations: { bar: true, changed: true } }), null);
    assert.equal(hit(cfg, 'S3', 'intervals', { prev: prevOf(499000, 505000), expectations: { click: true, changed: true } }), null, 'the bar drag is the only stage that moves the pair as a unit');

    // Every option the collapse needs, removed one at a time.
    const noMaxInterval = { type: 'double', min: 0, max: 1000000, step: 1000, from: 300000, to: 700000, drag_interval: true };
    assert.equal(hit(noMaxInterval, 'S5', 'intervals', { prev: prevOf(499000, 505000), expectations: { bar: true, changed: true } }), null);
    const noBarDrag = { type: 'double', min: 0, max: 1000000, step: 1000, from: 300000, to: 700000, max_interval: 6000 };
    assert.equal(hit(noBarDrag, 'S5', 'intervals', { prev: prevOf(499000, 505000), expectations: { bar: true, changed: true } }), null);

    // A fixed handle drops the whole drag, and an inert slider never sees it.
    const fixed = { ...cfg, to_fixed: true };
    assert.equal(hit(fixed, 'S5', 'intervals', { prev: prevOf(499000, 505000), expectations: { bar: true, changed: false } }), null);
    const blocked = { ...cfg, block: true };
    assert.equal(hit(blocked, 'S5', 'intervals', { prev: prevOf(499000, 505000), expectations: { bar: true, changed: false } }), null);

    // The bar drag against a from_max is the other interval-drag bug (#879) and keeps its
    // own entry: this one takes no per-handle limit at all.
    assert.equal(hit(cfg, 'S5', 'limits', { prev: prevOf(499000, 505000), expectations: { bar: true, changed: true } }), null);
});
