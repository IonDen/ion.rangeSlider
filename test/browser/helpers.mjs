export const JQUERY = process.env.IRS_JQUERY || 'jquery-3.7.1';
export const SLIM = process.env.IRS_SLIM === '1';
export const MIN = process.env.IRS_MIN === '1';
export const LABEL = `${JQUERY}${SLIM ? ' slim' : ''}${MIN ? ' minified' : ''}`;

export async function open(page, config = {}) {
  // config is normally JSON-serialized, but the fixture evals the query param
  // as a JS object literal (not JSON.parse), so a raw string is also accepted
  // for the rare case a test needs to carry a function expression through
  // (JSON.stringify silently drops function-valued properties).
  const configStr = typeof config === 'string' ? config : JSON.stringify(config);
  const params = new URLSearchParams({ jquery: JQUERY, config: configStr });
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
