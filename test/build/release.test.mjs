// Integration coverage for scripts/release.mjs's refusal paths. Each test builds a throwaway
// git repo under the OS temp dir, copies only release.mjs + lib/bump.mjs into it (release.mjs
// resolves its own root from import.meta.url, so this copied-into-tmp layout is what makes the
// run hermetic; it never touches the real checkout), then spawns `node scripts/release.mjs`
// against it and checks the exit code and stderr. The refusals all fire before build.mjs is
// invoked, so build.mjs is never copied in and the happy path is out of scope here (that's
// covered by the manual dry exercise in the release PR, not by this suite).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

const PATHS = ['package.json', 'bower.json', 'js/ion.rangeSlider.js', 'readme.md', 'history.md'];

const fixture = () => ({
  'package.json': '{\n  "version": "2.3.1",\n  "config": {\n    "build": 382,\n    "buildDate": "2019-12-19 16:51:02"\n  }\n}',
  'bower.json': '{\n    "version": "2.3.1"\n}',
  'js/ion.rangeSlider.js': '// Ion.RangeSlider\n// version 2.3.1 Build: 382\n// © Denis Ineshin, 2019\n// x\n        this.VERSION = "2.3.1";\n',
  'readme.md': '* Version: 2.3.1\n* [Download ZIP](https://github.com/IonDen/ion.rangeSlider/archive/2.3.1.zip)\n<link href="https://cdnjs.cloudflare.com/ajax/libs/ion-rangeslider/2.3.1/css/ion.rangeSlider.min.css"/>\n<script src="https://cdnjs.cloudflare.com/ajax/libs/ion-rangeslider/2.3.1/js/ion.rangeSlider.min.js"></script>\nsome 2.3.1 in prose stays\n',
  'history.md': '![logo](x.png)\n\n# Update History\n\n### Version 2.3.1. December 19, 2019\n',
});

/** Creates a throwaway git repo with a copy of release.mjs + lib/bump.mjs and the five source
 * files, commits it, and registers cleanup on `t`. Returns { dir, files }. */
async function withScratchRepo(t, { historyTodo = false } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'ion-release-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, 'scripts', 'lib'), { recursive: true });
  await mkdir(join(dir, 'js'), { recursive: true });
  await copyFile(fileURLToPath(new URL('../../scripts/release.mjs', import.meta.url)), join(dir, 'scripts', 'release.mjs'));
  await copyFile(fileURLToPath(new URL('../../scripts/lib/bump.mjs', import.meta.url)), join(dir, 'scripts', 'lib', 'bump.mjs'));
  const files = fixture();
  if (historyTodo) files['history.md'] = files['history.md'].replace(/\n$/, '') + '\n* Issues: #TODO\n';
  for (const rel of PATHS) await writeFile(join(dir, rel), files[rel]);
  execFileSync('git', ['init', '-q'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['add', '-A'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['-c', 'user.email=test@test', '-c', 'user.name=test', 'commit', '-q', '-m', 'init'], { cwd: dir, stdio: 'ignore' });
  return { dir, files };
}

function runRelease(dir, args) {
  return spawnSync(process.execPath, ['scripts/release.mjs', ...args], { cwd: dir, encoding: 'utf8' });
}

async function readAll(dir) {
  const out = {};
  for (const rel of PATHS) out[rel] = await readFile(join(dir, rel), 'utf8');
  return out;
}

test('release.mjs refusal paths', async (t) => {
  await t.test('missing or invalid arg: exit 2 with the usage line', async (t) => {
    const { dir } = await withScratchRepo(t);
    const missing = runRelease(dir, []);
    assert.equal(missing.status, 2);
    assert.match(missing.stderr, /usage: npm run release -- patch\|minor/);
    const bad = runRelease(dir, ['major']);
    assert.equal(bad.status, 2);
    assert.match(bad.stderr, /usage: npm run release -- patch\|minor/);
  });

  await t.test('dirty tree: exit 1, refuses, and leaves every file untouched', async (t) => {
    const { dir } = await withScratchRepo(t);
    const readme = await readFile(join(dir, 'readme.md'), 'utf8');
    await writeFile(join(dir, 'readme.md'), readme + 'uncommitted local edit\n');
    const before = await readAll(dir);
    const result = runRelease(dir, ['patch']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /working tree is not clean/);
    assert.deepEqual(await readAll(dir), before);
  });

  await t.test('unfinished release (#TODO in history.md): exit 1, refuses, and leaves every file untouched', async (t) => {
    const { dir } = await withScratchRepo(t, { historyTodo: true });
    const before = await readAll(dir);
    const result = runRelease(dir, ['patch']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /history\.md still has a #TODO entry from an unfinished release/);
    assert.deepEqual(await readAll(dir), before);
  });
});
