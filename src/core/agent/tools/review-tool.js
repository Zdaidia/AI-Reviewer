/**
 * Review Tool
 *
 * Performs intelligent code review using Context Builder.
 * Analyzes code issues with deep context and provides enhanced suggestions.
 * Now includes deep code analysis for undefined methods, crashes, memory leaks, etc.
 */

const BaseTool = require('./base-tool');
const DeepCodeAnalyzer = require('./deep-analyzer');

class ReviewTool extends BaseTool {
  constructor(codeScanner, todoManager, contextBuilder) {
    super(
      'review',
      'Execute intelligent code review with deep context analysis. Analyzes code issues and provides enhanced suggestions with context-aware recommendations. Includes AI-powered detection of undefined methods, potential crashes, memory leaks, and other issues.',
      [
        {
          name: 'targetPath',
          type: 'string',
          description: 'Path to the file or directory to review',
          required: true
        },
        {
          name: 'baseIssues',
          type: 'array',
          description: 'List of base issues found by rule-based scanner. If not provided, will run a scan first.',
          required: false
        },
        {
          name: 'focusAreas',
          type: 'array',
          description: 'Areas to focus analysis on: code, ui, data, business, performance',
          required: false,
          default: ['code', 'performance']
        },
        {
          name: 'includeFullAnalysis',
          type: 'boolean',
          description: 'Whether to include full detailed analysis for each issue',
          required: false,
          default: false
        },
        {
          name: 'addTodoComments',
          type: 'boolean',
          description: 'Whether to add TODO comments to files (same as traditional mode)',
          required: false,
          default: true
        }
      ]
    );
    this.codeScanner = codeScanner;
    this.todoManager = todoManager;
    this.contextBuilder = contextBuilder;
    this.deepAnalyzer = new DeepCodeAnalyzer();
  }

  /**
   * Execute code review with context
   */
  async execute(params, context) {
    const { targetPath, baseIssues, focusAreas, includeFullAnalysis, addTodoComments = true } = params;

    // Validate
    const validation = this.validate(params);
    if (!validation.valid) {
      return this.error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    try {
      console.log(`[Agent Review] Starting deep analysis for: ${targetPath}`);

      // Step 1: Collect base issues if not provided
      let issues = baseIssues;
      let scannedFiles = [];

      if (!issues || issues.length === 0) {
        // Run scanner to get base issues
        const fs = require('fs');
        const stats = fs.statSync(targetPath);

        let scanResults;
        if (stats.isDirectory()) {
          scanResults = await this.codeScanner.scanDirectory(targetPath);
        } else {
          scanResults = await this.codeScanner.scanFile(targetPath);
          scanResults = [scanResults];
        }

        issues = scanResults.flatMap(r => r.issues || []);
        scannedFiles = scanResults.map(r => r.filePath);
      } else {
        // Extract file paths from issues
        scannedFiles = [...new Set(issues.map(i => i.filePath))];
      }

      // Step 2: Deep AI analysis - detect additional issues
      console.log(`[Agent Review] Running deep AI analysis on ${scannedFiles.length} files...`);
      const deepAnalysisResults = await this.runDeepAnalysis(scannedFiles, issues);

      // Merge base issues with deep analysis results
      const allIssues = [...issues, ...deepAnalysisResults];
      console.log(`[Agent Review] Found ${allIssues.length} total issues (${issues.length} base + ${deepAnalysisResults.length} AI detected)`);

      if (allIssues.length === 0) {
        return this.success({
          originalIssues: [],
          enhancedAnalysis: {
            issues: [],
            summary: 'No issues found in the code',
            priority: []
          },
          addedTodos: 0,
          message: 'Code review completed - no issues found'
        });
      }

      // Step 3: Build code review context
      const reviewContext = await this.buildCodeReviewContext(
        allIssues,
        targetPath,
        { focusAreas, includeFullAnalysis }
      );

      // Step 4: Analyze issues with context
      const enhancedIssues = await this.analyzeIssuesWithContext(allIssues, reviewContext);

      // Step 5: Prioritize issues
      const priority = this.prioritizeIssues(enhancedIssues);

      // Step 6: Generate summary
      const summary = this.generateSummary(enhancedIssues, priority);

      // Step 7: Add TODO comments (same as traditional mode)
      let addedTodos = 0;
      let skippedTodos = 0;

      if (addTodoComments) {
        console.log(`[Agent Review] Adding TODO comments to files...`);
        const todoResult = await this.addTodoCommentsToFile(allIssues);
        addedTodos = todoResult.added;
        skippedTodos = todoResult.skipped;
        console.log(`[Agent Review] Added ${addedTodos} TODO comments, skipped ${skippedTodos}`);
      }

      const result = {
        originalIssues: issues,
        aiDetectedIssues: deepAnalysisResults,
        totalIssues: allIssues,
        enhancedAnalysis: {
          issues: enhancedIssues,
          summary,
          priority,
          context: reviewContext.summary,
          aiAnalysis: {
            detectedIssues: deepAnalysisResults.length,
            categories: this.categorizeAIIssues(deepAnalysisResults)
          }
        },
        addedTodos,
        skippedTodos,
        message: `Code review completed: ${allIssues.length} issues (${issues.length} rule-based + ${deepAnalysisResults.length} AI-detected). Added ${addedTodos} TODO comments.`
      };

      // Update context
      if (context) {
        context.lastReviewResults = result;
        context.lastReviewPath = targetPath;
      }

      return this.success(result);
    } catch (error) {
      console.error('[Agent Review] Error:', error);
      return this.error(`Code review failed: ${error.message}`);
    }
  }

  /**
   * Run deep AI analysis on files
   */
  async runDeepAnalysis(filePaths, existingIssues) {
    const aiIssues = [];
    const processedFiles = new Set();

    for (const filePath of filePaths) {
      if (processedFiles.has(filePath)) continue;
      processedFiles.add(filePath);

      try {
        // Get existing issues for this file
        const fileExistingIssues = existingIssues.filter(i => i.filePath === filePath);

        // Run deep analysis
        const deepIssues = await this.deepAnalyzer.analyzeFile(filePath, fileExistingIssues);
        aiIssues.push(...deepIssues);
      } catch (error) {
        console.error(`[Agent Review] Deep analysis failed for ${filePath}:`, error.message);
      }
    }

    return aiIssues;
  }

  /**
   * Add TODO comments to files (same as traditional mode)
   */
  async addTodoCommentsToFile(issues) {
    const fs = require('fs');
    const path = require('path');

    // Group issues by file
    const issuesByFile = {};
    issues.forEach((issue) => {
      if (!issuesByFile[issue.filePath]) {
        issuesByFile[issue.filePath] = [];
      }
      issuesByFile[issue.filePath].push(issue);
    });

    let addedCount = 0;
    let skippedCount = 0;

    for (const [filePath, fileIssues] of Object.entries(issuesByFile)) {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');

        // Sort issues by line number in descending order to avoid offset issues
        fileIssues.sort((a, b) => b.line - a.line);

        let modified = false;
        for (const issue of fileIssues) {
          const lineIndex = issue.line - 1;
          if (lineIndex >= 0 && lineIndex < lines.length) {
            const line = lines[lineIndex];

            // Check if TODO already exists
            if (line.includes(`TODO: [${issue.ruleId}]`)) {
              skippedCount++;
              continue;
            }

            // Add TODO comment
            const indent = line.match(/^\s*/)[0];
            // 构建完整的 TODO：包含问题描述和建议方案
            let todoMessage = issue.message || '代码问题';
            let todoSuggestion = issue.suggestion || issue.hint || '';

            // 如果没有 suggestion，根据 ruleId 生成默认建议
            if (!todoSuggestion) {
              todoSuggestion = this.generateDefaultSuggestion(issue.ruleId, todoMessage);
            }

            // 截断过长的内容
            if (todoMessage.length > 80) {
              todoMessage = todoMessage.substring(0, 77) + '...';
            }
            if (todoSuggestion.length > 100) {
              todoSuggestion = todoSuggestion.substring(0, 97) + '...';
            }

            const todoComment = todoSuggestion
              ? `${indent}// TODO: [${issue.ruleId}] ${todoMessage} - ${todoSuggestion}`
              : `${indent}// TODO: [${issue.ruleId}] ${todoMessage} - 需要修复`;

            lines.splice(lineIndex, 0, todoComment);
            addedCount++;
            modified = true;
          }
        }

        if (modified) {
          fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
        }
      } catch (error) {
        console.error(`[Agent Review] Failed to add TODO to ${filePath}:`, error.message);
      }
    }

    return { added: addedCount, skipped: skippedCount };
  }

  /**
   * Generate default suggestion for an issue based on ruleId and message
   */
  generateDefaultSuggestion(ruleId, message) {
    // 规则类型对应的默认建议
    const ruleSuggestions = {
      // 扫描器规则
      'JS-001': '请移除或使用日志库替代 console.log',
      'JS-002': '建议使用 const 或 let 替代 var',
      'JS-003': '请使用 try-catch 包裹异步调用',
      'JS-004': '请添加唯一 key 属性',
      'TS-001': '请添加返回类型注解',
      'TS-002': '建议使用 unknown 替代 any',
      'VUE-001': '请添加 :key 绑定',
      'VUE-002': '请添加 prop 类型验证',
      'VUE-003': '请移除调试代码',
      'CSS-001': '建议提高选择器优先级替代 !important',
      'CSS-002': '请更新到现代 flexbox 语法',
      'DART-001': '建议使用显式类型注解或 final',
      'DART-002': '请添加错误处理或日志',
      'DART-003': '建议使用 async/await 提高可读性',
      'DART-004': '请移除或使用日志框架替代 print',
      'DART-005': '考虑使用 const 构造函数提高性能',
      'DART-006': '考虑使用 const 提高性能',
      'DART-007': '请添加返回类型注解',
      'DART-008': '请检查是否需要忽略此警告',
      // Dart 空值检查规则
      'DART-NULL-001': '使用 ?.firstOrNull 或在访问前检查列表是否为空',
      'DART-NULL-002': '使用 firstOrNull/lastOrNull 或先检查 isEmpty/length',
      'DART-NULL-003': '初始化时添加默认元素或使用 .firstOrNull/.lastOrNull',
      'DART-NULL-004': '使用 ?. 或 ?? 操作符进行安全的空值处理',
      'DART-NULL-005': '使用可选链 ?. 保护中间属性访问',
      'DART-NULL-006': '确保在使用前完成初始化，或考虑使用 nullable 类型',
      // AI 检测规则
      'AI-UNDEF-001': '检查该方法是否已定义或导入',
      'AI-UNDEF-002': '检查该方法是否已定义或导入',
      'AI-CRASH-001': '在使用前添加空值检查或使用可选链操作符',
      'AI-CRASH-002': '在使用前检查数组长度',
      'AI-CRASH-003': '使用 try-catch 包裹 JSON.parse',
      'AI-CRASH-004': '在使用前检查除数是否为零',
      'AI-CRASH-005': '考虑使用 ?. 或 ?? 进行空值处理',
      'AI-MEM-001': '在清理函数中移除定时器或事件监听器',
      'AI-MEM-002': '添加适当的依赖数组',
      'AI-MEM-003': '考虑使用 useMemo 或分页优化',
      'AI-MEM-004': '重写 dispose 方法释放资源',
      'AI-DEAD-001': '删除或重新组织代码逻辑',
      'AI-LOOP-001': '确保循环中有明确的退出条件',
      'AI-LOOP-002': '添加计数器递增',
      // QA Reviewer 规则
      'QA-REQ': '对照需求文档检查实现是否符合',
      'QA-FUNC': '检查功能逻辑是否正确实现',
      'QA-ARCH': '参考架构设计调整实现',
      'QA-OPT': '优化代码以提高性能或可读性',
      'QA-SEC': '处理潜在的安全风险',
      'QA-ACC': '添加必要的可访问性支持',
    };

    // 如果有匹配的建议，直接返回
    if (ruleSuggestions[ruleId]) {
      return ruleSuggestions[ruleId];
    }

    // 根据规则 ID 前缀生成通用建议
    if (ruleId.startsWith('JS-') || ruleId.startsWith('TS-')) {
      return '参考 JavaScript/TypeScript 最佳实践修改';
    }
    if (ruleId.startsWith('VUE-')) {
      return '参考 Vue 最佳实践修改';
    }
    if (ruleId.startsWith('CSS-')) {
      return '参考 CSS 最佳实践修改';
    }
    if (ruleId.startsWith('DART-') || ruleId.startsWith('FLUT-')) {
      return '参考 Dart/Flutter 最佳实践修改';
    }
    if (ruleId.startsWith('AI-')) {
      return '根据 AI 分析建议修改代码';
    }
    if (ruleId.startsWith('QA-')) {
      return '根据 QA 审查建议修改';
    }

    // 从消息中推断建议
    if (message) {
      if (message.includes('未定义') || message.includes('undefined')) {
        return '检查相关定义是否存在';
      }
      if (message.includes('空') || message.includes('null')) {
        return '添加空值检查';
      }
      if (message.includes('内存')) {
        return '释放相关资源';
      }
      if (message.includes('性能')) {
        return '优化相关逻辑';
      }
      if (message.includes('安全')) {
        return '处理安全风险';
      }
    }

    return '根据具体问题修改代码';
  }

  /**
   * Categorize AI-detected issues
   */
  categorizeAIIssues(aiIssues) {
    const categories = {
      undefined: { count: 0, issues: [] },
      crashes: { count: 0, issues: [] },
      memory: { count: 0, issues: [] },
      deadCode: { count: 0, issues: [] },
      loops: { count: 0, issues: [] },
      other: { count: 0, issues: [] }
    };

    aiIssues.forEach(issue => {
      if (issue.ruleId.startsWith('AI-UNDEF')) {
        categories.undefined.count++;
        categories.undefined.issues.push(issue);
      } else if (issue.ruleId.startsWith('AI-CRASH')) {
        categories.crashes.count++;
        categories.crashes.issues.push(issue);
      } else if (issue.ruleId.startsWith('AI-MEM')) {
        categories.memory.count++;
        categories.memory.issues.push(issue);
      } else if (issue.ruleId.startsWith('AI-DEAD')) {
        categories.deadCode.count++;
        categories.deadCode.issues.push(issue);
      } else if (issue.ruleId.startsWith('AI-LOOP')) {
        categories.loops.count++;
        categories.loops.issues.push(issue);
      } else {
        categories.other.count++;
        categories.other.issues.push(issue);
      }
    });

    return categories;
  }

  /**
   * Build code review context using Context Builder
   */
  async buildCodeReviewContext(issues, targetPath, options) {
    const { focusAreas, includeFullAnalysis } = options;

    // Use Context Builder to collect project information
    const projectInfo = { path: targetPath };

    try {
      // Build question context for code review
      const question = `请审查以下代码问题，提供深入分析和改进建议：${JSON.stringify(issues.map(i => ({
        ruleId: i.ruleId,
        message: i.message,
        file: i.filePath
      })))}`;

      const aiContext = await this.contextBuilder.buildQuestionContext(question, projectInfo, {
        focusAreas: focusAreas || ['code', 'performance'],
        includeFullAnalysis: includeFullAnalysis || false
      });

      return {
        aiContext,
        summary: this.summarizeContext(aiContext),
        issuesByFile: this.groupIssuesByFile(issues),
        issuesByRule: this.groupIssuesByRule(issues)
      };
    } catch (error) {
      console.error('Error building review context:', error);
      // Return minimal context if builder fails
      return {
        aiContext: null,
        summary: 'Context building failed, using basic analysis',
        issuesByFile: this.groupIssuesByFile(issues),
        issuesByRule: this.groupIssuesByRule(issues)
      };
    }
  }

  /**
   * Analyze issues with context to provide enhanced insights
   */
  async analyzeIssuesWithContext(issues, reviewContext) {
    const enhanced = [];

    for (const issue of issues) {
      const enhancedIssue = {
        ...issue,
        context: {},
        suggestions: [],
        severity: issue.severity || 'medium'
      };

      // Add file context
      if (reviewContext.issuesByFile[issue.filePath]) {
        enhancedIssue.context.fileIssues = reviewContext.issuesByFile[issue.filePath].length;
        enhancedIssue.context.fileHasMultipleIssues = reviewContext.issuesByFile[issue.filePath].length > 1;
      }

      // Add rule context
      if (reviewContext.issuesByRule[issue.ruleId]) {
        enhancedIssue.context.ruleOccurrences = reviewContext.issuesByRule[issue.ruleId].length;
        enhancedIssue.context.isRecurring = reviewContext.issuesByRule[issue.ruleId].length > 1;
      }

      // Generate suggestions based on rule type
      enhancedIssue.suggestions = this.generateSuggestions(issue, reviewContext);

      enhanced.push(enhancedIssue);
    }

    return enhanced;
  }

  /**
   * Generate suggestions for a specific issue
   */
  generateSuggestions(issue, reviewContext) {
    const suggestions = [];
    const { ruleId, message } = issue;

    // Rule-specific suggestions
    const ruleSuggestions = {
      'FLUT-001': [
        '提取子组件以减少 Widget 树深度',
        '使用 const 构造函数优化性能',
        '考虑使用 ListView.builder 替代 Column'
      ],
      'FLUT-002': [
        '为 Widget 添加 key 参数以便正确识别',
        '在列表中确保每个元素有唯一标识',
        '考虑使用 UniqueKey 或 ValueKey'
      ],
      'FLUT-003': [
        '使用 MediaQuery 适配不同屏幕尺寸',
        '使用 LayoutBuilder 实现响应式布局',
        '考虑使用 Flexible 或 Expanded 控制空间分配'
      ],
      'FLUT-004': [
        '将 build 方法中的复杂逻辑提取到单独的方法中',
        '使用计算属性缓存复杂计算结果',
        '考虑使用 StatefulWidget 并将状态移至 State 类'
      ],
      'JS-001': [
        '添加适当的 null 检查',
        '使用可选链操作符 (?.)',
        '提供默认值防止 undefined 错误'
      ],
      'JS-002': [
        '使用 const/let 替代 var',
        '避免在循环中声明函数',
        '使用箭头函数保持 this 绑定'
      ],
      'CSS-001': [
        '使用 flex 或 grid 布局替代 float',
        '使用 CSS 变量管理颜色和尺寸',
        '提取重复样式到独立类'
      ]
    };

    // Add rule-specific suggestions
    if (ruleSuggestions[ruleId]) {
      suggestions.push(...ruleSuggestions[ruleId]);
    }

    // Context-aware suggestions
    if (reviewContext.issuesByRule[ruleId] && reviewContext.issuesByRule[ruleId].length > 3) {
      suggestions.push(`此问题在代码中出现 ${reviewContext.issuesByRule[ruleId].length} 次，建议全局修复`);
    }

    if (reviewContext.issuesByFile[issue.filePath] && reviewContext.issuesByFile[issue.filePath].length > 5) {
      suggestions.push(`该文件包含多个问题，建议优先重构此文件`);
    }

    // Default suggestion if none available
    if (suggestions.length === 0) {
      suggestions.push('参考最佳实践修改此问题', '查阅相关文档了解详细解决方案');
    }

    return suggestions;
  }

  /**
   * Prioritize issues based on severity and context
   */
  prioritizeIssues(enhancedIssues) {
    const priority = enhancedIssues.map((issue, index) => {
      let score = 0;
      let reason = '';

      // Base score from severity
      const severityScore = { high: 100, medium: 50, low: 20 };
      score += severityScore[issue.severity] || 50;

      // Add score for recurring issues
      if (issue.context.isRecurring) {
        score += 30;
        reason = '重复出现的问题';
      }

      // Add score for files with multiple issues
      if (issue.context.fileHasMultipleIssues && issue.context.fileIssues > 3) {
        score += 20;
        reason = reason ? reason + ', 问题集中文件' : '问题集中文件';
      }

      // Add score for security-related rules
      if (issue.ruleId && (issue.ruleId.includes('SEC') || issue.ruleId.includes('SECURITY'))) {
        score += 50;
        reason = reason ? reason + ', 安全隐患' : '安全隐患';
      }

      return {
        issue: issue.ruleId || index,
        reason: reason || '标准优先级',
        score,
        line: issue.line,
        file: issue.filePath
      };
    });

    // Sort by score descending
    return priority.sort((a, b) => b.score - a.score).map((p, i) => ({
      ...p,
      order: i + 1
    }));
  }

  /**
   * Generate summary of the review
   */
  generateSummary(enhancedIssues, priority, aiAnalysis) {
    const severityCount = { high: 0, medium: 0, low: 0 };
    enhancedIssues.forEach(issue => {
      severityCount[issue.severity] = (severityCount[issue.severity] || 0) + 1;
    });

    const parts = [];
    parts.push(`发现 ${enhancedIssues.length} 个代码问题`);

    if (aiAnalysis && aiAnalysis.aiAnalysis) {
      const { detectedIssues, categories } = aiAnalysis.aiAnalysis;
      if (detectedIssues > 0) {
        parts.push(`其中 ${detectedIssues} 个 AI 智能检测问题`);

        const aiCategories = [];
        if (categories.undefined.count > 0) aiCategories.push(`${categories.undefined.count} 个未定义方法`);
        if (categories.crashes.count > 0) aiCategories.push(`${categories.crashes.count} 个潜在崩溃`);
        if (categories.memory.count > 0) aiCategories.push(`${categories.memory.count} 个内存风险`);
        if (categories.deadCode.count > 0) aiCategories.push(`${categories.deadCode.count} 个无效代码`);
        if (categories.loops.count > 0) aiCategories.push(`${categories.loops.count} 个循环风险`);

        if (aiCategories.length > 0) {
          parts.push(`(${aiCategories.join('、')})`);
        }
      }
    }

    if (severityCount.high > 0) {
      parts.push(`其中 ${severityCount.high} 个高优先级`);
    }
    if (severityCount.medium > 0) {
      parts.push(`${severityCount.medium} 个中优先级`);
    }

    if (priority.length > 0) {
      const topIssue = priority[0];
      parts.push(`建议优先处理: ${topIssue.reason}`);
    }

    return parts.join('，') + '。';
  }

  /**
   * Summarize context for display
   */
  summarizeContext(aiContext) {
    if (!aiContext) return 'No context available';

    const parts = [];

    if (aiContext.code) {
      parts.push(`代码上下文: ${aiContext.code.files?.length || 0} 个文件`);
    }

    if (aiContext.ui) {
      parts.push(`UI 组件: ${aiContext.ui.widgets?.length || 0} 个`);
    }

    if (aiContext.data) {
      parts.push(`数据模型: ${aiContext.data.models?.length || 0} 个`);
    }

    return parts.join(' | ') || 'Basic context';
  }

  /**
   * Group issues by file
   */
  groupIssuesByFile(issues) {
    const grouped = {};
    issues.forEach(issue => {
      if (!grouped[issue.filePath]) {
        grouped[issue.filePath] = [];
      }
      grouped[issue.filePath].push(issue);
    });
    return grouped;
  }

  /**
   * Group issues by rule
   */
  groupIssuesByRule(issues) {
    const grouped = {};
    issues.forEach(issue => {
      if (!grouped[issue.ruleId]) {
        grouped[issue.ruleId] = [];
      }
      grouped[issue.ruleId].push(issue);
    });
    return grouped;
  }
}

module.exports = ReviewTool;
