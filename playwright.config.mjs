import { defineConfig, devices } from '@playwright/test';

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
    // the three engine projects -- it drives 128 configurations through a nine-stage
    // script, which is worth one engine, not three.
    { name: 'chromium', testIgnore: /matrix\//, use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', testIgnore: /matrix\//, use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', testIgnore: /matrix\//, use: { ...devices['Desktop Safari'] } },
    // fullyParallel lets the workers split the matrix's single spec file test by test;
    // without it Playwright hands a whole file to one worker and --workers=2 runs one
    // worker idle. The three engine projects keep the default (file-level) parallelism.
    { name: 'matrix', testMatch: /matrix\/.*\.spec\.mjs/, fullyParallel: true, use: { ...devices['Desktop Chrome'] } },
  ],
});
