/**
 * i18n 解析工具函数
 * 从 segment-executor.js 提取，供 DynamicFileMatcher 和 SegmentExecutor 共用
 */

const fs = require('fs');
const path = require('path');

/**
 * 解析 i18n 文件，支持 JSON/Dart/ARB/YAML 四种格式
 * @param {string} filePath - i18n 文件路径
 * @param {string} projectType - 项目类型 (flutter/vue/react/angular)
 * @returns {Array<{key: string, value: string}>} 翻译条目列表
 */
function parseI18nFile(filePath, projectType = 'flutter') {
  const ext = path.extname(filePath).toLowerCase();

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    switch (ext) {
      case '.json':
        return parseJsonI18n(content);
      case '.dart':
        return parseDartI18n(content);
      case '.arb':
        return parseArbI18n(content);
      case '.yaml':
      case '.yml':
        return parseYamlI18n(content);
      case '.js':
      case '.ts':
        return parseJsTsI18n(content);
      default:
        // 依次尝试各种格式解析
        try { return parseJsonI18n(content); } catch {}
        try { return parseJsTsI18n(content); } catch {}
        try { return parseDartI18n(content); } catch {}
        return [];
    }
  } catch (error) {
    console.error(`[i18n-utils] 解析 i18n 文件失败: ${filePath}`, error.message);
    return [];
  }
}

/**
 * 解析 Dart 格式的 i18n 文件
 * 格式: class LangZh { Map<String, dynamic> langs = { "key": "value", ... }; }
 */
function parseDartI18n(content) {
  const results = [];

  // 提取 langs = { ... } 或 translations = { ... } 中的内容
  const mapPattern = /(?:langs|translations|messages|strings|keys)\s*=\s*(?:<[^>]+>\s*)?\{/g;
  let match;
  while ((match = mapPattern.exec(content)) !== null) {
    const startPos = match.index + match[0].length - 1;
    const mapContent = extractBalancedBraces(content, startPos);
    if (!mapContent) continue;

    // 递归提取嵌套 Map 中的键值对
    extractDartPairs(mapContent, '', results);
  }

  // 兜底：简单 'key': 'value' 模式
  if (results.length === 0) {
    const simplePattern = /['"]([^'"]+)['"]\s*:\s*['"]([^'"]*?)['"]/g;
    let simpleMatch;
    while ((simpleMatch = simplePattern.exec(content)) !== null) {
      results.push({ key: simpleMatch[1], value: simpleMatch[2] });
    }
  }

  // 去重
  const seen = new Set();
  return results.filter(r => {
    if (seen.has(r.key)) return false;
    seen.add(r.key);
    return true;
  });
}

/**
 * 递归提取 Dart Map 中的键值对，处理嵌套
 * @param {string} mapContent - Map 内容字符串
 * @param {string} prefix - 嵌套前缀（如 "administrative_management"）
 * @param {Array} results - 结果收集数组
 */
function extractDartPairs(mapContent, prefix, results) {
  // 匹配 'key': 'value'
  const kvPattern = /['"]([^'"]+)['"]\s*:\s*['"]([^'"]*?)['"]/g;
  let kvMatch;
  while ((kvMatch = kvPattern.exec(mapContent)) !== null) {
    const key = prefix ? `${prefix}.${kvMatch[1]}` : kvMatch[1];
    results.push({ key, value: kvMatch[2] });
  }

  // 处理嵌套 Map：匹配 "parent": { ... }
  const nestedPattern = /['"]([^'"]+)['"]\s*:\s*\{/g;
  let nestedMatch;
  while ((nestedMatch = nestedPattern.exec(mapContent)) !== null) {
    const parentKey = prefix ? `${prefix}.${nestedMatch[1]}` : nestedMatch[1];
    const braceStart = mapContent.indexOf('{', nestedMatch.index + nestedMatch[0].length - 1);
    if (braceStart === -1) continue;
    const nestedContent = extractBalancedBraces(mapContent, braceStart);
    if (!nestedContent) continue;

    extractDartPairs(nestedContent, parentKey, results);
  }
}

/**
 * 解析 JSON 格式的 i18n 文件
 */
function parseJsonI18n(content) {
  const parsed = JSON.parse(content);
  return flattenTranslations(parsed);
}

/**
 * 解析 Vue/React JS/TS 格式的 i18n 文件
 * 格式: export const m = { "common": { "key": "value" }, ... }
 * 或: const messages = { en: { ... }, zh: { ... } }
 */
function parseJsTsI18n(content) {
  // 策略1：提取 export const/var/let xxx = { ... } 中最大的对象块
  const varPattern = /(?:export\s+)?(?:const|var|let)\s+(\w+)\s*=\s*\{/g;
  let match;
  let bestContent = null;
  let bestVarName = null;
  let bestLength = 0;

  while ((match = varPattern.exec(content)) !== null) {
    const braceStart = content.indexOf('{', match.index + match[0].length - 1);
    if (braceStart === -1) continue;
    const blockContent = extractBalancedBraces(content, braceStart);
    if (blockContent && blockContent.length > bestLength) {
      bestContent = blockContent;
      bestVarName = match[1];
      bestLength = blockContent.length;
    }
  }

  if (bestContent) {
    // 递归提取嵌套键值对
    // 使用 extractJsPairs 支持 JS 对象不带引号的 key（如 fms: { ... }）
    // 当顶层变量名是短名或常见 i18n 变量名时，作为 key 前缀
    // 这样 export const m = { fms: { ... } } 扁平化后 key 为 "m.fms.xxx"
    // 与源码中 $t("m.fms.xxx") 的格式一致
    const results = [];
    const prefix = shouldUseVarNameAsPrefix(bestVarName) ? bestVarName : '';
    extractJsPairs(bestContent, prefix, results);
    if (results.length > 0) {
      // 去重
      const seen = new Set();
      return results.filter(r => {
        if (seen.has(r.key)) return false;
        seen.add(r.key);
        return true;
      });
    }
  }

  // 策略2：简单 key-value 模式兜底
  const simplePattern = /['"]([a-zA-Z0-9_.]+)['"]\s*:\s*['"]([^'"]*?)['"]/g;
  const fallbackResults = [];
  let simpleMatch;
  while ((simpleMatch = simplePattern.exec(content)) !== null) {
    fallbackResults.push({ key: simpleMatch[1], value: simpleMatch[2] });
  }

  const seen = new Set();
  return fallbackResults.filter(r => {
    if (seen.has(r.key)) return false;
    seen.add(r.key);
    return true;
  });
}

/**
 * 递归提取 JS/TS 对象中的键值对，处理嵌套
 * 与 extractDartPairs 不同，此函数支持不带引号的 key（JS 对象常见格式）
 * 如: fms: { driver_management: { tx_cancel: "取消" } }
 * 也兼容带引号的 key: "fms": { "driver_management": { ... } }
 * @param {string} mapContent - 对象内容字符串
 * @param {string} prefix - 嵌套前缀（如 "m"）
 * @param {Array} results - 结果收集数组
 */
function extractJsPairs(mapContent, prefix, results) {
  // 策略：先提取顶层嵌套对象，在移除嵌套内容后提取叶子 kv
  // 递归时在内层内容中继续提取

  // 步骤1: 找出顶层嵌套对象（只在当前层级匹配，不深入嵌套内部）
  const nestedObjects = [];
  const nestedKeyPattern = /(?:['"]([^'"]+)['"]|([a-zA-Z_$][a-zA-Z0-9_$]*))\s*:\s*\{/g;
  let nestedMatch;
  while ((nestedMatch = nestedKeyPattern.exec(mapContent)) !== null) {
    const key = nestedMatch[1] || nestedMatch[2];
    const braceStart = mapContent.indexOf('{', nestedMatch.index + nestedMatch[0].length - 1);
    if (braceStart === -1) continue;
    const braceEnd = findMatchingBraceEnd(mapContent, braceStart);
    if (braceEnd === -1) continue;

    const fullParentKey = prefix ? `${prefix}.${key}` : key;
    const nestedContent = mapContent.substring(braceStart + 1, braceEnd);
    nestedObjects.push({
      key: fullParentKey,
      content: nestedContent,
      start: nestedMatch.index,
      end: braceEnd + 1
    });

    // 跳过嵌套对象的内部内容，避免在外层误匹配内层的嵌套 key
    // 将正则搜索位置跳到闭合 } 之后
    nestedKeyPattern.lastIndex = braceEnd + 1;
  }

  // 步骤2: 递归提取嵌套对象的内容
  for (const obj of nestedObjects) {
    extractJsPairs(obj.content, obj.key, results);
  }

  // 步骤3: 在移除嵌套对象后的内容中提取叶子 kv
  let cleanedContent = mapContent;
  for (let i = nestedObjects.length - 1; i >= 0; i--) {
    const obj = nestedObjects[i];
    cleanedContent = cleanedContent.substring(0, obj.start) + cleanedContent.substring(obj.end);
  }

  const kvPattern = /(?:['"]([^'"]+)['"]|([a-zA-Z_$][a-zA-Z0-9_$]*))\s*:\s*['"]([^'"]*?)['"]/g;
  let kvMatch;
  while ((kvMatch = kvPattern.exec(cleanedContent)) !== null) {
    const key = kvMatch[1] || kvMatch[2];
    const fullKey = prefix ? `${prefix}.${key}` : key;
    results.push({ key: fullKey, value: kvMatch[3] });
  }
}

/**
 * 找到匹配的闭合大括号位置
 * @param {string} content - 字符串内容
 * @param {number} startBrace - 开始大括号位置
 * @returns {number} 闭合大括号位置，找不到返回 -1
 */
function findMatchingBraceEnd(content, startBrace) {
  let depth = 0;
  let inString = false;
  let escapeNext = false;
  let stringChar = '';

  for (let i = startBrace; i < content.length; i++) {
    const ch = content[i];

    if (escapeNext) { escapeNext = false; continue; }
    if (ch === '\\') { escapeNext = true; continue; }

    // 字符串状态跟踪
    if (!inString && (ch === "'" || ch === '"' || ch === '`')) {
      inString = true;
      stringChar = ch;
      continue;
    }
    if (inString && ch === stringChar) {
      inString = false;
      stringChar = '';
      continue;
    }
    if (inString) continue;

    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

/**
 * 判断顶层变量名是否应作为 key 前缀
 * 规则：短名（≤3字符）或常见 i18n 变量名作为前缀
 * Vue 项目中 export const m = { ... } 格式，源码 $t("m.xxx") 需要 m 前缀
 * 长变量名（如 DriverManagementForm）通常不是 key 前缀的一部分
 * @param {string} varName - 顶层变量名
 * @returns {boolean} 是否应作为 key 前缀
 */
function shouldUseVarNameAsPrefix(varName) {
  if (!varName) return false;
  // 单字母或短名作为前缀（如 m, t, en, zh）
  if (varName.length <= 3) return true;
  // 常见 i18n 变量名
  const i18nVarNames = ['messages', 'langs', 'translations', 'i18n', 'locale', 'locales', 'strings', 'text', 'texts', 'content'];
  return i18nVarNames.includes(varName.toLowerCase());
}

/**
 * 解析 ARB 格式 (Flutter localization)，过滤 @@ 元数据键
 */
function parseArbI18n(content) {
  const parsed = JSON.parse(content);
  const results = [];
  for (const [key, value] of Object.entries(parsed)) {
    if (!key.startsWith('@')) {
      results.push({ key, value: String(value) });
    }
  }
  return results;
}

/**
 * 简易 YAML 解析（不依赖外部库）
 */
function parseYamlI18n(content) {
  const results = [];
  const lines = content.split('\n');
  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const kvMatch = line.match(/^(\s*)([\w.-]+)\s*:\s*"?(.*?)"?\s*$/);
    if (kvMatch && kvMatch[3]) {
      results.push({ key: kvMatch[2], value: kvMatch[3] });
    }
  }
  return results;
}

/**
 * 递归展平嵌套翻译对象
 * @param {Object} obj - 嵌套翻译对象
 * @param {string} prefix - 嵌套前缀
 * @returns {Array<{key: string, value: string}>} 展平后的翻译条目
 */
function flattenTranslations(obj, prefix = '') {
  const results = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      results.push({ key: fullKey, value });
    } else if (typeof value === 'object' && value !== null) {
      results.push(...flattenTranslations(value, fullKey));
    }
  }
  return results;
}

/**
 * 过滤翻译结果
 * @param {Array} translations - 翻译条目列表
 * @param {Array} keys - 要查找的 key 列表
 * @param {string} search - 搜索关键词（匹配 key 或 value）
 * @returns {Array} 过滤后的翻译条目（最多300条）
 */
function filterTranslations(translations, keys, search) {
  if (!keys && !search) {
    return translations.slice(0, 300);
  }

  let filtered = translations;

  if (keys && keys.length > 0) {
    filtered = filtered.filter(t =>
      keys.includes(t.key) ||
      keys.some(k => t.key.startsWith(k + '.') || t.key.endsWith('.' + k))
    );
  }

  if (search) {
    const searchLower = search.toLowerCase();
    filtered = filtered.filter(t =>
      t.key.toLowerCase().includes(searchLower) ||
      t.value.toLowerCase().includes(searchLower)
    );
  }

  return filtered.slice(0, 300);
}

/**
 * 从文件路径检测语言代码
 */
function detectLanguageFromPath(filePath) {
  const basename = path.basename(filePath, path.extname(filePath));
  const langMatch = basename.match(/^([a-z]{2,3}(?:_[A-Z]{2})?)$/i);
  return langMatch ? langMatch[1] : basename;
}

/**
 * 提取平衡的大括号内容（用于 Dart Map 解析）
 */
function extractBalancedBraces(content, startBraceIndex) {
  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = startBraceIndex; i < content.length; i++) {
    const ch = content[i];

    if (escapeNext) { escapeNext = false; continue; }
    if (ch === '\\') { escapeNext = true; continue; }
    if (ch === "'") { inString = !inString; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;

    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return content.substring(startBraceIndex + 1, i);
      }
    }
  }
  return null;
}

module.exports = {
  parseI18nFile,
  parseDartI18n,
  parseJsTsI18n,
  shouldUseVarNameAsPrefix,
  extractDartPairs,
  extractJsPairs,
  parseJsonI18n,
  parseArbI18n,
  parseYamlI18n,
  flattenTranslations,
  filterTranslations,
  detectLanguageFromPath,
  extractBalancedBraces,
};