/**
 * Fix Tool
 *
 * Wraps the existing TodoManager and AIFixer modules for Agent use.
 * Fixes code issues using either rule-based or AI-powered methods.
 */

const BaseTool = require('./base-tool');

class FixTool extends BaseTool {
  constructor(todoManager, aiFixer) {
    super(
      'fix',
      'Fix code issues using rule-based or AI-powered methods. Can fix single issues, multiple issues in a file, or batch fix across files.',
      [
        {
          name: 'fixType',
          type: 'string',
          description: 'Type of fix: "rule" for rule-based, "ai" for AI-powered',
          required: true
        },
        {
          name: 'target',
          type: 'object',
          description: 'Target specification: { type: "single"|"batch", filePath?: string, issues?: array }',
          required: true
        },
        {
          name: 'issues',
          type: 'array',
          description: 'Array of issue objects to fix',
          required: true
        },
        {
          name: 'options',
          type: 'object',
          description: 'Fix options: { addTodo: boolean, autoFix: boolean, includeDependencies: boolean }',
          required: false,
          default: { addTodo: true, autoFix: true }
        }
      ],
      {
        requiresApproval: true,  // Fixing code should require approval
        dangerous: true
      }
    );
    this.todoManager = todoManager;
    this.aiFixer = aiFixer;
  }

  /**
   * Execute fix operation
   */
  async execute(params, context) {
    const { fixType, target, issues, options = {} } = params;

    // Validate
    const validation = this.validate(params);
    if (!validation.valid) {
      return this.error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    try {
      const fixOptions = {
        addTodo: options.addTodo !== false,
        autoFix: options.autoFix !== false,
        ...options
      };

      if (fixType === 'rule') {
        // Rule-based fix using TodoManager
        return await this.executeRuleFix(target, issues, fixOptions, context);
      } else if (fixType === 'ai') {
        // AI-powered fix using AIFixer
        return await this.executeAIFix(target, issues, fixOptions, context);
      } else {
        return this.error(`Unknown fix type: ${fixType}. Use "rule" or "ai".`);
      }
    } catch (error) {
      return this.error(`Fix failed: ${error.message}`);
    }
  }

  /**
   * Execute rule-based fix
   */
  async executeRuleFix(target, issues, options, context) {
    let result;

    if (target.type === 'single') {
      // Fix single file
      const issuesByFile = {};
      issues.forEach(issue => {
        if (!issuesByFile[issue.filePath]) {
          issuesByFile[issue.filePath] = [];
        }
        issuesByFile[issue.filePath].push(issue);
      });

      const fileIssues = Object.entries(issuesByFile).map(([filePath, issues]) => ({
        filePath,
        issues
      }));

      result = this.todoManager.fixBatch(fileIssues, options);
    } else if (target.type === 'batch') {
      // Batch fix across files
      result = this.todoManager.fixBatch(issues, options);
    } else {
      return this.error(`Invalid target type: ${target.type}`);
    }

    if (result.success) {
      // Update context
      if (context) {
        context.lastFixResult = result;
        context.issuesFixed = (context.issuesFixed || 0) + result.summary.fixedIssues;
      }

      return this.success({
        method: 'rule',
        summary: result.summary,
        fixedIssues: result.summary.fixedIssues,
        skippedIssues: result.summary.skippedIssues,
        details: result.details
      });
    } else {
      return this.error(result.error || 'Rule-based fix failed');
    }
  }

  /**
   * Execute AI-powered fix
   */
  async executeAIFix(target, issues, options, context) {
    // Group issues by file
    const issuesByFile = {};
    issues.forEach(issue => {
      const filePath = issue.filePath || target.filePath;
      if (!issuesByFile[filePath]) {
        issuesByFile[filePath] = [];
      }
      issuesByFile[filePath].push(issue);
    });

    const results = [];
    const totalIssues = issues.length;

    for (const [filePath, fileIssues] of Object.entries(issuesByFile)) {
      const aiResult = await this.aiFixer.fixMultipleIssues({
        filePath,
        issues: fileIssues,
        options: {
          includeDependencies: options.includeDependencies !== false,
          maxDependencyDepth: options.maxDependencyDepth || 2
        }
      });

      if (aiResult.success) {
        results.push({
          filePath,
          fixId: aiResult.fixId,
          issueCount: aiResult.issueCount,
          diff: aiResult.diff
        });
      } else {
        results.push({
          filePath,
          error: aiResult.error
        });
      }
    }

    // Update context
    if (context) {
      context.lastAIFixResults = results;
      context.pendingAIFixes = results.filter(r => r.fixId).map(r => r.fixId);
    }

    return this.success({
      method: 'ai',
      totalIssues,
      filesProcessed: Object.keys(issuesByFile).length,
      results,
      pendingApproval: results.filter(r => r.fixId).length,
      message: `AI fixes generated for ${results.length} file(s). ${results.filter(r => r.fixId).length} pending approval.`
    });
  }

  /**
   * Apply an AI fix
   */
  async applyAIFix(fixId, approved) {
    try {
      const result = this.aiFixer.applyFix(fixId, approved);
      return result.success ? this.success(result) : this.error(result.error);
    } catch (error) {
      return this.error(`Failed to apply fix: ${error.message}`);
    }
  }
}

module.exports = FixTool;
