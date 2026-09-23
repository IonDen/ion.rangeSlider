// #877 browser suite -- the environment a run is in, read off the page.
//
// Inside a display:none container the browser leaves an element's computed width at the
// unresolved "100%", which jQuery before 3.3 parses as 100 px. jQuery 3.3 and later reject a
// width that is not in pixels and fall back to offsetWidth, which is 0 there. So a slider
// built hidden renders at init on the older builds and has no track to render on until it is
// shown on the newer ones, and the known-bug register (./known-bugs.mjs) has to know which.

/**
 * Reads the jQuery build the page loaded and how that build measures a hidden track.
 *
 * The behaviour is measured, not inferred from the version number: a probe mirroring the
 * slider's case -- a display:none block holding a block element at width 100% -- is appended
 * to the body, the inner element is measured with jQuery(inner).outerWidth(false), the way
 * the plugin measures its own container, and the probe is removed again.
 *
 * @param {import('@playwright/test').Page} page  a fixture page that has finished loading
 * @returns {Promise<{jquery: string, hiddenTrackMeasuresZero: boolean}>}
 */
export async function readEnv(page) {
  return page.evaluate(() => {
    const outer = document.createElement('div');
    outer.style.display = 'none';
    const inner = document.createElement('div');
    inner.style.display = 'block';
    inner.style.width = '100%';
    outer.appendChild(inner);
    document.body.appendChild(outer);
    const width = jQuery(inner).outerWidth(false);
    document.body.removeChild(outer);
    return { jquery: jQuery.fn.jquery, hiddenTrackMeasuresZero: width === 0 };
  });
}
