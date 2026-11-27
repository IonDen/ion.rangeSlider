/**
 * #921 -- a blocked slider ignores a press on a value label that sticks out past the mask.
 *
 * The oracle is readme.md, settings row `block`: "Block the slider but keep the input enabled.
 * Value is still submitted with the form". The mask block lays over the slider spans the track
 * from -1% to 101%, but a value label wider than the handle is not held inside the slider unless
 * force_edges is on: with from at min (or to at max) a long prefix or postfix makes the label
 * stick out past the mask, a press on that part reaches the label's own handler, and up to 2.6.0
 * it moved the blocked slider with the full onChange and onFinish stream.
 *
 * Each row measures where the label sticks out (the label box against the mask box, as rendered),
 * presses there with the real mouse, drags and asserts that the value, the input and the recorded
 * callbacks do not change. The same press on the same slider without block moves it: that control
 * proves the press point is live and lands on the label, so the blocked rows cannot pass on a
 * layout where nothing sticks out or the press misses the label.
 *
 * Each row names the one-line change to js/ion.rangeSlider.js that reds it; each was applied live
 * with testkit mutate, watched red on the named test and reverted.
 */
import { test, expect } from '@playwright/test';
import { open, events, input } from './helpers.mjs';
import { classesAt } from './lib/interact.mjs';

const PREFIX = { prefix: 'Price from: ', postfix: ' dollars total' };

/**
 * The part of the label that sticks out past the mask, on one side: its width, and a press x a
 * few px outside the mask edge (inside the label), so the point stays on screen however wide the
 * label is.
 */
function overhang(label, mask, side) {
    if (side === 'left') {
        const width = mask.x - label.x;
        return { width, x: mask.x - Math.min(3, width / 2) };
    }
    const label_right = label.x + label.width, mask_right = mask.x + mask.width;
    const width = label_right - mask_right;
    return { width, x: mask_right + Math.min(3, width / 2) };
}

/**
 * Presses on `point`, drags `dx` px sideways and releases, then waits out the idle render tick,
 * so a value the press would have moved is on the input when the caller reads it.
 */
async function pressAndDrag(page, point, dx) {
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.move(point.x + dx, point.y, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(400);
}

const CASES = [
    {
        name: 'single type, from at min (label sticks out on the left)',
        config: { min: 0, max: 100, from: 0, step: 1, ...PREFIX },
        label: '.irs-single', side: 'left', dx: 250, value: '0'
    },
    {
        name: 'single type, from at max (label sticks out on the right)',
        config: { min: 0, max: 100, from: 100, step: 1, ...PREFIX },
        label: '.irs-single', side: 'right', dx: -250, value: '100'
    },
    {
        name: 'double type, from at min (the from label sticks out on the left)',
        config: { type: 'double', min: 0, max: 100, from: 0, to: 100, step: 1, ...PREFIX },
        label: '.irs-from', side: 'left', dx: 250, value: '0;100'
    },
    {
        name: 'double type, to at max (the to label sticks out on the right)',
        config: { type: 'double', min: 0, max: 100, from: 0, to: 100, step: 1, ...PREFIX },
        label: '.irs-to', side: 'right', dx: -250, value: '0;100'
    }
];

test.describe('block: a press on a value label past the mask (#921)', () => {
    for (const c of CASES) {
        // Mutation caught: pointerDown(), drop the `if (this.options.block) { return; }` guard:
        // the drag from the overhanging label moves the blocked slider, the input leaves its value
        // and onChange and onFinish are recorded. A value label only reaches pointerDown(); the
        // guard in pointerClick() is pinned in the unit file only. The assertion that the overhang
        // is wider than 0 px keeps the row from passing on a layout where the label sits inside
        // the mask.
        test(`${c.name}: a press and drag on the part past the mask moves nothing; without block the same press moves it`, async ({ page }) => {
            await open(page, { ...c.config, block: true });
            const label = await page.locator(`#wrap ${c.label}`).boundingBox();
            const mask = await page.locator('#wrap .irs-disable-mask').boundingBox();
            const past = overhang(label, mask, c.side);
            const point = { x: past.x, y: label.y + label.height / 2 };
            // Setup: something sticks out, and the point is on the label, outside the mask.
            expect(past.width).toBeGreaterThan(0);
            expect(await classesAt(page, point)).toContain(c.label.slice(1));
            const n = (await events(page)).length;

            await pressAndDrag(page, point, c.dx);

            await expect(input(page)).toHaveValue(c.value);
            expect((await events(page)).slice(n)).toEqual([]);

            // Control: the same press on the same slider without block lands on the same label
            // and moves it.
            await open(page, c.config);
            expect(await classesAt(page, point)).toContain(c.label.slice(1));
            const m = (await events(page)).length;

            await pressAndDrag(page, point, c.dx);

            await expect(input(page)).not.toHaveValue(c.value);
            expect((await events(page)).slice(m).map((e) => e.type)).toContain('onChange');
        });
    }
});
