/**
 * AI Context Generator Module
 *
 * 职责：
 * - 扫描项目并生成 AI_CONTEXT.md 文档
 * - 收集项目的完整上下文信息供 AI 参考
 * - 生成结构化的项目文档
 *
 * 生成的文档包含：
 * - 项目概述
 * - 技术栈
 * - 项目结构
 * - 核心架构模式
 * - UI 组件库
 * - 开发指南
 * - 代码规范
 * - API 接口
 * - 路由配置
 * - 国际化
 * - 关键业务模块
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

class AIContextGenerator {
  constructor() {
    this.componentDetectors = new Map();
    this.initComponentDetectors();
  }

  /**
   * 初始化组件检测器
   */
  initComponentDetectors() {
    // Flutter 组件检测
    this.componentDetectors.set('flutter', {
      componentDirs: ['lib/components', 'lib/widgets'],
      pattern: /class\s+(\w+)\s+(?:extends\s+\w+|implements\s+\w+)/g,
      namingPrefix: 'AK',
    });

    // React 组件检测
    this.componentDetectors.set('react', {
      componentDirs: ['src/components', 'src/widgets', 'src/ui'],
      pattern: /(?:const|function|class)\s+(\w+).*(?:React\.Component|JSX\.Element)/g,
      namingPrefix: null,
    });

    // Vue 组件检测
    this.componentDetectors.set('vue', {
      componentDirs: ['src/components', 'src/widgets'],
      pattern: /(?:export\s+default\s+|name:\s*['"])(\w+)/g,
      namingPrefix: null,
    });
  }

  /**
   * 生成完整的 AI 上下文文档
   * @param {string} projectPath - 项目路径
   * @param {Object} scanResults - 扫描结果
   * @returns {Object} 生成的文档内容和元数据
   */
  async generate(projectPath, scanResults = {}) {
    console.log('[AI Context Generator] 开始生成 AI 上下文文档...');

    const projectInfo = await this.extractProjectInfo(projectPath);

    // 检测项目类型
    let projectType = 'unknown';
    if (projectInfo.type && projectInfo.type.toLowerCase().includes('flutter')) {
      projectType = 'flutter';
    } else if (projectInfo.type && projectInfo.type.toLowerCase().includes('react')) {
      projectType = 'react';
    } else if (projectInfo.type && projectInfo.type.toLowerCase().includes('vue')) {
      projectType = 'vue';
    } else if (projectInfo.type && projectInfo.type.toLowerCase().includes('node')) {
      projectType = 'nodejs';
    } else if (projectInfo.type && projectInfo.type.toLowerCase().includes('python')) {
      projectType = 'python';
    }

    const context = {
      metadata: {
        generatedAt: new Date().toISOString(),
        projectPath,
        version: '1.0.0',
      },
      projectType,  // 添加项目类型
      project: projectInfo,
      techStack: await this.extractTechStack(projectPath),
      structure: await this.extractStructure(projectPath),
      architecture: await this.extractArchitecture(projectPath),
      components: await this.extractComponents(projectPath),
      routing: await this.extractRouting(projectPath),
      api: await this.extractAPI(projectPath),
      i18n: await this.extractI18n(projectPath),
      stateManagement: await this.extractStateManagement(projectPath),
      codeStyle: await this.extractCodeStyle(projectPath),
      development: await this.extractDevelopmentInfo(projectPath),
      businessModules: await this.extractBusinessModules(projectPath),
    };

    const markdown = this.toMarkdown(context);
    const outputPath = path.join(projectPath, 'AI_CONTEXT.md');

    return {
      context,
      markdown,
      outputPath,
      success: true,
    };
  }

  /**
   * 提取项目基本信息
   */
  async extractProjectInfo(projectPath) {
    const info = {
      name: path.basename(projectPath),
      type: 'unknown',
      description: '',
      version: '1.0.0',
    };

    // 检查 pubspec.yaml (Flutter)
    const pubspecPath = path.join(projectPath, 'pubspec.yaml');
    if (fs.existsSync(pubspecPath)) {
      try {
        const pubspec = yaml.load(fs.readFileSync(pubspecPath, 'utf8'));
        info.name = pubspec.name || info.name;
        info.description = pubspec.description || '';
        info.version = pubspec.version || '1.0.0';
        info.type = 'Flutter Web 应用';
        info.sdkVersion = pubspec.environment?.sdk || '>=3.10.0 <4.0.0';
      } catch (e) {
        console.warn('Failed to parse pubspec.yaml:', e.message);
      }
    }

    // 检查 package.json (Node.js)
    const packageJsonPath = path.join(projectPath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        info.name = pkg.name || info.name;
        info.description = pkg.description || '';
        info.version = pkg.version || '1.0.0';
        info.type = this.detectProjectType(pkg);
        info.author = pkg.author || '';
        info.license = pkg.license || '';
      } catch (e) {
        console.warn('Failed to parse package.json:', e.message);
      }
    }

    // 检查 README.md
    const readmePath = path.join(projectPath, 'README.md');
    if (fs.existsSync(readmePath)) {
      try {
        const readme = fs.readFileSync(readmePath, 'utf8');
        // 提取第一段作为描述
        const match = readme.match(/^#\s+.+\n+(.+?)(?:\n\n|\n#|$)/s);
        if (match && !info.description) {
          info.description = match[1].trim();
        }
      } catch (e) {
        // 忽略
      }
    }

    return info;
  }

  /**
   * 检测项目类型
   */
  detectProjectType(pkg) {
    if (pkg.dependencies?.flutter) return 'Flutter 应用';
    if (pkg.dependencies?.react) return 'React 应用';
    if (pkg.dependencies?.vue) return 'Vue 应用';
    if (pkg.dependencies?.angular) return 'Angular 应用';
    if (pkg.dependencies?.['next']) return 'Next.js 应用';
    if (pkg.dependencies?.nuxt) return 'Nuxt.js 应用';
    if (pkg.dependencies?.electron) return 'Electron 桌面应用';
    return 'Node.js 应用';
  }

  /**
   * 提取技术栈
   */
  async extractTechStack(projectPath) {
    const techStack = {
      framework: '',
      coreLibraries: [],
      uiLibraries: [],
      stateManagement: '',
      networkLibrary: '',
      storageLibrary: '',
      otherLibraries: [],
    };

    // Flutter 项目
    const pubspecPath = path.join(projectPath, 'pubspec.yaml');
    if (fs.existsSync(pubspecPath)) {
      try {
        const pubspec = yaml.load(fs.readFileSync(pubspecPath, 'utf8'));
        const deps = pubspec.dependencies || {};

        techStack.framework = 'Flutter';

        // 状态管理
        if (deps.get) techStack.stateManagement = 'GetX';
        else if (deps.provider) techStack.stateManagement = 'Provider';
        else if (deps.riverpod) techStack.stateManagement = 'Riverpod';
        else if (deps.bloc) techStack.stateManagement = 'BLoC';
        else if (deps.mobx) techStack.stateManagement = 'MobX';

        // 网络库
        if (deps.http) techStack.networkLibrary = 'http';
        else if (deps.dio) techStack.networkLibrary = 'Dio';
        else if (deps.fetch_client) techStack.networkLibrary = 'fetch_client';

        // 存储库
        if (deps.get_storage) techStack.storageLibrary = 'get_storage';
        else if (deps.shared_preferences) techStack.storageLibrary = 'shared_preferences';
        else if (deps.hive) techStack.storageLibrary = 'Hive';
        else if (deps.sqflite) techStack.storageLibrary = 'sqflite';

        // UI 组件库
        const uiLibs = [];
        if (deps.bot_toast) uiLibs.push({ name: 'bot_toast', version: deps.bot_toast, desc: 'Toast 提示' });
        if (deps.flutter_svg) uiLibs.push({ name: 'flutter_svg', version: deps.flutter_svg, desc: 'SVG 图标支持' });
        if (deps.calendar_date_picker2) uiLibs.push({ name: 'calendar_date_picker2', version: deps.calendar_date_picker2, desc: '日期选择器' });
        if (deps.pdfx) uiLibs.push({ name: 'pdfx', version: deps.pdfx, desc: 'PDF 查看器' });
        if (deps.printing) uiLibs.push({ name: 'printing', version: deps.printing, desc: '打印功能' });
        if (deps.file_picker) uiLibs.push({ name: 'file_picker', version: deps.file_picker, desc: '文件选择器' });
        if (deps.cached_network_image) uiLibs.push({ name: 'cached_network_image', version: deps.cached_network_image, desc: '图片缓存' });
        if (deps.flutter_screen_recording) uiLibs.push({ name: 'flutter_screen_recording', version: deps.flutter_screen_recording, desc: '屏幕录制' });

        techStack.uiLibraries = uiLibs;

        // 其他核心库
        const coreLibs = [];
        for (const [name, version] of Object.entries(deps)) {
          if (!['flutter', 'get', 'provider', 'riverpod', 'bloc', 'mobx',
               'http', 'dio', 'get_storage', 'shared_preferences', 'hive', 'sqflite',
               'bot_toast', 'flutter_svg', 'calendar_date_picker2', 'pdfx', 'printing',
               'file_picker', 'cached_network_image'].includes(name)) {
            coreLibs.push({ name, version });
          }
        }
        techStack.coreLibraries = coreLibs.slice(0, 20); // 限制数量
      } catch (e) {
        console.warn('Failed to parse tech stack from pubspec.yaml:', e.message);
      }
    }

    // Node.js 项目
    const packageJsonPath = path.join(projectPath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        const deps = pkg.dependencies || {};

        techStack.framework = pkg.dependencies?.react ? 'React' :
                              pkg.dependencies?.vue ? 'Vue' :
                              pkg.dependencies?.angular ? 'Angular' : 'Node.js';

        // 状态管理
        if (deps.redux || deps['@reduxjs/toolkit']) techStack.stateManagement = 'Redux';
        else if (deps.mobx) techStack.stateManagement = 'MobX';
        else if (deps.zustand) techStack.stateManagement = 'Zustand';
        else if (deps.recoil) techStack.stateManagement = 'Recoil';
        else if (deps['zustand/vanilla']) techStack.stateManagement = 'Zustand';
        else if (deps.pinia) techStack.stateManagement = 'Pinia';
        else if (deps.vuex) techStack.stateManagement = 'Vuex';

        // 网络库
        if (deps.axios) techStack.networkLibrary = 'Axios';
        else if (deps['node-fetch']) techStack.networkLibrary = 'node-fetch';
        else if (deps.ky) techStack.networkLibrary = 'Ky';

        // 核心库
        techStack.coreLibraries = Object.entries(deps)
          .filter(([name]) => !name.startsWith('@types/'))
          .map(([name, version]) => ({ name, version }))
          .slice(0, 30);
      } catch (e) {
        console.warn('Failed to parse tech stack from package.json:', e.message);
      }
    }

    return techStack;
  }

  /**
   * 提取项目结构
   */
  async extractStructure(projectPath) {
    const structure = {
      directories: {},
      libPath: '',
      sourcePath: '',
      rootPath: projectPath,
    };

    // 检查 lib/ 目录 (Flutter)
    const libPath = path.join(projectPath, 'lib');
    if (fs.existsSync(libPath)) {
      structure.libPath = 'lib/';
      structure.rootPath = libPath;  // 设置为 lib 目录用于树状结构生成
      structure.directories = this.scanDirectoryStructure(libPath, 'lib');
    }

    // 检查 src/ 目录 (React/Vue/Node.js)
    const srcPath = path.join(projectPath, 'src');
    if (fs.existsSync(srcPath) && !structure.rootPath) {
      structure.sourcePath = 'src/';
      structure.rootPath = srcPath;  // 设置为 src 目录用于树状结构生成
      structure.directories = this.scanDirectoryStructure(srcPath, 'src');
    }

    // 检查 android/ ios/ web/ 等平台目录
    const platformDirs = [];
    const platforms = ['android', 'ios', 'web', 'windows', 'macos', 'linux'];
    for (const platform of platforms) {
      if (fs.existsSync(path.join(projectPath, platform))) {
        platformDirs.push(platform);
      }
    }
    structure.platformDirs = platformDirs;

    return structure;
  }

  /**
   * 扫描目录结构
   */
  scanDirectoryStructure(dirPath, prefix) {
    const directories = {};
    const maxDepth = 4;

    // 标准化路径分隔符为正斜杠
    const normalizePath = (p) => p.replace(/\\/g, '/');

    const scan = (currentPath, depth) => {
      if (depth > maxDepth) return;

      try {
        const entries = fs.readdirSync(currentPath, { withFileTypes: true });

        for (const entry of entries) {
          if (entry.isDirectory()) {
            const fullPath = path.join(currentPath, entry.name);
            const relativePath = normalizePath(path.relative(dirPath, fullPath));
            const key = normalizePath(path.join(prefix, relativePath));

            // 跳过一些不需要的目录
            if (['node_modules', '.git', 'build', 'dist', '.dart_tool'].includes(entry.name)) {
              continue;
            }

            // 统计文件
            let fileCount = 0;
            let subdirs = [];
            try {
              const subEntries = fs.readdirSync(fullPath, { withFileTypes: true });
              for (const sub of subEntries) {
                if (sub.isFile()) {
                  fileCount++;
                } else if (sub.isDirectory()) {
                  subdirs.push(sub.name);
                }
              }
            } catch (e) {
              // 忽略
            }

            directories[key] = {
              name: entry.name,
              path: key,
              fileCount,
              subdirs,
            };

            scan(fullPath, depth + 1);
          }
        }
      } catch (e) {
        // 忽略无法访问的目录
      }
    };

    scan(dirPath, 0);
    return directories;
  }

  /**
   * 提取架构信息
   */
  async extractArchitecture(projectPath) {
    const architecture = {
      pattern: '',
      description: '',
      layers: [],
    };

    const libPath = path.join(projectPath, 'lib');
    const srcPath = path.join(projectPath, 'src');
    const basePath = fs.existsSync(libPath) ? libPath : srcPath;

    if (!basePath) {
      return architecture;
    }

    // 检测架构模式
    const patterns = {
      '分层架构': ['controller', 'service', 'repository', 'model', 'view', 'component'],
      'MVC 架构': ['model', 'view', 'controller'],
      'MVVM 架构': ['model', 'view', 'viewmodel'],
      'Clean Architecture': ['domain', 'application', 'infrastructure', 'presentation'],
      'GetX 模式': ['controller', 'views', 'routes', 'bindings'],
    };

    const allPaths = this.getAllPaths(basePath);

    for (const [pattern, indicators] of Object.entries(patterns)) {
      const matchCount = indicators.filter(ind =>
        allPaths.some(p => p.toLowerCase().includes(ind))
      ).length;

      if (matchCount >= indicators.length * 0.4) {
        architecture.pattern = pattern;
        break;
      }
    }

    if (!architecture.pattern) {
      architecture.pattern = '自定义架构';
    }

    // 分析层级
    const layerMap = {
      'controller': '控制器层',
      'controllers': '控制器层',
      'service': '服务层',
      'services': '服务层',
      'repository': '数据访问层',
      'repositories': '数据访问层',
      'model': '模型层',
      'models': '模型层',
      'view': '视图层',
      'views': '视图层',
      'component': '组件层',
      'components': '组件层',
      'widget': '组件层',
      'widgets': '组件层',
      'config': '配置层',
      'utils': '工具层',
      'util': '工具层',
      'helper': '辅助层',
      'helpers': '辅助层',
    };

    const detectedLayers = new Set();
    for (const p of allPaths) {
      const parts = p.split(path.sep).map(s => s.toLowerCase());
      for (const [key, layer] of Object.entries(layerMap)) {
        if (parts.some(part => part === key || part === key + 's')) {
          detectedLayers.add(layer);
        }
      }
    }

    architecture.layers = Array.from(detectedLayers);

    // 生成描述
    architecture.description = `项目采用 **${architecture.pattern}**。`;
    if (architecture.layers.length > 0) {
      architecture.description += ` 包含 ${architecture.layers.join('、')} 等层级。`;
    }

    return architecture;
  }

  /**
   * 获取所有路径
   */
  getAllPaths(dirPath) {
    const paths = [];

    const traverse = (currentPath) => {
      try {
        const entries = fs.readdirSync(currentPath, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(currentPath, entry.name);
          if (entry.isDirectory()) {
            paths.push(fullPath);
            traverse(fullPath);
          }
        }
      } catch (e) {
        // 忽略
      }
    };

    traverse(dirPath);
    return paths;
  }

  /**
   * 提取组件信息
   */
  async extractComponents(projectPath) {
    const components = {
      prefix: '',
      list: [],
      categories: {},
    };

    const libPath = path.join(projectPath, 'lib');
    const srcPath = path.join(projectPath, 'src');
    const basePath = fs.existsSync(libPath) ? libPath : srcPath;

    if (!basePath) {
      return components;
    }

    // 检测组件前缀和目录
    if (fs.existsSync(libPath)) {
      components.prefix = 'AK';
      const componentsDir = path.join(libPath, 'components');
      if (fs.existsSync(componentsDir)) {
        this.scanComponents(componentsDir, 'lib/components', components);
      }
      const widgetsDir = path.join(libPath, 'widgets');
      if (fs.existsSync(widgetsDir)) {
        this.scanComponents(widgetsDir, 'lib/widgets', components);
      }
    }

    if (fs.existsSync(srcPath)) {
      const componentsDir = path.join(srcPath, 'components');
      if (fs.existsSync(componentsDir)) {
        this.scanComponents(componentsDir, 'src/components', components);
      }
      const widgetsDir = path.join(srcPath, 'widgets');
      if (fs.existsSync(widgetsDir)) {
        this.scanComponents(widgetsDir, 'src/widgets', components);
      }
    }

    return components;
  }

  /**
   * 扫描组件
   */
  scanComponents(dirPath, prefix, result) {
    const maxDepth = 3;

    const scan = (currentPath, depth) => {
      if (depth > maxDepth) return;

      try {
        const entries = fs.readdirSync(currentPath, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(currentPath, entry.name);

          if (entry.isDirectory()) {
            const relativePath = path.join(prefix, path.relative(dirPath, fullPath));

            // 统计组件
            let componentFiles = [];
            try {
              const subEntries = fs.readdirSync(fullPath, { withFileTypes: true });
              for (const sub of subEntries) {
                if (sub.isFile()) {
                  const ext = path.extname(sub.name);
                  if (['.dart', '.jsx', '.tsx', '.vue'].includes(ext)) {
                    componentFiles.push(sub.name);
                  }
                }
              }
            } catch (e) {
              // 忽略
            }

            if (componentFiles.length > 0) {
              const category = path.basename(fullPath);
              if (!result.categories[category]) {
                result.categories[category] = [];
              }

              // 提取组件名称
              for (const file of componentFiles) {
                const componentName = this.extractComponentName(fullPath, file);
                if (componentName) {
                  result.categories[category].push({
                    name: componentName,
                    file: file,
                    path: path.join(relativePath, file),
                  });
                  result.list.push({
                    name: componentName,
                    category,
                    path: path.join(relativePath, file),
                  });
                }
              }
            }

            scan(fullPath, depth + 1);
          }
        }
      } catch (e) {
        // 忽略
      }
    };

    scan(dirPath, 0);
  }

  /**
   * 提取组件名称
   */
  extractComponentName(dirPath, fileName) {
    const filePath = path.join(dirPath, fileName);
    try {
      const content = fs.readFileSync(filePath, 'utf8');

      // Dart 组件
      if (fileName.endsWith('.dart')) {
        const match = content.match(/class\s+(\w+)\s+(?:extends|implements|with)/);
        return match ? match[1] : null;
      }

      // React 组件
      if (fileName.endsWith('.jsx') || fileName.endsWith('.tsx')) {
        const match = content.match(/(?:export\s+(?:default\s+)?(?:const|function|class)\s+(\w+)|(?:const|function|class)\s+(\w+).*?React\.Component)/);
        return match ? (match[1] || match[2]) : null;
      }

      // Vue 组件
      if (fileName.endsWith('.vue')) {
        const match = content.match(/name:\s*['"](\w+)['"]/);
        return match ? match[1] : path.basename(fileName, '.vue');
      }
    } catch (e) {
      // 忽略
    }

    return null;
  }

  /**
   * 提取路由信息
   */
  async extractRouting(projectPath) {
    const routing = {
      configFile: '',
      routeCount: 0,
      routes: [],
    };

    // Flutter 路由
    const appPagesPath = path.join(projectPath, 'lib/routes/app_pages.dart');
    if (fs.existsSync(appPagesPath)) {
      routing.configFile = 'lib/routes/app_pages.dart';
      try {
        const content = fs.readFileSync(appPagesPath, 'utf8');
        const matches = content.matchAll(/GetPage\s*\(\s*(?:name:\s*['"]([^'"]+)['"]|\/\*([^*]+)\*\/)/g);
        for (const match of matches) {
          const routeName = match[1] || match[2];
          if (routeName) {
            routing.routes.push({ name: routeName.trim() });
          }
        }
        routing.routeCount = routing.routes.length;
      } catch (e) {
        // 忽略
      }
    }

    // React Router
    const routerPath = path.join(projectPath, 'src/router');
    if (fs.existsSync(routerPath)) {
      routing.configFile = 'src/router/';
      // 扫描路由文件
      try {
        const files = fs.readdirSync(routerPath);
        for (const file of files) {
          if (file.endsWith('.js') || file.endsWith('.jsx') || file.endsWith('.ts') || file.endsWith('.tsx')) {
            routing.routes.push({ file });
          }
        }
        routing.routeCount = routing.routes.length;
      } catch (e) {
        // 忽略
      }
    }

    return routing;
  }

  /**
   * 提取 API 信息
   */
  async extractAPI(projectPath) {
    const api = {
      baseConfig: '',
      apiDir: '',
      apiFiles: [],
    };

    // Flutter API
    const baseConnectPath = path.join(projectPath, 'lib/https/base_connect.dart');
    if (fs.existsSync(baseConnectPath)) {
      api.baseConfig = 'lib/https/base_connect.dart';
    }

    const apiDir = path.join(projectPath, 'lib/https/api');
    if (fs.existsSync(apiDir)) {
      api.apiDir = 'lib/https/api';
      try {
        const files = fs.readdirSync(apiDir);
        for (const file of files) {
          if (file.endsWith('.dart')) {
            api.apiFiles.push(`lib/https/api/${file}`);
          }
        }
      } catch (e) {
        // 忽略
      }
    }

    // React/Vue API
    const srcApiDir = path.join(projectPath, 'src/api');
    if (fs.existsSync(srcApiDir)) {
      api.apiDir = 'src/api';
      try {
        const files = fs.readdirSync(srcApiDir);
        for (const file of files) {
          if (file.endsWith('.js') || file.endsWith('.ts')) {
            api.apiFiles.push(`src/api/${file}`);
          }
        }
      } catch (e) {
        // 忽略
      }
    }

    return api;
  }

  /**
   * 提取国际化信息
   */
  async extractI18n(projectPath) {
    const i18n = {
      enabled: false,
      langDir: '',
      languages: [],
    };

    // Flutter 国际化
    const langDir = path.join(projectPath, 'lib/lang');
    if (fs.existsSync(langDir)) {
      i18n.enabled = true;
      i18n.langDir = 'lib/lang';
      try {
        const files = fs.readdirSync(langDir);
        for (const file of files) {
          if (file.endsWith('.dart')) {
            const match = file.match(/(\w+)\.dart/);
            if (match) {
              i18n.languages.push(match[1]);
            }
          }
        }
      } catch (e) {
        // 忽略
      }
    }

    // React/Vue 国际化
    const srcLangDir = path.join(projectPath, 'src/locales');
    if (fs.existsSync(srcLangDir)) {
      i18n.enabled = true;
      i18n.langDir = 'src/locales';
      try {
        const files = fs.readdirSync(srcLangDir);
        for (const file of files) {
          const match = file.match(/(\w+)\.(json|js|ts)/);
          if (match) {
            i18n.languages.push(match[1]);
          }
        }
      } catch (e) {
        // 忽略
      }
    }

    const i18nDir = path.join(projectPath, 'src/i18n');
    if (fs.existsSync(i18nDir)) {
      i18n.enabled = true;
      i18n.langDir = 'src/i18n';
    }

    return i18n;
  }

  /**
   * 提取状态管理信息
   */
  async extractStateManagement(projectPath) {
    const state = {
      type: '',
      description: '',
    };

    // 检查 Flutter 状态管理
    const libPath = path.join(projectPath, 'lib');
    if (fs.existsSync(libPath)) {
      const controllerDir = path.join(libPath, 'controller');
      if (fs.existsSync(controllerDir)) {
        state.type = 'GetX';
        state.description = '使用 GetX 进行状态管理，通过 `.obs` 和 `Obx()` 进行响应式状态更新。控制器位于 `lib/controller/` 目录。';
      }

      const providerDir = path.join(libPath, 'providers');
      if (fs.existsSync(providerDir)) {
        state.type = 'Provider';
        state.description = '使用 Provider 进行状态管理，通过 `ChangeNotifier` 和 `Consumer` 管理应用状态。';
      }

      const blocDir = path.join(libPath, 'bloc');
      if (fs.existsSync(blocDir)) {
        state.type = 'BLoC';
        state.description = '使用 BLoC 模式进行状态管理，通过 `BlocProvider` 和 `BlocBuilder` 管理应用状态。';
      }
    }

    // 检查 React 状态管理
    const srcPath = path.join(projectPath, 'src');
    if (fs.existsSync(srcPath)) {
      const storeDir = path.join(srcPath, 'store');
      if (fs.existsSync(storeDir)) {
        state.type = 'Redux/Vuex';
        state.description = '使用集中式状态管理，Store 位于 `src/store/` 目录。';
      }

      const contextDir = path.join(srcPath, 'context');
      if (fs.existsSync(contextDir)) {
        state.type = 'React Context';
        state.description = '使用 React Context API 进行状态管理。';
      }
    }

    return state;
  }

  /**
   * 提取代码风格
   */
  async extractCodeStyle(projectPath) {
    const style = {
      fileNaming: 'snake_case',
      classNaming: 'PascalCase',
      variableNaming: 'camelCase',
      constantNaming: 'camelCase',
      componentPrefix: '',
    };

    // Flutter 代码风格
    const pubspecPath = path.join(projectPath, 'pubspec.yaml');
    if (fs.existsSync(pubspecPath)) {
      style.fileNaming = 'snake_case (例: order_3_6.dart)';
      style.classNaming = 'PascalCase (例: Order36Controller)';
      style.variableNaming = 'camelCase (例: currentPage)';
      style.constantNaming = 'camelCase 或 UPPER_CASE';
      style.componentPrefix = 'AK (自定义组件以 AK 开头)';
    }

    // React 代码风格
    const packageJsonPath = path.join(projectPath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      style.fileNaming = 'kebab-case 或 PascalCase';
      style.classNaming = 'PascalCase';
      style.variableNaming = 'camelCase';
      style.constantNaming = 'UPPER_CASE';
      style.componentPrefix = '无特定前缀';
    }

    return style;
  }

  /**
   * 提取开发信息
   */
  async extractDevelopmentInfo(projectPath) {
    const dev = {
      runCommand: '',
      buildCommand: '',
      environments: [],
    };

    // Flutter 开发命令
    const pubspecPath = path.join(projectPath, 'pubspec.yaml');
    if (fs.existsSync(pubspecPath)) {
      dev.runCommand = 'flutter run -d chrome';
      dev.buildCommand = 'flutter build web';
      dev.environments = ['dev (开发环境)', 'qat (测试环境)', 'prod (生产环境)'];

      // 检查环境配置
      const envPath = path.join(projectPath, 'lib/config/env.dart');
      if (fs.existsSync(envPath)) {
        dev.envConfig = 'lib/config/env.dart';
      }
    }

    // Node.js 开发命令
    const packageJsonPath = path.join(projectPath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        if (pkg.scripts) {
          if (pkg.scripts.dev) dev.runCommand = `npm run dev`;
          else if (pkg.scripts.start) dev.runCommand = `npm start`;

          if (pkg.scripts.build) dev.buildCommand = `npm run build`;
        }
      } catch (e) {
        // 忽略
      }
    }

    return dev;
  }

  /**
   * 提取业务模块
   */
  async extractBusinessModules(projectPath) {
    const modules = {
      list: [],
      views: [],
    };

    const libPath = path.join(projectPath, 'lib/views');
    const srcPath = path.join(projectPath, 'src/views');
    const srcPagesPath = path.join(projectPath, 'src/pages');

    let viewsPath = null;
    if (fs.existsSync(libPath)) viewsPath = libPath;
    else if (fs.existsSync(srcPath)) viewsPath = srcPath;
    else if (fs.existsSync(srcPagesPath)) viewsPath = srcPagesPath;

    if (viewsPath) {
      const scanModules = (dir, prefix = '') => {
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory()) {
              const fullPath = path.join(dir, entry.name);
              const relativePath = path.relative(viewsPath, fullPath);

              // 统计文件数
              let fileCount = 0;
              let hasSubdirs = false;
              try {
                const subEntries = fs.readdirSync(fullPath, { withFileTypes: true });
                for (const sub of subEntries) {
                  if (sub.isFile()) {
                    const ext = path.extname(sub.name);
                    if (['.dart', '.jsx', '.tsx', '.vue'].includes(ext)) {
                      fileCount++;
                    }
                  } else if (sub.isDirectory()) {
                    hasSubdirs = true;
                  }
                }
              } catch (e) {
                // 忽略
              }

              if (fileCount > 0) {
                modules.list.push({
                  name: entry.name,
                  path: path.join(prefix || 'views', relativePath),
                  fileCount,
                });
              }

              if (hasSubdirs) {
                scanModules(fullPath, prefix || 'views');
              }
            }
          }
        } catch (e) {
          // 忽略
        }
      };

      scanModules(viewsPath);
    }

    return modules;
  }

  /**
   * 生成 Markdown 格式文档
   */
  toMarkdown(context) {
    const lines = [];

    // 标题
    lines.push('# AI_CONTEXT.md - 项目上下文文档\n');

    // 项目概述
    lines.push('## 📋 项目概述\n');
    lines.push(`**项目名称**: ${context.project.name}`);
    lines.push(`**项目类型**: ${context.project.type}`);
    if (context.project.description) {
      lines.push(`**项目描述**: ${context.project.description}`);
    }
    lines.push(`**版本**: ${context.project.version}\n`);
    lines.push('---\n');

    // 技术栈
    lines.push('## 🏗️ 技术栈\n');

    if (context.techStack.framework) {
      lines.push('### 核心框架');
      lines.push(`- **${context.techStack.framework}**: 主框架`);
    }

    if (context.techStack.stateManagement) {
      lines.push(`- **状态管理**: ${context.techStack.stateManagement}`);
    }

    lines.push('');

    if (context.techStack.networkLibrary) {
      lines.push(`- **${context.techStack.networkLibrary}**: HTTP 网络请求`);
    }

    if (context.techStack.storageLibrary) {
      lines.push(`- **${context.techStack.storageLibrary}**: 本地存储`);
    }

    if (context.techStack.uiLibraries && context.techStack.uiLibraries.length > 0) {
      lines.push('\n### UI 组件库');
      for (const lib of context.techStack.uiLibraries) {
        lines.push(`- **${lib.name}** (${lib.version || '*'}): ${lib.desc}`);
      }
    }

    if (context.techStack.coreLibraries && context.techStack.coreLibraries.length > 0) {
      lines.push('\n### 主要依赖库');
      for (const lib of context.techStack.coreLibraries.slice(0, 15)) {
        lines.push(`- **${lib.name}** (${lib.version || '*'})`);
      }
    }

    lines.push('\n---\n');

    // 项目结构 - 树状格式
    lines.push('## 📁 项目结构\n');
    lines.push('```\nlib/');

    // 生成树状结构
    const tree = this.generateTreeStructure(context);
    lines.push(tree);
    lines.push('```\n');

    // 目录说明
    if (context.structure.directories) {
      lines.push('### 目录说明\n');
      const importantDirs = Object.entries(context.structure.directories)
        .filter(([_, info]) => info.subdirs && info.subdirs.length > 0)
        .slice(0, 20);

      for (const [dirPath, info] of importantDirs) {
        const displayName = dirPath.startsWith('lib/') ? dirPath.substring(4) : dirPath;
        const desc = info.subdirs ? info.subdirs.slice(0, 3).join(', ') : '';
        lines.push(`- **${displayName}**: ${desc}${info.subdirs && info.subdirs.length > 3 ? ' 等' : ''}`);
      }
    }

    lines.push('\n---\n');

    // 架构模式
    lines.push('## 🎯 核心架构模式\n');
    lines.push(context.architecture.description || '');
    lines.push('');

    if (context.architecture.layers && context.architecture.layers.length > 0) {
      lines.push('### 架构层级\n');
      for (const layer of context.architecture.layers) {
        lines.push(`- **${layer}**`);
      }
    }

    lines.push('');

    if (context.stateManagement.type) {
      lines.push(`### 状态管理模式\n`);
      lines.push(`- **${context.stateManagement.type}**: ${context.stateManagement.description}\n`);
    }

    lines.push('---\n');

    // UI 组件库
    if (context.components.list && context.components.list.length > 0) {
      lines.push('## 🎨 UI 组件库\n');

      if (context.components.prefix) {
        lines.push(`### 组件命名规范\n`);
        lines.push(`所有自定义组件以 \`${context.components.prefix}\` 开头。\n`);
      }

      lines.push('### 组件分类\n');

      for (const [category, items] of Object.entries(context.components.categories)) {
        if (items.length > 0) {
          lines.push(`#### ${category}\n`);
          for (const item of items.slice(0, 10)) {
            lines.push(`- **\`${item.name}\`** (\`${item.file}\`)`);
          }
          if (items.length > 10) {
            lines.push(`  - _等 ${items.length} 个组件_`);
          }
          lines.push('');
        }
      }
    }

    lines.push('---\n');

    // 路由配置
    if (context.routing.configFile || context.routing.routes.length > 0) {
      lines.push('## 🧭 路由管理\n');
      lines.push(`**配置文件**: \`${context.routing.configFile || '未指定'}\`\n`);
      if (context.routing.routes.length > 0) {
        lines.push(`**路由数量**: ${context.routing.routeCount}\n`);
        lines.push('### 主要路由\n');
        for (const route of context.routing.routes.slice(0, 20)) {
          if (route.name) {
            lines.push(`- \`${route.name}\``);
          } else if (route.file) {
            lines.push(`- \`${route.file}\``);
          }
        }
      }
      lines.push('');
    }

    lines.push('---\n');

    // API 接口
    if (context.api.apiDir || context.api.baseConfig) {
      lines.push('## 🌐 API 接口\n');
      if (context.api.baseConfig) {
        lines.push(`**基础配置**: \`${context.api.baseConfig}\`\n`);
      }
      if (context.api.apiDir) {
        lines.push(`**API 目录**: \`${context.api.apiDir}\`\n`);
        if (context.api.apiFiles.length > 0) {
          lines.push('### API 文件\n');
          for (const file of context.api.apiFiles.slice(0, 15)) {
            lines.push(`- \`${file}\``);
          }
        }
      }
      lines.push('');
    }

    lines.push('---\n');

    // 国际化
    if (context.i18n.enabled) {
      lines.push('## 🌐 国际化 (i18n)\n');
      lines.push(`**语言文件目录**: \`${context.i18n.langDir}\`\n`);
      if (context.i18n.languages.length > 0) {
        lines.push('**支持的语言**:\n');
        for (const lang of context.i18n.languages) {
          lines.push(`- ${lang}`);
        }
      }
      lines.push('');
    }

    lines.push('---\n');

    // 代码规范
    lines.push('## 📝 代码规范\n');
    lines.push('### 命名规范\n');
    lines.push(`- **文件名**: ${context.codeStyle.fileNaming}`);
    lines.push(`- **类名**: ${context.codeStyle.classNaming}`);
    lines.push(`- **变量名**: ${context.codeStyle.variableNaming}`);
    lines.push(`- **常量**: ${context.codeStyle.constantNaming}`);
    if (context.codeStyle.componentPrefix) {
      lines.push(`- **组件前缀**: ${context.codeStyle.componentPrefix}`);
    }
    lines.push('\n---\n');

    // 页面模板类型（针对 Flutter 项目）
    if (context.projectType === 'flutter') {
      lines.push('## 📄 页面模板类型\n');
      lines.push('项目中有**两种主要的页面模板类型**，在生成新页面时需要让用户选择：\n');
      lines.push('### 📊 模板类型 A: 表格数据展示页面');
      lines.push('**使用场景**: 数据列表、查询结果、管理等需要展示表格数据的页面\n');
      lines.push('**特点**:');
      lines.push('- 使用 `CommonScaffold` 作为页面容器');
      lines.push('- 使用 `AKTable` 组件展示数据');
      lines.push('- 包含搜索表单、筛选条件');
      lines.push('- 支持分页 (`AKPagination`)');
      lines.push('- 支持排序功能');
      lines.push('- Controller 继承基础表格控制器模式\n');
      lines.push('**典型结构**:');
      lines.push('```dart');
      lines.push('// View');
      lines.push('CommonScaffold(');
      lines.push('  child: Column(');
      lines.push('    children: [');
      lines.push('      AKBreadcrumb(...),      // 面包屑');
      lines.push('      Form(...),               // 搜索表单');
      lines.push('      AKTable(...),            // 数据表格');
      lines.push('      AKPagination(...),       // 分页');
      lines.push('    ],');
      lines.push('  ),');
      lines.push(')');
      lines.push('');
      lines.push('// Controller');
      lines.push('- 数据列表管理 (RxList)');
      lines.push('- 分页逻辑 (currentPage, totalPages)');
      lines.push('- 搜索条件管理');
      lines.push('- 排序功能');
      lines.push('- API 调用方法');
      lines.push('```\n');

      lines.push('---\n');
      lines.push('### 📄 模板类型 B: PDF 查看器页面');
      lines.push('**使用场景**: 报表查看、打印预览等需要展示 PDF 文档的页面\n');
      lines.push('**特点**:');
      lines.push('- 使用 `PdfViewerPage` 作为页面容器');
      lines.push('- 使用 `pdfx` 库渲染 PDF');
      lines.push('- 包含搜索表单获取报表参数');
      lines.push('- 支持分页浏览 PDF');
      lines.push('- 支持打印功能');
      lines.push('- Controller 管理 PDF 文档状态\n');
      lines.push('**典型结构**:');
      lines.push('```dart');
      lines.push('// View');
      lines.push('PdfViewerPage(');
      lines.push('  controller: controller,        // PDF 控制器');
      lines.push('  breadcrumb: [...],             // 面包屑');
      lines.push('  actionWidget: Form(...),       // 搜索表单');
      lines.push('  paginationWidget: AKPagination(...), // PDF 分页');
      lines.push(')');
      lines.push('');
      lines.push('// Controller');
      lines.push('- PDF 文档管理 (PdfDocument?)');
      lines.push('- 分页状态 (currentPage, totalPages)');
      lines.push('- 搜索条件管理');
      lines.push('- 获取 PDF 方法 (getPdf)');
      lines.push('- 打印方法 (printFile)');
      lines.push('```\n');

      lines.push('---\n');
    }

    // 生成新页面工作流程
    lines.push('## 🚀 生成新页面时的工作流程\n');
    lines.push('### 当需要生成新页面时，请遵循以下步骤:\n');
    lines.push('1. **读取本 AI_CONTEXT.md 文件**');
    lines.push('2. **询问用户选择模板类型**:');
    lines.push('   ```');
    lines.push('   请选择要生成的页面模板类型:');
    if (context.projectType === 'flutter') {
      lines.push('   A. 表格数据展示页面 - 用于数据列表、查询结果等');
      lines.push('   B. PDF 查看器页面 - 用于报表查看、打印预览等');
    } else {
      lines.push('   A. 数据列表页面 - 用于展示表格数据');
      lines.push('   B. 表单页面 - 用于数据录入');
      lines.push('   C. 详情页面 - 用于查看单条数据详情');
    }
    lines.push('   ```');
    lines.push('3. **根据用户选择**:');
    lines.push('   - 如果选择 A: 参考表格模板示例生成');
    if (context.projectType === 'flutter') {
      lines.push('   - 如果选择 B: 参考 PDF 查看器模板示例生成');
    } else {
      lines.push('   - 如果选择 B: 参考表单模板示例生成');
      lines.push('   - 如果选择 C: 参考详情页模板示例生成');
    }
    lines.push('4. **需要生成的内容**:');
    lines.push('   - View 文件 (放在对应的 views 子目录)');
    if (context.projectType === 'flutter') {
      lines.push('   - Controller 文件 (放在对应的 controller 子目录)');
      lines.push('   - Binding 文件 (如果需要，放在 https/bindings/)');
      lines.push('   - 路由配置 (更新 routes/app_pages.dart)');
      lines.push('   - API 文件 (如果需要，放在 https/api/)');
    } else {
      lines.push('   - 组件样式文件 (如需要)');
      lines.push('   - API 接口文件 (如需要)');
      lines.push('   - 路由配置 (如需要)');
    }
    lines.push('');

    lines.push('---\n');

    // AI生成代码检查清单
    lines.push('## 🤖 AI 生成代码时的检查清单\n');
    lines.push('生成新页面时，请确保:\n');
    lines.push('- [ ] 已询问用户选择模板类型');
    lines.push('- [ ] View 文件使用了正确的页面容器组件');
    if (context.projectType === 'flutter') {
      lines.push('- [ ] Controller 正确管理状态 (Rx 变量)');
    } else {
      lines.push('- [ ] 组件正确管理状态 (useState/hook)');
    }
    lines.push('- [ ] 包含必要的表单验证');
    if (context.projectType === 'flutter') {
      lines.push('- [ ] 使用了国际化 (.tr)');
    } else {
      lines.push('- [ ] 用户可见文本支持国际化');
    }
    lines.push('- [ ] API 调用有错误处理');
    lines.push('- [ ] 遵循了命名规范');
    lines.push('- [ ] 文件放在正确的目录');
    if (context.projectType === 'flutter') {
      lines.push('- [ ] 更新了路由配置');
    }
    lines.push('- [ ] 参考了对应的示例文件');
    lines.push('');

    lines.push('---\n');

    // 开发指南
    lines.push('## 🔧 开发指南\n');
    lines.push('### 运行命令\n');
    lines.push('```bash');
    if (context.development.runCommand) {
      lines.push(`# 运行项目`);
      lines.push(context.development.runCommand);
    }
    if (context.development.buildCommand) {
      lines.push(`\n# 构建项目`);
      lines.push(context.development.buildCommand);
    }
    lines.push('```\n');

    if (context.development.environments && context.development.environments.length > 0) {
      lines.push('### 环境配置\n');
      for (const env of context.development.environments) {
        lines.push(`- ${env}`);
      }
      lines.push('');
    }

    lines.push('---\n');

    // 业务模块
    if (context.businessModules.list && context.businessModules.list.length > 0) {
      lines.push('## 🔍 关键业务模块\n');
      for (const module of context.businessModules.list) {
        lines.push(`### ${module.name}`);
        lines.push(`- **路径**: \`${module.path}\``);
        lines.push(`- **文件数**: ${module.fileCount}\n`);
      }
    }

    lines.push('---\n');

    // AI 使用说明
    lines.push('## 🤖 AI 使用说明\n');
    lines.push('此文档包含项目的完整上下文信息，可供 AI 理解项目结构并协助：\n');
    lines.push('1. **生成新页面**: 参考项目结构和代码规范\n');
    lines.push('2. **修复 Bug**: 了解架构模式和组件使用方式\n');
    lines.push('3. **添加功能**: 遵循现有代码风格和命名规范\n');
    lines.push('4. **重构代码**: 理解模块组织和依赖关系\n');
    lines.push('');

    lines.push('---\n');
    lines.push(`**文档生成时间**: ${context.metadata.generatedAt}\n`);
    lines.push(`**项目路径**: ${context.metadata.projectPath}\n`);

    return lines.join('\n');
  }

  /**
   * 生成树状目录结构
   * @param {Object} context - 完整上下文对象
   * @returns {string} 树状格式字符串
   */
  generateTreeStructure(context) {
    const directories = context.structure?.directories;

    if (!directories || Object.keys(directories).length === 0) {
      return '    (无法解析目录结构)';
    }

    const lines = [];
    const rootPrefix = context.structure?.libPath ? 'lib' : (context.structure?.sourcePath ? 'src' : '');

    // 获取第一级目录（如 lib/common, lib/components）
    const rootDirs = Object.entries(directories)
      .filter(([key]) => {
        const parts = key.split('/').filter(p => p);
        // 对于 lib/xxx 格式，parts 长度应该是 2
        // 对于 src/xxx 格式，parts 长度也应该是 2
        return parts.length === 2 && parts[0] === rootPrefix;
      })
      .sort((a, b) => a[0].localeCompare(b[0]));

    for (const [dirPath, info] of rootDirs) {
      // dirPath 格式: lib/common
      const parts = dirPath.split('/');
      const dirName = parts[1]; // 获取 'common' 部分
      const comment = this.getDirectoryDescription(dirName, dirPath);
      lines.push(`├── ${dirName}/${comment}`);

      // 添加子目录
      if (info.subdirs && info.subdirs.length > 0) {
        for (const subdir of info.subdirs.slice(0, 8)) {
          const subdirKey = `${dirPath}/${subdir}`;
          const subdirInfo = directories[subdirKey];
          const subdirComment = this.getDirectoryDescription(subdir, subdirKey);
          lines.push(`│   ├── ${subdir}/${subdirComment}`);

          // 添加第三级目录（如果有）
          if (subdirInfo && subdirInfo.subdirs && subdirInfo.subdirs.length > 0) {
            for (const subSubdir of subdirInfo.subdirs.slice(0, 4)) {
              const subSubdirComment = this.getDirectoryDescription(subSubdir, `${subdirKey}/${subSubdir}`);
              lines.push(`│   │   ├── ${subSubdir}/${subSubdirComment}`);
            }
            if (subdirInfo.subdirs.length > 4) {
              lines.push(`│   │   └── ... 等 ${subdirInfo.subdirs.length} 个子目录`);
            }
          }
        }
        if (info.subdirs.length > 8) {
          lines.push(`│   └── ... 等 ${info.subdirs.length} 个子目录`);
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * 获取目录描述注释
   * @param {string} dirName - 目录名
   * @param {string} fullPath - 完整路径
   * @returns {string} 描述注释
   */
  getDirectoryDescription(dirName, fullPath) {
    const descriptions = {
      // 核心目录
      'main': ' # 应用入口',
      'common': ' # 公共工具和常量',
      'components': ' # 可复用 UI 组件',
      'config': ' # 配置文件',
      'controller': ' # 控制器 (业务逻辑)',
      'https': ' # 网络请求层',
      'routes': ' # 路由配置',
      'types': ' # 类型定义',
      'util': ' # 工具函数',
      'views': ' # 页面视图',
      'lang': ' # 国际化语言文件',
      'models': ' # 数据模型',
      'services': ' # 服务层',
      'utils': ' # 工具类',
      'helpers': ' # 辅助函数',
      'assets': ' # 静态资源',
      'styles': ' # 样式文件',
      'hooks': ' # 自定义 Hooks',
      'contexts': ' # React Context',
      'store': ' # 状态管理',

      // 组件子目录
      'breadcrumb': ' # 面包屑导航',
      'button': ' # 按钮组件',
      'calendarDatePicker': ' # 日期选择器',
      'checkbox': ' # 复选框',
      'dropdown': ' # 下拉选择框',
      'field': ' # 输入框',
      'pagination': ' # 分页组件',
      'pdfViewer': ' # PDF 查看器',
      'table': ' # 数据表格',
      'dialog': ' # 对话框',
      'snackbar': ' # 消息提示',
      'upload': ' # 文件上传',

      // 配置子目录
      'env.dart': ' # 环境配置',
      'setting.dart': ' # 应用设置',
      'style.dart': ' # 样式配置',
      'info.dart': ' # 应用信息',

      // 控制器子目录
      'common': ' # 公共控制器',
      'login_controller': ' # 登录',
      'order_controller': ' # 订单管理',
      'pda_management': ' # PDA 管理',
      'basic_management': ' # 基本管理',
      'business_controller': ' # 业务管理',

      // 视图子目录
      'login': ' # 登录页',
    };

    // 检查完整路径匹配
    if (descriptions[fullPath]) {
      return descriptions[fullPath];
    }

    // 检查目录名匹配
    if (descriptions[dirName]) {
      return descriptions[dirName];
    }

    // 根据路径模式生成描述
    if (fullPath.includes('controller')) {
      const moduleName = dirName.replace(/_/g, ' ').replace(/^\d+[_-]?/, '');
      return ` # ${moduleName} 控制器`;
    }
    if (fullPath.includes('views')) {
      const moduleName = dirName.replace(/_/g, ' ').replace(/^\d+[_-]?/, '');
      return ` # ${moduleName} 页面`;
    }
    if (fullPath.includes('components')) {
      return ` # ${dirName} 组件`;
    }

    return '';
  }

  /**
   * 保存文档到文件
   */
  async saveToFile(outputPath, markdown) {
    try {
      fs.writeFileSync(outputPath, markdown, 'utf8');
      console.log(`[AI Context Generator] 文档已保存到: ${outputPath}`);
      return { success: true, path: outputPath };
    } catch (error) {
      console.error(`[AI Context Generator] 保存文档失败:`, error.message);
      return { success: false, error: error.message };
    }
  }
}

module.exports = AIContextGenerator;
