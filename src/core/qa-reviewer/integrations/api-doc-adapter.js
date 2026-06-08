/**
 * API 文档适配器
 *
 * 负责解析和检索 API 文档，支持按模块查找相关 API
 */

class APIDocAdapter {
  // 模块关键词映射表 - 用于从需求文本中自动识别模块
  static MODULE_KEYWORDS = {
    'account_management': ['账号', '账户', '用户管理', '用户列表', 'account', 'user', '管理員', '使用者', 'User Management', 'Account management'],
    'login': ['登录', '登入', '认证', '登录页面', 'login', 'signin', 'auth', 'Authentication'],
    'role_management': ['角色', '权限', 'role', 'permission', '權限'],
    'order_management': ['订单', 'order', '訂單'],
    'product_management': ['商品', '产品', 'product', '商品管理'],
    'payment': ['支付', '付款', 'payment', '支付方式'],
    'cart': ['购物车', 'cart', '購物車'],
    'profile': ['个人资料', '个人信息', 'profile', '个人中心'],
    'settings': ['设置', '配置', 'setting', 'config', '系統設置'],
    'security': ['安全', '账号安全', '解锁', '锁定', 'security', 'Account Security', 'unlock', 'lock'],
    'password': ['密码', '重置密码', '修改密码', 'password', 'Password Management', 'reset']
  };

  constructor(options = {}) {
    this.projectPath = options.projectPath || null;
    this.apis = []; // 存储解析后的 API 定义
    this.apiIndex = new Map(); // 按模块索引的 API
    this.documentModules = []; // 存储文档中定义的模块结构（顶部模块）
  }

  /**
   * 加载并解析 API 文档
   * @param {string} content - API 文档内容
   * @param {string} format - 文档格式 (markdown, json, openapi)
   */
  async loadAPIDocument(content, format = 'markdown') {
    console.log('[APIDocAdapter] 开始解析 API 文档，格式:', format);

    if (format === 'json') {
      this.apis = this.parseJSON(content);
    } else if (format === 'openapi') {
      this.apis = this.parseOpenAPI(content);
    } else {
      // 默认按 Markdown 格式解析
      this.apis = this.parseMarkdown(content);
    }

    // 构建索引
    this.buildIndex();

    console.log(`[APIDocAdapter] 解析完成，共 ${this.apis.length} 个 API`);
    // 输出所有 API 的摘要信息
    console.log('[APIDocAdapter] 所有 API 列表:');
    this.apis.forEach((api, index) => {
      console.log(`  ${index + 1}. [${api.method || 'GET'}] ${api.path} - ${api.title || '(无标题)'} (模块: ${api.module || '未分类'})`);
    });
    return this.apis;
  }

  /**
   * 解析 Markdown 格式的 API 文档
   */
  parseMarkdown(content) {
    const apis = [];
    // 统一换行符格式
    const normalizedContent = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = normalizedContent.split('\n');
    let currentAPI = null;
    let inParameters = false;
    let inSuccessResponse = false;
    let collectingDescription = false;
    let currentModule = null; // 当前所属模块（从文档顶部识别）

    // 首先解析文档顶部的模块结构
    this.parseDocumentStructure(normalizedContent);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const originalLine = lines[i];

      // 检测文档顶部的模块标题 (# 或 ## 开头，包含"模块"或具体模块名)
      const moduleMatch = line.match(/^#{1,2}\s*(.+?)(?:\s*模块|\s*Module|\s*模块：|\s*Module:)?$/);
      if (moduleMatch) {
        const potentialModule = moduleMatch[1].trim();
        // 检查是否是已知的模块名称模式
        if (this.isModuleTitle(potentialModule)) {
          currentModule = potentialModule;
          console.log(`[APIDocAdapter] 识别到模块: ${currentModule}`);
          continue;
        }
      }

      // 检测另一种格式：模块名后跟冒号或分隔符
      // 只匹配 # 或 ## 开头，不包括 ###（### 是 API 标题）
      if (line.match(/^#{1,2}\s*[\u4e00-\u9fa5a-zA-Z]+模块|^#{1,2}\s*Module\s*[\u4e00-\u9fa5a-zA-Z]+/)) {
        const moduleFromLine = line.replace(/^#+\s*/, '').replace(/模块.*$/, '').replace(/Module.*$/, '').trim();
        if (moduleFromLine && moduleFromLine.length < 20 && !line.startsWith('###')) {
          currentModule = moduleFromLine;
          console.log(`[APIDocAdapter] 识别到模块(格式2): ${currentModule}`);
          continue;
        }
      }

      // 检测 API 章节标题 (### N. Title (action: xxx))
      const headerMatch = line.match(/^###\s+\d+\.\s+(.+?)(?:\s*\((?:action|Action):\s*(\w+)\))?$/);
      if (headerMatch) {
        if (currentAPI) {
          apis.push(currentAPI);
        }
        currentAPI = {
          title: headerMatch[1].trim(),
          action: headerMatch[2] || null,
          method: null,
          path: null,
          description: '',
          parameters: [],
          responseFields: [],
          modules: []
        };
        // 从标题中提取模块
        currentAPI.modules = this.extractModules(headerMatch[1] + ' ' + (headerMatch[2] || ''));
        // 添加文档顶部识别的当前模块
        if (currentModule && !currentAPI.modules.includes(currentModule)) {
          currentAPI.modules.push(currentModule);
        }
        // 记录所属模块名称（用于后续精确匹配）
        currentAPI.module = currentModule || currentAPI.modules[0] || '未分类';
        inParameters = false;
        inSuccessResponse = false;
        collectingDescription = true;
        continue;
      }

      // 如果没有 currentAPI，跳过
      if (!currentAPI) {
        continue;
      }

      // 收集描述信息（在 Endpoint 之前的非空行）
      if (collectingDescription && line && !line.startsWith('**') && !line.startsWith('#')) {
        if (currentAPI.description) {
          currentAPI.description += ' ' + line;
        } else {
          currentAPI.description = line;
        }
        // 限制描述长度
        if (currentAPI.description.length > 500) {
          collectingDescription = false;
        }
        continue;
      }

      // 解析 Endpoint
      if (line.includes('**Endpoint:**')) {
        collectingDescription = false;
        // 匹配 `METHOD path` 或 METHOD path 格式
        const endpointMatch = line.match(/\*\*Endpoint:\*\*\s*`?([A-Z]+)\s+([^``\s]+(?:\s+[^`\s]+)*)`?/);
        if (endpointMatch) {
          currentAPI.method = endpointMatch[1];
          currentAPI.path = endpointMatch[2].trim();
        }
        continue;
      }

      // 解析请求方法（备用格式）
      if (line.match(/^(GET|POST|PUT|DELETE|PATCH)\s+/i) && !currentAPI.method) {
        collectingDescription = false;
        const methodMatch = line.match(/^([A-Z]+)\s+(.+)/i);
        if (methodMatch) {
          currentAPI.method = methodMatch[1].toUpperCase();
          currentAPI.path = methodMatch[2].trim();
        }
        continue;
      }

      // 检测部分开始
      if (line.includes('**Parameters**') || line.includes('**Path Parameters**') || line.includes('**Query Parameters**')) {
        inParameters = true;
        inSuccessResponse = false;
        collectingDescription = false;
        continue;
      }

      if (line.includes('**Success Response**') || line.includes('**Response**')) {
        inSuccessResponse = true;
        inParameters = false;
        collectingDescription = false;
        continue;
      }

      if (line.includes('**Error Responses**') || line.includes('**Error Response**')) {
        inSuccessResponse = false;
        inParameters = false;
        collectingDescription = false;
        continue;
      }

      // 解析参数（列表格式）
      if (inParameters && line.startsWith('- `')) {
        const paramMatch = line.match(/-\s*`([^`]+)`\s+\(([^)]+)\)/);
        if (paramMatch) {
          const paramName = paramMatch[1];
          const typeInfo = paramMatch[2];
          const parts = typeInfo.split(',').map(p => p.trim());
          const required = parts.some(p => p.toLowerCase() === 'required');
          currentAPI.parameters.push({
            name: paramName,
            type: parts[0] || 'string',
            required: required,
            description: ''
          });
        }
        continue;
      }

      // 解析参数（描述续行）
      if (inParameters && line && !line.startsWith('-') && !line.startsWith('**')) {
        if (currentAPI.parameters.length > 0) {
          const lastParam = currentAPI.parameters[currentAPI.parameters.length - 1];
          if (lastParam && line.includes(':')) {
            const descParts = line.split(':').slice(1).join(':').trim();
            lastParam.description = descParts;
          }
        }
      }

      // 解析响应字段（从 JSON 示例中提取）
      if (inSuccessResponse && line.includes('"data":')) {
        // 尝试解析 JSON 结构
        try {
          const jsonStart = i;
          let braceCount = 0;
          let jsonStr = '';

          for (let j = i; j < lines.length; j++) {
            const l = lines[j];
            jsonStr += l;
            braceCount += (l.match(/{/g) || []).length;
            braceCount -= (l.match(/}/g) || []).length;

            if (braceCount === 0 && jsonStr.trim().endsWith('}')) {
              i = j; // 更新主循环索引
              break;
            }
          }

          // 提取字段名
          const fieldMatches = jsonStr.match(/"(\w+)":/g);
          if (fieldMatches) {
            fieldMatches.forEach(fm => {
              const fieldName = fm.replace(/":/g, '');
              if (fieldName !== 'requestId' && fieldName !== 'name' &&
                  fieldName !== 'type' && fieldName !== 'code' &&
                  !currentAPI.responseFields.find(f => f.name === fieldName)) {
                currentAPI.responseFields.push({
                  name: fieldName,
                  type: 'unknown',
                  description: ''
                });
              }
            });
          }
        } catch (e) {
          // JSON 解析失败，忽略
        }
      }
    }

    if (currentAPI) {
      apis.push(currentAPI);
    }

    return apis;
  }

  /**
   * 判断标题是否是 API 定义
   */
  isAPITitle(title) {
    const apiKeywords = [
      'API', '接口', 'api', 'interface',
      '登录', '注册', '获取', '查询', '创建', '更新', '删除',
      'login', 'register', 'get', 'create', 'update', 'delete'
    ];
    return apiKeywords.some(kw => title.toLowerCase().includes(kw));
  }

  /**
   * 从标题提取 API 信息
   */
  extractAPIFromTitle(title) {
    return {
      title,
      method: null,
      path: null,
      description: '',
      parameters: [],
      responseFields: [],
      modules: this.extractModules(title)
    };
  }

  /**
   * 从文本中提取模块名称
   */
  extractModules(text) {
    const modules = [];
    const moduleKeywords = [
      '用户', '账号', '订单', '商品', '支付', '购物车',
      'user', 'account', 'order', 'product', 'payment', 'cart',
      '管理', '列表', '详情', '编辑', '新增', '删除'
    ];

    const chinese = text.match(/[\u4e00-\u9fa5]+/g) || [];
    const english = text.toLowerCase().match(/[a-z]{2,}/g) || [];
    const allWords = [...chinese, ...english];

    allWords.forEach(word => {
      if (moduleKeywords.some(kw => word.includes(kw) || kw.includes(word))) {
        if (!modules.includes(word)) {
          modules.push(word);
        }
      }
    });

    return modules.length > 0 ? modules : ['默认'];
  }

  /**
   * 解析 JSON 格式的 API 文档
   */
  parseJSON(content) {
    try {
      const data = JSON.parse(content);
      const apis = [];

      if (Array.isArray(data)) {
        data.forEach(item => {
          apis.push({
            title: item.name || item.title || item.summary || 'API',
            method: item.method || 'GET',
            path: item.path || item.url || '/',
            description: item.description || '',
            parameters: item.parameters || item.params || [],
            responseFields: item.response || item.responses || [],
            modules: item.modules || this.extractModules(item.name || '')
          });
        });
      } else if (data.apis) {
        return this.parseJSON(JSON.stringify(data.apis));
      }

      return apis;
    } catch (e) {
      console.error('[APIDocAdapter] JSON 解析失败:', e.message);
      return [];
    }
  }

  /**
   * 解析 OpenAPI/Swagger 格式
   */
  parseOpenAPI(content) {
    try {
      const doc = JSON.parse(content);
      const apis = [];

      if (doc.paths) {
        Object.entries(doc.paths).forEach(([path, methods]) => {
          Object.entries(methods).forEach(([method, details]) => {
            apis.push({
              title: details.summary || details.operationId || `${method} ${path}`,
              method: method.toUpperCase(),
              path,
              description: details.description || '',
              parameters: details.parameters || [],
              responseFields: details.responses || [],
              modules: this.extractModules(path + ' ' + (details.summary || ''))
            });
          });
        });
      }

      return apis;
    } catch (e) {
      console.error('[APIDocAdapter] OpenAPI 解析失败:', e.message);
      return [];
    }
  }

  /**
   * 构建索引
   */
  buildIndex() {
    this.apiIndex.clear();

    this.apis.forEach((api, index) => {
      api.modules.forEach(module => {
        if (!this.apiIndex.has(module)) {
          this.apiIndex.set(module, []);
        }
        this.apiIndex.get(module).push(api);
      });
    });

    console.log(`[APIDocAdapter] 索引构建完成，模块数: ${this.apiIndex.size}`);
  }

  /**
   * 根据模块查找相关 API
   * @param {string} moduleName - 模块名称
   * @returns {Array} 相关的 API 列表
   */
  findAPIsByModule(moduleName) {
    if (!moduleName || moduleName === '默认') {
      return this.apis.slice(0, 10); // 返回前10个作为默认
    }

    const results = [];
    const added = new Set();

    // 处理复合模块名（如 "User Management / Account management"）
    // 拆分成多个部分进行匹配
    let searchTerms = [moduleName];
    if (moduleName.includes('/')) {
      searchTerms = moduleName.split('/').map(s => s.trim());
      searchTerms.push(moduleName); // 同时保留完整的模块名
    }

    console.log(`[APIDocAdapter] 模块 "${moduleName}" 的搜索项:`, searchTerms);

    // 对每个搜索项进行匹配
    for (const searchTerm of searchTerms) {
      // 生成多种命名变体进行匹配
      const variants = this.generateNameVariants(searchTerm);

      // 1. 精确匹配所有变体
      variants.forEach(variant => {
        if (this.apiIndex.has(variant)) {
          this.apiIndex.get(variant).forEach(api => {
            const key = `${api.method}-${api.path}`;
            if (!added.has(key)) {
              added.add(key);
              results.push(api);
            }
          });
        }
      });

      // 2. 模糊匹配：索引中的模块名与变体互相包含
      this.apiIndex.forEach((apis, module) => {
        variants.forEach(variant => {
          const moduleLower = module.toLowerCase();
          const variantLower = variant.toLowerCase();
          if (moduleLower.includes(variantLower) || variantLower.includes(moduleLower)) {
            apis.forEach(api => {
              const key = `${api.method}-${api.path}`;
              if (!added.has(key)) {
                added.add(key);
                results.push(api);
              }
            });
          }
        });
      });

      // 3. 在 API 的标题、路径、描述、module 字段中搜索所有变体
      this.apis.forEach(api => {
        const searchText = `${api.title} ${api.path} ${api.description} ${api.module || ''}`.toLowerCase();
        variants.forEach(variant => {
          if (searchText.includes(variant.toLowerCase())) {
            const key = `${api.method}-${api.path}`;
            if (!added.has(key)) {
              added.add(key);
              results.push(api);
            }
          }
        });
      });
    }

    console.log(`[APIDocAdapter] 模块 "${moduleName}" 找到 ${results.length} 个相关 API`);
    if (results.length > 0) {
      console.log('[APIDocAdapter] 匹配的 API:');
      results.forEach((api, index) => {
        console.log(`  ${index + 1}. [${api.method || 'GET'}] ${api.path} - ${api.title || '(无标题)'} (模块: ${api.module || '未分类'})`);
      });
    } else {
      console.log('[APIDocAdapter] 未找到匹配的 API');
      console.log('[APIDocAdapter] 可用的模块:', Array.from(this.apiIndex.keys()));
    }
    return results;
  }

  /**
   * 生成模块名的多种变体用于匹配
   * @param {string} name - 原始模块名
   * @returns {Array<string>} 名称变体列表
   */
  generateNameVariants(name) {
    const variants = new Set([name]);

    // 处理连字符和下划线
    const withUnderscore = name.replace(/-/g, '_');
    const withDash = name.replace(/_/g, '-');
    variants.add(withUnderscore);
    variants.add(withDash);

    // 处理驼峰命名
    const camelCase = name.replace(/[-_]([a-z])/g, (_, c) => c.toUpperCase());
    const firstLower = camelCase.charAt(0).toLowerCase() + camelCase.slice(1);
    const firstUpper = camelCase.charAt(0).toUpperCase() + camelCase.slice(1);
    variants.add(camelCase);
    variants.add(firstLower);
    variants.add(firstUpper);

    // 常见关键词映射
    const keywordMap = {
      'account': ['user', '用户', '账号', '使用者'],
      'management': ['manage', 'admin', '管理', '管理员'],
      'auth': ['authentication', 'login', '认证', '登录'],
      'role': ['permission', '权限', '角色'],
      'setting': ['config', 'configuration', '设置', '配置'],
      'profile': ['user', '个人', '资料', '信息']
    };

    // 根据关键词添加相关变体
    Object.entries(keywordMap).forEach(([key, synonyms]) => {
      if (name.toLowerCase().includes(key)) {
        synonyms.forEach(syn => {
          variants.add(name.replace(new RegExp(key, 'gi'), syn));
          variants.add(syn);
        });
      }
    });

    return Array.from(variants);
  }

  /**
   * 根据多个模块查找相关 API
   * @param {Array<string>} moduleNames - 模块名称列表
   * @returns {Array} 相关的 API 列表
   */
  findAPIsByModules(moduleNames) {
    const results = [];
    const added = new Set();

    moduleNames.forEach(moduleName => {
      const apis = this.findAPIsByModule(moduleName);
      apis.forEach(api => {
        const key = `${api.method}:${api.path}`;
        if (!added.has(key)) {
          added.add(key);
          results.push(api);
        }
      });
    });

    return results;
  }

  /**
   * 格式化 API 为 LLM 提示词
   * @param {Array} apis - API 列表
   * @returns {string} 格式化的 API 文档
   */
  formatAPIsForPrompt(apis) {
    if (!apis || apis.length === 0) {
      return '';
    }

    let output = '\n## 相关 API 文档\n\n';

    apis.forEach((api, index) => {
      output += `### ${index + 1}. ${api.title}\n`;
      output += `- **方法**: ${api.method || 'GET'}\n`;
      output += `- **路径**: ${api.path || '/'}\n`;

      if (api.description) {
        output += `- **描述**: ${api.description}\n`;
      }

      if (api.parameters && api.parameters.length > 0) {
        output += `\n**请求参数**:\n`;
        api.parameters.forEach(param => {
          const required = param.required ? ' (必填)' : ' (可选)';
          output += `- \`${param.name}\`: ${param.type || 'string'}${required} - ${param.description || ''}\n`;
        });
      }

      if (api.responseFields && api.responseFields.length > 0) {
        output += `\n**响应字段**:\n`;
        api.responseFields.forEach(field => {
          output += `- \`${field.name}\`: ${field.type || 'string'} - ${field.description || ''}\n`;
        });
      }

      output += '\n';
    });

    return output;
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      totalAPIs: this.apis.length,
      totalModules: this.apiIndex.size,
      methods: this.apis.reduce((acc, api) => {
        acc[api.method] = (acc[api.method] || 0) + 1;
        return acc;
      }, {})
    };
  }

  /**
   * 判断标题是否是模块标题
   * @param {string} title - 标题文本
   * @returns {boolean}
   */
  isModuleTitle(title) {
    // 排除数字编号格式的标题（如 "1. 获取账号列表" 或 "1. 获取账号列表 (action: list)"）
    if (title.match(/^\d+\.\s+/) || title.match(/\(action:\s*\w+\)$/)) {
      return false;
    }

    // 排除明显不是模块的标题
    const excludeKeywords = ['API', '接口', '接口列表', 'API List', '说明', 'Introduction', '文档', 'Documentation'];
    if (excludeKeywords.some(kw => title.toLowerCase().includes(kw.toLowerCase()))) {
      return false;
    }

    // 检查是否包含模块关键词
    const moduleKeywords = ['模块', 'Module', '管理', 'Management', '系统', 'System'];
    if (moduleKeywords.some(kw => title.includes(kw))) {
      return true;
    }

    // 检查是否是已知的模块名（基于 MODULE_KEYWORDS）
    for (const [moduleKey, keywords] of Object.entries(APIDocAdapter.MODULE_KEYWORDS)) {
      if (keywords.some(kw => title.includes(kw) || kw.includes(title))) {
        return true;
      }
    }

    // 标题较短且不包含排除词，可能是模块
    return title.length < 20 && !title.includes('。');
  }

  /**
   * 解析文档结构，提取顶部的模块定义
   * @param {string} content - 文档内容
   */
  parseDocumentStructure(content) {
    this.documentModules = [];
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      // 检测一级或二级标题作为模块
      const match = trimmed.match(/^#{1,2}\s*(.+)$/);
      if (match) {
        const title = match[1].trim();
        if (this.isModuleTitle(title)) {
          this.documentModules.push({
            name: title,
            line: lines.indexOf(line) + 1
          });
        }
      }
      // 遇到第一个 API 定义就停止（说明模块部分结束）
      if (trimmed.match(/^###\s+\d+\./)) {
        break;
      }
    }

    if (this.documentModules.length > 0) {
      console.log(`[APIDocAdapter] 识别到 ${this.documentModules.length} 个文档模块:`, this.documentModules.map(m => m.name));
    }
  }

  /**
   * 根据需求文本中的关键词自动查找相关 API
   * @param {string} requirementText - 需求文本
   * @returns {Array} 相关的 API 列表
   */
  findAPIsByKeywords(requirementText) {
    console.log('[APIDocAdapter] 根据需求关键词查找相关 API...');

    // 1. 首先尝试从需求第一行提取模块名（格式：模块名：需求描述）
    const firstLine = requirementText.split('\n')[0];
    const moduleFromHeader = firstLine.split(/[:：]/)[0].trim();
    console.log(`[APIDocAdapter] 从需求标题提取模块: "${moduleFromHeader}"`);

    // 2. 检查是否直接匹配文档中的模块
    let matchedModule = null;
    for (const docModule of this.documentModules) {
      if (docModule.name.includes(moduleFromHeader) || moduleFromHeader.includes(docModule.name)) {
        matchedModule = docModule.name;
        console.log(`[APIDocAdapter] 匹配到文档模块: "${matchedModule}"`);
        break;
      }
    }

    // 3. 如果没有直接匹配，使用关键词映射（支持中英文）
    if (!matchedModule) {
      for (const [moduleKey, keywords] of Object.entries(APIDocAdapter.MODULE_KEYWORDS)) {
        for (const keyword of keywords) {
          if (requirementText.includes(keyword)) {
            // 尝试在文档模块中找到对应的模块名
            for (const docModule of this.documentModules) {
              if (keywords.some(kw => docModule.name.toLowerCase().includes(kw.toLowerCase()) ||
                                   kw.toLowerCase().includes(docModule.name.toLowerCase()))) {
                matchedModule = docModule.name;
                console.log(`[APIDocAdapter] 关键词 "${keyword}" 匹配到模块: "${matchedModule}"`);
                break;
              }
            }
            if (matchedModule) break;
          }
        }
        if (matchedModule) break;
      }
    }

    // 4. 如果找到模块，返回该模块的所有 API
    if (matchedModule) {
      const relatedAPIs = this.findAPIsByModule(matchedModule);
      console.log(`[APIDocAdapter] 模块 "${matchedModule}" 找到 ${relatedAPIs.length} 个相关 API`);
      return relatedAPIs;
    }

    // 5. 回退方案：使用提取的模块名查找
    const extractedModules = this.extractModules(requirementText);
    if (extractedModules.length > 0 && extractedModules[0] !== '默认') {
      console.log(`[APIDocAdapter] 使用提取的模块: ${extractedModules.join(', ')}`);
      return this.findAPIsByModules(extractedModules.slice(0, 3));
    }

    // 6. 最后回退：返回前 10 个 API
    console.log('[APIDocAdapter] 未找到匹配的模块，返回前 10 个 API');
    return this.apis.slice(0, 10);
  }

  /**
   * 获取所有文档中定义的模块
   * @returns {Array<string>} 模块名称列表
   */
  getDocumentModules() {
    return this.documentModules.map(m => m.name);
  }
}

module.exports = APIDocAdapter;
