import { defineConfig, devices } from '@playwright/test';

/** test/browser/matrix/, spelled for both path separators; see the projects below. */
const MATRIX_DIR = /[\\/]test[\\/]browser[\\/]matrix[\\/]/;
const MATRIX_SPECS = /[\\/]test[\\/]browser[\\/]matrix[\\/].*\.spec\.mjs$/;

export default defineConfig({
  testDir: 'test/browser',
  timeout: 20_000,
  expect: { timeout: 5_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: 'http://localhost:4173', viewport: { width: 900, height: 500 } },
  webServer: { command: 'node test/browser/server.mjs', port: 4173, reuseExistingServer: !process.env.CI },
  projects: [
    // #877: the generated combination matrix runs on chromium only and is kept out of
    // the three engine projects -- it drives 128 configurations through a ten-stage
    // script, which is worth one engine, not three.
    //
    // Both patterns are matched against the spec's ABSOLUTE path, so they name the
    // directory from the repository root down: a bare /matrix\// would also fire on a
    // checkout that happens to live under a directory called matrix, and the engine
    // projects would then quietly ignore every spec in the suite.
    { name: 'chromium', testIgnore: MATRIX_DIR, use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', testIgnore: MATRIX_DIR, use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', testIgnore: MATRIX_DIR, use: { ...devices['Desktop Safari'] } },
    // fullyParallel lets the workers split the matrix's single spec file test by test;
    // without it Playwright hands a whole file to one worker and --workers=2 runs one
    // worker idle. The three engine projects keep the default (file-level) parallelism.
    { name: 'matrix', testMatch: MATRIX_SPECS, fullyParallel: true, use: { ...devices['Desktop Chrome'] } },
  ],
});
