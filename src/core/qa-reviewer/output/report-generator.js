/**
 * 报告生成器
 *
 * 生成多种格式的 QA Reviewer 报告
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

class ReportGenerator {
  constructor(options = {}) {
    this.reportPath = options.reportPath ||
      path.join(os.homedir(), '.qa-reviewer', 'reports');
  }

  /**
   * 确保报告目录存在
   */
  ensureReportDir() {
    if (!fs.existsSync(this.reportPath)) {
      fs.mkdirSync(this.reportPath, { recursive: true });
    }
  }

  /**
   * 生成报告文件名
   */
  generateReportName(type, prefix = 'qa-report') {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    return `${prefix}_${timestamp}.${type}`;
  }

  /**
   * 生成 JSON 报告
   */
  async generateJSON(report, options = {}) {
    this.ensureReportDir();

    const filename = options.filename || this.generateReportName('json');
    const filepath = path.join(this.reportPath, filename);

    const jsonReport = {
      metadata: {
        projectPath: report.projectPath || 'unknown',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        reviewer: 'AI QA Reviewer',
        // 增量审查标记
        reviewType: report.reviewType || 'full',
        diffScope: report.diffScope || undefined,
        changedFileCount: report.changedFileCount || undefined,
        dependencyFileCount: report.dependencyFileCount || undefined,
      },
      summary: {
        overallStatus: report.totalIssues === 0 ? 'passed' : 'failed',
        totalIssues: report.totalIssues,
        bySeverity: report.bySeverity,
        bySource: report.bySource,
      },
      requirements: report.requirements || {},
      segments: report.segments || [],
      issues: report.issues || [],
    };

    fs.writeFileSync(filepath, JSON.stringify(jsonReport, null, 2), 'utf8');

    return filepath;
  }

  /**
   * 生成 HTML 报告
   */
  async generateHTML(report, options = {}) {
    this.ensureReportDir();

    const filename = options.filename || this.generateReportName('html');
    const filepath = path.join(this.reportPath, filename);

    const html = this.buildHTMLReport(report);

    fs.writeFileSync(filepath, html, 'utf8');

    return filepath;
  }

  /**
   * 构建 HTML 报告
   */
  buildHTMLReport(report) {
    const { totalIssues, bySeverity, issues } = report;

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>QA Reviewer 报告 - ${new Date().toLocaleDateString()}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f5f5;
      padding: 20px;
      line-height: 1.6;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
    }
    .header h1 {
      margin: 0;
      font-size: 28px;
    }
    .header .meta {
      margin-top: 10px;
      opacity: 0.9;
    }
    .summary {
      padding: 30px;
      background: #f8f9fa;
      border-bottom: 1px solid #dee2e6;
    }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin-top: 20px;
    }
    .summary-card {
      background: white;
      padding: 20px;
      border-radius: 8px;
      text-align: center;
      box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    }
    .summary-card .value {
      font-size: 36px;
      font-weight: bold;
      color: #667eea;
    }
    .summary-card .label {
      color: #6c757d;
      font-size: 14px;
    }
    .issues {
      padding: 30px;
    }
    .issue {
      background: #fff;
      border-left: 4px solid #dee2e6;
      padding: 15px;
      margin-bottom: 15px;
      border-radius: 4px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    .issue.high {
      border-left-color: #e74c3c;
      background: #fff5f5;
    }
    .issue.medium {
      border-left-color: #f39c12;
      background: #fffbf0;
    }
    .issue.low {
      border-left-color: #27ae60;
      background: #f0fff4;
    }
    .issue-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 8px;
    }
    .issue-rule {
      font-family: monospace;
      background: #e9ecef;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 12px;
    }
    .issue-file {
      color: #6c757d;
      font-size: 13px;
      font-family: monospace;
    }
    .issue-message {
      font-weight: 500;
      margin-bottom: 8px;
    }
    .issue-suggestion {
      color: #495057;
      font-size: 14px;
      padding: 10px;
      background: #f8f9fa;
      border-radius: 4px;
    }
    .footer {
      padding: 20px 30px;
      background: #f8f9fa;
      text-align: center;
      color: #6c757d;
      font-size: 13px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔍 AI QA Reviewer 报告</h1>
      <div class="meta">
        生成时间: ${new Date().toLocaleString('zh-CN')} |
        总问题数: ${totalIssues}
      </div>
    </div>

    <div class="summary">
      <h2>📊 审查摘要</h2>
      <div class="summary-grid">
        <div class="summary-card">
          <div class="value">${totalIssues}</div>
          <div class="label">总问题数</div>
        </div>
        <div class="summary-card">
          <div class="value" style="color: #e74c3c;">${bySeverity?.high || 0}</div>
          <div class="label">高优先级</div>
        </div>
        <div class="summary-card">
          <div class="value" style="color: #f39c12;">${bySeverity?.medium || 0}</div>
          <div class="label">中优先级</div>
        </div>
        <div class="summary-card">
          <div class="value" style="color: #27ae60;">${bySeverity?.low || 0}</div>
          <div class="label">低优先级</div>
        </div>
      </div>
    </div>

    ${issues.length > 0 ? `
    <div class="issues">
      <h2>📋 问题列表</h2>
      ${issues.map(issue => `
        <div class="issue ${issue.severity || 'medium'}">
          <div class="issue-header">
            <span class="issue-rule">${issue.ruleId || 'QA-UNKNOWN'}</span>
            <span class="issue-file">${issue.filePath}:${issue.line || '?'}</span>
          </div>
          <div class="issue-message">${issue.message || '无描述'}</div>
          ${issue.suggestion ? `
            <div class="issue-suggestion">
              <strong>💡 建议：</strong>${issue.suggestion}
            </div>
          ` : ''}
        </div>
      `).join('')}
    </div>
    ` : `
    <div class="issues">
      <div style="text-align: center; padding: 40px; color: #27ae60;">
        <h2>🎉 未发现问题</h2>
        <p>代码实现完全符合需求！</p>
      </div>
    </div>
    `}

    <div class="footer">
      <p>由 AI QA Reviewer 生成 | ${new Date().toLocaleString('zh-CN')}</p>
    </div>
  </div>
</body>
</html>`;
  }

  /**
   * 生成 Markdown 报告
   */
  async generateMarkdown(report, options = {}) {
    this.ensureReportDir();

    const filename = options.filename || this.generateReportName('md');
    const filepath = path.join(this.reportPath, filename);

    const markdown = this.buildMarkdownReport(report);

    fs.writeFileSync(filepath, markdown, 'utf8');

    return filepath;
  }

  /**
   * 构建 Markdown 报告
   */
  buildMarkdownReport(report) {
    const { totalIssues, bySeverity, issues } = report;

    let md = `# AI QA Reviewer 报告\n\n`;
    md += `**生成时间**: ${new Date().toLocaleString('zh-CN')}\n`;
    md += `**总问题数**: ${totalIssues}\n\n`;

    md += `## 📊 审查摘要\n\n`;
    md += `| 严重程度 | 数量 |\n`;
    md += `|----------|------|\n`;
    md += `| 🔴 高优先级 | ${bySeverity?.high || 0} |\n`;
    md += `| 🟡 中优先级 | ${bySeverity?.medium || 0} |\n`;
    md += `| 🟢 低优先级 | ${bySeverity?.low || 0} |\n\n`;

    if (issues.length > 0) {
      md += `## 📋 问题列表\n\n`;

      // 按严重程度分组
      const grouped = {
        high: issues.filter(i => (i.severity || 'medium') === 'high'),
        medium: issues.filter(i => (i.severity || 'medium') === 'medium'),
        low: issues.filter(i => (i.severity || 'medium') === 'low'),
      };

      Object.entries(grouped).forEach(([severity, items]) => {
        if (items.length === 0) return;

        const icon = { high: '🔴', medium: '🟡', low: '🟢' }[severity];
        md += `### ${icon} ${severity.toUpperCase()} 优先级 (${items.length})\n\n`;

        items.forEach((issue, index) => {
          md += `#### ${index + 1}. [${issue.ruleId || 'QA-UNKNOWN'}] ${issue.filePath}:${issue.line || '?'}\n\n`;
          md += `**描述**: ${issue.message || '无描述'}\n\n`;
          if (issue.suggestion) {
            md += `**建议**: ${issue.suggestion}\n\n`;
          }
          md += `---\n\n`;
        });
      });
    } else {
      md += `## 🎉 未发现问题\n\n`;
      md += `代码实现完全符合需求！\n\n`;
    }

    md += `---\n\n`;
    md += `<p style="text-align: center; color: #888;">由 AI QA Reviewer 生成</p>\n`;

    return md;
  }

  /**
   * 生成控制台输出报告
   */
  generateConsoleReport(report) {
    const lines = [];

    lines.push('');
    lines.push('═'.repeat(60));
    lines.push('🔍 AI QA Reviewer 报告');
    lines.push('═'.repeat(60));
    lines.push(`生成时间: ${new Date().toLocaleString('zh-CN')}`);
    lines.push(`总问题数: ${report.totalIssues}`);
    lines.push('');

    // 严重程度统计
    const { bySeverity } = report;
    lines.push('📊 严重程度分布:');
    lines.push(`  🔴 高优先级: ${bySeverity?.high || 0}`);
    lines.push(`  🟡 中优先级: ${bySeverity?.medium || 0}`);
    lines.push(`  🟢 低优先级: ${bySeverity?.low || 0}`);
    lines.push('');

    // 问题列表
    if (report.issues && report.issues.length > 0) {
      lines.push('📋 问题列表:');
      lines.push('');

      report.issues.forEach((issue, index) => {
        const severityIcon = {
          high: '🔴',
          medium: '🟡',
          low: '🟢',
        }[issue.severity || 'medium'];

        lines.push(`${index + 1}. ${severityIcon} [${issue.ruleId || 'QA-UNKNOWN'}] ${issue.filePath}:${issue.line || '?'}`);
        lines.push(`   ${issue.message || '无描述'}`);
        if (issue.suggestion) {
          lines.push(`   💡 ${issue.suggestion}`);
        }
        lines.push('');
      });
    } else {
      lines.push('🎉 未发现问题，代码实现完全符合需求！');
      lines.push('');
    }

    lines.push('═'.repeat(60));

    return lines.join('\n');
  }

  /**
   * 生成 TODO 注释格式
   */
  formatTODO(issue) {
    const { ruleId, message, suggestion } = issue;
    return `//TODO: [${ruleId}] ${message} - ${suggestion || '需要修复'}`;
  }

  /**
   * 自动生成所有格式的报告
   */
  async generateAll(report, options = {}) {
    const formats = options.formats || ['json', 'html', 'markdown'];
    const files = {};

    for (const format of formats) {
      try {
        switch (format) {
          case 'json':
            files.json = await this.generateJSON(report);
            break;
          case 'html':
            files.html = await this.generateHTML(report);
            break;
          case 'markdown':
            files.markdown = await this.generateMarkdown(report);
            break;
        }
      } catch (e) {
        console.error(`[ReportGenerator] 生成 ${format} 报告失败:`, e.message);
      }
    }

    return files;
  }
}

module.exports = ReportGenerator;
