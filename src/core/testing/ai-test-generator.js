/**
 * AI Test Generator
 *
 * 使用 GLM-5 智能生成测试用例
 * 功能：
 * - 分析需求文档提取功能点
 * - 分析 Figma 设计提取 UI 组件
 * - 自然语言描述生成测试
 * - 自动生成选择器和验证规则
 * - 生成完整的 Playwright 测试代码
 */

const fs = require('fs');
const path = require('path');

class AITestGenerator {
  constructor(llmRouter = null) {
    this.llmRouter = llmRouter;
    this.templates = {
      requirementAnalysis: this.getRequirementAnalysisTemplate(),
      figmaAnalysis: this.getFigmaAnalysisTemplate(),
      testGeneration: this.getTestGenerationTemplate(),
      selectorGeneration: this.getSelectorGenerationTemplate(),
    };
  }

  /**
   * 设置 LLM 路由器
   * @param {Object} llmRouter - LLM 路由器实例
   */
  setLLMRouter(llmRouter) {
    this.llmRouter = llmRouter;
  }

  /**
   * 从需求文档生成测试用例
   * @param {string} requirementText - 需求文档文本
   * @param {Object} options - 选项
   * @returns {Promise<Object>} 生成的测试用例
   */
  async generateFromRequirement(requirementText, options = {}) {
    const {
      projectName = 'My Project',
      baseUrl = 'http://localhost:3000',
      testType = 'comprehensive', // basic, smoke, comprehensive, regression
      includeVisualTests = true,
      includeFunctionalTests = true,
      includeDataTests = true,
      includePerformanceTests = false,
    } = options;

    try {
      // 1. 分析需求文档
      const analysis = await this.analyzeRequirement(requirementText, options);

      if (!analysis.success) {
        return analysis;
      }

      // 2. 生成测试用例
      const testCases = this.generateTestCasesFromAnalysis(
        analysis.data,
        {
          projectName,
          baseUrl,
          testType,
          includeVisualTests,
          includeFunctionalTests,
          includeDataTests,
          includePerformanceTests,
        }
      );

      return {
        success: true,
        testCases,
        analysis: analysis.data,
        summary: {
          total: testCases.length,
          visual: testCases.filter(tc => tc.type === 'visual').length,
          functional: testCases.filter(tc => tc.type === 'functional').length,
          data: testCases.filter(tc => tc.type === 'data').length,
          performance: testCases.filter(tc => tc.type === 'performance').length,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 从 Figma 设计生成测试用例
   * @param {Object} figmaSpecs - Figma 设计规范
   * @param {Object} options - 选项
   * @returns {Object} 生成的测试用例
   */
  async generateFromFigma(figmaSpecs, options = {}) {
    const {
      baseUrl = 'http://localhost:3000',
      includeColorTests = true,
      includeSizeTests = true,
      includeFontTests = true,
      includeLayoutTests = true,
    } = options;

    try {
      // 使用 AI 分析 Figma 设计
      const analysis = await this.analyzeFigmaDesign(figmaSpecs, options);

      // 生成测试用例
      const testCases = this.generateTestCasesFromFigma(
        figmaSpecs,
        analysis,
        {
          baseUrl,
          includeColorTests,
          includeSizeTests,
          includeFontTests,
          includeLayoutTests,
        }
      );

      return {
        success: true,
        testCases,
        analysis,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 从自然语言描述生成测试
   * @param {string} description - 自然语言描述
   * @param {Object} options - 选项
   * @returns {Promise<Object>} 生成的测试用例
   */
  async generateFromDescription(description, options = {}) {
    const {
      context = '',
      baseUrl = 'http://localhost:3000',
    } = options;

    try {
      // 构建提示词
      const prompt = this.buildDescriptionPrompt(description, context, baseUrl);

      // 调用 LLM
      const response = await this.callLLM(prompt);

      // 解析响应
      const testCases = this.parseLLMTestCases(response);

      return {
        success: true,
        testCases,
        description,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 分析需求文档
   * @param {string} requirementText - 需求文本
   * @param {Object} options - 选项
   * @returns {Promise<Object>} 分析结果
   */
  async analyzeRequirement(requirementText, options = {}) {
    try {
      const prompt = this.templates.requirementAnalysis
        .replace('{{REQUIREMENT}}', requirementText)
        .replace('{{PROJECT_NAME}}', options.projectName || 'My Project')
        .replace('{{BASE_URL}}', options.baseUrl || 'http://localhost:3000');

      const response = await this.callLLM(prompt);

      // 解析 JSON 响应
      const analysis = this.extractJSON(response);

      return {
        success: true,
        data: analysis,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 分析 Figma 设计
   * @param {Object} figmaSpecs - Figma 规范
   * @param {Object} options - 选项
   * @returns {Promise<Object>} 分析结果
   */
  async analyzeFigmaDesign(figmaSpecs, options = {}) {
    try {
      const specsSummary = this.summarizeFigmaSpecs(figmaSpecs);
      const prompt = this.templates.figmaAnalysis
        .replace('{{FIGMA_SPECS}}', specsSummary)
        .replace('{{BASE_URL}}', options.baseUrl || 'http://localhost:3000');

      const response = await this.callLLM(prompt);

      // 解析 JSON 响应
      const analysis = this.extractJSON(response);

      return analysis;
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 生成选择器
   * @param {string} elementDescription - 元素描述
   * @param {string} context - 上下文
   * @returns {Promise<Object>} 选择器建议
   */
  async generateSelector(elementDescription, context = '') {
    try {
      const prompt = this.templates.selectorGeneration
        .replace('{{ELEMENT}}', elementDescription)
        .replace('{{CONTEXT}}', context);

      const response = await this.callLLM(prompt);

      const selectors = this.extractJSON(response);

      return {
        success: true,
        selectors,
        description: elementDescription,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 从分析结果生成测试用例
   * @param {Object} analysis - 分析结果
   * @param {Object} options - 选项
   * @returns {Array} 测试用例数组
   */
  generateTestCasesFromAnalysis(analysis, options = {}) {
    const testCases = [];
    const {
      projectName,
      baseUrl,
      testType,
      includeVisualTests,
      includeFunctionalTests,
      includeDataTests,
      includePerformanceTests,
    } = options;

    // 为每个功能点生成测试
    if (analysis.features && Array.isArray(analysis.features)) {
      for (const feature of analysis.features) {
        // 功能测试
        if (includeFunctionalTests) {
          testCases.push(...this.generateFunctionalTests(feature, baseUrl));
        }

        // 视觉测试
        if (includeVisualTests) {
          testCases.push(...this.generateVisualTests(feature, baseUrl));
        }

        // 数据测试
        if (includeDataTests && feature.dataValidation) {
          testCases.push(...this.generateDataTests(feature, baseUrl));
        }
      }
    }

    // 性能测试
    if (includePerformanceTests && analysis.performance) {
      testCases.push(...this.generatePerformanceTests(analysis.performance, baseUrl));
    }

    return testCases;
  }

  /**
   * 从 Figma 生成测试用例
   * @param {Object} figmaSpecs - Figma 规范
   * @param {Object} analysis - AI 分析结果
   * @param {Object} options - 选项
   * @returns {Array} 测试用例数组
   */
  generateTestCasesFromFigma(figmaSpecs, analysis, options = {}) {
    const testCases = [];
    const { baseUrl, includeColorTests, includeSizeTests, includeFontTests, includeLayoutTests } = options;

    // 递归处理每个节点
    const processNode = (node, parentSelector = '') => {
      if (!node || node.type === 'DOCUMENT' || node.type === 'PAGE') {
        if (node.children) {
          for (const child of node.children) {
            processNode(child, parentSelector);
          }
        }
        return;
      }

      const selector = this.generateSelectorFromNode(node, parentSelector);

      // 颜色测试
      if (includeColorTests && node.fills) {
        testCases.push({
          id: `figma_color_${node.id}`,
          name: `验证 ${node.name} 的颜色`,
          type: 'visual',
          priority: 'medium',
          description: `验证 ${node.name} 的背景色和文字颜色符合设计规范`,
          url: baseUrl,
          selector: selector,
          validations: this.generateColorValidations(node),
          tags: ['figma', 'color', 'visual'],
        });
      }

      // 尺寸测试
      if (includeSizeTests && node.boundingBox) {
        testCases.push({
          id: `figma_size_${node.id}`,
          name: `验证 ${node.name} 的尺寸`,
          type: 'visual',
          priority: 'medium',
          description: `验证 ${node.name} 的宽度和高度符合设计规范`,
          url: baseUrl,
          selector: selector,
          validations: this.generateSizeValidations(node),
          tags: ['figma', 'size', 'visual'],
        });
      }

      // 字体测试
      if (includeFontTests && node.textStyle) {
        testCases.push({
          id: `figma_font_${node.id}`,
          name: `验证 ${node.name} 的字体样式`,
          type: 'visual',
          priority: 'medium',
          description: `验证 ${node.name} 的字体符合设计规范`,
          url: baseUrl,
          selector: selector,
          validations: this.generateFontValidations(node),
          tags: ['figma', 'font', 'visual'],
        });
      }

      // 布局测试
      if (includeLayoutTests && node.boundingBox) {
        testCases.push({
          id: `figma_layout_${node.id}`,
          name: `验证 ${node.name} 的布局位置`,
          type: 'visual',
          priority: 'low',
          description: `验证 ${node.name} 的位置符合设计规范`,
          url: baseUrl,
          selector: selector,
          validations: this.generateLayoutValidations(node),
          tags: ['figma', 'layout', 'visual'],
        });
      }

      // 递归处理子节点
      if (node.children) {
        for (const child of node.children) {
          processNode(child, selector);
        }
      }
    };

    processNode(figmaSpecs);

    return testCases;
  }

  /**
   * 生成功能测试
   * @param {Object} feature - 功能对象
   * @param {string} baseUrl - 基础 URL
   * @returns {Array} 功能测试数组
   */
  generateFunctionalTests(feature, baseUrl) {
    const tests = [];

    // 基础功能测试
    if (feature.interactions && feature.interactions.length > 0) {
      for (const interaction of feature.interactions) {
        tests.push({
          id: `func_${feature.name}_${interaction.action}`,
          name: `测试 ${feature.name} - ${interaction.description || interaction.action}`,
          type: 'functional',
          priority: feature.criticality === 'high' ? 'critical' : 'medium',
          description: interaction.description || `执行 ${interaction.action} 操作`,
          url: feature.url || baseUrl,
          selector: interaction.selector,
          action: interaction.action,
          expectedResult: interaction.expectedResult || '操作成功执行',
          tags: ['functional', feature.name],
        });
      }
    }

    return tests;
  }

  /**
   * 生成视觉测试
   * @param {Object} feature - 功能对象
   * @param {string} baseUrl - 基础 URL
   * @returns {Array} 视觉测试数组
   */
  generateVisualTests(feature, baseUrl) {
    const tests = [];

    if (feature.visualElements && feature.visualElements.length > 0) {
      for (const element of feature.visualElements) {
        tests.push({
          id: `vis_${feature.name}_${element.name}`,
          name: `验证 ${element.name} 的视觉样式`,
          type: 'visual',
          priority: 'medium',
          description: `验证 ${element.name} 的样式符合设计要求`,
          url: feature.url || baseUrl,
          selector: element.selector,
          validations: element.validations || [],
          tags: ['visual', feature.name],
          screenshotConfig: {
            enabled: true,
            compareWith: element.expectedScreenshot,
          },
        });
      }
    }

    return tests;
  }

  /**
   * 生成数据测试
   * @param {Object} feature - 功能对象
   * @param {string} baseUrl - 基础 URL
   * @returns {Array} 数据测试数组
   */
  generateDataTests(feature, baseUrl) {
    const tests = [];

    if (feature.dataValidation && feature.dataValidation.length > 0) {
      for (const validation of feature.dataValidation) {
        tests.push({
          id: `data_${feature.name}_${validation.field}`,
          name: `验证 ${validation.field} 的数据`,
          type: 'data',
          priority: validation.critical ? 'critical' : 'medium',
          description: `验证 ${validation.field} 的数据正确性`,
          url: feature.url || baseUrl,
          selector: validation.selector,
          validations: [
            {
              type: validation.type || 'text',
              expected: validation.expected,
            },
          ],
          testData: validation.testData,
          tags: ['data', feature.name],
        });
      }
    }

    return tests;
  }

  /**
   * 生成性能测试
   * @param {Object} performance - 性能要求
   * @param {string} baseUrl - 基础 URL
   * @returns {Array} 性能测试数组
   */
  generatePerformanceTests(performance, baseUrl) {
    const tests = [];

    if (performance.loadTime) {
      tests.push({
        id: 'perf_load_time',
        name: '验证页面加载时间',
        type: 'performance',
        priority: 'medium',
        description: `验证页面在 ${performance.loadTime}ms 内加载完成`,
        url: baseUrl,
        performanceConfig: {
          maxLoadTime: performance.loadTime,
        },
        tags: ['performance', 'load'],
      });
    }

    if (performance.responseTime) {
      tests.push({
        id: 'perf_response_time',
        name: '验证 API 响应时间',
        type: 'performance',
        priority: 'medium',
        description: `验证 API 响应时间小于 ${performance.responseTime}ms`,
        url: baseUrl,
        performanceConfig: {
          maxResponseTime: performance.responseTime,
        },
        tags: ['performance', 'api'],
      });
    }

    return tests;
  }

  /**
   * 生成颜色验证规则
   * @param {Object} node - Figma 节点
   * @returns {Array} 验证规则
   */
  generateColorValidations(node) {
    const validations = [];

    if (node.fills && node.fills.length > 0) {
      const fill = node.fills[0];
      if (fill.type === 'solid' && fill.color) {
        validations.push({
          type: 'css',
          property: 'backgroundColor',
          expected: fill.color,
        });
      }
    }

    if (node.textStyle && node.textStyle.color) {
      validations.push({
        type: 'css',
        property: 'color',
        expected: node.textStyle.color,
      });
    }

    return validations;
  }

  /**
   * 生成尺寸验证规则
   * @param {Object} node - Figma 节点
   * @returns {Array} 验证规则
   */
  generateSizeValidations(node) {
    const validations = [];

    if (node.boundingBox) {
      validations.push({
        type: 'size',
        expected: {
          width: `${node.boundingBox.width}px`,
          height: `${node.boundingBox.height}px`,
        },
        tolerance: 2,
      });
    }

    return validations;
  }

  /**
   * 生成字体验证规则
   * @param {Object} node - Figma 节点
   * @returns {Array} 验证规则
   */
  generateFontValidations(node) {
    const validations = [];

    if (node.textStyle) {
      if (node.textStyle.fontSize) {
        validations.push({
          type: 'css',
          property: 'fontSize',
          expected: `${node.textStyle.fontSize}px`,
        });
      }

      if (node.textStyle.fontFamily) {
        validations.push({
          type: 'css',
          property: 'fontFamily',
          expected: node.textStyle.fontFamily,
        });
      }

      if (node.textStyle.fontWeight) {
        validations.push({
          type: 'css',
          property: 'fontWeight',
          expected: node.textStyle.fontWeight,
        });
      }
    }

    return validations;
  }

  /**
   * 生成布局验证规则
   * @param {Object} node - Figma 节点
   * @returns {Array} 验证规则
   */
  generateLayoutValidations(node) {
    const validations = [];

    if (node.boundingBox) {
      validations.push({
        type: 'position',
        expected: {
          x: node.boundingBox.x,
          y: node.boundingBox.y,
        },
        tolerance: 2,
      });
    }

    return validations;
  }

  /**
   * 从节点生成选择器
   * @param {Object} node - Figma 节点
   * @param {string} parentSelector - 父选择器
   * @returns {string} CSS 选择器
   */
  generateSelectorFromNode(node, parentSelector = '') {
    // 使用节点名称生成选择器
    const cleanName = node.name
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
      .replace(/^-+|-+$/g, '');

    const selectors = [
      `#${cleanName}`,
      `.${cleanName}`,
      `[data-testid="${cleanName}"]`,
      `[aria-label="${node.name}"]`,
    ];

    return selectors[0];
  }

  /**
   * 总结 Figma 规范
   * @param {Object} figmaSpecs - Figma 规范
   * @returns {string} 总结文本
   */
  summarizeFigmaSpecs(figmaSpecs) {
    const summary = {
      name: figmaSpecs.name,
      type: figmaSpecs.type,
      nodeCount: this.countNodes(figmaSpecs),
      elements: this.extractElements(figmaSpecs),
    };

    return JSON.stringify(summary, null, 2);
  }

  /**
   * 计算节点数量
   * @param {Object} node - 节点
   * @returns {number} 节点数量
   */
  countNodes(node) {
    let count = 1;
    if (node.children) {
      for (const child of node.children) {
        count += this.countNodes(child);
      }
    }
    return count;
  }

  /**
   * 提取元素
   * @param {Object} node - 节点
   * @returns {Array} 元素数组
   */
  extractElements(node) {
    const elements = [];

    if (node.type !== 'DOCUMENT' && node.type !== 'PAGE') {
      elements.push({
        name: node.name,
        type: node.type,
        id: node.id,
      });
    }

    if (node.children) {
      for (const child of node.children) {
        elements.push(...this.extractElements(child));
      }
    }

    return elements;
  }

  /**
   * 调用 LLM
   * @param {string} prompt - 提示词
   * @returns {Promise<string>} 响应
   */
  async callLLM(prompt) {
    if (!this.llmRouter) {
      throw new Error('LLM router not configured');
    }

    console.log('[AI Test Generator] Calling LLM with prompt length:', prompt.length);

    // 使用 LLMRouter 的 chat 接口，自动使用用户设定的模型
    const response = await this.llmRouter.chat(
      'test_generation', // 任务类型
      [{ role: 'user', content: prompt }], // 消息数组
      {
        temperature: 0.7,
        maxTokens: 8000
      }
    );

    // 打印完整响应用于调试
    console.log('[AI Test Generator] LLM Response:', JSON.stringify(response, null, 2));

    // 检查响应是否成功
    if (!response.success) {
      console.error('[AI Test Generator] LLM request failed:', response.error);
      throw new Error(`LLM request failed: ${response.error || 'Unknown error'}`);
    }

    // 返回响应内容
    const content = response.content || response.message?.content || '';

    console.log('[AI Test Generator] Response content length:', content?.length || 0);

    if (!content) {
      console.error('[AI Test Generator] Empty response. Full response:', response);
      throw new Error('LLM returned empty response');
    }

    return content;
  }

  /**
   * 提取 JSON
   * @param {string} text - 文本
   * @returns {Object} JSON 对象
   */
  extractJSON(text) {
    if (!text || typeof text !== 'string') {
      throw new Error('Invalid text for JSON extraction');
    }

    // 首先移除代码块标记（```json 或 ```）
    let cleanText = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '');

    // 尝试直接解析清理后的文本
    try {
      return JSON.parse(cleanText.trim());
    } catch (e) {
      console.error('Failed to parse JSON after removing code blocks:', e.message);
    }

    // 如果失败，尝试查找 JSON 对象（以 { 或 [ 开始）
    const objectMatch = cleanText.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      try {
        return JSON.parse(objectMatch[0]);
      } catch (e) {
        console.error('Failed to parse JSON from object match:', e.message);
      }
    }

    const arrayMatch = cleanText.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try {
        return JSON.parse(arrayMatch[0]);
      } catch (e) {
        console.error('Failed to parse JSON from array match:', e.message);
      }
    }

    // 尝试查找完整的 JSON（从第一个 { 或 [ 到最后一个 } 或 ]）
    const firstBrace = cleanText.indexOf('{');
    const firstBracket = cleanText.indexOf('[');
    const startIndex = firstBrace >= 0 && firstBrace < (firstBracket >= 0 ? firstBracket : Infinity)
      ? firstBrace
      : firstBracket;

    if (startIndex >= 0) {
      const lastBrace = cleanText.lastIndexOf('}');
      const lastBracket = cleanText.lastIndexOf(']');
      const endIndex = cleanText[startIndex] === '{'
        ? (lastBrace > lastBracket ? lastBrace : lastBracket)
        : (lastBracket > lastBrace ? lastBracket : lastBrace);

      if (endIndex > startIndex) {
        const jsonStr = cleanText.substring(startIndex, endIndex + 1);
        try {
          return JSON.parse(jsonStr);
        } catch (e) {
          console.error('Failed to parse extracted JSON:', e.message);
        }
      }
    }

    // 所有尝试都失败
    const preview = text.substring(0, 200);
    console.error('Failed to extract JSON. Response preview:', preview);
    throw new Error(`Failed to extract JSON from response. Preview: ${preview}...`);
  }

  /**
   * 解析 LLM 返回的测试用例
   * @param {string} response - LLM 响应
   * @returns {Array} 测试用例数组
   */
  parseLLMTestCases(response) {
    const data = this.extractJSON(response);
    return Array.isArray(data) ? data : [data];
  }

  /**
   * 构建描述提示词
   * @param {string} description - 描述
   * @param {string} context - 上下文
   * @param {string} baseUrl - 基础 URL
   * @returns {string} 提示词
   */
  buildDescriptionPrompt(description, context, baseUrl) {
    return `你是一个专业的测试工程师。请基于以下描述生成测试用例。

描述：${description}

上下文：${context}

基础 URL：${baseUrl}

请生成一个 JSON 数组，每个测试用例对象包含以下字段：
- id: 测试ID（如 TC001）
- name: 测试名称
- type: 测试类型（visual/functional/data）
- description: 测试描述
- url: 页面URL
- selector: CSS选择器
- validation: 验证类型（visible/text/css等）
- expectedValue: 期望值
- priority: 优先级

重要：
1. 只返回 JSON 数组，不要包含任何其他文字
2. 使用 \`\`\`json ... \`\`\` 代码块包裹
3. 确保是有效的 JSON 格式

示例格式：
\`\`\`json
[
  {
    "id": "TC001",
    "name": "登录按钮显示",
    "type": "visual",
    "description": "验证登录按钮正确显示",
    "url": "${baseUrl}/login",
    "selector": "#login-button",
    "validation": "visible",
    "expectedValue": "true",
    "priority": "high"
  }
]
\`\`\``;
  }

  /**
   * 获取需求分析模板
   * @returns {string} 模板
   */
  getRequirementAnalysisTemplate() {
    return `你是一个专业的测试分析师。请分析以下需求文档，提取需要测试的功能点。

项目名称：{{PROJECT_NAME}}
基础 URL：{{BASE_URL}}

需求文档：
{{REQUIREMENT}}

请分析需求并返回 JSON 格式的功能列表。

重要：
1. 只返回 JSON 对象，不要包含任何其他文字
2. 使用 \`\`\`json ... \`\`\` 代码块包裹
3. 确保是有效的 JSON 格式

返回格式：
\`\`\`json
{
  "features": [
    {
      "name": "功能名称",
      "description": "功能描述",
      "url": "功能页面 URL（相对于BASE_URL）",
      "criticality": "重要性（high/medium/low）",
      "interactions": [
        {
          "action": "操作类型（click, fill, select等）",
          "selector": "元素选择器",
          "description": "操作描述",
          "expectedResult": "预期结果"
        }
      ],
      "visualElements": [
        {
          "name": "元素名称",
          "selector": "选择器",
          "validations": ["验证规则"]
        }
      ],
      "dataValidation": [
        {
          "field": "字段名称",
          "selector": "选择器",
          "type": "验证类型",
          "expected": "期望值",
          "critical": true
        }
      ]
    }
  ],
  "performance": {
    "loadTime": 最大加载时间(ms),
    "responseTime": 最大响应时间(ms)
  }
}
\`\`\``;
  }

  /**
   * 获取 Figma 分析模板
   * @returns {string} 模板
   */
  getFigmaAnalysisTemplate() {
    return `你是一个专业的 UI/UX 测试分析师。请分析以下 Figma 设计规范，提取需要测试的视觉元素。

基础 URL：{{BASE_URL}}

Figma 设计规范：
{{FIGMA_SPECS}}

请以 JSON 格式返回分析结果，包含：
{
  "elements": [
    {
      "name": "元素名称",
      "type": "元素类型",
      "selector": "建议的选择器",
      "tests": ["需要测试的项目：颜色、尺寸、字体等"]
    }
  ]
}`;
  }

  /**
   * 获取测试生成模板
   * @returns {string} 模板
   */
  getTestGenerationTemplate() {
    return `根据分析结果生成详细的测试用例...`;
  }

  /**
   * 获取选择器生成模板
   * @returns {string} 模板
   */
  getSelectorGenerationTemplate() {
    return `你是一个专业的测试自动化工程师。请为以下元素生成最优的 CSS 选择器。

元素描述：{{ELEMENT}}
上下文：{{CONTEXT}}

请以 JSON 格式返回多个选择器建议，按优先级排序：
{
  "selectors": [
    {
      "selector": "选择器",
      "priority": "优先级（1-5）",
      "reason": "选择理由",
      "stability": "稳定性评分（1-10）"
    }
  ]
}`;
  }
}

module.exports = AITestGenerator;
