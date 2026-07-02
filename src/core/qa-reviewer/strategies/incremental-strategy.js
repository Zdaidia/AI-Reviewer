/**
 * 增量审查分段策略
 * 基于 git diff 结果构建 SegmentPlan
 * 遵循现有 Segment 类接口
 */

const { Segment, SegmentStatus, SegmentPriority } = require('./segment-strategy');
const fs = require('fs');
const path = require('path');
const { inferFileType } = require('../utils/file-type-utils');

class IncrementalStrategy {
  constructor(options = {}) {
    this.maxFilesPerSegment = options.maxFilesPerSegment || 10;
    this.maxContentSizePerSegment = options.maxContentSizePerSegment || 50 * 1024; // 50KB
    this.codeGraphAdapter = options.codeGraphAdapter || null;
  }

  /**
   * 创建增量审查分段计划
   * @param {string} projectPath - 项目路径
   * @param {Object} diffResult - git diff 结果 { files: [{path, status, diffPatch}], stats }
   * @param {Array} dependencyFiles - 依赖文件列表 [{path, role}]
   * @param {Object} options - 额外选项 { diffScope, includeDependencies }
   * @returns {{ segments: Segment[], metadata: Object }} SegmentPlan
   */
  createPlan(projectPath, diffResult, dependencyFiles = [], options = {}) {
    const changedFiles = diffResult.files || [];
    const diffPatches = {};

    // 收集 diff patches
    for (const file of changedFiles) {
      if (file.diffPatch) {
        diffPatches[file.path] = file.diffPatch;
      }
    }

    // 分离变更文件和依赖文件
    const changedPaths = changedFiles.map(f => f.path);
    const dependencyPaths = dependencyFiles.map(f => f.path);

    // 过滤掉已删除的文件（无法读取内容）
    const activeChangedPaths = changedPaths.filter(p => {
      const file = changedFiles.find(f => f.path === p);
      return file && file.status !== 'deleted' && fs.existsSync(p);
    });

    // 过滤掉不存在的依赖文件
    const activeDependencyPaths = dependencyPaths.filter(p => fs.existsSync(p));

    console.log(`[IncrementalStrategy] 变更文件: ${activeChangedPaths.length}, 依赖文件: ${activeDependencyPaths.length}`);

    // 检测项目类型
    const projectType = this._detectProjectType(projectPath);

    // 计算总文件大小
    const totalSize = this._calculateTotalSize([...activeChangedPaths, ...activeDependencyPaths]);
    const totalFiles = activeChangedPaths.length + activeDependencyPaths.length;

    // 判断是否适合整体审查模式
    const isSmallEnough = totalFiles <= 15 && totalSize < this.maxContentSizePerSegment;

    if (isSmallEnough) {
      // 小规模 → 单个 integrated Segment
      return this._createIntegratedPlan(
        projectPath, projectType,
        activeChangedPaths, activeDependencyPaths,
        changedFiles, diffPatches, options
      );
    } else {
      // 大规模 → 按 module 分组
      return this._createGroupedPlan(
        projectPath, projectType,
        activeChangedPaths, activeDependencyPaths,
        changedFiles, diffPatches, options
      );
    }
  }

  /**
   * 创建整体审查计划（单个 Segment）
   */
  _createIntegratedPlan(projectPath, projectType, changedPaths, dependencyPaths, changedFiles, diffPatches, options) {
    // 构建文件角色信息
    const allFiles = [...changedPaths, ...dependencyPaths];
    const filesWithRoles = allFiles.map(filePath => {
      const role = inferFileType(filePath, projectType);
      const isChanged = changedPaths.includes(filePath);
      return { path: filePath, role, isChanged };
    });

    // 收集 i18n 文件
    const i18nFiles = filesWithRoles.filter(f => f.role === 'i18n').map(f => f.path);

    const segment = new Segment({
      name: '增量审查 - 全部变更',
      description: `审查 ${changedPaths.length} 个变更文件和 ${dependencyPaths.length} 个关联依赖文件`,
      files: allFiles,
      priority: SegmentPriority.HIGH,
      metadata: {
        integrated: true,
        isIncremental: true,
        diffScope: options.diffScope || 'unstaged',
        changedFiles: changedPaths,
        dependencyFiles: dependencyPaths,
        diffPatches: diffPatches,
        changedFileStatuses: changedFiles.map(f => ({ path: f.path, status: f.status, relativePath: f.relativePath })),
        i18nFiles: i18nFiles,
        fileRoles: filesWithRoles,
      }
    });

    return {
      segments: [segment],
      metadata: {
        strategy: 'incremental',
        diffScope: options.diffScope,
        changedFileCount: changedPaths.length,
        dependencyFileCount: dependencyPaths.length,
      }
    };
  }

  /**
   * 创建分组审查计划（多个 Segment）
   */
  _createGroupedPlan(projectPath, projectType, changedPaths, dependencyPaths, changedFiles, diffPatches, options) {
    // 按 module 分组变更文件
    const modules = this._groupFilesByModule(changedPaths, projectPath, projectType);

    // 将依赖文件分配到对应的 module
    for (const depPath of dependencyPaths) {
      const depRole = inferFileType(depPath, projectType);
      // 找到与依赖文件最相关的 module（通过路径匹配）
      let bestModule = null;
      let bestMatch = 0;
      for (const mod of modules) {
        for (const modulePath of mod.paths) {
          // 路径层级越近，关联度越高
          const commonLen = this._commonPathLength(depPath, modulePath);
          if (commonLen > bestMatch) {
            bestMatch = commonLen;
            bestModule = mod;
          }
        }
      }
      if (bestModule) {
        bestModule.files.push(depPath);
        bestModule.hasDependencies = true;
      } else {
        // 无法关联的依赖文件放到第一个 module
        if (modules.length > 0) modules[0].files.push(depPath);
      }
    }

    // 为每个 module 创建 Segment
    const segments = [];
    for (const mod of modules) {
      const moduleChangedPaths = mod.paths; // 该 module 下的变更文件
      const moduleDiffPatches = {};
      for (const changedPath of moduleChangedPaths) {
        if (diffPatches[changedPath]) {
          moduleDiffPatches[changedPath] = diffPatches[changedPath];
        }
      }

      const i18nFiles = mod.files.filter(f => inferFileType(f, projectType) === 'i18n');

      const segment = new Segment({
        name: `增量审查 - ${mod.name}`,
        description: `审查 ${moduleChangedPaths.length} 个变更文件（${mod.name}模块）`,
        files: mod.files,
        priority: mod.isCore ? SegmentPriority.HIGH : SegmentPriority.MEDIUM,
        metadata: {
          isIncremental: true,
          diffScope: options.diffScope || 'unstaged',
          changedFiles: moduleChangedPaths,
          dependencyFiles: mod.files.filter(f => !moduleChangedPaths.includes(f)),
          diffPatches: moduleDiffPatches,
          changedFileStatuses: changedFiles.filter(f => moduleChangedPaths.includes(f.path))
            .map(f => ({ path: f.path, status: f.status, relativePath: f.relativePath })),
          i18nFiles: i18nFiles,
          fileRoles: mod.files.map(filePath => ({
            path: filePath,
            role: inferFileType(filePath, projectType),
            isChanged: moduleChangedPaths.includes(filePath)
          })),
        }
      });

      segments.push(segment);
    }

    return {
      segments,
      metadata: {
        strategy: 'incremental',
        diffScope: options.diffScope,
        changedFileCount: changedPaths.length,
        dependencyFileCount: dependencyPaths.length,
      }
    };
  }

  // ==================== 内部辅助方法 ====================

  /**
   * 检测项目类型
   */
  _detectProjectType(projectPath) {
    if (fs.existsSync(path.join(projectPath, 'pubspec.yaml'))) return 'flutter';
    if (fs.existsSync(path.join(projectPath, 'vue.config.js')) || fs.existsSync(path.join(projectPath, 'vite.config.js'))) return 'vue';
    if (fs.existsSync(path.join(projectPath, 'angular.json'))) return 'angular';
    if (fs.existsSync(path.join(projectPath, 'package.json'))) return 'react';
    return 'unknown';
  }

  /**
   * 计算所有文件的总大小
   */
  _calculateTotalSize(filePaths) {
    let totalSize = 0;
    for (const filePath of filePaths) {
      try {
        if (fs.existsSync(filePath)) {
          const stat = fs.statSync(filePath);
          totalSize += stat.size;
        }
      } catch (e) { /* 跳过 */ }
    }
    return totalSize;
  }

  /**
   * 按功能模块分组文件
   */
  _groupFilesByModule(filePaths, projectPath, projectType) {
    const modules = [];
    const moduleMap = new Map(); // module名 → module对象

    for (const filePath of filePaths) {
      const role = inferFileType(filePath, projectType);
      const module = this._extractModuleName(filePath, projectPath, projectType);

      if (!moduleMap.has(module)) {
        const mod = {
          name: module,
          paths: [],
          files: [],
          isCore: ['view', 'controller', 'page', 'component'].includes(role),
          hasDependencies: false,
        };
        moduleMap.set(module, mod);
        modules.push(mod);
      }

      moduleMap.get(module).paths.push(filePath);
      moduleMap.get(module).files.push(filePath);
    }

    return modules;
  }

  /**
   * 从文件路径提取模块名
   */
  _extractModuleName(filePath, projectPath, projectType) {
    const normalized = filePath.replace(/\\/g, '/').replace(projectPath.replace(/\\/g, '/'), '').replace(/^\//, '');

    // 提取源码目录下的第一级子目录作为模块名
    let srcPrefix = '';
    if (projectType === 'flutter') srcPrefix = 'lib/';
    else srcPrefix = 'src/';

    const afterSrc = normalized.replace(srcPrefix, '');
    const firstDir = afterSrc.split('/')[0];

    if (firstDir && firstDir !== afterSrc) {
      // 有子目录结构
      return firstDir;
    }

    // 没有子目录，用文件角色作为模块名
    const role = inferFileType(filePath, projectType);
    return role || 'other';
  }

  /**
   * 计算两个路径的公共路径长度
   */
  _commonPathLength(path1, path2) {
    const n1 = path1.replace(/\\/g, '/');
    const n2 = path2.replace(/\\/g, '/');
    const parts1 = n1.split('/');
    const parts2 = n2.split('/');
    let count = 0;
    for (let i = 0; i < Math.min(parts1.length, parts2.length); i++) {
      if (parts1[i] === parts2[i]) count++;
      else break;
    }
    return count;
  }
}

module.exports = IncrementalStrategy;
