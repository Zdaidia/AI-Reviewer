/**
 * 需求分析整理模块 - 主类
 *
 * 流程编排器，协调各子模块：
 * - GoogleOAuth2Manager: OAuth2 认证
 * - GoogleSheetsManager: Sheets 读写
 * - GoogleDriveManager: Drive 文件获取
 * - FigmaReqExtractor: Figma 需求提取
 * - RequirementProcessor: AI 分析引擎
 * - MarkdownGenerator: 需求文件生成
 * - ReqAnalyzerConfig: 配置和缓存管理
 *
 * 每次操作执行完即结束，下次从缓存恢复继续
 * 按需求名称分文件夹存储，不同需求数据完全隔离
 */

const ReqAnalyzerConfig = require('./config');
const GoogleOAuth2Manager = require('./google/auth-manager');
const GoogleSheetsManager = require('./google/sheets-manager');
const GoogleDriveManager = require('./google/drive-manager');
const FigmaReqExtractor = require('./figma/req-extractor');
const RequirementProcessor = require('./ai/requirement-processor');
const MarkdownGenerator = require('./output/markdown-generator');

class ReqAnalyzer {
  constructor(options = {}) {
    this.llm = options.llm || null;
    this.figmaIntegration = options.figmaIntegration || null;
    this.projectPath = null;
    this.config = null;

    // 子模块（延迟初始化）
    this.googleAuth = null;
    this.sheetsManager = null;
    this.driveManager = null;
    this.figmaExtractor = null;
    this.requirementProcessor = null;
    this.markdownGenerator = null;

    // 中间状态（用于进度推送）
    this.currentProgress = null;
  }

  /**
   * 确保模块已初始化（IPC handler 调用时自动触发）
   * @param {string} projectPath - 项目路径（可选，如果已有则跳过）
   *   如果未设置项目路径，使用默认目录以支持 Google 登录等基础操作
   */
  async ensureInitialized(projectPath) {
    // 已初始化且有真实项目路径时跳过（不覆盖真实路径为 default-project）
    if (this.config && this.projectPath && this.projectPath !== 'default-project') return;
    if (!projectPath) {
      projectPath = 'default-project';
    }
    await this.initialize(projectPath);
  }

  /**
   * 初始化模块
   * @param {string} projectPath - 项目路径
   * @returns {Promise<boolean>}
   */
  async initialize(projectPath) {
    this.projectPath = projectPath;

    // 初始化配置
    this.config = new ReqAnalyzerConfig(projectPath);
    const appConfig = this.config.loadConfig();

    // 初始化 Google OAuth2
    this.googleAuth = new GoogleOAuth2Manager({
      clientId: appConfig.google.clientId,
      clientSecret: appConfig.google.clientSecret,
      redirectUri: appConfig.google.redirectUri,
    });
    this.googleAuth.setTokenPath(this.config.getTokensPath());

    // 初始化 Sheets 和 Drive 管理器
    this.sheetsManager = new GoogleSheetsManager(this.googleAuth);
    this.driveManager = new GoogleDriveManager(this.googleAuth);

    // 初始化 Figma 提取器
    this.figmaExtractor = new FigmaReqExtractor();
    if (this.figmaIntegration) {
      this.figmaExtractor.setFigmaIntegration(this.figmaIntegration);
    }
    // 从配置设置 Figma Token
    if (appConfig.figma && appConfig.figma.accessToken) {
      this.figmaExtractor.setAccessToken(appConfig.figma.accessToken);
    }

    // 初始化 AI 处理器
    this.requirementProcessor = new RequirementProcessor(this.llm);

    // 初始化 Markdown 生成器
    this.markdownGenerator = new MarkdownGenerator();

    console.log('[ReqAnalyzer] 模块初始化完成');
    return true;
  }

  // ============================================
  // Google OAuth2 操作
  // ============================================

  /**
   * 启动 Google OAuth2 认证
   */
  async startGoogleAuth(mainWindow = null) {
    return await this.googleAuth.startAuth(mainWindow);
  }

  /**
   * 获取 Google 认证状态
   */
  getGoogleAuthStatus() {
    return this.googleAuth.getAuthStatus();
  }

  /**
   * 处理 OAuth2 回调（自定义协议方式）
   */
  handleAuthCallback(url) {
    this.googleAuth.handleAuthCallback(url);
  }

  /**
   * 撤销 Google 认证
   */
  async revokeGoogleAuth() {
    return await this.googleAuth.revokeAuth();
  }

  // ============================================
  // 数据读取操作
  // ============================================

  /**
   * 读取 Google Sheets 需求数据
   * @param {string} sheetsUrl - Sheets URL
   * @param {Object} columnMapping - 列名映射
   * @returns {Promise<Object>} 读取结果
   */
  async readRequirementSheets(sheetsUrl, columnMapping = {}) {
    const result = await this.sheetsManager.readSheet(sheetsUrl, { columnMapping });

    if (result.success) {
      // 缓存数据
      this.config.saveRequirementData(
        this.config.currentRequirementName,
        'sheetsData',
        result
      );
    }

    return result;
  }

  /**
   * 从 Sheets 数据推断需求名称
   * 从"模块"列提取唯一值，拼接为需求名称建议
   * @param {Array} sheetsData - Sheets 读取的数据数组
   * @returns {Array} 推断的需求名称建议列表
   */
  inferRequirementName(sheetsData) {
    if (!sheetsData || !Array.isArray(sheetsData) || sheetsData.length === 0) {
      return [];
    }

    const moduleNames = new Set();
    for (const row of sheetsData) {
      const mod = row.module || row.模块 || row.功能模块 || row.功能模组 || '';
      if (mod.trim()) moduleNames.add(mod.trim());
    }

    if (moduleNames.size > 0) {
      return Array.from(moduleNames).map(name => ({
        name,
        source: 'module_column',
      }));
    }

    // 没有模块列，从第一条需求的描述提取关键词
    const firstReq = sheetsData[0];
    const desc = firstReq.requirement || firstReq.description || firstReq.需求 || firstReq.需求描述 || '';
    if (desc.trim()) {
      // 提取描述前20字作为名称建议
      const suggestion = desc.trim().substring(0, 20).replace(/[^\w一-鿿]/g, '');
      return [{ name: suggestion, source: 'description' }];
    }

    return [];
  }

  /**
   * 读取已确认的共通问题
   */
  async readConfirmedIssues(sheetsUrl, columnMapping = {}) {
    const result = await this.sheetsManager.readConfirmedIssues(sheetsUrl, { columnMapping });

    if (result.success) {
      this.config.saveRequirementData(
        this.config.currentRequirementName,
        'confirmedIssues',
        result
      );
    }

    return result;
  }

  /**
   * 从 Google Drive 下载并解析文件
   */
  async readDriveFile(fileId) {
    const result = await this.driveManager.downloadAndParse(fileId);
    return result;
  }

  /**
   * 搜索 Drive 文件
   */
  async searchDriveFiles(query, options = {}) {
    return await this.driveManager.searchFiles(query, options);
  }

  /**
   * 列出 Drive 根目录文件夹
   */
  async listDriveRootFolders() {
    return await this.driveManager.listRootFolders();
  }

  /**
   * 列出指定文件夹内的文件
   */
  async listDriveFolderFiles(folderId, options = {}) {
    return await this.driveManager.listFilesInFolder(folderId, options);
  }

  /**
   * 浏览共享 Drive 根目录内容
   */
  async browseSharedDriveRoot(driveId) {
    return await this.driveManager.browseSharedDriveRoot(driveId);
  }

  /**
   * 读取本地文件
   * @param {string} filePath - 本地文件路径
   * @returns {Promise<Object>} 解析结果
   */
  async readLocalFile(filePath) {
    const fs = require('fs');
    const path = require('path');

    if (!fs.existsSync(filePath)) {
      return { success: false, error: `文件不存在: ${filePath}` };
    }

    const ext = path.extname(filePath).toLowerCase();
    const fileName = path.basename(filePath);

    try {
      let content = '';

      if (ext === '.pdf') {
        // pdf-parse v2.x 依赖浏览器 API（DOMMatrix 等），Node.js 环境需要 polyfill
        if (typeof globalThis.DOMMatrix === 'undefined') {
          try {
            const { DOMMatrix } = require('dommatrix');
            globalThis.DOMMatrix = DOMMatrix;
          } catch (e) {
            globalThis.DOMMatrix = class DOMMatrix {
              constructor(init) { this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0; }
              is2D() { return true; }
              isIdentity() { return this.a === 1 && this.d === 1 && this.e === 0 && this.f === 0; }
            };
          }
        }
        if (typeof globalThis.ImageData === 'undefined') {
          globalThis.ImageData = class ImageData {
            constructor(data, width, height) { this.data = data; this.width = width; this.height = height; }
          };
        }
        if (typeof globalThis.Path2D === 'undefined') {
          globalThis.Path2D = class Path2D {
            constructor() { this.ops = []; }
            addPath() {}
            moveTo() {}
            lineTo() {}
            closePath() {}
          };
        }
        const { PDFParse } = require('pdf-parse');
        const dataBuffer = fs.readFileSync(filePath);
        const parser = new PDFParse({ data: dataBuffer });
        await parser.load();
        const result = await parser.getText();

        // 按页拆分，提取每页内容和标题
        const pages = (result.pages || []).map(page => ({
          pageNum: page.num,
          title: extractPageTitle(page.text),
          content: page.text,
          charCount: page.text.length,
        }));

        const localFileData = {
          success: true,
          fileName,
          filePath,
          fileType: ext,
          totalPages: pages.length || 1,
          pages,
          content: result.text,
        };

        this.config.saveRequirementData(
          this.config.currentRequirementName,
          'localFileData',
          localFileData
        );

        return localFileData;
      } else if (ext === '.docx') {
        const mammoth = require('mammoth');
        const result = await mammoth.extractRawText({ path: filePath });
        content = result.value;
      } else if (ext === '.xlsx' || ext === '.xls') {
        const XLSX = require('xlsx');
        const workbook = XLSX.readFile(filePath);
        const sheetsData = {};
        workbook.SheetNames.forEach(name => {
          sheetsData[name] = XLSX.utils.sheet_to_json(workbook.Sheets[name], { defval: '' });
        });
        content = JSON.stringify(sheetsData, null, 2);
      } else if (ext === '.txt' || ext === '.md' || ext === '.csv') {
        content = fs.readFileSync(filePath, 'utf8');
      } else {
        return { success: false, error: `不支持的文件格式: ${ext}` };
      }

      // 缓存数据（独立存储，不与 sheetsData 混存）
      const localFileData = { success: true, fileName, filePath, fileType: ext, content };
      this.config.saveRequirementData(
        this.config.currentRequirementName,
        'localFileData',
        localFileData
      );

      return localFileData;
    } catch (e) {
      return { success: false, error: `文件解析失败: ${e.message}` };
    }
  }

  // ============================================
  // Figma 操作
  // ============================================

  /**
   * 列出 Figma 节点内的子 Layer
   */
  async listFigmaNodeChildren(figmaUrl) {
    // 设置 Token
    const figmaIntegrationToken = this.figmaIntegration?.accessToken;
    const configToken = this.config?.config?.figma?.accessToken;

    if (figmaIntegrationToken) {
      this.figmaExtractor.setAccessToken(figmaIntegrationToken);
    } else if (configToken) {
      this.figmaExtractor.setAccessToken(configToken);
    }

    try {
      const result = await this.figmaExtractor.listNodeChildren(figmaUrl);
      return result;
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * 从 Figma 提取需求信息（基于 node-id，支持选择 Layer）
   */
  async extractFigmaRequirements(figmaUrl, nodeId = null, layerIds = null) {
    // 设置 Token
    if (this.figmaIntegration && this.figmaIntegration.accessToken) {
      this.figmaExtractor.setAccessToken(this.figmaIntegration.accessToken);
    } else if (this.config.config && this.config.config.figma.accessToken) {
      this.figmaExtractor.setAccessToken(this.config.config.figma.accessToken);
    }

    const result = await this.figmaExtractor.extractRequirements(figmaUrl, nodeId, layerIds);

    if (result.success) {
      this.config.saveRequirementData(
        this.config.currentRequirementName,
        'figmaData',
        result
      );
    }

    return result;
  }

  /**
   * 设置 Figma Token
   */
  setFigmaToken(token) {
    this.figmaExtractor.setAccessToken(token);
    if (this.config.config) {
      this.config.config.figma.accessToken = token;
      this.config.saveConfig();
    }
  }

  // ============================================
  // AI 分析操作
  // ============================================

  /**
   * AI 分析需求并生成问题清单
   * @param {Object} allData - 所有来源数据
   * @param {Function} onProgress - 进度回调
   * @returns {Promise<Object>} 分析结果
   */
  async analyzeRequirements(allData, onProgress = null) {
    const result = await this.requirementProcessor.analyzeAndFindIssues(allData, onProgress);

    if (result.questionList && result.questionList.length > 0) {
      this.config.saveRequirementData(
        this.config.currentRequirementName,
        'questionList',
        result.questionList
      );
      this.config.saveRequirementData(
        this.config.currentRequirementName,
        'analyzedData',
        result.analyzedData
      );
    }

    return result;
  }

  /**
   * 流式分析需求（逐步推送 LLM 输出到前端）
   * @param {Object} allData - 所有来源数据
   * @param {Electron.WebContents} webContents - 用于推送流式文本块
   * @param {Function} onProgress - 进度回调
   * @returns {Promise<Object>} 最终分析结果
   */
  async analyzeRequirementsStream(allData, webContents, onProgress = null) {
    const onChunk = (text) => {
      if (webContents && !webContents.isDestroyed()) {
        webContents.send('req-analyzer:stream', { type: 'chunk', text });
      }
    };

    const result = await this.requirementProcessor.analyzeWithStream(allData, onChunk, onProgress);

    if (result.questionList && result.questionList.length > 0) {
      this.config.saveRequirementData(
        this.config.currentRequirementName,
        'questionList',
        result.questionList
      );
      this.config.saveRequirementData(
        this.config.currentRequirementName,
        'analyzedData',
        result.analyzedData
      );
    }

    // 发送完成信号
    if (webContents && !webContents.isDestroyed()) {
      webContents.send('req-analyzer:stream', { type: 'complete', result });
    }

    return result;
  }

  /**
   * 将问题清单写入 Google Sheets
   */
  async writeQuestionList(sheetsUrl, questionList, moduleName = '', language = 'zh-TW') {
    const sheetName = moduleName ? `${moduleName}-规格问题` : '规格问题';
    const result = await this.sheetsManager.writeSheet(sheetsUrl, questionList, {
      sheetName,
      moduleName,
      language,
    });

    if (result.success) {
      // 保存写入状态
      const meta = this.config.loadRequirementData(this.config.currentRequirementName, 'meta') || {};
      meta.questionsWrittenToSheet = true;
      meta.questionsSheetUrl = sheetsUrl;
      meta.questionSheetName = moduleName;
      this.config.saveRequirementData(this.config.currentRequirementName, 'meta', meta);
    }

    return result;
  }

  /**
   * 读取问题回复
   */
  async readQuestionReplies(sheetsUrl, iteration = 1, sheetName = null) {
    const opts = { iteration };
    if (sheetName) opts.sheetName = sheetName;
    const result = await this.sheetsManager.readReplies(sheetsUrl, opts);

    if (result.success) {
      this.config.saveRequirementData(
        this.config.currentRequirementName,
        'replies',
        result
      );
    }

    return result;
  }

  /**
   * 根据回复完善需求
   * @param {Array} questionList - 问题清单
   * @param {Array} replies - 回复数据
   * @param {Object} allData - 原始需求数据（与 analyzeAndFindIssues 的 allData 格式一致）
   * @param {Function} onProgress - 进度回调
   * @param {string} language - 输出语言
   */
  async refineRequirements(questionList, replies, allData, confirmedIssues = [], onProgress = null, language = 'zh-TW') {
    // 格式化 allData 为 analyzedData（复用 RequirementProcessor 的格式化逻辑）
    const analyzedData = {};
    if (allData && allData.sheetsData && allData.sheetsData.length > 0) {
      analyzedData.sheets = this.requirementProcessor.formatSheetsData(allData.sheetsData);
    }
    if (allData && allData.figmaRequirements) {
      analyzedData.figma = this.requirementProcessor.formatFigmaData(allData.figmaRequirements);
    }
    if (allData && allData.figmaDesignSpecs) {
      analyzedData.figmaDesignSpecs = allData.figmaDesignSpecs;
    }
    if (allData && allData.localFileData) {
      analyzedData.localFiles = this.requirementProcessor.formatLocalFileData(allData.localFileData);
    }

    const result = await this.requirementProcessor.refineRequirementsWithReplies(
      questionList, replies, analyzedData, confirmedIssues, onProgress, language
    );

    if (result) {
      this.config.saveRequirementData(
        this.config.currentRequirementName,
        'refinedRequirements',
        result
      );
    }

    return result;
  }

  /**
   * 检查完善后是否还有新问题
   */
  async checkForNewIssues(refinedRequirements, confirmedIssues = []) {
    return await this.requirementProcessor.checkForNewIssues(
      refinedRequirements, confirmedIssues
    );
  }

  // ============================================
  // 一键完整执行 + 保存
  // ============================================

  /**
   * 一键完整执行（资料齐全时自动完成）
   */
  async executeFullPipeline(allData, confirmedIssues = [], onProgress = null) {
    const result = await this.requirementProcessor.executeFullPipeline(
      allData, confirmedIssues, onProgress
    );

    if (result.success && result.requirements) {
      this.config.saveRequirementData(
        this.config.currentRequirementName,
        'refinedRequirements',
        result.requirements
      );
    }

    return result;
  }

  /**
   * 保存需求文件到项目目录
   * @param {string} content - Markdown 内容
   * @param {string} moduleName - 模块名（决定保存路径）
   * @param {string} filename - 文件名（默认 need.txt）
   * @returns {Promise<Object>} 保存结果
   */
  async saveRequirementFile(content, moduleName, filename = 'need.txt') {
    const { DATA_DIR } = require('../config/data-dir');
    const fs = require('fs');
    const path = require('path');

    const projectName = path.basename(this.projectPath);
    const safeModuleName = moduleName.replace(/[<>:"/\\|?*]/g, '_').trim();

    // 保存路径：DATA_DIR/{项目名}/{模块名}/need.txt
    const saveDir = path.join(DATA_DIR, projectName, safeModuleName);
    const filePath = path.join(saveDir, filename);

    // 确保目录存在
    if (!fs.existsSync(saveDir)) {
      fs.mkdirSync(saveDir, { recursive: true });
    }

    // 写入文件
    fs.writeFileSync(filePath, content, 'utf8');

    // 同时在 req-analyzer 需求目录中也保存一份
    this.config.saveRequirementData(this.config.currentRequirementName, 'needFile', content);

    console.log(`[ReqAnalyzer] 需求文件已保存: ${filePath}`);

    return {
      success: true,
      filePath,
      saveDir,
      filename,
      moduleName: safeModuleName,
    };
  }

  /**
   * 列出已保存的需求 TXT 文件
   * 扫描 DATA_DIR/{项目名}/ 下所有子目录中的 need.txt
   */
  listSavedFiles() {
    const { DATA_DIR } = require('../config/data-dir');
    const fs = require('fs');
    const path = require('path');
    const projectName = path.basename(this.projectPath);
    const projectDir = path.join(DATA_DIR, projectName);

    if (!fs.existsSync(projectDir)) return [];

    const files = [];
    const dirs = fs.readdirSync(projectDir, { withFileTypes: true });
    for (const dir of dirs) {
      if (!dir.isDirectory()) continue;
      if (dir.name === 'req-analyzer') continue;
      const filePath = path.join(projectDir, dir.name, 'need.txt');
      if (fs.existsSync(filePath)) {
        const stat = fs.statSync(filePath);
        files.push({
          moduleName: dir.name,
          filePath,
          fileSize: stat.size,
          lastModified: stat.mtime.toISOString(),
        });
      }
    }
    return files;
  }

  /**
   * 删除已保存的需求 TXT 文件（删除输出目录 + 清除对应缓存数据）
   */
  deleteSavedFile(moduleName) {
    const { DATA_DIR } = require('../config/data-dir');
    const fs = require('fs');
    const path = require('path');
    const projectName = path.basename(this.projectPath);
    const safeModuleName = moduleName.replace(/[<>:"/\\|?*]/g, '_').trim();
    const saveDir = path.join(DATA_DIR, projectName, safeModuleName);

    // 删除输出目录
    if (fs.existsSync(saveDir)) {
      fs.rmSync(saveDir, { recursive: true, force: true });
      console.log(`[ReqAnalyzer] 已删除输出目录: ${saveDir}`);
    }

    // 同时清除 req-analyzer 缓存中的 needFile 和 refinedRequirements
    this.config.deleteRequirementData(this.config.currentRequirementName, 'needFile');
    this.config.deleteRequirementData(this.config.currentRequirementName, 'refinedRequirements');

    return { success: true, moduleName: safeModuleName };
  }

  // ============================================
  // 配置与缓存操作
  // ============================================

  /**
   * 获取配置
   */
  getConfig() {
    if (!this.config) return null;
    return this.config.loadConfig();
  }

  /**
   * 更新配置
   */
  updateConfig(updates) {
    if (!this.config) return;
    this.config.updateConfig(updates);

    // 如果更新了 Google 配置，重新初始化 auth manager
    if (updates.google) {
      this.googleAuth.updateConfig(updates.google);
    }
  }

  /**
   * 设置当前需求名称
   */
  setCurrentRequirement(name) {
    this.config.setCurrentRequirement(name);

    // 更新配置中的需求列表
    if (!this.config.config.requirements.includes(name)) {
      this.config.config.requirements.push(name);
    }
    this.config.saveConfig();
  }

  /**
   * 获取已有需求列表
   */
  listRequirements() {
    return this.config.listRequirements();
  }

  /**
   * 加载指定需求的缓存数据
   * 用于下次打开时恢复状态
   */
  loadCachedData(requirementName) {
    this.config.setCurrentRequirement(requirementName);

    return {
      sheetsData: this.config.loadRequirementData(requirementName, 'sheetsData'),
      localFileData: this.config.loadRequirementData(requirementName, 'localFileData'),
      figmaData: this.config.loadRequirementData(requirementName, 'figmaData'),
      confirmedIssues: this.config.loadRequirementData(requirementName, 'confirmedIssues'),
      questionList: this.config.loadRequirementData(requirementName, 'questionList'),
      replies: this.config.loadRequirementData(requirementName, 'replies'),
      refinedRequirements: this.config.loadRequirementData(requirementName, 'refinedRequirements'),
      meta: this.config.loadRequirementData(requirementName, 'meta'),
      needFile: this.config.loadRequirementData(requirementName, 'needFile'),
    };
  }

  /**
   * 删除指定需求
   */
  deleteRequirement(requirementName) {
    this.config.deleteRequirement(requirementName);
  }
}

module.exports = ReqAnalyzer;

/**
 * 从 PDF 页面文本中提取标题
 * 过滤掉页码、图表标签、短行等噪音，取第一个有实质内容的行
 */
function extractPageTitle(text) {
  if (!text || !text.trim()) return `页面`;
  const lines = text.trim().split(/\n/).filter(l => l.trim());
  if (lines.length === 0) return `页面`;

  // 噪音行模式：纯数字、图表标签、短行（<=3字符）
  const noisePatterns = [
    /^\d+$/,                              // 纯数字（页码）
    /^[图表][表图]\s*\d/i,                 // 图1、表1 等
    /^figure\s*\d/i,                       // Figure 1
    /^table\s*\d/i,                        // Table 1
    /^fig\.\s*\d/i,                        // Fig. 1
    /^第\s*\d+\s*[章节部分页]/i,            // 第1章、第2节、第3页
    /^\[\d+\]$/,                           // [1] 引用标记
    /^-\s*\d+\s*-/,                        // - 1 - 页码格式
    /^page\s*\d/i,                         // Page 1
  ];

  for (const line of lines) {
    const trimmed = line.trim();
    // 跳过过短的行（<=3字符，大概率是页码或标记）
    if (trimmed.length <= 3) continue;
    // 跳过匹配噪音模式的行
    if (noisePatterns.some(p => p.test(trimmed))) continue;
    return trimmed;
  }

  // 全部被过滤后，回退到第一个非空行
  return lines[0].trim() || `页面`;
}