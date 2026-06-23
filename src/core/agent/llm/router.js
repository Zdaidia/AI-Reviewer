/**
 * LLM Router
 *
 * Routes requests to appropriate models based on task type,
   complexity, and availability. Handles fallback and load balancing.
 */

const LLMClient = require('./client');
const { getClaudeConfig } = require('./claude-config');

/**
 * Model capabilities and specifications
 */
const MODEL_SPECS = {
  // OpenAI models
  'gpt-4-turbo': {
    provider: 'openai',
    maxTokens: 128000,
    costPer1kTokens: { input: 0.01, output: 0.03 },
    capabilities: ['code', 'analysis', 'planning', 'reasoning'],
    speed: 'medium',
    quality: 'high'
  },
  'gpt-4': {
    provider: 'openai',
    maxTokens: 8192,
    costPer1kTokens: { input: 0.03, output: 0.06 },
    capabilities: ['code', 'analysis', 'planning', 'reasoning'],
    speed: 'slow',
    quality: 'high'
  },
  'gpt-3.5-turbo': {
    provider: 'openai',
    maxTokens: 16385,
    costPer1kTokens: { input: 0.0005, output: 0.0015 },
    capabilities: ['code', 'analysis', 'simple'],
    speed: 'fast',
    quality: 'medium'
  },
  'gpt-5.4': {
    provider: 'openai',
    maxTokens: 200000,
    costPer1kTokens: { input: 0.001, output: 0.002 },
    capabilities: ['code', 'analysis', 'planning', 'reasoning', 'vision'],
    speed: 'very-fast',
    quality: 'very-high'
  },

  // Anthropic Claude 4.6 models (latest)
  'claude-opus-4-6': {
    provider: 'claude-code',
    maxTokens: 200000,
    costPer1kTokens: { input: 0.015, output: 0.075 },
    capabilities: ['code', 'analysis', 'planning', 'reasoning', 'vision', 'tools', 'simple'],
    speed: 'fast',
    quality: 'very-high',
    supportsTools: true,
    supportsThinking: true
  },
  'deepseek-v4-pro': {
    provider: 'claude-code',
    maxTokens: 65536,
    costPer1kTokens: { input: 0.002, output: 0.008 },
    capabilities: ['code', 'analysis', 'planning', 'reasoning', 'tools', 'simple'],
    speed: 'fast',
    quality: 'high',
    supportsTools: true
  },
  'deepseek-chat': {
    provider: 'claude-code',
    maxTokens: 65536,
    costPer1kTokens: { input: 0.002, output: 0.008 },
    capabilities: ['code', 'analysis', 'planning', 'reasoning', 'tools', 'simple'],
    speed: 'fast',
    quality: 'high',
    supportsTools: true
  },
  'claude-sonnet-4-6': {
    provider: 'claude-code',
    maxTokens: 200000,
    costPer1kTokens: { input: 0.003, output: 0.015 },
    capabilities: ['code', 'analysis', 'planning', 'reasoning', 'tools'],
    speed: 'very-fast',
    quality: 'high',
    supportsTools: true
  },
  'claude-haiku-4-5': {
    provider: 'claude-code',
    maxTokens: 200000,
    costPer1kTokens: { input: 0.00025, output: 0.00125 },
    capabilities: ['code', 'simple', 'analysis'],
    speed: 'very-fast',
    quality: 'medium'
  },

  // Anthropic Claude 3 models (legacy)
  'claude-3-opus': {
    provider: 'anthropic',
    maxTokens: 200000,
    costPer1kTokens: { input: 0.015, output: 0.075 },
    capabilities: ['code', 'analysis', 'planning', 'reasoning', 'vision'],
    speed: 'medium',
    quality: 'very-high'
  },
  'claude-3-sonnet': {
    provider: 'anthropic',
    maxTokens: 200000,
    costPer1kTokens: { input: 0.003, output: 0.015 },
    capabilities: ['code', 'analysis', 'planning'],
    speed: 'fast',
    quality: 'high'
  },
  'claude-3-haiku': {
    provider: 'anthropic',
    maxTokens: 200000,
    costPer1kTokens: { input: 0.00025, output: 0.00125 },
    capabilities: ['code', 'simple'],
    speed: 'very-fast',
    quality: 'medium'
  },

  // ZhipuAI (GLM) models
  // GLM-5.1 默认使用 claude-code provider (从用户配置读取)
  'glm-5.1': {
    provider: 'claude-code',
    maxTokens: 128000,
    costPer1kTokens: { input: 0.001, output: 0.002 },
    capabilities: ['code', 'analysis', 'planning', 'reasoning', 'tools', 'simple'],
    speed: 'fast',
    quality: 'very-high',
    supportsTools: true,
    supportsThinking: true
  },
  // GLM-5 默认使用 claude-code provider (从 .claude 配置读取)
  'glm-5': {
    provider: 'claude-code',
    maxTokens: 128000,
    costPer1kTokens: { input: 0.001, output: 0.002 },
    capabilities: ['code', 'analysis', 'planning', 'reasoning', 'tools', 'simple'],
    speed: 'fast',
    quality: 'very-high',
    supportsTools: true,
    supportsThinking: true
  },
  // GLM-5 通过直接 Zhipu API (需要 zhipuApiKey)
  'glm-5-direct': {
    provider: 'zhipu',
    maxTokens: 128000,
    costPer1kTokens: { input: 0.001, output: 0.002 },
    capabilities: ['code', 'analysis', 'planning', 'reasoning', 'tools'],
    speed: 'fast',
    quality: 'very-high',
    supportsTools: true,
    supportsThinking: true,
    standardClient: 'zhipu-glm5-coding'
  },
  'glm-4v': {
    provider: 'zhipu',
    maxTokens: 128000,
    costPer1kTokens: { input: 0.001, output: 0.002 },
    capabilities: ['vision', 'analysis', 'ui_analysis'],
    speed: 'medium',
    quality: 'high'
  },
  // glm-4-flash - default model (has rate limits but works with free account)
  // glm-4 and glm-3-turbo disabled due to 1113 error (insufficient balance)
  // Using glm-5 as primary model
  'glm-4-flash': {
    provider: 'zhipu',
    maxTokens: 128000,
    costPer1kTokens: { input: 0.0001, output: 0.0002 },
    capabilities: ['code', 'analysis', 'planning', 'reasoning'],
    speed: 'very-fast',
    quality: 'high'
  },
  'glm-4': {
    provider: 'zhipu',
    maxTokens: 128000,
    costPer1kTokens: { input: 0.0005, output: 0.001 },
    capabilities: ['code', 'analysis', 'planning', 'reasoning'],
    speed: 'fast',
    quality: 'high'
  },
  'glm-3-turbo': {
    provider: 'zhipu',
    maxTokens: 128000,
    costPer1kTokens: { input: 0.0002, output: 0.0005 },
    capabilities: ['code', 'analysis', 'simple'],
    speed: 'very-fast',
    quality: 'medium'
  },

  // Local models (Ollama)
  'llama2': {
    provider: 'ollama',
    maxTokens: 4096,
    costPer1kTokens: { input: 0, output: 0 },
    capabilities: ['simple', 'code'],
    speed: 'slow',
    quality: 'low'
  },
  'codellama': {
    provider: 'ollama',
    maxTokens: 16384,
    costPer1kTokens: { input: 0, output: 0 },
    capabilities: ['code', 'analysis'],
    speed: 'medium',
    quality: 'medium'
  }
};

/**
 * Task types and their model requirements
 */
const TASK_REQUIREMENTS = {
  planning: { capabilities: ['planning', 'reasoning'], quality: 'high' },
  code_analysis: { capabilities: ['code', 'analysis'], quality: 'high' },
  code_generation: { capabilities: ['code'], quality: 'high' },
  code_fix: { capabilities: ['code'], quality: 'high' },
  simple_query: { capabilities: ['simple'], quality: 'medium' },
  test_generation: { capabilities: ['code'], quality: 'high' },
  dependency_analysis: { capabilities: ['analysis'], quality: 'medium' },
  reasoning: { capabilities: ['reasoning'], quality: 'high' },
  vision_analysis: { capabilities: ['vision', 'analysis'], quality: 'high' },
  ui_analysis: { capabilities: ['vision', 'ui_analysis'], quality: 'high' }
};

class LLMRouter {
  constructor(config = {}) {
    // 获取 Claude Code 配置并保存为实例变量
    this.claudeConfig = getClaudeConfig();
    const claudeClientConfig = this.claudeConfig.getClientConfig();

    this.config = {
      // 默认模型偏好 - 智谱 GLM-5.1
      defaultModel: config.defaultModel || 'glm-5.1',
      highQualityModel: config.highQualityModel || 'glm-5.1',
      fastModel: config.fastModel || 'glm-5.1',

      // Claude Code 配置优先
      claudeCodeEnabled: config.claudeCodeEnabled !== false,  // 默认启用
      claudeConfig: claudeClientConfig,

      // API keys (备用)
      openaiApiKey: config.openaiApiKey || process.env.OPENAI_API_KEY,
      anthropicApiKey: config.anthropicApiKey || process.env.ANTHROPIC_API_KEY,
      zhipuApiKey: config.zhipuApiKey || process.env.ZHIPUAI_API_KEY,

      // 项目配置 (router.team)
      projectApiKey: config.projectApiKey,
      projectApiEndpoint: config.projectApiEndpoint,

      // Ollama configuration
      ollamaBaseUrl: config.ollamaBaseUrl || 'http://localhost:11434',

      // Routing preferences
      preferLocal: config.preferLocal || false,
      costSensitive: config.costSensitive || false,
      speedSensitive: config.speedSensitive || false,

      // Rate limiting (requests per second)
      minRequestInterval: config.minRequestInterval || 3000,  // 毫秒 (默认3秒)

      ...config
    };

    this.clients = new Map();
    this.usageStats = new Map();

    // Rate limiting
    this.lastRequestTime = 0;
    this.requestQueue = [];
    this.processingQueue = false;

    // GLM-5 回退状态记忆（会话级别）
    this.glm5FallbackActive = false;
    this.glm5FallbackTimestamp = 0;
    const FALLBACK_CACHE_DURATION = 30 * 60 * 1000; // 30 分钟

    console.log('[LLM Router] 配置:', {
      defaultModel: this.config.defaultModel,
      claudeCodeEnabled: this.config.claudeCodeEnabled,
      claudeConfig: this.claudeConfig.getSummary()
    });

    this.initializeClients();
  }

  /**
   * Rate limiting helper - ensure minimum interval between requests
   * @param {string} modelName - 模型名称，用于确定请求间隔
   */
  async waitForRateLimit(modelName = null) {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;

    // 根据模型类型设置不同的请求间隔
    let minInterval = this.config.minRequestInterval || 3000;

    if (modelName === 'glm-4-flash') {
      // glm-4-flash 免费版有更严格的速率限制
      // 增加到 20 秒间隔，避免多轮累积触发 429
      minInterval = Math.max(minInterval, 20000);
    } else if (modelName === 'glm-5' || modelName === 'glm-5.1') {
      minInterval = Math.max(minInterval, 5000);
    }

    if (elapsed < minInterval) {
      const waitTime = minInterval - elapsed;
      console.log(`[LLM Router] 速率限制 (${modelName || 'default'}): 等待 ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.lastRequestTime = Date.now();
  }

  /**
   * Initialize all available clients
   */
  initializeClients() {
    // OpenAI client
    if (this.config.openaiApiKey) {
      this.clients.set('openai', new LLMClient({
        provider: 'openai',
        apiKey: this.config.openaiApiKey,
        model: 'gpt-3.5-turbo',
        timeout: this.config.timeout || 180000  // 可配置超时，默认 180 秒
      }));
    }

    // Anthropic client
    if (this.config.anthropicApiKey) {
      this.clients.set('anthropic', new LLMClient({
        provider: 'anthropic',
        apiKey: this.config.anthropicApiKey,
        model: 'claude-3-sonnet',
        timeout: this.config.timeout || 180000
      }));
    }

    // Claude Code client - 优先使用项目配置
    if (this.config.claudeCodeEnabled) {
      console.log('[LLM Router] 初始化 Claude Code 客户端...');

      // 优先使用项目配置，回退到全局配置
      const hasProjectConfig = this.config.projectApiKey && this.config.projectApiEndpoint;
      const hasGlobalConfig = this.claudeConfig.isValid();

      if (hasProjectConfig || hasGlobalConfig) {
        const clientConfig = {
          provider: 'claude-code',
          model: this.config.defaultModel || 'claude-opus-4-6',
          timeout: 600000  // 10分钟超时
        };

        // 如果有项目配置，使用项目配置
        if (hasProjectConfig) {
          clientConfig.apiKey = this.config.projectApiKey;
          clientConfig.baseURL = this.config.projectApiEndpoint;
          console.log('[LLM Router] 使用项目配置 (router.team):', {
            hasApiKey: !!this.config.projectApiKey,
            endpoint: this.config.projectApiEndpoint,
            model: clientConfig.model
          });
        } else {
          console.log('[LLM Router] 项目配置不完整，使用全局 Claude Code 配置');
        }

        this.clients.set('claude-code', new LLMClient(clientConfig));
        console.log('[LLM Router] Claude Code 客户端初始化成功');
      } else {
        console.warn('[LLM Router] Claude Code 配置无效，跳过初始化');
      }
    }

    // ZhipuAI (GLM) client - 备用
    if (this.config.zhipuApiKey) {
      this.clients.set('zhipu', new LLMClient({
        provider: 'zhipu',
        apiKey: this.config.zhipuApiKey,
        model: 'glm-5.1',
        baseURL: 'https://newapi.cdskysoft.cn/v1/',
        timeout: this.config.timeout || 180000
      }));

      // GLM-4V vision client - for UI/image analysis
      this.clients.set('zhipu-vision', new LLMClient({
        provider: 'zhipu',
        apiKey: this.config.zhipuApiKey,
        model: 'glm-4v',
        baseURL: 'https://newapi.cdskysoft.cn/v1/',
        timeout: this.config.timeout || 180000
      }));

      // GLM tools client - for Function Calling support
      this.clients.set('zhipu-tools', new LLMClient({
        provider: 'zhipu',
        apiKey: this.config.zhipuApiKey,
        model: 'glm-4',
        baseURL: 'https://newapi.cdskysoft.cn/v1/',
        timeout: this.config.timeout || 180000
      }));

      // GLM-5 Coding Plan client
      this.clients.set('zhipu-glm5-coding', new LLMClient({
        provider: 'zhipu',
        apiKey: this.config.zhipuApiKey,
        model: 'glm-5.1',
        baseURL: 'https://newapi.cdskysoft.cn/v1/',
        timeout: this.config.timeout || 180000
      }));

      // GLM-5 Standard client - for high-quality analysis with tools and thinking mode
      this.clients.set('zhipu-glm5', new LLMClient({
        provider: 'zhipu',
        apiKey: this.config.zhipuApiKey,
        model: 'glm-5.1',
        baseURL: 'https://newapi.cdskysoft.cn/v1/',
        timeout: this.config.timeout || 180000
      }));
    }

    // Ollama client (local) - always available
    this.clients.set('ollama', new LLMClient({
      provider: 'ollama',
      baseURL: this.config.ollamaBaseUrl,
      model: 'llama2'
    }));
  }

  /**
   * Select the best model for a given task
   * 优先使用用户配置的 defaultModel，如果满足要求则直接使用
   */
  selectModel(taskType, options = {}) {
    const requirements = TASK_REQUIREMENTS[taskType] || TASK_REQUIREMENTS.simple_query;

    // Apply forced model first
    if (options.forceModel) {
      return options.forceModel;
    }

    // 优先检查用户配置的 defaultModel
    const defaultModelName = this.config.defaultModel;
    if (defaultModelName) {
      const defaultModelSpec = MODEL_SPECS[defaultModelName];

      if (defaultModelSpec) {
        // 已知模型：检查 provider 和能力
        if (this.clients.has(defaultModelSpec.provider)) {
          const hasCapabilities = requirements.capabilities.every(cap =>
            defaultModelSpec.capabilities.includes(cap)
          );

          if (hasCapabilities) {
            if (options.highQuality && defaultModelSpec.quality !== 'very-high') {
              // 用户要求高质量，但默认模型不是 very-high，继续选择
            } else {
              return defaultModelName;
            }
          }
        }
      } else {
        // 未知模型（用户自定义）：始终优先使用用户设定的模型
        console.log(`[LLM Router] 用户设定的模型 "${defaultModelName}" 不在 MODEL_SPECS 中，直接使用`);
        return defaultModelName;
      }
    }

    // 默认模型不满足要求，回退到原来的选择逻辑
    const candidates = [];

    // Find models that meet requirements
    for (const [modelName, spec] of Object.entries(MODEL_SPECS)) {
      // Check capabilities
      const hasCapabilities = requirements.capabilities.every(cap =>
        spec.capabilities.includes(cap)
      );

      if (!hasCapabilities) continue;

      // Check if provider is available
      if (!this.clients.has(spec.provider)) continue;

      // Score the model
      let score = 0;

      // Quality score
      if (spec.quality === 'very-high') score += 10;
      else if (spec.quality === 'high') score += 7;
      else if (spec.quality === 'medium') score += 4;
      else score += 1;

      // Speed score (if speed sensitive)
      if (this.config.speedSensitive) {
        if (spec.speed === 'very-fast') score += 10;
        else if (spec.speed === 'fast') score += 7;
        else if (spec.speed === 'medium') score += 4;
      }

      // Cost score (if cost sensitive)
      if (this.config.costSensitive) {
        const avgCost = (spec.costPer1kTokens.input + spec.costPer1kTokens.output) / 2;
        if (avgCost === 0) score += 10;  // Free local models
        else if (avgCost < 0.01) score += 5;
      }

      // Local model preference
      if (this.config.preferLocal && spec.provider === 'ollama') {
        score += 5;
      }

      candidates.push({ modelName, spec, score });
    }

    // Sort by score and return best
    candidates.sort((a, b) => b.score - a.score);

    if (candidates.length === 0) {
      // Fallback to default model
      return this.config.defaultModel;
    }

    // High quality override
    if (options.highQuality && candidates.some(c => c.spec.quality === 'very-high')) {
      return candidates.find(c => c.spec.quality === 'very-high').modelName;
    }

    return candidates[0].modelName;
  }

  /**
   * 检查错误是否表示 GLM-5 需要付费资源包
   * @param {Object} result - LLM 调用结果
   * @returns {boolean} 是否需要回退到 glm-4-flash
   */
  shouldFallbackFromGLM5(result) {
    if (!result || result.success) return false;

    const errorMsg = result.error || '';
    const errorStatus = result.errorStatus || result.status || 0;

    // 检查是否是付费资源包相关的错误
    const paymentRelatedKeywords = [
      '付费资源包',
      '资源包余额不足',
      '余额不足',
      'insufficient',
      'payment required',
      'need to purchase',
      '需要购买',
      '额度不足',
      'quota exceeded'
    ];

    const isPaymentRelated = paymentRelatedKeywords.some(keyword =>
      errorMsg.toLowerCase().includes(keyword.toLowerCase())
    );

    // 429 错误也可能是速率限制导致的
    const isRateLimit = errorStatus === 429 || errorMsg.includes('429');

    return isPaymentRelated || isRateLimit;
  }

  /**
   * 使用指定模型执行请求
   * @param {string} modelName - 模型名称
   * @param {Array} messages - 消息数组
   * @param {Object} options - 选项
   * @returns {Promise<Object>} 调用结果
   */
  async executeChatRequest(modelName, messages, options) {
    const spec = MODEL_SPECS[modelName];

    // 未知模型（用户自定义）：直接使用 claude-code 客户端（用户配置的端点）
    if (!spec) {
      console.log(`[LLM Router] 未知模型 "${modelName}"，使用 claude-code 客户端（用户配置的端点）`);
      const client = this.clients.get('claude-code');
      if (!client) {
        throw new Error(`模型 "${modelName}" 无可用客户端，请检查 Settings 中的 API 配置`);
      }
      if (client.model !== modelName) {
        client.updateConfig({ model: modelName });
      }
      const startTime = Date.now();
      const result = await client.chat(messages, options);
      const duration = Date.now() - startTime;
      return { ...result, model: modelName, provider: 'claude-code', duration };
    }

    // Claude 4.6 系列模型使用 claude-code 客户端
    if (modelName.startsWith('claude-') && this.clients.has('claude-code')) {
      console.log(`[LLM Router] 使用 claude-code 客户端（${modelName}）`);
      const client = this.clients.get('claude-code');
      // 更新客户端模型
      if (client.model !== modelName) {
        client.updateConfig({ model: modelName });
      }
      return await client.chat(messages, options);
    }

    // 如果模型是 glm-5/5.1 且 claude-code 可用，优先使用 claude-code
    if ((modelName === 'glm-5' || modelName === 'glm-5.1') && this.clients.has('claude-code')) {
      console.log(`[LLM Router] 使用 claude-code 客户端（${modelName} 通过 Anthropic 兼容端点）`);
      const client = this.clients.get('claude-code');
      return await client.chat(messages, options);
    }

    // 选择合适的客户端
    let client;

    // GLM-5/5.1 特殊处理：根据是否有 tools 参数选择不同的客户端
    if (modelName === 'glm-5' || modelName === 'glm-5.1') {
      if (options.tools) {
        client = this.clients.get('zhipu-glm5');
        console.log('[LLM Router] 使用 zhipu-glm5 客户端（标准端点，支持 tools）');
      } else {
        client = this.clients.get('zhipu-glm5-coding');
        console.log('[LLM Router] 使用 zhipu-glm5-coding 客户端（Coding Plan 端点）');
      }
    }
    // 其他 zhipu 模型有 tools 参数时，使用 zhipu-tools 客户端
    else if (options.tools && spec.provider === 'zhipu') {
      client = this.clients.get('zhipu-tools');
      console.log('[LLM Router] 使用 zhipu-tools 客户端（支持 Function Calling）');
    }
    // 默认使用 provider 对应的客户端
    else {
      client = this.clients.get(spec.provider);
    }

    if (!client) {
      throw new Error(`Client not available for provider: ${spec.provider}`);
    }

    // Update client model if needed
    if (client.model !== modelName) {
      client.updateConfig({ model: modelName });
    }

    // GLM-5 添加 thinking 参数（深度思考模式）
    if (modelName === 'glm-5' && spec.supportsThinking && options.tools) {
      options.thinking = options.thinking || { type: 'enabled' };
      console.log('[LLM Router] GLM-5 启用深度思考模式');
    }

    // Execute request
    const startTime = Date.now();
    const result = await client.chat(messages, options);
    const duration = Date.now() - startTime;

    return {
      ...result,
      model: modelName,
      provider: spec.provider,
      duration
    };
  }

  /**
   * Route a chat request to the appropriate model
   * 支持 GLM-5 付费限制时自动回退到 GLM-4-flash
   */
  async chat(taskType, messages, options = {}) {
    // 检查是否处于 GLM-5 回退状态（会话级别记忆）
    const now = Date.now();
    const FALLBACK_CACHE_DURATION = 30 * 60 * 1000; // 30 分钟

    if (this.glm5FallbackActive && (now - this.glm5FallbackTimestamp < FALLBACK_CACHE_DURATION)) {
      // 回退状态仍然有效，直接使用 glm-4-flash
      const selectedModel = this.selectModel(taskType, options);
      if (!options.model && (selectedModel === 'glm-5' || selectedModel === 'glm-5.1')) {
        console.log('[LLM Router] GLM-5/5.1 回退状态有效，直接使用 GLM-4-flash');
        options = { ...options, model: 'glm-4-flash' };
      }
    } else if (now - this.glm5FallbackTimestamp >= FALLBACK_CACHE_DURATION) {
      // 回退状态已过期，重置
      this.glm5FallbackActive = false;
    }

    let modelName = options.model || this.selectModel(taskType, options);
    let spec = MODEL_SPECS[modelName];

    // Rate limiting - wait before making request
    await this.waitForRateLimit(modelName);

    // 请求日志
    console.log(`[LLM Router] 发送请求:`, {
      taskType,
      model: modelName,
      provider: spec?.provider,
      messagesCount: messages?.length || 0,
      temperature: options?.temperature,
      maxTokens: options?.max_tokens || options?.maxTokens
    });

    // 尝试使用选定的模型
    let result = await this.executeChatRequest(modelName, messages, options);

    // 响应日志
    console.log(`[LLM Router] 收到响应:`, {
      model: modelName,
      success: result.success,
      duration: `${result.duration}ms`,
      tokens: result.usage?.totalTokens || 'N/A',
      hasError: !!result.error,
      errorMessage: result.error || null,
      errorStatus: result.errorStatus || result.status || null,
      errorType: result.errorType || null,
      retryCount: result._retryCount || 0,
      isRetryable: result._isRetryable || false
    });

    // 超时错误特别处理
    if (!result.success && result.error && result.error.toLowerCase().includes('timeout')) {
      console.error(`[LLM Router] ❌ 请求超时！`, {
        model: modelName,
        provider: spec?.provider,
        duration: `${result.duration}ms`,
        errorMessage: result.error,
        retryCount: result._retryCount || 0,
        suggestion: '请检查网络连接或增加超时时间'
      });
    }

    // GLM-5/5.1 智能回退机制：如果遇到付费限制，自动回退到 glm-4-flash
    if ((modelName === 'glm-5' || modelName === 'glm-5.1') && this.shouldFallbackFromGLM5(result)) {
      console.warn('[LLM Router] GLM-5/5.1 遇到付费限制或速率限制，自动回退到 GLM-4-flash');

      // 激活回退状态（会话级别记忆）
      this.glm5FallbackActive = true;
      this.glm5FallbackTimestamp = Date.now();
      console.log('[LLM Router] GLM-5 回退状态已激活，未来 30 分钟内将直接使用 GLM-4-flash');

      // 更新 options 中的 model，避免递归回退
      const fallbackOptions = { ...options, model: 'glm-4-flash' };
      result = await this.executeChatRequest('glm-4-flash', messages, fallbackOptions);

      console.log(`[LLM Router] GLM-4-flash 回退响应:`, {
        success: result.success,
        duration: `${result.duration}ms`,
        tokens: result.usage?.totalTokens || 'N/A'
      });

      // 标记使用了回退模型
      result.fallbackModel = 'glm-4-flash';
      result.originalModel = 'glm-5';
    }

    // Track usage
    this.trackUsage(result.model || modelName, {
      taskType,
      duration: result.duration,
      tokens: result.usage?.totalTokens,
      success: result.success
    });

    return result;
  }

  /**
   * Analyze UI/images using vision model
   * @param {Object} params - Analysis parameters
   * @param {string} params.prompt - Analysis prompt
   * @param {string} params.imagePath - Path to image file
   * @param {string} params.imageBase64 - Base64 encoded image
   * @param {Array} params.messages - Additional messages
   * @param {Object} params.options - Additional options
   * @returns {Promise<Object>} Analysis result
   */
  async analyzeVision(params = {}) {
    const { prompt, imagePath, imageBase64, messages = [], options = {} } = params;

    // Use zhipu-vision client for image analysis
    const visionClient = this.clients.get('zhipu-vision');
    if (!visionClient) {
      throw new Error('Vision client not available. Please check Zhipu API key.');
    }

    console.log(`[LLM Router] 发送视觉分析请求:`, {
      model: 'glm-4v',
      hasImage: !!imagePath || !!imageBase64,
      promptLength: prompt?.length || 0
    });

    // Build messages with image
    const visionMessages = [...messages];

    // Add image and prompt
    if (imageBase64) {
      visionMessages.push({
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: imageBase64 } },
          { type: 'text', text: prompt || '请分析这张图片中的UI界面，检查是否符合需求。' }
        ]
      });
    } else if (imagePath) {
      // Read image and convert to base64
      const fs = require('fs');
      const imageData = fs.readFileSync(imagePath);
      const base64 = imageData.toString('base64');
      const mimeType = this.getMimeType(imagePath);

      visionMessages.push({
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
          { type: 'text', text: prompt || '请分析这张图片中的UI界面，检查是否符合需求。' }
        ]
      });
    } else {
      // No image provided
      throw new Error('Either imagePath or imageBase64 must be provided for vision analysis.');
    }

    // Execute request
    const startTime = Date.now();
    const result = await visionClient.chat(visionMessages, {
      temperature: options.temperature || 0.3,
      maxTokens: options.maxTokens || 4000
    });
    const duration = Date.now() - startTime;

    console.log(`[LLM Router] 视觉分析完成:`, {
      success: result.success,
      duration: `${duration}ms`,
      tokens: result.usage?.totalTokens || 'N/A'
    });

    return {
      ...result,
      model: 'glm-4v',
      provider: 'zhipu-vision',
      duration
    };
  }

  /**
   * Get MIME type from file path
   */
  getMimeType(filePath) {
    const ext = filePath.split('.').pop().toLowerCase();
    const mimeTypes = {
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'bmp': 'image/bmp'
    };
    return mimeTypes[ext] || 'image/png';
  }

  /**
   * Stream a chat request
   */
  async *chatStream(taskType, messages, options = {}) {
    const modelName = this.selectModel(taskType, options);
    const spec = MODEL_SPECS[modelName];
    const client = this.clients.get(spec.provider);

    if (client.model !== modelName) {
      client.updateConfig({ model: modelName });
    }

    yield* client.chatStream(messages, { ...options, model: modelName });
  }

  /**
   * Track usage statistics
   */
  trackUsage(modelName, stats) {
    if (!this.usageStats.has(modelName)) {
      this.usageStats.set(modelName, {
        requestCount: 0,
        totalTokens: 0,
        totalDuration: 0,
        errorCount: 0
      });
    }

    const usage = this.usageStats.get(modelName);
    usage.requestCount++;
    usage.totalTokens += stats.tokens || 0;
    usage.totalDuration += stats.duration;

    if (!stats.success) {
      usage.errorCount++;
    }
  }

  /**
   * Get usage statistics
   */
  getUsageStats(modelName = null) {
    if (modelName) {
      return this.usageStats.get(modelName) || null;
    }
    return Object.fromEntries(this.usageStats);
  }

  /**
   * Reset usage statistics
   */
  resetUsageStats() {
    this.usageStats.clear();
  }

  /**
   * Get available models
   */
  getAvailableModels() {
    return Object.entries(MODEL_SPECS)
      .filter(([_, spec]) => this.clients.has(spec.provider))
      .map(([name, spec]) => ({
        name,
        provider: spec.provider,
        capabilities: spec.capabilities,
        quality: spec.quality,
        speed: spec.speed
      }));
  }

  /**
   * Update configuration
   */
  updateConfig(config) {
    try {
      const fs = require('fs'); const p = require('path');
      fs.appendFileSync(p.join('E:', 'AI', 'dev-quality-inspector', 'data', 'debug.log'),
        `[${new Date().toISOString()}] [LLMRouter.updateConfig] projectApiKey=${config.projectApiKey?.substring(0,10)}..., projectApiEndpoint=${config.projectApiEndpoint}\n`);
    } catch(e) {}
    this.config = { ...this.config, ...config };

    // API keys 或 project 配置变化时重新初始化所有客户端
    if (config.openaiApiKey || config.anthropicApiKey || config.zhipuApiKey
        || config.projectApiKey || config.projectApiEndpoint) {
      this.initializeClients();
    }
  }

  /**
   * Get current configuration
   */
  getConfig() {
    return {
      ...this.config,
      availableModels: this.getAvailableModels()
    };
  }
}

module.exports = LLMRouter;
module.exports.MODEL_SPECS = MODEL_SPECS;
