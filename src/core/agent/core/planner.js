/**
 * Task Planner
 *
 * Decomposes user requests into executable tasks.
 * Uses LLM to understand intent and generate execution plans.
 */

const { getSystemPrompt } = require('../prompts/task-planning');

class TaskPlanner {
  constructor(llmRouter, toolRegistry, memory) {
    this.llm = llmRouter;
    this.tools = toolRegistry;
    this.memory = memory;
  }

  /**
   * Plan a task from user request
   */
  async plan(userRequest, context = {}) {
    // Check if LLM is available
    const hasAvailableLLM = this.llm.getAvailableModels().length > 0;

    if (!hasAvailableLLM) {
      // Use rule-based planning when no LLM is available
      return this.createRuleBasedPlan(userRequest, context);
    }

    // Check for similar past tasks
    const similarTasks = this.memory.findSimilarTasks(userRequest);

    // Build planning context
    const planningContext = this.buildPlanningContext(userRequest, context, similarTasks);

    // Generate plan using LLM
    const plan = await this.generatePlan(userRequest, planningContext);

    // Validate and refine plan
    const validatedPlan = this.validatePlan(plan);

    // Store plan in working memory
    this.memory.working.setCurrentPlan(validatedPlan);

    return validatedPlan;
  }

  /**
   * Create a rule-based plan without LLM
   */
  createRuleBasedPlan(userRequest, context) {
    const request = userRequest.toLowerCase();

    // Determine default target path
    const path = require('path');
    const defaultTargetPath = context.currentProject || context.currentFile || context.workingDirectory || process.cwd();

    // Analyze user intent with simple keyword matching
    let tasks = [];
    let goal = '';

    if (request.includes('扫描') || request.includes('scan') || request.includes('检查') || request.includes('分析')) {
      goal = '扫描代码质量问题';
      tasks.push({
        id: 'task-1',
        action: 'scan',
        tool: 'scan',
        description: '扫描代码文件',
        parameters: {
          targetPath: defaultTargetPath,
          targetType: context.currentFile ? 'file' : 'directory'
        },
        dependencies: [],
        expectedOutcome: '发现代码问题',
        requiresApproval: false,
        status: 'pending'
      });

      // Also fix if mentioned
      if (request.includes('修复') || request.includes('fix')) {
        tasks.push({
          id: 'task-2',
          action: 'fix',
          tool: 'fix',
          description: '修复发现的问题',
          parameters: {
            fixType: 'rule',
            issues: [], // Will be populated from scan results
            options: { addTodo: true, autoFix: true }
          },
          dependencies: ['task-1'],
          expectedOutcome: '问题已修复',
          requiresApproval: true,
          status: 'pending'
        });
      }
    } else if (request.includes('修复') || request.includes('fix')) {
      goal = '修复代码问题';
      tasks.push({
        id: 'task-1',
        action: 'fix',
        tool: 'fix',
        description: '使用规则修复代码问题',
        parameters: {
          fixType: 'rule',
          target: { type: 'batch' },
          issues: [], // Will be populated
          options: { addTodo: true, autoFix: true }
        },
        dependencies: [],
        expectedOutcome: '问题已修复',
        requiresApproval: true,
        status: 'pending'
      });
    } else if (request.includes('测试') || request.includes('test')) {
      goal = '运行测试';
      tasks.push({
        id: 'task-1',
        action: 'test',
        tool: 'test',
        description: '运行测试',
        parameters: {
          action: 'run',
          testPath: null, // User will need to specify
          options: {}
        },
        dependencies: [],
        expectedOutcome: '测试结果',
        requiresApproval: false,
        status: 'pending'
      });
    } else if (request.includes('运行') || request.includes('run') || request.includes('启动')) {
      goal = '运行项目';
      tasks.push({
        id: 'task-1',
        action: 'run',
        tool: 'run',
        description: '启动项目',
        parameters: {
          action: 'run',
          projectPath: defaultTargetPath,
          options: {}
        },
        dependencies: [],
        expectedOutcome: '项目已启动',
        requiresApproval: true,
        status: 'pending'
      });
    } else {
      // Default: scan code
      goal = '分析代码';
      tasks.push({
        id: 'task-1',
        action: 'scan',
        tool: 'scan',
        description: '扫描代码质量',
        parameters: {
          targetPath: defaultTargetPath,
          targetType: 'auto'
        },
        dependencies: [],
        expectedOutcome: '代码分析结果',
        requiresApproval: false,
        status: 'pending'
      });
    }

    return {
      goal,
      tasks,
      estimatedSteps: tasks.length,
      confidence: 0.7,
      note: '使用规则规划（离线模式）- 配置 API Key 以启用完整 AI 功能'
    };
  }

  /**
   * Build context for planning
   */
  buildPlanningContext(userRequest, context, similarTasks) {
    const path = require('path');

    const planningContext = {
      userRequest,
      availableTools: this.tools.getSchemas(),
      currentContext: this.memory.working.getContextSummary(),
      similarTasks: similarTasks.slice(0, 3).map(task => ({
        request: task.userRequest,
        steps: task.steps.map(s => ({ tool: s.tool, action: s.action })),
        result: task.result
      }))
    };

    // Add file/project context if available
    if (context.currentFile) {
      planningContext.currentFile = context.currentFile;
    }
    if (context.currentProject) {
      planningContext.currentProject = context.currentProject;
    }
    if (context.workingDirectory) {
      planningContext.workingDirectory = context.workingDirectory;
    }

    // Add last scan results if available
    if (this.memory.working.getLastScanResults()) {
      planningContext.lastScanResults = this.memory.working.getLastScanResults();
    }

    return planningContext;
  }

  /**
   * Generate plan using LLM
   */
  async generatePlan(userRequest, context) {
    const messages = [
      {
        role: 'system',
        content: getSystemPrompt()
      },
      {
        role: 'user',
        content: this.buildPlanningPrompt(userRequest, context)
      }
    ];

    const response = await this.llm.chat('planning', messages, {
      temperature: 0.3,
      maxTokens: 2000
    });

    if (!response.success) {
      throw new Error(`Failed to generate plan: ${response.error}`);
    }

    return this.parsePlanResponse(response.content);
  }

  /**
   * Build the planning prompt
   */
  buildPlanningPrompt(userRequest, context) {
    const path = require('path');

    let prompt = `User Request: ${userRequest}\n\n`;

    // Add explicit path information
    prompt += `Environment Information:\n`;
    prompt += `- Working Directory: ${process.cwd()}\n`;
    if (context.currentFile) {
      prompt += `- Current File: ${context.currentFile}\n`;
    }
    if (context.currentProject) {
      prompt += `- Current Project: ${context.currentProject}\n`;
    }
    if (context.workingDirectory) {
      prompt += `- Working Directory (from context): ${context.workingDirectory}\n`;
    }
    prompt += `\nIMPORTANT: When using the scan tool, always include the targetPath parameter. `;
    prompt += `Use the Current Project path if no specific file is mentioned.\n\n`;

    prompt += `Available Tools:\n`;
    for (const tool of context.availableTools) {
      prompt += `- ${tool.name}: ${tool.description}\n`;
    }

    if (context.currentContext) {
      prompt += `\nCurrent Context:\n${context.currentContext}\n`;
    }

    if (context.similarTasks && context.similarTasks.length > 0) {
      prompt += `\nSimilar Past Tasks:\n`;
      for (const task of context.similarTasks) {
        prompt += `- Request: "${task.request}"\n`;
        prompt += `  Steps: ${task.steps.map(s => s.tool).join(' → ')}\n`;
      }
    }

    if (context.lastScanResults) {
      prompt += `\nLast Scan Results:\n`;
      prompt += `- Files: ${context.lastScanResults.totalFiles}\n`;
      prompt += `- Issues: ${context.lastScanResults.totalIssues}\n`;
    }

    prompt += `\nPlease create a detailed execution plan. Respond with a JSON object containing:
{
  "goal": "Brief description of the goal",
  "tasks": [
    {
      "id": "task-1",
      "action": "scan|fix|test|run|file",
      "tool": "tool_name",
      "description": "What this task does",
      "parameters": { ... },
      "dependencies": [],
      "expectedOutcome": "Expected result",
      "requiresApproval": false
    }
  ],
  "estimatedSteps": 3,
  "confidence": 0.9
}`;

    return prompt;
  }

  /**
   * Parse LLM response into plan object
   */
  parsePlanResponse(content) {
    try {
      // Extract JSON from response
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) ||
                       content.match(/\{[\s\S]*\}/);

      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const plan = JSON.parse(jsonMatch[1] || jsonMatch[0]);

      // Validate required fields
      if (!plan.goal || !plan.tasks || !Array.isArray(plan.tasks)) {
        throw new Error('Invalid plan structure');
      }

      // Add default values
      plan.estimatedSteps = plan.estimatedSteps || plan.tasks.length;
      plan.confidence = plan.confidence ?? 0.8;

      // Validate tasks
      for (const task of plan.tasks) {
        if (!task.id || !task.action || !task.tool) {
          throw new Error('Invalid task structure');
        }
        task.dependencies = task.dependencies || [];
        task.requiresApproval = task.requiresApproval || false;
      }

      return plan;
    } catch (error) {
      console.error('Failed to parse plan response:', error.message);

      // Return fallback plan
      return this.createFallbackPlan(content);
    }
  }

  /**
   * Create a fallback plan when parsing fails
   */
  createFallbackPlan(content) {
    return {
      goal: 'Execute user request',
      tasks: [
        {
          id: 'task-1',
          action: 'scan',
          tool: 'scan',
          description: 'Scan code for issues',
          parameters: {},
          dependencies: [],
          expectedOutcome: 'Code scan results',
          requiresApproval: false
        }
      ],
      estimatedSteps: 1,
      confidence: 0.3,
      note: 'Fallback plan - LLM response could not be parsed'
    };
  }

  /**
   * Validate plan
   */
  validatePlan(plan) {
    const validated = {
      ...plan,
      tasks: []
    };

    // Build dependency graph and validate
    const taskMap = new Map();
    for (const task of plan.tasks) {
      taskMap.set(task.id, task);
    }

    for (const task of plan.tasks) {
      // Validate dependencies exist
      const validDependencies = task.dependencies.filter(depId => taskMap.has(depId));

      // Check if tool exists
      const toolExists = this.tools.has(task.tool);

      validated.tasks.push({
        ...task,
        dependencies: validDependencies,
        toolAvailable: toolExists,
        status: 'pending'
      });
    }

    // Validate no circular dependencies
    const hasCircular = this.detectCircularDependencies(validated.tasks);
    if (hasCircular) {
      validated.warning = 'Circular dependencies detected - plan may fail';
    }

    return validated;
  }

  /**
   * Detect circular dependencies in tasks
   */
  detectCircularDependencies(tasks) {
    const taskMap = new Map(tasks.map(t => [t.id, t.dependencies]));
    const visited = new Set();
    const recursionStack = new Set();

    const hasCycle = (taskId) => {
      if (recursionStack.has(taskId)) return true;
      if (visited.has(taskId)) return false;

      visited.add(taskId);
      recursionStack.add(taskId);

      const deps = taskMap.get(taskId) || [];
      for (const dep of deps) {
        if (hasCycle(dep)) return true;
      }

      recursionStack.delete(taskId);
      return false;
    };

    for (const task of tasks) {
      if (hasCycle(task.id)) return true;
    }

    return false;
  }

  /**
   * Get next executable tasks from plan
   */
  getNextTasks(plan, completedTasks = new Set()) {
    return plan.tasks.filter(task => {
      if (task.status !== 'pending') return false;

      // Check if all dependencies are completed
      const dependenciesComplete = task.dependencies.every(depId =>
        completedTasks.has(depId)
      );

      return dependenciesComplete;
    });
  }

  /**
   * Update task status in plan
   */
  updateTaskStatus(plan, taskId, status, result = null) {
    const task = plan.tasks.find(t => t.id === taskId);
    if (task) {
      task.status = status;
      if (result) {
        task.result = result;
      }
    }
    return plan;
  }

  /**
   * Get plan progress
   */
  getPlanProgress(plan) {
    const total = plan.tasks.length;
    const completed = plan.tasks.filter(t => t.status === 'completed').length;
    const failed = plan.tasks.filter(t => t.status === 'failed').length;
    const inProgress = plan.tasks.filter(t => t.status === 'in_progress').length;

    return {
      total,
      completed,
      failed,
      inProgress,
      pending: total - completed - failed - inProgress,
      percentage: total > 0 ? Math.round((completed / total) * 100) : 0
    };
  }

  /**
   * Create a simple direct plan (no LLM)
   */
  createDirectPlan(action, tool, parameters) {
    return {
      goal: `Execute ${action} with ${tool}`,
      tasks: [{
        id: 'task-1',
        action,
        tool,
        description: `Execute ${action}`,
        parameters,
        dependencies: [],
        expectedOutcome: 'Action completed',
        requiresApproval: this.tools.get(tool)?.options?.requiresApproval || false
      }],
      estimatedSteps: 1,
      confidence: 1.0
    };
  }
}

module.exports = TaskPlanner;
