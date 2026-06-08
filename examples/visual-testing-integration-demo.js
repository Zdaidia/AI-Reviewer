/**
 * Visual Testing Integration Demo
 *
 * 演示视觉测试如何整合到两个测试模式中：
 * - 模式 1: BDD 测试执行 (ai-test-agent.js)
 * - 模式 2: AI 测试生成 (ai-test-generator-complete.js)
 */

const AITestAgent = require('../src/core/testing/ai-test-agent');
const AITestGeneratorComplete = require('../src/core/testing/ai-test-generator-complete');
const { MemoryManager } = require('../src/core/agent/memory');
const { LLMRouter } = require('../src/core/agent/llm');
const path = require('path');
const fs = require('fs');

// ============================================
// 示例 1: 视觉测试整合到 BDD 测试执行
// ============================================

async function example1_VisualTestInBDDExecution() {
  console.log('\n=== 示例 1: 视觉测试整合到 BDD 测试执行 ===\n');

  try {
    // 初始化 AI Test Agent（包含 VisualTestEngine）
    const testAgent = new AITestAgent({
      screenshotDir: path.join(__dirname, 'test-screenshots'),
      designDir: path.join(__dirname, 'designs'),
      headless: true,
    });

    console.log('✓ AI Test Agent 初始化完成');
    console.log('  - 已集成 VisualTestEngine');
    console.log('  - 支持执行视觉测试');

    // 创建模拟设计稿
    const mockDesignPath = path.join(__dirname, 'mock-design.json');
    createMockDesignFile(mockDesignPath);

    console.log('\n✓ 创建模拟设计稿');
    console.log(`  路径: ${mockDesignPath}`);

    // 执行视觉测试
    console.log('\n--- 执行视觉测试 ---');
    console.log('测试场景: 检查页面布局是否符合设计');
    console.log('设计稿: mock-design.json');
    console.log('目标URL: https://example.com');
    console.log('测试类型: comprehensive');

    const visualTestResult = await testAgent.executeVisualTest(
      mockDesignPath,
      'https://example.com',
      {
        testType: 'comprehensive',
        threshold: 0.8,
        enableAIDetection: true,
        saveScreenshots: true,
      }
    );

    console.log('\n--- 测试结果 ---');
    if (visualTestResult.success) {
      console.log(`✓ 视觉测试执行成功`);
      console.log(`  总体评分: ${(visualTestResult.comparison?.overallScore * 100).toFixed(1)}%`);
      console.log(`  测试状态: ${visualTestResult.comparison?.overallStatus}`);
    } else {
      console.log(`✗ 视觉测试执行失败: ${visualTestResult.error}`);
    }

    // 生成测试报告
    console.log('\n--- 生成测试报告 ---');
    const report = testAgent.generateReport(visualTestResult, 'markdown');
    console.log('✓ 测试报告已生成（Markdown 格式）');

    // 清理
    if (fs.existsSync(mockDesignPath)) {
      fs.unlinkSync(mockDesignPath);
    }

    await testAgent.cleanup();

    console.log('\n✅ 示例 1 完成');
    return true;
  } catch (error) {
    console.error('\n❌ 示例 1 失败:', error.message);
    return false;
  }
}

// ============================================
// 示例 2: 批量视觉测试
// ============================================

async function example2_BatchVisualTests() {
  console.log('\n=== 示例 2: 批量视觉测试 ===\n');

  try {
    const testAgent = new AITestAgent({
      screenshotDir: path.join(__dirname, 'test-screenshots'),
      designDir: path.join(__dirname, 'designs'),
      headless: true,
    });

    console.log('✓ AI Test Agent 初始化完成');

    // 准备批量测试用例
    const mockDesignPath1 = path.join(__dirname, 'mock-design-1.json');
    const mockDesignPath2 = path.join(__dirname, 'mock-design-2.json');
    createMockDesignFile(mockDesignPath1);
    createMockDesignFile(mockDesignPath2);

    const testCases = [
      {
        designPath: mockDesignPath1,
        url: 'https://example.com/page1',
        testType: 'structure',
      },
      {
        designPath: mockDesignPath2,
        url: 'https://example.com/page2',
        testType: 'layout',
      },
    ];

    console.log('\n--- 执行批量视觉测试 ---');
    console.log(`测试用例数: ${testCases.length}`);

    const batchResult = await testAgent.executeBatchVisualTests(testCases, {
      threshold: 0.8,
      onProgress: (progress) => {
        console.log(`  进度: ${progress.completed}/${progress.total}`);
      },
    });

    console.log('\n--- 批量测试结果 ---');
    console.log(`✓ 总测试数: ${batchResult.total}`);
    console.log(`  通过: ${batchResult.passed}`);
    console.log(`  可接受: ${batchResult.acceptable}`);
    console.log(`  失败: ${batchResult.failed}`);
    console.log(`  通过率: ${((batchResult.passed / batchResult.total) * 100).toFixed(1)}%`);

    // 生成报告
    const report = testAgent.generateReport(batchResult, 'markdown');
    console.log('\n✓ 批量测试报告已生成');

    // 清理
    [mockDesignPath1, mockDesignPath2].forEach(p => {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    });

    await testAgent.cleanup();

    console.log('\n✅ 示例 2 完成');
    return true;
  } catch (error) {
    console.error('\n❌ 示例 2 失败:', error.message);
    return false;
  }
}

// ============================================
// 示例 3: 视觉测试整合到 AI 测试生成
// ============================================

async function example3_VisualTestInAIGeneration() {
  console.log('\n=== 示例 3: 视觉测试整合到 AI 测试生成 ===\n');

  try {
    // 初始化 AI 测试生成器
    const generator = new AITestGeneratorComplete({
      llm: null, // 实际使用时需要配置 LLM
      memory: null,
    });

    console.log('✓ AI 测试生成器初始化完成');

    // 模拟输入（包含设计稿）
    const input = {
      sourceType: 'figma', // 使用 Figma 作为输入源
      content: {
        description: '用户可以查看案件列表，点击进入详情页',
        designFiles: [
          {
            pageName: '案件列表页',
            designPath: './designs/case-list.json',
            url: 'https://example.com/cases',
          },
          {
            pageName: '案件详情页',
            designPath: './designs/case-detail.json',
            url: 'https://example.com/cases/:id',
          },
        ],
      },
    };

    console.log('\n--- AI 生成测试用例（包含视觉测试） ---');
    console.log('输入需求: 用户可以查看案件列表，点击进入详情页');
    console.log('输入类型: Figma 设计稿');
    console.log('启用视觉测试: true');

    // 生成测试用例（包含视觉测试）
    const result = await generator.generate(input, {
      includeFunctional: true,
      includeUI: true,
      includeBoundary: true,
      includeException: true,
      includeVisual: true, // 启用视觉测试生成
    });

    if (result.success) {
      console.log('\n--- 测试用例生成结果 ---');
      console.log(`✓ 总测试用例数: ${result.testCases.summary.total}`);
      console.log(`  - 功能测试: ${result.testCases.summary.functional}`);
      console.log(`  - UI 测试: ${result.testCases.summary.ui}`);
      console.log(`  - 边界测试: ${result.testCases.summary.boundary}`);
      console.log(`  - 异常测试: ${result.testCases.summary.exception}`);
      console.log(`  - 视觉测试: ${result.testCases.summary.visual} ⭐`);

      console.log('\n--- 生成的视觉测试用例 ---');
      const visualTests = result.testCases.byType.visual;
      if (visualTests && visualTests.length > 0) {
        visualTests.forEach((test, index) => {
          console.log(`\n${index + 1}. ${test.name}`);
          console.log(`   类型: ${test.subType}`);
          console.log(`   优先级: ${test.priority}`);
          console.log(`   Given: ${test.given}`);
          console.log(`   When: ${test.when}`);
          console.log(`   Then: ${test.then}`);
          if (test.metadata) {
            console.log(`   元数据: ${JSON.stringify(test.metadata)}`);
          }
        });
      } else {
        console.log('  (无视觉测试用例生成 - 因为没有 LLM 进行页面分析)');
      }

      console.log('\n--- BDD 格式输出 ---');
      console.log('模块: AI 生成的测试');
      console.log('场景数:', result.testCases.bddFormat.scenarios.length);
      console.log('\n前 3 个场景:');
      result.testCases.bddFormat.scenarios.slice(0, 3).forEach((scenario, index) => {
        console.log(`\n${index + 1}. ${scenario.name}`);
        console.log(`   Given: ${scenario.given}`);
        console.log(`   When: ${scenario.when}`);
        console.log(`   Then: ${scenario.then}`);
      });
    } else {
      console.log(`\n✗ 测试用例生成失败: ${result.error}`);
    }

    console.log('\n✅ 示例 3 完成');
    return true;
  } catch (error) {
    console.error('\n❌ 示例 3 失败:', error.message);
    return false;
  }
}

// ============================================
// 示例 4: 完整的测试流程（BDD + 视觉）
// ============================================

async function example4_CompleteWorkflow() {
  console.log('\n=== 示例 4: 完整的测试流程（BDD + 视觉） ===\n');

  try {
    const testAgent = new AITestAgent({
      screenshotDir: path.join(__dirname, 'test-screenshots'),
      designDir: path.join(__dirname, 'designs'),
      headless: true,
    });

    const generator = new AITestGeneratorComplete({
      llm: null,
      memory: null,
    });

    console.log('✓ 初始化完成');
    console.log('  - AI Test Agent (支持 BDD 和视觉测试)');
    console.log('  - AI Test Generator (生成包含视觉测试的用例)');

    // 步骤 1: 生成测试用例
    console.log('\n--- 步骤 1: AI 生成测试用例 ---');
    const requirement = '用户可以查看案件列表，点击进入详情页';

    console.log(`需求: ${requirement}`);

    const genResult = await generator.generate(
      {
        sourceType: 'requirement',
        content: requirement,
      },
      {
        includeFunctional: true,
        includeUI: true,
        includeBoundary: false,
        includeException: false,
        includeVisual: false, // 纯需求输入不生成视觉测试
      }
    );

    if (genResult.success) {
      console.log(`✓ 生成 ${genResult.testCases.summary.total} 个测试用例`);
    }

    // 步骤 2: 添加视觉测试
    console.log('\n--- 步骤 2: 添加视觉测试 ---');
    console.log('准备设计稿...');

    const mockDesignPath = path.join(__dirname, 'mock-design-complete.json');
    createMockDesignFile(mockDesignPath);

    console.log('✓ 设计稿准备完成');
    console.log('  可以使用 executeVisualTest() 执行视觉测试');

    // 步骤 3: 执行视觉测试
    console.log('\n--- 步骤 3: 执行视觉测试 ---');
    const visualResult = await testAgent.executeVisualTest(
      mockDesignPath,
      'https://example.com/cases',
      {
        testType: 'comprehensive',
      }
    );

    if (visualResult.success) {
      console.log('✓ 视觉测试执行完成');
      console.log(`  评分: ${(visualResult.comparison?.overallScore * 100).toFixed(1)}%`);
    }

    // 步骤 4: 生成综合报告
    console.log('\n--- 步骤 4: 生成综合报告 ---');

    const functionalReport = testAgent.generateReport(
      {
        type: 'functional',
        totalScenarios: genResult.testCases?.summary.total || 0,
        passedScenarios: genResult.testCases?.summary.functional || 0,
        failedScenarios: 0,
        skippedScenarios: 0,
        duration: 5000,
      },
      'markdown'
    );

    const visualReport = testAgent.generateReport(visualResult, 'markdown');

    console.log('✓ 功能测试报告已生成');
    console.log('✓ 视觉测试报告已生成');
    console.log('\n综合报告包含:');
    console.log('  - BDD 功能测试用例');
    console.log('  - 视觉测试结果');
    console.log('  - 测试覆盖率分析');

    // 清理
    if (fs.existsSync(mockDesignPath)) {
      fs.unlinkSync(mockDesignPath);
    }

    await testAgent.cleanup();

    console.log('\n✅ 示例 4 完成');
    return true;
  } catch (error) {
    console.error('\n❌ 示例 4 失败:', error.message);
    return false;
  }
}

// ============================================
// 辅助函数
// ============================================

function createMockDesignFile(filePath) {
  const mockDesign = {
    name: 'Mock Design for Integration Test',
    version: '1.0',
    document: {
      type: 'DOCUMENT',
      name: 'Page',
      children: [
        {
          type: 'FRAME',
          name: 'header',
          visible: true,
          x: 0,
          y: 0,
          width: 1920,
          height: 80,
          children: [
            {
              type: 'TEXT',
              name: 'title',
              visible: true,
              x: 20,
              y: 20,
              width: 200,
              height: 40,
              characters: 'Case Management',
            },
          ],
        },
        {
          type: 'FRAME',
          name: 'content',
          visible: true,
          x: 0,
          y: 80,
          width: 1920,
          height: 1000,
          children: [
            {
              type: 'FRAME',
              name: 'case-list',
              visible: true,
              x: 100,
              y: 100,
              width: 1720,
              height: 900,
            },
          ],
        },
      ],
    },
  };

  fs.writeFileSync(filePath, JSON.stringify(mockDesign, null, 2), 'utf8');
}

// ============================================
// 运行所有示例
// ============================================

async function runAllExamples() {
  console.log('========================================');
  console.log('Visual Testing Integration Demo');
  console.log('========================================');
  console.log('演示视觉测试如何整合到两个测试模式中\n');

  const examples = [
    { name: '视觉测试整合到 BDD 测试执行', fn: example1_VisualTestInBDDExecution },
    { name: '批量视觉测试', fn: example2_BatchVisualTests },
    { name: '视觉测试整合到 AI 测试生成', fn: example3_VisualTestInAIGeneration },
    { name: '完整的测试流程（BDD + 视觉）', fn: example4_CompleteWorkflow },
  ];

  let passed = 0;
  let failed = 0;

  for (const example of examples) {
    try {
      const success = await example.fn();
      if (success) {
        passed++;
      } else {
        failed++;
      }
    } catch (error) {
      console.error(`\n❌ 示例 "${example.name}" 异常:`, error.message);
      failed++;
    }
  }

  console.log('\n========================================');
  console.log('所有示例运行完成！');
  console.log('========================================\n');
  console.log(`结果: ${passed} 通过, ${failed} 失败`);

  console.log('\n视觉测试整合要点：');
  console.log('  1. ✓ VisualTestEngine 已集成到 AITestAgent');
  console.log('  2. ✓ AITestAgent 提供 executeVisualTest() 方法');
  console.log('  3. ✓ AITestAgent 提供 executeBatchVisualTests() 方法');
  console.log('  4. ✓ AITestGeneratorComplete 支持生成视觉测试用例');
  console.log('  5. ✓ 测试报告支持功能测试和视觉测试');

  console.log('\n使用方式：');
  console.log('  模式 1 - BDD 测试执行:');
  console.log('    const agent = new AITestAgent();');
  console.log('    await agent.executeVisualTest(designPath, url, options);');
  console.log('');
  console.log('  模式 2 - AI 测试生成:');
  console.log('    const generator = new AITestGeneratorComplete();');
  console.log('    await generator.generate(input, { includeVisual: true });');
  console.log('');
  console.log('视觉测试不是独立模块，而是整合到两个测试模式中的功能！');
}

// 主函数
if (require.main === module) {
  runAllExamples()
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
  example1_VisualTestInBDDExecution,
  example2_BatchVisualTests,
  example3_VisualTestInAIGeneration,
  example4_CompleteWorkflow,
  runAllExamples,
};
