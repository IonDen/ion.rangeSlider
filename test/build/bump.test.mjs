import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bumpVersion, rewriteFiles, formatDate, historyEntry } from '../../scripts/lib/bump.mjs';

const fixture = () => ({
  'package.json': '{\n  "version": "2.3.1",\n  "config": {\n    "build": 382,\n    "buildDate": "2019-12-19 16:51:02"\n  }\n}',
  'js/ion.rangeSlider.js': '// Ion.RangeSlider\n// version 2.3.1 Build: 382\n// © Denis Ineshin, 2019\n// x\n        this.VERSION = "2.3.1";\n',
  'readme.md': '* Version: 2.3.1\n* [Download ZIP](https://github.com/IonDen/ion.rangeSlider/archive/2.3.1.zip)\n<link href="https://cdn.jsdelivr.net/npm/ion-rangeslider@2.3.1/css/ion.rangeSlider.min.css"/>\n<script src="https://cdn.jsdelivr.net/npm/ion-rangeslider@2.3.1/js/ion.rangeSlider.min.js"></script>\n<link href="https://cdnjs.cloudflare.com/ajax/libs/ion-rangeslider/2.3.1/css/ion.rangeSlider.min.css"/>\n<script src="https://cdnjs.cloudflare.com/ajax/libs/ion-rangeslider/2.3.1/js/ion.rangeSlider.min.js"></script>\nsome 2.3.1 in prose stays\n',
  'history.md': '![logo](x.png)\n\n# Update History\n\n### Version 2.3.1. December 19, 2019\n',
});
const d = new Date(Date.UTC(2026, 8, 3, 14, 5, 9));

test('bumpVersion', () => {
  assert.equal(bumpVersion('2.3.1', 'patch'), '2.3.2');
  assert.equal(bumpVersion('2.3.1', 'minor'), '2.4.0');
  assert.throws(() => bumpVersion('2.3.1', 'major'), /2\.x/);
});

test('formatDate (UTC) and historyEntry', () => {
  assert.equal(formatDate(d), '2026-09-03 14:05:09');
  assert.equal(historyEntry('2.3.2', d), '### Version 2.3.2. September 03, 2026\n* Issues: #TODO\n\n');
});

test('rewriteFiles touches every version site and nothing else', () => {
  const { files: out, changed } = rewriteFiles({ files: fixture(), from: '2.3.1', to: '2.3.2', build: 383, buildDate: '2026-09-03 14:05:09', entry: historyEntry('2.3.2', d) });
  assert.deepEqual(changed.slice().sort(), Object.keys(fixture()).sort());
  assert.match(out['package.json'], /"version": "2\.3\.2"/);
  assert.match(out['package.json'], /"build": 383/);
  assert.match(out['package.json'], /"buildDate": "2026-09-03 14:05:09"/);
  assert.match(out['js/ion.rangeSlider.js'], /^\/\/ version 2\.3\.2 Build: 383$/m);
  assert.match(out['js/ion.rangeSlider.js'], /^\/\/ © Denis Ineshin, 2026$/m);
  assert.match(out['js/ion.rangeSlider.js'], /this\.VERSION = "2\.3\.2";/);
  assert.equal((out['readme.md'].match(/2\.3\.2/g) || []).length, 6);
  // Both CDN pairs the readme ships must move together: a rule that rewrites only the
  // cdnjs path form leaves the jsDelivr pair pointing at the previous release.
  assert.match(out['readme.md'], /cdn\.jsdelivr\.net\/npm\/ion-rangeslider@2\.3\.2\/css\//);
  assert.match(out['readme.md'], /cdn\.jsdelivr\.net\/npm\/ion-rangeslider@2\.3\.2\/js\//);
  assert.match(out['readme.md'], /ajax\/libs\/ion-rangeslider\/2\.3\.2\/css\//);
  assert.match(out['readme.md'], /ajax\/libs\/ion-rangeslider\/2\.3\.2\/js\//);
  assert.doesNotMatch(out['readme.md'], /ion-rangeslider[@/]2\.3\.1\//);
  assert.match(out['readme.md'], /some 2\.3\.1 in prose stays/);
  assert.match(out['history.md'], /# Update History\n\n### Version 2\.3\.2\. September 03, 2026\n\* Issues: #TODO\n\n### Version 2\.3\.1/);
});

test('rewriteFiles throws when a version site is missing', () => {
  const files = fixture();
  files['readme.md'] = 'no version line here\n';
  assert.throws(() => rewriteFiles({ files, from: '2.3.1', to: '2.3.2', build: 383, buildDate: '2026-09-03 14:05:09', entry: '' }), /readme\.md: "Version:" line not found/);
});

test('rewriteFiles throws when a version site appears more than once', () => {
  const files = fixture();
  files['readme.md'] += '* [Download ZIP](https://github.com/IonDen/ion.rangeSlider/archive/2.3.1.zip)\n';
  assert.throws(() => rewriteFiles({ files, from: '2.3.1', to: '2.3.2', build: 383, buildDate: '2026-09-03 14:05:09', entry: '' }), /readme\.md: ZIP link not found \(expected 1 match, got 2\)/);
});

// A stray third jsDelivr URL must abort the release the same way a stray ZIP link does.
// The rule replaces globally, so without the count guard a third URL nobody meant to bump
// would be rewritten silently; the guard stops the release so the CDN block gets a look.
test('rewriteFiles throws when the jsDelivr pair is not exactly two URLs', () => {
  const files = fixture();
  files['readme.md'] += '<script src="https://cdn.jsdelivr.net/npm/ion-rangeslider@2.3.1/js/ion.rangeSlider.js"></script>\n';
  assert.throws(() => rewriteFiles({ files, from: '2.3.1', to: '2.3.2', build: 383, buildDate: '2026-09-03 14:05:09', entry: '' }), /readme\.md: jsDelivr URLs not found \(expected 2 match, got 3\)/);
});
