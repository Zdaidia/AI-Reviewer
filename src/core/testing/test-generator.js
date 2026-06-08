/**
 * Test Generator
 *
 * Generates Playwright test scripts from parsed Excel test cases
 */

const fs = require('fs');
const path = require('path');
const ExcelParser = require('./excel-parser');

class TestGenerator {
  constructor() {
    this.excelParser = new ExcelParser();
    this.templates = {
      javascript: this.getJavaScriptTemplate(),
      typescript: this.getTypeScriptTemplate(),
    };
  }

  /**
   * Generate test file from Excel file
   * @param {string} excelPath - Path to Excel file
   * @param {Object} options - Generation options
   * @returns {Object} Result
   */
  generateFromExcel(excelPath, options = {}) {
    const {
      outputDir = null,
      language = 'typescript',
      singleFile = true,
      includeAssertions = true,
      includeComments = true,
    } = options;

    try {
      // Parse Excel
      const parsed = this.excelParser.parseExcel(excelPath);

      if (!parsed.success) {
        return parsed;
      }

      // Generate test code
      const testCode = this.generateTestCode(parsed.testCases, {
        language,
        includeAssertions,
        includeComments,
      });

      // Determine output path
      let outputPath;
      if (outputDir) {
        const fileName = path.basename(excelPath, path.extname(excelPath));
        const ext = language === 'typescript' ? '.spec.ts' : '.spec.js';
        outputPath = path.join(outputDir, fileName + ext);
      } else {
        outputPath = excelPath.replace(/\.(xlsx|xls)$/i, '.spec.' + (language === 'typescript' ? 'ts' : 'js'));
      }

      // Write test file
      fs.writeFileSync(outputPath, testCode, 'utf8');

      return {
        success: true,
        outputPath,
        testCases: parsed.testCases.length,
        language,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Generate test code from test cases
   * @param {Array} testCases - Array of test cases
   * @param {Object} options - Generation options
   * @returns {string} Generated test code
   */
  generateTestCode(testCases, options = {}) {
    const { language = 'typescript', includeAssertions = true, includeComments = true } = options;

    const imports = this.generateImports(language, testCases);
    const tests = testCases.map(tc => this.generateSingleTest(tc, options)).join('\n\n');

    return `${imports}\n${tests}`;
  }

  /**
   * Generate import statements
   * @param {string} language - Target language
   * @param {Array} testCases - Test cases
   * @returns {string} Import statements
   */
  generateImports(language, testCases) {
    if (language === 'typescript') {
      return `import { test, expect } from '@playwright/test';`;
    }
    return `const { test, expect } = require('@playwright/test');`;
  }

  /**
   * Generate single test
   * @param {Object} testCase - Test case object
   * @param {Object} options - Options
   * @returns {string} Test code
   */
  generateSingleTest(testCase, options = {}) {
    const { id, name, description, steps, expectedResult, url, selector, action, testData, priority, tags } = testCase;
    const { includeAssertions = true, includeComments = true } = options;

    let code = '';

    // JSDoc comment
    if (includeComments) {
      code += `/**\n`;
      if (id) code += ` * Test ID: ${id}\n`;
      if (description) code += ` * Description: ${description}\n`;
      if (priority) code += ` * Priority: ${priority}\n`;
      if (tags && tags.length > 0) code += ` * Tags: ${tags.join(', ')}\n`;
      code += ` */\n`;
    }

    // Test declaration
    const sanitizedName = this.sanitizeTestName(name || id || 'unnamed_test');
    const displayName = name || id || 'Unnamed Test';

    code += `test('${displayName}', async ({ page }) => {\n`;

    // Test body
    if (url) {
      code += `  // Navigate to URL\n`;
      code += `  await page.goto('${url}');\n\n`;
    }

    // Steps
    if (steps && steps.length > 0) {
      steps.forEach((step, index) => {
        code += `  // Step ${index + 1}: ${step}\n`;
        code += `  // TODO: Implement step\n`;
        if (index < steps.length - 1 || expectedResult) code += `\n`;
      });
    }

    // Action if provided
    if (action && selector) {
      code += `  // Perform action: ${action}\n`;
      code += `  ${this.generateActionCode(action, selector, testData)}\n\n`;
    }

    // Expected result / assertions
    if (includeAssertions && expectedResult) {
      code += `  // Verify expected result\n`;
      code += `  // Expected: ${expectedResult}\n`;
      code += `  await expect(page.locator('body')).toBeVisible();\n`;
    }

    code += `});`;

    return code;
  }

  /**
   * Generate action code
   * @param {string} action - Action type
   * @param {string} selector - Selector
   * @param {string} testData - Test data
   * @returns {string} Action code
   */
  generateActionCode(action, selector, testData) {
    const actionLower = action.toLowerCase().replace(/\s+/g, '');
    const data = testData ? `'${testData}'` : '';

    const actions = {
      click: `await page.click('${selector}');`,
      fill: `await page.fill('${selector}', ${data});`,
      type: `await page.type('${selector}', ${data});`,
      input: `await page.input('${selector}', ${data});`,
      select: `await page.selectOption('${selector}', ${data});`,
      check: `await page.check('${selector}');`,
      uncheck: `await page.uncheck('${selector}');`,
      hover: `await page.hover('${selector}');`,
      wait: `await page.waitForSelector('${selector}');`,
      waitFor: `await page.waitForSelector('${selector}');`,
      screenshot: `await page.screenshot({ path: '${selector}-${Date.now()}.png' });`,
      gettext: `const text = await page.textContent('${selector}');`,
      gettext: `const text = await page.textContent('${selector}');`,
      assert: `await expect(page.locator('${selector}')).toBeVisible();`,
      verify: `await expect(page.locator('${selector}')).toBeVisible();`,
      visible: `await expect(page.locator('${selector}')).toBeVisible();`,
      hidden: `await expect(page.locator('${selector}')).toBeHidden();`,
      enabled: `await expect(page.locator('${selector}')).toBeEnabled();`,
      disabled: `await expect(page.locator('${selector}')).toBeDisabled();`,
      text: `await expect(page.locator('${selector}')).toHaveText(${data});`,
      value: `await expect(page.locator('${selector}')).toHaveValue(${data});`,
    };

    return actions[actionLower] || `// TODO: Implement action '${action}'`;
  }

  /**
   * Sanitize test name
   * @param {string} name - Test name
   * @returns {string} Sanitized name
   */
  sanitizeTestName(name) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'unnamed_test';
  }

  /**
   * Get JavaScript template
   * @returns {string} Template
   */
  getJavaScriptTemplate() {
    return `const { test, expect } = require('@playwright/test');

test('example test', async ({ page }) => {
  await page.goto('https://example.com');
  await expect(page).toHaveTitle(/Example/);
});`;
  }

  /**
   * Get TypeScript template
   * @returns {string} Template
   */
  getTypeScriptTemplate() {
    return `import { test, expect } from '@playwright/test';

test('example test', async ({ page }) => {
  await page.goto('https://example.com');
  await expect(page).toHaveTitle(/Example/);
});`;
  }

  /**
   * Generate test suite config
   * @param {Object} options - Config options
   * @returns {string} Config file content
   */
  generateConfig(options = {}) {
    const {
      baseURL = '',
      timeout = 30000,
      retries = 0,
      headless = true,
      browser = 'chromium',
    } = options;

    const config = `import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: '${baseURL}',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: '${browser}',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
`;

    return config;
  }

  /**
   * Generate package.json scripts
   * @returns {Object} Scripts object
   */
  generateScripts() {
    return {
      'test': 'playwright test',
      'test:ui': 'playwright test --ui',
      'test:headed': 'playwright test --headed',
      'test:debug': 'playwright test --debug',
      'test:report': 'playwright show-report',
    };
  }
}

module.exports = TestGenerator;
