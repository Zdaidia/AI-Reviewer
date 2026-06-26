/**
 * 需求分析整理模块 - 配置管理
 *
 * 管理 Google/Figma/Sheets 配置
 * 按需求名称分文件夹存储，不同需求数据完全隔离
 *
 * 目录结构：
 * DATA_DIR/{项目名}/req-analyzer/
 *   config.json                # 全局配置
 *   google-tokens.json         # OAuth2 tokens
 *   {需求名1}/                 # 每个需求独立文件夹
 *     requirement-meta.json    # 需求元信息
 *     sheets-data.json         # Sheets 数据缓存
 *     figma-data.json          # Figma 数据缓存
 *     confirmed-issues.json    # 已确认问题缓存
 *     question-list.json       # 问题清单缓存
 *     replies.json             # 回复缓存
 *     refined-requirements.json # 完善后需求缓存
 *     need.txt                 # 最终需求文件
 */

const { DATA_DIR } = require('../config/data-dir');
const { getGoogleClientSecret, getFigmaAccessToken } = require('../config/secrets-loader');
const path = require('path');
const fs = require('fs');

// 加载 .env 文件中的环境变量（如果尚未设置）
function loadEnvFile() {
  const envPaths = [
    path.join(process.cwd(), '.env'),
    path.join(__dirname, '../../../.env'),
  ];
  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const match = trimmed.match(/^([^=]+)=(.*)$/);
        if (match && !process.env[match[1].trim()]) {
          process.env[match[1].trim()] = match[2].trim();
        }
      }
      break;
    }
  }
}
loadEnvFile();

class ReqAnalyzerConfig {
  constructor(projectPath) {
    this.projectPath = projectPath;
    this.projectName = path.basename(projectPath);
    this.baseDir = path.join(DATA_DIR, this.projectName, 'req-analyzer');
    this.configFile = path.join(this.baseDir, 'config.json');
    this.tokensFile = path.join(this.baseDir, 'google-tokens.json');
    this.currentRequirementName = null;
    this.config = null;

    this.ensureDir();
  }

  /**
   * 确保基础目录存在
   */
  ensureDir() {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  /**
   * 获取需求专属目录
   * @param {string} requirementName - 需求名称
   * @returns {string} 需求数据目录路径
   */
  getRequirementDir(requirementName) {
    if (!requirementName) {
      requirementName = this.currentRequirementName || 'default';
    }
    // 清理名称中的非法字符
    const safeName = requirementName.replace(/[<>:"/\\|?*]/g, '_').trim();
    const dir = path.join(this.baseDir, safeName);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  /**
   * 设置当前需求名称
   */
  setCurrentRequirement(name) {
    this.currentRequirementName = name;
    this.ensureDir(); // 确保 demand 目录存在
  }

  /**
   * 获取当前需求名称
   */
  getCurrentRequirement() {
    return this.currentRequirementName;
  }

  /**
   * 加载配置
   */
  loadConfig() {
    if (fs.existsSync(this.configFile)) {
      try {
        this.config = JSON.parse(fs.readFileSync(this.configFile, 'utf8'));
      } catch (e) {
        console.warn(`[ReqAnalyzerConfig] 加载配置失败: ${e.message}`);
        this.config = this.getDefaultConfig();
      }
    } else {
      this.config = this.getDefaultConfig();
    }

    // 从配置中恢复当前需求名称
    if (this.config.lastRequirement) {
      this.currentRequirementName = this.config.lastRequirement;
    }

    return this.config;
  }

  /**
   * 保存配置
   */
  saveConfig(config) {
    this.config = config || this.config;

    // 记录当前需求名称
    if (this.currentRequirementName) {
      this.config.lastRequirement = this.currentRequirementName;
    }

    this.ensureDir();
    fs.writeFileSync(this.configFile, JSON.stringify(this.config, null, 2), 'utf8');
  }

  /**
   * 更新配置（部分更新）
   */
  updateConfig(updates) {
    if (!this.config) this.loadConfig();

    // 合并更新
    for (const [key, value] of Object.entries(updates)) {
      if (key === 'google') {
        this.config.google = { ...this.config.google, ...value };
      } else if (key === 'sheets') {
        this.config.sheets = { ...this.config.sheets, ...value };
      } else if (key === 'figma') {
        this.config.figma = { ...this.config.figma, ...value };
      } else if (key === 'output') {
        this.config.output = { ...this.config.output, ...value };
      } else {
        this.config[key] = value;
      }
    }

    this.saveConfig();
  }

  /**
   * 获取默认配置
   */
  getDefaultConfig() {
    return {
      google: {
        // Client ID 可公开，硬编码在源码中
        clientId: '602232104560-2dlg51k0l5dmmk4f21qm7u019gugsegs.apps.googleusercontent.com',
        // Client Secret 必须保密，优先从 secrets.json（打包自带）读取
        clientSecret: getGoogleClientSecret(),
        redirectUri: 'dqi://auth/callback',
      },
      sheets: {
        requirementSheetUrl: '',
        questionSheetUrl: '',
        confirmedIssuesSheetUrl: '',
        columnMapping: {
          'requirement / 需求 / 需求描述': 'requirement',
          'module / 模块 / 功能模块': 'module',
          'priority / 优先级': 'priority',
          'description / 描述 / 详细描述': 'description',
          'acceptance / 验收标准 / AC': 'acceptanceCriteria',
          'status / 状态': 'status',
          'question / 问题描述': 'question',
          'reply / 回复': 'reply',
          'severity / 严重程度': 'severity',
          'suggestion / 建议': 'suggestion',
        },
      },
      figma: {
        accessToken: getFigmaAccessToken(),
        defaultUrl: 'https://www.figma.com/design/iE6V1a7Bzfl2zHI2LuKIQY/%E5%8F%B0%E5%8D%97%E5%81%8C%E8%BB%8A%E7%87%9F%E9%81%8B%E7%AE%A1%E7%90%86%E7%B3%BB%E7%B5%B1?node-id=28959-188&p=f&t=o2OTzZ0makHYkZWf-0',
      },
      output: {
        filename: 'need.txt',
      },
      iteration: {
        maxRounds: 3,
        minImprovementRate: 0.2,
        autoStopOnNoIssues: true,
      },
      lastRequirement: '',
      requirements: [],  // 已有需求列表
    };
  }

  /**
   * 获取 Google OAuth2 tokens 路径
   */
  getTokensPath() {
    return this.tokensFile;
  }

  /**
   * 获取需求数据文件路径
   */
  getDataPath(requirementName, dataKey) {
    const dir = this.getRequirementDir(requirementName);
    const fileMap = {
      meta: 'requirement-meta.json',
      sheetsData: 'sheets-data.json',
      localFileData: 'local-file-data.json',
      figmaData: 'figma-data.json',
      confirmedIssues: 'confirmed-issues.json',
      questionList: 'question-list.json',
      replies: 'replies.json',
      refinedRequirements: 'refined-requirements.json',
      needFile: 'need.txt',
    };
    return path.join(dir, fileMap[dataKey] || `${dataKey}.json`);
  }

  /**
   * 保存需求数据到文件
   */
  saveRequirementData(requirementName, dataKey, data) {
    const filePath = this.getDataPath(requirementName, dataKey);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`[ReqAnalyzerConfig] 数据已保存: ${dataKey} → ${filePath}`);
  }

  /**
   * 删除指定需求数据文件
   */
  deleteRequirementData(requirementName, dataKey) {
    const filePath = this.getDataPath(requirementName, dataKey);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`[ReqAnalyzerConfig] 已删除: ${dataKey} → ${filePath}`);
    }
  }

  /**
   * 加载需求数据从文件
   */
  loadRequirementData(requirementName, dataKey) {
    const filePath = this.getDataPath(requirementName, dataKey);
    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      if (dataKey === 'needFile') {
        return content; // need.txt 是纯文本
      }
      return JSON.parse(content);
    } catch (e) {
      console.warn(`[ReqAnalyzerConfig] 加载 ${dataKey} 失败: ${e.message}`);
      return null;
    }
  }

  /**
   * 获取所有已有需求列表
   */
  listRequirements() {
    if (!fs.existsSync(this.baseDir)) return [];

    const requirements = [];
    const entries = fs.readdirSync(this.baseDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const metaPath = path.join(this.baseDir, entry.name, 'requirement-meta.json');
        let meta = {};
        if (fs.existsSync(metaPath)) {
          try {
            meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
          } catch (e) { /* ignore */ }
        }
        requirements.push({
          name: entry.name,
          ...meta,
        });
      }
    }

    return requirements;
  }

  /**
   * 删除指定需求的所有数据
   */
  deleteRequirement(requirementName) {
    const dir = this.getRequirementDir(requirementName);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
      console.log(`[ReqAnalyzerConfig] 需求 "${requirementName}" 的数据已删除`);
    }

    // 从配置中移除
    if (this.config) {
      this.config.requirements = this.config.requirements.filter(r => r !== requirementName);
      if (this.currentRequirementName === requirementName) {
        this.currentRequirementName = null;
      }
      this.saveConfig();
    }
  }
}

module.exports = ReqAnalyzerConfig;