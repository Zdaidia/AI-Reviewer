/**
 * 需求分析模块 - 健壮 JSON 解析器
 *
 * 三层解析策略（独立实现，避免与 segment-executor 循环依赖）：
 * 1. cleanJsonString - 预处理清洗（注释、尾随逗号、非法转义）
 * 2. parseJsonWithRepair - 自修复解析（直接parse→文本剥离→截断修复→逐字符修复）
 * 3. 纯文本回退 - JSON彻底失败时返回文本格式
 */

class RobustJSONParser {
  /**
   * 解析数组格式的 JSON 响应
   * @param {string|object} response - LLM 响应
   * @returns {Array|null} 解析后的数组，失败返回 null
   */
  parseArray(response) {
    if (typeof response !== 'string') {
      if (Array.isArray(response)) return response;
      if (response && typeof response === 'object') {
        return response.questions || response.questionList || response.issues || null;
      }
      return null;
    }

    try {
      return this._parseJsonString(response);
    } catch (e) {
      console.warn(`[RobustJSONParser] 数组解析失败: ${e.message}`);
      return null;
    }
  }

  /**
   * 解析对象格式的 JSON 响应
   * @param {string|object} response - LLM 响应
   * @returns {Object|null} 解析后的对象，失败返回 null
   */
  parseObject(response) {
    if (typeof response !== 'string') {
      if (response && typeof response === 'object') return response;
      return null;
    }

    try {
      return this._parseJsonString(response);
    } catch (e) {
      console.warn(`[RobustJSONParser] 对象解析失败: ${e.message}`);
      return null;
    }
  }

  /**
   * 解析响应，返回结构化结果（JSON或文本格式）
   * @param {string|object} response - LLM 响应
   * @returns {Object} { format: 'json'|'text'|'markdown', content, data }
   */
  parseResponse(response) {
    if (typeof response !== 'string') {
      if (response && typeof response === 'object') {
        return { format: 'json', content: JSON.stringify(response), data: response };
      }
      return { format: 'text', content: String(response), data: null };
    }

    // 尝试 JSON 解析
    try {
      const data = this._parseJsonString(response);
      return { format: 'json', content: JSON.stringify(data), data };
    } catch (e) {
      // 回退到文本格式
      console.warn(`[RobustJSONParser] 回退到文本格式: ${e.message}`);
      return { format: 'text', content: response, data: null };
    }
  }

  /**
   * 核心解析流程：提取JSON → 清洗 → 自修复
   * @private
   */
  _parseJsonString(response) {
    // 1. 提取 JSON 片段
    let jsonStr = response;

    // 尝试匹配完整的 ```json ... ``` 代码块
    const jsonBlockMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonBlockMatch) {
      jsonStr = jsonBlockMatch[1];
    } else {
      // 尝试匹配只有开头 ```json 但没有结尾 ``` 的情况（LLM 截断输出）
      const openJsonMatch = response.match(/```json\s*([\s\S]*)/);
      if (openJsonMatch) {
        // 从 ```json 后面的内容中提取 JSON 数组/对象
        const afterJson = openJsonMatch[1];
        const isArray = afterJson.match(/\[[\s\S]*\]/);
        const isObject = afterJson.match(/\{[\s\S]*\}/);
        if (isArray) {
          jsonStr = isArray[0];
        } else if (isObject) {
          jsonStr = isObject[0];
        } else {
          jsonStr = afterJson;
        }
      } else {
        // 没有 ```json 标记，直接提取 JSON 数组/对象
        const isArray = response.match(/\[[\s\S]*\]/);
        const isObject = response.match(/\{[\s\S]*\}/);
        if (isArray) {
          jsonStr = isArray[0];
        } else if (isObject) {
          jsonStr = isObject[0];
        }
      }
    }

    // 2. 清洗
    jsonStr = this.cleanJsonString(jsonStr);

    // 3. 自修复解析
    return this.parseJsonWithRepair(jsonStr);
  }

  /**
   * 第一层：预处理清洗
   * 移除注释、尾随逗号、修复非法转义、清理控制字符
   */
  cleanJsonString(jsonStr) {
    let cleaned = jsonStr;

    // 移除单行注释
    cleaned = cleaned.replace(/\/\/[^\n]*\n/g, '\n');

    // 移除多行注释
    cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');

    // 移除尾随逗号（} 或 ] 前的逗号）
    cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');

    // 修复非法 JSON 转义字符
    // 交替匹配：\\（合法，保留）或 \X（非法，补反斜杠）
    cleaned = cleaned.replace(/\\\\|\\(?!["\\\/bfnrtu])/g, function(match) {
      if (match.length === 2) return match;
      return '\\\\';
    });

    // 修复无效 Unicode 转义 \uXXXX
    cleaned = cleaned.replace(/\\u(?![0-9a-fA-F]{4})/g, function() {
      return '\\\\u';
    });

    // 清理控制字符（保留 \t \n \r）
    cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    return cleaned.trim();
  }

  /**
   * 第二层：自修复解析
   * 四级递进：直接parse → 文本剥离 → 截断修复 → 逐字符修复
   */
  parseJsonWithRepair(jsonStr) {
    // 第一级：直接尝试
    try {
      return JSON.parse(jsonStr);
    } catch (firstError) {
      console.warn(`[RobustJSONParser] 首次 JSON.parse 失败: ${firstError.message}`);
    }

    // 第二级：文本剥离（提取首个 {/} 或 [/] 之间的内容）
    const startsWithArray = jsonStr.trimStart().startsWith('[');
    const firstOpen = startsWithArray ? jsonStr.indexOf('[') : jsonStr.indexOf('{');
    const lastClose = startsWithArray ? jsonStr.lastIndexOf(']') : jsonStr.lastIndexOf('}');
    const expectedClose = startsWithArray ? ']' : '}';

    if (firstOpen >= 0 && lastClose > firstOpen) {
      const stripped = jsonStr.substring(firstOpen, lastClose + 1);
      try {
        return JSON.parse(stripped);
      } catch (e) { /* 继续下一级 */ }
    }

    // 第三级：截断修复（检测未闭合括号，自动追加闭合符号）
    const openBrackets = { '{': '}', '[': ']' };
    const closeBrackets = { '}': '{', ']': '[' };
    let bracketStack = [];
    let inString = false;
    let escapeNext = false;

    for (let i = 0; i < jsonStr.length; i++) {
      const ch = jsonStr[i];
      if (escapeNext) { escapeNext = false; continue; }
      if (ch === '\\' && inString) { escapeNext = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (!inString) {
        if (ch in openBrackets) bracketStack.push(ch);
        if (ch in closeBrackets) {
          if (bracketStack.length > 0 && bracketStack[bracketStack.length - 1] === closeBrackets[ch]) {
            bracketStack.pop();
          }
        }
      }
    }

    if (bracketStack.length > 0 && firstOpen >= 0 && lastClose >= 0) {
      let repaired = jsonStr.substring(firstOpen, lastClose + 1);
      // 移除尾部不完整内容（最后30字符窗口内的逗号或冒号）
      const lastComma = repaired.lastIndexOf(',');
      const lastColon = repaired.lastIndexOf(':');
      const lastBadPos = Math.max(lastComma, lastColon);
      if (lastBadPos > repaired.length - 30 && lastBadPos > 0) {
        repaired = repaired.substring(0, lastBadPos);
      }
      // 闭合所有未闭合的括号
      while (bracketStack.length > 0) {
        repaired += openBrackets[bracketStack.pop()];
      }
      try {
        return JSON.parse(repaired);
      } catch (e) {
        console.warn(`[RobustJSONParser] 截断修复失败: ${e.message}`);
      }
    }

    // 第四级：逐字符级修复（最多30轮）
    let charRepaired = jsonStr;
    let lastError = null;

    for (let attempt = 0; attempt < 30; attempt++) {
      try {
        return JSON.parse(charRepaired);
      } catch (e) {
        lastError = e;
        const posMatch = e.message.match(/position\s+(\d+)/);
        if (!posMatch) break;

        const pos = parseInt(posMatch[1]);
        if (pos >= charRepaired.length) break;

        const char = charRepaired[pos];
        const prevChar = pos > 0 ? charRepaired[pos - 1] : '';

        // 非法转义序列：在反斜杠前补反斜杠
        if (prevChar === '\\' && e.message.includes('escaped')) {
          charRepaired = charRepaired.substring(0, pos - 1) + '\\' + charRepaired.substring(pos - 1);
        }
        // 无效 Unicode 转义
        else if (prevChar === 'u' && pos >= 2 && charRepaired[pos - 2] === '\\' && e.message.includes('Unicode')) {
          charRepaired = charRepaired.substring(0, pos - 2) + '\\' + charRepaired.substring(pos - 2);
        }
        // 反斜杠本身在错误位置
        else if (char === '\\') {
          charRepaired = charRepaired.substring(0, pos) + '\\' + charRepaired.substring(pos);
        }
        // 单引号或反引号替换为双引号
        else if (char === "'" || char === '`') {
          charRepaired = charRepaired.substring(0, pos) + '"' + charRepaired.substring(pos + 1);
        }
        // 控制字符移除
        else if (char && char.charCodeAt(0) < 0x20) {
          charRepaired = charRepaired.substring(0, pos) + charRepaired.substring(pos + 1);
        }
        // 其他未知问题：移除该字符
        else {
          charRepaired = charRepaired.substring(0, pos) + charRepaired.substring(pos + 1);
        }
      }
    }

    throw lastError || new Error('JSON 修复失败');
  }
}

module.exports = RobustJSONParser;