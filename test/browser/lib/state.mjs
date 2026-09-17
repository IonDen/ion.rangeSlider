// Reads page-observable slider state for the contract and matrix suites.
// Never reads window.__irs.slider's internal `.options`/`.result`/`.coords`
// (testing.md's rule) -- only rendered text, computed style, geometry, the
// input's own value/attributes, the jQuery-data mirror writeToInput() itself
// writes (input.data("from"/"to")), and the recorder's event log.

import { valuesEntry } from './format.mjs';

function wrapSelector(n) {
  return n === 2 ? '#wrap2' : '#wrap';
}

function inputSelector(n) {
  return n === 2 ? '#slider2' : '#slider';
}

/**
 * Derives the input's `values` (numbers, or values-mode indexes) from its
 * raw text value -- the same channel writeToInput() itself writes, split on
 * the configured separator. `cfg` is the config object the test passed to
 * `open()`; only its `values` and `input_values_separator` fields are used.
 */
function computeValues(rawValue, cfg) {
  if (rawValue === null || rawValue === undefined || rawValue === '') {
    return { from: null, to: null };
  }
  const sep = (cfg && cfg.input_values_separator) || ';';
  const parts = String(rawValue).split(sep);
  const hasValues = !!(cfg && Array.isArray(cfg.values) && cfg.values.length);
  const one = (part) => {
    if (part === undefined) return null;
    if (hasValues) {
      // The plugin writes the CONVERTED entry to the input (readme note
      // "values": "20.0" becomes 20 unless values_raw), so the lookup must
      // compare against the same conversion the label oracle uses. An entry
      // the input names but the array does not hold is `null` (unknown),
      // never -1 (which would read as a value below the first index).
      for (let i = 0; i < cfg.values.length; i++) {
        if (String(valuesEntry(cfg, i)) === part) return i;
      }
      return null;
    }
    return Number(part);
  };
  return { from: one(parts[0]), to: parts.length > 1 ? one(parts[1]) : null };
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {number} [n=1] which slider on the page: 1 selects #slider/#wrap,
 *   2 selects #slider2/#wrap2 (the count=2 fixture addition).
 * @param {object} [cfg] the config object the test opened the slider with;
 *   used only to derive `values` (never sent back as a source of truth for
 *   anything the DOM itself reports).
 * @returns {Promise<object>} the State the invariants of lib/invariants.mjs read (its
 *   module comment lists the fields).
 */
export async function readState(page, n = 1, cfg) {
  const wrapSel = wrapSelector(n);
  const inputSel = inputSelector(n);

  const state = await page.evaluate(({ wrapSel, inputSel }) => {
    function visible(el) {
      if (!el) return false;
      const cs = getComputedStyle(el);
      return cs.display !== 'none' && cs.visibility !== 'hidden';
    }
    function box(el) {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, width: r.width, height: r.height };
    }
    function label(el) {
      return el ? { text: el.textContent, visible: visible(el) } : { text: null, visible: false };
    }
    function classes(el) {
      return el ? el.className.split(/\s+/).filter(Boolean) : [];
    }

    const wrapEl = document.querySelector(wrapSel);
    // The container `.irs` is a previous sibling of the input (append()
    // inserts it via input.before(...)); base_html then nests a second,
    // unclassed `<span class="irs">` inside it, but that inner span comes
    // AFTER the outer one in document order, so a plain descendant query
    // from wrapEl still resolves to the outer, skin-classed container first.
    const cont = wrapEl ? wrapEl.querySelector('.irs') : null;
    const inputEl = document.querySelector(inputSel);

    const handles = {};
    const hSingle = cont && cont.querySelector('.irs-handle.single');
    const hFrom = cont && cont.querySelector('.irs-handle.from');
    const hTo = cont && cont.querySelector('.irs-handle.to');
    if (hSingle) handles.single = { box: box(hSingle), classes: classes(hSingle) };
    if (hFrom) handles.from = { box: box(hFrom), classes: classes(hFrom) };
    if (hTo) handles.to = { box: box(hTo), classes: classes(hTo) };

    const shadows = {};
    const shSingle = cont && cont.querySelector('.shadow-single');
    const shFrom = cont && cont.querySelector('.shadow-from');
    const shTo = cont && cont.querySelector('.shadow-to');
    if (shSingle) shadows.single = { box: box(shSingle), visible: visible(shSingle) };
    if (shFrom) shadows.from = { box: box(shFrom), visible: visible(shFrom) };
    if (shTo) shadows.to = { box: box(shTo), visible: visible(shTo) };

    const gridTextEls = cont ? Array.prototype.slice.call(cont.querySelectorAll('.irs-grid-text')) : [];
    const texts = gridTextEls.map((el) => el.textContent);
    const visibleTexts = gridTextEls.filter(visible).map((el) => el.textContent);
    const pols = cont ? cont.querySelectorAll('.irs-grid-pol').length : 0;

    const lineEl = cont && cont.querySelector('.irs-line');
    const barEl = cont && cont.querySelector('.irs-bar');

    let dataFrom = null;
    let dataTo = null;
    // The instance handle the readme tells the caller to fetch with
    // $("#range").data("ionRangeSlider"): present while the slider lives, gone once
    // destroy() has restored the input.
    let dataHandle = false;
    if (inputEl && typeof jQuery !== 'undefined') {
      const $input = jQuery(inputEl);
      dataFrom = $input.data('from');
      dataTo = $input.data('to');
      if (dataFrom === undefined) dataFrom = null;
      if (dataTo === undefined) dataTo = null;
      dataHandle = !!jQuery.data(inputEl, 'ionRangeSlider');
    }

    return {
      input: {
        value: inputEl ? inputEl.value : null,
        disabled: inputEl ? inputEl.disabled : null,
        dataFrom: dataFrom,
        dataTo: dataTo,
        dataHandle: dataHandle,
        // the plugin toggles .irs-hidden-input on the input at init and
        // destroy(); the destroy invariant reads it back here
        classes: classes(inputEl)
      },
      container: { exists: !!cont, classes: classes(cont) },
      labels: {
        single: label(cont && cont.querySelector('.irs-single')),
        from: label(cont && cont.querySelector('.irs-from')),
        to: label(cont && cont.querySelector('.irs-to')),
        min: label(cont && cont.querySelector('.irs-min')),
        max: label(cont && cont.querySelector('.irs-max'))
      },
      handles: handles,
      line: box(lineEl),
      bar: box(barEl),
      shadows: shadows,
      grid: { present: pols > 0 || texts.length > 0, texts: texts, visibleTexts: visibleTexts, pols: pols },
      mask: !!(cont && cont.querySelector('.irs-disable-mask'))
    };
  }, { wrapSel, inputSel });

  state.events = await page.evaluate(() => window.__irs.events);
  state.values = computeValues(state.input.value, cfg);

  return state;
}
