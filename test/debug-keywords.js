const path = require('path');
const srcPath = path.join(__dirname, '..', 'src');
process.env.NODE_PATH = srcPath;
require('module').Module._initPaths();

const AIContextBuilder = require(path.join(srcPath, 'core', 'agent', 'context-builder'));

const builder = new AIContextBuilder();

const questions = [
  '哪些按钮可以点击？',
  '路由是如何设计的？',
  'UI 结构怎么样？',
];

for (const question of questions) {
  console.log(`\n问题: ${question}`);
  const analysis = builder.analyzeQuestion(question);
  console.log(`  关键词: [${analysis.keywords.join(', ')}]`);
  console.log(`  类别: [${analysis.categories.join(', ')}]`);
  console.log(`  意图: ${analysis.intent}`);
}
