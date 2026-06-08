/**
 * Scanner Configuration
 *
 * 集中管理扫描器模块的所有配置参数
 * 避免硬编码，提高可维护性
 */

module.exports = {
  // ============================================
  // Scanner 配置
  // ============================================
  scanner: {
    // 文件扫描限制
    maxFileSize: 10 * 1024 * 1024, // 10MB
    maxLines: 50000,                // 每个文件最大行数
    maxIssuesPerFile: 1000,         // 每个文件最大问题数

    // 批处理配置
    batchSize: 20,                  // 默认批次大小
    batchDelay: 5,                  // 批次间延迟(ms)
    adaptiveBatching: true,         // 启用自适应批次大小

    // 排除配置
    excludeDirs: [
      'node_modules', '.git', 'dist', 'build', 'coverage',
      'ios', 'android', '.dart_tool', 'web', 'windows', 'macos', 'linux',
      '.vscode', '.idea', '.vs', 'Debug', 'Release', 'x64', 'arm64',
      'out', 'target', 'bin', 'obj', '.next', '.nuxt', '.cache',
      'tmp', 'temp', 'vendor', 'third_party', 'ThirdParty'
    ],
    excludeFiles: ['.min.js', '.min.css', '.map', '.bundle'],

    // 支持的文件扩展名
    supportedExtensions: ['.js', '.jsx', '.ts', '.tsx', '.vue', '.mjs', '.dart'],
  },

  // ============================================
  // AST Parser 配置
  // ============================================
  astParser: {
    // 缓存配置
    maxCacheSize: 1000,             // 最大缓存条目数
    cacheTTL: 60000,                // 缓存生存时间(ms) - 1分钟
    enableCache: true,              // 默认启用缓存

    // 解析限制
    maxNodes: 10000,                // 最大AST节点数
    maxDepth: 50,                   // 最大解析深度
    maxFiles: 5000,                 // 最大文件数

    // 性能配置
    cacheCleanupInterval: 50,       // 每N个文件清理一次缓存
    useIterativeTraversal: true,    // 使用迭代而非递归遍历
  },

  // ============================================
  // Code Graph 配置
  // ============================================
  codeGraph: {
    maxNodes: 10000,                // 图中最大节点数
    includeBody: true,              // 包含函数体
    resolveRelativePaths: true,     // 解析相对路径
    enableFunctionAnalysis: true,   // 启用函数分析
  },

  // ============================================
  // Project Scanner 配置
  // ============================================
  projectScanner: {
    // 项目类型检测
    detectProjectType: true,        // 自动检测项目类型
    scanDependencies: true,         // 扫描依赖
    classifyDependencies: true,     // 分类依赖

    // 版本命令映射
    versionCommands: {
      node: 'node --version',
      npm: 'npm --version',
      python: 'python --version',
      pip: 'pip --version',
      go: 'go version',
      java: 'java -version',
      ruby: 'ruby --version',
      php: 'php --version',
    },
  },

  // ============================================
  // 日志配置
  // ============================================
  logging: {
    level: process.env.LOG_LEVEL || 'info', // error, warn, info, debug
    enableConsole: true,            // 启用控制台输出
    enableFileLogging: false,       // 启用文件日志
    logFilePath: './logs/scanner.log',
    structuredLogging: true,        // 使用结构化日志(JSON)

    // 组件日志级别
    componentLevels: {
      'CodeScanner': 'info',
      'ASTParser': 'warn',
      'CodeGraph': 'warn',
      'ProjectScanner': 'info',
    },
  },

  // ============================================
  // 错误处理配置
  // ============================================
  errorHandling: {
    // 错误行为
    continueOnError: true,          // 遇到错误继续处理
    maxErrors: 100,                 // 最大错误数后停止
    throwOnCriticalError: true,     // 关键错误抛出异常

    // 错误报告
    detailedErrors: true,           // 详细错误信息
    includeStackTrace: false,       // 包含堆栈跟踪

    // 重试配置
    enableRetry: true,              // 启用重试
    maxRetries: 3,                  // 最大重试次数
    retryDelay: 1000,               // 重试延迟(ms)
  },

  // ============================================
  // 性能配置
  // ============================================
  performance: {
    // 并发配置
    maxConcurrentFiles: 20,         // 最大并发文件数
    maxConcurrentDirectories: 5,    // 最大并发目录数

    // 内存管理
    memoryLimit: 512 * 1024 * 1024, // 内存限制 512MB
    gcInterval: 100,                // GC触发间隔(文件数)

    // 进度报告
    progressReportInterval: 10,     // 进度报告间隔(文件数)
  },

  // ============================================
  // 安全配置
  // ============================================
  security: {
    // 路径安全
    allowSymlinks: false,           // 不允许符号链接
    maxPathLength: 260,             // 最大路径长度(Windows)

    // 内容安全
    maxFileSize: 10 * 1024 * 1024,  // 最大文件大小 10MB
    scanBinaryFiles: false,         // 不扫描二进制文件
  },

  // ============================================
  // 环境特定配置
  // ============================================
  env: {
    development: {
      logLevel: 'debug',
      enableCache: true,
      batchSize: 10,
    },
    production: {
      logLevel: 'info',
      enableCache: true,
      batchSize: 30,
    },
    test: {
      logLevel: 'warn',
      enableCache: false,
      batchSize: 5,
    },
  },

  // ============================================
  // 辅助方法
  // ============================================
  /**
   * 获取当前环境的配置
   * @param {string} env - 环境名称 (development, production, test)
   * @returns {Object} 环境配置
   */
  getEnvConfig(env = process.env.NODE_ENV || 'development') {
    return this.env[env] || this.env.development;
  },

  /**
   * 合并用户配置
   * @param {Object} userConfig - 用户配置
   * @returns {Object} 合并后的配置
   */
  merge(userConfig = {}) {
    const env = process.env.NODE_ENV || 'development';
    const envConfig = this.getEnvConfig(env);

    // 深度合并配置
    return this.deepMerge({}, this, envConfig, userConfig);
  },

  /**
   * 深度合并对象
   * @param {Object} target - 目标对象
   * @param {...Object} sources - 源对象
   * @returns {Object} 合并后的对象
   */
  deepMerge(target, ...sources) {
    if (!sources.length) return target;
    const source = sources.shift();

    if (this.isObject(target) && this.isObject(source)) {
      for (const key in source) {
        if (this.isObject(source[key])) {
          if (!target[key]) Object.assign(target, { [key]: {} });
          this.deepMerge(target[key], source[key]);
        } else {
          Object.assign(target, { [key]: source[key] });
        }
      }
    }

    return this.deepMerge(target, ...sources);
  },

  /**
   * 检查是否为对象
   * @param {*} item - 待检查项
   * @returns {boolean} 是否为对象
   */
  isObject(item) {
    return item && typeof item === 'object' && !Array.isArray(item);
  },

  /**
   * 获取配置值
   * @param {string} path - 配置路径 (点分隔)
   * @param {*} defaultValue - 默认值
   * @returns {*} 配置值
   */
  get(path, defaultValue = null) {
    const keys = path.split('.');
    let value = this;

    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return defaultValue;
      }
    }

    return value;
  },

  /**
   * 设置配置值
   * @param {string} path - 配置路径 (点分隔)
   * @param {*} value - 配置值
   */
  set(path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    let target = this;

    for (const key of keys) {
      if (!(key in target) || typeof target[key] !== 'object') {
        target[key] = {};
      }
      target = target[key];
    }

    target[lastKey] = value;
  },

  /**
   * 验证配置
   * @returns {Object} 验证结果
   */
  validate() {
    const errors = [];

    // 验证数值范围
    if (this.scanner.maxFileSize < 0) {
      errors.push('scanner.maxFileSize must be non-negative');
    }

    if (this.scanner.batchSize < 1) {
      errors.push('scanner.batchSize must be at least 1');
    }

    if (this.astParser.maxCacheSize < 0) {
      errors.push('astParser.maxCacheSize must be non-negative');
    }

    if (this.astParser.cacheTTL < 0) {
      errors.push('astParser.cacheTTL must be non-negative');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  },
};
