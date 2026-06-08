/**
 * Excel Parser
 *
 * Parses Excel test cases and converts to structured format
 *
 * Excel Format:
 * | Test ID | Test Case | Description | Steps | Expected Result | Priority |
 */

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

class ExcelParser {
  /**
   * Parse Excel file and extract test cases
   * @param {string} filePath - Path to Excel file
   * @returns {Object} Parsed test data
   */
  parseExcel(filePath) {
    try {
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rawData = XLSX.utils.sheet_to_json(worksheet);

      if (rawData.length === 0) {
        return {
          success: false,
          error: 'No data found in Excel file',
        };
      }

      const testCases = this.normalizeTestCases(rawData);

      return {
        success: true,
        fileName: path.basename(filePath),
        sheetName,
        testCases,
        totalCases: testCases.length,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Normalize test cases from Excel data
   * @param {Array} rawData - Raw data from Excel
   * @returns {Array} Normalized test cases
   */
  normalizeTestCases(rawData) {
    const testCases = [];

    for (const row of rawData) {
      // Support multiple column naming conventions
      const testCase = {
        id: this.getValue(row, ['Test ID', 'TestCaseID', 'ID', 'id', 'test_id']),
        name: this.getValue(row, ['Test Case', 'TestCase', 'Name', 'name', 'test_name']),
        description: this.getValue(row, ['Description', 'Desc', 'description']),
        steps: this.parseSteps(this.getValue(row, ['Steps', 'Step', 'steps', 'test_steps'])),
        expectedResult: this.getValue(row, ['Expected Result', 'Expected', 'expected_result', 'expected']),
        priority: this.getValue(row, ['Priority', 'priority']) || 'medium',
        url: this.getValue(row, ['URL', 'url', 'test_url']),
        selector: this.getValue(row, ['Selector', 'selector', 'element_selector']),
        action: this.getValue(row, ['Action', 'action', 'test_action']),
        testData: this.getValue(row, ['Test Data', 'Data', 'test_data']),
        tags: this.parseTags(this.getValue(row, ['Tags', 'tag', 'tags'])),
      };

      // Only include if has name or steps
      if (testCase.name || (testCase.steps && testCase.steps.length > 0)) {
        testCases.push(testCase);
      }
    }

    return testCases;
  }

  /**
   * Get value from row with multiple possible keys
   * @param {Object} row - Data row
   * @param {Array} keys - Possible keys to try
   * @returns {string} Value or empty string
   */
  getValue(row, keys) {
    for (const key of keys) {
      if (row[key] !== undefined) {
        return String(row[key]).trim();
      }
    }
    return '';
  }

  /**
   * Parse steps from string
   * @param {string} stepsString - Steps string
   * @returns {Array} Parsed steps
   */
  parseSteps(stepsString) {
    if (!stepsString) return [];

    // Try different separators
    const separators = ['\n\n', '\n', '|', ';'];

    for (const sep of separators) {
      if (stepsString.includes(sep)) {
        return stepsString
          .split(sep)
          .map(s => s.trim())
          .filter(s => s.length > 0);
      }
    }

    // Single step
    return [stepsString];
  }

  /**
   * Parse tags from string
   * @param {string} tagsString - Tags string
   * @returns {Array} Parsed tags
   */
  parseTags(tagsString) {
    if (!tagsString) return [];

    return tagsString
      .split(',')
      .map(t => t.trim())
      .filter(t => t.length > 0);
  }

  /**
   * Generate test template for Playwright
   * @param {Object} testCase - Test case object
   * @returns {string} Generated test code
   */
  generateTestTemplate(testCase) {
    const { id, name, description, steps, expectedResult, url, selector, action, testData } = testCase;

    let test = `import { test, expect } from '@playwright/test';\n\n`;

    // Test description
    test += `/**\n`;
    if (id) test += ` * Test ID: ${id}\n`;
    if (description) test += ` * Description: ${description}\n`;
    test += ` */\n`;

    // Test function
    const sanitizedName = name.replace(/[^a-zA-Z0-9]/g, '_') || 'test';
    test += `test('${sanitizedName}', async ({ page }) => {\n`;

    // Navigate to URL
    if (url) {
      test += `  // Navigate to test page\n`;
      test += `  await page.goto('${url}');\n\n`;
    }

    // Execute steps
    if (steps && steps.length > 0) {
      test += `  // Execute test steps\n`;
      steps.forEach((step, index) => {
        test += `  // Step ${index + 1}: ${step}\n`;
        test += `  // TODO: Implement step ${index + 1}\n\n`;
      });
    }

    // If action and selector provided, generate action code
    if (action && selector) {
      test += `  // Perform action\n`;
      test += this.generateActionCode(action, selector, testData);
      test += `\n`;
    }

    // Expected result
    if (expectedResult) {
      test += `  // Verify expected result\n`;
      test += `  // Expected: ${expectedResult}\n`;
      test += `  // TODO: Add assertion\n`;
    }

    test += `});\n`;

    return test;
  }

  /**
   * Generate action code based on action type
   * @param {string} action - Action type
   * @param {string} selector - CSS selector
   * @param {string} testData - Test data
   * @returns {string} Generated action code
   */
  generateActionCode(action, selector, testData) {
    const actionLower = action.toLowerCase();

    switch (actionLower) {
      case 'click':
        return `  await page.click('${selector}');`;

      case 'fill':
      case 'input':
      case 'type':
        return `  await page.fill('${selector}', '${testData || ''}');`;

      case 'select':
        return `  await page.selectOption('${selector}', '${testData || ''}');`;

      case 'check':
        return `  await page.check('${selector}');`;

      case 'uncheck':
        return `  await page.uncheck('${selector}');`;

      case 'hover':
        return `  await page.hover('${selector}');`;

      case 'wait':
        return `  await page.waitForSelector('${selector}');`;

      case 'screenshot':
        return `  await page.screenshot({ path: 'screenshot-${Date.now()}.png' });`;

      case 'gettext':
      case 'get_text':
        return `  const text = await page.textContent('${selector}');`;

      case 'assert':
      case 'verify':
        return `  await expect(page.locator('${selector}')).toBeVisible();`;

      default:
        return `  // Unknown action: ${action}\n  // TODO: Implement custom action`;
    }
  }

  /**
   * Export test cases to JSON
   * @param {Object} parsedData - Parsed Excel data
   * @param {string} outputPath - Output file path
   * @returns {Object} Result
   */
  exportToJSON(parsedData, outputPath) {
    try {
      const json = JSON.stringify(parsedData, null, 2);
      fs.writeFileSync(outputPath, json, 'utf8');
      return { success: true, outputPath };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Create sample Excel template
   * @param {string} outputPath - Output path
   * @returns {Object} Result
   */
  createTemplate(outputPath) {
    try {
      const template = [
        {
          'Test ID': 'TC001',
          'Test Case': 'User Login',
          'Description': 'Verify user can login with valid credentials',
          'URL': 'https://example.com/login',
          'Action': 'fill',
          'Selector': '#username',
          'Test Data': 'testuser@example.com',
          'Steps': 'Enter username | Enter password | Click login button',
          'Expected Result': 'User is redirected to dashboard',
          'Priority': 'high',
          'Tags': 'auth,smoke',
        },
        {
          'Test ID': 'TC002',
          'Test Case': 'Search Functionality',
          'Description': 'Verify search returns relevant results',
          'URL': 'https://example.com',
          'Action': 'fill',
          'Selector': '#search',
          'Test Data': 'test query',
          'Steps': 'Enter search term | Click search button | Verify results',
          'Expected Result': 'Search results are displayed',
          'Priority': 'medium',
          'Tags': 'search',
        },
      ];

      const worksheet = XLSX.utils.json_to_sheet(template);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Test Cases');
      XLSX.writeFile(workbook, outputPath);

      return { success: true, outputPath };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = ExcelParser;
