/**
 * Report Generator
 *
 * Generates test reports from test results
 */

const fs = require('fs');
const path = require('path');

class ReportGenerator {
  /**
   * Generate HTML report
   * @param {Object} testResult - Test result
   * @param {Object} options - Options
   * @returns {string} HTML report
   */
  generateHTMLReport(testResult, options = {}) {
    const { projectName = 'Test Report', logoUrl = null } = options;

    const { passed, failed, skipped, total, duration, output, testCases } = testResult;

    const passRate = total > 0 ? ((passed / total) * 100).toFixed(1) : 0;
    const timestamp = new Date().toISOString();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${projectName} - Test Report</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; }
    .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
    .header { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 20px; }
    .header h1 { color: #333; margin-bottom: 10px; }
    .timestamp { color: #666; font-size: 14px; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 20px; }
    .summary-card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .summary-card h3 { color: #666; font-size: 14px; margin-bottom: 10px; }
    .summary-card .value { font-size: 32px; font-weight: bold; }
    .passed { color: #10b981; }
    .failed { color: #ef4444; }
    .skipped { color: #f59e0b; }
    .total { color: #3b82f6; }
    .content { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .test-case { padding: 15px; border-left: 3px solid #e5e7eb; margin-bottom: 10px; background: #f9fafb; }
    .test-case.pass { border-left-color: #10b981; }
    .test-case.fail { border-left-color: #ef4444; }
    .test-case.skip { border-left-color: #f59e0b; }
    .test-case h4 { margin-bottom: 5px; }
    .progress-bar { width: 100%; height: 8px; background: #e5e7eb; border-radius: 4px; overflow: hidden; }
    .progress-fill { height: 100%; background: linear-gradient(90deg, #10b981 var(--pass), #ef4444 var(--pass), #ef4444 var(--pass-fail), #f59e0b var(--pass-fail)); }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${projectName}</h1>
      <p class="timestamp">Generated: ${new Date(timestamp).toLocaleString()}</p>
    </div>

    <div class="summary">
      <div class="summary-card">
        <h3>Total Tests</h3>
        <div class="value total">${total || 0}</div>
      </div>
      <div class="summary-card">
        <h3>Passed</h3>
        <div class="value passed">${passed || 0}</div>
      </div>
      <div class="summary-card">
        <h3>Failed</h3>
        <div class="value failed">${failed || 0}</div>
      </div>
      <div class="summary-card">
        <h3>Pass Rate</h3>
        <div class="value">${passRate}%</div>
      </div>
    </div>

    <div class="progress-bar" style="--pass: ${passRate}%; --pass-fail: ${passRate + ((failed || 0) / (total || 1) * 100)}%">
      <div class="progress-fill"></div>
    </div>

    <div class="content" style="margin-top: 20px;">
      <h2>Test Details</h2>
      ${this.generateTestCasesHTML(testCases || [])}
    </div>
  </div>
</body>
</html>`;
  }

  /**
   * Generate test cases HTML
   * @param {Array} testCases - Test cases
   * @returns {string} HTML
   */
  generateTestCasesHTML(testCases) {
    if (!testCases || testCases.length === 0) {
      return '<p>No test cases available.</p>';
    }

    return testCases.map(tc => `
      <div class="test-case ${tc.status || 'unknown'}">
        <h4>${tc.name || tc.id || 'Unnamed Test'}</h4>
        <p><strong>ID:</strong> ${tc.id || 'N/A'}</p>
        <p><strong>Status:</strong> ${tc.status || 'unknown'}</p>
        ${tc.description ? `<p><strong>Description:</strong> ${tc.description}</p>` : ''}
        ${tc.duration ? `<p><strong>Duration:</strong> ${tc.duration}ms</p>` : ''}
        ${tc.error ? `<p style="color: #ef4444;"><strong>Error:</strong> ${tc.error}</p>` : ''}
      </div>
    `).join('');
  }

  /**
   * Generate JSON report
   * @param {Object} testResult - Test result
   * @returns {string} JSON report
   */
  generateJSONReport(testResult) {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      summary: {
        total: testResult.total || 0,
        passed: testResult.passed || 0,
        failed: testResult.failed || 0,
        skipped: testResult.skipped || 0,
        passRate: testResult.total > 0 ? ((testResult.passed / testResult.total) * 100).toFixed(1) : 0,
        duration: testResult.duration || 0,
      },
      testCases: testResult.testCases || [],
    }, null, 2);
  }

  /**
   * Generate JUnit XML report
   * @param {Object} testResult - Test result
   * @returns {string} JUnit XML
   */
  generateJUnitReport(testResult) {
    const { total, passed, failed, duration, testCases } = testResult;
    const timestamp = new Date().toISOString();

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<testsuites name="Test Results" tests="${total || 0}" failures="${failed || 0}" time="${(duration || 0) / 1000}">\n`;
    xml += `  <testsuite name="Test Suite" tests="${total || 0}" failures="${failed || 0}" time="${(duration || 0) / 1000}" timestamp="${timestamp}">\n`;

    if (testCases) {
      testCases.forEach(tc => {
        xml += `    <testcase name="${tc.name || tc.id || 'unnamed'}" classname="test" time="${(tc.duration || 0) / 1000}">\n`;
        if (tc.status === 'failed' && tc.error) {
          xml += `      <failure message="${tc.error}">${tc.error}</failure>\n`;
        } else if (tc.status === 'skipped') {
          xml += `      <skipped/>\n`;
        }
        xml += `    </testcase>\n`;
      });
    }

    xml += `  </testsuite>\n`;
    xml += `</testsuites>`;

    return xml;
  }

  /**
   * Save report to file
   * @param {string} report - Report content
   * @param {string} filePath - Output file path
   * @returns {Object} Result
   */
  saveReport(report, filePath) {
    try {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(filePath, report, 'utf8');
      return { success: true, filePath };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Generate and save all report formats
   * @param {Object} testResult - Test result
   * @param {string} outputDir - Output directory
   * @param {Object} options - Options
   * @returns {Object} Result
   */
  generateAllReports(testResult, outputDir, options = {}) {
    const { projectName = 'Test Report' } = options;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const results = {};

    try {
      // HTML Report
      const htmlReport = this.generateHTMLReport(testResult, { projectName });
      const htmlPath = path.join(outputDir, `report-${timestamp}.html`);
      const htmlResult = this.saveReport(htmlReport, htmlPath);
      if (htmlResult.success) results.html = htmlPath;

      // JSON Report
      const jsonReport = this.generateJSONReport(testResult);
      const jsonPath = path.join(outputDir, `report-${timestamp}.json`);
      const jsonResult = this.saveReport(jsonReport, jsonPath);
      if (jsonResult.success) results.json = jsonPath;

      // JUnit Report
      const junitReport = this.generateJUnitReport(testResult);
      const junitPath = path.join(outputDir, `report-${timestamp}.junit.xml`);
      const junitResult = this.saveReport(junitReport, junitPath);
      if (junitResult.success) results.junit = junitPath;

      return {
        success: true,
        reports: results,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Open report in browser
   * @param {string} reportPath - Path to HTML report
   * @returns {Promise<Object>} Result
   */
  async openReport(reportPath) {
    try {
      const { open } = require('open');
      await open(reportPath);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = ReportGenerator;
