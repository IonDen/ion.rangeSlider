// Hermetic coverage for scripts/check-dist.mjs itself (issue #853 follow-up),
// following the scratch-repo pattern of test/build/release.test.mjs. Each test
// builds a throwaway git repo under the OS temp dir, copies only
// check-dist.mjs + lib/check-dist.mjs into it (check-dist.mjs resolves its own
// root from import.meta.url, so this copied-into-tmp layout is what makes the
// run hermetic; it never touches the real checkout) and swaps in a stub
// build.mjs that writes fixed content to the three built files instead of
// actually compiling anything, then spawns `node scripts/check-dist.mjs`
// against it and checks the exit code and output. decide()'s own branch logic
// is covered without git in check-dist.test.mjs; this file is about the shell
// around it: argument handling and how git state turns into decide()'s input.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, appendFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

const BUILT_FILES = ['js/ion.rangeSlider.min.js', 'css/ion.rangeSlider.css', 'css/ion.rangeSlider.min.css'];

// Fixed canonical content the stub build.mjs writes on every run, standing in
// for a real, deterministic `npm run build`.
const CANONICAL = {
  'js/ion.rangeSlider.min.js': '/* canonical built js */\n',
  'css/ion.rangeSlider.css': '/* canonical built css */\n',
  'css/ion.rangeSlider.min.css': '/* canonical built min css */\n',
};

const BUILD_STUB = [
  "import { writeFileSync } from 'node:fs';",
  "import { resolve, dirname } from 'node:path';",
  "import { fileURLToPath } from 'node:url';",
  "const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');",
  ...Object.entries(CANONICAL).map(
    ([f, c]) => `writeFileSync(resolve(root, ${JSON.stringify(f)}), ${JSON.stringify(c)});`
  ),
  '',
].join('\n');

function git(dir, args) {
  execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
}

function commit(dir, message) {
  git(dir, ['add', '-A']);
  git(dir, ['-c', 'user.email=test@test', '-c', 'user.name=test', 'commit', '-q', '-m', message]);
}

/** Creates a throwaway git repo on a branch named master, with the three
 * built files already equal to CANONICAL, and a remote-tracking
 * origin/master pointing at that same commit. Returns the repo dir. */
async function withScratchRepo(t) {
  const dir = await mkdtemp(join(tmpdir(), 'ion-check-dist-cli-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, 'scripts', 'lib'), { recursive: true });
  await mkdir(join(dir, 'js'), { recursive: true });
  await mkdir(join(dir, 'css'), { recursive: true });
  await copyFile(fileURLToPath(new URL('../../scripts/check-dist.mjs', import.meta.url)), join(dir, 'scripts', 'check-dist.mjs'));
  await copyFile(fileURLToPath(new URL('../../scripts/lib/check-dist.mjs', import.meta.url)), join(dir, 'scripts', 'lib', 'check-dist.mjs'));
  await writeFile(join(dir, 'scripts', 'build.mjs'), BUILD_STUB);
  for (const rel of BUILT_FILES) await writeFile(join(dir, rel), CANONICAL[rel]);
  git(dir, ['init', '-q']);
  commit(dir, 'init');
  // Force the branch name regardless of the local init.defaultBranch config.
  git(dir, ['branch', '-M', 'master']);
  git(dir, ['update-ref', 'refs/remotes/origin/master', 'HEAD']);
  return dir;
}

function checkoutNew(dir, branch) {
  git(dir, ['checkout', '-q', '-b', branch]);
}

async function commitHandEdit(dir, file) {
  await appendFile(join(dir, file), 'hand edit\n');
  commit(dir, 'hand edit');
}

/** Moves origin/master ahead of local master's fork point by committing a
 * hand edit to `file` directly on the master branch, then returns to
 * `backToBranch` (which stays at the old, pre-advance commit). Used to prove
 * the CLI diffs the merge-base (three-dot), not origin/master's tip
 * (two-dot): a two-dot diff would wrongly blame this branch for a file only
 * origin/master moved. */
async function advanceOriginMasterWithHandEdit(dir, file, backToBranch) {
  git(dir, ['checkout', '-q', 'master']);
  await commitHandEdit(dir, file);
  git(dir, ['update-ref', 'refs/remotes/origin/master', 'HEAD']);
  git(dir, ['checkout', '-q', backToBranch]);
}

function run(dir, args) {
  return spawnSync(process.execPath, ['scripts/check-dist.mjs', ...args], { cwd: dir, encoding: 'utf8' });
}

test('feature branch with no built-file change: skip message, exit 0', async (t) => {
  // One-line bug that reds this: drop the three-dot from the diff range
  // (`origin/${base}...HEAD` -> `origin/${base}..HEAD`). origin/master is
  // advanced past this branch's fork point by a hand edit to a built file
  // that this branch itself never touched; a two-dot diff compares straight
  // against origin/master's new tip and would wrongly count that file as
  // changed by this branch, turning the expected skip into a false "matches"
  // verdict.
  const dir = await withScratchRepo(t);
  checkoutNew(dir, 'fix/845-slug');
  await advanceOriginMasterWithHandEdit(dir, 'css/ion.rangeSlider.min.css', 'fix/845-slug');

  const result = run(dir, ['--base', 'master', '--head', 'fix/845-slug']);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /built-files check skipped/);
});

test('feature branch that committed a hand edit to one built file: exit 1, names only that file', async (t) => {
  // One-line bug that reds this: drop a file from BUILT_FILES (e.g. remove
  // 'css/ion.rangeSlider.min.css'), so the hand-edited file would never be
  // diffed or rebuilt and the check would pass it silently.
  const dir = await withScratchRepo(t);
  checkoutNew(dir, 'fix/845-slug');
  await commitHandEdit(dir, 'css/ion.rangeSlider.min.css');

  const result = run(dir, ['--base', 'master', '--head', 'fix/845-slug']);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /css\/ion\.rangeSlider\.min\.css/);
  assert.doesNotMatch(result.stdout, /js\/ion\.rangeSlider\.min\.js/);
  assert.doesNotMatch(result.stdout, /css\/ion\.rangeSlider\.css\b(?!\.min)/);
});

test('missing or empty --base: exit 2 with the usage line', async (t) => {
  // One-line bug that reds this: invert the exit mapping on the usage path
  // (process.exit(2) -> process.exit(0) or process.exit(1)), so a missing or
  // empty argument would not surface as the documented usage-error exit code.
  const dir = await withScratchRepo(t);
  checkoutNew(dir, 'fix/845-slug');

  const missing = run(dir, ['--head', 'fix/845-slug']);
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /usage: node scripts\/check-dist\.mjs --base <base-branch> --head <head-branch>/);

  const empty = run(dir, ['--base', '', '--head', 'fix/845-slug']);
  assert.equal(empty.status, 2);
  assert.match(empty.stderr, /usage: node scripts\/check-dist\.mjs --base <base-branch> --head <head-branch>/);
});

test('--head release/9.9.9 with the same hand edit: exit 1 naming the file', async (t) => {
  // One-line bug that reds this: drop a file from BUILT_FILES (same mutation
  // as the feature-branch case above), so the release-branch strict path
  // would never see this file drift either.
  const dir = await withScratchRepo(t);
  checkoutNew(dir, 'release/9.9.9');
  await commitHandEdit(dir, 'css/ion.rangeSlider.min.css');

  const result = run(dir, ['--base', 'master', '--head', 'release/9.9.9']);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /css\/ion\.rangeSlider\.min\.css/);
});
