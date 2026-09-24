/**
 * #877 browser suite -- Task 12: the slider against containers that are not the plain
 * 600 px block the rest of the suite renders into.
 *
 * Everything the plugin draws is a percentage of the track, measured at init and
 * re-measured by the 300 ms idle tick, so a narrow container, a container that is hidden
 * when the slider is built, a container that changes width afterwards and a flex parent
 * each take a different path through the same maths.
 *
 * The rows check that a drag lands on the value its position names in a narrow and in a
 * flex container, that a slider built hidden reports its value at init and draws it once
 * shown, and that a container that changes width gets a fresh layout. readme Settings,
 * onChange: "Fires on each value change made by the user. Not fired by update(), reset()
 * or a container resize." The reveal row and the resize row check that the new layout is
 * not reported as a change; the drags in the other rows are changes made by the user and
 * are not judged on their callbacks here.
 *
 * What a hidden container measures depends on the jQuery build. Before 3.3 jQuery parses
 * the unresolved "100%" width of a hidden track as 100 px, and the slider is laid out at
 * init as if it were visible; from 3.3 on it measures 0, and the slider draws nothing
 * until it is shown. The hidden rows read which kind of build the run is on with
 * readEnv() from ../lib/env.mjs.
 *
 * The width fix for flex parents itself (#776) is covered by
 * test/browser/flex-container.spec.mjs; what this file adds there is that a drag inside a
 * flex parent lands where it does in a block one.
 *
 * These are characterization tests of shipped behaviour, so each row names in a comment
 * the one-line change to js/ion.rangeSlider.js that reds it; the two rows tagged with a
 * filed defect name it for the builds that do not reproduce the defect. Each was applied
 * live, run, watched red and reverted. The no-change assertions of the reveal and resize
 * rows are guarded twice in the plugin, and their comments say which change reds them.
 */
import { test, expect } from '@playwright/test';
import { open, events, LABEL } from '../helpers.mjs';
import { readState } from '../lib/state.mjs';
import { dragHandleTo, xForFraction } from '../lib/interact.mjs';
import { readEnv } from '../lib/env.mjs';

/** Page x of the handle's centre, and the x the same value fraction should put it at. */
async function handleCentre(page) {
    const state = await readState(page);
    const box = state.handles.single.box;
    return { centre: box.x + box.width / 2, line: state.line, width: box.width };
}

test.describe(`layout (${LABEL})`, () => {
    // The pointer is turned into a percentage of the measured track, so the same gesture
    // has to mean the same value whatever the container is wide. 300 px is half the
    // suite's default, which doubles any error that came from a width taken once and kept.
    // Mutation caught: calcPointerPercent() -> `this.coords.x_pointer / this.coords.w_rs *
    // 100` becomes `this.coords.x_pointer / 600 * 100`, a width that is right for the rest
    // of the suite and wrong here, and the three drags land on 18, 30 and 43.
    for (const [fraction, value] of [[0.25, '25'], [0.5, '50'], [0.75, '75']]) {
        test(`a drag to ${fraction} of a 300 px track lands on ${value}`, async ({ page }) => {
            await open(page, { min: 0, max: 100, from: 10 }, { width: '300' });

            await dragHandleTo(page, 'single', fraction);
            await expect(page.locator('#slider')).toHaveValue(value);
        });
    }

    // Inside a display:none container, jQuery 3.3 and later measure the track as 0, so
    // nothing is positioned at init: the input holds the value, the label still holds the
    // template text "0". Before 3.3 jQuery measures the same track as 100 px, so the slider
    // is laid out at init as if it were visible, and the label already reads the value.
    // Either way the idle tick keeps measuring, and the first tick after the container is
    // revealed lays the slider out for its real width. readme Settings, onInit: "for a
    // slider that starts hidden, edit its DOM only after it first becomes visible."
    // Mutation caught: updateScene() -> the idle re-schedule
    // `setTimeout(this.updateScene.bind(this), 300)` becomes `setTimeout(..., 300000)`.
    // From 3.3 on the revealed slider then never draws its labels; before 3.3 its handle
    // keeps the place it was given on the 100 px track.
    // The no-change assertion at the end is guarded twice. From 3.3 on the reveal is the
    // slider's first render, so both `!this.is_resize` and `!this.is_start` keep onChange
    // from firing, and dropping either one alone leaves this row green; it goes red when
    // drawHandles()'s onChange condition loses both, e.g. `if (changed && !this.is_update
    // && !this.is_finish)`. Before 3.3 the reveal changes no value, so `changed` and
    // `!this.is_resize` are the two guards there, and the row goes red when both go:
    // `if (!this.is_update && !this.is_start && !this.is_finish)`.
    test('a slider built in a hidden container lays itself out once it is shown', async ({ page }) => {
        await open(page, { min: 0, max: 100, from: 40 }, { hidden: '1' });
        const env = await readEnv(page);

        const hidden = await readState(page);
        expect(hidden.input.value).toBe('40');
        expect(hidden.labels.single.text).toBe(env.hiddenTrackMeasuresZero ? '0' : '40');

        await page.evaluate(() => { document.getElementById('wrap').style.display = 'block'; });

        await expect(page.locator('#wrap .irs-single')).toHaveText('40');
        await expect(page.locator('#wrap .irs-min')).toHaveText('0');
        await expect(page.locator('#wrap .irs-max')).toHaveText('100');
        await expect.poll(async () => {
            const { centre, line, width } = await handleCentre(page);
            return Math.abs(centre - xForFraction(line, width, 0.4)) <= 1;
        }).toBe(true);

        // Being laid out for the first time is not a change made by the user.
        expect((await events(page)).filter((e) => e.type === 'onChange')).toEqual([]);
    });

    // readme "Callback data": from_pretty is "FROM formatted", the text the label is built
    // from. onStart fires before the first render. On jQuery 3.3 and later a slider built
    // inside a hidden container has measured no track by then, and the two formatted
    // handle fields are missing from the payload while min_pretty and max_pretty are
    // filled in (#897). Before 3.3 the same slider is laid out at init and the payload is
    // complete, so the failure is expected only on the builds that measure the hidden
    // track as 0.
    // Mutation caught before 3.3: calc() -> in the single type, drop
    // `this.result.from_pretty = this._prettify(this.result.from);`, and onStart carries
    // no from_pretty.
    test('onStart from a hidden container carries the formatted handle values (Callback data: from_pretty)', async ({ page }) => {
        await open(page, { min: 0, max: 100, from: 40 }, { hidden: '1' });
        const env = await readEnv(page);
        test.fail(env.hiddenTrackMeasuresZero, '#897: a slider built inside a hidden container reports no from_pretty or to_pretty in onStart and onInit');

        const onStart = (await events(page)).find((e) => e.type === 'onStart');
        expect(onStart.min_pretty).toBe('0');
        expect(onStart.from_pretty).toBe('40');
    });

    // readme "Callback data": in values mode from holds the index and from_value "the
    // actual entry at that index"; the input carries the entry the same way. On jQuery
    // 3.3 and later a slider built inside a hidden container reports neither until it is
    // revealed (#888). Before 3.3 it is laid out at init and reports both, so the failure
    // is expected only on the builds that measure the hidden track as 0.
    // Mutation caught before 3.3: writeToInput() -> in the single type's values branch,
    // `this.$cache.input.prop("value", this.result.from_value)` writes
    // `this.result.from`, and the input reads the index 1.
    test('a values-mode slider built in a hidden container reports its entry (note "values")', async ({ page }) => {
        await open(page, { values: ['a', 'b', 'c'], from: 1 }, { hidden: '1' });
        const env = await readEnv(page);
        test.fail(env.hiddenTrackMeasuresZero, '#888: a values-mode slider built in a hidden container leaves its input empty');

        const state = await readState(page);
        expect(state.input.value).toBe('b');
        const onStart = state.events.find((e) => e.type === 'onStart');
        expect(onStart.from_value).toBe('b');
    });

    // The idle tick compares the measured track against the one it last drew for, and a
    // container that changed width gets a full relayout. The handle's left is a
    // percentage of the track, so it moves with the container on its own; what the
    // relayout fixes is the share of the track the handle itself takes up, which is why
    // the assertion is on the handle's centre against the value it carries rather than on
    // the bare fact that it moved.
    // Mutation caught: drawHandles() -> `if (this.coords.w_rs !== this.coords.w_rs_old)`
    // becomes `if (false)`, so the width change no longer forces a relayout and the handle
    // keeps the percentage it was given at 600 px.
    // The no-change assertion at the end is guarded twice: a resize changes no value, so
    // `changed` keeps onChange from firing, and so does `!this.is_resize`. Dropping either
    // one alone leaves this row green; it goes red when drawHandles()'s onChange condition
    // loses both, e.g. `if (!this.is_update && !this.is_start && !this.is_finish)`.
    test('a container that changes width relays the slider out without reporting a change', async ({ page }) => {
        await open(page, { min: 0, max: 100, from: 40 });

        const before = await handleCentre(page);
        expect(Math.abs(before.centre - xForFraction(before.line, before.width, 0.4))).toBeLessThanOrEqual(1);

        await page.evaluate(() => { document.getElementById('wrap').style.width = '400px'; });

        await expect.poll(async () => {
            const { centre, line, width } = await handleCentre(page);
            return Math.abs(centre - xForFraction(line, width, 0.4)) <= 1;
        }).toBe(true);
        await expect(page.locator('#slider')).toHaveValue('40');

        // A resize is not a change made by the user.
        expect((await events(page)).filter((e) => e.type === 'onChange')).toEqual([]);
    });

    // #776 gave .irs a width of its own so a flex parent cannot collapse it. A track that
    // is the right width still has to convert a pointer the same way, which is what this
    // adds to the width coverage in test/browser/flex-container.spec.mjs.
    // Mutation caught: convertToRealPercent() -> `var full = 100 -
    // this.coords.p_handle;` becomes `var full = 100;`, and the drag lands on 49.
    test('a drag inside a flex parent lands where it does in a block one (#776)', async ({ page }) => {
        await open(page, { min: 0, max: 100, from: 10 }, { wrap: 'flex' });

        await dragHandleTo(page, 'single', 0.5);
        await expect(page.locator('#slider')).toHaveValue('50');
    });
});
