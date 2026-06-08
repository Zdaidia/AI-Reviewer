/**
 * Run Tool
 *
 * Wraps the existing ProjectRunner module for Agent use.
 * Detects, runs, and manages project execution.
 */

const BaseTool = require('./base-tool');

class RunTool extends BaseTool {
  constructor(projectRunner) {
    super(
      'run',
      'Detect project type, run projects, and manage running projects. Supports Node.js, React, Vue, Angular, and Flutter projects.',
      [
        {
          name: 'action',
          type: 'string',
          description: 'Action to perform: "detect", "run", "stop", "stop_all", "get_scripts", "get_status"',
          required: true
        },
        {
          name: 'projectPath',
          type: 'string',
          description: 'Path to the project',
          required: false
        },
        {
          name: 'options',
          type: 'object',
          description: 'Action-specific options (e.g., script, port, env)',
          required: false
        }
      ],
      {
        requiresApproval: true,  // Running projects should require approval
        dangerous: false
      }
    );
    this.projectRunner = projectRunner;
  }

  /**
   * Execute run operation
   */
  async execute(params, context) {
    const { action, projectPath, options = {} } = params;

    // Validate
    const validation = this.validate(params);
    if (!validation.valid) {
      return this.error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    try {
      switch (action) {
        case 'detect':
          return await this.detectProject(projectPath, context);
        case 'run':
          return await this.runProject(projectPath, options, context);
        case 'stop':
          return await this.stopProject(options.projectId, context);
        case 'stop_all':
          return await this.stopAll(context);
        case 'get_scripts':
          return await this.getScripts(projectPath, context);
        case 'get_status':
          return await this.getStatus(options.projectId, context);
        default:
          return this.error(`Unknown action: ${action}`);
      }
    } catch (error) {
      return this.error(`Run operation failed: ${error.message}`);
    }
  }

  /**
   * Detect project type
   */
  async detectProject(projectPath, context) {
    if (!projectPath) {
      return this.error('projectPath is required for detect action');
    }

    const result = this.projectRunner.detectProjectType(projectPath);

    if (result.success !== false) {
      if (context) {
        context.detectedProject = {
          path: projectPath,
          type: result.type,
          info: result
        };
      }

      return this.success({
        action: 'detect',
        projectPath,
        type: result.type,
        framework: result.framework,
        scripts: result.scripts || [],
        hasPackageJson: result.hasPackageJson,
        hasPubspec: result.hasPubspec
      });
    } else {
      return this.error(result.error || 'Failed to detect project');
    }
  }

  /**
   * Run project
   */
  async runProject(projectPath, options, context) {
    if (!projectPath) {
      return this.error('projectPath is required for run action');
    }

    // Setup output handlers
    const onOutput = (projectId, output) => {
      if (context && context.onProjectOutput) {
        context.onProjectOutput({ projectId, output });
      }
    };

    const onExit = (projectId, exitInfo) => {
      if (context && context.onProjectExit) {
        context.onProjectExit({ projectId, exitInfo });
      }
    };

    const runOptions = {
      ...options,
      onOutput,
      onExit
    };

    const result = await this.projectRunner.run(projectPath, runOptions);

    if (result.success) {
      if (context) {
        context.runningProjects = context.runningProjects || [];
        context.runningProjects.push({
          projectId: result.projectId,
          projectPath,
          startTime: new Date().toISOString(),
          port: result.port
        });
      }

      return this.success({
        action: 'run',
        projectId: result.projectId,
        projectPath,
        port: result.port,
        pid: result.pid,
        status: 'running',
        message: `Project started on port ${result.port}`
      });
    } else {
      return this.error(result.error || 'Failed to run project');
    }
  }

  /**
   * Stop project
   */
  async stopProject(projectId, context) {
    if (!projectId) {
      return this.error('projectId is required for stop action (options.projectId)');
    }

    const result = this.projectRunner.stop(projectId);

    if (result.success) {
      if (context && context.runningProjects) {
        context.runningProjects = context.runningProjects.filter(p => p.projectId !== projectId);
      }

      return this.success({
        action: 'stop',
        projectId,
        message: 'Project stopped'
      });
    } else {
      return this.error(result.error || 'Failed to stop project');
    }
  }

  /**
   * Stop all projects
   */
  async stopAll(context) {
    const result = this.projectRunner.stopAll();

    if (result.success) {
      if (context) {
        context.runningProjects = [];
      }

      return this.success({
        action: 'stop_all',
        stopped: result.stopped,
        total: result.total,
        message: `Stopped ${result.stopped}/${result.total} projects`
      });
    } else {
      return this.error(result.error || 'Failed to stop projects');
    }
  }

  /**
   * Get available scripts
   */
  async getScripts(projectPath, context) {
    if (!projectPath) {
      return this.error('projectPath is required for get_scripts action');
    }

    const result = this.projectRunner.getAvailableScripts(projectPath);

    if (result.success !== false) {
      return this.success({
        action: 'get_scripts',
        projectPath,
        scripts: result.scripts || []
      });
    } else {
      return this.error(result.error || 'Failed to get scripts');
    }
  }

  /**
   * Get project status
   */
  async getStatus(projectId, context) {
    if (!projectId) {
      return this.error('projectId is required for get_status action (options.projectId)');
    }

    const result = this.projectRunner.getStatus(projectId);

    if (result.success !== false) {
      return this.success({
        action: 'get_status',
        projectId,
        status: result.status,
        pid: result.pid,
        port: result.port
      });
    } else {
      return this.error(result.error || 'Failed to get status');
    }
  }

  /**
   * Get all running projects
   */
  getRunningProjects() {
    const result = this.projectRunner.getRunningProjects();
    return result.success ? result.projects : [];
  }
}

module.exports = RunTool;
