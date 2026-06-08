/**
 * Electron Preload Script
 *
 * Exposes safe IPC channels to renderer process
 */

const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // File operations
  addFileFolder: () => ipcRenderer.invoke('add-file-folder'),
  selectFile: (options) => ipcRenderer.invoke('select-file', options),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  findExcelFiles: (folderPath) => ipcRenderer.invoke('find-excel-files', folderPath),
  getFileContent: (filePath) => ipcRenderer.invoke('get-file-content', filePath),
  saveFileContent: (filePath, content) => ipcRenderer.invoke('save-file-content', filePath, content),

  // Scan operations
  scanCode: (target) => ipcRenderer.invoke('scan-code', target),
  scanCodeWithAST: (target, options) => ipcRenderer.invoke('scan-code-with-ast', target, options),
  scanProjectInfo: (projectPath) => ipcRenderer.invoke('scan-project-info', projectPath),
  loadSavedScanResults: (projectPath) => ipcRenderer.invoke('load-saved-scan-results', projectPath),

  // Partial scan operations
  scanFiles: (filePaths, options) => ipcRenderer.invoke('scan-files', filePaths, options),
  scanFolders: (folderPaths, options) => ipcRenderer.invoke('scan-folders', folderPaths, options),
  getFileDependencies: (projectPath, filePaths, direction) => ipcRenderer.invoke('get-file-dependencies', projectPath, filePaths, direction),

  // Download scan results
  downloadScanResult: (filePath, fileName) => ipcRenderer.invoke('download-scan-result', filePath, fileName),
  downloadAIContext: (projectPath) => ipcRenderer.invoke('download-ai-context', projectPath),
  downloadCodeGraph: (projectPath) => ipcRenderer.invoke('download-code-graph', projectPath),
  downloadTestContext: (projectPath) => ipcRenderer.invoke('download-test-context', projectPath),
  getFileStructure: (directoryPath, options) => ipcRenderer.invoke('get-file-structure', directoryPath, options),
  analyzeDependencies: (directoryPath, options) => ipcRenderer.invoke('analyze-dependencies', directoryPath, options),
  getCodeGraph: (projectPath) => ipcRenderer.invoke('get-code-graph', projectPath),
  getProjectOverview: (projectPath) => ipcRenderer.invoke('get-project-overview', projectPath),
  searchByFunction: (functionName) => ipcRenderer.invoke('search-by-function', functionName),
  searchByClass: (className) => ipcRenderer.invoke('search-by-class', className),
  findApiEndpoints: (projectPath) => ipcRenderer.invoke('find-api-endpoints', projectPath),
  exportCodeGraphDot: (projectPath, outputPath) => ipcRenderer.invoke('export-code-graph-dot', projectPath, outputPath),
  getProjectStructure: (projectPath) => ipcRenderer.invoke('get-project-structure', projectPath),

  // Function and class analysis
  getFunctionAnalysis: (projectPath) => ipcRenderer.invoke('get-function-analysis', projectPath),
  getClassAnalysis: (projectPath) => ipcRenderer.invoke('get-class-analysis', projectPath),
  getFunctionCallGraph: (projectPath, functionName) => ipcRenderer.invoke('get-function-call-graph', projectPath, functionName),

  // Call graph analysis
  getBusinessLogicSummary: (projectPath) => ipcRenderer.invoke('get-business-logic-summary', projectPath),
  getFunctionContext: (projectPath, functionName) => ipcRenderer.invoke('get-function-context', projectPath, functionName),
  getCallChains: (projectPath) => ipcRenderer.invoke('get-call-chains', projectPath),
  exportCallGraphDot: (projectPath, outputPath) => ipcRenderer.invoke('export-call-graph-dot', projectPath, outputPath),

  // File dependency analysis
  analyzeFileDependencies: (projectPath, options) => ipcRenderer.invoke('analyze-file-dependencies', projectPath, options),
  getFileDependencyTree: (projectPath, rootFile) => ipcRenderer.invoke('get-file-dependency-tree', projectPath, rootFile),
  exportFileDependencyDot: (projectPath, outputPath, options) => ipcRenderer.invoke('export-file-dependency-dot', projectPath, outputPath, options),

  // Flutter UI analysis
  analyzeFlutterUI: (projectPath) => ipcRenderer.invoke('analyze-flutter-ui', projectPath),
  analyzeFlutterFileUI: (filePath) => ipcRenderer.invoke('analyze-flutter-file-ui', filePath),

  // TODO operations
  addTodo: (filePath, line, issue) => ipcRenderer.invoke('add-todo', filePath, line, issue),
  fixTodo: (fixRequest) => ipcRenderer.invoke('fix-todo', fixRequest),
  removeTodo: (filePath, line) => ipcRenderer.invoke('remove-todo', filePath, line),
  previewFix: (filePath, issue) => ipcRenderer.invoke('preview-fix', filePath, issue),
  canAutoFix: (issue) => ipcRenderer.invoke('can-autofix', issue),

  // AI fix operations
  aiFixInit: (config) => ipcRenderer.invoke('ai-fix-init', config),
  aiFixSingle: (params) => ipcRenderer.invoke('ai-fix-single', params),
  aiFixMultiple: (params) => ipcRenderer.invoke('ai-fix-multiple', params),
  aiFixApply: (fixId, accepted) => ipcRenderer.invoke('ai-fix-apply', fixId, accepted),
  aiFixConfig: () => ipcRenderer.invoke('ai-fix-config'),
  aiFixUpdateConfig: (updates) => ipcRenderer.invoke('ai-fix-update-config', updates),
  aiFixGetActive: () => ipcRenderer.invoke('ai-fix-get-active'),
  aiFixClear: () => ipcRenderer.invoke('ai-fix-clear'),
  aiFixTodo: (issue, config) => ipcRenderer.invoke('ai-fix-todo', issue, config),

  // Project operations
  detectProject: (projectPath) => ipcRenderer.invoke('detect-project', projectPath),
  getProjectScripts: (projectPath) => ipcRenderer.invoke('get-project-scripts', projectPath),
  runProject: (projectPath, options) => ipcRenderer.invoke('run-project', projectPath, options),
  stopProject: (projectId) => ipcRenderer.invoke('stop-project', projectId),
  stopAllProjects: () => ipcRenderer.invoke('stop-all-projects'),
  getProjectStatus: (projectId) => ipcRenderer.invoke('get-project-status', projectId),
  getRunningProjects: () => ipcRenderer.invoke('get-running-projects'),

  // Project event listeners
  onProjectOutput: (callback) => ipcRenderer.on('project-output', (event, data) => callback(data)),
  onProjectExit: (callback) => ipcRenderer.on('project-exit', (event, data) => callback(data)),
  removeProjectListeners: () => {
    ipcRenderer.removeAllListeners('project-output');
    ipcRenderer.removeAllListeners('project-exit');
  },

  // Test operations
  importExcelTest: (filePath) => ipcRenderer.invoke('import-excel-test', filePath),
  generateTestCase: (excelPath, options) => ipcRenderer.invoke('generate-test-case', excelPath, options),
  runTest: (testPath, options) => ipcRenderer.invoke('run-test', testPath, options),
  stopTest: (testId) => ipcRenderer.invoke('stop-test', testId),
  getTestStatus: (testId) => ipcRenderer.invoke('get-test-status', testId),
  getRunningTests: () => ipcRenderer.invoke('get-running-tests'),
  generateTestReport: (testResult, format, outputPath) => ipcRenderer.invoke('generate-test-report', testResult, format, outputPath),
  generateAllTestReports: (testResult) => ipcRenderer.invoke('generate-all-test-reports', testResult),
  downloadTestReport: (testResult, format) => ipcRenderer.invoke('download-test-report', testResult, format),
  openTestReport: (reportPath) => ipcRenderer.invoke('open-test-report', reportPath),
  createTestTemplate: (outputPath) => ipcRenderer.invoke('create-test-template', outputPath),
  checkPlaywright: (projectPath) => ipcRenderer.invoke('check-playwright', projectPath),
  installPlaywright: (projectPath) => ipcRenderer.invoke('install-playwright', projectPath),
  executeVisualTests: (testCases, options) => ipcRenderer.invoke('execute-visual-tests', testCases, options),
  generateTestCasesExcel: (testPlan) => ipcRenderer.invoke('generate-test-cases-excel', testPlan),

  // Playwright direct test operations
  runPlaywrightTest: (url, options) => ipcRenderer.invoke('run-playwright-test', url, options),
  stopPlaywrightTest: (testId) => ipcRenderer.invoke('stop-playwright-test', testId),
  getPlaywrightTestStatus: (testId) => ipcRenderer.invoke('get-playwright-test-status', testId),
  getRunningPlaywrightTests: () => ipcRenderer.invoke('get-running-playwright-tests'),
  installPlaywright: (projectPath) => ipcRenderer.invoke('install-playwright', projectPath),

  // Advanced Excel test operations
  parseAdvancedExcel: (filePath) => ipcRenderer.invoke('parse-advanced-excel', filePath),
  generateAdvancedTest: (excelPath, options) => ipcRenderer.invoke('generate-advanced-test', excelPath, options),
  generateAdvancedExcelTemplate: (outputPath) => ipcRenderer.invoke('generate-advanced-excel-template', outputPath),
  getValidationTypesInfo: () => ipcRenderer.invoke('get-validation-types-info'),
  getActionTypesInfo: () => ipcRenderer.invoke('get-action-types-info'),

  // Figma integration operations
  setFigmaToken: (token) => ipcRenderer.invoke('set-figma-token', token),
  extractFigmaSpecs: (figmaUrl, nodeId) => ipcRenderer.invoke('extract-figma-specs', figmaUrl, nodeId),
  generateExcelFromFigma: (figmaUrl, outputPath, options) => ipcRenderer.invoke('generate-excel-from-figma', figmaUrl, outputPath, options),
  downloadFigmaScreenshots: (fileKey, nodeIds, outputDir, options) => ipcRenderer.invoke('download-figma-screenshots', fileKey, nodeIds, outputDir, options),
  getFigmaFile: (fileKey) => ipcRenderer.invoke('get-figma-file', fileKey),
  getFigmaNode: (fileKey, nodeId) => ipcRenderer.invoke('get-figma-node', fileKey, nodeId),

  // AI test generation operations
  generateTestsFromRequirement: (requirementText, options) => ipcRenderer.invoke('generate-tests-from-requirement', requirementText, options),
  generateTestsFromFigma: (figmaSpecs, options) => ipcRenderer.invoke('generate-tests-from-figma', figmaSpecs, options),
  generateTestsFromDescription: (description, options) => ipcRenderer.invoke('generate-tests-from-description', description, options),
  generateSelector: (elementDescription, context) => ipcRenderer.invoke('generate-selector', elementDescription, context),

  // AI Test Agent operations
  executeBDTest: (excelPath, options) => ipcRenderer.invoke('execute-bd-test', excelPath, options),
  generateAITests: (requirement, options) => ipcRenderer.invoke('generate-ai-tests', requirement, options),
  executeGeneratedTests: (generatedTests, options) => ipcRenderer.invoke('execute-generated-tests', generatedTests, options),
  generateTestReport: (testResult, format, outputPath) => ipcRenderer.invoke('generate-test-report', testResult, format, outputPath),

  // AI Agent Test operations
  analyzeAndGenerateTests: (input) => ipcRenderer.invoke('analyze-and-generate-tests', input),
  executeAgentTests: (testPlan, options) => ipcRenderer.invoke('execute-agent-tests', testPlan, options),
  importBDDTestCases: (filePath) => ipcRenderer.invoke('import-bdd-test-cases', filePath),
  extractCodeContext: (filePaths, options) => ipcRenderer.invoke('extract-code-context', filePaths, options),
  generateTestsFromCode: (params) => ipcRenderer.invoke('generate-tests-from-code', params),

  // Test Case Storage operations
  saveTestCases: (projectPath, testPlan, metadata, merge) => ipcRenderer.invoke('save-test-cases', projectPath, testPlan, metadata, merge),
  loadTestCases: (projectPath) => ipcRenderer.invoke('load-test-cases', projectPath),
  loadSavedTestCases: (projectPath) => ipcRenderer.invoke('load-saved-test-cases', projectPath),
  listSavedTestCases: () => ipcRenderer.invoke('list-saved-test-cases'),
  hasSavedTestCases: (projectPath) => ipcRenderer.invoke('has-saved-test-cases', projectPath),
  deleteTestCases: (projectPath) => ipcRenderer.invoke('delete-test-cases', projectPath),
  updateTestCase: (projectPath, testCaseId, updatedData) => ipcRenderer.invoke('update-test-case', projectPath, testCaseId, updatedData),
  deleteTestCase: (projectPath, testCaseId) => ipcRenderer.invoke('delete-test-case', projectPath, testCaseId),

  // Visual regression testing operations
  compareImages: (image1Path, image2Path, options) => ipcRenderer.invoke('compare-images', image1Path, image2Path, options),
  batchCompareScreenshots: (screenshotPairs, options) => ipcRenderer.invoke('batch-compare-screenshots', screenshotPairs, options),
  generateVisualReport: (comparisonResults, outputPath) => ipcRenderer.invoke('generate-visual-report', comparisonResults, outputPath),
  setVisualThreshold: (threshold) => ipcRenderer.invoke('set-visual-threshold', threshold),

  // Advanced report generation operations
  generateAdvancedHTMLReport: (testResult, outputPath) => ipcRenderer.invoke('generate-advanced-html-report', testResult, outputPath),
  generateTrendReport: (historyResults, outputPath) => ipcRenderer.invoke('generate-trend-report', historyResults, outputPath),
  generateAdvancedAllReports: (testResult, outputDir, options) => ipcRenderer.invoke('generate-advanced-all-reports', testResult, outputDir, options),

  // Test event listeners
  onTestOutput: (callback) => ipcRenderer.on('test-output', (event, data) => callback(data)),
  onTestResult: (callback) => ipcRenderer.on('test-result', (event, data) => callback(data)),
  removeTestListeners: () => {
    ipcRenderer.removeAllListeners('test-output');
    ipcRenderer.removeAllListeners('test-result');
  },

  // Dependency operations
  loadDependencies: (targetPath) => ipcRenderer.invoke('load-dependencies', targetPath),
  getDependencyTree: (projectPath) => ipcRenderer.invoke('get-dependency-tree', projectPath),
  getDependencyStats: (projectPath) => ipcRenderer.invoke('get-dependency-stats', projectPath),
  validateDependencies: (projectPath, feature) => ipcRenderer.invoke('validate-dependencies', projectPath, feature),
  getFileContext: (filePath, projectPath) => ipcRenderer.invoke('get-file-context', filePath, projectPath),
  clearDependencyCache: () => ipcRenderer.invoke('clear-dependency-cache'),

  // Agent operations
  agentProcess: (request) => ipcRenderer.invoke('agent-process', request),
  agentGetStatus: () => ipcRenderer.invoke('agent-get-status'),
  agentAbort: () => ipcRenderer.invoke('agent-abort'),
  agentGetHistory: (limit) => ipcRenderer.invoke('agent-get-history', limit),
  agentApproveTask: (taskId) => ipcRenderer.invoke('agent-approve-task', taskId),
  agentDenyTask: (taskId) => ipcRenderer.invoke('agent-deny-task', taskId),
  agentGetStats: () => ipcRenderer.invoke('agent-get-stats'),
  agentConfigUpdate: (config) => ipcRenderer.invoke('agent-config-update', config),
  agentClearHistory: () => ipcRenderer.invoke('agent-clear-history'),
  agentCodeReview: (request) => ipcRenderer.invoke('agent-code-review', request),

  // Rules configuration
  getRulesConfig: () => ipcRenderer.invoke('get-rules-config'),
  updateRulesConfig: (rules) => ipcRenderer.invoke('update-rules-config', rules),
  parseYamlRules: (yamlContent) => ipcRenderer.invoke('parse-yaml-rules', yamlContent),

  // Agent event listeners
  onAgentEvent: (callback) => ipcRenderer.on('agent-event', (event, data) => callback(data)),
  removeAgentListeners: () => {
    ipcRenderer.removeAllListeners('agent-event');
  },

  // Scan progress listeners
  onScanProgress: (callback) => ipcRenderer.on('scan-progress', (event, data) => callback(data)),
  onScanProgressClose: (callback) => ipcRenderer.on('scan-progress-close', (event, data) => callback(data)),
  removeScanProgressListeners: () => {
    ipcRenderer.removeAllListeners('scan-progress');
    ipcRenderer.removeAllListeners('scan-progress-close');
  },

  // AI Smart Test log listener
  onAISmartTestLog: (callback) => ipcRenderer.on('ai-smart-test-log', (event, data) => callback(data)),
  removeAISmartTestLogListener: () => {
    ipcRenderer.removeAllListeners('ai-smart-test-log');
  },

  // Test case update event listener
  onTestCasesUpdated: (callback) => ipcRenderer.on('test-cases-updated', (event) => callback()),
  removeTestCasesUpdatedListener: () => {
    ipcRenderer.removeAllListeners('test-cases-updated');
  },

  // QA Reviewer
  createReviewPlan: (params) => ipcRenderer.invoke('qa-reviewer:create-plan', params),
  executeQAReview: (params) => ipcRenderer.invoke('qa-reviewer:execute', params),
  cancelQAReview: () => ipcRenderer.invoke('qa-reviewer:cancel'),
  readRequirementFile: (filePath) => ipcRenderer.invoke('qa-reviewer:read-requirement', filePath),
  readFile: (filePath) => ipcRenderer.invoke('qa-reviewer:read-file', filePath),
  getQAReviewerSettings: () => ipcRenderer.invoke('qa-reviewer:get-settings'),
  getProjectFiles: () => ipcRenderer.invoke('qa-reviewer:get-project-files'),
  searchFilesByPageName: (params) => ipcRenderer.invoke('qa-reviewer:search-files-by-page-name', params),
  onQAReviewProgress: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('qa-reviewer:progress', handler);
    // 返回清理函数
    return () => ipcRenderer.removeListener('qa-reviewer:progress', handler);
  },
  removeQAReviewProgressListener: () => {
    ipcRenderer.removeAllListeners('qa-reviewer:progress');
  },

  // LLM Configuration
  checkClaudeConfig: () => ipcRenderer.invoke('check-claude-config'),
  getLLMConfig: () => ipcRenderer.invoke('get-llm-config'),
  saveLLMConfig: (config) => ipcRenderer.invoke('save-llm-config', config),
  testLLMConnection: (config) => ipcRenderer.invoke('test-llm-connection', config),

  // Console logging
  log: (message) => ipcRenderer.send('console-log', message),
  getConsoleLogs: () => ipcRenderer.invoke('get-console-logs'),

  // Visual comparison (pixel + AI)
  visualCompare: (expectedPath, actualPath, options) => ipcRenderer.invoke('visual-compare', expectedPath, actualPath, options),
  visualBatchCompare: (pairs, options) => ipcRenderer.invoke('visual-batch-compare', pairs, options),
  visualGenerateReport: (results, outputPath) => ipcRenderer.invoke('visual-generate-report', results, outputPath),
});

// Console log interceptor - send all console logs to main process
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

console.log = function(...args) {
  originalConsoleLog.apply(console, args);
  const message = args.map(arg => {
    if (typeof arg === 'object') {
      try {
        return JSON.stringify(arg);
      } catch (e) {
        return String(arg);
      }
    }
    return String(arg);
  }).join(' ');
  ipcRenderer.send('console-log', { level: 'log', message, timestamp: Date.now() });
};

console.error = function(...args) {
  originalConsoleError.apply(console, args);
  const message = args.map(arg => String(arg)).join(' ');
  ipcRenderer.send('console-log', { level: 'error', message, timestamp: Date.now() });
};

console.warn = function(...args) {
  originalConsoleWarn.apply(console, args);
  const message = args.map(arg => String(arg)).join(' ');
  ipcRenderer.send('console-log', { level: 'warn', message, timestamp: Date.now() });
};
