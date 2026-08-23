import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const PLUGIN = readFileSync(new URL('../../js/ion.rangeSlider.js', import.meta.url), 'utf8');

/**
 * Boot jsdom + real jQuery, evaluate the unbuilt plugin inside the window's own
 * realm, initialise the first <input> and return the instance. Teardown is
 * registered on the node:test context so a throwing test never leaves the
 * plugin's 300 ms idle timer alive.
 *
 * jsdom has no layout: every width is 0, calc() and drawHandles() return early,
 * so result.*_percent, labels, grid, onChange and resize are never computed here.
 * Test the pure methods and the validated options; geometry belongs to Playwright.
 */
export function createSlider(t, html, options) {
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, {
    runScripts: 'outside-only',   // without this window.eval is Node's eval and `jQuery` is undefined inside the plugin
    pretendToBeVisual: true,      // provides requestAnimationFrame
  });
  const { window } = dom;
  const $ = require('jquery')(window);
  window.jQuery = window.$ = $;
  window.eval(PLUGIN);
  const $input = $('input').first();
  let slider;
  t.after(() => { if (slider && slider.input) slider.destroy(); window.close(); });
  $input.ionRangeSlider(options);
  slider = $.data($input[0], 'ionRangeSlider');
  return { window, $, $input, slider };
}

/** Arrays created inside the jsdom realm are not `Array` in ours; compare by value. */
export const plain = (x) => JSON.parse(JSON.stringify(x));
