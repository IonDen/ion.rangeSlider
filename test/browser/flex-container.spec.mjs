import { test, expect } from '@playwright/test';
import { open, LABEL } from './helpers.mjs';

// #776: with the slider's input inside a display:flex (or inline-flex)
// wrapper, `.irs` declared no width. As a block element it filled its
// parent for free; as a flex item with flex-basis:auto and no width of its
// own, it fell back to content-based sizing -- and every meaningful
// descendant (.irs-line, .irs-bar, handles, labels) is position:absolute,
// so the content size was 0. The result: the handle pinned to the left
// edge and the single label showed the minimum instead of the configured
// value. Fixed by giving `.irs` width: 100% in less/_base.less (CSS only,
// no JS change) -- restoring, on a flex item, the same 100%-of-parent
// sizing a block element already got for free.

async function lineFraction(page, handleSelector) {
  const h = await page.locator(handleSelector).boundingBox();
  const l = await page.locator('.irs-line').boundingBox();
  if (!h || !l || !l.width) return -1;
  return (h.x + h.width / 2 - l.x) / l.width;
}

test.describe(`flex container width (${LABEL})`, () => {
  for (const wrap of ['flex', 'inline-flex']) {
    test(`.irs fills a ${wrap} parent instead of collapsing to 0 width (#776)`, async ({ page }) => {
      await open(page, { min: 0, max: 100, from: 30 }, { wrap: wrap });
      // The idle render loop's 300ms poll is what picks up a relayout --
      // outlast it before measuring, same as every other geometry-reading
      // test in this suite.
      await page.waitForTimeout(400);

      const irsBox = await page.locator('.js-irs-0 .irs').boundingBox();
      // RED on 0a91f1c css (`.irs` has no width, so a flex parent sizes it
      // to its absolutely-positioned content: 0): irsBox.width reads 0
      // instead of the 600px wrap declares.
      expect(irsBox.width).toBeGreaterThan(598);
      expect(irsBox.width).toBeLessThan(602);

      const fraction = await lineFraction(page, '.irs-handle.single');
      // RED on 0a91f1c css: with w_rs (the measured slider width) reading
      // 0, calc() and drawHandles() bail out early every pass, so the
      // handle never leaves its initial left: 0.
      expect(fraction).toBeGreaterThan(0.25);
      expect(fraction).toBeLessThan(0.35);

      // RED on 0a91f1c css: with the handle pinned left, the rendered
      // label shows the minimum (0) instead of the configured from (30).
      await expect(page.locator('.irs-single')).toHaveText('30');
    });
  }

  // Control: an ordinary block parent (the wrap param absent) must keep
  // working exactly as before. Characterization -- green both before and
  // after the fix, since a block-level `.irs` already filled its parent at
  // 100% width with no declared width of its own; `width: 100%` just makes
  // that explicit instead of relying on the block default.
  test('a block parent still sizes .irs to its own width, unaffected by the fix (#776, characterization)', async ({ page }) => {
    await open(page, { min: 0, max: 100, from: 30 });
    await page.waitForTimeout(400);

    const irsBox = await page.locator('.js-irs-0 .irs').boundingBox();
    expect(irsBox.width).toBeGreaterThan(598);
    expect(irsBox.width).toBeLessThan(602);

    const fraction = await lineFraction(page, '.irs-handle.single');
    expect(fraction).toBeGreaterThan(0.25);
    expect(fraction).toBeLessThan(0.35);

    await expect(page.locator('.irs-single')).toHaveText('30');
  });
});
