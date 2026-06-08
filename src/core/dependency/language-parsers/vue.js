/**
 * Vue Language Parser
 *
 * Parses Vue SFC files for imports and exports
 */

const JavaScriptParser = require('./javascript');

class VueParser {
  /**
   * Parse imports from Vue file
   * @param {Object} file - File object
   * @returns {Array} Import statements
   */
  parseImports(file) {
    try {
      const content = fs.readFileSync(file.path, 'utf8');
      const imports = [];

      // Extract script section
      const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/);
      if (!scriptMatch) {
        return imports;
      }

      const scriptContent = scriptMatch[1];

      // Use JavaScript parser for script content
      const jsImports = JavaScriptParser.parseImports({
        path: file.path,
        content: scriptContent,
      });

      return jsImports;
    } catch (error) {
      return [];
    }
  }

  /**
   * Parse exports from Vue file
   * @param {Object} file - File object
   * @returns {Array} Export statements
   */
  parseExports(file) {
    try {
      const content = fs.readFileSync(file.path, 'utf8');
      const exports = [];

      // Vue component default export
      exports.push({
        type: 'default',
        name: 'VueComponent',
        statement: 'export default',
      });

      // Extract script section for named exports
      const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/);
      if (scriptMatch) {
        const jsExports = JavaScriptParser.parseExports({
          path: file.path,
          content: scriptMatch[1],
        });

        // Filter out the default export since we already added it
        return jsExports.filter(e => e.type !== 'default');
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
    try {
      const content = fs.readFileSync(file.path, 'utf8');
      const required = [];
      const path = require('path');

      // Parse template section for components
      const templateMatch = content.match(/<template[^>]*>([\s\S]*?)<\/template>/);
      if (templateMatch) {
        const templateContent = templateMatch[1];

        // Find component references (kebab-case to PascalCase)
        const componentPattern = /<([A-Z][a-zA-Z0-9]*)/g;
        let match;
        const components = new Set();

        while ((match = componentPattern.exec(templateContent)) !== null) {
          components.add(match[1]);
        }

        // Try to resolve component files
        for (const component of components) {
          const kebabCase = component.replace(/([A-Z])/g, '-$1').toLowerCase();
          const possiblePaths = [
            path.join(projectPath, 'src', 'components', `${kebabCase}.vue`),
            path.join(projectPath, 'src', 'components', `${component}.vue`),
            path.join(projectPath, 'components', `${kebabCase}.vue`),
            path.join(projectPath, 'components', `${component}.vue`),
          ];

          for (const possiblePath of possiblePaths) {
            if (fs.existsSync(possiblePath)) {
              required.push({
                import: component,
                resolved: possiblePath,
                type: 'component',
              });
              break;
            }
          }
        }
      }

      // Parse script section for imports
      const scriptImports = this.parseImports(file);
      const fromDir = path.dirname(file.path);

      for (const imp of scriptImports) {
        if (imp.path.startsWith('.')) {
          const resolvedPath = path.resolve(fromDir, imp.path);
          const tryPaths = [
            resolvedPath,
            resolvedPath + '.vue',
            resolvedPath + '.js',
            resolvedPath + '.ts',
            resolvedPath + '.jsx',
            resolvedPath + '.tsx',
            path.join(resolvedPath, 'index.vue'),
            path.join(resolvedPath, 'index.js'),
          ];

          for (const tryPath of tryPaths) {
            if (fs.existsSync(tryPath)) {
              required.push({
                import: imp.path,
                resolved: tryPath,
                type: imp.type,
              });
              break;
            }
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
            // Skip unresolved
          }
        }
      }

      return required;
    } catch (error) {
      return [];
    }
  }
}

module.exports = new VueParser();
