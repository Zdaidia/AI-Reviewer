/**
 * Flutter Repository Layer Analyzer
 *
 * 职责:
 * - 识别 Repository 层类
 * - 分析数据源（本地、远程）
 * - 识别 CRUD 操作
 * - 分析缓存策略
 * - 检测数据转换逻辑
 * - 分析数据流
 * - 识别数据访问模式
 *
 * 支持的 Repository 类型:
 * - Repository (通用仓库)
 * - DataSource (数据源)
 * - Dao (数据访问对象)
 * - Cache (缓存)
 * - Storage (存储)
 */

const path = require('path');

class FlutterRepositoryAnalyzer {
  constructor() {
    this.repositories = new Map(); // 仓库注册表
    this.repositoryMethods = new Map(); // 仓库方法
    this.dataSources = new Map(); // 数据源
    this.crudOperations = new Map(); // CRUD 操作
    this.cacheStrategies = new Map(); // 缓存策略
    this.dataTransformations = new Map(); // 数据转换
  }

  /**
   * 初始化 Repository 模式注册表
   */
  initRepositoryRegistry() {
    // Repository 命名模式
    this.repositoryPatterns = {
      repository: {
        patterns: ['Repository', 'Repo', 'RepositoryImpl'],
        description: '数据仓库',
        commonMethods: ['findAll', 'findById', 'save', 'update', 'delete', 'query'],
      },
      dataSource: {
        patterns: ['DataSource', 'RemoteDataSource', 'LocalDataSource', 'ApiDataSource'],
        description: '数据源',
        commonMethods: ['fetch', 'get', 'post', 'put', 'delete'],
      },
      dao: {
        patterns: ['Dao', 'DAO', 'DatabaseDao'],
        description: '数据访问对象',
        commonMethods: ['insert', 'update', 'delete', 'query', 'selectAll'],
      },
      cache: {
        patterns: ['Cache', 'CacheService', 'CacheManager'],
        description: '缓存',
        commonMethods: ['get', 'set', 'remove', 'clear', 'has'],
      },
      storage: {
        patterns: ['Storage', 'StorageService', 'PreferenceService', 'SecureStorage'],
        description: '存储',
        commonMethods: ['read', 'write', 'delete', 'containsKey'],
      },
    };

    // 数据源类型
    this.dataSourceTypes = {
      remote: ['api', 'http', 'remote', 'network', 'server', 'cloud'],
      local: ['local', 'database', 'db', 'sqlite', 'hive', 'shared', 'preference', 'secure'],
      cache: ['cache', 'memory', 'temp'],
    };

    // CRUD 操作模式
    this.crudPatterns = {
      create: ['create', 'insert', 'add', 'save', 'post'],
      read: ['find', 'get', 'read', 'fetch', 'query', 'select', 'load'],
      update: ['update', 'edit', 'modify', 'put', 'patch'],
      delete: ['delete', 'remove', 'destroy'],
    };

    // 数据库操作标记
    this.dbMarkers = [
      'sqflite', 'sqlite', 'hive', 'isar', 'objectbox', 'realm',
      'floor', 'drift', 'moor', 'database(', 'db.', 'collection.',
      'insert(', 'update(', 'delete(', 'query(',
    ];

    // 缓存策略标记
    this.cacheMarkers = [
      'cache', 'Cache', 'expire', 'ttl', 'maxAge', 'refresh',
      'memory', 'localStorage', 'sharedPreferences',
    ];
  }

  /**
   * 分析项目中的 Repository 层
   * @param {Array} files - Dart 文件列表
   * @returns {Object} Repository 层分析结果
   */
  analyzeRepositoryLayer(files) {
    this.clearCache();
    this.initRepositoryRegistry();

    // 1. 识别所有 Repository 类
    this.identifyRepositories(files);

    // 2. 分析 Repository 方法
    this.analyzeRepositoryMethods(files);

    // 3. 分析数据源
    this.analyzeDataSources(files);

    // 4. 分析 CRUD 操作
    this.analyzeCrudOperations(files);

    // 5. 分析缓存策略
    this.analyzeCacheStrategies(files);

    // 6. 分析数据转换
    this.analyzeDataTransformations(files);

    // 7. 生成统计信息
    const statistics = this.generateStatistics();

    return {
      repositories: Array.from(this.repositories.values()),
      methods: this.getRepositoryMethodsList(),
      dataSources: this.getDataSourcesList(),
      crudOperations: this.getCrudOperationsList(),
      cacheStrategies: this.getCacheStrategiesList(),
      dataTransformations: this.getDataTransformationsList(),
      statistics,
    };
  }

  /**
   * 识别所有 Repository 类
   */
  identifyRepositories(files) {
    let repoId = 0;

    for (const file of files) {
      const content = file.content;
      const filePath = file.path;

      // 提取类定义
      const classPattern = /class\s+(\w+)\s*(?:extends\s+(\w+))?(?:\s+with\s+([\w\s]+))?(?:\s+implements\s+([\w\s]+))?\s*\{/g;
      let match;

      while ((match = classPattern.exec(content)) !== null) {
        const className = match[1];
        const superClass = match[2] || null;
        const interfaces = match[4] || null;

        const repositoryType = this.classifyRepository(className, superClass, interfaces);

        if (repositoryType) {
          const line = this.getLineNumber(content, match.index);
          const classBody = this.extractClassBody(content, match.index);

          const repository = {
            id: `repo_${repoId++}`,
            name: className,
            superClass,
            interfaces,
            repositoryType,
            filePath,
            fileName: path.basename(filePath),
            line,
            body: classBody,
            dataSourceType: this.identifyDataSourceType(className, classBody),
            isAbstract: superClass && superClass.toLowerCase().includes('abstract'),
            methods: [],
          };

          this.repositories.set(className, repository);
        }
      }
    }
  }

  /**
   * 分类 Repository 类
   */
  classifyRepository(className, superClass, interfaces) {
    const name = className.toLowerCase();
    const parent = superClass ? superClass.toLowerCase() : '';
    const iface = interfaces ? interfaces.toLowerCase() : '';

    // 检查命名模式
    for (const [type, config] of Object.entries(this.repositoryPatterns)) {
      for (const pattern of config.patterns) {
        if (name.includes(pattern.toLowerCase()) ||
            name.endsWith(pattern.toLowerCase()) ||
            parent.includes(pattern.toLowerCase()) ||
            iface.includes(pattern.toLowerCase())) {
          return type;
        }
      }
    }

    return null;
  }

  /**
   * 识别数据源类型
   */
  identifyDataSourceType(className, classBody) {
    const name = className.toLowerCase();
    const body = classBody.toLowerCase();

    // 检查远程数据源标记
    for (const marker of this.dataSourceTypes.remote) {
      if (name.includes(marker) || body.includes(marker)) {
        return 'remote';
      }
    }

    // 检查本地数据源标记
    for (const marker of this.dataSourceTypes.local) {
      if (name.includes(marker) || body.includes(marker)) {
        return 'local';
      }
    }

    // 检查缓存标记
    for (const marker of this.dataSourceTypes.cache) {
      if (name.includes(marker) || body.includes(marker)) {
        return 'cache';
      }
    }

    return 'unknown';
  }

  /**
   * 分析 Repository 方法
   */
  analyzeRepositoryMethods(files) {
    for (const file of files) {
      const content = file.content;
      const filePath = file.path;

      for (const [repoName, repo] of this.repositories) {
        if (repo.filePath !== filePath) continue;

        const methods = this.extractRepositoryMethods(content, repo);
        repo.methods = methods;

        this.repositoryMethods.set(repoName, methods);
      }
    }
  }

  /**
   * 提取 Repository 方法
   */
  extractRepositoryMethods(content, repo) {
    const methods = [];
    const className = repo.name;

    // Dart 关键字
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
    const methodPositions = [];

    while ((match = methodPattern.exec(content)) !== null) {
      const methodName = match[1];
      const startPos = match.index;

      // 跳过构造函数、非公开方法和 Dart 关键字
      if (methodName === className ||
          methodName.startsWith('_') ||
          dartKeywords.has(methodName)) {
        continue;
      }

      // 检查是否在类体内
      const classStart = content.indexOf(repo.body);
      const classEnd = classStart + repo.body.length;

      if (startPos >= classStart && startPos <= classEnd) {
        methodPositions.push({
          name: methodName,
          start: startPos,
        });
      }
    }

    // 分析方法
    for (const methodInfo of methodPositions) {
      const methodDetails = this.analyzeRepositoryMethod(content, repo, methodInfo);
      if (methodDetails) {
        methods.push(methodDetails);
      }
    }

    return methods;
  }

  /**
   * 分析 Repository 方法
   */
  analyzeRepositoryMethod(content, repo, methodInfo) {
    const { name, start } = methodInfo;
    const line = this.getLineNumber(content, start);

    // 提取方法签名
    const signatureMatch = content.substring(start).match(/^[^{]*\{/);
    const signature = signatureMatch ? signatureMatch[0].trim() : '';

    // 提取返回类型
    const returnType = this.extractReturnType(signature);

    // 检查是否异步
    const isAsync = signature.includes('async') || returnType.includes('Future') || returnType.includes('Stream');

    // 提取参数
    const parameters = this.extractParameters(signature);

    // 识别 CRUD 类型
    const crudType = this.identifyCrudType(name);

    // 检查是否使用缓存
    const usesCache = this.checkCacheUsage(content, start);

    // 检查是否有数据库操作
    const hasDbOperation = this.checkDbOperation(content, start);

    // 检查是否有 API 调用
    const hasApiCall = this.checkApiCall(content, start);

    // 检查是否有数据转换
    const hasTransformation = this.checkDataTransformation(content, start);

    return {
      name,
      line,
      signature,
      returnType,
      isAsync,
      parameters,
      crudType,
      usesCache,
      hasDbOperation,
      hasApiCall,
      hasTransformation,
    };
  }

  /**
   * 识别 CRUD 类型
   */
  identifyCrudType(methodName) {
    const name = methodName.toLowerCase();

    for (const [type, patterns] of Object.entries(this.crudPatterns)) {
      for (const pattern of patterns) {
        if (name.includes(pattern)) {
          return type;
        }
      }
    }

    return 'unknown';
  }

  /**
   * 检查缓存使用
   */
  checkCacheUsage(content, methodStart) {
    const methodEnd = this.findMethodEnd(content, methodStart);
    const methodContent = content.substring(methodStart, methodEnd).toLowerCase();

    for (const marker of this.cacheMarkers) {
      if (methodContent.includes(marker.toLowerCase())) {
        return true;
      }
    }

    return false;
  }

  /**
   * 检查数据库操作
   */
  checkDbOperation(content, methodStart) {
    const methodEnd = this.findMethodEnd(content, methodStart);
    const methodContent = content.substring(methodStart, methodEnd);

    for (const marker of this.dbMarkers) {
      if (methodContent.includes(marker)) {
        return true;
      }
    }

    return false;
  }

  /**
   * 检查 API 调用
   */
  checkApiCall(content, methodStart) {
    const methodEnd = this.findMethodEnd(content, methodStart);
    const methodContent = content.substring(methodStart, methodEnd);

    const apiMarkers = [
      'http.get', 'http.post', 'http.put', 'http.delete',
      'dio.get', 'dio.post', 'dio.put', 'dio.delete',
      'request(', 'fetch(', 'api.', 'service.',
    ];

    for (const marker of apiMarkers) {
      if (methodContent.toLowerCase().includes(marker.toLowerCase())) {
        return true;
      }
    }

    return false;
  }

  /**
   * 检查数据转换
   */
  checkDataTransformation(content, methodStart) {
    const methodEnd = this.findMethodEnd(content, methodStart);
    const methodContent = content.substring(methodStart, methodEnd);

    const transformMarkers = [
      'fromJson', 'toJson', 'map', 'todata',
      '.toMap()', '.fromMap()', 'serialize', 'deserialize',
      'parse', 'format', 'convert',
    ];

    for (const marker of transformMarkers) {
      if (methodContent.toLowerCase().includes(marker.toLowerCase())) {
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
   * 提取返回类型
   */
  extractReturnType(signature) {
    const match = signature.match(/(\w+(?:<[^>]+>)?)\s+\w+\s*\(/);
    return match ? match[1] : 'void';
  }

  /**
   * 提取参数
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
   * 分析数据源
   */
  analyzeDataSources(files) {
    for (const repo of this.repositories.values()) {
      const sources = this.identifyDataSources(repo);
      this.dataSources.set(repo.name, sources);
    }
  }

  /**
   * 识别数据源
   */
  identifyDataSources(repo) {
    const sources = {
      remote: [],
      local: [],
      cache: [],
    };

    // 从依赖中推断数据源
    const dependencies = this.extractDependencies(repo);

    for (const dep of dependencies) {
      const depType = dep.type.toLowerCase();

      if (this.dataSourceTypes.remote.some(m => depType.includes(m))) {
        sources.remote.push(dep);
      } else if (this.dataSourceTypes.local.some(m => depType.includes(m))) {
        sources.local.push(dep);
      } else if (this.dataSourceTypes.cache.some(m => depType.includes(m))) {
        sources.cache.push(dep);
      }
    }

    return sources;
  }

  /**
   * 提取依赖
   */
  extractDependencies(repo) {
    const dependencies = [];
    const classBody = repo.body;

    // 字段依赖
    const fieldPattern = /(?:final|late)\s+(\w+(?:<[^>]+>)?)\s+(?:_\s*)?(\w+)\s*;/g;
    let match;

    while ((match = fieldPattern.exec(classBody)) !== null) {
      const fieldType = match[1];
      const fieldName = match[2];

      dependencies.push({
        type: 'field',
        fieldType,
        fieldName,
      });
    }

    return dependencies;
  }

  /**
   * 分析 CRUD 操作
   */
  analyzeCrudOperations(files) {
    for (const [repoName, methods] of this.repositoryMethods) {
      const crudOps = {
        create: 0,
        read: 0,
        update: 0,
        delete: 0,
        unknown: 0,
      };

      for (const method of methods) {
        if (crudOps[method.crudType] !== undefined) {
          crudOps[method.crudType]++;
        } else {
          crudOps.unknown++;
        }
      }

      this.crudOperations.set(repoName, crudOps);
    }
  }

  /**
   * 分析缓存策略
   */
  analyzeCacheStrategies(files) {
    for (const [repoName, methods] of this.repositoryMethods) {
      const strategies = [];

      for (const method of methods) {
        if (method.usesCache) {
          strategies.push({
            method: method.name,
            type: this.identifyCacheStrategy(repoName, method),
          });
        }
      }

      this.cacheStrategies.set(repoName, strategies);
    }
  }

  /**
   * 识别缓存策略
   */
  identifyCacheStrategy(repoName, method) {
    // 简单的缓存策略识别
    if (method.name.toLowerCase().includes('get') || method.name.toLowerCase().includes('find')) {
      return 'read-through';
    }
    if (method.name.toLowerCase().includes('save') || method.name.toLowerCase().includes('update')) {
      return 'write-through';
    }
    return 'unknown';
  }

  /**
   * 分析数据转换
   */
  analyzeDataTransformations(files) {
    for (const [repoName, methods] of this.repositoryMethods) {
      const transformations = [];

      for (const method of methods) {
        if (method.hasTransformation) {
          transformations.push({
            method: method.name,
            types: this.identifyTransformationTypes(repoName, method),
          });
        }
      }

      this.dataTransformations.set(repoName, transformations);
    }
  }

  /**
   * 识别转换类型
   */
  identifyTransformationTypes(repoName, method) {
    const types = [];

    // 从方法名和返回类型推断
    const name = method.name.toLowerCase();
    const returnType = method.returnType.toLowerCase();

    if (name.includes('json') || returnType.includes('map')) {
      types.push('json');
    }
    if (name.includes('entity') || name.includes('model')) {
      types.push('entity-mapping');
    }
    if (name.includes('dto')) {
      types.push('dto-mapping');
    }

    return types.length > 0 ? types : ['general'];
  }

  /**
   * 生成统计信息
   */
  generateStatistics() {
    const stats = {
      totalRepositories: this.repositories.size,
      byType: {},
      byDataSource: {
        remote: 0,
        local: 0,
        cache: 0,
        unknown: 0,
      },
      totalMethods: 0,
      crudDistribution: {
        create: 0,
        read: 0,
        update: 0,
        delete: 0,
      },
      cacheUsage: 0,
      transformationUsage: 0,
    };

    for (const repo of this.repositories.values()) {
      // 按类型统计
      const type = repo.repositoryType;
      stats.byType[type] = (stats.byType[type] || 0) + 1;

      // 按数据源统计
      stats.byDataSource[repo.dataSourceType]++;

      // 方法总数
      stats.totalMethods += repo.methods.length;
    }

    // CRUD 统计
    for (const crudOps of this.crudOperations.values()) {
      stats.crudDistribution.create += crudOps.create;
      stats.crudDistribution.read += crudOps.read;
      stats.crudDistribution.update += crudOps.update;
      stats.crudDistribution.delete += crudOps.delete;
    }

    // 缓存使用统计
    for (const strategies of this.cacheStrategies.values()) {
      stats.cacheUsage += strategies.length;
    }

    // 转换使用统计
    for (const transformations of this.dataTransformations.values()) {
      stats.transformationUsage += transformations.length;
    }

    return stats;
  }

  /**
   * 获取方法列表
   */
  getRepositoryMethodsList() {
    const list = [];

    for (const [repoName, methods] of this.repositoryMethods) {
      for (const method of methods) {
        list.push({
          repository: repoName,
          ...method,
        });
      }
    }

    return list;
  }

  /**
   * 获取数据源列表
   */
  getDataSourcesList() {
    const list = [];

    for (const [repoName, sources] of this.dataSources) {
      list.push({
        repository: repoName,
        ...sources,
      });
    }

    return list;
  }

  /**
   * 获取 CRUD 操作列表
   */
  getCrudOperationsList() {
    const list = [];

    for (const [repoName, crudOps] of this.crudOperations) {
      list.push({
        repository: repoName,
        ...crudOps,
      });
    }

    return list;
  }

  /**
   * 获取缓存策略列表
   */
  getCacheStrategiesList() {
    const list = [];

    for (const [repoName, strategies] of this.cacheStrategies) {
      for (const strategy of strategies) {
        list.push({
          repository: repoName,
          ...strategy,
        });
      }
    }

    return list;
  }

  /**
   * 获取数据转换列表
   */
  getDataTransformationsList() {
    const list = [];

    for (const [repoName, transformations] of this.dataTransformations) {
      for (const transform of transformations) {
        list.push({
          repository: repoName,
          ...transform,
        });
      }
    }

    return list;
  }

  /**
   * 生成 Mermaid 依赖图
   */
  toMermaid() {
    const lines = ['graph TD'];

    // 添加节点
    for (const [name, repo] of this.repositories) {
      let label = repo.name;
      let style = '';

      // 根据数据源类型设置样式
      switch (repo.dataSourceType) {
        case 'remote':
          style = ':::remote';
          break;
        case 'local':
          style = ':::local';
          break;
        case 'cache':
          style = ':::cache';
          break;
        default:
          style = ':::unknown';
      }

      lines.push(`  "${repo.id}"[${label}]${style}`);
    }

    // 添加样式定义
    lines.push('');
    lines.push('classDef remote fill:#e6f7ff,stroke:#1890ff,stroke-width:2px');
    lines.push('classDef local fill:#f6ffed,stroke:#52c41a,stroke-width:2px');
    lines.push('classDef cache fill:#fff7e6,stroke:#fa8c16,stroke-width:2px');
    lines.push('classDef unknown fill:#f0f0f0,stroke:#999,stroke-width:1px');

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
    this.repositories.clear();
    this.repositoryMethods.clear();
    this.dataSources.clear();
    this.crudOperations.clear();
    this.cacheStrategies.clear();
    this.dataTransformations.clear();
  }

  /**
   * 分析数据流路径 - 追踪数据从源到目的地的完整路径
   * @returns {Object} 数据流路径分析
   */
  analyzeDataFlowPaths() {
    const paths = [];

    // 为每个 CRUD 操作分析数据流
    for (const [repoName, methods] of this.repositoryMethods) {
      const repo = this.repositories.get(repoName);
      if (!repo) continue;

      for (const method of methods) {
        const path = this.analyzeMethodDataFlow(repo, method);
        if (path.steps.length > 0) {
          paths.push({
            repository: repoName,
            method: method.name,
            crudType: method.crudType,
            path,
          });
        }
      }
    }

    return {
      paths,
      patterns: this.identifyDataFlowPatterns(paths),
    };
  }

  /**
   * 分析方法的数据流
   */
  analyzeMethodDataFlow(repo, method) {
    const steps = [];
    const sources = this.dataSources.get(repo.name) || { remote: [], local: [], cache: [] };

    // 分析数据流步骤
    const methodBody = this.extractMethodBodyFromRepo(repo, method);

    // 步骤1: 缓存检查
    if (method.usesCache) {
      steps.push({
        order: 1,
        type: 'cache_check',
        source: 'memory_cache',
        action: 'get',
      });
    }

    // 步骤2: 本地数据源
    if (sources.local.length > 0 && method.hasDbOperation) {
      steps.push({
        order: steps.length + 1,
        type: 'local_query',
        source: sources.local[0].fieldType,
        action: this.crudTypeToAction(method.crudType),
      });
    }

    // 步骤3: 远程数据源
    if (sources.remote.length > 0 && method.hasApiCall) {
      steps.push({
        order: steps.length + 1,
        type: 'remote_call',
        source: sources.remote[0].fieldType,
        action: this.crudTypeToAction(method.crudType),
      });
    }

    // 步骤4: 数据转换
    if (method.hasTransformation) {
      steps.push({
        order: steps.length + 1,
        type: 'transformation',
        source: 'mapper',
        action: 'convert',
      });
    }

    // 步骤5: 缓存更新
    if (method.usesCache && method.crudType !== 'read') {
      steps.push({
        order: steps.length + 1,
        type: 'cache_update',
        source: 'memory_cache',
        action: 'set',
      });
    }

    return {
      steps,
      complexity: steps.length,
      hasCaching: method.usesCache,
      hasFallback: steps.length > 2,
    };
  }

  /**
   * 从 Repository 提取方法体
   */
  extractMethodBodyFromRepo(repo, method) {
    const content = repo.body;
    const methodName = method.name;

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
   * CRUD 类型转操作名
   */
  crudTypeToAction(crudType) {
    const mapping = {
      create: 'insert',
      read: 'select',
      update: 'update',
      delete: 'delete',
    };
    return mapping[crudType] || 'unknown';
  }

  /**
   * 识别数据流模式
   */
  identifyDataFlowPatterns(paths) {
    const patterns = {
      cache_first: 0,
      local_first: 0,
      remote_first: 0,
      cache_local_remote: 0,
      local_remote: 0,
      remote_local: 0,
    };

    for (const pathInfo of paths) {
      const steps = pathInfo.path.steps;
      const stepTypes = steps.map(s => s.type);

      if (stepTypes.includes('cache_check') && stepTypes.includes('local_query')) {
        patterns.cache_local_remote++;
      } else if (stepTypes.includes('cache_check')) {
        patterns.cache_first++;
      } else if (stepTypes[0] === 'local_query') {
        patterns.local_first++;
      } else if (stepTypes[0] === 'remote_call') {
        patterns.remote_first++;
      } else if (stepTypes.includes('local_query') && stepTypes.includes('remote_call')) {
        if (stepTypes.indexOf('local_query') < stepTypes.indexOf('remote_call')) {
          patterns.local_remote++;
        } else {
          patterns.remote_local++;
        }
      }
    }

    return patterns;
  }

  /**
   * 生成 Repository 依赖图（带关系）
   * @returns {Object} Repository 依赖图
   */
  buildRepositoryDependencyGraph() {
    const graph = {
      nodes: [],
      edges: [],
      groups: [],
    };

    // 添加节点
    for (const [name, repo] of this.repositories) {
      graph.nodes.push({
        id: repo.id,
        name: repo.name,
        type: repo.repositoryType,
        dataSourceType: repo.dataSourceType,
        methodCount: repo.methods.length,
      });
    }

    // 添加边（基于数据源依赖）
    for (const [repoName, sources] of this.dataSources) {
      const repo = this.repositories.get(repoName);
      if (!repo) continue;

      // 添加对其他 Repository 的依赖
      for (const source of [...sources.remote, ...sources.local, ...sources.cache]) {
        const depRepo = this.findRepositoryByType(source.fieldType);
        if (depRepo && depRepo.name !== repoName) {
          graph.edges.push({
            from: repo.id,
            to: depRepo.id,
            type: 'uses',
            sourceType: source.fieldType,
          });
        }
      }
    }

    // 按数据源类型分组
    graph.groups = this.groupByDataSource();

    return graph;
  }

  /**
   * 根据类型查找 Repository
   */
  findRepositoryByType(type) {
    const typeLower = type.toLowerCase();
    for (const repo of this.repositories.values()) {
      if (repo.name.toLowerCase().includes(typeLower) ||
          repo.interfaces?.toLowerCase().includes(typeLower)) {
        return repo;
      }
    }
    return null;
  }

  /**
   * 按数据源分组
   */
  groupByDataSource() {
    const groups = {
      remote: [],
      local: [],
      cache: [],
      unknown: [],
    };

    for (const repo of this.repositories.values()) {
      const type = repo.dataSourceType;
      if (groups[type]) {
        groups[type].push(repo.id);
      } else {
        groups.unknown.push(repo.id);
      }
    }

    return groups;
  }

  /**
   * 生成数据一致性分析
   * @returns {Object} 数据一致性分析
   */
  analyzeDataConsistency() {
    const analysis = {
      strategies: [],
      potentialIssues: [],
      recommendations: [],
    };

    // 检查缓存策略一致性
    for (const [repoName, strategies] of this.cacheStrategies) {
      for (const strategy of strategies) {
        analysis.strategies.push({
          repository: repoName,
          method: strategy.method,
          strategy: strategy.type,
          consistent: this.isCacheConsistent(strategy),
        });
      }
    }

    // 检查潜在的一致性问题
    for (const [repoName, crudOps] of this.crudOperations) {
      // 检查是否有写操作但没有缓存失效
      const hasWrite = crudOps.create + crudOps.update + crudOps.delete > 0;
      const cacheInvalidation = this.cacheStrategies.get(repoName) || [];

      if (hasWrite && cacheInvalidation.length === 0) {
        analysis.potentialIssues.push({
          type: 'cache_invalidation',
          repository: repoName,
          message: `${repoName} 有写操作但没有缓存失效策略`,
          severity: 'warning',
        });
      }

      // 检查是否有远程操作但没有本地备份
      const repo = this.repositories.get(repoName);
      if (repo && repo.dataSourceType === 'remote' && crudOps.create > 0) {
        const sources = this.dataSources.get(repoName) || {};
        if (sources.local && sources.local.length === 0) {
          analysis.recommendations.push({
            type: 'offline_support',
            repository: repoName,
            message: `考虑为 ${repoName} 添加本地数据存储以支持离线模式`,
          });
        }
      }
    }

    return analysis;
  }

  /**
   * 检查缓存一致性
   */
  isCacheConsistent(strategy) {
    // 简化检查：写操作应该有缓存失效
    if (strategy.type === 'write-through' || strategy.type === 'write-back') {
      return true;
    }
    return strategy.type !== 'unknown';
  }

  /**
   * 生成 Repository 层健康报告
   * @returns {Object} 健康报告
   */
  generateHealthReport() {
    const report = {
      overall: 'healthy',
      score: 100,
      issues: [],
      warnings: [],
      recommendations: [],
    };

    // 生成当前统计信息
    const statistics = this.generateStatistics();

    // 评分标准
    let score = 100;

    // 检查 Repository 复杂度
    for (const [repoName, repo] of this.repositories) {
      if (repo.methods.length > 15) {
        score -= 10;
        report.warnings.push({
          type: 'high_complexity',
          repository: repoName,
          message: `${repoName} 包含 ${repo.methods.length} 个方法，可能需要拆分`,
        });
      }
    }

    // 检查缓存覆盖率
    const cacheCoverage = statistics.totalMethods > 0
      ? statistics.cacheUsage / statistics.totalMethods
      : 0;

    if (cacheCoverage < 0.3 && statistics.totalMethods > 5) {
      score -= 15;
      report.recommendations.push({
        type: 'caching',
        message: `缓存覆盖率较低 (${(cacheCoverage * 100).toFixed(0)}%)，考虑添加缓存以提高性能`,
      });
    }

    // 检查数据转换
    if (statistics.transformationUsage === 0 && statistics.totalMethods > 0) {
      score -= 10;
      report.recommendations.push({
        type: 'data_mapping',
        message: '未检测到数据转换，确保在数据源和实体之间进行适当的数据映射',
      });
    }

    // 检查 CRUD 完整性
    const crud = statistics.crudDistribution;
    if (crud.read > 0 && crud.create === 0 && crud.update === 0 && crud.delete === 0) {
      // 只读 Repository，这是正常的
    } else if (crud.create > 0 && crud.update === 0) {
      score -= 5;
      report.recommendations.push({
        type: 'crud_completeness',
        message: '某些 Repository 有创建操作但没有更新操作',
      });
    }

    // 确定总体健康状态
    if (score >= 80) {
      report.overall = 'healthy';
    } else if (score >= 60) {
      report.overall = 'warning';
    } else {
      report.overall = 'unhealthy';
    }

    report.score = Math.max(0, score);

    return report;
  }
}

module.exports = FlutterRepositoryAnalyzer;
