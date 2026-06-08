/**
 * Flutter Component Dependency Analyzer
 *
 * 职责:
 * - 分析 Widget 组件之间的使用关系
 * - 构建组件依赖图
 * - 检测组件复用情况
 * - 识别组件依赖模式
 *
 * 支持的组件类型:
 * - StatelessWidget
 * - StatefulWidget
 * - 自定义 Widget
 */

const path = require('path');

class FlutterComponentAnalyzer {
  constructor() {
    this.components = new Map(); // 组件注册表
    this.componentUsage = new Map(); // 组件使用关系
    this.componentDependencies = new Map(); // 组件依赖
  }

  /**
   * 分析项目中的组件依赖关系
   * @param {Array} files - Dart 文件列表
   * @param {Object} uiAnalysis - UI 分析结果
   * @returns {Object} 组件依赖分析结果
   */
  analyzeComponentDependencies(files, uiAnalysis) {
    this.clearCache();

    // 1. 注册所有组件
    this.registerComponents(files, uiAnalysis);

    // 2. 分析组件使用关系
    this.analyzeComponentUsage(files, uiAnalysis);

    // 3. 构建组件依赖图
    const dependencyGraph = this.buildComponentDependencyGraph();

    // 4. 分析组件复用情况
    const reuseAnalysis = this.analyzeComponentReuse();

    // 5. 识别组件依赖模式
    const patterns = this.identifyDependencyPatterns();

    // 6. 生成组件层次结构
    const hierarchy = this.buildComponentHierarchy();

    return {
      components: Array.from(this.components.values()),
      usage: this.getComponentUsageList(),
      dependencies: dependencyGraph,
      reuse: reuseAnalysis,
      patterns,
      hierarchy,
      statistics: this.generateStatistics(),
    };
  }

  /**
   * 注册所有组件
   */
  registerComponents(files, uiAnalysis) {
    let componentId = 0;

    for (const file of files) {
      const content = file.content;
      const filePath = file.path;

      // 从 UI 分析结果中获取类信息
      if (uiAnalysis.classes) {
        for (const cls of uiAnalysis.classes) {
          if (cls.isWidget) {
            // 获取这个类的 build 方法
            const buildMethods = uiAnalysis.buildMethods
              ? uiAnalysis.buildMethods.filter(bm => bm.className === cls.name)
              : [];

            const component = {
              id: `comp_${componentId++}`,
              name: cls.name,
              superClass: cls.superClass,
              widgetType: cls.widgetType || cls.superClass,
              filePath,
              fileName: this.getFileName(filePath),
              line: cls.line,
              isStatefulWidget: cls.superClass === 'StatefulWidget',
              hasBuildMethod: buildMethods.length > 0,
              buildMethods: buildMethods,
              // 组件分类
              category: this.classifyComponent(cls),
              // 是否是页面
              isPage: this.isPageComponent(cls, content, buildMethods),
              // 是否是可复用组件
              isReusable: this.isReusableComponent(cls, content),
              // 组件复杂度
              complexity: buildMethods.length > 0 ? buildMethods.length * 2 : 0,
            };

            this.components.set(component.name, component);
          }
        }
      }
    }
  }

  /**
   * 分类组件
   */
  classifyComponent(cls) {
    const name = cls.name.toLowerCase();

    // 页面组件
    if (name.endsWith('page') || name.endsWith('screen')) {
      return 'page';
    }

    // 对话框
    if (name.endsWith('dialog') || name.endsWith('alert')) {
      return 'dialog';
    }

    // 底部表单
    if (name.endsWith('sheet')) {
      return 'bottom-sheet';
    }

    // 卡片
    if (name.endsWith('card') || name.endsWith('tile')) {
      return 'card';
    }

    // 按钮
    if (name.endsWith('button') || name.endsWith('btn')) {
      return 'button';
    }

    // 表单
    if (name.endsWith('form') || name.endsWith('field')) {
      return 'form';
    }

    // 列表项
    if (name.endsWith('item') || name.endsWith('row')) {
      return 'list-item';
    }

    // 头部/导航
    if (name.includes('header') || name.includes('nav') || name.includes('appbar')) {
      return 'header';
    }

    // 容器/包装器
    if (name.includes('container') || name.includes('wrapper')) {
      return 'container';
    }

    // 默认为通用组件
    return 'general';
  }

  /**
   * 判断是否是页面组件
   */
  isPageComponent(cls, content, buildMethods = null) {
    // 检查类名
    const name = cls.name.toLowerCase();
    if (name.endsWith('page') || name.endsWith('screen')) {
      return true;
    }

    // 检查 build 方法中是否包含 Scaffold
    const methods = buildMethods || cls.buildMethods;
    if (methods && methods.length > 0) {
      for (const bm of methods) {
        if (bm.content && bm.content.includes('Scaffold(')) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * 判断是否是可复用组件
   */
  isReusableComponent(cls, content) {
    // 页面组件通常不是可复用的
    if (this.isPageComponent(cls, content)) {
      return false;
    }

    // 通用组件通常是可复用的
    const name = cls.name.toLowerCase();
    const reusablePatterns = [
      'card', 'item', 'row', 'tile', 'widget', 'component',
      'dialog', 'sheet', 'button', 'field', 'input'
    ];

    return reusablePatterns.some(pattern => name.includes(pattern));
  }

  /**
   * 分析组件使用关系
   */
  analyzeComponentUsage(files, uiAnalysis) {
    for (const file of files) {
      const content = file.content;

      // 检查每个组件的使用情况
      for (const [compName, component] of this.components) {
        if (component.filePath === file.path) continue; // 跳过自己

        // 检查是否导入或使用这个组件
        const usage = this.checkComponentUsage(content, compName);

        if (usage.used) {
          if (!this.componentUsage.has(compName)) {
            this.componentUsage.set(compName, []);
          }

          this.componentUsage.get(compName).push({
            file: file.path,
            fileName: this.getFileName(file.path),
            type: usage.type,
            line: usage.line,
            count: usage.count,
          });
        }
      }
    }
  }

  /**
   * 检查组件使用情况
   */
  checkComponentUsage(content, componentName) {
    const usage = {
      used: false,
      type: null,
      line: null,
      count: 0,
    };

    // 检查直接实例化
    const instantPattern = new RegExp(`\\b${componentName}\\s*\\(`, 'g');
    let match;
    while ((match = instantPattern.exec(content)) !== null) {
      usage.used = true;
      usage.type = 'instantiation';
      usage.count++;
      if (!usage.line) {
        usage.line = this.getLineNumber(content, match.index);
      }
    }

    // 检查类型引用
    const typePattern = new RegExp(`:\\s*${componentName}\\b`, 'g');
    while ((match = typePattern.exec(content)) !== null) {
      // 排除定义本身
      const beforeMatch = content.substring(0, match.index);
      if (!beforeMatch.endsWith('class ') && !beforeMatch.endsWith('extends ')) {
        usage.used = true;
        if (!usage.type) {
          usage.type = 'reference';
        }
        usage.count++;
      }
    }

    return usage;
  }

  /**
   * 构建组件依赖图
   */
  buildComponentDependencyGraph() {
    const graph = {
      nodes: [],
      edges: [],
    };

    // 添加节点
    for (const [name, component] of this.components) {
      graph.nodes.push({
        id: component.id,
        name: component.name,
        category: component.category,
        isPage: component.isPage,
        isReusable: component.isReusable,
        complexity: component.complexity,
      });
    }

    // 添加边（基于组件使用关系）
    for (const [usedCompName, usages] of this.componentUsage) {
      for (const usage of usages) {
        // 查找使用这个组件的文件中定义的组件
        const userComponents = this.findComponentsInFile(usage.file);

        for (const userComp of userComponents) {
          if (userComp !== usedCompName) {
            graph.edges.push({
              from: userComp,
              to: usedCompName,
              type: 'uses',
              file: usage.file,
              line: usage.line,
            });
          }
        }
      }
    }

    return graph;
  }

  /**
   * 查找文件中定义的组件
   */
  findComponentsInFile(filePath) {
    const components = [];
    for (const [name, component] of this.components) {
      if (component.filePath === filePath) {
        components.push(name);
      }
    }
    return components;
  }

  /**
   * 分析组件复用情况
   */
  analyzeComponentReuse() {
    const reuse = {
      mostUsed: [],
      unused: [],
      reuseRate: 0,
      totalComponents: this.components.size,
      usedComponents: 0,
    };

    // 计算每个组件的使用情况
    const usageCounts = [];
    for (const [name, component] of this.components) {
      const usages = this.componentUsage.get(name) || [];
      const totalCount = usages.reduce((sum, u) => sum + u.count, 0);

      usageCounts.push({
        name,
        isReusable: component.isReusable,
        usageCount: totalCount,
        file: component.filePath,
      });
    }

    // 排序
    usageCounts.sort((a, b) => b.usageCount - a.usageCount);

    // 最常使用的组件
    reuse.mostUsed = usageCounts.filter(u => u.usageCount > 0).slice(0, 10);

    // 未使用的可复用组件
    reuse.unused = usageCounts.filter(u => u.isReusable && u.usageCount === 0);

    // 计算复用率
    const reusableComponents = usageCounts.filter(u => u.isReusable);
    reuse.usedComponents = reusableComponents.filter(u => u.usageCount > 0).length;
    reuse.reuseRate = reusableComponents.length > 0
      ? reuse.usedComponents / reusableComponents.length
      : 0;

    return reuse;
  }

  /**
   * 识别依赖模式
   */
  identifyDependencyPatterns() {
    const patterns = [];

    // 分析组件继承关系
    const inheritance = this.analyzeInheritance();
    if (inheritance.hierarchy.length > 0) {
      patterns.push({
        type: 'inheritance',
        name: '继承层次',
        description: '组件继承关系',
        ...inheritance,
      });
    }

    // 分析组合关系
    const composition = this.analyzeComposition();
    if (composition.relationships.length > 0) {
      patterns.push({
        type: 'composition',
        name: '组合关系',
        description: '组件组合使用关系',
        ...composition,
      });
    }

    return patterns;
  }

  /**
   * 分析继承关系
   */
  analyzeInheritance() {
    const hierarchy = [];
    const levels = new Map();

    for (const [name, component] of this.components) {
      if (component.superClass) {
        const parent = this.findComponentByType(component.superClass);
        if (parent) {
          hierarchy.push({
            parent: parent.name,
            child: name,
            type: 'extends',
          });
        }
      }
    }

    return { hierarchy, levels };
  }

  /**
   * 分析组合关系
   */
  analyzeComposition() {
    const relationships = [];

    for (const [name, component] of this.components) {
      if (component.buildMethods) {
        for (const buildMethod of component.buildMethods) {
          // 检查 build 方法中使用的其他组件
          const usedComponents = this.extractUsedComponentsFromBuild(
            buildMethod.content,
            component.filePath
          );

          for (const usedComp of usedComponents) {
            relationships.push({
              container: name,
              contained: usedComp,
              type: 'contains',
            });
          }
        }
      }
    }

    return { relationships };
  }

  /**
   * 从 build 方法中提取使用的组件
   */
  extractUsedComponentsFromBuild(buildContent, currentFilePath) {
    const used = [];
    const componentNames = Array.from(this.components.keys());

    for (const compName of componentNames) {
      // 跳过自己
      const component = this.components.get(compName);
      if (component.filePath === currentFilePath) continue;

      // 检查是否在 build 方法中使用
      if (buildContent.includes(compName)) {
        // 验证确实是组件调用
        const patterns = [
          new RegExp(`\\b${compName}\\s*\\(`),  // 构造函数调用
          new RegExp(`:\\s*${compName}\\b`),  // 类型引用
        ];

        for (const pattern of patterns) {
          if (pattern.test(buildContent)) {
            used.push(compName);
            break;
          }
        }
      }
    }

    return used;
  }

  /**
   * 根据类型查找组件
   */
  findComponentByType(type) {
    for (const [name, component] of this.components) {
      if (component.widgetType === type) {
        return component;
      }
    }
    return null;
  }

  /**
   * 构建组件层次结构
   */
  buildComponentHierarchy() {
    const hierarchy = {
      pages: [],
      components: [],
      tree: [],
    };

    // 分离页面和组件
    for (const [name, component] of this.components.entries()) {
      if (component.isPage) {
        hierarchy.pages.push(component);
      } else {
        hierarchy.components.push(component);
      }
    }

    // 构建组件树
    const roots = [];

    for (const [name, component] of this.components.entries()) {
      // 没有被其他组件使用的组件作为根
      const usedBy = this.getUsedByComponents(name);
      if (usedBy.length === 0 && !component.isPage) {
        roots.push(this.buildTreeNode(name));
      }
    }

    hierarchy.tree = roots;

    return hierarchy;
  }

  /**
   * 获取使用指定组件的组件列表
   */
  getUsedByComponents(componentName) {
    const usedBy = [];

    for (const [name, component] of this.components.entries()) {
      if (component.buildMethods) {
        for (const buildMethod of component.buildMethods) {
          if (buildMethod.content.includes(componentName)) {
            usedBy.push(name);
          }
        }
      }
    }

    return usedBy;
  }

  /**
   * 构建组件树节点
   */
  buildTreeNode(componentName) {
    const component = this.components.get(componentName);
    if (!component) return null;

    const node = {
      name: componentName,
      component,
      children: [],
    };

    // 查找这个组件直接使用的其他组件
    const usedComponents = this.extractUsedComponentsFromBuild(
      component.buildMethods?.[0]?.content || '',
      component.filePath
    );

    for (const usedComp of usedComponents) {
      const childNode = this.buildTreeNode(usedComp);
      if (childNode && !this.hasCycle(node, usedComp)) {
        node.children.push(childNode);
      }
    }

    return node;
  }

  /**
   * 检查循环依赖
   */
  hasCycle(node, targetName, visited = new Set()) {
    if (node.name === targetName) {
      return true;
    }

    if (visited.has(node.name)) {
      return false;
    }

    visited.add(node.name);

    for (const child of node.children) {
      if (this.hasCycle(child, targetName, new Set(visited))) {
        return true;
      }
    }

    return false;
  }

  /**
   * 生成统计信息
   */
  generateStatistics() {
    const stats = {
      totalComponents: this.components.size,
      pageComponents: 0,
      reusableComponents: 0,
      statefulWidgets: 0,
      statelessWidgets: 0,
      categoryDistribution: {},
      avgComplexity: 0,
    };

    let totalComplexity = 0;

    for (const component of this.components.values()) {
      if (component.isPage) stats.pageComponents++;
      if (component.isReusable) stats.reusableComponents++;
      if (component.isStatefulWidget) stats.statefulWidgets++;
      if (component.widgetType === 'StatelessWidget') stats.statelessWidgets++;

      stats.categoryDistribution[component.category] =
        (stats.categoryDistribution[component.category] || 0) + 1;

      totalComplexity += component.complexity;
    }

    stats.avgComplexity = this.components.size > 0
      ? totalComplexity / this.components.size
      : 0;

    return stats;
  }

  /**
   * 获取组件使用列表
   */
  getComponentUsageList() {
    const usageList = [];

    for (const [name, usages] of this.componentUsage) {
      usageList.push({
        component: name,
        usedBy: usages,
        totalUsage: usages.reduce((sum, u) => sum + u.count, 0),
      });
    }

    return usageList.sort((a, b) => b.totalUsage - a.totalUsage);
  }

  /**
   * 生成组件依赖图的 DOT 格式
   */
  toDot(options = {}) {
    const {
      showUnused = false,
      clusterByCategory = true,
      colorByType = true,
    } = options;

    const lines = ['digraph ComponentDependencyGraph {'];
    lines.push('  rankdir=TB;');
    lines.push('  node [shape=box];');

    if (clusterByCategory) {
      // 按类别聚类
      const categoryGroups = new Map();
      for (const [name, component] of this.components.values()) {
        const cat = component.category || 'other';
        if (!categoryGroups.has(cat)) {
          categoryGroups.set(cat, []);
        }
        categoryGroups.get(cat).push(component);
      }

      for (const [category, components] of categoryGroups) {
        const safeCat = category.replace(/[^a-zA-Z0-9]/g, '_');
        lines.push(`  subgraph cluster_${safeCat} {`);
        lines.push(`    label = "${category}";`);
        lines.push(`    style = filled;`);
        lines.push(`    color = lightgray;`);

        for (const comp of components) {
          const color = colorByType ? this.getComponentColor(comp) : '';
          lines.push(`    "${comp.id}" [label="${comp.name}"${color}];`);
        }

        lines.push('  }');
      }
    } else {
      // 直接添加节点
      for (const [name, component] of this.components.values()) {
        const color = colorByType ? this.getComponentColor(component) : '';
        lines.push(`  "${component.id}" [label="${name}"${color}];`);
      }
    }

    // 添加边
    for (const usage of this.componentUsage.values()) {
      for (const u of usage) {
        const userComps = this.findComponentsInFile(u.file);
        for (const userComp of userComps) {
          const userCompNode = this.components.get(userComp);
          const usedCompNode = this.components.get(u.component);

          if (userCompNode && usedCompNode) {
            const style = u.type === 'instantiation' ? 'solid' : 'dashed';
            lines.push(`  "${userCompNode.id}" -> "${usedCompNode.id}" [style=${style}];`);
          }
        }
      }
    }

    lines.push('}');
    return lines.join('\n');
  }

  /**
   * 获取组件颜色
   */
  getComponentColor(component) {
    if (component.isPage) {
      return ', color=blue, style="filled", fillcolor=lightblue';
    } else if (component.isReusable) {
      return ', color=green, style="filled", fillcolor=lightgreen';
    } else if (component.category === 'button') {
      return ', color=orange, style="filled", fillcolor=lightorange';
    } else if (component.category === 'form') {
      return ', color=purple, style="filled", fillcolor=lavender';
    }
    return '';
  }

  /**
   * 获取文件名
   */
  getFileName(filePath) {
    return path.basename(filePath);
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
    this.components.clear();
    this.componentUsage.clear();
    this.componentDependencies.clear();
  }

  /**
   * 生成 Mermaid 格式的组件依赖图
   * @param {Object} options - 选项
   * @returns {string} Mermaid 图表
   */
  toMermaid(options = {}) {
    const {
      showUnused = false,
      clusterByCategory = true,
      showUsageCount = true,
    } = options;

    const lines = ['graph TD'];

    // 添加节点
    for (const [name, component] of this.components) {
      if (!showUnused && !component.isReusable && component.isPage) {
        // 总是显示页面
      } else if (!showUnused) {
        const usages = this.componentUsage.get(name) || [];
        if (usages.length === 0) continue; // 跳过未使用的组件
      }

      let label = name;
      if (showUsageCount) {
        const usages = this.componentUsage.get(name) || [];
        const totalCount = usages.reduce((sum, u) => sum + u.count, 0);
        label += ` (${totalCount})`;
      }

      // 添加样式
      let style = '';
      if (component.isPage) {
        style = ':::page';
      } else if (component.isReusable) {
        style = ':::reusable';
      }

      lines.push(`  "${component.id}"[${label}]${style}`);
    }

    // 添加边（依赖关系）
    for (const [usedCompName, usages] of this.componentUsage) {
      for (const usage of usages) {
        const userComponents = this.findComponentsInFile(usage.file);
        for (const userComp of userComponents) {
          if (userComp !== usedCompName) {
            const userCompNode = this.components.get(userComp);
            const usedCompNode = this.components.get(usedCompName);

            if (userCompNode && usedCompNode) {
              const lineStyle = usage.type === 'instantiation' ? '' : '.- ';
              lines.push(`  "${userCompNode.id}" ${lineStyle}--> "${usedCompNode.id}"`);
            }
          }
        }
      }
    }

    // 添加样式定义
    lines.push('');
    lines.push('classDef page fill:#lightblue,stroke:#blue,stroke-width:2px');
    lines.push('classDef reusable fill:#lightgreen,stroke:#green,stroke-width:1px');
    lines.push('classDef default fill:#lightgrey,stroke:#333,stroke-width:1px');

    return lines.join('\n');
  }

  /**
   * 生成详细的组件图
   * @param {string} format - 格式 ('mermaid', 'dot', 'json')
   * @returns {Object|string} 组件图
   */
  generateComponentGraph(format = 'json') {
    const graph = this.buildComponentDependencyGraph();

    switch (format) {
      case 'mermaid':
        return this.toMermaid();
      case 'dot':
        return this.toDot();
      case 'json':
      default:
        return {
          nodes: graph.nodes.map(node => ({
            id: node.id,
            name: node.name,
            category: node.category,
            isPage: node.isPage,
            isReusable: node.isReusable,
            complexity: node.complexity,
            usage: this.getComponentUsageCount(node.name),
          })),
          edges: graph.edges.map(edge => ({
            from: edge.from,
            to: edge.to,
            type: edge.type,
          })),
          summary: this.getComponentGraphSummary(),
        };
    }
  }

  /**
   * 获取组件使用次数
   */
  getComponentUsageCount(componentName) {
    const usages = this.componentUsage.get(componentName) || [];
    return usages.reduce((sum, u) => sum + u.count, 0);
  }

  /**
   * 获取组件图摘要
   */
  getComponentGraphSummary() {
    const summary = {
      totalComponents: this.components.size,
      totalEdges: 0,
      pages: 0,
      reusableComponents: 0,
      mostUsedComponents: [],
      unusedComponents: [],
      complexityByCategory: {},
    };

    // 计算边数
    for (const usages of this.componentUsage.values()) {
      summary.totalEdges += usages.length;
    }

    // 统计页面和可复用组件
    for (const component of this.components.values()) {
      if (component.isPage) summary.pages++;
      if (component.isReusable) summary.reusableComponents++;

      // 按分类统计复杂度
      const cat = component.category || 'other';
      if (!summary.complexityByCategory[cat]) {
        summary.complexityByCategory[cat] = { count: 0, totalComplexity: 0 };
      }
      summary.complexityByCategory[cat].count++;
      summary.complexityByCategory[cat].totalComplexity += component.complexity;
    }

    // 最常用组件
    const usageList = [];
    for (const [name, component] of this.components) {
      usageList.push({
        name,
        usage: this.getComponentUsageCount(name),
        isReusable: component.isReusable,
        category: component.category,
      });
    }
    usageList.sort((a, b) => b.usage - a.usage);
    summary.mostUsedComponents = usageList.slice(0, 10);

    // 未使用的组件
    summary.unusedComponents = usageList.filter(u => u.isReusable && u.usage === 0);

    return summary;
  }

  /**
   * 获取组件详细信息
   * @param {string} componentName - 组件名称
   * @returns {Object} 组件详细信息
   */
  getComponentDetails(componentName) {
    const component = this.components.get(componentName);
    if (!component) {
      return null;
    }

    const usages = this.componentUsage.get(componentName) || [];
    const usedBy = this.getUsedByComponents(componentName);
    const usedInBuild = this.getUsedInBuildMethods(componentName);

    return {
      ...component,
      usage: {
        totalUsage: usages.reduce((sum, u) => sum + u.count, 0),
        usedBy: usages.map(u => ({
          file: u.file,
          fileName: u.fileName,
          type: u.type,
          count: u.count,
        })),
        usedInComponents: usedBy,
        usedInBuildMethods: usedInBuild,
      },
      reuseScore: this.calculateReuseScore(componentName),
    };
  }

  /**
   * 获取组件在 build 方法中的使用情况
   */
  getUsedInBuildMethods(componentName) {
    const usedIn = [];

    for (const [name, component] of this.components) {
      if (component.buildMethods) {
        for (const buildMethod of component.buildMethods) {
          if (buildMethod.content.includes(componentName)) {
            usedIn.push({
              component: name,
              buildMethod: buildMethod.className + '.build()',
              line: buildMethod.line,
            });
          }
        }
      }
    }

    return usedIn;
  }

  /**
   * 计算组件复用评分
   */
  calculateReuseScore(componentName) {
    const component = this.components.get(componentName);
    if (!component || !component.isReusable) {
      return 0;
    }

    const usageCount = this.getComponentUsageCount(componentName);
    const usedBy = this.getUsedByComponents(componentName);

    // 评分标准
    // - 基础分: 使用次数 * 10
    // - 被多少个组件使用: 每个加 5 分
    // - 是否在多个文件中使用: 每个额外文件加 10 分
    let score = usageCount * 10;
    score += usedBy.length * 5;

    const filesUsed = new Set();
    for (const usage of this.componentUsage.get(componentName) || []) {
      filesUsed.add(usage.file);
    }
    score += (filesUsed.size - 1) * 10;

    return Math.max(0, score);
  }

  /**
   * 生成组件复用报告
   * @returns {Object} 复用报告
   */
  generateReuseReport() {
    const report = {
      summary: {
        totalComponents: this.components.size,
        reusableComponents: 0,
        usedComponents: 0,
        unusedComponents: 0,
        averageReuseScore: 0,
      },
      byCategory: {},
      topReused: [],
      unused: [],
      lowReuse: [],
    };

    const scores = [];

    for (const [name, component] of this.components) {
      if (component.isReusable) {
        report.summary.reusableComponents++;

        const usageCount = this.getComponentUsageCount(name);
        const reuseScore = this.calculateReuseScore(name);

        scores.push(reuseScore);

        const item = {
          name,
          category: component.category,
          usageCount,
          reuseScore,
          file: component.filePath,
        };

        if (usageCount === 0) {
          report.unused.push(item);
        } else if (reuseScore < 20) {
          report.lowReuse.push(item);
        } else {
          report.topReused.push(item);
        }

        // 按分类统计
        const cat = component.category || 'other';
        if (!report.byCategory[cat]) {
          report.byCategory[cat] = {
            total: 0,
            used: 0,
            unused: 0,
          };
        }
        report.byCategory[cat].total++;
        if (usageCount > 0) {
          report.byCategory[cat].used++;
        } else {
          report.byCategory[cat].unused++;
        }
      }
    }

    report.summary.usedComponents = report.summary.reusableComponents - report.unused.length;
    report.summary.unusedComponents = report.unused.length;
    report.summary.averageReuseScore = scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 0;

    // 排序
    report.topReused.sort((a, b) => b.reuseScore - a.reuseScore);
    report.topReused = report.topReused.slice(0, 10);

    return report;
  }
}

module.exports = FlutterComponentAnalyzer;
