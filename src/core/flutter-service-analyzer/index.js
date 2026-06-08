/**
 * Flutter Service Layer Analyzer
 *
 * 职责:
 * - 识别 Service 层类
 * - 分析 Service 依赖关系
 * - 检测 Service 方法签名
 * - 分析数据流和业务逻辑
 * - 识别 API 调用
 * - 检测状态管理模式
 *
 * 支持的 Service 类型:
 * - DataService (数据服务)
 * - ApiService (API 服务)
 * - Repository (仓库模式)
 * - Provider/Bloc (状态管理)
 * - Manager (管理器)
 * - Handler (处理器)
 */

const path = require('path');

class FlutterServiceAnalyzer {
  constructor() {
    this.services = new Map(); // 服务注册表
    this.serviceDependencies = new Map(); // 服务依赖
    this.serviceMethods = new Map(); // 服务方法
    this.apiCalls = new Map(); // API 调用
    this.stateManagement = new Map(); // 状态管理
  }

  /**
   * 初始化服务模式注册表
   */
  initServiceRegistry() {
    // Service 命名模式
    this.servicePatterns = {
      // 数据服务
      dataService: {
        patterns: ['DataService', 'DataProvider', 'DataRepository'],
        description: '数据服务',
        commonMethods: ['fetch', 'load', 'save', 'delete', 'update', 'query'],
      },
      // API 服务
      apiService: {
        patterns: ['ApiService', 'ApiClient', 'RestApi', 'HttpService'],
        description: 'API 服务',
        commonMethods: ['get', 'post', 'put', 'delete', 'patch', 'request'],
      },
      // 仓库
      repository: {
        patterns: ['Repository', 'Repo', 'Dao'],
        description: '数据仓库',
        commonMethods: ['findAll', 'findById', 'save', 'update', 'delete', 'count'],
      },
      // 状态管理
      stateProvider: {
        patterns: ['Provider', 'Bloc', 'Cubit', 'Controller', 'Store', 'Notifier'],
        description: '状态管理',
        commonMethods: ['emit', 'notifyListeners', 'update', 'setState', 'dispatch'],
      },
      // 管理器
      manager: {
        patterns: ['Manager', 'Handler', 'Processor', 'Coordinator'],
        description: '管理器',
        commonMethods: ['handle', 'process', 'execute', 'manage', 'coordinate'],
      },
      // 工具服务
      utilityService: {
        patterns: ['Utils', 'Helper', 'Util', 'Converter', 'Parser', 'Validator'],
        description: '工具服务',
        commonMethods: ['parse', 'format', 'validate', 'convert', 'transform'],
      },
    };

    // 状态管理模式
    this.stateManagementPatterns = {
      provider: ['ChangeNotifier', 'Notifier', 'Provider'],
      bloc: ['Bloc', 'Cubit', 'BlocEvent', 'BlocState'],
      getx: ['GetxController', 'GetConnect'],
      riverpod: ['Riverpod', 'Provider', 'ConsumerWidget', 'ConsumerStatefulWidget'],
      redux: ['Store', 'Middleware', 'Reducer'],
      mobx: ['Observable', 'Computed', 'Action'],
    };

    // 常见的异步操作标记
    this.asyncMarkers = [
      'Future', 'async', 'await', 'Stream', 'async*', 'yield',
      'then', 'catchError', 'whenComplete'
    ];

    // HTTP/Dio 方法标记
    this.httpMarkers = [
      'http.get', 'http.post', 'http.put', 'http.delete', 'http.patch',
      'dio.get', 'dio.post', 'dio.put', 'dio.delete', 'dio.patch',
      'request(', 'fetch(', 'axios.'
    ];
  }

  /**
   * 分析项目中的 Service 层
   * @param {Array} files - Dart 文件列表
   * @returns {Object} Service 层分析结果
   */
  analyzeServiceLayer(files) {
    this.clearCache();
    this.initServiceRegistry();

    // 1. 识别所有 Service 类
    this.identifyServices(files);

    // 2. 分析 Service 方法
    this.analyzeServiceMethods(files);

    // 3. 分析 Service 依赖
    this.analyzeServiceDependencies(files);

    // 4. 分析 API 调用
    this.analyzeApiCalls(files);

    // 5. 识别状态管理模式
    this.identifyStateManagement(files);

    // 6. 构建 Service 依赖图
    const dependencyGraph = this.buildServiceDependencyGraph();

    // 7. 生成统计信息
    const statistics = this.generateStatistics();

    return {
      services: Array.from(this.services.values()),
      methods: this.getServiceMethodsList(),
      dependencies: dependencyGraph,
      apiCalls: this.getApiCallsList(),
      stateManagement: this.getStateManagementInfo(),
      statistics,
    };
  }

  /**
   * 识别所有 Service 类
   */
  identifyServices(files) {
    let serviceId = 0;

    for (const file of files) {
      const content = file.content;
      const filePath = file.path;

      // 提取类定义
      const classPattern = /class\s+(\w+)\s*(?:extends\s+(\w+))?(?:\s+with\s+([\w\s]+))?(?:\s+implements\s+([\w\s]+))?\s*\{/g;
      let match;
      let iterations = 0;
      const MAX_ITERATIONS = 1000; // 防止无限循环

      while ((match = classPattern.exec(content)) !== null && iterations < MAX_ITERATIONS) {
        iterations++;
        const className = match[1];
        const superClass = match[2] || null;
        const mixins = match[3] || null;
        const interfaces = match[4] || null;

        const serviceType = this.classifyService(className, superClass, mixins, interfaces);

        if (serviceType) {
          // 提取类的位置
          const line = this.getLineNumber(content, match.index);
          const classBody = this.extractClassBody(content, match.index);

          const service = {
            id: `svc_${serviceId++}`,
            name: className,
            superClass,
            mixins,
            interfaces,
            serviceType,
            filePath,
            fileName: path.basename(filePath),
            line,
            body: classBody,
            isAsync: this.isAsyncService(classBody),
            isSingleton: this.isSingletonService(classBody),
            methods: [],
          };

          this.services.set(className, service);
        }
      }
    }
  }

  /**
   * 分类 Service 类
   */
  classifyService(className, superClass, mixins, interfaces) {
    const name = className.toLowerCase();
    const parent = superClass ? superClass.toLowerCase() : '';
    const mixin = mixins ? mixins.toLowerCase() : '';
    const iface = interfaces ? interfaces.toLowerCase() : '';

    // 检查命名模式
    for (const [type, config] of Object.entries(this.servicePatterns)) {
      for (const pattern of config.patterns) {
        if (name.includes(pattern.toLowerCase()) ||
            parent.includes(pattern.toLowerCase()) ||
            mixin.includes(pattern.toLowerCase()) ||
            iface.includes(pattern.toLowerCase())) {
          return type;
        }
      }
    }

    // 检查父类
    if (superClass) {
      if (parent.includes('repository') || parent.includes('dao')) {
        return 'repository';
      }
      if (parent.includes('provider') || parent.includes('bloc')) {
        return 'stateProvider';
      }
    }

    // 检查 mixin
    if (mixins) {
      if (mixin.includes('changenotifier')) {
        return 'stateProvider';
      }
    }

    return null; // 不是 Service 类
  }

  /**
   * 判断是否是异步 Service
   */
  isAsyncService(classBody) {
    // 检查是否包含 Future 或 Stream 方法
    const futurePattern = /\bFuture\s*</g;
    const streamPattern = /\bStream\s*</g;
    const asyncPattern = /\basync\s+/g;

    return futurePattern.test(classBody) ||
           streamPattern.test(classBody) ||
           asyncPattern.test(classBody);
  }

  /**
   * 判断是否是单例 Service
   */
  isSingletonService(classBody) {
    // 检查单例模式
    const patterns = [
      /static\s+\w+\s*_instance\b/,
      /static\s+\w+\s*get\s+instance\b/,
      /factory\s+\w+\s*\(\)/,
      /\bsingleton\b/,
    ];

    for (const pattern of patterns) {
      if (pattern.test(classBody)) {
        return true;
      }
    }

    return false;
  }

  /**
   * 分析 Service 方法
   */
  analyzeServiceMethods(files) {
    for (const file of files) {
      const content = file.content;
      const filePath = file.path;

      // 为每个 Service 提取方法
      for (const [serviceName, service] of this.services) {
        if (service.filePath !== filePath) continue;

        const methods = this.extractMethods(content, service);
        service.methods = methods;

        // 存储方法信息
        if (!this.serviceMethods.has(serviceName)) {
          this.serviceMethods.set(serviceName, []);
        }
        this.serviceMethods.set(serviceName, methods);
      }
    }
  }

  /**
   * 提取类的方法
   */
  extractMethods(content, service) {
    const methods = [];
    const className = service.name;

    // Dart 关键字，需要排除
    const dartKeywords = new Set([
      'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue',
      'return', 'try', 'catch', 'finally', 'throw', 'when', 'await', 'yield',
      'import', 'export', 'library', 'part', 'of', 'as', 'is', 'in', 'null',
      'true', 'false', 'new', 'const', 'var', 'let', 'late',
      'class', 'enum', 'mixin', 'extension', 'typedef', 'abstract', 'implements',
      'extends', 'with', 'from', 'show', 'hide', 'sync', 'async', 'assert',
      'super', 'this', 'factory', 'operator', 'external', 'covariant', 'required',
      'on', 'native', 'rethrow', 'default'
    ]);

    // 匹配方法定义
    const methodPattern = new RegExp(
      `(?:static|final|const)?\\s*` +
      `(?:\\w+\\s+(?:<[^>]+>)?\\s+)?` +
      `(\\w+)\\s*\\(` +
      `[^)]*\\)\\s*(?:async\\*)?\\s*(?:async)?\\s*\\{`,
      'g'
    );

    let match;
    const methodStartPositions = [];
    let iterations = 0;
    const MAX_ITERATIONS = 1000; // 防止无限循环

    while ((match = methodPattern.exec(content)) !== null && iterations < MAX_ITERATIONS) {
      iterations++;
      const methodName = match[1];
      const startPos = match.index;

      // 跳过构造函数、非公开方法和 Dart 关键字
      if (methodName === className ||
          methodName.startsWith('_') ||
          dartKeywords.has(methodName)) {
        continue;
      }

      // 检查是否在类体内
      const classStart = content.indexOf(service.body);
      const classEnd = classStart + service.body.length;

      if (startPos >= classStart && startPos <= classEnd) {
        methodStartPositions.push({
          name: methodName,
          start: startPos,
        });
      }
    }

    // 提取方法详情
    for (const methodInfo of methodStartPositions) {
      const methodDetails = this.analyzeMethod(content, methodInfo);
      if (methodDetails) {
        methods.push(methodDetails);
      }
    }

    return methods;
  }

  /**
   * 分析单个方法
   */
  analyzeMethod(content, methodInfo) {
    const { name, start } = methodInfo;
    const line = this.getLineNumber(content, start);

    // 提取方法签名
    const signatureMatch = content.substring(start).match(/^[^{]*\{/);
    const signature = signatureMatch ? signatureMatch[0].trim() : '';

    // 检查返回类型
    const returnType = this.extractReturnType(signature);

    // 检查是否是异步方法
    const isAsync = signature.includes('async') || returnType.includes('Future') || returnType.includes('Stream');

    // 检查参数
    const parameters = this.extractParameters(signature);

    // 检查是否包含 API 调用
    const hasApiCall = this.containsApiCall(content, start);

    // 检查是否包含数据库操作
    const hasDbOperation = this.containsDbOperation(content, start);

    // 检查是否包含状态更新
    const hasStateUpdate = this.containsStateUpdate(content, start);

    return {
      name,
      line,
      signature,
      returnType,
      isAsync,
      parameters,
      hasApiCall,
      hasDbOperation,
      hasStateUpdate,
    };
  }

  /**
   * 提取返回类型
   */
  extractReturnType(signature) {
    const match = signature.match(/(\w+(?:<[^>]+>)?)\s+\w+\s*\(/);
    return match ? match[1] : 'void';
  }

  /**
   * 提取方法参数
   */
  extractParameters(signature) {
    const params = [];
    const paramsMatch = signature.match(/\(([^)]*)\)/);

    if (paramsMatch && paramsMatch[1].trim()) {
      const paramStrings = paramsMatch[1].split(',').map(s => s.trim());

      for (const paramStr of paramStrings) {
        const parts = paramStr.split(/\s+/);
        if (parts.length >= 2) {
          params.push({
            type: parts[0],
            name: parts[1],
          });
        }
      }
    }

    return params;
  }

  /**
   * 检查是否包含 API 调用
   */
  containsApiCall(content, methodStart) {
    const methodEnd = this.findMethodEnd(content, methodStart);
    const methodContent = content.substring(methodStart, methodEnd);

    for (const marker of this.httpMarkers) {
      if (methodContent.includes(marker)) {
        return true;
      }
    }

    return false;
  }

  /**
   * 检查是否包含数据库操作
   */
  containsDbOperation(content, methodStart) {
    const methodEnd = this.findMethodEnd(content, methodStart);
    const methodContent = content.substring(methodStart, methodEnd);

    const dbMarkers = [
      '.insert(', '.update(', '.delete(', '.query(',
      'database.', 'db.', 'sqflite', 'hive', 'isar',
      'collection.', 'doc(', 'set(', 'get(',
    ];

    for (const marker of dbMarkers) {
      if (methodContent.includes(marker)) {
        return true;
      }
    }

    return false;
  }

  /**
   * 检查是否包含状态更新
   */
  containsStateUpdate(content, methodStart) {
    const methodEnd = this.findMethodEnd(content, methodStart);
    const methodContent = content.substring(methodStart, methodEnd);

    const stateMarkers = [
      'notifyListeners()', 'emit(', 'setState(', 'update(',
      'store.dispatch(', 'context.read', 'ref.read',
    ];

    for (const marker of stateMarkers) {
      if (methodContent.includes(marker)) {
        return true;
      }
    }

    return false;
  }

  /**
   * 查找方法结束位置
   */
  findMethodEnd(content, methodStart) {
    let braceCount = 0;
    let foundStart = false;

    for (let i = methodStart; i < content.length; i++) {
      if (content[i] === '{') {
        foundStart = true;
        braceCount++;
      } else if (content[i] === '}') {
        braceCount--;
        if (braceCount === 0 && foundStart) {
          return i + 1;
        }
      }
    }

    return content.length;
  }

  /**
   * 分析 Service 依赖
   */
  analyzeServiceDependencies(files) {
    for (const file of files) {
      const content = file.content;

      for (const [serviceName, service] of this.services) {
        if (service.filePath !== file.path) continue;

        const dependencies = this.extractDependencies(content, service);
        this.serviceDependencies.set(serviceName, dependencies);
      }
    }
  }

  /**
   * 提取 Service 依赖
   */
  extractDependencies(content, service) {
    const dependencies = [];
    const classBody = service.body;

    // 检查字段声明
    const fieldPattern = /(?:final|late)\s+(\w+(?:<[^>]+>)?)\s+(\w+)\s*;/g;
    let match;
    let iterations = 0;
    const MAX_ITERATIONS = 1000; // 防止无限循环

    while ((match = fieldPattern.exec(classBody)) !== null && iterations < MAX_ITERATIONS) {
      iterations++;
      const fieldType = match[1];
      const fieldName = match[2];

      // 检查是否是其他 Service
      for (const [otherService, otherSvc] of this.services) {
        if (otherService === service.name) continue;

        if (fieldType.includes(otherService) ||
            fieldName.toLowerCase().includes(otherService.toLowerCase())) {
          dependencies.push({
            type: 'field',
            service: otherService,
            field: fieldName,
            fieldType,
          });
        }
      }
    }

    // 检查构造函数注入
    const ctorPattern = new RegExp(
      `${service.name}\\s*\\(([^)]*)\\)`,
      'g'
    );

    const ctorMatch = ctorPattern.exec(content);
    if (ctorMatch && ctorMatch[1]) {
      const params = ctorMatch[1].split(',').map(s => s.trim());

      for (const param of params) {
        const parts = param.split(/\s+/);
        if (parts.length >= 2) {
          const paramType = parts[0];
          const paramName = parts[1];

          for (const [otherService, otherSvc] of this.services) {
            if (otherService === service.name) continue;

            if (paramType.includes(otherService) ||
                paramType === 'this.' + otherService.toLowerCase()) {
              dependencies.push({
                type: 'constructor',
                service: otherService,
                parameter: paramName,
                paramType,
              });
            }
          }
        }
      }
    }

    return dependencies;
  }

  /**
   * 分析 API 调用
   */
  analyzeApiCalls(files) {
    for (const file of files) {
      const content = file.content;

      for (const [serviceName, service] of this.services) {
        if (service.filePath !== file.path) continue;

        const apiCalls = this.extractApiCalls(content, service);
        this.apiCalls.set(serviceName, apiCalls);
      }
    }
  }

  /**
   * 提取 API 调用
   */
  extractApiCalls(content, service) {
    const apiCalls = [];
    const classBody = service.body;

    const MAX_ITERATIONS = 1000; // 防止无限循环

    // HTTP 方法模式
    const httpPattern = /(?:http|dio|client)\.(\w+)\s*\(\s*['"]([^'"]+)['"]/g;
    let match;
    let iterations = 0;

    while ((match = httpPattern.exec(classBody)) !== null && iterations < MAX_ITERATIONS) {
      iterations++;
      const method = match[1].toUpperCase();
      const url = match[2];
      const line = this.getLineNumber(content, match.index + service.body.indexOf(classBody));

      apiCalls.push({
        method,
        url,
        line,
        type: 'http',
      });
    }

    // Repository 调用模式
    const repoPattern = /(\w+Repository)\.(\w+)\s*\(/g;
    iterations = 0;
    while ((match = repoPattern.exec(classBody)) !== null && iterations < MAX_ITERATIONS) {
      iterations++;
      const repo = match[1];
      const method = match[2];
      const line = this.getLineNumber(content, match.index + service.body.indexOf(classBody));

      apiCalls.push({
        method,
        repository: repo,
        line,
        type: 'repository',
      });
    }

    return apiCalls;
  }

  /**
   * 识别状态管理模式
   */
  identifyStateManagement(files) {
    for (const file of files) {
      const content = file.content;

      for (const [serviceName, service] of this.services) {
        if (service.filePath !== file.path) continue;

        const patterns = this.detectStatePatterns(content, service);
        if (patterns.length > 0) {
          this.stateManagement.set(serviceName, patterns);
        }
      }
    }
  }

  /**
   * 检测状态管理模式
   */
  detectStatePatterns(content, service) {
    const patterns = [];
    const classBody = service.body;
    const className = service.name;

    for (const [framework, markers] of Object.entries(this.stateManagementPatterns)) {
      for (const marker of markers) {
        // 检查类名
        if (className.toLowerCase().includes(marker.toLowerCase())) {
          patterns.push({
            framework,
            marker,
            source: 'className',
          });
        }

        // 检查父类
        if (service.superClass && service.superClass.includes(marker)) {
          patterns.push({
            framework,
            marker,
            source: 'superClass',
          });
        }

        // 检查 mixin
        if (service.mixins && service.mixins.includes(marker)) {
          patterns.push({
            framework,
            marker,
            source: 'mixin',
          });
        }

        // 检查类体中的使用
        if (classBody.includes(marker)) {
          const alreadyAdded = patterns.some(p =>
            p.framework === framework && p.marker === marker
          );
          if (!alreadyAdded) {
            patterns.push({
              framework,
              marker,
              source: 'usage',
            });
          }
        }
      }
    }

    return patterns;
  }

  /**
   * 构建 Service 依赖图
   */
  buildServiceDependencyGraph() {
    const graph = {
      nodes: [],
      edges: [],
    };

    // 添加节点
    for (const [name, service] of this.services) {
      graph.nodes.push({
        id: service.id,
        name: service.name,
        type: service.serviceType,
        isAsync: service.isAsync,
        isSingleton: service.isSingleton,
        methodCount: service.methods.length,
      });
    }

    // 添加边
    for (const [serviceName, dependencies] of this.serviceDependencies) {
      const service = this.services.get(serviceName);
      if (!service) continue;

      for (const dep of dependencies) {
        const depService = this.services.get(dep.service);
        if (depService) {
          graph.edges.push({
            from: service.id,
            to: depService.id,
            type: dep.type,
          });
        }
      }
    }

    return graph;
  }

  /**
   * 生成统计信息
   */
  generateStatistics() {
    const stats = {
      totalServices: this.services.size,
      byType: {},
      asyncServices: 0,
      singletonServices: 0,
      totalMethods: 0,
      apiCallsCount: 0,
      stateManagementUsage: {},
    };

    for (const service of this.services.values()) {
      // 按类型统计
      const type = service.serviceType;
      stats.byType[type] = (stats.byType[type] || 0) + 1;

      // 异步服务
      if (service.isAsync) stats.asyncServices++;

      // 单例服务
      if (service.isSingleton) stats.singletonServices++;

      // 方法总数
      stats.totalMethods += service.methods.length;
    }

    // API 调用统计
    for (const calls of this.apiCalls.values()) {
      stats.apiCallsCount += calls.length;
    }

    // 状态管理使用统计
    for (const patterns of this.stateManagement.values()) {
      for (const pattern of patterns) {
        stats.stateManagementUsage[pattern.framework] =
          (stats.stateManagementUsage[pattern.framework] || 0) + 1;
      }
    }

    return stats;
  }

  /**
   * 获取 Service 方法列表
   */
  getServiceMethodsList() {
    const list = [];

    for (const [serviceName, methods] of this.serviceMethods) {
      for (const method of methods) {
        list.push({
          service: serviceName,
          ...method,
        });
      }
    }

    return list;
  }

  /**
   * 获取 API 调用列表
   */
  getApiCallsList() {
    const list = [];

    for (const [serviceName, calls] of this.apiCalls) {
      for (const call of calls) {
        list.push({
          service: serviceName,
          ...call,
        });
      }
    }

    return list;
  }

  /**
   * 获取状态管理信息
   */
  getStateManagementInfo() {
    const info = [];

    for (const [serviceName, patterns] of this.stateManagement) {
      info.push({
        service: serviceName,
        patterns,
      });
    }

    return info;
  }

  /**
   * 生成 Mermaid 格式的 Service 依赖图
   */
  toMermaid(options = {}) {
    const {
      showMethods = false,
      clusterByType = true,
    } = options;

    const lines = ['graph TD'];

    // 添加节点
    for (const [name, service] of this.services) {
      let label = service.name;
      if (showMethods) {
        label += `\\n(${service.methods.length} methods)`;
      }

      // 添加样式
      let style = '';
      if (service.isAsync) {
        style += ':::async';
      }
      if (service.isSingleton) {
        style += ':::singleton';
      }

      lines.push(`  "${service.id}"[${label}]${style}`);
    }

    // 添加边
    for (const [serviceName, dependencies] of this.serviceDependencies) {
      const service = this.services.get(serviceName);
      if (!service) continue;

      for (const dep of dependencies) {
        const depService = this.services.get(dep.service);
        if (depService) {
          const lineStyle = dep.type === 'constructor' ? '' : '.- ';
          lines.push(`  "${service.id}" ${lineStyle}--> "${depService.id}"`);
        }
      }
    }

    // 添加样式定义
    lines.push('');
    lines.push('classDef async fill:#ffe6e6,stroke:#ff6b6b,stroke-width:2px');
    lines.push('classDef singleton fill:#fff4e6,stroke:#ffa940,stroke-width:2px');
    lines.push('classDef default fill:#f0f0f0,stroke:#999,stroke-width:1px');

    return lines.join('\n');
  }

  /**
   * 提取类体
   */
  extractClassBody(content, startPos) {
    let braceCount = 0;
    let foundStart = false;
    let endPos = startPos;

    for (let i = startPos; i < content.length; i++) {
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

    return content.substring(startPos, endPos);
  }

  /**
   * 获取行号
   */
  getLineNumber(content, index) {
    const before = content.substring(0, index);
    return before.split('\n').length;
  }

  /**
   * 清除缓存
   */
  clearCache() {
    this.services.clear();
    this.serviceDependencies.clear();
    this.serviceMethods.clear();
    this.apiCalls.clear();
    this.stateManagement.clear();
  }

  /**
   * 分析业务流程 - 追踪跨 Service 方法调用链
   * @returns {Object} 业务流程分析结果
   */
  analyzeBusinessFlows() {
    const flows = [];
    const callChains = new Map();

    // 分析每个方法中的服务调用
    for (const [serviceName, service] of this.services) {
      for (const method of service.methods) {
        const methodCalls = this.extractServiceCalls(service, method);

        if (methodCalls.length > 0) {
          callChains.set(`${serviceName}.${method.name}`, {
            service: serviceName,
            method: method.name,
            calls: methodCalls,
          });
        }
      }
    }

    // 构建完整的调用链
    for (const [key, chain] of callChains) {
      const fullChain = this.buildCallChain(key, callChains);
      if (fullChain.length > 1) {
        flows.push({
          entryPoint: key,
          chain: fullChain,
          depth: fullChain.length - 1,
        });
      }
    }

    return {
      flows,
      statistics: this.generateFlowStatistics(flows),
    };
  }

  /**
   * 提取方法中的服务调用
   */
  extractServiceCalls(service, method) {
    const calls = [];
    const methodBody = this.extractMethodBody(service, method);

    const MAX_ITERATIONS = 1000; // 防止无限循环

    for (const [otherService, otherSvc] of this.services) {
      if (otherService === service.name) continue;

      // 检查方法调用
      const callPattern = new RegExp(
        `(?:await\\s+)?(?:this\\._?\\w+\\.)?(${otherService}|${otherService.toLowerCase()})\\.(\\w+)\\s*\\(`,
        'g'
      );

      let match;
      let iterations = 0;
      while ((match = callPattern.exec(methodBody)) !== null && iterations < MAX_ITERATIONS) {
        iterations++;
        calls.push({
          service: otherService,
          method: match[2],
          line: this.getLineNumber(service.body, match.index),
        });
      }

      // 检查依赖字段调用
      for (const dep of (this.serviceDependencies.get(service.name) || [])) {
        if (dep.service === otherService) {
          const fieldPattern = new RegExp(
            `(?:await\\s+)?${dep.field}\\.(${otherService.toLowerCase()}|\\w+)\\s*\\(`,
            'g'
          );

          iterations = 0;
          while ((match = fieldPattern.exec(methodBody)) !== null && iterations < MAX_ITERATIONS) {
            iterations++;
            calls.push({
              service: otherService,
              method: match[1],
              line: this.getLineNumber(service.body, match.index),
              via: dep.field,
            });
          }
        }
      }
    }

    return calls;
  }

  /**
   * 提取方法体
   */
  extractMethodBody(service, method) {
    const content = service.body;
    const methodName = method.name;

    // 简化处理：查找方法名后的第一个 { 到对应的 }
    const methodStart = content.indexOf(`${methodName}(`);
    if (methodStart === -1) return '';

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
   * 构建完整的调用链
   */
  buildCallChain(entryKey, callChains, visited = new Set()) {
    const chain = [entryKey];
    const chainData = callChains.get(entryKey);

    if (!chainData || visited.has(entryKey)) {
      return chain;
    }

    visited.add(entryKey);

    for (const call of chainData.calls) {
      const nextKey = `${call.service}.${call.method}`;
      if (callChains.has(nextKey)) {
        const subChain = this.buildCallChain(nextKey, callChains, new Set(visited));
        chain.push(...subChain);
      }
    }

    return chain;
  }

  /**
   * 生成流程统计
   */
  generateFlowStatistics(flows) {
    return {
      totalFlows: flows.length,
      avgDepth: flows.length > 0
        ? Math.round(flows.reduce((sum, f) => sum + f.depth, 0) / flows.length)
        : 0,
      maxDepth: flows.length > 0
        ? Math.max(...flows.map(f => f.depth))
        : 0,
      complexFlows: flows.filter(f => f.depth > 3).length,
    };
  }

  /**
   * 分析业务规则 - 从方法中提取业务逻辑
   * @returns {Object} 业务规则分析结果
   */
  analyzeBusinessRules() {
    const rules = [];

    for (const [serviceName, service] of this.services) {
      for (const method of service.methods) {
        const methodRules = this.extractBusinessRules(service, method);
        if (methodRules.length > 0) {
          rules.push({
            service: serviceName,
            method: method.name,
            rules: methodRules,
          });
        }
      }
    }

    return {
      rules,
      byCategory: this.categorizeRules(rules),
    };
  }

  /**
   * 提取业务规则
   */
  extractBusinessRules(service, method) {
    const rules = [];
    const methodBody = this.extractMethodBody(service, method);

    // 验证规则
    const validationPatterns = [
      { pattern: /if\s*\([^)]*==\s*null\)/g, type: 'null_check' },
      { pattern: /if\s*\([^)]*\.isEmpty\)/g, type: 'empty_check' },
      { pattern: /if\s*\([^)]*\.length\s*[<>]=?\s*\d+/g, type: 'length_check' },
      { pattern: /assert\s*\(/g, type: 'assertion' },
    ];

    for (const { pattern, type } of validationPatterns) {
      if (pattern.test(methodBody)) {
        rules.push({ type: 'validation', rule: type });
      }
    }

    // 条件逻辑
    if (methodBody.includes('if (') && methodBody.includes('else')) {
      rules.push({ type: 'conditional', rule: 'branching_logic' });
    }

    // 异常处理
    if (methodBody.includes('try {') || methodBody.includes('catch')) {
      rules.push({ type: 'error_handling', rule: 'exception_handling' });
    }

    // 状态转换
    if (methodBody.includes('emit(') || methodBody.includes('notifyListeners()')) {
      rules.push({ type: 'state_change', rule: 'state_transition' });
    }

    // 异步操作
    if (methodBody.includes('await')) {
      rules.push({ type: 'async_operation', rule: 'async_execution' });
    }

    return rules;
  }

  /**
   * 分类规则
   */
  categorizeRules(rules) {
    const categories = {
      validation: 0,
      conditional: 0,
      error_handling: 0,
      state_change: 0,
      async_operation: 0,
    };

    for (const ruleGroup of rules) {
      for (const rule of ruleGroup.rules) {
        if (categories[rule.type] !== undefined) {
          categories[rule.type]++;
        }
      }
    }

    return categories;
  }

  /**
   * 生成服务健康报告
   * @returns {Object} 服务健康报告
   */
  generateHealthReport() {
    const report = {
      overall: 'healthy',
      issues: [],
      warnings: [],
      recommendations: [],
    };

    // 检查服务复杂度
    for (const [serviceName, service] of this.services) {
      if (service.methods.length > 15) {
        report.warnings.push({
          type: 'high_complexity',
          service: serviceName,
          message: `${serviceName} 包含 ${service.methods.length} 个方法，可能需要拆分`,
        });
      }

      // 检查是否有太多依赖
      const deps = this.serviceDependencies.get(serviceName) || [];
      if (deps.length > 5) {
        report.warnings.push({
          type: 'high_coupling',
          service: serviceName,
          message: `${serviceName} 依赖 ${deps.length} 个其他服务`,
        });
      }

      // 检查是否缺少异步处理
      if (!service.isAsync && service.serviceType !== 'utilityService') {
        report.warnings.push({
          type: 'sync_operation',
          service: serviceName,
          message: `${serviceName} 不是异步服务，可能阻塞 UI`,
        });
      }
    }

    // 检查循环依赖
    const circularDeps = this.detectCircularDependencies();
    if (circularDeps.length > 0) {
      report.issues.push({
        type: 'circular_dependency',
        message: `检测到 ${circularDeps.length} 个循环依赖`,
        details: circularDeps,
      });
      report.overall = 'unhealthy';
    } else if (report.warnings.length > 0) {
      report.overall = 'warning';
    }

    // 生成建议
    if (this.services.size === 0) {
      report.recommendations.push({
        type: 'architecture',
        message: '未检测到 Service 层，考虑添加业务逻辑层',
      });
    } else {
      const stateManagementServices = Array.from(this.services.values())
        .filter(s => s.serviceType === 'stateProvider')
        .length;

      if (stateManagementServices === 0) {
        report.recommendations.push({
          type: 'state_management',
          message: '未检测到状态管理，考虑添加 Provider/Bloc 等',
        });
      }
    }

    return report;
  }

  /**
   * 检测循环依赖
   */
  detectCircularDependencies() {
    const cycles = [];

    for (const [serviceName, dependencies] of this.serviceDependencies) {
      for (const dep of dependencies) {
        // 检查反向依赖
        const reverseDeps = this.serviceDependencies.get(dep.service) || [];
        for (const reverseDep of reverseDeps) {
          if (reverseDep.service === serviceName) {
            cycles.push({
              service1: serviceName,
              service2: dep.service,
              type: 'bidirectional',
            });
          }
        }
      }
    }

    return cycles;
  }
}

module.exports = FlutterServiceAnalyzer;
