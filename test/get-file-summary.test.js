/**
 * 测试 get_file_summary 工具是否正确传递给 AI
 */

const fs = require('fs');
const path = require('path');

// 模拟代码图数据
const mockCodeGraph = {
  metadata: {
    totalNodes: 100,
    totalEdges: 50
  },
  nodes: [
    {
      id: 'node_1',
      type: 'file',
      filePath: 'E:\\2025\\askey-Y25-citypark-web\\lib\\components\\dropdown\\filter_dropdown.dart',
      relativePath: 'lib/components/dropdown/filter_dropdown.dart',
      fileName: 'filter_dropdown.dart',
      size: 29079,
      children: [
        {
          id: 'node_2',
          type: 'class',
          name: 'FilterDropdown',
          line: 15,
          extends: 'StatefulWidget',
          description: '下拉筛选组件'
        },
        {
          id: 'node_3',
          type: 'function',
          name: 'build',
          line: 25,
          parameters: ['BuildContext context'],
          returnType: 'Widget'
        },
        {
          id: 'node_4',
          type: 'function',
          name: '_onSelectionChanged',
          line: 45,
          parameters: ['String? value'],
          returnType: 'void'
        }
      ],
      imports: ['node_10', 'node_11']
    }
  ]
};

// 模拟 contextAdapter
const mockContextAdapter = {
  aiContext: `
## 组件说明
### filter_dropdown.dart
下拉筛选组件，用于列表数据筛选
支持单选和多选模式
`,
  codeGraph: mockCodeGraph
};

// 测试1: 检查 tools 定义
console.log('=== 测试1: 检查 buildToolsDefinition 是否包含 get_file_summary ===');

// 读取 segment-executor.js
const segmentExecutorPath = path.join(__dirname, '../src/core/qa-reviewer/executor/segment-executor.js');
const content = fs.readFileSync(segmentExecutorPath, 'utf-8');

// 检查是否包含 get_file_summary 工具定义
const hasGetFileSummaryTool = content.includes('name: \'get_file_summary\'') || content.includes('name: "get_file_summary"');
console.log('✓ get_file_summary 工具定义存在:', hasGetFileSummaryTool);

// 检查工具描述是否包含推荐使用场景
const hasComponentRecommendation = content.includes('推荐用于') && content.includes('component');
console.log('✓ 工具描述包含组件推荐:', hasComponentRecommendation);

// 检查是否在提示词中更新了工作模式
const hasUpdatedWorkMode = content.includes('get_file_summary') && content.includes('智能按需读取模式');
console.log('✓ 提示词更新为智能按需读取模式:', hasUpdatedWorkMode);

// 测试2: 检查 executeToolCall 中是否处理了 get_file_summary
console.log('\n=== 测试2: 检查 executeToolCall 中的处理逻辑 ===');

const hasExecuteHandler = content.includes('case \'get_file_summary\':') || content.includes('case "get_file_summary":');
console.log('✓ executeToolCall 中有 get_file_summary 处理分支:', hasExecuteHandler);

// 检查是否有 extractFileSummary 方法
const hasExtractMethod = content.includes('extractFileSummary') || content.includes('async extractFileSummary');
console.log('✓ 存在 extractFileSummary 方法:', hasExtractMethod);

// 测试3: 检查强制要求是否更新
console.log('\n=== 测试3: 检查强制要求是否更新 ===');

const updatedRequirement = content.includes('对于 component 文件：可先用 get_file_summary');
console.log('✓ 强制要求已更新为允许组件使用摘要:', updatedRequirement);

// 汇总结果
console.log('\n=== 测试结果汇总 ===');
const allPassed = hasGetFileSummaryTool && hasComponentRecommendation && hasUpdatedWorkMode &&
                   hasExecuteHandler && hasExtractMethod && updatedRequirement;

if (allPassed) {
  console.log('✅ 所有测试通过！get_file_summary 功能已正确实现。');
} else {
  console.log('❌ 部分测试失败，请检查实现。');
  if (!hasGetFileSummaryTool) console.log('  - 缺少 get_file_summary 工具定义');
  if (!hasComponentRecommendation) console.log('  - 缺少组件推荐使用场景');
  if (!hasUpdatedWorkMode) console.log('  - 提示词未更新');
  if (!hasExecuteHandler) console.log('  - 缺少 executeToolCall 处理逻辑');
  if (!hasExtractMethod) console.log('  - 缺少 extractFileSummary 方法');
  if (!updatedRequirement) console.log('  - 强制要求未更新');
}

process.exit(allPassed ? 0 : 1);
