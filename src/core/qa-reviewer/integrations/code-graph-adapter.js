/**
 * 代码图适配器
 *
 * 复用现有的 CODE_GRAPH.json，为 QA Reviewer 提供：
 * - 功能-代码映射
 * - 模块分组
 * - 依赖层级分析
 */

const CodeGraphExtractor = require('../../testing/code-graph-extractor');

class CodeGraphAdapter {
  constructor(options = {}) {
    console.log('[CodeGraphAdapter] 初始化...');
    this.extractor = new CodeGraphExtractor({
      codeGraphPath: options.codeGraphPath,
      testContextPath: options.testContextPath,
      aiContextPath: options.aiContextPath,
    });

    this.codeGraph = null;
    this.testContext = null;
    this.projectPath = null;
    console.log('[CodeGraphAdapter] 初始化完成');
  }

  /**
   * 加载项目数据
   */
  async load(projectPath) {
    this.projectPath = projectPath;
    const result = this.extractor.loadData(projectPath);

    if (!result.hasCodeGraph) {
      throw new Error(
        'CODE_GRAPH.json 不存在，请先运行代码扫描。\n' +
        '提示：点击 "Scan Code" 按钮进行首次扫描。'
      );
    }

    this.codeGraph = this.extractor.codeGraph;
    this.testContext = this.extractor.testContext;

    return {
      hasCodeGraph: result.hasCodeGraph,
      hasTestContext: result.hasTestContext,
      nodeCount: this.codeGraph?.metadata?.totalNodes || 0,
      featureCount: this.testContext?.features?.length || 0,
    };
  }

  /**
   * 根据需求描述查找相关代码
   * @param {string} requirement - 需求描述
   * @returns {Object} 相关的代码文件和类
   */
  findRelatedCode(requirement) {
    if (!this.codeGraph) {
      return { files: [], classes: [], nodes: [] };
    }

    // 1. 提取关键词
    const keywords = this.extractKeywords(requirement);
    console.log(`[CodeGraphAdapter] 提取的关键词:`, keywords);

    if (keywords.length === 0) {
      // 如果没有提取到关键词，返回所有文件
      const allFiles = new Set();
      this.codeGraph.nodes.forEach(node => {
        const filePath = node.filePath || node.file;
        if (filePath && node.type === 'file') {
          allFiles.add(filePath);
        }
      });
      console.log(`[CodeGraphAdapter] 无关键词，返回所有文件: ${allFiles.size} 个`);
      return {
        files: Array.from(allFiles),
        classes: [],
        nodes: []
      };
    }

    // 2. 在代码图中搜索匹配的节点
    const matchedNodes = this.codeGraph.nodes.filter(node => {
      // 兼容不同的文件路径字段
      const filePath = node.filePath || node.file || '';
      const fileName = node.fileName || node.name || '';
      const nodeType = node.type || '';

      // 构建搜索文本，处理 undefined
      const searchText = [
        node.name || '',
        node.label || '',
        filePath,
        node.description || '',
      ].filter(Boolean).join(' ').toLowerCase();

      return keywords.some(kw => searchText.includes(kw));
    });

    console.log(`[CodeGraphAdapter] 匹配到 ${matchedNodes.length} 个节点`);

    // 3. 提取相关文件和类
    const files = new Set();
    const classes = [];
    const apis = [];

    matchedNodes.forEach(node => {
      const filePath = node.filePath || node.file;
      if (filePath) files.add(filePath);

      if (node.name) {
        classes.push({
          name: node.name,
          file: filePath,
          type: node.type,
          line: node.line,
          description: node.description,
        });
      }

      // 收集 API 调用
      if (node.apiMethods) {
        apis.push(...node.apiMethods);
      }

      // 添加依赖的文件
      if (node.dependencies) {
        node.dependencies.forEach(dep => {
          const depPath = dep.filePath || dep.file;
          if (depPath) files.add(depPath);
        });
      }
    });

    console.log(`[CodeGraphAdapter] 提取到 ${files.size} 个文件`);

    // 兜底逻辑：如果匹配到的文件太少（小于5个），返回所有文件
    // 这通常发生在中文需求无法匹配英文路径时
    if (files.size < 5) {
      console.log(`[CodeGraphAdapter] 匹配文件太少，返回所有文件`);
      const allFiles = new Set();
      this.codeGraph.nodes.forEach(node => {
        const filePath = node.filePath || node.file;
        if (filePath && node.type === 'file') {
          allFiles.add(filePath);
        }
      });
      return {
        files: Array.from(allFiles),
        classes: [],
        nodes: []
      };
    }

    return {
      requirement,
      keywords,
      files: Array.from(files),
      classes,
      apis,
      nodeCount: matchedNodes.length,
    };
  }

  /**
   * 按模块分组文件（用于分段审查）
   * @returns {Object} 模块 -> 文件列表
   */
  groupFilesByModule() {
    if (!this.codeGraph) {
      return {};
    }

    const modules = {};

    this.codeGraph.nodes.forEach(node => {
      if (!node.file) return;

      // 推断模块名称（基于目录结构）
      const parts = node.file.split(/[/\\]/);
      const module = parts[parts.length - 2] || 'root';

      if (!modules[module]) {
        modules[module] = {
          name: module,
          files: new Set(),
          classes: [],
        };
      }

      modules[module].files.add(node.file);
      modules[module].classes.push({
        name: node.name,
        type: node.type,
      });
    });

    // 转换 Set 为 Array
    Object.keys(modules).forEach(key => {
      modules[key].files = Array.from(modules[key].files);
    });

    return modules;
  }

  /**
   * 按功能点分组（基于 TEST_CONTEXT）
   * @returns {Array} 功能点列表
   */
  getFeatures() {
    if (!this.testContext || !this.testContext.features) {
      return [];
    }

    return this.testContext.features.map(feature => ({
      name: feature.name,
      description: feature.description,
      pages: feature.pages || [],
      controllers: feature.controllers || [],
    }));
  }

  /**
   * 获取功能点对应的代码范围
   * @param {string} featureName - 功能点名称
   * @returns {Object} 代码范围
   */
  getCodeScopeForFeature(featureName) {
    if (!this.testContext) {
      return null;
    }

    // 查找匹配的功能点
    const feature = this.testContext.features.find(f =>
      f.name?.includes(featureName) ||
      featureName.includes(f.name)
    );

    if (!feature) {
      // 尝试从代码图中查找
      return this.findRelatedCode(featureName);
    }

    // 提取功能点相关的文件
    const files = new Set();
    const classes = [];

    // 从页面信息提取
    if (feature.pages) {
      feature.pages.forEach(page => {
        if (page.file) files.add(page.file);
        if (page.widgets) {
          classes.push(...page.widgets.map(w => ({
            name: w.name,
            file: page.file,
            type: 'widget',
          })));
        }
      });
    }

    // 从控制器信息提取
    if (feature.controllers) {
      feature.controllers.forEach(ctrl => {
        if (ctrl.file) files.add(ctrl.file);
        classes.push({
          name: ctrl.name,
          file: ctrl.file,
          type: 'controller',
        });
      });
    }

    return {
      feature: feature.name,
      description: feature.description,
      files: Array.from(files),
      classes,
    };
  }

  /**
   * 获取依赖层级（用于分段策略）
   * @returns {Object} 层级 -> 节点列表
   */
  getDependencyLevels() {
    if (!this.codeGraph) {
      return { core: [], service: [], controller: [], view: [] };
    }

    const levels = {
      core: [],      // 核心类（models, entities）
      service: [],   // 服务层
      controller: [],// 控制器
      view: [],      // 视图层
    };

    this.codeGraph.nodes.forEach(node => {
      if (!node.file) return;

      if (node.file?.includes('model') || node.file?.includes('entity')) {
        levels.core.push(node);
      } else if (node.file?.includes('service') || node.file?.includes('repository')) {
        levels.service.push(node);
      } else if (node.file?.includes('controller') || node.file?.includes('viewmodel')) {
        levels.controller.push(node);
      } else if (node.file?.includes('page') || node.file?.includes('widget')) {
        levels.view.push(node);
      }
    });

    return levels;
  }

  /**
   * 获取类的依赖关系
   * @param {string} className - 类名
   * @returns {Array} 依赖的类列表
   */
  getClassDependencies(className) {
    if (!this.codeGraph) return [];

    const node = this.codeGraph.nodes.find(n => n.name === className);
    if (!node) return [];

    return node.dependencies || [];
  }

  /**
   * 获取 API 调用列表
   * @param {string} featureName - 功能点名称（可选）
   * @returns {Array} API 调用列表
   */
  getAPICalls(featureName = null) {
    if (!this.codeGraph) return [];

    let nodes = this.codeGraph.nodes;

    // 如果指定了功能点，只获取相关的 API
    if (featureName) {
      const related = this.findRelatedCode(featureName);
      const relatedFiles = new Set(related.files);
      nodes = nodes.filter(n => n.file && relatedFiles.has(n.file));
    }

    const apis = [];
    nodes.forEach(node => {
      if (node.apiMethods) {
        apis.push(...node.apiMethods.map(api => ({
          ...api,
          sourceFile: node.file,
          sourceClass: node.name,
        })));
      }
    });

    return apis;
  }

  /**
   * 提取关键词
   */
  extractKeywords(text) {
    if (!text) return [];

    // 提取中文词汇和英文单词
    const chinese = text.match(/[\u4e00-\u9fa5]+/g) || [];
    const english = text.toLowerCase().match(/[a-z]{2,}/g) || [];

    return [...chinese, ...english];
  }

  /**
   * 获取代码图统计信息
   */
  getStatistics() {
    if (!this.codeGraph) {
      return null;
    }

    const stats = {
      totalNodes: this.codeGraph.nodes?.length || 0,
      totalEdges: this.codeGraph.edges?.length || 0,
      types: {},
      files: new Set(),
    };

    this.codeGraph.nodes?.forEach(node => {
      // 统计类型
      stats.types[node.type] = (stats.types[node.type] || 0) + 1;

      // 统计文件
      if (node.file) {
        stats.files.add(node.file);
      }
    });

    stats.totalFiles = stats.files.size;
    delete stats.files;

    return stats;
  }
}

module.exports = CodeGraphAdapter;
