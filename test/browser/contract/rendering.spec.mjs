/**
 * #877 browser suite -- Task 11: the DOM a rendered slider puts on the page, and the way
 * its labels appear, hide and merge.
 *
 * The oracle is readme.md where it speaks: the "Value grid" feature line and the settings
 * rows for type, force_edges, values_separator and decorate_both. The markup itself the
 * readme does not describe, so the structural rows are characterization of shipped DOM --
 * which is a contract all the same, because every .irs-* class is public API that users
 * style and script against.
 *
 * Assertions stay on page-observable surfaces: rendered text, computed visibility,
 * bounding boxes, the input's own classes and value, the recorded callbacks.
 *
 * These are characterization tests of shipped behaviour, so each names in its title or a
 * comment the one-line change to js/ion.rangeSlider.js that reds it. Each was applied
 * live, run, watched red and reverted.
 */
import { test, expect } from '@playwright/test';
import { open, LABEL } from '../helpers.mjs';
import { readState } from '../lib/state.mjs';
import { expectedMerged } from '../lib/format.mjs';
import { dragHandleTo } from '../lib/interact.mjs';
import { labelText } from '../lib/labels.mjs';

/** The skin-classed outer container. A plain `.irs` matches two spans per instance: the
 * container and the inner span base_html nests inside it. Only the container is a direct
 * child of the wrap. */
const CONTAINER = '#wrap > .irs';

test.describe(`rendering (${LABEL})`, () => {
    // The container class, the focusable track, the three label spans, the bar, one
    // handle carrying the three <i> every skin draws with, and an input that stays in
    // the form flow while the plugin hides it.
    // Mutation caught: single_html -> drop one <i> from the handle template, and the
    // handle's child count reads 2.
    test('single type renders the documented markup (characterization of the shipped DOM)', async ({ page }) => {
        await open(page, { min: 0, max: 100, from: 30 });

        const state = await readState(page);
        expect(state.container.classes).toContain('irs');
        expect(state.container.classes).toContain('irs--flat');
        expect(state.container.classes).toContain('js-irs-0');

        await expect(page.locator(`${CONTAINER} .irs-line`)).toHaveAttribute('tabindex', '0');
        await expect(page.locator(`${CONTAINER} .irs-min`)).toHaveCount(1);
        await expect(page.locator(`${CONTAINER} .irs-max`)).toHaveCount(1);
        await expect(page.locator(`${CONTAINER} .irs-single`)).toHaveCount(1);
        await expect(page.locator(`${CONTAINER} .irs-bar`)).toHaveCount(1);
        await expect(page.locator(`${CONTAINER} .irs-handle.single`)).toHaveCount(1);
        await expect(page.locator(`${CONTAINER} .irs-handle.single > i`)).toHaveCount(3);
        await expect(page.locator(`${CONTAINER} .irs-handle.from`)).toHaveCount(0);

        // The input keeps its place in the form so its value is still submitted; the
        // plugin only moves it out of sight with the irs-hidden-input class.
        expect(state.input.classes).toContain('irs-hidden-input');
        await expect(page.locator('#wrap > #slider')).toHaveCount(1);
    });

    // Mutation caught: double_html -> drop one <i> from the `to` handle template, and its
    // child count reads 2.
    test('double type renders both handles and both value labels (Settings: type)', async ({ page }) => {
        await open(page, { type: 'double', min: 0, max: 100, from: 20, to: 80 });

        await expect(page.locator(`${CONTAINER} .irs-from`)).toHaveCount(1);
        await expect(page.locator(`${CONTAINER} .irs-to`)).toHaveCount(1);
        await expect(page.locator(`${CONTAINER} .irs-single`)).toHaveCount(1);
        await expect(page.locator(`${CONTAINER} .irs-handle.from > i`)).toHaveCount(3);
        await expect(page.locator(`${CONTAINER} .irs-handle.to > i`)).toHaveCount(3);
        await expect(page.locator(`${CONTAINER} .irs-handle.single`)).toHaveCount(0);
    });

    // readme, feature list: "Value grid (tick marks with labels)". The empty .irs-grid
    // span is part of base_html and is on the page either way, so what `grid` decides is
    // whether it holds tick marks and whether the container is marked as carrying a grid.
    // Mutation caught: appendGrid() -> `this.$cache.cont.addClass("irs-with-grid")`
    // becomes `addClass("irs-with-grids")`, and the container loses the class the
    // stylesheet reserves room for the grid with while the ticks are still built.
    test('grid true fills the grid span and marks the container (Settings: grid)', async ({ page }) => {
        await open(page, { min: 0, max: 100, from: 30, grid: true });
        const state = await readState(page);
        expect(state.container.classes).toContain('irs-with-grid');
        expect(state.grid.pols).toBeGreaterThan(0);

        await open(page, { min: 0, max: 100, from: 30 });
        const plain = await readState(page);
        expect(plain.container.classes).not.toContain('irs-with-grid');
        expect(plain.grid.pols).toBe(0);
        await expect(page.locator(`${CONTAINER} > .irs-grid`)).toHaveCount(1);
    });

    // The container class js-irs-N is the instance's own name, and the event namespace
    // .irs_N is built from the same counter, so two sliders on one page must not share it.
    // Mutation caught: $.fn.ionRangeSlider -> `plugin_count++` becomes `plugin_count`, and
    // both containers read js-irs-0.
    test('js-irs-N increments for each slider on the page', async ({ page }) => {
        await open(page, { min: 0, max: 100, from: 30 }, { count: '2', config2: JSON.stringify({ min: 0, max: 10, from: 7 }) });

        const first = await readState(page, 1);
        const second = await readState(page, 2);
        const numberOf = (classes) => {
            const name = classes.find((c) => c.indexOf('js-irs-') === 0);
            return Number(name.slice('js-irs-'.length));
        };
        expect(numberOf(second.container.classes)).toBe(numberOf(first.container.classes) + 1);
    });

    // readme Settings, values_separator: "Separator between the from and to values in the
    // merged label", and decorate_both: "When the from and to value labels merge into
    // one". Far apart the two labels stand on their own; dragged together they are
    // replaced by the merged one.
    // The merged label is read with labelText() (exact textContent) rather than
    // toHaveText(), which would collapse the spaces of the separator.
    // Mutation caught: drawLabels() -> the overlap test `if (this.labels.p_from_left +
    // this.labels.p_from_fake >= this.labels.p_to_left)` becomes `<`, and the two states
    // swap: the far-apart pair shows the merged label, and the close pair shows the from
    // and to labels (the else branch) instead of the merged one.
    test('the from and to labels merge into one when the handles come together (Settings: values_separator, decorate_both)', async ({ page }) => {
        const config = { type: 'double', min: 0, max: 100, from: 10, to: 90 };
        await open(page, config);

        const apart = await readState(page);
        expect(apart.labels.from.visible).toBe(true);
        expect(apart.labels.to.visible).toBe(true);
        expect(apart.labels.single.visible).toBe(false);

        await dragHandleTo(page, 'to', 0.12);
        await expect(page.locator('#slider')).toHaveValue('10;12');

        await expect.poll(async () => (await readState(page)).labels.single.visible).toBe(true);
        await labelText(page, `${CONTAINER} .irs-single`).toBe(expectedMerged(10, 12, config));
        const merged = await readState(page);
        expect(merged.labels.from.visible).toBe(false);
        expect(merged.labels.to.visible).toBe(false);
    });

    // Characterization: the readme describes the merged label for handles that "merge into
    // one" but says nothing about two handles sitting on the same value. The plugin has a
    // branch of its own for it -- with no interaction yet, the from label is shown alone
    // and the merged label, which is built and reads "50 <separator> 50", stays hidden.
    // Mutation caught: drawLabels() -> in the `this.result.from === this.result.to`
    // branch, drop the `else if (!this.target)` arm that reveals the from label, and no
    // value label is visible at all.
    test('coincident handles show the from label alone (characterization)', async ({ page }) => {
        await open(page, { type: 'double', min: 0, max: 100, from: 50, to: 50 });

        const state = await readState(page);
        expect(state.labels.from.visible).toBe(true);
        expect(state.labels.from.text).toBe('50');
        expect(state.labels.to.visible).toBe(false);
        expect(state.labels.single.visible).toBe(false);
    });

    // Characterization: the readme has no row for it, but the min and max labels give way
    // to a value label that would sit on top of them, which is why hide_min_max exists as
    // a separate option for hiding them outright.
    // Mutation caught: drawLabels() -> the double-type test `if (min < this.labels.p_min
    // + 1)` becomes `if (false)`, and the min label stays visible under the from label.
    test('the min label hides while the from label covers it (characterization)', async ({ page }) => {
        await open(page, { type: 'double', min: 0, max: 100, from: 50, to: 60 });

        await dragHandleTo(page, 'from', 0);
        await expect(page.locator('#slider')).toHaveValue('0;60');
        await expect.poll(async () => (await readState(page)).labels.min.visible).toBe(false);

        await dragHandleTo(page, 'from', 0.5);
        await expect(page.locator('#slider')).toHaveValue('50;60');
        await expect.poll(async () => (await readState(page)).labels.min.visible).toBe(true);
    });

    // Mutation caught: drawLabels() -> the double-type test `if (max > 100 -
    // this.labels.p_max - 1)` becomes `if (false)`, and the max label stays visible under
    // the to label.
    test('the max label hides while the to label covers it (characterization)', async ({ page }) => {
        await open(page, { type: 'double', min: 0, max: 100, from: 10, to: 50 });

        await dragHandleTo(page, 'to', 1);
        await expect(page.locator('#slider')).toHaveValue('10;100');
        await expect.poll(async () => (await readState(page)).labels.max.visible).toBe(false);

        await dragHandleTo(page, 'to', 0.5);
        await expect(page.locator('#slider')).toHaveValue('10;50');
        await expect.poll(async () => (await readState(page)).labels.max.visible).toBe(true);
    });

    // readme Settings, force_edges: "Keep the value labels (shown above each handle), and
    // the first and last grid labels, inside the container instead of letting them
    // overhang its edges". The prefix widens the label past the handle so there is an
    // overhang to keep: with the plain "0" and "100" of a default slider the label is
    // narrow enough to fit on its own at the left edge, and the option would look inert.
    //
    // The default half of the pair is what makes this a test of the option rather than of
    // the layout: turning force_edges off has to bring the overhang back.
    // Mutations caught, both on checkEdges()'s first line: `if (!this.options.force_edges)`
    // becomes `if (true)`, so the clamp never runs and the two force_edges true rows see
    // the overhang; it becomes `if (false)`, so the clamp always runs and the two
    // force_edges false rows lose theirs.
    for (const force_edges of [false, true]) {
        test(`force_edges ${force_edges} at the left edge (Settings: force_edges)`, async ({ page }) => {
            await open(page, { min: 0, max: 100, from: 0, prefix: 'Value: ', force_edges });

            const box = await page.evaluate(() => {
                const cont = document.querySelector('#wrap > .irs').getBoundingClientRect();
                const label = document.querySelector('#wrap .irs-single').getBoundingClientRect();
                return { contLeft: cont.left, labelLeft: label.left };
            });

            if (force_edges) {
                expect(box.labelLeft).toBeGreaterThanOrEqual(box.contLeft - 0.5);
            } else {
                expect(box.contLeft - box.labelLeft).toBeGreaterThan(5);
            }
        });

        test(`force_edges ${force_edges} at the right edge (Settings: force_edges)`, async ({ page }) => {
            await open(page, { min: 0, max: 100, from: 100, prefix: 'Value: ', force_edges });

            const box = await page.evaluate(() => {
                const cont = document.querySelector('#wrap > .irs').getBoundingClientRect();
                const label = document.querySelector('#wrap .irs-single').getBoundingClientRect();
                return { contRight: cont.right, labelRight: label.right };
            });

            if (force_edges) {
                expect(box.labelRight).toBeLessThanOrEqual(box.contRight + 0.5);
            } else {
                expect(box.labelRight - box.contRight).toBeGreaterThan(5);
            }
        });
    }

    // Characterization: .type_last is the class the stylesheet raises a handle's z-index
    // with, so the handle the user touched last stays on top of the other one. It starts
    // on the to handle (setTopHandler) and follows each drag afterwards.
    // Mutation caught: changeLevel() -> in `case "from"`, drop
    // `this.$cache.s_from.addClass("type_last")`, and the from handle never takes the top
    // place after being dragged.
    test('type_last follows the handle that was dragged last (characterization)', async ({ page }) => {
        await open(page, { type: 'double', min: 0, max: 100, from: 20, to: 80 });

        await dragHandleTo(page, 'from', 0.3);
        await expect(page.locator('#slider')).toHaveValue('30;80');
        await expect(page.locator(`${CONTAINER} .irs-handle.from`)).toHaveClass(/type_last/);
        await expect(page.locator(`${CONTAINER} .irs-handle.to`)).not.toHaveClass(/type_last/);

        await dragHandleTo(page, 'to', 0.7);
        await expect(page.locator('#slider')).toHaveValue('30;70');
        await expect(page.locator(`${CONTAINER} .irs-handle.to`)).toHaveClass(/type_last/);
        await expect(page.locator(`${CONTAINER} .irs-handle.from`)).not.toHaveClass(/type_last/);
    });

    // Characterization: .state_hover is how the skins keep the :hover look while a handle
    // is being dragged, including once the pointer has left the handle itself. It is
    // added while the button is down and removed when it comes back up.
    // Mutation caught: changeLevel() -> in `case "single"`, drop
    // `this.$cache.s_single.addClass("state_hover")`, and the class never appears.
    test('state_hover marks the handle while it is held (characterization)', async ({ page }) => {
        await open(page, { min: 0, max: 100, from: 30 });
        const handle = page.locator(`${CONTAINER} .irs-handle.single`);
        const box = await handle.boundingBox();

        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await expect(handle).toHaveClass(/state_hover/);

        await page.mouse.up();
        await expect(handle).not.toHaveClass(/state_hover/);
    });
});
