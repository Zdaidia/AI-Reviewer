/**
 * 智能代码切片器
 *
 * 对于大文件，根据模块/需求智能提取相关代码片段
 * 减少 AI 调用成本，提高分析精度
 *
 * 支持文件类型：
 * - Dart: .dart
 * - JavaScript/TypeScript: .js, .ts, .jsx, .tsx
 * - Vue: .vue
 * - React: .jsx, .tsx
 * - HTML: .html, .htm
 * - CSS/SCSS/Less: .css, .scss, .sass, .less
 * - JSON: .json
 */

const fs = require('fs');

class CodeSlicer {
  constructor(options = {}) {
    this.maxFileSize = options.maxFileSize || 30 * 1024; // 超过此大小的文件需要切片
    this.keywords = options.keywords || []; // 当前审查相关的关键词

    // 文件类型识别规则
    this.fileTypePatterns = {
      // ========== 多语言/国际化文件 ==========
      i18n: [
        // Dart
        /i18n.*\.dart$/, /localization.*\.dart$/, /locale.*\.dart$/,
        /strings.*\.dart$/, /translations.*\.dart$/,
        /^(zh|en|ja|ko|fr|de|es|pt)\.dart$/,
        /\b(l10n|i18n|lang|locale|translation)\.dart$/,
        // JavaScript/TypeScript
        /i18n.*\.(js|ts|jsx|tsx)$/, /locale.*\.(js|ts|jsx|tsx)$/,
        /lang.*\.(js|ts|jsx|tsx)$/, /translations.*\.(js|ts|jsx|tsx)$/,
        /(zh|en|ja|ko)\.(js|ts|json)$/,
        // Vue
        /i18n\.(js|ts)$/, /locale\.(js|ts)$/,
        // JSON
        /locales?\/.*\.json$/, /lang\/.*\.json$/,
        /^(zh|en|ja|ko|fr|de)\.json$/,
      ],

      // ========== 路由配置文件 ==========
      routes: [
        // Dart
        /routes?\.dart$/, /pages?\.dart$/, /navigation\.dart$/,
        /app_?routes?\.dart$/, /app_?pages?\.dart$/,
        /route_?config\.dart$/, /page_?config\.dart$/,
        // JavaScript/TypeScript/Vue
        /routes?\.(js|ts|jsx|tsx)$/, /router?\.(js|ts|jsx|tsx)$/,
        /pages?\.(js|ts|jsx|tsx)$/,
        /app_?routes?\.(js|ts|jsx|tsx)$/, /app_?pages?\.(js|ts|jsx|tsx)$/,
        // Vue 路由
        /router\/index\.(js|ts)$/,
      ],

      // ========== 常量/配置文件 ==========
      constants: [
        /constants?\.(dart|js|ts|jsx|tsx)$/,
        /config?\.(dart|js|ts|jsx|tsx)$/,
        /settings?\.(dart|js|ts|jsx|tsx)$/,
        /enums?\.(dart|js|ts|jsx|tsx)$/,
        /\.config\.(js|ts)$/,
      ],

      // ========== API 接口文件 ==========
      api: [
        // Dart
        /api.*\.dart$/, /provider.*\.dart$/, /service.*\.dart$/,
        /repository.*\.dart$/, /client.*\.dart$/,
        // JavaScript/TypeScript
        /api.*\.(js|ts|jsx|tsx)$/, /services?\/.*\.(js|ts)$/,
        /\/api\/.*\.(js|ts|jsx|tsx)$/,
      ],

      // ========== Vue 单文件组件 ==========
      vue: [
        /\.vue$/,
      ],

      // ========== React 组件 ==========
      react: [
        /\.jsx$/, /\.tsx$/,
        /components\/.*\.(js|ts)$/,
      ],

      // ========== HTML 文件 ==========
      html: [
        /\.html?$/, /\.htm$/,
      ],

      // ========== 样式文件 ==========
      styles: [
        /\.css$/, /\.scss$/, /\.sass$/, /\.less$/,
        /styles?\.(css|scss|less)$/,
        /\/styles\/.*/, /\/css\/.*/,
      ],

      // ========== JSON 配置文件 ==========
      json: [
        /\.json$/,
        /package\.json$/, /tsconfig\.json$/,
      ],

      // ========== Storage 数据持久化文件 ==========
      storage: [
        // Storage 文件夹
        /\/storage\//, /\/store\//, /\/stores\//,
        /\/store\//, /\/stores\//, /\/storage\//,
        // 状态管理
        /\/state\//, /\/states\//,
        /\/vuex\//, /\/pinia\//, /\/redux\//,
        /\/(vuex|pinia|redux)\/.*\.(js|ts)$/,
        // LocalStorage/SessionStorage 相关
        /storage\.(js|ts|dart)$/, /store\.(js|ts|dart)$/,
        /local.?storage\.(js|ts)$/, /session.?storage\.(js|ts)$/,
        // 数据库/缓存
        /cache\.(js|ts|dart)$/, /db\.(js|ts|dart)$/,
        /database\.(js|ts|dart)$/,
        // Shared Preferences (Dart/Flutter)
        /shared.*preferences/,
        /local.?storage/,
      ],

      // ========== Store 状态管理文件 ==========
      store: [
        // Vuex
        /\/store\/.*\.(js|ts)$/, /\/stores\/.*\.(js|ts)$/,
        /\.store\.(js|ts)$/, /vuex.*\.(js|ts)$/,
        // Pinia
        /\/pinia\/.*\.(js|ts)$/, /pinia.*\.(js|ts)$/,
        // Redux
        /\/redux\/.*\.(js|ts)$/, /redux.*\.(js|ts)$/,
        // Mobx
        /\/mobx\/.*\.(js|ts)$/, /mobx.*\.(js|ts)$/,
        // Zustand
        /zustand.*\.(js|ts)$/,
        // Dart/Flutter 状态管理
        /.*provider\.dart$/, /.*bloc\.dart$/,
        /.*controller\.dart$/, /.*state\.dart$/,
        /getx\//, /riverpod\//, /bloc\//,
      ],
    };
  }

  /**
   * 识别文件类型
   * @returns {string} 文件类型
   */
  identifyFileType(filePath) {
    const fileName = filePath.split(/[/\\]/).pop().toLowerCase();
    const fullPathLower = filePath.toLowerCase();

    // 按优先级检查
    const priorityOrder = ['vue', 'react', 'html', 'styles', 'json', 'i18n', 'routes', 'constants', 'api'];

    for (const type of priorityOrder) {
      const patterns = this.fileTypePatterns[type];
      if (patterns) {
        for (const pattern of patterns) {
          if (pattern.test(fileName) || pattern.test(fullPathLower)) {
            console.log(`[CodeSlicer] 识别文件类型: ${fileName} -> ${type}`);
            return type;
          }
        }
      }
    }

    return 'code'; // 默认为普通代码文件
  }

  /**
   * 判断文件是否应该被切片
   * 只有配置类文件才切片，核心业务代码不切片
   * @returns {boolean}
   */
  shouldSliceFile(filePath, fileType) {
    const fileName = filePath.split(/[/\\]/).pop().toLowerCase();
    const pathLower = filePath.toLowerCase();

    // 不切片的文件类型（核心业务代码）
    const noSliceTypes = [
      // 视图层
      'views',
      'screens',
      'pages',
      // 控制器层
      'controllers',
      'controller',
      // 服务层
      'services',
      'service',
      // API层（如果是具体业务API）
      'api',
      // 组件
      'components',
      'widgets',
      // 模型/实体
      'models',
      'entities',
      'dto',
    ];

    // 检查是否在不切片的路径中
    for (const noSliceType of noSliceTypes) {
      if (pathLower.includes(`/${noSliceType}/`) || pathLower.includes(`\\${noSliceType}\\`)) {
        return false; // 核心业务代码，不切片
      }
    }

    // 以下文件类型需要切片（配置类文件）
    const sliceTypes = ['i18n', 'routes', 'constants', 'storage', 'store'];

    // 如果识别为配置类文件类型，则切片
    if (sliceTypes.includes(fileType)) {
      return true;
    }

    // 默认：普通代码文件不切片
    return false;
  }

  /**
   * 切片文件内容
   * @param {string} filePath - 文件路径
   * @param {string[]} keywords - 相关关键词
   * @param {Object} options - 选项 { relatedPaths: string[] }
   */
  sliceFile(filePath, keywords = [], options = {}) {
    if (!fs.existsSync(filePath)) {
      return {
        originalContent: '',
        slicedContent: '',
        lines: 0,
        wasSliced: false,
        error: 'File not found'
      };
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const fileSize = content.length;

    // 识别文件类型
    const fileType = this.identifyFileType(filePath);

    // 判断是否应该切片：只有配置类文件才切片，核心业务代码不切片
    const shouldSlice = this.shouldSliceFile(filePath, fileType);

    if (!shouldSlice) {
      // 核心业务代码：不切片，返回完整内容
      console.log(`[CodeSlicer] 文件 ${filePath} 是核心业务代码 (${fileType})，不进行切片，返回完整内容`);
      return {
        originalContent: content,
        slicedContent: content,
        lines: content.split('\n').length,
        wasSliced: false,
        fileType: fileType,
        skipReason: 'core-business-code'
      };
    }

    // 文件不大，直接返回
    if (fileSize <= this.maxFileSize) {
      return {
        originalContent: content,
        slicedContent: content,
        lines: content.split('\n').length,
        wasSliced: false,
        fileType: fileType
      };
    }

    // 配置类文件太大，需要切片
    console.log(`[CodeSlicer] 文件 ${filePath} 太大 (${fileSize} 字符)，尝试切片...`);

    // 增强关键词：从当前文件和同一分段中其他文件的路径中提取
    const relatedPaths = options.relatedPaths || [];
    const enhancedKeywords = this.enhanceKeywordsFromPath(filePath, keywords, relatedPaths);
    console.log(`[CodeSlicer] 原始关键词:`, keywords);
    console.log(`[CodeSlicer] 增强后关键词:`, enhancedKeywords);

    // 根据文件类型选择切片策略（使用增强后的关键词）
    const sliced = this.sliceByFileType(content, filePath, enhancedKeywords, fileType);

    return {
      originalContent: content,
      slicedContent: sliced.content,
      lines: sliced.lines,
      wasSliced: true,
      originalLines: content.split('\n').length,
      sliceRatio: sliced.content.length / content.length,
      slicesInfo: sliced.slices,
      fileType: sliced.fileType
    };
  }

  /**
   * 从文件路径中增强关键词
   * 提取目录名、文件名中的模块/功能信息
   * @param {string} filePath - 当前文件路径
   * @param {string[]} originalKeywords - 原始关键词
   * @param {string[]} relatedPaths - 同一分段中的其他文件路径
   */
  enhanceKeywordsFromPath(filePath, originalKeywords, relatedPaths = []) {
    const enhanced = new Set(originalKeywords);

    // 收集所有相关路径（包括当前文件）
    const allPaths = [filePath, ...relatedPaths];

    // 常见的模块/功能关键词映射
    const moduleKeywords = {
      // 账号/用户相关
      'account': ['account', 'user', 'profile', '账号', '用户', '账户'],
      'account_management': ['account', 'management', 'manage', '账号', '管理', 'user'],
      'user': ['user', 'account', 'profile', '用户', '账号'],
      'profile': ['profile', 'user', 'account', '个人', '资料', '用户'],

      // 登录/认证相关
      'login': ['login', 'auth', 'sign', '登录', '认证', '登入'],
      'auth': ['auth', 'login', 'token', '认证', '登录'],
      'register': ['register', 'signup', 'sign', '注册'],

      // 首页/仪表盘
      'home': ['home', 'index', 'main', '首页', '主页'],
      'dashboard': ['dashboard', 'home', 'panel', '仪表盘', '面板'],

      // 菜单/导航
      'menu': ['menu', 'nav', 'sidebar', '菜单', '导航', '侧边栏'],
      'navigation': ['nav', 'menu', 'route', '导航', '菜单', '路由'],
      'sidebar': ['sidebar', 'menu', 'side', '侧边栏', '菜单'],

      // 路由/页面
      'route': ['route', 'path', 'page', '路由', '路径', '页面'],
      'page': ['page', 'view', 'screen', '页面', '视图'],

      // 设置/配置
      'settings': ['setting', 'config', 'preference', '设置', '配置'],
      'config': ['config', 'setting', '配置', '设置'],

      // 列表/表格
      'list': ['list', 'table', 'grid', '列表', '表格'],
      'table': ['table', 'list', 'data', '表格', '列表'],

      // 表单/输入
      'form': ['form', 'input', 'edit', '表单', '输入', '编辑'],
      'input': ['input', 'form', 'field', '输入', '表单', '字段'],

      // 弹窗/对话框
      'dialog': ['dialog', 'modal', 'popup', '对话框', '弹窗', '模态'],
      'modal': ['modal', 'dialog', 'popup', '模态', '对话框'],

      // API/数据
      'api': ['api', 'service', 'provider', 'data', '接口', '数据'],
      'service': ['service', 'api', 'provider', '服务', '接口'],
      'provider': ['provider', 'service', 'api', '提供者', '服务'],

      // 控制器/状态
      'controller': ['controller', 'control', 'logic', '控制器', '控制'],
      'state': ['state', 'store', 'data', '状态', '数据'],
      'store': ['store', 'state', 'storage', '存储', '状态'],
    };

    // 遍历所有相关路径，提取关键词
    for (const currentPath of allPaths) {
      const pathParts = currentPath.split(/[/\\]/);
      const fileName = pathParts[pathParts.length - 1].toLowerCase();
      const directories = pathParts.slice(0, -1).map(d => d.toLowerCase());

      // 遍历当前路径中的每个部分
      for (const part of [...directories, fileName]) {
      // 检查是否匹配任何已知模块
      for (const [key, synonyms] of Object.entries(moduleKeywords)) {
        if (part.includes(key) || key.includes(part)) {
          // 添加该模块的所有同义词
          for (const synonym of synonyms) {
            enhanced.add(synonym);
          }
        }
      }

      // 从文件名中提取 camelCase/PascalCase 的单词
      const words = part.match(/[a-z]+|[A-Z][a-z]*/g) || [];
      for (const word of words) {
        if (word.length > 2) {
          enhanced.add(word.toLowerCase());
        }
      }

      // 从下划线/连字符分隔的名称中提取单词
      const underscoreWords = part.split(/[_-]/);
      for (const word of underscoreWords) {
        if (word.length > 2) {
          enhanced.add(word.toLowerCase());
        }
      }
    }
    }

    // 特殊处理：如果原始关键词是 manual-selection，从所有相关路径中提取模块名
    if (originalKeywords.includes('manual-selection')) {
      // 从所有相关路径的目录结构中提取可能的模块名
      for (const relatedPath of allPaths) {
        const pathParts = relatedPath.split(/[/\\]/);
        const relatedDirs = pathParts.slice(0, -1).map(d => d.toLowerCase());

        for (const dir of relatedDirs) {
          if (dir.includes('management') || dir.includes('account')) {
            enhanced.add('account');
            enhanced.add('management');
            enhanced.add('manage');
          }
          if (dir.includes('user')) {
            enhanced.add('user');
            enhanced.add('account');
          }
          if (dir.includes('menu')) {
            enhanced.add('menu');
            enhanced.add('sidebar');
          }
          if (dir.includes('route') || dir.includes('page')) {
            enhanced.add('route');
            enhanced.add('page');
          }
        }
      }
    }

    return Array.from(enhanced);
  }

  /**
   * 根据文件类型切片
   */
  sliceByFileType(content, filePath, keywords, fileType) {
    switch (fileType) {
      case 'vue':
        return this.sliceVueFile(content, keywords);
      case 'react':
        return this.sliceReactFile(content, keywords);
      case 'html':
        return this.sliceHtmlFile(content, keywords);
      case 'styles':
        return this.sliceStylesFile(content, filePath, keywords);
      case 'json':
        return this.sliceJsonFile(content, keywords);
      case 'storage':
      case 'store':
        return this.sliceStoreFile(content, keywords, fileType);
      case 'i18n':
        return this.sliceI18nFile(content, keywords, this.getExtension(filePath));
      case 'routes':
        return this.sliceRoutesFile(content, keywords, this.getExtension(filePath));
      case 'constants':
        return this.sliceConstantsFile(content, keywords, this.getExtension(filePath));
      case 'api':
        return this.sliceAPIFile(content, keywords, this.getExtension(filePath));
      default:
        // 普通代码文件
        const ext = this.getExtension(filePath);
        if (ext === '.dart') {
          return this.sliceDartFile(content, keywords);
        } else if (['.js', '.ts', '.jsx', '.tsx'].includes(ext)) {
          return this.sliceJavaScriptFile(content, keywords);
        }
        return this.sliceGenericFile(content, keywords);
    }
  }

  /**
   * 切片 Vue 单文件组件
   * 分别处理 template、script、style 三个部分
   */
  sliceVueFile(content, keywords) {
    const keywordVariants = this.generateKeywordVariants(keywords);
    console.log(`[CodeSlicer] Vue 关键词变体:`, keywordVariants);

    // 解析 Vue 单文件组件
    const parts = this.parseVueFile(content);

    let slicedContent = '';
    let totalLines = 0;

    // 处理 template 部分
    if (parts.template) {
      const slicedTemplate = this.sliceVueTemplate(parts.template, keywordVariants);
      if (slicedTemplate.content) {
        slicedContent += '<template>\n' + slicedTemplate.content + '\n</template>\n\n';
        totalLines += slicedTemplate.lines;
      }
    }

    // 处理 script 部分
    if (parts.script) {
      const slicedScript = this.sliceJavaScriptFile(parts.script, keywords);
      if (slicedScript.content) {
        slicedContent += '<script>\n' + slicedScript.content + '\n</script>\n\n';
        totalLines += slicedScript.lines;
      }
    }

    // 处理 style 部分（只保留相关样式）
    if (parts.style) {
      const slicedStyle = this.sliceCssContent(parts.style, keywordVariants);
      if (slicedStyle.content) {
        slicedContent += '<style>\n' + slicedStyle.content + '\n</style>\n';
        totalLines += slicedStyle.lines;
      }
    }

    // 如果没有任何内容，返回头部信息
    if (!slicedContent) {
      slicedContent = '// Vue 文件过大，未找到与当前模块相关的内容\n';
      slicedContent += '// 模板: ' + (parts.template ? parts.template.split('\n').length + ' 行' : '无') + '\n';
      slicedContent += '// 脚本: ' + (parts.script ? parts.script.split('\n').length + ' 行' : '无') + '\n';
      slicedContent += '// 样式: ' + (parts.style ? parts.style.split('\n').length + ' 行' : '无') + '\n';
      totalLines = 4;
    }

    console.log(`[CodeSlicer] Vue 文件切片完成: ${totalLines} 行`);

    return {
      content: slicedContent,
      lines: totalLines,
      slices: [{ type: 'vue', parts: Object.keys(parts).filter(k => parts[k]) }],
      fileType: 'vue'
    };
  }

  /**
   * 解析 Vue 单文件组件
   */
  parseVueFile(content) {
    const parts = {
      template: null,
      script: null,
      style: null
    };

    // 提取 template
    const templateMatch = content.match(/<template[^>]*>([\s\S]*?)<\/template>/i);
    if (templateMatch) {
      parts.template = templateMatch[1].trim();
    }

    // 提取 script
    const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
    if (scriptMatch) {
      parts.script = scriptMatch[1].trim();
    }

    // 提取 style
    const styleMatch = content.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
    if (styleMatch) {
      parts.style = styleMatch[1].trim();
    }

    return parts;
  }

  /**
   * 切片 Vue template 部分
   */
  sliceVueTemplate(template, keywords) {
    const lines = template.split('\n');
    const relevantLines = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (this.isRelevantLine(line, keywords)) {
        // 包含上下文
        const contextStart = Math.max(0, i - 3);
        const contextEnd = Math.min(lines.length, i + 4);
        for (let j = contextStart; j < contextEnd; j++) {
          if (!relevantLines.includes(lines[j])) {
            relevantLines.push(lines[j]);
          }
        }
      }
    }

    if (relevantLines.length === 0) {
      // 返回前 30 行
      return {
        content: lines.slice(0, 30).join('\n'),
        lines: Math.min(30, lines.length)
      };
    }

    return {
      content: relevantLines.join('\n'),
      lines: relevantLines.length
    };
  }

  /**
   * 切片 React/JSX/TSX 文件
   */
  sliceReactFile(content, keywords) {
    const keywordVariants = this.generateKeywordVariants(keywords);
    console.log(`[CodeSlicer] React 关键词变体:`, keywordVariants);

    const lines = content.split('\n');
    const relevantSections = [];
    let currentSection = [];
    let inRelevantSection = false;
    let sectionStartLine = 0;
    let braceCount = 0; // 跟踪大括号嵌套

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // 计算大括号
      braceCount += (line.match(/{/g) || []).length;
      braceCount -= (line.match(/}/g) || []).length;

      const isRelevantStart = this.isRelevantLine(trimmed, keywordVariants);

      if (isRelevantStart && !inRelevantSection) {
        inRelevantSection = true;
        sectionStartLine = i;
        const contextStart = Math.max(0, i - 10);
        currentSection = lines.slice(contextStart, i + 1);
        braceCount = 0;
        // 重新计算当前行的大括号
        braceCount += (line.match(/{/g) || []).length;
        braceCount -= (line.match(/}/g) || []).length;
      } else if (inRelevantSection) {
        currentSection.push(line);

        // 当大括号平衡且有一定行数时结束
        if (braceCount === 0 && currentSection.length > 5) {
          relevantSections.push({
            start: sectionStartLine,
            end: i,
            content: currentSection.join('\n')
          });
          currentSection = [];
          inRelevantSection = false;
        }

        // 防止单个区域太大
        if (currentSection.length > 150) {
          relevantSections.push({
            start: sectionStartLine,
            end: i,
            content: currentSection.join('\n'),
            truncated: true
          });
          currentSection = [];
          inRelevantSection = false;
          braceCount = 0;
        }
      }
    }

    // 处理未闭合的区域
    if (currentSection.length > 0) {
      relevantSections.push({
        start: sectionStartLine,
        end: lines.length - 1,
        content: currentSection.join('\n')
      });
    }

    if (relevantSections.length === 0) {
      const header = this.extractFileHeader(lines);
      return {
        content: header,
        lines: header.split('\n').length,
        slices: [{ type: 'react-header' }],
        fileType: 'react'
      };
    }

    const slicedContent = relevantSections.map(s => s.content).join('\n\n// --- 分隔 ---\n\n');

    return {
      content: slicedContent,
      lines: slicedContent.split('\n').length,
      slices: [{ type: 'react', sections: relevantSections.length }],
      fileType: 'react'
    };
  }

  /**
   * 切片 HTML 文件
   */
  sliceHtmlFile(content, keywords) {
    const keywordVariants = this.generateKeywordVariants(keywords);
    console.log(`[CodeSlicer] HTML 关键词变体:`, keywordVariants);

    const lines = content.split('\n');
    const relevantSections = [];
    let currentSection = [];
    let inRelevantSection = false;
    let sectionStartLine = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      const isRelevantStart = this.isRelevantLine(trimmed, keywordVariants);

      if (isRelevantStart && !inRelevantSection) {
        inRelevantSection = true;
        sectionStartLine = i;
        const contextStart = Math.max(0, i - 5);
        currentSection = lines.slice(contextStart, i + 1);
      } else if (inRelevantSection) {
        currentSection.push(line);

        // 检查标签是否闭合
        if (trimmed.match(/<\/[^>]+>/) && currentSection.length > 3) {
          relevantSections.push({
            start: sectionStartLine,
            end: i,
            content: currentSection.join('\n')
          });
          currentSection = [];
          inRelevantSection = false;
        }

        if (currentSection.length > 100) {
          relevantSections.push({
            start: sectionStartLine,
            end: i,
            content: currentSection.join('\n'),
            truncated: true
          });
          currentSection = [];
          inRelevantSection = false;
        }
      }
    }

    if (currentSection.length > 0) {
      relevantSections.push({
        start: sectionStartLine,
        end: lines.length - 1,
        content: currentSection.join('\n')
      });
    }

    if (relevantSections.length === 0) {
      const header = lines.slice(0, 50).join('\n');
      return {
        content: header + '\n\n<!-- 未找到与当前模块相关的内容 -->',
        lines: header.split('\n').length + 1,
        slices: [{ type: 'html-header' }],
        fileType: 'html'
      };
    }

    const slicedContent = relevantSections.map(s => s.content).join('\n\n<!-- --- 分隔 --- -->\n\n');

    return {
      content: slicedContent,
      lines: slicedContent.split('\n').length,
      slices: [{ type: 'html', sections: relevantSections.length }],
      fileType: 'html'
    };
  }

  /**
   * 切片 CSS/SCSS/Less 文件
   */
  sliceStylesFile(content, filePath, keywords) {
    const keywordVariants = this.generateKeywordVariants(keywords);
    console.log(`[CodeSlicer] Styles 关键词变体:`, keywordVariants);

    return this.sliceCssContent(content, keywordVariants);
  }

  /**
   * 切片 CSS 内容
   */
  sliceCssContent(content, keywords) {
    const lines = content.split('\n');
    const relevantSections = [];
    let currentSection = [];
    let inRelevantSection = false;
    let braceCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      braceCount += (line.match(/{/g) || []).length;
      braceCount -= (line.match(/}/g) || []).length;

      const isRelevantStart = this.isRelevantLine(trimmed, keywords);

      if (isRelevantStart && !inRelevantSection) {
        inRelevantSection = true;
        const contextStart = Math.max(0, i - 2);
        currentSection = lines.slice(contextStart, i + 1);
        braceCount = 0;
        braceCount += (line.match(/{/g) || []).length;
        braceCount -= (line.match(/}/g) || []).length;
      } else if (inRelevantSection) {
        currentSection.push(line);

        if (braceCount === 0 && currentSection.length > 3) {
          relevantSections.push({
            content: currentSection.join('\n')
          });
          currentSection = [];
          inRelevantSection = false;
        }

        if (currentSection.length > 50) {
          relevantSections.push({
            content: currentSection.join('\n'),
            truncated: true
          });
          currentSection = [];
          inRelevantSection = false;
          braceCount = 0;
        }
      }
    }

    if (currentSection.length > 0) {
      relevantSections.push({ content: currentSection.join('\n') });
    }

    if (relevantSections.length === 0) {
      const header = lines.slice(0, 30).join('\n');
      return {
        content: header + '\n\n/* 未找到与当前模块相关的样式 */',
        lines: header.split('\n').length + 1,
        slices: [{ type: 'css-header' }]
      };
    }

    const slicedContent = relevantSections.map(s => s.content).join('\n\n/* --- 分隔 --- */\n\n');

    return {
      content: slicedContent,
      lines: slicedContent.split('\n').length,
      slices: [{ type: 'css', rules: relevantSections.length }]
    };
  }

  /**
   * 切片 JSON 文件
   */
  sliceJsonFile(content, keywords) {
    const keywordVariants = this.generateKeywordVariants(keywords);
    console.log(`[CodeSlicer] JSON 关键词变体:`, keywordVariants);

    try {
      const jsonObj = JSON.parse(content);

      // 如果是对象，提取相关键
      if (typeof jsonObj === 'object' && jsonObj !== null) {
        const filteredObj = this.filterJsonByKey(jsonObj, keywordVariants);

        const slicedContent = JSON.stringify(filteredObj, null, 2);

        return {
          content: slicedContent,
          lines: slicedContent.split('\n').length,
          slices: [{ type: 'json', keys: Object.keys(filteredObj).length }],
          fileType: 'json'
        };
      }
    } catch (e) {
      console.warn(`[CodeSlicer] JSON 解析失败: ${e.message}`);
    }

    // 解析失败，返回前 50 行
    const lines = content.split('\n');
    const header = lines.slice(0, 50).join('\n');

    return {
      content: header + '\n\n// JSON 解析失败或未找到相关内容',
      lines: header.split('\n').length + 1,
      slices: [{ type: 'json-header' }],
      fileType: 'json'
    };
  }

  /**
   * 根据 JSON 键过滤
   */
  filterJsonByKey(obj, keywords, depth = 0) {
    if (depth > 5) return obj; // 防止过深递归

    if (Array.isArray(obj)) {
      return obj.map(item => this.filterJsonByKey(item, keywords, depth + 1));
    }

    if (typeof obj === 'object' && obj !== null) {
      const filtered = {};
      for (const key of Object.keys(obj)) {
        const isRelevant = keywords.some(kw =>
          key.toLowerCase().includes(kw.toLowerCase()) ||
          kw.toLowerCase().includes(key.toLowerCase())
        );

        if (isRelevant) {
          filtered[key] = obj[key];
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          // 递归处理嵌套对象
          const nested = this.filterJsonByKey(obj[key], keywords, depth + 1);
          if (Object.keys(nested).length > 0) {
            filtered[key] = nested;
          }
        }
      }
      return filtered;
    }

    return obj;
  }

  /**
   * 切片多语言文件
   */
  sliceI18nFile(content, keywords, ext = '') {
    const lines = content.split('\n');
    const relevantEntries = [];
    let currentEntry = [];
    let inRelevantEntry = false;

    const keywordVariants = this.generateKeywordVariants(keywords);
    console.log(`[CodeSlicer] I18n 关键词变体:`, keywordVariants);

    // 多语言文件常见模式
    const entryPatterns = {
      // Dart/JS Map 模式
      map: /^\s*['"]([^'"]+)['"]:\s*['"]/,
      // JS 对象模式
      object: /^\s*([a-zA-Z_$][\w$]*)\s*:\s*['"`]/,
      // Vue i18n 模式
      vuei18n: /^\s*([a-zA-Z_$][\w$]*)\s*:\s*{/,
    };

    for (let i = 0; i < Math.min(lines.length, 3000); i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // 检查是否是新的条目
      let keyMatch = null;
      for (const pattern of Object.values(entryPatterns)) {
        keyMatch = trimmed.match(pattern);
        if (keyMatch) break;
      }

      if (keyMatch) {
        const key = keyMatch[1];

        const isRelevant = keywordVariants.some(kw => {
          const kwLower = kw.toLowerCase();
          const keyLower = key.toLowerCase();
          return keyLower.includes(kwLower) || kwLower.includes(keyLower);
        });

        if (isRelevant) {
          inRelevantEntry = true;
          currentEntry = [line];
        } else {
          if (inRelevantEntry && currentEntry.length > 0) {
            relevantEntries.push(currentEntry.join('\n'));
          }
          inRelevantEntry = false;
          currentEntry = [];
        }
      } else if (inRelevantEntry) {
        currentEntry.push(line);
        if (currentEntry.length > 3 || trimmed.endsWith(',') || trimmed === '}') {
          relevantEntries.push(currentEntry.join('\n'));
          inRelevantEntry = false;
          currentEntry = [];
        }
      }
    }

    if (currentEntry.length > 0) {
      relevantEntries.push(currentEntry.join('\n'));
    }

    if (relevantEntries.length === 0) {
      const header = this.extractFileHeader(lines.slice(0, 100));
      return {
        content: header + '\n\n// 未找到与当前模块相关的翻译条目',
        lines: header.split('\n').length + 1,
        slices: [{ type: 'i18n-header', entries: 0 }],
        fileType: 'i18n'
      };
    }

    let slicedContent = '// 以下是该多语言文件中与当前模块相关的翻译条目\n\n';
    slicedContent += relevantEntries.join('\n');

    console.log(`[CodeSlicer] I18n 文件提取了 ${relevantEntries.length} 个相关翻译条目`);

    return {
      content: slicedContent,
      lines: slicedContent.split('\n').length,
      slices: [{ type: 'i18n', entries: relevantEntries.length }],
      fileType: 'i18n'
    };
  }

  /**
   * 切片路由配置文件
   */
  sliceRoutesFile(content, keywords, ext = '') {
    const lines = content.split('\n');
    const relevantSections = [];
    let currentSection = [];
    let inRelevantSection = false;
    let sectionStartLine = 0;

    const keywordVariants = this.generateKeywordVariants(keywords);
    console.log(`[CodeSlicer] Routes 关键词变体:`, keywordVariants);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      const isRelevantStart = this.isRelevantLine(trimmed, keywordVariants);

      if (isRelevantStart && !inRelevantSection) {
        inRelevantSection = true;
        sectionStartLine = i;
        const contextStart = Math.max(0, i - 5);
        currentSection = lines.slice(contextStart, i + 1);
      } else if (inRelevantSection) {
        currentSection.push(line);

        if (this.isRouteSectionEnd(trimmed, currentSection.length)) {
          relevantSections.push({
            start: sectionStartLine,
            end: i,
            content: currentSection.join('\n')
          });
          currentSection = [];
          inRelevantSection = false;
        }

        if (currentSection.length > 100) {
          relevantSections.push({
            start: sectionStartLine,
            end: i,
            content: currentSection.join('\n'),
            truncated: true
          });
          currentSection = [];
          inRelevantSection = false;
        }
      }
    }

    if (currentSection.length > 0) {
      relevantSections.push({
        start: sectionStartLine,
        end: lines.length - 1,
        content: currentSection.join('\n')
      });
    }

    if (relevantSections.length === 0) {
      console.log(`[CodeSlicer] Routes 文件未找到相关路由，返回文件头部`);
      const header = this.extractFileHeader(lines.slice(0, 150));
      return {
        content: header + '\n\n// 未找到与当前模块相关的路由配置',
        lines: header.split('\n').length + 1,
        slices: [{ type: 'routes-header', routes: 0 }],
        fileType: 'routes'
      };
    }

    const slicedContent = '// 以下是该路由文件中与当前模块相关的路由配置\n\n' +
      relevantSections.map(s => s.content).join('\n\n// --- 分隔 ---\n\n');

    console.log(`[CodeSlicer] Routes 文件提取了 ${relevantSections.length} 个相关路由`);

    return {
      content: slicedContent,
      lines: slicedContent.split('\n').length,
      slices: [{ type: 'routes', count: relevantSections.length }],
      fileType: 'routes'
    };
  }

  /**
   * 判断路由区域是否结束
   */
  isRouteSectionEnd(line, sectionLength) {
    if ((line.trim() === ',' || line.trim().match(/^\)\s*;?$/)) && sectionLength > 3) {
      return true;
    }
    if (line === '' && sectionLength > 10) {
      return true;
    }
    return false;
  }

  /**
   * 切片常量文件
   */
  sliceConstantsFile(content, keywords, ext) {
    const lines = content.split('\n');
    const relevantConstants = [];

    const keywordVariants = this.generateKeywordVariants(keywords);

    const constPatterns = [
      /const\s+(\w+)\s*=/,
      /final\s+(\w+)\s*=/,
      /static\s+(?:const|final)\s+(\w+)\s*=/,
      /var\s+(\w+)\s*=/,
      /let\s+(\w+)\s*=/,
    ];

    for (let i = 0; i < Math.min(lines.length, 2000); i++) {
      const line = lines[i];

      for (const pattern of constPatterns) {
        const match = line.match(pattern);
        if (match) {
          const constName = match[1];

          const isRelevant = keywordVariants.some(kw =>
            constName.toLowerCase().includes(kw.toLowerCase()) ||
            kw.toLowerCase().includes(constName.toLowerCase())
          );

          if (isRelevant) {
            const contextStart = Math.max(0, i - 2);
            const contextEnd = Math.min(lines.length, i + 3);
            relevantConstants.push(lines.slice(contextStart, contextEnd).join('\n'));
          }
          break;
        }
      }
    }

    if (relevantConstants.length === 0) {
      const header = this.extractFileHeader(lines.slice(0, 50));
      return {
        content: header + '\n\n// 未找到与当前模块相关的常量',
        lines: header.split('\n').length + 1,
        slices: [{ type: 'constants-header', count: 0 }],
        fileType: 'constants'
      };
    }

    const slicedContent = '// 以下是该常量文件中与当前模块相关的常量\n\n' +
      relevantConstants.join('\n\n');

    return {
      content: slicedContent,
      lines: slicedContent.split('\n').length,
      slices: [{ type: 'constants', count: relevantConstants.length }],
      fileType: 'constants'
    };
  }

  /**
   * 切片 API 文件
   */
  sliceAPIFile(content, keywords, ext) {
    return this.sliceJavaScriptFile(content, keywords);
  }

  /**
   * 切片 Store/Storage 状态管理文件
   * 提取与模块相关的 state, actions, getters
   */
  sliceStoreFile(content, keywords, fileType = 'store') {
    const keywordVariants = this.generateKeywordVariants(keywords);
    console.log(`[CodeSlicer] Store/${fileType} 关键词变体:`, keywordVariants);

    const lines = content.split('\n');
    const relevantSections = [];
    let currentSection = [];
    let inRelevantSection = false;
    let sectionStartLine = 0;

    // Store 文件常见模式
    const statePatterns = [
      /state\s*[:=]/, /getState/, /setState/,
      /const\s+state/, /let\s+state/, /var\s+state/,
    ];
    const actionPatterns = [
      /action\s*[:=]/, /actions?\s*[:=]/, /mutations?\s*[:=]/,
      /dispatch\(/, /commit\(/,
      /function\s+\w+/, /const\s+\w+\s*=\s*\(/,
    ];
    const getterPatterns = [
      /getter\s*[:=]/, /getters?\s*[:=]/,
      /computed\s/, /select\w*/,
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      const isRelevantStart = this.isRelevantLine(trimmed, keywordVariants);

      if (isRelevantStart && !inRelevantSection) {
        inRelevantSection = true;
        sectionStartLine = i;
        // 包含更多上下文（state/函数定义前）
        const contextStart = Math.max(0, i - 15);
        currentSection = lines.slice(contextStart, i + 1);
      } else if (inRelevantSection) {
        currentSection.push(line);

        // 检查是否到达函数/定义结束
        const isEnd = (
          // 空行后跟新的定义
          (trimmed === '' && currentSection.length > 10) ||
          // 逗号分隔（对象属性）
          (trimmed === ',' && currentSection.length > 5) ||
          // 闭合大括号
          (trimmed.match(/^\}/) && currentSection.length > 5)
        );

        if (isEnd) {
          relevantSections.push({
            start: sectionStartLine,
            end: i,
            content: currentSection.join('\n')
          });
          currentSection = [];
          inRelevantSection = false;
        }

        // 防止单个区域太大
        if (currentSection.length > 80) {
          relevantSections.push({
            start: sectionStartLine,
            end: i,
            content: currentSection.join('\n'),
            truncated: true
          });
          currentSection = [];
          inRelevantSection = false;
        }
      }
    }

    // 处理未闭合的区域
    if (currentSection.length > 0) {
      relevantSections.push({
        start: sectionStartLine,
        end: lines.length - 1,
        content: currentSection.join('\n')
      });
    }

    if (relevantSections.length === 0) {
      const header = this.extractFileHeader(lines.slice(0, 80));
      return {
        content: header + `\n\n// 未找到与当前模块相关的 ${fileType} 内容`,
        lines: header.split('\n').length + 1,
        slices: [{ type: `${fileType}-header`, sections: 0 }],
        fileType: fileType
      };
    }

    const slicedContent = `// 以下是该 ${fileType} 文件中与当前模块相关的内容\n\n` +
      relevantSections.map(s => s.content).join('\n\n// --- 分隔 ---\n\n');

    console.log(`[CodeSlicer] ${fileType} 文件提取了 ${relevantSections.length} 个相关代码块`);

    return {
      content: slicedContent,
      lines: slicedContent.split('\n').length,
      slices: [{ type: fileType, sections: relevantSections.length }],
      fileType: fileType
    };
  }

  /**
   * 切片 Dart 文件
   */
  sliceDartFile(content, keywords) {
    const lines = content.split('\n');
    const relevantSections = [];
    let currentSection = [];
    let inRelevantSection = false;
    let sectionStartLine = 0;

    const keywordVariants = this.generateKeywordVariants(keywords);

    console.log(`[CodeSlicer] Dart 关键词变体:`, keywordVariants);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      const isRelevantStart = this.isRelevantLine(trimmed, keywordVariants);

      if (isRelevantStart && !inRelevantSection) {
        inRelevantSection = true;
        sectionStartLine = i;
        const contextStart = Math.max(0, i - 20);
        currentSection = lines.slice(contextStart, i + 1);
      } else if (inRelevantSection) {
        currentSection.push(line);

        if (this.isSectionEnd(trimmed, currentSection.length)) {
          relevantSections.push({
            start: sectionStartLine,
            end: i,
            content: currentSection.join('\n')
          });
          currentSection = [];
          inRelevantSection = false;
        }

        if (currentSection.length > 200) {
          relevantSections.push({
            start: sectionStartLine,
            end: i,
            content: currentSection.join('\n'),
            truncated: true
          });
          currentSection = [];
          inRelevantSection = false;
        }
      }
    }

    if (currentSection.length > 0) {
      relevantSections.push({
        start: sectionStartLine,
        end: lines.length - 1,
        content: currentSection.join('\n')
      });
    }

    if (relevantSections.length === 0) {
      console.log(`[CodeSlicer] 未找到相关代码块，返回文件头部`);
      const header = this.extractFileHeader(lines);
      return {
        content: header,
        lines: header.split('\n').length,
        slices: [{ type: 'header', lines: header.split('\n').length }],
        fileType: 'code'
      };
    }

    const slicedContent = relevantSections.map(s => s.content).join('\n\n// --- 分隔 ---\n\n');

    console.log(`[CodeSlicer] 提取了 ${relevantSections.length} 个相关代码块`);

    return {
      content: slicedContent,
      lines: slicedContent.split('\n').length,
      slices: relevantSections.map(s => ({
        type: 'relevant',
        start: s.start,
        end: s.end,
        lines: s.end - s.start + 1
      })),
      fileType: 'code'
    };
  }

  /**
   * 切片 JavaScript/TypeScript 文件
   */
  sliceJavaScriptFile(content, keywords) {
    const lines = content.split('\n');
    const relevantSections = [];
    let currentSection = [];
    let inRelevantSection = false;
    let sectionStartLine = 0;
    let braceCount = 0;

    const keywordVariants = this.generateKeywordVariants(keywords);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      braceCount += (line.match(/{/g) || []).length;
      braceCount -= (line.match(/}/g) || []).length;

      const isRelevantStart = this.isRelevantLine(trimmed, keywordVariants);

      if (isRelevantStart && !inRelevantSection) {
        inRelevantSection = true;
        sectionStartLine = i;
        const contextStart = Math.max(0, i - 10);
        currentSection = lines.slice(contextStart, i + 1);
        braceCount = 0;
        braceCount += (line.match(/{/g) || []).length;
        braceCount -= (line.match(/}/g) || []).length;
      } else if (inRelevantSection) {
        currentSection.push(line);

        if (braceCount === 0 && currentSection.length > 5) {
          relevantSections.push({
            start: sectionStartLine,
            end: i,
            content: currentSection.join('\n')
          });
          currentSection = [];
          inRelevantSection = false;
        }

        if (currentSection.length > 150) {
          relevantSections.push({
            start: sectionStartLine,
            end: i,
            content: currentSection.join('\n'),
            truncated: true
          });
          currentSection = [];
          inRelevantSection = false;
          braceCount = 0;
        }
      }
    }

    if (currentSection.length > 0) {
      relevantSections.push({
        start: sectionStartLine,
        end: lines.length - 1,
        content: currentSection.join('\n')
      });
    }

    if (relevantSections.length === 0) {
      const header = this.extractFileHeader(lines);
      return {
        content: header,
        lines: header.split('\n').length,
        slices: [{ type: 'header', lines: header.split('\n').length }],
        fileType: 'code'
      };
    }

    const slicedContent = relevantSections.map(s => s.content).join('\n\n// --- 分隔 ---\n\n');

    return {
      content: slicedContent,
      lines: slicedContent.split('\n').length,
      slices: [{ type: 'js', sections: relevantSections.length }],
      fileType: 'code'
    };
  }

  /**
   * 通用文件切片
   */
  sliceGenericFile(content, keywords) {
    const lines = content.split('\n');
    const relevantLines = [];
    const keywordVariants = this.generateKeywordVariants(keywords);

    for (const line of lines) {
      if (this.isRelevantLine(line, keywordVariants)) {
        const lineIndex = lines.indexOf(line);
        const contextStart = Math.max(0, lineIndex - 3);
        const contextEnd = Math.min(lines.length, lineIndex + 4);
        for (let i = contextStart; i < contextEnd; i++) {
          if (!relevantLines.includes(lines[i])) {
            relevantLines.push(lines[i]);
          }
        }
      }
    }

    if (relevantLines.length === 0) {
      return {
        content: lines.slice(0, 100).join('\n'),
        lines: Math.min(100, lines.length),
        slices: [{ type: 'header', lines: Math.min(100, lines.length) }],
        fileType: 'generic'
      };
    }

    return {
      content: relevantLines.join('\n'),
      lines: relevantLines.length,
      slices: [{ type: 'keyword-match', lines: relevantLines.length }],
      fileType: 'generic'
    };
  }

  /**
   * 生成关键词变体
   */
  generateKeywordVariants(keywords) {
    const variants = new Set();

    for (const keyword of keywords) {
      if (!keyword) continue;

      // 原始关键词
      variants.add(keyword.toLowerCase());

      // 驼峰转下划线
      variants.add(keyword.replace(/([A-Z])/g, '_$1').replace(/^_/, '').toLowerCase());

      // 下划线转驼峰
      const camelCase = keyword.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      variants.add(camelCase.toLowerCase());

      // 中文转拼音映射
      const pinyinMap = {
        '账号': 'account',
        '账户': 'account',
        '用户': 'user',
        '管理': 'manage',
        '登录': 'login',
        '登入': 'login',
        '注册': 'register',
        '菜单': 'menu',
        '路由': 'route',
        '页面': 'page',
        '首页': 'home',
        '设置': 'settings',
        '配置': 'config',
        '列表': 'list',
        '详情': 'detail',
        '编辑': 'edit',
        '删除': 'delete',
        '新增': 'add',
        '创建': 'create',
      };

      for (const [cn, en] of Object.entries(pinyinMap)) {
        if (keyword.includes(cn)) {
          variants.add(keyword.replace(cn, en).toLowerCase());
          variants.add(en);
        }
      }
    }

    return Array.from(variants);
  }

  /**
   * 判断行是否相关
   */
  isRelevantLine(line, keywords) {
    if (!line || line.startsWith('//') || line.startsWith('/*') || line.startsWith('*')) {
      return false;
    }

    const lowerLine = line.toLowerCase();

    for (const keyword of keywords) {
      if (keyword && lowerLine.includes(keyword.toLowerCase())) {
        return true;
      }
    }

    return false;
  }

  /**
   * 判断是否到达区域结束
   */
  isSectionEnd(line, sectionLength) {
    if (line === '' && sectionLength > 5) {
      return true;
    }

    if (line.match(/^class |^function |^const |^final |^import |^export /) && sectionLength > 10) {
      return true;
    }

    return false;
  }

  /**
   * 提取文件头部
   */
  extractFileHeader(lines) {
    const header = [];
    for (const line of lines) {
      header.push(line);
      if (line.match(/^class |^function |^main\(|^export /)) {
        break;
      }
      if (header.length > 50) break;
    }
    return header.join('\n');
  }

  /**
   * 获取文件扩展名
   */
  getExtension(filePath) {
    const match = filePath.match(/\.(\w+)$/);
    return match ? '.' + match[1] : '';
  }
}

module.exports = CodeSlicer;
