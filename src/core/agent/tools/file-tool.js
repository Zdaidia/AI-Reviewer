/**
 * File Tool
 *
 * Provides file system operations for the Agent.
 * Read, write, search, and manipulate files.
 */

const BaseTool = require('./base-tool');
const fs = require('fs');
const path = require('path');
const glob = require('glob');

class FileTool extends BaseTool {
  constructor() {
    super(
      'file',
      'File system operations: read, write, search, and manipulate files',
      [
        {
          name: 'action',
          type: 'string',
          description: 'Action to perform: "read", "write", "search", "list", "exists", "delete", "create_dir"',
          required: true
        },
        {
          name: 'filePath',
          type: 'string',
          description: 'Path to the file or directory',
          required: false
        },
        {
          name: 'content',
          type: 'string',
          description: 'Content to write (for write action)',
          required: false
        },
        {
          name: 'pattern',
          type: 'string',
          description: 'Search pattern (for search action)',
          required: false
        },
        {
          name: 'options',
          type: 'object',
          description: 'Additional options for the action',
          required: false
        }
      ],
      {
        requiresApproval: true,  // File operations can be dangerous
        dangerous: true
      }
    );
  }

  /**
   * Execute file operation
   */
  async execute(params, context) {
    const { action, filePath, content, pattern, options = {} } = params;

    // Validate
    const validation = this.validate(params);
    if (!validation.valid) {
      return this.error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    try {
      switch (action) {
        case 'read':
          return await this.readFile(filePath, options, context);
        case 'write':
          return await this.writeFile(filePath, content, options, context);
        case 'search':
          return await this.searchFiles(pattern, options, context);
        case 'list':
          return await this.listDirectory(filePath, options, context);
        case 'exists':
          return await this.fileExists(filePath, context);
        case 'delete':
          return await this.deleteFile(filePath, context);
        case 'create_dir':
          return await this.createDirectory(filePath, options, context);
        default:
          return this.error(`Unknown action: ${action}`);
      }
    } catch (error) {
      return this.error(`File operation failed: ${error.message}`);
    }
  }

  /**
   * Read file content
   */
  async readFile(filePath, options, context) {
    if (!filePath) {
      return this.error('filePath is required for read action');
    }

    if (!fs.existsSync(filePath)) {
      return this.error(`File not found: ${filePath}`);
    }

    const stats = fs.statSync(filePath);
    if (stats.isDirectory()) {
      return this.error(`Path is a directory, not a file: ${filePath}`);
    }

    // Check file size limit
    const maxSize = options.maxSize || 1024 * 1024; // 1MB default
    if (stats.size > maxSize) {
      return this.error(`File too large: ${stats.size} bytes (max: ${maxSize})`);
    }

    const content = fs.readFileSync(filePath, 'utf8');

    if (context) {
      context.lastReadFile = { path: filePath, size: stats.size };
    }

    return this.success({
      action: 'read',
      filePath,
      size: stats.size,
      content,
      encoding: 'utf8'
    });
  }

  /**
   * Write file content
   */
  async writeFile(filePath, content, options, context) {
    if (!filePath) {
      return this.error('filePath is required for write action');
    }

    if (content === undefined) {
      return this.error('content is required for write action');
    }

    // Create directory if it doesn't exist
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Backup existing file if requested
    if (options.backup && fs.existsSync(filePath)) {
      const backupPath = `${filePath}.backup-${Date.now()}`;
      fs.copyFileSync(filePath, backupPath);
      if (context) {
        context.lastBackup = backupPath;
      }
    }

    fs.writeFileSync(filePath, content, 'utf8');

    if (context) {
      context.lastWriteFile = { path: filePath, size: content.length };
    }

    return this.success({
      action: 'write',
      filePath,
      size: content.length,
      message: 'File written successfully'
    });
  }

  /**
   * Search for files by pattern
   */
  async searchFiles(pattern, options, context) {
    if (!pattern) {
      return this.error('pattern is required for search action');
    }

    const searchPath = options.path || process.cwd();
    const globOptions = {
      cwd: searchPath,
      ignore: options.ignore || ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**'],
      ...options
    };

    return new Promise((resolve, reject) => {
      glob(pattern, globOptions, (err, files) => {
        if (err) {
          reject(this.error(`Search failed: ${err.message}`));
          return;
        }

        const results = files.map(f => ({
          path: path.join(searchPath, f),
          name: path.basename(f)
        }));

        if (context) {
          context.lastSearchResults = results;
        }

        resolve(this.success({
          action: 'search',
          pattern,
          searchPath,
          count: results.length,
          files: results
        }));
      });
    });
  }

  /**
   * List directory contents
   */
  async listDirectory(dirPath, options, context) {
    if (!dirPath) {
      return this.error('filePath is required for list action');
    }

    if (!fs.existsSync(dirPath)) {
      return this.error(`Directory not found: ${dirPath}`);
    }

    const stats = fs.statSync(dirPath);
    if (!stats.isDirectory()) {
      return this.error(`Path is not a directory: ${dirPath}`);
    }

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const maxDepth = options.maxDepth || 0;
    const recursive = options.recursive || false;

    const results = this._listDirRecursive(dirPath, entries, 0, maxDepth, recursive, options);

    return this.success({
      action: 'list',
      path: dirPath,
      count: results.length,
      entries: results
    });
  }

  /**
   * Recursive directory listing helper
   */
  _listDirRecursive(basePath, entries, depth, maxDepth, recursive, options) {
    const excludeDirs = options.excludeDirs || ['node_modules', '.git', 'dist', 'build', 'coverage'];
    const results = [];

    for (const entry of entries) {
      const fullPath = path.join(basePath, entry.name);

      if (entry.isDirectory()) {
        if (excludeDirs.includes(entry.name)) {
          continue;
        }

        const result = {
          name: entry.name,
          path: fullPath,
          type: 'directory'
        };

        if (recursive && depth < maxDepth) {
          try {
            const subEntries = fs.readdirSync(fullPath, { withFileTypes: true });
            result.children = this._listDirRecursive(fullPath, subEntries, depth + 1, maxDepth, recursive, options);
          } catch (err) {
            // Skip directories we can't read
          }
        }

        results.push(result);
      } else if (entry.isFile()) {
        const stats = fs.statSync(fullPath);
        results.push({
          name: entry.name,
          path: fullPath,
          type: 'file',
          size: stats.size
        });
      }
    }

    return results;
  }

  /**
   * Check if file exists
   */
  async fileExists(filePath, context) {
    if (!filePath) {
      return this.error('filePath is required for exists action');
    }

    const exists = fs.existsSync(filePath);
    let type = null;

    if (exists) {
      const stats = fs.statSync(filePath);
      type = stats.isDirectory() ? 'directory' : 'file';
    }

    return this.success({
      action: 'exists',
      filePath,
      exists,
      type
    });
  }

  /**
   * Delete file
   */
  async deleteFile(filePath, context) {
    if (!filePath) {
      return this.error('filePath is required for delete action');
    }

    if (!fs.existsSync(filePath)) {
      return this.error(`File not found: ${filePath}`);
    }

    const stats = fs.statSync(filePath);

    if (stats.isDirectory()) {
      fs.rmSync(filePath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(filePath);
    }

    return this.success({
      action: 'delete',
      filePath,
      type: stats.isDirectory() ? 'directory' : 'file',
      message: 'Deleted successfully'
    });
  }

  /**
   * Create directory
   */
  async createDirectory(dirPath, options, context) {
    if (!dirPath) {
      return this.error('filePath is required for create_dir action');
    }

    fs.mkdirSync(dirPath, { recursive: true });

    return this.success({
      action: 'create_dir',
      path: dirPath,
      message: 'Directory created successfully'
    });
  }

  /**
   * Get file stats
   */
  getStats(filePath) {
    try {
      const stats = fs.statSync(filePath);
      return {
        exists: true,
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory(),
        size: stats.size,
        modified: stats.mtime,
        created: stats.birthtime
      };
    } catch (err) {
      return { exists: false };
    }
  }
}

module.exports = FileTool;
