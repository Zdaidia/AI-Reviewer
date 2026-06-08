/**
 * AI Test Generator - 完整版
 *
 * 按照用户需求实现：
 * - 输入来源：需求文档、设计稿（Figma/图片）、API 文档
 * - 处理流程：需求分析 → 页面识别 → 用户流程推断 → 生成测试用例 → 执行测试 → 生成报告
 * - 测试类型：功能测试、UI 测试、边界测试、异常测试
 */

const fs = require('fs');
const path = require('path');
const RequirementAnalyzer = require('./requirement-analyzer');

class AITestGeneratorComplete {
  constructor(options = {}) {
    this.llm = options.llm || null;
    this.memory = options.memory || null;
    this.figmaIntegration = options.figmaIntegration || null;
    this.imageAnalyzer = options.imageAnalyzer || null;

    // 初始化需求分析器
    this.requirementAnalyzer = new RequirementAnalyzer({
      llm: this.llm,
      enableLLM: options.enableLLMAnalysis !== false
    });
  }

  /**
   * 主入口：智能生成测试
   * @param {Object} input - 输入数据
   * @param {string} input.sourceType - 输入类型（requirement/figma/image/api）
   * @param {Object} input.content - 输入内容
   * @param {Object} options - 选项
   * @param {Function} logCallback - 日志回调函数
   * @returns {Object} 生成结果
   */
  async generate(input, options = {}, logCallback = null) {
    const log = (type, message, data = {}) => {
      if (logCallback) {
        logCallback(type, message, data);
      } else {
        this.log('info', `${type}: ${message}`, data);
      }
    };

    // 保存项目路径供后续使用
    this.projectPath = input.projectPath || null;

    try {
      // 步骤 1：需求分析
      const analysis = await this.analyzeRequirements(input, log);

      // 步骤 2：页面识别
      const pages = await this.identifyPages(input, analysis, log);

      // 步骤 3：用户流程推断
      const flows = await this.inferUserFlows(input, analysis, pages, log);

      // 步骤 4：生成测试用例（传递项目路径）
      const testCases = await this.generateTestCases(input, analysis, pages, flows, options, log);

      // 步骤 5：格式化测试用例
      let formattedTests = this.formatTestCases(testCases);

      // 关键修复：确保返回结构符合 BDDTestParser 的需求 { modules: [...] }
      if (Array.isArray(formattedTests)) {
        formattedTests = {
          modules: [
            {
              module: 'AI智能生成',
              scenarios: formattedTests.map(tc => ({
                id: String(tc.id || `TC${Math.random().toString(36).substr(2, 5)}`),
                name: String(tc.name || tc.description || '未命名场景'),
                description: String(tc.description || ''),
                page: String(tc.page || ''),
                given: tc.given || '用户在系统中',
                when: tc.when || '执行操作',
                then: tc.then || '验证结果',
                when_steps: Array.isArray(tc.when_steps) ? tc.when_steps : []
              }))
            }
          ]
        };
      }

      return {
        success: true,
        analysis,
        pages,
        flows,
        testCases: formattedTests,
      };
    } catch (error) {
      log('错误', `生成失败: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 步骤 1：需求分析
   * @param {Object} input - 输入数据
   * @param {Function} logCallback - 日志回调函数
   * @returns {Object} 分析结果
   */
  async analyzeRequirements(input, logCallback = null) {
    const log = (type, message, data = {}) => {
      if (logCallback) {
        logCallback(type, message, data);
      } else {
        this.log('info', `${type}: ${message}`, data);
      }
    };

    let analysis = {
      sourceType: input.sourceType,
      features: [],
      userGoals: [],
      businessRules: [],
      constraints: [],
    };

    try {
      switch (input.sourceType) {
        case 'requirement':
        case 'comprehensive':  // 综合类型，包含需求、Figma、截图等多种信息
          const reqAnalysis = await this.analyzeRequirementDoc(input.content, logCallback);
          if (reqAnalysis) {
            analysis = { ...analysis, ...reqAnalysis };
          }
          break;
        case 'figma':
          const figmaAnalysis = await this.analyzeFigmaDesign(input.content);
          if (figmaAnalysis) {
            analysis = { ...analysis, ...figmaAnalysis };
          }
          break;
        case 'image':
          const imageAnalysis = await this.analyzeImageDesign(input.content);
          if (imageAnalysis) {
            analysis = { ...analysis, ...imageAnalysis };
          }
          break;
        case 'api':
          const apiAnalysis = await this.analyzeAPIDoc(input.content);
          if (apiAnalysis) {
            analysis = { ...analysis, ...apiAnalysis };
          }
          break;
        case 'code':
          const codeAnalysis = await this.analyzeSourceCode(input.content, input.metadata || {}, logCallback);
          if (codeAnalysis) {
            analysis = { ...analysis, ...codeAnalysis };
          }
          break;
        default:
          throw new Error(`Unknown input type: ${input.sourceType}`);
      }
    } catch (error) {
      if (logCallback) {
        logCallback('错误', `需求分析出错: ${error.message}`);
      }
      // 确保返回有效的分析对象
      analysis.features = analysis.features || [];
      analysis.userGoals = analysis.userGoals || [];
    }

    if (logCallback) {
      logCallback('分析完成', `识别到 ${analysis.features?.length || 0} 个功能点`);
    }

    return analysis;
  }

  /**
   * 分析源代码以提取功能点和用户流程（针对代码输入类型）
   */
  async analyzeSourceCode(content, metadata, logCallback = null) {
    const log = (type, message, data = {}) => {
      if (logCallback) logCallback(type, message, data);
    };

    let features = [];
    
    // 如果已有元数据提取了组件信息，转换为功能点
    if (metadata.componentInfo && Array.isArray(metadata.componentInfo)) {
      features = metadata.componentInfo.map(comp => `组件 ${comp.name} 的功能`);
    }
    
    // 增加通过代码本身推断的一般性功能点
    if (metadata.language === 'dart' && metadata.stateInfo) {
      if (Array.isArray(metadata.stateInfo)) {
        metadata.stateInfo.forEach(state => {
           if(state.methods) {
               features.push(...state.methods.map(m => `测试方法: ${m}`));
           }
        });
      }
    }
    
    if (features.length === 0) {
      features.push('代码功能测试');
    }

    return {
      features,
      businessRules: [],
      constraints: []
    };
  }

  /**
   * 步骤 2：页面识别
   * @param {Object} input - 输入数据
   * @param {Object} analysis - 需求分析
   * @param {Function} logCallback - 日志回调函数
   * @returns {Array} 页面列表
   */
  async identifyPages(input, analysis, logCallback = null) {
    const log = (type, message, data = {}) => {
      if (logCallback) {
        logCallback(type, message, data);
      } else {
        this.log('info', `${type}: ${message}`, data);
      }
    };

    const pages = [];

    // 确保 analysis 有正确的结构
    if (!analysis) {
      analysis = { features: [], userGoals: [], businessRules: [], constraints: [] };
    }

    // 确保 features 是数组
    if (!Array.isArray(analysis.features)) {
      analysis.features = [];
    }

    // 从需求中提取页面
    if (analysis.features && analysis.features.length > 0) {
      analysis.features.forEach(feature => {
        // 查找页面相关的关键词
        const pageKeywords = ['列表', '详情', '页', '管理', '设置', '中心', '首页'];

        pageKeywords.forEach(keyword => {
          if (feature.includes(keyword)) {
            const pageName = this.extractPageName(feature, keyword);
            if (pageName && !pages.find(p => p.name === pageName)) {
              pages.push({
                name: pageName,
                type: this.getPageType(keyword),
                features: [feature],
              });
            } else if (pageName) {
              const existingPage = pages.find(p => p.name === pageName);
              if (existingPage) {
                existingPage.features.push(feature);
              }
            }
          }
        });
      });
    }

    // 后备方案：如果没有识别到页面，创建默认页面
    if (pages.length === 0) {
      if (logCallback) {
        logCallback('默认页面', '未识别到页面，使用默认页面');
      }
      pages.push(
        { name: '首页', type: 'home', features: ['首页入口'] },
        { name: '列表页', type: 'list', features: ['列表展示'] },
        { name: '详情页', type: 'detail', features: ['详情查看'] }
      );
    }

    if (logCallback) {
      logCallback('识别完成', `识别到 ${pages.length} 个页面`);
    }

    return pages;
  }

  /**
   * 步骤 3：用户流程推断
   * @param {Object} input - 输入数据
   * @param {Object} analysis - 需求分析
   * @param {Array} pages - 页面列表
   * @param {Function} logCallback - 日志回调函数
   * @returns {Array} 用户流程
   */
  async inferUserFlows(input, analysis, pages, logCallback = null) {
    const log = (type, message, data = {}) => {
      if (logCallback) {
        logCallback(type, message, data);
      } else {
        this.log('info', `${type}: ${message}`, data);
      }
    };

    const flows = [];

    // 基于页面推断流程
    if (pages.length >= 2) {
      // 主流程：从列表页到详情页
      const listPage = pages.find(p => p.type === 'list') || pages[0];
      const detailPage = pages.find(p => p.type === 'detail') || pages[1];

      if (listPage && detailPage) {
        flows.push({
          name: '查看详情流程',
          type: 'primary',
          steps: [
            `进入${listPage.name}`,
            `查看${listPage.name}内容`,
            `点击项目`,
            `验证进入${detailPage.name}`,
            `查看${detailPage.name}内容`,
          ],
        });
      }
    }

    // 后备方案：如果没有任何流程，创建默认流程
    if (flows.length === 0) {
      if (logCallback) {
        logCallback('默认流程', '未识别到流程，使用默认测试流程');
      }
      flows.push({
        name: '基本操作流程',
        type: 'primary',
        steps: [
          '打开应用',
          '查看页面内容',
          '执行操作',
          '验证结果',
        ],
      });
    }

    // 从需求描述中推断流程
    if (input.sourceType === 'requirement') {
      const describedFlows = this.extractFlowsFromDescription(input.content);
      flows.push(...describedFlows);
    }
    if (pages.length >= 2) {
      // 主流程：从列表页到详情页
      const listPage = pages.find(p => p.type === 'list');
      const detailPage = pages.find(p => p.type === 'detail');

      if (listPage && detailPage) {
        flows.push({
          name: '查看详情流程',
          type: 'primary',
          steps: [
            `进入${listPage.name}`,
            `查看${listPage.name}内容`,
            `点击项目`,
            `验证进入${detailPage.name}`,
            `查看${detailPage.name}内容`,
          ],
        });
      }
    }

    // 从需求描述中推断流程
    if (input.sourceType === 'requirement') {
      const describedFlows = this.extractFlowsFromDescription(input.content);
      flows.push(...describedFlows);
    }

    if (logCallback) {
      logCallback('推断完成', `推断出 ${flows.length} 个用户流程`);
    }

    return flows;
  }

  /**
   * 步骤 4：生成测试用例
   * @param {Object} input - 输入数据
   * @param {Object} analysis - 需求分析
   * @param {Array} pages - 页面列表
   * @param {Array} flows - 用户流程
   * @param {Object} options - 选项
   * @param {Function} logCallback - 日志回调函数
   * @returns {Array} 测试用例
   */
  async generateTestCases(input, analysis, pages, flows, options, logCallback = null) {
    const log = (type, message, data = {}) => {
      if (logCallback) {
        logCallback(type, message, data);
      } else {
        this.log('info', `${type}: ${message}`, data);
      }
    };

    log('分析', `开始生成测试用例...`);

    // 提取项目 URL（用于测试导航）
    const projectUrl = this.extractProjectUrl(input);

    // 使用 LLM 生成测试用例，确保 maxTokens 足够大
    if (this.llm && this.llm.chat && input.content) {
      try {
        log('AI生成', '正在使用 AI 生成测试用例...');
        let testCases;

        // 获取语言设置
        const language = input.language || 'traditional-chinese';

        // 区分代码源和其他来源
        if (input.sourceType === 'code') {
           testCases = await this.generateTestCasesFromCodeWithLLM(input.content, input.metadata || {}, projectUrl, { ...options, language }, log);
        } else {
           testCases = await this.generateTestCasesWithLLM(input.content, projectUrl, analysis, { ...options, language }, log);
        }

        log('汇总', `共生成 ${testCases.length} 条测试用例`);
        return testCases;
      } catch (error) {
        // 429 错误（余额不足）不回退，直接抛出
        if (error.message.includes('429') || error.message.includes('余额不足')) {
          log('错误', `API 余额不足: ${error.message}`);
          throw error;  // 直接抛出，不回退
        }
        log('回退', `AI 生成失败: ${error.message}，使用基于流程的生成`);
        // 继续到回退方案
      }
    }

    // 回退方案：从需求中直接提取具体步骤生成测试用例
    log('模板', '基于需求内容提取具体步骤生成测试用例');

    const testCases = [];

    // 尝试从需求中提取具体的测试步骤
    const extractedTests = this.extractConcreteTestsFromRequirement(input.content, projectUrl, log);

    if (extractedTests.length > 0) {
      testCases.push(...extractedTests);
      log('提取', `从需求中提取了 ${extractedTests.length} 个具体测试用例`);
    }

    // 如果提取失败，回退到基于流程的生成
    if (testCases.length === 0) {
      log('流程', '基于识别到的流程生成测试用例');

      // 为每个流程生成测试用例
      for (let i = 0; i < flows.length; i++) {
        const flow = flows[i];
        log('流程', `流程 ${i + 1}: ${flow.name}`);

        // 基于流程步骤生成测试用例
        if (flow.steps && flow.steps.length > 0) {
          flow.steps.forEach((step, idx) => {
            const testCase = {
              id: `TC${String(i + 1).padStart(3, '0')}${idx + 1}`,
              type: 'functional',
              name: `${flow.name} - ${step}`,
              description: `验证${step}`,
              given: this.inferGivenFromStep(step, flow, pages, projectUrl),
              when: this.inferWhenFromStep(step, flow, pages, projectUrl),
              then: this.inferThenFromStep(step, flow, pages),
              priority: 'High',
            };
            testCases.push(testCase);
            log('用例', `  ${testCases.length}. ${testCase.name}`);
          });
        }
      }

      // 如果没有流程步骤，为每个页面生成基本测试
      if (testCases.length === 0 && pages.length > 0) {
        log('页面', `为 ${pages.length} 个页面生成基本测试`);
        pages.forEach((page, idx) => {
          const testCase = {
            id: `TC_PAGE${idx + 1}`,
            type: 'ui',
            name: `${page.name} - 页面显示测试`,
            description: `验证${page.name}页面正常显示`,
            given: projectUrl ? `打开浏览器，导航到 ${projectUrl}` : `用户进入${page.name}`,
            when: projectUrl ? `等待页面加载完成，查看${page.name}的内容` : '查看页面内容',
            then: `${page.name}页面正常显示，布局正确`,
            priority: 'Medium',
          };
          testCases.push(testCase);
          log('用例', `  ${testCases.length}. ${testCase.name}`);
        });
      }
    }

    // 如果还是没有任何测试用例，生成一个默认测试
    if (testCases.length === 0) {
      log('默认', '生成默认测试用例');
      testCases.push({
        id: 'TC001',
        type: 'functional',
        name: '基本功能测试',
        description: '验证基本功能',
        given: projectUrl ? `打开浏览器，导航到 ${projectUrl}` : '用户在应用中',
        when: projectUrl ? '等待页面加载完成' : '执行基本操作',
        then: '操作成功完成',
        priority: 'High',
      });
    }

    log('汇总', `共生成 ${testCases.length} 条测试用例`);

    return testCases;
  }

  /**
   * 从输入中提取项目 URL
   */
  extractProjectUrl(input) {
    // 从 input 中查找 projectUrl
    if (input.projectUrl) {
      return input.projectUrl;
    }
    // 从 content 中尝试提取 URL
    if (input.content) {
      const urlMatch = input.content.match(/https?:\/\/[^\s]+|localhost:\d+/);
      if (urlMatch) {
        return urlMatch[0].startsWith('http') ? urlMatch[0] : `http://${urlMatch[0]}`;
      }
    }
    return null;
  }

  /**
   * 从步骤推断 Given（包含 URL）
   */
  inferGivenFromStep(step, flow, pages, projectUrl = null) {
    // 如果是第一个步骤（打开应用），包含导航
    if (step.includes('打开') || step.includes('启动') || step.includes('进入')) {
      if (projectUrl) {
        return `打开浏览器，导航到 ${projectUrl}`;
      }
    }
    // 如果步骤包含特定关键词，推断前置条件
    if (step.includes('登录') || step.includes('账号') || step.includes('密码')) {
      return projectUrl ? `已打开 ${projectUrl}，用户在登录页面` : '用户在登录页面';
    }
    if (step.includes('列表') || step.includes('查看')) {
      return projectUrl ? `已打开 ${projectUrl}，用户已登录系统` : '用户已登录系统';
    }
    if (step.includes('详情') || step.includes('信息')) {
      return projectUrl ? `已打开 ${projectUrl}，用户在相关页面` : '用户在相关页面';
    }
    return projectUrl ? `已打开 ${projectUrl}，用户在系统中` : '用户在系统中';
  }

  /**
   * 从步骤推断 When（包含具体操作）
   */
  inferWhenFromStep(step, flow, pages, projectUrl = null) {
    // 让步骤更具体
    if (step === '打开应用' || step === '启动应用') {
      return projectUrl
        ? `导航到 ${projectUrl}，等待页面加载完成`
        : '打开应用，等待加载完成';
    }
    if (step === '查看页面内容') {
      return projectUrl
        ? `检查页面标题和主要内容是否正确显示`
        : '查看页面内容';
    }
    if (step === '执行操作') {
      return projectUrl
        ? `在页面上执行相关操作`
        : '执行操作';
    }
    if (step === '验证结果') {
      return projectUrl
        ? `检查页面状态，验证操作结果`
        : '验证结果';
    }
    return step;
  }

  /**
   * 从步骤推断 Then（预期结果）
   */
  inferThenFromStep(step, flow, pages, projectUrl = null) {
    // 从步骤中推断预期结果
    if (step.includes('进入') || step.includes('打开') || step.includes('启动')) {
      if (step.includes('登录')) {
        return '登录页面正常显示，包含用户名和密码输入框';
      }
      if (step.includes('首页') || step.includes('主页')) {
        return '首页正常加载，导航栏和主要内容正确显示';
      }
      return '页面正常加载，URL正确，布局完整';
    }
    if (step.includes('点击') || step.includes('选择')) {
      return '操作响应正确，页面跳转或状态更新符合预期';
    }
    if (step.includes('输入') || step.includes('填写')) {
      return '输入被正确接收，输入框显示正确的内容';
    }
    if (step.includes('验证') || step.includes('检查')) {
      return '验证通过，结果显示符合预期要求';
    }
    if (step.includes('列表')) {
      return '列表数据正确显示，分页功能正常';
    }
    if (step.includes('详情')) {
      return '详情页正确打开，所有信息完整显示';
    }
    if (step === '查看页面内容') {
      return '页面内容正确显示，所有元素可见';
    }
    if (step === '执行操作') {
      return '操作成功执行，系统给出正确反馈';
    }
    if (step === '验证结果') {
      return '验证通过，结果符合预期';
    }
    return '操作成功完成';
  }

  /**
   * 从需求文本中提取具体的测试用例（改进版）
   * 将相关步骤组合成完整的、可执行的测试用例
   * @param {string} requirement - 需求文本
   * @param {string} projectUrl - 项目URL
   * @param {Function} log - 日志函数
   * @returns {Array} 测试用例数组
   */
  extractConcreteTestsFromRequirement(requirement, projectUrl, log) {
    const testCases = [];

    if (!requirement || typeof requirement !== 'string') {
      return testCases;
    }

    // 按行分割需求
    const lines = requirement.split(/[\n\r]+/).map(line => line.trim()).filter(line => line);

    // 收集所有步骤和值，然后组装成完整的测试用例
    let idValue = null;
    let passwordValue = null;
    let allSteps = [];
    let targetPage = null;
    let currentPage = '登录页';

    // 第一遍扫描：提取所有关键信息
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const cleanLine = line.replace(/^\d+[\.\、]\s*/, '').trim();

      // 检测页面上下文
      if (cleanLine.includes('登录界面') || cleanLine.includes('登录页')) {
        currentPage = '登录页';
      } else if (cleanLine.includes('密码输入') || cleanLine.includes('密码框') || cleanLine.includes('密码页')) {
        currentPage = '密码输入页';
      } else if (cleanLine.includes('管理') || cleanLine.includes('首页') || cleanLine.includes('主页面')) {
        const pageMatch = cleanLine.match(/(?:跳转|进入|切换).*?([\u4e00-\u9fa5\w]+)/);
        if (pageMatch) {
          targetPage = pageMatch[1];
        }
      }

      // 提取 ID 值（通常是用户名/账号）
      const idMatch = cleanLine.match(/(?:在)?(?:ID|账号|用户名|用户)(?:输入框|框)?\s*(?:输入|填入)\s*([a-zA-Z0-9_]+)/);
      if (idMatch) {
        idValue = idMatch[1];
        allSteps.push({ type: 'input', page: '登录页', action: `在ID输入框输入 ${idValue}` });
      }

      // 提取密码值
      const pwdMatch = cleanLine.match(/(?:在)?(?:密码|pwd|password)(?:输入框|框)?\s*(?:输入|填入)\s*([^\s，。]+)/);
      if (pwdMatch) {
        passwordValue = pwdMatch[1];
        allSteps.push({ type: 'input', page: '密码输入页', action: `在密码输入框输入 ${passwordValue}` });
      }

      // 提取点击操作
      if (cleanLine.includes('下一步')) {
        allSteps.push({ type: 'click', page: '登录页', action: '点击下一步按钮' });
      }

      if (cleanLine.includes('登录') || cleanLine.includes('登入')) {
        const clickMatch = cleanLine.match(/点击\s*(?:登录|登入)(?:按钮)?/);
        if (clickMatch) {
          allSteps.push({ type: 'click', page: '密码输入页', action: '点击登录按钮' });
        }
      }
    }

    // 如果找到了登录流程的步骤，生成完整的测试用例
    if (allSteps.length > 0) {
      // 主流程：正常登录
      const mainFlowWhenSteps = [];

      for (const step of allSteps) {
        if (step.type === 'click' && step.action.includes('下一步')) {
          mainFlowWhenSteps.push(step.action);
          mainFlowWhenSteps.push('等待5000ms让页面更新');
        } else {
          mainFlowWhenSteps.push(step.action);
        }
      }

      // 添加最后的等待和验证
      if (mainFlowWhenSteps.length > 0) {
        mainFlowWhenSteps.push('等待7000ms让页面跳转');
        mainFlowWhenSteps.push(`检查是否跳转到${targetPage || '账号权限管理页'}`);
      }

      if (mainFlowWhenSteps.length > 1) {
        testCases.push({
          id: 'TC001',
          type: 'functional',
          name: '用户登录正常流程',
          page: '登录页',
          description: `验证输入${idValue || '正确的ID'}和密码后能成功登录`,
          given: '用户在登录页面，ID输入框可见',
          when: `输入ID${idValue ? ` ${idValue}` : ''}，点击下一步，输入密码，点击登录`,
          when_steps: mainFlowWhenSteps,
          then: `检查是否跳转到${targetPage || '账号权限管理页'}`,
          priority: 'High'
        });
        log('提取', `  测试用例 1: 用户登录正常流程`);
      }

      // 异常测试：密码为空
      if (idValue) {
        testCases.push({
          id: 'TC002',
          type: 'exception',
          name: '用户登录-密码为空',
          page: '密码输入页',
          description: '验证密码为空时显示提示信息',
          given: `用户在登录页面，已输入ID为 ${idValue}`,
          when: '不输入密码直接点击登录',
          when_steps: [
            `在ID输入框输入 ${idValue}`,
            '点击下一步按钮',
            '等待5000ms让页面更新',
            '点击登录按钮'
          ],
          then: '检查是否显示密码不能为空的提示',
          priority: 'High'
        });
        log('提取', `  测试用例 2: 用户登录-密码为空`);
      }

      // 异常测试：错误密码
      if (idValue) {
        testCases.push({
          id: 'TC003',
          type: 'exception',
          name: '用户登录-密码错误',
          page: '密码输入页',
          description: '验证输入错误密码时显示错误提示',
          given: `用户在登录页面，已输入ID为 ${idValue}`,
          when: '输入错误密码并点击登录',
          when_steps: [
            `在ID输入框输入 ${idValue}`,
            '点击下一步按钮',
            '等待5000ms让页面更新',
            '在密码输入框输入 WrongPassword123',
            '点击登录按钮'
          ],
          then: '检查是否显示密码错误的提示',
          priority: 'High'
        });
        log('提取', `  测试用例 3: 用户登录-密码错误`);
      }
    }

    // 如果还是没有提取到测试用例，尝试生成一个综合测试用例
    if (testCases.length === 0 && lines.length > 0) {
      log('警告', '无法从需求中提取具体步骤，生成综合测试用例');

      // 尝试从整个需求中提取关键信息
      const fullText = requirement;

      // 提取所有可能的输入值
      const allValues = fullText.match(/[a-zA-Z0-9@!]{3,}/g) || [];

      if (allValues.length > 0) {
        const steps = [];
        const id = allValues[0];
        const pwd = allValues.length > 1 ? allValues.find(v => v.includes('!') || v.length >= 8) || allValues[1] : 'Test@123';

        steps.push(`在ID输入框输入 ${id}`);
        steps.push('点击下一步按钮');
        steps.push('等待5000ms让页面更新');
        steps.push(`在密码输入框输入 ${pwd}`);
        steps.push('点击登录按钮');
        steps.push('等待7000ms让页面跳转');

        testCases.push({
          id: 'TC001',
          type: 'functional',
          name: '用户登录正常流程',
          page: '登录页',
          description: '验证完整的登录流程',
          given: '用户在登录页面，ID输入框可见',
          when: '输入ID和密码并点击登录',
          when_steps: steps,
          then: '检查是否跳转到账号权限管理页',
          priority: 'High',
        });
      }
    }

    return testCases;
  }

  /**
   * 根据步骤生成测试用例名称
   */
  generateTestName(steps, page) {
    if (steps.length === 1) {
      const step = steps[0];
      if (step.includes('输入')) {
        return '输入操作';
      }
      if (step.includes('点击')) {
        return '点击操作';
      }
      return step.substring(0, 20);
    }

    const firstStep = steps[0];
    const lastStep = steps[steps.length - 1];

    if (firstStep.includes('ID') && lastStep.includes('下一步')) {
      return '输入ID并跳转';
    }
    if (firstStep.includes('密码') && lastStep.includes('登录')) {
      return '输入密码并登录';
    }
    if (firstStep.includes('输入') && lastStep.includes('点击')) {
      return '输入并提交';
    }

    return `${page} - 操作测试`;
  }

  /**
   * 根据步骤生成测试描述
   */
  generateTestDescription(steps) {
    return `验证${steps.join('，')}的操作流程`;
  }

  /**
   * 使用 LLM 生成测试用例
   * @param {string} requirement - 需求描述
   * @param {string} projectUrl - 项目URL
   * @param {Object} analysis - 需求分析
   * @param {Object} options - 选项
   * @param {Function} logCallback - 日志回调
   * @returns {Array} 测试用例
   */
  async generateTestCasesWithLLM(requirement, projectUrl, analysis, options, logCallback) {
    const log = (type, message, data = {}) => {
      if (logCallback) {
        logCallback(type, message, data);
      }
    };

    // ========== 加载项目上下文 ==========
    let projectContext = '';
    let referenceExamples = '';

    if (this.projectPath) {
      const fs = require('fs');
      const path = require('path');

      // 1. 尝试读取 AI_CONTEXT.md - 减少长度避免过长
      let userDataDir;
      try {
        const { app } = require('electron');
        userDataDir = app.isPackaged
          ? path.join(path.dirname(app.getPath('exe')), 'data')
          : path.join(__dirname, '../../..', 'data');
      } catch (e) {
        userDataDir = path.join(__dirname, '../../..', 'data');
      }
      const contextPaths = [
        path.join(this.projectPath, 'AI_CONTEXT.md'),
        path.join(userDataDir, 'AI_Scan_file', path.basename(this.projectPath), `${path.basename(this.projectPath)}_AI_CONTEXT.md`)
      ];

      for (const contextPath of contextPaths) {
        try {
          if (fs.existsSync(contextPath)) {
            const context = fs.readFileSync(contextPath, 'utf-8');
            // 减少到 1000 字符以提高处理速度
            const maxLength = 1000;
            projectContext = context.length > maxLength
              ? context.substring(0, maxLength) + '\n...(已截断)'
              : context;
            log('上下文', `已加载 AI_CONTEXT (${context.length} -> ${projectContext.length} 字符)`);
            break;
          }
        } catch (e) {
          // 忽略错误，继续尝试下一个路径
        }
      }

      // 2. 尝试读取现有测试用例作为参考 - 只取1个
      const testResultPath = path.join(userDataDir, 'AI_Scan_file', path.basename(this.projectPath), 'test-result.json');
      try {
        if (fs.existsSync(testResultPath)) {
          const testResult = JSON.parse(fs.readFileSync(testResultPath, 'utf-8'));
          if (testResult.testCases && testResult.testCases.length > 0) {
            referenceExamples = '\n\n# 参考测试用例格式\n';
            const tc = testResult.testCases[0];
            referenceExamples += `TC001: ${tc.name || tc.id}\n`;
            referenceExamples += `Given: ${tc.given}\n`;
            referenceExamples += `When: ${tc.when}\n`;
            if (tc.when_steps && tc.when_steps.length > 0) {
              referenceExamples += `Steps: ${tc.when_steps.join(' -> ')}\n`;
            }
            referenceExamples += `Then: ${tc.then}\n\n`;
            log('参考', `已包含 1 个参考用例`);
          }
        }
      } catch (e) {
        // 忽略错误
      }
    }

    // ========== 构建增强提示词 ==========
    const language = options?.language || 'traditional-chinese';
    const prompt = this.buildEnhancedPrompt(requirement, projectContext, referenceExamples, projectUrl, language);

    log('AI生成', '正在使用增强的 AI 提示词生成测试用例...');
    log('调试', `提示词长度: ${prompt.length} 字符`);
    log('调试', `项目上下文: ${projectContext ? '已加载 (' + projectContext.length + ' 字符)' : '未加载'}`);
    log('调试', `参考示例: ${referenceExamples ? '已包含' : '无'}`);
    log('调试', `需求内容: "${requirement.substring(0, 200)}${requirement.length > 200 ? '...' : ''}"`);

    // 添加超时保护 - 增加超时时间到 300 秒（5分钟）
    // 添加超时警告日志（在重试循环外，只触发一次）
    const warningTimeout = 30000; // 30秒后显示等待警告
    let warningTimer = null;
    let warningShown = false;

    const showWarningOnce = () => {
      if (!warningShown) {
        log('等待', 'LLM 请求处理中，请耐心等待...（已等待30秒）');
        warningShown = true;
      }
    };

    // 正确调用 LLM Router: chat(taskType, messages, options)
    // 设置足够大的 max_tokens 确保返回完整的 JSON
    log('调试', '开始调用 LLM API...');

    // 添加重试逻辑处理 429 错误
    const maxRetries = 3;
    const retryDelay = 10000; // 10秒
    let response = null;
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const startTime = Date.now();
      const timestamp = Date.now();

      // 设置超时（每次重试都重新设置）- 设置为 200 秒，略高于 LLM Client 的 180 秒
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('LLM 请求超时 (200秒)')), 200000);
      });

      // 设置警告定时器（仅在第一次尝试时）
      if (attempt === 1) {
        warningTimer = setTimeout(showWarningOnce, warningTimeout);
      }

      try {
        const llmPromise = this.llm.chat('test_generation', [
          { role: 'user', content: `${prompt}\n\n[请求ID: ${timestamp}-${attempt}]` }
        ], {
          temperature: 0.7,
          maxTokens: 8000  // 减少以提高速度
        });

        response = await Promise.race([llmPromise, timeoutPromise]);
        const elapsed = Date.now() - startTime;

        // 检查是否是 429 错误 - 余额不足，立即失败不重试
        if (response && !response.success && response.error && response.error.includes('429')) {
          log('错误', `LLM 返回 429 错误（余额不足），立即终止`);
          throw new Error(`API 余额不足，请充值后重试: ${response.error}`);
        }

        // 成功获取响应
        if (warningTimer) {
          clearTimeout(warningTimer);
        }

        // 详细调试信息
        log('成功', `LLM 响应收到，用时: ${(elapsed/1000).toFixed(1)}秒`);
        log('调试', `响应结构: ${JSON.stringify({ keys: Object.keys(response), hasContent: !!response?.content, contentLength: response?.content?.length || 0 })}`);

        break;
      } catch (error) {
        const elapsed = Date.now() - startTime;
        log('错误', `LLM 调用失败 (尝试 ${attempt}/${maxRetries}, 用时: ${(elapsed/1000).toFixed(1)}秒): ${error.message}`);
        lastError = error.message;

        if (attempt < maxRetries) {
          log('警告', `${retryDelay/1000}秒后重试...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          continue;
        }

        if (warningTimer) {
          clearTimeout(warningTimer);
        }
        throw new Error(`LLM 调用失败: ${error.message}`);
      }
    }

    // 检查最终响应
    if (!response) {
      throw new Error(`LLM 调用失败: ${lastError || '未知错误'}`);
    }

    // 检查响应的 success 字段
    if (response.success === false) {
      log('错误', `LLM 返回错误: ${response.error}`);
      throw new Error(`LLM 返回错误: ${response.error}`);
    }

    // 检查响应内容
    if (!response.content) {
      log('错误', `LLM 返回缺少 content 字段。响应: ${JSON.stringify(response).substring(0, 500)}`);
      throw new Error(`LLM 返回缺少 content 字段`);
    }

    if (response.content.length === 0) {
      log('错误', 'LLM 返回的 content 为空字符串');
      throw new Error('LLM 返回的 content 为空字符串');
    }

    log('成功', `内容长度: ${response.content.length} 字符`);

    // 清理响应内容，移除可能的 markdown 标记
    let content = response.content.trim();

    // 移除 markdown 代码块标记
    content = content.replace(/```json\s*/g, '').replace(/```\s*/g, '');

    // 尝试提取 JSON 数组
    let jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      log('错误', `LLM 返回中没有找到 JSON 数组。响应前500字符: ${content.substring(0, 500)}`);
      throw new Error('LLM 返回中没有找到 JSON 数组');
    }

    let testCases = [];
    try {
      testCases = JSON.parse(jsonMatch[0]);
    } catch (e) {
      log('错误', `JSON 解析失败: ${e.message}`);
      log('错误', `JSON内容前500字符: ${jsonMatch[0].substring(0, 500)}`);
      throw new Error(`JSON 解析失败: ${e.message}`);
    }

    if (!Array.isArray(testCases)) {
      throw new Error('返回的不是数组格式');
    }

    if (testCases.length === 0) {
      throw new Error('LLM 没有生成任何测试用例');
    }

    // 验证并补全测试用例
    const validTestCases = testCases.map((tc, idx) => {
      // 记录原始数据用于调试
      log('调试', `测试用例 ${idx + 1} 原始数据:`, {
        id: tc.id,
        name: tc.name,
        given: tc.given,
        when: tc.when,
        then: tc.then,
        when_steps: tc.when_steps,
        page: tc.page,
      });

      const testCase = {
        id: tc.id || `TC${String(idx + 1).padStart(3, '0')}`,
        type: tc.type || 'functional',
        name: tc.name || `测试用例 ${idx + 1}`,
        description: tc.description || '',
        given: tc.given || '',
        when: tc.when || '',
        then: tc.then || '',
        when_steps: tc.when_steps || [],
        page: tc.page || '',
        priority: tc.priority || 'Medium',
      };

      // 如果 given/when/then 为空，记录警告
      if (!testCase.given) {
        log('警告', `测试用例 ${testCase.id} 缺少 Given（前置条件）`);
      }
      if (!testCase.when) {
        log('警告', `测试用例 ${testCase.id} 缺少 When（操作步骤）`);
      }
      if (!testCase.then) {
        log('警告', `测试用例 ${testCase.id} 缺少 Then（预期结果）`);
      }

      return testCase;
    });

    // 输出生成的测试用例摘要
    validTestCases.forEach((tc, idx) => {
      log('用例', `  ${idx + 1}. [${tc.type}] ${tc.name}`);
      log('步骤', `    Given: ${tc.given || '(未提供)'}`);
      log('步骤', `    When: ${tc.when || '(未提供)'}`);
      log('步骤', `    Then: ${tc.then || '(未提供)'}`);
    });

    return validTestCases;
  }

  /**
   * 构建增强的测试生成提示词
   * @param {string} requirement - 用户需求
   * @param {string} projectContext - 项目上下文
   * @param {string} referenceExamples - 参考用例
   * @param {string} projectUrl - 项目URL
   * @param {string} language - 测试用例语言 (simplified-chinese, traditional-chinese, english)
   * @returns {string} 增强的提示词
   */
  buildEnhancedPrompt(requirement, projectContext, referenceExamples, projectUrl, language = 'traditional-chinese') {
    // 根据语言设置不同的输出语言指令
    const languageConfigs = {
      'simplified-chinese': {
        outputLanguage: 'Simplified Chinese (简体中文)',
        exampleName: '用户登录测试',
        examplePage: '登录页',
        exampleGiven: '用户在登录页面',
        exampleWhen: '输入用户名和密码，点击登录按钮',
        exampleWhenSteps: '["在用户名输入框输入 admin", "在密码输入框输入 123456", "点击登录按钮", "等待 3000ms"]',
        exampleThen: '成功登录进入首页',
        inputStep: '在 [字段] 输入 [值]',
        clickStep: '点击 [按钮]',
        waitStep: '等待 [时长]ms 页面更新',
        verifyStep: '检查 [元素] 是否显示',
        emptyTest: '[字段] 留空，点击下一步按钮',
      },
      'traditional-chinese': {
        outputLanguage: 'Traditional Chinese (繁體中文)',
        exampleName: '用戶登入測試',
        examplePage: '登入頁',
        exampleGiven: '用戶在登入頁面',
        exampleWhen: '輸入用戶名稱和密碼，點擊登入按鈕',
        exampleWhenSteps: '["在用戶名稱輸入框輸入 admin", "在密碼輸入框輸入 123456", "點擊登入按鈕", "等待 3000ms"]',
        exampleThen: '成功登入進入首頁',
        inputStep: '在 [字段] 輸入 [值]',
        clickStep: '點擊 [按鈕]',
        waitStep: '等待 [時長]ms 頁面更新',
        verifyStep: '檢查 [元素] 是否顯示',
        emptyTest: '[字段] 留空，點擊下一步按鈕',
      },
      'english': {
        outputLanguage: 'English',
        exampleName: 'User Login Test',
        examplePage: 'Login Page',
        exampleGiven: 'User is on login page',
        exampleWhen: 'Enter username and password, click login button',
        exampleWhenSteps: '["Input admin in username field", "Input 123456 in password field", "Click login button", "Wait 3000ms"]',
        exampleThen: 'Successfully login to homepage',
        inputStep: 'Input [value] in [field]',
        clickStep: 'Click [button]',
        waitStep: 'Wait [duration]ms for page update',
        verifyStep: 'Check if [element] is displayed',
        emptyTest: 'Leave [field] empty, click Next button',
      },
    };

    const config = languageConfigs[language] || languageConfigs['traditional-chinese'];

    // 精简版提示词 - 减少 Token 使用以提高速度
    let prompt = `Generate BDD test cases as a JSON array based on the requirement.

## Output Language
Generate all test case content in ${config.outputLanguage}

## Requirement
${requirement}

${projectContext && projectContext.length < 1000 ? `
## Context
${projectContext}
` : ''}

## Output Format
[
  {
    "id": "TC001",
    "type": "functional",
    "name": "${config.exampleName}",
    "page": "${config.examplePage}",
    "given": "${config.exampleGiven}",
    "when": "${config.exampleWhen}",
    "when_steps": [
      { "type": "input", "target": "用户名", "value": "admin", "description": "在用户名输入框输入 admin" },
      { "type": "input", "target": "密码", "value": "123456", "description": "在密码输入框输入 123456" },
      { "type": "click", "target": "登录按钮", "description": "点击登录按钮" },
      { "type": "wait", "duration": 3000, "description": "等待 3000ms" }
    ],
    "then": "${config.exampleThen}",
    "priority": "High"
  }
]

## Step Structure (IMPORTANT)
Each step MUST be an object with these fields:
- type: "input" | "click" | "wait" | "navigate" | "verify"
- target: The element name (e.g., "用户名", "密码", "登录按钮", "下一步按钮")
- value: (optional) The value to input (only for type="input")
- duration: (optional) Wait time in ms (only for type="wait")
- description: Human-readable description

## Step Format Rules
- Input: { "type": "input", "target": "[字段名]", "value": "[值]", "description": "${config.inputStep}" }
- Click: { "type": "click", "target": "[按钮名]", "description": "${config.clickStep}" }
- Wait: { "type": "wait", "duration": [时长], "description": "${config.waitStep}" }
- Verify: { "type": "verify", "target": "[元素名]", "description": "${config.verifyStep}" }

## Input Field Button Naming Convention (IMPORTANT)
When referring to buttons associated with input fields (clear, show/hide, search icons):
- Use SPECIFIC naming to distinguish between different button types:
  - Clear button (× icon): "[字段]清除按鈕" or "[字段]×按鈕" (e.g., "ID搜尋框清除按鈕", "密碼框×按鈕")
  - Search button (magnifying glass): "[字段]搜尋按鈕" or "[字段]右側按鈕" (e.g., "ID搜尋框搜尋按鈕")
  - Show/hide password button: "[字段]顯示按鈕" or "[字段]眼睛按鈕" (e.g., "密碼框顯示按鈕")
- DO NOT use generic names like "搜尋按鈕" alone when there are multiple icon buttons
- Include the input field name to make the target specific and unambiguous

## Given-When Relationship Rule
CRITICAL: The Given step describes the PRECONDITION state. The When step MUST NOT repeat actions already completed in Given.
- If Given says "用戶已在密碼輸入頁面" (User is already on password page), When steps should NOT include:
  - Inputting ID in ID field
  - Clicking "Next" button to reach password page
  - Waiting for page transition to password page
- When steps should ONLY describe actions starting FROM the Given state
- Example: Given="用戶已在密碼輸入頁面", When="在密碼輸入框輸入 A!123456，點擊登入按鈕" (NOT "輸入ID，點擊下一步，輸入密碼，點擊登入")

## Form Validation Verification Rules
IMPORTANT: When generating test cases for form validation (empty fields, invalid input, etc.):
1. The "then" step MUST specify the exact expected error message using one of these formats:
   - Quote format: "顯示錯誤文案「欄位不能為空」" or "显示错误文案\"ID不能为空\""
   - Colon format: "錯誤提示：欄位不能為空" or "错误提示：ID不能为空"
   - Display+Error format: "顯示欄位不能為空錯誤" or "显示ID不能为空错误"
2. Always include both error message verification AND visual indicator:
   - Check if error message text appears below the input field
   - Check if the input field border changes to red color
   - Example: "檢查 ID輸入框下方是否顯示錯誤文案「欄位不能為空」，且輸入框外框變紅"
3. For negative tests (empty/invalid input), do NOT expect page navigation
4. Be specific about what error should appear and where

## Important Notes
1. For multi-step single-page apps (same URL, content changes): Add "Wait 5000-7000ms for page state update" after page transitions
2. Verify by checking element display, not URL changes
3. Return ONLY valid JSON array, no markdown, no explanations

## Data Preparation Requirements (CRITICAL)
**CRITICAL: For data verification tests (表格数据验证、省略号、tooltip等), MUST ensure data exists BEFORE verification:**

1. **Data Search Tests (数据查询测试)**:
   - When steps MUST include: Input search term → Click search button → Wait for data
   - Example: `["在ID搜尋框輸入 A", "點擊搜尋按鈕", "等待 2000ms"]`
   - NEVER test data verification on empty pages

2. **Table Feature Tests (表格功能测试)**:
   - Tooltip/省略号 tests: MUST search first to get table data
   - Field verification tests: MUST search first to populate table
   - Pagination tests: Must have data to paginate
   - Example for tooltip test: `["在ID搜尋框輸入 A", "點擊搜尋按鈕", "等待 2000ms", "滑鼠移至郵件地址欄位", "等待 500ms"]`

3. **If the test involves checking table content**:
   - ALWAYS add a search step before verification
   - Use simple search terms like "A", "1", or common data
   - Wait at least 2000ms for table to populate

4. **Examples of CORRECT test flows**:
   - ✅ Given: 用戶在帳號管理頁面, When: 在ID搜尋框輸入 A → 點擊搜尋按鈕 → 等待 2000ms → 滑鼠移至郵件地址, Then: 顯示提示框展示完整資料
   - ❌ Given: 用戶在帳號管理頁面, When: 滑鼠移至郵件地址, Then: 顯示提示框 (WRONG: no data!)
`;

    return prompt;
  }

  /**
   * 使用 LLM 基于代码上下文生成测试用例
   * @param {string} codeContextStr - 代码上下文（已格式化为 markdown 的字符串）
   * @param {Object} metadata - 代码上下文元数据（包含 astInfo 等增强信息）
   * @param {string} projectUrl - 项目URL
   * @param {Object} options - 选项（包含 language）
   * @param {Function} logCallback - 日志回调
   */
  async generateTestCasesFromCodeWithLLM(codeContextStr, metadata, projectUrl, options, logCallback) {
    const log = (type, message, data = {}) => {
      if (logCallback) logCallback(type, message, data);
    };

    // 获取语言设置
    const language = options?.language || 'traditional-chinese';

    // 语言配置
    const languageConfigs = {
      'simplified-chinese': {
        outputLanguage: 'Simplified Chinese (简体中文)',
        moduleExample: '功能模块',
        nameExample: '用户登录测试',
        pageExample: '登录页',
        descriptionExample: '验证用户登录功能',
        givenExample: '用户在登录页面',
        whenExample: '输入正确的用户名和密码',
        whenStepsExample: '["在用户名输入框输入 admin", "在密码输入框输入 123456", "点击登录按钮", "等待 3000ms"]',
        thenExample: '成功登录进入首页',
        inputStep: '在 [字段] 输入 [值]',
        clickStep: '点击 [按钮]',
        waitStep: '等待 [时长]ms 页面更新',
        verifyStep: '检查 [元素] 是否显示',
        emptyTest: '[字段] 留空，点击下一步按钮',
      },
      'traditional-chinese': {
        outputLanguage: 'Traditional Chinese (繁體中文)',
        moduleExample: '功能模組',
        nameExample: '用戶登入測試',
        pageExample: '登入頁',
        descriptionExample: '驗證用戶登入功能',
        givenExample: '用戶在登入頁面',
        whenExample: '輸入正確的用戶名稱和密碼',
        whenStepsExample: '["在用戶名稱輸入框輸入 admin", "在密碼輸入框輸入 123456", "點擊登入按鈕", "等待 3000ms"]',
        thenExample: '成功登入進入首頁',
        inputStep: '在 [字段] 輸入 [值]',
        clickStep: '點擊 [按鈕]',
        waitStep: '等待 [時長]ms 頁面更新',
        verifyStep: '檢查 [元素] 是否顯示',
        emptyTest: '[字段] 留空，點擊下一步按鈕',
      },
      'english': {
        outputLanguage: 'English',
        moduleExample: 'Feature Module',
        nameExample: 'User Login Test',
        pageExample: 'LoginPage',
        descriptionExample: 'Verify user login functionality',
        givenExample: 'User is on login page',
        whenExample: 'Enter valid username and password',
        whenStepsExample: '["Input admin in username field", "Input 123456 in password field", "Click login button", "Wait 3000ms"]',
        thenExample: 'Successfully login to homepage',
        inputStep: 'Input [value] in [field]',
        clickStep: 'Click [button]',
        waitStep: 'Wait [time]ms for page update',
        verifyStep: 'Check if [element] is displayed',
        emptyTest: 'Leave [field] empty, click Next button',
      },
    };

    const config = languageConfigs[language] || languageConfigs['traditional-chinese'];

    // 构建增强的上下文信息
    let enhancedContext = '';

    if (metadata.astInfo) {
      enhancedContext = this.buildEnhancedContextFromAST(metadata.astInfo);
    }

    const prompt = `Generate BDD test cases as JSON based on code analysis.

## Output Language
Generate all test case content in ${config.outputLanguage}

${enhancedContext ? `=== Code Analysis ===\n${enhancedContext}\n\n` : ''}

Code Context:
${codeContextStr}

## Output Format
Return an object with a "modules" array, each containing scenarios:
{
  "modules": [
    {
      "module": "${config.moduleExample}",
      "scenarios": [
        {
          "id": "TC001",
          "type": "functional|exception|boundary",
          "name": "${config.nameExample}",
          "page": "${config.pageExample}",
          "description": "${config.descriptionExample}",
          "given": "${config.givenExample}",
          "when": "${config.whenExample}",
          "when_steps": [
            { "type": "input", "target": "用户名", "value": "admin", "description": "在用户名输入框输入 admin" },
            { "type": "input", "target": "密码", "value": "123456", "description": "在密码输入框输入 123456" },
            { "type": "click", "target": "登录按钮", "description": "点击登录按钮" },
            { "type": "wait", "duration": 3000, "description": "等待 3000ms" }
          ],
          "then": "${config.thenExample}",
          "priority": "High"
        }
      ]
    }
  ]
}

## Step Structure (IMPORTANT)
Each step MUST be an object with these fields:
- type: "input" | "click" | "wait" | "navigate" | "verify"
- target: The element name (e.g., "用户名", "密码", "登录按钮", "下一步按钮")
- value: (optional) The value to input (only for type="input")
- duration: (optional) Wait time in ms (only for type="wait")
- description: Human-readable description

## Step Format
- Input: { "type": "input", "target": "[字段名]", "value": "[值]", "description": "${config.inputStep}" }
- Click: { "type": "click", "target": "[按钮名]", "description": "${config.clickStep}" }
- Wait: { "type": "wait", "duration": [时长], "description": "${config.waitStep}" }
- Verify: { "type": "verify", "target": "[元素名]", "description": "${config.verifyStep}" }

## Input Field Button Naming Convention (IMPORTANT)
When referring to buttons associated with input fields (clear, show/hide, search icons):
- Use SPECIFIC naming to distinguish between different button types:
  - Clear button (× icon): "[字段]清除按鈕" or "[字段]×按鈕" (e.g., "ID搜尋框清除按鈕", "密碼框×按鈕")
  - Search button (magnifying glass): "[字段]搜尋按鈕" or "[字段]右側按鈕" (e.g., "ID搜尋框搜尋按鈕")
  - Show/hide password button: "[字段]顯示按鈕" or "[字段]眼睛按鈕" (e.g., "密碼框顯示按鈕")
- DO NOT use generic names like "搜尋按鈕" alone when there are multiple icon buttons
- Include the input field name to make the target specific and unambiguous

## Given-When Relationship Rule
CRITICAL: The Given step describes the PRECONDITION state. The When step MUST NOT repeat actions already completed in Given.
- If Given says "用戶已在密碼輸入頁面" (User is already on password page), When steps should NOT include:
  - Inputting ID in ID field
  - Clicking "Next" button to reach password page
  - Waiting for page transition to password page
- When steps should ONLY describe actions starting FROM the Given state
- Example: Given="用戶已在密碼輸入頁面", When="在密碼輸入框輸入 A!123456，點擊登入按鈕" (NOT "輸入ID，點擊下一步，輸入密碼，點擊登入")

## Form Validation Verification Rules
IMPORTANT: When generating test cases for form validation (empty fields, invalid input, etc.):
1. The "then" step MUST specify the exact expected error message using one of these formats:
   - Quote format: "顯示錯誤文案「欄位不能為空」" or "显示错误文案\"ID不能为空\""
   - Colon format: "錯誤提示：欄位不能為空" or "错误提示：ID不能为空"
   - Display+Error format: "顯示欄位不能為空錯誤" or "显示ID不能为空错误"
2. Always include both error message verification AND visual indicator:
   - Check if error message text appears below the input field
   - Check if the input field border changes to red color
   - Example: "檢查 ID輸入框下方是否顯示錯誤文案「欄位不能為空」，且輸入框外框變紅"
3. For negative tests (empty/invalid input), do NOT expect page navigation
4. Be specific about what error should appear and where

## Data Preparation Requirements (CRITICAL)
**CRITICAL: For data verification tests (表格数据、tooltip、省略号、字段验证等), MUST ensure data exists BEFORE verification:**

1. **Table Data Tests (表格数据测试)**:
   - When steps MUST include: Search action → Wait for data → Verification
   - NEVER verify table content on empty pages (显示"查無資料")
   - Example: \`["在ID搜尋框輸入 A", "點擊搜尋按鈕", "等待 2000ms", "檢查表格包含ID欄位"]\`

2. **Tooltip/Ellipsis Tests (提示框/省略号测试)**:
   - MUST search first to get data with long content
   - Example: \`["在ID搜尋框輸入 A", "點擊搜尋按鈕", "等待 2000ms", "滑鼠移至郵件地址欄位", "等待 500ms"]\`
   - Target email or name fields which often have long text

3. **Field Verification Tests (字段验证测试)**:
   - Add search step if test involves checking table fields
   - Example: \`["在ID搜尋框輸入 A", "點擊搜尋按鈕", "等待 2000ms", "驗證表格包含ID、名稱等欄位"]\`

4. **General Rule**:
   - If test name contains: 表格、数据、省略号、tooltip、字段 → ADD SEARCH STEP
   - Use simple search terms: "A", "1", or common first character
   - Always wait at least 2000ms after search button click

## Single-Route Multi-Page Handling
If the app uses state-driven page switching (same URL, content changes):
1. Add "Wait 5000-7000ms for page state update" after transition steps
2. Verify by checking element display, not URL changes
3. Do not refresh between steps to maintain state
4. Empty field test: "${config.emptyTest}" (NOT "Input ''")

Return ONLY valid JSON object, no markdown, no explanations.
`;

    log('AI生成', '正在使用 AI 分析代码并生成测试用例...');
    log('调试', `代码上下文长度: ${codeContextStr.length} 字符`);
    if (metadata.astInfo) {
      log('AST信息', `类: ${metadata.astInfo.classes.length}, API: ${metadata.astInfo.apiCalls.length}, UI: ${metadata.astInfo.uiElements.length}`);
    }

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('LLM 请求超时 (300秒)')), 300000);
    });

    let lastError = null;
    const maxRetries = 2;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          log('重试', `第 ${attempt + 1} 次尝试重新生成...`);
        }

        const llmPromise = this.llm.chat('test_generation', [
          { role: 'user', content: prompt }
        ], {
          temperature: 0.1,
          maxTokens: 8000
        });

        const response = await Promise.race([llmPromise, timeoutPromise]);

        // 检查是否是 429 错误 - 余额不足，立即失败不重试
        if (response && !response.success && response.error && response.error.includes('429')) {
          log('错误', `LLM 返回 429 错误（余额不足），立即终止`);
          throw new Error(`API 余额不足，请充值后重试: ${response.error}`);
        }

        let jsonStr = response.content || response;
        if (typeof jsonStr !== 'string') {
          jsonStr = JSON.stringify(jsonStr);
        }

        jsonStr = jsonStr.replace(/```json\s*/, '').replace(/```\s*$/, '').trim();
        const startIdx = jsonStr.indexOf('[');
        const endIdx = jsonStr.lastIndexOf(']');
        if (startIdx >= 0 && endIdx >= startIdx) {
          jsonStr = jsonStr.substring(startIdx, endIdx + 1);
        }

        let testCases;
        try {
          testCases = JSON.parse(jsonStr);
          
          // 如果返回的是对象且包含 modules，直接返回
          if (testCases && typeof testCases === 'object' && testCases.modules) {
            return testCases;
          }
          
          // 如果返回的是扁平数组，包装成模块结构
          if (Array.isArray(testCases) && testCases.length > 0) {
            return {
               modules: [{
                 module: '代码逻辑测试',
                 scenarios: testCases.map(tc => {
                   tc.when = tc.when || (tc.when_steps ? tc.when_steps.join('，') : '执行操作');
                   if (tc.when_steps && Array.isArray(tc.when_steps) && !tc.when_steps.every(s => typeof s === 'string')) {
                     tc.when_steps = tc.when_steps.map(s => String(s || ''));
                   }
                   return tc;
                 })
               }]
            };
          } else {
             throw new Error('生成的有效测试数据为空');
          }
        } catch (e) {
          log('警告', `无法解析为 JSON: ${e.message}`);
          throw new Error('AI 返回的格式不正确');
        }
      } catch (err) {
        log('错误', `尝试 ${attempt + 1}/${maxRetries} 失败: ${err.message}`);
        lastError = err;
        if (!err.message.includes('解析为 JSON') && !err.message.includes('AI 返回的格式')) {
           if(attempt === maxRetries - 1) throw err;
        }
      }
    }

    if (lastError) {
      throw new Error(`生成失败: ${lastError.message}`);
    }
    
    return [];
  }

  /**
   * 生成功能测试用例
   */
  generateFunctionalTests(flow, analysis, options) {
    const tests = [];

    flow.steps.forEach((step, index) => {
      tests.push({
        id: `TC_F${tests.length + 1}`,
        type: 'functional',
        name: `${flow.name} - 功能测试 ${index + 1}`,
        description: `验证${step}`,
        given: this.inferGiven(step, flow),
        when: step,
        then: this.inferThen(step, flow),
        priority: 'High',
      });
    });

    return tests;
  }

  /**
   * 生成 UI 测试用例
   */
  generateUITests(flow, pages, options) {
    const tests = [];

    // 列表页 UI 测试
    const listPage = pages.find(p => p.type === 'list');
    if (listPage) {
      tests.push({
        id: `TC_UI${tests.length + 1}`,
        type: 'ui',
        name: `${listPage.name} - UI 布局测试`,
        description: `验证${listPage.name}页面布局符合设计规范`,
        given: `用户进入${listPage.name}`,
        when: '查看页面布局',
        then: '页面布局正确，元素对齐，间距合理',
        priority: 'Medium',
      });

      tests.push({
        id: `TC_UI${tests.length + 1}`,
        type: 'ui',
        name: `${listPage.name} - 响应式测试`,
        description: `验证${listPage.name}页面在不同屏幕尺寸下正常显示`,
        given: `用户进入${listPage.name}`,
        when: '调整浏览器窗口大小',
        then: '页面自适应，无错位、无溢出',
        priority: 'Medium',
      });
    }

    // 详情页 UI 测试
    const detailPage = pages.find(p => p.type === 'detail');
    if (detailPage) {
      tests.push({
        id: `TC_UI${tests.length + 1}`,
        type: 'ui',
        name: `${detailPage.name} - UI 布局测试`,
        description: `验证${detailPage.name}页面布局符合设计规范`,
        given: `用户进入${detailPage.name}`,
        when: '查看页面布局',
        then: '页面布局正确，信息展示完整',
        priority: 'Medium',
      });
    }

    return tests;
  }

  /**
   * 生成边界测试用例
   */
  generateBoundaryTests(flow, analysis, options) {
    const tests = [];

    // 列表页边界测试
    tests.push({
      id: `TC_B${tests.length + 1}`,
      type: 'boundary',
      name: '列表页 - 数据为空',
      description: '验证列表为空时的显示',
      given: '系统中没有数据',
      when: '进入列表页',
      then: '显示"暂无数据"提示信息',
      priority: 'Low',
    });

    tests.push({
      id: `TC_B${tests.length + 1}`,
      type: 'boundary',
      name: '列表页 - 单条数据',
      description: '验证只有一条数据时的显示',
      given: '系统中只有一条数据',
      when: '进入列表页',
      then: '正常显示该数据，布局无异常',
      priority: 'Low',
    });

    tests.push({
      id: `TC_B${tests.length + 1}`,
      type: 'boundary',
      name: '列表页 - 大量数据',
      description: '验证有大量数据时的性能和显示',
      given: '系统中有1000条数据',
      when: '进入列表页',
      then: '页面加载正常，分页功能正常',
      priority: 'Medium',
    });

    // 分页边界测试
    tests.push({
      id: `TC_B${tests.length + 1}`,
      type: 'boundary',
      name: '列表页 - 第一页',
      description: '验证在第一页时的分页状态',
      given: '用户在列表页第一页',
      when: '查看分页控件',
      then: '"上一页"按钮禁用，"下一页"按钮可用',
      priority: 'Low',
    });

    tests.push({
      id: `TC_B${tests.length + 1}`,
      type: 'boundary',
      name: '列表页 - 最后一页',
      description: '验证在最后一页时的分页状态',
      given: '用户在列表页最后一页',
      when: '查看分页控件',
      then: '"下一页"按钮禁用，"上一页"按钮可用',
      priority: 'Low',
    });

    return tests;
  }

  /**
   * 生成异常测试用例
   */
  generateExceptionTests(flow, analysis, options) {
    const tests = [];

    // 网络异常测试
    tests.push({
      id: `TC_E${tests.length + 1}`,
      type: 'exception',
      name: '网络异常处理',
      description: '验证网络异常时的错误处理',
      given: '网络连接异常',
      when: '访问页面',
      then: '显示友好的错误提示，提供重试选项',
      priority: 'High',
    });

    // 权限异常测试
    tests.push({
      id: `TC_E${tests.length + 1}`,
      type: 'exception',
      name: '无权限访问',
      description: '验证无权限时的处理',
      given: '用户没有访问权限',
      when: '访问受限页面',
      then: '跳转到权限不足提示页或登录页',
      priority: 'High',
    });

    // 数据异常测试
    tests.push({
      id: `TC_E${tests.length + 1}`,
      type: 'exception',
      name: '数据加载失败',
      description: '验证数据加载失败时的处理',
      given: '后端数据接口返回错误',
      when: '加载页面数据',
      then: '显示错误提示，不显示异常数据',
      priority: 'High',
    });

    // 输入异常测试
    tests.push({
      id: `TC_E${tests.length + 1}`,
      type: 'exception',
      name: '特殊字符输入',
      description: '验证输入特殊字符时的处理',
      given: '用户在输入框中输入特殊字符',
      when: '提交表单',
      then: '正确处理或提示输入不合法',
      priority: 'Medium',
    });

    tests.push({
      id: `TC_E${tests.length + 1}`,
      type: 'exception',
      name: '超长输入',
      description: '验证输入超长字符时的处理',
      given: '用户输入超长内容',
      when: '提交表单',
      then: '提示内容过长或自动截断',
      priority: 'Medium',
    });

    return tests;
  }

  /**
   * 生成视觉测试用例
   * @param {Object} flow - 用户流程
   * @param {Array} pages - 页面列表
   * @param {Object} options - 选项
   * @returns {Array} 视觉测试用例
   */
  generateVisualTests(flow, pages, options) {
    const tests = [];

    // 为流程中的每个页面生成视觉测试
    for (const page of pages) {
      // 基础视觉测试 - 结构对比
      tests.push({
        id: `TC_V${tests.length + 1}`,
        type: 'visual',
        subType: 'structure',
        name: `${page.name} - 结构对比测试`,
        description: `验证${page.name}页面结构是否符合设计稿`,
        given: `已准备${page.name}的设计稿`,
        when: `截取${page.name}页面截图并与设计稿对比`,
        then: '页面结构与设计稿一致，主要元素都存在',
        priority: 'High',
        metadata: {
          pageName: page.name,
          pageUrl: page.url,
          designPath: page.designPath,
          testType: 'structure',
        },
      });

      // 元素检查测试
      tests.push({
        id: `TC_V${tests.length + 1}`,
        type: 'visual',
        subType: 'element',
        name: `${page.name} - 元素检查测试`,
        description: `验证${page.name}页面的所有元素是否与设计一致`,
        given: `已准备${page.name}的设计稿和页面截图`,
        when: '使用AI检查页面中的所有元素',
        then: '所有元素都存在，位置和内容正确',
        priority: 'High',
        metadata: {
          pageName: page.name,
          pageUrl: page.url,
          designPath: page.designPath,
          testType: 'element',
        },
      });

      // 布局验证测试
      tests.push({
        id: `TC_V${tests.length + 1}`,
        type: 'visual',
        subType: 'layout',
        name: `${page.name} - 布局验证测试`,
        description: `验证${page.name}页面的布局是否符合设计规范`,
        given: `已准备${page.name}的设计稿`,
        when: '检查页面元素的位置、尺寸、对齐方式',
        then: '所有元素的位置和尺寸都在允许的误差范围内',
        priority: 'Medium',
        metadata: {
          pageName: page.name,
          pageUrl: page.url,
          designPath: page.designPath,
          testType: 'layout',
          threshold: 10, // 允许10px的偏差
        },
      });

      // 缺失元素检查测试
      tests.push({
        id: `TC_V${tests.length + 1}`,
        type: 'visual',
        subType: 'missing',
        name: `${page.name} - 缺失元素检查测试`,
        description: `检查${page.name}页面是否有缺失或额外的元素`,
        given: `已准备${page.name}的设计稿`,
        when: '对比设计稿和实际页面',
        then: '没有缺失的元素，也没有额外的未设计元素',
        priority: 'High',
        metadata: {
          pageName: page.name,
          pageUrl: page.url,
          designPath: page.designPath,
          testType: 'missing',
        },
      });
    }

    // 综合视觉测试（覆盖整个流程）
    if (pages.length > 0) {
      tests.push({
        id: `TC_V${tests.length + 1}`,
        type: 'visual',
        subType: 'comprehensive',
        name: `${flow.name} - 综合视觉测试`,
        description: `对${flow.name}涉及的所有页面进行全面的视觉测试`,
        given: '已准备所有页面的设计稿',
        when: '对每个页面执行结构、元素、布局、缺失检查',
        then: '所有页面都通过视觉测试，符合设计规范',
        priority: 'High',
        metadata: {
          flowName: flow.name,
          pages: pages.map(p => ({
            name: p.name,
            url: p.url,
            designPath: p.designPath,
          })),
          testType: 'comprehensive',
        },
      });
    }

    return tests;
  }

  /**
   * 格式化测试用例
   * @param {Array} testCases - 测试用例
   * @returns {Object} 格式化的测试用例
   */
  formatTestCases(testCases) {
    // 生成唯一测试用例 ID：页面名缩写 + 时间戳 + 编号
    const generateUniqueId = (tc, index) => {
      if (tc.id && !tc.id.startsWith('TC')) {
        // 如果已有自定义 ID（不是 TC 开头），直接使用
        return String(tc.id);
      }

      // 获取页面名称
      const pageName = tc.page || tc.pageName || 'Default';
      // 生成页面名缩写（取每个词的首字母，转大写）
      const pageAbbr = pageName
        .replace(/[^\u4e00-\u9fa5a-zA-Z]/g, '') // 只保留中文和字母
        .split('')
        .filter(char => /[\u4e00-\u9fa5a-zA-Z]/.test(char))
        .slice(0, 4) // 最多取 4 个字符
        .join('')
        .toUpperCase();

      // 时间戳（后 6 位）
      const timestamp = Date.now().toString().slice(-6);
      // 编号（3 位，补零）
      const number = String(index + 1).padStart(3, '0');

      return `${pageAbbr}${timestamp}${number}`;
    };

    // 按类型分组
    const byType = {
      functional: testCases.filter(tc => tc.type === 'functional'),
      ui: testCases.filter(tc => tc.type === 'ui'),
      boundary: testCases.filter(tc => tc.type === 'boundary'),
      exception: testCases.filter(tc => tc.type === 'exception'),
      visual: testCases.filter(tc => tc.type === 'visual'),
    };

    // 增强 BDD 格式生成 - 确保 Given/When/Then 完整，并包含页面信息和详细步骤
    const enhancedScenarios = testCases.map((tc, index) => {
      // 基础场景对象 - 确保所有字段都是字符串
      const scenario = {
        id: generateUniqueId(tc, index),
        name: String(tc.name || `测试用例 ${index + 1}`),
        description: String(tc.description || ''),
        priority: String(tc.priority || 'Medium'),
        type: String(tc.type || 'functional'),
      };

      // 添加页面信息（如果有）
      if (tc.page) {
        scenario.page = tc.page;
      }

      // 处理 Given（前置条件）
      const givenText = tc.given || tc.precondition || '';
      if (givenText && typeof givenText === 'string' && givenText.trim()) {
        // Given 步骤是前置条件的描述，不应该解析为具体操作
        // 直接创建一个 generic 类型的 action 用于描述
        scenario.given = {
          description: givenText.trim(),
          action: givenText.trim(),
          text: givenText.trim(),
          actions: [{
            type: 'generic',
            description: givenText.trim(),
          }],
        };
      } else {
        // 根据测试用例名称推断合理的 Given
        const inferred = this.inferGivenFromTestCase(tc);
        scenario.given = {
          ...inferred,
          text: inferred.text || inferred.description || inferred.action || '用户在系统中',
          actions: [{
            type: 'generic',
            description: inferred.text || inferred.description || inferred.action || '用户在系统中',
          }],
        };
      }

      // 确保 scenario.given 总是有内容的
      if (!scenario.given.text || scenario.given.text === '无') {
        scenario.given.text = scenario.given.description || scenario.given.action || '用户在系统中';
      }

      // 添加调试日志
      console.log(`[formatTestCases] TC${index + 1} given:`, {
        original: tc.given,
        text: scenario.given.text,
        description: scenario.given.description
      });

      // 处理 When（测试步骤）- 支持分步骤数组
      const whenText = tc.when || tc.steps || tc.action || '';
      const whenSteps = tc.when_steps || tc.stepList || [];

      if (whenSteps && Array.isArray(whenSteps) && whenSteps.length > 0) {
        // 清理步骤编号（如 "1. " 或 "1、"），避免编号被误解析为输入内容
        const cleanedWhenSteps = whenSteps.map(step => {
          const stepText = typeof step === 'string' ? step : (step.description || step.text || '');
          return stepText.replace(/^\d+[\.\、]\s*/, '').trim();
        }).filter(step => step.length > 0);

        // 如果有详细的步骤数组，使用它
        scenario.when = {
          description: whenText.trim() || '执行测试步骤',
          action: whenText.trim() || '执行操作',
          text: cleanedWhenSteps.join('\n'),
          steps: cleanedWhenSteps,
          actions: this.extractActionsFromSteps(cleanedWhenSteps),
        };
        // 重要：同时保存 when_steps 到顶层，供执行逻辑使用
        scenario.when_steps = cleanedWhenSteps;
      } else if (whenText && typeof whenText === 'string' && whenText.trim()) {
        scenario.when = {
          description: whenText.trim(),
          action: whenText.trim(),
          text: whenText.trim(),
          actions: this.extractActionsFromText(whenText),
        };
        // 如果 when 文本包含多个操作，尝试拆分成 when_steps
        const splitSteps = this.splitWhenText(whenText);
        if (splitSteps.length > 1) {
          scenario.when_steps = splitSteps;
        }
      } else {
        // 根据测试用例名称推断合理的 When
        const inferred = this.inferWhenFromTestCase(tc);
        scenario.when = {
          ...inferred,
          text: inferred.text || inferred.description || inferred.action || '执行操作',
        };
      }

      // 确保 scenario.when 总是有内容的
      if (!scenario.when.text || scenario.when.text === '无') {
        scenario.when.text = scenario.when.description || scenario.when.action || '执行操作';
      }

      // 添加调试日志
      console.log(`[formatTestCases] TC${index + 1} when:`, {
        original: tc.when,
        text: scenario.when.text,
        description: scenario.when.description
      });

      // 处理 Then（预期结果）
      const thenText = tc.then || tc.expected || tc.expectedResult || tc.expectation || '';
      if (thenText && typeof thenText === 'string' && thenText.trim()) {
        scenario.then = {
          description: thenText.trim(),
          action: thenText.trim(),
          text: thenText.trim(),
          verifications: this.extractVerificationsFromText(thenText),
        };
      } else {
        // 根据测试用例名称推断合理的 Then
        const inferred = this.inferThenFromTestCase(tc);
        scenario.then = {
          ...inferred,
          text: inferred.text || inferred.description || inferred.action || '验证结果',
        };
      }

      // 确保 scenario.then 总是有内容的
      if (!scenario.then.text || scenario.then.text === '无') {
        scenario.then.text = scenario.then.description || scenario.then.action || '验证结果';
      }

      // 添加调试日志
      console.log(`[formatTestCases] TC${index + 1} then:`, {
        original: tc.then,
        text: scenario.then.text,
        description: scenario.then.description
      });

      return scenario;
    });

    // 生成 BDD 格式
    const bddFormat = {
      modules: [
        {
          module: 'AI 生成的测试',
          priority: 'High',
          scenarios: enhancedScenarios,
        },
      ],
    };

    return {
      byType,
      bddFormat,
      summary: {
        total: testCases.length,
        functional: byType.functional.length,
        ui: byType.ui.length,
        boundary: byType.boundary.length,
        exception: byType.exception.length,
        visual: byType.visual.length,
      },
    };
  }

  /**
   * 从文本中提取操作列表
   * @param {string} text - 步骤文本
   * @returns {Array} 操作列表
   */
  extractActionsFromText(text) {
    if (!text || typeof text !== 'string') {
      return [];
    }

    const actions = [];
    const trimmedText = text.trim();

    // 导航操作
    if (trimmedText.match(/打开|进入|访问|导航|跳转/)) {
      actions.push({
        type: 'navigate',
        description: trimmedText,
      });
    }

    // 点击操作
    if (trimmedText.match(/点击|选择|按下/)) {
      actions.push({
        type: 'click',
        description: trimmedText,
      });
    }

    // 输入操作 - 提取输入值
    // 修复：只有当文本明确是输入操作时才匹配，避免将 "用户在密码输入页" 等描述误识别为输入操作
    if (trimmedText.match(/^(?:.*?)(?:输入|填写|录入|填入)(?:.+)?$/) && !trimmedText.match(/用户在.*页面|用户已.*页|进入.*页/)) {
      // 尝试从文本中提取输入值，支持多种格式：
      // - "输入ID 'amyTest'" -> value: 'amyTest'
      // - "输入ID 'amyTest'" -> value: 'amyTest'
      // - "输入密码 A!123456" -> value: 'A!123456'
      // - "输入用户名:admin" -> value: 'admin'
      // - "ID 输入框填入 amyTest" -> value: 'amyTest'
      // - "输入框填入amyTest" -> value: 'amyTest'
      let extractedValue = null;

      // 格式1: 输入XXX 'value' 或 输入XXX "value"
      let quoteMatch = trimmedText.match(/['"]([^'"']+)['"]/);
      if (!quoteMatch) {
        // 格式2: XXX输入框填入/输入/填写 'value' 或 "value"
        quoteMatch = trimmedText.match(/(?:输入框|文本框|框)?\s*(?:填入|输入|填写)\s*['"]?([^'"'\s，。]+)['"]?/);
      }
      if (quoteMatch) {
        extractedValue = quoteMatch[1];
      }
      // 格式3: 输入XXX:value 或 输入XXX：value
      else {
        const colonMatch = trimmedText.match(/(?:输入|填入|填写)[^:：:]*[:：]\s*([^\s，。]+)/);
        if (colonMatch) {
          extractedValue = colonMatch[1];
        }
      }

      // 只有成功提取到输入值时才创建 input action，否则跳过
      if (extractedValue) {
        actions.push({
          type: 'input',
          description: trimmedText,
          value: extractedValue,
        });
      } else {
        // 无法提取输入值，使用 generic 类型
        actions.push({
          type: 'generic',
          description: trimmedText,
        });
      }
    }

    // 等待操作
    if (trimmedText.match(/等待|稍等|等待加载/)) {
      actions.push({
        type: 'wait',
        description: trimmedText,
      });
    }

    // 如果没有匹配到任何操作，添加通用操作
    if (actions.length === 0) {
      actions.push({
        type: 'generic',
        description: trimmedText,
      });
    }

    return actions;
  }

  /**
   * 将 When 文本拆分成多个步骤
   * @param {string} text - When 步骤文本
   * @returns {Array} 步骤数组
   */
  splitWhenText(text) {
    if (!text || typeof text !== 'string') {
      return [];
    }

    const steps = [];
    const trimmedText = text.trim();

    // 检查是否有分隔符（逗号、顿号、分号、"并"等）
    const hasSeparator = /[，,、；;并]/.test(trimmedText);

    if (hasSeparator) {
      // 按分隔符拆分
      const parts = trimmedText.split(/[，,、；;并]/).filter(p => p.trim());

      for (const part of parts) {
        const partTrimmed = part.trim();
        // 如果是短操作，直接添加
        if (partTrimmed.length < 50) {
          steps.push(partTrimmed);
        } else {
          // 如果是长文本，尝试进一步拆分
          steps.push(...this.splitLongWhenText(partTrimmed));
        }
      }
    } else {
      // 没有分隔符，返回单一步骤
      steps.push(trimmedText);
    }

    return steps.length > 0 ? steps : [trimmedText];
  }

  /**
   * 拆分长 When 文本
   * @param {string} text - 长文本
   * @returns {Array} 步骤数组
   */
  splitLongWhenText(text) {
    const steps = [];

    // 尝试按动作词拆分
    const actionPatterns = [
      /(?:.*?)(?:输入|填写|填入|填)([^，,。]+?)(?=(?:输入|填写|填入|填|点击|选择|按下|$))/g,
      /(?:.*?)(?:点击|选择|按下)([^，,。]+?)(?=(?:输入|填写|填入|填|点击|选择|按下|$))/g,
    ];

    for (const pattern of actionPatterns) {
      const matches = text.matchAll(pattern);
      const found = [];
      for (const match of matches) {
        if (match[0].trim()) {
          found.push(match[0].trim());
        }
      }
      if (found.length > 1) {
        return found;
      }
    }

    // 如果无法拆分，返回原文本
    return [text];
  }

  /**
   * 从步骤数组中提取操作列表
   * @param {Array} steps - 步骤数组
   * @returns {Array} 操作列表
   */
  extractActionsFromSteps(steps) {
    if (!steps || !Array.isArray(steps)) {
      return [];
    }

    const actions = [];

    steps.forEach((step, index) => {
      const stepText = typeof step === 'string' ? step : (step.description || step.text || '');
      if (!stepText.trim()) return;

      // 提取步骤编号（如 "1. " 或 "1、"）
      const cleanStep = stepText.replace(/^\d+[\.\、]\s*/, '').trim();

      // 导航操作
      if (cleanStep.match(/打开|进入|访问|导航|跳转|页面加载/)) {
        actions.push({
          type: 'navigate',
          step: index + 1,
          description: cleanStep,
        });
      }
      // 点击操作
      else if (cleanStep.match(/点击|选择|按下|按钮/)) {
        // TODO: 修复点击操作的 target 提取
        // 从描述中提取目标，例如 "点击下一步按钮" → target="下一步按钮"
        let extractedTarget = null;
        const clickMatch = cleanStep.match(/(?:点击|选择|按下)\s*(.+?)(?:按钮)?$/);
        if (clickMatch) {
          extractedTarget = clickMatch[1].trim();
        }
        actions.push({
          type: 'click',
          step: index + 1,
          target: extractedTarget,  // 添加提取的目标
          description: cleanStep,
        });
        console.log(`[extractActionsFromSteps] 点击操作 ${index + 1}: "${cleanStep}"`, {
          extractedTarget,
          originalText: stepText
        });
      }
      // 查看操作 - 改为 check 类型（不执行输入）
      else if (cleanStep.match(/查看|检查/) && !cleanStep.match(/输入|填写|填入|填/)) {
        actions.push({
          type: 'check',
          step: index + 1,
          description: cleanStep,
        });
        console.log(`[extractActionsFromSteps] 查看操作 ${index + 1}: "${cleanStep}" -> 改为 check 类型`);
      }
      // 输入操作 - 提取输入值
      else if (cleanStep.match(/输入|填写|录入|输入框|填入|填/)) {
        // 检查是否是空值测试（输入 '' 或 ""）
        const emptyTestMatch = cleanStep.match(/输入[^''"]*['"]{2}['"]{2}|输入框为空|不输入.*内容|留空|为空时/);

        if (emptyTestMatch) {
          // 这是空值测试，应该不输入任何内容
          let extractedTarget = null;
          // 尝试提取目标
          const targetMatch = cleanStep.match(/在(.+?)(?:输入框|输入|填入|填写|填)/);
          if (targetMatch) {
            // 清理 target：移除 "输入框" 相关字符
            let target = targetMatch[1].trim();
            target = target.replace(/輸入框|输入框/g, '');
            target = target.replace(/框[輸输]/g, '');
            target = target.replace(/框/g, '');
            target = target.replace(/^[輸输]+|[輸输]+$/g, '');
            extractedTarget = target.trim();
          }

          actions.push({
            type: 'empty',  // 特殊类型：空值测试
            step: index + 1,
            target: extractedTarget,
            description: cleanStep,
            value: null,  // 空值测试不输入任何内容
          });
          console.log(`[extractActionsFromSteps] 空值测试 ${index + 1}: "${cleanStep}"`, {
            extractedTarget,
            isEmptyTest: true
          });
        } else {
          // 正常输入操作 - 提取输入值
          let extractedValue = null;
          let extractedTarget = null;

          // 格式1: 输入XXX 'value' 或 输入XXX "value"
          const quoteMatch = cleanStep.match(/输入[^''"]*['"]([^'"']+)['"]/);
          if (quoteMatch) {
            extractedValue = quoteMatch[1];
          }
          // 格式2: 输入XXX:value 或 输入XXX：value
          else {
            const colonMatch = cleanStep.match(/输入[^:：:]*[:：]\s*([^\s，。]+)/);
            if (colonMatch) {
              extractedValue = colonMatch[1];
            }
            // 格式3: "在XXX输入 YYY" 或 "在XXX填入 YYY" (空格分隔)
            else {
              const spaceMatch = cleanStep.match(/在(.+?)(?:输入框|输入|填入|填写|填)\s+([^\s，。]+)/);
              if (spaceMatch) {
                // 清理 target
                let target = spaceMatch[1].trim();
                target = target.replace(/輸入框|输入框/g, '');
                target = target.replace(/框[輸输]/g, '');
                target = target.replace(/框/g, '');
                target = target.replace(/^[輸输]+|[輸输]+$/g, '');
                extractedTarget = target.trim();
                extractedValue = spaceMatch[2].trim();
              }
              // 格式4: "XXX填入YYY" (目标在前，动词在后)
              else {
                const fillMatch = cleanStep.match(/(.+?)(?:输入框|输入)?(?:填入|填写|填)\s+([^\s，。]+)/);
                if (fillMatch) {
                  // 清理 target
                  let target = fillMatch[1].trim();
                  target = target.replace(/輸入框|输入框/g, '');
                  target = target.replace(/框[輸输]/g, '');
                  target = target.replace(/框/g, '');
                  target = target.replace(/^[輸输]+|[輸输]+$/g, '');
                  extractedTarget = target.trim();
                  extractedValue = fillMatch[2].trim();
                }
              }
            }
          }

          // 调试日志
          console.log(`[extractActionsFromSteps] 步骤 ${index + 1}: "${cleanStep}"`, {
            extractedTarget,
            extractedValue,
            originalText: stepText
          });

          actions.push({
            type: 'input',
            step: index + 1,
            target: extractedTarget,
            description: cleanStep,
            value: extractedValue,  // 添加提取的输入值
          });
        }
      }
      // 检查操作
      else if (cleanStep.match(/检查|验证|确认|观察/)) {
        actions.push({
          type: 'check',
          step: index + 1,
          description: cleanStep,
        });
      }
      // 等待操作
      else if (cleanStep.match(/等待|稍等|等待加载/)) {
        actions.push({
          type: 'wait',
          step: index + 1,
          description: cleanStep,
        });
      }
      // 通用操作
      else {
        actions.push({
          type: 'generic',
          step: index + 1,
          description: cleanStep,
        });
      }
    });

    return actions;
  }

  /**
   * 从文本中提取验证列表
   * @param {string} text - 预期结果文本
   * @returns {Array} 验证列表
   */
  extractVerificationsFromText(text) {
    if (!text || typeof text !== 'string') {
      return [];
    }

    const verifications = [];
    const trimmedText = text.trim();

    // ========== 通用复合验证解析 ==========
    // 支持的颜色关键词（简繁体）
    const colorPatterns = [
      '红色', '紅色', '红', '紅', 'red',
      '蓝色', '藍色', '蓝', '藍', 'blue',
      '绿色', '綠色', '绿', '綠', 'green',
      '黄色', '黃色', '黄', '黃', 'yellow',
      '灰色', 'gray', 'grey',
      '黑色', 'black',
      '白色', 'white',
      '橙色', 'orange',
      '紫色', 'purple'
    ];

    // 颜色映射表
    const colorMap = {
      '红色': 'red', '紅色': 'red', '红': 'red', '紅': 'red',
      '深红色': 'red', '深红': 'red',
      '蓝色': 'blue', '藍色': 'blue', '蓝': 'blue', '藍': 'blue',
      '深蓝色': 'blue', '深蓝': 'blue',
      '绿色': 'green', '綠色': 'green', '绿': 'green', '綠': 'green',
      '深绿色': 'green', '深绿': 'green',
      '黄色': 'yellow', '黃色': 'yellow', '黄': 'yellow', '黃': 'yellow',
      '灰色': 'gray', '灰': 'gray', 'grey': 'gray',
      '深灰色': 'gray', '深灰': 'gray',
      '黑色': 'black',
      '白色': 'white',
      '橙色': 'orange',
      '紫色': 'purple'
    };

    // 检查是否包含颜色关键词
    const hasColorKeyword = colorPatterns.some(pattern => trimmedText.includes(pattern));

    // 检查是否包含内容/文本关键词
    const hasContentKeyword = trimmedText.includes('内容為') || trimmedText.includes('内容为') ||
                              trimmedText.includes('文字為') || trimmedText.includes('文字为') ||
                              trimmedText.includes('顯示') || trimmedText.includes('显示') ||
                              trimmedText.includes('包含') || trimmedText.includes('文本');

    // 检查是否包含样式关键词
    const hasStyleKeyword = trimmedText.includes('背景') || trimmedText.includes('邊框') ||
                             trimmedText.includes('边框') || trimmedText.includes('外框') ||
                             trimmedText.includes('颜色') || trimmedText.includes('顏色');

    // 检查目标元素类型
    let elementType = 'text';  // 默认为文本
    if (trimmedText.includes('按钮') || trimmedText.includes('按鈕') || trimmedText.includes('button')) {
      elementType = 'button';
    } else if (trimmedText.includes('输入框') || trimmedText.includes('輸入框') || trimmedText.includes('input')) {
      elementType = 'input';
    } else if (trimmedText.includes('链接') || trimmedText.includes('連結') || trimmedText.includes('link')) {
      elementType = 'link';
    }

    // 如果包含颜色或样式关键词，生成复合验证
    if (hasColorKeyword || hasStyleKeyword) {
      const compositeVerification = {
        type: 'assertion',
        description: trimmedText,
        elementType: elementType,
        // 提取的验证属性
        targetText: null,
        textColor: null,
        backgroundColor: null,
        borderColor: null,
        // 验证标志
        checks: []
      };

      // 1. 提取目标文本（「...」或 "..." 中的内容）
      const quotedTextMatch = trimmedText.match(/「([^」]+)」|"([^"]+)"|'([^']+)'/);
      if (quotedTextMatch) {
        compositeVerification.targetText = quotedTextMatch[1] || quotedTextMatch[2] || quotedTextMatch[3];
      }

      // 2. 提取文字颜色
      // 匹配模式：文字颜色为XX、文字顏色為XX、字体颜色XX、顯示XX色文字
      const textColorPatterns = [
        /文字颜色[为是]?「?([^」\"'，。]+)?\"?/i,
        /文字顏色[为是]?「?([^」\"'，。]+)?\"?/i,
        /字体颜色[为是]?「?([^」\"'，。]+)?\"?/i,
        /顯示.*?(红色|蓝色|绿色|黄色|灰色|黑色|白色|橙色|紫色|紅色|藍色|綠色|黃色)/i
      ];

      for (const pattern of textColorPatterns) {
        const match = trimmedText.match(pattern);
        if (match) {
          const colorText = match[1] || (match[0]?.match(/(红色|蓝色|绿色|黄色|灰色|黑色|白色|橙色|紫色|紅色|藍色|綠色|黃色)/)?.[0]);
          if (colorText && colorMap[colorText]) {
            compositeVerification.textColor = colorMap[colorText];
            compositeVerification.checks.push('textColor');
            break;
          }
        }
      }

      // 如果没有明确的文字颜色模式，但有"颜色"关键词且在"且"后面
      if (!compositeVerification.textColor && trimmedText.includes('颜色')) {
        // 尝试从描述中提取颜色
        const parts = trimmedText.split(/[且和,，]/);
        for (const part of parts) {
          if (part.includes('颜色') || part.includes('顏色')) {
            for (const [cn, en] of Object.entries(colorMap)) {
              if (part.includes(cn)) {
                // 判断是文字颜色还是背景颜色
                if (part.includes('背景')) {
                  compositeVerification.backgroundColor = en;
                  compositeVerification.checks.push('backgroundColor');
                } else if (part.includes('邊框') || part.includes('边框')) {
                  compositeVerification.borderColor = en;
                  compositeVerification.checks.push('borderColor');
                } else {
                  // 默认为文字颜色
                  compositeVerification.textColor = en;
                  compositeVerification.checks.push('textColor');
                }
                break;
              }
            }
          }
        }
      }

      // 3. 提取背景颜色
      const bgColorPatterns = [
        /背景颜色[为是]?「?([^」\"'，。]+)?\"?/i,
        /背景顏色[为是]?「?([^」\"'，。]+)?\"?/i,
        /背景[为是]?「?([^」\"'，。]+)?\"?/i
      ];

      for (const pattern of bgColorPatterns) {
        const match = trimmedText.match(pattern);
        if (match) {
          const colorText = match[1] || (match[0]?.match(/(红色|蓝色|绿色|黄色|灰色|黑色|白色|橙色|紫色|紅色|藍色|綠色|黃色)/)?.[0]);
          if (colorText && colorMap[colorText]) {
            compositeVerification.backgroundColor = colorMap[colorText];
            if (!compositeVerification.checks.includes('backgroundColor')) {
              compositeVerification.checks.push('backgroundColor');
            }
            break;
          }
        }
      }

      // 4. 提取边框颜色
      const borderColorPatterns = [
        /边框颜色[为是]?「?([^」\"'，。]+)?\"?/i,
        /邊框顏色[为是]?「?([^」\"'，。]+)?\"?/i,
        /外框颜色[为是]?「?([^」\"'，。]+)?\"?/i,
        /邊框[为是]?「?([^」\"'，。]+)?\"?/i,
        /边框[为是]?「?([^」\"'，。]+)?\"?/i
      ];

      for (const pattern of borderColorPatterns) {
        const match = trimmedText.match(pattern);
        if (match) {
          const colorText = match[1] || (match[0]?.match(/(红色|蓝色|绿色|黄色|灰色|黑色|白色|橙色|紫色|紅色|藍色|綠色|黃色)/)?.[0]);
          if (colorText && colorMap[colorText]) {
            compositeVerification.borderColor = colorMap[colorText];
            if (!compositeVerification.checks.includes('borderColor')) {
              compositeVerification.checks.push('borderColor');
            }
            break;
          }
        }
      }

      // 如果有任何检查项，返回复合验证
      if (compositeVerification.checks.length > 0 || compositeVerification.targetText) {
        // 如果有目标文本但没有检查项，添加基本文本验证
        if (compositeVerification.targetText && compositeVerification.checks.length === 0) {
          compositeVerification.checks.push('text');
        }
        verifications.push(compositeVerification);
        return verifications;
      }
    }

    // ========== 原有的简单验证逻辑 ==========

    // 检查可见性验证
    if (trimmedText.match(/显示|可见|出现|隐藏/)) {
      verifications.push({
        type: 'visible',
        description: trimmedText,
        expected: !trimmedText.match(/隐藏|不可见/),
      });
    }

    // 检查文本验证
    if (trimmedText.match(/包含|文本|内容|标题/)) {
      verifications.push({
        type: 'text',
        description: trimmedText,
      });
    }

    // 检查数量验证
    const countMatch = trimmedText.match(/(\d+)条|(\d+)个|(\d+)项/);
    if (countMatch) {
      verifications.push({
        type: 'count',
        description: trimmedText,
        expected: parseInt(countMatch[1] || countMatch[2] || countMatch[3], 10),
      });
    }

    // 检查页面跳转验证
    if (trimmedText.match(/跳转|页面|路由/)) {
      verifications.push({
        type: 'navigation',
        description: trimmedText,
      });
    }

    // 如果没有匹配到任何验证，添加通用验证
    if (verifications.length === 0) {
      verifications.push({
        type: 'assertion',
        description: trimmedText,
      });
    }

    return verifications;
  }

  /**
   * 从测试用例推断 Given
   * @param {Object} tc - 测试用例
   * @returns {Object} Given 对象
   */
  inferGivenFromTestCase(tc) {
    const name = tc.name || '';
    const type = tc.type || 'functional';

    // 根据测试用例名称和类型推断
    if (name.includes('登录') || type === 'authentication') {
      return {
        description: '用户在登录页面',
        action: '打开登录页面',
        actions: [{ type: 'navigate', description: '打开登录页面' }],
      };
    }

    if (name.includes('列表') || name.includes('查看')) {
      return {
        description: '用户已登录系统',
        action: '用户已成功登录',
        actions: [{ type: 'navigate', description: '进入系统' }],
      };
    }

    if (name.includes('详情') || name.includes('信息')) {
      return {
        description: '用户在相关页面',
        action: '用户在列表页',
        actions: [{ type: 'navigate', description: '进入相关页面' }],
      };
    }

    // 默认 Given
    return {
      description: '用户在系统中',
      action: '用户进入应用',
      actions: [{ type: 'navigate', description: '进入应用' }],
    };
  }

  /**
   * 从测试用例推断 When
   * @param {Object} tc - 测试用例
   * @returns {Object} When 对象
   */
  inferWhenFromTestCase(tc) {
    const name = tc.name || '';

    // 根据测试用例名称推断操作
    if (name.includes('登录')) {
      return {
        description: '输入用户名和密码，点击登录按钮',
        action: '执行登录操作',
        actions: [
          { type: 'input', description: '输入用户名' },
          { type: 'input', description: '输入密码' },
          { type: 'click', description: '点击登录按钮' },
        ],
      };
    }

    if (name.includes('列表') || name.includes('查看')) {
      return {
        description: '查看页面内容，检查列表数据',
        action: '查看列表页',
        actions: [
          { type: 'wait', description: '等待页面加载' },
          { type: 'generic', description: '检查列表数据' },
        ],
      };
    }

    if (name.includes('点击') || name.includes('选择')) {
      return {
        description: `执行${name.replace(/测试|用例/g, '')}操作`,
        action: '点击相关按钮或链接',
        actions: [{ type: 'click', description: '点击目标元素' }],
      };
    }

    if (name.includes('输入') || name.includes('填写')) {
      return {
        description: '在输入框中填写信息',
        action: '填写表单',
        actions: [{ type: 'input', description: '输入相关信息' }],
      };
    }

    // 默认 When
    return {
      description: `执行${name}操作`,
      action: '执行操作',
      actions: [{ type: 'generic', description: '执行操作' }],
    };
  }

  /**
   * 从测试用例推断 Then
   * @param {Object} tc - 测试用例
   * @returns {Object} Then 对象
   */
  inferThenFromTestCase(tc) {
    const name = tc.name || '';
    const type = tc.type || 'functional';

    // 根据测试用例名称推断预期结果
    if (name.includes('登录')) {
      return {
        description: '登录成功，跳转到首页',
        action: '验证登录成功',
        verifications: [
          { type: 'navigation', description: '跳转到首页' },
          { type: 'visible', description: '首页内容正常显示', expected: true },
        ],
      };
    }

    if (name.includes('列表') || name.includes('查看')) {
      return {
        description: '列表数据正确显示，分页功能正常',
        action: '验证列表显示',
        verifications: [
          { type: 'visible', description: '列表正常显示', expected: true },
          { type: 'count', description: '列表数据数量正确' },
        ],
      };
    }

    if (name.includes('详情') || name.includes('信息')) {
      return {
        description: '详情页正确打开，所有信息完整显示',
        action: '验证详情显示',
        verifications: [
          { type: 'navigation', description: '页面跳转正确' },
          { type: 'visible', description: '详情内容正常显示', expected: true },
        ],
      };
    }

    if (name.includes('添加') || name.includes('创建')) {
      return {
        description: '添加成功，新数据出现在列表中',
        action: '验证添加成功',
        verifications: [
          { type: 'visible', description: '成功提示显示', expected: true },
          { type: 'count', description: '数据数量增加' },
        ],
      };
    }

    if (name.includes('删除') || name.includes('移除')) {
      return {
        description: '删除成功，数据从列表中移除',
        action: '验证删除成功',
        verifications: [
          { type: 'visible', description: '成功提示显示', expected: true },
          { type: 'visible', description: '目标数据已消失', expected: false },
        ],
      };
    }

    if (type === 'boundary') {
      return {
        description: '边界条件下系统行为符合预期',
        action: '验证边界处理',
        verifications: [
          { type: 'assertion', description: '系统正确处理边界值' },
        ],
      };
    }

    if (type === 'exception') {
      return {
        description: '异常情况下系统给出正确的错误提示',
        action: '验证异常处理',
        verifications: [
          { type: 'visible', description: '错误提示正确显示', expected: true },
        ],
      };
    }

    // 默认 Then
    return {
      description: `${name}操作成功完成`,
      action: '验证操作成功',
      verifications: [
        { type: 'assertion', description: '操作成功执行' },
        { type: 'visible', description: '结果显示正确', expected: true },
      ],
    };
  }

  /**
   * 分析需求文档
   * @param {string} content - 需求内容
   * @param {Function} logCallback - 日志回调函数
   */
  async analyzeRequirementDoc(content, logCallback = null) {
    if (!content || typeof content !== 'string') {
      return {
        features: [],
        userGoals: [],
        businessRules: [],
        constraints: [],
      };
    }

    // 使用增强的需求分析器
    try {
      const analysis = await this.requirementAnalyzer.analyze(content, {
        log: (type, msg) => {
          if (logCallback) logCallback(type, msg);
        }
      });

      // 将增强分析的结果转换为原有格式
      const result = {
        features: [...analysis.features],
        userGoals: [],
        businessRules: [],
        constraints: [],

        // 新增：增强的分析结果
        _enhanced: {
          analysisType: analysis.analysisType,
          confidence: analysis.confidence,
          pages: analysis.pages,
          uiElements: analysis.uiElements,
          dataFields: analysis.dataFields,
          operations: analysis.operations,
          validations: analysis.validations,
          apis: analysis.apis
        }
      };

      // 从 UI 元素推断功能点
      if (analysis.uiElements.inputs?.length > 0) {
        result.features.push(`验证输入框：${analysis.uiElements.inputs.map(i => i.name).join('、')}`);
      }
      if (analysis.uiElements.buttons?.length > 0) {
        result.features.push(`验证按钮：${analysis.uiElements.buttons.map(b => b.name).join('、')}`);
      }
      if (analysis.uiElements.links?.length > 0) {
        result.features.push(`验证链接：${analysis.uiElements.links.map(l => l.name).join('、')}`);
      }
      if (analysis.uiElements.text?.length > 0) {
        result.features.push(`验证文本内容：${analysis.uiElements.text.map(t => t.expected).join('、')}`);
      }

      // 从数据字段推断业务规则
      if (analysis.dataFields?.length > 0) {
        for (const field of analysis.dataFields) {
          if (field.rule) {
            result.businessRules.push(`${field.name}字段${field.rule}${field.value ? `=${field.value}` : ''}`);
          }
        }
      }

      // 从操作推断用户目标
      if (analysis.operations?.length > 0) {
        result.userGoals.push(`完成${analysis.operations.length}步操作流程`);
      }

      if (logCallback) {
        logCallback('分析完成', `类型: ${analysis.analysisType}, 置信度: ${analysis.confidence}%`);
        logCallback('提取结果', `UI元素: ${this.countUIElements(analysis.uiElements)}, 数据字段: ${analysis.dataFields.length}, 操作: ${analysis.operations.length}`);
      }

      return result;
    } catch (error) {
      if (logCallback) {
        logCallback('分析失败', `使用备用方案: ${error.message}`);
      }

      // 回退方案：简单的文本分析
      return this.fallbackAnalysis(content, logCallback);
    }
  }

  /**
   * 回退的简单文本分析（当增强分析器失败时）
   */
  fallbackAnalysis(content, logCallback) {
    const lines = content.split('\n');
    const features = [];
    const userGoals = [];

    // 扩展的关键词列表
    const actionKeywords = [
      '可以', '查看', '点击', '进入', '支持', '实现', '提供',
      '能够', '需要', '应该', '必须', '包含', '具有',
      '登录', '注册', '添加', '删除', '修改', '编辑',
      '搜索', '查询', '显示', '列表', '详情', '页面',
      '按钮', '表单', '上传', '下载', '导出', '导入',
      '发送', '接收', '保存', '提交', '取消', '确认'
    ];

    // 提取所有行作为潜在功能
    for (const line of lines) {
      const trimmed = line.trim();

      // 跳过空行和标题行
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('---')) {
        continue;
      }

      // 检查是否包含任何动作关键词
      const hasKeyword = actionKeywords.some(keyword => trimmed.includes(keyword));

      if (hasKeyword || trimmed.length > 5) {
        features.push(trimmed);
      }

      // 提取用户目标
      if (trimmed.includes('用户') || trimmed.includes('使用者')) {
        userGoals.push(trimmed);
      }
    }

    // 如果仍然没有提取到功能，将整个内容分割成句子
    if (features.length === 0) {
      const cleanedContent = content
        .replace(/^#+\s*.+$/gm, '') // 移除标题
        .replace(/^\s*[-=]{3,}\s*$/gm, '') // 移除分隔线
        .trim();

      if (cleanedContent) {
        // 按句子分割（中文和英文标点）
        const sentences = cleanedContent
          .split(/[。！？\.!?;；\n]/)
          .map(s => s.trim())
          .filter(s => s.length > 3);

        features.push(...sentences);
      }
    }

    // 确保至少有一些功能
    if (features.length === 0 && content.length > 0) {
      features.push(content.substring(0, 100) + (content.length > 100 ? '...' : ''));
    }

    if (logCallback) {
      logCallback('文本分析', `文本分析完成，识别到 ${features.length} 个功能点`);
    }

    return {
      features,
      userGoals,
      businessRules: [],
      constraints: [],
    };
  }

  /**
   * 统计 UI 元素数量
   */
  countUIElements(uiElements) {
    if (!uiElements) return 0;
    return (uiElements.inputs?.length || 0) +
           (uiElements.buttons?.length || 0) +
           (uiElements.links?.length || 0) +
           (uiElements.text?.length || 0) +
           (uiElements.others?.length || 0);
  }

  /**
   * 分析 Figma 设计
   */
  async analyzeFigmaDesign(content) {
    // TODO: 实现 Figma 分析
    return {
      features: ['从 Figma 提取的功能'],
      userGoals: [],
      businessRules: [],
      constraints: [],
    };
  }

  /**
   * 分析图片设计
   */
  async analyzeImageDesign(imagePath) {
    // TODO: 实现图片分析
    return {
      features: ['从图片提取的功能'],
      userGoals: [],
      businessRules: [],
      constraints: [],
    };
  }

  /**
   * 分析 API 文档
   */
  async analyzeAPIDoc(content) {
    const endpoints = this.extractEndpoints(content);
    const features = endpoints.map(ep => `API: ${ep.method} ${ep.path}`);

    return {
      features,
      userGoals: [],
      businessRules: [],
      constraints: [],
    };
  }

  /**
   * 提取页面名称
   */
  extractPageName(feature, keyword) {
    const match = feature.match(/(.+?)(列表|详情|页|管理|设置|中心)/);
    return match ? match[1] + keyword : null;
  }

  /**
   * 获取页面类型
   */
  getPageType(keyword) {
    const typeMap = {
      '列表': 'list',
      '详情': 'detail',
      '管理': 'management',
      '设置': 'settings',
      '中心': 'dashboard',
      '首页': 'home',
    };

    return typeMap[keyword] || 'page';
  }

  /**
   * 从描述提取流程
   */
  extractFlowsFromDescription(content) {
    const flows = [];

    // 简单的流程提取逻辑
    if (content.includes('列表') && content.includes('详情')) {
      flows.push({
        name: '查看详情流程',
        type: 'primary',
        steps: [
          '进入列表页',
          '查看列表内容',
          '点击列表项',
          '验证进入详情页',
          '查看详情内容',
        ],
      });
    }

    return flows;
  }

  /**
   * 推断 Given
   */
  inferGiven(step, flow) {
    // 从流程中推断前提条件
    if (step.includes('列表')) {
      return '用户已登录系统';
    }
    if (step.includes('详情')) {
      return '用户在列表页';
    }
    return '用户在系统中';
  }

  /**
   * 推断 Then
   */
  inferThen(step, flow) {
    // 从步骤中推断预期结果
    if (step.includes('进入') || step.includes('跳转')) {
      return '页面正常加载，URL 正确';
    }
    if (step.includes('点击')) {
      return '操作成功，页面响应正确';
    }
    if (step.includes('查看')) {
      return '内容显示正确，信息完整';
    }
    return '操作成功完成';
  }

  /**
   * 提取 API 端点
   */
  extractEndpoints(content) {
    const endpoints = [];
    const lines = content.split('\n');

    for (const line of lines) {
      const match = line.match(/(GET|POST|PUT|DELETE|PATCH)\s+(\/[^\s]+)/);
      if (match) {
        endpoints.push({
          method: match[1],
          path: match[2],
        });
      }
    }

    return endpoints;
  }

  /**
   * 从 AST 信息构建增强的上下文描述
   * @param {Object} astInfo - AST 解析结果
   * @returns {string} 格式化的上下文描述
   */
  buildEnhancedContextFromAST(astInfo) {
    const sections = [];

    // 类列表
    if (astInfo.classes && astInfo.classes.length > 0) {
      sections.push('### 检测到的类');
      for (const cls of astInfo.classes) {
        sections.push(`- **${cls.name}**${cls.superClass ? ` (extends ${cls.superClass})` : ''}`);
        if (cls.methods && cls.methods.length > 0) {
          const methodNames = cls.methods.map(m => typeof m === 'string' ? m : m.name).filter(n => n);
          if (methodNames.length > 0) {
            sections.push(`  - 方法: ${methodNames.slice(0, 10).join(', ')}${methodNames.length > 10 ? '...' : ''}`);
          }
        }
      }
      sections.push('');
    }

    // API 调用
    if (astInfo.apiCalls && astInfo.apiCalls.length > 0) {
      sections.push('### 检测到的 API 调用');
      sections.push('| 方法 | URL | 来源 |');
      sections.push('|------|-----|------|');
      for (const api of astInfo.apiCalls) {
        sections.push(`| ${api.method} | \`${api.url}\` | ${api.source} |`);
      }
      sections.push('');
    }

    // UI 元素
    if (astInfo.uiElements && astInfo.uiElements.length > 0) {
      sections.push('### 检测到的 UI 元素');
      // 按类型分组
      const byType = {};
      for (const elem of astInfo.uiElements) {
        if (!byType[elem.type]) byType[elem.type] = [];
        byType[elem.type].push(elem);
      }
      for (const [type, elements] of Object.entries(byType)) {
        const typeName = type === 'input' ? '输入框' : type === 'dropdown' ? '下拉框' : type === 'checkbox' ? '复选框' : type === 'list' ? '列表' : type;
        sections.push(`#### ${typeName}`);
        for (const elem of elements.slice(0, 20)) {
          sections.push(`- **${elem.name}** (${elem.source})`);
        }
      }
      sections.push('');
    }

    // 核心方法
    if (astInfo.coreMethods && astInfo.coreMethods.length > 0) {
      sections.push('### 检测到的核心方法');
      sections.push('```');
      for (const method of astInfo.coreMethods.slice(0, 30)) {
        sections.push(`${method.class}.${method.name}()`);
      }
      if (astInfo.coreMethods.length > 30) {
        sections.push(`... 还有 ${astInfo.coreMethods.length - 30} 个方法`);
      }
      sections.push('```');
      sections.push('');
    }

    return sections.join('\n');
  }

  /**
   * 记录日志
   */
  log(level, message, data = {}) {
    const logMethod = level === 'error' ? console.error : console.log;
    logMethod(`[AITestGenerator] ${message}`, data);
  }
}

module.exports = AITestGeneratorComplete;
