import { test, expect } from '@playwright/test';
import { open, events, eventTypes, input, drag, LABEL } from './helpers.mjs';

test.describe(`smoke (${LABEL})`, () => {
  test('init renders, writes the input and fires onStart once', async ({ page }) => {
    await open(page, { min: 0, max: 100, from: 30 });
    await expect(page.locator('.irs--flat')).toHaveCount(1);
    await expect(input(page)).toHaveValue('30');
    const ev = await events(page);
    expect(ev.map((e) => e.type)).toEqual(['onStart']);
    expect(ev[0]).toMatchObject({ from: 30, min: 0, max: 100 });
    expect(await page.evaluate(() => window.__irs.jqueryVersion)).toBeTruthy();
  });

  test('dragging the single handle changes the value, onChange then onFinish', async ({ page }) => {
    await open(page, { min: 0, max: 100, from: 0 });
    await drag(page, '.irs-handle.single', 0.5);
    await expect.poll(async () => Number(await input(page).inputValue())).toBeGreaterThanOrEqual(45);
    expect(Number(await input(page).inputValue())).toBeLessThanOrEqual(55);
    const types = await eventTypes(page);
    expect(types).toContain('onChange');
    expect(types.at(-1)).toBe('onFinish');
  });

  test('clicking the line jumps to the clicked value', async ({ page }) => {
    await open(page, { min: 0, max: 100, from: 0 });
    const l = await page.locator('.irs-line').boundingBox();
    await page.mouse.click(l.x + l.width * 0.75, l.y + l.height / 2);
    await expect.poll(async () => Number(await input(page).inputValue())).toBeGreaterThanOrEqual(70);
    expect(Number(await input(page).inputValue())).toBeLessThanOrEqual(80);
    await expect.poll(() => eventTypes(page)).toContain('onFinish');
  });

  test('keyboard moves by one step and fires onFinish', async ({ page }) => {
    await open(page, { min: 0, max: 100, from: 50, step: 5 });
    await page.locator('.irs-line').focus();
    await expect(page.locator('.irs-line')).toBeFocused();
    const before = (await events(page)).length;   // focus alone already fires onChange+onFinish (#742), so count from here
    await page.keyboard.press('ArrowRight');
    await expect(input(page)).toHaveValue('55');
    await page.keyboard.press('ArrowLeft');
    await expect(input(page)).toHaveValue('50');
    await expect.poll(async () => (await events(page)).length).toBeGreaterThan(before);
    expect((await eventTypes(page)).at(-1)).toBe('onFinish');
  });

  test('double: two handles, the input holds "from;to", dragging "to" keeps from', async ({ page }) => {
    await open(page, { type: 'double', min: 0, max: 100, from: 20, to: 40 });
    await expect(input(page)).toHaveValue('20;40');
    await drag(page, '.irs-handle.to', 0.4);
    await expect.poll(async () => (await input(page).inputValue()).split(';').map(Number)[1]).toBeGreaterThan(60);
    const to = Number((await input(page).inputValue()).split(';')[1]);
    expect(to).toBeLessThan(90);
    expect((await input(page).inputValue()).split(';')[0]).toBe('20');
  });

  test('values mode writes the label, not the index', async ({ page }) => {
    await open(page, { values: ['S', 'M', 'L', 'XL'], from: 2 });
    await expect(input(page)).toHaveValue('L');
    expect((await events(page))[0]).toMatchObject({ from: 2, from_value: 'L' });
  });

  test('update() rewrites the options, reset() returns to them, destroy() restores the input', async ({ page }) => {
    await open(page, { min: 0, max: 100, from: 10 });
    await drag(page, '.irs-handle.single', 0.5);
    await page.evaluate(() => window.__irs.slider.reset());
    await expect(input(page)).toHaveValue('10');             // reset undoes the drag
    await page.evaluate(() => window.__irs.slider.update({ from: 70 }));
    await expect(input(page)).toHaveValue('70');
    await expect.poll(() => eventTypes(page)).toContain('onUpdate');
    await page.evaluate(() => window.__irs.slider.reset());
    await expect(input(page)).toHaveValue('70');             // update() changed the options themselves
    await page.evaluate(() => window.__irs.slider.destroy());
    await expect(page.locator('.irs')).toHaveCount(0);
    expect(await page.evaluate(() => jQuery.data(document.getElementById('slider'), 'ionRangeSlider'))).toBeFalsy();
  });

  test('disable shows the mask and disables the input; block keeps the input enabled', async ({ page }) => {
    await open(page, { min: 0, max: 100, from: 10, disable: true });
    await expect(page.locator('.irs-disable-mask')).toHaveCount(1);
    await expect(input(page)).toBeDisabled();
    await open(page, { min: 0, max: 100, from: 10, block: true });
    await expect(page.locator('.irs-disable-mask')).toHaveCount(1);
    await expect(input(page)).toBeEnabled();
  });
});
