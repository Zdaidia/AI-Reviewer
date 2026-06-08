/**
 * Parallel Scanner
 *
 * 并行扫描功能
 * - 使用 Worker 线程池并行处理文件
 * - 动态负载均衡
 * - 任务队列管理
 * - 进度跟踪和错误处理
 */

const { Worker } = require('worker_threads');
const os = require('os');
const path = require('path');
const { getLogger } = require('../utils/logger');
const { ScannerError, ErrorFactory } = require('../errors/scanner-errors');

class ParallelScanner {
  constructor(options = {}) {
    this.options = {
      maxWorkers: options.maxWorkers || Math.max(2, os.cpus().length - 1),
      taskQueueSize: options.taskQueueSize || 1000,
      workerTimeout: options.workerTimeout || 30000, // 30s
      autoRestartWorkers: options.autoRestartWorkers !== false,
      maxRestarts: options.maxRestarts || 3,
      ...options,
    };

    this.logger = getLogger('ParallelScanner');
    this.workers = new Map();
    this.taskQueue = [];
    this.results = [];
    this.pendingTasks = 0;
    this.completedTasks = 0;
    this.workerRestarts = new Map();
    this.isInitialized = false;
  }

  /**
   * 初始化 Worker 池
   */
  initializeWorkers() {
    if (this.isInitialized) {
      return;
    }

    this.logger.info('Initializing worker pool', {
      maxWorkers: this.options.maxWorkers,
    });

    for (let i = 0; i < this.options.maxWorkers; i++) {
      this.createWorker(i);
    }

    this.isInitialized = true;
  }

  /**
   * 创建 Worker
   * @param {number} workerId - Worker ID
   * @returns {Worker} Worker 实例
   */
  createWorker(workerId) {
    // Worker 线程不能直接从 asar 中加载文件
    // 打包后需要使用 .asar.unpacked 路径或解包后的路径
    let workerPath = path.join(__dirname, 'scan-worker.js');

    // 检测是否在 asar 内运行，如果是则尝试使用 unpacked 路径
    if (__dirname.includes('.asar')) {
      const unpackedPath = workerPath.replace('.asar', '.asar.unpacked');
      const fs = require('fs');
      if (fs.existsSync(unpackedPath)) {
        workerPath = unpackedPath;
      } else {
        // asar 内没有 unpacked 版本，记录警告，Worker 可能无法启动
        this.logger.warn('Worker 脚本在 asar 内且没有 unpacked 版本，Worker 可能无法启动', {
          originalPath: workerPath,
          unpackedPath,
        });
      }
    }

    const worker = new Worker(workerPath, {
      resourceLimits: {
        maxOldGenerationSizeMb: 512,
      },
    });

    // 设置 Worker ID
    worker.workerId = workerId;
    worker.isBusy = false;
    worker.taskCount = 0;

    // 消息处理
    worker.on('message', (result) => this.handleWorkerMessage(worker, result));
    worker.on('error', (error) => this.handleWorkerError(worker, error));
    worker.on('exit', (code) => this.handleWorkerExit(worker, code));

    this.workers.set(workerId, worker);
    this.logger.debug('Worker created', { workerId });

    return worker;
  }

  /**
   * 处理 Worker 消息
   * @param {Worker} worker - Worker 实例
   * @param {Object} result - 处理结果
   */
  handleWorkerMessage(worker, result) {
    if (result.type === 'complete') {
      this.results.push(result.data);
      worker.isBusy = false;
      this.pendingTasks--;
      this.completedTasks++;

      this.logger.debug('Task completed', {
        workerId: worker.workerId,
        filePath: result.data.filePath,
        taskCount: worker.taskCount,
      });

      // 处理下一个任务
      this.processNextTask();
    } else if (result.type === 'error') {
      this.logger.error('Worker task error', {
        workerId: worker.workerId,
        error: result.error,
      });

      worker.isBusy = false;
      this.pendingTasks--;
      this.completedTasks++;

      // 记录错误结果
      this.results.push({
        filePath: result.filePath,
        error: result.error,
      });

      this.processNextTask();
    } else if (result.type === 'progress') {
      // 进度更新
      this.logger.debug('Worker progress', {
        workerId: worker.workerId,
        progress: result.progress,
      });
    }
  }

  /**
   * 处理 Worker 错误
   * @param {Worker} worker - Worker 实例
   * @param {Error} error - 错误对象
   */
  handleWorkerError(worker, error) {
    this.logger.error('Worker error', {
      workerId: worker.workerId,
      error: error.message,
    });

    // 标记 Worker 为空闲
    worker.isBusy = false;
  }

  /**
   * 处理 Worker 退出
   * @param {Worker} worker - Worker 实例
   * @param {number} exitCode - 退出码
   */
  handleWorkerExit(worker, exitCode) {
    this.logger.warn('Worker exited', {
      workerId: worker.workerId,
      exitCode,
    });

    this.workers.delete(worker.workerId);

    // 自动重启 Worker
    if (this.options.autoRestartWorkers && exitCode !== 0) {
      const restartCount = this.workerRestarts.get(worker.workerId) || 0;

      if (restartCount < this.options.maxRestarts) {
        this.logger.info('Restarting worker', {
          workerId: worker.workerId,
          restartCount: restartCount + 1,
        });

        this.workerRestarts.set(worker.workerId, restartCount + 1);
        this.createWorker(worker.workerId);
      } else {
        this.logger.error('Worker exceeded max restarts', {
          workerId: worker.workerId,
          maxRestarts: this.options.maxRestarts,
        });
      }
    }
  }

  /**
   * 处理下一个任务
   */
  processNextTask() {
    if (this.taskQueue.length === 0) {
      return;
    }

    // 查找空闲 Worker
    const idleWorker = this.findIdleWorker();
    if (!idleWorker) {
      return; // 所有 Worker 都忙碌
    }

    // 取出下一个任务
    const task = this.taskQueue.shift();

    // 分配任务给 Worker
    this.assignTask(idleWorker, task);
  }

  /**
   * 查找空闲 Worker
   * @returns {Worker|null} 空闲 Worker
   */
  findIdleWorker() {
    for (const worker of this.workers.values()) {
      if (!worker.isBusy) {
        return worker;
      }
    }
    return null;
  }

  /**
   * 分配任务给 Worker
   * @param {Worker} worker - Worker 实例
   * @param {Object} task - 任务对象
   */
  assignTask(worker, task) {
    worker.isBusy = true;
    worker.taskCount++;

    this.pendingTasks++;

    this.logger.debug('Assigning task to worker', {
      workerId: worker.workerId,
      taskType: task.type,
      filePath: task.filePath,
      workerTaskCount: worker.taskCount,
    });

    // 发送任务给 Worker
    worker.postMessage(task);
  }

  /**
   * 并行扫描文件
   * @param {Array<string>} filePaths - 文件路径数组
   * @param {Function} scanFunction - 扫描函数
   * @param {Object} options - 选项
   * @returns {Promise<Array>} 扫描结果
   */
  async scanFiles(filePaths, scanFunction, options = {}) {
    const {
      batchSize = 50,
      onProgress = null,
      timeout = this.options.workerTimeout,
    } = options;

    this.logger.info('Starting parallel scan', {
      totalFiles: filePaths.length,
      maxWorkers: this.options.maxWorkers,
    });

    // 初始化 Workers
    this.initializeWorkers();

    // 重置状态
    this.results = [];
    this.pendingTasks = 0;
    this.completedTasks = 0;

    // 创建任务队列
    for (const filePath of filePaths) {
      this.taskQueue.push({
        type: 'scan',
        filePath: filePath,
        scanFunction: scanFunction.toString(), // 序列化函数
      });
    }

    const startTime = Date.now();

    // 启动初始任务
    for (let i = 0; i < Math.min(this.options.maxWorkers, this.taskQueue.length); i++) {
      this.processNextTask();
    }

    // 等待所有任务完成
    await this.waitForCompletion(onProgress);

    const elapsed = Date.now() - startTime;

    this.logger.info('Parallel scan completed', {
      totalFiles: filePaths.length,
      completedTasks: this.completedTasks,
      elapsed: `${elapsed}ms`,
      avgTimePerFile: `${(elapsed / filePaths.length).toFixed(2)}ms`,
    });

    return this.results;
  }

  /**
   * 等待所有任务完成
   * @param {Function} onProgress - 进度回调
   * @returns {Promise<void>}
   */
  async waitForCompletion(onProgress) {
    return new Promise((resolve) => {
      let checkInterval = null;
      let iterationCount = 0;
      const MAX_ITERATIONS = 10000; // 防止无限循环，最多运行约16分钟

      const checkAndReport = () => {
        iterationCount++;

        // 检查是否超过最大迭代次数
        if (iterationCount > MAX_ITERATIONS) {
          this.logger.error('waitForCompletion: 超过最大迭代次数，强制停止');
          if (checkInterval) {
            clearInterval(checkInterval);
            checkInterval = null;
          }
          resolve();
          return;
        }

        // 报告进度
        if (onProgress && this.completedTasks % 10 === 0) {
          onProgress({
            completed: this.completedTasks,
            pending: this.pendingTasks,
            total: this.completedTasks + this.pendingTasks,
            progress: `${((this.completedTasks / (this.completedTasks + this.pendingTasks)) * 100).toFixed(1)}%`,
          });
        }

        // 检查是否完成
        if (this.pendingTasks === 0 && this.taskQueue.length === 0) {
          if (checkInterval) {
            clearInterval(checkInterval);
            checkInterval = null;
          }
          resolve();
        }
      };

      checkInterval = setInterval(checkAndReport, 100);
    });
  }

  /**
   * 获取统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    const workerStats = [];

    for (const [workerId, worker] of this.workers.entries()) {
      workerStats.push({
        workerId,
        isBusy: worker.isBusy,
        taskCount: worker.taskCount,
      });
    }

    return {
      totalWorkers: this.workers.size,
      maxWorkers: this.options.maxWorkers,
      pendingTasks: this.pendingTasks,
      queuedTasks: this.taskQueue.length,
      completedTasks: this.completedTasks,
      workers: workerStats,
    };
  }

  /**
   * 终止所有 Workers
   */
  terminate() {
    this.logger.info('Terminating workers', {
      count: this.workers.size,
    });

    for (const worker of this.workers.values()) {
      worker.terminate();
    }

    this.workers.clear();
    this.taskQueue = [];
    this.isInitialized = false;
  }

  /**
   * 重启 Workers
   */
  restart() {
    this.logger.info('Restarting workers');
    this.terminate();
    this.initializeWorkers();
  }
}

module.exports = ParallelScanner;
