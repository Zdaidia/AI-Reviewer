/**
 * Dependency Classifier Module
 *
 * 职责：
 * - 识别依赖的用途和分类
 * - 对依赖进行分组（UI、网络、状态管理等）
 * - 提供依赖的详细信息
 * - 检测重复或替代的依赖
 *
 * 支持的生态系统：
 * - npm (Node.js)
 * - pub (Dart/Flutter)
 * - pip (Python)
 * - go modules (Go)
 * - maven (Java)
 * - gems (Ruby)
 * - composer (PHP)
 */

class DependencyClassifier {
  constructor() {
    // 依赖分类数据库
    this.categories = new Map();
    // 依赖描述数据库
    this.descriptions = new Map();
    this.initCategories();
  }

  /**
   * 初始化分类数据库
   */
  initCategories() {
    // ==================== npm (Node.js) 分类 ====================
    this.categories.set('npm', {
      // UI 框架
      'framework': {
        patterns: ['react', 'react-dom', 'vue', '@vue/', 'angular', 'angular/core', '@angular/', 'svelte', 'solid-js', 'preact', 'mithril', 'inferno', 'riot'],
        description: 'UI 框架',
        color: '#FF6B6B'
      },
      // UI 组件库
      'ui-library': {
        patterns: ['@mui/', '@material-ui/', '@chakra-ui/', 'antd', 'ant-design', 'react-bootstrap', 'reactstrap', 'vuetify', 'quasar', 'element-plus', 'element-ui', '@headlessui/', '@heroicons/', '@tabler/', '@fortawesome/', 'lucide-react', 'radix-ui', '@radix-ui/'],
        description: 'UI 组件库',
        color: '#FF8E8E'
      },
      // 状态管理
      'state-management': {
        patterns: ['redux', 'mobx', 'zustand', 'recoil', 'jotai', 'valtio', 'effector', 'pinia', 'vuex', '@xstate/', 'immer', '@reduxjs/', 'react-query', '@tanstack/react-query', 'swr', 'apollo-client', '@apollo/client', 'relay', 'mobx-react', '@ngrx/'],
        description: '状态管理',
        color: '#FFA94D'
      },
      // 路由
      'routing': {
        patterns: ['react-router', 'react-router-dom', '@reach/router', 'vue-router', '@angular/router', 'svelte-navigator', 'preact-router', 'wouter', 'astro', 'next', 'nuxt', 'remix', '@remix-run/', 'gatsby'],
        description: '路由',
        color: '#FFD43B'
      },
      // 表单处理
      'forms': {
        patterns: ['react-hook-form', 'formik', 'redux-form', 'final-form', 'vee-validate', 'vee-validate', '@tanstack/react-form', 'react-final-form', 'yup', 'zod', 'joi', 'superstruct', 'vest'],
        description: '表单处理',
        color: '#69DB7C'
      },
      // 数据请求
      'http-client': {
        patterns: ['axios', 'fetch', 'ky', 'superagent', 'request', 'got', 'node-fetch', 'cross-fetch', 'unfetch', 'whatwg-fetch', '@apollo/client', 'apollo-client', 'graphql-request', '@urql/', 'graphql-hooks'],
        description: 'HTTP 客户端',
        color: '#4DABF7'
      },
      // 构建工具
      'build-tools': {
        patterns: ['webpack', 'vite', 'rollup', 'esbuild', 'parcel', 'browserify', '@babel/', 'babel', 'terser', 'uglify', 'postcss', 'autoprefixer', 'tailwindcss', '@tailwindcss/', 'sass', 'less', 'stylus'],
        description: '构建工具',
        color: '#748FFC'
      },
      // 测试框架
      'testing': {
        patterns: ['jest', 'vitest', 'mocha', 'chai', 'jasmine', 'karma', 'tape', 'ava', 'qunit', 'cypress', 'playwright', 'puppeteer', 'selenium', '@testing-library/', 'testing-library', '@storybook/', 'react-test-renderer', 'enzyme', '@wdio/', 'nightwatch'],
        description: '测试框架',
        color: '#ADB5BD'
      },
      // 工具库
      'utils': {
        patterns: ['lodash', 'underscore', 'ramda', 'dayjs', 'date-fns', 'moment', 'axios', 'qs', 'clsx', 'classnames', 'prop-types', '@types/', 'uuid', 'crypto-js', 'md5', 'base64topdf', 'validator', 'joi', 'yup'],
        description: '工具库',
        color: '#CED4DA'
      },
      // 动画
      'animation': {
        patterns: ['framer-motion', 'react-spring', '@react-spring/', 'react-transition-group', 'gsap', 'anime.js', 'velocity-react', 'react-motion', '@animated/', 'lottie-react', '@lottie/', 'remotion', 'auto-animate'],
        description: '动画',
        color: '#FF6B9D'
      },
      // 图标
      'icons': {
        patterns: ['@ant-design/icons', '@heroicons/', '@tabler/', '@fortawesome/', 'lucide-react', 'react-icons', 'feather-icons', 'material-ui/icons', '@mui/icons-material', '@mdi/', 'ionicons'],
        description: '图标库',
        color: '#FCC419'
      },
      // 样式
      'styling': {
        patterns: ['@emotion/', '@styled-components/', 'styled-components', 'emotion', 'linaria', 'astroturf', 'css-modules', 'glamor', 'aphrodite', 'fela', 'jss', 'styled-jsx', 'goober', 'twrnc'],
        description: 'CSS-in-JS',
        color: '#F06595'
      },
    });

    // ==================== pub (Dart/Flutter) 分类 ====================
    this.categories.set('pub', {
      // Flutter 核心
      'flutter': {
        patterns: ['flutter', 'cupertino_icons', 'material'],
        description: 'Flutter 核心',
        color: '#02569B'
      },
      // UI 组件库
      'ui-library': {
        patterns: ['fluro', 'go_router', 'auto_route', 'beamer', 'page_transition', 'flutter_bloc', 'provider', 'riverpod', 'get', 'mobx', 'redux', 'flutter_redux', 'inherited_widget', 'scoped_model'],
        description: 'UI 组件库',
        color: '#03A9F4'
      },
      // 状态管理
      'state-management': {
        patterns: ['provider', 'riverpod', 'bloc', 'flutter_bloc', 'rxBloc', 'flutter_redux', 'redux', 'mobx', 'get', 'inherited_widget', 'scoped_model', 'state_notifier', 'flutter_hooks'],
        description: '状态管理',
        color: '#2196F3'
      },
      // 网络请求
      'network': {
        patterns: ['http', 'dio', 'retrofit', 'graphql_flutter', 'web_socket_channel', 'socket_io', 'connectivity_plus', 'internet_connection_checker'],
        description: '网络请求',
        color: '#00BCD4'
      },
      // 本地存储
      'storage': {
        patterns: ['shared_preferences', 'hive', 'sqflite', 'isar', 'objectbox', 'drift', 'floor', 'sembast', 'shared_preferences', 'flutter_secure_storage', 'localstorage'],
        description: '本地存储',
        color: '#009688'
      },
      // 工具库
      'utils': {
        patterns: ['path_provider', 'intl', 'uuid', 'collection', 'quiver', 'rxdart', 'functional', 'fpm', 'retry', 'logger', 'stack_trace'],
        description: '工具库',
        color: '#607D8B'
      },
      // 动画
      'animation': {
        patterns: ['animations', 'flutter_animate', 'lottie', 'flare_flutter', 'rive', 'simple_animations', 'animated_text_kit', 'shimmer', 'flutter_staggered_animations'],
        description: '动画',
        color: '#E91E63'
      },
      // 图标
      'icons': {
        patterns: ['cupertino_icons', 'font_awesome_flutter', 'flutter_svg', 'vector_graphics', 'phosphor_flutter', 'iconify'],
        description: '图标库',
        color: '#FFC107'
      },
      // 设备功能
      'device': {
        patterns: ['camera', 'image_picker', 'geolocator', 'permission_handler', 'connectivity_plus', 'battery_plus', 'device_info_plus', 'sensors_plus', 'local_auth'],
        description: '设备功能',
        color: '#9C27B0'
      },
      // 测试
      'testing': {
        patterns: ['flutter_test', 'mockito', 'http_mock_adapter', 'bloc_test', 'provider_test', 'integration_test', 'golden_toolkit'],
        description: '测试',
        color: '#795548'
      },
    });

    // ==================== pip (Python) 分类 ====================
    this.categories.set('pip', {
      // Web 框架
      'framework': {
        patterns: ['django', 'flask', 'fastapi', 'tornado', 'starlette', 'sanic', 'aiohttp', 'pyramid', 'bottle', 'cherrypy'],
        description: 'Web 框架',
        color: '#306998'
      },
      // 异步任务
      'async': {
        patterns: ['celery', 'rq', 'dramatiq', 'huey', 'kombu', 'billiard'],
        description: '异步任务',
        color: '#FFC107'
      },
      // 数据库
      'database': {
        patterns: ['sqlalchemy', 'psycopg2', 'pymysql', 'pymongo', 'redis', 'cassandra-driver', 'elasticsearch', 'mongomock', 'alembic', 'peewee', 'pony'],
        description: '数据库',
        color: '#00BCD4'
      },
      // 数据验证
      'validation': {
        patterns: ['pydantic', 'marshmallow', 'cerberus', 'schema', 'voluptuous', 'validators'],
        description: '数据验证',
        color: '#4CAF50'
      },
      // API
      'api': {
        patterns: ['requests', 'httpx', 'aiohttp', 'urllib3', 'treq', 'httpie'],
        description: 'HTTP 客户端',
        color: '#2196F3'
      },
      // 数据科学
      'data-science': {
        patterns: ['numpy', 'pandas', 'scipy', 'matplotlib', 'seaborn', 'plotly', 'scikit-learn', 'tensorflow', 'pytorch', 'keras'],
        description: '数据科学',
        color: '#FF9800'
      },
      // 测试
      'testing': {
        patterns: ['pytest', 'unittest', 'nose2', 'mock', 'pytest-mock', 'faker', 'factory_boy', 'testfixtures'],
        description: '测试',
        color: '#9E9E9E'
      },
    });

    // ==================== go modules 分类 ====================
    this.categories.set('go', {
      // Web 框架
      'framework': {
        patterns: ['gin', 'echo', 'fiber', 'chi', 'gorilla/mux', 'beego', 'buffalo', 'revel', 'go-kit', 'grpc-go'],
        description: 'Web 框架',
        color: '#00ADD8'
      },
      // 数据库
      'database': {
        patterns: ['gorm', 'sqlx', 'pgx', 'mongo-driver', 'redis', 'casbin', 'ent', 'upper', 'bun'],
        description: '数据库',
        color: '#007D9C'
      },
      // 工具库
      'utils': {
        patterns: ['uuid', 'logrus', 'zap', 'cobra', 'viper', 'cast', 'copier', 'validator', 'go-errors', 'errgroup'],
        description: '工具库',
        color: '#6B7280'
      },
    });

    // 依赖描述数据库
    this.initDescriptions();
  }

  /**
   * 初始化依赖描述
   */
  initDescriptions() {
    // npm 常用依赖描述
    const npmDescriptions = {
      'react': '用于构建用户界面的 JavaScript 库',
      'react-dom': 'React 的 DOM 渲染器',
      'vue': '渐进式 JavaScript 框架',
      'next': 'React 全栈框架',
      'nuxt': 'Vue 全栈框架',
      'redux': 'JavaScript 状态容器',
      'mobx': '简单可扩展的状态管理',
      'zustand': '轻量级状态管理库',
      'react-router': 'React 路由库',
      'axios': '基于 Promise 的 HTTP 客户端',
      'lodash': 'JavaScript 实用工具库',
      'dayjs': '轻量级日期处理库',
      'tailwindcss': '原子化 CSS 框架',
      'jest': 'JavaScript 测试框架',
      'typescript': 'JavaScript 的超集',
      'vite': '下一代前端构建工具',
      'webpack': '模块打包器',
      'eslint': 'JavaScript 代码检查工具',
      'prettier': '代码格式化工具',
    };

    // pub 常用依赖描述
    const pubDescriptions = {
      'cupertino_icons': 'Flutter 风格的图标',
      'http': 'Flutter 的 HTTP 请求库',
      'provider': 'Flutter 状态管理',
      'riverpod': 'Provider 的改进版本',
      'bloc': 'Flutter 状态管理',
      'go_router': 'Flutter 声明式路由',
      'shared_preferences': 'Flutter 本地存储',
      'dio': 'Flutter HTTP 客户端',
      'get': 'Flutter 全栈框架',
      'flutter_hooks': 'Flutter React Hooks 风格 API',
      'sqflite': 'Flutter SQLite 数据库',
    };

    // 合并描述
    for (const [name, desc] of Object.entries(npmDescriptions)) {
      this.descriptions.set(`npm:${name}`, desc);
    }
    for (const [name, desc] of Object.entries(pubDescriptions)) {
      this.descriptions.set(`pub:${name}`, desc);
    }
  }

  /**
   * 分类依赖
   * @param {string} packageName - 包名
   * @param {string} ecosystem - 生态系统 (npm, pub, pip, go, maven, gems, composer)
   * @returns {Object} 分类结果
   */
  classify(packageName, ecosystem) {
    const key = `${ecosystem}:${packageName}`;

    // 优先使用已有描述
    const description = this.descriptions.get(key) ||
                         this.descriptions.get(packageName) || '';

    // 获取分类
    const category = this.getCategory(packageName, ecosystem);

    return {
      name: packageName,
      ecosystem,
      category: category?.name || 'other',
      categoryName: category?.description || '其他',
      categoryColor: category?.color || '#9E9E9E',
      description,
      riskLevel: this.assessRisk(packageName, ecosystem, category?.name),
    };
  }

  /**
   * 获取依赖分类
   */
  getCategory(packageName, ecosystem) {
    const categories = this.categories.get(ecosystem);
    if (!categories) return null;

    for (const [name, category] of Object.entries(categories)) {
      for (const pattern of category.patterns) {
        if (this.matchPattern(packageName, pattern)) {
          return { name, ...category };
        }
      }
    }

    return null;
  }

  /**
   * 模式匹配
   */
  matchPattern(text, pattern) {
    // 精确匹配
    if (text === pattern) return true;

    // 前缀匹配
    if (pattern.endsWith('/') && text.startsWith(pattern)) return true;

    // 包含匹配
    if (pattern.startsWith('@') && text.includes(pattern)) return true;

    // 通配符匹配
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    if (regex.test(text)) return true;

    return false;
  }

  /**
   * 评估依赖风险等级
   */
  assessRisk(packageName, ecosystem, category) {
    const riskLevels = {
      'framework': 'low',
      'ui-library': 'low',
      'state-management': 'low',
      'routing': 'low',
      'http-client': 'medium',
      'network': 'medium',
      'storage': 'medium',
      'testing': 'low',
      'utils': 'low',
      'build-tools': 'low',
      'animation': 'low',
      'other': 'medium',
    };

    // 检查是否是已知的废弃或有问题的包
    const deprecatedPackages = [
      'request', // npm: 已废弃
      'material-ui', // npm: 已迁移到 MUI
      'redux-thunk', // npm: 建议使用其他方案
      'mobx-react', // npm: 可能有性能问题
    ];

    const isDeprecated = deprecatedPackages.some(dep => packageName.includes(dep));
    if (isDeprecated) {
      return {
        level: 'high',
        message: '该依赖已被标记为废弃或存在已知问题',
      };
    }

    // 检查是否是核心依赖
    const coreDeps = ['react', 'react-dom', 'vue', 'angular', 'flutter'];
    const isCore = coreDeps.some(dep => packageName === dep || packageName.startsWith('@' + dep));
    if (isCore) {
      return {
        level: 'low',
        message: '核心框架依赖，风险较低',
      };
    }

    return {
      level: riskLevels[category] || 'medium',
      message: '',
    };
  }

  /**
   * 批量分类依赖
   * @param {Object} dependencies - 依赖对象
   * @param {string} ecosystem - 生态系统
   * @returns {Object} 分类结果
   */
  classifyDependencies(dependencies, ecosystem) {
    const result = {
      byCategory: {},
      byName: {},
      summary: {
        total: 0,
        byCategory: {},
        riskLevels: {
          low: 0,
          medium: 0,
          high: 0,
        },
      },
    };

    for (const [name, version] of Object.entries(dependencies)) {
      const classified = this.classify(name, ecosystem);
      result.byName[name] = { ...classified, version };

      // 按分类分组
      if (!result.byCategory[classified.category]) {
        result.byCategory[classified.category] = [];
      }
      result.byCategory[classified.category].push(classified);

      // 更新统计
      result.summary.total++;
      result.summary.byCategory[classified.category] =
        (result.summary.byCategory[classified.category] || 0) + 1;

      result.summary.riskLevels[classified.riskLevel.level]++;
    }

    return result;
  }

  /**
   * 分析依赖关系
   * @param {Object} dependencies - 依赖对象
   * @param {string} ecosystem - 生态系统
   * @returns {Object} 分析结果
   */
  analyzeDependencies(dependencies, ecosystem) {
    const classified = this.classifyDependencies(dependencies, ecosystem);

    return {
      ...classified,
      recommendations: this.generateRecommendations(classified),
      duplicates: this.findDuplicates(dependencies, ecosystem),
      alternatives: this.findAlternatives(classified),
    };
  }

  /**
   * 生成建议
   */
  generateRecommendations(classified) {
    const recommendations = [];

    // 检查是否有多个状态管理库
    const stateManagement = classified.byCategory['state-management'] || [];
    if (stateManagement.length > 1) {
      recommendations.push({
        type: 'warning',
        category: 'duplicate-state-management',
        message: `检测到 ${stateManagement.length} 个状态管理库，建议只保留一个`,
        packages: stateManagement.map(p => p.name),
      });
    }

    // 检查是否有多个 HTTP 客户端
    const httpClients = classified.byCategory['http-client'] ||
                      classified.byCategory['network'] || [];
    if (httpClients.length > 1) {
      recommendations.push({
        type: 'info',
        category: 'multiple-http-clients',
        message: `检测到 ${httpClients.length} 个 HTTP 客户端库`,
        packages: httpClients.map(p => p.name),
      });
    }

    // 检查高风险依赖
    const highRisk = Object.values(classified.byName)
      .filter(p => p.riskLevel.level === 'high');
    if (highRisk.length > 0) {
      recommendations.push({
        type: 'error',
        category: 'high-risk-dependencies',
        message: `检测到 ${highRisk.length} 个高风险依赖`,
        packages: highRisk.map(p => ({ name: p.name, reason: p.riskLevel.message })),
      });
    }

    return recommendations;
  }

  /**
   * 查找重复依赖
   */
  findDuplicates(dependencies, ecosystem) {
    const duplicates = [];

    // 这里可以添加逻辑来检测功能重复的依赖
    // 例如：dayjs 和 moment 都可以处理日期

    const dateLibs = ['moment', 'dayjs', 'date-fns', 'luxon'];
    const foundDateLibs = dateLibs.filter(lib => dependencies[lib]);
    if (foundDateLibs.length > 1) {
      duplicates.push({
        type: 'date-libraries',
        message: '多个日期处理库',
        packages: foundDateLibs,
        recommendation: '建议只保留一个，推荐 dayjs 或 date-fns',
      });
    }

    return duplicates;
  }

  /**
   * 查找替代方案
   */
  findAlternatives(classified) {
    const alternatives = {};

    // 定义替代方案映射
    const alternativeMap = {
      'moment': ['dayjs', 'date-fns'],
      'lodash': ['esbuild', '@esbuilds'],
      'axios': ['ky', 'fetch'],
      'redux': ['zustand', 'jotai', 'valtio'],
    };

    for (const [name, alts] of Object.entries(alternativeMap)) {
      if (classified.byName[name]) {
        alternatives[name] = alts.filter(alt => !classified.byName[alt]);
      }
    }

    return alternatives;
  }

  /**
   * 获取依赖健康度评分
   */
  getHealthScore(classified) {
    let score = 100;

    // 扣分项
    // 1. 每个额外状态管理库扣 5 分
    const stateMgmtCount = (classified.byCategory['state-management'] || []).length;
    if (stateMgmtCount > 1) {
      score -= (stateMgmtCount - 1) * 5;
    }

    // 2. 每个高风险依赖扣 10 分
    const highRiskCount = Object.values(classified.byName)
      .filter(p => p.riskLevel.level === 'high').length;
    score -= highRiskCount * 10;

    // 3. 中风险依赖每个扣 2 分
    const mediumRiskCount = Object.values(classified.byName)
      .filter(p => p.riskLevel.level === 'medium').length;
    score -= mediumRiskCount * 2;

    return {
      score: Math.max(0, score),
      level: score >= 80 ? 'excellent' : score >= 60 ? 'good' : score >= 40 ? 'fair' : 'poor',
      issues: {
        stateMgmtOveruse: stateMgmtCount > 1 ? stateMgmtCount - 1 : 0,
        highRisk: highRiskCount,
        mediumRisk: mediumRiskCount,
      },
    };
  }
}

module.exports = DependencyClassifier;
