/**
 * Advanced Report Generator
 *
 * 生成详细的测试报告，包含：
 * - HTML 报告（交互式）
 * - 截图对比
 * - 差异热图
 * - 性能指标
 * - 趋势分析
 * - 导出多种格式
 */

const fs = require('fs');
const path = require('path');

class AdvancedReportGenerator {
  constructor() {
    this.templateDir = path.join(__dirname, '../../templates');
  }

  /**
   * 生成 HTML 测试报告
   * @param {Object} testResult - 测试结果
   * @param {string} outputPath - 输出路径
   * @returns {Promise<Object>} 生成结果
   */
  async generateHTMLReport(testResult, outputPath) {
    try {
      const html = this.buildHTMLReport(testResult);

      // 确保输出目录存在
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // 写入文件
      fs.writeFileSync(outputPath, html, 'utf8');

      return {
        success: true,
        reportPath: outputPath,
        format: 'html',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 构建 HTML 报告
   * @param {Object} testResult - 测试结果
   * @returns {string} HTML 内容
   */
  buildHTMLReport(testResult) {
    const { summary, details, timestamp } = testResult;

    const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>测试报告 - ${new Date(timestamp).toLocaleString('zh-CN')}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 20px;
      min-height: 100vh;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
      background: white;
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
      overflow: hidden;
    }

    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      text-align: center;
    }

    .header h1 {
      font-size: 32px;
      margin-bottom: 10px;
    }

    .header p {
      opacity: 0.9;
      font-size: 14px;
    }

    .summary {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 20px;
      padding: 30px;
      background: #f8f9fa;
    }

    .summary-card {
      background: white;
      padding: 20px;
      border-radius: 8px;
      text-align: center;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    .summary-card h3 {
      font-size: 14px;
      color: #6c757d;
      margin-bottom: 10px;
      text-transform: uppercase;
    }

    .summary-card .value {
      font-size: 36px;
      font-weight: bold;
    }

    .summary-card.total .value { color: #007bff; }
    .summary-card.passed .value { color: #28a745; }
    .summary-card.failed .value { color: #dc3545; }
    .summary-card.rate .value { color: #ffc107; }

    .progress-bar {
      width: 100%;
      height: 8px;
      background: #e9ecef;
      border-radius: 4px;
      overflow: hidden;
      margin-top: 10px;
    }

    .progress-bar .fill {
      height: 100%;
      background: linear-gradient(90deg, #28a745, #20c997);
      transition: width 0.3s ease;
    }

    .content {
      padding: 30px;
    }

    .test-case {
      background: #f8f9fa;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 20px;
      border-left: 4px solid #dee2e6;
    }

    .test-case.passed {
      border-left-color: #28a745;
      background: #f0fff4;
    }

    .test-case.failed {
      border-left-color: #dc3545;
      background: #fff5f5;
    }

    .test-case.skipped {
      border-left-color: #ffc107;
      background: #fffbf0;
    }

    .test-case-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 15px;
    }

    .test-case-title {
      font-size: 18px;
      font-weight: 600;
      color: #212529;
    }

    .test-case-status {
      padding: 4px 12px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
    }

    .test-case-status.passed {
      background: #d4edda;
      color: #155724;
    }

    .test-case-status.failed {
      background: #f8d7da;
      color: #721c24;
    }

    .test-case-status.skipped {
      background: #fff3cd;
      color: #856404;
    }

    .test-case-details {
      margin-top: 15px;
    }

    .detail-row {
      display: flex;
      padding: 8px 0;
      border-bottom: 1px solid #dee2e6;
    }

    .detail-row:last-child {
      border-bottom: none;
    }

    .detail-label {
      font-weight: 600;
      color: #495057;
      min-width: 120px;
    }

    .detail-value {
      color: #6c757d;
      flex: 1;
    }

    .screenshot-comparison {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-top: 15px;
    }

    .screenshot-container {
      text-align: center;
    }

    .screenshot-container img {
      max-width: 100%;
      border-radius: 8px;
      border: 2px solid #dee2e6;
    }

    .screenshot-label {
      margin-top: 8px;
      font-size: 14px;
      color: #495057;
      font-weight: 600;
    }

    .heatmap-container {
      margin-top: 15px;
      text-align: center;
    }

    .heatmap-container img {
      max-width: 100%;
      border-radius: 8px;
      border: 2px solid #dc3545;
    }

    .error-message {
      background: #f8d7da;
      color: #721c24;
      padding: 12px;
      border-radius: 6px;
      margin-top: 10px;
      font-family: monospace;
      font-size: 14px;
    }

    .performance-metrics {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 15px;
      margin-top: 15px;
    }

    .metric-card {
      background: white;
      padding: 15px;
      border-radius: 6px;
      border: 1px solid #dee2e6;
    }

    .metric-label {
      font-size: 12px;
      color: #6c757d;
      margin-bottom: 5px;
    }

    .metric-value {
      font-size: 20px;
      font-weight: 600;
      color: #212529;
    }

    .footer {
      padding: 20px 30px;
      background: #f8f9fa;
      text-align: center;
      color: #6c757d;
      font-size: 14px;
    }

    .filters {
      display: flex;
      gap: 10px;
      margin-bottom: 20px;
    }

    .filter-btn {
      padding: 8px 16px;
      border: 1px solid #dee2e6;
      background: white;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      transition: all 0.2s;
    }

    .filter-btn:hover {
      background: #f8f9fa;
    }

    .filter-btn.active {
      background: #007bff;
      color: white;
      border-color: #007bff;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🧪 测试报告</h1>
      <p>生成时间: ${new Date(timestamp).toLocaleString('zh-CN')}</p>
    </div>

    <div class="summary">
      <div class="summary-card total">
        <h3>总测试数</h3>
        <div class="value">${summary.total || 0}</div>
      </div>
      <div class="summary-card passed">
        <h3>通过</h3>
        <div class="value">${summary.passed || 0}</div>
      </div>
      <div class="summary-card failed">
        <h3>失败</h3>
        <div class="value">${summary.failed || 0}</div>
      </div>
      <div class="summary-card rate">
        <h3>通过率</h3>
        <div class="value">${((summary.total > 0 ? (summary.passed / summary.total) * 100 : 0)).toFixed(1)}%</div>
        <div class="progress-bar">
          <div class="fill" style="width: ${(summary.total > 0 ? (summary.passed / summary.total) * 100 : 0)}%"></div>
        </div>
      </div>
    </div>

    <div class="content">
      ${this.buildTestCasesHTML(details || [])}
    </div>

    <div class="footer">
      <p>由 Dev Quality Inspector 生成</p>
    </div>
  </div>

  <script>
    // 过滤功能
    function filterTests(status) {
      const cases = document.querySelectorAll('.test-case');
      cases.forEach(testCase => {
        if (status === 'all' || testCase.classList.contains(status)) {
          testCase.style.display = 'block';
        } else {
          testCase.style.display = 'none';
        }
      });
    }

    // 添加过滤器
    document.addEventListener('DOMContentLoaded', () => {
      const content = document.querySelector('.content');
      const filters = document.createElement('div');
      filters.className = 'filters';
      filters.innerHTML = \`
        <button class="filter-btn active" onclick="filterTests('all')">全部</button>
        <button class="filter-btn" onclick="filterTests('passed')">✅ 通过</button>
        <button class="filter-btn" onclick="filterTests('failed')">❌ 失败</button>
        <button class="filter-btn" onclick="filterTests('skipped')">⏭️ 跳过</button>
      \`;

      const buttons = filters.querySelectorAll('.filter-btn');
      buttons.forEach(btn => {
        btn.addEventListener('click', () => {
          buttons.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
        });
      });

      content.parentNode.insertBefore(filters, content);
    });
  </script>
</body>
</html>
    `;

    return html;
  }

  /**
   * 构建测试用例 HTML
   * @param {Array} testCases - 测试用例数组
   * @returns {string} HTML 内容
   */
  buildTestCasesHTML(testCases) {
    if (!testCases || testCases.length === 0) {
      return '<p style="text-align: center; color: #6c757d; padding: 40px;">暂无测试用例</p>';
    }

    return testCases.map(testCase => this.buildTestCaseHTML(testCase)).join('\n');
  }

  /**
   * 构建单个测试用例 HTML
   * @param {Object} testCase - 测试用例
   * @returns {string} HTML 内容
   */
  buildTestCaseHTML(testCase) {
    const status = testCase.status || (testCase.error ? 'failed' : 'passed');

    let html = `
    <div class="test-case ${status}">
      <div class="test-case-header">
        <div class="test-case-title">${testCase.name || 'Unnamed Test'}</div>
        <div class="test-case-status ${status}">
          ${status === 'passed' ? '✅ 通过' : status === 'failed' ? '❌ 失败' : '⏭️ 跳过'}
        </div>
      </div>
    `;

    // 添加详细信息
    if (testCase.description || testCase.selector || testCase.url) {
      html += '<div class="test-case-details">';

      if (testCase.description) {
        html += `
          <div class="detail-row">
            <div class="detail-label">描述</div>
            <div class="detail-value">${testCase.description}</div>
          </div>
        `;
      }

      if (testCase.url) {
        html += `
          <div class="detail-row">
            <div class="detail-label">URL</div>
            <div class="detail-value"><code>${testCase.url}</code></div>
          </div>
        `;
      }

      if (testCase.selector) {
        html += `
          <div class="detail-row">
            <div class="detail-label">选择器</div>
            <div class="detail-value"><code>${testCase.selector}</code></div>
          </div>
        `;
      }

      html += '</div>';
    }

    // 添加错误信息
    if (testCase.error) {
      html += `
        <div class="error-message">
          <strong>错误:</strong> ${testCase.error}
        </div>
      `;
    }

    // 添加截图对比
    if (testCase.screenshots) {
      html += this.buildScreenshotComparisonHTML(testCase.screenshots);
    }

    // 添加性能指标
    if (testCase.performance) {
      html += this.buildPerformanceMetricsHTML(testCase.performance);
    }

    // 添加差异热图
    if (testCase.heatmapPath) {
      html += `
        <div class="heatmap-container">
          <div class="screenshot-label">🔥 差异热图</div>
          <img src="${testCase.heatmapPath}" alt="差异热图">
        </div>
      `;
    }

    html += '</div>';

    return html;
  }

  /**
   * 构建截图对比 HTML
   * @param {Object} screenshots - 截图对象
   * @returns {string} HTML 内容
   */
  buildScreenshotComparisonHTML(screenshots) {
    let html = '<div class="screenshot-comparison">';

    if (screenshots.expected) {
      html += `
        <div class="screenshot-container">
          <img src="${screenshots.expected}" alt="预期截图">
          <div class="screenshot-label">预期</div>
        </div>
      `;
    }

    if (screenshots.actual) {
      html += `
        <div class="screenshot-container">
          <img src="${screenshots.actual}" alt="实际截图">
          <div class="screenshot-label">实际</div>
        </div>
      `;
    }

    html += '</div>';

    if (screenshots.diff) {
      html += `
        <div class="heatmap-container">
          <img src="${screenshots.diff}" alt="差异图">
          <div class="screenshot-label">🔍 差异</div>
        </div>
      `;
    }

    return html;
  }

  /**
   * 构建性能指标 HTML
   * @param {Object} performance - 性能指标
   * @returns {string} HTML 内容
   */
  buildPerformanceMetricsHTML(performance) {
    let html = '<div class="performance-metrics">';

    if (performance.duration) {
      html += `
        <div class="metric-card">
          <div class="metric-label">执行时间</div>
          <div class="metric-value">${performance.duration}ms</div>
        </div>
      `;
    }

    if (performance.loadTime) {
      html += `
        <div class="metric-card">
          <div class="metric-label">页面加载</div>
          <div class="metric-value">${performance.loadTime}ms</div>
        </div>
      `;
    }

    if (performance.responseTime) {
      html += `
        <div class="metric-card">
          <div class="metric-label">API 响应</div>
          <div class="metric-value">${performance.responseTime}ms</div>
        </div>
      `;
    }

    html += '</div>';

    return html;
  }

  /**
   * 生成 JSON 报告
   * @param {Object} testResult - 测试结果
   * @param {string} outputPath - 输出路径
   * @returns {Promise<Object>} 生成结果
   */
  async generateJSONReport(testResult, outputPath) {
    try {
      const json = JSON.stringify(testResult, null, 2);

      // 确保输出目录存在
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(outputPath, json, 'utf8');

      return {
        success: true,
        reportPath: outputPath,
        format: 'json',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 生成 JUnit XML 报告
   * @param {Object} testResult - 测试结果
   * @param {string} outputPath - 输出路径
   * @returns {Promise<Object>} 生成结果
   */
  async generateJUnitReport(testResult, outputPath) {
    try {
      const xml = this.buildJUnitXML(testResult);

      // 确保输出目录存在
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(outputPath, xml, 'utf8');

      return {
        success: true,
        reportPath: outputPath,
        format: 'junit',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 构建 JUnit XML
   * @param {Object} testResult - 测试结果
   * @returns {string} XML 内容
   */
  buildJUnitXML(testResult) {
    const { summary, details, timestamp, duration } = testResult;

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<testsuites>\n';
    xml += `  <testsuite name="Dev Quality Inspector" tests="${summary.total || 0}" failures="${summary.failed || 0}" skipped="${summary.skipped || 0}" time="${(duration || 0) / 1000}" timestamp="${new Date(timestamp).toISOString()}">\n`;

    if (details && details.length > 0) {
      details.forEach(testCase => {
        const status = testCase.status || (testCase.error ? 'failed' : 'passed');

        xml += '    <testcase\n';
        xml += `      classname="${testCase.classname || 'Test'}"\n`;
        xml += `      name="${testCase.name || 'Unnamed Test'}"\n`;
        xml += `      time="${(testCase.duration || 0) / 1000}"\n`;
        xml += '    >\n';

        if (status === 'failed') {
          xml += '      <failure';
          if (testCase.error) {
            xml += ` message="${testCase.error}"`;
          }
          xml += '>\n';
          xml += `        ${testCase.error || 'Test failed'}\n`;
          xml += '      </failure>\n';
        } else if (status === 'skipped') {
          xml += '      <skipped/>\n';
        }

        xml += '    </testcase>\n';
      });
    }

    xml += '  </testsuite>\n';
    xml += '</testsuites>\n';

    return xml;
  }

  /**
   * 生成所有格式的报告
   * @param {Object} testResult - 测试结果
   * @param {string} outputDir - 输出目录
   * @param {Object} options - 选项
   * @returns {Promise<Object>} 生成结果
   */
  async generateAllReports(testResult, outputDir, options = {}) {
    const {
      projectName = 'Test Report',
      formats = ['html', 'json', 'junit'],
    } = options;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reports = {};

    try {
      // 确保输出目录存在
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // 生成 HTML 报告
      if (formats.includes('html')) {
        const htmlPath = path.join(outputDir, `${timestamp}.html`);
        const htmlResult = await this.generateHTMLReport(testResult, htmlPath);
        if (htmlResult.success) {
          reports.html = htmlResult.reportPath;
        }
      }

      // 生成 JSON 报告
      if (formats.includes('json')) {
        const jsonPath = path.join(outputDir, `${timestamp}.json`);
        const jsonResult = await this.generateJSONReport(testResult, jsonPath);
        if (jsonResult.success) {
          reports.json = jsonResult.reportPath;
        }
      }

      // 生成 JUnit 报告
      if (formats.includes('junit')) {
        const junitPath = path.join(outputDir, `${timestamp}.xml`);
        const junitResult = await this.generateJUnitReport(testResult, junitPath);
        if (junitResult.success) {
          reports.junit = junitResult.reportPath;
        }
      }

      return {
        success: true,
        reports,
        summary: testResult.summary,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 打开报告
   * @param {string} reportPath - 报告路径
   * @returns {Promise<Object>} 打开结果
   */
  async openReport(reportPath) {
    try {
      const { shell } = require('electron');

      if (!fs.existsSync(reportPath)) {
        return {
          success: false,
          error: 'Report file not found',
        };
      }

      await shell.openPath(reportPath);

      return {
        success: true,
        message: 'Report opened successfully',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 生成趋势分析报告
   * @param {Array} historyResults - 历史测试结果
   * @param {string} outputPath - 输出路径
   * @returns {Promise<Object>} 生成结果
   */
  async generateTrendReport(historyResults, outputPath) {
    try {
      // 计算趋势数据
      const trends = this.calculateTrends(historyResults);

      const html = this.buildTrendHTML(trends);

      // 确保输出目录存在
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(outputPath, html, 'utf8');

      return {
        success: true,
        reportPath: outputPath,
        trends,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 计算趋势
   * @param {Array} historyResults - 历史结果
   * @returns {Object} 趋势数据
   */
  calculateTrends(historyResults) {
    const trends = {
      dates: [],
      passRates: [],
      totalTests: [],
      failedTests: [],
    };

    historyResults.forEach(result => {
      if (result.summary) {
        trends.dates.push(new Date(result.timestamp).toLocaleDateString('zh-CN'));
        trends.passRates.push(
          result.summary.total > 0
            ? (result.summary.passed / result.summary.total) * 100
            : 0
        );
        trends.totalTests.push(result.summary.total);
        trends.failedTests.push(result.summary.failed);
      }
    });

    return trends;
  }

  /**
   * 构建趋势 HTML
   * @param {Object} trends - 趋势数据
   * @returns {string} HTML 内容
   */
  buildTrendHTML(trends) {
    // 简化版本，实际可以使用 Chart.js 等库
    return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>测试趋势报告</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      padding: 20px;
      background: #f5f5f5;
    }

    .container {
      max-width: 1000px;
      margin: 0 auto;
      background: white;
      padding: 30px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    h1 {
      text-align: center;
      color: #333;
    }

    .trend-item {
      padding: 15px;
      margin: 10px 0;
      background: #f8f9fa;
      border-radius: 6px;
      border-left: 4px solid #007bff;
    }

    .trend-date {
      font-weight: 600;
      color: #333;
    }

    .trend-rate {
      margin-top: 5px;
      color: #666;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>📈 测试趋势报告</h1>
    ${trends.dates.map((date, i) => `
      <div class="trend-item">
        <div class="trend-date">${date}</div>
        <div class="trend-rate">
          通过率: ${trends.passRates[i].toFixed(1)}% |
          总测试: ${trends.totalTests[i]} |
          失败: ${trends.failedTests[i]}
        </div>
      </div>
    `).join('')}
  </div>
</body>
</html>
    `;
  }
}

module.exports = AdvancedReportGenerator;
