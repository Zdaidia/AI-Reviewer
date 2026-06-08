/**
 * Requirement Analyzer - 增强需求分析器
 *
 * 支持多种需求场景：
 * - 简单UI验证："验证登录页有用户名输入框"
 * - 元素内容验证："检查导航栏包含'首页'链接"
 * - 完整功能需求："用户名3-20字符，密码至少8位"
 * - 流程描述："点击登录后跳转到首页"
 *
 * 设计原则：
 * 1. 提取到什么就用什么，没有的不强制推断
 * 2. 层次化分析：基础信息 -> 详细规则 -> 推断信息
 * 3. 兼容中英文需求描述
 */

class RequirementAnalyzer {
  constructor(options = {}) {
    this.llm = options.llm || null;
    this.enableLLM = options.enableLLM !== false;
  }

  /**
   * 主入口：分析需求文本
   * @param {string} requirementText - 需求文本
   * @param {Object} options - 选项
   * @returns {Object} 分析结果
   */
  async analyze(requirementText, options = {}) {
    const startTime = Date.now();
    const log = options.log || ((msg, data) => console.log(`[RequirementAnalyzer] ${msg}`, data));

    log('开始分析', { length: requirementText?.length || 0 });

    // 初始化结果对象
    const result = {
      // 基础信息
      rawText: requirementText,
      features: [],
      pages: [],

      // UI 元素相关（可能为空）
      uiElements: {
        inputs: [],      // 输入框
        buttons: [],     // 按钮
        links: [],       // 链接
        text: [],        // 文本元素
        containers: [],  // 容器元素
        others: []       // 其他元素
      },

      // 数据字段相关（可能为空）
      dataFields: [],

      // 操作流程（可能为空）
      operations: [],

      // 验证规则（可能为空）
      validations: [],

      // API 相关（可能为空）
      apis: [],

      // 元数据
      analysisType: 'unknown',
      confidence: 0,
      extractedAt: new Date().toISOString()
    };

    if (!requirementText || typeof requirementText !== 'string' || requirementText.trim().length === 0) {
      log('跳过', '需求文本为空');
      result.analysisType = 'empty';
      return result;
    }

    // === 第一层：快速分类 ===
    const category = this.categorizeRequirement(requirementText);
    result.analysisType = category.type;
    log('分类', category.type);

    // === 第二层：根据类型提取信息 ===
    switch (category.type) {
      case 'ui_existence':
        // 场景：验证元素是否存在
        this.extractUIExistence(requirementText, result);
        break;

      case 'ui_content':
        // 场景：验证元素内容
        this.extractUIContent(requirementText, result);
        break;

      case 'form_validation':
        // 场景：表单验证规则
        this.extractFormValidation(requirementText, result);
        break;

      case 'navigation':
        // 场景：页面导航
        this.extractNavigation(requirementText, result);
        break;

      case 'workflow':
        // 场景：操作流程
        this.extractWorkflow(requirementText, result);
        break;

      case 'comprehensive':
        // 场景：综合需求（使用 LLM 或深度分析）
        if (this.enableLLM && this.llm) {
          await this.extractWithLLM(requirementText, result, log);
        } else {
          this.extractComprehensive(requirementText, result);
        }
        break;

      default:
        // 未知类型，使用通用提取
        this.extractGeneric(requirementText, result);
    }

    // === 第三层：补充推断信息 ===
    this.enrichResult(result, requirementText);

    // 计算置信度
    result.confidence = this.calculateConfidence(result);
    result.duration = Date.now() - startTime;

    log('完成', {
      type: result.analysisType,
      uiElements: this.countUIElements(result.uiElements),
      dataFields: result.dataFields.length,
      operations: result.operations.length,
      confidence: result.confidence
    });

    return result;
  }

  /**
   * 第一层：快速分类需求类型
   */
  categorizeRequirement(text) {
    const t = text.toLowerCase();

    // UI 存在性验证
    if (this.matchPatterns(t, [
      '是否有', '是否存在', '包含.*[框钮链]',
      '检查.*存在', '验证.*存在', 'exist', 'has.*input', 'has.*button'
    ])) {
      return { type: 'ui_existence', priority: 'check elements' };
    }

    // UI 内容验证
    if (this.matchPatterns(t, [
      '包含.*["\'].*["\']', '显示.*["\'].*["\']',
      '文本.*为', '标题.*是', '内容.*等于',
      'contains.*text', 'should show', 'should display'
    ])) {
      return { type: 'ui_content', priority: 'verify content' };
    }

    // 表单验证规则
    if (this.matchPatterns(t, [
      '验证规则', '校验', '格式', '长度',
      '必填', '可选', '不能为空',
      '至少.*位', '最多.*字符',
      'validation', 'required', 'format', 'minlength', 'maxlength'
    ])) {
      return { type: 'form_validation', priority: 'validate input' };
    }

    // 页面导航
    if (this.matchPatterns(t, [
      '跳转到', '导航到', '重定向',
      '进入.*页', '打开.*页',
      'navigate to', 'redirect to', 'go to'
    ])) {
      return { type: 'navigation', priority: 'check navigation' };
    }

    // 操作流程
    if (this.matchPatterns(t, [
      '点击.*后', '选择.*然后', '输入.*之后',
      '步骤', '流程', '依次',
      'after click', 'then select', 'workflow'
    ])) {
      return { type: 'workflow', priority: 'test flow' };
    }

    // 综合需求（描述较长，包含多种元素）
    if (text.length > 200 || this.matchPatterns(t, [
      '功能需求', '需求描述',
      '实现.*功能', '支持.*操作',
      'should support', 'feature', 'requirement'
    ])) {
      return { type: 'comprehensive', priority: 'full analysis' };
    }

    return { type: 'generic', priority: 'general' };
  }

  /**
   * 提取 UI 存在性验证
   * 示例："验证登录页有用户名和密码输入框"
   */
  extractUIExistence(text, result) {
    result.features.push('UI元素存在性验证');

    // 提取页面
    const page = this.extractPageName(text);
    if (page) {
      result.pages.push({ name: page, type: 'unknown' });
    }

    // 提取输入框
    const inputPatterns = [
      /输入框|输入域|文本框|文本域|input|textField/i,
      /用户名|账号|username|user/i,
      /密码|password|pwd/i,
      /邮箱|email|邮件/i,
      /手机|电话|phone|mobile/i
    ];

    for (const pattern of inputPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        result.uiElements.inputs.push({
          name: this.inferElementName(matches[0]),
          type: this.inferInputType(matches[0]),
          existenceCheck: true,
          source: 'extracted'
        });
      }
    }

    // 提取按钮
    const buttonPatterns = [
      /["\']?([\u4e00-\u9fa5\w]+)["\']?按钮/g,
      /按钮|button|btn/gi
    ];

    for (const pattern of [/["\']?([\u4e00-\u9fa5\w]+)["\']?按钮/g]) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        result.uiElements.buttons.push({
          name: match[1] || '按钮',
          type: 'button',
          existenceCheck: true,
          source: 'extracted'
        });
      }
    }

    // 提取链接
    const linkPatterns = [
      /["\']?([\u4e00-\u9fa5\w]+)["\']?链接/g,
      /链接|link|anchor/gi
    ];

    for (const pattern of [/["\']?([\u4e00-\u9fa5\w]+)["\']?链接/g]) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        result.uiElements.links.push({
          name: match[1] || '链接',
          type: 'link',
          existenceCheck: true,
          source: 'extracted'
        });
      }
    }

    // 如果没有提取到具体元素，添加通用检查
    if (this.countUIElements(result.uiElements) === 0) {
      // 尝试提取被验证的对象
      const targetMatch = text.match(/验证?(.+?)有|检查?(.+?)存在|确认?(.+?)包含/);
      if (targetMatch) {
        result.uiElements.others.push({
          name: targetMatch[1] || targetMatch[2] || targetMatch[3] || '元素',
          type: 'unknown',
          existenceCheck: true,
          source: 'inferred'
        });
      }
    }
  }

  /**
   * 提取 UI 内容验证
   * 示例："检查导航栏包含'首页'、'关于我们'链接"
   */
  extractUIContent(text, result) {
    result.features.push('UI内容验证');

    // 提取页面或区域
    const containerMatch = text.match(/(.+?)[栏导航区域页]/);
    if (containerMatch) {
      result.uiElements.containers.push({
        name: containerMatch[1],
        type: 'container'
      });
    }

    // 提取预期的文本内容
    const textMatches = text.match(/["\']([^"\']+)["\']/g);
    if (textMatches) {
      for (const match of textMatches) {
        const expectedText = match.replace(/["\']/g, '');
        result.uiElements.text.push({
          expected: expectedText,
          type: 'text',
          contentType: this.inferTextContentType(expectedText),
          source: 'extracted'
        });
      }
    }

    // 提取被验证的元素类型
    if (text.includes('链接') || /link|anchor/i.test(text)) {
      for (const textElem of result.uiElements.text) {
        textElem.elementType = 'link';
      }
    } else if (text.includes('标题') || /title|heading/i.test(text)) {
      for (const textElem of result.uiElements.text) {
        textElem.elementType = 'heading';
      }
    } else if (text.includes('按钮') || /button|btn/i.test(text)) {
      for (const textElem of result.uiElements.text) {
        textElem.elementType = 'button';
      }
    }

    // 如果没有引用文本，直接提取关键词
    if (result.uiElements.text.length === 0) {
      // 提取中文词汇作为验证目标
      const chineseWords = text.match(/[\u4e00-\u9fa5]{2,}/g) || [];
      for (const word of chineseWords.slice(0, 10)) {
        if (!this.isStopWord(word)) {
          result.uiElements.text.push({
            expected: word,
            type: 'text',
            source: 'extracted'
          });
        }
      }
    }
  }

  /**
   * 提取表单验证规则
   * 示例："用户名3-20字符，密码至少8位，包含字母和数字"
   */
  extractFormValidation(text, result) {
    result.features.push('表单验证');

    // 提取字段和验证规则
    const fieldPatterns = [
      // 字段 + 长度规则
      [
        /(.+?)(?:字段|输入框)?(\d+)-(\d+)字符/,
        (matches) => ({
          name: matches[1],
          rule: 'length',
          minLength: matches[2] ? parseInt(matches[2]) : null,
          maxLength: matches[3] ? parseInt(matches[3]) : null,
          required: false
        })
      ],
      // 字段 + 最小长度
      [
        /(.+?)(?:字段|输入框)?至少(\d+)字符/,
        (matches) => ({
          name: matches[1],
          rule: 'minLength',
          value: parseInt(matches[2]),
          required: false
        })
      ],
      // 字段 + 必填
      [
        /(.+?)(?:字段|输入框)?为?必填|不能为空/,
        (matches) => ({
          name: matches[1] || '字段',
          rule: 'required',
          value: true,
          required: true
        })
      ],
      // 字段 + 格式
      [
        /(.+?)(?:字段|输入框)?格式为(.+?)(?:，|。|$)/,
        (matches) => ({
          name: matches[1],
          rule: 'pattern',
          value: matches[2],
          pattern: this.guessPattern(matches[2])
        })
      ],
      // 字段 + 类型
      [
        /(.+?)(?:字段|输入框)?类型为(.+?)(?:，|。|$)/,
        (matches) => ({
          name: matches[1],
          rule: 'type',
          value: matches[2],
          dataType: this.mapDataType(matches[2])
        })
      ]
    ];

    for (const [pattern, extractor] of fieldPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const field = extractor(match);
        if (field) {
          result.dataFields.push(field);
          result.uiElements.inputs.push({
            name: field.name,
            type: field.dataType || this.inferInputType(field.name),
            required: field.required,
            validation: field.rule
          });
        }
      }
    }

    // 提取验证消息
    const messagePatterns = [
      /提示["\']?([^"\']+)["\']?/g,
      /错误["\']?([^"\']+)["\']?/g,
      /警告["\']?([^"\']+)["\']?/g
    ];

    for (const pattern of messagePatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        result.validations.push({
          type: 'errorMessage',
          message: match[1],
          source: 'extracted'
        });
      }
    }

    // 如果没有提取到字段，尝试从常见字段名推断
    if (result.dataFields.length === 0) {
      this.inferCommonFields(text, result);
    }
  }

  /**
   * 提取导航信息
   * 示例："点击登录后跳转到首页"
   */
  extractNavigation(text, result) {
    result.features.push('页面导航验证');

    // 提取起始页面
    const fromPage = this.extractPageName(text);
    if (fromPage) {
      result.pages.push({ name: fromPage, type: 'source' });
    }

    // 提取目标页面
    const toPagePatterns = [
      /跳转到(.+?)(?:页|$|，)/,
      /导航到(.+?)(?:页|$|，)/,
      /进入(.+?)(?:页|$|，)/,
      /打开(.+?)(?:页|$|，)/,
      /navigate to (.+?)(?:\s|page|,|$)/i,
      /go to (.+?)(?:\s|page|,|$)/i
    ];

    for (const pattern of toPagePatterns) {
      const match = text.match(pattern);
      if (match) {
        result.pages.push({
          name: match[1].trim(),
          type: 'destination'
        });
        result.operations.push({
          type: 'navigate',
          from: fromPage || 'current',
          to: match[1].trim(),
          trigger: this.extractTriggerAction(text),
          source: 'extracted'
        });
        break;
      }
    }

    // 提取触发动作
    const trigger = this.extractTriggerAction(text);
    if (trigger) {
      result.uiElements.buttons.push({
        name: trigger,
        type: 'button',
        action: 'click',
        source: 'inferred'
      });
    }
  }

  /**
   * 提取操作流程
   * 示例："输入用户名，点击下一步，输入密码，点击登录"
   */
  extractWorkflow(text, result) {
    result.features.push('操作流程测试');

    // 分割操作步骤
    const steps = this.splitWorkflowSteps(text);

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const operation = this.parseOperationStep(step, i);
      if (operation) {
        result.operations.push(operation);

        // 根据操作类型添加 UI 元素
        if (operation.type === 'input') {
          result.uiElements.inputs.push({
            name: operation.target,
            type: this.inferInputType(operation.target),
            source: 'inferred'
          });
        } else if (operation.type === 'click') {
          result.uiElements.buttons.push({
            name: operation.target,
            type: 'button',
            source: 'inferred'
          });
        } else if (operation.type === 'select') {
          result.uiElements.inputs.push({
            name: operation.target,
            type: 'dropdown',
            source: 'inferred'
          });
        }
      }
    }

    // 提取最终预期结果
    const resultMatch = text.match(/(应该|则|然后|将|显示|出现|then|should)(.+)$/);
    if (resultMatch) {
      result.expectedResults = [{
        step: steps.length,
        description: resultMatch[2].trim(),
        source: 'extracted'
      }];
    }
  }

  /**
   * 综合需求提取（不使用 LLM）
   */
  extractComprehensive(text, result) {
    // 组合所有提取方法
    this.extractUIExistence(text, result);
    this.extractFormValidation(text, result);
    this.extractNavigation(text, result);
    this.extractWorkflow(text, result);

    // 去重
    this.deduplicateResult(result);
  }

  /**
   * 使用 LLM 进行深度分析
   */
  async extractWithLLM(text, result, log) {
    try {
      log('LLM分析', '正在使用 AI 深度分析需求...');

      const prompt = `请分析以下需求描述，提取测试所需的结构化信息。

需求描述：
${text}

请以 JSON 格式返回以下信息（如果需求中没有提及某项信息，对应字段返回空数组）：
{
  "features": ["功能1", "功能2"],
  "pages": [{"name": "页面名", "type": "类型"}],
  "uiElements": {
    "inputs": [{"name": "输入框名", "type": "text/password/email", "required": true/false}],
    "buttons": [{"name": "按钮名", "action": "click"}],
    "links": [{"name": "链接名", "url": "路径"}],
    "text": [{"expected": "预期文本", "elementType": "link/button/heading"}]
  },
  "dataFields": [{
    "name": "字段名",
    "rule": "required/pattern/minLength/maxLength/type",
    "value": "规则值"
  }],
  "operations": [{
    "step": 1,
    "type": "input/click/select/wait",
    "target": "目标元素",
    "value": "输入值"
  }],
  "validations": [{
    "type": "errorMessage/successMessage",
    "message": "消息内容"
  }]
}

只返回 JSON，不要包含其他解释文字。`;

      const response = await this.llm.chat('requirement_analysis', [
        { role: 'user', content: prompt }
      ], { temperature: 0.3, maxTokens: 3000 });

      let aiResult = null;
      if (response && response.content) {
        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            aiResult = JSON.parse(jsonMatch[0]);
            log('LLM成功', `AI 分析完成`);
          } catch (e) {
            log('LLM警告', `JSON 解析失败: ${e.message}`);
          }
        }
      }

      if (aiResult) {
        // 合并 AI 分析结果
        Object.assign(result, aiResult);
        result.analysisSource = 'llm';
      } else {
        // LLM 失败，回退到规则提取
        this.extractComprehensive(text, result);
        result.analysisSource = 'rule_fallback';
      }
    } catch (error) {
      log('LLM错误', `分析失败: ${error.message}`);
      this.extractComprehensive(text, result);
      result.analysisSource = 'error_fallback';
    }
  }

  /**
   * 通用提取（当无法确定类型时）
   */
  extractGeneric(text, result) {
    result.features.push('通用功能测试');

    // 尝试提取所有可能的信息
    this.extractUIExistence(text, result);
    this.extractUIContent(text, result);
    this.extractFormValidation(text, result);
    this.extractNavigation(text, result);

    // 如果仍然没有提取到有用信息，创建基础测试
    if (this.countUIElements(result.uiElements) === 0 &&
        result.dataFields.length === 0 &&
        result.operations.length === 0) {
      result.features.push('基础功能验证');
      result.testHint = text; // 保存原始需求作为测试提示
    }
  }

  // ========== 辅助方法 ==========

  /**
   * 模式匹配（支持多个模式）
   */
  matchPatterns(text, patterns) {
    for (const pattern of patterns) {
      const regex = new RegExp(pattern, 'i');
      if (regex.test(text)) {
        return true;
      }
    }
    return false;
  }

  /**
   * 提取页面名称
   */
  extractPageName(text) {
    const pagePatterns = [
      /(.+?)页面?/,
      /(.+?)页$/,
      /(?:在|到|进入|打开)(.+?)(?:页|时|后)/,
      /(.+?)(?:登录|首页|详情|列表|管理)/
    ];

    for (const pattern of pagePatterns) {
      const match = text.match(pattern);
      if (match && match[1] && !['应该', '然后', '点击'].includes(match[1])) {
        return match[1].trim() + '页';
      }
    }
    return null;
  }

  /**
   * 提取触发动作
   */
  extractTriggerAction(text) {
    const patterns = [
      /点击(.+?)(?:按钮|后|，|$)/,
      /选择(.+?)(?:后|，|$)/,
      /press (.+?)/i,
      /click (.+?)/i
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }
    return null;
  }

  /**
   * 分割工作流步骤
   */
  splitWorkflowSteps(text) {
    // 按分隔符分割
    const separators = [
      /，然后?/g,
      /，?接着/g,
      /，?之后/g,
      /，?再/g,
      / then /gi,
      / after /gi,
      /，/g
    ];

    let steps = [text];
    for (const sep of separators) {
      steps = steps.flatMap(s => s.split(sep)).map(s => s.trim());
    }

    return steps.filter(s => s.length > 2);
  }

  /**
   * 解析单个操作步骤
   */
  parseOperationStep(step, index) {
    const operation = {
      step: index + 1,
      description: step,
      type: 'unknown',
      target: null,
      value: null
    };

    // 输入操作
    const inputMatch = step.match(/(?:在)?(.+?)(?:输入框|框)?输入(.+)|输入(.+?)(?:到|至)(.+?)(?:输入框|框)/);
    if (inputMatch) {
      operation.type = 'input';
      operation.target = inputMatch[1] || inputMatch[4];
      operation.value = inputMatch[2] || inputMatch[3];
      return operation;
    }

    // 点击操作
    const clickMatch = step.match(/点击(.+?)(?:按钮|链接|后|，|$)/);
    if (clickMatch) {
      operation.type = 'click';
      operation.target = clickMatch[1];
      return operation;
    }

    // 选择操作
    const selectMatch = step.match(/选择(.+?)(?:后|，|$)/);
    if (selectMatch) {
      operation.type = 'select';
      operation.target = selectMatch[1];
      return operation;
    }

    // 等待操作
    if (/等待|wait/i.test(step)) {
      operation.type = 'wait';
      const timeMatch = step.match(/(\d+)(?:秒|ms|milliseconds?)/);
      operation.value = timeMatch ? parseInt(timeMatch[1]) : 1000;
      return operation;
    }

    return operation;
  }

  /**
   * 推断输入框类型
   */
  inferInputType(name) {
    if (!name) return 'text';
    const n = name.toLowerCase();
    if (/密码|password|pwd/.test(n)) return 'password';
    if (/邮箱|email|邮件/.test(n)) return 'email';
    if (/电话|手机|phone|mobile/.test(n)) return 'tel';
    if (/数字|number|count/.test(n)) return 'number';
    return 'text';
  }

  /**
   * 推断元素名称
   */
  inferElementName(text) {
    const nameMap = {
      '用户名': 'username',
      '账号': 'account',
      '密码': 'password',
      '邮箱': 'email',
      '电话': 'phone',
      '手机': 'mobile'
    };
    for (const [key, value] of Object.entries(nameMap)) {
      if (text.includes(key)) {
        return value;
      }
    }
    return text;
  }

  /**
   * 推断文本内容类型
   */
  inferTextContentType(text) {
    if (/首页|主页|home/.test(text)) return 'navigation';
    if (/关于|about/.test(text)) return 'information';
    if (/登录|login/.test(text)) return 'action';
    if (/退出|logout/.test(text)) return 'action';
    return 'content';
  }

  /**
   * 推断正则模式
   */
  guessPattern(description) {
    const patternMap = {
      '邮箱': '^[\\w-\\.]+@([\\w-]+\\.)+[\\w-]{2,4}$',
      'email': '^[\\w-\\.]+@([\\w-]+\\.)+[\\w-]{2,4}$',
      '手机': '^1[3-9]\\d{9}$',
      '电话': '^[0-9\\-\\+]+$',
      '数字': '^\\d+$',
      '字母': '^[a-zA-Z]+$'
    };
    for (const [key, value] of Object.entries(patternMap)) {
      if (description.toLowerCase().includes(key)) {
        return value;
      }
    }
    return null;
  }

  /**
   * 映射数据类型
   */
  mapDataType(typeDesc) {
    const t = typeDesc.toLowerCase();
    if (/数字|int|integer|number/.test(t)) return 'number';
    if (/文本|string|text/.test(t)) return 'text';
    if (/布尔|bool|boolean/.test(t)) return 'boolean';
    if (/日期|date|time/.test(t)) return 'datetime';
    return 'text';
  }

  /**
   * 推断常见字段
   */
  inferCommonFields(text, result) {
    const commonFields = [
      { name: '用户名', rule: 'required' },
      { name: '密码', rule: 'minLength', value: 6 },
      { name: '邮箱', rule: 'pattern', value: 'email' }
    ];

    for (const field of commonFields) {
      if (text.includes(field.name)) {
        result.dataFields.push(field);
      }
    }
  }

  /**
   * 判断是否为停用词
   */
  isStopWord(word) {
    const stopWords = ['验证', '检查', '确认', '应该', '需要', '包含', '具有', '包含'];
    return stopWords.includes(word);
  }

  /**
   * 统计 UI 元素数量
   */
  countUIElements(uiElements) {
    return (uiElements.inputs?.length || 0) +
           (uiElements.buttons?.length || 0) +
           (uiElements.links?.length || 0) +
           (uiElements.text?.length || 0) +
           (uiElements.others?.length || 0);
  }

  /**
   * 去重结果
   */
  deduplicateResult(result) {
    // 去重 UI 元素
    const seen = new Set();
    for (const type of ['inputs', 'buttons', 'links']) {
      if (result.uiElements[type]) {
        result.uiElements[type] = result.uiElements[type].filter(item => {
          const key = item.name + item.type;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }
    }
  }

  /**
   * 补充推断信息
   */
  enrichResult(result, originalText) {
    // 如果有操作但没有页面，推断当前页面
    if (result.operations.length > 0 && result.pages.length === 0) {
      const pageName = this.extractPageName(originalText);
      if (pageName) {
        result.pages.unshift({ name: pageName, type: 'current' });
      }
    }
  }

  /**
   * 计算置信度
   */
  calculateConfidence(result) {
    let score = 0;
    let maxScore = 0;

    // UI 元素
    maxScore += 30;
    score += Math.min(30, this.countUIElements(result.uiElements) * 10);

    // 数据字段
    maxScore += 25;
    score += Math.min(25, result.dataFields.length * 8);

    // 操作步骤
    maxScore += 25;
    score += Math.min(25, result.operations.length * 8);

    // 页面信息
    maxScore += 10;
    score += Math.min(10, result.pages.length * 5);

    // 验证规则
    maxScore += 10;
    score += Math.min(10, result.validations.length * 3);

    return Math.round((score / maxScore) * 100);
  }

  /**
   * 格式化分析结果为测试用例提示
   */
  formatForTestGeneration(analysis) {
    const sections = [];

    sections.push(`## 需求分析结果`);
    sections.push(`类型: ${analysis.analysisType}`);
    sections.push(`置信度: ${analysis.confidence}%`);

    if (analysis.pages.length > 0) {
      sections.push(`\n### 涉及页面`);
      analysis.pages.forEach(p => sections.push(`- ${p.name} (${p.type})`));
    }

    if (this.countUIElements(analysis.uiElements) > 0) {
      sections.push(`\n### UI 元素`);
      if (analysis.uiElements.inputs?.length) {
        sections.push('**输入框:**');
        analysis.uiElements.inputs.forEach(i => sections.push(`- ${i.name} (${i.type})${i.required ? ' *必填*' : ''}`));
      }
      if (analysis.uiElements.buttons?.length) {
        sections.push('**按钮:**');
        analysis.uiElements.buttons.forEach(b => sections.push(`- ${b.name}`));
      }
      if (analysis.uiElements.text?.length) {
        sections.push('**预期文本:**');
        analysis.uiElements.text.forEach(t => sections.push(`- "${t.expected}" (${t.elementType || '文本'})`));
      }
    }

    if (analysis.dataFields.length > 0) {
      sections.push(`\n### 数据字段与验证`);
      analysis.dataFields.forEach(f => {
        sections.push(`- **${f.name}**: ${f.rule}${f.value ? ` = ${f.value}` : ''}`);
      });
    }

    if (analysis.operations.length > 0) {
      sections.push(`\n### 操作流程`);
      analysis.operations.forEach(op => {
        sections.push(`${op.step}. ${op.type}: ${op.target}${op.value ? ` = ${op.value}` : ''}`);
      });
    }

    return sections.join('\n');
  }
}

module.exports = RequirementAnalyzer;
