/**
 * Enhanced Test Reporter
 *
 * 增强的测试报告生成器
 * 包含详细的执行记录、失败分析和修复建议
 *
 * 报告内容：
 * - Test Summary
 * - 步骤执行记录
 * - 成功/失败状态
 * - 失败原因分析
 * - 截图
 * - UI差异（如果有）
 * - 建议修复
 */

const fs = require('fs');
const path = require('path');

class EnhancedTestReporter {
  constructor(options = {}) {
    this.outputDir = options.outputDir || './test-reports';
    this.screenshotDir = options.screenshotDir || './test-screenshots';
    this.enableAIAnalysis = options.enableAIAnalysis !== false;
    this.llm = options.llm || null;

    // 确保输出目录存在
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * 生成增强的测试报告
   * @param {Object} testData - 测试数据
   * @returns {Object} 报告
   */
  async generateReport(testData) {
    const report = {
      timestamp: new Date().toISOString(),
      summary: this.generateSummary(testData),
      testCases: [],
      overall: {
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        passRate: 0,
      },
    };

    // 处理每个测试用例
    if (testData.testCases && Array.isArray(testData.testCases)) {
      for (const testCase of testData.testCases) {
        const caseReport = await this.generateTestCaseReport(testCase, testData);
        report.testCases.push(caseReport);

        if (caseReport.status === 'passed') {
          report.overall.passed++;
        } else if (caseReport.status === 'failed') {
          report.overall.failed++;
        } else {
          report.overall.skipped++;
        }
        report.overall.total++;
      }
    }

    // 计算总体通过率
    if (report.overall.total > 0) {
      report.overall.passRate = ((report.overall.passed / report.overall.total) * 100).toFixed(2) + '%';
    }

    return report;
  }

  /**
   * 生成测试用例报告
   * @param {Object} testCase - 测试用例
   * @param {Object} context - 上下文
   * @returns {Object} 测试用例报告
   */
  async generateTestCaseReport(testCase, context) {
    const report = {
      id: testCase.id,
      name: testCase.name || testCase.description,
      description: testCase.description,
      status: testCase.status || 'unknown',
      duration: testCase.duration || 0,
      steps: [],
      issues: [],
      screenshots: [],
      analysis: null,
      suggestions: [],
    };

    // 处理执行步骤
    if (testCase.steps && Array.isArray(testCase.steps)) {
      for (let i = 0; i < testCase.steps.length; i++) {
        const step = testCase.steps[i];
        const stepReport = {
          number: i + 1,
          description: step.description || step.action,
          status: step.success ? 'passed' : 'failed',
          duration: step.duration || 0,
          action: step.action,
          target: step.target,
          expected: step.expected,
          actual: step.actual,
          error: step.error,
          screenshot: step.screenshot,
        };

        report.steps.push(stepReport);

        if (stepReport.screenshot) {
          report.screenshots.push({
            step: i + 1,
            path: stepReport.screenshot,
          });
        }

        // 收集失败信息
        if (!step.success) {
          const issue = {
            step: i + 1,
            description: step.description,
            error: step.error,
            type: this.classifyError(step.error),
            severity: this.assessSeverity(step.error),
          };

          report.issues.push(issue);
        }
      }
    }

    // AI 分析（如果启用）
    if (this.enableAIAnalysis && this.llm && report.issues.length > 0) {
      report.analysis = await this.analyzeFailure(testCase, report, context);
      report.suggestions = await this.generateSuggestions(testCase, report, context);
    }

    return report;
  }

  /**
   * 生成摘要
   * @param {Object} testData - 测试数据
   * @returns {Object} 摘要
   */
  generateSummary(testData) {
    return {
      testName: testData.testName || 'Test Run',
      startTime: testData.startTime || new Date().toISOString(),
      endTime: testData.endTime || new Date().toISOString(),
      duration: testData.duration || 0,
      environment: testData.environment || {},
      framework: testData.framework || 'Unknown',
    };
  }

  /**
   * AI 分析失败原因
   * @param {Object} testCase - 测试用例
   * @param {Object} caseReport - 用例报告
   * @param {Object} context - 上下文
   * @returns {Object} 分析结果
   */
  async analyzeFailure(testCase, caseReport, context) {
    if (!this.llm) {
      return null;
    }

    try {
      const prompt = this.buildAnalysisPrompt(testCase, caseReport, context);

      const response = await this.llm.complete({
        messages: [
          {
            role: 'system',
            content: '你是一个智能测试分析助手，负责分析测试失败的原因。',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
      });

      return this.parseAnalysisResponse(response);
    } catch (error) {
      this.log('warn', 'AI 分析失败', { error: error.message });
      return null;
    }
  }

  /**
   * 生成修复建议
   * @param {Object} testCase - 测试用例
   * @param {Object} caseReport - 用例报告
   * @param {Object} context - 上下文
   * @returns {Array} 建议列表
   */
  async generateSuggestions(testCase, caseReport, context) {
    if (!this.llm) {
      return this.ruleBasedSuggestions(caseReport);
    }

    try {
      const prompt = this.buildSuggestionPrompt(testCase, caseReport, context);

      const response = await this.llm.complete({
        messages: [
          {
            role: 'system',
            content: '你是一个智能修复建议助手，负责提供测试失败的修复建议。',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.4,
      });

      return this.parseSuggestionResponse(response);
    } catch (error) {
      this.log('warn', 'AI 建议生成失败，使用规则', { error: error.message });
      return this.ruleBasedSuggestions(caseReport);
    }
  }

  /**
   * 构建分析提示词
   */
  buildAnalysisPrompt(testCase, caseReport, context) {
    let prompt = `请分析以下测试失败的原因：\n\n`;
    prompt += `## 测试用例\n`;
    prompt += `名称: ${testCase.name}\n`;
    prompt += `描述: ${testCase.description}\n\n`;

    prompt += `## 执行步骤\n`;
    caseReport.steps.forEach((step) => {
      prompt += `${step.number}. ${step.description} - ${step.status === 'passed' ? '✓' : '✗'}\n`;
      if (step.error) {
        prompt += `   错误: ${step.error}\n`;
      }
    });

    prompt += `\n## 失败步骤详情\n`;
    const failedSteps = caseReport.steps.filter(s => s.status === 'failed');
    failedSteps.forEach((step) => {
      prompt += `- 步骤 ${step.number}: ${step.description}\n`;
      prompt += `  操作: ${step.action}\n`;
      prompt += `  目标: ${step.target}\n`;
      if (step.expected) {
        prompt += `  预期: ${step.expected}\n`;
      }
      if (step.actual) {
        prompt += `  实际: ${step.actual}\n`;
      }
      if (step.error) {
        prompt += `  错误: ${step.error}\n`;
      }
    });

    prompt += `\n请分析：\n`;
    prompt += `1. 失败的可能原因（多个）\n`;
    prompt += `2. 每个原因的可能性\n`;
    prompt += `3. 如何验证每个原因\n\n`;

    prompt += `返回 JSON 格式：\n`;
    prompt += `{\n`;
    prompt += `  "possibleCauses": [\n`;
    prompt += `    { "cause": "...", "likelihood": "high/medium/low", "verification": "..." }\n`;
    prompt += `  ],\n`;
    prompt += `  "rootCause": "...",\n`;
    prompt += `  "category": "frontend/backend/data/environment"\n`;
    prompt += `}\n`;

    return prompt;
  }

  /**
   * 构建建议提示词
   */
  buildSuggestionPrompt(testCase, caseReport, context) {
    let prompt = `请提供以下测试失败的修复建议：\n\n`;

    prompt += `## 测试用例\n`;
    prompt += `名称: ${testCase.name}\n\n`;

    if (caseReport.analysis) {
      prompt += `## 失败分析\n`;
      prompt += `根本原因: ${caseReport.analysis.rootCause}\n`;
      prompt += `类别: ${caseReport.analysis.category}\n\n`;
    }

    prompt += `## 可能原因\n`;
    if (caseReport.analysis?.possibleCauses) {
      caseReport.analysis.possibleCauses.forEach((cause, index) => {
        prompt += `${index + 1}. ${cause.cause} (${cause.likelihood})\n`;
      });
    }

    prompt += `\n请提供具体的修复建议：\n`;
    prompt += `1. 需要修改什么\n`;
    prompt += `2. 如何修改\n`;
    prompt += `3. 验证方法\n\n`;

    prompt += `返回 JSON 格式：\n`;
    prompt += `{\n`;
    prompt += `  "suggestions": [\n`;
    prompt += `    { "what": "...", "how": "...", "verify": "..." }\n`;
    prompt += `  ]\n`;
    prompt += `}\n`;

    return prompt;
  }

  /**
   * 解析分析响应
   */
  parseAnalysisResponse(response) {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      this.log('warn', '解析分析响应失败');
    }
    return null;
  }

  /**
   * 解析建议响应
   */
  parseSuggestionResponse(response) {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return parsed.suggestions || [];
      }
    } catch (error) {
      this.log('warn', '解析建议响应失败');
    }
    return [];
  }

  /**
   * 基于规则的建议
   */
  ruleBasedSuggestions(caseReport) {
    const suggestions = [];

    for (const issue of caseReport.issues) {
      const error = issue.error;

      if (error?.includes('not found') || error?.includes('找不到')) {
        suggestions.push({
          what: '元素未找到',
          how: '1. 检查选择器是否正确\n2. 等待元素加载\n3. 检查元素是否在 iframe 中',
          verify: '使用浏览器开发工具检查元素',
        });
      } else if (error?.includes('timeout') || error?.includes('超时')) {
        suggestions.push({
          what: '操作超时',
          how: '1. 增加超时时间\n2. 检查网络连接\n3. 检查页面性能',
          verify: '重新运行测试并监控网络请求',
        });
      } else if (error?.includes('visible') || error?.includes('可见')) {
        suggestions.push({
          what: '元素不可见',
          how: '1. 滚动到元素位置\n2. 检查 CSS 显示属性\n3. 等待动画完成',
          verify: '检查元素的 computed styles',
        });
      } else if (error?.includes('count') || error?.includes('数量')) {
        suggestions.push({
          what: '元素数量不匹配',
          how: '1. 检查数据源\n2. 检查分页逻辑\n3. 检查过滤条件',
          verify: '检查后端 API 返回的数据',
        });
      } else {
        suggestions.push({
          what: '通用错误',
          how: '1. 检查错误日志\n2. 查看控制台输出\n3. 检查网络请求',
          verify: '查看完整的错误堆栈',
        });
      }
    }

    return suggestions;
  }

  /**
   * 分类错误
   */
  classifyError(error) {
    if (!error) return 'unknown';

    const errorStr = error.toLowerCase();

    if (errorStr.includes('not found') || errorStr.includes('找不到')) {
      return 'element_not_found';
    } else if (errorStr.includes('timeout') || errorStr.includes('超时')) {
      return 'timeout';
    } else if (errorStr.includes('visible') || errorStr.includes('可见')) {
      return 'not_visible';
    } else if (errorStr.includes('count') || errorStr.includes('数量')) {
      return 'count_mismatch';
    } else if (errorStr.includes('assert') || errorStr.includes('断言')) {
      return 'assertion_failed';
    } else if (errorStr.includes('network') || errorStr.includes('网络')) {
      return 'network_error';
    } else {
      return 'unknown';
    }
  }

  /**
   * 评估严重性
   */
  assessSeverity(error) {
    const type = this.classifyError(error);

    const severityMap = {
      'element_not_found': 'high',
      'timeout': 'medium',
      'not_visible': 'medium',
      'count_mismatch': 'medium',
      'assertion_failed': 'high',
      'network_error': 'critical',
      'unknown': 'medium',
    };

    return severityMap[type] || 'medium';
  }

  /**
   * 生成 Markdown 报告
   * @param {Object} report - 报告数据
   * @returns {string} Markdown 报告
   */
  generateMarkdownReport(report) {
    let markdown = `# 测试报告\n\n`;
    markdown += `**生成时间：** ${report.timestamp}\n\n`;

    // 摘要
    markdown += `## 测试摘要\n\n`;
    markdown += `- **测试名称：** ${report.summary.testName}\n`;
    markdown += `- **开始时间：** ${report.summary.startTime}\n`;
    markdown += `- **结束时间：** ${report.summary.endTime}\n`;
    markdown += `- **执行时间：** ${(report.summary.duration / 1000).toFixed(2)}s\n`;
    markdown += `- **框架：** ${report.summary.framework}\n\n`;

    // 总体结果
    markdown += `## 总体结果\n\n`;
    markdown += `- **总用例：** ${report.overall.total}\n`;
    markdown += `- **通过：** ${report.overall.passed}\n`;
    markdown += `- **失败：** ${report.overall.failed}\n`;
    markdown += `- **跳过：** ${report.overall.skipped}\n`;
    markdown += `- **通过率：** ${report.overall.passRate}\n\n`;

    // 测试用例详情
    markdown += `## 测试用例详情\n\n`;

    for (const testCase of report.testCases) {
      const statusIcon = testCase.status === 'passed' ? '✅' : '❌';
      markdown += `### ${statusIcon} ${testCase.name}\n\n`;

      markdown += `- **状态：** ${testCase.status}\n`;
      markdown += `- **耗时：** ${(testCase.duration / 1000).toFixed(2)}s\n`;
      markdown += `- **步骤数：** ${testCase.steps.length}\n\n`;

      // 步骤详情
      markdown += `#### 执行步骤\n\n`;
      for (const step of testCase.steps) {
        const stepIcon = step.status === 'passed' ? '✓' : '✗';
        markdown += `${step.number}. ${stepIcon} ${step.description}\n`;

        if (step.error) {
          markdown += `   **错误：** ${step.error}\n`;
        }
        if (step.screenshot) {
          markdown += `   **截图：** ${step.screenshot}\n`;
        }
        markdown += `\n`;
      }

      // 失败分析
      if (testCase.issues.length > 0) {
        markdown += `#### 失败分析\n\n`;

        // AI 分析
        if (testCase.analysis) {
          markdown += `**根本原因：** ${testCase.analysis.rootCause}\n\n`;
          markdown += `**类别：** ${testCase.analysis.category}\n\n`;

          if (testCase.analysis.possibleCauses) {
            markdown += `**可能原因：**\n`;
            for (const cause of testCase.analysis.possibleCauses) {
              markdown += `- ${cause.cause} (${cause.likelihood})\n`;
              markdown += `  验证：${cause.verification}\n`;
            }
            markdown += `\n`;
          }
        }

        // 修复建议
        if (testCase.suggestions.length > 0) {
          markdown += `#### 修复建议\n\n`;

          for (let i = 0; i < testCase.suggestions.length; i++) {
            const suggestion = testCase.suggestions[i];
            markdown += `**建议 ${i + 1}：**\n`;
            markdown += `- **问题：** ${suggestion.what}\n`;
            markdown += `- **修复方法：**\n`;
            markdown += `  ${suggestion.how.replace(/\n/g, '\n  ')}\n`;
            markdown += `- **验证方法：** ${suggestion.verify}\n\n`;
          }
        }
      }

      markdown += `---\n\n`;
    }

    return markdown;
  }

  /**
   * 生成 HTML 报告
   * @param {Object} report - 报告数据
   * @returns {string} HTML 报告
   */
  generateHTMLReport(report) {
    // 简化实现，实际可以更复杂
    let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>测试报告</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    .passed { color: green; }
    .failed { color: red; }
    .step { margin: 10px 0; padding: 10px; border-left: 3px solid #ccc; }
    .suggestion { background: #f0f0f0; padding: 10px; margin: 10px 0; }
  </style>
</head>
<body>
  <h1>测试报告</h1>
  <p>生成时间：${report.timestamp}</p>

  <h2>总体结果</h2>
  <p>总用例：${report.overall.total}</p>
  <p>通过：${report.overall.passed}</p>
  <p>失败：${report.overall.failed}</p>
  <p>通过率：${report.overall.passRate}</p>
`;

    for (const testCase of report.testCases) {
      html += `
  <h3>${testCase.name}</h3>
  <p>状态：${testCase.status}</p>
  <p>耗时：${(testCase.duration / 1000).toFixed(2)}s</p>

  <h4>执行步骤</h4>
`;

      for (const step of testCase.steps) {
        html += `
  <div class="step">
    <p>${step.number}. ${step.description} - <span class="${step.status}">${step.status}</span></p>
`;
        if (step.error) {
          html += `    <p style="color: red;">错误：${step.error}</p>\n`;
        }
        html += `  </div>\n`;
      }

      if (testCase.suggestions.length > 0) {
        html += `  <h4>修复建议</h4>\n`;
        for (const suggestion of testCase.suggestions) {
          html += `
  <div class="suggestion">
    <p><strong>问题：</strong>${suggestion.what}</p>
    <p><strong>修复：</strong>${suggestion.how.replace(/\n/g, '<br>')}</p>
    <p><strong>验证：</strong>${suggestion.verify}</p>
  </div>
`;
        }
      }
    }

    html += `
</body>
</html>`;

    return html;
  }

  /**
   * 保存报告到文件
   * @param {Object} report - 报告数据
   * @param {string} format - 格式（json, markdown, html）
   * @returns {string} 文件路径
   */
  async saveReport(report, format = 'markdown') {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    let content;
    let extension;

    switch (format) {
      case 'json':
        content = JSON.stringify(report, null, 2);
        extension = 'json';
        break;
      case 'html':
        content = this.generateHTMLReport(report);
        extension = 'html';
        break;
      case 'markdown':
      default:
        content = this.generateMarkdownReport(report);
        extension = 'md';
        break;
    }

    const filename = `test-report-${timestamp}.${extension}`;
    const filepath = path.join(this.outputDir, filename);

    fs.writeFileSync(filepath, content, 'utf8');

    this.log('info', `报告已保存: ${filepath}`);

    return filepath;
  }

  /**
   * 日志
   */
  log(level, message, data = {}) {
    const logMethod = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    logMethod(`[EnhancedTestReporter] ${message}`, data);
  }
}

module.exports = EnhancedTestReporter;
