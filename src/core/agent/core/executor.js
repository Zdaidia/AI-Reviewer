/**
 * Task Executor
 *
 * Executes individual tasks using the available tools.
 * Handles tool selection, parameter validation, and result processing.
 */

const { getSystemPrompt: getToolSelectionPrompt } = require('../prompts/tool-selection');

class TaskExecutor {
  constructor(toolRegistry, llmRouter, memory) {
    this.tools = toolRegistry;
    this.llm = llmRouter;
    this.memory = memory;
    this.executionCallbacks = new Map();
  }

  /**
   * Execute a single task
   */
  async executeTask(task, context = {}) {
    try {
      this.memory.working.setCurrentTask(task);

      // Check if approval is needed
      if (task.requiresApproval) {
        return await this.requestApproval(task, context);
      }

      // Get the tool
      const tool = this.tools.get(task.tool);
      if (!tool) {
        throw new Error(`Tool not found: ${task.tool}`);
      }

      // Execute the tool
      return await this.executeTool(tool, task.parameters || task.params || {}, context);
    } catch (error) {
      return {
        success: false,
        task: task.id,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Execute a tool directly
   */
  async executeTool(tool, parameters, context = {}) {
    // Validate parameters
    const validation = tool.validate(parameters);
    if (!validation.valid) {
      return {
        success: false,
        tool: tool.name,
        error: `Parameter validation failed: ${validation.errors.join(', ')}`,
        timestamp: new Date().toISOString()
      };
    }

    // Emit progress
    this.emitProgress(tool.name, 'executing', `Executing ${tool.name}...`);

    try {
      // Build execution context
      const execContext = {
        ...context,
        onProgress: (message, progress) => {
          this.emitProgress(tool.name, 'progress', message, progress);
        },
        onOutput: (output) => {
          this.memory.working.addToolOutput(tool.name, output);
        }
      };

      // Add event handlers for long-running operations
      if (tool.name === 'test') {
        execContext.onTestOutput = (data) => this.emit('testOutput', data);
        execContext.onTestResult = (data) => this.emit('testResult', data);
      } else if (tool.name === 'run') {
        execContext.onProjectOutput = (data) => this.emit('projectOutput', data);
        execContext.onProjectExit = (data) => this.emit('projectExit', data);
      }

      // Execute
      const startTime = Date.now();
      const result = await tool.execute(parameters, execContext);
      const duration = Date.now() - startTime;

      // Process result
      if (result.success) {
        this.emitProgress(tool.name, 'completed', `Completed ${tool.name} in ${duration}ms`);
        this.updateContextAfterExecution(tool.name, result, execContext);
      } else {
        this.emitProgress(tool.name, 'failed', result.error || 'Execution failed');
      }

      return {
        ...result,
        duration,
        tool: tool.name
      };
    } catch (error) {
      this.emitProgress(tool.name, 'failed', error.message);
      return {
        success: false,
        tool: tool.name,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Request user approval for a task
   */
  async requestApproval(task, context) {
    const approvalRequest = {
      type: 'approval',
      task: task.id,
      tool: task.tool,
      description: task.description,
      parameters: task.parameters || task.params || {},
      timestamp: new Date().toISOString()
    };

    this.emit('approval', approvalRequest);

    // Wait for approval response
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.executionCallbacks.delete(task.id);
        resolve({
          success: false,
          task: task.id,
          error: 'Approval request timed out',
          timestamp: new Date().toISOString()
        });
      }, 300000); // 5 minute timeout

      this.executionCallbacks.set(task.id, {
        resolve,
        timeout,
        request: approvalRequest
      });
    });
  }

  /**
   * Handle approval response
   */
  handleApproval(taskId, approved) {
    const callback = this.executionCallbacks.get(taskId);
    if (!callback) {
      return { success: false, error: 'No pending approval request' };
    }

    clearTimeout(callback.timeout);
    this.executionCallbacks.delete(taskId);

    if (approved) {
      // Execute the task
      const task = this.memory.working.getCurrentPlan()?.tasks.find(t => t.id === taskId);
      if (task) {
        // Remove requiresApproval flag and execute
        const taskToExecute = { ...task, requiresApproval: false };
        return this.executeTask(taskToExecute);
      }
    }

    callback.resolve({
      success: false,
      task: taskId,
      error: 'Task was not approved by user',
      timestamp: new Date().toISOString()
    });

    return { success: true };
  }

  /**
   * Update context after successful execution
   */
  updateContextAfterExecution(toolName, result, context) {
    switch (toolName) {
      case 'scan':
        this.memory.working.addScanResults(result.data, result.data?.target?.path);
        this.memory.semantic.storeCodeAnalysis(result.data?.target?.path, result.data);
        break;

      case 'fix':
        this.memory.working.addFixResult(result.data);
        if (result.data?.pendingApproval) {
          for (const fixId of result.data.pendingApproval) {
            this.memory.working.addPendingAIFix(fixId);
          }
        }
        break;

      case 'test':
        if (result.data?.action === 'run') {
          this.memory.working.addRunningTest({
            testId: result.data.testId,
            testPath: result.data.testPath,
            startTime: new Date().toISOString()
          });
        }
        break;

      case 'run':
        if (result.data?.action === 'run') {
          this.memory.working.addRunningProject({
            projectId: result.data.projectId,
            projectPath: result.data.projectPath,
            startTime: new Date().toISOString()
          });
        }
        break;

      case 'file':
        if (result.data?.action === 'read') {
          this.memory.working.setMetadata('lastReadContent', result.data.content);
        }
        break;
    }
  }

  /**
   * Emit progress update
   */
  emitProgress(tool, status, message, progress = null) {
    const update = {
      type: 'progress',
      tool,
      status,
      message,
      progress,
      timestamp: new Date().toISOString()
    };

    this.emit('progress', update);

    // Update working memory
    if (status === 'executing') {
      this.memory.working.setAgentStatus('working', message, progress);
    } else if (status === 'completed') {
      this.memory.working.setAgentStatus('idle', message, 100);
    } else if (status === 'failed') {
      this.memory.working.addError(message);
    }
  }

  /**
   * Emit event
   */
  emit(event, data) {
    if (this.memory.episodic?.options?.onEvent) {
      this.memory.episodic.options.onEvent(event, data);
    }
  }

  /**
   * Select appropriate tool for a task (uses LLM if needed)
   */
  async selectToolForTask(task, context) {
    // If task already specifies tool, use it
    if (task.tool) {
      const tool = this.tools.get(task.tool);
      if (tool) {
        return { tool, parameters: task.parameters || {} };
      }
    }

    // Use LLM to select tool
    const messages = [
      { role: 'system', content: getToolSelectionPrompt() },
      { role: 'user', content: this.buildToolSelectionPrompt(task, context) }
    ];

    const response = await this.llm.chat('code_analysis', messages, {
      temperature: 0.3
    });

    if (!response.success) {
      throw new Error(`Tool selection failed: ${response.error}`);
    }

    return this.parseToolSelection(response.content);
  }

  /**
   * Build prompt for tool selection
   */
  buildToolSelectionPrompt(task, context) {
    let prompt = `Task: ${task.description || task.action}\n`;
    prompt += `Action Type: ${task.action}\n`;

    if (context.currentFile) {
      prompt += `Current File: ${context.currentFile}\n`;
    }

    if (context.lastScanResults) {
      prompt += `Recent Scan: ${context.lastScanResults.totalIssues} issues found\n`;
    }

    prompt += `\nSelect the best tool and parameters. Available tools: ${this.tools.getAll().map(t => t.name).join(', ')}\n`;
    prompt += `Respond with JSON:
{
  "tool": "tool_name",
  "parameters": { ... },
  "requiresApproval": false,
  "reasoning": "explanation"
}`;

    return prompt;
  }

  /**
   * Parse tool selection response
   */
  parseToolSelection(content) {
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) ||
                     content.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error('Invalid tool selection response');
    }

    const selection = JSON.parse(jsonMatch[1] || jsonMatch[0]);

    return {
      tool: this.tools.get(selection.tool),
      parameters: selection.parameters || {},
      requiresApproval: selection.requiresApproval || false,
      reasoning: selection.reasoning
    };
  }

  /**
   * Cancel pending approvals
   */
  cancelPendingApprovals() {
    for (const [taskId, callback] of this.executionCallbacks) {
      clearTimeout(callback.timeout);
      callback.resolve({
        success: false,
        task: taskId,
        error: 'Cancelled',
        timestamp: new Date().toISOString()
      });
    }
    this.executionCallbacks.clear();
  }

  /**
   * Get pending approvals
   */
  getPendingApprovals() {
    return Array.from(this.executionCallbacks.entries()).map(([taskId, callback]) => ({
      taskId,
      request: callback.request
    }));
  }
}

module.exports = TaskExecutor;
