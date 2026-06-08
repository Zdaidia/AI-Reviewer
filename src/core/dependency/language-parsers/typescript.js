/**
 * TypeScript Language Parser
 *
 * Parses TypeScript/TSX files for imports and exports
 */

const fs = require('fs');

class TypeScriptParser {
  /**
   * Parse imports from TypeScript file
   * @param {Object} file - File object
   * @returns {Array} Import statements
   */
  parseImports(file) {
    try {
      const content = fs.readFileSync(file.path, 'utf8');
      const imports = [];

      // ES6 imports (same as JavaScript)
      const es6Patterns = [
        /import\s+\{\s*([^}]+)\s*\}\s*from\s+['"]([^'"]+)['"]/g,
        /import\s+(\w+)\s*,?\s*\{\s*([^}]+)\s*\}\s*from\s+['"]([^'"]+)['"]/g,
        /import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g,
        /import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g,
        /import\s+\{\s*([^}]+)\s*\}\s*from\s+['"]([^'"]+)['"]/g,
        /import\s+['"]([^'"]+)['"]/g,
        /import\(['"]([^'"]+)['"]\)/g,
      ];

      for (const pattern of es6Patterns) {
        let match;
        while ((match = pattern.exec(content)) !== null) {
          // Get the module path from last capturing group
          const modulePath = match[match.length - 1];
          imports.push({
            type: 'es6',
            path: modulePath,
            statement: match[0],
          });
        }
      }

      // Type-only imports
      const typeImportPattern = /import\s+type\s+\{\s*([^}]+)\s*\}\s*from\s+['"]([^'"]+)['"]/g;
      let match;
      while ((match = typeImportPattern.exec(content)) !== null) {
        imports.push({
          type: 'type',
          path: match[2],
          statement: match[0],
        });
      }

      // CommonJS requires
      const requirePattern = /require\(['"]([^'"]+)['"]\)/g;
      while ((match = requirePattern.exec(content)) !== null) {
        imports.push({
          type: 'commonjs',
          path: match[1],
          statement: match[0],
        });
      }

      return imports;
    } catch (error) {
      return [];
    }
  }

  /**
   * Parse exports from TypeScript file
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
      const defaultExportPattern = /export\s+default\s+(?:class|function|interface|type|enum)?\s*(\w+)?/g;
      while ((match = defaultExportPattern.exec(content)) !== null) {
        exports.push({
          type: 'default',
          name: match[2] || 'anonymous',
          statement: match[0],
        });
      }

      // Export declarations
      const declarationPattern = /export\s+(class|function|interface|type|enum|const|let|var|abstract class)\s+(\w+)/g;
      while ((match = declarationPattern.exec(content)) !== null) {
        exports.push({
          type: match[1],
          name: match[2],
          statement: match[0],
        });
      }

      // Type-only exports
      const typeExportPattern = /export\s+type\s*\{\s*([^}]+)\s*\}/g;
      while ((match = typeExportPattern.exec(content)) !== null) {
        exports.push({
          type: 'type',
          names: match[1].split(',').map(s => s.trim()),
          statement: match[0],
        });
      }

      // Export from
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
      if (imp.type === 'type') {
        // Type-only imports don't need runtime loading
        continue;
      }

      if (imp.path.startsWith('.')) {
        // Relative import
        const filePath = this.resolvePath(imp.path, file.path, projectPath);
        if (filePath) {
          required.push({
            import: imp.path,
            resolved: filePath,
            type: imp.type,
          });
        }
      } else if (!imp.path.startsWith('node:')) {
        // External dependency
        try {
          const nodeModulesPath = require.resolve(imp.path, {
            paths: [projectPath],
          });
          required.push({
            import: imp.path,
            resolved: nodeModulesPath,
            type: imp.type,
          });
        } catch {
          // Module not found, skip
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
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '.json'];
    for (const ext of extensions) {
      const withExt = resolved + ext;
      if (fs.existsSync(withExt)) {
        return withExt;
      }
    }

    // Try index file
    const indexPath = path.join(resolved, 'index.ts');
    if (fs.existsSync(indexPath)) {
      return indexPath;
    }

    const jsIndexPath = path.join(resolved, 'index.js');
    if (fs.existsSync(jsIndexPath)) {
      return jsIndexPath;
    }

    return null;
  }
}

module.exports = new TypeScriptParser();
