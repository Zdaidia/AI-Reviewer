/**
 * Complete Architecture Demo
 *
 * 演示完整的 AI 测试系统架构
 *
 * Excel / AI生成
 *   ↓
 * Test Intent（测试意图）
 *   ↓
 * AI Agent（智能决策）
 *   ↓
 * Playwright（执行器）
 *   ↓
 * AI分析结果（智能分析）
 */

const AIExecutionEngine = require('../src/core/testing/ai-execution-engine');
const BrowserActions = require('../src/core/testing/browser-actions');
const ContextBuilder = require('../src/core/testing/context-builder');
const EnhancedTestReporter = require('../src/core/testing/enhanced-test-reporter');
const AITestGeneratorComplete = require('../src/core/testing/ai-test-generator-complete');
const path = require('path');

// ============================================
// 完整架构演示
// ============================================

async function demonstrateCompleteArchitecture() {
  console.log('========================================');
  console.log('AI 测试系统 - 完整架构演示');
  console.log('========================================\n');

  console.log('架构流程：');
  console.log('Excel / AI生成 → Test Intent → AI Agent → Playwright → AI分析\n');

  // ============================================
  // 步骤 1: 输入层
  // ============================================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('步骤 1: 输入层');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const inputs = {
    excel: {
      type: 'excel',
      path: './test-cases.xlsx',
      description: '案件管理系统的 BDD 测试用例',
    },
    ai: {
      type: 'ai-generation',
      source: 'requirement',
      content: '用户可以查看案件列表，点击进入详情页',
      description: '从需求自动生成测试',
    },
  };

  console.log('支持的输入类型：');
  console.log('1. Excel BDD 测试');
  console.log(`   路径: ${inputs.excel.path}`);
  console.log(`   描述: ${inputs.excel.description}`);
  console.log('');
  console.log('2. AI 生成测试');
  console.log(`   来源: ${inputs.ai.source}`);
  console.log(`   内容: ${inputs.ai.content}`);
  console.log(`   描述: ${inputs.ai.description}`);

  // ============================================
  // 步骤 2: Test Intent（测试意图）
  // ============================================
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('步骤 2: Test Intent（测试意图）');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // AI 生成测试
  const generator = new AITestGeneratorComplete();

  console.log('使用 AI 生成测试意图...');
  const genResult = await generator.generate(
    {
      sourceType: inputs.ai.source,
      content: inputs.ai.content,
    },
    {
      includeFunctional: true,
      includeUI: true,
      includeBoundary: false,
      includeException: false,
    }
  );

  if (genResult.success) {
    console.log('✓ 测试用例生成成功');
    console.log(`  总数: ${genResult.testCases.summary.total}`);
    console.log(`  功能: ${genResult.testCases.summary.functional}`);
    console.log(`  UI: ${genResult.testCases.summary.ui}`);
  }

  // 转换为 Test Intent
  const testIntent = {
    goal: '用户查看案件列表并进入详情页',
    priority: 'High',
    preconditions: [
      '用户已登录',
      '系统有案件数据',
    ],
    scenarios: genResult.testCases?.bddFormat?.scenarios?.slice(0, 3) || [],
    expectedOutcome: {
      state: 'case_detail_viewed',
      elements: ['案件列表', '案件详情'],
    },
  };

  console.log('\n--- Test Intent ---');
  console.log(`目标: ${testIntent.goal}`);
  console.log(`优先级: ${testIntent.priority}`);
  console.log(`场景数: ${testIntent.scenarios.length}`);
  console.log('\n关键区别：');
  console.log('  ❌ 旧方式: fill("#search-input", "keyword")');
  console.log('  ✅ 新方式: { intent: "搜索案件", keyword: "keyword" }');

  // ============================================
  // 步骤 3: Context Builder
  // ============================================
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('步骤 3: Context Builder（上下文构建）');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const contextBuilder = new ContextBuilder({
    projectPath: './examples',
    cacheEnabled: true,
  });

  console.log('构建执行上下文...');

  const context = await contextBuilder.buildContext({
    url: 'https://example.com/cases',
    testGoal: testIntent.goal,
    executionHistory: [],
    currentStep: 0,
  });

  console.log('✓ 上下文构建完成');
  console.log(`  路由数: ${Object.keys(context.routes).length}`);
  console.log(`  页面数: ${Object.keys(context.pages).length}`);
  console.log(`  组件数: ${Object.keys(context.components).length}`);

  console.log('\n--- 可用上下文 ---');
  console.log('路由:');
  Object.entries(context.routes).forEach(([path, info]) => {
    console.log(`  ${path} → ${info.page}`);
  });

  console.log('\n页面:');
  Object.entries(context.pages).slice(0, 3).forEach(([name, info]) => {
    console.log(`  ${name}: ${info.path}`);
    console.log(`    元素: ${info.elements?.join(', ')}`);
  });

  console.log('\n组件:');
  Object.entries(context.components).slice(0, 3).forEach(([name, info]) => {
    console.log(`  ${name}: ${info.selector}`);
  });

  // ============================================
  // 步骤 4: AI Agent 执行
  // ============================================
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('步骤 4: AI Agent（智能决策）');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const engine = new AIExecutionEngine({
    screenshotDir: path.join(__dirname, 'test-screenshots'),
    enableSelfCorrection: true,
    enableExploration: true,
    maxIterations: 20,
  });

  await engine.init({ headless: true });

  console.log('✓ AI 执行引擎初始化完成');
  console.log('  - 自我纠正: 启用');
  console.log('  - 探索模式: 启用');
  console.log('  - 最大迭代: 20');

  console.log('\n--- AI 执行循环 ---');
  console.log('while (test not finished):');
  console.log('  1. 观察页面（DOM / screenshot）');
  console.log('  2. 理解当前状态');
  console.log('  3. 决定下一步操作');
  console.log('  4. 执行操作');
  console.log('  5. 验证结果');
  console.log('');

  console.log('开始执行 Test Intent...');

  const executionResult = await engine.execute({
    description: testIntent.goal,
    startUrl: 'https://example.com/cases',
    successCriteria: {
      elementVisible: '.case-list',
    },
  });

  console.log('\n--- 执行结果 ---');
  console.log(`状态: ${executionResult.status}`);
  console.log(`成功: ${executionResult.success ? '✓' : '✗'}`);
  console.log(`迭代次数: ${executionResult.iterations}`);
  console.log(`执行时间: ${(executionResult.duration / 1000).toFixed(2)}s`);

  if (executionResult.decisions && executionResult.decisions.length > 0) {
    console.log('\n决策历史（前 3 个）：');
    executionResult.decisions.slice(0, 3).forEach((decision, index) => {
      console.log(`  ${index + 1}. ${decision.action}`);
      console.log(`     理由: ${decision.reasoning || 'N/A'}`);
      console.log(`     置信度: ${(decision.confidence * 100).toFixed(0)}%`);
    });
  }

  // ============================================
  // 步骤 5: Playwright（执行器）
  // ============================================
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('步骤 5: Playwright（执行器）');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('BrowserActions 提供的操作能力：');
  console.log('  ✓ goto(url) - 导航到 URL');
  console.log('  ✓ click(selector) - 点击元素');
  console.log('  ✓ input(selector, text) - 输入文本');
  console.log('  ✓ scroll(options) - 滚动页面');
  console.log('  ✓ wait(duration) - 等待');
  console.log('  ✓ extract(selector) - 提取文本');
  console.log('  ✓ count(selector) - 计数元素');
  console.log('  ✓ screenshot(options) - 截图');

  console.log('\n示例：AI 决策 → BrowserActions 执行');
  console.log('  AI 决策: { action: "click", selector: "#search-btn" }');
  console.log('  执行: await browserActions.click("#search-btn")');

  // ============================================
  // 步骤 6: AI 分析结果
  // ============================================
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('步骤 6: AI 分析结果（智能分析）');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const reporter = new EnhancedTestReporter({
    outputDir: path.join(__dirname, 'test-reports'),
    screenshotDir: path.join(__dirname, 'test-screenshots'),
    enableAIAnalysis: true,
  });

  console.log('✓ 增强报告生成器初始化完成');
  console.log('  - AI 分析: 启用');

  // 模拟测试数据
  const testData = {
    testName: '案件列表测试',
    startTime: new Date().toISOString(),
    endTime: new Date().toISOString(),
    duration: 5000,
    testCases: [
      {
        id: 'TC001',
        name: '案件列表',
        description: '查看案件列表',
        status: 'failed',
        duration: 3000,
        steps: [
          {
            number: 1,
            description: '进入案件列表页面',
            status: 'passed',
            duration: 1000,
            action: 'goto',
          },
          {
            number: 2,
            description: '检查列表显示',
            status: 'failed',
            duration: 2000,
            action: 'assert',
            expected: '显示 10 条数据',
            actual: '显示 15 条数据',
            error: 'Expected 10 items, got 15',
          },
        ],
      },
    ],
  };

  console.log('\n生成增强报告...');

  const report = await reporter.generateReport(testData);

  console.log('✓ 报告生成完成');
  console.log(`  总用例: ${report.overall.total}`);
  console.log(`  通过: ${report.overall.passed}`);
  console.log(`  失败: ${report.overall.failed}`);
  console.log(`  通过率: ${report.overall.passRate}`);

  console.log('\n--- 增强报告内容 ---');
  const failedCase = report.testCases.find(tc => tc.status === 'failed');
  if (failedCase) {
    console.log('\n失败分析：');
    console.log(`  用例: ${failedCase.name}`);
    console.log(`  问题: ${failedCase.issues[0]?.error}`);

    if (failedCase.suggestions && failedCase.suggestions.length > 0) {
      console.log('\nAI 修复建议：');
      failedCase.suggestions.forEach((suggestion, index) => {
        console.log(`  ${index + 1}. ${suggestion.what}`);
        console.log(`     如何: ${suggestion.how}`);
        console.log(`     验证: ${suggestion.verify}`);
      });
    }
  }

  // 保存报告
  const reportPath = await reporter.saveReport(report, 'markdown');
  console.log(`\n报告已保存: ${reportPath}`);

  // ============================================
  // 架构对比
  // ============================================
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('架构对比');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('旧架构：');
  console.log('  Excel → Test DSL → Playwright → 结果');
  console.log('');
  console.log('  问题：');
  console.log('    ✗ 生成静态脚本');
  console.log('    ✗ 无法动态决策');
  console.log('    ✗ 应对意外能力差');

  console.log('\n新架构：');
  console.log('  Excel/AI → Test Intent → AI Agent → Playwright → AI分析');
  console.log('');
  console.log('  优势：');
  console.log('    ✓ 意图驱动');
  console.log('    ✓ AI 实时决策');
  console.log('    ✓ 动态应对变化');
  console.log('    ✓ 智能错误分析');
  console.log('    ✓ 自动修复建议');

  // ============================================
  // 清理
  // ============================================
  await engine.cleanup();

  console.log('\n========================================');
  console.log('完整架构演示完成！');
  console.log('========================================\n');

  console.log('核心成果：');
  console.log('  1. ✓ 支持多种输入源（Excel, AI 生成）');
  console.log('  2. ✓ Test Intent 取代静态脚本');
  console.log('  3. ✓ AI Agent 实时决策');
  console.log('  4. ✓ BrowserActions 封装执行');
  console.log('  5. ✓ Context Builder 提供上下文');
  console.log('  6. ✓ EnhancedReporter 智能分析');
  console.log('');
  console.log('这是一个质的飞跃：从"脚本执行"到"智能 Agent"！');

  return {
    success: true,
    execution: executionResult,
    report: report,
  };
}

// ============================================
// 主函数
// ============================================

if (require.main === module) {
  demonstrateCompleteArchitecture()
    .then(() => {
      console.log('\n✅ 演示完成！');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ 演示失败:', error);
      process.exit(1);
    });
}

module.exports = {
  demonstrateCompleteArchitecture,
};
