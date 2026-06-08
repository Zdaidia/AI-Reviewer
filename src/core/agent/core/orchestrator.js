/**
 * Agent Orchestrator
 *
 * Main coordinator for the Agent system.
 * Manages task planning, execution, and memory integration.
 */

const TaskPlanner = require('./planner');
const TaskExecutor = require('./executor');

class AgentOrchestrator {
  constructor(modules, config = {}) {
    this.config = {
      maxIterations: config.maxIterations || 10,
      autoConfirmSafeActions: config.autoConfirmSafeActions || false,
      requireApprovalFor: config.requireApprovalFor || [
        'file_deletion',
        'project_running',
        'expensive_operations'
      ],
      learningEnabled: config.learningEnabled !== false,
      ...config
    };

    // Initialize components
    this.tools = modules.tools;
    this.llm = modules.llm;
    this.memory = modules.memory;

    this.planner = new TaskPlanner(this.llm, this.tools, this.memory);
    this.executor = new TaskExecutor(this.tools, this.llm, this.memory);

    // State
    this.isProcessing = false;
    this.currentPlan = null;
    this.abortController = null;
    this.eventHandlers = new Map();

    // Bind executor events
    this.setupEventHandlers();
  }

  /**
   * Process a user request
   */
  async process(userRequest, context = {}) {
    if (this.isProcessing) {
      return {
        success: false,
        error: 'Agent is already processing a request'
      };
    }

    this.isProcessing = true;
    this.abortController = new AbortController();

    try {
      // Start new task episode
      const episodeId = this.memory.startTask(userRequest, context);
      this.emit('start', { episodeId, request: userRequest });

      // Plan the task
      this.emit('planning', { message: 'Creating execution plan...' });
      const plan = await this.planner.plan(userRequest, context);
      this.currentPlan = plan;

      this.emit('plan', { plan });
      this.emit('thinking', { message: `Plan created with ${plan.tasks.length} steps` });

      // Execute the plan
      const result = await this.executePlan(plan, context);

      // Complete the episode
      const episode = this.memory.completeTask(result);
      this.emit('complete', { episodeId, result, plan });

      return {
        success: true,
        result,
        plan,
        executionTrace: episode.steps,
        stats: this.memory.getStats()
      };
    } catch (error) {
      this.memory.working.addError(error);
      this.memory.failTask(error);
      this.emit('error', { error: error.message });

      return {
        success: false,
        error: error.message,
        context: this.memory.working.getContextSummary()
      };
    } finally {
      this.isProcessing = false;
      this.currentPlan = null;
      this.abortController = null;
    }
  }

  /**
   * Execute a plan
   */
  async executePlan(plan, context) {
    const completedTasks = new Set();
    const failedTasks = new Set();
    const results = [];

    let iteration = 0;
    while (iteration < this.config.maxIterations) {
      iteration++;

      // Get next executable tasks
      const nextTasks = this.planner.getNextTasks(plan, completedTasks);

      if (nextTasks.length === 0) {
        // Check if all tasks are complete
        if (completedTasks.size + failedTasks.size === plan.tasks.length) {
          break;
        }
        // Otherwise, wait for pending tasks (async operations)
        await this.sleep(500);
        continue;
      }

      // Execute tasks
      for (const task of nextTasks) {
        if (this.abortController?.signal.aborted) {
          throw new Error('Task execution aborted');
        }

        this.emit('taskStart', { task });

        // Update task status
        task.status = 'in_progress';
        this.memory.working.setCurrentStep(task);
        this.memory.working.setAgentStatus('working', task.description);

        // Check if approval is needed and not auto-confirmed
        if (task.requiresApproval && !this.config.autoConfirmSafeActions) {
          this.emit('approval', {
            taskId: task.id,
            task: task,
            message: `Requires approval: ${task.description}`
          });

          // Wait for approval (timeout after 5 minutes)
          const approved = await this.waitForApproval(task.id, 300000);

          if (!approved) {
            task.status = 'failed';
            failedTasks.add(task.id);
            this.emit('taskEnd', { task, result: { success: false, error: 'Not approved' } });
            continue;
          }
        }

        // Execute the task
        const result = await this.executor.executeTask(task, context);
        results.push({ taskId: task.id, result });

        if (result.success) {
          task.status = 'completed';
          task.result = result;
          completedTasks.add(task.id);

          // Add to episodic memory
          this.memory.addStep({
            taskId: task.id,
            tool: task.tool,
            action: task.action,
            description: task.description,
            result: result,
            success: true
          });
        } else {
          task.status = 'failed';
          task.error = result.error;
          failedTasks.add(task.id);

          this.memory.addStep({
            taskId: task.id,
            tool: task.tool,
            action: task.action,
            description: task.description,
            error: result.error,
            success: false
          });

          // Decide whether to continue or abort
          if (!this.canContinueOnError(task, plan)) {
            throw new Error(`Task failed: ${task.description} - ${result.error}`);
          }
        }

        // Update progress
        const progress = this.planner.getPlanProgress(plan);
        this.emit('progress', { progress, task });

        this.emit('taskEnd', { task, result });
      }
    }

    // Compile final result
    return this.compileResult(plan, completedTasks, failedTasks, results);
  }

  /**
   * Compile final result from plan execution
   */
  compileResult(plan, completedTasks, failedTasks, results) {
    const progress = this.planner.getPlanProgress(plan);

    return {
      goal: plan.goal,
      status: failedTasks.size === 0 ? 'completed' : 'partial',
      progress,
      tasks: {
        total: plan.tasks.length,
        completed: completedTasks.size,
        failed: failedTasks.size,
        details: plan.tasks.map(t => ({
          id: t.id,
          description: t.description,
          status: t.status,
          error: t.error
        }))
      },
      results: results,
      summary: this.generateSummary(plan, completedTasks, failedTasks)
    };
  }

  /**
   * Generate summary of execution
   */
  generateSummary(plan, completedTasks, failedTasks) {
    const parts = [];

    parts.push(`Completed ${completedTasks.size}/${plan.tasks.length} tasks`);

    if (failedTasks.size > 0) {
      parts.push(`${failedTasks.size} tasks failed`);
    }

    // Collect key achievements
    const achievements = [];

    for (const taskId of completedTasks) {
      const task = plan.tasks.find(t => t.id === taskId);
      if (task) {
        achievements.push(`${task.tool}:${task.action}`);
      }
    }

    if (achievements.length > 0) {
      parts.push(`Actions: ${achievements.join(', ')}`);
    }

    return parts.join('. ');
  }

  /**
   * Check if execution can continue after error
   */
  canContinueOnError(task, plan) {
    // Critical tasks that should abort on failure
    const criticalActions = ['scan', 'file_write'];

    if (criticalActions.includes(task.action)) {
      return false;
    }

    // Check if any remaining tasks depend on this one
    const dependentTasks = plan.tasks.filter(t =>
      t.dependencies.includes(task.id)
    );

    if (dependentTasks.length > 0) {
      return false;
    }

    return true;
  }

  /**
   * Wait for user approval
   */
  async waitForApproval(taskId, timeout = 300000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      if (this.abortController?.signal.aborted) {
        return false;
      }

      // Check if approval was granted
      const approvalStatus = this.memory.working.getMetadata(`approval_${taskId}`);
      if (approvalStatus === 'granted') {
        this.memory.working.setMetadata(`approval_${taskId}`, null);
        return true;
      } else if (approvalStatus === 'denied') {
        this.memory.working.setMetadata(`approval_${taskId}`, null);
        return false;
      }

      await this.sleep(100);
    }

    return false;
  }

  /**
   * Grant approval for a task
   */
  grantApproval(taskId) {
    this.memory.working.setMetadata(`approval_${taskId}`, 'granted');
  }

  /**
   * Deny approval for a task
   */
  denyApproval(taskId) {
    this.memory.working.setMetadata(`approval_${taskId}`, 'denied');
  }

  /**
   * Abort current execution
   */
  abort() {
    if (this.abortController) {
      this.abortController.abort();
      this.executor.cancelPendingApprovals();
      this.emit('aborted', {});
      return true;
    }
    return false;
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      isProcessing: this.isProcessing,
      currentPlan: this.currentPlan,
      progress: this.currentPlan ? this.planner.getPlanProgress(this.currentPlan) : null,
      agentStatus: this.memory.working.getAgentStatus(),
      hasErrors: this.memory.working.hasErrors(),
      hasWarnings: this.memory.working.hasWarnings()
    };
  }

  /**
   * Get execution history
   */
  getHistory(limit = 10) {
    return this.memory.episodic.getRecentEpisodes(limit);
  }

  /**
   * Event handling
   */
  on(event, handler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event).push(handler);
  }

  off(event, handler) {
    if (this.eventHandlers.has(event)) {
      const handlers = this.eventHandlers.get(event);
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  emit(event, data) {
    if (this.eventHandlers.has(event)) {
      for (const handler of this.eventHandlers.get(event)) {
        try {
          handler(data);
        } catch (error) {
          console.error(`Event handler error for ${event}:`, error.message);
        }
      }
    }
  }

  /**
   * Setup event handlers for executor
   */
  setupEventHandlers() {
    this.executor.on = this.on.bind(this);
    this.executor.emit = this.emit.bind(this);
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Update configuration
   */
  updateConfig(config) {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get configuration
   */
  getConfig() {
    return { ...this.config };
  }
}

module.exports = AgentOrchestrator;
