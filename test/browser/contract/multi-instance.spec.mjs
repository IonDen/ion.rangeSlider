/**
 * #877 browser suite -- Task 14: two sliders on one page.
 *
 * Every instance keeps its own state, binds its own events under its own namespace
 * (`.irs_N`, N being the instance number the container carries as js-irs-N) and runs its
 * own idle render loop, but they share the page: the body and the window carry every
 * instance's move and release handlers, and only one track can have the keyboard focus. The
 * rows check that a drag, a key press, a destroy() and a container resize on one slider
 * leave the other one as it was, and that each slider's callbacks stay its own.
 *
 * The readme describes one slider at a time, so every row here is characterization of the
 * plugin keeping its instances apart; the settings each row leans on are named in it. The
 * fixture's count=2 builds the second slider on #slider2 inside #wrap2, and its recorder
 * stamps each callback with `which: 1` or `which: 2`.
 *
 * These are characterization tests of shipped behaviour, so each names in a comment the
 * one-line change to js/ion.rangeSlider.js that reds it. Each was applied live, run, watched
 * red and reverted.
 */
import { test, expect } from '@playwright/test';
import { open, events, LABEL } from '../helpers.mjs';
import { readState } from '../lib/state.mjs';
import { dragHandleTo, clickTrackAt, xForFraction } from '../lib/interact.mjs';

/** Opens the page with two single sliders, 0..100 step 1, starting on `from1` and `from2`. */
function openTwo(page, from1, from2) {
    return open(page, { min: 0, max: 100, step: 1, from: from1 }, {
        count: '2',
        config2: JSON.stringify({ min: 0, max: 100, step: 1, from: from2 })
    });
}

/** Recorded events after the first `n`, as `which:type` strings. */
const taggedAfter = async (page, n) => (await events(page)).slice(n).map((e) => `${e.which}:${e.type}`);

/** Whether slider `n`'s handle centre sits where the value fraction `f` puts it, within 1 px. */
async function handleCentredOn(page, n, f) {
    const state = await readState(page, n);
    const box = state.handles.single.box;
    return Math.abs(box.x + box.width / 2 - xForFraction(state.line, box.width, f)) <= 1;
}

test.describe(`multi-instance (${LABEL})`, () => {
    // readme Settings, from: each slider writes its own value into its own input.
    // Mutation caught: writeToInput() -> the single type's `this.$cache.input.prop("value",
    // this.result.from);` becomes `$("input").prop("value", this.result.from);`, a page-wide
    // selector in place of the instance's own input, and the drag on the first slider writes
    // 30 into the second slider's input too.
    test('each input holds its own value after a drag on each slider', async ({ page }) => {
        await openTwo(page, 10, 10);

        await dragHandleTo(page, 'single', 0.3, 1);
        await expect(page.locator('#slider')).toHaveValue('30');
        await expect(page.locator('#slider2')).toHaveValue('10');

        await dragHandleTo(page, 'single', 0.6, 2);
        await expect(page.locator('#slider2')).toHaveValue('60');
        await expect(page.locator('#slider')).toHaveValue('30');
    });

    // readme Settings, keyboard. The keys go to the track that has the focus, and a click on
    // a track gives it the focus, so each press moves the slider touched last and leaves
    // the other alone. Each click lands on the track away from the handle (a click on the
    // handle itself is a press of the handle, a different path), so it moves its slider
    // first: 30 to 50, and 60 to 20.
    // Mutation caught: pointerClick() -> drop `this.current_plugin = this.plugin_count;`.
    // A track click then leaves the second slider's key() guard shut (current_plugin stays
    // at its starting 0, the first slider's number), and the press leaves it on 20.
    // Mutation caught: bindEvents() -> `this.$cache.line.on("keydown.irs_" + ...)` becomes
    // `this.$cache.body.on("keydown.irs_" + ...)`. Every instance then hears every press, and
    // the first slider, whose key() guard still passes, moves on the second slider's press
    // too and reads 52.
    // Not caught, and not catchable here: dropping `this.current_plugin !==
    // this.plugin_count ||` from key()'s guard leaves this row green. Each instance only
    // ever writes its own number into its own current_plugin, and each track carries its
    // own keydown handler, so the focused track has already picked the slider before the
    // guard runs.
    test('the keyboard moves only the slider whose track was clicked last', async ({ page }) => {
        await openTwo(page, 30, 60);

        await clickTrackAt(page, 0.5, 1);
        await expect(page.locator('#slider')).toHaveValue('50');
        await page.waitForTimeout(400);   // let the click's onFinish land before the key press
        await page.keyboard.press('ArrowRight');
        await expect(page.locator('#slider')).toHaveValue('51');
        await page.waitForTimeout(400);   // outlast the idle render tick before reading an unchanged value
        await expect(page.locator('#slider2')).toHaveValue('60');

        await clickTrackAt(page, 0.2, 2);
        await expect(page.locator('#slider2')).toHaveValue('20');
        await page.waitForTimeout(400);
        await page.keyboard.press('ArrowRight');
        await expect(page.locator('#slider2')).toHaveValue('21');
        await page.waitForTimeout(400);   // outlast the idle render tick before reading an unchanged value
        await expect(page.locator('#slider')).toHaveValue('51');
    });

    // readme "Callback data": every callback gets the slider's own payload, which the
    // fixture tags with the slider it was configured on. A drag, a click and a key press on
    // one slider fire callbacks for that slider only.
    // Mutation caught: bindEvents() -> `this.$cache.line.on("keydown.irs_" + ...)` becomes
    // `this.$cache.body.on("keydown.irs_" + ...)`, and the second slider's key press also
    // fires the first slider's onChange and onFinish ("1:onChange" among the second
    // slider's events).
    test('each slider fires its callbacks with its own tag', async ({ page }) => {
        await openTwo(page, 20, 20);
        expect(await taggedAfter(page, 0)).toEqual(['1:onStart', '2:onStart']);

        let before = (await events(page)).length;
        await dragHandleTo(page, 'single', 0.4, 1);
        await expect(page.locator('#slider')).toHaveValue('40');
        await page.waitForTimeout(400);
        const first = await taggedAfter(page, before);
        expect(first.length).toBeGreaterThan(1);
        expect(first.filter((e) => !e.startsWith('1:'))).toEqual([]);
        expect(first.at(-1)).toBe('1:onFinish');

        before = (await events(page)).length;
        await dragHandleTo(page, 'single', 0.5, 2);
        await expect(page.locator('#slider2')).toHaveValue('50');
        await clickTrackAt(page, 0.7, 2);
        await expect(page.locator('#slider2')).toHaveValue('70');
        await page.keyboard.press('ArrowRight');
        await expect(page.locator('#slider2')).toHaveValue('71');
        await page.waitForTimeout(400);
        const second = await taggedAfter(page, before);
        expect(second.filter((e) => !e.startsWith('2:'))).toEqual([]);
        expect(second.at(-1)).toBe('2:onFinish');
        await expect(page.locator('#slider')).toHaveValue('40');
    });

    // readme "Public methods": destroy() removes one slider. Its teardown unbinds its own
    // handlers by their namespace and leaves the other slider's on the shared body.
    // Mutation caught: remove() -> `this.$cache.body.off("mousemove.irs_" +
    // this.plugin_count);` becomes `this.$cache.body.off("mousemove");`, which strips the
    // second slider's move handler as well, and its drag leaves it on 20.
    test('destroy() on one slider leaves the other draggable and recording its callbacks', async ({ page }) => {
        await openTwo(page, 20, 20);
        await page.evaluate(() => window.__irs.slider.destroy());
        await expect(page.locator('#wrap .irs-line')).toHaveCount(0);

        const before = (await events(page)).length;
        await dragHandleTo(page, 'single', 0.6, 2);
        await expect(page.locator('#slider2')).toHaveValue('60');
        await page.waitForTimeout(400);
        const after = await taggedAfter(page, before);
        expect(after).toContain('2:onChange');
        expect(after.at(-1)).toBe('2:onFinish');
        expect(after.filter((e) => !e.startsWith('2:'))).toEqual([]);
    });

    // readme Settings, onChange: "Not fired by update(), reset() or a container resize."
    // Each slider's idle tick measures its own track, so when both containers change width
    // both handles are laid out again for the new width, and neither reports a change.
    // layout.spec.mjs holds the resize of one slider; this row runs both loops at once.
    // Mutation caught: drawHandles() -> `if (this.coords.w_rs !== this.coords.w_rs_old) {`
    // (the one that sets target "base") becomes `if (false) {`, and neither handle is laid
    // out again: each keeps the share of the track it took at 600 px.
    // The no-onChange assertion is guarded twice, by `changed` and by `!this.is_resize`; it
    // goes red when drawHandles()'s onChange condition loses both, e.g. `if
    // (!this.is_update && !this.is_start && !this.is_finish)`.
    test('a width change of both containers lays out both sliders again and reports no change', async ({ page }) => {
        await openTwo(page, 40, 70);
        expect(await handleCentredOn(page, 1, 0.4)).toBe(true);
        expect(await handleCentredOn(page, 2, 0.7)).toBe(true);

        await page.evaluate(() => {
            document.getElementById('wrap').style.width = '400px';
            document.getElementById('wrap2').style.width = '400px';
        });

        await expect.poll(() => handleCentredOn(page, 1, 0.4)).toBe(true);
        await expect.poll(() => handleCentredOn(page, 2, 0.7)).toBe(true);
        await page.waitForTimeout(400);   // outlast one more idle tick before reading the event log

        await expect(page.locator('#slider')).toHaveValue('40');
        await expect(page.locator('#slider2')).toHaveValue('70');
        expect(await taggedAfter(page, 0)).toEqual(['1:onStart', '2:onStart']);
    });
});
