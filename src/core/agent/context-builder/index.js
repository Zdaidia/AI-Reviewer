/**
 * AI Context Builder - AI 上下文构建器
 *
 * 职责:
 * - 收集和整合所有分析器数据
 * - 构建结构化的 AI 上下文（5 个维度）
 * - 根据问题类型优化上下文
 * - 管理上下文大小和格式
 * - 提供上下文模板和提示词
 * - 支持 RAG（检索增强生成）
 * - 集成 Memory 系统（首次扫描保存，后续直接使用）
 *
 * 核心功能:
 * - 分析器数据整合
 * - 上下文构建策略
 * - 问题理解和分类
 * - 相关性评分和排序
 * - 上下文压缩和优化
 * - Memory 集成（快速加载、增量更新）
 *
 * 输出结构 (AIContext):
 * - FileContext: 文件上下文（项目结构、模块划分）
 * - CodeContext: 代码逻辑（Call Graph、数据流向）
 * - UIContext: UI 结构（Widget Tree、页面关系）
 * - DataContext: 数据结构（Models、API 匹配）
 * - BusinessContext: 业务流程（routes、userFlow）
 *
 * 工作流程:
 * 1. 首次扫描 → 构建项目知识 → 保存为 Memory
 * 2. 后续任务 → 从 Memory 加载 → 快速构建 Context
 * 3. 检测变化 → 增量更新 Memory
 */

const path = require('path');
const { AIContext } = require('./ai-context');
const { MemoryManager, ProjectMemory } = require('../memory/project-memory');

class AIContextBuilder {
  constructor(options = {}) {
    // 分析器实例
    this.analyzers = new Map();

    // 上下文缓存
    this.contextCache = new Map();

    // 问题历史
    this.questionHistory = [];

    // Memory 管理器
    this.memoryManager = new MemoryManager();
    this.currentMemory = null;

    // 上下文配置
    this.config = {
      maxContextLength: 50000,    // 最大上下文长度（字符）
      maxTokenCount: 12000,        // 最大 token 数（约 4000 tokens）
      compressionRatio: 0.5,       // 压缩比率
      relevanceThreshold: 0.3,      // 相关性阈值
      maxHistoryLength: 10,         // 最大历史记录数
      useMemory: true,             // 是否使用 Memory
      autoUpdateMemory: true,      // 是否自动更新 Memory
      memoryUpdateInterval: 300000, // Memory 更新间隔（5分钟）
    };

    // 合并用户配置
    if (options.config) {
      Object.assign(this.config, options.config);
    }

    // 分析器注册表
    this.analyzerRegistry = [
      'flutter-ui-analyzer',
      'flutter-component-analyzer',
      'flutter-service-analyzer',
      'flutter-repository-analyzer',
      'flutter-state-analyzer',
      'flutter-model-analyzer',
      'flutter-ui-action-analyzer',
      'flutter-network-analyzer',
      'flutter-routing-analyzer',
      'flutter-test-analyzer',
    ];
  }

  /**
   * 初始化所有分析器
   */
  initializeAnalyzers(projectPath) {
    const srcPath = path.join(projectPath, 'src', 'core');

    for (const analyzerName of this.analyzerRegistry) {
      try {
        const AnalyzerClass = require(path.join(srcPath, analyzerName));
        this.analyzers.set(analyzerName, new AnalyzerClass());
        console.log(`✓ 加载分析器: ${analyzerName}`);
      } catch (error) {
        console.warn(`⚠ 无法加载分析器: ${analyzerName}`, error.message);
      }
    }
  }

  /**
   * 构建问题上下文（新版 - 集成 Memory）
   * @param {string} question - 用户问题
   * @param {Object} projectInfo - 项目信息
   * @param {Object} options - 构建选项
   * @returns {Promise<AIContext>} 构建的 AI 上下文
   */
  async buildQuestionContext(question, projectInfo, options = {}) {
    const {
      maxTokens = this.config.maxTokenCount,
      includeFullAnalysis = false,
      focusAreas = [],
      previousContext = null,
      forceScan = false, // 强制重新扫描
      useMemory = this.config.useMemory,
    } = options;

    // 1. 理解问题
    const questionAnalysis = this.analyzeQuestion(question);

    // 2. 尝试从 Memory 加载（如果启用且存在）
    if (useMemory && !forceScan) {
      const memoryContext = await this.buildFromMemory(question, projectInfo, questionAnalysis, options);
      if (memoryContext) {
        console.log('✓ 从 Memory 加载上下文');
        return memoryContext;
      }
    }

    // 3. Memory 不存在或强制扫描，执行完整分析
    console.log('→ 执行完整分析...');
    const aiContext = await this.buildFromAnalysis(question, projectInfo, questionAnalysis, options);

    // 4. 如果启用 Memory，保存分析结果
    if (useMemory && this.config.autoUpdateMemory) {
      await this.updateProjectMemory(projectInfo, aiContext, questionAnalysis);
    }

    return aiContext;
  }

  /**
   * 从 Memory 构建上下文（快速路径）
   */
  async buildFromMemory(question, projectInfo, questionAnalysis, options) {
    // 尝试加载 Memory
    if (!this.currentMemory) {
      this.currentMemory = await this.memoryManager.load(projectInfo.path);
    }

    if (!this.currentMemory) {
      return null; // Memory 不存在
    }

    // 检查 Memory 是否过期
    const memoryAge = Date.now() - new Date(this.currentMemory.updatedAt).getTime();
    if (memoryAge > this.config.memoryUpdateInterval) {
      console.log('⚠ Memory 已过期，触发更新...');
      await this.refreshMemory(projectInfo);
    }

    // 从 Memory 构建 AIContext
    const aiContext = this.buildAIContextFromMemory(
      question,
      projectInfo,
      questionAnalysis,
      this.currentMemory
    );

    // 记录到历史
    this.addToHistory(question, ['memory']);

    return aiContext;
  }

  /**
   * 从 Memory 数据构建 AIContext
   */
  buildAIContextFromMemory(question, projectInfo, questionAnalysis, memory) {
    const aiContext = new AIContext();

    // 设置元数据
    aiContext.metadata = {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      project: {
        name: memory.metadata.name,
        type: memory.metadata.type,
        path: projectInfo.path,
      },
      question: {
        original: question,
        analysis: questionAnalysis,
      },
      source: 'memory', // 标记来源为 Memory
      memoryInfo: {
        createdAt: memory.createdAt,
        updatedAt: memory.updatedAt,
        scanCount: memory.scanCount,
      },
    };

    // 从 Memory 构建 FileContext
    aiContext.file = this.buildFileContextFromMemory(memory);

    // 从 Memory 构建 CodeContext
    aiContext.code = this.buildCodeContextFromMemory(memory);

    // 从 Memory 构建 UIContext
    aiContext.ui = this.buildUIContextFromMemory(memory);

    // 从 Memory 构建 DataContext
    aiContext.data = this.buildDataContextFromMemory(memory);

    // 从 Memory 构建 BusinessContext
    aiContext.business = this.buildBusinessContextFromMemory(memory);

    return aiContext;
  }

  /**
   * 从 Memory 构建 FileContext
   */
  buildFileContextFromMemory(memory) {
    const { FileContext } = require('./ai-context');
    const context = new FileContext();

    context.metadata = {
      totalFiles: memory.files.size,
      totalLines: 0, // Memory 中可能没有
      language: memory.metadata.language,
      framework: memory.metadata.framework,
    };

    // 构建文件列表
    for (const [filePath, fileMemory] of memory.files) {
      context.structure.files.push({
        path: filePath,
        type: fileMemory.type,
        category: fileMemory.category,
      });
    }

    return context;
  }

  /**
   * 从 Memory 构建 CodeContext
   */
  buildCodeContextFromMemory(memory) {
    const { CodeContext } = require('./ai-context');
    const context = new CodeContext();

    // 从模式记忆中获取调用图信息
    const architecturePattern = memory.patterns.get('architecture');
    if (architecturePattern) {
      context.callGraph = {
        nodes: [],
        edges: [],
        entryPoints: architecturePattern.entryPoints || [],
      };
    }

    return context;
  }

  /**
   * 从 Memory 构建 UIContext
   */
  buildUIContextFromMemory(memory) {
    const { UIContext } = require('./ai-context');
    const context = new UIContext();

    // 从文件记忆中提取页面
    for (const [filePath, fileMemory] of memory.files) {
      if (fileMemory.type === 'page') {
        context.pages.push({
          name: fileMemory.name,
          type: fileMemory.isStateful ? 'StatefulWidget' : 'StatelessWidget',
          file: filePath,
          line: fileMemory.line,
        });
      }
    }

    // 从模块记忆中获取路由信息
    const businessModule = memory.modules.get('business');
    if (businessModule) {
      for (const item of businessModule.items) {
        if (item.type === 'route') {
          context.navigation.routes.push({
            path: item.name,
            page: item.page,
          });
        }
      }
    }

    return context;
  }

  /**
   * 从 Memory 构建 DataContext
   */
  buildDataContextFromMemory(memory) {
    const { DataContext } = require('./ai-context');
    const context = new DataContext();

    // 从文件记忆中提取模型
    for (const [filePath, fileMemory] of memory.files) {
      if (fileMemory.type === 'model') {
        context.models.push({
          name: fileMemory.name,
          fields: fileMemory.fields || [],
          hasSerialization: fileMemory.hasSerialization || false,
          file: filePath,
        });
      }

      // 提取 API 端点
      if (fileMemory.endpoints) {
        for (const endpoint of fileMemory.endpoints) {
          context.apis.push({
            method: endpoint.method,
            path: endpoint.path,
            file: filePath,
            line: endpoint.line,
          });
        }
      }
    }

    // 从问题记忆中添加验证信息
    for (const [issueType, issues] of memory.issues) {
      if (issueType === 'error') {
        for (const issue of issues) {
          if (issue.message.includes('序列化')) {
            context.validation.missingSerialization.push(issue.message);
          }
        }
      }
    }

    return context;
  }

  /**
   * 从 Memory 构建 BusinessContext
   */
  buildBusinessContextFromMemory(memory) {
    const { BusinessContext } = require('./ai-context');
    const context = new BusinessContext();

    // 从模块记忆中获取路由
    const businessModule = memory.modules.get('business');
    if (businessModule) {
      for (const item of businessModule.items) {
        if (item.type === 'route') {
          context.routes.push({
            path: item.name,
            page: item.page,
            type: 'named',
          });
        }
      }
    }

    // 从模式记忆中获取状态管理信息
    const statePattern = memory.patterns.get('stateManagement');
    if (statePattern) {
      context.states.managed = statePattern.managedStates || [];
      context.states.unmanaged = statePattern.unmanagedStates || [];
    }

    return context;
  }

  /**
   * 从完整分析构建上下文（慢速路径）
   */
  async buildFromAnalysis(question, projectInfo, questionAnalysis, options) {
    const {
      maxTokens = this.config.maxTokenCount,
      focusAreas = [],
    } = options;

    // 1. 确定需要的分析器
    const requiredAnalyzers = this.determineRequiredAnalyzers(questionAnalysis, focusAreas);

    // 2. 收集分析器数据
    const analyzerData = this.collectAnalyzerData(requiredAnalyzers, projectInfo);

    // 3. 计算相关性并排序
    const rankedData = this.rankByRelevance(analyzerData, questionAnalysis);

    // 4. 构建 AIContext
    const aiContext = AIContext.build(
      question,
      projectInfo,
      this.analyzers,
      questionAnalysis
    );

    // 5. 优化上下文
    const optimizedContext = this.optimizeAIContext(aiContext, questionAnalysis, rankedData, maxTokens);

    // 6. 记录到历史
    const usedAnalyzers = rankedData.map(r => r.analyzerName);
    this.addToHistory(question, usedAnalyzers);

    return optimizedContext;
  }

  /**
   * 首次扫描并保存 Memory
   */
  async scanAndBuildMemory(projectInfo, analyzers) {
    console.log('→ 首次扫描，构建项目记忆...');

    // 设置分析器
    this.analyzers = analyzers;

    // 构建分析结果
    const analysisResult = {
      projectInfo,
      analyzers: this.analyzers,
      aiContext: null, // 稍后填充
    };

    // 创建 Memory
    this.currentMemory = await ProjectMemory.create(projectInfo.path, analysisResult);

    // 保存 Memory
    await this.memoryManager.save(this.currentMemory);

    console.log('✓ 项目记忆已创建并保存');

    return this.currentMemory;
  }

  /**
   * 更新项目 Memory
   */
  async updateProjectMemory(projectInfo, aiContext, questionAnalysis) {
    const analysisResult = {
      projectInfo,
      analyzers: this.analyzers,
      aiContext,
      questionAnalysis,
    };

    if (this.currentMemory) {
      // 增量更新
      const changes = await this.currentMemory.update(analysisResult);
      console.log(`✓ Memory 已更新: ${JSON.stringify(changes)}`);
    } else {
      // 创建新 Memory
      this.currentMemory = await ProjectMemory.create(projectInfo.path, analysisResult);
    }

    // 保存到磁盘
    await this.memoryManager.save(this.currentMemory);
  }

  /**
   * 刷新 Memory（检测变化并更新）
   */
  async refreshMemory(projectInfo) {
    console.log('→ 刷新项目记忆...');

    // 重新分析项目
    const analysisResult = {
      projectInfo,
      analyzers: this.analyzers,
    };

    // 更新 Memory
    if (this.currentMemory) {
      const changes = await this.currentMemory.update(analysisResult);
      console.log(`✓ Memory 已刷新: ${JSON.stringify(changes)}`);
    }

    // 保存到磁盘
    await this.memoryManager.save(this.currentMemory);
  }

  /**
   * 清除 Memory
   */
  async clearMemory(projectPath) {
    await this.memoryManager.delete(projectPath);
    this.currentMemory = null;
    console.log('✓ Memory 已清除');
  }

  /**
   * 获取当前 Memory
   */
  getCurrentMemory() {
    return this.currentMemory;
  }

  /**
   * 检查 Memory 是否存在
   */
  async hasMemory(projectPath) {
    return this.memoryManager.exists(projectPath);
  }

  /**
   * 优化 AI 上下文（根据相关性和 Token 限制）
   */
  optimizeAIContext(aiContext, questionAnalysis, rankedData, maxTokens) {
    // 根据问题类型确定需要优化的维度
    const relevantDimensions = this.determineRelevantDimensions(questionAnalysis);

    // 估算当前 token 数
    const currentTokens = this.estimateContextTokens(aiContext);

    if (currentTokens <= maxTokens) {
      return aiContext; // 无需优化
    }

    // 计算压缩比率
    const compressionRatio = maxTokens / currentTokens;

    // 根据相关性压缩各个维度
    if (!relevantDimensions.includes('code')) {
      this.compressDimension(aiContext.code, compressionRatio);
    }
    if (!relevantDimensions.includes('ui')) {
      this.compressDimension(aiContext.ui, compressionRatio);
    }
    if (!relevantDimensions.includes('data')) {
      this.compressDimension(aiContext.data, compressionRatio);
    }
    if (!relevantDimensions.includes('business')) {
      this.compressDimension(aiContext.business, compressionRatio);
    }

    return aiContext;
  }

  /**
   * 确定与问题相关的维度
   */
  determineRelevantDimensions(questionAnalysis) {
    const dimensions = [];

    const intentDimensionMap = {
      'ui_analysis': ['ui', 'code'],
      'data_analysis': ['data', 'code'],
      'business_logic_analysis': ['business', 'code'],
      'network_analysis': ['data', 'code'],
      'testing_analysis': ['ui', 'business'],
      'routing_analysis': ['business', 'ui'],
      'state_management_analysis': ['code', 'business'],
    };

    const mapped = intentDimensionMap[questionAnalysis.intent];
    if (mapped) {
      dimensions.push(...mapped);
    }

    return dimensions;
  }

  /**
   * 压缩上下文维度
   */
  compressDimension(dimension, ratio) {
    // 截断数组类型的数据
    if (dimension.pages) {
      dimension.pages = dimension.pages.slice(0, Math.ceil(dimension.pages.length * ratio));
    }
    if (dimension.widgets) {
      dimension.widgets = dimension.widgets.slice(0, Math.ceil(dimension.widgets.length * ratio));
    }
    if (dimension.models) {
      dimension.models = dimension.models.slice(0, Math.ceil(dimension.models.length * ratio));
    }
    if (dimension.apis) {
      dimension.apis = dimension.apis.slice(0, Math.ceil(dimension.apis.length * ratio));
    }
    if (dimension.userFlows) {
      dimension.userFlows = dimension.userFlows.slice(0, Math.ceil(dimension.userFlows.length * ratio));
    }
    if (dimension.callGraph?.nodes) {
      dimension.callGraph.nodes = dimension.callGraph.nodes.slice(0, Math.ceil(dimension.callGraph.nodes.length * ratio));
    }
  }

  /**
   * 估算上下文的 token 数
   */
  estimateContextTokens(aiContext) {
    // 粗略估算：中文字符约 1.5 tokens，英文约 0.25 tokens
    const json = JSON.stringify(aiContext);
    const chineseChars = (json.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishChars = json.length - chineseChars;
    return Math.ceil(chineseChars * 1.5 + englishChars * 0.25);
  }

  /**
   * 构建问题上下文（旧版 - 保持向后兼容）
   * @deprecated 请使用 buildQuestionContext 返回 AIContext
   */
  buildQuestionContextLegacy(question, projectInfo, options = {}) {
    // 保留旧的实现逻辑以保持向后兼容
    // 实际使用 buildQuestionContext 即可
    return this.buildQuestionContext(question, projectInfo, options);
  }

  /**
   * 分析问题类型和意图
   */
  analyzeQuestion(question) {
    const analysis = {
      question,
      originalQuestion: question,
      categories: [],
      intent: null,
      keywords: [],
      focusArea: null,
      complexity: 'simple',
      requiresCode: false,
      requiresAnalysis: false,
      timeframe: null,
    };

    // 关键词提取
    const keywords = this.extractKeywords(question);
    analysis.keywords = keywords;

    // 分类到不同的问题类型
    const questionPatterns = {
      // UI 相关
      ui: {
        patterns: ['ui', '界面', '页面', 'widget', '布局', '样式', '主题', '设计', 'component', '按钮', '输入', '文本', '列表'],
        intent: 'ui_analysis',
      },

      // 数据相关
      data: {
        patterns: ['model', 'entity', '数据', '字段', '类型', 'json', '序列化', '反序列化'],
        intent: 'data_analysis',
      },

      // 业务逻辑
      business: {
        patterns: ['service', '业务逻辑', 'api', '调用', '方法', '函数', 'repository'],
        intent: 'business_logic_analysis',
      },

      // 状态管理
      state: {
        patterns: ['state', '状态', 'provider', 'bloc', 'cubit', 'getx', '管理'],
        intent: 'state_management_analysis',
      },

      // 网络相关
      network: {
        patterns: ['network', '网络', 'api', 'http', '请求', '响应', 'endpoint', '接口'],
        intent: 'network_analysis',
      },

      // 路由相关
      routing: {
        patterns: ['route', '路由', '导航', '页面跳转', 'navigator', 'push', 'pop'],
        intent: 'routing_analysis',
      },

      // 测试相关
      testing: {
        patterns: ['test', '测试', '覆盖', '用例', '自动化', 'widget test'],
        intent: 'testing_analysis',
      },

      // 性能相关
      performance: {
        patterns: ['performance', '性能', '优化', '慢', '卡顿', '内存', '渲染'],
        intent: 'performance_analysis',
      },

      // 架构相关
      architecture: {
        patterns: ['架构', '设计', '模式', '分层', '结构', '组织'],
        intent: 'architecture_analysis',
      },

      // 代码质量
      quality: {
        patterns: ['质量', '规范', '最佳实践', '问题', 'bug', '错误', '改进'],
        intent: 'quality_analysis',
      },
    };

    // 匹配问题模式
    for (const [category, info] of Object.entries(questionPatterns)) {
      for (const pattern of info.patterns) {
        if (question.toLowerCase().includes(pattern)) {
          if (!analysis.categories.includes(category)) {
            analysis.categories.push(category);
          }
          if (!analysis.intent) {
            analysis.intent = info.intent;
          }
        }
      }
    }

    // 确定问题复杂度
    analysis.complexity = this.determineComplexity(question, keywords);

    // 检查是否需要代码
    analysis.requiresCode = this.requiresCodeContext(question);

    // 检查是否需要分析
    analysis.requiresAnalysis = keywords.some(k =>
      ['如何', '怎样', '怎么', '分析', '检查', '评估', '建议'].includes(k)
    );

    return analysis;
  }

  /**
   * 提取关键词
   */
  extractKeywords(question) {
    const keywords = [];

    // 英文单词提取
    const englishWords = question
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 1 && /^[a-z]+$/.test(w));

    keywords.push(...englishWords);

    // 中文关键词提取 - 匹配已知的关键词
    const chineseKeywords = [
      // UI 相关
      '界面', '页面', '组件', '布局', '样式', '主题', '按钮', '输入', '文本', '列表',
      'widget', 'ui', '跳转',
      // 数据相关
      '数据', '模型', '字段', '类型', 'json', '序列化', '反序列化', 'entity',
      // 业务逻辑
      '服务', '业务逻辑', '方法', '函数', 'service', 'repository',
      // 状态管理
      '状态', 'provider', 'bloc', 'cubit', 'getx', 'state',
      // 网络相关
      '网络', '接口', '请求', '响应', 'http', 'api', 'endpoint',
      // 路由相关
      '路由', '导航', '导航栏', '页面跳转', 'navigator',
      // 测试相关
      '测试', '覆盖', '用例', '自动化', 'test',
      // 性能相关
      '性能', '优化', '卡顿', '内存', '渲染',
      // 架构相关
      '架构', '模式', '分层', '结构', '组织',
      // 代码质量
      '质量', '规范', '问题', '错误', 'bug', '改进',
    ];

    for (const keyword of chineseKeywords) {
      if (question.includes(keyword)) {
        keywords.push(keyword);
      }
    }

    // 去重
    return [...new Set(keywords)];
  }

  /**
   * 确定问题复杂度
   */
  determineComplexity(question, keywords) {
    const questionLength = question.length;
    const keywordCount = keywords.length;

    // 检查是否包含对比、分析等复杂操作
    const complexPatterns = [
      /对比|比较|分析|评估|为什么|怎么样|如何改进/g,
      /区别|差异|优缺点|问题所在/g,
    ];

    let complexity = 'simple';
    if (questionLength > 50 || keywordCount > 5 || complexPatterns.some(p => p.test(question))) {
      complexity = 'medium';
    }
    if (questionLength > 100 || keywordCount > 10 || question.includes('和') || question.includes('对比')) {
      complexity = 'complex';
    }

    return complexity;
  }

  /**
   * 检查是否需要代码上下文
   */
  requiresCodeContext(question) {
    const codePatterns = [
      /代码|实现|函数|类|方法|逻辑/g,
      /如何实现|怎样写|代码示例|代码片段/g,
      /bug|错误|问题|修复/g,
    ];

    return codePatterns.some(p => p.test(question));
  }

  /**
   * 确定需要的分析器
   */
  determineRequiredAnalyzers(questionAnalysis, focusAreas) {
    let required = [];

    // 根据问题类别确定
    const categoryMapping = {
      ui: ['flutter-ui-analyzer', 'flutter-component-analyzer'],
      data: ['flutter-model-analyzer'],
      business: ['flutter-service-analyzer', 'flutter-repository-analyzer'],
      state: ['flutter-state-analyzer'],
      network: ['flutter-network-analyzer'],
      routing: ['flutter-routing-analyzer'],
      testing: ['flutter-test-analyzer'],
      quality: [], // 使用所有分析器
      architecture: ['flutter-component-analyzer', 'flutter-service-analyzer'],
    };

    // 根据问题类别添加分析器
    for (const category of questionAnalysis.categories) {
      if (categoryMapping[category]) {
        required.push(...categoryMapping[category]);
      }
    }

    // 如果指定了关注区域，使用它
    if (focusAreas.length > 0) {
      required = focusAreas;
    }

    // 去重
    required = [...new Set(required)];

    // 如果没有明确要求，使用所有可用的分析器
    if (required.length === 0) {
      required = Array.from(this.analyzers.keys());
    }

    return required;
  }

  /**
   * 收集分析器数据
   */
  collectAnalyzerData(requiredAnalyzers, projectInfo) {
    const data = new Map();

    for (const analyzerName of requiredAnalyzers) {
      const analyzer = this.analyzers.get(analyzerName);
      if (!analyzer) continue;

      try {
        // 检查是否有缓存
        const cacheKey = `${analyzerName}:${projectInfo.path}`;
        if (this.contextCache.has(cacheKey)) {
          data.set(analyzerName, this.contextCache.get(cacheKey));
          continue;
        }

        // 运行分析器
        const analyzerData = this.runAnalyzer(analyzer, projectInfo);
        data.set(analyzerName, analyzerData);

        // 缓存结果
        this.contextCache.set(cacheKey, analyzerData);
      } catch (error) {
        console.warn(`⚠ 分析器 ${analyzerName} 执行失败:`, error.message);
      }
    }

    return data;
  }

  /**
   * 运行单个分析器
   */
  runAnalyzer(analyzer, projectInfo) {
    // 这里需要实际调用分析器
    // 暂时返回模拟数据
    return {
      analyzerName: analyzer.constructor.name,
      timestamp: Date.now(),
      data: null,
      error: null,
    };
  }

  /**
   * 按相关性排序数据
   */
  rankByRelevance(analyzerData, questionAnalysis) {
    const ranked = [];

    for (const [analyzerName, data] of analyzerData) {
      const score = this.calculateRelevanceScore(analyzerName, data, questionAnalysis);

      if (score > this.config.relevanceThreshold) {
        ranked.push({
          analyzerName,
          data,
          score,
        });
      }
    }

    // 按分数降序排序
    ranked.sort((a, b) => b.score - a.score);

    return ranked;
  }

  /**
   * 计算相关性分数（增强版 - 核心功能）
   *
   * 这是 Context Builder 的核心：找到与当前任务最相关的上下文
   */
  calculateRelevanceScore(analyzerName, analyzerData, questionAnalysis) {
    const factors = {
      nameMatch: 0,           // 名称匹配
      categoryMatch: 0,       // 类别匹配
      contentMatch: 0,        // 内容语义匹配
      keywordMatch: 0,        // 关键词匹配
      dataQuality: 0,         // 数据质量
      historyContinuity: 0,   // 历史连续性
    };

    // 1. 名称匹配（高权重，因为分析器名称直接反映其功能）
    const nameLower = analyzerName.toLowerCase();
    for (const category of questionAnalysis.categories) {
      if (nameLower.includes(category.toLowerCase())) {
        factors.nameMatch += 0.35;
      }
    }

    // 2. 类别匹配（基于预定义的分析器类别映射）
    const categoryMap = this.getAnalyzerCategoryMap();
    if (categoryMap[analyzerName]) {
      const analyzerCategories = categoryMap[analyzerName];
      const overlap = questionAnalysis.categories.filter(c =>
        analyzerCategories.includes(c)
      ).length;
      factors.categoryMatch = (overlap / Math.max(questionAnalysis.categories.length, 1)) * 0.25;
    }

    // 3. 内容语义匹配（深度分析分析器数据与问题的语义关系）
    if (analyzerData.data) {
      factors.contentMatch = this.calculateSemanticRelevance(
        analyzerData.data,
        questionAnalysis
      );
    }

    // 4. 关键词深度匹配（不只是名称，还包括数据内容）
    factors.keywordMatch = this.calculateKeywordRelevance(
      analyzerName,
      analyzerData.data,
      questionAnalysis.keywords
    );

    // 5. 数据质量评分（有实质数据比空数据更相关）
    factors.dataQuality = this.assessDataQuality(analyzerData.data);

    // 6. 历史连续性（如果是后续问题，优先考虑之前使用的分析器）
    factors.historyContinuity = this.calculateHistoryContinuity(analyzerName);

    // 加权计算总分
    const weights = {
      nameMatch: 1.0,
      categoryMatch: 0.8,
      contentMatch: 1.2,      // 最重要的权重 - 语义相关性
      keywordMatch: 0.6,
      dataQuality: 0.3,
      historyContinuity: 0.4,
    };

    let totalScore = 0;
    for (const [factor, value] of Object.entries(factors)) {
      totalScore += value * (weights[factor] || 1.0);
    }

    return Math.min(totalScore, 1.0);
  }

  /**
   * 获取分析器类别映射
   */
  getAnalyzerCategoryMap() {
    return {
      'flutter-ui-analyzer': ['ui', 'architecture', 'widgets'],
      'flutter-component-analyzer': ['ui', 'components', 'widgets'],
      'flutter-state-analyzer': ['state', 'business'],
      'flutter-service-analyzer': ['business', 'logic'],
      'flutter-repository-analyzer': ['data', 'business'],
      'flutter-model-analyzer': ['data', 'models'],
      'flutter-network-analyzer': ['network', 'api'],
      'flutter-routing-analyzer': ['routing', 'ui', 'navigation'],
      'flutter-action-analyzer': ['ui', 'actions'],
      'flutter-test-analyzer': ['testing', 'quality'],
    };
  }

  /**
   * 计算语义相关性（深度匹配分析器数据与问题）
   */
  calculateSemanticRelevance(data, questionAnalysis) {
    let relevance = 0;

    // 中文关键词到英文概念的映射
    const chineseToEnglishMap = {
      // UI 相关
      '按钮': ['button', 'buttons', 'widget', 'widgets'],
      '输入': ['input', 'textfield', 'textformfield', 'form'],
      '文本': ['text', 'label'],
      '列表': ['list', 'listview', 'grid'],
      '页面': ['page', 'pages', 'screen', 'screens'],
      '组件': ['component', 'components', 'widget', 'widgets'],
      '布局': ['layout', 'row', 'column', 'stack'],
      '界面': ['ui', 'interface', 'screen'],
      '跳转': ['navigation', 'route', 'push', 'pop', 'navigator'],
      '路由': ['route', 'routes', 'routing', 'navigation'],
      '导航': ['navigation', 'route', 'routes'],
      '网络': ['network', 'http', 'api', 'request'],
      '接口': ['api', 'endpoint', 'interface'],
      '请求': ['request', 'http', 'network'],
      '数据': ['data', 'model', 'models'],
      '模型': ['model', 'models', 'entity', 'entities'],
      '序列化': ['serialization', 'json', 'serialize'],
      '测试': ['test', 'testing', 'widgettest', 'integrationtest'],
    };

    // 分析问题意图与数据内容的匹配度
    const intentPatterns = {
      'ui_analysis': {
        relevant: ['pages', 'widgets', 'components', 'tree', 'structure', 'button', 'input'],
        irrelevant: ['endpoints', 'apis', 'models', 'services'],
      },
      'data_analysis': {
        relevant: ['models', 'entities', 'fields', 'serialization', 'json'],
        irrelevant: ['widgets', 'pages', 'routes'],
      },
      'business_logic_analysis': {
        relevant: ['services', 'business', 'logic', 'repositories', 'state'],
        irrelevant: ['widgets', 'pages', 'ui'],
      },
      'network_analysis': {
        relevant: ['endpoints', 'apis', 'requests', 'responses', 'http', 'network'],
        irrelevant: ['widgets', 'components', 'routes'],
      },
      'testing_analysis': {
        relevant: ['testable', 'elements', 'flows', 'coverage', 'entrypoints', 'test'],
        irrelevant: ['endpoints', 'models'],
      },
      'routing_analysis': {
        relevant: ['routes', 'route', 'navigation', 'pages', 'transitions', 'push', 'pop'],
        irrelevant: ['models', 'services', 'testable'],
      },
    };

    const pattern = intentPatterns[questionAnalysis.intent];
    if (pattern && data.statistics) {
      const statsText = JSON.stringify(data.statistics).toLowerCase();

      // 统计相关关键词出现次数
      let relevantCount = 0;
      for (const keyword of pattern.relevant) {
        if (statsText.includes(keyword.toLowerCase())) {
          relevantCount++;
        }
      }

      // 检查中文关键词的英文映射
      for (const keyword of questionAnalysis.keywords) {
        const englishConcepts = chineseToEnglishMap[keyword];
        if (englishConcepts) {
          for (const concept of englishConcepts) {
            if (statsText.includes(concept.toLowerCase())) {
              relevantCount += 0.5; // 中文关键词匹配加分
              break;
            }
          }
        }
      }

      // 统计不相关关键词出现次数（作为惩罚）
      let irrelevantCount = 0;
      for (const keyword of pattern.irrelevant) {
        if (statsText.includes(keyword.toLowerCase())) {
          irrelevantCount++;
        }
      }

      // 计算相关性分数
      const maxRelevant = pattern.relevant.length;
      relevance = (relevantCount / maxRelevant) * 0.6 - (irrelevantCount * 0.05);
    }

    // 检查是否有关键发现（keyFindings）与问题相关
    if (data.keyFindings && data.keyFindings.length > 0) {
      const findingsText = data.keyFindings.join(' ').toLowerCase();

      // 英文关键词匹配
      for (const keyword of questionAnalysis.keywords) {
        if (findingsText.includes(keyword.toLowerCase())) {
          relevance += 0.15;
        }
      }

      // 中文关键词的英文映射匹配
      for (const keyword of questionAnalysis.keywords) {
        const englishConcepts = chineseToEnglishMap[keyword];
        if (englishConcepts) {
          for (const concept of englishConcepts) {
            if (findingsText.includes(concept.toLowerCase())) {
              relevance += 0.1;
              break;
            }
          }
        }
      }
    }

    // 检查 issues 与问题的相关性
    if (data.issues && data.issues.length > 0) {
      const issuesText = data.issues.map(i => i.message || i).join(' ').toLowerCase();

      // 中文关键词映射匹配
      for (const keyword of questionAnalysis.keywords) {
        const englishConcepts = chineseToEnglishMap[keyword];
        if (englishConcepts) {
          for (const concept of englishConcepts) {
            if (issuesText.includes(concept.toLowerCase())) {
              relevance += 0.05;
              break;
            }
          }
        }
      }
    }

    return Math.max(0, relevance);
  }

  /**
   * 计算关键词相关性
   */
  calculateKeywordRelevance(analyzerName, data, keywords) {
    let relevance = 0;

    // 检查分析器名称中的关键词
    const nameLower = analyzerName.toLowerCase();
    for (const keyword of keywords) {
      if (nameLower.includes(keyword.toLowerCase())) {
        relevance += 0.15;
      }
    }

    // 检查数据内容中的关键词
    if (data) {
      const dataText = JSON.stringify(data).toLowerCase();
      for (const keyword of keywords) {
        if (dataText.includes(keyword.toLowerCase())) {
          relevance += 0.05;
        }
      }
    }

    return Math.min(relevance, 0.3);
  }

  /**
   * 评估数据质量
   */
  assessDataQuality(data) {
    if (!data) return 0;

    let quality = 0;

    // 有统计数据
    if (data.statistics && Object.keys(data.statistics).length > 0) {
      quality += 0.1;
    }

    // 有关键发现
    if (data.keyFindings && data.keyFindings.length > 0) {
      quality += 0.1;
    }

    // 有问题列表
    if (data.issues && data.issues.length > 0) {
      quality += 0.05;
    }

    // 有建议
    if (data.recommendations && data.recommendations.length > 0) {
      quality += 0.05;
    }

    return Math.min(quality, 0.3);
  }

  /**
   * 计算历史连续性（后续问题优先考虑之前使用的分析器）
   */
  calculateHistoryContinuity(analyzerName) {
    if (this.questionHistory.length === 0) {
      return 0;
    }

    // 检查最近的问题中是否使用了这个分析器
    const recentHistory = this.questionHistory.slice(-3);
    for (const record of recentHistory) {
      if (record.usedAnalyzers && record.usedAnalyzers.includes(analyzerName)) {
        return 0.2; // 如果之前用过，给予加分
      }
    }

    return 0;
  }

  /**
   * 构建结构化上下文（旧版 - 保持向后兼容）
   * @deprecated
   */
  buildStructuredContextLegacy(question, questionAnalysis, rankedData, options) {
    const {
      maxTokens,
      includeFullAnalysis,
      previousContext,
    } = options;

    const context = {
      metadata: {
        question: question,
        questionAnalysis,
        timestamp: new Date().toISOString(),
        analyzersUsed: rankedData.map(r => r.analyzerName),
        totalAnalyzers: rankedData.length,
        estimatedTokens: 0,
      },
      project: this.buildProjectContext(rankedData),
      analysis: this.buildAnalysisContext(rankedData, includeFullAnalysis),
      code: this.buildCodeContext(rankedData, questionAnalysis),
      recommendations: this.buildRecommendationsContext(rankedData),
      conversation: previousContext ? this.buildConversationContext(question) : null,
    };

    // 估算 token 数
    context.metadata.estimatedTokens = this.estimateTokens(context);

    return context;
  }

  /**
   * 构建项目上下文
   */
  buildProjectContext(rankedData) {
    const projectInfo = {
      name: '',
      path: '',
      type: 'flutter',
      structure: {},
    };

    // 从分析器数据中提取项目信息
    for (const { data } of rankedData) {
      if (data && data.projectInfo) {
        Object.assign(projectInfo, data.projectInfo);
        break;
      }
    }

    return projectInfo;
  }

  /**
   * 构建分析上下文
   */
  buildAnalysisContext(rankedData, includeFullAnalysis) {
    const analysis = {
      summary: {},
      details: [],
    };

    for (const { analyzerName, data, score } of rankedData) {
      if (!data || !data.data) continue;

      // 构建摘要
      const summary = this.buildAnalyzerSummary(analyzerName, data.data);
      analysis.summary[analyzerName] = summary;

      // 如果需要完整分析，添加详细信息
      if (includeFullAnalysis) {
        analysis.details.push({
          analyzer: analyzerName,
          relevance: score,
          data: data.data,
        });
      }
    }

    return analysis;
  }

  /**
   * 构建分析器摘要
   */
  buildAnalyzerSummary(analyzerName, data) {
    const summary = {
      analyzer: analyzerName,
      keyFindings: [],
      statistics: {},
      issues: [],
      recommendations: [],
    };

    // 从数据中提取关键信息
    if (data.statistics) {
      summary.statistics = this.extractKeyStatistics(data.statistics);
    }

    if (data.issues) {
      summary.issues = data.issues.slice(0, 5); // 限制数量
    }

    if (data.recommendations) {
      summary.recommendations = data.recommendations.slice(0, 5);
    }

    if (data.keyFindings) {
      summary.keyFindings = data.keyFindings.slice(0, 5);
    }

    return summary;
  }

  /**
   * 提取关键统计数据
   */
  extractKeyStatistics(statistics) {
    const keyStats = {};

    // 选择最重要和有趣的统计
    for (const [key, value] of Object.entries(statistics)) {
      // 跳过嵌套对象
      if (typeof value !== 'object' || value === null) {
        keyStats[key] = value;
      } else if (Array.isArray(value)) {
        keyStats[key] = value.length;
      }
    }

    return keyStats;
  }

  /**
   * 构建代码上下文
   */
  buildCodeContext(rankedData, questionAnalysis) {
    const codeContext = {
      relevantFiles: [],
      codeSnippets: [],
      patterns: [],
    };

    // 如果问题需要代码上下文
    if (questionAnalysis.requiresCode) {
      for (const { data } of rankedData) {
        if (data && data.data && data.data.relevantFiles) {
          codeContext.relevantFiles.push(...data.data.relevantFiles.slice(0, 5));
        }
      }
    }

    return codeContext;
  }

  /**
   * 构建建议上下文
   */
  buildRecommendationsContext(rankedData) {
    const recommendations = {
      priorities: [],
      categories: {
        high: [],
        medium: [],
        low: [],
      },
    };

    // 收集所有建议并分类
    for (const { data, score } of rankedData) {
      if (!data || !data.data) continue;

      const recs = data.data.recommendations || [];

      for (const rec of recs) {
        const priority = this.determinePriority(rec, score);
        recommendations.priorities.push({
          ...rec,
          priority,
          source: data.analyzerName,
          confidence: score,
        });

        if (recommendations.categories[priority]) {
          recommendations.categories[priority].push(rec);
        }
      }
    }

    // 按优先级和置信度排序
    recommendations.priorities.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      return b.confidence - a.confidence;
    });

    return recommendations;
  }

  /**
   * 确定建议优先级
   */
  determinePriority(recommendation, confidenceScore) {
    const priorityPatterns = {
      high: ['error', 'critical', '安全', '崩溃', '严重', '立即'],
      medium: ['warning', '建议', '优化', '改进', '考虑'],
      low: ['info', '提示', '可以', '可选'],
    };

    for (const [priority, patterns] of Object.entries(priorityPatterns)) {
      for (const pattern of patterns) {
        if (recommendation.message && recommendation.message.includes(pattern)) {
          return priority;
        }
        if (recommendation.type && recommendation.type.includes(pattern)) {
          return priority;
        }
      }
    }

    return 'medium'; // 默认中等优先级
  }

  /**
   * 构建对话历史上下文
   */
  buildConversationHistory(currentQuestion) {
    const history = {
      previousQuestions: this.questionHistory.slice(-5), // 最近5个问题
      currentQuestion,
      conversationSummary: this.summarizeConversation(),
    };

    return history;
  }

  /**
   * 构建对话上下文（用于增量更新）
   */
  buildConversationContext(currentQuestion) {
    return {
      previousQuestions: this.questionHistory.slice(-5).map(q => q.question),
      currentQuestion,
      topicContinuity: this.analyzeTopicContinuity(currentQuestion),
    };
  }

  /**
   * 分析话题连续性
   */
  analyzeTopicContinuity(currentQuestion) {
    if (this.questionHistory.length === 0) {
      return { isFollowUp: false, relatedTopics: [] };
    }

    const currentAnalysis = this.analyzeQuestion(currentQuestion);
    const relatedTopics = [];

    for (const prevRecord of this.questionHistory.slice(-3)) {
      const prevAnalysis = this.analyzeQuestion(prevRecord.question);
      const commonCategories = currentAnalysis.categories.filter(c =>
        prevAnalysis.categories.includes(c)
      );
      const commonKeywords = currentAnalysis.keywords.filter(k =>
        prevAnalysis.keywords.includes(k)
      );

      if (commonCategories.length > 0 || commonKeywords.length > 0) {
        relatedTopics.push({
          question: prevRecord.question,
          commonCategories,
          commonKeywords,
        });
      }
    }

    return {
      isFollowUp: relatedTopics.length > 0,
      relatedTopics,
    };
  }

  /**
   * 总结对话
   */
  summarizeConversation() {
    if (this.questionHistory.length === 0) {
      return null;
    }

    // 简单的对话总结
    const topics = new Set();
    for (const record of this.questionHistory) {
      const questionText = typeof record === 'string' ? record : record.question;
      const words = questionText.toLowerCase().split(/\s+/);
      topics.add(...words.filter(w => w.length > 3));
    }

    return {
      topicCount: topics.size,
      mainTopics: Array.from(topics).slice(0, 5),
      turnCount: this.questionHistory.length,
    };
  }

  /**
   * 优化上下文大小
   */
  optimizeContextSize(context, maxTokens) {
    const optimized = { ...context };

    // 如果上下文过大，压缩分析详情
    if (context.metadata.estimatedTokens > maxTokens) {
      const compressionRatio = maxTokens / context.metadata.estimatedTokens;

      // 压缩分析详情
      if (context.analysis.details) {
        const detailsCount = Math.floor(context.analysis.details.length * compressionRatio);
        optimized.analysis.details = context.analysis.details.slice(0, Math.max(1, detailsCount));
      }

      // 压缩代码片段
      if (context.code && context.code.codeSnippets) {
        const snippetsCount = Math.floor(context.code.codeSnippets.length * compressionRatio);
        optimized.code.codeSnippets = context.code.codeSnippets.slice(0, Math.max(1, snippetsCount));
      }

      // 重新估算 token 数
      optimized.metadata.estimatedTokens = Math.floor(context.metadata.estimatedTokens * compressionRatio);
    }

    return optimized;
  }

  /**
   * 估算 token 数
   */
  estimateTokens(context) {
    // 简化的 token 估算：约 4 字符 = 1 token
    const jsonString = JSON.stringify(context, null, 2);
    return Math.ceil(jsonString.length / 4);
  }

  /**
   * 生成系统提示词
   */
  generateSystemPrompt() {
    return `你是一个专业的 Flutter 代码质量分析专家 AI 助手。你的职责是：

1. 仔细分析用户关于 Flutter 代码质量问题
2. 基于提供的分析上下文给出准确、有用的回答
3. 当信息不足时，主动指出需要更多信息
4. 提供具体的代码示例和最佳实践建议
5. 识别潜在问题并给出优先级建议

## 回答原则：
- 基于分析数据，不要编造信息
- 不确定时要说"根据当前分析..."或"建议进一步检查..."
- 优先解决高优先级问题
- 提供可操作的建议
- 使用中文回答

## 输出格式：
- 问题概述
- 关键发现
- 详细分析
- 具体建议
- 代码示例（如果适用）`;
  }

  /**
   * 生成用户提示词
   */
  generateUserPrompt(context) {
    let prompt = `# Flutter 代码质量分析问题

## 问题
${context.metadata.question.question}

## 项目信息
- 项目类型: ${context.project.type || 'Flutter'}
- 分析器: ${context.metadata.analyzersUsed.join(', ')}

`;

    // 添加分析结果
    if (context.analysis.summary) {
      prompt += `\n## 分析结果摘要\n\n`;
      for (const [analyzer, summary] of Object.entries(context.analysis.summary)) {
        prompt += `### ${analyzer}\n`;
        prompt += `- 关键统计: ${JSON.stringify(summary.statistics, null, 2)}\n`;
        if (summary.keyFindings.length > 0) {
          prompt += `- 关键发现: ${summary.keyFindings.join(', ')}\n`;
        }
        if (summary.issues.length > 0) {
          prompt += `- 问题: ${summary.issues.map(i => i.message || i).join('; ')}\n`;
        }
        prompt += '\n';
      }
    }

    // 添加建议
    if (context.recommendations && context.recommendations.priorities.length > 0) {
      prompt += `\n## 优先级建议\n\n`;
      for (const rec of context.recommendations.priorities.slice(0, 5)) {
        const priority = rec.priority === 'high' ? '🔴' : rec.priority === 'medium' ? '🟡' : '🟢';
        prompt += `${priority} [${rec.type || '建议'}] ${rec.message || rec.name || rec}\n`;
      }
    }

    prompt += `\n\n请基于以上分析结果，给出详细的回答和建议。`;

    return prompt;
  }

  /**
   * 清除缓存
   */
  clearCache() {
    this.contextCache.clear();
    this.questionHistory = [];
  }

  /**
   * 添加问题到历史
   */
  /**
   * 添加问题到历史记录
   */
  addToHistory(question, usedAnalyzers = []) {
    this.questionHistory.push({
      question,
      timestamp: new Date().toISOString(),
      usedAnalyzers, // 记录使用的分析器，用于历史连续性计算
    });

    // 限制历史记录数量
    if (this.questionHistory.length > this.config.maxHistoryLength) {
      this.questionHistory.shift();
    }
  }

  /**
   * 获取上下文统计
   */
  getContextStats() {
    return {
      cachedAnalyzers: this.contextCache.size,
      availableAnalyzers: this.analyzers.size,
      questionHistoryCount: this.questionHistory.length,
      config: this.config,
    };
  }

  /**
   * 设置配置
   */
  setConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * 导出上下文为 JSON
   */
  exportContext(context) {
    return JSON.stringify(context, null, 2);
  }

  /**
   * 从 JSON 导入上下文
   */
  importContext(jsonString) {
    try {
      return JSON.parse(jsonString);
    } catch (error) {
      throw new Error('无法解析上下文 JSON: ' + error.message);
    }
  }

  /**
   * 构建增量上下文（用于后续问题）
   */
  buildIncrementalContext(previousContext, newQuestion, projectInfo) {
    const context = this.buildQuestionContext(newQuestion, projectInfo, {
      previousContext: previousContext,
      maxTokens: previousContext ? this.config.maxTokenCount - previousContext.metadata.estimatedTokens : undefined,
    });

    // 标记为增量更新
    context.metadata.isIncremental = true;

    return context;
  }

  /**
   * 生成上下文摘要（用于显示）
   */
  generateContextSummary(context) {
    // 兼容不同的 question 结构
    const questionText = typeof context.metadata.question === 'string'
      ? context.metadata.question
      : context.metadata.question?.question || '未知问题';

    const summary = {
      question: questionText,
      analyzers: context.metadata.analyzersUsed,
      keyStats: {},
      topIssues: [],
      topRecommendations: [],
      estimatedTokens: context.metadata.estimatedTokens,
    };

    // 提取关键统计
    if (context.analysis.summary) {
      for (const [analyzer, data] of Object.entries(context.analysis.summary)) {
        if (data.statistics) {
          summary.keyStats[analyzer] = data.statistics;
        }
        if (data.issues && data.issues.length > 0) {
          summary.topIssues.push(...data.issues.slice(0, 3));
        }
      }
    }

    // 提取顶部建议
    if (context.recommendations && context.recommendations.priorities) {
      summary.topRecommendations = context.recommendations.priorities.slice(0, 5);
    }

    return summary;
  }

  /**
   * 为 Code Review 构建上下文
   * 专门用于代码审查的上下文构建，包含问题分布和相关文件分析
   *
   * @param {Array} issues - 代码问题列表
   * @param {Object} projectInfo - 项目信息
   * @param {Object} options - 构建选项
   * @returns {Promise<Object>} 代码审查上下文
   */
  async buildCodeReviewContext(issues, projectInfo, options = {}) {
    const {
      includeFullAnalysis = false,
      focusAreas = ['code', 'performance'],
    } = options;

    // 1. 分析问题分布
    const issueAnalysis = this.analyzeIssues(issues);

    // 2. 收集相关文件上下文
    const relatedFiles = await this.collectRelatedFileContext(issues, projectInfo);

    // 3. 构建代码审查专用上下文
    const reviewContext = {
      issues: issues,
      analysis: issueAnalysis,
      relatedFiles: relatedFiles,
      summary: this.generateReviewSummary(issueAnalysis),
    };

    // 4. 如果需要完整分析，使用现有 buildQuestionContext
    if (includeFullAnalysis) {
      const question = `请审查以下代码问题，提供深入分析和改进建议：${JSON.stringify(issues.map(i => ({
        ruleId: i.ruleId,
        message: i.message,
        file: i.filePath
      })))}`;

      const fullContext = await this.buildQuestionContext(question, projectInfo, {
        focusAreas,
        includeFullAnalysis: true
      });

      reviewContext.fullContext = fullContext;
    }

    return reviewContext;
  }

  /**
   * 分析代码问题的分布情况
   */
  analyzeIssues(issues) {
    const analysis = {
      total: issues.length,
      bySeverity: { high: 0, medium: 0, low: 0 },
      byRule: {},
      byFile: {},
      byCategory: {}
    };

    for (const issue of issues) {
      // 按严重程度统计
      const severity = issue.severity || 'medium';
      analysis.bySeverity[severity] = (analysis.bySeverity[severity] || 0) + 1;

      // 按规则ID统计
      if (issue.ruleId) {
        analysis.byRule[issue.ruleId] = (analysis.byRule[issue.ruleId] || 0) + 1;
      }

      // 按文件统计
      if (issue.filePath) {
        if (!analysis.byFile[issue.filePath]) {
          analysis.byFile[issue.filePath] = 0;
        }
        analysis.byFile[issue.filePath]++;
      }

      // 按类别统计（从规则ID推断）
      const category = this.inferIssueCategory(issue.ruleId);
      analysis.byCategory[category] = (analysis.byCategory[category] || 0) + 1;
    }

    return analysis;
  }

  /**
   * 从规则ID推断问题类别
   */
  inferIssueCategory(ruleId) {
    if (!ruleId) return 'other';

    if (ruleId.startsWith('FLUT')) return 'flutter';
    if (ruleId.startsWith('JS') || ruleId.startsWith('TS')) return 'javascript';
    if (ruleId.startsWith('CSS')) return 'styling';
    if (ruleId.startsWith('SEC') || ruleId.includes('SECURITY')) return 'security';
    if (ruleId.startsWith('PERF') || ruleId.includes('PERFORMANCE')) return 'performance';
    if (ruleId.startsWith('ACCESS') || ruleId.includes('A11Y')) return 'accessibility';

    return 'other';
  }

  /**
   * 收集相关文件的上下文信息
   */
  async collectRelatedFileContext(issues, projectInfo) {
    const fs = require('fs');
    const relatedFiles = [];

    // 获取所有涉及的唯一文件
    const uniqueFiles = [...new Set(issues.map(i => i.filePath).filter(Boolean))];

    for (const filePath of uniqueFiles) {
      try {
        const stats = fs.statSync(filePath);
        if (!stats.isFile()) continue;

        // 读取文件内容（限制大小）
        const content = fs.readFileSync(filePath, 'utf-8');
        const preview = content.length > 500 ? content.substring(0, 500) + '...' : content;

        // 计算该文件的问题数量
        const fileIssues = issues.filter(i => i.filePath === filePath);

        relatedFiles.push({
          path: filePath,
          name: filePath.split(/[/\\]/).pop(),
          size: stats.size,
          issueCount: fileIssues.length,
          preview: preview,
          issues: fileIssues.map(i => ({
            ruleId: i.ruleId,
            line: i.line,
            message: i.message
          }))
        });
      } catch (error) {
        console.warn(`无法读取文件: ${filePath}`, error.message);
      }
    }

    return relatedFiles;
  }

  /**
   * 生成代码审查摘要
   */
  generateReviewSummary(issueAnalysis) {
    const parts = [];

    // 总体问题数
    parts.push(`发现 ${issueAnalysis.total} 个代码问题`);

    // 严重程度分布
    const severityParts = [];
    if (issueAnalysis.bySeverity.high > 0) {
      severityParts.push(`${issueAnalysis.bySeverity.high} 个高优先级`);
    }
    if (issueAnalysis.bySeverity.medium > 0) {
      severityParts.push(`${issueAnalysis.bySeverity.medium} 个中优先级`);
    }
    if (severityParts.length > 0) {
      parts.push(`（${severityParts.join('，')}）`);
    }

    // 类别分布
    const categoryItems = Object.entries(issueAnalysis.byCategory)
      .filter(([_, count]) => count > 0)
      .map(([category, count]) => `${category}: ${count}`)
      .slice(0, 3);

    if (categoryItems.length > 0) {
      parts.push(`类别分布：${categoryItems.join('、')}`);
    }

    return parts.join('，') + '。';
  }

  /**
   * 格式化上下文为可读文本（用于调试）
   */
  formatContextForDebug(context) {
    let output = '';
    output += '='.repeat(60) + '\n';
    output += 'AI Context Builder - Debug Info\n';
    output += '='.repeat(60) + '\n\n';

    output += '## 问题分析\n';
    output += `问题: ${context.metadata.question.question}\n`;
    output += `类型: ${context.metadata.questionAnalysis.categories.join(', ') || 'general'}\n`;
    output += `意图: ${context.metadata.questionAnalysis.intent || 'unknown'}\n`;
    output += `复杂度: ${context.metadata.questionAnalysis.complexity}\n\n`;

    output += '## 元数据\n';
    output += `使用的分析器: ${context.metadata.analyzersUsed.join(', ')}\n`;
    output += `分析器总数: ${context.metadata.totalAnalyzers}\n`;
    output += `估算 Token: ${context.metadata.estimatedTokens}\n\n`;

    output += `## 缓存统计\n`;
    const stats = this.getContextStats();
    output += `已缓存分析器: ${stats.cachedAnalyzers}\n`;
    output += `可用分析器: ${stats.availableAnalyzers}\n`;
    output += `历史问题数: ${stats.questionHistoryCount}\n`;

    output += '\n' + '='.repeat(60) + '\n';

    return output;
  }
}

// 同时导出 AIContext 类和相关类
module.exports = AIContextBuilder;
module.exports.AIContext = require('./ai-context').AIContext;
module.exports.FileContext = require('./ai-context').FileContext;
module.exports.CodeContext = require('./ai-context').CodeContext;
module.exports.UIContext = require('./ai-context').UIContext;
module.exports.DataContext = require('./ai-context').DataContext;
module.exports.BusinessContext = require('./ai-context').BusinessContext;
