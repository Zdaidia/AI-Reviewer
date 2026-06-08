/**
 * QA Reviewer 默认配置
 *
 * 混合模式配置：
 * - 工具处理：基础质量检查（复用现有规则引擎和深度分析）
 * - AI 处理：需求符合性验证、代码优化建议
 */

const path = require('path');
const os = require('os');

/**
 * 获取资源文件路径（兼容开发模式和 asar 打包模式）
 */
function getResourcePath(...segments) {
  // qa-reviewer/config/ -> 向上三级到项目根
  const projectRoot = path.join(__dirname, '../../../');
  return path.join(projectRoot, ...segments);
}

const DefaultConfig = {
  // ========== 执行模式 ==========
  mode: 'hybrid', // 'hybrid' | 'ai-only' | 'tool-only'

  // ========== 工具处理部分 ==========
  tool: {
    // 是否启用规则引擎扫描
    enableRules: true,
    rulesPath: getResourcePath('rules.yaml'),

    // 是否启用深度代码分析
    enableDeepAnalysis: true,
    maxFilesPerScan: 100,
    maxLinesPerFile: 5000,

    // 扫描超时
    scanTimeout: 30000, // 30 秒
  },

  // ========== AI 处理部分 ==========
  ai: {
    // 需求符合性验证
    requirement: {
      enabled: true,
      model: 'zhipu:glm-5', // 默认使用的模型
      temperature: 0.3,     // 较低温度以获得更一致的结果
      maxTokens: 8000,
    },

    // UI 一致性检查
    ui: {
      enabled: true,
      useVisionAPI: true,    // 是否使用 Vision API
      cacheResults: true,    // 缓存 UI 分析结果
    },

    // 代码优化建议
    optimization: {
      enabled: true,
      includeRefactoring: true,
      includePerformance: true,
    },
  },

  // ========== 分段执行策略 ==========
  segmentation: {
    // 默认策略
    strategy: 'by_feature', // 'by_feature' | 'by_file' | 'by_dependency' | 'smart'

    // 分段限制（降低每段文件数以避免触发速率限制）
    maxFilesPerSegment: 3,  // 从10改为3，减少每段大小
    maxLinesPerSegment: 2000,  // 从3000改为2000
    maxTokensPerSegment: 5000,  // 从8000改为5000

    // 并行控制（设为 1 避免触发 API 频率限制）
    parallelSegments: 1,

    // 进度保存
    saveProgress: true,
    progressPath: path.join(os.homedir(), '.qa-reviewer', 'progress'),
  },

  // ========== 验证维度 ==========
  dimensions: {
    // 功能完整性
    functionality: {
      enabled: true,
      priority: 'high',
    },

    // UI 一致性
    uiConsistency: {
      enabled: true,
      priority: 'high',
    },

    // 数据验证
    dataValidation: {
      enabled: true,
      priority: 'medium',
    },

    // 异常处理
    exceptionHandling: {
      enabled: true,
      priority: 'medium',
    },

    // 代码优化
    optimization: {
      enabled: true,
      priority: 'low',
    },

    // 代码质量（内存泄漏、死循环等）
    quality: {
      enabled: true,
      priority: 'high',
    },
  },

  // ========== 项目类型配置 ==========
  projectTypes: {
    flutter: {
      filePatterns: ['**/*.dart'],
      excludePatterns: ['**/*.g.dart', '**/*.freezed.dart', '**/generated/**'],
      priority: ['functionality', 'ui_consistency', 'data_validation'],
    },

    react: {
      filePatterns: ['**/*.{js,jsx,ts,tsx}'],
      excludePatterns: ['**/node_modules/**', '**/dist/**', '**/*.test.{js,tsx}'],
      priority: ['functionality', 'exception_handling', 'optimization'],
    },

    vue: {
      filePatterns: ['**/*.vue', '**/*.{js,ts}'],
      excludePatterns: ['**/node_modules/**', '**/dist/**'],
      priority: ['ui_consistency', 'functionality', 'data_validation'],
    },

    generic: {
      filePatterns: ['**/*'],
      excludePatterns: ['**/node_modules/**', '**/dist/**', '**/build/**'],
      priority: ['functionality', 'quality'],
    },
  },

  // ========== 输出配置 ==========
  output: {
    // TODO 注释格式
    todoFormat: '//TODO: [{ruleId}] {description} - {suggestion}',

    // 是否添加到代码文件
    addTodosToCode: true,

    // 报告输出格式
    reportFormats: ['json'], // 'json' | 'html' | 'markdown'

    // 报告输出路径
    reportPath: path.join(os.homedir(), '.qa-reviewer', 'reports'),
  },

  // ========== 缓存配置 ==========
  cache: {
    enabled: true,
    cachePath: path.join(os.homedir(), '.qa-reviewer', 'cache'),
    uiCachePath: path.join(os.homedir(), '.qa-reviewer', 'ui-cache'),
    maxCacheAge: 7 * 24 * 60 * 60 * 1000, // 7 天
  },

  // ========== 历史记录配置 ==========
  history: {
    enabled: true,
    historyPath: path.join(os.homedir(), '.qa-reviewer', 'history'),
    maxHistoryEntries: 100,
  },
};

/**
 * 获取项目特定配置
 */
function getProjectConfig(projectPath, customConfig = {}) {
  const fs = require('fs');
  const path = require('path');

  // 检测项目类型
  const projectType = detectProjectType(projectPath);

  // 合并配置
  const config = {
    ...DefaultConfig,
    ...DefaultConfig.projectTypes[projectType],
    ...customConfig,
  };

  // 检查是否有自定义配置文件
  const customConfigPath = path.join(projectPath, '.qa-reviewer.json');
  if (fs.existsSync(customConfigPath)) {
    try {
      const userConfig = JSON.parse(fs.readFileSync(customConfigPath, 'utf8'));
      Object.assign(config, userConfig);
    } catch (e) {
      console.warn(`Failed to load custom config: ${e.message}`);
    }
  }

  return config;
}

/**
 * 检测项目类型
 */
function detectProjectType(projectPath) {
  const fs = require('fs');
  const path = require('path');

  // 检查 pubspec.yaml (Flutter)
  if (fs.existsSync(path.join(projectPath, 'pubspec.yaml'))) {
    return 'flutter';
  }

  // 检查 package.json (React/Vue)
  const packageJson = path.join(projectPath, 'package.json');
  if (fs.existsSync(packageJson)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJson, 'utf8'));
      if (pkg.dependencies?.react || pkg.dependencies?.next) {
        return 'react';
      }
      if (pkg.dependencies?.vue || pkg.dependencies?.nuxt) {
        return 'vue';
      }
    } catch (e) {
      // Ignore
    }
  }

  return 'generic';
}

module.exports = {
  DefaultConfig,
  getProjectConfig,
  detectProjectType,
};
