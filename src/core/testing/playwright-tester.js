/**
 * Playwright Tester Module
 *
 * Handles Playwright-based E2E testing for any running project
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class PlaywrightTester {
  constructor() {
    this.runningTests = new Map();
    this.testResults = new Map();
    this.toolDir = path.resolve(__dirname, '../../..');
  }

  /**
   * Generate Playwright test from URL
   * @param {string} url - Application URL to test
   * @param {Object} options - Test options
   * @returns {Object} Result
   */
  generateTestFromUrl(url, options = {}) {
    try {
      const {
        testName = 'Basic E2E Test',
        testType = 'basic', // basic, navigation, forms, full
        projectPath = null,
      } = options;

      console.log('[Playwright] Generating test for URL:', url);

      // Select template
      const template = this.getTemplate(testType);

      // Generate test file
      const testFileName = `test-${Date.now()}.spec.js`;
      const testFilePath = path.join(this.toolDir, 'tests', 'e2e', testFileName);

      // Replace placeholders
      let testContent = template.replace(/\{\{URL\}\}/g, url);
      testContent = testContent.replace(/\{\{TEST_NAME\}\}/g, testName);

      // Write test file
      fs.writeFileSync(testFilePath, testContent, 'utf8');

      return {
        success: true,
        testPath: testFilePath,
        testName,
        message: `Test generated: ${testFileName}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Run Playwright test
   * @param {string} testPath - Path to test file
   * @param {Object} options - Test options
   * @returns {Object} Result
   */
  async runTest(testPath, options = {}) {
    const {
      url = null,
      browser = 'chromium',
      headed = false,
      onOutput = null,
      onResult = null,
    } = options;

    const testId = `test-${Date.now()}`;

    try {
      console.log('[Playwright] Running test:', testPath);
      console.log('[Playwright] Browser:', browser);
      console.log('[Playwright] Headed:', headed);

      // Build Playwright command
      const playwrightArgs = [
        'playwright',
        'test',
        testPath,
        '--project=' + browser,
        '--reporter=json',
        '--reporter=list',
      ];

      if (headed) {
        playwrightArgs.push('--headed');
      }

      if (url) {
        playwrightArgs.push('--', '--env', `BASE_URL=${url}`);
      }

      console.log('[Playwright] Command:', playwrightArgs.join(' '));

      // Spawn Playwright process
      const testProcess = spawn('npx', playwrightArgs, {
        cwd: this.toolDir,
        shell: true,
        env: {
          ...process.env,
          BASE_URL: url || 'http://localhost:3000',
          FORCE_COLOR: '1',
        },
      });

      // Store test info
      this.runningTests.set(testId, {
        process: testProcess,
        testPath,
        browser,
        startTime: Date.now(),
      });

      const outputBuffer = [];

      // Handle stdout
      testProcess.stdout.on('data', (data) => {
        const output = data.toString();
        outputBuffer.push({ type: 'stdout', data: output, timestamp: Date.now() });
        console.log('[Playwright STDOUT]:', output.substring(0, 200));

        if (onOutput) {
          onOutput(testId, {
            type: 'stdout',
            data: output,
          });
        }
      });

      // Handle stderr
      testProcess.stderr.on('data', (data) => {
        const output = data.toString();
        outputBuffer.push({ type: 'stderr', data: output, timestamp: Date.now() });
        console.log('[Playwright STDERR]:', output.substring(0, 200));

        if (onOutput) {
          onOutput(testId, {
            type: 'stderr',
            data: output,
          });
        }
      });

      // Handle close
      testProcess.on('close', (code) => {
        console.log(`[Playwright] Test closed with code: ${code}`);

        // Parse results
        const result = this.parseTestResults(outputBuffer);

        if (onResult) {
          onResult(testId, result);
        }

        this.testResults.set(testId, result);
        this.runningTests.delete(testId);
      });

      return {
        success: true,
        testId,
        message: 'Test started',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Stop test
   * @param {string} testId - Test ID
   * @returns {Object} Result
   */
  stopTest(testId) {
    const testInfo = this.runningTests.get(testId);

    if (!testInfo) {
      return {
        success: false,
        error: 'Test not found',
      };
    }

    try {
      testInfo.process.kill('SIGTERM');
      this.runningTests.delete(testId);

      return {
        success: true,
        message: 'Test stopped',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get test status
   * @param {string} testId - Test ID
   * @returns {Object} Status
   */
  getTestStatus(testId) {
    const running = this.runningTests.get(testId);
    const result = this.testResults.get(testId);

    if (running) {
      return {
        status: 'running',
        startTime: running.startTime,
        browser: running.browser,
      };
    }

    if (result) {
      return {
        status: 'completed',
        result,
      };
    }

    return {
      status: 'not found',
    };
  }

  /**
   * Get running tests
   * @returns {Array} Running tests
   */
  getRunningTests() {
    return Array.from(this.runningTests.entries()).map(([testId, info]) => ({
      testId,
      testPath: info.testPath,
      browser: info.browser,
      startTime: info.startTime,
    }));
  }

  /**
   * Parse test results from output
   * @param {Array} outputBuffer - Output buffer
   * @returns {Object} Parsed results
   */
  parseTestResults(outputBuffer) {
    let passed = 0;
    let failed = 0;
    let skipped = 0;
    const errors = [];

    for (const output of outputBuffer) {
      const text = output.data;

      // Parse JSON reporter output
      if (text.includes('"status":"passed"')) {
        passed++;
      } else if (text.includes('"status":"failed"')) {
        failed++;
        // Extract error message
        const errorMatch = text.match(/"error":\{[^}]*"message":"([^"]+)"/);
        if (errorMatch) {
          errors.push(errorMatch[1]);
        }
      } else if (text.includes('"status":"skipped"')) {
        skipped++;
      }
    }

    return {
      passed,
      failed,
      skipped,
      total: passed + failed + skipped,
      success: failed === 0,
      errors,
      reportPath: path.join(this.toolDir, 'test-results', 'html', 'index.html'),
    };
  }

  /**
   * Get test template
   * @param {string} testType - Test type
   * @returns {string} Template content
   */
  getTemplate(testType) {
    const templates = {
      basic: this.getBasicTemplate(),
      navigation: this.getNavigationTemplate(),
      forms: this.getFormsTemplate(),
    };

    return templates[testType] || templates.basic;
  }

  /**
   * Basic test template
   */
  getBasicTemplate() {
    return `const { test, expect } = require('@playwright/test');

test.describe('Basic E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('{{URL}}');
    await page.waitForTimeout(3000);
  });

  test('should load the page', async ({ page }) => {
    const body = page.locator('body');
    await expect(body).toBeVisible();
    console.log('✓ Page loaded successfully');
  });

  test('should have no critical errors', async ({ page }) => {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.waitForTimeout(5000);

    const criticalErrors = errors.filter(err =>
      err.includes('Uncaught') ||
      err.includes('TypeError') ||
      err.includes('ReferenceError')
    );

    expect(criticalErrors.length).toBe(0);
    console.log('✓ No critical errors');
  });
});`;
  }

  /**
   * Navigation test template
   */
  getNavigationTemplate() {
    return `const { test, expect } = require('@playwright/test');

test.describe('Navigation Tests', () => {
  test('should handle navigation', async ({ page }) => {
    await page.goto('{{URL}}');
    await page.waitForTimeout(3000);

    // Find interactive elements
    const buttons = await page.locator('button, a, [role="button"]').count();

    if (buttons > 0) {
      console.log(\`Found \${buttons} interactive elements\`);

      // Click first button
      const firstButton = page.locator('button, a, [role="button"]').first();
      await firstButton.click();
      await page.waitForTimeout(2000);

      console.log('✓ Navigation click successful');
    } else {
      console.log('⚠ No interactive elements found');
    }
  });
});`;
  }

  /**
   * Form test template
   */
  getFormsTemplate() {
    return `const { test, expect } = require('@playwright/test');

test.describe('Form Tests', () => {
  test('should handle form inputs', async ({ page }) => {
    await page.goto('{{URL}}');
    await page.waitForTimeout(3000);

    // Find input fields
    const inputs = page.locator('input[type="text"], input[type="email"], textarea');
    const count = await inputs.count();

    if (count > 0) {
      console.log(\`Found \${count} input fields\`);

      // Fill first input
      await inputs.first().fill('Test Value');
      await page.waitForTimeout(1000);

      console.log('✓ Form input successful');
    } else {
      console.log('⚠ No input fields found');
    }
  });
});`;
  }
}

module.exports = PlaywrightTester;
