/**
 * 密钥加载模块
 *
 * 从多个来源加载敏感密钥（如 Google OAuth2 Client Secret），
 * 确保打包后自动带入，不硬编码在源码中。
 *
 * 加载优先级：
 * 1. extraResources/secrets.json（打包后，位于 process.resourcesPath）
 * 2. 项目根目录/secrets.json（开发模式）
 * 3. 环境变量（ GOOGLE_CLIENT_SECRET 等）
 * 4. DATA_DIR 配置文件（用户通过设置面板保存的）
 *
 * secrets.json 在 .gitignore 中排除，不会推送到 git
 * 打包时通过 electron-builder extraResources 自动复制到 resources 目录
 */

const path = require('path');
const fs = require('fs');

// 缓存已加载的密钥
let _secretsCache = null;

/**
 * 获取 secrets.json 文件路径
 * 打包后：process.resourcesPath/secrets.json
 * 开发模式：项目根目录/secrets.json
 */
function getSecretsFilePath() {
  try {
    const { app } = require('electron');
    if (app.isPackaged) {
      // 打包后：secrets.json 在 resources 目录（extraResources）
      return path.join(process.resourcesPath, 'secrets.json');
    }
    // 开发模式：项目根目录
    return path.join(app.getAppPath(), 'secrets.json');
  } catch (e) {
    // 非 Electron 环境（如测试脚本）
    // 向上查找项目根目录
    let dir = __dirname;
    for (let i = 0; i < 10; i++) {
      if (fs.existsSync(path.join(dir, 'secrets.json'))) {
        return path.join(dir, 'secrets.json');
      }
      if (fs.existsSync(path.join(dir, 'package.json'))) {
        return path.join(dir, 'secrets.json');
      }
      dir = path.dirname(dir);
    }
    return path.join(__dirname, '../../secrets.json');
  }
}

/**
 * 加载密钥文件
 * @returns {Object} 密钥对象
 */
function loadSecrets() {
  if (_secretsCache) return _secretsCache;

  const secretsPath = getSecretsFilePath();

  if (fs.existsSync(secretsPath)) {
    try {
      _secretsCache = JSON.parse(fs.readFileSync(secretsPath, 'utf8'));
      console.log(`[SecretsLoader] 已加载密钥文件: ${secretsPath}`);
      return _secretsCache;
    } catch (e) {
      console.warn(`[SecretsLoader] 加载密钥文件失败: ${e.message}`);
    }
  }

  // 密钥文件不存在（可能用户未创建，或打包时遗漏）
  console.warn('[SecretsLoader] secrets.json 未找到，将使用环境变量或配置文件回退');
  _secretsCache = {};
  return _secretsCache;
}

/**
 * 获取 Google OAuth2 Client Secret
 * 优先级：secrets.json → 环境变量 → 传入的配置值
 *
 * @param {string} configValue - 从用户配置文件传入的值
 * @returns {string} Client Secret
 */
function getGoogleClientSecret(configValue) {
  const secrets = loadSecrets();

  // 优先级 1: secrets.json（打包后自带）
  if (secrets.google_client_secret) {
    return secrets.google_client_secret;
  }

  // 优先级 2: 环境变量（开发模式 .env）
  if (process.env.GOOGLE_CLIENT_SECRET) {
    return process.env.GOOGLE_CLIENT_SECRET;
  }

  // 优先级 3: 用户配置文件中保存的值
  if (configValue) {
    return configValue;
  }

  // 无密钥可用，返回空字符串（前端会提示用户配置）
  return '';
}

/**
 * 获取 Figma Access Token
 * 优先级：secrets.json → 环境变量 → 传入的配置值
 *
 * @param {string} configValue - 从用户配置文件传入的值
 * @returns {string} Figma Token
 */
function getFigmaAccessToken(configValue) {
  const secrets = loadSecrets();

  if (secrets.figma_access_token) {
    return secrets.figma_access_token;
  }

  if (process.env.FIGMA_ACCESS_TOKEN) {
    return process.env.FIGMA_ACCESS_TOKEN;
  }

  if (configValue) {
    return configValue;
  }

  return '';
}

/**
 * 清除缓存（用于配置更新后重新加载）
 */
function clearCache() {
  _secretsCache = null;
}

module.exports = {
  loadSecrets,
  getGoogleClientSecret,
  getFigmaAccessToken,
  clearCache,
  getSecretsFilePath,
};
