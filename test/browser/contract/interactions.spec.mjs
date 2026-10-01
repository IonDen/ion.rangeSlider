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
 * track-click rows take chooseHandle()'s own JSDoc, "Find closest handle to pointer click",
 * as their oracle: a click moves the handle nearer to it, and one exactly halfway moves the
 * to handle (#910). The #898 rows take the readme's hide_from_to row as their oracle: with
 * it off a double slider shows its values, so a track click under drag_interval on a pair on
 * one value keeps one value label on show, and so does a key press after it. The #891 row
 * takes the readme's onFinish row as its oracle: a key press fires onFinish, so with
 * drag_interval and a fixed handle a press after a click on the bar fires one and moves
 * nothing.
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
import { dragHandleTo, clickTrackAt, trackPointAt, classesAt, focusTrack, touchDragTo } from '../lib/interact.mjs';
import { readState } from '../lib/state.mjs';

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

/** The text of every value label on show: the merged label, then the from and to labels. */
async function shownLabels(page) {
    const { labels } = await readState(page);
    return ['single', 'from', 'to'].filter((k) => labels[k].visible).map((k) => labels[k].text);
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
    // In double type the readme does not say which handle moves; chooseHandle()'s own JSDoc
    // does ("Find closest handle to pointer click"), and the plugin compares the click with the
    // point halfway between the two handles: at or beyond it the to handle moves, before it the
    // from handle. The two rows below are clear of that point; the rows after them sit on it.
    // Mutation caught (these two rows, and the rows on the halfway point after them):
    // chooseHandle() -> `if (real_x >= m_point) {` becomes `if (real_x < m_point) {`, and each
    // click moves the other handle, which then stops on the first: "20;20" and "80;80" here,
    // "50;80" on the tie.
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

    // A click exactly halfway between 20 and 80 moves the to handle: the comparison is `>=`,
    // so the halfway point itself belongs to to. calc() hands chooseHandle() the click as the
    // position of a handle's left edge, on the scale that edge travels (0 to 97.33 on this
    // 600 px track with a 16 px handle, where the value 50 sits at 48.67), and chooseHandle()
    // converts it to the full 0 to 100 scale of the midpoint before it compares (#910). Until
    // that fix the two scales disagreed and this click moved the from handle ("50;80"), as did
    // a click up to about 1.4 values beyond the middle.
    // Mutation caught: chooseHandle() -> `if (real_x >= m_point) {` becomes `if (real_x >
    // m_point) {`, and the click on exactly 50 moves the from handle: "50;80". The dropped
    // conversion (`var real_x = handle_x;`) reds this row and the two after it.
    test('a track click exactly between the handles moves the to handle (chooseHandle(): closest handle)', async ({ page }) => {
        await open(page, DOUBLE);
        await clickTrackAt(page, 0.5);
        await expect(page.locator('#slider')).toHaveValue('20;50');
    });

    // The issue's first example: on this 600 px track a click on 51 is 29 from the to handle
    // and 31 from the from handle, and the to handle moves. Before the fix the click reached
    // the comparison as 49.6 against a midpoint of 50, and the from handle moved: "51;80".
    // The readme names no rule for which handle a click moves; chooseHandle()'s own JSDoc does:
    // "Find closest handle to pointer click".
    // Mutation caught: chooseHandle() -> `var real_x = handle_x;` (the conversion dropped),
    // and the input reads "51;80".
    test('a track click just past the midpoint moves the to handle, the nearer one (chooseHandle(): closest handle, #910)', async ({ page }) => {
        await open(page, DOUBLE);
        await clickTrackAt(page, 0.51);
        await expect(page.locator('#slider')).toHaveValue('20;51');
    });

    // The same scale mix where it grows with the handle's share of the track and with the
    // distance of the midpoint from min. On a 300 px track the 16 px handle takes 5.33 of 100,
    // so a click on 93 used to reach the comparison as about 88 (93 x 0.9467), below the
    // midpoint of 80 and 100, 90. The click is 7 from to and 13 from from, and to moves: the
    // input reads "80;93" (it read "93;100" until #910 was fixed).
    // Mutation caught: chooseHandle() -> `var real_x = handle_x;` and the input reads "93;100".
    test('a track click nearer the to handle moves the to handle (chooseHandle(): closest handle)', async ({ page }) => {
        await open(page, { type: 'double', min: 0, max: 100, from: 80, to: 100, step: 1 }, { width: '300' });
        await clickTrackAt(page, 0.93);
        await expect(page.locator('#slider')).toHaveValue('80;93');
    });

    // readme Settings, drag_interval: "Let the user drag the whole interval by its bar." With
    // it on, a click on the track moves the whole interval rather than one handle; the readme
    // does not say where it lands. Characterization: the interval keeps its width and is
    // centred on the clicked value, and at either end of the range it stops against that end
    // with its width intact. These rows keep the two handles apart; the #898 rows after them
    // put them on one value first, and no row puts them near a per-handle limit (#879).
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

    // readme Settings, hide_from_to: "Hide the from and to value labels", off by default, so a
    // double slider shows its values; with both handles on one value it shows one value label
    // for the pair (rendering.spec.mjs pins that for a slider built that way). A user puts the
    // handles on one value by dragging one onto the other, which the slider allows when no
    // min_interval is set. A click on the track then moves the pair (drag_interval), and one
    // value label stays on show, reading the value the pair moved to; the click focused the
    // track, and a right-arrow press that follows carries the pair one step with the label
    // following it. Until #898 was fixed every value label came out hidden after that click,
    // the merged one and both single ones, and stayed hidden through every press after it.
    // Mutations caught: drawLabels() -> in the branch for a pair on one value, the final
    // `else` back to `else if (!this.target)`, and no value label shows after the click; or
    // the line there that hides the merged label dropped, and the merged label shows next to
    // the from label.
    test('a track click with drag_interval on a pair dragged onto one value keeps a value label on show (#898)', async ({ page }) => {
        await open(page, { type: 'double', min: 0, max: 100, from: 40, to: 60, step: 1, drag_interval: true });
        await dragHandleTo(page, 'from', 0.8);   // past the to handle: the from handle stops on it
        await expect(page.locator('#slider')).toHaveValue('60;60');
        await expect.poll(() => shownLabels(page)).toEqual(['60']);   // before the click: one label, 60
        await clickTrackAt(page, 0.3);
        await expect(page.locator('#slider')).toHaveValue('30;30');
        await expect.poll(() => shownLabels(page)).toEqual(['30']);
        await page.keyboard.press('ArrowRight');
        await expect(page.locator('#slider')).toHaveValue('31;31');
        await expect.poll(() => shownLabels(page)).toEqual(['31']);
    });

    // The example of #898 itself: a slider built with both handles on 50 shows one value
    // label, 50 (rendering.spec.mjs pins that), and a click on the track with drag_interval
    // carries the pair to the clicked value with one value label on show, reading it.
    // Mutations caught: the same two as the row above.
    test('a track click with drag_interval on a pair built on one value keeps a value label on show (#898)', async ({ page }) => {
        await open(page, { type: 'double', min: 0, max: 100, from: 50, to: 50, step: 1, drag_interval: true });
        await expect.poll(() => shownLabels(page)).toEqual(['50']);   // before the click: one label, 50
        await clickTrackAt(page, 0.3);
        await expect(page.locator('#slider')).toHaveValue('30;30');
        await expect.poll(() => shownLabels(page)).toEqual(['30']);
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

    // The example of #891. readme Settings, onFinish: "Fires when an interaction ends: [...] or
    // a key is pressed"; from_fixed: "Fix the position of the from handle." With drag_interval
    // a click at the middle of 30..70 lands on the bar, and the key press after it is handed to
    // the whole interval, which a fixed handle keeps where it is. The press still ends as an
    // interaction: one onFinish, no onChange, the input unchanged. Until #891 was fixed the
    // press fired nothing, and neither did any press after it.
    // The click has to land on the bar: a click on the bare track leaves the keyboard on a
    // handle, where the press always fired its onFinish, so the row would pass with the bug back.
    // The element under the click point is checked before the click.
    // Mutations caught: moveIntervalByKey() -> its fixed-handle guard back to a bare `return;`,
    // and the press adds nothing to the log; the pair set off the middle of the track (`from:
    // 10, to: 30` in the open() call), so the click lands on the bare track and the check on the
    // element under it fails.
    test('a key press after a click on the bar with drag_interval and a fixed from handle fires one onFinish and moves nothing (#891)', async ({ page }) => {
        await open(page, { type: 'double', min: 0, max: 100, from: 30, to: 70, step: 1, from_fixed: true, drag_interval: true });
        expect(await classesAt(page, await trackPointAt(page, 0.5)), 'the click lands on the bar').toContain('irs-bar');
        await clickTrackAt(page, 0.5);
        await expect.poll(() => typesAfter(page, 0)).toEqual(['onStart', 'onFinish']);   // the click's own onFinish
        await focusTrack(page);

        await page.keyboard.press('ArrowRight');
        await expect.poll(() => typesAfter(page, 0)).toEqual(['onStart', 'onFinish', 'onFinish']);
        await page.waitForTimeout(400);   // outlast the idle render tick before reading an unchanged value

        await expect(page.locator('#slider')).toHaveValue('30;70');
        expect(await typesAfter(page, 0)).toEqual(['onStart', 'onFinish', 'onFinish']);
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
