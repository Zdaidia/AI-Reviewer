/**
 * QA Reviewer - 需求符合性验证工具
 *
 * 混合模式架构：
 * - 工具处理：基础质量检查（复用现有规则引擎和深度分析）
 * - AI 处理：需求符合性验证、代码优化建议
 *
 * 核心功能：
 * - 需求-代码映射
 * - 分段执行（支持大型项目）
 * - 多维度验证
 * - 进度保存和恢复
 */

const fs = require('fs');
const path = require('path');
const { getProjectConfig } = require('./config/default-config');
const { CodeGraphAdapter, AIContextAdapter, MemoryAdapter } = require('./integrations');
const PromptTemplates = require('./prompts/prompt-templates');
const { ReportGenerator } = require('./output');

class QAReviewer {
  // 全局运行追踪（防止短时间内多次运行触发速率限制）
  static lastRunTime = 0;
  static MIN_COOLDOWN = 120000; // 2分钟冷却时间

  constructor(options = {}) {
    // 配置
    this.config = options.config || getProjectConfig(options.projectPath);

    // LLM 客户端（AI 处理部分）
    this.llm = options.llm || null;

    // 复用现有组件（工具处理部分）
    this.codeScanner = options.codeScanner || null;
    this.deepAnalyzer = options.deepAnalyzer || null;

    // 适配器
    this.adapters = {
      codeGraph: new CodeGraphAdapter(),
      context: new AIContextAdapter({ memoryManager: options.memoryManager }),
      memory: new MemoryAdapter({ memoryManager: options.memoryManager }),
    };

    // 审查状态
    this.state = {
      isRunning: false,
      currentPlan: null,
      progress: {},
    };

    // 报告生成器
    this.reportGenerator = new ReportGenerator();
  }

  /**
   * 检查冷却时间（防止短时间内多次运行）
   */
  static checkCooldown() {
    const now = Date.now();
    const elapsed = now - QAReviewer.lastRunTime;

    if (elapsed < QAReviewer.MIN_COOLDOWN) {
      const remaining = Math.ceil((QAReviewer.MIN_COOLDOWN - elapsed) / 1000);
      throw new Error(
        `QA Reviewer 正在冷却中，请等待 ${remaining} 秒后再试。\n` +
        `这是为了防止触发智谱 API 速率限制（每分钟限制 2-3 个请求）。`
      );
    }

    QAReviewer.lastRunTime = now;
    return true;
  }

  /**
   * 初始化（加载项目数据）
   */
  async initialize(projectPath) {
    this.projectPath = projectPath;

    console.log('[QAReviewer] 初始化...');

    // 1. 加载代码图
    try {
      const graphResult = await this.adapters.codeGraph.load(projectPath);
      console.log(`[QAReviewer] 代码图: ${graphResult.nodeCount} 个节点`);
    } catch (e) {
      console.warn(`[QAReviewer] 代码图加载失败: ${e.message}`);
      console.log('[QAReviewer] 提示: 请先运行 "Scan Code" 进行代码扫描');
    }

    // 2. 加载 AI 上下文
    try {
      const contextResult = await this.adapters.context.load(projectPath);
      console.log(`[QAReviewer] AI 上下文: ${contextResult.hasContext ? '已加载' : '未找到'}`);
    } catch (e) {
      console.warn(`[QAReviewer] AI 上下文加载失败: ${e.message}`);
    }

    // 3. 加载 Memory
    try {
      await this.adapters.memory.load(projectPath);
      const stats = this.adapters.memory.getMemoryStats();
      if (stats) {
        console.log(`[QAReviewer] Memory: ${stats.fileCount} 个文件, ${stats.reviewCount} 次审查`);
      }
    } catch (e) {
      console.warn(`[QAReviewer] Memory 加载失败: ${e.message}`);
    }

    return true;
  }

  /**
   * 执行需求符合性审查（主入口）
   * @param {Object} params - 审查参数
   * @returns {Object} 审查结果
   */
  async review(params) {
    const {
      requirements,        // 需求文档（文本或对象）
      uiDesign,            // UI 设计稿（图片路径或 Figma 链接）
      targetPath,          // 目标代码路径
      dimensions = [],     // 验证维度
      incremental = false, // 是否增量审查
    } = params;

    console.log('[QAReviewer] 开始需求符合性审查...');

    // 重置全局取消标志（开始新的审查）
    global.qaReviewerCancelled = false;
    console.log('[QAReviewer] 重置取消标志，准备开始审查');

    // 1️⃣ 基础质量检查 - 工具自行处理
    console.log('[QAReviewer] 步骤 1/4: 基础质量检查...');
    const qualityResults = await this.checkCodeQuality(targetPath, incremental);

    // 2️⃣ 需求-代码映射
    console.log('[QAReviewer] 步骤 2/4: 需求-代码映射...');
    const codeMapping = await this.mapRequirementsToCode(requirements);

    // 3️⃣ 需求符合性验证 - AI 处理
    console.log('[QAReviewer] 步骤 3/4: 需求符合性验证（AI 分析）...');
    const requirementResults = await this.checkRequirementCompliance({
      requirements,
      uiDesign,
      codeMapping,
      dimensions,
    });

    // 4️⃣ 代码优化建议 - AI 处理
    console.log('[QAReviewer] 步骤 4/4: 代码优化建议（AI 分析）...');
    const optimizationResults = await this.suggestOptimizations(codeMapping);

    // 5️⃣ 合并结果
    const results = this.mergeResults({
      quality: qualityResults,
      requirement: requirementResults,
      optimization: optimizationResults,
    });

    // 6️⃣ 生成 TODO 注释
    if (this.config.output.addTodosToCode) {
      console.log('[QAReviewer] 生成 TODO 注释...');
      await this.generateTODOs(results);
    }

    // 7️⃣ 保存审查记录
    await this.saveReviewRecord(results);

    console.log(`[QAReviewer] 审查完成: ${results.totalIssues} 个问题`);

    return results;
  }

  /**
   * 1️⃣ 基础质量检查 - 工具自行处理
   * 复用现有的规则引擎和深度分析
   */
  async checkCodeQuality(targetPath, incremental = false) {
    const results = {
      ruleIssues: [],
      deepIssues: [],
      totalIssues: 0,
    };

    // 如果启用增量模式，只检查变更文件
    let scanPath = targetPath;
    if (incremental) {
      const changes = await this.adapters.memory.getChangedFiles();
      if (changes.modified.length > 0 || changes.added.length > 0) {
        console.log(`[QAReviewer] 增量模式: ${changes.modified.length + changes.added.length} 个变更文件`);
        // 增量模式的具体实现
      }
    }

    // 规则引擎扫描
    if (this.config.tool.enableRules && this.codeScanner) {
      try {
        const scanResults = await this.codeScanner.scanDirectory(scanPath);
        results.ruleIssues = scanResults.flatMap(r => r.issues || []);
        console.log(`[QAReviewer] 规则引擎: 发现 ${results.ruleIssues.length} 个问题`);
      } catch (e) {
        console.warn(`[QAReviewer] 规则引擎扫描失败: ${e.message}`);
      }
    }

    // 深度代码分析
    if (this.config.tool.enableDeepAnalysis && this.deepAnalyzer) {
      try {
        const deepResults = await this.deepAnalyzer.analyzeDirectory(scanPath);
        results.deepIssues = deepResults || [];
        console.log(`[QAReviewer] 深度分析: 发现 ${results.deepIssues.length} 个问题`);
      } catch (e) {
        console.warn(`[QAReviewer] 深度分析失败: ${e.message}`);
      }
    }

    results.totalIssues = results.ruleIssues.length + results.deepIssues.length;

    return results;
  }

  /**
   * 2️⃣ 需求-代码映射
   * 利用代码图将需求映射到具体代码
   */
  async mapRequirementsToCode(requirements) {
    const mapping = {
      features: [],
      files: new Set(),
      totalFiles: 0,
    };

    // 解析需求
    const featureList = this.parseRequirements(requirements);

    // 为每个功能点查找相关代码
    for (const feature of featureList) {
      let codeScope;

      // 尝试从 TEST_CONTEXT 查找
      codeScope = this.adapters.codeGraph.getCodeScopeForFeature(feature.name);

      // 如果没找到，使用关键词匹配
      if (!codeScope || codeScope.files.length === 0) {
        codeScope = this.adapters.codeGraph.findRelatedCode(
          feature.name + ' ' + feature.description
        );
      }

      mapping.features.push({
        ...feature,
        files: codeScope?.files || [],
        classes: codeScope?.classes || [],
      });

      codeScope?.files?.forEach(f => mapping.files.add(f));
    }

    mapping.totalFiles = mapping.files.size;
    mapping.files = Array.from(mapping.files);

    return mapping;
  }

  /**
   * 3️⃣ 需求符合性验证 - AI 处理
   */
  async checkRequirementCompliance(params) {
    const { requirements, uiDesign, codeMapping, dimensions } = params;

    // 确定启用的维度
    const enabledDimensions = dimensions.length > 0
      ? dimensions
      : Object.keys(this.config.dimensions)
          .filter(k => this.config.dimensions[k].enabled);

    const results = {
      functionality: null,
      uiConsistency: null,
      dataValidation: null,
      exceptionHandling: null,
      summary: {},
    };

    // 检查是否有 LLM
    if (!this.llm) {
      console.warn('[QAReviewer] LLM 未配置，跳过 AI 分析');
      return results;
    }

    // 构建分析提示词
    const prompt = this.buildCompliancePrompt({
      requirements,
      uiDesign,
      codeMapping,
      dimensions: enabledDimensions,
    });

    try {
      // 调用 AI 分析
      const response = await this.llm.call(prompt, {
        model: this.config.ai.requirement.model,
        temperature: this.config.ai.requirement.temperature,
        maxTokens: this.config.ai.requirement.maxTokens,
      });

      // 解析 AI 响应
      return this.parseComplianceResponse(response, enabledDimensions);
    } catch (e) {
      console.error(`[QAReviewer] AI 分析失败: ${e.message}`);
      return results;
    }
  }

  /**
   * 4️⃣ 代码优化建议 - AI 处理
   */
  async suggestOptimizations(codeMapping) {
    if (!this.config.ai.optimization.enabled || !this.llm) {
      return { suggestions: [] };
    }

    const prompt = this.buildOptimizationPrompt(codeMapping);

    try {
      const response = await this.llm.call(prompt, {
        model: this.config.ai.requirement.model,
        temperature: 0.3,
      });

      return this.parseOptimizationResponse(response);
    } catch (e) {
      console.error(`[QAReviewer] 优化建议生成失败: ${e.message}`);
      return { suggestions: [] };
    }
  }

  /**
   * 合并所有结果
   */
  mergeResults(parts) {
    const allIssues = [
      ...parts.quality.ruleIssues.map(i => ({ ...i, source: 'rule-engine' })),
      ...parts.quality.deepIssues.map(i => ({ ...i, source: 'deep-analyzer' })),
      ...(parts.requirement.functionality?.issues || []).map(i => ({ ...i, source: 'ai-requirement' })),
      ...(parts.requirement.uiConsistency?.issues || []).map(i => ({ ...i, source: 'ai-ui' })),
      ...(parts.requirement.dataValidation?.issues || []).map(i => ({ ...i, source: 'ai-data' })),
      ...(parts.requirement.exceptionHandling?.issues || []).map(i => ({ ...i, source: 'ai-exception' })),
      ...(parts.optimization.suggestions || []).map(i => ({ ...i, source: 'ai-optimization' })),
    ];

    // 统计
    const bySeverity = { high: 0, medium: 0, low: 0 };
    allIssues.forEach(i => {
      const severity = i.severity || 'medium';
      bySeverity[severity] = (bySeverity[severity] || 0) + 1;
    });

    return {
      totalIssues: allIssues.length,
      issues: allIssues,
      bySeverity,
      bySource: {
        ruleEngine: parts.quality.ruleIssues.length,
        deepAnalyzer: parts.quality.deepIssues.length,
        aiRequirement: parts.requirement.functionality?.issues?.length || 0,
        aiUI: parts.requirement.uiConsistency?.issues?.length || 0,
        aiData: parts.requirement.dataValidation?.issues?.length || 0,
        aiException: parts.requirement.exceptionHandling?.issues?.length || 0,
        aiOptimization: parts.optimization.suggestions?.length || 0,
      },
      summary: this.generateSummary(parts),
    };
  }

  /**
   * 生成 TODO 注释
   */
  async generateTODOs(results) {
    const fs = require('fs');

    console.log('[QAReviewer] generateTODOs - 收到的结果:', {
      issuesCount: results?.issues?.length || 0,
      issues: results?.issues
    });

    if (!results || !results.issues || results.issues.length === 0) {
      console.log('[QAReviewer] 没有需要添加 TODO 的问题');
      return { added: 0, skipped: 0 };
    }

    // 按文件分组
    const issuesByFile = {};
    let skippedCount = 0;

    results.issues.forEach(issue => {
      // 支持 filePath 和 file 字段
      const filePath = issue.filePath || issue.file;
      if (!filePath) {
        console.warn('[QAReviewer] 问题缺少文件路径:', issue);
        skippedCount++;
        return;
      }

      if (!issuesByFile[filePath]) {
        issuesByFile[filePath] = [];
      }
      issuesByFile[filePath].push(issue);
    });

    console.log(`[QAReviewer] 按文件分组后: ${Object.keys(issuesByFile).length} 个文件, ${skippedCount} 个问题被跳过`);

    let totalAdded = 0;
    let totalSkipped = 0;
    let noLineNumberCount = 0;

    // 为每个文件添加 TODO
    for (const [filePath, fileIssues] of Object.entries(issuesByFile)) {
      try {
        if (!fs.existsSync(filePath)) {
          console.warn(`[QAReviewer] 文件不存在: ${filePath}`);
          continue;
        }

        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');

        // 首先处理没有行号或行号为0的问题，尝试找到相关代码行
        const issuesWithValidLine = [];
        const issuesWithoutLine = [];
        for (const issue of fileIssues) {
          if (!issue.line || issue.line <= 0) {
            issuesWithoutLine.push(issue);
          } else {
            issuesWithValidLine.push(issue);
          }
        }

        // 尝试为无行号的问题找到代码行
        for (const issue of issuesWithoutLine) {
          console.warn(`[QAReviewer] 问题缺少有效行号: ${issue.ruleId}, 尝试查找相关代码`);
          noLineNumberCount++;
          const keywords = this.extractKeywords(issue);
          console.log(`[QAReviewer] 提取的关键词:`, keywords);

          const foundLine = this.findLineByKeywords(content, keywords);
          if (foundLine > 0) {
            issue.line = foundLine;
            issuesWithValidLine.push(issue);
            console.log(`[QAReviewer] 为问题 ${issue.ruleId} 找到代码行: ${foundLine}`);
          } else {
            // 如果实在找不到，将 TODO 添加到文件末尾（而不是跳过）
            console.warn(`[QAReviewer] 无法找到相关代码行: ${issue.ruleId}, 将添加到文件末尾`);
            issue.line = lines.length + 1; // 添加到文件末尾
            issuesWithValidLine.push(issue);
          }
        }

        // 如果没有有效行号的问题，跳过此文件
        if (issuesWithValidLine.length === 0) {
          console.warn(`[QAReviewer] 文件 ${filePath} 没有有效行号的问题，跳过`);
          continue;
        }

        // 按行号排序（降序，避免偏移问题）
        issuesWithValidLine.sort((a, b) => (b.line || 0) - (a.line || 0));

        // 按行号分组，相同行号的问题一起处理
        const issuesByLine = new Map();
        for (const issue of issuesWithValidLine) {
          const line = issue.line || 0;
          if (!issuesByLine.has(line)) {
            issuesByLine.set(line, []);
          }
          issuesByLine.get(line).push(issue);
        }

        // 按行号降序排序
        const sortedLines = Array.from(issuesByLine.keys()).sort((a, b) => b - a);

        let modified = false;
        const insertedCount = new Map(); // 记录每行已插入的 TODO 数量

        for (const originalLine of sortedLines) {
          const lineIssues = issuesByLine.get(originalLine);

          // 计算实际插入位置（考虑之前已插入的 TODO）
          let actualLine = originalLine;
          for (const [line, count] of insertedCount.entries()) {
            if (line < actualLine) {
              actualLine += count;
            }
          }

          const lineIndex = actualLine - 1;
          if (lineIndex < 0 || lineIndex >= lines.length) {
            console.warn(`[QAReviewer] 行号超出范围: ${filePath}:${actualLine} (原始行号: ${originalLine})`);
            continue;
          }

          // 直接在问题行上方插入 TODO，不再向上查找函数定义
          const insertIndex = actualLine - 1;

          // 为每个问题生成 TODO
          const todosToAdd = [];
          const existingRuleIds = new Set();

          // 检查该位置是否已有 TODO，收集已存在的 ruleId
          for (let i = Math.max(0, insertIndex - 5); i <= Math.min(lines.length - 1, insertIndex + 2); i++) {
            const todoMatches = lines[i].match(/\/\/\s*TODO:\s*\[([^\]]+)\]/g);
            if (todoMatches) {
              todoMatches.forEach(match => {
                const tag = match.match(/\[([^\]]+)\]/)[1];
                existingRuleIds.add(tag);
              });
            }
          }

          for (const issue of lineIssues) {
            const todo = this.formatTODO(issue);
            // 从生成的 TODO 中提取标签用于去重匹配
            const tagMatch = todo.match(/\[([^\]]+)\]/);
            const todoTag = tagMatch ? tagMatch[1] : issue.ruleId;

            // 检查是否已存在相同的 TODO
            if (existingRuleIds.has(todoTag)) {
              console.log(`[QAReviewer] TODO 已存在，跳过: ${todoTag}`);
              totalSkipped++;
              continue;
            }

            // 生成 TODO 注释
            todosToAdd.push(todo);
            existingRuleIds.add(todoTag);
          }

          // 插入所有 TODO
          if (todosToAdd.length > 0) {
            const indent = lines[insertIndex].match(/^\s*/)[0];

            // 在函数定义上方插入所有 TODO（每个 TODO 一行）
            todosToAdd.reverse().forEach(todo => {
              lines.splice(insertIndex, 0, indent + todo);
            });

            // 记录插入的 TODO 数量
            insertedCount.set(originalLine, (insertedCount.get(originalLine) || 0) + todosToAdd.length);

            totalAdded += todosToAdd.length;
            modified = true;

            console.log(`[QAReviewer] 添加 ${todosToAdd.length} 个 TODO 到 ${filePath}:${actualLine} (问题行: ${originalLine})`);
            console.log(`[QAReviewer] TODO 内容: ${todosToAdd.join(', ')}`);

            // 调试：打印插入位置附近的代码
            console.log(`[QAReviewer] 插入位置附近代码 (insertIndex=${insertIndex}):`);
            for (let i = Math.max(0, insertIndex - 2); i <= Math.min(lines.length - 1, insertIndex + 2); i++) {
              const marker = i === insertIndex ? ' <<<< 插入点' : '';
              console.log(`  ${i + 1}: ${lines[i].substring(0, 60)}${marker}`);
            }
          }
        }

        if (modified) {
          fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
          console.log(`[QAReviewer] 已修改文件: ${filePath}, 文件大小: ${lines.join('\n').length} 字节`);
        }
      } catch (e) {
        console.warn(`[QAReviewer] 无法写入文件: ${filePath}`, e.message);
      }
    }

    console.log(`[QAReviewer] TODO 生成完成: 添加 ${totalAdded} 个, 跳过 ${totalSkipped} 个, 无行号 ${noLineNumberCount} 个`);
    console.log(`[QAReviewer] TODO 详细统计: 总问题 ${results.issues.length} 个, 成功添加 ${totalAdded} 个, 跳过 ${totalSkipped} 个`);

    // 调试：打印没有成功添加的问题
    if (results.issues.length > totalAdded) {
      const failedIssues = results.issues.filter(issue => {
        const filePath = issue.filePath || issue.file;
        if (!filePath) return true;
        // 检查该文件是否被成功处理
        const fileProcessed = Object.keys(issuesByFile).includes(filePath);
        return !fileProcessed;
      });
      if (failedIssues.length > 0) {
        console.warn(`[QAReviewer] 未能添加 TODO 的问题:`, failedIssues.map(i => ({
          ruleId: i.ruleId,
          filePath: i.filePath || i.file,
          line: i.line,
          message: i.message?.substring(0, 50)
        })));
      }
    }

    return { added: totalAdded, skipped: totalSkipped, noLineNumber: noLineNumberCount };
  }

  /**
   * 从问题中提取关键词
   */
  extractKeywords(issue) {
    const keywords = [];

    // 从问题描述中提取关键词
    if (issue.message) {
      // 提取可能的变量名、函数名、类名
      const words = issue.message.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || [];
      keywords.push(...words.slice(0, 5)); // 取前5个单词
    }

    // 从规则ID中提取
    if (issue.ruleId) {
      keywords.push(issue.ruleId.replace(/^QA-/, ''));
    }

    // 从建议中提取关键词
    if (issue.suggestion) {
      const words = issue.suggestion.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || [];
      keywords.push(...words.slice(0, 3));
    }

    // 去重并返回
    return [...new Set(keywords)];
  }

  /**
   * 在文件内容中查找包含关键词的行
   */
  findLineByKeywords(content, keywords) {
    if (!keywords || keywords.length === 0) {
      return -1;
    }

    const lines = content.split('\n');
    const validKeywords = keywords.filter(kw => kw && kw.length > 2); // 只保留长度>2的关键词

    if (validKeywords.length === 0) {
      return -1;
    }

    // 记录每行的匹配分数
    const lineScores = lines.map((line, index) => {
      // 跳过注释行
      if (line.trim().startsWith('//') || line.trim().startsWith('/*') || line.trim().startsWith('*')) {
        return { index, score: -1 };
      }

      let score = 0;
      const lowerLine = line.toLowerCase();

      for (const kw of validKeywords) {
        const lowerKw = kw.toLowerCase();
        // 完全匹配，分数更高
        if (lowerLine.includes(lowerKw)) {
          // 如果是独立的单词（被空格或符号包围），分数更高
          const wordRegex = new RegExp(`\\b${lowerKw}\\b`, 'i');
          if (wordRegex.test(lowerLine)) {
            score += 3;
          } else {
            score += 1;
          }
        }
      }

      return { index, score };
    });

    // 找到分数最高的行
    lineScores.sort((a, b) => b.score - a.score);

    if (lineScores[0].score > 0) {
      console.log(`[QAReviewer] 通过关键词找到代码行: ${lineScores[0].index + 1} (分数: ${lineScores[0].score})`);
      return lineScores[0].index + 1; // 返回行号（从1开始）
    }

    return -1;
  }

  /**
   * 格式化 TODO 注释
   */
  formatTODO(issue) {
    const { ruleId, message, suggestion, severity } = issue;
    // 提取简短标签：QA-REQ-001 → REQ，QA-REQ-001,QA-FUNC-003 → REQ/FUNC
    const shortTags = [...new Set(
      ruleId.split(',').map(id => {
        const m = id.match(/QA-([A-Z]+?)(?:-|$)/);
        return m ? m[1] : id;
      })
    )].join('/');
    const level = severity || 'medium';
    return `// TODO: [${shortTags}]-${level}: ${message} - ${suggestion || '需要修复'}`;
  }

  /**
   * 找到包含指定行的函数/方法定义行
   * 向上查找最近的函数/类/方法定义，返回函数定义行本身
   * TODO 将被插入到函数定义行的上方
   */
  findFunctionDefinitionLine(lines, targetLine) {
    // 处理行号超出文件末尾的情况
    if (targetLine > lines.length) {
      console.log(`[QAReviewer] 行号 ${targetLine} 超出文件末尾 (${lines.length})，将添加到文件末尾`);
      return lines.length; // 返回文件最后一行
    }

    const lineIndex = targetLine - 1;
    if (lineIndex < 0 || lineIndex >= lines.length) {
      return lines.length || 1;
    }

    const targetIndent = lines[lineIndex].match(/^\s*/)[0].length;

    // 向上查找，找到缩进更小或相等的行（可能是函数定义）
    for (let i = lineIndex; i >= Math.max(0, lineIndex - 50); i--) {
      const line = lines[i];
      if (!line) continue;

      const currentIndent = line.match(/^\s*/)[0].length;

      // 如果缩进变小，可能是函数/类定义
      if (currentIndent < targetIndent && line.trim().length > 0) {
        // 检查是否是函数/类/方法定义行
        const trimmed = line.trim();
        if (
          trimmed.match(/^(class|function|async\s+function|def|typedef)\s/) ||
          trimmed.match(/^\w+\s*\(/) ||
          trimmed.match(/^\w+\s*:\s*\(/) ||
          trimmed.match(/^(get|set)\s+\w+/) ||
          trimmed.match(/^(static|final|const|let|var)\s+\w+/)
        ) {
          // 返回函数定义行本身（TODO 将插入到此行上方）
          console.log(`[QAReviewer] 找到函数定义行: ${i + 1}，内容: ${trimmed.substring(0, 30)}...`);
          return i + 1;
        }
      }
    }

    // 如果找不到函数定义，返回目标行（在问题行上方添加）
    console.log(`[QAReviewer] 未找到函数定义，使用目标行: ${targetLine}`);
    return targetLine;
  }

  /**
   * 解析需求文档
   */
  parseRequirements(requirements) {
    if (typeof requirements === 'string') {
      // 简单文本解析
      return this.parseTextRequirements(requirements);
    } else if (Array.isArray(requirements)) {
      return requirements;
    } else if (typeof requirements === 'object') {
      return requirements.features || [];
    }

    return [];
  }

  /**
   * 解析文本需求
   */
  parseTextRequirements(text) {
    const features = [];
    const lines = text.split('\n');

    let currentFeature = null;

    for (const line of lines) {
      const trimmed = line.trim();

      // 检测功能点（以数字开头或特定关键词）
      if (/^\d+[\.\、]/.test(trimmed) ||
          trimmed.startsWith('功能') ||
          trimmed.startsWith('Feature')) {

        if (currentFeature) {
          features.push(currentFeature);
        }

        currentFeature = {
          name: this.extractFeatureName(trimmed),
          description: trimmed,
          requirements: [],
        };
      } else if (currentFeature && trimmed.length > 0) {
        currentFeature.requirements.push(trimmed);
        currentFeature.description += ' ' + trimmed;
      }
    }

    if (currentFeature) {
      features.push(currentFeature);
    }

    return features;
  }

  /**
   * 提取功能点名称
   */
  extractFeatureName(text) {
    // 移除序号
    const cleaned = text.replace(/^\d+[\.\、]\s*/, '');
    // 取前 20 个字符
    return cleaned.substring(0, 20);
  }

  /**
   * 构建需求符合性验证的提示词
   */
  buildCompliancePrompt(params) {
    return PromptTemplates.buildCompliancePrompt(params);
  }

  /**
   * 构建优化建议提示词
   */
  buildOptimizationPrompt(codeMapping) {
    return PromptTemplates.buildOptimizationPrompt({ codeMapping });
  }

  /**
   * 构建代码质量检查提示词
   */
  buildQualityPrompt(files) {
    return PromptTemplates.buildQualityPrompt({ codeFiles: files });
  }

  /**
   * 获取维度描述
   */
  getDimensionDescription(dimension) {
    const descriptions = {
      functionality: '功能完整性：需求中的所有功能是否都已实现',
      uiConsistency: 'UI 一致性：界面样式、布局、交互是否与设计稿一致',
      dataValidation: '数据验证：输入验证、边界条件是否符合需求',
      exceptionHandling: '异常处理：错误场景是否按需求处理',
      optimization: '代码优化：是否有可以优化的地方',
      quality: '代码质量：内存泄漏、死循环、潜在崩溃等',
    };
    return descriptions[dimension] || dimension;
  }

  /**
   * 解析 AI 响应
   */
  parseComplianceResponse(response, dimensions) {
    const results = {};

    try {
      // 尝试解析 JSON
      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]);
        return parsed;
      }

      // 如果没有 JSON，尝试从文本中提取
      return this.extractIssuesFromText(response, dimensions);
    } catch (e) {
      console.warn('[QAReviewer] AI 响应解析失败:', e.message);
      return {};
    }
  }

  /**
   * 从文本中提取问题
   */
  extractIssuesFromText(text, dimensions) {
    const results = {};

    dimensions.forEach(dim => {
      results[dim] = {
        passed: true,
        issues: [],
      };
    });

    // 简化实现：查找包含 "问题" 或 "issue" 的行
    // 实际应该使用更复杂的解析逻辑

    return results;
  }

  /**
   * 构建优化建议的提示词
   */
  buildOptimizationPrompt(codeMapping) {
    return `
请分析以下代码，提供优化建议：

【代码文件】
${codeMapping.files.slice(0, 10).join('\n')}

【功能点】
${codeMapping.features.map(f => `- ${f.name}`).join('\n')}

请从以下方面提供优化建议：
1. 性能优化
2. 代码重构
3. 最佳实践

按 JSON 格式输出：
\`\`\`json
{
  "suggestions": [
    {
      "ruleId": "QA-OPT-001",
      "severity": "low",
      "file": "文件路径",
      "line": 行号,
      "message": "问题描述",
      "suggestion": "优化建议"
    }
  ]
}
\`\`\`
`;
  }

  /**
   * 解析优化建议响应
   */
  parseOptimizationResponse(response) {
    try {
      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1]);
      }
      return { suggestions: [] };
    } catch (e) {
      return { suggestions: [] };
    }
  }

  /**
   * 生成摘要
   */
  generateSummary(parts) {
    const summary = [];

    if (parts.quality.totalIssues > 0) {
      summary.push(`基础质量: ${parts.quality.totalIssues} 个问题`);
    }

    if (parts.requirement.functionality?.passed === false) {
      summary.push('功能完整性: 不符合');
    }

    if (parts.requirement.uiConsistency?.passed === false) {
      summary.push('UI 一致性: 不符合');
    }

    if (parts.optimization.suggestions?.length > 0) {
      summary.push(`优化建议: ${parts.optimization.suggestions.length} 条`);
    }

    return summary.join('; ');
  }

  /**
   * 保存审查记录
   */
  async saveReviewRecord(results) {
    try {
      const recordId = await this.adapters.memory.saveReviewRecord({
        summary: results.summary,
        issues: results.issues,
        metrics: results.bySeverity,
      });
      console.log(`[QAReviewer] 审查记录已保存: ${recordId}`);
    } catch (e) {
      console.warn(`[QAReviewer] 保存审查记录失败: ${e.message}`);
    }
  }

  /**
   * 设置 LLM 客户端
   */
  setLLM(llm) {
    this.llm = llm;
  }

  /**
   * 设置代码扫描器
   */
  setCodeScanner(scanner) {
    this.codeScanner = scanner;
  }

  /**
   * 设置深度分析器
   */
  setDeepAnalyzer(analyzer) {
    this.deepAnalyzer = analyzer;
  }

  /**
   * 生成报告
   * @param {Object} results - 审查结果
   * @param {Object} options - 报告选项
   */
  async generateReports(results, options = {}) {
    const formats = options.formats || this.config.output.reportFormats;

    console.log(`[QAReviewer] 生成报告: ${formats.join(', ')}`);

    // 准备报告数据
    const report = {
      projectPath: this.projectPath,
      totalIssues: results.totalIssues,
      bySeverity: results.bySeverity,
      bySource: results.bySource,
      issues: results.issues,
      requirements: results.requirement || {},
      segments: results.segments || [],
    };

    // 生成多种格式报告
    const reportFiles = await this.reportGenerator.generateAll(report, {
      formats,
      filename: options.filename,
    });

    // 生成控制台报告
    const consoleReport = this.reportGenerator.generateConsoleReport(report);
    console.log(consoleReport);

    return reportFiles;
  }

  /**
   * 在控制台输出摘要
   */
  printSummary(results) {
    const consoleReport = this.reportGenerator.generateConsoleReport({
      totalIssues: results.totalIssues,
      bySeverity: results.bySeverity,
      issues: results.issues,
    });
    console.log(consoleReport);
  }
}

module.exports = QAReviewer;
