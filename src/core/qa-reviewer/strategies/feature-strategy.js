/**
 * 按功能分段策略
 *
 * 基于代码图和测试上下文，将项目按功能模块分段
 */

const { SegmentStrategy, Segment, SegmentPlan, SegmentPriority } = require('./segment-strategy');

class FeatureSegmentStrategy {
  constructor(options = {}) {
    this.codeGraphAdapter = options.codeGraphAdapter;
    this.contextAdapter = options.contextAdapter;

    // 配置
    this.maxFilesPerSegment = options.maxFilesPerSegment || 10;
    this.maxLinesPerSegment = options.maxLinesPerSegment || 3000;
  }

  /**
   * 创建分段计划
   * @param {Object} params - 参数
   * @returns {SegmentPlan} 分段计划
   */
  async createPlan(params) {
    const {
      projectPath,
      requirements = null,
      codeMapping = null,
    } = params;

    console.log('[FeatureStrategy] 创建按功能分段的计划...');

    const segments = [];

    // 1. 从需求中提取功能点
    const features = this.extractFeatures(requirements, codeMapping);

    // 2. 如果没有需求，从代码图中提取功能模块
    if (features.length === 0) {
      features.push(...this.extractModulesFromCodeGraph());
    }

    // 3. 为每个功能点创建分段
    for (const feature of features) {
      const segment = await this.createSegmentForFeature(feature);

      // 检查是否超过限制
      if (segment.files.length > this.maxFilesPerSegment) {
        // 需要进一步拆分
        const subSegments = await this.splitSegment(segment);
        segments.push(...subSegments);
      } else {
        segments.push(segment);
      }
    }

    // 4. 确定依赖关系
    this.resolveDependencies(segments);

    // 5. 设置优先级
    this.assignPriorities(segments);

    const plan = new SegmentPlan({
      name: 'Feature-based Review Plan',
      projectPath,
      strategy: SegmentStrategy.BY_FEATURE,
      segments,
      totalFiles: segments.reduce((sum, s) => sum + s.files.length, 0),
    });

    console.log(`[FeatureStrategy] 计划创建完成: ${segments.length} 个分段`);

    return plan;
  }

  /**
   * 从需求中提取功能点
   */
  extractFeatures(requirements, codeMapping) {
    const features = [];

    if (codeMapping && codeMapping.features) {
      // 从代码映射中获取
      features.push(...codeMapping.features.map(f => ({
        name: f.name,
        description: f.description,
        files: f.files || [],
        classes: f.classes || [],
      })));
    } else if (requirements) {
      // 从需求文本中提取
      if (typeof requirements === 'string') {
        features.push(...this.parseRequirementsText(requirements));
      } else if (Array.isArray(requirements)) {
        features.push(...requirements);
      }
    }

    return features;
  }

  /**
   * 从代码图中提取功能模块
   */
  extractModulesFromCodeGraph() {
    const modules = [];

    if (!this.codeGraphAdapter.codeGraph) {
      return modules;
    }

    // 按目录分组
    const moduleGroups = this.codeGraphAdapter.groupFilesByModule();

    Object.entries(moduleGroups).forEach(([moduleName, module]) => {
      modules.push({
        name: this.formatModuleName(moduleName),
        description: `模块 ${moduleName}`,
        files: module.files,
        classes: module.classes,
      });
    });

    return modules;
  }

  /**
   * 格式化模块名称
   */
  formatModuleName(name) {
    // 移除常见前缀
    return name
      .replace(/^lib\//, '')
      .replace(/^pages?\//, '')
      .replace(/^widgets?\//, '')
      .replace(/[_-]/g, ' ');
  }

  /**
   * 为功能点创建分段
   */
  async createSegmentForFeature(feature) {
    // 获取功能相关的代码（如果未提供）
    let files = feature.files || [];
    let classes = feature.classes || [];

    if (files.length === 0 && this.codeGraphAdapter) {
      const related = this.codeGraphAdapter.findRelatedCode(
        feature.name + ' ' + feature.description
      );
      files = related.files;
      classes = related.classes;
    }

    return new Segment({
      name: feature.name,
      description: feature.description,
      files,
      features: [feature.name],
      // 估算行数
      lines: { start: 0, end: this.estimateLines(files) },
    });
  }

  /**
   * 估算文件行数
   */
  estimateLines(files) {
    const fs = require('fs');
    let totalLines = 0;

    for (const file of files.slice(0, 5)) { // 只检查前5个文件
      try {
        const content = fs.readFileSync(file, 'utf8');
        totalLines += content.split('\n').length;
      } catch (e) {
        // 忽略读取失败的文件
      }
    }

    // 对于未检查的文件，按平均值估算
    const avgLines = totalLines / Math.min(files.length, 5);
    totalLines = avgLines * files.length;

    return Math.round(totalLines);
  }

  /**
   * 拆分过大的分段
   */
  async splitSegment(segment) {
    const subSegments = [];
    const filesPerSegment = Math.ceil(segment.files.length / Math.ceil(segment.files.length / this.maxFilesPerSegment));

    for (let i = 0; i < segment.files.length; i += filesPerSegment) {
      const subFiles = segment.files.slice(i, i + filesPerSegment);

      subSegments.push(new Segment({
        name: `${segment.name} (${Math.floor(i / filesPerSegment) + 1})`,
        description: segment.description,
        files: subFiles,
        features: segment.features,
        lines: { start: 0, end: this.estimateLines(subFiles) },
        dependsOn: i > 0 ? [subSegments[subSegments.length - 1].id] : [],
      }));
    }

    return subSegments;
  }

  /**
   * 解析需求文本
   */
  parseRequirementsText(text) {
    const features = [];
    const lines = text.split('\n');

    let currentFeature = null;

    for (const line of lines) {
      const trimmed = line.trim();

      // 检测功能点（以数字开头或特定关键词）
      // 支持中文和英文的多种格式
      const isFeatureStart =
        /^\d+[\.\、]/.test(trimmed) ||
        /^[\(（]?\d+[\)）]?[\.\、]?\s*/.test(trimmed) ||
        /^(需求名称|功能|Feature|模块|Module)\s*[:：]/i.test(trimmed) ||
        /(頁面|页面|畫面|画面|Page|Screen)/i.test(trimmed) ||
        /(列表|详情|编辑|新增|删除|登录|注册|主页|首页|设置)/i.test(trimmed) ||
        /^(用户|订单|商品|管理|查询)\s*[:：]/i.test(trimmed);

      if (isFeatureStart) {
        if (currentFeature) {
          features.push(currentFeature);
        }

        currentFeature = {
          name: this.extractFeatureName(trimmed),
          description: trimmed,
          files: [],
          classes: [],
        };
      } else if (currentFeature && trimmed.length > 0) {
        currentFeature.description += ' ' + trimmed;
      }
    }

    if (currentFeature) {
      features.push(currentFeature);
    }

    // 如果没有识别到任何功能点，尝试从整体需求中创建一个默认功能
    if (features.length === 0 && text.trim().length > 0) {
      features.push({
        name: '整体需求',
        description: text.trim().substring(0, 200),
        files: [],
        classes: [],
      });
    }

    return features;
  }

  /**
   * 提取功能点名称
   */
  extractFeatureName(text) {
    // 移除序号
    let cleaned = text.replace(/^\d+[\.\、]\s*/, '');
    // 移除前缀关键词
    cleaned = cleaned.replace(/^(需求名称|功能|Feature|模块|Module)\s*[:：]?\s*/, '');
    // 移除冒号后面的内容（如果有）
    cleaned = cleaned.split(/[:：]/)[0].trim();

    // 如果包含"页面"等关键词，提取包含关键词的完整名称
    const pageMatch = cleaned.match(/.*?(頁面|页面|畫面|画面|Page|Screen|列表|详情|编辑|新增|删除|登录|注册|主页|首页|设置)/);
    if (pageMatch) {
      return pageMatch[0].substring(0, 20);
    }
    // 如果以"用户"、"订单"等开头，保留
    // 否则取前 20 个字符
    return cleaned.substring(0, 20);
  }

  /**
   * 解析依赖关系
   */
  resolveDependencies(segments) {
    // 简化实现：基于文件路径推断依赖
    // 如果 segment A 的文件导入了 segment B 的文件，则 A 依赖于 B

    const fs = require('fs');

    // 构建文件到分段的映射
    const fileToSegment = new Map();
    segments.forEach(seg => {
      seg.files.forEach(file => {
        fileToSegment.set(file, seg.id);
      });
    });

    // 分析每个分段的导入
    segments.forEach(seg => {
      const dependencies = new Set();

      for (const file of seg.files) {
        try {
          const content = fs.readFileSync(file, 'utf8');
          const imports = this.extractImports(content, file);

          imports.forEach(imp => {
            const depSegmentId = fileToSegment.get(imp);
            if (depSegmentId && depSegmentId !== seg.id) {
              dependencies.add(depSegmentId);
            }
          });
        } catch (e) {
          // 忽略
        }
      }

      seg.dependsOn = Array.from(dependencies);
    });
  }

  /**
   * 提取导入的文件
   */
  extractImports(content, currentFile) {
    const imports = [];
    const path = require('path');
    const currentDir = path.dirname(currentFile);

    // Dart import
    const dartImports = content.matchAll(/import\s+['"]([^'"]+)['"]/g);
    for (const match of dartImports) {
      const importPath = match[1];
      if (importPath.startsWith('.')) {
        // 相对路径
        const resolved = path.resolve(currentDir, importPath + '.dart');
        imports.push(resolved);
      }
    }

    return imports;
  }

  /**
   * 设置优先级
   */
  assignPriorities(segments) {
    segments.forEach(seg => {
      // 有依赖的分段优先级较低
      if (seg.dependsOn.length > 0) {
        seg.priority = SegmentPriority.LOW;
      } else if (seg.files.some(f => f.includes('main') || f.includes('app'))) {
        // 入口文件优先级高
        seg.priority = SegmentPriority.HIGH;
      } else {
        seg.priority = SegmentPriority.MEDIUM;
      }
    });

    // 按优先级排序
    segments.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }
}

module.exports = FeatureSegmentStrategy;
