/**
 * #877 browser suite -- Task 9: the option rows of the readme's settings table, each
 * driven through the two routes the readme documents for it (the JS config object and
 * the `data-*` attribute named in the table's Data-Attr column), plus the input's own
 * `value` attribute for `from` and `to`, and the precedence between the three.
 *
 * The oracle is readme.md, never the plugin: every row's title names the settings row or
 * note it pins, and every assertion is page-observable (label text, the input's value,
 * the container's classes, rendered geometry, the recorded callbacks).
 *
 * These are characterization tests of shipped behaviour, so each row carries a
 * `mutation:` line naming the one-line change to js/ion.rangeSlider.js that reds it.
 * Each was applied live, run, watched red and reverted.
 */
import { test, expect } from '@playwright/test';
import { open, events, LABEL } from '../helpers.mjs';
import { readState } from '../lib/state.mjs';
import { dragHandleTo, focusTrack, pressKeys } from '../lib/interact.mjs';
import { expectShadowSpans, labelText } from '../lib/labels.mjs';

/**
 * The `data-*` spelling of an option, per the readme's Data-Attr column: the option name
 * with its underscores turned into dashes. Values travel as attribute strings; jQuery's
 * own `.data()` reader turns "true"/"25" back into a boolean/number at construction.
 */
function toAttrs(config) {
    const attrs = {};
    for (const key of Object.keys(config)) {
        attrs['data-' + key.replace(/_/g, '-')] = String(config[key]);
    }
    return attrs;
}

const ROWS = [
    {
        title: 'min, max and from build the range the labels and the input report (Settings: min, max, from)',
        mutation: 'setMinMax(): write options.min + 1 into .irs-min -> the min label reads 6',
        config: { min: 5, max: 15, from: 7 },
        check: async (page) => {
            await expect(page.locator('.irs-min')).toHaveText('5');
            await expect(page.locator('.irs-max')).toHaveText('15');
            await expect(page.locator('#slider')).toHaveValue('7');
        }
    },
    {
        title: 'from defaults to min (Settings: from, default `min`)',
        mutation: 'validate(): `o.from = o.min` -> `o.from = o.max` in the "from is not a number" branch',
        config: { min: 5, max: 15 },
        check: async (page) => {
            await expect(page.locator('#slider')).toHaveValue('5');
        }
    },
    {
        title: 'to defaults to max in double type (Settings: to, default `max`)',
        mutation: 'validate(): `o.to = o.max` -> `o.to = o.min` in the "to is not a number" branch',
        config: { type: 'double', min: 5, max: 15, from: 5 },
        check: async (page) => {
            await expect(page.locator('#slider')).toHaveValue('5;15');
        }
    },
    {
        title: 'step snaps a dragged value onto min plus whole steps (Settings: step, note "step")',
        mutation: 'calcWithStep(): `var rounded = Math.round(percent / p_step) * p_step` -> `var rounded = percent` -> the drag lands on 30 instead of 25',
        config: { min: 0, max: 100, step: 25, from: 10 },
        act: (page) => dragHandleTo(page, 'single', 0.3),
        check: async (page) => {
            await expect(page.locator('#slider')).toHaveValue('25');
        }
    },
    {
        title: 'step_from_min keeps every value on min plus whole steps (note "step_from_min")',
        mutation: 'convertToValue(): drop the `o.step_from_min` branch -> the drag lands on 6 instead of 5.5',
        config: { min: 0.5, max: 10.5, step: 1, step_from_min: true, from: 0.5 },
        act: (page) => dragHandleTo(page, 'single', 0.5),
        check: async (page) => {
            await expect(page.locator('#slider')).toHaveValue('5.5');
        }
    },
    {
        title: 'min_interval keeps the smallest gap between the handles (Settings: min_interval)',
        mutation: 'checkMinInterval(): return p_current before the gap test -> the to handle reaches 20',
        config: { type: 'double', min: 0, max: 100, from: 20, to: 60, min_interval: 10 },
        act: (page) => dragHandleTo(page, 'to', 0.2),
        check: async (page) => {
            await expect(page.locator('#slider')).toHaveValue('20;30');
        }
    },
    {
        title: 'max_interval keeps the largest gap between the handles (Settings: max_interval)',
        mutation: 'checkMaxInterval(): return p_current before the gap test -> the to handle reaches 90',
        config: { type: 'double', min: 0, max: 100, from: 20, to: 30, max_interval: 20 },
        act: (page) => dragHandleTo(page, 'to', 0.9),
        check: async (page) => {
            await expect(page.locator('#slider')).toHaveValue('20;40');
        }
    },
    {
        title: 'from_fixed pins the from handle through a drag (Settings: from_fixed)',
        mutation: 'calc(): drop the `!o.from_fixed` guard on the "from" branch -> the handle follows the pointer to 90',
        config: { type: 'double', min: 0, max: 100, from: 20, to: 80, from_fixed: true },
        act: async (page) => {
            await dragHandleTo(page, 'from', 0.9);
            await page.waitForTimeout(400);   // outlast the idle render tick before reading an unchanged value
        },
        check: async (page) => {
            await expect(page.locator('#slider')).toHaveValue('20;80');
        }
    },
    {
        title: 'to_fixed pins the to handle through a drag (Settings: to_fixed)',
        mutation: 'calc(): `case "to": if (this.options.to_fixed)` -> `if (false)` -> the handle follows the pointer down until the crossing guard stops it on the from handle at 20',
        config: { type: 'double', min: 0, max: 100, from: 20, to: 80, to_fixed: true },
        act: async (page) => {
            await dragHandleTo(page, 'to', 0.1);
            await page.waitForTimeout(400);   // outlast the idle render tick before reading an unchanged value
        },
        check: async (page) => {
            await expect(page.locator('#slider')).toHaveValue('20;80');
        }
    },
    {
        title: 'from_min and from_max bound the from handle (Settings: from_min, from_max)',
        mutation: 'checkDiapason(): `return this.convertToPercent(num)` becomes `return p_num` -> the handle reaches 90 and 0',
        config: { min: 0, max: 100, from: 50, from_min: 20, from_max: 60 },
        act: async (page) => {
            await dragHandleTo(page, 'single', 0.9);
            await expect(page.locator('#slider')).toHaveValue('60');
            await dragHandleTo(page, 'single', 0);
        },
        check: async (page) => {
            await expect(page.locator('#slider')).toHaveValue('20');
        }
    },
    {
        title: 'to_min and to_max bound the to handle (Settings: to_min, to_max)',
        mutation: 'checkDiapason(): `return this.convertToPercent(num)` becomes `return p_num` -> the to handle reaches 100 and 10',
        config: { type: 'double', min: 0, max: 100, from: 10, to: 50, to_min: 30, to_max: 70 },
        act: async (page) => {
            await dragHandleTo(page, 'to', 1);
            await expect(page.locator('#slider')).toHaveValue('10;70');
            await dragHandleTo(page, 'to', 0);
        },
        check: async (page) => {
            await expect(page.locator('#slider')).toHaveValue('10;30');
        }
    },
    {
        title: 'from_shadow highlights the from handle limits (Settings: from_shadow)',
        mutation: 'drawShadow(): drop the `+ (this.coords.p_handle / 2)` offset -> the shadow starts half a handle left of 20',
        config: { type: 'double', min: 0, max: 100, from: 50, to: 80, from_min: 20, from_max: 60, from_shadow: true },
        check: (page) => expectShadowSpans(page, 'from', 0.2, 0.6)
    },
    {
        title: 'to_shadow highlights the to handle limits (Settings: to_shadow)',
        mutation: 'drawShadow(): drop the `+ (this.coords.p_handle / 2)` offset -> the shadow starts half a handle left of 30',
        config: { type: 'double', min: 0, max: 100, from: 10, to: 50, to_min: 30, to_max: 70, to_shadow: true },
        check: (page) => expectShadowSpans(page, 'to', 0.3, 0.7)
    },
    {
        title: 'keyboard off leaves the arrow keys inert (Settings: keyboard)',
        mutation: 'bindEvents(): `if (this.options.keyboard)` -> `if (true)` -> the presses move the handle to 32',
        config: { min: 0, max: 100, from: 30, step: 1, keyboard: false },
        act: async (page) => {
            await focusTrack(page);
            await pressKeys(page, ['ArrowRight', 'ArrowRight']);
            // A key press changes the value in calc() and renders on the next frame, so
            // an "unchanged" assertion has to outlast the 300 ms idle render tick -- a
            // web-first assertion would otherwise match the pre-press value and pass.
            await page.waitForTimeout(400);
        },
        check: async (page) => {
            await expect(page.locator('#slider')).toHaveValue('30');
            expect((await events(page)).filter((e) => e.type === 'onChange')).toEqual([]);
        }
    },
    {
        title: 'hide_min_max hides the min and max labels (Settings: hide_min_max)',
        mutation: 'setMinMax(): drop the `hide_min_max` display:none branch -> both labels stay visible',
        config: { min: 0, max: 100, from: 30, hide_min_max: true },
        check: async (page) => {
            const state = await readState(page);
            expect(state.labels.min.visible).toBe(false);
            expect(state.labels.max.visible).toBe(false);
            expect(state.labels.single.visible).toBe(true);
        }
    },
    {
        title: 'hide_from_to hides the value labels (Settings: hide_from_to)',
        mutation: 'append(): drop the `hide_from_to` display:none branch -> the single label stays visible',
        config: { min: 0, max: 100, from: 30, hide_from_to: true },
        check: async (page) => {
            const state = await readState(page);
            expect(state.labels.single.visible).toBe(false);
            expect(state.labels.min.visible).toBe(true);
        }
    },
    {
        title: 'input_values_separator joins the two values in the input (Settings: input_values_separator)',
        mutation: 'writeToInput(): `this.options.input_values_separator` -> ";" -> the input reads "10;100"',
        config: { type: 'double', min: 10, max: 100, from: 10, to: 100, input_values_separator: '-' },
        check: async (page) => {
            await expect(page.locator('#slider')).toHaveValue('10-100');
        }
    },
    {
        title: 'disable masks the slider and disables the input (Settings: disable)',
        mutation: 'append(): drop `this.appendDisableMask()` from the disable branch -> no mask is rendered',
        config: { min: 0, max: 100, from: 30, disable: true },
        act: async (page) => {
            await dragHandleTo(page, 'single', 0.9);
            await page.waitForTimeout(400);   // outlast the idle render tick before reading an unchanged value
        },
        check: async (page) => {
            const state = await readState(page);
            expect(state.mask).toBe(true);
            expect(state.input.disabled).toBe(true);
            expect(state.input.value).toBe('30');
        }
    },
    {
        title: 'block stops the drag but keeps the input enabled (Settings: block)',
        mutation: 'append(): drop `this.appendDisableMask()` from the block branch -> the drag reaches the handle and the value becomes 90',
        config: { min: 0, max: 100, from: 30, block: true },
        act: async (page) => {
            await dragHandleTo(page, 'single', 0.9);
            await page.waitForTimeout(400);   // outlast the idle render tick before reading an unchanged value
        },
        check: async (page) => {
            const state = await readState(page);
            expect(state.input.disabled).toBe(false);
            expect(state.input.value).toBe('30');
            // Characterization: the readme's block row promises an enabled input and a
            // slider the user cannot operate, and says nothing about the mask. The mask
            // is how the mouse is kept off the handles, so its presence is recorded here
            // rather than asserted as a documented promise.
            expect(state.mask).toBe(true);
        }
    },
    {
        title: 'extra_classes reach the slider container (Settings: extra_classes)',
        mutation: "append(): drop `+ ' ' + this.options.extra_classes` from container_html -> neither class is on the container",
        config: { min: 0, max: 100, from: 30, extra_classes: 'foo bar' },
        check: async (page) => {
            const state = await readState(page);
            expect(state.container.classes).toContain('foo');
            expect(state.container.classes).toContain('bar');
        }
    },
    {
        title: 'prefix, postfix, min_prefix and max_prefix decorate the labels (Settings: prefix, postfix, min_prefix, max_prefix)',
        mutation: 'decorate(): `decorated += o.min_prefix;` -> `decorated += o.max_prefix;` -> the min label reads "Up to: $0k"',
        config: { min: 0, max: 100, from: 50, prefix: '$', postfix: 'k', min_prefix: 'From: ', max_prefix: 'Up to: ' },
        check: async (page) => {
            await labelText(page, '.irs-single').toBe('$50k');
            await labelText(page, '.irs-min').toBe('From: $0k');
            await labelText(page, '.irs-max').toBe('Up to: $100k');
        }
    },
    {
        title: 'max_postfix marks every label carrying the maximum value (Settings: max_postfix)',
        mutation: 'decorate(): `original === o.max` -> `original === o.min` in the max_postfix branch -> the "+" lands on the min label',
        config: { min: 0, max: 100, from: 100, max_postfix: '+' },
        check: async (page) => {
            await labelText(page, '.irs-single').toBe('100+');
            await labelText(page, '.irs-max').toBe('100+');
            await labelText(page, '.irs-min').toBe('0');
        }
    },
    {
        title: 'decorate_both off with a values_separator decorates the merged pair once (Settings: decorate_both, values_separator)',
        mutation: 'drawLabels(): `if (this.options.decorate_both)` -> `if (true)` -> the merged label reads "$49 to $51"',
        config: { type: 'double', min: 0, max: 100, from: 49, to: 51, prefix: '$', decorate_both: false, values_separator: ' to ' },
        check: async (page) => {
            // Two units apart on a 600 px track, so the from and to labels overlap and
            // the plugin shows the merged one instead.
            const state = await readState(page);
            expect(state.labels.single.visible).toBe(true);
            await labelText(page, '.irs-single').toBe('$49 to 51');
        }
    }
];

// readme Settings, skin: "Skin (flat, big, modern, round, sharp, square)". One row per
// skin so a failure names the skin that stopped reaching the container class.
for (const skin of ['flat', 'big', 'modern', 'round', 'sharp', 'square']) {
    ROWS.push({
        title: `skin ${skin} names the container class (Settings: skin)`,
        mutation: "append(): `'irs--' + this.options.skin` -> `'irs--' + 'flat'` -> every skin but flat loses its container class",
        config: { skin, min: 0, max: 100, from: 30 },
        check: async (page) => {
            const state = await readState(page);
            expect(state.container.classes).toContain(`irs--${skin}`);
            expect(state.handles.single.box.width).toBeGreaterThan(0);
        }
    });
}

test.describe(`option routes (${LABEL})`, () => {
    for (const row of ROWS) {
        // The JS config object -- the route every readme example uses.
        test(`${row.title} [JS config]`, async ({ page }) => {
            await open(page, row.config);
            if (row.act) await row.act(page);
            await row.check(page);
        });

        // The same row through the Data-Attr column of the settings table. The JS config
        // is empty here, so a data attribute that never reaches options leaves the
        // default in place and the row's own assertion fails.
        test(`${row.title} [data-* attributes]`, async ({ page }) => {
            await open(page, {}, { attrs: JSON.stringify(toAttrs(row.config)) });
            if (row.act) await row.act(page);
            await row.check(page);
        });
    }

    // readme Settings, input_values_separator: `<input value="25;42">`. The attribute is
    // the third route into from/to, and it is read with the separator in force.
    // Mutation: constructor, `config.from = val[0] && +val[0]` -> `config.from = null`
    // -> the slider starts at min (5) instead of 7.
    test('the input value attribute sets from in single type (Settings: from, note on input value)', async ({ page }) => {
        await open(page, { min: 5, max: 15 }, { attrs: JSON.stringify({ value: '7' }) });
        await expect(page.locator('#slider')).toHaveValue('7');
    });

    // Mutation: constructor, `config.to = val[1] && +val[1];` -> `config.to = null;` -> the
    // to handle falls back to max and the input reads "25;100".
    test('the input value attribute sets from and to in double type (Settings: to, `<input value="25;42">`)', async ({ page }) => {
        await open(page, { type: 'double', min: 0, max: 100 }, { attrs: JSON.stringify({ value: '25;42' }) });
        await expect(page.locator('#slider')).toHaveValue('25;42');
    });

    // Mutation: constructor, the split separator `config_from_data.input_values_separator
    // || options.input_values_separator || ";"` -> ";" -> "25-42" never splits, from
    // becomes NaN and the slider starts at min, so the input reads "0-100".
    test('the input value attribute is split on input_values_separator (Settings: input_values_separator)', async ({ page }) => {
        await open(page, { type: 'double', min: 0, max: 100, input_values_separator: '-' }, { attrs: JSON.stringify({ value: '25-42' }) });
        await expect(page.locator('#slider')).toHaveValue('25-42');
    });

    // readme Settings: every option row lists a Data-Attr, and the plugin merges the data
    // config last, so a data attribute wins over the same option in the JS config, which
    // in turn wins over the input's value attribute.
    // Mutation: constructor, drop `$.extend(config, config_from_data);` -> the JS 20 wins
    // and the input reads "20". (The same mutation reds every [data-* attributes] test.)
    test('a data attribute wins over the JS option and the value attribute (Settings: Data-Attr column)', async ({ page }) => {
        await open(page, { from: 20 }, { attrs: JSON.stringify({ value: '60', 'data-from': 40 }) });
        await expect(page.locator('#slider')).toHaveValue('40');
    });

    // Mutation: constructor, `config.from = val[0] && +val[0];` -> `options.from = val[0] &&
    // +val[0];` -- the attribute writes into the JS options, so its 60 replaces the JS 20.
    test('a JS option wins over the input value attribute (Settings: from)', async ({ page }) => {
        await open(page, { from: 20 }, { attrs: JSON.stringify({ value: '60' }) });
        await expect(page.locator('#slider')).toHaveValue('20');
    });

    // Mutation: constructor, drop the `if (val !== undefined && val !== "")` block -> the
    // slider starts at the default from (min, 10) instead of the attribute's 60.
    test('the input value attribute wins over the defaults (Settings: from, default `min`)', async ({ page }) => {
        await open(page, {}, { attrs: JSON.stringify({ value: '60' }) });
        await expect(page.locator('#slider')).toHaveValue('60');
    });

    // An empty data attribute means "not set" for every option but prettify_separator
    // (#681), so the JS option survives it.
    // Mutation: constructor, drop the `config_from_data[prop] === ""` half of the strip
    // loop -> the empty string reaches from, validate() coerces it to 0 and clamps it to
    // min, and the input reads "10".
    test('an empty data attribute leaves the JS option in place (Settings: Data-Attr column)', async ({ page }) => {
        await open(page, { from: 20 }, { attrs: JSON.stringify({ 'data-from': '' }) });
        await expect(page.locator('#slider')).toHaveValue('20');
    });

    // readme Settings, block: "Block the slider but keep the input enabled." A blocked
    // slider still answers the arrow keys, so the value a form submits can change under a
    // user who was told the slider is blocked.
    test('block stops the keyboard too (Settings: block)', async ({ page }) => {
        test.fail(true, '#890: block leaves the keyboard working, so a blocked slider still changes value');
        await open(page, { min: 0, max: 100, from: 30, step: 1, block: true });
        await focusTrack(page);
        await pressKeys(page, ['ArrowRight', 'ArrowRight']);
        await page.waitForTimeout(400);   // outlast the idle render tick before reading an unchanged value
        await expect(page.locator('#slider')).toHaveValue('30');
    });

    // readme note "step_from_min": "Put the starting `from` and `to` [...] on that scale
    // as well. A value that does not sit on the scale is moved to the nearest point that
    // does." On a 0.5..10.5 scale with step 1 the points are 0.5, 1.5, 2.5 ..., so a
    // starting `from` of 3.2 lands on 3.5 before the first render. 3.2 rather than 3:
    // 3 sits halfway between 2.5 and 3.5, and the test would pin the rounding direction
    // instead of the note.
    // Mutation caught: convertToValue() -> drop the `o.step_from_min` branch -- the
    // default path rounds 3.2 to the step's whole numbers and the slider starts on 3,
    // which the scale does not hold.
    test('a starting from off the step_from_min scale is moved onto it (note "step_from_min")', async ({ page }) => {
        await open(page, { min: 0.5, max: 10.5, step: 1, step_from_min: true, from: 3.2 });
        await expect(page.locator('#slider')).toHaveValue('3.5');
    });

    // readme note "step": "Every value is `min` plus a whole number of steps". On a
    // 0..100 scale with step 25 those are 0, 25, 50, 75, 100, and the nearest to a
    // starting `from` of 10 is 0. The slider instead starts on 10, a value it cannot
    // otherwise hold: the label and the input read 10, onStart carries from 10, and the
    // first arrow press jumps to 25 rather than stepping by 25.
    test('a starting from off the step scale is moved onto it (note "step")', async ({ page }) => {
        test.fail(true, '#900: a starting value off the step scale is kept until the first interaction');
        await open(page, { min: 0, max: 100, step: 25, from: 10 });
        await expect(page.locator('#slider')).toHaveValue('0');
    });
});
