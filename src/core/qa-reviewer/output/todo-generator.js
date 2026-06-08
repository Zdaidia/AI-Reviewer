/**
 * TODO 注释生成器
 *
 * 生成符合用户要求的 TODO 注释格式：
 * //TODO: [问题详情及原因] - 建议修复方案及原因
 */

class TODOGenerator {
  constructor(options = {}) {
    this.format = options.format || '//TODO: [{ruleId}] {description} - {suggestion}';
  }

  /**
   * 为单个问题生成 TODO 注释
   */
  generateTODO(issue) {
    const { ruleId, message, suggestion, requirement } = issue;

    // 构建问题描述（不截断）
    let description = message || '';

    // 添加原因（如果有需求引用，不截断）
    if (requirement) {
      description += ` (需求: ${requirement})`;
    }

    // 构建建议（不截断）
    let fixSuggestion = suggestion || '需要修复';

    // 生成 TODO（不截断，允许换行）
    const todo = `//TODO: [${ruleId}] ${description} - ${fixSuggestion}`;

    // 如果 TODO 太长，可以拆分成多行
    const maxLength = 200; // 单行最大长度
    if (todo.length > maxLength) {
      // 简单拆分：在第一个空格或破折号处拆分
      const firstPart = todo.substring(0, maxLength);
      const lastSpace = Math.max(
        firstPart.lastIndexOf(' '),
        firstPart.lastIndexOf('-')
      );
      if (lastSpace > maxLength / 2) {
        return todo.substring(0, lastSpace) + '\n//TODO: ' + todo.substring(lastSpace + 1).trim();
      }
    }

    return todo;
  }

  /**
   * 为文件生成 TODO 注释列表
   * 按行号降序排列，避免插入时偏移问题
   * 支持增强定位信息（location）
   */
  generateTODOsForFile(filePath, issues) {
    const fs = require('fs');

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');

      // 按行号降序排序
      const sortedIssues = [...issues].sort((a, b) => (b.line || 0) - (a.line || 0));

      const todos = [];

      for (const issue of sortedIssues) {
        let lineIndex = (issue.line || 1) - 1;

        // 使用增强定位信息精确定位
        if (issue.location) {
          const preciseLine = this.findPreciseLine(lines, lineIndex, issue.location);
          if (preciseLine >= 0) {
            lineIndex = preciseLine;
          } else {
            // 如果精确定位失败，使用启发式定位
            lineIndex = this.heuristicLineFinder(lines, lineIndex, issue);
          }
        } else {
          // 如果没有 location，使用启发式定位
          lineIndex = this.heuristicLineFinder(lines, lineIndex, issue);
        }

        if (lineIndex >= 0 && lineIndex < lines.length) {
          const line = lines[lineIndex];
          const indent = line.match(/^\s*/)[0];

          // 生成 TODO
          const todo = this.generateTODO(issue);
          todos.push({
            ruleId: issue.ruleId,
            line: lineIndex + 1,
            indent: indent,
            todo: indent + todo,
          });
        }
      }

      return todos;
    } catch (error) {
      console.warn(`[TODOGenerator] 无法处理文件: ${filePath}`);
      return [];
    }
  }

  /**
   * 启发式行号查找（当 location 不存在或定位失败时使用）
   * @param {Array} lines - 文件行数组
   * @param {number} defaultLineIndex - 默认行索引
   * @param {Object} issue - 问题对象
   * @returns {number} 调整后的行索引
   */
  heuristicLineFinder(lines, defaultLineIndex, issue) {
    const { message, ruleId } = issue;
    const lineContent = lines[defaultLineIndex] || '';

    console.log(`[TODOGenerator] 启发式定位: ruleId=${ruleId}, 默认行=${defaultLineIndex + 1}`);

    // 启发式规则 1: 如果默认行是函数调用，尝试找到函数定义
    const functionCallMatch = lineContent.match(/(\w+)\s*\(/);
    if (functionCallMatch) {
      const calledFuncName = functionCallMatch[1];
      console.log(`[TODOGenerator] 检测到函数调用: ${calledFuncName}，尝试查找定义`);

      // 在附近搜索函数定义
      const searchRange = 50;
      const start = Math.max(0, defaultLineIndex - searchRange);
      const end = Math.min(lines.length, defaultLineIndex + searchRange);

      for (let i = start; i < end; i++) {
        const line = lines[i].trim();
        // 匹配函数定义（后面跟 { 或 =>）
        if (line.includes(`${calledFuncName}(`) &&
            (line.includes('{') || line.includes('=>'))) {
          console.log(`[TODOGenerator] ✓ 启发式找到函数定义: 第 ${i + 1} 行`);
          // 返回函数定义的上一行
          return i > 0 ? i - 1 : i;
        }
      }
    }

    // 启发式规则 2: 如果问题描述提到"方法"或"函数"，提取函数名并查找
    const functionMention = message.match(/(\w+)\s*[方法函数]/);
    if (functionMention) {
      const mentionedFuncName = functionMention[1];
      console.log(`[TODOGenerator] 问题中提到函数: ${mentionedFuncName}，尝试查找`);

      const searchRange = 100;
      const start = Math.max(0, defaultLineIndex - searchRange);
      const end = Math.min(lines.length, defaultLineIndex + searchRange);

      for (let i = start; i < end; i++) {
        const line = lines[i].trim();
        if (line.includes(`${mentionedFuncName}(`) &&
            (line.includes('{') || line.includes('=>'))) {
          console.log(`[TODOGenerator] ✓ 从问题描述找到函数定义: 第 ${i + 1} 行`);
          return i > 0 ? i - 1 : i;
        }
      }
    }

    // 启发式规则 3: 如果默认行是方法内部的某一行，向上查找第一个空行后的行
    // （通常是方法定义的开始）
    if (defaultLineIndex > 0) {
      let foundEmptyLine = false;
      for (let i = defaultLineIndex - 1; i >= 0; i--) {
        if (lines[i].trim() === '') {
          foundEmptyLine = true;
        } else if (foundEmptyLine) {
          // 找到空行后的第一个非空行，通常是方法定义
          console.log(`[TODOGenerator] ✓ 启发式找到方法定义: 第 ${i + 1} 行`);
          return i;
        }
      }
    }

    console.log(`[TODOGenerator] 启发式定位失败，使用默认行: 第 ${defaultLineIndex + 1} 行`);
    return defaultLineIndex;
  }

  /**
   * 使用增强定位信息精确查找插入行
   * @param {Array} lines - 文件行数组
   * @param {number} defaultLineIndex - 默认行索引
   * @param {Object} location - 增强定位信息
   * @returns {number} 精确的行索引
   */
  findPreciseLine(lines, defaultLineIndex, location) {
    const { function: funcName, class: className, anchor, insertPosition } = location;

    console.log(`[TODOGenerator] findPreciseLine 被调用: function=${funcName}, class=${className}, anchor=${anchor ? anchor.substring(0, 20) + '...' : 'none'}, line=${defaultLineIndex + 1}`);

    // 策略 1: 如果有 anchor（定位点文本），优先使用
    if (anchor) {
      const anchorLine = this.findLineByAnchor(lines, defaultLineIndex, anchor, insertPosition);
      if (anchorLine >= 0) {
        console.log(`[TODOGenerator] ✓ 通过 anchor 找到位置: 第 ${anchorLine + 1} 行`);
        return anchorLine;
      }
      console.log(`[TODOGenerator] ✗ 通过 anchor 未找到位置`);
    }

    // 策略 2: 如果有函数名，查找函数定义
    if (funcName) {
      const funcLine = this.findLineByFunction(lines, defaultLineIndex, funcName, className);
      if (funcLine >= 0) {
        // 找到函数定义后，根据 insertPosition 调整
        if (insertPosition === 'before') {
          // 在函数定义的上一行插入 TODO
          const targetLine = funcLine > 0 ? funcLine - 1 : funcLine;
          console.log(`[TODOGenerator] ✓ 通过 function 找到位置: 第 ${funcLine + 1} 行，TODO 将插入在第 ${targetLine + 1} 行`);
          return targetLine;
        } else if (insertPosition === 'after') {
          console.log(`[TODOGenerator] ✓ 通过 function 找到位置: 第 ${funcLine + 1} 行，TODO 将插入在第 ${funcLine + 1} 行之后`);
          return funcLine;
        } else {
          console.log(`[TODOGenerator] ✓ 通过 function 找到位置: 第 ${funcLine + 1} 行`);
          return funcLine;
        }
      }
      console.log(`[TODOGenerator] ✗ 通过 function 未找到位置`);
    }

    // 策略 3: 如果有类名，查找类定义
    if (className) {
      const classLine = this.findLineByClass(lines, defaultLineIndex, className);
      if (classLine >= 0) {
        console.log(`[TODOGenerator] ✓ 通过 class 找到位置: 第 ${classLine + 1} 行`);
        return classLine;
      }
      console.log(`[TODOGenerator] ✗ 通过 class 未找到位置`);
    }

    // 策略 4: 回退到默认行号
    console.log(`[TODOGenerator] ⚠️ 使用默认行号: 第 ${defaultLineIndex + 1} 行`);
    return defaultLineIndex;
  }

  /**
   * 通过定位点文本查找行
   */
  findLineByAnchor(lines, startIndex, anchor, insertPosition) {
    const searchRange = 20; // 在起始行附近搜索
    const start = Math.max(0, startIndex - searchRange);
    const end = Math.min(lines.length, startIndex + searchRange);

    for (let i = start; i < end; i++) {
      if (lines[i].includes(anchor)) {
        // 根据 insertPosition 调整
        if (insertPosition === 'after') {
          return i; // 在该行之后插入（即返回该行索引，插入时会+1）
        } else if (insertPosition === 'replace') {
          return i; // 替换该行
        } else {
          // before（默认），在该行之前插入
          return i > 0 ? i - 1 : i;
        }
      }
    }
    return -1;
  }

  /**
   * 通过函数名查找行
   */
  findLineByFunction(lines, startIndex, funcName, className) {
    const searchRange = 100; // 增加搜索范围
    const start = Math.max(0, startIndex - searchRange);
    const end = Math.min(lines.length, startIndex + searchRange);

    // 匹配函数定义模式（只匹配定义，不匹配调用）
    const patterns = [
      // Dart 格式: Future<Type> methodName( 或 Type methodName(
      // ⚠️ 关键：后面必须跟 { 或 =，不能是 ;
      new RegExp(`(?:[\\w<>\\[\\],\\s]+\\s+)?${funcName}\\s*\\([^)]*\\)\\s*\\{`),
      new RegExp(`(?:[\\w<>\\[\\],\\s]+\\s+)?${funcName}\\s*\\([^)]*\\)\\s*=>`),
      // JavaScript/TypeScript 格式：function methodName( 或 methodName: ( =>
      new RegExp(`(?:async\\s+)?function\\s+${funcName}\\s*\\([^)]*\\)\\s*\\{`),
      new RegExp(`${funcName}\\s*:\\s*\\([^)]*\\)\\s*\\{`),
      new RegExp(`${funcName}\\s*:\\s*\\([^)]*\\)\\s*=>`),
      // 箭头函数：const methodName = ( =>
      new RegExp(`${funcName}\\s*=\\s*\\([^)]*\\)\\s*=>`),
    ];

    for (let i = start; i < end; i++) {
      const line = lines[i].trim();

      // 跳过注释行
      if (line.startsWith('//') || line.startsWith('*') || line.startsWith('/*')) {
        continue;
      }

      // 跳过纯调用行（包含 ; 或 , 但没有 { 或 =）
      if (line.includes(`${funcName}(`) && (line.includes(';') || line.includes(','))) {
        // 检查是否同时包含定义特征
        const hasDefPattern = patterns.some(p => p.test(line));
        if (!hasDefPattern) {
          continue; // 纯调用行，跳过
        }
      }

      for (const pattern of patterns) {
        if (pattern.test(line)) {
          // 如果有类名，检查是否在类中
          if (className) {
            const classStart = this.findClassStart(lines, i);
            const classLine = this.findLineByClass(lines, i, className);
            if (classLine >= 0 && classStart <= classLine && classLine <= i) {
              console.log(`[TODOGenerator] 找到函数定义: ${funcName} 在第 ${i + 1} 行`);
              return i;
            }
          } else {
            console.log(`[TODOGenerator] 找到函数定义: ${funcName} 在第 ${i + 1} 行`);
            return i;
          }
        }
      }
    }

    console.log(`[TODOGenerator] 未找到函数定义: ${funcName} (搜索范围: ${start}-${end})`);
    return -1;
  }

  /**
   * 通过类名查找行
   */
  findLineByClass(lines, startIndex, className) {
    const searchRange = 100;
    const start = Math.max(0, startIndex - searchRange);
    const end = Math.min(lines.length, startIndex + searchRange);

    const patterns = [
      new RegExp(`class\\s+${className}\\b`),  // class ClassName
      new RegExp(`class\\s+${className}\\s+extends`),  // class ClassName extends
      new RegExp(`class\\s+_${className}\\s*\\{`),  // class _ClassName {
    ];

    for (let i = start; i < end; i++) {
      for (const pattern of patterns) {
        if (pattern.test(lines[i])) {
          return i;
        }
      }
    }
    return -1;
  }

  /**
   * 查找类定义的起始行
   */
  findClassStart(lines, lineIndex) {
    for (let i = lineIndex; i >= 0; i--) {
      if (/\bclass\s+/.test(lines[i])) {
        return i;
      }
    }
    return -1;
  }

  /**
   * 将 TODO 注释写入文件
   */
  async applyTODOsToFile(issuesByFile) {
    const fs = require('fs');

    let totalAdded = 0;
    let totalSkipped = 0;

    for (const [filePath, fileIssues] of Object.entries(issuesByFile)) {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');

        // 生成 TODO 列表（已按行号降序排序）
        const todos = this.generateTODOsForFile(filePath, fileIssues);

        if (todos.length === 0) {
          continue;
        }

        // 插入 TODO 注释
        let modified = false;
        for (const todo of todos) {
          const issue = fileIssues.find(i => i.ruleId === todo.ruleId);
          const insertPosition = issue?.location?.insertPosition || 'before';
          const lineIndex = todo.line - 1;

          // 检查是否已存在 TODO
          const existingLine = lines[lineIndex];
          if (existingLine && existingLine.includes(`TODO: [${issue.ruleId}]`)) {
            totalSkipped++;
            continue;
          }

          // 根据插入位置处理
          if (insertPosition === 'replace') {
            // 替换该行
            lines[lineIndex] = todo.todo + '  // ' + lines[lineIndex].trim();
          } else if (insertPosition === 'after') {
            // 在该行之后插入
            lines.splice(lineIndex + 1, 0, todo.todo);
          } else {
            // before（默认），在该行之前插入
            lines.splice(lineIndex, 0, todo.todo);
          }

          totalAdded++;
          modified = true;
        }

        if (modified) {
          fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
          console.log(`[TODOGenerator] 已添加 ${todos.length} 个 TODO 到 ${filePath}`);
        }
      } catch (error) {
        console.warn(`[TODOGenerator] 无法写入文件: ${filePath}`, error.message);
      }
    }

    return { added: totalAdded, skipped: totalSkipped };
  }

  /**
   * 从代码中移除 TODO 注释
   */
  async removeTODOs(filePath) {
    const fs = require('fs');

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');

      // 过滤掉 TODO 行
      const filtered = lines.filter(line => {
        return !line.trim().startsWith('//TODO:');
      });

      if (filtered.length < lines.length) {
        fs.writeFileSync(filePath, filtered.join('\n'), 'utf8');
        return { removed: lines.length - filtered.length };
      }

      return { removed: 0 };
    } catch (error) {
      console.warn(`[TODOGenerator] 无法处理文件: ${filePath}`, error.message);
      return { removed: 0, error: error.message };
    }
  }

  /**
   * 统计文件中的 TODO 注释
   */
  countTODOs(filePath) {
    const fs = require('fs');

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');

      let count = 0;
      const todos = [];

      for (const line of lines) {
        const match = line.match(/\/\/TODO:\s*\[([^\]]+)\]/);
        if (match) {
          count++;
          todos.push({
            ruleId: match[1],
            line: line,
          });
        }
      }

      return { count, todos };
    } catch (error) {
      return { count: 0, todos: [], error: error.message };
    }
  }

  /**
   * 截断文本
   */
  truncate(text, maxLength) {
    if (text.length <= maxLength) {
      return text;
    }
    return text.substring(0, maxLength - 3) + '...';
  }

  /**
   * 设置格式模板
   */
  setFormat(format) {
    this.format = format;
  }
}

module.exports = TODOGenerator;
