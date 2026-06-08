/**
 * Tools Index
 *
 * Exports all Agent tools and provides a tool registry.
 */

const BaseTool = require('./base-tool');
const ScanTool = require('./scan-tool');
const FixTool = require('./fix-tool');
const TestTool = require('./test-tool');
const RunTool = require('./run-tool');
const FileTool = require('./file-tool');
const ReviewTool = require('./review-tool');

/**
 * Tool Registry
 * Manages all available tools and provides lookup by name
 */
class ToolRegistry {
  constructor() {
    this.tools = new Map();
  }

  /**
   * Register a tool
   */
  register(tool) {
    if (!(tool instanceof BaseTool)) {
      throw new Error('Tool must extend BaseTool');
    }
    this.tools.set(tool.name, tool);
    return this;
  }

  /**
   * Get a tool by name
   */
  get(name) {
    return this.tools.get(name);
  }

  /**
   * Check if a tool exists
   */
  has(name) {
    return this.tools.has(name);
  }

  /**
   * Get all registered tools
   */
  getAll() {
    return Array.from(this.tools.values());
  }

  /**
   * Get all tool schemas for LLM prompting
   */
  getSchemas() {
    return this.getAll().map(tool => tool.getSchema());
  }

  /**
   * Get tools by category
   */
  getByCategory(category) {
    const categories = {
      analysis: ['scan', 'review'],
      fixing: ['fix'],
      testing: ['test'],
      execution: ['run'],
      file: ['file']
    };

    const toolNames = categories[category] || [];
    return toolNames.map(name => this.get(name)).filter(Boolean);
  }

  /**
   * Clear all tools
   */
  clear() {
    this.tools.clear();
  }
}

/**
 * Create and initialize the tool registry with all default tools
 */
function createToolRegistry(modules) {
  const {
    codeScanner,
    todoManager,
    aiFixer,
    testingManager,
    projectRunner,
    contextBuilder
  } = modules;

  const registry = new ToolRegistry();

  // Register all tools
  registry.register(new ScanTool(codeScanner));
  registry.register(new FixTool(todoManager, aiFixer));
  registry.register(new TestTool(testingManager));
  registry.register(new RunTool(projectRunner));
  registry.register(new FileTool());
  if (contextBuilder) {
    registry.register(new ReviewTool(codeScanner, todoManager, contextBuilder));
  }

  return registry;
}

module.exports = {
  BaseTool,
  ScanTool,
  FixTool,
  TestTool,
  RunTool,
  FileTool,
  ReviewTool,
  ToolRegistry,
  createToolRegistry
};
