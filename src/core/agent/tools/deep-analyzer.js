/**
 * Deep Code Analyzer
 *
 * Performs intelligent context-aware code analysis beyond rule-based scanning.
 * Detects:
 * - Undefined methods/variables
 * - Potential crashes
 * - Memory leaks
 * - Dead code
 * - Performance issues
 */

const fs = require('fs');

class DeepCodeAnalyzer {
  constructor() {
    this.builtInObjects = new Set([
      // JavaScript built-ins
      'console', 'window', 'document', 'navigator', 'history', 'location',
      'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
      'Promise', 'Array', 'Object', 'String', 'Number', 'Boolean', 'Date',
      'Math', 'JSON', 'RegExp', 'Error', 'Map', 'Set', 'WeakMap', 'WeakSet',
      'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'decodeURI', 'decodeURIComponent',
      'encodeURI', 'encodeURIComponent', 'escape', 'unescape',
      // React built-ins
      'React', 'Component', 'useState', 'useEffect', 'useContext', 'useRef',
      'useMemo', 'useCallback', 'useReducer', 'useLayoutEffect', 'useImperativeHandle',
      // Dart/Flutter built-ins
      'BuildContext', 'Widget', 'StatefulWidget', 'StatelessWidget',
      'setState', 'initState', 'dispose', 'build', 'InheritedWidget',
      // Common libraries
      'axios', 'fetch', 'lodash', '_', '$', 'jQuery', 'moment', 'dayjs'
    ]);
  }

  /**
   * Perform deep analysis on a file
   */
  async analyzeFile(filePath, existingIssues = []) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const ext = this.getFileExtension(filePath);

      const issues = [];

      // Analyze based on file type
      if (['.js', '.jsx', '.ts', '.tsx'].includes(ext)) {
        issues.push(...this.analyzeJavaScriptFile(filePath, content, existingIssues));
      } else if (ext === '.dart') {
        issues.push(...this.analyzeDartFile(filePath, content, existingIssues));
      } else if (ext === '.vue') {
        issues.push(...this.analyzeVueFile(filePath, content, existingIssues));
      }

      return issues;
    } catch (error) {
      console.error(`Deep analysis failed for ${filePath}:`, error.message);
      return [];
    }
  }

  /**
   * Analyze JavaScript/TypeScript file
   */
  analyzeJavaScriptFile(filePath, content, existingIssues) {
    const issues = [];
    const lines = content.split('\n');

    // Collect defined variables and functions
    const definedSymbols = this.collectDefinedSymbols(content);
    const importedSymbols = this.collectImportedSymbols(content);
    const allSymbols = new Set([...definedSymbols, ...importedSymbols, ...this.builtInObjects]);

    // Check each line for potential issues
    lines.forEach((line, lineIndex) => {
      const lineNumber = lineIndex + 1;
      const trimmedLine = line.trim();

      // Skip empty lines and comments
      if (!trimmedLine || trimmedLine.startsWith('//') || trimmedLine.startsWith('/*')) {
        return;
      }

      // 1. Detect undefined method calls
      const undefinedMethodIssues = this.detectUndefinedMethods(trimmedLine, lineNumber, allSymbols, filePath);
      issues.push(...undefinedMethodIssues);

      // 2. Detect potential crashes
      const crashIssues = this.detectPotentialCrashes(trimmedLine, lineNumber, filePath);
      issues.push(...crashIssues);

      // 3. Detect memory leaks
      const memoryIssues = this.detectMemoryLeaks(trimmedLine, lineNumber, filePath);
      issues.push(...memoryIssues);

      // 4. Detect dead code
      const deadCodeIssues = this.detectDeadCode(trimmedLine, lineNumber, filePath);
      issues.push(...deadCodeIssues);

      // 5. Detect infinite loops
      const loopIssues = this.detectInfiniteLoops(trimmedLine, lineNumber, filePath);
      issues.push(...loopIssues);
    });

    return issues;
  }

  /**
   * Analyze Dart file
   */
  analyzeDartFile(filePath, content, existingIssues) {
    const issues = [];
    const lines = content.split('\n');

    // Collect defined symbols
    const definedSymbols = this.collectDartSymbols(content);
    const allSymbols = new Set([...definedSymbols, ...this.builtInObjects]);

    lines.forEach((line, lineIndex) => {
      const lineNumber = lineIndex + 1;
      const trimmedLine = line.trim();

      if (!trimmedLine || trimmedLine.startsWith('//')) {
        return;
      }

      // Detect undefined methods
      const undefinedMethodIssues = this.detectUndefinedDartMethods(trimmedLine, lineNumber, allSymbols, filePath);
      issues.push(...undefinedMethodIssues);

      // Detect potential crashes
      const crashIssues = this.detectDartCrashes(trimmedLine, lineNumber, filePath);
      issues.push(...crashIssues);

      // Detect memory leaks
      const memoryIssues = this.detectDartMemoryLeaks(trimmedLine, lineNumber, filePath);
      issues.push(...memoryIssues);
    });

    return issues;
  }

  /**
   * Analyze Vue file
   */
  analyzeVueFile(filePath, content, existingIssues) {
    const issues = [];

    // Extract script section
    const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
    if (scriptMatch) {
      const scriptContent = scriptMatch[1];
      const jsIssues = this.analyzeJavaScriptFile(filePath, scriptContent, existingIssues);

      // Adjust line numbers for script section
      const scriptStartLine = content.substring(0, scriptMatch.index).split('\n').length;
      jsIssues.forEach(issue => {
        issue.line += scriptStartLine;
      });

      issues.push(...jsIssues);
    }

    return issues;
  }

  /**
   * Collect defined symbols in JavaScript
   */
  collectDefinedSymbols(content) {
    const symbols = new Set();

    // Function declarations
    const functionRegex = /function\s+(\w+)/g;
    let match;
    while ((match = functionRegex.exec(content)) !== null) {
      symbols.add(match[1]);
    }

    // Variable declarations (const, let, var)
    const varRegex = /(?:const|let|var)\s+(\w+)/g;
    while ((match = varRegex.exec(content)) !== null) {
      symbols.add(match[1]);
    }

    // Class declarations
    const classRegex = /class\s+(\w+)/g;
    while ((match = classRegex.exec(content)) !== null) {
      symbols.add(match[1]);
    }

    // Arrow functions assigned to variables
    const arrowRegex = /(\w+)\s*=\s*\([^)]*\)\s*=>/g;
    while ((match = arrowRegex.exec(content)) !== null) {
      symbols.add(match[1]);
    }

    // React hooks
    const hookRegex = /use\w+/g;
    while ((match = hookRegex.exec(content)) !== null) {
      symbols.add(match[0]);
    }

    return symbols;
  }

  /**
   * Collect imported symbols
   */
  collectImportedSymbols(content) {
    const symbols = new Set();

    // ES6 imports
    const importRegex = /import\s+(?:\{([^}]+)\}|(\w+)|\*\s+as\s+(\w+))\s+from/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      if (match[1]) {
        // Named imports: { foo, bar }
        match[1].split(',').forEach(s => symbols.add(s.trim()));
      } else if (match[2]) {
        // Default import
        symbols.add(match[2]);
      } else if (match[3]) {
        // Namespace import
        symbols.add(match[3]);
      }
    }

    // Require statements
    const requireRegex = /(?:const|let|var)\s+(\w+)\s*=\s*require\(['"]([^'"]+)['"]\)/g;
    while ((match = requireRegex.exec(content)) !== null) {
      symbols.add(match[1]);
    }

    return symbols;
  }

  /**
   * Collect defined symbols in Dart
   */
  collectDartSymbols(content) {
    const symbols = new Set();

    // Function definitions
    const funcRegex = /(\w+)\s*\([^)]*\)\s*(?:{|async)/g;
    let match;
    while ((match = funcRegex.exec(content)) !== null) {
      symbols.add(match[1]);
    }

    // Class definitions
    const classRegex = /class\s+(\w+)/g;
    while ((match = classRegex.exec(content)) !== null) {
      symbols.add(match[1]);
    }

    // Method definitions (inside classes)
    const methodRegex = /^\s*(\w+)\s*\(/gm;
    while ((match = methodRegex.exec(content)) !== null) {
      symbols.add(match[1]);
    }

    return symbols;
  }

  /**
   * Detect undefined method calls in JavaScript
   */
  detectUndefinedMethods(line, lineNumber, definedSymbols, filePath) {
    const issues = [];

    // Pattern: obj.method() or just method()
    const methodCallRegex = /(\w+)\./g;
    let match;

    while ((match = methodCallRegex.exec(line)) !== null) {
      const objName = match[1];

      // Skip if it's a built-in object or defined symbol
      if (definedSymbols.has(objName)) {
        continue;
      }

      // Skip common patterns
      if (objName.startsWith('this.') || objName === 'super') {
        continue;
      }
    }

    // Pattern: method() call on undefined object
    const directMethodCallRegex = /(\w+)\s*\(/g;
    while ((match = directMethodCallRegex.exec(line)) !== null) {
      const methodName = match[1];

      // Skip if it's a built-in or defined symbol
      if (definedSymbols.has(methodName) || this.builtInObjects.has(methodName)) {
        continue;
      }

      // Skip control flow keywords
      const controlFlow = ['if', 'else', 'for', 'while', 'switch', 'case', 'catch', 'function'];
      if (controlFlow.includes(methodName)) {
        continue;
      }

      // This might be an undefined method
      issues.push({
        ruleId: 'AI-UNDEF-001',
        ruleName: '未定义的方法调用',
        severity: 'high',
        message: `方法 "${methodName}" 可能未定义`,
        suggestion: `检查 "${methodName}" 是否已定义或导入`,
        line: lineNumber,
        column: line.indexOf(match[0]) + 1,
        code: line.trim(),
        filePath: filePath,
        autoFix: false
      });
    }

    return issues;
  }

  /**
   * Detect undefined methods in Dart
   */
  detectUndefinedDartMethods(line, lineNumber, definedSymbols, filePath) {
    const issues = [];

    // Check for method calls
    const methodCallRegex = /(\w+)\(/g;
    let match;

    while ((match = methodCallRegex.exec(line)) !== null) {
      const methodName = match[1];

      // Skip if defined
      if (definedSymbols.has(methodName) || this.builtInObjects.has(methodName)) {
        continue;
      }

      // Skip common Dart keywords
      const dartKeywords = ['if', 'else', 'for', 'while', 'switch', 'case', 'catch', 'try', 'finally', 'class', 'extends', 'implements', 'with', 'mixin'];
      if (dartKeywords.includes(methodName)) {
        continue;
      }

      issues.push({
        ruleId: 'AI-UNDEF-002',
        ruleName: '未定义的方法调用 (Dart)',
        severity: 'high',
        message: `方法 "${methodName}" 可能未定义`,
        suggestion: `检查 "${methodName}" 是否已定义或导入`,
        line: lineNumber,
        column: line.indexOf(match[0]) + 1,
        code: line.trim(),
        filePath: filePath,
        autoFix: false
      });
    }

    return issues;
  }

  /**
   * Detect potential crashes
   */
  detectPotentialCrashes(line, lineNumber, filePath) {
    const issues = [];

    // 1. Null/undefined access without check
    if (line.includes('?.') === false && (line.match(/\w+\.\w+\./) || line.match(/\w+\.\w+\(/))) {
      // Check if there's no preceding null check
      if (!line.includes('!= null') && !line.includes('!== null') && !line.includes('if')) {
        const accessMatch = line.match(/(\w+)\.\w+/);
        if (accessMatch && !this.builtInObjects.has(accessMatch[1])) {
          issues.push({
            ruleId: 'AI-CRASH-001',
            ruleName: '潜在的空指针异常',
            severity: 'high',
            message: '可能因为访问 null/undefined 对象导致崩溃',
            suggestion: '在使用前添加空值检查或使用可选链操作符 (?.)',
            line: lineNumber,
            column: line.indexOf(accessMatch[0]) + 1,
            code: line.trim(),
            filePath: filePath,
            autoFix: false
          });
        }
      }
    }

    // 2. Array access without bounds check
    if (line.match(/\w+\[\w+\]/)) {
      if (!line.includes('.length') && !line.includes('.map') && !line.includes('.filter')) {
        issues.push({
          ruleId: 'AI-CRASH-002',
          ruleName: '数组越界风险',
          severity: 'medium',
          message: '数组访问可能导致越界错误',
          suggestion: '在使用前检查数组长度',
          line: lineNumber,
          column: 1,
          code: line.trim(),
          filePath: filePath,
          autoFix: false
        });
      }
    }

    // 3. JSON.parse without try-catch
    if (line.includes('JSON.parse') && !line.includes('try')) {
      issues.push({
        ruleId: 'AI-CRASH-003',
        ruleName: '未处理的 JSON 解析异常',
        severity: 'high',
        message: 'JSON.parse 可能抛出异常导致崩溃',
        suggestion: '使用 try-catch 包裹 JSON.parse 或使用安全的解析方法',
        line: lineNumber,
        column: 1,
        code: line.trim(),
        filePath: filePath,
        autoFix: false
      });
    }

    // 4. Division by zero risk
    if (line.match(/\/\s*\w+/) && !line.includes('!== 0') && !line.includes('!= 0')) {
      issues.push({
        ruleId: 'AI-CRASH-004',
        ruleName: '除零风险',
        severity: 'medium',
        message: '除法可能导致除零错误',
        suggestion: '在使用前检查除数是否为零',
        line: lineNumber,
        column: 1,
        code: line.trim(),
        filePath: filePath,
        autoFix: false
      });
    }

    return issues;
  }

  /**
   * Detect potential crashes in Dart
   */
  detectDartCrashes(line, lineNumber, filePath) {
    const issues = [];

    // Null safety violations
    if (line.includes('!') && line.includes('.') && !line.includes('?')) {
      issues.push({
        ruleId: 'AI-CRASH-005',
        ruleName: '潜在的空指针异常 (Dart)',
        severity: 'high',
        message: '使用 ! 操作符可能导致空指针异常',
        suggestion: '考虑使用 ?. 或 ?? 进行空值处理',
        line: lineNumber,
        column: 1,
        code: line.trim(),
        filePath: filePath,
        autoFix: false
      });
    }

    return issues;
  }

  /**
   * Detect memory leaks
   */
  detectMemoryLeaks(line, lineNumber, filePath) {
    const issues = [];

    // 1. Missing cleanup in useEffect
    if (line.includes('useEffect') && line.includes('setInterval') || line.includes('addEventListener')) {
      // Check if next lines don't have cleanup
      issues.push({
        ruleId: 'AI-MEM-001',
        ruleName: '潜在的内存泄漏',
        severity: 'high',
        message: 'useEffect 中使用定时器或事件监听器可能导致内存泄漏',
        suggestion: '在 useEffect 返回的清理函数中移除定时器或事件监听器',
        line: lineNumber,
        column: 1,
        code: line.trim(),
        filePath: filePath,
        autoFix: false
      });
    }

    // 2. Missing dependency array in useEffect
    if (line.includes('useEffect') && !line.includes('],')) {
      issues.push({
        ruleId: 'AI-MEM-002',
        ruleName: 'useEffect 缺少依赖数组',
        severity: 'medium',
        message: 'useEffect 缺少依赖数组可能导致意外的重复渲染或内存泄漏',
        suggestion: '添加适当的依赖数组或使用 [] 表示仅运行一次',
        line: lineNumber,
        column: 1,
        code: line.trim(),
        filePath: filePath,
        autoFix: false
      });
    }

    // 3. Large arrays in state
    if (line.includes('useState') && line.includes('[]')) {
      issues.push({
        ruleId: 'AI-MEM-003',
        ruleName: '状态中的大数组风险',
        severity: 'medium',
        message: '在状态中存储大数组可能导致性能问题',
        suggestion: '考虑使用 useMemo、useCallback 或分页来优化性能',
        line: lineNumber,
        column: 1,
        code: line.trim(),
        filePath: filePath,
        autoFix: false
      });
    }

    return issues;
  }

  /**
   * Detect memory leaks in Dart
   */
  detectDartMemoryLeaks(line, lineNumber, filePath) {
    const issues = [];

    // Missing dispose
    if (line.includes('StatefulWidget') && !line.includes('dispose')) {
      issues.push({
        ruleId: 'AI-MEM-004',
        ruleName: '未实现 dispose 方法',
        severity: 'high',
        message: 'StatefulWidget 应实现 dispose 方法以释放资源',
        suggestion: '重写 dispose 方法并释放控制器、监听器等资源',
        line: lineNumber,
        column: 1,
        code: line.trim(),
        filePath: filePath,
        autoFix: false
      });
    }

    return issues;
  }

  /**
   * Detect dead code
   */
  detectDeadCode(line, lineNumber, filePath) {
    const issues = [];

    // Code after return
    if (line.includes('return') && line.length > line.indexOf('return') + 10) {
      issues.push({
        ruleId: 'AI-DEAD-001',
        ruleName: '不可达代码',
        severity: 'low',
        message: 'return 语句后的代码永远不会执行',
        suggestion: '删除或重新组织代码逻辑',
        line: lineNumber,
        column: 1,
        code: line.trim(),
        filePath: filePath,
        autoFix: false
      });
    }

    return issues;
  }

  /**
   * Detect infinite loops
   */
  detectInfiniteLoops(line, lineNumber, filePath) {
    const issues = [];

    // while(true) without break
    if (line.includes('while(true)') || line.includes('while(1)')) {
      issues.push({
        ruleId: 'AI-LOOP-001',
        ruleName: '潜在无限循环',
        severity: 'high',
        message: 'while(true) 可能导致无限循环',
        suggestion: '确保循环中有明确的退出条件（break、return）',
        line: lineNumber,
        column: 1,
        code: line.trim(),
        filePath: filePath,
        autoFix: false
      });
    }

    // Missing loop counter increment
    if (line.match(/for\s*\(\s*let\s+\w+\s*=\s*0\s*;\s*\w+\s*<\s*\w+\s*;\s*\)/)) {
      issues.push({
        ruleId: 'AI-LOOP-002',
        ruleName: '缺少循环计数器递增',
        severity: 'high',
        message: 'for 循环缺少计数器递增，可能导致无限循环',
        suggestion: '在循环更新部分添加计数器递增（如 i++）',
        line: lineNumber,
        column: 1,
        code: line.trim(),
        filePath: filePath,
        autoFix: false
      });
    }

    return issues;
  }

  /**
   * Get file extension
   */
  getFileExtension(filePath) {
    const match = filePath.match(/\.(\w+)$/);
    return match ? '.' + match[1] : '';
  }
}

module.exports = DeepCodeAnalyzer;
