/**
 * Claude Code Configuration Reader
 *
 * 读取 C:\Users\Administrator\.claude\settings.json 配置
 * 提供统一的配置接口给 LLM Client 使用
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

class ClaudeConfigReader {
  constructor() {
    this.configPath = path.join(os.homedir(), '.claude', 'settings.json');
    this.config = null;
    this.load();
  }

  /**
   * 加载配置文件
   */
  load() {
    try {
      if (fs.existsSync(this.configPath)) {
        const content = fs.readFileSync(this.configPath, 'utf8');
        this.config = JSON.parse(content);
        console.log('[ClaudeConfig] 配置已加载:', this.configPath);
      } else {
        console.warn('[ClaudeConfig] 配置文件不存在:', this.configPath);
        this.config = { env: {} };
      }
    } catch (error) {
      console.error('[ClaudeConfig] 加载配置失败:', error.message);
      this.config = { env: {} };
    }
  }

  /**
   * 重新加载配置
   */
  reload() {
    this.load();
  }

  /**
   * 获取 Anthropic API Token
   */
  getAuthToken() {
    return this.config?.env?.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_AUTH_TOKEN;
  }

  /**
   * 获取 Anthropic Base URL
   */
  getBaseUrl() {
    return this.config?.env?.ANTHROPIC_BASE_URL || process.env.ANTHROPIC_BASE_URL;
  }

  /**
   * 获取默认模型 (根据质量级别)
   * @param {string} quality - 'haiku' | 'sonnet' | 'opus'
   */
  getDefaultModel(quality = 'opus') {
    // 优先使用环境变量中的模型配置
    const modelMap = {
      haiku: this.config?.env?.ANTHROPIC_DEFAULT_HAIKU_MODEL || 'glm-5',
      sonnet: this.config?.env?.ANTHROPIC_DEFAULT_SONNET_MODEL || 'glm-5',
      opus: this.config?.env?.ANTHROPIC_DEFAULT_OPUS_MODEL || 'glm-5'
    };
    // 默认使用 glm-5
    return modelMap[quality] || 'glm-5';
  }

  /**
   * 获取 API 超时时间 (毫秒)
   */
  getTimeout() {
    const timeout = this.config?.env?.API_TIMEOUT_MS;
    return timeout ? parseInt(timeout, 10) : 300000; // 默认 5 分钟
  }

  /**
   * 获取所有环境变量
   */
  getEnv() {
    return { ...process.env, ...this.config?.env };
  }

  /**
   * 获取 LLM Client 配置
   */
  getClientConfig() {
    return {
      apiKey: this.getAuthToken(),
      baseURL: this.getBaseUrl(),
      timeout: this.getTimeout(),
      model: this.getDefaultModel('opus')
    };
  }

  /**
   * 检查配置是否有效
   */
  isValid() {
    return !!this.getAuthToken();
  }

  /**
   * 获取配置摘要（用于日志）
   */
  getSummary() {
    const config = this.getClientConfig();
    return {
      hasApiKey: !!config.apiKey,
      baseURL: config.baseURL,
      defaultModel: config.model,
      timeout: config.timeout
    };
  }
}

// 单例模式
let instance = null;

/**
 * 获取 ClaudeConfigReader 单例
 */
function getClaudeConfig() {
  if (!instance) {
    instance = new ClaudeConfigReader();
  }
  return instance;
}

module.exports = {
  ClaudeConfigReader,
  getClaudeConfig
};
