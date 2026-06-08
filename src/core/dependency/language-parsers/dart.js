/**
 * Dart Language Parser
 *
 * Parses Dart files for imports and exports
 */

const fs = require('fs');

class DartParser {
  /**
   * Parse imports from Dart file
   * @param {Object} file - File object
   * @returns {Array} Import statements
   */
  parseImports(file) {
    try {
      const content = fs.readFileSync(file.path, 'utf8');
      const imports = [];

      // Dart imports: import 'package:...' or import '...'
      const importPattern = /import\s+['"]([^'"]+)['"]/g;
      let match;
      while ((match = importPattern.exec(content)) !== null) {
        imports.push({
          type: match[1].startsWith('package:') ? 'package' : 'relative',
          path: match[1],
          statement: match[0],
        });
      }

      // Dart imports with show/hide/as
      const importWithClausePattern = /import\s+['"]([^'"]+)['"]\s+(show|hide)\s+([^;]+);/g;
      while ((match = importWithClausePattern.exec(content)) !== null) {
        imports.push({
          type: match[1].startsWith('package:') ? 'package' : 'relative',
          path: match[1],
          clause: match[2],
          symbols: match[3],
          statement: match[0],
        });
      }

      return imports;
    } catch (error) {
      return [];
    }
  }

  /**
   * Parse exports from Dart file
   * @param {Object} file - File object
   * @returns {Array} Export statements
   */
  parseExports(file) {
    try {
      const content = fs.readFileSync(file.path, 'utf8');
      const exports = [];

      // Library exports
      const exportPattern = /export\s+(['"])([^'"]+)\1\s*(show|hide)?\s*([^;]+)?;/g;
      let match;
      while ((match = exportPattern.exec(content)) !== null) {
        exports.push({
          type: 'library',
          uri: match[2],
          clause: match[3],
          symbols: match[4],
          statement: match[0],
        });
      }

      // Class/function declarations (implicit exports)
      const classPattern = /\b(class\s+(\w+))/g;
      while ((match = classPattern.exec(content)) !== null) {
        exports.push({
          type: 'class',
          name: match[1],
        });
      }

      const functionPattern = /\b(\w+)\s*\([^)]*\)\s*(?:async\s*)?{/g;
      while ((match = functionPattern.exec(content)) !== null) {
        exports.push({
          type: 'function',
          name: match[1],
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
    const path = require('path');

    for (const imp of imports) {
      if (imp.path.startsWith('package:')) {
        // Package import - resolve from lib folder
        const packageName = imp.path.replace('package:', '').split('/')[0];
        const libPath = path.join(projectPath, '.dart_tool', packageName, 'lib');

        if (fs.existsSync(libPath)) {
          // Try to find the specific file
          const relativePath = imp.path.substring(packageName.length + 9); // +9 for 'package:/'
          if (relativePath) {
            const filePath = path.join(libPath, relativePath + '.dart');
            if (fs.existsSync(filePath)) {
              required.push({
                import: imp.path,
                resolved: filePath,
                type: 'package',
              });
            }
          } else {
            // Use main library file
            const mainPath = path.join(libPath, packageName + '.dart');
            if (fs.existsSync(mainPath)) {
              required.push({
                import: imp.path,
                resolved: mainPath,
                type: 'package',
              });
            }
          }
        }
      } else if (imp.path.startsWith('dart:')) {
        // Dart built-in - skip
        continue;
      } else {
        // Relative import
        const filePath = this.resolvePath(imp.path, file.path, projectPath);
        if (filePath) {
          required.push({
            import: imp.path,
            resolved: filePath,
            type: 'relative',
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
    const path = require('path');

    const fromDir = path.dirname(fromFile);
    const resolved = path.resolve(fromDir, importPath);

    // Try with .dart extension
    if (fs.existsSync(resolved + '.dart')) {
      return resolved + '.dart';
    }

    return fs.existsSync(resolved) ? resolved : null;
  }
}

module.exports = new DartParser();
