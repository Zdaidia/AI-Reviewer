/**
 * Electron Main Process
 *
 * Responsibilities:
 * - Window management (create, manage, close windows)
 * - File system access
 * - Subprocess management
 * - IPC communication with renderer process
 */

const { app, BrowserWindow, ipcMain, dialog, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { DATA_DIR } = require('./src/core/config/data-dir');

// 设置 OpenAI API key
if (!process.env.OPENAI_API_KEY) {
  process.env.OPENAI_API_KEY = 'sk-codex-100';
}

// 数据目录 - 统一使用 config/data-dir 模块计算

/**
 * 获取资源文件根路径
 * 开发模式：项目根目录（package.json 所在目录）
 * 打包后：app.asar 根目录 或 process.resourcesPath/app.asar
 */
function getAppRoot() {
  if (app.isPackaged) {
    // 打包后，app.getAppPath() 返回 app.asar 的路径
    // 如 C:\Users\xxx\AppData\Local\programs\dev-quality-inspector\resources\app.asar
    return app.getAppPath();
  }
  // 开发模式：项目根目录
  return path.join(__dirname, '../../..');
}

/**
 * 获取资源文件路径（兼容开发模式和打包模式）
 * 打包后，asar 内的文件通过 fs.readFileSync 可以正常读取
 * Worker 线程需要特殊处理（使用 unpacked 路径）
 */
function getResourcePath(...segments) {
  return path.join(getAppRoot(), ...segments);
}

// 调试日志 - 写入文件以便排查打包后问题
const DEBUG_LOG = app.isPackaged ? path.join(DATA_DIR, 'debug.log') : null;
function debugLog(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}\n`;
  if (DEBUG_LOG) {
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.appendFileSync(DEBUG_LOG, line);
    } catch (e) {}
  }
  console.log(line.trim());
}

// Import core modules
const CodeScanner = require('../scanner/index');
const TodoManager = require('../todo/index');
const AIFixer = require('../ai-fixer/index');
const ProjectRunner = require('../runner/index');
const TestingManager = require('../testing/index');
const DependencyLoader = require('../dependency/index');
const AITestAgent = require('../testing/ai-test-agent');
const TestReporter = require('../testing/test-reporter');
const TestCaseStorage = require('../testing/test-case-storage');
const BDDTestParser = require('../testing/bdd-test-parser');
const AIContextGenerator = require('../scanner/ai-context-generator');

// Import Agent modules
const { createToolRegistry } = require('../agent/tools');
const { LLMRouter } = require('../agent/llm');
const { MemoryManager } = require('../agent/memory');
const AgentOrchestrator = require('../agent/core/orchestrator');
const AIContextBuilder = require('../agent/context-builder');
const TaskRecordManager = require('../task-record-manager');

let mainWindow;
let codeScanner;
let deepCodeAnalyzer;  // 深度代码分析器（可选）
let todoManager;
let aiFixer;
let projectRunner;
let testingManager;
let dependencyLoader;
let aiTestAgent;
let testReporter;
let bddTestParser;

// Agent components
let agentOrchestrator;
let agentTools;
let agentLLM;
let agentMemory;
let contextBuilder;
let taskRecordManager;

/**
 * Create main application window
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      webSecurity: true,
    },
    icon: getResourcePath('assets/icon.png'),
    title: 'Dev Quality Inspector',
  });

  // Load the app
  if (!app.isPackaged) {
    // 开发模式：从 dev server 加载
    mainWindow.loadURL('http://localhost:3003');
    mainWindow.webContents.openDevTools();
  } else {
    // 打包模式：从 build 目录加载
    const appPath = app.getAppPath();
    const buildPath = path.join(appPath, 'build');
    const indexPath = path.join(buildPath, 'index.html');

    console.log('Loading app from:', indexPath);
    console.log('File exists:', fs.existsSync(indexPath));

    // Verify the file exists before loading
    if (!fs.existsSync(indexPath)) {
      console.error('index.html not found at:', indexPath);
      // Try alternative paths
      const altPath = path.join(process.cwd(), 'build', 'index.html');
      console.log('Trying alternative path:', altPath);
      if (fs.existsSync(altPath)) {
        mainWindow.loadFile(altPath);
      } else {
        throw new Error(`Cannot find index.html at ${indexPath} or ${altPath}`);
      }
    } else {
      mainWindow.loadFile(indexPath);
      // Open DevTools for debugging
      mainWindow.webContents.openDevTools();
    }
  }

  // Log critical errors only
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (isMainFrame) {
      console.error('Failed to load main page:', errorCode, errorDescription, validatedURL);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * Initialize all modules
 */
function initializeModules() {
  // Initialize scanner
  codeScanner = new CodeScanner();
  const rulesPath = getResourcePath('rules.yaml');
  debugLog(`加载规则文件: ${rulesPath}，存在: ${fs.existsSync(rulesPath)}`);
  codeScanner.loadRules(rulesPath);
  debugLog(`规则加载完成，共 ${codeScanner.rules?.length || 0} 条规则`);

  // Initialize TODO manager
  todoManager = new TodoManager();
  const fixRulesPath = getResourcePath('rules-fix.yaml');
  debugLog(`加载修复规则文件: ${fixRulesPath}，存在: ${fs.existsSync(fixRulesPath)}`);
  todoManager.loadFixRules(fixRulesPath);

  // Initialize AI fixer - 先加载用户保存的配置
  aiFixer = new AIFixer();
  let userAIModel = 'deepseek-v4-pro'; // 默认模型
  try {
    // 读取用户保存的 AI 配置
    const savedConfig = aiFixer.config.getConfig();
    if (savedConfig && savedConfig.model) {
      userAIModel = savedConfig.model;
      console.log(`[Main] 检测到用户保存的模型设置: ${userAIModel}`);
    }

    // 使用智谱AI配置作为默认配置
    const aiConfig = {
      provider: savedConfig?.provider || 'zhipu',
      apiKey: savedConfig?.apiKey || 'sk-IO4OtE6TEQGPAG9DIrs8ok0kOlZxXsWRiDdMNitCJQCoY7RG',
      model: userAIModel,
      apiEndpoint: savedConfig?.apiEndpoint || 'https://newapi.cdskysoft.cn/v1',
      temperature: savedConfig?.temperature || 0.2,
      maxTokens: savedConfig?.maxTokens || 2000
    };
    aiFixer.initialize(aiConfig);
    console.log(`✓ AI Fixer initialized with ${aiConfig.model} (zhipu)`);
  } catch (error) {
    console.log('AI Fixer initialization:', error.message);
  }

  // Initialize project runner
  projectRunner = new ProjectRunner();

  // Initialize testing manager
  testingManager = new TestingManager();

  // Initialize dependency loader
  dependencyLoader = new DependencyLoader();

  // Initialize Test Reporter
  testReporter = new TestReporter({
    outputDir: path.join(DATA_DIR, 'test-reports'),
  });

  // Initialize BDD Test Parser
  bddTestParser = new BDDTestParser();

  // Initialize Test Case Storage
  testCaseStorage = new TestCaseStorage();

  // Initialize Agent components
  initializeAgent();
}

/**
 * Initialize Agent system
 */
function initializeAgent() {
  try {
    // Initialize Context Builder
    contextBuilder = new AIContextBuilder({
      config: {
        useMemory: true,
        autoUpdateMemory: true
      }
    });
    console.log('✓ Context Builder initialized');

    // Create tool registry with all existing modules
    agentTools = createToolRegistry({
      codeScanner,
      todoManager,
      aiFixer,
      testingManager,
      projectRunner,
      contextBuilder
    });

    // Initialize LLM router with user's saved model
    // 注意：需要等 aiFixer 初始化后才能获取用户配置
    const savedAIConfig = aiFixer?.config?.getConfig() || {};
    const userModel = savedAIConfig.model || 'glm-5.1';

    // 使用用户配置的 API Key 和 Endpoint（优先级最高）
    if (savedAIConfig.apiKey && savedAIConfig.apiEndpoint) {
      process.env.ANTHROPIC_AUTH_TOKEN = savedAIConfig.apiKey;
      process.env.ANTHROPIC_BASE_URL = savedAIConfig.apiEndpoint;
      console.log(`[Main] 使用用户配置: ${savedAIConfig.apiEndpoint}, 模型: ${userModel}`);
    } else {
      // 回退到智谱配置
      process.env.ANTHROPIC_AUTH_TOKEN = 'sk-IO4OtE6TEQGPAG9DIrs8ok0kOlZxXsWRiDdMNitCJQCoY7RG';
      process.env.ANTHROPIC_BASE_URL = 'https://newapi.cdskysoft.cn/v1';
      console.log(`[Main] 使用默认配置: zhipu, 模型: ${userModel}`);
    }

    // Check for API keys
    const hasOpenAI = !!(process.env.OPENAI_API_KEY);
    const hasAnthropic = !!(process.env.ANTHROPIC_AUTH_TOKEN);
    let hasZhipu = !!(process.env.ZHIPUAI_API_KEY);

    // 设置智谱 API Key（备用）
    if (!hasZhipu) {
      process.env.ZHIPUAI_API_KEY = 'sk-IO4OtE6TEQGPAG9DIrs8ok0kOlZxXsWRiDdMNitCJQCoY7RG';
      hasZhipu = true;
    }

    agentLLM = new LLMRouter({
      defaultModel: userModel,
      highQualityModel: userModel,
      fastModel: userModel,
      openaiApiKey: process.env.OPENAI_API_KEY,
      anthropicApiKey: process.env.ANTHROPIC_AUTH_TOKEN,
      zhipuApiKey: process.env.ZHIPUAI_API_KEY,
      // 项目配置 (router.team)
      projectApiKey: savedAIConfig.apiKey,
      projectApiEndpoint: savedAIConfig.apiEndpoint
    });

    // Make LLM router available globally for QA Reviewer
    global.llmRouter = agentLLM;

    // 同步用户模型到 QA Reviewer 配置
    try {
      const { QAModelConfig } = require('../qa-reviewer/config/model-config');
      QAModelConfig.setUserModel(userModel);
    } catch (e) {
      console.warn('[Main] 无法设置 QA Reviewer 用户模型:', e.message);
    }

    // Check available models
    const availableModels = agentLLM.getAvailableModels();

    // Initialize memory manager
    agentMemory = new MemoryManager({
      persistToFile: true,
      storagePath: path.join(DATA_DIR, 'agent-memory')
    });

    // Initialize task record manager
    taskRecordManager = new TaskRecordManager({
      baseDir: 'D:/dev-quality-inspector/tasks'
    });
    console.log('✓ Task Record Manager initialized');

    // Initialize agent orchestrator
    agentOrchestrator = new AgentOrchestrator({
      tools: agentTools,
      llm: agentLLM,
      memory: agentMemory
    }, {
      maxIterations: 10,
      autoConfirmSafeActions: false,
      learningEnabled: true
    });

    // Setup event handlers
    setupAgentEventHandlers();

    // Configure TestingManager's AI Test Generator with LLM router
    if (testingManager && testingManager.aiTestGenerator) {
      testingManager.aiTestGenerator.setLLMRouter(agentLLM);
      console.log('✓ AI Test Generator configured with LLM router');
    }

    // Initialize AI Test Agent (after LLM is ready)
    aiTestAgent = new AITestAgent({
      memory: agentMemory,
      llm: agentLLM,
      screenshotDir: path.join(DATA_DIR, 'test-screenshots'),
      designDir: path.join(DATA_DIR, 'designs'),
    });
    console.log('✓ AI Test Agent initialized with LLM');

    // Log initialization status
    console.log('Agent system initialized successfully');
    if (availableModels.length === 0) {
      console.log('  ⚠️  No LLM providers configured - Agent will use rule-based mode');
      console.log('  💡 Set ZHIPUAI_API_KEY (for GLM), OPENAI_API_KEY or ANTHROPIC_API_KEY environment variable for AI features');
    } else {
      console.log('  ✓ Available models:', availableModels.map(m => `${m.provider}:${m.name}`).join(', '));
      if (hasZhipu) {
        const defaultModel = this.config?.defaultModel || 'glm-4';
        console.log(`  🇨🇳 ${defaultModel.toUpperCase()} is ready! (智谱AI ${defaultModel.toUpperCase()} 已就绪)`);
      }
    }
  } catch (error) {
    console.error('Agent initialization error:', error.message);
    // Agent is optional, don't crash if it fails to initialize
  }
}

/**
 * Setup Agent event handlers
 */
function setupAgentEventHandlers() {
  if (!agentOrchestrator) return;

  // Forward agent events to renderer
  agentOrchestrator.on('start', (data) => {
    mainWindow?.webContents.send('agent-event', { type: 'start', ...data });
  });

  agentOrchestrator.on('plan', (data) => {
    mainWindow?.webContents.send('agent-event', { type: 'plan', ...data });
  });

  agentOrchestrator.on('progress', (data) => {
    mainWindow?.webContents.send('agent-event', { type: 'progress', ...data });
  });

  agentOrchestrator.on('taskStart', (data) => {
    mainWindow?.webContents.send('agent-event', { type: 'taskStart', ...data });
  });

  agentOrchestrator.on('taskEnd', (data) => {
    mainWindow?.webContents.send('agent-event', { type: 'taskEnd', ...data });
  });

  agentOrchestrator.on('complete', (data) => {
    mainWindow?.webContents.send('agent-event', { type: 'complete', ...data });
  });

  agentOrchestrator.on('error', (data) => {
    mainWindow?.webContents.send('agent-event', { type: 'error', ...data });
  });

  agentOrchestrator.on('approval', (data) => {
    mainWindow?.webContents.send('agent-event', { type: 'approval', ...data });
  });
}

// ============================================
// IPC Handlers - File Operations
// ============================================

ipcMain.handle('add-file-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'openDirectory', 'multiSelections'],
    filters: [
      { name: 'Excel Files', extensions: ['xlsx', 'xls'] },
      {
        name: 'Supported Files',
        extensions: ['js', 'jsx', 'ts', 'tsx', 'vue', 'dart'],
      },
      { name: 'All Files', extensions: ['*'] },
    ],
  });

  if (result.canceled) {
    return { canceled: true };
  }

  // 排除的目录
  const excludeDirs = [
    'node_modules', '.git', 'dist', 'build', 'coverage',
    // Flutter/Dart 排除
    '.dart_tool', '.fvm', 'flutter_build', '.flutter-plugins',
    '.packages', '.plugin_symlinks',
    // iOS/Android 排除
    'ios', 'android', 'web', 'windows', 'macos', 'linux',
    // IDE 排除
    '.vscode', '.idea', '.vs', '.dartcode',
    // 构建输出排除
    'build', 'out', 'target', 'bin', 'obj', 'Debug', 'Release', 'x64', 'arm64',
    // 缓存排除
    '.next', '.nuxt', '.cache', 'tmp', 'temp',
    // 其他排除
    'vendor', 'third_party', 'ThirdParty', '.generated', 'generated',
  ];

  // 递归读取目录结构的辅助函数
  const readDirectory = (dirPath, relativePath = '') => {
    const items = [];
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        // 跳过排除的目录
        if (entry.isDirectory() && excludeDirs.includes(entry.name)) {
          continue;
        }

        const fullPath = path.join(dirPath, entry.name);
        const childRelativePath = relativePath ? path.join(relativePath, entry.name) : entry.name;

        if (entry.isDirectory()) {
          // 递归读取子目录
          items.push({
            name: entry.name,
            path: fullPath,
            relativePath: childRelativePath,
            type: 'folder',
            children: readDirectory(fullPath, childRelativePath),
          });
        } else if (entry.isFile()) {
          // 检查是否是支持的文件类型
          const ext = path.extname(entry.name).toLowerCase();
          const supportedExts = ['.js', '.jsx', '.ts', '.tsx', '.vue', '.dart', '.json', '.md', '.html', '.css', '.scss', '.yaml', '.yml'];

          if (supportedExts.includes(ext) || ext === '') {
            items.push({
              name: entry.name,
              path: fullPath,
              relativePath: childRelativePath,
              type: 'file',
              extension: ext,
            });
          }
        }
      }
    } catch (error) {
      console.error('Error reading directory:', dirPath, error.message);
    }

    // 排序：目录在前，文件在后，都按字母顺序
    items.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'folder' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    return items;
  };

  // 处理所有选择的文件/文件夹
  const files = await Promise.all(result.filePaths.map(async (filePath) => {
    try {
      const stats = fs.statSync(filePath);
      const isDirectory = stats.isDirectory();

      const fileInfo = {
        path: filePath,
        name: path.basename(filePath),
        type: isDirectory ? 'folder' : 'file',
      };

      // 如果是文件夹，递归读取其内容
      if (isDirectory) {
        fileInfo.children = readDirectory(filePath);
      }

      return fileInfo;
    } catch (error) {
      return {
        path: filePath,
        name: path.basename(filePath),
        type: 'file',
      };
    }
  }));

  return { canceled: false, files };
});

ipcMain.handle('select-file', async (event, options) => {
  const dialogOptions = options ? options : {
    properties: ['openFile'],
    filters: [
      { name: 'All Files', extensions: ['*'] },
    ],
  };

  const result = await dialog.showOpenDialog(mainWindow, dialogOptions);

  if (result.canceled) {
    return { canceled: true };
  }

  return { canceled: false, filePaths: result.filePaths, filePath: result.filePaths[0] };
});

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  });

  if (result.canceled) {
    return { canceled: true };
  }

  return { canceled: false, folderPath: result.filePaths[0] };
});

ipcMain.handle('find-excel-files', async (event, folderPath) => {
  try {
    const excelFiles = [];

    const searchDir = (dir) => {
      try {
        const items = fs.readdirSync(dir);
        for (const item of items) {
          const fullPath = path.join(dir, item);
          try {
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
              // Don't search in node_modules or hidden folders
              if (!item.startsWith('.') && item !== 'node_modules' && item !== '.git') {
                searchDir(fullPath);
              }
            } else if (item.endsWith('.xlsx') || item.endsWith('.xls')) {
              excelFiles.push(fullPath);
            }
          } catch (err) {
            // Skip files we can't access
            continue;
          }
        }
      } catch (err) {
        // Skip directories we can't access
        return;
      }
    };

    searchDir(folderPath);

    return {
      success: true,
      files: excelFiles,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
});

ipcMain.handle('get-file-content', async (event, filePath) => {
  try {
    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'File not found' };
    }

    // 获取文件状态
    const stats = fs.statSync(filePath);

    // 检查是否是文件
    if (!stats.isFile()) {
      return { success: false, error: 'Path is not a file' };
    }

    // 检查文件大小（限制为 10MB）
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    if (stats.size > MAX_FILE_SIZE) {
      return { success: false, error: `File too large (${Math.round(stats.size / 1024 / 1024)}MB). Maximum size is 10MB.` };
    }

    // 检查文件扩展名 - 二进制文件直接返回错误
    const binaryExts = new Set([
      '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.bmp',
      '.woff', '.woff2', '.ttf', '.eot', '.otf',
      '.mp3', '.mp4', '.wav', '.avi', '.mov', '.mkv',
      '.zip', '.tar', '.gz', '.rar', '.7z',
      '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
      '.exe', '.dll', '.so', '.dylib', '.bin', '.dat', '.db', '.sqlite'
    ]);

    const ext = path.extname(filePath).toLowerCase();
    if (binaryExts.has(ext)) {
      return { success: false, error: 'Binary file - preview not supported' };
    }

    // 尝试读取文件内容
    const content = fs.readFileSync(filePath, 'utf8');
    return { success: true, content };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('save-file-content', async (event, filePath, content) => {
  try {
    fs.writeFileSync(filePath, content, 'utf8');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ============================================
// IPC Handlers - Scan Operations
// ============================================

ipcMain.handle('scan-code', async (event, target) => {
  debugLog(`[scan-code] 收到请求: ${JSON.stringify(target)}`);
  debugLog(`[scan-code] codeScanner: ${!!codeScanner}, 规则数: ${codeScanner?.rules?.length || 0}`);
  try {
    let results;

    if (target.type === 'file') {
      results = await codeScanner.scanFile(target.path);
      results = [results];
    } else if (target.type === 'folder' || target.type === 'directory') {
      // 使用默认的优化选项（忽略 target.options 中的非扫描相关字段）
      const scanOptions = {
        excludeDirs: [
          'node_modules', '.git', 'dist', 'build', 'coverage',
          // Flutter/Dart 排除
          '.dart_tool', '.fvm', 'flutter_build', '.flutter-plugins',
          '.packages', '.plugin_symlinks',
          // iOS/Android 排除
          'ios', 'android', 'web', 'windows', 'macos', 'linux',
          // IDE 排除
          '.vscode', '.idea', '.vs', '.dartcode',
          // 构建输出排除
          'build', 'out', 'target', 'bin', 'obj', 'Debug', 'Release', 'x64', 'arm64',
          // 缓存排除
          '.next', '.nuxt', '.cache', 'tmp', 'temp',
          // 其他排除
          'vendor', 'third_party', 'ThirdParty', '.generated', 'generated',
        ],
        excludeFiles: [
          '.min.js', '.min.css', '.map', '.bundle',
          // Flutter/Dart 排除
          'main.dart.js', 'main.dart.js.map', 'flutter_build',
          'package_config.json', '.lock', '.log', 'LOCK', 'LOG',
          // 配置和缓存文件
          '.DS_Store', 'Thumbs.db', 'desktop.ini',
        ],
        maxFileSize: Infinity, // 不限制文件大小
        maxFiles: Infinity, // 不限制文件数量
        onProgress: (progress) => {
          // 发送进度更新到渲染进程
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('scan-progress', progress);
          }
        }
      };
      debugLog(`[scan-code] 扫描文件夹: ${target.path}`);
      results = await codeScanner.scanDirectory(target.path, scanOptions);
      debugLog(`[scan-code] 扫描完成，结果数: ${results?.length || 0}`);
    } else {
      console.error('[IPC] 不支持的扫描类型:', target.type);
      return { success: false, error: `不支持的扫描类型: ${target.type}` };
    }

    const formatted = codeScanner.formatResults(results);
    return { success: true, results: formatted };
  } catch (error) {
    debugLog(`[scan-code] 扫描错误: ${error.message}\n${error.stack}`);
    return { success: false, error: error.message };
  }
});

// ============================================
// IPC Handlers - Partial Scan Operations
// ============================================

/**
 * 获取最新的规则配置（合并默认规则和用户保存的规则）
 * @returns {Array} 规则列表
 */
function getLatestRules() {
  // 默认规则
  const defaultRules = [
    { id: 'JS-001', name: 'No console.log in production', severity: 'warning', languages: ['javascript', 'typescript'], message: '生产代码中使用了 console.log', suggestion: '移除 console.log 或使用适当的日志库', autoFix: true, enabled: true, source: 'builtin' },
    { id: 'JS-002', name: 'No var declarations', severity: 'error', languages: ['javascript', 'typescript'], message: '使用了 var 声明变量', suggestion: '使用 let 或 const 替代 var', autoFix: true, enabled: true, source: 'builtin' },
    { id: 'JS-003', name: 'Missing error handling in async functions', severity: 'error', languages: ['javascript', 'typescript'], message: '异步调用缺少错误处理', suggestion: '用 try-catch 块包装异步调用', autoFix: false, enabled: true, source: 'builtin' },
    { id: 'JS-004', name: 'Missing React key in list', severity: 'error', languages: ['javascript', 'typescript', 'jsx', 'tsx'], message: '列表渲染缺少 key 属性', suggestion: '为列表中的元素添加唯一的 key 属性', autoFix: false, enabled: true, source: 'builtin' },
    { id: 'TS-001', name: 'Missing type annotation', severity: 'warning', languages: ['typescript'], message: '函数缺少返回类型注解', suggestion: '为函数添加返回类型注解', autoFix: false, enabled: true, source: 'builtin' },
    { id: 'TS-002', name: 'Any type usage', severity: 'warning', languages: ['typescript'], message: '使用了 any 类型', suggestion: '使用具体类型替代 any', autoFix: false, enabled: true, source: 'builtin' },
    { id: 'VUE-001', name: 'Missing v-key in v-for', severity: 'error', languages: ['vue'], message: 'v-for 没有 :key 绑定', suggestion: '为 v-for 指令添加 :key 属性', autoFix: false, enabled: true, source: 'builtin' },
    { id: 'VUE-002', name: 'Missing prop validation', severity: 'warning', languages: ['vue'], message: 'Props 定义为数组', suggestion: '将 props 定义为带验证的对象', autoFix: false, enabled: true, source: 'builtin' },
    { id: 'VUE-003', name: 'Console statement in template', severity: 'warning', languages: ['vue'], message: '模板中有 console 语句', suggestion: '从模板中移除 console 语句', autoFix: true, enabled: true, source: 'builtin' },
    { id: 'DART-001', name: 'Missing type annotation', severity: 'info', languages: ['dart'], message: '变量用 var 声明而没有类型', suggestion: '考虑使用显式类型注解', autoFix: false, enabled: true, source: 'builtin' },
    { id: 'DART-002', name: 'Empty catch block', severity: 'error', languages: ['dart'], message: '空的 catch 块', suggestion: '在 catch 块中添加错误处理或日志', autoFix: false, enabled: true, source: 'builtin' },
    { id: 'DART-003', name: 'Missing async await', severity: 'warning', languages: ['dart'], message: '使用 .then() 而不是 async/await', suggestion: '考虑使用 async/await 提高可读性', autoFix: false, enabled: true, source: 'builtin' },
    { id: 'DART-004', name: 'Print statement in production', severity: 'warning', languages: ['dart'], message: '发现 print 语句', suggestion: '移除 print 或使用适当的日志框架', autoFix: true, enabled: true, source: 'builtin' },
    { id: 'DART-005', name: 'Build method without const', severity: 'info', languages: ['dart'], message: 'Build 方法可以使用 const 构造函数', suggestion: '考虑使用 const 构造函数提高性能', autoFix: false, enabled: true, source: 'builtin' },
    { id: 'DART-006', name: 'Missing const for Widgets', severity: 'info', languages: ['dart'], message: 'Widget 构造函数可以是 const', suggestion: '考虑使用 const 提高性能', autoFix: false, enabled: true, source: 'builtin' },
    { id: 'DART-007', name: 'Missing return type', severity: 'warning', languages: ['dart'], message: '函数缺少返回类型注解', suggestion: '为函数添加返回类型注解', autoFix: false, enabled: true, source: 'builtin' },
    { id: 'DART-008', name: 'Ignore annotation', severity: 'warning', languages: ['dart'], message: '使用了 ignore 注解', suggestion: '审查是否需要忽略', autoFix: false, enabled: true, source: 'builtin' },
    { id: 'DART-NULL-001', name: 'Nullable generic list declaration', severity: 'warning', languages: ['dart'], message: '列表元素类型为 nullable，访问时需进行空值检查', suggestion: '使用 ?.firstOrNull 或在访问前检查列表是否为空', autoFix: false, enabled: true, source: 'builtin' },
    { id: 'DART-NULL-002', name: 'Unsafe list first/last access', severity: 'error', languages: ['dart'], message: '.first/.last 在空列表上会抛出异常，且元素可能为 null', suggestion: '使用 firstOrNull/lastOrNull 或先检查 isEmpty/length', autoFix: false, enabled: true, source: 'builtin' },
    { id: 'DART-NULL-003', name: 'RxList empty initialization', severity: 'warning', languages: ['dart'], message: 'RxList.empty() 创建空列表，后续 .first/.last 访问会抛出异常', suggestion: '初始化时添加默认元素或使用 .firstOrNull/.lastOrNull', autoFix: false, enabled: true, source: 'builtin' },
    { id: 'DART-NULL-004', name: 'Force unwrap operator', severity: 'warning', languages: ['dart'], message: '使用 ! 强制解包可能导致运行时空指针异常', suggestion: '使用 ?. 或 ?? 操作符进行安全的空值处理', autoFix: false, enabled: true, source: 'builtin' },
    { id: 'DART-NULL-005', name: 'Unsafe nullable property chain', severity: 'warning', languages: ['dart'], message: '多层属性访问缺少空值保护，中间属性可能为 null', suggestion: '使用可选链 ?. 保护中间属性访问', autoFix: false, enabled: true, source: 'builtin' },
    { id: 'DART-NULL-006', name: 'Late variable potential null access', severity: 'warning', languages: ['dart'], message: 'late 变量在初始化前访问会抛出 LateInitializationError', suggestion: '确保在使用前完成初始化，或考虑使用 nullable 类型', autoFix: false, enabled: true, source: 'builtin' },
    { id: 'GEN-001', name: 'File too long', severity: 'warning', languages: ['javascript', 'typescript', 'vue', 'dart'], message: '文件超过推荐长度 (300 行)', suggestion: '考虑将文件拆分为更小的模块', autoFix: false, enabled: true, source: 'builtin' },
    { id: 'GEN-002', name: 'Missing file header comment', severity: 'info', languages: ['javascript', 'typescript', 'vue', 'dart'], message: '缺少文件头注释', suggestion: '添加包含描述和作者的文件头', autoFix: false, enabled: true, source: 'builtin' },
    { id: 'GEN-003', name: 'Line too long', severity: 'warning', languages: ['javascript', 'typescript', 'vue', 'dart'], message: '行超过 120 字符', suggestion: '拆分长行以提高可读性', autoFix: false, enabled: true, source: 'builtin' },
    { id: 'GEN-004', name: 'TODO without code reference', severity: 'info', languages: ['javascript', 'typescript', 'vue', 'dart'], message: 'TODO 注释没有代码引用', suggestion: '使用格式: // TODO: [CODE-ID] 描述', autoFix: false, enabled: true, source: 'builtin' },
  ];

  // 加载用户保存的规则配置
  const configDir = path.join(os.homedir(), '.dqi');
  const rulesConfigPath = path.join(configDir, 'rules-config.json');

  if (fs.existsSync(rulesConfigPath)) {
    try {
      const savedRules = JSON.parse(fs.readFileSync(rulesConfigPath, 'utf8'));
      // 合并：内置规则使用保存的 enabled 状态，添加用户导入规则
      const mergedRules = defaultRules.map(dr => {
        const saved = savedRules.find(sr => sr.id === dr.id);
        if (saved) {
          return { ...dr, enabled: saved.enabled };
        }
        return dr;
      });
      // 添加用户导入的规则
      const userImportedRules = savedRules.filter(sr => sr.source === 'user-imported');
      return [...mergedRules, ...userImportedRules];
    } catch (e) {
      console.error('[getLatestRules] 加载用户规则配置失败:', e.message);
    }
  }

  return defaultRules;
}

/**
 * 批量扫描指定文件列表
 * 用于部分扫描功能
 */
ipcMain.handle('scan-files', async (event, filePaths, options = {}) => {
  console.log('[IPC] scan-files 收到文件数:', filePaths?.length || 0);
  console.log('[IPC] scan-files 文件列表:', filePaths?.slice(0, 5));

  try {
    if (!filePaths || !Array.isArray(filePaths) || filePaths.length === 0) {
      return { success: false, error: '请提供要扫描的文件列表' };
    }

    // 如果要求使用最新规则，更新 codeScanner 的规则配置
    if (options.useLatestRules) {
      const latestRules = getLatestRules();
      if (codeScanner && codeScanner.setRulesConfig) {
        codeScanner.setRulesConfig(latestRules);
        console.log('[IPC] scan-files 已更新为最新规则配置');
      }
    }

    const results = [];
    const useAST = options.useAST !== false;

    for (const filePath of filePaths) {
      // 检查文件是否存在
      if (!fs.existsSync(filePath)) {
        console.warn('[IPC] scan-files 文件不存在:', filePath);
        continue;
      }

      // 检查是否是支持的文件类型
      const ext = path.extname(filePath).toLowerCase();
      const supportedExts = ['.dart', '.js', '.jsx', '.ts', '.tsx', '.vue', '.html', '.css'];
      if (!supportedExts.includes(ext)) {
        continue;
      }

      // 扫描单个文件
      const result = await codeScanner.scanFile(filePath);
      if (result && result.issues && result.issues.length > 0) {
        results.push(result);
      }

      // 发送进度更新
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('scan-progress', {
          scanned: results.length,
          total: filePaths.length,
          current: path.basename(filePath),
          phase: 'scanning_files'
        });
      }
    }

    console.log('[IPC] scan-files 扫描完成，共', results.length, '个文件有问题');
    const formatted = codeScanner.formatResults(results);
    return { success: true, results: formatted, scannedFiles: results.length };
  } catch (error) {
    console.error('[IPC] scan-files 错误:', error.message);
    return { success: false, error: error.message };
  }
});

/**
 * 扫描指定文件夹列表
 * 用于部分扫描功能（包含文件夹内的所有文件）
 */
ipcMain.handle('scan-folders', async (event, folderPaths, options = {}) => {
  console.log('[IPC] scan-folders 收到文件夹数:', folderPaths?.length || 0);

  try {
    if (!folderPaths || !Array.isArray(folderPaths) || folderPaths.length === 0) {
      return { success: false, error: '请提供要扫描的文件夹列表' };
    }

    const allResults = [];
    const scanOptions = {
      excludeDirs: options.excludeDirs || [
        'node_modules', '.git', 'dist', 'build', 'coverage',
        'ios', 'android', '.dart_tool', 'web', 'windows', 'macos', 'linux',
      ],
      excludeFiles: options.excludeFiles || ['.min.js', '.min.css', '.map', '.bundle'],
      maxFileSize: options.maxFileSize || Infinity,
      maxFiles: options.maxFiles || 1000, // 部分扫描限制文件数
      onProgress: (progress) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('scan-progress', progress);
        }
      }
    };

    for (const folderPath of folderPaths) {
      if (!fs.existsSync(folderPath)) {
        console.warn('[IPC] scan-folders 文件夹不存在:', folderPath);
        continue;
      }

      console.log('[IPC] scan-folders 扫描文件夹:', folderPath);
      const folderResults = await codeScanner.scanDirectory(folderPath, scanOptions);

      if (folderResults && folderResults.length > 0) {
        allResults.push(...folderResults);
      }
    }

    console.log('[IPC] scan-folders 扫描完成，共', allResults.length, '个文件');
    const formatted = codeScanner.formatResults(allResults);
    return { success: true, results: formatted, scannedFiles: allResults.length };
  } catch (error) {
    console.error('[IPC] scan-folders 错误:', error.message);
    return { success: false, error: error.message };
  }
});

/**
 * 获取指定文件的依赖列表
 * 用于部分扫描时的依赖扩展功能
 */
ipcMain.handle('get-file-dependencies', async (event, projectPath, filePaths, direction = 'imports') => {
  console.log('[IPC] get-file-dependencies 收到请求:', { projectPath, filePathCount: filePaths?.length, direction });

  try {
    if (!projectPath || !filePaths || !Array.isArray(filePaths)) {
      return { success: false, error: '请提供项目路径和文件列表' };
    }

    // 加载代码图
    const folderName = path.basename(projectPath);
    const codeGraphPath = path.join(DATA_DIR, 'AI_Scan_file', folderName, '.code-graph.json');

    if (!fs.existsSync(codeGraphPath)) {
      return { success: false, error: '代码图不存在，请先扫描项目' };
    }

    const codeGraph = JSON.parse(fs.readFileSync(codeGraphPath, 'utf8'));
    const dependencies = new Set();

    // 根据方向查找依赖
    for (const filePath of filePaths) {
      const normalizedPath = filePath.replace(/\\/g, '/');

      if (direction === 'imports') {
        // 查找该文件 import 了哪些文件（edges.from = filePath）
        const edges = codeGraph.edges || [];
        edges.forEach(edge => {
          if (edge.from && edge.from.replace(/\\/g, '/') === normalizedPath && edge.to) {
            dependencies.add(edge.to);
          }
        });
      } else if (direction === 'referencedBy') {
        // 查找哪些文件引用了该文件（edges.to = filePath）
        const edges = codeGraph.edges || [];
        edges.forEach(edge => {
          if (edge.to && edge.to.replace(/\\/g, '/') === normalizedPath && edge.from) {
            dependencies.add(edge.from);
          }
        });
      }
    }

    // 过滤掉不在项目内的文件
    const projectBasePath = projectPath.replace(/\\/g, '/');
    const validDependencies = Array.from(dependencies).filter(dep => {
      const normalizedDep = dep.replace(/\\/g, '/');
      return normalizedDep.startsWith(projectBasePath) && fs.existsSync(dep);
    });

    console.log('[IPC] get-file-dependencies 找到依赖文件:', validDependencies.length);

    return {
      success: true,
      dependencies: validDependencies,
      count: validDependencies.length
    };
  } catch (error) {
    console.error('[IPC] get-file-dependencies 错误:', error.message);
    return { success: false, error: error.message };
  }
});

/**
 * 生成完整的 AI Context Markdown 文件
 * 使用 AIContextGenerator 生成类似参考文档的完整项目上下文
 */
async function generateAIContextMarkdown(folderName, projectPath, scanResults) {
  console.log('[AI Context] 开始生成 AI 上下文文档...');
  console.log('[AI Context] projectPath:', projectPath);
  console.log('[AI Context] scanResults keys:', Object.keys(scanResults || {}));

  try {
    console.log('[AI Context] 创建 AIContextGenerator...');
    const generator = new AIContextGenerator();

    // 生成完整的 AI 上下文
    console.log('[AI Context] 调用 generator.generate...');
    const result = await generator.generate(projectPath, scanResults);
    console.log('[AI Context] generator.generate 完成, markdown length:', result?.markdown?.length);

    // 在文档末尾添加扫描质量报告
    const astStats = scanResults.astStats || {};
    const issues = scanResults.issues || [];
    const now = new Date().toISOString().split('T')[0];

    // 统计问题
    const errorCount = issues.filter(i => i.severity === 'error').length;
    const warningCount = issues.filter(i => i.severity === 'warning').length;
    const infoCount = issues.filter(i => i.severity === 'info').length;

    // 扫描质量报告部分
    const qualityReport = `

---

## 📊 代码质量报告 (扫描结果)

> **扫描日期**: ${now}
> **扫描器**: Dev Quality Inspector AST Scanner

### 问题统计
| 严重程度 | 数量 | 占比 |
|---------|------|------|
| 🔴 Error | ${errorCount} | ${issues.length > 0 ? ((errorCount / issues.length) * 100).toFixed(1) : 0}% |
| 🟡 Warning | ${warningCount} | ${issues.length > 0 ? ((warningCount / issues.length) * 100).toFixed(1) : 0}% |
| 🔵 Info | ${infoCount} | ${issues.length > 0 ? ((infoCount / issues.length) * 100).toFixed(1) : 0}% |
| **总计** | **${issues.length}** | 100% |

### 代码统计
- **解析文件数**: ${astStats.filesParsed || 0}
- **函数总数**: ${astStats.totalFunctions || 0}
- **类总数**: ${astStats.totalClasses || 0}
- **导入语句**: ${astStats.totalImports || 0}
- **导出语句**: ${astStats.totalExports || 0}
- **API 调用**: ${astStats.totalApiCalls || 0}
- **路由定义**: ${astStats.totalRoutes || 0}

### 质量评分
${errorCount > 100 ? '⭐⭐ 需要改进' : errorCount > 50 ? '⭐⭐⭐ 一般' : errorCount > 10 ? '⭐⭐⭐⭐ 良好' : '⭐⭐⭐⭐⭐ 优秀'}

### 主要问题分析
${issues.length > 0 ? `#### 最常见的问题
${Object.entries(
  issues.reduce((acc, i) => {
    const rule = i.ruleId || 'unknown';
    acc[rule] = (acc[rule] || 0) + 1;
    return acc;
  }, {})
)
.sort((a, b) => b[1] - a[1])
.slice(0, 10)
.map(([rule, count]) => `- **${rule}**: ${count} 次`)
.join('\n') || '- 无问题记录'}` : '#### ✅ 未发现代码质量问题'}

---

**文档生成时间**: ${result.context?.metadata?.generatedAt || new Date().toISOString()}
**文档版本**: ${result.context?.metadata?.version || '1.0.0'}
*本文档由 Dev Quality Inspector 自动生成*
`;

    return result.markdown + qualityReport;
  } catch (error) {
    console.error('[AI Context] 生成文档失败:', error.message);
    console.error('[AI Context] Error stack:', error.stack);
    // 降级到简化版本
    console.log('[AI Context] 降级到简化版本...');
    return generateSimpleAIContext(folderName, projectPath, scanResults);
  }
}

/**
 * 生成简化版的 AI 上下文文档（降级方案）
 */
function generateSimpleAIContext(folderName, projectPath, scanResults) {
  const astStats = scanResults.astStats || {};
  const codeGraph = scanResults.codeGraph || {};
  const issues = scanResults.issues || [];
  const now = new Date().toISOString().split('T')[0];

  const errorCount = issues.filter(i => i.severity === 'error').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;
  const infoCount = issues.filter(i => i.severity === 'info').length;

  const languages = codeGraph.metadata?.languages || [];
  const primaryLanguage = languages[0] || 'unknown';

  return `# AI_CONTEXT.md - 项目上下文文档

## 📋 项目概述

**项目名称**: ${folderName}
**项目路径**: ${projectPath}
**扫描日期**: ${now}
**主要语言**: ${primaryLanguage}

---

## 🏗️ 技术栈

### 核心框架
${primaryLanguage === 'dart' ? '- **Flutter**: 跨平台 UI 框架\n- **Dart**: 编程语言' : ''}
${primaryLanguage === 'javascript' || primaryLanguage === 'typescript' ? '- **JavaScript/TypeScript**: 编程语言' : ''}
${primaryLanguage === 'vue' ? '- **Vue.js**: 前端框架' : ''}

---

## 📁 项目结构

### 目录概览
\`\`\`
${folderName}/
├── (目录结构待详细分析)
└── ...
\`\`\`

---

## 📊 代码质量报告

### 问题统计
| 严重程度 | 数量 |
|---------|------|
| 🔴 Error | ${errorCount} |
| 🟡 Warning | ${warningCount} |
| 🔵 Info | ${infoCount} |
| **总计** | **${issues.length}** |

### 代码统计
- **解析文件数**: ${astStats.filesParsed || 0}
- **函数总数**: ${astStats.totalFunctions || 0}
- **类总数**: ${astStats.totalClasses || 0}

---

**文档生成时间**: ${now}
*本文档由 Dev Quality Inspector 自动生成*
`;
}

/**
 * 生成 AI Context Markdown 文件内容 (保留旧版本作为备份)
 * 根据扫描结果生成项目上下文文档
 */
function generateAIContextMarkdownOld(folderName, projectPath, scanResults) {
  const astStats = scanResults.astStats || {};
  const codeGraph = scanResults.codeGraph || {};
  const issues = scanResults.issues || [];
  const now = new Date().toISOString().split('T')[0];

  // 统计问题
  const errorCount = issues.filter(i => i.severity === 'error').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;
  const infoCount = issues.filter(i => i.severity === 'info').length;

  // 获取主要编程语言
  const languages = codeGraph.metadata?.languages || [];
  const primaryLanguage = languages[0] || 'unknown';

  // 获取最常见的问题
  const issueByRule = {};
  issues.forEach(issue => {
    const rule = issue.ruleId || 'unknown';
    issueByRule[rule] = (issueByRule[rule] || 0) + 1;
  });
  const topIssues = Object.entries(issueByRule)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([rule, count]) => `- ${rule}: ${count} 次`)
    .join('\n');

  return `# AI 开发指引 - ${folderName}

> **最后更新**: ${now}
> **项目**: ${folderName}
> **扫描路径**: ${projectPath}
> **用途**: 为 AI 提供项目上下文，确保生成符合规范的代码

---

## 📋 目录

- [项目概述](#项目概述)
- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [代码质量报告](#代码质量报告)
- [主要问题分析](#主要问题分析)
- [开发建议](#开发建议)

---

## 项目概述

### 基本信息
- **项目名称**: ${folderName}
- **项目路径**: ${projectPath}
- **扫描日期**: ${now}
- **主要语言**: ${primaryLanguage}

### 代码统计
- **文件总数**: ${astStats.filesParsed || 0}
- **函数总数**: ${astStats.totalFunctions || 0}
- **类总数**: ${astStats.totalClasses || 0}
- **代码节点数**: ${codeGraph.metadata?.totalNodes || 0}
- **依赖关系数**: ${codeGraph.metadata?.totalEdges || 0}

---

## 技术栈

### 检测到的编程语言
${languages.map(lang => `- **${lang}**`).join('\n') || '- 未检测到'}

### 项目类型判断
${primaryLanguage === 'dart' ? '- **Flutter/Dart 项目**' : ''}
${primaryLanguage === 'javascript' || primaryLanguage === 'typescript' ? '- **JavaScript/TypeScript 项目**' : ''}
${primaryLanguage === 'vue' ? '- **Vue.js 项目**' : ''}
${primaryLanguage === 'python' ? '- **Python 项目**' : ''}

---

## 项目结构

### 目录概览
\`\`\`
${folderName}/
├── (具体目录结构待补充)
└── ...
\`\`\`

### 文件分布
- **总文件数**: ${astStats.filesParsed || 0}
- **主要目录**: (待分析)

---

## 代码质量报告

### 问题统计
| 严重程度 | 数量 | 占比 |
|---------|------|------|
| 🔴 Error | ${errorCount} | ${issues.length > 0 ? ((errorCount / issues.length) * 100).toFixed(1) : 0}% |
| 🟡 Warning | ${warningCount} | ${issues.length > 0 ? ((warningCount / issues.length) * 100).toFixed(1) : 0}% |
| 🔵 Info | ${infoCount} | ${issues.length > 0 ? ((infoCount / issues.length) * 100).toFixed(1) : 0}% |
| **总计** | **${issues.length}** | 100% |

### 质量评分
${errorCount > 100 ? '⭐⭐ 需要改进' : errorCount > 50 ? '⭐⭐⭐ 一般' : errorCount > 10 ? '⭐⭐⭐⭐ 良好' : '⭐⭐⭐⭐⭐ 优秀'}

---

## 主要问题分析

### 最常见的问题 (Top 10)
${topIssues || '- 无问题记录'}

### 问题分布详情

#### 错误级别问题 (Error)
${issues.filter(i => i.severity === 'error').slice(0, 20).map(i => {
  const file = i.filePath?.split(/[/\\]/).pop() || i.file || 'unknown';
  return `- **${i.ruleId}**: ${file}:${i.line} - ${i.message}`;
}).join('\n') || '- 无错误级别问题'}

#### 警告级别问题 (Warning)
${issues.filter(i => i.severity === 'warning').slice(0, 20).map(i => {
  const file = i.filePath?.split(/[/\\]/).pop() || i.file || 'unknown';
  return `- **${i.ruleId}**: ${file}:${i.line} - ${i.message}`;
}).join('\n') || '- 无警告级别问题'}

---

## 开发建议

### 优先修复建议
1. **高优先级**: 修复所有 Error 级别问题
2. **中优先级**: 处理 Warning 级别问题中频率较高的项
3. **低优先级**: 根据实际情况处理 Info 级别建议

### 代码规范建议
- 遵循项目主要语言的代码规范
- 添加必要的注释和文档
- 保持函数和类的单一职责
- 避免过长的函数和文件

---

## 附录

### 相关文件
| 文件 | 说明 |
|------|------|
| \`.code-graph.json\` | 代码结构和依赖关系分析 |
| \`scan-summary.json\` | 扫描结果摘要 |
| \`AI_CONTEXT.md\` | 本文件 |

### 更新日志
| 日期 | 更新内容 | 更新人 |
|------|---------|--------|
| ${now} | 初始版本创建 - 基于 AST 扫描 | Dev Quality Inspector |

---

## 如何使用此文档

### 对于 AI 助手
1. 在生成新代码前，先阅读此文档了解项目上下文
2. 参考代码质量报告避免重复相同问题
3. 遵循开发建议中的代码规范

### 对于开发者
1. 定期运行扫描更新此文档
2. 根据问题统计跟踪代码质量改进
3. 使用代码图分析理解项目结构

---

*本文档由 Dev Quality Inspector 自动生成*
`;
}

// Scan with AST parsing and code graph generation
ipcMain.handle('scan-code-with-ast', async (event, target, options = {}) => {
  console.log('[AST Scan] Starting scan:', target.type, target.path);
  console.log('[AST Scan] Options:', options);

  try {
    // Handle case where target.path might be an array
    let scanPath = target.path;
    if (Array.isArray(scanPath)) {
      console.log('[AST Scan] target.path is an array, taking first element:', scanPath[0]);
      scanPath = scanPath[0];
    }

    // Enable AST parsing with error handling
    let enabled = false;
    try {
      enabled = codeScanner.enableAST(options);
    } catch (enableError) {
      console.error('[AST Scan] Failed to enable AST parsing:', enableError.message);
      return { success: false, error: `无法启用 AST 解析: ${enableError.message}` };
    }

    console.log('[AST Scan] AST enabled:', enabled);
    if (!enabled) {
      console.error('[AST Scan] Failed to enable AST parsing');
      return { success: false, error: '无法启用 AST 解析，可能是缺少必要的依赖包' };
    }

    let results;
    let scanError = null;

    if (target.type === 'file') {
      console.log('[AST Scan] Scanning single file...');
      try {
        results = await codeScanner.scanFileWithAST(scanPath);
        console.log('[AST Scan] File scan raw result:', results ? 'received' : 'null/undefined');
        results = [results];
        console.log('[AST Scan] File scan completed, results array length:', results?.length);

        // 单文件扫描后发送完成信号
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('scan-progress', {
            scanned: 1,
            total: 1,
            current: '扫描完成',
            phase: 'completed'
          });
        }
      } catch (fileError) {
        console.error('[AST Scan] File scan error:', fileError.message);
        scanError = fileError;
      }
    } else if (target.type === 'folder' || target.type === 'directory') {
      console.log('[AST Scan] Scanning folder/directory...');
      try {
        // 添加进度回调 - 使用完整的排除目录列表
        const scanOptions = {
          recursive: true,
          excludeDirs: [
            'node_modules', '.git', 'dist', 'build', 'coverage',
            // Flutter/Dart 排除
            '.dart_tool', '.fvm', 'flutter_build', '.flutter-plugins',
            '.packages', '.plugin_symlinks',
            // iOS/Android 排除
            'ios', 'android', 'web', 'windows', 'macos', 'linux',
            // IDE 排除
            '.vscode', '.idea', '.vs', '.dartcode',
            // 构建输出排除
            'build', 'out', 'target', 'bin', 'obj', 'Debug', 'Release', 'x64', 'arm64',
            // 缓存排除
            '.next', '.nuxt', '.cache', 'tmp', 'temp',
            // 其他排除
            'vendor', 'third_party', 'ThirdParty', '.generated', 'generated',
            // e2e 排除（空文件夹可能导致扫描问题）
            'e2e',
          ],
          excludeFiles: [
            '.min.js', '.min.css', '.map', '.bundle',
            // Flutter/Dart 排除
            'main.dart.js', 'main.dart.js.map', 'flutter_build',
            'package_config.json', '.lock', '.log', 'LOCK', 'LOG',
            // 配置和缓存文件
            '.DS_Store', 'Thumbs.db', 'desktop.ini',
          ],
          generateGraph: options.generateGraph !== false,
          saveGraph: options.saveGraph || false,
          graphOutputPath: options.graphOutputPath || null,
          onProgress: (progress) => {
            // 发送进度更新到渲染进程
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('scan-progress', progress);
            }
          },
        };

        results = await codeScanner.scanDirectoryWithAST(scanPath, scanOptions);
        console.log('[AST Scan] Folder scan raw result:', results ? 'received' : 'null/undefined');
        console.log('[AST Scan] Folder scan completed, has issues:', !!results?.issues);

        // 扫描完成后，发送"正在生成测试上下文"状态
        if (mainWindow && !mainWindow.isDestroyed()) {
          const filesParsed = results.astStats?.filesParsed || results.issues?.length || 0;
          console.log('[AST Scan] 发送测试上下文生成状态到前端');
          mainWindow.webContents.send('scan-progress', {
            scanned: filesParsed,
            total: filesParsed,
            current: '正在生成测试上下文...',
            phase: 'generating_test_context'
          });
        }
      } catch (error) {
        console.error('[AST Scan] Error during scanDirectoryWithAST:', error.message);
        console.error('[AST Scan] Error stack:', error.stack);
        scanError = error;

        // 出错时也要发送完成信号，让前端能关闭弹窗
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('scan-progress', {
            scanned: 0,
            total: 0,
            current: '扫描失败',
            phase: 'completed'
          });
        }
      }
    } else {
      console.error('[AST Scan] Unknown target type:', target.type);
      return { success: false, error: `不支持的扫描类型: ${target.type}` };
    }

    // Handle scan error
    if (scanError) {
      return { success: false, error: `扫描失败: ${scanError.message}` };
    }

    // Validate results
    if (!results) {
      console.error('[AST Scan] Scan returned no results');
      return { success: false, error: '扫描未返回任何结果' };
    }

    // Store in knowledge base if available (only for folder scans with code graph)
    try {
      if (agentMemory && target.type === 'folder' && results.codeGraph && !results.codeGraph.error) {
        agentMemory.semantic.storeScanResults(target.path, results);
      }
    } catch (memoryError) {
      console.warn('[AST Scan] Failed to store in knowledge base:', memoryError.message);
      // 不影响扫描结果，继续返回
    }

    // 保存扫描结果到 AI_Scan_file 文件夹
    console.log('[AST Scan] Checking save conditions:', {
      targetType: target.type,
      hasCodeGraph: !!results.codeGraph,
      codeGraphError: results.codeGraph?.error,
      condition: (target.type === 'folder' || target.type === 'directory') && results.codeGraph && !results.codeGraph.error
    });
    if ((target.type === 'folder' || target.type === 'directory') && results.codeGraph && !results.codeGraph.error) {
      try {
        const folderName = path.basename(scanPath);
        const appDataPath = DATA_DIR;
        const aiScanDir = path.join(appDataPath, 'AI_Scan_file');
        const projectScanDir = path.join(aiScanDir, folderName);

        // 确保目录存在
        if (!fs.existsSync(aiScanDir)) {
          fs.mkdirSync(aiScanDir, { recursive: true });
        }
        if (!fs.existsSync(projectScanDir)) {
          fs.mkdirSync(projectScanDir, { recursive: true });
        }

        // 保存代码图 JSON
        const graphFilePath = path.join(projectScanDir, '.code-graph.json');
        fs.writeFileSync(graphFilePath, JSON.stringify(results.codeGraph, null, 2));
        console.log('[AST Scan] Code graph saved to:', graphFilePath);

        // 生成 AI Context MD 文件
        console.log('[AST Scan] About to generate AI Context...');
        const contextFilePath = path.join(projectScanDir, `${folderName}_AI_CONTEXT.md`);
        console.log('[AST Scan] Context path:', contextFilePath);
        const aiContextContent = await generateAIContextMarkdown(folderName, scanPath, results);
        fs.writeFileSync(contextFilePath, aiContextContent, 'utf-8');
        console.log('[AST Scan] AI Context saved to:', contextFilePath);

        // === 新增：提炼测试上下文 ===
        let testContextPath = null;
        try {
          const TestContextEnhancer = require('../testing/test-context-enhancer');
          const enhancer = new TestContextEnhancer(agentLLM);

          console.log('[AST Scan] Starting test context refinement...');
          const testContextResult = await enhancer.enhance(
            scanPath,
            results.codeGraph,
            contextFilePath,
            {
              log: (type, msg) => console.log(`[AST Scan] ${type} | ${msg}`),
              onProgress: (progress) => {
                // 发送模块进度到前端
                if (mainWindow && !mainWindow.isDestroyed()) {
                  mainWindow.webContents.send('scan-progress', {
                    phase: 'generating_test_context',
                    current: `正在生成测试上下文: ${progress.current} (${progress.index}/${progress.total})`,
                    moduleProgress: {
                      current: progress.index,
                      total: progress.total,
                      name: progress.current
                    }
                  });
                }
              }
            }
          );

          if (testContextResult.success) {
            testContextPath = testContextResult.outputPath;
            console.log('[AST Scan] Test context saved to:', testContextPath);
          }
        } catch (enhanceError) {
          console.warn('[AST Scan] Test context refinement failed:', enhanceError.message);
          // 不影响主流程
        }

        // 保存扫描结果摘要
        const summaryFilePath = path.join(projectScanDir, 'scan-summary.json');
        const summary = {
          projectName: folderName,
          projectPath: scanPath,
          scanDate: new Date().toISOString(),
          astStats: results.astStats,
          issuesCount: results.issues?.length || 0,
          issuesBySeverity: {
            error: results.issues?.filter(i => i.severity === 'error').length || 0,
            warning: results.issues?.filter(i => i.severity === 'warning').length || 0,
            info: results.issues?.filter(i => i.severity === 'info').length || 0,
          },
          codeGraphStats: results.codeGraph ? {
            totalNodes: results.codeGraph.metadata?.totalNodes || 0,
            totalEdges: results.codeGraph.metadata?.totalEdges || 0,
            languages: Array.from(results.codeGraph.metadata?.languages || []),
          } : null,
        };
        fs.writeFileSync(summaryFilePath, JSON.stringify(summary, null, 2));
        console.log('[AST Scan] Scan summary saved to:', summaryFilePath);

        // 将 summary 添加到 results 中，供前端使用
        results.summary = summary;

        // 设置 savedPaths，包含 testContext（总是添加路径，即使内容为空）
        results.savedPaths = {
          codeGraph: graphFilePath,
          aiContext: contextFilePath,
          summary: summaryFilePath,
          testContext: testContextPath || path.join(projectScanDir, `${folderName}_TEST_CONTEXT.json`),
        };
        console.log('[AST Scan] Test context path:', results.savedPaths.testContext);
      } catch (saveError) {
        console.warn('[AST Scan] Failed to save scan results:', saveError.message);
        // 不影响扫描结果，继续返回
      }
    }

    // 所有处理完成后，发送最终完成信号
    if (mainWindow && !mainWindow.isDestroyed()) {
      console.log('[AST Scan] 发送最终完成信号到前端');
      mainWindow.webContents.send('scan-progress', {
        scanned: results.issues?.length || 0,
        total: results.issues?.length || 0,
        current: '扫描完成',
        phase: 'completed'
      });
    }

    console.log('[AST Scan] Scan successful, returning results');
    console.log('[AST Scan] Results keys:', Object.keys(results || {}));
    console.log('[AST Scan] Results issues count:', results?.issues?.length);
    console.log('[AST Scan] Results astStats:', results?.astStats);
    console.log('[AST Scan] Results savedPaths:', results?.savedPaths);

    // 设置当前项目路径
    if (target.type === 'folder') {
      global.currentProjectPath = scanPath;
      console.log('[AST Scan] Set currentProjectPath:', scanPath);
    }

    // 尝试序列化结果以检查大小
    try {
      const serialized = JSON.stringify(results);
      console.log('[AST Scan] Serialized results size:', (serialized.length / 1024 / 1024).toFixed(2), 'MB');
      if (serialized.length > 50 * 1024 * 1024) { // 50MB
        console.warn('[AST Scan] Results size exceeds 50MB, may cause IPC issues!');
      }
    } catch (e) {
      console.error('[AST Scan] Failed to serialize results:', e.message);
    }

    return { success: true, results };
  } catch (error) {
    console.error('[AST Scan] Scan failed:', error.message);
    console.error('[AST Scan] Error stack:', error.stack);

    // 出错时也要发送完成信号
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('scan-progress', {
        scanned: 0,
        total: 0,
        current: '扫描失败',
        phase: 'completed'
      });
    }

    return { success: false, error: `扫描失败: ${error.message}` };
  }
});

// Get file structure
ipcMain.handle('get-file-structure', async (event, directoryPath, options = {}) => {
  try {
    const structure = codeScanner.getFileStructure(directoryPath, options);

    // Store in knowledge base if available
    if (agentMemory) {
      agentMemory.semantic.storeFileStructure(directoryPath, structure);
    }

    return { success: true, structure };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Analyze dependencies
ipcMain.handle('analyze-dependencies', async (event, directoryPath, options = {}) => {
  try {
    const analysis = await codeScanner.analyzeDependencies(directoryPath, options);

    // Store in knowledge base if available
    if (agentMemory && !analysis.error) {
      agentMemory.semantic.storeDependencyAnalysis(directoryPath, analysis);
    }

    return { success: true, analysis };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Get code graph from knowledge base
ipcMain.handle('get-code-graph', async (event, projectPath) => {
  if (!agentMemory) {
    return { success: false, error: 'Knowledge base not available' };
  }

  try {
    const graphEntry = agentMemory.semantic.getCodeGraph(projectPath);
    if (!graphEntry) {
      return { success: false, error: 'Code graph not found for project' };
    }

    return { success: true, graph: graphEntry.value, metadata: graphEntry.metadata };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Get project overview from knowledge base
ipcMain.handle('get-project-overview', async (event, projectPath) => {
  if (!agentMemory) {
    return { success: false, error: 'Knowledge base not available' };
  }

  try {
    const overview = agentMemory.semantic.getProjectOverview(projectPath);
    return { success: true, overview };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Search code by function name
ipcMain.handle('search-by-function', async (event, functionName) => {
  if (!agentMemory) {
    return { success: false, error: 'Knowledge base not available', results: [] };
  }

  try {
    const results = agentMemory.semantic.searchByFunction(functionName);
    return { success: true, results };
  } catch (error) {
    return { success: false, error: error.message, results: [] };
  }
});

// Search code by class name
ipcMain.handle('search-by-class', async (event, className) => {
  if (!agentMemory) {
    return { success: false, error: 'Knowledge base not available', results: [] };
  }

  try {
    const results = agentMemory.semantic.searchByClass(className);
    return { success: true, results };
  } catch (error) {
    return { success: false, error: error.message, results: [] };
  }
});

// Find API endpoints in project
ipcMain.handle('find-api-endpoints', async (event, projectPath) => {
  if (!agentMemory) {
    return { success: false, error: 'Knowledge base not available', endpoints: [] };
  }

  try {
    const endpoints = agentMemory.semantic.findApiEndpoints(projectPath);
    return { success: true, endpoints };
  } catch (error) {
    return { success: false, error: error.message, endpoints: [] };
  }
});

// Get function analysis report
ipcMain.handle('get-function-analysis', async (event, projectPath) => {
  if (!agentMemory) {
    return { success: false, error: 'Knowledge base not available' };
  }

  try {
    const graphEntry = agentMemory.semantic.getCodeGraph(projectPath);
    if (!graphEntry) {
      return { success: false, error: 'Code graph not found for project' };
    }

    const CodeGraphGenerator = require('../code-graph');
    const generator = new CodeGraphGenerator();

    // 从存储的数据重构代码图
    generator.graph = {
      nodes: new Map(graphEntry.value.nodes.map(n => [n.id, n])),
      edges: new Map(graphEntry.value.edges.map(e => [`${e.source}:${e.target}:${e.type}`, e])),
      metadata: graphEntry.value.metadata,
    };

    const report = generator.getFunctionAnalysisReport();
    return { success: true, report };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Get class analysis report
ipcMain.handle('get-class-analysis', async (event, projectPath) => {
  if (!agentMemory) {
    return { success: false, error: 'Knowledge base not available' };
  }

  try {
    const graphEntry = agentMemory.semantic.getCodeGraph(projectPath);
    if (!graphEntry) {
      return { success: false, error: 'Code graph not found for project' };
    }

    const CodeGraphGenerator = require('../code-graph');
    const generator = new CodeGraphGenerator();

    // 从存储的数据重构代码图
    generator.graph = {
      nodes: new Map(graphEntry.value.nodes.map(n => [n.id, n])),
      edges: new Map(graphEntry.value.edges.map(e => [`${e.source}:${e.target}:${e.type}`, e])),
      metadata: graphEntry.value.metadata,
    };

    const report = generator.getClassAnalysisReport();
    return { success: true, report };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Get function call graph
ipcMain.handle('get-function-call-graph', async (event, projectPath, functionName) => {
  if (!agentMemory) {
    return { success: false, error: 'Knowledge base not available' };
  }

  try {
    const graphEntry = agentMemory.semantic.getCodeGraph(projectPath);
    if (!graphEntry) {
      return { success: false, error: 'Code graph not found for project' };
    }

    const nodes = graphEntry.value.nodes;
    const edges = graphEntry.value.edges;

    // 查找指定的函数节点
    const targetFunction = nodes.find(n => n.type === 'function' && n.name === functionName);
    if (!targetFunction) {
      return { success: false, error: `Function '${functionName}' not found` };
    }

    // 获取调用关系
    const callGraph = {
      function: {
        id: targetFunction.id,
        name: targetFunction.name,
        fileName: targetFunction.fileName,
        line: targetFunction.line,
      },
      calls: [], // 调用了哪些函数
      calledBy: [], // 被哪些函数调用
    };

    // 查找出边（调用）
    for (const edge of edges) {
      if (edge.source === targetFunction.id && edge.type === 'calls') {
        const targetNode = nodes.find(n => n.id === edge.target);
        if (targetNode) {
          callGraph.calls.push({
            id: targetNode.id,
            name: targetNode.name,
            fileName: targetNode.fileName,
          });
        }
      }
    }

    // 查找入边（被调用）
    for (const edge of edges) {
      if (edge.target === targetFunction.id && edge.type === 'calls') {
        const sourceNode = nodes.find(n => n.id === edge.source);
        if (sourceNode) {
          callGraph.calledBy.push({
            id: sourceNode.id,
            name: sourceNode.name,
            fileName: sourceNode.fileName,
          });
        }
      }
    }

    return { success: true, callGraph };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Get business logic summary from call graph
ipcMain.handle('get-business-logic-summary', async (event, projectPath) => {
  if (!agentMemory) {
    return { success: false, error: 'Knowledge base not available' };
  }

  try {
    const CodeGraphGenerator = require('../code-graph');
    const generator = new CodeGraphGenerator();
    generator.enableCallGraphAnalysis();

    const graphEntry = agentMemory.semantic.getCodeGraph(projectPath);
    if (!graphEntry) {
      return { success: false, error: 'Code graph not found for project' };
    }

    // 从存储的数据重构代码图
    generator.graph = {
      nodes: new Map(graphEntry.value.nodes.map(n => [n.id, n])),
      edges: new Map(graphEntry.value.edges.map(e => [`${e.source}:${e.target}:${e.type}`, e])),
      metadata: graphEntry.value.metadata,
    };

    const summary = generator.getBusinessLogicSummary();
    return { success: true, summary };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Get function context with detailed call information
ipcMain.handle('get-function-context', async (event, projectPath, functionName) => {
  if (!agentMemory) {
    return { success: false, error: 'Knowledge base not available' };
  }

  try {
    const CodeGraphGenerator = require('../code-graph');
    const generator = new CodeGraphGenerator();
    generator.enableCallGraphAnalysis();

    const graphEntry = agentMemory.semantic.getCodeGraph(projectPath);
    if (!graphEntry) {
      return { success: false, error: 'Code graph not found for project' };
    }

    // 从存储的数据重构代码图
    generator.graph = {
      nodes: new Map(graphEntry.value.nodes.map(n => [n.id, n])),
      edges: new Map(graphEntry.value.edges.map(e => [`${e.source}:${e.target}:${e.type}`, e])),
      metadata: graphEntry.value.metadata,
    };

    const context = generator.getFunctionContext(functionName);
    return { success: true, context };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Get call chains analysis
ipcMain.handle('get-call-chains', async (event, projectPath) => {
  if (!agentMemory) {
    return { success: false, error: 'Knowledge base not available' };
  }

  try {
    const CodeGraphGenerator = require('../code-graph');
    const generator = new CodeGraphGenerator();
    generator.enableCallGraphAnalysis();

    const graphEntry = agentMemory.semantic.getCodeGraph(projectPath);
    if (!graphEntry) {
      return { success: false, error: 'Code graph not found for project' };
    }

    // 从存储的数据重构代码图
    generator.graph = {
      nodes: new Map(graphEntry.value.nodes.map(n => [n.id, n])),
      edges: new Map(graphEntry.value.edges.map(e => [`${e.source}:${e.target}:${e.type}`, e])),
      metadata: graphEntry.value.metadata,
    };

    // 获取业务逻辑摘要，其中包含调用链
    const summary = generator.getBusinessLogicSummary();

    return {
      success: true,
      callChains: summary.businessFlows || [],
      criticalPaths: summary.criticalFlows || [],
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Export call graph as DOT
ipcMain.handle('export-call-graph-dot', async (event, projectPath, outputPath) => {
  if (!agentMemory) {
    return { success: false, error: 'Knowledge base not available' };
  }

  try {
    const CodeGraphGenerator = require('../code-graph');
    const generator = new CodeGraphGenerator();
    generator.enableCallGraphAnalysis();

    const graphEntry = agentMemory.semantic.getCodeGraph(projectPath);
    if (!graphEntry) {
      return { success: false, error: 'Code graph not found for project' };
    }

    // 从存储的数据重构代码图
    generator.graph = {
      nodes: new Map(graphEntry.value.nodes.map(n => [n.id, n])),
      edges: new Map(graphEntry.value.edges.map(e => [`${e.source}:${e.target}:${e.type}`, e])),
      metadata: graphEntry.value.metadata,
    };

    const dot = generator.toCallGraphDot();

    if (outputPath) {
      fs.writeFileSync(outputPath, dot, 'utf8');
      return { success: true, dot, savedTo: outputPath };
    }

    return { success: true, dot };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Export code graph as DOT
ipcMain.handle('export-code-graph-dot', async (event, projectPath, outputPath) => {
  if (!agentMemory) {
    return { success: false, error: 'Knowledge base not available' };
  }

  try {
    const graphEntry = agentMemory.semantic.getCodeGraph(projectPath);
    if (!graphEntry) {
      return { success: false, error: 'Code graph not found for project' };
    }

    const CodeGraphGenerator = require('../code-graph');
    const generator = new CodeGraphGenerator();

    // Reconstruct graph from stored data
    const dot = generator.toDot();

    if (outputPath) {
      fs.writeFileSync(outputPath, dot, 'utf8');
      return { success: true, dot, savedTo: outputPath };
    }

    return { success: true, dot };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Analyze file dependencies
ipcMain.handle('analyze-file-dependencies', async (event, projectPath, options) => {
  if (!agentMemory) {
    return { success: false, error: 'Knowledge base not available' };
  }

  try {
    const CodeGraphGenerator = require('../code-graph');
    const generator = new CodeGraphGenerator();
    generator.enableFileDependencyAnalysis();

    const graphEntry = agentMemory.semantic.getCodeGraph(projectPath);
    if (!graphEntry) {
      return { success: false, error: 'Code graph not found for project' };
    }

    // 从存储的数据重构代码图
    generator.graph = {
      nodes: new Map(graphEntry.value.nodes.map(n => [n.id, n])),
      edges: new Map(graphEntry.value.edges.map(e => [`${e.source}:${e.target}:${e.type}`, e])),
      metadata: graphEntry.value.metadata,
    };

    const analysis = generator.analyzeFileDependencies(projectPath, options);
    return analysis;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Get file dependency tree
ipcMain.handle('get-file-dependency-tree', async (event, projectPath, rootFile) => {
  if (!agentMemory) {
    return { success: false, error: 'Knowledge base not available' };
  }

  try {
    const CodeGraphGenerator = require('../code-graph');
    const generator = new CodeGraphGenerator();
    generator.enableFileDependencyAnalysis();

    const graphEntry = agentMemory.semantic.getCodeGraph(projectPath);
    if (!graphEntry) {
      return { success: false, error: 'Code graph not found for project' };
    }

    // 从存储的数据重构代码图
    generator.graph = {
      nodes: new Map(graphEntry.value.nodes.map(n => [n.id, n])),
      edges: new Map(graphEntry.value.edges.map(e => [`${e.source}:${e.target}:${e.type}`, e])),
      metadata: graphEntry.value.metadata,
    };

    const tree = generator.getFileDependencyTree(projectPath, rootFile);
    return tree;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Export file dependency graph as DOT
ipcMain.handle('export-file-dependency-dot', async (event, projectPath, outputPath, options) => {
  if (!agentMemory) {
    return { success: false, error: 'Knowledge base not available' };
  }

  try {
    const CodeGraphGenerator = require('../code-graph');
    const generator = new CodeGraphGenerator();
    generator.enableFileDependencyAnalysis();

    const graphEntry = agentMemory.semantic.getCodeGraph(projectPath);
    if (!graphEntry) {
      return { success: false, error: 'Code graph not found for project' };
    }

    // 从存储的数据重构代码图
    generator.graph = {
      nodes: new Map(graphEntry.value.nodes.map(n => [n.id, n])),
      edges: new Map(graphEntry.value.edges.map(e => [`${e.source}:${e.target}:${e.type}`, e])),
      metadata: graphEntry.value.metadata,
    };

    const dot = generator.toFileDependencyDot(projectPath, options);

    if (outputPath) {
      fs.writeFileSync(outputPath, dot, 'utf8');
      return { success: true, dot, savedTo: outputPath };
    }

    return { success: true, dot };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Analyze Flutter UI structure
ipcMain.handle('analyze-flutter-ui', async (event, projectPath) => {
  if (!agentMemory) {
    return { success: false, error: 'Knowledge base not available' };
  }

  try {
    const CodeGraphGenerator = require('../code-graph');
    const generator = new CodeGraphGenerator();
    generator.enableFlutterUIAnalysis();

    const graphEntry = agentMemory.semantic.getCodeGraph(projectPath);
    if (!graphEntry) {
      return { success: false, error: 'Code graph not found for project' };
    }

    // 从存储的数据重构代码图
    generator.graph = {
      nodes: new Map(graphEntry.value.nodes.map(n => [n.id, n])),
      edges: new Map(graphEntry.value.edges.map(e => [`${e.source}:${e.target}:${e.type}`, e])),
      metadata: graphEntry.value.metadata,
    };

    // 收集 Dart 文件
    const dartFiles = [];
    for (const node of generator.graph.nodes.values()) {
      if (node.type === 'file' && node.language === 'dart') {
        const content = generator.getFileContent(node.filePath);
        if (content) {
          dartFiles.push({
            path: node.filePath,
            content,
          });
        }
      }
    }

    const uiAnalysis = generator.analyzeFlutterUI(projectPath, dartFiles);

    return { success: true, ...uiAnalysis };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Analyze single Flutter file UI structure
ipcMain.handle('analyze-flutter-file-ui', async (event, filePath) => {
  try {
    const fs = require('fs');
    const content = fs.readFileSync(filePath, 'utf8');

    const FlutterUIAnalyzer = require('../flutter-ui-analyzer');
    const analyzer = new FlutterUIAnalyzer();

    const analysis = analyzer.analyzeFile(filePath, content);

    return { success: true, ...analysis };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Scan project information (versions, dependencies, etc.)
ipcMain.handle('scan-project-info', async (event, projectPath) => {
  try {
    const result = await codeScanner.scanProjectInfo(projectPath);

    // Store in knowledge base if available
    if (result.success && agentMemory) {
      // 存储基本信息
      agentMemory.semantic.store(
        `project-info:${projectPath}`,
        result,
        {
          type: 'project_info',
          projectPath,
          scannedAt: result.metadata?.scannedAt,
        }
      );

      // 存储依赖分类信息
      if (result.dependencyAnalysis) {
        agentMemory.semantic.store(
          `dependency-analysis:${projectPath}`,
          result.dependencyAnalysis,
          {
            type: 'dependency_analysis',
            projectPath,
            scannedAt: result.metadata?.scannedAt,
          }
        );
      }

      // 存储结构分析信息
      if (result.structure) {
        agentMemory.semantic.store(
          `structure-analysis:${projectPath}`,
          result.structure.summary,
          {
            type: 'structure_analysis',
            projectPath,
            scannedAt: result.metadata?.scannedAt,
          }
        );
      }
    }

    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Get project structure analysis
ipcMain.handle('get-project-structure', async (event, projectPath) => {
  if (!agentMemory) {
    return { success: false, error: 'Knowledge base not available', structure: null };
  }

  try {
    const structureEntry = agentMemory.semantic.retrieve(`structure-analysis:${projectPath}`);
    if (!structureEntry) {
      // 如果没有缓存，执行新的结构分析
      const result = await codeScanner.scanProjectInfo(projectPath);
      if (result.success && result.structure) {
        return { success: true, structure: result.structure };
      }
      return { success: false, error: 'Structure analysis not available', structure: null };
    }

    return { success: true, structure: structureEntry.value };
  } catch (error) {
    return { success: false, error: error.message, structure: null };
  }
});

// ============================================
// IPC Handlers - TODO Operations
// ============================================

ipcMain.handle('add-todo', async (event, filePath, line, issue) => {
  try {
    // 调试日志：检查传入的 issue 对象
    console.log('[IPC] add-todo received:', { filePath, line, issue });
    console.log('[IPC] issue fields:', {
      ruleId: issue?.ruleId,
      message: issue?.message,
      suggestion: issue?.suggestion
    });

    // 直接传入 issue 对象，insertTodo 内部会调用 generateTodo
    const result = todoManager.insertTodo(filePath, line, issue);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('fix-todo', async (event, fixRequest) => {
  const { target, issues, options } = fixRequest;

  try {
    let result;

    if (target.type === 'single') {
      result = todoManager.fixFile(target.filePath, issues, options);
    } else if (target.type === 'batch') {
      result = todoManager.fixBatch(issues, options);
    }

    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('preview-fix', async (event, filePath, issue) => {
  try {
    const preview = todoManager.previewFix(filePath, issue);
    return preview;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('remove-todo', async (event, filePath, line) => {
  try {
    const result = todoManager.removeTodo(filePath, line);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('can-autofix', async (event, issue) => {
  try {
    const canFix = todoManager.canAutoFix(issue);
    return { success: true, canFix };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ============================================
// IPC Handlers - AI Fix Operations
// ============================================

ipcMain.handle('ai-fix-init', async (event, config) => {
  try {
    const result = aiFixer.initialize(config);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('ai-fix-single', async (event, params) => {
  try {
    const result = await aiFixer.fixSingleIssue(params);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('ai-fix-multiple', async (event, params) => {
  try {
    const result = await aiFixer.fixMultipleIssues(params);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('ai-fix-apply', async (event, fixId, accepted) => {
  try {
    const result = aiFixer.applyFix(fixId, accepted);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('ai-fix-config', async (event) => {
  try {
    const config = aiFixer.getConfig();
    const validation = aiFixer.validateConfig();

    // 应用用户保存的配置到全局 LLM Router（模型 + API Key + Endpoint）
    if (global.llmRouter) {
      const routerUpdates = {};
      if (config.model) {
        routerUpdates.defaultModel = config.model;
        routerUpdates.highQualityModel = config.model;
        routerUpdates.fastModel = config.model;
      }
      if (config.apiKey) {
        routerUpdates.projectApiKey = config.apiKey;
        process.env.ANTHROPIC_AUTH_TOKEN = config.apiKey;
      }
      if (config.apiEndpoint) {
        routerUpdates.projectApiEndpoint = config.apiEndpoint;
        process.env.ANTHROPIC_BASE_URL = config.apiEndpoint;
      }
      if (Object.keys(routerUpdates).length > 0) {
        global.llmRouter.updateConfig(routerUpdates);
        console.log('[Main] 应用用户保存的配置到 LLM Router:', {
          model: config.model,
          endpoint: config.apiEndpoint,
        });
      }
    }

    return { success: true, config, validation };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('ai-fix-update-config', async (event, updates) => {
  try {
    const result = aiFixer.updateConfig(updates);

    // 同时更新全局 LLM Router 的模型和 API 配置
    // 使设置面板的配置对所有使用 LLM 的功能生效
    if (global.llmRouter) {
      const routerUpdates = {};
      if (updates.model) {
        routerUpdates.defaultModel = updates.model;
        routerUpdates.highQualityModel = updates.model;
        routerUpdates.fastModel = updates.model;
      }
      if (updates.apiKey) {
        routerUpdates.projectApiKey = updates.apiKey;
        process.env.ANTHROPIC_AUTH_TOKEN = updates.apiKey;
      }
      if (updates.apiEndpoint) {
        routerUpdates.projectApiEndpoint = updates.apiEndpoint;
        process.env.ANTHROPIC_BASE_URL = updates.apiEndpoint;
      }
      if (Object.keys(routerUpdates).length > 0) {
        global.llmRouter.updateConfig(routerUpdates);
        console.log('[Main] 全局 LLM Router 已更新:', {
          model: updates.model,
          apiKey: updates.apiKey ? '***已更新***' : undefined,
          endpoint: updates.apiEndpoint || undefined,
        });
      }
    }

    // 同步模型到 QA Reviewer
    if (updates.model) {
      try {
        const { QAModelConfig } = require('../qa-reviewer/config/model-config');
        QAModelConfig.setUserModel(updates.model);
      } catch (e) {
        console.warn('[Main] 无法更新 QA Reviewer 模型:', e.message);
      }
    }

    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('ai-fix-get-active', async () => {
  try {
    const fixes = aiFixer.getActiveFixes();
    return { success: true, fixes };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('ai-fix-clear', async () => {
  try {
    aiFixer.clearActiveFixes();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ============================================
// IPC Handlers - Rules Configuration
// ============================================

ipcMain.handle('get-rules-config', async () => {
  try {
    // 返回默认规则配置（全部标记为 builtin）
    const defaultRules = [
      // JavaScript/TypeScript
      { id: 'JS-001', name: 'No console.log in production', severity: 'warning', languages: ['javascript', 'typescript'], message: '生产代码中使用了 console.log', suggestion: '移除 console.log 或使用适当的日志库', autoFix: true, enabled: true, source: 'builtin' },
      { id: 'JS-002', name: 'No var declarations', severity: 'error', languages: ['javascript', 'typescript'], message: '使用了 var 声明变量', suggestion: '使用 let 或 const 替代 var', autoFix: true, enabled: true, source: 'builtin' },
      { id: 'JS-003', name: 'Missing error handling in async functions', severity: 'error', languages: ['javascript', 'typescript'], message: '异步调用缺少错误处理', suggestion: '用 try-catch 块包装异步调用', autoFix: false, enabled: true, source: 'builtin' },
      { id: 'JS-004', name: 'Missing React key in list', severity: 'error', languages: ['javascript', 'typescript', 'jsx', 'tsx'], message: '列表渲染缺少 key 属性', suggestion: '为列表中的元素添加唯一的 key 属性', autoFix: false, enabled: true, source: 'builtin' },
      { id: 'TS-001', name: 'Missing type annotation', severity: 'warning', languages: ['typescript'], message: '函数缺少返回类型注解', suggestion: '为函数添加返回类型注解', autoFix: false, enabled: true, source: 'builtin' },
      { id: 'TS-002', name: 'Any type usage', severity: 'warning', languages: ['typescript'], message: '使用了 any 类型', suggestion: '使用具体类型替代 any', autoFix: false, enabled: true, source: 'builtin' },
      // Vue
      { id: 'VUE-001', name: 'Missing v-key in v-for', severity: 'error', languages: ['vue'], message: 'v-for 没有 :key 绑定', suggestion: '为 v-for 指令添加 :key 属性', autoFix: false, enabled: true, source: 'builtin' },
      { id: 'VUE-002', name: 'Missing prop validation', severity: 'warning', languages: ['vue'], message: 'Props 定义为数组', suggestion: '将 props 定义为带验证的对象', autoFix: false, enabled: true, source: 'builtin' },
      { id: 'VUE-003', name: 'Console statement in template', severity: 'warning', languages: ['vue'], message: '模板中有 console 语句', suggestion: '从模板中移除 console 语句', autoFix: true, enabled: true, source: 'builtin' },
      // Dart
      { id: 'DART-001', name: 'Missing type annotation', severity: 'info', languages: ['dart'], message: '变量用 var 声明而没有类型', suggestion: '考虑使用显式类型注解', autoFix: false, enabled: true, source: 'builtin' },
      { id: 'DART-002', name: 'Empty catch block', severity: 'error', languages: ['dart'], message: '空的 catch 块', suggestion: '在 catch 块中添加错误处理或日志', autoFix: false, enabled: true, source: 'builtin' },
      { id: 'DART-003', name: 'Missing async await', severity: 'warning', languages: ['dart'], message: '使用 .then() 而不是 async/await', suggestion: '考虑使用 async/await 提高可读性', autoFix: false, enabled: true, source: 'builtin' },
      { id: 'DART-004', name: 'Print statement in production', severity: 'warning', languages: ['dart'], message: '发现 print 语句', suggestion: '移除 print 或使用适当的日志框架', autoFix: true, enabled: true, source: 'builtin' },
      { id: 'DART-005', name: 'Build method without const', severity: 'info', languages: ['dart'], message: 'Build 方法可以使用 const 构造函数', suggestion: '考虑使用 const 构造函数提高性能', autoFix: false, enabled: true, source: 'builtin' },
      { id: 'DART-006', name: 'Missing const for Widgets', severity: 'info', languages: ['dart'], message: 'Widget 构造函数可以是 const', suggestion: '考虑使用 const 提高性能', autoFix: false, enabled: true, source: 'builtin' },
      { id: 'DART-007', name: 'Missing return type', severity: 'warning', languages: ['dart'], message: '函数缺少返回类型注解', suggestion: '为函数添加返回类型注解', autoFix: false, enabled: true, source: 'builtin' },
      { id: 'DART-008', name: 'Ignore annotation', severity: 'warning', languages: ['dart'], message: '使用了 ignore 注解', suggestion: '审查是否需要忽略', autoFix: false, enabled: true, source: 'builtin' },
      // Dart 空值检查规则
      { id: 'DART-NULL-001', name: 'Nullable generic list declaration', severity: 'warning', languages: ['dart'], message: '列表元素类型为 nullable，访问时需进行空值检查', suggestion: '使用 ?.firstOrNull 或在访问前检查列表是否为空', autoFix: false, enabled: true, source: 'builtin' },
      { id: 'DART-NULL-002', name: 'Unsafe list first/last access', severity: 'error', languages: ['dart'], message: '.first/.last 在空列表上会抛出异常，且元素可能为 null', suggestion: '使用 firstOrNull/lastOrNull 或先检查 isEmpty/length', autoFix: false, enabled: true, source: 'builtin' },
      { id: 'DART-NULL-003', name: 'RxList empty initialization', severity: 'warning', languages: ['dart'], message: 'RxList.empty() 创建空列表，后续 .first/.last 访问会抛出异常', suggestion: '初始化时添加默认元素或使用 .firstOrNull/.lastOrNull', autoFix: false, enabled: true, source: 'builtin' },
      { id: 'DART-NULL-004', name: 'Force unwrap operator', severity: 'warning', languages: ['dart'], message: '使用 ! 强制解包可能导致运行时空指针异常', suggestion: '使用 ?. 或 ?? 操作符进行安全的空值处理', autoFix: false, enabled: true, source: 'builtin' },
      { id: 'DART-NULL-005', name: 'Unsafe nullable property chain', severity: 'warning', languages: ['dart'], message: '多层属性访问缺少空值保护，中间属性可能为 null', suggestion: '使用可选链 ?. 保护中间属性访问', autoFix: false, enabled: true, source: 'builtin' },
      { id: 'DART-NULL-006', name: 'Late variable potential null access', severity: 'warning', languages: ['dart'], message: 'late 变量在初始化前访问会抛出 LateInitializationError', suggestion: '确保在使用前完成初始化，或考虑使用 nullable 类型', autoFix: false, enabled: true, source: 'builtin' },
      // General
      { id: 'GEN-001', name: 'File too long', severity: 'warning', languages: ['javascript', 'typescript', 'vue', 'dart'], message: '文件超过推荐长度 (300 行)', suggestion: '考虑将文件拆分为更小的模块', autoFix: false, enabled: true, source: 'builtin' },
      { id: 'GEN-002', name: 'Missing file header comment', severity: 'info', languages: ['javascript', 'typescript', 'vue', 'dart'], message: '缺少文件头注释', suggestion: '添加包含描述和作者的文件头', autoFix: false, enabled: true, source: 'builtin' },
      { id: 'GEN-003', name: 'Line too long', severity: 'warning', languages: ['javascript', 'typescript', 'vue', 'dart'], message: '行超过 120 字符', suggestion: '拆分长行以提高可读性', autoFix: false, enabled: true, source: 'builtin' },
      { id: 'GEN-004', name: 'TODO without code reference', severity: 'info', languages: ['javascript', 'typescript', 'vue', 'dart'], message: 'TODO 注释没有代码引用', suggestion: '使用格式: // TODO: [CODE-ID] 描述', autoFix: false, enabled: true, source: 'builtin' },
    ];

    // 加载用户保存的规则配置（如果有）
    const os = require('os');
    const path = require('path');
    const fs = require('fs');
    const configDir = path.join(os.homedir(), '.dqi');
    const rulesConfigPath = path.join(configDir, 'rules-config.json');

    if (fs.existsSync(rulesConfigPath)) {
      try {
        const savedRules = JSON.parse(fs.readFileSync(rulesConfigPath, 'utf8'));
        // 合并用户保存的规则（用户导入的规则会保留）
        // 内置规则使用保存的 enabled 状态，用户导入规则保留完整信息
        const mergedRules = defaultRules.map(dr => {
          const saved = savedRules.find(sr => sr.id === dr.id);
          if (saved) {
            return { ...dr, enabled: saved.enabled };
          }
          return dr;
        });
        // 添加用户导入的规则
        const userImportedRules = savedRules.filter(sr => sr.source === 'user-imported');
        return { success: true, rules: [...mergedRules, ...userImportedRules] };
      } catch (e) {
        console.error('加载用户规则配置失败:', e.message);
      }
    }

    return { success: true, rules: defaultRules };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('update-rules-config', async (event, rules) => {
  try {
    // 保存规则配置到用户配置目录
    const os = require('os');
    const path = require('path');
    const fs = require('fs');

    const configDir = path.join(os.homedir(), '.dqi');
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    const rulesConfigPath = path.join(configDir, 'rules-config.json');
    fs.writeFileSync(rulesConfigPath, JSON.stringify(rules, null, 2));

    // 同时更新 scanner 的规则配置
    if (codeScanner && codeScanner.setRulesConfig) {
      codeScanner.setRulesConfig(rules.filter(r => r.enabled));
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 解析 YAML 规则文件内容
ipcMain.handle('parse-yaml-rules', async (event, yamlContent) => {
  try {
    const yaml = require('js-yaml');
    const rules = yaml.load(yamlContent);

    if (!rules || !Array.isArray(rules)) {
      return { success: false, error: 'YAML 解析结果不是有效的规则数组' };
    }

    // 验证规则基本结构
    const validRules = rules.filter(rule => rule && rule.id && rule.name);

    console.log(`[IPC] YAML 解析成功，共 ${validRules.length} 条规则`);
    return { success: true, rules: validRules };
  } catch (error) {
    console.error('[IPC] YAML 解析失败:', error.message);
    return { success: false, error: `YAML 解析错误: ${error.message}` };
  }
});

// ============================================
// IPC Handlers - Project Run Operations
// ============================================

ipcMain.handle('detect-project', async (event, projectPath) => {
  try {
    const info = projectRunner.detectProjectType(projectPath);
    return { success: true, info };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-project-scripts', async (event, projectPath) => {
  try {
    const result = projectRunner.getAvailableScripts(projectPath);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('run-project', async (event, projectPath, options) => {
  try {
    console.log('[IPC] run-project called:', { projectPath, options });

    const onOutput = (projectId, output) => {
      console.log(`[IPC] Project output [${projectId}]:`, output.type, output.data?.substring(0, 100));
      mainWindow?.webContents.send('project-output', { projectId, output });
    };

    const onExit = (projectId, exitInfo) => {
      console.log(`[IPC] Project exit [${projectId}]:`, exitInfo);
      mainWindow?.webContents.send('project-exit', { projectId, exitInfo });
    };

    const result = await projectRunner.run(projectPath, {
      ...options,
      onOutput,
      onExit,
    });

    console.log('[IPC] run-project result:', result);
    return result;
  } catch (error) {
    console.error('[IPC] run-project error:', error);
    return { success: false, error: error.message, stack: error.stack };
  }
});

ipcMain.handle('stop-project', async (event, projectId) => {
  try {
    const result = projectRunner.stop(projectId);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('stop-all-projects', async () => {
  try {
    const result = projectRunner.stopAll();
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-project-status', async (event, projectId) => {
  try {
    const status = projectRunner.getStatus(projectId);
    return { success: true, status };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-running-projects', async () => {
  try {
    const projects = projectRunner.getRunningProjects();
    return { success: true, projects };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ============================================
// IPC Handlers - Test Operations
// ============================================

ipcMain.handle('import-excel-test', async (event, filePath) => {
  try {
    const result = testingManager.parseExcel(filePath);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('generate-test-case', async (event, excelPath, options) => {
  try {
    const result = testingManager.generateTest(excelPath, options);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 解析代码上下文
ipcMain.handle('extract-code-context', async (event, filePaths, options) => {
  try {
    const CodeContextExtractor = require('../testing/code-context-extractor');
    const extractor = new CodeContextExtractor(options);
    const result = await extractor.extractContext(filePaths, options);
    return result;
  } catch (error) {
    console.error('[Main] extract-code-context error:', error);
    return { success: false, error: error.message };
  }
});

// 直接从代码生成测试
ipcMain.handle('generate-tests-from-code', async (event, params) => {
  try {
    const { filePaths, codeContext, projectUrl, options } = params;
    
    // 初始化 AI 测试生成器
    const AITestGeneratorComplete = require('../testing/ai-test-generator-complete');
    const generator = new AITestGeneratorComplete({ llm: agentLLM });
    
    const result = await generator.generate(
      {
         sourceType: 'code',
         content: '',
         metadata: codeContext,
         codeFiles: filePaths
      },
      options,
      (type, message, data) => {
         // 发送日志到前端
         if (mainWindow && !mainWindow.isDestroyed()) {
           mainWindow.webContents.send('ai-smart-test-log', { type, message, data, timestamp: Date.now() });
         }
      }
    );
    
    return result;
  } catch (error) {
    console.error('[Main] generate-tests-from-code error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('run-test', async (event, testPath, options) => {
  try {
    const onOutput = (testId, output) => {
      mainWindow?.webContents.send('test-output', { testId, output });
    };

    const onResult = (testId, result) => {
      mainWindow?.webContents.send('test-result', { testId, result });
    };

    const result = await testingManager.runTest(testPath, {
      ...options,
      onOutput,
      onResult,
      generateReport: true,
      outputDir: options.reportDir || path.join(path.dirname(testPath), 'test-reports'),
    });

    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('stop-test', async (event, testId) => {
  try {
    const result = testingManager.stopTest(testId);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-test-status', async (event, testId) => {
  try {
    const status = testingManager.getTestStatus(testId);
    return { success: true, status };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-running-tests', async () => {
  try {
    const tests = testingManager.getRunningTests();
    return { success: true, tests };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('create-test-template', async (event, outputPath) => {
  try {
    const result = testingManager.createTemplate(outputPath);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('check-playwright', async (event, projectPath) => {
  try {
    const installed = testingManager.isPlaywrightInstalled(projectPath);
    return { success: true, installed };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('install-playwright', async (event, projectPath) => {
  try {
    const result = await testingManager.installPlaywright(projectPath);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ============================================
// IPC Handlers - Playwright Test Operations
// ============================================

ipcMain.handle('run-playwright-test', async (event, url, options) => {
  try {
    const onOutput = (testId, output) => {
      mainWindow?.webContents.send('test-output', { testId, output });
    };

    const onResult = (testId, result) => {
      mainWindow?.webContents.send('test-result', { testId, result });
    };

    const result = await testingManager.runPlaywrightTest(url, {
      ...options,
      onOutput,
      onResult,
    });

    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('stop-playwright-test', async (event, testId) => {
  try {
    const result = testingManager.stopPlaywrightTest(testId);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-playwright-test-status', async (event, testId) => {
  try {
    const status = testingManager.getPlaywrightTestStatus(testId);
    return { success: true, status };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-running-playwright-tests', async () => {
  try {
    const tests = testingManager.getRunningPlaywrightTests();
    return { success: true, tests };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ============================================
// IPC Handlers - Dependency Operations
// ============================================

ipcMain.handle('load-dependencies', async (event, targetPath) => {
  try {
    const result = dependencyLoader.loadForFeature(targetPath, 'scan');
    return { success: true, ...result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-dependency-tree', async (event, projectPath) => {
  try {
    const tree = dependencyLoader.getDependencyTreeForUI(projectPath);
    return { success: true, tree };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-dependency-stats', async (event, projectPath) => {
  try {
    const stats = dependencyLoader.getStats(projectPath);
    return { success: true, stats };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('validate-dependencies', async (event, projectPath, feature) => {
  try {
    const validation = dependencyLoader.validateDependencies(projectPath, feature);
    return { success: true, ...validation };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-file-context', async (event, filePath, projectPath) => {
  try {
    const context = dependencyLoader.getFileContext(filePath, projectPath, {
      includeImports: true,
      maxDepth: 2,
    });
    return { success: true, context };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('clear-dependency-cache', async () => {
  try {
    dependencyLoader.clearCache();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ============================================
// IPC Handlers - Agent Operations
// ============================================

ipcMain.handle('agent-process', async (event, request) => {
  if (!agentOrchestrator) {
    return { success: false, error: 'Agent system not initialized' };
  }

  try {
    const context = {
      currentFile: request.currentFile,
      currentProject: request.currentProject || getAppRoot(),
      workingDirectory: process.cwd()
    };

    const result = await agentOrchestrator.process(request.userRequest || request, context);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('agent-get-status', async () => {
  if (!agentOrchestrator) {
    return { success: false, error: 'Agent system not initialized', isProcessing: false };
  }

  try {
    const status = agentOrchestrator.getStatus();
    const availableModels = agentLLM.getAvailableModels();
    return {
      success: true,
      ...status,
      hasLLM: availableModels.length > 0,
      availableModels: availableModels.map(m => ({
        provider: m.provider,
        name: m.name,
        quality: m.quality
      }))
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('agent-abort', async () => {
  if (!agentOrchestrator) {
    return { success: false, error: 'Agent system not initialized' };
  }

  try {
    const aborted = agentOrchestrator.abort();
    return { success: true, aborted };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('agent-get-history', async (event, limit = 10) => {
  if (!agentMemory) {
    return { success: false, error: 'Agent memory not initialized', history: [] };
  }

  try {
    const history = agentMemory.episodic.getRecentEpisodes(limit);
    return { success: true, history };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('agent-approve-task', async (event, taskId) => {
  if (!agentOrchestrator) {
    return { success: false, error: 'Agent system not initialized' };
  }

  try {
    agentOrchestrator.grantApproval(taskId);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('agent-deny-task', async (event, taskId) => {
  if (!agentOrchestrator) {
    return { success: false, error: 'Agent system not initialized' };
  }

  try {
    agentOrchestrator.denyApproval(taskId);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('agent-get-stats', async () => {
  if (!agentMemory) {
    return { success: false, error: 'Agent memory not initialized', stats: null };
  }

  try {
    const stats = agentMemory.getStats();
    return { success: true, stats };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('agent-config-update', async (event, config) => {
  if (!agentLLM) {
    return { success: false, error: 'Agent LLM not initialized' };
  }

  try {
    agentLLM.updateConfig(config);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 加载保存的扫描结果
ipcMain.handle('load-saved-scan-results', async (event, projectPath) => {
  try {
    const folderName = path.basename(projectPath);
    const appDataPath = DATA_DIR;
    const projectScanDir = path.join(appDataPath, 'AI_Scan_file', folderName);
    const summaryFilePath = path.join(projectScanDir, 'scan-summary.json');

    console.log('[Load Scan] Checking for saved scan results:', summaryFilePath);

    if (!fs.existsSync(summaryFilePath)) {
      return { success: false, error: 'No saved scan results found', hasSavedResults: false };
    }

    // 读取扫描摘要
    const summaryContent = fs.readFileSync(summaryFilePath, 'utf-8');
    const summary = JSON.parse(summaryContent);

    // 读取代码图（如果存在）
    const graphFilePath = path.join(projectScanDir, '.code-graph.json');
    let codeGraph = null;
    if (fs.existsSync(graphFilePath)) {
      const graphContent = fs.readFileSync(graphFilePath, 'utf-8');
      codeGraph = JSON.parse(graphContent);
      console.log('[Load Scan] Code graph loaded from:', graphFilePath);
    }

    // AI Context 文件路径
    const contextFilePath = path.join(projectScanDir, `${folderName}_AI_CONTEXT.md`);
    let hasAIContext = false;
    if (fs.existsSync(contextFilePath)) {
      hasAIContext = true;
      console.log('[Load Scan] AI Context found at:', contextFilePath);
    }

    // Test Context 文件路径
    const testContextFilePath = path.join(projectScanDir, `${folderName}_TEST_CONTEXT.json`);
    let hasTestContext = false;
    if (fs.existsSync(testContextFilePath)) {
      hasTestContext = true;
      console.log('[Load Scan] Test Context found at:', testContextFilePath);
    }

    console.log('[Load Scan] Scan results loaded successfully');

    // 设置当前项目路径
    global.currentProjectPath = projectPath;
    console.log('[Load Scan] Set currentProjectPath:', projectPath);

    return {
      success: true,
      hasSavedResults: true,
      summary,
      codeGraph,
      hasAIContext,
      hasTestContext,
      savedPaths: {
        summary: summaryFilePath,
        codeGraph: graphFilePath,
        aiContext: contextFilePath,
        testContext: testContextFilePath,
      },
    };
  } catch (error) {
    console.error('[Load Scan] Failed to load saved scan results:', error.message);
    return { success: false, error: error.message, hasSavedResults: false };
  }
});

ipcMain.handle('agent-clear-history', async () => {
  if (!agentMemory) {
    return { success: false, error: 'Agent memory not initialized' };
  }

  try {
    agentMemory.episodic.clear();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Agent Code Review - Intelligent code review with context
ipcMain.handle('agent-code-review', async (event, request) => {
  const { targetPath, issues, options = {} } = request;

  if (!agentOrchestrator) {
    return { success: false, error: 'Agent system not initialized' };
  }

  try {
    // Emit start event
    mainWindow?.webContents.send('agent-event', {
      type: 'start',
      message: 'Starting intelligent code review...'
    });

    // Build review request
    const reviewRequest = {
      tool: 'review',
      action: 'execute',
      description: `Perform intelligent code review on ${issues?.length || 'all'} issues`,
      params: {
        targetPath,
        baseIssues: issues,
        focusAreas: options.focusAreas || ['code', 'performance'],
        includeFullAnalysis: options.includeFullAnalysis || false
      }
    };

    // Use the review tool directly for better control
    const reviewTool = agentTools.get('review');
    if (!reviewTool) {
      return { success: false, error: 'Review tool not available' };
    }

    // Emit progress event
    mainWindow?.webContents.send('agent-event', {
      type: 'progress',
      message: 'Analyzing code issues with context...'
    });

    // Execute review
    const result = await reviewTool.execute(reviewRequest.params, {
      currentProject: targetPath,
      currentFile: null
    });

    if (result.success) {
      // Emit complete event
      mainWindow?.webContents.send('agent-event', {
        type: 'complete',
        result: result.data
      });

      return { success: true, result: result.data };
    } else {
      // Emit error event
      mainWindow?.webContents.send('agent-event', {
        type: 'error',
        error: result.error
      });

      return { success: false, error: result.error };
    }
  } catch (error) {
    // Emit error event
    mainWindow?.webContents.send('agent-event', {
      type: 'error',
      error: error.message
    });

    return { success: false, error: error.message };
  }
});

// ============================================
// Helper Functions
// ============================================

function getDirectoryStructure(dirPath, depth = 0) {
  const maxDepth = 15;
  if (depth > maxDepth) return [];

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const structure = [];
    const excludeDirs = ['node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.nuxt', 'target', 'vendor'];

    for (const entry of entries) {
      // 跳过隐藏文件和目录
      if (entry.name.startsWith('.')) {
        continue;
      }

      if (entry.isDirectory() && excludeDirs.includes(entry.name)) {
        continue;
      }

      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        const children = getDirectoryStructure(fullPath, depth + 1);
        structure.push({
          path: fullPath,
          name: entry.name,
          type: 'folder',
          expanded: false,
          children: children,
          childCount: children.length,
        });
      } else {
        // 获取文件信息，但不进行类型过滤
        let fileSize = 0;
        try {
          const stats = fs.statSync(fullPath);
          fileSize = stats.size;
        } catch (err) {
          console.error(`Error getting file size for ${fullPath}:`, err.message);
        }

        structure.push({
          path: fullPath,
          name: entry.name,
          type: 'file',
          language: codeScanner ? codeScanner.getLanguage(fullPath) : 'unknown',
          size: fileSize,
        });
      }
    }

    // 按类型和名称排序：文件夹在前，然后是文件
    return structure.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'folder' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  } catch (error) {
    console.error(`Error reading directory ${dirPath}:`, error.message);
    return [];
  }
}

// ============================================
// App Lifecycle
// ============================================

// Fix network service crash on Windows
app.commandLine.appendSwitch('disable-features', 'VizDisplayCompositor');

// Register custom protocol for local images
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'local-resource',
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

app.whenReady().then(() => {
  // 初始化 QA Reviewer 取消标志
  global.qaReviewerCancelled = false;

  // Register protocol handler for serving local images
  protocol.handle('local-resource', (request) => {
    // 调试：打印完整的原始 URL
    console.log('[local-resource] Raw request.url:', request.url);

    // 正确移除协议前缀: local-resource:// 是 18 个字符
    const url = request.url.slice(18); // 使用 slice 更安全

    // 调试：打印处理后的 URL
    console.log('[local-resource] URL after removing protocol:', url);

    // 解码 URL（处理中文和特殊字符）
    let decodedUrl;
    try {
      decodedUrl = decodeURIComponent(url);
    } catch (e) {
      decodedUrl = url;
    }

    // 转换路径格式：处理各种 Windows 路径格式
    let filePath = decodedUrl;

    // 情况1: e:/AI/data/... → E:\AI\data\...
    // 情况2: E:/AI/data/... → E:\AI\data\...
    // 情况3: E:\AI\data\... → 已经是正确格式

    if (filePath.match(/^[a-zA-Z]:[\/]/)) {
      // 有驱动器号和分隔符的路径
      const driveLetter = filePath.charAt(0).toUpperCase();
      const restOfPath = filePath.substring(3); // 跳过 "X:/" 或 "X:\"
      // 统一使用反斜杠
      filePath = driveLetter + ':' + restOfPath.replace(/\//g, '\\');
    } else if (filePath.match(/^[a-zA-Z]:\\/)) {
      // 已经是 Windows 格式 (E:\...)
      // 只需要确保驱动器号大写
      const driveLetter = filePath.charAt(0).toUpperCase();
      filePath = driveLetter + filePath.substring(1);
    }

    // 最后使用 path.normalize 清理路径
    filePath = path.normalize(filePath);

    console.log('[local-resource] Serving:', {
      originalUrl: url,
      decodedUrl,
      filePath,
      exists: fs.existsSync(filePath)
    });

    // 读取文件并返回 Response
    try {
      if (!fs.existsSync(filePath)) {
        console.error('[local-resource] File not found:', filePath);
        return new Response(`File not found: ${filePath}`, { status: 404 });
      }

      const data = fs.readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml',
        '.bmp': 'image/bmp',
      };
      const mimeType = mimeTypes[ext] || 'application/octet-stream';

      return new Response(data, {
        headers: {
          'Content-Type': mimeType,
          'Cache-Control': 'no-cache',
        },
      });
    } catch (error) {
      console.error('[local-resource] Error serving file:', {
        filePath,
        error: error.message
      });
      return new Response(`Error: ${error.message}`, { status: 500 });
    }
  });

  initializeModules();
  createWindow();
});

app.on('window-all-closed', () => {
  // Stop all running projects
  if (projectRunner) {
    projectRunner.stopAll();
  }

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// ============================================
// Advanced Testing IPC Handlers
// ============================================

// Parse advanced Excel test cases
ipcMain.handle('parse-advanced-excel', async (event, filePath) => {
  if (!testingManager) {
    return { success: false, error: 'Testing manager not initialized' };
  }

  try {
    return testingManager.parseAdvancedExcel(filePath);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Generate advanced test from Excel
ipcMain.handle('generate-advanced-test', async (event, excelPath, options) => {
  if (!testingManager) {
    return { success: false, error: 'Testing manager not initialized' };
  }

  try {
    return testingManager.generateAdvancedTest(excelPath, options);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Generate advanced Excel template
ipcMain.handle('generate-advanced-excel-template', async (event, outputPath) => {
  if (!testingManager) {
    return { success: false, error: 'Testing manager not initialized' };
  }

  try {
    return testingManager.generateAdvancedTemplate(outputPath);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Get validation types info
ipcMain.handle('get-validation-types-info', async () => {
  if (!testingManager) {
    return { success: false, error: 'Testing manager not initialized' };
  }

  try {
    return { success: true, types: testingManager.getValidationTypesInfo() };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Get action types info
ipcMain.handle('get-action-types-info', async () => {
  if (!testingManager) {
    return { success: false, error: 'Testing manager not initialized' };
  }

  try {
    return { success: true, types: testingManager.getActionTypesInfo() };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ============================================
// Figma Integration IPC Handlers
// ============================================

// Set Figma access token
ipcMain.handle('set-figma-token', async (event, token) => {
  if (!testingManager) {
    return { success: false, error: 'Testing manager not initialized' };
  }

  try {
    testingManager.setFigmaAccessToken(token);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Extract Figma design specs
ipcMain.handle('extract-figma-specs', async (event, figmaUrl, nodeId) => {
  if (!testingManager) {
    return { success: false, error: 'Testing manager not initialized' };
  }

  try {
    return await testingManager.extractFigmaDesignSpecs(figmaUrl, nodeId);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Generate Excel from Figma
ipcMain.handle('generate-excel-from-figma', async (event, figmaUrl, outputPath, options) => {
  if (!testingManager) {
    return { success: false, error: 'Testing manager not initialized' };
  }

  try {
    return await testingManager.generateExcelFromFigma(figmaUrl, outputPath, options);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Batch download Figma screenshots
ipcMain.handle('download-figma-screenshots', async (event, fileKey, nodeIds, outputDir, options) => {
  if (!testingManager) {
    return { success: false, error: 'Testing manager not initialized' };
  }

  try {
    return await testingManager.batchDownloadFigmaScreenshots(fileKey, nodeIds, outputDir, options);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Get Figma file info
ipcMain.handle('get-figma-file', async (event, fileKey) => {
  if (!testingManager) {
    return { success: false, error: 'Testing manager not initialized' };
  }

  try {
    return await testingManager.getFigmaFile(fileKey);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Get Figma file node
ipcMain.handle('get-figma-node', async (event, fileKey, nodeId) => {
  if (!testingManager) {
    return { success: false, error: 'Testing manager not initialized' };
  }

  try {
    return await testingManager.getFigmaFileNode(fileKey, nodeId);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ============================================
// AI Test Generation IPC Handlers
// ============================================

// Generate tests from requirement
ipcMain.handle('generate-tests-from-requirement', async (event, requirementText, options) => {
  if (!testingManager) {
    return { success: false, error: 'Testing manager not initialized' };
  }

  try {
    return await testingManager.generateTestsFromRequirement(requirementText, options);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Generate tests from Figma
ipcMain.handle('generate-tests-from-figma', async (event, figmaSpecs, options) => {
  if (!testingManager) {
    return { success: false, error: 'Testing manager not initialized' };
  }

  try {
    return await testingManager.generateTestsFromFigma(figmaSpecs, options);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Generate tests from description
ipcMain.handle('generate-tests-from-description', async (event, description, options) => {
  if (!testingManager) {
    return { success: false, error: 'Testing manager not initialized' };
  }

  try {
    return await testingManager.generateTestsFromDescription(description, options);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Generate selector
ipcMain.handle('generate-selector', async (event, elementDescription, context) => {
  if (!testingManager) {
    return { success: false, error: 'Testing manager not initialized' };
  }

  try {
    return await testingManager.generateSelector(elementDescription, context);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ============================================
// Visual Regression Testing IPC Handlers
// ============================================

// Compare images
ipcMain.handle('compare-images', async (event, image1Path, image2Path, options) => {
  if (!testingManager) {
    return { success: false, error: 'Testing manager not initialized' };
  }

  try {
    return await testingManager.compareImages(image1Path, image2Path, options);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Batch compare screenshots
ipcMain.handle('batch-compare-screenshots', async (event, screenshotPairs, options) => {
  if (!testingManager) {
    return { success: false, error: 'Testing manager not initialized' };
  }

  try {
    return await testingManager.batchCompareScreenshots(screenshotPairs, options);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Generate visual report
ipcMain.handle('generate-visual-report', async (event, comparisonResults, outputPath) => {
  if (!testingManager) {
    return { success: false, error: 'Testing manager not initialized' };
  }

  try {
    return await testingManager.generateVisualReport(comparisonResults, outputPath);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Set visual threshold
ipcMain.handle('set-visual-threshold', async (event, threshold) => {
  if (!testingManager) {
    return { success: false, error: 'Testing manager not initialized' };
  }

  try {
    testingManager.setVisualThreshold(threshold);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ============================================================
// 综合视觉比对服务（像素级 + AI）
// ============================================================

// Compare two images with both pixel-level and AI analysis
ipcMain.handle('visual-compare', async (event, expectedPath, actualPath, options = {}) => {
  try {
    const { VisualComparisonService } = require('../testing/visual-comparison-service');

    const service = new VisualComparisonService({
      llmRouter: global.llmRouter,
      ...options
    });

    await service.initialize();

    const result = await service.compare(expectedPath, actualPath, {
      testContext: options.testContext || '',
      outputDir: options.outputDir || null,
      requirements: options.requirements || '',
    });

    return { success: true, result };
  } catch (error) {
    console.error('[Visual Compare] Error:', error);
    return { success: false, error: error.message };
  }
});

// Batch compare images with comprehensive analysis
ipcMain.handle('visual-batch-compare', async (event, pairs, options = {}) => {
  try {
    const { VisualComparisonService } = require('../testing/visual-comparison-service');

    const service = new VisualComparisonService({
      llmRouter: global.llmRouter,
      ...options
    });

    await service.initialize();

    const results = await service.batchCompare(pairs, {
      testContext: options.testContext || '',
      outputDir: options.outputDir || null,
      requirements: options.requirements || '',
    });

    // 生成 HTML 报告
    let reportPath = null;
    if (options.generateReport !== false && options.outputDir) {
      reportPath = path.join(options.outputDir, `visual-comparison-${Date.now()}.html`);
      await service.generateHTMLReport(results, reportPath);
    }

    return {
      success: true,
      results,
      reportPath,
      summary: {
        total: results.length,
        passed: results.filter(r => r.overallStatus === 'passed').length,
        failed: results.filter(r => r.overallStatus === 'failed').length,
        partial: results.filter(r => r.overallStatus === 'partial').length,
      }
    };
  } catch (error) {
    console.error('[Visual Batch Compare] Error:', error);
    return { success: false, error: error.message };
  }
});

// Generate visual comparison HTML report
ipcMain.handle('visual-generate-report', async (event, comparisonResults, outputPath) => {
  try {
    const { VisualComparisonService } = require('../testing/visual-comparison-service');

    const service = new VisualComparisonService();
    const reportPath = await service.generateHTMLReport(comparisonResults, outputPath);

    return { success: true, reportPath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ============================================
// Advanced Report Generation IPC Handlers
// ============================================

// Generate advanced HTML report
ipcMain.handle('generate-advanced-html-report', async (event, testResult, outputPath) => {
  if (!testingManager) {
    return { success: false, error: 'Testing manager not initialized' };
  }

  try {
    return await testingManager.generateAdvancedHTMLReport(testResult, outputPath);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Generate trend report
ipcMain.handle('generate-trend-report', async (event, historyResults, outputPath) => {
  if (!testingManager) {
    return { success: false, error: 'Testing manager not initialized' };
  }

  try {
    return await testingManager.generateTrendReport(historyResults, outputPath);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Generate all advanced reports
ipcMain.handle('generate-advanced-all-reports', async (event, testResult, outputDir, options) => {
  if (!testingManager) {
    return { success: false, error: 'Testing manager not initialized' };
  }

  try {
    return await testingManager.generateAdvancedAllReports(testResult, outputDir, options);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ============================================
// IPC Handlers - AI Test Agent Operations
// ============================================

ipcMain.handle('execute-bd-test', async (event, excelPath, options = {}) => {
  try {
    console.log('[AI Test] Executing BDD test from Excel:', excelPath);

    const result = await aiTestAgent.executeFromExcel(excelPath, {
      headless: options.headless !== false,
      slowMo: options.slowMo || 100,
      stopOnFailure: options.stopOnFailure !== false,
    });

    if (result.success) {
      // 发送测试完成事件
      mainWindow?.webContents.send('ai-test-complete', {
        type: 'bdd-test',
        result: result.testResult,
      });

      return {
        success: true,
        testResult: result.testResult,
        logs: aiTestAgent.getExecutionLogs(),
      };
    } else {
      return {
        success: false,
        error: result.error,
      };
    }
  } catch (error) {
    console.error('[AI Test] BDD test execution failed:', error);
    return {
      success: false,
      error: error.message,
      stack: error.stack,
    };
  }
});

ipcMain.handle('generate-ai-tests', async (event, requirement, options = {}) => {
  try {
    console.log('[AI Test] Generating tests from requirement:', requirement);

    const result = await aiTestAgent.generateTests(requirement, options);

    if (result.success) {
      return {
        success: true,
        generatedTests: result.generatedTests,
        projectContext: result.projectContext,
      };
    } else {
      return {
        success: false,
        error: result.error,
      };
    }
  } catch (error) {
    console.error('[AI Test] Test generation failed:', error);
    return {
      success: false,
      error: error.message,
      stack: error.stack,
    };
  }
});

ipcMain.handle('execute-generated-tests', async (event, generatedTests, options = {}) => {
  try {
    console.log('[AI Test] Executing generated tests');

    // 生成执行计划
    const executionPlan = aiTestAgent.parser.generateExecutionPlan(generatedTests);

    // 执行测试
    const testResult = await aiTestAgent.executeTestPlan(executionPlan, options);

    if (testResult.success) {
      // 发送测试完成事件
      mainWindow?.webContents.send('ai-test-complete', {
        type: 'generated-test',
        result: testResult,
      });

      return {
        success: true,
        testResult,
        logs: aiTestAgent.getExecutionLogs(),
      };
    } else {
      return {
        success: false,
        error: testResult.error || 'Test execution failed',
      };
    }
  } catch (error) {
    console.error('[AI Test] Generated test execution failed:', error);
    return {
      success: false,
      error: error.message,
      stack: error.stack,
    };
  }
});

// 导入 BDD 测试用例
ipcMain.handle('import-bdd-test-cases', async (event, filePath) => {
  try {
    console.log('[BDD Import] Importing BDD test cases from:', filePath);

    // 验证文件存在
    if (!fs.existsSync(filePath)) {
      return {
        success: false,
        error: `文件不存在: ${filePath}`,
      };
    }

    // 使用 BDDTestParser 解析 Excel
    const bddResult = bddTestParser.parseFromExcel(filePath);

    if (!bddResult.success) {
      return {
        success: false,
        error: bddResult.error || '解析 Excel 失败',
      };
    }

    // 生成测试计划
    const testPlan = bddTestParser.generateExecutionPlan(bddResult);

    console.log('[BDD Import] Successfully imported:', {
      modules: testPlan.modules.length,
      scenarios: bddResult.totalScenarios,
      steps: testPlan.totalSteps,
    });

    return {
      success: true,
      testPlan: testPlan,
      bddResult: bddResult,
    };
  } catch (error) {
    console.error('[BDD Import] Failed to import BDD test cases:', error);
    return {
      success: false,
      error: error.message,
      stack: error.stack,
    };
  }
});

ipcMain.handle('generate-test-report', async (event, testResult, format = 'html', outputPath = null) => {
  try {
    console.log('[AI Test] Generating test report:', format);

    let reportPath;
    const userDataPath = DATA_DIR;
    const reportsDir = path.join(userDataPath, 'test-reports');

    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    if (format === 'html') {
      const html = testReporter.generateHTML(testResult);
      outputPath = outputPath || path.join(reportsDir, `test-report-${timestamp}.html`);
      fs.writeFileSync(outputPath, html, 'utf8');
      reportPath = outputPath;
    } else if (format === 'markdown') {
      const markdown = testReporter.generateMarkdown(testResult);
      outputPath = outputPath || path.join(reportsDir, `test-report-${timestamp}.md`);
      fs.writeFileSync(outputPath, markdown, 'utf8');
      reportPath = outputPath;
    } else if (format === 'pdf') {
      outputPath = outputPath || path.join(reportsDir, `test-report-${timestamp}.pdf`);
      await testReporter.generatePDF(testResult, outputPath);
      reportPath = outputPath;
    } else if (format === 'excel' || format === 'xlsx') {
      outputPath = outputPath || path.join(reportsDir, `test-report-${timestamp}.xlsx`);
      testReporter.generateExcel(testResult, outputPath);
      reportPath = outputPath;
    } else {
      return {
        success: false,
        error: `Unsupported format: ${format}. Supported: html, markdown, pdf, excel`,
      };
    }

    console.log('[AI Test] Report generated:', reportPath);

    return {
      success: true,
      reportPath,
      format,
    };
  } catch (error) {
    console.error('[AI Test] Report generation failed:', error);
    return {
      success: false,
      error: error.message,
      stack: error.stack,
    };
  }
});

// 下载测试报告
ipcMain.handle('download-test-report', async (event, testResult, format = 'html') => {
  try {
    console.log('[AI Test] Downloading test report:', format);

    const userDataPath = DATA_DIR;
    const reportsDir = path.join(userDataPath, 'test-reports');

    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    let fileName, filePath, mimeType;

    if (format === 'html') {
      fileName = `test-report-${timestamp}.html`;
      filePath = path.join(reportsDir, fileName);
      const html = testReporter.generateHTML(testResult);
      fs.writeFileSync(filePath, html, 'utf8');
      mimeType = 'text/html';
    } else if (format === 'markdown') {
      fileName = `test-report-${timestamp}.md`;
      filePath = path.join(reportsDir, fileName);
      const markdown = testReporter.generateMarkdown(testResult);
      fs.writeFileSync(filePath, markdown, 'utf8');
      mimeType = 'text/markdown';
    } else if (format === 'pdf') {
      fileName = `test-report-${timestamp}.pdf`;
      filePath = path.join(reportsDir, fileName);
      await testReporter.generatePDF(testResult, filePath);
      mimeType = 'application/pdf';
    } else if (format === 'excel' || format === 'xlsx') {
      fileName = `test-report-${timestamp}.xlsx`;
      filePath = path.join(reportsDir, fileName);
      testReporter.generateExcel(testResult, filePath);
      mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    } else {
      return {
        success: false,
        error: `Unsupported format: ${format}`,
      };
    }

    // 触发下载
    mainWindow?.webContents.downloadURL(filePath);

    return {
      success: true,
      filePath,
      fileName,
      mimeType,
    };
  } catch (error) {
    console.error('[AI Test] Download report failed:', error);
    return {
      success: false,
      error: error.message,
    };
  }
});

// 生成所有格式的测试报告
ipcMain.handle('generate-all-test-reports', async (event, testResult) => {
  try {
    console.log('[AI Test] Generating all test report formats');

    const reports = await testReporter.generateAll(testResult);

    return {
      success: true,
      reports,
    };
  } catch (error) {
    console.error('[AI Test] Generate all reports failed:', error);
    return {
      success: false,
      error: error.message,
    };
  }
});

// 生成测试用例 Excel 文件
ipcMain.handle('generate-test-cases-excel', async (event, testPlan) => {
  try {
    console.log('[AI Test] Generating test cases Excel:', testPlan);

    const userDataPath = DATA_DIR;
    const reportsDir = path.join(userDataPath, 'test-reports');

    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `test-cases-${timestamp}.xlsx`;
    const filePath = path.join(reportsDir, fileName);

    // 使用 testReporter 生成 Excel
    await testReporter.generateTestCasesExcel(testPlan, filePath);

    // 返回文件信息
    return {
      success: true,
      fileName: fileName,
      filePath: filePath,
    };
  } catch (error) {
    console.error('[AI Test] Generate test cases Excel failed:', error);
    return {
      success: false,
      error: error.message,
    };
  }
});

// 执行视觉测试
ipcMain.handle('execute-visual-tests', async (event, testCases, options = {}) => {
  try {
    console.log('[AI Test] Executing visual tests');

    const results = await aiTestAgent.executeBatchVisualTests(testCases, options);

    return {
      success: true,
      results,
    };
  } catch (error) {
    console.error('[AI Test] Visual tests failed:', error);
    return {
      success: false,
      error: error.message,
    };
  }
});

ipcMain.handle('open-test-report', async (event, reportPath) => {
  try {
    console.log('[AI Test] Opening test report:', reportPath);

    // 检查文件是否存在
    if (!fs.existsSync(reportPath)) {
      return {
        success: false,
        error: 'Report file not found',
      };
    }

    // 在默认浏览器中打开
    const { shell } = require('electron');
    await shell.openPath(reportPath);

    return {
      success: true,
    };
  } catch (error) {
    console.error('[AI Test] Failed to open report:', error);
    return {
      success: false,
      error: error.message,
    };
  }
});

/**
 * AI Agent 测试相关 IPC 处理程序
 */

// 存储当前渲染进程的 WebContents，用于发送日志
let currentRenderer = null;

// AI Smart Test 专用日志输出函数
function aiSmartTestLog(type, message, data = {}) {
  const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  const logMessage = `\n${timestamp} [AI智能测试] ${type} | ${message}`;
  const dataMessage = Object.keys(data).length > 0 ? `\n   数据: ${JSON.stringify(data, null, 2)}` : '';

  // 输出到主进程控制台
  console.log(logMessage + dataMessage);

  // 发送到渲染进程，使其在浏览器开发者工具中可见
  if (currentRenderer) {
    currentRenderer.send('ai-smart-test-log', {
      timestamp,
      type,
      message,
      data,
    });
  }
}

// 分析需求并生成测试计划
ipcMain.handle('analyze-and-generate-tests', async (event, input) => {
  // 保存渲染进程引用
  currentRenderer = event.sender;

  try {
    aiSmartTestLog('开始', '正在分析需求并生成测试用例...');

    // 使用 AI Test Agent 的生成器
    const analysisResult = await aiTestAgent.analyzeAndGenerateTestPlan(input, aiSmartTestLog);

    if (analysisResult.success) {
      aiSmartTestLog('生成完成', `共生成 ${analysisResult.analysis.totalTests || 0} 个测试用例`, {
        功能测试: analysisResult.analysis.functionalTests || 0,
        UI测试: analysisResult.analysis.uiTests || 0,
        边界测试: analysisResult.analysis.boundaryTests || 0,
        异常测试: analysisResult.analysis.exceptionTests || 0,
      });

      // 自动保存测试用例
      if (input.projectPath) {
        const saveResult = testCaseStorage.saveTestCases(
          input.projectPath,
          analysisResult.testPlan,
          {
            requirements: input.requirements || '',
            savedAt: new Date().toISOString()
          }
        );
        if (saveResult.success) {
          aiSmartTestLog('保存成功', '测试用例已保存，下次可直接使用');
        }
      }

      return {
        success: true,
        analysis: analysisResult.analysis,
        testPlan: analysisResult.testPlan,
      };
    } else {
      aiSmartTestLog('错误', `分析失败: ${analysisResult.error || '未知错误'}`);
      return {
        success: false,
        error: analysisResult.error || '分析失败',
      };
    }
  } catch (error) {
    aiSmartTestLog('错误', `分析异常: ${error.message}`);
    return {
      success: false,
      error: error.message,
      stack: error.stack,
    };
  }
});

// ============================================
// Test Case Storage - 保存和加载测试用例
// ============================================

// 保存测试用例
ipcMain.handle('save-test-cases', async (event, projectPath, testPlan, metadata = {}, merge = true) => {
  try {
    // 记录即将保存的测试计划详情
    console.log('[保存测试用例] ========== 即将保存的测试计划 ==========');
    console.log('[保存测试用例] 项目路径:', projectPath);
    console.log('[保存测试用例] 测试计划包含', testPlan.modules?.length || 0, '个模块');
    testPlan.modules?.forEach((module, mIdx) => {
      console.log(`[保存测试用例] 模块 ${mIdx + 1}: ${module.module} (${module.scenarios?.length || 0} 个场景)`);
      module.scenarios?.forEach((scenario, sIdx) => {
        console.log(`[保存测试用例]   场景 ${sIdx + 1}: [${scenario.id}] ${scenario.name}`);
        scenario.steps?.forEach((step, stepIdx) => {
          const desc = step.description || step.text || step.desc || '无';
          console.log(`[保存测试用例]     步骤 ${stepIdx + 1} [${step.type}]: "${desc}"`);
        });
      });
    });
    console.log('[保存测试用例] ============================================');

    const result = testCaseStorage.saveTestCases(projectPath, testPlan, metadata, merge);

    // 保存成功后，通知所有窗口刷新测试用例列表
    if (result.success) {
      console.log('[保存测试用例] 保存成功，通知前端刷新列表');
      // 使用 webContents.send 向所有窗口发送刷新事件
      const windows = BrowserWindow.getAllWindows();
      windows.forEach(win => {
        win.webContents.send('test-cases-updated');
      });
    }

    return result;
  } catch (error) {
    console.error('[保存测试用例] 错误:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// 加载测试用例
ipcMain.handle('load-test-cases', async (event, projectPath) => {
  try {
    const result = testCaseStorage.loadTestCases(projectPath);
    return result;
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
});

// 获取所有已保存的测试用例列表
ipcMain.handle('list-saved-test-cases', async () => {
  try {
    console.log('[list-saved-test-cases] ========== 开始获取已保存的测试用例列表 ==========');
    const result = testCaseStorage.listSavedTestCases();
    console.log('[list-saved-test-cases] 返回结果: success =', result.success, ', testCases 数量 =', result.testCases?.length || 0);
    if (result.testCases && result.testCases.length > 0) {
      result.testCases.forEach((tc, i) => {
        console.log(`[list-saved-test-cases] 测试文档 ${i+1}:`, tc.projectName, '模块数:', tc.testPlan?.modules?.length || 0);
      });
    }
    console.log('[list-saved-test-cases] ============================================');
    return result;
  } catch (error) {
    console.error('[list-saved-test-cases] 错误:', error);
    return {
      success: false,
      error: error.message,
      testCases: []
    };
  }
});

// 检查是否有已保存的测试用例
ipcMain.handle('has-saved-test-cases', async (event, projectPath) => {
  try {
    const hasSaved = testCaseStorage.hasSavedTestCases(projectPath);
    const loadResult = testCaseStorage.loadTestCases(projectPath);
    return {
      hasSaved,
      ...(loadResult.exists ? loadResult : {})
    };
  } catch (error) {
    return {
      hasSaved: false,
      error: error.message
    };
  }
});

// 删除保存的测试用例
ipcMain.handle('delete-test-cases', async (event, projectPath) => {
  try {
    return testCaseStorage.deleteTestCases(projectPath);
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
});

// 加载已保存的测试用例（别名）
ipcMain.handle('load-saved-test-cases', async (event, projectPath) => {
  try {
    const result = testCaseStorage.loadTestCases(projectPath);
    // Return the full data including testPlan
    return {
      success: result.exists,
      testCases: result.exists ? result : null,
      error: result.exists ? null : result.error
    };
  } catch (error) {
    return {
      success: false,
      testCases: null,
      error: error.message
    };
  }
});

// 更新单个测试用例
ipcMain.handle('update-test-case', async (event, projectPath, testCaseId, updatedData) => {
  try {
    return testCaseStorage.updateTestCase(projectPath, testCaseId, updatedData);
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
});

// 删除单个测试用例
ipcMain.handle('delete-test-case', async (event, projectPath, testCaseId) => {
  try {
    return testCaseStorage.deleteTestCase(projectPath, testCaseId);
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
});

/**
 * 检查页面是否有内容（不只是 loading 状态）
 * 使用简单的 HTTP 请求检查
 * @param {string} url - 页面 URL
 * @returns {Promise<boolean>} 页面是否有内容
 */
async function checkPageHasContent(url) {
  const http = require('http');
  const https = require('https');

  return new Promise((resolve) => {
    const isHttps = url.startsWith('https:');
    const client = isHttps ? https : http;
    const urlObj = new URL(url);

    // 将 localhost 转换为 127.0.0.1
    let hostname = urlObj.hostname;
    if (hostname === 'localhost' || hostname === '::1') {
      hostname = '127.0.0.1';
    }

    const options = {
      hostname: hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname,
      method: 'GET',
      headers: {
        'User-Agent': 'DevQualityInspector/1.0',
      },
      timeout: 5000,
      family: 4
    };

    const req = client.request(options, (res) => {
      // 只要能连接到服务器，就认为有内容
      // Flutter Web 的真实内容需要 Playwright 来检查
      resolve(true);
    });

    req.on('error', () => {
      resolve(false);
    });

    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });

    req.end();
  });
}

/**
 * 检查端口是否被占用
 * @param {number} port - 端口号
 * @returns {Promise<boolean>} 端口是否被占用
 */
async function checkPortInUse(port) {
  const net = require('net');
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', () => {
      resolve(true); // 端口被占用
    });

    server.once('listening', () => {
      server.close();
      resolve(false); // 端口可用
    });

    server.listen(port, '127.0.0.1');
  });
}

/**
 * 测试端口是否真的有服务在运行（尝试连接）
 * @param {number} port - 端口号
 * @returns {Promise<boolean>} 是否可以连接
 */
async function testConnection(port) {
  const net = require('net');
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1', timeout: 3000 });

    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });

    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

/**
 * 杀死占用指定端口的进程
 * @param {number} port - 端口号
 * @returns {Promise<boolean>} 是否成功杀死进程
 */
async function killProcessOnPort(port) {
  const { exec } = require('child_process');
  return new Promise((resolve) => {
    // Windows 命令：查找并杀死占用端口的进程
    exec(`for /f "tokens=5" %a in ('netstat -aon ^| findstr :${port}') do @taskkill /F /PID %a 2>nul`, (error) => {
      if (error) {
        // 可能没有进程占用端口，忽略错误
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

// 执行 AI Agent 生成的测试
ipcMain.handle('execute-agent-tests', async (event, testPlan, options = {}) => {
  // 保存渲染进程引用
  currentRenderer = event.sender;

  try {
    // 检查 aiTestAgent 是否已初始化
    if (!aiTestAgent) {
      console.error('[execute-agent-tests] AI Test Agent 未初始化');
      return {
        success: false,
        error: 'AI Test Agent 未初始化，请重启应用'
      };
    }
    // AI Smart Test 专用日志
    function log(type, message, data = {}) {
      const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false });
      const logMessage = `\n${timestamp} [AI智能测试] ${type} | ${message}`;
      const dataMessage = Object.keys(data).length > 0 ? `\n   数据: ${JSON.stringify(data, null, 2)}` : '';

      // 输出到主进程控制台
      console.log(logMessage + dataMessage);

      // 发送到渲染进程
      if (currentRenderer) {
        currentRenderer.send('ai-smart-test-log', {
          timestamp,
          type,
          message,
          data,
        });
      }
    }

    /**
     * 等待服务器就绪 - 使用原生 HTTP 请求检查
     */
    async function waitForServerReady(url, timeout = 60000) {
      const http = require('http');
      const https = require('https');
      const startTime = Date.now();
      const checkInterval = 2000; // 每2秒检查一次

      log('等待服务器', `等待服务器就绪: ${url}`);

      while (Date.now() - startTime < timeout) {
        try {
          // 使用原生 HTTP/HTTPS 模块发送请求
          const isHttps = url.startsWith('https:');
          const client = isHttps ? https : http;
          const urlObj = new URL(url);

          // 将 localhost 转换为 127.0.0.1 以避免 IPv6 连接问题
          let hostname = urlObj.hostname;
          if (hostname === 'localhost' || hostname === '::1') {
            hostname = '127.0.0.1';
          }

          await new Promise((resolve, reject) => {
            const options = {
              hostname: hostname,
              port: urlObj.port || (isHttps ? 443 : 80),
              path: urlObj.pathname,
              method: 'GET',
              headers: {
                'User-Agent': 'DevQualityInspector/1.0',
              },
              timeout: 5000,
              family: 4  // 强制使用 IPv4
            };

            const req = client.request(options, (res) => {
              // 只要收到任何响应，就认为服务器就绪
              res.resume(); // 消耗响应体
              log('服务器响应', `收到响应，状态码: ${res.statusCode}`);
              resolve();
            });

            req.on('error', (err) => {
              reject(new Error(`连接失败: ${err.message}`));
            });

            req.on('timeout', () => {
              req.destroy();
              reject(new Error('请求超时'));
            });

            req.end();
          });

          log('服务器就绪', `服务器已就绪: ${url}`);
          return true;
        } catch (error) {
          // 连接失败，服务器还未就绪
          const elapsed = Math.round((Date.now() - startTime) / 1000);
          log('等待中', `等待服务器启动... (${elapsed}秒) - ${error.message}`);
        }

        await new Promise(resolve => setTimeout(resolve, checkInterval));
      }

      log('超时', `等待服务器超时 (${timeout}ms)`);
      return false;
    }

    // 如果是使用已保存的测试用例，跳过生成阶段
    if (options.useSavedTestCases) {
      log('使用已保存用例', '使用之前保存的测试用例，跳过生成阶段');
    } else {
      log('开始执行', '开始执行测试用例...');
    }

    // 检查是否有项目需要启动
    let projectUrl = options.projectUrl || null;
    let runningProject = null;

    log('开始', `executeAgentTests 开始. projectUrl=${projectUrl}, projectPath=${options.projectPath}`);

    // 首先检查是否已有运行中的项目
    const runningProjects = projectRunner.getRunningProjects();
    if (runningProjects.length > 0) {
      runningProject = runningProjects[0];
      // 清除可能错误的 actualUrl（避免使用 CDP 端点而不是 Web 应用 URL）
      // 多轮测试时，actualUrl 可能包含调试端口，需要使用固定端口
      if (runningProject.actualUrl) {
        const portMatch = runningProject.actualUrl.match(/:(\d+)/);
        if (portMatch) {
          const urlPort = parseInt(portMatch[1], 10);
          // 如果 actualUrl 包含调试端口（>= 40000），清除它
          if (urlPort >= 40000) {
            log('清除错误URL', `检测到 actualUrl 包含调试端口 (${urlPort})，将使用固定端口 ${runningProject.port || 8080}`);
            runningProject.actualUrl = null;
          }
        }
      }
      log('检测到运行项目', `已有项目在运行: ${runningProject.projectId}, 端口: ${runningProject.port || 8080}`);
    } else if (options.projectPath) {
      // 检查端口 8080 是否已被占用（可能用户手动启动了项目）
      const portInUse = await checkPortInUse(8080);
      if (portInUse) {
        log('检测到端口占用', `端口 8080 已被占用，检查是否有服务在运行...`);

        // 测试是否真的可以连接
        const canConnect = await testConnection(8080);
        if (canConnect) {
          log('确认服务运行', `端口 8080 确实有服务在运行，将使用该服务`);
          projectUrl = options.projectUrl || 'http://localhost:8080';
          runningProject = {
            projectId: 'external-' + Date.now(),
            port: 8080,
            projectPath: options.projectPath
          };
          // 有服务在运行，跳过启动项目
        } else {
          log('端口僵尸', `端口被占用但无服务响应，清理僵尸进程...`);
          await killProcessOnPort(8080);
          await new Promise(resolve => setTimeout(resolve, 1500)); // 等待进程完全退出

          // 重新检查端口是否可用
          const stillInUse = await checkPortInUse(8080);
          if (stillInUse) {
            log('错误', `端口仍被占用，无法启动项目`);
            return {
              success: false,
              error: '端口 8080 被占用且无法释放，请手动关闭占用该端口的程序后重试'
            };
          }
          log('端口已释放', '端口 8080 已释放，将启动新项目');
          // 端口已释放，继续到下面的启动项目流程
        }
      }
      // 如果没有 runningProject，继续到下面的启动项目流程
    }

    // 如果没有 runningProject 且有 projectPath，启动项目
    if (!runningProject && options.projectPath) {
        // 没有运行中的项目，自动启动
        log('启动项目', `正在启动项目: ${options.projectPath}`);

        // 收集项目输出用于错误诊断
        const projectOutput = [];

        try {
          const runResult = await projectRunner.run(options.projectPath, {
            openBrowser: false,  // 不自动打开浏览器，让 Playwright 控制
            onOutput: (projectId, output) => {
              // 收集所有输出
              projectOutput.push(output);

              // 记录关键输出用于调试
              const outputStr = typeof output === 'string' ? output : JSON.stringify(output);
              if (outputStr.includes('error') || outputStr.includes('Error') || outputStr.includes('failed') || outputStr.includes('Exception')) {
                log('项目输出', outputStr.substring(0, 300));
              }
            },
            onExit: (projectId, exitInfo) => {
              const exitMsg = `项目 ${projectId} 已退出 (code: ${exitInfo.code || 'unknown'})`;
              log('项目退出', exitMsg, exitInfo);

              // 如果异常退出，显示最后的输出
              if (exitInfo.code !== 0 && projectOutput.length > 0) {
                const lastOutputs = projectOutput.slice(-5).map(o =>
                  typeof o === 'string' ? o : JSON.stringify(o)
                ).join('\n');
                log('错误输出', lastOutputs.substring(0, 500));
              }
            }
          });

        if (runResult.success) {
          log('项目启动', `项目启动成功，端口: ${runResult.port}`, {
            projectId: runResult.projectId,
            port: runResult.port
          });

          // 设置 runningProject 为新启动的项目
          runningProject = {
            projectId: runResult.projectId,
            port: runResult.port || 8080,
          };
          log('项目跟踪', `已跟踪项目: ${runningProject.projectId}`);

          // 等待服务器启动（Flutter web 需要一些时间）
          log('等待', '等待 Flutter Web 服务器启动...');
          await new Promise(resolve => setTimeout(resolve, 5000)); // 增加到5秒

          // 验证项目仍在运行
          const newRunningProjects = projectRunner.getRunningProjects();
          if (newRunningProjects.length > 0) {
            runningProject = newRunningProjects[0];
            log('项目状态', `项目正在运行: ${runningProject.projectId}`);
          } else {
            log('警告', '项目启动后未能从运行列表中获取，但将继续使用已记录的项目信息');
          }
        } else {
          log('错误', `项目启动失败: ${runResult.error || '未知错误'}`);
          return {
            success: false,
            error: `项目启动失败: ${runResult.error || '未知错误'}。请确保项目路径正确且依赖已安装。`
          };
        }
      } catch (error) {
        log('错误', `项目启动异常: ${error.message}`);
        return {
          success: false,
          error: `项目启动异常: ${error.message}`
        };
      }
    }

    // 获取项目 URL 和 CDP 端点
    let cdpEndpoint = null;
    if (runningProject) {
      // 获取 CDP 端点（WebSocket URL）
      if (runningProject.cdpEndpoint) {
        cdpEndpoint = runningProject.cdpEndpoint;
        log('CDP端点', `检测到 Chrome 调试端点: ${cdpEndpoint}`);
      }

      // 如果还没有 projectUrl，从 runningProject 获取
      if (!projectUrl) {
        // 构建 Web 应用 URL - 优先使用端口而不是 actualUrl
        // 因为 actualUrl 可能是 CDP 端点的 HTTP URL，不是实际的 Web 应用地址
        const port = runningProject.port || 8080;
        projectUrl = `http://localhost:${port}`;

        // 检查 actualUrl 是否是有效的 Web 应用 HTTP URL（不是 CDP 端点）
        let useActualUrl = false;
        if (runningProject.actualUrl) {
          const actualUrl = runningProject.actualUrl;
          // 排除 CDP 相关的 URL
          if (!actualUrl.includes('/ws') &&
              !actualUrl.includes('/qlUP') &&
              !actualUrl.includes('/Co=') &&
              !actualUrl.startsWith('ws://') &&
              !actualUrl.startsWith('wss://')) {
            // 检查端口是否在合理范围内（不是调试端口）
            // Dart VM Service 和 CDP 端点通常使用大于 40000 的端口
            const portMatch = actualUrl.match(/:(\d+)/);
            if (portMatch) {
              const urlPort = parseInt(portMatch[1], 10);
              // 只使用合理的 Web 服务端口（小于 40000），排除调试端口
              if (urlPort < 40000) {
                useActualUrl = true;
              }
            } else {
              useActualUrl = true;  // 没有端口号的 URL 也可能是有效的
            }
          }
        }

        if (useActualUrl) {
          projectUrl = runningProject.actualUrl;
          log('项目地址', `使用检测到的实际地址: ${projectUrl}`, {
            projectId: runningProject.projectId,
            actualUrl: runningProject.actualUrl
          });
        } else {
          log('项目地址', `使用端口构建地址: ${projectUrl}`, {
            projectId: runningProject.projectId,
            port: port
          });
        }
      } else {
        // projectUrl 已提供，但可能需要更新端口
        // 如果 runningProject 存在且有端口信息，使用实际端口
        if (runningProject && runningProject.port) {
          const urlMatch = projectUrl.match(/:(\d+)/);
          if (urlMatch) {
            const currentPort = parseInt(urlMatch[1], 10);
            if (currentPort !== runningProject.port && runningProject.port > 0) {
              log('更新端口', `将 URL 端口从 ${currentPort} 更新为 ${runningProject.port}`);
              projectUrl = projectUrl.replace(/:\d+/, `:${runningProject.port}`);
            }
          }
        }
      }
    }

    if (!projectUrl) {
      log('错误', '无法确定项目地址，请先运行项目');
      return {
        success: false,
        error: '无法确定项目地址，请先运行项目或提供项目路径'
      };
    }

    log('检查完成', `准备检查服务器就绪. projectUrl=${projectUrl}, runningProject=${runningProject ? runningProject.projectId : 'null'}`);

    // 等待服务器就绪（无论是新启动的还是已有的项目）
    const serverReady = await waitForServerReady(projectUrl, 60000);
    if (!serverReady) {
      log('错误', `服务器未能在60秒内就绪: ${projectUrl}`);
      return {
        success: false,
        error: `服务器未能在规定时间内就绪，请检查项目是否正常运行。URL: ${projectUrl}`
      };
    }

    // 对于 Flutter Web，需要等待 CDP 端点可用
    // CDP 端点表示 Flutter 应用已完全启动并准备好接受连接
    log('等待', '等待 Flutter Web 启动并检测 CDP 端点...');

    const maxFlutterWaitTime = 60000; // 最多等待 60 秒（缩短时间）
    const checkInterval = 2000; // 每 2 秒检查一次
    const flutterWaitStart = Date.now();
    let cdpDetected = false;

    // 同时记录最近的输出用于调试
    let lastOutputCheck = Date.now();

    while (Date.now() - flutterWaitStart < maxFlutterWaitTime) {
      await new Promise(resolve => setTimeout(resolve, checkInterval));

      const elapsed = Math.round((Date.now() - flutterWaitStart) / 1000);

      // 每 10 秒记录一次等待状态
      if (Date.now() - lastOutputCheck > 10000) {
        // 检查项目是否仍在运行
        const projects = projectRunner ? projectRunner.getRunningProjects() : [];
        const isExternal = runningProject?.projectId?.startsWith('external-');
        const stillRunning = isExternal || projects.some(p => p.projectId === runningProject?.projectId);
        
        if (!stillRunning) {
          log('错误', '项目已停止运行，无法继续测试');
          return {
            success: false,
            error: 'Flutter Web 项目已停止运行，请检查项目日志了解原因'
          };
        }
        log('等待中', `等待 CDP 端点... (${elapsed}秒) - 项目仍在运行`);
        lastOutputCheck = Date.now();
      }

      // 每次都从 runningProcesses 获取最新的项目信息（CDP 端点可能会在运行时更新）
      const projects = projectRunner ? projectRunner.getRunningProjects() : [];
      const currentProject = projects.find(p => p.projectId === runningProject?.projectId);

      // 检查是否已检测到 CDP 端点
      if (currentProject && currentProject.cdpEndpoint) {
        cdpEndpoint = currentProject.cdpEndpoint;
        cdpDetected = true;
        log('CDP就绪', `检测到 CDP 端点，耗时 ${elapsed} 秒: ${cdpEndpoint}`);
        break;
      }

      // 对于已经运行较久的项目（超过20秒），如果还没检测到 CDP，可能不会有了
      // 直接继续使用普通浏览器连接
      if (elapsed > 20 && !cdpDetected) {
        log('跳过CDP', `等待超过 20 秒仍未检测到 CDP 端点，将使用普通浏览器连接（Flutter 可能已在后台启动）`);
        break;
      }
    }

    if (!cdpDetected) {
      const elapsed = Math.round((Date.now() - flutterWaitStart) / 1000);
      log('警告', `未检测到 CDP 端点 (耗时 ${elapsed}秒)，将使用普通浏览器连接到 ${projectUrl}`);
      // 不设置 cdpEndpoint，让 Playwright 创建新的浏览器实例
      cdpEndpoint = null;
    } else {
      // 额外等待，确保应用完全渲染
      log('等待', 'CDP 端点已就绪，额外等待 3 秒确保应用完全渲染...');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    // 执行测试计划，传入项目 URL 和 CDP 端点
    // 记录即将执行的测试计划详情
    log('用例信息', '========== 即将执行的测试计划 ==========');
    log('用例数据', `测试计划包含 ${testPlan.modules?.length || 0} 个模块`);
    testPlan.modules?.forEach((module, mIdx) => {
      log('用例数据', `模块 ${mIdx + 1}: ${module.module} (${module.scenarios?.length || 0} 个场景)`);
      module.scenarios?.forEach((scenario, sIdx) => {
        log('用例数据', `  场景 ${sIdx + 1}: [${scenario.id}] ${scenario.name}`);
        scenario.steps?.forEach((step, stepIdx) => {
          const desc = step.description || step.text || step.desc || '无';
          log('用例数据', `    步骤 ${stepIdx + 1} [${step.type}]: "${desc}"`);
        });
      });
    });
    log('用例信息', '==========================================');

    const testResult = await aiTestAgent.executeTestPlan(testPlan, {
      headless: options.headless !== false,
      slowMo: options.slowMo || 100,
      stopOnFailure: options.stopOnFailure !== false,
      projectUrl: projectUrl,  // 传入项目 URL
      cdpEndpoint: cdpEndpoint,  // 传入 CDP 端点
    }, log);

    if (testResult.success) {
      log('执行完成', '所有测试用例执行完毕', {
        总数: testResult.totalScenarios,
        通过: testResult.passedScenarios,
        失败: testResult.failedScenarios,
        跳过: testResult.skippedScenarios,
        耗时: testResult.duration,
      });

      // 自动保存测试结果到测试用例存储
      if (options.projectPath && testCaseStorage) {
        try {
          log('保存结果', '正在保存测试结果...');

          // 加载现有的测试用例数据
          const existingData = testCaseStorage.loadTestCases(options.projectPath);

          if (existingData.exists) {
            // 更新每个场景的测试结果
            let updatedCount = 0;

            testResult.moduleResults?.forEach(moduleResult => {
              moduleResult.scenarioResults?.forEach(scenarioResult => {
                // 查找对应的场景并更新结果
                const module = existingData.testPlan.modules?.find(m => m.module === moduleResult.moduleName);
                if (module) {
                  const scenario = module.scenarios?.find(s => s.id === scenarioResult.scenarioId || s.name === scenarioResult.scenarioName);
                  if (scenario) {
                    // 更新场景的测试结果
                    scenario.lastResult = {
                      status: scenarioResult.success ? 'passed' : 'failed',
                      executedAt: new Date().toISOString(),
                      duration: scenarioResult.duration,
                      stepsPassed: scenarioResult.stepsPassed,
                      stepsFailed: scenarioResult.stepsFailed,
                      error: scenarioResult.error,
                    };
                    updatedCount++;
                  }
                }
              });
            });

            // 保存更新后的测试计划
            const saveResult = testCaseStorage.saveTestCases(
              options.projectPath,
              existingData.testPlan,
              {
                ...existingData.metadata,
                lastTestRun: new Date().toISOString(),
                lastTestSummary: {
                  total: testResult.totalScenarios,
                  passed: testResult.passedScenarios,
                  failed: testResult.failedScenarios,
                  skipped: testResult.skippedScenarios,
                }
              },
              false  // 更新测试结果时不合并，直接覆盖
            );

            if (saveResult.success) {
              log('保存成功', `测试结果已保存，更新了 ${updatedCount} 个场景的状态`);
            } else {
              log('保存失败', `无法保存测试结果: ${saveResult.error}`);
            }
          } else {
            log('跳过保存', '没有找到现有的测试用例数据，跳过结果保存');
          }
        } catch (error) {
          log('保存异常', `保存测试结果时出错: ${error.message}`);
        }
      }

      // 发送测试完成事件
      mainWindow?.webContents.send('ai-test-complete', {
        type: 'agent-test',
        result: testResult,
      });

      return {
        success: true,
        testResult,
        logs: aiTestAgent.getExecutionLogs(),
      };
    } else {
      // 测试执行完成但有失败场景 - 仍需返回 testResult 以便生成报告
      log('执行完成', '测试用例执行完毕（有失败场景）', {
        总数: testResult.totalScenarios || 0,
        通过: testResult.passedScenarios || 0,
        失败: testResult.failedScenarios || 0,
        跳过: testResult.skippedScenarios || 0,
        耗时: testResult.duration || 'N/A',
      });

      // 发送测试完成事件
      mainWindow?.webContents.send('ai-test-complete', {
        type: 'agent-test',
        result: testResult,
      });

      return {
        success: true,  // 改为 true，因为测试执行流程成功完成
        testResult,     // 返回测试结果以便生成报告
        logs: aiTestAgent.getExecutionLogs(),
      };
    }
  } catch (error) {
    const logMessage = `\n[AI智能测试] 错误 | ${error.message}`;
    console.log(logMessage);
    if (currentRenderer) {
      currentRenderer.send('ai-smart-test-log', {
        timestamp: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
        type: '错误',
        message: error.message,
        data: {},
      });
    }
    return {
      success: false,
      error: error.message,
      stack: error.stack,
    };
  }
});

// ============================================
// Console Log Collection
// ============================================

// Store console logs from renderer process
const consoleLogs = [];
const MAX_CONSOLE_LOGS = 1000; // Keep last 1000 logs

// Receive console logs from renderer
ipcMain.on('console-log', (event, logData) => {
  consoleLogs.push({
    ...logData,
    timestamp: logData.timestamp || Date.now()
  });

  // Keep only the last MAX_CONSOLE_LOGS entries
  if (consoleLogs.length > MAX_CONSOLE_LOGS) {
    consoleLogs.shift();
  }
});

// Get console logs
ipcMain.handle('get-console-logs', async () => {
  return {
    success: true,
    logs: consoleLogs,
    count: consoleLogs.length
  };
});

// Clear console logs
ipcMain.handle('clear-console-logs', async () => {
  consoleLogs.length = 0;
  return { success: true };
});

// Save console logs to file (for debugging)
ipcMain.handle('save-console-logs', async () => {
  try {
    const os = require('os');
    const path = require('path');
    const fs = require('fs');

    const logDir = path.join(os.tmpdir(), 'dev-quality-inspector-logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const logFile = path.join(logDir, `console-${Date.now()}.log`);
    const logContent = consoleLogs.map(log =>
      `[${new Date(log.timestamp).toISOString()}] [${log.level}] ${log.message}`
    ).join('\n');

    fs.writeFileSync(logFile, logContent, 'utf8');
    console.log('[Console] Logs saved to:', logFile);

    return { success: true, filePath: logFile };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

/**
 * 下载扫描结果文件
 * @param {string} filePath - 要下载的文件路径
 * @param {string} fileName - 下载时显示的文件名
 */
ipcMain.handle('download-scan-result', async (event, filePath, fileName) => {
  try {
    if (!fs.existsSync(filePath)) {
      return { success: false, error: '文件不存在' };
    }

    // 让用户选择保存位置
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: fileName || path.basename(filePath),
      title: '保存扫描结果文件',
      filters: [
        { name: 'Markdown Files', extensions: ['md'] },
        { name: 'JSON Files', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });

    if (result.canceled) {
      return { success: false, canceled: true };
    }

    // 复制文件到用户选择的位置
    fs.copyFileSync(filePath, result.filePath);

    return { success: true, savedPath: result.filePath };
  } catch (error) {
    console.error('[Download] Error downloading scan result:', error.message);
    return { success: false, error: error.message };
  }
});

/**
 * 下载 AI Context 文件
 * @param {string} projectPath - 项目路径
 */
ipcMain.handle('download-ai-context', async (event, projectPath) => {
  try {
    console.log('[Download] download-ai-context called with projectPath:', projectPath);
    const folderName = path.basename(projectPath);
    const appDataPath = DATA_DIR;
    const aiScanDir = path.join(appDataPath, 'AI_Scan_file', folderName);
    const contextFilePath = path.join(aiScanDir, `${folderName}_AI_CONTEXT.md`);
    console.log('[Download] Looking for AI Context at:', contextFilePath);
    console.log('[Download] File exists:', fs.existsSync(contextFilePath));

    // 检查文件是否存在
    if (!fs.existsSync(contextFilePath)) {
      // 尝试从项目根目录获取
      const projectContextPath = path.join(projectPath, 'AI_CONTEXT.md');
      if (fs.existsSync(projectContextPath)) {
        const targetPath = await dialog.showSaveDialog(mainWindow, {
          defaultPath: `${folderName}_AI_CONTEXT.md`,
          title: '保存 AI Context 文件',
          filters: [
            { name: 'Markdown Files', extensions: ['md'] },
            { name: 'All Files', extensions: ['*'] },
          ],
        });

        if (!targetPath.canceled) {
          fs.copyFileSync(projectContextPath, targetPath.filePath);
          return { success: true, savedPath: targetPath.filePath };
        }
        return { success: false, canceled: true };
      }
      return { success: false, error: 'AI Context 文件不存在，请先进行扫描' };
    }

    // 让用户选择保存位置
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: `${folderName}_AI_CONTEXT.md`,
      title: '保存 AI Context 文件',
      filters: [
        { name: 'Markdown Files', extensions: ['md'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });

    if (result.canceled) {
      return { success: false, canceled: true };
    }

    // 复制文件到用户选择的位置
    fs.copyFileSync(contextFilePath, result.filePath);

    return { success: true, savedPath: result.filePath };
  } catch (error) {
    console.error('[Download] Error downloading AI Context:', error.message);
    return { success: false, error: error.message };
  }
});

/**
 * 下载代码图文件
 * @param {string} projectPath - 项目路径
 */
ipcMain.handle('download-code-graph', async (event, projectPath) => {
  try {
    console.log('[Download] download-code-graph called with projectPath:', projectPath);
    const folderName = path.basename(projectPath);
    const appDataPath = DATA_DIR;
    const aiScanDir = path.join(appDataPath, 'AI_Scan_file', folderName);
    const graphFilePath = path.join(aiScanDir, '.code-graph.json');
    console.log('[Download] Looking for code graph at:', graphFilePath);
    console.log('[Download] File exists:', fs.existsSync(graphFilePath));

    // 检查文件是否存在
    if (!fs.existsSync(graphFilePath)) {
      return { success: false, error: '代码图文件不存在，请先进行扫描' };
    }

    // 让用户选择保存位置
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: `${folderName}_code-graph.json`,
      title: '保存代码图文件',
      filters: [
        { name: 'JSON Files', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });

    if (result.canceled) {
      return { success: false, canceled: true };
    }

    // 复制文件到用户选择的位置
    fs.copyFileSync(graphFilePath, result.filePath);

    return { success: true, savedPath: result.filePath };
  } catch (error) {
    console.error('[Download] Error downloading code graph:', error.message);
    return { success: false, error: error.message };
  }
});

/**
 * 下载测试上下文文件 (TEST_CONTEXT.json)
 * @param {string} projectPath - 项目路径
 */
ipcMain.handle('download-test-context', async (event, projectPath) => {
  try {
    console.log('[Download] download-test-context called with projectPath:', projectPath);
    const folderName = path.basename(projectPath);
    const appDataPath = DATA_DIR;
    const aiScanDir = path.join(appDataPath, 'AI_Scan_file', folderName);
    const contextFilePath = path.join(aiScanDir, `${folderName}_TEST_CONTEXT.json`);
    console.log('[Download] Looking for test context at:', contextFilePath);
    console.log('[Download] File exists:', fs.existsSync(contextFilePath));

    // 检查文件是否存在
    if (!fs.existsSync(contextFilePath)) {
      return { success: false, error: '测试上下文文件不存在，请先进行扫描' };
    }

    // 让用户选择保存位置
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: `${folderName}_TEST_CONTEXT.json`,
      title: '保存测试上下文文件',
      filters: [
        { name: 'JSON Files', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });

    if (result.canceled) {
      return { success: false, canceled: true };
    }

    // 复制文件到用户选择的位置
    fs.copyFileSync(contextFilePath, result.filePath);

    return { success: true, savedPath: result.filePath };
  } catch (error) {
    console.error('[Download] Error downloading test context:', error.message);
    return { success: false, error: error.message };
  }
});

/**
 * ============ 任务记录相关 IPC 处理器 ============
 */

/**
 * 创建新任务
 */
ipcMain.handle('task:create', async (event, task) => {
  try {
    const taskId = taskRecordManager.createTask(task);
    return { success: true, taskId };
  } catch (error) {
    console.error('[TaskRecord] Error creating task:', error.message);
    return { success: false, error: error.message };
  }
});

/**
 * 更新任务
 */
ipcMain.handle('task:update', async (event, taskId, updates) => {
  try {
    const task = taskRecordManager.updateTask(taskId, updates);
    return { success: true, task };
  } catch (error) {
    console.error('[TaskRecord] Error updating task:', error.message);
    return { success: false, error: error.message };
  }
});

/**
 * 获取任务
 */
ipcMain.handle('task:get', async (event, taskId) => {
  try {
    const task = taskRecordManager.getTask(taskId);
    if (!task) {
      return { success: false, error: '任务不存在' };
    }
    return { success: true, task };
  } catch (error) {
    console.error('[TaskRecord] Error getting task:', error.message);
    return { success: false, error: error.message };
  }
});

/**
 * 列出所有任务
 */
ipcMain.handle('task:list', async (event, filters) => {
  try {
    const tasks = taskRecordManager.listTasks(filters || {});
    return { success: true, tasks };
  } catch (error) {
    console.error('[TaskRecord] Error listing tasks:', error.message);
    return { success: false, error: error.message };
  }
});

/**
 * 添加修改记录
 */
ipcMain.handle('task:add-modification', async (event, taskId, modification) => {
  try {
    const mod = taskRecordManager.addModification(taskId, modification);
    return { success: true, modification: mod };
  } catch (error) {
    console.error('[TaskRecord] Error adding modification:', error.message);
    return { success: false, error: error.message };
  }
});

/**
 * 添加变更日志
 */
ipcMain.handle('task:add-changelog', async (event, entry) => {
  try {
    const log = taskRecordManager.addChangelogEntry(entry);
    return { success: true, log };
  } catch (error) {
    console.error('[TaskRecord] Error adding changelog:', error.message);
    return { success: false, error: error.message };
  }
});

/**
 * 生成任务报告
 */
ipcMain.handle('task:report', async (event, taskId) => {
  try {
    const report = taskRecordManager.generateTaskReport(taskId);
    if (!report) {
      return { success: false, error: '任务不存在' };
    }
    return { success: true, report };
  } catch (error) {
    console.error('[TaskRecord] Error generating report:', error.message);
    return { success: false, error: error.message };
  }
});

/**
 * 生成今日变更报告
 */
ipcMain.handle('task:daily-report', async () => {
  try {
    const report = taskRecordManager.generateDailyReport();
    return { success: true, report };
  } catch (error) {
    console.error('[TaskRecord] Error generating daily report:', error.message);
    return { success: false, error: error.message };
  }
});

// ============================================
// Helper Functions - QA Reviewer
// ============================================

/**
 * 独立扫描项目中的 i18n/多语言文件
 * @param {string} projectPath - 项目根目录
 * @param {string} projectType - 项目类型
 * @returns {string[]} 发现的 i18n 文件路径列表
 */
function discoverI18nFiles(projectPath, projectType = 'flutter') {
  const fs = require('fs');
  const path = require('path');

  // 定义各项目类型的 i18n 目录
  const i18nDirs = [];
  if (projectType === 'flutter') {
    i18nDirs.push('lib/lang', 'lib/l10n', 'lib/i18n', 'lib/intl');
  } else if (projectType === 'angular') {
    i18nDirs.push('src/assets/i18n', 'src/assets/locales', 'src/locale', 'src/locales', 'src/i18n', 'assets/i18n', 'assets/locales', 'locale', 'locales', 'i18n');
  } else if (projectType === 'vue' || projectType === 'react') {
    i18nDirs.push('src/locales', 'src/i18n', 'src/lang', 'locales', 'i18n', 'lang');
  } else {
    i18nDirs.push('locales', 'i18n', 'lang', 'l10n');
  }

  const discoveredFiles = [];

  for (const dir of i18nDirs) {
    const fullDir = path.join(projectPath, dir);
    if (!fs.existsSync(fullDir)) continue;

    try {
      const entries = fs.readdirSync(fullDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile()) {
          const filePath = path.join(fullDir, entry.name);
          // 已在 i18n 目录中，直接收录
          discoveredFiles.push(filePath.replace(/\\/g, '/'));
        }
      }
    } catch (err) {
      // 忽略读取错误
    }
  }

  return discoveredFiles;
}

/**
 * 智能文件分组：按功能模块分组文件
 * @param {string[]} filePaths - 文件路径列表
 * @param {Object} params - 审查参数
 * @returns {Segment[]} 分段列表
 */
function groupFilesByModule(filePaths, params) {
  const { Segment } = require('../qa-reviewer/strategies/segment-strategy');
  const fs = require('fs');

  console.log('[groupFilesByModule] 开始智能分组，总文件数:', filePaths.length);

  // 1. 首先按文件角色分类（而不是按模块）
  const coreFiles = [];      // 主要文件：view, controller, api, model
  const componentFiles = []; // 组件文件：component
  const i18nFiles = [];      // 多语言文件：i18n
  const otherFiles = [];     // 其他文件

  for (const filePath of filePaths) {
    const role = inferFileType(filePath, params.projectType || 'flutter');

    if (['view', 'controller', 'api', 'model'].includes(role)) {
      coreFiles.push({ filePath, role });
    } else if (role === 'component') {
      componentFiles.push({ filePath, role });
    } else if (role === 'i18n') {
      i18nFiles.push({ filePath, role });
    } else {
      otherFiles.push({ filePath, role });
    }
  }

  const i18nFilePaths = i18nFiles.map(f => f.filePath);
  console.log(`[groupFilesByModule] 文件分类: core=${coreFiles.length}, components=${componentFiles.length}, i18n=${i18nFiles.length}, other=${otherFiles.length}`);

  // 1.5 独立扫描项目中的 i18n 文件（不依赖用户选择的文件列表）
  if (i18nFilePaths.length === 0) {
    const projectPath = global.currentProjectPath || params.projectPath;
    if (projectPath) {
      const discoveredI18n = discoverI18nFiles(projectPath, params.projectType || 'flutter');
      if (discoveredI18n.length > 0) {
        console.log(`[groupFilesByModule] 独立发现 ${discoveredI18n.length} 个 i18n 文件:`, discoveredI18n);
        i18nFilePaths.push(...discoveredI18n);
      }
    }
  }

  // 2. 判断是否需要分段
  const totalCoreFiles = coreFiles.length;
  const MAX_FILES_PER_SEGMENT = 10;

  // 如果主要文件不多，不分段，一次审查
  if (totalCoreFiles <= MAX_FILES_PER_SEGMENT) {
    console.log('[groupFilesByModule] 主要文件数量较少，创建单个分段');

    const allCoreFilePaths = coreFiles.map(f => f.filePath);
    const allComponentFilePaths = componentFiles.map(f => f.filePath);
    const allOtherFilePaths = otherFiles.map(f => f.filePath);

    // 创建一个包含所有主要文件的分段
    const segment = new Segment({
      name: '完整功能审查',
      description: `审查所有主要文件（${totalCoreFiles}个）+ 组件按需读取`,
      files: [...allCoreFilePaths, ...allOtherFilePaths],
      features: ['full-review'],
      // 元数据：告诉执行器有哪些组件和多语言文件可用
      metadata: {
        availableComponents: allComponentFilePaths,
        componentCount: allComponentFilePaths.length,
        i18nFiles: i18nFilePaths,
        i18nCount: i18nFilePaths.length
      }
    });

    console.log(`[groupFilesByModule] 创建1个分段，包含${totalCoreFiles}个主要文件，${allComponentFilePaths.length}个组件可用，${i18nFilePaths.length}个多语言文件可用`);
    return [segment];
  }

  // 3. 如果主要文件很多，按功能模块分组
  console.log('[groupFilesByModule] 主要文件较多，按功能模块分组');

  // 定义模块识别规则
  const moduleRules = [
    {
      name: '账号管理',
      id: 'account-management',
      patterns: ['account', 'user', 'profile'],
      paths: ['/account_management/', '/user/', '/profile/'],
      priority: 10
    },
    {
      name: '菜单/导航',
      id: 'menu-navigation',
      patterns: ['menu', 'nav', 'sidebar', 'scaffold'],
      paths: ['/menu/', '/nav/', '/sidebar/', '/scaffold/'],
      priority: 5
    },
    {
      name: 'API接口',
      id: 'api',
      patterns: ['api', 'service', 'provider'],
      paths: ['/api/', '/services/', '/providers/'],
      priority: 8
    },
    {
      name: '控制器',
      id: 'controller',
      patterns: ['controller', 'control'],
      paths: ['/controller/', '/controllers/'],
      priority: 9
    },
    {
      name: '数据模型',
      id: 'model',
      patterns: ['model', 'entity', 'dto', 'type'],
      paths: ['/models/', '/entities/', '/types/', '/dto/'],
      priority: 7
    },
  ];

  // 分析主要文件所属的模块
  const coreFileModules = coreFiles.map(file => {
    const pathLower = file.filePath.toLowerCase();
    const fileName = file.filePath.split(/[/\\]/).pop().toLowerCase();

    let bestMatch = null;
    let bestScore = 0;

    for (const module of moduleRules) {
      let score = 0;

      // 检查路径匹配
      for (const pathPattern of module.paths) {
        if (pathLower.includes(pathPattern)) {
          score += module.priority * 2;
          break;
        }
      }

      // 检查文件名匹配
      for (const pattern of module.patterns) {
        if (fileName.includes(pattern)) {
          score += module.priority;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = module;
      }
    }

    return {
      ...file,
      module: bestMatch || { id: 'other', name: '其他', priority: 0 },
      score: bestScore
    };
  });

  // 按模块分组主要文件
  const moduleGroups = new Map();
  for (const file of coreFileModules) {
    const moduleId = file.module.id;
    if (!moduleGroups.has(moduleId)) {
      moduleGroups.set(moduleId, {
        module: file.module,
        files: []
      });
    }
    moduleGroups.get(moduleId).files.push(file.filePath);
  }

  // 为每个模块创建分段
  const segments = [];
  const allComponentFilePaths = componentFiles.map(f => f.filePath);

  for (const [moduleId, group] of moduleGroups.entries()) {
    if (group.files.length > 0) {
      segments.push(new Segment({
        name: `${group.module.name} (${group.files.length}个文件)`,
        description: `${group.module.name}模块 - 完整审查，组件按需读取`,
        files: group.files,
        features: [moduleId, 'module-review'],
        // 元数据：告诉执行器有哪些组件和多语言文件可用
        metadata: {
          availableComponents: allComponentFilePaths,
          componentCount: allComponentFilePaths.length,
          i18nFiles: i18nFilePaths,
          i18nCount: i18nFilePaths.length
        }
      }));
    }
  }

  console.log(`[groupFilesByModule] 创建${segments.length}个分段，每个分段包含主要文件，${allComponentFilePaths.length}个组件全局可用，${i18nFilePaths.length}个多语言文件全局可用`);
  return segments;
}

// 辅助函数：推断文件角色
function inferFileType(filePath, projectType = 'flutter') {
  const normalizedPath = filePath.replace(/\\/g, '/').toLowerCase();
  const fileName = filePath.split(/[/\\]/).pop().toLowerCase();
  const ext = filePath.split('.').pop().toLowerCase();

  // 测试文件
  if (fileName.includes('.test.') || fileName.includes('.spec.') ||
      fileName.includes('_test.') || fileName.endsWith('_test.dart') ||
      fileName.endsWith('_test.jsx') || fileName.endsWith('_test.js') ||
      normalizedPath.includes('/test/') || normalizedPath.includes('/tests/')) {
    return 'test';
  }

  // 生成的文件
  if (fileName.includes('.generated.') || fileName.includes('.g.') ||
      fileName.includes('.freezed.') || fileName.includes('.mock.')) {
    return 'generated';
  }

  // i18n/多语言文件检测（通用，适用于所有项目类型）
  if (normalizedPath.includes('/lang/') || normalizedPath.includes('/locale/') ||
      normalizedPath.includes('/locales/') || normalizedPath.includes('/i18n/') ||
      normalizedPath.includes('/l10n/') || normalizedPath.includes('/translations/') ||
      normalizedPath.includes('/intl/')) {
    return 'i18n';
  }
  // Flutter 特定的 i18n 路径
  if (projectType === 'flutter' &&
      (normalizedPath.includes('/lib/l10n/') || normalizedPath.includes('/lib/i18n/') ||
       normalizedPath.includes('/lib/lang/'))) {
    return 'i18n';
  }
  // Angular 特定的 i18n 路径
  if (projectType === 'angular' &&
      (normalizedPath.includes('/assets/i18n/') || normalizedPath.includes('/assets/locales/') ||
       normalizedPath.includes('/src/locale/') || normalizedPath.includes('/src/assets/i18n/') ||
       normalizedPath.includes('/src/assets/locales/'))) {
    return 'i18n';
  }
  // Vue/React/Angular 特定的 i18n 路径
  if ((projectType === 'vue' || projectType === 'react' || projectType === 'angular') &&
      (normalizedPath.includes('/src/locales/') || normalizedPath.includes('/src/i18n/') ||
       normalizedPath.includes('/src/lang/'))) {
    return 'i18n';
  }

  // 根据项目类型推断
  if (projectType === 'flutter') {
    // Flutter 项目
    if (normalizedPath.includes('/lib/views/') || normalizedPath.includes('/lib/view/') ||
        normalizedPath.includes('/lib/pages/') || normalizedPath.includes('/lib/page/') ||
        fileName.endsWith('_page.dart') || fileName.endsWith('_view.dart') ||
        fileName.includes('screen.dart')) {
      return 'view';
    }

    if (normalizedPath.includes('/lib/controller/') || normalizedPath.includes('/lib/controllers/') ||
        fileName.endsWith('_controller.dart') || fileName.includes('control.dart')) {
      return 'controller';
    }

    if (normalizedPath.includes('/lib/https/api/') || normalizedPath.includes('/lib/api/') ||
        normalizedPath.includes('/lib/services/') || normalizedPath.includes('/lib/providers/') ||
        fileName.endsWith('_api.dart') || fileName.endsWith('_provider.dart') ||
        fileName.endsWith('_service.dart')) {
      return 'api';
    }

    if (normalizedPath.includes('/lib/models/') || normalizedPath.includes('/lib/model/') ||
        fileName.endsWith('_model.dart') || fileName.endsWith('_entity.dart')) {
      return 'model';
    }

    if (normalizedPath.includes('/lib/components/') || normalizedPath.includes('/lib/component/')) {
      return 'component';
    }

  } else if (projectType === 'vue' || projectType === 'react') {
    // Vue/React 项目
    if (normalizedPath.includes('/views/') || normalizedPath.includes('/view/') ||
        normalizedPath.includes('/pages/') || normalizedPath.includes('/page/')) {
      return 'view';
    }

    if (normalizedPath.includes('/components/') || normalizedPath.includes('/component/')) {
      // Vue/React 的组件可能放在 views 下，需要进一步判断
      if (normalizedPath.includes('/views/') || normalizedPath.includes('/pages/')) {
        // 在 views/pages 下的组件通常也是页面
        return 'view';
      }
      return 'component';
    }

    if (normalizedPath.includes('/api/') || normalizedPath.includes('/services/') ||
        normalizedPath.includes('/store/') || normalizedPath.includes('/stores/')) {
      return 'api';
    }

    if (normalizedPath.includes('/controllers/') || normalizedPath.includes('/controller/')) {
      return 'controller';
    }

    if (normalizedPath.includes('/models/') || normalizedPath.includes('/model/')) {
      return 'model';
    }
  } else if (projectType === 'html') {
    // HTML 项目
    if (fileName.endsWith('.html') || fileName.endsWith('.htm')) {
      return 'view';
    }
    if (fileName.endsWith('.js')) {
      // JS 文件可能是 controller 或 service
      if (fileName.includes('controller') || fileName.includes('control')) {
        return 'controller';
      }
      if (fileName.includes('service') || fileName.includes('api')) {
        return 'api';
      }
      return 'other';
    }
  }

  return 'other';
}

// ============================================
// IPC Handlers - QA Reviewer
// ============================================

/**
 * 创建审查计划
 */
ipcMain.handle('qa-reviewer:create-plan', async (event, params) => {
  try {
    const { QAReviewer } = require('../qa-reviewer');
    const { getProjectConfig } = require('../qa-reviewer/config/default-config');

    // 获取当前项目路径
    const projectPath = global.currentProjectPath || params.projectPath;

    if (!projectPath) {
      return {
        success: false,
        error: '请先选择项目文件夹',
      };
    }

    // 获取项目配置
    const config = getProjectConfig(projectPath);

    // 创建 QA Reviewer 实例
    const reviewer = new QAReviewer({
      config,
      llm: global.llmRouter || null,
      codeScanner: codeScanner || null,
      deepAnalyzer: deepCodeAnalyzer || null,
    });

    // 初始化
    await reviewer.initialize(projectPath);

    // 创建分段计划
    const { FeatureSegmentStrategy } = require('../qa-reviewer/strategies');
    const strategy = new FeatureSegmentStrategy({
      codeGraphAdapter: reviewer.adapters.codeGraph,
      contextAdapter: reviewer.adapters.context,
      maxFilesPerSegment: params.maxFilesPerSegment || config.segmentation.maxFilesPerSegment,
    });

    console.log('[QA Reviewer] Creating plan with requirements:', params.requirementText?.substring(0, 100));

    const plan = await strategy.createPlan({
      projectPath,
      requirements: params.requirementText,
      codeMapping: null,
    });

    console.log('[QA Reviewer] Plan created:', plan.totalSegments, 'segments');

    // 如果没有分段，创建一个默认分段
    if (plan.segments.length === 0) {
      console.warn('[QA Reviewer] No segments created, creating default segment');
      const { Segment } = require('../qa-reviewer/strategies');
      const defaultSegment = new Segment({
        name: '全项目审查',
        description: '审查整个项目的代码质量',
        files: reviewer.adapters.codeGraph.codeGraph?.nodes?.map(n => n.file).filter(Boolean) || [],
        features: ['default'],
      });
      plan.addSegment(defaultSegment);
    }

    return {
      success: true,
      segments: plan.segments.map(s => s.toJSON ? s.toJSON() : s),
      summary: {
        totalSegments: plan.segments.length,
        totalFiles: plan.totalFiles || plan.segments.reduce((sum, s) => sum + (s.files?.length || 0), 0),
        estimatedDuration: `${Math.ceil(plan.segments.length / 2)} 分钟`,
      },
    };
  } catch (error) {
    console.error('[QA Reviewer] Create plan error:', error);
    return {
      success: false,
      error: error.message,
      stack: error.stack,
    };
  }
});

/**
 * 执行审查
 */
ipcMain.handle('qa-reviewer:execute', async (event, params) => {
  debugLog(`[qa-reviewer:execute] 被调用`);
  debugLog(`[qa-reviewer:execute] llmRouter: ${!!global.llmRouter}, codeScanner: ${!!codeScanner}`);
  debugLog(`[qa-reviewer:execute] currentProjectPath: ${global.currentProjectPath}`);
  debugLog(`[qa-reviewer:execute] params: ${JSON.stringify({
    hasRequirementText: !!params.requirementText,
    selectedFilesCount: params.selectedFiles?.length || 0,
    selectedModules: params.selectedModules,
    reviewEntireProject: params.reviewEntireProject,
  })}`);
  try {
    // 检查冷却时间（防止短时间内多次运行触发速率限制）
    console.log('[DIAG] 准备加载 QAReviewer 模块...');
    const { QAReviewer } = require('../qa-reviewer');
    console.log('[DIAG] QAReviewer 模块加载成功');
    try {
      QAReviewer.checkCooldown();
    } catch (cooldownError) {
      return {
        success: false,
        error: cooldownError.message,
        isCooldownError: true
      };
    }

    console.log('[QA Reviewer] 收到的参数:', JSON.stringify({
      hasRequirementText: !!params.requirementText,
      requirementTextLength: params.requirementText?.length || 0,
      hasSelectedFiles: !!params.selectedFiles,
      selectedFilesCount: params.selectedFiles?.length || 0,
      hasSelectedModules: !!params.selectedModules,
      selectedModules: params.selectedModules,
      reviewEntireProject: params.reviewEntireProject,
      hasAPIDoc: !!params.apiDocContent,
    }));
    const { getProjectConfig } = require('../qa-reviewer/config/default-config');
    const { SegmentExecutor } = require('../qa-reviewer/executor');
    const { FeatureSegmentStrategy } = require('../qa-reviewer/strategies');
    const { Segment, SegmentPlan, SegmentStrategy } = require('../qa-reviewer/strategies/segment-strategy');

    const projectPath = global.currentProjectPath || params.projectPath;

    if (!projectPath) {
      return {
        success: false,
        error: '请先选择项目文件夹',
      };
    }

    const config = getProjectConfig(projectPath);

    // 创建 QA Reviewer 实例
    const reviewer = new QAReviewer({
      config,
      llm: global.llmRouter || null,
      codeScanner: codeScanner || null,
      deepAnalyzer: deepCodeAnalyzer || null,
    });

    await reviewer.initialize(projectPath);

    let plan;

    // 如果用户手动选择了文件，按功能模块智能分组
    if (params.selectedFiles && params.selectedFiles.length > 0) {
      console.log(`[QA Reviewer] 使用用户选择的 ${params.selectedFiles.length} 个文件`);

      // 将文件转换为路径字符串
      const filePaths = params.selectedFiles.map(f => f.path || f);

      // 计算总文件大小
      const fs = require('fs');
      let totalSize = 0;
      for (const file of filePaths) {
        try {
          const content = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
          totalSize += content.length;
        } catch (e) {
          // 忽略
        }
      }

      // 判断是否使用整体审查模式
      // 保守策略：确保不会超过 AI 上下文限制
      // glm-4-flash maxTokens: 128000，约 96KB 文本（1 token ≈ 0.75 字符）
      // 保留空间给：需求描述、提示词、AI 响应等
      // 安全限制：50KB 文件内容（约 65K tokens）
      const MAX_CONTENT_SIZE = 50 * 1024; // 50KB
      const useIntegratedReview = filePaths.length <= 15 && totalSize < MAX_CONTENT_SIZE;

      if (useIntegratedReview) {
        console.log(`[QA Reviewer] 使用整体审查模式（${filePaths.length} 个文件，${Math.round(totalSize / 1024)}KB < ${MAX_CONTENT_SIZE / 1024}KB 限制）`);

        // 创建单个包含所有文件的 segment
        const { Segment } = require('../qa-reviewer/strategies/segment-strategy');
        const allInOneSegment = new Segment({
          name: `整体审查 (${filePaths.length} 个文件)`,
          description: '所有文件的整体审查，AI 可以看到完整的代码上下文和依赖关系',
          files: filePaths,
          features: params.selectedModules || ['integrated-review'],
          integrated: true, // 标记为整体审查
        });

        const segments = [allInOneSegment];

        plan = new SegmentPlan({
          name: 'Integrated Review Plan',
          projectPath,
          strategy: 'integrated',
          segments,
          totalFiles: filePaths.length,
        });
      } else {
        console.log(`[QA Reviewer] 使用分段审查模式（${filePaths.length} 个文件，${Math.round(totalSize / 1024)}KB）`);

        // 智能分组：按功能模块分组文件
        const segments = groupFilesByModule(filePaths, params);

        console.log(`[QA Reviewer] 创建了 ${segments.length} 个功能分组`);

        plan = new SegmentPlan({
          name: 'Segmented Review Plan',
          projectPath,
          strategy: SegmentStrategy.BY_FEATURE,
          segments,
          totalFiles: filePaths.length,
        });
      }
    } else if (params.selectedModules && params.selectedModules.length > 0) {
      // 根据选择的模块查找相关文件
      console.log(`[QA Reviewer] 根据选择的 ${params.selectedModules.length} 个模块查找相关文件`);
      console.log(`[QA Reviewer] 选择的模块:`, params.selectedModules);

      const codeGraph = reviewer.adapters.codeGraph?.codeGraph;
      if (!codeGraph || !codeGraph.nodes || codeGraph.nodes.length === 0) {
        return {
          success: false,
          error: '代码图为空，无法根据模块查找文件。请先扫描项目。',
        };
      }

      // 使用 CodeGraphAdapter 查找相关文件
      const relatedFiles = new Set();

      // 中英文关键词映射表
      const keywordMap = {
        '账号': ['user', 'account', 'User', 'Account'],
        '用户': ['user', 'User'],
        '列表': ['list', 'List'],
        '管理': ['manage', 'management', 'Manage', 'admin', 'Admin'],
        '编辑': ['edit', 'Edit', 'update', 'Update'],
        '删除': ['delete', 'Delete', 'remove', 'Remove'],
        '新增': ['add', 'Add', 'create', 'Create'],
        '详情': ['detail', 'Detail', 'info', 'Info'],
        '页面': ['page', 'Page', 'view', 'View', 'screen', 'Screen'],
        '登录': ['login', 'Login', 'auth', 'Auth'],
        '注册': ['register', 'Register', 'signup', 'SignUp'],
        '设置': ['setting', 'Setting', 'config', 'Config'],
        '订单': ['order', 'Order'],
        '商品': ['product', 'Product', 'item', 'Item'],
        '支付': ['payment', 'Payment', 'pay', 'Pay'],
        '购物车': ['cart', 'Cart'],
      };

      // 收集所有关键词
      const allKeywords = new Set();
      params.selectedModules.forEach(module => {
        allKeywords.add(module.toLowerCase());
        // 查找映射的关键词
        Object.entries(keywordMap).forEach(([cn, enList]) => {
          if (module.includes(cn)) {
            enList.forEach(en => allKeywords.add(en.toLowerCase()));
          }
        });
      });

      console.log(`[QA Reviewer] 搜索关键词:`, Array.from(allKeywords));

      codeGraph.nodes.forEach(node => {
        if (node.type === 'file' || node.file) {
          const filePath = node.filePath || node.file || '';
          const fileName = node.name || filePath.split(/[/\\]/).pop() || '';
          const searchText = `${fileName} ${filePath}`.toLowerCase();

          // 检查是否匹配任何关键词
          const isMatch = Array.from(allKeywords).some(kw =>
            searchText.includes(kw.toLowerCase())
          );

          if (isMatch) {
            relatedFiles.add(filePath);
          }
        }
      });

      let filePaths = Array.from(relatedFiles);
      console.log(`[QA Reviewer] 找到 ${filePaths.length} 个相关文件`);

      // 如果找不到文件，返回前50个文件作为备选
      if (filePaths.length === 0) {
        console.log(`[QA Reviewer] 未找到匹配文件，返回前50个文件`);
        const fallbackFiles = new Set();
        codeGraph.nodes.forEach(node => {
          if (node.file && fallbackFiles.size < 50) {
            fallbackFiles.add(node.file);
          }
        });
        filePaths = Array.from(fallbackFiles);
      }

      if (filePaths.length === 0) {
        // Fallback: 返回所有文件
        console.log(`[QA Reviewer] 未找到匹配文件，返回所有文件`);
        codeGraph.nodes.forEach(node => {
          if (node.file) {
            relatedFiles.add(node.file);
          }
        });
      }

      const finalFilePaths = Array.from(relatedFiles);
      console.log(`[QA Reviewer] 最终审查 ${finalFilePaths.length} 个文件`);

      // 创建分段（按内容大小和文件数量限制）
      const MAX_CONTENT_SIZE = 30 * 1024; // 30k 字符（约 30 KB）
      const MAX_FILES_PER_SEGMENT = 10; // 每个分段最多 10 个文件（优化：增加上下文完整性）
      const fs = require('fs');
      const segments = [];
      let segmentFiles = [];
      let segmentSize = 0;
      let segmentNumber = 1;

      for (const filePath of finalFilePaths) {
        try {
          const content = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';
          const fileSize = content.length;

          // 注意：大文件将由 CodeSlicer 在发送给 AI 前进行智能切片

          // 检查是否需要创建新分段（超过大小限制或文件数量限制）
          const needsNewSegment = (
            (segmentSize + fileSize > MAX_CONTENT_SIZE && segmentFiles.length > 0) ||
            (segmentFiles.length >= MAX_FILES_PER_SEGMENT)
          );

          if (needsNewSegment) {
            segments.push(new Segment({
              name: `模块审查 (${segmentNumber})`,
              description: `从模块 "${params.selectedModules.join(', ')}" 提取的代码分段`,
              files: [...segmentFiles],
              features: params.selectedModules,
            }));
            segmentNumber++;
            segmentFiles = [filePath];
            segmentSize = fileSize;
          } else {
            segmentFiles.push(filePath);
            segmentSize += fileSize;
          }
        } catch (e) {
          segmentFiles.push(filePath);
        }
      }

      if (segmentFiles.length > 0) {
        segments.push(new Segment({
          name: `模块审查 (${segmentNumber})`,
          description: `从模块 "${params.selectedModules.join(', ')}" 提取的代码分段`,
          files: segmentFiles,
          features: params.selectedModules,
        }));
      }

      console.log(`[QA Reviewer] 创建了 ${segments.length} 个模块分段，每个分段最多 ${MAX_FILES_PER_SEGMENT} 个文件、${MAX_CONTENT_SIZE / 1024}k 字符`);

      plan = new SegmentPlan({
        name: 'Module Based Review Plan',
        projectPath,
        strategy: SegmentStrategy.BY_FEATURE,
        segments,
        totalFiles: finalFilePaths.length,
      });
    } else if (params.reviewEntireProject) {
      // 审查整个项目
      console.log(`[QA Reviewer] 审查整个项目`);

      // 从代码图中获取所有文件
      const codeGraph = reviewer.adapters.codeGraph?.codeGraph;
      if (!codeGraph || !codeGraph.nodes || codeGraph.nodes.length === 0) {
        return {
          success: false,
          error: '代码图为空，无法审查整个项目。请先扫描项目。',
        };
      }

      // 收集所有唯一文件
      const allFiles = new Set();
      codeGraph.nodes.forEach(node => {
        if (node.file) {
          allFiles.add(node.file);
        }
      });

      const filePaths = Array.from(allFiles);
      console.log(`[QA Reviewer] 从代码图中获取到 ${filePaths.length} 个文件`);

      // 按内容大小和文件数量分段
      const MAX_CONTENT_SIZE = 30 * 1024; // 30k 字符（约 30 KB）
      const MAX_FILES_PER_SEGMENT = 10; // 每个分段最多 10 个文件（优化：增加上下文完整性）
      const fs = require('fs');
      const segments = [];
      let segmentFiles = [];
      let segmentSize = 0;
      let segmentNumber = 1;

      for (const filePath of filePaths) {
        try {
          const content = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';
          const fileSize = content.length;

          // 注意：大文件将由 CodeSlicer 在发送给 AI 前进行智能切片

          // 检查是否需要创建新分段（超过大小限制或文件数量限制）
          const needsNewSegment = (
            (segmentSize + fileSize > MAX_CONTENT_SIZE && segmentFiles.length > 0) ||
            (segmentFiles.length >= MAX_FILES_PER_SEGMENT)
          );

          if (needsNewSegment) {
            segments.push(new Segment({
              name: `整个项目 (${segmentNumber})`,
              description: `项目代码分段 ${segmentNumber}`,
              files: [...segmentFiles],
              features: ['entire-project'],
            }));
            segmentNumber++;
            segmentFiles = [filePath];
            segmentSize = fileSize;
          } else {
            segmentFiles.push(filePath);
            segmentSize += fileSize;
          }
        } catch (e) {
          segmentFiles.push(filePath);
        }
      }

      if (segmentFiles.length > 0) {
        segments.push(new Segment({
          name: `整个项目 (${segmentNumber})`,
          description: `项目代码分段 ${segmentNumber}`,
          files: segmentFiles,
          features: ['entire-project'],
        }));
      }

      console.log(`[QA Reviewer] 创建了 ${segments.length} 个项目分段，每个分段最多 ${MAX_FILES_PER_SEGMENT} 个文件、${MAX_CONTENT_SIZE / 1024}k 字符`);

      plan = new SegmentPlan({
        name: 'Entire Project Review Plan',
        projectPath,
        strategy: SegmentStrategy.BY_FEATURE,
        segments,
        totalFiles: filePaths.length,
      });
    } else {
      // 创建分段计划
      const strategy = new FeatureSegmentStrategy({
        codeGraphAdapter: reviewer.adapters.codeGraph,
        contextAdapter: reviewer.adapters.context,
        maxFilesPerSegment: params.maxFilesPerSegment || config.segmentation.maxFilesPerSegment,
      });

      plan = await strategy.createPlan({
        projectPath,
        requirements: params.requirementText,
      });
    }

    // 检查是否有分段需要审查
    if (!plan.segments || plan.segments.length === 0) {
      return {
        success: false,
        error: '没有找到需要审查的文件。请检查需求内容、手动选择文件，或勾选"审查整个项目"。',
      };
    }

    // 处理 API 文档
    let apiDocAdapter = null;
    if (params.apiDocContent) {
      console.log('[QA Reviewer] 加载 API 文档...');
      try {
        const APIDocAdapterModule = require('../qa-reviewer/integrations/api-doc-adapter');
        apiDocAdapter = new APIDocAdapterModule({ projectPath });
        await apiDocAdapter.loadAPIDocument(params.apiDocContent, params.apiDocFormat || 'markdown');
        console.log(`[QA Reviewer] API 文档加载完成，共 ${apiDocAdapter.getStats().totalAPIs} 个 API`);
      } catch (e) {
        console.warn('[QA Reviewer] API 文档加载失败:', e.message);
        // 继续执行，不阻塞审查
      }
    }

    // 创建执行器
    const executor = new SegmentExecutor({
      qaReviewer: reviewer,
      llm: global.llmRouter || null,
      codeScanner: codeScanner || null,
      deepAnalyzer: deepCodeAnalyzer || null,
      apiDocAdapter: apiDocAdapter,  // 注入 API Doc Adapter
      contextAdapter: reviewer.adapters.context,  // 注入 AI 上下文适配器
      codeGraphAdapter: reviewer.adapters.codeGraph,  // 注入代码图适配器
      onProgress: (progress) => {
        // 发送进度到前端
        event.sender.send('qa-reviewer:progress', progress);
      },
    });

    // 执行审查（强制串行执行，避免智谱AI速率限制）
    const results = await executor.executeBatch(plan.segments, {
      parallel: 1, // 串行执行，避免触发 429 速率限制
      context: {
        requirements: params.requirementText,
        dimensions: params.dimensions,
        uiImage: params.uiImage,  // UI 截图路径
        figmaUrl: params.figmaUrl,  // Figma 设计稿链接
        apiDocAdapter: apiDocAdapter,  // 传递给执行上下文
        projectPath: projectPath,  // 项目路径
      },
    });

    // 检查是否有致命错误（如 API 余额不足）
    const fatalResults = results.filter(r => r.fatal);
    if (fatalResults.length > 0) {
      const fatalError = fatalResults[0].error;
      console.error('[QA Reviewer] 致命错误，中止审查:', fatalError);

      return {
        success: false,
        error: fatalError,
        fatal: true,
        hint: getAPIErrorHint(fatalError)
      };
    }

    // 汇总结果
    const successfulResults = results.filter(r => r.success && r.results);

    const totalIssues = successfulResults
      .reduce((sum, r) => sum + (r.results.totalIssues || 0), 0);

    const allIssues = successfulResults
      .flatMap(r => r.results.issues || []);

    console.log(`[QA Reviewer] 汇总结果: ${totalIssues} 个问题`);
    console.log(`[QA Reviewer] 问题列表:`, JSON.stringify(allIssues, null, 2));

    // 汇总八维对齐数据（从各分段结果中合并）
    const dimensionKeys = [
      'requirementMatching', 'contractChecking', 'robustnessChecking',
      'securityChecking', 'accessibility', 'compatibility', 'performance', 'maintainability'
    ];

    const aggregatedDimensions = {};
    const dimensionScores = {};

    dimensionKeys.forEach(key => {
      const segmentsWithData = successfulResults.filter(r => r.results[key] != null);
      if (segmentsWithData.length === 0) {
        aggregatedDimensions[key] = null;

        // 优先从 segment executor 修正后的 dimensionScores 中读取
        const correctedScores = successfulResults
          .map(r => r.results.dimensionScores?.[key])
          .filter(s => s != null);
        dimensionScores[key] = correctedScores.length > 0
          ? Math.round(correctedScores.reduce((a, b) => a + b, 0) / correctedScores.length)
          : 100;
        return;
      }

      // 以第一个分段的数据为基础
      const merged = { ...segmentsWithData[0].results[key] };

      // 合并后续分段的数组数据
      segmentsWithData.slice(1).forEach(r => {
        const dim = r.results[key];
        if (dim.issues) merged.issues = [...(merged.issues || []), ...dim.issues];
        if (dim.covered) merged.covered = [...new Set([...(merged.covered || []), ...dim.covered])];
        if (dim.missing) merged.missing = [...new Set([...(merged.missing || []), ...dim.missing])];
        if (dim.details) merged.details = [...(merged.details || []), ...dim.details];
      });

      // 计算平均分：优先使用修正后的 dimensionScores，回退到维度对象的 score
      const correctedScores = segmentsWithData
        .map(r => r.results.dimensionScores?.[key])
        .filter(s => s != null);
      const rawScores = segmentsWithData.map(r => r.results[key]?.score).filter(s => s != null);
      const scores = correctedScores.length > 0 ? correctedScores : rawScores;
      merged.score = scores.length > 0
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : 100;

      aggregatedDimensions[key] = merged;
      dimensionScores[key] = merged.score;
    });

    // 计算总体评分：优先使用 segment executor 修正后的 overallScore
    const correctedOverallScores = successfulResults
      .map(r => r.results.overallScore)
      .filter(s => s != null);
    let overallScore;
    if (correctedOverallScores.length > 0) {
      overallScore = Math.round(correctedOverallScores.reduce((a, b) => a + b, 0) / correctedOverallScores.length);
    } else {
      const validScores = Object.values(dimensionScores).filter(s => s != null);
      overallScore = validScores.length > 0
        ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length)
        : 100;
    }

    // 汇总摘要和无效问题
    const summary = successfulResults.map(r => r.results.summary).filter(Boolean).join('\n');
    const invalidIssues = successfulResults.flatMap(r => r.results.invalidIssues || []);

    // 检查是否有分段出现解析失败
    const parseErrors = successfulResults
      .filter(r => r.results._parseError)
      .map(r => ({ method: r.results._parseMethod, errors: r.results._parseErrors || [] }));
    const hasParseError = parseErrors.length > 0;

    console.log(`[QA Reviewer] 维度评分:`, dimensionScores);
    console.log(`[QA Reviewer] 总体评分: ${overallScore}`);

    // 生成 TODO 注释
    const todoResult = await reviewer.generateTODOs({ issues: allIssues });
    console.log(`[QA Reviewer] TODO 生成结果:`, todoResult);

    // 保存审查记录
    await reviewer.saveReviewRecord({ totalIssues, issues: allIssues });

    return {
      success: true,
      result: {
        totalIssues,
        segmentsCompleted: successfulResults.length,
        segmentsFailed: results.filter(r => !r.success && !r.fatal).length,
        issues: allIssues,
        todoResult: todoResult,
        // 八维对齐结果
        ...aggregatedDimensions,
        dimensionScores,
        overallScore,
        summary,
        invalidIssues,
        _parseError: hasParseError || undefined,
        _parseErrors: hasParseError ? parseErrors : undefined,
      },
    };
  } catch (error) {
    console.error('[QA Reviewer] Execute error:', error);
    return {
      success: false,
      error: error.message,
      hint: getAPIErrorHint(error.message)
    };
  }
});

/**
 * 根据 API 错误信息提供提示
 */
function getAPIErrorHint(errorMsg) {
  if (errorMsg.includes('429') || errorMsg.includes('余额不足') || errorMsg.includes('充值')) {
    return 'API 余额不足。请检查智谱 AI 账户余额，或在设置中更换 API Key。';
  }
  if (errorMsg.includes('401') || errorMsg.includes('403') || errorMsg.includes('API Key')) {
    return 'API Key 无效或已过期。请在设置中更新 API Key。';
  }
  if (errorMsg.includes('timeout') || errorMsg.includes('ETIMEDOUT')) {
    return 'API 请求超时。请检查网络连接或稍后重试。';
  }
  return null;
}

/**
 * 读取需求文件
 */
ipcMain.handle('qa-reviewer:read-requirement', async (event, filePath) => {
  try {
    if (!fs.existsSync(filePath)) {
      return { success: false, error: '文件不存在' };
    }

    const ext = path.extname(filePath).toLowerCase();

    // 处理不同文件类型
    if (ext === '.pdf' || ext === '.docx') {
      // 二进制文件，需要特殊处理
      return {
        success: true,
        content: `[自动提取] 文件类型 ${ext} 的内容提取功能待实现。\n请将内容复制到文本框中。`,
      };
    }

    const content = fs.readFileSync(filePath, 'utf8');
    return { success: true, content };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

/**
 * 读取文件内容（通用）
 */
ipcMain.handle('qa-reviewer:read-file', async (event, filePath) => {
  try {
    if (!fs.existsSync(filePath)) {
      return { success: false, error: '文件不存在' };
    }

    const content = fs.readFileSync(filePath, 'utf8');
    return { success: true, content };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

/**
 * 获取 QA Reviewer 设置
 */
ipcMain.handle('qa-reviewer:get-settings', async () => {
  try {
    const projectPath = global.currentProjectPath;
    if (!projectPath) {
      return { success: true, settings: null };
    }

    const { getProjectConfig } = require('../qa-reviewer/config/default-config');
    const config = getProjectConfig(projectPath);

    return {
      success: true,
      settings: {
        segmentStrategy: config.segmentation.strategy,
        parallelSegments: config.segmentation.parallelSegments,
        maxFilesPerSegment: config.segmentation.maxFilesPerSegment,
      },
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

/**
 * 获取项目文件列表
 */
ipcMain.handle('qa-reviewer:get-project-files', async () => {
  try {
    const projectPath = global.currentProjectPath;
    if (!projectPath) {
      return { success: false, error: '请先选择项目文件夹' };
    }

    // 获取代码图中的文件列表
    const { CodeGraphAdapter } = require('../qa-reviewer/integrations');
    const adapter = new CodeGraphAdapter();

    try {
      await adapter.load(projectPath);
      const codeGraph = adapter.codeGraph;

      console.log('[QA Reviewer] getProjectFiles: 代码图节点数:', codeGraph?.nodes?.length || 0);

      if (!codeGraph || !codeGraph.nodes || codeGraph.nodes.length === 0) {
        // 如果没有代码图，直接扫描目录
        console.log('[QA Reviewer] 代码图为空，扫描目录...');
        const fs = require('fs');
        const path = require('path');

        const files = [];
        const scanDirectory = (dir, baseDir = '') => {
          const items = fs.readdirSync(dir, { withFileTypes: true });

          for (const item of items) {
            const fullPath = path.join(dir, item.name);
            const relativePath = path.join(baseDir, item.name);

            if (item.isDirectory()) {
              // 跳过 node_modules 等目录
              if (!['node_modules', '.git', 'dist', 'build', '.dart_tool', '.fvm'].includes(item.name)) {
                scanDirectory(fullPath, relativePath);
              }
            } else if (item.isFile()) {
              // 只包含代码文件
              const ext = path.extname(item.name).toLowerCase();
              if (['.dart', '.js', '.jsx', '.ts', '.tsx', '.vue'].includes(ext)) {
                files.push({
                  path: fullPath,
                  name: item.name,
                });
              }
            }
          }
        };

        scanDirectory(projectPath);

        console.log('[QA Reviewer] 目录扫描完成，找到文件:', files.length);
        return { success: true, files };
      }

      // 直接从代码图中提取文件
      const filesSet = new Set();
      codeGraph.nodes.forEach(node => {
        if (node.file) {
          filesSet.add(node.file);
        } else if (node.filePath) {
          filesSet.add(node.filePath);
        }
      });

      const files = Array.from(filesSet).map(f => ({
        path: f,
        name: f.split(/[/\\]/).pop(),
      }));

      console.log('[QA Reviewer] 从代码图提取文件:', files.length);
      return { success: true, files };

      return {
        success: true,
        files: files.map(f => ({
          path: f,
          name: f.split(/[/\\]/).pop(),
        })),
      };
    } catch (e) {
      console.warn('[QA Reviewer] 获取文件列表失败:', e.message);
      return { success: false, error: e.message };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ============================================================================
// 通用项目类型检测和文件分类工具
// ============================================================================

/**
 * 检测项目类型
 * @param {string} projectPath - 项目路径
 * @param {object} codeGraph - 代码图对象
 * @returns {string} 项目类型: 'flutter', 'react', 'vue', 'angular', 'universal'
 */
function detectProjectType(projectPath, codeGraph) {
  const fs = require('fs');
  const path = require('path');

  // 1. 检查配置文件
  const configFiles = {
    flutter: ['pubspec.yaml', 'pubspec.yml'],
    react: ['package.json'],
    vue: ['package.json'],
    angular: ['angular.json', 'angular-cli.json'],
    spring: ['pom.xml', 'build.gradle']
  };

  for (const [type, files] of Object.entries(configFiles)) {
    for (const configFile of files) {
      const configPath = path.join(projectPath, configFile);
      if (fs.existsSync(configPath)) {
        // 对于 package.json，需要进一步区分 React/Vue
        if (type === 'react' || type === 'vue') {
          try {
            const pkg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            const deps = { ...pkg.dependencies, ...pkg.devDependencies };
            if (deps.vue || deps['@vue/core']) return 'vue';
            if (deps.react || deps['@react']) return 'react';
          } catch (e) {
            // 忽略解析错误
          }
        }
        return type;
      }
    }
  }

  // 2. 根据代码图中的文件扩展名推断
  if (codeGraph && codeGraph.nodes) {
    const extensions = new Map();
    for (const node of codeGraph.nodes) {
      const filePath = node.file || node.filePath || '';
      if (filePath) {
        const ext = path.extname(filePath).toLowerCase();
        extensions.set(ext, (extensions.get(ext) || 0) + 1);
      }
    }

    const totalFiles = codeGraph.nodes.length;
    const dartRatio = (extensions.get('.dart') || 0) / totalFiles;
    const jsRatio = ((extensions.get('.js') || 0) + (extensions.get('.jsx') || 0)) / totalFiles;
    const tsRatio = ((extensions.get('.ts') || 0) + (extensions.get('.tsx') || 0)) / totalFiles;
    const vueRatio = (extensions.get('.vue') || 0) / totalFiles;

    if (dartRatio > 0.3) return 'flutter';
    if (vueRatio > 0.1) return 'vue';
    if (jsRatio > 0.1 || tsRatio > 0.1) return 'react'; // React 和 TypeScript 项目
  }

  return 'universal';
}

/**
 * 推断文件类型（跨框架通用）
 * @param {string} filePath - 文件路径
 * @param {string} projectType - 项目类型
 * @returns {string} 文件类型: 'view', 'controller', 'model', 'service', 'component', 'route', 'config', 'test', 'other'
 */
function inferFileType(filePath, projectType) {
  const path = require('path');
  const normalizedPath = filePath.replace(/\\/g, '/').toLowerCase();
  const fileName = path.basename(filePath).toLowerCase();
  const ext = path.extname(filePath).toLowerCase();

  // 测试文件（所有项目通用）
  if (fileName.includes('.test.') || fileName.includes('.spec.') ||
      fileName.includes('_test.') || fileName.endsWith('_test.dart') ||
      normalizedPath.includes('/test/') || normalizedPath.includes('/tests/') ||
      normalizedPath.includes('__tests__')) {
    return 'test';
  }

  // 生成的文件（所有项目通用）
  if (fileName.includes('.generated.') || fileName.includes('.g.') ||
      fileName.includes('.freezed.') || fileName.includes('.mock.')) {
    return 'generated';
  }

  // 路由文件（跨框架）
  if (fileName.includes('route') || fileName.includes('router') ||
      normalizedPath.includes('/route/') || normalizedPath.includes('/router/')) {
    return 'route';
  }

  // 配置文件（跨框架）
  if (fileName.includes('config') || fileName.includes('setting') ||
      ext === '.json' || ext === '.yaml' || ext === '.yml' ||
      ext === '.env' || fileName.startsWith('.')) {
    return 'config';
  }

  // 多语言文件（跨框架）
  if (fileName.includes('i18n') || fileName.includes('locale') ||
      fileName.includes('lang') || fileName.includes('translation') ||
      normalizedPath.includes('/locale/') || normalizedPath.includes('/i18n/')) {
    return 'i18n';
  }

  // 根据项目类型进行具体推断
  if (projectType === 'flutter') {
    // Flutter 项目
    if (normalizedPath.includes('/pages/') || normalizedPath.includes('/views/') ||
        normalizedPath.includes('/screens/')) {
      return 'view';
    }
    if (normalizedPath.includes('/controllers/') || normalizedPath.includes('/viewmodels/')) {
      return 'controller';
    }
    if (normalizedPath.includes('/models/') || normalizedPath.includes('/entities/')) {
      return 'model';
    }
    if (normalizedPath.includes('/services/') || normalizedPath.includes('/providers/') ||
        normalizedPath.includes('/repositories/')) {
      return 'service';
    }
    if (normalizedPath.includes('/widgets/') || normalizedPath.includes('/components/')) {
      return 'component';
    }
    if (normalizedPath.includes('/bindings/') || normalizedPath.includes('/di/')) {
      return 'binding';
    }
    if (normalizedPath.includes('/api/') || normalizedPath.includes('/datasources/')) {
      return 'api';
    }
  } else if (projectType === 'react' || projectType === 'vue' || projectType === 'angular') {
    // React/Vue/Angular 项目
    if (normalizedPath.includes('/pages/') || normalizedPath.includes('/views/') ||
        ext === '.vue' || normalizedPath.includes('/screens/')) {
      return 'view';
    }
    if (normalizedPath.includes('/hooks/') || normalizedPath.includes('/composables/')) {
      return 'hook';
    }
    if (normalizedPath.includes('/stores/') || normalizedPath.includes('/state/') ||
        normalizedPath.includes('/redux/') || normalizedPath.includes('/context/')) {
      return 'state';
    }
    if (normalizedPath.includes('/services/') || normalizedPath.includes('/api/')) {
      return 'service';
    }
    if (normalizedPath.includes('/components/') || normalizedPath.includes('/ui/')) {
      return 'component';
    }
    if (normalizedPath.includes('/models/') || normalizedPath.includes('/types/') ||
        normalizedPath.includes('/interfaces/')) {
      return 'model';
    }
    if (normalizedPath.includes('/utils/') || normalizedPath.includes('/helpers/')) {
      return 'util';
    }
  }

  // 通用推断（基于文件名模式）
  const viewPatterns = [/page/, /view/, /screen/, /form/];
  const controllerPatterns = [/controller/, /controller$/, /handler/, /presenter/];
  const modelPatterns = [/model$/, /entity/, /dto$/, /vo$/, /type/, /interface/];
  const servicePatterns = [/service$/, /api$/, /client$/, /provider$/, /repository$/];
  const componentPatterns = [/component/, /widget/, /control/, /element/];

  const baseName = path.basename(filePath, ext);

  for (const pattern of viewPatterns) {
    if (pattern.test(baseName)) return 'view';
  }
  for (const pattern of controllerPatterns) {
    if (pattern.test(baseName)) return 'controller';
  }
  for (const pattern of modelPatterns) {
    if (pattern.test(baseName)) return 'model';
  }
  for (const pattern of servicePatterns) {
    if (pattern.test(baseName)) return 'service';
  }
  for (const pattern of componentPatterns) {
    if (pattern.test(baseName)) return 'component';
  }

  return 'other';
}

/**
 * 解析文件的 import 语句（跨语言）
 * @param {string} filePath - 文件路径
 * @param {string} content - 文件内容
 * @returns {Array<string>} 导入的文件路径列表
 */
function parseImports(filePath, content) {
  const path = require('path');
  const ext = path.extname(filePath).toLowerCase();
  const imports = [];

  // Dart import
  if (ext === '.dart') {
    // import 'package:xxx/xxx.dart';
    // import 'xxx/xxx.dart';
    // import '../../xxx/xxx.dart';
    const dartPatterns = [
      /import\s+['"]([^'"]+)['"]/g,
      /export\s+['"]([^'"]+)['"]/g,
    ];
    for (const pattern of dartPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        imports.push(match[1]);
      }
    }
  }
  // JavaScript/TypeScript/JSX/TSX
  else if (['.js', '.jsx', '.ts', '.tsx', '.mjs'].includes(ext)) {
    // import xxx from 'xxx';
    // import { xxx } from 'xxx';
    // import('xxx');
    // require('xxx');
    const jsPatterns = [
      /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+)?['"]([^'"]+)['"]/g,
      /import\(['"]([^'"]+)['"]\)/g,
      /require\(['"]([^'"]+)['"]\)/g,
    ];
    for (const pattern of jsPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        imports.push(match[1]);
      }
    }
  }
  // Vue 单文件组件
  else if (ext === '.vue') {
    // <script> 标签内的 import
    const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
    if (scriptMatch) {
      const scriptContent = scriptMatch[1];
      const jsPatterns = [
        /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+)?['"]([^'"]+)['"]/g,
      ];
      for (const pattern of jsPatterns) {
        let match;
        while ((match = pattern.exec(scriptContent)) !== null) {
          imports.push(match[1]);
        }
      }
    }
  }
  // HTML
  else if (ext === '.html') {
    // <script src="xxx"></script>
    // <link href="xxx">
    const htmlPatterns = [
      /<script[^>]+src=['"]([^'"]+)['"]/gi,
      /<link[^>]+href=['"]([^'"]+)['"]/gi,
    ];
    for (const pattern of htmlPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        imports.push(match[1]);
      }
    }
  }

  return imports;
}

/**
 * 通过页面名称匹配文件（通用版本，支持多项目类型）
 */
ipcMain.handle('qa-reviewer:search-files-by-page-name', async (event, params) => {
  console.log('[DIAG] search-files-by-page-name 被调用, params:', JSON.stringify(params));
  try {
    const { projectPath, pageName } = params;
    if (!projectPath) {
      console.log('[DIAG] projectPath 为空');
      return { success: false, error: '请先选择项目文件夹' };
    }
    if (!pageName || !pageName.trim()) {
      console.log('[DIAG] pageName 为空');
      return { success: false, error: '请输入页面名称' };
    }

    console.log('[QA Reviewer] 通用文件匹配 - 页面名称:', pageName);

    const fs = require('fs');
    const path = require('path');
    console.log('[DIAG] 准备加载 CodeGraphAdapter...');
    const { CodeGraphAdapter } = require('../qa-reviewer/integrations');
    console.log('[DIAG] CodeGraphAdapter 加载成功');

    // ============================================
    // 1. 优先使用 TEST_CONTEXT 查找（最准确）
    // ============================================
    let matchedFiles = new Map(); // filePath -> fileType
    let foundInTestContext = false;

    try {
      const folderName = path.basename(projectPath);
      const dataDir = path.join(DATA_DIR, 'AI_Scan_file');
      const projectDir = path.join(dataDir, folderName);
      const testContextPath = path.join(projectDir, `${folderName}_TEST_CONTEXT.json`);

      if (fs.existsSync(testContextPath)) {
        const testContext = JSON.parse(fs.readFileSync(testContextPath, 'utf8'));
        console.log('[QA Reviewer] TEST_CONTEXT 已加载，功能点数:', testContext.features?.length || 0);

        // 搜索匹配的功能点
        const searchKeywords = [pageName.toLowerCase().trim()];

        // 添加常见映射
        const commonMappings = {
          '账号': 'account',
          '账号管理': 'account',
          '用户': 'user',
          '用户管理': 'user',
          '登录': 'login',
          '登入': 'login',
          '注册': 'register',
          '註冊': 'register',
          '首页': 'home',
          '首頁': 'home',
          '设置': 'setting',
          '設定': 'setting',
          '订单': 'order',
          '商品': 'product',
        };

        for (const [cn, en] of Object.entries(commonMappings)) {
          if (pageName.includes(cn)) {
            searchKeywords.push(en);
          }
        }

        console.log('[QA Reviewer] 搜索 TEST_CONTEXT 关键词:', searchKeywords);

        // 查找匹配的功能点
        for (const feature of testContext.features || []) {
          const featureNameLower = (feature.name || '').toLowerCase();

          // 检查功能点名称是否匹配
          const isMatch = searchKeywords.some(kw =>
            featureNameLower.includes(kw) || kw.includes(featureNameLower)
          );

          if (isMatch) {
            console.log('[QA Reviewer] 找到匹配功能点:', feature.name);
            foundInTestContext = true;

            // 从 pages 提取文件
            if (feature.pages && Array.isArray(feature.pages)) {
              feature.pages.forEach(page => {
                if (page.file && fs.existsSync(page.file)) {
                  const fileType = inferFileType(page.file, 'flutter');
                  matchedFiles.set(page.file, fileType);
                  console.log(`  - Page: ${page.file} (${fileType})`);
                }
              });
            }

            // 从 controllers 提取文件
            if (feature.controllers && Array.isArray(feature.controllers)) {
              feature.controllers.forEach(ctrl => {
                if (ctrl.file && fs.existsSync(ctrl.file)) {
                  const fileType = inferFileType(ctrl.file, 'flutter');
                  matchedFiles.set(ctrl.file, fileType);
                  console.log(`  - Controller: ${ctrl.file} (${fileType})`);
                }
              });
            }

            // 只需要第一个匹配的功能点
            break;
          }
        }

        if (foundInTestContext) {
          console.log('[QA Reviewer] 从 TEST_CONTEXT 找到文件数:', matchedFiles.size);
        }
      } else {
        console.log('[QA Reviewer] TEST_CONTEXT 文件不存在:', testContextPath);
      }
    } catch (e) {
      console.warn('[QA Reviewer] 加载 TEST_CONTEXT 失败:', e.message);
    }

    // ============================================
    // 2. 加载代码图（用于后续依赖分析）
    // ============================================
    const adapter = new CodeGraphAdapter();
    let codeGraph = null;
    let projectType = 'flutter'; // 默认值

    try {
      await adapter.load(projectPath);
      codeGraph = adapter.codeGraph;
      console.log('[QA Reviewer] 代码图已加载，节点数:', codeGraph?.nodes?.length || 0);
      console.log('[QA Reviewer] 代码图边数:', codeGraph?.edges?.length || 0);

      if (codeGraph && codeGraph.nodes && codeGraph.nodes.length > 0) {
        projectType = detectProjectType(projectPath, codeGraph);
        console.log('[QA Reviewer] 检测到项目类型:', projectType);
      }
    } catch (e) {
      console.warn('[QA Reviewer] 加载代码图失败:', e.message);
    }

    // ============================================
    // 3. 如果 TEST_CONTEXT 没找到，使用代码图关键词查找
    // ============================================
    if (matchedFiles.size === 0) {
      if (!codeGraph || !codeGraph.nodes || codeGraph.nodes.length === 0) {
        return { success: false, error: '无法加载代码图，请先扫描项目' };
      }

      console.log('[QA Reviewer] TEST_CONTEXT 未找到，使用代码图查找...');

      // 规范化页面名称（生成多种可能的搜索关键词）
      const searchKeywords = new Set();

      // 原始名称
      searchKeywords.add(pageName.toLowerCase().trim());

      // 下划线/连字符分隔
      searchKeywords.add(pageName.toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_'));
      searchKeywords.add(pageName.toLowerCase().replace(/\s+/g, '-').replace(/_/g, '-'));

      // 驼峰转换
      const camelCase = pageName.toLowerCase().replace(/[^a-z0-9]+(.)/g, (_, c) => c.toUpperCase());
      searchKeywords.add(camelCase.charAt(0).toLowerCase() + camelCase.slice(1));

      // 帕斯卡转换
      searchKeywords.add(camelCase.charAt(0).toUpperCase() + camelCase.slice(1));

      // 常见中英文映射（可扩展）
      const commonMappings = {
        '账号': 'account',
        '账号管理': 'account',
        '用户': 'user',
        '用户管理': 'user',
        '用戶': 'user',
        '用戶管理': 'user',
        '帳號': 'account',
        '帳號管理': 'account',
        '登录': 'login',
        '登入': 'login',
        '注册': 'register',
        '註冊': 'register',
        '首页': 'home',
        '首頁': 'home',
        '设置': 'settings',
        '設置': 'settings',
      };

      for (const [cn, en] of Object.entries(commonMappings)) {
        if (pageName.includes(cn)) {
          searchKeywords.add(en);
          searchKeywords.add(en.toLowerCase());
        }
      }

      console.log('[QA Reviewer] 搜索关键词:', Array.from(searchKeywords));

      // 3.1 根据关键词和文件类型匹配核心文件
      for (const node of codeGraph.nodes) {
        const filePath = node.file || node.filePath || '';
        if (!filePath) continue;

        const fileType = inferFileType(filePath, projectType);
        const fileName = path.basename(filePath).toLowerCase();
        const normalizedPath = filePath.replace(/\\/g, '/').toLowerCase();

        // 检查文件名或路径是否匹配任何关键词
        let isMatch = false;
        for (const keyword of searchKeywords) {
          if (fileName.includes(keyword) ||
              normalizedPath.includes(`/${keyword}/`) ||
              normalizedPath.includes(`\\${keyword}\\`) ||
              fileName === `${keyword}.dart` ||
              fileName === `${keyword}.js` ||
              fileName === `${keyword}.jsx` ||
              fileName === `${keyword}.ts` ||
              fileName === `${keyword}.tsx` ||
              fileName === `${keyword}.vue` ||
              fileName.startsWith(`${keyword}.`) ||
              fileName.startsWith(`${keyword}_`) ||
              fileName.startsWith(`${keyword}-`)) {
            isMatch = true;
            break;
          }
        }

        if (isMatch) {
          matchedFiles.set(filePath, fileType);
        }
      }

      console.log('[QA Reviewer] 直接匹配的核心文件数:', matchedFiles.size);

      // 3.2 如果没有直接匹配，尝试模糊匹配
      if (matchedFiles.size === 0) {
        console.log('[QA Reviewer] 直接匹配失败，尝试模糊匹配...');
        for (const node of codeGraph.nodes) {
          const filePath = node.file || node.filePath || '';
          if (!filePath) continue;

          const fileName = path.basename(filePath).toLowerCase();
          const fileType = inferFileType(filePath, projectType);

          // 对于 view/controller/component 类型，放宽匹配条件
          if (['view', 'controller', 'component'].includes(fileType)) {
            // 检查文件名是否包含任何关键词的一部分（至少3个字符）
            for (const keyword of searchKeywords) {
              if (keyword.length >= 3) {
                const partialKeyword = keyword.substring(0, Math.min(6, keyword.length));
                if (fileName.includes(partialKeyword)) {
                  matchedFiles.set(filePath, fileType);
                  break;
                }
              }
            }
          }
        }
      }
    }

    // 5. 基于 import 语句递归查找依赖（从 view/controller 开始）
    // 优化：只找到实际使用的文件，而不是代码图中的所有可能相关文件
    const importBasedDependencies = new Set();

    // 获取起始文件：view 和 controller
    const startFiles = Array.from(matchedFiles.entries())
      .filter(([_, type]) => ['view', 'controller'].includes(type))
      .map(([filePath, _]) => filePath);

    console.log('[QA Reviewer] 从以下文件开始递归查找 import:', startFiles.length);

    // 构建文件名到路径的映射（用于 import 路径匹配）
    const fileNameToPath = new Map();
    for (const node of codeGraph.nodes) {
      const filePath = node.file || node.filePath || '';
      if (!filePath) continue;
      const fileName = path.basename(filePath).toLowerCase();
      const baseName = path.basename(filePath, path.extname(filePath)).toLowerCase();
      fileNameToPath.set(fileName, filePath);
      fileNameToPath.set(baseName, filePath);
    }

    // 递归查找 import 依赖（最多 2 层）
    const maxDepth = 2;
    const visited = new Set();
    const queue = startFiles.map(f => ({ file: f, depth: 0 }));

    while (queue.length > 0) {
      const { file: currentFile, depth } = queue.shift();
      if (depth >= maxDepth || visited.has(currentFile)) {
        continue;
      }
      visited.add(currentFile);

      // 跳过不存在的文件
      if (!fs.existsSync(currentFile)) continue;

      try {
        // 解析 import 语句
        const content = fs.readFileSync(currentFile, 'utf8');
        const imports = parseImports(currentFile, content);

        for (const importPath of imports) {
          // 跳过相对路径和 dart 核心库导入
          if (importPath.startsWith('.') || importPath.startsWith('dart:')) {
            continue;
          }

          // 处理 package: 格式的 import (Dart)
          // 例如: package:my_app/models/user_model.dart -> user_model.dart
          let searchName = importPath;
          if (importPath.startsWith('package:')) {
            // 移除 'package:' 前缀，提取最后一部分
            const pathWithoutPackage = importPath.substring(8); // 'package:'.length
            const parts = pathWithoutPackage.split('/');
            searchName = parts[parts.length - 1]; // 最后一部分是文件名
          } else {
            // 非 package: 格式，直接提取最后一部分
            const importParts = importPath.replace(/\\/g, '/').split('/');
            searchName = importParts[importParts.length - 1];
          }

          const lastPart = searchName.toLowerCase();
          const baseName = path.basename(lastPart, path.extname(lastPart)).toLowerCase();

          // 在映射表中查找对应的文件
          let targetFile = fileNameToPath.get(lastPart) || fileNameToPath.get(baseName);

          if (targetFile && !matchedFiles.has(targetFile) && !visited.has(targetFile)) {
            const fileType = inferFileType(targetFile, projectType);

            // 只添加核心文件类型
            if (['model', 'service', 'api', 'binding', 'provider', 'component'].includes(fileType)) {
              importBasedDependencies.add(targetFile);
              matchedFiles.set(targetFile, fileType);
              console.log(`[QA Reviewer] 通过 import 找到 [${fileType}]:`, path.basename(targetFile), `from ${importPath}`);

              // 继续递归查找（对于 model/service/binding 类型）
              if (['model', 'service', 'binding'].includes(fileType)) {
                queue.push({ file: targetFile, depth: depth + 1 });
              }
            }
          }
        }
      } catch (e) {
        // 忽略读取错误
      }
    }

    console.log('[QA Reviewer] 基于 import 的依赖分析完成，找到文件数:', importBasedDependencies.size);

    // 7. 过滤和清理结果
    const finalFiles = [];
    const fileTypes = new Map();

    for (const [filePath, fileType] of matchedFiles) {
      // 排除测试文件
      if (fileType === 'test' || fileType === 'generated') continue;

      // 排除不存在的文件
      if (!fs.existsSync(filePath)) continue;

      // 排除 node_modules 和依赖目录
      const normalizedPath = filePath.replace(/\\/g, '/');
      if (normalizedPath.includes('/node_modules/') ||
          normalizedPath.includes('\\node_modules\\') ||
          normalizedPath.includes('/.dart_tool/') ||
          normalizedPath.includes('/build/') ||
          normalizedPath.includes('/dist/') ||
          normalizedPath.includes('/.git/')) {
        continue;
      }

      finalFiles.push(filePath);
      fileTypes.set(filePath, fileType);
    }

    // 9. 按文件类型分组输出
    const resultFiles = finalFiles.map(f => ({
      path: f,
      name: path.basename(f),
      type: fileTypes.get(f) || 'other',
    }));

    // 按类型分组统计
    const byType = {
      view: [],
      controller: [],
      model: [],
      service: [],
      component: [],
      api: [],
      binding: [],
      route: [],
      state: [],
      config: [],
      i18n: [],
      other: []
    };

    for (const f of resultFiles) {
      const type = f.type || 'other';
      if (byType[type]) {
        byType[type].push(f.name);
      } else {
        byType.other.push(f.name);
      }
    }

    console.log('[QA Reviewer] 最终匹配文件数:', resultFiles.length);
    console.log('[QA Reviewer] 文件分类统计:');
    for (const [type, files] of Object.entries(byType)) {
      if (files.length > 0) {
        console.log(`  ${type}:`, files.length);
      }
    }

    console.log('[DIAG] search-files-by-page-name 返回成功, 文件数:', resultFiles.length);
    return { success: true, files: resultFiles, projectType };
  } catch (error) {
    console.error('[DIAG] search-files-by-page-name 失败:', error.message, error.stack);
    return { success: false, error: error.message };
  }
});

// 取消 QA Reviewer 的 LLM 调用
ipcMain.handle('qa-reviewer:cancel', async (event) => {
  try {
    console.log('[QA Reviewer] 收到取消请求，停止后续 LLM 调用');

    // 设置全局取消标志
    global.qaReviewerCancelled = true;

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

/**
 * ==================== LLM 配置管理 ====================
 * 混合配置方案：优先使用 Claude Code CLI 配置，回退到应用内部配置
 */

const LLM_CONFIG_PATH = path.join(DATA_DIR, 'llm-config.json');

/**
 * 获取默认 LLM 配置
 */
function getDefaultLLMConfig() {
  return {
    provider: 'zhipu',
    providers: {
      'claude-code': {
        enabled: false,
        model: 'glm-5'
      },
      'zhipu': {
        enabled: true,
        apiKey: '',
        baseURL: 'https://newapi.cdskysoft.cn/v1',
        model: 'glm-5.1'
      },
      'openai': {
        enabled: false,
        apiKey: '',
        baseURL: 'https://api.openai.com/v1',
        model: 'gpt-4'
      }
    },
    fallbackToInternal: true
  };
}

/**
 * 检查 Claude Code CLI 配置是否可用
 */
ipcMain.handle('check-claude-config', async () => {
  try {
    const { getClaudeConfig } = require('../agent/llm/claude-config');
    const claudeConfig = getClaudeConfig();

    const isValid = claudeConfig.isValid();
    const summary = claudeConfig.getSummary();

    console.log('[LLM Config] Claude Code 配置检查:', { isValid, summary });

    return {
      success: true,
      available: isValid,
      config: summary
    };
  } catch (error) {
    console.error('[LLM Config] Claude Code 配置检查失败:', error);
    return {
      success: false,
      available: false,
      error: error.message
    };
  }
});

/**
 * 获取 LLM 配置
 */
ipcMain.handle('get-llm-config', async () => {
  try {
    // 先检查 Claude Code CLI 配置
    const { getClaudeConfig } = require('../agent/llm/claude-config');
    const claudeConfig = getClaudeConfig();

    let internalConfig = getDefaultLLMConfig();

    // 读取应用内部配置
    if (fs.existsSync(LLM_CONFIG_PATH)) {
      try {
        const content = fs.readFileSync(LLM_CONFIG_PATH, 'utf8');
        internalConfig = { ...internalConfig, ...JSON.parse(content) };
      } catch (readError) {
        console.warn('[LLM Config] 读取内部配置失败，使用默认配置:', readError.message);
      }
    }

    return {
      success: true,
      config: internalConfig,
      claudeCodeAvailable: claudeConfig.isValid()
    };
  } catch (error) {
    console.error('[LLM Config] 获取配置失败:', error);
    return {
      success: false,
      error: error.message,
      config: getDefaultLLMConfig(),
      claudeCodeAvailable: false
    };
  }
});

/**
 * 保存 LLM 配置
 */
ipcMain.handle('save-llm-config', async (event, config) => {
  try {
    console.log('[LLM Config] 保存配置:', config);

    // 确保 DATA_DIR 存在
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    // 保存配置到文件
    fs.writeFileSync(LLM_CONFIG_PATH, JSON.stringify(config, null, 2));

    // 直接更新全局 LLM Router 以应用新配置
    if (global.llmRouter) {
      console.log('[LLM Config] 更新全局 LLM Router...');
      const activeProvider = config.providers?.[config.provider];
      const userModel = activeProvider?.model || config.providers?.['zhipu']?.model || 'glm-5.1';
      const userApiKey = activeProvider?.apiKey;
      const userEndpoint = activeProvider?.baseURL;

      const routerUpdates = {
        defaultModel: userModel,
        highQualityModel: userModel,
        fastModel: userModel,
      };
      if (userApiKey) {
        routerUpdates.projectApiKey = userApiKey;
        process.env.ANTHROPIC_AUTH_TOKEN = userApiKey;
      }
      if (userEndpoint) {
        routerUpdates.projectApiEndpoint = userEndpoint;
        process.env.ANTHROPIC_BASE_URL = userEndpoint;
      }
      global.llmRouter.updateConfig(routerUpdates);
      console.log('[LLM Config] LLM Router 已更新，模型:', userModel);
    }

    // 同步模型到 QA Reviewer
    try {
      const { QAModelConfig } = require('../qa-reviewer/config/model-config');
      QAModelConfig.setUserModel(userModel);
    } catch (e) {
      console.warn('[LLM Config] 无法更新 QA Reviewer 模型:', e.message);
    }

    return { success: true };
  } catch (error) {
    console.error('[LLM Config] 保存配置失败:', error);
    return { success: false, error: error.message };
  }
});

/**
 * 测试 LLM 连接
 */
ipcMain.handle('test-llm-connection', async (event, config) => {
  try {
    console.log('[LLM Config] 测试连接:', {
      provider: config.provider,
      model: config.model,
      hasApiKey: !!(config.apiKey),
      endpoint: config.apiEndpoint
    });

    if (!config.apiKey) {
      return { success: false, error: '请先填写 API Key' };
    }
    if (!config.apiEndpoint) {
      return { success: false, error: '请先填写 API 端点' };
    }

    // 去除末尾斜杠
    let baseURL = config.apiEndpoint.replace(/\/+$/, '');

    // 根据 provider 类型选择 API 格式
    const anthropicProviders = ['claude-code', 'deepseek', 'anthropic'];
    const useAnthropicFormat = anthropicProviders.includes(config.provider);

    if (useAnthropicFormat) {
      // Anthropic 格式
      const url = `${baseURL}/v1/messages`;
      const body = {
        model: config.model || 'claude-sonnet-4-6',
        max_tokens: 20,
        messages: [
          { role: 'user', content: '请回复"连接成功"' }
        ]
      };

      console.log('[LLM Config] 使用 Anthropic 格式测试:', url);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[LLM Config] Anthropic 连接测试失败:', response.status, errorText);
        return {
          success: false,
          error: parseErrorDetails(response.status, errorText, config.provider)
        };
      }

      const data = await response.json();
      const content = data.content?.[0]?.text || '';
      console.log('[LLM Config] Anthropic 连接测试成功:', content.substring(0, 50));

      return {
        success: true,
        message: `连接成功 (${config.model})`,
        response: content.substring(0, 100),
        usage: data.usage
      };
    } else {
      // OpenAI 格式
      const url = `${baseURL}/chat/completions`;
      const body = {
        model: config.model || 'glm-5.1',
        messages: [
          { role: 'user', content: '请回复"连接成功"' }
        ],
        temperature: 0.1,
        max_tokens: 20
      };

      console.log('[LLM Config] 使用 OpenAI 格式测试:', url);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[LLM Config] OpenAI 连接测试失败:', response.status, errorText);
        return {
          success: false,
          error: parseErrorDetails(response.status, errorText, config.provider)
        };
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      console.log('[LLM Config] OpenAI 连接测试成功:', content.substring(0, 50));

      return {
        success: true,
        message: `连接成功 (${config.model})`,
        response: content.substring(0, 100),
        usage: data.usage
      };
    }
  } catch (error) {
    console.error('[LLM Config] 测试连接异常:', error.message);
    return {
      success: false,
      error: error.name === 'AbortError' ? '连接超时（30秒）' : `网络错误: ${error.message}`
    };
  }
});

/**
 * 解析错误详情，返回用户友好的错误信息
 */
function parseErrorDetails(status, errorText, provider) {
  try {
    const errorData = JSON.parse(errorText);

    // 提取错误类型和消息
    const errorCode = errorData.code || errorData.error?.code || '';
    const errorMessage = errorData.message || errorData.error?.message || '';

    // 根据错误代码返回具体信息
    if (errorCode === 'insufficient_balance' || errorMessage.includes('余额不足') || errorMessage.includes('insufficient')) {
      return `余额不足: 请充值后再使用 (${provider})`;
    }

    if (errorCode === 'model_not_allowed' || errorMessage.includes('不支持模型') || errorMessage.includes('model_not_allowed')) {
      return `模型不支持: 当前模型 "${errorData.model || 'unknown'}" 不在您的账户可用范围内`;
    }

    if (errorCode === 'authentication_error' || errorMessage.includes('invalid') || errorMessage.includes('Authentication')) {
      return `认证失败: API Key 无效或已过期`;
    }

    if (errorCode === 'rate_limit_exceeded' || status === 429) {
      return `请求频繁: API 调用频率超限，请稍后再试`;
    }

    if (status === 401) {
      return `认证失败: API Key 无效或未授权`;
    }

    if (status === 402) {
      return `余额不足: 请充值后再使用`;
    }

    if (status === 403) {
      return `权限不足: 无法访问该模型或 API`;
    }

    if (status === 404) {
      return `端点错误: API 端点或模型不存在`;
    }

    if (status === 500 || status === 502 || status === 503) {
      return `服务异常: API 服务暂时不可用，请稍后再试`;
    }

    // 返回原始错误信息（截取）
    return `错误 (${status}): ${errorMessage.substring(0, 100) || errorText.substring(0, 100)}`;
  } catch (e) {
    // 无法解析 JSON，返回原始文本
    return `HTTP ${status}: ${errorText.substring(0, 100)}`;
  }
}

// Export for testing
module.exports = { createWindow, initializeModules };
