/**
 * Function Analyzer Module
 *
 * 职责:
 * - 分析函数的复杂度指标
 * - 构建函数调用关系图
 * - 识别函数职责类型
 * - 检测代码质量问题
 *
 * Supported Languages:
 * - JavaScript/TypeScript
 * - Dart
 */

class FunctionAnalyzer {
  constructor() {
    this.callGraph = new Map(); // 函数调用关系图
    this.functionMetrics = new Map(); // 函数指标缓存
    this.complexityCache = new Map();
  }

  /**
   * 分析函数详细信息
   * @param {Object} func - 函数基本信息
   * @param {string} content - 文件内容
   * @param {Object} ast - AST (可选)
   * @param {string} language - 语言类型
   * @returns {Object} 增强的函数信息
   */
  analyzeFunction(func, content, ast = null, language = 'javascript') {
    const analysis = {
      // 基本信息
      ...func,

      // 复杂度指标
      complexity: this.calculateComplexity(func, content, language),

      // 职责识别
      purpose: this.identifyPurpose(func, content, language),

      // 调用关系
      calls: [], // 调用的其他函数
      calledBy: [], // 被谁调用

      // 变量分析
      variables: this.extractVariables(func, content, language),
      hasSideEffects: false,
      modifiesExternalState: false,

      // 访问控制
      accessLevel: this.determineAccessLevel(func, content, language),
      isExported: false,
      isStatic: func.static || false,

      // 代码质量
      quality: {
        hasConsole: false,
        hasDebugger: false,
        hasEmptyBlock: false,
        hasNestedFunctions: false,
        nestingDepth: 0,
      },

      // 类型信息
      isAsync: func.async || false,
      isGenerator: func.generator || false,
      isArrow: func.isArrow || false,
      isMethod: func.isMethod || false,

      // 位置信息
      endLine: func.endLine || null,
      bodyStartLine: func.bodyStartLine || null,
      bodyEndLine: func.bodyEndLine || null,

      // 父级信息
      className: func.className || null,
      parentFunction: func.parentFunction || null,

      // 所属模块
      belongsTo: func.belongsTo || null, // 'class', 'function', 'module'

      // 时间戳
      analyzedAt: new Date().toISOString(),
    };

    return analysis;
  }

  /**
   * 计算圈复杂度
   * @param {Object} func - 函数信息
   * @param {string} content - 文件内容
   * @param {string} language - 语言类型
   * @returns {Object} 复杂度信息
   */
  calculateComplexity(func, content, language) {
    const lines = content.split('\n');
    const startLine = func.line - 1;
    const endLine = func.endLine || this.findFunctionEnd(lines, startLine, language);

    // 提取函数体
    const functionBody = lines.slice(startLine, endLine).join('\n');

    // 基础复杂度 = 1
    let complexity = 1;

    // 决策点模式
    const decisionPatterns = {
      javascript: [
        /\bif\b/g,
        /\belse\s+if\b/g,
        /\bfor\b/g,
        /\bwhile\b/g,
        /\bswitch\b/g,
        /\bcase\b/g,
        /\bcatch\b/g,
        /\?\s*:/g, // 三元运算符
        /\&\&/g, // 逻辑与
        /\|\|/g, // 逻辑或
      ],
      dart: [
        /\bif\b/g,
        /\belse\s+if\b/g,
        /\bfor\b/g,
        /\bwhile\b/g,
        /\bswitch\b/g,
        /\bcase\b/g,
        /\bon\b/g, // Dart try-catch
        /\?\s*:/g,
        /\&\&/g,
        /\|\|/g,
      ],
    };

    const patterns = decisionPatterns[language] || decisionPatterns.javascript;

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(functionBody)) !== null) {
        complexity++;
      }
    }

    // 计算代码行数
    const linesOfCode = endLine - startLine;

    // 计算参数数量
    const paramCount = func.params ? func.params.length : 0;

    // 计算嵌套深度
    const nestingDepth = this.calculateNestingDepth(functionBody, language);

    // 评估复杂度等级
    let level = 'low';
    if (complexity > 10 || linesOfCode > 50 || nestingDepth > 4) {
      level = 'medium';
    }
    if (complexity > 20 || linesOfCode > 100 || nestingDepth > 6) {
      level = 'high';
    }
    if (complexity > 50 || linesOfCode > 200 || nestingDepth > 8) {
      level = 'very-high';
    }

    return {
      cyclomatic: complexity,
      linesOfCode,
      paramCount,
      nestingDepth,
      level,
      score: this.calculateQualityScore(complexity, linesOfCode, nestingDepth),
    };
  }

  /**
   * 计算嵌套深度
   */
  calculateNestingDepth(functionBody, language) {
    let maxDepth = 0;
    let currentDepth = 0;

    const lines = functionBody.split('\n');

    for (const line of lines) {
      const opens = (line.match(/\{/g) || []).length;
      const closes = (line.match(/\}/g) || []).length;

      currentDepth += opens - closes;
      maxDepth = Math.max(maxDepth, currentDepth);
    }

    return maxDepth;
  }

  /**
   * 计算质量评分 (0-100)
   */
  calculateQualityScore(complexity, loc, nesting) {
    let score = 100;

    // 复杂度扣分
    if (complexity > 10) score -= (complexity - 10) * 2;
    if (complexity > 20) score -= (complexity - 20) * 3;

    // 代码行数扣分
    if (loc > 50) score -= (loc - 50) * 0.5;
    if (loc > 100) score -= (loc - 100) * 1;

    // 嵌套深度扣分
    if (nesting > 4) score -= (nesting - 4) * 5;
    if (nesting > 6) score -= (nesting - 6) * 10;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * 查找函数结束位置
   */
  findFunctionEnd(lines, startLine, language) {
    let braceCount = 0;
    let foundStart = false;

    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i];

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

    return startLine + 20; // 默认返回20行
  }

  /**
   * 识别函数职责类型
   */
  identifyPurpose(func, content, language) {
    const purposes = [];
    const funcName = func.name ? func.name.toLowerCase() : '';
    const lines = content.split('\n');
    const startLine = func.line - 1;
    const endLine = func.endLine || startLine + 20;
    const functionBody = lines.slice(startLine, endLine).join('\n').toLowerCase();

    // CRUD 操作检测
    if (funcName.includes('create') || funcName.includes('add') || funcName.includes('insert') ||
        funcName.includes('post')) {
      purposes.push('create');
    }
    if (funcName.includes('read') || funcName.includes('get') || funcName.includes('fetch') ||
        funcName.includes('find') || funcName.includes('query') || funcName.includes('list')) {
      purposes.push('read');
    }
    if (funcName.includes('update') || funcName.includes('edit') || funcName.includes('modify') ||
        funcName.includes('put') || funcName.includes('patch')) {
      purposes.push('update');
    }
    if (funcName.includes('delete') || funcName.includes('remove') || funcName.includes('destroy')) {
      purposes.push('delete');
    }

    // 事件处理
    if (funcName.startsWith('on') || funcName.startsWith('handle') ||
        functionBody.includes('addeventlistener') || functionBody.includes('.on(')) {
      purposes.push('event-handler');
    }

    // 生命周期
    if (funcName.includes('init') || funcName.includes('mount') ||
        funcName.includes('unmount') || funcName.includes('will') ||
        funcName.includes('did') || funcName === 'initstate') {
      purposes.push('lifecycle');
    }

    // React Hooks
    if (funcName.startsWith('use')) {
      purposes.push('hook');
    }

    // API 调用
    if (functionBody.includes('fetch(') || functionBody.includes('axios.') ||
        functionBody.includes('http.') || functionBody.includes('.get(') ||
        functionBody.includes('.post(')) {
      purposes.push('api-call');
    }

    // 状态操作
    if (functionBody.includes('setstate') || functionBody.includes('dispatch') ||
        functionBody.includes('setstate(') || functionBody.includes('usestate') ||
        functionBody.includes('usereducer')) {
      purposes.push('state-management');
    }

    // 验证函数
    if (funcName.includes('validate') || funcName.includes('check') ||
        funcName.includes('verify') || funcName.includes('is')) {
      purposes.push('validation');
    }

    // 工具函数
    if (funcName.includes('format') || funcName.includes('parse') ||
        funcName.includes('convert') || funcName.includes('transform') ||
        funcName.includes('to') || funcName.includes('util')) {
      purposes.push('utility');
    }

    // 渲染函数
    if (funcName === 'render' || funcName === 'build' || funcName.includes('draw')) {
      purposes.push('render');
    }

    // 构造函数
    if (funcName === 'constructor' || funcName === '__init__' ||
        funcName === 'init') {
      purposes.push('constructor');
    }

    // Getter/Setter
    if (funcName.startsWith('get_') || funcName.startsWith('set_') ||
        (funcName.startsWith('get') && funcName.length > 3) ||
        (funcName.startsWith('set') && funcName.length > 3)) {
      purposes.push('accessor');
    }

    // 默认
    if (purposes.length === 0) {
      purposes.push('business-logic');
    }

    return {
      primary: purposes[0],
      all: purposes,
      confidence: this.calculatePurposeConfidence(purposes, funcName, functionBody),
    };
  }

  /**
   * 计算职责识别置信度
   */
  calculatePurposeConfidence(purposes, funcName, functionBody) {
    if (purposes.length > 1) return 'medium';
    if (funcName.length > 0 && functionBody.includes(funcName.replace(/_/g, ''))) {
      return 'high';
    }
    return 'low';
  }

  /**
   * 提取函数内变量
   */
  extractVariables(func, content, language) {
    const lines = content.split('\n');
    const startLine = func.line - 1;
    const endLine = func.endLine || startLine + 20;
    const functionBody = lines.slice(startLine, endLine).join('\n');

    const variables = {
      local: [],
      closures: [],
      parameters: func.params || [],
    };

    // 检测变量声明
    const varPatterns = {
      javascript: [
        /(?:const|let|var)\s+(\w+)\s*=/g,
        /function\s+(\w+)\s*\(/g,
      ],
      dart: [
        /\b(?:var|final|const)\s+(\w+)\s*=/g,
        /\b(\w+)\s*\([^)]*\)\s*{/g, // 函数
      ],
    };

    const patterns = varPatterns[language] || varPatterns.javascript;
    const foundVars = new Set();

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(functionBody)) !== null) {
        if (match[1] && !variables.parameters.includes(match[1])) {
          foundVars.add(match[1]);
        }
      }
    }

    variables.local = Array.from(foundVars);

    return variables;
  }

  /**
   * 确定访问级别
   */
  determineAccessLevel(func, content, language) {
    const funcName = func.name || '';

    // JavaScript/TypeScript 约定
    if (funcName.startsWith('_')) {
      return 'protected';
    }
    if (funcName.endsWith('_')) {
      return 'private';
    }

    // Dart 约定
    if (language === 'dart') {
      if (funcName.startsWith('_')) {
        return 'private';
      }
    }

    return 'public';
  }

  /**
   * 构建函数调用关系图
   * @param {Array} functions - 所有函数列表
   * @param {string} content - 文件内容
   * @param {string} language - 语言类型
   * @returns {Object} 调用关系图
   */
  buildCallGraph(functions, content, language) {
    const callGraph = {
      nodes: [],
      edges: [],
    };

    // 创建节点
    for (const func of functions) {
      callGraph.nodes.push({
        id: func.name,
        name: func.name,
        type: 'function',
        line: func.line,
      });
    }

    // 分析调用关系
    const functionNames = new Set(functions.map(f => f.name));

    for (const func of functions) {
      const calls = this.extractFunctionCalls(func, content, language);

      for (const calledFunc of calls) {
        if (functionNames.has(calledFunc)) {
          callGraph.edges.push({
            from: func.name,
            to: calledFunc,
            type: 'calls',
          });
        }
      }
    }

    return callGraph;
  }

  /**
   * 提取函数调用的其他函数
   */
  extractFunctionCalls(func, content, language) {
    const lines = content.split('\n');
    const startLine = func.line - 1;
    const endLine = func.endLine || startLine + 20;
    const functionBody = lines.slice(startLine, endLine).join('\n');

    const calls = new Set();

    // 函数调用模式
    const callPatterns = [
      /(\w+)\s*\(/g, // 标准调用
      /await\s+(\w+)\s*\(/g, // await 调用
      /\.(\w+)\s*\(/g, // 方法调用
    ];

    for (const pattern of callPatterns) {
      let match;
      while ((match = pattern.exec(functionBody)) !== null) {
        const calledFunc = match[1];
        // 过滤掉关键字和内置函数
        if (!this.isBuiltinFunction(calledFunc)) {
          calls.add(calledFunc);
        }
      }
    }

    return Array.from(calls);
  }

  /**
   * 检查是否是内置函数
   */
  isBuiltinFunction(name) {
    const builtins = [
      'console', 'log', 'error', 'warn', 'info',
      'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
      'JSON', 'parseInt', 'parseFloat', 'isNaN',
      'Array', 'Object', 'String', 'Number', 'Boolean',
      'Math', 'Date', 'RegExp',
      'map', 'filter', 'reduce', 'forEach', 'find', 'some', 'every',
      'push', 'pop', 'shift', 'unshift', 'splice', 'slice',
      'print', 'debugPrint', // Dart
    ];

    return builtins.includes(name);
  }

  /**
   * 分析函数质量指标
   */
  analyzeQuality(func, content, language) {
    const lines = content.split('\n');
    const startLine = func.line - 1;
    const endLine = func.endLine || startLine + 20;
    const functionBody = lines.slice(startLine, endLine).join('\n');

    return {
      hasConsole: /console\.(log|error|warn|info|debug)/.test(functionBody),
      hasDebugger: /debugger/.test(functionBody),
      hasEmptyBlock: /\{\s*\}/.test(functionBody),
      hasNestedFunctions: /function\s+\w+\s*\(/.test(functionBody) ||
                               /\(\w+\)\s*=>/.test(functionBody),
      hasComments: /\/\/|\/\*/.test(functionBody),
      hasTODO: /TODO|FIXME|HACK|XXX/.test(functionBody),
      hasHardcodedValues: /["'].*["'].*[=:]/.test(functionBody),
    };
  }

  /**
   * 生成函数分析报告
   */
  generateReport(functions, content, language) {
    const report = {
      summary: {
        totalFunctions: functions.length,
        asyncFunctions: functions.filter(f => f.async).length,
        highComplexity: 0,
        mediumComplexity: 0,
        lowComplexity: 0,
      },
      functions: [],
      callGraph: this.buildCallGraph(functions, content, language),
      recommendations: [],
    };

    for (const func of functions) {
      const analysis = this.analyzeFunction(func, content, null, language);

      // 统计复杂度
      if (analysis.complexity.level === 'high' || analysis.complexity.level === 'very-high') {
        report.summary.highComplexity++;
      } else if (analysis.complexity.level === 'medium') {
        report.summary.mediumComplexity++;
      } else {
        report.summary.lowComplexity++;
      }

      // 生成建议
      if (analysis.complexity.level === 'high' || analysis.complexity.level === 'very-high') {
        report.recommendations.push({
          type: 'refactor',
          function: func.name,
          message: `函数 ${func.name} 复杂度过高 (${analysis.complexity.cyclomatic})，建议拆分`,
        });
      }

      if (analysis.complexity.paramCount > 5) {
        report.recommendations.push({
          type: 'simplify',
          function: func.name,
          message: `函数 ${func.name} 参数过多 (${analysis.complexity.paramCount})，考虑使用对象参数`,
        });
      }

      if (analysis.complexity.linesOfCode > 100) {
        report.recommendations.push({
          type: 'shorten',
          function: func.name,
          message: `函数 ${func.name} 代码行数过多 (${analysis.complexity.linesOfCode})，建议拆分`,
        });
      }

      report.functions.push(analysis);
    }

    return report;
  }

  /**
   * 清除缓存
   */
  clearCache() {
    this.callGraph.clear();
    this.functionMetrics.clear();
    this.complexityCache.clear();
  }
}

module.exports = FunctionAnalyzer;
