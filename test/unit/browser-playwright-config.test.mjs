import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import shared from '../../playwright.config.mjs';

// #877: the Playwright config splits the suite in two -- the engine projects
// (chromium/firefox/webkit) run the hand-written specs, and the `matrix` project runs the
// generated combination matrix on chromium alone. Playwright matches testIgnore and testMatch
// against the ABSOLUTE path of each spec file, which is what these tests pin.
//
// A second, git-excluded playwright.local.config.mjs is the same file on another port, so a
// local run cannot collide with a suite already holding the shared one. It is checked here
// too when it exists; CI has only the committed config.

const LOCAL_CONFIG = new URL('../../playwright.local.config.mjs', import.meta.url);
const local = existsSync(LOCAL_CONFIG) ? (await import(LOCAL_CONFIG.href)).default : null;
const CONFIGS = local ? [['playwright.config.mjs', shared], ['playwright.local.config.mjs', local]] : [['playwright.config.mjs', shared]];

const MATRIX_SPEC = '/Users/dev/ion.rangeSlider/test/browser/matrix/matrix.spec.mjs';
const SMOKE_SPEC = '/Users/dev/ion.rangeSlider/test/browser/smoke.spec.mjs';
/** The same spec, in a checkout that happens to live under a directory called matrix. */
const SMOKE_IN_A_MATRIX_DIR = '/Users/dev/matrix/ion.rangeSlider/test/browser/smoke.spec.mjs';
const CONTRACT_SPEC = '/Users/dev/ion.rangeSlider/test/browser/contract/lib.spec.mjs';

// Bug caught: an unanchored /matrix\//, which is matched against the whole absolute path --
// a checkout living under any directory called `matrix` makes the three engine projects
// ignore every spec in the suite and report a green run that tested nothing.
test('the engine projects ignore the matrix directory and nothing else', () => {
    for (const [name, config] of CONFIGS) {
        for (const engine of ['chromium', 'firefox', 'webkit']) {
            const project = config.projects.find((p) => p.name === engine);
            assert.ok(project, `${name}: the ${engine} project is missing`);
            assert.equal(project.testIgnore.test(MATRIX_SPEC), true, `${name}/${engine}: the matrix spec must be ignored`);
            assert.equal(project.testIgnore.test(SMOKE_SPEC), false, `${name}/${engine}: the hand-written specs must run`);
            assert.equal(project.testIgnore.test(CONTRACT_SPEC), false, `${name}/${engine}: the contract specs must run`);
            assert.equal(project.testIgnore.test(SMOKE_IN_A_MATRIX_DIR), false, `${name}/${engine}: a checkout path must not decide what runs`);
        }
    }
});

// Bug caught: the same unanchored pattern on the matrix project, which would pull the
// hand-written specs into the matrix run (and run them a second time) whenever the checkout
// sits under a `matrix` directory.
test('the matrix project runs the matrix specs and nothing else', () => {
    for (const [name, config] of CONFIGS) {
        const project = config.projects.find((p) => p.name === 'matrix');
        assert.ok(project, `${name}: the matrix project is missing`);
        assert.equal(project.testMatch.test(MATRIX_SPEC), true, `${name}: the matrix spec must run`);
        assert.equal(project.testMatch.test(SMOKE_SPEC), false, `${name}: only the matrix directory belongs here`);
        assert.equal(project.testMatch.test(SMOKE_IN_A_MATRIX_DIR), false, `${name}: a checkout path must not decide what runs`);
        assert.equal(project.fullyParallel, true, `${name}: the matrix project splits its single spec file across workers`);
    }
});

// Bug caught: a local config drifting onto the shared 4173 port, which would silently reuse a
// server started from another checkout and test the wrong tree (testing.md's port rule).
test('a local config, when there is one, runs on its own port', (t) => {
    if (!local) return t.skip('no local config in this checkout');
    assert.equal(shared.webServer.port, 4173);
    assert.notEqual(local.webServer.port, shared.webServer.port);
    assert.equal(local.use.baseURL, `http://localhost:${local.webServer.port}`);
});
