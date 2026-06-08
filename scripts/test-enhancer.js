/**
 * 测试 TestContextEnhancer
 */

const { LLMRouter } = require('../src/core/agent/llm');
const TestContextEnhancer = require('../src/core/testing/test-context-enhancer');
const fs = require('fs');
const path = require('path');

async function test() {
  console.log('开始测试 TestContextEnhancer...');

  // 初始化 LLM
  const llmRouter = new LLMRouter({
    zhipuApiKey: '2617ccc0befe47d097d7d8b688b8d54b.rN8AFmNCZfZsmpFu'
  });

  // 创建增强器
  const enhancer = new TestContextEnhancer(llmRouter);

  // 读取代码图
  const codeGraphPath = 'D:/dev-quality-inspector-data/AI_Scan_file/askey-Y25-citypark-web/.code-graph.json';
  const aiContextPath = 'D:/dev-quality-inspector-data/AI_Scan_file/askey-Y25-citypark-web/askey-Y25-citypark-web_AI_CONTEXT.md';

  console.log('读取代码图...');
  const codeGraph = JSON.parse(fs.readFileSync(codeGraphPath, 'utf-8'));

  console.log('代码图节点数:', codeGraph.nodes?.length || codeGraph.nodes?.size || 0);
  console.log('代码图边数:', codeGraph.edges?.length || codeGraph.edges?.size || 0);

  // 测试 summarizeCodeGraph
  console.log('\n测试 summarizeCodeGraph...');
  const summary = enhancer.summarizeCodeGraph(codeGraph, (type, msg) => console.log(`[${type}] ${msg}`));
  console.log('页面数:', summary.pages.length);
  console.log('控制器数:', summary.controllers.length);
  console.log('服务数:', summary.services.length);

  // 显示前5个页面
  console.log('\n前5个页面:');
  summary.pages.slice(0, 5).forEach(p => console.log('  -', p.name));

  // 测试分组
  console.log('\n测试分组...');
  const groups = enhancer.groupPagesByModule(summary.pages);
  console.log('分组数:', groups.length);
  groups.forEach(g => console.log(`  - ${g.name}: ${g.pages.length} 个页面`));

  // 测试单个模块的提示词生成
  if (groups.length > 0) {
    console.log('\n测试模块提示词生成...');
    const group = groups[0];
    const relatedControllers = enhancer.getRelatedControllers(group.pages, summary.controllers);
    const prompt = enhancer.buildModulePrompt(group, relatedControllers, summary.services, summary.routes, 'E:/test');
    console.log('提示词长度:', prompt.length);
    console.log('提示词前200字符:', prompt.substring(0, 200));
  }

  console.log('\n测试完成!');
}

test().catch(console.error);
