/**
 * Dependency Analyzer
 *
 * Analyzes project dependencies and builds context tree for AI fixing
 */

const fs = require('fs');
const path = require('path');

class DependencyAnalyzer {
  constructor() {
    this.cache = new Map();
  }

  /**
   * Analyze dependencies for a file
   * @param {string} filePath - File path
   * @param {Object} options - Analysis options
   * @returns {Object} Dependency context
   */
  analyzeFile(filePath, options = {}) {
    const { maxDepth = 2, includeNodeModules = false } = options;

    // Check cache first
    const cacheKey = `${filePath}:${maxDepth}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const result = {
      filePath,
      imports: [],
      exports: [],
      dependencies: [],
      types: [],
      context: {},
    };

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const dir = path.dirname(filePath);
      const ext = path.extname(filePath).toLowerCase();

      // Parse imports based on file type
      if (['.js', '.jsx', '.ts', '.tsx'].includes(ext)) {
        this.parseJavaScriptImports(content, result, dir);
      } else if (ext === '.vue') {
        this.parseVueImports(content, result, dir);
      } else if (ext === '.dart') {
        this.parseDartImports(content, result, dir);
      }

      // Recursively analyze dependencies if depth > 0
      if (maxDepth > 0) {
        for (const dep of result.imports) {
          if (dep.resolved && this.shouldAnalyze(dep.resolved, includeNodeModules)) {
            dep.context = this.analyzeFile(dep.resolved, {
              maxDepth: maxDepth - 1,
              includeNodeModules,
            });
          }
        }
      }

      // Build context summary
      result.context = this.buildContextSummary(result);

      this.cache.set(cacheKey, result);
      return result;
    } catch (error) {
      console.error(`Error analyzing ${filePath}:`, error.message);
      return result;
    }
  }

  /**
   * Parse JavaScript/TypeScript imports
   */
  parseJavaScriptImports(content, result, dir) {
    // Import patterns
    const patterns = [
      // ES6 imports
      /import\s+(?:(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s*,?\s*)*)\s*from\s+['"]([^'"]+)['"]/g,
      // ES6 default imports
      /import\s+(['"]([^'"]+)['"])/g,
      // Require statements
      /(?:const|let|var)\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s*,?\s*)*\s*=\s*require\(['"]([^'"]+)['"]\)/g,
      // Dynamic imports
      /import\(['"]([^'"]+)['"]\)/g,
    ];

    // Export patterns
    const exportPatterns = [
      /export\s+(?:default\s+)?(?:class|function|const|let|var)\s+(\w+)/g,
      /export\s*\{([^}]+)\}/g,
    ];

    // Parse imports
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const importPath = match[2] || match[1];
        const resolved = this.resolveImportPath(importPath, dir);

        result.imports.push({
          path: importPath,
          resolved: resolved?.path,
          type: this.getImportType(importPath),
          external: resolved?.external || false,
        });
      }
    }

    // Parse exports
    for (const pattern of exportPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        result.exports.push({
          name: match[1] || match[2],
          type: 'export',
        });
      }
    }
  }

  /**
   * Parse Vue imports
   */
  parseVueImports(content, result, dir) {
    // Extract script section
    const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/);
    if (!scriptMatch) return;

    const scriptContent = scriptMatch[1];
    this.parseJavaScriptImports(scriptContent, result, dir);
  }

  /**
   * Parse Dart imports
   */
  parseDartImports(content, result, dir) {
    // Dart import pattern: import 'package:...' or import '...'
    const pattern = /import\s+['"]([^'"]+)['"]/g;

    let match;
    while ((match = pattern.exec(content)) !== null) {
      const importPath = match[1];
      result.imports.push({
        path: importPath,
        resolved: null, // Dart uses pubspec for resolution
        type: this.getDartImportType(importPath),
        external: !importPath.startsWith('.'),
      });
    }
  }

  /**
   * Resolve import path to actual file
   */
  resolveImportPath(importPath, dir) {
    // Node modules
    if (!importPath.startsWith('.')) {
      return {
        path: importPath,
        external: true,
      };
    }

    // Relative imports
    const possiblePaths = [
      path.resolve(dir, importPath),
      path.resolve(dir, importPath + '.js'),
      path.resolve(dir, importPath + '.jsx'),
      path.resolve(dir, importPath + '.ts'),
      path.resolve(dir, importPath + '.tsx'),
      path.resolve(dir, importPath + '.json'),
      path.resolve(dir, importPath, 'index.js'),
      path.resolve(dir, importPath, 'index.ts'),
    ];

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        return { path: p, external: false };
      }
    }

    return null;
  }

  /**
   * Get import type
   */
  getImportType(importPath) {
    if (importPath.startsWith('.')) return 'local';
    if (importPath.startsWith('node:')) return 'builtin';
    return 'package';
  }

  /**
   * Get Dart import type
   */
  getDartImportType(importPath) {
    if (importPath.startsWith('package:')) return 'package';
    if (importPath.startsWith('dart:')) return 'builtin';
    return 'local';
  }

  /**
   * Check if file should be analyzed
   */
  shouldAnalyze(filePath, includeNodeModules) {
    if (filePath.includes('node_modules') && !includeNodeModules) {
      return false;
    }
    return fs.existsSync(filePath);
  }

  /**
   * Build context summary for AI
   */
  buildContextSummary(analysis) {
    const summary = {
      imports: analysis.imports.map(imp => ({
        path: imp.path,
        type: imp.type,
      })),
      exports: analysis.exports.map(exp => ({
        name: exp.name,
      })),
    };

    return summary;
  }

  /**
   * Get file content with context
   * @param {string} filePath - File path
   * @param {number} line - Line number
   * @param {number} contextLines - Lines of context before/after
   * @returns {Object} Content with context
   */
  getFileContext(filePath, line, contextLines = 10) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');

      const startLine = Math.max(0, line - contextLines - 1);
      const endLine = Math.min(lines.length, line + contextLines);

      return {
        before: lines.slice(startLine, line - 1).join('\n'),
        target: lines[line - 1],
        after: lines.slice(line, endLine).join('\n'),
        lineNumbers: {
          start: startLine + 1,
          target: line,
          end: endLine,
        },
      };
    } catch (error) {
      console.error(`Error getting context for ${filePath}:`, error.message);
      return null;
    }
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }
}

module.exports = DependencyAnalyzer;
