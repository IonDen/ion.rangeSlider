#!/usr/bin/env node
// Usage: npm run release -- patch|minor
// Edits files only: versions, build counter, build date (UTC), history skeleton, then rebuilds.
// Refuses on a dirty tree and on an unfilled "#TODO" in history.md (a previous release
// that was never finished). Commit, PR, tag and npm publish are manual: see RELEASING.md.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { bumpVersion, formatDate, historyEntry, rewriteFiles } from './lib/bump.mjs';

const kind = process.argv[2];
if (!['patch', 'minor'].includes(kind)) {
  console.error('usage: npm run release -- patch|minor');
  process.exit(2);
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim();
if (dirty) { console.error(`working tree is not clean:\n${dirty}`); process.exit(1); }
const paths = ['package.json', 'bower.json', 'js/ion.rangeSlider.js', 'readme.md', 'history.md'];
const files = Object.fromEntries(paths.map((p) => [p, readFileSync(resolve(root, p), 'utf8')]));
if (files['history.md'].includes('#TODO')) { console.error('history.md still has a #TODO entry from an unfinished release'); process.exit(1); }
const pkg = JSON.parse(files['package.json']);
const from = pkg.version;
const to = bumpVersion(from, kind);
const now = new Date();
const { files: out, changed } = rewriteFiles({ files, from, to, build: pkg.config.build + 1, buildDate: formatDate(now), entry: historyEntry(to, now) });
for (const p of changed) writeFileSync(resolve(root, p), out[p]);
execFileSync('node', [resolve(root, 'scripts/build.mjs')], { stdio: 'inherit' });
console.log(`\n${from} -> ${to}. Changed: ${changed.join(', ')} plus the built files.\nNext: fill the "Issues:" line in history.md, review git diff, then follow RELEASING.md.`);
