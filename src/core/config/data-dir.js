/**
 * DATA_DIR 统一配置模块
 * 所有模块必须从此处获取 DATA_DIR，禁止本地计算或硬编码
 *
 * 计算规则：
 * - 打包模式：exe 同级 data 目录（portable，跟随应用）
 * - 开发模式：项目根目录（package.json 所在）下的 data 目录
 * - 非 Electron 环境：向上查找 package.json 或使用环境变量
 */

const path = require('path');
const fs = require('fs');

/**
 * 向上查找项目根目录（package.json 所在目录）
 */
function findProjectRoot(startDir) {
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  // fallback: 返回起始目录（不太可能到这里）
  return startDir;
}

let DATA_DIR;

try {
  const { app } = require('electron');

  if (app.isPackaged) {
    // 打包模式：exe 同级 data 目录
    DATA_DIR = path.join(path.dirname(app.getPath('exe')), 'data');
  } else {
    // 开发模式：项目根目录 + '/data'
    const projectRoot = findProjectRoot(__dirname);
    DATA_DIR = path.join(projectRoot, 'data');
  }
} catch (e) {
  // 非 Electron 环境（如测试脚本）
  // 优先使用环境变量，其次向上查找项目根目录
  DATA_DIR = process.env.DATA_DIR || path.join(findProjectRoot(__dirname), 'data');
}

console.log(`[DATA_DIR] 统一数据目录: ${DATA_DIR}`);

module.exports = { DATA_DIR, findProjectRoot };