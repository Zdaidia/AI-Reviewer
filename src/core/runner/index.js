/**
 * Project Runner Module
 *
 * Responsibilities:
 * - Detect project startup scripts
 * - Manage subprocess execution
 * - Auto-open browser
 *
 * Supported Projects:
 * - Node.js (npm/yarn/pnpm)
 * - Vue CLI
 * - React (Create React App)
 * - Vite
 * - Next.js
 * - Flutter (NEW!)
 * - Custom scripts
 */

const { spawn, exec } = require('child_process');
const { open } = require('open'); // Using 'open' package for browser
const fs = require('fs');
const path = require('path');
const os = require('os');

class ProjectRunner {
  constructor() {
    this.runningProcesses = new Map();
    this.processOutputs = new Map();
    // Flutter installation path
    this.flutterPath = 'D:\\flutter\\bin\\flutter.bat';
  }

  /**
   * Get Flutter executable path
   * @returns {string} Flutter executable path
   */
  getFlutterCommand() {
    return this.flutterPath;
  }

  /**
   * Detect project type from directory
   * @param {string} projectPath - Project directory path
   * @returns {Object} Project info
   */
  detectProjectType(projectPath) {
    // Check for Flutter project first
    const pubspecPath = path.join(projectPath, 'pubspec.yaml');
    if (fs.existsSync(pubspecPath)) {
      return this.detectFlutterProject(projectPath, pubspecPath);
    }

    // Check for Node.js project
    const packageJsonPath = path.join(projectPath, 'package.json');

    if (!fs.existsSync(packageJsonPath)) {
      return {
        type: 'unknown',
        framework: 'Unknown',
        hasPackageJson: false,
        hasConfigFile: false,
        message: 'No recognized project configuration found. Supported: Node.js (package.json), Flutter (pubspec.yaml)'
      };
    }

    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };

      // Detect project type
      let type = 'nodejs';
      let framework = null;

      if (dependencies.vue) {
        type = 'vue';
        framework = 'vue';
      } else if (dependencies.react || dependencies['react-scripts']) {
        type = 'react';
        framework = 'react';
      } else if (dependencies.next) {
        type = 'next';
        framework = 'next';
      } else if (dependencies.nuxt) {
        type = 'nuxt';
        framework = 'nuxt';
      } else if (dependencies.vite) {
        type = 'vite';
        framework = 'vite';
      } else if (dependencies.svelte) {
        type = 'svelte';
        framework = 'svelte';
      } else if (dependencies.angular) {
        type = 'angular';
        framework = 'angular';
      }

      return {
        type,
        framework,
        hasPackageJson: true,
        hasConfigFile: true,
        packageJson,
        scripts: packageJson.scripts || {},
        dependencies: Object.keys(dependencies),
      };
    } catch (error) {
      return {
        type: 'unknown',
        framework: 'Unknown',
        hasPackageJson: true,
        hasConfigFile: false,
        error: error.message,
      };
    }
  }

  /**
   * Detect Flutter project
   * @param {string} projectPath - Project directory path
   * @param {string} pubspecPath - Path to pubspec.yaml
   * @returns {Object} Flutter project info
   */
  detectFlutterProject(projectPath, pubspecPath) {
    try {
      const content = fs.readFileSync(pubspecPath, 'utf8');

      // Parse pubspec.yaml (basic parsing)
      const nameMatch = content.match(/^name:\s*(.+)$/m);
      const descriptionMatch = content.match(/^description:\s*(.+)$/m);
      const versionMatch = content.match(/^version:\s*(.+)$/m);

      // Check for Flutter dependencies
      const hasFlutterSdk = content.includes('sdk: flutter');
      const hasFlutterPlugin = content.includes('flutter:');

      // Detect Flutter sub-projects
      let subType = 'flutter';
      let framework = 'flutter';

      if (content.includes('flutter_web')) {
        subType = 'flutter-web';
        framework = 'flutter_web';
      }

      return {
        type: subType,
        framework: framework,
        hasPackageJson: false,
        hasConfigFile: true,
        configType: 'pubspec.yaml',
        name: nameMatch ? nameMatch[1].trim() : path.basename(projectPath),
        description: descriptionMatch ? descriptionMatch[1].trim() : 'Flutter project',
        version: versionMatch ? versionMatch[1].trim() : '1.0.0',
        hasFlutterSdk,
        hasFlutterPlugin,
      };
    } catch (error) {
      return {
        type: 'flutter',
        framework: 'flutter',
        hasPackageJson: false,
        hasConfigFile: true,
        configType: 'pubspec.yaml',
        error: error.message,
      };
    }
  }

  /**
   * Find startup script for project
   * @param {string} projectPath - Project directory
   * @param {Object} options - Options
   * @returns {Object} Script info
   */
  findStartScript(projectPath, options = {}) {
    const { customScript = null } = options;
    const projectInfo = this.detectProjectType(projectPath);

    // Handle Flutter projects
    if (projectInfo.type.startsWith('flutter')) {
      return this.findFlutterCommand(projectPath, { customScript });
    }

    if (!projectInfo.hasPackageJson) {
      return {
        success: false,
        error: projectInfo.message || 'No package.json found in project directory',
      };
    }

    // Use custom script if provided
    if (customScript) {
      return {
        success: true,
        command: this.getPackageManagerCommand(projectPath),
        script: customScript,
        fullCommand: this.buildCommand(projectPath, customScript),
      };
    }

    const { scripts, type, framework } = projectInfo;

    // Priority order for startup scripts
    const scriptPriority = [
      'dev',
      'start',
      'serve',
      'run',
      'develop',
    ];

    // Framework-specific defaults
    const frameworkDefaults = {
      vue: ['dev', 'serve', 'start'],
      react: ['start', 'dev'],
      next: ['dev', 'start'],
      nuxt: ['dev', 'start'],
      vite: ['dev', 'start'],
      svelte: ['dev', 'start'],
      angular: ['start', 'serve'],
      nodejs: ['start', 'dev'],
    };

    const priority = frameworkDefaults[type] || scriptPriority;

    // Find first available script
    for (const scriptName of priority) {
      if (scripts[scriptName]) {
        return {
          success: true,
          script: scriptName,
          command: this.getPackageManagerCommand(projectPath),
          fullCommand: this.buildCommand(projectPath, scriptName),
        };
      }
    }

    // If no default script found, list available scripts
    return {
      success: false,
      error: 'No startup script found',
      availableScripts: Object.keys(scripts),
    };
  }

  /**
   * Get package manager command (npm/yarn/pnpm)
   * @param {string} projectPath - Project directory
   * @returns {string} Package manager
   */
  getPackageManagerCommand(projectPath) {
    // Check for lock files
    if (fs.existsSync(path.join(projectPath, 'pnpm-lock.yaml'))) {
      return 'pnpm';
    }
    if (fs.existsSync(path.join(projectPath, 'yarn.lock'))) {
      return 'yarn';
    }
    // Default to npm
    return 'npm';
  }

  /**
   * Build full command for running script
   * @param {string} projectPath - Project directory
   * @param {string} script - Script name
   * @returns {string} Full command
   */
  buildCommand(projectPath, script) {
    const pm = this.getPackageManagerCommand(projectPath);

    switch (pm) {
      case 'yarn':
        return `yarn ${script}`;
      case 'pnpm':
        return `pnpm ${script}`;
      default:
        return `npm run ${script}`;
    }
  }

  /**
   * Detect port from project configuration
   * @param {string} projectPath - Project directory
   * @param {string} script - Script name
   * @returns {number} Port number
   */
  detectPort(projectPath, script) {
    const packageJsonPath = path.join(projectPath, 'package.json');

    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

      // Check for common port configurations
      // Vite
      if (packageJson.vite) {
        return packageJson.vite.server?.port || 5173;
      }

      // Next.js
      if (fs.existsSync(path.join(projectPath, 'next.config.js'))) {
        return 3000;
      }

      // Nuxt
      if (fs.existsSync(path.join(projectPath, 'nuxt.config.js')) ||
          fs.existsSync(path.join(projectPath, 'nuxt.config.ts'))) {
        return 3000;
      }

      // Vue CLI
      const vueConfigPath = path.join(projectPath, 'vue.config.js');
      if (fs.existsSync(vueConfigPath)) {
        return 8080;
      }

      // Default ports by framework
      const projectInfo = this.detectProjectType(projectPath);
      const defaultPorts = {
        vite: 5173,
        next: 3000,
        nuxt: 3000,
        react: 3000,
        vue: 8080,
        angular: 4200,
        svelte: 5000,
      };

      return defaultPorts[projectInfo.type] || 3000;
    } catch (error) {
      return 3000; // Default port
    }
  }

  /**
   * Find Flutter run command
   * @param {string} projectPath - Project directory
   * @param {Object} options - Options
   * @returns {Object} Command info
   */
  findFlutterCommand(projectPath, options = {}) {
    const { customScript = null } = options;

    // Flutter commands priority
    // 使用 web-server 模式而不是 chrome，让 Playwright 能够创建自己的浏览器实例
    const flutterCommands = [
      { command: 'run', args: ['-d', 'web-server'], name: 'Run Web', type: 'web', port: 8080 },
      { command: 'run', args: ['-d', 'web-server'], name: 'Run (Debug)', type: 'debug', port: 8080 },
      { command: 'run', args: ['--release', '-d', 'web-server'], name: 'Run (Release)', type: 'release', port: 8080 },
      { command: 'run', args: ['--profile', '-d', 'web-server'], name: 'Run (Profile)', type: 'profile', port: 8080 },
      { command: 'build', args: ['web'], name: 'Build Web', type: 'build', port: null },
      { command: 'test', args: [], name: 'Run Tests', type: 'test', port: null },
    ];

    if (customScript) {
      // Try to match custom script with available commands
      const matchedCommand = flutterCommands.find(cmd =>
        cmd.name.toLowerCase().includes(customScript.toLowerCase()) ||
        cmd.command === customScript
      );

      if (matchedCommand) {
        return {
          success: true,
          script: matchedCommand.name,
          command: 'flutter',
          fullCommand: `flutter ${matchedCommand.command} ${matchedCommand.args.join(' ')}`,
          type: matchedCommand.type,
          port: matchedCommand.port,
        };
      }

      // Treat as custom flutter command
      return {
        success: true,
        script: customScript,
        command: 'flutter',
        fullCommand: `flutter ${customScript}`,
        type: 'custom',
      };
    }

    // Default to web run for best IDE experience
    const defaultCommand = flutterCommands[0]; // run -d chrome

    return {
      success: true,
      script: defaultCommand.name,
      command: 'flutter',
      fullCommand: `flutter ${defaultCommand.command} ${defaultCommand.args.join(' ')}`,
      type: defaultCommand.type,
      port: defaultCommand.port,
      availableCommands: flutterCommands.map(cmd => ({
        name: cmd.name,
        command: cmd.command,
        args: cmd.args,
        type: cmd.type,
      })),
    };
  }

  /**
   * Run project
   * @param {string} projectPath - Project directory
   * @param {Object} options - Options
   * @returns {Object} Result
   */
  async run(projectPath, options = {}) {
    const {
      script = null,
      openBrowser = true,
      onOutput = null,
      onExit = null,
    } = options;

    try {
      console.log('[Project Runner] Starting project...');
      console.log('[Project Runner] Project path:', projectPath);
      console.log('[Project Runner] Script:', script);

      // Detect project type first
      const projectInfo = this.detectProjectType(projectPath);
      console.log('[Project Runner] Detected project type:', projectInfo.type);

      // Handle Flutter projects
      if (projectInfo.type.startsWith('flutter')) {
        return this.runFlutterProject(projectPath, { script, openBrowser, onOutput, onExit });
      }

      // Find startup script
      const scriptInfo = this.findStartScript(projectPath, { customScript: script });
      console.log('[Project Runner] Script info:', scriptInfo);

      if (!scriptInfo.success) {
        console.error('[Project Runner] Failed to find script:', scriptInfo.error);
        return {
          success: false,
          error: scriptInfo.error,
          availableScripts: scriptInfo.availableScripts,
        };
      }

      const projectId = this.generateProjectId(projectPath);
      const port = this.detectPort(projectPath, scriptInfo.script);

      // Parse command
      const parts = scriptInfo.fullCommand.split(' ');
      const command = parts[0];
      const args = parts.slice(1);

      console.log('[Project Runner] Executing:', command, args.join(' '));
      console.log('[Project Runner] Working directory:', projectPath);

      // Spawn process
      const childProcess = spawn(command, args, {
        cwd: projectPath,
        shell: true,
        env: { ...process.env, FORCE_COLOR: '1' },
      });

      console.log('[Project Runner] Process spawned with PID:', childProcess.pid);

      // Store process info
      this.runningProcesses.set(projectId, {
        process: childProcess,
        projectPath,
        script: scriptInfo.script,
        command: scriptInfo.fullCommand,
        port,
        startTime: Date.now(),
      });

      // Set up output handling
      const outputBuffer = [];

      childProcess.stdout.on('data', (data) => {
        const output = data.toString();
        outputBuffer.push({ type: 'stdout', data: output, timestamp: Date.now() });

        if (onOutput) {
          onOutput(projectId, {
            type: 'stdout',
            data: output,
          });
        }

        // Auto-detect URL in output and open browser
        if (openBrowser && output.includes('Local:') && !this.runningProcesses.get(projectId).browserOpened) {
          const urlMatch = output.match(/(?:Local:|http:)\s*(https?:\/\/[^\s]+)/);
          if (urlMatch) {
            this.openBrowser(urlMatch[1]);
            this.runningProcesses.get(projectId).browserOpened = true;
          }
        }
      });

      childProcess.stderr.on('data', (data) => {
        const output = data.toString();
        outputBuffer.push({ type: 'stderr', data: output, timestamp: Date.now() });

        if (onOutput) {
          onOutput(projectId, {
            type: 'stderr',
            data: output,
          });
        }
      });

      childProcess.on('error', (error) => {
        console.error('[Project Runner] Process error:', error);
        const output = error.toString();
        outputBuffer.push({ type: 'stderr', data: output, timestamp: Date.now() });

        if (onOutput) {
          onOutput(projectId, {
            type: 'stderr',
            data: output,
          });
        }
      });

      childProcess.on('close', (code) => {
        const exitInfo = {
          code,
          timestamp: Date.now(),
        };

        console.log(`[Project Runner] Process closed with exit code: ${code}`);

        if (onExit) {
          onExit(projectId, exitInfo);
        }

        this.runningProcesses.delete(projectId);
      });

      // Store output buffer
      this.processOutputs.set(projectId, outputBuffer);

      // Auto-open browser after delay if not detected in output
      if (openBrowser) {
        setTimeout(() => {
          const procInfo = this.runningProcesses.get(projectId);
          if (procInfo && !procInfo.browserOpened) {
            this.openBrowser(`http://localhost:${port}`);
            procInfo.browserOpened = true;
          }
        }, 3000); // Wait 3 seconds for server to start
      }

      return {
        success: true,
        projectId,
        script: scriptInfo.script,
        command: scriptInfo.fullCommand,
        port,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Open browser to URL
   * @param {string} url - URL to open
   */
  async openBrowser(url) {
    try {
      await open(url);
      console.log(`Opened browser: ${url}`);
    } catch (error) {
      console.error(`Failed to open browser: ${error.message}`);
    }
  }

  /**
   * Stop running project
   * @param {string} projectId - Project ID
   * @returns {Object} Result
   */
  stop(projectId) {
    const procInfo = this.runningProcesses.get(projectId);

    if (!procInfo) {
      return {
        success: false,
        error: 'Project not found or not running',
      };
    }

    try {
      // Kill the process tree
      const kill = require('tree-kill');
      kill(procInfo.process.pid, 'SIGTERM');

      this.runningProcesses.delete(projectId);
      this.processOutputs.delete(projectId);

      return {
        success: true,
        message: 'Project stopped',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Stop all running projects
   * @returns {Object} Result
   */
  stopAll() {
    const results = [];
    const projectIds = Array.from(this.runningProcesses.keys());

    for (const projectId of projectIds) {
      results.push(this.stop(projectId));
    }

    return {
      success: true,
      stopped: results.filter(r => r.success).length,
      total: projectIds.length,
    };
  }

  /**
   * Get project status
   * @param {string} projectId - Project ID
   * @returns {Object} Status
   */
  getStatus(projectId) {
    const procInfo = this.runningProcesses.get(projectId);
    const output = this.processOutputs.get(projectId) || [];

    if (!procInfo) {
      return {
        running: false,
      };
    }

    return {
      running: true,
      projectPath: procInfo.projectPath,
      script: procInfo.script,
      command: procInfo.command,
      port: procInfo.port,
      startTime: procInfo.startTime,
      uptime: Date.now() - procInfo.startTime,
      pid: procInfo.process.pid,
      output: output.slice(-100), // Last 100 output lines
    };
  }

  /**
   * Get all running projects
   * @returns {Array} Running projects
   */
  getRunningProjects() {
    return Array.from(this.runningProcesses.entries()).map(([projectId, info]) => ({
      projectId,
      projectPath: info.projectPath,
      script: info.script,
      command: info.command,
      port: info.port,
      actualUrl: info.actualUrl || null,  // 实际检测到的 URL
      cdpEndpoint: info.cdpEndpoint || null,  // CDP 端点
      startTime: info.startTime,
      uptime: Date.now() - info.startTime,
    }));
  }

  /**
   * Generate unique project ID
   * @param {string} projectPath - Project path
   * @returns {string} Project ID
   */
  generateProjectId(projectPath) {
    const hash = require('crypto')
      .createHash('md5')
      .update(projectPath)
      .digest('hex')
      .substring(0, 8);
    return `proj-${hash}`;
  }

  /**
   * Get available scripts from package.json
   * @param {string} projectPath - Project path
   * @returns {Object} Scripts
   */
  getAvailableScripts(projectPath) {
    const projectInfo = this.detectProjectType(projectPath);

    // Handle Flutter projects
    if (projectInfo.type.startsWith('flutter')) {
      const flutterCmdInfo = this.findFlutterCommand(projectPath);
      return {
        success: true,
        scripts: this.flutterCommandsToScriptMap(flutterCmdInfo.availableCommands || []),
        projectType: 'flutter',
      };
    }

    const packageJsonPath = path.join(projectPath, 'package.json');

    if (!fs.existsSync(packageJsonPath)) {
      return { success: false, error: 'No package.json found' };
    }

    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      return {
        success: true,
        scripts: packageJson.scripts || {},
        projectType: 'nodejs',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Convert Flutter commands to script map format
   * @param {Array} commands - Flutter commands
   * @returns {Object} Script map
   */
  flutterCommandsToScriptMap(commands) {
    const scripts = {};
    commands.forEach(cmd => {
      scripts[cmd.name] = {
        command: cmd.command,
        args: cmd.args,
        type: cmd.type,
        port: cmd.port,
      };
    });
    return scripts;
  }

  /**
   * Run Flutter project
   * @param {string} projectPath - Project directory
   * @param {Object} options - Options
   * @returns {Object} Result
   */
  async runFlutterProject(projectPath, options = {}) {
    const { script = 'Run Web', openBrowser = true, onOutput = null, onExit = null } = options;

    try {
      console.log('[Flutter Runner] Starting Flutter project...');
      console.log('[Flutter Runner] Project path:', projectPath);
      console.log('[Flutter Runner] Selected script:', script);

      // First, verify Flutter is available
      console.log('[Flutter Runner] Verifying Flutter installation...');
      const flutterCheck = await this.checkFlutterInstalled();
      if (!flutterCheck.installed) {
        console.error('[Flutter Runner] Flutter not installed:', flutterCheck.error);
        return {
          success: false,
          error: `Flutter is not installed or not in PATH. ${flutterCheck.error}`,
        };
      }
      console.log('[Flutter Runner] Flutter version:', flutterCheck.version);

      // Get Flutter command info
      const scriptInfo = this.findFlutterCommand(projectPath, { customScript: script });

      console.log('[Flutter Runner] Command info:', scriptInfo);

      if (!scriptInfo.success) {
        console.error('[Flutter Runner] Failed to find command:', scriptInfo.error);
        return {
          success: false,
          error: scriptInfo.error,
        };
      }

      const projectId = this.generateProjectId(projectPath);
      const port = scriptInfo.port || 8080;

      // Build command and args directly from command info
      const command = this.getFlutterCommand();
      console.log('[Flutter Runner] Using Flutter command:', command);

      // 为 Web 运行指定固定端口，便于测试连接
      const flutterWebPort = 8080;  // 固定端口

      // Parse args from fullCommand or build from script name
      let args = [];
      if (script === 'Run Web') {
        // Use -d web-server for web builds (让 Playwright 创建自己的浏览器)
        args = ['run', '-d', 'web-server', '--web-port=' + flutterWebPort];
      } else if (script === 'Run (Debug)') {
        args = ['run', '-d', 'web-server', '--web-port=' + flutterWebPort];
      } else if (script === 'Run (Release)') {
        args = ['run', '--release', '-d', 'web-server', '--web-port=' + flutterWebPort];
      } else if (script === 'Run (Profile)') {
        args = ['run', '--profile', '-d', 'web-server', '--web-port=' + flutterWebPort];
      } else if (script === 'Build Web') {
        args = ['build', 'web'];
      } else if (script === 'Run Tests') {
        args = ['test'];
      } else {
        // Parse from fullCommand as fallback
        const parts = scriptInfo.fullCommand.split(' ');
        args = parts.slice(1); // Skip 'flutter'
        // Add web-port if it's a web run
        if (args.includes('-d') && (args.includes('chrome') || args.includes('web-server'))) {
          // Replace chrome with web-server
          const chromeIndex = args.indexOf('chrome');
          if (chromeIndex !== -1) {
            args[chromeIndex] = 'web-server';
          }
          args.push('--web-port=' + flutterWebPort);
        }
      }

      console.log('[Flutter Runner] Executing:', command, args.join(' '));
      console.log('[Flutter Runner] Working directory:', projectPath);
      console.log('[Flutter Runner] Web server will run on port:', flutterWebPort);

      // Spawn process with better options for output capture
      const childProcess = spawn(command, args, {
        cwd: projectPath,
        shell: true,
        env: { ...process.env, FORCE_COLOR: '1', WEB_PORT: String(flutterWebPort) },
        windowsHide: false,
      });

      console.log('[Flutter Runner] Process spawned with PID:', childProcess.pid);
      console.log('[Flutter Runner] Waiting for output...');

      // Store process info
      this.runningProcesses.set(projectId, {
        process: childProcess,
        projectPath,
        script: scriptInfo.script,
        command: scriptInfo.fullCommand,
        port,
        startTime: Date.now(),
        type: 'flutter',
        actualUrl: null,  // 将存储检测到的实际 URL
        cdpEndpoint: null,  // 将存储 CDP 端点（用于连接现有 Chrome）
      });

      // Set up output handling
      const outputBuffer = [];

      childProcess.stdout.on('data', (data) => {
        const output = data.toString();
        console.log(`[Flutter Runner] STDOUT:`, output.substring(0, 200));
        outputBuffer.push({ type: 'stdout', data: output, timestamp: Date.now() });

        if (onOutput) {
          onOutput(projectId, {
            type: 'stdout',
            data: output,
          });
        }

        // Auto-detect URL in output and open browser for web builds
        // Flutter web 输出格式: "The application is available at: http://localhost:12345"
        // CDP 端点格式: "The application is linked to the debug service: ws://127.0.0.1:PORT/PATH/ws"
        if (scriptInfo.type === 'web') {
          const procInfo = this.runningProcesses.get(projectId);

          // 检测 CDP 端点（用于 Playwright 连接）
          // Flutter Web 可能的输出格式：
          // 1. "The application is linked to the debug service: ws://127.0.0.1:PORT/PATH/ws"
          // 2. "Debug service listening on ws://127.0.0.1:PORT/..."
          // 3. "DevTools debugger and profiler available at: http://127.0.0.1:PORT"
          const cdpPatterns = [
            /debug service:\s*(ws:\/\/[^\s]+)/,
            /debugger (?:is )?listening on?\s*(ws:\/\/[^\s]+)/i,
            /linked to (?:the )?debug service:\s*(ws:\/\/[^\s]+)/i,
          ];

          for (const pattern of cdpPatterns) {
            const cdpMatch = output.match(pattern);
            if (cdpMatch && procInfo) {
              const cdpUrl = cdpMatch[1];
              procInfo.cdpEndpoint = cdpUrl;
              console.log(`[Flutter Runner] 检测到 CDP 端点: ${cdpUrl}`);
              break;
            }
          }

          // 检测应用 URL
          if (output.includes('http://')) {
            // 尝试多种模式匹配 Flutter 输出中的 URL
            // 模式1: "http://localhost:端口" 或 "http://127.0.0.1:端口"
            let urlMatch = output.match(/https?:\/\/(?:localhost|127\.0\.0\.1):\d+/);

            // 模式2: 任何 http URL（排除调试服务器的 ws://）
            if (!urlMatch) {
              const allMatches = output.match(/https?:\/\/[^\s]+/g);
              if (allMatches) {
                // 过滤掉 WebSocket 调试 URL 和 CDP 相关 URL
                // CDP URL 通常格式为: http://127.0.0.1:随机端口/xxx/ws
                urlMatch = allMatches.find(m => {
                  // 排除包含 /ws 路径的 URL（这些是 CDP WebSocket 端点）
                  if (m.includes('/ws') || m.includes('/qlUP') || m.includes('/Co=')) {
                    return false;
                  }
                  // 排除包含 CDP 特征路径的 URL（如 /kSiC2a6dMi8= 这种 base64 编码的路径）
                  // Dart VM Service URL 格式: http://127.0.0.1:PORT/BASE64_STRING
                  const pathMatch = m.match(/https?:\/\/[^\/]+\/[^\/\s]+/);
                  if (pathMatch) {
                    const path = pathMatch[0].split('/').pop();
                    // 如果路径看起来像 base64 编码（较长且包含 = 字符），认为是 CDP 端点
                    if (path.length > 8 && (path.includes('=') || /^[A-Za-z0-9+/=]+$/.test(path))) {
                      return false;
                    }
                  }
                  // 排除明显的调试服务 URL（端口通常大于 40000）
                  const portMatch = m.match(/:(\d+)/);
                  if (portMatch && parseInt(portMatch[1]) > 40000) {
                    return false;
                  }
                  return true;
                });
              }
            }

            if (urlMatch) {
              const detectedUrl = typeof urlMatch === 'string' ? urlMatch : urlMatch[0];
              console.log(`[Flutter Runner] 检测到应用 URL: ${detectedUrl}`);

              // 存储实际 URL - 但不更新端口号（使用固定的 web-port）
              // 因为检测到的 URL 可能是 CDP 端点，而不是实际的 Web 应用
              if (procInfo) {
                // 只存储 URL，不更新端口号
                procInfo.actualUrl = detectedUrl;
                console.log(`[Flutter Runner] 存储检测到的 URL，但保持端口号为: ${procInfo.port}`);
              }

              // 不再自动打开浏览器 - 让测试执行阶段自己打开
              // 这样可以避免打开两个浏览器
              procInfo.browserOpened = true;  // 标记为已处理，避免后备打开
            }
          }
        }
      });

      childProcess.stderr.on('data', (data) => {
        const output = data.toString();
        console.log(`[Flutter Runner] STDERR:`, output.substring(0, 200));
        outputBuffer.push({ type: 'stderr', data: output, timestamp: Date.now() });

        if (onOutput) {
          onOutput(projectId, {
            type: 'stderr',
            data: output,
          });
        }
      });

      childProcess.on('error', (error) => {
        console.error('[Flutter Runner] Process error:', error);
        const output = error.toString();
        outputBuffer.push({ type: 'stderr', data: output, timestamp: Date.now() });

        if (onOutput) {
          onOutput(projectId, {
            type: 'stderr',
            data: output,
          });
        }
      });

      childProcess.on('close', (code) => {
        const exitInfo = {
          code,
          timestamp: Date.now(),
        };

        console.log(`[Flutter Runner] Process closed with exit code: ${code}`);

        if (onExit) {
          onExit(projectId, exitInfo);
        }

        this.runningProcesses.delete(projectId);
      });

      // Store output buffer
      this.processOutputs.set(projectId, outputBuffer);

      // 不再自动打开浏览器 - 让测试执行阶段自己打开
      // 这样可以避免打开两个浏览器
      console.log(`[Flutter Runner] Web 服务器运行在 http://localhost:${port}`);
      console.log(`[Flutter Runner] 测试执行阶段将自动打开浏览器`);

      return {
        success: true,
        projectId,
        script: scriptInfo.script,
        command: scriptInfo.fullCommand,
        port,
        type: 'flutter',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Check if Flutter is installed
   * @returns {Object} Result
   */
  async checkFlutterInstalled() {
    return new Promise((resolve) => {
      console.log('[Flutter Check] Checking if Flutter is installed...');
      const flutterCmd = this.getFlutterCommand();
      console.log('[Flutter Check] Using Flutter path:', flutterCmd);

      // 添加超时处理
      const timeout = setTimeout(() => {
        console.warn('[Flutter Check] Flutter version check timed out, assuming Flutter is installed');
        resolve({
          installed: true,
          version: 'Unknown (timeout)',
        });
      }, 30000); // 30秒超时

      exec(`"${flutterCmd}" --version`, { shell: true, timeout: 25000 }, (error, stdout, stderr) => {
        clearTimeout(timeout);
        if (error) {
          console.error('[Flutter Check] Flutter not found:', error.message);
          resolve({
            installed: false,
            error: error.message,
          });
        } else {
          console.log('[Flutter Check] Flutter found:', stdout.trim() || stderr.trim());
          resolve({
            installed: true,
            version: stdout.trim() || stderr.trim(),
          });
        }
      });
    });
  }
}

module.exports = ProjectRunner;
