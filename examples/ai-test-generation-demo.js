/**
 * AI 自动生成测试 - 完整示例
 *
 * 按照用户需求实现：
 * - 输入来源：需求文档、设计稿、API 文档
 * - 处理流程：需求分析 → 页面识别 → 用户流程推断 → 生成测试用例
 * - 测试类型：功能测试、UI 测试、边界测试、异常测试
 */

const AITestGeneratorComplete = require('../src/core/testing/ai-test-generator-complete');

// ============================================
// 示例：用户提供的需求
// ============================================

async function demo_UserRequirement() {
  console.log('========================================');
  console.log('AI 自动生成测试 - 完整演示');
  console.log('========================================\n');

  // 用户输入的需求
  const userInput = `
需求：
用户可以查看案件列表
点击进入详情页
  `.trim();

  console.log('【用户输入】');
  console.log(userInput);
  console.log('');

  // 初始化生成器
  const generator = new AITestGeneratorComplete({
    llm: new (class MockLLM {
      async chat(purpose, messages, options) {
        // 模拟 LLM 响应
        return {
          success: true,
          content: JSON.stringify({
            module: '案件管理',
            priority: 'High',
            scenarios: [
              {
                name: '查看案件列表',
                given: '用户已登录系统',
                when: '进入案件列表页面',
                then: '显示案件列表，默认显示10条',
              },
              {
                name: '查看案件详情',
                given: '用户在案件列表页',
                when: '点击第一条案件',
                then: '跳转到案件详情页，显示完整信息',
              },
              {
                name: '分页功能',
                given: '案件列表有超过10条数据',
                when: '点击下一页按钮',
                then: '显示第11-20条数据',
              },
              {
                name: '排序功能',
                given: '案件列表有数据',
                when: '点击排序按钮',
                then: '列表按选择的字段重新排序',
              },
            ],
          }),
        };
      }
    })(),
  });

  try {
    // 执行完整的生成流程
    console.log('【开始生成测试用例】\n');

    // 步骤 1：需求分析
    console.log('步骤 1/5：需求分析...');
    const analysis = await generator.analyzeRequirements({
      sourceType: 'requirement',
      content: userInput,
    });

    console.log(`  ✓ 识别功能: ${analysis.features.length} 个`);
    console.log(`  ✓ 用户目标: ${analysis.userGoals.length} 个`);

    // 步骤 2：页面识别
    console.log('\n步骤 2/5：页面识别...');
    const pages = await generator.identifyPages(userInput, analysis);

    console.log(`  ✓ 识别页面: ${pages.length} 个`);
    pages.forEach(page => {
      console.log(`    - ${page.name} (${page.type})`);
    });

    // 步骤 3：用户流程推断
    console.log('\n步骤 3/5：用户流程推断...');
    const flows = await generator.inferUserFlows(userInput, analysis, pages);

    console.log(`  ✓ 推断流程: ${flows.length} 个`);
    flows.forEach(flow => {
      console.log(`    - ${flow.name} (${flow.type})`);
      console.log(`      步骤: ${flow.steps.join(' → ')}`);
    });

    // 步骤 4：生成测试用例
    console.log('\n步骤 4/5：生成测试用例...');
    const testCases = await generator.generateTestCases(
      userInput,
      analysis,
      pages,
      flows,
      {
        includeFunctional: true,
        includeUI: true,
        includeBoundary: true,
        includeException: true,
      }
    );

    const formatted = generator.formatTestCases(testCases);

    console.log(`  ✓ 生成测试用例: ${formatted.summary.total} 个`);
    console.log(`    - 功能测试: ${formatted.summary.functional} 个`);
    console.log(`    - UI 测试: ${formatted.summary.ui} 个`);
    console.log(`    - 边界测试: ${formatted.summary.boundary} 个`);
    console.log(`    - 异常测试: ${formatted.summary.exception} 个`);

    // 步骤 5：格式化输出
    console.log('\n步骤 5/5：格式化输出...\n');

    // 显示生成的测试用例
    console.log('========================================');
    console.log('生成的测试用例');
    console.log('========================================\n');

    // 按类型分组显示
    console.log('【功能测试】\n');
    formatted.byType.functional.forEach((test, index) => {
      console.log(`${index + 1}. ${test.name}`);
      console.log(`   Given: ${test.given}`);
      console.log(`   When:  ${test.when}`);
      console.log(`   Then:  ${test.then}`);
      console.log('');
    });

    console.log('【UI 测试】\n');
    formatted.byType.ui.forEach((test, index) => {
      console.log(`${index + 1}. ${test.name}`);
      console.log(`   Given: ${test.given}`);
      console.log(`   When:  ${test.when}`);
      console.log(`   Then:  ${test.then}`);
      console.log('');
    });

    console.log('【边界测试】\n');
    formatted.byType.boundary.forEach((test, index) => {
      console.log(`${index + 1}. ${test.name}`);
      console.log(`   Given: ${test.given}`);
      console.log(`   When:  ${test.when}`);
      console.log(`   Then:  ${test.then}`);
      console.log('');
    });

    console.log('【异常测试】\n');
    formatted.byType.exception.forEach((test, index) => {
      console.log(`${index + 1}. ${test.name}`);
      console.log(`   Given: ${test.given}`);
      console.log(`   When:  ${test.when}`);
      console.log(`   Then:  ${test.then}`);
      console.log('');
    });

    // BDD 格式输出
    console.log('========================================');
    console.log('BDD 格式（可用于 Excel）');
    console.log('========================================\n');

    console.log('Function | 優先級 | Scenario | Given | When | Then');
    console.log('---------|--------|----------|-------|------|------');

    formatted.bddFormat.scenarios.forEach((scenario, index) => {
      const line = `案件管理 | High | ${scenario.name} | ${scenario.given} | ${scenario.when} | ${scenario.then}`;
      console.log(line);
    });

    console.log('\n========================================');
    console.log('✅ 测试用例生成完成！');
    console.log('========================================\n');

    console.log('统计信息：');
    console.log(`  总测试用例: ${formatted.summary.total} 个`);
    console.log(`  功能测试: ${formatted.summary.functional} 个`);
    console.log(`  UI 测试: ${formatted.summary.ui} 个`);
    console.log(`  边界测试: ${formatted.summary.boundary} 个`);
    console.log(`  异常测试: ${formatted.summary.exception} 个`);

    return formatted;

  } catch (error) {
    console.error('❌ 生成失败:', error.message);
    return null;
  }
}

// ============================================
// 运行演示
// ============================================

if (require.main === module) {
  demo_UserRequirement()
    .then(() => {
      console.log('\n✅ 演示完成！');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ 演示失败:', error);
      process.exit(1);
    });
}

module.exports = { demo_UserRequirement };
