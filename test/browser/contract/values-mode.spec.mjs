/**
 * #877 browser suite -- Task 10: values mode, the readme's `values` / `values_raw` /
 * `prettify_all_values` rows and the two notes behind them.
 *
 * readme note "values": "The slider works on array indexes instead of numbers: whatever
 * you pass for min, max and step is replaced by 0, values.length - 1 and 1. The grid gets
 * one labelled tick per entry [...]. A numeric-looking entry such as "20.0" is converted
 * to the number 20 unless values_raw is on."
 *
 * The oracle is the readme, never the plugin. Every assertion is page-observable: the
 * label text, the input's value, the grid texts, and the payload the recorder captured.
 *
 * These are characterization tests of shipped behaviour, so each names in a comment the
 * one-line change to js/ion.rangeSlider.js that reds it. Each was applied live, run,
 * watched red and reverted.
 */
import { test, expect } from '@playwright/test';
import { open, events, LABEL } from '../helpers.mjs';
import { readState } from '../lib/state.mjs';
import { dragHandleTo } from '../lib/interact.mjs';
import { expectedLabel } from '../lib/format.mjs';

/** The first recorded entry of a callback, e.g. the onStart payload. */
async function payload(page, type) {
    const recorded = await events(page);
    return recorded.find((entry) => entry.type === type);
}

test.describe(`values mode (${LABEL})`, () => {
    // Mutation caught: writeToInput(), values branch -> write `this.result.from` instead
    // of `this.result.from_value` -- the input reads the index "2" instead of the entry.
    test('a numeric values array puts the entry on the label and in the input, and the index in from (note "values")', async ({ page }) => {
        const config = { values: [10, 20, 30, 40, 50], from: 2 };
        await open(page, config);
        await expect(page.locator('.irs-single')).toHaveText('30');
        await expect(page.locator('#slider')).toHaveValue('30');
        await expect(page.locator('.irs-min')).toHaveText('10');
        await expect(page.locator('.irs-max')).toHaveText('50');
        // readme "Callback data": from holds the index, from_value the entry, and min/max
        // the first and last index of the array.
        expect(await payload(page, 'onStart')).toMatchObject({ from: 2, from_value: 30, min: 0, max: 4 });
    });

    // Mutation caught: drawLabels(), values branch -> build the single label from
    // `this.result.from` instead of `p_values[this.result.from]` -- the bubble reads "1".
    test('a string values array shows the entry on every label (note "values")', async ({ page }) => {
        await open(page, { values: ['low', 'mid', 'high'], from: 1 });
        await expect(page.locator('.irs-single')).toHaveText('mid');
        await expect(page.locator('#slider')).toHaveValue('mid');
        await expect(page.locator('.irs-min')).toHaveText('low');
        await expect(page.locator('.irs-max')).toHaveText('high');
        expect(await payload(page, 'onStart')).toMatchObject({ from: 1, from_value: 'mid', min: 0, max: 2 });
    });

    // readme note "values": a numeric-looking entry "20.0" is converted to the number 20
    // unless values_raw is on.
    // Mutation caught: validate(), values loop -> `value = +v[i]` becomes `value = NaN`
    // for every entry -- "20.0" stays the string and the label reads "20.0".
    test('a numeric-looking entry is converted to a number without values_raw (note "values")', async ({ page }) => {
        const config = { values: ['10', '20.0', '30'], from: 1 };
        await open(page, config);
        await expect(page.locator('.irs-single')).toHaveText(expectedLabel(1, config));
        await expect(page.locator('#slider')).toHaveValue('20');
        const started = await payload(page, 'onStart');
        expect(started.from_value).toBe(20);
        expect(typeof started.from_value).toBe('number');
    });

    // readme note "values_raw": "Turn values_raw on to keep the entry exactly as written."
    // Mutation caught: validate(), values loop -> drop the `o.values_raw &&` half of the
    // guard so every entry is converted again -- the label reads "20" and from_value is 20.
    test('values_raw keeps a numeric-looking entry exactly as written (note "values_raw")', async ({ page }) => {
        const config = { values: ['10', '20.0', '30'], values_raw: true, from: 1 };
        await open(page, config);
        await expect(page.locator('.irs-single')).toHaveText('20.0');
        await expect(page.locator('#slider')).toHaveValue('20.0');
        const started = await payload(page, 'onStart');
        expect(started.from_value).toBe('20.0');
        expect(typeof started.from_value).toBe('string');
    });

    // A one-entry array is the degenerate case of "min, max and step become 0,
    // values.length - 1 and 1": min and max are both index 0, so every label shows the
    // only entry and no drag can leave it.
    // Mutation caught: validate() -> `o.max = vl - 1` becomes `o.max = vl` -- max is index
    // 1, which no entry fills, and the max label renders "undefined".
    test('a one-entry values array pins the slider on that entry (note "values")', async ({ page }) => {
        await open(page, { values: ['only'] });
        await expect(page.locator('.irs-single')).toHaveText('only');
        await expect(page.locator('.irs-max')).toHaveText('only');
        await expect(page.locator('#slider')).toHaveValue('only');
        expect(await payload(page, 'onStart')).toMatchObject({ from: 0, from_value: 'only', min: 0, max: 0 });
        await dragHandleTo(page, 'single', 1);
        await page.waitForTimeout(400);   // outlast the idle render tick before reading an unchanged value
        await expect(page.locator('#slider')).toHaveValue('only');
    });

    // readme Settings, prettify_all_values: "In values mode, also run prettify on
    // non-numeric entries".
    // Mutation caught: validate(), values loop -> drop the `else if
    // (o.prettify_all_values)` branch -- the label reads "b" instead of "b!".
    test('prettify_all_values runs prettify on non-numeric entries (Settings: prettify_all_values)', async ({ page }) => {
        const config = { values: ['a', 'b', 'c'], prettify_all_values: true, from: 1, __prettify: (n) => n + '!' };
        await open(page, "{values: ['a', 'b', 'c'], prettify_all_values: true, from: 1, prettify: function (n) { return n + '!'; }}");
        await expect(page.locator('.irs-single')).toHaveText(expectedLabel(1, config));
        await expect(page.locator('.irs-single')).toHaveText('b!');
        // The input carries the entry itself, not the formatted text.
        await expect(page.locator('#slider')).toHaveValue('b');
    });

    // The default half of the same row: without prettify_all_values a non-numeric entry
    // never reaches prettify, so a formatter written for numbers never sees a string.
    // Mutation caught: validate(), values loop -> make the `else if
    // (o.prettify_all_values)` branch unconditional -- the label reads "b!".
    test('without prettify_all_values a non-numeric entry is shown as written (Settings: prettify_all_values)', async ({ page }) => {
        const config = { values: ['a', 'b', 'c'], from: 1, __prettify: (n) => n + '!' };
        await open(page, "{values: ['a', 'b', 'c'], from: 1, prettify: function (n) { return n + '!'; }}");
        await expect(page.locator('.irs-single')).toHaveText(expectedLabel(1, config));
        await expect(page.locator('.irs-single')).toHaveText('b');
    });

    // readme note "values": "The grid gets one labelled tick per entry, up to the 50-unit
    // cap, because grid_num and grid_snap are set for you."
    // Mutation caught: appendGrid() -> drop `result = o.p_values[result]` from the values
    // branch -- the ticks read the raw indexes 0, 1, 2, 3 instead of the entries.
    test('the grid gets one labelled tick per entry (note "values")', async ({ page }) => {
        const config = { values: ['a', 'b', 'c', 'd'], grid: true };
        await open(page, config);
        const state = await readState(page, 1, config);
        expect(state.grid.texts).toEqual(['a', 'b', 'c', 'd']);
    });

    // readme "Public methods": "update() merges the options you pass into the current ones
    // and rebuilds the slider, so options you leave out keep the value they have now,
    // including the current from and to." A new values array therefore keeps index 1 and
    // re-reads it against the new entries.
    // Mutation caught: validate() -> drop `o.p_values = []` at the top of the values branch
    // -- the new labels are appended to the old ones, so index 1 still reads "b".
    test('update({values}) re-reads the current index against the new entries (Public methods: update)', async ({ page }) => {
        await open(page, { values: ['a', 'b', 'c'], from: 1 });
        await expect(page.locator('#slider')).toHaveValue('b');
        await page.evaluate(() => window.__irs.slider.update({ values: ['x', 'y', 'z', 'w'] }));
        await expect(page.locator('.irs-single')).toHaveText('y');
        await expect(page.locator('#slider')).toHaveValue('y');
        await expect(page.locator('.irs-max')).toHaveText('w');
        expect(await payload(page, 'onUpdate')).toMatchObject({ from: 1, from_value: 'y', min: 0, max: 3 });
    });

    // readme "Settings", from: the input's own value attribute is the third route into
    // from, and in values mode "the value is looked up as an index".
    // Mutation caught: constructor -> `js_values = !!(options.values && options.values.length)`
    // becomes `js_values = false` -- neither the text lookup nor the one after it reads the
    // values array, "c" is read as a number, and the slider starts on the first entry.
    // (Since #880 the text lookup finds "c" on its own, so breaking only the older
    // `options.values.indexOf(val[0])` line no longer reds this.)
    test('the input value attribute names the entry the slider starts on (Settings: from)', async ({ page }) => {
        await open(page, { values: ['a', 'b', 'c', 'd'] }, { attrs: JSON.stringify({ value: 'c' }) });
        await expect(page.locator('#slider')).toHaveValue('c');
        await expect(page.locator('.irs-single')).toHaveText('c');
        expect(await payload(page, 'onStart')).toMatchObject({ from: 2, from_value: 'c' });
    });

    // The same route with numeric-looking entries. The readme draws no distinction
    // between a string array and a numeric-looking one, so the lookup finds "20" at
    // index 1 here exactly as it finds "c" above (#880).
    // Mutation caught: constructor -> findValueIndex() returns -1 at once (the lookup
    // removed) -- "20" is converted to the number 20, which the array of strings does
    // not hold, and the slider starts on "10".
    test('the input value attribute names a numeric-looking entry too (Settings: from)', async ({ page }) => {
        await open(page, { values: ['10', '20', '30'] }, { attrs: JSON.stringify({ value: '20' }) });
        await expect(page.locator('#slider')).toHaveValue('20');
        expect(await payload(page, 'onStart')).toMatchObject({ from: 1 });
    });

    // The data-values case: the entries come from the data-values attribute instead of
    // the values option, and the input value names its entries all the same, both halves
    // in double type.
    // Mutation caught: constructor -> the data-values branch of the lookup removed -- the
    // halves are read as numbers, come out NaN, and the slider starts on "a" and "d".
    test('the input value attribute names entries of data-values too (Settings: from, values)', async ({ page }) => {
        const attrs = { value: 'b;c', 'data-values': 'a,b,c,d', 'data-type': 'double' };
        await open(page, {}, { attrs: JSON.stringify(attrs) });
        await expect(page.locator('#slider')).toHaveValue('b;c');
        expect(await payload(page, 'onStart')).toMatchObject({ from: 1, to: 2, from_value: 'b', to_value: 'c' });
    });

    // The round trip the input is meant to provide: the plugin writes the entry into the
    // input, and a slider built from that markup starts on the same entry.
    // Mutation caught: writeToInput(), values branch -> write `this.result.from` instead
    // of `this.result.from_value` -- the drag leaves the index "2" in the input and the
    // second slider, looking that up as an entry, starts on the first one.
    test('the value the plugin writes rebuilds the same slider (Settings: from, note "values")', async ({ page }) => {
        await open(page, { values: ['a', 'b', 'c', 'd'] });
        await dragHandleTo(page, 'single', 0.66);
        await expect(page.locator('#slider')).toHaveValue('c');
        const written = await page.locator('#slider').inputValue();

        await open(page, { values: ['a', 'b', 'c', 'd'] }, { attrs: JSON.stringify({ value: written }) });
        await expect(page.locator('#slider')).toHaveValue('c');
        expect(await payload(page, 'onStart')).toMatchObject({ from: 2, from_value: 'c' });
    });
});
