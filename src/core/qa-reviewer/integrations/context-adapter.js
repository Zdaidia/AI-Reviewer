/**
 * AI 上下文适配器
 *
 * 复用现有的 AI_CONTEXT.md 和 Memory 系统，为 QA Reviewer 提供：
 * - 项目结构信息
 * - UI 组件信息
 * - 数据模型信息
 * - 业务流程信息
 */

const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../../config/data-dir');

class AIContextAdapter {
  constructor(options = {}) {
    this.memoryManager = options.memoryManager || null;
    this.aiContext = null;
    this.projectMemory = null;
    this.projectPath = null;
  }

  /**
   * 加载 AI 上下文
   * 直接读取 AI_CONTEXT.md 文件
   */
  async load(projectPath, forceReload = false) {
    this.projectPath = projectPath;

    // 使用统一的 DATA_DIR 模块
    const folderName = path.basename(projectPath);
    const dataDir = path.join(DATA_DIR, 'AI_Scan_file');
    const projectDir = path.join(dataDir, folderName);
    const aiContextPath = path.join(projectDir, `${folderName}_AI_CONTEXT.md`);

    if (fs.existsSync(aiContextPath)) {
      try {
        const content = fs.readFileSync(aiContextPath, 'utf8');
        this.aiContext = this.parseMarkdownContext(content);
        console.log('[ContextAdapter] 从文件加载 AI 上下文成功');
        return {
          source: 'file',
          hasContext: true,
        };
      } catch (e) {
        console.warn('[ContextAdapter] 文件加载失败:', e.message);
      }
    }

    console.warn('[ContextAdapter] AI 上下文未找到');
    return {
      source: 'none',
      hasContext: false,
    };
  }

  /**
   * 解析 Markdown 格式的 AI 上下文
   */
  parseMarkdownContext(markdown) {
    const context = {
      code: { files: [], structure: {} },
      ui: { widgets: [], pages: [] },
      data: { models: [], apis: [] },
      business: { routes: [], flows: [] },
    };

    let currentSection = null;

    const lines = markdown.split('\n');
    for (const line of lines) {
      // 检测章节标题
      if (line.startsWith('## ')) {
        currentSection = line.substring(3).trim().toLowerCase();
        continue;
      }

      // 解析内容
      if (line.includes('- 文件:') || line.includes('- File:')) {
        if (currentSection.includes('code')) {
          const file = line.match(/[-\s]*(文件|File):\s*(.+)/)?.[2];
          if (file) context.code.files.push(file);
        }
      }

      if (line.includes('- Widget:') || line.includes('- 组件:')) {
        const widget = line.match(/[-\s]*(Widget|组件):\s*(.+)/)?.[2];
        if (widget) context.ui.widgets.push({ name: widget });
      }

      if (line.includes('- Model:') || line.includes('- 模型:')) {
        const model = line.match(/[-\s]*(Model|模型):\s*(.+)/)?.[2];
        if (model) context.data.models.push({ name: model });
      }

      if (line.includes('- API:') || line.includes('- 接口:')) {
        const api = line.match(/[-\s]*(API|接口):\s*(.+)/)?.[2];
        if (api) context.data.apis.push({ endpoint: api });
      }
    }

    return context;
  }

  /**
   * 获取 UI 组件列表（用于 UI 一致性检查）
   */
  getUIComponents() {
    if (!this.aiContext?.ui) return [];

    return this.aiContext.ui.widgets || [];
  }

  /**
   * 获取页面列表
   */
  getPages() {
    if (!this.aiContext?.ui) return [];

    return this.aiContext.ui.pages || [];
  }

  /**
   * 获取数据模型（用于数据验证检查）
   */
  getDataModels() {
    if (!this.aiContext?.data) return [];

    return this.aiContext.data.models || [];
  }

  /**
   * 获取 API 列表
   */
  getAPIs() {
    if (!this.aiContext?.data) return [];

    return this.aiContext.data.apis || [];
  }

  /**
   * 获取业务流程（用于功能完整性检查）
   */
  getBusinessFlows() {
    if (!this.aiContext?.business) return [];

    return this.aiContext.business.routes || [];
  }

  /**
   * 获取文件结构（用于分段）
   */
  getFileStructure() {
    if (!this.aiContext?.code) return {};

    return {
      files: this.aiContext.code.files || [],
      structure: this.aiContext.code.structure || {},
    };
  }

  /**
   * 快速获取功能相关的上下文
   * @param {string} featureName - 功能点名称
   * @returns {Object} 相关的上下文信息
   */
  getContextForFeature(featureName) {
    const context = {
      files: [],
      classes: [],
      apis: [],
      uiElements: [],
    };

    const keywords = this.extractKeywords(featureName);

    // 从 FileContext 查找相关文件
    if (this.aiContext?.code?.files) {
      context.files = this.aiContext.code.files.filter(f =>
        keywords.some(kw => f.toLowerCase().includes(kw))
      );
    }

    // 从 UIContext 查找相关组件
    if (this.aiContext?.ui?.widgets) {
      context.uiElements = this.aiContext.ui.widgets.filter(w =>
        keywords.some(kw => w.name?.toLowerCase().includes(kw))
      );
    }

    // 从 DataContext 查找相关 API
    if (this.aiContext?.data?.apis) {
      context.apis = this.aiContext.data.apis.filter(api =>
        keywords.some(kw =>
          (api.endpoint && api.endpoint.includes(kw)) ||
          (api.description && api.description.includes(kw))
        )
      );
    }

    // 从 DataContext 查找相关模型
    if (this.aiContext?.data?.models) {
      context.classes = this.aiContext.data.models.filter(model =>
        keywords.some(kw => model.name?.toLowerCase().includes(kw))
      );
    }

    return context;
  }

  /**
   * 构建用于 AI 分析的上下文提示词
   * @param {Object} options - 选项
   * @returns {string} 格式化的上下文文本
   */
  buildContextPrompt(options = {}) {
    const {
      includeCode = true,
      includeUI = true,
      includeData = true,
      includeBusiness = true,
      maxFiles = 20,
      maxWidgets = 30,
      maxModels = 20,
    } = options;

    const sections = [];

    // 代码结构
    if (includeCode && this.aiContext?.code) {
      const files = (this.aiContext.code.files || []).slice(0, maxFiles);
      sections.push('## 代码结构');
      sections.push(`项目包含 ${files.length} 个文件：`);
      sections.push(...files.map(f => `- ${f}`));
      sections.push('');
    }

    // UI 组件
    if (includeUI && this.aiContext?.ui) {
      const widgets = (this.aiContext.ui.widgets || []).slice(0, maxWidgets);
      sections.push('## UI 组件');
      sections.push(`项目包含 ${widgets.length} 个组件：`);
      sections.push(...widgets.map(w => `- ${w.name}${w.file ? ` (${w.file})` : ''}`));
      sections.push('');
    }

    // 数据模型
    if (includeData && this.aiContext?.data) {
      const models = (this.aiContext.data.models || []).slice(0, maxModels);
      sections.push('## 数据模型');
      sections.push(`项目包含 ${models.length} 个模型：`);
      sections.push(...models.map(m => `- ${m.name}${m.fields ? ` {${m.fields.join(', ')}}` : ''}`));
      sections.push('');
    }

    // API 列表
    if (includeData && this.aiContext?.data?.apis) {
      sections.push('## API 接口');
      sections.push(...this.aiContext.data.apis.map(api =>
        `- ${api.method || 'GET'} ${api.endpoint}`
      ));
      sections.push('');
    }

    // 业务流程
    if (includeBusiness && this.aiContext?.business) {
      sections.push('## 业务流程');
      sections.push(...(this.aiContext.business.routes || []).map(route =>
        `- ${route.path} → ${route.handler || '未知'}`
      ));
      sections.push('');
    }

    return sections.join('\n');
  }

  /**
   * 提取关键词
   */
  extractKeywords(text) {
    if (!text) return [];

    const chinese = text.match(/[\u4e00-\u9fa5]+/g) || [];
    const english = text.toLowerCase().match(/[a-z]{2,}/g) || [];

    return [...chinese, ...english];
  }

  /**
   * 检查上下文是否可用
   */
  isAvailable() {
    return !!this.aiContext;
  }

  /**
   * 获取上下文摘要
   */
  getSummary() {
    if (!this.aiContext) {
      return '无 AI 上下文';
    }

    const parts = [];

    if (this.aiContext.code?.files) {
      parts.push(`${this.aiContext.code.files.length} 个文件`);
    }

    if (this.aiContext.ui?.widgets) {
      parts.push(`${this.aiContext.ui.widgets.length} 个组件`);
    }

    if (this.aiContext.data?.models) {
      parts.push(`${this.aiContext.data.models.length} 个模型`);
    }

    return parts.join(' | ') || '空上下文';
  }
}

module.exports = AIContextAdapter;
