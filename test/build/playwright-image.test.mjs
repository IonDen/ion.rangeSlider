// Issue #944: the browser jobs of ci.yml and jquery-matrix.yml run inside Playwright's own
// Docker image, tagged with the @playwright/test version from package-lock.json, so the
// browsers and the system libraries they need always match the installed Playwright and never
// depend on what the GitHub runner image ships. Before this, a browser cache saved on the
// Ubuntu 24.04 runners was restored on Ubuntu 26.04 and WebKit could not launch (2026-10-26).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const SCRIPT = fileURLToPath(new URL('../../scripts/playwright-version.mjs', import.meta.url));
const WORKFLOWS = ['ci.yml', 'jquery-matrix.yml'];
const ENGINES = ['chromium', 'firefox', 'webkit'];

function run(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
}

async function withLock(lock, fn) {
  const dir = await mkdtemp(join(tmpdir(), 'irs-pw-lock-'));
  try {
    const path = join(dir, 'package-lock.json');
    await writeFile(path, JSON.stringify(lock));
    return fn(path);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** A workflow file with its comment lines removed, so prose about a step never counts as one. */
function workflow(name) {
  const text = readFileSync(new URL(`../../.github/workflows/${name}`, import.meta.url), 'utf8');
  return text.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
}

/** { id: projects } for the one-line `- { id: '...', ..., projects: '...' }` cells of a file. */
function cells(yml) {
  const out = {};
  for (const m of yml.matchAll(/^\s*-\s*\{\s*id:\s*'([^']+)'.*?projects:\s*'([^']+)'/gm)) out[m[1]] = m[2];
  return out;
}

/** The text of one job under `jobs:` (two-space key) up to the next job, or null. */
function jobBlock(yml, job) {
  const m = new RegExp(`^  ${job}:\\n((?:(?!  \\S).*\\n?)*)`, 'm').exec(yml);
  return m ? m[1] : null;
}

// Bug caught: the script reads the wrong package (`playwright` or `playwright-core` instead of
// `@playwright/test`), so the image carries other browsers than the test runner expects.
test('playwright-version prints the @playwright/test version from the lock file', async () => {
  const lock = {
    packages: {
      '': { devDependencies: { '@playwright/test': '^1.0.0' } },
      'node_modules/@playwright/test': { version: '1.2.3' },
      'node_modules/playwright': { version: '9.9.9' },
      'node_modules/playwright-core': { version: '8.8.8' },
    },
  };
  await withLock(lock, (path) => {
    const res = run([path]);
    assert.equal(res.status, 0, res.stderr);
    assert.equal(res.stdout, 'version=1.2.3\n');
  });
});

// Bug caught: the default lock path (the only one CI uses) points somewhere else, or the real
// lock file stops yielding an exact version, and the version job fails on every run.
test('playwright-version reads the repository lock file by default', () => {
  const lock = JSON.parse(readFileSync(new URL('../../package-lock.json', import.meta.url), 'utf8'));
  const res = run([]);
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /^version=\d+\.\d+\.\d+\n$/);
  assert.equal(res.stdout, `version=${lock.packages['node_modules/@playwright/test'].version}\n`);
});

// Bug caught: a missing or non-exact entry prints `version=undefined` (or a range), and the
// browser jobs then fail later on an image that does not exist, far from the cause.
test('playwright-version fails loudly without an exact @playwright/test version', async () => {
  const locks = [
    { packages: { 'node_modules/playwright': { version: '1.2.3' } } },
    { packages: { 'node_modules/@playwright/test': { version: '^1.2.3' } } },
    { packages: { 'node_modules/@playwright/test': { version: '1.2.3-beta.1' } } },
    { packages: { 'node_modules/@playwright/test': {} } },
    {},
  ];
  for (const lock of locks) {
    await withLock(lock, (path) => {
      const res = run([path]);
      assert.equal(res.status, 1, JSON.stringify(lock));
      assert.equal(res.stdout, '', JSON.stringify(lock));
      assert.match(res.stderr, /@playwright\/test/);
    });
  }
});

for (const name of WORKFLOWS) {
  // Bug caught: the image is pinned by hand (`playwright:v1.62.1-noble`) and stops matching the
  // installed Playwright after the next upgrade; the distribution suffix is dropped, so an upgrade
  // can silently move the suite to another Ubuntu release; or the browser job loses its image,
  // `needs:` or its cell's projects, or its test step is allowed to fail or be skipped.
  test(`${name}: the browser job runs its cell's projects in the image tagged from the lock file`, () => {
    const yml = workflow(name);
    const browser = jobBlock(yml, 'browser');
    assert.ok(browser, `${name}: no browser job`);
    const images = [...yml.matchAll(/^\s*image:\s*(.+?)\s*$/gm)].map((m) => m[1]);
    assert.equal(images.length, 1, `${name}: expected one container image, found ${images.length}`);
    const m = /^mcr\.microsoft\.com\/playwright:v\$\{\{\s*needs\.([\w-]+)\.outputs\.version\s*\}\}-noble$/.exec(images[0]);
    assert.ok(m, `${name}: unexpected image ${images[0]}`);
    assert.match(browser, /^    container:\n      image: /m, `${name}: the image must be the browser job's container`);
    assert.match(browser, new RegExp(`^    needs: (${m[1]}|\\[.*\\b${m[1]}\\b.*\\])\\s*$|^    needs:\\n(      - .*\\n)*      - ${m[1]}\\s*$`, 'm'), `${name}: browser must need ${m[1]}`);
    assert.match(browser, /^      options: --user 1001\s*$/m, `${name}: the container runs as the runner's user`);
    assert.doesNotMatch(browser, /^    if:/m, `${name}: the browser job must not be conditional`);
    assert.match(browser, /^\s*- run: npx playwright test \$\{\{ matrix\.projects \}\}\s*$/m, `${name}: run step`);
    assert.doesNotMatch(browser, /npx playwright test .*--project=/, `${name}: a run step pins its own projects`);
    assert.doesNotMatch(browser, /continue-on-error/, `${name}: the browser job must not tolerate failures`);
    const step = /^      - run: npx playwright test .*\n((?:        .*\n?)*)/m.exec(browser);
    assert.doesNotMatch(step[1], /^        if:/m, `${name}: the test step must always run`);
  });

  // Bug caught: the version job's output is wired to the wrong step, the step is skipped, or the
  // step stops calling the script, so the image tag comes out as `playwright:v-noble`.
  test(`${name}: the version job takes its output from scripts/playwright-version.mjs`, () => {
    const yml = workflow(name);
    const image = /needs\.([\w-]+)\.outputs\.version/.exec(yml);
    assert.ok(image, `${name}: no needs.<job>.outputs.version`);
    const job = jobBlock(yml, image[1]);
    assert.ok(job, `${name}: no job ${image[1]}`);
    const out = /^      version: \$\{\{ steps\.([\w-]+)\.outputs\.version \}\}\s*$/m.exec(job);
    assert.ok(out, `${name}: ${image[1]} has no outputs.version from a step`);
    assert.doesNotMatch(job, /^    if:/m, `${name}: job ${image[1]} must not be conditional`);
    const step = [...job.matchAll(/^      - (.*\n(?:        .*\n?)*)/gm)].map((s) => s[1])
      .find((s) => new RegExp(`^(id|        id): ${out[1]}\\s*$`, 'm').test(s));
    assert.ok(step, `${name}: no step with id ${out[1]}`);
    assert.match(step, /^(run|        run): node scripts\/playwright-version\.mjs >> "\$GITHUB_OUTPUT"\s*$/m, `${name}: step ${out[1]}`);
    assert.doesNotMatch(step, /^(if|        if):/m, `${name}: step ${out[1]} must always run`);
  });

  // Bug caught: a browser cache or a `playwright install` step comes back. A cache keyed without
  // the runner image restored browsers built for another Ubuntu release (the 2026-10-26 failure).
  test(`${name}: no browser cache and no playwright install step`, () => {
    const yml = workflow(name);
    assert.doesNotMatch(yml, /ms-playwright/, `${name}: browser cache path`);
    assert.doesNotMatch(yml, /actions\/cache\b/, `${name}: actions/cache step (or its restore/save parts)`);
    assert.doesNotMatch(yml, /PLAYWRIGHT_BROWSERS_PATH/, `${name}: browsers path override`);
    assert.doesNotMatch(yml, /playwright install/, `${name}: playwright install step`);
  });
}

// Bug caught: a cell of the weekly matrix drops an engine (say WebKit) or the combination matrix
// to get a green run, or a cell written in another YAML form escapes this check.
test('jquery-matrix.yml runs every engine and the combination matrix in every cell', () => {
  const yml = workflow('jquery-matrix.yml');
  const all = cells(yml);
  assert.ok(Object.keys(all).length >= 19, `only ${Object.keys(all).length} cells`);
  assert.equal((yml.match(/\bid:\s*'/g) || []).length, Object.keys(all).length, 'every cell must be a one-line { id: ... } row');
  for (const [id, projects] of Object.entries(all)) {
    for (const project of [...ENGINES, 'matrix']) {
      assert.ok(projects.split(' ').includes(`--project=${project}`), `${id}: missing ${project}`);
    }
  }
});

// Bug caught: a pull-request cell loses an engine, the combination matrix or the whole cell. These
// four cells are the only browser runs a pull request gets; Firefox and WebKit run in 3.7.1.
test('ci.yml keeps its four browser cells and their projects', () => {
  assert.deepEqual(cells(workflow('ci.yml')), {
    '3.7.1': '--project=chromium --project=firefox --project=webkit --project=matrix',
    '3.7.1-min': '--project=chromium',
    '1.8.3': '--project=chromium --project=matrix',
    '4.0.0-slim': '--project=chromium',
  });
});
