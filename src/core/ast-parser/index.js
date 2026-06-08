/**
 * AST Parser Module
 *
 * Responsibilities:
 * - Parse AST for JavaScript/TypeScript/Vue/Dart files
 * - Extract code structure information
 * - Support multiple languages via appropriate parsers
 *
 * Supported Languages:
 * - JavaScript (ES6+)
 * - TypeScript
 * - JSX/TSX
 * - Vue (SFC)
 * - Dart
 */

const fs = require('fs');
const path = require('path');
const config = require('../../config/scanner-limits');
const { getLogger } = require('../utils/logger');
const { ASTParseError, CacheError, ErrorFactory } = require('../errors/scanner-errors');

class ASTParser {
  constructor(options = {}) {
    this.parsers = new Map();
    this.supportedExtensions = config.scanner.supportedExtensions;
    this.parserCache = new Map();

    // Merge user options with config defaults
    const configOptions = config.astParser;
    this.options = {
      maxCacheSize: options.maxCacheSize ?? configOptions.maxCacheSize,
      cacheTTL: options.cacheTTL ?? configOptions.cacheTTL,
      enableCache: options.enableCache ?? configOptions.enableCache,
    };

    this.cacheAccessLog = new Map(); // Track access for LRU

    // Initialize logger
    this.logger = getLogger('ASTParser', {
      level: config.logging.componentLevels['ASTParser'],
    });

    this.initParsers();
  }

  /**
   * Initialize parsers for different languages
   */
  initParsers() {
    try {
      // Try to load @babel/parser for JS/TS/JSX
      const babelParser = require('@babel/parser');
      this.parsers.set('javascript', babelParser);
      this.parsers.set('typescript', babelParser);
      this.parsers.set('jsx', babelParser);
      this.parsers.set('tsx', babelParser);
      this.babelParserAvailable = true;
      this.logger.debug('Babel parser loaded');
    } catch (error) {
      this.logger.warn('Babel parser not available, limited AST parsing support', {
        error: error.message,
      });
      this.babelParserAvailable = false;
    }

    try {
      // Try to load Vue compiler for Vue SFC
      const vueCompiler = require('@vue/compiler-dom');
      this.parsers.set('vue', vueCompiler);
      this.vueParserAvailable = true;
      this.logger.debug('Vue compiler loaded');
    } catch (error) {
      this.logger.warn('Vue compiler not available, Vue SFC parsing limited', {
        error: error.message,
      });
      this.vueParserAvailable = false;
    }

    try {
      // Load Dart parser
      const DartParser = require('./dart-parser');
      this.dartParser = new DartParser();
      this.parsers.set('dart', this.dartParser);
      this.dartParserAvailable = true;
      this.logger.debug('Dart parser loaded');
    } catch (error) {
      this.logger.warn('Dart parser not available', { error: error.message });
      this.dartParserAvailable = false;
    }
  }

  /**
   * Get language from file extension
   * @param {string} filePath - File path
   * @returns {string} Language identifier
   */
  getLanguage(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const languageMap = {
      '.js': 'javascript',
      '.mjs': 'javascript',
      '.cjs': 'javascript',
      '.jsx': 'jsx',
      '.ts': 'typescript',
      '.tsx': 'tsx',
      '.vue': 'vue',
      '.dart': 'dart',
    };
    return languageMap[ext] || 'javascript';
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
   * Parse a file and return AST
   * @param {string} filePath - File path
   * @param {string} content - File content (optional, will read if not provided)
   * @returns {Object|null} AST or null if parsing fails
   */
  parse(filePath, content = null) {
    if (!this.isSupportedFile(filePath)) {
      return null;
    }

    // Read content if not provided
    if (content === null) {
      try {
        const stats = fs.statSync(filePath);
        const maxSize = 1024 * 1024; // 1MB limit for AST parsing
        if (stats.size > maxSize) {
          console.warn(`[AST Parser] File too large (${Math.round(stats.size / 1024)}KB), skipping AST: ${filePath}`);
          return null;
        }
        content = fs.readFileSync(filePath, 'utf8');
      } catch (error) {
        console.error(`Failed to read file ${filePath}:`, error.message);
        return null;
      }
    }

    const language = this.getLanguage(filePath);

    // Skip parsing if content is too large (>100KB for safety)
    if (content.length > 100 * 1024) {
      console.warn(`[AST Parser] Content too large (${Math.round(content.length / 1024)}KB), skipping: ${filePath}`);
      return null;
    }

    // Generate cache key for potential use
    const cacheKey = this.getCacheKey(filePath, content);

    // Check cache first (if enabled)
    if (this.options.enableCache) {
      const cached = this.getCachedResult(cacheKey);
      if (cached) {
        return cached;
      }
    }

    let ast = null;

    try {
      switch (language) {
        case 'javascript':
        case 'typescript':
        case 'jsx':
        case 'tsx':
          ast = this.parseBabel(content, language);
          break;
        case 'vue':
          ast = this.parseVue(content, filePath);
          break;
        case 'dart':
          ast = this.parseDart(content, filePath);
          break;
        default:
          ast = this.parseBasic(content, language);
      }
    } catch (error) {
      console.error(`Failed to parse ${filePath}:`, error.message);
      ast = null; // Return null instead of trying parseBasic which might also fail
    }

    // Cache result (if enabled)
    if (ast && this.options.enableCache) {
      this.setCachedResult(cacheKey, ast);
    }

    return ast;
  }

  /**
   * Generate cache key for a file
   * @param {string} filePath - File path
   * @param {string} content - File content
   * @returns {string} Cache key
   */
  getCacheKey(filePath, content) {
    // Use file path + content hash + modification time for better cache accuracy
    let mtime = 0;
    try {
      const stats = fs.statSync(filePath);
      mtime = stats.mtimeMs;
    } catch (error) {
      // File might not exist or be inaccessible
    }

    // Simple hash of content (using length for now, could use crypto)
    const contentHash = content.length;

    return `${filePath}:${contentHash}:${mtime}`;
  }

  /**
   * Get cached result with expiration check
   * @param {string} cacheKey - Cache key
   * @returns {Object|null} Cached result or null
   */
  getCachedResult(cacheKey) {
    const cached = this.parserCache.get(cacheKey);

    if (!cached) {
      return null;
    }

    // Check if expired
    const now = Date.now();
    if (now - cached.timestamp > this.options.cacheTTL) {
      this.parserCache.delete(cacheKey);
      this.cacheAccessLog.delete(cacheKey);
      return null;
    }

    // Update access time for LRU
    this.cacheAccessLog.set(cacheKey, now);

    return cached.data;
  }

  /**
   * Set cached result with automatic cache size management
   * @param {string} cacheKey - Cache key
   * @param {Object} data - Data to cache
   */
  setCachedResult(cacheKey, data) {
    const now = Date.now();

    // Check if cache is full
    if (this.parserCache.size >= this.options.maxCacheSize) {
      this.evictLRU();
    }

    // Store in cache
    this.parserCache.set(cacheKey, {
      data,
      timestamp: now,
    });
    this.cacheAccessLog.set(cacheKey, now);
  }

  /**
   * Evict least recently used cache entry
   */
  evictLRU() {
    let oldestKey = null;
    let oldestTime = Infinity;

    for (const [key, time] of this.cacheAccessLog.entries()) {
      if (time < oldestTime) {
        oldestTime = time;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.parserCache.delete(oldestKey);
      this.cacheAccessLog.delete(oldestKey);
    }
  }

  /**
   * Parse JavaScript/TypeScript using Babel
   * @param {string} content - File content
   * @param {string} language - Language type
   * @returns {Object|null} AST or null
   */
  parseBabel(content, language) {
    if (!this.babelParserAvailable) {
      return this.parseBasic(content, language);
    }

    try {
      const babelParser = this.parsers.get('javascript');

      const plugins = [];
      if (language === 'typescript' || language === 'tsx') {
        plugins.push('typescript');
      }
      if (language === 'jsx' || language === 'tsx') {
        plugins.push('jsx');
      }

      const ast = babelParser.parse(content, {
        sourceType: 'module',
        plugins: plugins,
        allowImportExportEverywhere: true,
        allowReturnOutsideFunction: true,
      });

      return {
        type: 'babel',
        ast: ast,
        language: language,
      };
    } catch (error) {
      console.warn('Babel parsing failed, falling back to basic:', error.message);
      return this.parseBasic(content, language);
    }
  }

  /**
   * Parse Vue Single File Component
   * @param {string} content - File content
   * @param {string} filePath - File path
   * @returns {Object|null} AST or null
   */
  parseVue(content, filePath) {
    // Basic Vue SFC parsing without compiler
    const parts = this.parseVueSFC(content);

    if (!parts) {
      return this.parseBasic(content, 'vue');
    }

    const result = {
      type: 'vue-sfc',
      language: 'vue',
      template: parts.template ? this.parseTemplate(parts.template) : null,
      script: parts.script ? this.parseBabel(parts.script.content, parts.script.lang || 'javascript') : null,
      style: parts.style,
    };

    return result;
  }

  /**
   * Parse Vue SFC into parts
   * @param {string} content - Vue file content
   * @returns {Object|null} Parsed parts
   */
  parseVueSFC(content) {
    // Limit content size to prevent catastrophic backtracking
    if (content.length > 50000) {
      console.warn('[AST Parser] Vue file too large for SFC parsing, using basic parser');
      return null;
    }

    const parts = {
      template: null,
      script: null,
      style: null,
    };

    // Extract template - use more efficient regex with dotAll flag
    try {
      const templateMatch = content.match(/<template[^>]*>(.*?)<\/template>/is);
      if (templateMatch) {
        parts.template = templateMatch[1].trim();
      }
    } catch (e) {
      console.warn('[AST Parser] Template extraction failed');
    }

    // Extract script
    try {
      const scriptMatch = content.match(/<script[^>]*>(.*?)<\/script>/is);
      if (scriptMatch) {
        const langMatch = scriptMatch[0].match(/lang="([^"]+)"/);
        parts.script = {
          content: scriptMatch[1].trim(),
          lang: langMatch ? langMatch[1] : 'javascript',
        };
      }
    } catch (e) {
      console.warn('[AST Parser] Script extraction failed');
    }

    // Extract style
    try {
      const styleMatch = content.match(/<style[^>]*>(.*?)<\/style>/is);
      if (styleMatch) {
        const scopedMatch = styleMatch[0].match(/scoped/);
        parts.style = {
          content: styleMatch[1].trim(),
          scoped: !!scopedMatch,
        };
      }
    } catch (e) {
      console.warn('[AST Parser] Style extraction failed');
    }

    return parts;
  }

  /**
   * Parse Vue template
   * @param {string} template - Template content
   * @returns {Object} Parsed template info
   */
  parseTemplate(template) {
    const info = {
      directives: [],
      events: [],
      bindings: [],
    };

    const MAX_ITERATIONS = 1000; // 防止无限循环

    // Find directives
    const directiveRegex = /v-([a-z-]+)(?::([a-z-]+))?/g;
    let match;
    let iterations = 0;
    while ((match = directiveRegex.exec(template)) !== null && iterations < MAX_ITERATIONS) {
      iterations++;
      info.directives.push({
        name: match[1],
        arg: match[2] || null,
      });
    }

    // Find event handlers
    const eventRegex = /@([a-z-]+)=/gi;
    iterations = 0;
    while ((match = eventRegex.exec(template)) !== null && iterations < MAX_ITERATIONS) {
      iterations++;
      info.events.push(match[1]);
    }

    // Find bindings
    const bindRegex = /:([a-z-]+)=/gi;
    iterations = 0;
    while ((match = bindRegex.exec(template)) !== null && iterations < MAX_ITERATIONS) {
      iterations++;
      info.bindings.push(match[1]);
    }

    return info;
  }

  /**
   * Parse Dart file
   * @param {string} content - File content
   * @param {string} filePath - File path
   * @returns {Object|null} AST or null
   */
  parseDart(content, filePath) {
    if (!this.dartParserAvailable) {
      return this.parseBasic(content, 'dart');
    }

    try {
      const result = this.dartParser.parse(content, filePath);
      return {
        type: 'dart',
        language: 'dart',
        data: result,
      };
    } catch (error) {
      console.error('Dart parsing failed:', error.message);
      return this.parseBasic(content, 'dart');
    }
  }

  /**
   * Basic parsing without AST (regex-based)
   * @param {string} content - File content
   * @param {string} language - Language type
   * @returns {Object} Basic parse result
   */
  parseBasic(content, language) {
    return {
      type: 'basic',
      language: language,
      content: content,
      lines: content.split('\n').length,
    };
  }

  /**
   * Extract information from AST
   * @param {Object} astResult - Parsed AST result
   * @param {string} filePath - File path
   * @returns {Object} Extracted information
   */
  extractInfo(astResult, filePath) {
    if (!astResult) {
      return null;
    }

    const info = {
      filePath: filePath,
      language: astResult.language,
      imports: [],
      exports: [],
      functions: [],
      classes: [],
      variables: [],
      apiCalls: [],
      routes: [],
      components: [],
      decorators: [],
    };

    if (astResult.type === 'babel' && astResult.ast) {
      this.extractFromBabelAST(info, astResult.ast);
    } else if (astResult.type === 'vue-sfc') {
      this.extractFromVueSFC(info, astResult);
    } else if (astResult.type === 'dart' && astResult.data) {
      this.extractFromDart(info, astResult.data);
    } else {
      this.extractFromBasic(info, astResult);
    }

    return info;
  }

  /**
   * Extract info from Babel AST
   * @param {Object} info - Info object to populate
   * @param {Object} ast - Babel AST
   */
  extractFromBabelAST(info, ast) {
    // 使用迭代而非递归，避免栈溢出
    const stack = [ast.program || ast];
    const visited = new Set();
    const maxNodes = 100000; // 限制处理的最大节点数（增加到100000）
    const maxStackSize = 200000; // 限制栈的大小，防止内存溢出（增加到200000）
    let nodeCount = 0;

    // 需要遍历的关键属性，避免遍历所有属性导致栈溢出
    const TRAVERSE_KEYS = [
      'body', 'declaration', 'declarations', 'expression', 'callee',
      'arguments', 'left', 'right', 'object', 'property', 'init',
      'test', 'consequent', 'alternate', 'block', 'handler',
      'param', 'params', 'id', 'key', 'value', 'elements',
      'specifiers', 'source', 'attributes', 'classifier', 'typeParameters',
      'returnType', 'typeAnnotation', 'extends', 'superClass',
      'implements', 'mixins', 'variants'
    ];

    while (stack.length > 0 && nodeCount < maxNodes) {
      // 检查栈大小限制
      if (stack.length > maxStackSize) {
        console.warn(`[AST Parser] 栈大小超过限制 ${maxStackSize}，停止遍历`);
        break;
      }

      const node = stack.pop();

      if (!node || typeof node !== 'object') continue;

      // Handle arrays
      if (Array.isArray(node)) {
        // 限制数组大小，防止处理过大的数组
        const maxArraySize = 1000;
        for (let i = Math.min(node.length - 1, maxArraySize - 1); i >= 0; i--) {
          stack.push(node[i]);
        }
        if (node.length > maxArraySize) {
          console.warn(`[AST Parser] 数组过大 (${node.length})，仅处理前 ${maxArraySize} 个元素`);
        }
        continue;
      }

      // Skip if not a node
      if (!node.type) continue;

      // 使用对象引用作为唯一标识，避免重复处理
      // 使用 weak map 的思想，但用 Set 存储
      const nodeId = `${node.type}_${node.start || 0}_${node.end || 0}_${node.loc?.start?.line || 0}`;

      // 如果节点没有位置信息，使用类型作为唯一标识
      const fallbackId = node.start !== undefined ? nodeId : `${node.type}_${Math.random()}`;

      if (visited.has(fallbackId)) continue;
      visited.add(fallbackId);

      nodeCount++;

      try {
        switch (node.type) {
          case 'ImportDeclaration':
            this.processImportDeclaration(info, node);
            break;

          case 'ExportNamedDeclaration':
          case 'ExportDefaultDeclaration':
            this.processExportDeclaration(info, node);
            break;

          case 'FunctionDeclaration':
            this.processFunctionDeclaration(info, node);
            break;

          case 'ClassDeclaration':
            this.processClassDeclaration(info, node);
            break;

          case 'VariableDeclaration':
            this.processVariableDeclaration(info, node);
            break;

          case 'CallExpression':
            this.processCallExpression(info, node);
            break;

          case 'Decorator':
            this.processDecorator(info, node);
            break;
        }

        // 只遍历关键属性，避免处理注释、tokens 等大量数据
        for (const key of TRAVERSE_KEYS) {
          if (key in node && node[key] != null) {
            const child = node[key];
            if (child && typeof child === 'object') {
              stack.push(child);
            }
          }
        }
      } catch (error) {
        console.error(`[AST Parser] 处理节点 ${node.type} 失败:`, error.message);
      }
    }

    if (nodeCount >= maxNodes) {
      console.warn(`[AST Parser] 达到最大节点数限制 ${maxNodes}，可能未完全解析`);
    }

    // 清理 visited set，释放内存
    visited.clear();
  }

  /**
   * Process import declaration
   */
  processImportDeclaration(info, node) {
    const source = node.source.value;
    const specifiers = [];

    for (const spec of node.specifiers || []) {
      if (spec.type === 'ImportDefaultSpecifier') {
        specifiers.push({ type: 'default', local: spec.local.name });
      } else if (spec.type === 'ImportSpecifier') {
        specifiers.push({ type: 'named', imported: spec.imported.name, local: spec.local.name });
      } else if (spec.type === 'ImportNamespaceSpecifier') {
        specifiers.push({ type: 'namespace', local: spec.local.name });
      }
    }

    info.imports.push({
      source: source,
      specifiers: specifiers,
      line: node.loc?.start?.line,
    });
  }

  /**
   * Process export declaration
   */
  processExportDeclaration(info, node) {
    if (node.declaration) {
      const decl = node.declaration;
      if (decl.type === 'FunctionDeclaration') {
        info.exports.push({
          type: 'function',
          name: decl.id?.name || 'default',
          line: node.loc?.start?.line,
        });
      } else if (decl.type === 'ClassDeclaration') {
        info.exports.push({
          type: 'class',
          name: decl.id?.name || 'default',
          line: node.loc?.start?.line,
        });
      } else if (decl.type === 'Identifier') {
        info.exports.push({
          type: 'variable',
          name: decl.name,
          line: node.loc?.start?.line,
        });
      }
    }

    // Export specifiers
    for (const spec of node.specifiers || []) {
      info.exports.push({
        type: 'named',
        name: spec.local.name,
        exported: spec.exported.name,
        line: node.loc?.start?.line,
      });
    }
  }

  /**
   * Process function declaration
   */
  processFunctionDeclaration(info, node) {
    const func = {
      name: node.id?.name || '(anonymous)',
      params: node.params.map((p) => p.name || p.type || 'param'),
      async: node.async || false,
      generator: node.generator || false,
      line: node.loc?.start?.line,
      endLine: node.loc?.end?.line,
      bodyStartLine: node.body?.loc?.start?.line,
      bodyEndLine: node.body?.loc?.end?.line,
    };

    // 检测函数类型
    func.isArrow = node.type === 'ArrowFunctionExpression';
    func.isMethod = node.type === 'ClassMethod' || node.type === 'ObjectMethod';
    func.isAsync = node.async || false;
    func.isGenerator = node.generator || false;

    // Add return type if TypeScript
    if (node.returnType) {
      func.returnType = this.getTypeAnnotation(node.returnType);
    }

    // 提取参数类型（TypeScript）
    if (node.params && node.params.length > 0) {
      func.paramTypes = node.params.map(p => this.getTypeAnnotation(p)).filter(t => t);
    }

    info.functions.push(func);
  }

  /**
   * Process class declaration
   */
  processClassDeclaration(info, node) {
    const cls = {
      name: node.id?.name || '(anonymous)',
      superClass: node.superClass?.name || null,
      methods: [],
      properties: [],
      line: node.loc?.start?.line,
      endLine: node.loc?.end?.line,
    };

    // Extract class members
    for (const member of node.body.body || []) {
      if (member.type === 'ClassMethod') {
        cls.methods.push({
          kind: member.kind,
          key: member.key?.name || '(computed)',
          name: member.key?.name || '(computed)',
          params: member.params.map((p) => p.name || p.type || 'param'),
          async: member.async || false,
          static: member.static || false,
          line: member.loc?.start?.line,
          endLine: member.loc?.end?.line,
        });
      } else if (member.type === 'ClassProperty') {
        cls.properties.push({
          key: member.key?.name || '(computed)',
          name: member.key?.name || '(computed)',
          static: member.static || false,
          line: member.loc?.start?.line,
        });
      }
    }

    info.classes.push(cls);
  }

  /**
   * Process variable declaration
   */
  processVariableDeclaration(info, node) {
    for (const decl of node.declarations || []) {
      if (decl.id && decl.id.name) {
        info.variables.push({
          name: decl.id.name,
          kind: node.kind,
          line: node.loc?.start?.line,
        });
      }
    }
  }

  /**
   * Process call expression (for API calls detection)
   */
  processCallExpression(info, node) {
    const callee = node.callee;

    // Detect fetch calls
    if (callee.type === 'Identifier' && callee.name === 'fetch') {
      info.apiCalls.push({
        type: 'fetch',
        line: node.loc?.start?.line,
      });
    }

    // Detect axios/http calls
    if (
      (callee.type === 'MemberExpression' &&
        (callee.property?.name === 'get' ||
          callee.property?.name === 'post' ||
          callee.property?.name === 'put' ||
          callee.property?.name === 'delete' ||
          callee.property?.name === 'patch')) ||
      (callee.type === 'Identifier' &&
        (callee.name === 'get' ||
          callee.name === 'post' ||
          callee.name === 'put' ||
          callee.name === 'delete' ||
          callee.name === 'patch'))
    ) {
      info.apiCalls.push({
        type: 'http',
        method: callee.property?.name || callee.name,
        line: node.loc?.start?.line,
      });
    }

    // Detect route definitions (React Router, Express, etc.)
    if (
      callee.type === 'Identifier' &&
      (callee.name === 'Router' ||
        callee.name === 'Route' ||
        callee.name === 'get' ||
        callee.name === 'post' ||
        callee.name === 'use')
    ) {
      // Check if this looks like a route definition
      if (node.arguments && node.arguments.length > 0) {
        const firstArg = node.arguments[0];
        if (firstArg.type === 'StringLiteral' || firstArg.type === 'Literal') {
          info.routes.push({
            path: firstArg.value,
            line: node.loc?.start?.line,
          });
        }
      }
    }
  }

  /**
   * Process decorator
   */
  processDecorator(info, node) {
    const decorator = {
      name: node.expression?.name || '(unknown)',
      line: node.loc?.start?.line,
    };
    info.decorators.push(decorator);
  }

  /**
   * Extract info from Vue SFC
   */
  extractFromVueSFC(info, astResult) {
    // Process script section
    if (astResult.script && astResult.script.ast) {
      this.extractFromBabelAST(info, astResult.script.ast);
    }

    // Process template section
    if (astResult.template) {
      const template = astResult.template;
      // Extract component names from template
      const componentRegex = /<([A-Z][a-zA-Z0-9]*)/g;
      let match;
      let iterations = 0;
      const MAX_ITERATIONS = 1000; // 防止无限循环
      while ((match = componentRegex.exec(template.content || template)) !== null && iterations < MAX_ITERATIONS) {
        iterations++;
        if (match[1] && !['HTML', 'HEAD', 'BODY'].includes(match[1].toUpperCase())) {
          info.components.push({
            name: match[1],
            line: null,
          });
        }
      }
    }
  }

  /**
   * Extract info from Dart parse result
   */
  extractFromDart(info, dartData) {
    // Dart parser returns structured data directly
    info.imports = (dartData.imports || []).map(imp => ({
      source: imp.source,
      specifiers: [{ type: imp.type, local: imp.source }],
      line: imp.line,
    }));

    info.exports = (dartData.exports || []).map(exp => ({
      type: 'named',
      name: exp.source,
      line: exp.line,
    }));

    info.functions = (dartData.functions || []).map(fn => ({
      name: fn.name,
      params: fn.params,
      async: fn.async,
      returnType: fn.returnType,
      line: fn.line,
      endLine: fn.endLine,
      isArrow: fn.isArrow || false,
    }));

    info.classes = (dartData.classes || []).map(cls => ({
      name: cls.name,
      superClass: cls.superClass,
      // 保留 Dart 解析器提取的完整信息
      methods: cls.methods || [],
      properties: cls.properties || [],
      uiProperties: cls.uiProperties || { inputs: [], dropdowns: [], checkboxes: [], lists: [], others: [] },
      actionMethods: cls.actionMethods || { add: [], edit: [], delete: [], save: [], submit: [], cancel: [], search: [], reset: [], load: [], other: [] },
      apiMethods: cls.apiMethods || [],
      line: cls.line,
      endLine: cls.endLine,
    }));

    info.variables = (dartData.variables || []).map(v => ({
      name: v.name,
      kind: v.type || 'variable',
      line: v.line,
    }));

    info.apiCalls = (dartData.apiCalls || []).map(api => ({
      type: api.type,
      method: api.method,
      line: api.line,
    }));

    info.routes = (dartData.routes || []).map(route => ({
      path: route.path,
      line: route.line,
    }));

    // Dart 特有：mixins, enums, extensions, annotations
    if (dartData.mixins && dartData.mixins.length > 0) {
      info.dartMixins = dartData.mixins;
    }
    if (dartData.enums && dartData.enums.length > 0) {
      info.dartEnums = dartData.enums;
    }
    if (dartData.extensions && dartData.extensions.length > 0) {
      info.dartExtensions = dartData.extensions;
    }
    if (dartData.annotations && dartData.annotations.length > 0) {
      info.decorators = dartData.annotations.map(ann => ({
        name: '@' + ann.name,
        line: ann.line,
      }));
    }
  }

  /**
   * Extract info from basic parse
   */
  extractFromBasic(info, astResult) {
    const content = astResult.content;
    const lines = content.split('\n');

    // Extract imports using regex
    const importRegex = /import\s+(?:(?:(?:\{[^}]*\})|(?:\*)\s+as\s+(\w+)|(\w+))\s+from\s+)?['"`]([^'"`]+)['"`]/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      info.imports.push({
        source: match[3],
        specifiers: [{ type: 'unknown', local: match[2] || match[1] || 'default' }],
      });
    }

    // Extract require calls
    const requireRegex = /require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
    while ((match = requireRegex.exec(content)) !== null) {
      info.imports.push({
        source: match[1],
        specifiers: [{ type: 'require', local: null }],
      });
    }

    // Extract function declarations
    const functionRegex = /(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)\s*=>|(?:function\s*)?))/g;
    while ((match = functionRegex.exec(content)) !== null) {
      const name = match[1] || match[2];
      if (name) {
        info.functions.push({
          name: name,
          params: [],
          async: content.includes('async'),
          line: null,
        });
      }
    }

    // Extract class declarations
    const classRegex = /class\s+(\w+)/g;
    while ((match = classRegex.exec(content)) !== null) {
      info.classes.push({
        name: match[1],
        superClass: null,
        methods: [],
        properties: [],
        line: null,
      });
    }

    // Extract export statements
    const exportRegex = /export\s+(?:(?:default\s+)?(?:class|function|const|let|var)\s+(\w+)|(?:\{([^}]+)\}))/g;
    while ((match = exportRegex.exec(content)) !== null) {
      const name = match[1] || match[2];
      if (name) {
        info.exports.push({
          type: 'unknown',
          name: name.trim().split(',')[0],
          line: null,
        });
      }
    }
  }

  /**
   * Get type annotation from TypeScript node
   */
  getTypeAnnotation(node) {
    if (!node) return null;
    if (node.typeAnnotation) {
      return this.getTypeString(node.typeAnnotation);
    }
    return null;
  }

  /**
   * Get type string from type annotation
   */
  getTypeString(node) {
    if (!node) return 'unknown';

    switch (node.type) {
      case 'TSStringKeyword':
        return 'string';
      case 'TSNumberKeyword':
        return 'number';
      case 'TSBooleanKeyword':
        return 'boolean';
      case 'TSVoidKeyword':
        return 'void';
      case 'TSAnyKeyword':
        return 'any';
      case 'TSUnknownKeyword':
        return 'unknown';
      case 'TSArrayType':
        return `${this.getTypeString(node.elementType)}[]`;
      case 'TSTypeReference':
        return node.typeName?.name || 'unknown';
      default:
        return 'unknown';
    }
  }

  /**
   * Clear parser cache with smart cleanup options
   * @param {Object} options - Cleanup options
   * @param {boolean} options.all - Clear all cache (default: false)
   * @param {boolean} options.expired - Clear only expired entries (default: true)
   * @param {number} options.olderThan - Clear entries older than specified ms
   */
  clearCache(options = {}) {
    const { all = false, expired = true, olderThan = null } = options;

    if (all) {
      // Clear all cache
      this.parserCache.clear();
      this.cacheAccessLog.clear();
      console.log('[AST Parser] Cache cleared completely');
      return;
    }

    const now = Date.now();
    let clearedCount = 0;

    // Clear expired entries
    if (expired) {
      for (const [key, value] of this.parserCache.entries()) {
        if (now - value.timestamp > this.options.cacheTTL) {
          this.parserCache.delete(key);
          this.cacheAccessLog.delete(key);
          clearedCount++;
        }
      }
    }

    // Clear entries older than specified time
    if (olderThan !== null) {
      for (const [key, value] of this.parserCache.entries()) {
        if (now - value.timestamp > olderThan) {
          this.parserCache.delete(key);
          this.cacheAccessLog.delete(key);
          clearedCount++;
        }
      }
    }

    console.log(`[AST Parser] Cache cleared: ${clearedCount} entries removed`);
  }

  /**
   * Clean up cache if it exceeds the maximum size
   */
  cleanupCache() {
    if (this.parserCache.size > this.options.maxCacheSize) {
      const excess = this.parserCache.size - this.options.maxCacheSize;
      console.log(`[AST Parser] Cache size limit exceeded, removing ${excess} oldest entries`);

      for (let i = 0; i < excess; i++) {
        this.evictLRU();
      }
    }
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getCacheStats() {
    const now = Date.now();
    let expiredCount = 0;
    let totalAge = 0;

    for (const [key, value] of this.parserCache.entries()) {
      const age = now - value.timestamp;
      totalAge += age;

      if (age > this.options.cacheTTL) {
        expiredCount++;
      }
    }

    return {
      size: this.parserCache.size,
      maxSize: this.options.maxCacheSize,
      ttl: this.options.cacheTTL,
      utilization: `${((this.parserCache.size / this.options.maxCacheSize) * 100).toFixed(1)}%`,
      expiredCount,
      averageAge: this.parserCache.size > 0 ? Math.round(totalAge / this.parserCache.size) : 0,
      oldestEntry: this.getOldestEntryAge(),
      newestEntry: this.getNewestEntryAge(),
      recentEntries: Array.from(this.cacheAccessLog.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([key, time]) => ({ key, age: Math.round((now - time) / 1000) })),
    };
  }

  /**
   * Get age of oldest cache entry
   * @returns {number} Age in milliseconds
   */
  getOldestEntryAge() {
    let oldestTime = Infinity;
    for (const time of this.cacheAccessLog.values()) {
      if (time < oldestTime) {
        oldestTime = time;
      }
    }
    return oldestTime === Infinity ? 0 : Date.now() - oldestTime;
  }

  /**
   * Get age of newest cache entry
   * @returns {number} Age in milliseconds
   */
  getNewestEntryAge() {
    let newestTime = 0;
    for (const time of this.cacheAccessLog.values()) {
      if (time > newestTime) {
        newestTime = time;
      }
    }
    return newestTime === 0 ? 0 : Date.now() - newestTime;
  }
}

module.exports = ASTParser;
