/**
 * Google OAuth2 认证管理器
 *
 * 负责桌面应用的 Google OAuth2 登录流程：
 * 1. 打开系统浏览器让用户登录
 * 2. 通过 dqi:// 自定义协议捕获回调
 * 3. 用 authorization code 换取 tokens
 * 4. 自动刷新过期 token
 * 5. 安全存储 tokens 到本地
 */

const { OAuth2Client } = require('google-auth-library');
const { shell } = require('electron');
const fs = require('fs');
const path = require('path');
const http = require('http');

class GoogleOAuth2Manager {
  constructor(config = {}) {
    this.clientId = config.clientId || '';
    this.clientSecret = config.clientSecret || '';
    this.redirectUri = config.redirectUri || 'dqi://auth/callback';

    // 回退方案：本地 loopback 服务器（子进程）
    this.loopbackPort = null;
    this._loopbackWorker = null;

    // OAuth2 scopes
    this.scopes = [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.readonly',
      'openid',
      'email',
    ];

    // Token 存储
    this.tokens = null;
    this.tokenPath = null;

    // OAuth2 客户端
    this.oAuth2Client = null;

    // 认证回调 Promise（用于等待 code）
    this._authCodePromise = null;
    this._authCodeResolve = null;

    // 认证状态
    this.isAuthenticated = false;
    this.userEmail = '';
  }

  /**
   * 设置 Token 存储路径
   */
  setTokenPath(tokenPath) {
    this.tokenPath = tokenPath;
    // 加载已有 token
    this.loadTokens();
  }

  /**
   * 初始化 OAuth2 客户端
   */
  _initClient() {
    if (!this.clientId || !this.clientSecret) {
      throw new Error('Google OAuth2 clientId 和 clientSecret 未配置。请在设置中填写。');
    }

    this.oAuth2Client = new OAuth2Client(
      this.clientId,
      this.clientSecret,
      this.redirectUri
    );

    // 如果有已有 token，设置到客户端
    if (this.tokens) {
      this.oAuth2Client.setCredentials(this.tokens);
      this.isAuthenticated = true;
      this._extractUserEmail();
    }
  }

  /**
   * 启动 OAuth2 认证流程
   * @param {BrowserWindow} mainWindow - Electron 主窗口（可选）
   * @returns {Promise<Object>} 认证结果
   */
  async startAuth(mainWindow = null) {
    this._initClient();

    // 1. 构建认证 URL
    const authUrl = this.oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: this.scopes,
      prompt: 'consent',
    });

    // 2. 创建等待 code 的 Promise（带超时）
    let authTimeoutId;
    this._authCodePromise = new Promise((resolve, reject) => {
      this._authCodeResolve = resolve;
      this._authCodeReject = reject;

      // 2分钟超时（浏览器登录失败如 403 时不会回调）
      authTimeoutId = setTimeout(() => {
        console.warn('[GoogleOAuth2] 认证超时，浏览器可能未完成授权');
        this._cleanupLoopback();
        if (this._authCodeReject) {
          this._authCodeReject(new Error('OAuth2 认证超时（2分钟）。浏览器可能未完成授权，请检查是否有权限错误后重试。'));
          this._authCodeResolve = null;
          this._authCodeReject = null;
        }
      }, 2 * 60 * 1000);
    }).finally(() => {
      clearTimeout(authTimeoutId);
    });

    // 3. 在独立子进程中启动 loopback 服务器（避免在主进程创建 HTTP server 导致 network service 崩溃）
    try {
      const { fork } = require('child_process');
      const loopbackModulePath = path.join(__dirname, 'loopback-worker.js');

      // 启动子进程等待端口
      this._loopbackWorker = fork(loopbackModulePath, [], { silent: false });
      this.loopbackPort = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('loopback 子进程启动超时'));
        }, 5000);

        this._loopbackWorker.on('message', (msg) => {
          if (msg.type === 'ready') {
            clearTimeout(timeout);
            resolve(msg.port);
          } else if (msg.type === 'error') {
            clearTimeout(timeout);
            reject(new Error(msg.error));
          }
        });

        this._loopbackWorker.on('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });

      // 监听子进程传回的 auth code
      this._loopbackWorker.on('message', (msg) => {
        if (msg.type === 'code' && this._authCodeResolve) {
          this._authCodeResolve(msg.code);
          this._authCodeResolve = null;
          this._authCodeReject = null;
        } else if (msg.type === 'auth_error' && this._authCodeReject) {
          this._authCodeReject(new Error(`Google 认证错误: ${msg.error}`));
          this._authCodeResolve = null;
          this._authCodeReject = null;
        }
      });

      // 使用 loopback redirect
      const loopbackUri = `http://127.0.0.1:${this.loopbackPort}`;
      this.oAuth2Client.redirectUri = loopbackUri;

      const loopbackAuthUrl = this.oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: this.scopes,
        prompt: 'consent',
      });

      console.log(`[GoogleOAuth2] 使用 loopback 子进程方案，端口: ${this.loopbackPort}`);
      await shell.openExternal(loopbackAuthUrl);
    } catch (e) {
      // loopback 失败，回退到自定义协议
      console.warn(`[GoogleOAuth2] loopback 启动失败: ${e.message}，使用自定义协议`);
      this.oAuth2Client.redirectUri = this.redirectUri;
      this._cleanupLoopback();
      await shell.openExternal(authUrl);
    }

    // 4. 等待 code
    try {
      const code = await this._authCodePromise;

      // 5. 用 code 换取 tokens
      const { tokens } = await this.oAuth2Client.getToken(code);
      this.tokens = tokens;
      this.oAuth2Client.setCredentials(tokens);

      // 6. 保存 tokens
      this.saveTokens();

      // 7. 提取用户信息
      this.isAuthenticated = true;
      await this._extractUserEmail();

      console.log('[GoogleOAuth2] 认证成功');
      return {
        success: true,
        email: this.userEmail,
        tokens: {
          hasAccessToken: !!tokens.access_token,
          hasRefreshToken: !!tokens.refresh_token,
          expiryDate: tokens.expiry_date,
        },
      };
    } catch (error) {
      console.error(`[GoogleOAuth2] 认证失败: ${error.message}`);
      this.isAuthenticated = false;
      return {
        success: false,
        error: error.message,
      };
    } finally {
      this._cleanupLoopback();
    }
  }

  /**
   * 处理 OAuth2 回调（自定义协议方式）
   * 由 main.js 的 second-instance / open-url 事件触发
   */
  handleAuthCallback(url) {
    if (!this._authCodeResolve) {
      console.warn('[GoogleOAuth2] 收到回调但没有等待中的认证请求');
      return;
    }

    try {
      const parsedUrl = new URL(url);
      const code = parsedUrl.searchParams.get('code');
      const error = parsedUrl.searchParams.get('error');

      if (error) {
        this._authCodeReject(new Error(`Google 认证错误: ${error}`));
      } else if (code) {
        this._authCodeResolve(code);
      } else {
        this._authCodeReject(new Error('回调 URL 中没有 code 参数'));
      }
    } catch (e) {
      this._authCodeReject(new Error(`解析回调 URL 失败: ${e.message}`));
    }

    this._authCodeResolve = null;
    this._authCodeReject = null;
  }

  /**
   * 启动本地 loopback HTTP 服务器
   * 监听 redirect 回调，提取 code
   * @returns {Promise<number>} 监听端口
   */
  _startLoopbackServer() {
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        try {
          const url = new URL(req.url, `http://127.0.0.1:${this.loopbackPort}`);
          const code = url.searchParams.get('code');
          const error = url.searchParams.get('error');

          if (code) {
            // 返回成功页面给浏览器
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end('<html><body><h2>认证成功！</h2><p>可以关闭此页面回到 Dev Quality Inspector。</p></body></html>');

            if (this._authCodeResolve) {
              this._authCodeResolve(code);
              this._authCodeResolve = null;
              this._authCodeReject = null;
            }
          } else if (error) {
            res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`<html><body><h2>认证失败</h2><p>错误: ${error}</p></body></html>`);

            if (this._authCodeReject) {
              this._authCodeReject(new Error(`Google 认证错误: ${error}`));
              this._authCodeResolve = null;
              this._authCodeReject = null;
            }
          } else {
            res.writeHead(404);
            res.end('Not found');
          }
        } catch (e) {
          res.writeHead(500);
          res.end('Internal error');
        }
      });

      // 在随机端口监听
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        this.loopbackServer = server;
        this.loopbackPort = port;
        resolve(port);
      });

      server.on('error', (e) => {
        reject(new Error(`loopback 服务器启动失败: ${e.message}`));
      });
    });
  }

  /**
   * 清理 loopback 服务器
   */
  _cleanupLoopback() {
    if (this._loopbackWorker) {
      this._loopbackWorker.kill();
      this._loopbackWorker = null;
    }
    this.loopbackServer = null;
    this.loopbackPort = null;
  }

  /**
   * 获取已认证的 OAuth2 客户端（确保 token 有效）
   * @returns {Promise<OAuth2Client>}
   */
  async getAuthenticatedClient() {
    if (!this.oAuth2Client) {
      this._initClient();
    }

    if (!this.tokens) {
      throw new Error('尚未认证，请先登录 Google 账号。');
    }

    // 检查 token 是否过期，需要刷新
    if (this.tokens.expiry_date && Date.now() >= this.tokens.expiry_date) {
      console.log('[GoogleOAuth2] Token 已过期，正在刷新...');
      try {
        const { credentials } = await this.oAuth2Client.refreshAccessToken();
        this.tokens = credentials;
        this.oAuth2Client.setCredentials(credentials);
        this.saveTokens();
        console.log('[GoogleOAuth2] Token 刷新成功');
      } catch (e) {
        console.error(`[GoogleOAuth2] Token 刷新失败: ${e.message}`);
        this.isAuthenticated = false;
        throw new Error(`Token 刷新失败: ${e.message}，请重新登录。`);
      }
    }

    return this.oAuth2Client;
  }

  /**
   * 获取认证状态
   */
  getAuthStatus() {
    return {
      isAuthenticated: this.isAuthenticated,
      email: this.userEmail,
      hasRefreshToken: !!this.tokens?.refresh_token,
      tokenExpiry: this.tokens?.expiry_date || null,
      clientId: this.clientId ? '已配置' : '未配置',
      clientSecret: this.clientSecret ? '已配置' : '未配置',
    };
  }

  /**
   * 撤销认证
   */
  async revokeAuth() {
    if (this.tokens?.access_token) {
      try {
        await this.oAuth2Client.revokeCredentials();
      } catch (e) {
        console.warn(`[GoogleOAuth2] 撤销 token 失败: ${e.message}`);
      }
    }

    this.tokens = null;
    this.isAuthenticated = false;
    this.userEmail = '';

    // 删除本地 token 文件
    if (this.tokenPath && fs.existsSync(this.tokenPath)) {
      fs.unlinkSync(this.tokenPath);
    }

    console.log('[GoogleOAuth2] 认证已撤销');
    return { success: true };
  }

  /**
   * 更新配置（clientId / clientSecret）
   * 保留已认证状态，只在凭证真正变化时才重新初始化客户端
   */
  updateConfig(config) {
    const clientIdChanged = config.clientId && config.clientId !== this.clientId;
    const clientSecretChanged = config.clientSecret && config.clientSecret !== this.clientSecret;
    const redirectUriChanged = config.redirectUri && config.redirectUri !== this.redirectUri;

    if (config.clientId) this.clientId = config.clientId;
    if (config.clientSecret) this.clientSecret = config.clientSecret;
    if (config.redirectUri) this.redirectUri = config.redirectUri;

    // 只有凭证真正变化时才重新初始化客户端
    if (clientIdChanged || clientSecretChanged || redirectUriChanged) {
      this.oAuth2Client = null;
      this._initClient();
    }
  }

  /**
   * 从 token 中提取用户邮箱
   */
  async _extractUserEmail() {
    try {
      const client = await this.getAuthenticatedClient();
      const { google } = require('googleapis');
      const oauth2 = google.oauth2({ version: 'v2', auth: client });
      const userInfo = await oauth2.userinfo.get();
      this.userEmail = userInfo.data.email || '';
      console.log(`[GoogleOAuth2] 用户邮箱: ${this.userEmail}`);
    } catch (e) {
      console.warn(`[GoogleOAuth2] 获取用户信息失败: ${e.message}`);
      this.userEmail = '(无法获取)';
    }
  }

  /**
   * 保存 tokens 到文件
   */
  saveTokens() {
    if (!this.tokenPath) return;

    const dir = path.dirname(this.tokenPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(this.tokenPath, JSON.stringify(this.tokens, null, 2), 'utf8');
    console.log(`[GoogleOAuth2] Tokens 已保存到 ${this.tokenPath}`);
  }

  /**
   * 从文件加载 tokens
   */
  loadTokens() {
    if (!this.tokenPath || !fs.existsSync(this.tokenPath)) {
      this.tokens = null;
      return;
    }

    try {
      this.tokens = JSON.parse(fs.readFileSync(this.tokenPath, 'utf8'));
      console.log('[GoogleOAuth2] Tokens 已从文件加载');
      // 有 refresh_token 就视为已认证
      if (this.tokens?.refresh_token) {
        this.isAuthenticated = true;
      }
    } catch (e) {
      console.warn(`[GoogleOAuth2] 加载 tokens 失败: ${e.message}`);
      this.tokens = null;
    }
  }
}

module.exports = GoogleOAuth2Manager;