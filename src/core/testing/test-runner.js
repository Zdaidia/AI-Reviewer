/**
 * Test Runner
 *
 * Runs Playwright tests and collects results
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

class TestRunner {
  constructor() {
    this.runningTests = new Map();
  }

  /**
   * Run test file or directory
   * @param {string} target - Test file or directory path
   * @param {Object} options - Run options
   * @returns {Object} Test run result
   */
  async run(target, options = {}) {
    const {
      headed = false,
      browser = 'chromium',
      reporter = 'list',
      outputFile = null,
      onOutput = null,
      onResult = null,
    } = options;

    const testId = this.generateTestId();

    try {
      // Build command
      const cmd = 'npx';
      const args = this.buildCommandArgs(target, {
        headed,
        browser,
        reporter,
        outputFile,
      });

      // Spawn process
      const process = spawn(cmd, args, {
        cwd: path.dirname(target),
        shell: true,
        env: { ...process.env, FORCE_COLOR: '1' },
      });

      // Store test info
      this.runningTests.set(testId, {
        process,
        target,
        startTime: Date.now(),
        status: 'running',
      });

      const outputBuffer = [];
      let result = null;

      // Handle stdout
      process.stdout.on('data', (data) => {
        const output = data.toString();
        outputBuffer.push({ type: 'stdout', data: output, timestamp: Date.now() });

        if (onOutput) {
          onOutput(testId, { type: 'stdout', data: output });
        }

        // Try to parse test results from output
        const parsed = this.parseTestOutput(output);
        if (parsed) {
          result = { ...result, ...parsed };
        }
      });

      // Handle stderr
      process.stderr.on('data', (data) => {
        const output = data.toString();
        outputBuffer.push({ type: 'stderr', data: output, timestamp: Date.now() });

        if (onOutput) {
          onOutput(testId, { type: 'stderr', data: output });
        }
      });

      // Handle process exit
      return new Promise((resolve) => {
        process.on('close', (code) => {
          const endTime = Date.now();
          const duration = endTime - (this.runningTests.get(testId)?.startTime || endTime);

          const finalResult = result || this.parseFinalResult(outputBuffer);
          finalResult.exitCode = code;
          finalResult.duration = duration;
          finalResult.success = code === 0;

          this.runningTests.delete(testId);

          if (onResult) {
            onResult(testId, finalResult);
          }

          resolve({
            success: code === 0,
            testId,
            result: finalResult,
            output: outputBuffer,
          });
        });
      });
    } catch (error) {
      this.runningTests.delete(testId);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Build command arguments for Playwright
   * @param {string} target - Test target
   * @param {Object} options - Options
   * @returns {Array} Command args
   */
  buildCommandArgs(target, options) {
    const args = ['playwright', 'test', target];

    if (options.headed) {
      args.push('--headed');
    }

    if (options.browser) {
      args.push('--project', options.browser);
    }

    if (options.reporter) {
      args.push('--reporter', options.reporter);
    }

    if (options.outputFile) {
      args.push('--output', options.outputFile);
    }

    return args;
  }

  /**
   * Parse test output for results
   * @param {string} output - Test output
   * @returns {Object|null} Parsed result
   */
  parseTestOutput(output) {
    const results = {};

    // Parse passed/failed counts
    const passedMatch = output.match(/(\d+) passed/);
    if (passedMatch) results.passed = parseInt(passedMatch[1]);

    const failedMatch = output.match(/(\d+) failed/);
    if (failedMatch) results.failed = parseInt(failedMatch[1]);

    const skippedMatch = output.match(/(\d+) skipped/);
    if (skippedMatch) results.skipped = parseInt(skippedMatch[1]);

    // Parse duration
    const durationMatch = output.match(/completed in ([\d.]+[mhs]+)/);
    if (durationMatch) results.durationText = durationMatch[1];

    return Object.keys(results).length > 0 ? results : null;
  }

  /**
   * Parse final result from output buffer
   * @param {Array} outputBuffer - Output buffer
   * @returns {Object} Parsed result
   */
  parseFinalResult(outputBuffer) {
    const result = {
      passed: 0,
      failed: 0,
      skipped: 0,
      total: 0,
    };

    const fullOutput = outputBuffer.map(o => o.data).join('\n');

    // Count from output
    const passedMatch = fullOutput.match(/(\d+) passed/);
    if (passedMatch) result.passed = parseInt(passedMatch[1]);

    const failedMatch = fullOutput.match(/(\d+) failed/);
    if (failedMatch) result.failed = parseInt(failedMatch[1]);

    const skippedMatch = fullOutput.match(/(\d+) skipped/);
    if (skippedMatch) result.skipped = parseInt(skippedMatch[1]);

    result.total = result.passed + result.failed + result.skipped;

    return result;
  }

  /**
   * Stop running test
   * @param {string} testId - Test ID
   * @returns {Object} Result
   */
  stop(testId) {
    const testInfo = this.runningTests.get(testId);

    if (!testInfo) {
      return { success: false, error: 'Test not found' };
    }

    try {
      const kill = require('tree-kill');
      kill(testInfo.process.pid, 'SIGTERM');

      this.runningTests.delete(testId);

      return { success: true, message: 'Test stopped' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get test status
   * @param {string} testId - Test ID
   * @returns {Object|null} Test status
   */
  getStatus(testId) {
    const testInfo = this.runningTests.get(testId);

    if (!testInfo) {
      return { running: false };
    }

    return {
      running: true,
      target: testInfo.target,
      startTime: testInfo.startTime,
      uptime: Date.now() - testInfo.startTime,
    };
  }

  /**
   * Get all running tests
   * @returns {Array} Running tests
   */
  getRunningTests() {
    return Array.from(this.runningTests.entries()).map(([testId, info]) => ({
      testId,
      target: info.target,
      startTime: info.startTime,
      uptime: Date.now() - info.startTime,
    }));
  }

  /**
   * Generate unique test ID
   * @returns {string} Test ID
   */
  generateTestId() {
    return `test-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`;
  }

  /**
   * Check if Playwright is installed
   * @param {string} projectPath - Project path
   * @returns {boolean} True if installed
   */
  isPlaywrightInstalled(projectPath) {
    const packageJsonPath = path.join(projectPath, 'package.json');

    if (!fs.existsSync(packageJsonPath)) {
      return false;
    }

    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
      return !!deps.playwright;
    } catch {
      return false;
    }
  }

  /**
   * Install Playwright in project
   * @param {string} projectPath - Project path
   * @returns {Promise<Object>} Result
   */
  async installPlaywright(projectPath) {
    return new Promise((resolve) => {
      const process = spawn('npm', ['install', '--save-dev', '@playwright/test'], {
        cwd: projectPath,
        shell: true,
      });

      let output = '';

      process.stdout.on('data', (data) => {
        output += data.toString();
      });

      process.stderr.on('data', (data) => {
        output += data.toString();
      });

      process.on('close', (code) => {
        resolve({
          success: code === 0,
          message: code === 0 ? 'Playwright installed successfully' : 'Failed to install Playwright',
          output,
        });
      });
    });
  }
}

module.exports = TestRunner;
