/**
 * Structure Analyzer Module
 *
 * 职责：
 * - 分析项目目录结构
 * - 识别架构模式
 * - 提取代码组织方式
 * - 生成架构描述
 *
 * 支持的架构模式识别：
 * - 分层架构
 * - MVC 架构
 * - 模块化单体
 * - 微服务
 * - 单体应用
 * - Clean Architecture
 * - Hexagonal Architecture
 */

const fs = require('fs');
const path = require('path');

class StructureAnalyzer {
  constructor() {
    // 常见目录模式
    this.directoryPatterns = new Map();
    // 架构模式识别规则
    this.architecturePatterns = new Map();
    this.initPatterns();
  }

  /**
   * 初始化目录模式
   */
  initPatterns() {
    // Flutter/Dart 项目目录
    this.directoryPatterns.set('flutter', {
      markers: ['pubspec.yaml', 'lib/'],
      structure: {
        lib: '应用源代码',
        test: '测试代码',
        android: 'Android 平台代码',
        ios: 'iOS 平台代码',
        web: 'Web 平台代码',
        linux: 'Linux 平台代码',
        macos: 'macOS 平台代码',
        windows: 'Windows 平台代码',
      },
      subPatterns: {
        'lib/models': '数据模型',
        'lib/views': '视图/页面',
        'lib/widgets': '可复用组件',
        'lib/services': '业务服务',
        'lib/providers': '状态管理',
        'lib/repositories': '数据仓库',
        'lib/screens': '页面/屏幕',
        'lib/config': '配置',
        'lib/utils': '工具类',
        'lib/constants': '常量',
      },
    });

    // React 项目目录
    this.directoryPatterns.set('react', {
      markers: ['package.json', 'src/'],
      structure: {
        src: '源代码',
        public: '静态资源',
        tests: '测试',
        e2e: '端到端测试',
      },
      subPatterns: {
        'src/components': 'React 组件',
        'src/pages': '页面组件',
        'src/views': '视图组件',
        'src/hooks': '自定义 Hooks',
        'src/store': '状态管理',
        'src/redux': 'Redux 相关',
        'src/services': 'API 服务',
        'src/api': 'API 接口',
        'src/utils': '工具函数',
        'src/helpers': '辅助函数',
        'src/constants': '常量',
        'src/types': 'TypeScript 类型',
        'src/interfaces': '接口定义',
        'src/assets': '静态资源',
        'src/styles': '样式文件',
        'src/router': '路由配置',
        'src/routes': '路由定义',
        'src/middleware': '中间件',
        'src/context': 'React Context',
        'src/containers': '容器组件',
        'src/hocs': '高阶组件',
      },
    });

    // Vue 项目目录
    this.directoryPatterns.set('vue', {
      markers: ['package.json', 'src/'],
      structure: {
        src: '源代码',
        public: '静态资源',
      },
      subPatterns: {
        'src/components': 'Vue 组件',
        'src/views': '页面视图',
        'src/pages': '页面',
        'src/router': '路由配置',
        'src/store': '状态管理 (Vuex/Pinia)',
        'src/state': '状态管理',
        'src/composables': '组合式函数',
        'src/utils': '工具函数',
        'src/api': 'API 接口',
        'src/assets': '静态资源',
        'src/styles': '样式',
        'src/directives': '自定义指令',
        'src/mixins': '混入',
        'src/plugins': '插件',
        'src/filters': '过滤器',
        'src/layout': '布局组件',
        'src/config': '配置',
      },
    });

    // Angular 项目目录
    this.directoryPatterns.set('angular', {
      markers: ['angular.json', 'src/app'],
      structure: {
        src: '源代码',
      },
      subPatterns: {
        'src/app': '应用根模块',
        'src/app/components': '组件',
        'src/app/services': '服务',
        'src/app/models': '数据模型',
        'src/app/pipes': '管道',
        'src/app/directives': '指令',
        'src/app/guards': '路由守卫',
        'src/app/interceptors': '拦截器',
        'src/app/resolvers': '路由解析器',
        'src/app/modules': '功能模块',
        'src/assets': '资源',
      },
    });

    // Node.js/Express 项目目录
    this.directoryPatterns.set('nodejs', {
      markers: ['package.json', 'src/'],
      structure: {
        src: '源代码',
        test: '测试代码',
        tests: '测试代码',
        config: '配置文件',
      },
      subPatterns: {
        'src/controllers': '控制器',
        'src/services': '业务服务',
        'src/models': '数据模型',
        'src/routes': '路由定义',
        'src/middleware': '中间件',
        'src/utils': '工具函数',
        'src/helpers': '辅助函数',
        'src/validators': '验证器',
        'src/repositories': '数据访问层',
        'src/database': '数据库相关',
        'src/config': '配置',
        'src/constants': '常量',
        'src/types': '类型定义',
      },
    });

    // Python/Django 项目目录
    this.directoryPatterns.set('django', {
      markers: ['manage.py', 'settings.py'],
      structure: {
        apps: 'Django 应用',
        static: '静态文件',
        media: '媒体文件',
        templates: '模板文件',
      },
      subPatterns: {
        'apps/*/models': '数据模型',
        'apps/*/views': '视图',
        'apps/*/serializers': '序列化器',
        'apps/*/urls': 'URL 配置',
        'apps/*/forms': '表单',
        'apps/*/admin': '管理后台',
        'apps/*/tests': '测试',
        'apps/*/migrations': '数据库迁移',
      },
    });

    // Go 项目目录
    this.directoryPatterns.set('go', {
      markers: ['go.mod'],
      structure: {
        cmd: '应用程序入口',
        pkg: '库代码',
        internal: '私有应用和库代码',
        api: 'API 定义',
        web: 'Web 应用',
        configs: '配置文件',
      },
      subPatterns: {
        'cmd/*': '应用入口点',
        'pkg/*': '库包',
        'internal/app': '应用代码',
        'internal/config': '配置',
        'internal/models': '模型',
        'internal/services': '服务',
        'internal/handlers': '处理器',
        'api': 'API 定义',
        'api/http': 'HTTP API',
        'api/grpc': 'gRPC API',
        'configs': '配置',
        'scripts': '脚本',
      },
    });

    // 初始化架构模式
    this.architecturePatterns.set('layered', {
      name: '分层架构',
      indicators: ['controllers', 'services', 'repositories', 'models', 'views', 'components'],
      description: '经典的分层架构，将应用分为表现层、业务层、数据访问层等',
      layers: [
        { name: 'presentation', patterns: ['views', 'components', 'pages', 'controllers', 'templates'] },
        { name: 'business', patterns: ['services', 'usecases', 'handlers'] },
        { name: 'persistence', patterns: ['repositories', 'dao', 'models', 'database'] },
        { name: 'infrastructure', patterns: ['config', 'utils', 'helpers', 'infrastructure'] },
      ],
    });

    this.architecturePatterns.set('mvc', {
      name: 'MVC 架构',
      indicators: ['models', 'views', 'controllers'],
      description: 'Model-View-Controller 架构模式',
      layers: [
        { name: 'models', patterns: ['models', 'entities', 'domain'] },
        { name: 'views', patterns: ['views', 'templates', 'pages'] },
        { name: 'controllers', patterns: ['controllers', 'actions'] },
      ],
    });

    this.architecturePatterns.set('feature-based', {
      name: '模块化/特性驱动',
      indicators: ['modules', 'features', 'apps/*/'],
      description: '按功能模块组织代码',
      layers: [
        { name: 'feature-modules', patterns: ['modules', 'features', 'apps'] },
      ],
    });

    this.architecturePatterns.set('clean-architecture', {
      name: 'Clean Architecture',
      indicators: ['domain', 'application', 'infrastructure', 'presentation'],
      description: '依赖倒置的整洁架构',
      layers: [
        { name: 'domain', patterns: ['domain', 'entities', 'value-objects'] },
        { name: 'application', patterns: ['application', 'usecases', 'services'] },
        { name: 'infrastructure', patterns: ['infrastructure', 'persistence', 'external'] },
        { name: 'presentation', patterns: ['presentation', 'controllers', 'views'] },
      ],
    });

    this.architecturePatterns.set('hexagonal', {
      name: '六边形架构',
      indicators: ['domain', 'ports', 'adapters'],
      description: '端口和适配器架构',
      layers: [
        { name: 'domain', patterns: ['domain', 'core'] },
        { name: 'ports', patterns: ['ports', 'interfaces'] },
        { name: 'adapters', patterns: ['adapters', 'infrastructure', 'external'] },
      ],
    });
  }

  /**
   * 分析项目结构
   * @param {string} projectPath - 项目路径
   * @param {string} projectType - 项目类型
   * @returns {Object} 分析结果
   */
  analyze(projectPath, projectType = null) {
    const result = {
      projectPath,
      architecture: null,
      layers: [],
      directories: {},
      organization: null,
      description: '',
      metrics: {
        totalDirectories: 0,
        totalFiles: 0,
        maxDepth: 0,
        averageDepth: 0,
      },
      patterns: [],
      recommendations: [],
    };

    // 扫描目录结构
    const dirTree = this.scanDirectory(projectPath, 0, 10);

    // 识别项目类型
    const detectedType = projectType || this.detectProjectType(projectPath, dirTree);
    result.projectType = detectedType;

    // 获取目录模式
    const pattern = this.directoryPatterns.get(detectedType);
    if (pattern) {
      result.structure = pattern.structure;
      result.subPatterns = pattern.subPatterns;
    }

    // 分析目录内容
    result.directories = this.analyzeDirectories(dirTree, pattern);

    // 识别架构模式
    result.architecture = this.identifyArchitecture(dirTree, pattern);

    // 分析代码组织方式
    result.organization = this.analyzeOrganization(dirTree, pattern);

    // 生成描述
    result.description = this.generateDescription(result);

    // 计算指标
    result.metrics = this.calculateMetrics(dirTree);

    // 生成建议
    result.recommendations = this.generateRecommendations(result);

    return result;
  }

  /**
   * 递归扫描目录
   */
  scanDirectory(dirPath, depth, maxDepth) {
    const result = {
      path: dirPath,
      name: path.basename(dirPath),
      type: 'directory',
      children: [],
      depth: depth,
      fileCount: 0,
    };

    if (depth > maxDepth || !fs.existsSync(dirPath)) {
      return result;
    }

    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          // 跳过常见的不需要分析的目录
          if (this.shouldSkipDirectory(entry.name)) {
            continue;
          }
          result.children.push(this.scanDirectory(fullPath, depth + 1, maxDepth));
        } else if (entry.isFile()) {
          result.fileCount++;
          result.children.push({
            path: fullPath,
            name: entry.name,
            type: 'file',
            extension: path.extname(entry.name),
          });
        }
      }
    } catch (error) {
      // 跳过无法访问的目录
    }

    return result;
  }

  /**
   * 判断是否跳过目录
   */
  shouldSkipDirectory(name) {
    const skipDirs = [
      'node_modules',
      '.git',
      '.svn',
      '.hg',
      '.vscode',
      '.idea',
      'dist',
      'build',
      'out',
      'target',
      'bin',
      'obj',
      '.next',
      '.nuxt',
      'coverage',
      '.cache',
      'temp',
      'tmp',
      '__pycache__',
      'venv',
      'env',
      '.env',
      'Pods',
      'vendor',
      'bower_components',
      '.gradle',
      'gradle',
    ];
    return skipDirs.includes(name);
  }

  /**
   * 检测项目类型
   */
  detectProjectType(projectPath, dirTree) {
    const checkPath = (paths) => {
      for (const p of paths) {
        if (fs.existsSync(path.join(projectPath, p))) {
          return true;
        }
      }
      return false;
    };

    if (checkPath(['pubspec.yaml'])) return 'flutter';
    if (checkPath(['package.json'])) {
      const pkgJson = path.join(projectPath, 'package.json');
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgJson, 'utf8'));
        if (pkg.dependencies?.angular) return 'angular';
        if (pkg.dependencies?.vue) return 'vue';
        if (pkg.dependencies?.react || pkg.dependencies?.['next']) return 'react';
      } catch (e) {}
      return 'nodejs';
    }
    if (checkPath(['angular.json'])) return 'angular';
    if (checkPath(['go.mod'])) return 'go';
    if (checkPath(['manage.py', 'settings.py'])) return 'django';
    if (checkPath(['requirements.txt', 'setup.py', 'pyproject.toml'])) return 'python';
    if (checkPath(['pom.xml'])) return 'maven';
    if (checkPath(['build.gradle', 'build.gradle.kts'])) return 'gradle';
    if (checkPath(['Gemfile'])) return 'ruby';
    if (checkPath(['composer.json'])) return 'php';

    return 'unknown';
  }

  /**
   * 分析目录内容
   */
  analyzeDirectories(dirTree, pattern) {
    const directories = {};
    const importantDirs = new Set();

    const analyzeNode = (node) => {
      if (node.type !== 'directory') return;

      const relPath = path.relative(node.path, node.path);
      const dirName = node.name;

      // 检查是否是已知的目录模式
      if (pattern && pattern.subPatterns) {
        for (const [subDir, description] of Object.entries(pattern.subPatterns)) {
          const subDirParts = subDir.split('/');
          const expectedBase = subDirParts[0];

          if (dirName === expectedBase || relPath.startsWith(subDir)) {
            importantDirs.add(subDir);

            if (!directories[subDir]) {
              directories[subDir] = {
                description,
                files: [],
                subdirectories: [],
                fullPath: node.path,
              };
            }

            // 统计文件
            for (const child of node.children) {
              if (child.type === 'file') {
                directories[subDir].files.push({
                  name: child.name,
                  extension: child.extension,
                  path: child.path,
                });
              } else if (child.type === 'directory') {
                directories[subDir].subdirectories.push(child.name);
              }
            }
          }
        }
      }

      // 递归分析子目录
      for (const child of node.children) {
        if (child.type === 'directory') {
          analyzeNode(child);
        }
      }
    };

    analyzeNode(dirTree);

    return {
      directories,
      importantDirs: Array.from(importantDirs),
    };
  }

  /**
   * 识别架构模式
   */
  identifyArchitecture(dirTree, pattern) {
    const allPaths = this.getAllPaths(dirTree);

    for (const [archType, archInfo] of this.architecturePatterns) {
      let matchCount = 0;
      const matchedIndicators = [];

      for (const indicator of archInfo.indicators) {
        if (allPaths.some(p => p.includes(indicator))) {
          matchCount++;
          matchedIndicators.push(indicator);
        }
      }

      // 匹配度检查：至少匹配 30% 的指示器
      const matchRatio = matchCount / archInfo.indicators.length;
      if (matchRatio >= 0.3) {
        return {
          type: archType,
          name: archInfo.name,
          description: archInfo.description,
          matchRatio: matchRatio,
          matchedIndicators,
          layers: this.identifyLayers(allPaths, archInfo.layers),
        };
      }
    }

    return {
      type: 'custom',
      name: '自定义架构',
      description: '未检测到标准架构模式',
      matchRatio: 0,
      matchedIndicators: [],
      layers: [],
    };
  }

  /**
   * 识别层级
   */
  identifyLayers(allPaths, layerDefinitions) {
    const layers = [];

    for (const layerDef of layerDefinitions) {
      const matchedPaths = allPaths.filter(p =>
        layerDef.patterns.some(pattern => p.includes(pattern))
      );

      if (matchedPaths.length > 0) {
        layers.push({
          name: layerDef.name,
          patterns: layerDef.patterns,
          paths: matchedPaths,
          count: matchedPaths.length,
        });
      }
    }

    // 按匹配数量排序
    return layers.sort((a, b) => b.count - a.count);
  }

  /**
   * 获取所有路径
   */
  getAllPaths(dirTree) {
    const paths = [];

    const traverse = (node) => {
      if (node.type === 'directory') {
        paths.push(node.path);
        for (const child of node.children) {
          traverse(child);
        }
      }
    };

    traverse(dirTree);
    return paths;
  }

  /**
   * 分析代码组织方式
   */
  analyzeOrganization(dirTree, pattern) {
    const allPaths = this.getAllPaths(dirTree);

    const organization = {
      type: null,
      description: '',
      characteristics: [],
    };

    // 检测模块化组织
    const modulePatterns = [
      'modules/', 'features/', 'apps/', 'domain/', 'context/'
    ];

    const hasModules = modulePatterns.some(pattern =>
      allPaths.some(p => p.includes(pattern))
    );

    if (hasModules) {
      organization.type = 'modular';
      organization.description = '采用模块化组织方式，按功能/业务领域划分代码';
      organization.characteristics.push('模块化架构', '功能隔离');
    } else {
      organization.type = 'layered';
      organization.description = '采用分层组织方式，按技术职责划分代码';
      organization.characteristics.push('分层架构', '技术分层');
    }

    // 检测是否有 shared 或 common 目录
    const hasShared = allPaths.some(p =>
      p.includes('/shared/') || p.includes('/common/')
    );

    if (hasShared) {
      organization.characteristics.push('共享代码目录');
    }

    return organization;
  }

  /**
   * 生成描述
   */
  generateDescription(result) {
    const parts = [];

    parts.push(`项目采用 **${result.architecture?.name || result.organization?.type || '自定义'}** 架构模式。`);

    if (result.architecture?.layers?.length > 0) {
      const layerNames = result.architecture.layers.map(l => l.name).join('、');
      parts.push(`包含 ${layerNames} 等层级。`);
    }

    if (result.organization?.characteristics?.length > 0) {
      parts.push(`代码组织特点：${result.organization.characteristics.join('、')}。`);
    }

    if (Object.keys(result.directories.directories || {}).length > 0) {
      const dirNames = Object.keys(result.directories.directories);
      parts.push(`主要包含 ${dirNames.slice(0, 5).join('、')}${dirNames.length > 5 ? ' 等' : ''}目录。`);
    }

    return parts.join('');
  }

  /**
   * 计算指标
   */
  calculateMetrics(dirTree) {
    const metrics = {
      totalDirectories: 0,
      totalFiles: 0,
      maxDepth: 0,
      averageDepth: 0,
      depthDistribution: {},
    };

    const depths = [];

    const traverse = (node, depth) => {
      if (node.type === 'directory') {
        metrics.totalDirectories++;
        metrics.maxDepth = Math.max(metrics.maxDepth, depth);
        depths.push(depth);

        for (const child of node.children) {
          traverse(child, depth + 1);
        }
      } else if (node.type === 'file') {
        metrics.totalFiles++;
      }
    };

    traverse(dirTree, 0);

    // 计算平均深度
    if (depths.length > 0) {
      metrics.averageDepth = depths.reduce((a, b) => a + b, 0) / depths.length;
    }

    // 深度分布
    for (const depth of depths) {
      metrics.depthDistribution[depth] = (metrics.depthDistribution[depth] || 0) + 1;
    }

    return metrics;
  }

  /**
   * 生成建议
   */
  generateRecommendations(result) {
    const recommendations = [];

    // 检查是否缺少常见目录
    const projectType = result.projectType;
    if (projectType === 'react' || projectType === 'vue' || projectType === 'nodejs') {
      const hasTests = result.directories.importantDirs?.some(d =>
        d.includes('test') || d.includes('spec')
      );

      if (!hasTests) {
        recommendations.push({
          type: 'warning',
          category: 'missing-tests',
          message: '未发现测试目录，建议添加测试代码目录（tests/ 或 test/）',
          priority: 'medium',
        });
      }
    }

    // 检查目录深度
    if (result.metrics.maxDepth > 8) {
      recommendations.push({
        type: 'info',
        category: 'deep-structure',
        message: `项目目录深度较深（${result.metrics.maxDepth} 层），建议考虑模块化拆分`,
        priority: 'low',
      });
    }

    // 检查是否有 utils/helpers 目录
    const hasUtils = result.directories.importantDirs?.some(d =>
      d.includes('utils') || d.includes('helpers')
    );

    if (!hasUtils) {
      recommendations.push({
        type: 'suggestion',
        category: 'missing-utils',
        message: '建议添加 utils/ 或 helpers/ 目录存放工具函数',
        priority: 'low',
      });
    }

    return recommendations;
  }

  /**
   * 生成 JSON 格式的架构描述
   */
  toJSON(result, indent = 2) {
    return JSON.stringify(result, null, indent);
  }

  /**
   * 生成 Markdown 格式的架构报告
   */
  toMarkdown(result) {
    const lines = [];

    lines.push('# 项目架构分析报告\n');
    lines.push(`## 项目概览\n`);
    lines.push(`- **项目路径**: ${result.projectPath}`);
    lines.push(`- **项目类型**: ${result.projectType}`);
    lines.push(`- **架构模式**: ${result.architecture?.name || '未知'}`);
    lines.push(`\n');

    lines.push(`## 架构描述\n`);
    lines.push(result.description);
    lines.push(`\n`);

    if (result.architecture?.layers?.length > 0) {
      lines.push(`## 架构层级\n`);
      for (const layer of result.architecture.layers) {
        lines.push(`### ${layer.name}`);
        lines.push(`- **匹配路径数**: ${layer.count}`);
        lines.push(`- **关键目录**: ${layer.patterns.slice(0, 3).join(', ')}`);
        lines.push(`\n`);
      }
    }

    lines.push(`## 目录结构\n`);
    for (const [dirPath, info] of Object.entries(result.directories.directories || {})) {
      lines.push(`### ${dirPath}`);
      lines.push(`- **说明**: ${info.description}`);
      lines.push(`- **文件数**: ${info.files.length}`);
      if (info.subdirectories.length > 0) {
        lines.push(`- **子目录**: ${info.subdirectories.join(', ')}`);
      }
      lines.push(`\n`);
    }

    lines.push(`## 指标统计\n`);
    lines.push(`- **总目录数**: ${result.metrics.totalDirectories}`);
    lines.push(`- **总文件数**: ${result.metrics.totalFiles}`);
    lines.push(`- **最大深度**: ${result.metrics.maxDepth} 层`);
    lines.push(`- **平均深度**: ${result.metrics.averageDepth.toFixed(2)} 层`);
    lines.push(`\n`);

    if (result.recommendations.length > 0) {
      lines.push(`## 改进建议\n`);
      for (const rec of result.recommendations) {
        const emoji = rec.type === 'warning' ? '⚠️' : rec.type === 'error' ? '❌' : 'ℹ️';
        lines.push(`- ${emoji} **${rec.category}**: ${rec.message} (优先级: ${rec.priority})`);
      }
    }

    return lines.join('\n');
  }

  /**
   * 生成供 AI 理解的结构化摘要
   */
  generateAISummary(result) {
    return {
      project: {
        path: result.projectPath,
        type: result.projectType,
      },
      architecture: {
        type: result.architecture?.type,
        name: result.architecture?.name,
        description: result.architecture?.description,
        layers: result.architecture?.layers?.map(l => ({
          name: l.name,
          paths: l.paths.slice(0, 5), // 只保留前5个示例
        })),
      },
      organization: {
        type: result.organization?.type,
        description: result.organization?.description,
        characteristics: result.organization?.characteristics,
      },
      structure: {
        keyDirectories: Object.keys(result.directories.directories || {}).map(dir => ({
          name: dir,
          description: result.directories.directories[dir].description,
        })),
        importantPaths: result.directories.importantDirs,
      },
      metrics: {
        totalDirectories: result.metrics.totalDirectories,
        totalFiles: result.metrics.totalFiles,
        maxDepth: result.metrics.maxDepth,
        averageDepth: Math.round(result.metrics.averageDepth * 100) / 100,
      },
      description: result.description,
    };
  }
}

module.exports = StructureAnalyzer;
