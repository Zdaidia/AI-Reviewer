/**
 * Visual Testing Demo
 *
 * 视觉测试功能演示
 * 展示如何使用 AI 进行视觉对比测试
 */

const VisualTestEngine = require('../src/core/testing/visual-test-engine');
const { MemoryManager } = require('../src/core/agent/memory');
const { LLMRouter } = require('../src/core/agent/llm');
const path = require('path');

// ============================================
// 示例 1: 基础视觉测试
// ============================================

async function example1_BasicVisualTest() {
  console.log('\n=== 示例 1: 基础视觉测试 ===\n');

  // 初始化视觉测试引擎
  const visualEngine = new VisualTestEngine({
    screenshotDir: './test-screenshots',
    designDir: './designs',
    enableAIDetection: true,
    // 集成 LLM 用于 AI 分析
    aiAnalyzer: {
      async analyzeImage({ imageSource, prompt }) {
        // 模拟 AI 分析（实际使用时连接真实 LLM）
        console.log(`  [AI Analysis] Analyzing image: ${path.basename(imageSource)}`);
        console.log(`  [AI Analysis] Prompt: ${prompt.substring(0, 50)}...`);

        // 返回模拟结果
        return {
          success: true,
          content: `{
            "elements": [
              {
                "name": "header",
                "type": "container",
                "position": { "x": 0, "y": 0, "width": 1920, "height": 80 },
                "visible": true
              },
              {
                "name": "title",
                "type": "text",
                "position": { "x": 100, "y": 30, "width": 400, "height": 40 },
                "content": "Welcome"
              },
              {
                "name": "button",
                "type": "button",
                "position": { "x": 1600, "y": 20, "width": 120, "height": 40 },
                "content": "Login"
              }
            ]
          }`,
        };
      },
    },
  });

  try {
    // 创建模拟设计稿
    const mockDesignPath = path.join(__dirname, 'mock-design.json');
    createMockDesign(mockDesignPath);

    console.log('✓ 创建模拟设计稿');
    console.log(`  路径: ${mockDesignPath}`);

    // 模拟执行测试（不实际访问网页）
    console.log('\n--- 执行视觉测试 ---');
    console.log('测试场景: 检查页面布局是否符合设计');
    console.log('设计稿: mock-design.json');
    console.log('目标URL: https://example.com');
    console.log('测试类型: layout');

    console.log('\n[模拟] 测试执行中...');
    console.log('  1. 加载设计稿 ✓');
    console.log('  2. 截取页面 ✓');
    console.log('  3. AI 对比分析 ✓');
    console.log('  4. 生成报告 ✓');

    // 显示模拟的测试结果
    console.log('\n--- 测试结果 ---');
    console.log('总体评分: 0.92 (92%)');
    console.log('状态: passed');
    console.log('\n详细结果:');
    console.log('  结构对比: 95% (19/20 元素匹配)');
    console.log('  元素检查: 100% (所有元素存在)');
    console.log('  布局检查: 90% (部分元素位置偏差)');
    console.log('  缺失检查: 100% (无缺失或额外元素)');

    // 清理
    if (require('fs').existsSync(mockDesignPath)) {
      require('fs').unlinkSync(mockDesignPath);
    }

    console.log('\n✅ 示例 1 完成');
    return true;
  } catch (error) {
    console.error('\n❌ 示例 1 失败:', error.message);
    return false;
  }
}

// ============================================
// 示例 2: 元素检查测试
// ============================================

async function example2_ElementCheckTest() {
  console.log('\n=== 示例 2: 元素检查测试 ===\n');

  console.log('测试场景: 验证页面元素是否与设计一致');
  console.log('设计稿: 包含按钮、表单、图片等元素');
  console.log('目标URL: https://example.com/form');
  console.log('测试类型: element');

  console.log('\n[模拟] 检查元素...');
  console.log('  ✓ 按钮 "提交" - 存在 ✓');
    console.log('    - 位置: (100, 200)');
    console.log('    - 尺寸: 120x40');
    console.log('    - 状态: 匹配');
  console.log('  ✓ 输入框 "用户名" - 存在 ✓');
    console.log('    - 位置: (100, 100)');
    console.log('    - 类型: text');
    console.log('    - 状态: 匹配');
  console.log('  ✓ 图片 "logo.png" - 存在 ✓');
    console.log('    - 位置: (20, 20)');
    console.log('    - 尺寸: 200x80');
    console.log('    - 状态: 匹配');
  console.log('  ✗ 按钮 "取消" - 缺失 ✗');
    console.log('    - 原因: 未在页面中找到');

  console.log('\n测试结果: passed (3/4 元素匹配)');

  console.log('\n✅ 示例 2 完成');
  return true;
}

// ============================================
// 示例 3: 布局验证测试
// ============================================

async function example3_LayoutValidationTest() {
  console.log('\n=== 示例 3: 布局验证测试 ===\n');

  console.log('测试场景: 验证页面布局是否符合设计规范');
  console.log('设计稿: 指定了精确的元素位置和尺寸');
  console.log('目标URL: https://example.com/dashboard');
  console.log('测试类型: layout');

  console.log('\n[模拟] 布局验证...');
  console.log('  元素: header');
  console.log('    设计位置: (0, 0, 1920, 80)');
  console.log('    实际位置: (0, 0, 1920, 80)');
  console.log('    偏差: 0px ✓');
  console.log('  元素: sidebar');
  console.log('    设计位置: (0, 80, 250, 1000)');
  console.log('    实际位置: (5, 85, 250, 1000)');
  console.log('    X偏差: 5px ⚠️');
  console.log('    Y偏差: 5px ⚠️');
  console.log('  元素: main-content');
  console.log('    设计位置: (250, 80, 1670, 1000)');
  console.log('    实际位置: (250, 80, 1660, 1000)');
  console.log('    宽度偏差: 10px ⚠️');

  console.log('\n测试结果: acceptable (平均偏差: 5px)');
  console.log('建议: sidebar 和 main-content 的位置需要微调');

  console.log('\n✅ 示例 3 完成');
  return true;
}

// ============================================
// 示例 4: 缺失元素检查
// ============================================

async function example4_MissingElementCheck() {
  console.log('\n=== 示例 4: 缺失元素检查 ===\n');

  console.log('测试场景: 检查是否有缺失或额外的元素');
  console.log('设计稿: 定义了应该存在的元素');
  console.log('目标URL: https://example.com');
  console.log('测试类型: missing');

  console.log('\n[模拟] 检查缺失元素...');
  console.log('  设计中的元素:');
  console.log('    ✓ header - 存在');
  console.log('    ✓ navigation - 存在');
  console.log('    ✓ hero-section - 存在');
  console.log('    ✗ features-section - 缺失 ✗');
  console.log('    ✓ footer - 存在');
  console.log('  额外的元素:');
  console.log('    ⚠️ promo-banner - 设计中不存在 ⚠️');

  console.log('\n问题详情:');
  console.log('  1. 缺失: features-section');
  console.log('     - 严重性: high');
  console.log('     - 建议: 添加特性展示区域');
  console.log('  2. 额外: promo-banner');
  console.log('     - 严重性: medium');
  console.log('     - 建议: 确认是否需要或移除');

  console.log('\n测试结果: failed (1 个缺失元素)');

  console.log('\n✅ 示例 4 完成');
  return true;
}

// ============================================
// 示例 5: 综合视觉测试
// ============================================

async function example5_ComprehensiveTest() {
  console.log('\n=== 示例 5: 综合视觉测试 ===\n');

  console.log('测试场景: 全面检查页面与设计的一致性');
  console.log('设计稿: 完整的页面设计');
  console.log('目标URL: https://example.com');
  console.log('测试类型: comprehensive');

  console.log('\n--- 执行综合测试 ---');

  // 1. 结构对比
  console.log('\n1. 结构对比');
  console.log('  设计元素: 25 个');
  console.log('  匹配元素: 24 个');
  console.log('  缺失元素: 1 个');
  console.log('  额外元素: 0 个');
  console.log('  评分: 0.96 (96%) ✓');

  // 2. 元素检查
  console.log('\n2. 元素检查');
  console.log('  按钮检查: 5/5 ✓');
  console.log('  表单检查: 3/3 ✓');
  console.log('  图片检查: 8/8 ✓');
  console.log('  文本检查: 9/10 ⚠️');
  console.log('  评分: 0.90 (90%)');

  // 3. 布局验证
  console.log('\n3. 布局验证');
  console.log('  对齐检查: 通过 ✓');
  console.log('  间距检查: 2 处偏差 ⚠️');
  console.log('  尺寸检查: 1 处偏差 ⚠️');
  console.log('  评分: 0.85 (85%)');

  // 4. 缺失检查
  console.log('\n4. 缺失检查');
  console.log('  缺失元素: 1 个');
  console.log('  额外元素: 0 个');
  console.log('  评分: 0.96 (96%)');

  // 总体评分
  console.log('\n--- 总体评分 ---');
  const overallScore = (0.96 + 0.90 + 0.85 + 0.96) / 4;
  console.log(`  总分: ${overallScore.toFixed(2)} (${(overallScore * 100).toFixed(0)}%)`);
  console.log(`  状态: ${overallScore >= 0.9 ? 'passed' : overallScore >= 0.7 ? 'acceptable' : 'failed'}`);

  console.log('\n改进建议:');
  console.log('  1. 修复缺失的文本内容');
  console.log('  2. 调整2处布局偏差');
  console.log('  3. 验证所有元素对齐');

  console.log('\n✅ 示例 5 完成');
  return true;
}

// ============================================
// 辅助函数
// ============================================

function createMockDesign(filePath) {
  const fs = require('fs');
  const mockDesign = {
    name: 'Mock Design',
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
              name: 'logo',
              visible: true,
              x: 20,
              y: 20,
              width: 200,
              height: 40,
              characters: 'Logo',
            },
            {
              type: 'TEXT',
              name: 'title',
              visible: true,
              x: 250,
              y: 20,
              width: 400,
              height: 40,
              characters: 'Page Title',
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
              name: 'button',
              visible: true,
              x: 100,
              y: 100,
              width: 120,
              height: 40,
              children: [
                {
                  type: 'TEXT',
                  name: 'button-text',
                  visible: true,
                  characters: 'Click Me',
                },
              ],
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
  console.log('Visual Testing Demo');
  console.log('========================================');
  console.log('展示如何使用 AI 进行视觉对比测试\n');

  const examples = [
    { name: '基础视觉测试', fn: example1_BasicVisualTest },
    { name: '元素检查测试', fn: example2_ElementCheckTest },
    { name: '布局验证测试', fn: example3_LayoutValidationTest },
    { name: '缺失元素检查', fn: example4_MissingElementCheck },
    { name: '综合视觉测试', fn: example5_ComprehensiveTest },
  ];

  // 运行所有示例
  for (const example of examples) {
    try {
      await example.fn();
    } catch (error) {
      console.error(`\n❌ 示例 "${example.name}" 失败:`, error.message);
    }
  }

  console.log('\n========================================');
  console.log('所有示例运行完成！');
  console.log('========================================\n');

  console.log('视觉测试的关键功能：');
  console.log('  1. 结构对比 - 检查页面结构是否符合设计');
  console.log('  2. 元素检查 - 验证所有元素都存在');
  console.log('  3. 布局验证 - 确保元素位置和尺寸正确');
  console.log('  4. 缺失检查 - 发现缺失或额外的元素');
  console.log('  5. 综合测试 - 全面评估页面质量');

  console.log('\n实际使用时：');
  console.log('  1. 准备设计稿（Figma JSON 或图片）');
  console.log('  2. 配置 AI 分析器（LLM）');
  console.log('  3. 运行视觉测试引擎');
  console.log('  4. 查看测试报告并修复问题');
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
  example1_BasicVisualTest,
  example2_ElementCheckTest,
  example3_LayoutValidationTest,
  example4_MissingElementCheck,
  example5_ComprehensiveTest,
  runAllExamples,
};
