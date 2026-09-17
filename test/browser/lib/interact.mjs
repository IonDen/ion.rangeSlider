// Interaction helpers for the contract and matrix suites. Every function
// reads fresh bounding boxes on every call (never caches one across an
// interaction) -- skins and containers change the handle and line geometry,
// and a stale box silently mistargets the drag.

function wrapSelector(n) {
  return n === 2 ? '#wrap2' : '#wrap';
}

function lineLocator(page, n = 1) {
  return page.locator(`${wrapSelector(n)} .irs-line`);
}

function barLocator(page, n = 1) {
  return page.locator(`${wrapSelector(n)} .irs-bar`);
}

function handleLocator(page, which, n = 1) {
  return page.locator(`${wrapSelector(n)} .irs-handle.${which}`);
}

function anyHandleLocator(page, n = 1) {
  return page.locator(`${wrapSelector(n)} .irs-handle`).first();
}

/**
 * The pixel x (page-relative) of the handle's CENTRE for a target real
 * percent fraction `f` (0..1) of the value range. Mirrors the plugin's own
 * pointer maths: a press/click sets `p_gap = p_handle / 2` (calc()'s "click"
 * branch, and a drag started at the handle's own centre lands on the same
 * gap), so the handle's rendered left edge sits `handleWidth / 2` inside the
 * pointer's raw position, and the usable travel is `line.width - handleWidth`
 * (the handle's width in % is subtracted from the fake-percent range so the
 * handle never overflows the track).
 *
 * @param {{x:number,width:number}} line bounding box of `.irs-line`
 * @param {number} handleWidth px width of a `.irs-handle`
 * @param {number} f target real percent fraction, 0..1
 */
export function xForFraction(line, handleWidth, f) {
  return line.x + handleWidth / 2 + f * (line.width - handleWidth);
}

/**
 * Drags handle `which` ('single'|'from'|'to') to the absolute track fraction `f`.
 *
 * `which` picks the handle the press is AIMED at, not always the one it gets: where the
 * two handles of a double slider sit on the same value, or overlap within a pixel of
 * track, the press lands on whichever is on top -- `to` at init (setTopHandler), the last
 * touched one (.type_last) afterwards -- so a drag aimed at `from` can grab `to` and the
 * other way round, and the crossing guard then parks the pressed handle on the other one.
 */
export async function dragHandleTo(page, which, f, n = 1) {
  const handle = handleLocator(page, which, n);
  const h = await handle.boundingBox();
  const line = await lineLocator(page, n).boundingBox();
  const startX = h.x + h.width / 2, y = h.y + h.height / 2;
  const endX = xForFraction(line, h.width, f);
  await page.mouse.move(startX, y);
  await page.mouse.down();
  await page.mouse.move(endX, y, { steps: 12 });
  await page.mouse.up();
}

/**
 * Drags the whole interval (`drag_interval`, target "both") by a fraction
 * `f` of the track's usable travel (`line.width - handleWidth`). The bar
 * drag has no per-handle grab offset (calc()'s "both" branch sets
 * `p_gap = 0`), so this is a relative move from wherever the press starts,
 * not an absolute target.
 */
export async function dragBarBy(page, f, n = 1) {
  const bar = barLocator(page, n);
  const b = await bar.boundingBox();
  const handle = await anyHandleLocator(page, n).boundingBox();
  const line = await lineLocator(page, n).boundingBox();
  const x = b.x + b.width / 2, y = b.y + b.height / 2;
  const dx = f * (line.width - handle.width);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y, { steps: 12 });
  await page.mouse.up();
}

/** Clicks the track at the absolute fraction `f` (the same handle-centred targeting as a drag). */
export async function clickTrackAt(page, f, n = 1) {
  const line = await lineLocator(page, n).boundingBox();
  const handle = await anyHandleLocator(page, n).boundingBox();
  const x = xForFraction(line, handle.width, f);
  const y = line.y + line.height / 2;
  await page.mouse.click(x, y);
}

/**
 * Focuses the track (`.irs-line`, tabindex 0). Blurs first when the track is
 * already focused: a re-`.focus()` on an already-focused element dispatches
 * no focus event, which would silently no-op a test that relies on the
 * plugin's focus handler running (testing.md's documented flake trap).
 */
export async function focusTrack(page, n = 1) {
  const line = lineLocator(page, n);
  const alreadyFocused = await line.evaluate((el) => document.activeElement === el);
  if (alreadyFocused) {
    await page.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); });
  }
  await line.focus();
}

/** Presses each key in order, 30ms apart (the plugin's keydown handler expects discrete presses). */
export async function pressKeys(page, keys) {
  for (const key of keys) {
    await page.keyboard.press(key);
    await page.waitForTimeout(30);
  }
}

/**
 * Drags handle `which` to the absolute track fraction `f` through real touch
 * dispatch (touchstart/touchmove/touchend) via CDP -- the same approach as
 * helpers.mjs's `touchDrag`, chromium-only, but targeting an absolute
 * fraction of the track instead of a fraction relative to the handle's
 * current position.
 */
export async function touchDragTo(page, which, f) {
  const handle = handleLocator(page, which, 1);
  const h = await handle.boundingBox();
  const line = await lineLocator(page, 1).boundingBox();
  const x = h.x + h.width / 2, y = h.y + h.height / 2;
  const endX = xForFraction(line, h.width, f);
  const cdp = await page.context().newCDPSession(page);
  const point = (px) => [{ x: px, y: y, id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(x) });
  const steps = 12;
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(x + (endX - x) * (i / steps)) });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
