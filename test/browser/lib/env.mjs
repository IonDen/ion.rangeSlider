// #877 browser suite -- the environment a run is in, read off the page.
//
// Inside a display:none container the slider's `width: 100%` stays unresolved: the browser
// reports its computed width as "100%", which jQuery before 3.3 parses as 100 px. jQuery 3.3
// and later refuse a width that is not in pixels and report 0, because an element inside a
// display:none container has no rendered box (3.3 reads offsetWidth; 3.4 and later skip it
// for a hidden element and return 0 directly). So a slider built hidden renders at init on
// the older builds and has no track to render on until it is shown on the newer ones, and the
// known-bug register (./known-bugs.mjs) has to know which.

/**
 * Reads the jQuery build the page loaded and how that build measures a hidden track.
 *
 * The behaviour is measured, not inferred from the version number: a probe mirroring the
 * slider's case -- a display:none block holding an element of class `irs` -- is appended to
 * the body, the inner element is measured with jQuery(inner).outerWidth(false), the way the
 * plugin measures its track, and the probe is removed again, also when the measurement
 * throws. The class ties the probe to the plugin's stylesheet, which the fixture always
 * loads: the width and display it is measured with are the ones the slider's own .irs spans
 * get. matrix.spec.mjs checks the answer against the slider itself on every run.
 *
 * `jquery` is the version token only: a slim 3.x build reports jQuery.fn.jquery as the
 * version followed by a space and its excluded-module list ("3.7.1 -ajax,-ajax/jsonp,..."),
 * which is cut at the first space; 4.0.0 slim reports "4.0.0+slim" and keeps it.
 *
 * @param {import('@playwright/test').Page} page  a fixture page that has finished loading
 * @returns {Promise<{jquery: string, hiddenTrackMeasuresZero: boolean}>}
 */
export async function readEnv(page) {
  return page.evaluate(() => {
    const outer = document.createElement('div');
    outer.style.display = 'none';
    // No inline style: the stylesheet's .irs rule (less/_base.less) already gives the element
    // display: block as well as width: 100%.
    const inner = document.createElement('div');
    inner.className = 'irs';
    outer.appendChild(inner);
    try {
      document.body.appendChild(outer);
      const width = jQuery(inner).outerWidth(false);
      return { jquery: String(jQuery.fn.jquery).split(' ')[0], hiddenTrackMeasuresZero: width === 0 };
    } finally {
      // Guarded: if appendChild itself threw, the probe was never attached, and a bare
      // removeChild would throw a second error over the first.
      if (outer.parentNode) outer.parentNode.removeChild(outer);
    }
  });
}
