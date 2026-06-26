/**
 * 需求分析整理 Modal 组件
 *
 * 6个Tab流程：
 * 1. Google 登录 (auth)
 * 2. 需求来源 + Figma (sources)
 * 3. AI 分析 (analyze)
 * 4. 回复 & 完善 (refine)
 * 5. 一键执行 + 保存 (execute)
 * 6. 设置 (settings)
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Toast from './Toast';
import './ReqAnalyzerModal.css';

const electronAPI = window.electronAPI;

// 内部 Spinner 组件
function Spinner({ size = 'sm', text = '' }) {
  return (
    <div className="req-analyzer-spinner-overlay">
      <div className={`req-analyzer-spinner ${size === 'lg' ? 'req-analyzer-spinner-lg' : ''}`} />
      {text && <span className="req-analyzer-spinner-text">{text}</span>}
    </div>
  );
}

// 内部空状态组件
function EmptyState({ icon = '📋', text = '', actionLabel = '', onAction = null }) {
  return (
    <div className="req-analyzer-empty-state">
      <span className="req-analyzer-empty-state-icon">{icon}</span>
      <span className="req-analyzer-empty-state-text">{text}</span>
      {actionLabel && onAction && (
        <button onClick={onAction} className="req-analyzer-btn-primary">{actionLabel}</button>
      )}
    </div>
  );
}

// 可清空的输入框组件（x 在输入框内部右侧）
function ClearableInput({ value, onChange, placeholder, className = 'req-analyzer-input-wide', type = 'text', onClear }) {
  return (
    <div className="req-analyzer-clearable-input">
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={className}
      />
      {value && (
        <button
          className="req-analyzer-clear-btn"
          onClick={() => {
            onChange({ target: { value: '' } });
            if (onClear) onClear();
          }}
          title="清空"
        >
          ×
        </button>
      )}
    </div>
  );
}

// Drive 树节点递归组件
function DriveTreeNode({ node, treeNodes, onToggle, onDownload, depth }) {
  const nodeState = treeNodes.get(node.id);
  const isExpanded = nodeState?.expanded || false;
  const children = nodeState?.children || null;
  const isFolder = node.isFolder || node.isSharedDrive;
  const icon = node.isSharedDrive ? '🗄️' : isFolder ? '📁' : '📄';
  const typeLabel = isFolder ? '文件夹' : (node.type === 'unknown' ? 'download' : node.type);

  return (
    <div>
      <div
        className="req-analyzer-tree-node"
        style={{ paddingLeft: depth * 20 }}
        onClick={() => isFolder ? onToggle(node.id, node) : onDownload(node.id)}
      >
        {isFolder && <span className="req-analyzer-tree-toggle">{isExpanded ? '▼' : '▶'}</span>}
        <span>{icon} {node.name}</span>
        {typeLabel && <span className="req-analyzer-file-type">{typeLabel}</span>}
      </div>
      {isExpanded && children && children.map(child => (
        <DriveTreeNode
          key={child.id}
          node={child}
          treeNodes={treeNodes}
          onToggle={onToggle}
          onDownload={onDownload}
          depth={depth + 1}
        />
      ))}
    </div>
  );
}

function ReqAnalyzerModal({ isOpen, onClose, projectPath }) {
  const [activeTab, setActiveTab] = useState('auth');
  const [requirementName, setRequirementName] = useState('');
  const [existingRequirements, setExistingRequirements] = useState([]);
  const [isNewRequirement, setIsNewRequirement] = useState(true);
  const [requirementLanguage, setRequirementLanguage] = useState('zh-TW'); // 输出语言：默认繁体中文
  const [showRequirementDropdown, setShowRequirementDropdown] = useState(false);
  const [requirementNameSuggestions, setRequirementNameSuggestions] = useState([]);
  const [autoNextStep, setAutoNextStep] = useState(true);

  // Tab 1: Google 认证
  const [googleAuthStatus, setGoogleAuthStatus] = useState({ isAuthenticated: false });
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  // Tab 2: 需求来源
  const [sheetsUrl, setSheetsUrl] = useState('');
  const [sheetsData, setSheetsData] = useState(null);
  const [confirmedIssuesUrl, setConfirmedIssuesUrl] = useState('');
  const [confirmedIssues, setConfirmedIssues] = useState(null);
  const [localFileData, setLocalFileData] = useState(null);
  const [selectedPages, setSelectedPages] = useState(new Set());
  const [savedFiles, setSavedFiles] = useState([]);
  const [driveFiles, setDriveFiles] = useState([]);
  const [driveSearchQuery, setDriveSearchQuery] = useState('');
  const [tableMaxRows, setTableMaxRows] = useState(20);
  const [driveMode, setDriveMode] = useState('search');
  const [driveFilter, setDriveFilter] = useState('');
  // Drive 树状浏览
  const [driveTreeNodes, setDriveTreeNodes] = useState(new Map()); // key=节点ID, value={children,expanded,driveId}
  const [driveCategoryExpanded, setDriveCategoryExpanded] = useState({ my: false, shared: false, drives: false });
  const [driveRootData, setDriveRootData] = useState({ my: [], shared: [], drives: [] });

  // Figma (在来源 Tab 内)
  const [figmaUrl, setFigmaUrl] = useState('');
  const [figmaToken, setFigmaToken] = useState('');
  const [showFigmaToken, setShowFigmaToken] = useState(false);
  const [figmaData, setFigmaData] = useState(null);
  const [isFigmaLoading, setIsFigmaLoading] = useState(false);
  const [figmaLayers, setFigmaLayers] = useState([]);       // Layer 列表
  const [selectedLayerIds, setSelectedLayerIds] = useState([]); // 选中的 Layer ID
  const [figmaNodeId, setFigmaNodeId] = useState('');       // 解析后的 nodeId
  const [figmaNodeName, setFigmaNodeName] = useState('');   // 节点名称
  const [isFigmaLayersLoading, setIsFigmaLayersLoading] = useState(false);

  // Tab 3: AI 分析
  const [questionSheetUrl, setQuestionSheetUrl] = useState('');
  const [questionList, setQuestionList] = useState([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(null);
  const [questionsWritten, setQuestionsWritten] = useState(false);
  const [streamingText, setStreamingText] = useState('');

  // Tab 4: 回复 & 完善
  const [repliesSheetUrl, setRepliesSheetUrl] = useState('');
  const [repliesData, setRepliesData] = useState(null);
  const [isReadingReplies, setIsReadingReplies] = useState(false);
  const [refinedRequirements, setRefinedRequirements] = useState(null);
  const [isRefining, setIsRefining] = useState(false);
  const [iterationCount, setIterationCount] = useState(1);
  const [newIssuesCheck, setNewIssuesCheck] = useState(null);

  // Tab 5: 一键执行 + 保存
  const [savePathPreview, setSavePathPreview] = useState('');
  const [saveResult, setSaveResult] = useState(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executeProgress, setExecuteProgress] = useState(null);
  const [parsedSections, setParsedSections] = useState([]);       // 解析出的章节列表
  const [selectedSections, setSelectedSections] = useState(new Set()); // 选中的章节索引

  // Tab 7: 设置
  const [googleClientSecret, setGoogleClientSecret] = useState('');
  const [showClientSecret, setShowClientSecret] = useState(false);

  // 内部配置（不直接渲染，但需要保存）
  const [, setConfig] = useState(null);

  // Toast 通知状态
  const [toast, setToast] = useState(null);
  const showToast = useCallback((message, type = 'info', duration = 3000) => {
    setToast({ message, type, duration });
  }, []);

  // 进度监听器清理
  const progressCleanupRef = useRef(null);

  // 会话追踪：弹窗关闭时递增，忽略旧会话的 IPC 返回结果
  const sessionRef = useRef(0);

  // requirementName 变化时获取保存路径预览
  useEffect(() => {
    if (requirementName.trim()) {
      electronAPI.reqAnalyzerGetSavePathPreview(requirementName).then(result => {
        if (result.filePath) setSavePathPreview(result.filePath);
      }).catch(() => setSavePathPreview(''));
    } else {
      setSavePathPreview('');
    }
  }, [requirementName]);

  // Modal 打开时初始化
  useEffect(() => {
    if (!isOpen) return;

    // 递增 session，使旧会话的 IPC 返回结果被忽略
    sessionRef.current += 1;

    // 重置状态（不重置认证状态）
    resetState();

    // 加载配置、已有需求列表
    loadConfig();
    loadRequirementsList();
    loadSavedFiles();

    // 检查认证状态，已认证则跳到来源 Tab
    initAuthAndTab();
  }, [isOpen]);

  async function initAuthAndTab() {
    try {
      const status = await electronAPI.reqAnalyzerGoogleAuthStatus();
      const isAuth = status.isAuthenticated || false;
      setGoogleAuthStatus({
        isAuthenticated: isAuth,
        email: status.email || '',
      });
      // 已认证直接跳到来源 Tab
      if (isAuth) {
        setActiveTab('sources');
      }
    } catch (e) {
      console.warn('检查Google认证状态失败:', e.message);
    }
  }

  // 进度监听器
  useEffect(() => {
    if (!isOpen) return;

    const cleanup = electronAPI.onReqAnalyzerProgress((progress) => {
      setAnalysisProgress(progress);
      setExecuteProgress(progress);
    });
    progressCleanupRef.current = cleanup;

    return () => {
      if (progressCleanupRef.current) progressCleanupRef.current();
    };
  }, [isOpen]);

  function resetState() {
    setActiveTab('auth'); // 默认认证页，initAuthAndTab 会根据认证状态调整
    // 不重置 googleAuthStatus，由 checkGoogleAuthStatus() 查询真实状态
    setIsAuthLoading(false);
    setIsFigmaLoading(false);
    setIsFigmaLayersLoading(false);
    setIsAnalyzing(false);
    setIsRefining(false);
    setIsReadingReplies(false);
    setIsExecuting(false);
    setSheetsData(null);
    setConfirmedIssues(null);
    setFigmaData(null);
    setFigmaLayers([]);
    setSelectedLayerIds([]);
    setFigmaNodeId('');
    setFigmaNodeName('');
    setLocalFileData(null);
    setSelectedPages(new Set());
    setQuestionList([]);
    setRepliesData(null);
    setRefinedRequirements(null);
    setNewIssuesCheck(null);
    setQuestionsWritten(false);
    setSaveResult(null);
    setIsNewRequirement(true);
    setIterationCount(1);
  }

  async function loadConfig() {
    try {
      const cfg = await electronAPI.reqAnalyzerGetConfig();
      setConfig(cfg);
      if (cfg.google) {
        setGoogleClientSecret(cfg.google.clientSecret || '');
      }
      if (cfg.sheets) {
        setSheetsUrl(cfg.sheets.requirementSheetUrl || '');
        setConfirmedIssuesUrl(cfg.sheets.confirmedIssuesSheetUrl || '');
        setQuestionSheetUrl(cfg.sheets.questionSheetUrl || '');
      }
      if (cfg.figma) {
        setFigmaToken(cfg.figma.accessToken || '');
        setFigmaUrl(cfg.figma.defaultUrl || '');
      }
      // 检查 Google 认证状态
      const status = await electronAPI.reqAnalyzerGoogleAuthStatus();
      setGoogleAuthStatus(status);
    } catch (e) {
      console.warn('加载配置失败:', e.message);
    }
  }

  async function loadRequirementsList() {
    try {
      const list = await electronAPI.reqAnalyzerListRequirements();
      setExistingRequirements(list || []);
    } catch (e) {
      console.warn('加载需求列表失败:', e.message);
    }
  }

  // 检查 Google 认证状态
  async function checkGoogleAuthStatus() {
    try {
      const status = await electronAPI.reqAnalyzerGoogleAuthStatus();
      setGoogleAuthStatus({
        isAuthenticated: status.isAuthenticated || false,
        email: status.email || '',
      });
    } catch (e) {
      console.warn('检查Google认证状态失败:', e.message);
    }
  }

  // ============================================
  // Tab 1: Google 认证
  // ============================================
  async function handleGoogleAuth() {
    setIsAuthLoading(true);
    const session = sessionRef.current;
    try {
      const result = await electronAPI.reqAnalyzerGoogleAuthStart();
      if (sessionRef.current !== session) return;
      if (result.success) {
        setGoogleAuthStatus({
          isAuthenticated: true,
          email: result.email,
        });
        showToast('Google 登录成功', 'success');
      } else {
        showToast(`Google 登录失败: ${result.error}`, 'error');
      }
    } catch (e) {
      if (sessionRef.current !== session) return;
      showToast(`Google 登录失败: ${e.message}`, 'error');
    } finally {
      if (sessionRef.current === session) setIsAuthLoading(false);
    }
  }

  async function handleGoogleRevoke() {
    try {
      await electronAPI.reqAnalyzerGoogleAuthRevoke();
      setGoogleAuthStatus({ isAuthenticated: false });
      showToast('已退出 Google 登录', 'success');
    } catch (e) {
      showToast(`退出登录失败: ${e.message}`, 'error');
    }
  }

  // ============================================
  // Tab 2: 需求来源
  // ============================================
  async function handleReadRequirementSheets() {
    if (!sheetsUrl.trim()) {
      showToast('请输入 Google Sheets URL', 'warning');
      return;
    }
    const session = sessionRef.current;
    try {
      const result = await electronAPI.reqAnalyzerReadRequirementSheets(sheetsUrl, {});
      if (sessionRef.current !== session) return;
      if (result.success) {
        setSheetsData(result);
        showToast(`读取成功: ${result.totalRows} 条需求`, 'success');
        // 推断需求名称建议
        try {
          const suggestions = await electronAPI.reqAnalyzerInferRequirementName(result.data || []);
          if (sessionRef.current !== session) return;
          if (suggestions && suggestions.length > 0) {
            setRequirementNameSuggestions(suggestions);
          }
        } catch (e) { /* 推断失败不影响主流程 */ }
        // 自动下一步
        if (autoNextStep) setActiveTab('analyze');
      } else {
        showToast(`读取 Sheets 失败: ${result.error}`, 'error');
      }
    } catch (e) {
      if (sessionRef.current !== session) return;
      showToast(`读取 Sheets 失败: ${e.message}`, 'error');
    }
  }

  async function handleReadConfirmedIssues() {
    if (!confirmedIssuesUrl.trim()) {
      showToast('请输入共通需求 Sheets URL', 'warning');
      return;
    }
    const session = sessionRef.current;
    try {
      const result = await electronAPI.reqAnalyzerReadConfirmedIssues(confirmedIssuesUrl, {});
      if (sessionRef.current !== session) return;
      if (result.success) {
        setConfirmedIssues(result);
        showToast(`共通需求: ${result.confirmedIssues} 条`, 'success');
      } else {
        showToast(`读取共通需求失败: ${result.error}`, 'error');
      }
    } catch (e) {
      if (sessionRef.current !== session) return;
      showToast(`读取共通需求失败: ${e.message}`, 'error');
    }
  }

  async function handleSelectLocalFile() {
    try {
      const result = await electronAPI.selectFile({
        filters: [
          { name: '需求文件', extensions: ['pdf', 'docx', 'xlsx', 'txt', 'md', 'csv'] },
          { name: '所有文件', extensions: ['*'] },
        ],
      });
      if (result && result.filePath) {
        const parseResult = await electronAPI.reqAnalyzerReadLocalFile(result.filePath);
        if (parseResult.success) {
          setLocalFileData(parseResult);
          // 多页 PDF 时默认全选所有页面
          if (parseResult.pages && parseResult.pages.length > 0) {
            setSelectedPages(new Set(parseResult.pages.map(p => p.pageNum)));
          }
          showToast(`文件加载成功: ${parseResult.fileName}`, 'success');
        } else {
          showToast(`文件解析失败: ${parseResult.error}`, 'error');
        }
      }
    } catch (e) {
      showToast(`选择文件失败: ${e.message}`, 'error');
    }
  }

  async function handleSearchDrive() {
    if (!driveSearchQuery.trim()) return;
    try {
      const opts = driveFilter ? { mimeType: driveFilter } : {};
      const result = await electronAPI.reqAnalyzerSearchDriveFiles(driveSearchQuery, opts);
      if (result.success) {
        setDriveFiles(result.files || []);
      }
    } catch (e) {
      showToast(`搜索 Drive 失败: ${e.message}`, 'error');
    }
  }

  async function handleDownloadDriveFile(fileId) {
    try {
      const result = await electronAPI.reqAnalyzerReadDriveFile(fileId);
      if (result.success) {
        setLocalFileData(result);
        showToast(`文件下载成功: ${result.fileName}`, 'success');
      } else {
        showToast(`下载文件失败: ${result.error}`, 'error');
      }
    } catch (e) {
      showToast(`下载文件失败: ${e.message}`, 'error');
    }
  }

  async function handleBrowseDrive() {
    try {
      const result = await electronAPI.reqAnalyzerListDriveRootFolders();
      if (result.success) {
        const folders = result.folders || [];
        setDriveRootData({
          my: folders.filter(f => !f.isSharedDrive && !f.isSharedWithMe),
          shared: folders.filter(f => f.isSharedWithMe),
          drives: folders.filter(f => f.isSharedDrive),
        });
        setDriveTreeNodes(new Map());
        setDriveCategoryExpanded({ my: false, shared: false, drives: false });
      } else {
        showToast(`获取 Drive 文件夹失败: ${result.error}`, 'error');
      }
    } catch (e) {
      showToast(`获取 Drive 文件夹失败: ${e.message}`, 'error');
    }
  }

  function handleToggleDriveCategory(key) {
    setDriveCategoryExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleToggleDriveTreeNode(nodeId, nodeData) {
    const newNodes = new Map(driveTreeNodes);

    if (newNodes.has(nodeId) && newNodes.get(nodeId).expanded) {
      // 折叠：保留缓存但标记未展开
      const existing = newNodes.get(nodeId);
      newNodes.set(nodeId, { ...existing, expanded: false });
      setDriveTreeNodes(newNodes);
      return;
    }

    // 已缓存 children，直接展开
    if (newNodes.has(nodeId) && newNodes.get(nodeId).children) {
      const existing = newNodes.get(nodeId);
      newNodes.set(nodeId, { ...existing, expanded: true });
      setDriveTreeNodes(newNodes);
      return;
    }

    // 未缓存，加载 children
    try {
      let result;
      if (nodeData.isSharedDrive) {
        result = await electronAPI.reqAnalyzerBrowseSharedDriveRoot(nodeId);
      } else {
        const opts = nodeData.driveId ? { driveId: nodeData.driveId } : {};
        result = await electronAPI.reqAnalyzerListDriveFolderFiles(nodeId, opts);
      }

      if (result.success) {
        const children = (result.files || []).map(f => ({
          ...f,
          driveId: nodeData.isSharedDrive ? nodeId : (nodeData.driveId || null),
        }));
        newNodes.set(nodeId, {
          children,
          expanded: true,
          driveId: nodeData.isSharedDrive ? nodeId : (nodeData.driveId || null),
        });
        setDriveTreeNodes(newNodes);
      } else {
        showToast(`加载文件夹内容失败: ${result.error}`, 'error');
      }
    } catch (e) {
      showToast(`加载文件夹内容失败: ${e.message}`, 'error');
    }
  }

  // ============================================
  // Tab 3: Figma
  // ============================================
  async function handleListFigmaLayers() {
    if (!figmaUrl.trim()) {
      showToast('请输入 Figma URL（需包含 node-id）', 'warning');
      return;
    }
    if (!figmaToken.trim()) {
      showToast('请输入 Figma Token', 'warning');
      return;
    }
    setIsFigmaLayersLoading(true);
    const session = sessionRef.current;
    try {
      const setTokenResult = await electronAPI.reqAnalyzerSetFigmaToken(figmaToken);
      const result = await electronAPI.reqAnalyzerListFigmaPages(figmaUrl);
      if (sessionRef.current !== session) return;
      if (result.success) {
        setFigmaLayers(result.layers || []);
        setFigmaNodeId(result.nodeId || '');
        setFigmaNodeName(result.nodeName || '');
        setSelectedLayerIds(result.layers.map(l => l.id)); // 默认全选
        showToast(`找到 ${result.layers.length} 个 Layer（节点: ${result.nodeName || result.nodeId}）`, 'success');
      } else {
        showToast(`获取 Layer 列表失败: ${result.error || '未知错误'}`, 'error');
      }
    } catch (e) {
      if (sessionRef.current !== session) return;
      showToast(`获取 Layer 列表失败: ${e.message}`, 'error');
    }
    if (sessionRef.current === session) setIsFigmaLayersLoading(false);
  }

  async function handleExtractFigma() {
    if (!figmaUrl.trim()) {
      showToast('请输入 Figma URL（需包含 node-id）', 'warning');
      return;
    }
    setIsFigmaLoading(true);
    const session = sessionRef.current;
    try {
      if (figmaToken) {
        await electronAPI.reqAnalyzerSetFigmaToken(figmaToken);
      }
      // 如果有 Layer 选择，传递选中的 Layer ID；否则为 null（提取整个 node-id）
      const layerIds = selectedLayerIds.length > 0 && selectedLayerIds.length < figmaLayers.length
        ? selectedLayerIds
        : null;
      const result = await electronAPI.reqAnalyzerExtractFigmaRequirements(figmaUrl, null, layerIds);
      if (sessionRef.current !== session) return;
      if (result.success) {
        setFigmaData(result);
        showToast('Figma 需求提取成功', 'success');
        if (autoNextStep) setActiveTab('analyze');
      } else {
        showToast(`Figma 提取失败: ${result.error || '未知错误'}`, 'error');
      }
    } catch (e) {
      if (sessionRef.current !== session) return;
      showToast(`Figma 提取失败: ${e.message}`, 'error');
    }
    if (sessionRef.current === session) setIsFigmaLoading(false);
  }

  // ============================================
  // Tab 3: AI 分析
  // ============================================
  async function handleAnalyze() {
    if (!requirementName.trim()) {
      showToast('请先输入或选择需求名称', 'warning');
      setActiveTab('sources');
      return;
    }

    setIsAnalyzing(true);
    const session = sessionRef.current;
    setStreamingText('');
    setAnalysisProgress({ step: 'start', message: '开始分析...', percent: 0 });
    try {
      await electronAPI.reqAnalyzerSetCurrentRequirement(requirementName);

      const allData = {
        sheetsData: sheetsData?.data || [],
        figmaRequirements: figmaData?.requirements || null,
        figmaDesignSpecs: figmaData?.designSpecs || null,
        localFileData: localFileData ? { ...localFileData, selectedPages: Array.from(selectedPages) } : null,
        confirmedIssues: confirmedIssues?.data || [],
        language: requirementLanguage,
      };

      // 直接调用非流式分析（兼容性更广）
      const result = await electronAPI.reqAnalyzerAnalyzeRequirements(allData);
      if (sessionRef.current !== session) return;
      if (result.questionList) {
        setQuestionList(result.questionList);
        showToast(`分析完成: 发现 ${result.questionList.length} 个问题`, 'info');
        if (autoNextStep && result.questionList.length > 0) setActiveTab('refine');
      } else if (result.error) {
        showToast(`分析失败: ${result.error}`, 'error');
      }
    } catch (e) {
      if (sessionRef.current !== session) return;
      showToast(`分析失败: ${e.message}`, 'error');
    }
    if (sessionRef.current === session) {
      setIsAnalyzing(false);
      setAnalysisProgress(null);
    }
  }

  async function handleWriteQuestions() {
    if (!questionSheetUrl.trim()) {
      showToast('请输入问题清单写入的 Sheets URL', 'warning');
      return;
    }
    try {
      const result = await electronAPI.reqAnalyzerWriteQuestionList(
        questionSheetUrl, questionList, requirementName, requirementLanguage
      );
      if (result.success) {
        setQuestionsWritten(true);
        showToast(`问题清单已写入 Sheet: ${result.sheetName}，共 ${result.rowsWritten} 个问题。请在 Google Sheets 中填写回复后回来继续。`, 'success', 5000);
      } else {
        showToast(`写入失败: ${result.error}`, 'error');
      }
    } catch (e) {
      showToast(`写入失败: ${e.message}`, 'error');
    }
  }

  // ============================================
  // Tab 4: 回复 & 完善
  // ============================================
  async function handleReadReplies() {
    const url = repliesSheetUrl || questionSheetUrl;
    if (!url.trim()) {
      showToast('请输入问题 Sheet URL', 'warning');
      return;
    }
    setIsReadingReplies(true);
    try {
      const result = await electronAPI.reqAnalyzerReadQuestionReplies(url, requirementName);
      if (result.success) {
        setRepliesData(result);
        showToast(`读取回复: ${result.repliedQuestions}/${result.totalQuestions} 已回复`, 'success');
      } else {
        showToast(`读取回复失败: ${result.error}`, 'error');
      }
    } catch (e) {
      showToast(`读取回复失败: ${e.message}`, 'error');
    }
    setIsReadingReplies(false);
  }

  async function handleRefine() {
    if (!questionList.length || !repliesData) {
      showToast('请先读取问题回复', 'warning');
      return;
    }
    setIsRefining(true);
    const session = sessionRef.current;
    try {
      const allData = {
        sheetsData: sheetsData?.data || [],
        figmaRequirements: figmaData?.requirements || null,
        figmaDesignSpecs: figmaData?.designSpecs || null,
        localFileData: localFileData ? { ...localFileData, selectedPages: Array.from(selectedPages) } : null,
        confirmedIssues: confirmedIssues?.data || [],
        language: requirementLanguage,
      };
      const result = await electronAPI.reqAnalyzerRefineRequirements(
        questionList,
        repliesData.data || [],
        allData,
        confirmedIssues?.data || [],
        requirementLanguage
      );
      if (sessionRef.current !== session) return;
      setRefinedRequirements(result);
      setIterationCount(prev => prev + 1);
      showToast('需求完善完成', 'success');
      if (autoNextStep) setActiveTab('execute');
    } catch (e) {
      if (sessionRef.current !== session) return;
      showToast(`需求完善失败: ${e.message}`, 'error');
    }
    if (sessionRef.current === session) setIsRefining(false);
  }

  async function handleCheckNewIssues() {
    if (!refinedRequirements) {
      showToast('请先完善需求', 'warning');
      return;
    }
    try {
      const result = await electronAPI.reqAnalyzerAnalyzeRequirements({
        refinedRequirements: refinedRequirements,
        confirmedIssues: confirmedIssues?.data || [],
      });
      if (result.questionList && result.questionList.length > 0) {
        setNewIssuesCheck({
          hasNewIssues: true,
          newQuestionList: result.questionList,
          message: `发现 ${result.questionList.length} 个新的不清晰之处`,
        });
      } else {
        setNewIssuesCheck({
          hasNewIssues: false,
          message: '需求已完整，可以保存',
        });
      }
    } catch (e) {
      showToast(`检查失败: ${e.message}`, 'error');
    }
  }

  // ============================================
  // Tab 5: 一键执行 + 保存
  // ============================================
  async function handleFullExecute() {
    if (!requirementName.trim()) {
      showToast('请输入需求名称', 'warning');
      return;
    }
    if (!sheetsData?.data?.length && !localFileData && !figmaData?.requirements?.length) {
      showToast('请先在来源 Tab 加载至少一种需求数据（Sheets/本地文件/Figma）', 'warning');
      return;
    }

    setIsExecuting(true);
    setExecuteProgress({ step: 'start', message: '开始执行...', percent: 0 });
    const session = sessionRef.current;
    try {
      await electronAPI.reqAnalyzerSetCurrentRequirement(requirementName);

      const allData = {
        sheetsData: sheetsData?.data || [],
        figmaRequirements: figmaData?.requirements || null,
        figmaDesignSpecs: figmaData?.designSpecs || null,
        localFileData: localFileData ? { ...localFileData, selectedPages: Array.from(selectedPages) } : null,
        confirmedIssues: confirmedIssues?.data || [],
        language: requirementLanguage,
      };

      const result = await electronAPI.reqAnalyzerExecuteFullPipeline(allData, allData.confirmedIssues);
      if (sessionRef.current !== session) return;
      if (result.error) {
        showToast(`执行失败: ${result.error}`, 'error');
        setIsExecuting(false);
        return;
      }

      if (result.success && result.requirements) {
        // 完整流程成功，直接得到需求文件
        setRefinedRequirements(result.requirements);
        setQuestionList([]);
        setNewIssuesCheck({ hasNewIssues: false, message: result.message || '需求已完整，可以保存' });
        if (result.autoCompleted) {
          showToast(result.message || '需求已通过自动推断完善', 'success');
        }
      } else if (result.needsMoreInfo && result.questionList) {
        // 需要人工介入，显示问题清单
        setQuestionList(result.questionList);
        setNewIssuesCheck({
          hasNewIssues: true,
          message: result.message || `需求中有 ${result.questionList.length} 个不清晰之处`,
        });
        showToast(result.message || '需要人工回复问题后才能完善需求', 'info');
      } else {
        showToast('执行完成但未生成有效结果', 'warning');
      }
    } catch (e) {
      if (sessionRef.current !== session) return;
      showToast(`一键执行失败: ${e.message}`, 'error');
    }
    if (sessionRef.current === session) setIsExecuting(false);
  }

  // 解析 refinedRequirements 中的 ## 章节
  function parseSectionsFromContent(content) {
    if (!content) return [];
    // 按 ## 拆分，但保留 # 级标题（如文档标题）作为第一个章节
    const lines = content.split('\n');
    const sections = [];
    let currentSection = { title: '', content: '', index: 0 };

    for (const line of lines) {
      if (line.startsWith('## ') && !line.startsWith('### ')) {
        // 遇到新的 ## 级标题，保存上一个章节，开始新章节
        if (currentSection.content.trim()) {
          sections.push({ ...currentSection });
        }
        currentSection = {
          title: line.replace(/^## /, '').trim(),
          content: line + '\n',
          index: sections.length,
        };
      } else {
        currentSection.content += line + '\n';
      }
    }
    // 最后一个章节
    if (currentSection.content.trim()) {
      // 如果第一个章节没有 ## 标题（如 # 文档标题），给它一个特殊标记
      if (!currentSection.title && currentSection.content.startsWith('# ')) {
        const titleMatch = currentSection.content.match(/^# (.+)\n/);
        currentSection.title = titleMatch ? titleMatch[1].trim() : '文档标题';
      }
      sections.push({ ...currentSection });
    }
    return sections;
  }

  // 当 refinedRequirements 变化时，解析章节并默认全选
  useEffect(() => {
    if (!refinedRequirements) {
      setParsedSections([]);
      setSelectedSections(new Set());
      return;
    }
    let content = '';
    if (typeof refinedRequirements === 'string') {
      content = refinedRequirements;
    } else if (refinedRequirements.content) {
      content = refinedRequirements.content;
    } else {
      content = JSON.stringify(refinedRequirements, null, 2);
    }
    const sections = parseSectionsFromContent(content);
    setParsedSections(sections);
    setSelectedSections(new Set(sections.map((_, i) => i)));
  }, [refinedRequirements]);

  async function handleSave() {
    if (!requirementName.trim()) {
      showToast('请输入需求名称', 'warning');
      return;
    }
    if (!refinedRequirements) {
      showToast('请先完善需求或一键执行', 'warning');
      return;
    }
    if (selectedSections.size === 0) {
      showToast('请至少选择一个章节', 'warning');
      return;
    }

    // 生成完整内容
    let content = '';
    if (typeof refinedRequirements === 'string') {
      content = refinedRequirements;
    } else if (refinedRequirements.content) {
      content = refinedRequirements.content;
    } else {
      content = JSON.stringify(refinedRequirements, null, 2);
    }

    try {
      // 合并选中章节为一个完整文档
      const sections = parseSectionsFromContent(content);
      const mergedContent = sections
        .filter(s => selectedSections.has(s.index))
        .map(s => s.content.trim())
        .join('\n\n');

      const result = await electronAPI.reqAnalyzerSaveRequirementFile(mergedContent, requirementName, 'need.txt');
      if (result.success) {
        setSaveResult(result);
        showToast(`需求文件已保存到: ${result.filePath}`, 'success', 5000);
        loadSavedFiles();
      } else {
        showToast(`保存失败: ${result.error}`, 'error');
      }
    } catch (e) {
      showToast(`保存失败: ${e.message}`, 'error');
    }
  }

  // 加载已保存的文件列表
  async function loadSavedFiles() {
    try {
      const files = await electronAPI.reqAnalyzerListSavedFiles();
      setSavedFiles(files || []);
    } catch (e) {
      setSavedFiles([]);
    }
  }

  // 删除已保存的文件
  async function handleDeleteSavedFile(name) {
    try {
      const result = await electronAPI.reqAnalyzerDeleteSavedFile(name);
      if (result.success) {
        showToast(`已删除: ${name}`, 'success');
        setSaveResult(null);
        setRefinedRequirements(null);
        await loadSavedFiles();
      } else {
        showToast(`删除失败: ${result.error}`, 'error');
      }
    } catch (e) {
      showToast(`删除失败: ${e.message}`, 'error');
    }
  }

  // ============================================
  // Tab 7: 设置
  // ============================================
  async function handleSaveConfig() {
    try {
      await electronAPI.reqAnalyzerUpdateConfig({
        google: {
          clientSecret: googleClientSecret,
        },
        sheets: {
          requirementSheetUrl: sheetsUrl,
          questionSheetUrl: questionSheetUrl,
          confirmedIssuesSheetUrl: confirmedIssuesUrl,
        },
        figma: {
          accessToken: figmaToken,
          defaultUrl: figmaUrl,
        },
      });
      showToast('配置已保存', 'success');
      await loadConfig();
    } catch (e) {
      showToast(`保存配置失败: ${e.message}`, 'error');
    }
  }

  // 需求名称处理
  // 重置所有数据状态（切换/清空需求名时调用）
  function resetDataStates() {
    setSheetsData(null);
    setLocalFileData(null);
    setSelectedPages(new Set());
    setFigmaData(null);
    setFigmaLayers([]);
    setSelectedLayerIds([]);
    setFigmaNodeId('');
    setFigmaNodeName('');
    setConfirmedIssues(null);
    setQuestionList([]);
    setQuestionSheetUrl('');
    setRepliesData(null);
    setRefinedRequirements(null);
    setIterationCount(1);
    setNewIssuesCheck(null);
    setQuestionsWritten(false);
    setRequirementNameSuggestions([]);
  }

  async function handleSelectRequirement(name) {
    setRequirementName(name);
    setIsNewRequirement(false);
    // 先重置，再加载新需求的数据
    resetDataStates();
    try {
      await electronAPI.reqAnalyzerSetCurrentRequirement(name);
      // 加载缓存数据
      const cached = await electronAPI.reqAnalyzerLoadCachedData(name);
      if (cached) {
        if (cached.sheetsData) setSheetsData(cached.sheetsData);
        if (cached.localFileData) {
          setLocalFileData(cached.localFileData);
          // 恢复页面选择状态
          if (cached.localFileData.pages && cached.localFileData.pages.length > 0) {
            const restored = cached.localFileData.selectedPages
              ? new Set(cached.localFileData.selectedPages)
              : new Set(cached.localFileData.pages.map(p => p.pageNum));
            setSelectedPages(restored);
          }
        }
        if (cached.figmaData) setFigmaData(cached.figmaData);
        if (cached.confirmedIssues) setConfirmedIssues(cached.confirmedIssues);
        if (cached.questionList) setQuestionList(cached.questionList);
        if (cached.replies) setRepliesData(cached.replies);
        if (cached.refinedRequirements) setRefinedRequirements(cached.refinedRequirements);
        if (cached.meta?.currentIteration) setIterationCount(cached.meta.currentIteration);
        // 根据缓存数据自动跳转到进度对应的Tab
        const nextTab = determineProgressTab(cached);
        if (nextTab && nextTab !== 'auth') {
          setActiveTab(nextTab);
        }
      }
    } catch (e) {
      console.warn('加载缓存数据失败:', e.message);
    }
  }

  // 根据缓存数据推断当前进度对应的Tab
  function determineProgressTab(cached) {
    if (cached.refinedRequirements) return 'execute';
    if (cached.questionList?.length > 0) return 'refine';
    if (cached.figmaData || cached.sheetsData || cached.localFileData) return 'analyze';
    return 'sources';
  }

  // 加载缓存恢复
  async function handleRestoreFromCache() {
    if (!requirementName.trim()) {
      showToast('请先输入需求名称', 'warning');
      return;
    }
    await handleSelectRequirement(requirementName);
  }

  // ============================================
  // 渲染
  // ============================================

  const tabs = [
    { key: 'auth', label: '认证', icon: '1', done: googleAuthStatus.isAuthenticated, isStep: true },
    { key: 'sources', label: '来源', icon: '2', done: !!sheetsData || !!localFileData || !!confirmedIssues || !!figmaData, isStep: true },
    { key: 'analyze', label: '分析', icon: '3', done: questionsWritten, isStep: true },
    { key: 'refine', label: '完善', icon: '4', done: !!refinedRequirements, isStep: true },
    { key: 'execute', label: '保存', icon: '5', done: !!saveResult, isStep: true },
    { key: 'settings', label: '设置', icon: '⚙', isStep: false },
  ];

  if (!isOpen) return null;

  return (
    <div className="req-analyzer-modal-overlay">
      {/* Toast 通知 */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          duration={toast.duration}
          onClose={() => setToast(null)}
        />
      )}
      <div className="req-analyzer-modal">
        <div className="req-analyzer-modal-header">
          <h2>需求分析整理</h2>
          <button onClick={onClose} className="req-analyzer-close-btn">
            <svg className="req-analyzer-close-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 需求名称输入行 */}
        <div className="req-analyzer-requirement-row">
          <div className="req-analyzer-combobox">
            <div className="req-analyzer-clearable-input">
              <input
                type="text"
                value={requirementName}
                onChange={(e) => {
                  const val = e.target.value;
                  setRequirementName(val);
                  setIsNewRequirement(true);
                  if (val.trim()) {
                    const match = existingRequirements.find(r => r.name === val);
                    if (match) {
                      setIsNewRequirement(false);
                    }
                  }
                  // 清空需求名时重置所有数据状态
                  if (!val.trim()) {
                    resetDataStates();
                  }
                }}
                placeholder="输入需求名称或搜索已有需求..."
                className="req-analyzer-input-wide"
                onFocus={() => setShowRequirementDropdown(true)}
                onBlur={() => setTimeout(() => setShowRequirementDropdown(false), 200)}
              />
              {requirementName && (
                <button
                  className="req-analyzer-clear-btn"
                  onClick={() => {
                    setRequirementName('');
                    setIsNewRequirement(true);
                    resetDataStates();
                  }}
                  title="清空"
                >
                  ×
                </button>
              )}
            </div>
            {showRequirementDropdown && existingRequirements.length > 0 && (
              <div className="req-analyzer-dropdown">
                {existingRequirements
                  .filter(r => !requirementName || r.name.includes(requirementName))
                  .map(r => (
                    <div
                      key={r.name}
                      className="req-analyzer-dropdown-item"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleSelectRequirement(r.name);
                        setShowRequirementDropdown(false);
                      }}
                    >
                      {r.name}
                      <span className="req-analyzer-dropdown-item-date">{r.lastModified || ''}</span>
                    </div>
                  ))
                }
              </div>
            )}
          </div>
          {/* 删除需求按钮 */}
          {!isNewRequirement && requirementName && (
            <button
              onClick={async () => {
                try {
                  await electronAPI.reqAnalyzerDeleteRequirement(requirementName);
                  showToast(`需求 "${requirementName}" 已删除`, 'success');
                  setRequirementName('');
                  setIsNewRequirement(true);
                  await loadRequirementsList();
                } catch (e) {
                  showToast(`删除失败: ${e.message}`, 'error');
                }
              }}
              className="req-analyzer-btn-sm req-analyzer-btn-danger-sm"
              title="删除此需求的所有缓存数据"
            >
              删除
            </button>
          )}
          {/* 输出语言选择 */}
          <select
            value={requirementLanguage}
            onChange={(e) => setRequirementLanguage(e.target.value)}
            className="req-analyzer-lang-select"
            title="分析结果输出语言"
          >
            <option value="zh-TW">繁体中文</option>
            <option value="zh-CN">简体中文</option>
            <option value="en">English</option>
          </select>
        </div>

        {/* 步骤进度条 + 自动推进toggle */}
        <div className="req-analyzer-progress-track-wrapper">
          <div className="req-analyzer-progress-track">
            {tabs.filter(t => t.isStep).map(tab => (
              <div
                key={tab.key}
                className={`req-analyzer-progress-step ${tab.done ? 'completed' : activeTab === tab.key ? 'current' : ''}`}
              />
            ))}
          </div>
          <button
            onClick={() => setAutoNextStep(!autoNextStep)}
            className={`req-analyzer-btn-sm ${autoNextStep ? 'req-analyzer-auto-on' : 'req-analyzer-auto-off'}`}
            title="完成后自动跳到下一步"
          >
            {autoNextStep ? '自动推进 ✓' : '手动推进'}
          </button>
        </div>

        <div className="req-analyzer-tab-bar">
          {tabs.map(tab => (
            <button
              key={tab.key}
              className={`req-analyzer-tab ${activeTab === tab.key ? 'active' : ''} ${tab.done ? 'done' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              <span className="req-analyzer-tab-icon">{tab.icon}</span> {tab.label}
              {tab.done && <span className="req-analyzer-tab-done">✓</span>}
            </button>
          ))}
        </div>

        <div className="req-analyzer-tab-content">
          {/* Tab 1: Google 登录 */}
          {activeTab === 'auth' && (
            <div className="req-analyzer-auth-tab">
              <h3>Google 账号登录</h3>
              <p className="req-analyzer-desc">登录 Google 账号后可访问 Google Sheets 和 Drive 文件</p>
              <p className="req-analyzer-permissions">需要权限：Sheets 读写 + Drive 只读</p>

              {googleAuthStatus.isAuthenticated ? (
                <div className="req-analyzer-auth-success">
                  <p>✓ 已登录: {googleAuthStatus.email || '(已认证)'}</p>
                  <button onClick={handleGoogleRevoke} className="req-analyzer-btn-danger">退出登录</button>
                </div>
              ) : (
                <button
                  onClick={handleGoogleAuth}
                  disabled={isAuthLoading}
                  className="req-analyzer-btn-primary"
                >
                  {isAuthLoading ? '登录中...' : '登录 Google 账号'}
                </button>
              )}
            </div>
          )}

          {/* Tab 2: 需求来源 */}
          {activeTab === 'sources' && (
            <div className="req-analyzer-sources-tab">
              {!isNewRequirement && requirementName && (
                <button onClick={handleRestoreFromCache} className="req-analyzer-btn-secondary" style={{marginBottom: '1rem'}}>
                  从缓存恢复上次数据
                </button>
              )}

              {/* Sheets 区块 */}
              <div className="req-analyzer-section">
                <h4>Google Sheets 需求文档</h4>
                <div className="req-analyzer-url-input">
                  <ClearableInput
                    value={sheetsUrl}
                    onChange={(e) => setSheetsUrl(e.target.value)}
                    placeholder="输入 Google Sheets URL..."
                  />
                  <button
                    onClick={handleReadRequirementSheets}
                    disabled={!googleAuthStatus.isAuthenticated}
                    className="req-analyzer-btn-primary"
                  >
                    读取
                  </button>
                </div>
                <p className="req-analyzer-hint">
                  请先在浏览器中点击 Sheet 底部的「需求描述」tab，再复制地址栏完整 URL（含 gid 参数），以确保读取正确的 Sheet 页。
                </p>
                {sheetsData && (
                  <div className="req-analyzer-data-preview">
                    <div className="req-analyzer-preview-header">
                      <p>✓ 读取成功：{sheetsData.totalRows} 条需求，{sheetsData.columns?.length || 0} 列</p>
                      <select value={tableMaxRows} onChange={(e) => setTableMaxRows(Number(e.target.value))} className="req-analyzer-row-select">
                        <option value={10}>10行</option>
                        <option value={20}>20行</option>
                        <option value={50}>50行</option>
                        <option value={9999}>全部</option>
                      </select>
                    </div>
                    <div className="req-analyzer-table-scroll">
                      <table className="req-analyzer-preview-table">
                        <thead>
                          <tr>{(sheetsData.columns || []).map(c => <th key={c}>{c}</th>)}</tr>
                        </thead>
                        <tbody>
                          {(sheetsData.data || []).slice(0, tableMaxRows).map((row, i) => (
                            <tr key={i}>{(sheetsData.columns || []).map((c, j) => {
                              const val = String(row[c] || row[c.toLowerCase()] || '');
                              return <td key={j} title={val}>{val.length > 60 ? val.substring(0, 60) + '...' : val}</td>;
                            })}</tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {/* 推断需求名称建议 */}
              {requirementNameSuggestions.length > 0 && (
                <div className="req-analyzer-section">
                  <h4>推断的需求名称</h4>
                  <p className="req-analyzer-desc">基于 Sheets 数据的"模块"列自动推断</p>
                  <div className="req-analyzer-suggestions">
                    {requirementNameSuggestions.map(s => (
                      <button
                        key={s.name}
                        onClick={() => {
                          setRequirementName(s.name);
                          setIsNewRequirement(true);
                        }}
                        className="req-analyzer-btn-secondary"
                        style={{ marginRight: '8px', marginBottom: '4px' }}
                      >
                        {s.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 已确认问题区块 */}
              <div className="req-analyzer-section">
                <h4>共通需求（优先级高于需求）</h4>
                <div className="req-analyzer-url-input">
                  <ClearableInput
                    value={confirmedIssuesUrl}
                    onChange={(e) => setConfirmedIssuesUrl(e.target.value)}
                    placeholder="输入共通需求 Sheets URL..."
                  />
                  <button onClick={handleReadConfirmedIssues} className="req-analyzer-btn-primary">读取</button>
                </div>
                <p className="req-analyzer-hint">
                  当共通需求与需求描述冲突时，以共通需求为准。请先在浏览器中点击 Sheet 底部对应的 tab，再复制地址栏完整 URL（含 gid 参数）。如果没有共通需求清单，可跳过此步骤。
                </p>
                {confirmedIssues && (
                  <p>✓ 已读取: 共 {confirmedIssues.totalIssues} 条数据，共通需求 {confirmedIssues.confirmedIssues} 条</p>
                )}
              </div>

              {/* Drive 区块 */}
              {googleAuthStatus.isAuthenticated && (
                <div className="req-analyzer-section">
                  <h4>Google Drive 文件</h4>
                  <div className="req-analyzer-drive-mode">
                    <select
                      value={driveMode}
                      onChange={(e) => {
                        const newMode = e.target.value;
                        setDriveMode(newMode);
                        // 切换到浏览模式时自动加载文件夹
                        if (newMode === 'browse') handleBrowseDrive();
                        // 切换模式时清空之前的搜索结果
                        if (newMode === 'search') setDriveRootData({ my: [], shared: [], drives: [] });
                        setDriveTreeNodes(new Map());
                        setDriveCategoryExpanded({ my: false, shared: false, drives: false });
                        setDriveFiles([]);
                      }}
                      className="req-analyzer-row-select"
                    >
                      <option value="search">搜索模式</option>
                      <option value="browse">浏览模式</option>
                    </select>
                    {driveMode === 'search' && (
                      <select
                        value={driveFilter}
                        onChange={(e) => setDriveFilter(e.target.value)}
                        className="req-analyzer-row-select"
                      >
                        <option value="">全部类型</option>
                        <option value="pdf">PDF</option>
                        <option value="docx">DOCX</option>
                        <option value="xlsx">XLSX</option>
                        <option value="sheet">Google Sheets</option>
                        <option value="doc">Google Docs</option>
                      </select>
                    )}
                  </div>

                  {driveMode === 'search' ? (
                    <div className="req-analyzer-url-input">
                      <ClearableInput
                        value={driveSearchQuery}
                        onChange={(e) => setDriveSearchQuery(e.target.value)}
                        placeholder="搜索文件..."
                      />
                      <button onClick={handleSearchDrive} className="req-analyzer-btn-secondary">搜索</button>
                    </div>
                  ) : (
                    <div className="req-analyzer-drive-browser">
                      {[
                        { key: 'my', label: '我的 Drive', icon: '📁', items: driveRootData.my },
                        { key: 'shared', label: '与我共享', icon: '📂', items: driveRootData.shared },
                        { key: 'drives', label: '共享 Drive', icon: '🗄️', items: driveRootData.drives },
                      ].map(cat => (
                        <div key={cat.key} className="req-analyzer-drive-category">
                          <div className="req-analyzer-category-header" onClick={() => handleToggleDriveCategory(cat.key)}>
                            <span className="req-analyzer-tree-toggle">{driveCategoryExpanded[cat.key] ? '▼' : '▶'}</span>
                            <span>{cat.icon} {cat.label}</span>
                            <span className="req-analyzer-file-type">{cat.items.length} 个</span>
                          </div>
                          {driveCategoryExpanded[cat.key] && cat.items.map(item => (
                            <DriveTreeNode
                              key={item.id}
                              node={item}
                              treeNodes={driveTreeNodes}
                              onToggle={handleToggleDriveTreeNode}
                              onDownload={handleDownloadDriveFile}
                              depth={1}
                            />
                          ))}
                        </div>
                      ))}
                    </div>
                  )}

                  {driveFiles.length > 0 && driveMode === 'search' && (
                    <div className="req-analyzer-file-list">
                      {driveFiles.map(f => (
                        <div key={f.id} className="req-analyzer-file-item" onClick={() => handleDownloadDriveFile(f.id)}>
                          <span>📄 {f.name}</span>
                          <span className="req-analyzer-file-type">{f.type === 'download' ? 'download' : f.type}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 本地文件区块 */}
              <div className="req-analyzer-section">
                <h4>本地文件</h4>
                <p className="req-analyzer-desc">支持 PDF、DOCX、XLSX、TXT、MD 格式</p>
                <button onClick={handleSelectLocalFile} className="req-analyzer-btn-secondary">选择文件</button>
                {localFileData && (
                  <div>
                    <p>✓ 已加载: {localFileData.fileName} ({localFileData.fileType})</p>
                    {localFileData.pages && localFileData.pages.length > 1 && (
                      <div className="req-analyzer-page-selector">
                        <h4>选择要分析的页面</h4>
                        <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
                          <button onClick={() => setSelectedPages(new Set(localFileData.pages.map(p => p.pageNum)))} className="req-analyzer-btn-secondary" style={{ fontSize: '12px' }}>
                            全选
                          </button>
                          <button onClick={() => setSelectedPages(new Set())} className="req-analyzer-btn-secondary" style={{ fontSize: '12px' }}>
                            清除
                          </button>
                        </div>
                        {localFileData.pages.map(page => (
                          <label key={page.pageNum} className="req-analyzer-page-item">
                            <input type="checkbox"
                              checked={selectedPages.has(page.pageNum)}
                              onChange={() => {
                                const newSet = new Set(selectedPages);
                                if (newSet.has(page.pageNum)) newSet.delete(page.pageNum);
                                else newSet.add(page.pageNum);
                                setSelectedPages(newSet);
                              }}
                            />
                            第{page.pageNum}页: {page.title} ({page.charCount}字)
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Figma 设计需求 */}
              <div className="req-analyzer-section">
                <h4>Figma 设计需求提取</h4>
                <div className="req-analyzer-form-group">
                  <label>Figma URL:</label>
                  <ClearableInput
                    value={figmaUrl}
                    onChange={(e) => {
                      setFigmaUrl(e.target.value);
                    }}
                    onClear={() => {
                      setFigmaLayers([]);
                      setSelectedLayerIds([]);
                      setFigmaNodeId('');
                      setFigmaNodeName('');
                    }}
                    placeholder="https://www.figma.com/design/..."
                  />
                </div>
                <div className="req-analyzer-form-group">
                  <label>Figma Token (Personal Access Token):</label>
                  <div className="req-analyzer-token-input">
                    <ClearableInput
                      type={showFigmaToken ? 'text' : 'password'}
                      value={figmaToken}
                      onChange={(e) => setFigmaToken(e.target.value)}
                      placeholder="粘贴 Figma Personal Access Token..."
                    />
                    <button onClick={() => setShowFigmaToken(!showFigmaToken)} className="req-analyzer-btn-sm">
                      {showFigmaToken ? '🔒' : '👁️'}
                    </button>
                  </div>
                  <p className="req-analyzer-hint">
                    获取方式: Figma → Main Menu(左上角icon) → Help and account → Account settings → Security(顶部tab最后一项) → Personal access tokens → Generate new token
                  </p>
                </div>

                {/* 列出 Layer 按钮 */}
                {isFigmaLayersLoading ? (
                  <Spinner text="正在获取节点内容..." />
                ) : (
                  <button
                    onClick={handleListFigmaLayers}
                    disabled={!figmaUrl.trim() || !figmaToken.trim()}
                    className="req-analyzer-btn-secondary"
                  >
                    列出节点内容
                  </button>
                )}
                <p className="req-analyzer-hint">
                  请从 Figma 中右键点击某个 Frame → 复制链接，确保 URL 包含 node-id 参数。点击此按钮可列出该节点内的所有子 Layer。
                </p>

                {/* Layer 选择列表 */}
                {figmaLayers.length > 0 && (
                  <div className="req-analyzer-page-selector">
                    <div className="req-analyzer-page-selector-header">
                      <span>节点「{figmaNodeName || figmaNodeId}」的 Layer ({selectedLayerIds.length}/{figmaLayers.length} 已选中)</span>
                      <div className="req-analyzer-page-selector-actions">
                        <button
                          onClick={() => setSelectedLayerIds(figmaLayers.map(l => l.id))}
                          className="req-analyzer-btn-sm req-analyzer-page-select-all"
                        >
                          全选
                        </button>
                        <button
                          onClick={() => setSelectedLayerIds([])}
                          className="req-analyzer-btn-sm req-analyzer-page-select-none"
                        >
                          取消全选
                        </button>
                      </div>
                    </div>
                    <div className="req-analyzer-page-list">
                      {figmaLayers.map(layer => (
                        <label key={layer.id} className="req-analyzer-page-item">
                          <input
                            type="checkbox"
                            checked={selectedLayerIds.includes(layer.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedLayerIds(prev => [...prev, layer.id]);
                              } else {
                                setSelectedLayerIds(prev => prev.filter(id => id !== layer.id));
                              }
                            }}
                          />
                          <span className="req-analyzer-page-name">{layer.name}</span>
                          <span className="req-analyzer-page-count">{layer.type} · {layer.childrenCount} 子元素</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* 提取需求按钮 */}
                <div style={{ marginTop: '20px' }}>
                {isFigmaLoading ? (
                  <Spinner text="正在从 Figma 提取需求..." />
                ) : (
                  <button
                    onClick={handleExtractFigma}
                    disabled={!figmaUrl.trim() || (figmaLayers.length > 0 && selectedLayerIds.length === 0)}
                    className="req-analyzer-btn-primary"
                  >
                    {figmaLayers.length > 0 && selectedLayerIds.length < figmaLayers.length
                      ? `提取选中 ${selectedLayerIds.length} 个 Layer 需求`
                      : '提取此节点全部需求'}
                  </button>
                )}
                </div>
                {figmaData && figmaData.requirements && (
                  <div className="req-analyzer-figma-results">
                    <h4>提取结果</h4>
                    <div className="req-analyzer-figma-categories">
                      <p>页面/模块: {figmaData.requirements.pages?.length || 0}</p>
                      <p>UI 元素: {figmaData.requirements.uiElements?.length || 0}</p>
                      <p>交互流程: {figmaData.requirements.interactions?.length || 0}</p>
                      <p>文本内容: {figmaData.requirements.textContent?.length || 0}</p>
                      <p>状态/变体: {figmaData.requirements.states?.length || 0}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab 3: AI 分析 */}
          {activeTab === 'analyze' && (
            <div className="req-analyzer-analyze-tab">
              <h3>AI 需求分析</h3>

              <div className="req-analyzer-data-summary">
                <p>Sheets 数据: {sheetsData?.totalRows || 0} 条</p>
                <p>Figma 模块: {figmaData?.requirements?.pages?.length || 0} 个</p>
                <p>本地文件: {localFileData ? 1 : 0} 个</p>
                <p>共通需求: {confirmedIssues?.confirmedIssues || 0} 条</p>
              </div>

              {/* 流式输出显示区 */}
              {isAnalyzing && streamingText && (
                <div className="req-analyzer-stream-output">
                  <h4>AI 分析输出（实时）</h4>
                  <pre className="req-analyzer-stream-text">{streamingText}</pre>
                </div>
              )}

              <div className="req-analyzer-form-group">
                <label>问题清单写入 Sheets URL:</label>
                <ClearableInput
                  value={questionSheetUrl}
                  onChange={(e) => setQuestionSheetUrl(e.target.value)}
                  placeholder="输入问题清单写入的 Google Sheets URL..."
                />
                <p className="req-analyzer-hint">
                  分析后会将问题清单写入此 Sheet（自动创建新 tab）。可使用与需求来源相同的 Sheet URL。
                </p>
              </div>

              {!questionList.length ? (
                isAnalyzing ? (
                  <Spinner size="lg" text={analysisProgress?.step === 'complete' ? analysisProgress?.message || '分析完成' : `${analysisProgress?.message || '分析中'} ${analysisProgress?.percent || 0}%`} />
                ) : (
                  <div className="req-analyzer-analyze-actions">
                    <button
                      onClick={handleAnalyze}
                      disabled={!requirementName.trim()}
                      className="req-analyzer-btn-primary"
                    >
                      开始分析
                    </button>
                  </div>
                )
              ) : (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <h4>问题清单 ({questionList.length} 个)</h4>
                    <button onClick={() => { setQuestionList([]); }} className="req-analyzer-btn-secondary">
                      重新分析
                    </button>
                  </div>
                  <div className="req-analyzer-table-scroll">
                    <table className="req-analyzer-preview-table">
                      <thead>
                        <tr><th>序号</th><th>分类</th><th>问题描述</th><th>严重程度</th></tr>
                      </thead>
                      <tbody>
                        {questionList.map((q, i) => (
                          <tr key={i}>
                            <td>{i + 1}</td>
                            <td>{q.category}</td>
                            <td>{q.question?.substring(0, 80)}{q.question?.length > 80 ? '...' : ''}</td>
                            <td>{q.severity}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {!questionsWritten ? (
                    <button onClick={handleWriteQuestions} className="req-analyzer-btn-primary" style={{ marginTop: '10px' }}>
                      写入 Google Sheets
                    </button>
                  ) : (
                    <p className="req-analyzer-success-msg" style={{ marginTop: '10px' }}>✓ 问题清单已写入 Sheets，请在 Sheets 中填写回复后再来继续。</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Tab 4: 回复 & 完善 */}
          {activeTab === 'refine' && (
            <div className="req-analyzer-refine-tab">
              <h3>回复 & 完善需求（第 {iterationCount} 轮迭代）</h3>

              <div className="req-analyzer-form-group">
                <label>问题 Sheet URL（读取回复）:</label>
                <ClearableInput
                  value={repliesSheetUrl}
                  onChange={(e) => setRepliesSheetUrl(e.target.value)}
                  placeholder={questionSheetUrl || '输入问题 Sheet URL...'}
                />
              </div>

              {!repliesData ? (
                isReadingReplies ? (
                  <Spinner text="正在读取回复..." />
                ) : (
                  <button onClick={handleReadReplies} className="req-analyzer-btn-primary" style={{ marginTop: '10px' }}>读取回复</button>
                )
              ) : (
                <div>
                  <p>共 {repliesData.totalQuestions} 个问题，{repliesData.repliedQuestions} 个已回复</p>

                  <div className="req-analyzer-table-scroll">
                    <table className="req-analyzer-preview-table">
                      <thead>
                        <tr><th>问题</th><th>回复</th><th>状态</th></tr>
                      </thead>
                      <tbody>
                        {(repliesData.data || []).slice(0, tableMaxRows).map((row, i) => (
                          <tr key={i}>
                            <td title={row.question || ''}>{(row.question || '').substring(0, 60)}</td>
                            <td title={row.reply || ''}>{(row.reply || '').substring(0, 60) || '(未回复)'}</td>
                            <td>{row.status || ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {isRefining ? (
                    <Spinner text="正在根据回复完善需求..." />
                  ) : (
                    <button onClick={handleRefine} className="req-analyzer-btn-primary" style={{ marginTop: '10px' }}>完善需求</button>
                  )}
                </div>
              )}

              {refinedRequirements && (
                <div className="req-analyzer-refined-preview">
                  <h4>完善后需求预览</h4>
                  <div className="req-analyzer-markdown-preview">
                    <pre>{refinedRequirements.content?.substring(0, 500) || '...'}</pre>
                  </div>

                  <button onClick={handleCheckNewIssues} className="req-analyzer-btn-secondary" style={{ marginTop: '10px' }}>
                    检查是否有新问题
                  </button>

                  {newIssuesCheck && (
                    <div className="req-analyzer-check-result">
                      {newIssuesCheck.hasNewIssues ? (
                        <div>
                          <p className="req-analyzer-warning-msg">⚠ {newIssuesCheck.message}</p>
                          <button onClick={() => {
                            setQuestionList(newIssuesCheck.newQuestionList);
                            setActiveTab('analyze');
                          }} className="req-analyzer-btn-primary">
                            回到分析 Tab 处理新问题
                          </button>
                        </div>
                      ) : (
                        <p className="req-analyzer-success-msg">✓ {newIssuesCheck.message}，可以去保存 Tab 保存需求文件。</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Tab 5: 一键执行 + 保存 */}
          {activeTab === 'execute' && (
            <div className="req-analyzer-execute-tab">
              <h3>一键执行 & 保存</h3>

              {!refinedRequirements && (
                <div className="req-analyzer-execute-section">
                  <p className="req-analyzer-desc">如果所有资料齐全，可以一键完成分析并生成需求规格文件。</p>
                  <div style={{ marginTop: '10px' }}>
                  {isExecuting ? (
                    <Spinner size="lg" text={executeProgress?.step === 'complete' ? executeProgress?.message || '执行完成' : `${executeProgress?.message || '执行中'} ${executeProgress?.percent || 0}%`} />
                  ) : (
                    <button onClick={handleFullExecute} className="req-analyzer-btn-primary" disabled={!sheetsData?.data?.length && !localFileData && !figmaData?.requirements?.length}>一键执行</button>
                  )}
                  </div>
                </div>
              )}

              {refinedRequirements && (
                <div className="req-analyzer-save-section">
                  <h4>需求文件预览</h4>
                  <div className="req-analyzer-markdown-preview">
                    <pre>{refinedRequirements.content?.substring(0, 800) || '...'}</pre>
                  </div>

                  {/* 章节选择器 */}
                  {parsedSections.length > 1 && (
                    <div className="req-analyzer-section-selector">
                      <h4>选择要保存的章节</h4>
                      <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                        <button onClick={() => setSelectedSections(new Set(parsedSections.map((_, i) => i)))}
                          className="req-analyzer-btn-secondary">全选</button>
                        <button onClick={() => setSelectedSections(new Set())}
                          className="req-analyzer-btn-secondary">清除</button>
                      </div>
                      {parsedSections.map((section, idx) => (
                        <div key={idx} className="req-analyzer-section-item">
                          <input
                            type="checkbox"
                            checked={selectedSections.has(idx)}
                            onChange={(e) => {
                              const newSet = new Set(selectedSections);
                              if (e.target.checked) newSet.add(idx);
                              else newSet.delete(idx);
                              setSelectedSections(newSet);
                            }}
                          />
                          <span className="req-analyzer-section-title">{section.title || `章节 ${idx + 1}`}</span>
                          <span className="req-analyzer-section-preview">
                            {section.content.substring(0, 100).replace(/\n/g, ' ').trim()}...
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="req-analyzer-form-group">
                    <label>需求名称:</label>
                    <ClearableInput
                      value={requirementName}
                      onChange={(e) => setRequirementName(e.target.value)}
                      placeholder="输入需求名称（决定保存路径和 Sheet tab 名）..."
                      className="req-analyzer-input"
                    />
                  </div>
                  <p className="req-analyzer-save-path-preview">
                    保存路径: {savePathPreview || `请输入模块名查看保存路径`}
                  </p>

                  <button onClick={handleSave} disabled={selectedSections.size === 0}
                    className="req-analyzer-btn-primary">保存到项目</button>

                  {saveResult && (
                    Array.isArray(saveResult) ? (
                      saveResult.map((r, i) => (
                        <p key={i} className="req-analyzer-success-msg">✓ 已保存: {r.filePath}</p>
                      ))
                    ) : (
                      <p className="req-analyzer-success-msg">✓ 已保存: {saveResult.filePath}</p>
                    )
                  )}

                  {savedFiles.length > 0 && (
                    <div className="req-analyzer-saved-files">
                      <h4>已保存的需求文件</h4>
                      {savedFiles.map(file => (
                        <div key={file.moduleName} className="req-analyzer-saved-file-item">
                          <span className="req-analyzer-saved-file-name">{file.moduleName}</span>
                          <span className="req-analyzer-saved-file-info">
                            {(file.fileSize / 1024).toFixed(1)}KB | {new Date(file.lastModified).toLocaleDateString()}
                          </span>
                          <button onClick={() => handleDeleteSavedFile(file.moduleName)}
                            className="req-analyzer-btn-danger">删除</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Tab 7: 设置 */}
          {activeTab === 'settings' && (
            <div className="req-analyzer-settings-tab">
              <h3>设置</h3>

              <div className="req-analyzer-section">
                <h4>Google OAuth2 配置</h4>
                <p className="req-analyzer-hint">Client ID 已内置，仅需配置 Client Secret（也可通过 GOOGLE_CLIENT_SECRET 环境变量设置）</p>
                <div className="req-analyzer-form-group">
                  <label>Client Secret:</label>
                  <div className="req-analyzer-token-input">
                    <ClearableInput
                      type={showClientSecret ? 'text' : 'password'}
                      value={googleClientSecret}
                      onChange={(e) => setGoogleClientSecret(e.target.value)}
                      placeholder="Google OAuth2 Client Secret..."
                    />
                    <button onClick={() => setShowClientSecret(!showClientSecret)} className="req-analyzer-btn-sm">
                      {showClientSecret ? '🔒' : '👁️'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="req-analyzer-section">
                <h4>默认 Sheets 地址</h4>
                <div className="req-analyzer-form-group">
                  <label>需求来源 Sheets:</label>
                  <ClearableInput value={sheetsUrl} onChange={(e) => setSheetsUrl(e.target.value)} />
                </div>
                <div className="req-analyzer-form-group">
                  <label>问题清单 Sheets:</label>
                  <ClearableInput value={questionSheetUrl} onChange={(e) => setQuestionSheetUrl(e.target.value)} />
                </div>
                <div className="req-analyzer-form-group">
                  <label>共通需求 Sheets:</label>
                  <ClearableInput value={confirmedIssuesUrl} onChange={(e) => setConfirmedIssuesUrl(e.target.value)} />
                </div>
              </div>

              <div className="req-analyzer-section">
                <h4>Figma 配置</h4>
                <div className="req-analyzer-form-group">
                  <label>Figma Personal Access Token:</label>
                  <div className="req-analyzer-token-input">
                    <ClearableInput
                      type={showFigmaToken ? 'text' : 'password'}
                      value={figmaToken}
                      onChange={(e) => setFigmaToken(e.target.value)}
                      placeholder="Figma Personal Access Token..."
                    />
                    <button onClick={() => setShowFigmaToken(!showFigmaToken)} className="req-analyzer-btn-sm">
                      {showFigmaToken ? '🔒' : '👁️'}
                    </button>
                  </div>
                  <p className="req-analyzer-hint">
                    获取方式: Figma → Main Menu(左上角icon) → Help and account → Account settings → Security(顶部tab最后一项) → Personal access tokens → Generate new token
                  </p>
                </div>
                <div className="req-analyzer-form-group">
                  <label>默认 Figma URL:</label>
                  <ClearableInput
                    value={figmaUrl}
                    onChange={(e) => setFigmaUrl(e.target.value)}
                    placeholder="https://www.figma.com/design/..."
                  />
                </div>
              </div>

              <button onClick={handleSaveConfig} className="req-analyzer-btn-primary">保存设置</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ReqAnalyzerModal;