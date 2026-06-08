/**
 * Scan Worker
 *
 * Worker 线程，用于并行执行文件扫描任务
 * 接收主线程发送的任务并返回结果
 */

const { parentPort } = require('worker_threads');
const path = require('path');

// 动态导入扫描器（避免在 Worker 中重复加载）
let CodeScanner = null;

/**
 * 初始化扫描器
 */
function initScanner() {
  if (!CodeScanner) {
    // 需要使用绝对路径
    // 在 asar 内运行时，require 可以正常工作（Electron 修补了 require）
    let scannerPath = path.join(__dirname, 'index.js');
    delete require.cache[require.resolve(scannerPath)];
    CodeScanner = require(scannerPath);
  }
  return CodeScanner;
}

/**
 * 扫描文件
 * @param {string} filePath - 文件路径
 * @returns {Promise<Object>} 扫描结果
 */
async function scanFile(filePath) {
  try {
    const Scanner = initScanner();
    const scanner = new Scanner();
    const result = await scanner.scanFile(filePath);
    return result;
  } catch (error) {
    return {
      filePath,
      error: error.message,
      stack: error.stack,
    };
  }
}

/**
 * 处理消息
 * @param {Object} message - 消息对象
 */
async function handleMessage(message) {
  const { type, filePath, scanFunction } = message;

  if (type === 'scan') {
    try {
      // 发送进度更新
      parentPort.postMessage({
        type: 'progress',
        workerId: require('worker_threads').threadId,
        progress: 'starting',
        filePath,
      });

      // 执行扫描
      const result = await scanFile(filePath);

      // 发送完成消息
      parentPort.postMessage({
        type: 'complete',
        workerId: require('worker_threads').threadId,
        data: result,
      });
    } catch (error) {
      // 发送错误消息
      parentPort.postMessage({
        type: 'error',
        workerId: require('worker_threads').threadId,
        filePath,
        error: error.message,
      });
    }
  } else {
    parentPort.postMessage({
      type: 'error',
      error: `Unknown message type: ${type}`,
    });
  }
}

// 监听主线程消息
parentPort.on('message', handleMessage);

// 发送就绪消息
parentPort.postMessage({
  type: 'ready',
  workerId: require('worker_threads').threadId,
});
