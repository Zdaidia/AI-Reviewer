/**
 * AI Fixer Module
 *
 * Main module for AI-powered code fixing
 * Integrates dependency analysis, prompt building, and API calls
 */

const AIConfig = require('./config');
const DependencyAnalyzer = require('./dependency-analyzer');
const PromptBuilder = require('./prompt-builder');
const DiffViewer = require('./diff-viewer');

class AIFixer {
  constructor() {
    this.config = new AIConfig();
    this.analyzer = new DependencyAnalyzer();
    this.promptBuilder = new PromptBuilder();
    this.diffViewer = new DiffViewer();
    this.activeFixes = new Map();
  }

  /**
   * Initialize AI fixer with configuration
   * @param {Object} configOverride - Override config
   */
  initialize(configOverride = {}) {
    if (Object.keys(configOverride).length > 0) {
      this.config.updateConfig(configOverride);
    }

    const validation = this.config.validateConfig();
    if (!validation.valid) {
      throw new Error(`Invalid AI config: ${validation.errors.join(', ')}`);
    }

    return { success: true, config: this.config.getConfig() };
  }

  /**
   * Fix a single issue
   * @param {Object} params - Fix parameters
   * @returns {Promise<Object>} Fix result
   */
  async fixSingleIssue(params) {
    const {
      filePath,
      issue,
      options = {},
    } = params;

    try {
      // Read file content
      const fs = require('fs');
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');

      // Get code context around the issue
      const codeContext = this.analyzer.getFileContext(
        filePath,
        issue.line,
        options.contextLines || 10
      );

      // Analyze dependencies if enabled
      let dependencyContext = {};
      if (options.includeDependencies !== false) {
        const analysis = this.analyzer.analyzeFile(filePath, {
          maxDepth: options.maxDependencyDepth || 2,
        });
        dependencyContext = analysis.context;
      }

      // Build prompt
      const prompt = this.promptBuilder.buildFixPrompt({
        filePath,
        language: this.getLanguage(filePath),
        issue,
        codeContext,
        dependencyContext,
        fileContent: options.includeFullFile ? content : null,
      });

      // Call AI API
      const aiResponse = await this.callAI(prompt);

      if (!aiResponse.success) {
        return {
          success: false,
          error: aiResponse.error,
        };
      }

      // Parse response
      const parsed = this.promptBuilder.parseResponse(aiResponse.content);
      const fixedCode = parsed.code;

      // Generate diff
      const originalContext = [
        codeContext.before || '',
        codeContext.target,
        codeContext.after || '',
      ].filter(Boolean).join('\n');

      const diff = this.diffViewer.generateDiff(originalContext, fixedCode, filePath);

      // Store fix for later application
      const fixId = this.generateFixId();
      this.activeFixes.set(fixId, {
        filePath,
        issue,
        original: originalContext,
        fixed: fixedCode,
        diff,
        applied: false,
      });

      return {
        success: true,
        fixId,
        diff,
        fixedCode,
        rawResponse: aiResponse.content,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Fix multiple issues in a file
   * @param {Object} params - Batch fix parameters
   * @returns {Promise<Object>} Batch fix result
   */
  async fixMultipleIssues(params) {
    const {
      filePath,
      issues,
      options = {},
    } = params;

    try {
      const fs = require('fs');
      const content = fs.readFileSync(filePath, 'utf8');

      // Build batch prompt
      const prompt = this.promptBuilder.buildBatchFixPrompt({
        filePath,
        language: this.getLanguage(filePath),
        issues,
        fileContent: content,
      });

      // Call AI API
      const aiResponse = await this.callAI(prompt);

      if (!aiResponse.success) {
        return {
          success: false,
          error: aiResponse.error,
        };
      }

      // Parse response
      const parsed = this.promptBuilder.parseResponse(aiResponse.content);
      const fixedCode = parsed.code;

      // Generate diff
      const diff = this.diffViewer.generateDiff(content, fixedCode, filePath);

      // Store fix
      const fixId = this.generateFixId();
      this.activeFixes.set(fixId, {
        filePath,
        issues,
        original: content,
        fixed: fixedCode,
        diff,
        applied: false,
      });

      return {
        success: true,
        fixId,
        diff,
        fixedCode,
        issueCount: issues.length,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Apply a fix
   * @param {string} fixId - Fix ID
   * @param {boolean} accepted - Whether to accept the fix
   * @returns {Object} Result
   */
  applyFix(fixId, accepted = true) {
    const fix = this.activeFixes.get(fixId);
    if (!fix) {
      return { success: false, error: 'Fix not found' };
    }

    try {
      const fs = require('fs');

      if (accepted) {
        // Write fixed content to file
        fs.writeFileSync(fix.filePath, fix.fixed, 'utf8');
        fix.applied = true;
      }

      this.activeFixes.delete(fixId);

      return {
        success: true,
        applied: accepted,
        filePath: fix.filePath,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Call AI API
   * @param {Object} prompt - Prompt object
   * @returns {Promise<Object>} API response
   */
  async callAI(prompt) {
    try {
      const client = this.config.getApiClient();
      const config = this.config.getConfig();
      const messages = this.promptBuilder.formatMessages(prompt);

      let response;

      switch (config.provider) {
        case 'openai':
        case 'azure':
        case 'zhipu':
        case 'glm':
          response = await this.callOpenAI(client, messages, config);
          break;
        case 'anthropic':
          response = await this.callAnthropic(client, messages, config);
          break;
        case 'custom':
          response = await this.callCustom(client, messages, config);
          break;
        default:
          return {
            success: false,
            error: `Unknown provider: ${config.provider}`,
          };
      }

      return {
        success: true,
        content: response,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Call OpenAI API
   */
  async callOpenAI(client, messages, config) {
    if (!client) {
      throw new Error('OpenAI client not initialized. Check API key.');
    }

    const completion = await client.chat.completions.create({
      model: config.model,
      messages: messages,
      temperature: config.temperature || 0.2,
      max_tokens: config.maxTokens || 2000,
    });

    return completion.choices[0].message.content;
  }

  /**
   * Call Anthropic API (placeholder)
   */
  async callAnthropic(client, messages, config) {
    // Placeholder for Anthropic API integration
    throw new Error('Anthropic provider not yet implemented. Please use OpenAI.');
  }

  /**
   * Call custom API endpoint
   */
  async callCustom(client, messages, config) {
    const fetch = require('node-fetch');

    const response = await fetch(client.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${client.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: messages,
        temperature: config.temperature || 0.2,
        max_tokens: config.maxTokens || 2000,
      }),
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || data.output || '';
  }

  /**
   * Get language from file path
   */
  getLanguage(filePath) {
    const ext = filePath.split('.').pop();
    const langMap = {
      'js': 'javascript',
      'jsx': 'javascript',
      'ts': 'typescript',
      'tsx': 'typescript',
      'vue': 'vue',
      'dart': 'dart',
    };
    return langMap[ext] || 'text';
  }

  /**
   * Generate unique fix ID
   */
  generateFixId() {
    return `fix-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get active fixes
   */
  getActiveFixes() {
    return Array.from(this.activeFixes.entries()).map(([id, fix]) => ({
      id,
      ...fix,
    }));
  }

  /**
   * Clear active fixes
   */
  clearActiveFixes() {
    this.activeFixes.clear();
  }

  /**
   * Get current configuration
   */
  getConfig() {
    return this.config.getConfig();
  }

  /**
   * Update configuration
   */
  updateConfig(updates) {
    return this.config.updateConfig(updates);
  }

  /**
   * Validate configuration
   */
  validateConfig() {
    return this.config.validateConfig();
  }
}

module.exports = AIFixer;
