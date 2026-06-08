/**
 * Flutter UI Structure Analyzer
 *
 * 职责:
 * - 解析 Flutter build 方法
 * - 构建 Widget Tree
 * - 识别常见 Widget 和布局模式
 * - 分析页面结构层次
 * - 提取 Widget 属性和配置
 * - 统计 Widget 类型分布
 * - 增强页面识别
 *
 * 支持的 Widget 类型:
 * - Container, Row, Column, Stack, GridView
 * - Scaffold, AppBar, FloatingActionButton
 * - Text, Image, Icon, Button
 * - ListView, GridView, CustomScrollView
 * - StatelessWidget, StatefulWidget
 */

const fs = require('fs');
const path = require('path');

class FlutterUIAnalyzer {
  constructor() {
    this.widgetTree = new Map(); // 文件 -> Widget 树
    this.widgetRegistry = new Map(); // Widget 注册表
    this.layoutPatterns = new Map(); // 布局模式
    this.pageRegistry = new Map(); // 页面模式注册表
    this.initWidgetRegistry();
    this.initPageRegistry();
  }

  /**
   * 初始化页面模式注册表
   */
  initPageRegistry() {
    // 常见的 Flutter 页面模式
    this.pageRegistry.set('list', {
      patterns: ['ListView', 'ListView.builder', 'GridView'],
      description: '列表页面',
      example: '商品列表、消息列表',
    });

    this.pageRegistry.set('detail', {
      patterns: ['SingleChildScrollView', 'Column', 'Card'],
      description: '详情页面',
      example: '商品详情、用户详情',
    });

    this.pageRegistry.set('form', {
      patterns: ['Form', 'TextField', 'TextFormField', 'Checkbox'],
      description: '表单页面',
      example: '登录、注册、编辑',
    });

    this.pageRegistry.set('tabs', {
      patterns: ['TabBar', 'TabBarView', 'TabController'],
      description: '标签页页面',
      example: '设置、分类浏览',
    });

    this.pageRegistry.set('grid', {
      patterns: ['GridView', 'SliverGrid'],
      description: '网格页面',
      example: '图片网格、应用网格',
    });

    this.pageRegistry.set('search', {
      patterns: ['TextField', 'SearchBar', 'ListView'],
      description: '搜索页面',
      example: '商品搜索、用户搜索',
    });

    this.pageRegistry.set('profile', {
      patterns: ['CircleAvatar', 'Column', 'Card', 'ListTile'],
      description: '个人资料页面',
      example: '用户中心、个人主页',
    });

    this.pageRegistry.set('settings', {
      patterns: ['SwitchListTile', 'ListTile', 'ListView'],
      description: '设置页面',
      example: '应用设置、偏好设置',
    });

    this.pageRegistry.set('empty', {
      patterns: ['Center', 'Text', 'Icon'],
      description: '空状态页面',
      example: '无数据、错误页',
    });

    this.pageRegistry.set('splash', {
      patterns: ['Image.asset', 'Column', 'Center'],
      description: '启动页',
      example: '品牌展示、加载页',
    });
  }

  /**
   * 初始化 Widget 注册表
   */
  initWidgetRegistry() {
    // 常见的 Flutter Widget 分类
    this.widgetRegistry.set('layout', [
      'Container', 'Padding', 'Margin', 'Center', 'Align',
      'SizedBox', 'AspectRatio', 'FractionallySizedBox',
      'Expanded', 'Flexible', 'Spacer',
      'Row', 'Column', 'Stack', 'IndexedStack', 'GridView',
      'ListView', 'ListView.builder', 'ListView.separated',
      'CustomScrollView', 'SingleChildScrollView',
      'Wrap', 'Flow', 'Table',
    ]);

    this.widgetRegistry.set('scaffold', [
      'Scaffold', 'AppBar', 'BottomNavigationBar',
      'Drawer', 'FloatingActionButton', 'SnackBar',
      'BottomSheet', 'TabBar', 'TabBarView',
    ]);

    this.widgetRegistry.set('text', [
      'Text', 'RichText', 'TextSpan',
    ]);

    this.widgetRegistry.set('image', [
      'Image', 'Image.asset', 'Image.network', 'Image.file',
      'Icon', 'IconButton', 'Icons',
    ]);

    this.widgetRegistry.set('input', [
      'TextField', 'TextFormField', 'Form',
      'Checkbox', 'Radio', 'Switch', 'Slider',
      'DropdownButton', 'PopupMenuButton',
    ]);

    this.widgetRegistry.set('button', [
      'ElevatedButton', 'TextButton', 'OutlinedButton',
      'IconButton', 'FloatingActionButton',
      'MaterialButton', 'RaisedButton', 'FlatButton',
    ]);

    this.widgetRegistry.set('card', [
      'Card', 'ListTile', 'DataTable',
    ]);

    this.widgetRegistry.set('navigation', [
      'Navigator', 'Router', 'GoRouter',
      'MaterialApp', 'CupertinoApp', 'WidgetsApp',
    ]);
  }

  /**
   * 分析 Flutter 文件的 UI 结构
   * @param {string} filePath - 文件路径
   * @param {string} content - 文件内容
   * @returns {Object} UI 结构分析结果
   */
  analyzeFile(filePath, content) {
    const result = {
      filePath,
      fileName: path.basename(filePath),
      classes: [],
      widgets: [],
      buildMethods: [],
      layoutPatterns: [],
      pageType: null,           // NEW: 识别的页面类型
      pageConfidence: 0,        // NEW: 识别置信度
      widgetTypeStats: null,    // NEW: Widget 类型统计
      interactiveElements: [],  // NEW: 交互元素
      statistics: {
        totalWidgets: 0,
        maxDepth: 0,
        avgDepth: 0,
        complexityScore: 0,
      },
    };

    // 解析类定义
    const classes = this.extractClasses(content);
    result.classes = classes;

    // 分析每个类的 build 方法
    for (const cls of classes) {
      const buildMethods = this.extractBuildMethods(content, cls);
      result.buildMethods.push(...buildMethods);

      // 分析 build 方法中的 Widget 树
      for (const buildMethod of buildMethods) {
        const widgetTree = this.parseBuildMethod(buildMethod, content);
        result.widgets.push(widgetTree);

        // 识别布局模式
        const patterns = this.identifyLayoutPatterns(widgetTree);
        result.layoutPatterns.push(...patterns);
      }
    }

    // 计算统计信息
    result.statistics = this.calculateStatistics(result.widgets);

    // NEW: 识别页面类型 (取第一个 Widget 树的页面类型)
    if (result.widgets.length > 0 && result.widgets[0].tree) {
      const pageIdentification = this.identifyPageType(result.widgets[0]);
      result.pageType = pageIdentification.type;
      result.pageConfidence = pageIdentification.confidence;

      // NEW: 生成 Widget 类型统计
      result.widgetTypeStats = this.generateWidgetTypeStats(result.widgets[0]);

      // NEW: 提取交互元素
      result.interactiveElements = this.extractInteractiveElements(result.widgets[0]);
    }

    return result;
  }

  /**
   * 提取类定义
   */
  extractClasses(content) {
    const classes = [];

    // 匹配类定义
    const classPattern = /class\s+(\w+)\s+(?:extends\s+(\w+))?\s*\{/g;
    let match;

    while ((match = classPattern.exec(content)) !== null) {
      const className = match[1];
      const superClass = match[2] || null;

      // 检查是否是 Widget 子类
      const isWidget = superClass === 'StatelessWidget' ||
                       superClass === 'StatefulWidget' ||
                       content.includes('Widget build(');

      // 提取类的位置
      const classStart = match.index;
      const classBody = this.extractClassBody(content, classStart);
      const line = this.getLineNumber(content, classStart);

      classes.push({
        name: className,
        superClass,
        widgetType: superClass, // StatelessWidget or StatefulWidget
        isWidget,
        line,
        body: classBody,
      });
    }

    return classes;
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
   * 提取 build 方法
   */
  extractBuildMethods(content, cls) {
    const buildMethods = [];

    // 在类体中查找 build 方法
    const lines = cls.body.split('\n');
    let inBuildMethod = false;
    let buildStartLine = 0;
    let buildContent = '';
    let braceCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // 检测 build 方法开始
      if (trimmed.match(/Widget\s+build\s*\(/)) {
        inBuildMethod = true;
        buildStartLine = cls.line + i;
        buildContent = line;
        braceCount = (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
        continue;
      }

      if (inBuildMethod) {
        buildContent += '\n' + line;
        braceCount += (line.match(/\{/g) || []).length;
        braceCount -= (line.match(/\}/g) || []).length;

        // build 方法结束
        if (braceCount === 0 && trimmed.includes('}')) {
          buildMethods.push({
            className: cls.name,
            line: buildStartLine,
            content: buildContent,
            returnType: 'Widget',
          });
          inBuildMethod = false;
          buildContent = '';
        }
      }
    }

    return buildMethods;
  }

  /**
   * 解析 build 方法，构建 Widget 树
   */
  parseBuildMethod(buildMethod, fileContent) {
    const rootWidget = this.parseWidgetExpression(buildMethod.content);
    const tree = this.buildWidgetTree(rootWidget, 0);

    return {
      className: buildMethod.className,
      methodName: 'build',
      line: buildMethod.line,
      tree,
      rootWidget,
      complexity: this.calculateWidgetComplexity(tree),
    };
  }

  /**
   * 解析 Widget 表达式
   */
  parseWidgetExpression(code) {
    // 移除 return 关键字
    code = code.replace(/return\s+/, '');

    // 提取 Widget 类型
    const widgetMatch = code.match(/(\w+(?:\.\w+)*)\s*\(/);
    if (!widgetMatch) {
      return null;
    }

    const widgetType = widgetMatch[1];
    const category = this.getWidgetCategory(widgetType);

    // 提取参数
    const parameters = this.extractWidgetParameters(code);

    // 提取子 Widget (child 或 children)
    const children = this.extractChildWidgets(code);

    return {
      type: widgetType,
      category,
      parameters,
      children,
    };
  }

  /**
   * 获取 Widget 分类
   */
  getWidgetCategory(widgetType) {
    for (const [category, widgets] of this.widgetRegistry) {
      if (widgets.includes(widgetType)) {
        return category;
      }
    }
    return 'unknown';
  }

  /**
   * 提取 Widget 参数
   */
  extractWidgetParameters(code) {
    const params = {};

    // 常见参数模式
    const paramPatterns = [
      // key: value
      /(\w+):\s*([^,)\n]+)/g,
      // NamedParameter
      /(\w+):\s*(\w+)/g,
    ];

    // 特定参数提取
    const specificParams = {
      'child': /child:\s*(\w+\([^)]*\)|[\w.]+)/,
      'children': /children:\s*\[([^\]]*)\]/,
      'padding': /padding:\s*(EdgeInsets\.all\([^)]*\)|EdgeInsets\.symmetric\([^)]*\))/,
      'margin': /margin:\s*(EdgeInsets\.all\([^)]*\)|EdgeInsets\.symmetric\([^)]*\))/,
      'color': /color:\s*(Colors\.\w+|Color\(0x[0-9a-fA-F]+\))/,
      'width': /width:\s*([\d.]+)/,
      'height': /height:\s*([\d.]+)/,
      'decoration': /decoration:\s*(BoxDecoration\([^)]*\))/,
    };

    for (const [paramName, pattern] of Object.entries(specificParams)) {
      const match = code.match(pattern);
      if (match) {
        params[paramName] = match[1];
      }
    }

    // 提取 text 内容
    const textMatch = code.match(/Text\s*\(\s*['"`]([^'"`]*)['"`]/);
    if (textMatch) {
      params.text = textMatch[1];
    }

    // 提取 Icon 类型
    const iconMatch = code.match(/Icon\s*\(\s*Icons\.(\w+)/);
    if (iconMatch) {
      params.iconName = iconMatch[1];
    }

    // 提取 Image 源
    const imageMatch = code.match(/Image\.(asset|network|file)\s*\(\s*['"`]([^'"`]*)['"`]/);
    if (imageMatch) {
      params.imageType = imageMatch[1];
      params.imageSource = imageMatch[2];
    }

    return params;
  }

  /**
   * 提取子 Widget
   */
  extractChildWidgets(code) {
    const children = [];

    // 提取 child: Widget
    const childMatch = code.match(/child:\s*(\w+\([^)]*\))/);
    if (childMatch) {
      const childWidget = this.parseWidgetExpression(childMatch[1]);
      if (childWidget) {
        children.push(childWidget);
      }
    }

    // 提取 children: [...]
    const childrenArrayMatch = code.match(/children:\s*\[([^\]]*)\]/);
    if (childrenArrayMatch) {
      const childrenCode = childrenArrayMatch[1];
      // 解析数组中的 Widget
      const widgetMatches = childrenCode.match(/\w+\([^)]*\)/g);
      if (widgetMatches) {
        for (const widgetCode of widgetMatches) {
          const childWidget = this.parseWidgetExpression(widgetCode);
          if (childWidget) {
            children.push(childWidget);
          }
        }
      }
    }

    // 提取 body: Widget
    const bodyMatch = code.match(/body:\s*(\w+\([^)]*\))/);
    if (bodyMatch) {
      const bodyWidget = this.parseWidgetExpression(bodyMatch[1]);
      if (bodyWidget) {
        children.push(bodyWidget);
      }
    }

    // 提取 appBar, floatingActionButton 等
    const scaffoldParams = ['appBar', 'floatingActionButton', 'bottomNavigationBar', 'drawer'];
    for (const param of scaffoldParams) {
      const paramMatch = code.match(new RegExp(`${param}:\s*(\\w+\\([^)]*\\))`));
      if (paramMatch) {
        const paramWidget = this.parseWidgetExpression(paramMatch[1]);
        if (paramWidget) {
          children.push(paramWidget);
        }
      }
    }

    return children;
  }

  /**
   * 构建 Widget 树
   */
  buildWidgetTree(widget, depth = 0) {
    if (!widget) {
      return null;
    }

    const treeNode = {
      ...widget,
      depth,
      children: [],
    };

    for (const child of widget.children) {
      const childNode = this.buildWidgetTree(child, depth + 1);
      if (childNode) {
        treeNode.children.push(childNode);
      }
    }

    return treeNode;
  }

  /**
   * 计算 Widget 复杂度
   */
  calculateWidgetComplexity(tree) {
    if (!tree) {
      return { depth: 0, widgetCount: 0, score: 0 };
    }

    let widgetCount = 1;
    let maxDepth = tree.depth;

    const traverse = (node) => {
      if (node.children) {
        for (const child of node.children) {
          widgetCount++;
          if (child.depth > maxDepth) {
            maxDepth = child.depth;
          }
          traverse(child);
        }
      }
    };

    traverse(tree);

    // 复杂度评分：基于深度和 Widget 数量
    const score = Math.round((maxDepth * 10 + widgetCount * 2) / 10);

    return {
      depth: maxDepth,
      widgetCount,
      score,
    };
  }

  /**
   * 识别布局模式
   */
  identifyLayoutPatterns(widgetTree) {
    const patterns = [];

    if (!widgetTree) {
      return patterns;
    }

    const traverse = (node, parentType = null) => {
      if (!node) return;

      // 检查 Scaffold 模式
      if (node.type === 'Scaffold') {
        patterns.push({
          type: 'scaffold',
          name: `Scaffold Layout`,
          description: '标准页面布局，包含 AppBar, Body, FAB 等',
          line: node.line,
        });
      }

      // 检查 Row/Column 布局
      if (node.type === 'Row') {
        patterns.push({
          type: 'horizontal',
          name: 'Row Layout',
          description: '水平布局',
          line: node.line,
        });
      }

      if (node.type === 'Column') {
        patterns.push({
          type: 'vertical',
          name: 'Column Layout',
          description: '垂直布局',
          line: node.line,
        });
      }

      // 检查 Stack 布局
      if (node.type === 'Stack') {
        patterns.push({
          type: 'stacked',
          name: 'Stack Layout',
          description: '层叠布局',
          line: node.line,
        });
      }

      // 检查 ListView
      if (node.type === 'ListView' || node.type === 'ListView.builder') {
        patterns.push({
          type: 'list',
          name: 'List View',
          description: '列表布局',
          line: node.line,
        });
      }

      // 检查 GridView
      if (node.type === 'GridView') {
        patterns.push({
          type: 'grid',
          name: 'Grid View',
          description: '网格布局',
          line: node.line,
        });
      }

      // 检查 TabBarView
      if (node.type === 'TabBarView') {
        patterns.push({
          type: 'tabs',
          name: 'Tab Layout',
          description: '标签页布局',
          line: node.line,
        });
      }

      // 检查 Card + ListTile 模式
      if (node.type === 'Card') {
        const hasListTile = node.children.some(c => c.type === 'ListTile');
        if (hasListTile) {
          patterns.push({
            type: 'card-list',
            name: 'Card List Pattern',
            description: '卡片列表模式',
            line: node.line,
          });
        }
      }

      if (node.children && Array.isArray(node.children)) {
        for (const child of node.children) {
          traverse(child, node.type);
        }
      }
    };

    traverse(widgetTree);

    return patterns;
  }

  /**
   * 计算 Widget 树的统计信息
   */
  calculateStatistics(widgetTrees) {
    let totalWidgets = 0;
    let maxDepth = 0;
    let depthSum = 0;
    let depthCount = 0;

    const widgetTypeCounts = new Map();
    const categoryCounts = new Map();

    for (const tree of widgetTrees) {
      if (!tree.tree) continue;

      const traverse = (node) => {
        totalWidgets++;
        if (node.depth > maxDepth) {
          maxDepth = node.depth;
        }

        depthSum += node.depth;
        depthCount++;

        // 统计 Widget 类型
        widgetTypeCounts.set(node.type, (widgetTypeCounts.get(node.type) || 0) + 1);

        // 统计分类
        categoryCounts.set(node.category, (categoryCounts.get(node.category) || 0) + 1);

        for (const child of node.children) {
          traverse(child);
        }
      };

      traverse(tree.tree);
    }

    const avgDepth = depthCount > 0 ? depthSum / depthCount : 0;
    const complexityScore = widgetTrees.reduce((sum, tree) => sum + (tree.complexity?.score || 0), 0);

    return {
      totalWidgets,
      maxDepth,
      avgDepth: Math.round(avgDepth * 10) / 10,
      complexityScore,
      widgetTypes: Object.fromEntries(widgetTypeCounts),
      categories: Object.fromEntries(categoryCounts),
    };
  }

  /**
   * 识别页面类型
   * @param {Object} widgetTree - Widget 树
   * @returns {Object} 页面类型和置信度
   */
  identifyPageType(widgetTree) {
    if (!widgetTree || !widgetTree.tree) {
      return { type: 'unknown', confidence: 0 };
    }

    const scores = new Map();
    const widgetTypes = new Set();

    // 遍历 Widget 树，收集所有 Widget 类型
    const traverse = (node) => {
      widgetTypes.add(node.type);
      for (const child of node.children) {
        traverse(child);
      }
    };
    traverse(widgetTree.tree);

    // 根据页面注册表评分
    for (const [pageType, pageConfig] of this.pageRegistry) {
      let score = 0;
      const patterns = pageConfig.patterns || [];

      for (const pattern of patterns) {
        // 完全匹配
        if (widgetTypes.has(pattern)) {
          score += 10;
        }
        // 部分匹配（例如 GridView 匹配 SliverGrid）
        for (const widgetType of widgetTypes) {
          if (widgetType.includes(pattern) || pattern.includes(widgetType)) {
            score += 5;
          }
        }
      }

      // 额外的启发式规则
      if (pageType === 'list' && widgetTypes.has('Scaffold') && widgetTypes.has('ListView')) {
        score += 15;
      }
      if (pageType === 'detail' && widgetTypes.has('SingleChildScrollView') && widgetTypes.has('Card')) {
        score += 15;
      }
      if (pageType === 'form' && widgetTypes.has('Form')) {
        score += 15;
      }
      if (pageType === 'tabs' && widgetTypes.has('TabBar') && widgetTypes.has('TabBarView')) {
        score += 15;
      }
      if (pageType === 'grid' && widgetTypes.has('GridView')) {
        score += 15;
      }
      if (pageType === 'search' && widgetTypes.has('TextField') && widgetTypes.has('ListView')) {
        score += 15;
      }
      if (pageType === 'profile' && widgetTypes.has('CircleAvatar')) {
        score += 15;
      }
      if (pageType === 'settings' && widgetTypes.has('SwitchListTile')) {
        score += 15;
      }
      if (pageType === 'empty' && widgetTypes.has('Center') && widgetTypes.size < 10) {
        score += 15;
      }
      if (pageType === 'splash' && widgetTypes.has('Image.asset')) {
        score += 15;
      }

      scores.set(pageType, score);
    }

    // 找到得分最高的页面类型
    let maxScore = 0;
    let detectedType = 'unknown';

    for (const [type, score] of scores) {
      if (score > maxScore) {
        maxScore = score;
        detectedType = type;
      }
    }

    // 计算置信度 (0-1)
    const maxPossibleScore = 50; // 假设最高可能分数
    const confidence = maxPossibleScore > 0 ? Math.min(maxScore / maxPossibleScore, 1) : 0;

    return {
      type: detectedType,
      confidence: Math.round(confidence * 100) / 100,
      scores: Object.fromEntries(scores),
    };
  }

  /**
   * 生成 Widget 类型统计
   * @param {Object} widgetTree - Widget 树
   * @returns {Object} Widget 类型统计信息
   */
  generateWidgetTypeStats(widgetTree) {
    if (!widgetTree || !widgetTree.tree) {
      return null;
    }

    const stats = {
      byCategory: {
        layout: 0,
        scaffold: 0,
        text: 0,
        image: 0,
        input: 0,
        button: 0,
        card: 0,
        navigation: 0,
        other: 0,
      },
      byType: new Map(),
      interactive: {
        buttons: 0,
        inputs: 0,
        selection: 0,
        gestures: 0,
      },
      containers: {
        total: 0,
        byType: new Map(),
      },
      display: {
        total: 0,
        byType: new Map(),
      },
    };

    const buttonTypes = ['ElevatedButton', 'TextButton', 'OutlinedButton', 'IconButton', 'FloatingActionButton', 'MaterialButton', 'RaisedButton', 'FlatButton'];
    const inputTypes = ['TextField', 'TextFormField', 'Form', 'Textarea', 'SearchBar', 'SearchDelegate'];
    const selectionTypes = ['Checkbox', 'Radio', 'Switch', 'Slider', 'DropdownButton', 'PopupMenuButton', 'ToggleButton'];
    const containerTypes = ['Container', 'Padding', 'Margin', 'Center', 'Align', 'SizedBox', 'Expanded', 'Flexible', 'Row', 'Column', 'Stack', 'GridView', 'ListView'];
    const displayTypes = ['Text', 'Image', 'Icon', 'Card', 'ListTile', 'CircleAvatar', 'Badge'];

    const traverse = (node) => {
      const type = node.type;
      const category = node.category || 'other';

      // 按分类统计
      if (stats.byCategory[category] !== undefined) {
        stats.byCategory[category]++;
      } else {
        stats.byCategory.other++;
      }

      // 按类型统计
      stats.byType.set(type, (stats.byType.get(type) || 0) + 1);

      // 交互元素统计
      if (buttonTypes.includes(type)) {
        stats.interactive.buttons++;
      }
      if (inputTypes.includes(type)) {
        stats.interactive.inputs++;
      }
      if (selectionTypes.includes(type)) {
        stats.interactive.selection++;
      }
      if (node.hasGesture || node.parameters?.onTap || node.parameters?.onPressed || node.parameters?.onLongPress) {
        stats.interactive.gestures++;
      }

      // 容器统计
      if (containerTypes.includes(type)) {
        stats.containers.total++;
        stats.containers.byType.set(type, (stats.containers.byType.get(type) || 0) + 1);
      }

      // 显示元素统计
      if (displayTypes.includes(type)) {
        stats.display.total++;
        stats.display.byType.set(type, (stats.display.byType.get(type) || 0) + 1);
      }

      for (const child of node.children) {
        traverse(child);
      }
    };

    traverse(widgetTree.tree);

    // 转换 Map 为普通对象
    return {
      byCategory: stats.byCategory,
      byType: Object.fromEntries(stats.byType),
      interactive: stats.interactive,
      containers: {
        total: stats.containers.total,
        byType: Object.fromEntries(stats.containers.byType),
      },
      display: {
        total: stats.display.total,
        byType: Object.fromEntries(stats.display.byType),
      },
      summary: this.generateWidgetStatsSummary(stats),
    };
  }

  /**
   * 生成 Widget 统计摘要
   */
  generateWidgetStatsSummary(stats) {
    const summary = [];

    // 交互元素摘要
    const totalInteractive = stats.interactive.buttons + stats.interactive.inputs + stats.interactive.selection;
    if (totalInteractive > 0) {
      summary.push({
        type: 'interactive',
        description: '交互元素',
        count: totalInteractive,
        breakdown: `按钮: ${stats.interactive.buttons}, 输入: ${stats.interactive.inputs}, 选择: ${stats.interactive.selection}`,
      });
    }

    // 容器摘要
    if (stats.containers.total > 0) {
      const topContainers = Object.entries(stats.containers.byType)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);
      summary.push({
        type: 'containers',
        description: '布局容器',
        count: stats.containers.total,
        top: topContainers.map(([type, count]) => `${type}: ${count}`).join(', '),
      });
    }

    // 显示元素摘要
    if (stats.display.total > 0) {
      const topDisplays = Object.entries(stats.display.byType)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);
      summary.push({
        type: 'display',
        description: '显示元素',
        count: stats.display.total,
        top: topDisplays.map(([type, count]) => `${type}: ${count}`).join(', '),
      });
    }

    return summary;
  }

  /**
   * 提取交互元素
   * @param {Object} widgetTree - Widget 树
   * @returns {Array} 交互元素列表
   */
  extractInteractiveElements(widgetTree) {
    if (!widgetTree || !widgetTree.tree) {
      return [];
    }

    const elements = [];
    const buttonTypes = ['ElevatedButton', 'TextButton', 'OutlinedButton', 'IconButton', 'FloatingActionButton', 'MaterialButton', 'RaisedButton', 'FlatButton', 'GestureDetector', 'InkWell'];
    const inputTypes = ['TextField', 'TextFormField', 'Form', 'SearchBar', 'TextArea'];
    const selectionTypes = ['Checkbox', 'Radio', 'Switch', 'Slider', 'DropdownButton', 'PopupMenuButton', 'ToggleButton', 'CheckboxListTile', 'SwitchListTile'];

    const traverse = (node, parentContext = '') => {
      const element = {
        type: node.type,
        category: node.category,
        line: node.line,
        depth: node.depth || 0,
        parentContext,
      };

      // 提取关键参数
      if (node.parameters) {
        if (node.parameters.text) {
          element.label = node.parameters.text;
        }
        if (node.parameters.iconName) {
          element.icon = node.parameters.iconName;
        }
        if (node.parameters.hint) {
          element.placeholder = node.parameters.hint;
        }
        if (node.parameters.value !== undefined) {
          element.value = node.parameters.value;
        }
      }

      // 检查是否有回调
      const hasCallback = node.parameters?.onTap || node.parameters?.onPressed || node.parameters?.onChanged || node.parameters?.onSubmitted;
      if (hasCallback) {
        element.interactive = true;
      }

      // 分类交互元素
      if (buttonTypes.includes(node.type)) {
        element.interactionType = 'button';
        element.purpose = this.inferButtonPurpose(node, parentContext);
        elements.push(element);
      } else if (inputTypes.includes(node.type)) {
        element.interactionType = 'input';
        element.purpose = this.inferInputPurpose(node, parentContext);
        elements.push(element);
      } else if (selectionTypes.includes(node.type)) {
        element.interactionType = 'selection';
        element.purpose = this.inferSelectionPurpose(node, parentContext);
        elements.push(element);
      } else if (node.parameters?.onTap || node.parameters?.onLongPress || node.type === 'GestureDetector' || node.type === 'InkWell') {
        element.interactionType = 'gesture';
        element.purpose = this.inferGesturePurpose(node, parentContext);
        elements.push(element);
      }

      // 递归处理子节点
      const currentContext = parentContext ? `${parentContext} > ${node.type}` : node.type;
      for (const child of node.children) {
        traverse(child, currentContext);
      }
    };

    traverse(widgetTree.tree);

    return elements;
  }

  /**
   * 推断按钮用途
   */
  inferButtonPurpose(node, context) {
    const label = (node.parameters?.text || '').toLowerCase();
    const icon = (node.parameters?.iconName || '').toLowerCase();
    const contextLower = context.toLowerCase();

    // 提交相关
    if (label.includes('submit') || label.includes('save') || label.includes('confirm') || label.includes('done')) {
      return 'submit';
    }
    if (label.includes('发送') || label.includes('保存') || label.includes('提交') || label.includes('确认')) {
      return 'submit';
    }

    // 取消相关
    if (label.includes('cancel') || label.includes('close') || label.includes('dismiss')) {
      return 'cancel';
    }
    if (label.includes('取消') || label.includes('关闭')) {
      return 'cancel';
    }

    // 删除相关
    if (label.includes('delete') || label.includes('remove') || icon.includes('delete') || icon.includes('trash')) {
      return 'delete';
    }
    if (label.includes('删除') || label.includes('移除')) {
      return 'delete';
    }

    // 编辑相关
    if (label.includes('edit') || label.includes('modify') || icon.includes('edit')) {
      return 'edit';
    }
    if (label.includes('编辑') || label.includes('修改')) {
      return 'edit';
    }

    // 添加相关
    if (label.includes('add') || label.includes('create') || label.includes('new') || icon.includes('add')) {
      return 'create';
    }
    if (label.includes('添加') || label.includes('创建') || label.includes('新建')) {
      return 'create';
    }

    // 导航相关
    if (icon.includes('arrow') || icon.includes('back') || icon.includes('forward')) {
      return 'navigation';
    }
    if (label.includes('back') || label.includes('返回')) {
      return 'navigation';
    }

    // 搜索相关
    if (label.includes('search') || label.includes('find') || icon.includes('search')) {
      return 'search';
    }
    if (label.includes('搜索') || label.includes('查找')) {
      return 'search';
    }

    // 刷新相关
    if (icon.includes('refresh') || icon.includes('reload')) {
      return 'refresh';
    }
    if (label.includes('refresh') || label.includes('刷新')) {
      return 'refresh';
    }

    return 'action';
  }

  /**
   * 推断输入框用途
   */
  inferInputPurpose(node, context) {
    const label = (node.parameters?.label || node.parameters?.text || '').toLowerCase();
    const hint = (node.parameters?.hint || node.parameters?.placeholder || '').toLowerCase();
    const combined = `${label} ${hint}`;

    // 用户名相关
    if (combined.includes('username') || combined.includes('user') || combined.includes('用户名') || combined.includes('账号')) {
      return 'username';
    }

    // 密码相关
    if (combined.includes('password') || combined.includes('pwd') || combined.includes('密码') || combined.includes('口令')) {
      return 'password';
    }

    // 邮箱相关
    if (combined.includes('email') || combined.includes('mail') || combined.includes('邮箱') || combined.includes('邮件')) {
      return 'email';
    }

    // 电话相关
    if (combined.includes('phone') || combined.includes('mobile') || combined.includes('tel') || combined.includes('电话') || combined.includes('手机')) {
      return 'phone';
    }

    // 搜索相关
    if (combined.includes('search') || combined.includes('find') || combined.includes('搜索') || combined.includes('查找')) {
      return 'search';
    }

    // 消息相关
    if (combined.includes('message') || combined.includes('comment') || combined.includes('消息') || combined.includes('评论') || combined.includes('留言')) {
      return 'message';
    }

    // 数量相关
    if (combined.includes('quantity') || combined.includes('count') || combined.includes('amount') || combined.includes('数量') || combined.includes('金额')) {
      return 'quantity';
    }

    return 'text';
  }

  /**
   * 推断选择控件用途
   */
  inferSelectionPurpose(node, context) {
    const label = (node.parameters?.label || node.parameters?.text || '').toLowerCase();

    if (node.type === 'Switch' || node.type === 'SwitchListTile') {
      if (label.includes('dark') || label.includes('theme') || label.includes('深色') || label.includes('主题')) {
        return 'theme-toggle';
      }
      if (label.includes('notify') || label.includes('push') || label.includes('通知') || label.includes('推送')) {
        return 'notification-toggle';
      }
      return 'toggle';
    }

    if (node.type === 'Checkbox' || node.type === 'CheckboxListTile') {
      if (label.includes('agree') || label.includes('term') || label.includes('同意') || label.includes('条款')) {
        return 'agreement';
      }
      if (label.includes('remember') || label.includes('记住')) {
        return 'remember';
      }
      return 'selection';
    }

    if (node.type === 'Slider') {
      return 'value-adjustment';
    }

    if (node.type === 'DropdownButton' || node.type === 'PopupMenuButton') {
      return 'option-selection';
    }

    return 'selection';
  }

  /**
   * 推断手势用途
   */
  inferGesturePurpose(node, context) {
    if (node.type === 'Card' || node.type === 'ListTile') {
      return 'navigate-detail';
    }

    if (node.type === 'InkWell' || node.type === 'GestureDetector') {
      if (context.includes('Card') || context.includes('ListTile')) {
        return 'navigate-detail';
      }
      if (context.includes('Icon') || context.includes('Image')) {
        return 'action-trigger';
      }
    }

    return 'generic-interaction';
  }

  /**
   * 生成 Widget 树的文本描述
   */
  describeWidgetTree(widgetTree, indent = 0) {
    if (!widgetTree) {
      return '';
    }

    const prefix = '  '.repeat(indent);
    let output = `${prefix}${widgetTree.type}`;

    // 添加关键参数
    if (widgetTree.parameters) {
      const params = [];
      if (widgetTree.parameters.text) params.push(`"${widgetTree.parameters.text}"`);
      if (widgetTree.parameters.iconName) params.push(`icon: ${widgetTree.parameters.iconName}`);
      if (widgetTree.parameters.color) params.push(`color: ${widgetTree.parameters.color}`);
      if (params.length > 0) {
        output += `(${params.join(', ')})`;
      }
    }

    output += '\n';

    for (const child of widgetTree.children) {
      output += this.describeWidgetTree(child, indent + 1);
    }

    return output;
  }

  /**
   * 生成 Mermaid 格式的 Widget 树图
   */
  toMermaid(widgetTree) {
    const lines = ['graph TD'];

    const traverse = (node, parentId = null, index = 0) => {
      const nodeId = `${parentId || 'root'}_${node.type}_${index}`;

      // 添加节点
      let label = node.type;
      if (node.parameters && node.parameters.text) {
        label += `<br/>"${node.parameters.text}"`;
      }
      lines.push(`  ${nodeId}[${label}]`);

      // 添加边
      if (parentId) {
        lines.push(`  ${parentId} --> ${nodeId}`);
      }

      // 处理子节点
      for (let i = 0; i < node.children.length; i++) {
        traverse(node.children[i], nodeId, i);
      }
    };

    if (widgetTree) {
      traverse(widgetTree);
    }

    return lines.join('\n');
  }

  /**
   * 分析项目级别的 UI 结构
   * @param {Array} files - Flutter 文件列表
   * @returns {Object} 项目 UI 结构分析
   */
  analyzeProjectUI(files) {
    const result = {
      screens: [],
      widgets: [],
      components: [],
      statistics: {
        totalScreens: 0,
        totalWidgets: 0,
        avgComplexity: 0,
      },
    };

    for (const file of files) {
      const content = file.content;
      const analysis = this.analyzeFile(file.path, content);

      // 分类文件
      const hasScaffold = analysis.widgets.some(w =>
        w.rootWidget && w.rootWidget.type === 'Scaffold'
      );

      if (hasScaffold) {
        result.screens.push({
          file: file.path,
          className: analysis.classes.find(c => c.isWidget)?.name,
          ...analysis,
        });
        result.statistics.totalScreens++;
      } else if (analysis.widgets.length > 0) {
        result.components.push({
          file: file.path,
          className: analysis.classes.find(c => c.isWidget)?.name,
          ...analysis,
        });
      }
    }

    // 计算统计
    result.statistics.totalWidgets = result.screens.length + result.components.length;

    const complexities = [...result.screens, ...result.components]
      .map(item => item.statistics?.complexityScore || 0);
    result.statistics.avgComplexity = complexities.length > 0
      ? Math.round(complexities.reduce((a, b) => a + b, 0) / complexities.length)
      : 0;

    return result;
  }

  /**
   * 获取指定位置的行号
   */
  getLineNumber(content, index) {
    const before = content.substring(0, index);
    return before.split('\n').length;
  }

  /**
   * 检测 Widget 树中的常见问题
   */
  detectIssues(widgetTree) {
    const issues = [];

    if (!widgetTree) {
      return issues;
    }

    const traverse = (node, path = []) => {
      const currentPath = [...path, node.type];

      // 检查过深的嵌套
      if (node.depth > 10) {
        issues.push({
          type: 'deep-nesting',
          severity: 'warning',
          message: `Widget 嵌套过深 (${node.depth} 层)，建议拆分`,
          path: currentPath,
        });
      }

      // 检查巨大的 Container
      if (node.type === 'Container' && node.depth > 5) {
        issues.push({
          type: 'large-container',
          severity: 'info',
          message: '深层嵌套的 Container 可能导致性能问题',
          path: currentPath,
        });
      }

      // 检查缺少 key 的 ListView
      if (node.type === 'ListView.builder') {
        const hasKey = node.parameters?.key || node.parameters?.itemBuilder?.includes('key:');
        if (!hasKey) {
          issues.push({
            type: 'missing-key',
            severity: 'warning',
            message: 'ListView.builder 缺少 key 参数，可能导致列表渲染问题',
            path: currentPath,
          });
        }
      }

      // 检查 Expanded 的使用
      if (node.type === 'Expanded' && node.depth > 3) {
        issues.push({
          type: 'deep-expanded',
          severity: 'info',
          message: '深层嵌套的 Expanded 可能导致布局问题',
          path: currentPath,
        });
      }

      for (const child of node.children) {
        traverse(child, currentPath);
      }
    };

    traverse(widgetTree);

    return issues;
  }

  /**
   * 生成 Widget 结构的 AI 友好摘要
   */
  generateAISummary(widgetTree) {
    if (!widgetTree) {
      return '';
    }

    const summary = [];

    // 识别页面类型
    const rootType = widgetTree.type;
    if (rootType === 'Scaffold') {
      summary.push('这是一个完整的 Flutter 页面，使用 Scaffold 作为根组件。');
    }

    // 识别布局结构
    const layoutWidgets = widgetTree.children.filter(c =>
      ['Row', 'Column', 'Stack', 'ListView', 'GridView'].includes(c.type)
    );

    if (layoutWidgets.length > 0) {
      const layoutTypes = layoutWidgets.map(w => w.type).join(', ');
      summary.push(`页面主要使用 ${layoutTypes} 进行布局。`);
    }

    // 识别内容
    const contentWidgets = widgetTree.children.filter(c =>
      ['Text', 'Image', 'Icon', 'Card', 'ListTile'].includes(c.type)
    );

    if (contentWidgets.length > 0) {
      const contentCounts = {};
      for (const w of contentWidgets) {
        contentCounts[w.type] = (contentCounts[w.type] || 0) + 1;
      }
      summary.push(`页面包含: ${Object.entries(contentCounts).map(([k, v]) => `${k}(${v})`).join(', ')}`);
    }

    // 识别交互元素
    const interactiveWidgets = widgetTree.children.filter(c =>
      ['ElevatedButton', 'TextButton', 'IconButton', 'TextField', 'Checkbox'].includes(c.type)
    );

    if (interactiveWidgets.length > 0) {
      summary.push(`页面包含 ${interactiveWidgets.length} 个交互元素。`);
    }

    return summary.join('\n');
  }

  /**
   * 清除缓存
   */
  clearCache() {
    this.widgetTree.clear();
    this.layoutPatterns.clear();
  }
}

module.exports = FlutterUIAnalyzer;
