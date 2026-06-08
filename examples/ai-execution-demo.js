/**
 * AI Execution Model Demo
 *
 * 演示核心升级点：测试不是"生成脚本"，而是"Agent执行"
 *
 * 执行模型：
 * while (test not finished):
 *   1. 观察页面（DOM / screenshot）
 *   2. 理解当前状态
 *   3. 决定下一步操作
 *   4. 执行操作
 *   5. 验证结果
 */

const AIExecutionEngine = require('../src/core/testing/ai-execution-engine');
const path = require('path');

// ============================================
// 示例 1: 基础 AI 执行
// ============================================

async function example1_BasicAIExecution() {
  console.log('\n=== 示例 1: 基础 AI 执行 ===\n');

  const engine = new AIExecutionEngine({
    screenshotDir: path.join(__dirname, 'test-screenshots'),
    enableSelfCorrection: true,
    enableExploration: false,
    maxIterations: 20,
  });

  try {
    await engine.init({ headless: true });

    console.log('✓ 执行引擎初始化完成\n');

    // 定义测试目标
    const goal = {
      description: '用户登录系统',
      startUrl: 'https://example.com/login',
      steps: [
        {
          description: '输入用户名',
          target: '#username',
          value: 'testuser@example.com',
        },
        {
          description: '输入密码',
          target: '#password',
          value: 'password123',
        },
        {
          description: '点击登录按钮',
          target: '#login-button',
        },
      ],
      targetUrl: 'https://example.com/dashboard', // 成功后应该到达的页面
      successCriteria: {
        urlContains: '/dashboard',
        elementVisible: '.welcome-message',
      },
    };

    console.log('--- 测试目标 ---');
    console.log(`描述: ${goal.description}`);
    console.log(`起始 URL: ${goal.startUrl}`);
    console.log(`目标 URL: ${goal.targetUrl}`);
    console.log(`步骤数: ${goal.steps.length}`);

    console.log('\n--- 开始 AI 执行循环 ---\n');

    // 执行测试
    const result = await engine.execute(goal, {
      verbose: true,
    });

    console.log('\n--- 执行结果 ---\n');
    console.log(`状态: ${result.status}`);
    console.log(`成功: ${result.success ? '✓' : '✗'}`);
    console.log(`迭代次数: ${result.iterations}`);
    console.log(`执行时间: ${(result.duration / 1000).toFixed(2)}s`);

    if (result.decisions && result.decisions.length > 0) {
      console.log('\n--- 决策历史 ---\n');
      result.decisions.forEach((decision, index) => {
        console.log(`${index + 1}. ${decision.action}`);
        console.log(`   目标: ${decision.target || 'N/A'}`);
        console.log(`   推理: ${decision.reasoning || 'N/A'}`);
        console.log(`   置信度: ${(decision.confidence * 100).toFixed(0)}%`);
        console.log(`   关键: ${decision.critical ? '是' : '否'}`);
      });
    }

    if (result.actions && result.actions.length > 0) {
      console.log('\n--- 操作历史 ---\n');
      result.actions.forEach((action, index) => {
        const status = action.success ? '✓' : '✗';
        console.log(`${index + 1}. ${status} ${action.action}`);
        if (action.error) {
          console.log(`   错误: ${action.error}`);
        }
      });
    }

    if (result.verifications && result.verifications.length > 0) {
      console.log('\n--- 验证历史 ---\n');
      result.verifications.forEach((verification, index) => {
        const status = verification.passed ? '✓' : '✗';
        console.log(`${index + 1}. ${status} 验证`);
        console.log(`   期望: ${verification.expectations?.length || 0}`);
        console.log(`   失败: ${verification.failures?.length || 0}`);
      });
    }

    if (result.errors && result.errors.length > 0) {
      console.log('\n--- 错误 ---\n');
      result.errors.forEach((error, index) => {
        console.log(`${index + 1}. 迭代 ${error.iteration}`);
        console.log(`   操作: ${error.action}`);
        console.log(`   错误: ${error.error}`);
      });
    }

    console.log('\n✅ 示例 1 完成');
    return true;
  } catch (error) {
    console.error('\n❌ 示例 1 失败:', error.message);
    return false;
  } finally {
    await engine.cleanup();
  }
}

// ============================================
// 示例 2: AI 自我纠正
// ============================================

async function example2_SelfCorrection() {
  console.log('\n=== 示例 2: AI 自我纠正 ===\n');

  const engine = new AIExecutionEngine({
    screenshotDir: path.join(__dirname, 'test-screenshots'),
    enableSelfCorrection: true,
    maxIterations: 15,
  });

  try {
    await engine.init({ headless: true });

    console.log('✓ 执行引擎初始化完成（启用自我纠正）\n');

    const goal = {
      description: '查找并点击动态加载的按钮',
      startUrl: 'https://example.com',
      targetUrl: 'https://example.com/success',
      successCriteria: {
        elementVisible: '.success',
      },
    };

    console.log('--- 测试目标 ---');
    console.log(`描述: ${goal.description}`);
    console.log('场景: 按钮可能延迟加载，需要 AI 等待并重试');

    console.log('\n--- 开始 AI 执行（含自我纠正） ---\n');

    const result = await engine.execute(goal);

    console.log('\n--- 执行结果 ---\n');
    console.log(`状态: ${result.status}`);
    console.log(`迭代次数: ${result.iterations}`);

    // 检查是否有自我纠正
    let correctionCount = 0;
    result.actions?.forEach(action => {
      if (action.afterState?.url !== action.beforeState?.url) {
        correctionCount++;
      }
    });

    console.log(`自我纠正次数: ${correctionCount}`);

    console.log('\n说明: AI 检测到元素未找到时，自动等待并重试');
    console.log('不是预生成脚本，而是实时观察和决策');

    console.log('\n✅ 示例 2 完成');
    return true;
  } catch (error) {
    console.error('\n❌ 示例 2 失败:', error.message);
    return false;
  } finally {
    await engine.cleanup();
  }
}

// ============================================
// 示例 3: AI 探索模式
// ============================================

async function example3_ExplorationMode() {
  console.log('\n=== 示例 3: AI 探索模式 ===\n');

  const engine = new AIExecutionEngine({
    screenshotDir: path.join(__dirname, 'test-screenshots'),
    enableExploration: true,
    maxIterations: 10,
  });

  try {
    await engine.init({ headless: true });

    console.log('✓ 执行引擎初始化完成（启用探索模式）\n');

    const goal = {
      description: '探索页面并找到所有可交互元素',
      startUrl: 'https://example.com',
      successCriteria: {
        exploredElements: 5,
      },
    };

    console.log('--- 测试目标 ---');
    console.log(`描述: ${goal.description}`);
    console.log('场景: AI 不知道具体步骤，需要探索页面');

    console.log('\n--- 开始 AI 探索 ---\n');

    const result = await engine.execute(goal);

    console.log('\n--- 探索结果 ---\n');
    console.log(`状态: ${result.status}`);
    console.log(`迭代次数: ${result.iterations}`);

    // 统计探索到的元素
    let exploreActions = 0;
    result.actions?.forEach(action => {
      if (action.action === 'explore') {
        exploreActions++;
      }
    });

    console.log(`探索次数: ${exploreActions}`);

    console.log('\n说明: AI 主动探索页面，发现可交互元素');
    console.log('不是按照预定义路径，而是根据实际情况决策');

    console.log('\n✅ 示例 3 完成');
    return true;
  } catch (error) {
    console.error('\n❌ 示例 3 失败:', error.message);
    return false;
  } finally {
    await engine.cleanup();
  }
}

// ============================================
// 示例 4: 对比 - 生成脚本 vs AI 执行
// ============================================

async function example4_Comparison() {
  console.log('\n=== 示例 4: 对比 - 生成脚本 vs AI 执行 ===\n');

  console.log('--- 传统方式：生成脚本 ---\n');
  console.log('1. 分析需求');
  console.log('2. 生成测试脚本');
  console.log('3. 执行脚本');
  console.log('4. 报告结果');
  console.log('');
  console.log('问题:');
  console.log('  ✗ 脚本生成后无法改变');
  console.log('  ✗ 无法应对意外情况');
  console.log('  ✗ 动态元素处理困难');
  console.log('  ✗ 维护成本高');

  console.log('\n--- AI 执行方式：Agent 执行 ---\n');
  console.log('while (test not finished):');
  console.log('  1. 观察页面（DOM / screenshot）');
  console.log('  2. 理解当前状态');
  console.log('  3. 决定下一步操作');
  console.log('  4. 执行操作');
  console.log('  5. 验证结果');
  console.log('');
  console.log('优势:');
  console.log('  ✓ 实时决策，灵活应对');
  console.log('  ✓ 自动纠错和恢复');
  console.log('  ✓ 智能探索未知');
  console.log('  ✓ 无需预生成脚本');

  console.log('\n--- 实际对比 ---\n');

  // 模拟传统方式的限制
  console.log('场景: 页面加载延迟，按钮 3 秒后才出现');
  console.log('');
  console.log('传统方式:');
  console.log('  1. 生成脚本: click("#button")');
  console.log('  2. 执行脚本');
  console.log('  3. ✗ 失败: 元素未找到');
  console.log('  4. 需要手动修改脚本，添加等待');
  console.log('');
  console.log('AI 执行方式:');
  console.log('  1. 观察页面: 元素不存在');
  console.log('  2. 理解状态: 页面可能还在加载');
  console.log('  3. 决定操作: 等待 2 秒后重试');
  console.log('  4. 执行操作: 等待...');
  console.log('  5. 验证结果: 元素出现，点击成功');
  console.log('  ✓ 自动完成，无需人工干预');

  console.log('\n✅ 示例 4 完成（演示）');
  return true;
}

// ============================================
// 示例 5: 完整工作流 - AI 执行集成到测试流程
// ============================================

async function example5_IntegratedWorkflow() {
  console.log('\n=== 示例 5: 完整工作流 - AI 执行集成 ===\n');

  const engine = new AIExecutionEngine({
    screenshotDir: path.join(__dirname, 'test-screenshots'),
    enableSelfCorrection: true,
    enableExploration: true,
    maxIterations: 30,
  });

  try {
    await engine.init({ headless: true });

    console.log('✓ 执行引擎初始化完成\n');

    // 定义完整的测试场景
    const testScenarios = [
      {
        name: '登录流程',
        goal: {
          description: '用户成功登录系统',
          startUrl: 'https://example.com/login',
          targetUrl: 'https://example.com/dashboard',
        },
      },
      {
        name: '数据查询',
        goal: {
          description: '查询并显示数据',
          startUrl: 'https://example.com/dashboard',
          successCriteria: {
            dataLoaded: true,
          },
        },
      },
    ];

    console.log('--- 测试场景 ---\n');
    testScenarios.forEach((scenario, index) => {
      console.log(`${index + 1}. ${scenario.name}`);
      console.log(`   ${scenario.goal.description}`);
    });

    console.log('\n--- 执行所有场景 ---\n');

    const results = [];

    for (const scenario of testScenarios) {
      console.log(`\n执行: ${scenario.name}`);

      const result = await engine.execute(scenario.goal, {
        verbose: false,
      });

      results.push({
        name: scenario.name,
        result: result,
      });

      console.log(`  状态: ${result.status}`);
      console.log(`  迭代: ${result.iterations}`);
      console.log(`  耗时: ${(result.duration / 1000).toFixed(2)}s`);
    }

    console.log('\n--- 总体结果 ---\n');
    const passed = results.filter(r => r.result.success).length;
    const failed = results.filter(r => !r.result.success).length;

    console.log(`总场景: ${results.length}`);
    console.log(`通过: ${passed}`);
    console.log(`失败: ${failed}`);
    console.log(`通过率: ${((passed / results.length) * 100).toFixed(0)}%`);

    // 生成报告
    console.log('\n--- 生成报告 ---\n');
    const report = {
      timestamp: new Date().toISOString(),
      totalScenarios: results.length,
      passedScenarios: passed,
      failedScenarios: failed,
      passRate: ((passed / results.length) * 100).toFixed(0) + '%',
      scenarios: results.map(r => ({
        name: r.name,
        status: r.result.status,
        success: r.result.success,
        iterations: r.result.iterations,
        duration: r.result.duration,
      })),
    };

    console.log('报告已生成（JSON 格式）');
    console.log(JSON.stringify(report, null, 2));

    console.log('\n✅ 示例 5 完成');
    return true;
  } catch (error) {
    console.error('\n❌ 示例 5 失败:', error.message);
    return false;
  } finally {
    await engine.cleanup();
  }
}

// ============================================
// 运行所有示例
// ============================================

async function runAllExamples() {
  console.log('========================================');
  console.log('AI Execution Model Demo');
  console.log('========================================');
  console.log('核心升级点：测试不是"生成脚本"，而是"Agent执行"\n');

  const examples = [
    { name: '基础 AI 执行', fn: example1_BasicAIExecution },
    { name: 'AI 自我纠正', fn: example2_SelfCorrection },
    { name: 'AI 探索模式', fn: example3_ExplorationMode },
    { name: '对比 - 生成脚本 vs AI 执行', fn: example4_Comparison },
    { name: '完整工作流', fn: example5_IntegratedWorkflow },
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

    // 示例之间稍作停顿
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n========================================');
  console.log('所有示例运行完成！');
  console.log('========================================\n');
  console.log(`结果: ${passed} 通过, ${failed} 失败`);

  console.log('\n核心要点总结：');
  console.log('  1. ✓ AI 实时决策，不是预生成脚本');
  console.log('  2. ✓ 每一步都基于当前状态观察');
  console.log('  3. ✓ 可以应对意外情况和动态元素');
  console.log('  4. ✓ 自动纠错和恢复机制');
  console.log('  5. ✓ 智能探索未知路径');
  console.log('  6. ✓ 观察→理解→决策→执行→验证 循环');

  console.log('\n与传统的"生成脚本"方式的本质区别：');
  console.log('  传统: 分析 → 生成脚本 → 执行脚本 → 报告');
  console.log('  AI:   观察 → 理解 → 决策 → 执行 → 验证 (循环)');
  console.log('');
  console.log('这是一个质的飞跃：从静态脚本到智能 Agent！');
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
  example1_BasicAIExecution,
  example2_SelfCorrection,
  example3_ExplorationMode,
  example4_Comparison,
  example5_IntegratedWorkflow,
  runAllExamples,
};
