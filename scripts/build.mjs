#!/usr/bin/env node
// Builds the four distributed files from the sources. Deterministic: every stamp
// (version, build counter, build date) comes from package.json, so `npm run build`
// on a clean checkout reproduces the committed files byte for byte.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import less from 'less';
import CleanCSS from 'clean-css';
import { minify } from 'uglify-js';
import { banners } from './lib/banners.mjs';
import { assertEs3 } from './lib/es3.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const at = (p) => resolve(root, p);
const pkg = JSON.parse(readFileSync(at('package.json'), 'utf8'));
const b = banners(pkg);

// 1. The unminified JS is the source itself; refuse to build if its header drifted from package.json.
const source = readFileSync(at('js/ion.rangeSlider.js'), 'utf8');
const lines = source.split('\n');
if (lines[1] !== b.sourceHeader || lines[2] !== b.sourceCopyright) {
  throw new Error(`js/ion.rangeSlider.js header is\n${lines[1]}\n${lines[2]}\nbut package.json implies\n${b.sourceHeader}\n${b.sourceCopyright}\nRun npm run release to bump, or fix package.json.`);
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

// 3. CSS from LESS (the plain render matches the committed file), then the banner.
const lessSrc = readFileSync(at('less/irs.less'), 'utf8');
const { css } = await less.render(lessSrc, { filename: at('less/irs.less') });
writeFileSync(at('css/ion.rangeSlider.css'), b.css + css);

// 4. Minified CSS with the one-line banner and no trailing newline.
const out = new CleanCSS({ level: 1 }).minify(css);
if (out.errors.length) throw new Error(out.errors.join('\n'));
writeFileSync(at('css/ion.rangeSlider.min.css'), b.cssMin + out.styles);

console.log(`built ${pkg.version} (build ${pkg.config.build}, ${pkg.config.buildDate}): ` +
  `min.js ${Buffer.byteLength(min.code, 'utf8')} B, css ${Buffer.byteLength(css, 'utf8')} B, ` +
  `min.css ${Buffer.byteLength(out.styles, 'utf8')} B`);
