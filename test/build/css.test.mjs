import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileCss } from '../../scripts/lib/css.mjs';

const lessUrl = new URL('../../less/irs.less', import.meta.url);
const cssUrl = new URL('../../css/ion.rangeSlider.css', import.meta.url);

test('compiling less/irs.less keeps the IE8 filter fallback and matches the committed CSS', async () => {
  const lessSrc = readFileSync(lessUrl, 'utf8');
  const { css, min } = await compileCss(lessSrc, lessUrl.pathname);

  // (a) the IE8/9 opacity fallback survives minification (default clean-css
  // compatibility strips it, since it targets IE10+, which never needs it).
  assert.match(min, /filter:alpha\(opacity=0\)/);
  // (b) ...and is present in the unminified render too.
  assert.match(css, /filter: alpha\(opacity=0\);/);
  // (c) the minified output is a single line with no banner (the build adds it).
  assert.equal(min.indexOf('\n'), -1);
  assert.equal(min.startsWith('/*'), false);
  // (d) the plain render reproduces the committed file, byte for byte, once its
  // 5-line banner comment is stripped.
  const committed = readFileSync(cssUrl, 'utf8');
  const committedBody = committed.split('\n').slice(5).join('\n');
  assert.equal(css, committedBody);
});
