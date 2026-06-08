import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright Configuration for Dev Quality Inspector
 *
 * This configuration is used for testing any running project
 * Tests are generated dynamically based on user requirements
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30 * 1000,
  expect: {
    timeout: 5000
  },
  fullyParallel: false, // Run tests sequentially by default
  forbidOnly: !!process.env.CI,
  retries: 0, // No retries for manual testing
  workers: 1, // Single worker for stability
  reporter: [
    ['html', { outputFolder: 'test-results/html' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
    ['list']
  ],
  use: {
    // baseURL will be set dynamically when running tests
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off', // Disable video to avoid ffmpeg requirement
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        },
      },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    // Mobile viewports
    {
      name: 'Mobile Chrome',
      use: {
        ...devices['Pixel 5'],
        launchOptions: {
          executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        },
      },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },
    {
      name: 'iPad',
      use: { ...devices['iPad Pro'] },
    },
  ],

  // Note: global setup/teardown removed for JavaScript compatibility
});
