/**
 * Code Graph Generator
 *
 * Responsibilities:
 * - Generate code dependency graph from parsed AST info
 * - Build relationships between files, imports, functions, classes
 * - Detect API endpoints and routes
 * - Store graph data in knowledge base
 *
 * Graph Structure:
 * - Nodes: Files, functions, classes, API endpoints, routes
 * - Edges: Import/export relationships, function calls, class inheritance
 */

const fs = require('fs');
const path = require('path');

// Lazy load analyzers
let FunctionAnalyzer = null;
let CallGraphAnalyzer = null;
let FileDependencyAnalyzer = null;
let FlutterUIAnalyzer = null;

class CodeGraphGenerator {
  constructor(options = {}) {
    this.options = {
      maxNodes: options.maxNodes || 100000, // 增加到100000
      includeBody: options.includeBody !== false,
      resolveRelativePaths: options.resolveRelativePaths !== false,
      enableFunctionAnalysis: options.enableFunctionAnalysis !== false,
      ...options,
    };

    this.graph = {
      nodes: new Map(),
      edges: new Map(),
      metadata: {
        generatedAt: null,
        totalNodes: 0,
        totalEdges: 0,
        languages: new Set(),
      },
    };

    this.nodeIdCounter = 0;
    this.functionAnalyzer = null;
    this.callGraphAnalyzer = null;
    this.fileDependencyAnalyzer = null;
    this.flutterUIAnalyzer = null;
  }

  /**
   * Enable function analysis
   * @param {Object} options - Analysis options
   */
  enableFunctionAnalysis(options = {}) {
    if (!FunctionAnalyzer) {
      try {
        FunctionAnalyzer = require('../function-analyzer');
        this.functionAnalyzer = new FunctionAnalyzer();
      } catch (error) {
        console.warn('Function Analyzer not available:', error.message);
      }
    }
    return !!this.functionAnalyzer;
  }

  /**
   * Enable call graph analysis
   * @param {Object} options - Analysis options
   */
  enableCallGraphAnalysis(options = {}) {
    if (!CallGraphAnalyzer) {
      try {
        CallGraphAnalyzer = require('../call-graph-analyzer');
        this.callGraphAnalyzer = new CallGraphAnalyzer();
      } catch (error) {
        console.warn('Call Graph Analyzer not available:', error.message);
      }
    }
    return !!this.callGraphAnalyzer;
  }

  /**
   * Enable file dependency analysis
   * @param {Object} options - Analysis options
   */
  enableFileDependencyAnalysis(options = {}) {
    if (!FileDependencyAnalyzer) {
      try {
        FileDependencyAnalyzer = require('../file-dependency-analyzer');
        this.fileDependencyAnalyzer = new FileDependencyAnalyzer();
      } catch (error) {
        console.warn('File Dependency Analyzer not available:', error.message);
      }
    }
    return !!this.fileDependencyAnalyzer;
  }

  /**
   * Enable Flutter UI analysis
   * @param {Object} options - Analysis options
   */
  enableFlutterUIAnalysis(options = {}) {
    if (!FlutterUIAnalyzer) {
      try {
        FlutterUIAnalyzer = require('../flutter-ui-analyzer');
        this.flutterUIAnalyzer = new FlutterUIAnalyzer();
      } catch (error) {
        console.warn('Flutter UI Analyzer not available:', error.message);
      }
    }
    return !!this.flutterUIAnalyzer;
  }

  /**
   * Generate unique node ID
   */
  generateId() {
    return `node_${this.nodeIdCounter++}`;
  }

  /**
   * Generate code graph from AST extraction results (async version with yielding)
   * @param {Array} extractions - Array of extracted info from AST parser
   * @param {string} projectRoot - Project root path
   * @returns {Promise<Object>} Generated graph
   */
  async generate(extractions, projectRoot = '') {
    console.log(`[Code Graph] generate() 开始，文件数: ${extractions.length}`);
    this.resetGraph();

    // 添加安全限制，防止内存溢出
    const maxExtractions = this.options.maxNodes || 10000;
    const limitedExtractions = extractions.slice(0, maxExtractions);

    if (extractions.length > maxExtractions) {
      console.warn(`[Code Graph] 文件数量超过限制 ${maxExtractions}，仅处理前 ${maxExtractions} 个`);
    }

    // Process each file extraction in batches with yielding
    let processedCount = 0;
    const batchSize = 50; // 每批处理50个文件

    for (let i = 0; i < limitedExtractions.length; i += batchSize) {
      const batch = limitedExtractions.slice(i, Math.min(i + batchSize, limitedExtractions.length));

      for (const extraction of batch) {
        try {
          this.processFileExtraction(extraction, projectRoot);
          processedCount++;

          // 定期检查节点数量限制
          if (this.graph.nodes.size >= this.options.maxNodes) {
            console.warn(`[Code Graph] 达到最大节点数限制 ${this.options.maxNodes}，停止处理`);
            break;
          }
        } catch (error) {
          console.error(`[Code Graph] 处理文件 ${extraction.filePath} 失败:`, error.message);
          // 继续处理其他文件
        }
      }

      // 每 100 个文件报告一次进度
      if (processedCount % 100 === 0 || processedCount === limitedExtractions.length) {
        console.log(`[Code Graph] 已处理 ${processedCount}/${limitedExtractions.length} 个文件`);
      }

      // 每批处理后让出事件循环，防止阻塞
      if (i + batchSize < limitedExtractions.length) {
        await this.yieldToEventLoop();
      }
    }

    console.log(`[Code Graph] 已处理 ${processedCount} 个文件，开始构建关系`);

    // Build relationships between nodes (async version)
    try {
      console.log(`[Code Graph] 开始构建关系，当前节点数: ${this.graph.nodes.size}`);
      await this.buildRelationshipsAsync();
      console.log(`[Code Graph] 关系构建完成，边数: ${this.graph.edges.size}`);
    } catch (error) {
      console.error('[Code Graph] 构建关系时出错:', error.message);
      console.error(error.stack);
    }

    // Finalize graph metadata
    try {
      this.finalizeMetadata();
    } catch (error) {
      console.error('[Code Graph] 完成元数据时出错:', error.message);
    }

    console.log(`[Code Graph] generate() 完成`);
    return this.exportGraph();
  }

  /**
   * Yield to event loop to prevent blocking
   * @returns {Promise<void>}
   */
  yieldToEventLoop() {
    return new Promise(resolve => setImmediate(resolve));
  }

  /**
   * Build relationships asynchronously with yielding
   * @returns {Promise<void>}
   */
  async buildRelationshipsAsync() {
    console.log('[Code Graph] 开始构建导入依赖关系...');
    await this.buildImportDependenciesAsync();
    console.log('[Code Graph] 导入依赖关系构建完成');

    console.log('[Code Graph] 开始构建类继承关系...');
    await this.buildInheritanceRelationshipsAsync();
    console.log('[Code Graph] 类继承关系构建完成');

    console.log('[Code Graph] 开始构建组件关系...');
    await this.buildComponentRelationshipsAsync();
    console.log('[Code Graph] 组件关系构建完成');

    // Build function call relationships
    if (this.functionAnalyzer) {
      console.log('[Code Graph] 开始构建函数调用关系...');
      await this.buildFunctionCallRelationshipsAsync();
      console.log('[Code Graph] 函数调用关系构建完成');
    } else {
      console.log('[Code Graph] 跳过函数调用关系构建（函数分析器未启用）');
    }
  }

  /**
   * Reset graph for new generation
   */
  resetGraph() {
    this.graph = {
      nodes: new Map(),
      edges: new Map(),
      metadata: {
        generatedAt: new Date().toISOString(),
        totalNodes: 0,
        totalEdges: 0,
        languages: new Set(),
      },
    };
    this.nodeIdCounter = 0;
  }

  /**
   * Process a single file extraction
   * @param {Object} extraction - Extracted AST info
   * @param {string} projectRoot - Project root path
   * @param {string} content - File content (optional, for detailed analysis)
   */
  processFileExtraction(extraction, projectRoot, content = null) {
    const { filePath, language, ...data } = extraction;

    // Track language
    this.graph.metadata.languages.add(language);

    // Create file node
    const fileNode = this.createFileNode(filePath, language, projectRoot);
    this.addNode(fileNode);

    // 为了性能，默认不读取文件内容
    // 文件内容读取会严重影响性能，而且对代码图生成不是必需的
    // 如果确实需要函数体分析，应该在后续按需进行
    content = null;

    // Process imports
    if (data.imports && data.imports.length > 0) {
      this.processImports(fileNode, data.imports, projectRoot);
    }

    // Process exports
    if (data.exports && data.exports.length > 0) {
      this.processExports(fileNode, data.exports);
    }

    // Process functions (不读取内容)
    if (data.functions && data.functions.length > 0) {
      this.processFunctions(fileNode, data.functions, null);
    }

    // Process classes
    if (data.classes && data.classes.length > 0) {
      this.processClasses(fileNode, data.classes);
    }

    // Process API calls
    if (data.apiCalls && data.apiCalls.length > 0) {
      this.processApiCalls(fileNode, data.apiCalls);
    }

    // Process routes
    if (data.routes && data.routes.length > 0) {
      this.processRoutes(fileNode, data.routes);
    }

    // Process components (Vue specific)
    if (data.components && data.components.length > 0) {
      this.processComponents(fileNode, data.components);
    }

    // Process decorators (TypeScript/Python style)
    if (data.decorators && data.decorators.length > 0) {
      this.processDecorators(fileNode, data.decorators);
    }

    // Process Dart specific structures
    if (data.dartMixins && data.dartMixins.length > 0) {
      this.processMixins(fileNode, data.dartMixins);
    }

    if (data.dartEnums && data.dartEnums.length > 0) {
      this.processEnums(fileNode, data.dartEnums);
    }

    if (data.dartExtensions && data.dartExtensions.length > 0) {
      this.processExtensions(fileNode, data.dartExtensions);
    }

    if (data.dartLibraries && data.dartLibraries.length > 0) {
      this.processLibraries(fileNode, data.dartLibraries);
    }
  }

  /**
   * Create a file node
   * @param {string} filePath - File path
   * @param {string} language - Programming language
   * @param {string} projectRoot - Project root path
   * @returns {Object} File node
   */
  createFileNode(filePath, language, projectRoot) {
    const relativePath = path.relative(projectRoot, filePath);
    const ext = path.extname(filePath);
    const fileName = path.basename(filePath);

    return {
      id: this.generateId(),
      type: 'file',
      filePath: filePath,
      relativePath: relativePath,
      fileName: fileName,
      extension: ext,
      language: language,
      // 不在创建节点时同步获取文件信息，避免阻塞
      size: 0,
      lastModified: null,
      children: [],
      imports: [],
      exports: [],
    };
  }

  /**
   * Add node to graph
   * @param {Object} node - Node to add
   */
  addNode(node) {
    if (this.graph.nodes.size >= this.options.maxNodes) {
      console.warn('Max nodes limit reached, some nodes may be omitted');
      return;
    }

    this.graph.nodes.set(node.id, node);
    this.graph.metadata.totalNodes++;
  }

  /**
   * Add edge to graph
   * @param {Object} edge - Edge to add
   */
  addEdge(edge) {
    const edgeKey = `${edge.source}:${edge.target}:${edge.type}`;
    this.graph.edges.set(edgeKey, edge);
    this.graph.metadata.totalEdges++;
  }

  /**
   * Process imports from a file
   * @param {Object} fileNode - File node
   * @param {Array} imports - Import statements
   * @param {string} projectRoot - Project root path
   */
  processImports(fileNode, imports, projectRoot) {
    for (const imp of imports) {
      const importNode = {
        id: this.generateId(),
        type: 'import',
        source: imp.source,
        specifiers: imp.specifiers || [],
        line: imp.line,
        isExternal: this.isExternalImport(imp.source),
        isRelative: imp.source.startsWith('.'),
      };

      // Resolve relative path
      if (importNode.isRelative && this.options.resolveRelativePaths) {
        importNode.resolvedPath = this.resolveImportPath(
          fileNode.filePath,
          imp.source
        );
      }

      this.addNode(importNode);

      // Create edge from file to import
      this.addEdge({
        source: fileNode.id,
        target: importNode.id,
        type: 'contains',
        label: 'imports',
      });

      fileNode.imports.push(importNode.id);
    }
  }

  /**
   * Process exports from a file
   * @param {Object} fileNode - File node
   * @param {Array} exports - Export statements
   */
  processExports(fileNode, exports) {
    for (const exp of exports) {
      const exportNode = {
        id: this.generateId(),
        type: 'export',
        name: exp.name,
        exportType: exp.type,
        line: exp.line,
      };

      this.addNode(exportNode);

      // Create edge from file to export
      this.addEdge({
        source: fileNode.id,
        target: exportNode.id,
        type: 'contains',
        label: 'exports',
      });

      fileNode.exports.push(exportNode.id);
    }
  }

  /**
   * Process functions from a file
   * @param {Object} fileNode - File node
   * @param {Array} functions - Function declarations
   * @param {string} content - File content (for analysis)
   */
  processFunctions(fileNode, functions, content = null) {
    // Enable function analyzer if needed
    if (this.options.enableFunctionAnalysis && !this.functionAnalyzer) {
      this.enableFunctionAnalysis();
    }

    for (const func of functions) {
      const functionNode = {
        id: this.generateId(),
        type: 'function',
        name: func.name,
        params: func.params || [],
        async: func.async || false,
        generator: func.generator || false,
        returnType: func.returnType || null,
        line: func.line,
        endLine: func.endLine || null,
        fileId: fileNode.id,
        fileName: fileNode.fileName || null,
      };

      // 增强函数分析
      if (this.functionAnalyzer && content) {
        const analysis = this.functionAnalyzer.analyzeFunction(
          func,
          content,
          null,
          fileNode.language || 'javascript'
        );

        // 合并分析结果
        Object.assign(functionNode, {
          // 复杂度指标
          complexity: analysis.complexity,

          // 职责识别
          purpose: analysis.purpose,

          // 变量分析
          variables: analysis.variables,

          // 访问控制
          accessLevel: analysis.accessLevel,
          isExported: analysis.isExported,
          isStatic: analysis.isStatic,

          // 类型信息
          isArrow: analysis.isArrow,
          isMethod: analysis.isMethod,

          // 父级信息
          className: analysis.className,
          parentFunction: analysis.parentFunction,
          belongsTo: analysis.belongsTo,

          // 质量指标
          quality: analysis.quality,
        });
      }

      this.addNode(functionNode);

      // Create edge from file to function
      this.addEdge({
        source: fileNode.id,
        target: functionNode.id,
        type: 'contains',
        label: 'defines',
      });

      fileNode.children.push(functionNode.id);

      // 存储函数调用信息（用于后续构建调用关系）
      if (this.functionAnalyzer && content) {
        functionNode.calls = this.functionAnalyzer.extractFunctionCalls(
          func,
          content,
          fileNode.language || 'javascript'
        );
      }
    }
  }

  /**
   * Process classes from a file
   * @param {Object} fileNode - File node
   * @param {Array} classes - Class declarations
   * @param {string} content - File content (for analysis)
   */
  processClasses(fileNode, classes, content = null) {
    for (const cls of classes) {
      const classNode = {
        id: this.generateId(),
        type: 'class',
        name: cls.name,
        superClass: cls.superClass,
        methods: cls.methods || [],
        properties: cls.properties || [],
        // Provider 类的 API 方法（用于测试上下文生成）
        apiMethods: cls.apiMethods || [],
        // 保留 AST 增强提取的 UI 属性和操作方法（用于测试上下文生成）
        uiProperties: cls.uiProperties || { inputs: [], dropdowns: [], checkboxes: [], lists: [], others: [] },
        actionMethods: cls.actionMethods || { add: [], edit: [], delete: [], save: [], submit: [], cancel: [], search: [], reset: [], load: [], other: [] },
        line: cls.line,
        endLine: cls.endLine || null,
        fileId: fileNode.id,
        fileName: fileNode.fileName || null,
      };

      // 增强类分析
      if (this.functionAnalyzer && content) {
        const classAnalysis = this.analyzeClass(cls, content, fileNode.language);
        Object.assign(classNode, classAnalysis);
      }

      this.addNode(classNode);

      // Create edge from file to class
      this.addEdge({
        source: fileNode.id,
        target: classNode.id,
        type: 'contains',
        label: 'defines',
      });

      // Create inheritance edge if super class exists
      if (cls.superClass) {
        // Note: We'll resolve this during relationship building
        classNode.pendingInheritance = cls.superClass;
      }

      fileNode.children.push(classNode.id);
    }
  }

  /**
   * 分析类的详细信息
   * @param {Object} cls - 类信息
   * @param {string} content - 文件内容
   * @param {string} language - 语言类型
   * @returns {Object} 类分析结果
   */
  analyzeClass(cls, content, language) {
    const analysis = {
      // 方法分类
      methodCategories: {
        public: [],
        private: [],
        protected: [],
        static: [],
        getters: [],
        setters: [],
        lifecycle: [],
        constructors: [],
      },

      // 类指标
      metrics: {
        totalMethods: (cls.methods || []).length,
        totalProperties: (cls.properties || []).length,
        hasInheritance: !!cls.superClass,
        methodCount: (cls.methods || []).length,
      },

      // 职责识别
      purpose: this.identifyClassPurpose(cls, content, language),

      // 设计模式检测
      patterns: this.detectDesignPatterns(cls, content),
    };

    // 分类方法
    for (const method of cls.methods || []) {
      const methodName = method.key || method.name;

      // 访问级别
      if (methodName.startsWith('_')) {
        analysis.methodCategories.private.push(methodName);
      } else {
        analysis.methodCategories.public.push(methodName);
      }

      // Static 方法
      if (method.static) {
        analysis.methodCategories.static.push(methodName);
      }

      // Getter/Setter
      if (method.kind === 'get') {
        analysis.methodCategories.getters.push(methodName);
      } else if (method.kind === 'set') {
        analysis.methodCategories.setters.push(methodName);
      }

      // 构造函数
      if (methodName === 'constructor' || methodName === cls.name) {
        analysis.methodCategories.constructors.push(methodName);
      }

      // 生命周期方法 (React)
      const lifecycleMethods = [
        'componentWillMount', 'componentDidMount', 'componentWillUnmount',
        'componentDidUnmount', 'componentWillReceiveProps', 'shouldComponentUpdate',
        'getSnapshotBeforeUpdate', 'componentDidUpdate',
        'getDerivedStateFromProps', 'UNSAFE_componentWillMount',
        'UNSAFE_componentWillReceiveProps', 'UNSAFE_componentWillUpdate',
      ];
      if (lifecycleMethods.includes(methodName)) {
        analysis.methodCategories.lifecycle.push(methodName);
      }
    }

    return analysis;
  }

  /**
   * 识别类的职责类型
   */
  identifyClassPurpose(cls, content, language) {
    const className = cls.name.toLowerCase();
    const purposes = [];

    // 检测组件类型
    if (className.includes('component') || className.includes('view') ||
        className.includes('page') || className.includes('screen')) {
      purposes.push('ui-component');
    }

    // 检测服务类
    if (className.includes('service') || className.includes('handler') ||
        className.includes('manager')) {
      purposes.push('service');
    }

    // 检测模型/实体
    if (className.includes('model') || className.includes('entity') ||
        className.includes('dto') || className.includes('data')) {
      purposes.push('data-model');
    }

    // 检测工具类
    if (className.includes('util') || className.includes('helper') ||
        className.includes('tool')) {
      purposes.push('utility');
    }

    // 检测配置类
    if (className.includes('config') || className.includes('settings') ||
        className.includes('options')) {
      purposes.push('configuration');
    }

    // 检测常量类
    if (className.includes('constant') || className.includes('enum')) {
      purposes.push('constants');
    }

    return {
      primary: purposes[0] || 'class',
      all: purposes,
    };
  }

  /**
   * 检测设计模式
   */
  detectDesignPatterns(cls, content) {
    const patterns = [];
    const className = cls.name.toLowerCase();

    // 单例模式
    if (cls.methods && cls.methods.some(m =>
        (m.key || m.name).toLowerCase().includes('instance'))) {
      patterns.push('singleton');
    }

    // 工厂模式
    if (cls.methods && cls.methods.some(m =>
        (m.key || m.name).toLowerCase().includes('create') ||
        (m.key || m.name).toLowerCase().includes('factory'))) {
      patterns.push('factory');
    }

    // 观察者模式
    if (cls.methods && cls.methods.some(m =>
        (m.key || m.name).toLowerCase().includes('subscribe') ||
        (m.key || m.name).toLowerCase().includes('notify') ||
        (m.key || m.name).toLowerCase().includes('observe'))) {
      patterns.push('observer');
    }

    // 策略模式
    if (className.includes('strategy')) {
      patterns.push('strategy');
    }

    // 适配器模式
    if (className.includes('adapter')) {
      patterns.push('adapter');
    }

    return patterns;
  }

  /**
   * Process API calls from a file
   * @param {Object} fileNode - File node
   * @param {Array} apiCalls - API call detections
   */
  processApiCalls(fileNode, apiCalls) {
    // 初始化 fileNode.apiCalls 数组（用于 test-context-enhancer 读取）
    if (!fileNode.apiCalls) {
      fileNode.apiCalls = [];
    }

    for (const api of apiCalls) {
      // 存储完整的 API 调用信息到文件节点
      fileNode.apiCalls.push({
        type: api.type,
        method: api.method || null,
        url: api.url || null,
        varName: api.varName || null,
        raw: api.raw || null,
        line: api.line,
      });

      // 创建单独的 API 节点（用于代码图可视化）
      const apiNode = {
        id: this.generateId(),
        type: 'api_call',
        apiType: api.type,
        method: api.method || null,
        url: api.url || null,  // 添加 URL 信息
        line: api.line,
        fileId: fileNode.id,
      };

      this.addNode(apiNode);

      // Create edge from file to API call
      this.addEdge({
        source: fileNode.id,
        target: apiNode.id,
        type: 'contains',
        label: 'calls',
      });

      fileNode.children.push(apiNode.id);
    }
  }

  /**
   * Process route definitions from a file
   * @param {Object} fileNode - File node
   * @param {Array} routes - Route definitions
   */
  processRoutes(fileNode, routes) {
    for (const route of routes) {
      const routeNode = {
        id: this.generateId(),
        type: 'route',
        path: route.path,
        line: route.line,
        fileId: fileNode.id,
      };

      this.addNode(routeNode);

      // Create edge from file to route
      this.addEdge({
        source: fileNode.id,
        target: routeNode.id,
        type: 'contains',
        label: 'defines',
      });

      fileNode.children.push(routeNode.id);
    }
  }

  /**
   * Process component usages (Vue specific)
   * @param {Object} fileNode - File node
   * @param {Array} components - Component references
   */
  processComponents(fileNode, components) {
    for (const comp of components) {
      const componentNode = {
        id: this.generateId(),
        type: 'component',
        name: comp.name,
        line: comp.line,
        fileId: fileNode.id,
      };

      this.addNode(componentNode);

      // Create edge from file to component
      this.addEdge({
        source: fileNode.id,
        target: componentNode.id,
        type: 'contains',
        label: 'uses',
      });

      fileNode.children.push(componentNode.id);
    }
  }

  /**
   * Process decorators (TypeScript/Python)
   * @param {Object} fileNode - File node
   * @param {Array} decorators - Decorator declarations
   */
  processDecorators(fileNode, decorators) {
    for (const dec of decorators) {
      const decoratorNode = {
        id: this.generateId(),
        type: 'decorator',
        name: dec.name,
        line: dec.line,
        fileId: fileNode.id,
      };

      this.addNode(decoratorNode);

      // Create edge from file to decorator
      this.addEdge({
        source: fileNode.id,
        target: decoratorNode.id,
        type: 'contains',
        label: 'decorated_with',
      });

      fileNode.children.push(decoratorNode);
    }
  }

  /**
   * Process Dart mixins
   * @param {Object} fileNode - File node
   * @param {Array} mixins - Mixin declarations
   */
  processMixins(fileNode, mixins) {
    for (const mixin of mixins) {
      const mixinNode = {
        id: this.generateId(),
        type: 'mixin',
        name: mixin.name,
        constraints: mixin.constraints || [],
        line: mixin.line,
        fileId: fileNode.id,
      };

      this.addNode(mixinNode);

      // Create edge from file to mixin
      this.addEdge({
        source: fileNode.id,
        target: mixinNode.id,
        type: 'contains',
        label: 'defines',
      });

      fileNode.children.push(mixinNode.id);
    }
  }

  /**
   * Process Dart enums
   * @param {Object} fileNode - File node
   * @param {Array} enums - Enum declarations
   */
  processEnums(fileNode, enums) {
    for (const enumDecl of enums) {
      const enumNode = {
        id: this.generateId(),
        type: 'enum',
        name: enumDecl.name,
        values: enumDecl.values || [],
        line: enumDecl.line,
        fileId: fileNode.id,
      };

      this.addNode(enumNode);

      // Create edge from file to enum
      this.addEdge({
        source: fileNode.id,
        target: enumNode.id,
        type: 'contains',
        label: 'defines',
      });

      fileNode.children.push(enumNode.id);
    }
  }

  /**
   * Process Dart extensions
   * @param {Object} fileNode - File node
   * @param {Array} extensions - Extension declarations
   */
  processExtensions(fileNode, extensions) {
    for (const ext of extensions) {
      const extensionNode = {
        id: this.generateId(),
        type: 'extension',
        onType: ext.onType,
        line: ext.line,
        fileId: fileNode.id,
      };

      this.addNode(extensionNode);

      // Create edge from file to extension
      this.addEdge({
        source: fileNode.id,
        target: extensionNode.id,
        type: 'contains',
        label: 'defines',
      });

      fileNode.children.push(extensionNode.id);
    }
  }

  /**
   * Process Dart libraries
   * @param {Object} fileNode - File node
   * @param {Array} libraries - Library declarations
   */
  processLibraries(fileNode, libraries) {
    for (const lib of libraries) {
      const libraryNode = {
        id: this.generateId(),
        type: 'library',
        name: lib.name,
        line: lib.line,
        fileId: fileNode.id,
      };

      this.addNode(libraryNode);

      // Create edge from file to library
      this.addEdge({
        source: fileNode.id,
        target: libraryNode.id,
        type: 'contains',
        label: 'declares',
      });

      fileNode.children.push(libraryNode.id);
    }
  }

  /**
   * Build relationships between nodes
   * This is called after all nodes are added
   */
  buildRelationships() {
    console.log('[Code Graph] 开始构建导入依赖关系...');
    // Build import dependencies between files
    this.buildImportDependencies();
    console.log('[Code Graph] 导入依赖关系构建完成');

    console.log('[Code Graph] 开始构建类继承关系...');
    // Build class inheritance relationships
    this.buildInheritanceRelationships();
    console.log('[Code Graph] 类继承关系构建完成');

    console.log('[Code Graph] 开始构建组件关系...');
    // Build component relationships (Vue)
    this.buildComponentRelationships();
    console.log('[Code Graph] 组件关系构建完成');

    // Build function call relationships
    if (this.functionAnalyzer) {
      console.log('[Code Graph] 开始构建函数调用关系...');
      this.buildFunctionCallRelationships();
      console.log('[Code Graph] 函数调用关系构建完成');
    } else {
      console.log('[Code Graph] 跳过函数调用关系构建（函数分析器未启用）');
    }
  }

  /**
   * Build function call relationships
   */
  buildFunctionCallRelationships() {
    const functionNodes = Array.from(this.graph.nodes.values()).filter(
      (n) => n.type === 'function'
    );

    // 创建函数名到节点的映射 - 优化版本
    const functionMap = new Map();
    for (const funcNode of functionNodes) {
      const key = `${funcNode.fileId}:${funcNode.name}`;
      if (!functionMap.has(key)) {
        functionMap.set(key, []);
      }
      functionMap.get(key).push(funcNode);

      // 同时存储全局名称
      if (!functionMap.has(funcNode.name)) {
        functionMap.set(funcNode.name, []);
      }
      functionMap.get(funcNode.name).push(funcNode);
    }

    let processedCalls = 0;
    const maxCalls = 50000; // 安全限制

    // 构建调用关系
    for (const funcNode of functionNodes) {
      if (funcNode.calls && funcNode.calls.length > 0) {
        for (const calledName of funcNode.calls) {
          processedCalls++;
          if (processedCalls > maxCalls) {
            console.warn(`[Code Graph] 函数调用关系超过限制 ${maxCalls}，停止处理`);
            break;
          }

          // 使用优化的查找函数
          const calledFunc = this.findFunctionByNameOptimized(calledName, funcNode, functionMap);
          if (calledFunc) {
            // 创建调用边
            this.addEdge({
              source: funcNode.id,
              target: calledFunc.id,
              type: 'calls',
              label: 'calls',
            });

            // 记录被调用关系
            if (!calledFunc.calledBy) {
              calledFunc.calledBy = [];
            }
            calledFunc.calledBy.push({
              functionId: funcNode.id,
              functionName: funcNode.name,
              fileName: funcNode.fileName,
            });
          }
        }
      }
      if (processedCalls > maxCalls) break;
    }

    // 检测递归调用（使用简化版本，避免深度遍历）
    this.detectRecursiveCallsSimple();
  }

  /**
   * 优化的函数查找 - 使用预先构建的 Map
   */
  findFunctionByNameOptimized(name, callerFunc, functionMap) {
    // 首先在同一文件中查找
    const sameFileKey = `${callerFunc.fileId}:${name}`;
    const sameFileFuncs = functionMap.get(sameFileKey);
    if (sameFileFuncs && sameFileFuncs.length > 0) {
      return sameFileFuncs[0];
    }

    // 然后查找导出的函数
    const globalFuncs = functionMap.get(name);
    if (globalFuncs) {
      const exported = globalFuncs.find(f => f.isExported);
      if (exported) return exported;
      return globalFuncs[0];
    }

    return null;
  }

  /**
   * 简化的递归检测 - 只检测直接递归，避免深度遍历
   */
  detectRecursiveCallsSimple() {
    const functionNodes = Array.from(this.graph.nodes.values()).filter(
      (n) => n.type === 'function'
    );

    for (const funcNode of functionNodes) {
      if (funcNode.calls && funcNode.calls.includes(funcNode.name)) {
        funcNode.isRecursive = true;
      }
    }
  }

  /**
   * Build import dependencies asynchronously
   * @returns {Promise<void>}
   */
  async buildImportDependenciesAsync() {
    const fileNodes = Array.from(this.graph.nodes.values()).filter(
      (n) => n.type === 'file'
    );

    // 创建文件路径到节点的 Map，避免重复遍历 - O(n) 变成 O(1)
    const filePathMap = new Map();
    for (const fileNode of fileNodes) {
      filePathMap.set(fileNode.filePath, fileNode);
      // 同时存储不带扩展名的路径
      const pathWithoutExt = fileNode.filePath.replace(/\.(js|ts|jsx|tsx|vue|dart)$/, '');
      filePathMap.set(pathWithoutExt, fileNode);
    }

    let processedImports = 0;
    const maxImports = 50000; // 安全限制
    const batchSize = 100; // 每批处理100个文件

    for (let i = 0; i < fileNodes.length; i += batchSize) {
      const batch = fileNodes.slice(i, Math.min(i + batchSize, fileNodes.length));

      for (const fileNode of batch) {
        for (const importId of fileNode.imports || []) {
          processedImports++;
          if (processedImports > maxImports) {
            console.warn(`[Code Graph] 导入依赖超过限制 ${maxImports}，停止处理`);
            break;
          }

          // Skip external imports
          if (this.isExternalImport(importId)) continue;

          // Try to resolve the import
          let targetFile = null;

          // First try direct path match
          targetFile = filePathMap.get(importId);

          // Then try resolving relative paths
          if (!targetFile && this.options.resolveRelativePaths) {
            const resolvedPath = this.resolveImportPath(fileNode.filePath, importId);
            targetFile = filePathMap.get(resolvedPath);

            // Try with extensions
            if (!targetFile) {
              for (const ext of ['.js', '.ts', '.jsx', '.tsx', '.vue']) {
                const withExt = resolvedPath + ext;
                targetFile = filePathMap.get(withExt);
                if (targetFile) break;
              }
            }
          }

          if (targetFile) {
            this.addEdge({
              source: fileNode.id,
              target: targetFile.id,
              type: 'depends_on',
              label: 'imports',
            });
          }
        }
        if (processedImports > maxImports) break;
      }

      // 每批处理后让出事件循环
      if (i + batchSize < fileNodes.length) {
        await this.yieldToEventLoop();
      }
    }
  }

  /**
   * Build inheritance relationships asynchronously
   * @returns {Promise<void>}
   */
  async buildInheritanceRelationshipsAsync() {
    const classNodes = Array.from(this.graph.nodes.values()).filter(
      (n) => n.type === 'class'
    );

    // 创建类名到类节点的 Map，按文件分组
    const classMap = new Map(); // name -> [classNodes]
    const classByFile = new Map(); // fileId -> Set(classNames)

    for (const cls of classNodes) {
      if (!classMap.has(cls.name)) {
        classMap.set(cls.name, []);
      }
      classMap.get(cls.name).push(cls);

      if (!classByFile.has(cls.fileId)) {
        classByFile.set(cls.fileId, new Set());
      }
      classByFile.get(cls.fileId).add(cls.name);
    }

    let processedInheritance = 0;
    const maxInheritance = 20000; // 安全限制
    const batchSize = 100;

    for (let i = 0; i < classNodes.length; i += batchSize) {
      const batch = classNodes.slice(i, Math.min(i + batchSize, classNodes.length));

      for (const cls of batch) {
        if (cls.extends && cls.extends.length > 0) {
          for (const parentName of cls.extends) {
            processedInheritance++;
            if (processedInheritance > maxInheritance) {
              console.warn(`[Code Graph] 继承关系超过限制 ${maxInheritance}，停止处理`);
              break;
            }

            const parentClass = this.findClassByNameOptimized(parentName, cls.fileId, classMap, classByFile);
            if (parentClass) {
              this.addEdge({
                source: cls.id,
                target: parentClass.id,
                type: 'extends',
                label: 'extends',
              });
            }
          }
        }
        if (processedInheritance > maxInheritance) break;
      }

      if (i + batchSize < classNodes.length) {
        await this.yieldToEventLoop();
      }
    }
  }

  /**
   * Build component relationships asynchronously (Vue)
   * @returns {Promise<void>}
   */
  async buildComponentRelationshipsAsync() {
    const componentNodes = Array.from(this.graph.nodes.values()).filter(
      (n) => n.type === 'component'
    );

    // 创建类名到类节点的 Map
    const classMap = new Map();
    for (const node of this.graph.nodes.values()) {
      if (node.type === 'class') {
        classMap.set(node.name, node);
      }
    }

    const batchSize = 50;
    for (let i = 0; i < componentNodes.length; i += batchSize) {
      const batch = componentNodes.slice(i, Math.min(i + batchSize, componentNodes.length));

      for (const compNode of batch) {
        // 使用 Map 直接查找，O(1) 复杂度
        const definition = classMap.get(compNode.name);
        if (definition) {
          this.addEdge({
            source: compNode.id,
            target: definition.id,
            type: 'uses',
            label: 'component',
          });
        }
      }

      if (i + batchSize < componentNodes.length) {
        await this.yieldToEventLoop();
      }
    }
  }

  /**
   * Build function call relationships asynchronously
   * @returns {Promise<void>}
   */
  async buildFunctionCallRelationshipsAsync() {
    const functionNodes = Array.from(this.graph.nodes.values()).filter(
      (n) => n.type === 'function'
    );

    // 创建函数名到节点的映射 - 优化版本
    const functionMap = new Map();
    for (const funcNode of functionNodes) {
      const key = `${funcNode.fileId}:${funcNode.name}`;
      if (!functionMap.has(key)) {
        functionMap.set(key, []);
      }
      functionMap.get(key).push(funcNode);

      // 同时存储全局名称
      if (!functionMap.has(funcNode.name)) {
        functionMap.set(funcNode.name, []);
      }
      functionMap.get(funcNode.name).push(funcNode);
    }

    let processedCalls = 0;
    const maxCalls = 50000; // 安全限制
    const batchSize = 100;

    for (let i = 0; i < functionNodes.length; i += batchSize) {
      const batch = functionNodes.slice(i, Math.min(i + batchSize, functionNodes.length));

      for (const funcNode of batch) {
        if (funcNode.calls && funcNode.calls.length > 0) {
          for (const calledName of funcNode.calls) {
            processedCalls++;
            if (processedCalls > maxCalls) {
              console.warn(`[Code Graph] 函数调用关系超过限制 ${maxCalls}，停止处理`);
              break;
            }

            // 使用优化的查找函数
            const calledFunc = this.findFunctionByNameOptimized(calledName, funcNode, functionMap);
            if (calledFunc) {
              // 创建调用边
              this.addEdge({
                source: funcNode.id,
                target: calledFunc.id,
                type: 'calls',
                label: 'calls',
              });

              // 记录被调用关系
              if (!calledFunc.calledBy) {
                calledFunc.calledBy = [];
              }
              calledFunc.calledBy.push({
                functionId: funcNode.id,
                functionName: funcNode.name,
                fileName: funcNode.fileName,
              });
            }
          }
        }
        if (processedCalls > maxCalls) break;
      }

      if (i + batchSize < functionNodes.length) {
        await this.yieldToEventLoop();
      }
    }

    // 检测递归调用（使用简化版本，避免深度遍历）
    this.detectRecursiveCallsSimple();
  }

  /**
   * 根据名称查找函数节点 - 优化版本
   * @param {string} name - 函数名
   * @param {Object} callerFunc - 调用者函数节点
   * @param {Map} functionMap - 函数名到节点的 Map
   * @returns {Object|null} 函数节点
   */
  findFunctionByName(name, callerFunc, functionMap = null) {
    // 如果没有提供 Map，创建一个（第一次调用时）
    if (!functionMap) {
      functionMap = new Map();
      for (const node of this.graph.nodes.values()) {
        if (node.type === 'function') {
          const key = `${node.fileId}:${node.name}`;
          if (!functionMap.has(key)) {
            functionMap.set(key, []);
          }
          functionMap.get(key).push(node);

          // 同时存储全局名称
          if (!functionMap.has(name)) {
            functionMap.set(name, []);
          }
          functionMap.get(name).push(node);
        }
      }
    }

    // 首先在同一文件中查找
    const sameFileKey = `${callerFunc.fileId}:${name}`;
    const sameFileFuncs = functionMap.get(sameFileKey);
    if (sameFileFuncs && sameFileFuncs.length > 0) {
      return sameFileFuncs[0];
    }

    // 然后查找导出的函数
    const globalFuncs = functionMap.get(name);
    if (globalFuncs) {
      const exported = globalFuncs.find(f => f.isExported);
      if (exported) return exported;
      return globalFuncs[0];
    }

    return null;
  }

  /**
   * 检测递归调用
   */
  detectRecursiveCalls() {
    const functionNodes = Array.from(this.graph.nodes.values()).filter(
      (n) => n.type === 'function'
    );

    for (const funcNode of functionNodes) {
      if (funcNode.calls && funcNode.calls.includes(funcNode.name)) {
        funcNode.isRecursive = true;
      }

      // 检查间接递归 (通过调用边)
      const calls = this.getOutgoingFunctionCalls(funcNode.id);
      for (const call of calls) {
        if (this.hasPath(call.targetId, funcNode.id)) {
          funcNode.isIndirectlyRecursive = true;
          break;
        }
      }
    }
  }

  /**
   * 获取函数的出边
   */
  getOutgoingFunctionCalls(functionId) {
    return Array.from(this.graph.edges.values()).filter(
      (e) => e.source === functionId && e.type === 'calls'
    );
  }

  /**
   * 检查是否存在路径 (用于间接递归检测)
   */
  hasPath(fromId, toId) {
    const visited = new Set();
    const queue = [fromId];

    while (queue.length > 0) {
      const current = queue.shift();
      if (current === toId) return true;
      if (visited.has(current)) continue;

      visited.add(current);

      const outgoing = this.getOutgoingFunctionCalls(current);
      for (const edge of outgoing) {
        if (!visited.has(edge.target)) {
          queue.push(edge.target);
        }
      }
    }

    return false;
  }

  /**
   * Build dependencies between files based on imports
   */
  buildImportDependencies() {
    const fileNodes = Array.from(this.graph.nodes.values()).filter(
      (n) => n.type === 'file'
    );

    // 创建文件路径到节点的 Map，避免重复遍历 - O(n) 变成 O(1)
    const filePathMap = new Map();
    for (const fileNode of fileNodes) {
      filePathMap.set(fileNode.filePath, fileNode);
      // 同时存储不带扩展名的路径
      const pathWithoutExt = fileNode.filePath.replace(/\.(js|ts|jsx|tsx|vue|dart)$/, '');
      filePathMap.set(pathWithoutExt, fileNode);
    }

    let processedImports = 0;
    const maxImports = 50000; // 安全限制

    for (const fileNode of fileNodes) {
      for (const importId of fileNode.imports || []) {
        processedImports++;
        if (processedImports > maxImports) {
          console.warn(`[Code Graph] 导入关系超过限制 ${maxImports}，停止处理`);
          break;
        }

        const importNode = this.graph.nodes.get(importId);
        if (!importNode || importNode.isExternal) continue;

        // 使用 Map 直接查找，O(1) 复杂度
        let targetFile = filePathMap.get(importNode.resolvedPath);

        // 如果没找到，尝试带扩展名的路径
        if (!targetFile && importNode.resolvedPath) {
          const extensions = ['.js', '.ts', '.jsx', '.tsx', '.vue', '.dart'];
          for (const ext of extensions) {
            targetFile = filePathMap.get(importNode.resolvedPath + ext);
            if (targetFile) break;
          }
        }

        if (targetFile) {
          this.addEdge({
            source: fileNode.id,
            target: targetFile.id,
            type: 'depends_on',
            label: 'imports',
          });
        }
      }
      if (processedImports > maxImports) break;
    }
  }

  /**
   * Build inheritance relationships between classes
   */
  buildInheritanceRelationships() {
    const classNodes = Array.from(this.graph.nodes.values()).filter(
      (n) => n.type === 'class'
    );

    // 创建类名到类节点的 Map，按文件分组
    const classMap = new Map(); // name -> [classNodes]
    const classByFile = new Map(); // fileId -> Set(classNames)

    for (const cls of classNodes) {
      if (!classMap.has(cls.name)) {
        classMap.set(cls.name, []);
      }
      classMap.get(cls.name).push(cls);

      if (!classByFile.has(cls.fileId)) {
        classByFile.set(cls.fileId, new Set());
      }
      classByFile.get(cls.fileId).add(cls.name);
    }

    for (const classNode of classNodes) {
      if (classNode.pendingInheritance) {
        // Find parent class using Map - O(1) instead of O(n)
        const parent = this.findClassByNameOptimized(
          classNode.pendingInheritance,
          classNode.fileId,
          classMap,
          classByFile
        );

        if (parent) {
          this.addEdge({
            source: classNode.id,
            target: parent.id,
            type: 'extends',
            label: 'extends',
          });
        }

        delete classNode.pendingInheritance;
      }
    }
  }

  /**
   * Find class by name - optimized version with Map
   * @param {string} name - Class name
   * @param {string} fileId - Current file ID
   * @param {Map} classMap - Class name to nodes map
   * @param {Map} classByFile - File to class names map
   * @returns {Object|null} Class node
   */
  findClassByNameOptimized(name, fileId, classMap, classByFile) {
    // 首先在同一文件中查找
    const classesWithName = classMap.get(name);
    if (!classesWithName) return null;

    // 优先返回同一文件中的类
    for (const cls of classesWithName) {
      if (cls.fileId === fileId) {
        return cls;
      }
    }

    // 返回任意一个匹配的类（全局查找）
    return classesWithName[0] || null;
  }

  /**
   * Build component relationships for Vue
   */
  buildComponentRelationships() {
    const componentNodes = Array.from(this.graph.nodes.values()).filter(
      (n) => n.type === 'component'
    );

    // 创建类名到类节点的 Map
    const classMap = new Map();
    for (const node of this.graph.nodes.values()) {
      if (node.type === 'class') {
        classMap.set(node.name, node);
      }
    }

    for (const compNode of componentNodes) {
      // 使用 Map 直接查找，O(1) 复杂度
      const definition = classMap.get(compNode.name);
      if (definition) {
        this.addEdge({
          source: compNode.id,
          target: definition.id,
          type: 'uses',
          label: 'component',
        });
      }
    }
  }

  /**
   * Check if import is external (node_module, built-in)
   * @param {string} source - Import source
   * @returns {boolean} True if external
   */
  isExternalImport(source) {
    // Node.js built-ins
    const builtIns = [
      'fs', 'path', 'http', 'https', 'url', 'querystring', 'util',
      'events', 'stream', 'buffer', 'crypto', 'os', 'net', 'tls',
      'cluster', 'child_process', 'worker_threads', 'vm', 'assert',
      'console', 'timers', 'module', 'process', 'readline', 'repl',
      'zlib', 'punycode', 'domain', 'dgram', 'dns'
    ];

    if (builtIns.includes(source)) return true;

    // Not relative path = likely external package
    if (!source.startsWith('.') && !source.startsWith('/')) return true;

    return false;
  }

  /**
   * Resolve relative import path
   * @param {string} fromFile - Source file path
   * @param {string} importPath - Import path
   * @returns {string} Resolved path
   */
  resolveImportPath(fromFile, importPath) {
    try {
      const fromDir = path.dirname(fromFile);
      let resolved = path.resolve(fromDir, importPath);

      // Remove extension if present
      resolved = resolved.replace(/\.(js|ts|jsx|tsx|vue)$/, '');

      // Check if it's a directory (might have index file)
      if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
        // Could be index.js or index.ts
        const possibleIndexFiles = [
          resolved + '/index.js',
          resolved + '/index.ts',
          resolved + '/index.jsx',
          resolved + '/index.tsx',
        ];

        for (const indexPath of possibleIndexFiles) {
          if (fs.existsSync(indexPath)) {
            return indexPath;
          }
        }
      }

      // Add .js extension if no extension found
      if (!path.extname(resolved)) {
        const withJsExt = resolved + '.js';
        const withTsExt = resolved + '.ts';

        if (fs.existsSync(withTsExt)) return withTsExt;
        if (fs.existsSync(withJsExt)) return withJsExt;
      }

      return resolved;
    } catch (error) {
      return importPath;
    }
  }

  /**
   * Get file size
   * @param {string} filePath - File path
   * @returns {number} File size in bytes
   */
  getFileSize(filePath) {
    try {
      return fs.statSync(filePath).size;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Get file modification time
   * @param {string} filePath - File path
   * @returns {string} ISO timestamp
   */
  getFileModifiedTime(filePath) {
    try {
      const mtime = fs.statSync(filePath).mtime;
      return mtime.toISOString();
    } catch (error) {
      return null;
    }
  }

  /**
   * Finalize graph metadata
   */
  finalizeMetadata() {
    this.graph.metadata.languages = Array.from(this.graph.metadata.languages);

    // Count nodes by type
    const typeCounts = {};
    for (const node of this.graph.nodes.values()) {
      typeCounts[node.type] = (typeCounts[node.type] || 0) + 1;
    }
    this.graph.metadata.nodeTypeCounts = typeCounts;

    // Count edges by type
    const edgeTypeCounts = {};
    for (const edge of this.graph.edges.values()) {
      edgeTypeCounts[edge.type] = (edgeTypeCounts[edge.type] || 0) + 1;
    }
    this.graph.metadata.edgeTypeCounts = edgeTypeCounts;

    // 生成业务逻辑摘要（如果启用了调用图分析）
    if (this.callGraphAnalyzer) {
      this.graph.metadata.businessLogicSummary = this.generateBusinessLogicSummary();
    }
  }

  /**
   * 生成业务逻辑摘要
   */
  generateBusinessLogicSummary() {
    // 收集所有函数和类
    const functions = [];
    const classes = [];

    for (const node of this.graph.nodes.values()) {
      if (node.type === 'function') {
        functions.push({
          name: node.name,
          line: node.line,
          endLine: node.endLine,
          async: node.isAsync || false,
          params: node.params || [],
          complexity: node.complexity,
          purpose: node.purpose,
        });
      } else if (node.type === 'class') {
        classes.push({
          name: node.name,
          line: node.line,
          methods: node.methods || [],
        });
      }
    }

    // 生成调用关系图
    const callGraph = this.callGraphAnalyzer.buildCallGraph(
      functions,
      classes,
      null, // content
      'javascript'
    );

    return this.callGraphAnalyzer.generateBusinessLogicSummary();
  }

  /**
   * Export graph as plain object (serializable for IPC)
   * @returns {Object} Graph object
   */
  exportGraph() {
    // Convert Set to Array for serialization
    const metadata = {
      ...this.graph.metadata,
      languages: Array.from(this.graph.metadata.languages || []),
    };

    return {
      metadata,
      nodes: Array.from(this.graph.nodes.values()),
      edges: Array.from(this.graph.edges.values()),
    };
  }

  /**
   * Get graph statistics
   * @returns {Object} Statistics
   */
  getStats() {
    const nodesByType = {};
    const edgesByType = {};

    for (const node of this.graph.nodes.values()) {
      nodesByType[node.type] = (nodesByType[node.type] || 0) + 1;
    }

    for (const edge of this.graph.edges.values()) {
      edgesByType[edge.type] = (edgesByType[edge.type] || 0) + 1;
    }

    return {
      totalNodes: this.graph.nodes.size,
      totalEdges: this.graph.edges.size,
      nodesByType,
      edgesByType,
      languages: this.graph.metadata.languages,
    };
  }

  /**
   * Find shortest path between two nodes
   * @param {string} fromNodeId - Source node ID
   * @param {string} toNodeId - Target node ID
   * @returns {Array} Array of node IDs forming path
   */
  findShortestPath(fromNodeId, toNodeId) {
    if (!this.graph.nodes.has(fromNodeId) || !this.graph.nodes.has(toNodeId)) {
      return null;
    }

    // BFS for shortest path
    const visited = new Set([fromNodeId]);
    const queue = [[fromNodeId]];
    const edges = Array.from(this.graph.edges.values());

    while (queue.length > 0) {
      const path = queue.shift();
      const current = path[path.length - 1];

      if (current === toNodeId) {
        return path;
      }

      // Find neighbors
      const neighbors = edges
        .filter((e) => e.source === current || e.target === current)
        .map((e) => (e.source === current ? e.target : e.source))
        .filter((id) => !visited.has(id));

      for (const neighbor of neighbors) {
        visited.add(neighbor);
        queue.push([...path, neighbor]);
      }
    }

    return null;
  }

  /**
   * Find all files that import a given file
   * @param {string} filePath - Target file path
   * @returns {Array} Array of file nodes
   */
  findImporters(filePath) {
    const targetFile = Array.from(this.graph.nodes.values()).find(
      (n) => n.type === 'file' && n.filePath === filePath
    );

    if (!targetFile) return [];

    const importers = [];
    const fileNodes = Array.from(this.graph.nodes.values()).filter(
      (n) => n.type === 'file'
    );

    for (const fileNode of fileNodes) {
      const hasDependency = Array.from(this.graph.edges.values()).some(
        (e) => e.source === fileNode.id && e.target === targetFile.id
      );

      if (hasDependency) {
        importers.push(fileNode);
      }
    }

    return importers;
  }

  /**
   * Find circular dependencies
   * @returns {Array} Array of circular dependency cycles
   */
  findCircularDependencies() {
    const cycles = [];
    const fileNodes = Array.from(this.graph.nodes.values()).filter(
      (n) => n.type === 'file'
    );

    // Build adjacency list
    const adj = new Map();
    for (const fileNode of fileNodes) {
      adj.set(fileNode.id, []);
    }

    for (const edge of this.graph.edges.values()) {
      if (edge.type === 'depends_on') {
        adj.get(edge.source)?.push(edge.target);
      }
    }

    // Detect cycles using DFS
    const visited = new Set();
    const recursionStack = new Set();
    const path = [];

    const dfs = (nodeId) => {
      visited.add(nodeId);
      recursionStack.add(nodeId);
      path.push(nodeId);

      for (const neighbor of adj.get(nodeId) || []) {
        if (!visited.has(neighbor)) {
          dfs(neighbor);
        } else if (recursionStack.has(neighbor)) {
          // Found a cycle
          const cycleStart = path.indexOf(neighbor);
          const cycle = path.slice(cycleStart);
          cycles.push(cycle);
        }
      }

      recursionStack.delete(nodeId);
      path.pop();
    };

    for (const fileNode of fileNodes) {
      if (!visited.has(fileNode.id)) {
        dfs(fileNode.id);
      }
    }

    return cycles;
  }

  /**
   * Generate DOT format for graph visualization
   * @returns {string} DOT format string
   */
  toDot() {
    const lines = ['digraph CodeGraph {'];

    // Add nodes
    for (const node of this.graph.nodes.values()) {
      const label = node.name || node.fileName || node.type || node.id;
      const shape = this.getNodeShape(node.type);
      lines.push(`  "${node.id}" [label="${label}", shape=${shape}];`);
    }

    // Add edges
    for (const edge of this.graph.edges.values()) {
      const label = edge.label || '';
      const style = this.getEdgeStyle(edge.type);
      lines.push(`  "${edge.source}" -> "${edge.target}" [label="${label}", style=${style}];`);
    }

    lines.push('}');
    return lines.join('\n');
  }

  /**
   * Get node shape for DOT format
   * @param {string} type - Node type
   * @returns {string} Shape name
   */
  getNodeShape(type) {
    const shapes = {
      file: 'folder',
      function: 'ellipse',
      class: 'box',
      import: 'note',
      export: 'component',
      api_call: 'diamond',
      route: 'hexagon',
      component: 'oval',
      decorator: 'parallelogram',
      // Dart specific
      mixin: 'trapezium',
      enum: 'polygon',
      extension: 'box3d',
      library: 'tab',
    };
    return shapes[type] || 'ellipse';
  }

  /**
   * Get edge style for DOT format
   * @param {string} type - Edge type
   * @returns {string} Style name
   */
  getEdgeStyle(type) {
    const styles = {
      contains: 'solid',
      depends_on: 'dashed',
      extends: 'bold',
      uses: 'dotted',
    };
    return styles[type] || 'solid';
  }

  /**
   * Serialize graph to JSON
   * @returns {string} JSON string
   */
  toJSON() {
    return JSON.stringify(this.exportGraph(), null, 2);
  }

  /**
   * 获取函数分析报告
   * @returns {Object} 函数分析报告
   */
  getFunctionAnalysisReport() {
    const functionNodes = Array.from(this.graph.nodes.values()).filter(
      (n) => n.type === 'function'
    );

    const report = {
      summary: {
        totalFunctions: functionNodes.length,
        asyncFunctions: functionNodes.filter(f => f.isAsync).length,
        exportedFunctions: functionNodes.filter(f => f.isExported).length,
        recursiveFunctions: functionNodes.filter(f => f.isRecursive || f.isIndirectlyRecursive).length,
        complexityDistribution: {
          low: 0,
          medium: 0,
          high: 0,
          veryHigh: 0,
        },
        purposeDistribution: {},
      },
      functions: [],
      recommendations: [],
    };

    // 统计复杂度分布
    for (const func of functionNodes) {
      if (func.complexity && func.complexity.level) {
        const level = func.complexity.level;
        if (level === 'very-high') {
          report.summary.complexityDistribution.veryHigh++;
        } else {
          report.summary.complexityDistribution[level]++;
        }
      }

      // 统计职责分布
      if (func.purpose && func.purpose.primary) {
        const purpose = func.purpose.primary;
        report.summary.purposeDistribution[purpose] =
          (report.summary.purposeDistribution[purpose] || 0) + 1;
      }

      // 存储函数详情
      report.functions.push({
        id: func.id,
        name: func.name,
        fileName: func.fileName,
        line: func.line,
        isAsync: func.isAsync,
        isExported: func.isExported,
        complexity: func.complexity,
        purpose: func.purpose,
        accessLevel: func.accessLevel,
        calls: func.calls || [],
        calledBy: func.calledBy ? func.calledBy.length : 0,
        isRecursive: func.isRecursive || func.isIndirectlyRecursive || false,
      });

      // 生成建议
      if (func.complexity && func.complexity.level === 'high') {
        report.recommendations.push({
          type: 'refactor',
          function: func.name,
          file: func.fileName,
          message: `函数 ${func.name} 复杂度较高 (${func.complexity.cyclomatic})，建议拆分为更小的函数`,
        });
      }

      if (func.complexity && func.complexity.paramCount > 5) {
        report.recommendations.push({
          type: 'simplify',
          function: func.name,
          file: func.fileName,
          message: `函数 ${func.name} 参数过多 (${func.complexity.paramCount})，考虑使用对象参数`,
        });
      }

      if (func.isRecursive || func.isIndirectlyRecursive) {
        report.recommendations.push({
          type: 'review',
          function: func.name,
          file: func.fileName,
          message: `函数 ${func.name} 存在递归调用，请确保有正确的终止条件`,
        });
      }
    }

    return report;
  }

  /**
   * 获取类分析报告
   * @returns {Object} 类分析报告
   */
  getClassAnalysisReport() {
    const classNodes = Array.from(this.graph.nodes.values()).filter(
      (n) => n.type === 'class'
    );

    const report = {
      summary: {
        totalClasses: classNodes.length,
        withInheritance: classNodes.filter(c => c.superClass).length,
        designPatterns: {},
        purposeDistribution: {},
      },
      classes: [],
    };

    for (const cls of classNodes) {
      // 统计设计模式
      if (cls.patterns && cls.patterns.length > 0) {
        for (const pattern of cls.patterns) {
          report.summary.designPatterns[pattern] =
            (report.summary.designPatterns[pattern] || 0) + 1;
        }
      }

      // 统计职责分布
      if (cls.purpose && cls.purpose.primary) {
        const purpose = cls.purpose.primary;
        report.summary.purposeDistribution[purpose] =
          (report.summary.purposeDistribution[purpose] || 0) + 1;
      }

      // 存储类详情
      report.classes.push({
        id: cls.id,
        name: cls.name,
        fileName: cls.fileName,
        line: cls.line,
        superClass: cls.superClass,
        metrics: cls.metrics,
        purpose: cls.purpose,
        patterns: cls.patterns || [],
        methodCategories: cls.methodCategories || {},
      });
    }

    return report;
  }

  /**
   * Save graph to file
   * @param {string} filePath - Output file path
   */
  saveToFile(filePath) {
    const graph = this.exportGraph();

    try {
      fs.writeFileSync(filePath, JSON.stringify(graph, null, 2));
      return { success: true, filePath };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 获取调用关系图分析结果
   * @param {string} content - 文件内容
   * @param {string} language - 语言类型
   * @returns {Object} 调用关系图分析
   */
  getCallGraphAnalysis(content, language = 'javascript') {
    if (!this.callGraphAnalyzer) {
      this.enableCallGraphAnalysis();
    }

    if (!this.callGraphAnalyzer) {
      return { error: 'Call graph analyzer not available' };
    }

    // 收集所有函数和类
    const functions = [];
    const classes = [];

    for (const node of this.graph.nodes.values()) {
      if (node.type === 'function') {
        functions.push({
          name: node.name,
          line: node.line,
          endLine: node.endLine,
          async: node.isAsync || false,
          params: node.params || [],
          complexity: node.complexity,
          purpose: node.purpose,
        });
      } else if (node.type === 'class') {
        classes.push({
          name: node.name,
          line: node.line,
          methods: node.methods || [],
        });
      }
    }

    // 构建调用关系图
    const callGraph = this.callGraphAnalyzer.buildCallGraph(
      functions,
      classes,
      content,
      language
    );

    return {
      success: true,
      callGraph,
      entryPoints: callGraph.entryPoints,
      callChains: callGraph.callChains,
      dataFlow: callGraph.dataFlow,
      criticalPaths: callGraph.criticalPaths,
      dependencies: callGraph.dependencies,
      circularDeps: callGraph.circularDeps,
    };
  }

  /**
   * 获取业务逻辑摘要
   * @returns {Object} 业务逻辑摘要
   */
  getBusinessLogicSummary() {
    if (!this.callGraphAnalyzer) {
      this.enableCallGraphAnalysis();
    }

    if (!this.callGraphAnalyzer) {
      return { error: 'Call graph analyzer not available' };
    }

    return this.callGraphAnalyzer.generateBusinessLogicSummary();
  }

  /**
   * 获取函数上下文
   * @param {string} funcName - 函数名
   * @returns {Object} 函数上下文
   */
  getFunctionContext(funcName) {
    if (!this.callGraphAnalyzer) {
      this.enableCallGraphAnalysis();
    }

    if (!this.callGraphAnalyzer) {
      return { error: 'Call graph analyzer not available' };
    }

    return this.callGraphAnalyzer.getFunctionContext(funcName);
  }

  /**
   * 生成调用关系图的 DOT 格式
   * @returns {string} DOT 格式字符串
   */
  toCallGraphDot() {
    if (!this.callGraphAnalyzer) {
      this.enableCallGraphAnalysis();
    }

    if (!this.callGraphAnalyzer) {
      return '// Call graph analyzer not available';
    }

    return this.callGraphAnalyzer.toDot();
  }

  /**
   * 分析文件依赖关系
   * @param {string} projectRoot - 项目根目录
   * @param {Object} options - 选项
   * @returns {Object} 文件依赖分析结果
   */
  analyzeFileDependencies(projectRoot, options = {}) {
    if (!this.fileDependencyAnalyzer) {
      this.enableFileDependencyAnalysis();
    }

    if (!this.fileDependencyAnalyzer) {
      return { error: 'File dependency analyzer not available' };
    }

    // 收集所有文件节点
    const files = [];
    for (const node of this.graph.nodes.values()) {
      if (node.type === 'file') {
        files.push({
          path: node.filePath,
          language: node.language,
          imports: node.imports || [],
          exports: node.exports || [],
          lineCount: node.totalLines || 0,
        });
      }
    }

    // 构建文件依赖图
    const depGraph = this.fileDependencyAnalyzer.buildDependencyGraph(files, {
      projectRoot,
      ...options,
    });

    return {
      success: true,
      ...depGraph,
    };
  }

  /**
   * 获取文件依赖树
   * @param {string} projectRoot - 项目根目录
   * @param {string} rootFile - 根文件路径（可选）
   * @returns {Object} 依赖树
   */
  getFileDependencyTree(projectRoot, rootFile = null) {
    if (!this.fileDependencyAnalyzer) {
      this.enableFileDependencyAnalysis();
    }

    if (!this.fileDependencyAnalyzer) {
      return { error: 'File dependency analyzer not available' };
    }

    // 先分析依赖
    const analysis = this.analyzeFileDependencies(projectRoot);

    if (!analysis.success) {
      return analysis;
    }

    // 找到根文件 ID
    let rootFileId = null;
    if (rootFile) {
      rootFileId = this.fileDependencyAnalyzer.generateFileId(rootFile);
    }

    // 构建依赖树
    const trees = this.fileDependencyAnalyzer.buildDependencyTree(rootFileId);

    return {
      success: true,
      trees,
      treeCount: trees.length,
    };
  }

  /**
   * 导出文件依赖图为 DOT 格式
   * @param {string} projectRoot - 项目根目录
   * @param {Object} options - 导出选项
   * @returns {string} DOT 格式
   */
  toFileDependencyDot(projectRoot, options = {}) {
    if (!this.fileDependencyAnalyzer) {
      this.enableFileDependencyAnalysis();
    }

    if (!this.fileDependencyAnalyzer) {
      return '// File dependency analyzer not available';
    }

    // 先分析依赖
    this.analyzeFileDependencies(projectRoot);

    return this.fileDependencyAnalyzer.toDot(options);
  }

  /**
   * 分析 Flutter UI 结构
   * @param {string} projectPath - 项目路径
   * @param {Array} files - Flutter 文件列表
   * @returns {Object} Flutter UI 分析结果
   */
  analyzeFlutterUI(projectPath, files = []) {
    if (!this.flutterUIAnalyzer) {
      this.enableFlutterUIAnalysis();
    }

    if (!this.flutterUIAnalyzer) {
      return { error: 'Flutter UI Analyzer not available' };
    }

    // 如果没有提供文件列表，从代码图中收集 Dart 文件
    if (!files || files.length === 0) {
      files = [];
      for (const node of this.graph.nodes.values()) {
        if (node.type === 'file' && node.language === 'dart') {
          const content = this.getFileContent(node.filePath);
          if (content) {
            files.push({
              path: node.filePath,
              content,
            });
          }
        }
      }
    }

    return this.flutterUIAnalyzer.analyzeProjectUI(files);
  }

  /**
   * 分析单个 Flutter 文件的 UI 结构
   * @param {string} filePath - 文件路径
   * @param {string} content - 文件内容
   * @returns {Object} UI 结构分析结果
   */
  analyzeFlutterFileUI(filePath, content) {
    if (!this.flutterUIAnalyzer) {
      this.enableFlutterUIAnalysis();
    }

    if (!this.flutterUIAnalyzer) {
      return { error: 'Flutter UI Analyzer not available' };
    }

    return this.flutterUIAnalyzer.analyzeFile(filePath, content);
  }

  /**
   * 获取文件内容
   */
  getFileContent(filePath) {
    try {
      return fs.readFileSync(filePath, 'utf8');
    } catch {
      return null;
    }
  }
}

module.exports = CodeGraphGenerator;
