import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileCss } from '../../scripts/lib/css.mjs';

const lessUrl = new URL('../../less/irs.less', import.meta.url);

test('compiling less/irs.less keeps the IE8 filter fallback', async () => {
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
  // Whether this render matches the committed css/ion.rangeSlider.css is no
  // longer asserted here: pull requests do not carry rebuilt files, so the
  // committed file only has to match on a release branch, which is now the
  // "built files" CI job's job (issue #853), not this unit test's.
});
