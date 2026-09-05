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
  // One-line bug that reds this: narrow the release regex (e.g. require a
  // `release/v` prefix) so `release/` no longer matches this head branch and
  // decide() falls through to the feature-branch path. changedBuiltFiles is
  // empty here specifically so that fallthrough hits the "no built-file
  // changes" skip branch (skipped: true), which reds the skipped === false
  // assertion below; the message assertion then pins the release-branch
  // wording itself.
  const result = decide({
    headRef: 'release/2.4.2',
    changedBuiltFiles: [],
    driftedBuiltFiles: [],
  });
  assert.equal(result.ok, true);
  assert.equal(result.skipped, false);
  assert.match(result.message, /^release branch/);
});

test('a release-looking segment that is not the branch prefix is still a feature branch', () => {
  // One-line bug that reds this: drop the `^` anchor from the release regex
  // (`/release\//` instead of `/^release\//`), so a branch that merely
  // contains "release/" anywhere in its name would be treated as a release
  // branch and judged strictly against driftedBuiltFiles instead of skipped.
  const result = decide({
    headRef: 'fix/853-release/notes',
    changedBuiltFiles: [],
    driftedBuiltFiles: ['css/ion.rangeSlider.css'],
  });
  assert.equal(result.skipped, true);
  assert.equal(result.ok, true);
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

test('feature branch with two changed built files, only one drifted: message names only that one', () => {
  // One-line bug that reds this: report the full changedBuiltFiles list
  // instead of the changed-and-drifted intersection (`offending`), so the
  // message would also name js/ion.rangeSlider.min.js even though that file
  // never drifted.
  const result = decide({
    headRef: 'fix/845-slug',
    changedBuiltFiles: ['js/ion.rangeSlider.min.js', 'css/ion.rangeSlider.min.css'],
    driftedBuiltFiles: ['css/ion.rangeSlider.min.css'],
  });
  assert.equal(result.ok, false);
  assert.match(result.message, /css\/ion\.rangeSlider\.min\.css/);
  assert.doesNotMatch(result.message, /js\/ion\.rangeSlider\.min\.js/);
});
