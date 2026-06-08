/**
 * AI Fixer Configuration
 *
 * Manages AI provider settings, API keys, and model configuration
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

class AIConfig {
  constructor() {
    this.configPath = path.join(os.homedir(), '.dqi-ai-config.json');
    this.config = this.loadConfig();
  }

  /**
   * Load configuration from file
   */
  loadConfig() {
    try {
      // 优先读取项目级配置
      const projectConfigPath = path.join(process.cwd(), '.ai-config.json');
      if (fs.existsSync(projectConfigPath)) {
        const content = fs.readFileSync(projectConfigPath, 'utf8');
        console.log('[AIConfig] 加载项目级配置:', projectConfigPath);
        return JSON.parse(content);
      }

      // 其次读取用户级配置
      if (fs.existsSync(this.configPath)) {
        const content = fs.readFileSync(this.configPath, 'utf8');
        console.log('[AIConfig] 加载用户级配置:', this.configPath);
        return JSON.parse(content);
      }
    } catch (error) {
      console.error('Error loading AI config:', error.message);
    }
    return this.getDefaultConfig();
  }

  /**
   * Save configuration to file
   */
  saveConfig(config) {
    try {
      // 保存当前 provider 的配置到 providerConfigs 中
      // 这样每个 provider 都有独立的保存配置
      const provider = config.provider || this.config.provider || 'zhipu';

      this.config = {
        ...this.config,
        ...config,
        // 保存每个 provider 的配置
        providerConfigs: {
          ...this.config.providerConfigs,
          [provider]: {
            apiKey: config.apiKey,
            apiEndpoint: config.apiEndpoint,
            model: config.model
          }
        }
      };

      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
      console.log('[AIConfig] 已保存配置:', { provider, apiKey: config.apiKey ? '***已保存***' : undefined });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get default configuration
   */
  getDefaultConfig() {
    // 尝试从 Claude Code 配置读取
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const claudeConfigPath = path.join(os.homedir(), '.claude', 'settings.json');

    let apiKey = '';
    let apiEndpoint = '';

    try {
      if (fs.existsSync(claudeConfigPath)) {
        const claudeConfig = JSON.parse(fs.readFileSync(claudeConfigPath, 'utf8'));
        apiKey = claudeConfig?.env?.ANTHROPIC_AUTH_TOKEN || '';
        apiEndpoint = claudeConfig?.env?.ANTHROPIC_BASE_URL || '';
      }
    } catch (error) {
      console.warn('[AIConfig] 无法读取 Claude Code 配置:', error.message);
    }

    return {
      // Provider: openai, anthropic, azure, custom
      provider: 'zhipu',
      // API settings
      apiKey: apiKey || '',
      apiEndpoint: apiEndpoint || 'https://newapi.cdskysoft.cn/v1',
      // Model settings
      model: 'glm-5.1',
      temperature: 0.2,
      maxTokens: 2000,
      // Context settings
      maxContextLines: 50,
      includeDependencies: true,
      maxDependencyDepth: 2,
      // UI settings
      autoApply: false,
      showDiff: true,
    };
  }

  /**
   * Get current configuration
   */
  getConfig() {
    return this.config;
  }

  /**
   * Update configuration
   */
  updateConfig(updates) {
    return this.saveConfig(updates);
  }

  /**
   * Get API client based on provider
   */
  getApiClient() {
    switch (this.config.provider) {
      case 'openai':
        return this.getOpenAIClient();
      case 'anthropic':
        return this.getAnthropicClient();
      case 'azure':
        return this.getAzureClient();
      case 'zhipu':
      case 'glm':
        return this.getZhipuClient();
      default:
        return this.getCustomClient();
    }
  }

  /**
   * Get OpenAI client
   */
  getOpenAIClient() {
    try {
      const OpenAI = require('openai');
      return new OpenAI({
        apiKey: this.config.apiKey,
      });
    } catch (error) {
      console.error('OpenAI not available:', error.message);
      return null;
    }
  }

  /**
   * Get Anthropic client
   */
  getAnthropicClient() {
    try {
      // Placeholder for Anthropic SDK
      return {
        provider: 'anthropic',
        apiKey: this.config.apiKey,
      };
    } catch (error) {
      console.error('Anthropic not available:', error.message);
      return null;
    }
  }

  /**
   * Get Azure client
   */
  getAzureClient() {
    try {
      const OpenAI = require('openai');
      return new OpenAI({
        apiKey: this.config.apiKey,
        baseURL: this.config.apiEndpoint || 'https://your-resource.openai.azure.com',
      });
    } catch (error) {
      console.error('Azure OpenAI not available:', error.message);
      return null;
    }
  }

  /**
   * Get ZhipuAI (GLM) client
   */
  getZhipuClient() {
    try {
      const OpenAI = require('openai');
      return new OpenAI({
        apiKey: this.config.apiKey || process.env.ZHIPUAI_API_KEY,
        baseURL: this.config.apiEndpoint || 'https://open.bigmodel.cn/api/paas/v4/',
      });
    } catch (error) {
      console.error('ZhipuAI not available:', error.message);
      return null;
    }
  }

  /**
   * Get custom client
   */
  getCustomClient() {
    return {
      provider: 'custom',
      endpoint: this.config.apiEndpoint,
      apiKey: this.config.apiKey,
    };
  }

  /**
   * Validate configuration
   */
  validateConfig() {
    const errors = [];

    if (!this.config.apiKey) {
      errors.push('API Key is required');
    }

    if (!this.config.model) {
      errors.push('Model is required');
    }

    if (this.config.provider === 'custom' && !this.config.apiEndpoint) {
      errors.push('API Endpoint is required for custom provider');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

module.exports = AIConfig;
