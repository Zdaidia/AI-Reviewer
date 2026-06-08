/**
 * JavaScript Language Parser
 *
 * Parses JavaScript/JSX files for imports and exports
 */

const fs = require('fs');

class JavaScriptParser {
  /**
   * Parse imports from JavaScript file
   * @param {Object} file - File object
   * @returns {Array} Import statements
   */
  parseImports(file) {
    try {
      const content = fs.readFileSync(file.path, 'utf8');
      const imports = [];

      // ES6 imports: import ... from '...'
      const es6Patterns = [
        // import { x, y } from 'module'
        /import\s+\{\s*([^}]+)\s*\}\s*from\s+['"]([^'"]+)['"]/g,
        // import x from 'module'
        /import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g,
        // import * as x from 'module'
        /import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g,
        // import 'module' (side effects)
        /import\s+['"]([^'"]+)['"]/g,
        // Dynamic imports: import('module')
        /import\(['"]([^'"]+)['"]\)/g,
      ];

      for (const pattern of es6Patterns) {
        let match;
        while ((match = pattern.exec(content)) !== null) {
          const modulePath = match[2] || match[1];
          imports.push({
            type: 'es6',
            path: modulePath,
            statement: match[0],
          });
        }
      }

      // CommonJS requires: require('module')
      const requirePattern = /require\(['"]([^'"]+)['"]\)/g;
      let match;
      while ((match = requirePattern.exec(content)) !== null) {
        imports.push({
          type: 'commonjs',
          path: match[1],
          statement: match[0],
        });
      }

      // Export from (re-export)
      const exportFromPattern = /export\s+\{\s*([^}]+)\s*\}\s*from\s+['"]([^'"]+)['"]/g;
      while ((match = exportFromPattern.exec(content)) !== null) {
        imports.push({
          type: 're-export',
          path: match[2],
          statement: match[0],
        });
      }

      return imports;
    } catch (error) {
      return [];
    }
  }

  /**
   * Parse exports from JavaScript file
   * @param {Object} file - File object
   * @returns {Array} Export statements
   */
  parseExports(file) {
    try {
      const content = fs.readFileSync(file.path, 'utf8');
      const exports = [];

      // Named exports: export { x, y }
      const namedExportPattern = /export\s+\{\s*([^}]+)\s*\}/g;
      let match;
      while ((match = namedExportPattern.exec(content)) !== null) {
        exports.push({
          type: 'named',
          names: match[1].split(',').map(s => s.trim()),
          statement: match[0],
        });
      }

      // Default export: export default ...
      const defaultExportPattern = /export\s+default\s+(?:class\s+)?(\w+)?/g;
      while ((match = defaultExportPattern.exec(content)) !== null) {
        exports.push({
          type: 'default',
          name: match[1] || 'anonymous',
          statement: match[0],
        });
      }

      // Export class/function/const/let/var
      const declarationPattern = /export\s+(class|function|const|let|var)\s+(\w+)/g;
      while ((match = declarationPattern.exec(content)) !== null) {
        exports.push({
          type: match[1],
          name: match[2],
          statement: match[0],
        });
      }

      // Export from (re-export)
      const exportFromPattern = /export\s+\{\s*([^}]+)\s*\}\s*from\s+['"]([^'"]+)['"]/g;
      while ((match = exportFromPattern.exec(content)) !== null) {
        exports.push({
          type: 're-export',
          names: match[1].split(',').map(s => s.trim()),
          from: match[2],
          statement: match[0],
        });
      }

      return exports;
    } catch (error) {
      return [];
    }
  }

  /**
   * Get file dependencies
   * @param {Object} file - File object
   * @param {string} projectPath - Project root path
   * @returns {Array} Required files
   */
  getRequiredFiles(file, projectPath) {
    const imports = this.parseImports(file);
    const required = [];

    for (const imp of imports) {
      if (imp.path.startsWith('.')) {
        // Relative import - resolve path
        const filePath = this.resolvePath(imp.path, file.path, projectPath);
        if (filePath) {
          required.push({
            import: imp.path,
            resolved: filePath,
            type: imp.type,
          });
        }
      } else if (!imp.path.startsWith('node:')) {
        // External dependency - check if in node_modules
        const nodeModulesPath = require.resolve(imp.path, {
          paths: [projectPath],
        });
        if (nodeModulesPath) {
          required.push({
            import: imp.path,
            resolved: nodeModulesPath,
            type: imp.type,
          });
        }
      }
    }

    return required;
  }

  /**
   * Resolve module path
   * @param {string} importPath - Import path
   * @param {string} fromFile - Source file path
   * @param {string} projectPath - Project root
   * @returns {string|null} Resolved path
   */
  resolvePath(importPath, fromFile, projectPath) {
    const fs = require('fs');
    const path = require('path');

    const fromDir = path.dirname(fromFile);
    const resolved = path.resolve(fromDir, importPath);

    // Check if file exists
    if (fs.existsSync(resolved)) {
      return resolved;
    }

    // Try with extensions
    const extensions = ['.js', '.jsx', '.json'];
    for (const ext of extensions) {
      const withExt = resolved + ext;
      if (fs.existsSync(withExt)) {
        return withExt;
      }
    }

    // Try index file
    const indexPath = path.join(resolved, 'index.js');
    if (fs.existsSync(indexPath)) {
      return indexPath;
    }

    return null;
  }
}

module.exports = new JavaScriptParser();
