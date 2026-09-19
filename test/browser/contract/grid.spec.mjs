/**
 * #877 browser suite -- Task 13: the value grid.
 *
 * readme Settings rows grid, grid_margin, grid_num, grid_snap and prettify_grid, plus the
 * "values" note ("The grid gets one labelled tick per entry") and the "prettify_grid"
 * note. The grid_num row carries the two numbers these rows turn on: "Number of grid units
 * the value range is cut into, at most 50. A labelled tick mark sits at each unit
 * boundary, with smaller unlabelled ticks between them (up to 28 units)."
 *
 * The grid is built once, in appendGrid(), and only re-measured afterwards, so every row
 * here reads the markup of a freshly built slider.
 *
 * Repeated ticks on a range holding fewer steps than grid_num are already covered by the
 * #772 tests in test/browser/features.spec.mjs and are not repeated here.
 *
 * These are characterization tests of shipped behaviour, so each names in a comment the
 * one-line change to js/ion.rangeSlider.js that reds it. Each was applied live, run,
 * watched red and reverted.
 */
import { test, expect } from '@playwright/test';
import { open, LABEL } from '../helpers.mjs';
import { readState } from '../lib/state.mjs';

/**
 * How many small unlabelled ticks the plugin drew between the first and the second
 * labelled tick. The markup interleaves them in document order (the small ticks leading
 * up to a labelled tick are emitted just before it), so this walks the tick spans from
 * the first labelled one and counts the small ones until the next labelled one.
 */
function smallTicksAfterFirstBig(page) {
    return page.evaluate(() => {
        const ticks = Array.prototype.slice.call(document.querySelectorAll('#wrap .irs-grid-pol'));
        const isSmall = ticks.map((el) => el.className.indexOf('small') >= 0);
        let count = 0;
        for (let i = isSmall.indexOf(false) + 1; i < isSmall.length && isSmall[i]; i++) {
            count++;
        }
        return count;
    });
}

test.describe(`grid (${LABEL})`, () => {
    // readme Settings, grid_num: "Number of grid units the value range is cut into, at
    // most 50." A unit boundary at each end of every unit means one more label than units,
    // and the cap applies to the units, so the most labels a grid can hold is 51.
    // Mutation caught: appendGrid() -> `if (big_num > 50) big_num = 50` becomes
    // `if (big_num > 60) big_num = 60`, and the grid_num 60 row reads 61 labels.
    for (const [grid_num, labels] of [[1, 2], [4, 5], [10, 11], [50, 51], [60, 51]]) {
        test(`grid_num ${grid_num} draws ${labels} labelled ticks (Settings: grid_num)`, async ({ page }) => {
            await open(page, { min: 0, max: 100, from: 10, grid: true, grid_num });

            await expect(page.locator('#wrap .irs-grid-text')).toHaveCount(labels);
            const state = await readState(page);
            expect(state.grid.texts[0]).toBe('0');
            expect(state.grid.texts[state.grid.texts.length - 1]).toBe('100');
        });
    }

    // readme Settings, grid_num: "with smaller unlabelled ticks between them (up to 28
    // units)". The plugin thins them out as the units multiply, and stops drawing them
    // past 28 units. Both sides of every threshold are pinned so that moving one of them
    // has nowhere to hide.
    // Mutation caught: appendGrid() -> `if (big_num > 7) small_max = 2;` becomes
    // `if (big_num > 8) small_max = 2;`, and the grid_num 8 row counts 3 small ticks.
    for (const [grid_num, small] of [[4, 4], [7, 3], [8, 2], [14, 2], [15, 1], [28, 1], [29, 0]]) {
        test(`grid_num ${grid_num} puts ${small} small ticks between two labelled ones (Settings: grid_num)`, async ({ page }) => {
            await open(page, { min: 0, max: 100, from: 10, grid: true, grid_num });

            expect(await smallTicksAfterFirstBig(page)).toBe(small);
        });
    }

    // readme Settings, grid_snap: "Use one grid unit per step instead of grid_num."
    // Mutation caught: appendGrid() -> `big_num = total / o.step` becomes
    // `big_num = o.grid_num`, and the grid falls back to five labels counting by 25.
    test('grid_snap puts one labelled tick on every step (Settings: grid_snap)', async ({ page }) => {
        await open(page, { min: 0, max: 100, from: 10, step: 10, grid: true, grid_snap: true });

        const state = await readState(page);
        expect(state.grid.texts).toEqual(['0', '10', '20', '30', '40', '50', '60', '70', '80', '90', '100']);
    });

    // Characterization: the readme's grid_snap row says one unit per step and says nothing
    // about a step that leaves a remainder. On 0 to 100 with step 7 the steps run out at
    // 98, and the plugin labels every step boundary and then adds a final label on max.
    // That last label names a value the step scale does not hold, but it is the one value
    // off the scale the slider can still reach (a drag to the far end lands on 100), so it
    // is recorded here rather than counted against the readme.
    // Mutation caught: the same `big_num = total / o.step` -> `big_num = o.grid_num` as
    // above, which replaces the whole list with five labels counting by 25.
    test('grid_snap on a step that leaves a remainder labels the steps and then max (characterization)', async ({ page }) => {
        await open(page, { min: 0, max: 100, from: 7, step: 7, grid: true, grid_snap: true });

        const state = await readState(page);
        expect(state.grid.texts).toEqual([
            '0', '7', '14', '21', '28', '35', '42', '49',
            '56', '63', '70', '77', '84', '91', '98', '100'
        ]);
    });

    // readme note "step": "Every value is `min` plus a whole number of steps". readme
    // Settings, grid_num: "A labelled tick mark sits at each unit boundary." A slider on 0
    // to 10 with step 2 holds 0, 2, 4, 6, 8 and 10, so cutting it into four units puts two
    // of the five labels on values the slider cannot reach: the grid reads 0, 3, 5, 8, 10
    // while a drag to the first quarter lands on 2.
    //
    // Endpoints are left out of the check: the first and last labels carry min and max,
    // which the readme documents as the range ends whether or not a whole number of steps
    // reaches them.
    // Mutation caught: appendGrid() -> `result = this.convertToValue(big_w)` becomes
    // `result = big_w`, and the labels name percentages instead of values, which is off
    // the scale in a different way and reds this test for a different reason. This row is
    // pinned to a filed defect instead, so it is the readme that names the expectation.
    test('every labelled tick names a value on the step scale (note "step", Settings: grid_num)', async ({ page }) => {
        test.fail(true, '#892: grid labels name values off the step scale on a range that does not divide');

        const min = 0;
        const step = 2;
        await open(page, { min, max: 10, from: 0, step, grid: true, grid_num: 4 });

        const texts = (await readState(page)).grid.texts;
        const interior = texts.slice(1, -1);
        const offScale = interior.filter((text) => {
            const steps = (Number(text) - min) / step;
            return steps !== Math.round(steps);
        });
        expect(offScale).toEqual([]);
    });

    // readme note "values": "The grid gets one labelled tick per entry, up to the 50-unit
    // cap, because grid_num and grid_snap are set for you." grid_num is left at its
    // default of 4 here, so a grid that ignored the values would show five ticks counting
    // by index instead of the five entries.
    // Mutation caught: appendGrid() -> in the values branch, `result = o.p_values[result]`
    // becomes `result = this._prettifyGrid(result)`, and the labels read 0 to 4.
    test('values mode labels one tick per entry (note "values")', async ({ page }) => {
        await open(page, { values: ['a', 'b', 'c', 'd', 'e'], grid: true });

        const state = await readState(page);
        expect(state.grid.texts).toEqual(['a', 'b', 'c', 'd', 'e']);
    });

    // readme note "prettify_grid": "Formats the grid labels only." The value, min and max
    // labels on the same page have to come through untouched, which is what separates this
    // row from the prettify spec's coverage of the formatting chain itself.
    // Mutation caught: appendGrid() -> `result = this._prettifyGrid(result)` becomes
    // `result = this._prettify(result)`, and the grid labels lose their brackets.
    test('prettify_grid formats the grid labels and nothing else (note "prettify_grid")', async ({ page }) => {
        await open(page, "{min:0,max:100,from:50,grid:true,grid_num:4,prettify_grid:function(n){return '<'+n+'>';}}");

        const state = await readState(page);
        expect(state.grid.texts).toEqual(['<0>', '<25>', '<50>', '<75>', '<100>']);
        expect(state.labels.single.text).toBe('50');
        expect(state.labels.min.text).toBe('0');
        expect(state.labels.max.text).toBe('100');
    });

    // readme Settings, grid_margin: "Add a grid margin on the left and right, half a
    // handle wide, so the first and last grid labels line up with the handle centers."
    // With from on min the handle sits at the start of the track, so its centre is the
    // place the first tick is supposed to meet.
    // Mutation caught: calcGridMargin() -> drop the `if (!this.options.grid_margin)
    // return;` guard, and the grid_margin false row gets the inset grid as well.
    for (const grid_margin of [true, false]) {
        test(`grid_margin ${grid_margin} places the grid against the handle centre or the container edge (Settings: grid_margin)`, async ({ page }) => {
            await open(page, { min: 0, max: 100, from: 0, grid: true, grid_num: 4, grid_margin });

            const geometry = await page.evaluate(() => {
                const rect = (selector) => document.querySelector(selector).getBoundingClientRect();
                const cont = rect('#wrap > .irs');
                const grid = rect('#wrap .irs-grid');
                const handle = rect('#wrap .irs-handle');
                const firstTick = Array.prototype.slice.call(document.querySelectorAll('#wrap .irs-grid-pol'))
                    .filter((el) => el.className.indexOf('small') < 0)[0].getBoundingClientRect();
                return {
                    contLeft: cont.left, contWidth: cont.width,
                    gridLeft: grid.left, gridWidth: grid.width,
                    handleCentre: handle.left + handle.width / 2, handleWidth: handle.width,
                    tickLeft: firstTick.left
                };
            });

            // The first tick starts where the grid box starts either way; what grid_margin
            // decides is where that box begins.
            expect(Math.abs(geometry.tickLeft - geometry.gridLeft)).toBeLessThanOrEqual(1);

            if (grid_margin) {
                expect(Math.abs(geometry.tickLeft - geometry.handleCentre)).toBeLessThanOrEqual(1);
                expect(Math.abs(geometry.gridWidth - (geometry.contWidth - geometry.handleWidth))).toBeLessThanOrEqual(1);
            } else {
                expect(Math.abs(geometry.gridLeft - geometry.contLeft)).toBeLessThanOrEqual(1);
                expect(Math.abs(geometry.gridWidth - geometry.contWidth)).toBeLessThanOrEqual(1);
                expect(Math.abs((geometry.handleCentre - geometry.tickLeft) - geometry.handleWidth / 2)).toBeLessThanOrEqual(1);
            }
        });
    }

    // Characterization: the readme lets a grid be cut into 50 units whatever the container
    // is wide, and the plugin keeps the result readable by hiding labels that would run
    // into their neighbours. Which labels survive is a question of measured text width, so
    // the row compares two widths instead of pinning a set: the same grid on a narrower
    // container has to keep fewer labels. The first label is never a candidate for hiding.
    // At 300 px the last label is hidden as well, which is left unasserted because the
    // text metrics behind it differ between engines.
    // Mutation caught: calcGridCollision() -> the else branch `label.style.visibility =
    // "hidden"` becomes `"visible"`, and both widths show all 51 labels.
    test('a grid too dense for its container hides labels (characterization)', async ({ page }) => {
        const config = { min: 0, max: 100, from: 10, grid: true, grid_num: 50 };

        await open(page, config, { width: '300' });
        const narrow = (await readState(page)).grid;

        await open(page, config, { width: '600' });
        const wide = (await readState(page)).grid;

        expect(narrow.texts).toHaveLength(51);
        expect(wide.texts).toHaveLength(51);
        expect(narrow.visibleTexts.length).toBeLessThan(narrow.texts.length);
        expect(narrow.visibleTexts.length).toBeLessThan(wide.visibleTexts.length);
        expect(narrow.visibleTexts[0]).toBe('0');
        expect(wide.visibleTexts[0]).toBe('0');
    });
});
