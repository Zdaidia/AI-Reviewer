/**
 * LLM Client
 *
 * Unified interface for multiple LLM providers:
 * - OpenAI (GPT-4, GPT-4 Turbo)
 * - Anthropic (Claude)
 * - ZhipuAI (GLM-4, GLM-5)
 * - Claude Code (从 .claude 配置读取)
 * - Custom endpoints (compatible APIs)
 * - Local models (Ollama, LM Studio)
 */

const { getClaudeConfig } = require('./claude-config');

class LLMClient {
  constructor(config) {
    this.config = config;
    this.client = null;
    this.provider = config.provider || 'openai';
    this.model = config.model || 'gpt-4';
    this.initialize();
  }

  /**
   * Initialize the LLM client
   */
  initialize() {
    console.log(`[LLM Client] initialize() 被调用 - provider: ${this.provider}, model: ${this.model}`);

    switch (this.provider) {
      case 'openai':
      case 'azure':
        this.initializeOpenAI();
        break;
      case 'anthropic':
        this.initializeAnthropic();
        break;
      case 'claude-code':
        this.initializeClaudeCode();
        break;
      case 'zhipu':
      case 'glm':
        this.initializeZhipu();
        break;
      case 'ollama':
        this.initializeOllama();
        break;
      case 'custom':
        this.initializeCustom();
        break;
      default:
        console.error(`[LLM Client] Unknown provider: ${this.provider}`);
        throw new Error(`Unknown provider: ${this.provider}`);
    }
  }

  /**
   * Initialize OpenAI client
   */
  initializeOpenAI() {
    try {
      // 验证 provider 是否正确
      if (this.provider !== 'openai' && this.provider !== 'azure') {
        throw new Error(`Provider mismatch: expected 'openai' or 'azure', got '${this.provider}'`);
      }

      const OpenAI = require('openai');
      this.client = new OpenAI({
        apiKey: this.config.apiKey || process.env.OPENAI_API_KEY,
        baseURL: this.config.baseURL,
        organization: this.config.organization,
        timeout: this.config.timeout || 180000  // 180秒默认超时 (3分钟)
      });
    } catch (error) {
      throw new Error(`Failed to initialize OpenAI client: ${error.message}. Install with: npm install openai`);
    }
  }

  /**
   * Initialize Anthropic client
   */
  initializeAnthropic() {
    try {
      // 验证 provider 是否正确
      if (this.provider !== 'anthropic') {
        throw new Error(`Provider mismatch: expected 'anthropic', got '${this.provider}'`);
      }

      const Anthropic = require('@anthropic-ai/sdk');
      this.client = new Anthropic({
        apiKey: this.config.apiKey || process.env.ANTHROPIC_API_KEY,
        baseURL: this.config.baseURL,
        timeout: this.config.timeout || 180000  // 180秒默认超时 (3分钟)
      });
    } catch (error) {
      throw new Error(`Failed to initialize Anthropic client: ${error.message}. Install with: npm install @anthropic-ai/sdk`);
    }
  }

  /**
   * Initialize Claude Code client
   * 根据端点类型选择 SDK：
   * - Anthropic 原生 API (api.anthropic.com) → 使用 Anthropic SDK
   * - 其他端点 (代理/DeepSeek等) → 使用 OpenAI SDK (OpenAI 格式兼容性更广)
   */
  initializeClaudeCode() {
    try {
      // 验证 provider 是否正确
      if (this.provider !== 'claude-code') {
        throw new Error(`Provider mismatch: expected 'claude-code', got '${this.provider}'`);
      }

      // 1. 优先使用项目配置
      let apiKey = this.config.apiKey;
      let baseURL = this.config.baseURL || this.config.apiEndpoint;
      let model = this.config.model;
      let timeout = this.config.timeout;

      // 2. 如果项目配置不完整，回退到全局配置
      if (!apiKey || !baseURL) {
        console.log('[LLM Client] 项目配置不完整，回退到全局 Claude Code 配置');
        const claudeConfig = getClaudeConfig();
        const globalConfig = claudeConfig.getClientConfig();

        apiKey = apiKey || globalConfig.apiKey;
        baseURL = baseURL || globalConfig.baseURL;
        model = model || globalConfig.model;
        timeout = timeout || globalConfig.timeout;

        console.log('[LLM Client] 使用全局 Claude Code 配置:', claudeConfig.getSummary());
      } else {
        console.log('[LLM Client] 使用项目配置:', {
          hasApiKey: !!apiKey,
          baseURL: baseURL,
          model: model
        });
      }

      if (!apiKey) {
        throw new Error('Claude Code 配置中未找到 API Key');
      }

      // 确保 baseURL 格式正确（不以 / 结尾）
      if (baseURL.endsWith('/')) {
        baseURL = baseURL.slice(0, -1);
      }

      // 设置模型
      this.model = model || 'claude-opus-4-6';

      // 检测端点类型：只有真正的 Anthropic API 才用 Anthropic SDK
      // 其他代理/兼容端点（cdskysoft、DeepSeek、OpenRouter 等）统一用 OpenAI 格式
      const isAnthropicNative = baseURL.includes('anthropic.com') && !baseURL.includes('cdskysoft');
      // 某些端点的 /anthropic 路径不可靠，不作为 Anthropic 格式判断依据

      if (isAnthropicNative) {
        // Anthropic 原生 API → 使用 Anthropic SDK
        console.log('[LLM Client] 检测到 Anthropic 原生端点，使用 Anthropic SDK');
        // 去掉可能存在的 /v1 后缀（Anthropic SDK 自己会加）
        let anthropicBase = baseURL;
        if (anthropicBase.endsWith('/v1')) anthropicBase = anthropicBase.slice(0, -3);

        const Anthropic = require('@anthropic-ai/sdk');
        this.client = new Anthropic({
          apiKey: apiKey,
          baseURL: anthropicBase,
          timeout: timeout || 600000
        });
        this.clientFormat = 'anthropic'; // 标记客户端格式
      } else {
        // 代理/兼容端点 → 使用 OpenAI SDK
        console.log('[LLM Client] 检测到兼容端点，使用 OpenAI SDK (格式兼容性更广)');
        // 确保 baseURL 格式适合 OpenAI SDK（需要 /v1 路径）
        let openaiBase = baseURL;
        if (!openaiBase.endsWith('/v1')) openaiBase += '/v1';

        const OpenAI = require('openai');
        this.client = new OpenAI({
          apiKey: apiKey,
          baseURL: openaiBase,
          timeout: timeout || 600000,
          dangerouslyAllowBrowser: true,
        });
        this.clientFormat = 'openai'; // 标记客户端格式
      }

      console.log('[LLM Client] Claude Code 客户端初始化成功, 格式:', this.clientFormat, '模型:', this.model, '端点:', baseURL);
      try {
        const fs = require('fs'); const p = require('path');
        fs.appendFileSync(p.join('E:', 'AI', 'dev-quality-inspector', 'data', 'debug.log'),
          `[${new Date().toISOString()}] [LLM Client] claude-code 初始化: baseURL=${baseURL}, apiKey=${apiKey?.substring(0,10)}...\n`);
      } catch(e) {}
    } catch (error) {
      throw new Error(`Failed to initialize Claude Code client: ${error.message}`);
    }
  }

  /**
   * Initialize ZhipuAI client (GLM models)
   */
  initializeZhipu() {
    try {
      // 验证 provider 是否正确
      if (this.provider !== 'zhipu' && this.provider !== 'glm') {
        throw new Error(`Provider mismatch: expected 'zhipu' or 'glm', got '${this.provider}'`);
      }

      const OpenAI = require('openai');
      this.client = new OpenAI({
        apiKey: this.config.apiKey || process.env.ZHIPUAI_API_KEY,
        baseURL: this.config.baseURL || 'https://open.bigmodel.cn/api/paas/v4/',
        dangerouslyAllowBrowser: true, // For Electron environment
        timeout: this.config.timeout || 180000  // 180秒默认超时 (3分钟)
      });
    } catch (error) {
      throw new Error(`Failed to initialize ZhipuAI client: ${error.message}. Install with: npm install openai`);
    }
  }

  /**
   * Initialize Ollama client (local models)
   */
  initializeOllama() {
    this.client = {
      baseURL: this.config.baseURL || 'http://localhost:11434',
      model: this.config.model || 'llama2'
    };
  }

  /**
   * Initialize custom endpoint client
   */
  initializeCustom() {
    this.client = {
      endpoint: this.config.endpoint,
      apiKey: this.config.apiKey,
      headers: this.config.headers || {}
    };
  }

  /**
   * Send a chat completion request
   */
  async chat(messages, options = {}) {
    const requestOptions = {
      model: this.model,
      messages,
      temperature: options.temperature ?? this.config.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? this.config.maxTokens ?? 2000,
      top_p: options.topP,
      frequency_penalty: options.frequencyPenalty,
      presence_penalty: options.presencePenalty,
      stream: options.stream || false,
      tools: options.tools || null,
      tool_choice: options.toolChoice || 'auto'
    };

    // 调试日志：追踪 provider 值
    console.log(`[LLM Client] chat() 方法调用 - provider: ${this.provider}, model: ${this.model}, hasTools: ${!!options.tools}`);

    switch (this.provider) {
      case 'openai':
      case 'azure':
      case 'zhipu':
      case 'glm':
        return await this.chatOpenAI(requestOptions);
      case 'anthropic':
        return await this.chatAnthropic(requestOptions);
      case 'claude-code':
        // 根据端点类型选择正确的 SDK 格式
        if (this.clientFormat === 'openai') {
          return await this.chatOpenAI(requestOptions);
        } else {
          return await this.chatAnthropic(requestOptions);
        }
      case 'ollama':
        return await this.chatOllama(requestOptions);
      case 'custom':
        return await this.chatCustom(requestOptions);
      default:
        throw new Error(`Unknown provider: ${this.provider}`);
    }
  }

  /**
   * Chat with OpenAI
   */
  async chatOpenAI(options) {
    console.log(`[LLM Client] ⚠️ chatOpenAI 被调用 - provider: ${this.provider}, model: ${this.model}, baseURL: ${this.client?.baseURL}`);

    // 请求前日志 - 显示完整请求体
    console.log(`[LLM Client] chatOpenAI 请求:`, {
      provider: this.provider,
      model: this.model,
      baseURL: this.client?.baseURL,
      apiKey: this.client?.apiKey?.substring(0, 20) + '...',  // 只显示前20个字符
      messagesCount: options.messages?.length,
      temperature: options.temperature,
      maxTokens: options.max_tokens,
      top_p: options.top_p,
      stream: options.stream,
      hasThinking: !!options.thinking,
      hasTools: !!options.tools
    });

    // 构建请求选项
    const requestOptions = {
      model: this.model,
      messages: options.messages,
      temperature: options.temperature,
      max_tokens: options.max_tokens,
      top_p: options.top_p,
      stream: options.stream,
      tools: options.tools,
      tool_choice: options.tool_choice
    };

    // GLM-5 特殊参数：thinking（深度思考模式）
    // 仅在使用标准端点时添加（Coding Plan 端点不支持）
    if (options.thinking && this.model === 'glm-5') {
      requestOptions.thinking = options.thinking;
      console.log(`[LLM Client] GLM-5 启用深度思考模式:`, options.thinking);
    }

    // 显示完整的请求选项（用于调试）
    console.log(`[LLM Client] 完整请求选项:`, JSON.stringify({
      model: this.model,
      messages: options.messages,
      temperature: options.temperature,
      max_tokens: options.max_tokens,
      top_p: options.top_p,
      stream: options.stream,
      thinking: options.thinking,
      tools: options.tools ? `${options.tools.length} tools` : 'none'
    }, null, 2).substring(0, 1000));

    // 显示消息内容（截断）
    if (options.messages && options.messages.length > 0) {
      const firstMessage = options.messages[0];
      console.log(`[LLM Client] 第一条消息:`, {
        role: firstMessage.role,
        contentLength: firstMessage.content?.length || 0,
        contentPreview: firstMessage.content?.substring(0, 200) + '...'
      });
    }

    try {
      const completion = await this.client.chat.completions.create(requestOptions);

      // 调试：记录原始响应
      if (!completion.choices || completion.choices.length === 0) {
        console.error('[LLM Client] No choices in completion:', JSON.stringify(completion).substring(0, 500));
        return {
          success: false,
          error: 'No choices in completion',
          details: completion
        };
      }

      // GLM-5 (and some other models) may use reasoning_content instead of content
      const message = completion.choices[0]?.message || {};

      // 尝试多种可能的内容字段
      const content = message.content ||
                     message.reasoning_content ||
                     message.thinking_content ||
                     message.delta?.content ||
                     '';

      // 检查是否有工具调用 (Function Calling)
      const toolCalls = message.tool_calls || null;

      // 检查是否成功获取内容
      if (!content && !toolCalls) {
        console.error('[LLM Client] Empty content in message. Message keys:', Object.keys(message));
        console.error('[LLM Client] Full message:', JSON.stringify(message));
      }

      // 如果有工具调用，记录日志
      if (toolCalls && toolCalls.length > 0) {
        console.log('[LLM Client] 收到工具调用请求:', toolCalls.map(tc => ({
          id: tc.id,
          type: tc.type,
          function: { name: tc.function.name, arguments: tc.function.arguments }
        })));
      }

      return {
        success: true,
        content: content,
        toolCalls: toolCalls,
        usage: {
          promptTokens: completion.usage?.prompt_tokens || completion.usage?.prompt_tokens_details?.cached_tokens,
          completionTokens: completion.usage?.completion_tokens,
          totalTokens: completion.usage?.total_tokens
        },
        model: completion.model,
        rawMessage: message  // 保留原始消息用于调试
      };
    } catch (error) {
      // 详细错误日志
      console.error('[LLM Client] chatOpenAI error:');
      console.error('  - Error message:', error.message);
      console.error('  - Error status:', error.status || error.response?.status);
      console.error('  - Error code:', error.code);
      console.error('  - Error type:', error.type);
      console.error('  - Response data:', error.response?.data);
      console.error('  - Full error:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));

      return {
        success: false,
        error: error.message,
        status: error.status || error.response?.status,
        details: error.response?.data || null
      };
    }
  }

  /**
   * Chat with Claude Code (直接 HTTP 请求，不使用 SDK)
   * 支持 Function Calling (tools)
   */
  async chatClaudeCodeDirect(options) {
    try {
      console.log(`[LLM Client] chatClaudeCodeDirect 请求:`, {
        provider: this.provider,
        model: this.model,
        messagesCount: options.messages?.length,
        temperature: options.temperature,
        maxTokens: options.max_tokens,
        hasTools: !!options.tools
      });

      // Convert OpenAI format to Anthropic format
      const systemMessage = options.messages.find(m => m.role === 'system');
      const messages = options.messages.filter(m => m.role !== 'system');

      // 构建请求参数
      const requestBody = {
        model: this.model,
        max_tokens: options.max_tokens || 4096,
        system: systemMessage?.content,
        messages: messages.map(m => {
          // 处理 assistant 消息（可能包含 tool_calls）
          if (m.role === 'assistant') {
            const contentBlocks = [];

            // 添加文本内容
            if (m.content) {
              contentBlocks.push({ type: 'text', text: m.content });
            }

            // 添加工具调用
            if (m.tool_calls && m.tool_calls.length > 0) {
              for (const tc of m.tool_calls) {
                contentBlocks.push({
                  type: 'tool_use',
                  id: tc.id,
                  name: tc.function.name,
                  input: JSON.parse(tc.function.arguments)
                });
              }
            }

            // 如果没有任何内容，添加空文本
            if (contentBlocks.length === 0) {
              contentBlocks.push({ type: 'text', text: '' });
            }

            return { role: 'assistant', content: contentBlocks };
          }

          // 处理 tool 消息（工具执行结果）
          if (m.role === 'tool') {
            return {
              role: 'user',
              content: [{
                type: 'tool_result',
                tool_use_id: m.tool_call_id,
                content: m.content || ''
              }]
            };
          }

          // 处理普通 user 消息
          return {
            role: 'user',
            content: m.content || ''
          };
        }),
        temperature: options.temperature,
        top_p: options.top_p,
        stream: options.stream || false
      };

      // 添加 tools 支持（Anthropic 格式）
      if (options.tools && Array.isArray(options.tools)) {
        requestBody.tools = options.tools.map(tool => ({
          name: tool.function.name,
          description: tool.function.description,
          input_schema: tool.function.parameters
        }));
        // Anthropic 使用 {type: "auto"} 而不是 "auto"
        if (options.toolChoice && options.toolChoice !== 'auto') {
          requestBody.tool_choice = {
            type: 'tool',
            name: typeof options.toolChoice === 'string' ? options.toolChoice : options.toolChoice?.function?.name
          };
        } else {
          requestBody.tool_choice = { type: 'auto' };
        }
      }

      // 构建请求 URL
      // Anthropic API 标准路径是 /v1/messages
      // 处理 baseURL 末尾可能已包含 /v1 的情况
      let baseEndpoint = this.client.baseURL || '';
      if (baseEndpoint.endsWith('/v1')) {
        baseEndpoint = baseEndpoint.slice(0, -3);
      }
      const url = `${baseEndpoint}/v1/messages`;
      console.log(`[LLM Client] 请求 URL: ${url}`);

      // 发送 HTTP 请求
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.client.apiKey,
          'Authorization': `Bearer ${this.client.apiKey}`,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(this.client.timeout || 300000)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[LLM Client] HTTP 错误: ${response.status} ${response.statusText}`, errorText);
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();

      // 处理响应
      let content = '';
      let toolCalls = null;

      if (data.content) {
        for (const block of data.content) {
          if (block.type === 'text') {
            content += block.text;
          } else if (block.type === 'tool_use') {
            if (!toolCalls) toolCalls = [];
            toolCalls.push({
              id: block.id,
              type: 'function',
              function: {
                name: block.name,
                arguments: JSON.stringify(block.input)
              }
            });
          }
        }
      }

      return {
        success: true,
        content: content,
        toolCalls: toolCalls,
        usage: {
          promptTokens: data.usage?.input_tokens,
          completionTokens: data.usage?.output_tokens,
          totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0)
        },
        model: data.model
      };
    } catch (error) {
      console.error('[LLM Client] chatClaudeCodeDirect error:', {
        message: error.message,
        status: error.status,
        statusText: error.statusText
      });
      return {
        success: false,
        error: error.message,
        errorStatus: error.status,
        details: null
      };
    }
  }

  /**
   * Chat with Anthropic Claude
   * 支持 Function Calling (tools)
   * 支持自动重试和超时处理
   */
  async chatAnthropic(options) {
    const maxRetries = options.maxRetries || 5;
    const initialDelay = options.retryDelay || 30000; // 30秒初始延迟
    const delayIncrement = options.delayIncrement || 10000; // 每次增加10秒
    const maxDelay = 70000; // 最大延迟70秒

    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[LLM Client] chatAnthropic 请求 ${attempt > 1 ? `(重试 ${attempt}/${maxRetries})` : ''}:`, {
          provider: this.provider,
          model: this.model,
          messagesCount: options.messages?.length,
          temperature: options.temperature,
          maxTokens: options.max_tokens,
          hasTools: !!options.tools
        });

        // Convert OpenAI format to Anthropic format
        const systemMessage = options.messages.find(m => m.role === 'system');
        const messages = options.messages.filter(m => m.role !== 'system');

        // 诊断日志：检查消息结构
        console.log('[LLM Client] 转换前消息结构:');
        messages.forEach((m, i) => {
          console.log(`  [${i}] role=${m.role}, hasContent=${!!m.content}, hasToolCalls=${!!m.tool_calls}, toolCallId=${m.tool_call_id}`);
        });

        // 构建请求参数 - 先转换消息，合并连续的 tool 消息
        const convertedMessages = [];
        let i = 0;
        while (i < messages.length) {
          const m = messages[i];

          // 处理 assistant 消息
          if (m.role === 'assistant') {
            const contentBlocks = [];
            if (m.rawContentBlocks && Array.isArray(m.rawContentBlocks)) {
              const thinkingBlocks = m.rawContentBlocks.filter(b => b.type === 'thinking');
              contentBlocks.push(...thinkingBlocks);
            }
            if (m.content) {
              contentBlocks.push({ type: 'text', text: m.content });
            }
            if (m.tool_calls && m.tool_calls.length > 0) {
              for (const tc of m.tool_calls) {
                contentBlocks.push({
                  type: 'tool_use',
                  id: tc.id,
                  name: tc.function.name,
                  input: JSON.parse(tc.function.arguments)
                });
              }
            }
            if (contentBlocks.length === 0) {
              contentBlocks.push({ type: 'text', text: '' });
            }
            convertedMessages.push({ role: 'assistant', content: contentBlocks });
            i++;
          }
          // 处理连续的 tool 消息 - 合并到一个 user 消息
          else if (m.role === 'tool') {
            const toolResults = [];
            while (i < messages.length && messages[i].role === 'tool') {
              toolResults.push({
                type: 'tool_result',
                tool_use_id: messages[i].tool_call_id,
                content: messages[i].content || ''
              });
              i++;
            }
            convertedMessages.push({ role: 'user', content: toolResults });
          }
          // 处理 user 消息
          else {
            convertedMessages.push({ role: 'user', content: m.content || '' });
            i++;
          }
        }

        const requestParams = {
          model: this.model,
          max_tokens: options.max_tokens || 4096,
          system: systemMessage?.content,
          messages: convertedMessages,
          temperature: options.temperature,
          top_p: options.top_p,
          stream: options.stream || false
        };

        // 诊断日志：检查转换后的消息
        console.log('[LLM Client] 转换后消息结构:');
        requestParams.messages.forEach((m, i) => {
          const summary = {
            role: m.role,
            contentType: Array.isArray(m.content) ? m.content.map(c => c.type).join(',') : 'string'
          };
          if (Array.isArray(m.content)) {
            summary.hasToolUse = m.content.some(c => c.type === 'tool_use');
            summary.hasToolResult = m.content.some(c => c.type === 'tool_result');
          }
          console.log(`  [${i}]`, summary);
        });

        // 添加 tools 支持（Anthropic 格式）
        if (options.tools && Array.isArray(options.tools)) {
          requestParams.tools = options.tools.map(tool => ({
            name: tool.function.name,
            description: tool.function.description,
            input_schema: tool.function.parameters
          }));
          // Anthropic 使用 {type: "auto"} 而不是 "auto"
          if (options.toolChoice && options.toolChoice !== 'auto') {
            requestParams.tool_choice = {
              type: 'tool',
              name: typeof options.toolChoice === 'string' ? options.toolChoice : options.toolChoice?.function?.name
            };
          } else {
            requestParams.tool_choice = { type: 'auto' };
          }
        }

        const completion = await this.client.messages.create(requestParams);

        // 处理响应
        let content = '';
        let toolCalls = null;

        for (const block of completion.content) {
          if (block.type === 'text') {
            content += block.text;
          } else if (block.type === 'tool_use') {
            if (!toolCalls) toolCalls = [];
            toolCalls.push({
              id: block.id,
              type: 'function',
              function: {
                name: block.name,
                arguments: JSON.stringify(block.input)
              }
            });
          }
        }

        // 成功：返回结果
        return {
          success: true,
          content: content,
          toolCalls: toolCalls,
          rawContentBlocks: completion.content,  // 保留原始 content blocks（包括 thinking）
          usage: {
            promptTokens: completion.usage?.input_tokens,
            completionTokens: completion.usage?.output_tokens,
            totalTokens: completion.usage?.input_tokens + completion.usage?.output_tokens
          },
          model: completion.model,
          _retryCount: attempt - 1
        };
      } catch (error) {
        lastError = error;

        // 详细的错误日志
        console.error(`[LLM Client] chatAnthropic 错误 (尝试 ${attempt}/${maxRetries}):`, {
          message: error.message,
          name: error.name,
          status: error.status,
          statusText: error.statusText,
          type: error.type,
          code: error.code
        });

        // 检查是否是可重试的错误
        const isRetryable = this.isRetryableError(error);

        if (!isRetryable || attempt >= maxRetries) {
          // 不可重试的错误或已达到最大重试次数
          console.error(`[LLM Client] chatAnthropic 最终失败:`, {
            attempts: attempt,
            isRetryable,
            finalError: error.message
          });

          return {
            success: false,
            error: error.message,
            errorStatus: error.status,
            errorType: error.type,
            details: error.response?.data || null,
            _retryCount: attempt - 1,
            _isRetryable: isRetryable
          };
        }

        // 计算退避延迟：初始30秒，每次+10秒
        const delay = Math.min(initialDelay + (attempt - 1) * delayIncrement, maxDelay);
        console.warn(`[LLM Client] ${delay/1000}s 后重试... (${attempt}/${maxRetries})`);

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // 理论上不会到达这里
    return {
      success: false,
      error: lastError?.message || 'Unknown error after retries',
      _retryCount: maxRetries
    };
  }

  /**
   * 判断错误是否可重试
   */
  isRetryableError(error) {
    const retryablePatterns = [
      'ECONNRESET',
      'ETIMEDOUT',
      'ECONNREFUSED',
      'ENOTFOUND',
      'ECONNABORTED',
      'timeout',
      'Request timed out',
      'fetch failed',
      'network error',
      'temporary failure',
      'rate limit',
      '429',
      '500',
      '502',
      '503',
      '504'
    ];

    const errorMessage = (error.message || '').toLowerCase();
    const errorStatus = error.status || 0;

    // 网络错误通常可重试
    if (retryablePatterns.some(pattern => errorMessage.includes(pattern.toLowerCase()))) {
      return true;
    }

    // 5xx 服务器错误可重试
    if (errorStatus >= 500 && errorStatus < 600) {
      return true;
    }

    // 429 速率限制可重试
    if (errorStatus === 429) {
      return true;
    }

    return false;
  }

  /**
   * Chat with Ollama (local model)
   */
  async chatOllama(options) {
    try {
      // 使用原生 fetch (Node 18+)
      const response = await fetch(`${this.client.baseURL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages: options.messages,
          stream: false,
          options: {
            temperature: options.temperature,
            num_predict: options.max_tokens,
            top_p: options.top_p
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Ollama request failed: ${response.statusText}`);
      }

      const data = await response.json();

      return {
        success: true,
        content: data.message?.content || '',
        usage: {
          promptTokens: data.prompt_eval_count,
          completionTokens: data.eval_count,
          totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0)
        },
        model: this.model
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Chat with custom endpoint
   */
  async chatCustom(options) {
    try {
      // 使用原生 fetch (Node 18+)
      const headers = {
        'Content-Type': 'application/json',
        ...this.client.headers
      };

      if (this.client.apiKey) {
        headers['Authorization'] = `Bearer ${this.client.apiKey}`;
      }

      const response = await fetch(this.client.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(options)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Custom endpoint request failed: ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();

      // Handle various response formats
      const content = data.choices?.[0]?.message?.content ||
                     data.output ||
                     data.message ||
                     data.text ||
                     '';

      return {
        success: true,
        content,
        usage: data.usage || {},
        model: data.model || this.model
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Stream chat completion (for providers that support it)
   */
  async *chatStream(messages, options = {}) {
    const streamOptions = { ...options, stream: true };

    // claude-code provider 根据 clientFormat 选择流式格式
    if (this.provider === 'claude-code') {
      if (this.clientFormat === 'openai') {
        yield* this.streamOpenAI(messages, streamOptions);
      } else {
        yield* this.streamAnthropic(messages, streamOptions);
      }
      return;
    }

    switch (this.provider) {
      case 'openai':
      case 'azure':
        yield* this.streamOpenAI(messages, streamOptions);
        break;
      case 'anthropic':
        yield* this.streamAnthropic(messages, streamOptions);
        break;
      default:
        // Fallback to non-streaming
        const result = await this.chat(messages, options);
        yield result;
    }
  }

  /**
   * Stream from OpenAI
   */
  async *streamOpenAI(messages, options) {
    try {
      const stream = await this.client.chat.completions.create({
        model: this.model,
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 2000,
        stream: true
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          yield { type: 'content', content };
        }
      }

      yield { type: 'done' };
    } catch (error) {
      yield { type: 'error', error: error.message };
    }
  }

  /**
   * Stream from Anthropic
   */
  async *streamAnthropic(messages, options) {
    try {
      console.log(`[LLM Client] streamAnthropic 开始:`, {
        provider: this.provider,
        model: this.model,
        baseURL: this.client?.baseURL,
        messagesCount: messages?.length,
        maxTokens: options.maxTokens ?? 2000,
      });

      const systemMessage = messages.find(m => m.role === 'system');
      const chatMessages = messages.filter(m => m.role !== 'system');

      console.log(`[LLM Client] streamAnthropic 发送请求:`, {
        model: this.model,
        systemLength: systemMessage?.content?.length || 0,
        chatMessagesCount: chatMessages.length,
      });

      const stream = await this.client.messages.create({
        model: this.model,
        max_tokens: options.maxTokens ?? 2000,
        system: systemMessage?.content,
        messages: chatMessages.map(m => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content
        })),
        stream: true
      });

      console.log(`[LLM Client] streamAnthropic 连接成功，开始接收流...`);

      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta') {
          yield { type: 'content', content: chunk.delta.text };
        } else if (chunk.type === 'message_start' || chunk.type === 'message_delta' || chunk.type === 'content_block_start' || chunk.type === 'content_block_stop') {
          // Anthropic stream protocol metadata events - just continue
          continue;
        } else {
          console.log(`[LLM Client] streamAnthropic 未知事件类型: ${chunk.type}`, chunk);
        }
      }

      console.log(`[LLM Client] streamAnthropic 流式完成`);
      yield { type: 'done' };
    } catch (error) {
      console.error(`[LLM Client] streamAnthropic 失败:`, {
        message: error.message,
        status: error.status,
        name: error.name,
        model: this.model,
        provider: this.provider,
        baseURL: this.client?.baseURL,
      });
      // 详细错误信息
      try {
        const fs = require('fs'); const p = require('path');
        fs.appendFileSync(p.join('E:', 'AI', 'dev-quality-inspector', 'data', 'debug.log'),
          `[${new Date().toISOString()}] [streamAnthropic 失败] provider=${this.provider}, model=${this.model}, baseURL=${this.client?.baseURL}, error=${error.message}, status=${error.status}, name=${error.name}\n`);
      } catch(e) {}
      yield { type: 'error', error: error.message };
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config) {
    const oldProvider = this.provider;
    const oldModel = this.model;

    this.config = { ...this.config, ...config };
    if (config.provider || config.model) {
      this.provider = config.provider || this.provider;
      this.model = config.model || this.model;

      console.log(`[LLM Client] updateConfig:`, {
        config,
        oldProvider,
        newProvider: this.provider,
        oldModel,
        newModel: this.model
      });

      this.initialize();
    }
  }

  /**
   * Get current configuration
   */
  getConfig() {
    return {
      provider: this.provider,
      model: this.model,
      temperature: this.config.temperature,
      maxTokens: this.config.maxTokens
    };
  }

  /**
   * Check if the client is ready
   */
  isReady() {
    return this.client !== null;
  }
}

module.exports = LLMClient;
