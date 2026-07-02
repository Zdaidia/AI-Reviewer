/**
 * DynamicFileMatcher - 动态文件匹配模块
 * 核心链路：文字 → 找到使用该文字的页面 → 查找路由 → 确定模块 → 收集相关文件
 *
 * 优先级：i18n精确匹配 → 直接grep → TEST_CONTEXT → CODE_GRAPH关键词 → 前端回退
 */

const fs = require('fs');
const path = require('path');
const { parseI18nFile, flattenTranslations, extractBalancedBraces } = require('../utils/i18n-utils');
const { inferFileType } = require('../utils/file-type-utils');
const { DATA_DIR } = require('../../config/data-dir');

const QA_DIR_NAME = '.dev-qa';

class DynamicFileMatcher {
  constructor() {
    this.projectPath = null;
    this.projectType = null;
    this.codeGraph = null;
    this.testContext = null;
    this.i18nCache = null;          // { hasI18n: boolean, files: string[], translations: [{key, value}] }
    this.routeMap = null;            // Map<routePath, {routeName, pageClass, pageFilePath, bindingFilePath, controllerPaths, providerPaths}>
    this.i18nKeyToFilesCache = null; // Map<i18nKey, [filePath]>
    this.classToFilePathCache = null; // Map<className, filePath>
    this.menuRouteMap = null;        // Map<i18nKey, routeName> — 菜单项匹配（i18n key → 路由名）
    this._initialized = false;
    this._codeGraphMtime = null;
  }

  /**
   * 初始化：加载所有数据源
   */
  async initialize(projectPath) {
    this.projectPath = projectPath;

    // 1. 加载 CODE_GRAPH
    await this.loadCodeGraph();

    // 2. 检测项目类型
    this.projectType = this.detectProjectType();

    // 3. 发现并解析 i18n 文件
    this.buildI18nCache();

    // 4. 预扫描源码中的 i18n key 使用
    this.buildI18nKeyToFilesCache();

    // 5. 解析菜单配置（i18n key → route 名）
    this.buildMenuRouteMap();

    // 6. 构建类名 → 文件路径缓存（必须在 routeMap 之前，因为路由解析需要查找类名对应的文件路径）
    this.buildClassToFilePathCache();

    // 7. 解析路由配置
    this.buildRouteMap();

    // 8. 加载 TEST_CONTEXT
    this.loadTestContext();

    this._initialized = true;
    console.log(`[DynamicFileMatcher] 初始化完成: projectType=${this.projectType}, hasI18n=${this.i18nCache?.hasI18n}, menuRouteMap=${this.menuRouteMap?.size}条, routeMap=${this.routeMap?.size}条, testContext=${this.testContext?.features?.length || 0}个功能点`);
  }

  /**
   * 检查缓存是否过期（CODE_GRAPH 文件修改时间变化时重新初始化）
   */
  isStale() {
    if (!this._initialized) return true;
    const cgPath = this.findScanFilePath('.code-graph.json');
    if (!cgPath || !fs.existsSync(cgPath)) return true;
    const mtime = fs.statSync(cgPath).mtimeMs;
    return mtime !== this._codeGraphMtime;
  }

  /**
   * 查找扫描文件路径（优先 DATA_DIR 主位置，回退项目 .dev-qa/）
   */
  findScanFilePath(fileName) {
    const folderName = path.basename(this.projectPath);

    // 优先：DATA_DIR/AI_Scan_file/{folderName}/（新主位置）
    const primaryDir = path.join(DATA_DIR, 'AI_Scan_file', folderName);
    const primaryPath = path.join(primaryDir, fileName);
    if (fs.existsSync(primaryPath)) return primaryPath;

    // 回退：项目目录 .dev-qa/（旧位置兼容）
    const projectDir = path.join(this.projectPath, QA_DIR_NAME);
    const projectFilePath = path.join(projectDir, fileName);
    if (fs.existsSync(projectFilePath)) return projectFilePath;

    // 回退：带项目名前缀的旧格式
    const legacyPath = path.join(primaryDir, `${folderName}_${fileName}`);
    if (fs.existsSync(legacyPath)) return legacyPath;

    return null;
  }

  // ==================== 核心匹配方法 ====================

  /**
   * 从文案匹配文件 — 核心入口
   * @param {string} text - 需求文案或页面名称
   * @returns {{ files: Array<{path, name, type}>, trace: Array<string>, method: string }}
   */
  matchFilesFromText(text) {
    if (!this._initialized) {
      return { files: [], trace: ['未初始化'], method: 'none' };
    }

    const trace = [];
    const cleanText = this.cleanSearchText(text);
    trace.push(`输入文案: "${text}" → 清理后: "${cleanText}"`);

    // 1. i18n精确匹配（首选）
    const i18nResult = this.matchViaI18n(cleanText, text);
    if (i18nResult.files.length >= 1) {
      trace.push(...i18nResult.trace);
      return { files: i18nResult.files, trace, method: 'i18n' };
    }
    trace.push(`i18n匹配失败: ${i18nResult.trace[i18nResult.trace.length - 1]}`);

    // 2. 直接grep（无i18n项目）
    if (!this.i18nCache || !this.i18nCache.hasI18n) {
      const grepResult = this.matchViaGrep(cleanText, text);
      if (grepResult.files.length >= 1) {
        trace.push(...grepResult.trace);
        return { files: grepResult.files, trace, method: 'grep' };
      }
      trace.push(`grep匹配失败: ${grepResult.trace[grepResult.trace.length - 1]}`);
    }

    // 3. TEST_CONTEXT匹配
    const tcResult = this.matchViaTestContext(cleanText, text);
    if (tcResult.files.length >= 1) {
      trace.push(...tcResult.trace);
      return { files: tcResult.files, trace, method: 'testcontext' };
    }
    trace.push(`TEST_CONTEXT匹配失败: ${tcResult.trace[tcResult.trace.length - 1]}`);

    // 4. CODE_GRAPH关键词搜索
    const cgResult = this.matchViaCodeGraph(cleanText, text);
    if (cgResult.files.length >= 1) {
      trace.push(...cgResult.trace);
      return { files: cgResult.files, trace, method: 'codegraph' };
    }
    trace.push(`CODE_GRAPH匹配失败`);

    // 5. 全部失败
    return { files: [], trace, method: 'fallback' };
  }

  // ==================== i18n精确匹配 ====================

  matchViaI18n(cleanText, originalText) {
    const trace = [];

    if (!this.i18nCache || !this.i18nCache.hasI18n) {
      trace.push('项目无i18n文件');
      return { files: [], trace };
    }

    // 步骤1: 在 i18n 翻译条目中搜索匹配文案
    // 使用 normalizeForMatch 去除空格差异，允许 "L.1.1欠費" 匹配 "L.1.1 欠費"
    const matchedEntries = [];
    const textNormalized = this.normalizeForMatch(cleanText);
    const textLower = cleanText.toLowerCase();

    // 精确匹配层级（只取最精确的层级，避免短词误匹配）
    // Level 1: i18n value 标准化后完全等于文案标准化后的文本
    for (const entry of this.i18nCache.translations) {
      const valueNormalized = this.normalizeForMatch(entry.value);
      if (valueNormalized === textNormalized) {
        matchedEntries.push({ ...entry, matchType: 'exact_full' });
      }
    }

    // Level 2: i18n value 标准化后包含文案标准化后的文本
    if (matchedEntries.length === 0) {
      for (const entry of this.i18nCache.translations) {
        const valueNormalized = this.normalizeForMatch(entry.value);
        if (valueNormalized.includes(textNormalized) || textNormalized.includes(valueNormalized)) {
          // 防止短词误匹配：只有当匹配部分足够长才保留
          const overlapLen = Math.min(valueNormalized.length, textNormalized.length);
          const minLen = /[一-龥]/.test(entry.value) ? 4 : 6;
          if (overlapLen >= minLen) {
            matchedEntries.push({ ...entry, matchType: 'exact_contains' });
          }
        }
      }
    }

    // Level 3: 部分匹配 — 最长中文子串搜索（只在前面全部失败时使用）
    if (matchedEntries.length === 0) {
      const substrings = this.extractChineseSubstrings(originalText);
      // 只用最长的子串（最精确）
      const longestSubstr = substrings.sort((a, b) => b.length - a.length)[0];
      if (longestSubstr && longestSubstr.length >= 3) {
        for (const entry of this.i18nCache.translations) {
          if (this.normalizeForMatch(entry.value).includes(this.normalizeForMatch(longestSubstr))) {
            matchedEntries.push({ ...entry, matchType: 'partial' });
          }
        }
      }
    }

    if (matchedEntries.length === 0) {
      trace.push('i18n: 未找到匹配的翻译条目');
      return { files: [], trace };
    }

    // 按匹配精度分组：只使用最精确层级的结果
    // 如果有 exact_full，不再用其他层级
    const bestMatchType = matchedEntries[0]?.matchType;
    let filteredEntries;
    if (matchedEntries.some(e => e.matchType === 'exact_full')) {
      filteredEntries = matchedEntries.filter(e => e.matchType === 'exact_full');
    } else if (matchedEntries.some(e => e.matchType === 'exact_contains')) {
      filteredEntries = matchedEntries.filter(e => e.matchType === 'exact_contains');
    } else {
      filteredEntries = matchedEntries;
    }

    // 同级别按 value 长度排序（越长越精确），然后去重取前5个
    const sorted = filteredEntries.sort((a, b) => b.value.length - a.value.length);
    const uniqueKeys = [...new Set(sorted.map(e => e.key))].slice(0, 5);
    trace.push(`i18n: 匹配到${filteredEntries.length}个条目(层级:${bestMatchType})，key: ${uniqueKeys.join(', ')}`);

    // 步骤2: 优先从菜单配置获取精确的路由→文件映射
    if (this.menuRouteMap && this.menuRouteMap.size > 0) {
      for (const i18nKey of uniqueKeys) {
        const routeNameOrPath = this.menuRouteMap.get(i18nKey);
        if (routeNameOrPath) {
          trace.push(`i18n: 从菜单配置找到 key "${i18nKey}" → route "${routeNameOrPath}"`);

          // 从 routeMap 中查找该路由对应的路由信息
          // 优先按 routeName 匹配，回退按 routePath 匹配（菜单可能只存了路径basename）
          let foundRouteInfo = null;
          for (const [routePath, routeInfo] of this.routeMap) {
            if (routeInfo.routeName === routeNameOrPath) {
              foundRouteInfo = routeInfo;
              break;
            }
            // 回退：routeNameOrPath 可能是 path 的 basename，检查路径匹配
            if (routePath === routeNameOrPath || routePath.endsWith('/' + routeNameOrPath)) {
              foundRouteInfo = routeInfo;
              break;
            }
          }

          if (foundRouteInfo) {
            const moduleFiles = new Map();
            // 页面文件
            if (foundRouteInfo.pageFilePath) moduleFiles.set(foundRouteInfo.pageFilePath, 'view');
            // Binding 文件
            if (foundRouteInfo.bindingFilePath) moduleFiles.set(foundRouteInfo.bindingFilePath, 'binding');
            // Controller 文件
            for (const cp of foundRouteInfo.controllerPaths) moduleFiles.set(cp, 'controller');
            // Provider/API 文件
            for (const pp of foundRouteInfo.providerPaths) moduleFiles.set(pp, 'service');

            if (moduleFiles.size > 0) {
              // 通过 import 扩展页面和 controller 的依赖
              const expanded = this.expandViaRouteAndImports(moduleFiles);
              trace.push(`i18n: 菜单→路由→获取到${moduleFiles.size}个核心文件，扩展后${expanded.size}个文件`);
              return {
                files: Array.from(expanded.entries()).map(([p, t]) => ({ path: p, name: path.basename(p), type: t })),
                trace,
              };
            }
          }
        }
      }
    }

    // 步骤3: 菜单匹配失败时，用 grep 搜索源码中使用 i18n key 的文件
    const pageFiles = new Map();
    for (const i18nKey of uniqueKeys) {
      const filesUsingKey = this.findFilesUsingI18nKey(i18nKey);
      for (const filePath of filesUsingKey) {
        const fileType = inferFileType(filePath, this.projectType);
        pageFiles.set(filePath, fileType);
      }
      // 找到文件后立即尝试扩展，如果足够就停止
      if (pageFiles.size > 0) {
        const expanded = this.expandViaRouteAndImports(pageFiles);
        if (expanded.size >= 3) {
          trace.push(`i18n: key "${i18nKey}" 找到${pageFiles.size}个页面文件，扩展后${expanded.size}个文件`);
          return {
            files: Array.from(expanded.entries()).map(([p, t]) => ({ path: p, name: path.basename(p), type: t })),
            trace,
          };
        }
      }
    }
    trace.push(`i18n: 找到${pageFiles.size}个页面文件，但扩展不足3个`);

    if (pageFiles.size === 0) {
      trace.push('i18n: 无页面文件使用匹配的key');
      return { files: [], trace };
    }

    // 对收集到的文件做最终扩展
    const expanded = this.expandViaRouteAndImports(pageFiles);
    trace.push(`i18n: 最终通过路由/依赖扩展到${expanded.size}个文件`);

    return {
      files: Array.from(expanded.entries()).map(([p, t]) => ({ path: p, name: path.basename(p), type: t })),
      trace,
    };
  }

  // ==================== 直接grep（无i18n项目） ====================

  matchViaGrep(cleanText, originalText) {
    const trace = [];

    // 仅用于无i18n项目
    if (this.i18nCache && this.i18nCache.hasI18n) {
      trace.push('项目有i18n，跳过直接grep');
      return { files: [], trace };
    }

    const searchTexts = this.extractSearchableText(originalText);
    trace.push(`grep: 搜索关键词: ${searchTexts.join(', ')}`);

    const sourceDir = this.getSourceDirectory();
    if (!sourceDir || !fs.existsSync(sourceDir)) {
      trace.push('grep: 源码目录不存在');
      return { files: [], trace };
    }

    const pageFiles = new Map();
    const sourceFiles = this.listFilesRecursively(sourceDir, this.getSourceExtensions());

    for (const filePath of sourceFiles) {
      const fileType = inferFileType(filePath, this.projectType);
      if (['i18n', 'test', 'generated', 'config'].includes(fileType)) continue;

      try {
        const content = fs.readFileSync(filePath, 'utf8');
        for (const searchStr of searchTexts) {
          if (content.includes(searchStr)) {
            pageFiles.set(filePath, fileType);
            break;
          }
        }
      } catch (e) { /* 跳过不可读文件 */ }
    }

    trace.push(`grep: 找到${pageFiles.size}个包含文案的页面文件`);

    if (pageFiles.size === 0) {
      return { files: [], trace };
    }

    const expanded = this.expandViaRouteAndImports(pageFiles);
    trace.push(`grep: 扩展到${expanded.size}个文件`);

    return {
      files: Array.from(expanded.entries()).map(([p, t]) => ({ path: p, name: path.basename(p), type: t })),
      trace,
    };
  }

  // ==================== TEST_CONTEXT匹配 ====================

  matchViaTestContext(cleanText, originalText) {
    const trace = [];

    if (!this.testContext || !this.testContext.features) {
      trace.push('TEST_CONTEXT未加载');
      return { files: [], trace };
    }

    // 构建搜索关键词 — 优先用 i18n 分组名桥接中文到英文
    const searchKeywords = this.buildTestContextSearchKeywords(cleanText, originalText);
    trace.push(`testcontext: 搜索关键词: ${searchKeywords.join(', ')}`);

    const moduleFiles = new Map();

    for (const feature of this.testContext.features) {
      const featureNameLower = (feature.name || '').toLowerCase();
      const featureRoute = (feature.route || '').toLowerCase();

      const isMatch = searchKeywords.some(kw =>
        featureNameLower.includes(kw) || kw.includes(featureNameLower) ||
        featureRoute.includes(kw)
      );

      if (!isMatch) continue;

      trace.push(`testcontext: 匹配功能点 "${feature.name}"`);

      // 从功能点提取文件（修复版：处理字符串数组格式）
      // 查找页面文件
      const pageNames = [feature.name + 'Page', feature.name + 'Screen', feature.name + 'View', feature.name];
      for (const pageName of pageNames) {
        const pageFilePath = this.findFileForClassName(pageName);
        if (pageFilePath) {
          moduleFiles.set(pageFilePath, 'view');
          break;
        }
      }

      // 查找控制器文件
      if (feature.controllers && Array.isArray(feature.controllers)) {
        for (const ctrlRef of feature.controllers) {
          const ctrlName = typeof ctrlRef === 'string' ? ctrlRef : ctrlRef.name;
          if (ctrlName) {
            const ctrlFilePath = this.findFileForClassName(ctrlName);
            if (ctrlFilePath) {
              moduleFiles.set(ctrlFilePath, 'controller');
            }
          }
        }
      }

      // 找到了至少一个文件就返回（不再继续搜索其他功能点）
      if (moduleFiles.size > 0) {
        const expanded = this.expandViaRouteAndImports(moduleFiles);
        trace.push(`testcontext: 扩展到${expanded.size}个文件`);
        return {
          files: Array.from(expanded.entries()).map(([p, t]) => ({ path: p, name: path.basename(p), type: t })),
          trace,
        };
      }
    }

    trace.push('testcontext: 未找到匹配的功能点');
    return { files: [], trace };
  }

  // ==================== CODE_GRAPH关键词搜索 ====================

  matchViaCodeGraph(cleanText, originalText) {
    const trace = [];

    if (!this.codeGraph || !this.codeGraph.nodes) {
      trace.push('CODE_GRAPH未加载');
      return { files: [], trace };
    }

    // 用 i18n 分组名桥接提取英文关键词
    const englishKeywords = this.extractEnglishKeywordsFromText(cleanText, originalText);
    trace.push(`codegraph: 英文关键词: ${englishKeywords.join(', ')}`);

    if (englishKeywords.length === 0) {
      trace.push('codegraph: 无法提取英文关键词');
      return { files: [], trace };
    }

    // 通用泛词过滤：前端项目中这些词几乎出现在所有文件名中，不能作为独立匹配依据
    const GENERIC_WORDS = [
      'list', 'view', 'page', 'data', 'info', 'item', 'detail', 'search',
      'add', 'edit', 'create', 'delete', 'update', 'form', 'index', 'home',
      'main', 'setting', 'config', 'log', 'table', 'modal', 'dialog',
      'menu', 'nav', 'header', 'footer', 'layout', 'component', 'wrapper',
      'container', 'card', 'panel', 'tab', 'btn', 'input', 'select',
    ];
    const genericSet = new Set(GENERIC_WORDS);

    // 分离泛词和精确词
    const preciseKeywords = englishKeywords.filter(kw => !genericSet.has(kw.toLowerCase()));
    const genericKeywords = englishKeywords.filter(kw => genericSet.has(kw.toLowerCase()));
    trace.push(`codegraph: 精确关键词: ${preciseKeywords.join(', ') || '(无)'}, 泛词: ${genericKeywords.join(', ') || '(无)'}`);

    const matchedFiles = new Map();
    for (const node of this.codeGraph.nodes) {
      const filePath = node.filePath || node.file || '';
      if (!filePath) continue;

      const fileName = path.basename(filePath).toLowerCase();
      const normalPath = filePath.replace(/\\/g, '/').toLowerCase();
      const nodeName = (node.name || '').toLowerCase();

      let matchedPreciseCount = 0;
      let matchedGenericCount = 0;

      for (const kw of englishKeywords) {
        const kwLower = kw.toLowerCase();
        const isGeneric = genericSet.has(kwLower);

        // 精确匹配：文件名前缀匹配、路径中包含目录名、节点名包含
        if (fileName.startsWith(`${kwLower}.`) ||
            fileName.startsWith(`${kwLower}_`) ||
            fileName.startsWith(`${kwLower}-`) ||
            normalPath.includes(`/${kwLower}/`) ||
            nodeName.includes(kwLower)) {
          if (isGeneric) matchedGenericCount++;
          else matchedPreciseCount++;
          continue;
        }

        // 泛词只在前缀匹配或目录名匹配时才算命中（不使用 includes）
        if (isGeneric) continue;

        // 精确词可以使用 includes（精确词足够特殊）
        if (fileName.includes(kwLower) || nodeName.includes(kwLower)) {
          matchedPreciseCount++;
        }
      }

      // 匹配条件：有精确词命中时，至少匹配1个精确词
      // 只有泛词时（无精确词），需要至少2个泛词组合匹配
      let isMatch = false;
      if (preciseKeywords.length > 0) {
        isMatch = matchedPreciseCount >= 1;
      } else {
        isMatch = matchedGenericCount >= 2;
      }

      if (isMatch) {
        const fileType = inferFileType(filePath, this.projectType);
        if (fileType !== 'test' && fileType !== 'generated' && fileType !== 'i18n' && fileType !== 'config') {
          matchedFiles.set(filePath, fileType);
        }
      }
    }

    trace.push(`codegraph: 直接匹配${matchedFiles.size}个文件`);

    if (matchedFiles.size === 0) {
      // 模糊匹配：关键词前缀（仅对精确关键词）
      for (const node of this.codeGraph.nodes) {
        const filePath = node.filePath || node.file || '';
        if (!filePath) continue;
        const fileType = inferFileType(filePath, this.projectType);
        if (!['view', 'controller', 'component'].includes(fileType)) continue;

        const fileName = path.basename(filePath).toLowerCase();
        for (const kw of preciseKeywords) {
          if (kw.length >= 3) {
            const partial = kw.substring(0, Math.min(6, kw.length));
            if (fileName.includes(partial)) {
              matchedFiles.set(filePath, fileType);
              break;
            }
          }
        }
      }
      trace.push(`codegraph: 模糊匹配后${matchedFiles.size}个文件`);
    }

    if (matchedFiles.size === 0) {
      return { files: [], trace };
    }

    const expanded = this.expandViaRouteAndImports(matchedFiles);
    trace.push(`codegraph: 扩展到${expanded.size}个文件`);

    return {
      files: Array.from(expanded.entries()).map(([p, t]) => ({ path: p, name: path.basename(p), type: t })),
      trace,
    };
  }

  // ==================== 辅助方法 ====================

  /**
   * 清理搜索文本：去除"规格"等无意义的尾缀，保留编号和核心文案
   */
  cleanSearchText(text) {
    return text
      .replace(/\s*[^\s：:]*[：:]\s*$/g, '') // 去除末尾的"词+冒号"（如"規格："）
      .trim();
  }

  /**
   * 标准化文本用于比较：去除空格差异（i18n value 可能有空格而用户文案没有）
   */
  normalizeForMatch(text) {
    return text.replace(/\s+/g, '').toLowerCase();
  }

  /**
   * 提取中文子串（≥2字符）
   */
  extractChineseSubstrings(text) {
    const chinese = text.match(/[一-龥㐀-䶿]+/g) || [];
    return chinese.filter(w => w.length >= 2);
  }

  /**
   * 提取可搜索文本片段（无i18n项目用）
   */
  extractSearchableText(text) {
    const cleaned = this.cleanSearchText(text);
    const chinese = cleaned.match(/[一-龥㐀-䶿]+/g) || [];
    const english = cleaned.match(/[a-zA-Z]{2,}/g) || [];
    return [...chinese.filter(w => w.length >= 2), ...english];
  }

  /**
   * 从文案提取英文关键词 — 通过 i18n 分组名桥接
   */
  extractEnglishKeywordsFromText(cleanText, originalText) {
    const keywords = new Set();

    // 提取文案中的英文词
    const englishWords = originalText.match(/[a-zA-Z]{2,}/g) || [];
    englishWords.forEach(w => keywords.add(w.toLowerCase()));

    // i18n桥接：找到文案匹配的 i18n 条目，从分组名提取英文标识词
    if (this.i18nCache && this.i18nCache.hasI18n) {
      const textLower = (cleanText || originalText).toLowerCase();
      const substrings = this.extractChineseSubstrings(originalText);

      for (const entry of this.i18nCache.translations) {
        const valueLower = entry.value.toLowerCase();
        let matched = false;
        if (textLower && valueLower.includes(textLower)) matched = true;
        if (!matched) {
          for (const substr of substrings) {
            if (valueLower.includes(substr.toLowerCase())) { matched = true; break; }
          }
        }

        if (matched && entry.key) {
          // 从 key 提取分组名和标识词
          // key 格式如 "administrative_management.l_arrear_data_export_tit"
          const parts = entry.key.split('.');
          // 分组名（第一个 . 之前的部分）
          const groupName = parts[0];
          if (groupName && /^[a-z_]+$/.test(groupName)) {
            keywords.add(groupName);
            // 从分组名提取标识词（按下划线分割）
            groupName.split('_').filter(w => w.length >= 3).forEach(w => keywords.add(w));
          }
          // 从具体 key 的标识部分提取词
          if (parts.length > 1) {
            const specificKey = parts[parts.length - 1];
            // 去除 l_ 前缀等常见 i18n key 前缀
            const cleanedKey = specificKey.replace(/^l_|^lbl_|^txt_|^msg_/i, '');
            cleanedKey.split('_').filter(w => w.length >= 3).forEach(w => keywords.add(w));
          }
        }
      }
    }

    // 从 TEST_CONTEXT feature.name 提取 PascalCase 关键词
    if (this.testContext && this.testContext.features) {
      const substrings = this.extractChineseSubstrings(originalText);
      for (const feature of this.testContext.features) {
        // feature.name 是 PascalCase 如 "ArrearDataExport"
        const nameLower = (feature.name || '').toLowerCase();
        for (const substr of substrings) {
          // 尝试在 i18n 中找到这个子串对应的 feature
          // 如果 i18n 有分组名匹配 feature.name 的首词，则关联
          const firstWord = feature.name.match(/^[A-Z][a-z]*/)?.[0]?.toLowerCase() || '';
          if (firstWord && keywords.has(firstWord)) {
            // feature.name 中的每个 PascalCase 词段
            const pascalWords = feature.name.match(/[A-Z][a-z]+/g) || [];
            pascalWords.forEach(w => keywords.add(w.toLowerCase()));
          }
        }
      }
    }

    return Array.from(keywords);
  }

  /**
   * 构建 TEST_CONTEXT 搜索关键词
   */
  buildTestContextSearchKeywords(cleanText, originalText) {
    const keywords = new Set();

    // i18n 桥接提取的英文关键词
    const englishKw = this.extractEnglishKeywordsFromText(cleanText, originalText);
    englishKw.forEach(kw => keywords.add(kw));

    // 中文关键词的小写形式（TEST_CONTEXT route 字段可能包含）
    const chinese = this.extractChineseSubstrings(originalText);
    chinese.forEach(w => keywords.add(w.toLowerCase()));

    // 原始文本的小写形式
    keywords.add(originalText.toLowerCase().trim());

    return Array.from(keywords);
  }

  /**
   * 查找使用 i18n key 的源文件
   */
  findFilesUsingI18nKey(i18nKey) {
    // 优先从缓存查找（支持带顶层对象名前缀和不带前缀两种格式）
    if (this.i18nKeyToFilesCache) {
      // 1. 直接匹配（如 "device_alert.tx_header_camera"）
      if (this.i18nKeyToFilesCache.has(i18nKey)) {
        return this.i18nKeyToFilesCache.get(i18nKey);
      }
      // 2. 带前缀匹配（源码中可能是 "m.device_alert.tx_header_camera"，缓存中可能只存了完整形式）
      for (const [cachedKey, files] of this.i18nKeyToFilesCache) {
        // cachedKey 是源码中的完整 key（如 "m.device_alert.tx_header_camera"）
        // i18nKey 是扁平化后的 key（如 "device_alert.tx_header_camera"）
        if (cachedKey === i18nKey || cachedKey.endsWith('.' + i18nKey)) {
          return files;
        }
      }
      // 3. Namespace 前缀匹配：叶子 key 的父级 namespace 也能匹配
      // 如 i18nKey = "m.fms.driver_management.tx_cancel"
      // 也查找 "m.fms.driver_management" (namespace key) 对应的文件
      // 这样当源码使用 $t("m.fms.driver_management") 只传入 namespace key 时也能找到
      const dotParts = i18nKey.split('.');
      for (let i = dotParts.length - 1; i >= 2; i--) {
        const nsKey = dotParts.slice(0, i).join('.');
        if (this.i18nKeyToFilesCache.has(nsKey)) {
          return this.i18nKeyToFilesCache.get(nsKey);
        }
        // 也尝试 endsWith 回退匹配（namespace key 可能带额外前缀）
        for (const [cachedKey, files] of this.i18nKeyToFilesCache) {
          if (cachedKey.endsWith('.' + nsKey)) {
            return files;
          }
        }
      }
    }

    // 实时 grep 搜索
    const results = [];
    const pattern = this.getI18nUsagePattern(i18nKey);
    if (!pattern) return results;

    const sourceDir = this.getSourceDirectory();
    if (!sourceDir || !fs.existsSync(sourceDir)) return results;

    const sourceFiles = this.listFilesRecursively(sourceDir, this.getSourceExtensions());

    for (const filePath of sourceFiles) {
      const fileType = inferFileType(filePath, this.projectType);
      if (['i18n', 'test', 'generated', 'config'].includes(fileType)) continue;

      try {
        const content = fs.readFileSync(filePath, 'utf8');
        if (pattern.test(content)) {
          results.push(filePath);
        }
      } catch (e) { /* 跳过不可读文件 */ }
    }

    return results;
  }

  /**
   * 构建 i18n key 使用模式正则表达式
   */
  getI18nUsagePattern(i18nKey) {
    const escaped = i18nKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Vue 项目中 i18n key 可能带顶层对象名前缀（如 "m.device_alert.tx_header_camera"）
    // 而扁平化后的 key 是 "device_alert.tx_header_camera"，所以正则需要允许前缀
    const escapedWithOptionalPrefix = `(?:[a-zA-Z_]+\\.)*${escaped}`;

    switch (this.projectType) {
      case 'flutter':
        // 'key'.tr 或 key.tr
        return new RegExp(`['"]${escaped}['"]\\.tr|${escaped}\\.tr`);
      case 'vue':
        // 基础模式：$t('key') / $t('prefix.key') / i18n.t('key') / this.$t('key') / t('key')
        const callPatterns = `\\$t|this\\.\\$t|i18n\\.t|t`;
        const fullPattern = `${callPatterns}\\(['"]${escapedWithOptionalPrefix}['"]\\)`;

        // Namespace 前缀匹配：也搜索叶子 key 的各级 namespace 前缀
        // 如搜索 "m.fms.driver_management.tx_cancel" 时，也能匹配 $t("m.fms.driver_management")
        const nsPatterns = [];
        if (escaped.includes('.')) {
          const parts = i18nKey.split('.');
          // 从最短2级 namespace 到完整 key 的各级前缀
          for (let i = 2; i <= parts.length; i++) {
            const nsKey = parts.slice(0, i).join('.');
            const nsEscaped = nsKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const nsEscapedWithPrefix = `(?:[a-zA-Z_]+\\.)*${nsEscaped}`;
            nsPatterns.push(`${callPatterns}\\(['"]${nsEscapedWithPrefix}['"]\\)`);
          }
        }

        const allPatterns = nsPatterns.length > 0
          ? [fullPattern, ...nsPatterns].join('|')
          : fullPattern;
        return new RegExp(allPatterns);
      case 'react':
        // t('key')
        return new RegExp(`t\\(['"]${escapedWithOptionalPrefix}['"]\\)`);
      case 'angular':
        // 'key' | translate 或 i18n="key"
        return new RegExp(`['"]${escaped}['"]\\s*\\|\\s*translate|i18n="${escaped}"`);
      default:
        // 通用：搜索包含 key 的字符串
        return new RegExp(`['"]${escaped}['"]`);
    }
  }

  /**
   * 通过路由和 import 扩展文件列表
   */
  expandViaRouteAndImports(pageFiles) {
    const expanded = new Map(pageFiles);

    // 步骤1: 从页面文件查找路由相关信息
    for (const [pagePath, pageType] of pageFiles) {
      if (!['view', 'page'].includes(pageType)) continue;

      // 在 routeMap 中查找与该页面文件关联的路由
      for (const [routePath, routeInfo] of this.routeMap) {
        if (routeInfo.pageFilePath === pagePath) {
          // 添加路由绑定的所有相关文件
          if (routeInfo.bindingFilePath) expanded.set(routeInfo.bindingFilePath, 'binding');
          for (const cp of routeInfo.controllerPaths) expanded.set(cp, 'controller');
          for (const pp of routeInfo.providerPaths) expanded.set(pp, 'service');
        }
      }

      // 步骤2: 从 import 语句递归收集依赖
      const importDeps = this.findImportDependencies(pagePath);
      for (const dep of importDeps) {
        expanded.set(dep.filePath, dep.fileType);
      }
    }

    return expanded;
  }

  /**
   * 从文件 import 语句递归收集依赖（最多2层）
   */
  findImportDependencies(startFilePath) {
    const deps = [];
    const maxDepth = 2;
    const visited = new Set();
    const queue = [{ file: startFilePath, depth: 0 }];

    while (queue.length > 0) {
      const { file: currentFile, depth } = queue.shift();
      if (depth >= maxDepth || visited.has(currentFile)) continue;
      visited.add(currentFile);

      if (!fs.existsSync(currentFile)) continue;

      try {
        const content = fs.readFileSync(currentFile, 'utf8');
        const imports = this.parseImportsForDependencies(currentFile, content);

        for (const importPath of imports) {
          const targetFile = this.resolveImportToFilePath(importPath, currentFile);
          if (targetFile && !visited.has(targetFile)) {
            const fileType = inferFileType(targetFile, this.projectType);
            if (['model', 'service', 'api', 'binding', 'provider', 'controller', 'component', 'view'].includes(fileType)) {
              deps.push({ filePath: targetFile, fileType });
              if (['model', 'service', 'binding', 'controller'].includes(fileType)) {
                queue.push({ file: targetFile, depth: depth + 1 });
              }
            }
          }
        }
      } catch (e) { /* 跳过不可读文件 */ }
    }

    return deps;
  }

  /**
   * 解析 import 语句（简化版，用于依赖收集）
   */
  parseImportsForDependencies(filePath, content) {
    const imports = [];
    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.dart') {
      const pattern = /import\s+['"]([^'"]+)['"]/g;
      let match;
      while ((match = pattern.exec(content)) !== null) {
        imports.push(match[1]);
      }
    } else if (['.js', '.jsx', '.ts', '.tsx', '.vue'].includes(ext)) {
      const patterns = [
        /import\s+(?:(?:\{[^}]*\}|\*\s*as\s+\w+|\w+)\s+from\s+)?['"]([^'"]+)['"]/g,
        /require\(['"]([^'"]+)['"]\)/g,
      ];
      for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(content)) !== null) {
          imports.push(match[1]);
        }
      }
    }

    return imports;
  }

  /**
   * 将 import 路径解析为实际文件路径
   */
  resolveImportToFilePath(importPath, fromFilePath) {
    // 跳过核心库
    if (importPath.startsWith('dart:')) return null;

    // Dart package: 格式 — 优先将 package 路径转换为文件系统路径，回退到缓存查找
    if (importPath.startsWith('package:')) {
      const pathWithoutPackage = importPath.substring(8);
      const parts = pathWithoutPackage.split('/');
      const packageName = parts[0];

      // 优先：直接将 package 路径转换为文件系统路径（package:xxx/yyy → lib/yyy）
      // CODE_GRAPH 中的 filePath 可能不准确，但文件系统路径是可靠的
      if (this.projectPath && packageName) {
        const relativePath = parts.slice(1).join('/');
        const directPath = path.join(this.projectPath, 'lib', relativePath);
        if (fs.existsSync(directPath)) return directPath;
        // 尝试常见扩展名
        const extensions = this.getSourceExtensions();
        for (const ext of extensions) {
          if (fs.existsSync(directPath + ext)) return directPath + ext;
        }
      }

      // 回退：在 classToFilePathCache 中查找（CODE_GRAPH 可能路径不准确）
      const searchName = parts[parts.length - 1];
      const baseName = path.basename(searchName.toLowerCase(), path.extname(searchName).toLowerCase());
      return this.classToFilePathCache?.get(searchName.toLowerCase()) ||
             this.classToFilePathCache?.get(baseName) ||
             null;
    }

    // 相对路径 — 解析为绝对路径后检查文件是否存在
    if (importPath.startsWith('.')) {
      if (!fromFilePath) return null;
      const fromDir = path.dirname(fromFilePath);
      const resolvedPath = path.resolve(fromDir, importPath);
      // 尝试直接路径
      if (fs.existsSync(resolvedPath)) return resolvedPath;
      // 尝试添加扩展名（Dart import 通常不带 .dart 扩展名）
      const extensions = this.getSourceExtensions();
      for (const ext of extensions) {
        if (fs.existsSync(resolvedPath + ext)) return resolvedPath + ext;
      }
      return null;
    }

    // 其他格式 — 提取文件名在缓存中查找
    const importParts = importPath.replace(/\\/g, '/').split('/');
    const searchName = importParts[importParts.length - 1];
    const baseName = path.basename(searchName.toLowerCase(), path.extname(searchName).toLowerCase());
    return this.classToFilePathCache?.get(searchName.toLowerCase()) ||
           this.classToFilePathCache?.get(baseName) ||
           null;
  }

  /**
   * 从类名查找文件路径
   */
  findFileForClassName(className) {
    return this.classToFilePathCache?.get(className) || null;
  }

  // ==================== 初始化子方法 ====================

  async loadCodeGraph() {
    try {
      const codeGraphPath = this.findScanFilePath('.code-graph.json');

      if (codeGraphPath) {
        this.codeGraph = JSON.parse(fs.readFileSync(codeGraphPath, 'utf8'));
        this._codeGraphMtime = fs.statSync(codeGraphPath).mtimeMs;
        console.log(`[DynamicFileMatcher] CODE_GRAPH已加载 (${codeGraphPath})，节点数: ${this.codeGraph?.nodes?.length || 0}`);
      } else {
        console.warn(`[DynamicFileMatcher] CODE_GRAPH不存在：项目 .dev-qa/ 和旧 DATA_DIR 位置都找不到`);
        this.codeGraph = null;
      }
    } catch (e) {
      console.warn(`[DynamicFileMatcher] 加载CODE_GRAPH失败: ${e.message}`);
      this.codeGraph = null;
    }
  }

  detectProjectType() {
    // 复用 main.js 中的 detectProjectType 逻辑
    const configFiles = {
      flutter: ['pubspec.yaml'],
      vue: ['package.json'],
      react: ['package.json'],
      angular: ['angular.json'],
    };

    for (const [type, files] of Object.entries(configFiles)) {
      for (const configFile of files) {
        const configPath = path.join(this.projectPath, configFile);
        if (fs.existsSync(configPath)) {
          if (type === 'vue' || type === 'react') {
            try {
              const pkg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
              const deps = { ...pkg.dependencies, ...pkg.devDependencies };
              if (deps.vue) return 'vue';
              if (deps.react) return 'react';
            } catch (e) { /* 忽略 */ }
          } else {
            return type;
          }
        }
      }
    }

    // 从 CODE_GRAPH 推断
    if (this.codeGraph && this.codeGraph.nodes) {
      const extensions = new Map();
      for (const node of this.codeGraph.nodes) {
        const fp = node.filePath || node.file || '';
        if (fp) {
          const ext = path.extname(fp).toLowerCase();
          extensions.set(ext, (extensions.get(ext) || 0) + 1);
        }
      }
      const total = this.codeGraph.nodes.length;
      if ((extensions.get('.dart') || 0) / total > 0.3) return 'flutter';
      if ((extensions.get('.vue') || 0) / total > 0.1) return 'vue';
      if (((extensions.get('.js') || 0) + (extensions.get('.jsx') || 0) + (extensions.get('.ts') || 0) + (extensions.get('.tsx') || 0)) / total > 0.1) return 'react';
    }

    return 'universal';
  }

  buildI18nCache() {
    const i18nFiles = this.discoverI18nFiles();
    if (i18nFiles.length === 0) {
      this.i18nCache = { hasI18n: false, files: [], translations: [] };
      return;
    }

    const allTranslations = [];
    for (const i18nPath of i18nFiles) {
      const translations = parseI18nFile(i18nPath, this.projectType);
      allTranslations.push(...translations);
    }

    // 去重
    const seen = new Set();
    const uniqueTranslations = allTranslations.filter(t => {
      if (seen.has(t.key)) return false;
      seen.add(t.key);
      return true;
    });

    this.i18nCache = { hasI18n: true, files: i18nFiles, translations: uniqueTranslations };
    console.log(`[DynamicFileMatcher] i18n已解析，文件数: ${i18nFiles.length}, 条目数: ${uniqueTranslations.length}`);
  }

  discoverI18nFiles() {
    const i18nDirs = [];
    if (this.projectType === 'flutter') {
      i18nDirs.push('lib/lang', 'lib/l10n', 'lib/i18n', 'lib/intl');
    } else if (this.projectType === 'angular') {
      i18nDirs.push('src/assets/i18n', 'src/assets/locales', 'src/locale', 'src/locales', 'src/i18n', 'assets/i18n', 'assets/locales', 'locale', 'locales', 'i18n');
    } else if (this.projectType === 'vue' || this.projectType === 'react') {
      i18nDirs.push('src/locales', 'src/i18n', 'src/lang', 'locales', 'i18n', 'lang');
    } else {
      i18nDirs.push('locales', 'i18n', 'lang', 'l10n');
    }

    const discoveredFiles = [];
    for (const dir of i18nDirs) {
      const fullDir = path.join(this.projectPath, dir);
      if (!fs.existsSync(fullDir)) continue;
      try {
        // 递归搜索（修复：原 discoverI18nFiles 只搜索一级目录）
        this.collectFilesRecursively(fullDir, discoveredFiles);
      } catch (e) { /* 忽略 */ }
    }
    return discoveredFiles;
  }

  collectFilesRecursively(dirPath, result) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        this.collectFilesRecursively(fullPath, result);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (['.json', '.dart', '.arb', '.yaml', '.yml', '.js', '.ts'].includes(ext)) {
          result.push(fullPath.replace(/\\/g, '/'));
        }
      }
    }
  }

  buildI18nKeyToFilesCache() {
    if (!this.i18nCache || !this.i18nCache.hasI18n) return;

    this.i18nKeyToFilesCache = new Map();

    const sourceDir = this.getSourceDirectory();
    if (!sourceDir || !fs.existsSync(sourceDir)) return;

    const sourceFiles = this.listFilesRecursively(sourceDir, this.getSourceExtensions());

    // 遍历源文件，提取使用的 i18n key
    for (const filePath of sourceFiles) {
      const fileType = inferFileType(filePath, this.projectType);
      if (['i18n', 'test', 'generated', 'config'].includes(fileType)) continue;

      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const usedKeys = this.extractUsedI18nKeysFromContent(content);

        for (const key of usedKeys) {
          if (!this.i18nKeyToFilesCache.has(key)) {
            this.i18nKeyToFilesCache.set(key, []);
          }
          this.i18nKeyToFilesCache.get(key).push(filePath);
        }
      } catch (e) { /* 跳过不可读文件 */ }
    }

    console.log(`[DynamicFileMatcher] i18n key→文件缓存构建完成，key数: ${this.i18nKeyToFilesCache.size}`);
  }

  extractUsedI18nKeysFromContent(content) {
    const usedKeys = [];
    let m; // 所有 case 共用的正则匹配变量

    switch (this.projectType) {
      case 'flutter':
        const flutterPattern = /['"]([a-zA-Z0-9_.]+)['"]\.tr/g;
        while ((m = flutterPattern.exec(content)) !== null) usedKeys.push(m[1]);
        break;
      case 'vue':
        // 第一步：提取 $t() / i18n.t() / t() 参数中的 key
        const vuePattern = /\$t\(['"]([a-zA-Z0-9_.]+)['"]\)|i18n\.t\(['"]([a-zA-Z0-9_.]+)['"]\)|t\(['"]([a-zA-Z0-9_.]+)['"]\)/g;
        while ((m = vuePattern.exec(content)) !== null) usedKeys.push(m[1] || m[2] || m[3]);

        // 第二步：识别 namespace + 属性访问模式
        // 如 this.cur_lang = this.$t("m.fms.driver_management") 然后 this.cur_lang_form.tx_cancel
        // 或 this.cur_lang_form = this.$t("m.fms.driver_management") 然后 this.cur_lang_form.tx_cancel
        // 匹配赋值语句：this.xxx = this.$t(...) 或 const xxx = this.$t(...)
        const nsAssignPattern = /(?:this\.|const\s+|let\s+|var\s+)([a-zA-Z0-9_]+)\s*=\s*(?:this\.)?(?:\$t|i18n\.t|t)\(['"]([a-zA-Z0-9_.]+)['"]\)/g;
        const nsVarMap = new Map(); // 变量名 → namespace key
        let nsMatch;
        while ((nsMatch = nsAssignPattern.exec(content)) !== null) {
          nsVarMap.set(nsMatch[1], nsMatch[2]);
          // 如果变量名有 _form 后缀变体（如 cur_lang → cur_lang_form），也关联
          // 因为代码中经常先赋值 cur_lang = $t("xxx")，再用 cur_lang_form.xxx 读取
          const varName = nsMatch[1];
          // 注册常见的变体：xxx → xxx_form, xxx → xxx_labels 等
          const variantPattern = new RegExp(`(?:this\\.)?${varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(_form|_labels|_text|_msg|_info|_data|_items|_list|_options|_dict|_map)`, 'g');
          let variantMatch;
          while ((variantMatch = variantPattern.exec(content)) !== null) {
            const variantName = variantMatch[1];
            // 确认变体名不在已有的 nsVarMap 中（避免覆盖直接赋值）
            if (!nsVarMap.has(variantName)) {
              nsVarMap.set(variantName, nsMatch[2]);
            }
          }
        }

        // 匹配属性访问：this.varName.subKey 或 varName.subKey
        // 将属性访问展开为完整 i18n key（namespace key + 属性名）
        if (nsVarMap.size > 0) {
          const varNames = Array.from(nsVarMap.keys());
          const varNamesPattern = varNames.map(v => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
          const propAccessPattern = new RegExp(
            `(?:this\\.)?(?:${varNamesPattern})\\.([a-zA-Z0-9_]+(?:\\.[a-zA-Z0-9_]+){0,2})`, 'g'
          );
          let propMatch;
          while ((propMatch = propAccessPattern.exec(content)) !== null) {
            // 提取变量名（可能含 this. 前缀，需要清理）
            const rawVarName = propMatch[0].startsWith('this.')
              ? propMatch[0].slice(5).split('.')[0]
              : propMatch[0].split('.')[0];
            const nsKey = nsVarMap.get(rawVarName);
            if (nsKey) {
              usedKeys.push(`${nsKey}.${propMatch[1]}`);
            }
          }
        }
        break;
      case 'react':
        const reactPattern = /t\(['"]([a-zA-Z0-9_.]+)['"]\)/g;
        while ((m = reactPattern.exec(content)) !== null) usedKeys.push(m[1]);
        break;
      default:
        const universalPattern = /['"]([a-zA-Z0-9_.]{5,})['"]/g;
        while ((m = universalPattern.exec(content)) !== null) usedKeys.push(m[1]);
        break;
    }

    return usedKeys;
  }

  // ==================== 菜单配置解析 ====================

  /**
   * 构建菜单路由映射：i18n key → route 名
   * Flutter 项目：从 menu_page_controller.dart 等文件解析 labelKey + route
   * Vue/React 项目：从菜单配置文件解析 i18n key + 路由
   */
  buildMenuRouteMap() {
    this.menuRouteMap = new Map();

    const menuFiles = this.discoverMenuConfigFiles();
    for (const menuFile of menuFiles) {
      try {
        const content = fs.readFileSync(menuFile, 'utf8');
        if (this.projectType === 'flutter') {
          this.parseFlutterMenuConfig(content);
        } else if (this.projectType === 'vue' || this.projectType === 'react') {
          this.parseVueReactMenuConfig(content);
        }
      } catch (e) {
        console.warn(`[DynamicFileMatcher] 解析菜单文件失败: ${menuFile}`, e.message);
      }
    }

    console.log(`[DynamicFileMatcher] menuRouteMap构建完成，映射数: ${this.menuRouteMap.size}`);
  }

  /**
   * 发现菜单配置文件
   */
  discoverMenuConfigFiles() {
    const candidates = [];

    if (this.projectType === 'flutter') {
      // Flutter GetX: menu_page_controller.dart, menu_config.dart, sidebar.dart
      const menuPaths = [
        path.join(this.projectPath, 'lib', 'routes', 'menu_page_controller.dart'),
        path.join(this.projectPath, 'lib', 'config', 'menu_config.dart'),
        path.join(this.projectPath, 'lib', 'routes', 'sidebar.dart'),
        path.join(this.projectPath, 'lib', 'menu', 'menu_controller.dart'),
        path.join(this.projectPath, 'lib', 'menu', 'menu_config.dart'),
      ];
      for (const p of menuPaths) {
        if (fs.existsSync(p)) candidates.push(p.replace(/\\/g, '/'));
      }
    } else if (this.projectType === 'vue' || this.projectType === 'react') {
      const srcDir = path.join(this.projectPath, 'src');
      const menuPaths = [
        path.join(srcDir, 'menu', 'index.js'),
        path.join(srcDir, 'menu', 'index.ts'),
        path.join(srcDir, 'config', 'menu.js'),
        path.join(srcDir, 'config', 'menu.ts'),
        path.join(srcDir, 'router', 'menu.js'),
        path.join(srcDir, 'router', 'menu.ts'),
        path.join(srcDir, 'sidebar', 'index.js'),
        path.join(srcDir, 'sidebar', 'index.ts'),
      ];
      for (const p of menuPaths) {
        if (fs.existsSync(p)) candidates.push(p.replace(/\\/g, '/'));
      }
    }

    // 通用搜索：查找包含 labelKey/menu/i18n 的路由/配置文件
    if (candidates.length === 0) {
      const searchDirs = this.projectType === 'flutter'
        ? [path.join(this.projectPath, 'lib')]
        : [path.join(this.projectPath, 'src')];

      for (const dir of searchDirs) {
        if (!fs.existsSync(dir)) continue;
        const files = this.listFilesRecursively(dir, this.getSourceExtensions());
        for (const f of files) {
          const basename = path.basename(f).toLowerCase();
          if (basename.includes('menu') || basename.includes('sidebar') || basename.includes('nav')) {
            try {
              const content = fs.readFileSync(f, 'utf8');
              if (content.includes('labelKey') || content.includes('$t(') || content.includes('.tr')) {
                candidates.push(f.replace(/\\/g, '/'));
              }
            } catch (e) { /* 忽略 */ }
          }
        }
      }
    }

    return candidates;
  }

  /**
   * 解析 Flutter 菜单配置
   * 格式: labelKey: 'administrative_management.l_arrear_data_export_tit', route: AppRoutes.arrearDataExport
   */
  parseFlutterMenuConfig(content) {
    // 匹配 labelKey + route 对
    const labelRoutePattern = /labelKey\s*:\s*['"]([^'"]+)['"][\s\S]*?route\s*:\s*AppRoutes\.(\w+)/g;
    let match;
    while ((match = labelRoutePattern.exec(content)) !== null) {
      this.menuRouteMap.set(match[1], match[2]);
    }
  }

  /**
   * 解析 Vue/React 菜单配置
   * 格式: { title: $t('key'), path: '/xxx', name: 'xxx' }
   */
  parseVueReactMenuConfig(content) {
    // Vue/React 菜单配置支持多种写法：
    // 1. { title: $t('key'), path: '/xxx', name: 'xxx' }
    // 2. { meta: { title: $t('key') }, path: '/xxx', name: 'xxx' } — Vue Router meta.title 最常见
    // 3. { label: $t('key'), path: '/xxx' } — Element UI 等菜单
    // 4. { text: $t('key'), path: '/xxx' } — Ant Design 等菜单
    // i18n 调用形式: i18n.t(), this.$t(), $t(), t()

    const i18nCallPattern = `(?:i18n\\.t|this\\.\\$t|\\$t|t)\\(['"]([^'"]+)['"]\\)`;

    // 支持的字段名：title, label, text, meta.title
    const fieldNames = ['title', 'label', 'text'];
    const patterns = [];

    // 直接字段匹配：{ title: $t('key'), ... path/name }
    for (const field of fieldNames) {
      patterns.push(new RegExp(
        `${field}\\s*:\\s*${i18nCallPattern}[\\s\\S]*?(?:path\\s*:\\s*['"]([^'"]+)['"]|name\\s*:\\s*['"]([^'"]+)['"])`,
        'g'
      ));
    }

    // meta.title 匹配：{ meta: { title: $t('key') }, ... path/name }
    patterns.push(new RegExp(
      `meta\\s*:\\s*\\{[\\s\\S]*?title\\s*:\\s*${i18nCallPattern}[\\s\\S]*?\\}[\\s\\S]*?(?:path\\s*:\\s*['"]([^'"]+)['"]|name\\s*:\\s*['"]([^'"]+)['"])`,
      'g'
    ));

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const i18nKey = match[1];
        const routePathValue = match[2] || '';
        const routeNameValue = match[3] || '';
        if (routePathValue || routeNameValue) {
          // routeName 优先使用显式 name 字段，回退从 path 推断
          const routeName = routeNameValue || path.basename(routePathValue.replace(/\\/g, '/'));
          this.menuRouteMap.set(i18nKey, routeName);
        }
      }
    }
  }

  buildRouteMap() {
    this.routeMap = new Map();
    const routeFiles = this.discoverRouteFiles();

    // 先从所有路由文件收集 static const 路径常量（共享 routeNameMap）
    const routeNameMap = new Map();
    for (const routeFile of routeFiles) {
      try {
        const content = fs.readFileSync(routeFile, 'utf8');
        const staticPattern = /static\s+const\s+(\w+)\s*=\s*['"]([^'"]+)['"]/g;
        let match;
        while ((match = staticPattern.exec(content)) !== null) {
          routeNameMap.set(match[1], match[2]);
        }
      } catch (e) { /* 忽略 */ }
    }

    // 然后从所有路由文件解析 GetPage 定义（使用共享的 routeNameMap）
    for (const routeFile of routeFiles) {
      try {
        const content = fs.readFileSync(routeFile, 'utf8');
        if (this.projectType === 'flutter') {
          this.parseFlutterGetPages(content, routeFile, routeNameMap);
        } else if (this.projectType === 'vue') {
          this.parseVueRoutes(content, routeFile);
        }
      } catch (e) {
        console.warn(`[DynamicFileMatcher] 解析路由文件失败: ${routeFile}`, e.message);
      }
    }

    console.log(`[DynamicFileMatcher] routeMap构建完成，路由数: ${this.routeMap.size}`);
  }

  /**
   * 解析 Flutter GetPage 定义（使用共享的 routeNameMap）
   */
  parseFlutterGetPages(content, routeFilePath, routeNameMap) {
    const getPageBlocks = this.extractGetPageBlocks(content);

    for (const blockContent of getPageBlocks) {
      const nameMatch = blockContent.match(/name\s*:\s*AppRoutes\.(\w+)/);
      const pageMatch = blockContent.match(/page\s*:\s*\(\)\s*=>\s*const\s+(\w+)/);
      const bindingMatch = blockContent.match(/binding\s*:\s*(\w+)\s*\(/);

      if (nameMatch && pageMatch) {
        const routePath = routeNameMap.get(nameMatch[1]) || '';
        const pageClass = pageMatch[1];
        const bindingClass = bindingMatch ? bindingMatch[1] : null;

        const pageFilePath = this.findFileForClassName(pageClass) || '';
        const bindingFilePath = bindingClass ? this.findFileForClassName(bindingClass) : '';

        const controllerPaths = [];
        const providerPaths = [];
        if (bindingFilePath && fs.existsSync(bindingFilePath)) {
          try {
            const bindingContent = fs.readFileSync(bindingFilePath, 'utf8');
            const imports = this.parseImportsForDependencies(bindingFilePath, bindingContent);
            for (const imp of imports) {
              const targetFile = this.resolveImportToFilePath(imp, bindingFilePath);
              if (targetFile) {
                const ft = inferFileType(targetFile, this.projectType);
                if (ft === 'controller') controllerPaths.push(targetFile);
                if (ft === 'service' || ft === 'api' || ft === 'provider') providerPaths.push(targetFile);
              }
            }
          } catch (e) { /* 忽略 */ }
        }

        this.routeMap.set(routePath, {
          routePath,
          routeName: nameMatch[1],
          pageClass,
          pageFilePath,
          bindingFilePath,
          controllerPaths,
          providerPaths,
        });
      }
    }
  }

  discoverRouteFiles() {
    const candidates = [];

    if (this.projectType === 'flutter') {
      const routesDir = path.join(this.projectPath, 'lib', 'routes');
      if (fs.existsSync(routesDir)) {
        this.collectFilesRecursively(routesDir, candidates);
      }
      // 也检查 lib/ 下直接的 app_routes.dart / app_pages.dart
      const directFiles = ['app_routes.dart', 'app_pages.dart'];
      for (const f of directFiles) {
        const fp = path.join(this.projectPath, 'lib', f);
        if (fs.existsSync(fp)) candidates.push(fp.replace(/\\/g, '/'));
      }
    } else if (this.projectType === 'vue' || this.projectType === 'react') {
      const srcDir = path.join(this.projectPath, 'src');
      const routerDirs = ['router', 'routes'];
      for (const dir of routerDirs) {
        const fullDir = path.join(srcDir, dir);
        if (fs.existsSync(fullDir)) {
          this.collectFilesRecursively(fullDir, candidates);
        }
      }
    }

    return candidates;
  }

  /**
   * 从 Dart 路由文件中提取完整的 GetPage 块（处理嵌套括号）
   */
  extractGetPageBlocks(content) {
    const blocks = [];
    const keyword = 'GetPage';

    let pos = 0;
    while (pos < content.length) {
      // 查找 GetPage 关键词
      const idx = content.indexOf(keyword, pos);
      if (idx === -1) break;

      // 找到 GetPage 后面的第一个 (
      const parenStart = content.indexOf('(', idx);
      if (parenStart === -1 || parenStart > idx + keyword.length + 2) {
        pos = idx + keyword.length;
        continue;
      }

      // 括号平衡计数
      let depth = 1;
      let end = parenStart + 1;
      while (end < content.length && depth > 0) {
        if (content[end] === '(') depth++;
        else if (content[end] === ')') depth--;
        end++;
      }

      if (depth === 0) {
        blocks.push(content.substring(parenStart, end));
      }
      pos = end;
    }

    return blocks;
  }

  parseVueRoutes(content, routeFilePath) {
    // Vue Router 支持多种写法：
    // 1. { path: '/xxx', component: () => import('@/views/Xxx.vue'), name: 'xxx' }
    // 2. { path: '/xxx', name: 'xxx', component: () => import('@/views/Xxx.vue') } — name 在 component 前
    // 3. { path: '/xxx', component: () => import('@/views/Xxx.vue') } — 无 name 字段
    // 4. { path: '/xxx', component: XxxView } — 直接引用变量

    // 策略1：解析带 name + 懒加载 import 的路由（name 在 component 前或后均可）
    const lazyPattern1 = /name\s*:\s*['"]([^'"]+)['"][\s\S]*?path\s*:\s*['"]([^'"]+)['"][\s\S]*?component\s*:\s*\(\)\s*=>\s*import\(['"]([^'"]+)['"]\)/g;
    const lazyPattern2 = /path\s*:\s*['"]([^'"]+)['"][\s\S]*?name\s*:\s*['"]([^'"]+)['"][\s\S]*?component\s*:\s*\(\)\s*=>\s*import\(['"]([^'"]+)['"]\)/g;
    const lazyPattern3 = /path\s*:\s*['"]([^'"]+)['"][\s\S]*?component\s*:\s*\(\)\s*=>\s*import\(['"]([^'"]+)['"]\)/g;

    // 策略2：解析直接引用变量的路由 { path, name, component: VarName }
    const directPattern1 = /name\s*:\s*['"]([^'"]+)['"][\s\S]*?path\s*:\s*['"]([^'"]+)['"][\s\S]*?component\s*:\s*([A-Za-z_]\w*)/g;
    const directPattern2 = /path\s*:\s*['"]([^'"]+)['"][\s\S]*?name\s*:\s*['"]([^'"]+)['"][\s\S]*?component\s*:\s*([A-Za-z_]\w*)/g;

    const srcDir = path.join(this.projectPath, 'src');

    // 解析懒加载路由（name在前）
    let match;
    while ((match = lazyPattern1.exec(content)) !== null) {
      const routeName = match[1];
      const routePath = match[2];
      const componentImport = match[3];
      this.addVueRouteEntry(routePath, routeName, componentImport, srcDir);
    }

    // 解析懒加载路由（path在前，name在中）
    while ((match = lazyPattern2.exec(content)) !== null) {
      const routePath = match[1];
      const routeName = match[2];
      const componentImport = match[3];
      // 防止和 lazyPattern1 重复（如果同一条路由被两个模式匹配）
      if (!this.routeMap.has(routePath)) {
        this.addVueRouteEntry(routePath, routeName, componentImport, srcDir);
      }
    }

    // 解析懒加载路由（无 name 字段）——从 component import 路径推断 routeName
    while ((match = lazyPattern3.exec(content)) !== null) {
      const routePath = match[1];
      const componentImport = match[2];
      // 防止和前面的模式重复
      if (!this.routeMap.has(routePath)) {
        // 从组件路径推断 name：@/views/UserManagement.vue → UserManagement
        const inferredName = path.basename(componentImport, path.extname(componentImport));
        this.addVueRouteEntry(routePath, inferredName, componentImport, srcDir);
      }
    }

    // 解析直接引用路由（name在前）
    while ((match = directPattern1.exec(content)) !== null) {
      const routeName = match[1];
      const routePath = match[2];
      const componentVar = match[3];
      if (!this.routeMap.has(routePath)) {
        // 通过 classToFilePathCache 查找组件变量对应的文件
        const componentPath = this.findFileForClassName(componentVar) || '';
        this.addVueRouteEntryWithFile(routePath, routeName, componentPath);
      }
    }

    // 解析直接引用路由（path在前）
    while ((match = directPattern2.exec(content)) !== null) {
      const routePath = match[1];
      const routeName = match[2];
      const componentVar = match[3];
      if (!this.routeMap.has(routePath)) {
        const componentPath = this.findFileForClassName(componentVar) || '';
        this.addVueRouteEntryWithFile(routePath, routeName, componentPath);
      }
    }

    console.log(`[DynamicFileMatcher] Vue路由解析完成，routeMap大小: ${this.routeMap.size}`);
  }

  /**
   * 辅助方法：添加 Vue 路由条目到 routeMap
   * 从 component import 路径解析实际文件路径，并从页面文件推断关联的 store/service/api
   */
  addVueRouteEntry(routePath, routeName, componentImport, srcDir) {
    // 解析 component import 路径
    const componentPath = path.join(srcDir, componentImport.replace('@/', '').replace(/\\/g, '/'));
    const resolvedPath = fs.existsSync(componentPath) ? componentPath : '';

    // Vue 没有 binding/controller/provider，但可以从页面文件推断关联的 store/service
    const controllerPaths = [];
    const providerPaths = [];

    if (resolvedPath && fs.existsSync(resolvedPath)) {
      try {
        const pageContent = fs.readFileSync(resolvedPath, 'utf8');
        // Vue 页面常见的关联文件模式：
        // import { useXxxStore } from '@/stores/xxx' → store/service
        // import { xxxApi } from '@/api/xxx' → service/api
        // import XxxService from '@/services/xxx' → service
        const imports = this.parseImportsForDependencies(resolvedPath, pageContent);
        for (const imp of imports) {
          const targetFile = this.resolveImportToFilePath(imp, resolvedPath);
          if (targetFile) {
            const ft = inferFileType(targetFile, this.projectType);
            if (ft === 'service' || ft === 'api' || ft === 'state') {
              providerPaths.push(targetFile);
            } else if (ft === 'controller' || ft === 'hook' || ft === 'composable') {
              controllerPaths.push(targetFile);
            }
          }
        }
      } catch (e) { /* 忽略 */ }
    }

    this.routeMap.set(routePath, {
      routePath,
      routeName,
      pageClass: routeName,
      pageFilePath: resolvedPath,
      bindingFilePath: '',
      controllerPaths,
      providerPaths,
    });
  }

  /**
   * 辅助方法：添加 Vue 路由条目（已知文件路径）
   */
  addVueRouteEntryWithFile(routePath, routeName, componentPath) {
    const controllerPaths = [];
    const providerPaths = [];

    if (componentPath && fs.existsSync(componentPath)) {
      try {
        const pageContent = fs.readFileSync(componentPath, 'utf8');
        const imports = this.parseImportsForDependencies(componentPath, pageContent);
        for (const imp of imports) {
          const targetFile = this.resolveImportToFilePath(imp, componentPath);
          if (targetFile) {
            const ft = inferFileType(targetFile, this.projectType);
            if (ft === 'service' || ft === 'api' || ft === 'state') {
              providerPaths.push(targetFile);
            } else if (ft === 'controller' || ft === 'hook' || ft === 'composable') {
              controllerPaths.push(targetFile);
            }
          }
        }
      } catch (e) { /* 忽略 */ }
    }

    this.routeMap.set(routePath, {
      routePath,
      routeName,
      pageClass: routeName,
      pageFilePath: componentPath,
      bindingFilePath: '',
      controllerPaths,
      providerPaths,
    });
  }

  loadTestContext() {
    try {
      const testContextPath = this.findScanFilePath('TEST_CONTEXT.json');

      if (testContextPath) {
        this.testContext = JSON.parse(fs.readFileSync(testContextPath, 'utf8'));
        console.log(`[DynamicFileMatcher] TEST_CONTEXT已加载 (${testContextPath})，功能点数: ${this.testContext.features?.length || 0}`);
      } else {
        console.log(`[DynamicFileMatcher] TEST_CONTEXT不存在：项目 .dev-qa/ 和旧 DATA_DIR 位置都找不到`);
        this.testContext = null;
      }
    } catch (e) {
      console.warn(`[DynamicFileMatcher] 加载TEST_CONTEXT失败: ${e.message}`);
      this.testContext = null;
    }
  }

  buildClassToFilePathCache() {
    this.classToFilePathCache = new Map();

    if (!this.codeGraph || !this.codeGraph.nodes) return;

    // 先构建 fileId → filePath 的映射（用于类节点通过 fileId 查找文件路径）
    const fileIdToFilePath = new Map();
    for (const node of this.codeGraph.nodes) {
      const filePath = node.filePath || node.file || '';
      if (filePath && node.type === 'file') {
        fileIdToFilePath.set(node.id, filePath);
      }
    }

    for (const node of this.codeGraph.nodes) {
      // 获取文件路径：优先 filePath/file，其次通过 fileId 查找，最后通过 fileName 查找
      let filePath = node.filePath || node.file || '';
      if (!filePath && node.fileId && fileIdToFilePath.has(node.fileId)) {
        filePath = fileIdToFilePath.get(node.fileId);
      }
      if (!filePath && node.fileName && node.type === 'class') {
        // 在 fileIdToFilePath 中查找包含 fileName 的文件节点
        for (const [fid, fpath] of fileIdToFilePath) {
          if (path.basename(fpath).toLowerCase() === node.fileName.toLowerCase()) {
            filePath = fpath;
            break;
          }
        }
      }

      if (!filePath) continue;

      // 按类名缓存（原始大小写）
      if (node.name && node.type === 'class') {
        this.classToFilePathCache.set(node.name, filePath);
      }

      // 按文件名和 basename 缓存（用于 import 解析）
      const fileName = path.basename(filePath).toLowerCase();
      const baseName = path.basename(filePath, path.extname(filePath)).toLowerCase();
      this.classToFilePathCache.set(fileName, filePath);
      this.classToFilePathCache.set(baseName, filePath);
    }

    console.log(`[DynamicFileMatcher] 类名→文件路径缓存构建完成，条目数: ${this.classToFilePathCache.size}`);
  }

  getSourceDirectory() {
    if (this.projectType === 'flutter') return path.join(this.projectPath, 'lib');
    if (['vue', 'react', 'angular'].includes(this.projectType)) return path.join(this.projectPath, 'src');
    return this.projectPath;
  }

  getSourceExtensions() {
    if (this.projectType === 'flutter') return ['.dart'];
    if (this.projectType === 'vue') return ['.vue', '.js', '.ts'];
    if (this.projectType === 'react') return ['.jsx', '.tsx', '.js', '.ts'];
    if (this.projectType === 'angular') return ['.ts', '.html'];
    return ['.js', '.ts', '.jsx', '.tsx', '.vue', '.dart', '.html'];
  }

  listFilesRecursively(dirPath, extensions) {
    const results = [];

    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          // 跳过不需要的目录
          const skipDirs = ['node_modules', '.dart_tool', 'build', 'dist', '.git', '__tests__', 'test', 'tests'];
          if (skipDirs.includes(entry.name)) continue;
          results.push(...this.listFilesRecursively(fullPath, extensions));
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (extensions.includes(ext)) {
            results.push(fullPath);
          }
        }
      }
    } catch (e) { /* 目录不可读 */ }

    return results;
  }
}

module.exports = DynamicFileMatcher;