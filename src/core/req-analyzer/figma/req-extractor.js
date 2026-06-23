/**
 * Figma 需求提取器
 *
 * 复用已有的 FigmaIntegration 基础能力：
 * - parseFigmaUrl: 支持 /file/ /design/ /proto/ 三种格式
 * - getFile / getFileNode: API 调用获取设计数据
 * - parseNodeSpecs: 设计规范解析
 *
 * 新增：从 Figma 设计数据中提取需求信息
 * - 页面/Frame → 功能模块
 * - UI 元素 → 功能描述
 * - 文本内容 → 界面文案需求
 * - Component Variants → 状态/交互逻辑
 */

class FigmaReqExtractor {
  constructor() {
    this.figmaIntegration = null;
    this.accessToken = '';
    // 缓存：列出节点时获取的数据直接用于提取，避免二次 API 调用
    this._cachedNodeDoc = null;
    this._cachedNodeId = null;
    this._cachedFileKey = null;
    this._cachedFileName = '';
  }

  /**
   * 设置 Figma Access Token
   * 复用已有的 testingManager.figmaIntegration 的 Token
   */
  setAccessToken(token) {
    this.accessToken = token;
  }

  /**
   * 设置 FigmaIntegration 实例（复用已有实例）
   */
  setFigmaIntegration(instance) {
    this.figmaIntegration = instance;
    if (instance && instance.accessToken) {
      this.accessToken = instance.accessToken;
    }
  }

  /**
   * 列出 Figma 节点内的子 Layer
   * 从 URL 的 node-id 参数定位到具体节点，列出其子 Frame/Layer
   * @param {string} figmaUrl - Figma 文件链接（含 node-id 参数）
   * @returns {Promise<Object>} { success, fileKey, fileName, nodeId, layers: [{ id, name, type, childrenCount }] }
   */
  async listNodeChildren(figmaUrl) {
    console.log('[FigmaReqExtractor.listNodeChildren] 开始, figmaUrl:', figmaUrl);

    const FigmaIntegration = require('../../testing/figma-integration');
    const figmaClient = new FigmaIntegration();

    if (!this.accessToken) {
      throw new Error('Figma Access Token 未设置。请在 Figma Tab 中输入 Token。');
    }

    figmaClient.setAccessToken(this.accessToken);

    // 从 URL 提取 node-id
    const nodeMatch = figmaUrl.match(/node-id=([0-9-]+)/);
    if (!nodeMatch) {
      throw new Error('URL 中没有 node-id 参数。请从 Figma 中右键点击某个 Frame → 复制链接，确保 URL 包含 node-id。');
    }
    const nodeId = nodeMatch[1];
    console.log('[FigmaReqExtractor.listNodeChildren] nodeId:', nodeId);

    try {
      const urlInfo = figmaClient.parseFigmaUrl(figmaUrl);
      const fileKey = urlInfo.fileKey;
      if (!fileKey) {
        throw new Error('无法从 Figma URL 解析 fileKey。请确认 URL 格式正确。');
      }

      // 只获取指定节点的子元素
      console.log('[FigmaReqExtractor.listNodeChildren] 调用 getFileNode...');
      const nodeResult = await figmaClient.getFileNode(fileKey, nodeId);
      console.log('[FigmaReqExtractor.listNodeChildren] 返回成功');

      // getFileNode 返回完整 API 响应 { nodes: { "28959:188": { document: ... } } }
      // URL 中 node-id 是横线格式 "28959-188"，API 返回的 key 是冒号格式 "28959:188"
      const colonNodeId = nodeId.replace(/-/g, ':');
      const nodeDoc = nodeResult.nodes?.[colonNodeId]?.document
        || nodeResult.nodes?.[nodeId]?.document
        || nodeResult.document
        || nodeResult;
      console.log('[FigmaReqExtractor.listNodeChildren] nodeDoc type:', nodeDoc.type, 'name:', nodeDoc.name);
      console.log('[FigmaReqExtractor.listNodeChildren] children 数量:', nodeDoc.children?.length || 0);

      // 缓存 nodeDoc，提取需求时直接使用，不再发 API 请求
      this._cachedNodeDoc = nodeDoc;
      this._cachedNodeId = nodeId;
      this._cachedFileKey = fileKey;
      this._cachedFileName = nodeResult.name || '';

      // 列出子 Layer（直接子节点，通常是 Frame/Group/Section）
      const layers = [];
      if (nodeDoc.children) {
        for (const child of nodeDoc.children) {
          layers.push({
            id: child.id,
            name: child.name,
            type: child.type,
            childrenCount: child.children ? child.children.length : 0,
          });
        }
      }

      return {
        success: true,
        fileKey,
        fileName: nodeResult.name || '',
        nodeId,
        nodeName: nodeDoc.name || '',
        nodeType: nodeDoc.type || '',
        layers,
      };
    } catch (e) {
      console.error('[FigmaReqExtractor.listNodeChildren] 失败:', e.message);
      throw e;
    }
  }

  /**
   * 从 Figma URL 提取需求信息
   * 优先使用缓存数据（listNodeChildren 时已获取），避免二次 API 调用
   * @param {string} figmaUrl - Figma 文件链接（含 node-id）
   * @param {string} nodeId - 节点 ID（从 URL 自动提取）
   * @param {Array<string>} layerIds - 可选的子 Layer ID 列表（只提取这些 Layer）
   * @returns {Promise<Object>} 提取结果
   */
  async extractRequirements(figmaUrl, nodeId = null, layerIds = null) {
    // 从 URL 自动提取 node-id 参数
    if (!nodeId) {
      const nodeMatch = figmaUrl.match(/node-id=([0-9-]+)/);
      if (nodeMatch) {
        nodeId = nodeMatch[1];
      }
    }

    if (!nodeId) {
      throw new Error('URL 中没有 node-id 参数。请从 Figma 中右键点击某个 Frame → 复制链接，确保 URL 包含 node-id。');
    }

    // 1. 解析 URL，获取 fileKey
    const FigmaIntegration = require('../../testing/figma-integration');
    const figmaClient = new FigmaIntegration();
    const urlInfo = figmaClient.parseFigmaUrl(figmaUrl);
    const fileKey = urlInfo.fileKey;

    if (!fileKey) {
      throw new Error('无法从 Figma URL 解析 fileKey。请确认 URL 格式正确。');
    }

    // 2. 获取节点数据：优先用缓存，缓存命中则不发 API 请求
    let nodeDoc;
    let fileName;

    if (this._cachedNodeDoc && this._cachedNodeId === nodeId && this._cachedFileKey === fileKey) {
      console.log('[FigmaReqExtractor.extractRequirements] 使用缓存数据，不再调用 API');
      nodeDoc = this._cachedNodeDoc;
      fileName = this._cachedFileName;
    } else {
      // 缓存不存在或 nodeId/fileKey 变了，需要调 API
      console.log('[FigmaReqExtractor.extractRequirements] 缓存未命中，调用 getFileNode');
      if (!this.accessToken) {
        throw new Error('Figma Access Token 未设置。请在 Figma Tab 中输入 Token。');
      }
      figmaClient.setAccessToken(this.accessToken);

      let nodeResult;
      try {
        nodeResult = await figmaClient.getFileNode(fileKey, nodeId);
      } catch (e) {
        throw new Error(`获取 Figma 节点数据失败: ${e.message}`);
      }

      const colonNodeId = nodeId.replace(/-/g, ':');
      nodeDoc = nodeResult.nodes?.[colonNodeId]?.document
        || nodeResult.nodes?.[nodeId]?.document
        || nodeResult.document
        || nodeResult;
      fileName = nodeResult.name || '';

      // 更新缓存
      this._cachedNodeDoc = nodeDoc;
      this._cachedNodeId = nodeId;
      this._cachedFileKey = fileKey;
      this._cachedFileName = fileName;
    }

    // 3. 根据 layerIds 决定提取范围
    const mergedRequirements = {
      pages: [],
      uiElements: [],
      interactions: [],
      prototypeInteractions: [],
      textContent: [],
      states: [],
    };
    let mergedDesignSpecs = [];

    if (layerIds && layerIds.length > 0) {
      // 只提取选中的 Layer
      for (const layerId of layerIds) {
        // 从 nodeDoc.children 中找到该 Layer
        const layerNode = nodeDoc.children?.find(c => c.id === layerId);
        if (layerNode) {
          const layerReq = this.extractRequirementsFromDesign(layerNode);
          mergedRequirements.pages.push(...layerReq.pages);
          mergedRequirements.uiElements.push(...layerReq.uiElements);
          mergedRequirements.interactions.push(...layerReq.interactions);
          mergedRequirements.prototypeInteractions.push(...layerReq.prototypeInteractions);
          mergedRequirements.textContent.push(...layerReq.textContent);
          mergedRequirements.states.push(...layerReq.states);
          if (layerReq.navigationMap) {
            mergedRequirements.navigationMap = {
              ...(mergedRequirements.navigationMap || {}),
              ...layerReq.navigationMap,
            };
          }
          try {
            const specs = figmaClient.parseNodeSpecs({ document: layerNode });
            if (specs) mergedDesignSpecs.push(specs);
          } catch (e) { /* 忽略 */ }
        }
      }
    } else {
      // 提取整个 node-id 的全部内容
      const allReq = this.extractRequirementsFromDesign(nodeDoc);
      mergedRequirements.pages.push(...allReq.pages);
      mergedRequirements.uiElements.push(...allReq.uiElements);
      mergedRequirements.interactions.push(...allReq.interactions);
      mergedRequirements.prototypeInteractions.push(...allReq.prototypeInteractions);
      mergedRequirements.textContent.push(...allReq.textContent);
      mergedRequirements.states.push(...allReq.states);
      if (allReq.navigationMap) mergedRequirements.navigationMap = allReq.navigationMap;

      try {
        const specs = figmaClient.parseNodeSpecs({ document: nodeDoc });
        if (specs) mergedDesignSpecs.push(specs);
      } catch (e) { /* 忽略 */ }
    }

    // 去重
    this.deduplicateResult(mergedRequirements);

    return {
      success: true,
      figmaUrl,
      fileKey,
      nodeId,
      fileName,
      nodeName: nodeDoc.name || '',
      requirements: mergedRequirements,
      designSpecs: mergedDesignSpecs,
      lastModified: nodeResult.lastModified || '',
    };
  }

  /**
   * 从 Figma 文档树中提取需求信息
   * 递归遍历节点，提取：
   * - 页面/Frame → 功能模块
   * - UI 元素 → 功能描述
   * - 文本内容 → 界面文案需求
   * - Component Variants → 状态逻辑
   */
  extractRequirementsFromDesign(fileData) {
    const result = {
      pages: [],              // 页面/模块列表
      uiElements: [],         // UI 元素需求
      interactions: [],       // 交互流程需求
      prototypeInteractions: [], // Prototype 连线交互（新增）
      textContent: [],        // 文本内容需求
      states: [],             // 状态/变体需求
    };

    // 获取文档根节点
    const document = fileData.document || fileData;

    // 递归遍历
    this.traverseDesignTree(document, result, '', 0);

    // 从 prototype interactions 构建导航图
    if (result.prototypeInteractions.length > 0) {
      result.navigationMap = this.buildNavigationMap(result.prototypeInteractions);
    }

    // 去重
    this.deduplicateResult(result);

    return result;
  }

  /**
   * 递归遍历 Figma 设计树
   * @param {Object} node - Figma 节点
   * @param {Object} result - 结果收集对象
   * @param {string} parentName - 父节点名称
   * @param {number} depth - 深度（限制不超过15层）
   */
  traverseDesignTree(node, result, parentName = '', depth = 0) {
    if (!node || depth > 15) return;

    const name = node.name || '';
    const type = node.type || '';

    // PAGE 类型：Figma 文件中的页面（顶级分组）
    if (type === 'PAGE') {
      result.pages.push({
        name,
        type: 'page',
        id: node.id,
        childrenCount: node.children?.length || 0,
      });
    }

    // FRAME 类型：可能是功能模块或页面区域
    if (type === 'FRAME' && depth > 0) {
      // 根据命名推断功能
      const inferredType = this.inferFramePurpose(name);
      if (inferredType === 'module' || inferredType === 'screen') {
        result.pages.push({
          name,
          type: inferredType,
          id: node.id,
          childrenCount: node.children?.length || 0,
          parent: parentName,
        });
      }

      // 提取 Frame 中的 UI 元素
      this.extractUIFromFrame(node, result, name);
    }

    // COMPONENT 类型：提取交互变体
    if (type === 'COMPONENT' && node.componentPropertyDefinitions) {
      this.extractComponentVariants(node, result, name);
    }

    // COMPONENT_SET 类型：多状态组件集合
    if (type === 'COMPONENT_SET') {
      this.extractComponentSetVariants(node, result, name);
    }

    // Prototype interactions：Figma 原型连线交互
    if (node.reactions && node.reactions.length > 0) {
      for (const reaction of node.reactions) {
        const action = reaction.action || {};
        const trigger = reaction.trigger || {};
        result.prototypeInteractions.push({
          sourceId: node.id,
          sourceName: name,
          triggerType: trigger.type || 'ON_CLICK',
          actionType: action.type || 'NAVIGATE',
          destinationId: action.destinationId || '',
          destinationName: '', // 后续在导航图中解析
          transitionType: action.transition?.type || '',
          hasNavigation: !!action.destinationId,
          description: `从 "${name}" ${trigger.type === 'ON_CLICK' ? '点击' : trigger.type === 'ON_HOVER' ? '悬浮' : '触发'} 跳转到 ${action.destinationId || '无目标'}`,
        });
      }
    }

    // TEXT 类型：提取文本内容
    if (type === 'TEXT') {
      const textContent = node.characters || '';
      if (textContent.trim()) {
        result.textContent.push({
          text: textContent,
          name,
          id: node.id,
          parent: parentName,
          style: node.style ? {
            fontSize: node.style.fontSize,
            fontWeight: node.style.fontWeight,
            fontFamily: node.style.fontFamily,
          } : null,
        });
      }
    }

    // 递归处理子节点
    if (node.children) {
      for (const child of node.children) {
        this.traverseDesignTree(child, result, name, depth + 1);
      }
    }
  }

  /**
   * 从 Frame 中提取 UI 元素需求
   */
  extractUIFromFrame(frame, result, frameName) {
    if (!frame.children) return;

    for (const child of frame.children) {
      const childName = child.name || '';
      const childType = child.type || '';

      // 按节点类型推断 UI 元素
      const uiType = this.inferUIElement(childType, childName);

      if (uiType) {
        result.uiElements.push({
          name: childName,
          type: uiType,
          figmaType: childType,
          id: child.id,
          parent: frameName,
          text: child.characters || '',
          description: this.generateUIDescription(childName, uiType, child.characters),
        });
      }

      // 递归进入子 Frame
      if (childType === 'FRAME' && child.children) {
        this.extractUIFromFrame(child, result, childName);
      }
    }
  }

  /**
   * 从 Component 提取变体（状态逻辑）
   */
  extractComponentVariants(component, result, componentName) {
    const properties = component.componentPropertyDefinitions || {};

    for (const [propName, propDef] of Object.entries(properties)) {
      if (propDef.type === 'VARIANT') {
        result.states.push({
          componentName,
          propertyName: propName,
          variants: propDef.variantValues || [],
          id: component.id,
          description: `${componentName} 有 ${propName} 变体，表示不同状态`,
        });
      }

      // Boolean 属性可能是交互状态
      if (propDef.type === 'BOOLEAN') {
        result.interactions.push({
          componentName,
          propertyName: propName,
          defaultValue: propDef.defaultValue,
          id: component.id,
          description: `${componentName} 的 ${propName} 属性控制显示/隐藏`,
        });
      }
    }
  }

  /**
   * 从 COMPONENT_SET 提取变体组合
   */
  extractComponentSetVariants(componentSet, result, componentName) {
    if (!componentSet.children) return;

    // 收集所有变体值
    const variantNames = new Set();
    const variantCombinations = [];

    for (const child of componentSet.children) {
      const variantProps = this.parseVariantName(child.name);
      variantCombinations.push(variantProps);
      Object.keys(variantProps).forEach(k => variantNames.add(k));
    }

    result.states.push({
      componentName,
      variantProperties: Array.from(variantNames),
      combinations: variantCombinations,
      id: componentSet.id,
      description: `${componentName} 有 ${Array.from(variantNames).join('、')} 属性的 ${variantCombinations.length} 种组合状态`,
    });
  }

  /**
   * 解析 Figma variant 命名格式 "Property1=Value1, Property2=Value2"
   */
  parseVariantName(name) {
    const props = {};
    const parts = name.split(', ');
    for (const part of parts) {
      const [key, value] = part.split('=');
      if (key && value) {
        props[key.trim()] = value.trim();
      }
    }
    return props;
  }

  /**
   * 推断 Frame 的用途（页面/模块/区域）
   */
  inferFramePurpose(name) {
    const lowerName = name.toLowerCase();

    // 页面相关关键词
    const pageKeywords = ['page', 'screen', 'view', '页面', '屏幕', '视图', '画面'];
    if (pageKeywords.some(k => lowerName.includes(k))) return 'screen';

    // 模块/功能关键词
    const moduleKeywords = ['module', 'section', 'component', '模块', '功能', '区域', '区块'];
    if (moduleKeywords.some(k => lowerName.includes(k))) return 'module';

    // 弹窗/对话框关键词
    const dialogKeywords = ['dialog', 'modal', 'popup', '弹窗', '对话框', '提示'];
    if (dialogKeywords.some(k => lowerName.includes(k))) return 'dialog';

    // 默认视为区域
    return 'area';
  }

  /**
   * 推断 UI 元素类型
   */
  inferUIElement(figmaType, name) {
    const lowerName = name.toLowerCase();

    // 根据 Figma 类型直接推断
    if (figmaType === 'TEXT') return 'text';

    // 根据命名推断
    const buttonKeywords = ['button', 'btn', '按钮', '确认', '提交', '取消', 'save', 'submit', 'cancel', 'login', '登录', '登入'];
    if (buttonKeywords.some(k => lowerName.includes(k))) return 'button';

    const inputKeywords = ['input', 'field', 'textfield', '输入', '输入框', '文本框', '搜索', 'search'];
    if (inputKeywords.some(k => lowerName.includes(k))) return 'input';

    const selectKeywords = ['select', 'dropdown', 'picker', '选择', '下拉', '列表选择'];
    if (selectKeywords.some(k => lowerName.includes(k))) return 'select';

    const navKeywords = ['nav', 'tab', 'menu', 'sidebar', '导航', '菜单', '标签', '侧栏'];
    if (navKeywords.some(k => lowerName.includes(k))) return 'navigation';

    const listKeywords = ['list', 'card', 'item', 'row', '列表', '卡片', '条目'];
    if (listKeywords.some(k => lowerName.includes(k))) return 'list';

    const iconKeywords = ['icon', '图标', 'ico'];
    if (iconKeywords.some(k => lowerName.includes(k))) return 'icon';

    // Frame 类型需要根据子节点推断
    if (figmaType === 'FRAME' || figmaType === 'GROUP') {
      return 'container';
    }

    return null;
  }

  /**
   * 生成 UI 元素的需求描述
   */
  generateUIDescription(name, uiType, text) {
    const typeLabels = {
      button: '按钮',
      input: '输入框',
      select: '选择器',
      navigation: '导航',
      list: '列表',
      text: '文本',
      icon: '图标',
      container: '容器/区域',
    };

    const label = typeLabels[uiType] || uiType;
    let desc = `${label} "${name}"`;

    if (text && text.trim()) {
      desc += `，显示文字 "${text.trim()}"`;
    }

    return desc;
  }

  /**
   * 去重结果数据
   */
  deduplicateResult(result) {
    // 文本内容去重
    const seenTexts = new Set();
    result.textContent = result.textContent.filter(item => {
      const key = item.text.trim();
      if (seenTexts.has(key) || key.length < 2) return false;
      seenTexts.add(key);
      return true;
    });

    // UI 元素按 name+type 去重
    const seenUI = new Set();
    result.uiElements = result.uiElements.filter(item => {
      const key = `${item.name}:${item.type}`;
      if (seenUI.has(key)) return false;
      seenUI.add(key);
      return true;
    });
  }

  /**
   * 从 prototype interactions 构建导航图
   * 将所有连线交互汇总为 source → target 映射关系
   */
  buildNavigationMap(interactions) {
    const navigationMap = {};

    for (const inter of interactions) {
      if (!inter.hasNavigation) continue;

      const sourceKey = inter.sourceName || inter.sourceId;
      if (!navigationMap[sourceKey]) {
        navigationMap[sourceKey] = [];
      }

      navigationMap[sourceKey].push({
        targetId: inter.destinationId,
        trigger: inter.triggerType,
        actionType: inter.actionType,
        transitionType: inter.transitionType,
        description: inter.description,
      });
    }

    return navigationMap;
  }
}

module.exports = FigmaReqExtractor;