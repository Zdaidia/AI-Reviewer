/**
 * Git Diff 服务
 * 封装 git 命令调用，为 QA Reviewer 增量审查提供变更文件列表和 diff patch
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

class GitDiffService {
  /**
   * 检测项目是否是 git 仓库
   * @param {string} projectPath - 项目根目录路径
   * @returns {boolean} 是否是 git 仓库
   */
  isGitRepository(projectPath) {
    try {
      const result = execSync('git rev-parse --is-inside-work-tree', {
        cwd: projectPath,
        encoding: 'utf8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe']
      }).trim();
      return result === 'true';
    } catch (e) {
      return false;
    }
  }

  /**
   * 获取变更文件列表（根据 diffScope）
   * @param {string} projectPath - 项目根目录路径
   * @param {string} diffScope - diff 范围：'unstaged' | 'staged' | 'lastCommit' | 'branchCompare'
   * @param {string} baseBranch - 分支对比时的目标分支（仅 branchCompare 模式需要）
   * @returns {{ files: Array<{path, status, diffPatch}>, stats: {total, added, modified, deleted, renamed} }}
   */
  getChangedFiles(projectPath, diffScope = 'unstaged', baseBranch = 'main') {
    const nameStatusOutput = this._execGitDiffNameStatus(projectPath, diffScope, baseBranch);

    if (!nameStatusOutput) {
      return { files: [], stats: { total: 0, added: 0, modified: 0, deleted: 0, renamed: 0 } };
    }

    const files = [];
    const stats = { total: 0, added: 0, modified: 0, deleted: 0, renamed: 0 };

    for (const line of nameStatusOutput.split('\n')) {
      if (!line.trim()) continue;

      // git diff --name-status 输出格式: "M\tpath/to/file" 或 "R100\told_path\tnew_path"
      const parts = line.split('\t');
      const statusCode = parts[0]?.trim();
      const filePath = parts.length >= 3 ? parts[2] : parts[1]; // renamed 时取新路径

      if (!statusCode || !filePath) continue;

      // 过滤掉非代码文件
      const ext = path.extname(filePath).toLowerCase();
      const skipExtensions = ['.md', '.txt', '.log', '.lock', '.map', '.css.map', '.min.js', '.min.css'];
      if (skipExtensions.some(se => filePath.endsWith(se))) continue;

      // 过滤掉配置/生成文件
      if (filePath.includes('package-lock') || filePath.includes('yarn.lock') ||
          filePath.includes('.gitignore') || filePath.includes('.env') ||
          filePath.endsWith('.ico') || filePath.endsWith('.png') || filePath.endsWith('.jpg')) continue;

      const status = this._parseGitStatus(statusCode);
      const fullPath = path.join(projectPath, filePath).replace(/\\/g, '/');

      // 获取该文件的 diff patch
      let diffPatch = '';
      if (status !== 'deleted') {
        try {
          diffPatch = this.getFileDiff(projectPath, filePath, diffScope, baseBranch);
        } catch (e) {
          console.warn(`[GitDiffService] 获取 diff 失败: ${filePath}`, e.message);
        }
      }

      files.push({ path: fullPath, relativePath: filePath, status, diffPatch });
      stats[status]++;
      stats.total++;
    }

    console.log(`[GitDiffService] getChangedFiles(${diffScope}): ${stats.total} 个变更文件 (A:${stats.added} M:${stats.modified} D:${stats.deleted} R:${stats.renamed})`);
    return { files, stats };
  }

  /**
   * 获取指定文件的完整 diff
   * @param {string} projectPath - 项目根目录路径
   * @param {string} filePath - 文件相对路径
   * @param {string} diffScope - diff 范围
   * @param {string} baseBranch - 分支对比时的目标分支
   * @returns {string} unified diff 格式的 diff patch
   */
  getFileDiff(projectPath, filePath, diffScope = 'unstaged', baseBranch = 'main') {
    const diffArgs = this._getDiffArgs(diffScope, baseBranch);
    const cmd = `git diff ${diffArgs} -- "${filePath}"`;

    try {
      return execSync(cmd, {
        cwd: projectPath,
        encoding: 'utf8',
        timeout: 10000,
        maxBuffer: 1024 * 1024, // 1MB buffer，大文件 diff 可能很长
        stdio: ['pipe', 'pipe', 'pipe']
      });
    } catch (e) {
      console.warn(`[GitDiffService] getFileDiff 失败: ${filePath}`, e.message);
      return '';
    }
  }

  /**
   * 获取分支列表（供 UI 选择）
   * @param {string} projectPath - 项目根目录路径
   * @returns {Array<{name, isCurrent}>} 分支列表
   */
  getBranches(projectPath) {
    try {
      // 获取本地分支
      const output = execSync('git branch --list', {
        cwd: projectPath,
        encoding: 'utf8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe']
      }).trim();

      const branches = [];
      for (const line of output.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const isCurrent = trimmed.startsWith('*');
        const name = trimmed.replace(/^\* /, '').trim();
        branches.push({ name, isCurrent });
      }

      // 也获取远程分支（供 branchCompare 选择）
      try {
        const remoteOutput = execSync('git branch -r --list', {
          cwd: projectPath,
          encoding: 'utf8',
          timeout: 5000,
          stdio: ['pipe', 'pipe', 'pipe']
        }).trim();

        for (const line of remoteOutput.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.includes('HEAD')) continue;
          // remote branch 格式: "origin/main"
          const name = trimmed.replace(/^origin\//, '');
          if (!branches.find(b => b.name === name)) {
            branches.push({ name, isCurrent: false, isRemote: true });
          }
        }
      } catch (e) { /* 获取远程分支失败不影响 */ }

      return branches;
    } catch (e) {
      console.warn('[GitDiffService] getBranches 失败:', e.message);
      return [];
    }
  }

  /**
   * 获取最近 N 次 commit（供 UI 选择 lastCommit 范围）
   * @param {string} projectPath - 项目根目录路径
   * @param {number} count - 获取数量
   * @returns {Array<{hash, message, date}>} commit 列表
   */
  getRecentCommits(projectPath, count = 10) {
    try {
      const output = execSync(
        `git log --oneline --format="%H|%s|%ci" -n ${count}`,
        {
          cwd: projectPath,
          encoding: 'utf8',
          timeout: 5000,
          stdio: ['pipe', 'pipe', 'pipe']
        }
      ).trim();

      const commits = [];
      for (const line of output.split('\n')) {
        if (!line.trim()) continue;
        const [hash, message, date] = line.split('|');
        commits.push({ hash, message, date });
      }

      return commits;
    } catch (e) {
      console.warn('[GitDiffService] getRecentCommits 失败:', e.message);
      return [];
    }
  }

  /**
   * 获取变更文件的关联依赖文件
   * 通过 import 分析找到变更文件引用的源文件和被引用的文件
   * @param {string} projectPath - 项目根目录路径
   * @param {Array<string>} changedFilePaths - 变更文件的完整路径列表
   * @param {Object} codeGraph - 代码图数据（可选）
   * @returns {Array<{path, role}>} 关联依赖文件列表
   */
  getRelatedDependencies(projectPath, changedFilePaths, codeGraph = null) {
    const dependencies = new Map();
    const { inferFileType } = require('./file-type-utils');

    // 检测项目类型
    let projectType = 'unknown';
    if (codeGraph && codeGraph.projectType) {
      projectType = codeGraph.projectType;
    } else {
      // 简单检测
      if (fs.existsSync(path.join(projectPath, 'pubspec.yaml'))) projectType = 'flutter';
      else if (fs.existsSync(path.join(projectPath, 'vue.config.js')) || fs.existsSync(path.join(projectPath, 'vite.config.js'))) projectType = 'vue';
      else if (fs.existsSync(path.join(projectPath, 'angular.json'))) projectType = 'angular';
      else projectType = 'react'; // 默认 react
    }

    for (const filePath of changedFilePaths) {
      if (!fs.existsSync(filePath)) continue;

      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const imports = this._parseImports(filePath, content, projectType);

        for (const importPath of imports) {
          // 解析 import 路径到实际文件路径
          const resolvedPath = this._resolveImportPath(importPath, filePath, projectPath, projectType);
          if (resolvedPath && fs.existsSync(resolvedPath) && !changedFilePaths.includes(resolvedPath)) {
            const role = inferFileType(resolvedPath, projectType);
            if (['model', 'service', 'api', 'binding', 'provider', 'controller', 'component', 'view', 'page'].includes(role)) {
              dependencies.set(resolvedPath.replace(/\\/g, '/'), role);
            }
          }
        }
      } catch (e) { /* 跳过不可读文件 */ }
    }

    // 从代码图中查找被变更文件引用的文件（反向依赖）
    if (codeGraph && codeGraph.nodes) {
      const changedRelPaths = changedFilePaths.map(p => p.replace(projectPath.replace(/\\/g, '/'), '').replace(/^\//, ''));

      for (const node of codeGraph.nodes) {
        if (!node.file || !node.referencedBy) continue;
        const nodeRelPath = node.file.replace(/\\/g, '/');

        // 如果有变更文件被此文件引用，则此文件也是依赖
        for (const changedRelPath of changedRelPaths) {
          if (node.referencedBy.includes(changedRelPath) || node.referencedBy.includes(changedRelPath.replace(/\//g, '\\'))) {
            const fullNodePath = path.join(projectPath, nodeRelPath).replace(/\\/g, '/');
            if (!changedFilePaths.includes(fullNodePath)) {
              const role = inferFileType(fullNodePath, projectType);
              dependencies.set(fullNodePath, role);
            }
          }
        }
      }
    }

    return Array.from(dependencies.entries()).map(([path, role]) => ({ path, role }));
  }

  // ==================== 内部方法 ====================

  /**
   * 执行 git diff --name-status 命令
   */
  _execGitDiffNameStatus(projectPath, diffScope, baseBranch) {
    const diffArgs = this._getDiffArgs(diffScope, baseBranch);
    const cmd = `git diff ${diffArgs} --name-status --diff-filter=ACMR`;

    try {
      return execSync(cmd, {
        cwd: projectPath,
        encoding: 'utf8',
        timeout: 10000,
        maxBuffer: 512 * 1024,
        stdio: ['pipe', 'pipe', 'pipe']
      });
    } catch (e) {
      console.warn(`[GitDiffService] git diff --name-status 失败 (${diffScope}):`, e.message);
      return null;
    }
  }

  /**
   * 根据 diffScope 获取 git diff 命令参数
   */
  _getDiffArgs(diffScope, baseBranch) {
    switch (diffScope) {
      case 'unstaged':
        return ''; // git diff（默认就是工作区 vs 暂存区）
      case 'staged':
        return '--cached'; // git diff --cached（暂存区 vs HEAD）
      case 'lastCommit':
        return 'HEAD~1..HEAD';
      case 'branchCompare':
        return `${baseBranch}..HEAD`;
      default:
        return '';
    }
  }

  /**
   * 解析 git 状态码
   */
  _parseGitStatus(statusCode) {
    // git diff --name-status 状态码:
    // A = Added, M = Modified, D = Deleted, R = Renamed, C = Copied, T = Type change
    const firstChar = statusCode.charAt(0);
    switch (firstChar) {
      case 'A': return 'added';
      case 'M': return 'modified';
      case 'D': return 'deleted';
      case 'R': return 'renamed';
      case 'C': return 'added'; // copied 也视为 added
      case 'T': return 'modified'; // type change 视为 modified
      default: return 'modified';
    }
  }

  /**
   * 解析 import 语句（通用，支持 Vue/React/Angular/Flutter）
   */
  _parseImports(filePath, content, projectType) {
    const imports = [];
    const ext = path.extname(filePath).toLowerCase();

    // JS/TS/Vue 的 import 语句
    if (['.js', '.ts', '.jsx', '.tsx', '.vue'].includes(ext)) {
      // ES6 import: import Xxx from 'path'
      const es6Pattern = /import\s+(?:[^'"]*?\s+from\s+|)\s*['"]([^'"]+)['"]/g;
      let m;
      while ((m = es6Pattern.exec(content)) !== null) imports.push(m[1]);

      // require: require('path')
      const requirePattern = /require\(['"]([^'"]+)['"]\)/g;
      while ((m = requirePattern.exec(content)) !== null) imports.push(m[1]);
    }

    // Dart 的 import 语句
    if (ext === '.dart') {
      const dartPattern = /import\s+['"]([^'"]+)['"]/g;
      let m;
      while ((m = dartPattern.exec(content)) !== null) imports.push(m[1]);
    }

    return imports;
  }

  /**
   * 将 import 路径解析为实际文件路径
   */
  _resolveImportPath(importPath, fromFilePath, projectPath, projectType) {
    // 跳过 npm 包和 dart: 导入
    if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
      // Vue/React 的 @ 别名
      if (importPath.startsWith('@/') || importPath.startsWith('@/')) {
        const srcDir = projectType === 'flutter' ? path.join(projectPath, 'lib') : path.join(projectPath, 'src');
        const relativePath = importPath.replace(/^@\//, '');
        const candidates = [
          path.join(srcDir, relativePath),
          path.join(srcDir, relativePath + '.js'),
          path.join(srcDir, relativePath + '.ts'),
          path.join(srcDir, relativePath + '.vue'),
          path.join(srcDir, relativePath + '.jsx'),
          path.join(srcDir, relativePath + '.tsx'),
          path.join(srcDir, relativePath, 'index.js'),
          path.join(srcDir, relativePath, 'index.ts'),
        ];
        for (const candidate of candidates) {
          if (fs.existsSync(candidate)) return candidate.replace(/\\/g, '/');
        }
      }
      return null; // npm 包或外部导入，跳过
    }

    // 相对路径解析
    const fromDir = path.dirname(fromFilePath);
    const resolved = path.resolve(fromDir, importPath);
    const candidates = [
      resolved,
      resolved + path.extname(fromFilePath), // 同扩展名
      resolved + '.js',
      resolved + '.ts',
      resolved + '.vue',
      resolved + '.jsx',
      resolved + '.tsx',
      resolved + '.dart',
      path.join(resolved, 'index.js'),
      path.join(resolved, 'index.ts'),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate.replace(/\\/g, '/');
    }

    return null;
  }
}

module.exports = GitDiffService;
