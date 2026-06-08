/**
 * 集成层入口
 *
 * 导出所有适配器，用于复用现有资源
 */

const CodeGraphAdapter = require('./code-graph-adapter');
const AIContextAdapter = require('./context-adapter');
const MemoryAdapter = require('./memory-adapter');

module.exports = {
  CodeGraphAdapter,
  AIContextAdapter,
  MemoryAdapter,
};
