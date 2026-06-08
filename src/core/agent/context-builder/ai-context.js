/**
 * AI Context - 统一的 AI 上下文结构
 *
 * 这是提供给 AI 的最终上下文，整合了五个维度的信息：
 * - FileContext: 文件上下文
 * - CodeContext: 代码逻辑（从 Call Graph 提取）
 * - UIContext: UI结构（从 Widget Tree 提取）
 * - DataContext: 数据结构（Models 和 API）
 * - BusinessContext: 业务流程（routes 和 userFlow）
 */

/**
 * 文件上下文
 * AI 可以理解：项目的文件组织结构、模块划分、文件依赖关系
 */
class FileContext {
  constructor() {
    this.structure = {
      directories: [],      // 目录结构
      files: [],            // 文件列表
      entryPoints: [],      // 入口文件（main.dart, app.dart 等）
    };
    this.dependencies = {
      imports: [],          // 文件间的 import 关系
      modules: [],          // 识别出的模块/包
    };
    this.metadata = {
      totalFiles: 0,
      totalLines: 0,
      language: 'dart',
      framework: 'flutter',
    };
  }

  /**
   * 从项目分析器数据构建文件上下文
   */
  static fromProjectAnalysis(projectData) {
    const context = new FileContext();

    // 构建目录结构
    if (projectData.fileStructure) {
      context.structure.directories = projectData.fileStructure.directories || [];
      context.structure.files = projectData.fileStructure.files || [];
      context.structure.entryPoints = projectData.fileStructure.entryPoints || [];
    }

    // 构建依赖关系
    if (projectData.dependencies) {
      context.dependencies.imports = projectData.dependencies.imports || [];
      context.dependencies.modules = projectData.dependencies.modules || [];
    }

    // 元数据
    if (projectData.metadata) {
      context.metadata = { ...context.metadata, ...projectData.metadata };
    }

    return context;
  }

  /**
   * 生成 AI 友好的描述
   */
  toAIDescription() {
    return {
      summary: `项目包含 ${this.metadata.totalFiles} 个 Dart 文件，使用 ${this.metadata.framework || 'Flutter'} 框架。`,
      structure: this.buildStructureTree(),
      keyFiles: this.structure.entryPoints.map(f => ({
        path: f,
        description: this.describeFile(f),
      })),
    };
  }

  buildStructureTree() {
    // 构建可视化的目录树
    return this.structure.directories.slice(0, 10); // 限制深度
  }

  describeFile(filePath) {
    const parts = filePath.split('/');
    const fileName = parts[parts.length - 1];
    const extension = fileName.split('.').pop();

    if (fileName === 'main.dart') return '应用入口文件';
    if (fileName.includes('app')) return '应用配置文件';
    if (fileName.includes('page')) return '页面文件';
    if (fileName.includes('widget')) return '组件文件';
    if (fileName.includes('model')) return '数据模型文件';
    if (fileName.includes('service')) return '业务逻辑文件';
    if (fileName.includes('repository')) return '数据仓库文件';

    return `${extension} 文件`;
  }
}

/**
 * 代码上下文（从 Call Graph 提取）
 * AI 可以理解：数据流向、函数调用链、模块间的依赖关系
 */
class CodeContext {
  constructor() {
    this.callGraph = {
      nodes: [],            // 函数/方法节点
      edges: [],            // 调用关系边
      entryPoints: [],      // 调用入口点
    };
    this.dataFlow = {
      sources: [],          // 数据来源点
      sinks: [],            // 数据消耗点
      transformations: [],   // 数据转换点
    };
    this.complexity = {
      cyclomaticComplexity: {}, // 圈复杂度
      nestingDepth: {},         // 嵌套深度
      functionLength: {},       // 函数长度
    };
  }

  /**
   * 从各个分析器构建代码上下文
   */
  static fromAnalyzers(analyzers) {
    const context = new CodeContext();

    // 从 Service 分析器提取业务逻辑调用链
    const serviceAnalyzer = analyzers.get('flutter-service-analyzer');
    if (serviceAnalyzer?.data) {
      context.extractServiceCallGraph(serviceAnalyzer.data);
    }

    // 从 Repository 分析器提取数据访问调用链
    const repositoryAnalyzer = analyzers.get('flutter-repository-analyzer');
    if (repositoryAnalyzer?.data) {
      context.extractRepositoryCallGraph(repositoryAnalyzer.data);
    }

    // 从 Action 分析器提取 UI 事件处理调用链
    const actionAnalyzer = analyzers.get('flutter-action-analyzer');
    if (actionAnalyzer?.data) {
      context.extractActionCallGraph(actionAnalyzer.data);
    }

    // 从 Network 分析器提取 API 调用数据流
    const networkAnalyzer = analyzers.get('flutter-network-analyzer');
    if (networkAnalyzer?.data) {
      context.extractAPIDataFlow(networkAnalyzer.data);
    }

    return context;
  }

  extractServiceCallGraph(serviceData) {
    if (!serviceData.services) return;

    for (const service of serviceData.services) {
      const node = {
        id: `service_${service.name}`,
        type: 'service',
        name: service.name,
        file: service.fileName,
        line: service.line,
      };
      this.callGraph.nodes.push(node);

      // 提取方法调用关系
      if (service.methods) {
        for (const method of service.methods) {
          const methodNode = {
            id: `method_${service.name}_${method.name}`,
            type: 'method',
            name: method.name,
            parent: node.id,
          };
          this.callGraph.nodes.push(methodNode);
        }
      }
    }
  }

  extractRepositoryCallGraph(repositoryData) {
    if (!repositoryData.repositories) return;

    for (const repo of repositoryData.repositories) {
      const node = {
        id: `repo_${repo.name}`,
        type: 'repository',
        name: repo.name,
        file: repo.fileName,
      };
      this.callGraph.nodes.push(node);

      // Repository 调用是数据流的关键点
      this.dataFlow.sinks.push({
        type: 'repository_call',
        target: node.id,
        description: `${repo.name} 数据访问`,
      });
    }
  }

  extractActionCallGraph(actionData) {
    if (!actionData.actions) return;

    for (const action of actionData.actions) {
      const node = {
        id: `action_${action.widget}_${action.action}`,
        type: 'action',
        name: action.action,
        widget: action.widget,
        file: action.fileName,
        line: action.line,
      };
      this.callGraph.nodes.push(node);

      // UI 动作是数据流的起点
      this.dataFlow.sources.push({
        type: 'ui_action',
        source: node.id,
        description: `${action.widget} ${action.action}`,
      });
    }
  }

  extractAPIDataFlow(networkData) {
    if (!networkData.endpoints) return;

    for (const endpoint of networkData.endpoints) {
      // API 调用既是数据转换点也是潜在的数据源/汇
      this.dataFlow.transformations.push({
        type: 'api_call',
        endpoint: endpoint.path,
        method: endpoint.method,
        description: `${endpoint.method} ${endpoint.path}`,
      });
    }
  }

  /**
   * 生成 AI 友好的描述
   */
  toAIDescription() {
    return {
      summary: `代码包含 ${this.callGraph.nodes.length} 个可调用节点，${this.callGraph.edges.length} 个调用关系。`,
      callChains: this.getTopCallChains(5),
      dataFlow: this.describeDataFlow(),
      complexity: this.getComplexitySummary(),
    };
  }

  getTopCallChains(limit) {
    // 返回最长的调用链
    return []; // TODO: 实现调用链分析
  }

  describeDataFlow() {
    return {
      sources: this.dataFlow.sources.slice(0, 5),
      sinks: this.dataFlow.sinks.slice(0, 5),
      flow: `数据从 ${this.dataFlow.sources.length} 个来源流向 ${this.dataFlow.sinks.length} 个目的地`,
    };
  }

  getComplexitySummary() {
    return {
      highComplexityFunctions: [],
      averageComplexity: 'medium',
    };
  }
}

/**
 * UI 上下文（从 Widget Tree 提取）
 * AI 可以理解为：这是页面、组件层次结构、页面间关系
 */
class UIContext {
  constructor() {
    this.pages = [];           // 页面列表
    this.widgets = [];         // 所有 Widget
    this.componentTree = {};   // 组件树结构
    this.navigation = {
      routes: [],             // 路由定义
      transitions: [],        // 页面跳转关系
    };
  }

  /**
   * 从 UI 和路由分析器构建 UI 上下文
   */
  static fromAnalyzers(analyzers) {
    const context = new UIContext();

    // 从 UI 分析器提取页面和组件
    const uiAnalyzer = analyzers.get('flutter-ui-analyzer');
    if (uiAnalyzer?.data) {
      context.extractPages(uiAnalyzer.data);
      context.extractWidgets(uiAnalyzer.data);
    }

    // 从组件分析器提取组件依赖
    const componentAnalyzer = analyzers.get('flutter-component-analyzer');
    if (componentAnalyzer?.data) {
      context.extractComponentGraph(componentAnalyzer.data);
    }

    // 从路由分析器提取导航信息
    const routingAnalyzer = analyzers.get('flutter-routing-analyzer');
    if (routingAnalyzer?.data) {
      context.extractNavigation(routingAnalyzer.data);
    }

    return context;
  }

  extractPages(uiData) {
    if (!uiData.pages) return;

    for (const page of uiData.pages) {
      this.pages.push({
        name: page.name,
        type: page.type || 'unknown',
        file: page.fileName,
        line: page.line,
        isStateful: page.isStateful || false,
        description: `页面：${page.name}`,
      });
    }
  }

  extractWidgets(uiData) {
    if (!uiData.widgets) return;

    for (const widget of uiData.widgets) {
      this.widgets.push({
        type: widget.type,
        name: widget.name,
        file: widget.fileName,
        parent: widget.parent,
        properties: widget.properties || {},
      });
    }
  }

  extractComponentGraph(componentData) {
    if (!componentData.componentGraph) return;

    this.componentTree = componentData.componentGraph;
  }

  extractNavigation(routingData) {
    if (!routingData.routes) return;

    this.navigation.routes = routingData.routes.map(route => ({
      path: route.path,
      page: route.page,
      type: route.type,
    }));

    if (routingData.navigationCalls) {
      this.navigation.transitions = routingData.navigationCalls.map(call => ({
        from: call.fromPage,
        to: call.toPage,
        action: call.action,
      }));
    }
  }

  /**
   * 生成 AI 友好的描述
   */
  toAIDescription() {
    return {
      summary: `应用包含 ${this.pages.length} 个页面，${this.widgets.length} 个组件。`,
      pages: this.pages.map(p => ({
        name: p.name,
        type: p.type,
        description: p.description,
        file: p.file,
      })),
      navigation: this.describeNavigation(),
      componentHierarchy: this.getComponentHierarchy(),
    };
  }

  describeNavigation() {
    return {
      totalRoutes: this.navigation.routes.length,
      routes: this.navigation.routes.slice(0, 10),
      hasNavigation: this.navigation.transitions.length > 0,
    };
  }

  getComponentHierarchy() {
    // 返回组件层次结构的描述
    return '组件层次结构：...';
  }
}

/**
 * 数据上下文（Models 和 API）
 * AI 可以检查：数据结构是否匹配、序列化是否正确、API 响应类型是否一致
 */
class DataContext {
  constructor() {
    this.models = [];          // 数据模型
    this.apis = [];            // API 接口
    this.mappings = {          // 模型与 API 的映射关系
      modelToAPI: [],          // 模型 → 使用的 API
      apiToModel: [],          // API → 返回的模型
    };
    this.validation = {
      missingSerialization: [], // 缺少序列化的模型
      typeMismatches: [],       // 类型不匹配
      unusedModels: [],         // 未使用的模型
    };
  }

  /**
   * 从 Model 和 Network 分析器构建数据上下文
   */
  static fromAnalyzers(analyzers) {
    const context = new DataContext();

    // 从 Model 分析器提取数据模型
    const modelAnalyzer = analyzers.get('flutter-model-analyzer');
    if (modelAnalyzer?.data) {
      context.extractModels(modelAnalyzer.data);
    }

    // 从 Network 分析器提取 API
    const networkAnalyzer = analyzers.get('flutter-network-analyzer');
    if (networkAnalyzer?.data) {
      context.extractAPIs(networkAnalyzer.data);
    }

    // 构建模型与 API 的映射关系
    context.buildMappings();

    // 验证数据一致性
    context.validate();

    return context;
  }

  extractModels(modelData) {
    if (!modelData.models) return;

    for (const model of modelData.models) {
      this.models.push({
        name: model.name,
        fields: model.fields || [],
        hasSerialization: model.hasSerialization || false,
        file: model.fileName,
        line: model.line,
        usedIn: [], // 将在 buildMappings 中填充
      });
    }
  }

  extractAPIs(networkData) {
    if (!networkData.endpoints) return;

    for (const endpoint of networkData.endpoints) {
      this.apis.push({
        path: endpoint.path,
        method: endpoint.method,
        requestType: endpoint.requestType,
        responseType: endpoint.responseType,
        file: endpoint.fileName,
        line: endpoint.line,
        usedBy: [], // 将在 buildMappings 中填充
      });
    }
  }

  buildMappings() {
    // TODO: 实现模型与 API 的映射分析
    // 这需要分析代码中的实际使用情况
  }

  validate() {
    // 检查缺少序列化的模型
    for (const model of this.models) {
      if (!model.hasSerialization) {
        this.validation.missingSerialization.push(model.name);
      }
    }
  }

  /**
   * 生成 AI 友好的描述
   */
  toAIDescription() {
    return {
      summary: `定义了 ${this.models.length} 个数据模型，${this.apis.length} 个 API 接口。`,
      models: this.models.map(m => ({
        name: m.name,
        fields: m.fields.length,
        serialized: m.hasSerialization,
        issues: !m.hasSerialization ? ['缺少序列化方法'] : [],
      })),
      apis: this.apis.map(a => ({
        method: a.method,
        path: a.path,
        requestType: a.requestType || 'unknown',
        responseType: a.responseType || 'unknown',
      })),
      validation: this.validation,
    };
  }
}

/**
 * 业务上下文（routes 和 userFlow）
 * AI 可以理解：业务流程、用户交互路径、页面跳转逻辑
 */
class BusinessContext {
  constructor() {
    this.routes = [];          // 路由定义
    this.userFlows = [];       // 用户流程
    this.businessRules = [];   // 业务规则
    this.states = {            // 应用状态
      managed: [],             // 被管理的状态
      unmanaged: [],           // 未管理的状态
    };
  }

  /**
   * 从路由、测试和状态分析器构建业务上下文
   */
  static fromAnalyzers(analyzers) {
    const context = new BusinessContext();

    // 从路由分析器提取路由
    const routingAnalyzer = analyzers.get('flutter-routing-analyzer');
    if (routingAnalyzer?.data) {
      context.extractRoutes(routingAnalyzer.data);
    }

    // 从测试分析器提取用户流程
    const testAnalyzer = analyzers.get('flutter-test-analyzer');
    if (testAnalyzer?.data) {
      context.extractUserFlows(testAnalyzer.data);
    }

    // 从状态分析器提取状态管理
    const stateAnalyzer = analyzers.get('flutter-state-analyzer');
    if (stateAnalyzer?.data) {
      context.extractStates(stateAnalyzer.data);
    }

    return context;
  }

  extractRoutes(routingData) {
    if (!routingData.routes) return;

    for (const route of routingData.routes) {
      this.routes.push({
        path: route.path,
        page: route.page,
        type: route.type || 'named',
        parameters: route.parameters || [],
      });
    }
  }

  extractUserFlows(testData) {
    if (!testData.userFlows) return;

    for (const flow of testData.userFlows) {
      this.userFlows.push({
        name: flow.name,
        trigger: flow.trigger,
        steps: flow.steps || [],
        pages: flow.pages || [],
        description: flow.description,
      });
    }
  }

  extractStates(stateData) {
    if (!stateData.states) return;

    for (const state of stateData.states) {
      if (state.managed) {
        this.states.managed.push(state);
      } else {
        this.states.unmanaged.push(state);
      }
    }
  }

  /**
   * 生成 AI 友好的描述
   */
  toAIDescription() {
    return {
      summary: `应用定义了 ${this.routes.length} 个路由，${this.userFlows.length} 个主要用户流程。`,
      routes: this.routes.map(r => ({
        path: r.path,
        page: r.page,
        type: r.type,
      })),
      userFlows: this.userFlows.map(f => ({
        name: f.name,
        steps: f.steps.length,
        pages: f.pages.length,
      })),
      stateManagement: {
        managedStates: this.states.managed.length,
        unmanagedStates: this.states.unmanaged.length,
      },
    };
  }
}

/**
 * AI Context - 统一的上下文输出
 *
 * 这是 Context Builder 的最终输出，整合了所有维度的信息
 */
class AIContext {
  constructor() {
    this.metadata = {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      project: {
        name: '',
        type: 'flutter',
        path: '',
      },
      question: {
        original: '',
        analysis: {},
      },
    };

    // 五个维度的上下文
    this.file = new FileContext();
    this.code = new CodeContext();
    this.ui = new UIContext();
    this.data = new DataContext();
    this.business = new BusinessContext();
  }

  /**
   * 从分析器数据构建完整的 AI Context
   */
  static build(question, projectInfo, analyzers, questionAnalysis) {
    const context = new AIContext();

    // 设置元数据
    context.metadata.question = {
      original: question,
      analysis: questionAnalysis,
    };
    context.metadata.project = {
      name: projectInfo.name || '',
      type: projectInfo.type || 'flutter',
      path: projectInfo.path || '',
    };

    // 构建各个维度的上下文
    context.code = CodeContext.fromAnalyzers(analyzers);
    context.ui = UIContext.fromAnalyzers(analyzers);
    context.data = DataContext.fromAnalyzers(analyzers);
    context.business = BusinessContext.fromAnalyzers(analyzers);

    return context;
  }

  /**
   * 生成 AI 提示词（将上下文转换为 AI 可理解的格式）
   */
  toAIPrompt() {
    const sections = [];

    // 问题理解
    sections.push(`## 用户问题\n${this.metadata.question.original}`);

    // 文件上下文
    const fileDesc = this.file.toAIDescription();
    sections.push(`## 项目结构\n${fileDesc.summary}`);
    if (fileDesc.keyFiles.length > 0) {
      sections.push('\n关键文件:');
      for (const file of fileDesc.keyFiles) {
        sections.push(`- ${file.path}: ${file.description}`);
      }
    }

    // UI 上下文
    const uiDesc = this.ui.toAIDescription();
    sections.push(`\n## UI 结构\n${uiDesc.summary}`);
    if (uiDesc.pages.length > 0) {
      sections.push('\n页面列表:');
      for (const page of uiDesc.pages.slice(0, 10)) {
        sections.push(`- ${page.name}: ${page.description} (${page.file})`);
      }
    }

    // 数据上下文
    const dataDesc = this.data.toAIDescription();
    sections.push(`\n## 数据模型\n${dataDesc.summary}`);
    if (dataDesc.models.length > 0) {
      sections.push('\n数据模型:');
      for (const model of dataDesc.models.slice(0, 10)) {
        const issues = model.issues.length > 0 ? ` [问题: ${model.issues.join(', ')}]` : '';
        sections.push(`- ${model.name}: ${model.fields} 个字段${issues}`);
      }
    }
    if (dataDesc.apis.length > 0) {
      sections.push('\nAPI 接口:');
      for (const api of dataDesc.apis.slice(0, 10)) {
        sections.push(`- ${api.method} ${api.path}: ${api.responseType || 'unknown'}`);
      }
    }

    // 业务上下文
    const businessDesc = this.business.toAIDescription();
    sections.push(`\n## 业务流程\n${businessDesc.summary}`);
    if (businessDesc.userFlows.length > 0) {
      sections.push('\n主要用户流程:');
      for (const flow of businessDesc.userFlows.slice(0, 5)) {
        sections.push(`- ${flow.name}: ${flow.steps.length} 个步骤`);
      }
    }

    // 代码上下文（放在最后，通常最详细）
    const codeDesc = this.code.toAIDescription();
    sections.push(`\n## 代码逻辑\n${codeDesc.summary}`);
    if (codeDesc.dataFlow.sources.length > 0) {
      sections.push('\n数据流:');
      sections.push(`来源: ${codeDesc.dataFlow.sources.map(s => s.description).join(', ')}`);
      sections.push(`目的地: ${codeDesc.dataFlow.sinks.map(s => s.description).join(', ')}`);
    }

    return sections.join('\n');
  }

  /**
   * 导出为 JSON
   */
  toJSON() {
    return {
      metadata: this.metadata,
      file: this.file,
      code: this.code,
      ui: this.ui,
      data: this.data,
      business: this.business,
    };
  }

  /**
   * 从 JSON 导入
   */
  static fromJSON(json) {
    const context = new AIContext();
    context.metadata = json.metadata;
    context.file = Object.assign(new FileContext(), json.file);
    context.code = Object.assign(new CodeContext(), json.code);
    context.ui = Object.assign(new UIContext(), json.ui);
    context.data = Object.assign(new DataContext(), json.data);
    context.business = Object.assign(new BusinessContext(), json.business);
    return context;
  }
}

module.exports = {
  AIContext,
  FileContext,
  CodeContext,
  UIContext,
  DataContext,
  BusinessContext,
};
