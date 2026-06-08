/**
 * Test Tool
 *
 * Wraps the existing TestingManager module for Agent use.
 * Generates and runs tests, imports Excel test cases.
 */

const BaseTool = require('./base-tool');

class TestTool extends BaseTool {
  constructor(testingManager) {
    super(
      'test',
      'Generate, run, and manage tests. Supports Excel test case import, test generation, and running tests with Playwright.',
      [
        {
          name: 'action',
          type: 'string',
          description: 'Action to perform: "import", "generate", "run", "stop", "create_template"',
          required: true
        },
        {
          name: 'testPath',
          type: 'string',
          description: 'Path to test file or Excel file',
          required: false
        },
        {
          name: 'options',
          type: 'object',
          description: 'Action-specific options',
          required: false
        }
      ]
    );
    this.testingManager = testingManager;
  }

  /**
   * Execute test operation
   */
  async execute(params, context) {
    const { action, testPath, options = {} } = params;

    // Validate
    const validation = this.validate(params);
    if (!validation.valid) {
      return this.error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    try {
      switch (action) {
        case 'import':
          return await this.importExcel(testPath, context);
        case 'generate':
          return await this.generateTest(testPath, options, context);
        case 'run':
          return await this.runTest(testPath, options, context);
        case 'stop':
          return await this.stopTest(options.testId, context);
        case 'create_template':
          return await this.createTemplate(testPath, context);
        default:
          return this.error(`Unknown action: ${action}`);
      }
    } catch (error) {
      return this.error(`Test operation failed: ${error.message}`);
    }
  }

  /**
   * Import Excel test cases
   */
  async importExcel(excelPath, context) {
    if (!excelPath) {
      return this.error('excelPath is required for import action');
    }

    const result = this.testingManager.parseExcel(excelPath);

    if (result.success) {
      if (context) {
        context.importedTestCases = result.testCases;
        context.lastExcelPath = excelPath;
      }

      return this.success({
        action: 'import',
        testCaseCount: result.testCases?.length || 0,
        testCases: result.testCases,
        excelPath
      });
    } else {
      return this.error(result.error || 'Failed to import Excel');
    }
  }

  /**
   * Generate test cases
   */
  async generateTest(excelPath, options, context) {
    if (!excelPath) {
      return this.error('excelPath is required for generate action');
    }

    const result = this.testingManager.generateTest(excelPath, options);

    if (result.success) {
      if (context) {
        context.generatedTestPath = result.testPath;
        context.lastTestOptions = options;
      }

      return this.success({
        action: 'generate',
        testPath: result.testPath,
        framework: result.framework,
        testCaseCount: result.testCaseCount || 0
      });
    } else {
      return this.error(result.error || 'Failed to generate test');
    }
  }

  /**
   * Run tests
   */
  async runTest(testPath, options, context) {
    if (!testPath) {
      return this.error('testPath is required for run action');
    }

    // Setup output handlers
    const onOutput = (testId, output) => {
      if (context && context.onTestOutput) {
        context.onTestOutput({ testId, output });
      }
    };

    const onResult = (testId, result) => {
      if (context && context.onTestResult) {
        context.onTestResult({ testId, result });
      }
    };

    const runOptions = {
      ...options,
      onOutput,
      onResult,
      generateReport: true,
      outputDir: options.reportDir || require('path').join(require('path').dirname(testPath), 'test-reports')
    };

    const result = await this.testingManager.runTest(testPath, runOptions);

    if (result.success) {
      if (context) {
        context.runningTests = context.runningTests || [];
        context.runningTests.push({
          testId: result.testId,
          testPath,
          startTime: new Date().toISOString()
        });
      }

      return this.success({
        action: 'run',
        testId: result.testId,
        testPath,
        status: 'running',
        message: 'Test started'
      });
    } else {
      return this.error(result.error || 'Failed to run test');
    }
  }

  /**
   * Stop a running test
   */
  async stopTest(testId, context) {
    if (!testId) {
      return this.error('testId is required for stop action (options.testId)');
    }

    const result = this.testingManager.stopTest(testId);

    if (result.success) {
      if (context && context.runningTests) {
        context.runningTests = context.runningTests.filter(t => t.testId !== testId);
      }

      return this.success({
        action: 'stop',
        testId,
        message: 'Test stopped'
      });
    } else {
      return this.error(result.error || 'Failed to stop test');
    }
  }

  /**
   * Create test template
   */
  async createTemplate(outputPath, context) {
    const result = this.testingManager.createTemplate(outputPath);

    if (result.success) {
      return this.success({
        action: 'create_template',
        templatePath: result.templatePath,
        message: 'Test template created'
      });
    } else {
      return this.error(result.error || 'Failed to create template');
    }
  }

  /**
   * Get test status
   */
  getTestStatus(testId) {
    const status = this.testingManager.getTestStatus(testId);
    return status.success ? status : { success: false, error: status.error };
  }

  /**
   * Get running tests
   */
  getRunningTests() {
    const result = this.testingManager.getRunningTests();
    return result.success ? result.tests : [];
  }
}

module.exports = TestTool;
