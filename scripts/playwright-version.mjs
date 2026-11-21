#!/usr/bin/env node
// Usage: node scripts/playwright-version.mjs [path/to/package-lock.json]
// Prints `version=<x.y.z>`, the exact @playwright/test version in the lock file, in the
// key=value form GitHub Actions reads from $GITHUB_OUTPUT. The browser jobs of ci.yml and
// jquery-matrix.yml run in mcr.microsoft.com/playwright:v<that version>-noble (issue #944), so
// the browsers and their system libraries always match the Playwright that `npm ci` installs.
// Exits 1, printing nothing to stdout, when the lock has no exact version for it.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const lockPath = process.argv[2] || resolve(root, 'package-lock.json');
const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
const entry = lock.packages && lock.packages['node_modules/@playwright/test'];
const version = entry && entry.version;

if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`no exact @playwright/test version in ${lockPath} (found ${JSON.stringify(version)})`);
  process.exit(1);
}
console.log(`version=${version}`);
