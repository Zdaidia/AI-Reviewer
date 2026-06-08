/**
 * 快速演示 - 不需要浏览器
 *
 * 展示核心功能：
 * 1. AI 测试生成
 * 2. 增强测试报告
 * 3. Context Builder
 */

const AITestGeneratorComplete = require('../src/core/testing/ai-test-generator-complete');
const EnhancedTestReporter = require('../src/core/testing/enhanced-test-reporter');
const ContextBuilder = require('../src/core/testing/context-builder');
const path = require('path');

async function quickDemo() {
  console.log('========================================');
  console.log('AI 测试系统 - 快速演示');
  console.log('========================================\n');

  // ============================================
  // 1. AI 测试生成
  // ============================================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('1. AI 测试生成');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const generator = new AITestGeneratorComplete();

  const userInput = '用户可以查看案件列表，点击进入详情页';

  console.log(`用户输入: ${userInput}\n`);

  const genResult = await generator.generate(
    {
      sourceType: 'requirement',
      content: userInput,
    },
    {
      includeFunctional: true,
      includeUI: true,
      includeBoundary: true,
      includeException: true,
      includeVisual: true,
    }
  );

  if (genResult.success) {
    console.log('✅ 测试用例生成成功！\n');
    console.log(`总用例数: ${genResult.testCases.summary.total}`);
    console.log(`  - 功能测试: ${genResult.testCases.summary.functional}`);
    console.log(`  - UI 测试: ${genResult.testCases.summary.ui}`);
    console.log(`  - 边界测试: ${genResult.testCases.summary.boundary}`);
    console.log(`  - 异常测试: ${genResult.testCases.summary.exception}`);
    console.log(`  - 视觉测试: ${genResult.testCases.summary.visual}`);

    console.log('\n前 3 个测试用例：\n');
    genResult.testCases.bddFormat.scenarios.slice(0, 3).forEach((scenario, index) => {
      console.log(`${index + 1}. ${scenario.name}`);
      console.log(`   Given: ${scenario.given}`);
      console.log(`   When: ${scenario.when}`);
      console.log(`   Then: ${scenario.then}\n`);
    });
  }

  // ============================================
  // 2. Context Builder
  // ============================================
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('2. Context Builder（上下文构建）');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const contextBuilder = new ContextBuilder({
    projectPath: './examples',
    cacheEnabled: true,
  });

  console.log('构建项目上下文...\n');

  const context = await contextBuilder.buildContext({
    url: 'https://example.com/cases',
    testGoal: '用户查看案件列表',
  });

  console.log('✅ 上下文构建完成！\n');
  console.log('默认路由：');
  Object.entries(context.routes).forEach(([path, info]) => {
    console.log(`  ${path} → ${info.page}`);
  });

  console.log('\n默认页面：');
  Object.entries(context.pages).slice(0, 3).forEach(([name, info]) => {
    console.log(`  ${name}: ${info.path}`);
    console.log(`    元素: ${info.elements?.join(', ')}`);
  });

  console.log('\n默认组件：');
  Object.entries(context.components).slice(0, 3).forEach(([name, info]) => {
    console.log(`  ${name}: ${info.selector}`);
  });

  console.log('\n默认选择器：');
  console.log(`  按钮: ${context.selectors.common?.button}`);
  console.log(`  输入框: ${context.selectors.common?.input}`);
  console.log(`  列表: ${context.selectors.common?.list}`);

  // ============================================
  // 3. 增强测试报告
  // ============================================
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('3. 增强测试报告（含 AI 分析）');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const reporter = new EnhancedTestReporter({
    outputDir: path.join(__dirname, 'test-reports'),
    screenshotDir: path.join(__dirname, 'test-screenshots'),
    enableAIAnalysis: false, // 演示模式不启用 AI 分析
  });

  console.log('生成模拟测试报告...\n');

  // 模拟测试数据
  const testData = {
    testName: '案件管理系统测试',
    startTime: new Date(Date.now() - 10000).toISOString(),
    endTime: new Date().toISOString(),
    duration: 10000,
    framework: 'AI Test Agent',
    testCases: [
      {
        id: 'TC001',
        name: '案件列表',
        description: '查看案件列表',
        status: 'passed',
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
            status: 'passed',
            duration: 2000,
            action: 'assert',
          },
        ],
      },
      {
        id: 'TC002',
        name: '案件详情',
        description: '查看案件详情',
        status: 'failed',
        duration: 5000,
        steps: [
          {
            number: 1,
            description: '点击案件项',
            status: 'passed',
            duration: 1000,
            action: 'click',
          },
          {
            number: 2,
            description: '验证详情页加载',
            status: 'failed',
            duration: 4000,
            action: 'assert',
            expected: '显示 10 条详情',
            actual: '显示 15 条详情',
            error: 'Expected 10 items, got 15',
          },
        ],
      },
    ],
  };

  const report = await reporter.generateReport(testData);

  console.log('✅ 报告生成完成！\n');
  console.log('总体结果：');
  console.log(`  总用例: ${report.overall.total}`);
  console.log(`  通过: ${report.overall.passed}`);
  console.log(`  失败: ${report.overall.failed}`);
  console.log(`  通过率: ${report.overall.passRate}`);

  console.log('\n失败用例分析：');
  const failedCase = report.testCases.find(tc => tc.status === 'failed');
  if (failedCase) {
    console.log(`\n用例: ${failedCase.name}`);
    console.log(`步骤: ${failedCase.steps.length}`);
    console.log(`问题: ${failedCase.issues.length}`);

    failedCase.issues.forEach((issue, index) => {
      console.log(`\n  问题 ${index + 1}:`);
      console.log(`    步骤: ${issue.step}`);
      console.log(`    错误: ${issue.error}`);
      console.log(`    类型: ${issue.type}`);
      console.log(`    严重性: ${issue.severity}`);
    });

    console.log('\n  基于规则的修复建议：');
    failedCase.suggestions.forEach((suggestion, index) => {
      console.log(`\n  建议 ${index + 1}:`);
      console.log(`    问题: ${suggestion.what}`);
      console.log(`    修复: ${suggestion.how}`);
      console.log(`    验证: ${suggestion.verify}`);
    });
  }

  // 保存报告
  console.log('\n生成报告文件...\n');
  const markdownPath = await reporter.saveReport(report, 'markdown');

  console.log(`✅ Markdown 报告已保存: ${markdownPath}`);

  // ============================================
  // 4. 架构总结
  // ============================================
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('架构总结');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('新架构流程：');
  console.log('');
  console.log('  Excel / AI生成');
  console.log('       ↓');
  console.log('  Test Intent（测试意图）');
  console.log('       ↓');
  console.log('  AI Agent（智能决策）');
  console.log('       ↓');
  console.log('  Playwright（执行器）');
  console.log('       ↓');
  console.log('  AI 分析结果（智能分析）');
  console.log('');

  console.log('核心优势：');
  console.log('  ✓ 意图驱动 - 不是脚本');
  console.log('  ✓ AI 实时决策 - 动态适应');
  console.log('  ✓ 智能纠错 - 自动恢复');
  console.log('  ✓ 深度分析 - 根本原因');
  console.log('  ✓ 修复建议 - 可操作');

  console.log('\n========================================');
  console.log('✅ 快速演示完成！');
  console.log('========================================\n');

  console.log('生成文件：');
  console.log(`  - 测试报告: ${markdownPath}`);
  console.log('');
  console.log('核心成果：');
  console.log(`  - 生成了 ${genResult.testCases.summary.total} 个测试用例`);
  console.log('  - 构建了完整的项目上下文');
  console.log('  - 生成了增强的测试报告');
  console.log('  - 提供了智能修复建议');

  return {
    success: true,
    generatedTests: genResult.testCases.summary.total,
    reportPath: markdownPath,
  };
}

// 主函数
if (require.main === module) {
  quickDemo()
    .then((result) => {
      console.log('\n✅ 演示成功完成！');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ 演示失败:', error);
      process.exit(1);
    });
}

module.exports = { quickDemo };
