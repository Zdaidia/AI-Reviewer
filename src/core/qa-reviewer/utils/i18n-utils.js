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
      default:
        try { return parseJsonI18n(content); } catch { return parseDartI18n(content); }
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
  extractDartPairs,
  parseJsonI18n,
  parseArbI18n,
  parseYamlI18n,
  flattenTranslations,
  filterTranslations,
  detectLanguageFromPath,
  extractBalancedBraces,
};