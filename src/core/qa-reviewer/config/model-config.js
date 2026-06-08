/**
 * QA Reviewer 模型配置
 *
 * 统一管理审查过程中使用的模型配置
 * 支持智能回退和模型层级
 */

/**
 * 模型层级配置
 * 按优先级排序，当高优先级模型不可用时自动回退
 */
const MODEL_HIERARCHY = {
  // 高质量模型 - 用于代码审查
  high: ['deepseek-v4-pro', 'claude-opus-4-6', 'claude-sonnet-4-6', 'claude-opus-4-5', 'gpt-4'],

  // 快速模型 - 用于需求分析
  fast: ['deepseek-v4-pro', 'claude-sonnet-4-6', 'claude-sonnet-4-5', 'gpt-3.5-turbo'],

  // 标准模型 - 通用场景
  standard: ['deepseek-v4-pro', 'claude-sonnet-4-6', 'claude-sonnet-4-5']
};

/**
 * 两阶段审查模型配置
 */
const TWO_PHASE_CONFIG = {
  phase1: {
    name: '需求分析阶段',
    preferred: 'claude-sonnet-4-6',   // 首选：快速且质量高
    fallback: ['claude-sonnet-4-5', 'gpt-3.5-turbo'],
    maxTokens: 4000,
    temperature: 0.3
  },
  phase2: {
    name: '代码审查阶段',
    preferred: 'claude-opus-4-6',          // 首选：最高质量
    fallback: ['claude-sonnet-4-6', 'claude-opus-4-5'],
    maxTokens: 8000,
    temperature: 0.2
  }
};

/**
 * 单阶段审查模型配置
 */
const SINGLE_PHASE_CONFIG = {
  preferred: 'claude-sonnet-4-6',      // 平衡性能和质量
  fallback: ['claude-sonnet-4-5', 'gpt-3.5-turbo'],
  maxTokens: 6000,
  temperature: 0.3
};

/**
 * 任务类型到模型配置的映射
 */
const TASK_MODEL_CONFIG = {
  requirement_analysis: {
    preferred: 'claude-sonnet-4-6',
    fallback: ['claude-sonnet-4-5'],
    maxTokens: 4000
  },
  code_review: {
    preferred: 'claude-opus-4-6',
    fallback: ['claude-sonnet-4-6', 'claude-opus-4-5'],
    maxTokens: 8000
  },
  contract_checking: {
    preferred: 'claude-sonnet-4-6',
    fallback: ['claude-sonnet-4-5'],
    maxTokens: 3000
  },
  optimization: {
    preferred: 'claude-opus-4-6',
    fallback: ['claude-sonnet-4-6'],
    maxTokens: 6000
  }
};

/**
 * 429 错误重试配置
 */
const RETRY_CONFIG = {
  maxRetries: 5,                 // 最大重试次数
  initialDelay: 30000,           // 初始延迟 30 秒
  delayIncrement: 10000,         // 每次重试增加 10 秒
  maxDelay: 70000,               // 最大延迟 70 秒
  retryableErrors: [429, 500, 502, 503, 504]  // 可重试的 HTTP 状态码
};

/**
 * QAModelConfig 类
 */
class QAModelConfig {
  // 用户设定的全局模型（优先级最高）
  static _userModel = null;

  /**
   * 设置用户全局模型（由前端设置面板触发）
   * @param {string} model - 用户设定的模型名称
   */
  static setUserModel(model) {
    QAModelConfig._userModel = model;
    console.log(`[QAModelConfig] 用户模型已设置: ${model}`);
  }

  /**
   * 获取当前生效的用户模型
   * @returns {string|null}
   */
  static getUserModel() {
    return QAModelConfig._userModel;
  }

  /**
   * 获取两阶段审查的模型配置
   * 如果用户设定了全局模型，则使用用户模型覆盖首选模型
   */
  static getTwoPhaseConfig(phase = 1) {
    const phaseKey = `phase${phase}`;
    const config = TWO_PHASE_CONFIG[phaseKey] || TWO_PHASE_CONFIG.phase1;
    if (QAModelConfig._userModel) {
      return { ...config, preferred: QAModelConfig._userModel };
    }
    return config;
  }

  /**
   * 获取单阶段审查的模型配置
   * 如果用户设定了全局模型，则使用用户模型覆盖首选模型
   */
  static getSinglePhaseConfig() {
    if (QAModelConfig._userModel) {
      return { ...SINGLE_PHASE_CONFIG, preferred: QAModelConfig._userModel };
    }
    return SINGLE_PHASE_CONFIG;
  }

  /**
   * 根据任务类型获取模型配置
   * 如果用户设定了全局模型，则使用用户模型覆盖首选模型
   */
  static getTaskConfig(taskType) {
    const config = TASK_MODEL_CONFIG[taskType] || SINGLE_PHASE_CONFIG;
    if (QAModelConfig._userModel) {
      return { ...config, preferred: QAModelConfig._userModel };
    }
    return config;
  }

  /**
   * 获取模型回退列表
   */
  static getFallbackList(preferredModel) {
    // 查找匹配的层级
    for (const [level, models] of Object.entries(MODEL_HIERARCHY)) {
      if (models.includes(preferredModel)) {
        const index = models.indexOf(preferredModel);
        return models.slice(index); // 返回从首选模型开始的列表
      }
    }
    return [preferredModel];
  }

  /**
   * 获取重试配置
   */
  static getRetryConfig() {
    return RETRY_CONFIG;
  }

  /**
   * 计算重试延迟（指数退避）
   */
  static calculateRetryDelay(attempt) {
    const delay = Math.min(
      RETRY_CONFIG.initialDelay + (attempt - 1) * RETRY_CONFIG.delayIncrement,
      RETRY_CONFIG.maxDelay
    );
    return Math.floor(delay);
  }

  /**
   * 判断错误是否可重试
   */
  static isRetryableError(error) {
    if (!error) return false;

    // 检查 HTTP 状态码（多个可能的字段）
    const statusCode = error.status || error.errorStatus || error.httpStatus;
    if (statusCode && RETRY_CONFIG.retryableErrors.includes(statusCode)) {
      return true;
    }

    // 检查错误消息中的状态码
    const errorMessage = error.message || error.error || error.errorMessage || '';

    // 首先检查错误消息中是否包含可重试的 HTTP 状态码
    for (const code of RETRY_CONFIG.retryableErrors) {
      if (errorMessage.includes(code.toString()) || errorMessage.includes(`${code} `)) {
        return true;
      }
    }

    // 检查其他可重试的错误模式
    const retryablePatterns = [
      '429',
      'rate limit',
      '余额不足',
      'insufficient balance',
      'timeout',
      'ECONNRESET',
      'ETIMEDOUT',
      '服务异常',
      'Service Unavailable',
      'Gateway Timeout'
    ];

    return retryablePatterns.some(pattern =>
      errorMessage.toLowerCase().includes(pattern.toLowerCase())
    );
  }

  /**
   * 获取推荐模型（考虑当前配置）
   */
  static getRecommendedModel(taskType = 'code_review') {
    const config = this.getTaskConfig(taskType);
    return config.preferred;
  }
}

module.exports = {
  MODEL_HIERARCHY,
  TWO_PHASE_CONFIG,
  SINGLE_PHASE_CONFIG,
  TASK_MODEL_CONFIG,
  RETRY_CONFIG,
  QAModelConfig
};
