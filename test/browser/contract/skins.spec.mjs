/**
 * #877 browser suite -- Task 11: the six skins named in the readme's `skin` row, checked
 * as geometry rather than as class names.
 *
 * readme Settings, skin: "Skin (flat, big, modern, round, sharp, square)". That the option
 * reaches the container as irs--<skin> is pinned by the skin rows of the option routes
 * spec; what those rows cannot see is whether the stylesheet behind the class still draws
 * a handle, and whether a drag on that handle still lands where it is aimed.
 *
 * The plugin measures the handle itself (calcHandlePercent(), at init, on every tenth
 * calc() and on every relayout) and takes that width out of the usable track, so a handle
 * that is simply drawn wider or narrower does not move where a drag lands. The two rows of
 * each skin therefore catch different things. The width row catches a visual regression
 * of a skin's handle: an edited @handle_width, a border added outside box-sizing, a
 * dropped transform. The drag row catches a mismatch between the handle as drawn and the
 * width jQuery reports for it, such as a transform or a margin that one of the two sees
 * and the other does not.
 *
 * The widths below are measured through getBoundingClientRect(). They are the
 * @handle_width of each less/skins/<skin>.less, except for square (see its entry).
 *
 * These are characterization tests of shipped behaviour. The drag rows name in a comment
 * the one-line change to js/ion.rangeSlider.js that reds them; it was applied live, run,
 * watched red and reverted. The width rows have no plugin mutation: their number comes
 * from css/ion.rangeSlider.css, and no change to js/ion.rangeSlider.js can red them.
 */
import { test, expect } from '@playwright/test';
import { open, LABEL } from '../helpers.mjs';
import { readState } from '../lib/state.mjs';
import { dragHandleTo } from '../lib/interact.mjs';
import { readEnv } from '../lib/env.mjs';

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
        // of the LESS variable. What the plugin takes the handle to be depends on the
        // jQuery build: jQuery outerWidth() reads the untransformed layout width, 16, on
        // every build except 3.0.x and 3.1.x, which measure it through
        // getBoundingClientRect() as well and report the rotated 22.6 (see the drag row).
        width: 16 * Math.SQRT2
    }
];

test.describe(`skins (${LABEL})`, () => {
    for (const { skin, width } of SKINS) {
        test(`skin ${skin} keeps the handle width it renders, ${Math.round(width * 10) / 10} px (characterization of less/skins/${skin}.less)`, async ({ page }) => {
            await open(page, { skin, min: 0, max: 100, from: 10 });

            const box = (await readState(page)).handles.single.box;
            expect(box.width).toBeGreaterThan(0);
            expect(box.height).toBeGreaterThan(0);
            expect(Math.abs(box.width - width)).toBeLessThanOrEqual(1);
        });

        // Mutation caught: convertToRealPercent() -> `var full = 100 -
        // this.coords.p_handle;` becomes `var full = 100;`, dropping the handle-width
        // correction, and on jQuery 3.7.1 every skin lands short of 50 by an amount that
        // grows with its handle: 49 for flat, modern, sharp and square, 48 for big and round.
        //
        // The square skin on jQuery 3.0.x and 3.1.x: those builds report the rotated handle
        // as about 22.6 px wide, the plugin takes that width out of the track while the
        // handle is laid out 16 px wide, and a drag to the middle of the track reports 51.
        // Not filed yet; the row expects that failure on those two builds only.
        test(`skin ${skin} keeps a drag to the middle of the track on 50 (Settings: skin)`, async ({ page }) => {
            await open(page, { skin, min: 0, max: 100, from: 10 });
            const env = await readEnv(page);
            test.fail(skin === 'square' && /^3\.[01]\./.test(env.jquery), 'unfiled: the square skin on jQuery 3.0.x and 3.1.x lands a drag to the middle of the track on 51');

            await dragHandleTo(page, 'single', 0.5);
            await expect(page.locator('#slider')).toHaveValue('50');
        });
    }
});
