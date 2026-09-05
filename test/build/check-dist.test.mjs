import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide } from '../../scripts/lib/check-dist.mjs';

// decide() is the pure verdict behind the "built files" CI job: given what a
// pull request's head branch is called, which built files it touched, and
// which built files a fresh `npm run build` leaves different from what is
// committed, it says whether the job should pass, fail, or skip. No git call
// here, so every case below is a plain object in and a plain object out.

test('release branch with drift fails, naming the stale file', () => {
  // One-line bug that reds this: invert the release-branch drift check
  // (`driftedBuiltFiles.length === 0` -> `!== 0`), so a stale release
  // branch would report ok instead of failing.
  const result = decide({
    headRef: 'release/2.4.2',
    changedBuiltFiles: [],
    driftedBuiltFiles: ['css/ion.rangeSlider.min.css'],
  });
  assert.equal(result.ok, false);
  assert.equal(result.skipped, false);
  assert.match(result.message, /css\/ion\.rangeSlider\.min\.css/);
});

test('release branch without drift passes', () => {
  // One-line bug that reds this: flip the release regex (e.g. anchor it to
  // `^releases/` or drop the trailing slash), so this release branch would
  // stop being recognised as one and fall through to the feature-branch path.
  const result = decide({
    headRef: 'release/2.4.2',
    changedBuiltFiles: ['js/ion.rangeSlider.min.js'],
    driftedBuiltFiles: [],
  });
  assert.equal(result.ok, true);
  assert.equal(result.skipped, false);
});

test('feature branch with no built-file changes skips', () => {
  // One-line bug that reds this: drop the "changed" filter (remove the
  // early `changedBuiltFiles.length === 0` branch entirely), so a PR that
  // never touched a built file would be judged instead of skipped.
  const result = decide({
    headRef: 'fix/845-slug',
    changedBuiltFiles: [],
    driftedBuiltFiles: ['css/ion.rangeSlider.css'],
  });
  assert.equal(result.ok, true);
  assert.equal(result.skipped, true);
});

test('feature branch that changed a built file matching the build passes', () => {
  // One-line bug that reds this: invert ok on the final return (report
  // false when nothing offends), so a clean rebuild would fail the PR.
  const result = decide({
    headRef: 'fix/845-slug',
    changedBuiltFiles: ['js/ion.rangeSlider.min.js'],
    driftedBuiltFiles: [],
  });
  assert.equal(result.ok, true);
  assert.equal(result.skipped, false);
});

test('feature branch that changed a built file that drifts fails, naming that file', () => {
  // One-line bug that reds this: invert ok on the offending-files branch
  // (report true when the changed file is also drifted), so a hand-edited
  // or half-rebuilt built file would pass silently.
  const result = decide({
    headRef: 'fix/845-slug',
    changedBuiltFiles: ['css/ion.rangeSlider.min.css'],
    driftedBuiltFiles: ['css/ion.rangeSlider.min.css'],
  });
  assert.equal(result.ok, false);
  assert.equal(result.skipped, false);
  assert.match(result.message, /css\/ion\.rangeSlider\.min\.css/);
});

test('a drifted file the PR did not touch does not fail a feature branch', () => {
  // One-line bug that reds this: drop the "changed" filter (fail on any
  // non-empty driftedBuiltFiles instead of intersecting with
  // changedBuiltFiles), so master already being behind the last release
  // would fail every unrelated PR.
  const result = decide({
    headRef: 'fix/845-slug',
    changedBuiltFiles: ['js/ion.rangeSlider.min.js'],
    driftedBuiltFiles: ['css/ion.rangeSlider.css'],
  });
  assert.equal(result.ok, true);
  assert.equal(result.skipped, false);
});
