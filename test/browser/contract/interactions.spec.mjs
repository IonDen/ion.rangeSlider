/**
 * #877 browser suite -- every way a user moves a handle, one interaction path at a
 * time: a mouse drag of a handle, a drag started on a value label, a press that does not
 * move, a click on the track, the keyboard, and a touch drag.
 *
 * The oracle is readme.md where it speaks: the settings rows for type, from_fixed, the four
 * per-handle limits, drag_interval, drag_over_limit and keyboard ("Left: ←, ↓, A, S.
 * Right: →, ↑, W, D"). The readme names no rule for which handle a track click moves, for
 * where a track click puts a drag_interval pair, for a drag that starts on a value label or
 * for what a key press on a fixed handle reports, so those rows are characterization of
 * shipped behaviour and say so. What the key handler ignores (a press with Shift held) comes
 * from the plugin's own key(), which the readme's keyboard row does not qualify. One
 * track-click row takes chooseHandle()'s own JSDoc, "Find closest handle to pointer click",
 * as its oracle and is an expected failure: a click can move the farther handle.
 *
 * Assertions stay on page-observable surfaces: the input's value, the rendered labels and
 * the recorded callbacks. Rows the older specs already hold are not repeated here; each
 * section says which spec holds its neighbours.
 *
 * These are characterization tests of shipped behaviour, so each names in its title or a
 * comment the one-line change to js/ion.rangeSlider.js that reds it. Each was applied live,
 * run, watched red and reverted.
 */
import { test, expect } from '@playwright/test';
import { open, events, touchDrag, LABEL } from '../helpers.mjs';
import { dragHandleTo, clickTrackAt, focusTrack, touchDragTo } from '../lib/interact.mjs';

/** The double slider most rows start from: 0..100, step 1, from 20, to 80. */
const DOUBLE = { type: 'double', min: 0, max: 100, from: 20, to: 80, step: 1 };

/** Presses and releases the mouse on the centre of a handle, with no movement in between. */
async function pressHandle(page, which) {
    const h = await page.locator(`#wrap .irs-handle.${which}`).boundingBox();
    await page.mouse.click(h.x + h.width / 2, h.y + h.height / 2);
}

/**
 * Presses the mouse on the centre of a value label, moves it right by `f` of the track's
 * usable travel (the track less one handle, the distance a handle centre can cover) and
 * releases it there.
 */
async function dragLabelBy(page, selector, f) {
    const label = await page.locator(`#wrap ${selector}`).boundingBox();
    const line = await page.locator('#wrap .irs-line').boundingBox();
    const handle = await page.locator('#wrap .irs-handle').first().boundingBox();
    const x = label.x + label.width / 2, y = label.y + label.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + f * (line.width - handle.width), y, { steps: 12 });
    await page.mouse.up();
}

/** Callback types recorded after the first `n` events. */
const typesAfter = async (page, n) => (await events(page)).slice(n).map((e) => e.type);

test.describe(`interactions (${LABEL})`, () => {
    // ---- Mouse drags of a handle ---------------------------------------------------------
    // Neighbours: smoke.spec.mjs (a single drag, onChange then onFinish), drag-interval*.spec
    // (bar drags), drag-over-limit.spec.mjs (drag_over_limit on), and the option-routes rows
    // for from_fixed/to_fixed and the per-handle limits.

    // readme Settings, min: "Minimum value"; from: "Start value of the from handle". A handle
    // dragged to the left end of the track holds the minimum.
    // Mutation caught: changeLevel() -> `case "from"`: `this.coords.p_gap = ...` becomes
    // `this.coords.p_gap = 0`, so the press no longer remembers where on the handle it
    // grabbed, the handle's left edge follows the pointer, and the drag lands on 1.
    test('a from handle dragged to the left end lands on min (Settings: min, from)', async ({ page }) => {
        await open(page, DOUBLE);
        await dragHandleTo(page, 'from', 0);
        await expect(page.locator('#slider')).toHaveValue('0;80');
    });

    // readme Settings, max: "Maximum value". A handle dragged to the right end holds the
    // maximum even though its left edge stops one handle width short of the track's end.
    // Mutation caught: convertToRealPercent() -> `var full = 100 - this.coords.p_handle;`
    // becomes `var full = 100;`, and the right end of the travel reads 97 instead of 100.
    test('a to handle dragged to the right end lands on max (Settings: max, to)', async ({ page }) => {
        await open(page, DOUBLE);
        await dragHandleTo(page, 'to', 1);
        await expect(page.locator('#slider')).toHaveValue('20;100');
    });

    // A from handle dragged past the to handle: drag-over-limit.spec.mjs, its "default false" row.

    // readme Settings, drag_over_limit: "Let a dragged handle push the other handle instead
    // of stopping at it", default false: with it off, the dragged handle stops at the other
    // one. This row is the to handle's side of that stop.
    // Mutation caught: calc() -> `case "to"`, `if (this.coords.p_to_real <
    // this.coords.p_from_real) {` becomes `if (false) {`, and the input reads "20;10".
    test('a to handle dragged below the from handle stops on it (Settings: drag_over_limit, default false)', async ({ page }) => {
        await open(page, DOUBLE);
        await dragHandleTo(page, 'to', 0.1);
        await expect(page.locator('#slider')).toHaveValue('20;20');
    });

    // readme Settings, from_min: "Minimum limit for the from handle". The limit sits on the
    // step scale (step 1), so the stop is exact and #882 (a limit off the step scale is
    // crossed by up to half a step) cannot apply. The option-routes spec holds from_min on a
    // single slider; this row is the from handle of a double slider, which calc() clamps in
    // its own branch.
    // Mutation caught: calc() -> `case "from"`, the else branch's `this.coords.p_from_real =
    // this.checkDiapason(this.coords.p_from_real, this.options.from_min,
    // this.options.from_max);` is dropped, and the drag reaches 0.
    test('a from handle dragged below from_min stops at from_min (Settings: from_min)', async ({ page }) => {
        await open(page, { ...DOUBLE, from_min: 10 });
        await dragHandleTo(page, 'from', 0);
        await expect(page.locator('#slider')).toHaveValue('10;80');
    });

    // A to handle dragged past to_max: options-routes.spec.mjs, "to_min and to_max bound the to handle".

    // ---- A drag that starts on a value label ---------------------------------------------
    // Characterization: the readme says nothing about the value labels taking a drag, but
    // the plugin binds a press on the value label of a handle to that handle, so a user can
    // grab the number above a handle and move the handle with it. Moving the pointer by a
    // tenth of the travel moves the value by a tenth of the range, 20 to 30.

    // Mutation caught: bindEvents() -> the single type's `this.$cache.single.on("mousedown.irs_"
    // + this.plugin_count, this.pointerDown.bind(this, "single"));` is dropped, and the press
    // on the label moves nothing.
    test('a drag started on the single value label moves the handle (characterization)', async ({ page }) => {
        await open(page, { min: 0, max: 100, from: 20, step: 1 });
        await dragLabelBy(page, '.irs-single', 0.1);
        await expect(page.locator('#slider')).toHaveValue('30');
        await expect(page.locator('#wrap .irs-single')).toHaveText('30');
    });

    // Mutation caught: bindEvents() -> the double type's `this.$cache.from.on("mousedown.irs_"
    // + this.plugin_count, this.pointerDown.bind(this, "from"));` is dropped, and the press
    // on the from label moves nothing.
    test('a drag started on the from value label moves the from handle (characterization)', async ({ page }) => {
        await open(page, DOUBLE);
        await dragLabelBy(page, '.irs-from', 0.1);
        await expect(page.locator('#slider')).toHaveValue('30;80');
    });

    // ---- A press that does not move ------------------------------------------------------
    // readme Settings, onFinish: "Fires when an interaction ends: a handle is released (even
    // without moving)"; onChange: "Fires on each value change made by the user." A press and
    // release on the handle with no movement in between is an interaction that ends and a
    // change that never happened. (smoke.spec.mjs holds the release of a drag that has
    // already rendered, #851; this row never moves at all.)
    // Mutation caught: pointerUp() -> `if ($.contains(this.$cache.cont[0], e.target) ||
    // this.dragging) {` becomes `if (false) {`, and the release fires no onFinish.
    test('a press and release on a handle fires one onFinish and no onChange (Settings: onFinish)', async ({ page }) => {
        await open(page, { min: 0, max: 100, from: 30, step: 1 });
        const before = (await events(page)).length;

        await pressHandle(page, 'single');
        await expect.poll(() => typesAfter(page, before)).toEqual(['onFinish']);
        await page.waitForTimeout(400);   // outlast the idle render tick before reading an unchanged value

        expect(await typesAfter(page, before)).toEqual(['onFinish']);
        await expect(page.locator('#slider')).toHaveValue('30');
    });

    // ---- A click on the track ------------------------------------------------------------
    // readme Settings, onFinish, counts a click on the track as an interaction, and
    // smoke.spec.mjs holds a click on a single slider moving the handle to the clicked value.
    // In double type the readme does not say which handle moves; the plugin compares the
    // click with the point halfway between the two, on two scales that disagree (see the tie
    // row and the expected failure after it). The two rows below are clear of that point.
    // Mutation caught (these two rows and the tie row): chooseHandle() -> `if (real_x >= m_point) {` becomes
    // `if (real_x < m_point) {`, and each click moves the other handle, which then stops on
    // the first: "20;20", "80;80" and "20;50".
    const CLICKS = [
        { at: 0.1, value: '10;80', title: 'a track click left of the midpoint moves the from handle (characterization)' },
        { at: 0.9, value: '20;90', title: 'a track click right of the midpoint moves the to handle (characterization)' }
    ];
    for (const row of CLICKS) {
        test(row.title, async ({ page }) => {
            await open(page, DOUBLE);
            await clickTrackAt(page, row.at);
            await expect(page.locator('#slider')).toHaveValue(row.value);
        });
    }

    // Characterization of the tie: a click exactly halfway between 20 and 80 moves the from
    // handle. calc() hands chooseHandle() the click as the position of a handle's left edge,
    // on the scale that edge travels: 0 to 97.33 on this 600 px track with a 16 px handle,
    // where the value 50 sits at 48.67. chooseHandle() compares it with the midpoint of the
    // two handles on the full 0 to 100 scale, 50. The two scales disagree, so the choice
    // leans towards from past the exact middle: a click up to about 1.4 values beyond it
    // still moves from. This row pins that behaviour as it is today; the fix for the finding
    // in the next row flips it to "20;50".
    // Mutation caught: calc() -> `this.target = this.chooseHandle(handle_x);` becomes
    // `this.target = this.chooseHandle(this.convertToRealPercent(handle_x));` (that fix), and
    // the input reads "20;50". The flipped comparison above reds this row too.
    test('a track click exactly between the handles moves the from handle (characterization)', async ({ page }) => {
        await open(page, DOUBLE);
        await clickTrackAt(page, 0.5);
        await expect(page.locator('#slider')).toHaveValue('50;80');
    });

    // The same scale mix away from the tie, where it grows with the handle's share of the
    // track and with the distance of the midpoint from min. The readme names no rule for which handle a click moves; chooseHandle()'s own
    // JSDoc does: "Find closest handle to pointer click". On a 300 px track the 16 px handle
    // takes 5.33 of 100, so a click on 93 reaches chooseHandle() as about 88 (93 x 0.9467),
    // below the midpoint of 80 and 100, 90. The click is 7 from to and 13 from from, and
    // from moves: the input reads "93;100". This row states the closest-handle rule.
    // The row reads the value once after a render tick (400 ms) instead of polling, so the
    // expected failure does not wait out the assertion timeout.
    // Mutation caught (the fix): calc() -> `this.target = this.chooseHandle(handle_x);`
    // becomes `this.target = this.chooseHandle(this.convertToRealPercent(handle_x));`, the
    // input reads "80;93", and Playwright reports the row "expected to fail, but passed".
    test('a track click nearer the to handle moves the to handle (chooseHandle(): closest handle)', async ({ page }) => {
        test.fail(true, 'unfiled: a click on the track of a double slider can move the handle that is farther from the click');
        await open(page, { type: 'double', min: 0, max: 100, from: 80, to: 100, step: 1 }, { width: '300' });
        await clickTrackAt(page, 0.93);
        await page.waitForTimeout(400);   // outlast the idle render tick, then read once
        expect(await page.locator('#slider').inputValue()).toBe('80;93');
    });

    // readme Settings, drag_interval: "Let the user drag the whole interval by its bar." With
    // it on, a click on the track moves the whole interval rather than one handle; the readme
    // does not say where it lands. Characterization: the interval keeps its width and is
    // centred on the clicked value, and at either end of the range it stops against that end
    // with its width intact. No row puts the two handles on one value (that is #898's case,
    // a coincident pair) or near a per-handle limit (#879).
    // Mutation caught: calc() -> `case "both_one"`, `half = full / 2` becomes `half = full`,
    // and the 20-wide interval comes out 40 wide, "60;100" (the redraw that follows the
    // click runs the same centring once more on the widened pair, which then meets max).
    test('a track click with drag_interval centres the interval on the clicked value (characterization)', async ({ page }) => {
        await open(page, { type: 'double', min: 0, max: 100, from: 20, to: 40, step: 1, drag_interval: true });
        await clickTrackAt(page, 0.7);
        await expect(page.locator('#slider')).toHaveValue('60;80');
    });

    // Mutation caught: calc() -> `case "both_one"`, the `new_to > 100` branch drops
    // `new_from = new_to - full;`, and the interval lands on "87;100", narrowed by the end.
    test('a track click with drag_interval near max keeps the interval width against the end (characterization)', async ({ page }) => {
        await open(page, { type: 'double', min: 0, max: 100, from: 20, to: 40, step: 1, drag_interval: true });
        await clickTrackAt(page, 0.95);
        await expect(page.locator('#slider')).toHaveValue('80;100');
    });

    // The mirror at min. calc()'s `both_one` case centres the 20-wide interval on the click
    // at 5, which would put it on -5 to 15, and its `new_from < 0` branch moves the pair up
    // to start on 0 with the width kept: "0;20".
    // Mutation caught: calc() -> `case "both_one"`, the `new_from < 0` branch drops
    // `new_to = new_from + full;`, and the interval lands on "0;12", narrowed by the end.
    test('a track click with drag_interval near min keeps the interval width against the end (characterization)', async ({ page }) => {
        await open(page, { type: 'double', min: 0, max: 100, from: 60, to: 80, step: 1, drag_interval: true });
        await clickTrackAt(page, 0.05);
        await expect(page.locator('#slider')).toHaveValue('0;20');
    });

    // ---- The keyboard --------------------------------------------------------------------
    // readme Settings, keyboard: "Keyboard controls. Left: ←, ↓, A, S. Right: →, ↑, W, D".
    // Each of the eight keys moves the handle by one step. smoke.spec.mjs holds the arrows'
    // step size and callbacks, the double-type default handle and the arrows after a click on
    // `to` (#759); the drag_interval keyboard rows (#825) live there too. What is new here is
    // every key, on each of the three handles a press can drive.
    // Mutation caught: key() -> drop one `case` label, e.g. `case 83: // S`, and that key's
    // three rows go red (the press moves nothing).
    const KEYS = [
        { key: 's', name: 'S', delta: -1 },
        { key: 'a', name: 'A', delta: -1 },
        { key: 'ArrowDown', name: 'Down', delta: -1 },
        { key: 'ArrowLeft', name: 'Left', delta: -1 },
        { key: 'w', name: 'W', delta: 1 },
        { key: 'd', name: 'D', delta: 1 },
        { key: 'ArrowUp', name: 'Up', delta: 1 },
        { key: 'ArrowRight', name: 'Right', delta: 1 }
    ];
    for (const { key, name, delta } of KEYS) {
        const verb = delta < 0 ? 'decreases' : 'increases';

        test(`${name} ${verb} a single slider by one step (Settings: keyboard)`, async ({ page }) => {
            await open(page, { min: 0, max: 100, from: 50, step: 1 });
            await focusTrack(page);
            await page.keyboard.press(key);
            await expect(page.locator('#slider')).toHaveValue(String(50 + delta));
        });

        test(`${name} ${verb} the to handle after a click on it (Settings: keyboard)`, async ({ page }) => {
            await open(page, { type: 'double', min: 0, max: 100, from: 40, to: 60, step: 1 });
            await pressHandle(page, 'to');
            await page.keyboard.press(key);
            await expect(page.locator('#slider')).toHaveValue(`40;${60 + delta}`);
        });

        test(`${name} ${verb} the from handle after a click on it (Settings: keyboard)`, async ({ page }) => {
            await open(page, { type: 'double', min: 0, max: 100, from: 40, to: 60, step: 1 });
            await pressHandle(page, 'from');
            await page.keyboard.press(key);
            await expect(page.locator('#slider')).toHaveValue(`${40 + delta};60`);
        });
    }

    // The plugin's key() returns early when Alt, Ctrl, Shift or Meta is held, so a shortcut
    // such as Shift+Right is left to the page. The readme's keyboard row does not qualify
    // its keys; this pins the Shift half of that guard.
    // Mutation caught: key() -> drop `|| e.shiftKey` from the early-return guard, and the
    // press moves the handle to 51.
    test('a press with Shift held moves nothing and fires nothing (key() modifier guard)', async ({ page }) => {
        await open(page, { min: 0, max: 100, from: 50, step: 1 });
        await focusTrack(page);
        await page.keyboard.press('Shift+ArrowRight');
        await page.waitForTimeout(400);   // outlast the idle render tick before reading an unchanged value

        await expect(page.locator('#slider')).toHaveValue('50');
        expect(await typesAfter(page, 0)).toEqual(['onStart']);
    });

    // readme Settings, from_fixed: "Fix the position of the from handle." A key press aimed
    // at a fixed handle moves nothing. Characterization of what it reports: the press still
    // ends as an interaction, so each one fires onFinish (and no onChange), exactly as the
    // click on the handle before it did.
    // Mutation caught: calc() -> `case "from"`, `if (this.options.from_fixed) {` becomes
    // `if (false) {`, and the first press moves the handle: the log gains an onChange
    // before that press's onFinish.
    test('keys on a fixed from handle move nothing and each fires onFinish (Settings: from_fixed, characterization)', async ({ page }) => {
        await open(page, { ...DOUBLE, from_fixed: true });
        await pressHandle(page, 'from');
        await expect.poll(() => typesAfter(page, 0)).toEqual(['onStart', 'onFinish']);

        await page.keyboard.press('ArrowRight');
        await expect.poll(() => typesAfter(page, 0)).toEqual(['onStart', 'onFinish', 'onFinish']);
        await page.keyboard.press('ArrowLeft');
        await expect.poll(() => typesAfter(page, 0)).toEqual(['onStart', 'onFinish', 'onFinish', 'onFinish']);
        await page.waitForTimeout(400);   // outlast the idle render tick before reading an unchanged value

        await expect(page.locator('#slider')).toHaveValue('20;80');
        expect(await typesAfter(page, 0)).toEqual(['onStart', 'onFinish', 'onFinish', 'onFinish']);
    });

    // readme Settings, from_min and to_max: a handle already on its limit stays there when a
    // key presses it further. The limits sit on the step scale (#882 cannot apply).
    // Mutation caught: calc() -> `case "from"`, the else branch's checkDiapason() call is
    // dropped (the same line the from_min drag row names), and the press reaches 9.
    test('a key press past from_min leaves the from handle on the limit (Settings: from_min, keyboard)', async ({ page }) => {
        await open(page, { type: 'double', min: 0, max: 100, from: 10, to: 90, step: 1, from_min: 10, to_max: 90 });
        await pressHandle(page, 'from');
        await page.keyboard.press('ArrowLeft');
        await page.waitForTimeout(400);   // outlast the idle render tick before reading an unchanged value
        await expect(page.locator('#slider')).toHaveValue('10;90');
    });

    // Mutation caught: calc() -> `case "to"`, the else branch's `this.coords.p_to_real =
    // this.checkDiapason(this.coords.p_to_real, this.options.to_min, this.options.to_max);`
    // is dropped, and the press reaches 91.
    test('a key press past to_max leaves the to handle on the limit (Settings: to_max, keyboard)', async ({ page }) => {
        await open(page, { type: 'double', min: 0, max: 100, from: 10, to: 90, step: 1, from_min: 10, to_max: 90 });
        await pressHandle(page, 'to');
        await page.keyboard.press('ArrowRight');
        await page.waitForTimeout(400);   // outlast the idle render tick before reading an unchanged value
        await expect(page.locator('#slider')).toHaveValue('10;90');
    });

    // ---- Touch drags ---------------------------------------------------------------------
    // readme feature list: the slider supports touch. Real touch events go through CDP,
    // which only chromium offers (see helpers.mjs, touchDrag). features.spec.mjs holds the
    // touch row for a coincident pair (#507); these are the plain drags of each handle and
    // of the drag_interval bar.

    // Mutation caught: bindEvents() -> drop `this.$cache.s_single.on("touchstart.irs_" +
    // this.plugin_count, this.pointerDown.bind(this, "single"));`, and the touch moves nothing.
    test('a touch drag moves the single handle (Settings: type)', async ({ page, browserName }) => {
        test.skip(browserName !== 'chromium', 'real touch dispatch via CDP is chromium-only');
        await open(page, { min: 0, max: 100, from: 20, step: 1 });
        await touchDragTo(page, 'single', 0.6);
        await expect(page.locator('#slider')).toHaveValue('60');
    });

    // Mutation caught: bindEvents() -> drop `this.$cache.s_from.on("touchstart.irs_" +
    // this.plugin_count, this.pointerDown.bind(this, "from"));`, and the touch moves nothing.
    test('a touch drag moves the from handle (Settings: type)', async ({ page, browserName }) => {
        test.skip(browserName !== 'chromium', 'real touch dispatch via CDP is chromium-only');
        await open(page, DOUBLE);
        await touchDragTo(page, 'from', 0.4);
        await expect(page.locator('#slider')).toHaveValue('40;80');
    });

    // Mutation caught: bindEvents() -> drop `this.$cache.s_to.on("touchstart.irs_" +
    // this.plugin_count, this.pointerDown.bind(this, "to"));`, and the touch moves nothing.
    test('a touch drag moves the to handle (Settings: type)', async ({ page, browserName }) => {
        test.skip(browserName !== 'chromium', 'real touch dispatch via CDP is chromium-only');
        await open(page, DOUBLE);
        await touchDragTo(page, 'to', 0.6);
        await expect(page.locator('#slider')).toHaveValue('20;60');
    });

    // readme Settings, drag_interval: the whole interval moves by its bar, and it keeps its
    // width. A touch moved a tenth of the travel carries 20..40 to 30..50.
    // Mutation caught: bindEvents() -> drop `this.$cache.bar.on("touchstart.irs_" +
    // this.plugin_count, this.pointerDown.bind(this, "both"));`, and the touch moves nothing.
    test('a touch drag of the bar moves the whole interval and keeps its width (Settings: drag_interval)', async ({ page, browserName }) => {
        test.skip(browserName !== 'chromium', 'real touch dispatch via CDP is chromium-only');
        await open(page, { type: 'double', min: 0, max: 100, from: 20, to: 40, step: 1, drag_interval: true });
        const line = await page.locator('#wrap .irs-line').boundingBox();
        const handle = await page.locator('#wrap .irs-handle').first().boundingBox();
        // touchDrag() moves by a fraction of the whole line; a tenth of the travel is this.
        await touchDrag(page, '#wrap .irs-bar', 0.1 * (line.width - handle.width) / line.width);
        await expect(page.locator('#slider')).toHaveValue('30;50');
    });
});
