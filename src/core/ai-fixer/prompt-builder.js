/**
 * Prompt Builder
 *
 * Constructs GPT prompts for code fixing with context
 */

class PromptBuilder {
  constructor() {
    this.systemPrompt = this.getSystemPrompt();
  }

  /**
   * Get system prompt for AI
   */
  getSystemPrompt() {
    return `You are an expert code reviewer and fixer. Your task is to analyze code issues and provide fixes.

Rules:
1. Only fix the specific issue indicated in the TODO comment
2. Preserve the existing code style and formatting
3. Maintain functionality - do not change behavior beyond fixing the issue
4. Add comments to explain complex fixes
5. Return ONLY the fixed code block, no explanations outside the code

Response format:
\`\`\`language
// Fixed code here
\`\`\``;
  }

  /**
   * Build prompt for fixing a single issue
   * @param {Object} params - Fix parameters
   * @returns {Object} Prompt object
   */
  buildFixPrompt(params) {
    const {
      filePath,
      language,
      issue,
      codeContext,
      dependencyContext,
      fileContent,
    } = params;

    const userPrompt = this.buildUserPrompt(params);

    return {
      system: this.systemPrompt,
      user: userPrompt,
      metadata: {
        filePath,
        language,
        ruleId: issue.ruleId,
        line: issue.line,
      },
    };
  }

  /**
   * Build user prompt
   */
  buildUserPrompt(params) {
    const {
      filePath,
      language,
      issue,
      codeContext,
      dependencyContext,
      fileContent,
    } = params;

    let prompt = `## File: ${filePath}\n`;
    prompt += `## Language: ${language}\n`;
    prompt += `## Issue: ${issue.ruleId} - ${issue.message}\n\n`;

    // Add issue description
    if (issue.suggestion) {
      prompt += `## Suggestion: ${issue.suggestion}\n\n`;
    }

    // Add code context
    prompt += `## Code Context (lines ${codeContext.lineNumbers.start}-${codeContext.lineNumbers.end}):\n`;
    prompt += `\`\`\`${language}\n`;

    if (codeContext.before) {
      prompt += codeContext.before + '\n';
    }

    prompt += `// >>> LINE ${issue.line} <<< ${codeContext.target}\n`;

    if (codeContext.after) {
      prompt += codeContext.after + '\n';
    }

    prompt += `\`\`\`\n\n`;

    // Add dependency context if available
    if (dependencyContext && Object.keys(dependencyContext).length > 0) {
      prompt += `## Related Dependencies:\n`;
      prompt += `\`\`\`
${JSON.stringify(dependencyContext, null, 2)}
\`\`\`
\n\n`;
    }

    // Add full file content if requested
    if (fileContent) {
      prompt += `## Full File Content:\n`;
      prompt += `\`\`\`${language}\n${fileContent}\n\`\`\`\n\n`;
    }

    prompt += `## Task:\n`;
    prompt += `Fix the code issue at line ${issue.line}. `;
    prompt += `The issue is: ${issue.message}.\n\n`;
    prompt += `Provide ONLY the fixed code block. `;
    prompt += `Include the surrounding lines for context (at least 5 lines before and after).\n\n`;

    return prompt;
  }

  /**
   * Build prompt for batch fixing
   * @param {Object} params - Batch fix parameters
   * @returns {Object} Prompt object
   */
  buildBatchFixPrompt(params) {
    const { filePath, language, issues, fileContent } = params;

    let prompt = `## File: ${filePath}\n`;
    prompt += `## Language: ${language}\n`;
    prompt += `## Issues to Fix: ${issues.length}\n\n`;

    // List all issues
    issues.forEach((issue, index) => {
      prompt += `${index + 1}. Line ${issue.line}: [${issue.ruleId}] ${issue.message}\n`;
    });

    prompt += `\n## File Content:\n`;
    prompt += `\`\`\`${language}\n${fileContent}\n\`\`\`\n\n`;

    prompt += `## Task:\n`;
    prompt += `Fix all the listed issues in the file. `;
    prompt += `For each fix, add a comment: // Fixed: [RuleID] description\n\n`;
    prompt += `Provide the complete fixed file content.\n`;

    return {
      system: this.systemPrompt,
      user: prompt,
      metadata: {
        filePath,
        language,
        issueCount: issues.length,
      },
    };
  }

  /**
   * Build prompt for explaining a fix
   * @param {Object} params - Parameters
   * @returns {Object} Prompt object
   */
  buildExplanationPrompt(params) {
    const { originalCode, fixedCode, issue } = params;

    let prompt = `## Original Code:\n`;
    prompt += `\`\`\`\n${originalCode}\n\`\`\`\n\n`;
    prompt += `## Fixed Code:\n`;
    prompt += `\`\`\`\n${fixedCode}\n\`\`\`\n\n`;
    prompt += `## Issue: ${issue.ruleId} - ${issue.message}\n\n`;
    prompt += `## Task:\n`;
    prompt += `Explain what was changed and why. `;
    prompt += `Keep it concise (2-3 sentences).\n`;

    return {
      system: 'You are a code reviewer. Explain code changes clearly and concisely.',
      user: prompt,
    };
  }

  /**
   * Format messages for API call
   * @param {Object} prompt - Prompt object
   * @returns {Array} Formatted messages
   */
  formatMessages(prompt) {
    return [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user },
    ];
  }

  /**
   * Extract code from AI response
   * @param {string} response - AI response
   * @returns {string} Extracted code
   */
  extractCode(response) {
    // Try to extract code from markdown code blocks
    const codeBlockMatch = response.match(/```[\w]*\n([\s\S]*?)```/);
    if (codeBlockMatch) {
      return codeBlockMatch[1].trim();
    }

    // Try to find code block with language identifier
    const langCodeMatch = response.match(/```(\w+)\n([\s\S]*?)```/);
    if (langCodeMatch) {
      return langCodeMatch[2].trim();
    }

    // Return as-is if no code block found
    return response.trim();
  }

  /**
   * Parse AI response
   * @param {string} response - AI response
   * @returns {Object} Parsed response
   */
  parseResponse(response) {
    const code = this.extractCode(response);

    return {
      code,
      rawResponse: response,
      hasCodeBlock: response.includes('```'),
    };
  }
}

module.exports = PromptBuilder;
