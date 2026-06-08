/**
 * Structured Logger
 *
 * 标准化的日志系统
 * - 结构化日志输出
 * - 日志级别控制
 * - 组件级过滤
 * - 支持多种输出格式
 */

const fs = require('fs');
const path = require('path');

/**
 * Logger Class
 */
class Logger {
  /**
   * @param {string} component - 组件名称
   * @param {Object} options - 配置选项
   */
  constructor(component, options = {}) {
    this.component = component;
    this.options = {
      level: options.level || process.env.LOG_LEVEL || 'info',
      enableConsole: options.enableConsole !== false,
      enableFileLogging: options.enableFileLogging || false,
      logFilePath: options.logFilePath || './logs/scanner.log',
      structuredLogging: options.structuredLogging !== false,
      colorize: options.colorize !== false,
      includeTimestamp: options.includeTimestamp !== false,
      ...options,
    };

    // 日志级别定义
    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3,
    };

    // 颜色代码
    this.colors = {
      error: '\x1b[31m', // 红色
      warn: '\x1b[33m',  // 黄色
      info: '\x1b[36m',  // 青色
      debug: '\x1b[90m', // 灰色
      reset: '\x1b[0m',
    };

    // 图标
    this.icons = {
      error: '❌',
      warn: '⚠️',
      info: 'ℹ️',
      debug: '🔍',
    };

    // 初始化文件日志
    if (this.options.enableFileLogging) {
      this.initFileLogging();
    }
  }

  /**
   * 初始化文件日志
   */
  initFileLogging() {
    try {
      const logDir = path.dirname(this.options.logFilePath);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
    } catch (error) {
      console.error('[Logger] Failed to initialize file logging:', error.message);
      this.options.enableFileLogging = false;
    }
  }

  /**
   * 检查是否应该输出日志
   * @param {string} level - 日志级别
   * @returns {boolean} 是否输出
   */
  shouldLog(level) {
    return this.levels[level] <= this.levels[this.options.level];
  }

  /**
   * 格式化日志消息
   * @param {string} level - 日志级别
   * @param {string} message - 消息
   * @param {Object} data - 附加数据
   * @returns {Object} 格式化的日志对象
   */
  formatLog(level, message, data = {}) {
    const log = {
      level: level.toUpperCase(),
      message,
      component: this.component,
    };

    if (this.options.includeTimestamp) {
      log.timestamp = new Date().toISOString();
    }

    if (Object.keys(data).length > 0) {
      log.data = data;
    }

    return log;
  }

  /**
   * 输出到控制台
   * @param {string} level - 日志级别
   * @param {Object} log - 格式化的日志对象
   */
  logToConsole(level, log) {
    if (!this.options.enableConsole) return;

    const color = this.options.colorize ? this.colors[level] : '';
    const reset = this.options.colorize ? this.colors.reset : '';
    const icon = this.icons[level] || '';

    if (this.options.structuredLogging) {
      // 结构化日志 (JSON)
      console.log(`${color}${JSON.stringify(log)}${reset}`);
    } else {
      // 可读格式
      const timestamp = log.timestamp ? `[${log.timestamp}]` : '';
      const component = `[${log.component}]`;
      const data = log.data ? ` ${JSON.stringify(log.data)}` : '';
      console.log(`${color}${timestamp}${icon} ${component} ${log.message}${data}${reset}`);
    }
  }

  /**
   * 输出到文件
   * @param {Object} log - 格式化的日志对象
   */
  logToFile(log) {
    if (!this.options.enableFileLogging) return;

    try {
      const logLine = JSON.stringify(log) + '\n';
      fs.appendFileSync(this.options.logFilePath, logLine, 'utf8');
    } catch (error) {
      console.error('[Logger] Failed to write to log file:', error.message);
    }
  }

  /**
   * 记录日志
   * @param {string} level - 日志级别
   * @param {string} message - 消息
   * @param {Object} data - 附加数据
   */
  log(level, message, data = {}) {
    if (!this.shouldLog(level)) return;

    const formattedLog = this.formatLog(level, message, data);

    this.logToConsole(level, formattedLog);
    this.logToFile(formattedLog);
  }

  /**
   * Error 级别日志
   * @param {string} message - 消息
   * @param {Object} data - 附加数据
   */
  error(message, data = {}) {
    this.log('error', message, data);
  }

  /**
   * Warning 级别日志
   * @param {string} message - 消息
   * @param {Object} data - 附加数据
   */
  warn(message, data = {}) {
    this.log('warn', message, data);
  }

  /**
   * Info 级别日志
   * @param {string} message - 消息
   * @param {Object} data - 附加数据
   */
  info(message, data = {}) {
    this.log('info', message, data);
  }

  /**
   * Debug 级别日志
   * @param {string} message - 消息
   * @param {Object} data - 附加数据
   */
  debug(message, data = {}) {
    this.log('debug', message, data);
  }

  /**
   * 创建子日志器
   * @param {string} subComponent - 子组件名称
   * @returns {Logger} 子日志器
   */
  child(subComponent) {
    const fullComponent = `${this.component}:${subComponent}`;
    return new Logger(fullComponent, this.options);
  }

  /**
   * 设置日志级别
   * @param {string} level - 日志级别
   */
  setLevel(level) {
    if (level in this.levels) {
      this.options.level = level;
    } else {
      console.warn(`[Logger] Invalid log level: ${level}`);
    }
  }

  /**
   * 获取当前日志级别
   * @returns {string} 日志级别
   */
  getLevel() {
    return this.options.level;
  }

  /**
   * 记录性能指标
   * @param {string} operation - 操作名称
   * @param {number} duration - 持续时间(ms)
   * @param {Object} metadata - 元数据
   */
  performance(operation, duration, metadata = {}) {
    this.info('Performance metric', {
      operation,
      duration: `${duration}ms`,
      ...metadata,
    });
  }

  /**
   * 记录扫描进度
   * @param {Object} progress - 进度信息
   */
  progress(progress) {
    this.debug('Scan progress', progress);
  }

  /**
   * 记录错误详情
   * @param {Error} error - 错误对象
   * @param {Object} context - 错误上下文
   */
  errorWithStack(error, context = {}) {
    const errorData = {
      message: error.message,
      code: error.code,
      stack: error.stack,
      ...context,
    };

    this.error(error.message, errorData);
  }

  /**
   * 创建性能计时器
   * @param {string} operation - 操作名称
   * @returns {Object} 计时器对象
   */
  createTimer(operation) {
    const startTime = Date.now();

    return {
      end: (metadata = {}) => {
        const duration = Date.now() - startTime;
        this.performance(operation, duration, metadata);
        return duration;
      },
    };
  }

  /**
   * 批量记录日志
   * @param {Array<Object>} logs - 日志数组
   */
  logBatch(logs) {
    logs.forEach(({ level, message, data }) => {
      this.log(level, message, data);
    });
  }

  /**
   * 清理日志文件
   * @param {number} keepDays - 保留天数
   */
  cleanOldLogs(keepDays = 7) {
    if (!this.options.enableFileLogging) return;

    try {
      const logDir = path.dirname(this.options.logFilePath);
      const files = fs.readdirSync(logDir);
      const now = Date.now();
      const maxAge = keepDays * 24 * 60 * 60 * 1000;

      files.forEach(file => {
        const filePath = path.join(logDir, file);
        const stats = fs.statSync(filePath);

        if (now - stats.mtimeMs > maxAge) {
          fs.unlinkSync(filePath);
          this.debug(`Cleaned old log file: ${file}`);
        }
      });
    } catch (error) {
      this.error('Failed to clean old logs', { error: error.message });
    }
  }
}

// ============================================
// Logger Manager
// ============================================

class LoggerManager {
  constructor() {
    this.loggers = new Map();
    this.globalOptions = {
      level: process.env.LOG_LEVEL || 'info',
      enableConsole: true,
      enableFileLogging: false,
      structuredLogging: true,
    };
  }

  /**
   * 获取或创建 Logger
   * @param {string} component - 组件名称
   * @param {Object} options - 配置选项
   * @returns {Logger} Logger 实例
   */
  getLogger(component, options = {}) {
    if (!this.loggers.has(component)) {
      const mergedOptions = { ...this.globalOptions, ...options };
      const logger = new Logger(component, mergedOptions);
      this.loggers.set(component, logger);
    }

    return this.loggers.get(component);
  }

  /**
   * 设置全局选项
   * @param {Object} options - 全局选项
   */
  setGlobalOptions(options) {
    this.globalOptions = { ...this.globalOptions, ...options };

    // 更新所有已存在的 logger
    for (const logger of this.loggers.values()) {
      Object.assign(logger.options, this.globalOptions);
    }
  }

  /**
   * 设置全局日志级别
   * @param {string} level - 日志级别
   */
  setGlobalLevel(level) {
    this.setGlobalOptions({ level });
  }

  /**
   * 清理所有 logger
   */
  clear() {
    this.loggers.clear();
  }

  /**
   * 获取所有 logger 的统计
   * @returns {Object} 统计信息
   */
  getStats() {
    return {
      totalLoggers: this.loggers.size,
      loggers: Array.from(this.loggers.keys()),
      globalLevel: this.globalOptions.level,
    };
  }
}

// ============================================
// 单例实例
// ============================================

const loggerManager = new LoggerManager();

/**
 * 获取 Logger 实例
 * @param {string} component - 组件名称
 * @param {Object} options - 配置选项
 * @returns {Logger} Logger 实例
 */
function getLogger(component, options = {}) {
  return loggerManager.getLogger(component, options);
}

/**
 * 设置全局日志配置
 * @param {Object} options - 全局选项
 */
function configureLogging(options) {
  loggerManager.setGlobalOptions(options);
}

// ============================================
// 导出
// ============================================

module.exports = {
  Logger,
  LoggerManager,
  getLogger,
  configureLogging,
  loggerManager,
};
