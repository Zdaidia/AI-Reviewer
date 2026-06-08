/**
 * Dart AST Parser
 *
 * 使用正则表达式解析 Dart 代码结构
 * 支持：类、函数、变量、导入、 mixin、enum、extension 等
 */

class DartParser {
  constructor() {
    this.patterns = {
      // 导入语句
      import: /import\s+(['"])([^'"]+)\1(?:\s+(as|show|hide)\s+[^;]+)?;/g,

      // 导出语句
      export: /export\s+(['"])([^'"]+)\1(?:\s+(show|hide)\s+[^;]+)?;/g,

      // 库导入
      library: /library\s+([^;]+);/g,

      // 类定义
      class: /class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+with\s+([\w\s,]+))?(?:\s+implements\s+([\w\s,]+))?\s*\{/g,

      // Mixin 定义
      mixin: /mixin\s+(\w+)(?:\s+on\s+([\w\s,]+))?\s*\{/g,

      // Enum 定义
      enum: /enum\s+(\w+)\s*\{([^}]+)\}/g,

      // Extension 定义
      extension: /extension\s+(?:\w+\s+)?on\s+(\w+)\s*\{/g,

      // 函数定义（顶级）
      function: /(\w+)\s*(?:<[^>]+>)?\s*\(([^)]*)\)(?:\s*async\s*)?(?:\s*=>\s*[^{]+|\s*\{)/g,

      // 方法定义（类中的方法）
      method: /(?:static\s+)?(?:\w+\s+)?(\w+)\s*(?:<[^>]+>)?\s*\(([^)]*)\)(?:\s*async\s*)?(?:\s*=>\s*[^{]+|\s*\{)/g,

      // 变量声明
      variable: /(?:late\s+)?(?:final|const|var)\s+(?:\??\w+(?:<[^>]+>)?\s+)?(\w+)(?:\s*=\s*[^,;]+)?/g,

      // 构造函数
      constructor: /(\w+)\s*\((?:\s*\w+\s+(?:this\.\w+|\w+)[^)]*)?\)(?:\s*:\s*[^{]+)?\s*\{/g,

      // 注解
      annotation: /@(\w+)(?:\(([^)]*)\))?/g,
    };
  }

  /**
   * 解析 Dart 文件
   * @param {string} content - 文件内容
   * @param {string} filePath - 文件路径
   * @param {Object} options - 解析选项
   * @returns {Object} 解析结果
   */
  parse(content, filePath, options = {}) {
    const { simpleMode = false, maxIterations = 5000 } = options;

    // 检查是否在 components 文件夹中，使用简化模式
    const isComponentsFile = filePath.includes('/components/') || filePath.includes('\\components\\');
    const useSimpleMode = simpleMode || isComponentsFile;

    const lines = content.split('\n');

    // 创建行号缓存 - 大幅提升性能
    const lineCache = this.createLineCache(content);

    const result = {
      filePath: filePath,
      language: 'dart',
      imports: [],
      exports: [],
      libraries: [],
      classes: [],
      mixins: [],
      enums: [],
      extensions: [],
      functions: [],
      methods: [],
      variables: [],
      annotations: [],
      apiCalls: [],
      routes: [],
      simpleMode: useSimpleMode, // 标记使用了简化模式
    };

    // 简化模式：只提取基本信息（导入、类、组件），不进行深度分析
    if (useSimpleMode) {
      return this.parseSimple(content, filePath, result, lineCache);
    }

    // 完整模式：使用正则解析
    let match;
    let iterations = 0;

    // 解析导入
    iterations = 0;
    while ((match = this.patterns.import.exec(content)) !== null && iterations < maxIterations) {
      result.imports.push({
        source: match[2],
        type: match[3] || 'direct',
        line: this.getLineNumber(content, match.index, lineCache),
      });
      iterations++;
    }

    // 解析导出
    iterations = 0;
    while ((match = this.patterns.export.exec(content)) !== null && iterations < maxIterations) {
      result.exports.push({
        source: match[2],
        type: match[3] || 'all',
        line: this.getLineNumber(content, match.index, lineCache),
      });
      iterations++;
    }

    // 解析库声明
    iterations = 0;
    while ((match = this.patterns.library.exec(content)) !== null && iterations < maxIterations) {
      result.libraries.push({
        name: match[1].trim(),
        line: this.getLineNumber(content, match.index, lineCache),
      });
      iterations++;
    }

    // 解析类
    iterations = 0;
    while ((match = this.patterns.class.exec(content)) !== null && iterations < maxIterations) {
      result.classes.push({
        name: match[1],
        superClass: match[2] || null,
        mixins: match[3] ? match[3].split(',').map(m => m.trim()) : [],
        interfaces: match[4] ? match[4].split(',').map(i => i.trim()) : [],
        line: this.getLineNumber(content, match.index, lineCache),
      });
      iterations++;
    }

    // 解析注解
    iterations = 0;
    while ((match = this.patterns.annotation.exec(content)) !== null && iterations < maxIterations) {
      result.annotations.push({
        name: match[1],
        arguments: match[2] || null,
        line: this.getLineNumber(content, match.index, lineCache),
      });
      iterations++;
    }

    // 解析函数（需要排除类中的方法）
    this.extractFunctions(content, result, maxIterations, lineCache);

    // 解析 build 方法（Flutter UI 分析）
    result.buildMethods = this.extractBuildMethods(content, maxIterations, lineCache);

    // 解析类信息（增强版）
    this.extractClassesEnhanced(content, result, maxIterations, lineCache);

    // 解析 API 调用（Flutter 相关）
    this.extractApiCalls(content, result, maxIterations, lineCache);

    // 解析路由（Flutter 路由）
    this.extractRoutes(content, result, maxIterations, lineCache);

    // 解析变量（排除类属性）
    this.extractVariables(content, lines, result, maxIterations);

    return result;
  }

  /**
   * 简化模式解析 - 只提取基本信息
   * 用于 components 文件夹，快速扫描组件定义和导入导出
   */
  parseSimple(content, filePath, result, lineCache = null) {
    const lines = content.split('\n');
    const MAX_ITERATIONS = 1000;
    let iterations = 0;

    // 简单解析导入 - 逐行匹配
    for (let i = 0; i < lines.length && iterations < MAX_ITERATIONS; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('//')) continue;

      // 匹配导入语句
      if (line.startsWith('import ')) {
        const importMatch = line.match(/import\s+['"]([^'"]+)['"]/);
        if (importMatch) {
          result.imports.push({
            source: importMatch[1],
            type: 'direct',
            line: i + 1,
          });
        }
        iterations++;
        continue;
      }

      // 匹配库导入
      if (line.startsWith('library ')) {
        const libMatch = line.match(/library\s+([^;]+);/);
        if (libMatch) {
          result.libraries.push({
            name: libMatch[1].trim(),
            line: i + 1,
          });
        }
        iterations++;
        continue;
      }

      // 匹配类定义 - 使用简单模式
      if (line.startsWith('class ')) {
        const classMatch = line.match(/class\s+(\w+)/);
        if (classMatch) {
          result.classes.push({
            name: classMatch[1],
            superClass: null,
            mixins: [],
            interfaces: [],
            line: i + 1,
          });
        }
        iterations++;
        continue;
      }

      // 匹配 mixin
      if (line.startsWith('mixin ')) {
        const mixinMatch = line.match(/mixin\s+(\w+)/);
        if (mixinMatch) {
          result.mixins.push({
            name: mixinMatch[1],
            constraints: [],
            line: i + 1,
          });
        }
        iterations++;
        continue;
      }

      // 匹配注解
      if (line.startsWith('@')) {
        const annMatch = line.match(/@(\w+)/);
        if (annMatch) {
          result.annotations.push({
            name: annMatch[1],
            arguments: null,
            line: i + 1,
          });
        }
        iterations++;
        continue;
      }
    }

    return result;
  }

  /**
   * 提取函数定义
   */
  extractFunctions(content, result) {
    const lines = content.split('\n');
    const classRanges = this.getClassRanges(content);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      // 跳过空行和注释
      if (!trimmedLine || trimmedLine.startsWith('//') || trimmedLine.startsWith('/*')) {
        continue;
      }

      // 检查是否在类定义范围内
      if (this.isInsideClass(i, classRanges)) {
        continue;
      }

      // 匹配函数定义
      const funcMatch = trimmedLine.match(/^(\w+)\s*(?:<[^>]+>)?\s*\(([^)]*)\)(?:\s*async\s*)?(?:\s*=>\s*[^{]+|\s*\{)?/);
      if (funcMatch) {
        // 排除一些 Dart 关键字
        const keywords = ['if', 'for', 'while', 'switch', 'catch', 'when'];
        if (!keywords.includes(funcMatch[1])) {
          // 查找函数结束位置
          const endLine = this.findFunctionEnd(lines, i);

          // 检查是否是箭头函数
          const isArrow = trimmedLine.includes('=>') && !trimmedLine.endsWith('{');

          // 提取返回类型（如果存在）
          const returnTypeMatch = lines[i].match(/^(\w+(?:<[^>]+>)?)\s+\w+\s*(?:<[^>]+>)?\s*\(/);
          const returnType = returnTypeMatch ? returnTypeMatch[1] : null;

          result.functions.push({
            name: funcMatch[1],
            params: this.parseParams(funcMatch[2]),
            async: trimmedLine.includes('async'),
            returnType: returnType,
            line: i + 1,
            endLine: endLine,
            isArrow: isArrow,
          });
        }
      }
    }
  }

  /**
   * 查找函数结束行号
   */
  findFunctionEnd(lines, startLine) {
    let braceCount = 0;
    let foundStart = false;

    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i];

      // 检查是否是箭头函数（单行）
      if (line.includes('=>') && !line.includes('{')) {
        return i + 1;
      }

      // 查找函数开始的大括号
      if (!foundStart) {
        if (line.includes('{')) {
          foundStart = true;
          braceCount += (line.match(/\{/g) || []).length;
          braceCount -= (line.match(/\}/g) || []).length;
        }
        continue;
      }

      // 计算大括号
      braceCount += (line.match(/\{/g) || []).length;
      braceCount -= (line.match(/\}/g) || []).length;

      if (braceCount === 0) {
        return i + 1;
      }
    }

    return startLine + 10; // 默认返回10行
  }

  /**
   * 提取变量定义
   */
  extractVariables(content, lines, result) {
    const classRanges = this.getClassRanges(content);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      // 跳过空行和注释
      if (!trimmedLine || trimmedLine.startsWith('//') || trimmedLine.startsWith('/*')) {
        continue;
      }

      // 检查是否在类定义范围内
      if (this.isInsideClass(i, classRanges)) {
        continue;
      }

      // 匹配变量声明
      const varMatch = trimmedLine.match(/^(?:late\s+)?(?:final|const|var)\s+(?:\??\w+(?:<[^>]+>)?\s+)?(\w+)/);
      if (varMatch) {
        result.variables.push({
          name: varMatch[1],
          type: 'variable',
          line: i + 1,
        });
      }
    }
  }

  /**
   * 提取 API 调用
   */
  extractApiCalls(content, result, maxIterations = 500, lineCache = null) {
    const MAX_ITERATIONS = maxIterations;
    let iterations = 0;

    // 辅助函数：从代码行中提取 URL
    const extractUrlFromLine = (line) => {
      // 匹配各种 URL 格式：
      // - '/api/users'
      // - 'https://example.com/api/v1/users'
      // - "/api/users/$id"
      // - ApiEndpoints.users (变量引用)
      const urlPatterns = [
        /['"`]([\/\w\-\.~:\/?#\[\]@!$&'()*+,;=%]+)['"`]/, // 带引号的 URL
        /url:\s*['"`]([^'"`]+)['"`]/, // url: '...' 格式
        /path:\s*['"`]([^'"`]+)['"`]/, // path: '...' 格式
      ];

      for (const pattern of urlPatterns) {
        const match = line.match(pattern);
        if (match && match[1] && (match[1].startsWith('/') || match[1].startsWith('http'))) {
          return match[1];
        }
      }
      return null;
    };

    // 辅助函数：从函数调用中提取完整参数
    const extractCallWithArgs = (content, startIndex, maxLength = 200) => {
      let depth = 0;
      let foundParen = false;
      let result = '';

      for (let i = startIndex; i < Math.min(content.length, startIndex + maxLength); i++) {
        const char = content[i];
        result += char;

        if (char === '(') {
          depth++;
          foundParen = true;
        } else if (char === ')') {
          depth--;
          if (depth === 0 && foundParen) {
            break;
          }
        }
      }
      return result;
    };

    // 检测 http 包的使用
    const httpPatterns = [
      { regex: /http\.get\s*\(/g, method: 'GET' },
      { regex: /http\.post\s*\(/g, method: 'POST' },
      { regex: /http\.put\s*\(/g, method: 'PUT' },
      { regex: /http\.delete\s*\(/g, method: 'DELETE' },
      { regex: /http\.patch\s*\(/g, method: 'PATCH' },
    ];

    for (const { regex, method } of httpPatterns) {
      regex.lastIndex = 0; // 重置正则索引
      let match;
      iterations = 0;
      while ((match = regex.exec(content)) !== null && iterations < MAX_ITERATIONS) {
        const callContent = extractCallWithArgs(content, match.index);
        const url = extractUrlFromLine(callContent);

        result.apiCalls.push({
          type: 'http',
          method: method,
          url: url || null,
          raw: callContent.substring(0, 100), // 保存原始调用片段
          line: this.getLineNumber(content, match.index, lineCache),
        });
        iterations++;
      }
      if (iterations >= MAX_ITERATIONS) {
        console.warn(`[Dart Parser] HTTP API calls extraction reached max iterations`);
        break;
      }
    }

    // 检测 dio 包的使用
    const dioPatterns = [
      { regex: /dio\.get\s*\(/g, method: 'GET' },
      { regex: /dio\.post\s*\(/g, method: 'POST' },
      { regex: /dio\.put\s*\(/g, method: 'PUT' },
      { regex: /dio\.delete\s*\(/g, method: 'DELETE' },
      { regex: /dio\.patch\s*\(/g, method: 'PATCH' },
    ];

    for (const { regex, method } of dioPatterns) {
      regex.lastIndex = 0; // 重置正则索引
      let match;
      iterations = 0;
      while ((match = regex.exec(content)) !== null && iterations < MAX_ITERATIONS) {
        const callContent = extractCallWithArgs(content, match.index);
        const url = extractUrlFromLine(callContent);

        result.apiCalls.push({
          type: 'dio',
          method: method,
          url: url || null,
          raw: callContent.substring(0, 100),
          line: this.getLineNumber(content, match.index, lineCache),
        });
        iterations++;
      }
      if (iterations >= MAX_ITERATIONS) {
        console.warn(`[Dart Parser] Dio API calls extraction reached max iterations`);
        break;
      }
    }

    // 检测变量定义中的 API 端点（如 const String apiUrl = '/api/users'）
    const endpointVarPatterns = [
      /(?:late\s+)?(?:final\s+)?(?:String\s+)?(\w*[Uu]rl\w*|\w*[Aa]pi\w*|\w*[Ee]ndpoint\w*)\s*=\s*['"`]([\/\w\-\.~:\/?#\[\]@!$&'()*+,;=%]+)['"`]/g,
    ];

    for (const pattern of endpointVarPatterns) {
      pattern.lastIndex = 0;
      let match;
      iterations = 0;
      while ((match = pattern.exec(content)) !== null && iterations < MAX_ITERATIONS) {
        const varName = match[1];
        const url = match[2];

        if (url.startsWith('/') || url.startsWith('http')) {
          result.apiCalls.push({
            type: 'endpoint_definition',
            varName: varName,
            url: url,
            line: this.getLineNumber(content, match.index, lineCache),
          });
        }
        iterations++;
      }
      if (iterations >= MAX_ITERATIONS) {
        console.warn(`[Dart Parser] Endpoint definitions extraction reached max iterations`);
        break;
      }
    }

    // 去重：基于 type + method + url
    const seen = new Set();
    result.apiCalls = result.apiCalls.filter(call => {
      const key = `${call.type}-${call.method || call.varName}-${call.url || 'no-url'}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * 提取路由定义（Flutter 路由）
   */
  extractRoutes(content, result, maxIterations = 200, lineCache = null) {
    const MAX_ITERATIONS = maxIterations;
    let iterations = 0;

    // 检测 MaterialApp 中的 routes 定义
    const routesPattern = /routes:\s*\{([^}]+)\}/g;
    let match;

    while ((match = routesPattern.exec(content)) !== null && iterations < MAX_ITERATIONS) {
      const routesContent = match[1];
      // 提取路由名称
      const routeMatches = routesContent.matchAll(/'([^']+)':/g);
      for (const routeMatch of routeMatches) {
        result.routes.push({
          path: routeMatch[1],
          type: 'material',
          line: this.getLineNumber(content, match.index, lineCache),
        });
      }
      iterations++;
    }

    // 检测 onGenerateRoute
    const onGeneratePattern = /onGenerateRoute:\s*\((\w+)\)\s*=>/g;
    iterations = 0;
    while ((match = onGeneratePattern.exec(content)) !== null && iterations < MAX_ITERATIONS) {
      result.routes.push({
        type: 'onGenerateRoute',
        line: this.getLineNumber(content, match.index, lineCache),
      });
      iterations++;
    }

    // 检测 GoRouter 路由
    const goRouterPattern = /GoRoute\(\s*path:\s*['"]([^'"]+)['"]/g;
    iterations = 0;
    while ((match = goRouterPattern.exec(content)) !== null && iterations < MAX_ITERATIONS) {
      result.routes.push({
        path: match[1],
        type: 'go_router',
        line: this.getLineNumber(content, match.index, lineCache),
      });
      iterations++;
    }
  }

  /**
   * 获取类定义的范围
   * 支持 extends, with, implements 等语法
   */
  getClassRanges(content) {
    const ranges = [];
    const lines = content.split('\n');

    // 逐行查找类定义
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // 匹配 class 定义（支持多行）
      const classMatch = line.match(/^class\s+(\w+)/);
      if (classMatch) {
        // 找到类定义的起始行
        // 查找类开始的 {（可能在同一行或后续行）
        let braceLine = i;
        let foundBrace = false;

        // 检查当前行是否有 {
        if (line.includes('{')) {
          foundBrace = true;
        } else {
          // 检查后续几行
          for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
            const checkLine = lines[j].trim();
            if (checkLine === '{' || checkLine.startsWith('{') || checkLine.includes('{')) {
              braceLine = j;
              foundBrace = true;
              break;
            } else if (checkLine && !checkLine.startsWith('//') && !checkLine.startsWith('@')) {
              // 非空行、非注释、非注解，且不是 {，说明类定义结束
              break;
            }
          }
        }

        if (foundBrace) {
          // 找到 { 的位置，查找匹配的 }
          const bracePos = content.indexOf('{', content.indexOf(lines[i], content.indexOf(lines[0]) + i * lines[0].length));
          if (bracePos !== -1) {
            const end = this.findMatchingBrace(content, bracePos);
            if (end !== -1) {
              ranges.push({ start: i + 1, end: this.getLineNumber(content, end) });
            }
          }
        }
      }
    }

    return ranges;
  }

  /**
   * 查找匹配的右花括号
   */
  findMatchingBrace(content, start) {
    let depth = 1;
    let i = start + 1;
    const MAX_SEARCH_LENGTH = 50000; // 最多搜索 50000 个字符

    while (i < content.length && i < start + MAX_SEARCH_LENGTH && depth > 0) {
      if (content[i] === '{') {
        depth++;
      } else if (content[i] === '}') {
        depth--;
      }
      i++;
    }

    return depth === 0 ? i - 1 : -1;
  }

  /**
   * 检查某行是否在类定义范围内
   */
  isInsideClass(lineNumber, classRanges) {
    return classRanges.some(range =>
      lineNumber >= range.start && lineNumber <= range.end
    );
  }

  /**
   * 解析函数参数
   */
  parseParams(paramsString) {
    if (!paramsString || paramsString.trim() === '') {
      return [];
    }

    return paramsString.split(',').map(p => {
      const trimmed = p.trim();
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 2) {
        return {
          type: parts[0],
          name: parts[1].replace(/=/, ''), // 移除默认值
        };
      }
      return {
        type: 'dynamic',
        name: trimmed,
      };
    }).filter(p => p.name);
  }

  /**
   * 提取 build 方法
   */
  extractBuildMethods(content, maxIterations = 200, lineCache = null) {
    const buildMethods = [];
    const MAX_ITERATIONS = maxIterations;
    let iterations = 0;

    // 匹配 Widget build 方法
    const buildMethodPattern = /Widget\s+build\s*\(\s*BuildContext\s+\w+\s*\)\s*\{/g;
    let match;

    while ((match = buildMethodPattern.exec(content)) !== null && iterations < MAX_ITERATIONS) {
      const buildStart = match.index;
      const buildLine = this.getLineNumber(content, buildStart, lineCache);

      // 提取 build 方法体
      const buildBody = this.extractMethodBody(content, buildStart);

      // 提取包含这个 build 方法的类名
      const className = this.extractClassNameForMethod(content, buildStart);

      buildMethods.push({
        className,
        methodName: 'build',
        line: buildLine,
        content: buildBody,
        returnType: 'Widget',
      });
      iterations++;
    }

    return buildMethods;
  }

  /**
   * 提取方法体
   */
  extractMethodBody(content, methodStart) {
    let braceCount = 0;
    let foundStart = false;
    let endPos = methodStart;

    for (let i = methodStart; i < content.length; i++) {
      if (content[i] === '{') {
        foundStart = true;
        braceCount++;
      } else if (content[i] === '}') {
        braceCount--;
        if (braceCount === 0 && foundStart) {
          endPos = i + 1;
          break;
        }
      }
    }

    return content.substring(methodStart, endPos);
  }

  /**
   * 提取包含指定方法的类名
   */
  extractClassNameForMethod(content, methodStart) {
    // 向上查找最近的类定义
    const beforeMethod = content.substring(0, methodStart);
    const classMatches = beforeMethod.matchAll(/class\s+(\w+)\s+extends/g);

    let lastClass = null;
    for (const match of classMatches) {
      lastClass = match[1];
    }

    return lastClass || 'Unknown';
  }

  /**
   * 提取增强的类信息
   *
   * 优化：只对 Controller 和 Page 类做完整的属性/方法提取
   * 其他类只做基本分析，显著提升大项目的扫描速度
   */
  extractClassesEnhanced(content, result, maxIterations = 500, lineCache = null) {
    const lines = content.split('\n');
    const classRanges = this.getClassRanges(content);

    // 为每个类提取详细信息
    for (let i = 0; i < result.classes.length; i++) {
      const cls = result.classes[i];

      // 查找这个类的代码范围
      const classRange = classRanges[i];
      if (!classRange) continue;

      const isController = cls.name.endsWith('Controller');
      const isPage = cls.name.endsWith('Page') || cls.name.endsWith('Screen') || cls.name.endsWith('View');
      const isProvider = cls.name.endsWith('Provider') || cls.superClass === 'BaseConnect';
      // 扩展：Service、Repository、Api 类也包含 API 调用
      const isServiceOrRepo = cls.name.endsWith('Service') || cls.name.endsWith('Repository') ||
                               cls.name.includes('Api') || cls.name.includes('Http') ||
                               cls.name.includes('Client');
      const isApiClass = isProvider || isServiceOrRepo;

      // 对 Controller、Page、Provider 和 Service/Repository 类做完整的属性/方法提取
      if (isController || isPage || isApiClass) {
        // 提取类的属性
        cls.properties = this.extractClassProperties(lines, classRange, cls.name);

        // 提取类的方法
        cls.methods = this.extractClassMethods(lines, classRange, cls.name);

        // 对 Provider、Service、Repository 类：提取 API 方法
        if (isApiClass) {
          cls.apiMethods = this.extractApiMethodsFromClass(lines, classRange, cls.name);
        }

        // 分析类的 UI 相关属性（用于测试）
        cls.uiProperties = this.analyzeUIProperties(cls.properties || []);

        // 分析类的方法（用于测试）
        cls.actionMethods = this.analyzeActionMethods(cls.methods || []);
      } else {
        // 其他类只初始化空数组，节省时间
        cls.properties = [];
        cls.methods = [];
        cls.uiProperties = { inputs: [], dropdowns: [], checkboxes: [], lists: [], others: [] };
        cls.actionMethods = { add: [], edit: [], delete: [], save: [], submit: [], cancel: [], search: [], reset: [], load: [], other: [] };
        // 确保所有类都有 apiMethods 字段（即使是空数组）
        cls.apiMethods = [];
      }

      // 所有类都做基本的 Widget 类型识别（轻量级）
      const buildMethods = result.buildMethods.filter(bm => bm.className === cls.name);
      cls.buildMethods = buildMethods;
      cls.hasBuildMethod = buildMethods.length > 0;

      // 识别 Widget 类型
      if (cls.superClass === 'StatelessWidget') {
        cls.widgetType = 'StatelessWidget';
        cls.isWidget = true;
      } else if (cls.superClass === 'StatefulWidget') {
        cls.widgetType = 'StatefulWidget';
        cls.isWidget = true;
      } else if (cls.superClass === 'State') {
        cls.widgetType = 'State';
        cls.isState = true;
      } else if (cls.superClass) {
        cls.isWidget = cls.superClass.endsWith('Widget');
        cls.widgetType = cls.superClass;
      }

      // 提取 createState 方法（StatefulWidget）
      if (cls.widgetType === 'StatefulWidget') {
        cls.hasCreateState = content.includes('createState') &&
                               content.match(new RegExp(`createState\\s*\\(\\s*\\w+\\s+\\w+\\s+\\w+\\s+\\)\\s*->`));
      }
    }

    return result.classes;
  }

  /**
   * 提取类的属性
   * 增强版：支持匹配包含 `.` 的类型（如 TextEditingController）
   */
  extractClassProperties(lines, classRange, className) {
    const properties = [];
    // classRange.start 和 classRange.end 是基于 1 的行号
    // 转换为 0based 数组索引
    const startIndex = classRange.start - 1;
    const endIndex = Math.min(classRange.end, lines.length) - 1;
    const inClass = (lineNum) => lineNum >= startIndex && lineNum <= endIndex;

    for (let i = startIndex; i <= endIndex && i < lines.length; i++) {
      const line = lines[i].trim();

      // 跳过空行、注释、注解
      if (!line || line.startsWith('//') || line.startsWith('/*') || line.startsWith('@')) {
        continue;
      }

      // 跳过方法定义（包含括号）
      if (line.includes('(') && (line.includes('{') || line.includes('=>'))) {
        continue;
      }

      // 匹配 final 变量 - 增强版：支持 `.` 在类型名中
      // 格式: final TypeName varName = value;
      const finalMatch = line.match(/^final\s+(?:<[^>]+>\s+)?([\w.]+(?:<[^>]+>)?)\s+(\w+)(?:\s*=\s*[^;]+)?;/);
      if (finalMatch) {
        properties.push({
          name: finalMatch[2],
          type: finalMatch[1],
          isFinal: true,
          line: i + 1
        });
        continue;
      }

      // 匹配 late 变量 - 增强版
      const lateMatch = line.match(/^late\s+(?:final\s+)?(?:<[^>]+>\s+)?([\w.]+(?:<[^>]+>)?)\s+(\w+)(?:\s*=\s*[^;]+)?;/);
      if (lateMatch) {
        properties.push({
          name: lateMatch[2],
          type: lateMatch[1],
          isLate: true,
          line: i + 1
        });
        continue;
      }

      // 匹配普通变量 - 增强版
      const varMatch = line.match(/^([\w.]+(?:<[^>]+>)?)\s+(\w+)(?:\s*=\s*[^;]+)?;/);
      if (varMatch) {
        // 排除一些 Dart 关键字
        const keywords = ['if', 'for', 'while', 'switch', 'catch', 'when', 'return', 'throw', 'import', 'class', 'extends', 'implements'];
        const typeName = varMatch[1];
        if (!keywords.includes(typeName) && !typeName.startsWith('abstract') && !typeName.startsWith('interface')) {
          properties.push({
            name: varMatch[2],
            type: typeName,
            line: i + 1
          });
        }
      }

      // 匹配 var 变量
      const varSimpleMatch = line.match(/^var\s+(\w+)(?:\s*=\s*[^;]+)?;/);
      if (varSimpleMatch) {
        properties.push({
          name: varSimpleMatch[1],
          type: 'var',
          line: i + 1
        });
      }
    }

    return properties;
  }

  /**
   * 提取类的方法
   */
  extractClassMethods(lines, classRange, className) {
    const methods = [];
    // classRange.start 和 classRange.end 是基于 1 的行号
    // 转换为 0-based 数组索引
    const startIndex = classRange.start - 1;
    const endIndex = Math.min(classRange.end, lines.length) - 1;
    const inClass = (lineNum) => lineNum >= startIndex && lineNum <= endIndex;

    for (let i = startIndex; i <= endIndex && i < lines.length; i++) {
      const line = lines[i].trim();

      // 跳过空行、注释
      if (!line || line.startsWith('//') || line.startsWith('/*')) {
        continue;
      }

      // 跳过注解后的行（可能是方法定义）
      if (line.startsWith('@')) {
        // 检查下一行是否是方法
        if (i + 1 < lines.length) {
          const nextLine = lines[i + 1].trim();
          const methodMatch = this.matchMethodDefinition(nextLine, i + 1);
          if (methodMatch) {
            methods.push(methodMatch);
            i++; // 跳过已处理的行
          }
        }
        continue;
      }

      // 匹配方法定义
      const methodMatch = this.matchMethodDefinition(line, i);
      if (methodMatch) {
        methods.push(methodMatch);
      }
    }

    return methods;
  }

  /**
   * 匹配方法定义
   * 改进版：支持包含 `.` 的返回类型（如 Future<Response>）
   */
  matchMethodDefinition(line, lineNum) {
    // 匹配带返回类型的方法 - 增强版：支持包含 `.` 的类型
    const withReturn = line.match(/^([\w.]+(?:<[^>]+>)?)\s+(\w+)\s*\(([^)]*)\)(?:\s*async\s*)?(?:\s*=>)?/);
    if (withReturn) {
      // 排除一些 Dart 关键字
      const keywords = ['if', 'for', 'while', 'switch', 'catch', 'when', 'constructor'];
      if (!keywords.includes(withReturn[2])) {
        return {
          name: withReturn[2],
          returnType: withReturn[1],
          parameters: withReturn[3] || '',
          line: lineNum + 1
        };
      }
    }

    // 匹配不带返回类型的方法
    const withoutReturn = line.match(/^(\w+)\s*\(([^)]*)\)(?:\s*async\s*)?(?:\s*=>)?/);
    if (withoutReturn) {
      const keywords = ['if', 'for', 'while', 'switch', 'catch', 'when', 'print'];
      if (!keywords.includes(withoutReturn[1])) {
        return {
          name: withoutReturn[1],
          returnType: null,
          parameters: withoutReturn[2] || '',
          line: lineNum + 1
        };
      }
    }

    return null;
  }

  /**
   * 分析 UI 相关属性
   */
  analyzeUIProperties(properties) {
    const uiProps = {
      inputs: [],      // 输入框
      dropdowns: [],   // 下拉框
      checkboxes: [],  // 复选框
      radios: [],      // 单选框
      lists: [],       // 列表
      others: []       // 其他
    };

    for (const prop of properties) {
      // TextEditingController -> 输入框
      if (prop.type === 'TextEditingController' || prop.type.includes('TextEditingController')) {
        uiProps.inputs.push({
          name: prop.name,
          type: 'text_field',
          controller: prop.name
        });
      }
      // Rx<String>, Rx<int> 等 -> 响应式变量（可能是输入框绑定）
      else if (prop.type.startsWith('Rx<') || prop.type.startsWith('RxList<')) {
        const dataType = prop.type.match(/Rx<?([^>]+)>?/)?.[1] || 'dynamic';
        if (prop.type.startsWith('RxList<')) {
          uiProps.lists.push({
            name: prop.name,
            type: 'list',
            itemType: dataType
          });
        } else {
          // 响应式变量，可能是输入框的值
          if (prop.name.toLowerCase().includes('code') ||
              prop.name.toLowerCase().includes('text') ||
              prop.name.toLowerCase().includes('input') ||
              prop.name.toLowerCase().includes('search') ||
              prop.name.toLowerCase().includes('name')) {
            uiProps.inputs.push({
              name: prop.name,
              type: 'text_field',
              dataType: dataType
            });
          }
        }
      }
      // List<DropdownItem> -> 下拉框选项
      else if (prop.type.includes('DropdownItem') || prop.type.includes('Dropdown') ||
               prop.name.toLowerCase().includes('dropdown') ||
               prop.name.toLowerCase().includes('select')) {
        uiProps.dropdowns.push({
          name: prop.name,
          type: 'dropdown'
        });
      }
      // bool 类型且包含 checked/selected -> 复选框
      else if ((prop.type === 'bool' || prop.type === 'Rx<bool>' || prop.type === 'RxBool') &&
               (prop.name.toLowerCase().includes('checked') ||
                prop.name.toLowerCase().includes('selected'))) {
        uiProps.checkboxes.push({
          name: prop.name,
          type: 'checkbox'
        });
      }
      else {
        uiProps.others.push(prop);
      }
    }

    return uiProps;
  }

  /**
   * 分析操作方法
   */
  analyzeActionMethods(methods) {
    const actions = {
      add: [],
      edit: [],
      delete: [],
      save: [],
      submit: [],
      cancel: [],
      search: [],
      reset: [],
      load: [],
      other: []
    };

    for (const method of methods) {
      const name = method.name.toLowerCase();

      if (name.includes('add') || name.includes('create')) {
        actions.add.push(method);
      } else if (name.includes('edit') || name.includes('update') || name.includes('modify')) {
        actions.edit.push(method);
      } else if (name.includes('delete') || name.includes('remove') || name.includes('del')) {
        actions.delete.push(method);
      } else if (name.includes('save') || name.includes('store')) {
        actions.save.push(method);
      } else if (name.includes('submit') || name.includes('confirm')) {
        actions.submit.push(method);
      } else if (name.includes('cancel') || name.includes('close') || name.includes('back')) {
        actions.cancel.push(method);
      } else if (name.includes('search') || name.includes('query') || name.includes('filter')) {
        actions.search.push(method);
      } else if (name.includes('reset') || name.includes('clear')) {
        actions.reset.push(method);
      } else if (name.includes('load') || name.includes('get') || name.includes('fetch')) {
        actions.load.push(method);
      } else {
        actions.other.push(method);
      }
    }

    return actions;
  }

  /**
   * 从类中提取 API 方法（支持 Provider、Service、Repository 等）
   *
   * 支持的格式：
   * - await _dio.get('/users')
   * - await http.post('/auth/login', data)
   * - final response = await _dio.put('/users/$id')
   * - await client.get(Uri.parse('/path'))
   *
   * @param {Array} lines - 文件行数组
   * @param {Object} classRange - 类的范围 {start, end} (1-based)
   * @param {string} className - 类名
   * @returns {Array} API 方法列表
   */
  extractApiMethodsFromClass(lines, classRange, className) {
    const apiMethods = [];
    const seenKeys = new Set(); // 去重

    // classRange.start 和 classRange.end 是基于 1 的行号
    // 转换为 0-based 数组索引
    const startIndex = classRange.start - 1;
    const endIndex = Math.min(classRange.end, lines.length) - 1;

    // 调试：打印类范围信息
    console.log(`[extractApiMethodsFromClass] 类: ${className}, 行范围: ${classRange.start}-${classRange.end}, 数组索引: ${startIndex}-${endIndex}, 总行数: ${lines.length}`);

    // 提取整个类的内容
    let classContent = '';
    for (let i = startIndex; i <= endIndex && i < lines.length; i++) {
      classContent += lines[i] + '\n';
    }

    console.log(`[extractApiMethodsFromClass] 类内容长度: ${classContent.length}, 前500字符:\n${classContent.substring(0, 500)}`);

    // 1. 首先尝试直接匹配简化的箭头方法格式：
    //    Future<Response> methodName(...) => get("url")
    const arrowMethodPattern = /(?:\n|^)\s*Future\s*<\s*Response\s*>\s+(\w+)\s*\(([^)]*)\)\s*=>/g;
    let arrowMatch;
    while ((arrowMatch = arrowMethodPattern.exec(classContent)) !== null) {
      const methodName = arrowMatch[1];
      const params = arrowMatch[2] || '';
      const methodStartPos = arrowMatch.index;

      // 查找方法结束位置
      let methodEndPos = classContent.length;
      const nextMethodMatch = classContent.substring(methodStartPos + 1).match(/\n\s*Future\s*<\s*Response\s*>\s+\w+\s*\(/);
      if (nextMethodMatch && nextMethodMatch.index > 0) {
        methodEndPos = methodStartPos + 1 + nextMethodMatch.index;
      }

      const methodBody = classContent.substring(methodStartPos, methodEndPos);
      // 调试：打印方法名和方法体（前500字符）
      console.log(`[Dart Parser] 匹配到箭头方法: ${methodName}, 方法体长度: ${methodBody.length}, 前500字符: ${methodBody.substring(0, 500)}`);

      const httpCall = this.extractHttpCallFromMethodBody(methodBody, methodName);
      if (httpCall) {
        const key = `${methodName}-${httpCall.method}-${httpCall.url}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          apiMethods.push({
            name: methodName,
            method: httpCall.method,
            url: httpCall.url,
            params: params,
            line: this.getLineNumber(classContent, methodStartPos, null)
          });
        }
      } else {
        console.log(`[Dart Parser] 警告: ${methodName} 未提取到 HTTP 调用`);
      }
    }

    // 2. 匹配完整的方法体格式（支持 async/await）
    //    Future<User> methodName(...) async { ... await _dio.get('/path') ... }
    //    或者: return get('url'); return post('url');

    // 定义 HTTP 调用模式（支持多种形式）
    const httpPatterns = [
      // 格式1: 带前缀的调用 _dio.get('/path'), dio.post('/path'), http.get('/path')
      { regex: /(?:_dio|dio|http|client)\.get\s*\(\s*['"`]([^'"`]+)['"`]/g, method: 'GET' },
      { regex: /(?:_dio|dio|http|client)\.post\s*\(\s*['"`]([^'"`]+)['"`]/g, method: 'POST' },
      { regex: /(?:_dio|dio|http|client)\.put\s*\(\s*['"`]([^'"`]+)['"`]/g, method: 'PUT' },
      { regex: /(?:_dio|dio|http|client)\.delete\s*\(\s*['"`]([^'"`]+)['"`]/g, method: 'DELETE' },
      { regex: /(?:_dio|dio|http|client)\.patch\s*\(\s*['"`]([^'"`]+)['"`]/g, method: 'PATCH' },

      // 格式2: 带前缀的变量路径 '/users/$id'
      { regex: /(?:_dio|dio|http|client)\.get\s*\(\s*['"`]([^'"`]*\$[^'"`]*)['"`]/g, method: 'GET' },
      { regex: /(?:_dio|dio|http|client)\.post\s*\(\s*['"`]([^'"`]*\$[^'"`]*)['"`]/g, method: 'POST' },
      { regex: /(?:_dio|dio|http|client)\.put\s*\(\s*['"`]([^'"`]*\$[^'"`]*)['"`]/g, method: 'PUT' },
      { regex: /(?:_dio|dio|http|client)\.delete\s*\(\s*['"`]([^'"`]*\$[^'"`]*)['"`]/g, method: 'DELETE' },

      // 格式3: 直接调用（继承自 BaseConnect/GetConnect）- 不带前缀
      // 匹配: get('...') 或 get("...")
      { regex: /(?:return\s+|await\s+)?get\s*\(\s*['"`]([^'"`]+)['"`]/g, method: 'GET' },
      { regex: /(?:return\s+|await\s+)?post\s*\(\s*['"`]([^'"`]+)['"`]/g, method: 'POST' },
      { regex: /(?:return\s+|await\s+)?put\s*\(\s*['"`]([^'"`]+)['"`]/g, method: 'PUT' },
      { regex: /(?:return\s+|await\s+)?delete\s*\(\s*['"`]([^'"`]+)['"`]/g, method: 'DELETE' },
      { regex: /(?:return\s+|await\s+)?patch\s*\(\s*['"`]([^'"`]+)['"`]/g, method: 'PATCH' },

      // 格式4: 直接调用带变量路径
      { regex: /(?:return\s+|await\s+)?get\s*\(\s*['"`]([^'"`]*\$[^'"`]*)['"`]/g, method: 'GET' },
      { regex: /(?:return\s+|await\s+)?post\s*\(\s*['"`]([^'"`]*\$[^'"`]*)['"`]/g, method: 'POST' },
      { regex: /(?:return\s+|await\s+)?put\s*\(\s*['"`]([^'"`]*\$[^'"`]*)['"`]/g, method: 'PUT' },
      { regex: /(?:return\s+|await\s+)?delete\s*\(\s*['"`]([^'"`]*\$[^'"`]*)['"`]/g, method: 'DELETE' },
    ];

    // 匹配所有方法定义（包括带返回类型的）
    const methodPatterns = [
      // Future<Type> methodName(...) async {
      /(?:\n|^)\s*Future\s*<\s*[^>]+\s*>\s+(\w+)\s*\([^)]*\)\s*(?:async\s*)?\{/g,
      // Future methodName(...) async {
      /(?:\n|^)\s*Future\s+(\w+)\s*\(([^)]*)\)\s*(?:async\s*)?\{/g,
      // Type methodName(...) async {
      /(?:\n|^)\s*(\w+(?:<[^>]+>)?)\s+(\w+)\s*\(([^)]*)\)\s*(?:async\s*)?\{/g,
    ];

    for (const methodPattern of methodPatterns) {
      methodPattern.lastIndex = 0;
      let methodMatch;

      while ((methodMatch = methodPattern.exec(classContent)) !== null) {
        // 确定方法名（第二种格式没有返回类型）
        let methodName;
        if (methodPattern.toString().includes('Future\\s+\\w+')) {
          // Future methodName 格式
          methodName = methodMatch[1];
        } else if (methodMatch.length >= 3) {
          // Type methodName 格式，方法名在第二个捕获组
          methodName = methodMatch[2];
        } else {
          methodName = methodMatch[1];
        }

        // 跳过构造函数和特殊方法
        if (!methodName || methodName === 'init' || methodName[0].toUpperCase() === methodName[0]) {
          continue;
        }

        const methodStartPos = methodMatch.index;

        // 查找方法体结束位置
        const methodEndPos = this.findMethodBodyEnd(classContent, methodMatch.index + methodMatch[0].length - 1);

        if (methodEndPos === -1) {
          continue;
        }

        const methodBody = classContent.substring(methodStartPos, methodEndPos);

        // 使用改进的 HTTP 调用提取（使用 extractQuotedString 处理嵌套引号）
        const httpCall = this.extractHttpCallFromMethodBody(methodBody, methodName);
        if (httpCall) {
          const key = `${methodName}-${httpCall.method}-${httpCall.url}`;
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            apiMethods.push({
              name: methodName,
              method: httpCall.method,
              url: httpCall.url,
              params: '',
              line: this.getLineNumber(classContent, methodStartPos, null)
            });
          }
        }
      }
    }

    // 添加调试日志
    if (apiMethods.length > 0) {
      console.log(`[Dart Parser] ${className}: 提取到 ${apiMethods.length} 个 API 方法`);
      for (const api of apiMethods) {
        console.log(`  - ${api.name}: ${api.method} ${api.url}`);
      }
    }

    return apiMethods;
  }

  /**
   * 查找方法体结束位置
   * @param {string} content - 完整内容
   * @param {number} startPos - 方法开始的大括号位置
   * @returns {number} 方法结束位置，-1 表示未找到
   */
  findMethodBodyEnd(content, startPos) {
    let braceCount = 1;
    let i = startPos + 1;
    const MAX_SEARCH = 10000; // 最多搜索 10000 个字符

    while (i < content.length && i < startPos + MAX_SEARCH && braceCount > 0) {
      if (content[i] === '{') {
        braceCount++;
      } else if (content[i] === '}') {
        braceCount--;
      }
      i++;
    }

    return braceCount === 0 ? i : -1;
  }

  /**
   * 从方法体中提取 HTTP 调用信息
   *
   * 支持的格式：
   * - => get("url")
   * - => post("url")
   * - await _dio.get('/path')
   * - await http.post('/path', data)
   * - final response = await _dio.put('/users/$id')
   */
  extractHttpCallFromMethodBody(methodBody, methodName) {
    console.log(`[extractHttpCallFromMethodBody] 方法: ${methodName}, 方法体长度: ${methodBody.length}`);

    // 首先尝试匹配箭头方法的 HTTP 调用模式
    // 格式: => get('...') 或 => post("...")
    const arrowMethodRegex = /=>[\s\S]*?(get|post|put|delete|patch)\s*\(\s*(['"])/g;
    const arrowMatch = arrowMethodRegex.exec(methodBody);
    if (arrowMatch) {
      const httpMethod = arrowMatch[1].toUpperCase();
      const quoteChar = arrowMatch[2];
      const startPos = arrowMatch.index + arrowMatch[0].length;

      // 从起始位置开始查找匹配的结束引号
      const url = this.extractQuotedString(methodBody, startPos, quoteChar);
      if (url !== null) {
        console.log(`[extractHttpCallFromMethodBody] ${methodName} 通过箭头方法提取到: ${httpMethod} ${url}`);
        return this.cleanUrl(url, httpMethod);
      }
    }

    // 尝试匹配带前缀的调用 _dio.get('...')
    const prefixMethodRegex = /(?:_dio|dio|http|client)\.([\s\S]*?(get|post|put|delete|patch))\s*\(\s*(['"])/g;
    const prefixMatch = prefixMethodRegex.exec(methodBody);
    if (prefixMatch) {
      const httpMethod = prefixMatch[2].toUpperCase();
      const quoteChar = prefixMatch[3];
      const startPos = prefixMatch.index + prefixMatch[0].length;

      const url = this.extractQuotedString(methodBody, startPos, quoteChar);
      if (url !== null) {
        console.log(`[extractHttpCallFromMethodBody] ${methodName} 通过前缀方法提取到: ${httpMethod} ${url}`);
        return this.cleanUrl(url, httpMethod);
      }
    }

    // 尝试匹配直接调用（不带前缀）
    const directMethodRegex = /(?:return|await)?[\s\S]*?(get|post|put|delete|patch)\s*\(\s*(['"])/g;
    const directMatch = directMethodRegex.exec(methodBody);
    if (directMatch) {
      const httpMethod = directMatch[1].toUpperCase();
      const quoteChar = directMatch[2];
      const startPos = directMatch.index + directMatch[0].length;

      const url = this.extractQuotedString(methodBody, startPos, quoteChar);
      if (url !== null) {
        console.log(`[extractHttpCallFromMethodBody] ${methodName} 通过直接调用提取到: ${httpMethod} ${url}`);
        return this.cleanUrl(url, httpMethod);
      }
    }

    console.log(`[extractHttpCallFromMethodBody] ${methodName} 未提取到 HTTP 调用`);
    return null;
  }

  /**
   * 从指定位置开始提取带引号的字符串
   * 正确处理嵌套引号和转义字符
   */
  extractQuotedString(content, startPos, quoteChar) {
    let url = '';
    let i = startPos;
    let escaped = false;
    let bracketDepth = 0; // 方括号嵌套深度，用于处理 ${request['prNo']}

    while (i < content.length) {
      const char = content[i];

      if (escaped) {
        // 转义字符，直接添加（包括引号）
        url += char;
        escaped = false;
      } else if (char === '\\') {
        // 遇到转义符，设置转义状态
        escaped = true;
      } else if (char === quoteChar) {
        // 遇到引号，检查是否在方括号内（嵌套引号）
        // 如果在方括号内，则不是结束引号
        if (bracketDepth > 0) {
          url += char;
        } else {
          // 找到真正的结束引号
          return url;
        }
      } else if (char === '[') {
        bracketDepth++;
        url += char;
      } else if (char === ']') {
        bracketDepth--;
        url += char;
      } else {
        url += char;
      }
      i++;
    }

    // 没有找到结束引号，返回 null
    return null;
  }

  /**
   * 清理 URL 字符串
   */
  cleanUrl(url, httpMethod) {
    console.log(`[cleanUrl] 原始 URL: "${url.substring(0, 100)}..."`);

    // 清理 URL：移除环境变量前缀
    url = url.replace(/\$\{environment\.\w+\}/g, '');
    url = url.replace(/\${environment\.\w+}/g, '');
    url = url.replace(/environment\.\w+\/?/g, '');

    // 处理剩余的 ${...} 变量，保留为占位符格式
    // 将 ${request['prNo']} 转换为 {prNo}
    // 注意：需要处理转义的引号
    url = url.replace(/\$\{request\[['"]([^'"]+)['"]]\}/g, '{$1}');

    // 处理其他 ${...} 格式
    // 使用 [\s\S]*? 来匹配任意字符（包括引号）直到遇到 }
    url = url.replace(/\$\{[^}]*?\['"'][^'"']*['"'][^}]*\}/g, '{}');

    // 最后处理剩余的 ${...} 格式（不带内部引号）
    url = url.replace(/\$\{[^}]+\}/g, '{}');

    console.log(`[cleanUrl] 清理后 URL: "${url}"`);

    // 移除协议和域名前缀，只保留路径
    url = url.replace(/^https?:\/\/[^\/]+/, '');
    url = url.replace(/^\/\//, '');

    // 确保 URL 以 / 开头（除非是变量）
    if (url && !url.startsWith('/') && !url.startsWith('$') && !url.startsWith('{')) {
      url = '/' + url;
    }

    return { method: httpMethod, url };
  }

  /**
   * 获取指定位置的行号
   * 使用缓存避免重复计算
   */
  getLineNumber(content, index, lineCache = null) {
    // 如果提供了缓存，使用缓存
    if (lineCache && lineCache.indexes) {
      // 二分查找最近的换行符位置
      const indexes = lineCache.indexes;
      let left = 0;
      let right = indexes.length - 1;

      while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        if (indexes[mid] <= index) {
          left = mid + 1;
        } else {
          right = mid - 1;
        }
      }
      return right + 2; // +2 因为行号从 1 开始，且 right 是索引
    }

    // 简单优化：只计算到 index 位置
    let lineCount = 1;
    const searchLength = Math.min(index, content.length);
    for (let i = 0; i < searchLength; i++) {
      if (content[i] === '\n') {
        lineCount++;
      }
    }
    return lineCount;
  }

  /**
   * 创建行号缓存 - 预先计算所有换行符位置
   */
  createLineCache(content) {
    const indexes = [];
    for (let i = 0; i < content.length; i++) {
      if (content[i] === '\n') {
        indexes.push(i);
      }
    }
    return { indexes };
  }

  /**
   * 分析 Dart 项目的依赖
   * @param {string} projectPath - 项目路径
   * @returns {Object} 依赖信息
   */
  analyzeDependencies(projectPath) {
    const fs = require('fs');
    const path = require('path');

    const pubspecPath = path.join(projectPath, 'pubspec.yaml');
    if (!fs.existsSync(pubspecPath)) {
      return { error: 'pubspec.yaml not found' };
    }

    try {
      const yaml = require('js-yaml');
      const pubspecContent = fs.readFileSync(pubspecPath, 'utf8');
      const pubspec = yaml.load(pubspecContent);

      const dependencies = {
        dependencies: pubspec.dependencies || {},
        devDependencies: pubspec.dev_dependencies || {},
        dependencyOverrides: pubspec.dependency_overrides || {},
      };

      return {
        success: true,
        dependencies,
        sdkVersion: pubspec.environment?.sdk,
        flutter: pubspec.flutter || null,
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * 检测是否是 Flutter 项目
   * @param {string} projectPath - 项目路径
   * @returns {boolean}
   */
  isFlutterProject(projectPath) {
    const fs = require('fs');
    const path = require('path');

    const pubspecPath = path.join(projectPath, 'pubspec.yaml');
    if (!fs.existsSync(pubspecPath)) {
      return false;
    }

    try {
      const yaml = require('js-yaml');
      const pubspecContent = fs.readFileSync(pubspecPath, 'utf8');
      const pubspec = yaml.load(pubspecContent);
      return !!pubspec.dependencies?.flutter;
    } catch (error) {
      return false;
    }
  }
}

module.exports = DartParser;
