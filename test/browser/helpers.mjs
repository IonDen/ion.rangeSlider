export const JQUERY = process.env.IRS_JQUERY || 'jquery-3.7.1';
export const SLIM = process.env.IRS_SLIM === '1';
export const MIN = process.env.IRS_MIN === '1';
export const LABEL = `${JQUERY}${SLIM ? ' slim' : ''}${MIN ? ' minified' : ''}`;

export async function open(page, config = {}, extra = {}) {
  // config is normally JSON-serialized, but the fixture evals the query param
  // as a JS object literal (not JSON.parse), so a raw string is also accepted
  // for the rare case a test needs to carry a function expression through
  // (JSON.stringify silently drops function-valued properties).
  const configStr = typeof config === 'string' ? config : JSON.stringify(config);
  // extra carries fixture-specific query params (e.g. hidden, attrs) a test
  // needs beyond jquery/config -- routed through here, not built ad hoc per
  // test, so every caller still gets the env-derived slim/min selection below.
  const params = new URLSearchParams({ jquery: JQUERY, config: configStr, ...extra });
  if (SLIM) params.set('slim', '1');
  if (MIN) params.set('min', '1');
  await page.goto(`/test/fixtures/slider.html?${params}`);
  await page.waitForFunction(() => window.__irs && window.__irs.ready);
}

export const events = (page) => page.evaluate(() => window.__irs.events);
export const eventTypes = async (page) => (await events(page)).map((e) => e.type);
export const input = (page) => page.locator('#slider');

/** Drag a handle by a fraction of the line width (positive = right). */
export async function drag(page, handleSelector, fraction) {
  const h = await page.locator(handleSelector).boundingBox();
  const l = await page.locator('.irs-line').boundingBox();
  const x = h.x + h.width / 2, y = h.y + h.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + l.width * fraction, y, { steps: 12 });
  await page.mouse.up();
}

/**
 * Drag a handle by a fraction of the line width through real touch dispatch
 * (touchstart/touchmove/touchend), not the mouse path. Playwright's own
 * `page.touchscreen` only offers a single-point tap (no move step), so this
 * goes through the same CDP session `browserContext.newCDPSession()` uses --
 * chromium-only, which is why every caller must itself be chromium-only (the
 * context still needs `hasTouch: true` so the page treats the dispatched
 * events as real touch input, matching a touch-capable device).
 */
export async function touchDrag(page, handleSelector, fraction) {
  const h = await page.locator(handleSelector).boundingBox();
  const l = await page.locator('.irs-line').boundingBox();
  const x = h.x + h.width / 2, y = h.y + h.height / 2;
  const endX = x + l.width * fraction;
  const cdp = await page.context().newCDPSession(page);
  const point = (px) => [{ x: px, y: y, id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(x) });
  const steps = 12;
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(x + (endX - x) * (i / steps)) });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
