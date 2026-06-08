/**
 * Agent Module Index
 *
 * Main entry point for the AI Agent system.
 * Exports all Agent components and provides factory functions.
 */

const { createToolRegistry } = require('./tools');
const { LLMRouter } = require('./llm');
const { MemoryManager } = require('./memory');
const AgentOrchestrator = require('./core/orchestrator');

/**
 * Load agent configuration from YAML file
 */
function loadConfig(configPath = null) {
  const yaml = require('js-yaml');
  const fs = require('fs');
  const path = require('path');

  // 优先使用传入路径，其次使用项目根目录下的配置文件
  // __dirname: src/core/agent/ -> 向上三级到项目根
  const projectRoot = path.join(__dirname, '../../..');
  const defaultPath = configPath || path.join(projectRoot, 'agent-config.yaml');

  try {
    if (fs.existsSync(defaultPath)) {
      const content = fs.readFileSync(defaultPath, 'utf8');
      return yaml.load(content);
    }
  } catch (error) {
    console.warn(`Failed to load agent config from ${defaultPath}:`, error.message);
  }

  // Return default configuration
  return {
    agent: {
      name: 'Dev Quality Inspector AI Agent',
      version: '2.0.0',
      capabilities: ['code_analysis', 'automated_fixing', 'test_generation']
    },
    behavior: {
      maxIterations: 10,
      autoConfirmSafeActions: false,
      learningEnabled: true
    },
    llm: {
      defaultModel: 'gpt-3.5-turbo',
      routing: {
        preferLocal: false,
        costSensitive: false
      }
    },
    memory: {
      episodic: {
        maxEpisodes: 1000,
        persistToFile: true
      },
      semantic: {
        maxEntries: 5000,
        persistToFile: true
      }
    }
  };
}

/**
 * Create a fully configured Agent system
 */
function createAgent(modules, options = {}) {
  const config = options.config || loadConfig(options.configPath);

  // Create or use provided tool registry
  const tools = modules.tools || createToolRegistry({
    codeScanner: modules.codeScanner,
    todoManager: modules.todoManager,
    aiFixer: modules.aiFixer,
    testingManager: modules.testingManager,
    projectRunner: modules.projectRunner
  });

  // Create or use provided LLM router
  const llm = modules.llm || new LLMRouter({
    defaultModel: config.llm?.default_model,
    highQualityModel: config.llm?.high_quality_model,
    fastModel: config.llm?.fast_model,
    openaiApiKey: options.openaiApiKey || process.env.OPENAI_API_KEY,
    anthropicApiKey: options.anthropicApiKey || process.env.ANTHROPIC_API_KEY,
    ollamaBaseUrl: options.ollamaBaseUrl || config.llm?.providers?.ollama?.base_url,
    preferLocal: config.llm?.routing?.prefer_local,
    costSensitive: config.llm?.routing?.cost_sensitive,
    speedSensitive: config.llm?.routing?.speed_sensitive
  });

  // Create or use provided memory manager
  const memory = modules.memory || new MemoryManager({
    episodic: {
      maxEpisodes: config.memory?.episodic?.max_episodes,
      persistToFile: config.memory?.episodic?.persist_to_file,
      storagePath: options.storagePath || config.memory?.episodic?.storage_path
    },
    semantic: {
      maxEntries: config.memory?.semantic?.max_entries,
      persistToFile: config.memory?.semantic?.persist_to_file
    }
  });

  // Create orchestrator
  const orchestrator = new AgentOrchestrator({
    tools,
    llm,
    memory
  }, {
    maxIterations: config.behavior?.max_iterations,
    autoConfirmSafeActions: config.behavior?.auto_confirm_safe_actions,
    requireApprovalFor: config.behavior?.require_approval_for,
    learningEnabled: config.behavior?.learning_enabled
  });

  return {
    orchestrator,
    tools,
    llm,
    memory,
    config
  };
}

/**
 * Create a minimal Agent for testing
 */
function createTestAgent(modules = {}) {
  const mockTools = modules.tools || {
    get: () => ({ execute: async () => ({ success: true, data: {} }) }),
    getSchemas: () => []
  };

  const mockLLM = modules.llm || {
    chat: async () => ({ success: true, content: '{}' }),
    chatStream: async function* () { yield { content: '{}' }; }
  };

  const mockMemory = modules.memory || {
    startTask: () => 'test-episode',
    addStep: () => ({}),
    completeTask: () => ({}),
    failTask: () => ({}),
    findSimilarTasks: () => [],
    working: {
      getContextSummary: () => '',
      setCurrentPlan: () => {},
      setAgentStatus: () => {}
    }
  };

  return {
    orchestrator: {
      process: async (req) => ({ success: true, result: {}, plan: { tasks: [] } }),
      getStatus: () => ({ isProcessing: false }),
      abort: () => true,
      on: () => {},
      off: () => {}
    },
    tools: mockTools,
    llm: mockLLM,
    memory: mockMemory
  };
}

module.exports = {
  // Factory functions
  createAgent,
  createTestAgent,
  loadConfig,

  // Core components
  AgentOrchestrator,
  LLMRouter,
  MemoryManager,

  // Tools
  createToolRegistry,

  // Prompts
  prompts: require('./prompts')
};
