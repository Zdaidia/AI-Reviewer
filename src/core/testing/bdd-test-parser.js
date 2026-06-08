/**
 * BDD Test Parser
 *
 * 解析 BDD (Given-When-Then) 格式的测试用例
 * 结合 Project Memory 理解业务术语
 *
 * Excel 格式：
 * | Function | 優先級 | Scenario | Given | When | Then |
 * |----------|--------|----------|-------|------|------|
 * | 案件列表 | High | 查看默认案件列表 | 用户已登录 | 进入案件列表页面 | 默认显示10条 |
 */

const XLSX = require('xlsx');

class BDDTestParser {
  constructor(memory = null) {
    this.memory = memory; // Project Memory (可选)
    this.termMappings = new Map(); // 业务术语映射缓存
  }

  /**
   * 从 Excel 文件解析 BDD 测试用例
   * @param {string} filePath - Excel 文件路径
   * @returns {Object} 解析结果
   */
  parseFromExcel(filePath) {
    try {
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      // 转换为 JSON
      const data = XLSX.utils.sheet_to_json(worksheet, {
        defval: null, // 空单元格为 null
        raw: false,   // 获取格式化值
      });

      return this.parseBDDData(data);
    } catch (error) {
      throw new Error(`Excel 解析失败: ${error.message}`);
    }
  }

  /**
   * 从 JSON 数据解析 BDD 测试用例
   * @param {Array} data - Excel 转换后的 JSON 数据
   * @returns {Object} 解析结果
   */
  parseBDDData(data) {
    const testModules = new Map();

    data.forEach((row, index) => {
      // 跳过空行
      if (!row['Function'] && !row['功能']) {
        return;
      }

      // 兼容中英文列名
      const functionName = row['Function'] || row['功能'];
      const priority = row['優先級'] || row['优先级'] || row['Priority'] || 'Medium';
      const scenario = row['Scenario'] || row['场景'] || '';
      const given = row['Given'] || row['前提'] || '';
      const when = row['When'] || row['当'] || row['步骤'] || '';
      const then = row['Then'] || row['预期'] || row['结果'] || '';

      // 按功能模块分组
      if (!testModules.has(functionName)) {
        testModules.set(functionName, {
          module: functionName,
          priority: this.normalizePriority(priority),
          scenarios: [],
        });
      }

      const module = testModules.get(functionName);

      // 解析场景步骤
      const scenarioData = {
        id: `${functionName}_${module.scenarios.length + 1}`,
        name: scenario,
        given: this.parseStep(given),
        when: this.parseStep(when),
        then: this.parseExpectation(then),
        rowIndex: index + 2, // Excel 行号（从1开始，+表头）
      };

      module.scenarios.push(scenarioData);
    });

    // 转换为数组
    return {
      success: true,
      modules: Array.from(testModules.values()),
      totalScenarios: Array.from(testModules.values())
        .reduce((sum, m) => sum + m.scenarios.length, 0),
    };
  }

  /**
   * 解析单个步骤（Given/When）
   * @param {string} stepText - 步骤文本
   * @returns {Object} 解析后的步骤
   */
  parseStep(stepText) {
    if (!stepText || !stepText.trim()) {
      return { type: 'empty', text: '', actions: [] };
    }

    const text = stepText.trim();
    const actions = this.extractActions(text);

    return {
      type: this.classifyStep(text),
      text: text,
      actions: actions,
    };
  }

  /**
   * 解析预期结果（Then）
   * @param {string} expectationText - 预期文本
   * @returns {Object} 解析后的预期
   */
  parseExpectation(expectationText) {
    if (!expectationText || !expectationText.trim()) {
      return { type: 'empty', text: '', verifications: [] };
    }

    const text = expectationText.trim();
    const verifications = this.extractVerifications(text);

    return {
      type: this.classifyExpectation(text),
      text: text,
      verifications: verifications,
    };
  }

  /**
   * 从步骤文本中提取操作
   * @param {string} text - 步骤文本
   * @returns {Array} 操作数组
   */
  extractActions(text) {
    const actions = [];

    // 路由导航
    const routePatterns = [
      /进入\s*(.+?)\s*页面/,
      /跳转到\s*(.+?)\s*页面/,
      /导航到\s*(.+?)\s*/,
      /打开\s*(.+?)\s*页面/,
    ];

    for (const pattern of routePatterns) {
      const match = text.match(pattern);
      if (match) {
        actions.push({
          type: 'navigate',
          target: match[1],
          originalText: match[0],
        });
        break;
      }
    }

    // 点击操作
    const clickPatterns = [
      /点击\s*(第\s*([0-9一二三四五六七八九十]+)\s*条)?(.*)/,
      /选择\s*(第\s*([0-9一二三四五六七八九十]+)\s*条)?(.*)/,
      /打开\s*(第\s*([0-9一二三四五六七八九十]+)\s*条)?(.*)/,
    ];

    for (const pattern of clickPatterns) {
      const match = text.match(pattern);
      if (match) {
        actions.push({
          type: 'click',
          target: match[3] || 'item',
          index: this.parseNumber(match[2]) || 0,
          originalText: match[0],
        });
        break;
      }
    }

    // 输入操作
    const inputPatterns = [
      /输入\s*["'](.+?)["']\s*(?:到|在)?\s*(.*)/,
      /填写\s*(.+?)\s*为\s*["'](.+?)["']/,
      /在\s*(.+?)\s*中输入\s*["'](.+?)["']/,
    ];

    for (const pattern of inputPatterns) {
      const match = text.match(pattern);
      if (match) {
        actions.push({
          type: 'input',
          target: match[2] || match[1] || 'input',
          value: match[1] || match[2] || '',
          originalText: match[0],
        });
        break;
      }
    }

    // 等待操作
    if (text.includes('等待') || text.includes('稍等')) {
      actions.push({
        type: 'wait',
        originalText: text,
      });
    }

    // 滚动操作
    if (text.includes('滚动') || text.includes('滑动')) {
      actions.push({
        type: 'scroll',
        direction: text.includes('下') ? 'down' : 'up',
        originalText: text,
      });
    }

    return actions;
  }

  /**
   * 从预期文本中提取验证
   * @param {string} text - 预期文本
   * @returns {Array} 验证数组
   */
  extractVerifications(text) {
    const verifications = [];

    // 数量验证：默认显示10条
    const countPatterns = [
      /显示\s*(\d+)\s*条/,
      /有\s*(\d+)\s*个/,
      /共\s*(\d+)\s*项/,
      /(\d+)\s*条记录/,
    ];

    for (const pattern of countPatterns) {
      const match = text.match(pattern);
      if (match) {
        verifications.push({
          type: 'count',
          expected: parseInt(match[1], 10),
          originalText: match[0],
        });
        break;
      }
    }

    // 路由验证：跳转到案件详情页
    if (text.includes('跳转') || text.includes('页面')) {
      verifications.push({
        type: 'route',
        expected: 'changed', // 路由已改变
        originalText: text,
      });
    }

    // 文本验证
    const textPatterns = [
      /显示\s*["'](.+?)["']/,
      /包含\s*["'](.+?)["']/,
      /标题为\s*["'](.+?)["']/,
      /面包屑显示\s*["'](.+?)["']/,
    ];

    for (const pattern of textPatterns) {
      const match = text.match(pattern);
      if (match) {
        verifications.push({
          type: 'text',
          expected: match[1],
          location: this.guessTextLocation(text),
          originalText: match[0],
        });
        break;
      }
    }

    // 可见性验证
    const visiblePatterns = [
      /显示\s*(.+?)(?:按钮|元素|组件)/,
      /(.+?)\s*可见/,
      /(.+?)\s*出现/,
    ];

    for (const pattern of visiblePatterns) {
      const match = text.match(pattern);
      if (match) {
        verifications.push({
          type: 'visible',
          target: match[1],
          expected: true,
          originalText: match[0],
        });
        break;
      }
    }

    // 不可见验证
    if (text.includes('不可见') || text.includes('隐藏') || text.includes('消失')) {
      verifications.push({
        type: 'visible',
        expected: false,
        originalText: text,
      });
    }

    return verifications;
  }

  /**
   * 分类步骤类型
   * @param {string} text - 步骤文本
   * @returns {string} 类型
   */
  classifyStep(text) {
    if (text.includes('登录') || text.includes('认证')) {
      return 'authentication';
    }
    if (text.includes('进入') || text.includes('跳转') || text.includes('导航')) {
      return 'navigation';
    }
    if (text.includes('点击') || text.includes('选择')) {
      return 'interaction';
    }
    if (text.includes('输入') || text.includes('填写')) {
      return 'input';
    }
    if (text.includes('等待') || text.includes('稍等')) {
      return 'wait';
    }
    return 'action';
  }

  /**
   * 分类预期类型
   * @param {string} text - 预期文本
   * @returns {string} 类型
   */
  classifyExpectation(text) {
    if (text.includes('条') || text.includes('个') || text.includes('项')) {
      return 'count';
    }
    if (text.includes('跳转') || text.includes('页面')) {
      return 'navigation';
    }
    if (text.includes('显示') || text.includes('包含') || text.includes('文本')) {
      return 'content';
    }
    if (text.includes('可见') || text.includes('隐藏') || text.includes('出现')) {
      return 'visibility';
    }
    return 'general';
  }

  /**
   * 猜测文本验证的位置
   * @param {string} text - 预期文本
   * @returns {string} 位置
   */
  guessTextLocation(text) {
    if (text.includes('面包屑')) {
      return 'breadcrumb';
    }
    if (text.includes('标题') || text.includes('title')) {
      return 'title';
    }
    if (text.includes('按钮') || text.includes('button')) {
      return 'button';
    }
    return 'body';
  }

  /**
   * 解析数字（支持中文数字）
   * @param {string} num - 数字字符串
   * @returns {number} 数字
   */
  parseNumber(num) {
    if (!num) return 0;

    // 阿拉伯数字
    if (/^\d+$/.test(num)) {
      return parseInt(num, 10);
    }

    // 中文数字
    const chineseNumbers = {
      '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
      '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
      '1': 1, '2': 2, '3': 3, '4': 4, '5': 5,
      '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
    };

    return chineseNumbers[num] || 0;
  }

  /**
   * 标准化优先级
   * @param {string} priority - 优先级文本
   * @returns {string} 标准化优先级
   */
  normalizePriority(priority) {
    const p = priority.toLowerCase();
    if (['high', '高', '高优先级'].includes(p)) {
      return 'High';
    }
    if (['medium', '中', '中优先级'].includes(p)) {
      return 'Medium';
    }
    if (['low', '低', '低优先级'].includes(p)) {
      return 'Low';
    }
    return 'Medium';
  }

  /**
   * 结合 Project Memory 理解业务术语
   * @param {string} term - 业务术语（如"案件列表"）
   * @returns {Object} 映射结果
   */
  async understandTerm(term) {
    // 检查缓存
    if (this.termMappings.has(term)) {
      return this.termMappings.get(term);
    }

    // 如果没有 Memory，返回基本映射
    if (!this.memory) {
      return this.basicTermMapping(term);
    }

    // 从 Memory 获取项目上下文
    try {
      const context = await this.getProjectContext();
      const mapping = this.aiTermMapping(term, context);
      this.termMappings.set(term, mapping);
      return mapping;
    } catch (error) {
      console.warn('AI term mapping failed, using basic mapping:', error.message);
      return this.basicTermMapping(term);
    }
  }

  /**
   * 基础术语映射（基于规则）
   * @param {string} term - 业务术语
   * @returns {Object} 映射结果
   */
  basicTermMapping(term) {
    const mappings = {
      '案件列表': {
        route: '/cases',
        component: 'CaseList',
        selectors: {
          list: '.case-list, [data-testid="case-list"]',
          item: '.case-item, [data-testid="case-item"]',
        },
      },
      '案件详情': {
        route: '/cases/:id',
        component: 'CaseDetail',
        selectors: {
          detail: '.case-detail, [data-testid="case-detail"]',
        },
      },
      '登录': {
        route: '/login',
        component: 'Login',
        selectors: {
          form: '.login-form, form[action*="login"]',
          username: 'input[name="username"], input[type="text"]',
          password: 'input[name="password"], input[type="password"]',
          submit: 'button[type="submit"], .login-button',
        },
      },
      '首页': {
        route: '/',
        component: 'Home',
        selectors: {
          container: '.home, [data-testid="home"]',
        },
      },
    };

    // 模糊匹配
    for (const [key, value] of Object.entries(mappings)) {
      if (term.includes(key) || key.includes(term)) {
        return value;
      }
    }

    // 生成默认映射
    return {
      route: `/${this.slugify(term)}`,
      component: this.toPascalCase(term),
      selectors: {
        container: `[data-testid="${this.slugify(term)}"]`,
      },
    };
  }

  /**
   * AI 术语映射（使用 LLM）
   * @param {string} term - 业务术语
   * @param {Object} context - 项目上下文
   * @returns {Object} 映射结果
   */
  async aiTermMapping(term, context) {
    // TODO: 使用 LLM 进行智能映射
    // 这里需要调用 LLM API
    return this.basicTermMapping(term);
  }

  /**
   * 获取项目上下文
   * @returns {Object} 项目上下文
   */
  async getProjectContext() {
    // TODO: 从 Memory 获取项目上下文
    // 包括：路由、组件、选择器等
    return {};
  }

  /**
   * 将文本转换为 slug
   * @param {string} text - 文本
   * @returns {string} slug
   */
  slugify(text) {
    return text
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^\w\-]+/g, '')
      .replace(/\-\-+/g, '-')
      .trim();
  }

  /**
   * 将文本转换为 PascalCase
   * @param {string} text - 文本
   * @returns {string} PascalCase
   */
  toPascalCase(text) {
    return text
      .split(/[\s\-_]+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join('');
  }

  /**
   * 生成测试执行计划
   * @param {Object} bddResult - BDD 解析结果
   * @returns {Object} 执行计划
   */
  generateExecutionPlan(bddResult) {
    const plan = {
      modules: [],
      totalSteps: 0,
      estimatedTime: 0, // 分钟
    };

    // 验证输入参数
    if (!bddResult) {
      console.warn('[BDDParser] bddResult is null or undefined');
      return plan;
    }

    if (!bddResult.modules || !Array.isArray(bddResult.modules)) {
      console.warn('[BDDParser] Invalid bddResult.modules:', bddResult.modules);
      return plan;
    }

    console.log('[BDDParser] Processing bddResult with', bddResult.modules.length, 'modules');

    bddResult.modules.forEach(module => {
      const modulePlan = {
        module: module.module,
        priority: module.priority,
        scenarios: [],
      };

      if (!module.scenarios || !Array.isArray(module.scenarios)) {
        console.warn('[BDDParser] Invalid module.scenarios for module:', module.module);
        return;
      }

      console.log('[BDDParser] Processing module:', module.module, 'with', module.scenarios.length, 'scenarios');

      module.scenarios.forEach(scenario => {
        // 确保 scenario 有必要的属性
        const scenarioId = scenario.id || `scenario_${modulePlan.scenarios.length + 1}`;
        const scenarioName = scenario.name || '未命名场景';

        console.log('[BDDParser] Processing scenario:', scenarioId, scenarioName);
        console.log('[BDDParser]   given:', typeof scenario.given, JSON.stringify(scenario.given)?.substring(0, 100));
        console.log('[BDDParser]   when:', typeof scenario.when, JSON.stringify(scenario.when)?.substring(0, 100));
        console.log('[BDDParser]   then:', typeof scenario.then, JSON.stringify(scenario.then)?.substring(0, 100));

        // 标准化 given/when/then 为对象格式
        const normalizeStep = (step, stepType, defaultDesc) => {
          // 如果已经是对象且有 description 属性，直接使用
          if (step && typeof step === 'object' && step.description !== undefined) {
            const normalized = {
              type: String(stepType),
              description: String(step.description || defaultDesc),
              action: String(step.action || step.description || defaultDesc),
              actions: Array.isArray(step.actions) ? step.actions : [],
              text: String(step.text || step.description || defaultDesc),
              // 如果有 verifications，保留
              ...(step.verifications && { verifications: step.verifications }),
            };

            // 调试：记录 actions 详情
            if (stepType === 'when' && step.actions && step.actions.length > 0) {
              console.log(`[BDDParser] normalizeStep when actions:`, {
                actionsCount: step.actions.length,
                actions: step.actions.map(a => ({
                  type: a.type,
                  target: a.target,
                  value: a.value,
                  description: a.description
                }))
              });
            }

            return normalized;
          }
          // 如果是字符串，转换为对象
          if (typeof step === 'string' && step.trim()) {
            return {
              type: String(stepType),
              description: String(step.trim()),
              action: String(step.trim()),
              actions: [],
              text: String(step.trim()),
            };
          }
          // 如果是其他类型或为空，使用默认值
          return {
            type: String(stepType),
            description: String(defaultDesc),
            action: String(defaultDesc),
            actions: [],
            text: String(defaultDesc),
          };
        };

        const scenarioPlan = {
          id: String(scenarioId),
          name: String(scenarioName),
          description: String(scenario.description || ''),
          // 添加页面信息
          page: String(scenario.page || ''),
          steps: [
            normalizeStep(scenario.given, 'given', '用户在系统中'),
            normalizeStep(scenario.when, 'when', '执行操作'),
            normalizeStep(scenario.then, 'then', '验证结果'),
          ],
          estimatedTime: this.estimateScenarioTime(scenario),
        };

        // 如果 when 包含详细步骤数组（when_steps），但 actions 为空或未定义，则从 when_steps 生成 actions
        // 修复：不再创建独立的 when_step 步骤，而是将其作为 when 步骤的 actions
        // 注意：如果 scenario.when.actions 已经存在且有内容，则保留（由 ai-test-generator-complete.js 创建）
        const whenStepIndex = 1; // when 步骤的索引（在 given 之后）

        if ((!scenarioPlan.steps[whenStepIndex].actions || scenarioPlan.steps[whenStepIndex].actions.length === 0)) {
          // 尝试从 scenario.when.steps 或 scenario.when_steps 生成 actions
          const stepsToConvert = (scenario.when && scenario.when.steps && Array.isArray(scenario.when.steps))
            ? scenario.when.steps
            : (scenario.when_steps && Array.isArray(scenario.when_steps) ? scenario.when_steps : null);

          if (stepsToConvert && stepsToConvert.length > 0) {
            // 这些步骤只是文本描述，不是完整的 action 对象
            // 将它们标记为 generic，让 step-executor 使用 ruleBasedActions 来解析
            scenarioPlan.steps[whenStepIndex].actions = stepsToConvert.map((stepText, idx) => ({
              type: 'generic',
              description: String(stepText || '').trim(),
              text: String(stepText || '').trim(),
              stepNumber: idx + 1,
            }));
            // 同时设置 text 为所有步骤的组合
            if (!scenarioPlan.steps[whenStepIndex].text || scenarioPlan.steps[whenStepIndex].text === '执行操作') {
              scenarioPlan.steps[whenStepIndex].text = stepsToConvert.map(s => String(s || '')).join(' → ');
            }
            console.log('[BDDParser] Converted when_steps to generic actions:', {
              actionsCount: scenarioPlan.steps[whenStepIndex].actions.length,
              note: 'step-executor will use ruleBasedActions to parse these'
            });
          }
        } else {
          // actions 已存在，记录调试信息
          console.log('[BDDParser] Preserved existing actions:', {
            actionsCount: scenarioPlan.steps[whenStepIndex].actions.length,
            actionTypes: scenarioPlan.steps[whenStepIndex].actions.map(a => a.type)
          });
        }

        console.log('[BDDParser] Normalized scenario:', {
          id: scenarioPlan.id,
          steps: scenarioPlan.steps.map(s => ({ type: s.type, desc: s.description }))
        });

        modulePlan.scenarios.push(scenarioPlan);
        plan.totalSteps += scenarioPlan.steps.length;
      });

      plan.modules.push(modulePlan);
    });

    plan.estimatedTime = plan.totalSteps * 0.5; // 每步约 30 秒

    console.log('[BDDParser] Generated execution plan:', {
      modules: plan.modules.length,
      totalScenarios: plan.modules.reduce((sum, m) => sum + m.scenarios.length, 0),
      totalSteps: plan.totalSteps,
      estimatedTime: plan.estimatedTime,
    });

    return plan;
  }

  /**
   * 估算场景执行时间
   * @param {Object} scenario - 场景
   * @returns {number} 时间（分钟）
   */
  estimateScenarioTime(scenario) {
    let steps = 0;

    if (scenario.given && scenario.given.actions) {
      steps += scenario.given.actions.length;
    }
    if (scenario.when && scenario.when.actions) {
      steps += scenario.when.actions.length;
    }
    if (scenario.then && scenario.then.verifications) {
      steps += scenario.then.verifications.length;
    }

    return steps * 0.5; // 每步约 30 秒
  }
}

module.exports = BDDTestParser;
