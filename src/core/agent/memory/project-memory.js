/**
 * AI Memory - 项目记忆系统
 *
 * 核心功能：
 * 1. 第一次扫描时构建项目知识并保存为 Memory
 * 2. 后续任务直接从 Memory 加载，避免重新分析
 * 3. 支持增量更新：只更新变化的部分
 * 4. 支持快速检索：根据问题快速找到相关知识
 *
 * Memory 结构：
 * - ProjectMemory: 整个项目的记忆
 *   - FileMemory: 文件级别的记忆
 *   - ModuleMemory: 模块级别的记忆
 *   - PatternMemory: 模式和习惯的记忆
 *   - IssueMemory: 问题和解决方案的记忆
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * 项目记忆类
 */
class ProjectMemory {
  constructor(projectPath) {
    this.projectPath = projectPath;
    this.version = '1.0.0';
    this.createdAt = null;
    this.updatedAt = null;
    this.scanCount = 0;

    // 记忆内容
    this.metadata = {
      name: '',
      type: 'flutter',
      language: 'dart',
      framework: 'flutter',
      description: '',
    };

    // 各维度记忆
    this.files = new Map();        // FileMemory 集合
    this.modules = new Map();       // ModuleMemory 集合
    this.patterns = new Map();      // PatternMemory 集合
    this.issues = new Map();        // IssueMemory 集合
    this.analysis = {};             // 分析结果缓存（AIContext）
    this.embeddings = new Map();    // 语义嵌入（用于相似度搜索）

    // 变更追踪
    this.changelog = [];            // 变更历史
    this.fileHashes = new Map();    // 文件哈希值（用于检测变化）
  }

  /**
   * 创建新的项目记忆
   */
  static async create(projectPath, analysisResult) {
    const memory = new ProjectMemory(projectPath);

    // 设置元数据
    memory.metadata = {
      name: analysisResult.projectInfo?.name || path.basename(projectPath),
      type: analysisResult.projectInfo?.type || 'flutter',
      language: 'dart',
      framework: 'flutter',
      description: analysisResult.projectInfo?.description || '',
    };

    // 设置时间戳
    const now = new Date().toISOString();
    memory.createdAt = now;
    memory.updatedAt = now;
    memory.scanCount = 1;

    // 构建各维度记忆
    await memory.buildFromAnalysis(analysisResult);

    return memory;
  }

  /**
   * 从分析结果构建记忆
   */
  async buildFromAnalysis(analysisResult) {
    // 1. 构建文件记忆
    if (analysisResult.analyzers) {
      await this.buildFileMemories(analysisResult.analyzers);
    }

    // 2. 构建模块记忆
    if (analysisResult.aiContext) {
      await this.buildModuleMemories(analysisResult.aiContext);
    }

    // 3. 构建模式记忆
    await this.buildPatternMemories(analysisResult);

    // 4. 构建问题记忆
    await this.buildIssueMemories(analysisResult);

    // 5. 缓存分析结果
    this.analysis = analysisResult.aiContext || analysisResult;

    // 6. 计算文件哈希
    await this.calculateFileHashes();

    // 7. 记录变更
    this.changelog.push({
      timestamp: new Date().toISOString(),
      type: 'initial_scan',
      description: '初始扫描创建记忆',
      changes: {
        filesAdded: this.files.size,
        modulesAdded: this.modules.size,
        patternsAdded: this.patterns.size,
      },
    });
  }

  /**
   * 构建文件记忆
   */
  async buildFileMemories(analyzers) {
    // 从各个分析器中提取文件信息
    for (const [analyzerName, analyzer] of analyzers) {
      if (!analyzer.data) continue;

      // 根据不同分析器类型提取文件信息
      if (analyzerName.includes('ui')) {
        this.extractFileMemoryFromUI(analyzer.data);
      } else if (analyzerName.includes('model')) {
        this.extractFileMemoryFromModel(analyzer.data);
      } else if (analyzerName.includes('network')) {
        this.extractFileMemoryFromNetwork(analyzer.data);
      } else if (analyzerName.includes('service')) {
        this.extractFileMemoryFromService(analyzer.data);
      } else if (analyzerName.includes('routing')) {
        this.extractFileMemoryFromRouting(analyzer.data);
      } else if (analyzerName.includes('test')) {
        this.extractFileMemoryFromTest(analyzer.data);
      } else if (analyzerName.includes('state')) {
        this.extractFileMemoryFromState(analyzer.data);
      }
    }
  }

  extractFileMemoryFromUI(data) {
    if (!data.pages) return;

    for (const page of data.pages) {
      const fileMemory = this.getOrCreateFileMemory(page.fileName);
      fileMemory.type = 'page';
      fileMemory.category = 'ui';
      fileMemory.name = page.name;
      fileMemory.exportedName = page.name;
      fileMemory.line = page.line;
      fileMemory.isStateful = page.isStateful || false;

      // 添加到 UI 模块
      this.addToModule('ui', {
        type: 'page',
        name: page.name,
        file: page.fileName,
      });
    }

    if (data.widgets) {
      for (const widget of data.widgets) {
        const fileMemory = this.getOrCreateFileMemory(widget.fileName);
        if (!fileMemory.widgets) fileMemory.widgets = [];
        fileMemory.widgets.push({
          type: widget.type,
          name: widget.name,
          line: widget.line,
        });
      }
    }
  }

  extractFileMemoryFromModel(data) {
    if (!data.models) return;

    for (const model of data.models) {
      const fileMemory = this.getOrCreateFileMemory(model.fileName);
      fileMemory.type = 'model';
      fileMemory.category = 'data';
      fileMemory.name = model.name;
      fileMemory.exportedName = model.name;
      fileMemory.line = model.line;
      fileMemory.hasSerialization = model.hasSerialization || false;
      fileMemory.fields = model.fields || [];

      // 添加到数据模块
      this.addToModule('data', {
        type: 'model',
        name: model.name,
        file: model.fileName,
      });
    }
  }

  extractFileMemoryFromNetwork(data) {
    if (!data.endpoints) return;

    for (const endpoint of data.endpoints) {
      const fileMemory = this.getOrCreateFileMemory(endpoint.fileName);
      if (!fileMemory.endpoints) fileMemory.endpoints = [];
      fileMemory.endpoints.push({
        method: endpoint.method,
        path: endpoint.path,
        line: endpoint.line,
      });
    }
  }

  extractFileMemoryFromService(data) {
    if (!data.services) return;

    for (const service of data.services) {
      const fileMemory = this.getOrCreateFileMemory(service.fileName);
      fileMemory.type = 'service';
      fileMemory.category = 'business';
      fileMemory.name = service.name;
      fileMemory.exportedName = service.name;
      fileMemory.line = service.line;
      fileMemory.methods = service.methods || [];

      // 添加到业务模块
      this.addToModule('business', {
        type: 'service',
        name: service.name,
        file: service.fileName,
      });
    }
  }

  extractFileMemoryFromRouting(data) {
    if (!data.routes) return;

    for (const route of data.routes) {
      const fileMemory = this.getOrCreateFileMemory(route.fileName);
      if (!fileMemory.routes) fileMemory.routes = [];
      fileMemory.routes.push({
        path: route.path,
        page: route.page,
        line: route.line,
      });
    }
  }

  extractFileMemoryFromTest(data) {
    if (!data.testableElements) return;

    for (const element of data.testableElements) {
      const fileMemory = this.getOrCreateFileMemory(element.fileName);
      if (!fileMemory.testableElements) fileMemory.testableElements = [];
      fileMemory.testableElements.push({
        type: element.type,
        widget: element.widget,
        key: element.key,
        testable: element.testable,
        line: element.line,
      });
    }
  }

  extractFileMemoryFromState(data) {
    if (!data.states) return;

    for (const state of data.states) {
      const fileMemory = this.getOrCreateFileMemory(state.fileName);
      if (!fileMemory.states) fileMemory.states = [];
      fileMemory.states.push({
        name: state.name,
        type: state.type,
        managed: state.managed,
      });
    }
  }

  /**
   * 构建模块记忆
   */
  async buildModuleMemories(aiContext) {
    // UI 模块
    if (aiContext.ui?.pages) {
      const uiModule = this.modules.get('ui') || { name: 'ui', items: [] };
      for (const page of aiContext.ui.pages) {
        uiModule.items.push({
          type: 'page',
          name: page.name,
          file: page.file,
          description: `页面：${page.name}`,
        });
      }
      this.modules.set('ui', uiModule);
    }

    // 数据模块
    if (aiContext.data?.models) {
      const dataModule = this.modules.get('data') || { name: 'data', items: [] };
      for (const model of aiContext.data.models) {
        dataModule.items.push({
          type: 'model',
          name: model.name,
          file: model.file,
          description: `数据模型：${model.name}`,
        });
      }
      this.modules.set('data', dataModule);
    }

    // 业务模块
    if (aiContext.business?.routes) {
      const businessModule = this.modules.get('business') || { name: 'business', items: [] };
      for (const route of aiContext.business.routes) {
        businessModule.items.push({
          type: 'route',
          name: route.path,
          page: route.page,
          description: `路由：${route.path} → ${route.page}`,
        });
      }
      this.modules.set('business', businessModule);
    }
  }

  /**
   * 构建模式记忆
   */
  async buildPatternMemories(analysisResult) {
    // 识别项目中的模式
    const patterns = {
      naming: this.identifyNamingPatterns(analysisResult),
      architecture: this.identifyArchitecturePatterns(analysisResult),
      stateManagement: this.identifyStatePatterns(analysisResult),
      api: this.identifyAPIPatterns(analysisResult),
      testing: this.identifyTestingPatterns(analysisResult),
    };

    for (const [patternType, patternData] of Object.entries(patterns)) {
      if (patternData && Object.keys(patternData).length > 0) {
        this.patterns.set(patternType, patternData);
      }
    }
  }

  identifyNamingPatterns(analysis) {
    // 分析命名规范
    const patterns = {
      classNaming: 'PascalCase', // 默认
      variableNaming: 'camelCase',
      fileNaming: 'snake_case',
    };

    // TODO: 实际分析文件名和类名
    return patterns;
  }

  identifyArchitecturePatterns(analysis) {
    // 识别架构模式
    const patterns = {
      type: 'unknown', // layered, clean_architecture, mvvm, etc.
      layers: [],
    };

    // 检查是否有分层
    if (analysis.aiContext?.code) {
      const hasServices = analysis.aiContext.code.callGraph?.nodes?.some(n => n.type === 'service');
      const hasRepositories = analysis.aiContext.code.callGraph?.nodes?.some(n => n.type === 'repository');
      const hasModels = analysis.aiContext.data?.models?.length > 0;

      if (hasServices && hasRepositories && hasModels) {
        patterns.type = 'layered';
        patterns.layers = ['ui', 'business', 'data'];
      }
    }

    return patterns;
  }

  identifyStatePatterns(analysis) {
    // 识别状态管理模式
    const patterns = {
      framework: 'unknown', // provider, bloc, getx, riverpod, etc.
      hasGlobalState: false,
      stateCount: 0,
    };

    // 从状态分析器获取信息
    if (analysis.analyzers) {
      const stateAnalyzer = analysis.analyzers.get('flutter-state-analyzer');
      if (stateAnalyzer?.data) {
        patterns.stateCount = stateAnalyzer.data.states?.length || 0;
        patterns.hasGlobalState = stateAnalyzer.data.hasGlobalState || false;
        patterns.framework = stateAnalyzer.data.framework || 'unknown';
      }
    }

    return patterns;
  }

  identifyAPIPatterns(analysis) {
    // 识别 API 模式
    const patterns = {
      style: 'unknown', // rest, graphql, etc.
      hasErrorHandling: false,
      authentication: 'unknown',
      baseUrl: '',
    };

    // 从网络分析器获取信息
    if (analysis.analyzers) {
      const networkAnalyzer = analysis.analyzers.get('flutter-network-analyzer');
      if (networkAnalyzer?.data) {
        patterns.hasErrorHandling = networkAnalyzer.data.errorHandlingCoverage > 0.5;
        patterns.authentication = networkAnalyzer.data.authentication || 'unknown';
        patterns.baseUrl = networkAnalyzer.data.baseUrl || '';
        patterns.style = 'rest'; // 默认假设 REST
      }
    }

    return patterns;
  }

  identifyTestingPatterns(analysis) {
    // 识别测试模式
    const patterns = {
      framework: 'unknown', // flutter_test, mockito, etc.
      coverage: 0,
      testTypes: [],
    };

    // 从测试分析器获取信息
    if (analysis.analyzers) {
      const testAnalyzer = analysis.analyzers.get('flutter-test-analyzer');
      if (testAnalyzer?.data) {
        patterns.coverage = testAnalyzer.data.testableRatio || 0;
        patterns.framework = 'flutter_test';
      }
    }

    return patterns;
  }

  /**
   * 构建问题记忆
   */
  async buildIssueMemories(analysisResult) {
    const issues = [];

    // 从各个分析器收集问题
    if (analysisResult.analyzers) {
      for (const [analyzerName, analyzer] of analysisResult.analyzers) {
        if (!analyzer.data?.issues) continue;

        for (const issue of analyzer.data.issues) {
          issues.push({
            ...issue,
            source: analyzerName,
            severity: this.mapIssueSeverity(issue.type),
          });
        }
      }
    }

    // 按类型分组
    for (const issue of issues) {
      const type = issue.type || 'unknown';
      const typeIssues = this.issues.get(type) || [];
      typeIssues.push(issue);
      this.issues.set(type, typeIssues);
    }
  }

  mapIssueSeverity(type) {
    const severityMap = {
      'error': 'high',
      'critical': 'critical',
      'warning': 'medium',
      'info': 'low',
      'suggestion': 'low',
    };
    return severityMap[type] || 'medium';
  }

  /**
   * 计算文件哈希（用于检测变化）
   */
  async calculateFileHashes() {
    for (const [filePath, fileMemory] of this.files) {
      try {
        const fullPath = path.join(this.projectPath, filePath);
        if (fs.existsSync(fullPath)) {
          const content = fs.readFileSync(fullPath, 'utf8');
          const hash = crypto.createHash('md5').update(content).digest('hex');
          this.fileHashes.set(filePath, hash);
        }
      } catch (error) {
        // 文件可能不存在或无法读取
      }
    }
  }

  /**
   * 增量更新记忆
   */
  async update(newAnalysisResult) {
    const changes = {
      filesModified: [],
      filesAdded: [],
      filesRemoved: [],
      issuesResolved: [],
      issuesAdded: [],
    };

    // 1. 检测文件变化
    const newFileHashes = new Map();
    if (newAnalysisResult.analyzers) {
      for (const [analyzerName, analyzer] of newAnalysisResult.analyzers) {
        if (!analyzer.data) continue;

        // 提取文件路径并计算哈希
        this.extractFilePaths(analyzer.data, newFileHashes);
      }
    }

    // 比较哈希值
    for (const [filePath, newHash] of newFileHashes) {
      const oldHash = this.fileHashes.get(filePath);

      if (!oldHash) {
        // 新文件
        changes.filesAdded.push(filePath);
      } else if (oldHash !== newHash) {
        // 文件已修改
        changes.filesModified.push(filePath);
      }
    }

    // 检测删除的文件
    for (const [filePath, oldHash] of this.fileHashes) {
      if (!newFileHashes.has(filePath)) {
        changes.filesRemoved.push(filePath);
      }
    }

    // 2. 更新记忆内容
    await this.buildFromAnalysis(newAnalysisResult);

    // 3. 更新元数据
    this.updatedAt = new Date().toISOString();
    this.scanCount += 1;

    // 4. 记录变更
    this.changelog.push({
      timestamp: new Date().toISOString(),
      type: 'incremental_update',
      description: '增量更新记忆',
      changes,
    });

    return changes;
  }

  extractFilePaths(data, hashMap) {
    // 递归提取文件路径
    if (typeof data !== 'object' || data === null) return;

    if (data.fileName) {
      try {
        const fullPath = path.join(this.projectPath, data.fileName);
        if (fs.existsSync(fullPath)) {
          const content = fs.readFileSync(fullPath, 'utf8');
          const hash = crypto.createHash('md5').update(content).digest('hex');
          hashMap.set(data.fileName, hash);
        }
      } catch (error) {
        // 忽略错误
      }
    }

    for (const key of Object.keys(data)) {
      if (Array.isArray(data[key])) {
        for (const item of data[key]) {
          this.extractFilePaths(item, hashMap);
        }
      } else if (typeof data[key] === 'object') {
        this.extractFilePaths(data[key], hashMap);
      }
    }
  }

  /**
   * 检索相关知识
   */
  retrieve(query, options = {}) {
    const {
      type = null,      // 'file', 'module', 'pattern', 'issue'
      category = null,  // 'ui', 'data', 'business', etc.
      limit = 10,
    } = options;

    const results = [];

    // 根据类型检索
    if (type === null || type === 'file') {
      for (const [filePath, fileMemory] of this.files) {
        if (category && fileMemory.category !== category) continue;
        if (this.matchesQuery(fileMemory, query)) {
          results.push({
            type: 'file',
            data: fileMemory,
            relevance: this.calculateRelevance(fileMemory, query),
          });
        }
      }
    }

    if (type === null || type === 'module') {
      for (const [moduleName, moduleMemory] of this.modules) {
        if (this.matchesQuery(moduleMemory, query)) {
          results.push({
            type: 'module',
            data: moduleMemory,
            relevance: this.calculateRelevance(moduleMemory, query),
          });
        }
      }
    }

    if (type === null || type === 'pattern') {
      for (const [patternName, patternMemory] of this.patterns) {
        if (this.matchesQuery(patternMemory, query)) {
          results.push({
            type: 'pattern',
            data: patternMemory,
            relevance: this.calculateRelevance(patternMemory, query),
          });
        }
      }
    }

    if (type === null || type === 'issue') {
      for (const [issueType, issues] of this.issues) {
        for (const issue of issues) {
          if (this.matchesQuery(issue, query)) {
            results.push({
              type: 'issue',
              data: issue,
              relevance: this.calculateRelevance(issue, query),
            });
          }
        }
      }
    }

    // 按相关性排序并限制结果数量
    results.sort((a, b) => b.relevance - a.relevance);
    return results.slice(0, limit);
  }

  matchesQuery(data, query) {
    const queryLower = query.toLowerCase();
    const dataString = JSON.stringify(data).toLowerCase();
    return dataString.includes(queryLower);
  }

  calculateRelevance(data, query) {
    // 简单的相关性计算
    const queryLower = query.toLowerCase();
    const dataString = JSON.stringify(data).toLowerCase();

    // 精确匹配
    if (dataString.includes(queryLower)) {
      return 1.0;
    }

    // 部分匹配
    const queryWords = queryLower.split(/\s+/);
    let matchCount = 0;
    for (const word of queryWords) {
      if (dataString.includes(word)) {
        matchCount++;
      }
    }
    return matchCount / queryWords.length;
  }

  /**
   * 获取或创建文件记忆
   */
  getOrCreateFileMemory(filePath) {
    if (!this.files.has(filePath)) {
      this.files.set(filePath, {
        path: filePath,
        type: 'unknown',
        category: 'unknown',
        name: '',
        exportedName: '',
        line: 0,
        widgets: [],
        endpoints: [],
        routes: [],
        testableElements: [],
        states: [],
      });
    }
    return this.files.get(filePath);
  }

  /**
   * 添加到模块
   */
  addToModule(moduleName, item) {
    const module = this.modules.get(moduleName) || { name: moduleName, items: [] };
    module.items.push(item);
    this.modules.set(moduleName, module);
  }

  /**
   * 导出为 JSON
   */
  toJSON() {
    return {
      version: this.version,
      projectPath: this.projectPath,
      metadata: this.metadata,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      scanCount: this.scanCount,
      files: Array.from(this.files.entries()),
      modules: Array.from(this.modules.entries()),
      patterns: Array.from(this.patterns.entries()),
      issues: Array.from(this.issues.entries()),
      analysis: this.analysis,
      changelog: this.changelog,
      fileHashes: Array.from(this.fileHashes.entries()),
    };
  }

  /**
   * 从 JSON 导入
   */
  static fromJSON(json) {
    const memory = new ProjectMemory(json.projectPath);
    memory.version = json.version;
    memory.metadata = json.metadata;
    memory.createdAt = json.createdAt;
    memory.updatedAt = json.updatedAt;
    memory.scanCount = json.scanCount;
    memory.files = new Map(json.files);
    memory.modules = new Map(json.modules);
    memory.patterns = new Map(json.patterns);
    memory.issues = new Map(json.issues);
    memory.analysis = json.analysis;
    memory.changelog = json.changelog;
    memory.fileHashes = new Map(json.fileHashes);
    return memory;
  }
}

/**
 * Memory Manager - 记忆管理器
 */
class MemoryManager {
  constructor() {
    this.memoryDir = path.join(process.cwd(), '.memory');
    this.currentMemory = null;
  }

  /**
   * 初始化记忆目录
   */
  init() {
    if (!fs.existsSync(this.memoryDir)) {
      fs.mkdirSync(this.memoryDir, { recursive: true });
    }
  }

  /**
   * 获取项目记忆文件路径
   */
  getMemoryFilePath(projectPath) {
    const projectHash = crypto.createHash('md5').update(projectPath).digest('hex');
    return path.join(this.memoryDir, `${projectHash}.json`);
  }

  /**
   * 保存记忆到磁盘
   */
  async save(memory) {
    this.init();

    const filePath = this.getMemoryFilePath(memory.projectPath);
    const json = JSON.stringify(memory.toJSON(), null, 2);
    fs.writeFileSync(filePath, json, 'utf8');

    console.log(`✓ 记忆已保存到: ${filePath}`);
  }

  /**
   * 从磁盘加载记忆
   */
  async load(projectPath) {
    this.init();

    const filePath = this.getMemoryFilePath(projectPath);

    if (!fs.existsSync(filePath)) {
      return null; // 记忆不存在
    }

    try {
      const json = fs.readFileSync(filePath, 'utf8');
      const memoryData = JSON.parse(json);
      this.currentMemory = ProjectMemory.fromJSON(memoryData);
      console.log(`✓ 记忆已加载: ${filePath}`);
      console.log(`  - 创建时间: ${this.currentMemory.createdAt}`);
      console.log(`  - 扫描次数: ${this.currentMemory.scanCount}`);
      return this.currentMemory;
    } catch (error) {
      console.error(`✗ 加载记忆失败:`, error.message);
      return null;
    }
  }

  /**
   * 检查记忆是否存在
   */
  exists(projectPath) {
    const filePath = this.getMemoryFilePath(projectPath);
    return fs.existsSync(filePath);
  }

  /**
   * 删除记忆
   */
  async delete(projectPath) {
    const filePath = this.getMemoryFilePath(projectPath);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`✓ 记忆已删除: ${filePath}`);
    }
  }

  /**
   * 列出所有记忆
   */
  list() {
    this.init();

    const files = fs.readdirSync(this.memoryDir);
    const memories = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      try {
        const filePath = path.join(this.memoryDir, file);
        const json = fs.readFileSync(filePath, 'utf8');
        const memoryData = JSON.parse(json);
        memories.push({
          id: file.replace('.json', ''),
          projectPath: memoryData.projectPath,
          name: memoryData.metadata.name,
          createdAt: memoryData.createdAt,
          updatedAt: memoryData.updatedAt,
          scanCount: memoryData.scanCount,
        });
      } catch (error) {
        // 跳过损坏的文件
      }
    }

    return memories;
  }

  /**
   * 获取当前记忆
   */
  getCurrent() {
    return this.currentMemory;
  }

  /**
   * 设置当前记忆
   */
  setCurrent(memory) {
    this.currentMemory = memory;
  }
}

module.exports = {
  ProjectMemory,
  MemoryManager,
};
