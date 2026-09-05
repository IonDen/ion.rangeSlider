#!/usr/bin/env node
// Usage: node scripts/check-dist.mjs --base <base-branch> --head <head-branch>
// The "built files" CI job for pull requests (issue #853): rebuilds from
// source, asks git which of the three built files this pull request itself
// changed and which of them a fresh build leaves different from what is
// committed, then hands both to decide() (scripts/lib/check-dist.mjs, unit
// tested without git) for the verdict. See CONTRIBUTING.md and
// RELEASING.md for what this means for contributors and release branches.
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decide } from './lib/check-dist.mjs';

const BUILT_FILES = ['js/ion.rangeSlider.min.js', 'css/ion.rangeSlider.css', 'css/ion.rangeSlider.min.css'];
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  const value = i === -1 ? undefined : process.argv[i + 1];
  if (!value) {
    console.error(`usage: node scripts/check-dist.mjs --base <base-branch> --head <head-branch>`);
    process.exit(2);
  }
  return value;
}

function fail(err) {
  console.error(String(err.stderr || err.message).trim());
  process.exit(1);
}

function git(args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (err) {
    return fail(err);
  }
}

const base = arg('base');
const head = arg('head');

try {
  execFileSync(process.execPath, [resolve(root, 'scripts/build.mjs')], { stdio: 'inherit' });
} catch (err) {
  fail(err);
}

const changedRaw = git(['diff', '--name-only', `origin/${base}...HEAD`, '--', ...BUILT_FILES]);
const changedBuiltFiles = changedRaw ? changedRaw.split('\n') : [];

const driftedRaw = git(['diff', '--name-only', '--', ...BUILT_FILES]);
const driftedBuiltFiles = driftedRaw ? driftedRaw.split('\n') : [];

const result = decide({ headRef: head, changedBuiltFiles, driftedBuiltFiles });
console.log(result.message);
process.exit(result.ok ? 0 : 1);
