/**
 * Incremental Scanner
 *
 * 增量扫描功能
 * - 只扫描变更的文件
 * - 基于文件修改时间和哈希值检测变更
 * - 支持缓存扫描结果
 * - 持久化扫描状态
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getLogger } = require('../utils/logger');
const { ScannerError, ErrorFactory } = require('../errors/scanner-errors');

class IncrementalScanner {
  constructor(options = {}) {
    this.options = {
      cacheFilePath: options.cacheFilePath || './.scanner-cache.json',
      enableHashCheck: options.enableHashCheck !== false,
      enableMtimeCheck: options.enableMtimeCheck !== false,
      autoSaveCache: options.autoSaveCache !== false,
      saveInterval: options.saveInterval || 100,
      ...options,
    };

    this.logger = getLogger('IncrementalScanner');
    this.scanCache = new Map();
    this.pendingWrites = 0;
    this.lastSaveTime = 0;

    // Load existing cache
    this.loadCache();
  }

  /**
   * 计算文件哈希值
   * @param {string} filePath - 文件路径
   * @returns {string} 文件哈希值
   */
  calculateFileHash(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      return crypto
        .createHash('md5')
        .update(content)
        .digest('hex');
    } catch (error) {
      this.logger.warn('Failed to calculate file hash', {
        filePath,
        error: error.message,
      });
      return null;
    }
  }

  /**
   * 获取文件状态
   * @param {string} filePath - 文件路径
   * @returns {Object} 文件状态
   */
  getFileStatus(filePath) {
    try {
      const stats = fs.statSync(filePath);
      const status = {
        path: filePath,
        exists: true,
        mtime: stats.mtimeMs,
        size: stats.size,
      };

      // 计算哈希（如果启用）
      if (this.options.enableHashCheck) {
        status.hash = this.calculateFileHash(filePath);
      }

      return status;
    } catch (error) {
      return {
        path: filePath,
        exists: false,
        error: error.message,
      };
    }
  }

  /**
   * 检查文件是否变更
   * @param {string} filePath - 文件路径
   * @returns {boolean} 是否变更
   */
  hasFileChanged(filePath) {
    const currentStatus = this.getFileStatus(filePath);
    const cachedStatus = this.scanCache.get(filePath);

    // 文件不存在（新文件或已删除）
    if (!currentStatus.exists) {
      this.logger.debug('File does not exist', { filePath });
      return true;
    }

    // 没有缓存记录（新文件）
    if (!cachedStatus) {
      this.logger.debug('No cache entry for file', { filePath });
      return true;
    }

    // 检查修改时间
    if (this.options.enableMtimeCheck) {
      if (currentStatus.mtime !== cachedStatus.mtime) {
        this.logger.debug('File modified (mtime)', {
          filePath,
          old: cachedStatus.mtime,
          new: currentStatus.mtime,
        });
        return true;
      }
    }

    // 检查哈希值
    if (this.options.enableHashCheck && currentStatus.hash && cachedStatus.hash) {
      if (currentStatus.hash !== cachedStatus.hash) {
        this.logger.debug('File modified (hash)', {
          filePath,
          old: cachedStatus.hash,
          new: currentStatus.hash,
        });
        return true;
      }
    }

    return false;
  }

  /**
   * 获取需要扫描的文件列表
   * @param {Array<string>} filePaths - 所有文件路径
   * @returns {Array<string>} 需要扫描的文件路径
   */
  getFilesToScan(filePaths) {
    const filesToScan = [];
    const skippedFiles = [];

    for (const filePath of filePaths) {
      if (this.hasFileChanged(filePath)) {
        filesToScan.push(filePath);
      } else {
        skippedFiles.push(filePath);
      }
    }

    this.logger.info('Incremental scan analysis', {
      total: filePaths.length,
      toScan: filesToScan.length,
      skipped: skippedFiles.length,
      ratio: `${((filesToScan.length / filePaths.length) * 100).toFixed(1)}%`,
    });

    return filesToScan;
  }

  /**
   * 更新文件缓存
   * @param {string} filePath - 文件路径
   * @param {Object} scanResult - 扫描结果
   */
  updateFileCache(filePath, scanResult) {
    const status = this.getFileStatus(filePath);
    status.scanResult = scanResult;
    status.scannedAt = Date.now();

    this.scanCache.set(filePath, status);
    this.pendingWrites++;

    // 自动保存缓存
    if (this.options.autoSaveCache && this.pendingWrites >= this.options.saveInterval) {
      this.saveCache();
    }
  }

  /**
   * 批量更新文件缓存
   * @param {Array<Object>} results - 扫描结果数组
   */
  updateFileCacheBatch(results) {
    for (const result of results) {
      if (result.filePath && !result.error) {
        this.updateFileCache(result.filePath, result);
      }
    }
  }

  /**
   * 获取缓存的扫描结果
   * @param {string} filePath - 文件路径
   * @returns {Object|null} 缓存的扫描结果
   */
  getCachedResult(filePath) {
    const cached = this.scanCache.get(filePath);
    if (cached && cached.scanResult) {
      this.logger.debug('Using cached result', { filePath });
      return cached.scanResult;
    }
    return null;
  }

  /**
   * 获取所有缓存的扫描结果
   * @param {Array<string>} filePaths - 文件路径数组
   * @returns {Object} 缓存结果映射
   */
  getCachedResults(filePaths) {
    const cachedResults = {};
    let hitCount = 0;

    for (const filePath of filePaths) {
      const cached = this.getCachedResult(filePath);
      if (cached) {
        cachedResults[filePath] = cached;
        hitCount++;
      }
    }

    this.logger.info('Cache hits', {
      requested: filePaths.length,
      hits: hitCount,
      miss: filePaths.length - hitCount,
      hitRate: `${((hitCount / filePaths.length) * 100).toFixed(1)}%`,
    });

    return cachedResults;
  }

  /**
   * 清理失效的缓存条目
   * @param {Array<string>} existingFiles - 当前存在的文件路径
   */
  cleanupCache(existingFiles) {
    const existingSet = new Set(existingFiles);
    let cleanedCount = 0;

    for (const filePath of this.scanCache.keys()) {
      if (!existingSet.has(filePath)) {
        this.scanCache.delete(filePath);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.info('Cleaned up stale cache entries', {
        count: cleanedCount,
      });
    }
  }

  /**
   * 清空所有缓存
   */
  clearCache() {
    const size = this.scanCache.size;
    this.scanCache.clear();
    this.logger.info('Cache cleared', { previousSize: size });
  }

  /**
   * 加载缓存文件
   */
  loadCache() {
    try {
      if (!fs.existsSync(this.options.cacheFilePath)) {
        this.logger.debug('Cache file does not exist', {
          path: this.options.cacheFilePath,
        });
        return;
      }

      const content = fs.readFileSync(this.options.cacheFilePath, 'utf8');
      const data = JSON.parse(content);

      // 恢复缓存
      for (const [filePath, status] of Object.entries(data)) {
        this.scanCache.set(filePath, status);
      }

      this.logger.info('Cache loaded', {
        path: this.options.cacheFilePath,
        entries: this.scanCache.size,
      });
    } catch (error) {
      this.logger.warn('Failed to load cache', {
        path: this.options.cacheFilePath,
        error: error.message,
      });
      this.scanCache.clear();
    }
  }

  /**
   * 保存缓存文件
   */
  saveCache() {
    try {
      // 转换为普通对象
      const data = {};
      for (const [filePath, status] of this.scanCache.entries()) {
        data[filePath] = status;
      }

      // 确保目录存在
      const cacheDir = path.dirname(this.options.cacheFilePath);
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      }

      // 写入文件
      fs.writeFileSync(
        this.options.cacheFilePath,
        JSON.stringify(data, null, 2),
        'utf8'
      );

      const now = Date.now();
      const elapsed = now - this.lastSaveTime;

      this.logger.debug('Cache saved', {
        path: this.options.cacheFilePath,
        entries: this.scanCache.size,
        elapsedSinceLastSave: `${elapsed}ms`,
      });

      this.pendingWrites = 0;
      this.lastSaveTime = now;
    } catch (error) {
      this.logger.error('Failed to save cache', {
        path: this.options.cacheFilePath,
        error: error.message,
      });
    }
  }

  /**
   * 获取缓存统计信息
   * @returns {Object} 缓存统计
   */
  getCacheStats() {
    const stats = {
      totalEntries: this.scanCache.size,
      pendingWrites: this.pendingWrites,
      cacheFilePath: this.options.cacheFilePath,
      lastSaveTime: this.lastSaveTime,
      entries: [],
    };

    // 统计缓存年龄
    const now = Date.now();
    const ageGroups = {
      recent: 0, // < 1 hour
      medium: 0, // 1 hour - 1 day
      old: 0,    // > 1 day
    };

    for (const [filePath, status] of this.scanCache.entries()) {
      const age = now - (status.scannedAt || 0);
      const entry = {
        path: filePath,
        scannedAt: status.scannedAt,
        age: `${Math.round(age / 1000)}s`,
        hasResult: !!status.scanResult,
      };
      stats.entries.push(entry);

      if (age < 3600000) {
        ageGroups.recent++;
      } else if (age < 86400000) {
        ageGroups.medium++;
      } else {
        ageGroups.old++;
      }
    }

    stats.ageGroups = ageGroups;

    return stats;
  }

  /**
   * 执行增量扫描
   * @param {Array<string>} filePaths - 所有文件路径
   * @param {Function} scanFunction - 扫描函数
   * @param {Object} options - 选项
   * @returns {Promise<Object>} 扫描结果
   */
  async scan(filePaths, scanFunction, options = {}) {
    const {
      useCache = true,
      updateCache = true,
      cleanupCache = true,
      onProgress = null,
    } = options;

    this.logger.info('Starting incremental scan', {
      totalFiles: filePaths.length,
      useCache,
      updateCache,
    });

    const startTime = Date.now();
    const results = [];
    const cachedResults = {};

    // 清理失效缓存
    if (cleanupCache) {
      this.cleanupCache(filePaths);
    }

    // 获取需要扫描的文件
    const filesToScan = useCache ? this.getFilesToScan(filePaths) : filePaths;

    // 获取缓存结果
    if (useCache) {
      const cached = this.getCachedResults(filePaths);
      Object.assign(cachedResults, cached);
    }

    // 报告进度
    if (onProgress) {
      onProgress({
        phase: 'scanning',
        toScan: filesToScan.length,
        fromCache: Object.keys(cachedResults).length,
        total: filePaths.length,
      });
    }

    // 扫描变更的文件
    for (let i = 0; i < filesToScan.length; i++) {
      const filePath = filesToScan[i];

      try {
        const result = await scanFunction(filePath);
        results.push(result);

        // 更新缓存
        if (updateCache && !result.error) {
          this.updateFileCache(filePath, result);
        }

        // 报告进度
        if (onProgress && i % 10 === 0) {
          onProgress({
            phase: 'scanning',
            scanned: i + 1,
            toScan: filesToScan.length,
            current: filePath,
          });
        }
      } catch (error) {
        this.logger.error('Scan failed for file', {
          filePath,
          error: error.message,
        });
        results.push({
          filePath,
          error: error.message,
        });
      }
    }

    // 保存缓存
    if (updateCache && this.pendingWrites > 0) {
      this.saveCache();
    }

    // 合并缓存结果和新扫描结果
    const allResults = {
      ...cachedResults,
      ...results.reduce((acc, result) => {
        if (result.filePath) {
          acc[result.filePath] = result;
        }
        return acc;
      }, {}),
    };

    const elapsed = Date.now() - startTime;

    this.logger.info('Incremental scan completed', {
      totalFiles: filePaths.length,
      scanned: filesToScan.length,
      fromCache: Object.keys(cachedResults).length,
      elapsed: `${elapsed}ms`,
      speedup: `${((1 - filesToScan.length / filePaths.length) * 100).toFixed(1)}%`,
    });

    return {
      results: allResults,
      scanned: filesToScan.length,
      fromCache: Object.keys(cachedResults).length,
      total: filePaths.length,
      elapsed,
      cacheHitRate: (Object.keys(cachedResults).length / filePaths.length),
    };
  }

  /**
   * 导出缓存为 JSON
   * @returns {string} JSON 字符串
   */
  exportCache() {
    const data = {};
    for (const [filePath, status] of this.scanCache.entries()) {
      data[filePath] = status;
    }
    return JSON.stringify(data, null, 2);
  }

  /**
   * 导入缓存
   * @param {string} jsonData - JSON 数据
   */
  importCache(jsonData) {
    try {
      const data = JSON.parse(jsonData);
      let importCount = 0;

      for (const [filePath, status] of Object.entries(data)) {
        this.scanCache.set(filePath, status);
        importCount++;
      }

      this.logger.info('Cache imported', { entries: importCount });
      return importCount;
    } catch (error) {
      this.logger.error('Failed to import cache', { error: error.message });
      throw error;
    }
  }

  /**
   * 销毁扫描器
   */
  destroy() {
    // 保存未写入的缓存
    if (this.pendingWrites > 0) {
      this.saveCache();
    }

    this.scanCache.clear();
    this.logger.info('Incremental scanner destroyed');
  }
}

module.exports = IncrementalScanner;
