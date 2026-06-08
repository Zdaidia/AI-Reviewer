/**
 * File Dependency Analyzer
 *
 * 职责:
 * - 分析文件之间的导入/依赖关系
 * - 构建文件依赖图
 * - 检测循环依赖
 * - 分析模块化程度
 * - 生成依赖层次结构
 *
 * 支持的语言:
 * - JavaScript/TypeScript
 * - Dart
 * - Vue SFC
 */

const fs = require('fs');
const path = require('path');

class FileDependencyAnalyzer {
  constructor() {
    this.fileNodes = new Map(); // 文件节点
    this.importGraph = new Map(); // 文件导入关系: file -> 被导入文件
    this.exportGraph = new Map(); // 文件导出关系: file -> 导出内容
    this.reverseImportGraph = new Map(); // 反向导入: file -> 导入它的文件
  }

  /**
   * 构建文件依赖图
   * @param {Array} files - 文件列表
   * @param {Object} options - 选项
   * @returns {Object} 文件依赖图
   */
  buildDependencyGraph(files, options = {}) {
    const {
      projectRoot = '',
      includeNodeModules = false,
      maxDepth = 50,
    } = options;

    this.clearCache();

    // 1. 创建文件节点
    for (const file of files) {
      this.createFileNode(file, projectRoot);
    }

    // 2. 构建导入关系
    for (const file of files) {
      this.analyzeFileImports(file, projectRoot);
    }

    // 3. 分析导出
    for (const file of files) {
      this.analyzeFileExports(file, projectRoot);
    }

    // 4. 计算依赖深度
    this.calculateDependencyDepth();

    // 5. 识别文件角色
    this.identifyFileRoles();

    // 6. 检测循环依赖
    const circularDeps = this.detectCircularDependencies();

    // 7. 分析模块化程度
    const modularization = this.analyzeModularization(projectRoot);

    // 8. 生成依赖层次结构
    const layers = this.buildDependencyLayers();

    return {
      files: Array.from(this.fileNodes.values()),
      imports: this.getImportEdges(),
      exports: this.getExportEdges(),
      circularDeps,
      modularization,
      layers,
      statistics: this.generateStatistics(),
    };
  }

  /**
   * 创建文件节点
   */
  createFileNode(file, projectRoot) {
    const relativePath = path.relative(projectRoot, file.path);
    const ext = path.extname(file.path);
    const dir = path.dirname(relativePath);

    const node = {
      id: this.generateFileId(file.path),
      path: file.path,
      relativePath,
      name: path.basename(file.path),
      extension: ext,
      directory: dir === '.' ? 'root' : dir,

      // 文件类型
      fileType: this.classifyFileType(file.path, ext),

      // 语言
      language: file.language || this.detectLanguage(ext),

      // 依赖信息
      imports: [], // 导入的文件
      exportedSymbols: [], // 导出的符号
      importCount: 0,
      exportCount: 0,

      // 依赖深度
      depth: 0,
      layer: 0,

      // 文件大小
      size: this.getFileSize(file.path),
      lineCount: file.lineCount || 0,

      // 角色
      role: null,
      isEntry: false,
      isLeaf: false,

      // 元数据
      metadata: {},
    };

    this.fileNodes.set(node.id, node);
    return node;
  }

  /**
   * 分类文件类型
   */
  classifyFileType(filePath, ext) {
    const filename = path.basename(filePath).toLowerCase();
    const dirname = path.dirname(filePath).toLowerCase();

    // 组件文件
    if (this.isComponentFile(filePath, ext)) {
      return 'component';
    }

    // 页面文件
    if (dirname.includes('page') || dirname.includes('screen') || dirname.includes('view')) {
      return 'page';
    }

    // 服务/API 文件
    if (dirname.includes('service') || dirname.includes('api') ||
        filename.includes('service') || filename.includes('api')) {
      return 'service';
    }

    // 工具文件
    if (dirname.includes('util') || dirname.includes('helper') ||
        filename.includes('util') || filename.includes('helper')) {
      return 'utility';
    }

    // 常量/配置文件
    if (dirname.includes('constant') || dirname.includes('config') ||
        filename.includes('constant') || filename.includes('config')) {
      return 'config';
    }

    // 类型定义文件
    if (ext === '.d.ts' || dirname.includes('types') || dirname.includes('interfaces')) {
      return 'type';
    }

    // 样式文件
    if (['.css', '.scss', '.sass', '.less', '.styl'].includes(ext)) {
      return 'style';
    }

    // 测试文件
    if (filename.includes('.test.') || filename.includes('.spec.') ||
        filename.includes('__tests__')) {
      return 'test';
    }

    // 数据模型文件
    if (dirname.includes('model') || dirname.includes('entity') ||
        filename.includes('model') || filename.includes('entity')) {
      return 'model';
    }

    // Store/状态管理文件
    if (dirname.includes('store') || dirname.includes('state') ||
        filename.includes('store')) {
      return 'store';
    }

    // Hook 文件
    if (filename.startsWith('use') && (ext === '.js' || ext === '.ts')) {
      return 'hook';
    }

    return 'module';
  }

  /**
   * 检查是否是组件文件
   */
  isComponentFile(filePath, ext) {
    const filename = path.basename(filePath);

    // Vue/React 组件特征
    if (ext === '.vue') return true;
    if (ext === '.jsx' || ext === '.tsx') {
      return /^[A-Z]/.test(filename); // 大写开头通常是组件
    }

    // 组件目录特征
    const dirname = path.dirname(filePath).toLowerCase();
    if (dirname.includes('component')) return true;

    return false;
  }

  /**
   * 检测文件语言
   */
  detectLanguage(ext) {
    const langMap = {
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.vue': 'vue',
      '.dart': 'dart',
      '.css': 'css',
      '.scss': 'scss',
      '.sass': 'sass',
      '.less': 'less',
      '.json': 'json',
      '.yaml': 'yaml',
      '.yml': 'yaml',
    };

    return langMap[ext] || 'unknown';
  }

  /**
   * 分析文件导入
   */
  analyzeFileImports(file, projectRoot) {
    if (!file.imports || file.imports.length === 0) {
      return;
    }

    const sourceNode = this.getFileNode(file.path);
    if (!sourceNode) return;

    for (const imp of file.imports) {
      const importPath = imp.source || imp;

      // 解析导入路径
      const resolvedPath = this.resolveImportPath(file.path, importPath, projectRoot);

      if (resolvedPath) {
        const targetNode = this.getFileNode(resolvedPath);

        if (targetNode) {
          // 添加到导入图
          if (!this.importGraph.has(sourceNode.id)) {
            this.importGraph.set(sourceNode.id, new Set());
          }
          this.importGraph.get(sourceNode.id).add(targetNode.id);

          // 添加到反向导入图
          if (!this.reverseImportGraph.has(targetNode.id)) {
            this.reverseImportGraph.set(targetNode.id, new Set());
          }
          this.reverseImportGraph.get(targetNode.id).add(sourceNode.id);

          // 更新节点信息
          sourceNode.imports.push({
            source: importPath,
            resolvedPath: targetNode.path,
            fileId: targetNode.id,
            isExternal: false,
            specifiers: imp.specifiers || [],
          });

          sourceNode.importCount++;
        }
      } else {
        // 外部依赖
        sourceNode.imports.push({
          source: importPath,
          resolvedPath: null,
          fileId: null,
          isExternal: true,
          specifiers: imp.specifiers || [],
        });
      }
    }
  }

  /**
   * 分析文件导出
   */
  analyzeFileExports(file, projectRoot) {
    if (!file.exports || file.exports.length === 0) {
      return;
    }

    const sourceNode = this.getFileNode(file.path);
    if (!sourceNode) return;

    for (const exp of file.exports) {
      sourceNode.exportedSymbols.push({
        name: exp.name,
        type: exp.type,
        line: exp.line,
      });
      sourceNode.exportCount++;

      // 添加到导出图
      if (!this.exportGraph.has(sourceNode.id)) {
        this.exportGraph.set(sourceNode.id, new Map());
      }
      this.exportGraph.get(sourceNode.id).set(exp.name, exp);
    }
  }

  /**
   * 解析导入路径
   */
  resolveImportPath(sourceFile, importPath, projectRoot) {
    // 外部依赖
    if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
      return null;
    }

    // 相对路径导入
    if (importPath.startsWith('.')) {
      const sourceDir = path.dirname(sourceFile);
      let resolved = path.resolve(sourceDir, importPath);

      // 移除扩展名
      resolved = resolved.replace(/\.(js|ts|jsx|tsx|vue)$/, '');

      // 尝试添加扩展名
      const extensions = ['.js', '.ts', '.jsx', '.tsx', '.vue', '/index.js', '/index.ts'];
      for (const ext of extensions) {
        const withExt = resolved + ext;
        if (this.fileExists(withExt)) {
          return withExt;
        }
      }

      // 检查是否是目录
      if (this.fileExists(resolved) && fs.statSync(resolved).isDirectory()) {
        const indexFiles = [
          resolved + '/index.js',
          resolved + '/index.ts',
          resolved + '/index.jsx',
          resolved + '/index.tsx',
        ];
        for (const indexFile of indexFiles) {
          if (this.fileExists(indexFile)) {
            return indexFile;
          }
        }
      }

      return resolved;
    }

    // 绝对路径导入
    if (importPath.startsWith('/')) {
      const resolved = path.join(projectRoot, importPath.substring(1));
      return this.fileExists(resolved) ? resolved : null;
    }

    return null;
  }

  /**
   * 检查文件是否存在
   */
  fileExists(filePath) {
    try {
      return fs.existsSync(filePath);
    } catch {
      return false;
    }
  }

  /**
   * 获取文件节点
   */
  getFileNode(filePath) {
    const id = this.generateFileId(filePath);
    return this.fileNodes.get(id);
  }

  /**
   * 生成文件 ID
   */
  generateFileId(filePath) {
    return filePath.replace(/\\/g, '/').toLowerCase();
  }

  /**
   * 获取文件大小
   */
  getFileSize(filePath) {
    try {
      return fs.statSync(filePath).size;
    } catch {
      return 0;
    }
  }

  /**
   * 计算依赖深度
   */
  calculateDependencyDepth() {
    const visited = new Set();

    const dfs = (fileId, depth) => {
      if (visited.has(fileId)) return;
      visited.add(fileId);

      const node = this.fileNodes.get(fileId);
      if (node) {
        node.depth = Math.max(node.depth, depth);

        // 递归计算被导入文件的深度
        const importers = this.reverseImportGraph.get(fileId) || new Set();
        for (const importerId of importers) {
          dfs(importerId, depth + 1);
        }
      }
    };

    // 找出所有没有导入的文件（叶子节点）开始计算
    for (const [fileId, node] of this.fileNodes) {
      if (!this.importGraph.has(fileId) || this.importGraph.get(fileId).size === 0) {
        dfs(fileId, 0);
      }
    }

    // 重新计算：从入口节点（被导入次数为0）开始
    visited.clear();

    const calculateFromEntry = (fileId, depth) => {
      if (visited.has(fileId)) return;
      visited.add(fileId);

      const node = this.fileNodes.get(fileId);
      if (node) {
        node.depth = Math.max(node.depth, depth);

        // 计算它导入的文件的深度
        const imports = this.importGraph.get(fileId) || new Set();
        for (const importId of imports) {
          calculateFromEntry(importId, depth + 1);
        }
      }
    };

    // 找出所有没有被导入的文件（入口文件）
    for (const [fileId, node] of this.fileNodes) {
      if (!this.reverseImportGraph.has(fileId) || this.reverseImportGraph.get(fileId).size === 0) {
        calculateFromEntry(fileId, 0);
      }
    }

    // 处理剩余未访问的节点
    for (const [fileId] of this.fileNodes) {
      if (!visited.has(fileId)) {
        calculateFromEntry(fileId, 0);
      }
    }
  }

  /**
   * 识别文件角色
   */
  identifyFileRoles() {
    for (const [fileId, node] of this.fileNodes) {
      const importers = this.reverseImportGraph.get(fileId) || new Set();
      const imports = this.importGraph.get(fileId) || new Set();

      // 入口文件：没有被导入的文件
      node.isEntry = importers.size === 0;

      // 叶子文件：没有导入其他文件的文件
      node.isLeaf = imports.size === 0;

      // 确定角色
      if (node.isEntry) {
        node.role = 'entry';
      } else if (node.isLeaf) {
        node.role = 'leaf';
      } else if (node.fileType === 'utility' || node.fileType === 'config') {
        node.role = 'shared';
      } else if (node.fileType === 'component' || node.fileType === 'page') {
        node.role = 'ui';
      } else if (node.fileType === 'service') {
        node.role = 'service';
      } else {
        node.role = 'intermediate';
      }

      // 计算扇入和扇出
      node.fanIn = importers.size; // 被多少文件导入
      node.fanOut = imports.size; // 导入多少文件

      // 计算不稳定性指标 I = FanOut / (FanIn + FanOut)
      node.instability = node.fanIn + node.fanOut > 0
        ? node.fanOut / (node.fanIn + node.fanOut)
        : 0;
    }
  }

  /**
   * 检测循环依赖
   */
  detectCircularDependencies() {
    const cycles = [];
    const visited = new Set();
    const recursionStack = new Set();
    const path = [];

    const dfs = (fileId) => {
      visited.add(fileId);
      recursionStack.add(fileId);
      path.push(fileId);

      const imports = this.importGraph.get(fileId) || new Set();
      for (const importId of imports) {
        if (!visited.has(importId)) {
          dfs(importId);
        } else if (recursionStack.has(importId)) {
          // 发现循环
          const cycleStart = path.indexOf(importId);
          const cycle = path.slice(cycleStart);
          const cycleKey = cycle.map(id => this.fileNodes.get(id)?.relativePath || id).join(' -> ');

          if (!cycles.some(c => c.key === cycleKey)) {
            cycles.push({
              files: [...cycle, importId].map(id => ({
                id,
                path: this.fileNodes.get(id)?.path,
                relativePath: this.fileNodes.get(id)?.relativePath,
              })),
              key: cycleKey,
              length: cycle.length + 1,
            });
          }
        }
      }

      recursionStack.delete(fileId);
      path.pop();
    };

    for (const fileId of this.fileNodes.keys()) {
      if (!visited.has(fileId)) {
        dfs(fileId);
      }
    }

    return cycles;
  }

  /**
   * 分析模块化程度
   */
  analyzeModularization(projectRoot) {
    // 按目录分组
    const modules = new Map();

    for (const [fileId, node] of this.fileNodes) {
      const modulePath = node.directory;

      if (!modules.has(modulePath)) {
        modules.set(modulePath, {
          path: modulePath,
          files: [],
          internalImports: 0,
          externalImports: 0,
          exports: 0,
          totalImports: 0,
        });
      }

      const module = modules.get(modulePath);
      module.files.push(fileId);
      module.totalImports += node.importCount;
      module.exports += node.exportCount;

      // 统计内部和外部导入
      const imports = this.importGraph.get(fileId) || new Set();
      for (const importId of imports) {
        const importNode = this.fileNodes.get(importId);
        if (importNode && importNode.directory === modulePath) {
          module.internalImports++;
        } else {
          module.externalImports++;
        }
      }
    }

    // 计算模块指标
    const moduleMetrics = [];

    for (const [modulePath, module] of modules) {
      // 内聚度：模块内文件之间的相互导入比例
      const maxPossibleInternalImports = module.files.length * (module.files.length - 1);
      const cohesion = maxPossibleInternalImports > 0
        ? module.internalImports / maxPossibleInternalImports
        : 0;

      // 耦合度：模块与外部之间的导入比例
      const coupling = module.totalImports > 0
        ? module.externalImports / module.totalImports
        : 0;

      moduleMetrics.push({
        path: modulePath,
        fileCount: module.files.length,
        cohesion: cohesion,
        coupling: coupling,
        exports: module.exports,
        imports: module.totalImports,
        balance: this.calculateModuleBalance(cohesion, coupling),
      });
    }

    return {
      modules: moduleMetrics,
      overallCohesion: this.calculateOverallCohesion(moduleMetrics),
      overallCoupling: this.calculateOverallCoupling(moduleMetrics),
      modularityScore: this.calculateModularityScore(moduleMetrics),
    };
  }

  /**
   * 计算模块平衡度
   */
  calculateModuleBalance(cohesion, coupling) {
    // 理想情况：高内聚，低耦合
    const idealCohesion = 1;
    const idealCoupling = 0;

    const cohesionDistance = Math.abs(cohesion - idealCohesion);
    const couplingDistance = Math.abs(coupling - idealCoupling);

    const maxDistance = 2;
    return Math.max(0, 1 - (cohesionDistance + couplingDistance) / maxDistance);
  }

  /**
   * 计算整体内聚度
   */
  calculateOverallCohesion(moduleMetrics) {
    if (moduleMetrics.length === 0) return 0;
    const totalCohesion = moduleMetrics.reduce((sum, m) => sum + m.cohesion, 0);
    return totalCohesion / moduleMetrics.length;
  }

  /**
   * 计算整体耦合度
   */
  calculateOverallCoupling(moduleMetrics) {
    if (moduleMetrics.length === 0) return 0;
    const totalCoupling = moduleMetrics.reduce((sum, m) => sum + m.coupling, 0);
    return totalCoupling / moduleMetrics.length;
  }

  /**
   * 计算模块化评分
   */
  calculateModularityScore(moduleMetrics) {
    if (moduleMetrics.length === 0) return 0;

    const avgBalance = moduleMetrics.reduce((sum, m) => sum + m.balance, 0) / moduleMetrics.length;
    const overallCohesion = this.calculateOverallCohesion(moduleMetrics);
    const overallCoupling = this.calculateOverallCoupling(moduleMetrics);

    // 高内聚 + 低耦合 + 高平衡度 = 高模块化
    return (overallCohesion + (1 - overallCoupling) + avgBalance) / 3;
  }

  /**
   * 构建依赖层次结构
   */
  buildDependencyLayers() {
    const layers = [];
    const assigned = new Set();

    // 按深度分组
    const depthGroups = new Map();
    for (const [fileId, node] of this.fileNodes) {
      const depth = node.depth || 0;
      if (!depthGroups.has(depth)) {
        depthGroups.set(depth, []);
      }
      depthGroups.get(depth).push(node);
    }

    // 转换为层数组
    const sortedDepths = Array.from(depthGroups.keys()).sort((a, b) => a - b);

    for (const depth of sortedDepths) {
      const nodes = depthGroups.get(depth);
      const layer = {
        level: depth,
        files: nodes.map(n => ({
          id: n.id,
          path: n.path,
          relativePath: n.relativePath,
          fileType: n.fileType,
        })),
        count: nodes.length,
      };

      layers.push(layer);
    }

    return {
      layers,
      maxDepth: sortedDepths.length > 0 ? sortedDepths[sortedDepths.length - 1] : 0,
      layerCount: layers.length,
    };
  }

  /**
   * 获取导入边
   */
  getImportEdges() {
    const edges = [];

    for (const [sourceId, targets] of this.importGraph) {
      for (const targetId of targets) {
        edges.push({
          source: sourceId,
          target: targetId,
          type: 'imports',
        });
      }
    }

    return edges;
  }

  /**
   * 获取导出边
   */
  getExportEdges() {
    const edges = [];

    for (const [sourceId, targets] of this.exportGraph) {
      for (const [exportName, exportInfo] of targets) {
        edges.push({
          source: sourceId,
          target: null,
          type: 'exports',
          exportName,
          exportInfo,
        });
      }
    }

    return edges;
  }

  /**
   * 生成统计信息
   */
  generateStatistics() {
    let totalImports = 0;
    let totalExports = 0;
    let totalSize = 0;
    let totalLines = 0;

    const fileTypeCounts = new Map();
    const languageCounts = new Map();
    const roleCounts = new Map();

    for (const node of this.fileNodes.values()) {
      totalImports += node.importCount;
      totalExports += node.exportCount;
      totalSize += node.size || 0;
      totalLines += node.lineCount || 0;

      fileTypeCounts.set(node.fileType, (fileTypeCounts.get(node.fileType) || 0) + 1);
      languageCounts.set(node.language, (languageCounts.get(node.language) || 0) + 1);
      roleCounts.set(node.role, (roleCounts.get(node.role) || 0) + 1);
    }

    return {
      totalFiles: this.fileNodes.size,
      totalImports,
      totalExports,
      totalSize,
      totalLines,
      averageImports: this.fileNodes.size > 0 ? totalImports / this.fileNodes.size : 0,
      averageExports: this.fileNodes.size > 0 ? totalExports / this.fileNodes.size : 0,
      fileTypes: Object.fromEntries(fileTypeCounts),
      languages: Object.fromEntries(languageCounts),
      roles: Object.fromEntries(roleCounts),
    };
  }

  /**
   * 生成依赖树
   */
  buildDependencyTree(rootFileId = null, maxDepth = 10) {
    const trees = [];

    const buildTree = (fileId, depth, visited) => {
      if (depth > maxDepth || visited.has(fileId)) {
        return null;
      }

      visited.add(fileId);
      const node = this.fileNodes.get(fileId);
      if (!node) return null;

      const treeNode = {
        id: fileId,
        path: node.path,
        relativePath: node.relativePath,
        name: node.name,
        fileType: node.fileType,
        depth,
        children: [],
      };

      const imports = this.importGraph.get(fileId) || new Set();
      for (const importId of imports) {
        const childTree = buildTree(importId, depth + 1, new Set(visited));
        if (childTree) {
          treeNode.children.push(childTree);
        }
      }

      return treeNode;
    };

    if (rootFileId) {
      const tree = buildTree(rootFileId, 0, new Set());
      if (tree) trees.push(tree);
    } else {
      // 为所有入口文件构建树
      for (const [fileId, node] of this.fileNodes) {
        if (node.isEntry) {
          const tree = buildTree(fileId, 0, new Set());
          if (tree) trees.push(tree);
        }
      }
    }

    return trees;
  }

  /**
   * 生成可视化的 DOT 格式
   */
  toDot(options = {}) {
    const {
      clusterByDirectory = true,
      showExternalDeps = false,
      colorByFileType = true,
    } = options;

    const lines = ['digraph FileDependencyGraph {'];
    lines.push('  rankdir=LR;'); // 从左到右
    lines.push('  node [shape=box];');

    // 如果按目录聚类
    if (clusterByDirectory) {
      const directories = new Map();
      for (const [fileId, node] of this.fileNodes) {
        const dir = node.directory;
        if (!directories.has(dir)) {
          directories.set(dir, []);
        }
        directories.get(dir).push(node);
      }

      // 创建子图
      for (const [dir, nodes] of directories) {
        const safeDir = dir.replace(/[^a-zA-Z0-9]/g, '_');
        lines.push(`  subgraph cluster_${safeDir} {`);
        lines.push(`    label = "${dir}";`);
        lines.push(`    style = filled;`);
        lines.push(`    color = lightgray;`);

        for (const node of nodes) {
          const color = colorByFileType ? this.getFileTypeColor(node.fileType) : '';
          const label = node.name;
          lines.push(`    "${fileId}" [label="${label}"${color}];`);
        }

        lines.push('  }');
      }
    } else {
      // 直接添加节点
      for (const [fileId, node] of this.fileNodes) {
        const color = colorByFileType ? this.getFileTypeColor(node.fileType) : '';
        const label = `${node.name}\\n(${node.fileType})`;
        lines.push(`  "${fileId}" [label="${label}"${color}];`);
      }
    }

    // 添加边
    for (const [sourceId, targets] of this.importGraph) {
      for (const targetId of targets) {
        const sourceNode = this.fileNodes.get(sourceId);
        const targetNode = this.fileNodes.get(targetId);

        // 跨目录的边用虚线
        const style = (sourceNode && targetNode && sourceNode.directory !== targetNode.directory)
          ? 'dashed'
          : 'solid';

        lines.push(`  "${sourceId}" -> "${targetId}" [style=${style}];`);
      }
    }

    lines.push('}');
    return lines.join('\n');
  }

  /**
   * 获取文件类型颜色
   */
  getFileTypeColor(fileType) {
    const colors = {
      component: ', color=blue, style="filled", fillcolor=lightblue',
      page: ', color=green, style="filled", fillcolor=lightgreen',
      service: ', color=orange, style="filled", fillcolor=lightorange',
      utility: ', color=gray, style="filled", fillcolor=lightgray',
      config: ', color=purple, style="filled", fillcolor=lavender',
      store: ', color=red, style="filled", fillcolor=pink',
      hook: ', color=cyan, style="filled", fillcolor=lightcyan',
      model: ', color=yellow, style="filled", fillcolor=lightyellow',
    };

    return colors[fileType] || '';
  }

  /**
   * 清除缓存
   */
  clearCache() {
    this.fileNodes.clear();
    this.importGraph.clear();
    this.exportGraph.clear();
    this.reverseImportGraph.clear();
  }
}

module.exports = FileDependencyAnalyzer;
