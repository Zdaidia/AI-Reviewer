/**
 * AI Test Agent
 *
 * 整合所有测试模块的核心 Agent
 * - BDD 测试解析器
 * - 逐步执行引擎
 * - 验证逻辑库
 * - Project Memory
 * - LLM Router
 *
 * 核心原则：
 * ✅ AI 是测试执行者，不是脚本生成器
 * ✅ 逐步执行（Step 1 → Get DOM → Decide Step 2）
 * ✅ 结合 Project Memory 理解项目
 * ✅ 每步验证结果
 * ✅ 分析失败原因
 */

const BDDTestParser = require('./bdd-test-parser');
const StepExecutor = require('./step-executor');
const Verifications = require('./verifications');
const AITestGeneratorComplete = require('./ai-test-generator-complete');
const VisualTestEngine = require('./visual-test-engine');
const TestReporter = require('./test-reporter');
const { chromium } = require('playwright');

class AITestAgent {
  constructor(options = {}) {
    // 配置（必须在最前面初始化）
    this.options = {
      headless: options.headless !== false,
      slowMo: options.slowMo || 50,
      screenshotDir: options.screenshotDir || './test-screenshots',
      designDir: options.designDir || './designs',
      ...options,
    };

    this.memory = options.memory || null; // Project Memory
    this.llm = options.llm || null;       // LLM Router
    this.astParser = options.astParser || null; // AST Parser（用于代码上下文提取）

    // 初始化子模块
    this.parser = new BDDTestParser(this.memory);
    this.generator = new AITestGeneratorComplete({
      memory: this.memory,
      llm: this.llm,
    });
    this.visualEngine = new VisualTestEngine({
      screenshotDir: this.options.screenshotDir,
      designDir: this.options.designDir,
      enableAIDetection: true,
      aiAnalyzer: this.llm,
    });
    this.executor = null;
    this.verifications = null;
    this.reporter = new TestReporter({
      outputDir: this.options.screenshotDir + '/../reports',
    });

    // 测试状态
    this.testResults = [];
    this.executionLogs = [];
  }

  /**
   * 从 Excel 执行 BDD 测试
   * @param {string} excelPath - Excel 文件路径
   * @param {Object} options - 选项
   * @returns {Object} 测试结果
   */
  async executeFromExcel(excelPath, options = {}) {
    this.log('info', `开始执行 Excel 测试: ${excelPath}`);

    try {
      // 1. 解析 Excel
      const parseResult = this.parser.parseFromExcel(excelPath);

      if (!parseResult.success) {
        throw new Error(`Excel 解析失败: ${parseResult.error || 'Unknown error'}`);
      }

      this.log('info', `Excel 解析成功`, {
        modules: parseResult.modules.length,
        totalScenarios: parseResult.totalScenarios,
      });

      // 2. 生成执行计划
      const executionPlan = this.parser.generateExecutionPlan(parseResult);

      this.log('info', `执行计划生成`, {
        totalSteps: executionPlan.totalSteps,
        estimatedTime: executionPlan.estimatedTime,
      });

      // 3. 执行测试
      const testResult = await this.executeTestPlan(executionPlan, options);

      return {
        success: true,
        parseResult,
        executionPlan,
        testResult,
      };
    } catch (error) {
      this.log('error', `Excel 测试执行失败`, { error: error.message });

      return {
        success: false,
        error: error.message,
        stack: error.stack,
      };
    }
  }

  /**
   * 执行测试计划
   * @param {Object} executionPlan - 执行计划
   * @param {Object} options - 选项
   * @param {Function} logCallback - 日志回调函数
   * @returns {Object} 测试结果
   */
  async executeTestPlan(executionPlan, options = {}, logCallback = null) {
    const log = (type, message, data = {}) => {
      if (logCallback) {
        logCallback(type, message, data);
      } else {
        this.log('info', `${type}: ${message}`, data);
      }
    };

    // 验证执行计划
    if (!executionPlan.modules || executionPlan.modules.length === 0) {
      log('错误', '执行计划为空，没有可执行的测试');
      return {
        success: false,
        error: '执行计划为空，没有可执行的测试。请检查需求描述是否足够详细。',
        modules: [],
        totalScenarios: 0,
      };
    }

    // 统计测试用例总数
    const totalScenarios = executionPlan.modules.reduce((sum, m) => sum + (m.scenarios?.length || 0), 0);
    log('执行计划', `共 ${executionPlan.modules.length} 个模块，${totalScenarios} 个测试用例`);

    // 初始化执行器，传入项目 URL
    await this.initExecutor(options);

    // 等待页面真正加载完成（有可交互元素）
    log('等待', '等待页面完全加载...');
    const pageReady = await this.waitForPageReady(options, log);
    if (!pageReady) {
      log('警告', '页面可能未完全加载，但将继续执行测试');
    }

    const results = {
      startTime: new Date().toISOString(),
      modules: [],
      totalScenarios: 0,
      passedScenarios: 0,
      failedScenarios: 0,
      skippedScenarios: 0,
    };

    try {
      // 执行每个模块
      for (const modulePlan of executionPlan.modules) {
        const scenarioCount = modulePlan.scenarios?.length || 0;
        if (scenarioCount === 0) continue;

        log('模块', `【${modulePlan.module}】开始执行 ${scenarioCount} 个测试用例`);

        const moduleResult = await this.executeModule(modulePlan, options, log);
        results.modules.push(moduleResult);

        results.totalScenarios += moduleResult.totalScenarios;
        results.passedScenarios += moduleResult.passedScenarios;
        results.failedScenarios += moduleResult.failedScenarios;
        results.skippedScenarios += moduleResult.skippedScenarios;
      }

      results.endTime = new Date().toISOString();
      results.duration = this.calculateDuration(results.startTime, results.endTime);
      results.success = results.failedScenarios === 0;

      return results;
    } catch (error) {
      log('错误', `测试执行异常: ${error.message}`);
      return {
        ...results,
        success: false,
        error: error.message,
      };
    } finally {
      // 清理资源 (如果开启了 keepOpen 且有失败，则不清理以便人工排查)
      const hasFailure = results.failedScenarios > 0;
      if (options.keepOpen === true || (options.keepOpen === 'on-failure' && hasFailure)) {
        log('提醒', '检测到 keepOpen 配置，保留浏览器窗口供人工排查');
      } else {
        await this.cleanup();
      }
    }
  }

  /**
   * 执行单个模块
   * @param {Object} modulePlan - 模块计划
   * @param {Object} options - 选项
   * @param {Function} logCallback - 日志回调函数
   * @returns {Object} 模块结果
   */
  async executeModule(modulePlan, options = {}, logCallback = null) {
    const log = (type, message, data = {}) => {
      if (logCallback) {
        logCallback(type, message, data);
      } else {
        this.log('info', `${type}: ${message}`, data);
      }
    };

    const results = {
      module: modulePlan.module,
      priority: modulePlan.priority,
      scenarios: [],
      totalScenarios: modulePlan.scenarios?.length || 0,
      passedScenarios: 0,
      failedScenarios: 0,
      skippedScenarios: 0,
    };

    if (!modulePlan.scenarios || modulePlan.scenarios.length === 0) {
      return results;
    }

    for (let i = 0; i < modulePlan.scenarios.length; i++) {
      const scenarioPlan = modulePlan.scenarios[i];
      const scenarioIndex = i + 1;
      log('用例', `第 ${scenarioIndex}/${modulePlan.scenarios.length} 条：${scenarioPlan.name}`);

      const scenarioResult = await this.executeScenario(scenarioPlan, options, log);
      results.scenarios.push(scenarioResult);

      if (scenarioResult.status === 'passed') {
        results.passedScenarios++;
        log('通过', `✓ ${scenarioPlan.name}`);
      } else if (scenarioResult.status === 'failed') {
        results.failedScenarios++;
        log('失败', `✗ ${scenarioPlan.name}: ${scenarioResult.errors?.[0]?.error || '未知错误'}`);
      } else {
        results.skippedScenarios++;
        log('跳过', `- ${scenarioPlan.name}`);
      }

      // 每个测试用例执行完后刷新页面，为下一个测试用例准备干净的环境
      // 注意：根据用户需求，保留执行状态和数据，不再自动重置页面
      // 如需重置页面，请在测试用例中明确指定
      /*
      if (i < modulePlan.scenarios.length - 1 && this.executor && this.executor.page) {
        try {
          log('重置', '刷新页面，为下一个测试用例准备环境...');

          // 重置 Flutter 语义层初始化状态
          this.executor.flutterSemanticsInitialized = false;

          // 导航到登录页面而不是刷新，确保从干净状态开始
          const loginUrl = this.executor.projectUrl.replace(/#.*$/, '') + '/#/login';
          log('重置', `导航到登录页面: ${loginUrl}`);
          await this.executor.page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

          // 等待页面重新加载
          log('重置', '等待页面重新加载...');
          await this.executor.page.waitForTimeout(10000);

          log('重置', '页面已重置到登录页面，下个用例执行前会自动激活语义层');
        } catch (error) {
          log('警告', `重置页面失败: ${error.message}`);
        }
      }
      */
    }

    return results;
  }

  /**
   * 执行单个场景
   * @param {Object} scenarioPlan - 场景计划
   * @param {Object} options - 选项
   * @param {Function} logCallback - 日志回调函数
   * @returns {Object} 场景结果
   */
  async executeScenario(scenarioPlan, options = {}, logCallback = null) {
    const log = (type, message, data = {}) => {
      if (logCallback) {
        logCallback(type, message, data);
      } else {
        this.log('info', `${type}: ${message}`, data);
      }
    };

    const startTime = Date.now();
    const result = {
      id: scenarioPlan.id,
      name: scenarioPlan.name,
      status: 'running',
      steps: [],
      errors: [],
      warnings: [],
    };

    try {
      // 在执行测试用例之前，确保页面已就绪
      if (this.executor && this.executor.page) {
        try {
          // 检查页面是否已加载
          const currentUrl = this.executor.page.url();
          log('页面状态', `当前页面: ${currentUrl}`);

          // 如果页面是空白页或 about:blank，等待导航完成
          if (currentUrl === 'about:blank' || currentUrl === 'data:text/html,') {
            log('等待', '等待页面导航到应用...');
            await this.executor.page.waitForTimeout(2000);
          }

          // 确保 Flutter 语义层已激活（每个测试用例执行前都检查）
          await this.executor.ensureFlutterSemanticsEnabled();
        } catch (error) {
          log('警告', `检查页面状态失败: ${error.message}`);
        }
      }

      // 标准化场景数据结构 - 将 given/when/then 转换为 steps 数组
      let stepsToExecute = scenarioPlan.steps;

      if (!stepsToExecute || stepsToExecute.length === 0) {
        // 如果没有 steps 数组，尝试从 given/when/then 构建
        stepsToExecute = [];

        // 添加 given 步骤（前置条件）
        if (scenarioPlan.given) {
          stepsToExecute.push({
            type: 'given',
            description: scenarioPlan.given,
            action: scenarioPlan.given
          });
        }

        // 添加 when 步骤（执行操作）
        if (scenarioPlan.when) {
          // 检查是否有 when_steps 数组
          if (scenarioPlan.when_steps && Array.isArray(scenarioPlan.when_steps) && scenarioPlan.when_steps.length > 0) {
            // 使用 when_steps 数组
            scenarioPlan.when_steps.forEach((whenStep, idx) => {
              stepsToExecute.push({
                type: 'when',
                description: whenStep.description || whenStep.action || whenStep,
                action: whenStep.action || whenStep.description || whenStep,
                target: whenStep.target,
                value: whenStep.value
              });
            });
          } else {
            // 单个 when 步骤
            stepsToExecute.push({
              type: 'when',
              description: scenarioPlan.when,
              action: scenarioPlan.when
            });
          }
        }

        // 添加 then 步骤（预期结果）
        if (scenarioPlan.then) {
          stepsToExecute.push({
            type: 'then',
            description: scenarioPlan.then,
            action: scenarioPlan.then
          });
        }
      }

      // 如果仍然没有步骤可执行，跳过此场景
      if (!stepsToExecute || stepsToExecute.length === 0) {
        log('警告', `场景 ${scenarioPlan.name} 没有可执行的步骤`);
        result.status = 'skipped';
        result.duration = Date.now() - startTime;
        return result;
      }

      log('步骤信息', `场景包含 ${stepsToExecute.length} 个步骤`);

      // 规范化步骤数据 - 确保 verifications 数组中的对象都有 type 字段
      stepsToExecute = this.normalizeStepsData(stepsToExecute);

      // 执行每个步骤
      for (const step of stepsToExecute) {
        // 输出步骤执行信息
        const stepName = {
          given: '前置条件',
          when: '执行操作',
          then: '验证结果'
        }[step.type] || step.type;

        // 优先使用 actions 中的内容，因为用户可能编辑了 actions 但没有更新顶层 description
        let stepDesc = step.description || step.action || '';
        // 如果顶层描述是占位符或为空，尝试从 actions 中提取
        if (!stepDesc || stepDesc.includes('描述') || stepDesc.includes('...')) {
          if (step.actions && step.actions.length > 0) {
            const actionDescs = step.actions.map(a => a.description || a.action || '').filter(d => d && !d.includes('描述'));
            if (actionDescs.length > 0) {
              stepDesc = actionDescs.join('; ');
            }
          }
        }
        // 如果仍然是空的，使用原来的默认值
        if (!stepDesc) {
          stepDesc = step.description || step.action || (Array.isArray(step.actions) ? step.actions.join(', ') : '');
        }
        log('步骤', `  ${stepName}: ${stepDesc}`);

        const stepResult = await this.executor.executeStep(step);
        result.steps.push(stepResult);

        if (!stepResult.success) {
          result.status = 'failed';
          result.errors.push({
            step: step.type,
            error: stepResult.error || 'Step failed',
          });

          // 失败后是否继续
          if (options.stopOnFailure !== false) {
            break;
          }
        }
      }

      // 检查验证结果
      const thenStep = result.steps.find(s => s.type === 'then');
      if (thenStep && thenStep.verifications) {
        const failedVerifications = thenStep.verifications.filter(v => !v.passed);

        if (failedVerifications.length > 0) {
          result.status = 'failed';
          result.errors.push(...failedVerifications.map(v => ({
            type: 'verification',
            error: v.message,
          })));
        }
      }

      // 如果没有错误，标记为通过
      if (result.status === 'running') {
        result.status = 'passed';
      }

      result.duration = Date.now() - startTime;

      return result;
    } catch (error) {
      result.status = 'failed';
      result.errors.push({
        error: error.message,
        stack: error.stack,
      });
      result.duration = Date.now() - startTime;

      log('步骤错误', `  异常: ${error.message}`);

      return result;
    }
  }

  /**
   * AI 生成测试用例（完整版）
   * @param {string} requirement - 需求描述
   * @param {Object} options - 选项
   * @returns {Object} 生成的测试用例
   */
  async generateTests(requirement, options = {}) {
    this.log('info', 'AI 生成测试用例', { requirement });

    if (!this.llm) {
      throw new Error('LLM not configured. Cannot generate tests.');
    }

    try {
      // 使用完整的 AI 测试生成器
      const result = await this.generator.generate(
        {
          sourceType: options.sourceType || 'requirement',
          content: requirement,
        },
        {
          includeFunctional: options.includeFunctional !== false,
          includeUI: options.includeUI !== false,
          includeBoundary: options.includeBoundary !== false,
          includeException: options.includeException !== false,
          ...options,
        }
      );

      if (!result.success) {
        throw new Error(result.error);
      }

      this.log('info', '测试用例生成成功', {
        total: result.testCases.summary.total,
        functional: result.testCases.summary.functional,
        ui: result.testCases.summary.ui,
        boundary: result.testCases.summary.boundary,
        exception: result.testCases.summary.exception,
      });

      return {
        success: true,
        requirement,
        generatedTests: result.testCases.bddFormat,
        analysis: result.analysis,
        pages: result.pages,
        flows: result.flows,
        testCases: result.testCases,
      };
    } catch (error) {
      this.log('error', '测试用例生成失败', { error: error.message });

      return {
        success: false,
        error: error.message,
        requirement,
      };
    }
  }

  /**
   * 分析多种输入资源并生成测试计划
   * @param {Object} input - 输入资源
   * @param {string} input.requirements - 需求描述
   * @param {string} input.figmaUrl - Figma 设计稿链接
   * @param {Array<string>} input.uiScreenshots - UI 截图路径列表
   * @param {Array<string>} input.apiDocs - API 文档路径列表
   * @param {string} input.projectUrl - 项目 URL
   * @param {Function} logCallback - 日志回调函数
   * @returns {Object} 分析结果和测试计划
   */
  async analyzeAndGenerateTestPlan(input, logCallback = null) {
    const log = (type, message, data = {}) => {
      if (logCallback) {
        logCallback(type, message, data);
      } else {
        this.log('info', `${type}: ${message}`, data);
      }
    };

    if (!this.llm) {
      throw new Error('LLM not configured. Cannot analyze and generate tests.');
    }

    try {
      // 调试：记录输入参数
      log('调试', `输入参数: requirements="${input.requirements || '(空)'}" (长度: ${(input.requirements || '').length})`);
      log('调试', `输入参数: figmaUrl="${input.figmaUrl || '(空)'}"`);
      log('调试', `输入参数: projectUrl="${input.projectUrl || '(空)'}"`);

      let combinedRequirements = '';
      let sourceType = 'comprehensive';
      let generatePayload = {};

      if (input.codeFiles && input.codeFiles.length > 0) {
        log('分析', `检测到基于代码的生成请求，提取项目上下文...`);
        sourceType = 'code';
        const CodeContextExtractor = require('./code-context-extractor');

        // 创建 AST Parser 实例（如果还没有）
        let astParser = this.astParser;
        if (!astParser) {
          try {
            const ASTParser = require('../ast-parser');
            astParser = new ASTParser();
            log('AST', '已初始化 AST Parser');
          } catch (e) {
            log('警告', `无法初始化 AST Parser: ${e.message}`);
          }
        }

        const extractor = new CodeContextExtractor({
          maxTokenBudget: 60000,
          astParser: astParser,
        });
        const contextResult = await extractor.extractContext(input.codeFiles, { projectPath: input.projectPath });
        
        if (contextResult.success) {
           log('分析', `已提取上下文: ${contextResult.context.summary}`);
           combinedRequirements = extractor.formatContextForPrompt(contextResult.context);
           generatePayload = {
              sourceType: 'code',
              content: combinedRequirements,
              metadata: contextResult.context
           };
        } else {
           throw new Error(`提取代码上下文失败: ${contextResult.error}`);
        }
      } else {
        if (input.requirements) {
          combinedRequirements += `## 需求描述\n${input.requirements}\n\n`;
        }

        if (input.figmaUrl) {
          combinedRequirements += `## Figma 设计稿\n链接: ${input.figmaUrl}\n\n`;
        }

        if (input.uiScreenshots && input.uiScreenshots.length > 0) {
          combinedRequirements += `## UI 界面截图\n`;
          input.uiScreenshots.forEach((screenshot, index) => {
            combinedRequirements += `${index + 1}. ${screenshot}\n`;
          });
          combinedRequirements += '\n';
        }

        if (input.apiDocs && input.apiDocs.length > 0) {
          combinedRequirements += `## API 文档\n`;
          input.apiDocs.forEach((doc, index) => {
            combinedRequirements += `${index + 1}. ${doc}\n`;
          });
          combinedRequirements += '\n';
        }

        if (input.projectUrl) {
          combinedRequirements += `## 项目地址\n${input.projectUrl}\n\n`;
        }

        // 使用 DynamicFileMatcher 自动匹配需求文案对应的代码文件
        if (input.projectPath && input.requirements && !input.codeFiles) {
          try {
            const DynamicFileMatcher = require('../qa-reviewer/matcher/dynamic-file-matcher');
            const matcher = new DynamicFileMatcher();
            await matcher.initialize(input.projectPath);

            const matchResult = matcher.matchFilesFromText(input.requirements);
            if (matchResult.files.length > 0) {
              log('文件匹配', `使用 DynamicFileMatcher (${matchResult.method}) 找到${matchResult.files.length}个相关文件`);

              // 用匹配到的文件提取代码上下文
              const matchedFilePaths = matchResult.files.map(f => f.path);

              let astParser = this.astParser;
              if (!astParser) {
                try {
                  const ASTParser = require('../ast-parser');
                  astParser = new ASTParser();
                } catch (e) { /* 忽略 */ }
              }

              const CodeContextExtractor = require('./code-context-extractor');
              const extractor = new CodeContextExtractor({
                maxTokenBudget: 60000,
                astParser: astParser,
              });
              const contextResult = await extractor.extractContext(matchedFilePaths, { projectPath: input.projectPath });

              if (contextResult.success) {
                log('文件匹配', `已提取代码上下文: ${contextResult.context.summary}`);
                combinedRequirements += `\n## 相关代码上下文\n${extractor.formatContextForPrompt(contextResult.context)}\n`;
                sourceType = 'comprehensive-with-code';
              }
            } else {
              log('文件匹配', `DynamicFileMatcher 未找到匹配文件 (${matchResult.method})`);
            }
          } catch (e) {
            log('警告', `文件匹配失败: ${e.message}`);
          }
        }

        generatePayload = {
           sourceType,
           content: combinedRequirements
        };
      }

      log('生成中', '正在使用 AI 生成测试用例...');

      // 2. 使用 AI 生成测试用例
      const generateResult = await this.generator.generate(
        {
          ...generatePayload,
          projectPath: input.projectPath,  // 传递项目路径
          language: input.language || 'traditional-chinese',  // 传递语言参数
        },
        {
          includeFunctional: true,
          includeUI: true,
          includeBoundary: true,
          includeException: true,
          includeAPI: input.apiDocs && input.apiDocs.length > 0,
        },
        log
      );

      if (!generateResult.success) {
        throw new Error(generateResult.error || '生成测试失败');
      }

      // 验证 testCases 结构
      if (!generateResult.testCases) {
        throw new Error('生成测试失败：testCases 为空');
      }

      // 3. 生成执行计划 - 使用 bddFormat
      const bddFormat = generateResult.testCases.bddFormat || generateResult.testCases;
      const executionPlan = this.parser.generateExecutionPlan(bddFormat);

      // 安全访问 summary
      const summary = generateResult.testCases.summary || {};

      return {
        success: true,
        analysis: {
          summary: `已分析需求并生成 ${summary.total || 0} 个测试用例`,
          totalTests: summary.total || 0,
          functionalTests: summary.functional || 0,
          uiTests: summary.ui || 0,
          boundaryTests: summary.boundary || 0,
          exceptionTests: summary.exception || 0,
          pages: generateResult.pages || [],
          flows: generateResult.flows || [],
        },
        testPlan: executionPlan,
      };
    } catch (error) {
      log('错误', `分析失败: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 执行视觉测试
   * @param {string} designPath - 设计稿路径（Figma JSON 或图片）
   * @param {string} url - 目标页面 URL
   * @param {Object} options - 选项
   * @returns {Object} 视觉测试结果
   */
  async executeVisualTest(designPath, url, options = {}) {
    this.log('info', '执行视觉测试', {
      designPath,
      url,
      testType: options.testType || 'comprehensive',
    });

    if (!this.visualEngine) {
      throw new Error('VisualTestEngine not initialized');
    }

    try {
      const result = await this.visualEngine.executeVisualTest(
        {
          designPath,
          url,
        },
        {
          testType: options.testType || 'comprehensive',
          threshold: options.threshold || 0.8,
          enableAIDetection: options.enableAIDetection !== false,
          saveScreenshots: options.saveScreenshots !== false,
          screenshotPath: options.screenshotPath,
        }
      );

      this.log('info', '视觉测试完成', {
        success: result.success,
        score: result.comparison?.overallScore,
        status: result.comparison?.overallStatus,
      });

      return {
        success: true,
        ...result,
      };
    } catch (error) {
      this.log('error', '视觉测试失败', { error: error.message });

      return {
        success: false,
        error: error.message,
        designPath,
        url,
      };
    }
  }

  /**
   * 批量执行视觉测试
   * @param {Array} testCases - 视觉测试用例数组
   * @param {Object} options - 选项
   * @returns {Object} 批量测试结果
   */
  async executeBatchVisualTests(testCases, options = {}) {
    this.log('info', `批量执行视觉测试`, {
      count: testCases.length,
    });

    const results = {
      total: testCases.length,
      passed: 0,
      failed: 0,
      acceptable: 0,
      tests: [],
    };

    for (const testCase of testCases) {
      const result = await this.executeVisualTest(
        testCase.designPath,
        testCase.url,
        {
          ...options,
          testType: testCase.testType || options.testType || 'comprehensive',
        }
      );

      results.tests.push(result);

      if (result.success) {
        const status = result.comparison?.overallStatus;
        if (status === 'passed') {
          results.passed++;
        } else if (status === 'acceptable') {
          results.acceptable++;
        } else {
          results.failed++;
        }
      } else {
        results.failed++;
      }

      // 进度回调
      if (options.onProgress) {
        options.onProgress({
          completed: results.tests.length,
          total: testCases.length,
          current: testCase,
        });
      }
    }

    this.log('info', '批量视觉测试完成', {
      passed: results.passed,
      acceptable: results.acceptable,
      failed: results.failed,
    });

    return results;
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
      // const overview = await this.memory.semantic.getProjectOverview();
      // const codeGraph = await this.memory.semantic.getCodeGraph();
      // return { overview, codeGraph };

      return {};
    } catch (error) {
      this.log('warn', '获取项目上下文失败', { error: error.message });
      return {};
    }
  }

  /**
   * 构建测试生成提示词
   * @param {string} requirement - 需求
   * @param {Object} projectContext - 项目上下文
   * @param {Object} options - 选项
   * @returns {string} 提示词
   */
  buildTestGenerationPrompt(requirement, projectContext, options = {}) {
    return `你是一个专业的测试用例生成助手。根据需求描述生成 BDD 格式的测试用例。

需求描述：
${requirement}

项目上下文：
${JSON.stringify(projectContext, null, 2)}

请生成测试用例，返回 JSON 格式：
{
  "module": "功能模块名称",
  "priority": "High|Medium|Low",
  "scenarios": [
    {
      "name": "场景名称",
      "given": "前提条件（Given）",
      "when": "操作步骤（When）",
      "then": "预期结果（Then）"
    }
  ]
}

注意：
1. 使用 BDD 格式（Given-When-Then）
2. 场景应该覆盖正常流程和异常流程
3. 预期结果应该具体可验证（如数量、文本、可见性等）
4. 考虑边界条件和错误情况
5. 使用中文描述`;
  }

  /**
   * 解析生成的测试用例
   * @param {string} content - LLM 响应内容
   * @returns {Object} 测试用例
   */
  parseGeneratedTests(content) {
    try {
      // 提取 JSON
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      // 如果没有 JSON，尝试解析文本
      return this.parseTextToTests(content);
    } catch (error) {
      this.log('error', '解析生成的测试用例失败', { error: error.message });
      return {
        module: 'Unknown',
        scenarios: [],
      };
    }
  }

  /**
   * 解析文本为测试用例
   * @param {string} text - 文本
   * @returns {Object} 测试用例
   */
  parseTextToTests(text) {
    // TODO: 实现文本解析逻辑
    return {
      module: 'Unknown',
      scenarios: [],
    };
  }

  /**
   * 初始化执行器
   * @param {Object} options - 选项，可能包含 projectUrl 和 cdpEndpoint
   */
  async initExecutor(options = {}) {
    if (this.executor) {
      return; // 已经初始化
    }

    this.executor = new StepExecutor({
      memory: this.memory,
      llm: this.llm,
      screenshotDir: this.options.screenshotDir,
      projectUrl: options.projectUrl || this.options.projectUrl,
      cdpEndpoint: options.cdpEndpoint || this.options.cdpEndpoint,
    });

    await this.executor.initExecutor(options);

    this.log('info', '执行器初始化完成', {
      projectUrl: options.projectUrl || this.options.projectUrl,
      hasCdpEndpoint: !!(options.cdpEndpoint || this.options.cdpEndpoint)
    });
  }

  /**
   * 清理资源
   */
  async cleanup() {
    if (this.executor) {
      try {
        await this.executor.cleanup();
      } catch (e) {
        this.log('warn', `清理执行器资源失败: ${e.message}`);
      }
      this.executor = null;
    }

    this.log('info', '资源已清理');
  }

  /**
   * 计算持续时间
   * @param {string} startTime - 开始时间
   * @param {string} endTime - 结束时间
   * @returns {number} 持续时间（毫秒）
   */
  calculateDuration(startTime, endTime) {
    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();
    return end - start;
  }

  /**
   * 生成测试报告
   * @param {Object} testResult - 测试结果
   * @param {string} format - 报告格式
   * @returns {Object} 测试报告
   */
  generateReport(testResult, format = 'json') {
    const isVisualTest = testResult.comparison !== undefined;
    const isBatchVisualTest = testResult.tests !== undefined;

    let report;

    // 视觉测试报告
    if (isVisualTest) {
      report = {
        type: 'visual',
        summary: {
          status: testResult.comparison?.overallStatus || 'unknown',
          score: testResult.comparison?.overallScore || 0,
          designPath: testResult.designInfo?.path,
          url: testResult.screenshotInfo?.url,
        },
        details: testResult,
        timestamp: new Date().toISOString(),
      };
    }
    // 批量视觉测试报告
    else if (isBatchVisualTest) {
      report = {
        type: 'batch-visual',
        summary: {
          total: testResult.total,
          passed: testResult.passed,
          failed: testResult.failed,
          acceptable: testResult.acceptable,
          passRate: testResult.total > 0
            ? ((testResult.passed / testResult.total) * 100).toFixed(2) + '%'
            : '0%',
        },
        details: testResult,
        timestamp: new Date().toISOString(),
      };
    }
    // BDD 功能测试报告
    else {
      report = {
        type: 'functional',
        summary: {
          totalScenarios: testResult.totalScenarios,
          passedScenarios: testResult.passedScenarios,
          failedScenarios: testResult.failedScenarios,
          skippedScenarios: testResult.skippedScenarios,
          passRate: testResult.totalScenarios > 0
            ? ((testResult.passedScenarios / testResult.totalScenarios) * 100).toFixed(2) + '%'
            : '0%',
          duration: testResult.duration,
        },
        details: testResult,
        timestamp: new Date().toISOString(),
      };
    }

    if (format === 'markdown') {
      return this.generateMarkdownReport(report);
    }

    return report;
  }

  /**
   * 生成 Markdown 报告
   * @param {Object} report - 报告数据
   * @returns {string} Markdown 报告
   */
  generateMarkdownReport(report) {
    const { summary, details } = report;

    let markdown = `# 测试报告\n\n`;
    markdown += `**生成时间：** ${report.timestamp}\n\n`;

    // 视觉测试报告
    if (report.type === 'visual') {
      markdown += `## 视觉测试报告\n\n`;
      markdown += `**测试类型：** 单个视觉测试\n\n`;
      markdown += `## 测试摘要\n\n`;
      markdown += `- **设计稿：** ${summary.designPath}\n`;
      markdown += `- **目标URL：** ${summary.url}\n`;
      markdown += `- **总体评分：** ${(summary.score * 100).toFixed(1)}%\n`;
      markdown += `- **测试状态：** ${summary.status}\n\n`;

      if (details.comparison) {
        const comp = details.comparison;
        markdown += `## 对比结果\n\n`;

        if (comp.structureScore !== undefined) {
          markdown += `### 结构对比\n`;
          markdown += `- **评分：** ${(comp.structureScore * 100).toFixed(1)}%\n`;
          markdown += `- **匹配元素：** ${comp.matchedElements?.length || 0}\n`;
          markdown += `- **未匹配元素：** ${comp.unmatchedDesignElements?.length || 0}\n\n`;
        }

        if (comp.elementCheckScore !== undefined) {
          markdown += `### 元素检查\n`;
          markdown += `- **评分：** ${(comp.elementCheckScore * 100).toFixed(1)}%\n`;
          if (comp.missingElements && comp.missingElements.length > 0) {
            markdown += `- **缺失元素：** ${comp.missingElements.length}\n`;
          }
          markdown += `\n`;
        }

        if (comp.layoutScore !== undefined) {
          markdown += `### 布局验证\n`;
          markdown += `- **评分：** ${(comp.layoutScore * 100).toFixed(1)}%\n`;
          if (comp.layoutDeviations && comp.layoutDeviations.length > 0) {
            markdown += `- **布局偏差：** ${comp.layoutDeviations.length} 处\n`;
          }
          markdown += `\n`;
        }

        if (comp.missingCheckScore !== undefined) {
          markdown += `### 缺失检查\n`;
          markdown += `- **评分：** ${(comp.missingCheckScore * 100).toFixed(1)}%\n`;
          if (comp.missingElements && comp.missingElements.length > 0) {
            markdown += `- **缺失元素：** ${comp.missingElements.length}\n`;
          }
          if (comp.extraElements && comp.extraElements.length > 0) {
            markdown += `- **额外元素：** ${comp.extraElements.length}\n`;
          }
          markdown += `\n`;
        }
      }
    }
    // 批量视觉测试报告
    else if (report.type === 'batch-visual') {
      markdown += `## 批量视觉测试报告\n\n`;
      markdown += `**测试类型：** 批量视觉测试\n\n`;
      markdown += `## 测试摘要\n\n`;
      markdown += `- **总测试数：** ${summary.total}\n`;
      markdown += `- **通过：** ${summary.passed}\n`;
      markdown += `- **可接受：** ${summary.acceptable}\n`;
      markdown += `- **失败：** ${summary.failed}\n`;
      markdown += `- **通过率：** ${summary.passRate}\n\n`;

      markdown += `## 详细结果\n\n`;
      for (let i = 0; i < details.tests.length; i++) {
        const test = details.tests[i];
        const statusIcon = test.success && test.comparison?.overallStatus === 'passed' ? '✅'
          : test.success && test.comparison?.overallStatus === 'acceptable' ? '⚠️'
          : '❌';
        markdown += `### ${statusIcon} 测试 ${i + 1}\n\n`;
        markdown += `- **设计稿：** ${test.designInfo?.path}\n`;
        markdown += `- **URL：** ${test.screenshotInfo?.url}\n`;
        if (test.comparison) {
          markdown += `- **评分：** ${(test.comparison.overallScore * 100).toFixed(1)}%\n`;
          markdown += `- **状态：** ${test.comparison.overallStatus}\n`;
        }
        if (!test.success) {
          markdown += `- **错误：** ${test.error}\n`;
        }
        markdown += `\n`;
      }
    }
    // BDD 功能测试报告
    else {
      markdown += `## 功能测试报告\n\n`;
      markdown += `**测试类型：** BDD 场景测试\n\n`;
      markdown += `## 测试摘要\n\n`;
      markdown += `- **总场景数：** ${summary.totalScenarios}\n`;
      markdown += `- **通过：** ${summary.passedScenarios}\n`;
      markdown += `- **失败：** ${summary.failedScenarios}\n`;
      markdown += `- **跳过：** ${summary.skippedScenarios}\n`;
      markdown += `- **通过率：** ${summary.passRate}\n`;
      markdown += `- **执行时间：** ${(summary.duration / 1000).toFixed(2)}s\n\n`;

      markdown += `## 详细结果\n\n`;

      for (const module of details.modules) {
        markdown += `### ${module.module} (${module.priority})\n\n`;

        for (const scenario of module.scenarios) {
          const statusIcon = scenario.status === 'passed' ? '✅' : scenario.status === 'failed' ? '❌' : '⏭️';
          markdown += `#### ${statusIcon} ${scenario.name}\n\n`;
          markdown += `- **状态：** ${scenario.status}\n`;
          markdown += `- **耗时：** ${(scenario.duration / 1000).toFixed(2)}s\n`;

          if (scenario.errors.length > 0) {
            markdown += `- **错误：**\n`;
            for (const error of scenario.errors) {
              markdown += `  - ${error.error || JSON.stringify(error)}\n`;
            }
          }

          markdown += `\n`;
        }
      }
    }

    return markdown;
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
      component: 'AITestAgent',
    };

    this.executionLogs.push(logEntry);

    // 控制台输出
    const logMethod = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    logMethod(`[AITestAgent] ${message}`, data);
  }

  /**
   * 获取执行日志
   * @returns {Array} 日志
   */
  getExecutionLogs() {
    return this.executionLogs;
  }

  /**
   * 等待页面真正加载完成（有可交互元素）
   * @param {Object} options - 选项
   * @param {Function} logCallback - 日志回调
   * @returns {Promise<boolean>} 页面是否准备好
   */
  async waitForPageReady(options = {}, logCallback = null) {
    const log = (type, message, data = {}) => {
      if (logCallback) {
        logCallback(type, message, data);
      } else {
        this.log('info', `${type}: ${message}`, data);
      }
    };

    // 检查 executor 是否可用
    if (!this.executor || !this.executor.page) {
      log('错误', '执行器未正确初始化，无法等待页面');
      return false;
    }

    const maxWaitTime = 600000; // 最多等待 600 秒（10分钟，Flutter Web 冷启动需要更长时间）
    const checkInterval = 3000; // 每 3 秒检查一次（更频繁）
    const startTime = Date.now();

    log('等待', '等待页面完全加载并检测可交互元素（Flutter Web 编译 + 渲染）...');

    let lastElementCount = 0;
    let stableCount = 0; // 元素数量稳定的次数
    let canvasDetected = false;

    while (Date.now() - startTime < maxWaitTime) {
      try {
        // 获取当前页面状态
        const pageState = await this.executor.getPageState();

        // 检查是否是 Canvas 渲染
        const hasCanvas = (pageState.elements?.canvasCount || 0) > 0;
        if (hasCanvas && !canvasDetected) {
          canvasDetected = true;
          log('Canvas检测', `检测到 Canvas 渲染模式 (${pageState.elements.canvasCount} 个 Canvas)`);
        }

        // 获取所有可交互元素的数量
        let totalElements = 0;
        let elementDesc = '';
        let details = {};

        if (hasCanvas) {
          // Canvas 渲染模式：检查可访问性树
          const a11yCount = pageState.accessibilityTree?.count || 0;
          const flutterElementCount = pageState.accessibilityTree?.flutterElementCount || 0;
          totalElements = a11yCount;

          // 对于 Flutter Web，即使可访问性树为空，如果有大量 Flutter 元素，也认为页面在渲染
          if (a11yCount === 0 && flutterElementCount > 10) {
            // Flutter Web 可能没有生成可访问性树，但有 Flutter 元素
            totalElements = flutterElementCount;
            elementDesc = `${flutterElementCount}个Flutter元素(无A11y)`;
            details.hasA11y = false;
          } else {
            elementDesc = `${a11yCount}个可访问性元素`;
            details.hasA11y = true;
          }

          // 添加可访问性元素详情
          if (pageState.accessibilityTree?.elements) {
            const samples = pageState.accessibilityTree.elements.slice(0, 3);
            details.samples = samples.map(e => `${e.role || '?'}: ${e.label || e.text || ''}`).join(', ');
          }
        } else {
          // 标准 DOM 渲染模式
          const buttonCount = pageState.elements?.buttons?.length || 0;
          const inputCount = pageState.elements?.inputs?.length || 0;
          const linkCount = pageState.elements?.links?.length || 0;
          const allElementsCount = pageState.elements?.allElementsCount || 0;
          totalElements = buttonCount + inputCount + linkCount;

          // 如果没有找到标准交互元素，但有大量 DOM 元素，可能是 SPA
          if (totalElements === 0 && allElementsCount > 50) {
            totalElements = allElementsCount;
            elementDesc = `${allElementsCount}个DOM元素(SPA)`;
          } else {
            elementDesc = `${buttonCount}按钮 ${inputCount}输入 ${linkCount}链接`;
          }
        }

        // 检查 URL 是否有效
        const isValidUrl = pageState.url &&
                           !pageState.url.includes('chrome-error') &&
                           !pageState.url.includes('#loading') &&
                           !pageState.url.includes('about:blank');

        // 检查是否还在加载中
        // 对于 Canvas 渲染的 Flutter 应用，bodyText 检测不可靠（canvas 不产生 innerText）
        // 所以只将 isLoading 用于标准 DOM 渲染判断
        let isLoading = pageState.isLoading || false;
        if (hasCanvas && isValidUrl) {
          // Flutter Canvas 模式：如果 canvas 已出现且 URL 有效，忽略 loading 标志
          // 因为 Flutter 的 loading 文本可能在 canvas 渲染后仍残留在 DOM 中
          isLoading = false;
        }

        const elapsed = Math.round((Date.now() - startTime) / 1000);

        // 对于 Canvas 渲染模式，放宽条件：
        // 1. URL 有效
        // 2. 有可交互元素（可访问性元素或 Flutter 元素）或元素数量稳定
        // 注意：Canvas 模式不再检查 isLoading，因为 Flutter canvas 下不可靠
        const canvasReadyCondition = hasCanvas && isValidUrl &&
                                     (totalElements > 0 || stableCount > 0);

        // 对于标准 DOM 渲染模式：
        // 1. 有可交互元素
        // 2. URL 有效
        // 3. 不在加载状态
        const domReadyCondition = !hasCanvas && totalElements > 0 && isValidUrl && !isLoading;

        if (canvasReadyCondition || domReadyCondition) {
          // 检查元素数量是否稳定
          if (totalElements >= lastElementCount) {
            stableCount++;
          } else {
            // 元素数量减少，重置稳定计数（但保留一些计数，避免因为动态加载导致的抖动）
            stableCount = Math.max(0, stableCount - 1);
          }
          lastElementCount = totalElements;

          // 对于 Canvas 渲染，只需要稳定 2 次（6秒）
          // 对于 DOM 渲染，需要稳定 3 次（9秒）
          const requiredStableCount = hasCanvas ? 2 : 3;

          if (stableCount >= requiredStableCount) {
            const renderMode = hasCanvas ? 'Canvas渲染' : 'DOM渲染';
            log('页面就绪', `页面已完全加载！[${renderMode}] 检测到 ${elementDesc}，耗时 ${elapsed} 秒`, details);
            return true;
          }

          log('检测到元素', `检测到 ${elementDesc}，等待稳定... (${elapsed}秒，稳定度: ${stableCount}/${requiredStableCount})`, details);
        } else {
          // 重置稳定计数
          stableCount = 0;
          lastElementCount = 0;
          const status = isLoading ? '加载中' : '等待渲染';
          log(status, `等待页面渲染... (${elapsed}秒) - URL: ${pageState.url?.substring(0, 50)}..., 元素: ${elementDesc}`, {
            isValidUrl,
            isLoading,
            hasCanvas,
            ...details
          });
        }

      } catch (error) {
        log('检查', `页面状态检查失败: ${error.message}`);
      }

      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }

    // 超时后返回 false，但允许测试继续
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    log('超时', `等待超时 (${elapsed}秒)，将尝试执行测试（可能页面尚未完全加载）`);
    return false;
  }

  /**
   * 规范化步骤数据 - 确保 verifications 数组中的对象都有 type 字段
   * @param {Array} steps - 步骤数组
   * @returns {Array} 规范化后的步骤数组
   */
  normalizeStepsData(steps) {
    if (!steps || !Array.isArray(steps)) {
      return steps;
    }

    return steps.map(step => {
      // 规范化 then 步骤的 verifications
      if (step.type === 'then' && step.verifications && Array.isArray(step.verifications)) {
        step.verifications = step.verifications.map(v => {
          // 如果没有 type 字段，根据内容推断
          if (!v.type) {
            // 如果有 description 或 message，使用 assertion 类型
            if (v.description || v.message) {
              return { ...v, type: 'assertion' };
            }
            // 否则使用 basic 类型
            return { ...v, type: 'basic' };
          }
          return v;
        });
      }
      return step;
    });
  }

  /**
   * 获取测试结果
   * @returns {Array} 测试结果
   */
  getTestResults() {
    return this.testResults;
  }
}

module.exports = AITestAgent;
