/**
 * AI 自动生成测试 - 完整示例
 *
 * 演示 4 种输入方式的 AI 测试生成
 */

const AITestGeneratorEnhanced = require('../src/core/testing/ai-test-generator-enhanced');
const AITestAgent = require('../src/core/testing/ai-test-agent');
const { MemoryManager } = require('../src/core/agent/memory');
const { LLMRouter } = require('../src/core/agent/llm');

// ============================================
// 示例 1：自然语言描述生成测试
// ============================================

async function example1_NaturalLanguage() {
  console.log('\n=== 示例 1：自然语言描述生成测试 ===\n');

  // 初始化
  const memory = new MemoryManager({ persistToFile: true });
  const llm = new LLMRouter({
    zhipuApiKey: '2617ccc0befe47d097d7d8b688b8d54b.rN8AFmNCZfZsmpFu',
    defaultModel: 'glm-4',
  });

  const generator = new AITestGeneratorEnhanced({
    memory,
    llm,
  });

  // 自然语言描述
  const description = `
实现用户登录功能：
1. 用户名和密码验证
2. 支持记住密码功能
3. 密码错误时显示提示信息
4. 登录成功后跳转到首页
5. 支持忘记密码功能
  `.trim();

  console.log('功能描述:', description);

  try {
    // 生成测试用例
    const result = await generator.generateFromDescription(description, {
      includeErrorCases: true,    // 包含错误场景
      includePerformance: false,   // 不包含性能测试
      includeSecurity: true,       // 包含安全测试
      framework: 'React',          // 技术栈
    });

    if (result.success) {
      console.log('\n✅ 测试用例生成成功！\n');
      console.log('模块:', result.generatedTests.module);
      console.log('优先级:', result.generatedTests.priority);
      console.log('场景数:', result.generatedTests.scenarios.length);

      result.generatedTests.scenarios.forEach((scenario, index) => {
        console.log(`\n场景 ${index + 1}: ${scenario.name}`);
        console.log(`  Given: ${scenario.given}`);
        console.log(`  When:  ${scenario.when}`);
        console.log(`  Then:  ${scenario.then}`);
      });

      return result.generatedTests;
    } else {
      console.error('❌ 生成失败:', result.error);
      return null;
    }
  } catch (error) {
    console.error('❌ 执行失败:', error.message);
    return null;
  }
}

// ============================================
// 示例 2：用户故事生成测试
// ============================================

async function example2_UserStory() {
  console.log('\n=== 示例 2：用户故事生成测试 ===\n');

  const generator = new AITestGeneratorEnhanced({
    llm: new LLMRouter({
      zhipuApiKey: '2617ccc0befe47d097d7d8b688b8d54b.rN8AFmNCZfZsmpFu',
      defaultModel: 'glm-4',
    }),
  });

  // 用户故事
  const userStory = {
    title: '案件管理系统 - 案件查询',
    narrative: '作为一名办案人员，我想要快速查询案件信息，以便及时了解案件进展',
    acceptanceCriteria: [
      '可以通过案件编号查询案件',
      '可以通过当事人姓名查询案件',
      '查询结果应显示案件基本信息、当前状态、办理进度',
      '查询结果按时间倒序排列',
      '支持模糊查询',
      '无查询结果时显示友好提示',
    ],
  };

  console.log('用户故事:', userStory.title);
  console.log('叙述:', userStory.narrative);
  console.log('验收标准:', userStory.acceptanceCriteria.length);

  try {
    const result = await generator.generateFromUserStory(userStory, {
      includeErrorCases: true,
    });

    if (result.success) {
      console.log('\n✅ 从用户故事生成测试成功！\n');
      console.log('模块:', result.generatedTests.module);
      console.log('场景数:', result.generatedTests.scenarios.length);

      result.generatedTests.scenarios.forEach((scenario, index) => {
        console.log(`\n场景 ${index + 1}: ${scenario.name}`);
        console.log(`  Given: ${scenario.given}`);
        console.log(`  When:  ${scenario.when}`);
        console.log(`  Then:  ${scenario.then}`);
      });

      return result.generatedTests;
    } else {
      console.error('❌ 生成失败:', result.error);
      return null;
    }
  } catch (error) {
    console.error('❌ 执行失败:', error.message);
    return null;
  }
}

// ============================================
// 示例 3：需求文档生成测试
// ============================================

async function example3_RequirementDoc() {
  console.log('\n=== 示例 3：需求文档生成测试 ===\n');

  const generator = new AITestGeneratorEnhanced({
    llm: new LLMRouter({
      zhipuApiKey: '2617ccc0befe47d097d7d8b688b8d54b.rN8AFmNCZfZsmpFu',
      defaultModel: 'glm-4',
    }),
  });

  // 需求文档
  const requirementDoc = `
# 案件管理系统 - 需求文档

## 1. 功能需求

### 1.1 用户登录
- 支持用户名密码登录
- 支持记住密码功能
- 登录失败提示具体错误信息
- 密码错误超过3次锁定账户

### 1.2 案件查询
- 支持按案件编号查询
- 支持按当事人姓名查询
- 支持按时间范围查询
- 支持按案件类型查询
- 查询结果分页显示（每页20条）

### 1.3 案件详情
- 显示案件基本信息
- 显示案件办理流程
- 显示案件相关文档
- 显示案件办理记录

## 2. 非功能需求

### 2.1 性能要求
- 查询响应时间 < 2秒
- 支持100个并发用户

### 2.2 安全要求
- 所有操作需要身份验证
- 敏感操作需要二次验证
- 记录所有操作日志

### 2.3 可用性要求
- 界面简洁友好
- 操作流程清晰
- 错误提示明确
  `.trim();

  console.log('需求文档长度:', requirementDoc.length, '字符');

  try {
    const result = await generator.generateFromRequirementDoc(requirementDoc, {
      includePerformance: true,
      includeSecurity: true,
    });

    if (result.success) {
      console.log('\n✅ 从需求文档生成测试成功！\n');
      console.log('模块:', result.generatedTests.module);
      console.log('场景数:', result.generatedTests.scenarios.length);

      // 按功能分组显示
      const scenariosByFeature = {};
      result.generatedTests.scenarios.forEach(scenario => {
        const feature = scenario.name.split('-')[0].trim();
        if (!scenariosByFeature[feature]) {
          scenariosByFeature[feature] = [];
        }
        scenariosByFeature[feature].push(scenario);
      });

      Object.entries(scenariosByFeature).forEach(([feature, scenarios]) => {
        console.log(`\n【${feature}】`);
        scenarios.forEach((scenario, index) => {
          console.log(`  ${index + 1}. ${scenario.name}`);
        });
      });

      return result.generatedTests;
    } else {
      console.error('❌ 生成失败:', result.error);
      return null;
    }
  } catch (error) {
    console.error('❌ 执行失败:', error.message);
    return null;
  }
}

// ============================================
// 示例 4：智能生成（自动检测输入类型）
// ============================================

async function example4_SmartGeneration() {
  console.log('\n=== 示例 4：智能生成测试 ===\n');

  const generator = new AITestGeneratorEnhanced({
    llm: new LLMRouter({
      zhipuApiKey: '2617ccc0befe47d097d7d8b688b8d54b.rN8AFmNCZfZsmpFu',
      defaultModel: 'glm-4',
    }),
  });

  // 不同类型的输入
  const inputs = [
    // 自然语言
    '实现用户注册功能，包括手机号验证、短信验证码、密码强度检查',

    // 用户故事格式
    'As a 用户, I want to 注册账号, So that 我可以使用系统功能',

    // 需求文档格式（简化）
    '功能需求：\n1. 用户注册\n2. 手机验证\n3. 密码设置',
  ];

  console.log('输入数量:', inputs.length);

  try {
    // 批量生成
    const result = await generator.generateBatch(inputs, {
      includeErrorCases: true,
    });

    console.log('\n批量生成结果:');
    console.log(`  总数: ${result.summary.total}`);
    console.log(`  成功: ${result.summary.success}`);
    console.log(`  失败: ${result.summary.failure}`);

    result.results.forEach((item, index) => {
      if (item.success) {
        console.log(`\n输入 ${index + 1} (${item.source}):`);
        console.log(`  模块: ${item.generatedTests.module}`);
        console.log(`  场景数: ${item.generatedTests.scenarios.length}`);
      } else {
        console.log(`\n输入 ${index + 1}: 失败 - ${item.error}`);
      }
    });

    return result;
  } catch (error) {
    console.error('❌ 执行失败:', error.message);
    return null;
  }
}

// ============================================
// 示例 5：生成测试建议
// ============================================

async function example5_GenerateSuggestions() {
  console.log('\n=== 示例 5：生成测试建议 ===\n');

  const generator = new AITestGeneratorEnhanced({
    llm: new LLMRouter({
      zhipuApiKey: '2617ccc0befe47d097d7d8b688b8d54b.rN8AFmNCZfZsmpFu',
      defaultModel: 'glm-4',
    }),
  });

  const input = '实现案件管理系统，包括案件录入、查询、统计、报表功能';

  console.log('功能描述:', input);

  try {
    const result = await generator.generateSuggestions(input);

    if (result.success) {
      console.log('\n✅ 测试建议生成成功！\n');
      console.log('测试重点:', result.suggestions.focus);
      console.log('潜在风险:', result.suggestions.risks);
      console.log('建议场景:', result.suggestions.suggestedScenarios);
      console.log('测试数据:', result.suggestions.testData);
      console.log('需要性能测试:', result.suggestions.performance);

      return result.suggestions;
    } else {
      console.error('❌ 生成失败:', result.error);
      return null;
    }
  } catch (error) {
    console.error('❌ 执行失败:', error.message);
    return null;
  }
}

// ============================================
// 示例 6：完整流程（生成 + 执行）
// ============================================

async function example6_CompleteFlow() {
  console.log('\n=== 示例 6：完整流程（生成 + 执行）===\n');

  // 初始化 AI Test Agent
  const agent = new AITestAgent({
    memory: new MemoryManager({ persistToFile: true }),
    llm: new LLMRouter({
      zhipuApiKey: '2617ccc0befe47d097d7d8b688b8d54b.rN8AFmNCZfZsmpFu',
      defaultModel: 'glm-4',
    }),
  });

  // 功能描述
  const requirement = '实现用户登录功能，包括用户名密码验证、记住密码、错误提示';

  console.log('步骤 1：生成测试用例...');

  try {
    // 生成测试用例
    const generateResult = await agent.generateTests(requirement, {
      includeErrorCases: true,
      includeSecurity: true,
    });

    if (!generateResult.success) {
      console.error('❌ 生成测试用例失败:', generateResult.error);
      return;
    }

    console.log('✅ 测试用例生成成功！');
    console.log(`  模块: ${generateResult.generatedTests.module}`);
    console.log(`  场景数: ${generateResult.generatedTests.scenarios.length}`);

    // 显示生成的测试用例
    generateResult.generatedTests.scenarios.forEach((scenario, index) => {
      console.log(`\n  场景 ${index + 1}: ${scenario.name}`);
      console.log(`    Given: ${scenario.given}`);
      console.log(`    When:  ${scenario.when}`);
      console.log(`    Then:  ${scenario.then}`);
    });

    // 询问是否执行
    console.log('\n步骤 2：准备执行测试...');
    console.log('注意：实际执行需要真实的浏览器和应用');

    // 注意：这里不实际执行，因为需要真实的应用
    console.log('\n⚠️  跳过实际执行（需要真实的应用环境）');

    console.log('\n✅ 完整流程演示完成！');
    console.log('\n实际使用时：');
    console.log('1. 确保应用正在运行');
    console.log('2. 调用 agent.executeFromExcel() 或直接执行生成的测试');
    console.log('3. 查看测试报告');

    return generateResult.generatedTests;
  } catch (error) {
    console.error('❌ 执行失败:', error.message);
    return null;
  }
}

// ============================================
// 运行所有示例
// ============================================

async function runAllExamples() {
  console.log('========================================');
  console.log('AI 自动生成测试 - 完整示例');
  console.log('========================================\n');

  const examples = [
    { name: '自然语言描述', fn: example1_NaturalLanguage },
    { name: '用户故事', fn: example2_UserStory },
    { name: '需求文档', fn: example3_RequirementDoc },
    { name: '智能生成', fn: example4_SmartGeneration },
    { name: '测试建议', fn: example5_GenerateSuggestions },
    { name: '完整流程', fn: example6_CompleteFlow },
  ];

  // 选择要运行的示例
  const selectedExamples = [0, 1, 5]; // 只运行部分示例

  console.log('将运行以下示例:');
  selectedExamples.forEach(index => {
    console.log(`  ${index + 1}. ${examples[index].name}`);
  });

  for (const index of selectedExamples) {
    const example = examples[index];

    try {
      await example.fn();
    } catch (error) {
      console.error(`\n❌ 示例 "${example.name}" 执行失败:`, error.message);
    }
  }

  console.log('\n========================================');
  console.log('所有示例运行完成！');
  console.log('========================================\n');
}

// 主函数
if (require.main === module) {
  runAllExamples()
    .then(() => {
      console.log('\n✅ 所有示例执行成功！');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ 示例执行失败:', error);
      process.exit(1);
    });
}

module.exports = {
  example1_NaturalLanguage,
  example2_UserStory,
  example3_RequirementDoc,
  example4_SmartGeneration,
  example5_GenerateSuggestions,
  example6_CompleteFlow,
  runAllExamples,
};
