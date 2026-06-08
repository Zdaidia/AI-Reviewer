/**
 * Dependency Tree Builder
 *
 * Builds and manages dependency trees for visualization
 */

class DependencyTreeBuilder {
  constructor() {
    this.trees = new Map();
  }

  /**
   * Build dependency tree from loaded files
   * @param {string} projectPath - Project path
   * @param {Object} loadedFiles - Map of loaded file contexts
   * @param {string} projectType - Project type
   * @returns {Object} Tree structure
   */
  buildTree(projectPath, loadedFiles, projectType) {
    const tree = {
      id: this.generateId(projectPath),
      name: this.getProjectName(projectPath),
      path: projectPath,
      type: projectType,
      expanded: true,
      children: [],
      stats: {
        totalFiles: loadedFiles.size,
        totalDependencies: 0,
        maxDepth: 0,
      },
    };

    // Group files by directory
    const dirMap = new Map();
    for (const [filePath, context] of loadedFiles) {
      const relativePath = filePath.replace(projectPath, '').replace(/^[\/\\]/, '');
      const parts = relativePath.split(/[/\\]/);
      const dir = parts.slice(0, -1).join('/');

      if (!dirMap.has(dir)) {
        dirMap.set(dir, []);
      }
      dirMap.get(dir).push({ filePath, context });
    }

    // Add directories as children
    const sortedDirs = Array.from(dirMap.keys()).sort();
    for (const dir of sortedDirs) {
      const dirNode = this.buildDirectoryNode(dir, dirMap.get(dir), projectPath);
      tree.children.push(dirNode);
      tree.stats.totalDependencies += this.countDependencies(dirNode);
    }

    // Calculate max depth
    tree.stats.maxDepth = this.calculateMaxDepth(tree);

    this.trees.set(tree.id, tree);
    return tree;
  }

  /**
   * Build directory node
   * @param {string} dirPath - Directory path
   * @param {Array} files - Files in directory
   * @param {string} projectPath - Project root
   * @returns {Object} Directory node
   */
  buildDirectoryNode(dirPath, files, projectPath) {
    const parts = dirPath.split(/[/\\]/);
    const name = parts[parts.length - 1] || 'root';

    const node = {
      id: this.generateId(dirPath),
      name,
      path: dirPath ? `${projectPath}/${dirPath}` : projectPath,
      type: 'folder',
      expanded: false,
      children: [],
      stats: {
        fileCount: files.length,
        dependencyCount: 0,
      },
    };

    for (const { filePath, context } of files) {
      const fileName = filePath.split(/[/\\]/).pop();
      const fileNode = {
        id: this.generateId(filePath),
        name: fileName,
        path: filePath,
        type: 'file',
        language: this.getLanguageFromPath(filePath),
        imports: context.imports?.length || 0,
        dependencies: context.dependencies?.length || 0,
      };

      node.children.push(fileNode);
      node.stats.dependencyCount += fileNode.dependencies;
    }

    return node;
  }

  /**
   * Count dependencies in a node recursively
   * @param {Object} node - Tree node
   * @returns {number} Dependency count
   */
  countDependencies(node) {
    let count = 0;

    if (node.dependencies) {
      count += node.dependencies;
    }

    if (node.children) {
      for (const child of node.children) {
        count += this.countDependencies(child);
      }
    }

    return count;
  }

  /**
   * Calculate max depth of tree
   * @param {Object} node - Tree node
   * @param {number} currentDepth - Current depth
   * @returns {number} Max depth
   */
  calculateMaxDepth(node, currentDepth = 0) {
    if (!node.children || node.children.length === 0) {
      return currentDepth;
    }

    let maxChildDepth = currentDepth;
    for (const child of node.children) {
      const childDepth = this.calculateMaxDepth(child, currentDepth + 1);
      if (childDepth > maxChildDepth) {
        maxChildDepth = childDepth;
      }
    }

    return maxChildDepth;
  }

  /**
   * Flatten tree to list
   * @param {Object} tree - Tree structure
   * @returns {Array} Flattened list
   */
  flattenTree(tree) {
    const result = [];

    function traverse(node, depth = 0) {
      result.push({
        ...node,
        depth,
      });

      if (node.children) {
        for (const child of node.children) {
          traverse(child, depth + 1);
        }
      }
    }

    traverse(tree);
    return result;
  }

  /**
   * Find node by path
   * @param {Object} tree - Tree structure
   * @param {string} targetPath - Target path
   * @returns {Object|null} Found node
   */
  findNodeByPath(tree, targetPath) {
    if (tree.path === targetPath) {
      return tree;
    }

    if (tree.children) {
      for (const child of tree.children) {
        const found = this.findNodeByPath(child, targetPath);
        if (found) return found;
      }
    }

    return null;
  }

  /**
   * Expand/collapse node
   * @param {Object} tree - Tree structure
   * @param {string} nodeId - Node ID
   * @param {boolean} expanded - Expanded state
   * @returns {Object|null} Updated tree
   */
  toggleNode(tree, nodeId, expanded) {
    const node = this.findNodeById(tree, nodeId);
    if (node) {
      node.expanded = expanded;
      return node;
    }
    return null;
  }

  /**
   * Find node by ID
   * @param {Object} tree - Tree structure
   * @param {string} nodeId - Node ID
   * @returns {Object|null} Found node
   */
  findNodeById(tree, nodeId) {
    if (tree.id === nodeId) {
      return tree;
    }

    if (tree.children) {
      for (const child of tree.children) {
        const found = this.findNodeById(child, nodeId);
        if (found) return found;
      }
    }

    return null;
  }

  /**
   * Get language from file path
   * @param {string} filePath - File path
   * @returns {string} Language
   */
  getLanguageFromPath(filePath) {
    const ext = filePath.split('.').pop();
    const langMap = {
      'js': 'javascript',
      'jsx': 'javascript',
      'ts': 'typescript',
      'tsx': 'typescript',
      'vue': 'vue',
      'dart': 'dart',
    };
    return langMap[ext] || 'unknown';
  }

  /**
   * Get project name from path
   * @param {string} projectPath - Project path
   * @returns {string} Project name
   */
  getProjectName(projectPath) {
    return projectPath.split(/[/\\]/).pop() || 'project';
  }

  /**
   * Generate unique ID
   * @param {string} str - String to hash
   * @returns {string} Unique ID
   */
  generateId(str) {
    const crypto = require('crypto');
    return crypto.createHash('md5').update(str).digest('hex').substring(0, 8);
  }

  /**
   * Format tree for UI display
   * @param {Object} tree - Tree structure
   * @returns {Array} Formatted nodes
   */
  formatForUI(tree) {
    return this.flattenTree(tree).map((node, index) => {
      return {
        id: node.id,
        parentId: node.id !== tree.id ? this.findParentId(tree, node.id) : null,
        name: node.name,
        path: node.path,
        type: node.type,
        depth: node.depth,
        expanded: node.expanded,
        hasChildren: node.children && node.children.length > 0,
        language: node.language,
        stats: node.stats,
      };
    });
  }

  /**
   * Find parent ID
   * @param {Object} tree - Tree structure
   * @param {string} nodeId - Node ID
   * @returns {string|null} Parent ID
   */
  findParentId(tree, nodeId) {
    if (!tree.children) return null;

    for (const child of tree.children) {
      if (child.id === nodeId) {
        return tree.id;
      }
      const found = this.findParentId(child, nodeId);
      if (found) return found;
    }

    return null;
  }
}

module.exports = DependencyTreeBuilder;
