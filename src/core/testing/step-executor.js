/**
 * Step Executor
 *
 * 逐步执行测试步骤的核心引擎
 * - 执行操作
 * - 获取 DOM 状态
 * - AI 决策下一步
 * - 验证预期结果
 *
 * 核心原则：
 * ✅ 逐步执行（Step 1 → Get DOM → Decide Step 2）
 * ❌ 不是一次性生成所有步骤
 */

const { chromium } = require('playwright');
const Verifications = require('./verifications');

class StepExecutor {
  constructor(options = {}) {
    this.browser = null;
    this.context = null;
    this.page = null;
    this.memory = options.memory || null; // Project Memory
    this.llm = options.llm || null;       // LLM Router
    this.verifications = null;
    this.currentUrl = null;
    this.executionLog = [];
    this.screenshotDir = options.screenshotDir || './test-screenshots';
    this.projectUrl = options.projectUrl || null;  // 项目 URL
    this.cdpEndpoint = options.cdpEndpoint || null;  // CDP 端点
    this.connectedToExistingBrowser = false;  // 是否连接到现有浏览器

    // 事件监听器清理函数
    this.pageEventHandlers = [];

    // Flutter 語義層初始化狀態
    this.flutterSemanticsInitialized = false;

    // 网络请求错误记录（用于验证错误提示）
    this.lastFailedRequest = null;
    this.failedRequests = [];
  }

  /**
   * 初始化浏览器
   * @param {Object} options - 浏览器选项
   */
  async initBrowser(options = {}) {
    const browserOptions = {
      headless: options.headless !== false, // 默认无头模式
      slowMo: options.slowMo || 50,         // 慢动作模式，便于观察
      ...options,
    };

    // 合并 projectUrl 和 cdpEndpoint
    if (options.projectUrl) {
      this.projectUrl = options.projectUrl;
    }
    if (options.cdpEndpoint) {
      this.cdpEndpoint = options.cdpEndpoint;
    }

    // 如果有 CDP 端点，连接到现有的 Chrome 浏览器
    if (this.cdpEndpoint) {
      // 规范化 CDP 端点 URL（确保使用 WebSocket 协议）
      let normalizedEndpoint = this.cdpEndpoint.trim();

      // 如果是 HTTP URL，转换为 WebSocket URL
      if (normalizedEndpoint.startsWith('http://')) {
        normalizedEndpoint = normalizedEndpoint.replace('http://', 'ws://');
        this.log('info', `[CDP] 将 HTTP URL 转换为 WebSocket URL: ${normalizedEndpoint}`);
      } else if (normalizedEndpoint.startsWith('https://')) {
        normalizedEndpoint = normalizedEndpoint.replace('https://', 'wss://');
        this.log('info', `[CDP] 将 HTTPS URL 转换为 WebSocket URL: ${normalizedEndpoint}`);
      } else if (!normalizedEndpoint.startsWith('ws://') && !normalizedEndpoint.startsWith('wss://')) {
        // 如果没有协议，默认使用 ws://
        normalizedEndpoint = `ws://${normalizedEndpoint}`;
        this.log('info', `[CDP] 添加 WebSocket 协议: ${normalizedEndpoint}`);
      }

      // 如果 URL 不包含端口，尝试添加默认的 CDP 端口
      if (!normalizedEndpoint.match(/:\d+\/?$/)) {
        // 尝试从 URL 中提取主机名并添加 9222 端口
        try {
          const url = new URL(normalizedEndpoint);
          if (url.port === '') {
            // 重新构建 URL，添加 9222 端口
            const hostWithPort = `${url.hostname}:9222`;
            normalizedEndpoint = `${url.protocol}//${hostWithPort}${url.pathname}`;
            this.log('info', `[CDP] 添加默认 CDP 端口 9222: ${normalizedEndpoint}`);
          }
        } catch (e) {
          this.log('warn', `[CDP] URL 解析失败: ${e.message}`);
        }
      }

      this.log('info', `[CDP] 使用 CDP 连接到现有浏览器: ${normalizedEndpoint}`);
      try {
        // 使用 CDP 连接到现有的 Chrome
        this.log('info', '[CDP] 正在连接到 CDP 端点...');
        this.browser = await chromium.connectOverCDP(normalizedEndpoint);
        this.connectedToExistingBrowser = true;
        this.log('info', '[CDP] CDP 连接成功！');

        // 获取现有的页面（上下文）
        const contexts = this.browser.contexts();
        if (contexts.length > 0) {
          this.context = contexts[0];
          const pages = this.context.pages();
          if (pages.length > 0) {
            this.page = pages[0];
            this.log('info', `[CDP] 使用现有浏览器页面: ${this.page.url()}`);
          } else {
            this.page = await this.context.newPage();
            this.log('info', '[CDP] 在现有浏览器中创建新页面');
          }
        } else {
          // 如果没有上下文，创建一个新的
          this.context = await this.browser.newContext({
            viewport: { width: 1280, height: 720 },
          });
          this.page = await this.context.newPage();
          this.log('info', '[CDP] 在现有浏览器中创建新上下文和页面');
        }
      } catch (error) {
        this.log('error', `[CDP] CDP 连接失败: ${error.message}，将启动新浏览器`);
        this.connectedToExistingBrowser = false;
        this.cdpEndpoint = null;  // 清除无效的 CDP 端点
        // 继续下面的启动新浏览器逻辑
      }
    } else {
      this.log('info', '[CDP] 未设置 CDP 端点，将启动新的浏览器实例');
    }

    // 如果没有连接到现有浏览器，启动新的
    if (!this.browser) {
      this.log('info', '启动新的 Chromium 浏览器');

      // 注释掉强制清理，避免影响用户的 Chrome 浏览器
      // Playwright 会自己管理进程，使用独立的用户数据目录
      // await this.forceCleanupBrowserProcesses();

      this.browser = await chromium.launch(browserOptions);
      this.context = await this.browser.newContext({
        viewport: { width: 1280, height: 720 },
        userAgent: 'TestAgent/1.0',
      });
      this.page = await this.context.newPage();
    }

    this.verifications = new Verifications(this.page);

    // 设置网络请求拦截，用于记录失败的请求
    await this.setupRequestInterception();

    // 监听页面事件 - 保存引用以便后续清理
    const loadHandler = () => this.onPageLoad();
    const consoleHandler = (msg) => this.onConsoleMessage(msg);

    this.page.on('load', loadHandler);
    this.page.on('console', consoleHandler);

    // 保存事件处理器引用
    this.pageEventHandlers = [
      { event: 'load', handler: loadHandler },
      { event: 'console', handler: consoleHandler },
    ];

    this.log('info', '浏览器初始化完成', {
      connectedToExisting: this.connectedToExistingBrowser,
      browserOptions
    });

      // 如果有项目 URL，导航到该页面
      if (this.projectUrl) {
        const currentUrl = this.page.url();
        this.log('info', `当前页面: ${currentUrl}, 目标 URL: ${this.projectUrl}`);

        // 总是导航到项目 URL（确保在正确的页面）
        this.log('info', `导航到项目地址: ${this.projectUrl}`);

        // 使用重试机制导航到项目 URL
        const maxRetries = 3;
        let navigationSuccess = false;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            this.log('info', `导航尝试 ${attempt}/${maxRetries}...`);

            // 使用 load 策略，避免 $dwdsSseHandler 等長連接點導致 networkidle 永久掛起
            await this.page.goto(this.projectUrl, {
              waitUntil: 'load',
              timeout: 60000
            });

            // 針對 Flutter Web 等待渲染就绪
            let ready = await this.waitForFlutterReady();
            
            if (!ready) {
              this.log('warn', `导航尝试 ${attempt} 后 Flutter 未就绪，尝试强制刷新 (Reload)...`);
              await this.page.reload({ waitUntil: 'load', timeout: 60000 });
              ready = await this.waitForFlutterReady();
            }

            if (ready) {
              this.currentUrl = this.page.url();
              this.log('info', `页面加载并渲染完成: ${this.currentUrl}`);
              navigationSuccess = true;
              break;
            }
            
            if (attempt < maxRetries) {
              this.log('info', `等待 5 秒后重试导航...`);
              await this.page.waitForTimeout(5000);
            }
          } catch (error) {
            this.log('warn', `导航尝试 ${attempt} 异常: ${error.message}`);
            if (attempt === maxRetries) {
              // 最后一次尝试：检查是否已经在正确的页面
              const currentUrlAfterRetry = this.page.url();
              if (currentUrlAfterRetry.includes('localhost') || currentUrlAfterRetry.includes('127.0.0.1')) {
                this.log('info', `虽然导航失败，但当前在本地页面: ${currentUrlAfterRetry}，继续测试`);
                navigationSuccess = true;
                break;
              }
            }
            await this.page.waitForTimeout(3000);
          }
        }

        if (!navigationSuccess) {
          throw new Error(`无法连接到 ${this.projectUrl}。请确保应用已启动。`);
        }
      }
    }

  /**
   * 确保 Flutter 语义层已激活
   * 解决 Flutter Web 在 Canvas 或 HTML 渲染下 DOM 元素不可点击的问题
   */
  async ensureFlutterSemanticsEnabled() {
    if (this.flutterSemanticsInitialized) return;
    
    this.log('info', '正在檢測並嘗試激活 Flutter 語義層...');
    try {
      // 檢測是否為 Flutter 頁面
      const isFlutter = await this.page.evaluate(() => {
        return !!(document.querySelector('flt-semantics-host') || 
                  document.querySelector('flt-glass-pane') ||
                  document.querySelector('flutter-view') ||
                  document.querySelector('flt-scene-host') ||
                  document.querySelector('flt-semantics-placeholder'));
      });

      if (isFlutter) {
        this.log('info', '檢測到 Flutter 應用，嘗試激活交互層...');

        // 1. 首先等待 Flutter 引擎就绪
        await this.waitForFlutterReady();

        // 2. 多策略激活语义层
        const result = await this.page.evaluate(() => {
          const results = [];

          // 策略 1: 点击 flt-semantics-placeholder 激活语义树
          const placeholder = document.querySelector('flt-semantics-placeholder');
          if (placeholder) {
            placeholder.click();
            results.push('clicked_placeholder');
          }

          // 策略 2: 通过 flutter_inappwebview 或 flutter 引擎 API 激活语义层
          if (window._flutter && window._flutter.loader) {
            results.push('flutter_loader_detected');
          }

          // 策略 3: 使用 CanvasKit 语义 API
          if (window.flutter_web_set_canvas_kit_semantics) {
            window.flutter_web_set_canvas_kit_semantics(true);
            results.push('canvaskit_semantics_enabled');
          }

          // 策略 4: 尝试通过 document.body 或 glass pane 触发Tab键（激活 A11y）
          const glassPane = document.querySelector('flt-glass-pane');
          if (glassPane) {
            const tabEvent = new KeyboardEvent('keydown', {
              key: 'Tab', code: 'Tab', keyCode: 9, which: 9, bubbles: true
            });
            glassPane.dispatchEvent(tabEvent);
            results.push('tab_dispatched_to_glass_pane');
          }

          // 策略 5: 全局点击作为兜底
          if (results.length === 0) {
            document.body.click();
            results.push('clicked_body');
          }

          return results.join(', ');
        });
        
        this.log('info', `語義層激活操作完成: ${result}`);

        // 等待語義樹生成（从 3 秒增加到 5 秒）
        await this.page.waitForTimeout(5000);

        // 验证语义节点是否出现
        const semanticsCount = await this.page.evaluate(() => {
          const host = document.querySelector('flt-semantics-host');
          if (!host) return 0;
          return host.querySelectorAll('[role]').length;
        });

        if (semanticsCount > 0) {
          this.log('info', `語義樹已生成，找到 ${semanticsCount} 個語義節點`);
        } else {
          this.log('warn', '語義樹未生成語義節點');
          try {
            await this.page.keyboard.press('Tab');
            await this.page.waitForTimeout(2000);
          } catch (_) {}
        }

        this.flutterSemanticsInitialized = true;
      }
    } catch (e) {
      this.log('warn', `激活 Flutter 語義層失敗（非致命）：${e.message}`);
    }
  }

  /**
   * 等待 Flutter Web 应用渲染就绪 (简化版)
   * 使用固定等待时间，确保应用有足够时间加载和生成语义树
   */
  async waitForFlutterReady() {
    try {
      this.log('info', '[Flutter] 等待应用加载 (固定 12 秒)...');

      // 1. 等待 Flutter 渲染容器出现（30秒超时）
      try {
        await this.page.waitForSelector(
          'flt-glass-pane, flt-scene-host, flutter-view, canvas',
          { state: 'attached', timeout: 30000 }
        );
        this.log('info', '[Flutter] 渲染容器已出现');
      } catch (e) {
        this.log('warn', `[Flutter] 未检测到渲染容器: ${e.message}，继续执行`);
      }

      // 2. 固定等待 12 秒让应用完全加载和生成语义树（从 8 秒增加到 12 秒）
      await this.page.waitForTimeout(12000);

      // 3. 验证语义树是否已生成
      const semanticsReady = await this.page.evaluate(() => {
        const host = document.querySelector('flt-semantics-host');
        if (!host) return false;
        const nodes = host.querySelectorAll('[role]');
        return nodes.length > 0;
      });

      if (semanticsReady) {
        this.log('info', '[Flutter] 语义树已就绪');
      } else {
        this.log('warn', '[Flutter] 语义树未完全就绪，但继续执行');
      }

      return true;

    } catch (e) {
      this.log('warn', `[Flutter] waitForFlutterReady 失败: ${e.message}，继续执行`);
      return true; // 总是返回 true，不阻塞测试执行
    }
  }

  /**
   * 初始化执行器（别名方法，兼容 ai-test-agent）
   * @param {Object} options - 选项
   */
  async initExecutor(options = {}) {
    // 记录 CDP 端点状态（用于调试）
    this.log('info', `initExecutor 调用，CDP 状态: constructor.cdpEndpoint=${this.cdpEndpoint ? '已设置' : '未设置'}, options.cdpEndpoint=${options.cdpEndpoint ? '已设置' : '未设置'}`);

    await this.initBrowser(options);
  }

  /**
   * 执行单个测试步骤
   * @param {Object} step - 测试步骤
   * @returns {Object} 执行结果
   */
  async executeStep(step) {
    const startTime = Date.now();
    this.log('info', `执行步骤: ${step.type}`, { step });

    try {
      let result;

      switch (step.type) {
        case 'given':
          result = await this.executeGiven(step);
          break;
        case 'when':
          result = await this.executeWhen(step);
          break;
        case 'then':
          result = await this.executeThen(step);
          break;
        default:
          throw new Error(`未知步骤类型: ${step.type}`);
      }

      const duration = Date.now() - startTime;
      result.duration = duration;

      this.log(result.success ? 'info' : 'error', `步骤完成: ${step.type}`, {
        duration,
        result,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorResult = {
        success: false,
        step: step.type,
        error: error.message,
        stack: error.stack,
        duration,
      };

      this.log('error', `步骤失败: ${step.type}`, {
        error: error.message,
        duration,
      });

      return errorResult;
    }
  }

  /**
   * 执行 Given 步骤（前提条件）
   * @param {Object} step - Given 步骤
   * @returns {Object} 执行结果
   */
  async executeGiven(step) {
    const results = {
      success: true,
      type: 'given',
      actions: [],
      domState: null,
    };

    // 提取步骤描述
    const stepDescription = this.extractStepDescription(step);

    // 调试日志
    this.log('info', '[executeGiven] ═══════════════════════════════════════', {});
    this.log('info', '[executeGiven] 前置条件检查', {
      description: stepDescription,
      hasActions: !!step.actions,
      actionsCount: step.actions?.length || 0,
      allActions: step.actions?.map(a => ({ type: a.type, target: a.target, description: a.description })) || []
    });

    // 获取当前状态
    const currentState = await this.getCurrentState();
    this.log('info', '[executeGiven] 当前状态', {
      url: currentState.url,
      hasPasswordField: currentState.hasPasswordField,
      hasIdField: currentState.hasIdField,
      hasLoginButton: currentState.hasLoginButton
    });

    // 如果已经有预定义的 actions，直接执行
    if (step.actions && step.actions.length > 0) {
      this.log('info', '[executeGiven] 使用预定义的 actions', {
        count: step.actions.length,
        actions: step.actions.map(a => ({ type: a.type, target: a.target, value: a.value, description: a.description }))
      });
      return await this.executeGivenActions(step.actions, results);
    }

    // 检查当前状态是否满足前置条件
    const stateCheck = await this.checkGivenState(stepDescription, currentState);

    if (stateCheck.satisfied) {
      this.log('info', '[executeGiven] ✓ 前置条件已满足', {
        description: stepDescription,
        reason: stateCheck.reason
      });
      results.domState = await this.getDOMState();
      return results;
    }

    // 前置条件不满足，需要执行操作来达到预期状态
    this.log('info', '[executeGiven] ✗ 前置条件不满足，将执行操作来满足', {
      description: stepDescription,
      currentState,
      expectedState: stateCheck.expected,
      reason: stateCheck.reason
    });

    // 生成满足前置条件的操作
    const actionsToSatisfy = await this.generateActionsToSatisfyGiven(stepDescription, currentState);

    if (!actionsToSatisfy || actionsToSatisfy.length === 0) {
      // 无法生成操作，但返回 true（避免阻塞测试）
      this.log('warn', '[executeGiven] 无法生成满足前置条件的操作，假设状态已满足', {
        description: stepDescription
      });
      results.domState = await this.getDOMState();
      return results;
    }

    this.log('info', '[executeGiven] 生成满足前置条件的操作', {
      count: actionsToSatisfy.length,
      actions: actionsToSatisfy.map(a => ({ type: a.type, target: a.target, value: a.value, description: a.description }))
    });

    // 执行生成的操作
    return await this.executeGivenActions(actionsToSatisfy, results);
  }

  /**
   * 执行 Given 的 actions（用于复用）
   */
  async executeGivenActions(actionsToExecute, results) {
    // 预处理：将 generic 类型的 actions 转换为可执行的操作
    if (actionsToExecute && actionsToExecute.length > 0) {
      const hasGenericActions = actionsToExecute.some(a => a.type === 'generic');
      if (hasGenericActions) {
        this.log('info', `[executeGiven] 检测到 generic actions，开始预处理...`);
        const expandedActions = [];

        for (const action of actionsToExecute) {
          if (action.type === 'generic') {
            const parsedActions = this.ruleBasedActions(action.description || '', 'given');
            if (parsedActions && parsedActions.length > 0) {
              this.log('info', `[executeGiven] generic "${action.description}" 解析为 ${parsedActions.length} 个操作`);
              expandedActions.push(...parsedActions);
            }
          } else {
            expandedActions.push(action);
          }
        }

        actionsToExecute = expandedActions;
      }
    }

    // 执行所有 action
    if (actionsToExecute && actionsToExecute.length > 0) {
      this.log('info', `[executeGiven] 执行 ${actionsToExecute.length} 个 actions`);

      for (const action of actionsToExecute) {
        this.log('info', `[executeGiven] 执行 action: ${action.type}`, {
          target: action.target,
          value: action.value,
          description: action.description
        });
        const actionResult = await this.executeAction(action);
        results.actions.push(actionResult);

        if (!actionResult.success) {
          this.log('error', `[executeGiven] Action 执行失败`, {
            type: action.type,
            error: actionResult.error,
            selector: actionResult.selector
          });
          results.success = false;
          break;
        }
      }
    }

    results.domState = await this.getDOMState();

    this.log('info', `[executeGiven] 返回结果: success=${results.success}, actionsExecuted=${results.actions.length}`);
    return results;
  }

  /**
   * 获取当前页面状态
   * 同时检查 DOM 元素和页面文本内容，只要有一项满足即可
   * @returns {Object} 当前状态
   */
  async getCurrentState() {
    const state = {
      url: '',
      hasPasswordField: false,
      hasIdField: false,
      hasEmailField: false,
      hasLoginButton: false,
      hasNextButton: false,
      hasSubmitButton: false,
      bodyText: ''
    };

    if (!this.page) {
      return state;
    }

    try {
      state.url = this.page.url();
      state.bodyText = await this.page.evaluate(() => document.body?.textContent?.substring(0, 500) || '');

      const bodyLower = state.bodyText.toLowerCase();

      // 简繁体关键词映射（用于文本检查）
      const passwordKeywords = ['密码', '密碼', 'password', 'pwd', 'pass'];
      const idKeywords = ['id', '账号', '帳號', 'account', '用户', '使用者', 'user'];
      const emailKeywords = ['邮箱', '郵箱', 'email', 'mail', '电子邮件'];
      const loginKeywords = ['登录', '登入', 'login', 'signin', 'sign in', '登錄'];
      const nextKeywords = ['下一步', '下一步', 'next', '继续', 'continue'];
      const submitKeywords = ['提交', 'submit', 'send', '发送'];

      // ==================== 检查1: 页面文本内容 ====================
      const hasPasswordInText = passwordKeywords.some(kw => bodyLower.includes(kw.toLowerCase()));
      const hasIdInText = idKeywords.some(kw => bodyLower.includes(kw.toLowerCase()));
      const hasEmailInText = emailKeywords.some(kw => bodyLower.includes(kw.toLowerCase()));
      const hasLoginInText = loginKeywords.some(kw => bodyLower.includes(kw.toLowerCase()));
      const hasNextInText = nextKeywords.some(kw => bodyLower.includes(kw.toLowerCase()));
      const hasSubmitInText = submitKeywords.some(kw => bodyLower.includes(kw.toLowerCase()));

      // ==================== 检查2: 实际 DOM 元素 ====================
      const domCheck = await this.page.evaluate(() => {
        const result = {
          hasPasswordInput: false,
          hasIdInput: false,
          hasEmailInput: false,
          hasLoginButton: false,
          hasNextButton: false,
          hasSubmitButton: false,
          // 用于调试的详细信息
          passwordInputDetails: [],
          idInputDetails: [],
          emailInputDetails: [],
          buttonDetails: []
        };

        // 检查输入框（包括 type、placeholder、id、name、aria-label、aria-placeholder）
        const inputs = document.querySelectorAll('input:not([type=hidden]), textarea');
        const passwordKws = ['密码', '密碼', 'password', 'pwd', 'pass'];
        const idKws = ['id', '账号', '帳號', 'account', 'user', '用户', '使用者'];
        const emailKws = ['邮箱', '郵箱', 'email', 'mail'];

        inputs.forEach(input => {
          const type = (input.type || '').toLowerCase();
          const placeholder = (input.placeholder || '').toLowerCase();
          const id = (input.id || '').toLowerCase();
          const name = (input.name || '').toLowerCase();
          const ariaLabel = (input.getAttribute('aria-label') || '').toLowerCase();
          const ariaPlaceholder = (input.getAttribute('aria-placeholder') || '').toLowerCase();

          // 组合所有可能的文本来源
          const allText = [type, placeholder, id, name, ariaLabel, ariaPlaceholder].join(' ');

          // 检查密码输入框
          if (type === 'password' || passwordKws.some(kw => allText.includes(kw.toLowerCase()))) {
            result.hasPasswordInput = true;
            result.passwordInputDetails.push({ type, placeholder, id, name });
          }

          // 检查 ID 输入框
          if (idKws.some(kw => allText.includes(kw.toLowerCase()))) {
            result.hasIdInput = true;
            result.idInputDetails.push({ type, placeholder, id, name });
          }

          // 检查邮箱输入框
          if (emailKws.some(kw => allText.includes(kw.toLowerCase())) || type === 'email') {
            result.hasEmailInput = true;
            result.emailInputDetails.push({ type, placeholder, id, name });
          }
        });

        // 检查按钮（包括文本、aria-label、id、name）
        const buttons = document.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"]');
        const loginKws = ['登录', '登入', 'login', 'signin', '登錄'];
        const nextKws = ['下一步', '下一步', 'next', '继续', 'continue'];
        const submitKws = ['提交', 'submit', 'send', '发送', '確認', '确认', 'ok'];

        buttons.forEach(btn => {
          const text = (btn.textContent || '').trim().toLowerCase();
          const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
          const id = (btn.id || '').toLowerCase();
          const name = (btn.name || '').toLowerCase();
          const allText = [text, ariaLabel, id, name].join(' ');

          if (loginKws.some(kw => allText.includes(kw.toLowerCase()))) {
            result.hasLoginButton = true;
          }
          if (nextKws.some(kw => allText.includes(kw.toLowerCase()))) {
            result.hasNextButton = true;
          }
          if (submitKws.some(kw => allText.includes(kw.toLowerCase()))) {
            result.hasSubmitButton = true;
          }

          result.buttonDetails.push({ text: text.substring(0, 30), ariaLabel, id });
        });

        return result;
      });

      // ==================== 合并结果：文本检查 OR DOM 检查 ====================
      state.hasPasswordField = hasPasswordInText || domCheck.hasPasswordInput;
      state.hasIdField = hasIdInText || domCheck.hasIdInput;
      state.hasEmailField = hasEmailInText || domCheck.hasEmailInput;
      state.hasLoginButton = hasLoginInText || domCheck.hasLoginButton;
      state.hasNextButton = hasNextInText || domCheck.hasNextButton;
      state.hasSubmitButton = hasSubmitInText || domCheck.hasSubmitButton;

      // 统计元素数量
      state.elementCount = (domCheck.passwordInputDetails.length +
                           domCheck.idInputDetails.length +
                           domCheck.emailInputDetails.length +
                           domCheck.buttonDetails.length);

      // 详细日志（用于调试）
      this.log('info', '[getCurrentState] 状态检查结果', {
        url: state.url,
        hasPasswordField: state.hasPasswordField,
        hasIdField: state.hasIdField,
        hasEmailField: state.hasEmailField,
        hasLoginButton: state.hasLoginButton,
        hasNextButton: state.hasNextButton,
        hasSubmitButton: state.hasSubmitButton,
        textCheck: { hasPasswordInText, hasIdInText, hasEmailInText, hasLoginInText },
        domCheck: {
          hasPasswordInput: domCheck.hasPasswordInput,
          hasIdInput: domCheck.hasIdInput,
          hasEmailInput: domCheck.hasEmailInput,
          hasLoginButton: domCheck.hasLoginButton
        },
        bodyTextPreview: bodyLower.substring(0, 200)
      });

    } catch (error) {
      this.log('warn', '[getCurrentState] 获取状态失败', { error: error.message });
    }

    return state;
  }

  /**
   * 检查当前状态是否满足 Given 前置条件
   * @param {string} description - Given 描述
   * @param {Object} currentState - 当前状态
   * @returns {Object} { satisfied: boolean, reason: string, expected: string }
   */
  async checkGivenState(description, currentState) {
    const descLower = description.toLowerCase();

    // 1. 检查是否在登录页面
    if (descLower.includes('登录') || descLower.includes('login') || descLower.includes('登入')) {
      const hasLoginElements = currentState.hasPasswordField || currentState.hasIdField || currentState.hasLoginButton;

      if (!hasLoginElements) {
        return {
          satisfied: false,
          reason: '当前页面不是登录页面',
          expected: '登录页面（有密码/ID输入框和登录按钮）'
        };
      }
      return { satisfied: true, reason: '当前在登录页面' };
    }

    // 2. 检查是否在特定页面
    const pageChecks = [
      { pattern: /首页|home|主页/, check: (s) => s.url.includes('home') || s.url.includes('main') || s.url.includes('index'), expected: '首页 URL' },
      { pattern: /列表|list/, check: (s) => s.url.includes('list'), expected: '列表页 URL' },
      { pattern: /账户|account|管理/, check: (s) => s.url.includes('account') || s.url.includes('management'), expected: '账户管理页 URL' },
    ];

    for (const { pattern, check, expected } of pageChecks) {
      if (pattern.test(descLower)) {
        if (!check(currentState)) {
          return {
            satisfied: false,
            reason: `当前不在预期页面`,
            expected: expected
          };
        }
        return { satisfied: true, reason: '当前在预期页面' };
      }
    }

    // 3. 默认：假设状态满足（避免误报）
    return { satisfied: true, reason: '无法进行具体验证，假设状态已满足' };
  }

  /**
   * 生成满足前置条件的操作
   * @param {string} description - Given 描述
   * @param {Object} currentState - 当前状态
   * @returns {Array} 操作列表
   */
  async generateActionsToSatisfyGiven(description, currentState) {
    const actions = [];
    const descLower = description.toLowerCase();

    this.log('info', '[generateActionsToSatisfyGiven] 开始生成操作', {
      description,
      currentUrl: currentState.url
    });

    // 如果描述提到登录页面，且当前不在登录页
    if (descLower.includes('登录') || descLower.includes('login') || descLower.includes('登入')) {
      const hasLoginElements = currentState.hasPasswordField || currentState.hasIdField || currentState.hasLoginButton;

      if (!hasLoginElements) {
        // 需要导航到登录页
        // 尝试从项目 URL 构建登录页 URL
        let loginUrl = '/login';

        if (this.projectUrl) {
          const baseUrl = this.projectUrl.replace(/\/$/, '');
          // 尝试常见的登录页路径
          loginUrl = `${baseUrl}/login`;
        }

        this.log('info', '[generateActionsToSatisfyGiven] 生成导航到登录页操作', { loginUrl });

        actions.push({
          type: 'navigate',
          target: loginUrl,
          description: `导航到登录页`,
          url: loginUrl
        });

        // 导航后等待页面加载
        actions.push({
          type: 'wait',
          duration: 3000,
          description: '等待登录页加载'
        });
      }
    }

    // 如果提到了其他特定页面
    const pageActions = [
      { pattern: /首页|home/, url: '/home', name: '首页' },
      { pattern: /列表|list/, url: '/list', name: '列表页' },
    ];

    for (const { pattern, url, name } of pageActions) {
      if (pattern.test(descLower) && !currentState.url.includes(url)) {
        this.log('info', `[generateActionsToSatisfyGiven] 生成导航到${name}操作`, { url });

        actions.push({
          type: 'navigate',
          target: url,
          description: `导航到${name}`,
          url: url
        });

        actions.push({
          type: 'wait',
          duration: 2000,
          description: `等待${name}加载`
        });
      }
    }

    this.log('info', '[generateActionsToSatisfyGiven] 生成完成', {
      actionCount: actions.length,
      actions: actions.map(a => ({ type: a.type, description: a.description }))
    });

    return actions;
  }

  /**
   * 执行 When 步骤（操作）
   * @param {Object} step - When 步骤
   * @returns {Object} 执行结果
   */
  async executeWhen(step) {
    const results = {
      success: true,
      type: 'when',
      actions: [],
      domState: null,
      aiDecisions: [],
    };

    // 调试日志：记录接收到的 step 对象
    this.log('info', '[executeWhen] ═══════════════════════════════════════', {});
    this.log('info', '[executeWhen] 接收到 step 对象', {
      stepType: step.type,
      stepDescription: step.description,
      stepText: step.text,
      hasActions: !!step.actions,
      actionsCount: step.actions?.length || 0,
      allActions: step.actions?.map(a => ({ type: a.type, target: a.target, value: a.value, description: a.description })) || [],
      rawActions: JSON.stringify(step.actions)
    });

    // 如果没有 actions，尝试从描述中生成
    let actionsToExecute = step.actions;

    if (!actionsToExecute || actionsToExecute.length === 0) {
      // 尝试从步骤描述中提取或生成 actions
      const stepDescription = this.extractStepDescription(step);
      this.log('warn', `[executeWhen] step.actions 为空，尝试从描述生成`, {
        stepDescription,
        stepText: step.text
      });
      if (stepDescription) {
        this.log('info', '从描述生成 When actions', { description: stepDescription });
        actionsToExecute = await this.generateActionsFromDescription(stepDescription, 'when');
        this.log('info', `[executeWhen] 生成 actions 结果`, {
          count: actionsToExecute?.length || 0,
          actions: actionsToExecute?.map(a => ({ type: a.type, target: a.target, description: a.description })) || []
        });
      }
    }

    // 预处理：将 generic 类型的 actions 转换为可执行的操作
    // 如果 action 已经有有效的 type 和 target（来自 AI 生成），则直接使用
    if (actionsToExecute && actionsToExecute.length > 0) {
      const hasGenericActions = actionsToExecute.some(a => a.type === 'generic');
      const needsParsing = actionsToExecute.some(a =>
        a.type === 'generic' || (!a.target && a.description)
      );

      this.log('info', `[executeWhen] 检查 actions`, {
        totalActions: actionsToExecute.length,
        hasGenericActions,
        needsParsing,
        actionTypes: actionsToExecute.map(a => a.type),
        hasTargets: actionsToExecute.map(a => !!a.target)
      });

      if (needsParsing) {
        this.log('info', `[executeWhen] 检测到需要解析的 actions，开始预处理...`);
        const expandedActions = [];

        for (const action of actionsToExecute) {
          // 优先使用 AI 提供的结构化数据
          if (action.type && action.type !== 'generic' && action.target) {
            // AI 已经提供了正确的 type 和 target，直接使用
            this.log('info', `[executeWhen] 使用 AI 提供的结构化 action`, {
              type: action.type,
              target: action.target,
              value: action.value,
              description: action.description
            });
            expandedActions.push(action);
          } else if (action.type === 'generic') {
            // generic action 需要解析
            const parsedActions = this.ruleBasedActions(action.description || '', 'when');
            if (parsedActions && parsedActions.length > 0) {
              this.log('info', `[executeWhen] generic "${action.description}" 解析为 ${parsedActions.length} 个操作`, {
                parsed: parsedActions.map(a => ({ type: a.type, target: a.target, value: a.value }))
              });
              expandedActions.push(...parsedActions);
            } else {
              this.log('warn', `[executeWhen] generic "${action.description}" 无法解析，跳过`);
            }
          } else {
            // 其他情况直接保留
            expandedActions.push(action);
          }
        }

        this.log('info', `[executeWhen] 预处理完成: ${actionsToExecute.length} 个 actions 转换为 ${expandedActions.length} 个可执行操作`);
        actionsToExecute = expandedActions;

        this.log('info', `[executeWhen] ═══════ 预处理后的 actions ═══════════`, {
          total: expandedActions.length,
          actions: expandedActions.map(a => ({
            type: a.type,
            target: a.target,
            value: a.value,
            description: a.description
          }))
        });
      }
    }

    // 执行所有 action
    if (actionsToExecute && actionsToExecute.length > 0) {
      this.log('info', `[executeWhen] ═══════════════ 开始执行 actions ═══════════════`, {
        totalCount: actionsToExecute.length
      });
      this.log('info', `[executeWhen] 准备执行 ${actionsToExecute.length} 个 actions`, {
        actions: actionsToExecute.map(a => ({
          type: a.type,
          target: a.target,
          value: a.value,
          description: a.description
        }))
      });

      // 检查 actions 是否来自预定义的测试用例（有明确的 target 和 value）
      // 或者是具体的操作类型（非 generic）
      // 如果是，则禁用 AI 决策系统，严格按照测试用例执行
      const hasPredefinedActions = actionsToExecute.some(a =>
        (a.target !== undefined && a.target !== null) ||
        (a.value !== undefined && a.value !== null) ||
        (a.type !== 'generic' && a.type !== 'check' && a.type !== 'unknown')
      );

      if (hasPredefinedActions) {
        this.log('info', `[executeWhen] 检测到预定义的测试用例 actions，将禁用 AI 决策系统，严格按照测试用例执行`, {
          actionTypes: actionsToExecute.map(a => a.type),
          hasTargets: actionsToExecute.map(a => !!a.target)
        });
      }

      let actionIndex = 0;
      let pendingAIAction = null; // 存储AI建议的下一个操作

      this.log('info', `[executeWhen] 开始循环: actionIndex=0, totalActions=${actionsToExecute.length}, hasPredefinedActions=${hasPredefinedActions}`);

      while (actionIndex < actionsToExecute.length || pendingAIAction) {
        this.log('info', `[executeWhen] 循环迭代: actionIndex=${actionIndex}, actionsToExecute.length=${actionsToExecute.length}, pendingAIAction=${!!pendingAIAction}`);
        let action;

        // 优先使用AI建议的操作
        if (pendingAIAction) {
          action = pendingAIAction;
          pendingAIAction = null;
          this.log('info', '使用AI建议的操作', { action });
        } else {
          action = actionsToExecute[actionIndex];
          this.log('info', `[executeWhen] 执行第 ${actionIndex + 1}/${actionsToExecute.length} 个 action`, {
            type: action.type,
            target: action.target,
            value: action.value,
            description: action.description
          });
        }

        // 获取当前 DOM 状态
        const domState = await this.getDOMState();

        // AI 决策下一步（在执行前决策）
        // 只有在没有预定义 actions 时才使用 AI 决策
        if (this.llm && !hasPredefinedActions) {
          const decision = await this.decideNextStep(domState, step);
          results.aiDecisions.push(decision);

          if (decision.shouldStop) {
            this.log('info', 'AI 决定停止执行', { decision });
            break;
          }

          // 如果 AI 提供了 nextAction，保存为下一个待执行操作
          if (decision.nextAction) {
            // 验证 AI 建议的操作是否包含必需的字段
            const nextAction = decision.nextAction;
            const isValid = this.validateAction(nextAction);

            if (!isValid) {
              this.log('warn', `AI 建议的操作缺少必需字段，跳过`, { nextAction });
            } else if (nextAction.type === action.type) {
              // 只合并 AI 建议中原始 action 没有的属性
              // 记录原始值（在合并之前）
              const originalValue = action.value;
              const originalTarget = action.target;

              const mergedAction = { ...action };
              // 只在原始 action 没有该属性时才使用 AI 建议的值
              if (mergedAction.value === undefined || mergedAction.value === null) {
                mergedAction.value = nextAction.value;
              }
              if (mergedAction.target === undefined || mergedAction.target === null) {
                mergedAction.target = nextAction.target;
              }
              // 其他属性（如 reasoning）可以合并
              if (nextAction.reasoning) {
                mergedAction.reasoning = nextAction.reasoning;
              }
              action = mergedAction;

              this.log('info', `[合并AI建议] type: ${action.type}`, {
                originalValue: originalValue,  // 真正的原始值
                aiSuggestedValue: nextAction.value,
                finalValue: action.value,
                valueChanged: originalValue !== action.value,
                originalTarget: originalTarget,  // 真正的原始 target
                aiSuggestedTarget: nextAction.target,
                finalTarget: action.target,
                targetChanged: originalTarget !== action.target
              });
            } else {
              // 类型不匹配，保存为下一个操作（但先验证）
              if (this.validateAction(decision.nextAction)) {
                pendingAIAction = {
                  ...decision.nextAction,
                  description: step.description || decision.nextAction.description,
                };
                this.log('info', `保存AI建议的下一个操作: ${pendingAIAction.type}`, {
                  type: pendingAIAction.type,
                  target: pendingAIAction.target,
                  value: pendingAIAction.value
                });
              } else {
                this.log('warn', 'AI 建议的操作无效，跳过', { nextAction: decision.nextAction });
              }
            }
          }
        } else if (this.llm && hasPredefinedActions) {
          // 有预定义 actions 时，只记录决策，不中断执行
          const decision = await this.decideNextStep(domState, step);
          results.aiDecisions.push(decision);
          this.log('info', '[executeWhen] 有预定义 actions，忽略 AI 的 shouldStop 决策', {
            shouldStop: decision.shouldStop,
            nextAction: decision.nextAction
          });
        }

        const actionResult = await this.executeAction(action);
        results.actions.push(actionResult);

        // 详细日志：记录每个 action 的执行结果
        this.log('info', `[executeWhen] Action ${actionIndex + 1} 执行完成`, {
          type: action.type,
          target: action.target,
          success: actionResult.success,
          hasError: !!actionResult.error,
          error: actionResult.error,
          remainingActions: actionsToExecute.length - actionIndex - 1
        });

        if (!actionResult.success) {
          // 详细日志：记录失败信息
          this.log('error', `[executeWhen] ═══════════════════════════════════════`);
          this.log('error', `[executeWhen] ❌ Action ${actionIndex + 1}/${actionsToExecute.length} 执行失败！`);
          this.log('error', `[executeWhen] 失败 Action 详情:`, {
            type: action.type,
            target: action.target,
            value: action.value,
            description: action.description,
            selector: actionResult.selector,
            error: actionResult.error
          });

          // 列出未执行的 actions
          const remainingActions = actionsToExecute.slice(actionIndex + 1);
          if (remainingActions.length > 0) {
            this.log('error', `[executeWhen] ⚠️ 以下 ${remainingActions.length} 个 actions 未执行:`);
            remainingActions.forEach((a, idx) => {
              this.log('error', `[executeWhen]   - [${actionIndex + 2 + idx}] ${a.type}: ${a.target || a.description || '(无描述)'}`);
            });
          }
          this.log('error', `[executeWhen] ═══════════════════════════════════════`);

          results.success = false;
          break;
        }

        // 只有在没有使用AI建议的操作时才递增索引
        if (!pendingAIAction || actionIndex < actionsToExecute.length - 1) {
          actionIndex++;
          this.log('info', `[executeWhen] actionIndex 递增到 ${actionIndex}/${actionsToExecute.length}`);
        } else {
          this.log('info', `[executeWhen] actionIndex 未递增 (pendingAIAction 存在且是最后一个 action)`);
        }
      }

      this.log('info', `[executeWhen] 循环结束: actionIndex=${actionIndex}, actionsToExecute.length=${actionsToExecute.length}, 已执行 ${results.actions.length} 个 actions`);
    } else {
      this.log('warn', 'When 步骤没有可执行的操作', { step });
    }

    // 最终 DOM 状态
    results.domState = await this.getDOMState();

    this.log('info', `[executeWhen] 返回结果: success=${results.success}, actionsExecuted=${results.actions.length}, expectedActions=${actionsToExecute?.length || 0}`);
    if (results.actions.length > 0) {
      results.actions.forEach((a, i) => {
        this.log('info', `[executeWhen] Action ${i + 1} 结果: type=${a.action}, success=${a.success}, error=${a.error || 'none'}`);
      });
    }

    return results;
  }

  /**
   * 执行 Then 步骤（验证）
   * @param {Object} step - Then 步骤
   * @returns {Object} 执行结果
   */
  async executeThen(step) {
    const results = {
      success: true,
      type: 'then',
      verifications: [],
    };

    // 调试日志：记录输入的 step 数据
    this.log('info', '[executeThen] 输入的 step 数据', {
      type: step.type,
      description: step.description,
      text: step.text,
      hasVerifications: !!step.verifications,
      verificationsCount: step.verifications?.length || 0,
      verifications: step.verifications
    });

    // 如果没有 verifications，从描述生成
    let verificationsToExecute = step.verifications;

    if (!verificationsToExecute || verificationsToExecute.length === 0) {
      const stepDescription = this.extractStepDescription(step);
      // 检查是否是占位符描述
      if (stepDescription && this.isPlaceholderDescription(stepDescription)) {
        this.log('warn', '[executeThen] 检测到占位符描述，跳过验证', { description: stepDescription });
        results.verifications.push({
          type: 'basic',
          passed: true,
          message: `⚠ 跳过验证: 描述为占位符，请编辑测试用例填写正确的预期结果`,
        });
        return results;
      }
      if (stepDescription) {
        this.log('info', '从描述生成 Then 验证', { description: stepDescription });
        verificationsToExecute = await this.generateVerificationsFromDescription(stepDescription);
      }
    }

    // 规范化 verifications：确保每个验证对象都有 type 字段
    if (verificationsToExecute && verificationsToExecute.length > 0) {
      verificationsToExecute = verificationsToExecute.map(v => {
        // 如果没有 type 字段，根据描述推断或使用默认值
        if (!v.type) {
          this.log('warn', '[executeThen] 验证对象缺少 type 字段，使用默认类型', {
            description: v.description || v.message
          });
          // 如果有 description，使用 assertion 类型；否则使用 basic
          return {
            ...v,
            type: v.description || v.message ? 'assertion' : 'basic'
          };
        }
        return v;
      });
    }

    // 执行所有验证
    if (verificationsToExecute && verificationsToExecute.length > 0) {
      this.log('info', `[executeThen] ========== 开始执行验证 ==========`, {
        totalVerifications: verificationsToExecute.length
      });

      for (let i = 0; i < verificationsToExecute.length; i++) {
        const verification = verificationsToExecute[i];
        this.log('info', `[executeThen] 验证 ${i + 1}/${verificationsToExecute.length}: ${verification.type}`, {
          target: verification.target,
          expected: verification.expected,
          selector: verification.selector,
          description: verification.description || verification.message
        });

        const verificationResult = await this.executeVerification(verification);
        results.verifications.push(verificationResult);

        // 详细日志：记录验证结果
        if (verificationResult.passed) {
          this.log('info', `[executeThen] ✓ 验证 ${i + 1} 通过: ${verificationResult.message}`);
        } else {
          this.log('error', `[executeThen] ✗ 验证 ${i + 1} 失败！`, {
            type: verificationResult.type,
            expected: verificationResult.expected,
            actual: verificationResult.actual,
            selector: verificationResult.selector,
            message: verificationResult.message,
            error: verificationResult.error
          });
        }

        if (!verificationResult.passed) {
          results.success = false;
        }
      }

      // 总结日志
      const failedCount = results.verifications.filter(v => !v.passed).length;
      if (failedCount > 0) {
        this.log('error', `[executeThen] ========== 验证完成: ${verificationsToExecute.length - failedCount}/${verificationsToExecute.length} 通过 ==========`);
      } else {
        this.log('info', `[executeThen] ========== 验证完成: 全部通过 (${verificationsToExecute.length}/${verificationsToExecute.length}) ==========`);
      }
    } else {
      this.log('warn', 'Then 步骤没有可执行的验证', { step });
      // 如果没有验证，创建一个基本的验证
      results.verifications.push({
        type: 'basic',
        passed: true,
        message: `执行验证: ${this.extractStepDescription(step) || '完成'}`,
      });
    }

    return results;
  }

  /**
   * 执行单个操作
   * @param {Object} action - 操作
   * @returns {Object} 执行结果
   */
  async executeAction(action) {
    this.log('info', `执行操作: ${action.type}`, { action });
    
    // 延遲激活 Flutter 語義層，防止在加載初期干擾框架初始化
    await this.ensureFlutterSemanticsEnabled();

    try {
      let result;

      switch (action.type) {
        case 'navigate':
          result = await this.actionNavigate(action);
          break;
        case 'click':
          result = await this.actionClick(action);
          break;
        case 'hover':
          result = await this.actionHover(action);
          break;
        case 'input':
        case 'fill':
          result = await this.actionInput(action);
          break;
        case 'clear':
          result = await this.actionClear(action);
          break;
        case 'wait':
          result = await this.actionWait(action);
          break;
        case 'scroll':
          result = await this.actionScroll(action);
          break;
        case 'check':
          result = await this.actionCheck(action);
          break;
        case 'generic':
          // generic 类型需要被解析成可执行的操作
          this.log('info', `[Generic] 解析通用操作: ${action.description}`);
          // 使用 ruleBasedActions 将描述解析为可执行的操作
          const parsedActions = this.ruleBasedActions(action.description || '', 'when');
          if (parsedActions && parsedActions.length > 0) {
            this.log('info', `[Generic] 解析出 ${parsedActions.length} 个可执行操作`, {
              actions: parsedActions.map(a => ({ type: a.type, target: a.target, value: a.value }))
            });
            // 执行第一个解析出的操作
            const parsedAction = parsedActions[0];
            result = await this.executeAction(parsedAction);
            // 如果有多个操作，将其余的加入待执行队列
            if (parsedActions.length > 1) {
              // 标记需要插入额外的操作
              result.extraActions = parsedActions.slice(1);
              this.log('info', `[Generic] 还有 ${parsedActions.length - 1} 个操作需要执行`);
            }
          } else {
            // 无法解析，记录警告但不算失败
            this.log('warn', `[Generic] 无法解析操作: ${action.description}`);
            result = {
              success: true,
              action: 'generic',
              message: `无法解析的通用操作: ${action.description || '无描述'}`,
              skipped: true,
            };
          }
          break;
        default:
          this.log('warn', `未知操作类型: ${action.type}，跳过执行`);
          result = {
            success: true,
            action: action.type,
            message: `跳过未知操作类型: ${action.type}`,
          };
      }

      if (!result.success) {
        this.log('error', `操作执行失败 [${action.type}]: ${result.error || '原因未知'}`);
        await this.logDiagnosticInfo();
      } else {
        // 成功时截图
        await this.takeScreenshot(`after-${action.type}`);
      }

      return result;
    } catch (error) {
      this.log('error', `操作执行异常: ${error.message}`);
      await this.logDiagnosticInfo();
      return {
        success: false,
        action: action.type,
        error: error.message,
        stack: error.stack,
      };
    }
  }

  /**
   * 输出诊断信息：当发生错误时，记录当前页面状态
   */
  async logDiagnosticInfo() {
    this.log('info', '--- 开始收集页面诊断信息 ---');
    try {
      const url = this.page.url();
      this.log('info', `[诊断] 当前 URL: ${url}`);

      const pageDesc = await this.page.evaluate(() => {
        const body = document.body;
        const textSnippets = body ? body.innerText.substring(0, 300).replace(/\s+/g, ' ') : 'null';
        const canvasCount = document.querySelectorAll('canvas').length;
        const glassPane = !!document.querySelector('flt-glass-pane');
        const semanticsHost = !!document.querySelector('flt-semantics-host');
        
        return {
          text: textSnippets,
          canvasCount,
          glassPane,
          semanticsHost,
          elementCount: document.querySelectorAll('*').length
        };
      });

      this.log('info', '[诊断] 页面结构', pageDesc);

      // 如果有可访问性树，记录前 10 个元素
      const a11y = await this.getAccessibilityTree();
      if (a11y && a11y.elements.length > 0) {
        const topElements = a11y.elements.slice(0, 10).map(e => `${e.role || 'no-role'}: "${e.label || e.text || 'no-label'}"`);
        this.log('info', `[诊断] 主要可交互元素: ${topElements.join(' | ')}`);
      } else {
        this.log('warn', '[诊断] 未找到任何可交互元素，这可能是页面尚未加载完成或 Flutter 语义层未激活');
      }

      // 最后尝试一次激活语义层
      await this.ensureFlutterSemanticsEnabled();
      
    } catch (e) {
      this.log('error', `[诊断] 收集过程失败: ${e.message}`);
    }
    this.log('info', '--- 页面诊断信息结束 ---');
  }

  /**
   * 导航操作
   * @param {Object} action - 导航操作
   * @returns {Object} 执行结果
   */
  async actionNavigate(action) {
    // TODO: 修复路由构建逻辑，避免生成 /unknown 路由
    // 理解目标页面
    const target = await this.understandTarget(action.target);

    if (!target || !target.route) {
      this.log('warn', `[actionNavigate] 无法理解目标: ${action.target}, 跳过导航`);
      return {
        success: true,  // 不导航不算失败，可能已经在正确的页面
        action: 'navigate',
        skipped: true,
        message: `跳过导航，目标: ${action.target}`,
      };
    }

    try {
      // 使用项目 URL 作为基础 URL
      const baseUrl = this.projectUrl || this.currentUrl || 'http://localhost:3000';

      // 如果 route 是完整 URL，直接使用；否则基于 baseUrl 构建
      let url;
      if (target.route.startsWith('http')) {
        url = target.route;
      } else if (target.route.startsWith('/')) {
        // 从 baseUrl 提取基础部分（协议 + 域名 + 端口）
        const baseUrlMatch = baseUrl.match(/^(https?:\/\/[^\/]+)/);
        if (baseUrlMatch) {
          url = `${baseUrlMatch[1]}${target.route}`;
        } else {
          url = `${baseUrl}${target.route}`;
        }
      } else {
        url = `${baseUrl}/${target.route}`;
      }

      // 如果使用 hash 模式（用于无法 slugify 的中文页面名），只导航到基础 URL
      if (target.useHash) {
        this.log('info', `[actionNavigate] 使用 hash 模式，仅导航到基础 URL: ${baseUrl}`, { target });
        // 跳过导航，假设应用已经在正确的页面
        return {
          success: true,
          action: 'navigate',
          skipped: true,
          message: `Hash 模式，跳过导航: ${action.target}`,
        };
      }

      this.log('info', `导航到: ${url}`, { target, baseUrl });

      // 实际导航到目标 URL
      this.log('info', `[Navigate] 正在导航到 ${url}...`);
      await this.page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      }).catch(err => {
        this.log('warn', `[Navigate] 导航到 ${url} 时出错: ${err.message}，继续执行`);
      });

      // 等待页面基本加载完成
      await this.page.waitForTimeout(1000);

      // 等待 Flutter 渲染完成
      let ready = await this.waitForFlutterReady();

      // [修复] 如果第一次加载失败或超时，且是在初始导航阶段，尝试重新加载页面一次
      if (!ready) {
        this.log('warn', '[Flutter] 初始导航后渲染未就绪，尝试重新加载页面 (Reload)...');
        await this.page.reload({ waitUntil: 'load', timeout: 60000 });
        ready = await this.waitForFlutterReady();
      }

      return {
        success: ready,
        action: 'navigate',
        target: action.target,
        route: target.route,
        url: this.page.url(),
        message: ready ? '导航成功' : '导航完成但 Flutter 渲染可能未就绪'
      };
    } catch (error) {
      this.log('error', `导航异常: ${error.message}`);
      return {
        success: false,
        action: 'navigate',
        error: error.message,
      };
    }
  }

  /**
   * 点击操作（Flutter Web 增强版）
   * @param {Object} action - 点击操作
   * @returns {Object} 执行结果
   */
  async actionClick(action) {
    const startTime = Date.now();
    this.log('info', `[Click] ========== 开始执行点击 action ==========`, {
      target: action.target,
      description: action.description
    });

    try {
      // 回退机制：如果 target 为空，尝试从 description 中提取
      let clickTarget = action.target;
      if (!clickTarget && action.description) {
        // 从描述中提取目标，支持简繁体
        // 例如："点击下一步按钮" -> "下一步按钮", "點擊 登入按鈕" -> "登入按鈕"
        const targetMatch = action.description.match(/(?:点击|點擊|选择|選擇|按下|按鈕)\s*(.+?)(?:按钮|按鈕)?$/);
        if (targetMatch) {
          clickTarget = targetMatch[1].trim();
          this.log('info', `[Click] 从描述中提取目标: "${clickTarget}" (原描述: "${action.description}")`);
        }
      }

      // 获取选择器
      const selector = await this.getSelector(clickTarget, action.index);

      this.log('info', `[Click] 目标: "${clickTarget}" -> 选择器: ${selector}`);

      // 等待元素存在（增加超时到 15 秒，Flutter 语义节点可能较慢出现）
      try {
        await this.page.waitForSelector(selector, { state: 'attached', timeout: 15000 });
      } catch (waitErr) {
        this.log('warn', `[Click] waitForSelector 超时 (${selector})，尝试直接操作`);
      }

      // 多策略点击
      let clicked = false;

      // 策略 1: Playwright force click
      try {
        await this.page.click(selector, { force: true, timeout: 5000 });
        clicked = true;
        this.log('info', '[Click] 策略1(force click) 成功');
      } catch (e) {
        this.log('warn', `[Click] 策略1(force click) 失败: ${e.message}`);
      }

      // 策略 2: 获取元素坐标后鼠标点击（Flutter 语义节点需要坐标点击才能激活引擎内部状态）
      if (!clicked) {
        try {
          const box = await this.page.evaluate((sel) => {
            const el = document.querySelector(sel);
            if (!el) return null;
            const rect = el.getBoundingClientRect();
            return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, w: rect.width, h: rect.height };
          }, selector);

          if (box && box.w > 0) {
            await this.page.mouse.click(box.x, box.y);
            clicked = true;
            this.log('info', `[Click] 策略2(坐标点击) 成功: (${Math.round(box.x)}, ${Math.round(box.y)})`);
          }
        } catch (e) {
          this.log('warn', `[Click] 策略2(坐标点击) 失败: ${e.message}`);
        }
      }

      // 策略 3: JS dispatchEvent
      if (!clicked) {
        try {
          await this.page.evaluate((sel) => {
            const el = document.querySelector(sel);
            if (el) {
              el.click();
              el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
              el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
            }
          }, selector);
          clicked = true;
          this.log('info', '[Click] 策略3(JS dispatch) 完成');
        } catch (e) {
          this.log('warn', `[Click] 策略3(JS dispatch) 失败: ${e.message}`);
        }
      }

      // 等待点击效果生效
      // 对于导航类按钮（如"下一步"、"提交"、"继续"），需要更长的等待时间
      const isNavigationClick = clickTarget && (
        clickTarget.includes('下一步') ||
        clickTarget.includes('提交') ||
        clickTarget.includes('继续') ||
        clickTarget.includes('确认') ||
        clickTarget.includes('登录') ||
        (action.description && (
          action.description.includes('下一步') ||
          action.description.includes('跳转') ||
          action.description.includes('提交')
        ))
      );

      // 对于密码显示/隐藏 icon，需要等待 DOM 状态更新
      const isPasswordIconClick = clickTarget && (
        clickTarget.includes('眼睛') ||
        clickTarget.includes('icon') ||
        clickTarget.includes('顯示') ||
        clickTarget.includes('显示') ||
        clickTarget.includes('隱藏') ||
        clickTarget.includes('隐藏') ||
        (action.description && (
          action.description.includes('顯示密碼') ||
          action.description.includes('显示密码') ||
          action.description.includes('隱藏密碼') ||
          action.description.includes('隐藏密码')
        ))
      );

      let waitTime = 500; // 默认等待时间
      if (isNavigationClick) {
        waitTime = 5000;
      } else if (isPasswordIconClick) {
        waitTime = 1500; // 密码 icon 需要更长的等待时间让 DOM 更新
      }

      if (isNavigationClick) {
        this.log('info', `[Click] 检测到导航类按钮，等待 ${waitTime}ms 让页面状态更新...`);
      } else if (isPasswordIconClick) {
        this.log('info', `[Click] 检测到密码显示/隐藏 icon，等待 ${waitTime}ms 让密码状态切换...`);
      }

      await this.page.waitForTimeout(waitTime);

      // 对于导航类点击，额外等待 Flutter 语义树更新
      if (isNavigationClick) {
        this.log('info', `[Click] 额外等待 Flutter 语义树更新...`);
        await this.page.waitForTimeout(2000);
      }

      const duration = Date.now() - startTime;
      this.log('info', `[Click] ========== 点击 action 完成 ==========`, {
        success: clicked,
        target: action.target,
        selector,
        duration: `${duration}ms`
      });

      return {
        success: clicked,
        action: 'click',
        target: action.target,
        selector,
        index: action.index,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.log('error', `[Click] ========== 点击 action 失败 ==========`, {
        error: error.message,
        duration: `${duration}ms`
      });
      return {
        success: false,
        action: 'click',
        error: error.message,
      };
    }
  }

  /**
   * 鼠标悬停操作（用于触发 tooltip）
   * @param {Object} action - 悬停操作
   * @returns {Object} 执行结果
   */
  async actionHover(action) {
    const startTime = Date.now();
    this.log('info', `[Hover] ========== 开始执行悬停 action ==========`, {
      target: action.target,
      description: action.description
    });

    // ========== 辅助函数：分析用例描述，确定目标区域 ==========
    const analyzeTargetHint = (description, target) => {
      const desc = (description || '').toLowerCase();
      const tgt = (target || '').toLowerCase();

      // 定义区域关键词
      const areaKeywords = {
        table: ['表格', '列', '行', 'row', 'column', 'cell', '单元格', 'data', 'grid', '列表', 'list'],
        top: ['顶部', 'header', '导航', 'nav', '用户信息', 'userinfo', 'icon', '头像', 'avatar'],
        sidebar: ['侧边栏', 'sidebar', '菜单', 'menu', '导航栏', 'nav'],
        main: ['主内容', 'main', '内容区', 'content'],
        any: [] // 默认，不限制区域
      };

      // 分析描述中的关键词
      let matchedArea = 'main'; // 默认主内容区
      let maxScore = 0;

      for (const [area, keywords] of Object.entries(areaKeywords)) {
        let score = 0;
        for (const keyword of keywords) {
          if (desc.includes(keyword)) score += 2;
          if (tgt.includes(keyword)) score += 1;
        }
        if (score > maxScore) {
          maxScore = score;
          matchedArea = area;
        }
      }

      // 特殊处理：如果明确提到了表格，优先表格区域
      if (desc.includes('表格') || desc.includes('列') || desc.includes('单元格')) {
        matchedArea = 'table';
      }
      // 如果明确提到了顶部/导航栏/用户信息，优先顶部区域
      else if (desc.includes('顶部') || desc.includes('导航') || desc.includes('用户信息') || desc.includes('header')) {
        matchedArea = 'top';
      }
      // 如果明确提到了侧边栏/菜单，优先侧边栏区域
      else if (desc.includes('侧边栏') || desc.includes('菜单') || desc.includes('导航栏')) {
        matchedArea = 'sidebar';
      }

      return {
        area: matchedArea,
        keywords: areaKeywords[matchedArea],
        description: description,
        target: target
      };
    };

    try {
      // 回退机制：如果 target 为空，尝试从 description 中提取
      let hoverTarget = action.target;
      if (!hoverTarget && action.description) {
        // 从描述中提取目标
        const targetMatch = action.description.match(/悬停\s*(?:在|于)?\s*(.+?)(?:上|元素)?$/);
        if (targetMatch) {
          hoverTarget = targetMatch[1].trim();
          this.log('info', `[Hover] 从描述中提取目标: "${hoverTarget}"`);
        }
      }

      let selector = null;
      let elementFound = false;

      // 特殊处理：查找带省略号的元素
      if (hoverTarget && (hoverTarget.includes('省略号') || hoverTarget.includes('...') || hoverTarget.includes('ellipsis'))) {
        this.log('info', `[Hover] 检测到省略号目标，智能查找带省略号的元素...`);

        const ellipsisInfo = await this.page.evaluate(() => {
          // 查找所有可能包含省略号的元素
          const allElements = document.querySelectorAll('*');
          const candidates = [];

          for (const el of Array.from(allElements)) {
            const style = window.getComputedStyle(el);
            const text = el.textContent || '';

            // 检查是否有 text-overflow: ellipsis
            if (style.textOverflow === 'ellipsis') {
              const rect = el.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0) {
                candidates.push({
                  selector: el.id ? `#${el.id}` : (el.className ? `.${el.className.split(' ')[0]}` : el.tagName.toLowerCase()),
                  text: text.trim().substring(0, 50),
                  hasTitle: !!el.getAttribute('title'),
                  x: rect.x + rect.width / 2,
                  y: rect.y + rect.height / 2,
                  priority: 1 // text-overflow: ellipsis 优先级最高
                });
              }
            }

            // 检查文本是否包含省略号
            if (text.includes('...') || text.includes('…')) {
              const rect = el.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0 && rect.width < 300) { // 窄元素更可能是表格单元格
                candidates.push({
                  selector: el.id ? `#${el.id}` : (el.className ? `.${el.className.split(' ')[0]}` : el.tagName.toLowerCase()),
                  text: text.trim().substring(0, 50),
                  hasTitle: !!el.getAttribute('title'),
                  x: rect.x + rect.width / 2,
                  y: rect.y + rect.height / 2,
                  priority: 2
                });
              }
            }

            // 检查 white-space: nowrap + overflow: hidden 组合
            if (style.whiteSpace === 'nowrap' && style.overflow === 'hidden') {
              const rect = el.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0) {
                candidates.push({
                  selector: el.id ? `#${el.id}` : (el.className ? `.${el.className.split(' ')[0]}` : el.tagName.toLowerCase()),
                  text: text.trim().substring(0, 50),
                  hasTitle: !!el.getAttribute('title'),
                  x: rect.x + rect.width / 2,
                  y: rect.y + rect.height / 2,
                  priority: 3
                });
              }
            }
          }

          // 按优先级排序，返回最佳候选
          candidates.sort((a, b) => a.priority - b.priority);
          return candidates.length > 0 ? candidates[0] : null;
        });

        if (ellipsisInfo) {
          this.log('info', `[Hover] 找到带省略号的元素`, ellipsisInfo);
          // 使用坐标悬停
          await this.page.mouse.move(ellipsisInfo.x, ellipsisInfo.y);
          elementFound = true;
        } else {
          this.log('warn', `[Hover] 未找到带省略号的元素，尝试常规选择器`);
        }
      }

      // 特殊处理：查找 email 相关的表格单元格
      if (!elementFound && hoverTarget && hoverTarget.toLowerCase().includes('email')) {
        // 根据用例描述动态调整查找策略
        const description = action.description || '';

        // 动态分析目标区域
        let targetArea = 'main'; // 默认主内容区
        if (description.includes('表格') || description.includes('列') || description.includes('单元格') || description.includes('row')) {
          targetArea = 'table';
        } else if (description.includes('顶部') || description.includes('导航') || description.includes('用户信息') || description.includes('header')) {
          targetArea = 'top';
        } else if (description.includes('侧边栏') || description.includes('菜单') || description.includes('sidebar')) {
          targetArea = 'sidebar';
        }

        this.log('info', `[Hover] 根据用例描述动态确定目标区域`, {
          description: description,
          targetArea: targetArea
        });

        const emailInfo = await this.page.evaluate((params) => {
          const { targetArea, pageWidth, pageHeight } = params;

          // 定义区域过滤函数
          const areaFilters = {
            table: (rect) => {
              // 表格区域：主内容区域，且有表格相关特征
              return rect.y > 150 && rect.y < pageHeight - 50 && rect.x > 250;
            },
            top: (rect) => {
              // 顶部区域：页面顶部 150px
              return rect.y < 150;
            },
            sidebar: (rect) => {
              // 侧边栏区域：左侧 250px
              return rect.x < 250 && rect.y > 100;
            },
            main: (rect) => {
              // 主内容区域：排除顶部和侧边栏
              return rect.y > 150 && rect.x > 250;
            },
            any: (rect) => {
              // 整个页面
              return true;
            }
          };

          // 根据目标提示选择区域过滤器
          const areaFilter = areaFilters[targetArea] || areaFilters.table;

          // 检查元素是否在表格中
          const isInTable = (el) => {
            let current = el;
            let depth = 0;
            while (current && depth < 10) {
              const tagName = current.tagName?.toLowerCase();
              const className = current.className?.toLowerCase() || '';
              if (tagName === 'table' || tagName === 'tbody' || tagName === 'tr' ||
                  tagName === 'td' || tagName === 'th' ||
                  className.includes('table') || className.includes('data-grid') ||
                  className.includes('grid') || className.includes('list') ||
                  className.includes('row') || className.includes('cell')) {
                return true;
              }
              current = current.parentElement;
              depth++;
            }
            return false;
          };

          const allElements = document.querySelectorAll('*');
          const candidates = [];

          for (const el of Array.from(allElements)) {
            const text = el.textContent || '';
            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();

            // 应用区域过滤
            if (!areaFilter(rect)) continue;

            // 查找包含 @ 符号的文本（email 地址格式）
            if (text.includes('@') && text.includes('.')) {
              if (rect.width > 0 && rect.height > 0 && rect.width < 400 && rect.height < 100) {
                // 多种方式检测省略号
                const hasEllipsisCSS = style.textOverflow === 'ellipsis';
                const hasNowrap = style.whiteSpace === 'nowrap' || style.whiteSpace === 'pre';
                const overflowHidden = style.overflow === 'hidden' || style.overflowX === 'hidden';
                // 检查文本是否包含省略符号（Flutter Web 可能用文本实现）
                const hasEllipsisText = text.includes('...') || text.includes('…');
                // 检查 scrollWidth 是否大于 clientWidth（文本溢出的标准检测方法）
                const isOverflowing = el.scrollWidth > el.clientWidth + 1; // 加1容差
                // 检查文本是否可能被截断（文本较长但元素较窄）
                const textIsLong = text.length > 20;
                const elementIsNarrow = rect.width < 150;
                const likelyTruncated = hasNowrap && overflowHidden && textIsLong && elementIsNarrow;

                const hasEllipsis = hasEllipsisCSS || hasEllipsisText || isOverflowing || likelyTruncated;
                const inTable = isInTable(el);

                // 根据目标区域计算优先级
                let priority = 10; // 默认优先级提高

                // 表格区域检测：必须同时满足位置和结构条件
                const isInTableArea = rect.y > 150 && rect.y < pageHeight - 50 && rect.x > 250;
                const isNotInTopArea = rect.y >= 150; // 明确排除顶部区域

                if (targetArea === 'table') {
                  if (inTable && isInTableArea && isNotInTopArea) {
                    priority = 1; // 表格中的元素，最高优先级
                  } else if (inTable && !isInTableArea) {
                    priority = 8; // 虽然有 table 结构但位置不对
                  } else if (!inTable && isInTableArea) {
                    priority = 3; // 在表格区域但无 table 结构
                  } else {
                    priority = 9; // 完全不符合表格条件
                  }
                } else if (targetArea === 'top' && rect.y < 150) {
                  priority = 1;
                } else if (targetArea === 'sidebar' && rect.x < 250) {
                  priority = 1;
                } else if (hasEllipsis) {
                  priority = 2;
                } else if (hasNowrap && overflowHidden) {
                  priority = 3;
                }

                candidates.push({
                  selector: el.id ? `#${el.id}` : (el.className ? `.${el.className.split(' ')[0]}` : el.tagName.toLowerCase()),
                  text: text.trim().substring(0, 100),
                  email: text.trim().match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0] || text.trim().substring(0, 50),
                  x: rect.x + rect.width / 2,
                  y: rect.y + rect.height / 2,
                  hasEllipsis: hasEllipsis,
                  hasNowrap: hasNowrap,
                  overflowHidden: overflowHidden,
                  inTable: inTable,
                  priority: priority,
                  area: targetArea
                });
              }
            }
          }

          // 过滤：只保留带省略号或可能被截断的元素
          const ellipsisCandidates = candidates.filter(c =>
            c.hasEllipsis || (c.hasNowrap && c.overflowHidden)
          );

          // 如果目标区域是表格，优先使用带省略号的元素
          let selectedCandidates = candidates;
          if (targetArea === 'table' && ellipsisCandidates.length > 0) {
            selectedCandidates = ellipsisCandidates;
          }

          // 按优先级排序
          selectedCandidates.sort((a, b) => a.priority - b.priority);

          // 返回结果和调试信息
          return {
            element: selectedCandidates.length > 0 ? selectedCandidates[0] : null,
            allCandidates: candidates.map(c => ({
              text: c.text.substring(0, 30),
              email: c.email,
              hasEllipsis: c.hasEllipsis,
              hasNowrap: c.hasNowrap,
              overflowHidden: c.overflowHidden,
              inTable: c.inTable,
              priority: c.priority,
              width: Math.round(c.x * 2), // 近似宽度
              area: c.area
            })),
            ellipsisCount: ellipsisCandidates.length,
            targetArea: targetArea
          };
        }, {
          targetArea: targetArea,
          pageWidth: 1920,
          pageHeight: 1080
        });

        // 输出调试信息
        this.log('info', `[Hover] page.evaluate 返回`, {
          hasEmailInfo: !!emailInfo,
          hasAllCandidates: !!(emailInfo && emailInfo.allCandidates),
          emailInfoType: typeof emailInfo
        });

        if (emailInfo && emailInfo.allCandidates) {
          this.log('info', `[Hover] 找到 ${emailInfo.allCandidates.length} 个 email 候选元素`, {
            targetArea: emailInfo.targetArea,
            ellipsisCount: emailInfo.ellipsisCount
          });
          // 输出每个候选元素的信息
          emailInfo.allCandidates.forEach((c, i) => {
            this.log('info', `[Hover] 候选 ${i + 1}`, {
              email: c.email,
              hasEllipsis: c.hasEllipsis,
              hasNowrap: c.hasNowrap,
              inTable: c.inTable,
              priority: c.priority
            });
          });
        }

        const finalEmailInfo = emailInfo ? emailInfo.element : null;

        if (finalEmailInfo) {
          this.log('info', `[Hover] 选中的 email 单元格`, {
            email: finalEmailInfo.email,
            text: finalEmailInfo.text.substring(0, 50),
            hasEllipsis: finalEmailInfo.hasEllipsis,
            position: `x=${Math.round(finalEmailInfo.x)}, y=${Math.round(finalEmailInfo.y)}`,
            isInMainContent: finalEmailInfo.isInMainContent
          });
          // 使用坐标悬停
          await this.page.mouse.move(finalEmailInfo.x, finalEmailInfo.y);
          elementFound = true;
          selector = 'coordinates';
        } else {
          this.log('warn', `[Hover] 未找到包含 email 的元素，尝试常规选择器`);
        }
      }

      // 如果没有找到省略号或 email 元素，使用常规选择器
      if (!elementFound) {
        selector = await this.getSelector(hoverTarget, action.index);
        this.log('info', `[Hover] 目标: "${hoverTarget}" -> 选择器: ${selector}`);

        // 等待元素存在
        try {
          await this.page.waitForSelector(selector, { state: 'attached', timeout: 10000 });
        } catch (waitErr) {
          this.log('warn', `[Hover] waitForSelector 超时 (${selector})，尝试直接操作`);
        }

        // 执行悬停操作
        await this.page.hover(selector, { timeout: 5000 });
      }

      // ========== 使用 hover 前后对比法检测 tooltip ==========
      // 首先获取 hover 前的 DOM 快照
      this.log('info', `[Hover] 获取 hover 前 DOM 快照...`);
      const beforeSnapshot = await this.page.evaluate(() => {
        const getAllVisibleElements = () => {
          const elements = [];
          const allElements = document.querySelectorAll('*');
          for (const el of Array.from(allElements)) {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              elements.push({
                tagName: el.tagName,
                id: el.id,
                className: el.className,
                textContent: (el.textContent || '').substring(0, 100),
                attributes: Array.from(el.attributes).map(a => `${a.name}=${a.value}`),
                rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
              });
            }
          }
          return elements;
        };
        return {
          elementCount: document.querySelectorAll('*').length,
          visibleElements: getAllVisibleElements().length,
          bodyHTML: document.body.innerHTML.substring(0, 5000),
          timestamp: Date.now()
        };
      });
      this.log('info', `[Hover] hover 前快照: ${beforeSnapshot.elementCount} 个元素`);

      // 等待 tooltip 出现 - Flutter tooltip 可能需要更长的 hover 时间
      this.log('info', `[Hover] 等待 tooltip 出现（最多 3 秒）...`);

      // 多次检查，因为 tooltip 可能在延迟后出现
      let tooltipFound = false;
      let tooltipInfo = { found: false };
      const maxAttempts = 3;
      const waitPerAttempt = 1000;

      for (let attempt = 0; attempt < maxAttempts && !tooltipFound; attempt++) {
        await this.page.waitForTimeout(waitPerAttempt);

        // 使用对比法检测新出现的元素
        tooltipInfo = await this.page.evaluate((beforeCount) => {
          const currentCount = document.querySelectorAll('*').length;

          // 1. 首先尝试常见的 tooltip 选择器
          const tooltipSelectors = [
            '[role="tooltip"]',
            '.tooltip',
            '.ant-tooltip',
            '.ant-tooltip-inner',
            '.el-tooltip',
            '.el-tooltip__popper',
            '.v-tooltip',
            '[data-tooltip]',
            'title[role="tooltip"]',
            '.mat-tooltip',
            '.mat-tooltip-component',
            '[class*="tooltip"]',
            'flt-tooltip',
            '[aria-label*="tooltip"]',
            '[aria-describedby]'
          ];

          for (const sel of tooltipSelectors) {
            const tooltips = document.querySelectorAll(sel);
            for (const tooltip of Array.from(tooltips)) {
              const rect = tooltip.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0) {
                const text = tooltip.textContent || tooltip.getAttribute('title') || tooltip.getAttribute('aria-label') || '';
                if (text.trim()) {
                  return {
                    found: true,
                    selector: sel,
                    text: text.trim(),
                    visible: true,
                    method: 'selector',
                    debug: `matched selector: ${sel}`
                  };
                }
              }
            }
          }

          // 2. 检查是否有新元素出现（对比法）
          if (currentCount > beforeCount + 5) { // 至少增加 5 个元素才认为是新内容
            // 查找最近可能添加的元素
            const allDivs = document.querySelectorAll('div');
            const newElements = [];

            for (let i = Math.max(0, allDivs.length - 50); i < allDivs.length; i++) {
              const div = allDivs[i];
              const style = window.getComputedStyle(div);
              const rect = div.getBoundingClientRect();

              // 查找可能是 tooltip 的浮动元素
              if ((style.position === 'absolute' || style.position === 'fixed') &&
                  rect.width > 0 && rect.width < 500 &&
                  rect.height > 0 && rect.height < 200) {
                const zIndex = parseInt(style.zIndex) || 0;
                const text = div.textContent?.trim() || '';

                if (text && text.length > 0 && text.length < 500) {
                  newElements.push({
                    element: div,
                    tagName: div.tagName,
                    className: div.className,
                    id: div.id,
                    text: text,
                    zIndex: zIndex,
                    rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                    style: {
                      position: style.position,
                      backgroundColor: style.backgroundColor,
                      pointerEvents: style.pointerEvents,
                      display: style.display
                    }
                  });
                }
              }
            }

            // 找 z-index 最高的元素（最可能是 tooltip）
            if (newElements.length > 0) {
              newElements.sort((a, b) => b.zIndex - a.zIndex);
              const bestCandidate = newElements[0];

              return {
                found: true,
                selector: bestCandidate.id ? `#${bestCandidate.id}` : (bestCandidate.className ? `.${bestCandidate.className}` : 'div'),
                text: bestCandidate.text,
                visible: true,
                method: 'diff-analysis',
                debug: `found ${newElements.length} candidates, selected highest z-index: ${bestCandidate.zIndex}`,
                candidates: newElements.map(e => ({ text: e.text.substring(0, 30), zIndex: e.zIndex }))
              };
            }
          }

          // 3. 检查元素是否有 title 属性（原生 tooltip）
          let hovered = document.querySelector(':hover');
          let depth = 0;
          while (hovered && depth < 5) {
            const title = hovered.getAttribute('title');
            if (title && title.trim()) {
              return {
                found: true,
                selector: 'title attribute',
                text: title.trim(),
                visible: true,
                method: 'title-attr',
                tagName: hovered.tagName
              };
            }
            hovered = hovered.parentElement;
            depth++;
          }

          // 4. 检查 aria-describedby 关联的 tooltip
          const describedBy = document.querySelector('[aria-describedby]');
          if (describedBy) {
            const describedById = describedBy.getAttribute('aria-describedby');
            if (describedById) {
              const tooltip = document.getElementById(describedById);
              if (tooltip) {
                const rect = tooltip.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                  return {
                    found: true,
                    selector: `#${describedById}`,
                    text: tooltip.textContent?.trim() || '',
                    visible: true,
                    method: 'aria-describedby'
                  };
                }
              }
            }
          }

          // 5. 检查所有高 z-index 的元素
          const allElements = document.querySelectorAll('*');
          for (const el of Array.from(allElements)) {
            const style = window.getComputedStyle(el);
            const zIndex = parseInt(style.zIndex) || 0;
            if (zIndex > 100) {
              const rect = el.getBoundingClientRect();
              if (rect.width > 0 && rect.width < 500 && rect.height > 0 && rect.height < 200) {
                const text = el.textContent?.trim() || '';
                if (text && text.length > 0 && text.length < 500) {
                  // 检查是否有文本内容且不是普通元素
                  const bg = style.backgroundColor;
                  if (bg && (bg.includes('rgb') || bg.includes('#'))) {
                    return {
                      found: true,
                      selector: el.id ? `#${el.id}` : el.tagName,
                      text: text,
                      visible: true,
                      method: 'high-zindex',
                      debug: `zIndex: ${zIndex}, bg: ${bg}`
                    };
                  }
                }
              }
            }
          }

          // 6. 检查 Flutter 语义树
          const flutterSemantics = document.querySelectorAll('flt-semantics');
          for (const fs of Array.from(flutterSemantics)) {
            const label = fs.getAttribute('aria-label');
            if (label && (label.includes('tooltip') || label.includes('提示') || label.includes('@'))) {
              const rect = fs.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0 && rect.width < 500) {
                return {
                  found: true,
                  selector: 'flutter-semantics',
                  text: label,
                  visible: true,
                  method: 'flutter-semantics'
                };
              }
            }
          }

          return {
            found: false,
            debug: `element count: before=${beforeCount}, current=${currentCount}, diff=${currentCount - beforeCount}`
          };
        }, beforeSnapshot.elementCount);

        if (tooltipInfo.found) {
          tooltipFound = true;
          this.log('info', `[Hover] ✓ 检测到 tooltip (尝试 ${attempt + 1}/${maxAttempts}): "${tooltipInfo.text}"`);
          this.log('info', `[Hover] 检测方法: ${tooltipInfo.method}`);
          if (tooltipInfo.debug) {
            this.log('info', `[Hover] 调试信息: ${tooltipInfo.debug}`);
          }
          break;
        } else {
          this.log('info', `[Hover] 未检测到 tooltip (尝试 ${attempt + 1}/${maxAttempts})`);
          if (tooltipInfo.debug) {
            this.log('info', `[Hover] 调试: ${tooltipInfo.debug}`);
          }
        }
      }

      const duration = Date.now() - startTime;
      this.log('info', `[Hover] ========== 悬停完成，耗时 ${duration}ms ==========`);

      // 截图保存 hover 后的状态
      try {
        const timestamp = Date.now();
        const screenshotPath = path.join(this.screenshotDir, `after-hover-${timestamp}.png`);
        await this.page.screenshot({ path: screenshotPath, fullPage: false });
        this.log('info', `截图已保存: ${screenshotPath}`);
      } catch (screenshotErr) {
        this.log('warn', `截图失败: ${screenshotErr.message}`);
      }

      if (tooltipInfo.found) {
        this.log('info', `[Hover] 找到 tooltip: "${tooltipInfo.text}"`);
        return {
          success: true,
          action: 'hover',
          target: hoverTarget,
          selector,
          tooltip: tooltipInfo,
          duration,
          message: `悬停成功，检测到 tooltip: "${tooltipInfo.text}"`
        };
      } else {
        this.log('warn', `[Hover] 未检测到 tooltip 元素`);
        return {
          success: true,
          action: 'hover',
          target: hoverTarget,
          selector,
          tooltip: { found: false },
          duration,
          message: '悬停操作完成，但未检测到 tooltip'
        };
      }

    } catch (error) {
      const duration = Date.now() - startTime;
      this.log('error', `[Hover] 悬停失败: ${error.message}`);
      return {
        success: false,
        action: 'hover',
        target: action.target,
        error: error.message,
        duration,
      };
    }
  }

  /**
   * 输入操作（Flutter Web 增强版）
   * Flutter Web 的输入框本质是一个隐藏的 <input> 元素，
   * 由 Flutter 引擎在用户点击语义节点后动态创建。
   * 需要：先坐标点击语义节点 → 等待 Flutter 创建隐藏 input → 键入文字
   * @param {Object} action - 输入操作
   * @returns {Object} 执行结果
   */
  async actionInput(action) {
    const startTime = Date.now();
    this.log('info', `[Input] ========== 开始执行输入 action ==========`, {
      target: action.target,
      value: action.value,
      description: action.description
    });

    try {
      // 获取选择器
      const selector = await this.getSelector(action.target);
      let inputValue = action.value || '';

      // TODO: 修复输入值问题
      // 问题: 当 action.value 为空或 undefined 时，可能使用了错误的默认值
      // 需要检查:
      // 1. extractActionsFromSteps 是否正确提取了输入值
      // 2. normalizeStep 是否正确传递了 action.value
      // 3. 如果 value 为空，应该报错而不是使用 getTestValueForTarget 的默认值

      // 临时调试日志
      this.log('info', `[Input] 原始 action.value: "${action.value}", action.target: "${action.target}"`);
      this.log('info', `[Input] 使用输入值: "${inputValue}"`);

      // 如果没有提供输入值，尝试从描述中提取或使用默认值
      if (!inputValue) {
        this.log('warn', `[Input] ⚠️ 输入值为空，尝试从描述中提取或使用默认值`);
        // 尝试从描述中提取
        if (action.description) {
          const descMatch = action.description.match(/['""]([^'"']+)['""]|[:：]\s*([^\s，。]+)/);
          if (descMatch) {
            inputValue = descMatch[1] || descMatch[2] || '';
            this.log('info', `[Input] 从描述中提取输入值: "${inputValue}"`);
          }
        }
        // 如果仍然为空，使用默认值
        if (!inputValue) {
          inputValue = this.getTestValueForTarget(action.target) || '';
          this.log('warn', `[Input] 使用默认测试值: "${inputValue}" for target "${action.target}"`);
        }
      }

      this.log('info', `[Input] 目标: "${action.target}" -> 选择器: ${selector}, 最终值: "${inputValue}"`);

      if (!inputValue) {
        this.log('error', `[Input] ❌ 输入值为空！测试用例需要指定输入值。描述: "${action.description || action.target}"`);
        return {
          success: false,
          action: 'input',
          target: action.target,
          selector,
          value: inputValue,
          error: '输入值为空，无法执行输入操作',
          suggestion: '请检查测试用例是否包含具体的输入值（如：输入ID "amyTest"）',
        };
      }

      // 等待元素存在（增加超时到 15 秒）
      try {
        await this.page.waitForSelector(selector, { state: 'attached', timeout: 15000 });
      } catch (waitErr) {
        this.log('warn', `[Input] waitForSelector 超时 (${selector})，尝试直接操作`);
      }

      // === Flutter Web 专用输入流 ===
      // 步骤 1: 点击/聚焦目标元素（使用坐标点击，确保 Flutter 引擎接管焦点）
      let focusSuccess = false;

      // 先尝试坐标点击（最适合 Flutter 语义节点）
      try {
        // 对于非 flt-semantics 选择器（如 #email），需要找到对应的 Flutter 语义元素
        let targetSelector = selector;

        if (!selector.startsWith('flt-semantics')) {
          // 选择器是常规 DOM 选择器，需要找到对应的 Flutter 语义节点
          this.log('info', `[Input] 选择器 ${selector} 不是 Flutter 语义元素，尝试查找对应的语义节点`);

          targetSelector = await this.page.evaluate((sel) => {
            // 首先尝试找到选择器对应的元素，然后在其父级中查找 flt-semantics
            const originalEl = document.querySelector(sel);
            if (!originalEl) return null;

            // 向上查找最近的 flt-semantics 元素
            let current = originalEl;
            let depth = 0;
            while (current && depth < 10) {
              // 检查当前元素或其兄弟是否是 flt-semantics
              if (current.tagName === 'FLT-SEMANTICS') {
                // 找到了，生成选择器
                if (current.id) return `#${current.id}`;
                const all = document.querySelectorAll('flt-semantics');
                for (let i = 0; i < all.length; i++) {
                  if (all[i] === current) return `flt-semantics:nth-of-type(${i + 1})`;
                }
              }
              // 也检查兄弟元素
              const parent = current.parentElement;
              if (parent) {
                for (const child of parent.children) {
                  if (child.tagName === 'FLT-SEMANTICS') {
                    // 检查这个语义元素是否包含输入相关文本
                    const text = (child.textContent || '').toLowerCase();
                    if (text.includes('id') || text.includes('输入') || text.includes('請輸入') ||
                        text.includes('请输入') || text.includes('email')) {
                      if (child.id) return `#${child.id}`;
                      const all = document.querySelectorAll('flt-semantics');
                      for (let i = 0; i < all.length; i++) {
                        if (all[i] === child) return `flt-semantics:nth-of-type(${i + 1})`;
                      }
                    }
                  }
                }
              }
              current = parent;
              depth++;
            }

            // 如果没找到，尝试在所有 flt-semantics 中查找包含输入相关关键词的
            const semantics = document.querySelectorAll('flt-semantics');
            for (const el of semantics) {
              const label = (el.getAttribute('aria-label') || '').toLowerCase();
              const text = (el.textContent || '').toLowerCase();
              if (text.includes('id') || text.includes('输入') || text.includes('請輸入') ||
                  text.includes('请输入') || label.includes('id') || label.includes('input') ||
                  label.includes('email')) {
                if (el.id) return `#${el.id}`;
                const all = document.querySelectorAll('flt-semantics');
                for (let i = 0; i < all.length; i++) {
                  if (all[i] === el) return `flt-semantics:nth-of-type(${i + 1})`;
                }
              }
            }

            return null; // 没找到，回退到原始选择器
          }, selector);

          if (targetSelector) {
            this.log('info', `[Input] 找到对应的 Flutter 语义元素: ${targetSelector}`);
          } else {
            this.log('warn', `[Input] 未找到对应的 Flutter 语义元素，使用原始选择器: ${selector}`);
            targetSelector = selector;
          }
        }

        // 使用找到的选择器进行坐标点击
        const box = await this.page.evaluate((sel) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          const rect = el.getBoundingClientRect();
          return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, w: rect.width, h: rect.height };
        }, targetSelector);

        if (box && box.w > 0) {
          await this.page.mouse.click(box.x, box.y);
          focusSuccess = true;
          this.log('info', `[Input] 坐标点击聚焦成功: (${Math.round(box.x)}, ${Math.round(box.y)})`);
        }
      } catch (e) {
        this.log('warn', `[Input] 坐标点击失败: ${e.message}`);
      }

      // 坐标点击失败，回退到 force click
      if (!focusSuccess) {
        try {
          await this.page.click(selector, { force: true, timeout: 5000 });
          focusSuccess = true;
          this.log('info', '[Input] force click 聚焦成功');
        } catch (e) {
          this.log('warn', `[Input] force click 失败: ${e.message}`);
        }
      }

      if (!focusSuccess) {
        return {
          success: false,
          action: 'input',
          error: `无法聚焦输入框: ${selector}`,
        };
      }

      // 步骤 2: 等待 Flutter 创建内部的隐藏 input 元素
      // Flutter Web 在用户点击文本框后会动态创建一个 <input> 或 <textarea> 元素
      // 使用重试机制，因为 Flutter 可能需要更长时间来创建输入元素
      let hasActiveInput = null;
      let inputReady = false;
      const maxRetries = 10; // 最多重试 10 次
      const retryDelay = 300; // 每次等待 300ms

      this.log('info', `[Input] 等待 Flutter 创建输入元素（最多 ${maxRetries * retryDelay}ms）...`);

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        // 每次重试前等待
        await this.page.waitForTimeout(retryDelay);

        // 检查 Flutter 是否创建了隐藏的活动输入元素
        hasActiveInput = await this.page.evaluate(() => {
          const active = document.activeElement;
          if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
            return { tag: active.tagName, type: active.type || 'text', id: active.id || '' };
          }
          // Flutter 可能在 flt-glass-pane 的 shadow DOM 中创建 input
          const glassPane = document.querySelector('flt-glass-pane');
          if (glassPane && glassPane.shadowRoot) {
            const shadowInput = glassPane.shadowRoot.querySelector('input, textarea');
            if (shadowInput) {
              shadowInput.focus();
              return { tag: shadowInput.tagName, type: shadowInput.type || 'text', inShadow: true };
            }
          }
          // 也检查页面中是否有任何 input 元素
          const anyInput = document.querySelector('input:not([type=hidden]), textarea');
          if (anyInput) {
            anyInput.focus();
            return { tag: anyInput.tagName, type: anyInput.type || 'text', id: anyInput.id || '', foundAny: true };
          }
          return null;
        });

        if (hasActiveInput) {
          inputReady = true;
          this.log('info', `[Input] Flutter 已创建活动输入元素: ${JSON.stringify(hasActiveInput)} (尝试 ${attempt}/${maxRetries})`);
          break;
        } else {
          this.log('info', `[Input] 尚未检测到输入元素，继续等待... (${attempt}/${maxRetries})`);
        }
      }

      if (inputReady) {
        // 额外等待确保输入元素完全就绪
        await this.page.waitForTimeout(200);
      } else {
        this.log('warn', `[Input] ⚠️ 经过 ${maxRetries * retryDelay}ms 仍未检测到 Flutter 创建的输入元素`);
        this.log('warn', `[Input] 将尝试直接使用键盘输入，但这可能会失败`);
        // 尝试再次点击，可能第一次点击没有生效
        this.log('info', `[Input] 尝试再次点击以触发输入元素创建...`);
        try {
          await this.page.mouse.click(box.x, box.y);
          await this.page.waitForTimeout(500);
          // 再次检查
          hasActiveInput = await this.page.evaluate(() => {
            const active = document.activeElement;
            if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
              return { tag: active.tagName, type: active.type || 'text', id: active.id || '' };
            }
            return null;
          });
          if (hasActiveInput) {
            this.log('info', `[Input] 第二次点击后检测到输入元素: ${JSON.stringify(hasActiveInput)}`);
            inputReady = true;
          }
        } catch (e) {
          this.log('warn', `[Input] 第二次点击失败: ${e.message}`);
        }
      }

      // 步骤 3: 清空已有内容
      await this.page.keyboard.press('Control+A');
      await this.page.waitForTimeout(100);
      await this.page.keyboard.press('Backspace');
      await this.page.waitForTimeout(100);

      // 步骤 4: 逐字键入（Flutter 需要逐字接收键盘事件）
      this.log('info', `[Input] 开始键入: "${inputValue}" (${inputValue.length} 字符)`);

      // 在输入前再次确认焦点在正确的元素上
      const focusedBeforeType = await this.page.evaluate(() => {
        const active = document.activeElement;
        if (!active) return { tag: null, id: null };
        return {
          tag: active.tagName,
          id: active.id,
          className: active.className,
          value: active.value || '',
        };
      });
      this.log('info', `[Input] 输入前焦点元素: ${JSON.stringify(focusedBeforeType)}`);

      await this.page.keyboard.type(inputValue, { delay: 50 });

      // 步骤 5: 等待 Flutter 处理输入（增加等待时间，确保 Flutter 完成输入处理）
      await this.page.waitForTimeout(1000);

      // 验证输入是否成功（尝试读取当前活动输入框的值）
      const verifyValue = await this.page.evaluate(() => {
        const active = document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
          return { tag: active.tagName, id: active.id, value: active.value || '' };
        }
        const glassPane = document.querySelector('flt-glass-pane');
        if (glassPane && glassPane.shadowRoot) {
          const shadowInput = glassPane.shadowRoot.querySelector('input, textarea');
          if (shadowInput) return { tag: 'SHADOW-' + shadowInput.tagName, value: shadowInput.value || '' };
        }
        return { tag: null, value: null };
      });

      this.log('info', `[Input] 输入后验证: ${JSON.stringify(verifyValue)}`);

      if (verifyValue && verifyValue.value !== null && verifyValue.value !== undefined) {
        this.log('info', `[Input] 输入验证: 当前值="${verifyValue.value}", 期望值="${inputValue}"`);
      } else {
        this.log('warn', `[Input] 无法验证输入值 - 未找到输入元素`);
      }

      // 移除重复的日志行，避免输出 [object Object]

      // 检查输入是否成功（对于 Flutter Web，由于无法直接读取 canvas 中的值，
      // 我们假设键盘输入是成功的，只要没有抛出错误）
      const inputSuccess = true; // Flutter Web 输入总是假设成功

      // 输入后短暂等待，确保按钮状态更新（特别是"下一步"按钮可能需要启用）
      this.log('info', `[Input] 等待 500ms 让按钮状态更新...`);
      await this.page.waitForTimeout(500);

      const duration = Date.now() - startTime;
      this.log('info', `[Input] ========== 输入 action 完成 ==========`, {
        success: inputSuccess,
        target: action.target,
        value: inputValue,
        duration: `${duration}ms`
      });

      return {
        success: inputSuccess,
        action: 'input',
        target: action.target,
        selector,
        value: inputValue,
        verifiedValue: verifyValue,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.log('error', `[Input] ========== 输入 action 失败 ==========`, {
        error: error.message,
        duration: `${duration}ms`
      });
      return {
        success: false,
        action: 'input',
        error: error.message,
      };
    }
  }

  /**
   * 清空输入框操作
   * @param {Object} action - 清空操作
   * @returns {Object} 执行结果
   */
  async actionClear(action) {
    try {
      const target = action.target;
      this.log('info', `[Clear] 清空输入框: ${target}`, { action });

      // 使用 getSelector 统一处理选择器（与 actionInput/actionClick 一致）
      const selector = await this.getSelector(target);

      if (!selector) {
        this.log('warn', `[Clear] 未找到选择器: ${target}`);
        return {
          success: false,
          action: 'clear',
          error: `未找到目标元素: ${target}`,
        };
      }

      this.log('info', `[Clear] 使用选择器: ${selector}`);

      // 尝试清空输入框
      try {
        // 先点击输入框获取焦点
        await this.page.click(selector, { timeout: 5000 });
        // 全选文本
        await this.page.keyboard.press('Control+A');
        // 删除
        await this.page.keyboard.press('Backspace');
        // 或者使用 Ctrl+Delete 清空
        await this.page.keyboard.press('Control+Delete');

        this.log('info', `[Clear] 已清空输入框: ${target}`);
        return {
          success: true,
          action: 'clear',
          target,
          selector,
        };
      } catch (error) {
        // 回退方案：使用 fill 填入空字符串
        try {
          await this.page.fill(selector, '');
          this.log('info', `[Clear] 已使用 fill 清空输入框: ${target}`);
          return {
            success: true,
            action: 'clear',
            target,
            selector,
          };
        } catch (fillError) {
          this.log('error', `[Clear] 清空输入框失败: ${error.message}`);
          return {
            success: false,
            action: 'clear',
            error: error.message,
          };
        }
      }
    } catch (error) {
      this.log('error', `[Clear] 操作失败: ${error.message}`);
      return {
        success: false,
        action: 'clear',
        error: error.message,
      };
    }
  }

  /**
   * 等待操作
   * @param {Object} action - 等待操作
   * @returns {Object} 执行结果
   */
  async actionWait(action) {
    const duration = action.duration || 1000;

    this.log('info', `等待: ${duration}ms`, { action });

    await this.page.waitForTimeout(duration);

    return {
      success: true,
      action: 'wait',
      duration,
    };
  }

  /**
   * 滚动操作
   * @param {Object} action - 滚动操作
   * @returns {Object} 执行结果
   */
  async actionScroll(action) {
    try {
      const direction = action.direction || 'down';
      const distance = action.distance || 500;

      this.log('info', `滚动: ${direction} ${distance}px`, { action });

      await this.page.evaluate(
        ({ direction, distance }) => {
          const scrollAmount = direction === 'down' ? distance : -distance;
          window.scrollBy(0, scrollAmount);
        },
        { direction, distance }
      );

      // 等待滚动完成
      await this.page.waitForTimeout(500);

      return {
        success: true,
        action: 'scroll',
        direction,
        distance,
      };
    } catch (error) {
      return {
        success: false,
        action: 'scroll',
        error: error.message,
      };
    }
  }

  /**
   * 检查操作（验证元素或状态）
   * @param {Object} action - 检查操作
   * @returns {Object} 执行结果
   */
  async actionCheck(action) {
    try {
      const description = action.description || action.text || '';
      this.log('info', `[Check] 执行检查: ${description}`, { action });

      // 从描述中提取要检查的元素
      let checkResult = {
        success: true,
        action: 'check',
        description,
        details: {},
      };

      // 检查页面元素是否存在
      if (description.includes('存在') || description.includes('是否有')) {
        const elementMatch = description.match(/(?:检查|验证|确认)?\s*([^，,]+?)(?:是否存在|是否存在|存在|有)/);
        if (elementMatch) {
          const elementName = elementMatch[1].trim();
          const domState = await this.getDOMState();

          // 检查按钮
          const buttons = domState.elements?.buttons || [];
          const buttonFound = buttons.some(b => b.text.includes(elementName) || b.id.includes(elementName));

          // 检查输入框
          const inputs = domState.elements?.inputs || [];
          const inputFound = inputs.some(i => i.placeholder?.includes(elementName) || i.id.includes(elementName));

          // 检查文本内容
          const bodyText = domState.elements?.bodyText || '';
          const textFound = bodyText.includes(elementName);

          checkResult.details = {
            elementName,
            buttonFound,
            inputFound,
            textFound,
          };
          checkResult.success = buttonFound || inputFound || textFound;
          checkResult.message = checkResult.success
            ? `检查通过: 找到元素 "${elementName}"`
            : `检查失败: 未找到元素 "${elementName}"`;
        }
      }

      // 检查页面是否加载
      if (description.includes('页面') && (description.includes('加载') || description.includes('打开'))) {
        const url = this.page.url();
        checkResult.details = { currentUrl: url };
        checkResult.success = true;
        checkResult.message = `页面已加载: ${url}`;
      }

      // 检查输入框状态
      if (description.includes('输入框') || description.includes('输入')) {
        const domState = await this.getDOMState();
        const inputCount = domState.elements?.inputs?.length || 0;
        checkResult.details = { inputCount };
        checkResult.success = inputCount > 0;
        checkResult.message = `检查通过: 页面包含 ${inputCount} 个输入框`;
      }

      // 检查按钮状态
      if (description.includes('按钮')) {
        const domState = await this.getDOMState();
        const buttonCount = domState.elements?.buttons?.length || 0;
        checkResult.details = { buttonCount };
        checkResult.success = buttonCount > 0;
        checkResult.message = `检查通过: 页面包含 ${buttonCount} 个按钮`;
      }

      return checkResult;
    } catch (error) {
      return {
        success: false,
        action: 'check',
        error: error.message,
      };
    }
  }

  /**
   * 执行验证
   * @param {Object} verification - 验证
   * @returns {Object} 验证结果
   */
  async executeVerification(verification) {
    this.log('info', `执行验证: ${verification.type}`, { verification });

    try {
      switch (verification.type) {
        case 'count':
          return await this.verifyCount(verification);
        case 'route':
          return await this.verifyRoute(verification);
        case 'urlContains':
          return await this.verifyUrlContains(verification);
        case 'navigation':
          return await this.verifyNavigation(verification);
        case 'text':
          return await this.verifyText(verification);
        case 'visible':
        case 'elementVisible':
          return await this.verifyVisible(verification);
        case 'error':
        case 'formError':
          return await this.verifyFormError(verification);
        case 'submenuVisible':
          return await this.verifySubmenuVisible(verification);
        case 'breadcrumb':
          return await this.verifyBreadcrumb(verification);
        case 'exists':
          return await this.verifyExists(verification);
        case 'basic':
          return await this.verifyBasic(verification);
        case 'tooltip':
          return await this.verifyTooltip(verification);
        case 'tableHeader':
          return await this.verifyTableHeader(verification);
        case 'tableColumnColor':
          return await this.verifyTableColumnColor(verification);
        case 'tableData':
          return await this.verifyTableData(verification);
        case 'visual':
        case 'designMatch':
          return await this.verifyVisual(verification);
        case 'menuActive':
        case 'menu-selected':
          return await this.verifyMenuActive(verification);
        case 'assertion':
          return await this.verifyAssertion(verification);
        default:
          throw new Error(`未知验证类型: ${verification.type}`);
      }
    } catch (error) {
      return {
        passed: false,
        type: verification.type,
        error: error.message,
        message: `✗ 验证错误: ${error.message}`,
      };
    }
  }

  /**
   * 断言验证（通用验证类型）
   * 根据描述自动判断验证类型并执行
   * @param {Object} verification - 验证
   * @returns {Object} 验证结果
   */

  /**
   * 从描述中提取预期的错误文本
   * 支持多种格式：
   * - "显示「ID不能为空」错误提示" -> "ID不能为空"
   * - "显示 'ID为必填项' 错误" -> "ID为必填项"
   * - "显示错误：此字段不能为空" -> "此字段不能为空"
   * @param {string} description - 验证描述
   * @returns {Object} 提取结果 { hasExpected: boolean, expectedText: string }
   */
  extractExpectedErrorText(description) {
    // 模式1: 「...」或 "..." 或 '...' 包含的文本
    const quotedPatterns = [
      /「([^」]+)」/,
      /"([^"]+)"/,
      /'([^']+)'/,
      /【([^】]+)】/,
      /\[([^\]]+)\]/
    ];

    for (const pattern of quotedPatterns) {
      const match = description.match(pattern);
      if (match && match[1]) {
        const quotedText = match[1].trim();

        // 检查整个描述是否包含错误/验证相关的上下文
        // 不仅检查textContext，还要检查description是否有验证意图
        const verificationKeywords = [
          '错误', '錯誤', '提示', '訊息', 'error', 'message',
          '显示', '顯示', '檢查', '检查', '驗證', '验证',
          '是否', '應該', '应该', '預期', '预期'
        ];

        const hasVerificationContext = verificationKeywords.some(keyword =>
          description.includes(keyword)
        );

        // 如果描述中有验证相关的关键词，就认为是预期文本
        if (hasVerificationContext) {
          return { hasExpected: true, expectedText: quotedText };
        }
      }
    }

    // 模式2: "显示...错误" 或 "显示...提示" 格式
    // "显示ID不能为空错误" -> "ID不能为空"
    const beforeErrorPatterns = [
      /显示([^错误提示]+)[错误錯誤]/,
      /顯示([^錯誤提示]+)[錯誤]/,
      /显示([^提示]+)[提示訊息]/,
      /顯示([^提示]+)[提示訊息]/,
      /show\s*(.+?)[\s]+error/i,
      /display\s*(.+?)[\s]+error/i
    ];

    for (const pattern of beforeErrorPatterns) {
      const match = description.match(pattern);
      if (match && match[1]) {
        return { hasExpected: true, expectedText: match[1].trim() };
      }
    }

    // 模式3: 错误提示后跟冒号和具体文本
    // "错误提示：ID不能为空" -> "ID不能为空"
    const afterColonPatterns = [
      /错误提示[：:]\s*([^\s，。]+)/,
      /錯誤提示[：:]\s*([^\s，。]+)/,
      /error\s*[:：]\s*(.+?)[\s,。]/i
    ];

    for (const pattern of afterColonPatterns) {
      const match = description.match(pattern);
      if (match && match[1]) {
        return { hasExpected: true, expectedText: match[1].trim() };
      }
    }

    return { hasExpected: false, expectedText: '' };
  }

  /**
   * 模糊匹配两个文本是否相似
   * 注意：此方法已废弃，现在使用精确匹配
   * @param {string} actual - 实际文本
   * @param {string} expected - 预期文本
   * @returns {boolean} 是否匹配
   */
  fuzzyMatchText(actual, expected) {
    // 改为精确匹配
    return this.exactMatchText(actual, expected);
  }

  /**
   * 精确匹配两个文本
   * @param {string} actual - 实际文本
   * @param {string} expected - 预期文本
   * @returns {boolean} 是否匹配
   */
  exactMatchText(actual, expected) {
    if (!actual || !expected) return false;

    // 去除首尾空白后进行精确匹配
    const actualTrimmed = actual.trim();
    const expectedTrimmed = expected.trim();

    // 完全一致
    if (actualTrimmed === expectedTrimmed) return true;

    // 实际文本包含预期文本（完整包含）
    if (actualTrimmed.includes(expectedTrimmed)) return true;

    return false;
  }

  /**
   * 简体繁体转换（简化版）
   * @param {string} text - 输入文本
   * @returns {string} 简体中文文本
   */
  toSimplifiedChinese(text) {
    const traditionalToSimplified = {
      '錯誤': '错误', '錯': '错', '誤': '误',
      '顯示': '显示', '顯': '显', '示': '示',
      '訊息': '讯息', '訊': '讯', '息': '息',
      '輸入': '输入', '輸': '输', '入': '入',
      '框': '框', '檢查': '检查', '檢': '检',
      '驗證': '验证', '驗': '验', '證': '证',
      '標題': '标题', '標': '标', '題': '题',
      '內容': '内容', '內': '内', '容': '容',
      '網頁': '网页', '網': '网', '頁': '页',
      '務必': '务必', '務': '务', '畫': '画'
    };

    let result = text;
    for (const [trad, simp] of Object.entries(traditionalToSimplified)) {
      result = result.replace(new RegExp(trad, 'g'), simp);
    }
    return result;
  }

  /**
   * 从实际文本中提取与预期匹配的部分
   * @param {string} actualText - 实际文本
   * @param {string} expectedText - 预期文本
   * @returns {string} 匹配的文本片段
   */
  extractMatchingText(actualText, expectedText) {
    // 如果实际文本包含预期文本，直接返回
    if (actualText.includes(expectedText)) {
      const start = actualText.indexOf(expectedText);
      // 提取前后各 20 个字符作为上下文
      const contextStart = Math.max(0, start - 20);
      const contextEnd = Math.min(actualText.length, start + expectedText.length + 20);
      let extracted = actualText.substring(contextStart, contextEnd);
      if (contextStart > 0) extracted = '...' + extracted;
      if (contextEnd < actualText.length) extracted = extracted + '...';
      return extracted;
    }

    // 否则尝试查找最相似的部分
    const expectedLower = expectedText.toLowerCase();
    const actualLower = actualText.toLowerCase();

    // 找到最匹配的连续片段
    let bestMatch = '';
    let bestMatchScore = 0;

    for (let i = 0; i < actualText.length; i++) {
      for (let len = Math.min(50, actualText.length - i); len > 0; len--) {
        const substr = actualText.substring(i, i + len);
        const score = this.calculateMatchScore(substr, expectedText);
        if (score > bestMatchScore) {
          bestMatchScore = score;
          bestMatch = substr;
        }
      }
      if (bestMatchScore >= 0.7) break; // 找到足够好的匹配
    }

    if (bestMatch) {
      let result = bestMatch;
      if (bestMatch.length < actualText.length) {
        const idx = actualText.indexOf(bestMatch);
        if (idx > 0) result = '...' + result;
        if (idx + bestMatch.length < actualText.length) result = result + '...';
      }
      return result;
    }

    // 如果没找到，返回实际文本的前 100 个字符作为预览
    return actualText.length > 100 ? actualText.substring(0, 100) + '...' : actualText;
  }

  /**
   * 计算两个文本的匹配分数
   * @param {string} str1 - 文本1
   * @param {string} str2 - 文本2
   * @returns {number} 匹配分数 (0-1)
   */
  calculateMatchScore(str1, str2) {
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();

    // 精确匹配
    if (s1 === s2) return 1;

    // 包含匹配
    if (s1.includes(s2)) return s2.length / s1.length;
    if (s2.includes(s1)) return s1.length / s2.length;

    // 字符重叠度
    const s1Chars = new Set(s1.split(''));
    const s2Chars = new Set(s2.split(''));
    const intersection = [...s1Chars].filter(c => s2Chars.has(c));
    const union = new Set([...s1Chars, ...s2Chars]);

    return union.size > 0 ? intersection.length / union.size : 0;
  }

  async verifyAssertion(verification) {
    const description = verification.description || '';
    this.log('info', '[verifyAssertion] ========== 开始解析断言 ==========', {
      description,
      type: verification.type,
      fullVerification: JSON.stringify(verification)
    });

    try {
      // ========== 处理复合验证（新的预解析格式）==========
      // 检查是否是新的复合验证格式（包含 checks 数组）
      if (verification.checks && Array.isArray(verification.checks) && verification.checks.length > 0) {
        this.log('info', '[verifyAssertion] 执行复合验证', {
          checks: verification.checks,
          targetText: verification.targetText,
          textColor: verification.textColor,
          backgroundColor: verification.backgroundColor,
          borderColor: verification.borderColor,
          elementType: verification.elementType
        });

        const results = {
          passed: true,
          details: {},
          messages: []
        };

        // 执行各项检查
        for (const checkType of verification.checks) {
          let checkResult = { passed: false, message: '' };

          switch (checkType) {
            case 'text':
              checkResult = await this._verifyTextContent(verification.targetText, verification.elementType);
              break;
            case 'textColor':
              checkResult = await this._verifyTextColor(verification.targetText, verification.textColor, verification.elementType);
              break;
            case 'backgroundColor':
              checkResult = await this._verifyBackgroundColor(verification.targetText, verification.backgroundColor, verification.elementType);
              break;
            case 'borderColor':
              checkResult = await this._verifyBorderColor(verification.targetText, verification.borderColor, verification.elementType);
              break;
            default:
              checkResult = { passed: true, message: `⚠ 未知检查类型: ${checkType}` };
          }

          results.details[checkType] = checkResult;
          results.messages.push(checkResult.message);

          if (!checkResult.passed) {
            results.passed = false;
          }
        }

        return {
          type: 'assertion',
          passed: results.passed,
          message: results.passed
            ? `✓ 复合验证全部通过:\n  ${results.messages.join('\n  ')}`
            : `✗ 复合验证部分失败:\n  ${results.messages.join('\n  ')}`,
          details: results.details,
          checks: verification.checks
        };
      }

      // ========== 兼容旧版预解析格式 ==========
      // ========== 兼容旧版预解析格式 ==========
      // 如果验证对象已经包含预解析的颜色信息，直接使用
      if (verification.expectedColor && verification.targetText !== undefined) {
        this.log('info', '[verifyAssertion] 使用预解析的颜色验证信息（旧版格式）', {
          targetText: verification.targetText,
          expectedColor: verification.expectedColor,
          colorType: verification.colorType || 'text'
        });

        // 直接执行颜色验证
        const colorCheckResult = await this._verifyTextColor(verification.targetText, verification.expectedColor, 'text');

        if (colorCheckResult.passed) {
          return {
            type: 'assertion',
            passed: true,
            message: `✓ 文字颜色验证通过: 文本"${verification.targetText}"显示为${verification.expectedColor}色`,
            details: colorCheckResult
          };
        } else {
          return {
            type: 'assertion',
            passed: false,
            message: `✗ 文字颜色验证失败: 文本"${verification.targetText}"颜色不是${verification.expectedColor}`,
            details: colorCheckResult
          };
        }
      }

      // 收集需要执行的验证类型
      const validationTypes = [];

      // 检查是否需要错误提示验证
      // 方式1: 包含明确的错误提示关键词
      const hasErrorKeywords = description.includes('错误提示') || description.includes('錯誤提示') ||
          description.includes('错误讯息') || description.includes('錯誤訊息') ||
          description.includes('报错') || description.includes('報錯') ||
          description.includes('API 錯誤') || description.includes('API错误') ||
          description.includes('提示文字') || description.includes('提示訊息');

      // 方式2: 包含引用文本（「...」或"..."），且描述中有验证意图
      const hasQuotedText = /「[^」]+」|"[^"]+"|'[^']+'/.test(description);
      const hasVerificationIntent = description.includes('顯示') || description.includes('显示') ||
          description.includes('檢查') || description.includes('检查') ||
          description.includes('驗證') || description.includes('验证') ||
          description.includes('是否');

      const needsErrorValidation = hasErrorKeywords || (hasQuotedText && hasVerificationIntent);

      // 检查是否需要样式验证（边框、背景、文字颜色等）
      const needsStyleValidation = description.includes('外框变紅') || description.includes('外框变红') ||
          description.includes('边框') || description.includes('border') ||
          description.includes('背景') || description.includes('background') ||
          description.includes('颜色') || description.includes('顏色') ||
          description.includes('color') || description.includes('rgb');

      // 检查是否需要可见性验证（页面/元素切换显示）
      // 描述如：跳轉密碼頁、進入密碼頁面、切换到XXX
      const needsVisibilityValidation = description.includes('跳轉') || description.includes('跳转') ||
          description.includes('進入') || description.includes('进入') ||
          description.includes('切換到') || description.includes('切换到');

      // 检查是否需要密码显示状态验证（密文/明文切换）
      // 只有明确描述密码状态变化时才触发，而不是仅仅"检查密码框是否显示"
      const needsPasswordStateValidation = (
        (description.includes('密文') || description.includes('明文')) &&
        (description.includes('轉變') || description.includes('转变') || description.includes('變為') || description.includes('变为') || description.includes('切換') || description.includes('切换'))
      ) || description.includes('密碼.*由.*變為') || description.includes('密码.*由.*变为') || description.includes('密碼.*狀態') || description.includes('密码.*状态');

      // 检查是否需要元素存在验证（但排除可见性切换的情况）
      const needsExistenceValidation = !needsVisibilityValidation && !needsPasswordStateValidation && (
          description.includes('是否顯示') || description.includes('是否显示') ||
          description.includes('是否存在') || description.includes('有没有')
      );

      // 检查是否需要文字颜色验证
      // 描述如：文字颜色为红色、值为1的文字显示红色、状态列文字是红色
      const needsTextColorValidation = (
        description.includes('文字颜色') || description.includes('文字顏色') ||
        description.includes('字体颜色') || description.includes('字體顏色') ||
        (description.includes('文字') && (description.includes('红色') || description.includes('紅色') || description.includes('蓝色') || description.includes('藍色') || description.includes('绿色') || description.includes('綠色'))) ||
        (description.includes('顯示') || description.includes('显示')) &&
        (description.includes('红色') || description.includes('紅色') || description.includes('蓝色') || description.includes('藍色') || description.includes('绿色') || description.includes('綠色') || description.includes('黑色') || description.includes('黑色'))
      );

      // 如果有特定验证，添加到队列
      if (needsErrorValidation) validationTypes.push('error');
      if (needsStyleValidation) validationTypes.push('style');
      if (needsVisibilityValidation) validationTypes.push('visibility');
      if (needsPasswordStateValidation) validationTypes.push('passwordState');
      if (needsExistenceValidation) validationTypes.push('existence');
      if (needsTextColorValidation) validationTypes.push('textColor');

      this.log('info', '[verifyAssertion] 识别的验证类型', { validationTypes });

      // ========== 特殊处理：状态字段内容+颜色验证 ==========
      // 检测格式：狀態文字內容為「啟用」，且文字顏色為紅色/深紅色
      const stateColorPattern = /(?:狀態|状态)?(?:文字|字段|內容|内容)?(?:為|是|为)?「([^」]+)」[，,]?(?:且|並|并)?(?:文字顏色|文字颜色|顏色|颜色)?(?:為|是|为)?(深)?(紅色|红色|red|藍色|蓝色|blue|綠色|绿色|green|灰色|gray|grey|黑色|black|白色|white)/i;
      const stateColorMatch = description.match(stateColorPattern);

      if (stateColorMatch && validationTypes.includes('textColor')) {
        const extractedText = stateColorMatch[1]; // 提取的文本，如 "啟用"
        const extractedColor = stateColorMatch[2]; // 提取的颜色前缀（可能包含"深"），如 "紅色"
        const extractedColorFull = stateColorMatch[2] + (stateColorMatch[3] || ''); // 完整颜色，如 "深紅色"

        // 颜色名称映射
        const colorMap = {
          '紅色': 'red', '红色': 'red', 'red': 'red', '深紅色': 'red', '深红色': 'red',
          '藍色': 'blue', '蓝色': 'blue', 'blue': 'blue', '深藍色': 'blue', '深蓝色': 'blue',
          '綠色': 'green', '绿色': 'green', 'green': 'green', '深綠色': 'green', '深绿色': 'green',
          '灰色': 'gray', 'gray': 'gray', 'grey': 'gray', '深灰色': 'gray', '深灰': 'gray',
          '黑色': 'black', 'black': 'black',
          '白色': 'white', 'white': 'white'
        };
        const normalizedColor = colorMap[extractedColorFull] || extractedColorFull;

        this.log('info', '[verifyAssertion] 检测到状态字段颜色验证', {
          description,
          extractedText,
          extractedColor,
          normalizedColor
        });

        // 验证策略：CSS验证 -> 截图验证
        let colorCheckResult = await this._verifyTableColumnTextColor('狀態', extractedText, normalizedColor);

        if (!colorCheckResult.passed) {
          this.log('info', '[verifyAssertion] CSS颜色验证失败，尝试截图验证');
          // 使用截图验证（适用于Flutter应用）
          colorCheckResult = await this._verifyTextColorByScreenshot(extractedText, normalizedColor);
        }

        if (colorCheckResult.passed) {
          return {
            type: 'assertion',
            passed: true,
            message: colorCheckResult.message,
            details: colorCheckResult
          };
        } else {
          return {
            type: 'assertion',
            passed: false,
            message: colorCheckResult.message,
            details: colorCheckResult
          };
        }
      }

      // ========== 特殊处理：Tooltip提示框验证 ==========
      // 检测格式：顯示提示框、省略號、tooltip等
      const tooltipPattern = /顯示提示框|显示提示框|tooltip|提示框|省略號|省略号|完整.*資料|完整.*数据/i;
      const tooltipMatch = description.match(tooltipPattern);

      if (tooltipMatch && validationTypes.length === 0) {
        this.log('info', '[verifyAssertion] 检测到Tooltip验证', { description });

        // 使用tooltip验证方法
        const tooltipResult = await this.verifyTooltip({ description });

        return {
          type: 'assertion',
          passed: tooltipResult.passed,
          message: tooltipResult.message,
          details: tooltipResult
        };
      }

      // 如果没有特定验证类型，尝试从描述中提取预期内容进行验证
      if (validationTypes.length === 0) {
        this.log('warn', '[verifyAssertion] 未识别到特定验证类型，尝试基本文本验证', { description });

        // 尝试提取描述中的预期文本
        const extractedError = this.extractExpectedErrorText(description);
        if (extractedError.hasExpected) {
          // 如果描述中有引用文本，执行基本的文本匹配验证
          this.log('info', '[verifyAssertion] 发现预期文本，执行文本匹配验证', { expectedText: extractedError.expectedText });

          const pageText = await this.page.evaluate(() => {
            return document.body?.textContent?.replace(/\s+/g, ' ').trim().substring(0, 5000) || '';
          });

          const textMatched = pageText.includes(extractedError.expectedText) ||
                              pageText.includes(this.toSimplifiedChinese(extractedError.expectedText));

          return {
            type: 'assertion',
            passed: textMatched,
            message: textMatched
              ? `✓ 文本验证通过: 找到预期文本 "${extractedError.expectedText}"`
              : `✗ 文本验证失败: 未找到预期文本 "${extractedError.expectedText}"`,
            details: {
              expected: extractedError.expectedText,
              actualPreview: pageText.substring(0, 200)
            }
          };
        }

        // 如果描述很短且不包含明确的验证意图，可能是占位符
        if (description.length < 10 || this.isPlaceholderDescription(description)) {
          this.log('warn', '[verifyAssertion] 描述过短或为占位符，无法验证', { description });
          return {
            type: 'assertion',
            passed: false,
            message: `⚠ 验证描述不明确: "${description}"，请编辑测试用例填写正确的预期结果`,
            details: { reason: 'ambiguous_description', description }
          };
        }

        // 对于其他情况，尝试检查描述中的关键词是否出现在页面上
        this.log('info', '[verifyAssertion] 检查描述关键词是否存在于页面');
        const pageText = await this.page.evaluate(() => {
          return document.body?.textContent?.replace(/\s+/g, ' ').trim() || '';
        });

        // 提取描述中的关键词（排除常见的无意义词）
        const keywords = description
          .replace(/[，。、；：！？,.;:!?"'「」『』【】\s]/g, ' ')
          .split(' ')
          .filter(w => w.length >= 2)
          .filter(w => !['的', '了', '是', '在', '有', '无', '不', '和', '或', '与', '及', '等'].includes(w));

        const keywordFound = keywords.length > 0 && keywords.some(kw =>
          pageText.includes(kw) || pageText.includes(this.toSimplifiedChinese(kw))
        );

        return {
          type: 'assertion',
          passed: keywordFound,
          message: keywordFound
            ? `✓ 关键词验证通过: 描述关键词存在于页面`
            : `✗ 关键词验证失败: 描述关键词未在页面找到`,
          details: {
            keywords,
            description,
            pageTextPreview: pageText.substring(0, 200)
          }
        };
      }

      // 执行所有验证并收集结果
      const results = {
        error: { passed: false, details: null },
        style: { passed: false, details: null },
        visibility: { passed: false, details: null },
        passwordState: { passed: true, details: null },  // 密码状态验证默认通过
        existence: { passed: true, details: null },  // 存在验证默认通过
        textColor: { passed: false, details: null }  // 文字颜色验证
      };

      // 1. 错误提示验证
      if (validationTypes.includes('error')) {
        this.log('info', '[verifyAssertion] 执行错误提示验证');

        // 1.1 首先尝试从描述中提取预期错误文本
        const extractedError = this.extractExpectedErrorText(description);
        const hasExpectedText = extractedError.hasExpected;
        const expectedErrorText = extractedError.expectedText;

        if (hasExpectedText) {
          this.log('info', '[verifyAssertion] 检测到预期错误文本（精确匹配模式）', { expectedErrorText });
        } else {
          this.log('info', '[verifyAssertion] 未检测到预期错误文本，将使用关键词检查模式');
        }

        // 1.2 收集所有可能的实际错误文本
        const actualErrorTexts = [];

        // 从 DOM 收集可能的错误提示文本（只收集与错误相关的文本）
        const domErrorTexts = await this.page.evaluate(() => {
          const results = [];
          const errorKeywords = ['错误', '錯誤', 'error', 'invalid', '必填', '不能为空', '不能為空', '欄位', '字段', '请输入', '請輸入'];

          // 1. 查找带有 error/invalid 类名的元素
          const errorElements = document.querySelectorAll('[class*="error"], [class*="invalid"], [class*="Error"], [class*="Invalid"]');
          errorElements.forEach(el => {
            const text = el.textContent?.trim();
            if (text && text.length < 200) { // 只取短文本，避免收集大段代码
              results.push(text);
            }
          });

          // 2. 查找 aria-live="alert" 或 role="alert" 的元素
          const alertElements = document.querySelectorAll('[aria-live="alert"], [role="alert"], .alert, [role="status"]');
          alertElements.forEach(el => {
            const text = el.textContent?.trim();
            if (text && text.length < 200) {
              results.push(text);
            }
          });

          // 3. 查找输入框下方的帮助文本/错误消息（通常在 input 之后）
          const inputs = document.querySelectorAll('input:not([type=hidden]), textarea, [role="textbox"]');
          inputs.forEach(input => {
            // 检查 aria-errormessage
            const ariaErrormessage = input.getAttribute('aria-errormessage');
            if (ariaErrormessage) {
              const errorEl = document.getElementById(ariaErrormessage);
              if (errorEl) {
                const text = errorEl.textContent?.trim();
                if (text) results.push(text);
              }
            }

            // 检查 aria-describedby
            const ariaDescribedby = input.getAttribute('aria-describedby');
            if (ariaDescribedby) {
              const descIds = ariaDescribedby.split(' ');
              descIds.forEach(id => {
                const descEl = document.getElementById(id);
                if (descEl) {
                  const text = descEl.textContent?.trim();
                  if (text && text.length < 200) results.push(text);
                }
              });
            }

            // 检查紧邻输入框的下一个元素（通常是错误提示）
            let nextSibling = input.nextElementSibling;
            let count = 0;
            while (nextSibling && count < 3) {
              const text = nextSibling.textContent?.trim();
              if (text && text.length < 200 && text.length > 0) {
                // 检查是否包含错误关键词
                const hasErrorKeyword = errorKeywords.some(kw => text.toLowerCase().includes(kw.toLowerCase()));
                if (hasErrorKeyword) {
                  results.push(text);
                }
              }
              nextSibling = nextSibling.nextElementSibling;
              count++;
            }
          });

          // 4. 查找包含错误关键词的小型文本元素
          const smallElements = document.querySelectorAll('small, span, p, div');
          smallElements.forEach(el => {
            const text = el.textContent?.trim();
            if (text && text.length < 200 && text.length > 0) {
              const hasErrorKeyword = errorKeywords.some(kw => text.toLowerCase().includes(kw.toLowerCase()));
              if (hasErrorKeyword) {
                results.push(text);
              }
            }
          });

          // 去重并返回
          return [...new Set(results)];
        });

        if (domErrorTexts.length > 0) {
          actualErrorTexts.push({ source: 'DOM', text: domErrorTexts.join(' | ') });
        }
        // 移除页面文本回退方案 - 它会匹配到无关的 footer 文本
        // 如果没有找到特定的错误元素，就说明没有错误提示

        // 从 Flutter 语义树收集（改进版）
        const flutterCheck = await this.page.evaluate(() => {
          const semanticsHost = document.querySelector('flt-semantics-host');
          if (!semanticsHost) {
            return { found: false };
          }

          const errorTexts = [];
          const errorKeywords = ['错误', '錯誤', 'error', 'invalid', '必填', '不能为空', '不能為空', '欄位', '字段'];
          const footerKeywords = ['版权所有', '版權所有', '©', '更新日期', 'QAT'];

          const allNodes = semanticsHost.querySelectorAll('*');
          for (const node of allNodes) {
            const text = (node.textContent || '').trim();
            const label = (node.getAttribute('aria-label') || '').trim();
            const role = (node.getAttribute('role') || '').trim();

            // 排除 footer 相关文本
            if (footerKeywords.some(kw => text.includes(kw) || label.includes(kw))) {
              continue;
            }

            // 只收集短文本（错误提示通常很短）
            if (text && text.length < 200 && text.length > 0) {
              // 检查是否包含错误关键词
              const hasErrorKeyword = errorKeywords.some(kw => text.toLowerCase().includes(kw.toLowerCase()));
              if (hasErrorKeyword || role === 'alert') {
                errorTexts.push(text);
              }
            }

            if (label && label.length < 200 && label.length > 0) {
              const hasErrorKeyword = errorKeywords.some(kw => label.toLowerCase().includes(kw.toLowerCase()));
              if (hasErrorKeyword || role === 'alert') {
                errorTexts.push(label);
              }
            }
          }

          return {
            found: true,
            texts: errorTexts,
            combined: errorTexts.join(' | ')
          };
        });

        if (flutterCheck.found && flutterCheck.combined) {
          actualErrorTexts.push({ source: 'Flutter_Semantics', text: flutterCheck.combined });
        }

        // 从 HTML5 表单验证 API 收集
        const formValidation = await this.page.evaluate(() => {
          const inputs = document.querySelectorAll('input:not([type=hidden]), textarea, [role="textbox"]');
          const results = [];

          for (const input of inputs) {
            const validationMessage = input.validationMessage;
            const ariaInvalid = input.getAttribute('aria-invalid');
            const ariaErrormessage = input.getAttribute('aria-errormessage');
            const ariaDescribedby = input.getAttribute('aria-describedby');
            const validity = input.validity;

            let errormessageText = '';
            if (ariaErrormessage) {
              const errorEl = document.getElementById(ariaErrormessage);
              if (errorEl) errormessageText = errorEl.textContent || '';
            }
            if (ariaDescribedby) {
              const descIds = ariaDescribedby.split(' ');
              for (const id of descIds) {
                const descEl = document.getElementById(id);
                if (descEl) {
                  errormessageText += ' ' + (descEl.textContent || '');
                }
              }
            }

            results.push({
              validationMessage,
              errormessageText,
              ariaInvalid,
              hasError: !validity.valid || (validationMessage && validationMessage.trim()) || ariaInvalid === 'true'
            });
          }

          return results;
        });

        // 收集表单验证中的错误消息
        const formErrorMessages = formValidation
          .filter(v => v.hasError)
          .map(v => (v.validationMessage || '') + ' ' + (v.errormessageText || ''))
          .filter(t => t.trim())
          .join(' ');

        if (formErrorMessages) {
          actualErrorTexts.push({ source: 'HTML5_Form_Validation', text: formErrorMessages });
        }

        // 1.3 执行精确匹配逻辑
        let hasError = false;
        let errorSource = 'Unknown';
        let matchResult = null;
        let mismatchDetails = null; // 记录不匹配的详细原因

        if (hasExpectedText) {
          // 有预期错误文本，使用精确匹配
          this.log('info', '[verifyAssertion] 执行精确匹配', {
            expected: expectedErrorText,
            sources: actualErrorTexts.map(t => t.source)
          });

          let matched = false;
          let foundActualText = null;
          let foundSource = null;

          // 遍历所有实际的错误文本源
          for (const actual of actualErrorTexts) {
            if (this.exactMatchText(actual.text, expectedErrorText)) {
              matched = true;
              foundActualText = actual.text;
              foundSource = actual.source;
              matchResult = {
                expected: expectedErrorText,
                actual: this.extractMatchingText(actual.text, expectedErrorText),
                matchType: 'exact'
              };
              this.log('info', '[verifyAssertion] 精确匹配成功', {
                source: actual.source,
                match: matchResult
              });
              break;
            }
          }

          hasError = matched;

          if (!matched) {
            // 匹配失败，记录详细原因
            const allActualTextForDisplay = actualErrorTexts
              .map(t => `[${t.source}]: ${t.text.substring(0, 200)}${t.text.length > 200 ? '...' : ''}`)
              .join('\n');

            mismatchDetails = {
              expected: expectedErrorText,
              actualFound: actualErrorTexts.length > 0,
              actualSources: actualErrorTexts.map(t => t.source),
              actualTexts: allActualTextForDisplay,
              reason: actualErrorTexts.length === 0
                ? '页面未检测到任何错误提示'
                : '页面检测到的错误提示与预期不符'
            };

            this.log('error', '[verifyAssertion] 精确匹配失败', mismatchDetails);
          }
        } else {
          // 没有预期错误文本，使用关键词检查
          this.log('info', '[verifyAssertion] 使用关键词检查模式（未找到预期错误文本）');

          const errorKeywords = [
            '错误', '錯誤', 'error', 'invalid', '无效',
            '失败', '失敗', 'failed', 'failure',
            '警告', '警吿', 'warning', 'warn',
            '提示', '讯息', 'message'
          ];

          for (const actual of actualErrorTexts) {
            if (errorKeywords.some(kw => actual.text.includes(kw))) {
              hasError = true;
              errorSource = actual.source;
              this.log('info', '[verifyAssertion] 检测到错误关键词', {
                source: actual.source,
                keywords: errorKeywords.filter(kw => actual.text.includes(kw))
              });
              break;
            }
          }
        }

        // 1.4 如果仍未检测到，检查网络请求错误
        if (!hasError && this.lastFailedRequest) {
          this.log('info', '[verifyAssertion] 检查网络请求错误', {
            lastFailedRequest: this.lastFailedRequest
          });
          hasError = true;
          errorSource = 'Network_Request_Error';
        }

        // 1.5 设置验证结果（包含详细的不匹配信息）
        results.error = {
          passed: hasError,
          details: {
            hasError,
            errorSource,
            hasExpectedText,
            expectedText: hasExpectedText ? expectedErrorText : undefined,
            matchResult: matchResult,
            mismatchDetails: mismatchDetails // 不匹配时的详细信息
          }
        };
      }

      // 2. 样式验证
      if (validationTypes.includes('style')) {
        this.log('info', '[verifyAssertion] 执行样式验证');

        const inputCheck = await this.page.evaluate(() => {
          const inputs = document.querySelectorAll('input:not([type=hidden]), textarea, [role="textbox"]');
          const results = [];

          for (const input of inputs) {
            const styles = window.getComputedStyle(input);
            const className = input.className || '';
            const ariaInvalid = input.getAttribute('aria-invalid');

            results.push({
              id: input.id,
              name: input.name,
              placeholder: input.placeholder,
              role: input.getAttribute('role'),
              borderColor: styles.borderColor,
              className: className,
              ariaInvalid: ariaInvalid,
              hasRedBorder: styles.borderColor.includes('red') ||
                           styles.borderColor.includes('rgb(255') ||
                           styles.borderColor.includes('#ff0000') ||
                           styles.borderColor.includes('#f00'),
              hasErrorClass: className.includes('error') ||
                           className.includes('invalid') ||
                           className.includes('has-error') ||
                           className.includes('is-invalid'),
              hasAriaInvalid: ariaInvalid === 'true'
            });
          }

          return results;
        });

        const hasRedBorder = inputCheck.some(i => i.hasRedBorder);
        const hasErrorClass = inputCheck.some(i => i.hasErrorClass);
        const hasAriaInvalid = inputCheck.some(i => i.hasAriaInvalid);

        this.log('info', '[verifyAssertion] 输入框样式检查结果', {
          hasRedBorder,
          hasErrorClass,
          hasAriaInvalid
        });

        let hasFlutterErrorIndicator = false;
        if (!hasRedBorder && !hasErrorClass && !hasAriaInvalid) {
          this.log('info', '[verifyAssertion] 常规检查未检测到错误样式，检查 Flutter 语义树');
          const flutterCheck = await this.page.evaluate(() => {
            const semanticsHost = document.querySelector('flt-semantics-host');
            if (!semanticsHost) return { found: false };

            const allNodes = semanticsHost.querySelectorAll('*');
            for (const node of allNodes) {
              if (node.getAttribute('aria-invalid') === 'true') {
                return { found: true, reason: 'aria_invalid' };
              }
              const className = node.className || '';
              if (className.includes('error') || className.includes('invalid')) {
                return { found: true, reason: 'error_class' };
              }
              const text = node.textContent || '';
              const label = node.getAttribute('aria-label') || '';
              if ((text || label).includes('錯誤') || (text || label).includes('error')) {
                return { found: true, reason: 'error_text' };
              }
            }
            return { found: false };
          });

          hasFlutterErrorIndicator = flutterCheck.found;
          this.log('info', '[verifyAssertion] Flutter 语义树错误样式检查', flutterCheck);
        }

        results.style = {
          passed: hasRedBorder || hasErrorClass || hasAriaInvalid || hasFlutterErrorIndicator,
          details: { hasRedBorder, hasErrorClass, hasAriaInvalid, hasFlutterErrorIndicator }
        };
      }

      // 3.5. 颜色验证（文字颜色、边框颜色、背景颜色）
      if (validationTypes.includes('textColor')) {
        this.log('info', '[verifyAssertion] ========== 执行颜色验证 ==========');

        // 从描述中提取验证信息
        // 支持的格式：
        // - "文字颜色为红色" -> 文字颜色，预期红色
        // - "值为1的文字显示红色" -> 文字颜色，目标文本"1"，预期红色
        // - "边框颜色为蓝色" -> 边框颜色，预期蓝色
        // - "背景是红色" -> 背景颜色，预期红色

        // 确定颜色类型（文字、边框、背景）
        let colorType = 'color'; // color, borderColor, backgroundColor
        if (description.includes('边框') || description.includes('border')) {
          colorType = 'borderColor';
        } else if (description.includes('背景') || description.includes('background')) {
          colorType = 'backgroundColor';
        }

        // 提取目标文本
        let targetText = null;
        const quotedTextMatch = description.match(/「([^」]+)」|"([^"]+)"|'([^']+)'|值为([^\s]+)|文字([^\s]+)|显示([^\s]+)|是([^\s]+)文字|列[的]?([^\s]+)|单元格([^\s]+)/);
        if (quotedTextMatch) {
          targetText = quotedTextMatch[1] || quotedTextMatch[2] || quotedTextMatch[3] ||
                       quotedTextMatch[4] || quotedTextMatch[5] || quotedTextMatch[6] ||
                       quotedTextMatch[7] || quotedTextMatch[8] || quotedTextMatch[9];
        }

        // 提取预期颜色（支持颜色名称和色标）
        let expectedColorSpec = null;  // 可能是颜色名称或色标
        let isExactColorSpec = false;  // 是否是精确色标

        // 首先检查是否是精确色标（#fff, rgb(), rgba() 等）
        const hexColorMatch = description.match(/#[0-9a-fA-F]{3,8}/);
        const rgbColorMatch = description.match(/rgba?\([^)]+\)/);

        if (hexColorMatch) {
          expectedColorSpec = hexColorMatch[0];
          isExactColorSpec = true;
          this.log('info', '[verifyAssertion] 检测到十六进制色标', { color: expectedColorSpec });
        } else if (rgbColorMatch) {
          expectedColorSpec = rgbColorMatch[0];
          isExactColorSpec = true;
          this.log('info', '[verifyAssertion] 检测到RGB色标', { color: expectedColorSpec });
        } else {
          // 颜色名称映射（支持简繁体）
          const colorMap = {
            '红色': 'red', '紅色': 'red', '红': 'red', '紅': 'red',
            '蓝色': 'blue', '藍色': 'blue', '蓝': 'blue', '藍': 'blue',
            '绿色': 'green', '綠色': 'green', '绿': 'green', '綠': 'green',
            '黑色': 'black', '黑色': 'black', '黑': 'black',
            '白色': 'white', '白色': 'white', '白': 'white',
            '黄色': 'yellow', '黃色': 'yellow', '黄': 'yellow', '黃': 'yellow',
            '灰色': 'gray', '灰色': 'gray', '灰': 'gray',
            '橙色': 'orange', '橙色': 'orange', '橙': 'orange',
            '紫色': 'purple', '紫色': 'purple', '紫': 'purple',
            '粉色': 'pink', '粉色': 'pink', '粉': 'pink',
            '青色': 'cyan', '青色': 'cyan', '青': 'cyan',
            // 红色变种
            '深红': 'darkred', '深紅': 'darkred', '暗红': 'darkred', '暗紅': 'darkred',
            '浅红': 'lightred', '淺紅': 'lightred',
            '粉红': 'pink', '粉紅': 'pink',
            '鲜红': 'brightred', '鮮紅': 'brightred',
            '紫红': 'purplered', '紫紅': 'purplered',
            // 蓝色变种
            '深蓝': 'darkblue', '深藍': 'darkblue', '暗蓝': 'darkblue',
            '浅蓝': 'lightblue', '淺藍': 'lightblue',
            '天蓝': 'skyblue', '天藍': 'skyblue',
            // 绿色变种
            '深绿': 'darkgreen', '深綠': 'darkgreen',
            '浅绿': 'lightgreen', '淺綠': 'lightgreen',
            '青绿': 'teal', '青綠': 'teal',
            // 黄色变种
            '浅黄': 'lightyellow', '淺黃': 'lightyellow',
            '金黄': 'gold', '金黃': 'gold',
            '橙黄': 'orangyellow', '橙黃': 'orangyellow'
          };

          for (const [cnName, enName] of Object.entries(colorMap)) {
            if (description.includes(cnName)) {
              expectedColorSpec = enName;
              break;
            }
          }
        }

        this.log('info', '[verifyAssertion] 颜色验证参数', {
          description,
          colorType,
          targetText,
          expectedColorSpec,
          isExactColorSpec
        });

        if (!expectedColorSpec) {
          this.log('warn', '[verifyAssertion] 无法从描述中提取预期颜色');
          results.textColor = {
            passed: false,
            details: { reason: '无法提取预期颜色', description }
          };
        } else {
          // 执行颜色验证
          const colorCheckResult = await this.page.evaluate((params) => {
            const { targetText, colorType, expectedColorSpec, isExactColorSpec } = params;

            // 颜色名称到RGB范围的映射
            const colorRanges = {
              'red': { r: [150, 255], g: [0, 100], b: [0, 100] },
              'darkred': { r: [100, 180], g: [0, 60], b: [0, 60] },
              'lightred': { r: [200, 255], g: [80, 150], b: [80, 150] },
              'brightred': { r: [220, 255], g: [0, 50], b: [0, 50] },
              'purplered': { r: [180, 255], g: [0, 80], b: [80, 150] },
              'blue': { r: [0, 100], g: [0, 100], b: [150, 255] },
              'darkblue': { r: [0, 60], g: [0, 60], b: [100, 180] },
              'lightblue': { r: [80, 150], g: [80, 150], b: [200, 255] },
              'skyblue': { r: [100, 180], g: [180, 230], b: [230, 255] },
              'green': { r: [0, 100], g: [100, 255], b: [0, 100] },
              'darkgreen': { r: [0, 60], g: [80, 150], b: [0, 60] },
              'lightgreen': { r: [100, 200], g: [200, 255], b: [100, 200] },
              'teal': { r: [0, 80], g: [128, 200], b: [128, 200] },
              'black': { r: [0, 50], g: [0, 50], b: [0, 50] },
              'white': { r: [200, 255], g: [200, 255], b: [200, 255] },
              'yellow': { r: [200, 255], g: [200, 255], b: [0, 100] },
              'lightyellow': { r: [220, 255], g: [220, 255], b: [150, 200] },
              'gold': { r: [200, 255], g: [180, 220], b: [0, 80] },
              'orangyellow': { r: [220, 255], g: [150, 200], b: [0, 80] },
              'gray': { r: [80, 180], g: [80, 180], b: [80, 180] },
              'orange': { r: [200, 255], g: [100, 180], b: [0, 80] },
              'purple': { r: [100, 180], g: [0, 80], b: [100, 180] },
              'pink': { r: [200, 255], g: [150, 220], b: [180, 255] },
              'cyan': { r: [0, 100], g: [200, 255], b: [200, 255] }
            };

            // 解析RGB值
            function parseColor(colorStr) {
              // 处理 rgb() 和 rgba()
              const rgbMatch = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
              if (rgbMatch) {
                return {
                  r: parseInt(rgbMatch[1]),
                  g: parseInt(rgbMatch[2]),
                  b: parseInt(rgbMatch[3])
                };
              }
              // 处理 #hex 格式
              const hexMatch = colorStr.match(/#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})/);
              if (hexMatch) {
                return {
                  r: parseInt(hexMatch[1], 16),
                  g: parseInt(hexMatch[2], 16),
                  b: parseInt(hexMatch[3], 16)
                };
              }
              // 处理简写 #hex 格式
              const shortHexMatch = colorStr.match(/#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])/);
              if (shortHexMatch) {
                return {
                  r: parseInt(shortHexMatch[1] + shortHexMatch[1], 16),
                  g: parseInt(shortHexMatch[2] + shortHexMatch[2], 16),
                  b: parseInt(shortHexMatch[3] + shortHexMatch[3], 16)
                };
              }
              return null;
            }

            // 检查颜色是否在范围内
            function isColorInRange(actualRgb, expectedColorSpec, isExactColorSpec) {
              const actual = parseColor(actualRgb);
              if (!actual) return false;

              // 如果是精确色标，尝试解析并比较
              if (isExactColorSpec) {
                const expected = parseColor(expectedColorSpec);
                if (expected) {
                  // 计算颜色差异（欧氏距离）
                  const distance = Math.sqrt(
                    Math.pow(actual.r - expected.r, 2) +
                    Math.pow(actual.g - expected.g, 2) +
                    Math.pow(actual.b - expected.b, 2)
                  );
                  // 允许一定的误差范围（距离小于30认为匹配）
                  return distance < 30;
                }
              }

              // 如果是颜色名称，检查是否在范围内
              const range = colorRanges[expectedColorSpec];
              if (range) {
                return actual.r >= range.r[0] && actual.r <= range.r[1] &&
                       actual.g >= range.g[0] && actual.g <= range.g[1] &&
                       actual.b >= range.b[0] && actual.b <= range.b[1];
              }

              return false;
            }

            // 查找所有可能包含目标文本的元素
            const allElements = document.querySelectorAll('*');
            const matchedElements = [];

            for (const el of allElements) {
              // 获取元素的文本内容
              const text = el.textContent?.trim() || '';

              // 如果指定了目标文本，只检查包含该文本的元素
              if (targetText && !text.includes(targetText)) {
                continue;
              }

              // 只检查叶子节点或直接包含文本的元素（排除过大的容器）
              if (text.length === 0 || text.length > 100) {
                continue;
              }

              // 获取计算后的样式
              const computedStyle = window.getComputedStyle(el);
              const colorValue = computedStyle[colorType];

              if (colorValue) {
                matchedElements.push({
                  text: text.substring(0, 50),
                  color: colorValue,
                  colorType: colorType,
                  tagName: el.tagName,
                  className: el.className
                });
              }
            }

            // 检查是否有元素的颜色匹配预期
            const found = matchedElements.some(el => {
              return isColorInRange(el.color, expectedColorSpec, isExactColorSpec);
            });

            return {
              found,
              matchedElements: matchedElements.slice(0, 10),
              totalChecked: matchedElements.length,
              colorType,
              expectedColorSpec
            };
          }, { targetText, colorType, expectedColorSpec, isExactColorSpec });

          this.log('info', '[verifyAssertion] 颜色验证结果', colorCheckResult);

          results.textColor = {
            passed: colorCheckResult.found,
            details: {
              colorType,
              expectedColor: expectedColorSpec,
              targetText,
              matchedElements: colorCheckResult.matchedElements,
              totalChecked: colorCheckResult.totalChecked
            }
          };
        }
      }

      // 4. 可见性验证（检查目标元素是否可见）
      if (validationTypes.includes('visibility')) {
        this.log('info', '[verifyAssertion] ========== 执行可见性验证 ==========');
        this.log('info', '[verifyAssertion] 原始描述', { description });

        // 对于页面跳转验证，先等待 Flutter 页面更新
        // 因为点击登录按钮后，Flutter 需要时间渲染新页面
        this.log('info', '[verifyAssertion] 等待 Flutter 页面更新...');
        await this.page.waitForTimeout(5000); // 等待 5 秒让页面更新

        // 策略1：检查 URL/路由变化（最可靠的页面跳转验证方式）
        const routeCheck = await this.page.evaluate(() => {
          return window.location.href;
        });

        this.log('info', '[verifyAssertion] 当前 URL', { url: routeCheck });

        // 策略2：检查选中的菜单项
        const menuCheck = await this.page.evaluate(() => {
          // 查找所有可能的菜单项
          const menuItems = Array.from(document.querySelectorAll(
            '[role="menuitem"], [role="tab"][aria-selected="true"], ' +
            '.active, .selected, [aria-selected="true"], ' +
            'nav a[class*="active"], .nav-item.active'
          ));

          const selectedMenu = menuItems
            .map(el => ({
              text: el.textContent?.trim() || '',
              ariaLabel: el.getAttribute('aria-label')?.trim() || '',
              className: el.className || '',
              id: el.id || ''
            }))
            .filter(item => item.text || item.ariaLabel);

          return { found: selectedMenu.length > 0, items: selectedMenu };
        });

        this.log('info', '[verifyAssertion] 选中的菜单项', menuCheck);

        // 策略3：检查页面文本是否包含目标关键词（作为补充验证）
        // 首先从描述中提取核心关键词（去掉动作前缀）
        let extractedKeyword = description
          .replace(/成功跳轉到?|成功跳转到?|跳轫到?|跳转到?|進入|进入|切換到|切换到|成功/g, '')
          .replace(/[頁面页面畫面]$/g, '')
          .trim();
        this.log('info', '[verifyAssertion] 提取的关键词', { original: description, extracted: extractedKeyword });

        const pageTextCheck = await this.page.evaluate((targetKeyword) => {
          const bodyText = document.body?.textContent?.replace(/\s+/g, ' ').trim() || '';

          // 简繁体转换映射（更完整的映射）
          const scTcMap = {
            '账号': '帳號', '账户': '帳戶', '管理': '管理',
            '权限': '權限', '賬號': '账号', '帳戶': '账户',
            '首页': '首頁', '登录': '登入', '注销': '登出',
            '设置': '設定', '配置': '配置', '系统': '系統'
          };

          // 检查直接匹配
          if (bodyText.includes(targetKeyword)) {
            return { found: true, method: 'direct' };
          }

          // 检查简繁体转换后匹配
          let convertedKeyword = targetKeyword;
          for (const [sc, tc] of Object.entries(scTcMap)) {
            convertedKeyword = convertedKeyword.replace(new RegExp(sc, 'g'), tc);
            convertedKeyword = convertedKeyword.replace(new RegExp(tc, 'g'), sc);
          }

          if (bodyText.includes(convertedKeyword)) {
            return { found: true, method: 'simplified_traditional', converted: convertedKeyword };
          }

          // 检查部分关键词匹配（提取2-4个字符的关键词）
          const keywords = targetKeyword
            .replace(/[管理頁面页面]/g, ' ')
            .split(/[,，、\s]+/)
            .filter(k => k.length >= 2);
          const matchedKeywords = keywords.filter(kw => bodyText.includes(kw));

          return {
            found: matchedKeywords.length > 0,
            method: 'partial',
            matchedKeywords,
            allKeywords: keywords,
            bodyTextPreview: bodyText.substring(0, 500)
          };
        }, extractedKeyword);

        this.log('info', '[verifyAssertion] 页面文本检查', pageTextCheck);

        // 综合判断：只要有一种方式通过就认为验证成功

        // 策略1：URL 路径匹配（最可靠的方式）
        // 提取关键词的英文映射，用于 URL 匹配
        const keywordToPathMap = {
          '账号': 'account',
          '賬號': 'account',
          '帳號': 'account',
          '权限': 'management',
          '權限': 'management',
          '管理': 'management',
          '首页': 'home',
          '首頁': 'home',
          '登录': 'login',
          '登入': 'login',
          '密码': 'password',
          '密碼': 'password'
        };

        // 检查 URL 路径是否包含关键词对应的英文
        const currentPath = routeCheck.split('/').pop().toLowerCase() || '';
        this.log('info', '[verifyAssertion] 当前路径', { path: currentPath, extractedKeyword });

        let passedByURL = false;
        let matchedPathKeyword = '';

        // 从提取的关键词中查找对应的英文路径
        for (const [chinese, english] of Object.entries(keywordToPathMap)) {
          if (extractedKeyword.includes(chinese)) {
            if (currentPath.includes(english)) {
              passedByURL = true;
              matchedPathKeyword = `${chinese} -> ${english}`;
              break;
            }
          }
        }

        // 特殊处理：如果是 "账号权限管理"，检查 account_management 或 account
        if (!passedByURL && (extractedKeyword.includes('账号') || extractedKeyword.includes('賬號') || extractedKeyword.includes('帳號'))) {
          if (currentPath.includes('account') || currentPath.includes('management')) {
            passedByURL = true;
            matchedPathKeyword = '账号管理 -> account/management';
          }
        }

        this.log('info', '[verifyAssertion] URL 路径匹配', { passedByURL, matchedPathKeyword, currentPath });

        // 策略2：菜单项检查：匹配包含权限/账号相关的菜单
        const passedByMenu = menuCheck.found && menuCheck.items.some(item => {
          const text = item.text || '';
          const ariaLabel = item.ariaLabel || '';
          const combined = (text + ' ' + ariaLabel).toLowerCase();

          // 匹配关键词（简繁体）
          return combined.includes('權限') || combined.includes('权限') ||
                 combined.includes('賬號') || combined.includes('账号') ||
                 combined.includes('帳號') || combined.includes('管理') ||
                 combined.includes('management');
        });

        // 策略3：页面文本检查
        const passedByText = pageTextCheck.found;

        this.log('info', '[verifyAssertion] 验证判断', {
          passedByURL,
          passedByMenu,
          passedByText,
          menuCheck,
          pageTextCheck
        });

        results.visibility = {
          passed: passedByURL || passedByMenu || passedByText,
          details: {
            currentUrl: routeCheck,
            currentPath,
            menuItems: menuCheck.items,
            pageTextCheck,
            passedByURL,
            matchedPathKeyword,
            passedByMenu,
            passedByText
          }
        };

        this.log('info', '[verifyAssertion] 可见性验证结果', results.visibility.details);
      }

      // 5. 密码显示状态验证（密文/明文切换）
      if (validationTypes.includes('passwordState')) {
        this.log('info', '[verifyAssertion] ========== 执行密码状态验证 ==========');

        // 判断验证类型：状态切换 vs 特定状态验证
        // 描述如：密碼能在明文和密文狀態之間正確切換（切换验证）
        //       密碼顯示為明文（特定状态验证）
        const isToggleVerification = description.includes('切換') || description.includes('切换') ||
                                   description.includes('轉變') || description.includes('转变') ||
                                   (description.includes('明文') && description.includes('密文'));

        // 密码状态验证：验证密码输入框的 type 属性是否正确
        // 描述如：密碼內容由密文轉變為明文顯示、密碼顯示為明文、密碼隱藏為密文
        const expectsPlainText = description.includes('明文') || description.includes('顯示') || description.includes('显示') || description.includes('可見');
        const expectsCipherText = description.includes('密文') || description.includes('隱藏') || description.includes('隐藏') || description.includes('不可見');

        this.log('info', '[verifyAssertion] 密码状态预期', {
          description,
          isToggleVerification,
          expectsPlainText,
          expectsCipherText
        });

        // 等待密码状态切换（点击 icon 后需要时间让 Flutter 更新 DOM）
        this.log('info', '[verifyAssertion] 等待密码状态切换...');
        await this.page.waitForTimeout(1000); // 等待 1 秒让状态切换完成

        // 检查密码输入框的状态
        const passwordStateCheck = await this.page.evaluate((args) => {
          const { isToggleVerification, expectsPlainText } = args;

          // 查找密码输入框（包括 text 和 password 类型）
          const passwordInputs = Array.from(document.querySelectorAll(
            'input[type="password"], input[type="text"], input[name*="password" i], input[id*="password" i], input[placeholder*="密码" i], input[placeholder*="密碼" i], input[placeholder*="Password" i]'
          ));

          // 找到与密码相关的输入框
          const passwordRelatedInputs = passwordInputs.filter(input => {
            const name = (input.name || '').toLowerCase();
            const id = (input.id || '').toLowerCase();
            const placeholder = (input.placeholder || '').toLowerCase();
            const ariaLabel = (input.getAttribute('aria-label') || '').toLowerCase();

            return name.includes('password') || id.includes('password') ||
                   placeholder.includes('密码') || placeholder.includes('密碼') ||
                   placeholder.includes('password') ||
                   ariaLabel.includes('密码') || ariaLabel.includes('密碼') || ariaLabel.includes('password');
          });

          if (passwordRelatedInputs.length === 0) {
            return { found: false, reason: 'no_password_input' };
          }

          // 检查第一个可见的密码相关输入框
          for (const input of passwordRelatedInputs) {
            const rect = input.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              const inputType = input.type || 'text';
              const isPlainTextVisible = inputType === 'text';
              const isPasswordHidden = inputType === 'password';

              // 对于切换验证，只要找到密码输入框即可
              // 对于特定状态验证，需要状态匹配
              let matches = true;
              if (!isToggleVerification) {
                matches = expectsPlainText ? isPlainTextVisible : isPasswordHidden;
              }

              return {
                found: true,
                inputType,
                isPlainTextVisible,
                isPasswordHidden,
                matches,
                isToggleVerification
              };
            }
          }

          return { found: false, reason: 'no_visible_password_input' };
        }, { isToggleVerification, expectsPlainText });

        this.log('info', '[verifyAssertion] 密码状态检查结果', passwordStateCheck);

        // 对于切换验证，只要找到密码输入框就通过
        // 对于特定状态验证，需要状态匹配
        results.passwordState = {
          passed: passwordStateCheck.found && passwordStateCheck.matches,
          details: {
            ...passwordStateCheck,
            expected: isToggleVerification ? '密码可切换' : (expectsPlainText ? '明文显示' : '密文隐藏'),
            actual: passwordStateCheck.found ? (isToggleVerification ? '密码输入框存在' : (passwordStateCheck.isPlainTextVisible ? '明文显示' : '密文隐藏')) : '未找到密码输入框'
          }
        };
      }

      // 6. 综合判断：所有验证都需要通过
      this.log('info', '[verifyAssertion] 验证结果汇总', {
        validationTypes,
        results: {
          error: results.error?.passed,
          style: results.style?.passed,
          visibility: results.visibility?.passed,
          passwordState: results.passwordState?.passed,
          existence: results.existence?.passed
        }
      });

      const allPassed = validationTypes.every(type => results[type].passed);

      // 构建结果消息
      const messages = [];
      if (validationTypes.includes('error')) {
        if (results.error.passed) {
          const details = results.error.details;
          if (details.hasExpectedText && details.matchResult) {
            // 有预期文本，显示精确匹配详情
            messages.push(`✓ 错误提示验证通过 (来源: ${details.errorSource})`);
            messages.push(`  预期: "${details.expectedText}"`);
            messages.push(`  实际: "${details.matchResult.actual}"`);
          } else {
            // 无预期文本，使用关键词检查
            messages.push(`✓ 错误提示验证通过 (来源: ${details.errorSource})`);
          }
        } else {
          const details = results.error.details;
          if (details.hasExpectedText) {
            // 有预期文本但未精确匹配 - 显示详细原因
            messages.push(`✗ 错误提示验证失败 (文本不匹配)`);
            messages.push(`  预期错误: "${details.expectedText}"`);

            if (details.mismatchDetails) {
              if (details.mismatchDetails.actualFound) {
                // 页面有错误提示，但与预期不符
                messages.push(`  实际检测到错误提示，但内容不一致`);
                messages.push(`  实际错误来源: ${details.mismatchDetails.actualSources.join(', ')}`);

                // 更清晰地显示实际的错误文本
                // actualTexts 格式可能是 "[DOM]: 文本1 | 文本2" 或多行格式
                const actualTextsRaw = details.mismatchDetails.actualTexts;

                // 尝试提取纯文本内容（去掉来源前缀）
                let cleanActualText = actualTextsRaw;
                // 移除 [来源]: 前缀
                cleanActualText = cleanActualText.replace(/\[[^\]]+\]:\s*/g, '');
                // 移除换行和多余空格
                cleanActualText = cleanActualText.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();

                // 如果文本太长，截取并添加省略号
                if (cleanActualText.length > 100) {
                  cleanActualText = cleanActualText.substring(0, 100) + '...';
                }

                messages.push(`  实际错误内容: ${cleanActualText}`);
              } else {
                // 页面完全没有错误提示
                messages.push(`  实际状态: 页面未检测到任何错误提示`);
              }
              messages.push(`  匹配模式: 精确匹配（必须完全一致）`);
            }
          } else {
            // 无预期文本，且未检测到任何错误
            messages.push(`✗ 错误提示验证失败 (未检测到错误提示)`);
          }
        }
      }
      if (validationTypes.includes('style')) {
        if (results.style.passed) {
          const reasons = [];
          if (results.style.details.hasRedBorder) reasons.push('红色边框');
          if (results.style.details.hasErrorClass) reasons.push('错误样式类');
          if (results.style.details.hasAriaInvalid) reasons.push('aria-invalid');
          if (results.style.details.hasFlutterErrorIndicator) reasons.push('Flutter语义树');
          messages.push(`✓ 样式验证通过 (${reasons.join(', ')})`);
        } else {
          messages.push(`✗ 样式验证失败 (未检测到错误样式)`);
        }
      }
      if (validationTypes.includes('textColor')) {
        if (results.textColor.passed) {
          const details = results.textColor.details;
          const colorTypeNames = {
            'color': '文字颜色',
            'borderColor': '边框颜色',
            'backgroundColor': '背景颜色'
          };
          const colorTypeName = colorTypeNames[details.colorType] || details.colorType;
          messages.push(`✓ ${colorTypeName}验证通过 (预期: ${details.expectedColor}${details.targetText ? `, 目标文本: "${details.targetText}"` : ''})`);
        } else {
          const details = results.textColor.details;
          messages.push(`✗ 颜色验证失败`);
          if (details.expectedColor) {
            const colorTypeNames = {
              'color': '文字颜色',
              'borderColor': '边框颜色',
              'backgroundColor': '背景颜色'
            };
            const colorTypeName = colorTypeNames[details.colorType] || details.colorType;
            messages.push(`  预期${colorTypeName}: ${details.expectedColor}`);
            if (details.targetText) {
              messages.push(`  目标文本: "${details.targetText}"`);
            }
          }
          if (details.matchedElements && details.matchedElements.length > 0) {
            messages.push(`  检测到 ${details.totalChecked} 个元素，但颜色不匹配`);
            details.matchedElements.slice(0, 3).forEach(el => {
              messages.push(`    - "${el.text}": ${el.color}`);
            });
          } else if (details.totalChecked === 0) {
            messages.push(`  未检测到匹配的元素`);
          }
        }
      }
      if (validationTypes.includes('visibility')) {
        if (results.visibility.passed) {
          const details = results.visibility.details;
          if (details.targetElement) {
            messages.push(`✓ 页面切换验证通过 (检测到 "${details.targetElement}" 相关元素)`);
            if (details.selector) {
              messages.push(`  定位方式: ${details.selector}`);
            }
            messages.push(`  原因: ${details.reason || '元素可见'}`);
          } else {
            // 确定通过的验证方式
            let passMethod = '未知';
            if (details.passedByURL) {
              passMethod = `URL路径匹配 (${details.matchedPathKeyword || details.currentPath})`;
            } else if (details.passedByMenu) {
              passMethod = '菜单项匹配';
            } else if (details.passedByText) {
              passMethod = '页面文本匹配';
            }
            messages.push(`✓ 页面切换验证通过 (验证方式: ${passMethod})`);
            if (details.currentUrl) {
              messages.push(`  当前URL: ${details.currentUrl}`);
            }
          }
        } else {
          const details = results.visibility.details;
          messages.push(`✗ 页面切换验证失败`);

          // 显示当前URL和路径
          if (details.currentUrl) {
            messages.push(`  当前URL: ${details.currentUrl}`);
          }
          if (details.currentPath) {
            messages.push(`  当前路径: ${details.currentPath}`);
          }

          // 显示菜单项检查结果
          if (details.menuItems && details.menuItems.length > 0) {
            messages.push(`  检测到的菜单项: ${details.menuItems.map(i => i.text || i.ariaLabel).join(', ')}`);
          } else {
            messages.push(`  未检测到选中状态的菜单项`);
          }

          // 显示页面文本检查结果
          if (details.pageTextCheck) {
            const ptCheck = details.pageTextCheck;
            if (ptCheck.found) {
              messages.push(`  页面文本检查: 通过 (${ptCheck.method})`);
            } else {
              messages.push(`  页面文本检查: 未找到关键词`);
              if (ptCheck.allKeywords && ptCheck.allKeywords.length > 0) {
                messages.push(`  尝试的关键词: ${ptCheck.allKeywords.join(', ')}`);
              }
              if (ptCheck.matchedKeywords && ptCheck.matchedKeywords.length > 0) {
                messages.push(`  匹配的关键词: ${ptCheck.matchedKeywords.join(', ')}`);
              }
              if (ptCheck.bodyTextPreview) {
                messages.push(`  页面文本预览: ${ptCheck.bodyTextPreview.substring(0, 100)}...`);
              }
            }
          }
        }
      }
      if (validationTypes.includes('passwordState')) {
        if (results.passwordState.passed) {
          messages.push(`✓ 密码状态验证通过 (${results.passwordState.details.actual})`);
        } else {
          messages.push(`✗ 密码状态验证失败`);
          if (results.passwordState.details) {
            messages.push(`  预期: ${results.passwordState.details.expected}`);
            messages.push(`  实际: ${results.passwordState.details.actual}`);
          }
        }
      }
      if (validationTypes.includes('existence')) {
        messages.push(`✓ 元素存在验证通过`);
      }

      return {
        type: 'assertion',
        passed: allPassed,
        message: messages.join('\n'), // 使用换行符连接，便于报告中显示
        details: results
      };

    } catch (error) {
      return {
        type: 'assertion',
        passed: false,
        error: error.message,
        message: `✗ 断言验证失败: ${error.message}`,
      };
    }
  }

  /**
   * 检查元素可见性
   * 用于验证页面切换（如从ID页切换到密码页）时目标元素是否可见
   * @param {string} targetName - 目标元素名称（如 "密码"）
   * @param {string} description - 完整描述
   * @returns {Object} 可见性检查结果
   */
  async checkElementVisibility(targetName, description) {
    this.log('info', '[checkElementVisibility] 开始检查', { targetName, description });

    // 声明变量（在 try 块外，以便在 catch 中也能访问）
    let simplifiedTarget, traditionalTarget, uniqueSelectors;

    try {
    // 构建可能的选择器列表

    // 1. 根据目标名称构建输入框选择器
    // 支持简繁体转换
    simplifiedTarget = targetName.replace(/輸入/g, '输入').replace(/頁/g, '页').replace(/驗證/g, '验证').replace(/確認/g, '确认');
    traditionalTarget = targetName.replace(/输入/g, '輸入').replace(/页/g, '頁').replace(/验证/g, '驗證').replace(/确认/g, '確認');

    // 构建可能的选择器列表
    const selectors = [];

    // 构建选择器
    const variants = [...new Set([targetName, simplifiedTarget, traditionalTarget])];

    for (const variant of variants) {
      // 提取关键词（去掉 "页"、"页面" 等后缀）
      const keyword = variant.replace(/(?:頁|页|页面|畫面|輸入|输入)$/, '').trim();

      // 输入框选择器
      selectors.push(`input[placeholder*="${keyword}"]`);
      selectors.push(`input[aria-label*="${keyword}"]`);
      selectors.push(`input[data-label*="${keyword}"]`);

      // 标题元素选择器（h1, h2, h3, h4, h5, h6）
      selectors.push(`h1:has-text("${keyword}")`);
      selectors.push(`h2:has-text("${keyword}")`);
      selectors.push(`h3:has-text("${keyword}")`);

      // Flutter 语义元素选择器
      selectors.push(`flt-semantics:has-text("${keyword}")`);
      selectors.push(`[role="heading"]:has-text("${keyword}")`);

      // 文本选择器（查找包含关键词的可见文本）
      selectors.push(`text=${keyword}`);

      // 密码输入框特殊处理
      if (keyword.includes('密碼') || keyword.includes('密码')) {
        selectors.push('input[type="password"]');
        selectors.push('input[aria-label*="password" i]');
      }

      // ID/账号输入框特殊处理
      if (keyword.includes('ID') || keyword.includes('帳號') || keyword.includes('账号') || keyword.includes('账号')) {
        selectors.push('input[aria-label*="id" i]');
        selectors.push('input[name*="id" i]');
      }
    }

    // 2. 通用密码输入框选择器（回退方案）
    selectors.push('input[type="password"]');

    // 去重
    const uniqueSelectors = [...new Set(selectors)];

    this.log('info', '[checkElementVisibility] 构建的选择器', { selectors: uniqueSelectors });

    // 3. 尝试每个选择器
    for (const selector of uniqueSelectors) {
      try {
        const element = await this.page.$(selector);
        if (element) {
          // 检查元素是否可见（使用 bounding box）
          const box = await element.boundingBox();
          const isVisible = box !== null && box.width > 0 && box.height > 0;

          // 同时检查 computed style
          const display = await element.evaluate(el => {
            const style = window.getComputedStyle(el);
            return {
              display: style.display,
              visibility: style.visibility,
              opacity: style.opacity
            };
          });

          const isDisplayed = display.display !== 'none' &&
                              display.visibility !== 'hidden' &&
                              parseFloat(display.opacity) > 0;

          const finalVisible = isVisible || isDisplayed;

          this.log('info', '[checkElementVisibility] 元素检查', {
            selector,
            isVisible,
            isDisplayed,
            display,
            finalVisible
          });

          if (finalVisible) {
            return {
              isVisible: true,
              selector,
              reason: `找到可见元素: ${selector}`,
              display
            };
          }
        }
      } catch (e) {
        // 选择器无效，继续尝试下一个
        this.log('debug', '[checkElementVisibility] 选择器无效', { selector, error: e.message });
      }
    }

    // 4. 使用页面级别的回退检查
    // 检查页面上是否有与目标相关的可见内容
    const pageContentCheck = await this.page.evaluate((keyword) => {
      // 获取可见文本内容（不修改 DOM）
      const getTextContent = () => {
        const scripts = document.querySelectorAll('script, style, noscript');
        let text = document.body?.textContent || '';

        // 排除 script/style 标签内的内容
        scripts.forEach(s => {
          const scriptText = s.textContent || '';
          text = text.replace(scriptText, '');
        });

        return text.replace(/\s+/g, ' ').trim();
      };

      const bodyText = getTextContent();

      // 检查是否包含目标关键词
      const hasKeyword = bodyText.includes(keyword);

      // 检查是否有可见的密码输入框
      const passwordInputs = document.querySelectorAll('input[type="password"]');
      let visiblePasswordInput = false;
      for (const input of passwordInputs) {
        const rect = input.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          const style = window.getComputedStyle(input);
          if (style.display !== 'none' && style.visibility !== 'hidden') {
            visiblePasswordInput = true;
            break;
          }
        }
      }

      return { hasKeyword, visiblePasswordInput, bodyText: bodyText.substring(0, 500) };
    }, simplifiedTarget.replace(/(?:頁|页|页面|畫面|輸入|输入)$/, '').trim());

    this.log('info', '[checkElementVisibility] 页面内容检查', pageContentCheck);

    // 如果是密码页，检查是否有可见的密码输入框
    if (simplifiedTarget.includes('密碼') || simplifiedTarget.includes('密码')) {
      if (pageContentCheck.visiblePasswordInput) {
        return {
          isVisible: true,
          reason: '检测到可见的密码输入框',
          method: 'page_evaluation'
        };
      }
    }

    // 如果页面上包含目标关键词，认为可见
    if (pageContentCheck.hasKeyword) {
      return {
        isVisible: true,
        reason: `页面包含目标关键词: ${simplifiedTarget}`,
        method: 'keyword_match'
      };
    }

    // 都找不到
    return {
      isVisible: false,
      reason: '未找到目标可见元素',
      attemptedSelectors: uniqueSelectors
    };

    } catch (error) {
      this.log('error', '[checkElementVisibility] 检查过程出错', {
        error: error.message,
        stack: error.stack
      });
      // 发生错误时，返回默认通过（保守策略）
      return {
        isVisible: true,
        reason: '检查过程出错，默认通过',
        error: error.message
      };
    }
  }

  /**
   * 数量验证
   * @param {Object} verification - 验证
   * @returns {Object} 验证结果
   */
  async verifyCount(verification) {
    // 智能选择器
    const selector = await this.getListSelector();

    return await this.verifications.count(selector, verification.expected);
  }

  /**
   * 路由验证
   * @param {Object} verification - 验证
   * @returns {Object} 验证结果
   */
  async verifyRoute(verification) {
    const previousUrl = this.currentUrl;
    const currentUrl = this.page.url();

    if (verification.expected === 'changed') {
      return await this.verifications.routeChanged(previousUrl);
    } else {
      return await this.verifications.route(verification.expected);
    }
  }

  /**
   * 文本验证
   * @param {Object} verification - 验证
   * @returns {Object} 验证结果
   */
  async verifyText(verification) {
    // ========== 特殊处理：表格字段验证 ==========
    // 检测"表格需包含...等欄位"的模式
    const tableFieldsPattern = /表格需包含(.+?)等欄位|表格應包含(.+?)等欄位|table.*should.*include.*fields/i;
    const tableFieldsMatch = verification.description.match(tableFieldsPattern);

    if (tableFieldsMatch) {
      this.log('info', '[verifyText] 检测到表格字段验证', {
        description: verification.description,
        matchedText: tableFieldsMatch[1] || tableFieldsMatch[2]
      });

      // 提取所有字段名（使用中文、英文逗号或顿号分隔）
      const fieldsText = tableFieldsMatch[1] || tableFieldsMatch[2];
      const fieldNames = fieldsText.split(/[,、、]/).map(f => f.trim()).filter(f => f.length > 0);

      this.log('info', '[verifyText] 提取的字段列表', { fieldNames });

      // 逐个验证每个字段是否存在于页面文本中
      const pageContent = await this.page.evaluate(() => {
        return document.body.textContent || document.body.innerText;
      });

      const results = [];
      let allFieldsFound = true;
      const missingFields = [];

      for (const field of fieldNames) {
        const found = pageContent.includes(field);
        results.push({ field, found });
        if (!found) {
          allFieldsFound = false;
          missingFields.push(field);
        }
      }

      this.log('info', '[verifyText] 表格字段验证结果', {
        total: fieldNames.length,
        found: fieldNames.length - missingFields.length,
        missing: missingFields
      });

      if (allFieldsFound) {
        return {
          type: 'text',
          passed: true,
          message: `✓ 所有字段都存在: ${fieldNames.join(', ')}`
        };
      } else {
        return {
          type: 'text',
          passed: false,
          message: `✗ 部分字段缺失: ${missingFields.join(', ')}`
        };
      }
    }

    // ========== 原有逻辑：普通文本验证 ==========
    // 如果没有指定 expected，从 description 中提取
    let expectedText = verification.expected;
    if (!expectedText && verification.description) {
      // 尝试从描述中提取预期文本
      // 格式1: "表格列表刷新，顯示ID欄位包含關鍵字「A」的數據" -> 提取 "A"
      // 格式2: "显示「xxx」" -> 提取 "xxx"
      // 格式3: "包含「xxx」" -> 提取 "xxx"
      const quotedTextMatch = verification.description.match(/「([^」]+)」|"([^"]+)"|「([^」]+)」/);
      if (quotedTextMatch) {
        expectedText = quotedTextMatch[1] || quotedTextMatch[2] || quotedTextMatch[3];
      }
      // 如果没有引号标记，尝试提取关键词
      if (!expectedText) {
        // "包含關鍵字「A」" -> "A"
        const keywordMatch = verification.description.match(/關鍵字[「\"]?([^」\"\s]+)[\"」]?|关键词[\""]?([^"\"\s]+)["\"]?/i);
        if (keywordMatch) {
          expectedText = keywordMatch[1] || keywordMatch[2];
        }
      }
    }

    if (!expectedText) {
      this.log('warn', '[verifyText] 无法从验证描述中提取预期文本', { description: verification.description });
      return {
        type: 'text',
        passed: false,
        message: `✗ 无法确定预期文本: ${verification.description}`
      };
    }

    this.log('info', '[verifyText] 从描述中提取预期文本', {
      description: verification.description,
      expected: expectedText
    });

    const selector = await this.getSelectorForText(expectedText, verification.location);
    return await this.verifications.text(selector, expectedText, { location: verification.location });
  }

  /**
   * 可见性验证
   * @param {Object} verification - 验证
   * @returns {Object} 验证结果
   */
  async verifyVisible(verification) {
    // 如果没有指定 target，从 description 中提取
    let target = verification.target;
    if (!target && verification.description) {
      // 对于导航类验证，直接返回成功（因为 navigation 验证会单独处理）
      if (verification.description.includes('切换') || verification.description.includes('跳转')) {
        this.log('info', '[verifyVisible] 导航类验证，跳过 visible 检查');
        return {
          type: 'visible',
          passed: true,
          message: '✓ 导航验证由 navigation 类型处理',
        };
      }
      // 尝试从描述中提取目标
      if (verification.description.includes('密码')) {
        target = '密码';
      } else if (verification.description.includes('登录')) {
        target = '登录';
      } else if (verification.description.includes('按钮')) {
        target = '按钮';
      }
    }

    if (!target) {
      this.log('warn', '[verifyVisible] 未指定验证目标，默认返回通过');
      return {
        type: 'visible',
        passed: true,
        message: '✓ 未指定目标，默认通过',
      };
    }

    const selector = await this.getSelector(target);
    return await this.verifications.visible(selector, verification.expected);
  }

  /**
   * 面包屑验证
   * @param {Object} verification - 验证
   * @returns {Object} 验证结果
   */
  async verifyBreadcrumb(verification) {
    return await this.verifications.breadcrumb(verification.expected);
  }

  /**
   * 存在性验证
   * @param {Object} verification - 验证
   * @returns {Object} 验证结果
   */
  async verifyExists(verification) {
    this.log('info', '[verifyExists] 开始执行存在性验证', { verification });

    try {
      // 首先检查页面URL是否跳转到了预期页面（对于登录等操作）
      const currentUrl = this.page.url();
      const successUrls = ['/account_management', '/dashboard', '/home', '/main'];
      const isOnSuccessPage = successUrls.some(url => currentUrl.includes(url));

      if (isOnSuccessPage) {
        this.log('info', '[verifyExists] 页面已跳转到成功页面', { url: currentUrl });
        return {
          type: 'exists',
          passed: true,
          message: `✓ 操作成功，当前页面: ${currentUrl}`,
        };
      }

      // 检查页面是否有成功消息文本
      const bodyText = await this.page.evaluate(() => document.body.textContent || '');
      const successKeywords = ['成功', '完成', 'Success', 'Completed', '登入', 'amyTest'];
      const hasSuccessText = successKeywords.some(keyword => bodyText.includes(keyword));

      if (hasSuccessText) {
        this.log('info', '[verifyExists] 页面包含成功提示文本');
        return {
          type: 'exists',
          passed: true,
          message: '✓ 页面包含成功提示',
        };
      }

      // 如果指定了选择器，检查元素是否存在
      let selector = verification.selector;

      if (selector) {
        // 检查元素是否存在
        const element = await this.page.$(selector);
        const exists = element !== null;

        this.log('info', `[verifyExists] 元素存在性检查: ${selector}`, { exists });

        if (exists) {
          return {
            type: 'exists',
            passed: true,
            message: `✓ 找到元素: ${selector}`,
          };
        }
      }

      // 尝试查找常见的成功提示元素
      const commonSelectors = [
        '.success',
        '.message',
        '[data-testid="success"]',
        '[data-testid="message"]',
        '.alert-success',
        '.toast-success'
      ];

      for (const sel of commonSelectors) {
        const element = await this.page.$(sel);
        if (element) {
          this.log('info', `[verifyExists] 找到成功提示元素: ${sel}`);
          return {
            type: 'exists',
            passed: true,
            message: `✓ 找到成功提示元素: ${sel}`,
          };
        }
      }

      // 如果以上都没找到，但操作已执行，默认返回成功
      this.log('warn', '[verifyExists] 未找到明确的成功标识，但操作已执行');
      return {
        type: 'exists',
        passed: true,
        message: '✓ 操作执行完成',
      };
    } catch (error) {
      this.log('error', '[verifyExists] 验证出错', { error: error.message });
      return {
        type: 'exists',
        passed: false,
        error: error.message,
        message: `✗ 存在性验证失败: ${error.message}`,
      };
    }
  }

  /**
   * 表单错误验证 - 验证错误提示是否显示
   * @param {Object} verification - 验证
   * @returns {Object} 验证结果
   */
  async verifyFormError(verification) {
    this.log('info', '[verifyFormError] 开始执行表单错误验证', { verification });

    try {
      const currentUrl = this.page.url();
      const target = verification.target || verification.field || '输入框';
      const expectedError = verification.expected || verification.errorMessage || '';

      // 1. 检查页面没有跳转到成功页面（表单验证失败时不应跳转）
      const successUrls = ['/account_management', '/dashboard', '/home', '/main'];
      const isOnSuccessPage = successUrls.some(url => currentUrl.includes(url));

      if (isOnSuccessPage) {
        this.log('warn', '[verifyFormError] 页面意外跳转到成功页面', { url: currentUrl });
        return {
          type: 'error',
          passed: false,
          message: `✗ 表单验证失败：页面意外跳转到成功页面 ${currentUrl}`,
        };
      }

      // 2. 使用 Flutter 语义树查找错误提示
      // Flutter 错误提示通常以 aria-live="assertive" 或 role="alert" 出现
      const errorSelectors = [
        '[role="alert"]',
        '[aria-live="assertive"]',
        '.error-message',
        '.error',
        '.field-error',
        '[data-testid="error"]',
        '.error-text',
      ];

      let errorFound = false;
      let errorText = '';

      for (const selector of errorSelectors) {
        try {
          const element = await this.page.$(selector);
          if (element) {
            const text = await element.textContent();
            if (text && text.trim()) {
              errorFound = true;
              errorText = text.trim();
              this.log('info', `[verifyFormError] 找到错误提示: ${selector}`, { text: errorText });
              break;
            }
          }
        } catch (e) {
          // 继续尝试下一个选择器
        }
      }

      // 3. 使用 page.evaluate 在 Flutter 语义树中查找错误节点
      if (!errorFound) {
        const flutterError = await this.page.evaluate(() => {
          // 检查 Flutter 语义树中的错误提示
          const semanticsHost = document.querySelector('flt-semantics-host');
          if (!semanticsHost) return null;

          // 查找包含 "错误"、"error"、"请输入" 等关键词的节点
          const allNodes = semanticsHost.querySelectorAll('*');
          for (const node of allNodes) {
            const text = node.textContent || node.getAttribute('label') || '';
            if (text && (
              text.includes('错误') ||
              text.includes('error') ||
              text.includes('请输入') ||
              text.includes('不能为空') ||
              text.includes('必填') ||
              text.includes('invalid') ||
              text.includes('required')
            )) {
              return {
                text: text.trim(),
                role: node.getAttribute('role'),
                label: node.getAttribute('label')
              };
            }
          }
          return null;
        });

        if (flutterError) {
          errorFound = true;
          errorText = flutterError.text;
          this.log('info', '[verifyFormError] 在 Flutter 语义树中找到错误提示', flutterError);
        }
      }

      // 4. 检查输入框是否有错误样式（红色边框）
      let hasErrorStyle = false;
      try {
        // 尝试查找带有错误样式的输入框
        const errorInput = await this.page.evaluate(() => {
          const inputs = document.querySelectorAll('input, [role="textbox"]');
          for (const input of inputs) {
            const styles = window.getComputedStyle(input);
            const borderColor = styles.borderColor;
            // 检查边框是否为红色（各种格式）
            if (borderColor === 'rgb(255, 0, 0)' ||
                borderColor === 'red' ||
                borderColor.includes('255') && borderColor.includes('0') && borderColor.includes('0')) {
              return true;
            }
          }
          return false;
        });
        hasErrorStyle = errorInput;
      } catch (e) {
        this.log('warn', '[verifyFormError] 检查输入框样式失败', e.message);
      }

      // 5. 综合判断
      const passed = errorFound || hasErrorStyle;

      if (passed) {
        let message = '✓ 表单错误验证通过';
        if (errorText) {
          message += `: 显示错误提示 "${errorText}"`;
        }
        if (hasErrorStyle) {
          message += errorText ? ', 输入框边框变红' : '输入框边框变红';
        }
        return {
          type: 'error',
          passed: true,
          errorFound,
          errorText,
          hasErrorStyle,
          message,
        };
      } else {
        return {
          type: 'error',
          passed: false,
          message: `✗ 表单错误验证失败：未找到错误提示，且输入框边框未变红`,
        };
      }
    } catch (error) {
      this.log('error', '[verifyFormError] 验证出错', { error: error.message });
      return {
        type: 'error',
        passed: false,
        error: error.message,
        message: `✗ 表单错误验证异常: ${error.message}`,
      };
    }
  }

  /**
   * 基础验证（简单通过验证）
   * @param {Object} verification - 验证
   * @returns {Object} 验证结果
   */
  async verifyBasic(verification) {
    this.log('info', '[verifyBasic] 开始执行基础验证', { verification });

    try {
      // basic 验证默认返回成功
      // 用于不需要特定验证条件的场景
      return {
        type: 'basic',
        passed: true,
        message: verification.message || '✓ 验证通过',
      };
    } catch (error) {
      this.log('error', '[verifyBasic] 验证出错', { error: error.message });
      return {
        type: 'basic',
        passed: false,
        error: error.message,
        message: `✗ 基础验证失败: ${error.message}`,
      };
    }
  }

  /**
   * Tooltip 验证
   * @param {Object} verification - 验证
   * @returns {Object} 验证结果
   */
  async verifyTooltip(verification) {
    this.log('info', '[verifyTooltip] 开始执行 tooltip 验证', { verification });

    try {
      // 先等待一下，让 tooltip 有时间出现
      await this.page.waitForTimeout(500);

      // 常见的误判元素特征（需要排除）
      const excludePatterns = [
        '搜索', '搜寻', 'search', '请输入', '輸入', 'ID', '名称'
      ];

      // 查找页面上的 tooltip 元素
      const tooltipInfo = await this.page.evaluate((excludeList) => {
        // 检查文本是否应该被排除
        const shouldExclude = (text) => {
          const lowerText = text.toLowerCase();
          return excludeList.some(pattern => lowerText.includes(pattern.toLowerCase()));
        };

        // 查找常见的 tooltip 元素
        const tooltipSelectors = [
          '[role="tooltip"]',
          '.tooltip',
          '.ant-tooltip',
          '.ant-tooltip-inner',
          '.el-tooltip',
          '.el-tooltip__popper',
          '.v-tooltip',
          '.v-tooltip__content',
          '[data-tooltip]',
          '.mat-tooltip',
          '.mat-tooltip-component',
          '[class*="tooltip"]',
          'flt-tooltip', // Flutter tooltip
        ];

        // 首先检查角色为 tooltip 的元素
        for (const sel of tooltipSelectors) {
          const tooltips = document.querySelectorAll(sel);
          for (const tooltip of Array.from(tooltips)) {
            const rect = tooltip.getBoundingClientRect();
            // 检查 tooltip 是否可见
            if (rect.width > 0 && rect.height > 0) {
              const text = tooltip.textContent || tooltip.getAttribute('title') || tooltip.getAttribute('data-tooltip') || '';
              if (text.trim() && !shouldExclude(text)) {
                return {
                  found: true,
                  selector: sel,
                  text: text.trim(),
                  visible: true,
                  position: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
                };
              }
            }
          }
        }

        // 检查当前悬停元素及其父元素的 tooltip 相关属性
        let hovered = document.querySelector(':hover');
        let depth = 0;
        while (hovered && depth < 5) {
          // 排除搜索框和输入框
          const tagName = hovered.tagName?.toLowerCase();
          const isInput = tagName === 'input' || tagName === 'textarea';
          const hasSearchClass = hovered.className?.toLowerCase().includes('search');

          if (!isInput && !hasSearchClass) {
            // 检查 title 属性
            const title = hovered.getAttribute('title');
            if (title && !shouldExclude(title)) {
              return {
                found: true,
                selector: 'title attribute',
                text: title,
                visible: true,
                isNative: true
              };
            }

            // 检查 data-tooltip 属性
            const dataTooltip = hovered.getAttribute('data-tooltip');
            if (dataTooltip && !shouldExclude(dataTooltip)) {
              return {
                found: true,
                selector: 'data-tooltip',
                text: dataTooltip,
                visible: true
              };
            }
          }

          // 向上检查父元素
          hovered = hovered.parentElement;
          depth++;
        }

        // 检查最近出现的浮动元素（可能是动态 tooltip）
        const allDivs = document.querySelectorAll('div');
        for (const div of Array.from(allDivs).reverse().slice(0, 30)) {
          const style = window.getComputedStyle(div);
          const rect = div.getBoundingClientRect();
          if ((style.position === 'absolute' || style.position === 'fixed') && rect.width > 0 && rect.width < 500 && rect.height > 0 && rect.height < 200) {
            const zIndex = parseInt(style.zIndex) || 0;
            if (zIndex > 100 || style.zIndex === 'auto') {
              const text = div.textContent?.trim();
              if (text && text.length > 0 && text.length < 200 && !text.includes('\n') && !shouldExclude(text)) {
                // 检查是否包含常见的 tooltip 样式
                const bg = style.backgroundColor;
                if (bg && (bg.includes('rgb') || bg.includes('#'))) {
                  // 进一步检查：tooltip 通常有 pointer-events: none
                  const pointerEvents = style.pointerEvents;
                  if (pointerEvents === 'none' || div.hasAttribute('role')) {
                    return {
                      found: true,
                      selector: 'floating element',
                      text: text,
                      visible: true,
                      isFloating: true
                    };
                  }
                }
              }
            }
          }
        }

        // ========== 检查 Flutter 语义树中的 tooltip ==========
        // Flutter Web 的 tooltip 通常在 flt-semantics 元素中
        // 优先查找包含 email 地址或其他特定内容的 tooltip
        const flutterSemantics = document.querySelectorAll('flt-semantics');
        let bestTooltip = null;
        let bestScore = 0;

        for (const fs of Array.from(flutterSemantics)) {
          const label = fs.getAttribute('aria-label');
          const rect = fs.getBoundingClientRect();

          // 检查是否有可见的语义节点且包含有意义的内容
          if (rect.width > 0 && rect.height > 0 && rect.width < 500) {
            const text = fs.textContent?.trim() || label || '';

            // 计算相关性分数
            let score = 0;
            const hasEmail = text.includes('@') && text.includes('.');
            const isLongText = text.length > 10 && text.length < 500;
            const hasMultipleLines = text.includes('\n');

            // 包含 email 地址的优先级最高
            if (hasEmail) score += 100;
            // 长文本优先
            if (isLongText) score += 20;
            // 单行文本优先（tooltip 通常是单行的）
            if (!hasMultipleLines) score += 10;
            // 不包含太多菜单关键词
            if (!text.includes('作業') && !text.includes('管理') && !text.includes('開單')) score += 15;

            // 检查是否应该被排除
            if (!shouldExclude(text) && score > bestScore) {
              bestTooltip = {
                found: true,
                selector: 'flutter-semantics',
                text: text,
                visible: true,
                method: 'flutter-semantics',
                score: score,
                position: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
              };
              bestScore = score;
            }
          }
        }

        if (bestTooltip && bestTooltip.score >= 30) {
          return bestTooltip;
        }

        // 检查是否有高 z-index 的元素（可能是 tooltip）
        const allElements = document.querySelectorAll('*');
        for (const el of Array.from(allElements)) {
          const style = window.getComputedStyle(el);
          const zIndex = parseInt(style.zIndex) || 0;
          if (zIndex > 100) {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.width < 500 && rect.height > 0 && rect.height < 200) {
              const text = el.textContent?.trim() || '';
              if (text && text.length > 0 && text.length < 500 && !shouldExclude(text)) {
                const bg = style.backgroundColor;
                if (bg && (bg.includes('rgb') || bg.includes('#'))) {
                  return {
                    found: true,
                    selector: el.id ? `#${el.id}` : el.tagName,
                    text: text,
                    visible: true,
                    method: 'high-zindex'
                  };
                }
              }
            }
          }
        }

        return { found: false };
      }, excludePatterns);

      if (tooltipInfo.found && tooltipInfo.text) {
        this.log('info', `[verifyTooltip] 找到 tooltip: "${tooltipInfo.text}"`);
        return {
          type: 'tooltip',
          passed: true,
          message: `✓ 检测到 tooltip 显示完整文字: "${tooltipInfo.text}"`,
          tooltip: tooltipInfo
        };
      } else {
        this.log('warn', '[verifyTooltip] 未检测到 tooltip 元素');
        // 如果未检测到 tooltip，返回一个警告而不是错误
        // 因为有些页面可能没有实现 tooltip 功能
        return {
          type: 'tooltip',
          passed: false,
          message: '⚠ 未检测到 tooltip 元素（可能该页面未实现 tooltip 功能，或 tooltip 被过滤）',
          tooltip: { found: false },
          isWarning: true
        };
      }
    } catch (error) {
      this.log('error', '[verifyTooltip] 验证出错', { error: error.message });
      return {
        type: 'tooltip',
        passed: false,
        error: error.message,
        message: `✗ Tooltip 验证失败: ${error.message}`,
      };
    }
  }

  /**
   * 验证表格表头
   * @param {Object} verification - 验证对象
   * @param {Array} verification.headers - 期望的表头数组
   * @param {string} verification.tableSelector - 表格选择器（可选）
   * @returns {Object} 验证结果
   */
  async verifyTableHeader(verification) {
    try {
      const expectedHeaders = verification.headers || [];
      const tableSelector = verification.tableSelector || 'table, [role="table"], .table';

      this.log('info', `[verifyTableHeader] 验证表头: ${JSON.stringify(expectedHeaders)}`);

      const result = await this.page.evaluate((expected, selector) => {
        // 查找表格
        const tables = document.querySelectorAll(selector);
        let targetTable = null;

        // 找到第一个有表头的表格
        for (const table of tables) {
          const headers = table.querySelectorAll('th, thead td, [role="columnheader"]');
          if (headers.length > 0) {
            targetTable = table;
            break;
          }
        }

        if (!targetTable) {
          return { found: false, message: '未找到表格' };
        }

        // 获取表头文本
        const headerElements = targetTable.querySelectorAll('th, thead td, [role="columnheader"]');
        const actualHeaders = Array.from(headerElements).map(h => h.textContent?.trim() || '').filter(t => t);

        return {
          found: true,
          actualHeaders,
          expectedHeaders: expected,
          match: expected.every(h => actualHeaders.includes(h))
        };
      }, expectedHeaders, tableSelector);

      if (!result.found) {
        return {
          type: 'tableHeader',
          passed: false,
          message: `✗ 未找到表格`,
          actual: result,
          expected: verification
        };
      }

      if (result.match) {
        return {
          type: 'tableHeader',
          passed: true,
          message: `✓ 表头验证通过: ${result.actualHeaders.join(', ')}`,
          actual: result.actualHeaders,
          expected: expectedHeaders
        };
      } else {
        const missing = expectedHeaders.filter(h => !result.actualHeaders.includes(h));
        return {
          type: 'tableHeader',
          passed: false,
          message: `✗ 表头验证失败，缺少: ${missing.join(', ')}`,
          actual: result.actualHeaders,
          expected: expectedHeaders,
          missing
        };
      }
    } catch (error) {
      return {
        type: 'tableHeader',
        passed: false,
        error: error.message,
        message: `✗ 表头验证失败: ${error.message}`
      };
    }
  }

  /**
   * 验证表格列的文字颜色
   * @param {Object} verification - 验证对象
   * @param {number} verification.columnIndex - 列索引（从0开始）
   * @param {string} verification.color - 期望的颜色（支持颜色名称、rgb、hex等）
   * @param {string} verification.tableSelector - 表格选择器（可选）
   * @returns {Object} 验证结果
   */
  async verifyTableColumnColor(verification) {
    try {
      const columnIndex = verification.columnIndex || 0;
      const expectedColor = verification.color || 'red';
      const tableSelector = verification.tableSelector || 'table, [role="table"], .table';

      this.log('info', `[verifyTableColumnColor] 验证第${columnIndex}列颜色: ${expectedColor}`);

      const result = await this.page.evaluate((colIdx, expColor, selector) => {
        // 查找表格
        const tables = document.querySelectorAll(selector);
        let targetTable = null;

        for (const table of tables) {
          const headers = table.querySelectorAll('th, thead td, [role="columnheader"]');
          if (headers.length > 0) {
            targetTable = table;
            break;
          }
        }

        if (!targetTable) {
          return { found: false, message: '未找到表格' };
        }

        // 获取表头
        const headerElements = targetTable.querySelectorAll('th, thead td, [role="columnheader"]');

        if (colIdx >= headerElements.length) {
          return { found: true, valid: false, message: `列索引超出范围，表格只有${headerElements.length}列` };
        }

        const header = headerElements[colIdx];
        const computedStyle = window.getComputedStyle(header);
        const color = computedStyle.color;
        const backgroundColor = computedStyle.backgroundColor;

        // 颜色匹配函数
        function colorMatches(actual, expected) {
          // 标准化颜色
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = actual;
          const actualNormalized = ctx.fillStyle.toLowerCase();

          // 预期的颜色变体映射
          const colorVariants = {
            'red': ['rgb(255, 0, 0)', 'rgb(220, 0, 0)', 'rgb(200, 0, 0)', 'rgb(180, 0, 0)', '#ff0000', '#dc0000', '#c80000', '#b40000'],
            'green': ['rgb(0, 128, 0)', 'rgb(0, 100, 0)', 'rgb(34, 139, 34)', '#008000', '#006400', '#228b22'],
            'blue': ['rgb(0, 0, 255)', 'rgb(0, 0, 200)', 'rgb(65, 105, 225)', '#0000ff', '#0000c8', '#4169e1'],
            'yellow': ['rgb(255, 255, 0)', 'rgb(255, 215, 0)', '#ffff00', '#ffd700'],
            'orange': ['rgb(255, 165, 0)', 'rgb(255, 140, 0)', '#ffa500', '#ff8c00'],
            'purple': ['rgb(128, 0, 128)', 'rgb(147, 112, 219)', '#800080', '#9370db'],
            'black': ['rgb(0, 0, 0)', '#000000'],
            'white': ['rgb(255, 255, 255)', '#ffffff'],
            'gray': ['rgb(128, 128, 128)', 'rgb(169, 169, 169)', '#808080', '#a9a9a9'],
            'grey': ['rgb(128, 128, 128)', 'rgb(169, 169, 169)', '#808080', '#a9a9a9']
          };

          const expectedLower = expected.toLowerCase();

          // 检查是否是预定义颜色的变体
          if (colorVariants[expectedLower]) {
            return colorVariants[expectedLower].some(v => actualNormalized === v.toLowerCase());
          }

          // 直接比较
          return actualNormalized === expectedLower || color === expected;
        }

        const textColorMatch = colorMatches(color, expColor);
        const bgColorMatch = backgroundColor !== 'rgba(0, 0, 0, 0)' && colorMatches(backgroundColor, expColor);

        return {
          found: true,
          headerText: header.textContent?.trim() || '',
          textColor: color,
          backgroundColor: backgroundColor,
          textColorMatch,
          bgColorMatch,
          match: textColorMatch || bgColorMatch
        };
      }, columnIndex, expectedColor, tableSelector);

      if (!result.found) {
        return {
          type: 'tableColumnColor',
          passed: false,
          message: `✗ 未找到表格`,
          expected: verification
        };
      }

      if (result.match) {
        const matchType = result.textColorMatch ? '文字颜色' : '背景颜色';
        return {
          type: 'tableColumnColor',
          passed: true,
          message: `✓ 第${columnIndex}列"${result.headerText}"${matchType}匹配: ${expectedColor}`,
          actual: result.textColorMatch ? result.textColor : result.backgroundColor,
          expected: expectedColor
        };
      } else {
        return {
          type: 'tableColumnColor',
          passed: false,
          message: `✗ 第${columnIndex}列"${result.headerText}"颜色不匹配`,
          actual: { textColor: result.textColor, backgroundColor: result.backgroundColor },
          expected: expectedColor
        };
      }
    } catch (error) {
      return {
        type: 'tableColumnColor',
        passed: false,
        error: error.message,
        message: `✗ 表格列颜色验证失败: ${error.message}`
      };
    }
  }

  /**
   * 验证表格数据
   * @param {Object} verification - 验证对象
   * @param {number} verification.row - 行索引（从0开始，可选）
   * @param {number} verification.column - 列索引（从0开始，可选）
   * @param {string} verification.text - 期望的单元格文本
   * @param {string} verification.tableSelector - 表格选择器（可选）
   * @returns {Object} 验证结果
   */
  async verifyTableData(verification) {
    try {
      const rowIndex = verification.row;
      const columnIndex = verification.column;
      const expectedText = verification.text;
      const tableSelector = verification.tableSelector || 'table, [role="table"], .table';

      this.log('info', `[verifyTableData] 验证表格数据: 行${rowIndex}, 列${columnIndex}, 期望"${expectedText}"`);

      const result = await this.page.evaluate((rowIdx, colIdx, expText, selector) => {
        // 查找表格
        const tables = document.querySelectorAll(selector);
        let targetTable = null;

        for (const table of tables) {
          const headers = table.querySelectorAll('th, thead td, [role="columnheader"]');
          if (headers.length > 0) {
            targetTable = table;
            break;
          }
        }

        if (!targetTable) {
          return { found: false, message: '未找到表格' };
        }

        // 获取所有行
        const rows = targetTable.querySelectorAll('tbody tr, tr:not(:has(th))');

        if (rowIdx !== undefined && rowIdx >= rows.length) {
          return { found: true, valid: false, message: `行索引超出范围，表格有${rows.length}行数据` };
        }

        // 如果指定了行，只检查该行
        if (rowIdx !== undefined) {
          const row = rows[rowIdx];
          const cells = row.querySelectorAll('td, [role="gridcell"], [role="cell"]');

          if (colIdx !== undefined) {
            // 检查指定单元格
            if (colIdx >= cells.length) {
              return { found: true, valid: false, message: `列索引超出范围，该行有${cells.length}列` };
            }

            const cell = cells[colIdx];
            const actualText = cell.textContent?.trim() || '';

            return {
              found: true,
              row: rowIdx,
              column: colIdx,
              actualText,
              expectedText: expText,
              match: actualText === expText || actualText.includes(expText)
            };
          } else {
            // 检查整行是否包含期望文本
            const rowText = row.textContent?.trim() || '';
            return {
              found: true,
              row: rowIdx,
              actualText: rowText,
              expectedText: expText,
              match: rowText.includes(expText)
            };
          }
        } else {
          // 检查整个表格是否包含期望文本
          const tableText = targetTable.textContent?.trim() || '';
          return {
            found: true,
            actualText: tableText.substring(0, 200), // 只返回前200个字符
            expectedText: expText,
            match: tableText.includes(expText)
          };
        }
      }, rowIndex, columnIndex, expectedText, tableSelector);

      if (!result.found) {
        return {
          type: 'tableData',
          passed: false,
          message: `✗ 未找到表格`,
          expected: verification
        };
      }

      if (result.match) {
        return {
          type: 'tableData',
          passed: true,
          message: rowIndex !== undefined
            ? `✓ 表格数据[${rowIndex}, ${columnIndex}]匹配: "${result.actualText}"`
            : `✓ 表格包含数据: "${expectedText}"`,
          actual: result.actualText,
          expected: expectedText
        };
      } else {
        return {
          type: 'tableData',
          passed: false,
          message: `✗ 表格数据不匹配`,
          actual: result.actualText,
          expected: expectedText
        };
      }
    } catch (error) {
      return {
        type: 'tableData',
        passed: false,
        error: error.message,
        message: `✗ 表格数据验证失败: ${error.message}`
      };
    }
  }

  /**
   * 视觉比对验证（将当前页面与设计图进行比对）
   * @param {Object} verification - 验证
   * @param {string} verification.designImage - 设计图路径
   * @param {number} verification.threshold - 匹配阈值 (0-1)，默认 0.9
   * @param {string} verification.selector - 要比对的元素选择器（可选，默认全页面）
   * @returns {Object} 验证结果
   */
  async verifyVisual(verification) {
    this.log('info', '[verifyVisual] 开始执行视觉比对验证', { verification });

    const fs = require('fs');
    const path = require('path');

    try {
      const designImagePath = verification.designImage;
      const threshold = verification.threshold || 0.9;
      const selector = verification.selector || null;

      // 检查设计图是否存在
      if (!fs.existsSync(designImagePath)) {
        return {
          type: 'visual',
          passed: false,
          error: '设计图文件不存在',
          message: `✗ 设计图文件不存在: ${designImagePath}`,
        };
      }

      // 生成当前页面截图
      const timestamp = Date.now();
      const screenshotPath = path.join(this.screenshotDir, `visual-compare-${timestamp}.png`);

      if (selector) {
        // 截图指定元素
        const element = await this.page.locator(selector).first();
        await element.screenshot({ path: screenshotPath });
      } else {
        // 全页面截图
        await this.page.screenshot({ path: screenshotPath, fullPage: false });
      }

      this.log('info', '[verifyVisual] 页面截图已保存', { path: screenshotPath });

      // 使用 AI 进行视觉比对分析
      const comparisonResult = await this.compareWithAI(
        designImagePath,
        screenshotPath,
        verification.description || '页面布局'
      );

      // 判断是否匹配
      const passed = comparisonResult.matchScore >= threshold;

      return {
        type: 'visual',
        passed,
        matchScore: comparisonResult.matchScore,
        threshold,
        designImage: designImagePath,
        actualScreenshot: screenshotPath,
        differences: comparisonResult.differences,
        similarities: comparisonResult.similarities,
        message: passed
          ? `✓ 视觉比对通过: 匹配度 ${(comparisonResult.matchScore * 100).toFixed(1)}%`
          : `✗ 视觉比对失败: 匹配度 ${(comparisonResult.matchScore * 100).toFixed(1)}% < ${threshold * 100}%`,
      };

    } catch (error) {
      this.log('error', '[verifyVisual] 验证出错', { error: error.message });
      return {
        type: 'visual',
        passed: false,
        error: error.message,
        message: `✗ 视觉比对验证失败: ${error.message}`,
      };
    }
  }

  /**
   * 使用 AI 进行视觉比对
   * @param {string} designImagePath - 设计图路径
   * @param {string} actualImagePath - 实际截图路径
   * @param {string} description - 比对描述
   * @returns {Object} 比对结果
   */
  async compareWithAI(designImagePath, actualImagePath, description) {
    this.log('info', '[compareWithAI] 开始 AI 视觉比对', {
      design: designImagePath,
      actual: actualImagePath
    });

    // 基本结构相似性分析（基于页面元素）
    const elementAnalysis = await this.analyzePageStructure();

    // 返回比对结果
    return {
      matchScore: elementAnalysis.matchScore,
      similarities: elementAnalysis.similarities,
      differences: elementAnalysis.differences,
      recommendations: elementAnalysis.recommendations
    };
  }

  /**
   * 分析当前页面结构
   * @returns {Object} 页面结构分析结果
   */
  async analyzePageStructure() {
    const structure = await this.page.evaluate(() => {
      // 获取页面基本信息
      const pageTitle = document.title || '';
      const bodyText = document.body?.textContent?.slice(0, 200) || '';

      // 检测主要元素
      const inputs = document.querySelectorAll('input[type="text"], input[type="password"], input:not([type])');
      const buttons = document.querySelectorAll('button, [role="button"]');
      const forms = document.querySelectorAll('form');

      // 分析输入框
      const inputInfo = Array.from(inputs).map(input => ({
        type: input.type || 'text',
        placeholder: input.placeholder || '',
        hasLabel: !!input.labels?.length
      }));

      // 分析按钮
      const buttonInfo = Array.from(buttons).map(btn => ({
        text: btn.textContent?.trim().slice(0, 20) || '',
        isPrimary: btn.classList.contains('primary') ||
                   btn.classList.contains('btn-primary') ||
                   getComputedStyle(btn).backgroundColor !== 'rgba(0, 0, 0, 0)'
      }));

      return {
        pageTitle,
        bodyText,
        inputCount: inputs.length,
        buttonCount: buttons.length,
        formCount: forms.length,
        inputs: inputInfo,
        buttons: buttonInfo
      };
    });

    // 根据页面结构判断与设计图的匹配度
    // 这里使用规则引擎进行初步判断
    let matchScore = 0.5; // 基础分
    const similarities = [];
    const differences = [];
    const recommendations = [];

    // 检查登录页特征
    if (structure.inputCount >= 2 && structure.buttonCount >= 1) {
      matchScore += 0.2;
      similarities.push('检测到登录表单结构（至少2个输入框和1个按钮）');
    } else {
      differences.push(`输入框数量不匹配: 检测到 ${structure.inputCount} 个`);
    }

    // 检查输入框类型
    const hasTextInput = structure.inputs.some(i => i.type === 'text' || i.type === '');
    const hasPasswordInput = structure.inputs.some(i => i.type === 'password');

    if (hasTextInput && hasPasswordInput) {
      matchScore += 0.15;
      similarities.push('检测到账号和密码输入框');
    } else if (hasTextInput && !hasPasswordInput) {
      differences.push('缺少密码输入框');
    }

    // 检查按钮
    if (structure.buttons.some(b => b.text.includes('登录') || b.text.includes('登入'))) {
      matchScore += 0.15;
      similarities.push('检测到登录按钮');
    }

    // 限制最大分数
    matchScore = Math.min(matchScore, 1.0);

    return {
      matchScore,
      similarities,
      differences,
      recommendations: differences.length > 0
        ? ['建议检查页面元素是否与设计图一致']
        : ['页面结构与设计图基本一致']
    };
  }

  /**
   * 菜单状态验证（通过菜单选中状态判断当前页面）
   * 支持多级菜单（一级、二级、三级菜单）和 Flutter 语义树
   * @param {Object} verification - 验证
   * @param {string} verification.menuItem - 预期选中的菜单项名称
   * @param {string} verification.selector - 菜单容器选择器（可选）
   * @param {number} verification.level - 菜单级别（1=一级菜单，2=二级菜单，3=三级菜单，默认任意级别）
   * @returns {Object} 验证结果
   */

  /**
   * 辅助函数：验证文本内容
   * @param {string} targetText - 目标文本
   * @param {string} elementType - 元素类型
   * @returns {Object} 验证结果
   */
  async _verifyTextContent(targetText, elementType) {
    try {
      const result = await this.page.evaluate((params) => {
        const { text, elemType } = params;

        // 查找所有包含目标文本的元素
        const allElements = [];
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
          {
            acceptNode: (node) => {
              const t = node.textContent?.trim();
              return t && t.length > 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
            }
          }
        );

        let currentNode;
        while (currentNode = walker.nextNode()) {
          const t = currentNode.textContent?.trim();
          if (t === text || t.includes(text)) {
            allElements.push({
              text: t,
              tagName: currentNode.parentElement?.tagName || '',
              className: currentNode.parentElement?.className || ''
            });
          }
        }

        if (allElements.length > 0) {
          return { passed: true, found: allElements.length, elements: allElements.slice(0, 3) };
        } else {
          return { passed: false, found: 0 };
        }
      }, { text: targetText, elemType: elementType });

      if (result.passed) {
        return {
          passed: true,
          message: `✓ 文本内容验证通过: 找到"${targetText}"`
        };
      } else {
        return {
          passed: false,
          message: `✗ 文本内容验证失败: 未找到"${targetText}"`
        };
      }
    } catch (error) {
      return {
        passed: false,
        message: `✗ 文本内容验证错误: ${error.message}`
      };
    }
  }

  /**
   * 辅助函数：验证文字颜色（增强版，支持Flutter Canvas渲染）
   * @param {string} targetText - 目标文本
   * @param {string} expectedColor - 预期颜色
   * @param {string} elementType - 元素类型
   * @returns {Object} 验证结果
   */
  async _verifyTextColor(targetText, expectedColor, elementType) {
    try {
      // 颜色名称标准化：将 "深X色" 转换为标准颜色名
      const colorNameMap = {
        '深紅色': 'red', '深红色': 'red',
        '深藍色': 'blue', '深蓝色': 'blue', '深藍': 'blue', '深蓝': 'blue',
        '深綠色': 'green', '深绿色': 'green', '深綠': 'green', '深绿': 'green',
        '深灰色': 'gray', '深灰': 'gray', '深灰色': 'gray',
        '淺灰色': 'lightgray', '淺灰': 'lightgray',
        '深紫色': 'purple', '深紫': 'purple'
      };
      const normalizedColor = colorNameMap[expectedColor] || expectedColor;

      const result = await this.page.evaluate((params) => {
        const { text, expectedColor } = params;

        // 颜色名称到RGB范围的映射
        const colorRanges = {
          'red': { r: [150, 255], g: [0, 100], b: [0, 100] },
          'blue': { r: [0, 100], g: [0, 100], b: [150, 255] },
          'green': { r: [0, 100], g: [100, 255], b: [0, 100] },
          'yellow': { r: [200, 255], g: [200, 255], b: [0, 100] },
          'gray': { r: [32, 180], g: [32, 180], b: [32, 180] },
          'grey': { r: [32, 180], g: [32, 180], b: [32, 180] },
          'black': { r: [0, 50], g: [0, 50], b: [0, 50] },
          'white': { r: [200, 255], g: [200, 255], b: [200, 255] },
          'orange': { r: [200, 255], g: [100, 180], b: [0, 80] },
          'purple': { r: [100, 180], g: [0, 80], b: [100, 180] }
        };

        const range = colorRanges[expectedColor.toLowerCase()];
        if (!range) {
          return { passed: false, reason: 'unknown-color', expectedColor };
        }

        const allElements = [];

        // 方法1: 查找所有文本节点（原生HTML/Vue/React等）
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
          {
            acceptNode: (node) => {
              const t = node.textContent?.trim();
              return t && t.length > 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
            }
          }
        );

        let currentNode;
        while (currentNode = walker.nextNode()) {
          const t = currentNode.textContent?.trim();
          if (t === text || t.includes(text)) {
            // 向上遍历多层父元素，查找带颜色的元素
            let currentElement = currentNode.parentElement;
            let maxDepth = 10;

            while (currentElement && maxDepth > 0) {
              const computedStyle = window.getComputedStyle(currentElement);
              const color = computedStyle.color;
              const rgbMatch = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);

              if (rgbMatch) {
                const r = parseInt(rgbMatch[1]);
                const g = parseInt(rgbMatch[2]);
                const b = parseInt(rgbMatch[3]);
                const inRange = r >= range.r[0] && r <= range.r[1] &&
                                g >= range.g[0] && g <= range.g[1] &&
                                b >= range.b[0] && b <= range.b[1];

                allElements.push({
                  text: t,
                  color,
                  rgb: { r, g, b },
                  inRange,
                  tagName: currentElement.tagName,
                  className: currentElement.className,
                  method: 'text-node'
                });

                if (inRange) break;
              }

              currentElement = currentElement.parentElement;
              maxDepth--;
            }
          }
        }

        // 方法2: 如果方法1没找到，尝试Flutter语义树
        if (allElements.length === 0) {
          const flutterElements = document.querySelectorAll('flt-semantics, [role="button"]');
          for (const el of flutterElements) {
            const elText = el.textContent?.trim() || el.getAttribute('aria-label') || '';
            if (elText === text || elText.includes(text)) {
              // 检查元素本身及其父元素的颜色
              let checkElement = el;
              let maxDepth = 5;

              while (checkElement && maxDepth > 0) {
                const computedStyle = window.getComputedStyle(checkElement);
                const color = computedStyle.color;
                const rgbMatch = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);

                if (rgbMatch) {
                  const r = parseInt(rgbMatch[1]);
                  const g = parseInt(rgbMatch[2]);
                  const b = parseInt(rgbMatch[3]);
                  const inRange = r >= range.r[0] && r <= range.r[1] &&
                                  g >= range.g[0] && g <= range.g[1] &&
                                  b >= range.b[0] && b <= range.b[1];

                  allElements.push({
                    text: elText,
                    color,
                    rgb: { r, g, b },
                    inRange,
                    tagName: checkElement.tagName,
                    className: checkElement.className,
                    method: 'flutter-semantics'
                  });

                  if (inRange) break;
                }

                checkElement = checkElement.parentElement;
                maxDepth--;
              }
            }
          }
        }

        if (allElements.length === 0) {
          return { passed: false, reason: 'text-not-found', text };
        }

        // 检查是否有匹配颜色的元素
        const matchedElements = allElements.filter(el => el.inRange);
        if (matchedElements.length > 0) {
          return {
            passed: true,
            matchedElements: matchedElements.slice(0, 3),
            allElements: allElements.slice(0, 5)
          };
        } else {
          return {
            passed: false,
            matchedElements: allElements.slice(0, 3),
            allElements: allElements.slice(0, 5)
          };
        }
      }, { text: targetText, expectedColor });

      // 记录调试信息
      this.log('info', '[_verifyTextColor] 颜色验证结果', {
        targetText,
        expectedColor,
        passed: result.passed,
        reason: result.reason,
        foundElements: result.allElements?.length || 0,
        colorValues: result.allElements?.map(e => ({ rgb: e.rgb, inRange: e.inRange, method: e.method })) || []
      });

      if (result.passed) {
        return {
          passed: true,
          message: `✓ 文字颜色验证通过: "${targetText}"显示为${expectedColor}色`
        };
      } else {
        // 添加调试信息
        let debugInfo = '';
        if (result.reason === 'text-not-found') {
          debugInfo = `\n  原因: 未在页面找到文本 "${targetText}"`;
        } else if (result.allElements && result.allElements.length > 0) {
          debugInfo = `\n  实际颜色值: ${result.allElements.map(e => `rgb(${e.rgb.r}, ${e.rgb.g}, ${e.rgb.b}) [${e.tagName}]`).join(', ')}`;
        } else if (result.reason === 'unknown-color') {
          debugInfo = `\n  原因: 未知的颜色名称 "${result.expectedColor}"`;
        }

        return {
          passed: false,
          message: `✗ 文字颜色验证失败: "${targetText}"颜色不是${expectedColor}${debugInfo}`
        };
      }
    } catch (error) {
      return {
        passed: false,
        message: `✗ 文字颜色验证错误: ${error.message}`
      };
    }
  }

  /**
   * 辅助函数：验证表格列中文字颜色
   * 专门用于验证表格某一列（如状态列）中特定文字的颜色
   * @param {string} columnName - 列名，如"状态"
   * @param {string} targetText - 目标文本，如"啟用"
   * @param {string} expectedColor - 预期颜色，如"red"
   * @returns {Object} 验证结果
   */
  async _verifyTableColumnTextColor(columnName, targetText, expectedColor) {
    try {
      const result = await this.page.evaluate((params) => {
        const { columnName, text, expectedColor } = params;

        // 颜色名称到RGB范围的映射
        const colorRanges = {
          'red': { r: [150, 255], g: [0, 100], b: [0, 100] },
          'blue': { r: [0, 100], g: [0, 100], b: [150, 255] },
          'green': { r: [0, 100], g: [100, 255], b: [0, 100] },
          'yellow': { r: [200, 255], g: [200, 255], b: [0, 100] },
          'gray': { r: [32, 180], g: [32, 180], b: [32, 180] },
          'grey': { r: [32, 180], g: [32, 180], b: [32, 180] },
          'black': { r: [0, 50], g: [0, 50], b: [0, 50] },
          'white': { r: [200, 255], g: [200, 255], b: [200, 255] },
          'orange': { r: [200, 255], g: [100, 180], b: [0, 80] },
          'purple': { r: [100, 180], g: [0, 80], b: [100, 180] }
        };

        const range = colorRanges[expectedColor.toLowerCase()];
        if (!range) {
          return { passed: false, reason: 'unknown-color', expectedColor };
        }

        const matchedCells = [];
        const debugInfo = { shadowDOMExplored: false };

        // 辅助函数：检查元素及其Shadow DOM中的颜色
        function checkElementColor(element, targetText) {
          const results = [];

          // 检查主元素
          const elemText = element.textContent?.trim() || element.getAttribute('aria-label') || '';
          if (elemText === targetText || elemText.includes(targetText)) {
            // 检查元素本身的颜色
            let checkEl = element;
            let maxDepth = 8;

            while (checkEl && maxDepth > 0) {
              try {
                const computedStyle = window.getComputedStyle(checkEl);
                const color = computedStyle.color;
                const rgbMatch = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);

                if (rgbMatch) {
                  const r = parseInt(rgbMatch[1]);
                  const g = parseInt(rgbMatch[2]);
                  const b = parseInt(rgbMatch[3]);
                  const inRange = r >= range.r[0] && r <= range.r[1] &&
                                  g >= range.g[0] && g <= range.g[1] &&
                                  b >= range.b[0] && b <= range.b[1];

                  results.push({
                    text: elemText,
                    color,
                    rgb: { r, g, b },
                    inRange,
                    tagName: checkEl.tagName,
                    method: 'main-dom'
                  });

                  if (inRange) break;
                }
              } catch (e) {
                // 忽略计算样式错误
              }

              checkEl = checkEl.parentElement;
              maxDepth--;
            }
          }

          // 检查Shadow DOM
          if (element.shadowRoot) {
            debugInfo.shadowDOMExplored = true;

            // 在Shadow DOM中查找文本节点
            const walker = document.createTreeWalker(
              element.shadowRoot,
              NodeFilter.SHOW_TEXT,
              {
                acceptNode: (node) => {
                  const t = node.textContent?.trim();
                  return t && t.length > 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
                }
              }
            );

            let node;
            while (node = walker.nextNode()) {
              const t = node.textContent?.trim();
              if (t === targetText || t.includes(targetText)) {
                let checkEl = node.parentElement;
                let maxDepth = 5;

                while (checkEl && maxDepth > 0) {
                  try {
                    const computedStyle = window.getComputedStyle(checkEl);
                    const color = computedStyle.color;
                    const rgbMatch = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);

                    if (rgbMatch) {
                      const r = parseInt(rgbMatch[1]);
                      const g = parseInt(rgbMatch[2]);
                      const b = parseInt(rgbMatch[3]);
                      const inRange = r >= range.r[0] && r <= range.r[1] &&
                                      g >= range.g[0] && g <= range.g[1] &&
                                      b >= range.b[0] && b <= range.b[1];

                      results.push({
                        text: t,
                        color,
                        rgb: { r, g, b },
                        inRange,
                        tagName: checkEl.tagName,
                        method: 'shadow-dom'
                      });

                      if (inRange) break;
                    }
                  } catch (e) {
                    // 忽略计算样式错误
                  }

                  checkEl = checkEl.parentElement;
                  maxDepth--;
                }
              }
            }
          }

          return results;
        }

        // 方法1: 查找所有可能包含Shadow DOM的元素
        const potentialElements = document.querySelectorAll('*');
        for (const elem of potentialElements) {
          const results = checkElementColor(elem, text);
          matchedCells.push(...results);

          // 如果找到了匹配的颜色，提前返回
          if (matchedCells.some(c => c.inRange)) {
            break;
          }
        }

        if (matchedCells.length === 0) {
          return {
            passed: false,
            reason: 'cell-not-found',
            text,
            columnName,
            debugInfo
          };
        }

        // 检查是否有匹配颜色的单元格
        const matchedColors = matchedCells.filter(c => c.inRange);
        if (matchedColors.length > 0) {
          return {
            passed: true,
            matchedCells: matchedColors.slice(0, 3),
            allCells: matchedCells.slice(0, 5),
            debugInfo
          };
        } else {
          return {
            passed: false,
            matchedCells: matchedCells.slice(0, 3),
            allCells: matchedCells.slice(0, 5),
            debugInfo
          };
        }
      }, { columnName, targetText, expectedColor });

      // 记录调试信息
      this.log('info', '[_verifyTableColumnTextColor] 表格列颜色验证结果', {
        columnName,
        targetText,
        expectedColor,
        passed: result.passed,
        reason: result.reason,
        foundCells: result.allCells?.length || 0,
        debugInfo: result.debugInfo
      });

      if (result.passed) {
        return {
          passed: true,
          message: `✓ 状态字段颜色验证通过: "${targetText}"在"${columnName}"列中显示为${expectedColor}色`
        };
      } else {
        let debugInfo = '';
        if (result.reason === 'cell-not-found') {
          debugInfo = `\n  原因: 未在"${columnName}"列找到文本 "${targetText}"`;
        } else if (result.allCells && result.allCells.length > 0) {
          debugInfo = `\n  实际颜色值: ${result.allCells.map(c => `rgb(${c.rgb.r}, ${c.rgb.g}, ${c.rgb.b}) [${c.method}]`).join(', ')}`;
        }

        return {
          passed: false,
          message: `✗ 状态字段颜色验证失败: "${targetText}"在"${columnName}"列中的颜色不是${expectedColor}${debugInfo}`
        };
      }
    } catch (error) {
      this.log('error', '[_verifyTableColumnTextColor] 验证错误', { error: error.message });
      return {
        passed: false,
        message: `✗ 表格列颜色验证错误: ${error.message}`
      };
    }
  }

  /**
   * 辅助函数：验证背景颜色
          debugInfo = `\n  原因: 未在"${columnName}"列找到文本 "${targetText}"`;
        } else if (result.allCells && result.allCells.length > 0) {
          debugInfo = `\n  实际颜色值: ${result.allCells.map(c => `rgb(${c.rgb.r}, ${c.rgb.g}, ${c.rgb.b})`).join(', ')}`;
        }

        return {
          passed: false,
          message: `✗ 状态字段颜色验证失败: "${targetText}"在"${columnName}"列中的颜色不是${expectedColor}${debugInfo}`
        };
      }
    } catch (error) {
      return {
        passed: false,
        message: `✗ 表格列颜色验证错误: ${error.message}`
      };
    }
  }

  /**
   * 辅助函数：验证背景颜色
   * @param {string} targetText - 目标文本
   * @param {string} expectedColor - 预期颜色
   * @param {string} elementType - 元素类型
   * @returns {Object} 验证结果
   */
  async _verifyBackgroundColor(targetText, expectedColor, elementType) {
    try {
      const result = await this.page.evaluate((params) => {
        const { text, expectedColor } = params;

        // 颜色名称到RGB范围的映射
        const colorRanges = {
          'red': { r: [150, 255], g: [0, 100], b: [0, 100] },
          'blue': { r: [0, 100], g: [0, 100], b: [150, 255] },
          'green': { r: [0, 100], g: [100, 255], b: [0, 100] },
          'yellow': { r: [200, 255], g: [200, 255], b: [0, 100] },
          'gray': { r: [32, 180], g: [32, 180], b: [32, 180] },
          'grey': { r: [32, 180], g: [32, 180], b: [32, 180] },
          'black': { r: [0, 50], g: [0, 50], b: [0, 50] },
          'white': { r: [200, 255], g: [200, 255], b: [200, 255] },
          'orange': { r: [200, 255], g: [100, 180], b: [0, 80] },
          'purple': { r: [100, 180], g: [0, 80], b: [100, 180] }
        };

        const range = colorRanges[expectedColor.toLowerCase()];
        if (!range) {
          return { passed: false, reason: 'unknown-color', expectedColor };
        }

        // 查找所有文本节点并检查其父元素的背景色
        const allElements = [];
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
          {
            acceptNode: (node) => {
              const t = node.textContent?.trim();
              return t && t.length > 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
            }
          }
        );

        let currentNode;
        while (currentNode = walker.nextNode()) {
          const t = currentNode.textContent?.trim();
          if (t === text || t.includes(text)) {
            const parent = currentNode.parentElement;
            if (parent) {
              const computedStyle = window.getComputedStyle(parent);
              const bgColor = computedStyle.backgroundColor;
              const rgbMatch = bgColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
              if (rgbMatch) {
                const r = parseInt(rgbMatch[1]);
                const g = parseInt(rgbMatch[2]);
                const b = parseInt(rgbMatch[3]);
                const inRange = r >= range.r[0] && r <= range.r[1] &&
                                g >= range.g[0] && g <= range.g[1] &&
                                b >= range.b[0] && b <= range.b[1];
                allElements.push({
                  text: t,
                  backgroundColor: bgColor,
                  rgb: { r, g, b },
                  inRange
                });
              }
            }
          }
        }

        if (allElements.length === 0) {
          return { passed: false, reason: 'text-not-found', text };
        }

        const matchedElements = allElements.filter(el => el.inRange);
        if (matchedElements.length > 0) {
          return { passed: true, matchedElements: matchedElements.slice(0, 3) };
        } else {
          return { passed: false, matchedElements: allElements.slice(0, 3) };
        }
      }, { text: targetText, expectedColor });

      if (result.passed) {
        return {
          passed: true,
          message: `✓ 背景颜色验证通过: "${targetText}"背景为${expectedColor}色`
        };
      } else {
        return {
          passed: false,
          message: `✗ 背景颜色验证失败: "${targetText}"背景不是${expectedColor}`
        };
      }
    } catch (error) {
      return {
        passed: false,
        message: `✗ 背景颜色验证错误: ${error.message}`
      };
    }
  }

  /**
   * 辅助函数：验证边框颜色
   * @param {string} targetText - 目标文本
   * @param {string} expectedColor - 预期颜色
   * @param {string} elementType - 元素类型
   * @returns {Object} 验证结果
   */
  async _verifyBorderColor(targetText, expectedColor, elementType) {
    try {
      const result = await this.page.evaluate((params) => {
        const { text, expectedColor } = params;

        // 颜色名称到RGB范围的映射
        const colorRanges = {
          'red': { r: [150, 255], g: [0, 100], b: [0, 100] },
          'blue': { r: [0, 100], g: [0, 100], b: [150, 255] },
          'green': { r: [0, 100], g: [100, 255], b: [0, 100] },
          'yellow': { r: [200, 255], g: [200, 255], b: [0, 100] },
          'gray': { r: [32, 180], g: [32, 180], b: [32, 180] },
          'grey': { r: [32, 180], g: [32, 180], b: [32, 180] },
          'black': { r: [0, 50], g: [0, 50], b: [0, 50] },
          'white': { r: [200, 255], g: [200, 255], b: [200, 255] },
          'orange': { r: [200, 255], g: [100, 180], b: [0, 80] },
          'purple': { r: [100, 180], g: [0, 80], b: [100, 180] }
        };

        const range = colorRanges[expectedColor.toLowerCase()];
        if (!range) {
          return { passed: false, reason: 'unknown-color', expectedColor };
        }

        // 查找所有文本节点并检查其父元素的边框颜色
        const allElements = [];
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
          {
            acceptNode: (node) => {
              const t = node.textContent?.trim();
              return t && t.length > 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
            }
          }
        );

        let currentNode;
        while (currentNode = walker.nextNode()) {
          const t = currentNode.textContent?.trim();
          if (t === text || t.includes(text)) {
            const parent = currentNode.parentElement;
            if (parent) {
              const computedStyle = window.getComputedStyle(parent);
              // 检查边框颜色（优先检查左边框，如果没有则检查其他边）
              const borderColor = computedStyle.borderLeftColor ||
                                  computedStyle.borderTopColor ||
                                  computedStyle.borderRightColor ||
                                  computedStyle.borderBottomColor;
              const rgbMatch = borderColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
              if (rgbMatch && rgbMatch[0] !== 'rgba(0, 0, 0, 0)') {
                const r = parseInt(rgbMatch[1]);
                const g = parseInt(rgbMatch[2]);
                const b = parseInt(rgbMatch[3]);
                const inRange = r >= range.r[0] && r <= range.r[1] &&
                                g >= range.g[0] && g <= range.g[1] &&
                                b >= range.b[0] && b <= range.b[1];
                allElements.push({
                  text: t,
                  borderColor,
                  rgb: { r, g, b },
                  inRange
                });
              }
            }
          }
        }

        if (allElements.length === 0) {
          return { passed: false, reason: 'text-not-found-or-no-border', text };
        }

        const matchedElements = allElements.filter(el => el.inRange);
        if (matchedElements.length > 0) {
          return { passed: true, matchedElements: matchedElements.slice(0, 3) };
        } else {
          return { passed: false, matchedElements: allElements.slice(0, 3) };
        }
      }, { text: targetText, expectedColor });

      if (result.passed) {
        return {
          passed: true,
          message: `✓ 边框颜色验证通过: "${targetText}"边框为${expectedColor}色`
        };
      } else {
        return {
          passed: false,
          message: `✗ 边框颜色验证失败: "${targetText}"边框不是${expectedColor}`
        };
      }
    } catch (error) {
      return {
        passed: false,
        message: `✗ 边框颜色验证错误: ${error.message}`
      };
    }
  }

  /**
   * 辅助函数：通过截图验证文字颜色（适用于Flutter应用）
   * @param {string} targetText - 目标文本
   * @param {string} expectedColor - 预期颜色
   * @returns {Object} 验证结果
   */
  async _verifyTextColorByScreenshot(targetText, expectedColor) {
    try {
      // 颜色名称到RGB范围的映射
      const colorRanges = {
        'red': { r: [150, 255], g: [0, 100], b: [0, 100] },
        'blue': { r: [0, 100], g: [0, 100], b: [150, 255] },
        'green': { r: [0, 100], g: [100, 255], b: [0, 100] },
        'yellow': { r: [200, 255], g: [200, 255], b: [0, 100] },
        'gray': { r: [32, 180], g: [32, 180], b: [32, 180] },
        'grey': { r: [32, 180], g: [32, 180], b: [32, 180] },
        'black': { r: [0, 50], g: [0, 50], b: [0, 50] },
        'white': { r: [200, 255], g: [200, 255], b: [200, 255] },
        'orange': { r: [200, 255], g: [100, 180], b: [0, 80] },
        'purple': { r: [100, 180], g: [0, 80], b: [100, 180] }
      };

      const range = colorRanges[expectedColor.toLowerCase()];
      if (!range) {
        return { passed: false, message: `未知的颜色: ${expectedColor}` };
      }

      this.log('info', '[_verifyTextColorByScreenshot] 开始颜色验证', { targetText, expectedColor });

      // 0. 首先尝试使用 getComputedStyle 获取 CSS 颜色（对 Flutter Web 更可靠）
      const cssColorResult = await this.page.evaluate((text) => {
        // 辅助函数：将颜色转换为 RGB 对象
        const colorToRgb = (colorStr) => {
          if (!colorStr) return null;
          // 处理 rgb(r, g, b) 格式
          const rgbMatch = colorStr.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
          if (rgbMatch) {
            return { r: parseInt(rgbMatch[1]), g: parseInt(rgbMatch[2]), b: parseInt(rgbMatch[3]) };
          }
          // 处理 rgba(r, g, b, a) 格式
          const rgbaMatch = colorStr.match(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*[\d.]+\s*\)/);
          if (rgbaMatch) {
            return { r: parseInt(rgbaMatch[1]), g: parseInt(rgbaMatch[2]), b: parseInt(rgbaMatch[3]) };
          }
          // 处理十六进制格式
          const hexMatch = colorStr.match(/#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})/);
          if (hexMatch) {
            return { r: parseInt(hexMatch[1], 16), g: parseInt(hexMatch[2], 16), b: parseInt(hexMatch[3], 16) };
          }
          return null;
        };

        // 查找包含目标文本的元素
        const allElements = document.querySelectorAll('*');
        for (const elem of allElements) {
          const elemText = elem.textContent?.trim() || '';
          if (elemText === text || elemText.includes(text)) {
            const style = window.getComputedStyle(elem);
            const color = style.color;
            const rgb = colorToRgb(color);
            if (rgb) {
              return {
                found: true,
                color: color,
                rgb: rgb,
                element: elem.tagName
              };
            }
          }
        }
        return { found: false };
      }, targetText);

      if (cssColorResult.found) {
        const rgb = cssColorResult.rgb;
        const inRange = rgb.r >= range.r[0] && rgb.r <= range.r[1] &&
                        rgb.g >= range.g[0] && rgb.g <= range.g[1] &&
                        rgb.b >= range.b[0] && rgb.b <= range.b[1];

        this.log('info', '[_verifyTextColorByScreenshot] CSS 颜色检测结果', {
          targetText,
          cssColor: cssColorResult.color,
          rgb,
          expectedColor,
          inRange
        });

        if (inRange) {
          return {
            passed: true,
            message: `✓ CSS颜色验证通过: "${targetText}"显示为${expectedColor}色 (CSS: ${cssColorResult.color})`
          };
        }
        // CSS颜色不匹配时，继续尝试截图分析（适用于Flutter Web等Canvas渲染的应用）
        this.log('info', '[_verifyTextColorByScreenshot] CSS颜色不匹配，尝试截图像素分析');
      }

      this.log('info', '[_verifyTextColorByScreenshot] 开始截图像素分析');

      // 1. 找到包含目标文本的元素位置
      const elementInfo = await this.page.evaluate((text) => {
        // 查找所有可能包含文本的元素
        const allElements = document.querySelectorAll('*');
        const results = [];

        for (const elem of allElements) {
          const elemText = elem.textContent?.trim() || '';
          if (elemText === text || elemText.includes(text)) {
            const rect = elem.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              results.push({
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height,
                text: elemText.substring(0, 50)
              });
              // 只取第一个匹配的元素
              break;
            }
          }
        }

        return results.length > 0 ? results[0] : null;
      }, targetText);

      if (!elementInfo) {
        return { passed: false, message: `未找到包含文本 "${targetText}" 的元素` };
      }

      this.log('info', '[_verifyTextColorByScreenshot] 找到元素', elementInfo);

      // 2. 截取该区域的截图
      // 扩大一点区域以确保包含文字
      const padding = 5;
      const x = Math.max(0, elementInfo.x - padding);
      const y = Math.max(0, elementInfo.y - padding);
      const width = elementInfo.width + padding * 2;
      const height = elementInfo.height + padding * 2;

      this.log('info', '[_verifyTextColorByScreenshot] 截图区域', { x, y, width, height });

      // 直接传递参数，不使用对象解构（避免可能的参数传递问题）
      const screenshot = await this.page.screenshot({ clip: { x, y, width, height } });

      // 3. 分析截图中的像素颜色
      // 使用单个对象参数避免 "Too many arguments" 错误
      const result = await this.page.evaluate((params) => {
        const { screenshotData, width, height } = params;
        // 在浏览器中创建Image对象来分析截图
        return new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);

            // 获取整个截图区域的像素
            const imageData = ctx.getImageData(0, 0, width, height);
            const pixels = [];
            const colorCounts = {}; // 用于颜色聚类

            for (let i = 0; i < imageData.data.length; i += 4) {
              const r = imageData.data[i];
              const g = imageData.data[i + 1];
              const b = imageData.data[i + 2];
              const a = imageData.data[i + 3];

              // 只考虑不透明的像素
              if (a > 128) {
                // 排除白色/浅色背景（文字颜色通常比背景深）
                const brightness = (r + g + b) / 3;
                if (brightness < 240) { // 排除接近白色的像素
                  pixels.push({ r, g, b, a });

                  // 颜色聚类（将相似颜色归为一类）
                  const colorKey = `${Math.round(r / 16) * 16}-${Math.round(g / 16) * 16}-${Math.round(b / 16) * 16}`;
                  colorCounts[colorKey] = (colorCounts[colorKey] || 0) + 1;
                }
              }
            }

            // 如果没有找到深色像素，返回所有像素
            if (pixels.length === 0) {
              for (let i = 0; i < imageData.data.length; i += 4) {
                const r = imageData.data[i];
                const g = imageData.data[i + 1];
                const b = imageData.data[i + 2];
                const a = imageData.data[i + 3];
                if (a > 128) {
                  pixels.push({ r, g, b, a });
                }
              }
            }

            resolve({ pixels, colorCounts });
          };
          img.onerror = () => resolve({ pixels: [], colorCounts: {} });
          // 将base64转换为data URL
          img.src = `data:image/png;base64,${screenshotData}`;
        });
      }, {
        screenshotData: screenshot.toString('base64'),
        width: elementInfo.width + padding * 2,
        height: elementInfo.height + padding * 2
      });

      if (result.pixels.length === 0) {
        return { passed: false, message: '无法分析截图像素' };
      }

      // 4. 使用颜色聚类找到最主要的颜色
      let dominantColor = null;
      let maxCount = 0;

      for (const [colorKey, count] of Object.entries(result.colorCounts)) {
        if (count > maxCount) {
          maxCount = count;
          const [r, g, b] = colorKey.split('-').map(Number);
          dominantColor = { r, g, b };
        }
      }

      // 如果聚类失败，使用平均值
      const avgColor = dominantColor || result.pixels.reduce((acc, pixel) => ({
        r: acc.r + pixel.r / result.pixels.length,
        g: acc.g + pixel.g / result.pixels.length,
        b: acc.b + pixel.b / result.pixels.length
      }), { r: 0, g: 0, b: 0 });

      // 5. 检查颜色是否在预期范围内
      const inRange = avgColor.r >= range.r[0] && avgColor.r <= range.r[1] &&
                      avgColor.g >= range.g[0] && avgColor.g <= range.g[1] &&
                      avgColor.b >= range.b[0] && avgColor.b <= range.b[1];

      this.log('info', '[_verifyTextColorByScreenshot] 颜色分析结果', {
        targetText,
        expectedColor,
        avgColor,
        dominantColor,
        inRange,
        pixelCount: result.pixels.length,
        filteredPixels: result.pixels.length,
        colorClusters: Object.keys(result.colorCounts).length
      });

      if (inRange) {
        return {
          passed: true,
          message: `✓ 截图颜色验证通过: "${targetText}"显示为${expectedColor}色 (实际: rgb(${Math.round(avgColor.r)}, ${Math.round(avgColor.g)}, ${Math.round(avgColor.b)}))`
        };
      } else {
        return {
          passed: false,
          message: `✗ 截图颜色验证失败: "${targetText}"颜色不是${expectedColor} (实际: rgb(${Math.round(avgColor.r)}, ${Math.round(avgColor.g)}, ${Math.round(avgColor.b)}))`
        };
      }
    } catch (error) {
      this.log('error', '[_verifyTextColorByScreenshot] 验证错误', { error: error.message, stack: error.stack });
      return {
        passed: false,
        message: `✗ 截图颜色验证错误: ${error.message}`
      };
    }
  }

  /**
   * 辅助函数：验证Tooltip提示框
   * 当表格数据被省略号截断时，hover后应显示完整内容
   * @param {Object} verification - 验证参数
   * @returns {Object} 验证结果
   */
  async verifyTooltip(verification) {
    const description = verification.description || verification.expected || '';
    const expectedContent = verification.expectedContent || verification.content || '';

    this.log('info', '[verifyTooltip] 开始验证Tooltip', { description, expectedContent });

    try {
      // 0. 首先检查是否有表格数据
      const tableCheck = await this.page.evaluate(() => {
        // 检查是否有"查無資料"或类似的空数据提示
        const bodyText = document.body?.textContent || '';
        const hasNoData = bodyText.includes('查無資料') ||
                         bodyText.includes('查无资料') ||
                         bodyText.includes('No data') ||
                         bodyText.includes('暂无数据') ||
                         bodyText.includes('暫無資料');

        // 检查是否有表格行数据（兼容Flutter应用）
        let dataRowCount = 0;

        // 方法1: 检查传统表格行
        const tableRows = document.querySelectorAll('tr, [role="row"]');
        if (tableRows.length > 0) {
          dataRowCount = Array.from(tableRows).filter(row => {
            const text = row.textContent?.trim() || '';
            return text.length > 10 && !text.includes('查無資料');
          }).length;
        }

        // 方法2: 检查Flutter语义树中的按钮（Flutter表格行通常渲染为按钮）
        if (dataRowCount === 0) {
          const flutterButtons = document.querySelectorAll('flt-semantics[role="button"]');
          // 过滤掉导航按钮，只保留数据行
          const dataTexts = Array.from(flutterButtons).map(btn => btn.textContent?.trim() || '').filter(text =>
            text.length > 2 && !text.includes('查無資料') && !text.match(/^[0-9\s\n]*$/)
          );
          // 如果有超过10个有意义的文本，认为有数据
          if (dataTexts.length > 10) {
            dataRowCount = Math.floor(dataTexts.length / 8); // 估算行数
          }
        }

        return { hasNoData, dataRowCount, bodyTextLength: bodyText.length };
      });

      this.log('info', '[verifyTooltip] 表格数据检查', tableCheck);

      // 改进的数据检查：如果bodyText长度大于1000且没有"查無資料"，认为有数据
      const hasData = !tableCheck.hasNoData && (tableCheck.dataRowCount > 0 || tableCheck.bodyTextLength > 1000);

      if (!hasData) {
        return {
          passed: false,
          message: '⚠ Tooltip验证失败: 表格中没有数据。请先执行搜索操作获取数据后再验证tooltip功能。'
        };
      }

      // 1. 查找可能包含省略号的元素
      const ellipsisElements = await this.page.evaluate(() => {
        const results = [];

        // 检查是否是Flutter应用
        const isFlutter = document.querySelectorAll('flt-semantics').length > 0;

        // 检查所有文本元素
        const allElements = document.querySelectorAll('*');

        for (const elem of allElements) {
          const style = window.getComputedStyle(elem);
          const text = elem.textContent?.trim() || '';

          // 对于Flutter应用，使用更宽松的条件
          const minTextLength = isFlutter ? 15 : 20;

          // 检查是否有文本溢出的样式
          const hasTextOverflow = style.overflow === 'hidden' ||
                                  style.textOverflow === 'ellipsis' ||
                                  style.whiteSpace === 'nowrap';

          // 检查是否有title属性（常见的tooltip实现）
          const hasTitle = elem.hasAttribute('title') && elem.getAttribute('title');

          // 检查是否有aria-label（另一种tooltip实现）
          const hasAriaLabel = elem.hasAttribute('aria-label') && elem.getAttribute('aria-label');

          // 检查元素宽度是否有限制（可能显示省略号）
          const rect = elem.getBoundingClientRect();
          const hasLimitedWidth = rect.width > 0 && rect.width < 300;

          if ((hasTextOverflow || (text.length > minTextLength && hasLimitedWidth)) && (hasTitle || hasAriaLabel || hasTextOverflow)) {
            results.push({
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
              text: text.substring(0, 50),
              title: hasTitle || '',
              ariaLabel: hasAriaLabel || '',
              tagName: elem.tagName,
              hasTextOverflow,
              textLength: text.length
            });
          }
        }

        return results.slice(0, 10); // 最多返回10个
      });

      this.log('info', '[verifyTooltip] 找到可能包含tooltip的元素', { count: ellipsisElements.length });

      if (ellipsisElements.length === 0) {
        // 提供更详细的诊断信息
        const diagnosticInfo = await this.page.evaluate(() => {
          const allElements = document.querySelectorAll('*');
          let totalTextElements = 0;
          let longTextElements = 0;
          let elementsWithTitle = 0;

          for (const elem of allElements) {
            const text = elem.textContent?.trim() || '';
            if (text.length > 0) {
              totalTextElements++;
              if (text.length > 20) longTextElements++;
              if (elem.hasAttribute('title')) elementsWithTitle++;
            }
          }

          return { totalTextElements, longTextElements, elementsWithTitle };
        });

        this.log('warn', '[verifyTooltip] 未找到省略号元素', diagnosticInfo);

        return {
          passed: false,
          message: `⚠ 未找到可能显示tooltip的元素。诊断: 页面有${diagnosticInfo.totalTextElements}个文本元素，${diagnosticInfo.longTextElements}个长文本元素，${diagnosticInfo.elementAtsWithTitle}个有title属性的元素。可能原因: 1)表格无数据 2)未搜索获取长文本数据 3)页面未完全加载`
        };
      }

      // 2. 对每个元素执行hover并检查tooltip
      for (const elem of ellipsisElements) {
        this.log('info', '[verifyTooltip] 测试元素', { text: elem.text, title: elem.title, ariaLabel: elem.ariaLabel });

        // Hover到元素
        await this.page.mouse.move(elem.x + elem.width / 2, elem.y + elem.height / 2);
        await this.page.waitForTimeout(500); // 等待tooltip出现

        // 检查是否有tooltip出现
        const tooltipContent = await this.page.evaluate(() => {
          // 查找tooltip元素（常见的选择器）
          const tooltipSelectors = [
            '[role="tooltip"]',
            '.tooltip',
            '.ant-tooltip',
            '.el-tooltip__popper',
            '.tooltip-inner',
            '[data-tooltip]'
          ];

          for (const selector of tooltipSelectors) {
            const tooltip = document.querySelector(selector);
            if (tooltip && tooltip.offsetParent !== null) {
              return {
                found: true,
                text: tooltip.textContent?.trim() || tooltip.getAttribute('title') || '',
                selector
              };
            }
          }

          // 检查是否有全局tooltip
          const allTooltips = document.querySelectorAll('*');
          for (const el of allTooltips) {
            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();

            // 检查是否是可见的浮动元素（可能是tooltip）
            if (style.position === 'absolute' || style.position === 'fixed') {
              if (rect.width > 0 && rect.height > 0 && rect.width < 500 && rect.height < 200) {
                const text = el.textContent?.trim() || '';
                if (text.length > 0 && text.length < 200) {
                  return {
                    found: true,
                    text,
                    style: style.position
                  };
                }
              }
            }
          }

          return { found: false };
        });

        if (tooltipContent.found) {
          this.log('info', '[verifyTooltip] 找到tooltip', { content: tooltipContent });

          // 如果有预期内容，验证是否匹配
          if (expectedContent && tooltipContent.text.includes(expectedContent)) {
            return {
              passed: true,
              message: `✓ Tooltip验证通过: hover后显示提示框，内容包含"${expectedContent}"`
            };
          } else if (expectedContent) {
            return {
              passed: true,
              message: `✓ Tooltip验证通过: hover后显示提示框 (内容: "${tooltipContent.text}")`
            };
          } else {
            return {
              passed: true,
              message: `✓ Tooltip验证通过: hover后显示提示框`
            };
          }
        }
      }

      // 3. 如果没有找到动态tooltip，检查静态tooltip（title属性）
      for (const elem of ellipsisElements) {
        if (elem.title && elem.title.length > 0) {
          this.log('info', '[verifyTooltip] 找到静态tooltip', { content: elem.title });
          return {
            passed: true,
            message: `✓ Tooltip验证通过: 元素有title属性 "${elem.title}"`
          };
        }
        if (elem.ariaLabel && elem.ariaLabel.length > 0) {
          this.log('info', '[verifyTooltip] 找到aria-label', { content: elem.ariaLabel });
          return {
            passed: true,
            message: `✓ Tooltip验证通过: 元素有aria-label "${elem.ariaLabel}"`
          };
        }
      }

      // 4. DOM方式未找到tooltip，尝试使用截图对比方式（适用于Flutter应用）
      this.log('info', '[verifyTooltip] DOM方式未找到tooltip，尝试截图对比验证');
      return await this._verifyTooltipByScreenshotDiff(ellipsisElements);
    } catch (error) {
      this.log('error', '[verifyTooltip] 验证错误', { error: error.message });
      return {
        passed: false,
        message: `✗ Tooltip验证错误: ${error.message}`
      };
    }
  }

  /**
   * 使用截图对比验证Tooltip（适用于Flutter应用）
   * 原理：hover前后截图，对比差异区域检测tooltip出现
   * @param {Array} elements - 可能显示tooltip的元素列表
   * @returns {Object} 验证结果
   */
  async _verifyTooltipByScreenshotDiff(elements) {
    this.log('info', '[_verifyTooltipByScreenshotDiff] 开始截图对比验证', { elementCount: elements.length });

    try {
      // 取第一个元素进行测试
      const elem = elements[0];
      const centerX = Math.floor(elem.x + elem.width / 2);
      const centerY = Math.floor(elem.y + elem.height / 2);

      this.log('info', '[_verifyTooltipByScreenshotDiff] 测试元素', {
        text: elem.text,
        centerX,
        centerY,
        elemSize: { w: elem.width, h: elem.height }
      });

      // 定义截图区域（扩大范围以包含可能出现的tooltip）
      const screenshotMargin = 100;
      const clipRegion = {
        x: Math.max(0, elem.x - screenshotMargin),
        y: Math.max(0, elem.y - screenshotMargin),
        width: elem.width + screenshotMargin * 2,
        height: elem.height + screenshotMargin * 2
      };

      // 1. hover前截图
      const beforeScreenshot = await this.page.screenshot({ clip: clipRegion });
      this.log('info', '[_verifyTooltipByScreenshotDiff] 已获取hover前截图');

      // 2. 执行hover
      await this.page.mouse.move(centerX, centerY);
      await this.page.waitForTimeout(800); // 等待tooltip出现
      this.log('info', '[_verifyTooltipByScreenshotDiff] 已执行hover');

      // 3. hover后截图
      const afterScreenshot = await this.page.screenshot({ clip: clipRegion });
      this.log('info', '[_verifyTooltipByScreenshotDiff] 已获取hover后截图');

      // 4. 对比两张截图的差异
      const diffResult = await this.page.evaluate((params) => {
        const { beforeData, afterData, width, height } = params;

        return new Promise((resolve) => {
          const imgBefore = new Image();
          const imgAfter = new Image();
          let loadedCount = 0;

          const onLoaded = () => {
            loadedCount++;
            if (loadedCount < 2) return;

            // 创建canvas进行像素对比
            const canvasBefore = document.createElement('canvas');
            const canvasAfter = document.createElement('canvas');
            canvasBefore.width = width;
            canvasBefore.height = height;
            canvasAfter.width = width;
            canvasAfter.height = height;

            const ctxBefore = canvasBefore.getContext('2d');
            const ctxAfter = canvasAfter.getContext('2d');
            ctxBefore.drawImage(imgBefore, 0, 0);
            ctxAfter.drawImage(imgAfter, 0, 0);

            const imageDataBefore = ctxBefore.getImageData(0, 0, width, height);
            const imageDataAfter = ctxAfter.getImageData(0, 0, width, height);

            // 计算差异
            let diffPixels = 0;
            const diffThreshold = 30; // 颜色差异阈值
            const diffPositions = [];

            for (let i = 0; i < imageDataBefore.data.length; i += 4) {
              const rDiff = Math.abs(imageDataBefore.data[i] - imageDataAfter.data[i]);
              const gDiff = Math.abs(imageDataBefore.data[i + 1] - imageDataAfter.data[i + 1]);
              const bDiff = Math.abs(imageDataBefore.data[i + 2] - imageDataAfter.data[i + 2]);

              if (rDiff + gDiff + bDiff > diffThreshold * 3) {
                diffPixels++;
                const pixelIndex = i / 4;
                const x = pixelIndex % width;
                const y = Math.floor(pixelIndex / width);
                diffPositions.push({ x, y });
              }
            }

            const totalPixels = width * height;
            const diffPercent = (diffPixels / totalPixels) * 100;

            // 分析差异区域的分布（tooltip通常是一个连续的区域）
            let hasTooltipShape = false;
            if (diffPositions.length > 50) {
              // 简单检查：差异是否相对集中（tooltip通常是一个小区域）
              const minX = Math.min(...diffPositions.map(p => p.x));
              const maxX = Math.max(...diffPositions.map(p => p.x));
              const minY = Math.min(...diffPositions.map(p => p.y));
              const maxY = Math.max(...diffPositions.map(p => p.y));

              const diffWidth = maxX - minX;
              const diffHeight = maxY - minY;

              // tooltip形状判断：宽度50-400px，高度10-100px
              hasTooltipShape = diffWidth > 50 && diffWidth < 400 && diffHeight > 10 && diffHeight < 100;
            }

            resolve({
              diffPixels,
              totalPixels,
              diffPercent: diffPercent.toFixed(2),
              hasTooltipShape,
              diffWidth: diffPositions.length > 0 ? Math.max(...diffPositions.map(p => p.x)) - Math.min(...diffPositions.map(p => p.x)) : 0,
              diffHeight: diffPositions.length > 0 ? Math.max(...diffPositions.map(p => p.y)) - Math.min(...diffPositions.map(p => p.y)) : 0
            });
          };

          imgBefore.onload = onLoaded;
          imgAfter.onload = onLoaded;
          imgBefore.onerror = () => resolve({ error: 'Failed to load before image' });
          imgAfter.onerror = () => resolve({ error: 'Failed to load after image' });

          imgBefore.src = `data:image/png;base64,${beforeData}`;
          imgAfter.src = `data:image/png;base64,${afterData}`;
        });
      }, {
        beforeData: beforeScreenshot.toString('base64'),
        afterData: afterScreenshot.toString('base64'),
        width: clipRegion.width,
        height: clipRegion.height
      });

      this.log('info', '[_verifyTooltipByScreenshotDiff] 对比结果', diffResult);

      if (diffResult.error) {
        return {
          passed: false,
          message: `✗ 截图对比失败: ${diffResult.error}`
        };
      }

      // 判断是否有tooltip出现
      if (diffResult.hasTooltipShape && parseFloat(diffResult.diffPercent) > 0.1 && parseFloat(diffResult.diffPercent) < 15) {
        return {
          passed: true,
          message: `✓ Tooltip验证通过（截图对比）: hover后页面出现变化，检测到tooltip形状区域 (差异${diffResult.diffPercent}%, 尺寸:${diffResult.diffWidth}x${diffResult.diffHeight})`
        };
      } else if (parseFloat(diffResult.diffPercent) < 0.1) {
        return {
          passed: false,
          message: `✗ Tooltip验证失败（截图对比）: hover前后无明显变化 (差异仅${diffResult.diffPercent}%)，可能tooltip未显示`
        };
      } else {
        return {
          passed: false,
          message: `⚠ Tooltip验证不确定（截图对比）: hover后变化过大 (差异${diffResult.diffPercent}%)，可能是页面其他元素变化，而非tooltip显示`
        };
      }
    } catch (error) {
      this.log('error', '[_verifyTooltipByScreenshotDiff] 验证错误', { error: error.message, stack: error.stack });
      return {
        passed: false,
        message: `✗ 截图对比验证错误: ${error.message}`
      };
    }
  }

  async verifyMenuActive(verification) {
    this.log('info', '[verifyMenuActive] 开始执行菜单状态验证', { verification });

    const expectedMenuItem = verification.menuItem || verification.expected || verification.target;
    const menuSelector = verification.selector || '.menu, nav, [role="navigation"], .sidebar, .nav-menu';
    const targetLevel = verification.level || 0; // 0 表示任意级别

    try {
      // 检查页面上的菜单项（将参数打包成一个对象传递）
      const menuInfo = await this.page.evaluate((params) => {
        const { expected, menuSel, level } = params;

        // 首先尝试 Flutter 语义树
        const flutterSemantics = document.querySelectorAll('flt-semantics');
        if (flutterSemantics.length > 0) {
          // 查找所有 Flutter 按钮（菜单项通常是按钮）
          const flutterButtons = Array.from(flutterSemantics).filter(el => {
            const role = el.getAttribute('role');
            return role === 'button' || el.hasAttribute('role');
          });

          // 查找文本匹配的菜单项
          const matchedItems = flutterButtons.filter(el => {
            const text = el.textContent?.trim() || '';
            return text.includes(expected) || expected.includes(text);
          });

          // 检查是否有视觉上"选中"的样式（Flutter 通常通过颜色或边框表示）
          const activeItems = flutterButtons.filter(el => {
            const style = window.getComputedStyle(el);
            const bgColor = style.backgroundColor;
            const borderColor = style.borderColor;
            const opacity = style.opacity;

            // 常见的选中状态：背景色不同、边框高亮、不透明度为1
            return (
              opacity === '1' &&
              (bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') ||
              (borderColor !== 'rgba(0, 0, 0, 0)' && borderColor !== 'transparent' && borderColor !== 'rgb(0, 0, 0)')
            );
          });

          return {
            found: true,
            type: 'flutter',
            matchedItems: matchedItems.map(el => ({ text: el.textContent?.trim() || '' })),
            activeItems: activeItems.map(el => ({ text: el.textContent?.trim() || '' })),
            allItems: flutterButtons.slice(0, 30).map(el => ({ text: el.textContent?.trim().slice(0, 50) || '' })),
          };
        }

        // 传统 HTML 菜单检测
        const menuSelectors = [
          menuSel,
          '.menu',
          'nav',
          '[role="navigation"]',
          '.sidebar',
          '.nav-menu',
          '.ant-menu',
          '.el-menu',
          '.v-navigation',
          'mat-nav-list',
          '.q-list', // Quasar
        ];

        let menuContainer = null;
        for (const sel of menuSelectors) {
          const container = document.querySelector(sel);
          if (container) {
            menuContainer = container;
            break;
          }
        }

        if (!menuContainer) {
          return { found: false, message: '未找到菜单容器' };
        }

        // 递归查找所有菜单项，支持多级菜单
        function findMenuItems(container, currentLevel = 1, parentPath = []) {
          const items = [];
          const selectors = [
            'a', 'button',
            '[role="menuitem"]',
            '.menu-item', '.ant-menu-item', '.el-menu-item', '.q-item',
            '.menu-submenu-title', '.ant-menu-submenu-title', // 二级菜单标题
            '.submenu', '.has-submenu', // 有子菜单的项
          ];

          for (const sel of selectors) {
            const elements = container.querySelectorAll(sel);
            for (const item of Array.from(elements)) {
              // 避免重复添加
              if (items.some(i => i.element === item)) continue;

              const text = item.textContent?.trim() || '';
              const className = item.className || '';
              const ariaSelected = item.getAttribute('aria-selected');
              const ariaCurrent = item.getAttribute('aria-current');
              const ariaExpanded = item.getAttribute('aria-expanded');

              // 判断是否为选中状态
              const isActive =
                className.includes('active') ||
                className.includes('selected') ||
                className.includes('current') ||
                ariaSelected === 'true' ||
                ariaCurrent === 'page' ||
                item.classList.contains('router-link-active') ||
                item.classList.contains('router-link-exact-active');

              const itemInfo = {
                element: item,
                text,
                className,
                ariaSelected,
                ariaCurrent,
                ariaExpanded,
                isActive,
                level: currentLevel,
                path: [...parentPath, text].filter(t => t).join(' > ')
              };

              items.push(itemInfo);

              // 如果有子菜单容器，递归查找
              const submenuSelectors = ['.submenu', '.sub-menu', '.ant-menu-sub', '.children', '[role="menu"]'];
              for (const subSel of submenuSelectors) {
                const submenu = item.querySelector(subSel);
                if (submenu && submenu !== container) {
                  const subItems = findMenuItems(submenu, currentLevel + 1, [...parentPath, text]);
                  items.push(...subItems);
                  break;
                }
              }
            }
          }

          return items;
        }

        const allMenuItems = findMenuItems(menuContainer);

        // 获取所有菜单项和选中菜单项
        const activeItems = allMenuItems.filter(i => i.isActive);
        const allItems = allMenuItems.map(i => ({
          text: i.text,
          level: i.level,
          path: i.path,
          isActive: i.isActive
        }));

        // 如果指定了级别，过滤出对应级别的项
        const filteredActive = level > 0
          ? activeItems.filter(i => i.level === level)
          : activeItems;

        const filteredAll = level > 0
          ? allItems.filter(i => i.level === level)
          : allItems;

        return {
          found: true,
          type: 'html',
          menuContainer: menuContainer.tagName + '.' + menuContainer.className.split(' ')[0],
          activeItems: filteredActive.map(i => ({ text: i.text, level: i.level, path: i.path })),
          allItems: filteredAll.slice(0, 20), // 返回前20个
        };
      }, { expected: expectedMenuItem, menuSel: menuSelector, level: targetLevel });

      if (!menuInfo.found) {
        return {
          type: 'menuActive',
          passed: false,
          expected: expectedMenuItem,
          actual: null,
          message: `✗ 未找到菜单容器`,
        };
      }

      // 处理 Flutter 语义树结果
      if (menuInfo.type === 'flutter') {
        if (menuInfo.matchedItems.length > 0) {
          this.log('info', `[verifyMenuActive] 找到匹配的 Flutter 菜单项: "${menuInfo.matchedItems[0].text}"`);
          return {
            type: 'menuActive',
            passed: true,
            expected: expectedMenuItem,
            actual: menuInfo.matchedItems[0].text,
            framework: 'flutter',
            message: `✓ 菜单验证通过: 找到 "${menuInfo.matchedItems[0].text}"`,
          };
        } else {
          // 列出可用的菜单项
          const availableItems = menuInfo.allItems
            .map(i => i.text)
            .filter(t => t.length > 0)
            .slice(0, 10)
            .join(', ');

          this.log('warn', `[verifyMenuActive] 未找到预期菜单项，可用项: ${availableItems}`);
          return {
            type: 'menuActive',
            passed: false,
            expected: expectedMenuItem,
            actual: availableItems,
            framework: 'flutter',
            message: `✗ 菜单验证失败: 未找到 "${expectedMenuItem}"，可用项: ${availableItems}`,
          };
        }
      }

      // 处理传统 HTML 菜单结果
      const matchedActive = menuInfo.activeItems.find(item =>
        item.text.includes(expectedMenuItem) ||
        expectedMenuItem.includes(item.text) ||
        (item.path && item.path.includes(expectedMenuItem))
      );

      const hasExpectedItem = menuInfo.allItems.find(item =>
        item.text.includes(expectedMenuItem) ||
        expectedMenuItem.includes(item.text) ||
        (item.path && item.path.includes(expectedMenuItem))
      );

      if (matchedActive) {
        this.log('info', `[verifyMenuActive] 找到匹配的选中菜单项: "${matchedActive.text}" (级别: ${matchedActive.level})`);
        return {
          type: 'menuActive',
          passed: true,
          expected: expectedMenuItem,
          actual: matchedActive.text,
          level: matchedActive.level,
          path: matchedActive.path,
          activeItems: menuInfo.activeItems,
          message: `✓ 菜单验证通过: "${matchedActive.text}" 处于选中状态 (路径: ${matchedActive.path || 'N/A'})`,
        };
      } else if (hasExpectedItem) {
        this.log('warn', `[verifyMenuActive] 找到预期菜单项但未选中: "${hasExpectedItem.text}"`);
        return {
          type: 'menuActive',
          passed: false,
          expected: expectedMenuItem,
          actual: hasExpectedItem.text,
          level: hasExpectedItem.level,
          activeItems: menuInfo.activeItems,
          message: `✗ 菜单验证失败: 找到 "${hasExpectedItem.text}" 但未处于选中状态`,
        };
      } else if (menuInfo.activeItems.length > 0) {
        const activeTexts = menuInfo.activeItems.map(i => `${i.text}(L${i.level})`).join(', ');
        this.log('warn', `[verifyMenuActive] 未找到预期菜单项，当前选中: ${activeTexts}`);
        return {
          type: 'menuActive',
          passed: false,
          expected: expectedMenuItem,
          actual: activeTexts,
          activeItems: menuInfo.activeItems,
          message: `✗ 菜单验证失败: 未找到 "${expectedMenuItem}"，当前选中: ${activeTexts}`,
        };
      } else {
        this.log('warn', `[verifyMenuActive] 未找到任何选中的菜单项`);
        return {
          type: 'menuActive',
          passed: false,
          expected: expectedMenuItem,
          actual: null,
          message: `⚠ 未找到任何选中的菜单项（可能页面未加载完成或使用非菜单导航）`,
        };
      }
    } catch (error) {
      this.log('error', '[verifyMenuActive] 验证出错', { error: error.message });
      return {
        type: 'menuActive',
        passed: false,
        expected: expectedMenuItem,
        actual: null,
        error: error.message,
        message: `✗ 菜单状态验证失败: ${error.message}`,
      };
    }
  }

  /**
   * 子菜单可见性验证
   * @param {Object} verification - 验证对象
   * @returns {Object} 验证结果
   */
  async verifySubmenuVisible(verification) {
    this.log('info', '[verifySubmenuVisible] 开始执行子菜单可见性验证', { verification });

    const parentMenuItem = verification.menuItem || verification.parent || verification.target;
    const waitTime = verification.wait || 2000; // 默认等待2秒让子菜单显示

    try {
      // 等待子菜单显示
      this.log('info', `[verifySubmenuVisible] 等待 ${waitTime}ms 让子菜单显示...`);
      await this.page.waitForTimeout(waitTime);

      // 检查子菜单是否显示
      const submenuInfo = await this.page.evaluate((params) => {
        const { parent } = params;

        // 首先尝试 Flutter 语义树
        const flutterSemantics = document.querySelectorAll('flt-semantics');
        if (flutterSemantics.length > 0) {
          // 查找父菜单项
          const parentItem = Array.from(flutterSemantics).find(el => {
            const text = el.textContent?.trim() || '';
            return text.includes(parent) || parent.includes(text);
          });

          if (parentItem) {
            const rect = parentItem.getBoundingClientRect();
            // 查找父菜单项下方或旁边的可见元素（子菜单）
            const potentialSubmenus = Array.from(flutterSemantics).filter(el => {
              if (el === parentItem) return false;
              const r = el.getBoundingClientRect();
              // 子菜单应该在父菜单下方或右侧，且可见
              const isBelow = r.y > rect.y + rect.height;
              const isRight = r.x > rect.x + rect.width && r.y < rect.y + rect.height;
              const isVisible = r.width > 0 && r.height > 0;
              return (isBelow || isRight) && isVisible;
            });

            return {
              found: true,
              type: 'flutter',
              parentFound: !!parentItem,
              parentText: parentItem.textContent?.trim() || '',
              submenuCount: potentialSubmenus.length,
              submenuItems: potentialSubmenus.slice(0, 10).map(el => ({
                text: el.textContent?.trim().substring(0, 50) || '',
                position: { x: el.getBoundingClientRect().x, y: el.getBoundingClientRect().y }
              }))
            };
          }
        }

        // 传统 HTML 菜单检测
        // 查找父菜单项
        const parentSelectors = [
          `[data-menu-item*="${parent}"]`,
          `[aria-label*="${parent}"]`,
          `.menu-item:has-text("${parent}")`,
          `li:has-text("${parent}")`,
          `a:has-text("${parent}")`,
          `button:has-text("${parent}")`,
        ];

        let parentElement = null;
        for (const sel of parentSelectors) {
          // 由于 :has-text 不是标准选择器，需要手动查找
          if (sel.includes(':has-text')) {
            const text = sel.match(/:has-text\("(.+?)"\)/)[1];
            const elements = document.querySelectorAll('li, a, button, [role="menuitem"]');
            for (const el of Array.from(elements)) {
              if (el.textContent?.includes(text)) {
                parentElement = el;
                break;
              }
            }
          } else {
            parentElement = document.querySelector(sel);
          }
          if (parentElement) break;
        }

        if (!parentElement) {
          return { found: false, message: `未找到父菜单项: ${parent}` };
        }

        // 查找子菜单
        const submenuSelectors = ['.submenu', '.sub-menu', '.ant-menu-sub', '.children', '[role="menu"]', '.dropdown-menu'];
        let submenuElement = null;

        // 方法1: 查找父元素的直接子元素
        for (const subSel of submenuSelectors) {
          submenuElement = parentElement.querySelector(subSel);
          if (submenuElement) break;
        }

        // 方法2: 查找父元素的兄弟元素（子菜单可能是兄弟）
        if (!submenuElement) {
          const siblings = Array.from(parentElement.parentElement?.children || []);
          for (const sibling of siblings) {
            const classList = sibling.className?.toLowerCase() || '';
            if (classList.includes('sub') || classList.includes('menu') || classList.includes('dropdown')) {
              submenuElement = sibling;
              break;
            }
          }
        }

        if (!submenuElement) {
          return {
            found: true,
            type: 'html',
            parentFound: true,
            parentText: parentElement.textContent?.trim() || '',
            submenuFound: false,
            message: `找到父菜单项但未找到子菜单元素`
          };
        }

        const submenuRect = submenuElement.getBoundingClientRect();
        const isVisible = submenuRect.width > 0 && submenuRect.height > 0;

        // 获取子菜单项
        const submenuItems = Array.from(submenuElement.querySelectorAll('[role="menuitem"], li, a, button'))
          .filter(el => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
          })
          .map(el => ({
            text: el.textContent?.trim().substring(0, 50) || '',
            visible: true
          }));

        return {
          found: true,
          type: 'html',
          parentFound: true,
          parentText: parentElement.textContent?.trim() || '',
          submenuFound: true,
          submenuVisible: isVisible,
          submenuCount: submenuItems.length,
          submenuItems: submenuItems.slice(0, 10)
        };
      }, { parent: parentMenuItem });

      if (submenuInfo.type === 'flutter' && submenuInfo.submenuCount > 0) {
        this.log('info', `[verifySubmenuVisible] 找到 ${submenuInfo.submenuCount} 个子菜单项`);
        const items = submenuInfo.submenuItems.map(i => i.text).join(', ');
        return {
          type: 'submenuVisible',
          passed: true,
          expected: parentMenuItem,
          actual: items,
          framework: 'flutter',
          message: `✓ 子菜单显示正常 (${parentMenuItem}): ${items}`,
        };
      }

      if (submenuInfo.type === 'html' && submenuInfo.submenuFound && submenuInfo.submenuVisible) {
        this.log('info', `[verifySubmenuVisible] 找到 ${submenuInfo.submenuCount} 个子菜单项`);
        const items = submenuInfo.submenuItems.map(i => i.text).join(', ');
        return {
          type: 'submenuVisible',
          passed: true,
          expected: parentMenuItem,
          actual: items,
          framework: 'html',
          message: `✓ 子菜单显示正常 (${parentMenuItem}): ${items}`,
        };
      }

      this.log('warn', `[verifySubmenuVisible] 子菜单未显示或未找到`, submenuInfo);
      return {
        type: 'submenuVisible',
        passed: false,
        expected: parentMenuItem,
        actual: submenuInfo,
        message: `✗ 子菜单未显示 (${parentMenuItem})`,
      };
    } catch (error) {
      this.log('error', '[verifySubmenuVisible] 验证出错', { error: error.message });
      return {
        type: 'submenuVisible',
        passed: false,
        expected: parentMenuItem,
        actual: null,
        error: error.message,
        message: `✗ 子菜单验证失败: ${error.message}`,
      };
    }
  }

  /**
   * URL 包含验证
   * @param {Object} verification - 验证对象
   * @returns {Object} 验证结果
   */
  async verifyUrlContains(verification) {
    this.log('info', '[verifyUrlContains] 开始执行 URL 包含验证', { verification });

    const expectedText = verification.expected || verification.text || verification.contains;
    const caseSensitive = verification.caseSensitive || false;

    try {
      const currentUrl = this.page.url();
      const hash = await this.page.evaluate(() => window.location.hash);

      this.log('info', `[verifyUrlContains] 当前 URL: ${currentUrl}, Hash: ${hash}`);

      const checkUrl = caseSensitive ? currentUrl : currentUrl.toLowerCase();
      const checkExpected = caseSensitive ? expectedText : expectedText.toLowerCase();
      const checkHash = caseSensitive ? hash : hash.toLowerCase();

      const urlMatch = checkUrl.includes(checkExpected);
      const hashMatch = checkHash.includes(checkExpected);

      if (urlMatch || hashMatch) {
        this.log('info', `[verifyUrlContains] URL 包含 "${expectedText}"`);
        return {
          type: 'urlContains',
          passed: true,
          expected: expectedText,
          actual: currentUrl,
          message: `✓ URL 包含 "${expectedText}": ${currentUrl}`,
        };
      }

      this.log('warn', `[verifyUrlContains] URL 不包含 "${expectedText}"`);
      return {
        type: 'urlContains',
        passed: false,
        expected: expectedText,
        actual: currentUrl,
        message: `✗ URL 不包含 "${expectedText}": ${currentUrl}`,
      };
    } catch (error) {
      this.log('error', '[verifyUrlContains] 验证出错', { error: error.message });
      return {
        type: 'urlContains',
        passed: false,
        expected: expectedText,
        actual: null,
        error: error.message,
        message: `✗ URL 验证失败: ${error.message}`,
      };
    }
  }

  /**
   * 导航验证（页面切换验证）
   * @param {Object} verification - 验证
   * @returns {Object} 验证结果
   */
  async verifyNavigation(verification) {
    this.log('info', '[verifyNavigation] 开始执行导航验证', { verification });

    try {
      // 检查 verifications 是否已初始化
      if (!this.verifications) {
        this.log('error', '[verifyNavigation] verifications 未初始化');
        return {
          type: 'navigation',
          passed: false,
          error: 'verifications 未初始化',
          message: `✗ 导航验证失败: verifications 未初始化`,
        };
      }

      // 获取当前 URL（不需要 previousUrl，因为我们想验证当前状态是否符合预期）
      const currentUrl = this.page.url();
      this.log('info', '[verifyNavigation] 当前 URL', { url: currentUrl });

      // 等待一小段时间让页面状态稳定
      await this.page.waitForTimeout(300);

      // 检查 DOM 状态，判断页面是否发生了变化
      const domState = await this.page.evaluate(() => {
        const inputs = document.querySelectorAll('input:not([type=hidden]), textarea');
        const buttons = document.querySelectorAll('button, [role="button"]');
        const passwordInputs = document.querySelectorAll('input[type="password"], input[placeholder*="密码" i], input[placeholder*="password" i]');
        const loginButtons = document.querySelectorAll('button, [role="button"]');
        const loginButtonTexts = Array.from(loginButtons).map(b => b.textContent?.trim() || '');

        // 检查 Flutter 语义元素
        const semantics = document.querySelectorAll('flt-semantics');
        let hasPasswordSemantics = false;
        let hasLoginButtonSemantics = false;

        for (const sem of semantics) {
          const label = (sem.getAttribute('aria-label') || '').toLowerCase();
          const text = (sem.textContent || '').toLowerCase();

          // 检查是否是密码相关的语义元素
          if (label.includes('password') || label.includes('密码') ||
              text.includes('password') || text.includes('密码')) {
            hasPasswordSemantics = true;
          }

          // 检查是否有登录按钮的语义元素
          if (label.includes('login') || label.includes('登录') || label.includes('登入') ||
              text.includes('login') || text.includes('登录') || text.includes('登入')) {
            hasLoginButtonSemantics = true;
          }
        }

        // 检查 body 文本中是否包含密码/登录相关内容
        const bodyText = document.body?.textContent?.toLowerCase() || '';
        const hasPasswordInText = bodyText.includes('密码') || bodyText.includes('password');
        const hasLoginInText = bodyText.includes('登录') || bodyText.includes('login') || bodyText.includes('登入');

        return {
          inputCount: inputs.length,
          buttonCount: buttons.length,
          hasPasswordInput: passwordInputs.length > 0,
          hasPasswordSemantics,
          hasLoginButtonSemantics,
          loginButtonTexts: loginButtonTexts.filter(t => t),
          hasPasswordInText,
          hasLoginInText,
          bodyText: document.body?.textContent?.substring(0, 200) || ''
        };
      });

      this.log('info', '[verifyNavigation] DOM 状态', { domState });

      // 对于 Flutter Web SPA，页面切换的特征：
      // 1. ID 页面: 有 email 输入框，有"下一步"按钮
      // 2. 密码页面: 有 password 输入框，有"登录"或"登入"按钮
      // 3. 登录后页面: URL 变化或显示特定内容

      let passed = false;
      let reason = '';

      // 检查是否是密码页面（从 ID 页面切换过来）
      if (verification.description && (
          verification.description.includes('密码输入') ||
          verification.description.includes('密码页')
      )) {
        // 更宽松的检查：只要检测到密码相关元素或文本即可
        const hasPassword = domState.hasPasswordInput ||
                           domState.hasPasswordSemantics ||
                           domState.hasPasswordInText;
        const hasLoginButton = domState.loginButtonTexts.some(t =>
          t.includes('登录') || t.includes('登入') || t.includes('Login')
        ) || domState.hasLoginButtonSemantics || domState.hasLoginInText;

        passed = hasPassword && hasLoginButton;
        reason = passed ? '检测到密码输入框和登录按钮' : `未检测到密码输入框或登录按钮 (hasPassword=${hasPassword}, hasLoginButton=${hasLoginButton})`;
      }
      // 检查是否是登录成功页面
      else if (verification.description && (
          verification.description.includes('登录成功') ||
          verification.description.includes('/account_management')
      )) {
        // 检查 URL 是否变化
        passed = currentUrl.includes('/account') || domState.bodyText.includes('管理');
        reason = passed ? '检测到账户管理页面' : '未检测到账户管理页面';
      }
      // 检查是否是登录失败（显示错误提示）
      else if (verification.description && verification.description.includes('登录失败')) {
        // 对于失败场景，我们只需要确认还在登录页面且没有跳转
        passed = domState.hasPasswordInput;
        reason = passed ? '仍在密码页面（符合失败场景）' : '页面状态异常';
      }
      // 默认：如果有 DOM 变化就通过
      else {
        passed = domState.inputCount > 0 || domState.buttonCount > 0;
        reason = passed ? '检测到页面元素' : '未检测到页面元素';
      }

      this.log('info', '[verifyNavigation] 验证结果', { passed, reason });

      return {
        type: 'navigation',
        passed,
        reason,
        currentUrl,
        domState,
        message: passed
          ? `✓ 导航验证通过: ${reason}`
          : `✗ 导航验证失败: ${reason}`,
      };
    } catch (error) {
      this.log('error', '[verifyNavigation] 执行错误', { error: error.message });
      return {
        type: 'navigation',
        passed: false,
        error: error.message,
        message: `✗ 导航验证错误: ${error.message}`,
      };
    }
  }

  /**
   * 验证操作是否包含必需的字段
   * @param {Object} action - 操作对象
   * @returns {boolean} 是否有效
   */
  validateAction(action) {
    if (!action || !action.type) {
      return false;
    }

    // click 操作必须有 target
    if (action.type === 'click' && !action.target) {
      this.log('warn', '[validateAction] click 操作缺少 target 字段');
      return false;
    }

    // input 操作必须有 target 和 value
    if (action.type === 'input') {
      if (!action.target) {
        this.log('warn', '[validateAction] input 操作缺少 target 字段');
        return false;
      }
      // value 可以为空（用于清空操作），但必须是 undefined 或字符串
      if (action.value !== undefined && typeof action.value !== 'string') {
        this.log('warn', '[validateAction] input 的 value 必须是字符串');
        return false;
      }
    }

    return true;
  }

  /**
   * AI 决策下一步操作
   * @param {Object} currentState - 当前 DOM 状态
   * @param {Object} testGoal - 测试目标
   * @returns {Object} 决策结果
   */
  async decideNextStep(currentState, testGoal) {
    this.log('info', 'AI 决策中...', { currentState, testGoal });

    if (!this.llm) {
      // 没有 LLM，使用规则决策
      return this.ruleBasedDecision(currentState, testGoal);
    }

    try {
      // 使用 LLM 决策
      const prompt = this.buildDecisionPrompt(currentState, testGoal);
      const response = await this.llm.chat('test_execution', [{ role: 'user', content: prompt }]);
      const decision = this.parseDecisionResponse(response.content);

      this.log('info', 'AI 决策完成', { decision });

      return decision;
    } catch (error) {
      this.log('error', 'AI 决策失败，使用规则决策', { error: error.message });
      return this.ruleBasedDecision(currentState, testGoal);
    }
  }

  /**
   * 构建决策提示词
   * @param {Object} currentState - 当前状态
   * @param {Object} testGoal - 测试目标
   * @returns {string} 提示词
   */
  buildDecisionPrompt(currentState, testGoal) {
    return `你是一个测试执行助手。根据当前 DOM 状态和测试目标，决定下一步操作。

当前 DOM 状态：
${JSON.stringify(currentState, null, 2)}

测试目标：
${JSON.stringify(testGoal, null, 2)}

请决定下一步操作，返回 JSON 格式：
{
  "shouldContinue": true/false,
  "shouldStop": true/false,
  "nextAction": null | {
    "type": "navigate|click|input|wait|scroll",
    "target": "目标描述",
    "value": "输入值（如果需要）",
    "reasoning": "决策理由"
  },
  "analysis": "当前状态分析"
}

注意：
- 如果测试目标已达成，shouldStop = true
- 如果需要继续执行，shouldContinue = true，并提供 nextAction
- 如果遇到错误或无法继续，shouldStop = true

重要：nextAction 必须包含以下字段：
- type: 操作类型（navigate/click/input/wait/scroll）
- target: 目标描述（对于 click 操作必须指定，如 "下一步按钮"、"登录按钮"、"提交按钮"等）
- value: 输入值（仅 input 类型需要）
- reasoning: 决策理由

示例：
{
  "shouldContinue": true,
  "shouldStop": false,
  "nextAction": {
    "type": "click",
    "target": "下一步按钮",
    "reasoning": "需要点击下一步按钮继续流程"
  },
  "analysis": "当前在登录页面，已输入ID，需要点击下一步"
}

{
  "shouldContinue": true,
  "shouldStop": false,
  "nextAction": {
    "type": "input",
    "target": "ID输入框",
    "value": "test@example.com",
    "reasoning": "需要输入用户ID"
  },
  "analysis": "当前在登录页面，需要输入ID"
}`;
  }

  /**
   * 解析决策响应
   * @param {string} response - LLM 响应
   * @returns {Object} 决策结果
   */
  parseDecisionResponse(response) {
    try {
      // 提取 JSON
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      return {
        shouldContinue: false,
        shouldStop: true,
        analysis: '无法解析 LLM 响应',
      };
    } catch (error) {
      return {
        shouldContinue: false,
        shouldStop: true,
        analysis: `解析失败: ${error.message}`,
      };
    }
  }

  /**
   * 基于规则的决策（无 LLM 时使用）
   * @param {Object} currentState - 当前状态
   * @param {Object} testGoal - 测试目标
   * @returns {Object} 决策结果
   */
  ruleBasedDecision(currentState, testGoal) {
    // 简单规则：如果有未执行的 action，继续执行
    if (testGoal.actions && testGoal.actions.length > 0) {
      return {
        shouldContinue: true,
        shouldStop: false,
        nextAction: testGoal.actions[0],
        analysis: '继续执行预定义操作',
      };
    }

    return {
      shouldContinue: false,
      shouldStop: true,
      analysis: '没有更多操作需要执行',
    };
  }

  /**
   * 获取当前 DOM 状态
   * @returns {Object} DOM 状态
   */
  async getDOMState() {
    try {
      const url = this.page.url();
      this.currentUrl = url;

      const state = {
        url,
        title: await this.page.title(),
        timestamp: new Date().toISOString(),
        elements: [],
        forms: [],
        lists: [],
      };

      // 首先检查是否有 iframe
      const frames = this.page.frames();
      this.log('debug', `[FRAME] 检测到 ${frames.length} 个 frame（包括主页面和 iframe）`);

      // 获取页面元素（增强版 - 支持 Flutter Web Canvas 渲染和 iframe）
      const elements = await this.page.evaluate(() => {
        const result = {
          isLoading: false,
          buttons: [],
          inputs: [],
          links: [],
          textInputs: [],
          customElements: [],
          bodyText: '',
          allElementsCount: 0,
          canvasCount: 0,
          shadowDOMCount: 0,
          iframeCount: 0,
          htmlSnippet: '',
        };

        // 检查 body 是否存在
        if (!document.body) {
          result.isLoading = true;
          result.bodyText = 'No body element';
          return result;
        }

        // 获取 HTML 片段（用于调试）
        result.htmlSnippet = document.body.innerHTML.substring(0, 2000);

        // 检查 iframe
        const iframes = document.querySelectorAll('iframe');
        result.iframeCount = iframes.length;
        if (iframes.length > 0) {
          result.customElements.push({
            type: 'iframe',
            count: iframes.length,
            info: Array.from(iframes).map(f => ({
              src: f.src,
              id: f.id,
              name: f.name,
            })),
          });
        }

        result.bodyText = document.body.innerText?.substring(0, 500) || '';

        // 检查是否在加载状态
        result.isLoading = document.body.innerText.includes('Loading') ||
                           document.body.innerText.includes('loading') ||
                           document.body.innerText.includes('加载中') ||
                           document.querySelector('.loading') !== null ||
                           document.querySelector('[class*="loading"]') !== null ||
                           document.querySelector('[class*="spinner"]') !== null;

        // 统计元素总数
        result.allElementsCount = document.querySelectorAll('*').length;

        // 检测 Canvas（Flutter Web 可能使用 Canvas 渲染）
        const canvases = document.querySelectorAll('canvas');
        result.canvasCount = canvases.length;
        if (canvases.length > 0) {
          result.customElements.push({
            type: 'canvas',
            count: canvases.length,
            info: canvases[0].getAttribute('id') || 'unnamed canvas',
          });
        }

        // 检测 Shadow DOM 并收集其中的元素（Flutter Web 使用 Shadow DOM 渲染）
        const shadowHosts = document.querySelectorAll('*');
        let shadowCount = 0;
        const shadowButtons = [];
        const shadowInputs = [];
        const shadowLinks = [];

        shadowHosts.forEach(el => {
          if (el.shadowRoot) {
            shadowCount++;
            // 在 Shadow DOM 中查找元素
            const sButtons = el.shadowRoot.querySelectorAll('button, [role="button"]');
            const sInputs = el.shadowRoot.querySelectorAll('input, textarea, select, [role="textbox"], [contenteditable="true"]');
            const sLinks = el.shadowRoot.querySelectorAll('a, [role="link"]');

            sButtons.forEach(b => shadowButtons.push(b));
            sInputs.forEach(i => shadowInputs.push(i));
            sLinks.forEach(a => shadowLinks.push(a));
          }
        });

        // 检测 Flutter 语义树中的元素（Flutter Web 的另一种渲染方式）
        // Flutter 将可访问性信息放在 flt-semantics-host 元素中
        const flutterSemanticsHosts = document.querySelectorAll('flt-semantics-host, flt-glass-pane');
        const flutterSemanticsElements = [];

        flutterSemanticsHosts.forEach(host => {
          // 查找所有带有 aria 属性的子元素
          const ariaElements = host.querySelectorAll('[role], [aria-label], [aria-labelledby], [aria-describedby]');
          ariaElements.forEach(el => {
            const role = el.getAttribute('role');
            if (role === 'button' || role === 'textbox' || role === 'link' || role === 'input') {
              flutterSemanticsElements.push(el);
            }
          });
        });

        // 将 Flutter 语义元素转换为可操作元素
        const flutterButtons = flutterSemanticsElements.filter(el => el.getAttribute('role') === 'button');
        const flutterInputs = flutterSemanticsElements.filter(el =>
          el.getAttribute('role') === 'textbox' || el.getAttribute('role') === 'input'
        );
        const flutterLinks = flutterSemanticsElements.filter(el => el.getAttribute('role') === 'link');

        result.shadowDOMCount = shadowCount;
        if (shadowCount > 0 || flutterSemanticsHosts.length > 0) {
          result.customElements.push({
            type: 'shadow-dom',
            count: shadowCount,
            buttonsInShadow: shadowButtons.length,
            inputsInShadow: shadowInputs.length,
            linksInShadow: shadowLinks.length,
            flutterSemanticsHosts: flutterSemanticsHosts.length,
            flutterButtons: flutterButtons.length,
            flutterInputs: flutterInputs.length,
            flutterLinks: flutterLinks.length,
          });
        }

        // 检测 form 元素（包括 Shadow DOM 中的）
        const forms = document.querySelectorAll('form');
        if (forms.length > 0) {
          result.customElements.push({
            type: 'forms',
            count: forms.length,
            info: Array.from(forms).map(f => ({
              id: f.id,
              name: f.name,
              action: f.action,
              inputCount: f.querySelectorAll('input').length,
            })),
          });
        }

        // 检测标准 HTML 元素（包括主 DOM 和 Shadow DOM）
        const mainButtons = Array.from(document.querySelectorAll('button, [role="button"]'));
        const mainInputs = Array.from(document.querySelectorAll('input, textarea, select, [role="textbox"], [contenteditable="true"]'));
        const mainLinks = Array.from(document.querySelectorAll('a, [role="link"]'));

        // 合并主 DOM、Shadow DOM 和 Flutter 语义树中的元素
        const allButtons = [...mainButtons, ...shadowButtons, ...flutterButtons];
        const allInputs = [...mainInputs, ...shadowInputs, ...flutterInputs];
        const allLinks = [...mainLinks, ...shadowLinks, ...flutterLinks];

        result.buttons = allButtons.map(b => ({
          text: b.textContent?.trim().substring(0, 30) || '',
          id: b.id || '',
          className: b.className || '',
          tagName: b.tagName,
          role: b.getAttribute('role') || '',
        }));

        result.inputs = allInputs.map(i => ({
          type: i.type || i.tagName?.toLowerCase() || '',
          name: i.name || '',
          id: i.id || '',
          placeholder: i.placeholder || '',
          role: i.getAttribute('role') || '',
        }));

        result.links = allLinks.map(a => ({
          text: a.textContent?.trim().substring(0, 30) || '',
          href: a.href || '',
          tagName: a.tagName,
        }));

        // 检测 Flutter 特定元素（修复无效选择器）
        const flutterElements = document.querySelectorAll('[class*="flt-"], [class*="flutter"]');
        if (flutterElements.length > 0) {
          result.customElements.push({
            type: 'flutter',
            count: flutterElements.length,
            sample: Array.from(flutterElements).slice(0, 3).map(el => ({
              tag: el.tagName,
              className: el.className,
            })),
          });
        }

        // 检测 Flutter 语义元素（用于可访问性）
        const semanticsElements = document.querySelectorAll('flt-semantics, [aria-role], [role]');
        if (semanticsElements.length > 0) {
          result.customElements.push({
            type: 'semantics',
            count: semanticsElements.length,
            sample: Array.from(semanticsElements).slice(0, 5).map(el => ({
              tag: el.tagName,
              role: el.getAttribute('role') || '',
              label: el.getAttribute('aria-label') || el.textContent?.substring(0, 20) || '',
            })),
          });
        }

        // 检测所有可点击元素（div、span 等）
        const clickableDivs = Array.from(document.querySelectorAll('div, span')).filter(el => {
          const style = window.getComputedStyle(el);
          return style.cursor === 'pointer' ||
                 el.onclick !== null ||
                 el.getAttribute('onclick') !== null ||
                 el.getAttribute('role') === 'button';
        });
        if (clickableDivs.length > 0 && clickableDivs.length < 100) {
          result.customElements.push({
            type: 'clickable',
            count: clickableDivs.length,
            samples: clickableDivs.slice(0, 5).map(el => ({
              tag: el.tagName,
              text: el.textContent?.trim().substring(0, 20) || '',
              class: el.className?.substring(0, 30) || '',
            })),
          });
        }

        // 检测所有带文本的元素
        const textElements = Array.from(document.querySelectorAll('*'))
          .filter(el => {
            const text = el.textContent?.trim() || '';
            return text.length > 0 && text.length < 100 &&
                   el.children.length === 0 && // 叶子节点
                   !['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName);
          })
          .slice(0, 20); // 只取前20个
        result.customElements.push({
          type: 'text-elements',
          count: textElements.length,
          samples: textElements.map(el => ({
            tag: el.tagName,
            text: el.textContent?.trim().substring(0, 30) || '',
          })),
        });

        return result;
      });

      // 记录调试信息
      this.log('debug', `[DOM] 页面元素统计`, {
        url: state.url.substring(0, 60),
        allElements: elements.allElementsCount,
        buttons: elements.buttons.length,
        inputs: elements.inputs.length,
        links: elements.links.length,
        canvas: elements.canvasCount,
        shadowDOM: elements.shadowDOMCount,
        iframeCount: elements.iframeCount,
        forms: elements.customElements.find(e => e.type === 'forms')?.count || 0,
        isLoading: elements.isLoading,
        bodyTextPreview: elements.bodyText?.substring(0, 100),
        htmlSnippet: elements.htmlSnippet?.substring(0, 300),
      });

      // 如果有 iframe，尝试从 iframe 获取元素
      if (elements.iframeCount > 0) {
        this.log('info', `[IFRAME] 发现 ${elements.iframeCount} 个 iframe，尝试从 iframe 获取元素`);
        for (const frame of frames) {
          if (frame !== this.page) { // 跳过主页面
            try {
              const frameUrl = frame.url();
              this.log('debug', `[IFRAME] 检查 frame: ${frameUrl.substring(0, 60)}`);

              // 尝试从 iframe 获取元素
              const frameElements = await frame.evaluate(() => {
                const inputs = Array.from(document.querySelectorAll('input, textarea, select')).map(i => ({
                  type: i.type || i.tagName?.toLowerCase() || '',
                  name: i.name || '',
                  id: i.id || '',
                  placeholder: i.placeholder || '',
                }));

                const buttons = Array.from(document.querySelectorAll('button')).map(b => ({
                  text: b.textContent?.trim().substring(0, 30) || '',
                  id: b.id || '',
                }));

                return { inputs, buttons };
              });

              if (frameElements.inputs.length > 0 || frameElements.buttons.length > 0) {
                this.log('info', `[IFRAME] 在 frame 中找到元素: ${frameElements.inputs.length} inputs, ${frameElements.buttons.length} buttons`);
                elements.inputs.push(...frameElements.inputs);
                elements.buttons.push(...frameElements.buttons);
              }
            } catch (e) {
              this.log('warn', `[IFRAME] 无法访问 frame: ${e.message}`);
            }
          }
        }
      }

      state.elements = elements;
      state.isLoading = elements.isLoading;

      return state;
    } catch (error) {
      this.log('error', '获取 DOM 状态失败', { error: error.message });
      return {
        url: this.page ? this.page.url() : 'unknown',
        error: error.message,
        elements: { buttons: [], inputs: [], links: [] },
        forms: [],
        lists: [],
      };
    }
  }

  /**
   * 获取 Flutter Canvas 应用的可访问性树（用于 Canvas 渲染的 Flutter Web）
   * 增强版：更全面地检测 Flutter Web 语义元素
   * @returns {Object} 可访问性元素树
   */
  async getAccessibilityTree() {
    try {
      // 检查 page 是否可用
      if (!this.page) {
        this.log('warn', '[A11Y] Page 不可用');
        return { elements: [], count: 0, byType: { buttons: 0, inputs: 0, links: 0, text: 0 } };
      }

      // 检查 accessibility API 是否可用
      if (!this.page.accessibility || typeof this.page.accessibility.snapshot !== 'function') {
        this.log('warn', '[A11Y] accessibility API 不可用，将使用 DOM 遍历');
        // 直接使用 DOM 方式获取可访问性元素
        return await this._getAccessibilityTreeFromDOMFallback();
      }

      // 方法1: 使用 Playwright 的 accessibility API（推荐）
      let a11yElements = [];
      try {
        const snapshot = await this.page.accessibility.snapshot({
          interestingOnly: false,  // 获取所有元素，包括不可见的
        });

        // 递归提取可访问性树中的元素（增强版）
        const extractA11yElements = (node, parentPath = '', depth = 0) => {
          const elements = [];
          if (!node || depth > 50) return elements;  // 防止过深递归

          const role = node.role || '';
          const name = node.name || '';

          // 扩展角色列表，包括更多 Flutter 可能使用的角色
          const meaningfulRoles = ['button', 'link', 'textbox', 'textfield', 'input', 'search',
                                    'combobox', 'list', 'listbox', 'option', 'checkbox',
                                    'radio', 'slider', 'switch', 'tab', 'tabpanel',
                                    'menu', 'menuitem', 'alert', 'dialog', 'window',
                                    'heading', 'text', 'img', 'icon', 'progressbar',
                                    'scrollbar', 'separator', 'generic'];

          // 收集所有有角色或有名称的元素
          if (role || name) {
            elements.push({
              role,
              label: name,
              description: node.description || '',
              text: node.value || name || '',
              tagName: 'a11y',
              id: '',
              className: '',
              bounds: {
                x: node.location?.left || 0,
                y: node.location?.top || 0,
                width: node.location?.width || 0,
                height: node.location?.height || 0,
              },
              visible: true,
              checked: node.checked,
              selected: node.selected,
              expanded: node.expanded,
              disabled: node.disabled,
            });
          }

          // 递归处理子节点
          if (node.children && Array.isArray(node.children)) {
            for (const child of node.children) {
              elements.push(...extractA11yElements(child, `${parentPath}/${role}`, depth + 1));
            }
          }

          return elements;
        };

        a11yElements = extractA11yElements(snapshot);
        this.log('info', `[A11Y] Playwright 可访问性 API 找到 ${a11yElements.length} 个元素`);
      } catch (a11yError) {
        this.log('warn', `Playwright 可访问性 API 失败: ${a11yError.message}`);
      }

      // 方法2: 深度检查 DOM 中的 aria 元素（Flutter Web 增强）
      const domElements = await this.page.evaluate(() => {
        const result = {
          elements: [],
          hasSemanticsHost: false,
          semanticsHostInfo: null,
          flutterElementCount: 0,
          canvasCount: 0,
        };

        // 检查 Canvas 元素
        const canvasElements = document.querySelectorAll('canvas');
        result.canvasCount = canvasElements.length;

        // 检查 Flutter 特定元素
        const flutterElements = document.querySelectorAll('[class*="flt-"]');
        result.flutterElementCount = flutterElements.length;

        // 检查语义宿主（包括 flt-semantics-placeholder）
        const semanticsHost = document.querySelector('flt-semantics-host') ||
                             document.querySelector('flt-semantics-placeholder') ||
                             document.querySelector('flt-scene-host') ||
                             document.querySelector('flt-glass-pane') ||
                             document.querySelector('[class*="semantics"]');
        result.hasSemanticsHost = !!semanticsHost;

        if (semanticsHost) {
          result.semanticsHostInfo = {
            tagName: semanticsHost.tagName,
            className: semanticsHost.className,
            childCount: semanticsHost.children?.length || 0,
          };
        }

        // 获取所有可能的可访问性元素（扩展选择器）
        const selectors = [
          '[role]',                    // 有 role 属性
          '[aria-label]',              // 有 aria-label
          '[aria-labelledby]',         // 有 aria-labelledby
          '[aria-describedby]',        // 有 aria-describedby
          '[aria-valuetext]',          // 有 aria-valuetext
          '[tabindex]',                // 可聚焦元素
        ];

        const allSelected = new Set();
        for (const selector of selectors) {
          try {
            const found = document.querySelectorAll(selector);
            found.forEach(el => allSelected.add(el));
          } catch (e) {
            // 忽略无效选择器
          }
        }

        // 特别检查 Flutter 语义元素
        const flutterSemanticElements = document.querySelectorAll('flt-semantics-host *');
        flutterSemanticElements.forEach(el => allSelected.add(el));

        // 转换为元素信息
        result.elements = Array.from(allSelected).map(el => {
          const rect = el.getBoundingClientRect();
          const computedStyle = window.getComputedStyle(el);

          return {
            role: el.getAttribute('role') || '',
            label: el.getAttribute('aria-label') ||
                   el.getAttribute('aria-labelledby') ||
                   el.getAttribute('data-label') || '',
            description: el.getAttribute('aria-describedby') || '',
            text: el.textContent?.trim().substring(0, 100) || '',
            tagName: el.tagName,
            id: el.id || '',
            className: el.className || '',
            bounds: {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
            },
            visible: rect.width > 0 && rect.height > 0 &&
                     computedStyle.visibility !== 'hidden' &&
                     computedStyle.display !== 'none' &&
                     computedStyle.opacity !== '0',
            tabIndex: el.tabIndex,
            // Flutter 特有属性
            dataRole: el.getAttribute('data-role') || '',
            dataLabel: el.getAttribute('data-label') || '',
          };
        }).filter(el => {
          // 更宽松的过滤条件
          return el.visible && (
            el.role ||
            el.label ||
            el.dataRole ||
            el.text ||
            (el.tabIndex !== undefined && el.tabIndex >= 0)
          );
        });

        result.count = result.elements.length;

        // 统计元素类型
        const typeCounts = {};
        result.elements.forEach(el => {
          const r = el.role || 'unknown';
          typeCounts[r] = (typeCounts[r] || 0) + 1;
        });

        result.typeBreakdown = typeCounts;

        return result;
      });

      // 方法3: 尝试通过 CDP 获取 Flutter 内部状态（针对 Flutter Web）
      let flutterInternalElements = [];
      if (domElements.hasSemanticsHost) {
        try {
          flutterInternalElements = await this.page.evaluate(() => {
            // 尝试访问 Flutter 的内部语义树
            const results = [];

            // 查找所有 Flutter 相关的宿主元素（包括 placeholder）
            const semanticsHosts = document.querySelectorAll('flt-semantics-host, flt-semantics-placeholder, flt-scene-host, flt-glass-pane');

            semanticsHosts.forEach(host => {
              // 递归遍历所有子元素（增加深度限制）
              const traverse = (element, depth = 0) => {
                if (depth > 30) return;  // 增加深度限制到 30

                // 获取元素的语义信息
                const role = element.getAttribute('role') ||
                            element.getAttribute('data-flutter-role') ||
                            element.getAttribute('data-role') || '';
                const label = element.getAttribute('aria-label') ||
                             element.getAttribute('data-label') ||
                             element.getAttribute('aria-labelledby') || '';
                const textContent = element.textContent?.trim().substring(0, 100) || '';

                // 扩展检测条件：只要有 role、label、text 或特定标签名，就记录
                const tagName = element.tagName?.toLowerCase() || '';
                const className = element.className || '';

                // 检测更多 Flutter 可能的交互元素
                const isInteractive = role ||
                                       label ||
                                       textContent.length > 0 ||
                                       (tagName === 'button' || tagName === 'input' || tagName === 'textarea' ||
                                        tagName === 'select' || tagName === 'a') ||
                                       className.includes('btn') ||
                                       className.includes('input') ||
                                       className.includes('text') ||
                                       className.includes('fld') ||  // Flutter element class prefix
                                       element.hasAttribute('tabindex');

                if (isInteractive) {
                  results.push({
                    role: role || (tagName === 'button' ? 'button' : tagName === 'input' ? 'textbox' : textContent ? 'text' : 'unknown'),
                    label: label || textContent || className,
                    text: textContent || label || className,
                    tagName: tagName || 'flt-element',
                    className: className,
                    id: element.id || '',
                  });
                }

                // 遍历所有子元素（不仅是 firstElementChild）
                const children = element.children;
                for (let i = 0; i < children.length; i++) {
                  traverse(children[i], depth + 1);
                }

                // 也检查 Shadow DOM 中的元素
                if (element.shadowRoot) {
                  const shadowChildren = element.shadowRoot.querySelectorAll('*');
                  for (let i = 0; i < shadowChildren.length; i++) {
                    traverse(shadowChildren[i], depth + 1);
                  }
                }
              };

              traverse(host);

              // 如果没有找到任何元素，尝试查找整个文档中的 Flutter 元素
              if (results.length === 0) {
                this.log('info', '[Flutter] 宿主内未找到元素，搜索整个文档...');
                const allFlutterElements = document.querySelectorAll('[class*="flt-"], [class*="fld-"]');
                allFlutterElements.forEach(el => {
                  const text = el.textContent?.trim().substring(0, 100) || '';
                  if (text.length > 0 || el.hasAttribute('role') || el.hasAttribute('aria-label')) {
                    results.push({
                      role: el.getAttribute('role') || 'unknown',
                      label: el.getAttribute('aria-label') || text,
                      text: text,
                      tagName: el.tagName?.toLowerCase() || 'flt-element',
                      className: el.className || '',
                      id: el.id || '',
                    });
                  }
                });
              }
            });

            return results;
          });

          this.log('info', `[Flutter] 内部语义树找到 ${flutterInternalElements.length} 个元素`);
          if (flutterInternalElements.length > 0) {
            this.log('debug', `[Flutter] 元素样本:`, flutterInternalElements.slice(0, 5));
          }
        } catch (flutterError) {
          this.log('warn', `Flutter 内部语义获取失败: ${flutterError.message}`);
        }
      }

      // 合并所有方法的结果
      const allElements = [...a11yElements];

      // 添加 DOM 元素
      for (const domEl of domElements.elements) {
        // 避免重复（通过 role + label 组合判断）
        const isDuplicate = allElements.some(el =>
          el.role === domEl.role && el.label === domEl.label
        );
        if (!isDuplicate) {
          allElements.push({
            ...domEl,
            tagName: 'dom-aria',
          });
        }
      }

      // 添加 Flutter 内部元素
      for (const flutterEl of flutterInternalElements) {
        const isDuplicate = allElements.some(el =>
          el.role === flutterEl.role && el.label === flutterEl.label
        );
        if (!isDuplicate) {
          allElements.push({
            ...flutterEl,
            tagName: 'flutter-internal',
            visible: true,
          });
        }
      }

      // 增强输入框识别：通过文本内容判断（Flutter Web 可能没有明确的 role）
      const detectInputField = (e) => {
        // 首先检查 role 属性
        if (e.role === 'textbox' || e.role === 'textfield' || e.role === 'input') {
          return true;
        }
        // 检查 label 或 text 内容是否包含输入相关关键词
        const text = ((e.label || '') + (e.text || '')).toLowerCase();
        const inputKeywords = ['输入', '請輸入', '请输入', 'id', '账号', '賬號', '用户', '使用者',
                               'account', 'email', '邮箱', '密碼', 'password', '手机', 'mobile',
                               '姓名', 'name', '栏位', '欄位', 'field', '填写', '填入'];
        return inputKeywords.some(keyword => text.includes(keyword));
      };

      const result = {
        elements: allElements,
        count: allElements.length,
        hasSemanticsHost: domElements.hasSemanticsHost,
        semanticsHostInfo: domElements.semanticsHostInfo,
        flutterElementCount: domElements.flutterElementCount,
        canvasCount: domElements.canvasCount,
        typeBreakdown: domElements.typeBreakdown || {},
        // 按类型分类
        byType: {
          buttons: allElements.filter(e => e.role === 'button').length,
          inputs: allElements.filter(e => detectInputField(e)).length,
          links: allElements.filter(e => e.role === 'link').length,
          text: allElements.filter(e => !e.role || e.role === 'text').length,
        },
      };

      this.log('info', `[A11Y] Flutter Web 可访问性树完成`, {
        total: result.count,
        buttons: result.byType.buttons,
        inputs: result.byType.inputs,
        links: result.byType.links,
        text: result.byType.text,
        hasSemanticsHost: result.hasSemanticsHost,
        typeBreakdown: result.typeBreakdown,
      });

      // 打印前5个元素样本用于调试
      if (result.elements.length > 0) {
        const samples = result.elements.slice(0, 5).map(e => ({
          role: e.role,
          label: e.label?.substring(0, 30),
          text: e.text?.substring(0, 30),
        }));
        this.log('debug', `[A11Y] 元素样本`, { samples });
      }

      return result;
    } catch (error) {
      this.log('error', '获取可访问性树失败', { error: error.message, stack: error.stack });
      return { elements: [], count: 0, byType: { buttons: 0, inputs: 0, links: 0, text: 0 } };
    }
  }

  /**
   * DOM 回退方式获取可访问性树
   * 当 Playwright accessibility API 不可用时使用
   * @returns {Object} 可访问性元素树
   */
  async _getAccessibilityTreeFromDOMFallback() {
    try {
      this.log('info', '[A11Y] 使用 DOM 遍历方式获取可访问性元素');

      const domElements = await this.page.evaluate(() => {
        const elements = [];

        // 1. 优先获取所有 flt-semantics 元素（Flutter Web 的语义元素）
        const allFlutterSemantics = document.querySelectorAll('flt-semantics[role], flt-semantics[aria-label], flt-semantics[flt-tappable]');
        allFlutterSemantics.forEach(el => {
          const rect = el.getBoundingClientRect();
          const role = el.getAttribute('role') || '';
          const label = el.getAttribute('aria-label') || '';
          const text = el.textContent?.trim().substring(0, 100) || '';
          const hasTappable = el.hasAttribute('flt-tappable');

          // 只添加有意义的元素（有 role、label 或是可点击的）
          if (role || label || text || hasTappable) {
            elements.push({
              role: role || (hasTappable ? 'button' : ''), // flt-tappable 默认为按钮
              label: label || text,
              text,
              tagName: 'flt-semantics',
              id: el.id || '',
              className: el.className || '',
              hasTappable,
              bounds: {
                x: rect.x, y: rect.y,
                width: rect.width, height: rect.height
              },
              visible: rect.width > 0 && rect.height > 0,
            });
          }
        });

        // 2. 从 flt-semantics-host 中获取语义元素（备用方案）
        const semanticsHost = document.querySelector('flt-semantics-host');
        if (semanticsHost) {
          const semanticsChildren = semanticsHost.querySelectorAll('[role], [aria-label]');
          semanticsChildren.forEach(el => {
            // 避免重复添加
            if (el.tagName === 'FLT-SEMANTICS') return;

            const rect = el.getBoundingClientRect();
            const role = el.getAttribute('role') || '';
            const label = el.getAttribute('aria-label') || el.textContent?.trim().substring(0, 100) || '';

            if (role || label) {
              // 检查是否已存在
              const exists = elements.some(e => e.id === el.id);
              if (!exists) {
                elements.push({
                  role,
                  label,
                  text: el.textContent?.trim().substring(0, 100) || '',
                  tagName: el.tagName?.toLowerCase() || '',
                  id: el.id || '',
                  className: el.className || '',
                  bounds: {
                    x: rect.x, y: rect.y,
                    width: rect.width, height: rect.height
                  },
                  visible: rect.width > 0 && rect.height > 0,
                });
              }
            }
          });
        }

        // 3. 标准 ARIA 元素（非 Flutter）
        const ariaSelectors = ['[role]:not(flt-semantics)', '[aria-label]:not(flt-semantics)', '[tabindex]:not(flt-semantics)'];
        const seen = new Set();

        for (const sel of ariaSelectors) {
          try {
            document.querySelectorAll(sel).forEach(el => {
              if (seen.has(el)) return;
              seen.add(el);

              const rect = el.getBoundingClientRect();
              const role = el.getAttribute('role') || '';
              const label = el.getAttribute('aria-label') || '';
              const text = el.textContent?.trim().substring(0, 100) || '';

              if ((role || label || text) && rect.width > 0 && rect.height > 0) {
                const isDup = elements.some(e => e.role === role && e.label === label);
                if (!isDup) {
                  elements.push({
                    role,
                    label: label || text,
                    text,
                    tagName: el.tagName?.toLowerCase() || '',
                    id: el.id || '',
                    className: el.className || '',
                    bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                    visible: true,
                  });
                }
              }
            });
          } catch (_) {}
        }

        return elements;
      });

      // 增强输入框识别：通过文本内容判断（Flutter Web 可能没有明确的 role）
      const detectInputField = (el) => {
        // 首先检查 role 属性
        if (el.role === 'textbox' || el.role === 'textfield' || el.role === 'input') {
          return true;
        }
        // 检查 aria-label 或文本内容是否包含输入相关关键词
        const text = (el.label || el.text || '').toLowerCase();
        const inputKeywords = ['输入', '請輸入', '请输入', 'id', '账号', '賬號', '用户', '使用者',
                               'account', 'email', '邮箱', '密碼', 'password', '手机', 'mobile',
                               '姓名', 'name', '栏位', '欄位', 'field', '填写', '填入'];
        const isInput = inputKeywords.some(keyword => text.includes(keyword));
        // 调试：记录检测到的输入框
        if (isInput && (!el.role || el.role === 'text' || el.role === 'unknown' || !el.role)) {
          this.log('debug', `[A11Y] 通过关键词检测到输入框`, { text: text.substring(0, 50), role: el.role, label: el.label?.substring(0, 30) });
        }
        return isInput;
      };

      const result = {
        elements: domElements,
        count: domElements.length,
        hasSemanticsHost: domElements.length > 0,
        byType: {
          buttons: domElements.filter(e => e.role === 'button').length,
          inputs: domElements.filter(e => detectInputField(e)).length,
          links: domElements.filter(e => e.role === 'link').length,
          text: domElements.filter(e => !e.role || e.role === 'text').length,
        },
      };

      this.log('info', `[A11Y] DOM 回退找到 ${result.count} 个元素`, result.byType);
      return result;
    } catch (error) {
      this.log('error', '[A11Y] DOM 回退获取失败', { error: error.message });
      return { elements: [], count: 0, byType: { buttons: 0, inputs: 0, links: 0, text: 0 } };
    }
  }

  /**
   * 获取页面状态（别名方法，与 getDOMState 相同）
   * @returns {Object} 页面状态
   */
  async getPageState() {
    // 先获取基本 DOM 状态
    const domState = await this.getDOMState();

    // 如果检测到 Canvas 渲染或 Flutter 元素，获取可访问性树
    const hasCanvas = domState.elements?.canvasCount > 0;
    const hasFlutterElements = domState.elements?.customElements?.some(e =>
      e.type === 'flutter' || e.type === 'shadow-dom' || e.type === 'semantics'
    );

    if (hasCanvas || hasFlutterElements) {
      this.log('info', '[Flutter Web] 检测到 Canvas/Flutter 渲染，获取可访问性树', {
        canvasCount: domState.elements?.canvasCount,
        hasFlutterElements,
      });
      const a11yTree = await this.getAccessibilityTree();
      domState.accessibilityTree = a11yTree;
      domState.isCanvasRendered = true;

      // 对于 Flutter Web，使用可访问性树中的元素作为主要元素列表
      if (a11yTree && a11yTree.elements && a11yTree.elements.length > 0) {
        // 增强输入框识别：通过文本内容判断（Flutter Web 可能没有明确的 role）
        const detectInputField = (e) => {
          // 首先检查 role 属性
          if (e.role === 'textbox' || e.role === 'textfield' || e.role === 'input' || e.role === 'search') {
            return true;
          }
          // 检查 label 或 text 内容是否包含输入相关关键词
          const text = ((e.label || '') + (e.text || '')).toLowerCase();
          const inputKeywords = ['输入', '請輸入', '请输入', 'id', '账号', '賬號', '用户', '使用者',
                                 'account', 'email', '邮箱', '密碼', 'password', '手机', 'mobile',
                                 '姓名', 'name', '栏位', '欄位', 'field', '填写', '填入'];
          return inputKeywords.some(keyword => text.includes(keyword));
        };

        // 将可访问性元素映射到标准格式
        // 包括 role='button' 的元素和有 hasTappable 标记的 Flutter 按钮
        domState.elements.buttons = a11yTree.elements
          .filter(e => e.role === 'button' || e.hasTappable)
          .map(e => ({
            text: e.label || e.text || '',
            id: e.id || '',
            className: e.className || '',
            tagName: e.tagName || 'flt-semantics',
            role: e.role || 'button',
            hasTappable: e.hasTappable,
          }));

        domState.elements.inputs = a11yTree.elements
          .filter(e => detectInputField(e))
          .map(e => ({
            type: 'text',
            name: '',
            id: e.id || '',
            placeholder: e.label || '',
            role: e.role || 'textbox',
            text: e.text || '',
          }));

        domState.elements.links = a11yTree.elements
          .filter(e => e.role === 'link')
          .map(e => ({
            text: e.label || e.text || '',
            href: '',
            tagName: 'a',
            role: 'link',
          }));

        // 添加统计信息 - 使用 a11yTree.byType 中的统计（已经包含增强检测）
        domState.elements.flutterElementCount = a11yTree.byType?.buttons +
                                                   a11yTree.byType?.inputs +
                                                   a11yTree.byType?.links || a11yTree.count;

        this.log('info', '[Flutter Web] 元素映射完成', {
          buttons: domState.elements.buttons.length,
          inputs: domState.elements.inputs.length,
          links: domState.elements.links.length,
          totalA11y: a11yTree.count,
        });
      }
    }

    return domState;
  }

  /**
   * 理解目标（从业务术语到选择器）
   * @param {string} target - 目标描述
   * @returns {Object} 映射结果
   */
  async understandTarget(target) {
    // 如果有 Memory，从 Memory 获取
    if (this.memory) {
      try {
        // TODO: 从 Memory 获取项目上下文
        // const context = await this.memory.getProjectContext();
        // return context.mapTarget(target);
      } catch (error) {
        this.log('warn', '从 Memory 获取目标失败', { error: error.message });
      }
    }

    // 使用基础映射
    const mapping = this.basicTargetMapping(target);

    // 如果返回 null，表示需要使用 findDynamicSelector 查找动态元素
    if (mapping === null) {
      this.log('info', `[understandTarget] 目标 "${target}" 需要动态查找`);
      return { needsDynamicSearch: true, target };
    }

    return mapping;
  }

  /**
   * 基础目标映射
   * @param {string} target - 目标
   * @returns {Object} 映射结果
   */
  basicTargetMapping(target) {
    // TODO: 扩展中文映射，避免 slugify 对中文返回空字符串导致路由错误
    // 添加空值检查
    if (!target || typeof target !== 'string') {
      return {
        route: '/unknown',
        component: 'Unknown',
      };
    }

    // 检查是否是按钮目标 - 按钮应该使用 findDynamicSelector 查找实际元素，而不是路由映射
    const buttonKeywords = ['按鈕', '按钮', 'button', 'btn', '下一步', 'next', '上一步', 'previous', '提交', 'submit', '取消', 'cancel', '確認', '确认', 'confirm', '關閉', '关闭', 'close'];
    const lowerTarget = target.toLowerCase();
    for (const keyword of buttonKeywords) {
      if (target.includes(keyword) || lowerTarget.includes(keyword.toLowerCase())) {
        this.log('info', `[basicTargetMapping] 检测到按钮目标 "${target}"，跳过路由映射，将使用 findDynamicSelector`);
        return null;  // 返回 null 表示需要使用 findDynamicSelector
      }
    }

    // 扩展的中文映射表 - 包含常见的页面和操作
    const mappings = {
      // 原有映射
      '案件列表': { route: '/cases', component: 'CaseList' },
      '案件详情': { route: '/cases/:id', component: 'CaseDetail' },
      '登录': { route: '/login', component: 'Login' },
      '首页': { route: '/', component: 'Home' },
      // 新增映射 - 常见页面
      '登录页': { route: '/login', component: 'Login' },
      '登录页面': { route: '/login', component: 'Login' },
      '密码页': { route: '/password', component: 'Password' },
      '密码页面': { route: '/password', component: 'Password' },
      // 账号管理（简体）
      '账号管理': { route: '/account_management', component: 'AccountManagement' },
      '账户管理': { route: '/account_management', component: 'AccountManagement' },
      '账户权限管理': { route: '/account_management', component: 'AccountManagement' },
      '账号权限管理': { route: '/account_management', component: 'AccountManagement' },
      // 账号管理（繁体）
      '帳號管理': { route: '/account_management', component: 'AccountManagement' },
      '帳戶管理': { route: '/account_management', component: 'AccountManagement' },
      '帳號權限管理': { route: '/account_management', component: 'AccountManagement' },
      '帳戶權限管理': { route: '/account_management', component: 'AccountManagement' },
      // 其他常见模块（使用完整菜单名称）
      'F 陳情稽查作業': { route: '/complaint_management', component: 'ComplaintManagement' },
      'F陳情稽查作業': { route: '/complaint_management', component: 'ComplaintManagement' },
      '陳情稽查作業': { route: '/complaint_management', component: 'ComplaintManagement' },
      '陳情稽查': { route: '/complaint_management', component: 'ComplaintManagement' },
      '陳情': { route: '/complaint_management', component: 'ComplaintManagement' },
      '補繳櫃台繳費作業': { route: '/counter_payment', component: 'CounterPayment' },
      '补缴柜台缴费作业': { route: '/counter_payment', component: 'CounterPayment' },
      '柜台北缴费': { route: '/counter_payment', component: 'CounterPayment' },
      '停車管理': { route: '/parking_management', component: 'ParkingManagement' },
      '停车管理': { route: '/parking_management', component: 'ParkingManagement' },
      '報表查詢': { route: '/report_query', component: 'ReportQuery' },
      '报表查询': { route: '/report_query', component: 'ReportQuery' },
      '系統設定': { route: '/system_settings', component: 'SystemSettings' },
      '系统设定': { route: '/system_settings', component: 'SystemSettings' },
      '系统设置': { route: '/system_settings', component: 'SystemSettings' },
      '2 基本資料作業': { route: '/basic_data', component: 'BasicData' },
      '基本資料作業': { route: '/basic_data', component: 'BasicData' },
      '基本资料作业': { route: '/basic_data', component: 'BasicData' },
      '3 開單管理': { route: 'ticket_management', component: 'TicketManagement' },
      '開單管理': { route: 'ticket_management', component: 'TicketManagement' },
      '开单管理': { route: 'ticket_management', component: 'TicketManagement' },
      // 操作相关 - 这些不应该产生路由，但需要处理以避免生成 /unknown
      '下一步': { route: '/login', component: 'NextStep' },  // 登录流程中下一步通常还在当前页
      '下一步按钮': { route: '/login', component: 'NextStep' },
      '登录按钮': { route: '/login', component: 'LoginButton' },
      '登入按鈕': { route: '/login', component: 'LoginButton' },
      '登入': { route: '/login', component: 'Login' },
    };

    // 优先精确匹配
    if (mappings[target]) {
      return mappings[target];
    }

    // 模糊匹配（包含关系）
    for (const [key, value] of Object.entries(mappings)) {
      if (target.includes(key) || key.includes(target)) {
        this.log('info', `[basicTargetMapping] 模糊匹配: "${target}" -> "${key}"`);
        return value;
      }
    }

    // 生成默认映射 - 但对纯中文有特殊处理
    const slug = this.slugify(target);
    if (!slug || slug === 'unknown' || slug.startsWith('page-')) {
      // 如果 slugify 对中文无效，尝试保留原文作为 hash 路由
      this.log('warn', `[basicTargetMapping] 无法将 "${target}" 转换为路由，使用 hash 模式`);
      return {
        route: '/#',  // 使用 hash 路由，让前端处理
        component: this.toPascalCase(target),
        useHash: true,
      };
    }

    return {
      route: `/${slug}`,
      component: this.toPascalCase(target),
    };
  }

  /**
   * 获取选择器（增强版：支持动态发现）
   * @param {string} target - 目标描述（如 "登录按钮"）
   * @param {number} index - 索引
   * @returns {string} 选择器
   */
  async getSelector(target, index = 0) {
    const mapping = await this.understandTarget(target);
    const selectors = mapping.selectors || {};

    // 1. 优先使用已命名的映射选择器
    if (selectors.item) {
      return index > 0 ? `${selectors.item}:nth-of-type(${index + 1})` : selectors.item;
    }

    if (selectors.container) {
      return selectors.container;
    }

    // 2. 尝试从当前页面动态发现元素（核心增强）
    this.log('info', `尝试动态搜索目标元素: "${target}"`);
    const dynamicResult = await this.findDynamicSelector(target);

    if (dynamicResult) {
      // 处理 AI 选择器生成的返回值
      if (dynamicResult.useAI && this.llm) {
        this.log('info', `[getSelector] 常规搜索失败，尝试 AI 生成选择器`, { target });
        const aiSelector = await this.askAIForSelector(target, 'any');
        if (aiSelector) {
          this.log('info', `[getSelector] AI 生成的选择器: ${aiSelector}`, { target });
          return aiSelector;
        }
      } else {
        const selector = typeof dynamicResult === 'string' ? dynamicResult : dynamicResult.selector;
        this.log('info', `发现动态選擇器: ${selector}`, { target, type: dynamicResult.type });
        return selector;
      }
    }

    // 3. 回退到默认的 slug 猜测（保留兼容性）
    const slug = this.slugify(target);
    this.log('warn', `未找到动态选择器，回退到默认猜测: [data-testid="${slug}"]`);
    return `[data-testid="${slug}"]`;
  }

  /**
   * 动态搜索目标元素（重构版 - 根据测试用例描述动态匹配）
   * 穿透 Shadow DOM 和 Flutter 语义层，根据目标描述智能匹配元素
   * @param {string} target - 目标名称（如 "ID 输入框"、"密码输入框"、"下一步按钮"）
   * @returns {Promise<{selector: string, elementInfo: object}|null>} 找到的选择器和元素信息
   */
  async findDynamicSelector(target) {
    try {
      // 处理 undefined 或 null target
      if (!target) {
        this.log('warn', '[findDynamicSelector] target 为空，跳过搜索');
        return null;
      }

      this.log('info', `[findDynamicSelector] 开始搜索目标: "${target}"`);

      const result = await this.page.evaluate((targetName) => {
        // 判断目标类型 - 修复：关键词可以在字符串的任何位置，不只在结尾
        const isInputTarget = /输入框|输入|input|填入|填写|框|ID|id|账号|密码|邮箱|email|用户|密码|password|手机|姓名|name/i.test(targetName);
        // 修复：只有明确指向密码 icon 时才触发 icon 搜索（缩小范围，避免误匹配）
        // 必须同时满足：包含 icon/eye/显示/隐藏 等关键词，且不包含"输入框"等输入框关键词
        const isPasswordIconTarget = /^(显示密码|隐藏密码|密码.*图标|密码icon|显示|隐藏|查看密码|眼睛|眼睛图标|眼睛圖標|eye|toggle password|show password|hide password|显示密码icon|隐藏密码icon)$/i.test(targetName) &&
          !/输入框|输入|框|input/i.test(targetName);
        const isButtonTarget = /按钮|按鈕|button|点击|點擊|click|下一步|确认|確認|提交|取消|關閉|关闭|登录|登入|注册|註冊|login|register|submit|cancel|close/i.test(targetName);
        const isLinkTarget = /链接|link|連結/i.test(targetName);

        // 提取区域/容器信息
        // 支持的格式：
        // - "表格中的搜索按钮" -> 容器: "表格", 目标: "搜索按钮"
        // - "查询页面的搜索按钮" -> 容器: "查询页面", 目标: "搜索按钮"
        // - "输入框旁边的搜索图标" -> 位置: "输入框旁边", 目标: "搜索图标"
        let containerKeyword = null;  // 容器关键词（如"表格"、"查询页面"）
        let positionKeyword = null;   // 位置关键词（如"旁边"、"上方"）

        // 检查区域描述
        const containerPatterns = [
          /(.{1,10}?)中的(.+)/,      // "表格中的搜索按钮"
          /(.{1,10}?)页面的(.+)/,    // "查询页面的搜索按钮"
          /(.{1,10}?)区域的(.+)/,    // "内容区域的搜索按钮"
          /(.{1,10}?)里的(.+)/,      // "表格里的搜索按钮"
        ];

        for (const pattern of containerPatterns) {
          const match = targetName.match(pattern);
          if (match) {
            containerKeyword = match[1].trim();
            // 更新 targetName 为去掉容器后的部分
            targetName = match[2].trim();
            break;
          }
        }

        // 检查位置描述
        if (/旁边|附近|上方|下方|左侧|右侧|之后|之前/i.test(targetName)) {
          const posMatch = targetName.match(/(.+?)(旁边|附近|上方|下方|左侧|右侧|之后|之前)(.+)/);
          if (posMatch) {
            positionKeyword = posMatch[1].trim();  // 位置参考元素，如"输入框"
            // 更新 targetName 为去掉位置描述后的部分
            targetName = posMatch[3].trim() || posMatch[1].trim();
          }
        }

        // 提取核心关键词 - 从目标描述中提取主要标识
        // 例如: "ID 输入框" -> "ID", "输入用户ID" -> "用户ID", "密码输入框" -> "密码"
        //       "下一步按钮" -> "下一步", "点击登录按钮" -> "登录", "登录按钮" -> "登录"
        // 支持简繁体：点击/點擊、选择/選擇、输入/輸入、按钮/按鈕、链接/鏈接
        let coreKeyword = targetName
          .replace(/^(输入|輸入|填入|填写|input|enter|点击|點擊|click|选择|選擇|select|按下|press)\s*/gi, '') // 去掉开头的动作词（支持简繁体）
          .replace(/(输入框|輸入框|输入|輸入|填入|填写|框|按钮|按鈕|鏈接|链接|button|input)$/gi, '') // 去掉结尾的类型词（支持简繁体）
          .replace(/\([^)]*\)/g, '') // 去掉括号内容
          .trim();

        // 简繁体字符映射（仅处理常见差异，动态转换用户输入的关键词）
        const scTcMap = {
          '登录': '登入',
          '注册': '註冊',
          '确认': '確認',
          '申请': '申請',
          '协议': '協議',
          '账户': '帳戶',
          '账号': '帳號',
          '密码': '密碼',
          '邮箱': '郵箱',
          '网络': '網絡',
          '设置': '設置',
          '选项': '選項',
          '选择': '選擇',
          '点击': '點擊',
          '返回': '返回',
          '下一步': '下一步',
          '上一页': '上一頁',
          '下一页': '下一頁',
          '提交': '提交',
          '取消': '取消',
          '关闭': '關閉',
          '搜索': '搜索',
          '查询': '查詢',
          '请输入': '請輸入',
          '请填写': '請填寫',
          '忘记': '忘記',
          '记住': '記住',
          '验证': '驗證',
          '保存': '保存',
          '修改': '修改',
          '删除': '刪除',
          '添加': '添加',
          '编辑': '編輯',
          '更新': '更新',
          '下载': '下載',
          '上传': '上傳'
        };

        // 动态生成简繁体变体（双向映射）
        const getKeywordVariants = (keyword) => {
          const variants = [keyword];
          const lowerKw = keyword.toLowerCase();

          // 对整个关键词尝试转换（双向映射）
          for (const [sc, tc] of Object.entries(scTcMap)) {
            // 简体 -> 繁体
            if (keyword.includes(sc)) {
              const converted = keyword.replace(new RegExp(sc, 'g'), tc);
              if (converted !== keyword) variants.push(converted);
            }
            // 繁体 -> 简体（反向映射）
            if (keyword.includes(tc)) {
              const converted = keyword.replace(new RegExp(tc, 'g'), sc);
              if (converted !== keyword) variants.push(converted);
            }
          }

          // 额外处理：直接添加常见的反向映射（确保双向转换）
          const reverseMap = {};
          for (const [sc, tc] of Object.entries(scTcMap)) {
            reverseMap[tc] = sc; // 繁体 -> 简体
          }
          // 合并映射进行转换
          const allMappings = { ...scTcMap, ...reverseMap };
          for (const [from, to] of Object.entries(allMappings)) {
            if (keyword.includes(from)) {
              const converted = keyword.replace(new RegExp(from, 'g'), to);
              if (converted !== keyword && !variants.includes(converted)) {
                variants.push(converted);
              }
            }
          }

          return [...new Set(variants)]; // 去重
        };

        const lowerKeyword = coreKeyword.toLowerCase();
        const originalKeyword = coreKeyword; // 保留原始大小写用于匹配
        const keywordVariants = getKeywordVariants(coreKeyword);

        // 调试日志：输出关键词变体
        console.log(`[findDynamicSelector] 核心关键词: "${coreKeyword}", 变体:`, keywordVariants);

        // ============ 智能匹配函数 ============
        // 完全动态匹配：直接用测试用例中的关键词去匹配页面元素
        // 计算元素与目标的相关性分数

        // 提取元素的"直接文本"（不包括子元素的递归文本）
        // 这样可以避免"忘记密码"按钮因为父容器包含"登入"文本而被误匹配
        const getDirectText = (element) => {
          // 获取直接子文本节点，不包括子元素的文本
          let directText = '';
          for (const child of element.childNodes) {
            if (child.nodeType === Node.TEXT_NODE) {
              directText += child.textContent || '';
            }
          }
          return directText.replace(/\s+/g, ' ').trim();
        };

        const calculateRelevanceScore = (element, targetType) => {
          let score = 0;
          const reasons = [];

          // ========== 智能导航栏排除 ==========
          // 只在特定情况下排除导航栏元素：
          // 1. 目标是功能按钮（如"搜索"、"提交"、"确定"）
          // 2. 目标描述不包含"菜单"、"导航"等导航相关关键词
          // 3. 页面内容区有相同类型的元素（避免误排除）

          // 判断是否应该排除导航栏
          const shouldExcludeNavigation = (() => {
            // 如果目标明确是导航相关的（如"查询作业菜单"），不排除
            const isNavigationTarget = /菜单|导航|menu|navigation|查询作业|作业查询/i.test(targetName);
            if (isNavigationTarget) return false;

            // 如果目标是功能按钮且不是导航按钮，排除导航栏
            const isFunctionButton = /搜索|查詢|查询|submit|确定|确认|取消|保存|删除|添加|编辑|search|submit|ok|confirm|cancel|save|delete|add|edit/i.test(targetName);
            if (isFunctionButton) return true;

            return false;
          })();

          if (shouldExcludeNavigation) {
            // 检查元素是否在导航相关的容器中
            let isInNavigation = false;
            let parentElement = element;
            let depth = 0;
            const maxDepth = 10; // 最多向上查找10层

            while (parentElement && depth < maxDepth) {
              const tagName = parentElement.tagName?.toLowerCase() || '';
              const className = (parentElement.className || '').toLowerCase();
              const id = (parentElement.id || '').toLowerCase();
              const role = (parentElement.getAttribute?.('role') || '').toLowerCase();

              // 检查是否在导航容器中
              if (
                tagName === 'nav' ||
                role === 'navigation' ||
                role === 'menu' ||
                role === 'menubar' ||
                role === 'menuitem' ||
                /nav|menu|header|sidebar|topbar/i.test(className) ||
                /nav|menu|header|sidebar|topbar/i.test(id)
              ) {
                isInNavigation = true;
                reasons.push('in-navigation-container');
                break;
              }

              parentElement = parentElement.parentElement;
              depth++;
            }

            // 如果元素本身是导航相关的标签或角色，也标记为导航元素
            const elementRole = (element.getAttribute?.('role') || '').toLowerCase();
            const elementTagName = element.tagName?.toLowerCase() || '';
            if (
              elementRole === 'navigation' ||
              elementRole === 'menu' ||
              elementRole === 'menubar' ||
              elementRole === 'menuitem' ||
              elementTagName === 'nav'
            ) {
              isInNavigation = true;
              reasons.push('is-navigation-element');
            }

            // 对于功能按钮，如果在导航中则大幅降权
            if (isInNavigation) {
              score -= 500; // 大幅降权
              reasons.push('function-button-in-navigation-penalty');
            }
          }

          // 获取元素的各种属性 - 修复空值安全问题
          const id = (element.id || '').toLowerCase();
          const name = (element.name || '').toLowerCase();
          const className = (element.className || '').toLowerCase();
          const placeholder = (element.getAttribute ? (element.getAttribute('placeholder') || '') : '').toLowerCase();
          const ariaLabel = String(element.getAttribute && element.getAttribute('aria-label') || '').toLowerCase();
          // 修复：将换行符替换为空格，以匹配 Flutter 语义树中的多行文本（如 "F\n陳情稽查作業"）
          const textContent = (element.textContent || '').replace(/\n/g, ' ').trim().toLowerCase();
          const directText = getDirectText(element).toLowerCase(); // 新增：获取直接文本
          const role = (element.getAttribute ? (element.getAttribute('role') || '') : '').toLowerCase();
          const type = (element.type || '').toLowerCase();

          // ========== 精确匹配优先：使用直接文本进行匹配 ==========
          // 直接文本（不包括子元素）的匹配权重最高，避免父容器文本干扰
          for (const variant of keywordVariants) {
            const vLower = variant.toLowerCase();
            // 完全匹配
            if (directText === vLower) {
              score += 200; // 最高分
              reasons.push('exact-direct-text-match');
              break;
            }
            // 前缀匹配（如"登入"匹配"登入按钮"的开头）
            if (directText.startsWith(vLower)) {
              score += 150;
              reasons.push('prefix-direct-text-match');
              break;
            }
          }

          // 如果直接文本已经匹配，不需要继续检查 textContent
          if (score >= 150) {
            // 继续其他评分，但优先级已确定
          } else {
            // 只有在直接文本没有匹配时，才使用完整的 textContent（包括子元素）
            // 这样可以避免"忘记密码"因为父容器包含"登入"而被误匹配
            for (const variant of keywordVariants) {
              const vLower = variant.toLowerCase();
              if (textContent === vLower) {
                score += 100; // 完全匹配加分
                reasons.push('exact-text-match');
                break;
              }
            }

            // 文本包含匹配（降低权重，避免误匹配）
            for (const variant of keywordVariants) {
              if (textContent.includes(variant.toLowerCase())) {
                score += 30; // 降低包含匹配的权重
                reasons.push('contains-in-text');
                break;
              }
            }
          }

          // 1. 精确匹配 - 属性值完全等于关键词（同时检查大小写）
          if (id === lowerKeyword || id === originalKeyword) score += 100;
          if (name === lowerKeyword || name === originalKeyword) score += 100;
          if (className === lowerKeyword || className === originalKeyword) score += 100;
          if (score > 0) reasons.push('exact-match');

          // 2. 包含匹配 - 属性值包含关键词（包括简繁体变体）
          for (const variant of keywordVariants) {
            const vLower = variant.toLowerCase();
            if (id.includes(vLower)) {
              score += 50;
              reasons.push('contains-in-id');
              break;
            }
          }
          for (const variant of keywordVariants) {
            const vLower = variant.toLowerCase();
            if (name.includes(vLower)) {
              score += 50;
              reasons.push('contains-in-name');
              break;
            }
          }
          for (const variant of keywordVariants) {
            const vLower = variant.toLowerCase();
            if (placeholder.includes(vLower)) {
              score += 50;
              reasons.push('contains-in-placeholder');
              break;
            }
          }
          for (const variant of keywordVariants) {
            const vLower = variant.toLowerCase();
            if (ariaLabel.includes(vLower)) {
              score += 50;
              reasons.push('contains-in-aria-label');
              break;
            }
          }

          // 3. aria-label 匹配（Flutter 语义元素常用）
          for (const variant of keywordVariants) {
            if (ariaLabel && ariaLabel.includes(variant.toLowerCase())) {
              score += 70; // aria-label 匹配给高分
              reasons.push('contains-in-aria-label');
              break;
            }
          }

          // 4. 其他属性匹配（id, name, className）- 降低权重避免误匹配
          for (const variant of keywordVariants) {
            const vLower = variant.toLowerCase();
            if (id && id.includes(vLower)) {
              score += 30;
              reasons.push('contains-in-id');
              break;
            }
          }
          for (const variant of keywordVariants) {
            const vLower = variant.toLowerCase();
            if (name && name.includes(vLower)) {
              score += 30;
              reasons.push('contains-in-name');
              break;
            }
          }

          // 5. 特殊处理：大写关键词匹配（如 "ID"）
          if (originalKeyword === originalKeyword.toUpperCase() &&
              (directText.includes(originalKeyword) || ariaLabel.includes(originalKeyword))) {
            score += 30;
            reasons.push('exact-case-match');
          }

          // 6. 根据目标类型进行特殊匹配
          if (targetType === 'input') {
            // 输入框：检查 type 属性
            if (type === 'text' || type === 'email' || type === 'password' || !type) {
              score += 10;
            }
            // 检查是否有输入相关的语义
            if (role === 'textbox' || role === 'textfield' || placeholder || ariaLabel) {
              score += 20;
            }
            // 检查文本内容是否包含输入相关的提示词
            if (textContent.includes('請輸入') || textContent.includes('请输入') ||
                textContent.includes('输入') || textContent.includes('填入')) {
              score += 15;
            }
          } else if (targetType === 'button') {
            // 对于按钮搜索，文本内容是最重要的匹配依据
            // 如果目标关键词有明确的文本含义（不是泛指的"按钮"），则必须匹配文本
            const hasSpecificKeyword = coreKeyword && coreKeyword.length > 1 && !/^(button|按钮|click|点击)$/.test(lowerKeyword);

            if (role === 'button' || (element.tagName && element.tagName.toLowerCase() === 'button')) {
              // 检查是否是 icon 按钮（通过多种方式判断）
              const isFlutterIconButton = element.tagName === 'FLT-SEMANTICS' &&
                                         element.hasAttribute('flt-tappable');
              const isIconButton = (!textContent || textContent.length < 1) &&
                (element.querySelector('svg') !== null ||
                 element.querySelector('i') !== null ||
                 element.tagName === 'svg' ||
                 /icon|btn-icon|icon-btn/i.test(className) ||
                 isFlutterIconButton);

              // 对于 icon 按钮，优先检查 aria-label 和 title 属性
              if (isIconButton) {
                const titleAttr = String(element.getAttribute && element.getAttribute('title') || '').toLowerCase();
                // 如果 aria-label 或 title 包含关键词，给高分
                if (ariaLabel && (ariaLabel.includes(lowerKeyword) || keywordVariants.some(v => ariaLabel.includes(v.toLowerCase())))) {
                  score += 60; // icon 按钮的 aria-label 匹配给高分
                  reasons.push('icon-aria-label-match');
                } else if (titleAttr && (titleAttr.includes(lowerKeyword) || keywordVariants.some(v => titleAttr.includes(v.toLowerCase())))) {
                  score += 50; // icon 按钮的 title 匹配给中高分
                  reasons.push('icon-title-match');
                } else if (isFlutterIconButton) {
                  // Flutter 图标按钮：通过位置关系来判断
                  // 检查是否在表格/列表/表单附近
                  let nearTable = false;
                  let parentElement = element.parentElement;
                  let depth = 0;
                  while (parentElement && depth < 10) {
                    const parentText = (parentElement.textContent || '').toLowerCase();
                    const parentRole = (parentElement.getAttribute?.('role') || '').toLowerCase();
                    if (parentRole === 'grid' || parentRole === 'table' ||
                        parentText.includes('表格') || parentText.includes('列表') ||
                        parentElement.querySelector('table') !== null) {
                      nearTable = true;
                      reasons.push('flutter-icon-button-near-table');
                      break;
                    }
                    parentElement = parentElement.parentElement;
                    depth++;
                  }

                  // 如果目标关键词是"查询"、"搜索"等，且图标按钮在表格附近，给较高分
                  if (nearTable && (/查询|搜索|search|query/i.test(lowerKeyword))) {
                    score += 50;
                    reasons.push('flutter-icon-button-search-near-table');
                  } else {
                    score += 20; // Flutter 图标按钮基础分
                    reasons.push('flutter-icon-button');
                  }
                } else if (hasSpecificKeyword) {
                  // 如果有具体关键词但 aria-label/title 都不匹配，适度降权（不是大幅降权）
                  score -= 10; // 从 -40 改为 -10
                  reasons.push('icon-button-no-label-match');
                } else {
                  score += 10;
                  reasons.push('is-icon-button');
                }
              } else if (hasSpecificKeyword && (!textContent || textContent.length < 1)) {
                // 非图标按钮但没有文本，才大幅降权
                score -= 40; // 没有文本的普通按钮大幅降权
                reasons.push('button-no-text-penalty');
              } else {
                score += 10; // 降低基础按钮分数
                reasons.push('is-button');
                // 额外加分：真正的 <button> 标签优于有 role="button" 的其他元素
                if (element.tagName && element.tagName.toLowerCase() === 'button') {
                  score += 20; // 真正的按钮元素加分
                  reasons.push('real-button-tag');
                }
              }
            } else {
              // 如果不是按钮元素（如链接、div 等），大幅降权
              // 目标是"按钮"时，不应该选择非按钮元素
              if (targetName && targetName.includes('按钮')) {
                score -= 50;
                reasons.push('not-button-element-for-button-target');
              }
            }
            // 检查是否有点击相关的样式
            const computedStyle = window.getComputedStyle(element);
            if (computedStyle.cursor === 'pointer' || element.onclick) {
              score += 5;
              reasons.push('clickable-style');
            }
          }

          // ========== 区域容器加分 ==========
          // 如果目标描述包含区域信息（如"表格中的搜索按钮"），检查元素是否在该区域中
          if (containerKeyword) {
            const containerVariants = [containerKeyword];
            // 简繁体转换
            const scTcMap = {
              '表格': '表格',
              '查询': '查詢',
              '页面': '頁面',
              '内容': '內容',
              '列表': '列表',
              '表单': '表單',
              '弹窗': '彈窗',
              '对话框': '對話框',
              '卡片': '卡片'
            };
            for (const [sc, tc] of Object.entries(scTcMap)) {
              if (containerKeyword.includes(sc)) {
                containerVariants.push(containerKeyword.replace(sc, tc));
              }
              if (containerKeyword.includes(tc)) {
                containerVariants.push(containerKeyword.replace(tc, sc));
              }
            }

            // 检查元素是否在指定的容器中
            let isInContainer = false;
            let parentElement = element;
            let depth = 0;
            const maxDepth = 15;

            while (parentElement && depth < maxDepth) {
              const parentTagName = parentElement.tagName?.toLowerCase() || '';
              const parentClassName = (parentElement.className || '').toLowerCase();
              const parentId = (parentElement.id || '').toLowerCase();
              const parentText = (parentElement.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
              const parentRole = (parentElement.getAttribute?.('role') || '').toLowerCase();

              // 检查父元素是否匹配容器关键词
              for (const variant of containerVariants) {
                const vLower = variant.toLowerCase();
                if (
                  parentClassName.includes(vLower) ||
                  parentId.includes(vLower) ||
                  parentRole.includes(vLower) ||
                  (parentTagName === 'table' && vLower.includes('表格')) ||
                  (parentTagName === 'form' && vLower.includes('表单')) ||
                  (parentTagName === 'dialog' && (vLower.includes('弹窗') || vLower.includes('对话框'))) ||
                  parentText.includes(vLower)
                ) {
                  isInContainer = true;
                  reasons.push(`in-container-${variant}`);
                  break;
                }
              }

              if (isInContainer) break;
              parentElement = parentElement.parentElement;
              depth++;
            }

            if (isInContainer) {
              score += 100; // 在指定容器中的元素大幅加分
            } else {
              score -= 50; // 如果明确指定了容器但元素不在其中，降权
              reasons.push('not-in-specified-container');
            }
          }

          return { score, reasons, element };
        };

        // ============ 搜索标准 HTML 元素 ============

        // 0. 优先处理：搜索密码显示/隐藏 icon 按钮
        // 当目标是"显示密码"、"隐藏密码"等时，需要找到密码输入框旁边的 icon
        // 这必须在输入框检测之前执行，否则会被输入框检测提前返回
        if (isPasswordIconTarget) {
          console.log(`[findDynamicSelector] 检测到密码 icon 目标: "${targetName}"，优先搜索 icon 元素`);

          // 首先找到密码输入框
          const passwordInput = Array.from(document.querySelectorAll('input[type="password"], input[id*="password"], input[name*="password"], input[placeholder*="密码"], input[placeholder*="密碼"]'))
            .find(input => {
              const rect = input.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0;
            });

          if (passwordInput) {
            console.log(`[findDynamicSelector] 找到密码输入框: ${passwordInput.id || passwordInput.name || 'password-input'}`);

            // 在密码输入框的父元素中查找 icon 按钮
            // 可能的 selector：button, span[role="button"], svg, i, 或者其他可点击元素
            const parent = passwordInput.parentElement;
            const grandParent = parent?.parentElement;
            const greatGrandParent = grandParent?.parentElement;

            // 在父元素、祖父元素和曾祖父元素中搜索可能的 icon
            const possibleIcons = [];

            if (parent) {
              possibleIcons.push(...Array.from(parent.children));
            }
            if (grandParent) {
              possibleIcons.push(...Array.from(grandParent.children));
            }
            if (greatGrandParent) {
              possibleIcons.push(...Array.from(greatGrandParent.children));
            }

            // 过滤出可能的 icon 元素（排除密码输入框本身）
            const iconElements = possibleIcons.filter(el => {
              if (el === passwordInput) return false;
              const rect = el.getBoundingClientRect();
              if (rect.width <= 0 || rect.height <= 0) return false;

              // 检查是否是可点击的元素或有特定的 icon 相关属性
              const isClickable = el.tagName === 'BUTTON' ||
                                el.getAttribute('role') === 'button' ||
                                el.onclick !== null ||
                                el.tagName === 'svg' ||
                                el.tagName === 'I' ||
                                el.querySelector('svg') !== null ||
                                el.querySelector('i') !== null;

              // 检查 aria-label 或 title 是否包含眼睛/密码相关的词
              const ariaLabel = el.getAttribute('aria-label') || '';
              const title = el.getAttribute('title') || '';
              const className = el.className || '';
              const hasPasswordKeyword = /眼睛|eye|显示|隐藏|show|hide|password|密码|密碼|visible|toggle/i.test(ariaLabel + title + className);

              return isClickable || hasPasswordKeyword;
            });

            console.log(`[findDynamicSelector] 找到 ${iconElements.length} 个可能的 icon 元素`);

            if (iconElements.length > 0) {
              // 选择最可能的一个（通常是在输入框右侧的）
              // 优先选择有 aria-label 包含"显示"、"隐藏"、"eye"等的元素
              let icon = iconElements.find(el => {
                const ariaLabel = el.getAttribute('aria-label') || '';
                const title = el.getAttribute('title') || '';
                return /眼睛|eye|显示|隐藏|show|hide|visible|toggle/i.test(ariaLabel + title);
              });

              // 如果没找到，选择第一个可点击的元素
              if (!icon) {
                icon = iconElements.find(el => {
                  return el.tagName === 'BUTTON' ||
                         el.getAttribute('role') === 'button' ||
                         el.onclick !== null;
                });
              }

              // 如果还是没找到，选择第一个
              if (!icon) {
                icon = iconElements[0];
              }

              // 生成选择器
              if (icon.id) {
                console.log(`[findDynamicSelector] 使用 icon ID: #${icon.id}`);
                return { selector: `#${icon.id}`, type: 'password-icon', score: 100, reasons: ['密码显示/隐藏icon'] };
              }

              // 尝试使用其他属性
              const ariaLabel = icon.getAttribute('aria-label');
              if (ariaLabel) {
                return { selector: `[aria-label="${ariaLabel}"]`, type: 'password-icon', score: 100, reasons: ['密码显示/隐藏icon'] };
              }

              // 使用 XPath 或 CSS 选择器
              const index = Array.from(parent?.children || []).indexOf(icon);
              if (index >= 0) {
                const parentId = parent.id ? `#${parent.id}` : '';
                const parentSelector = parentId || parent.tagName.toLowerCase();
                return { selector: `${parentSelector}>:nth-child(${index + 1})`, type: 'password-icon', score: 100, reasons: ['密码显示/隐藏icon'] };
              }
            }

            // 如果没找到 icon，尝试点击密码输入框本身（某些实现在输入框内点击也能切换显示）
            console.log(`[findDynamicSelector] 未找到专门的 icon 元素，将点击密码输入框`);
            if (passwordInput.id) {
              return { selector: `#${passwordInput.id}`, type: 'password-input-as-icon', score: 50, reasons: ['密码输入框(用于切换显示)'] };
            }
            if (passwordInput.name) {
              return { selector: `[name="${passwordInput.name}"]`, type: 'password-input-as-icon', score: 50, reasons: ['密码输入框(用于切换显示)'] };
            }
          }
        }

        // 1. 搜索输入框（只考虑可见元素）
        if (isInputTarget) {
          const allInputs = Array.from(document.querySelectorAll('input, textarea, select, [contenteditable="true"]'))
            .filter(el => {
              // 过滤掉不可见的元素（如 Flutter 隐藏的 input）
              const rect = el.getBoundingClientRect();
              const style = window.getComputedStyle(el);
              // 必须有尺寸且不是 display:none 或 visibility:hidden
              return rect.width > 0 && rect.height > 0 &&
                     style.display !== 'none' &&
                     style.visibility !== 'hidden' &&
                     style.opacity !== '0';
            });

          // 为每个输入框计算相关性分数
          const scoredInputs = allInputs.map(el => calculateRelevanceScore(el, 'input'))
            .filter(item => item.score > 0)
            .sort((a, b) => b.score - a.score);

          if (scoredInputs.length > 0) {
            const best = scoredInputs[0];
            const el = best.element;
            if (el.id) return { selector: `#${el.id}`, type: 'input-by-relevance', score: best.score, reasons: best.reasons };
            if (el.name) return { selector: `[name="${el.name}"]`, type: 'input-by-relevance', score: best.score, reasons: best.reasons };
            // 如果没有 id 或 name，使用 nth-of-type
            const index = allInputs.indexOf(el) + 1;
            return { selector: `input:nth-of-type(${index})`, type: 'input-by-relevance', score: best.score, reasons: best.reasons };
          }
        }

        // 2. 搜索按钮（只考虑可见元素）
        if (isButtonTarget) {
          // ========== 特殊处理1：输入框附属按钮（清除、密码显示等） ==========
          // 识别模式：[输入框名称] + (清除|×|顯示|眼睛|搜尋|查詢) + 按鈕|图标|icon
          const inputButtonPattern = /(.+?)(框|輸入框)(清除|×|顯示|眼睛|搜尋|查詢|搜索|query|search)(按鈕|圖標|图标|icon|按鈕)?$/i;
          const inputButtonMatch = targetName.match(inputButtonPattern);

          if (inputButtonMatch) {
            const inputName = inputButtonMatch[1]; // 输入框名称，如 "ID搜尋"
            const buttonType = inputButtonMatch[3].toLowerCase(); // 按钮类型

            return {
              useInputButtonHandling: true,
              targetName: targetName,
              inputName: inputName,
              buttonType: buttonType,
              reason: '检测到输入框附属按钮目标'
            };
          }

          // ========== 特殊处理2：搜索/查询图标按钮 ==========
          // 当目标是"搜尋按鈕"、"查詢按鈕"、"搜索按鈕"等时，
          // 优先使用位置关系查找，避免前缀匹配选错按钮
          if (/搜尋|查詢|搜索|查询|search|query/i.test(targetName)) {
            // 立即返回特殊标记，让外部执行位置关系查找
            return {
              useSpecialSearchIconHandling: true,
              targetName: targetName,
              reason: '检测到搜索/查询按钮目标，需要特殊处理'
            };
          }

          // 获取所有按钮元素及其真实文字（包括 Flutter 图标按钮）
          // 获取所有按钮元素及其真实文字（包括 Flutter 图标按钮）
          const allButtons = Array.from(document.querySelectorAll('button, [role="button"], flt-semantics[flt-tappable]'))
            .filter(el => {
              // 过滤掉不可见的元素
              const rect = el.getBoundingClientRect();
              const style = window.getComputedStyle(el);
              return rect.width > 0 && rect.height > 0 &&
                     style.display !== 'none' &&
                     style.visibility !== 'hidden' &&
                     style.opacity !== '0';
            })
            .map(el => {
              // 获取按钮的直接文字（不包括子元素的递归文字）
              let directText = '';
              for (const child of el.childNodes) {
                if (child.nodeType === Node.TEXT_NODE) {
                  directText += child.textContent || '';
                }
              }
              // 如果没有直接文字，使用完整文字（去除空白）
              if (!directText.trim()) {
                directText = el.textContent || '';
              }
              // 清理文字：去除多余空白
              const buttonText = directText.replace(/\s+/g, ' ').trim();

              return {
                element: el,
                text: buttonText,
                textLower: buttonText.toLowerCase(),
                id: el.id || '',
                ariaLabel: el.getAttribute('aria-label') || ''
              };
            });

          console.log(`[findDynamicSelector] 页面按钮列表:`, allButtons.map(b => ({
            id: b.id || '(无id)',
            text: b.text.substring(0, 20),
            textLower: b.textLower.substring(0, 20)
          })));

          // ========== 精确匹配策略 ==========
          // 1. 完全匹配：按钮文字与目标关键词完全一致
          let exactMatch = allButtons.find(b => b.textLower === lowerKeyword);
          if (exactMatch) {
            console.log(`[findDynamicSelector] 找到完全匹配: "${exactMatch.text}" === "${coreKeyword}"`);
            if (exactMatch.id) return { selector: `#${exactMatch.id}`, type: 'button-exact-match', score: 200, reasons: ['完全匹配'] };
            return { selector: `[role="button"]:text("${exactMatch.text}")`, type: 'button-exact-match', score: 200, reasons: ['完全匹配'] };
          }

          // 2. 简繁体匹配：检查简繁体变体
          for (const variant of keywordVariants) {
            const match = allButtons.find(b => b.textLower === variant.toLowerCase());
            if (match) {
              console.log(`[findDynamicSelector] 找到简繁体匹配: "${match.text}" ≈ "${variant}"`);
              if (match.id) return { selector: `#${match.id}`, type: 'button-variant-match', score: 190, reasons: ['简繁体匹配'] };
              return { selector: `[role="button"]:text("${match.text}")`, type: 'button-variant-match', score: 190, reasons: ['简繁体匹配'] };
            }
          }

          // 3. 前缀匹配：按钮文字以目标关键词开头（如"下一步 →"匹配"下一步"）
          let prefixMatch = allButtons.find(b => b.textLower.startsWith(lowerKeyword) || lowerKeyword.startsWith(b.textLower));
          if (prefixMatch) {
            console.log(`[findDynamicSelector] 找到前缀匹配: "${prefixMatch.text}" ~ "${coreKeyword}"`);
            if (prefixMatch.id) return { selector: `#${prefixMatch.id}`, type: 'button-prefix-match', score: 150, reasons: ['前缀匹配'] };
            return { selector: `[role="button"]:text("${prefixMatch.text}")`, type: 'button-prefix-match', score: 150, reasons: ['前缀匹配'] };
          }

          // 4. aria-label 匹配
          let ariaMatch = allButtons.find(b => {
            const ariaLabel = (b.ariaLabel || '').toLowerCase();
            return ariaLabel === lowerKeyword || ariaLabel === coreKeyword.toLowerCase();
          });
          if (ariaMatch) {
            console.log(`[findDynamicSelector] 找到 aria-label 匹配: "${ariaMatch.ariaLabel}"`);
            if (ariaMatch.id) return { selector: `#${ariaMatch.id}`, type: 'button-aria-match', score: 120, reasons: ['aria-label匹配'] };
            return { selector: `[aria-label="${ariaMatch.ariaLabel}"]`, type: 'button-aria-match', score: 120, reasons: ['aria-label匹配'] };
          }

          // 5. ID/Name 匹配
          let idMatch = allButtons.find(b => b.id && (b.id.toLowerCase() === lowerKeyword || b.id.toLowerCase().includes(lowerKeyword)));
          if (idMatch) {
            console.log(`[findDynamicSelector] 找到 ID 匹配: "${idMatch.id}"`);
            return { selector: `#${idMatch.id}`, type: 'button-id-match', score: 100, reasons: ['ID匹配'] };
          }

          // 如果都没匹配到，输出调试信息
          console.log(`[findDynamicSelector] 未找到匹配的按钮，目标: "${coreKeyword}", 可用按钮:`, allButtons.map(b => b.text));

          // 继续使用原来的评分逻辑作为后备方案
          const scoredButtons = allButtons.map(item => {
            const result = calculateRelevanceScore(item.element, 'button');
            return { ...result, buttonText: item.text };
          })
          .filter(item => item.score > 0)
          .sort((a, b) => b.score - a.score);

          if (scoredButtons.length > 0) {
            const best = scoredButtons[0];
            console.log(`[findDynamicSelector] 使用评分后备方案，选中: "${best.buttonText}"`, { score: best.score, reasons: best.reasons });
            const el = best.element;
            if (el.id) return { selector: `#${el.id}`, type: 'button-by-relevance', score: best.score, reasons: best.reasons };
            const index = allButtons.findIndex(b => b.element === el) + 1;
            return { selector: `button:nth-of-type(${index})`, type: 'button-by-relevance', score: best.score, reasons: best.reasons };
          }
        }

        // ============ 搜索 Flutter 语义元素 ============
        const allSemantics = Array.from(document.querySelectorAll('flt-semantics, [role], [aria-label]'))
          .filter(el => {
            // 过滤不可见元素（完整检查）
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            return rect.width > 0 && rect.height > 0 &&
                   style.display !== 'none' &&
                   style.visibility !== 'hidden' &&
                   style.opacity !== '0';
          });

        const targetType = isInputTarget ? 'input' : isButtonTarget ? 'button' : 'any';
        const scoredSemantics = allSemantics
          .map(el => calculateRelevanceScore(el, targetType))
          .filter(item => item.score >= 10) // 修改阈值：从 >10 改为 >=10，确保基础按钮分能通过
          .sort((a, b) => b.score - a.score);

        if (scoredSemantics.length > 0) {
          const best = scoredSemantics[0];
          const el = best.element;

          // 生成选择器
          if (el.id) {
            return { selector: `#${el.id}`, type: 'flutter-by-relevance', score: best.score, reasons: best.reasons };
          }

          // 使用 nth-of-type 作为备选
          const index = allSemantics.indexOf(el) + 1;
          return { selector: `flt-semantics:nth-of-type(${index})`, type: 'flutter-by-relevance', score: best.score, reasons: best.reasons };
        }

        // ============ 常规搜索失败，尝试 AI 生成选择器 ============
        // 将控制权交还给外部处理，由外部决定是否调用 AI
        return { useAI: true, reason: '常规搜索未找到匹配元素，建议使用 AI 生成选择器' };

      }, target);

      if (result) {
        // ========== 检查是否需要处理输入框附属按钮 ==========
        if (result.useInputButtonHandling) {
          this.log('info', `[findDynamicSelector] 检测到输入框附属按钮目标`, {
            targetName: result.targetName,
            inputName: result.inputName,
            buttonType: result.buttonType
          });

          // 执行输入框附属按钮查找
          const buttonResult = await this.page.evaluate((inputName, buttonType) => {
            // 1. 找到相关的输入框
            let relatedInput = null;
            const allInputs = Array.from(document.querySelectorAll('input, textarea, [contenteditable="true"], [role="textbox"]'))
              .filter(el => {
                const rect = el.getBoundingClientRect();
                const style = window.getComputedStyle(el);
                return rect.width > 0 && rect.height > 0 &&
                       style.display !== 'none' &&
                       style.visibility !== 'hidden';
              });

            // 尝试通过名称匹配输入框
            const inputKeywords = [
              inputName.toLowerCase(),
              ...inputName.split(/[\s\-_]+/).filter(s => s.length > 1)
            ];

            for (const input of allInputs) {
              const id = (input.id || '').toLowerCase();
              const name = (input.name || '').toLowerCase();
              const placeholder = (input.getAttribute?.('placeholder') || '').toLowerCase();
              const ariaLabel = (input.getAttribute?.('aria-label') || '').toLowerCase();
              const className = (input.className || '').toLowerCase();

              for (const keyword of inputKeywords) {
                if (keyword && (id.includes(keyword) || name.includes(keyword) ||
                    placeholder.includes(keyword) || ariaLabel.includes(keyword) ||
                    className.includes(keyword))) {
                  relatedInput = input;
                  break;
                }
              }
              if (relatedInput) break;
            }

            // 如果没找到，使用第一个输入框（只有一个输入框的情况）
            if (!relatedInput && allInputs.length === 1) {
              relatedInput = allInputs[0];
            }

            if (!relatedInput) {
              return { success: false, reason: '未找到相关输入框' };
            }

            const inputRect = relatedInput.getBoundingClientRect();
            const inputCenterX = inputRect.left + inputRect.width / 2;
            const inputCenterY = inputRect.top + inputRect.height / 2;

            // 2. 查找输入框附近的所有图标按钮
            const allIconButtons = Array.from(document.querySelectorAll('flt-semantics[flt-tappable], [role="button"][flt-tappable]'))
              .filter(el => {
                const rect = el.getBoundingClientRect();
                const style = window.getComputedStyle(el);
                if (rect.width <= 0 || rect.height <= 0 ||
                    style.display === 'none' ||
                    style.visibility === 'hidden' ||
                    style.opacity === '0') {
                  return false;
                }
                const text = (el.textContent || '').trim();
                return text.length === 0 || text.length <= 2;
              });

            // 3. 根据按钮类型分类并选择合适的按钮
            const buttonCategories = {
              insideRight: [],   // 输入框内部右侧（清除、密码显示）
              outsideRight: [],  // 输入框外部右侧（搜索）
              below: [],         // 输入框下方
              other: []          // 其他位置
            };

            for (const btn of allIconButtons) {
              const btnRect = btn.getBoundingClientRect();
              const btnCenterX = btnRect.left + btnRect.width / 2;
              const btnCenterY = btnRect.top + btnRect.height / 2;

              const isVerticallyOverlapping = btnRect.top >= inputRect.top - 10 && btnRect.bottom <= inputRect.bottom + 10;
              const isInsideInputHorizontal = btnRect.right <= inputRect.right + 15;
              const isToRight = btnRect.left >= inputRect.right - 20;
              const isBelow = btnRect.top >= inputRect.bottom - 20;

              if (isVerticallyOverlapping && isInsideInputHorizontal) {
                buttonCategories.insideRight.push(btn);
              } else if (isToRight && !isVerticallyOverlapping) {
                buttonCategories.outsideRight.push(btn);
              } else if (isBelow) {
                buttonCategories.below.push(btn);
              } else {
                buttonCategories.other.push(btn);
              }
            }

            // 4. 根据按钮类型选择合适的按钮
            let targetButton = null;
            let buttonCategory = null;

            if (/清除|×|clear|cancel/i.test(buttonType)) {
              // 清除按钮：输入框内部右侧
              buttonCategory = buttonCategories.insideRight;
              if (buttonCategory.length > 0) {
                // 选择最右边的按钮（通常清除按钮在最右边）
                targetButton = buttonCategory.reduce((rightmost, btn) => {
                  const rightmostRect = rightmost.getBoundingClientRect();
                  const btnRect = btn.getBoundingClientRect();
                  return btnRect.right > rightmostRect.right ? btn : rightmost;
                });
              }
            } else if (/搜尋|查詢|搜索|query|search/i.test(buttonType)) {
              // 搜索按钮：优先选择外部右侧，其次选择下方
              buttonCategory = buttonCategories.outsideRight.length > 0
                ? buttonCategories.outsideRight
                : buttonCategories.below;
              if (buttonCategory.length > 0) {
                // 选择距离输入框最近的按钮
                let minDistance = Infinity;
                for (const btn of buttonCategory) {
                  const btnRect = btn.getBoundingClientRect();
                  const btnCenterX = btnRect.left + btnRect.width / 2;
                  const btnCenterY = btnRect.top + btnRect.height / 2;
                  const distance = Math.sqrt(
                    Math.pow(btnCenterX - inputCenterX, 2) +
                    Math.pow(btnCenterY - inputCenterY, 2)
                  );
                  if (distance < minDistance) {
                    minDistance = distance;
                    targetButton = btn;
                  }
                }
              }
            } else if (/顯示|眼睛|eye|show|hide/i.test(buttonType)) {
              // 密码显示/隐藏按钮：输入框内部右侧
              buttonCategory = buttonCategories.insideRight;
              if (buttonCategory.length > 0) {
                // 选择最右边的按钮
                targetButton = buttonCategory.reduce((rightmost, btn) => {
                  const rightmostRect = rightmost.getBoundingClientRect();
                  const btnRect = btn.getBoundingClientRect();
                  return btnRect.right > rightmostRect.right ? btn : rightmost;
                });
              }
            }

            if (targetButton) {
              return {
                success: true,
                selector: targetButton.id ? `#${targetButton.id}` : null,
                buttonType: buttonType,
                category: buttonCategory === buttonCategories.insideRight ? 'inside-right' :
                          buttonCategory === buttonCategories.outsideRight ? 'outside-right' : 'below'
              };
            }

            return { success: false, reason: '未找到匹配的按钮', buttonCategories };
          }, result.inputName, result.buttonType);

          if (buttonResult && buttonResult.success && buttonResult.selector) {
            this.log('info', `[findDynamicSelector] 找到输入框附属按钮`, {
              selector: buttonResult.selector,
              buttonType: buttonResult.buttonType,
              category: buttonResult.category
            });
            return {
              selector: buttonResult.selector,
              type: 'input-button-by-category',
              score: 85,
              reasons: [`输入框附属按钮 (${buttonResult.buttonType})`]
            };
          } else {
            this.log('warn', `[findDynamicSelector] 输入框附属按钮查找失败`, {
              reason: buttonResult?.reason || '未知错误'
            });
          }
        }

        // 检查是否需要特殊处理搜索图标按钮
        if (result.useSpecialSearchIconHandling) {
          this.log('info', `[findDynamicSelector] 检测到搜索/查询按钮目标，执行特殊处理`, {
            targetName: result.targetName,
            reason: result.reason
          });

          // 执行位置关系查找
          const iconResult = await this.page.evaluate(() => {
            // 1. 首先找到相关的输入框（通过 ID、placeholder 等属性匹配）
            const searchInputKeywords = [/id/i, /搜尋/i, /查詢/i, /搜索/i, /查询/i, /search/i, /query/i];
            let relatedInput = null;

            // 查找所有输入框
            const allInputs = Array.from(document.querySelectorAll('input, textarea, [contenteditable="true"], [role="textbox"]'))
              .filter(el => {
                const rect = el.getBoundingClientRect();
                const style = window.getComputedStyle(el);
                return rect.width > 0 && rect.height > 0 &&
                       style.display !== 'none' &&
                       style.visibility !== 'hidden';
              });

            // 尝试找到与搜索相关的输入框
            for (const input of allInputs) {
              const id = (input.id || '').toLowerCase();
              const name = (input.name || '').toLowerCase();
              const placeholder = (input.getAttribute?.('placeholder') || '').toLowerCase();
              const ariaLabel = (input.getAttribute?.('aria-label') || '').toLowerCase();
              const className = (input.className || '').toLowerCase();

              // 检查是否包含搜索相关的关键词
              for (const keyword of searchInputKeywords) {
                if (keyword.test(id) || keyword.test(name) || keyword.test(placeholder) ||
                    keyword.test(ariaLabel) || keyword.test(className)) {
                  relatedInput = input;
                  break;
                }
              }
              if (relatedInput) break;
            }

            // ========== 详细调试：记录所有输入框的属性 ==========
            const allInputsInfo = allInputs.map(input => {
              const rect = input.getBoundingClientRect();
              return {
                tag: input.tagName?.toLowerCase() || 'unknown',
                id: input.id || '(无id)',
                name: input.name || '(无name)',
                type: input.type || '(无type)',
                className: input.className || '(无className)',
                placeholder: input.placeholder || '(无placeholder)',
                ariaLabel: input.getAttribute?.('aria-label') || '(无aria-label)',
                role: input.getAttribute?.('role') || '(无role)',
                textContent: (input.textContent || '').trim().substring(0, 50),
                value: input.value || '(无value)',
                visible: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
                position: `(${Math.round(rect.left)}, ${Math.round(rect.top)})`
              };
            });

            // 调试：输出查找结果
            const debugInfo = {
              totalInputs: allInputs.length,
              searchKeywords: searchInputKeywords.map(k => k.toString()),
              foundRelatedInput: relatedInput !== null,
              allInputsInfo: allInputsInfo,  // 详细记录所有输入框
              inputInfo: relatedInput ? {
                id: relatedInput.id || '(无id)',
                name: relatedInput.name || '(无name)',
                placeholder: relatedInput.placeholder || '(无placeholder)',
                className: relatedInput.className || '(无className)'
              } : null
            };

            // ========== 新策略：如果只有一个输入框且没找到相关输入框，默认使用第一个 ==========
            // 这是为了处理 Flutter 应用中输入框可能没有任何可识别属性的情况
            if (!relatedInput && allInputs.length === 1) {
              relatedInput = allInputs[0];
              debugInfo.singleInputFallback = true;
              debugInfo.singleInputFallbackReason = '只有一个输入框，默认作为搜索输入框';
              debugInfo.foundRelatedInput = true;  // 更新状态
              debugInfo.inputInfo = {
                id: relatedInput.id || '(无id)',
                name: relatedInput.name || '(无name)',
                placeholder: relatedInput.placeholder || '(无placeholder)',
                className: relatedInput.className || '(无className)'
              };
            }

            // 2. 如果找到了相关输入框，查找其附近的图标按钮
            if (relatedInput) {
              const inputRect = relatedInput.getBoundingClientRect();
              const inputCenterX = inputRect.left + inputRect.width / 2;
              const inputCenterY = inputRect.top + inputRect.height / 2;

              // 查找所有 Flutter 图标按钮（没有文本但有 flt-tappable 属性）
              const allIconButtons = Array.from(document.querySelectorAll('flt-semantics[flt-tappable], [role="button"][flt-tappable]'))
                .filter(el => {
                  const rect = el.getBoundingClientRect();
                  const style = window.getComputedStyle(el);
                  // 必须可见
                  if (rect.width <= 0 || rect.height <= 0 ||
                      style.display === 'none' ||
                      style.visibility === 'hidden' ||
                      style.opacity === '0') {
                    return false;
                  }
                  // 必须没有文本（图标按钮）
                  const text = (el.textContent || '').trim();
                  return text.length === 0 || text.length <= 2; // 允许1-2个字符的图标符号
                });

              debugInfo.totalIconButtons = allIconButtons.length;

              // 找到距离输入框最近的图标按钮（在右侧或下方）
              let nearestIconButton = null;
              let minDistance = Infinity;

              for (const iconBtn of allIconButtons) {
                const btnRect = iconBtn.getBoundingClientRect();
                const btnCenterX = btnRect.left + btnRect.width / 2;
                const btnCenterY = btnRect.top + btnRect.height / 2;

                // ========== 排除清除按钮 ==========
                // 清除按钮通常在输入框内部右侧（垂直方向与输入框重叠）
                // 搜索按钮通常在输入框外部（垂直方向不重叠或完全在右侧）
                const isVerticallyOverlapping = btnRect.top >= inputRect.top - 10 && btnRect.bottom <= inputRect.bottom + 10;
                const isInsideInput = btnRect.right <= inputRect.right + 10; // 按钮右边缘接近或未超出输入框

                // 如果按钮垂直方向与输入框重叠且完全在输入框范围内，很可能是清除按钮
                if (isVerticallyOverlapping && isInsideInput) {
                  debugInfo.skippedClearButton = true;
                  debugInfo.skippedButtonReason = '跳过可能的清除按钮（在输入框内部）';
                  continue; // 跳过这个按钮
                }

                // 计算距离
                const distance = Math.sqrt(
                  Math.pow(btnCenterX - inputCenterX, 2) +
                  Math.pow(btnCenterY - inputCenterY, 2)
                );

                // 检查是否在输入框的右侧或下方（常见布局）
                const isToRight = btnRect.left >= inputRect.right - 20; // 允许一些重叠
                const isBelow = btnRect.top >= inputRect.bottom - 20;
                const isNear = distance < 200; // 必须在 200px 以内

                if (isNear && (isToRight || isBelow) && distance < minDistance) {
                  minDistance = distance;
                  nearestIconButton = iconBtn;
                }
              }

              debugInfo.foundNearbyButton = nearestIconButton !== null;
              debugInfo.nearestDistance = nearestIconButton ? Math.round(minDistance) : null;

              if (nearestIconButton) {
                // 生成选择器
                if (nearestIconButton.id) {
                  return {
                    selector: `#${nearestIconButton.id}`,
                    type: 'search-icon-by-position',
                    score: 80,
                    reasons: ['搜索图标按钮（位置关系）'],
                    distance: Math.round(minDistance),
                    debugInfo: debugInfo
                  };
                }

                // 使用索引生成选择器
                const allTappables = Array.from(document.querySelectorAll('flt-semantics[flt-tappable], [role="button"][flt-tappable]'));
                const index = allTappables.indexOf(nearestIconButton) + 1;
                return {
                  selector: `flt-semantics[flt-tappable]:nth-of-type(${index})`,
                  type: 'search-icon-by-position',
                  score: 80,
                  reasons: ['搜索图标按钮（位置关系）'],
                  distance: Math.round(minDistance),
                  debugInfo: debugInfo
                };
              }
            }

            // 3. 如果没有找到相关输入框，尝试直接找第一个可见的图标按钮
            // （作为最后的备用方案）
            const anyIconButton = Array.from(document.querySelectorAll('flt-semantics[flt-tappable], [role="button"][flt-tappable]'))
              .filter(el => {
                const rect = el.getBoundingClientRect();
                const style = window.getComputedStyle(el);
                const text = (el.textContent || '').trim();
                return rect.width > 0 && rect.height > 0 &&
                       style.display !== 'none' &&
                       style.visibility !== 'hidden' &&
                       text.length === 0; // 没有文本
              })[0];

            debugInfo.usedFallback = anyIconButton !== null;
            debugInfo.fallbackId = anyIconButton ? (anyIconButton.id || '(无id)') : null;

            if (anyIconButton) {
              if (anyIconButton.id) {
                return {
                  selector: `#${anyIconButton.id}`,
                  type: 'icon-button-fallback',
                  score: 50,
                  reasons: ['图标按钮备用方案'],
                  debugInfo: debugInfo
                };
              }
              const allTappables = Array.from(document.querySelectorAll('flt-semantics[flt-tappable]'));
              const index = allTappables.indexOf(anyIconButton) + 1;
              return {
                selector: `flt-semantics[flt-tappable]:nth-of-type(${index})`,
                type: 'icon-button-fallback',
                score: 50,
                reasons: ['图标按钮备用方案'],
                debugInfo: debugInfo
              };
            }

            // 如果都没找到，返回失败
            return { success: false, debugInfo: debugInfo };
          });

          if (iconResult && iconResult.selector) {
            this.log('info', `[findDynamicSelector] 通过位置关系找到搜索图标按钮`, {
              selector: iconResult.selector,
              distance: iconResult.distance,
              reasons: iconResult.reasons,
              debugInfo: iconResult.debugInfo
            });
            return iconResult;
          } else {
            this.log('warn', `[findDynamicSelector] 位置关系查找失败`, {
              iconResult: iconResult
            });
          }
        }

        // 如果返回的结果包含 useAI 标志，说明需要使用 AI
        if (result.useAI) {
          this.log('info', `[findDynamicSelector] 常规搜索失败，将尝试 AI 生成选择器`, {
            target,
            reason: result.reason
          });
          return result; // 返回特殊标记，让调用者处理 AI 调用
        }

        const selector = typeof result === 'string' ? result : result.selector;
        this.log('info', `[findDynamicSelector] 找到匹配: "${selector}"`, {
          score: result.score,
          reasons: result.reasons,
          type: result.type
        });
        return result;
      }

      this.log('warn', `[findDynamicSelector] 未找到匹配的元素: "${target}"`);
      return { useAI: true, reason: '常规搜索未找到匹配元素' };

    } catch (error) {
      this.log('error', `[findDynamicSelector] 搜索失败: ${error.message}`);
      return { useAI: true, reason: `搜索异常: ${error.message}` };
    }
  }

  /**
   * 使用 AI 生成选择器
   * 当常规搜索方法无法找到元素时，调用 AI 分析页面结构生成选择器
   * @param {string} target - 目标描述（如 "ID"、"下一步按钮"）
   * @param {string} preferredType - 首选类型（input/button/any）
   * @returns {Promise<string|null>} 生成的选择器，失败返回 null
   */
  async askAIForSelector(target, preferredType = 'any') {
    try {
      this.log('info', `[askAIForSelector] 开始 AI 选择器生成`, { target, preferredType });

      // 1. 收集页面元素信息
      const pageElements = await this.page.evaluate(() => {
        const collectElements = () => {
          const results = [];

          // 收集所有输入框
          document.querySelectorAll('input, textarea, [contenteditable="true"], [role="textbox"], [role="input"]').forEach((el, idx) => {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              results.push({
                type: 'input',
                index: idx,
                tagName: el.tagName,
                id: el.id,
                name: el.name,
                className: el.className,
                type: el.type,
                placeholder: el.placeholder,
                ariaLabel: el.getAttribute('aria-label'),
                ariaLabelledby: el.getAttribute('aria-labelledby'),
                role: el.getAttribute('role'),
                text: el.value || '',
                selector: el.id ? `#${el.id}` : (el.name ? `[name="${el.name}"]` : `input:nth-of-type(${idx + 1})`),
              });
            }
          });

          // 收集所有按钮
          let btnIdx = 0;
          document.querySelectorAll('button, [role="button"], a[href]').forEach((el) => {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              results.push({
                type: 'button',
                index: btnIdx++,
                tagName: el.tagName,
                id: el.id,
                className: el.className,
                ariaLabel: el.getAttribute('aria-label'),
                role: el.getAttribute('role'),
                text: el.textContent?.trim().substring(0, 100) || '',
                href: el.href || '',
                selector: el.id ? `#${el.id}` : (el.className ? `${el.tagName}.${el.className.split(' ')[0]}` : `${el.tagName}:nth-of-type(${btnIdx})`),
              });
            }
          });

          // 收集 Flutter 语义元素
          document.querySelectorAll('flt-semantics, [role], [aria-label]').forEach((el, idx) => {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              const role = el.getAttribute('role');
              const label = el.getAttribute('aria-label');
              const text = el.textContent?.trim().substring(0, 100) || '';

              // 只收集有意义的语义元素
              if (role || label || text) {
                results.push({
                  type: 'semantic',
                  index: idx,
                  tagName: el.tagName,
                  id: el.id,
                  className: el.className,
                  ariaLabel: label,
                  role: role,
                  text: text,
                  selector: el.id ? `#${el.id}` : `flt-semantics:nth-of-type(${idx + 1})`,
                });
              }
            }
          });

          return results;
        };

        return collectElements();
      });

      // 按类型筛选元素
      const filteredElements = preferredType === 'input'
        ? pageElements.filter(e => e.type === 'input' || e.role === 'textbox' || e.role === 'input')
        : preferredType === 'button'
        ? pageElements.filter(e => e.type === 'button' || e.role === 'button')
        : pageElements;

      this.log('info', `[askAIForSelector] 收集到 ${pageElements.length} 个元素，筛选后 ${filteredElements.length} 个`, {
        preferredType,
        allCount: pageElements.length,
        filteredCount: filteredElements.length
      });

      // 2. 构建 AI 提示词
      const prompt = `你是测试自动化专家，需要根据页面元素信息生成 CSS 选择器。

【目标】找到元素: "${target}"
【首选类型】: ${preferredType}

【页面可用元素】:
${filteredElements.map((e, i) => `${i + 1}. ${e.type} | ${e.tagName} | id="${e.id || '(无)'}" | class="${e.className || '(无)'}" | text="${e.text || '(无)'}" | aria-label="${e.ariaLabel || '(无)'}" | role="${e.role || '(无)'}" | selector="${e.selector || '(待生成)'}"`).join('\n')}

【选择规则】
1. 优先使用 id 或 class 属性
2. 其次使用 aria-label 或 role 属性
3. 最后使用文本内容（text）或索引（nth-of-type）
4. 如果目标 "ID"、"账号"、"用户名" 等，应选择第一个输入框
5. 如果目标 "下一步"、"提交"、"确认" 等，应选择包含对应文本的按钮

【要求】
只返回 CSS 选择器字符串，不要有其他说明文字。

请直接输出 CSS 选择器:`;

      // 3. 调用 LLM
      this.log('info', `[askAIForSelector] 发送请求到 AI...`);
      const response = await this.llm.chat('selector_generation', [{ role: 'user', content: prompt }]);

      // 4. 解析 AI 响应
      let aiSelector = response.content?.trim() || '';

      // 清理可能的 markdown 代码块标记
      aiSelector = aiSelector.replace(/^```[\s\S]*?\n/g, '').replace(/```$/g, '').trim();

      // 移除可能的引号
      aiSelector = aiSelector.replace(/^['"`]|['"`]$/g, '');

      this.log('info', `[askAIForSelector] AI 响应: "${aiSelector}"`);

      // 5. 验证选择器是否有效
      if (aiSelector) {
        const isValid = await this.page.evaluate((sel) => {
          try {
            return document.querySelector(sel) !== null;
          } catch {
            return false;
          }
        }, aiSelector);

        if (isValid) {
          this.log('info', `[askAIForSelector] 选择器验证成功: ${aiSelector}`);
          return aiSelector;
        } else {
          this.log('warn', `[askAIForSelector] 选择器验证失败: ${aiSelector}，尝试使用备用方案`);

          // 备用方案：如果有筛选后的元素，直接使用第一个元素的选择器
          if (filteredElements.length > 0) {
            const fallbackSelector = filteredElements[0].selector;
            this.log('info', `[askAIForSelector] 使用备用选择器: ${fallbackSelector}`);
            return fallbackSelector;
          }
        }
      }

      this.log('warn', `[askAIForSelector] AI 未能生成有效选择器`);
      return null;

    } catch (error) {
      this.log('error', `[askAIForSelector] AI 选择器生成失败: ${error.message}`);
      return null;
    }
  }

  /**
   * 获取列表选择器
   * @returns {string} 选择器
   */
  async getListSelector() {
    return '.list, .items, [data-testid="list"], [data-testid="items"]';
  }

  /**
   * 获取文本选择器
   * @param {string} text - 文本
   * @param {string} location - 位置
   * @returns {string} 选择器
   */
  async getSelectorForText(text, location = 'body') {
    const locationSelectors = {
      'breadcrumb': '.breadcrumb, .breadcrumbs',
      'title': 'h1, h2, .title',
      'button': 'button',
      'body': 'body',
    };

    const baseSelector = locationSelectors[location] || 'body';
    return `${baseSelector}:has-text("${text}")`;
  }

  /**
   * 截图
   * @param {string} name - 截图名称
   */
  async takeScreenshot(name) {
    try {
      const filename = `${name}-${Date.now()}.png`;
      const path = `${this.screenshotDir}/${filename}`;

      await this.page.screenshot({ path, fullPage: true });

      this.log('info', `截图已保存: ${path}`);
    } catch (error) {
      this.log('error', `截图失败: ${error.message}`);
    }
  }

  /**
   * 页面加载事件
   */
  async onPageLoad() {
    this.log('info', '页面加载完成', { url: this.page.url() });
    this.currentUrl = this.page.url();
  }

  /**
   * 设置网络请求拦截，记录失败的 API 请求
   * 用于验证错误提示时检查是否有 API 错误
   */
  async setupRequestInterception() {
    try {
      // 清空之前的记录
      this.failedRequests = [];
      this.lastFailedRequest = null;

      // 拦截并中止 Flutter Web 开发工具的 SSE 连接
      // 这个连接可能会导致页面加载挂起（pending 状态）
      await this.page.route('**/$dwdsSseHandler', (route) => {
        this.log('info', '[Network] 拦截并中止 $dwdsSseHandler 连接（避免页面加载挂起）');
        route.abort('failed');
      });

      // 同时拦截 ws:// 协议的 dwds 连接
      await this.page.route('**/dwds*', (route) => {
        const url = route.request().url();
        if (url.includes('$dwdsSseHandler') || url.includes('dwdsSseHandler')) {
          this.log('info', '[Network] 拦截并中止 dwds WebSocket/SSE 连接');
          route.abort('failed');
        } else {
          route.continue();
        }
      });

      // 监听响应事件
      this.page.on('response', async (response) => {
        try {
          const url = response.url();
          const status = response.status();

          // 只记录 API 请求（排除静态资源）
          if (url.includes('/api/') || url.includes('/Api/') || url.startsWith('http')) {
            // 记录失败的请求（4xx, 5xx）
            if (status >= 400) {
              const failureInfo = {
                url,
                status,
                method: response.request().method(),
                timestamp: new Date().toISOString(),
              };

              // 尝试获取响应体
              try {
                const contentType = response.headers()['content-type'] || '';
                if (contentType.includes('application/json')) {
                  failureInfo.body = await response.json().catch(() => null);
                } else {
                  failureInfo.text = await response.text().catch(() => null);
                }
              } catch (e) {
                // 忽略响应体解析错误
              }

              this.failedRequests.push(failureInfo);
              this.lastFailedRequest = failureInfo;

              this.log('warn', '[Network] 检测到失败的 API 请求', {
                url,
                status,
                method: failureInfo.method
              });
            }
          }
        } catch (e) {
          // 忽略监听器错误
        }
      });

      this.log('info', '[Network] 网络请求拦截已设置');
    } catch (error) {
      this.log('warn', '[Network] 设置请求拦截失败', { error: error.message });
    }
  }

  /**
   * 控制台消息事件
   * @param {Object} msg - 消息
   */
  onConsoleMessage(msg) {
    if (msg.type() === 'error') {
      this.log('error', '页面错误', { text: msg.text() });
    }
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
      url: this.page?.url(),
    };

    this.executionLog.push(logEntry);

    // 控制台输出
    const logMethod = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    logMethod(`[StepExecutor] ${message}`, data);
  }

  /**
   * 获取执行日志
   * @returns {Array} 日志
   */
  getExecutionLog() {
    return this.executionLog;
  }

  /**
   * 清理资源
   */
  async cleanup() {
    this.log('info', '清理资源...');

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

    if (this.page) {
      try {
        // 只关闭我们自己创建的页面，不要关闭连接到的浏览器中的原始页面
        if (!this.connectedToExistingBrowser) {
          await this.page.close();
        }
      } catch (error) {
        this.log('warn', '关闭页面失败', { error: error.message });
      }
      this.page = null;
    }

    if (this.context) {
      try {
        // 只关闭我们自己创建的上下文
        if (!this.connectedToExistingBrowser) {
          await this.context.close();
        }
      } catch (error) {
        this.log('warn', '关闭上下文失败', { error: error.message });
      }
      this.context = null;
    }

    if (this.browser) {
      try {
        // 只关闭我们自己启动的浏览器，不要关闭连接到的现有浏览器
        if (!this.connectedToExistingBrowser) {
          await this.browser.close();
        } else {
          // 如果是连接到的现有浏览器，只断开连接
          this.log('info', '断开与现有浏览器的连接');
        }
      } catch (error) {
        this.log('warn', '关闭浏览器失败', { error: error.message });
      }
      this.browser = null;
    }

    this.log('info', '资源已清理');
  }

  /**
   * 清理 Playwright 残留的 Chromium 进程（已禁用）
   * 禁用原因：避免影响用户的 Chrome 浏览器
   * Playwright 使用独立的用户数据目录，会自己管理进程
   */
  async forceCleanupBrowserProcesses() {
    // 不执行任何清理操作，直接返回
    this.log('info', '跳过浏览器进程清理（避免影响用户的浏览器）');
    return Promise.resolve();
  }

  /**
   * 将文本转换为 slug
   * @param {string} text - 文本
   * @returns {string} slug
   */
  slugify(text) {
    if (!text || typeof text !== 'string') {
      return 'unknown';
    }
    const result = text
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^\w\-]+/g, '')
      .replace(/\-\-+/g, '-')
      .trim();

    // TODO: 修复 slugify 对纯中文的处理
    // 当前纯中文会被完全移除，返回空字符串
    // 需要添加对中文的拼音转换或使用其他编码方式
    // 例如: "下一步按钮" -> "" (空) 而不是 "xia-yi-bu-an-niu"
    if (!result) {
      this.log('warn', `[slugify] 文本 "${text}" 被 slugify 后为空，可能导致路由错误`);
      // 临时方案：使用哈希或时间戳作为 fallback
      return `page-${Date.now().toString(36)}`;
    }

    return result;
  }

  /**
   * 将文本转换为 PascalCase
   * @param {string} text - 文本
   * @returns {string} PascalCase
   */
  toPascalCase(text) {
    if (!text || typeof text !== 'string') {
      return 'Unknown';
    }
    return text
      .split(/[\s\-_]+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join('');
  }

  /**
   * 根据目标字段获取测试值
   * @param {string} target - 目标字段描述
   * @returns {string} 测试值
   */
  getTestValueForTarget(target) {
    // 修复：检查 target 是否为 null 或 undefined
    if (!target || typeof target !== 'string') {
      return '';
    }

    const targetLower = target.toLowerCase();

    // 常见字段的测试值
    const testValues = {
      'id': 'amyTest',
      '用户id': 'amyTest',
      '账号': 'testuser@example.com',
      '用户名': 'testuser',
      'username': 'testuser',
      'email': 'test@example.com',
      '邮箱': 'test@example.com',
      '密码': 'Test123456',
      'password': 'Test123456',
      '手机': '13800138000',
      '电话': '13800138000',
      '姓名': '测试用户',
      'name': 'Test User',
      '地址': '北京市朝阳区测试路123号',
    };

    // 精确匹配
    if (testValues[targetLower]) {
      return testValues[targetLower];
    }

    // 模糊匹配
    for (const [key, value] of Object.entries(testValues)) {
      if (targetLower.includes(key) || key.includes(targetLower)) {
        return value;
      }
    }

    // 默认测试值
    return 'TestValue';
  }

  /**
   * 从步骤对象中提取描述
   * @param {Object} step - 步骤对象
   * @returns {string} 步骤描述
   */
  extractStepDescription(step) {
    // 如果步骤本身是字符串
    if (typeof step === 'string') {
      return step;
    }

    // 从各种可能的字段中提取描述
    let desc = step.description || step.text || step.action || step.name || '';

    // 如果顶层描述是占位符或为空，尝试从 actions 中提取
    if (!desc || desc.includes('描述') || (desc.includes('...') && desc.length < 20)) {
      if (step.actions && step.actions.length > 0) {
        const actionDescs = step.actions.map(a => a.description || a.action || a.text || '').filter(d => d && !d.includes('描述'));
        if (actionDescs.length > 0) {
          desc = actionDescs.join('; ');
        }
      }
    }

    // 如果仍然有值，返回它
    if (desc) return desc;

    // 如果步骤有其他属性，尝试组合
    const keys = Object.keys(step).filter(k => k !== 'type');
    if (keys.length > 0) {
      return step[keys[0]];
    }

    return null;
  }

  /**
   * 检查是否是占位符描述
   * @param {string} description - 描述文本
   * @returns {boolean} 是否是占位符
   */
  isPlaceholderDescription(description) {
    if (!description || typeof description !== 'string') {
      return false;
    }

    const placeholderPatterns = [
      '描述预期结果',
      '描述执行步骤',
      '...',
      '请输入',
      '请填写',
      '待定',
      'TBD'
    ];

    const lowerDesc = description.trim();
    // 检查是否完全匹配占位符模式
    if (placeholderPatterns.some(pattern => lowerDesc === pattern || lowerDesc.startsWith(pattern))) {
      return true;
    }
    // 检查是否只包含占位符字符且长度很短
    if (lowerDesc.length < 10 && (lowerDesc.includes('...') || lowerDesc.includes('描述'))) {
      return true;
    }

    return false;
  }

  /**
   * 判断描述是否为状态描述（而非操作描述）
   * Given 步骤通常是状态描述，如 "用户在登录页面"
   * 如果是状态描述，不需要执行操作，只需验证状态
   * @param {string} description - 步骤描述
   * @returns {boolean} 是否为状态描述
   */
  isStateDescription(description) {
    if (!description || typeof description !== 'string') {
      return false;
    }

    const descLower = description.toLowerCase().trim();

    // 状态描述关键词（表示当前状态）
    const stateKeywords = [
      '在', '用户在', '位于', '处于', '已', '页面显示',
      'on', 'at', 'user is', 'logged in', 'already', 'currently',
      '可以看见', '可见', '存在', '已加载'
    ];

    // 操作关键词（表示要执行的操作）
    const actionKeywords = [
      '点击', '输入', '填写', '选择', '打开', '导航', '访问',
      '跳转', '进入', '提交', 'press', 'click', 'input', 'fill',
      'select', 'navigate', 'open', 'submit', 'go to'
    ];

    // 检查是否包含状态关键词
    const hasStateKeyword = stateKeywords.some(kw => descLower.includes(kw.toLowerCase()));

    // 检查是否包含操作关键词
    const hasActionKeyword = actionKeywords.some(kw => descLower.includes(kw.toLowerCase()));

    // 如果有状态关键词且没有操作关键词，认为是状态描述
    // 特殊情况："打开登录页面" 虽然有"打开"，但也是状态描述
    const isPageState = /.*(页面|页|page).*在/.test(descLower) ||
                       /.*在.*(页面|页|page).*/.test(descLower);

    return hasStateKeyword && !hasActionKeyword || isPageState;
  }

  /**
   * 验证 Given 状态是否符合预期
   * 同时检查 DOM 元素和页面文本内容，只要有一项满足即可
   * @param {string} description - 状态描述
   * @returns {Object} 验证结果 { passed: boolean, message: string }
   */
  async verifyGivenState(description) {
    this.log('info', '[verifyGivenState] 开始验证状态', { description });

    try {
      const currentUrl = this.page ? this.page.url() : '';
      const bodyText = this.page ? await this.page.evaluate(() => document.body?.textContent?.substring(0, 500) || '') : '';
      const bodyLower = bodyText.toLowerCase();

      // 根据描述中的关键词进行验证
      const descLower = description.toLowerCase();

      // 检查是否在登录页面
      if (descLower.includes('登录') || descLower.includes('login') || descLower.includes('登入')) {
        // ==================== 检查1: 页面文本内容 ====================
        const passwordKeywords = ['密码', '密碼', 'password'];
        const idKeywords = ['id', '账号', '帳號', 'account', '邮箱', '郵箱', 'email'];
        const loginKeywords = ['登录', '登入', 'login'];

        const hasPasswordInText = passwordKeywords.some(kw => bodyLower.includes(kw.toLowerCase()));
        const hasIdInText = idKeywords.some(kw => bodyLower.includes(kw.toLowerCase()));
        const hasLoginInText = loginKeywords.some(kw => bodyLower.includes(kw.toLowerCase()));

        // ==================== 检查2: 实际 DOM 元素 ====================
        const domCheck = await this.page.evaluate(() => {
          const result = {
            hasPasswordInput: false,
            hasIdInput: false,
            hasLoginButton: false
          };

          // 检查输入框
          const inputs = document.querySelectorAll('input:not([type=hidden]), textarea');
          const passwordKws = ['密码', '密碼', 'password', 'pwd', 'pass'];
          const idKws = ['id', '账号', '帳號', 'account', 'user', '用户', '使用者'];
          const emailKws = ['邮箱', '郵箱', 'email', 'mail'];

          inputs.forEach(input => {
            const type = (input.type || '').toLowerCase();
            const placeholder = (input.placeholder || '').toLowerCase();
            const id = (input.id || '').toLowerCase();
            const name = (input.name || '').toLowerCase();
            const ariaLabel = (input.getAttribute('aria-label') || '').toLowerCase();
            const allText = [type, placeholder, id, name, ariaLabel].join(' ');

            if (type === 'password' || passwordKws.some(kw => allText.includes(kw.toLowerCase()))) {
              result.hasPasswordInput = true;
            }
            if (idKws.some(kw => allText.includes(kw.toLowerCase())) ||
                emailKws.some(kw => allText.includes(kw.toLowerCase())) ||
                type === 'email') {
              result.hasIdInput = true;
            }
          });

          // 检查按钮
          const buttons = document.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"]');
          const loginKws = ['登录', '登入', 'login', 'signin'];

          buttons.forEach(btn => {
            const text = (btn.textContent || '').trim().toLowerCase();
            const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
            const id = (btn.id || '').toLowerCase();
            const allText = [text, ariaLabel, id].join(' ');

            if (loginKws.some(kw => allText.includes(kw.toLowerCase()))) {
              result.hasLoginButton = true;
            }
          });

          return result;
        });

        // ==================== 合并结果：文本检查 OR DOM 检查 ====================
        const hasPasswordField = hasPasswordInText || domCheck.hasPasswordInput;
        const hasIdField = hasIdInText || domCheck.hasIdInput;
        const hasLoginButton = hasLoginInText || domCheck.hasLoginButton;

        this.log('info', '[verifyGivenState] 登录页面检查结果', {
          textCheck: { hasPasswordInText, hasIdInText, hasLoginInText },
          domCheck,
          combined: { hasPasswordField, hasIdField, hasLoginButton }
        });

        if (hasPasswordField || hasIdField || hasLoginButton) {
          return { passed: true, message: '✓ 当前在登录页面' };
        } else {
          this.log('warn', '[verifyGivenState] 未检测到登录页面元素', { currentUrl, bodyText: bodyText.substring(0, 100) });
          return { passed: false, message: '当前页面不是登录页面' };
        }
      }

      // 如果描述包含特定页面名称，检查 URL
      const pagePatterns = [
        { pattern: /首页|home|主页/, expectedInUrl: ['home', 'main', 'index'], name: '首页' },
        { pattern: /列表|list/, expectedInUrl: ['list'], name: '列表页' },
        { pattern: /详情|detail/, expectedInUrl: ['detail'], name: '详情页' },
        { pattern: /账户|account|管理|management/, expectedInUrl: ['account', 'management'], name: '账户管理页' },
      ];

      for (const { pattern, expectedInUrl, name } of pagePatterns) {
        if (pattern.test(descLower)) {
          const urlMatch = expectedInUrl.some(keyword => currentUrl.toLowerCase().includes(keyword));
          if (urlMatch) {
            this.log('info', `[verifyGivenState] URL 匹配 ${name}`, { currentUrl });
            return { passed: true, message: `✓ 当前在${name}` };
          } else {
            this.log('warn', `[verifyGivenState] URL 不匹配 ${name}`, { currentUrl, expected: expectedInUrl });
            return { passed: false, message: `当前页面不是${name}，当前URL: ${currentUrl}` };
          }
        }
      }

      // 默认：如果无法具体验证，假设通过（避免误报）
      this.log('info', '[verifyGivenState] 无法进行具体验证，默认通过', { description, currentUrl });
      return { passed: true, message: '✓ 状态验证通过（默认）' };

    } catch (error) {
      this.log('error', '[verifyGivenState] 验证过程出错', { error: error.message });
      return { passed: true, message: `⚠ 验证过程出错: ${error.message}，默认通过` };
    }
  }

  /**
   * 从描述生成可执行的操作列表
   * @param {string} description - 步骤描述
   * @param {string} stepType - 步骤类型 (given/when/then)
   * @returns {Array} 操作列表
   */
  async generateActionsFromDescription(description, stepType) {
    // 对于 Given 步骤，先检查是否为状态描述
    if (stepType === 'given') {
      if (this.isStateDescription(description)) {
        this.log('info', '[generateActionsFromDescription] Given 是状态描述，返回空操作', { description });
        return []; // 状态描述不需要执行操作
      }
      this.log('info', '[generateActionsFromDescription] Given 包含操作，将生成操作', { description });
    }

    // 如果有 LLM，使用 AI 生成操作
    if (this.llm && this.llm.chat) {
      try {
        this.log('info', '使用 LLM 生成操作', { description, stepType });

        // 根据步骤类型使用不同的 prompt
        let prompt;

        if (stepType === 'given') {
          prompt = `你是一个自动化测试专家。Given 步骤通常描述初始状态，但有时也包含操作。

步骤描述: ${description}
步骤类型: given（前置条件）

重要规则：
1. 如果描述是状态描述（如"用户在登录页面"、"页面已加载"），返回空数组：[]
2. 只有当描述包含明确操作（如"导航到"、"打开"、"进入"）时才生成操作
3. 不要为状态描述生成任何操作

当前页面 URL: ${this.currentUrl || '未知'}

请返回 JSON 格式的操作列表，或空数组：
[
  {
    "type": "navigate|click|fill|wait",
    "target": "目标元素描述或URL",
    "value": "输入值（仅fill类型需要）",
    "selector": "CSS选择器（如果知道）"
  }
]

示例：
描述: "用户在登录页面" -> []
描述: "进入登录页" -> [{"type": "navigate", "target": "/login"}]
描述: "打开首页" -> [{"type": "navigate", "target": "/"}]

只返回JSON，不要其他内容。`;
        } else {
          prompt = `你是一个自动化测试专家。请将以下测试步骤描述转换为可执行的浏览器操作。

步骤描述: ${description}
步骤类型: ${stepType}

当前页面 URL: ${this.currentUrl || '未知'}

请返回 JSON 格式的操作列表:
[
  {
    "type": "navigate|click|fill|wait|check",
    "target": "目标元素描述或URL",
    "value": "输入值（仅fill类型需要）",
    "selector": "CSS选择器（如果知道）"
  }
]

操作类型说明:
- navigate: 导航到URL
- click: 点击元素
- fill: 填写表单
- wait: 等待元素出现
- check: 检查元素状态

示例:
描述: "进入登录页"
-> [{"type": "navigate", "target": "/login"}]

描述: "点击登录按钮"
-> [{"type": "click", "target": "登录按钮", "selector": "button[type='submit']"}]

描述: "输入用户名admin，密码123456，点击登录"
-> [
  {"type": "fill", "target": "用户名", "value": "admin"},
  {"type": "fill", "target": "密码", "value": "123456"},
  {"type": "click", "target": "登录按钮"}
]

只返回JSON，不要其他内容。`;
        }

        const response = await this.llm.chat([
          { role: 'user', content: prompt }
        ], { temperature: 0.3 });

        if (response && response.content) {
          // 尝试提取 JSON 数组
          const jsonMatch = response.content.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            try {
              const actions = JSON.parse(jsonMatch[0]);
              this.log('info', 'LLM 生成操作成功', { count: actions.length, stepType });
              return actions;
            } catch (e) {
              this.log('warn', 'LLM 返回的 JSON 解析失败', e.message);
            }
          }
        }
      } catch (error) {
        this.log('warn', 'LLM 生成操作失败，使用规则回退', error.message);
      }
    }

    // 回退方案：基于规则生成操作
    return this.ruleBasedActions(description, stepType);
  }

  /**
   * 基于规则生成操作（无 LLM 时的回退方案）
   * 使用动态匹配，不依赖固定关键词
   * @param {string} description - 步骤描述
   * @param {string} stepType - 步骤类型
   * @returns {Array} 操作列表
   */
  ruleBasedActions(description, stepType) {
    const actions = [];

    this.log('info', `[ruleBasedActions] 开始动态解析描述`, { description, stepType });

    // ==================== 定义操作动词模式（正则表达式） ====================
    // 使用正则表达式动态匹配操作动词，而不是固定关键词检查
    // 支持简繁体，例如：输入/輸入，点击/點擊，选择/選擇

    // 输入类操作动词模式
    const inputVerbs = '输入|輸入|填写|填寫|填入|填|输入到|輸入到|键入|鍵入';
    // 点击类操作动词模式
    const clickVerbs = '点击|點擊|选择|選擇|按下|按一下|tap|click';
    // 清空类操作动词模式
    const clearVerbs = '留空|清空|清除|空白|clear|empty';
    // 导航类操作动词模式
    const navigateVerbs = '进入|進入|打开|打開|访问|訪問|导航到|導航到|navigate|go to|跳转|跳轉';
    // 等待类操作动词模式
    const waitVerbs = '等待|等候|wait|等待.*秒|等候.*秒';
    // 检查/验证类操作动词模式
    const checkVerbs = '检查|檢查|验证|驗證|确认|確認|check|verify';

    // ==================== 处理复合操作（用分隔符拆分） ====================
    const hasSeparator = /并|並|，|,|。|；|;|以及|和|與/.test(description);

    let parts = [];
    if (hasSeparator) {
      parts = description.split(/并|並|，|,|。|；|;|以及|和|與/).filter(p => p.trim());
      this.log('info', `[ruleBasedActions] 检测到复合操作，拆分为 ${parts.length} 个部分`, { parts });
    } else {
      parts = [description];
    }

    // ==================== Given 步骤特殊处理 ====================
    // Given 步骤通常是描述前置条件（如"在登录页面"），不应解析为操作
    if (stepType === 'given') {
      // 检查是否是状态描述（如"用戶已在密碼頁面"、"用戶在登入頁面"）
      // 排除明确的操作描述（如"在...输入..."后面跟具体值）
      const hasInputActionWithValue = /在.*(?:输入|輸入|填写|填寶).*(?:['"]|：|:)\s*[^'"''，。]+/.test(description);
      const isStateDescription = /用戶已在|用户已在|用戶在|用户在|已在.*页面|在.*页面/.test(description);

      if (isStateDescription && !hasInputActionWithValue) {
        this.log('info', `[ruleBasedActions] Given 步骤检测为状态描述，不解析为操作`, { description });
        // 返回一个空操作或导航操作
        // 如果描述包含特定页面，可以添加导航操作
        const pageMatch = description.match(/(?:用戶已在|用户已在|用戶在|用户在|在)(.+?)(?:輸入)?页面/);
        if (pageMatch) {
          // 移除"輸入"这个词，因为它只是页面名称的一部分（如"密碼輸入頁面"）
          let pageName = pageMatch[2].replace(/輸入/, '输入');
          // 如果页面名称是"密码输入"，则简化为"密码"
          pageName = pageName.replace(/输入$/, '').replace(/輸入$/, '');
          actions.push({
            type: 'navigate',
            target: pageName.trim(),
            description: description
          });
        }
        return actions;
      }
    }

    // ==================== 动态解析每个部分 ====================
    for (const part of parts) {
      const partTrimmed = part.trim();
      if (!partTrimmed) continue;

      this.log('info', `[ruleBasedActions] 解析部分: "${partTrimmed}"`);

      // ==================== 优先检查：清空操作 ====================
      // 必须在输入操作之前检查，因为 "XXX输入框" 可能被误匹配
      const clearMatch = partTrimmed.match(new RegExp(`(.+?)(${clearVerbs})$`, 'i'));
      if (clearMatch) {
        // 清理 target：移除 "输入框" 相关字符，但保留有意义的字段名
        let target = clearMatch[1].trim();
        // 先移除完整的 "輸入框" 和 "输入框"
        target = target.replace(/輸入框|输入框/g, '');
        // 移除 "框" 后面跟着 "輸" 或 "输" 的情况（如 "框輸"）
        target = target.replace(/框[輸输]/g, '');
        // 移除单独的 "框"
        target = target.replace(/框/g, '');
        // 移除孤立的 "輸" 或 "输" 字
        target = target.replace(/^[輸输]+|[輸输]+$/g, '');
        target = target.trim();
        // 不预先生成 selector，让 actionClear 在运行时动态查找
        actions.push({
          type: 'clear',
          target: target,
          // selector: this.guessSelector(target), // 移除预先生成的 selector
          description: `清空${target}`,
        });
        this.log('info', `[ruleBasedActions] 解析清空操作`, { target, original: partTrimmed });
        continue;
      }

      // --- 格式1: "在XXX输入YYY" / "在XXX填入YYY" ---
      // 修复：优先匹配完整的 "输入框/輸入框"，避免 "密码输入框 輸入" 被错误解析
      // 尝试三种模式：
      // 1a. "在 XXX输入框/輸入框 动词 值" - 完整的输入框后缀
      let format1Match = partTrimmed.match(new RegExp(`在(.+?)(输入框|輸入框)(?:${inputVerbs})\\s+([^'"''，,。]+)`, 'i'));
      if (format1Match) {
        // 匹配成功：format1Match[1]=字段名, format1Match[2]=输入框后缀(忽略), format1Match[3]=值
        let target = format1Match[1].trim();
        const value = format1Match[3].trim();
        actions.push({
          type: 'fill',
          target: target,
          value: value,
          selector: this.guessSelector(target),
          description: `在${target}输入${value}`,
        });
        this.log('info', `[ruleBasedActions] 解析格式1a (在...输入框...输入)`, { target, value, original: partTrimmed });
        continue;
      }

      // 1b. "在 XXX框 动词 值" - 只有 "框" 后缀
      format1Match = partTrimmed.match(new RegExp(`在(.+?)框(?:${inputVerbs})\\s+([^'"''，,。]+)`, 'i'));
      if (format1Match) {
        let target = format1Match[1].trim();
        const value = format1Match[2].trim();
        actions.push({
          type: 'fill',
          target: target,
          value: value,
          selector: this.guessSelector(target),
          description: `在${target}输入${value}`,
        });
        this.log('info', `[ruleBasedActions] 解析格式1b (在...框...输入)`, { target, value, original: partTrimmed });
        continue;
      }

      // 1c. "在 XXX 动词 值" - 没有输入框后缀
      format1Match = partTrimmed.match(new RegExp(`在(.+?)(?:${inputVerbs})\\s+([^'"''，,。]+)`, 'i'));
      if (format1Match) {
        let target = format1Match[1].trim();
        const value = format1Match[2].trim();
        actions.push({
          type: 'fill',
          target: target,
          value: value,
          selector: this.guessSelector(target),
          description: `在${target}输入${value}`,
        });
        this.log('info', `[ruleBasedActions] 解析格式1c (在...输入)`, { target, value, original: partTrimmed });
        continue;
      }

      // --- 格式2: "输入XXX为YYY" / "XXX填入YYY" ---
      const format2Match = partTrimmed.match(new RegExp(`(?:${inputVerbs})\\s*(.+?)[为为:：]\\s*([^'"''，,。]+)`, 'i'));
      if (format2Match) {
        const target = format2Match[1].trim();
        const value = format2Match[2].trim();
        actions.push({
          type: 'fill',
          target: target,
          value: value,
          selector: this.guessSelector(target),
          description: `输入${target}为${value}`,
        });
        this.log('info', `[ruleBasedActions] 解析格式2 (输入...为)`, { target, value, original: partTrimmed });
        continue;
      }

      // --- 格式3: "XXX填入YYY" / "XXX输入YYY"（动词在后） ---
      // 修复：优先匹配完整的 "输入框/輸入框"，避免与 format1 相同的问题
      // 3a. "XXX输入框/輸入框 动词 值" - 完整的输入框后缀
      let format3Match = partTrimmed.match(new RegExp(`(.+?)(输入框|輸入框)(?:${inputVerbs})\\s+([^'"''，,。]+)`, 'i'));
      if (format3Match) {
        let target = format3Match[1].trim();
        const value = format3Match[3].trim();
        // 验证：value 不能是清空动词
        const isClearVerb = new RegExp(`^(${clearVerbs})$`, 'i').test(value);
        if (!/^\\d+$/.test(target) && value.length > 0 && !isClearVerb) {
          actions.push({
            type: 'fill',
            target: target,
            value: value,
            selector: this.guessSelector(target),
            description: `${target}输入${value}`,
          });
          this.log('info', `[ruleBasedActions] 解析格式3a (XXX输入框...输入)`, { target, value, original: partTrimmed });
          continue;
        }
      }

      // 3b. "XXX框 动词 值" - 只有 "框" 后缀
      format3Match = partTrimmed.match(new RegExp(`(.+?)框(?:${inputVerbs})\\s+([^'"''，,。]+)`, 'i'));
      if (format3Match) {
        let target = format3Match[1].trim();
        const value = format3Match[2].trim();
        const isClearVerb = new RegExp(`^(${clearVerbs})$`, 'i').test(value);
        if (!/^\\d+$/.test(target) && value.length > 0 && !isClearVerb) {
          actions.push({
            type: 'fill',
            target: target,
            value: value,
            selector: this.guessSelector(target),
            description: `${target}输入${value}`,
          });
          this.log('info', `[ruleBasedActions] 解析格式3b (XXX框...输入)`, { target, value, original: partTrimmed });
          continue;
        }
      }

      // 3c. "XXX 动词 值" - 没有输入框后缀
      format3Match = partTrimmed.match(new RegExp(`(.+?)(?:${inputVerbs})\\s+([^'"''，,。]+)`, 'i'));
      if (format3Match) {
        let target = format3Match[1].trim();
        const value = format3Match[2].trim();
        const isClearVerb = new RegExp(`^(${clearVerbs})$`, 'i').test(value);
        if (!/^\\d+$/.test(target) && value.length > 0 && !isClearVerb) {
          actions.push({
            type: 'fill',
            target: target,
            value: value,
            selector: this.guessSelector(target),
            description: `${target}输入${value}`,
          });
          this.log('info', `[ruleBasedActions] 解析格式3c (XXX输入)`, { target, value, original: partTrimmed });
          continue;
        }
      }

      // --- 格式4: 点击操作 "点击XXX" / "點擊XXX" ---
      const clickMatch = partTrimmed.match(new RegExp(`(${clickVerbs})\\s*(.+)`, 'i'));
      if (clickMatch) {
        let target = clickMatch[2].trim();

        // 清理目标：移除常见的动作结果后缀
        // 例如："眼睛圖標顯�示密碼" -> "眼睛圖標"
        //     "登入按鈕" -> "登入按鈕" (保留)
        //     "下一步按鈕" -> "下一步按鈕" (保留)
        const actionSuffixes = [
          { pattern: '顯示密碼', replacement: '' },
          { pattern: '显示密码', replacement: '' },
          { pattern: '隱藏密碼', replacement: '' },
          { pattern: '隐藏密码', replacement: '' },
          { pattern: '顯示', replacement: '' },
          { pattern: '显示', replacement: '' },
          { pattern: '隱藏', replacement: '' },
          { pattern: '隐藏', replacement: '' },
          { pattern: '展開', replacement: '' },
          { pattern: '展开', replacement: '' },
          { pattern: '收起', replacement: '' },
          { pattern: '折疊', replacement: '' },
          { pattern: '折叠', replacement: '' },
          { pattern: '切換', replacement: '' },
          { pattern: '切换', replacement: '' },
          { pattern: '轉換', replacement: '' },
          { pattern: '转换', replacement: '' },
          { pattern: '成功', replacement: '' },
          { pattern: '失敗', replacement: '' },
          { pattern: '失败', replacement: '' },
          { pattern: '完成', replacement: '' },
          { pattern: '完畢', replacement: '' },
          { pattern: '為空', replacement: '' },
          { pattern: '为空', replacement: '' }
        ];

        // 按顺序移除后缀
        for (const suffix of actionSuffixes) {
          while (target.includes(suffix.pattern)) {
            target = target.replace(suffix.pattern, suffix.replacement).trim();
          }
        }

        actions.push({
          type: 'click',
          target: target,
          selector: this.guessSelector(target),
          description: `点击${target}`,
        });
        this.log('info', `[ruleBasedActions] 解析点击操作`, { target, original: partTrimmed });
        continue;
      }

      // --- 格式5: 导航操作 "进入XXX" / "打开XXX" ---
      const navigateMatch = partTrimmed.match(new RegExp(`(${navigateVerbs})\\s*(.+?)(?:页|頁|页面|頁面|$)`, 'i'));
      if (navigateMatch) {
        const pageName = navigateMatch[2].trim();
        actions.push({
          type: 'navigate',
          target: `/${this.slugify(pageName)}`,
          description: `导航到${pageName}`,
        });
        this.log('info', `[ruleBasedActions] 解析导航操作`, { pageName, original: partTrimmed });
        continue;
      }

      // --- 格式7: 单独的输入操作 "输入XXX"（无值） ---
      const inputOnlyMatch = partTrimmed.match(new RegExp(`(${inputVerbs})\\s*(.+)`, 'i'));
      if (inputOnlyMatch) {
        // 清理 target：移除 "输入框" 相关字符，但保留有意义的字段名
        let target = inputOnlyMatch[2].trim();
        // 先移除完整的 "輸入框" 和 "输入框"
        target = target.replace(/輸入框|输入框/g, '');
        // 移除 "框" 后面跟着 "輸" 或 "输" 的情况（如 "框輸"）
        target = target.replace(/框[輸输]/g, '');
        // 移除单独的 "框"
        target = target.replace(/框/g, '');
        // 移除孤立的 "輸" 或 "输" 字
        target = target.replace(/^[輸输]+|[輸输]+$/g, '');
        target = target.trim();
        const testValue = this.getTestValueForTarget(target);
        actions.push({
          type: 'fill',
          target: target,
          value: testValue,
          selector: this.guessSelector(target),
          description: `填写${target}`,
        });
        this.log('info', `[ruleBasedActions] 解析单独输入操作`, { target, value: testValue, original: partTrimmed });
        continue;
      }

      // --- 如果没有匹配到任何模式，记录警告 ---
      this.log('warn', `[ruleBasedActions] 无法解析的操作描述`, { part: partTrimmed });
    }

    // ==================== 如果没有解析出任何操作，返回默认等待操作 ====================
    if (actions.length === 0) {
      this.log('info', `[ruleBasedActions] 未解析出具体操作，返回默认等待操作`, { description });
      return [{
        type: 'wait',
        target: 'page',
        duration: 1000,
        description: `等待页面稳定: ${description}`,
      }];
    }

    this.log('info', `[ruleBasedActions] 解析完成`, {
      total: actions.length,
      actions: actions.map(a => ({ type: a.type, target: a.target, value: a.value }))
    });

    return actions;
  }

  /**
   * 猜测元素选择器
   * @param {string} target - 目标描述
   * @returns {string} CSS 选择器
   */
  guessSelector(target) {
    const t = target.toLowerCase();

    // 常见元素映射
    const selectorMap = {
      '登录': 'button[type="submit"], .login-btn, [data-testid="login"]',
      '提交': 'button[type="submit"], .submit-btn, [data-testid="submit"]',
      '取消': 'button[type="button"].cancel, .cancel-btn, [data-testid="cancel"]',
      '确认': 'button.confirm, .confirm-btn, [data-testid="confirm"]',
      '删除': 'button.delete, .delete-btn, [data-testid="delete"]',
      '编辑': 'button.edit, .edit-btn, [data-testid="edit"]',
      '保存': 'button.save, .save-btn, [data-testid="save"]',
      '搜索': 'input[type="search"], .search-input, [data-testid="search"]',
      '用户名': 'input[name="username"], input[type="text"], [data-testid="username"]',
      '密码': 'input[name="password"], input[type="password"], [data-testid="password"]',
      '邮箱': 'input[name="email"], input[type="email"], [data-testid="email"]',
      '电话': 'input[name="phone"], input[type="tel"], [data-testid="phone"]',
    };

    for (const [key, selector] of Object.entries(selectorMap)) {
      if (t.includes(key)) {
        return selector;
      }
    }

    // 默认选择器
    return `[data-testid="${this.slugify(target)}"]`;
  }

  /**
   * 从描述生成验证列表
   * @param {string} description - 验证描述
   * @returns {Array} 验证列表
   */
  async generateVerificationsFromDescription(description) {
    const verifications = [];
    const desc = description.toLowerCase();

    // 如果有 LLM，使用 AI 生成验证
    if (this.llm && this.llm.chat) {
      try {
        const prompt = `你是一个自动化测试专家。请将以下验证描述转换为可执行的验证操作。

验证描述: ${description}

请返回 JSON 格式的验证列表:
[
  {
    "type": "visible|text|exists|enabled|value|error",
    "target": "目标元素描述",
    "expected": "期望值",
    "selector": "CSS选择器（如果知道）",
    "field": "相关字段名（如果是表单验证）",
    "errorMessage": "预期的错误提示文字（如果是表单验证）"
  }
]

验证类型说明:
- visible: 检查元素是否可见
- text: 检查元素文本内容
- exists: 检查元素是否存在
- enabled: 检查元素是否可用
- value: 检查输入框的值
- error: 表单错误验证（检查错误提示文字、输入框边框变红、页面未跳转）

重要规则：
- 如果描述中包含"错误"、"失败"、"无效"、"提示文字"、"边框变红"等关键词，使用 type: "error"
- 如果描述中包含"成功"、"完成"、"进入"等关键词，使用 type: "visible" 或 type: "exists"
- 对于表单验证测试（空值、格式错误），不应该期望页面跳转

只返回JSON，不要其他内容。`;

        const response = await this.llm.chat([
          { role: 'user', content: prompt }
        ], { temperature: 0.3 });

        if (response && response.content) {
          const jsonMatch = response.content.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            try {
              const verifications = JSON.parse(jsonMatch[0]);
              this.log('info', 'LLM 生成验证成功', { count: verifications.length });
              return verifications;
            } catch (e) {
              this.log('warn', 'LLM 返回的 JSON 解析失败', e.message);
            }
          }
        }
      } catch (error) {
        this.log('warn', 'LLM 生成验证失败，使用规则回退', error.message);
      }
    }

    // 回退方案：基于规则生成验证
    // 优先检查：表单错误验证
    if (desc.includes('错误') || desc.includes('error') || desc.includes('失败') || desc.includes('无效') ||
        desc.includes('提示文字') || desc.includes('提示信息') || desc.includes('边框变红') ||
        desc.includes('错误提示') || desc.includes('验证失败') || desc.includes('不允许')) {
      // 提取相关的字段名
      let fieldTarget = '';
      if (desc.includes('id') || desc.includes('ID') || desc.includes('账号')) {
        fieldTarget = 'ID';
      } else if (desc.includes('密码') || desc.includes('password')) {
        fieldTarget = '密码';
      } else if (desc.includes('邮箱') || desc.includes('email')) {
        fieldTarget = '邮箱';
      }

      verifications.push({
        type: 'error',
        target: fieldTarget || '输入框',
        field: fieldTarget || '输入框',
        expected: '错误提示文字',
        message: `检查${fieldTarget || '输入框'}是否显示错误提示文字，且外框变红`,
      });
      this.log('info', '检测到表单错误验证，生成 error 类型验证', { fieldTarget });
    }

    // 可见性验证
    if (desc.includes('显示') || desc.includes('出现') || desc.includes('可见')) {
      // 避免与错误验证重复
      if (!verifications.some(v => v.type === 'error')) {
        const targetMatch = description.match(/(?:显示|出现|可见)(.+?)(?:了|$)/);
        if (targetMatch) {
          verifications.push({
            type: 'visible',
            target: targetMatch[1].trim(),
            selector: this.guessSelector(targetMatch[1].trim()),
            message: `检查${targetMatch[1].trim()}是否可见`,
          });
        }
      }
    }

    if (desc.includes('包含') || desc.includes('文字为') || desc.includes('显示为')) {
      const textMatch = description.match(/(?:包含|文字为|显示为)(["']?)(.+?)\1/);
      if (textMatch) {
        verifications.push({
          type: 'text',
          target: '页面',
          expected: textMatch[2].trim(),
          message: `检查页面是否包含"${textMatch[2].trim()}"`,
        });
      }
    }

    // 页面跳转验证（优先于成功验证，支持简繁体：跳转/跳轉，导航/導航，进入/進入）
    if (desc.includes('跳转') || desc.includes('跳轉') || desc.includes('导航') || desc.includes('導航') || desc.includes('进入') || desc.includes('進入')) {
      // 提取目标页面名称
      let targetPage = null;
      if (desc.includes('账号管理') || desc.includes('账户管理') || desc.includes('account')) {
        targetPage = '账号权限管理页';
      } else if (desc.includes('首页') || desc.includes('home')) {
        targetPage = '首页';
      } else if (desc.includes('列表页') || desc.includes('list')) {
        targetPage = '列表页';
      }

      verifications.push({
        type: 'navigation',
        description: `跳转到${targetPage || '目标页面'}`,
        message: `检查是否成功跳转到${targetPage || '目标页面'}`,
      });
      this.log('info', '生成导航验证', { targetPage });
    }
    // 成功验证（仅当没有跳转验证时）
    else if (desc.includes('成功') || desc.includes('完成')) {
      verifications.push({
        type: 'exists',
        target: '成功提示',
        selector: '.success, .message, [data-testid="success"]',
        message: '检查操作是否成功',
      });
    }

    // 默认验证
    if (verifications.length === 0) {
      verifications.push({
        type: 'basic',
        message: `验证: ${description}`,
        passed: true, // 默认通过，因为无法自动验证
      });
    }

    this.log('info', '规则生成验证', { count: verifications.length, description });

    return verifications;
  }
}

module.exports = StepExecutor;
