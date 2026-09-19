/**
 * #877 browser suite -- Task 12: the six skins named in the readme's `skin` row, checked
 * as geometry rather than as class names.
 *
 * readme Settings, skin: "Skin (flat, big, modern, round, sharp, square)". That the option
 * reaches the container as irs--<skin> is pinned by the skin rows of the option routes
 * spec; what those rows cannot see is whether the stylesheet behind the class still draws
 * a handle, and whether the handle it draws is still the size the plugin's pointer maths
 * is built around.
 *
 * The handle width is the number that matters: the plugin subtracts it from the usable
 * track (the fake percent space) so a handle never overflows, so a skin whose handle
 * changed size changes where every drag lands. The widths below are the @handle_width of
 * each less/skins/<skin>.less, measured through getBoundingClientRect().
 *
 * A width row is characterization of the compiled stylesheet: no change to
 * js/ion.rangeSlider.js can red it, because the number comes from css/ion.rangeSlider.css.
 * Its catching power is a skin regression in less/ -- an edited @handle_width, a border
 * added outside box-sizing, a dropped transform -- which is exactly the kind of change
 * that otherwise reaches a release unnoticed. The drag row below it is the one that names
 * a plugin mutation.
 */
import { test, expect } from '@playwright/test';
import { open, LABEL } from '../helpers.mjs';
import { readState } from '../lib/state.mjs';
import { dragHandleTo } from '../lib/interact.mjs';

const SKINS = [
    { skin: 'flat', width: 16 },
    { skin: 'big', width: 30 },
    { skin: 'modern', width: 12 },
    { skin: 'round', width: 24 },
    { skin: 'sharp', width: 10 },
    {
        skin: 'square',
        // less/skins/square.less sets @handle_width: 16px and then rotates the handle by
        // 45 degrees. getBoundingClientRect() reports the axis-aligned box of the rotated
        // square, which is 16 * sqrt(2) wide, so the measured value is pinned here instead
        // of the LESS variable. The plugin itself reads the untransformed layout width
        // through jQuery outerWidth(), which is still 16, which is why the drag below
        // lands on the same value as every other skin.
        width: 16 * Math.SQRT2
    }
];

test.describe(`skins (${LABEL})`, () => {
    for (const { skin, width } of SKINS) {
        test(`skin ${skin} draws a handle of the size its stylesheet declares (characterization of less/skins/${skin}.less)`, async ({ page }) => {
            await open(page, { skin, min: 0, max: 100, from: 10 });

            const box = (await readState(page)).handles.single.box;
            expect(box.width).toBeGreaterThan(0);
            expect(box.height).toBeGreaterThan(0);
            expect(Math.abs(box.width - width)).toBeLessThanOrEqual(1);
        });

        // Mutation caught: convertToRealPercent() -> `var full = 100 -
        // this.coords.p_handle;` becomes `var full = 100;`, dropping the handle-width
        // correction, and every skin lands short of 50 by an amount that grows with its
        // handle: 49 for flat, modern, sharp and square, 48 for big and round.
        test(`skin ${skin} keeps a drag to the middle of the track on 50 (Settings: skin)`, async ({ page }) => {
            await open(page, { skin, min: 0, max: 100, from: 10 });

            await dragHandleTo(page, 'single', 0.5);
            await expect(page.locator('#slider')).toHaveValue('50');
        });
    }
});
