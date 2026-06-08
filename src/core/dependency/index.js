/**
 * Dependency Loader Module
 *
 * Responsibilities:
 * - Auto-detect project dependencies
 * - Load required files and configurations
 * - Build dependency tree for context
 * - Ensure functionality can execute properly
 *
 * Supported Config Files:
 * - package.json (Node.js)
 * - tsconfig.json (TypeScript)
 * - pubspec.yaml (Dart)
 * - vue.config.js (Vue)
 * - Custom configurations
 */

const fs = require('fs');
const path = require('path');

class DependencyLoader {
  constructor() {
    this.dependencyCache = new Map();
    this.languageParsers = {
      javascript: require('./language-parsers/javascript'),
      typescript: require('./language-parsers/typescript'),
      dart: require('./language-parsers/dart'),
      vue: require('./language-parsers/vue'),
    };
  }

  /**
   * Detect project type from path
   * @param {string} projectPath - Project directory path
   * @returns {Object} Project info
   */
  detectProjectType(projectPath) {
    const files = fs.readdirSync(projectPath);
    const fileName = files.join(' ').toLowerCase();

    // Check for Dart
    if (files.includes('pubspec.yaml')) {
      return { type: 'dart', configFiles: ['pubspec.yaml'] };
    }

    // Check for Vue
    if (files.includes('vue.config.js') || files.includes('vue.config.ts')) {
      return { type: 'vue', configFiles: ['package.json', 'vue.config.js'] };
    }

    // Check for TypeScript/JavaScript
    if (files.includes('package.json')) {
      const pkgJsonPath = path.join(projectPath, 'package.json');
      try {
        const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
        const deps = { ...pkgJson.dependencies, ...pkgJson.devDependencies };

        if (deps.typescript || deps['@types/node'] || files.includes('tsconfig.json')) {
          return { type: 'typescript', configFiles: ['package.json', 'tsconfig.json'] };
        }
        return { type: 'javascript', configFiles: ['package.json'] };
      } catch {
        return { type: 'javascript', configFiles: ['package.json'] };
      }
    }

    return { type: 'unknown', configFiles: [] };
  }

  /**
   * Load project dependencies
   * @param {string} projectPath - Project directory path
   * @returns {Object} Loaded dependencies
   */
  loadDependencies(projectPath) {
    const cacheKey = projectPath;
    if (this.dependencyCache.has(cacheKey)) {
      return this.dependencyCache.get(cacheKey);
    }

    const result = {
      projectPath,
      type: 'unknown',
      configFiles: {},
      dependencies: [],
      files: new Map(),
      dependencyTree: null,
    };

    try {
      // Detect project type
      const projectInfo = this.detectProjectType(projectPath);
      result.type = projectInfo.type;

      // Load config files
      for (const configFile of projectInfo.configFiles) {
        const configPath = path.join(projectPath, configFile);
        if (fs.existsSync(configPath)) {
          result.configFiles[configFile] = this.loadConfigFile(configPath);
        }
      }

      // Load package dependencies
      if (result.configFiles['package.json']) {
        result.dependencies = this.loadNpmDependencies(result.configFiles['package.json']);
      }

      // Load Dart dependencies
      if (result.configFiles['pubspec.yaml']) {
        result.dependencies = this.loadDartDependencies(result.configFiles['pubspec.yaml']);
      }

      // Build dependency tree
      result.dependencyTree = this.buildDependencyTree(projectPath, result.type);

      this.dependencyCache.set(cacheKey, result);
      return result;
    } catch (error) {
      console.error('Error loading dependencies:', error.message);
      return result;
    }
  }

  /**
   * Load config file
   * @param {string} filePath - Config file path
   * @returns {Object} Parsed config
   */
  loadConfigFile(filePath) {
    try {
      const ext = path.extname(filePath).toLowerCase();
      const content = fs.readFileSync(filePath, 'utf8');

      if (ext === '.json') {
        return JSON.parse(content);
      } else if (ext === '.yaml' || ext === '.yml') {
        const yaml = require('js-yaml');
        return yaml.load(content);
      } else {
        // JS config files - try to evaluate
        // For security, we'll just return the raw content
        return { _raw: content, _type: 'javascript' };
      }
    } catch (error) {
      console.error(`Error loading config ${filePath}:`, error.message);
      return null;
    }
  }

  /**
   * Load npm dependencies from package.json
   * @param {Object} packageJson - Parsed package.json
   * @returns {Array} Dependencies list
   */
  loadNpmDependencies(packageJson) {
    const dependencies = [];

    const addDeps = (deps, type) => {
      if (!deps) return;
      for (const [name, version] of Object.entries(deps)) {
        dependencies.push({
          name,
          version,
          type,
          installed: this.isNpmPackageInstalled(name, packageJson),
        });
      }
    };

    addDeps(packageJson.dependencies, 'dependency');
    addDeps(packageJson.devDependencies, 'devDependency');
    addDeps(packageJson.peerDependencies, 'peerDependency');

    return dependencies;
  }

  /**
   * Load Dart dependencies from pubspec.yaml
   * @param {Object} pubspec - Parsed pubspec.yaml
   * @returns {Array} Dependencies list
   */
  loadDartDependencies(pubspec) {
    const dependencies = [];

    const addDeps = (deps, type) => {
      if (!deps) return;
      for (const [name, version] of Object.entries(deps)) {
        // Version could be a string or object with 'version' property
        const ver = typeof version === 'string' ? version : version.version;
        dependencies.push({
          name,
          version: ver,
          type,
        });
      }
    };

    addDeps(pubspec.dependencies, 'dependency');
    addDeps(pubspec.dev_dependencies, 'devDependency');

    return dependencies;
  }

  /**
   * Check if npm package is installed
   * @param {string} packageName - Package name
   * @param {Object} packageJson - package.json object
   * @returns {boolean} True if installed
   */
  isNpmPackageInstalled(packageName, packageJson) {
    // Check in node_modules
    const projectPath = path.dirname(packageJson._path || '.');
    const nodeModulesPath = path.join(projectPath, 'node_modules', packageName);
    return fs.existsSync(nodeModulesPath);
  }

  /**
   * Build dependency tree
   * @param {string} projectPath - Project path
   * @param {string} type - Project type
   * @returns {Object} Dependency tree
   */
  buildDependencyTree(projectPath, type) {
    const tree = {
      path: projectPath,
      type,
      files: [],
      imports: new Map(),
      exports: new Map(),
    };

    // Get all source files
    const sourceFiles = this.getSourceFiles(projectPath, type);
    tree.files = sourceFiles;

    // Parse each file for imports
    for (const file of sourceFiles) {
      const imports = this.parseFileImports(file, type);
      if (imports && imports.length > 0) {
        tree.imports.set(file.path, imports);
      }
    }

    // Build export map
    for (const file of sourceFiles) {
      const exports = this.parseFileExports(file, type);
      if (exports && exports.length > 0) {
        tree.exports.set(file.path, exports);
      }
    }

    return tree;
  }

  /**
   * Get source files for project
   * @param {string} projectPath - Project path
   * @param {string} type - Project type
   * @returns {Array} Source files
   */
  getSourceFiles(projectPath, type) {
    const files = [];
    const extensions = {
      javascript: ['.js', '.jsx'],
      typescript: ['.ts', '.tsx'],
      dart: ['.dart'],
      vue: ['.vue'],
    };

    const targetExts = extensions[type] || extensions.javascript;

    const scanDir = (dir, baseDir = dir) => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        const excludeDirs = ['node_modules', '.git', 'dist', 'build', 'coverage', '.dart_tool'];

        for (const entry of entries) {
          if (entry.isDirectory()) {
            if (!excludeDirs.includes(entry.name)) {
              scanDir(path.join(dir, entry.name), baseDir);
            }
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (targetExts.includes(ext)) {
              const fullPath = path.join(dir, entry.name);
              const relativePath = path.relative(baseDir, fullPath);
              files.push({
                path: fullPath,
                relativePath,
                name: entry.name,
                language: this.getLanguageFromExt(ext),
              });
            }
          }
        }
      } catch (error) {
        console.error(`Error scanning directory ${dir}:`, error.message);
      }
    };

    scanDir(projectPath);
    return files;
  }

  /**
   * Parse file imports
   * @param {Object} file - File object
   * @param {string} type - Project type
   * @returns {Array} Import statements
   */
  parseFileImports(file, type) {
    try {
      const parser = this.languageParsers[type];
      if (!parser) {
        return this.parseImportsGeneric(file);
      }

      return parser.parseImports(file);
    } catch (error) {
      console.error(`Error parsing imports for ${file.path}:`, error.message);
      return [];
    }
  }

  /**
   * Generic import parser (fallback)
   * @param {Object} file - File object
   * @returns {Array} Import statements
   */
  parseImportsGeneric(file) {
    try {
      const content = fs.readFileSync(file.path, 'utf8');
      const imports = [];

      // Match ES6 imports
      const es6ImportRegex = /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s*,?\s*)*from\s+['"]([^'"]+)['"]/g;
      let match;
      while ((match = es6ImportRegex.exec(content)) !== null) {
        imports.push({
          type: 'es6',
          path: match[2],
          statement: match[0],
        });
      }

      // Match require statements
      const requireRegex = /require\(['"]([^'"]+)['"]\)/g;
      while ((match = requireRegex.exec(content)) !== null) {
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
   * Parse file exports
   * @param {Object} file - File object
   * @param {string} type - Project type
   * @returns {Array} Export statements
   */
  parseFileExports(file, type) {
    try {
      const parser = this.languageParsers[type];
      if (!parser || !parser.parseExports) {
        return this.parseExportsGeneric(file);
      }

      return parser.parseExports(file);
    } catch (error) {
      return [];
    }
  }

  /**
   * Generic export parser (fallback)
   * @param {Object} file - File object
   * @returns {Array} Export statements
   */
  parseExportsGeneric(file) {
    try {
      const content = fs.readFileSync(file.path, 'utf8');
      const exports = [];

      // Match export statements
      const exportRegex = /export\s+(?:(default\s+(?:class|function|const|let|var)\s+(\w+))|(?:\{([^}]+)\}))|export\s+class\s+(\w+)/g;
      let match;
      while ((match = exportRegex.exec(content)) !== null) {
        if (match[1]) {
          exports.push({
            type: 'default',
            name: match[1],
            statement: match[0],
          });
        } else if (match[2]) {
          exports.push({
            type: 'named',
            names: match[2].split(',').map(s => s.trim()),
            statement: match[0],
          });
        } else if (match[4]) {
          exports.push({
            type: 'class',
            name: match[4],
            statement: match[0],
          });
        }
      }

      return exports;
    } catch (error) {
      return [];
    }
  }

  /**
   * Get language from file extension
   * @param {string} ext - File extension
   * @returns {string} Language
   */
  getLanguageFromExt(ext) {
    const langMap = {
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.vue': 'vue',
      '.dart': 'dart',
    };
    return langMap[ext] || 'unknown';
  }

  /**
   * Resolve import path to actual file
   * @param {string} importPath - Import path
   * @param {string} fromFile - Source file path
   * @param {string} projectPath - Project root
   * @returns {string|null} Resolved file path
   */
  resolveImportPath(importPath, fromFile, projectPath) {
    // Node.js built-in modules
    if (importPath.startsWith('node:')) {
      return null; // Built-in, no file to load
    }

    // Absolute imports from node_modules
    if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
      const nodeModulesPath = path.join(projectPath, 'node_modules', importPath);
      if (fs.existsSync(nodeModulesPath)) {
        return nodeModulesPath;
      }

      // Try with index.js
      const indexPath = path.join(nodeModulesPath, 'index.js');
      if (fs.existsSync(indexPath)) {
        return indexPath;
      }

      return null;
    }

    // Relative imports
    const fromDir = path.dirname(fromFile);
    const resolvedPath = path.resolve(fromDir, importPath);

    // Try direct path
    if (fs.existsSync(resolvedPath)) {
      return resolvedPath;
    }

    // Try with extensions
    const extensions = ['.js', '.jsx', '.ts', '.tsx', '.vue', '/index.js', '/index.ts'];
    for (const ext of extensions) {
      const tryPath = resolvedPath + ext;
      if (fs.existsSync(tryPath)) {
        return tryPath;
      }
    }

    return null;
  }

  /**
   * Get complete file context with dependencies
   * @param {string} filePath - File path
   * @param {string} projectPath - Project path
   * @param {Object} options - Options
   * @returns {Object} File context
   */
  getFileContext(filePath, projectPath, options = {}) {
    const {
      includeImports = true,
      maxDepth = 3,
      loadedFiles = new Set(),
    } = options;

    if (loadedFiles.has(filePath)) {
      return { path: filePath, content: '', cached: true };
    }

    loadedFiles.add(filePath);

    const result = {
      path: filePath,
      content: '',
      imports: [],
      dependencies: [],
    };

    try {
      result.content = fs.readFileSync(filePath, 'utf8');

      const ext = path.extname(filePath).toLowerCase();
      const type = this.getLanguageFromExt(ext);

      if (includeImports && maxDepth > 0) {
        const imports = this.parseFileImports({ path: filePath }, type);

        for (const imp of imports) {
          result.imports.push(imp);

          const resolvedPath = this.resolveImportPath(imp.path, filePath, projectPath);
          if (resolvedPath && !loadedFiles.has(resolvedPath)) {
            result.dependencies.push({
              ...imp,
              resolvedPath,
              context: this.getFileContext(resolvedPath, projectPath, {
                includeImports: true,
                maxDepth: maxDepth - 1,
                loadedFiles,
              }),
            });
          }
        }
      }
    } catch (error) {
      console.error(`Error getting context for ${filePath}:`, error.message);
    }

    return result;
  }

  /**
   * Load all files needed for a feature
   * @param {string} targetPath - Target file or directory
   * @param {string} feature - Feature type (scan, fix, ai-fix, test)
   * @returns {Object} Loaded files and dependencies
   */
  loadForFeature(targetPath, feature = 'scan') {
    const stat = fs.statSync(targetPath);
    const projectPath = stat.isDirectory() ? targetPath : path.dirname(targetPath);

    // Load project dependencies
    const projectDeps = this.loadDependencies(projectPath);

    // Get files to process
    let filesToProcess = [];
    if (stat.isDirectory()) {
      const projectType = projectDeps.type;
      filesToProcess = this.getSourceFiles(targetPath, projectType);
    } else {
      filesToProcess = [{ path: targetPath, name: path.basename(targetPath) }];
    }

    // Load context for each file
    const loadedFiles = new Map();
    for (const file of filesToProcess) {
      const context = this.getFileContext(file.path, projectPath, {
        includeImports: true,
        maxDepth: this.getMaxDepthForFeature(feature),
      });
      loadedFiles.set(file.path, context);
    }

    return {
      projectPath,
      projectType: projectDeps.type,
      configFiles: projectDeps.configFiles,
      dependencies: projectDeps.dependencies,
      files: loadedFiles,
      fileCount: loadedFiles.size,
    };
  }

  /**
   * Get max dependency depth for feature
   * @param {string} feature - Feature type
   * @returns {number} Max depth
   */
  getMaxDepthForFeature(feature) {
    const depths = {
      scan: 2,
      fix: 1,
      'ai-fix': 3,
      test: 2,
    };
    return depths[feature] || 2;
  }

  /**
   * Clear dependency cache
   */
  clearCache() {
    this.dependencyCache.clear();
  }

  /**
   * Get dependency tree for UI display
   * @param {string} projectPath - Project path
   * @returns {Object} Tree structure for UI
   */
  getDependencyTreeForUI(projectPath) {
    const deps = this.loadDependencies(projectPath);
    const tree = {
      name: path.basename(projectPath),
      path: projectPath,
      type: deps.type,
      children: [],
      expanded: true,
    };

    // Add config files
    for (const [name, config] of Object.entries(deps.configFiles)) {
      tree.children.push({
        name,
        path: path.join(projectPath, name),
        type: 'config',
      });
    }

    // Add dependencies
    const depsGroup = {
      name: 'dependencies',
      type: 'folder',
      children: deps.dependencies.map(dep => ({
        name: dep.name,
        version: dep.version,
        type: 'package',
      })),
    };
    tree.children.push(depsGroup);

    // Add source files
    if (deps.dependencyTree && deps.dependencyTree.files) {
      const filesGroup = {
        name: 'source',
        type: 'folder',
        children: deps.dependencyTree.files.map(file => ({
          name: file.name,
          path: file.path,
          type: 'file',
          language: file.language,
        })),
      };
      tree.children.push(filesGroup);
    }

    return tree;
  }

  /**
   * Validate dependencies for feature execution
   * @param {string} projectPath - Project path
   * @param {string} feature - Feature type
   * @returns {Object} Validation result
   */
  validateDependencies(projectPath, feature) {
    const deps = this.loadDependencies(projectPath);
    const issues = [];
    const warnings = [];

    // Check for missing dependencies
    const missingDeps = deps.dependencies.filter(d => !d.installed);
    if (missingDeps.length > 0) {
      issues.push(`Missing dependencies: ${missingDeps.map(d => d.name).join(', ')}`);
    }

    // Feature-specific checks
    switch (feature) {
      case 'scan':
        // Scan needs parser
        if (deps.type === 'typescript' && !deps.dependencies.find(d => d.name === 'typescript')) {
          warnings.push('TypeScript not in dependencies, scan may have issues');
        }
        break;

      case 'ai-fix':
        // AI fix needs dependencies loaded
        if (!deps.dependencyTree || deps.dependencyTree.files.length === 0) {
          warnings.push('No source files found for AI analysis');
        }
        break;

      case 'test':
        // Test needs Playwright
        if (!deps.dependencies.find(d => d.name === '@playwright/test')) {
          issues.push('Playwright not installed. Run: npm install --save-dev @playwright/test');
        }
        break;
    }

    return {
      valid: issues.length === 0,
      issues,
      warnings,
    };
  }

  /**
   * Get dependency stats
   * @param {string} projectPath - Project path
   * @returns {Object} Statistics
   */
  getStats(projectPath) {
    const deps = this.loadDependencies(projectPath);

    return {
      type: deps.type,
      totalDependencies: deps.dependencies.length,
      installedDependencies: deps.dependencies.filter(d => d.installed).length,
      configFiles: Object.keys(deps.configFiles),
      sourceFiles: deps.dependencyTree?.files?.length || 0,
    };
  }
}

module.exports = DependencyLoader;
