/**
 * TODO Generation & Fixing Module
 *
 * Responsibilities:
 * - Generate TODO comments for code issues
 * - Fix code based on rules
 * - Support batch and single file operations
 *
 * TODO Format:
 * // TODO: [问题ID] 错误原因 - 修改建议
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

class TodoManager {
  constructor() {
    this.fixRules = [];
    // 中文规则描述映射
    this.ruleDescriptions = {
      'JS-001': { reason: '生产代码中使用了 console.log', suggestion: '请移除或使用日志库' },
      'JS-002': { reason: '使用了 var 声明变量', suggestion: '建议使用 const 或 let' },
      'JS-003': { reason: '异步函数缺少错误处理', suggestion: '请使用 try-catch 包裹异步调用' },
      'JS-004': { reason: 'map 缺少 key 属性', suggestion: '请添加唯一 key 属性' },
      'TS-001': { reason: '函数缺少返回类型注解', suggestion: '请添加返回类型注解' },
      'TS-002': { reason: '使用了 any 类型', suggestion: '建议使用 unknown 替代 any' },
      'VUE-001': { reason: 'v-for 缺少 key 属性', suggestion: '请添加 :key 绑定' },
      'VUE-002': { reason: '缺少 prop 验证', suggestion: '请添加 prop 类型验证' },
      'VUE-003': { reason: '模板中使用了 console', suggestion: '请移除调试代码' },
      'CSS-001': { reason: '使用了 !important', suggestion: '建议提高选择器优先级' },
      'CSS-002': { reason: '使用了过时的 flexbox 语法', suggestion: '请更新到现代语法' },
      'DART-001': { reason: '变量使用 var 声明而没有类型', suggestion: '建议使用显式类型注解或 final' },
      'DART-002': { reason: '空的 catch 块', suggestion: '请添加错误处理或日志' },
      'DART-003': { reason: '使用 .then() 而非 async/await', suggestion: '建议使用 async/await 提高可读性' },
      'DART-004': { reason: '生产代码中使用了 print', suggestion: '请移除或使用日志框架' },
      'DART-005': { reason: 'build 方法可使用 const', suggestion: '考虑使用 const 构造函数提高性能' },
      'DART-006': { reason: 'Widget 构造函数可使用 const', suggestion: '考虑使用 const 提高性能' },
      'DART-007': { reason: '函数缺少返回类型注解', suggestion: '请添加返回类型注解' },
      'DART-008': { reason: '使用了 ignore 注解', suggestion: '请检查是否需要忽略' },
      'GEN-001': { reason: '代码质量问题', suggestion: '需要人工审查' }
    };
  }

  /**
   * Load fix rules from YAML file
   * @param {string} rulesPath - Path to fix rules YAML
   */
  loadFixRules(rulesPath) {
    try {
      const fileContent = fs.readFileSync(rulesPath, 'utf8');
      this.fixRules = yaml.load(fileContent) || [];
      console.log(`Loaded ${this.fixRules.length} fix rules from ${rulesPath}`);
      return this.fixRules;
    } catch (error) {
      console.error('Error loading fix rules:', error.message);
      this.fixRules = [];
      return [];
    }
  }

  /**
   * Generate TODO comment for an issue (Chinese format)
   * @param {Object} issue - Issue object from scanner or QA Reviewer
   * @returns {string} TODO comment string
   */
  generateTodo(issue) {
    // 调试日志：检查传入的 issue
    console.log('[TodoManager] generateTodo received issue:', {
      ruleId: issue?.ruleId,
      message: issue?.message,
      suggestion: issue?.suggestion,
      type: typeof issue
    });

    const code = issue.ruleId || 'GEN-001';

    // 优先使用 issue 自己的 message 和 suggestion（这些通常更具体）
    let message = issue.message || '';
    let suggestion = issue.suggestion || issue.hint || '';

    // 如果 issue 的信息为空，尝试从预定义的规则描述中获取
    if (!message || !suggestion) {
      const desc = this.ruleDescriptions[code] || {};
      if (!message) message = desc.reason || '代码问题';
      if (!suggestion) suggestion = desc.suggestion || '需要修复';
    }

    // 如果仍然没有 suggestion，根据规则类型生成默认建议
    if (!suggestion || suggestion === '需要修复') {
      suggestion = this.generateDefaultSuggestion(code, message);
    }

    // 截断过长的内容
    if (message.length > 80) {
      message = message.substring(0, 77) + '...';
    }
    if (suggestion.length > 100) {
      suggestion = suggestion.substring(0, 97) + '...';
    }

    // Check if there's a custom comment in fix rules
    const fixRule = this.fixRules.find(r => r.id === code);
    if (fixRule && fixRule.comment && fixRule.fix) {
      // 如果有自动修复规则，使用更具体的建议
      suggestion = `建议修复: ${fixRule.fix}`;
    }

    return `// TODO: [${code}] ${message} - ${suggestion}`;
  }

  /**
   * Generate default suggestion based on rule type
   */
  generateDefaultSuggestion(ruleId, message) {
    const ruleSuggestions = {
      'JS-001': '请移除或使用日志库替代 console.log',
      'JS-002': '建议使用 const 或 let 替代 var',
      'JS-003': '请使用 try-catch 包裹异步调用',
      'JS-004': '请添加唯一 key 属性',
      'TS-001': '请添加返回类型注解',
      'TS-002': '建议使用具体类型替代 any',
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
      'GEN-001': '需要人工审查具体问题',
    };

    if (ruleSuggestions[ruleId]) {
      return ruleSuggestions[ruleId];
    }

    // 根据消息推断建议
    if (message.includes('print')) {
      return '请移除或使用日志框架替代 print';
    }
    if (message.includes('console')) {
      return '请移除或使用日志库替代 console';
    }
    if (message.includes('未定义') || message.includes('undefined')) {
      return '检查相关定义是否存在';
    }
    if (message.includes('空') || message.includes('null')) {
      return '添加空值检查';
    }

    return '根据具体问题修改代码';
  }

  /**
   * Check if TODO already exists for this line
   * @param {string[]} lines - File lines
   * @param {number} line - Line number (1-based)
   * @param {string} ruleId - Rule ID
   * @returns {boolean} True if TODO already exists
   */
  todoExists(lines, line, ruleId) {
    // Check the line above (where TODO would be inserted)
    const prevLineIndex = line - 2; // line is 1-based, we want to check line-1
    if (prevLineIndex >= 0 && prevLineIndex < lines.length) {
      const prevLine = lines[prevLineIndex].trim();
      return prevLine.includes(`[${ruleId}]`) || prevLine.includes('// TODO:');
    }
    return false;
  }

  /**
   * Insert TODO comment into file (with duplicate check)
   * @param {string} filePath - File path
   * @param {number} line - Line number (1-based)
   * @param {string} todo - TODO comment string
   * @param {Object} issue - Issue object
   * @returns {Object} Result object
   */
  insertTodo(filePath, line, issue) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');

      // Check if TODO already exists
      if (this.todoExists(lines, line, issue.ruleId)) {
        return {
          success: true,
          alreadyExists: true,
          filePath,
          line,
          message: 'TODO 已存在，跳过重复添加'
        };
      }

      // Insert TODO above the specified line
      const todo = this.generateTodo(issue);
      lines.splice(line - 1, 0, todo);

      const newContent = lines.join('\n');
      fs.writeFileSync(filePath, newContent, 'utf8');

      console.log(`[TodoManager] 已添加 TODO 到 ${filePath}:${line}`);
      console.log(`[TodoManager] TODO 内容: ${todo}`);

      return {
        success: true,
        filePath,
        line,
        todo,
        added: true
      };
    } catch (error) {
      console.error(`[TodoManager] 添加 TODO 失败:`, error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Apply fix to a single line
   * @param {string} line - Original line
   * @param {Object} rule - Fix rule
   * @returns {string} Fixed line
   */
  applyFixToLine(line, rule) {
    try {
      const regex = new RegExp(rule.pattern, 'g');
      return line.replace(regex, rule.fix || '');
    } catch (error) {
      console.error(`Error applying fix rule ${rule.id}:`, error.message);
      return line;
    }
  }

  /**
   * Fix issues in a single file
   * @param {string} filePath - File path
   * @param {Array} issues - Array of issues to fix
   * @param {Object} options - Options { addTodo, autoFix }
   * @returns {Object} Result object
   */
  fixFile(filePath, issues, options = {}) {
    const { addTodo = true, autoFix = true } = options;

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      const results = [];
      let modified = false;

      // Sort issues by line number in descending order
      // This prevents line number shifts when inserting TODOs
      const sortedIssues = [...issues].sort((a, b) => b.line - a.line);

      for (const issue of sortedIssues) {
        const lineIndex = issue.line - 1;
        if (lineIndex < 0 || lineIndex >= lines.length) {
          results.push({
            issue,
            success: false,
            error: 'Invalid line number',
          });
          continue;
        }

        const originalLine = lines[lineIndex];
        let newLine = originalLine;
        let lineModified = false;

        // Find fix rule
        const fixRule = this.fixRules.find(r => r.id === issue.ruleId);

        // Add TODO above the line if requested
        if (addTodo) {
          // Check if TODO already exists using the new method
          if (!this.todoExists(lines, issue.line, issue.ruleId)) {
            const todo = this.generateTodo(issue);
            // Only insert if rule specifies insertAbove or addTodo is true
            if (!fixRule || fixRule.insertAbove !== false) {
              lines.splice(lineIndex, 0, todo);
              modified = true;

              // Adjust line index after insertion
              results.push({
                issue,
                success: true,
                action: 'todo_added',
                todo,
              });
            }
          }
        }

        // Apply auto-fix if enabled and rule exists
        if (autoFix && fixRule && fixRule.fix !== undefined) {
          newLine = this.applyFixToLine(originalLine, fixRule);
          if (newLine !== originalLine) {
            lines[lineIndex + (addTodo && !fixRule.insertAbove ? 1 : 0)] = newLine;
            lineModified = true;
            modified = true;
          }
        }

        if (lineModified) {
          results.push({
            issue,
            success: true,
            action: 'fixed',
            original: originalLine,
            fixed: newLine,
          });
        }
      }

      // Write back if modified
      if (modified) {
        const newContent = lines.join('\n');
        fs.writeFileSync(filePath, newContent, 'utf8');
      }

      return {
        success: true,
        filePath,
        modified,
        results,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Batch fix multiple files
   * @param {Array} fileIssues - Array of {filePath, issues}
   * @param {Object} options - Options
   * @returns {Object} Batch result
   */
  fixBatch(fileIssues, options = {}) {
    const results = [];
    const summary = {
      totalFiles: fileIssues.length,
      processedFiles: 0,
      modifiedFiles: 0,
      totalIssues: 0,
      fixedIssues: 0,
      failedIssues: 0,
    };

    for (const { filePath, issues } of fileIssues) {
      if (!issues || issues.length === 0) continue;

      summary.totalIssues += issues.length;
      const result = this.fixFile(filePath, issues, options);
      results.push(result);

      if (result.success) {
        summary.processedFiles++;
        if (result.modified) {
          summary.modifiedFiles++;
        }
        result.results?.forEach(r => {
          if (r.success) summary.fixedIssues++;
          else summary.failedIssues++;
        });
      } else {
        summary.failedIssues += issues.length;
      }
    }

    return {
      success: true,
      summary,
      results,
    };
  }

  /**
   * Remove TODO from file
   * @param {string} filePath - File path
   * @param {number} line - Line number of TODO
   * @returns {Object} Result
   */
  removeTodo(filePath, line) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');

      if (line > 0 && line <= lines.length) {
        const todoLine = lines[line - 1];
        if (todoLine.trim().startsWith('// TODO:')) {
          lines.splice(line - 1, 1);
          const newContent = lines.join('\n');
          fs.writeFileSync(filePath, newContent, 'utf8');
          return { success: true, removed: todoLine };
        }
      }

      return { success: false, error: 'TODO not found at specified line' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get fix rule by ID
   * @param {string} ruleId - Rule ID
   * @returns {Object|null} Fix rule
   */
  getFixRule(ruleId) {
    return this.fixRules.find(r => r.id === ruleId) || null;
  }

  /**
   * Check if an issue can be auto-fixed
   * @param {Object} issue - Issue object
   * @returns {boolean} True if fixable
   */
  canAutoFix(issue) {
    const rule = this.getFixRule(issue.ruleId);
    return rule !== null && rule.fix !== undefined;
  }

  /**
   * Preview fix for an issue
   * @param {string} filePath - File path
   * @param {Object} issue - Issue object
   * @returns {Object} Preview result
   */
  previewFix(filePath, issue) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      const lineIndex = issue.line - 1;

      if (lineIndex < 0 || lineIndex >= lines.length) {
        return { success: false, error: 'Invalid line number' };
      }

      const originalLine = lines[lineIndex];
      const fixRule = this.getFixRule(issue.ruleId);

      if (!fixRule || fixRule.fix === undefined) {
        return {
          success: true,
          canFix: false,
          message: 'No auto-fix available for this issue',
          original: originalLine,
        };
      }

      const fixedLine = this.applyFixToLine(originalLine, fixRule);
      const todo = this.generateTodo(issue);

      return {
        success: true,
        canFix: true,
        rule: fixRule,
        original: originalLine,
        fixed: fixedLine,
        todo,
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = TodoManager;
