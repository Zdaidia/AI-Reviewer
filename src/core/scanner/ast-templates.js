/**
 * AST Template Detection Module
 *
 * 提供基于 AST 分析的规则检测模板，用于处理需要上下文分析的复杂规则。
 *
 * 支持的模板：
 * - unused-import: 检测未使用的导入
 * - duplicate-import: 检测重复导入
 * - empty-catch: 检测空 catch 块
 * - missing-dispose: 检测 Controller 未释放
 * - unsafe-first-last: 检测 .first/.last 无保护访问
 * - missing-return: 检测方法缺少 return
 * - method-naming: 检测方法命名规范
 * - class-naming: 检测类命名规范
 */

class ASTTemplateDetector {
  constructor() {
    this.templates = {
      // Dart 模板
      'unused-import': this.detectUnusedImport,
      'duplicate-import': this.detectDuplicateImport,
      'empty-catch': this.detectEmptyCatch,
      'missing-dispose': this.detectMissingDispose,
      'unsafe-first-last': this.detectUnsafeFirstLast,
      'missing-return': this.detectMissingReturn,
      'method-naming': this.detectMethodNaming,
      'class-naming': this.detectClassNaming,
      'required-nullable': this.detectRequiredNullable,
      'hardcoded-string': this.detectHardcodedString,

      // JavaScript/TypeScript 模板
      'js-unused-import': this.detectJSUnusedImport,
      'js-empty-catch': this.detectJSEmptyCatch,
      'js-missing-return': this.detectJSMissingReturn,
    };
  }

  /**
   * 执行模板检测
   * @param {string} templateName - 模板名称
   * @param {string} content - 文件内容
   * @param {string} filePath - 文件路径
   * @param {string} language - 语言类型
   * @param {Object} ruleConfig - 规则配置
   * @returns {Array} 检测到的问题列表
   */
  detect(templateName, content, filePath, language, ruleConfig) {
    const detector = this.templates[templateName];
    if (!detector) {
      console.warn(`[AST Template] 未找到模板: ${templateName}`);
      return [];
    }
    return detector.call(this, content, filePath, language, ruleConfig);
  }

  /**
   * 检测未使用的导入 (Dart)
   * 分析整个文件，追踪导入的符号是否被使用
   */
  detectUnusedImport(content, filePath, language, ruleConfig) {
    if (language !== 'dart') return [];

    const issues = [];
    const lines = content.split('\n');
    const imports = [];
    const usedSymbols = new Set();

    // 1. 收集所有 import 语句
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // 匹配 import 语句
      const importMatch = trimmed.match(/^import\s+['"]([^'"]+)['"](?:\s+(?:show|hide)\s+([^;]+))?/);
      if (importMatch) {
        const packagePath = importMatch[1];
        const showHide = importMatch[2];

        // 从 package 路径提取可能的符号名
        const packageParts = packagePath.split('/');
        const lastPart = packageParts[packageParts.length - 1];
        const fileName = lastPart.replace('.dart', '');

        // 转换为可能的类名/符号名 (snake_case -> PascalCase)
        const className = fileName.split('_').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');

        imports.push({
          line: i + 1,
          package: packagePath,
          fileName,
          className,
          showSymbols: showHide ? showHide.split(',').map(s => s.trim()) : null,
          raw: trimmed
        });
      }
    }

    // 2. 收集代码中使用的符号
    const codeContent = content.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

    // 匹配类名使用 (PascalCase)
    const classMatches = codeContent.match(/\b[A-Z][a-zA-Z0-9]*\b/g) || [];
    classMatches.forEach(s => usedSymbols.add(s));

    // 匹配函数调用和方法调用
    const methodMatches = codeContent.match(/\.\s*([a-zA-Z_][a-zA-Z0-9]*)\s*\(/g) || [];
    methodMatches.forEach(m => {
      const name = m.match(/\.\s*([a-zA-Z_][a-zA-Z0-9]*)/)?.[1];
      if (name) usedSymbols.add(name);
    });

    // 3. 检查每个 import 是否被使用
    for (const imp of imports) {
      let isUsed = false;

      // 如果有 show 指定符号，检查这些符号
      if (imp.showSymbols) {
        isUsed = imp.showSymbols.some(s => usedSymbols.has(s));
      } else {
        // 检查推断的类名或文件名
        isUsed = usedSymbols.has(imp.className) || usedSymbols.has(imp.fileName);
      }

      // 特殊情况：flutter/material.dart 和 flutter/cupertino.dart 是基础库，通常不会"未使用"
      if (imp.package.includes('flutter/material.dart') || imp.package.includes('flutter/cupertino.dart')) {
        isUsed = true; // 基础 UI 库，跳过检测
      }

      // GetX 相关
      if (imp.package.includes('get/get.dart') || imp.package.includes('get/')) {
        // 检查是否使用了 GetX 相关功能
        isUsed = codeContent.includes('Get.') || codeContent.includes('Getx') ||
                 codeContent.includes('Obx') || codeContent.includes('.obs');
      }

      if (!isUsed) {
        issues.push({
          ruleId: ruleConfig.id || 'UNUSED-IMPORT',
          ruleName: ruleConfig.name || '未使用的导入',
          severity: ruleConfig.severity || 'info',
          message: ruleConfig.message || `导入 "${imp.package}" 可能未被使用`,
          suggestion: ruleConfig.suggestion || '移除未使用的导入以保持代码整洁',
          line: imp.line,
          column: 1,
          code: imp.raw.substring(0, 60),
          autoFix: ruleConfig.autoFix || false,
        });
      }
    }

    return issues;
  }

  /**
   * 检测重复导入 (Dart)
   */
  detectDuplicateImport(content, filePath, language, ruleConfig) {
    if (language !== 'dart') return [];

    const issues = [];
    const lines = content.split('\n');
    const seenImports = new Map();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      const importMatch = trimmed.match(/^import\s+['"]([^'"]+)['"]/);
      if (importMatch) {
        const packagePath = importMatch[1];

        if (seenImports.has(packagePath)) {
          // 找到重复导入
          issues.push({
            ruleId: ruleConfig.id || 'DUPLICATE-IMPORT',
            ruleName: ruleConfig.name || '重复导入',
            severity: ruleConfig.severity || 'info',
            message: ruleConfig.message || `"${packagePath}" 已在第 ${seenImports.get(packagePath)} 行导入`,
            suggestion: ruleConfig.suggestion || '合并相同的导入语句',
            line: i + 1,
            column: 1,
            code: trimmed.substring(0, 60),
            autoFix: ruleConfig.autoFix || false,
          });
        } else {
          seenImports.set(packagePath, i + 1);
        }
      }
    }

    return issues;
  }

  /**
   * 检测空 catch 块
   */
  detectEmptyCatch(content, filePath, language, ruleConfig) {
    const issues = [];
    const lines = content.split('\n');

    // Dart 和 JavaScript 的空 catch 检测
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 检测 catch 开始
      if (language === 'dart') {
        // Dart: catch (e) { } 或 on Exception catch (e) { }
        const emptyCatchMatch = line.match(/(?:on\s+\w+\s+)?catch\s*\([^)]*\)\s*\{\s*\}/);
        if (emptyCatchMatch) {
          issues.push({
            ruleId: ruleConfig.id || 'EMPTY-CATCH',
            ruleName: ruleConfig.name || '空的 catch 块',
            severity: ruleConfig.severity || 'error',
            message: ruleConfig.message || '空的 catch 块会隐藏错误',
            suggestion: ruleConfig.suggestion || '至少记录错误日志或进行适当的错误处理',
            line: i + 1,
            column: 1,
            code: emptyCatchMatch[0],
            autoFix: ruleConfig.autoFix || false,
          });
        }
      } else if (language === 'javascript' || language === 'typescript') {
        // JS/TS: catch (e) { } 或 catch { }
        const emptyCatchMatch = line.match(/catch\s*(?:\([^)]*\))?\s*\{\s*\}/);
        if (emptyCatchMatch) {
          issues.push({
            ruleId: ruleConfig.id || 'EMPTY-CATCH',
            ruleName: ruleConfig.name || '空的 catch 块',
            severity: ruleConfig.severity || 'error',
            message: ruleConfig.message || '空的 catch 块会隐藏错误',
            suggestion: ruleConfig.suggestion || '至少记录错误日志或进行适当的错误处理',
            line: i + 1,
            column: 1,
            code: emptyCatchMatch[0],
            autoFix: ruleConfig.autoFix || false,
          });
        }
      }
    }

    return issues;
  }

  /**
   * 检测 Controller 未释放 (Dart)
   * 分析 StatefulWidget，检查 dispose 方法是否释放了 Controller
   */
  detectMissingDispose(content, filePath, language, ruleConfig) {
    if (language !== 'dart') return [];

    const issues = [];
    const lines = content.split('\n');

    // 1. 检查是否是 StatefulWidget
    const isStatefulWidget = content.includes('extends State<') || content.includes('extends StatefulWidget');
    if (!isStatefulWidget) return [];

    // 2. 收集 Controller 定义
    const controllers = [];
    const controllerTypes = [
      'TextEditingController', 'AnimationController', 'PageController',
      'ScrollController', 'StreamController', 'GetxController'
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // 匹配 Controller 定义
      for (const ctrlType of controllerTypes) {
        const match = trimmed.match(new RegExp(`(?:final|late|var)\\s+(\\w+)\\s*=\\s*${ctrlType}`));
        if (match) {
          controllers.push({
            name: match[1],
            type: ctrlType,
            line: i + 1
          });
        }
        // 也匹配类型声明形式
        const typeMatch = trimmed.match(new RegExp(`${ctrlType}\\s+(\\w+)\\s*=`));
        if (typeMatch) {
          controllers.push({
            name: typeMatch[1],
            type: ctrlType,
            line: i + 1
          });
        }
      }
    }

    // 3. 检查是否有 dispose 方法
    const hasDispose = content.includes('void dispose()');
    const disposeContent = hasDispose ? this.extractMethodBody(lines, 'dispose') : '';

    // 4. 检查每个 Controller 是否在 dispose 中释放
    for (const ctrl of controllers) {
      const disposedPattern = `${ctrl.name}.dispose()`;
      if (!disposeContent.includes(disposedPattern) && !disposeContent.includes(`${ctrl.name}?.dispose()`)) {
        issues.push({
          ruleId: ruleConfig.id || 'MISSING-DISPOSE',
          ruleName: ruleConfig.name || 'Controller 未释放',
          severity: ruleConfig.severity || 'error',
          message: ruleConfig.message || `${ctrl.type} "${ctrl.name}" 可能未在 dispose() 中释放`,
          suggestion: ruleConfig.suggestion || `在 dispose() 方法中添加 ${ctrl.name}.dispose()`,
          line: ctrl.line,
          column: 1,
          code: `${ctrl.type} ${ctrl.name}`,
          autoFix: ruleConfig.autoFix || false,
        });
      }
    }

    return issues;
  }

  /**
   * 提取方法体内容
   */
  extractMethodBody(lines, methodName) {
    let body = '';
    let foundMethod = false;
    let braceCount = 0;
    let started = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (!foundMethod) {
        if (trimmed.includes(`void ${methodName}()`)) {
          foundMethod = true;
          // 检查同一行是否有开始大括号
          if (trimmed.includes('{')) {
            braceCount = 1;
            started = true;
            body += trimmed + '\n';
          }
        }
      } else if (started) {
        body += line + '\n';
        // 计算大括号
        const opens = (line.match(/\{/g) || []).length;
        const closes = (line.match(/\}/g) || []).length;
        braceCount += opens - closes;

        if (braceCount === 0) {
          break; // 方法结束
        }
      } else if (trimmed === '{') {
        braceCount = 1;
        started = true;
      }
    }

    return body;
  }

  /**
   * 检测 unsafe .first/.last 访问
   */
  detectUnsafeFirstLast(content, filePath, language, ruleConfig) {
    if (language !== 'dart') return [];

    const issues = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // 排除注释行
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;

      // 匹配 .first 或 .last 使用
      const firstLastMatch = trimmed.match(/\.first\b|\.last\b/);
      if (firstLastMatch) {
        // 检查是否有保护
        const hasProtection =
          trimmed.includes('firstOrNull') || trimmed.includes('lastOrNull') ||
          trimmed.includes('?.first') || trimmed.includes('?.last') ||
          trimmed.includes('isEmpty') || trimmed.includes('isNotEmpty') ||
          trimmed.includes('length >') || trimmed.includes('length ==') ||
          // 三元表达式保护
          /\?\s*\w+\s*\.first/.test(trimmed) || /\?\s*\w+\s*\.last/.test(trimmed) ||
          // if 条件保护（检查同一行或前几行）
          this.checkListProtection(lines, i);

        if (!hasProtection) {
          issues.push({
            ruleId: ruleConfig.id || 'UNSAFE-FIRST-LAST',
            ruleName: ruleConfig.name || 'unsafe .first/.last 访问',
            severity: ruleConfig.severity || 'error',
            message: ruleConfig.message || '.first/.last 在空列表上会抛出 StateError',
            suggestion: ruleConfig.suggestion || '使用 firstOrNull/lastOrNull 或先检查 isEmpty',
            line: i + 1,
            column: trimmed.indexOf(firstLastMatch[0]) + 1,
            code: trimmed.substring(0, 80),
            autoFix: ruleConfig.autoFix || false,
          });
        }
      }
    }

    return issues;
  }

  /**
   * 检查前几行是否有列表保护条件
   */
  checkListProtection(lines, currentLineIndex) {
    // 检查当前行是否在 if 条件块内
    for (let j = Math.max(0, currentLineIndex - 5); j <= currentLineIndex; j++) {
      const line = lines[j];
      if (line.includes('if (') || line.includes('if(')) {
        // 检查条件中是否有 isEmpty/isNotEmpty/length
        const conditionMatch = line.match(/if\s*\(([^)]+)\)/);
        if (conditionMatch) {
          const condition = conditionMatch[1];
          if (condition.includes('isEmpty') || condition.includes('isNotEmpty') ||
              condition.includes('length') || condition.includes('!= null')) {
            return true;
          }
        }
      }
    }
    return false;
  }

  /**
   * 检测方法缺少 return (Dart)
   */
  detectMissingReturn(content, filePath, language, ruleConfig) {
    if (language !== 'dart') return [];

    const issues = [];
    const lines = content.split('\n');

    // 检查 Widget build 方法
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // 匹配 build 方法开始
      if (trimmed.includes('Widget build(') || trimmed.includes('Widget build (')) {
        const methodBody = this.extractMethodBodyFromLine(lines, i);

        // 检查是否有 return
        if (methodBody && !methodBody.includes('return')) {
          issues.push({
            ruleId: ruleConfig.id || 'MISSING-RETURN',
            ruleName: ruleConfig.name || 'build 方法缺少 return',
            severity: ruleConfig.severity || 'error',
            message: ruleConfig.message || 'Widget build 方法必须返回 Widget',
            suggestion: ruleConfig.suggestion || '在方法末尾添加 return Widget',
            line: i + 1,
            column: 1,
            code: 'Widget build(...)',
            autoFix: ruleConfig.autoFix || false,
          });
        }
      }
    }

    return issues;
  }

  /**
   * 从指定行提取方法体
   */
  extractMethodBodyFromLine(lines, startLine) {
    let body = '';
    let braceCount = 0;
    let started = false;

    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i];

      if (!started) {
        if (line.includes('{')) {
          braceCount = 1;
          started = true;
          body += line + '\n';
          continue;
        }
      } else {
        body += line + '\n';
        const opens = (line.match(/\{/g) || []).length;
        const closes = (line.match(/\}/g) || []).length;
        braceCount += opens - closes;

        if (braceCount === 0) {
          break;
        }
      }
    }

    return body;
  }

  /**
   * 检测方法命名规范 (Dart)
   * 方法名应使用 lowerCamelCase
   */
  detectMethodNaming(content, filePath, language, ruleConfig) {
    if (language !== 'dart') return [];

    const issues = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // 排除 import 语句和注释
      if (trimmed.startsWith('import ') || trimmed.startsWith('//') || trimmed.startsWith('*')) continue;

      // 匹配方法定义: void/async/future/int/String 等后跟方法名
      // 但排除类定义 (class) 和构造函数
      const methodMatch = trimmed.match(/(?:void|Future|async|int|String|bool|double|var|const)\s+([A-Z][a-zA-Z0-9]*)\s*\(/);
      if (methodMatch && !trimmed.includes('class ') && !trimmed.includes('extends')) {
        const methodName = methodMatch[1];
        // 方法名以大写字母开头是错误的
        issues.push({
          ruleId: ruleConfig.id || 'METHOD-NAMING',
          ruleName: ruleConfig.name || '方法命名规范',
          severity: ruleConfig.severity || 'warning',
          message: ruleConfig.message || `方法名 "${methodName}" 应使用 lowerCamelCase`,
          suggestion: ruleConfig.suggestion || `改为 ${methodName.charAt(0).toLowerCase() + methodName.slice(1)}()`,
          line: i + 1,
          column: trimmed.indexOf(methodName) + 1,
          code: methodName,
          autoFix: ruleConfig.autoFix || false,
        });
      }
    }

    return issues;
  }

  /**
   * 检测类命名规范 (Dart)
   * 类名应使用 UpperCamelCase
   */
  detectClassNaming(content, filePath, language, ruleConfig) {
    if (language !== 'dart') return [];

    const issues = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // 匹配类定义: class 后跟小写字母开头的名称
      const classMatch = trimmed.match(/class\s+([a-z][a-zA-Z0-9]*)\s+(?:extends|implements|with|\{)/);
      if (classMatch) {
        const className = classMatch[1];
        issues.push({
          ruleId: ruleConfig.id || 'CLASS-NAMING',
          ruleName: ruleConfig.name || '类命名规范',
          severity: ruleConfig.severity || 'warning',
          message: ruleConfig.message || `类名 "${className}" 应使用 UpperCamelCase`,
          suggestion: ruleConfig.suggestion || `改为 ${className.charAt(0).toUpperCase() + className.slice(1)}`,
          line: i + 1,
          column: trimmed.indexOf(className) + 1,
          code: className,
          autoFix: ruleConfig.autoFix || false,
        });
      }
    }

    return issues;
  }

  /**
   * 检测 required 参数为 nullable (Dart)
   */
  detectRequiredNullable(content, filePath, language, ruleConfig) {
    if (language !== 'dart') return [];

    const issues = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // 匹配 required 参数但类型是 nullable
      // 例如: required String? name 或 required int? value
      const match = trimmed.match(/required\s+(\w+)\?\s+(\w+)/);
      if (match) {
        const type = match[1];
        const paramName = match[2];
        issues.push({
          ruleId: ruleConfig.id || 'REQUIRED-NULLABLE',
          ruleName: ruleConfig.name || 'required 参数不应为 nullable',
          severity: ruleConfig.severity || 'warning',
          message: ruleConfig.message || `required 参数 "${paramName}" 类型为 ${type}?，建议使用非空类型`,
          suggestion: ruleConfig.suggestion || `移除 ? 使类型为 ${type}，或移除 required 使用可选参数`,
          line: i + 1,
          column: trimmed.indexOf(paramName) + 1,
          code: `required ${type}? ${paramName}`,
          autoFix: ruleConfig.autoFix || false,
        });
      }
    }

    return issues;
  }

  /**
   * 检测硬编码字符串（如颜色、URL、IP）
   */
  detectHardcodedString(content, filePath, language, ruleConfig) {
    const issues = [];
    const lines = content.split('\n');

    const patterns = {
      color: /color\s*:\s*Color\s*\(\s*0x[0-9a-fA-F]+\s*\)/,
      ip: /\b(?!127\.0\.0\.1|0\.0\.0\.0|localhost)(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/,
      httpUrl: /http:\/\/[^'"\s]+(?:(?!localhost|127\.0\.0\.1))/,
      apiKey: /(api[_-]?key|apikey|API[_-]?KEY)\s*[=:]\s*['"][^'"]{16,}['"]/i,
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // 排除 import 和注释
      if (trimmed.startsWith('import ') || trimmed.startsWith('//') || trimmed.startsWith('*')) continue;

      // 检测颜色硬编码
      if (patterns.color.test(trimmed) && !trimmed.includes('Theme.of') && !trimmed.includes('colorScheme')) {
        issues.push({
          ruleId: ruleConfig.id || 'HARDCODED-COLOR',
          ruleName: ruleConfig.name || '硬编码颜色值',
          severity: ruleConfig.severity || 'info',
          message: ruleConfig.message || '硬编码颜色值不利于主题切换',
          suggestion: ruleConfig.suggestion || '使用 Theme.of(context).colorScheme',
          line: i + 1,
          column: 1,
          code: trimmed.substring(0, 60),
          autoFix: ruleConfig.autoFix || false,
        });
      }

      // 检测 HTTP URL
      if (patterns.httpUrl.test(trimmed)) {
        issues.push({
          ruleId: ruleConfig.id || 'INSECURE-HTTP',
          ruleName: ruleConfig.name || '不安全的 HTTP URL',
          severity: ruleConfig.severity || 'warning',
          message: ruleConfig.message || 'HTTP URL 不安全，建议使用 HTTPS',
          suggestion: ruleConfig.suggestion || '将 http:// 替换为 https://',
          line: i + 1,
          column: 1,
          code: trimmed.substring(0, 60),
          autoFix: ruleConfig.autoFix || false,
        });
      }
    }

    return issues;
  }

  /**
   * 检测未使用的导入 (JavaScript/TypeScript)
   */
  detectJSUnusedImport(content, filePath, language, ruleConfig) {
    if (language !== 'javascript' && language !== 'typescript') return [];

    const issues = [];
    const lines = content.split('\n');
    const imports = [];
    const usedSymbols = new Set();

    // 收集 import 语句
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // ES6 import
      const es6Match = trimmed.match(/import\s+(?:\{([^}]+)\}|(\w+))\s+from\s+['"]([^'"]+)['"]/);
      if (es6Match) {
        const namedImports = es6Match[1]?.split(',').map(s => s.trim()) || [];
        const defaultImport = es6Match[2];
        imports.push({
          line: i + 1,
          named: namedImports,
          default: defaultImport,
          source: es6Match[3],
          raw: trimmed
        });
      }

      // CommonJS require
      const requireMatch = trimmed.match(/(?:const|let|var)\s+(\w+)\s*=\s*require\s*\(['"]([^'"]+)['"]/);
      if (requireMatch) {
        imports.push({
          line: i + 1,
          default: requireMatch[1],
          source: requireMatch[2],
          raw: trimmed
        });
      }
    }

    // 收集使用的符号
    const codeContent = content.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    const symbolMatches = codeContent.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g) || [];
    symbolMatches.forEach(s => usedSymbols.add(s));

    // 检查未使用
    for (const imp of imports) {
      if (imp.default && !usedSymbols.has(imp.default)) {
        issues.push({
          ruleId: ruleConfig.id || 'JS-UNUSED-IMPORT',
          ruleName: ruleConfig.name || '未使用的导入',
          severity: ruleConfig.severity || 'info',
          message: ruleConfig.message || `"${imp.default}" 从 "${imp.source}" 导入但未使用`,
          suggestion: ruleConfig.suggestion || '移除未使用的导入',
          line: imp.line,
          column: 1,
          code: imp.raw.substring(0, 60),
          autoFix: ruleConfig.autoFix || false,
        });
      }
    }

    return issues;
  }

  /**
   * 检测空 catch 块 (JavaScript/TypeScript)
   */
  detectJSEmptyCatch(content, filePath, language, ruleConfig) {
    return this.detectEmptyCatch(content, filePath, language, ruleConfig);
  }

  /**
   * 检测缺少 return (JavaScript/TypeScript)
   */
  detectJSMissingReturn(content, filePath, language, ruleConfig) {
    // TODO: 实现 JS/TS 的 return 检测
    return [];
  }
}

module.exports = ASTTemplateDetector;