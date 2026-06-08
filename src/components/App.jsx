/**
 * Main Application Component
 *
 * Root React component that renders the entire UI
 *
 * Layout:
 * - Toolbar (function buttons)
 * - Main Content Area:
 *   - Left: File Tree
 *   - Center: Code Editor (Monaco)
 *   - Right: Panel (Problems, TODO, Reports, AI Fix Preview, Dependencies, Tests)
 * - Bottom: Output Panel / Runner Panel / Test Panel
 */

import React, { useState, useEffect, useRef } from 'react';
import Toolbar from './Toolbar';
import FileTree from './FileTree';
import CodeEditor from './Editor';
import RightPanel from './RightPanel';
import OutputPanel from './OutputPanel';
import TestPanel from './TestPanel';
import AiFixModal from './AiFixModal';
import AiConfigModal from './AiConfigModal';
import TestModal from './TestModal';
import AdvancedTestModal from './AdvancedTestModal';
import ScanModal from './ScanModal';
import AITestSelectorModal from './AITestSelectorModal';
import AITestModal from './AITestModal';
import AIAgentTestModal from './AIAgentTestModal';
import AISmartTestModal from './AISmartTestModal';
import Toast from './Toast';
import AgentChat from './AgentChat';
import AgentPanel from './AgentPanel';
import ReviewModeSelector from './ReviewModeSelector';
import ScanProgressModal from './ScanProgressModal';
import ScanRangeSelector from './ScanRangeSelector';
import SettingsPanel from './SettingsPanel';
import QAReviewerModal from './QAReviewerModal';
import CodeReviewRangeSelector from './CodeReviewRangeSelector';

// Access Electron API from preload script
const electronAPI = window.electronAPI;

function App() {
  // State for file system
  const [files, setFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);

  // State for editor
  const [editorContent, setEditorContent] = useState('');
  const [editorLanguage, setEditorLanguage] = useState('typescript');
  const [highlightLine, setHighlightLine] = useState(null); // 当前高亮的行号

  // State for scan results
  const [scanResults, setScanResults] = useState(null);
  const [problems, setProblems] = useState([]);
  const [todos, setTodos] = useState([]);

  // State for right panel
  const [activeTab, setActiveTab] = useState('problems');

  // State for output
  const [output, setOutput] = useState({
    type: 'info',
    message: 'Ready. Add files or folders to start scanning.',
  });

  // State for dependencies
  const [dependencies, setDependencies] = useState([]);

  // State for fix options
  const [fixOptions, setFixOptions] = useState({
    addTodo: true,
    autoFix: true,
  });

  // State for AI Fix
  const [aiFixModalOpen, setAiFixModalOpen] = useState(false);
  const [aiFixRangeModalOpen, setAiFixRangeModalOpen] = useState(false);
  const [aiConfigModalOpen, setAiConfigModalOpen] = useState(false);
  const [currentFixData, setCurrentFixData] = useState(null);
  const [aiConfig, setAiConfig] = useState(null);
  const [showDiffInEditor, setShowDiffInEditor] = useState(false);
  const [selectedIssueForFix, setSelectedIssueForFix] = useState(null);

  // State for scan options
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [scanRangeSelectorOpen, setScanRangeSelectorOpen] = useState(false);

  // State for code review mode
  const [reviewModeSelectorOpen, setReviewModeSelectorOpen] = useState(false);
  const [reviewMode, setReviewMode] = useState('traditional'); // 'traditional' | 'agent'
  const [codeReviewRangeSelectorOpen, setCodeReviewRangeSelectorOpen] = useState(false);
  const [filteredProblemsForReview, setFilteredProblemsForReview] = useState(null); // 筛选后的问题列表

  // State for scan progress
  const [scanProgressOpen, setScanProgressOpen] = useState(false);
  const [scanProgress, setScanProgress] = useState({ scanned: 0, total: 0, current: '' });
  // Use ref to track latest state value for closures
  const scanProgressOpenRef = useRef(scanProgressOpen);

  // Keep ref in sync with state
  useEffect(() => {
    scanProgressOpenRef.current = scanProgressOpen;
    console.log('[App] scanProgressOpen 状态变化为:', scanProgressOpen);
  }, [scanProgressOpen]);

  // State for settings panel
  const [settingsOpen, setSettingsOpen] = useState(false);

  // State for testing
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [advancedTestModalOpen, setAdvancedTestModalOpen] = useState(false);
  const [aiTestSelectorOpen, setAiTestSelectorOpen] = useState(false);
  const [aiTestModalOpen, setAiTestModalOpen] = useState(false);
  const [aiSmartTestModalOpen, setAiSmartTestModalOpen] = useState(false);
  const [currentTestDocument, setCurrentTestDocument] = useState(null);
  const [isCreatingNewTestCase, setIsCreatingNewTestCase] = useState(false);
  const [aiAgentTestModalOpen, setAiAgentTestModalOpen] = useState(false);
  const [lastScanResult, setLastScanResult] = useState(null);
  const [currentProjectUrl, setCurrentProjectUrl] = useState(null);
  const [currentProjectPath, setCurrentProjectPath] = useState(null);
  const [showTestPanel, setShowTestPanel] = useState(false);
  const [testCases, setTestCases] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [testPath, setTestPath] = useState(null);
  const [runningTests, setRunningTests] = useState([]);
  const [testOutputs, setTestOutputs] = useState(new Map());

  // State for QA Reviewer
  const [qaReviewModalOpen, setQaReviewModalOpen] = useState(false);
  const [qaReviewProgress, setQaReviewProgress] = useState(null);

  // Toolbar active button state
  const [activeButton, setActiveButton] = useState(null);

  // Function to close test panel and reset test state
  const handleCloseTestPanel = () => {
    setShowTestPanel(false);
    // Don't clear testResult immediately, so user can still see results
    // Optional: clear test state after a delay
    setTimeout(() => {
      if (!showTestPanel) {
        setTestResult(null);
        setTestCases(null);
      }
    }, 5000);
  };

  // State for dependencies
  const [dependencyTree, setDependencyTree] = useState(null);
  const [dependencyStats, setDependencyStats] = useState(null);

  // State for Agent
  const [agentMode, setAgentMode] = useState(false);
  const [agentChatOpen, setAgentChatOpen] = useState(false);
  const [agentPanelOpen, setAgentPanelOpen] = useState(false);
  const [agentStatus, setAgentStatus] = useState(null);
  const [agentMessages, setAgentMessages] = useState([]);
  const [agentHistory, setAgentHistory] = useState([]);
  const [currentPlan, setCurrentPlan] = useState(null);

  // State for Toast notifications
  const [toast, setToast] = useState(null);

  // Load configs on mount
  useEffect(() => {
    loadAIConfig();
    setupTestListeners();
    setupAgentListeners();
    setupScanProgressListeners();
    setupQAReviewerProgressListeners();
    loadRunningTests();
    loadAgentHistory();

    // 监听 AI Agent 测试事件
    window._handleOpenAIAgentTest = () => {
      // AI 测试会自动启动项目，不需要预先获取运行项目
      setCurrentProjectUrl(null);
      setAiAgentTestModalOpen(true);
    };

    window.addEventListener('open-ai-agent-test', window._handleOpenAIAgentTest);

    // 监听测试用例更新事件（使用 IPC 监听器）
    // 延迟注册，确保 electronAPI 已注入
    const setupTestCasesListener = () => {
      const api = window.electronAPI;
      if (api && api.onTestCasesUpdated) {
        console.log('[App] 注册测试用例更新监听器');
        api.onTestCasesUpdated(async () => {
          console.log('[App] 收到测试用例更新事件，刷新列表');
          if (api.listSavedTestCases) {
            const result = await api.listSavedTestCases();
            if (result.success) {
              setTestCases(result.testCases);
              console.log('[App] 测试用例列表已刷新，共', result.testCases.length, '个文档');
            }
          }
        });
      } else {
        console.log('[App] electronAPI 未就绪，100ms 后重试');
        setTimeout(setupTestCasesListener, 100);
      }
    };
    setupTestCasesListener();

    // 检测运行环境
    if (!electronAPI) {
      setOutput({
        type: 'info',
        message: '💡 网页版模式：部分功能仅在桌面应用中可用。下载桌面应用以获得完整功能体验。'
      });
    }

    return () => {
      const api = window.electronAPI;
      if (api) {
        api.removeProjectListeners();
        api.removeScanProgressListeners();
        api.removeTestListeners();
        api.removeAgentListeners();
        api.removeTestCasesUpdatedListener();
      }
      window.removeEventListener('open-ai-agent-test', window._handleOpenAIAgentTest);
    };
  }, []);

  // 加载保存的文件夹
  useEffect(() => {
    const savedFiles = localStorage.getItem('dev-quality-inspector-files');
    if (savedFiles) {
      try {
        const parsedFiles = JSON.parse(savedFiles);
        // 验证文件是否仍然存在（仅检查路径是否有效）
        setFiles(parsedFiles);
        if (parsedFiles.length > 0) {
          setCurrentProjectPath(parsedFiles[0].path);
          setOutput({ type: 'success', message: `已加载 ${parsedFiles.length} 个保存的文件夹。` });

          // 尝试从服务器加载保存的扫描结果
          loadSavedScanResultsForFiles(parsedFiles);
        }
      } catch (e) {
        console.error('Failed to load saved files:', e);
      }
    }
  }, []);

  // 从服务器加载保存的扫描结果
  const loadSavedScanResultsForFiles = async (filesToCheck) => {
    if (!electronAPI) return;

    for (const file of filesToCheck) {
      if (file.type === 'folder') {
        try {
          const result = await electronAPI.loadSavedScanResults(file.path);
          if (result.success && result.hasSavedResults) {
            console.log('[App] Found saved scan results for:', file.name);

            // 构造扫描结果对象
            const savedScanResults = {
              totalFiles: result.summary.astStats?.filesParsed || 0,
              filesWithIssues: result.summary.issuesCount || 0,
              totalIssues: result.summary.issuesCount || 0,
              issuesBySeverity: result.summary.issuesBySeverity || {},
              codeGraph: result.codeGraph,
              savedPaths: result.savedPaths,
              summary: result.summary, // 添加完整的 summary，包含 projectPath
            };

            setScanResults(savedScanResults);
            setOutput({
              type: 'success',
              message: `已加载 ${file.name} 的扫描结果（${result.summary.scanDate ? new Date(result.summary.scanDate).toLocaleString() : ''}）`
            });

            // 如果有 AI Context 文件，提示用户
            if (result.hasAIContext) {
              console.log('[App] AI Context file available:', result.savedPaths?.aiContext);
            }
            break; // 只加载第一个找到的扫描结果
          }
        } catch (e) {
          console.warn('[App] Failed to load saved scan results for', file.name, e.message);
        }
      }
    }
  };

  // 当文件列表变化时保存到 localStorage
  useEffect(() => {
    if (files.length > 0) {
      localStorage.setItem('dev-quality-inspector-files', JSON.stringify(files));
    }
  }, [files]);

  // 加载保存的扫描结果
  useEffect(() => {
    const savedScanResults = localStorage.getItem('dev-quality-inspector-scan-results');
    if (savedScanResults) {
      try {
        const parsedResults = JSON.parse(savedScanResults);
        setScanResults(parsedResults);
        setProblems(parsedResults.issues || []);
        // 恢复 todos
        const MAX_TODOS = 1000;
        const issuesForTodos = parsedResults.issues || [];
        const limitedIssues = issuesForTodos.slice(0, MAX_TODOS);
        const generatedTodos = limitedIssues.map((issue, index) => ({
          id: `todo-${index}`,
          file: issue.filePath,
          line: issue.line,
          rule: issue.rule,
          code: issue.code,
          suggestion: issue.suggestion,
          severity: issue.severity,
          completed: false,
        }));
        setTodos(generatedTodos);
        console.log('[App] Loaded saved scan results');
      } catch (e) {
        console.error('Failed to load saved scan results:', e);
      }
    }
  }, []);

  // 当扫描结果变化时保存到 localStorage
  useEffect(() => {
    if (scanResults && scanResults.issues) {
      // 只保存必要的扫描结果数据，避免 localStorage 过大
      const saveData = {
        totalFiles: scanResults.totalFiles,
        filesWithIssues: scanResults.filesWithIssues,
        totalIssues: scanResults.totalIssues,
        issuesBySeverity: scanResults.issuesBySeverity,
        issues: scanResults.issues,
        astStats: scanResults.astStats,
        // codeGraph 通常很大，不保存
      };
      try {
        localStorage.setItem('dev-quality-inspector-scan-results', JSON.stringify(saveData));
      } catch (e) {
        console.warn('Failed to save scan results (possibly too large):', e);
      }
    }
  }, [scanResults]);

  /**
   * Setup Agent event listeners
   */
  const setupAgentListeners = () => {
    if (!electronAPI) return;

    // Listen for Agent events
    electronAPI.onAgentEvent((event) => {
      console.log('Agent event:', event.type, event);

      switch (event.type) {
        case 'start':
          setAgentStatus({ isProcessing: true, message: 'Starting...' });
          break;
        case 'plan':
          setCurrentPlan(event.plan);
          setAgentMessages(prev => [...prev, {
            role: 'assistant',
            content: `I've created a plan with ${event.plan.tasks.length} steps: ${event.plan.goal}`,
            timestamp: new Date().toISOString(),
            plan: event.plan
          }]);
          break;
        case 'progress':
          setAgentStatus(prev => ({ ...prev, ...event }));
          break;
        case 'taskStart':
          setAgentMessages(prev => [...prev, {
            role: 'assistant',
            content: `Executing: ${event.task.description}`,
            timestamp: new Date().toISOString()
          }]);
          break;
        case 'taskEnd':
          if (event.result?.success) {
            setAgentMessages(prev => [...prev, {
              role: 'assistant',
              content: `Completed: ${event.task.description}`,
              timestamp: new Date().toISOString()
            }]);
          }
          break;
        case 'complete':
          setAgentStatus({ isProcessing: false, message: 'Completed' });
          setAgentMessages(prev => [...prev, {
            role: 'assistant',
            content: `Task completed! ${event.result?.summary || 'Done'}`,
            timestamp: new Date().toISOString(),
            result: event.result
          }]);
          loadAgentHistory();
          break;
        case 'error':
          setAgentStatus({ isProcessing: false, message: 'Error' });
          setAgentMessages(prev => [...prev, {
            role: 'assistant',
            content: `Error: ${event.error}`,
            timestamp: new Date().toISOString(),
            isError: true
          }]);
          break;
        case 'approval':
          setAgentMessages(prev => [...prev, {
            role: 'assistant',
            content: `⚠️ Requires approval: ${event.task.description}`,
            timestamp: new Date().toISOString(),
            needsApproval: true,
            taskId: event.taskId,
            task: event.task
          }]);
          break;
      }
    });
  };

  /**
   * Setup scan progress listeners
   */
  const setupScanProgressListeners = () => {
    if (!electronAPI) return;

    // 先移除旧的监听器，避免重复添加
    electronAPI.removeScanProgressListeners();

    electronAPI.onScanProgress((progress) => {
      console.log('扫描进度:', progress);
      setScanProgress(progress);
    });

    // 监听自动关闭信号
    electronAPI.onScanProgressClose(() => {
      console.log('[App] 收到关闭进度弹窗信号, scanProgressOpenRef.current:', scanProgressOpenRef.current);
      setScanProgressOpen(false);
      console.log('[App] 已调用 setScanProgressOpen(false)');
    });
  };

  /**
   * Setup QA Reviewer progress listeners
   */
  const setupQAReviewerProgressListeners = () => {
    if (!electronAPI) return;

    electronAPI.onQAReviewProgress((progress) => {
      console.log('QA Reviewer 进度:', progress);
      setQaReviewProgress(progress);
    });
  };

  /**
   * Load Agent execution history
   */
  const loadAgentHistory = async () => {
    try {
      if (electronAPI) {
        const result = await electronAPI.agentGetHistory(10);
        if (result.success) {
          setAgentHistory(result.history || []);
        }
      }
    } catch (error) {
      console.error('Error loading agent history:', error);
    }
  };

  /**
   * Load AI configuration
   */
  const loadAIConfig = async () => {
    try {
      if (electronAPI) {
        const result = await electronAPI.aiFixConfig();
        if (result.success) {
          setAiConfig(result.config);
        }
      }
    } catch (error) {
      console.error('Error loading AI config:', error);
    }
  };

  /**
   * Setup test event listeners
   */
  const setupTestListeners = () => {
    if (!electronAPI) return;

    electronAPI.onTestOutput(({ testId, output: outputData }) => {
      setTestOutputs(prev => {
        const newMap = new Map(prev);
        const existing = newMap.get(testId) || [];
        newMap.set(testId, [...existing, outputData]);
        return newMap;
      });
    });

    electronAPI.onTestResult(({ testId, result }) => {
      setTestResult(result);
      setShowTestPanel(true);
      setOutput({
        type: result.failed > 0 ? 'warning' : 'success',
        message: `Test completed: ${result.passed} passed, ${result.failed} failed`,
      });
      loadRunningTests();
    });
  };

  /**
   * Load running tests
   */
  const loadRunningTests = async () => {
    try {
      if (electronAPI) {
        const result = await electronAPI.getRunningTests();
        if (result.success) {
          setRunningTests(result.tests || []);
        }
      }
    } catch (error) {
      console.error('Error loading running tests:', error);
    }
  };

  /**
   * Handle toolbar button actions
   */
  const handleAction = async (actionId) => {
    console.log('Action clicked:', actionId);
    setActiveButton(actionId);

    switch (actionId) {
      case 'addFile':
        await handleAddFileFolder();
        break;
      case 'scanCode':
        await handleScanCode();
        break;
      case 'addTodo':
        await handleAddTodo();
        break;
      case 'aiFixTodo':
        await handleAiFixTodo();
        break;
      case 'settings':
        setSettingsOpen(true);
        break;
      case 'aiTest':
        await handleAITest();
        break;
      case 'test':
        setTestModalOpen(true);
        break;
      case 'advancedTest':
        setAdvancedTestModalOpen(true);
        break;
      case 'agentChat':
        setAgentChatOpen(true);
        break;
      case 'agentPanel':
        // Agent Panel 现在是 QA Reviewer
        setQaReviewModalOpen(true);
        break;
      case 'agentMode':
        setAgentMode(!agentMode);
        setOutput({ type: 'info', message: `Agent mode ${!agentMode ? 'enabled' : 'disabled'}` });
        break;
      default:
        setOutput({ type: 'info', message: `Action "${actionId}" is not yet implemented.` });
    }
  };

  /**
   * Handle AI Test - Show saved test cases in right panel
   */
  const handleAITest = async () => {
    try {
      // Check if files exist
      if (!selectedFile && files.length === 0) {
        setOutput({ type: 'warning', message: '⚠️ 请先添加项目文件或文件夹。' });
        return;
      }

      // Check if desktop app
      if (!electronAPI) {
        setOutput({
          type: 'warning',
          message: '⚠️ 此功能仅在桌面应用中可用。'
        });
        return;
      }

      // Get project path (first added folder/file)
      const projectPath = selectedFile ? selectedFile.path : files[0].path;
      setCurrentProjectPath(projectPath);

      // Load all saved test case documents
      if (electronAPI.listSavedTestCases) {
        const result = await electronAPI.listSavedTestCases();
        if (result.success && result.testCases) {
          setTestCases(result.testCases);
          setOutput({ type: 'success', message: `已加载 ${result.testCases.length} 个测试文档` });
        } else {
          setTestCases([]);
          setOutput({ type: 'info', message: '暂无保存的测试文档，点击"新增文档"创建' });
        }
      } else {
        setTestCases([]);
      }

      // Show the right panel with tests tab
      setActiveTab('tests');

    } catch (error) {
      setOutput({ type: 'error', message: `Error: ${error.message}` });
    }
  };

  /**
   * Handle New Test Case - Open AI Smart Test modal without saved cases option
   */
  const handleNewTestCase = async () => {
    try {
      // Check if files exist
      if (!selectedFile && files.length === 0) {
        setOutput({ type: 'warning', message: '⚠️ 请先添加项目文件或文件夹。' });
        return;
      }

      // Check if desktop app
      if (!electronAPI) {
        setOutput({
          type: 'warning',
          message: '⚠️ 此功能仅在桌面应用中可用。'
        });
        return;
      }

      // Get project path (first added folder/file)
      const projectPath = selectedFile ? selectedFile.path : files[0].path;
      setCurrentProjectPath(projectPath);

      // Open AI Smart Test Modal with saved cases option hidden
      // The modal will handle scanning internally
      setCurrentTestDocument(null); // Clear any preselected document
      setIsCreatingNewTestCase(true); // Hide saved cases option when creating new
      setAiSmartTestModalOpen(true);

      setOutput({ type: 'info', message: '正在打开AI智能测试...' });
    } catch (error) {
      setOutput({ type: 'error', message: `Error: ${error.message}` });
    }
  };

  /**
   * Handle AI Test Mode Selection
   */
  const handleAITestModeSelect = async (mode) => {
    setAiTestSelectorOpen(false);

    // AI 测试会自动启动项目，不需要预先获取运行项目
    setCurrentProjectUrl(null);

    switch (mode) {
      case 'bdd':
        // 使用 BDD 测试模态框
        setAiTestModalOpen(true);
        break;
      case 'aiSmart':
        // 使用 AI 智能测试模态框（集成三种模式）
        setAiSmartTestModalOpen(true);
        break;
      default:
        setOutput({ type: 'info', message: `选择的测试模式: ${mode}` });
    }
  };

  /**
   * Handle Run Test Document - Open AI Smart Test with selected document
   */
  const handleRunTestDocument = async (testDocument) => {
    try {
      if (!electronAPI) {
        setOutput({ type: 'warning', message: '⚠️ 此功能仅在桌面应用中可用。' });
        return;
      }

      // Set the project path from the document
      setCurrentProjectPath(testDocument.projectPath);

      // Open AI Smart Test Modal with the selected document pre-selected
      // Pass the testDocument as preselectedTestCase prop
      setCurrentTestDocument(testDocument);
      setIsCreatingNewTestCase(false); // Show saved cases when running existing document
      setAiSmartTestModalOpen(true);

      setOutput({ type: 'info', message: `已选择测试文档: ${testDocument.projectName}` });
    } catch (error) {
      setOutput({ type: 'error', message: `Error: ${error.message}` });
    }
  };

  /**
   * Handle Edit Test Document - Save edited document to disk
   */
  const handleEditTestDocument = async (projectPath, updatedData) => {
    try {
      if (!electronAPI) {
        setOutput({ type: 'warning', message: '⚠️ 此功能仅在桌面应用中可用。' });
        return;
      }

      // Delete the old document and save the new one
      const deleteResult = await electronAPI.deleteTestCases(projectPath);
      if (!deleteResult.success) {
        setOutput({ type: 'error', message: `删除旧文档失败: ${deleteResult.error}` });
        return;
      }

      // Save the updated document
      const saveResult = await electronAPI.saveTestCases(
        updatedData.projectPath,
        updatedData.testPlan,
        updatedData.metadata || {},
        false  // 编辑模式不合并，直接覆盖
      );

      if (saveResult.success) {
        // Reload all test documents
        const listResult = await electronAPI.listSavedTestCases();
        if (listResult.success) {
          setTestCases(listResult.testCases);
        }
        setOutput({ type: 'success', message: '测试文档已更新' });
      } else {
        setOutput({ type: 'error', message: `保存失败: ${saveResult.error}` });
      }
    } catch (error) {
      setOutput({ type: 'error', message: `Error: ${error.message}` });
    }
  };

  /**
   * Handle Delete Test Document - Remove a test document
   */
  const handleDeleteTestDocument = async (projectPath) => {
    try {
      if (!electronAPI) {
        setOutput({ type: 'warning', message: '⚠️ 此功能仅在桌面应用中可用。' });
        return;
      }

      const result = await electronAPI.deleteTestCases(projectPath);

      if (result.success) {
        // Reload all test documents
        const listResult = await electronAPI.listSavedTestCases();
        if (listResult.success) {
          setTestCases(listResult.testCases);
        }
        setOutput({ type: 'success', message: '测试文档已删除' });
      } else {
        setOutput({ type: 'error', message: `删除失败: ${result.error}` });
      }
    } catch (error) {
      setOutput({ type: 'error', message: `Error: ${error.message}` });
    }
  };

  /**
   * Handle Add File/Folder
   */
  const handleAddFileFolder = async () => {
    try {
      if (!electronAPI) {
        setOutput({
          type: 'warning',
          message: '⚠️ 此功能仅在桌面应用中可用。桌面应用提供完整的文件系统访问、代码扫描、AI修复等功能。'
        });
        return;
      }

      const result = await electronAPI.addFileFolder();
      if (result.canceled) {
        setOutput({ type: 'info', message: 'File selection canceled.' });
        return;
      }

      setFiles(result.files);
      if (result.files.length > 0) {
        setCurrentProjectPath(result.files[0].path);
      }
      setOutput({ type: 'success', message: `Added ${result.files.length} item(s).` });
    } catch (error) {
      setOutput({ type: 'error', message: `Error: ${error.message}` });
    }
  };

  /**
   * Handle Remove File/Folder
   */
  const handleRemoveFile = (fileToRemove) => {
    const newFiles = files.filter(f => f.path !== fileToRemove.path);
    setFiles(newFiles);
    if (selectedFile?.path === fileToRemove.path) {
      setSelectedFile(newFiles[0] || null);
    }
    // Update current project path
    if (newFiles.length > 0) {
      setCurrentProjectPath(newFiles[0].path);
    } else {
      setCurrentProjectPath(null);
    }
    setOutput({ type: 'info', message: `已移除: ${fileToRemove.name}` });
  };

  /**
   * Handle Clear All Files
   */
  const handleClearAllFiles = () => {
    setFiles([]);
    setSelectedFile(null);
    setScanResults(null);
    setProblems([]);
    setTodos([]);
    setCurrentProjectPath(null);
    localStorage.removeItem('dev-quality-inspector-files');
    setOutput({ type: 'info', message: '已清空所有文件夹。' });
  };

  /**
   * Handle Scan Code - Opens the scan range selector modal
   * 用户先选择扫描范围（全部项目 或 部分扫描）
   */
  const handleScanCode = async () => {
    if (!selectedFile && files.length === 0) {
      setOutput({ type: 'warning', message: '⚠️ 请先添加文件。此功能仅在桌面应用中可用。' });
      return;
    }

    if (!electronAPI) {
      setOutput({
        type: 'warning',
        message: '⚠️ 代码扫描功能仅在桌面应用中可用。请下载桌面应用以使用完整功能。'
      });
      return;
    }

    // 获取项目路径
    let projectPath = currentProjectPath;
    if (!projectPath && files.length > 0) {
      // 从第一个文件推断项目路径
      const firstFilePath = files[0].path || files[0];
      const parts = firstFilePath.replace(/\\/g, '/').split('/');
      // 尝试找到项目根目录（包含 pubspec.yaml 或 package.json 的目录）
      projectPath = parts.slice(0, -1).join('/');
    }

    // 打开扫描范围选择弹窗
    setScanRangeSelectorOpen(true);
  };

  /**
   * Handle Scan From Range - 执行从范围选择器发起的扫描
   * @param {Object} scanParams - 扫描参数
   *   - scope: 'all' | 'partial'
   *   - type: 'directory' | 'partial'
   *   - path: 项目路径（scope='all' 时）
   *   - files: 文件列表（scope='partial' 时）
   *   - folders: 文件夹列表（scope='partial' 时）
   *   - options: 扫描选项
   */
  const handleScanFromRange = async (scanParams) => {
    console.log('[App] handleScanFromRange 被调用, params:', scanParams);

    if (scanParams.scope === 'all') {
      // 全部扫描 - 使用现有的 handleExecuteScan
      await handleExecuteScan({
        type: 'directory',
        path: currentProjectPath || scanParams.path,
        options: scanParams.options,
      });
    } else {
      // 部分扫描 - 批量扫描指定文件和文件夹
      try {
        setOutput({ type: 'info', message: '正在扫描选定的文件...' });
        setScanProgressOpen(true);
        setScanProgress({ scanned: 0, total: scanParams.files?.length || 0, current: '正在扫描...' });

        const allResults = [];

        // 1. 扫描指定的文件列表
        if (scanParams.files && scanParams.files.length > 0) {
          console.log('[App] 扫描文件列表:', scanParams.files.length, '个文件');
          const filesResult = await electronAPI.scanFiles(scanParams.files, {
            useAST: scanParams.options?.useAST || false,
          });

          if (filesResult.success && filesResult.results) {
            allResults.push(filesResult.results);
          }
        }

        // 2. 扫描指定的文件夹列表
        if (scanParams.folders && scanParams.folders.length > 0) {
          console.log('[App] 扫描文件夹列表:', scanParams.folders.length, '个文件夹');
          const foldersResult = await electronAPI.scanFolders(scanParams.folders, {
            useAST: scanParams.options?.useAST || false,
          });

          if (foldersResult.success && foldersResult.results) {
            allResults.push(foldersResult.results);
          }
        }

        // 合并结果
        const mergedResults = {
          success: true,
          issues: allResults.flatMap(r => r.issues || []),
          totalFiles: allResults.reduce((sum, r) => sum + (r.totalFiles || r.scannedFiles || 0), 0),
          issuesByFile: allResults.flatMap(r => r.issuesByFile || []),
        };

        console.log('[App] 部分扫描完成，总问题数:', mergedResults.issues.length);

        // 更新状态
        setScanResults(mergedResults);
        setProblems(mergedResults.issues || []);
        setTodos([]);

        // 关闭进度弹窗
        setScanProgressOpen(false);

        setOutput({
          type: 'success',
          message: `✅ 扫描完成！共发现 ${mergedResults.issues.length} 个问题。`
        });

        // 切换到问题面板
        setActiveTab('problems');
      } catch (error) {
        console.error('[App] 部分扫描错误:', error);
        setScanProgressOpen(false);
        setOutput({
          type: 'error',
          message: `❌ 扫描失败: ${error.message}`
        });
      }
    }
  };

  /**
   * Handle Execute Scan - Performs the actual scan
   */
  const handleExecuteScan = async (target) => {
    console.log('[App] handleExecuteScan 被调用, target:', target);
    if (target.error) {
      setOutput({ type: 'warning', message: `⚠️ ${target.error}` });
      return;
    }

    try {
      setOutput({ type: 'info', message: 'Scanning...' });

      // Check if AST parsing is requested
      const useAST = target.options?.useAST || false;
      console.log('[App] useAST:', useAST, 'target.options:', target.options);

      let result;
      if (useAST) {
        // Show progress modal for AST scanning
        setScanProgressOpen(true);
        setScanProgress({ scanned: 0, total: 0, current: '正在初始化 AST 扫描...' });

        // 添加超时保护
        const timeoutMs = 1200000; // 20分钟超时（AST 扫描器增强后需要更多时间）
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('AST 扫描超时（20分钟）。项目可能太大或存在性能问题。请尝试：1) 禁用 AST 解析 2) 扫描单个文件 3) 选择较小的文件夹')), timeoutMs)
        );

        try {
          // Use AST scanning with code graph generation
          result = await Promise.race([
            electronAPI.scanCodeWithAST(target, {
              generateGraph: true,
              saveGraph: target.options?.saveGraph || false,
              graphOutputPath: target.options?.graphOutputPath || null,
            }),
            timeoutPromise
          ]);

          console.log('[App] AST scan result received:', result);
          console.log('[App] result.success:', result?.success);
          console.log('[App] result.results:', result?.results);

          if (result.success) {
            // Ensure result.results exists before accessing properties
            if (!result.results) {
              throw new Error('扫描结果为空，请重试');
            }

            // 设置当前项目路径
            if (target.type === 'folder') {
              setCurrentProjectPath(target.path);
              console.log('[App] Set currentProjectPath:', target.path);
            }

            console.log('[App] Updating scan results and problems...');
            setScanResults(result.results);
            setProblems(result.results.issues || []);

            // 限制 TODO 数量，避免大量数据导致浏览器崩溃
            const MAX_TODOS = 1000;
            const issuesForTodos = result.results.issues || [];
            const limitedIssues = issuesForTodos.slice(0, MAX_TODOS);
            const generatedTodos = limitedIssues.map((issue, index) => ({
              id: `todo-${index}`,
              file: issue.filePath,
              line: issue.line,
              code: issue.ruleId,
              description: issue.message,
              status: 'pending',
            }));
            setTodos(generatedTodos);

            console.log('[App] Generated', generatedTodos.length, 'todos from', issuesForTodos.length, 'total issues');

            // Show enhanced results with AST info
            const astStats = result.results.astStats;
            const summaryObj = result.results.summary;
            // Handle summary - could be array or object
            const baseSummary = Array.isArray(summaryObj)
              ? summaryObj
              : [`扫描完成，发现 ${issuesForTodos.length} 个问题`];
            const summaryMessages = [
              ...baseSummary,
              astStats ? `解析 ${astStats.filesParsed} 个文件` : '',
              astStats ? `发现 ${astStats.totalFunctions} 个函数, ${astStats.totalClasses} 个类` : '',
              astStats ? `检测到 ${astStats.totalApiCalls} 个API调用, ${astStats.totalRoutes} 个路由` : '',
              astStats && result.results.codeGraph && !result.results.codeGraph.error ? '✓ 代码图已生成' : '',
            ].filter(Boolean).join(' | ');

            console.log('[App] Setting output to success:', summaryMessages);
            setOutput({ type: 'success', message: summaryMessages });
            setActiveTab('problems');

            // 手动关闭进度弹窗
            console.log('[App] Closing progress modal...');
            setScanProgressOpen(false);
          } else {
            console.log('[App] Scan failed, closing progress modal');
            setOutput({ type: 'error', message: `扫描失败: ${result.error || '未知错误'}` });
            setScanProgressOpen(false);
          }
        } catch (astError) {
          setScanProgressOpen(false);
          throw astError; // 重新抛出错误让外层 catch 处理
        }
      } else {
        // Regular scan without AST
        result = await electronAPI.scanCode(target);

        if (result.success) {
          // 设置当前项目路径
          if (target.type === 'folder') {
            setCurrentProjectPath(target.path);
            console.log('[App] Set currentProjectPath:', target.path);
          }

          setScanResults(result.results);
          setProblems(result.results.issues || []);

          // 限制 TODO 数量，避免大量数据导致浏览器崩溃
          const MAX_TODOS = 1000;
          const issuesForTodos = result.results.issues || [];
          const limitedIssues = issuesForTodos.slice(0, MAX_TODOS);
          const generatedTodos = limitedIssues.map((issue, index) => ({
            id: `todo-${index}`,
            file: issue.filePath,
            line: issue.line,
            code: issue.ruleId,
            description: issue.message,
            status: 'pending',
          }));
          setTodos(generatedTodos);

          // Handle summary - could be array or object
          const summary = result.results.summary;
          const summaryMsg = Array.isArray(summary)
            ? summary.join(' | ')
            : `扫描完成，发现 ${issuesForTodos.length} 个问题`;
          setOutput({ type: 'success', message: summaryMsg });
          setActiveTab('problems');
        } else {
          setOutput({ type: 'error', message: `扫描失败: ${result.error}` });
        }
      }
    } catch (error) {
      setScanProgressOpen(false);
      console.error('扫描错误:', error);
      setOutput({
        type: 'error',
        message: `扫描出错: ${error.message || '未知错误'}。如果问题持续，请尝试禁用 AST 解析或选择较小的扫描范围。`
      });
    }
  };

  /**
   * Handle Add TODO - Opens review mode selector
   */
  const handleAddTodo = async () => {
    // 防止重复点击
    if (output.message === '正在扫描代码，请稍候...' || output.message === '正在扫描代码...' || scanProgressOpen) {
      console.log('正在扫描中，忽略重复点击');
      return;
    }

    // 如果没有扫描结果，先自动扫描
    if (problems.length === 0) {
      if (!selectedFile && files.length === 0) {
        setOutput({ type: 'warning', message: '⚠️ 请先添加文件或文件夹' });
        return;
      }

      const targetPath = selectedFile?.path || files[0]?.path;
      const isFolder = !selectedFile || selectedFile.type === 'folder';

      // 打开进度条
      setScanProgressOpen(true);
      setScanProgress({ scanned: 0, total: 0, current: '' });
      setOutput({ type: 'info', message: '正在扫描代码，请稍候...' });
      console.log('开始扫描:', targetPath, isFolder ? '(文件夹)' : '(文件)');

      // 自动扫描
      const target = {
        type: selectedFile ? 'file' : 'folder',
        path: targetPath,
        options: isFolder ? {
          // 文件夹扫描时的优化选项
          // 文件大小和数量限制已移除，在 main.js 中设置为 Infinity
        } : {}
      };

      try {
        console.log('扫描目标:', target);

        // 添加超时保护 - 文件夹扫描给更长的超时时间
        const timeoutMs = isFolder ? 600000 : 30000; // 文件夹10分钟，单文件30秒
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error(isFolder
            ? '扫描超时（10分钟）。请尝试：1) 扫描单个文件而不是文件夹 2) 选择较小的文件夹'
            : '扫描超时（30秒）')), timeoutMs)
        );

        const result = await Promise.race([
          electronAPI.scanCode(target),
          timeoutPromise
        ]);

        console.log('扫描结果:', result);

        // 关闭进度条
        setScanProgressOpen(false);

        if (result.success) {
          setScanResults(result.results);
          const issues = result.results.issues || [];
          setProblems(issues);

          // 限制 TODO 数量，避免大量数据导致浏览器崩溃
          const MAX_TODOS = 1000;
          const limitedIssues = issues.slice(0, MAX_TODOS);
          const generatedTodos = limitedIssues.map((issue, index) => ({
            id: `todo-${index}`,
            file: issue.filePath,
            line: issue.line,
            code: issue.ruleId,
            description: issue.message,
            status: 'pending',
          }));
          setTodos(generatedTodos);

          // Handle summary - could be array or object
          const summaryData = result.results.summary;
          const summaryMsg = Array.isArray(summaryData)
            ? summaryData.join(' | ')
            : `扫描完成，发现 ${issues.length} 个问题`;
          setOutput({ type: 'success', message: summaryMsg });
          setActiveTab('problems');

          console.log('准备打开模式选择器，问题数量:', issues.length);

          // 扫描完成后，打开模式选择器
          if (issues.length > 0) {
            setTimeout(() => {
              console.log('打开模式选择器');
              setReviewModeSelectorOpen(true);
            }, 200);
          } else {
            setOutput({ type: 'info', message: '未发现代码问题' });
          }
        } else {
          console.error('扫描失败:', result.error);
          setOutput({ type: 'error', message: `扫描失败: ${result.error}` });
          setScanProgressOpen(false);
        }
      } catch (error) {
        console.error('扫描错误:', error);
        setOutput({ type: 'error', message: `错误: ${error.message}` });
        setScanProgressOpen(false);
      }
    } else {
      // 已有扫描结果，直接打开模式选择器
      console.log('已有扫描结果，直接打开模式选择器');
      setReviewModeSelectorOpen(true);
    }
  };

  /**
   * Handle review mode selection
   */
  const handleReviewModeSelect = async (mode) => {
    setReviewMode(mode);

    if (mode === 'agent') {
      // Agent 模式现在打开 QA Reviewer
      setQaReviewModalOpen(true);
    } else {
      // 传统模式：先检查是否有问题
      if (!problems || !Array.isArray(problems) || problems.length === 0) {
        setToast({
          message: 'ℹ️ 没有发现需要审查的问题，请先扫描项目',
          type: 'info'
        });
        setOutput({ type: 'info', message: '没有发现需要审查的问题' });
        return;
      }

      // 打开范围选择器，让用户选择要 Review 的范围
      setCodeReviewRangeSelectorOpen(true);
    }
  };

  /**
   * Handle Code Review Range Selection
   * 用户选择完范围后调用
   */
  const handleCodeReviewRangeSelect = async (rangeParams) => {
    console.log('[App] Code Review 范围选择:', rangeParams);

    let problemsToReview = rangeParams.problems;

    // 如果用户选择使用最新规则重新扫描
    if (rangeParams.rescanWithLatestRules && rangeParams.files && rangeParams.files.length > 0) {
      try {
        setOutput({ type: 'info', message: `正在使用最新规则重新扫描 ${rangeParams.files.length} 个文件...` });

        // 调用 scanFiles API 对选定文件进行重新扫描
        const scanResult = await electronAPI.scanFiles(rangeParams.files, {
          projectPath: currentProjectPath,
          useLatestRules: true // 使用最新规则
        });

        if (scanResult.success && scanResult.issues) {
          problemsToReview = scanResult.issues;
          console.log(`[App] 重新扫描完成，发现 ${problemsToReview.length} 个问题`);

          setToast({
            message: `重新扫描完成，发现 ${problemsToReview.length} 个问题`,
            type: 'info'
          });
        } else {
          console.warn('[App] 重新扫描返回空结果，使用原有问题列表');
        }
      } catch (error) {
        console.error('[App] 重新扫描失败:', error);
        setToast({
          message: `重新扫描失败，使用原有问题列表: ${error.message}`,
          type: 'warning'
        });
      }
    }

    // 使用筛选后的 problems 进行 Review
    await handleTraditionalCodeReview(problemsToReview);
  };

  /**
   * Handle Traditional Code Review
   * @param {Array} targetProblems - 要审查的问题列表（可选，默认使用全部 problems）
   */
  const handleTraditionalCodeReview = async (targetProblems = null) => {
    // 使用传入的问题列表或全部问题
    const problemsToReview = targetProblems || problems;

    try {
      setOutput({ type: 'info', message: '正在添加 Code Review 注释...' });

      // 安全检查：确保 problems 是数组
      if (!problemsToReview || !Array.isArray(problemsToReview) || problemsToReview.length === 0) {
        setToast({
          message: 'ℹ️ 没有发现需要审查的问题，请先扫描项目',
          type: 'info'
        });
        setOutput({ type: 'info', message: '没有发现需要审查的问题' });
        return;
      }

      const issuesByFile = {};
      problemsToReview.forEach((issue) => {
        // 安全检查：确保 issue 和 filePath 存在
        if (!issue || !issue.filePath) return;

        if (!issuesByFile[issue.filePath]) {
          issuesByFile[issue.filePath] = [];
        }
        issuesByFile[issue.filePath].push(issue);
      });

      let addedCount = 0;
      let skippedCount = 0;

      for (const [filePath, issues] of Object.entries(issuesByFile)) {
        for (const issue of issues) {
          const result = await electronAPI.addTodo(filePath, issue.line, issue);
          if (result.success) {
            if (result.added) {
              addedCount++;
            } else if (result.skipped || result.alreadyExists) {
              skippedCount++;
            }
          }
        }
      }

      // Always show toast notification when Code Review completes
      if (addedCount > 0) {
        setToast({
          message: `✓ 已完成 Code Review，添加 ${addedCount} 个注释${skippedCount > 0 ? `（跳过 ${skippedCount} 个）` : ''}`,
          type: 'success'
        });
      } else {
        setToast({
          message: `ℹ️ Code Review 完成${skippedCount > 0 ? `，跳过 ${skippedCount} 个通用问题` : '，没有发现需要添加的问题'}`,
          type: 'info'
        });
      }

      if (addedCount > 0) {
        setOutput({ type: 'success', message: `已添加 ${addedCount} 个 Code Review 注释${skippedCount > 0 ? `，跳过 ${skippedCount} 个` : ''}` });
      } else {
        setOutput({ type: 'info', message: `没有添加新的注释（已存在或跳过通用问题）` });
      }

      if (selectedFile) {
        const fileResult = await electronAPI.getFileContent(selectedFile.path);
        if (fileResult.success) setEditorContent(fileResult.content);
      }
      setActiveTab('todo');
    } catch (error) {
      setOutput({ type: 'error', message: `错误: ${error.message}` });
    }
  };

  /**
   * Handle Agent Code Review
   */
  const handleAgentCodeReview = async () => {
    if (!electronAPI) {
      setOutput({ type: 'warning', message: 'Agent 模式仅在桌面应用中可用' });
      return;
    }

    try {
      setOutput({ type: 'info', message: 'Agent 正在进行智能代码审查...' });

      const targetPath = selectedFile?.path || files[0]?.path;
      if (!targetPath) {
        setOutput({ type: 'warning', message: '请先选择文件或项目' });
        return;
      }

      // Prepare review request with TODO comments enabled
      const reviewRequest = {
        targetPath,
        issues: problems,
        options: {
          focusAreas: ['code', 'performance'],
          includeFullAnalysis: true,
          addTodoComments: true  // 启用 TODO 注释添加
        }
      };

      // Call agent-code-review endpoint
      const result = await electronAPI.agentCodeReview(reviewRequest);

      if (result.success) {
        const { enhancedAnalysis, addedTodos, skippedTodos, totalIssues, aiDetectedIssues } = result.result;

        // Prepare detailed message
        let detailMessage = enhancedAnalysis.summary;

        if (addedTodos !== undefined) {
          detailMessage += `\n✓ 已添加 ${addedTodos} 个 TODO 注释到代码文件`;
          if (skippedTodos > 0) {
            detailMessage += `（跳过 ${skippedTodos} 个已存在的）`;
          }
        }

        if (aiDetectedIssues && aiDetectedIssues > 0) {
          detailMessage += `\n🤖 AI 智能检测到 ${aiDetectedIssues} 个额外问题`;
        }

        // Show toast notification
        setToast({
          message: `✓ Agent 审查完成：已添加 ${addedTodos || 0} 个 TODO 注释`,
          type: 'success'
        });

        setOutput({
          type: 'success',
          message: detailMessage
        });

        // Prepare AI analysis detail content
        let aiAnalysisDetail = '';
        if (enhancedAnalysis.aiAnalysis) {
          const { detectedIssues, categories } = enhancedAnalysis.aiAnalysis;
          if (detectedIssues > 0) {
            aiAnalysisDetail = `\n\n🤖 AI 智能检测详情：\n`;
            aiAnalysisDetail += `共检测到 ${detectedIssues} 个额外问题\n\n`;

            if (categories) {
              if (categories.undefined?.count > 0) {
                aiAnalysisDetail += `• 未定义方法调用: ${categories.undefined.count} 个\n`;
              }
              if (categories.crashes?.count > 0) {
                aiAnalysisDetail += `• 潜在崩溃风险: ${categories.crashes.count} 个\n`;
              }
              if (categories.memory?.count > 0) {
                aiAnalysisDetail += `• 内存泄漏风险: ${categories.memory.count} 个\n`;
              }
              if (categories.deadCode?.count > 0) {
                aiAnalysisDetail += `• 无效代码: ${categories.deadCode.count} 个\n`;
              }
              if (categories.loops?.count > 0) {
                aiAnalysisDetail += `• 循环风险: ${categories.loops.count} 个\n`;
              }
            }
          }
        }

        // Add enhanced issues to agent messages for display
        setAgentMessages(prev => [...prev, {
          role: 'assistant',
          content: `🤖 Agent 智能代码审查完成\n\n${enhancedAnalysis.summary}${aiAnalysisDetail}\n\n📋 优先级建议：\n${enhancedAnalysis.priority.map(p => `${p.order}. ${p.issue}: ${p.reason} (分数: ${p.score})`).join('\n')}`,
          timestamp: new Date().toISOString(),
          reviewResult: result.result
        }]);

        // Refresh editor content to show added TODOs
        if (selectedFile) {
          try {
            const fileResult = await electronAPI.getFileContent(selectedFile.path);
            if (fileResult.success) {
              setEditorContent(fileResult.content);
            }
          } catch (err) {
            console.error('Failed to refresh editor:', err);
          }
        }

        // Update problems list with all issues (base + AI detected)
        if (totalIssues && totalIssues.length > 0) {
          setProblems(totalIssues);

          // Generate new TODO list
          const generatedTodos = totalIssues.map((issue, index) => ({
            id: `todo-${index}`,
            file: issue.filePath,
            line: issue.line,
            code: issue.ruleId,
            description: issue.message,
            status: 'pending'
          }));
          setTodos(generatedTodos);
        }

        // Switch to TODO tab to show added comments
        setActiveTab('todo');

        // Open agent chat to show results
        setAgentChatOpen(true);
      } else {
        setOutput({ type: 'error', message: `Agent 审查失败: ${result.error}` });
      }
    } catch (error) {
      setOutput({ type: 'error', message: `错误: ${error.message}` });
    }
  };

  /**
   * Handle AI Fix TODO - 打开范围选择模态框
   */
  const handleAiFixTodo = async () => {
    if (problems.length === 0) {
      setOutput({ type: 'warning', message: '没有发现代码问题。' });
      return;
    }

    if (aiConfig && !aiConfig.apiKey) {
      setAiConfigModalOpen(true);
      setOutput({ type: 'warning', message: '请先配置 AI 设置。' });
      return;
    }

    // 打开范围选择模态框
    setAiFixRangeModalOpen(true);
  };

  /**
   * 执行 AI 修复
   */
  const handleExecuteAIFix = async (range, filePath, issue) => {
    try {
      setAiFixRangeModalOpen(false);
      setOutput({ type: 'info', message: 'AI 正在分析...' });

      let result;

      if (range === 'line') {
        // 修复单个问题
        result = await electronAPI.aiFixSingle({
          filePath: issue.filePath,
          issue: issue,
          options: {
            includeDependencies: aiConfig?.includeDependencies ?? true,
            maxDependencyDepth: aiConfig?.maxDependencyDepth ?? 2,
          },
        });
      } else if (range === 'file') {
        // 修复当前文件
        const fileIssues = problems.filter(p => p.filePath === filePath);
        result = await electronAPI.aiFixMultiple({
          filePath: filePath,
          issues: fileIssues,
          options: {
            includeDependencies: aiConfig?.includeDependencies ?? true,
            maxDependencyDepth: aiConfig?.maxDependencyDepth ?? 2,
          },
        });
      } else if (range === 'project') {
        // 修复整个项目 - 按文件分组处理
        const issuesByFile = {};
        problems.forEach((p) => {
          if (!issuesByFile[p.filePath]) {
            issuesByFile[p.filePath] = [];
          }
          issuesByFile[p.filePath].push(p);
        });

        // 先处理第一个文件
        const firstFile = Object.keys(issuesByFile)[0];
        result = await electronAPI.aiFixMultiple({
          filePath: firstFile,
          issues: issuesByFile[firstFile],
          options: {
            includeDependencies: aiConfig?.includeDependencies ?? true,
            maxDependencyDepth: aiConfig?.maxDependencyDepth ?? 2,
          },
        });

        // TODO: 处理其他文件
      }

      if (result && result.success) {
        setCurrentFixData({
          fixId: result.fixId,
          filePath: result.filePath || filePath,
          diff: result.diff,
          issueCount: result.issueCount || 1,
          stats: result.diff?.stats
        });
        setShowDiffInEditor(true);
        setOutput({ type: 'success', message: `AI 生成修复建议，请在编辑器中查看` });
      } else {
        setOutput({ type: 'error', message: `AI 修复失败: ${result?.error || '未知错误'}` });
      }
    } catch (error) {
      setOutput({ type: 'error', message: `错误: ${error.message}` });
    }
  };

  /**
   * Handle AI fix apply/skip
   */
  const handleAiFixApply = async (fixId, accepted) => {
    try {
      const result = await electronAPI.aiFixApply(fixId, accepted);
      if (result.success) {
        setOutput({ type: 'success', message: accepted ? '修复已应用！' : '已跳过修复。' });
        if (selectedFile) {
          const fileResult = await electronAPI.getFileContent(selectedFile.path);
          if (fileResult.success) setEditorContent(fileResult.content);
        }
        // Clear diff from editor
        setShowDiffInEditor(false);
        setCurrentFixData(null);
        // Rescan to update problem list
        await handleScanCode();
      } else {
        setOutput({ type: 'error', message: `失败: ${result.error}` });
      }
    } catch (error) {
      setOutput({ type: 'error', message: `错误: ${error.message}` });
    }
  };

  /**
   * Handle diff apply from editor
   */
  const handleApplyDiffFromEditor = async () => {
    if (!currentFixData) return;
    await handleAiFixApply(currentFixData.fixId, true);
  };

  /**
   * Handle diff reject from editor
   */
  const handleRejectDiffFromEditor = async () => {
    if (!currentFixData) return;
    await handleAiFixApply(currentFixData.fixId, false);
  };

  /**
   * Handle AI config save
   */
  const handleAiConfigSave = async (config) => {
    try {
      const result = await electronAPI.aiFixUpdateConfig(config);
      if (result.success) {
        setAiConfig(config);
        setOutput({ type: 'success', message: 'AI configuration saved.' });
      }
    } catch (error) {
      setOutput({ type: 'error', message: `Error: ${error.message}` });
    }
  };

  /**
   * Handle Stop Test
   */
  const handleStopTest = async (testId) => {
    try {
      const result = await electronAPI.stopTest(testId);
      if (result.success) {
        setOutput({ type: 'success', message: 'Test stopped.' });
        loadRunningTests();
      } else {
        setOutput({ type: 'error', message: `Failed: ${result.error}` });
      }
    } catch (error) {
      setOutput({ type: 'error', message: `Error: ${error.message}` });
    }
  };

  /**
   * Handle Generate Test Report
   */
  const handleGenerateReport = async (format) => {
    if (!testResult) {
      setOutput({ type: 'warning', message: 'No test result to report.' });
      return;
    }

    try {
      const result = await electronAPI.generateTestReport(
        testResult,
        format,
        testResult.reportPaths?.html || 'test-report.html'
      );
      if (result.success) {
        setOutput({ type: 'success', message: `Report generated: ${result.filePath}` });
      } else {
        setOutput({ type: 'error', message: `Failed: ${result.error}` });
      }
    } catch (error) {
      setOutput({ type: 'error', message: `Error: ${error.message}` });
    }
  };

  /**
   * Handle Open Test Report
   */
  const handleOpenReport = async (reportPath) => {
    try {
      const result = await electronAPI.openTestReport(reportPath);
      if (!result.success) {
        setOutput({ type: 'error', message: `Failed to open: ${result.error}` });
      }
    } catch (error) {
      setOutput({ type: 'error', message: `Error: ${error.message}` });
    }
  };

  /**
   * Handle Advanced Test Modal
   */
  const handleAdvancedTest = async (generatedTests, options) => {
    try {
      if (!generatedTests || generatedTests.length === 0) {
        setOutput({ type: 'warning', message: 'No tests to run.' });
        return;
      }

      setOutput({ type: 'info', message: `Running ${generatedTests.length} advanced tests...` });
      setShowTestPanel(true);

      // 这里可以添加实际的测试运行逻辑
      // 例如：调用 electronAPI.runPlaywrightTest

    } catch (error) {
      setOutput({ type: 'error', message: `Error: ${error.message}` });
    }
  };

  /**
   * Handle Run Test
   */
  const handleRunTest = async (testPath, options) => {
    try {
      setOutput({ type: 'info', message: 'Running test...' });
      setTestPath(testPath);

      const result = await electronAPI.runTest(testPath, options);
      if (result.success) {
        setOutput({ type: 'info', message: 'Test started...' });
      } else {
        setOutput({ type: 'error', message: `Failed: ${result.error}` });
      }
    } catch (error) {
      setOutput({ type: 'error', message: `Error: ${error.message}` });
    }
  };

  /**
   * Handle Load Dependencies
   */
  const handleLoadDependencies = async () => {
    if (!selectedFile && files.length === 0) {
      setOutput({ type: 'warning', message: 'Please add files first.' });
      return;
    }

    try {
      setOutput({ type: 'info', message: 'Loading dependencies...' });

      const targetPath = selectedFile?.path || files[0]?.path;
      const result = await electronAPI.getDependencyTree(targetPath);

      if (result.success) {
        setDependencyTree(result.tree);
        setOutput({ type: 'success', message: 'Dependencies loaded.' });
      } else {
        setOutput({ type: 'error', message: `Failed: ${result.error}` });
      }

      // Get stats
      const statsResult = await electronAPI.getDependencyStats(targetPath);
      if (statsResult.success) {
        setDependencyStats(statsResult.stats);
      }
    } catch (error) {
      setOutput({ type: 'error', message: `Error: ${error.message}` });
    }
  };

  // Load dependencies when files are added (使用 ref 避免无限循环)
  const hasLoadedDeps = React.useRef(false);
  useEffect(() => {
    // 只在首次添加文件时加载依赖，避免无限循环
    if (files.length > 0 && !hasLoadedDeps.current) {
      hasLoadedDeps.current = true;
      handleLoadDependencies();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files.length]); // 只监听文件数量变化，不监听整个数组

  /**
   * Handle Agent process request
   */
  const handleAgentProcess = async (userRequest) => {
    if (!electronAPI) {
      setAgentMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Agent is only available in desktop mode.',
        timestamp: new Date().toISOString(),
        isError: true
      }]);
      return;
    }

    try {
      // Extract request content and context
      let requestContent = userRequest;
      let requestContext = {
        currentFile: selectedFile?.path,
        currentProject: files[0]?.path
      };

      // Handle object format (from scan buttons, etc.)
      if (typeof userRequest === 'object' && userRequest !== null) {
        requestContent = userRequest.userRequest || userRequest.content || JSON.stringify(userRequest);
        // Merge context from the request
        if (userRequest.currentFile) requestContext.currentFile = userRequest.currentFile;
        if (userRequest.currentProject) requestContext.currentProject = userRequest.currentProject;
      }

      // Add user message
      setAgentMessages(prev => [...prev, {
        role: 'user',
        content: requestContent,
        timestamp: new Date().toISOString()
      }]);

      // Process request
      const result = await electronAPI.agentProcess({
        userRequest: requestContent,
        ...requestContext
      });

      if (result.success) {
        setCurrentPlan(result.plan);
      } else {
        setAgentMessages(prev => [...prev, {
          role: 'assistant',
          content: `Error: ${result.error}`,
          timestamp: new Date().toISOString(),
          isError: true
        }]);
      }
    } catch (error) {
      setAgentMessages(prev => [...prev, {
        role: 'assistant',
        content: `Error: ${error.message}`,
        timestamp: new Date().toISOString(),
        isError: true
      }]);
    }
  };

  /**
   * Handle Agent task approval
   */
  const handleAgentApproveTask = async (taskId) => {
    if (!electronAPI) return;
    try {
      await electronAPI.agentApproveTask(taskId);
      setOutput({ type: 'info', message: 'Task approved' });
    } catch (error) {
      setOutput({ type: 'error', message: `Failed to approve: ${error.message}` });
    }
  };

  /**
   * Handle Agent task denial
   */
  const handleAgentDenyTask = async (taskId) => {
    if (!electronAPI) return;
    try {
      await electronAPI.agentDenyTask(taskId);
      setOutput({ type: 'info', message: 'Task denied' });
    } catch (error) {
      setOutput({ type: 'error', message: `Failed to deny: ${error.message}` });
    }
  };

  /**
   * Handle Agent abort
   */
  const handleAgentAbort = async () => {
    if (!electronAPI) return;
    try {
      const result = await electronAPI.agentAbort();
      if (result.success) {
        setAgentStatus({ isProcessing: false, message: 'Aborted' });
        setOutput({ type: 'info', message: 'Agent execution aborted' });
      }
    } catch (error) {
      setOutput({ type: 'error', message: `Failed to abort: ${error.message}` });
    }
  };

  /**
   * Handle viewing Agent history episode
   */
  const handleViewAgentHistory = (episode) => {
    setAgentMessages(prev => [...prev, {
      role: 'assistant',
      content: `History: ${episode.userRequest}\nResult: ${episode.status}\nSteps: ${episode.steps?.length || 0}`,
      timestamp: new Date().toISOString(),
      episode
    }]);
  };

  /**
   * Handle file selection
   */
  const handleFileSelect = async (file) => {
    setSelectedFile(file);

    // 如果是文件夹，不加载内容
    if (file.type === 'folder') {
      setOutput({ type: 'info', message: `Selected folder: ${file.name}` });
      return;
    }

    // 检查文件扩展名，判断是否支持预览
    const unsupportedExts = new Set([
      '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.bmp',
      '.woff', '.woff2', '.ttf', '.eot', '.otf',
      '.mp3', '.mp4', '.wav', '.avi', '.mov', '.mkv',
      '.zip', '.tar', '.gz', '.rar', '.7z',
      '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
      '.exe', '.dll', '.so', '.dylib', '.bin', '.dat', '.db', '.sqlite'
    ]);

    const ext = file.name ? '.' + file.name.split('.').pop() : '';

    if (unsupportedExts.has(ext.toLowerCase())) {
      // 不支持的文件类型，显示友好提示
      const extName = ext.replace('.', '').toUpperCase();
      const typeText = extName === 'WOFF' || extName === 'WOFF2' || extName === 'TTF' || extName === 'EOT' || extName === 'OTF' ? '字体' :
                       extName === 'PNG' || extName === 'JPG' || extName === 'JPEG' || extName === 'GIF' || extName === 'SVG' || extName === 'ICO' ? '图片' :
                       extName === 'MP3' || extName === 'WAV' ? '音频' :
                       extName === 'MP4' || extName === 'AVI' || extName === 'MOV' ? '视频' :
                       extName === 'ZIP' || extName === 'TAR' || extName === 'GZ' || extName === 'RAR' ? '压缩' :
                       extName === 'PDF' || extName === 'DOC' || extName === 'DOCX' || extName === 'XLS' || extName === 'XLSX' ? '文档' : extName;

      // 设置编辑器内容为友好提示
      setEditorContent(`⚠️  ${typeText}文件不支持预览

文件名: ${file.name}
文件类型: ${ext}

💡 桌面应用提示：
该文件类型是二进制文件或特殊格式文件，不支持在代码编辑器中预览。

如需查看此文件，请使用相应的专业工具。`);

      setEditorLanguage('plaintext');
      setOutput({ type: 'warning', message: `${typeText}文件不支持预览: ${file.name}` });
      return;
    }

    try {
      if (!electronAPI) {
        // 网页版模式，显示提示
        setEditorContent(`💡 网页版预览模式

文件名: ${file.name}
文件路径: ${file.path}

当前为网页预览模式，无法加载文件内容。

📥 请下载桌面应用以获得完整功能：
   - 文件系统访问
   - 代码扫描和修复
   - AI 智能修复
   - 项目运行和测试
   - 依赖管理
   - 完整的 IDE 功能

下载地址：[待添加]`);
        setEditorLanguage('plaintext');
        setOutput({ type: 'info', message: '💡 网页版模式：下载桌面应用以查看文件内容' });
        return;
      }

      setOutput({ type: 'info', message: `Loading ${file.name}...` });
      const result = await electronAPI.getFileContent(file.path);

      if (result.success) {
        setEditorContent(result.content);
        setEditorLanguage(file.language || 'typescript');
        setOutput({ type: 'success', message: `Loaded: ${file.name} (${result.content.length} chars)` });
      } else {
        // 文件加载失败，显示错误信息
        setEditorContent(`❌ 无法加载文件

文件名: ${file.name}
文件路径: ${file.path}

错误信息: ${result.error}

该文件可能不存在或无权限访问。`);
        setEditorLanguage('plaintext');
        setOutput({ type: 'error', message: `Failed to load file: ${result.error}` });
      }
    } catch (error) {
      console.error('Error loading file:', error);
      setOutput({ type: 'error', message: `Error loading file: ${error.message}` });
    }
  };

  // 格式化文件大小
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  /**
   * Handle editor content change
   */
  const handleContentChange = async (value) => {
    setEditorContent(value);
    if (selectedFile && electronAPI) {
      try {
        await electronAPI.saveFileContent(selectedFile.path, value);
      } catch (error) {
        console.error('Error saving file:', error);
      }
    }
  };

  /**
   * Handle problem click - opens file and highlights line
   */
  const handleProblemClick = async ({ filePath, line, ruleId }) => {
    try {
      // 如果点击的不是当前文件，先切换文件
      if (!selectedFile || selectedFile.path !== filePath) {
        const fileResult = await electronAPI.getFileContent(filePath);
        if (fileResult.success) {
          setEditorContent(fileResult.content);

          // 设置语言
          const ext = filePath.split('.').pop();
          const langMap = {
            'js': 'javascript',
            'jsx': 'javascript',
            'ts': 'typescript',
            'tsx': 'typescript',
            'vue': 'html',
            'dart': 'dart',
            'json': 'json',
            'md': 'markdown'
          };
          setEditorLanguage(langMap[ext] || 'typescript');

          // 创建一个新的文件对象
          const fileName = filePath.split(/[/\\]/).pop();
          setSelectedFile({
            path: filePath,
            name: fileName,
            type: 'file'
          });
        } else {
          setOutput({ type: 'error', message: `无法打开文件: ${fileResult.error}` });
          return;
        }
      }

      // 设置高亮行
      setHighlightLine(line);

      // 清除之前的选中状态（如果有）
      setTimeout(() => {
        setHighlightLine(null);
      }, 5000);

      setOutput({
        type: 'info',
        message: `已跳转到 ${filePath.split(/[/\\]/).pop()}:${line}`
      });
    } catch (error) {
      console.error('Error handling problem click:', error);
      setOutput({ type: 'error', message: `跳转失败: ${error.message}` });
    }
  };

  // Determine which panel to show at bottom
  const bottomPanel = showTestPanel ? 'test' : 'output';

  return (
    <div className="h-screen w-screen flex flex-col bg-gray-900 text-white overflow-hidden">
      {/* Toast Notification */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          duration={3000}
          onClose={() => setToast(null)}
        />
      )}

      {/* Toolbar */}
      <Toolbar
        onAction={handleAction}
        runningTestsCount={runningTests.length}
        activeButton={activeButton}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - File Tree */}
        <FileTree
          files={files}
          selectedFile={selectedFile}
          onSelectFile={handleFileSelect}
          onRemoveFile={handleRemoveFile}
          onClearAll={handleClearAllFiles}
        />

        {/* Center - Code Editor */}
        <div className="flex-1 flex flex-col">
          <CodeEditor
            file={selectedFile}
            content={editorContent}
            language={editorLanguage}
            onChange={handleContentChange}
            todos={todos}
            diffData={showDiffInEditor && currentFixData?.filePath === selectedFile?.path ? currentFixData : null}
            onApplyDiff={handleApplyDiffFromEditor}
            onRejectDiff={handleRejectDiffFromEditor}
            highlightLine={highlightLine}
          />
        </div>

        {/* Right Panel */}
        <RightPanel
          activeTab={activeTab}
          onTabChange={setActiveTab}
          problems={problems}
          todos={todos}
          dependencies={dependencies}
          dependencyTree={dependencyTree}
          dependencyStats={dependencyStats}
          onAiFixIssue={handleAiFixTodo}
          testCases={testCases}
          onProblemClick={handleProblemClick}
          onNewTestCase={handleNewTestCase}
          onRunTestDocument={handleRunTestDocument}
          onEditTestDocument={handleEditTestDocument}
          onDeleteTestDocument={handleDeleteTestDocument}
          scanResults={scanResults}
        />
      </div>

      {/* Bottom Panels */}
      {bottomPanel === 'test' && (
        <TestPanel
          testCases={testCases}
          testResult={testResult}
          runningTests={runningTests}
          onStopTest={handleStopTest}
          onGenerateReport={handleGenerateReport}
          onOpenReport={handleOpenReport}
          onClose={handleCloseTestPanel}
        />
      )}
      {bottomPanel === 'output' && <OutputPanel output={output} />}

      {/* Modals */}
      {/* AI Fix Range Selector Modal */}
      {aiFixRangeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70">
          <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <span className="text-2xl">🤖</span>
                  AI Fix - 选择修复范围
                </h2>
                <p className="text-xs text-gray-400 mt-1">选择要修复的范围，AI 将智能分析并修复代码问题</p>
              </div>
              <button
                onClick={() => setAiFixRangeModalOpen(false)}
                className="text-gray-400 hover:text-white transition-colors text-2xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {/* 统计信息 */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="p-4 bg-gray-900 rounded-lg">
                  <div className="text-2xl font-bold text-white">{problems.length}</div>
                  <div className="text-xs text-gray-400">项目总问题</div>
                </div>
                <div className="p-4 bg-blue-900/20 rounded-lg">
                  <div className="text-2xl font-bold text-blue-400">
                    {selectedFile ? problems.filter(p => p.filePath === selectedFile.path).length : 0}
                  </div>
                  <div className="text-xs text-gray-400">当前文件问题</div>
                </div>
              </div>

              {/* 范围选择 */}
              <div>
                <h3 className="text-sm font-semibold text-white mb-3">选择修复范围</h3>
                <div className="space-y-3">
                  {/* 当前文件 */}
                  {selectedFile && (
                    <button
                      onClick={() => handleExecuteAIFix('file', selectedFile.path)}
                      className="w-full p-4 rounded-lg border-2 transition-all text-left bg-gray-900 border-gray-700 hover:border-blue-500 hover:bg-blue-900/20"
                    >
                      <div className="flex items-center gap-4">
                        <span className="text-2xl">📄</span>
                        <div className="flex-1">
                          <h4 className="text-sm font-semibold text-white">当前文件</h4>
                          <p className="text-xs text-gray-400">修复当前文件的所有问题</p>
                          <p className="text-xs text-gray-500 truncate mt-1">{selectedFile.name}</p>
                        </div>
                      </div>
                    </button>
                  )}

                  {/* 整个项目 */}
                  <button
                    onClick={() => handleExecuteAIFix('project')}
                    className="w-full p-4 rounded-lg border-2 transition-all text-left bg-gray-900 border-gray-700 hover:border-purple-500 hover:bg-purple-900/20"
                  >
                    <div className="flex items-center gap-4">
                      <span className="text-2xl">📁</span>
                      <div className="flex-1">
                        <h4 className="text-sm font-semibold text-white">整个项目</h4>
                        <p className="text-xs text-gray-400">修复项目中所有 {problems.length} 个问题</p>
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              {/* 当前文件问题列表（单选） */}
              {selectedFile && (
                <div className="mt-6">
                  <h3 className="text-sm font-semibold text-white mb-3">或选择单个问题修复</h3>
                  <div className="max-h-48 overflow-y-auto space-y-2">
                    {problems.filter(p => p.filePath === selectedFile.path).map((issue, index) => (
                      <button
                        key={index}
                        onClick={() => handleExecuteAIFix('line', null, issue)}
                        className="w-full p-3 rounded-lg text-left transition-all bg-gray-900 border border-gray-700 hover:border-green-500 hover:bg-green-900/20"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-0.5 text-xs rounded ${
                                issue.severity === 'error' ? 'bg-red-900 text-red-300' :
                                issue.severity === 'warning' ? 'bg-yellow-900 text-yellow-300' :
                                'bg-gray-700 text-gray-300'
                              }`}>
                                {issue.ruleId}
                              </span>
                              <span className="text-xs text-gray-400">行 {issue.line}</span>
                            </div>
                            <p className="text-xs text-gray-300 mt-1 truncate">{issue.message}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-700 flex justify-end">
              <button
                onClick={() => setAiFixRangeModalOpen(false)}
                className="px-6 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors text-white"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      <AiFixModal
        isOpen={aiFixModalOpen}
        onClose={() => setAiFixModalOpen(false)}
        fixData={currentFixData}
        onApply={handleAiFixApply}
      />

      <AiConfigModal
        isOpen={aiConfigModalOpen}
        onClose={() => setAiConfigModalOpen(false)}
        onSave={handleAiConfigSave}
        initialConfig={aiConfig}
      />

      <ScanModal
        isOpen={scanModalOpen}
        onClose={() => setScanModalOpen(false)}
        onScan={handleExecuteScan}
        selectedFile={selectedFile}
        projectPath={files.length > 0 ? files[0].path : null}
      />

      {/* 扫描范围选择弹窗 - 新增 */}
      <ScanRangeSelector
        isOpen={scanRangeSelectorOpen}
        onClose={() => setScanRangeSelectorOpen(false)}
        onScan={handleScanFromRange}
        projectPath={currentProjectPath || (files.length > 0 ? files[0].path : null)}
        electronAPI={electronAPI}
      />

      <TestModal
        isOpen={testModalOpen}
        onClose={(testId, result) => {
          setTestModalOpen(false);
          if (testId) {
            setShowTestPanel(true);
            if (result) setTestResult(result);
          }
        }}
        onImport={setTestCases}
        onGenerate={() => {}}
        onRun={handleRunTest}
      />

      <AdvancedTestModal
        isOpen={advancedTestModalOpen}
        onClose={() => setAdvancedTestModalOpen(false)}
        onGenerateTests={handleAdvancedTest}
        onRunTests={handleAdvancedTest}
      />

      <AITestSelectorModal
        isOpen={aiTestSelectorOpen}
        onClose={() => setAiTestSelectorOpen(false)}
        onSelect={handleAITestModeSelect}
        scanResult={lastScanResult}
      />

      {/* New AI Test Modals */}
      <AITestModal
        isOpen={aiTestModalOpen}
        onClose={() => setAiTestModalOpen(false)}
        electronAPI={electronAPI}
        projectUrl={currentProjectUrl}
      />

      <AIAgentTestModal
        isOpen={aiAgentTestModalOpen}
        onClose={() => setAiAgentTestModalOpen(false)}
        electronAPI={electronAPI}
        projectUrl={currentProjectUrl}
      />

      <AISmartTestModal
        isOpen={aiSmartTestModalOpen}
        onClose={() => {
          setAiSmartTestModalOpen(false);
          setCurrentTestDocument(null);
          setIsCreatingNewTestCase(false);
        }}
        electronAPI={electronAPI}
        projectUrl={currentProjectUrl}
        projectPath={currentProjectPath}
        preselectedTestCase={currentTestDocument}
        hideSavedCasesOption={isCreatingNewTestCase}
      />

      {/* Original Test Modals */}
      <TestModal
        isOpen={testModalOpen}
        onClose={(testId, result) => {
          setTestModalOpen(false);
          if (testId) {
            setShowTestPanel(true);
            if (result) setTestResult(result);
          }
        }}
        onImport={setTestCases}
        onGenerate={() => {}}
        onRun={handleRunTest}
      />

      <AdvancedTestModal
        isOpen={advancedTestModalOpen}
        onClose={() => setAdvancedTestModalOpen(false)}
        onGenerateTests={handleAdvancedTest}
        onRunTests={handleAdvancedTest}
      />

      <ScanModal
        isOpen={scanModalOpen}
        onClose={() => setScanModalOpen(false)}
        onScan={handleExecuteScan}
        selectedFile={selectedFile}
        projectPath={files.length > 0 ? files[0].path : null}
      />

      {/* Agent Modals */}
      <AgentChat
        isOpen={agentChatOpen}
        onClose={() => setAgentChatOpen(false)}
        onProcessRequest={handleAgentProcess}
        agentStatus={agentStatus}
        currentPlan={currentPlan}
        messages={agentMessages}
        currentFile={selectedFile}
        projectPath={files.length > 0 ? files[0].path : null}
      />

      <AgentPanel
        isOpen={agentPanelOpen}
        onClose={() => setAgentPanelOpen(false)}
        agentStatus={agentStatus}
        currentPlan={currentPlan}
        executionHistory={agentHistory}
        onApproveTask={handleAgentApproveTask}
        onDenyTask={handleAgentDenyTask}
        onAbort={handleAgentAbort}
        onViewHistory={handleViewAgentHistory}
      />

      {/* Review Mode Selector */}
      <ReviewModeSelector
        isOpen={reviewModeSelectorOpen}
        onClose={() => setReviewModeSelectorOpen(false)}
        onModeSelect={handleReviewModeSelect}
      />

      {/* Code Review Range Selector - 传统模式选择审查范围 */}
      <CodeReviewRangeSelector
        isOpen={codeReviewRangeSelectorOpen}
        onClose={() => setCodeReviewRangeSelectorOpen(false)}
        onReview={handleCodeReviewRangeSelect}
        projectPath={currentProjectPath}
        electronAPI={electronAPI}
        problems={problems}
      />

      {/* Scan Progress Modal */}
      <ScanProgressModal
        isOpen={scanProgressOpen}
        progress={scanProgress}
        onClose={() => {
          console.log('[App] onClose 被调用，设置 scanProgressOpen = false');
          setScanProgressOpen(false);
        }}
      />

      {/* Settings Panel */}
      <SettingsPanel
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        electronAPI={electronAPI}
      />

      {/* QA Reviewer Modal */}
      <QAReviewerModal
        isOpen={qaReviewModalOpen}
        onClose={() => setQaReviewModalOpen(false)}
        electronAPI={electronAPI}
        projectPath={currentProjectPath}
      />
    </div>
  );
}

export default App;
// Trigger recompile
