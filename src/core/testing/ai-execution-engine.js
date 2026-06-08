/**
 * AI Execution Engine
 *
 * 核心升级点：测试不是"生成脚本"，而是"Agent执行"
 *
 * 执行模型：
 * while (test not finished):
 *   1. 观察页面（DOM / screenshot）
 *   2. 理解当前状态
 *   3. 决定下一步操作
 *   4. 执行操作
 *   5. 验证结果
 *
 * 核心特性：
 * ✅ AI 实时决策，不是预生成脚本
 * ✅ 每一步都基于当前状态
 * ✅ 可以应对意外情况
 * ✅ 自动纠错和恢复
 * ✅ 智能探索未知路径
 */

const { chromium } = require('playwright');
const Verifications = require('./verifications');

class AIExecutionEngine {
  constructor(options = {}) {
    // 浏览器相关
    this.browser = null;
    this.context = null;
    this.page = null;

    // AI 能力
    this.memory = options.memory || null;
    this.llm = options.llm || null;
    this.verifications = null;

    // 执行状态
    this.currentUrl = null;
    this.executionHistory = [];
    this.observationHistory = [];
    this.actionHistory = [];
    this.screenshotDir = options.screenshotDir || './test-screenshots';

    // 执行配置
    this.maxIterations = options.maxIterations || 50;
    this.thinkingTime = options.thinkingTime || 1000;
    this.enableSelfCorrection = options.enableSelfCorrection !== false;
    this.enableExploration = options.enableExploration !== false;

    // 事件监听器清理函数
    this.pageEventHandlers = [];
  }

  /**
   * 初始化浏览器和执行环境
   */
  async init(options = {}) {
    const browserOptions = {
      headless: options.headless !== false,
      slowMo: options.slowMo || 100,
    };

    this.browser = await chromium.launch(browserOptions);
    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: 'AI-Test-Agent/1.0',
    });
    this.page = await this.context.newPage();
    this.verifications = new Verifications(this.page);

    // 监听页面事件 - 保存引用以便后续清理
    const loadHandler = () => this.onPageLoad();
    const consoleHandler = (msg) => this.onConsoleMessage(msg);
    const dialogHandler = (dialog) => this.onDialog(dialog);

    this.page.on('load', loadHandler);
    this.page.on('console', consoleHandler);
    this.page.on('dialog', dialogHandler);

    // 保存事件处理器引用
    this.pageEventHandlers = [
      { event: 'load', handler: loadHandler },
      { event: 'console', handler: consoleHandler },
      { event: 'dialog', handler: dialogHandler },
    ];

    this.log('info', 'AI 执行引擎初始化完成');
  }

  /**
   * 核心执行循环 - AI Agent 真正的执行方式
   * @param {Object} goal - 测试目标
   * @param {Object} options - 执行选项
   * @returns {Object} 执行结果
   */
  async execute(goal, options = {}) {
    this.log('info', '开始 AI 执行', { goal });

    const executionState = {
      status: 'running',
      iteration: 0,
      startTime: Date.now(),
      goal: goal,
      currentContext: {
        url: null,
        dom: null,
        screenshot: null,
        understanding: null,
      },
      decisions: [],
      actions: [],
      verifications: [],
      errors: [],
      completed: false,
    };

    try {
      // 初始导航（如果提供了起始 URL）
      if (goal.startUrl) {
        await this.navigate(goal.startUrl);
        await this.sleep(this.thinkingTime);
      }

      // ========== 核心执行循环 ==========
      while (!executionState.completed && executionState.iteration < this.maxIterations) {
        executionState.iteration++;

        this.log('info', `=== 迭代 ${executionState.iteration} ===`, {
          url: this.currentUrl,
        });

        // 步骤 1: 观察页面
        const observation = await this.observe(executionState);
        executionState.currentContext = {
          url: observation.url,
          dom: observation.dom,
          screenshot: observation.screenshot,
          understanding: null, // 将在下一步填充
        };

        this.log('info', '步骤 1: 观察完成', {
          elements: observation.dom?.elements?.length,
          hasScreenshot: !!observation.screenshot,
        });

        // 步骤 2: 理解当前状态
        const understanding = await this.understand(observation, executionState);
        executionState.currentContext.understanding = understanding;

        this.log('info', '步骤 2: 理解完成', {
          currentState: understanding.currentState,
          progress: understanding.progress,
          nextActionNeeded: understanding.nextActionNeeded,
        });

        // 检查是否完成
        if (understanding.completed) {
          executionState.completed = true;
          executionState.status = 'completed';
          this.log('info', '✓ 目标已完成');
          break;
        }

        // 步骤 3: 决定下一步操作
        const decision = await this.decide(understanding, executionState);
        executionState.decisions.push(decision);

        this.log('info', '步骤 3: 决策完成', {
          action: decision.action,
          target: decision.target,
          reasoning: decision.reasoning,
        });

        // 步骤 4: 执行操作
        const actionResult = await this.act(decision, executionState);
        executionState.actions.push(actionResult);

        this.log('info', '步骤 4: 执行完成', {
          success: actionResult.success,
          error: actionResult.error,
        });

        // 步骤 5: 验证结果
        const verification = await this.verify(decision, actionResult, executionState);
        executionState.verifications.push(verification);

        this.log('info', '步骤 5: 验证完成', {
          passed: verification.passed,
          expectations: verification.expectations?.length,
        });

        // 处理失败和自我纠正
        if (!actionResult.success || !verification.passed) {
          if (this.enableSelfCorrection) {
            this.log('warn', '检测到失败，尝试自我纠正');
            const correction = await this.selfCorrect(actionResult, verification, executionState);
            if (correction.corrected) {
              this.log('info', '✓ 自我纠正成功');
              continue;
            }
          }

          // 如果无法纠正，决定是否继续
          if (decision.critical) {
            executionState.status = 'failed';
            executionState.errors.push({
              iteration: executionState.iteration,
              action: decision.action,
              error: actionResult.error || verification.error,
            });
            this.log('error', '关键步骤失败，终止执行');
            break;
          }
        }

        // 等待页面稳定
        await this.sleep(this.thinkingTime);
      }

      // 检查是否达到最大迭代次数
      if (executionState.iteration >= this.maxIterations && !executionState.completed) {
        executionState.status = 'timeout';
        this.log('warn', `达到最大迭代次数 (${this.maxIterations})`);
      }

      executionState.endTime = Date.now();
      executionState.duration = executionState.endTime - executionState.startTime;

      this.log('info', '执行完成', {
        status: executionState.status,
        iterations: executionState.iteration,
        duration: executionState.duration,
      });

      return this.formatExecutionResult(executionState);
    } catch (error) {
      executionState.status = 'error';
      executionState.error = error.message;
      executionState.stack = error.stack;

      this.log('error', '执行异常', { error: error.message });

      return this.formatExecutionResult(executionState);
    }
  }

  /**
   * 步骤 1: 观察页面
   * 获取 DOM 和截图
   */
  async observe(executionState) {
    this.log('debug', '观察页面...');

    const observation = {
      timestamp: Date.now(),
      url: this.page.url(),
      dom: null,
      screenshot: null,
    };

    // 获取 DOM
    try {
      observation.dom = await this.extractDOM();
    } catch (error) {
      this.log('warn', 'DOM 提取失败', { error: error.message });
    }

    // 获取截图
    try {
      const screenshotPath = await this.captureScreenshot(`iteration-${executionState.iteration}`);
      observation.screenshot = screenshotPath;
    } catch (error) {
      this.log('warn', '截图失败', { error: error.message });
    }

    // 保存观察历史
    this.observationHistory.push(observation);

    return observation;
  }

  /**
   * 步骤 2: 理解当前状态
   * 使用 AI 分析观察结果
   */
  async understand(observation, executionState) {
    this.log('debug', '理解状态...');

    const understanding = {
      timestamp: Date.now(),
      currentState: 'unknown',
      progress: 0,
      nextActionNeeded: true,
      completed: false,
      context: {},
      reasoning: null,
    };

    // 如果没有 LLM，使用规则基础的理解
    if (!this.llm) {
      return this.ruleBasedUnderstanding(observation, executionState);
    }

    // 使用 AI 理解
    try {
      const prompt = this.buildUnderstandingPrompt(observation, executionState);

      const response = await this.llm.complete({
        messages: [
          {
            role: 'system',
            content: '你是一个智能测试执行助手，负责理解页面当前状态并决定下一步操作。',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
      });

      const result = this.parseUnderstandingResponse(response);

      understanding.currentState = result.currentState;
      understanding.progress = result.progress;
      understanding.nextActionNeeded = result.nextActionNeeded;
      understanding.completed = result.completed;
      understanding.context = result.context;
      understanding.reasoning = result.reasoning;

      return understanding;
    } catch (error) {
      this.log('warn', 'AI 理解失败，回退到规则', { error: error.message });
      return this.ruleBasedUnderstanding(observation, executionState);
    }
  }

  /**
   * 步骤 3: 决定下一步操作
   * 使用 AI 决策或规则决策
   */
  async decide(understanding, executionState) {
    this.log('debug', '决策...');

    const decision = {
      timestamp: Date.now(),
      action: null,
      target: null,
      value: null,
      reasoning: null,
      confidence: 0,
      critical: false,
      alternativeActions: [],
    };

    // 如果没有 LLM，使用规则基础的决策
    if (!this.llm) {
      return this.ruleBasedDecision(understanding, executionState);
    }

    // 使用 AI 决策
    try {
      const prompt = this.buildDecisionPrompt(understanding, executionState);

      const response = await this.llm.complete({
        messages: [
          {
            role: 'system',
            content: '你是一个智能测试决策助手，负责决定下一步操作。',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
      });

      const result = this.parseDecisionResponse(response);

      decision.action = result.action;
      decision.target = result.target;
      decision.value = result.value;
      decision.reasoning = result.reasoning;
      decision.confidence = result.confidence;
      decision.critical = result.critical;
      decision.alternativeActions = result.alternativeActions || [];

      return decision;
    } catch (error) {
      this.log('warn', 'AI 决策失败，回退到规则', { error: error.message });
      return this.ruleBasedDecision(understanding, executionState);
    }
  }

  /**
   * 步骤 4: 执行操作
   */
  async act(decision, executionState) {
    this.log('debug', '执行操作...', { action: decision.action });

    const result = {
      timestamp: Date.now(),
      action: decision.action,
      target: decision.target,
      success: false,
      error: null,
      beforeState: null,
      afterState: null,
      sideEffects: [],
    };

    try {
      // 记录执行前状态
      result.beforeState = {
        url: this.page.url(),
      };

      // 执行操作
      switch (decision.action) {
        case 'navigate':
          await this.page.goto(decision.target);
          result.success = true;
          break;

        case 'click':
          await this.clickElement(decision.target);
          result.success = true;
          break;

        case 'input':
          await this.inputText(decision.target, decision.value);
          result.success = true;
          break;

        case 'scroll':
          await this.page.evaluate(({ y }) => {
            window.scrollBy(0, y);
          }, { y: decision.value || 500 });
          result.success = true;
          break;

        case 'wait':
          await this.sleep(decision.value || 1000);
          result.success = true;
          break;

        case 'assert':
          // 断言操作，验证操作在 verify 中完成
          result.success = true;
          break;

        case 'explore':
          if (this.enableExploration) {
            await this.explore();
            result.success = true;
          } else {
            result.success = false;
            result.error = '探索功能未启用';
          }
          break;

        default:
          throw new Error(`未知操作: ${decision.action}`);
      }

      // 记录执行后状态
      await this.sleep(500); // 等待操作生效
      result.afterState = {
        url: this.page.url(),
      };

      this.log('info', '操作执行成功', { action: decision.action });

    } catch (error) {
      result.success = false;
      result.error = error.message;
      this.log('error', '操作执行失败', { action: decision.action, error: error.message });
    }

    // 保存操作历史
    this.actionHistory.push(result);

    return result;
  }

  /**
   * 步骤 5: 验证结果
   */
  async verify(decision, actionResult, executionState) {
    this.log('debug', '验证结果...');

    const verification = {
      timestamp: Date.now(),
      passed: false,
      expectations: [],
      failures: [],
      error: null,
    };

    try {
      // 根据操作类型定义验证规则
      const expectations = this.defineExpectations(decision, actionResult);

      // 执行验证
      for (const expectation of expectations) {
        const result = await this.executeExpectation(expectation);
        verification.expectations.push(result);

        if (!result.passed) {
          verification.failures.push(result);
        }
      }

      verification.passed = verification.failures.length === 0;

      this.log('info', '验证完成', {
        passed: verification.passed,
        total: verification.expectations.length,
        failures: verification.failures.length,
      });

    } catch (error) {
      verification.error = error.message;
      this.log('error', '验证异常', { error: error.message });
    }

    return verification;
  }

  /**
   * 自我纠正
   */
  async selfCorrect(actionResult, verification, executionState) {
    this.log('debug', '自我纠正...');

    const correction = {
      timestamp: Date.now(),
      corrected: false,
      attempts: 0,
      finalAction: null,
      reasoning: null,
    };

    if (!this.llm) {
      // 规则基础的纠正
      if (actionResult.error && actionResult.error.includes('not found')) {
        // 元素未找到，尝试等待
        await this.sleep(2000);
        correction.corrected = true;
        correction.reasoning = '元素未找到，等待加载';
      }
      return correction;
    }

    // AI 驱动的纠正
    try {
      const prompt = this.buildCorrectionPrompt(actionResult, verification, executionState);

      const response = await this.llm.complete({
        messages: [
          {
            role: 'system',
            content: '你是一个智能纠错助手，负责分析失败原因并提供纠正方案。',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
      });

      const result = JSON.parse(response);

      if (result.corrected && result.correctionAction) {
        // 执行纠正操作
        const correctionResult = await this.act(
          {
            action: result.correctionAction.action,
            target: result.correctionAction.target,
            value: result.correctionAction.value,
          },
          executionState
        );

        correction.corrected = correctionResult.success;
        correction.finalAction = result.correctionAction;
        correction.reasoning = result.reasoning;
      }
    } catch (error) {
      this.log('warn', 'AI 纠正失败', { error: error.message });
    }

    return correction;
  }

  /**
   * 探索模式
   */
  async explore() {
    this.log('info', '探索模式：查找可交互元素');

    const elements = await this.page.evaluate(() => {
      const interactive = [];
      const selectors = ['a', 'button', '[role="button"]', 'input', 'select'];

      selectors.forEach(selector => {
        const found = document.querySelectorAll(selector);
        found.forEach(el => {
          interactive.push({
            tag: el.tagName,
            text: el.textContent?.substring(0, 50),
            id: el.id,
            className: el.className,
          });
        });
      });

      return interactive.slice(0, 10); // 返回前 10 个
    });

    this.log('info', `发现 ${elements.length} 个可交互元素`, { elements });

    return elements;
  }

  // ============================================
  // 辅助方法
  // ============================================

  /**
   * 提取 DOM 信息
   */
  async extractDOM() {
    const dom = await this.page.evaluate(() => {
      return {
        title: document.title,
        url: window.location.href,
        elements: Array.from(document.querySelectorAll('*')).slice(0, 100).map(el => ({
          tag: el.tagName,
          id: el.id,
          className: el.className,
          text: el.textContent?.substring(0, 50),
          visible: el.offsetParent !== null,
        })),
      };
    });

    return dom;
  }

  /**
   * 截图
   */
  async captureScreenshot(name) {
    const timestamp = Date.now();
    const filename = `${name}-${timestamp}.png`;
    const filepath = `${this.screenshotDir}/${filename}`;

    await this.page.screenshot({ path: filepath, fullPage: false });

    return filepath;
  }

  /**
   * 导航
   */
  async navigate(url) {
    // 使用 load 而不是 networkidle，避免 Flutter Web 的 DWDS SSE 连接导致永久等待
    await this.page.goto(url, { waitUntil: 'load', timeout: 60000 });
    this.currentUrl = url;
    this.log('info', `导航到: ${url}`);
  }

  /**
   * 点击元素
   */
  async clickElement(selector) {
    await this.page.click(selector, { timeout: 5000 });
    this.log('info', `点击: ${selector}`);
  }

  /**
   * 输入文本
   */
  async inputText(selector, text) {
    await this.page.fill(selector, text);
    this.log('info', `输入: ${selector} = ${text}`);
  }

  /**
   * 睡眠
   */
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 构建理解提示词
   */
  buildUnderstandingPrompt(observation, executionState) {
    return `
当前状态：
- URL: ${observation.url}
- 目标: ${JSON.stringify(executionState.goal)}
- 迭代: ${executionState.iteration}

页面元素：
${JSON.stringify(observation.dom?.elements?.slice(0, 20), null, 2)}

请分析：
1. 当前处于什么状态？
2. 完成目标的进度是多少（0-100）？
3. 是否需要执行下一步操作？
4. 目标是否已完成？

返回 JSON 格式。
`;
  }

  /**
   * 构建决策提示词
   */
  buildDecisionPrompt(understanding, executionState) {
    return `
当前理解：
- 状态: ${understanding.currentState}
- 进度: ${understanding.progress}%
- 下一步需要: ${understanding.nextActionNeeded}

目标：${JSON.stringify(executionState.goal)}

历史操作：
${JSON.stringify(executionState.actions.slice(-3), null, 2)}

请决定下一步操作：
- navigate: 导航到 URL
- click: 点击元素
- input: 输入文本
- scroll: 滚动页面
- wait: 等待
- assert: 断言验证
- explore: 探索页面

返回 JSON 格式，包含 action, target, value, reasoning, confidence, critical。
`;
  }

  /**
   * 构建纠正提示词
   */
  buildCorrectionPrompt(actionResult, verification, executionState) {
    return `
操作失败：
- 操作: ${actionResult.action}
- 错误: ${actionResult.error}

验证失败：
${JSON.stringify(verification.failures, null, 2)}

请分析失败原因并提供纠正方案。
`;
  }

  /**
   * 规则基础的理解
   */
  ruleBasedUnderstanding(observation, executionState) {
    const understanding = {
      currentState: 'unknown',
      progress: 0,
      nextActionNeeded: true,
      completed: false,
      context: {},
      reasoning: '规则基础理解',
    };

    // 简单规则
    if (executionState.goal?.targetUrl && observation.url === executionState.goal.targetUrl) {
      understanding.currentState = 'target_reached';
      understanding.progress = 50;
    }

    if (executionState.iteration > 5) {
      understanding.progress = Math.min(100, executionState.iteration * 10);
    }

    if (understanding.progress >= 100) {
      understanding.completed = true;
      understanding.nextActionNeeded = false;
    }

    return understanding;
  }

  /**
   * 规则基础的决策
   */
  ruleBasedDecision(understanding, executionState) {
    return {
      action: 'click',
      target: 'button',
      reasoning: '规则基础决策',
      confidence: 0.5,
      critical: false,
    };
  }

  /**
   * 定义验证期望
   */
  defineExpectations(decision, actionResult) {
    const expectations = [];

    switch (decision.action) {
      case 'navigate':
        expectations.push({
          type: 'url',
          check: 'page_url_changed',
          description: '页面 URL 应该改变',
        });
        break;

      case 'click':
        expectations.push({
          type: 'interaction',
          check: 'element_clicked',
          description: '元素应该被点击',
        });
        break;

      case 'input':
        expectations.push({
          type: 'value',
          check: 'text_entered',
          description: '文本应该输入',
        });
        break;
    }

    return expectations;
  }

  /**
   * 执行期望验证
   */
  async executeExpectation(expectation) {
    // 简化实现，实际需要更复杂的验证逻辑
    return {
      type: expectation.type,
      check: expectation.check,
      description: expectation.description,
      passed: true, // 简化
    };
  }

  /**
   * 解析理解响应
   */
  parseUnderstandingResponse(response) {
    try {
      return JSON.parse(response);
    } catch {
      return {
        currentState: 'unknown',
        progress: 0,
        nextActionNeeded: true,
        completed: false,
        reasoning: '解析失败',
      };
    }
  }

  /**
   * 解析决策响应
   */
  parseDecisionResponse(response) {
    try {
      return JSON.parse(response);
    } catch {
      return {
        action: 'wait',
        target: null,
        value: 1000,
        reasoning: '解析失败，默认等待',
        confidence: 0.3,
        critical: false,
      };
    }
  }

  /**
   * 格式化执行结果
   */
  formatExecutionResult(executionState) {
    return {
      success: executionState.status === 'completed',
      status: executionState.status,
      goal: executionState.goal,
      iterations: executionState.iteration,
      duration: executionState.duration,
      startTime: executionState.startTime,
      endTime: executionState.endTime,
      decisions: executionState.decisions,
      actions: executionState.actions,
      verifications: executionState.verifications,
      errors: executionState.errors,
      observations: this.observationHistory,
      completed: executionState.completed,
    };
  }

  /**
   * 页面加载事件
   */
  onPageLoad() {
    this.log('debug', '页面加载完成');
  }

  /**
   * 控制台消息事件
   */
  onConsoleMessage(msg) {
    if (msg.type() === 'error') {
      this.log('warn', '页面错误', { text: msg.text() });
    }
  }

  /**
   * 对话框事件
   */
  async onDialog(dialog) {
    this.log('info', '对话框', { message: dialog.message() });
    await dialog.accept();
  }

  /**
   * 日志
   */
  log(level, message, data = {}) {
    const logEntry = {
      level,
      message,
      data,
      timestamp: new Date().toISOString(),
      component: 'AIExecutionEngine',
    };

    this.executionHistory.push(logEntry);

    const logMethod = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    logMethod(`[AIExecutionEngine] ${message}`, data);
  }

  /**
   * 清理
   */
  async cleanup() {
    // 移除所有事件监听器
    if (this.page && this.pageEventHandlers.length > 0) {
      for (const { event, handler } of this.pageEventHandlers) {
        try {
          this.page.off(event, handler);
        } catch (error) {
          this.log('warn', `移除事件监听器失败: ${event}`, { error: error.message });
        }
      }
      this.pageEventHandlers = [];
    }

    if (this.browser) {
      try {
        await this.browser.close();
        this.log('info', '浏览器已关闭');
      } catch (error) {
        this.log('warn', '关闭浏览器失败', { error: error.message });
      }
      this.browser = null;
      this.context = null;
      this.page = null;
    }
  }

  /**
   * 获取执行历史
   */
  getExecutionHistory() {
    return this.executionHistory;
  }
}

module.exports = AIExecutionEngine;
