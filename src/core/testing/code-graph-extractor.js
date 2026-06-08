/**
 * Code Graph Extractor
 *
 * 从 CODE_GRAPH.json 中智能提取与指定页面相关的类信息
 *
 * 功能：
 * - 根据页面/Controller 名称提取相关类
 * - 根据 API 调用查找 Provider 类
 * - 根据 UI 元素查找 Widget 类
 * - 生成精简的、适合 AI 使用的上下文
 */

const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../config/data-dir');

class CodeGraphExtractor {
  constructor(options = {}) {
    this.codeGraphPath = options.codeGraphPath || null;
    this.testContextPath = options.testContextPath || null;
    this.aiContextPath = options.aiContextPath || null;

    this.codeGraph = null;
    this.testContext = null;
    this.aiContext = null;
  }

  /**
   * 加载所有数据文件（优先 DATA_DIR 主位置，回退项目 .dev-qa/）
   */
  loadData(projectPath) {
    const folderName = path.basename(projectPath);

    // 优先：DATA_DIR/AI_Scan_file/{folderName}/（统一路径）
    const primaryDir = path.join(DATA_DIR, 'AI_Scan_file', folderName);

    // 回退：项目目录 .dev-qa/（旧位置兼容）
    const projectQaDir = path.join(projectPath, '.dev-qa');

    // 查找文件的辅助函数：优先 DATA_DIR 主位置，回退项目目录
    const findFile = (newName, legacyName) => {
      const primaryPath = path.join(primaryDir, newName);
      if (fs.existsSync(primaryPath)) return primaryPath;
      const projectPath = path.join(projectQaDir, newName);
      if (fs.existsSync(projectPath)) return projectPath;
      // 尝试带项目名前缀的旧格式
      const legacyPath = path.join(primaryDir, `${folderName}_${newName}`);
      if (fs.existsSync(legacyPath)) return legacyPath;
      return null;
    };

    // 1. 加载 CODE_GRAPH.json
    const codeGraphPath = findFile('.code-graph.json');
    if (codeGraphPath) {
      try {
        const content = fs.readFileSync(codeGraphPath, 'utf8');
        this.codeGraph = JSON.parse(content);
        console.log(`[CodeGraphExtractor] 已加载 CODE_GRAPH.json (${codeGraphPath}): ${this.codeGraph.metadata?.totalNodes || 0} 个节点`);
      } catch (e) {
        console.error('[CodeGraphExtractor] 加载 CODE_GRAPH.json 失败:', e.message);
      }
    }

    // 2. 加载 TEST_CONTEXT.json
    const testContextPath = findFile('TEST_CONTEXT.json');
    if (testContextPath) {
      try {
        const content = fs.readFileSync(testContextPath, 'utf8');
        this.testContext = JSON.parse(content);
        console.log(`[CodeGraphExtractor] 已加载 TEST_CONTEXT.json (${testContextPath}): ${this.testContext.features?.length || 0} 个功能点`);
      } catch (e) {
        console.error('[CodeGraphExtractor] 加载 TEST_CONTEXT.json 失败:', e.message);
      }
    }

    // 3. 加载 AI_CONTEXT.md
    const aiContextPath = findFile('AI_CONTEXT.md');
    if (aiContextPath) {
      try {
        this.aiContext = fs.readFileSync(aiContextPath, 'utf8');
        console.log(`[CodeGraphExtractor] 已加载 AI_CONTEXT.md (${aiContextPath}): ${this.aiContext?.length || 0} 字符`);
      } catch (e) {
        console.error('[CodeGraphExtractor] 加载 AI_CONTEXT.md 失败:', e.message);
      }
    }

    return {
      hasCodeGraph: !!this.codeGraph,
      hasTestContext: !!this.testContext,
      hasAiContext: !!this.aiContext
    };
  }

  /**
   * 根据功能点名称提取相关类信息
   * @param {string} featureName - 功能点/页面名称
   * @param {Object} options - 选项
   * @returns {Object} 提取的相关类信息
   */
  extractForFeature(featureName, options = {}) {
    if (!this.codeGraph) {
      return { success: false, error: 'CODE_GRAPH.json 未加载' };
    }

    const {
      includeController = true,
      includeProvider = true,
      includeWidget = true,
      includeRelated = true,
      maxDepth = 2
    } = options;

    const result = {
      featureName,
      controllers: [],
      providers: [],
      widgets: [],
      models: [],
      routes: [],
      summary: ''
    };

    // 1. 首先从 TEST_CONTEXT 中查找功能点
    const feature = this.testContext?.features?.find(f =>
      f.name === featureName ||
      f.entry_points?.some(ep => ep === featureName) ||
      f.route?.toLowerCase() === featureName.toLowerCase()
    );

    if (feature) {
      result.feature = feature;
      result.summary = `功能: ${feature.name}, 路由: ${feature.route || 'N/A'}`;
    }

    // 2. 提取 Controller 类
    if (includeController) {
      const controllerNames = feature?.controllers || [];
      // 如果没有指定 controller，尝试从名称推断
      if (controllerNames.length === 0) {
        controllerNames.push(this.inferControllerName(featureName));
      }

      for (const controllerName of controllerNames) {
        const controllerInfo = this.extractControllerClass(controllerName);
        if (controllerInfo) {
          result.controllers.push(controllerInfo);
        }
      }
    }

    // 3. 根据 API 调用提取 Provider 类
    if (includeProvider && feature?.api_calls) {
      for (const apiCall of feature.api_calls) {
        const providerInfo = this.findProviderByApiCall(apiCall);
        if (providerInfo && !result.providers.some(p => p.name === providerInfo.name)) {
          result.providers.push(providerInfo);
        }
      }
    }

    // 4. 根据 Controller 的属性提取相关 Provider
    if (includeRelated && result.controllers.length > 0) {
      for (const controller of result.controllers) {
        const relatedProviders = this.extractProvidersFromController(controller);
        for (const provider of relatedProviders) {
          if (!result.providers.some(p => p.name === provider.name)) {
            result.providers.push(provider);
          }
        }
      }
    }

    // 5. 提取 Widget 类（根据页面名称）
    if (includeWidget) {
      const widgetInfo = this.extractWidgetClass(featureName);
      if (widgetInfo) {
        result.widgets.push(widgetInfo);
      }
    }

    // 6. 提取路由信息
    const routeInfo = this.extractRouteInfo(featureName);
    if (routeInfo) {
      result.routes.push(routeInfo);
    }

    return {
      success: true,
      ...result
    };
  }

  /**
   * 提取 Controller 类的详细信息
   * @param {string} controllerName - Controller 类名
   * @returns {Object|null} Controller 信息
   */
  extractControllerClass(controllerName) {
    if (!this.codeGraph || !this.codeGraph.nodes) {
      return null;
    }

    // 首先尝试精确匹配 Controller 类（优先匹配以 Controller 结尾的类）
    let controllerNode = this.codeGraph.nodes.find(n =>
      n.type === 'class' &&
      n.name === controllerName &&
      n.name.endsWith('Controller')
    );

    // 如果没找到，尝试部分匹配
    if (!controllerNode) {
      controllerNode = this.codeGraph.nodes.find(n =>
        n.type === 'class' &&
        n.name === controllerName
      );
    }

    // 如果还是没找到，尝试移除 Controller 后缀后匹配
    if (!controllerNode && controllerName.endsWith('Controller')) {
      const baseName = controllerName.replace('Controller', '');
      controllerNode = this.codeGraph.nodes.find(n =>
        n.type === 'class' &&
        n.name === baseName + 'Controller'
      );
    }

    if (!controllerNode) {
      console.log(`[CodeGraphExtractor] 未找到 Controller: ${controllerName}`);
      return null;
    }

    console.log(`[CodeGraphExtractor] 找到 Controller: ${controllerNode.name} (extends ${controllerNode.superClass})`);
    console.log(`[CodeGraphExtractor] 方法数量: ${controllerNode.methods?.length || 0}`);

    // 获取方法详情
    const methodDetails = this.extractMethodDetails(controllerNode);

    // 获取属性详情
    const propertyDetails = this.extractPropertyDetails(controllerNode);

    return {
      name: controllerNode.name,
      superClass: controllerNode.superClass,
      methods: methodDetails,
      properties: propertyDetails,
      line: controllerNode.line,
      fileName: controllerNode.fileName
    };
  }

  /**
   * 从 Controller 节点中提取方法详情
   */
  extractMethodDetails(classNode) {
    const methods = {
      lifecycle: [],   // onInit, onReady, onClose, etc.
      actions: [],     // 用户操作方法
      api: [],         // API 调用方法
      data: [],        // 数据处理方法
      other: []
    };

    // 处理 methods 数组（可能是对象数组或字符串数组）
    if (classNode.methods && Array.isArray(classNode.methods)) {
      for (const method of classNode.methods) {
        // 方法可能是对象 {name, returnType, parameters, line} 或字符串
        const methodName = typeof method === 'string' ? method : method.name;
        const methodDetail = typeof method === 'object' ? method : null;

        if (!methodName) continue;

        // 分类方法
        if (['onInit', 'onReady', 'onClose', 'onDetached', 'dispose', 'build', 'initState'].includes(methodName)) {
          methods.lifecycle.push(methodName);
        } else if (methodName.match(/^(on|handle|click|tap|press|submit|change)/i)) {
          methods.actions.push(methodName);
        } else if (methodName.match(/^(get|fetch|load|save|delete|update|create|remove|add|edit)/i)) {
          methods.data.push(methodName);
        } else if (methodName.match(/^(api|call|request|invoke)/i)) {
          methods.api.push(methodName);
        } else {
          methods.other.push(methodName);
        }
      }
    }

    // 从 actionMethods 中补充（这是 AST 提取的操作方法）
    if (classNode.actionMethods) {
      for (const [type, methodList] of Object.entries(classNode.actionMethods)) {
        if (Array.isArray(methodList) && methodList.length > 0) {
          // 将方法名添加到 actions
          for (const method of methodList) {
            const methodName = typeof method === 'string' ? method : method.name;
            if (methodName && !methods.actions.includes(methodName)) {
              methods.actions.push(methodName);
            }
          }
        }
      }
    }

    // 从 apiMethods 中补充
    if (classNode.apiMethods && Array.isArray(classNode.apiMethods)) {
      for (const apiMethod of classNode.apiMethods) {
        if (apiMethod.url || apiMethod.method) {
          methods.api.push(`${apiMethod.method || 'GET'} ${apiMethod.url || ''}`);
        }
      }
    }

    return methods;
  }

  /**
   * 从 Controller 节点中提取属性详情
   */
  extractPropertyDetails(classNode) {
    const properties = {
      state: [],      // Rx 响应式变量
      models: [],     // 数据模型
      controllers: [], // 子控制器
      services: [],   // 服务层
      other: []
    };

    if (classNode.properties && Array.isArray(classNode.properties)) {
      for (const prop of classNode.properties) {
        const propName = typeof prop === 'string' ? prop : prop.name;
        const propType = typeof prop === 'object' ? prop.type : null;

        if (propName.match(/^(is|has|can)/) || propType?.startsWith('Rx')) {
          properties.state.push(propName);
        } else if (propName.endsWith('Model') || propName.endsWith('Entity')) {
          properties.models.push(propName);
        } else if (propName.endsWith('Controller')) {
          properties.controllers.push(propName);
        } else if (propName.endsWith('Service') || propName.endsWith('Provider') || propName.endsWith('Repository')) {
          properties.services.push(propName);
        } else {
          properties.other.push(propName);
        }
      }
    }

    // 从 uiProperties 中提取输入框等
    if (classNode.uiProperties) {
      const uiProps = [];
      if (classNode.uiProperties.inputs?.length > 0) {
        uiProps.push(...classNode.uiProperties.inputs.map(i => `input_${i.name}`));
      }
      if (classNode.uiProperties.dropdowns?.length > 0) {
        uiProps.push(...classNode.uiProperties.dropdowns.map(d => `dropdown_${d.name}`));
      }
      properties.other.push(...uiProps);
    }

    return properties;
  }

  /**
   * 根据 API 调用查找 Provider 类
   * @param {string} apiCall - API 调用字符串 (如 "GET /accounting/dupPayMgt/eraseElse")
   * @returns {Object|null} Provider 信息
   */
  findProviderByApiCall(apiCall) {
    if (!this.codeGraph || !this.codeGraph.nodes) {
      return null;
    }

    // 解析 API 调用
    const parts = apiCall.split(' ');
    if (parts.length < 2) return null;

    const method = parts[0]; // GET, POST, etc.
    const url = parts.slice(1).join(' '); // /accounting/dupPayMgt/eraseElse

    // 查找包含此 API 调用的类
    const providerNodes = this.codeGraph.nodes.filter(n =>
      n.type === 'class' &&
      n.apiMethods &&
      n.apiMethods.some(m =>
        (m.method === method || m.url === url) &&
        (m.url === url || url.includes(m.url) || m.url.includes(url))
      )
    );

    if (providerNodes.length === 0) {
      return null;
    }

    // 返回第一个匹配的 Provider
    const provider = providerNodes[0];
    return {
      name: provider.name,
      superClass: provider.superClass,
      apiMethods: provider.apiMethods || [],
      methods: provider.methods || [],
      fileName: provider.fileName
    };
  }

  /**
   * 从 Controller 的属性中提取 Provider 引用
   */
  extractProvidersFromController(controller) {
    const providers = [];

    if (!controller.properties) {
      return providers;
    }

    // 查找类型为 Provider/Service/Repository 的属性
    const providerTypes = controller.properties.services || [];
    for (const providerName of providerTypes) {
      const providerInfo = this.extractControllerClass(providerName);
      if (providerInfo) {
        providers.push({
          name: providerInfo.name,
          type: 'service',
          methods: providerInfo.methods
        });
      }
    }

    return providers;
  }

  /**
   * 提取 Widget 类信息
   * @param {string} featureName - 功能点名称
   * @returns {Object|null} Widget 信息
   */
  extractWidgetClass(featureName) {
    if (!this.codeGraph || !this.codeGraph.nodes) {
      return null;
    }

    // 尝试多种命名模式
    const possibleNames = [
      featureName,
      `${featureName}Page`,
      `${featureName}Screen`,
      `${featureName}View`,
      `${featureName}Widget`,
      `${featureName}Form`,
      `${featureName}Content`
    ];

    for (const name of possibleNames) {
      const widgetNode = this.codeGraph.nodes.find(n =>
        n.type === 'class' &&
        n.name === name &&
        (n.superClass === 'StatelessWidget' ||
         n.superClass === 'StatefulWidget' ||
         n.superClass?.endsWith('Widget'))
      );

      if (widgetNode) {
        return {
          name: widgetNode.name,
          superClass: widgetNode.superClass,
          uiProperties: widgetNode.uiProperties || {},
          actionMethods: widgetNode.actionMethods || {},
          fileName: widgetNode.fileName
        };
      }
    }

    return null;
  }

  /**
   * 提取路由信息
   * @param {string} featureName - 功能点名称
   * @returns {Object|null} 路由信息
   */
  extractRouteInfo(featureName) {
    if (!this.testContext) {
      return null;
    }

    const feature = this.testContext.features?.find(f =>
      f.name === featureName ||
      f.entry_points?.some(ep => ep === featureName)
    );

    if (!feature) {
      return null;
    }

    return {
      name: feature.name,
      route: feature.route,
      entryPoints: feature.entry_points
    };
  }

  /**
   * 推断 Controller 名称
   */
  inferControllerName(featureName) {
    // 移除常见的后缀
    const baseName = featureName
      .replace(/Page$/, '')
      .replace(/Screen$/, '')
      .replace(/View$/, '')
      .replace(/Widget$/, '')
      .replace(/Content$/, '')
      .replace(/Form$/, '')
      .replace(/Maintenance$/, '')
      .replace(/Management$/, '');

    return `${baseName}Controller`;
  }

  /**
   * 生成 AI 友好的上下文格式
   * @param {Object} extractedData - 提取的数据
   * @param {Object} options - 选项
   * @returns {string} 格式化的上下文
   */
  formatForAI(extractedData, options = {}) {
    const {
      includeAiContext = true,
      includeCodeDetails = true,
      format = 'markdown' // markdown | json
    } = options;

    if (format === 'json') {
      return JSON.stringify(extractedData, null, 2);
    }

    const sections = [];

    // 1. 项目上下文（精简版）
    if (includeAiContext && this.aiContext) {
      sections.push(this.formatAiContextCompact());
    }

    // 2. 目标页面信息
    sections.push(this.formatTargetPage(extractedData));

    // 3. 代码详情
    if (includeCodeDetails) {
      sections.push(this.formatCodeDetails(extractedData));
    }

    return sections.join('\n\n---\n\n');
  }

  /**
   * 格式化精简的 AI 上下文
   */
  formatAiContextCompact() {
    if (!this.aiContext) {
      return '';
    }

    // 提取关键信息
    const lines = this.aiContext.split('\n');
    const relevantSections = [];

    let inProjectSection = false;
    let inTechStack = false;
    let inComponents = false;
    let inCodeStyle = false;

    for (const line of lines) {
      if (line.includes('## 📋 项目概述') || line.includes('## 🏗️ 技术栈')) {
        inTechStack = true;
        relevantSections.push(line);
        continue;
      }
      if (line.includes('## 🎨 UI 组件库')) {
        inComponents = true;
        inTechStack = false;
        relevantSections.push(line);
        continue;
      }
      if (line.includes('## 📝 代码规范')) {
        inCodeStyle = true;
        inComponents = false;
        relevantSections.push(line);
        continue;
      }
      if (line.startsWith('## ') && !line.includes('项目概述') &&
          !line.includes('技术栈') && !line.includes('UI 组件库') && !line.includes('代码规范')) {
        inTechStack = false;
        inComponents = false;
        inCodeStyle = false;
      }

      if (inTechStack || inComponents || inCodeStyle) {
        // 跳过空行和过长的列表
        if (line.trim() && !line.startsWith('| ---') && relevantSections.length < 50) {
          relevantSections.push(line);
        }
      }
    }

    return '## 项目上下文\n\n' + relevantSections.join('\n');
  }

  /**
   * 格式化目标页面信息
   */
  formatTargetPage(data) {
    const lines = ['## 目标页面', ''];

    if (data.feature) {
      lines.push(`**页面名称**: ${data.feature.name}`);
      lines.push(`**路由**: ${data.feature.route || 'N/A'}`);
      lines.push(`**入口点**: ${data.feature.entry_points?.join(', ') || 'N/A'}`);
    }

    if (data.feature?.ui_elements) {
      const ui = data.feature.ui_elements;

      if (ui.inputs?.length > 0) {
        lines.push('\n**输入框**:');
        for (const input of ui.inputs.slice(0, 10)) {
          lines.push(`  - ${input.name} (${input.type || 'text'})`);
        }
      }

      if (ui.buttons?.length > 0) {
        const uniqueButtons = [...new Set(ui.buttons.map(b => b.name))];
        lines.push('\n**按钮**:');
        for (const button of uniqueButtons.slice(0, 15)) {
          lines.push(`  - ${button}`);
        }
      }

      if (ui.lists?.length > 0) {
        lines.push('\n**列表**:');
        for (const list of ui.lists) {
          lines.push(`  - ${list.name}`);
        }
      }
    }

    if (data.feature?.api_calls?.length > 0) {
      lines.push('\n**API 调用**:');
      for (const api of data.feature.api_calls) {
        lines.push(`  - ${api}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * 格式化代码详情
   */
  formatCodeDetails(data) {
    const lines = ['## 代码详情', ''];

    // Controller 详情
    if (data.controllers?.length > 0) {
      for (const controller of data.controllers) {
        lines.push(`### Controller: ${controller.name}`);
        if (controller.superClass) {
          lines.push(`**继承**: ${controller.superClass}`);
        }

        if (controller.methods) {
          const methodGroups = [];
          if (controller.methods.lifecycle?.length > 0) {
            methodGroups.push(`生命周期: ${controller.methods.lifecycle.join(', ')}`);
          }
          if (controller.methods.actions?.length > 0) {
            methodGroups.push(`操作: ${controller.methods.actions.join(', ')}`);
          }
          if (controller.methods.data?.length > 0) {
            methodGroups.push(`数据: ${controller.methods.data.join(', ')}`);
          }
          if (methodGroups.length > 0) {
            lines.push(`**方法**:\n  - ${methodGroups.join('\n  - ')}`);
          }
        }

        if (controller.properties) {
          const propGroups = [];
          if (controller.properties.state?.length > 0) {
            propGroups.push(`状态: ${controller.properties.state.join(', ')}`);
          }
          if (controller.properties.services?.length > 0) {
            propGroups.push(`服务: ${controller.properties.services.join(', ')}`);
          }
          if (propGroups.length > 0) {
            lines.push(`**属性**:\n  - ${propGroups.join('\n  - ')}`);
          }
        }

        lines.push('');
      }
    }

    // Provider 详情
    if (data.providers?.length > 0) {
      lines.push('### Provider / API 服务');
      for (const provider of data.providers) {
        lines.push(`**${provider.name}**`);
        if (provider.apiMethods?.length > 0) {
          lines.push(`  API: ${provider.apiMethods.map(m => `${m.method} ${m.url}`).join(', ')}`);
        }
        if (provider.methods?.length > 0) {
          const methods = Array.isArray(provider.methods)
            ? provider.methods.slice(0, 10).join(', ')
            : Object.values(provider.methods).flat().slice(0, 10).join(', ');
          lines.push(`  方法: ${methods}`);
        }
      }
      lines.push('');
    }

    // Widget 详情
    if (data.widgets?.length > 0) {
      lines.push('### Widget 组件');
      for (const widget of data.widgets) {
        lines.push(`**${widget.name}** (${widget.superClass})`);

        if (widget.uiProperties?.inputs?.length > 0) {
          lines.push(`  输入: ${widget.uiProperties.inputs.map(i => i.name).join(', ')}`);
        }
        if (widget.actionMethods) {
          const actions = Object.entries(widget.actionMethods)
            .filter(([_, list]) => list?.length > 0)
            .map(([type, list]) => `${type}: ${list.join(', ')}`)
            .join(', ');
          if (actions) {
            lines.push(`  操作: ${actions}`);
          }
        }
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * 批量提取多个功能点
   * @param {Array<string>} featureNames - 功能点名称列表
   * @param {Object} options - 选项
   * @returns {Object} 批量提取结果
   */
  extractBatch(featureNames, options = {}) {
    const results = {
      features: [],
      sharedContext: null,
      summary: ''
    };

    // 提取共享上下文（只提取一次）
    if (options.includeAiContext && this.aiContext) {
      results.sharedContext = this.formatAiContextCompact();
    }

    for (const featureName of featureNames) {
      const extracted = this.extractForFeature(featureName, options);
      if (extracted.success) {
        results.features.push(extracted);
      }
    }

    results.summary = `已提取 ${results.features.length} 个功能点的上下文`;

    return results;
  }

  /**
   * 根据需求描述自动推断相关功能点
   * @param {string} requirement - 需求描述
   * @returns {Array<string>} 推断的功能点名称
   */
  inferFeaturesFromRequirement(requirement) {
    if (!this.testContext?.features) {
      return [];
    }

    const keywords = this.extractKeywords(requirement);
    const matchedFeatures = [];

    for (const feature of this.testContext.features) {
      const featureText = JSON.stringify(feature).toLowerCase();
      const matchScore = keywords.reduce((score, keyword) => {
        if (featureText.includes(keyword.toLowerCase())) {
          return score + 1;
        }
        return score;
      }, 0);

      if (matchScore > 0) {
        matchedFeatures.push({ feature, score: matchScore });
      }
    }

    // 按匹配度排序，返回前 5 个
    matchedFeatures.sort((a, b) => b.score - a.score);
    return matchedFeatures.slice(0, 5).map(m => m.feature.name);
  }

  /**
   * 从文本中提取关键词
   */
  extractKeywords(text) {
    // 简单的关键词提取：中文词组和英文单词
    const chineseRegex = /[\u4e00-\u9fa5]{2,}/g;
    const englishRegex = /[a-zA-Z]{3,}/g;

    const chineseMatches = text.match(chineseRegex) || [];
    const englishMatches = text.match(englishRegex) || [];

    return [...chineseMatches, ...englishMatches];
  }

  /**
   * 生成完整的 AI Prompt
   * @param {string} featureName - 功能点名称
   * @param {string} requirement - 用户需求
   * @param {Object} options - 选项
   * @returns {string} 完整的 AI Prompt
   */
  buildCompletePrompt(featureName, requirement, options = {}) {
    const extracted = this.extractForFeature(featureName, options);
    const formattedContext = this.formatForAI(extracted, options);

    return `你是一个专业的 Flutter Web 应用测试工程师。

${formattedContext}

## 测试需求
${requirement}

## 生成要求
基于以上上下文生成 BDD 格式测试用例，要求：
1. 使用代码中的实际方法名和变量名
2. 测试数据值要符合业务场景
3. 考虑 API 调用的成功和失败场景
4. when_steps 必须是具体可执行的步骤

## 输出格式
返回 JSON 数组格式的测试用例。`;
  }
}

module.exports = CodeGraphExtractor;
