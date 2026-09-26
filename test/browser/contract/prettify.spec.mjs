/**
 * #877 browser suite -- Task 10: the formatting chain, on all three label surfaces.
 *
 * readme Settings: prettify_enabled ("Format long numbers: 10000000 -> 10 000 000"),
 * prettify_separator, prettify, prettify_grid, prettify_min_max, prefix, min_prefix,
 * max_prefix, postfix, max_postfix, decorate_both and values_separator; plus the notes
 * "prettify", "prettify_grid" and "prettify_min_max".
 *
 * The oracle is readme.md through test/browser/lib/format.mjs, never the plugin. Label
 * text is compared byte for byte (expect.poll over textContent) rather than through
 * toHaveText(), which collapses whitespace runs and would hide the extra space the
 * max_postfix case below pins.
 *
 * These are characterization tests of shipped behaviour, so each names in a comment the
 * one-line change to js/ion.rangeSlider.js that reds it. Each was applied live, run,
 * watched red and reverted.
 */
import { test, expect } from '@playwright/test';
import { open, events, LABEL } from '../helpers.mjs';
import { readState } from '../lib/state.mjs';
import { expectedLabel, expectedGridLabel, expectedMerged } from '../lib/format.mjs';
import { labelText } from '../lib/labels.mjs';

/**
 * One number per interesting shape, each carried on the handle while the min and max
 * labels and the grid ticks carry the range ends -- so a single page covers the three
 * surfaces the readme's prettify rows apply to.
 */
const BUILTIN_ROWS = [
    { value: 1000, config: { min: 0, max: 2000, step: 100 } },
    { value: 1000000, config: { min: 0, max: 2000000, step: 100000 } },
    { value: 1234.5, config: { min: 0, max: 2000, step: 0.5 } },
    { value: -1234, config: { min: -2000, max: 0, step: 1 } },
    { value: 0.001, config: { min: 0, max: 1, step: 0.001 } },
    {
        value: 1.2345,
        config: { min: 0, max: 2, step: 0.0001 },
        // With the separator turned off there is nothing to insert, so only the two
        // separator spellings reproduce the defect.
        bug: (separator) => (separator === '' ? null : '#887: the built-in thousands separator is inserted into the fractional part')
    }
];

const SEPARATORS = [' ', ',', ''];

test.describe(`prettify (${LABEL})`, () => {
    for (const row of BUILTIN_ROWS) {
        for (const separator of SEPARATORS) {
            const config = { ...row.config, from: row.value, grid: true, grid_num: 2, prettify_separator: separator };
            const bug = row.bug ? row.bug(separator) : null;

            // readme Settings, prettify_separator: "A space by default (10 000 000); set
            // it to "," for 10,000,000, or to an empty string to turn the separator off".
            // Mutations caught: prettify() -> `"$1" + this.options.prettify_separator`
            // becomes `"$1" + "|"`, so the separator option stops being read; and
            // `var n = num.toString()` becomes `num.toFixed(2)`, which also reds the row
            // that carries no grouping at all (0.001).
            test(`the built-in formatting of ${row.value} with separator "${separator}" on the value, min, max and grid labels (Settings: prettify_enabled, prettify_separator)`, async ({ page }) => {
                if (bug) test.fail(true, bug);
                await open(page, config);
                await labelText(page, '.irs-single').toBe(expectedLabel(row.value, config, 'handle'));
                await labelText(page, '.irs-min').toBe(expectedLabel(config.min, config, 'min'));
                await labelText(page, '.irs-max').toBe(expectedLabel(config.max, config, 'max'));
                await labelText(page, '.js-grid-text-0').toBe(expectedGridLabel(config.min, config));
                await labelText(page, '.js-grid-text-2').toBe(expectedGridLabel(config.max, config));
            });
        }
    }

    // readme Settings, prettify_enabled: the row that turns the formatting off.
    // Mutation caught: _prettify(), _prettifySurface() and _prettifyGrid() -> `return num;`
    // in the disabled branch becomes `return num + 1;` -- every label is off by one.
    test('prettify_enabled off leaves every label unformatted (Settings: prettify_enabled)', async ({ page }) => {
        const config = { min: 0, max: 20000, from: 10000, prettify_enabled: false, grid: true, grid_num: 2 };
        await open(page, config);
        await labelText(page, '.irs-single').toBe(expectedLabel(10000, config, 'handle'));
        await labelText(page, '.irs-single').toBe('10000');
        await labelText(page, '.irs-max').toBe('20000');
        await labelText(page, '.js-grid-text-2').toBe('20000');
    });

    // readme "Callback data" shows every *_pretty field as a string ("from_pretty":
    // "10 000"), which is what pairs it with its raw sibling.
    test('the *_pretty payload fields stay strings with prettify_enabled off (Callback data: from_pretty, min_pretty, max_pretty)', async ({ page }) => {
        test.fail(true, '#889: with prettify_enabled off the *_pretty callback fields are numbers instead of strings');
        await open(page, { min: 0, max: 100, from: 30, prettify_enabled: false });
        const started = (await events(page)).find((entry) => entry.type === 'onStart');
        expect(typeof started.from_pretty).toBe('string');
        expect(typeof started.min_pretty).toBe('string');
        expect(typeof started.max_pretty).toBe('string');
    });

    // readme note "prettify": "A function that receives a number and returns the string to
    // show." With neither per-surface option set it formats all three surfaces.
    // Mutation caught: _prettify() -> drop the `this.options.prettify &&
    // typeof ... === "function"` branch -- the value, min and max labels fall back
    // to the built-in formatting and read "50", "0", "100" (the grid has its own
    // chain since #906, _prettifyGrid(), and keeps "0x", "50x", "100x").
    test('a custom prettify formats the value, min, max and grid labels (note "prettify")', async ({ page }) => {
        const config = { min: 0, max: 100, from: 50, grid: true, grid_num: 2, __prettify: (n) => n + 'x' };
        await open(page, "{min: 0, max: 100, from: 50, grid: true, grid_num: 2, prettify: function (n) { return n + 'x'; }}");
        await labelText(page, '.irs-single').toBe(expectedLabel(50, config, 'handle'));
        await labelText(page, '.irs-min').toBe(expectedLabel(0, config, 'min'));
        await labelText(page, '.irs-max').toBe(expectedLabel(100, config, 'max'));
        await labelText(page, '.js-grid-text-0').toBe(expectedGridLabel(0, config));
        await labelText(page, '.js-grid-text-1').toBe(expectedGridLabel(50, config));
        await labelText(page, '.js-grid-text-2').toBe(expectedGridLabel(100, config));
    });

    // readme note "prettify_grid": "Formats the grid labels only."
    // Mutation caught: _prettifyGrid() -> `text = this._tryGridFormatter("prettify_grid", num);`
    // becomes `text = undefined;` -- the grid falls back to prettify and its ticks
    // read "P0", "P50", "P100".
    test('prettify_grid formats the grid labels only (note "prettify_grid")', async ({ page }) => {
        const config = { min: 0, max: 100, from: 50, grid: true, grid_num: 2, __prettify: (n) => 'P' + n, __prettify_grid: (n) => 'G' + n };
        await open(page, "{min: 0, max: 100, from: 50, grid: true, grid_num: 2, prettify: function (n) { return 'P' + n; }, prettify_grid: function (n) { return 'G' + n; }}");
        await labelText(page, '.js-grid-text-0').toBe(expectedGridLabel(0, config));
        await labelText(page, '.js-grid-text-2').toBe(expectedGridLabel(100, config));
        await labelText(page, '.irs-single').toBe(expectedLabel(50, config, 'handle'));
        await labelText(page, '.irs-min').toBe(expectedLabel(0, config, 'min'));
        await labelText(page, '.irs-max').toBe(expectedLabel(100, config, 'max'));
    });

    // readme note "prettify_min_max": "Formats the min and max labels only."
    // Mutation caught: _prettifyMinMax() -> `return this._prettifySurface("prettify_min_max",
    // num);` becomes `return this._prettify(num);` -- the min and max labels fall back to
    // prettify and read "P0" and "P100".
    test('prettify_min_max formats the min and max labels only (note "prettify_min_max")', async ({ page }) => {
        const config = { min: 0, max: 100, from: 50, grid: true, grid_num: 2, __prettify: (n) => 'P' + n, __prettify_min_max: (n) => 'M' + n };
        await open(page, "{min: 0, max: 100, from: 50, grid: true, grid_num: 2, prettify: function (n) { return 'P' + n; }, prettify_min_max: function (n) { return 'M' + n; }}");
        await labelText(page, '.irs-min').toBe(expectedLabel(0, config, 'min'));
        await labelText(page, '.irs-max').toBe(expectedLabel(100, config, 'max'));
        await labelText(page, '.irs-single').toBe(expectedLabel(50, config, 'handle'));
        await labelText(page, '.js-grid-text-0').toBe(expectedGridLabel(0, config));
        await labelText(page, '.js-grid-text-2').toBe(expectedGridLabel(100, config));
    });

    // readme note "prettify": "A string is read as the name of a global function
    // (window[name])" -- the route markup-only configuration has to use.
    // Mutation caught: validate(), the prettify name loop -> `o[prettify_option_name] =
    // window[o[prettify_option_name]]` becomes a no-op -- the option stays the string, the
    // surfaces fall back to the built-in formatting and every label loses its "#".
    test('data-prettify names a global function and formats all three surfaces (note "prettify", Settings: Data-Attr)', async ({ page }) => {
        await page.addInitScript(() => {
            window.irsHashFormat = function (n) { return '#' + n; };
        });
        const config = { min: 0, max: 100, from: 50, grid: true, grid_num: 2, __prettify: (n) => '#' + n };
        await open(page, { min: 0, max: 100, from: 50, grid: true, grid_num: 2 }, { attrs: JSON.stringify({ 'data-prettify': 'irsHashFormat' }) });
        await labelText(page, '.irs-single').toBe(expectedLabel(50, config, 'handle'));
        await labelText(page, '.irs-min').toBe(expectedLabel(0, config, 'min'));
        await labelText(page, '.irs-max').toBe(expectedLabel(100, config, 'max'));
        await labelText(page, '.js-grid-text-1').toBe(expectedGridLabel(50, config));
    });

    // readme note "prettify": "A function that receives a number and returns the string to
    // show", and "As with every option, only feed it configuration you control." The
    // returned string is written with .html(), so markup in it becomes real elements --
    // characterization of that shipped behaviour, and the reason the readme's warning is
    // there. Nothing here asserts the behaviour is desirable; it pins what ships.
    // Mutation caught: drawLabels(), the single-label write -> `this.$cache.single.html(
    // text_single)` becomes `.text(text_single)` -- no <b> element exists and the label
    // reads "<b>50</b>" as plain text.
    test('a prettify that returns markup has it rendered as markup (note "prettify")', async ({ page }) => {
        await open(page, "{min: 0, max: 100, from: 50, prettify: function (n) { return '<b>' + n + '</b>'; }}");
        await expect(page.locator('.irs-single b')).toHaveCount(1);
        await expect(page.locator('.irs-single b')).toHaveText('50');
    });

    // readme Settings: prefix ("$100"), min_prefix ("From: 0 - 100"), max_prefix
    // ("0 - Up to: 100"), postfix ("100k"). The min and max prefixes sit outside prefix
    // and reach only the label carrying that end of the range.
    // Mutation caught: decorate() -> `decorated += o.min_prefix;` becomes
    // `decorated += o.max_prefix;` -- the min label reads "Up to: $0k".
    test('prefix, postfix, min_prefix and max_prefix decorate the labels in the documented order (Settings: prefix, postfix, min_prefix, max_prefix)', async ({ page }) => {
        const config = { min: 0, max: 100, from: 50, prefix: '$', postfix: 'k', min_prefix: 'From: ', max_prefix: 'Up to: ' };
        await open(page, config);
        await labelText(page, '.irs-single').toBe(expectedLabel(50, config, 'handle'));
        await labelText(page, '.irs-single').toBe('$50k');
        await labelText(page, '.irs-min').toBe(expectedLabel(0, config, 'min'));
        await labelText(page, '.irs-min').toBe('From: $0k');
        await labelText(page, '.irs-max').toBe(expectedLabel(100, config, 'max'));
        await labelText(page, '.irs-max').toBe('Up to: $100k');
    });

    // readme Settings, max_postfix: "Postfix for the maximum value only: 0 - 100+". The
    // handle carrying the max value is decorated the same way the max label is.
    // Mutation caught: decorate() -> `original === o.max` becomes `original === o.min` in
    // the max_postfix branch -- the "+" lands on the min label instead.
    test('max_postfix reaches every label carrying the maximum value (Settings: max_postfix)', async ({ page }) => {
        const config = { min: 0, max: 100, from: 100, max_postfix: '+' };
        await open(page, config);
        await labelText(page, '.irs-single').toBe(expectedLabel(100, config, 'handle'));
        await labelText(page, '.irs-single').toBe('100+');
        await labelText(page, '.irs-max').toBe('100+');
        await labelText(page, '.irs-min').toBe('0');
    });

    // The readme shows max_postfix ("0 - 100+") and postfix ("100k") separately and never
    // combines them, so the join between the two is not a readme promise. The rule comes
    // from #884: one space separates them, unless the postfix already opens with
    // whitespace. This was the half of the pair the plugin already rendered that way, and
    // #884's fix left it untouched, so the test stayed green through that fix.
    // Mutation caught: decorate() -> drop the `decorated += " ";` line from the numeric
    // (`original === o.max`) branch -- the max label reads "100+k".
    test('a max_postfix followed by a plain postfix keeps one space between them (Settings: max_postfix, postfix)', async ({ page }) => {
        const config = { min: 0, max: 100, from: 100, max_postfix: '+', postfix: 'k' };
        await open(page, config);
        await labelText(page, '.irs-max').toBe(expectedLabel(100, config, 'max'));
        await labelText(page, '.irs-max').toBe('100+ k');
    });

    // The other half of #884's rule: a postfix that already opens with whitespace brings
    // its own separator, so "100+" followed by " years" reads "100+ years", not the
    // doubled "100+  years" the plugin rendered before the fix.
    // Mutation caught: decorate() -> drop the `!/^\s/.test(o.postfix)` guard back to an
    // unconditional `decorated += " ";` -- the max label reads "100+  years" again.
    test('a max_postfix followed by a space-prefixed postfix reads as written (Settings: max_postfix, postfix)', async ({ page }) => {
        const config = { min: 0, max: 100, from: 50, max_postfix: '+', postfix: ' years' };
        await open(page, config);
        await labelText(page, '.irs-max').toBe(expectedLabel(100, config, 'max'));
        await labelText(page, '.irs-max').toBe('100+ years');
    });

    // readme Settings, decorate_both: "When the from and to value labels merge into one,
    // decorate both values ($10k - $100k) instead of only the merged pair ($10 - 100k)";
    // values_separator: "Separator between the from and to values in the merged label".
    const MERGED_ROWS = [
        {
            title: 'decorate_both on decorates both values of the merged label (Settings: decorate_both)',
            mutation: 'drawLabels(): take the `decorate_both` false branch unconditionally -> the merged label reads "$49 — 51"',
            config: { type: 'double', min: 0, max: 100, from: 49, to: 51, prefix: '$' },
            expected: '$49 — $51'
        },
        {
            title: 'decorate_both off decorates the merged pair once (Settings: decorate_both)',
            mutation: 'drawLabels(): take the `decorate_both` true branch unconditionally -> the merged label reads "$49 — $51"',
            config: { type: 'double', min: 0, max: 100, from: 49, to: 51, prefix: '$', decorate_both: false },
            expected: '$49 — 51'
        },
        {
            title: 'values_separator joins the two values of the merged label (Settings: values_separator)',
            mutation: 'drawLabels(): `this.options.values_separator` -> " — " -> the merged label keeps the default separator',
            config: { type: 'double', min: 0, max: 100, from: 49, to: 51, prefix: '$', values_separator: ' to ' },
            expected: '$49 to $51'
        },
        // #884: with `to` sitting on max, the merged pair (decorate_both: false) is
        // decorated once against `to`, so the same one-space rule applies to the merged
        // label too.
        {
            title: 'a max_postfix and a whitespace-leading postfix decorate the merged pair once, from the to value (Settings: max_postfix, postfix, decorate_both) (#884)',
            mutation: 'decorate() reverting the numeric-branch guard to an unconditional `decorated += " ";` -> the merged label reads "98 — 100+  years" (extra space); or drawLabels() passing the from value (98) instead of the to value (100) as `original` to the merged decorate() call -> the merged label reads "98 — 100 years" (the "+" disappears)',
            config: { type: 'double', min: 0, max: 100, from: 98, to: 100, max_postfix: '+', postfix: ' years', decorate_both: false },
            expected: '98 — 100+ years'
        },
        // #884, decorate_both left at its default: from and to are decorated separately,
        // so only the `to` call (sitting on max) carries max_postfix, and the same rule
        // applies to it.
        {
            title: 'a max_postfix and a whitespace-leading postfix decorate the to value of the merged label, with decorate_both at its default (Settings: max_postfix, postfix) (#884)',
            mutation: 'decorate() reverting the numeric-branch guard on the `to` call to an unconditional `decorated += " ";` -> the merged label reads "98 years — 100+  years" (extra space)',
            config: { type: 'double', min: 0, max: 100, from: 98, to: 100, max_postfix: '+', postfix: ' years' },
            expected: '98 years — 100+ years'
        }
    ];

    for (const row of MERGED_ROWS) {
        test(row.title, async ({ page }) => {
            await open(page, row.config);
            // The two handles sit two units apart on a 600 px track, so the from and to
            // labels overlap and the plugin shows the merged one instead.
            const state = await readState(page, 1, row.config);
            expect(state.labels.single.visible).toBe(true);
            await labelText(page, '.irs-single').toBe(expectedMerged(row.config.from, row.config.to, row.config));
            await labelText(page, '.irs-single').toBe(row.expected);
        });
    }
});
