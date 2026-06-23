/**
 * 需求分析整理模块 - 提示词模板
 *
 * 定义 LLM 分析、问题生成、需求完善、新问题检查的提示词
 * 重写版：增加分类维度枚举、projectType适配、JSON输出强约束、三段式问题结构
 */

class PromptTemplates {
  /**
   * 构建需求分析提示词（发现不清晰处）
   * @param {Object} analyzedData - 分析后的数据
   * @param {Array} confirmedIssues - 已确认的共通问题
   * @param {string} projectType - 项目类型（flutter/vue/react/angular/html）
   * @returns {Array} OpenAI messages 格式
   */
  static buildAnalysisPrompt(analyzedData, confirmedIssues = [], projectType = '', language = 'zh-TW') {
    const requirementTexts = PromptTemplates._summarizeRequirements(analyzedData);
    const confirmedIssuesText = PromptTemplates._summarizeConfirmedIssues(confirmedIssues);
    const projectTypeHint = projectType ? PromptTemplates._getProjectTypeHint(projectType) : '';
    const outputLangHint = PromptTemplates._getOutputLangHint(language);

    const systemPrompt = `你是一位资深的需求分析师，专门负责审查需求文档和设计稿，发现其中不清晰、模糊、无法直接实作的地方。

你的任务是：
1. 仔细阅读所有需求来源的数据（需求文档、Figma 设计、其他文件）
2. 参考已确认的共通问题，看是否能解决当前需求的不清晰处
3. 找出所有不清晰、有歧义、缺少关键信息、无法直接转为实作规格的地方
4. 生成一份清晰的问题清单，帮助需求方补充缺失信息

${projectTypeHint}

${outputLangHint}

## 问题分类维度

每个问题必须归类到以下维度之一：
- 功能需求：功能描述不完整、流程缺失、状态未定义
- 界面需求：UI规格缺失、文案不明确、交互方式未指定
- 数据需求：字段规则缺失、数据格式不明确、边界值未定义
- 交互需求：操作流程不明确、反馈机制缺失、异常处理未定义
- 安全需求：权限控制缺失、数据保护不明确、输入验证未定义
- 性能需求：响应时间未指定、并发处理未定义、资源限制不明确

## 问题描述格式（三段式）

每个问题必须包含：
- 原文引用：引用需求原文中的具体文字或字段
- 问题定位：精确指出哪个需求、哪个字段、哪个场景存在不清晰之处
- 建议方案：给出具体的补充建议或确认事项（而非笼统的"需要确认")

## 严重程度
- high: 阻塞实作，必须先确认才能开始开发
- medium: 影响质量，建议确认后再实作
- low: 可以后续补充，不影响核心流程

## 已确认的共通问题参考规则
- 如果某个不清晰之处已经被已确认的共通问题解答，不要重复列入问题清单
- 在问题中标注"参考已确认问题：XXX"
- 如果已确认问题与当前需求相关（需要同步开发），也要注明

## 输出格式（严格约束）

你必须输出有效的JSON数组，不要在JSON前后添加任何文字、解释或注释。
直接输出数组，不要用 \`\`\`json\`\`\` 包裹。

示例输出：
[
  {
    "id": 1,
    "reqId": "需求编号（如果有）",
    "category": "功能需求/界面需求/数据需求/交互需求/安全需求/性能需求",
    "question": "具体问题描述",
    "severity": "high/medium/low",
    "suggestion": "建议的解决方案或需要确认的具体事项",
    "context": "需求原文中的具体引用文字",
    "refersToConfirmedIssue": "参考的已确认问题编号或 null"
  }
]

如果没有发现任何不清晰之处，输出空数组 []`;

    const userPrompt = `## 需求来源数据

${requirementTexts}

${confirmedIssuesText ? `## 已确认的共通问题（作为参考）

${confirmedIssuesText}` : ''}

请仔细分析以上需求，找出所有不清晰、无法实作的地方，按指定 JSON 格式输出问题清单。`;

    return [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];
  }

  /**
   * 构建需求完善提示词（根据回复完善需求）
   * @param {Array} questionList - 问题清单
   * @param {Array} replies - 回复数据
   * @param {Object} analyzedData - 原始需求格式化数据（含 sheets/figma/localFiles 等）
   * @param {Array} confirmedIssues - 已确认的共通问题
   * @param {string} language - 输出语言
   */
  static buildRefinePrompt(questionList, replies, analyzedData, confirmedIssues = [], language = 'zh-TW') {
    // 构建问题→模块映射
    const questionModules = PromptTemplates._identifyQuestionModules(questionList, analyzedData);
    const questionModuleMap = {};
    for (const q of questionList) {
      for (const mod of questionModules) {
        // 简单关联：如果问题 context 包含模块名，标记该模块
        if (q.context && q.context.includes(mod)) {
          questionModuleMap[q.id] = mod;
        }
      }
    }

    const questionsText = questionList.map(q => {
      const reply = replies.find(r => r.id == q.id || r.question === q.question);
      const replyText = reply?.reply || reply?.回复 || '(未回复)';
      const moduleTag = questionModuleMap[q.id] || '';
      return `### 问题 ${q.id}${moduleTag ? ` (${moduleTag})` : ''}\n- 问题: ${q.question}\n- 分类: ${q.category}\n- 严重程度: ${q.severity}\n- 回复: ${replyText}`;
    }).join('\n---\n');

    // 从问题清单提取涉及的模块名（已在上方声明 questionModules）
    const questionModulesText = questionModules.length > 0
      ? questionModules.join('、')
      : '(无法自动识别，请根据问题内容判断)';

    // 原始需求全文
    const originalRequirementsText = analyzedData
      ? PromptTemplates._summarizeRequirements(analyzedData)
      : '(原始需求数据未提供)';

    const confirmedIssuesText = confirmedIssues.length > 0
      ? PromptTemplates._summarizeConfirmedIssues(confirmedIssues)
      : '';

    const systemPrompt = `你是一位资深的需求分析师，负责将问题和回复整合为完整的需求规格文件。

整合规则：
1. 保留原文结构：不要遗漏任何已有需求点，按模块分组保留
2. 逐项整合回复：将每个回复中的确认信息精准嵌入到对应需求描述中
3. 格式一致性：确保每个功能点都有以下四个维度（如果缺失则标注"待确认"）：
   - 描述：功能的具体描述（整合了回复确认的信息）
   - 验收标准：明确的、可验证的验收条件
   - UI规范：界面要求（文案、布局、交互方式）
   - 数据验证：字段规则（格式、边界值、必填/选填）
4. 标注置信度：对于自动推断而非明确回复的内容，标注 [推断] 和 [建议人工确认]
5. 共通需求整合：如果下方提供了已确认的共通问题，必须根据需求内容判断哪些共通需求与当前页面/模块相关，将相关的共通需求整合到对应模块的功能点中（例如：页面有表格，则表格无数据时的显示规则、搜索条件保留规则等共通需求必须写入该模块的验收标准或UI规范中）

分区处理规则：
- 有问题的模块（下方"本次有问题的模块"中列出的）：整合问题回复，完善需求描述，补充缺失的验收标准、UI规范、数据验证
- 无问题的模块（未在"本次有问题的模块"中列出的）：仅做四维度结构化整理，不增改原文内容和含义，推断部分标注 [推断] 和 [建议人工确认]，原文已有信息忠实保留
- 所有模块都要检查是否涉及共通需求（如表格、表单、查询等场景），将相关共通需求嵌入对应功能点

${PromptTemplates._getRefineLangHint(language)}

输出格式：Markdown 结构化格式，如下：

# 需求名称

## 模块1名称
### 功能1
- 描述：（整合了回复确认的信息）
- 验收标准：AC1, AC2, AC3
- UI规范：界面要求
- 数据验证：字段规则

### 功能2
- 描述：...
- 验收标准：...

## 共通需求（来自已确认问题）
### 共通问题1
- 描述：问题描述
- 解决方案：确认的解决方案
- 验收标准：相关验收条件`;

    const userPrompt = `## 原始需求原文（完整数据，按模块分组）

${originalRequirementsText}

${confirmedIssuesText ? `## 已确认的共通问题（必须根据页面内容判断哪些相关，并整合到对应模块的功能点中）

${confirmedIssuesText}` : ''}

## 本次有问题的模块

${questionModulesText}

## 问题与回复

${questionsText}

请根据以上信息生成需求规格文件：
- 对于有问题的模块：整合问题回复，完善需求描述
- 对于无问题的模块：仅做四维度结构化整理，不增改原文内容，推断部分标注 [推断] 和 [建议人工确认]
- 所有模块都要检查是否涉及共通需求（如表格、表单、查询、数据验证等场景），将相关共通需求嵌入对应功能点的验收标准或UI规范中
- 所有模块统一使用四维度格式输出
- 严格按照Markdown格式输出`;

    return [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];
  }

  /**
   * 从问题清单中提取涉及的模块名
   * 通过 context 字段和 reqId 关联 analyzedData.sheets 中的模块名
   */
  static _identifyQuestionModules(questionList, analyzedData) {
    const moduleNames = new Set();
    const sheetsItems = analyzedData?.sheets || [];

    for (const q of questionList) {
      // 从 context 字段匹配
      if (q.context) {
        for (const item of sheetsItems) {
          const req = item.original || {};
          const mod = req.module || req.模块 || req.功能模块 || '';
          if (mod && q.context.includes(item.text)) {
            moduleNames.add(mod);
          }
        }
      }
      // 从 reqId 关联
      if (q.reqId) {
        for (const item of sheetsItems) {
          const req = item.original || {};
          if ((req.reqId || req.编号 || req.需求编号 || req.id || req.序号) == q.reqId) {
            const mod = req.module || req.模块 || req.功能模块 || '';
            if (mod) moduleNames.add(mod);
          }
        }
      }
      // 从 question 文本匹配（兜底）
      for (const item of sheetsItems) {
        const req = item.original || {};
        const mod = req.module || req.模块 || req.功能模块 || '';
        if (mod && q.question && q.question.includes(mod)) {
          moduleNames.add(mod);
        }
      }
    }

    return Array.from(moduleNames).filter(Boolean);
  }

  /**
   * 构建新问题检查提示词
   * @param {Object} refinedRequirements - 完善后的需求
   * @param {Array} confirmedIssues - 已确认问题
   * @param {number} iteration - 当前迭代轮次
   * @returns {Array} OpenAI messages 格式
   */
  static buildCheckNewIssuesPrompt(refinedRequirements, confirmedIssues = [], iteration = 1) {
    const requirementsText = typeof refinedRequirements === 'string'
      ? refinedRequirements
      : refinedRequirements.content || JSON.stringify(refinedRequirements, null, 2);

    const systemPrompt = `你是一位资深的需求分析师，负责检查完善后的需求规格文件是否还有不清晰之处。

这是第 ${iteration} 轮迭代检查。

收敛判定规则：
- 如果改善幅度小于20%（新问题数量少于前轮的20%），应返回空数组 []
- 如果新问题与前轮问题重复或只是微小变体，标注为 "duplicate" 而不是新问题
- 如果所有需求都清晰完整，返回空数组 []

检查要点：
- 模糊或有歧义的描述
- 缺少关键信息的验收标准
- 逻辑冲突或不一致
- 无法直接实作的描述

输出格式：严格按JSON数组格式输出，不要在JSON前后添加任何文字。

如果所有需求都清晰完整，输出 []
如果有新问题：
[
  {
    "id": 1,
    "category": "功能需求/界面需求/数据需求/交互需求/安全需求/性能需求",
    "question": "问题描述",
    "severity": "high/medium/low",
    "suggestion": "建议解决方案",
    "isDuplicate": false
  }
]`;

    const confirmedText = confirmedIssues.length > 0
      ? `\n## 已确认的共通问题\n${PromptTemplates._summarizeConfirmedIssues(confirmedIssues)}`
      : '';

    const userPrompt = `## 完善后的需求规格文件

${requirementsText}

${confirmedText}

请检查以上需求是否还有不清晰之处。这是第 ${iteration} 轮检查，请严格判断是否需要继续迭代。`;

    return [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];
  }

  /**
   * 根据项目类型生成提示词补充
   */
  static _getProjectTypeHint(projectType) {
    const hints = {
      flutter: `本项目是 Flutter Web 项目，审查时需要特别关注：
- Flutter Widget 的状态管理是否明确（StatefulWidget vs StatelessWidget）
- 路由导航方式是否指定（Navigator.push/GoRouter等）
- Flutter 特有的 UI 规范（Material/Cupertino 组件、ThemeData）
- Dart 语言特性（null safety、async/await、Stream）`,
      vue: `本项目是 Vue 项目，审查时需要特别关注：
- Vue 组件生命周期和状态管理（ref/reactive/computed/watch）
- Vue Router 路由配置和导航守卫
- Vuex/Pinia 状态管理是否明确
- Vue 特有的模板语法和指令`,
      react: `本项目是 React 项目，审查时需要特别关注：
- React 组件类型（函数组件/类组件）和 Hooks 使用
- React Router 路由配置
- Redux/Context 状态管理是否明确
- React 特有的 JSX 语法和生命周期`,
      angular: `本项目是 Angular 项目，审查时需要特别关注：
- Angular 组件和模块结构
- Service 依赖注入方式
- Angular Router 路由配置和守卫
- RxJS Observable 使用方式`,
      html: `本项目是传统 HTML+CSS+JS 项目，审查时需要特别关注：
- DOM 操作方式是否明确
- CSS 样式规范（布局方式、响应式适配）
- JavaScript 事件处理和错误处理
- 浏览器兼容性要求`,
    };
    return hints[projectType] || hints.react; // 默认参考 React
  }

  /**
   * 汇总所有需求来源的数据为文本（按模块分组展示完整字段）
   */
  static _summarizeRequirements(analyzedData) {
    const parts = [];

    if (analyzedData.sheets && analyzedData.sheets.length > 0) {
      parts.push('### 需求文档（来自 Google Sheets）');

      // 按模块分组展示
      const moduleGroups = {};
      for (const item of analyzedData.sheets) {
        const req = item.original || {};
        const mod = req.module || req.模块 || req.功能模块 || '未分类模块';
        if (!moduleGroups[mod]) moduleGroups[mod] = [];
        moduleGroups[mod].push(item);
      }

      for (const [moduleName, items] of Object.entries(moduleGroups)) {
        parts.push(`\n**模块: ${moduleName}**`);
        items.forEach((item, idx) => {
          const req = item.original || {};
          const text = item.text || req.requirement || req.description || req.需求 || '';
          parts.push(`\n${idx + 1}. 需求: ${text}`);
          if (req.priority || req.优先级) parts.push(`   优先级: ${req.priority || req.优先级}`);
          if (req.acceptanceCriteria || req.AC || req.验收标准) parts.push(`   验收标准: ${req.acceptanceCriteria || req.AC || req.验收标准}`);
          if (req.description && req.description !== text) parts.push(`   详细描述: ${req.description || req.详细描述}`);
          if (req.status || req.状态) parts.push(`   状态: ${req.status || req.状态}`);
        });
      }
    }

    if (analyzedData.figma) {
      parts.push('\n### Figma 设计数据');
      if (Array.isArray(analyzedData.figma) && analyzedData.figma.length > 0) {
        analyzedData.figma.forEach((item, idx) => {
          parts.push(`${idx + 1}. [${item.source}] ${item.text}`);
        });
      } else {
        parts.push('(Figma 数据为空)');
      }
    }

    // Figma 设计规范
    if (analyzedData.figmaDesignSpecs && analyzedData.figmaDesignSpecs.length > 0) {
      parts.push('\n### Figma 设计规范');
      // 摘要展示前50条设计规范
      const specsToShow = analyzedData.figmaDesignSpecs.slice(0, 50);
      for (const spec of specsToShow) {
        const props = [];
        if (spec.fills && spec.fills.length > 0) props.push(`填充: ${spec.fills.map(f => f.color || f.type).join(', ')}`);
        if (spec.textStyle) props.push(`文字: ${spec.textStyle.fontSize}px ${spec.textStyle.fontFamily}`);
        if (spec.boundingBox) props.push(`尺寸: ${Math.round(spec.boundingBox.width)}×${Math.round(spec.boundingBox.height)}`);
        if (spec.effects && spec.effects.length > 0) props.push(`效果: ${spec.effects.map(e => e.type).join(', ')}`);
        if (props.length > 0) {
          parts.push(`- ${spec.name} (${spec.type}): ${props.join('; ')}`);
        }
      }
      if (analyzedData.figmaDesignSpecs.length > 50) {
        parts.push(`... 还有 ${analyzedData.figmaDesignSpecs.length - 50} 条设计规范`);
      }
    }

    if (analyzedData.localFiles) {
      parts.push('\n### 本地文件数据');
      const content = analyzedData.localFiles.text || '';
      if (content) {
        // 直接传入全部内容，不再截断
        // 每页内容已由 formatLocalFileData 添加标题标记
        parts.push(content);
      }
    }

    return parts.join('\n');
  }

  /**
   * 汇总已确认的共通问题
   */
  static _summarizeConfirmedIssues(confirmedIssues) {
    if (!confirmedIssues || confirmedIssues.length === 0) return '';

    return confirmedIssues.map((issue, idx) => {
      const question = issue.question || issue.问题 || issue.description || '';
      const reply = issue.reply || issue.回复 || issue.solution || '';
      const category = issue.category || issue.分类 || '';
      return `${idx + 1}. [${category}] 问题: ${question}\n   解决方案/回复: ${reply}`;
    }).join('\n\n');
  }

  /**
   * 根据语言设置生成输出语言提示
   * @param {string} language - 语言代码：zh-TW(繁体中文)、zh-CN(简体中文)、en(英文)
   * @returns {string} 语言提示文本
   */
  static _getOutputLangHint(language) {
    const hints = {
      'zh-TW': `## 输出语言要求

你必须使用繁体中文输出所有分析结果，包括：
- 问题描述、建议方案、上下文引用都必须用繁体中文撰写
- 分类名称使用繁体中文：功能需求、界面需求、数据需求、交互需求、安全需求、性能需求
- 严重程度使用繁体中文：高、中、低
- 示例输出中的字段名保持英文（id、category、question、severity、suggestion、context、refersToConfirmedIssue），但字段值用繁体中文`,
      'zh-CN': `## 输出语言要求

你必须使用简体中文输出所有分析结果，包括：
- 问题描述、建议方案、上下文引用都必须用简体中文撰写
- 分类名称使用简体中文：功能需求、界面需求、数据需求、交互需求、安全需求、性能需求
- 严重程度使用简体中文：高、中、低
- 示例输出中的字段名保持英文（id、category、question、severity、suggestion、context、refersToConfirmedIssue），但字段值用简体中文`,
      'en': `## Output Language Requirement

You must output all analysis results in English, including:
- Question descriptions, suggestions, and context references must be written in English
- Category names in English: Functional, UI, Data, Interaction, Security, Performance
- Severity levels in English: high, medium, low
- Field names in JSON output remain in English (id, category, question, severity, suggestion, context, refersToConfirmedIssue), and field values also in English`,
    };
    return hints[language] || hints['zh-TW'];
  }

  /**
   * 根据语言设置生成需求完善输出的语言提示
   */
  static _getRefineLangHint(language) {
    const hints = {
      'zh-TW': '5. 输出语言：所有需求描述、验收标准、UI规范、数据验证都必须使用繁体中文撰写',
      'zh-CN': '5. 输出语言：所有需求描述、验收标准、UI规范、数据验证都必须使用简体中文撰写',
      'en': '5. Output language: All requirement descriptions, acceptance criteria, UI specs, and data validations must be written in English',
    };
    return hints[language] || hints['zh-TW'];
  }
}

module.exports = PromptTemplates;