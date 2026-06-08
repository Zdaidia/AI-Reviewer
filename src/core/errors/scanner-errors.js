/**
 * Scanner Error Classes
 *
 * 统一的错误处理体系
 * - 结构化错误信息
 * - 错误分类和级别
 * - 便于调试和监控
 */

/**
 * Base Scanner Error
 */
class ScannerError extends Error {
  /**
   * @param {string} message - 错误消息
   * @param {string} code - 错误代码
   * @param {Object} details - 错误详情
   * @param {string} level - 错误级别 (error, warning, info)
   */
  constructor(message, code = 'UNKNOWN_ERROR', details = {}, level = 'error') {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.details = details;
    this.level = level;
    this.timestamp = new Date().toISOString();
    this.component = details.component || 'Scanner';

    // 捕获堆栈跟踪
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * 转换为 JSON
   * @returns {Object} JSON 对象
   */
  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      level: this.level,
      component: this.component,
      details: this.details,
      timestamp: this.timestamp,
      stack: process.env.NODE_ENV === 'development' ? this.stack : undefined,
    };
  }

  /**
   * 转换为字符串
   * @returns {string} 字符串表示
   */
  toString() {
    return `[${this.level}] [${this.code}] ${this.message}`;
  }

  /**
   * 检查是否为关键错误
   * @returns {boolean} 是否为关键错误
   */
  isCritical() {
    return this.level === 'error' || this.critical === true;
  }

  /**
   * 检查是否可重试
   * @returns {boolean} 是否可重试
   */
  isRetryable() {
    return this.retryable !== false; // 默认可重试
  }
}

// ============================================
// 文件相关错误
// ============================================

class FileNotFoundError extends ScannerError {
  constructor(filePath, details = {}) {
    super(
      `File not found: ${filePath}`,
      'FILE_NOT_FOUND',
      { filePath, ...details },
      'error'
    );
    this.retryable = false;
  }
}

class FileAccessError extends ScannerError {
  constructor(filePath, reason, details = {}) {
    super(
      `Cannot access file: ${filePath} - ${reason}`,
      'FILE_ACCESS_ERROR',
      { filePath, reason, ...details },
      'error'
    );
    this.retryable = true;
  }
}

class FileTooLargeError extends ScannerError {
  constructor(filePath, fileSize, maxSize, details = {}) {
    super(
      `File too large: ${filePath} (${fileSize} bytes, max: ${maxSize})`,
      'FILE_TOO_LARGE',
      { filePath, fileSize, maxSize, ...details },
      'warning'
    );
    this.retryable = false;
  }
}

class InvalidFileError extends ScannerError {
  constructor(filePath, reason, details = {}) {
    super(
      `Invalid file: ${filePath} - ${reason}`,
      'INVALID_FILE',
      { filePath, reason, ...details },
      'warning'
    );
    this.retryable = false;
  }
}

// ============================================
// 解析相关错误
// ============================================

class ParseError extends ScannerError {
  constructor(filePath, reason, details = {}) {
    super(
      `Parse error in ${filePath}: ${reason}`,
      'PARSE_ERROR',
      { filePath, reason, ...details },
      'error'
    );
    this.retryable = false;
  }
}

class ASTParseError extends ScannerError {
  constructor(filePath, language, reason, details = {}) {
    super(
      `AST parsing failed for ${filePath} (${language}): ${reason}`,
      'AST_PARSE_ERROR',
      { filePath, language, reason, ...details },
      'warning'
    );
    this.retryable = false;
  }
}

class CacheError extends ScannerError {
  constructor(operation, reason, details = {}) {
    super(
      `Cache ${operation} failed: ${reason}`,
      'CACHE_ERROR',
      { operation, reason, ...details },
      'warning'
    );
    this.retryable = true;
  }
}

// ============================================
// 扫描相关错误
// ============================================

class ScanError extends ScannerError {
  constructor(target, reason, details = {}) {
    super(
      `Scan error for ${target}: ${reason}`,
      'SCAN_ERROR',
      { target, reason, ...details },
      'error'
    );
    this.retryable = true;
  }
}

class DirectoryTraversalError extends ScannerError {
  constructor(dirPath, reason, details = {}) {
    super(
      `Directory traversal error: ${dirPath} - ${reason}`,
      'DIR_TRAVERSAL_ERROR',
      { dirPath, reason, ...details },
      'error'
    );
    this.retryable = true;
  }
}

class MaxErrorsExceededError extends ScannerError {
  constructor(errorCount, maxErrors, details = {}) {
    super(
      `Maximum errors exceeded: ${errorCount}/${maxErrors}`,
      'MAX_ERRORS_EXCEEDED',
      { errorCount, maxErrors, ...details },
      'error'
    );
    this.critical = true;
    this.retryable = false;
  }
}

// ============================================
// 配置相关错误
// ============================================

class ConfigurationError extends ScannerError {
  constructor(configPath, reason, details = {}) {
    super(
      `Configuration error: ${configPath} - ${reason}`,
      'CONFIG_ERROR',
      { configPath, reason, ...details },
      'error'
    );
    this.retryable = false;
  }
}

class InvalidOptionError extends ScannerError {
  constructor(option, value, expected, details = {}) {
    super(
      `Invalid option: ${option} = ${value} (expected: ${expected})`,
      'INVALID_OPTION',
      { option, value, expected, ...details },
      'error'
    );
    this.retryable = false;
  }
}

// ============================================
// 网络相关错误
// ============================================

class NetworkError extends ScannerError {
  constructor(url, reason, details = {}) {
    super(
      `Network error: ${url} - ${reason}`,
      'NETWORK_ERROR',
      { url, reason, ...details },
      'error'
    );
    this.retryable = true;
  }
}

class TimeoutError extends ScannerError {
  constructor(operation, timeout, details = {}) {
    super(
      `Operation timeout: ${operation} after ${timeout}ms`,
      'TIMEOUT_ERROR',
      { operation, timeout, ...details },
      'error'
    );
    this.retryable = true;
  }
}

// ============================================
// 资源相关错误
// ============================================

class ResourceExhaustedError extends ScannerError {
  constructor(resourceType, limit, details = {}) {
    super(
      `Resource exhausted: ${resourceType} (limit: ${limit})`,
      'RESOURCE_EXHAUSTED',
      { resourceType, limit, ...details },
      'error'
    );
    this.critical = true;
    this.retryable = false;
  }
}

class MemoryLimitError extends ScannerError {
  constructor(currentUsage, limit, details = {}) {
    super(
      `Memory limit exceeded: ${currentUsage} bytes (limit: ${limit} bytes)`,
      'MEMORY_LIMIT_EXCEEDED',
      { currentUsage, limit, ...details },
      'error'
    );
    this.critical = true;
    this.retryable = false;
  }
}

// ============================================
// 错误工厂
// ============================================

class ErrorFactory {
  /**
   * 从普通错误创建 ScannerError
   * @param {Error} error - 原始错误
   * @param {Object} context - 错误上下文
   * @returns {ScannerError} 扫描器错误
   */
  static fromError(error, context = {}) {
    if (error instanceof ScannerError) {
      return error;
    }

    // 根据错误类型映射
    const errorTypeMap = {
      'ENOENT': FileNotFoundError,
      'EACCES': FileAccessError,
      'EPERM': FileAccessError,
      'ENOSPC': ResourceExhaustedError,
    };

    if (error.code && errorTypeMap[error.code]) {
      const ErrorClass = errorTypeMap[error.code];
      return new ErrorClass(
        context.filePath || context.target,
        error.message,
        { ...context, originalError: error }
      );
    }

    // 默认错误
    return new ScannerError(
      error.message,
      'UNKNOWN_ERROR',
      { ...context, originalError: error },
      'error'
    );
  }

  /**
   * 批量处理错误
   * @param {Array<Error>} errors - 错误数组
   * @returns {Object} 错误统计
   */
  static summarize(errors) {
    const summary = {
      total: errors.length,
      byLevel: { error: 0, warning: 0, info: 0 },
      byCode: {},
      critical: [],
      retryable: 0,
    };

    for (const error of errors) {
      const scannerError = error instanceof ScannerError
        ? error
        : ErrorFactory.fromError(error);

      summary.byLevel[scannerError.level]++;
      summary.byCode[scannerError.code] =
        (summary.byCode[scannerError.code] || 0) + 1;

      if (scannerError.isCritical()) {
        summary.critical.push(scannerError);
      }

      if (scannerError.isRetryable()) {
        summary.retryable++;
      }
    }

    return summary;
  }
}

// ============================================
// 导出
// ============================================

module.exports = {
  // 基础错误类
  ScannerError,
  ErrorFactory,

  // 文件相关
  FileNotFoundError,
  FileAccessError,
  FileTooLargeError,
  InvalidFileError,

  // 解析相关
  ParseError,
  ASTParseError,
  CacheError,

  // 扫描相关
  ScanError,
  DirectoryTraversalError,
  MaxErrorsExceededError,

  // 配置相关
  ConfigurationError,
  InvalidOptionError,

  // 网络相关
  NetworkError,
  TimeoutError,

  // 资源相关
  ResourceExhaustedError,
  MemoryLimitError,
};
