import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { MATRIX } from '../browser/matrix.mjs';

test('every matrix cell points at a file that exists', () => {
  for (const m of MATRIX) {
    const path = m.jquery.startsWith('vendor/')
      ? new URL(`../${m.jquery}`, import.meta.url)
      : new URL(`../../node_modules/${m.jquery}/dist/${m.slim ? 'jquery.slim.js' : 'jquery.js'}`, import.meta.url);
    assert.ok(existsSync(path), `${m.id}: ${path.pathname}`);
  }
});
