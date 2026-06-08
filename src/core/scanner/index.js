/**
 * Code Scanner Module
 *
 * Responsibilities:
 * - Parse code files (JS/TS, Dart, Vue)
 * - Execute rules against code
 * - Report issues with locations
 *
 * Supported Languages:
 * - JavaScript
 * - TypeScript
 * - Dart
 * - Vue (SFC)
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { DATA_DIR } = require('../config/data-dir');

// Lazy load AST parser and code graph generator
let ASTParser = null;
let CodeGraphGenerator = null;
let ProjectScanner = null;
let ParallelScanner = null;
let IncrementalScanner = null;
let ASTTemplateDetector = null;

class CodeScanner {
  constructor() {
    this.rules = [];
    this.supportedExtensions = ['.js', '.jsx', '.ts', '.tsx', '.vue', '.dart'];
    this.languageMap = {
      '.js': 'javascript',
      '.jsx': 'jsx',
      '.ts': 'typescript',
      '.tsx': 'tsx',
      '.vue': 'vue',
      '.dart': 'dart',
    };
    this.astParser = null;
    this.codeGraphGenerator = null;
    this.projectScanner = null;
    this.enableASTParsing = false;
    this.astTemplateDetector = null;
  }

  /**
   * Enable AST parsing and code graph generation
   * @param {Object} options - Options for AST parsing
   */
  enableAST(options = {}) {
    this.enableASTParsing = true;

    if (!ASTParser) {
      try {
        ASTParser = require('../ast-parser');
        this.astParser = new ASTParser();
      } catch (error) {
        console.warn('Failed to load AST Parser:', error.message);
      }
    }

    if (!CodeGraphGenerator) {
      try {
        CodeGraphGenerator = require('../code-graph');
        this.codeGraphGenerator = new CodeGraphGenerator(options);
      } catch (error) {
        console.warn('Failed to load Code Graph Generator:', error.message);
      }
    }

    return this.astParser && this.codeGraphGenerator;
  }

  /**
   * Enable project scanner
   */
  enableProjectScanner() {
    if (!ProjectScanner) {
      try {
        ProjectScanner = require('../project-scanner');
        this.projectScanner = new ProjectScanner();
      } catch (error) {
        console.warn('Failed to load Project Scanner:', error.message);
      }
    }

    if (this.projectScanner && !this.projectScanner.structureAnalyzer) {
      // 确保结构分析器也被初始化
      this.projectScanner.initDetectors();
    }

    return !!this.projectScanner;
  }

  /**
   * Load rules from YAML file
   * @param {string} rulesPath - Path to rules.yaml
   */
  loadRules(rulesPath) {
    try {
      const fileContent = fs.readFileSync(rulesPath, 'utf8');
      const rules = yaml.load(fileContent);
      this.rules = rules || [];
      console.log(`Loaded ${this.rules.length} rules from ${rulesPath}`);
      return this.rules;
    } catch (error) {
      console.error('Error loading rules:', error.message);
      this.rules = [];
      return [];
    }
  }

  /**
   * Set rules configuration directly
   * @param {Array} rules - Rules array with enabled status
   */
  setRulesConfig(rules) {
    if (!rules || !Array.isArray(rules)) {
      console.warn('[Scanner] Invalid rules config provided');
      return;
    }
    this.rules = rules;
    console.log(`[Scanner] Updated rules config, ${this.rules.length} rules, ${this.rules.filter(r => r.enabled !== false).length} enabled`);
  }

  /**
   * Get language from file extension
   * @param {string} filePath - File path
   * @returns {string} Language identifier
   */
  getLanguage(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return this.languageMap[ext] || 'unknown';
  }

  /**
   * Check if file is supported
   * @param {string} filePath - File path
   * @returns {boolean} True if supported
   */
  isSupportedFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return this.supportedExtensions.includes(ext);
  }

  /**
   * Scan a single file
   * @param {string} filePath - File path
   * @returns {Promise<Object>} Scan result for the file
   */
  async scanFile(filePath) {
    try {
      if (!this.isSupportedFile(filePath)) {
        return {
          filePath,
          language: 'unknown',
          issues: [],
          error: 'Unsupported file type',
        };
      }

      // 检查文件大小，防止读取过大的文件
      const stats = fs.statSync(filePath);
      const maxFileSize = 10 * 1024 * 1024; // 10MB 限制
      if (stats.size > maxFileSize) {
        console.warn(`[Scanner] 文件过大 (${Math.round(stats.size / 1024 / 1024)}MB)，跳过: ${filePath}`);
        return {
          filePath,
          language: this.getLanguage(filePath),
          issues: [],
          error: `文件过大 (${Math.round(stats.size / 1024 / 1024)}MB)，超过最大限制 ${maxFileSize / 1024 / 1024}MB`,
        };
      }

      const content = fs.readFileSync(filePath, 'utf8');
      const language = this.getLanguage(filePath);
      const lines = content.split('\n');

      // 限制处理的最大行数
      const maxLines = 50000;
      const linesToProcess = lines.length > maxLines ? lines.slice(0, maxLines) : lines;

      if (lines.length > maxLines) {
        console.warn(`[Scanner] 文件行数过多 (${lines.length})，仅处理前 ${maxLines} 行: ${filePath}`);
      }

      const issues = [];
      const maxIssuesPerFile = 1000; // 限制每个文件的最大问题数
      let issueCount = 0;

      // 获取适用于当前语言的规则（预先过滤，避免每行都检查）
      // 只使用已启用的规则
      const applicableRules = this.rules.filter(rule =>
        rule.enabled !== false && // 只使用启用的规则（enabled 为 true 或 undefined 时启用）
        (rule.languages.includes(language) || rule.languages.includes('all'))
      );

      // 预编译正则表达式，避免重复创建
      const compiledRules = [];
          for (const rule of applicableRules) {
            if (rule.pattern) {
              try {
                compiledRules.push({
                  ...rule,
                  regex: new RegExp(rule.pattern, 'g')
                });
              } catch (e) {
                console.warn(`Invalid regex for rule ${rule.id}:`, e.message);
              }
            }
          }

      // 添加超时保护 - 使用时间戳检查
      const startTime = Date.now();
      const maxScanTime = 5000; // 每个文件最多扫描 5 秒

      // Scan line by line
      for (let index = 0; index < linesToProcess.length; index++) {
        // 检查超时
        if (Date.now() - startTime > maxScanTime) {
          console.warn(`[Scanner] 文件扫描超时 (${maxScanTime}ms)，停止扫描: ${filePath}`);
          break;
        }

        // 如果问题数量已达到限制，停止扫描
        if (issueCount >= maxIssuesPerFile) {
          break;
        }

        const line = linesToProcess[index];
        const lineNumber = index + 1;

        // 应用规则
        for (const rule of compiledRules) {
          if (issueCount >= maxIssuesPerFile) break;

          try {
            const matches = line.match(rule.regex);
            if (matches) {
              issues.push({
                ruleId: rule.id,
                ruleName: rule.name,
                severity: rule.severity,
                message: rule.message,
                suggestion: rule.suggestion,
                line: lineNumber,
                column: line.indexOf(matches[0]) + 1,
                code: line.trim(),
                autoFix: rule.autoFix || false,
              });
              issueCount++;
            }
          } catch (error) {
            // 忽略匹配错误，继续处理其他规则
          }
        }
      }

      // Check file-level rules (with timeout protection)
      if (Date.now() - startTime <= maxScanTime) {
        try {
          const fileIssues = this.checkFileLevelRules(filePath, content, language);
          if (fileIssues && fileIssues.length > 0) {
            issues.push(...fileIssues.slice(0, maxIssuesPerFile - issueCount));
          }
        } catch (e) {
          console.warn(`File-level rules check failed for ${filePath}:`, e.message);
        }
      }

      return {
        filePath,
        language,
        issues,
        totalLines: lines.length,
      };
    } catch (error) {
      return {
        filePath,
        language: this.getLanguage(filePath),
        issues: [],
        error: error.message,
      };
    }
  }

  /**
   * Check file-level rules
   * @param {string} filePath - File path
   * @param {string} content - File content
   * @param {string} language - File language
   * @returns {Array} File-level issues
   */
  checkFileLevelRules(filePath, content, language) {
    const issues = [];
    const lines = content.split('\n');

    this.rules.forEach((rule) => {
      // 只使用已启用的规则
      if (rule.enabled === false) {
        return;
      }
      if (!rule.languages.includes(language) && !rule.languages.includes('all')) {
        return;
      }

      // Check file length
      if (rule.maxLines && lines.length > rule.maxLines) {
        issues.push({
          ruleId: rule.id,
          ruleName: rule.name,
          severity: rule.severity,
          message: rule.message.replace('{lines}', lines.length),
          suggestion: rule.suggestion,
          line: 1,
          column: 1,
          code: `File has ${lines.length} lines (max: ${rule.maxLines})`,
          autoFix: rule.autoFix || false,
        });
      }

      // Check for long lines
      if (rule.maxLength) {
        lines.forEach((line, index) => {
          if (line.length > rule.maxLength) {
            issues.push({
              ruleId: rule.id,
              ruleName: rule.name,
              severity: rule.severity,
              message: rule.message.replace('{length}', line.length),
              suggestion: rule.suggestion,
              line: index + 1,
              column: rule.maxLength + 1,
              code: line.trim().substring(0, 50) + '...',
              autoFix: rule.autoFix || false,
            });
          }
        });
      }
    });

    // Dart 上下文分析：整合所有需要上下文的规则检测
    if (language === 'dart') {
      const dartContextIssues = this.analyzeDartContext(content, filePath);
      if (dartContextIssues.length > 0) {
        issues.push(...dartContextIssues);
      }
    }

    // JavaScript/TypeScript 上下文分析
    if (language === 'javascript' || language === 'typescript' || language === 'jsx' || language === 'tsx') {
      const jsContextIssues = this.analyzeJSContext(content, filePath, language);
      if (jsContextIssues.length > 0) {
        issues.push(...jsContextIssues);
      }
    }

    // AST 模板检测 - 处理需要上下文分析的复杂规则
    const templateIssues = this.runASTTemplateDetection(content, filePath, language);
    if (templateIssues.length > 0) {
      issues.push(...templateIssues);
    }

    return issues;
  }

  /**
   * Dart 上下文分析入口
   * 整合所有需要上下文感知的 Dart 规则检测
   *
   * 规则包括：
   * - DART-NULL-002: unsafe .first/.last 访问
   * - DART-NULL-004: 强制解包 ! 无 null 保护
   * - DART-NULL-005: 多层属性访问缺少空值保护
   * - DART-NULL-006: late 变量未初始化就使用
   *
   * @param {string} content - 文件内容
   * @param {string} filePath - 文件路径
   * @returns {Array} 检测到的问题列表
   */
  analyzeDartContext(content, filePath) {
    const issues = [];
    const lines = content.split('\n');

    // 一次性收集所有类型和变量信息，供各检测方法使用
    const typeInfo = this.collectDartTypeInfo(content, lines);
    const variableInfo = this.collectDartVariables(content, lines);

    // 执行各项检测
    issues.push(...this.analyzeDartNullableListAccess(content, filePath, variableInfo));
    issues.push(...this.analyzeDartForceUnwrap(content, filePath, variableInfo));
    issues.push(...this.analyzeDartPropertyChain(content, filePath, typeInfo));
    issues.push(...this.analyzeDartLateVariable(content, filePath, variableInfo));

    return issues;
  }

  /**
   * JavaScript/TypeScript 上下文分析入口
   *
   * 规则包括：
   * - JS-NULL-001: 可选链缺失（obj.prop vs obj?.prop）
   * - JS-NULL-002: .find() 返回值未处理 undefined
   *
   * @param {string} content - 文件内容
   * @param {string} filePath - 文件路径
   * @param {string} language - 语言类型
   * @returns {Array} 检测到的问题列表
   */
  analyzeJSContext(content, filePath, language) {
    const issues = [];
    const lines = content.split('\n');

    // 收集变量信息
    const variableInfo = this.collectJSVariables(content, lines);

    // 执行各项检测
    issues.push(...this.analyzeJSOptionalChain(content, filePath, variableInfo));
    issues.push(...this.analyzeJSFindResult(content, filePath, variableInfo));

    return issues;
  }

  /**
   * 执行 AST 模板检测
   * 处理规则中标记为 detectionType: 'ast-template' 的规则
   *
   * @param {string} content - 文件内容
   * @param {string} filePath - 文件路径
   * @param {string} language - 语言类型
   * @returns {Array} 检测到的问题列表
   */
  runASTTemplateDetection(content, filePath, language) {
    // 懒加载 AST 模板检测器
    if (!this.astTemplateDetector) {
      try {
        ASTTemplateDetector = require('./ast-templates');
        this.astTemplateDetector = new ASTTemplateDetector();
      } catch (error) {
        console.warn('[Scanner] 无法加载 AST 模板检测器:', error.message);
        return [];
      }
    }

    const issues = [];

    // 筛选需要 AST 模板检测的规则
    const astRules = this.rules.filter(rule => {
      // 只处理启用的规则
      if (rule.enabled === false) return false;
      // 只处理匹配当前语言的规则
      if (!rule.languages.includes(language) && !rule.languages.includes('all')) return false;
      // 只处理标记为 ast-template 的规则
      return rule.detectionType === 'ast-template' || rule.template;
    });

    // 执行每个 AST 规则的检测
    for (const rule of astRules) {
      try {
        const templateName = rule.template || this.inferTemplateFromRuleId(rule.id);
        if (templateName) {
          const templateIssues = this.astTemplateDetector.detect(
            templateName,
            content,
            filePath,
            language,
            rule
          );
          if (templateIssues.length > 0) {
            issues.push(...templateIssues);
          }
        }
      } catch (error) {
        console.warn(`[Scanner] AST 模板检测失败 (${rule.id}):`, error.message);
      }
    }

    return issues;
  }

  /**
   * 根据规则 ID 推断 AST 模板名称
   * @param {string} ruleId - 规则 ID
   * @returns {string|null} 模板名称
   */
  inferTemplateFromRuleId(ruleId) {
    const templateMap = {
      // Dart 模板映射
      'FLUT-DEP-001': 'unused-import',
      'FLUT-DEP-002': 'duplicate-import',
      'DART-002': 'empty-catch',
      'FLUT-ERR-001': 'empty-catch',
      'FLUT-MEM-001': 'missing-dispose',
      'FLUT-NUL-002': 'unsafe-first-last',
      'FLUT-WID-001': 'missing-return',
      'FLUT-NAM-004': 'class-naming',
      'FLUT-NAM-005': 'method-naming',
      'FLUT-NUL-005': 'required-nullable',
      'FLUT-WID-008': 'hardcoded-string',
      'FLUT-SEC-004': 'hardcoded-string',

      // JS/TS 模板映射
      'JS-UNUSED-IMPORT': 'js-unused-import',
      'JS-EMPTY-CATCH': 'js-empty-catch',
      'TS-EMPTY-CATCH': 'js-empty-catch',
    };
    return templateMap[ruleId] || null;
  }

  /**
   * 收集 Dart 类型信息
   * 解析类定义和属性定义，提取类型信息
   *
   * @param {string} content - 文件内容
   * @param {string[]} lines - 文件行数组
   * @returns {Object} 类型信息对象 { classes: { className: { properties: { propName: { type, isNullable } } } } } }
   */
  collectDartTypeInfo(content, lines) {
    const typeInfo = { classes: {} };

    let currentClass = null;
    let classIndent = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      const currentIndent = line.match(/^(\s*)/)?.[1]?.length || 0;

      // 排除注释
      if (trimmedLine.startsWith('//') || trimmedLine.startsWith('*')) continue;

      // 检测类定义
      const classMatch = trimmedLine.match(/^class\s+(\w+)/);
      if (classMatch) {
        currentClass = classMatch[1];
        classIndent = currentIndent;
        typeInfo.classes[currentClass] = { properties: {} };
        continue;
      }

      // 检测类结束
      if (currentClass && trimmedLine === '}' && currentIndent <= classIndent) {
        currentClass = null;
        continue;
      }

      // 在类内部收集属性定义
      if (currentClass) {
        // 匹配属性定义：Type? propertyName 或 final Type? propertyName
        const propMatch = trimmedLine.match(/^(?:final\s+)?(\w+)(\?)?\s+(\w+)/);
        if (propMatch) {
          const propType = propMatch[1];
          const isNullable = propMatch[2] === '?';
          const propName = propMatch[3];

          // 保存属性类型信息
          typeInfo.classes[currentClass].properties[propName] = {
            type: propType,
            isNullable: isNullable,
            line: i + 1
          };
        }
      }
    }

    return typeInfo;
  }

  /**
   * 收集 Dart 变量信息
   * 解析变量定义，识别 nullable/late 等属性
   *
   * @param {string} content - 文件内容
   * @param {string[]} lines - 文件行数组
   * @returns {Object} 变量信息对象 { varName: { isNullable, isLate, type, defLine } }
   */
  collectDartVariables(content, lines) {
    const variables = new Map();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      // 排除注释
      if (trimmedLine.startsWith('//') || trimmedLine.startsWith('*')) continue;

      // 匹配 late 变量定义：late Type varName
      const lateMatch = trimmedLine.match(/^late\s+(\w+)(\?)?\s+(\w+)/);
      if (lateMatch) {
        const type = lateMatch[1];
        const isNullable = lateMatch[2] === '?';
        const varName = lateMatch[3];
        variables.set(varName, {
          isNullable,
          isLate: true,
          type,
          defLine: i + 1,
          initialized: false,
          useLines: []
        });
        continue;
      }

      // 匹配普通变量定义：final/var/const Type? varName = ...
      const varMatch = trimmedLine.match(/^(final|var|const)\s+(\w+)(\?)?\s+(\w+)/);
      if (varMatch) {
        const type = varMatch[2];
        const isNullable = varMatch[3] === '?';
        const varName = varMatch[4];
        variables.set(varName, {
          isNullable,
          isLate: false,
          type,
          defLine: i + 1
        });
        continue;
      }

      // 匹配类型声明的变量：Type? varName = ...
      const typeVarMatch = trimmedLine.match(/^(\w+)(\?)\s+(\w+)\s*[=;]/);
      if (typeVarMatch) {
        const type = typeVarMatch[1];
        const varName = typeVarMatch[3];
        variables.set(varName, {
          isNullable: true,
          isLate: false,
          type,
          defLine: i + 1
        });
      }
    }

    return variables;
  }

  /**
   * 收集 JavaScript/TypeScript 变量信息
   *
   * @param {string} content - 文件内容
   * @param {string[]} lines - 文件行数组
   * @returns {Object} 变量信息对象
   */
  collectJSVariables(content, lines) {
    const variables = new Map();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      // 排除注释
      if (trimmedLine.startsWith('//') || trimmedLine.startsWith('*')) continue;

      // 匹配变量定义：const/let/var varName = ...
      const varMatch = trimmedLine.match(/^(const|let|var)\s+(\w+)/);
      if (varMatch) {
        const varName = varMatch[2];
        variables.set(varName, {
          defLine: i + 1,
          // JS 变量默认可能是 nullable（undefined）
          isNullable: true
        });
      }
    }

    return variables;
  }

  /**
   * Dart 上下文分析：检测 nullable list 变量的 unsafe .first/.last 使用
   *
   * 检测逻辑：
   * 1. 收集文件中所有 list 变量定义（包括 nullable 和非 nullable）
   * 2. 扫描这些变量的 .first/.last 使用
   * 3. 检查使用前是否有空值保护（isEmpty, ?.firstOrNull, if 判断等）
   * 4. 只有在没有空值保护的情况下才触发规则
   *
   * @param {string} content - 文件内容
   * @param {string} filePath - 文件路径
   * @param {Map} variableInfo - 变量信息（可选，如果不传则内部收集）
   * @returns {Array} 检测到的问题列表
   */
  analyzeDartNullableListAccess(content, filePath, variableInfo) {
    const issues = [];
    const lines = content.split('\n');

    // 阶段 1：获取 list 变量信息
    // 如果传入了 variableInfo，从中筛选；否则自行收集
    let listVariables = new Map();

    if (variableInfo && variableInfo.size > 0) {
      // 从传入的 variableInfo 中筛选 List/RxList 类型的变量
      variableInfo.forEach((info, varName) => {
        if (info.type && (info.type.includes('List') || info.type.includes('RxList'))) {
          listVariables.set(varName, {
            isNullable: info.isNullable,
            defLine: info.defLine
          });
        }
      });
    } else {
      // 自行收集（原有逻辑）
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();

        if (trimmedLine.startsWith('//') || trimmedLine.startsWith('*')) continue;

        // 模式 1：final/var/const/late 变量名 = List/RxList<T>()
        const pattern1 = /\b(final|var|const|late)\s+(\w+)\s*=\s*(RxList|List)<([^>]+)>/;
        const match1 = pattern1.exec(line);
        if (match1) {
          const varName = match1[2];
          const typeParam = match1[4];
          const isNullable = typeParam.includes('?');
          listVariables.set(varName, { isNullable, defLine: i + 1 });
        }

        // 模式 2：List<T>/RxList<T> 变量名 = ...
        const pattern2 = /\b(RxList|List)<([^>]+)>\s+(\w+)\s*[=;]/;
        const match2 = pattern2.exec(line);
        if (match2) {
          const typeParam = match2[2];
          const varName = match2[3];
          const isNullable = typeParam.includes('?');
          listVariables.set(varName, { isNullable, defLine: i + 1 });
        }
      }
    }

    // 阶段 2：检测 .first/.last 使用并检查空值保护
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;
      const trimmedLine = line.trim();

      // 排除纯注释行
      if (trimmedLine.startsWith('//') || trimmedLine.startsWith('*')) continue;

      // 移除行内注释来检测（保留代码部分）
      const codeOnly = line.split('//')[0].trim();
      if (!codeOnly) continue;

      // 检查是否有 .first/.last 使用（排除安全访问）
      if (!codeOnly.match(/\.(first|last)\b/)) continue;

      // 排除安全访问：
      // - ?.first / ?.last（可选链）
      // - firstOrNull / lastOrNull
      if (codeOnly.includes('?.first') || codeOnly.includes('?.last')) continue;
      if (codeOnly.includes('firstOrNull') || codeOnly.includes('lastOrNull')) continue;

      // 查找具体使用的变量名
      // 改进：支持多层属性访问，如 controller.searchClass.first
      // 匹配模式：(controller.searchClass).first 或 (searchClass).first
      // 注意：只匹配最后一个 .first/.last 前面的属性链
      const accessPattern = /((?:\w+\.)+\w+|\w+)\.(first|last)\b(?!\s*OrNull)/g;
      let accessMatch = accessPattern.exec(codeOnly);

      while (accessMatch !== null) {
        const fullVarPath = accessMatch[1]; // 完整属性路径，如 'controller.searchClass'
        const lastVarName = fullVarPath.split('.').pop(); // 最后一个属性名，如 'searchClass'
        const accessType = accessMatch[2];

        // 检查该变量是否是已知的 list 变量（使用最后一个属性名或完整路径）
        const varInfo = listVariables.get(fullVarPath) || listVariables.get(lastVarName);

        // 只检测已知变量或看起来像 list 变量的访问
        // （变量名包含 list、items、data 等常见 list 命名，或者以 s 结尾表示复数）
        const looksLikeList = /list|items|data|array|collection|entries|elements|records|rows|values|results|class/i.test(lastVarName);
        const endsWithS = lastVarName.endsWith('s') && lastVarName.length > 2;
        const isListVariable = varInfo || looksLikeList || endsWithS;

        if (!isListVariable) {
          accessMatch = accessPattern.exec(codeOnly);
          continue;
        }

        // 阶段 3：检查是否有空值保护（传入完整属性路径）
        const hasProtection = this.checkNullProtection(lines, i, fullVarPath);

        if (!hasProtection) {
          const isNullable = varInfo?.isNullable || false;
          const severity = isNullable ? 'error' : 'warning';

          issues.push({
            ruleId: 'DART-NULL-002',
            ruleName: isNullable ? 'Unsafe nullable list first/last access' : 'Unsafe list first/last access',
            severity: severity,
            message: isNullable
              ? `变量 '${fullVarPath}' 是 nullable list，使用 .${accessType} 在空列表或 null 元素时会抛出异常`
              : `使用 .${accessType} 在空列表上会抛出 StateError 异常`,
            suggestion: `使用 ?.${accessType}OrNull 或在访问前检查 ${fullVarPath}.isEmpty`,
            line: lineNumber,
            column: codeOnly.indexOf(`.${accessType}`) + 1,
            code: codeOnly,
            autoFix: false,
            context: {
              varName: fullVarPath,
              varDefLine: varInfo?.defLine,
              accessType,
              isNullable,
            },
          });
        }

        accessMatch = accessPattern.exec(codeOnly);
      }

      accessPattern.lastIndex = 0;
    }

    return issues;
  }

  /**
   * 检查变量在使用前是否有空值保护
   *
   * 检查范围：
   * - 同一行内的三元表达式保护（新增）
   * - 当前方法内的控制流（直到找到方法开始位置）
   * - 支持多层属性访问：controller.searchClass
   *
   * 保护模式：
   * - 同一行内的三元表达式：var.isNotEmpty ? var.first : xxx
   * - isEmpty / isNotEmpty 检查
   * - length > 0 / length != 0 检查
   * - ?. 操作符（可选链）
   * - ?? 空值合并
   * - if 条件块内的使用（条件必须包含对该变量的检查）
   * - guard clause：if (var.isEmpty) return; 后的代码
   *
   * 注意：if(true)、if(false) 等不包含变量检查的条件不被认为是保护
   *
   * @param {string[]} lines - 文件所有行
   * @param {number} useLineIndex - 使用 .first/.last 的行索引
   * @param {string} varName - 变量路径（支持多层属性，如 controller.searchClass）
   * @returns {boolean} 是否有空值保护
   */
  checkNullProtection(lines, useLineIndex, varName) {
    const currentLine = lines[useLineIndex];
    const currentIndent = currentLine.match(/^(\s*)/)?.[1]?.length || 0;

    // 检查当前行是否有安全操作符
    if (currentLine.includes(`?.`)) return true;
    if (currentLine.includes(`??`)) return true;
    if (currentLine.includes('OrNull')) return true;

    // 新增：检查同一行内的三元表达式保护
    // 模式：var.isNotEmpty ? var.first : xxx 或 var.isEmpty ? xxx : var.first
    if (this.checkTernaryProtection(currentLine, varName)) {
      return true;
    }

    // 向上查找控制流，检查是否有 isEmpty/isNotEmpty/length 检查
    // 改进：向上查找直到找到方法开始位置，而不是固定10行

    for (let i = useLineIndex - 1; i >= 0; i--) {
      const prevLine = lines[i];
      const trimmedPrevLine = prevLine.trim();
      const prevIndent = prevLine.match(/^(\s*)/)?.[1]?.length || 0;

      // 排除空行和注释
      if (!trimmedPrevLine || trimmedPrevLine.startsWith('//') || trimmedPrevLine.startsWith('*')) {
        continue;
      }

      // 检查是否遇到方法开始位置 - 多种方法声明模式
      // Dart 方法声明特征：
      // 1. void methodName() 或 Future<Type> methodName()
      // 2. Type methodName()（返回类型 + 方法名）
      // 3. _methodName()（私有方法）
      // 4. @override 注解后的方法
      // 5. async 关键字
      // 6. get/set 方法：Type get propertyName
      // 7. 构造函数：ClassName() 或 ClassName.named()
      const isMethodDeclaration =
        // 标准方法声明：返回类型 + 方法名 + 参数
        trimmedPrevLine.match(/^(void|Future|Stream|bool|int|String|List|Map|Set|Object|dynamic|Widget|State|BuildContext|Color|Alignment|EdgeInsets|Duration|async)\s+\w+\s*\(/) ||
        // 泛型返回类型：Future<Type>
        trimmedPrevLine.match(/^Future<[^>]+>\s+\w+\s*\(/) ||
        // 私有方法：_methodName()
        trimmedPrevLine.match(/^_\w+\s*\(/) ||
        // getter：Type get propertyName
        trimmedPrevLine.match(/^\w+\s+get\s+\w+/) ||
        // setter：set propertyName(Type value)
        trimmedPrevLine.match(/^set\s+\w+\s*\(/) ||
        // 构造函数：ClassName() 或 ClassName.named()
        trimmedPrevLine.match(/^\w+\s*(\.\w+)?\s*\(/) &&
        // 排除普通代码调用（构造函数通常紧跟在 class 后面）
        (i > 0 && lines[i-1].trim().match(/^class\s+\w+/) || lines[i-1].trim().match(/^@override/)) ||
        // @override 注解后一行通常是方法声明
        trimmedPrevLine.match(/^@override/) ||
        // 方法签名行（带 async）
        trimmedPrevLine.match(/\basync\s*\(/);

      // 如果遇到方法声明，停止查找（已经到达方法开始位置）
      if (isMethodDeclaration) {
        break;
      }

      // 如果遇到类声明结束符（缩进回到 class 级别），停止查找
      // 通常 class 内部方法缩进是 2，class 声明缩进是 0
      if (prevIndent === 0 && trimmedPrevLine === '}') {
        break;
      }

      // 如果遇到上一个方法的结束符 }（缩进与当前行相同或更小），停止查找
      // 这意味着已经跨出了当前方法范围
      if (trimmedPrevLine === '}' || trimmedPrevLine.endsWith('}')) {
        // 检查缩进，如果比当前行小，说明跨出了当前方法
        if (prevIndent < currentIndent) {
          break;
        }
      }

      // 检查 guard clause：if (var.isEmpty) return; 形式
      // guard clause 特征：if 条件后紧跟 return/throw
      if (trimmedPrevLine.includes('return') || trimmedPrevLine.includes('throw')) {
        // 检查这一行或前一行是否有针对该变量的 if 条件
        for (let j = i; j >= Math.max(0, i - 2); j--) {
          const checkLine = lines[j].trim();
          if (checkLine.match(/\bif\s*\(/)) {
            // 转义路径中的点号用于正则
            const escapedPath = varName.replace(/\./g, '\\.');
            const hasVarCheck = new RegExp(
              `${escapedPath}\\s*\\.(isEmpty|isNotEmpty|length)` +
              `|${escapedPath}\\s*(==|!=)\\s*(null|\\[\\])`,
              'i'
            );
            if (checkLine.match(hasVarCheck)) {
              // guard clause 成立，后续代码有保护
              return true;
            }
          }
        }
      }

      // 检查 if/while 条件中的空值判断
      if (trimmedPrevLine.match(/\bif\s*\(/) || trimmedPrevLine.match(/\bwhile\s*\(/)) {
        // 条件中必须包含对该变量的 isEmpty/isNotEmpty/length 检查才算保护
        // 排除无意义的条件如 if(true)、if(false)
        // 转义路径中的点号用于正则
        const escapedPath = varName.replace(/\./g, '\\.');
        const hasVarCheck = new RegExp(
          `${escapedPath}\\s*\\.(isEmpty|isNotEmpty|length)` +
          `|${escapedPath}\\s*(==|!=)\\s*(null|\\[\\])`,
          'i'
        );

        if (trimmedPrevLine.match(hasVarCheck)) {
          // 检查当前行是否在这个 if/while 块内（通过检查行缩进）
          // 当前行的缩进应该比 if 行的缩进大（表示在 if 块内部）
          if (currentIndent > prevIndent) {
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * 检查同一行内的三元表达式保护
   *
   * 安全模式：
   * - var.isNotEmpty ? var.first : xxx  （条件为真时访问 first，安全）
   * - var.isEmpty ? xxx : var.first     （条件为假时访问 first，安全）
   * - var.length > 0 ? var.first : xxx  （条件为真时访问 first，安全）
   * - var.length == 0 ? xxx : var.first （条件为假时访问 first，安全）
   * - 支持多层属性访问：controller.searchClass.isEmpty ? xxx : controller.searchClass.first
   *
   * @param {string} line - 当前行的代码
   * @param {string} varPath - 变量路径（可能是多层属性，如 controller.searchClass）
   * @returns {boolean} 是否有三元表达式保护
   */
  checkTernaryProtection(line, varPath) {
    // 移除行内注释
    const codeOnly = line.split('//')[0].trim();
    if (!codeOnly) return false;

    // 检查是否有三元表达式（包含 ? 和 :）
    if (!codeOnly.includes('?') || !codeOnly.includes(':')) return false;

    // 检查变量是否有 .first/.last 使用
    const hasFirstLastAccess = new RegExp(`${varPath.replace(/\./g, '\\.')}\\.(first|last)\\b`).test(codeOnly);
    if (!hasFirstLastAccess) return false;

    // 转义路径中的点号用于正则
    const escapedPath = varPath.replace(/\./g, '\\.');

    // 尝试解析三元表达式的结构
    // 简化处理：检查条件部分是否包含对变量的 isEmpty/isNotEmpty/length 检查

    // 模式1：var.isNotEmpty ? ... var.first ... : ...
    // 条件为真（非空）时访问 first，安全
    const pattern1 = new RegExp(
      `${escapedPath}\\.(isNotEmpty|length\\s*>\\s*0|length\\s*!=\\s*0)` +
      `\\s*\\?[^:]*${escapedPath}\\.(first|last)`,
      'i'
    );
    if (pattern1.test(codeOnly)) {
      return true;
    }

    // 模式2：var.isEmpty ? ... : ... var.first ...
    // 条件为假（非空）时访问 first，安全
    const pattern2 = new RegExp(
      `${escapedPath}\\.(isEmpty|length\\s*==\\s*0|length\\s*<=\\s*0)` +
      `\\s*\\?[^:]*:\\s*[^;]*${escapedPath}\\.(first|last)`,
      'i'
    );
    if (pattern2.test(codeOnly)) {
      return true;
    }

    // 模式3：var.isNotEmpty && var.first（逻辑 AND，非空时才访问）
    const pattern3 = new RegExp(
      `${escapedPath}\\.(isNotEmpty|length\\s*>\\s*0|length\\s*!=\\s*0)` +
      `\\s*&&\\s*${escapedPath}\\.(first|last)`,
      'i'
    );
    if (pattern3.test(codeOnly)) {
      return true;
    }

    // 模式4：!var.isEmpty && var.first（非空时才访问）
    const pattern4 = new RegExp(
      `!${escapedPath}\\.(isEmpty|length\\s*==\\s*0)` +
      `\\s*&&\\s*${escapedPath}\\.(first|last)`,
      'i'
    );
    if (pattern4.test(codeOnly)) {
      return true;
    }

    return false;
  }

  /**
   * DART-NULL-004: 强制解包检测
   *
   * 检测逻辑：
   * 1. 收集 nullable 变量定义
   * 2. 检测 ! 强制解包使用（var!. 或 var!）
   * 3. 检查使用前是否有 null 保护：
   *    - if (var != null) { ... }
   *    - var ?? defaultValue
   *    - var != null ? ... : ...
   *    - if (var == null) return;
   * 4. 严格模式：必须确认有 null 检查才不触发
   *
   * @param {string} content - 文件内容
   * @param {string} filePath - 文件路径
   * @param {Map} variableInfo - 变量信息
   * @returns {Array} 检测到的问题列表
   */
  analyzeDartForceUnwrap(content, filePath, variableInfo) {
    const issues = [];
    const lines = content.split('\n');

    // 收集 nullable 变量
    const nullableVars = new Map();
    if (variableInfo && variableInfo.size > 0) {
      variableInfo.forEach((info, varName) => {
        if (info.isNullable) {
          nullableVars.set(varName, info);
        }
      });
    }

    // 检测 ! 强制解包
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;
      const trimmedLine = line.trim();

      // 排除注释行
      if (trimmedLine.startsWith('//') || trimmedLine.startsWith('*')) continue;

      // 移除行内注释
      const codeOnly = line.split('//')[0].trim();
      if (!codeOnly) continue;

      // 匹配 ! 强制解包：var!.method 或 var!;
      // 注意：排除 ?. 和 ?? 等安全操作符
      if (codeOnly.includes('?.') || codeOnly.includes('??')) continue;

      // 正则：匹配 var! 后面跟 . 或 ; 或 ) 或其他
      const forceUnwrapPattern = /\b(\w+)!(?!\s*[;,)])/g;
      let match = forceUnwrapPattern.exec(codeOnly);

      while (match !== null) {
        const varName = match[1];

        // 检查是否是已知的 nullable 变量
        const varInfo = nullableVars.get(varName);
        const isNullableVar = varInfo !== undefined;

        // 严格模式：检查是否有 null 保护
        const hasProtection = this.checkNullProtectionForForceUnwrap(lines, i, varName);

        if (!hasProtection) {
          // 严格模式：只有确认没有保护才触发
          // 如果变量未知，仍然可能需要警告
          const severity = isNullableVar ? 'error' : 'warning';

          issues.push({
            ruleId: 'DART-NULL-004',
            ruleName: 'Force unwrap without null check',
            severity: severity,
            message: isNullableVar
              ? `变量 '${varName}' 是 nullable 类型，使用 ! 强制解包可能导致运行时错误`
              : `使用 ! 强制解包可能导致运行时错误，请确保变量不为 null`,
            suggestion: '使用 ?. 可选链 或 ?? 空值合并，或添加 null 检查',
            line: lineNumber,
            column: codeOnly.indexOf(`${varName}!`) + 1,
            code: codeOnly,
            autoFix: false,
            context: {
              varName,
              varDefLine: varInfo?.defLine,
              isNullableVar,
            },
          });
        }

        match = forceUnwrapPattern.exec(codeOnly);
      }

      forceUnwrapPattern.lastIndex = 0;
    }

    return issues;
  }

  /**
   * 检查强制解包是否有 null 保护
   *
   * @param {string[]} lines - 文件所有行
   * @param {number} useLineIndex - 使用 ! 的行索引
   * @param {string} varName - 变量名
   * @returns {boolean} 是否有 null 保护
   */
  checkNullProtectionForForceUnwrap(lines, useLineIndex, varName) {
    const currentLine = lines[useLineIndex];
    const currentIndent = currentLine.match(/^(\s*)/)?.[1]?.length || 0;

    // 检查当前行是否有安全操作符
    if (currentLine.includes(`?.`)) return true;
    if (currentLine.includes(`??`)) return true;
    if (currentLine.match(/\?\s*:/)) return true; // 三元运算符

    // 新增：检查同一行内的三元表达式保护
    // 模式：var != null ? var!.method : xxx 或 if (var != null) { var!.method }
    const codeOnly = currentLine.split('//')[0].trim();
    if (codeOnly) {
      // 检查同一行内的 null 检查保护
      // var != null ? var!.xxx : xxx
      const ternaryNullCheck = new RegExp(
        `${varName}\\s*!=\\s*null\\s*\\?[^:]*${varName}!`,
        'i'
      );
      if (ternaryNullCheck.test(codeOnly)) {
        return true;
      }
    }

    // 向上查找控制流，检查是否有 null 检查
    // 改进：向上查找直到找到方法开始位置，而不是固定10行

    for (let i = useLineIndex - 1; i >= 0; i--) {
      const prevLine = lines[i];
      const trimmedPrevLine = prevLine.trim();
      const prevIndent = prevLine.match(/^(\s*)/)?.[1]?.length || 0;

      // 排除空行和注释
      if (!trimmedPrevLine || trimmedPrevLine.startsWith('//') || trimmedPrevLine.startsWith('*')) {
        continue;
      }

      // 检查是否遇到方法开始位置 - 多种方法声明模式
      const isMethodDeclaration =
        trimmedPrevLine.match(/^(void|Future|Stream|bool|int|String|List|Map|Set|Object|dynamic|Widget|State|BuildContext|async)\s+\w+\s*\(/) ||
        trimmedPrevLine.match(/^Future<[^>]+>\s+\w+\s*\(/) ||
        trimmedPrevLine.match(/^_\w+\s*\(/) ||
        trimmedPrevLine.match(/^\w+\s+get\s+\w+/) ||
        trimmedPrevLine.match(/^set\s+\w+\s*\(/) ||
        trimmedPrevLine.match(/^@override/) ||
        trimmedPrevLine.match(/\basync\s*\(/);

      if (isMethodDeclaration) {
        break;
      }

      // 如果遇到类声明结束符，停止查找
      if (prevIndent === 0 && trimmedPrevLine === '}') {
        break;
      }

      // 如果遇到上一个方法的结束符 }（缩进比当前行小），停止查找
      if (trimmedPrevLine === '}' || trimmedPrevLine.endsWith('}')) {
        if (prevIndent < currentIndent) {
          break;
        }
      }

      // 检查 null 检查条件
      // if (var != null), if (var != null) {, if (var == null) return
      const nullCheckPattern = new RegExp(
        `if\\s*\\(${varName}\\s*(!=|==)\\s*null` +
        `|${varName}\\s*!=\\s*null` +
        `|${varName}\\s*==\\s*null\\s*(\\|\\||&&|return)`,
        'i'
      );

      if (trimmedPrevLine.match(nullCheckPattern)) {
        // 检查缩进，确认当前行在保护范围内
        if (currentIndent > prevIndent) {
          return true;
        }
      }

      // guard clause: if (var == null) return;
      if (trimmedPrevLine.includes('return') || trimmedPrevLine.includes('throw')) {
        for (let j = i; j >= Math.max(0, i - 2); j--) {
          const checkLine = lines[j].trim();
          if (checkLine.match(/\bif\s*\(/) && checkLine.match(new RegExp(`${varName}\\s*==\\s*null`, 'i'))) {
            // 这是 if (var == null) return 的 guard clause
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * DART-NULL-005: 多层属性访问空值保护检测
   *
   * 检测逻辑：
   * 1. 解析类定义，收集属性类型信息
   * 2. 检测多层属性访问（obj.prop1.prop2.prop3）
   * 3. 分析中间属性是否 nullable：
   *    - 检查 prop1 的类型定义是否为 Type?
   *    - 检查是否有 ?. 可选链保护
   * 4. 严格模式：中间有 nullable 属性且无 ?. 就触发
   *
   * @param {string} content - 文件内容
   * @param {string} filePath - 文件路径
   * @param {Object} typeInfo - 类型信息
   * @returns {Array} 检测到的问题列表
   */
  analyzeDartPropertyChain(content, filePath, typeInfo) {
    const issues = [];
    const lines = content.split('\n');

    // 检测多层属性访问（至少 3 层）
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;
      const trimmedLine = line.trim();

      // 排除注释行
      if (trimmedLine.startsWith('//') || trimmedLine.startsWith('*')) continue;

      // 移除行内注释
      const codeOnly = line.split('//')[0].trim();
      if (!codeOnly) continue;

      // 匹配多层属性访问：obj.prop1.prop2.prop3 或 obj?.prop1?.prop2?.prop3
      // 排除安全访问：如果整个链都用 ?.，则不触发
      const chainPattern = /\b(\w+)((?:\?\.\w+|\.\w+){2,})/g;
      let match = chainPattern.exec(codeOnly);

      while (match !== null) {
        const rootObj = match[1];
        const chain = match[2];
        const fullChain = rootObj + chain;

        // 检查是否有 ?. 安全访问
        // 严格模式：只要有 . 没有 ?. 就触发（中间属性可能 nullable）
        const unsafeAccessPattern = /\.\w+(?!\?)/g;
        const unsafeMatches = chain.match(unsafeAccessPattern);

        if (unsafeMatches && unsafeMatches.length > 0) {
          // 检查这些 unsafe 访问点
          // 解析链：obj.prop1.prop2.prop3
          const parts = fullChain.split(/[.?]/).filter(p => p);

          // 尝试从 typeInfo 查找中间属性的类型
          let foundNullableProp = false;
          let nullablePropName = '';

          if (typeInfo && typeInfo.classes) {
            // 遍历所有类，查找属性类型
            for (const className of Object.keys(typeInfo.classes)) {
              const classProps = typeInfo.classes[className].properties;

              for (let j = 0; j < parts.length - 1; j++) {
                const propName = parts[j];
                if (classProps[propName] && classProps[propName].isNullable) {
                  foundNullableProp = true;
                  nullablePropName = propName;
                  break;
                }
              }

              if (foundNullableProp) break;
            }
          }

          // 严格模式：即使没有找到类型信息，只要没有 ?. 就触发
          issues.push({
            ruleId: 'DART-NULL-005',
            ruleName: 'Unsafe property chain access',
            severity: 'warning',
            message: foundNullableProp
              ? `属性 '${nullablePropName}' 是 nullable 类型，访问 '${fullChain}' 缺少空值保护`
              : `多层属性访问 '${fullChain}' 缺少可选链保护，中间属性可能为 null`,
            suggestion: `使用可选链: ${fullChain.replace(/\./g, '?.')}`,
            line: lineNumber,
            column: codeOnly.indexOf(fullChain) + 1,
            code: codeOnly,
            autoFix: false,
            context: {
              fullChain,
              nullableProp: nullablePropName,
              hasNullableProp: foundNullableProp,
            },
          });
        }

        match = chainPattern.exec(codeOnly);
      }

      chainPattern.lastIndex = 0;
    }

    return issues;
  }

  /**
   * DART-NULL-006: late 变量初始化检测
   *
   * 检测逻辑：
   * 1. 收集 late 变量定义
   * 2. 检测 late 变量的使用位置
   * 3. 检查是否有初始化：
   *    - 构造函数中赋值
   *    - initState/onInit 等初始化方法中赋值
   *    - 使用前有赋值语句
   * 4. 严格模式：无法确认初始化就触发
   *
   * @param {string} content - 文件内容
   * @param {string} filePath - 文件路径
   * @param {Map} variableInfo - 变量信息
   * @returns {Array} 检测到的问题列表
   */
  analyzeDartLateVariable(content, filePath, variableInfo) {
    const issues = [];
    const lines = content.split('\n');

    // 收集 late 变量
    const lateVars = new Map();
    if (variableInfo && variableInfo.size > 0) {
      variableInfo.forEach((info, varName) => {
        if (info.isLate) {
          lateVars.set(varName, {
            ...info,
            initialized: false,
            initLines: [],
            useLines: []
          });
        }
      });
    }

    // 如果没有传入变量信息，自行收集 late 变量
    if (lateVars.size === 0) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();

        if (trimmedLine.startsWith('//') || trimmedLine.startsWith('*')) continue;

        const lateMatch = trimmedLine.match(/^late\s+(\w+)(\?)?\s+(\w+)/);
        if (lateMatch) {
          const type = lateMatch[1];
          const isNullable = lateMatch[2] === '?';
          const varName = lateMatch[3];
          lateVars.set(varName, {
            type,
            isNullable,
            defLine: i + 1,
            initialized: false,
            initLines: [],
            useLines: []
          });
        }
      }
    }

    // 如果没有 late 变量，直接返回
    if (lateVars.size === 0) return issues;

    // 查找构造函数和初始化方法的位置
    const constructorLine = this.findConstructorLine(lines);
    const initStateLine = this.findInitStateLine(lines);

    // 分析每个 late 变量的使用和初始化
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      if (trimmedLine.startsWith('//') || trimmedLine.startsWith('*')) continue;
      const codeOnly = line.split('//')[0].trim();

      for (const [varName, info] of lateVars) {
        // 排除定义行
        if (i + 1 === info.defLine) continue;

        // 检测变量使用（不包括赋值）
        // 使用模式：varName. 或 varName) 或 varName, 或单独的 varName
        const usePattern = new RegExp(`\\b${varName}\\b(?![^\\n]*=)`);
        if (codeOnly.match(usePattern)) {
          // 这是一个使用点，记录它
          info.useLines.push(i + 1);

          // 检查在此之前是否有初始化
          const hasInitBeforeUse = this.checkLateVarInitializedBeforeUse(
            lines, varName, info.defLine, i, constructorLine, initStateLine
          );

          if (!hasInitBeforeUse) {
            // 严格模式：无法确认初始化就触发
            issues.push({
              ruleId: 'DART-NULL-006',
              ruleName: 'Late variable potentially uninitialized',
              severity: 'warning',
              message: `late 变量 '${varName}' 在使用前可能未初始化，可能导致 LateInitializationError`,
              suggestion: '在构造函数或 initState 中初始化，或改用 nullable 类型 ?',
              line: i + 1,
              column: codeOnly.indexOf(varName) + 1,
              code: codeOnly,
              autoFix: false,
              context: {
                varName,
                varDefLine: info.defLine,
                useLine: i + 1,
              },
            });
          }
        }

        // 检测赋值（初始化）
        const assignPattern = new RegExp(`\\b${varName}\\s*=`);
        if (codeOnly.match(assignPattern)) {
          info.initLines.push(i + 1);
          info.initialized = true;
        }
      }
    }

    return issues;
  }

  /**
   * 查找构造函数行号
   */
  findConstructorLine(lines) {
    for (let i = 0; i < lines.length; i++) {
      const trimmedLine = lines[i].trim();
      if (trimmedLine.match(/^\w+\s*\(/) && trimmedLine.includes('this') || trimmedLine.match(/^constructor/)) {
        return i + 1;
      }
      // Dart 构造函数：ClassName() 或 ClassName.named()
      const classMatch = trimmedLine.match(/^(\w+)\s*\(/);
      if (classMatch) {
        // 检查是否是构造函数（通常紧接在类定义之后）
        for (let j = i - 5; j >= 0; j--) {
          if (lines[j].trim().match(/^class\s+(\w+)/)) {
            return i + 1;
          }
        }
      }
    }
    return -1;
  }

  /**
   * 查找 initState/onInit 方法行号
   */
  findInitStateLine(lines) {
    for (let i = 0; i < lines.length; i++) {
      const trimmedLine = lines[i].trim();
      if (trimmedLine.match(/void\s+initState\s*\(/) || trimmedLine.match(/onInit\s*\(/)) {
        return i + 1;
      }
    }
    return -1;
  }

  /**
   * 检查 late 变量在使用前是否已初始化
   */
  checkLateVarInitializedBeforeUse(lines, varName, defLine, useLine, constructorLine, initStateLine) {
    // 检查构造函数中是否有赋值
    if (constructorLine > 0 && constructorLine < useLine) {
      // 在构造函数范围内查找赋值
      const constructorIndent = lines[constructorLine - 1].match(/^(\s*)/)?.[1]?.length || 0;
      for (let i = constructorLine; i < useLine; i++) {
        const line = lines[i];
        const currentIndent = line.match(/^(\s*)/)?.[1]?.length || 0;
        if (currentIndent <= constructorIndent && line.trim() === '}') break;

        const assignPattern = new RegExp(`\\b${varName}\\s*=`);
        if (line.match(assignPattern)) {
          return true;
        }
      }
    }

    // 检查 initState/onInit 中是否有赋值
    if (initStateLine > 0 && initStateLine < useLine) {
      for (let i = initStateLine; i < useLine; i++) {
        const line = lines[i];
        if (line.trim() === '}') break;

        const assignPattern = new RegExp(`\\b${varName}\\s*=`);
        if (line.match(assignPattern)) {
          return true;
        }
      }
    }

    // 检查使用前是否有直接赋值
    for (let i = defLine; i < useLine; i++) {
      const line = lines[i];
      const assignPattern = new RegExp(`\\b${varName}\\s*=`);
      if (line.match(assignPattern)) {
        return true;
      }
    }

    return false;
  }

  /**
   * JS-NULL-001: 可选链缺失检测
   *
   * 检测逻辑：
   * 1. 检测多层属性访问（obj.prop1.prop2）
   * 2. 分析是否有 ?. 可选链保护
   * 3. 严格模式：没有 ?. 就触发警告
   *
   * @param {string} content - 文件内容
   * @param {string} filePath - 文件路径
   * @param {Map} variableInfo - 变量信息
   * @returns {Array} 检测到的问题列表
   */
  analyzeJSOptionalChain(content, filePath, variableInfo) {
    const issues = [];
    const lines = content.split('\n');

    // 检测多层属性访问
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;
      const trimmedLine = line.trim();

      if (trimmedLine.startsWith('//') || trimmedLine.startsWith('*')) continue;

      const codeOnly = line.split('//')[0].trim();
      if (!codeOnly) continue;

      // 匹配多层属性访问：obj.prop1.prop2 或 obj?.prop1?.prop2
      const chainPattern = /\b(\w+)((?:\?\.\w+|\.\w+){1,})/g;
      let match = chainPattern.exec(codeOnly);

      while (match !== null) {
        const chain = match[2];

        // 检查是否有不安全的访问（. 没有 ?.）
        if (chain.includes('.') && !chain.includes('?.')) {
          const fullChain = match[0];

          issues.push({
            ruleId: 'JS-NULL-001',
            ruleName: 'Unsafe property chain access',
            severity: 'warning',
            message: `属性访问 '${fullChain}' 缺少可选链保护，中间属性可能为 undefined`,
            suggestion: `使用可选链: ${fullChain.replace(/\./g, '?.')}`,
            line: lineNumber,
            column: codeOnly.indexOf(fullChain) + 1,
            code: codeOnly,
            autoFix: false,
          });
        }

        match = chainPattern.exec(codeOnly);
      }

      chainPattern.lastIndex = 0;
    }

    return issues;
  }

  /**
   * JS-NULL-002: .find() 返回值未处理检测
   *
   * 检测逻辑：
   * 1. 检测 .find() 调用
   * 2. 检查返回值是否有 undefined 处理
   * 3. 严格模式：直接使用返回值就触发
   *
   * @param {string} content - 文件内容
   * @param {string} filePath - 文件路径
   * @param {Map} variableInfo - 变量信息
   * @returns {Array} 检测到的问题列表
   */
  analyzeJSFindResult(content, filePath, variableInfo) {
    const issues = [];
    const lines = content.split('\n');

    // 检测 .find() 调用
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;
      const trimmedLine = line.trim();

      if (trimmedLine.startsWith('//') || trimmedLine.startsWith('*')) continue;

      const codeOnly = line.split('//')[0].trim();
      if (!codeOnly) continue;

      // 匹配 .find() 调用
      const findPattern = /\.find\s*\(/g;
      if (codeOnly.match(findPattern)) {
        // 检查是否有安全处理
        // 安全处理包括：?. , ?? , if check, || , && , :?, destructuring
        const hasSafeHandling =
          codeOnly.includes('?.') ||
          codeOnly.includes('??') ||
          codeOnly.match(/if\s*\(/) ||
          codeOnly.match(/\?\s*:/) ||
          codeOnly.match(/\|\|/) ||
          codeOnly.match(/&&\s*\w+\s*\.find/);

        if (!hasSafeHandling) {
          // 检查是否是赋值（变量可能被安全使用）
          const assignMatch = codeOnly.match(/(\w+)\s*=\s*\w+\.find/);
          if (assignMatch) {
            // 赋值后可能被安全使用，暂时不触发
            // 但可以在后续行检查该变量的使用
          } else {
            // 直接使用，触发警告
            issues.push({
              ruleId: 'JS-NULL-002',
              ruleName: 'Unsafe find result usage',
              severity: 'warning',
              message: `.find() 返回值可能为 undefined，缺少空值处理`,
              suggestion: '添加 null 检查或使用可选链 ?. 或空值合并 ??',
              line: lineNumber,
              column: codeOnly.indexOf('.find') + 1,
              code: codeOnly,
              autoFix: false,
            });
          }
        }
      }

      findPattern.lastIndex = 0;
    }

    return issues;
  }

  /**
   * Scan a directory recursively
   * @param {string} directoryPath - Directory path
   * @param {Object} options - Scan options
   * @returns {Promise<Array>} Array of scan results
   */
  async scanDirectory(directoryPath, options = {}) {
    const {
      recursive = true,
      excludeDirs = [
        'node_modules', '.git', 'dist', 'build', 'coverage',
        'ios', 'android', '.dart_tool', 'web', 'windows', 'macos', 'linux',
        '.vscode', '.idea', '.vs', 'Debug', 'Release', 'x64', 'arm64',
        'out', 'target', 'bin', 'obj', '.next', '.nuxt', '.cache',
        'tmp', 'temp', 'vendor', 'third_party', 'ThirdParty',
        // 添加更多排除目录
        '.fvm', 'flutter_build', '.flutter-plugins',
        '.packages', '.plugin_symlinks', '.dart_tool',
        'build', 'ios', 'android',
        '.generated', 'generated', '.genco',
      ],
      excludeFiles = [
        '.min.js', '.min.css', '.map', '.bundle',
        // Flutter/Dart 排除
        'main.dart.js', 'main.dart.js.map', 'flutter_build',
        'package_config.json', '.lock', '.log', 'LOCK', 'LOG',
        // 配置和缓存文件
        '.DS_Store', 'Thumbs.db', 'desktop.ini',
        // 图片文件（直接跳过）
        '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.bmp', '.tiff', '.tif',
        // 字体文件
        '.woff', '.woff2', '.ttf', '.eot', '.otf',
        // 媒体文件
        '.mp3', '.mp4', '.wav', '.avi', '.mov', '.mkv', '.webm', '.ogg',
        // 压缩文件
        '.zip', '.tar', '.gz', '.rar', '.7z',
        // 文档文件
        '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
      ],
      maxFileSize = Infinity,
      maxFiles = Infinity,
      onProgress = null,
      // New option for estimation mode
      estimateProgress = true,
    } = options;

    console.log(`[扫描配置] 排除目录: ${excludeDirs.join(', ')}`);
    console.log(`[扫描配置] 最大文件大小: 无限制`);

    const results = [];
    const fileQueue = []; // Use a queue instead of promises for better control
    let fileCount = 0;
    let skippedFiles = 0;
    let totalFiles = 0;

    console.log(`[扫描开始] ${directoryPath}`);
    const startTime = Date.now();

    // Single-pass directory traversal: collect files and count in one go
    const collectFiles = (dir) => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory()) {
            if (recursive && !excludeDirs.includes(entry.name)) {
              collectFiles(fullPath);
            }
          } else if (entry.isFile()) {
            if (this.isSupportedFile(fullPath)) {
              const excluded = excludeFiles.some(ext => fullPath.endsWith(ext));
              if (!excluded) {
                totalFiles++;
                fileQueue.push(fullPath);
              }
            }
          }
        }
      } catch (err) {
        console.error(`[目录扫描错误] ${dir}:`, err.message);
      }
    };

    // Collect all files in a single pass
    collectFiles(directoryPath);
    console.log(`[扫描统计] 发现 ${totalFiles} 个待扫描文件`);

    // Report initial progress
    if (onProgress) {
      onProgress({ scanned: 0, total: totalFiles, current: '', phase: 'scanning' });
    }

    // Process files in batches with progress tracking
    const batchSize = 20;
    const totalBatches = Math.ceil(fileQueue.length / batchSize);

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const startIdx = batchIndex * batchSize;
      const endIdx = Math.min(startIdx + batchSize, fileQueue.length);
      const batch = fileQueue.slice(startIdx, endIdx);

      // Process batch
      const batchPromises = batch.map(filePath =>
        this.scanFile(filePath).catch(err => {
          skippedFiles++;
          console.error(`[扫描错误] ${filePath}:`, err.message);
          return null;
        })
      );

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults.filter(r => r !== null));
      fileCount += batch.length;

      // Report progress after each batch
      if (onProgress) {
        const completedCount = Math.min(endIdx, fileQueue.length);
        const currentFile = results.length > 0 ? results[results.length - 1].filePath : batch[batch.length - 1];
        onProgress({
          scanned: completedCount,
          total: totalFiles,
          current: currentFile,
          phase: 'scanning',
          progress: ((completedCount / totalFiles) * 100).toFixed(1)
        });
      }

      // Small delay between batches to avoid blocking
      if (batchIndex < totalBatches - 1) {
        await new Promise(resolve => setTimeout(resolve, 5));
      }
    }

    const elapsed = Date.now() - startTime;
    console.log(`[扫描完成] 扫描了 ${fileCount} 个文件，发现 ${results.length} 个问题，耗时 ${elapsed}ms`);
    if (skippedFiles > 0) {
      console.log(`[扫描统计] ${skippedFiles} 个文件扫描失败`);
    }

    return results;
  }

  /**
   * Format scan results for UI display
   * @param {Array} results - Raw scan results
   * @returns {Object} Formatted results
   */
  formatResults(results) {
    // 安全检查：确保 results 是数组
    if (!results || !Array.isArray(results)) {
      console.error('[formatResults] Invalid results:', results);
      return {
        totalFiles: 0,
        filesWithIssues: 0,
        totalIssues: 0,
        issuesBySeverity: { error: 0, warning: 0, info: 0 },
        issues: [],
        summary: ['No valid scan results'],
      };
    }

    const formatted = {
      totalFiles: results.length,
      filesWithIssues: 0,
      totalIssues: 0,
      issuesBySeverity: {
        error: 0,
        warning: 0,
        info: 0,
      },
      issues: [],
      summary: [],
    };

    results.forEach((result) => {
      if (result.issues && result.issues.length > 0) {
        formatted.filesWithIssues++;
        formatted.totalIssues += result.issues.length;

        result.issues.forEach((issue) => {
          formatted.issuesBySeverity[issue.severity]++;
          formatted.issues.push({
            ...issue,
            filePath: result.filePath,
            language: result.language,
          });
        });
      }
    });

    // Generate summary
    formatted.summary = [
      `Scanned ${formatted.totalFiles} file(s)`,
      `Found ${formatted.totalIssues} issue(s) in ${formatted.filesWithIssues} file(s)`,
      `Errors: ${formatted.issuesBySeverity.error}`,
      `Warnings: ${formatted.issuesBySeverity.warning}`,
      `Info: ${formatted.issuesBySeverity.info}`,
    ];

    return formatted;
  }

  /**
   * Generate TODO comment for an issue
   * @param {Object} issue - Issue object
   * @returns {string} TODO comment string
   */
  generateTodo(issue) {
    const codeRef = issue.ruleId;
    const description = issue.message;
    const severity = issue.severity.toUpperCase();
    const suggestion = issue.suggestion ? `\n// Suggestion: ${issue.suggestion}` : '';

    return `// TODO [${severity}] [${codeRef}]: ${description}${suggestion}`;
  }

  /**
   * Insert TODO into file
   * @param {string} filePath - File path
   * @param {number} line - Line number (1-based)
   * @param {string} todo - TODO comment
   * @returns {boolean} Success status
   */
  insertTodo(filePath, line, todo) {
    try {
      if (!fs.existsSync(filePath)) {
        console.error(`[insertTodo] File not found: ${filePath}`);
        return false;
      }

      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');

      // Validate line number
      if (line < 1 || line > lines.length) {
        console.error(`[insertTodo] Invalid line number: ${line} (file has ${lines.length} lines)`);
        return false;
      }

      // Insert TODO at the specified line (line is 1-based)
      lines.splice(line - 1, 0, todo);

      // Write back to file
      fs.writeFileSync(filePath, lines.join('\n'), 'utf8');

      console.log(`[insertTodo] Inserted TODO at ${filePath}:${line}`);
      return true;
    } catch (error) {
      console.error(`[insertTodo] Failed to insert TODO:`, error.message);
      return false;
    }
  }

  /**
   * Scan file with AST parsing (with timeout protection)
   * @param {string} filePath - File path
   * @returns {Promise<Object>} Scan result with AST info
   */
  async scanFileWithAST(filePath) {
    // Check if it's actually a file (not a directory)
    try {
      const stats = fs.statSync(filePath);
      if (!stats.isFile()) {
        return {
          filePath,
          language: 'unknown',
          issues: [],
          error: 'Not a file',
        };
      }
      // Skip files larger than 5MB for AST scanning
      const maxFileSize = 5 * 1024 * 1024;
      if (stats.size > maxFileSize) {
        console.warn(`[Scanner] File too large for AST (${Math.round(stats.size / 1024 / 1024)}MB), skipping: ${filePath}`);
        return {
          filePath,
          language: this.getLanguage(filePath),
          issues: [],
          error: `文件过大 (${Math.round(stats.size / 1024 / 1024)}MB)，跳过 AST 解析`,
        };
      }
    } catch (error) {
      return {
        filePath,
        language: 'unknown',
        issues: [],
        error: `无法访问文件: ${error.message}`,
      };
    }

    // Use timeout to prevent hanging on problematic files
    const scanWithTimeout = new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        console.warn(`[Scanner] 扫描超时: ${filePath}`);
        resolve({
          filePath,
          language: this.getLanguage(filePath) || 'unknown',
          issues: [],
          error: '扫描超时 (10s)',
        });
      }, 10000); // 10 second timeout per file

      const doScan = async () => {
        try {
          const result = await this.doScanFileWithAST(filePath);
          clearTimeout(timeoutId);
          resolve(result);
        } catch (error) {
          clearTimeout(timeoutId);
          console.error(`[Scanner] Error scanning ${filePath}:`, error.message);
          resolve({
            filePath,
            language: this.getLanguage(filePath) || 'unknown',
            issues: [],
            error: error.message,
          });
        }
      };

      doScan();
    });

    return await scanWithTimeout;
  }

  /**
   * Internal method to scan file with AST (without timeout)
   */
  async doScanFileWithAST(filePath) {
    // 检查是否在 components 文件夹中 - 跳过规则扫描，只做 AST 解析
    const isComponentsFile = filePath.includes('/components/') ||
                              filePath.includes('\\components\\');

    if (isComponentsFile) {
      // components 文件夹只做 AST 解析，跳过规则扫描以提高性能
      const scanResult = {
        filePath,
        language: this.getLanguage(filePath),
        issues: [], // 跳过规则检查
        totalLines: 0,
        skipRules: true, // 标记跳过了规则检查
      };

      // 只进行 AST 解析
      if (this.enableASTParsing && this.astParser) {
        try {
          const astResult = this.astParser.parse(filePath);
          if (astResult) {
            const extractedInfo = this.astParser.extractInfo(astResult, filePath);
            scanResult.astInfo = extractedInfo;
          }
        } catch (error) {
          console.error(`AST parsing failed for ${filePath}:`, error.message);
          scanResult.astError = error.message;
        }
      }

      return scanResult;
    }

    // 其他文件正常扫描
    const scanResult = await this.scanFile(filePath);

    // Add AST parsing if enabled
    if (this.enableASTParsing && this.astParser && !scanResult.error) {
      try {
        const astResult = this.astParser.parse(filePath);
        if (astResult) {
          const extractedInfo = this.astParser.extractInfo(astResult, filePath);
          scanResult.astInfo = extractedInfo;
        }
      } catch (error) {
        console.error(`AST parsing failed for ${filePath}:`, error.message);
        scanResult.astError = error.message;
      }
    }

    return scanResult;
  }

  /**
   * Count files in directory (for progress tracking)
   * @param {string} directoryPath - Directory path
   * @param {Object} options - Options
   * @returns {number} File count
   */
  countFiles(directoryPath, options = {}) {
    const {
      recursive = true,
      excludeDirs = [],
      excludeFiles = [],
    } = options;

    let count = 0;
    const maxDepth = 100;
    const maxFiles = 500000;

    // 使用栈进行迭代式目录遍历
    const scanStack = [{ dir: directoryPath, depth: 0 }];
    const visitedDirs = new Set();
    visitedDirs.add(path.resolve(directoryPath));

    while (scanStack.length > 0 && count < maxFiles) {
      const { dir, depth } = scanStack.pop();

      if (depth > maxDepth) continue;

      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const resolvedPath = path.resolve(fullPath);

          if (entry.isDirectory()) {
            if (visitedDirs.has(resolvedPath)) continue;
            if (recursive && !excludeDirs.includes(entry.name)) {
              visitedDirs.add(resolvedPath);
              scanStack.push({ dir: fullPath, depth: depth + 1 });
            }
          } else if (entry.isFile()) {
            if (count >= maxFiles) break;

            // 检查是否是需要扫描的文件
            const isSupported = this.isSupportedFile(fullPath) ||
                               (this.astParser && this.astParser.isSupportedFile(fullPath));
            if (isSupported) {
              const excluded = excludeFiles.some(ext => fullPath.endsWith(ext));
              if (!excluded) {
                count++;
              }
            }
          }
        }
      } catch (err) {
        // 忽略无法访问的目录
      }
    }

    return count;
  }

  /**
   * 并行 + 增量扫描（高性能版本）
   * - 使用 Worker 线程池并行处理文件
   * - 基于现有代码图进行增量扫描
   * @param {string} directoryPath - 目录路径
   * @param {Object} options - 扫描选项
   * @returns {Promise<Object>} 扫描结果
   */
  async scanDirectoryWithASTOptimized(directoryPath, options = {}) {
    const {
      recursive = true,
      excludeDirs = [
        'node_modules', '.git', 'dist', 'build', 'coverage',
        '.dart_tool', '.fvm', 'flutter_build', '.flutter-plugins',
        '.packages', '.plugin_symlinks',
        'ios', 'android', 'web', 'windows', 'macos', 'linux',
        '.vscode', '.idea', '.vs', '.dartcode',
        'build', 'dist', 'out', 'target', 'bin', 'obj', 'Debug', 'Release', 'x64', 'arm64',
        '.next', '.nuxt', '.cache', 'tmp', 'temp',
        'vendor', 'third_party', 'ThirdParty', '.generated', 'generated',
        'e2e',
      ],
      excludeFiles = [
        '.min.js', '.min.css', '.map', '.bundle',
        'main.dart.js', 'main.dart.js.map', 'flutter_build',
        'package_config.json', '.lock', '.log', 'LOCK', 'LOG',
        '.DS_Store', 'Thumbs.db', 'desktop.ini',
        '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.bmp', '.tiff', '.tif',
        '.woff', '.woff2', '.ttf', '.eot', '.otf',
        '.mp3', '.mp4', '.wav', '.avi', '.mov', '.mkv', '.webm', '.ogg',
        '.zip', '.tar', '.gz', '.rar', '.7z',
        '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
      ],
      generateGraph = true,
      saveGraph = false,
      graphOutputPath = null,
      onProgress = null,
      enableParallel = true,  // 启用并行扫描
      enableIncremental = true, // 启用增量扫描
      maxWorkers = null, // null = 自动检测 CPU 数量
    } = options;

    console.log('[AST Scan Optimized] Starting optimized scan...');
    console.log(`[AST Scan Optimized] Parallel: ${enableParallel}, Incremental: ${enableIncremental}`);

    // Enable AST parsing if requested
    if (generateGraph && !this.enableASTParsing) {
      this.enableAST(options);
    }

    // 1. 收集所有文件路径
    console.log('[AST Scan Optimized] 收集文件路径...');
    const allFilePaths = this.collectFilePaths(directoryPath, {
      recursive,
      excludeDirs,
      excludeFiles,
    });
    console.log(`[AST Scan Optimized] 发现 ${allFilePaths.length} 个文件`);

    // 2. 检查是否有现有代码图（用于增量扫描）
    let existingCodeGraph = null;
    let existingScanData = null;
    let incrementalCache = null;

    // 使用统一的 DATA_DIR 模块
    const folderName = path.basename(directoryPath);
    const projectScanDir = path.join(DATA_DIR, 'AI_Scan_file', folderName);

    // 确保目录存在
    if (!fs.existsSync(projectScanDir)) {
      fs.mkdirSync(projectScanDir, { recursive: true });
    }

    if (enableIncremental) {
      // 从 D 盘读取代码图
      const graphPath = path.join(projectScanDir, '.code-graph.json');
      if (fs.existsSync(graphPath)) {
        try {
          const graphData = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
          existingCodeGraph = graphData;
          console.log('[AST Scan Optimized] 发现现有代码图，启用增量扫描');
        } catch (e) {
          console.warn('[AST Scan Optimized] 无法读取现有代码图:', e.message);
        }
      }

      // 初始化增量扫描器，缓存文件也保存到 D 盘
      if (!IncrementalScanner) {
        IncrementalScanner = require('./incremental-scanner');
      }
      incrementalCache = new IncrementalScanner({
        cacheFilePath: path.join(projectScanDir, '.scanner-cache.json'),
      });
    }

    // 3. 确定需要扫描的文件
    let filesToScan = allFilePaths;
    let cachedResults = {};

    if (enableIncremental && incrementalCache && existingCodeGraph) {
      // 使用增量扫描器过滤未变更的文件
      filesToScan = incrementalCache.getFilesToScan(allFilePaths);
      console.log(`[AST Scan Optimized] 增量扫描: ${filesToScan.length} 个文件需要扫描，${allFilePaths.length - filesToScan.length} 个文件使用缓存`);

      // 获取缓存结果
      cachedResults = incrementalCache.getCachedResults(allFilePaths);

      if (onProgress) {
        onProgress({
          scanned: 0,
          total: allFilePaths.length,
          current: `增量扫描: ${filesToScan.length} 个新/修改文件`,
          phase: 'scanning'
        });
      }
    }

    // 4. 并行扫描文件
    let scanResults = [];
    const startTime = Date.now();

    if (enableParallel && filesToScan.length > 5) {
      // 使用并行扫描器
      if (!ParallelScanner) {
        ParallelScanner = require('./parallel-scanner');
      }

      const parallelScanner = new ParallelScanner({
        maxWorkers: maxWorkers || Math.max(2, require('os').cpus().length - 1),
        workerTimeout: 60000, // 60s per file
      });

      console.log(`[AST Scan Optimized] 启动并行扫描，${filesToScan.length} 个文件`);

      try {
        scanResults = await parallelScanner.scanFiles(
          filesToScan,
          async (filePath) => this.scanFileWithAST(filePath),
          {
            onProgress: (progress) => {
              if (onProgress) {
                onProgress({
                  scanned: progress.completed,
                  total: allFilePaths.length,
                  current: `并行扫描中...`,
                  phase: 'scanning'
                });
              }
            }
          }
        );

        // 终止 workers
        parallelScanner.terminate();
      } catch (error) {
        console.error('[AST Scan Optimized] 并行扫描错误:', error.message);
        // 回退到串行扫描
        scanResults = await this.serialScanFiles(filesToScan, onProgress, allFilePaths.length);
      }
    } else {
      // 串行扫描
      console.log(`[AST Scan Optimized] 串行扫描，${filesToScan.length} 个文件`);
      scanResults = await this.serialScanFiles(filesToScan, onProgress, allFilePaths.length);
    }

    const elapsed = Date.now() - startTime;
    console.log(`[AST Scan Optimized] 扫描完成，耗时 ${Math.round(elapsed / 1000)}s`);

    // 5. 合并缓存结果和新的扫描结果
    const allResults = [...scanResults];
    const astExtractions = [];

    // 添加新的 AST 提取结果
    for (const result of scanResults) {
      if (result.astInfo) {
        astExtractions.push(result.astInfo);
      }
    }

    // 从现有代码图添加缓存的 AST 数据
    if (existingCodeGraph && enableIncremental) {
      const cachedPaths = Object.keys(cachedResults);
      console.log(`[AST Scan Optimized] 合并 ${cachedPaths.length} 个缓存文件的 AST 数据`);

      // 这里我们需要从缓存的代码图中提取 AST 信息
      // 简化处理：如果有现有代码图，我们将在代码图生成阶段合并
    }

    // 更新增量缓存
    if (incrementalCache && enableIncremental) {
      for (const result of scanResults) {
        if (result.filePath && !result.error) {
          incrementalCache.updateFileCache(result.filePath, result);
        }
      }
      incrementalCache.saveCache();
    }

    // 6. 生成代码图
    let codeGraph = null;
    if (generateGraph && this.codeGraphGenerator) {
      if (onProgress) {
        onProgress({
          scanned: allFilePaths.length,
          total: allFilePaths.length,
          current: '正在生成代码图...',
          phase: 'generating_graph'
        });
      }

      console.log(`[AST Scan Optimized] 生成代码图，${astExtractions.length} 个新文件`);

      try {
        // 如果有现有代码图，尝试合并
        if (existingCodeGraph && enableIncremental) {
          console.log('[AST Scan Optimized] 合并新旧代码图...');
          // TODO: 实现代码图合并逻辑
          // 暂时使用新的代码图
        }

        codeGraph = await this.codeGraphGenerator.generate(astExtractions, directoryPath);

        if (saveGraph && graphOutputPath) {
          this.codeGraphGenerator.saveToFile(graphOutputPath);
        }
      } catch (error) {
        console.error('[AST Scan Optimized] 代码图生成失败:', error.message);
        codeGraph = { error: error.message };
      }
    }

    // 7. 格式化结果
    const formatted = this.formatResults(allResults);

    return {
      ...formatted,
      codeGraph: codeGraph,
      astStats: {
        filesParsed: astExtractions.length,
        totalFiles: allFilePaths.length,
        fromCache: allFilePaths.length - filesToScan.length,
        scanTime: elapsed,
      },
    };
  }

  /**
   * 收集目录中所有文件路径
   */
  collectFilePaths(directoryPath, options = {}) {
    const {
      recursive = true,
      excludeDirs = [],
      excludeFiles = [],
    } = options;

    const filePaths = [];
    const maxDepth = 100;
    const scanStack = [{ dir: directoryPath, depth: 0 }];
    const visitedDirs = new Set();
    visitedDirs.add(path.resolve(directoryPath));

    while (scanStack.length > 0) {
      const { dir, depth } = scanStack.pop();

      if (depth > maxDepth) continue;

      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const resolvedPath = path.resolve(fullPath);

          if (entry.isDirectory()) {
            if (visitedDirs.has(resolvedPath)) continue;
            if (recursive && !excludeDirs.includes(entry.name)) {
              visitedDirs.add(resolvedPath);
              scanStack.push({ dir: fullPath, depth: depth + 1 });
            }
          } else if (entry.isFile()) {
            const excluded = excludeFiles.some(ext => fullPath.endsWith(ext));
            if (!excluded && this.astParser && this.astParser.isSupportedFile(fullPath)) {
              filePaths.push(fullPath);
            }
          }
        }
      } catch (error) {
        console.error(`[collectFilePaths] 目录读取失败 ${dir}:`, error.message);
      }
    }

    return filePaths;
  }

  /**
   * 串行扫描文件（回退方案）
   */
  async serialScanFiles(filePaths, onProgress, totalFiles) {
    const results = [];
    for (let i = 0; i < filePaths.length; i++) {
      const filePath = filePaths[i];
      try {
        const result = await this.scanFileWithAST(filePath);
        results.push(result);

        if (onProgress && (i % 50 === 0 || i < 5)) {
          onProgress({
            scanned: i + 1,
            total: totalFiles,
            current: filePath,
            phase: 'scanning'
          });
        }

        if (i % 50 === 0 && this.astParser) {
          this.astParser.clearCache();
          if (global.gc) global.gc();
        }
      } catch (error) {
        console.error(`[serialScanFiles] 文件扫描失败 ${filePath}:`, error.message);
        results.push({ filePath, error: error.message });
      }
    }
    return results;
  }

  /**
   * Scan directory with AST parsing and code graph generation
   * @param {string} directoryPath - Directory path
   * @param {Object} options - Scan options
   * @returns {Promise<Object>} Complete scan results with code graph
   */
  async scanDirectoryWithAST(directoryPath, options = {}) {
    const {
      recursive = true,
      excludeDirs = [
        'node_modules', '.git', 'dist', 'build', 'coverage',
        // Flutter/Dart 排除
        '.dart_tool', '.fvm', 'flutter_build', '.flutter-plugins',
        '.packages', '.plugin_symlinks',
        // iOS/Android 排除
        'ios', 'android', 'web', 'windows', 'macos', 'linux',
        // IDE 排除
        '.vscode', '.idea', '.vs', '.dartcode',
        // 构建输出排除
        'build', 'dist', 'out', 'target', 'bin', 'obj', 'Debug', 'Release', 'x64', 'arm64',
        // 缓存排除
        '.next', '.nuxt', '.cache', 'tmp', 'temp',
        // 其他排除
        'vendor', 'third_party', 'ThirdParty', '.generated', 'generated',
        // e2e 排除（空文件夹可能导致扫描问题）
        'e2e',
      ],
      excludeFiles = [
        '.min.js', '.min.css', '.map', '.bundle',
        // Flutter/Dart 排除
        'main.dart.js', 'main.dart.js.map', 'flutter_build',
        'package_config.json', '.lock', '.log', 'LOCK', 'LOG',
        // 配置和缓存文件
        '.DS_Store', 'Thumbs.db', 'desktop.ini',
        // 图片文件（直接跳过）
        '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.bmp', '.tiff', '.tif',
        // 字体文件
        '.woff', '.woff2', '.ttf', '.eot', '.otf',
        // 媒体文件
        '.mp3', '.mp4', '.wav', '.avi', '.mov', '.mkv', '.webm', '.ogg',
        // 压缩文件
        '.zip', '.tar', '.gz', '.rar', '.7z',
        // 文档文件
        '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
      ],
      generateGraph = true,
      saveGraph = false,
      graphOutputPath = null,
      onProgress = null,
      // 优化选项
      enableOptimizedScan = false, // 暂时禁用优化扫描（待修复 Worker 中 AST 解析问题）
      enableParallel = false,      // 暂时禁用并行扫描（Worker 中 AST 解析存在问题）
      enableIncremental = false,   // 暂时禁用增量扫描
      maxWorkers = null,           // Worker 线程数量（null = 自动）
    } = options;

    // 如果启用优化扫描，使用优化版本
    if (enableOptimizedScan) {
      console.log('[AST Scan] Using optimized scan (parallel + incremental)');
      return this.scanDirectoryWithASTOptimized(directoryPath, {
        ...options,
        enableParallel,
        enableIncremental,
        maxWorkers,
      });
    }

    // Enable AST parsing if requested
    if (generateGraph && !this.enableASTParsing) {
      this.enableAST(options);
    }

    // 首先统计实际文件数（用于进度显示）
    console.log('[AST Scan] 正在统计文件数量...');
    const totalFileCount = this.countFiles(directoryPath, {
      recursive,
      excludeDirs,
      excludeFiles,
    });
    console.log(`[AST Scan] 发现 ${totalFileCount} 个待扫描文件`);

    // Scan all files with AST (使用迭代而非递归，避免栈溢出)
    const results = [];
    const astExtractions = [];
    const maxDepth = 100; // 限制最大深度（增加到100层）
    const maxFiles = 500000; // 限制最大文件数（500000个文件）
    let fileCount = 0;

    // 报告初始进度
    if (onProgress) {
      onProgress({ scanned: 0, total: totalFileCount, current: '正在初始化...', phase: 'scanning' });
    }

    // 使用栈进行迭代式目录遍历，避免递归导致的栈溢出
    const scanStack = [{ dir: directoryPath, depth: 0 }];
    const visitedDirs = new Set(); // 防止符号链接导致的循环
    visitedDirs.add(path.resolve(directoryPath));

    while (scanStack.length > 0 && fileCount < maxFiles) {
      const { dir, depth } = scanStack.pop();

      // 检查深度限制
      if (depth > maxDepth) {
        console.warn(`[AST Scan] 达到最大深度限制 ${maxDepth}，跳过 ${dir}`);
        continue;
      }

      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const resolvedPath = path.resolve(fullPath);

          if (entry.isDirectory()) {
            // 检查是否已访问过（防止符号链接循环）
            if (visitedDirs.has(resolvedPath)) {
              console.warn(`[AST Scan] 检测到循环引用，跳过 ${fullPath}`);
              continue;
            }

            if (recursive && !excludeDirs.includes(entry.name)) {
              visitedDirs.add(resolvedPath);
              scanStack.push({ dir: fullPath, depth: depth + 1 });
            }
          } else if (entry.isFile()) {
            // 检查文件数量限制
            if (fileCount >= maxFiles) {
              console.warn(`[AST Scan] 达到最大文件数限制 ${maxFiles}，停止扫描`);
              break;
            }

            try {
              if (this.astParser && this.astParser.isSupportedFile(fullPath)) {
                const excluded = excludeFiles.some(ext => fullPath.endsWith(ext));
                if (!excluded) {
                  // 每 100 个文件报告一次进度
                  if (fileCount % 100 === 0) {
                    console.log(`[AST Scan] 进度: 已扫描 ${fileCount}/${totalFileCount} 个文件`);
                  }

                  const scanResult = await this.scanFileWithAST(fullPath);
                  results.push(scanResult);

                  // 收集 AST 解析结果用于生成代码图
                  if (scanResult.astInfo) {
                    astExtractions.push(scanResult.astInfo);
                  }

                  fileCount++;

                  // 节流的进度更新 - 每 100 个文件更新一次，避免 IPC 消息过载
                  // 使用实际文件总数作为 total
                  if (onProgress && (fileCount % 100 === 0 || fileCount < 5)) {
                    onProgress({ scanned: fileCount, total: totalFileCount, current: fullPath, phase: 'scanning' });
                  }

                  // 释放内存：定期清理 AST 解析器缓存
                  if (fileCount % 50 === 0 && this.astParser) {
                    this.astParser.clearCache();
                    // 强制垃圾回收（如果可用）
                    if (global.gc) {
                      global.gc();
                    }
                  }
                }
              } else if (this.isSupportedFile(fullPath)) {
                // 非 AST 支持的文件进行常规扫描
                const excluded = excludeFiles.some(ext => fullPath.endsWith(ext));
                if (!excluded) {
                  const scanResult = await this.scanFile(fullPath);
                  results.push(scanResult);
                  fileCount++;
                }
              }
            } catch (fileError) {
              console.error(`[AST Scan] 文件扫描失败 ${fullPath}:`, fileError.message);
              // 继续处理其他文件，不中断整个扫描
            }
          }

          // 如果达到文件数限制，跳出循环
          if (fileCount >= maxFiles) {
            break;
          }
        }
      } catch (dirError) {
        console.error(`[AST Scan] 目录读取失败 ${dir}:`, dirError.message);
      }
    }

    // 扫描完成，发送最终进度更新
    console.log(`[AST Scan] 文件扫描完成，共处理 ${fileCount}/${totalFileCount} 个文件`);
    if (onProgress) {
      onProgress({
        scanned: fileCount,
        total: totalFileCount,
        current: `扫描完成，已处理 ${fileCount} 个文件`,
        phase: 'scan_complete'
      });
      console.log(`[AST Scan] 已发送扫描完成进度更新`);
    }

    // Generate code graph (限制处理的文件数量，避免内存溢出)
    let codeGraph = null;
    if (generateGraph && this.codeGraphGenerator && astExtractions.length > 0) {
      try {
        // 发送进度更新：开始生成代码图
        if (onProgress) {
          onProgress({
            scanned: fileCount,
            total: totalFileCount,
            current: '正在生成代码图...',
            phase: 'generating_graph'
          });
        }

        console.log(`[AST Scan] 开始生成代码图，处理 ${astExtractions.length} 个文件的 AST 数据`);

        // 分批处理，避免一次性处理太多数据导致内存溢出
        const maxFilesForGraph = 20000; // 限制最大处理文件数（增加到20000）
        const limitedExtractions = astExtractions.slice(0, maxFilesForGraph);

        if (astExtractions.length > maxFilesForGraph) {
          console.warn(`[AST Scan] 文件数量超过限制 (${maxFilesForGraph})，仅处理前 ${maxFilesForGraph} 个文件`);
        }

        // 使用 await 等待异步代码图生成完成
        codeGraph = await this.codeGraphGenerator.generate(limitedExtractions, directoryPath);

        // Save graph if explicitly requested with outputPath (不再保存到项目目录)
        if (saveGraph && graphOutputPath) {
          try {
            this.codeGraphGenerator.saveToFile(graphOutputPath);
            codeGraph.savedTo = graphOutputPath;
            console.log(`[AST Scan] 代码图已保存到 ${graphOutputPath}`);
          } catch (saveError) {
            console.error('[AST Scan] 保存代码图失败:', saveError.message);
          }
        }
      } catch (error) {
        console.error('Code graph generation failed:', error.message);
        console.error('Code graph generation error stack:', error.stack);
        codeGraph = { error: error.message };
      }
    }

    // 注意：不在这里发送完成信号，让 main.js 在返回结果后发送
    // 这样可以确保前端先收到结果，再收到完成信号

    // Format regular scan results
    const formatted = this.formatResults(results);

    // 计算 AST 统计信息（使用限制的数据）
    const statsData = astExtractions.slice(0, 1000); // 限制统计的文件数量
    return {
      ...formatted,
      codeGraph: codeGraph,
      astStats: {
        filesParsed: astExtractions.length,
        totalFunctions: statsData.reduce((sum, e) => sum + (e.functions?.length || 0), 0),
        totalClasses: statsData.reduce((sum, e) => sum + (e.classes?.length || 0), 0),
        totalImports: statsData.reduce((sum, e) => sum + (e.imports?.length || 0), 0),
        totalExports: statsData.reduce((sum, e) => sum + (e.exports?.length || 0), 0),
        totalApiCalls: statsData.reduce((sum, e) => sum + (e.apiCalls?.length || 0), 0),
        totalRoutes: statsData.reduce((sum, e) => sum + (e.routes?.length || 0), 0),
      },
    };
  }

  /**
   * Get file structure from directory
   * @param {string} directoryPath - Directory path
   * @param {Object} options - Options
   * @returns {Object} File structure tree
   */
  getFileStructure(directoryPath, options = {}) {
    const {
      recursive = true,
      excludeDirs = [
        'node_modules', '.git', 'dist', 'build', 'coverage',
        // Flutter/Dart 排除
        '.dart_tool', '.fvm', 'flutter_build', '.flutter-plugins',
        '.packages', '.plugin_symlinks',
        // iOS/Android 排除
        'ios', 'android', 'web', 'windows', 'macos', 'linux',
        // IDE 排除
        '.vscode', '.idea', '.vs', '.dartcode',
        // 构建输出排除
        'build', 'out', 'target', 'bin', 'obj', 'Debug', 'Release', 'x64', 'arm64',
        // 缓存排除
        '.next', '.nuxt', '.cache', 'tmp', 'temp',
        // 其他排除
        'vendor', 'third_party', 'ThirdParty', '.generated', 'generated',
        // e2e 排除（空文件夹可能导致扫描问题）
        'e2e',
      ],
      includeStats = true,
    } = options;

    const buildTree = (dir, relativePath = '') => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const result = {
        name: path.basename(dir),
        path: dir,
        relativePath: relativePath || '.',
        type: 'directory',
        children: [],
      };

      if (includeStats) {
        try {
          const stats = fs.statSync(dir);
          result.stats = {
            size: stats.size,
            modified: stats.mtime.toISOString(),
          };
        } catch (error) {
          // Skip stats if unavailable
        }
      }

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const childRelativePath = relativePath ? path.join(relativePath, entry.name) : entry.name;

        if (entry.isDirectory()) {
          if (recursive && !excludeDirs.includes(entry.name)) {
            result.children.push(buildTree(fullPath, childRelativePath));
          }
        } else if (entry.isFile()) {
          const file = {
            name: entry.name,
            path: fullPath,
            relativePath: childRelativePath,
            type: 'file',
            extension: path.extname(entry.name),
            language: this.getLanguage(fullPath),
          };

          if (includeStats) {
            try {
              const stats = fs.statSync(fullPath);
              file.stats = {
                size: stats.size,
                modified: stats.mtime.toISOString(),
              };
            } catch (error) {
              // Skip stats if unavailable
            }
          }

          result.children.push(file);
        }
      }

      // Sort children: directories first, then files, both alphabetically
      result.children.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });

      return result;
    };

    return buildTree(directoryPath);
  }

  /**
   * Analyze code dependencies
   * @param {string} directoryPath - Directory path
   * @param {Object} options - Options
   * @returns {Object} Dependency analysis
   */
  async analyzeDependencies(directoryPath, options = {}) {
    const scanResult = await this.scanDirectoryWithAST(directoryPath, {
      ...options,
      generateGraph: true,
    });

    if (!scanResult.codeGraph || scanResult.codeGraph.error) {
      return {
        error: 'Failed to generate code graph for dependency analysis',
      };
    }

    const graph = scanResult.codeGraph;
    const dependencies = {
      external: new Set(),
      internal: new Map(),
      circular: [],
      unused: [],
    };

    // Analyze imports
    for (const node of graph.nodes || []) {
      if (node.type === 'import') {
        if (node.isExternal) {
          dependencies.external.add(node.source);
        } else if (node.resolvedPath) {
          const key = node.resolvedPath;
          dependencies.internal.set(key, (dependencies.internal.get(key) || 0) + 1);
        }
      }
    }

    // Find circular dependencies
    if (this.codeGraphGenerator) {
      const cycles = this.codeGraphGenerator.findCircularDependencies();
      dependencies.circular = cycles;
    }

    return {
      externalPackages: Array.from(dependencies.external).sort(),
      internalFiles: Array.from(dependencies.internal.entries())
        .map(([path, count]) => ({ path, count }))
        .sort((a, b) => b.count - a.count),
      circularDependencies: dependencies.circular,
      totalExternal: dependencies.external.size,
      totalInternal: dependencies.internal.size,
    };
  }

  /**
   * Export scan results for knowledge base
   * @param {Object} scanResults - Scan results
   * @returns {Object} Knowledge base entry
   */
  exportToKnowledgeBase(scanResults) {
    const entry = {
      type: 'code_scan',
      timestamp: new Date().toISOString(),
      summary: {
        totalFiles: scanResults.totalFiles,
        filesWithIssues: scanResults.filesWithIssues,
        totalIssues: scanResults.totalIssues,
        issuesBySeverity: scanResults.issuesBySeverity,
      },
      issues: scanResults.issues || [],
    };

    // Add code graph if available
    if (scanResults.codeGraph && !scanResults.codeGraph.error) {
      entry.codeGraph = {
        metadata: scanResults.codeGraph.metadata,
        stats: scanResults.codeGraph.metadata,
      };
    }

    // Add AST stats if available
    if (scanResults.astStats) {
      entry.astStats = scanResults.astStats;
    }

    return entry;
  }

  /**
   * Scan project information (versions, dependencies, etc.)
   * @param {string} projectPath - Project path
   * @returns {Object} Project information
   */
  async scanProjectInfo(projectPath) {
    // Enable project scanner if not already enabled
    if (!this.projectScanner) {
      this.enableProjectScanner();
    }

    if (!this.projectScanner) {
      return {
        success: false,
        error: 'Project scanner not available',
      };
    }

    try {
      const projectInfo = await this.projectScanner.scan(projectPath);

      return {
        success: true,
        ...projectInfo,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Scan a list of specific files
   * Used for partial scanning functionality
   * @param {string[]} filePaths - Array of file paths to scan
   * @param {Object} options - Scan options
   * @returns {Promise<Array>} Array of scan results
   */
  async scanFileList(filePaths, options = {}) {
    const {
      onProgress = null,
      useAST = false,
    } = options;

    console.log(`[Scanner] scanFileList 收到 ${filePaths.length} 个文件`);
    const results = [];

    for (let i = 0; i < filePaths.length; i++) {
      const filePath = filePaths[i];

      try {
        // Check if file exists
        if (!fs.existsSync(filePath)) {
          console.warn(`[Scanner] 文件不存在: ${filePath}`);
          continue;
        }

        // Check if file is supported
        if (!this.isSupportedFile(filePath)) {
          console.log(`[Scanner] 不支持的文件类型: ${filePath}`);
          continue;
        }

        // Scan the file
        const scanResult = await this.scanFile(filePath);

        if (scanResult && scanResult.issues && scanResult.issues.length > 0) {
          results.push(scanResult);
        }

        // Report progress
        if (onProgress && (i % 10 === 0 || i === filePaths.length - 1)) {
          onProgress({
            scanned: i + 1,
            total: filePaths.length,
            current: filePath,
            phase: 'scanning_files'
          });
        }
      } catch (error) {
        console.error(`[Scanner] 扫描文件失败 ${filePath}:`, error.message);
      }
    }

    console.log(`[Scanner] scanFileList 完成，共扫描 ${results.length} 个有问题的文件`);
    return results;
  }
}

module.exports = CodeScanner;
