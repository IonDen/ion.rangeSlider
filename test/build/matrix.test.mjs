import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { MATRIX } from '../browser/matrix.mjs';

test('every matrix cell points at a file that exists', () => {
  for (const m of MATRIX) {
    const path = m.jquery.startsWith('vendor/')
      ? new URL(`../${m.jquery}`, import.meta.url)
      : new URL(`../../node_modules/${m.jquery}/dist/${m.slim ? 'jquery.slim.js' : 'jquery.js'}`, import.meta.url);
    assert.ok(existsSync(path), `${m.id}: ${path.pathname}`);
  }
});

test('the matrix covers every supported jQuery line (at least 19 cells)', () => {
  assert.ok(MATRIX.length >= 19, `MATRIX has only ${MATRIX.length} cells`);
});

test('jquery-matrix.yml has exactly one include line per matrix cell', () => {
  const yml = readFileSync(new URL('../../.github/workflows/jquery-matrix.yml', import.meta.url), 'utf8');
  const ymlIds = [...yml.matchAll(/-\s*\{\s*id:\s*'([^']+)'/g)].map((m) => m[1]).sort();
  const matrixIds = MATRIX.map((m) => m.id).sort();
  assert.deepEqual(ymlIds, matrixIds);
});

test('every jquery-X devDependency alias pins npm:jquery@X exactly', () => {
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  for (const [name, spec] of Object.entries(pkg.devDependencies)) {
    const m = /^jquery-(.+)$/.exec(name);
    if (!m) continue;
    assert.equal(spec, `npm:jquery@${m[1]}`, `${name}: expected npm:jquery@${m[1]}, got ${spec}`);
  }
});
