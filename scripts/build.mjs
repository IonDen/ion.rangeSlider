#!/usr/bin/env node
// Builds the three built files from the sources. Deterministic: every stamp
// (version, build counter, build date) comes from package.json, so `npm run build`
// on a clean checkout reproduces the committed files byte for byte.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { minify } from 'uglify-js';
import { banners } from './lib/banners.mjs';
import { assertEs3 } from './lib/es3.mjs';
import { compileCss } from './lib/css.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const at = (p) => resolve(root, p);
const pkg = JSON.parse(readFileSync(at('package.json'), 'utf8'));
if (!pkg.config || typeof pkg.config.build !== 'number' || !pkg.config.buildDate) {
  throw new Error('package.json is missing "config" with build and buildDate');
}
const b = banners(pkg);

// 1. The unminified JS is the source itself; refuse to build if its header drifted from package.json.
const source = readFileSync(at('js/ion.rangeSlider.js'), 'utf8');
const lines = source.split('\n');
if (lines[1] !== b.sourceHeader || lines[2] !== b.sourceCopyright) {
  throw new Error(`js/ion.rangeSlider.js header is\n${lines[1]}\n${lines[2]}\nbut package.json implies\n${b.sourceHeader}\n${b.sourceCopyright}\nUpdate package.json (version / config.build / config.buildDate) or the header lines so they agree.`);
}
if (!source.includes(`this.VERSION = "${pkg.version}";`)) {
  throw new Error(`this.VERSION in js/ion.rangeSlider.js does not match package.json version ${pkg.version}`);
}
assertEs3(source, 'js/ion.rangeSlider.js');

// 2. Minified JS, ES3-safe for IE8.
const min = minify(source, { ie: true, output: { preamble: b.js } });
if (min.error) throw min.error;
if (min.code.split('\n')[0] !== b.js || min.code.length < 20000) {
  throw new Error('minified output is missing its banner line or is suspiciously small');
}
assertEs3(min.code, 'js/ion.rangeSlider.min.js');
writeFileSync(at('js/ion.rangeSlider.min.js'), min.code);

// 3. CSS from LESS (the plain render matches the committed file) and minified CSS,
// in IE8 compatibility mode so the `.lt-ie9` filter fallback survives; banners added here.
const lessSrc = readFileSync(at('less/irs.less'), 'utf8');
const { css, min: cssMin } = await compileCss(lessSrc, at('less/irs.less'));
const cssOut = b.css + css;
const cssMinOut = b.cssMin + cssMin;
writeFileSync(at('css/ion.rangeSlider.css'), cssOut);
writeFileSync(at('css/ion.rangeSlider.min.css'), cssMinOut);

console.log(`built ${pkg.version} (build ${pkg.config.build}, ${pkg.config.buildDate}): ` +
  `min.js ${Buffer.byteLength(min.code, 'utf8')} B, css ${Buffer.byteLength(cssOut, 'utf8')} B, ` +
  `min.css ${Buffer.byteLength(cssMinOut, 'utf8')} B`);
