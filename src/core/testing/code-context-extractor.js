/**
 * Code Context Extractor
 *
 * 从用户选定的代码文件中提取上下文信息，用于 AI 测试用例生成。
 *
 * 职责：
 * - 读取目标文件源码
 * - 根据语言分发到对应分析器（Dart 复用 flutter analyzers，JS/TS 复用 ast-parser）
 * - 收集依赖签名、组件关系、路由配置等语义信息
 * - Token 预算控制：智能截断超长内容
 * - 组装结构化的代码上下文对象
 */

const fs = require('fs');
const path = require('path');

class CodeContextExtractor {
  constructor(options = {}) {
    this.maxTokenBudget = options.maxTokenBudget || 60000; // ~80K tokens, 留 20K 给输出
    this.systemPromptBudget = 3000;
    this.outputReserveBudget = 20000;
    this.maxSourceBudget = options.maxSourceBudget || 40000;
    this.maxDependencyBudget = options.maxDependencyBudget || 15000;

    // 可选注入的分析器
    this.flutterComponentAnalyzer = options.flutterComponentAnalyzer || null;
    this.flutterRoutingAnalyzer = options.flutterRoutingAnalyzer || null;
    this.flutterStateAnalyzer = options.flutterStateAnalyzer || null;
    this.flutterNetworkAnalyzer = options.flutterNetworkAnalyzer || null;
    this.flutterUIActionAnalyzer = options.flutterUIActionAnalyzer || null;
    this.flutterModelAnalyzer = options.flutterModelAnalyzer || null;
    this.astParser = options.astParser || null;
  }

  /**
   * 主入口：提取代码上下文
   * @param {Array<string>} filePaths - 用户选定的文件路径列表
   * @param {Object} options - 选项
   * @returns {Object} 结构化的代码上下文
   */
  async extractContext(filePaths, options = {}) {
    const projectPath = options.projectPath || this.inferProjectPath(filePaths);
    const results = {
      projectPath,
      language: null,
      files: [],
      dependencies: [],
      componentInfo: null,
      routingInfo: null,
      stateInfo: null,
      networkInfo: null,
      uiActionInfo: null,
      modelInfo: null,
      summary: '',
      tokenEstimate: 0,
    };

    if (!filePaths || filePaths.length === 0) {
      return { success: false, error: '未选择任何文件', context: results };
    }

    try {
      // 1. 检测语言
      results.language = this.detectLanguage(filePaths);

      // 2. 读取目标文件源码
      for (const filePath of filePaths) {
        const fileContext = await this.readFileContext(filePath);
        if (fileContext) {
          results.files.push(fileContext);
        }
      }

      // 3. 提取依赖和关联文件
      results.dependencies = await this.extractDependencies(filePaths, results.language, projectPath);

      // 4. 根据语言运行专用分析器
      if (results.language === 'dart') {
        await this.runFlutterAnalyzers(filePaths, projectPath, results);
      } else if (['javascript', 'typescript', 'vue'].includes(results.language)) {
        await this.runJSAnalyzers(filePaths, projectPath, results);
      }

      // 5. Token 预算控制 - 智能截断
      this.applyTokenBudget(results);

      // 6. 生成摘要
      results.summary = this.generateContextSummary(results);
      results.tokenEstimate = this.estimateTokens(results);

      return { success: true, context: results };
    } catch (error) {
      console.error('[CodeContextExtractor] 提取上下文失败:', error.message);
      return { success: false, error: error.message, context: results };
    }
  }

  /**
   * 读取单个文件的上下文信息
   */
  async readFileContext(filePath) {
    try {
      if (!fs.existsSync(filePath)) {
        console.warn(`[CodeContextExtractor] 文件不存在: ${filePath}`);
        return null;
      }

      const stats = fs.statSync(filePath);
      if (stats.size > 1024 * 1024) { // 跳过 > 1MB 的文件
        console.warn(`[CodeContextExtractor] 文件过大，跳过: ${filePath}`);
        return null;
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const ext = path.extname(filePath).toLowerCase();

      return {
        path: filePath,
        relativePath: path.basename(filePath),
        fileName: path.basename(filePath),
        extension: ext,
        content,
        lineCount: content.split('\n').length,
        size: stats.size,
      };
    } catch (error) {
      console.error(`[CodeContextExtractor] 读取文件失败: ${filePath}`, error.message);
      return null;
    }
  }

  /**
   * 检测代码语言
   */
  detectLanguage(filePaths) {
    const extCounts = {};
    for (const fp of filePaths) {
      const ext = path.extname(fp).toLowerCase();
      extCounts[ext] = (extCounts[ext] || 0) + 1;
    }

    const langMap = {
      '.dart': 'dart',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.vue': 'vue',
    };

    let maxCount = 0;
    let detectedLang = 'javascript';
    for (const [ext, count] of Object.entries(extCounts)) {
      if (count > maxCount && langMap[ext]) {
        maxCount = count;
        detectedLang = langMap[ext];
      }
    }

    return detectedLang;
  }

  /**
   * 从文件路径推断项目根路径
   */
  inferProjectPath(filePaths) {
    if (!filePaths || filePaths.length === 0) return '';
    const firstFile = filePaths[0];

    // 向上查找 pubspec.yaml / package.json
    let dir = path.dirname(firstFile);
    for (let i = 0; i < 10; i++) {
      if (
        fs.existsSync(path.join(dir, 'pubspec.yaml')) ||
        fs.existsSync(path.join(dir, 'package.json'))
      ) {
        return dir;
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    return path.dirname(firstFile);
  }

  /**
   * 提取依赖文件（import 的文件签名）
   */
  async extractDependencies(filePaths, language, projectPath) {
    const dependencies = [];
    const importedPaths = new Set();

    for (const filePath of filePaths) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const imports = this.parseImports(content, language, filePath, projectPath);

        for (const imp of imports) {
          if (importedPaths.has(imp.resolvedPath)) continue;
          importedPaths.add(imp.resolvedPath);

          // 尝试读取依赖文件，但只提取签名（类名/函数签名/接口定义）
          if (fs.existsSync(imp.resolvedPath)) {
            const depContent = fs.readFileSync(imp.resolvedPath, 'utf-8');
            const signature = this.extractSignature(depContent, language);
            dependencies.push({
              path: imp.resolvedPath,
              relativePath: path.relative(projectPath, imp.resolvedPath),
              importStatement: imp.statement,
              signature,
            });
          }
        }
      } catch (error) {
        // 跳过无法解析的依赖
      }
    }

    return dependencies;
  }

  /**
   * 解析 import 语句
   */
  parseImports(content, language, filePath, projectPath) {
    const imports = [];
    const lines = content.split('\n');

    for (const line of lines) {
      let match;
      if (language === 'dart') {
        // Dart: import 'package:xxx/xxx.dart'; 或 import '../xxx.dart';
        match = line.match(/import\s+['"]([^'"]+)['"]/);
        if (match && !match[1].startsWith('package:') && !match[1].startsWith('dart:')) {
          const resolvedPath = path.resolve(path.dirname(filePath), match[1]);
          imports.push({ statement: line.trim(), resolvedPath });
        }
      } else {
        // JS/TS: import xxx from './xxx'; 或 const xxx = require('./xxx');
        match = line.match(/(?:import\s+.*?from\s+['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]\s*\))/);
        if (match) {
          const importPath = match[1] || match[2];
          if (importPath.startsWith('.')) {
            let resolvedPath = path.resolve(path.dirname(filePath), importPath);
            // 尝试补全扩展名
            if (!fs.existsSync(resolvedPath)) {
              for (const ext of ['.js', '.jsx', '.ts', '.tsx', '.vue']) {
                if (fs.existsSync(resolvedPath + ext)) {
                  resolvedPath = resolvedPath + ext;
                  break;
                }
              }
            }
            imports.push({ statement: line.trim(), resolvedPath });
          }
        }
      }
    }

    return imports;
  }

  /**
   * 提取文件签名（类定义、函数签名、接口定义 — 不含实现体）
   */
  extractSignature(content, language) {
    const lines = content.split('\n');
    const signatures = [];
    let inClass = false;
    let braceDepth = 0;

    for (const line of lines) {
      const trimmed = line.trim();

      if (language === 'dart') {
        // 类定义
        if (trimmed.match(/^(abstract\s+)?class\s+\w+/)) {
          signatures.push(trimmed.replace(/\{.*$/, '{...}'));
          inClass = true;
        }
        // 函数签名（只取第一行）
        else if (trimmed.match(/^\s*(static\s+)?(Future|void|String|int|double|bool|List|Map|dynamic|\w+)\s+\w+\s*\(/) && !trimmed.includes('=>')) {
          const sig = trimmed.replace(/\{.*$/, '').replace(/;.*$/, ';');
          if (sig.length < 200) signatures.push(sig);
        }
        // 变量/属性声明
        else if (trimmed.match(/^\s*(final|var|late|const)\s+/) && !trimmed.includes('=>') && trimmed.length < 150) {
          signatures.push(trimmed);
        }
      } else {
        // JS/TS 类定义
        if (trimmed.match(/^(export\s+)?(default\s+)?class\s+\w+/)) {
          signatures.push(trimmed.replace(/\{.*$/, '{...}'));
        }
        // 函数/方法签名
        else if (trimmed.match(/^(export\s+)?(async\s+)?function\s+\w+/) || trimmed.match(/^\s*(async\s+)?\w+\s*\([^)]*\)\s*\{/)) {
          const sig = trimmed.replace(/\{.*$/, '{...}');
          if (sig.length < 200) signatures.push(sig);
        }
        // interface/type 定义（TypeScript）
        else if (trimmed.match(/^(export\s+)?(interface|type)\s+\w+/)) {
          signatures.push(trimmed);
        }
      }

      // 限制签名数量
      if (signatures.length >= 50) break;
    }

    return signatures.join('\n');
  }

  /**
   * 运行 Flutter 专用分析器
   * 集成 AST Parser 以获取完整的 API 调用、UI 元素、核心方法信息
   */
  async runFlutterAnalyzers(filePaths, projectPath, results) {
    try {
      // 优先使用 AST Parser 获取完整的结构化信息
      if (this.astParser && this.astParser.dartParserAvailable) {
        const astInfo = await this.runASTParser(filePaths, results);
        if (astInfo) {
          // 如果 AST Parser 成功，直接返回
          return;
        }
      }

      // 回退方案：读取所有选定文件的内容用于分析
      const fileContents = [];
      for (const fp of filePaths) {
        try {
          const content = fs.readFileSync(fp, 'utf-8');
          fileContents.push({ path: fp, content });
        } catch (e) { /* skip */ }
      }

      if (fileContents.length === 0) return;

      // 使用 Flutter Component Analyzer（如果可用）
      if (this.flutterComponentAnalyzer) {
        try {
          // 先进行 UI 分析以获取 classes 和 buildMethods
          const FlutterUIAnalyzer = require('../flutter-ui-analyzer');
          const uiAnalyzer = new FlutterUIAnalyzer();
          const uiAnalysis = uiAnalyzer.analyzeFiles ? uiAnalyzer.analyzeFiles(fileContents) : { classes: [], buildMethods: [] };

          const componentResult = this.flutterComponentAnalyzer.analyzeComponentDependencies(fileContents, uiAnalysis);
          results.componentInfo = {
            components: componentResult.components?.slice(0, 20),
            hierarchy: componentResult.hierarchy,
            statistics: componentResult.statistics,
          };
        } catch (e) {
          console.warn('[CodeContextExtractor] Flutter Component Analyzer 失败:', e.message);
        }
      }

      // 简化版：从源码中提取关键信息
      for (const file of fileContents) {
        // 提取 Controller 中的方法名和关键成员
        const controllerMethods = this.extractDartControllerInfo(file.content);
        if (controllerMethods) {
          results.stateInfo = results.stateInfo || [];
          results.stateInfo.push({
            file: path.basename(file.path),
            ...controllerMethods,
          });
        }

        // 提取网络请求
        const networkCalls = this.extractDartNetworkInfo(file.content);
        if (networkCalls.length > 0) {
          results.networkInfo = results.networkInfo || [];
          results.networkInfo.push({
            file: path.basename(file.path),
            calls: networkCalls,
          });
        }
      }
    } catch (error) {
      console.warn('[CodeContextExtractor] Flutter 分析器执行失败:', error.message);
    }
  }

  /**
   * 使用 AST Parser 解析 Dart 文件并提取结构化信息
   * 提取：API 调用、UI 元素、核心方法
   */
  async runASTParser(filePaths, results) {
    try {
      console.log('[CodeContextExtractor] 使用 AST Parser 解析 Dart 文件...');

      // 初始化 results.astInfo 用于存储 AST 解析结果
      results.astInfo = {
        classes: [],
        apiCalls: [],
        uiElements: [],
        coreMethods: [],
      };

      for (const filePath of filePaths) {
        try {
          // 使用 AST Parser 解析文件
          const parseResult = this.astParser.parse(filePath);

          if (!parseResult || !parseResult.classes || parseResult.classes.length === 0) {
            continue;
          }

          // 处理每个类
          for (const cls of parseResult.classes) {
            const classInfo = {
              name: cls.name,
              superClass: cls.superClass,
              file: path.basename(filePath),
              // 核心方法
              methods: cls.methods || [],
              // API 方法（HTTP 调用）
              apiMethods: cls.apiMethods || [],
              // UI 属性（输入框、下拉框、复选框、列表等）
              uiProperties: cls.uiProperties || { inputs: [], dropdowns: [], checkboxes: [], lists: [], others: [] },
              // 操作方法（增删改查、搜索等）
              actionMethods: cls.actionMethods || { add: [], edit: [], delete: [], save: [], submit: [], cancel: [], search: [], reset: [], load: [], other: [] },
            };

            results.astInfo.classes.push(classInfo);

            // 提取 API 调用（格式化用于 AI）
            if (cls.apiMethods && cls.apiMethods.length > 0) {
              for (const apiMethod of cls.apiMethods) {
                if (apiMethod.url) {
                  results.astInfo.apiCalls.push({
                    method: apiMethod.method || 'GET',
                    url: apiMethod.url,
                    source: `${cls.name}.${apiMethod.name || 'unknown'}`,
                  });
                }
              }
            }

            // 提取 UI 元素
            if (cls.uiProperties) {
              const uiProps = cls.uiProperties;
              // 输入框
              if (uiProps.inputs && uiProps.inputs.length > 0) {
                results.astInfo.uiElements.push(...uiProps.inputs.map(input => ({
                  type: 'input',
                  name: input.name,
                  dataType: input.dataType,
                  source: cls.name,
                })));
              }
              // 下拉框
              if (uiProps.dropdowns && uiProps.dropdowns.length > 0) {
                results.astInfo.uiElements.push(...uiProps.dropdowns.map(dropdown => ({
                  type: 'dropdown',
                  name: dropdown.name,
                  options: dropdown.options,
                  source: cls.name,
                })));
              }
              // 复选框
              if (uiProps.checkboxes && uiProps.checkboxes.length > 0) {
                results.astInfo.uiElements.push(...uiProps.checkboxes.map(checkbox => ({
                  type: 'checkbox',
                  name: checkbox.name,
                  source: cls.name,
                })));
              }
              // 列表
              if (uiProps.lists && uiProps.lists.length > 0) {
                results.astInfo.uiElements.push(...uiProps.lists.map(list => ({
                  type: 'list',
                  name: list.name,
                  itemType: list.itemType,
                  source: cls.name,
                })));
              }
            }

            // 提取核心方法
            if (cls.methods && cls.methods.length > 0) {
              for (const method of cls.methods) {
                const methodName = typeof method === 'string' ? method : method.name;
                // 过滤掉常见的生命周期方法
                if (!['build', 'initState', 'dispose', 'createState', 'setState'].includes(methodName)) {
                  results.astInfo.coreMethods.push({
                    name: methodName,
                    class: cls.name,
                    source: cls.name,
                  });
                }
              }
            }
          }
        } catch (e) {
          console.warn(`[CodeContextExtractor] AST Parser 解析失败: ${filePath}`, e.message);
        }
      }

      // 如果成功提取到信息，更新 results
      if (results.astInfo.classes.length > 0) {
        console.log(`[CodeContextExtractor] AST Parser 成功解析 ${results.astInfo.classes.length} 个类`);
        console.log(`[CodeContextExtractor] 提取到 ${results.astInfo.apiCalls.length} 个 API 调用`);
        console.log(`[CodeContextExtractor] 提取到 ${results.astInfo.uiElements.length} 个 UI 元素`);
        console.log(`[CodeContextExtractor] 提取到 ${results.astInfo.coreMethods.length} 个核心方法`);

        // 同时更新 stateInfo 和 networkInfo 以保持兼容性
        if (results.astInfo.classes.length > 0) {
          results.stateInfo = results.astInfo.classes.map(cls => ({
            className: cls.name,
            superClass: cls.superClass,
            file: cls.file,
            methods: cls.methods,
            observables: [], // AST Parser 不提取响应式变量
            actions: cls.actionMethods ? Object.values(cls.actionMethods).flat() : [],
          }));
        }

        if (results.astInfo.apiCalls.length > 0) {
          results.networkInfo = results.astInfo.apiCalls.map(api => ({
            file: api.source,
            calls: [{ method: api.method, endpoint: api.url }],
          }));
        }

        return true;
      }

      return false;
    } catch (error) {
      console.warn('[CodeContextExtractor] AST Parser 执行失败:', error.message);
      return false;
    }
  }

  /**
   * 从 Dart Controller 代码中提取关键信息
   */
  extractDartControllerInfo(content) {
    const info = { className: null, superClass: null, methods: [], observables: [], actions: [] };
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      // 类定义
      const classMatch = trimmed.match(/class\s+(\w+)\s+extends\s+(\w+)/);
      if (classMatch) {
        info.className = classMatch[1];
        info.superClass = classMatch[2];
      }

      // GetX 的 Rx 变量
      const rxMatch = trimmed.match(/(Rx\w+|RxList|RxMap|RxSet|Rx<[^>]+>)\s+(\w+)/);
      if (rxMatch) {
        info.observables.push({ type: rxMatch[1], name: rxMatch[2] });
      }

      // .obs 变量
      const obsMatch = trimmed.match(/(?:final|var)\s+(\w+)\s*=\s*.*\.obs/);
      if (obsMatch) {
        info.observables.push({ name: obsMatch[1] });
      }

      // 方法定义
      const methodMatch = trimmed.match(/(?:Future<\w+>|void|String|int|double|bool|dynamic)\s+(\w+)\s*\(/);
      if (methodMatch && !['build', 'initState', 'dispose'].includes(methodMatch[1])) {
        info.methods.push(methodMatch[1]);
      }

      // UI 交互（onPressed, onTap 等）
      if (trimmed.includes('onPressed') || trimmed.includes('onTap') || trimmed.includes('onChanged')) {
        info.actions.push(trimmed.substring(0, 100));
      }
    }

    if (!info.className) return null;
    return info;
  }

  /**
   * 提取 Dart 代码中的网络请求信息
   */
  extractDartNetworkInfo(content) {
    const calls = [];
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      // HTTP 请求模式
      const httpMatch = trimmed.match(/(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/i);
      if (httpMatch) {
        calls.push({ method: httpMatch[1].toUpperCase(), endpoint: httpMatch[2] });
      }
      // Dio 请求
      const dioMatch = trimmed.match(/dio\.(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/i);
      if (dioMatch) {
        calls.push({ method: dioMatch[1].toUpperCase(), endpoint: dioMatch[2] });
      }
    }

    return calls;
  }

  /**
   * 运行 JS/TS 分析器
   */
  async runJSAnalyzers(filePaths, projectPath, results) {
    // 基础实现：从 JS/TS 源码提取关键信息
    for (const filePath of filePaths) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');

        // 提取 React 组件信息
        const componentMatch = content.match(/(?:export\s+(?:default\s+)?)?(?:function|const)\s+(\w+)\s*(?:=\s*(?:\([^)]*\)\s*=>|function)|\([^)]*\))/);
        if (componentMatch) {
          results.componentInfo = results.componentInfo || [];
          results.componentInfo.push({
            name: componentMatch[1],
            file: path.basename(filePath),
          });
        }

        // 提取 API 调用
        const fetchMatches = content.matchAll(/(?:fetch|axios\.\w+|api\.\w+)\s*\(\s*['"`]([^'"`]+)['"`]/g);
        for (const match of fetchMatches) {
          results.networkInfo = results.networkInfo || [];
          results.networkInfo.push({
            file: path.basename(filePath),
            endpoint: match[1],
          });
        }
      } catch (e) { /* skip */ }
    }
  }

  /**
   * Token 预算控制 — 智能截断
   */
  applyTokenBudget(results) {
    let currentTokens = 0;

    // 1. 目标文件源码（优先保留完整）
    for (const file of results.files) {
      const fileTokens = this.estimateStringTokens(file.content);
      if (currentTokens + fileTokens > this.maxSourceBudget) {
        // 截断到预算内
        const remainingBudget = Math.max(0, this.maxSourceBudget - currentTokens);
        const charBudget = Math.floor(remainingBudget * 0.75); // tokens → chars 粗略转换
        file.content = file.content.substring(0, charBudget) + '\n// ... [代码已截断，超出 Token 预算]';
        file.truncated = true;
      }
      currentTokens += this.estimateStringTokens(file.content);
    }

    // 2. 依赖文件签名（如果超预算则截断）
    let depTokens = 0;
    for (let i = 0; i < results.dependencies.length; i++) {
      const dep = results.dependencies[i];
      const sigTokens = this.estimateStringTokens(dep.signature || '');
      if (depTokens + sigTokens > this.maxDependencyBudget) {
        // 截断剩余依赖
        results.dependencies = results.dependencies.slice(0, i);
        results.dependenciesTruncated = true;
        break;
      }
      depTokens += sigTokens;
    }
  }

  /**
   * 估算字符串的 Token 数量（粗略：中文约 1.5 token/字符，英文约 0.25 token/单词）
   */
  estimateStringTokens(str) {
    if (!str) return 0;
    // 简化估算：大约 4 个字符 = 1 个 token（对于代码来说）
    return Math.ceil(str.length / 4);
  }

  /**
   * 估算整个上下文的 Token 数
   */
  estimateTokens(results) {
    let total = 0;
    for (const file of results.files) {
      total += this.estimateStringTokens(file.content);
    }
    for (const dep of results.dependencies) {
      total += this.estimateStringTokens(dep.signature);
    }
    // 加上结构化信息的估算
    total += this.estimateStringTokens(JSON.stringify(results.componentInfo || ''));
    total += this.estimateStringTokens(JSON.stringify(results.stateInfo || ''));
    total += this.estimateStringTokens(JSON.stringify(results.networkInfo || ''));
    return total;
  }

  /**
   * 生成上下文摘要
   */
  generateContextSummary(results) {
    const parts = [];
    parts.push(`语言: ${results.language}`);
    parts.push(`文件数: ${results.files.length}`);
    parts.push(`依赖数: ${results.dependencies.length}`);

    if (results.componentInfo) {
      const compCount = Array.isArray(results.componentInfo) ? results.componentInfo.length : 1;
      parts.push(`组件数: ${compCount}`);
    }
    if (results.networkInfo) {
      const netCount = Array.isArray(results.networkInfo)
        ? results.networkInfo.reduce((s, n) => s + (n.calls?.length || 1), 0)
        : 0;
      parts.push(`API 调用数: ${netCount}`);
    }
    if (results.stateInfo) {
      const stateCount = Array.isArray(results.stateInfo)
        ? results.stateInfo.reduce((s, st) => s + (st.observables?.length || 0), 0)
        : 0;
      parts.push(`状态变量数: ${stateCount}`);
    }

    parts.push(`Token 估算: ~${results.tokenEstimate}`);
    return parts.join(' | ');
  }

  /**
   * 将上下文格式化为 AI Prompt 中的代码片段
   * 包含：源码、依赖签名、AST 提取的结构化信息
   */
  formatContextForPrompt(context) {
    const sections = [];

    // === 1. AST 结构化信息（优先展示，便于 AI 快速理解） ===
    if (context.astInfo) {
      sections.push('## 代码结构分析（AST 提取）\n');

      // 类列表
      if (context.astInfo.classes && context.astInfo.classes.length > 0) {
        sections.push('### 检测到的类\n');
        for (const cls of context.astInfo.classes) {
          sections.push(`- **${cls.name}**${cls.superClass ? ` (extends ${cls.superClass})` : ''}`);
          if (cls.methods && cls.methods.length > 0) {
            const methodNames = cls.methods.map(m => typeof m === 'string' ? m : m.name).filter(n => n);
            if (methodNames.length > 0) {
              sections.push(`  - 方法: ${methodNames.slice(0, 10).join(', ')}${methodNames.length > 10 ? '...' : ''}`);
            }
          }
        }
        sections.push('');
      }

      // API 调用
      if (context.astInfo.apiCalls && context.astInfo.apiCalls.length > 0) {
        sections.push('### 检测到的 API 调用\n');
        sections.push('| 方法 | URL | 来源 |');
        sections.push('|------|-----|------|');
        for (const api of context.astInfo.apiCalls) {
          sections.push(`| ${api.method} | \`${api.url}\` | ${api.source} |`);
        }
        sections.push('');
      }

      // UI 元素
      if (context.astInfo.uiElements && context.astInfo.uiElements.length > 0) {
        sections.push('### 检测到的 UI 元素\n');
        // 按类型分组
        const byType = {};
        for (const elem of context.astInfo.uiElements) {
          if (!byType[elem.type]) byType[elem.type] = [];
          byType[elem.type].push(elem);
        }
        for (const [type, elements] of Object.entries(byType)) {
          sections.push(`#### ${type === 'input' ? '输入框' : type === 'dropdown' ? '下拉框' : type === 'checkbox' ? '复选框' : type === 'list' ? '列表' : type}`);
          for (const elem of elements.slice(0, 20)) {
            sections.push(`- **${elem.name}** (${elem.source})`);
          }
        }
        sections.push('');
      }

      // 核心方法
      if (context.astInfo.coreMethods && context.astInfo.coreMethods.length > 0) {
        sections.push('### 检测到的核心方法\n');
        sections.push('```');
        for (const method of context.astInfo.coreMethods.slice(0, 30)) {
          sections.push(`${method.class}.${method.name}()`);
        }
        if (context.astInfo.coreMethods.length > 30) {
          sections.push(`... 还有 ${context.astInfo.coreMethods.length - 30} 个方法`);
        }
        sections.push('```\n');
      }
    }

    // === 2. 目标文件源码 ===
    sections.push('## 目标代码文件\n');
    for (const file of context.files) {
      sections.push(`### ${file.fileName}`);
      sections.push('```' + (context.language || '') );
      sections.push(file.content);
      sections.push('```\n');
    }

    // === 3. 依赖签名 ===
    if (context.dependencies && context.dependencies.length > 0) {
      sections.push('## 关联依赖（接口签名）\n');
      for (const dep of context.dependencies) {
        sections.push(`### ${dep.relativePath}`);
        sections.push('```');
        sections.push(dep.signature || '// 无可提取签名');
        sections.push('```\n');
      }
    }

    // === 4. 兼容性：原有格式 ===
    // 组件信息
    if (context.componentInfo) {
      sections.push('## 组件结构信息\n');
      sections.push('```json');
      sections.push(JSON.stringify(context.componentInfo, null, 2));
      sections.push('```\n');
    }

    // 状态管理信息
    if (context.stateInfo) {
      sections.push('## 状态管理信息\n');
      sections.push('```json');
      sections.push(JSON.stringify(context.stateInfo, null, 2));
      sections.push('```\n');
    }

    // 网络请求信息
    if (context.networkInfo) {
      sections.push('## API 调用信息\n');
      sections.push('```json');
      sections.push(JSON.stringify(context.networkInfo, null, 2));
      sections.push('```\n');
    }

    return sections.join('\n');
  }
}

module.exports = CodeContextExtractor;
