/**
 * 综合视觉比对服务
 *
 * 结合像素级比对和 AI 视觉分析
 *
 * 功能：
 * 1. 像素级比对（快速筛选）
 * 2. AI 视觉比对（语义分析）
 * 3. 生成综合报告
 */

const fs = require('fs');
const path = require('path');
const { getLogger } = require('../utils/logger');

class VisualComparisonService {
  constructor(options = {}) {
    this.options = {
      pixelThreshold: options.pixelThreshold || 0.1,
      layoutThreshold: options.layoutThreshold || 2,
      enableAIAnalysis: options.enableAIAnalysis !== false,
      enablePixelComparison: options.enablePixelComparison !== false,
      ...options,
    };

    this.logger = getLogger('VisualComparisonService');
    this.visualRegressionTester = null;
    this.llmRouter = null;
  }

  /**
   * 初始化
   */
  async initialize() {
    // 延迟加载 VisualRegressionTester（canvas 是可选依赖）
    try {
      const VisualRegressionTester = require('./visual-regression');
      this.visualRegressionTester = new VisualRegressionTester();
      this.logger.info('VisualRegressionTester loaded');
    } catch (error) {
      this.logger.warn('VisualRegressionTester not available:', error.message);
    }

    // 获取 LLM Router
    if (options.llmRouter) {
      this.llmRouter = options.llmRouter;
    }
  }

  /**
   * 综合比对两张图片
   * @param {string} expectedImagePath - 预期图片路径（规格图）
   * @param {string} actualImagePath - 实际图片路径（运行截图）
   * @param {Object} options - 选项
   * @returns {Promise<Object>} 综合比对结果
   */
  async compare(expectedImagePath, actualImagePath, options = {}) {
    const {
      testContext = '',  // 测试上下文信息
      outputDir = null,   // 输出目录
      requirements = '',  // 需求描述
    } = options;

    this.logger.info('Starting comprehensive visual comparison', {
      expected: expectedImagePath,
      actual: actualImagePath,
    });

    const result = {
      timestamp: new Date().toISOString(),
      expectedPath: expectedImagePath,
      actualPath: actualImagePath,
      testContext,
      pixelComparison: null,
      aiComparison: null,
      overallStatus: 'unknown',
      summary: '',
      diffImagePath: null,
      heatmapPath: null,
    };

    // 步骤1: 像素级比对（快速筛选）
    if (this.options.enablePixelComparison && this.visualRegressionTester) {
      this.logger.info('Running pixel-level comparison...');

      try {
        result.pixelComparison = await this.visualRegressionTester.compareImages(
          expectedImagePath,
          actualImagePath,
          {
            method: 'pixelmatch',
            threshold: this.options.pixelThreshold,
            generateDiff: true,
            generateHeatmap: true,
            outputDir: outputDir || path.dirname(expectedImagePath),
          }
        );

        if (result.pixelComparison.success) {
          result.diffImagePath = result.pixelComparison.diffImagePath;
          result.heatmapPath = result.pixelComparison.heatmapPath;
          this.logger.info('Pixel comparison completed', {
            different: result.pixelComparison.different,
            diffPercentage: result.pixelComparison.diffPercentage,
          });
        } else {
          this.logger.warn('Pixel comparison failed:', result.pixelComparison.error);
        }
      } catch (error) {
        this.logger.error('Pixel comparison error:', error.message);
      }
    }

    // 步骤2: AI 视觉比对（语义分析）
    if (this.options.enableAIAnalysis && this.llmRouter && typeof this.llmRouter.analyzeVision === 'function') {
      this.logger.info('Running AI vision comparison...');

      try {
        result.aiComparison = await this.compareWithAI(expectedImagePath, actualImagePath, {
          testContext,
          requirements,
        });
        this.logger.info('AI comparison completed', {
          issues: result.aiComparison.issues?.length || 0,
        });
      } catch (error) {
        this.logger.error('AI comparison error:', error.message);
        result.aiComparison = {
          success: false,
          error: error.message,
          issues: [],
        };
      }
    }

    // 步骤3: 计算总体状态
    result.overallStatus = this.calculateOverallStatus(result);
    result.summary = this.generateSummary(result);

    return result;
  }

  /**
   * 使用 AI 进行视觉比对
   * @param {string} expectedPath - 预期图片路径
   * @param {string} actualPath - 实际图片路径
   * @param {Object} options - 选项
   * @returns {Promise<Object>} AI 比对结果
   */
  async compareWithAI(expectedPath, actualPath, options = {}) {
    const { testContext = '', requirements = '' } = options;

    // 读取两张图片
    const fs = require('fs');
    const img1Buffer = fs.readFileSync(expectedPath);
    const img2Buffer = fs.readFileSync(actualPath);

    // 转换为 base64
    const img1Base64 = `data:${this.getMimeType(expectedPath)};base64,${img1Buffer.toString('base64')}`;
    const img2Base64 = `data:${this.getMimeType(actualPath)};base64,${img2Buffer.toString('base64')}`;

    // 构建 AI 提示词
    const prompt = this.buildAIComparisonPrompt(testContext, requirements);

    // 调用 AI 进行视觉比对
    const visionClient = this.llmRouter.clients.get('zhipu-vision');
    if (!visionClient) {
      throw new Error('Vision client not available');
    }

    const result = await visionClient.chat([
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: prompt + '\n\n这是第一张图片（预期/设计稿）：',
          },
          {
            type: 'image_url',
            image_url: { url: img1Base64 },
          },
          {
            type: 'text',
            text: '\n\n这是第二张图片（实际/运行截图）：',
          },
          {
            type: 'image_url',
            image_url: { url: img2Base64 },
          },
          {
            type: 'text',
            text: '\n\n请分析这两张图片的差异，严格按照 JSON 格式输出。',
          },
        ],
      },
    ], {
      temperature: 0.3,
      maxTokens: 4000,
    });

    if (result.success) {
      return this.parseAIComparisonResult(result.content);
    } else {
      throw new Error(result.error || 'AI comparison failed');
    }
  }

  /**
   * 构建 AI 比对提示词
   */
  buildAIComparisonPrompt(testContext, requirements) {
    let prompt = `你是一个资深的视觉测试专家。请比较这两张UI截图的差异。

【测试上下文】
${testContext || '无'}

${requirements ? `【需求描述】\n${requirements}` : ''}

【比对要点】
请仔细比较以下方面：
1. 元素缺失 - 第二张图是否缺少第一张图中的元素
2. 元素多余 - 第二张图是否多了第一张图中没有的元素
3. 布局差异 - 元素位置、间距、对齐是否一致
4. 样式差异 - 颜色、字体、大小是否一致
5. 内容差异 - 文字内容是否正确
6. 状态差异 - 按钮/表单的启用/禁用状态是否正确

【输出格式】
请严格按照以下 JSON 格式输出：

\`\`\`json
{
  "overallStatus": "passed|failed|partial",
  "summary": "总体评价，简述主要差异",
  "differences": [
    {
      "category": "missing|extra|layout|style|content|state",
      "severity": "high|medium|low",
      "element": "具体的元素名称或描述",
      "expected": "预期状态的描述",
      "actual": "实际状态的描述",
      "location": "差异位置（如：左上角、登录表单等）",
      "suggestion": "修复建议"
    }
  ],
  "similarities": [
    "一致的地方1",
    "一致的地方2"
  ]
}
\`\`\`

请开始分析。`;
    return prompt;
  }

  /**
   * 解析 AI 比对结果
   */
  parseAIComparisonResult(content) {
    try {
      // 提取 JSON
      let jsonStr = content;

      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      } else {
        const braceMatch = content.match(/\{[\s\S]*\}/);
        if (braceMatch) {
          jsonStr = braceMatch[0];
        }
      }

      const result = JSON.parse(jsonStr);

      // 转换为标准格式
      const issues = (result.differences || []).map(diff => ({
        ruleId: `VISUAL-${diff.category.toUpperCase()}`,
        severity: diff.severity || 'medium',
        filePath: 'Visual_Comparison',
        line: 0,
        message: `${diff.element}: ${diff.expected} vs ${diff.actual}`,
        suggestion: diff.suggestion || '',
        source: 'ai-vision-comparison',
        category: 'visual-diff',
        element: diff.element,
        location: diff.location,
        expected: diff.expected,
        actual: diff.actual,
      }));

      return {
        success: true,
        overallStatus: result.overallStatus,
        summary: result.summary,
        issues,
        similarities: result.similarities || [],
      };
    } catch (error) {
      this.logger.warn('Failed to parse AI comparison result:', error.message);
      return {
        success: true,
        overallStatus: 'unknown',
        summary: 'AI 分析结果解析失败',
        issues: [],
      };
    }
  }

  /**
   * 计算总体状态
   */
  calculateOverallStatus(result) {
    // 如果像素级比对显示有差异
    if (result.pixelComparison?.success && result.pixelComparison?.different) {
      return 'failed';
    }

    // 如果 AI 分析发现问题
    if (result.aiComparison?.success) {
      const highIssues = result.aiComparison.issues?.filter(i => i.severity === 'high').length || 0;
      if (highIssues > 0) {
        return 'failed';
      }
      const mediumIssues = result.aiComparison.issues?.filter(i => i.severity === 'medium').length || 0;
      if (mediumIssues > 0) {
        return 'partial';
      }
    }

    return 'passed';
  }

  /**
   * 生成摘要
   */
  generateSummary(result) {
    const parts = [];

    // 像素级比对结果
    if (result.pixelComparison?.success) {
      if (result.pixelComparison.different) {
        parts.push(`像素级比对发现 ${Math.round(result.pixelComparison.diffPercentage * 100)}% 差异`);
      } else {
        parts.push('像素级比对通过');
      }
    }

    // AI 分析结果
    if (result.aiComparison?.success && result.aiComparison.summary) {
      parts.push(`AI 分析: ${result.aiComparison.summary}`);
    }

    // AI 发现的问题数量
    if (result.aiComparison?.issues) {
      const issueCount = result.aiComparison.issues.length;
      if (issueCount > 0) {
        parts.push(`发现 ${issueCount} 个视觉差异`);
      }
    }

    return parts.join('\n') || '比对完成';
  }

  /**
   * 获取 MIME 类型
   */
  getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp'
    };
    return mimeTypes[ext] || 'image/png';
  }

  /**
   * 批量比对
   * @param {Array} pairs - 图片对数组 [{ expected, actual, context }]
   * @param {Object} options - 选项
   * @returns {Promise<Array>} 比对结果数组
   */
  async batchCompare(pairs, options = {}) {
    this.logger.info(`Starting batch comparison of ${pairs.length} pairs`);

    const results = [];
    for (let i = 0; i < pairs.length; i++) {
      const pair = pairs[i];
      this.logger.info(`Comparing pair ${i + 1}/${pairs.length}`, {
        expected: pair.expected,
        actual: pair.actual,
      });

      try {
        const result = await this.compare(pair.expected, pair.actual, {
          testContext: pair.context || options.testContext,
          outputDir: options.outputDir,
          requirements: pair.requirements || options.requirements,
        });
        results.push({
          index: i,
          ...result,
        });
      } catch (error) {
        this.logger.error(`Pair ${i + 1} comparison failed:`, error.message);
        results.push({
          index: i,
          expected: pair.expected,
          actual: pair.actual,
          success: false,
          error: error.message,
        });
      }
    }

    return results;
  }

  /**
   * 生成 HTML 报告
   * @param {Object|Array} comparisonResult - 比对结果（单个或批量）
   * @param {string} outputPath - 输出路径
   */
  async generateHTMLReport(comparisonResult, outputPath) {
    const isArray = Array.isArray(comparisonResult);
    const results = isArray ? comparisonResult : [comparisonResult];

    const html = this.buildHTMLReport(results);

    // 确保目录存在
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // 写入文件
    fs.writeFileSync(outputPath, html, 'utf8');

    this.logger.info('HTML report generated', { path: outputPath });
    return outputPath;
  }

  /**
   * 构建 HTML 报告
   */
  buildHTMLReport(results) {
    const timestamp = new Date().toISOString();
    const totalTests = results.length;
    const passed = results.filter(r => r.overallStatus === 'passed').length;
    const failed = results.filter(r => r.overallStatus === 'failed').length;
    const partial = results.filter(r => r.overallStatus === 'partial').length;

    let issuesHTML = '';
    results.forEach((result, index) => {
      if (result.aiComparison?.issues) {
        result.aiComparison.issues.forEach(issue => {
          issuesHTML += `
            <tr class="issue-${issue.severity}">
              <td>${index + 1}</td>
              <td>${issue.category || 'N/A'}</td>
              <td>${issue.element || 'N/A'}</td>
              <td>${issue.message || ''}</td>
              <td>${issue.suggestion || ''}</td>
            </tr>
          `;
        });
      }
    });

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>视觉比对报告</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
    .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    h1 { color: #333; border-bottom: 2px solid #007bff; padding-bottom: 10px; }
    .summary { display: flex; gap: 20px; margin: 20px 0; }
    .summary-card { flex: 1; padding: 20px; border-radius: 6px; text-align: center; }
    .summary-card.passed { background: #d4edda; }
    .summary-card.failed { background: #f8d7da; }
    .summary-card.partial { background: #fff3cd; }
    .summary-number { font-size: 32px; font-weight: bold; }
    .summary-label { color: #666; margin-top: 5px; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background: #007bff; color: white; }
    tr.issue-high { background: #ffebee; }
    tr.issue-medium { background: #fff9e6; }
    tr.issue-low { background: #f1f8e9; }
    .comparison-item { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 6px; }
    .comparison-item h3 { margin-top: 0; }
    .status-passed { color: #28a745; }
    .status-failed { color: #dc3545; }
    .status-partial { color: #ffc107; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🔍 视觉比对报告</h1>
    <p>生成时间: ${timestamp}</p>

    <div class="summary">
      <div class="summary-card passed">
        <div class="summary-number">${passed}</div>
        <div class="summary-label">通过</div>
      </div>
      <div class="summary-card partial">
        <div class="summary-number">${partial}</div>
        <div class="summary-label">部分通过</div>
      </div>
      <div class="summary-card failed">
        <div class="summary-number">${failed}</div>
        <div class="summary-label">失败</div>
      </div>
    </div>

    ${results.length > 1 ? '<h2>比对结果详情</h2>' : '<h2>比对结果</h2>'}

    ${results.map((result, index) => `
      <div class="comparison-item">
        <h3>测试 #${result.index + 1 || index + 1} - <span class="status-${result.overallStatus}">${result.overallStatus === 'passed' ? '通过' : result.overallStatus === 'failed' ? '失败' : '部分通过'}</span></h3>
        <p><strong>预期:</strong> ${result.expectedPath}</p>
        <p><strong>实际:</strong> ${result.actualPath}</p>
        <p><strong>摘要:</strong> ${result.summary || '无'}</p>
        ${result.diffImagePath ? `<p><strong>差异图:</strong> <img src="${path.basename(result.diffImagePath)}" style="max-width: 300px; border: 1px solid #ddd;"></p>` : ''}
      </div>
    `).join('')}

    ${issuesHTML ? `
      <h2>发现的问题</h2>
      <table>
        <thead>
          <tr>
            <th>测试#</th>
            <th>类别</th>
            <th>元素</th>
            <th>描述</th>
            <th>建议</th>
          </tr>
        </thead>
        <tbody>
          ${issuesHTML}
        </tbody>
      </table>
    ` : '<p style="color: #28a745;">✅ 未发现视觉差异</p>'}
  </div>
</body>
</html>`;
  }
}

module.exports = VisualComparisonService;
