/**
 * Project Scanner Module
 *
 * 职责：
 * - 检测项目类型
 * - 扫描项目版本信息
 * - 解析项目配置文件
 * - 获取依赖信息
 * - 对依赖进行分类和用途识别
 *
 * 支持的项目类型：
 * - Flutter / Dart
 * - Node.js (React, Vue, Angular 等)
 * - Python
 * - Go
 * - Java (Maven, Gradle)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Lazy load structure analyzer
let StructureAnalyzer = null;

class ProjectScanner {
  constructor() {
    this.projectTypeDetectors = new Map();
    this.versionCommands = new Map();
    this.dependencyClassifier = null;
    this.structureAnalyzer = null;
    this.initDetectors();
  }

  /**
   * 初始化项目类型检测器
   */
  initDetectors() {
    // 延迟加载依赖分类器
    try {
      const DependencyClassifier = require('../dependency-classifier');
      this.dependencyClassifier = new DependencyClassifier();
    } catch (error) {
      console.warn('Failed to load Dependency Classifier:', error.message);
    }

    // 延迟加载结构分析器
    try {
      StructureAnalyzer = require('../structure-analyzer');
      this.structureAnalyzer = new StructureAnalyzer();
    } catch (error) {
      console.warn('Failed to load Structure Analyzer:', error.message);
    }

    // Flutter/Dart 项目检测
    this.projectTypeDetectors.set('flutter', {
      files: ['pubspec.yaml'],
      check: (projectPath) => this.isFlutterProject(projectPath),
      ecosystem: 'pub',
    });

    // Node.js 项目检测
    this.projectTypeDetectors.set('nodejs', {
      files: ['package.json'],
      check: (projectPath) => this.isNodeJSProject(projectPath),
    });

    // Python 项目检测
    this.projectTypeDetectors.set('python', {
      files: ['requirements.txt', 'setup.py', 'pyproject.toml', 'Pipfile'],
      check: (projectPath) => this.isPythonProject(projectPath),
    });

    // Go 项目检测
    this.projectTypeDetectors.set('go', {
      files: ['go.mod'],
      check: (projectPath) => this.isGoProject(projectPath),
    });

    // Java/Maven 项目检测
    this.projectTypeDetectors.set('maven', {
      files: ['pom.xml'],
      check: (projectPath) => this.isMavenProject(projectPath),
    });

    // Java/Gradle 项目检测
    this.projectTypeDetectors.set('gradle', {
      files: ['build.gradle', 'build.gradle.kts'],
      check: (projectPath) => this.isGradleProject(projectPath),
    });

    // Ruby 项目检测
    this.projectTypeDetectors.set('ruby', {
      files: ['Gemfile'],
      check: (projectPath) => this.isRubyProject(projectPath),
    });

    // PHP/Composer 项目检测
    this.projectTypeDetectors.set('php', {
      files: ['composer.json'],
      check: (projectPath) => this.isPHPProject(projectPath),
    });

    // 初始化版本命令
    this.versionCommands = new Map([
      ['flutter', 'flutter --version'],
      ['dart', 'dart --version'],
      ['node', 'node --version'],
      ['npm', 'npm --version'],
      ['yarn', 'yarn --version'],
      ['pnpm', 'pnpm --version'],
      ['python', 'python --version'],
      ['python3', 'python3 --version'],
      ['pip', 'pip --version'],
      ['go', 'go version'],
      ['java', 'java -version'],
      ['mvn', 'mvn -version'],
      ['gradle', 'gradle --version'],
      ['ruby', 'ruby --version'],
      ['gem', 'gem --version'],
      ['composer', 'composer --version'],
      ['php', 'php --version'],
    ]);
  }

  /**
   * 扫描项目信息
   * @param {string} projectPath - 项目路径
   * @returns {Object} 项目信息
   */
  async scan(projectPath) {
    const result = {
      projectPath,
      types: [],
      info: {},
      versions: {},
      config: {},
      dependencies: {},
      metadata: {
        scannedAt: new Date().toISOString(),
      },
    };

    // 检测项目类型
    result.types = this.detectProjectTypes(projectPath);

    // 扫描每种项目类型的信息
    for (const type of result.types) {
      const typeInfo = await this.scanProjectType(type, projectPath);
      result.info[type] = typeInfo.info;
      result.config[type] = typeInfo.config;
      result.dependencies[type] = typeInfo.dependencies;
    }

    // 获取所有相关版本
    result.versions = await this.scanVersions(projectPath, result.types);

    // 分析项目结构
    if (this.structureAnalyzer && result.types.length > 0) {
      try {
        const primaryType = result.types[0];
        const structureAnalysis = this.structureAnalyzer.analyze(projectPath, primaryType);
        result.structure = {
          analysis: structureAnalysis,
          summary: this.structureAnalyzer.generateAISummary(structureAnalysis),
          markdown: this.structureAnalyzer.toMarkdown(structureAnalysis),
        };
      } catch (error) {
        console.warn('Structure analysis failed:', error.message);
      }
    }

    return result;
  }

  /**
   * 检测项目类型
   * @param {string} projectPath - 项目路径
   * @returns {Array} 项目类型数组
   */
  detectProjectTypes(projectPath) {
    const types = [];

    for (const [type, detector] of this.projectTypeDetectors) {
      try {
        if (detector.check(projectPath)) {
          types.push(type);
        }
      } catch (error) {
        // 忽略检测错误
      }
    }

    return types;
  }

  /**
   * 扫描特定类型的项目信息
   * @param {string} type - 项目类型
   * @param {string} projectPath - 项目路径
   * @returns {Object} 项目类型信息
   */
  async scanProjectType(type, projectPath) {
    switch (type) {
      case 'flutter':
        return this.scanFlutterProject(projectPath);
      case 'nodejs':
        return this.scanNodeJSProject(projectPath);
      case 'python':
        return this.scanPythonProject(projectPath);
      case 'go':
        return this.scanGoProject(projectPath);
      case 'maven':
        return this.scanMavenProject(projectPath);
      case 'gradle':
        return this.scanGradleProject(projectPath);
      case 'ruby':
        return this.scanRubyProject(projectPath);
      case 'php':
        return this.scanPHPProject(projectPath);
      default:
        return { info: {}, config: {}, dependencies: {} };
    }
  }

  /**
   * 扫描 Flutter 项目
   */
  scanFlutterProject(projectPath) {
    const yaml = require('js-yaml');
    const pubspecPath = path.join(projectPath, 'pubspec.yaml');

    if (!fs.existsSync(pubspecPath)) {
      return { info: {}, config: {}, dependencies: {}, classifiedDependencies: {} };
    }

    const content = fs.readFileSync(pubspecPath, 'utf8');
    const pubspec = yaml.load(content);

    const dependencies = pubspec.dependencies || {};
    const devDependencies = pubspec.dev_dependencies || {};

    // 对依赖进行分类
    let classifiedDependencies = {};
    let dependencyAnalysis = {};

    if (this.dependencyClassifier) {
      const eco = 'pub';
      classifiedDependencies = {
        dependencies: this.dependencyClassifier.classifyDependencies(dependencies, eco),
        devDependencies: this.dependencyClassifier.classifyDependencies(devDependencies, eco),
      };

      dependencyAnalysis = {
        dependencies: this.dependencyClassifier.analyzeDependencies(dependencies, eco),
        devDependencies: this.dependencyClassifier.analyzeDependencies(devDependencies, eco),
        healthScore: this.dependencyClassifier.getHealthScore(classifiedDependencies.dependencies),
      };
    }

    return {
      info: {
        name: pubspec.name || path.basename(projectPath),
        description: pubspec.description || '',
        version: pubspec.version || '1.0.0',
        environment: pubspec.environment || {},
        flutter: pubspec.flutter || {},
      },
      config: {
        sdkVersion: pubspec.environment?.sdk || '>=2.12.0',
        flutterVersion: pubspec.flutter?.sdk || null,
        materialDesign: pubspec.flutter?.usesMaterialDesign !== false,
      },
      dependencies: {
        dependencies: dependencies || {},
        devDependencies: devDependencies || {},
        dependencyOverrides: pubspec.dependency_overrides || {},
      },
      classifiedDependencies,
      dependencyAnalysis,
    };
  }

  /**
   * 扫描 Node.js 项目
   */
  scanNodeJSProject(projectPath) {
    const packageJsonPath = path.join(projectPath, 'package.json');

    if (!fs.existsSync(packageJsonPath)) {
      return { info: {}, config: {}, dependencies: {}, classifiedDependencies: {} };
    }

    const content = fs.readFileSync(packageJsonPath, 'utf8');
    const pkg = JSON.parse(content);

    // 检测框架类型
    let framework = 'nodejs';
    if (pkg.dependencies?.react) framework = 'react';
    else if (pkg.dependencies?.vue) framework = 'vue';
    else if (pkg.dependencies?.angular) framework = 'angular';
    else if (pkg.dependencies?.svelte) framework = 'svelte';
    else if (pkg.dependencies?.['next']) framework = 'next';
    else if (pkg.dependencies?.nuxt) framework = 'nuxt';

    const dependencies = pkg.dependencies || {};
    const devDependencies = pkg.devDependencies || {};

    // 对依赖进行分类
    let classifiedDependencies = {};
    let dependencyAnalysis = {};

    if (this.dependencyClassifier) {
      const eco = 'npm';
      classifiedDependencies = {
        dependencies: this.dependencyClassifier.classifyDependencies(dependencies, eco),
        devDependencies: this.dependencyClassifier.classifyDependencies(devDependencies, eco),
      };

      dependencyAnalysis = {
        dependencies: this.dependencyClassifier.analyzeDependencies(dependencies, eco),
        devDependencies: this.dependencyClassifier.analyzeDependencies(devDependencies, eco),
        healthScore: this.dependencyClassifier.getHealthScore(classifiedDependencies.dependencies),
      };
    }

    return {
      info: {
        name: pkg.name || path.basename(projectPath),
        version: pkg.version || '1.0.0',
        description: pkg.description || '',
        framework: framework,
        author: pkg.author || '',
        license: pkg.license || '',
      },
      config: {
        nodeVersion: pkg.engines?.node || null,
        type: pkg.type || 'commonjs',
        scripts: Object.keys(pkg.scripts || {}),
      },
      dependencies: {
        dependencies: dependencies || {},
        devDependencies: devDependencies || {},
        peerDependencies: pkg.peerDependencies || {},
        optionalDependencies: pkg.optionalDependencies || {},
      },
      classifiedDependencies,
      dependencyAnalysis,
    };
  }

  /**
   * 扫描 Python 项目
   */
  scanPythonProject(projectPath) {
    const result = {
      info: {},
      config: {},
      dependencies: {},
    };

    // 检查 setup.py
    const setupPyPath = path.join(projectPath, 'setup.py');
    if (fs.existsSync(setupPyPath)) {
      const content = fs.readFileSync(setupPyPath, 'utf8');
      // 提取基本信息
      const nameMatch = content.match(/name\s*=\s*['"]([^'"]+)['"]/);
      const versionMatch = content.match(/version\s*=\s*['"]([^'"]+)['"]/);
      result.info.name = nameMatch?.[1] || path.basename(projectPath);
      result.info.version = versionMatch?.[1] || '1.0.0';
    }

    // 检查 pyproject.toml
    const pyprojectPath = path.join(projectPath, 'pyproject.toml');
    if (fs.existsSync(pyprojectPath)) {
      const content = fs.readFileSync(pyprojectPath, 'utf8');
      // 简单解析（实际应该使用 TOML 解析器）
      const nameMatch = content.match(/name\s*=\s*['"]([^'"]+)['"]/);
      const versionMatch = content.match(/version\s*=\s*['"]([^'"]+)['"]/);
      if (nameMatch) result.info.name = nameMatch[1];
      if (versionMatch) result.info.version = versionMatch[1];
    }

    // 检查 requirements.txt
    const requirementsPath = path.join(projectPath, 'requirements.txt');
    if (fs.existsSync(requirementsPath)) {
      const content = fs.readFileSync(requirementsPath, 'utf8');
      const dependencies = {};
      content.split('\n').forEach(line => {
        line = line.trim();
        if (line && !line.startsWith('#')) {
          const parts = line.split(/==|>=|<=|~=|!=/);
          if (parts.length > 0) {
            dependencies[parts[0].trim()] = parts[1] || '*';
          }
        }
      });
      result.dependencies.dependencies = dependencies;
    }

    // 检查 Pipfile
    const pipfilePath = path.join(projectPath, 'Pipfile');
    if (fs.existsSync(pipfilePath)) {
      const yaml = require('js-yaml');
      const content = fs.readFileSync(pipfilePath, 'utf8');
      const pipfile = yaml.load(content);
      result.config.pythonVersion = pipfile.requires?.python_version || null;
      result.dependencies.pipfile = {
        packages: pipfile.packages || {},
        devPackages: pipfile['dev-packages'] || {},
      };
    }

    return result;
  }

  /**
   * 扫描 Go 项目
   */
  scanGoProject(projectPath) {
    const goModPath = path.join(projectPath, 'go.mod');

    if (!fs.existsSync(goModPath)) {
      return { info: {}, config: {}, dependencies: {} };
    }

    const content = fs.readFileSync(goModPath, 'utf8');
    const lines = content.split('\n');

    const info = {};
    const config = {};
    const dependencies = {};

    let inRequire = false;
    let modulePath = '';

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.startsWith('module ')) {
        modulePath = trimmed.substring(7).trim();
        info.modulePath = modulePath;
      } else if (trimmed.startsWith('go ')) {
        config.goVersion = trimmed.substring(3).trim();
      } else if (trimmed.startsWith('require (')) {
        inRequire = true;
      } else if (trimmed === ')') {
        inRequire = false;
      } else if (inRequire && trimmed) {
        const parts = trimmed.split(/\s+/);
        if (parts.length >= 1) {
          dependencies[parts[0]] = parts[1] || 'latest';
        }
      }
    }

    info.name = modulePath.split('/').pop() || path.basename(projectPath);

    return { info, config, dependencies };
  }

  /**
   * 扫描 Maven 项目
   */
  scanMavenProject(projectPath) {
    // 简化的 XML 解析（实际应该使用专门的 XML 解析器）
    const pomPath = path.join(projectPath, 'pom.xml');

    if (!fs.existsSync(pomPath)) {
      return { info: {}, config: {}, dependencies: {} };
    }

    const content = fs.readFileSync(pomPath, 'utf8');
    const info = {};
    const config = {};
    const dependencies = {};

    // 简单的正则提取
    const artifactIdMatch = content.match(/<artifactId>([^<]+)<\/artifactId>/);
    const groupIdMatch = content.match(/<groupId>([^<]+)<\/groupId>/);
    const versionMatch = content.match(/<version>([^<]+)<\/version>/);
    const javaVersionMatch = content.match(/<java\.version>([^<]+)<\/java\.version>/);

    info.name = artifactIdMatch?.[1] || path.basename(projectPath);
    info.groupId = groupIdMatch?.[1] || '';
    info.version = versionMatch?.[1] || '1.0.0';
    config.javaVersion = javaVersionMatch?.[1] || null;

    return { info, config, dependencies };
  }

  /**
   * 扫描 Gradle 项目
   */
  scanGradleProject(projectPath) {
    // Gradle 文件是 Groovy 或 Kotlin，这里做简化处理
    const buildGradlePath = path.join(projectPath, 'build.gradle');
    const settingsGradlePath = path.join(projectPath, 'settings.gradle');

    const info = { name: path.basename(projectPath) };
    const config = {};
    const dependencies = {};

    // 检查 settings.gradle 获取项目名称
    if (fs.existsSync(settingsGradlePath)) {
      const content = fs.readFileSync(settingsGradlePath, 'utf8');
      const nameMatch = content.match(/rootProject\.name\s*=\s*['"]([^'"]+)['"]/);
      if (nameMatch) {
        info.name = nameMatch[1];
      }
    }

    return { info, config, dependencies };
  }

  /**
   * 扫描 Ruby 项目
   */
  scanRubyProject(projectPath) {
    const gemfilePath = path.join(projectPath, 'Gemfile');

    if (!fs.existsSync(gemfilePath)) {
      return { info: {}, config: {}, dependencies: {} };
    }

    const content = fs.readFileSync(gemfilePath, 'utf8');
    const dependencies = {};

    // 简单提取 gem 声明
    const gemMatches = content.matchAll(/gem\s+['"]([^'"]+)['"](?:\s*,\s*['"]([^'"]+)['"])?/g);
    for (const match of gemMatches) {
      dependencies[match[1]] = match[2] || 'latest';
    }

    return {
      info: { name: path.basename(projectPath) },
      config: {},
      dependencies,
    };
  }

  /**
   * 扫描 PHP 项目
   */
  scanPHPProject(projectPath) {
    const composerJsonPath = path.join(projectPath, 'composer.json');

    if (!fs.existsSync(composerJsonPath)) {
      return { info: {}, config: {}, dependencies: {} };
    }

    const content = fs.readFileSync(composerJsonPath, 'utf8');
    const composer = JSON.parse(content);

    return {
      info: {
        name: composer.name || path.basename(projectPath),
        version: composer.version || '1.0.0',
        description: composer.description || '',
        type: composer.type || 'library',
        license: composer.license || '',
      },
      config: {
        phpVersion: composer.require?.php || null,
        bin: composer.bin || [],
      },
      dependencies: {
        require: composer.require || {},
        requireDev: composer['require-dev'] || {},
      },
    };
  }

  /**
   * 扫描所有相关版本
   * @param {string} projectPath - 项目路径
   * @param {Array} projectTypes - 项目类型数组
   * @returns {Object} 版本信息
   */
  async scanVersions(projectPath, projectTypes) {
    const versions = {};
    const commandsToRun = new Set();

    // 根据项目类型确定需要检查的版本
    for (const type of projectTypes) {
      switch (type) {
        case 'flutter':
          commandsToRun.add('flutter');
          commandsToRun.add('dart');
          break;
        case 'nodejs':
          commandsToRun.add('node');
          commandsToRun.add('npm');
          // 检查是否使用 yarn 或 pnpm
          if (fs.existsSync(path.join(projectPath, 'yarn.lock'))) {
            commandsToRun.add('yarn');
          }
          if (fs.existsSync(path.join(projectPath, 'pnpm-lock.yaml'))) {
            commandsToRun.add('pnpm');
          }
          break;
        case 'python':
          commandsToRun.add('python3');
          commandsToRun.add('python');
          commandsToRun.add('pip');
          break;
        case 'go':
          commandsToRun.add('go');
          break;
        case 'maven':
        case 'gradle':
          commandsToRun.add('java');
          if (type === 'maven') commandsToRun.add('mvn');
          if (type === 'gradle') commandsToRun.add('gradle');
          break;
        case 'ruby':
          commandsToRun.add('ruby');
          commandsToRun.add('gem');
          break;
        case 'php':
          commandsToRun.add('php');
          commandsToRun.add('composer');
          break;
      }
    }

    // 执行版本命令
    for (const cmd of commandsToRun) {
      try {
        const version = this.executeVersionCommand(cmd);
        if (version) {
          versions[cmd] = version;
        }
      } catch (error) {
        // 版本命令执行失败，忽略
        versions[cmd] = null;
      }
    }

    // 额外检查项目配置文件中指定的版本
    const configVersions = this.extractVersionsFromConfig(projectPath, projectTypes);
    Object.assign(versions, configVersions);

    return versions;
  }

  /**
   * 执行版本命令
   * @param {string} command - 命令名称
   * @returns {string|null} 版本信息
   */
  executeVersionCommand(command) {
    try {
      const cmdString = this.versionCommands.get(command);
      if (!cmdString) return null;

      const output = execSync(cmdString, { encoding: 'utf8', stdio: 'pipe' });
      return this.parseVersionOutput(command, output.trim());
    } catch (error) {
      return null;
    }
  }

  /**
   * 解析版本命令输出
   * @param {string} command - 命令名称
   * @param {string} output - 命令输出
   * @returns {string} 版本号
   */
  parseVersionOutput(command, output) {
    if (!output) return null;

    switch (command) {
      case 'flutter':
        const flutterMatch = output.match(/Flutter\s+(\S+)/);
        return flutterMatch?.[1] || output.split('\n')[0];

      case 'dart':
        const dartMatch = output.match(/Dart\s+version\s+:\s+(\S+)/);
        return dartMatch?.[1] || output;

      case 'node':
        return output.replace('v', '');

      case 'npm':
        const npmMatch = output.match(/([\d.]+)/);
        return npmMatch?.[1] || output;

      case 'yarn':
        const yarnMatch = output.match(/([\d.]+)/);
        return yarnMatch?.[1] || output;

      case 'pnpm':
        const pnpmMatch = output.match(/([\d.]+)/);
        return pnpmMatch?.[1] || output;

      case 'python':
      case 'python3':
        const pythonMatch = output.match(/Python\s+([\d.]+)/);
        return pythonMatch?.[1] || output;

      case 'pip':
        const pipMatch = output.match(/pip\s+([\d.]+)/);
        return pipMatch?.[1] || output;

      case 'go':
        const goMatch = output.match(/go version go([\d.]+)/);
        return goMatch?.[1] || output;

      case 'java':
        const javaMatch = output.match(/version\s+\"([\d._]+)\"/);
        return javaMatch?.[1] || output;

      case 'mvn':
        const mavenMatch = output.match(/Apache Maven\s+([\d.]+)/);
        return mavenMatch?.[1] || output;

      case 'gradle':
        const gradleMatch = output.match(/Gradle\s+([\d.]+)/);
        return gradleMatch?.[1] || output;

      case 'ruby':
        const rubyMatch = output.match(/ruby\s+([\d.]+)/i);
        return rubyMatch?.[1] || output;

      case 'gem':
        const gemMatch = output.match(/([\d.]+)/);
        return gemMatch?.[1] || output;

      case 'composer':
        const composerMatch = output.match(/Composer\s+version\s+([\d.]+)/i);
        return composerMatch?.[1] || output;

      case 'php':
        const phpMatch = output.match(/PHP\s+([\d.]+)/);
        return phpMatch?.[1] || output;

      default:
        return output;
    }
  }

  /**
   * 从配置文件中提取版本要求
   * @param {string} projectPath - 项目路径
   * @param {Array} projectTypes - 项目类型数组
   * @returns {Object} 版本要求
   */
  extractVersionsFromConfig(projectPath, projectTypes) {
    const versions = {};

    for (const type of projectTypes) {
      switch (type) {
        case 'flutter':
          // 从 pubspec.yaml 读取 SDK 版本
          const pubspecPath = path.join(projectPath, 'pubspec.yaml');
          if (fs.existsSync(pubspecPath)) {
            const yaml = require('js-yaml');
            const pubspec = yaml.load(fs.readFileSync(pubspecPath, 'utf8'));
            if (pubspec.environment?.sdk) {
              versions.dart_sdk = pubspec.environment.sdk;
            }
          }
          break;

        case 'nodejs':
          // 从 package.json 读取 Node 版本要求
          const packageJsonPath = path.join(projectPath, 'package.json');
          if (fs.existsSync(packageJsonPath)) {
            const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
            if (pkg.engines?.node) {
              versions.node_required = pkg.engines.node;
            }
          }
          // 从 .nvmrc 读取 Node 版本
          const nvmrcPath = path.join(projectPath, '.nvmrc');
          if (fs.existsSync(nvmrcPath)) {
            versions.nvmrc = fs.readFileSync(nvmrcPath, 'utf8').trim();
          }
          break;

        case 'python':
          // 从 Pipfile 读取 Python 版本要求
          const pipfilePath = path.join(projectPath, 'Pipfile');
          if (fs.existsSync(pipfilePath)) {
            const yaml = require('js-yaml');
            const pipfile = yaml.load(fs.readFileSync(pipfilePath, 'utf8'));
            if (pipfile.requires?.python_version) {
              versions.python_required = pipfile.requires.python_version;
            }
          }
          break;

        case 'go':
          // 从 go.mod 读取 Go 版本
          const goModPath = path.join(projectPath, 'go.mod');
          if (fs.existsSync(goModPath)) {
            const content = fs.readFileSync(goModPath, 'utf8');
            const goVersionMatch = content.match(/go\s+([\d.]+)/);
            if (goVersionMatch) {
              versions.go_required = goVersionMatch[1];
            }
          }
          break;
      }
    }

    return versions;
  }

  // 项目类型检测方法

  isFlutterProject(projectPath) {
    const pubspecPath = path.join(projectPath, 'pubspec.yaml');
    if (!fs.existsSync(pubspecPath)) return false;

    try {
      const yaml = require('js-yaml');
      const content = fs.readFileSync(pubspecPath, 'utf8');
      const pubspec = yaml.load(content);
      return !!pubspec.dependencies?.flutter;
    } catch {
      return false;
    }
  }

  isNodeJSProject(projectPath) {
    return fs.existsSync(path.join(projectPath, 'package.json'));
  }

  isPythonProject(projectPath) {
    return (
      fs.existsSync(path.join(projectPath, 'requirements.txt')) ||
      fs.existsSync(path.join(projectPath, 'setup.py')) ||
      fs.existsSync(path.join(projectPath, 'pyproject.toml')) ||
      fs.existsSync(path.join(projectPath, 'Pipfile'))
    );
  }

  isGoProject(projectPath) {
    return fs.existsSync(path.join(projectPath, 'go.mod'));
  }

  isMavenProject(projectPath) {
    return fs.existsSync(path.join(projectPath, 'pom.xml'));
  }

  isGradleProject(projectPath) {
    return (
      fs.existsSync(path.join(projectPath, 'build.gradle')) ||
      fs.existsSync(path.join(projectPath, 'build.gradle.kts'))
    );
  }

  isRubyProject(projectPath) {
    return fs.existsSync(path.join(projectPath, 'Gemfile'));
  }

  isPHPProject(projectPath) {
    return fs.existsSync(path.join(projectPath, 'composer.json'));
  }
}

module.exports = ProjectScanner;
