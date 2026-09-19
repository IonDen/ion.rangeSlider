/**
 * #877 browser suite -- Task 14: the slider against containers that are not the plain
 * 600 px block the rest of the suite renders into.
 *
 * Everything the plugin draws is a percentage of the track, measured once at init and
 * re-measured by the 300 ms idle tick, so a narrow container, a container that is hidden
 * when the slider is built, a container that changes width afterwards and a flex parent
 * each take a different path through the same maths.
 *
 * readme Settings, onChange: "Fires on each value change made by the user. Not fired by
 * update(), reset() or a container resize." Nothing on this page is a change made by the
 * user, so no row here may record one.
 *
 * The width fix for flex parents itself (#776) is covered by
 * test/browser/flex-container.spec.mjs; what this file adds there is that a drag inside a
 * flex parent lands where it does in a block one.
 *
 * These are characterization tests of shipped behaviour, so each names in a comment the
 * one-line change to js/ion.rangeSlider.js that reds it. Each was applied live, run,
 * watched red and reverted.
 */
import { test, expect } from '@playwright/test';
import { open, events, LABEL } from '../helpers.mjs';
import { readState } from '../lib/state.mjs';
import { dragHandleTo, xForFraction } from '../lib/interact.mjs';

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
    // of the suite and wrong here, and the three drags land on 12, 25 and 37.
    for (const [fraction, value] of [[0.25, '25'], [0.5, '50'], [0.75, '75']]) {
        test(`a drag to ${fraction} of a 300 px track lands on ${value}`, async ({ page }) => {
            await open(page, { min: 0, max: 100, from: 10 }, { width: '300' });

            await dragHandleTo(page, 'single', fraction);
            await expect(page.locator('#slider')).toHaveValue(value);
        });
    }

    // A slider built inside a display:none container has no width to measure, so nothing
    // is positioned at init. The idle tick keeps looking, and the first tick after the
    // container is revealed lays the slider out. readme Settings, onInit: "for a slider
    // that starts hidden, edit its DOM only after it first becomes visible."
    // Mutation caught: updateScene() -> the idle re-schedule
    // `setTimeout(this.updateScene.bind(this), 300)` becomes `setTimeout(..., 300000)`,
    // and the revealed slider never draws its handle or its labels.
    test('a slider built in a hidden container lays itself out once it is shown', async ({ page }) => {
        await open(page, { min: 0, max: 100, from: 40 }, { hidden: '1' });

        const hidden = await readState(page);
        expect(hidden.input.value).toBe('40');
        expect(hidden.labels.single.text).not.toBe('40');

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
    // from. onStart fires before the first render, and for a slider built inside a hidden
    // container the two formatted handle fields are missing from the payload, while
    // min_pretty and max_pretty are filled in.
    test('onStart from a hidden container carries the formatted handle values (Callback data: from_pretty)', async ({ page }) => {
        test.fail(true, '#897: a slider built inside a hidden container reports no from_pretty or to_pretty in onStart and onInit');

        await open(page, { min: 0, max: 100, from: 40 }, { hidden: '1' });

        const onStart = (await events(page)).find((e) => e.type === 'onStart');
        expect(onStart.min_pretty).toBe('0');
        expect(onStart.from_pretty).toBe('40');
    });

    // readme "Callback data": in values mode from holds the index and from_value "the
    // actual entry at that index"; the input carries the entry the same way. A slider
    // built inside a hidden container reports neither until it is revealed.
    test('a values-mode slider built in a hidden container reports its entry (note "values")', async ({ page }) => {
        test.fail(true, '#888: a values-mode slider built in a hidden container leaves its input empty');

        await open(page, { values: ['a', 'b', 'c'], from: 1 }, { hidden: '1' });

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
