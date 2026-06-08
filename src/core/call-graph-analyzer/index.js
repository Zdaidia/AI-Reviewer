/**
 * Call Graph Analyzer
 *
 * 职责:
 * - 分析函数调用关系图
 * - 识别业务流程入口点
 * - 生成调用链和调用树
 * - 分析数据流向
 * - 提取业务逻辑模式
 *
 * Supported Languages:
 * - JavaScript/TypeScript
 * - Dart
 */

class CallGraphAnalyzer {
  constructor() {
    this.callGraph = new Map(); // 函数 -> 被调用函数列表
    this.reverseCallGraph = new Map(); // 函数 -> 调用者列表
    this.functionInfo = new Map(); // 函数元信息
  }

  /**
   * 构建完整的调用关系图
   * @param {Array} functions - 函数列表
   * @param {Array} classes - 类列表
   * @param {string} content - 文件内容
   * @param {string} language - 语言类型
   * @returns {Object} 完整的调用关系图
   */
  buildCallGraph(functions, classes = [], content, language = 'javascript') {
    this.callGraph.clear();
    this.reverseCallGraph.clear();
    this.functionInfo.clear();

    // 1. 提取所有函数调用
    const callEdges = this.extractCallEdges(functions, classes, content, language);

    // 2. 构建调用图和反向调用图
    for (const edge of callEdges) {
      // 添加到正向图
      if (!this.callGraph.has(edge.from)) {
        this.callGraph.set(edge.from, new Set());
      }
      this.callGraph.get(edge.from).add(edge.to);

      // 添加到反向图
      if (!this.reverseCallGraph.has(edge.to)) {
        this.reverseCallGraph.set(edge.to, new Set());
      }
      this.reverseCallGraph.get(edge.to).add(edge.from);
    }

    // 3. 存储函数元信息
    for (const func of functions) {
      this.functionInfo.set(func.name, {
        name: func.name,
        line: func.line,
        endLine: func.endLine,
        isAsync: func.async || false,
        isExported: this.isExportedFunction(func, content),
        isPublic: !func.name.startsWith('_'),
        params: func.params || [],
        complexity: func.complexity || null,
        purpose: func.purpose || null,
      });
    }

    // 4. 添加类方法信息
    for (const cls of classes) {
      for (const method of cls.methods || []) {
        const methodName = `${cls.name}.${method.key || method.name}`;
        this.functionInfo.set(methodName, {
          name: methodName,
          line: method.line,
          isAsync: method.async || false,
          isPublic: !(method.key || method.name).startsWith('_'),
          className: cls.name,
          isMethod: true,
          kind: method.kind,
        });
      }
    }

    // 5. 生成增强的调用关系图
    return this.generateEnhancedCallGraph();
  }

  /**
   * 提取函数调用边
   */
  extractCallEdges(functions, classes, content, language) {
    const edges = [];
    const lines = content.split('\n');

    // 构建函数名到行号的映射
    const functionPositions = new Map();
    for (const func of functions) {
      functionPositions.set(func.name, func.line);
    }

    // 提取每个函数的调用
    for (const func of functions) {
      const startLine = func.line - 1;
      const endLine = func.endLine || this.findFunctionEnd(lines, startLine, language);

      // 提取函数体
      const functionBody = lines.slice(startLine, endLine).join('\n');

      // 查找函数调用
      const calls = this.extractFunctionCallsFromCode(functionBody, language);

      for (const calledFunc of calls) {
        // 过滤内置函数
        if (!this.isBuiltinFunction(calledFunc)) {
          edges.push({
            from: func.name,
            to: calledFunc,
            line: this.findCallLine(functionBody, calledFunc, startLine),
          });
        }
      }

      // 提取类方法调用
      if (classes && classes.length > 0) {
        const methodCalls = this.extractMethodCalls(functionBody, classes);
        for (const methodCall of methodCalls) {
          edges.push({
            from: func.name,
            to: methodCall,
            line: this.findCallLine(functionBody, methodCall, startLine),
          });
        }
      }
    }

    return edges;
  }

  /**
   * 从代码中提取函数调用
   */
  extractFunctionCallsFromCode(code, language) {
    const calls = new Set();

    // 匹配各种函数调用模式
    const patterns = [
      // 标准调用: funcName(...)
      /(\w+)\s*\(/g,

      // 方法调用: obj.funcName(...)
      /\.(\w+)\s*\(/g,

      // await 调用
      /await\s+(\w+)\s*\(/g,

      // new 调用
      /new\s+(\w+)\s*\(/g,

      // 链式调用
      /then\s*\(\s*(\w+)/g,

      // 回调函数
      /(?:map|filter|reduce|forEach|find|some|every)\s*\([^)]*=>\s*([^{}]+)/g,
    ];

    const MAX_ITERATIONS = 10000; // 防止无限循环

    for (const pattern of patterns) {
      let match;
      let iterations = 0;
      const regex = new RegExp(pattern.source, pattern.flags);
      while ((match = regex.exec(code)) !== null && iterations < MAX_ITERATIONS) {
        iterations++;
        const funcName = match[1];
        if (funcName && !this.isKeyword(funcName)) {
          calls.add(funcName);
        }
      }
    }

    return Array.from(calls);
  }

  /**
   * 提取类方法调用
   */
  extractMethodCalls(code, classes) {
    const methodCalls = [];
    const MAX_ITERATIONS = 1000; // 防止无限循环

    for (const cls of classes) {
      // 匹配 className.methodName(...)
      const pattern = new RegExp(`${cls.name}\\.(\\w+)\\s*\\(`, 'g');
      let match;
      let iterations = 0;
      while ((match = pattern.exec(code)) !== null && iterations < MAX_ITERATIONS) {
        iterations++;
        methodCalls.push(`${cls.name}.${match[1]}`);
      }

      // 匹配 this.methodName(...)
      if (code.includes('this.')) {
        const thisPattern = /this\.(\w+)\s*\(/g;
        iterations = 0;
        while ((match = thisPattern.exec(code)) !== null && iterations < MAX_ITERATIONS) {
          iterations++;
          methodCalls.push(`${cls.name}.${match[1]}`);
        }
      }
    }

    return methodCalls;
  }

  /**
   * 查找调用所在的行号
   */
  findCallLine(functionBody, calledFunc, startLine) {
    const lines = functionBody.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(calledFunc) && lines[i].includes('(')) {
        return startLine + i + 1;
      }
    }
    return startLine + 1;
  }

  /**
   * 检查是否是关键字
   */
  isKeyword(name) {
    const keywords = [
      'if', 'else', 'for', 'while', 'switch', 'case', 'break', 'continue',
      'return', 'throw', 'try', 'catch', 'finally', 'typeof', 'instanceof',
      'new', 'delete', 'void', 'in', 'of', 'async', 'await', 'yield',
      'class', 'extends', 'super', 'this', 'import', 'export', 'from',
      'default', 'const', 'let', 'var', 'function', '=>', 'true', 'false',
      'null', 'undefined', 'NaN', 'Infinity',
    ];
    return keywords.includes(name);
  }

  /**
   * 检查是否是内置函数
   */
  isBuiltinFunction(name) {
    const builtins = [
      'console', 'log', 'error', 'warn', 'info', 'debug',
      'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
      'JSON', 'parseInt', 'parseFloat', 'isNaN', 'isFinite',
      'Array', 'Object', 'String', 'Number', 'Boolean', 'Math', 'Date',
      'RegExp', 'Error', 'Promise', 'Map', 'Set', 'WeakMap', 'WeakSet',
      'Proxy', 'Reflect', 'Symbol', 'BigInt',
      'map', 'filter', 'reduce', 'forEach', 'find', 'some', 'every',
      'push', 'pop', 'shift', 'unshift', 'splice', 'slice',
      'print', 'debugPrint', // Dart
    ];
    return builtins.includes(name);
  }

  /**
   * 检查函数是否被导出
   */
  isExportedFunction(func, content) {
    const lines = content.split('\n');
    const funcLine = lines[func.line - 1];

    // 检查函数定义前是否有 export
    if (funcLine) {
      const beforeFunc = content.substring(0, content.indexOf(func.name, func.line * 50));
      return beforeFunc.includes('export') && beforeFunc.lastIndexOf('export') > beforeFunc.lastIndexOf('\n', func.line * 50);
    }

    return false;
  }

  /**
   * 查找函数结束位置
   */
  findFunctionEnd(lines, startLine, language) {
    let braceCount = 0;
    let foundStart = false;

    for (let i = startLine; i < Math.min(startLine + 200, lines.length); i++) {
      const line = lines[i];

      if (!foundStart) {
        if (line.includes('{')) {
          foundStart = true;
          braceCount += (line.match(/\{/g) || []).length;
          braceCount -= (line.match(/\}/g) || []).length;
        }
        continue;
      }

      braceCount += (line.match(/\{/g) || []).length;
      braceCount -= (line.match(/\}/g) || []).length;

      if (braceCount === 0) {
        return i + 1;
      }
    }

    return startLine + 20;
  }

  /**
   * 生成增强的调用关系图
   */
  generateEnhancedCallGraph() {
    return {
      // 函数列表
      functions: Array.from(this.functionInfo.values()),

      // 调用边
      edges: this.buildEdges(),

      // 业务流程入口点
      entryPoints: this.identifyEntryPoints(),

      // 调用链
      callChains: this.generateCallChains(),

      // 数据流
      dataFlow: this.analyzeDataFlow(),

      // 关键路径
      criticalPaths: this.identifyCriticalPaths(),

      // 依赖分析
      dependencies: this.analyzeDependencies(),

      // 循环依赖
      circularDeps: this.detectCircularDependencies(),
    };
  }

  /**
   * 构建调用边
   */
  buildEdges() {
    const edges = [];

    for (const [from, toSet] of this.callGraph) {
      for (const to of toSet) {
        edges.push({
          from,
          to,
          type: this.determineCallType(from, to),
        });
      }
    }

    return edges;
  }

  /**
   * 确定调用类型
   */
  determineCallType(from, to) {
    const fromInfo = this.functionInfo.get(from);
    const toInfo = this.functionInfo.get(to);

    // 同步调用
    if (!fromInfo || !fromInfo.isAsync) {
      return 'sync';
    }

    // 异步调用
    if (fromInfo.isAsync) {
      return 'async';
    }

    return 'unknown';
  }

  /**
   * 识别业务流程入口点
   */
  identifyEntryPoints() {
    const entryPoints = [];

    for (const [funcName, info] of this.functionInfo) {
      let isEntry = false;
      let reason = '';

      // 1. 被导出的函数
      if (info.isExported) {
        isEntry = true;
        reason = 'exported';
      }

      // 2. 公共函数且没有被其他函数调用
      if (!isEntry && info.isPublic) {
        const callers = this.reverseCallGraph.get(funcName);
        if (!callers || callers.size === 0) {
          isEntry = true;
          reason = 'no-callers';
        }
      }

      // 3. 生命周期函数
      if (!isEntry && this.isLifecycleFunction(funcName)) {
        isEntry = true;
        reason = 'lifecycle';
      }

      // 4. 事件处理函数
      if (!isEntry && this.isEventHandler(funcName)) {
        isEntry = true;
        reason = 'event-handler';
      }

      // 5. HTTP 路由处理函数
      if (!isEntry && this.isRouteHandler(funcName)) {
        isEntry = true;
        reason = 'route-handler';
      }

      if (isEntry) {
        // 获取该入口点的调用链
        const callChain = this.getCallChain(funcName, 5);

        entryPoints.push({
          name: funcName,
          line: info.line,
          reason,
          info,
          callChain,
        });
      }
    }

    return entryPoints;
  }

  /**
   * 检查是否是生命周期函数
   */
  isLifecycleFunction(funcName) {
    const lifecyclePatterns = [
      'componentDidMount', 'componentDidUpdate', 'componentWillUnmount',
      'useEffect', 'useLayoutEffect', 'useCallback', 'useMemo',
      'initState', 'componentWillMount', 'getDerivedStateFromProps',
      'shouldComponentUpdate', 'getSnapshotBeforeUpdate',
      'initState', 'build', // Flutter
      'onCreate', 'onStart', 'onResume', 'onPause', 'onStop', 'onDestroy', // Android
      'viewDidLoad', 'viewWillAppear', 'viewDidAppear', // iOS
    ];

    return lifecyclePatterns.some(pattern => funcName.includes(pattern));
  }

  /**
   * 检查是否是事件处理函数
   */
  isEventHandler(funcName) {
    return funcName.startsWith('on') ||
           funcName.startsWith('handle') ||
           funcName.includes('Click') ||
           funcName.includes('Change') ||
           funcName.includes('Submit');
  }

  /**
   * 检查是否是路由处理函数
   */
  isRouteHandler(funcName) {
    return funcName.includes('Controller') ||
           funcName.includes('Handler') ||
           funcName.includes('Route') ||
           funcName.includes('Action');
  }

  /**
   * 生成调用链
   */
  generateCallChains() {
    const chains = [];

    // 为每个入口点生成调用链
    for (const [funcName, info] of this.functionInfo) {
      if (info.isExported || this.isEntryFunction(funcName)) {
        const chain = this.getCallChain(funcName, 10);
        if (chain.length > 1) {
          chains.push({
            entry: funcName,
            chain,
            depth: chain.length,
          });
        }
      }
    }

    return chains;
  }

  /**
   * 检查是否是入口函数
   */
  isEntryFunction(funcName) {
    const callers = this.reverseCallGraph.get(funcName);
    return !callers || callers.size === 0;
  }

  /**
   * 获取函数的调用链（深度优先）
   */
  getCallChain(funcName, maxDepth = 10, visited = new Set()) {
    const chain = [];

    if (maxDepth <= 0 || visited.has(funcName)) {
      return chain;
    }

    visited.add(funcName);

    const info = this.functionInfo.get(funcName);
    if (info) {
      chain.push({
        name: funcName,
        line: info.line,
        isAsync: info.isAsync,
        purpose: info.purpose,
      });
    }

    const callees = this.callGraph.get(funcName);
    if (callees && callees.size > 0) {
      // 按调用顺序排序，只添加第一层被调用函数
      const sortedCallees = Array.from(callees).sort();
      for (const callee of sortedCallees) {
        // 检查是否已经访问过（避免重复和循环）
        if (!visited.has(callee)) {
          const calleeInfo = this.functionInfo.get(callee);
          if (calleeInfo) {
            chain.push({
              name: callee,
              line: calleeInfo.line,
              isAsync: calleeInfo.isAsync,
              purpose: calleeInfo.purpose,
            });
          }
        }
      }
    }

    return chain;
  }

  /**
   * 分析数据流向
   */
  analyzeDataFlow() {
    const dataFlows = [];

    // 查找数据转换函数
    for (const [funcName, info] of this.functionInfo) {
      if (info.purpose && (info.purpose.primary === 'utility' ||
                           info.purpose.primary === 'read' ||
                           info.purpose.primary === 'validation')) {
        // 查找调用者
        const callers = this.reverseCallGraph.get(funcName);
        if (callers && callers.size > 0) {
          dataFlows.push({
            function: funcName,
            purpose: info.purpose.primary,
            calledBy: Array.from(callers),
            flowType: this.determineFlowType(info, callers),
          });
        }
      }
    }

    return dataFlows;
  }

  /**
   * 确定数据流类型
   */
  determineFlowType(info, callers) {
    if (info.purpose.primary === 'read') {
      return 'input';
    } else if (info.purpose.primary === 'create' ||
               info.purpose.primary === 'update') {
      return 'output';
    } else if (info.purpose.primary === 'utility') {
      return 'transform';
    }
    return 'unknown';
  }

  /**
   * 识别关键路径（深度最深的调用链）
   */
  identifyCriticalPaths() {
    const paths = [];

    for (const entry of this.identifyEntryPoints()) {
      const path = this.findLongestPath(entry.name);
      if (path.length > 3) {
        paths.push({
          entry: entry.name,
          path,
          length: path.length,
          complexity: this.calculatePathComplexity(path),
        });
      }
    }

    // 按路径长度排序
    return paths.sort((a, b) => b.length - a.length);
  }

  /**
   * 查找从指定函数开始的最长路径
   */
  findLongestPath(startFunc, visited = new Set()) {
    if (visited.has(startFunc)) {
      return [];
    }

    visited.add(startFunc);

    const path = [startFunc];
    const callees = this.callGraph.get(startFunc);

    if (callees && callees.size > 0) {
      let longestSubPath = [];

      for (const callee of callees) {
        const subPath = this.findLongestPath(callee, new Set(visited));
        if (subPath.length > longestSubPath.length) {
          longestSubPath = subPath;
        }
      }

      path.push(...longestSubPath);
    }

    return path;
  }

  /**
   * 计算路径的复杂度
   */
  calculatePathComplexity(path) {
    let totalComplexity = 0;

    for (const funcName of path) {
      const info = this.functionInfo.get(funcName);
      if (info && info.complexity) {
        totalComplexity += info.complexity.cyclomatic || 1;
      } else {
        totalComplexity += 1;
      }
    }

    return totalComplexity;
  }

  /**
   * 分析依赖关系
   */
  analyzeDependencies() {
    const dependencies = [];

    for (const [funcName, callees] of this.callGraph) {
      if (callees.size > 0) {
        // 分类依赖
        const deps = {
          function: funcName,
          total: callees.size,
          internal: [],
          external: [],
          async: [],
          sync: [],
        };

        for (const callee of callees) {
          const info = this.functionInfo.get(callee);
          if (info) {
            deps.internal.push(callee);
          } else {
            deps.external.push(callee);
          }

          if (info && info.isAsync) {
            deps.async.push(callee);
          } else {
            deps.sync.push(callee);
          }
        }

        dependencies.push(deps);
      }
    }

    return dependencies;
  }

  /**
   * 检测循环依赖
   */
  detectCircularDependencies() {
    const cycles = [];
    const visited = new Set();
    const recursionStack = new Set();
    const path = [];

    const dfs = (funcName) => {
      visited.add(funcName);
      recursionStack.add(funcName);
      path.push(funcName);

      const callees = this.callGraph.get(funcName);
      if (callees) {
        for (const callee of callees) {
          // 跳过自调用（递归函数）
          if (callee === funcName) {
            continue;
          }

          if (!visited.has(callee)) {
            dfs(callee);
          } else if (recursionStack.has(callee)) {
            // 发现循环
            const cycleStart = path.indexOf(callee);
            const cycle = path.slice(cycleStart);
            const cycleKey = [...cycle, callee].join(',');

            // 避免重复
            if (!cycles.some(c => c.join(',') === cycleKey)) {
              cycles.push([...cycle, callee]);
            }
          }
        }
      }

      recursionStack.delete(funcName);
      path.pop();
    };

    for (const funcName of this.functionInfo.keys()) {
      if (!visited.has(funcName)) {
        dfs(funcName);
      }
    }

    // 标记递归函数
    const recursiveFunctions = [];
    for (const funcName of this.functionInfo.keys()) {
      const callees = this.callGraph.get(funcName);
      if (callees && callees.has(funcName)) {
        recursiveFunctions.push({
          function: funcName,
          type: this.getRecursionType(funcName, callees),
        });
      }
    }

    return {
      cycles,
      recursiveFunctions,
    };
  }

  /**
   * 获取递归类型
   */
  getRecursionType(funcName, callees) {
    // 直接递归：函数调用自己
    if (callees.has(funcName)) {
      // 检查是否是尾递归
      const funcInfo = this.functionInfo.get(funcName);
      if (funcInfo && funcInfo.line) {
        return 'direct-recursion';
      }
    }
    return 'indirect-recursion';
  }

  /**
   * 生成业务逻辑摘要
   */
  generateBusinessLogicSummary() {
    const entryPoints = this.identifyEntryPoints();
    const criticalPaths = this.identifyCriticalPaths();

    return {
      totalFunctions: this.functionInfo.size,
      totalCalls: Array.from(this.callGraph.values()).reduce((sum, set) => sum + set.size, 0),

      // 业务流程
      businessFlows: entryPoints.map(ep => ({
        name: ep.name,
        type: ep.reason,
        description: this.describeFlow(ep),
      })),

      // 关键业务路径
      criticalFlows: criticalPaths.slice(0, 5).map(cp => ({
        entry: cp.entry,
        steps: cp.path,
        complexity: cp.complexity,
      })),

      // 数据转换点
      transformations: this.identifyTransformations(),

      // 外部交互点
      externalInteractions: this.identifyExternalInteractions(),
    };
  }

  /**
   * 描述业务流程
   */
  describeFlow(entryPoint) {
    const desc = {
      entry: entryPoint.name,
      type: entryPoint.reason,
      steps: [],
    };

    // 提取调用链中的关键步骤
    for (const step of entryPoint.callChain) {
      if (step.purpose && step.purpose.primary !== 'business-logic') {
        desc.steps.push({
          function: step.name,
          purpose: step.purpose.primary,
        });
      }
    }

    return desc;
  }

  /**
   * 识别数据转换点
   */
  identifyTransformations() {
    const transformations = [];

    for (const [funcName, info] of this.functionInfo) {
      if (info.purpose && info.purpose.primary === 'utility') {
        const callers = this.reverseCallGraph.get(funcName);
        if (callers && callers.size > 0) {
          transformations.push({
            name: funcName,
            input: Array.from(callers),
            output: this.callGraph.get(funcName) ?
              Array.from(this.callGraph.get(funcName)) : [],
          });
        }
      }
    }

    return transformations;
  }

  /**
   * 识别外部交互点
   */
  identifyExternalInteractions() {
    const interactions = [];

    for (const [funcName, info] of this.functionInfo) {
      if (info.purpose && (info.purpose.primary === 'api-call' ||
                           info.purpose.primary === 'create' ||
                           info.purpose.primary === 'read' ||
                           info.purpose.primary === 'update' ||
                           info.purpose.primary === 'delete')) {
        interactions.push({
          function: funcName,
          type: info.purpose.primary,
        });
      }
    }

    return interactions;
  }

  /**
   * 获取函数的完整调用上下文
   */
  getFunctionContext(funcName) {
    const info = this.functionInfo.get(funcName);
    if (!info) {
      return null;
    }

    return {
      // 基本信息
      function: info,

      // 调用了哪些函数
      calls: {
        direct: Array.from(this.callGraph.get(funcName) || []),
        transitive: this.getTransitiveCallees(funcName, new Set()),
      },

      // 被哪些函数调用
      calledBy: {
        direct: Array.from(this.reverseCallGraph.get(funcName) || []),
        transitive: this.getTransitiveCallers(funcName, new Set()),
      },

      // 在调用链中的位置
      chainPosition: this.getChainPosition(funcName),
    };
  }

  /**
   * 获取传递性被调用者（递归查找所有被调用的函数）
   */
  getTransitiveCallees(funcName, visited) {
    if (visited.has(funcName)) {
      return [];
    }

    visited.add(funcName);

    const directCallees = this.callGraph.get(funcName) || new Set();
    const result = new Set(directCallees);

    for (const callee of directCallees) {
      const transitive = this.getTransitiveCallees(callee, visited);
      transitive.forEach(c => result.add(c));
    }

    return Array.from(result);
  }

  /**
   * 获取传递性调用者（递归查找所有调用该函数的函数）
   */
  getTransitiveCallers(funcName, visited) {
    if (visited.has(funcName)) {
      return [];
    }

    visited.add(funcName);

    const directCallers = this.reverseCallGraph.get(funcName) || new Set();
    const result = new Set(directCallers);

    for (const caller of directCallers) {
      const transitive = this.getTransitiveCallers(caller, visited);
      transitive.forEach(c => result.add(c));
    }

    return Array.from(result);
  }

  /**
   * 获取函数在调用链中的位置
   */
  getChainPosition(funcName) {
    // 计算从入口点到该函数的平均距离
    const entryPoints = this.identifyEntryPoints();
    let totalDistance = 0;
    let count = 0;

    for (const entry of entryPoints) {
      const distance = this.getDistance(entry.name, funcName, new Set());
      if (distance > 0) {
        totalDistance += distance;
        count++;
      }
    }

    return {
      averageDepth: count > 0 ? totalDistance / count : 0,
      reachableFrom: count,
      isEntry: count === 0 && entryPoints.some(e => e.name === funcName),
    };
  }

  /**
   * 计算两个函数之间的距离
   */
  getDistance(from, to, visited) {
    if (from === to) return 0;
    if (visited.has(from)) return -1;

    visited.add(from);

    const callees = this.callGraph.get(from) || new Set();

    for (const callee of callees) {
      if (callee === to) {
        return 1;
      }

      const dist = this.getDistance(callee, to, new Set(visited));
      if (dist > 0) {
        return dist + 1;
      }
    }

    return -1;
  }

  /**
   * 生成可视化的 DOT 格式
   */
  toDot() {
    const lines = ['digraph CallGraph {'];
    lines.push('  rankdir=TB;'); // 从上到下
    lines.push('  node [shape=box];');

    // 添加节点
    for (const [funcName, info] of this.functionInfo) {
      const label = `${funcName}\\n(${info.purpose?.primary || 'function'})`;
      const color = this.getNodeColor(info);
      lines.push(`  "${funcName}" [label="${label}", ${color}];`);
    }

    // 添加边
    for (const [from, toSet] of this.callGraph) {
      for (const to of toSet) {
        const style = this.isAsyncCall(from, to) ? 'dashed' : 'solid';
        lines.push(`  "${from}" -> "${to}" [style=${style}];`);
      }
    }

    lines.push('}');
    return lines.join('\n');
  }

  /**
   * 获取节点颜色
   */
  getNodeColor(info) {
    if (info.isExported) {
      return 'color=green, style="bold,filled", fillcolor=lightgreen';
    } else if (!info.isPublic) {
      return 'color=gray, style="filled", fillcolor=lightgray';
    } else if (info.isAsync) {
      return 'color=blue, style="filled", fillcolor=lightblue';
    }
    return '';
  }

  /**
   * 检查是否是异步调用
   */
  isAsyncCall(from, to) {
    const fromInfo = this.functionInfo.get(from);
    return fromInfo && fromInfo.isAsync;
  }

  /**
   * 清除缓存
   */
  clearCache() {
    this.callGraph.clear();
    this.reverseCallGraph.clear();
    this.functionInfo.clear();
  }
}

module.exports = CallGraphAnalyzer;
