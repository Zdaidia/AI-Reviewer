/**
 * Smart Rule Recommender
 *
 * 智能规则推荐系统
 * - 基于项目类型自动推荐规则
 * - 基于代码特征调整规则
 * - 学习历史扫描结果
 * - 动态优化规则集
 */

const fs = require('fs');
const path = require('path');
const { getLogger } = require('../utils/logger');
const config = require('../../config/scanner-limits');

class SmartRuleRecommender {
  constructor(options = {}) {
    this.options = {
      enableLearning: options.enableLearning !== false,
      learningDataPath: options.learningDataPath || './.rule-learning.json',
      updateThreshold: options.updateThreshold || 10,
      ...options,
    };

    this.logger = getLogger('SmartRuleRecommender');
    this.ruleDatabase = this.initRuleDatabase();
    this.learningData = new Map();
    this.scanHistory = [];

    // 加载学习数据
    this.loadLearningData();
  }

  /**
   * 初始化规则数据库
   * @returns {Map} 规则数据库
   */
  initRuleDatabase() {
    const rules = new Map();

    // ============================================
    // 通用规则（所有项目）
    // ============================================
    rules.set('general', [
      {
        id: 'no-console',
        name: 'No console statements',
        category: 'best-practices',
        severity: 'warning',
        languages: ['javascript', 'typescript'],
        description: 'Avoid console statements in production code',
        recommendation: {
          reason: 'Console statements should be removed in production',
          alternative: 'Use a proper logging library',
        },
      },
      {
        id: 'no-debugger',
        name: 'No debugger statements',
        category: 'best-practices',
        severity: 'error',
        languages: ['javascript', 'typescript'],
        description: 'Remove debugger statements before committing',
        recommendation: {
          reason: 'Debugger statements halt execution',
          alternative: 'Use debugger tools instead',
        },
      },
      {
        id: 'max-lines',
        name: 'Max lines per file',
        category: 'complexity',
        severity: 'warning',
        languages: ['all'],
        description: 'Files should not exceed max lines',
        recommendation: {
          reason: 'Large files are hard to maintain',
          alternative: 'Split into smaller modules',
        },
      },
    ]);

    // ============================================
    // React/Next.js 项目
    // ============================================
    rules.set('react', [
      {
        id: 'react-hooks-exhaustive-deps',
        name: 'React hooks exhaustive deps',
        category: 'react',
        severity: 'warning',
        languages: ['javascript', 'typescript'],
        frameworks: ['react', 'next'],
        description: 'Ensure all dependencies are listed in useEffect hooks',
        recommendation: {
          reason: 'Missing dependencies cause bugs',
          alternative: 'Include all dependencies in dependency array',
        },
      },
      {
        id: 'react-no-unescaped-entities',
        name: 'React no unescaped entities',
        category: 'react',
        severity: 'error',
        languages: ['javascript', 'typescript'],
        frameworks: ['react', 'next'],
        description: 'HTML entities must be escaped',
        recommendation: {
          reason: 'Unescaped entities can cause rendering issues',
          alternative: 'Use &lt; &gt; &amp; etc.',
        },
      },
      {
        id: 'react-jsx-key',
        name: 'React JSX key',
        category: 'react',
        severity: 'error',
        languages: ['javascript', 'typescript'],
        frameworks: ['react', 'next'],
        description: 'Missing key prop in lists',
        recommendation: {
          reason: 'Keys help React identify items',
          alternative: 'Add unique key prop to list items',
        },
      },
      {
        id: 'react-perf-jsx-no-new-array-as-prop',
        name: 'No new arrays as props',
        category: 'react-performance',
        severity: 'warning',
        languages: ['javascript', 'typescript'],
        frameworks: ['react', 'next'],
        description: 'Avoid creating new arrays in JSX props',
        recommendation: {
          reason: 'Causes unnecessary re-renders',
          alternative: 'Move array creation outside component',
        },
      },
    ]);

    // ============================================
    // Vue 项目
    // ============================================
    rules.set('vue', [
      {
        id: 'vue-no-template-shadow',
        name: 'Vue no template shadow',
        category: 'vue',
        severity: 'error',
        languages: ['vue'],
        frameworks: ['vue', 'nuxt'],
        description: 'Avoid shadowing variables in templates',
        recommendation: {
          reason: 'Variable shadowing causes bugs',
          alternative: 'Use different variable names',
        },
      },
      {
        id: 'vue-require-v-for-key',
        name: 'Vue require v-for key',
        category: 'vue',
        severity: 'error',
        languages: ['vue'],
        frameworks: ['vue', 'nuxt'],
        description: 'v-for directives require key attribute',
        recommendation: {
          reason: 'Keys help Vue identify items',
          alternative: 'Add :key attribute to v-for',
        },
      },
      {
        id: 'vue-no-unused-vars',
        name: 'Vue no unused vars',
        category: 'vue',
        severity: 'warning',
        languages: ['vue'],
        frameworks: ['vue', 'nuxt'],
        description: 'Remove unused variables',
        recommendation: {
          reason: 'Unused variables indicate dead code',
          alternative: 'Remove or use the variable',
        },
      },
    ]);

    // ============================================
    // Node.js 后端项目
    // ============================================
    rules.set('nodejs', [
      {
        id: 'no-sync',
        name: 'No synchronous methods',
        category: 'async',
        severity: 'warning',
        languages: ['javascript', 'typescript'],
        frameworks: ['nodejs', 'express'],
        description: 'Avoid synchronous methods in async contexts',
        recommendation: {
          reason: 'Sync methods block event loop',
          alternative: 'Use async/await or promises',
        },
      },
      {
        id: 'handle-callback-err',
        name: 'Handle callback errors',
        category: 'async',
        severity: 'error',
        languages: ['javascript', 'typescript'],
        frameworks: ['nodejs', 'express'],
        description: 'Always handle errors in callbacks',
        recommendation: {
          reason: 'Unhandled errors cause crashes',
          alternative: 'Add error parameter to callbacks',
        },
      },
      {
        id: 'no-mixed-requires',
        name: 'No mixed requires',
        category: 'module',
        severity: 'warning',
        languages: ['javascript', 'typescript'],
        frameworks: ['nodejs', 'express'],
        description: 'Don\'t mix require and import',
        recommendation: {
          reason: 'Consistency improves maintainability',
          alternative: 'Use either require or import exclusively',
        },
      },
    ]);

    // ============================================
    // Flutter/Dart 项目
    // ============================================
    rules.set('flutter', [
      {
        id: 'flutter-prefer-const',
        name: 'Flutter prefer const',
        category: 'flutter-performance',
        severity: 'info',
        languages: ['dart'],
        frameworks: ['flutter'],
        description: 'Use const constructors where possible',
        recommendation: {
          reason: 'Const constructors improve performance',
          alternative: 'Add const keyword to constructors',
        },
      },
      {
        id: 'flutter-avoid-unnecessary-type-assertions',
        name: 'Avoid unnecessary type assertions',
        category: 'flutter',
        severity: 'info',
        languages: ['dart'],
        frameworks: ['flutter'],
        description: 'Remove redundant type assertions',
        recommendation: {
          reason: 'Type inference is sufficient',
          alternative: 'Let Dart infer types',
        },
      },
      {
        id: 'flutter-use-build-context-synchronously',
        name: 'Use BuildContext synchronously',
        category: 'flutter',
        severity: 'error',
        languages: ['dart'],
        frameworks: ['flutter'],
        description: 'Don\'t store BuildContext for later use',
        recommendation: {
          reason: 'BuildContext becomes invalid after build',
          alternative: 'Use context immediately in build method',
        },
      },
    ]);

    return rules;
  }

  /**
   * 分析项目并推荐规则
   * @param {string} projectPath - 项目路径
   * @param {Object} projectInfo - 项目信息
   * @returns {Array} 推荐的规则
   */
  async recommendRules(projectPath, projectInfo = {}) {
    this.logger.info('Analyzing project for rule recommendations', {
      projectPath,
    });

    const recommendations = {
      recommended: [],
      optional: [],
      notRecommended: [],
      reasoning: [],
    };

    // 检测项目类型和框架
    const detectedFrameworks = this.detectFrameworks(projectPath, projectInfo);
    const detectedLanguages = this.detectLanguages(projectPath, projectInfo);

    this.logger.debug('Detected frameworks and languages', {
      frameworks: detectedFrameworks,
      languages: detectedLanguages,
    });

    // 基于框架推荐规则
    for (const framework of detectedFrameworks) {
      const frameworkRules = this.ruleDatabase.get(framework);
      if (frameworkRules) {
        recommendations.recommended.push(...frameworkRules);
        recommendations.reasoning.push({
          category: 'framework',
          framework,
          reason: `Detected ${framework} framework`,
        });
      }
    }

    // 基于语言推荐规则
    for (const language of detectedLanguages) {
      const languageRules = this.ruleDatabase.get(language);
      if (languageRules) {
        recommendations.recommended.push(...languageRules);
      }
    }

    // 总是添加通用规则
    const generalRules = this.ruleDatabase.get('general');
    if (generalRules) {
      recommendations.recommended.push(...generalRules);
    }

    // 去重
    recommendations.recommended = this.deduplicateRules(recommendations.recommended);

    // 应用学习数据
    if (this.options.enableLearning) {
      this.applyLearningData(recommendations, projectPath);
    }

    this.logger.info('Rule recommendations generated', {
      recommended: recommendations.recommended.length,
      optional: recommendations.optional.length,
      reasoning: recommendations.reasoning.length,
    });

    return recommendations;
  }

  /**
   * 检测项目使用的框架
   * @param {string} projectPath - 项目路径
   * @param {Object} projectInfo - 项目信息
   * @returns {Array} 检测到的框架
   */
  detectFrameworks(projectPath, projectInfo) {
    const frameworks = [];

    // 检查 package.json
    const packageJsonPath = path.join(projectPath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };

        // 检测框架
        if (deps.react || deps['react-dom']) frameworks.push('react');
        if (deps.vue || deps['vue-router']) frameworks.push('vue');
        if (deps.next) frameworks.push('next');
        if (deps.nuxt) frameworks.push('nuxt');
        if (deps.express) frameworks.push('express');
        if (deps.angular || deps['@angular/core']) frameworks.push('angular');
      } catch (error) {
        this.logger.warn('Failed to parse package.json', {
          error: error.message,
        });
      }
    }

    // 检查 pubspec.yaml (Flutter)
    const pubspecPath = path.join(projectPath, 'pubspec.yaml');
    if (fs.existsSync(pubspecPath)) {
      frameworks.push('flutter');
    }

    // 检查项目信息中的框架
    if (projectInfo.framework) {
      frameworks.push(projectInfo.framework);
    }

    return [...new Set(frameworks)]; // 去重
  }

  /**
   * 检测项目使用的语言
   * @param {string} projectPath - 项目路径
   * @param {Object} projectInfo - 项目信息
   * @returns {Array} 检测到的语言
   */
  detectLanguages(projectPath, projectInfo) {
    const languages = [];

    // 从项目信息获取
    if (projectInfo.languages) {
      languages.push(...projectInfo.languages);
    }

    // 基于框架推断语言
    const frameworks = this.detectFrameworks(projectPath, projectInfo);
    for (const framework of frameworks) {
      if (['react', 'next', 'vue', 'nuxt', 'angular', 'express'].includes(framework)) {
        languages.push('javascript');
        languages.push('typescript');
      } else if (framework === 'flutter') {
        languages.push('dart');
      }
    }

    return [...new Set(languages)]; // 去重
  }

  /**
   * 去重规则
   * @param {Array} rules - 规则数组
   * @returns {Array} 去重后的规则
   */
  deduplicateRules(rules) {
    const seen = new Set();
    const unique = [];

    for (const rule of rules) {
      if (!seen.has(rule.id)) {
        seen.add(rule.id);
        unique.push(rule);
      }
    }

    return unique;
  }

  /**
   * 应用学习数据
   * @param {Object} recommendations - 推荐结果
   * @param {string} projectPath - 项目路径
   */
  applyLearningData(recommendations, projectPath) {
    const learningKey = this.getLearningKey(projectPath);
    const learning = this.learningData.get(learningKey);

    if (!learning) {
      return;
    }

    this.logger.debug('Applying learning data', {
      learningKey,
      dataPoints: learning.history?.length || 0,
    });

    // 基于历史调整推荐
    for (const rule of recommendations.recommended) {
      const ruleHistory = learning.history?.filter(h => h.ruleId === rule.id);

      if (ruleHistory && ruleHistory.length > 0) {
        // 计算规则有效性
        const effectiveness = this.calculateRuleEffectiveness(ruleHistory);

        if (effectiveness < 0.3) {
          // 规则效果差，降级为可选
          rule.priority = 'low';
          rule.note = 'Low effectiveness in past scans';
        } else if (effectiveness > 0.7) {
          // 规则效果好，提升优先级
          rule.priority = 'high';
          rule.note = 'High effectiveness in past scans';
        }
      }
    }
  }

  /**
   * 计算规则有效性
   * @param {Array} history - 历史记录
   * @returns {number} 有效性分数 (0-1)
   */
  calculateRuleEffectiveness(history) {
    if (history.length === 0) return 0.5;

    let totalScore = 0;

    for (const record of history) {
      // 基于触发频率和误报率计算
      const frequencyScore = Math.min(record.triggerCount / 10, 1);
      const falsePositiveScore = 1 - (record.falsePositiveRate || 0);

      totalScore += (frequencyScore + falsePositiveScore) / 2;
    }

    return totalScore / history.length;
  }

  /**
   * 记录扫描结果
   * @param {string} projectPath - 项目路径
   * @param {Object} scanResult - 扫描结果
   */
  recordScanResult(projectPath, scanResult) {
    if (!this.options.enableLearning) {
      return;
    }

    const learningKey = this.getLearningKey(projectPath);
    let learning = this.learningData.get(learningKey) || {
      projectPath,
      scans: [],
      history: [],
    };

    // 记录扫描
    learning.scans.push({
      timestamp: Date.now(),
      issueCount: scanResult.totalIssues || 0,
      fileCount: scanResult.totalFiles || 0,
    });

    // 记录规则触发情况
    if (scanResult.issuesByRule) {
      for (const [ruleId, issues] of Object.entries(scanResult.issuesByRule)) {
        const existing = learning.history.find(h => h.ruleId === ruleId);

        if (existing) {
          existing.triggerCount += issues.length;
          existing.lastSeen = Date.now();
        } else {
          learning.history.push({
            ruleId,
            triggerCount: issues.length,
            firstSeen: Date.now(),
            lastSeen: Date.now(),
          });
        }
      }
    }

    this.learningData.set(learningKey, learning);

    // 定期保存学习数据
    if (learning.scans.length % this.options.updateThreshold === 0) {
      this.saveLearningData();
    }
  }

  /**
   * 获取学习数据的键
   * @param {string} projectPath - 项目路径
   * @returns {string} 学习键
   */
  getLearningKey(projectPath) {
    return path.normalize(projectPath);
  }

  /**
   * 加载学习数据
   */
  loadLearningData() {
    try {
      if (!fs.existsSync(this.options.learningDataPath)) {
        return;
      }

      const content = fs.readFileSync(this.options.learningDataPath, 'utf8');
      const data = JSON.parse(content);

      for (const [key, value] of Object.entries(data)) {
        this.learningData.set(key, value);
      }

      this.logger.info('Learning data loaded', {
        path: this.options.learningDataPath,
        projects: this.learningData.size,
      });
    } catch (error) {
      this.logger.warn('Failed to load learning data', {
        error: error.message,
      });
    }
  }

  /**
   * 保存学习数据
   */
  saveLearningData() {
    try {
      const data = {};
      for (const [key, value] of this.learningData.entries()) {
        data[key] = value;
      }

      // 确保目录存在
      const dir = path.dirname(this.options.learningDataPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(
        this.options.learningDataPath,
        JSON.stringify(data, null, 2),
        'utf8'
      );

      this.logger.debug('Learning data saved', {
        path: this.options.learningDataPath,
      });
    } catch (error) {
      this.logger.error('Failed to save learning data', {
        error: error.message,
      });
    }
  }

  /**
   * 获取推荐统计
   * @returns {Object} 统计信息
   */
  getStats() {
    return {
      ruleCategories: Array.from(this.ruleDatabase.keys()),
      totalRules: Array.from(this.ruleDatabase.values()).reduce(
        (sum, rules) => sum + rules.length,
        0
      ),
      learningDataSize: this.learningData.size,
      enableLearning: this.options.enableLearning,
    };
  }

  /**
   * 清除学习数据
   * @param {string} projectPath - 项目路径（可选）
   */
  clearLearningData(projectPath = null) {
    if (projectPath) {
      const key = this.getLearningKey(projectPath);
      this.learningData.delete(key);
    } else {
      this.learningData.clear();
    }

    this.saveLearningData();
    this.logger.info('Learning data cleared', { projectPath });
  }
}

module.exports = SmartRuleRecommender;
