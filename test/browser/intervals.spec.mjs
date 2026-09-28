import { test, expect } from '@playwright/test';
import { open, events, input, LABEL } from './helpers.mjs';

// #885: min_interval and max_interval were applied only once a handle moved. A double
// slider built with a pair that breaks them rendered that pair, wrote it into the input
// (which is what a form submits) and handed it to onStart; update() did the same with the
// pair it was given. validate() now moves one handle so the pair holds the interval: the
// to handle at build time, the handle the call set on update(). When that handle's own
// limit stops it short, the other handle moves the rest of the way inside its own limits.
//
// Each row reads what the page shows after the first render: the input's value, the
// payload onStart (or onUpdate) carried, and where the two handles and the bar stand,
// compared with a slider built directly on the corrected pair. The jsdom suite
// (test/unit/intervals-validate.test.mjs) pins the rules case by case; this spec proves
// the corrected pair is the one the real render, the input and the callbacks agree on.
//
// Mutation for every row: drop the applyIntervals() call from validate() -- the input,
// the payload and the handles show the configured pair again. The update() row also reds
// on the update branch moving the wrong handle (always the to handle): the pair ends on
// 30 and 50. The to_min row also reds on the second-handle step removed (the to handle
// stops on to_min and the from handle stays): the pair ends on 30 and 40.

/** Inline left/width of the handles and the bar: where the render put them. */
const layout = (page) => page.evaluate(() => {
    const style = (selector) => {
        const el = document.querySelector(selector);
        return el ? { left: el.style.left, width: el.style.width } : null;
    };
    return {
        from: style('.irs-handle.from').left,
        to: style('.irs-handle.to').left,
        bar: style('.irs-bar')
    };
});

/** The layout of a slider built directly on the pair the test expects. */
async function layoutOf(page, config) {
    await open(page, config);
    return layout(page);
}

const ROWS = [
    {
        title: 'max_interval: from 30, to 70, max_interval 6 opens on 30 and 36',
        config: { type: 'double', min: 0, max: 100, from: 30, to: 70, max_interval: 6 },
        value: '30;36',
        pair: { from: 30, to: 36 },
        reference: { type: 'double', min: 0, max: 100, from: 30, to: 36 }
    },
    {
        title: 'min_interval: from 48, to 52, min_interval 20 opens on 48 and 68',
        config: { type: 'double', min: 0, max: 100, from: 48, to: 52, min_interval: 20 },
        value: '48;68',
        pair: { from: 48, to: 68 },
        reference: { type: 'double', min: 0, max: 100, from: 48, to: 68 }
    },
    {
        title: 'to_min stops the to handle: from 30, to 70, to_min 40, max_interval 6 opens on 34 and 40',
        config: { type: 'double', min: 0, max: 100, from: 30, to: 70, to_min: 40, max_interval: 6 },
        value: '34;40',
        pair: { from: 34, to: 40 },
        reference: { type: 'double', min: 0, max: 100, from: 34, to: 40 }
    },
    {
        title: 'values mode: from 0, to 4, max_interval 1 opens one entry apart',
        config: { type: 'double', values: [10, 20, 30, 40, 50], from: 0, to: 4, max_interval: 1 },
        value: '10;20',
        pair: { from: 0, to: 1 },
        reference: { type: 'double', values: [10, 20, 30, 40, 50], from: 0, to: 1 }
    }
];

test.describe(`min_interval and max_interval at build and on update() (${LABEL})`, () => {
    for (const row of ROWS) {
        test(`#885 ${row.title}`, async ({ page }) => {
            const expected = await layoutOf(page, row.reference);

            await open(page, row.config);
            await expect(input(page)).toHaveValue(row.value);
            const started = (await events(page)).find((e) => e.type === 'onStart');
            expect(started, 'onStart must have fired').toBeTruthy();
            expect({ from: started.from, to: started.to }).toEqual(row.pair);
            expect(await layout(page)).toEqual(expected);
        });
    }

    // A per-handle limit the interval cannot hold with (#894): to_fixed holds 70,
    // max_interval 4 wants the from handle at 66, and from_max 60 stops it. The slider draws
    // the pair that keeps the limit, and a slider built hidden, which is not drawn until it
    // is shown, holds that same pair in its input. Mutation: the closing per-handle clamp
    // removed from applyIntervals() -- built hidden on jQuery 3.3 or later the input holds
    // "66;70" while a visible slider's holds "60;70" (below 3.3 a slider built hidden is
    // drawn at init too, so the hidden row passes there either way).
    for (const hidden of [false, true]) {
        test(`#885 from_max 60 that max_interval 4 cannot hold with keeps the from handle on 60 (${hidden ? 'built hidden' : 'visible'})`, async ({ page }) => {
            await open(page, { type: 'double', min: 0, max: 100, from: 30, to: 70, from_max: 60, max_interval: 4, to_fixed: true }, hidden ? { hidden: '1' } : {});
            await expect(input(page)).toHaveValue('60;70');
        });
    }

    // Issue #885, third example: update({from: 2}) on a values-mode slider with a
    // min_interval of 2 left the handles one entry apart. The call set the from handle, so
    // the from handle moves back to entry 1.
    test('#885 update({from: 2}) with min_interval 2 moves the from handle back to entry 1', async ({ page }) => {
        const values = [10, 20, 30, 40, 50];
        const expected = await layoutOf(page, { type: 'double', values, from: 1, to: 3 });

        await open(page, { type: 'double', values, from: 1, to: 3, min_interval: 2 });
        await expect(input(page)).toHaveValue('20;40');
        await page.evaluate(() => window.__irs.slider.update({ from: 2 }));

        await expect(input(page)).toHaveValue('20;40');
        const updated = (await events(page)).filter((e) => e.type === 'onUpdate');
        expect(updated.map((e) => ({ from: e.from, to: e.to }))).toEqual([{ from: 1, to: 3 }]);
        // update() rebuilds the slider and draws it on the next render tick.
        await expect.poll(() => layout(page)).toEqual(expected);
    });
});
