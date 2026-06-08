/**
 * Test Reporter
 *
 * 生成各种格式的测试报告
 * - JSON
 * - Markdown
 * - HTML
 * - PDF
 * - Excel
 */

const fs = require('fs');
const path = require('path');

class TestReporter {
  constructor(options = {}) {
    this.options = {
      outputDir: options.outputDir || './test-reports',
      includeScreenshots: options.includeScreenshots !== false,
      includeLogs: options.includeLogs !== false,
      ...options,
    };

    // 尝试导入可选的依赖
    this.xlsx = null;
    this.puppeteer = null;

    try {
      this.xlsx = require('xlsx');
    } catch (e) {
      console.warn('XLSX module not available, Excel reports will be disabled');
    }

    try {
      this.puppeteer = require('puppeteer-core');
    } catch (e) {
      console.warn('Puppeteer module not available, PDF reports will use HTML fallback');
    };
  }

  /**
   * 生成 JSON 报告
   * @param {Object} testResult - 测试结果
   * @param {string} outputPath - 输出路径
   * @returns {Object} 报告数据
   */
  generateJSON(testResult, outputPath = null) {
    const report = this.buildBaseReport(testResult);

    if (outputPath) {
      this.saveReport(outputPath, JSON.stringify(report, null, 2));
    }

    return report;
  }

  /**
   * 生成 Markdown 报告
   * @param {Object} testResult - 测试结果
   * @param {string} outputPath - 输出路径
   * @returns {string} Markdown 内容
   */
  generateMarkdown(testResult, outputPath = null) {
    const { summary, details } = this.buildBaseReport(testResult);

    let markdown = this.generateMarkdownHeader(summary);
    markdown += this.generateMarkdownSummary(summary);
    markdown += this.generateMarkdownDetails(details);
    markdown += this.generateMarkdownFooter(summary);

    if (outputPath) {
      this.saveReport(outputPath, markdown);
    }

    return markdown;
  }

  /**
   * 生成 HTML 报告
   * @param {Object} testResult - 测试结果
   * @param {string} outputPath - 输出路径
   * @returns {string} HTML 内容
   */
  generateHTML(testResult, outputPath = null) {
    const { summary, details } = this.buildBaseReport(testResult);

    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>测试报告 - ${summary.startTime}</title>
  <style>
    ${this.getHTMLStyles()}
  </style>
</head>
<body>
  <div class="container">
    ${this.generateHTMLHeader(summary)}
    ${this.generateHTMLSummary(summary)}
    ${this.generateHTMLDetails(details)}
    ${this.generateHTMLFooter(summary)}
  </div>
  <script>
    ${this.getHTMLScripts()}
  </script>
</body>
</html>`;

    if (outputPath) {
      this.saveReport(outputPath, html);
    }

    return html;
  }

  /**
   * 生成 PDF 报告
   * @param {Object} testResult - 测试结果
   * @param {string} outputPath - 输出路径
   * @returns {Buffer} PDF Buffer
   */
  async generatePDF(testResult, outputPath = null) {
    const html = this.generateHTML(testResult);

    if (this.puppeteer) {
      try {
        // 使用系统已安装的 Edge 浏览器，避免下载 Chromium
        const edgePaths = [
          'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
          'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        ];
        const executablePath = edgePaths.find(p => require('fs').existsSync(p));

        const browser = await this.puppeteer.launch({
          headless: 'new',
          executablePath: executablePath || undefined,
          args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });

        const pdfBuffer = await page.pdf({
          format: 'A4',
          printBackground: true,
          margin: { top: '1cm', right: '1cm', bottom: '1cm', left: '1cm' },
        });

        await browser.close();

        if (outputPath) {
          this.saveReport(outputPath, pdfBuffer);
          console.log('PDF 报告已保存到:', outputPath);
        }

        return pdfBuffer;
      } catch (error) {
        console.warn('PDF 生成失败，使用 HTML 回退:', error.message);
        if (outputPath) {
          this.saveReport(outputPath.replace('.pdf', '.html'), html);
        }
        return html;
      }
    }

    // 回退方案：保存为 HTML
    if (outputPath) {
      this.saveReport(outputPath.replace('.pdf', '.html'), html);
      console.log('⚠️  PDF 生成需要 puppeteer，已保存为 HTML');
    }

    return html;
  }

  /**
   * 生成 Excel 报告（增强版 - BDD 格式）
   * @param {Object} testResult - 测试结果
   * @param {string} outputPath - 输出路径
   * @returns {Buffer} Excel Buffer
   */
  generateExcel(testResult, outputPath = null) {
    if (!this.xlsx) {
      throw new Error('XLSX module not available. Please install: npm install xlsx');
    }

    const { summary, details } = this.buildBaseReport(testResult);

    // 创建工作簿
    const workbook = this.xlsx.utils.book_new();

    // 计算失败率
    const failRate = summary.totalScenarios > 0
      ? ((summary.failedScenarios / summary.totalScenarios) * 100).toFixed(2)
      : '0';

    // 1. 概览工作表
    const summaryData = [
      ['测试报告概览'],
      [''],
      ['生成时间', new Date(summary.generatedAt || Date.now()).toLocaleString('zh-CN')],
      ['总用例数', summary.totalScenarios || 0],
      ['通过条数', summary.passedScenarios || 0],
      ['失败条数', summary.failedScenarios || 0],
      ['跳过条数', summary.skippedScenarios || 0],
      ['通过率', `${summary.passRate || '0'}%`],
      ['失败率', `${failRate}%`],
      ['执行时间', `${(summary.duration / 1000).toFixed(2)}s`],
    ];

    const summarySheet = this.xlsx.utils.aoa_to_sheet(summaryData);
    this.xlsx.utils.book_append_sheet(workbook, summarySheet, '概览');

    // 2. 详细 BDD 格式测试用例工作表
    const bddHeader = ['ID', '用例名称', '页面', 'Given（前置条件）', 'When（操作步骤）', 'Then（预期结果）', '状态', '耗时(ms)', '测试情况描述'];
    const bddData = [bddHeader];

    if (details.modules && Array.isArray(details.modules)) {
      details.modules.forEach(module => {
        if (module.scenarios && Array.isArray(module.scenarios)) {
          module.scenarios.forEach(scenario => {
            // 提取 Given/When/Then
            const givenText = this.extractScenarioText(scenario, 'given');
            const whenText = this.extractScenarioText(scenario, 'when');
            const thenText = this.extractScenarioText(scenario, 'then');

            // 失败情况描述
            let failureDescription = '';
            if (scenario.status === 'failed') {
              failureDescription = this.getFailureDescription(scenario);
            }

            bddData.push([
              scenario.id || '',
              scenario.name || 'Unknown',
              scenario.page || module.module || '',
              givenText,
              whenText,
              thenText,
              scenario.status || 'unknown',
              scenario.duration || 0,
              failureDescription
            ]);
          });
        }
      });
    }

    const bddSheet = this.xlsx.utils.aoa_to_sheet(bddData);

    // 设置列宽
    bddSheet['!cols'] = [
      { wch: 12 },  // ID
      { wch: 35 },  // 用例名称
      { wch: 15 },  // 页面
      { wch: 35 },  // Given
      { wch: 40 },  // When
      { wch: 35 },  // Then
      { wch: 10 },  // 状态
      { wch: 12 },  // 耗时
      { wch: 40 },  // 测试情况描述
    ];

    // 为失败的用例设置红色背景
    if (bddData.length > 1) {
      const range = this.xlsx.utils.decode_range(bddSheet['!ref']);
      for (let row = range.s.r + 1; row <= range.e.r; row++) {
        const statusCell = bddSheet[this.xlsx.utils.encode_cell({ r: row, c: 6 })]; // 状态列
        if (statusCell && statusCell.v === 'failed') {
          // 为整行设置红色背景
          for (let col = range.s.c; col <= range.e.c; col++) {
            const cellAddress = this.xlsx.utils.encode_cell({ r: row, c: col });
            if (!bddSheet[cellAddress]) {
              bddSheet[cellAddress] = { t: 's', v: '' };
            }
            bddSheet[cellAddress].s = {
              fill: {
                fgColor: { rgb: "FFCCEEEE" } // 浅红色背景
              },
              font: {
                color: { rgb: "FF000000" }
              }
            };
          }
        }
      }
    }

    this.xlsx.utils.book_append_sheet(workbook, bddSheet, '测试用例详情');

    // 3. 简要结果工作表
    const detailData = [['模块', '场景', '状态', '耗时(ms)', '错误']];

    if (details.modules && Array.isArray(details.modules)) {
      details.modules.forEach(module => {
        if (module.scenarios && Array.isArray(module.scenarios)) {
          module.scenarios.forEach(scenario => {
            detailData.push([
              module.module || 'Unknown',
              scenario.name || 'Unknown',
              scenario.status || 'unknown',
              scenario.duration || 0,
              scenario.errors?.map(e => e.error || e).join('; ') || '',
            ]);
          });
        }
      });
    }

    const detailSheet = this.xlsx.utils.aoa_to_sheet(detailData);
    this.xlsx.utils.book_append_sheet(workbook, detailSheet, '简要结果');

    // 4. 问题列表工作表（如果有失败的场景）
    const failuresData = [['模块', '用例ID', '用例名称', '失败步骤', '失败原因']];
    let hasFailures = false;

    if (details.modules && Array.isArray(details.modules)) {
      details.modules.forEach(module => {
        if (module.scenarios && Array.isArray(module.scenarios)) {
          module.scenarios.forEach(scenario => {
            if (scenario.status === 'failed' && scenario.errors && scenario.errors.length > 0) {
              hasFailures = true;
              scenario.errors.forEach(error => {
                const failureInfo = this.parseErrorInfo(error);
                failuresData.push([
                  module.module || 'Unknown',
                  scenario.id || '',
                  scenario.name || 'Unknown',
                  failureInfo.step || '未知步骤',
                  failureInfo.reason || error.error || JSON.stringify(error),
                ]);
              });
            }
          });
        }
      });
    }

    if (hasFailures) {
      const failuresSheet = this.xlsx.utils.aoa_to_sheet(failuresData);
      failuresSheet['!cols'] = [
        { wch: 20 },  // 模块
        { wch: 12 },  // 用例ID
        { wch: 35 },  // 用例名称
        { wch: 20 },  // 失败步骤
        { wch: 50 },  // 失败原因
      ];
      this.xlsx.utils.book_append_sheet(workbook, failuresSheet, '失败详情');
    }

    // 生成 Excel Buffer
    const excelBuffer = this.xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    if (outputPath) {
      this.saveReport(outputPath, excelBuffer);
      console.log('Excel 报告已保存到:', outputPath);
    }

    return excelBuffer;
  }

  /**
   * 提取场景文本（Given/When/Then）
   * @param {Object} scenario - 场景对象
   * @param {string} type - 类型 (given/when/then)
   * @returns {string} 提取的文本
   */
  extractScenarioText(scenario, type) {
    const value = scenario[type];

    if (!value) return '';

    // 处理对象格式
    if (typeof value === 'object') {
      if (value.text) return value.text;
      if (value.description) return value.description;
      if (value.steps && Array.isArray(value.steps)) {
        return value.steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
      }
      if (Array.isArray(value)) {
        return value.map(s => typeof s === 'object' ? (s.text || s.description || JSON.stringify(s)) : s).join('\n');
      }
      return JSON.stringify(value);
    }

    // 处理字符串格式
    return String(value);
  }

  /**
   * 获取失败情况描述
   * @param {Object} scenario - 场景对象
   * @returns {string} 失败描述
   */
  getFailureDescription(scenario) {
    if (!scenario.errors || scenario.errors.length === 0) {
      return '';
    }

    const descriptions = scenario.errors.map((error, index) => {
      const failureInfo = this.parseErrorInfo(error);
      return `步骤${index + 1}: ${failureInfo.step || '未知'} - ${failureInfo.reason || error.error || JSON.stringify(error)}`;
    });

    return descriptions.join('\n');
  }

  /**
   * 解析错误信息
   * @param {Object} error - 错误对象
   * @returns {Object} {step, reason}
   */
  parseErrorInfo(error) {
    let step = '未知步骤';
    let reason = '';

    if (typeof error === 'string') {
      reason = error;
    } else if (error.error) {
      reason = error.error;
      if (error.step) {
        step = error.step;
      } else if (error.action) {
        step = `操作: ${error.action}`;
      }
    } else if (error.message) {
      reason = error.message;
    }

    // 尝试从错误信息中提取步骤
    if (reason && !step || step === '未知步骤') {
      if (reason.includes('步骤')) {
        const stepMatch = reason.match(/步骤\s*(\d+)/);
        if (stepMatch) {
          step = `步骤${stepMatch[1]}`;
        }
      }
    }

    return { step, reason };
  }

  /**
   * 生成所有格式的报告
   * @param {Object} testResult - 测试结果
   * @param {string} outputDir - 输出目录
   * @returns {Promise<Object>} 所有报告
   */
  async generateAll(testResult, outputDir = null) {
    const dir = outputDir || this.options.outputDir;

    // 确保目录存在
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const baseName = `test-report-${timestamp}`;

    const reports = {
      json: this.generateJSON(testResult, path.join(dir, `${baseName}.json`)),
      markdown: this.generateMarkdown(testResult, path.join(dir, `${baseName}.md`)),
      html: this.generateHTML(testResult, path.join(dir, `${baseName}.html`)),
      pdf: await this.generatePDF(testResult, path.join(dir, `${baseName}.pdf`)),
      excel: null,
    };

    // 尝试生成 Excel
    try {
      reports.excel = this.generateExcel(testResult, path.join(dir, `${baseName}.xlsx`));
    } catch (error) {
      console.warn('Excel 生成失败:', error.message);
    }

    return reports;
  }

  /**
   * 构建基础报告数据
   * @param {Object} testResult - 测试结果
   * @returns {Object} 报告数据
   */
  buildBaseReport(testResult) {
    const summary = {
      startTime: testResult.startTime,
      endTime: testResult.endTime,
      duration: testResult.duration,
      totalScenarios: testResult.totalScenarios,
      passedScenarios: testResult.passedScenarios,
      failedScenarios: testResult.failedScenarios,
      skippedScenarios: testResult.skippedScenarios,
      passRate: testResult.totalScenarios > 0
        ? ((testResult.passedScenarios / testResult.totalScenarios) * 100).toFixed(2) + '%'
        : '0%',
      success: testResult.success || testResult.failedScenarios === 0,
    };

    return {
      summary,
      details: testResult,
      metadata: {
        generatedAt: new Date().toISOString(),
        version: '1.0.0',
      },
    };
  }

  /**
   * 生成 Markdown 头部
   * @param {Object} summary - 摘要
   * @returns {string} Markdown
   */
  generateMarkdownHeader(summary) {
    return `# 测试报告

**生成时间：** ${new Date(summary.generatedAt || Date.now()).toLocaleString('zh-CN')}

---

`;
  }

  /**
   * 生成 Markdown 摘要
   * @param {Object} summary - 摘要
   * @returns {string} Markdown
   */
  generateMarkdownSummary(summary) {
    const statusIcon = summary.success ? '✅' : '❌';
    const statusText = summary.success ? '测试通过' : '测试失败';

    return `## 测试摘要

${statusIcon} **状态：** ${statusText}

### 统计数据

| 指标 | 数值 |
|------|------|
| 总场景数 | ${summary.totalScenarios} |
| 通过 | ${summary.passedScenarios} |
| 失败 | ${summary.failedScenarios} |
| 跳过 | ${summary.skippedScenarios} |
| 通过率 | ${summary.passRate} |
| 执行时间 | ${(summary.duration / 1000).toFixed(2)}s |

### 执行时间

- **开始时间：** ${new Date(summary.startTime).toLocaleString('zh-CN')}
- **结束时间：** ${new Date(summary.endTime).toLocaleString('zh-CN')}

---

`;
  }

  /**
   * 生成 Markdown 详情
   * @param {Object} details - 详情
   * @returns {string} Markdown
   */
  generateMarkdownDetails(details) {
    let markdown = `## 详细结果\n\n`;

    for (const module of details.modules) {
      markdown += `### ${module.module} (${module.priority})\n\n`;

      for (const scenario of module.scenarios) {
        const statusIcon = scenario.status === 'passed' ? '✅' : scenario.status === 'failed' ? '❌' : '⏭️';
        markdown += `#### ${statusIcon} ${scenario.name}\n\n`;
        markdown += `- **状态：** ${scenario.status}\n`;
        markdown += `- **耗时：** ${(scenario.duration / 1000).toFixed(2)}s\n`;

        if (scenario.steps && scenario.steps.length > 0) {
          markdown += `- **步骤数：** ${scenario.steps.length}\n`;
        }

        if (scenario.errors && scenario.errors.length > 0) {
          markdown += `- **错误：**\n`;
          for (const error of scenario.errors) {
            markdown += `  - ${error.error || JSON.stringify(error)}\n`;
          }
        }

        markdown += `\n`;
      }
    }

    return markdown;
  }

  /**
   * 生成 Markdown 底部
   * @param {Object} summary - 摘要
   * @returns {string} Markdown
   */
  generateMarkdownFooter(summary) {
    return `---

## 附录

### 验证类型

- **count**: 数量验证
- **route**: 路由验证
- **breadcrumb**: 面包屑验证
- **text**: 文本验证
- **visible**: 可见性验证
- **attribute**: 属性验证
- **css**: CSS 属性验证
- **value**: 表单值验证
- **state**: 元素状态验证
- **title**: 页面标题验证
- **urlParam**: URL 参数验证

### 生成信息

- **生成工具：** Dev Quality Inspector - AI Test Agent
- **版本：** 1.0.0
- **生成时间：** ${new Date().toLocaleString('zh-CN')}
`;
  }

  /**
   * 生成 HTML 头部
   * @param {Object} summary - 摘要
   * @returns {string} HTML
   */
  generateHTMLHeader(summary) {
    const statusIcon = summary.success ? '✅' : '❌';
    const statusText = summary.success ? '测试通过' : '测试失败';
    const statusClass = summary.success ? 'status-passed' : 'status-failed';

    return `
      <header class="header">
        <h1>测试报告</h1>
        <div class="status ${statusClass}">
          ${statusIcon} ${statusText}
        </div>
        <div class="meta">
          <span>生成时间：${new Date().toLocaleString('zh-CN')}</span>
        </div>
      </header>
    `;
  }

  /**
   * 生成 HTML 摘要
   * @param {Object} summary - 摘要
   * @returns {string} HTML
   */
  generateHTMLSummary(summary) {
    return `
      <section class="summary">
        <h2>测试摘要</h2>
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-label">总场景数</div>
            <div class="stat-value">${summary.totalScenarios}</div>
          </div>
          <div class="stat-card stat-passed">
            <div class="stat-label">通过</div>
            <div class="stat-value">${summary.passedScenarios}</div>
          </div>
          <div class="stat-card stat-failed">
            <div class="stat-label">失败</div>
            <div class="stat-value">${summary.failedScenarios}</div>
          </div>
          <div class="stat-card stat-skipped">
            <div class="stat-label">跳过</div>
            <div class="stat-value">${summary.skippedScenarios}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">通过率</div>
            <div class="stat-value">${summary.passRate}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">执行时间</div>
            <div class="stat-value">${(summary.duration / 1000).toFixed(2)}s</div>
          </div>
        </div>
        <div class="time-range">
          <span>开始：${new Date(summary.startTime).toLocaleString('zh-CN')}</span>
          <span>结束：${new Date(summary.endTime).toLocaleString('zh-CN')}</span>
        </div>
      </section>
    `;
  }

  /**
   * 生成 HTML 详情（增强版 - BDD 格式表格）
   * @param {Object} details - 详情
   * @returns {string} HTML
   */
  generateHTMLDetails(details) {
    let html = '<section class="details"><h2>详细结果</h2>';

    // 添加 BDD 格式测试用例表格
    html += '<div class="bdd-table-container">';
    html += '<h3>测试用例详情（BDD格式）</h3>';
    html += '<table class="bdd-table">';
    html += '<thead>';
    html += '<tr>';
    html += '<th>ID</th>';
    html += '<th>用例名称</th>';
    html += '<th>页面</th>';
    html += '<th>Given（前置条件）</th>';
    html += '<th>When（操作步骤）</th>';
    html += '<th>Then（预期结果）</th>';
    html += '<th>状态</th>';
    html += '<th>耗时</th>';
    html += '<th>测试情况描述</th>';
    html += '</tr>';
    html += '</thead>';
    html += '<tbody>';

    let totalScenarios = 0;
    let failedScenarios = 0;

    for (const module of details.modules) {
      if (module.scenarios && Array.isArray(module.scenarios)) {
        for (const scenario of module.scenarios) {
          totalScenarios++;
          const statusClass = scenario.status === 'passed' ? 'passed' : scenario.status === 'failed' ? 'failed' : 'skipped';
          const statusIcon = scenario.status === 'passed' ? '✅' : scenario.status === 'failed' ? '❌' : '⏭️';

          if (scenario.status === 'failed') {
            failedScenarios++;
          }

          // 提取 Given/When/Then
          const givenText = this.escapeHtml(this.extractScenarioText(scenario, 'given'));
          const whenText = this.escapeHtml(this.extractScenarioText(scenario, 'when'));
          const thenText = this.escapeHtml(this.extractScenarioText(scenario, 'then'));

          // 失败情况描述
          let failureDescription = '';
          if (scenario.status === 'failed') {
            failureDescription = this.escapeHtml(this.getFailureDescription(scenario));
          }

          const rowClass = scenario.status === 'failed' ? 'class="row-failed"' : '';

          html += `<tr ${rowClass}>`;
          html += `<td>${this.escapeHtml(scenario.id || '')}</td>`;
          html += `<td>${this.escapeHtml(scenario.name || 'Unknown')}</td>`;
          html += `<td>${this.escapeHtml(scenario.page || module.module || '')}</td>`;
          html += `<td class="text-cell">${givenText}</td>`;
          html += `<td class="text-cell">${whenText}</td>`;
          html += `<td class="text-cell">${thenText}</td>`;
          html += `<td class="status-${statusClass}">${statusIcon} ${scenario.status || 'unknown'}</td>`;
          html += `<td>${(scenario.duration / 1000).toFixed(2)}s</td>`;
          html += `<td class="failure-desc">${failureDescription}</td>`;
          html += '</tr>';
        }
      }
    }

    html += '</tbody>';
    html += '</table>';
    html += '</div>';

    // 添加模块详情（折叠式）
    html += '<div class="module-details">';
    html += '<h3>模块详情</h3>';

    for (const module of details.modules) {
      html += `<details class="module-detail" ${module.priority === 'High' ? 'open' : ''}>`;
      html += `<summary>${module.module} <span class="priority priority-${module.priority.toLowerCase()}">${module.priority}</span></summary>`;

      for (const scenario of module.scenarios) {
        const statusClass = scenario.status === 'passed' ? 'passed' : scenario.status === 'failed' ? 'failed' : 'skipped';
        const statusIcon = scenario.status === 'passed' ? '✅' : scenario.status === 'failed' ? '❌' : '⏭️';

        html += `<div class="scenario scenario-${statusClass}">`;
        html += `<h4>${statusIcon} ${scenario.name}</h4>`;
        html += `<div class="scenario-meta">`;
        html += `<span class="status">状态：${scenario.status}</span>`;
        html += `<span class="duration">耗时：${(scenario.duration / 1000).toFixed(2)}s</span>`;
        html += `</div>`;

        if (scenario.errors && scenario.errors.length > 0) {
          html += `<div class="errors">`;
          html += `<h5>错误</h5>`;
          html += `<ul>`;
          for (const error of scenario.errors) {
            html += `<li>${this.escapeHtml(error.error || JSON.stringify(error))}</li>`;
          }
          html += `</ul>`;
          html += `</div>`;
        }

        html += `</div>`;
      }

      html += `</details>`;
    }

    html += '</div>';
    html += '</section>';
    return html;
  }

  /**
   * HTML 转义
   * @param {string} text - 待转义文本
   * @returns {string} 转义后文本
   */
  escapeHtml(text) {
    if (!text) return '';
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
  }

  /**
   * 生成 HTML 底部
   * @param {Object} summary - 摘要
   * @returns {string} HTML
   */
  generateHTMLFooter(summary) {
    return `
      <footer class="footer">
        <p>生成工具：Dev Quality Inspector - AI Test Agent v1.0.0</p>
        <p>生成时间：${new Date().toLocaleString('zh-CN')}</p>
      </footer>
    `;
  }

  /**
   * 获取 HTML 样式
   * @returns {string} CSS
   */
  getHTMLStyles() {
    return `
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }

      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        line-height: 1.6;
        color: #333;
        background: #f5f5f5;
      }

      .container {
        max-width: 1400px;
        margin: 0 auto;
        padding: 20px;
      }

      .header {
        background: white;
        padding: 30px;
        border-radius: 8px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        margin-bottom: 20px;
        text-align: center;
      }

      .header h1 {
        margin-bottom: 15px;
        color: #2c3e50;
      }

      .status {
        display: inline-block;
        padding: 10px 20px;
        border-radius: 20px;
        font-size: 18px;
        font-weight: bold;
        margin-bottom: 10px;
      }

      .status-passed {
        background: #d4edda;
        color: #155724;
      }

      .status-failed {
        background: #f8d7da;
        color: #721c24;
      }

      .meta {
        color: #6c757d;
        font-size: 14px;
      }

      .summary {
        background: white;
        padding: 30px;
        border-radius: 8px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        margin-bottom: 20px;
      }

      .summary h2 {
        margin-bottom: 20px;
        color: #2c3e50;
      }

      .stats-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 15px;
        margin-bottom: 20px;
      }

      .stat-card {
        background: #f8f9fa;
        padding: 20px;
        border-radius: 8px;
        text-align: center;
      }

      .stat-card.stat-passed {
        background: #d4edda;
        color: #155724;
      }

      .stat-card.stat-failed {
        background: #f8d7da;
        color: #721c24;
      }

      .stat-card.stat-skipped {
        background: #fff3cd;
        color: #856404;
      }

      .stat-label {
        font-size: 14px;
        margin-bottom: 10px;
        opacity: 0.8;
      }

      .stat-value {
        font-size: 32px;
        font-weight: bold;
      }

      .time-range {
        display: flex;
        justify-content: space-between;
        color: #6c757d;
        font-size: 14px;
      }

      .details {
        background: white;
        padding: 30px;
        border-radius: 8px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        margin-bottom: 20px;
      }

      .details h2, .details h3 {
        margin-bottom: 20px;
        color: #2c3e50;
      }

      /* BDD 表格样式 */
      .bdd-table-container {
        margin-bottom: 30px;
        overflow-x: auto;
      }

      .bdd-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
      }

      .bdd-table thead {
        background: #2c3e50;
        color: white;
      }

      .bdd-table th {
        padding: 12px 8px;
        text-align: left;
        font-weight: 600;
        white-space: nowrap;
      }

      .bdd-table td {
        padding: 10px 8px;
        border-bottom: 1px solid #dee2e6;
      }

      .bdd-table tbody tr:hover {
        background: #f8f9fa;
      }

      .bdd-table tbody tr.row-failed {
        background: #ffe6e6 !important;
      }

      .bdd-table tbody tr.row-failed:hover {
        background: #ffd3d3 !important;
      }

      .bdd-table .text-cell {
        max-width: 200px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: pre-wrap;
        word-break: break-word;
      }

      .bdd-table .status-passed {
        color: #28a745;
        font-weight: 600;
      }

      .bdd-table .status-failed {
        color: #dc3545;
        font-weight: 600;
      }

      .bdd-table .status-skipped {
        color: #ffc107;
        font-weight: 600;
      }

      .bdd-table .failure-desc {
        color: #dc3545;
        font-style: italic;
      }

      /* 模块详情样式 */
      .module-details {
        margin-top: 30px;
      }

      .module-detail {
        margin-bottom: 15px;
        border: 1px solid #dee2e6;
        border-radius: 8px;
        overflow: hidden;
      }

      .module-detail summary {
        padding: 15px 20px;
        background: #f8f9fa;
        cursor: pointer;
        font-weight: 600;
        color: #2c3e50;
        user-select: none;
      }

      .module-detail summary:hover {
        background: #e9ecef;
      }

      .module-detail[open] summary {
        border-bottom: 1px solid #dee2e6;
      }

      .module {
        margin-bottom: 30px;
      }

      .module h3 {
        margin-bottom: 15px;
        color: #2c3e50;
      }

      .priority {
        display: inline-block;
        padding: 4px 12px;
        border-radius: 12px;
        font-size: 12px;
        margin-left: 10px;
      }

      .priority-high {
        background: #dc3545;
        color: white;
      }

      .priority-medium {
        background: #ffc107;
        color: #212529;
      }

      .priority-low {
        background: #28a745;
        color: white;
      }

      .scenario {
        background: #f8f9fa;
        padding: 15px;
        border-radius: 8px;
        margin-bottom: 15px;
        border-left: 4px solid #6c757d;
      }

      .scenario-passed {
        border-left-color: #28a745;
      }

      .scenario-failed {
        border-left-color: #dc3545;
      }

      .scenario-skipped {
        border-left-color: #ffc107;
      }

      .scenario h4 {
        margin-bottom: 10px;
        color: #2c3e50;
      }

      .scenario-meta {
        display: flex;
        gap: 20px;
        margin-bottom: 10px;
        font-size: 14px;
        color: #6c757d;
      }

      .errors {
        background: #f8d7da;
        padding: 15px;
        border-radius: 8px;
        margin-top: 10px;
      }

      .errors h5 {
        color: #721c24;
        margin-bottom: 10px;
      }

      .errors ul {
        list-style: none;
        padding-left: 0;
      }

      .errors li {
        color: #721c24;
        padding: 5px 0;
      }

      .footer {
        text-align: center;
        padding: 20px;
        color: #6c757d;
        font-size: 14px;
      }

      @media (max-width: 768px) {
        .stats-grid {
          grid-template-columns: repeat(2, 1fr);
        }
        .bdd-table {
          font-size: 11px;
        }
        .bdd-table th, .bdd-table td {
          padding: 6px 4px;
        }
      }
    `;
  }

  /**
   * 获取 HTML 脚本
   * @returns {string} JavaScript
   */
  getHTMLScripts() {
    return `
      // 可以添加交互功能
      console.log('测试报告已加载');
    `;
  }

  /**
   * 保存报告
   * @param {string} outputPath - 输出路径
   * @param {string} content - 内容
   */
  saveReport(outputPath, content) {
    try {
      // 确保目录存在
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(outputPath, content, 'utf8');
      console.log(`✓ 报告已保存: ${outputPath}`);
    } catch (error) {
      console.error(`✗ 保存报告失败: ${outputPath}`, error.message);
    }
  }

  /**
   * 生成测试用例 Excel 文件
   * @param {Object} testPlan - 测试计划 (包含 modules 和 scenarios)
   * @param {string} outputPath - 输出路径
   * @returns {Promise<void>}
   */
  async generateTestCasesExcel(testPlan, outputPath) {
    if (!this.xlsx) {
      throw new Error('XLSX module not available. Please install xlsx package.');
    }

    try {
      const workbook = this.xlsx.utils.book_new();

      // 遍历每个模块
      for (const module of testPlan.modules || []) {
        const moduleName = module.module || '默认模块';

        // 创建工作表数据
        const wsData = [
          ['模块', moduleName],
          ['优先级', module.priority || 'Medium'],
          [],
          ['ID', '用例名称', '类型', '页面', '描述', '前置条件', '操作步骤', '预期结果', '优先级'],
        ];

        // 添加测试场景
        for (const scenario of module.scenarios || []) {
          // 提取 given/when/then 文本
          const givenText = typeof scenario.given === 'object'
            ? (scenario.given.text || scenario.given.description || '')
            : (scenario.given || '');

          let whenText = '';
          if (scenario.when && typeof scenario.when === 'object') {
            if (scenario.when.steps && Array.isArray(scenario.when.steps)) {
              whenText = scenario.when.steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
            } else {
              whenText = scenario.when.text || scenario.when.description || '';
            }
          } else {
            whenText = scenario.when || '';
          }

          const thenText = typeof scenario.then === 'object'
            ? (scenario.then.text || scenario.then.description || '')
            : (scenario.then || '');

          wsData.push([
            scenario.id || '',
            scenario.name || '',
            scenario.type || '',
            scenario.page || '',
            scenario.description || '',
            givenText,
            whenText,
            thenText,
            scenario.priority || 'Medium',
          ]);
        }

        // 创建工作表
        const worksheet = this.xlsx.utils.aoa_to_sheet(wsData);

        // 设置列宽
        worksheet['!cols'] = [
          { wch: 10 },  // ID
          { wch: 30 },  // 用例名称
          { wch: 12 },  // 类型
          { wch: 15 },  // 页面
          { wch: 30 },  // 描述
          { wch: 30 },  // 前置条件
          { wch: 40 },  // 操作步骤
          { wch: 30 },  // 预期结果
          { wch: 10 },  // 优先级
        ];

        // 添加到工作簿
        this.xlsx.utils.book_append_sheet(workbook, worksheet, moduleName.substring(0, 31)); // Excel 工作表名最多31字符
      }

      // 确保目录存在
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // 写入文件
      this.xlsx.writeFile(workbook, outputPath);
      console.log(`✓ 测试用例 Excel 已保存: ${outputPath}`);
    } catch (error) {
      console.error(`✗ 生成测试用例 Excel 失败:`, error);
      throw error;
    }
  }
}

module.exports = TestReporter;
