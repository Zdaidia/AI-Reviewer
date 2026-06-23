/**
 * 需求分析处理器
 *
 * 核心功能：
 * 1. 综合分析所有来源的需求数据
 * 2. 发现需求不清晰/无法实作的地方
 * 3. 生成问题清单
 * 4. 根据回复完善需求
 * 5. 检查完善后是否还有新问题（多轮迭代）
 *
 * 数据源直接格式化为 LLM 输入文本，不再使用 basicAnalyzer 中间层
 * LLM 深度分析使用 global.llmRouter
 */

const RobustJSONParser = require('./json-parser');

class RequirementProcessor {
  constructor(llm = null) {
    this.llm = llm; // global.llmRouter
    this.jsonParser = new RobustJSONParser();
  }

  /**
   * 综合分析所有来源数据，发现不清晰处
   * @param {Object} allData - 所有来源数据
   *   - sheetsData: Sheets 需求数据
   *   - figmaRequirements: Figma 设计需求
   *   - figmaDesignSpecs: Figma 设计规范
   *   - localFileData: 本地文件数据
   *   - confirmedIssues: 已确认的共通问题
   *   - projectType: 项目类型（flutter/vue/react/angular/html）
   * @param {Function} onProgress - 进度回调
   * @returns {Promise<Object>} 分析结果 + 问题清单
   */
  async analyzeAndFindIssues(allData, onProgress = null) {
    if (onProgress) onProgress({ step: 'format_data', message: '格式化需求数据...', percent: 5 });

    // 1. 格式化各来源数据
    const analyzedData = {};

    if (allData.sheetsData && allData.sheetsData.length > 0) {
      analyzedData.sheets = this.formatSheetsData(allData.sheetsData);
    }

    if (allData.figmaRequirements) {
      analyzedData.figma = this.formatFigmaData(allData.figmaRequirements);
    }

    if (allData.figmaDesignSpecs) {
      analyzedData.figmaDesignSpecs = allData.figmaDesignSpecs;
    }

    if (allData.localFileData) {
      analyzedData.localFiles = this.formatLocalFileData(allData.localFileData);
    }

    if (onProgress) onProgress({ step: 'deep_analysis', message: 'AI 正在分析需求，请稍候...', percent: 5 });

    // 2. LLM 深度分析
    const questionList = await this.generateQuestionList(analyzedData, allData.confirmedIssues || [], allData.projectType || '', allData.language || 'zh-TW');

    if (onProgress) onProgress({ step: 'complete', message: '分析完成', percent: 100 });

    return {
      analyzedData,
      questionList,
      iterationCount: 1,
    };
  }

  /**
   * 格式化 Sheets 数据为 LLM 输入结构
   * 保留原始数据（original字段）和文本（text字段），不再做中间分析
   */
  formatSheetsData(sheetsData) {
    return sheetsData.map(row => {
      const reqText = row.requirement || row.description || row.需求 || row.需求描述 || row.需求名称 || '';
      return {
        original: row,
        text: reqText || row.描述 || row.详细描述 || '',
      };
    }).filter(item => item.text.trim());
  }

  /**
   * 格式化 Figma 数据为 LLM 输入结构
   */
  formatFigmaData(figmaRequirements) {
    return this.convertFigmaToDescriptions(figmaRequirements);
  }

  /**
   * 格式化本地文件数据为 LLM 输入结构
   * 支持按选中页面拼接（多页 PDF 时每页带标题标记）
   */
  formatLocalFileData(localFileData) {
    // 按选中页面拼接内容
    if (localFileData.pages && localFileData.selectedPages?.length > 0) {
      const selectedContent = localFileData.pages
        .filter(p => localFileData.selectedPages.includes(p.pageNum))
        .map(p => `=== 第${p.pageNum}页: ${p.title} ===\n${p.content}`)
        .join('\n\n');
      return { text: selectedContent, fileName: localFileData.fileName };
    }
    // fallback: 整篇文本（单页或无页面选择）
    const text = localFileData.content || '';
    if (!text.trim()) return { text: '', fileName: localFileData.fileName };
    return { text, fileName: localFileData.fileName };
  }

  /**
   * 将 Figma 需求数据转换为文本描述列表
   */
  convertFigmaToDescriptions(figmaRequirements) {
    const descriptions = [];

    // 页面/模块
    if (figmaRequirements.pages) {
      for (const page of figmaRequirements.pages) {
        descriptions.push({
          source: 'figma_page',
          type: page.type,
          text: `页面/模块 "${page.name}"，包含 ${page.childrenCount} 个子元素`,
        });
      }
    }

    // UI 元素
    if (figmaRequirements.uiElements) {
      for (const el of figmaRequirements.uiElements) {
        descriptions.push({
          source: 'figma_ui',
          type: el.type,
          text: el.description || `${el.type} "${el.name}"`,
        });
      }
    }

    // 交互流程
    if (figmaRequirements.interactions) {
      for (const inter of figmaRequirements.interactions) {
        descriptions.push({
          source: 'figma_interaction',
          text: inter.description || `交互: ${inter.componentName} ${inter.propertyName}`,
        });
      }
    }

    // 状态/变体
    if (figmaRequirements.states) {
      for (const state of figmaRequirements.states) {
        descriptions.push({
          source: 'figma_state',
          text: state.description || `状态: ${state.componentName} 有多种变体`,
        });
      }
    }

    // 文本内容
    if (figmaRequirements.textContent) {
      for (const tc of figmaRequirements.textContent) {
        if (tc.text && tc.text.trim().length > 2) {
          descriptions.push({
            source: 'figma_text',
            text: `界面文案 "${tc.text}" 位于 ${tc.parent}`,
          });
        }
      }
    }

    // Prototype 交互连线（页面跳转逻辑）
    if (figmaRequirements.prototypeInteractions) {
      for (const inter of figmaRequirements.prototypeInteractions) {
        descriptions.push({
          source: 'figma_prototype',
          text: inter.description || `从 "${inter.sourceName}" ${inter.triggerType === 'ON_CLICK' ? '点击' : '触发'} 跳转到页面`,
        });
      }
    }

    // 导航图（整体交互流程概览）
    if (figmaRequirements.navigationMap) {
      const map = figmaRequirements.navigationMap;
      for (const [source, targets] of Object.entries(map)) {
        descriptions.push({
          source: 'figma_navigation',
          text: `导航流程: "${source}" → ${targets.map(t => t.targetId || '未知目标').join(' / ')}`,
        });
      }
    }

    return descriptions;
  }

  /**
   * 流式分析方法（逐步推送 LLM 输出）
   * @param {Object} allData - 所有来源数据
   * @param {Function} onChunk - 每收到一个文本块就调用
   * @param {Function} onProgress - 进度回调
   * @returns {Promise<Object>} 最终解析结果
   */
  async analyzeWithStream(allData, onChunk = null, onProgress = null) {
    if (onProgress) onProgress({ step: 'format_data', message: '格式化数据...', percent: 5 });

    const analyzedData = {};

    if (allData.sheetsData && allData.sheetsData.length > 0) {
      analyzedData.sheets = this.formatSheetsData(allData.sheetsData);
    }
    if (allData.figmaRequirements) {
      analyzedData.figma = this.formatFigmaData(allData.figmaRequirements);
    }
    if (allData.figmaDesignSpecs) {
      analyzedData.figmaDesignSpecs = allData.figmaDesignSpecs;
    }
    if (allData.localFileData) {
      analyzedData.localFiles = this.formatLocalFileData(allData.localFileData);
    }

    if (onProgress) onProgress({ step: 'deep_analysis', message: 'AI深度分析（流式）...', percent: 40 });

    const PromptTemplates = require('./prompt-templates');
    const messages = PromptTemplates.buildAnalysisPrompt(analyzedData, allData.confirmedIssues || [], allData.projectType || '');

    // 使用 chatStream 逐块推送
    let fullText = '';
    try {
      console.log('[RequirementProcessor] analyzeWithStream 开始调用 chatStream:', {
        llmType: this.llm?.constructor?.name,
        hasChatStream: typeof this.llm?.chatStream === 'function',
      });
      for await (const chunk of this.llm.chatStream('reasoning', messages, {
        temperature: 0.3,
        maxTokens: 16000,
      })) {
        const text = chunk.content || chunk.text || chunk.delta || '';
        if (text) {
          fullText += text;
          if (onChunk) onChunk(text);
        }
        // 处理错误类型 chunk
        if (chunk.type === 'error') {
          console.error('[RequirementProcessor] chatStream 收到错误 chunk:', chunk.error);
          throw new Error(chunk.error);
        }
      }
    } catch (e) {
      console.error(`[RequirementProcessor] 流式分析失败:`, {
        message: e.message,
        stack: e.stack?.substring(0, 500),
        fullTextLength: fullText.length,
      });
      try {
        const fs = require('fs'); const p = require('path');
        fs.appendFileSync(p.join('E:', 'AI', 'dev-quality-inspector', 'data', 'debug.log'),
          `[${new Date().toISOString()}] [RequirementProcessor 流式分析失败] error=${e.message}, fullTextLen=${fullText.length}\n`);
      } catch(logErr) {}
      throw new Error(`AI 流式分析失败: ${e.message}`);
    }

    if (onProgress) onProgress({ step: 'parse', message: '解析结果...', percent: 90 });

    const questionList = this.parseQuestionListFromResponse(fullText);

    if (onProgress) onProgress({ step: 'complete', message: '分析完成', percent: 100 });

    return {
      analyzedData,
      questionList,
      iterationCount: 1,
    };
  }

  /**
   * 生成问题清单（LLM 深度分析）
   * @param {Object} analyzedData - 分析后的数据
   * @param {Array} confirmedIssues - 已确认的共通问题（作为参考）
   * @returns {Promise<Array>} 问题清单
   */
  async generateQuestionList(analyzedData, confirmedIssues = [], projectType = '', language = 'zh-TW') {
    if (!this.llm) {
      throw new Error('LLM 未配置，无法进行深度分析。请先配置 AI 设置。');
    }

    const PromptTemplates = require('./prompt-templates');
    const messages = PromptTemplates.buildAnalysisPrompt(analyzedData, confirmedIssues, projectType, language);

    try {
      const result = await this.llm.chat('reasoning', messages, {
        temperature: 0.3,
        maxTokens: 16000,
      });

      if (!result.success) {
        throw new Error(result.error || 'LLM 请求失败');
      }

      // GLM-5 thinking 模式可能返回 reasoning_content（思考过程）+ content（最终输出）
      // 优先使用 content，如果为空则尝试 reasoning_content 中提取 JSON
      let responseText = result.content || '';
      if (!responseText.trim() && result.rawMessage) {
        // content 为空但 rawMessage 存在，可能 thinking 模式下 content 被分离了
        const raw = result.rawMessage;
        responseText = raw.content || raw.reasoning_content || raw.thinking_content || '';
      }
      if (!responseText.trim()) {
        // content 完全为空，直接返回空结果
        console.warn('[RequirementProcessor] LLM 返回内容为空');
        return [];
      }

      console.log('[RequirementProcessor] LLM 返回内容长度:', responseText.length, '前100字:', responseText.substring(0, 100));

      return this.parseQuestionListFromResponse(responseText);
    } catch (e) {
      console.error(`[RequirementProcessor] LLM 分析失败: ${e.message}`);
      throw new Error(`AI 分析失败: ${e.message}`);
    }
  }

  /**
   * 从 LLM 响应中解析问题清单
   * 使用三层JSON解析策略（cleanJsonString + parseJsonWithRepair + 纯文本回退）
   */
  parseQuestionListFromResponse(response) {
    const data = this.jsonParser.parseArray(response);

    if (!data || !Array.isArray(data)) {
      console.warn('[RequirementProcessor] 无法解析问题清单，返回空列表');
      return [];
    }

    // 标准化问题格式
    return data.map((q, idx) => ({
      id: q.id || idx + 1,
      reqId: q.reqId || q.requirementId || '',
      category: q.category || q.type || '需求不明确',
      question: q.question || q.description || q.issue || '',
      severity: q.severity || q.priority || 'medium',
      status: '待回复',
      reply: '',
      suggestion: q.suggestion || q.recommendation || '',
      context: q.context || q.relatedRequirement || '',
      refersToConfirmedIssue: q.refersToConfirmedIssue || null,
    }));
  }

  /**
   * 根据回复完善需求
   * @param {Array} questionList - 问题清单
   * @param {Array} replies - 回复数据（从 Sheet 读取的）
   * @param {Object} analyzedData - 原始需求格式化数据（含 sheets/figma/localFiles 等）
   * @param {Array} confirmedIssues - 已确认的共通问题
   * @param {Function} onProgress - 进度回调
   * @returns {Promise<Object>} 完善后的需求文件
   */
  async refineRequirementsWithReplies(questionList, replies, analyzedData, confirmedIssues = [], onProgress = null, language = 'zh-TW') {
    if (!this.llm) {
      throw new Error('LLM 未配置，无法完善需求。请先配置 AI 设置。');
    }

    if (onProgress) onProgress({ step: 'refining', message: '根据回复完善需求...', percent: 30 });

    const PromptTemplates = require('./prompt-templates');
    const messages = PromptTemplates.buildRefinePrompt(questionList, replies, analyzedData, confirmedIssues, language);

    try {
      const result = await this.llm.chat('reasoning', messages, {
        temperature: 0.3,
        maxTokens: 16000,
      });

      if (!result.success) {
        throw new Error(result.error || 'LLM 请求失败');
      }

      let responseText = result.content || '';
      if (!responseText.trim() && result.rawMessage) {
        const raw = result.rawMessage;
        responseText = raw.content || raw.reasoning_content || raw.thinking_content || '';
      }

      if (onProgress) onProgress({ step: 'complete', message: '需求完善完成', percent: 100 });

      return this.parseRefinedRequirements(responseText);
    } catch (e) {
      console.error(`[RequirementProcessor] 需求完善失败: ${e.message}`);
      throw new Error(`需求完善失败: ${e.message}`);
    }
  }

  /**
   * 从 LLM 响应中解析完善后的需求
   * 使用三层JSON解析策略，失败时保留为文本格式
   */
  parseRefinedRequirements(response) {
    const result = this.jsonParser.parseResponse(response);

    if (result.format === 'json' && result.data) {
      const data = result.data;
      return {
        format: 'json',
        content: JSON.stringify(data, null, 2),
        modules: data.modules || data.features || [],
      };
    }

    // 文本或Markdown格式
    const content = result.content || '';
    if (content.trim().length === 0) {
      return {
        format: 'text',
        content: typeof response === 'string' ? response : JSON.stringify(response),
        modules: [],
      };
    }

    // 检测是否为 Markdown 格式
    if (content.startsWith('#') || content.includes('## ') || content.includes('### ')) {
      return {
        format: 'markdown',
        content,
        modules: this.parseMarkdownModules(content),
      };
    }

    return {
      format: 'text',
      content,
      modules: [],
    };
  }

  /**
   * 从 Markdown 文本中解析模块结构
   */
  parseMarkdownModules(markdown) {
    const modules = [];
    const lines = markdown.split('\n');
    let currentModule = null;

    for (const line of lines) {
      if (line.startsWith('# ') && !line.startsWith('## ')) {
        // 顶级标题 = 模块名
        currentModule = { name: line.replace('# ', '').trim(), items: [] };
        modules.push(currentModule);
      } else if (line.startsWith('## ') && currentModule) {
        // 二级标题 = 功能名
        currentModule.items.push({ name: line.replace('## ', '').trim(), details: [] });
      } else if (line.startsWith('- ') && currentModule && currentModule.items.length > 0) {
        // 列表项 = 描述/验收标准等
        currentModule.items[currentModule.items.length - 1].details.push(line.replace('- ', '').trim());
      }
    }

    return modules;
  }

  /**
   * 检查完善后的需求是否还有新问题（支持迭代控制）
   * @param {Object} refinedRequirements - 完善后的需求
   * @param {Array} confirmedIssues - 已确认的共通问题
   * @param {number} iteration - 当前迭代轮次
   * @param {Array} prevQuestionList - 上一轮问题清单（用于计算改善率）
   * @returns {Promise<Object>} 检查结果
   */
  async checkForNewIssues(refinedRequirements, confirmedIssues = [], iteration = 1, prevQuestionList = []) {
    if (!this.llm) {
      throw new Error('LLM 未配置，无法检查新问题。');
    }

    const PromptTemplates = require('./prompt-templates');
    const messages = PromptTemplates.buildCheckNewIssuesPrompt(refinedRequirements, confirmedIssues, iteration);

    try {
      const result = await this.llm.chat('reasoning', messages, {
        temperature: 0.3,
        maxTokens: 4000,
      });

      if (!result.success) {
        console.warn('[RequirementProcessor] 检查新问题 LLM 请求失败:', result.error);
        return {
          hasNewIssues: false, shouldContinue: false, newQuestionList: [], iteration,
          message: `检查失败: ${result.error}。建议手动检查。`,
        };
      }

      let responseText = result.content || '';
      if (!responseText.trim() && result.rawMessage) {
        const raw = result.rawMessage;
        responseText = raw.content || raw.reasoning_content || raw.thinking_content || '';
      }

      const parsed = this.parseQuestionListFromResponse(responseText);
      const improvement = this.evaluateImprovement(prevQuestionList, parsed);

      // 迭代终止条件
      const shouldContinue = parsed.length > 0 && improvement.improvementRate >= 0.2 && iteration < 3;

      return {
        hasNewIssues: parsed.length > 0,
        shouldContinue,
        improvementRate: improvement.improvementRate,
        newQuestionList: parsed,
        iteration,
        message: parsed.length > 0
          ? shouldContinue
            ? `发现 ${parsed.length} 个新的不清晰之处（改善率 ${Math.round(improvement.improvementRate * 100)}%），建议继续迭代。`
            : `改善率不足（${Math.round(improvement.improvementRate * 100)}%），建议停止迭代并保存当前需求。`
          : '需求已完整，没有发现新的不清晰之处。可以保存需求文件。',
      };
    } catch (e) {
      console.error(`[RequirementProcessor] 新问题检查失败: ${e.message}`);
      return {
        hasNewIssues: false,
        shouldContinue: false,
        newQuestionList: [],
        iteration,
        message: `检查失败: ${e.message}。建议手动检查后决定是否继续迭代。`,
      };
    }
  }

  /**
   * 评估改善率
   * @param {Array} prevQuestions - 上一轮问题清单
   * @param {Array} newQuestions - 本轮问题清单
   * @returns {Object} { improvementRate, shouldContinue }
   */
  evaluateImprovement(prevQuestions, newQuestions) {
    if (!prevQuestions || prevQuestions.length === 0) {
      // 第一轮没有前轮数据，无法计算改善率
      return { improvementRate: 1.0, resolvedCount: 0 };
    }

    const resolvedCount = prevQuestions.length - newQuestions.length;
    const improvementRate = resolvedCount / prevQuestions.length;

    return {
      improvementRate: Math.max(0, improvementRate),
      resolvedCount,
    };
  }

  /**
   * 一键完整执行（全自动流程）
   * 分析 → 发现问题 → 自动推断回复 → 完善 → 检查 → 生成最终需求
   * 如果自动推断覆盖率不足，才返回 needsMoreInfo
   * @param {Object} allData - 所有来源数据
   * @param {Array} confirmedIssues - 已确认问题
   * @param {Function} onProgress - 进度回调
   * @returns {Promise<Object>} 最终需求文件或需要人工介入
   */
  async executeFullPipeline(allData, confirmedIssues = [], onProgress = null) {
    // 1. 分析
    if (onProgress) onProgress({ step: 'analyze', message: '分析需求...', percent: 20 });
    const analysisResult = await this.analyzeAndFindIssues(allData, onProgress);

    // 2. 无问题，直接让 LLM 结构化整理
    if (analysisResult.questionList.length === 0) {
      if (onProgress) onProgress({ step: 'refine', message: '结构化整理需求...', percent: 60 });
      // 用空问题列表+空回复调用 refine，让 LLM 按四维度结构化整理
      const refined = await this.refineRequirementsWithReplies(
        [], [], analysisResult.analyzedData, confirmedIssues, null, allData.language || 'zh-TW'
      );
      if (onProgress) onProgress({ step: 'complete', message: '完成', percent: 100 });
      return {
        success: true,
        needsMoreInfo: false,
        requirements: refined,
        message: '需求已完整，结构化整理完成，可以保存。',
      };
    }

    // 3. 有问题，尝试自动推断回复
    if (onProgress) onProgress({ step: 'auto_reply', message: '推断问题回复...', percent: 40 });
    const autoReplies = this.generateAutoReplies(analysisResult.questionList, allData);

    // 4. 自动推断覆盖率足够，直接完善
    if (autoReplies.coverage >= 0.5) {
      if (onProgress) onProgress({ step: 'refine', message: '自动完善需求...', percent: 60 });
      const refined = await this.refineRequirementsWithReplies(
        analysisResult.questionList, autoReplies.replies, analysisResult.analyzedData, confirmedIssues
      );

      // 5. 检查完善后是否还有新问题（1轮）
      if (onProgress) onProgress({ step: 'check', message: '检查新问题...', percent: 80 });
      const checkResult = await this.checkForNewIssues(refined, confirmedIssues, 1, analysisResult.questionList);

      if (!checkResult.hasNewIssues || !checkResult.shouldContinue) {
        // 无新问题或改善率不足，使用 LLM 完善后的结果作为最终需求
        if (onProgress) onProgress({ step: 'complete', message: '完成', percent: 100 });
        return {
          success: true,
          needsMoreInfo: false,
          requirements: refined,
          autoCompleted: true,
          autoReplies,
          message: '需求已通过自动推断完善，可以保存。',
        };
      }

      // 6. 还有新问题但自动推断覆盖率足够，再次完善
      if (onProgress) onProgress({ step: 'refine2', message: '二次完善...', percent: 90 });
      const autoReplies2 = this.generateAutoReplies(checkResult.newQuestionList, allData);
      const refined2 = await this.refineRequirementsWithReplies(
        checkResult.newQuestionList, autoReplies2.replies, analysisResult.analyzedData, confirmedIssues
      );
      if (onProgress) onProgress({ step: 'complete', message: '完成', percent: 100 });
      return {
        success: true,
        needsMoreInfo: false,
        requirements: refined2,
        autoCompleted: true,
        iterations: 2,
        message: '需求已通过两轮自动推断完善，可以保存。',
      };
    }

    // 7. 自动推断覆盖率不足，需要人工介入
    return {
      success: false,
      needsMoreInfo: true,
      questionList: analysisResult.questionList,
      autoReplies,
      message: `需求中有 ${analysisResult.questionList.length} 个不清晰之处，自动推断覆盖率 ${Math.round(autoReplies.coverage * 100)}%，建议先写入问题清单获取人工回复。`,
    };
  }

  /**
   * 自动推断问题回复
   * 按问题分类从已有数据推断回复，低置信度标记"建议人工确认"
   * @param {Array} questionList - 问题清单
   * @param {Object} allData - 所有来源数据
   * @returns {Object} { replies, coverage }
   */
  generateAutoReplies(questionList, allData) {
    const replies = [];
    let highConfidenceCount = 0;

    for (const q of questionList) {
      let reply = '';
      let confidence = 'low';
      const category = q.category || '';

      // 根据问题分类推断回复
      if (category === '界面需求' && allData.figmaRequirements) {
        // 界面需求问题：从Figma数据推断
        const figmaElements = allData.figmaRequirements.uiElements || [];
        const matchEl = figmaElements.find(el => q.question.includes(el.name));
        if (matchEl) {
          reply = `根据 Figma 设计稿，"${matchEl.name}" 为 ${matchEl.type} 类型元素，${matchEl.description || '位于 ' + matchEl.parent}`;
          confidence = 'medium';
        }
        if (!reply) {
          reply = '请参考 Figma 设计稿确认界面规格。';
          confidence = 'low';
        }
      } else if (category === '数据需求' && allData.sheetsData) {
        // 数据需求问题：从Sheets数据推断
        const dataFields = allData.sheetsData;
        if (dataFields.length > 0) {
          reply = '请参考需求文档中的数据规格说明。如需更详细定义，建议人工确认。';
          confidence = 'low';
        }
      } else if (category === '功能需求') {
        // 功能需求问题：从已确认问题或需求描述推断
        if (allData.confirmedIssues && allData.confirmedIssues.length > 0) {
          const relevantIssue = allData.confirmedIssues.find(issue =>
            q.question.includes(issue.question || issue.问题 || '')
          );
          if (relevantIssue) {
            reply = `参考已确认问题：${relevantIssue.reply || relevantIssue.回复 || relevantIssue.solution || ''}`;
            confidence = 'medium';
          }
        }
        if (!reply) {
          reply = '请人工确认功能需求的完整描述和验收标准。';
          confidence = 'low';
        }
      } else if (category === '交互需求') {
        reply = '请参考 Figma 设计稿中的交互连线关系，或人工确认交互流程。';
        confidence = 'low';
      } else {
        // 安全/性能等：无法自动推断
        reply = '需要人工确认此问题。';
        confidence = 'low';
      }

      // 低置信度标记
      if (confidence === 'low') {
        reply += ' [推断-建议人工确认]';
      }

      replies.push({
        id: q.id,
        question: q.question,
        reply,
        confidence,
      });

      if (confidence === 'medium' || confidence === 'high') {
        highConfidenceCount++;
      }
    }

    const coverage = questionList.length > 0 ? highConfidenceCount / questionList.length : 0;

    return { replies, coverage };
  }

  /**
   * 生成最终需求规格文件
   */
  generateFinalRequirements(analyzedData, confirmedIssues = []) {
    const MarkdownGenerator = require('../output/markdown-generator');
    const generator = new MarkdownGenerator();
    return generator.generate(analyzedData, confirmedIssues);
  }
}

module.exports = RequirementProcessor;