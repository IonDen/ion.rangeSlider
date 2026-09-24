/**
 * #877 browser suite -- Task 15: the callbacks, per interaction path, and what they carry.
 *
 * The oracle is readme.md: the settings rows for onStart, onChange, onFinish, onUpdate,
 * onInit and scope, and the "Callback data" block (its field list and its comments). The
 * rows check which callbacks each path fires and in what order, the keys of the payload,
 * the from_value and to_value of a slider without `values`, the `this` every callback runs
 * with, and the `change` and `input` events the plugin triggers on the input. The readme
 * documents no DOM events, so the rows about them are characterization and say so.
 *
 * The fixture's recorder copies named payload fields only, so the rows that need the
 * payload itself (its keys, `this`, the moment of the first render) pass a callback in the
 * config string; the fixture calls it before recording (the chaining hook added for #359).
 *
 * These are characterization tests of shipped behaviour, so each names in a comment the
 * one-line change to js/ion.rangeSlider.js that reds it. Each was applied live, run, watched
 * red and reverted.
 */
import { test, expect } from '@playwright/test';
import { open, events, LABEL } from '../helpers.mjs';
import { readState } from '../lib/state.mjs';
import { dragHandleTo, clickTrackAt, focusTrack, xForFraction } from '../lib/interact.mjs';

/** readme "Callback data": the eighteen fields of the documented payload. */
const DOCUMENTED_KEYS = [
    'input', 'slider', 'min', 'max',
    'from', 'from_percent', 'from_value', 'from_min', 'from_max',
    'to', 'to_percent', 'to_value', 'to_min', 'to_max',
    'min_pretty', 'max_pretty', 'from_pretty', 'to_pretty'
].sort();

/** Callback and DOM-event types recorded after the first `n` events. */
const typesAfter = async (page, n) => (await events(page)).slice(n).map((e) => e.type);

/** The recorded `dom:*` events after the first `n`, as `type=value` strings. */
const domAfter = async (page, n) => (await events(page)).slice(n)
    .filter((e) => e.type.indexOf('dom:') === 0)
    .map((e) => `${e.type}=${e.value}`);

/**
 * How from_value and to_value arrived in each recorded callback: "null", "undefined" or the
 * typeof of anything else. Read inside the page, so the distinction between null and
 * undefined never depends on how the result is carried back to the test.
 */
const valueKinds = (page) => page.evaluate(() => window.__irs.events
    .filter((e) => e.type.indexOf('dom:') !== 0)
    .map((e) => {
        const kind = (v) => (v === null ? 'null' : typeof v);
        return `${e.type}:${kind(e.from_value)}/${kind(e.to_value)}`;
    }));

test.describe(`callbacks (${LABEL})`, () => {
    // ---- Which callbacks each path fires ---------------------------------------------------
    // readme Settings: onChange "Fires on each value change made by the user. Not fired by
    // update(), reset() or a container resize"; onFinish "Fires when an interaction ends: a
    // handle is released (even without moving), the track (the line the handles move on) is
    // clicked, or a key is pressed"; onUpdate "Fires when the slider is modified by update()
    // or reset()". Already held elsewhere and not repeated: init firing onStart once
    // (smoke.spec.mjs) and onInit after it (features.spec.mjs, #359); a single-handle drag,
    // a track click and an arrow press on a single slider (smoke.spec.mjs). These rows are
    // the paths those do not reach.

    // Mutation caught: drawHandles() -> `if (this.is_key || this.is_click) {` becomes
    // `if (this.is_click) {`, and the press reports onChange with no onFinish.
    test('a key press on a double slider fires onChange then onFinish (Settings: onChange, onFinish)', async ({ page }) => {
        await open(page, { type: 'double', min: 0, max: 100, from: 40, to: 60, step: 1 });
        await focusTrack(page);
        await page.waitForTimeout(400);   // a focus alone must not reach the log; give it a tick
        const before = (await events(page)).length;

        await page.keyboard.press('ArrowRight');
        await expect(page.locator('#slider')).toHaveValue('41;60');
        await expect.poll(() => typesAfter(page, before)).toEqual(['onChange', 'onFinish']);
        await page.waitForTimeout(400);   // outlast the idle render tick: nothing else follows
        expect(await typesAfter(page, before)).toEqual(['onChange', 'onFinish']);
    });

    // Mutation caught: drawHandles() -> `if (this.is_key || this.is_click) {` becomes
    // `if (this.is_key) {`, and the click reports onChange with no onFinish.
    test('a track click on a double slider fires onChange then onFinish (Settings: onChange, onFinish)', async ({ page }) => {
        await open(page, { type: 'double', min: 0, max: 100, from: 40, to: 60, step: 1 });
        const before = (await events(page)).length;

        await clickTrackAt(page, 0.1);
        await expect(page.locator('#slider')).toHaveValue('10;60');
        await expect.poll(() => typesAfter(page, before)).toEqual(['onChange', 'onFinish']);
        await page.waitForTimeout(400);
        expect(await typesAfter(page, before)).toEqual(['onChange', 'onFinish']);
    });

    // Mutation caught: drawHandles() -> drop `!this.is_update &&` from the onChange
    // condition, and the rebuild reports the new value as an onChange after the onUpdate.
    test('update() that moves the value fires onUpdate alone (Settings: onUpdate, onChange)', async ({ page }) => {
        await open(page, { min: 0, max: 100, from: 50, step: 1 });
        const before = (await events(page)).length;

        await page.evaluate(() => window.__irs.slider.update({ from: 30 }));
        await expect(page.locator('#slider')).toHaveValue('30');
        await page.waitForTimeout(400);   // outlast the idle render tick before reading the log
        expect(await typesAfter(page, before)).toEqual(['onUpdate']);
    });

    // Mutation caught: the same `!this.is_update &&` dropped, and the return to 50 is
    // reported as an onChange after the onUpdate.
    test('reset() that moves the value fires onUpdate alone (Settings: onUpdate, onChange)', async ({ page }) => {
        await open(page, { min: 0, max: 100, from: 50, step: 1 });
        await dragHandleTo(page, 'single', 0.7);
        await expect(page.locator('#slider')).toHaveValue('70');
        await page.waitForTimeout(400);   // let the drag's own callbacks land first
        const before = (await events(page)).length;

        await page.evaluate(() => window.__irs.slider.reset());
        await expect(page.locator('#slider')).toHaveValue('50');
        await page.waitForTimeout(400);
        expect(await typesAfter(page, before)).toEqual(['onUpdate']);
    });

    // A resize is none of the three: no change by the user, no interaction that ends, no
    // update(). layout.spec.mjs holds the missing onChange; this row holds the whole log.
    // Mutation caught: drawHandles() -> `if (this.is_key || this.is_click) {` becomes `if
    // (this.is_key || this.is_click || this.is_resize) {`, and the relayout fires onFinish.
    // Mutation caught: drawHandles()'s onChange condition loses both of its guards against
    // this path, `if (!this.is_update && !this.is_start && !this.is_finish) {`, and the
    // relayout fires onChange.
    test('a container resize fires no callback at all (Settings: onChange, onFinish, onUpdate)', async ({ page }) => {
        await open(page, { min: 0, max: 100, from: 40, step: 1 });
        const centred = async () => {
            const state = await readState(page);
            const box = state.handles.single.box;
            return Math.abs(box.x + box.width / 2 - xForFraction(state.line, box.width, 0.4)) <= 1;
        };
        expect(await centred()).toBe(true);

        await page.evaluate(() => { document.getElementById('wrap').style.width = '400px'; });
        // The relayout has run once the handle sits on 40 of the narrower track.
        await expect.poll(async () => (await readState(page)).line.width).toBe(400);
        await expect.poll(centred).toBe(true);
        await page.waitForTimeout(400);
        expect(await typesAfter(page, 0)).toEqual(['onStart']);
    });

    // ---- The payload ---------------------------------------------------------------------
    // readme "Callback data": "All callbacks receive the same object as their first
    // argument", and the block lists its eighteen fields. The readme's example is a double
    // slider (from 10000, to 90000). onStart is read here because it is the first payload a
    // slider hands out.
    // Mutation caught: the constructor's result object -> drop `from_min:
    // this.options.from_min,`, and onStart arrives with seventeen keys.
    test('the onStart payload of a double slider carries exactly the documented keys (Callback data)', async ({ page }) => {
        await open(page, "{ type: 'double', min: 0, max: 100, from: 20, to: 80, "
            + "onStart: function (d) { window.__keys = Object.keys(d).sort(); } }");
        expect(await page.evaluate(() => window.__keys)).toEqual(DOCUMENTED_KEYS);
    });

    // The same list on a single slider. The payload of a single slider carries to,
    // to_percent, to_value, to_min and to_max, but no to_pretty until the first update() or
    // reset() writes one, so onStart, onChange and onFinish hand out seventeen of the
    // eighteen documented keys.
    test('the onStart payload of a single slider carries exactly the documented keys (Callback data)', async ({ page }) => {
        test.fail(true, 'unfiled: a single slider sends no to_pretty until the first update() or reset()');
        await open(page, "{ min: 0, max: 100, from: 20, "
            + "onStart: function (d) { window.__keys = Object.keys(d).sort(); } }");
        expect(await page.evaluate(() => window.__keys)).toEqual(DOCUMENTED_KEYS);
    });

    // readme "Callback data", from_value and to_value: "the entry at this index when values
    // is used (null until the first update() or reset() on a slider without values, then
    // undefined)". Before any update() both fields are null, on onStart and on the
    // callbacks of a drag.
    // Mutation caught: the constructor's result object -> `from_value: null,` becomes
    // `from_value: undefined,`, and every payload reports from_value undefined.
    test('from_value and to_value are null before the first update() on a slider without values (Callback data)', async ({ page }) => {
        await open(page, { type: 'double', min: 0, max: 100, from: 20, to: 80, step: 1 });
        await dragHandleTo(page, 'from', 0.4);
        await expect(page.locator('#slider')).toHaveValue('40;80');
        await expect.poll(() => typesAfter(page, 0).then((t) => t.at(-1))).toBe('onFinish');

        const kinds = await valueKinds(page);
        expect(kinds[0]).toBe('onStart:null/null');
        expect(kinds).toContain('onChange:null/null');
        expect(kinds.filter((k) => !k.endsWith(':null/null'))).toEqual([]);
    });

    // The same comment, second half: after update() both fields are undefined, on the
    // onUpdate payload and on every callback after it. The readme documents this, so the row
    // asserts it; #883 is the issue that would change the behaviour, and the readme with it.
    // Mutation caught: updateFrom() -> `if (this.options.values) {` becomes `if
    // (this.options.values.length) {`, which leaves from_value null through update(), and the
    // onUpdate payload reports "null/undefined".
    test('from_value and to_value are undefined after update() on a slider without values (Callback data)', async ({ page }) => {
        await open(page, { type: 'double', min: 0, max: 100, from: 20, to: 80, step: 1 });
        await page.evaluate(() => window.__irs.slider.update({ from: 30 }));
        await expect(page.locator('#slider')).toHaveValue('30;80');
        await page.waitForTimeout(400);
        await dragHandleTo(page, 'from', 0.4);
        await expect(page.locator('#slider')).toHaveValue('40;80');
        await expect.poll(() => typesAfter(page, 0).then((t) => t.at(-1))).toBe('onFinish');

        const kinds = await valueKinds(page);
        expect(kinds[0]).toBe('onStart:null/null');
        expect(kinds[1]).toBe('onUpdate:undefined/undefined');
        expect(kinds.slice(1).filter((k) => !k.endsWith(':undefined/undefined'))).toEqual([]);
        expect(kinds).toContain('onChange:undefined/undefined');
    });

    // ---- scope ---------------------------------------------------------------------------
    // readme Settings, scope: "Scope for callbacks". Every callback runs with the scope
    // object as `this`: onStart and onInit at init, onChange and onFinish on a drag, onUpdate
    // on update().
    // Mutation caught: callOnChange() -> `this.options.onChange.call(this.options.scope,
    // this.result);` becomes `this.options.onChange(this.result);`, and onChange runs with
    // the options object as `this`, whose tag is undefined.
    test('every callback runs with the scope object as this (Settings: scope)', async ({ page }) => {
        const push = (name) => `${name}: function () { (window.__tags = window.__tags || []).push(['${name}', this.tag]); }`;
        const config = "{ min: 0, max: 100, from: 20, step: 1, scope: { tag: 'x' }, "
            + ['onStart', 'onInit', 'onChange', 'onFinish', 'onUpdate'].map(push).join(', ') + ' }';
        await open(page, config, { record_init: '1' });
        await dragHandleTo(page, 'single', 0.4);
        await expect(page.locator('#slider')).toHaveValue('40');
        await page.evaluate(() => window.__irs.slider.update({ from: 60 }));
        await expect(page.locator('#slider')).toHaveValue('60');

        const tags = await page.evaluate(() => window.__tags);
        const names = new Set(tags.map(([name]) => name));
        expect([...names].sort()).toEqual(['onChange', 'onFinish', 'onInit', 'onStart', 'onUpdate']);
        expect(tags.filter(([, tag]) => tag !== 'x')).toEqual([]);
    });

    // ---- DOM events on the input -----------------------------------------------------------
    // Characterization: the readme documents no DOM events. The plugin triggers `change`
    // and then `input` on the input (through jQuery, so listeners bound with jQuery hear
    // them) each time the value it writes there changes, and the fixture's dom_events=1
    // records both. A value change made by the user triggers one of each per value.

    // Mutation caught: drawHandles() -> `if (changed && !this.is_start) {` (the trigger's
    // guard) becomes `if (!this.is_start) {`, and the release of the drag triggers a
    // second pair with the value already reported.
    test('a drag triggers one change and one input event per value it reports (characterization)', async ({ page }) => {
        await open(page, { min: 0, max: 100, from: 20, step: 1 }, { dom_events: '1' });
        await dragHandleTo(page, 'single', 0.6);
        await expect(page.locator('#slider')).toHaveValue('60');
        await page.waitForTimeout(400);

        const log = await events(page);
        const reported = log.filter((e) => e.type === 'onChange').map((e) => String(e.from));
        expect(reported.length).toBeGreaterThan(0);
        expect(log.filter((e) => e.type === 'dom:change').map((e) => e.value)).toEqual(reported);
        expect(log.filter((e) => e.type === 'dom:input').map((e) => e.value)).toEqual(reported);
    });

    // Mutation caught: drawHandles() -> drop `this.$cache.input.trigger("change");`, and the
    // click triggers the input event alone.
    test('a track click triggers one change and one input event (characterization)', async ({ page }) => {
        await open(page, { min: 0, max: 100, from: 20, step: 1 }, { dom_events: '1' });
        await clickTrackAt(page, 0.6);
        await expect(page.locator('#slider')).toHaveValue('60');
        await page.waitForTimeout(400);
        expect(await domAfter(page, 0)).toEqual(['dom:change=60', 'dom:input=60']);
    });

    // Mutation caught: drawHandles() -> drop `this.$cache.input.trigger("input");`, and the
    // press triggers the change event alone.
    test('a key press triggers one change and one input event (characterization)', async ({ page }) => {
        await open(page, { min: 0, max: 100, from: 20, step: 1 }, { dom_events: '1' });
        await focusTrack(page);
        await page.keyboard.press('ArrowRight');
        await expect(page.locator('#slider')).toHaveValue('21');
        await page.waitForTimeout(400);
        expect(await domAfter(page, 0)).toEqual(['dom:change=21', 'dom:input=21']);
    });

    // The first render writes the starting value into the input and triggers nothing. The
    // fixture binds its dom_events listener after the plugin has returned, too late to hear
    // the first render, so this row binds its own from onStart, which the plugin calls just
    // before that render.
    // Mutation caught: drawHandles() -> `if (changed && !this.is_start) {` becomes `if
    // (changed) {`, and the first render triggers change and input with the starting 20.
    test('the first render triggers no change or input event (characterization)', async ({ page }) => {
        await open(page, "{ min: 0, max: 100, from: 20, step: 1, onStart: function (d) { "
            + "d.input.on('change input', function (e) { window.__irs.events.push({ type: 'dom:' + e.type, which: 1, value: this.value }); }); } }");
        await expect(page.locator('#slider')).toHaveValue('20');
        await page.waitForTimeout(400);
        expect(await typesAfter(page, 0)).toEqual(['onStart']);
    });

    // update() rebuilds the slider and writes the new value into the input like any other
    // change, so it triggers the pair once with the new value, while the onUpdate row above
    // shows onChange staying silent.
    // Mutation caught: drawHandles() -> `if (changed && !this.is_start) {` becomes `if
    // (changed && !this.is_start && !this.is_update) {`, and the update triggers nothing.
    test('update() that moves the value triggers one change and one input event (characterization)', async ({ page }) => {
        await open(page, { min: 0, max: 100, from: 50, step: 1 }, { dom_events: '1' });
        await page.evaluate(() => window.__irs.slider.update({ from: 30 }));
        await expect(page.locator('#slider')).toHaveValue('30');
        await page.waitForTimeout(400);
        expect(await domAfter(page, 0)).toEqual(['dom:change=30', 'dom:input=30']);
    });

    // reset() goes through update(), so it triggers the pair the same way.
    // Mutation caught: the same `&& !this.is_update` added to the trigger's guard, and the
    // reset triggers nothing.
    test('reset() that moves the value triggers one change and one input event (characterization)', async ({ page }) => {
        await open(page, { min: 0, max: 100, from: 50, step: 1 }, { dom_events: '1' });
        await dragHandleTo(page, 'single', 0.7);
        await expect(page.locator('#slider')).toHaveValue('70');
        await page.waitForTimeout(400);
        const before = (await events(page)).length;

        await page.evaluate(() => window.__irs.slider.reset());
        await expect(page.locator('#slider')).toHaveValue('50');
        await page.waitForTimeout(400);
        expect(await domAfter(page, before)).toEqual(['dom:change=50', 'dom:input=50']);
    });
});
