/**
 * Context Builder
 *
 * 为 AI 执行构建上下文信息
 * 整合 Project Memory 和当前执行状态
 *
 * 提供的上下文：
 * - Routes: 路由信息
 * - Pages: 页面结构
 * - Components: 组件信息
 * - Selectors: 选择器映射
 * - Current State: 当前执行状态
 */

class ContextBuilder {
  constructor(options = {}) {
    this.memory = options.memory || null;
    this.projectPath = options.projectPath || null;
    this.cache = new Map();
    this.cacheEnabled = options.cacheEnabled !== false;
  }

  /**
   * 构建完整上下文
   * @param {Object} options - 构建选项
   * @returns {Object} 完整上下文
   */
  async buildContext(options = {}) {
    const {
      url = null,
      testGoal = null,
      executionHistory = [],
      currentStep = null,
    } = options;

    this.log('info', '构建上下文', { url, testGoal });

    const context = {
      timestamp: Date.now(),
      project: null,
      routes: {},
      pages: {},
      components: {},
      selectors: {},
      current: {
        url,
        page: null,
        state: null,
      },
      execution: {
        goal: testGoal,
        history: executionHistory,
        step: currentStep,
      },
    };

    // 如果有 Memory，提取项目信息
    if (this.memory) {
      try {
        context.project = await this.extractProjectInfo();
        context.routes = await this.extractRoutes();
        context.pages = await this.extractPages();
        context.components = await this.extractComponents();
        context.selectors = await this.extractSelectors();
      } catch (error) {
        this.log('warn', 'Memory 提取失败', { error: error.message });
      }
    }

    // 分析当前 URL
    if (url) {
      context.current = await this.analyzeCurrentState(url, context);
    }

    this.log('info', '上下文构建完成', {
      hasProject: !!context.project,
      routesCount: Object.keys(context.routes).length,
      pagesCount: Object.keys(context.pages).length,
      componentsCount: Object.keys(context.components).length,
    });

    return context;
  }

  /**
   * 提取项目信息
   * @returns {Object} 项目信息
   */
  async extractProjectInfo() {
    const cacheKey = 'project-info';

    if (this.cacheEnabled && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    if (!this.memory || !this.memory.semantic) {
      return null;
    }

    try {
      // 从 Memory 获取项目概览
      const overview = await this.memory.semantic.getProjectOverview();

      const projectInfo = {
        name: overview?.name || 'Unknown',
        type: overview?.type || 'Unknown',
        framework: overview?.framework || 'Unknown',
        language: overview?.language || 'Unknown',
        structure: overview?.structure || {},
      };

      if (this.cacheEnabled) {
        this.cache.set(cacheKey, projectInfo);
      }

      return projectInfo;
    } catch (error) {
      this.log('warn', '项目信息提取失败', { error: error.message });
      return null;
    }
  }

  /**
   * 提取路由信息
   * @returns {Object} 路由映射
   */
  async extractRoutes() {
    const cacheKey = 'routes';

    if (this.cacheEnabled && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    if (!this.memory || !this.memory.semantic) {
      return this.defaultRoutes();
    }

    try {
      // 从 Memory 获取路由信息
      const codeGraph = await this.memory.semantic.getCodeGraph();
      const routes = {};

      // 分析路由文件（假设存在）
      // 实际实现需要根据项目结构调整
      if (codeGraph?.routes) {
        for (const route of codeGraph.routes) {
          routes[route.path] = {
            component: route.component,
            page: route.page,
            permissions: route.permissions || [],
            metadata: route.metadata || {},
          };
        }
      }

      const result = Object.keys(routes).length > 0 ? routes : this.defaultRoutes();

      if (this.cacheEnabled) {
        this.cache.set(cacheKey, result);
      }

      return result;
    } catch (error) {
      this.log('warn', '路由提取失败，使用默认', { error: error.message });
      return this.defaultRoutes();
    }
  }

  /**
   * 提取页面信息
   * @returns {Object} 页面映射
   */
  async extractPages() {
    const cacheKey = 'pages';

    if (this.cacheEnabled && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    if (!this.memory || !this.memory.semantic) {
      return this.defaultPages();
    }

    try {
      const codeGraph = await this.memory.semantic.getCodeGraph();
      const pages = {};

      // 分析页面组件
      if (codeGraph?.pages) {
        for (const page of codeGraph.pages) {
          pages[page.name] = {
            path: page.path,
            component: page.component,
            elements: page.elements || [],
            actions: page.actions || [],
            state: page.state || {},
          };
        }
      }

      const result = Object.keys(pages).length > 0 ? pages : this.defaultPages();

      if (this.cacheEnabled) {
        this.cache.set(cacheKey, result);
      }

      return result;
    } catch (error) {
      this.log('warn', '页面提取失败，使用默认', { error: error.message });
      return this.defaultPages();
    }
  }

  /**
   * 提取组件信息
   * @returns {Object} 组件映射
   */
  async extractComponents() {
    const cacheKey = 'components';

    if (this.cacheEnabled && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    if (!this.memory || !this.memory.semantic) {
      return this.defaultComponents();
    }

    try {
      const codeGraph = await this.memory.semantic.getCodeGraph();
      const components = {};

      // 分析组件
      if (codeGraph?.components) {
        for (const component of codeGraph.components) {
          components[component.name] = {
            selector: component.selector,
            props: component.props || [],
            state: component.state || {},
            methods: component.methods || [],
            variants: component.variants || [],
          };
        }
      }

      const result = Object.keys(components).length > 0 ? components : this.defaultComponents();

      if (this.cacheEnabled) {
        this.cache.set(cacheKey, result);
      }

      return result;
    } catch (error) {
      this.log('warn', '组件提取失败，使用默认', { error: error.message });
      return this.defaultComponents();
    }
  }

  /**
   * 提取选择器映射
   * @returns {Object} 选择器映射
   */
  async extractSelectors() {
    const cacheKey = 'selectors';

    if (this.cacheEnabled && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    if (!this.memory || !this.memory.semantic) {
      return this.defaultSelectors();
    }

    try {
      // 从 Memory 或配置文件中提取选择器
      // 实际实现可能需要读取专门的测试配置文件
      const selectors = {
        // 通用选择器
        common: {
          button: 'button, [role="button"], .btn',
          input: 'input, textarea, [contenteditable="true"]',
          select: 'select',
          link: 'a[href]',
          table: 'table',
          list: 'ul, ol, .list',
          item: '.item, li',
        },
        // 页面特定选择器
        pages: {},
        // 组件特定选择器
        components: {},
      };

      const result = selectors;

      if (this.cacheEnabled) {
        this.cache.set(cacheKey, result);
      }

      return result;
    } catch (error) {
      this.log('warn', '选择器提取失败，使用默认', { error: error.message });
      return this.defaultSelectors();
    }
  }

  /**
   * 分析当前状态
   * @param {string} url - 当前 URL
   * @param {Object} context - 上下文
   * @returns {Object} 当前状态
   */
  async analyzeCurrentState(url, context) {
    const current = {
      url,
      page: null,
      route: null,
      state: 'unknown',
    };

    // 匹配路由
    for (const [routePath, routeInfo] of Object.entries(context.routes)) {
      if (url.includes(routePath)) {
        current.route = routePath;
        current.page = routeInfo.page;
        current.state = 'matched';
        break;
      }
    }

    // 匹配页面
    if (!current.page) {
      for (const [pageName, pageInfo] of Object.entries(context.pages)) {
        if (url.includes(pageInfo.path)) {
          current.page = pageName;
          current.state = 'matched';
          break;
        }
      }
    }

    return current;
  }

  /**
   * 格式化上下文为 Prompt
   * @param {Object} context - 上下文
   * @returns {string} 格式化的 Prompt
   */
  formatContextAsPrompt(context) {
    let prompt = '';

    // 项目信息
    if (context.project) {
      prompt += `## Project Information\n`;
      prompt += `- Name: ${context.project.name}\n`;
      prompt += `- Type: ${context.project.type}\n`;
      prompt += `- Framework: ${context.project.framework}\n\n`;
    }

    // 路由信息
    if (Object.keys(context.routes).length > 0) {
      prompt += `## Routes\n`;
      for (const [path, info] of Object.entries(context.routes)) {
        prompt += `- ${path} → ${info.page || info.component}\n`;
      }
      prompt += `\n`;
    }

    // 页面信息
    if (Object.keys(context.pages).length > 0) {
      prompt += `## Pages\n`;
      for (const [name, info] of Object.entries(context.pages)) {
        prompt += `### ${name}\n`;
        prompt += `- Path: ${info.path}\n`;
        if (info.elements && info.elements.length > 0) {
          prompt += `- Elements: ${info.elements.join(', ')}\n`;
        }
        prompt += `\n`;
      }
    }

    // 组件信息
    if (Object.keys(context.components).length > 0) {
      prompt += `## Components\n`;
      for (const [name, info] of Object.entries(context.components)) {
        prompt += `### ${name}\n`;
        prompt += `- Selector: ${info.selector}\n`;
        if (info.props && info.props.length > 0) {
          prompt += `- Props: ${info.props.join(', ')}\n`;
        }
        prompt += `\n`;
      }
    }

    // 选择器映射
    if (Object.keys(context.selectors).length > 0) {
      prompt += `## Selectors\n`;
      prompt += `\`\`\`\n`;
      prompt += JSON.stringify(context.selectors, null, 2);
      prompt += `\n\`\`\`\n\n`;
    }

    // 当前状态
    if (context.current) {
      prompt += `## Current State\n`;
      prompt += `- URL: ${context.current.url}\n`;
      prompt += `- Page: ${context.current.page || 'Unknown'}\n`;
      prompt += `- Route: ${context.current.route || 'Unknown'}\n`;
      prompt += `- State: ${context.current.state}\n\n`;
    }

    return prompt;
  }

  /**
   * 默认路由
   */
  defaultRoutes() {
    return {
      '/': { page: 'HomePage', component: 'Home' },
      '/login': { page: 'LoginPage', component: 'Login' },
      '/cases': { page: 'CaseListPage', component: 'CaseList' },
      '/cases/:id': { page: 'CaseDetailPage', component: 'CaseDetail' },
      '/dashboard': { page: 'DashboardPage', component: 'Dashboard' },
    };
  }

  /**
   * 默认页面
   */
  defaultPages() {
    return {
      HomePage: {
        path: '/',
        component: 'Home',
        elements: ['header', 'footer', 'navigation'],
      },
      LoginPage: {
        path: '/login',
        component: 'Login',
        elements: ['username-input', 'password-input', 'login-button'],
      },
      CaseListPage: {
        path: '/cases',
        component: 'CaseList',
        elements: ['ListView', 'CaseItem', 'SearchBar', 'FilterPanel'],
      },
      CaseDetailPage: {
        path: '/cases/:id',
        component: 'CaseDetail',
        elements: ['DetailHeader', 'DetailContent', 'ActionButtons'],
      },
      DashboardPage: {
        path: '/dashboard',
        component: 'Dashboard',
        elements: ['StatsCard', 'Chart', 'Table'],
      },
    };
  }

  /**
   * 默认组件
   */
  defaultComponents() {
    return {
      ListView: {
        selector: '.list-view, .case-list',
        props: ['items', 'loading'],
      },
      CaseItem: {
        selector: '.case-item, .list-item',
        props: ['case', 'onClick'],
      },
      SearchBar: {
        selector: '.search-bar, .search-input',
        props: ['value', 'onSearch'],
      },
      FilterPanel: {
        selector: '.filter-panel, .filters',
        props: ['filters', 'onFilterChange'],
      },
    };
  }

  /**
   * 默认选择器
   */
  defaultSelectors() {
    return {
      common: {
        button: 'button, [role="button"], .btn',
        input: 'input, textarea, [contenteditable="true"]',
        select: 'select',
        link: 'a[href]',
      },
      pages: {
        login: {
          username: '#username, [name="username"]',
          password: '#password, [name="password"]',
          submit: '#login-button, button[type="submit"]',
        },
        cases: {
          list: '.case-list, .list-view',
          item: '.case-item, .list-item',
          search: '.search-bar, input[type="search"]',
        },
      },
      components: {
        ListView: '.list-view',
        CaseItem: '.case-item',
        SearchBar: '.search-bar',
      },
    };
  }

  /**
   * 清除缓存
   */
  clearCache() {
    this.cache.clear();
    this.log('info', '缓存已清除');
  }

  /**
   * 日志
   */
  log(level, message, data = {}) {
    const logMethod = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    logMethod(`[ContextBuilder] ${message}`, data);
  }
}

module.exports = ContextBuilder;
