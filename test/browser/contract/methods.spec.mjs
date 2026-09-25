/**
 * #877 browser suite -- the public methods update(), reset() and destroy(), and a
 * second ionRangeSlider() call on an input that already has a slider.
 *
 * The oracle is the closing paragraph of the readme's "Public methods" section: "update()
 * merges the options you pass into the current ones and rebuilds the slider, so options you
 * leave out keep the value they have now, including the current from and to. reset() goes
 * back to the from and to the slider was created or last updated with. Calling
 * $("#range").ionRangeSlider() a second time on an input that already has a slider does
 * nothing, so reach for update() instead. After destroy() the input is back to normal and
 * can be initialized again."
 *
 * The rows check that update() reaches every kind of option (values, type, skin, the
 * disabled state, formatting) and keeps what it is not given, that reset() returns to the
 * last values the slider was given rather than the first, that destroy() hands back a plain
 * input that can take a new slider, and that a second call builds nothing. smoke.spec.mjs
 * holds the basic round trip (update, reset, destroy on one slider) and is not repeated.
 *
 * Assertions stay on page-observable surfaces: the input's value, classes and properties,
 * rendered labels and handles, the container's classes, and the instance handle the readme
 * tells users to read with $("#range").data("ionRangeSlider").
 *
 * These are characterization tests of shipped behaviour, so each names in a comment the
 * one-line change to js/ion.rangeSlider.js that reds it. Each was applied live, run, watched
 * red and reverted.
 */
import { test, expect } from '@playwright/test';
import { open, LABEL } from '../helpers.mjs';
import { readState } from '../lib/state.mjs';
import { dragHandleTo, xForFraction } from '../lib/interact.mjs';
import { labelText } from '../lib/labels.mjs';

/** The skin-classed outer container; a bare `.irs` also matches the span nested inside it. */
const CONTAINER = '#wrap > .irs';

/** Calls a public method on the fixture's instance handle. */
const call = (page, method, arg) => page.evaluate(([m, a]) => window.__irs.slider[m](a), [method, arg]);

/** The number N of the container's js-irs-N class. */
async function instanceNumber(page) {
    const classes = (await readState(page)).container.classes;
    return Number(classes.find((c) => c.indexOf('js-irs-') === 0).slice('js-irs-'.length));
}

/** Whether the instance handle $.data(input, "ionRangeSlider") is gone (null or undefined). */
const handleGone = (page) => page.evaluate(() => jQuery.data(document.getElementById('slider'), 'ionRangeSlider') == null);

test.describe(`methods (${LABEL})`, () => {
    // ---- update() reaches every kind of option ---------------------------------------------

    // Mutation caught: update() -> drop `this.updateResult(options);`, and the rebuilt
    // slider draws the value it had before the call, 50.
    test('update({from}) moves the handle, the label and the input (Public methods: update)', async ({ page }) => {
        await open(page, { min: 0, max: 100, from: 50, step: 1 });
        await call(page, 'update', { from: 30 });

        await expect(page.locator('#slider')).toHaveValue('30');
        await expect(page.locator('#wrap .irs-single')).toHaveText('30');
        await expect.poll(async () => {
            const state = await readState(page);
            const box = state.handles.single.box;
            return Math.abs(box.x + box.width / 2 - xForFraction(state.line, box.width, 0.3)) <= 1;
        }).toBe(true);
    });

    // A new range rewrites the min and max labels, and a from that falls outside it is
    // brought inside: 70 on a 10..50 range becomes 50 (readme Settings, from: the start
    // value lives between min and max).
    // Mutation caught: update() -> `this.options = $.extend(this.options, options);` becomes
    // `this.options = $.extend(options, this.options);`, so the options already in force
    // win over the ones passed, and the labels keep reading 0 and 100.
    test('update({min, max}) rewrites the min and max labels and keeps from inside (Public methods: update)', async ({ page }) => {
        await open(page, { min: 0, max: 100, from: 70, step: 1 });
        await call(page, 'update', { min: 10, max: 50 });

        await expect(page.locator('#wrap .irs-min')).toHaveText('10');
        await expect(page.locator('#wrap .irs-max')).toHaveText('50');
        await expect(page.locator('#slider')).toHaveValue('50');
        await expect(page.locator('#wrap .irs-single')).toHaveText('50');
    });

    // readme Settings, type. The rebuild draws the two handles of the double type, keeps
    // from, and gives to its default, max (readme Settings, to: default `max`), because the
    // single slider never had one of its own.
    // Mutation caught: the same swapped $.extend() in update(), and the slider stays single.
    test('update({type: "double"}) turns a single slider into a double one (Public methods: update)', async ({ page }) => {
        await open(page, { min: 0, max: 100, from: 30, step: 1 });
        await call(page, 'update', { type: 'double' });

        await expect(page.locator(`${CONTAINER} .irs-handle.from`)).toHaveCount(1);
        await expect(page.locator(`${CONTAINER} .irs-handle.to`)).toHaveCount(1);
        await expect(page.locator(`${CONTAINER} .irs-handle.single`)).toHaveCount(0);
        await expect(page.locator('#slider')).toHaveValue('30;100');
    });

    // readme note "values": the slider then works on array indexes, so the index it holds
    // (1) is read against the new entries. values-mode.spec.mjs holds the switch from one
    // values array to another; this row switches a numeric slider into values mode.
    // Mutation caught: the same swapped $.extend() in update(), and the labels keep
    // reading numbers.
    test('update({values}) switches a numeric slider into values mode (Public methods: update, note "values")', async ({ page }) => {
        await open(page, { min: 0, max: 10, from: 1, step: 1 });
        await call(page, 'update', { values: ['a', 'b', 'c'] });

        await expect(page.locator('#wrap .irs-single')).toHaveText('b');
        await expect(page.locator('#wrap .irs-min')).toHaveText('a');
        await expect(page.locator('#wrap .irs-max')).toHaveText('c');
        await expect(page.locator('#slider')).toHaveValue('b');
    });

    // readme Settings, skin: the container class names the skin.
    // Mutation caught: the same swapped $.extend() in update(), and the container keeps
    // irs--flat.
    test('update({skin}) swaps the skin class on the container (Public methods: update, Settings: skin)', async ({ page }) => {
        await open(page, { min: 0, max: 100, from: 30, step: 1 });
        await call(page, 'update', { skin: 'round' });

        await expect(page.locator(CONTAINER)).toHaveCount(1);
        await expect.poll(async () => (await readState(page)).container.classes).toContain('irs--round');
        expect((await readState(page)).container.classes).not.toContain('irs--flat');
    });

    // readme Settings, disable: "Disable the slider and the input, so its value is not
    // submitted with the form." update() turns it on and back off.
    // Mutation caught: append() -> drop `this.$cache.input[0].disabled = false;` (the
    // not-disabled branch), and the input stays disabled after update({disable: false}).
    test('update({disable}) adds and removes the mask and the disabled input (Public methods: update, Settings: disable)', async ({ page }) => {
        await open(page, { min: 0, max: 100, from: 30, step: 1 });

        await call(page, 'update', { disable: true });
        await expect(page.locator(`${CONTAINER} .irs-disable-mask`)).toHaveCount(1);
        await expect(page.locator('#slider')).toBeDisabled();

        await call(page, 'update', { disable: false });
        await expect(page.locator(`${CONTAINER} .irs-disable-mask`)).toHaveCount(0);
        await expect(page.locator('#slider')).toBeEnabled();
    });

    // readme Settings, prettify_separator: "set it to "," for 10,000,000".
    // Mutation caught: the same swapped $.extend() in update(), and the label keeps its
    // space.
    test('update({prettify_separator}) reformats the value label (Public methods: update, Settings: prettify_separator)', async ({ page }) => {
        await open(page, { min: 0, max: 100000, from: 50000, step: 1 });
        await labelText(page, '#wrap .irs-single').toBe('50 000');

        await call(page, 'update', { prettify_separator: ',' });
        await labelText(page, '#wrap .irs-single').toBe('50,000');
    });

    // ---- What update() keeps -----------------------------------------------------------
    // readme: "options you leave out keep the value they have now, including the current
    // from and to." The current from is the one a drag left, not the one the slider was
    // built with.
    // Mutation caught: update() -> drop `this.options.from = this.result.from;`, and the
    // rebuild goes back to the from the slider was built with, 30.
    test('update() keeps the from a drag left when it is not given one (Public methods: update)', async ({ page }) => {
        await open(page, { min: 0, max: 100, from: 30, step: 1 });
        await dragHandleTo(page, 'single', 0.7);
        await expect(page.locator('#slider')).toHaveValue('70');

        await call(page, 'update', { max: 200 });
        await expect(page.locator('#wrap .irs-max')).toHaveText('200');
        await expect(page.locator('#slider')).toHaveValue('70');
        await expect(page.locator('#wrap .irs-single')).toHaveText('70');
    });

    // ---- reset() -------------------------------------------------------------------------
    // readme: "reset() goes back to the from and to the slider was created or last updated
    // with."

    // Mutation caught: reset() -> drop `this.updateResult();`, and reset() rebuilds from the
    // current value, leaving the slider on 70.
    test('reset() goes back to the from of the last update(), not where a drag left it (Public methods: reset)', async ({ page }) => {
        await open(page, { min: 0, max: 100, from: 50, step: 1 });
        await call(page, 'update', { from: 30 });
        await expect(page.locator('#slider')).toHaveValue('30');
        await dragHandleTo(page, 'single', 0.7);
        await expect(page.locator('#slider')).toHaveValue('70');

        await call(page, 'reset');
        await expect(page.locator('#slider')).toHaveValue('30');
        await expect(page.locator('#wrap .irs-single')).toHaveText('30');
    });

    // Two updates: the second one is the last the slider was given.
    // Mutation caught: the same `this.updateResult();` dropped from reset(), and the slider
    // stays on 70.
    test('reset() after two updates goes back to the second one (Public methods: reset)', async ({ page }) => {
        await open(page, { min: 0, max: 100, from: 50, step: 1 });
        await call(page, 'update', { from: 30 });
        await expect(page.locator('#slider')).toHaveValue('30');
        await call(page, 'update', { from: 40 });
        await expect(page.locator('#slider')).toHaveValue('40');
        await dragHandleTo(page, 'single', 0.7);
        await expect(page.locator('#slider')).toHaveValue('70');

        await call(page, 'reset');
        await expect(page.locator('#slider')).toHaveValue('40');
    });

    // ---- destroy() -----------------------------------------------------------------------
    // readme: "After destroy() the input is back to normal and can be initialized again."
    // Back to normal: the slider markup is gone, the input no longer carries the class that
    // hides it or the readonly the plugin set, and the instance handle is gone.
    // Mutation caught: destroy() -> drop `this.$cache.input.prop("readonly", false);`, and
    // the input stays read-only.
    // Mutation caught: destroy() -> drop the `this.toggleInput();` before it, and the input
    // keeps irs-hidden-input.
    // Mutation caught: destroy() -> drop `$.data(this.input, "ionRangeSlider", null);`, and
    // the handle is still there.
    test('destroy() gives back a plain input (Public methods: destroy)', async ({ page }) => {
        await open(page, { min: 0, max: 100, from: 30, step: 1 });
        expect(await page.locator('#slider').evaluate((el) => el.readOnly)).toBe(true);

        await call(page, 'destroy');
        await expect(page.locator(CONTAINER)).toHaveCount(0);
        await expect(page.locator('#wrap .irs-line')).toHaveCount(0);
        expect((await readState(page)).input.classes).not.toContain('irs-hidden-input');
        expect(await page.locator('#slider').evaluate((el) => el.readOnly)).toBe(false);
        expect(await handleGone(page)).toBe(true);
        await expect(page.locator('#slider')).toHaveValue('30');
    });

    // "can be initialized again": a new call builds a new slider on the same input, with
    // its own instance number (the js-irs-N class) above the first one's. Given no from of
    // its own, it starts on 30, the value the destroyed slider left in the input, which the
    // constructor reads as the starting value when the call gives none. The pair the
    // destroyed slider kept in the input's jQuery data is gone (#911, the row below), so the
    // input's value is the only route to 30.
    // Mutation caught: destroy() -> drop `$.data(this.input, "ionRangeSlider", null);`, and
    // the new call finds the old handle and builds nothing.
    // Mutation caught: $.fn.ionRangeSlider -> `plugin_count++` becomes `plugin_count`, and
    // the new slider is js-irs-0 again.
    test('an input can take a new slider after destroy() (Public methods: destroy)', async ({ page }) => {
        await open(page, { min: 0, max: 100, from: 30, step: 1 });
        const first = await instanceNumber(page);
        await call(page, 'destroy');
        await expect(page.locator(CONTAINER)).toHaveCount(0);

        await page.evaluate(() => { jQuery('#slider').ionRangeSlider({ min: 0, max: 100 }); });
        await expect(page.locator(CONTAINER)).toHaveCount(1);
        await expect(page.locator('#wrap .irs-single')).toHaveText('30');
        await expect(page.locator('#slider')).toHaveValue('30');
        expect(await instanceNumber(page)).toBeGreaterThan(first);
    });

    // The new slider is given a from of its own. The settings table lets a JS option win over
    // the input's value, and only a data-* attribute win over the JS option; the input carries
    // no data-from. writeToInput() keeps the current pair in the input's jQuery data, which
    // the constructor reads the way it reads data-from, and destroy() clears it (#911), so
    // the new slider starts on the 70 it is given, not on the destroyed slider's 30. The new
    // slider is built only after the idle tick the destroyed one still had pending, so a tick
    // that wrote the pair back after destroy() would be read as data-from here.
    // Mutation caught: destroy() -> drop `this.$cache.input.removeData("from");`, and the new
    // slider starts on 30.
    // Mutation caught: updateScene() -> `if (!this.options) {` also runs
    // `this.$cache.input.data("from", this.result.from);` (a late tick writing the pair back),
    // and the new slider starts on 30.
    test('a slider built after destroy() starts on the from it is given (Public methods: destroy, Settings: from)', async ({ page }) => {
        await open(page, { min: 0, max: 100, from: 30, step: 1 });
        await call(page, 'destroy');
        await expect(page.locator(CONTAINER)).toHaveCount(0);
        await page.waitForTimeout(400);   // outlast the idle tick the destroyed slider had pending

        await page.evaluate(() => { jQuery('#slider').ionRangeSlider({ min: 0, max: 100, from: 70 }); });
        await expect(page.locator(CONTAINER)).toHaveCount(1);
        await expect(page.locator('#slider')).toHaveValue('70');
        await expect(page.locator('#wrap .irs-single')).toHaveText('70');
    });

    // readme Settings, disable: "Disable the slider and the input"; after destroy() the
    // input is "back to normal", so enabled again, sent with its form and open to typing
    // (#886). The checks run after the idle tick the destroyed slider still had pending, so a
    // tick that disabled the input again would not go unnoticed. toBeEditable() comes before
    // fill() so that a field that cannot be typed into fails an assertion instead of holding
    // fill() until the test times out.
    // Mutation caught: destroy() -> drop `this.$cache.input[0].disabled = this.input_disabled;`,
    // and the input stays disabled.
    // Mutation caught: updateScene() -> `if (!this.options) {` also runs
    // `this.$cache.input[0].disabled = true;` (a late tick disabling it again), and the input
    // is disabled by the time it is checked.
    // Mutation caught: destroy() -> drop `this.$cache.input.prop("readonly", false);`, and the
    // input is enabled but cannot be typed into.
    test('destroy() re-enables an input the slider disabled (Public methods: destroy, Settings: disable)', async ({ page }) => {
        await open(page, { min: 0, max: 100, from: 30, step: 1, disable: true });
        await expect(page.locator('#slider')).toBeDisabled();

        await call(page, 'destroy');
        await expect(page.locator(CONTAINER)).toHaveCount(0);
        await page.waitForTimeout(400);   // outlast the idle tick the destroyed slider had pending
        await expect(page.locator('#slider')).toBeEnabled();
        await expect(page.locator('#slider')).toBeEditable();
        await page.locator('#slider').fill('55');
        await expect(page.locator('#slider')).toHaveValue('55');
    });

    // ---- A second ionRangeSlider() call ------------------------------------------------
    // readme: "Calling $("#range").ionRangeSlider() a second time on an input that already
    // has a slider does nothing." The input's value would not notice a second slider: it
    // reads the data("from") the first one, still alive, keeps on the input (the jQuery data
    // cache that destroy() clears since #911, see the rows above) over its own from: 90 and
    // starts on 30 as well, and the label line
    // trips only because its locator then finds two labels. The instance handle and the
    // container count are the checks that catch the rebuild.
    // Mutation caught: $.fn.ionRangeSlider -> `if (!$.data(this, "ionRangeSlider")) {`
    // becomes `if (true) {`, and the call builds a second slider on the same input: the
    // instance handle $.data(input, "ionRangeSlider") is a new object, and the wrap holds
    // two containers.
    test('a second ionRangeSlider() call on the same input changes nothing (Public methods)', async ({ page }) => {
        await open(page, { min: 0, max: 100, from: 30, step: 1 });
        await page.evaluate(() => { jQuery('#slider').ionRangeSlider({ min: 0, max: 100, from: 90 }); });
        expect(await page.evaluate(() => jQuery.data(document.getElementById('slider'), 'ionRangeSlider') === window.__irs.slider)).toBe(true);
        await page.waitForTimeout(400);   // outlast the idle render tick before reading an unchanged value

        await expect(page.locator(CONTAINER)).toHaveCount(1);
        await expect(page.locator('#slider')).toHaveValue('30');
        await expect(page.locator('#wrap .irs-single')).toHaveText('30');
    });
});
