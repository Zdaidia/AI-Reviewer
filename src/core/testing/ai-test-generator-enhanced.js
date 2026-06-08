/**
 * AI Test Generator Enhanced
 *
 * AI 自动生成测试用例
 * 支持多种输入源：
 * - 自然语言描述
 * - 需求文档
 * - Figma 设计文件
 * - 用户故事
 *
 * 输出：BDD 格式测试用例
 */

class AITestGeneratorEnhanced {
  constructor(options = {}) {
    this.llm = options.llm || null;
    this.memory = options.memory || null;
    this.figmaIntegration = options.figmaIntegration || null;

    this.promptTemplates = {
      // 自然语言描述
      naturalLanguage: `你是一个专业的测试用例生成助手。

任务：根据功能描述生成 BDD 格式的测试用例

输入：功能描述
{description}

项目信息：
{projectContext}

要求：
1. 生成全面的测试用例，包括正常流程和异常流程
2. 使用 BDD 格式
3. 考虑边界条件和错误情况
4. 预期结果必须具体可验证
5. 优先级设置为 High/Medium/Low
6. 每个场景应该独立且可执行

返回 JSON 格式：
{
  "module": "功能模块名称",
  "priority": "High|Medium|Low",
  "scenarios": [
    {
      "name": "场景名称",
      "given": "前提条件",
      "when": "操作步骤",
      "then": "预期结果"
    }
  ]
}`,

      // 用户故事
      userStory: `你是一个专业的测试用例生成助手。

任务：根据用户故事生成 BDD 格式的测试用例

输入：用户故事
{userStory}

验收标准：
{acceptanceCriteria}

要求：
1. 为每个验收标准生成至少一个测试场景
2. 使用 BDD 格式
3. 考虑正常和异常情况
4. 预期结果可验证

返回 JSON 格式：`,

      // Figma 设计
      figmaDesign: `你是一个专业的测试用例生成助手。

任务：根据 Figma 设计生成 UI 测试用例

设计信息：
{designInfo}

页面元素：
{elements}

交互流程：
{interactions}

要求：
1. 生成 UI 交互测试用例
2. 验证设计规范
3. 测试响应式布局
4. 验证交互流程

返回 JSON 格式：`,

      // 需求文档
      requirementDoc: `你是一个专业的测试用例生成助手。

任务：根据需求文档生成全面的测试用例

需求文档：
{requirementDoc}

功能需求：
{functionalRequirements}

非功能需求：
{nonFunctionalRequirements}

要求：
1. 生成功能测试用例
2. 生成性能测试用例
3. 生成安全测试用例
4. 考虑所有业务规则

返回 JSON 格式：`,
    };
  }

  /**
   * 从自然语言描述生成测试用例
   * @param {string} description - 功能描述
   * @param {Object} options - 选项
   * @returns {Object} 生成的测试用例
   */
  async generateFromDescription(description, options = {}) {
    if (!this.llm) {
      throw new Error('LLM not configured');
    }

    this.log('info', '从自然语言描述生成测试用例', { description });

    try {
      // 获取项目上下文
      const projectContext = await this.getProjectContext();

      // 构建提示词
      const prompt = this.promptTemplates.naturalLanguage
        .replace('{description}', description)
        .replace('{projectContext}', JSON.stringify(projectContext, null, 2));

      // 添加额外要求
      const enhancedPrompt = this.addRequirements(prompt, options);

      // 调用 LLM
      const response = await this.llm.chat('test_generation', [
        { role: 'user', content: enhancedPrompt }
      ], {
        temperature: 0.7,
        maxTokens: 4000,
      });

      if (!response.success) {
        throw new Error(response.error || 'LLM call failed');
      }

      // 解析生成的测试用例
      const testCases = this.parseGeneratedTests(response.content);

      // 优化测试用例
      const optimizedTests = await this.optimizeTestCases(testCases, projectContext);

      this.log('info', '测试用例生成成功', {
        count: optimizedTests.scenarios?.length || 0,
      });

      return {
        success: true,
        source: 'description',
        input: description,
        generatedTests: optimizedTests,
        rawResponse: response.content,
      };
    } catch (error) {
      this.log('error', '从描述生成测试失败', { error: error.message });
      return {
        success: false,
        error: error.message,
        source: 'description',
        input: description,
      };
    }
  }

  /**
   * 从用户故事生成测试用例
   * @param {Object} userStory - 用户故事
   * @param {Object} options - 选项
   * @returns {Object} 生成的测试用例
   */
  async generateFromUserStory(userStory, options = {}) {
    if (!this.llm) {
      throw new Error('LLM not configured');
    }

    this.log('info', '从用户故事生成测试用例', { userStory });

    try {
      const {
        title = '',
        narrative = '',
        acceptanceCriteria = [],
      } = userStory;

      // 格式化验收标准
      const criteriaText = Array.isArray(acceptanceCriteria)
        ? acceptanceCriteria.join('\n')
        : acceptanceCriteria;

      // 获取项目上下文
      const projectContext = await this.getProjectContext();

      // 构建提示词
      const prompt = this.promptTemplates.userStory
        .replace('{userStory}', `${title}\n\n作为${narrative}`)
        .replace('{acceptanceCriteria}', criteriaText);

      // 调用 LLM
      const response = await this.llm.chat('test_generation', [
        { role: 'user', content: prompt }
      ], {
        temperature: 0.7,
        maxTokens: 4000,
      });

      if (!response.success) {
        throw new Error(response.error || 'LLM call failed');
      }

      // 解析生成的测试用例
      const testCases = this.parseGeneratedTests(response.content);

      this.log('info', '从用户故事生成测试成功', {
        count: testCases.scenarios?.length || 0,
      });

      return {
        success: true,
        source: 'userStory',
        input: userStory,
        generatedTests: testCases,
      };
    } catch (error) {
      this.log('error', '从用户故事生成测试失败', { error: error.message });
      return {
        success: false,
        error: error.message,
        source: 'userStory',
        input: userStory,
      };
    }
  }

  /**
   * 从 Figma 设计生成测试用例
   * @param {string} figmaUrl - Figma 文件 URL
   * @param {Object} options - 选项
   * @returns {Object} 生成的测试用例
   */
  async generateFromFigma(figmaUrl, options = {}) {
    if (!this.figmaIntegration) {
      throw new Error('Figma integration not configured');
    }

    this.log('info', '从 Figma 设计生成测试用例', { figmaUrl });

    try {
      // 提取 Figma 设计规范
      const figmaData = await this.extractFigmaData(figmaUrl, options);

      // 获取项目上下文
      const projectContext = await this.getProjectContext();

      // 构建提示词
      const prompt = this.promptTemplates.figmaDesign
        .replace('{designInfo}', JSON.stringify(figmaData.info, null, 2))
        .replace('{elements}', JSON.stringify(figmaData.elements, null, 2))
        .replace('{interactions}', JSON.stringify(figmaData.interactions, null, 2));

      // 调用 LLM
      const response = await this.llm.chat('test_generation', [
        { role: 'user', content: prompt }
      ], {
        temperature: 0.7,
        maxTokens: 4000,
      });

      if (!response.success) {
        throw new Error(response.error || 'LLM call failed');
      }

      // 解析生成的测试用例
      const testCases = this.parseGeneratedTests(response.content);

      // 添加 Figma 特定的验证
      const enhancedTests = this.addFigmaVerifications(testCases, figmaData);

      this.log('info', '从 Figma 生成测试成功', {
        count: enhancedTests.scenarios?.length || 0,
      });

      return {
        success: true,
        source: 'figma',
        input: figmaUrl,
        generatedTests: enhancedTests,
        figmaData,
      };
    } catch (error) {
      this.log('error', '从 Figma 生成测试失败', { error: error.message });
      return {
        success: false,
        error: error.message,
        source: 'figma',
        input: figmaUrl,
      };
    }
  }

  /**
   * 从需求文档生成测试用例
   * @param {string} requirementDoc - 需求文档内容
   * @param {Object} options - 选项
   * @returns {Object} 生成的测试用例
   */
  async generateFromRequirementDoc(requirementDoc, options = {}) {
    if (!this.llm) {
      throw new Error('LLM not configured');
    }

    this.log('info', '从需求文档生成测试用例', { docLength: requirementDoc.length });

    try {
      // 解析需求文档
      const parsedDoc = this.parseRequirementDoc(requirementDoc);

      // 获取项目上下文
      const projectContext = await this.getProjectContext();

      // 构建提示词
      const prompt = this.promptTemplates.requirementDoc
        .replace('{requirementDoc}', this.truncateText(requirementDoc, 2000))
        .replace('{functionalRequirements}', parsedDoc.functional || '无')
        .replace('{nonFunctionalRequirements}', parsedDoc.nonFunctional || '无');

      // 调用 LLM
      const response = await this.llm.chat('test_generation', [
        { role: 'user', content: prompt }
      ], {
        temperature: 0.7,
        maxTokens: 6000,
      });

      if (!response.success) {
        throw new Error(response.error || 'LLM call failed');
      }

      // 解析生成的测试用例
      const testCases = this.parseGeneratedTests(response.content);

      this.log('info', '从需求文档生成测试成功', {
        count: testCases.scenarios?.length || 0,
      });

      return {
        success: true,
        source: 'requirementDoc',
        input: requirementDoc,
        generatedTests: testCases,
        parsedDoc,
      };
    } catch (error) {
      this.log('error', '从需求文档生成测试失败', { error: error.message });
      return {
        success: false,
        error: error.message,
        source: 'requirementDoc',
        input: requirementDoc,
      };
    }
  }

  /**
   * 智能生成（自动检测输入类型）
   * @param {string} input - 输入内容
   * @param {Object} options - 选项
   * @returns {Object} 生成的测试用例
   */
  async generateSmart(input, options = {}) {
    this.log('info', '智能生成测试用例', { inputType: options.inputType || 'auto' });

    // 自动检测输入类型
    const inputType = options.inputType || this.detectInputType(input);

    switch (inputType) {
      case 'figma-url':
        return await this.generateFromFigma(input, options);

      case 'user-story':
        return await this.generateFromUserStory(
          typeof input === 'string' ? JSON.parse(input) : input,
          options
        );

      case 'requirement-doc':
        return await this.generateFromRequirementDoc(input, options);

      case 'natural-language':
      default:
        return await this.generateFromDescription(input, options);
    }
  }

  /**
   * 检测输入类型
   * @param {string} input - 输入内容
   * @returns {string} 输入类型
   */
  detectInputType(input) {
    // Figma URL
    if (input.includes('figma.com/file/') || input.includes('figma.com/design/')) {
      return 'figma-url';
    }

    // 用户故事（JSON 格式）
    if (input.includes('As a') && input.includes('I want')) {
      return 'user-story';
    }

    // 需求文档（较长，包含多个章节）
    if (input.length > 500 && (input.includes('需求') || input.includes('功能'))) {
      return 'requirement-doc';
    }

    // 默认为自然语言描述
    return 'natural-language';
  }

  /**
   * 解析生成的测试用例
   * @param {string} content - LLM 响应内容
   * @returns {Object} 测试用例
   */
  parseGeneratedTests(content) {
    try {
      // 尝试提取 JSON
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        // 验证格式
        if (parsed.module && parsed.scenarios) {
          return this.normalizeTestCases(parsed);
        }
      }

      // 如果 JSON 解析失败，尝试从文本提取
      return this.extractTestsFromText(content);
    } catch (error) {
      this.log('error', '解析生成的测试用例失败', { error: error.message });
      return {
        module: 'Unknown',
        priority: 'Medium',
        scenarios: [],
      };
    }
  }

  /**
   * 标准化测试用例
   * @param {Object} rawTests - 原始测试用例
   * @returns {Object} 标准化的测试用例
   */
  normalizeTestCases(rawTests) {
    const normalized = {
      module: rawTests.module || 'Unknown',
      priority: this.normalizePriority(rawTests.priority),
      scenarios: [],
    };

    if (Array.isArray(rawTests.scenarios)) {
      normalized.scenarios = rawTests.scenarios.map((scenario, index) => ({
        id: `${normalized.module}_${index + 1}`,
        name: scenario.name || `场景${index + 1}`,
        given: scenario.given || '',
        when: scenario.when || '',
        then: scenario.then || '',
      }));
    }

    return normalized;
  }

  /**
   * 从文本提取测试用例
   * @param {string} text - 文本内容
   * @returns {Object} 测试用例
   */
  extractTestsFromText(text) {
    // 简单的文本解析逻辑
    const scenarios = [];
    const lines = text.split('\n');

    let currentScenario = null;

    for (const line of lines) {
      const trimmed = line.trim();

      // 场景名称
      if (trimmed.startsWith('场景') || trimmed.startsWith('Scenario')) {
        if (currentScenario) {
          scenarios.push(currentScenario);
        }
        currentScenario = {
          name: trimmed.replace(/^(场景|Scenario)\s*[:：]\s*/, ''),
          given: '',
          when: '',
          then: '',
        };
      }

      // Given
      else if (trimmed.startsWith('Given') || trimmed.startsWith('前提')) {
        if (currentScenario) {
          currentScenario.given = trimmed.replace(/^(Given|前提)\s*[:：]\s*/, '');
        }
      }

      // When
      else if (trimmed.startsWith('When') || trimmed.startsWith('当') || trimmed.startsWith('步骤')) {
        if (currentScenario) {
          currentScenario.when = trimmed.replace(/^(When|当|步骤)\s*[:：]\s*/, '');
        }
      }

      // Then
      else if (trimmed.startsWith('Then') || trimmed.startsWith('预期') || trimmed.startsWith('结果')) {
        if (currentScenario) {
          currentScenario.then = trimmed.replace(/^(Then|预期|结果)\s*[:：]\s*/, '');
        }
      }
    }

    if (currentScenario) {
      scenarios.push(currentScenario);
    }

    return {
      module: 'Extracted',
      priority: 'Medium',
      scenarios,
    };
  }

  /**
   * 优化测试用例
   * @param {Object} testCases - 测试用例
   * @param {Object} projectContext - 项目上下文
   * @returns {Object} 优化后的测试用例
   */
  async optimizeTestCases(testCases, projectContext) {
    // 添加项目特定的信息
    if (projectContext.routes) {
      testCases.scenarios.forEach(scenario => {
        // 尝试将业务术语映射到路由
        scenario.when = this.mapTermsToRoutes(scenario.when, projectContext);
        scenario.then = this.mapTermsToRoutes(scenario.then, projectContext);
      });
    }

    return testCases;
  }

  /**
   * 添加 Figma 特定的验证
   * @param {Object} testCases - 测试用例
   * @param {Object} figmaData - Figma 数据
   * @returns {Object} 增强的测试用例
   */
  addFigmaVerifications(testCases, figmaData) {
    // 添加设计规范验证
    const designVerifications = {
      layout: '布局符合设计规范',
      spacing: '间距符合设计规范',
      colors: '颜色符合设计规范',
      typography: '字体符合设计规范',
      responsive: '响应式布局正常',
    };

    testCases.scenarios.forEach(scenario => {
      // 为 UI 测试添加设计验证
      if (scenario.then && !scenario.then.includes('设计')) {
        scenario.then += `；${designVerifications.layout}`;
      }
    });

    return testCases;
  }

  /**
   * 提取 Figma 数据
   * @param {string} figmaUrl - Figma URL
   * @param {Object} options - 选项
   * @returns {Object} Figma 数据
   */
  async extractFigmaData(figmaUrl, options = {}) {
    // TODO: 实现 Figma API 集成
    return {
      info: {
        name: 'Figma Design',
        url: figmaUrl,
      },
      elements: [],
      interactions: [],
    };
  }

  /**
   * 解析需求文档
   * @param {string} doc - 需求文档
   * @returns {Object} 解析后的文档
   */
  parseRequirementDoc(doc) {
    // 简单的解析逻辑
    const functional = [];
    const nonFunctional = [];

    const lines = doc.split('\n');
    let currentSection = null;

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.includes('功能需求') || trimmed.includes('Functional Requirements')) {
        currentSection = 'functional';
      } else if (trimmed.includes('非功能需求') || trimmed.includes('Non-Functional')) {
        currentSection = 'nonFunctional';
      } else if (trimmed && currentSection) {
        if (currentSection === 'functional') {
          functional.push(trimmed);
        } else {
          nonFunctional.push(trimmed);
        }
      }
    }

    return {
      functional: functional.join('\n'),
      nonFunctional: nonFunctional.join('\n'),
    };
  }

  /**
   * 获取项目上下文
   * @returns {Object} 项目上下文
   */
  async getProjectContext() {
    if (!this.memory) {
      return {};
    }

    try {
      // TODO: 从 Memory 获取项目上下文
      return {};
    } catch (error) {
      this.log('warn', '获取项目上下文失败', { error: error.message });
      return {};
    }
  }

  /**
   * 添加额外要求
   * @param {string} prompt - 原始提示词
   * @param {Object} options - 选项
   * @returns {string} 增强的提示词
   */
  addRequirements(prompt, options = {}) {
    let enhanced = prompt;

    if (options.includeErrorCases) {
      enhanced += '\n\n特别注意：必须包含错误场景和边界条件测试。';
    }

    if (options.includePerformance) {
      enhanced += '\n\n添加性能测试用例（响应时间、并发等）。';
    }

    if (options.includeSecurity) {
      enhanced += '\n\n添加安全测试用例（权限、注入等）。';
    }

    if (options.framework) {
      enhanced += `\n\n技术栈：${options.framework}`;
    }

    return enhanced;
  }

  /**
   * 将业务术语映射到路由
   * @param {string} text - 文本
   * @param {Object} context - 项目上下文
   * @returns {string} 映射后的文本
   */
  mapTermsToRoutes(text, context) {
    if (!context.routes) return text;

    let mapped = text;

    // 简单的术语映射
    const termMappings = {
      '案件列表': '/cases',
      '案件详情': '/cases/:id',
      '登录': '/login',
      '首页': '/',
      '用户中心': '/user',
      '设置': '/settings',
    };

    for (const [term, route] of Object.entries(termMappings)) {
      mapped = mapped.replace(new RegExp(term, 'g'), route);
    }

    return mapped;
  }

  /**
   * 标准化优先级
   * @param {string} priority - 优先级
   * @returns {string} 标准化的优先级
   */
  normalizePriority(priority) {
    const p = (priority || 'Medium').toLowerCase();
    if (['high', '高'].includes(p)) return 'High';
    if (['low', '低'].includes(p)) return 'Low';
    return 'Medium';
  }

  /**
   * 截断文本
   * @param {string} text - 文本
   * @param {number} maxLength - 最大长度
   * @returns {string} 截断后的文本
   */
  truncateText(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }

  /**
   * 记录日志
   * @param {string} level - 日志级别
   * @param {string} message - 消息
   * @param {Object} data - 数据
   */
  log(level, message, data = {}) {
    const logEntry = {
      level,
      message,
      data,
      timestamp: new Date().toISOString(),
      component: 'AITestGeneratorEnhanced',
    };

    const logMethod = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    logMethod(`[AITestGeneratorEnhanced] ${message}`, data);
  }

  /**
   * 批量生成测试用例
   * @param {Array} inputs - 输入数组
   * @param {Object} options - 选项
   * @returns {Array} 生成的测试用例数组
   */
  async generateBatch(inputs, options = {}) {
    this.log('info', '批量生成测试用例', { count: inputs.length });

    const results = [];
    let successCount = 0;
    let failureCount = 0;

    for (const input of inputs) {
      try {
        const result = await this.generateSmart(input, options);
        results.push(result);

        if (result.success) {
          successCount++;
        } else {
          failureCount++;
        }
      } catch (error) {
        this.log('error', '批量生成失败', {
          input,
          error: error.message,
        });
        results.push({
          success: false,
          error: error.message,
          input,
        });
        failureCount++;
      }
    }

    this.log('info', '批量生成完成', {
      total: inputs.length,
      success: successCount,
      failure: failureCount,
    });

    return {
      results,
      summary: {
        total: inputs.length,
        success: successCount,
        failure: failureCount,
      },
    };
  }

  /**
   * 生成测试建议
   * @param {string} input - 输入
   * @returns {Object} 测试建议
   */
  async generateSuggestions(input) {
    if (!this.llm) {
      throw new Error('LLM not configured');
    }

    const prompt = `作为一个测试专家，分析以下功能描述，给出测试建议：

功能描述：${input}

请提供：
1. 测试重点（需要重点测试的功能点）
2. 潜在风险（可能出问题的地方）
3. 建议的测试场景（3-5个关键场景）
4. 测试数据建议（边界值、异常值等）
5. 性能考虑（是否需要性能测试）

返回 JSON 格式：
{
  "focus": ["测试重点1", "测试重点2"],
  "risks": ["风险1", "风险2"],
  "suggestedScenarios": ["场景1", "场景2"],
  "testData": ["数据1", "数据2"],
  "performance": true/false
}`;

    try {
      const response = await this.llm.chat('test_suggestions', [
        { role: 'user', content: prompt }
      ], {
        temperature: 0.5,
        maxTokens: 2000,
      });

      if (response.success) {
        const suggestions = JSON.parse(response.content);
        return {
          success: true,
          suggestions,
        };
      } else {
        return {
          success: false,
          error: response.error,
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

module.exports = AITestGeneratorEnhanced;
