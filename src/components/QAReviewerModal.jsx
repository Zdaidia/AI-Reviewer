/**
 * QA Reviewer Modal Component
 *
 * 需求符合性验证对话框
 *
 * 工作流程：
 * 1. 输入需求
 * 2. 提取页面/模块并选择文件
 * 3. 预览确认
 * 4. 执行审查
 */

import React, { useState, useEffect } from 'react';
import './QAReviewerModal.css';

function QAReviewerModal({ isOpen, onClose, electronAPI, projectPath }) {
  // 状态
  const [activeTab, setActiveTab] = useState('upload'); // upload | files | preview | settings
  const [isLoading, setIsLoading] = useState(false);
  const [executionProgress, setExecutionProgress] = useState(null);
  const [isCancelled, setIsCancelled] = useState(false); // 取消标志

  // 需求文档
  const [requirementFile, setRequirementFile] = useState(null);
  const [requirementText, setRequirementText] = useState('');

  // 页面名称输入（用于匹配多语言包）
  const [pageNameInput, setPageNameInput] = useState('');
  const [matchedPageFiles, setMatchedPageFiles] = useState([]);

  // 从需求中提取的页面/模块
  const [extractedModules, setExtractedModules] = useState([]);
  const [selectedModules, setSelectedModules] = useState([]);

  // 文件列表
  const [availableFiles, setAvailableFiles] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);

  // UI 设计稿
  const [uiImage, setUIImage] = useState(null);
  const [uiImageUrl, setUiImageUrl] = useState(null);
  const [figmaUrl, setFigmaUrl] = useState('');

  // API 文档
  const [apiDocFile, setApiDocFile] = useState(null);
  const [apiDocContent, setApiDocContent] = useState('');
  const [apiDocFormat, setApiDocFormat] = useState('markdown'); // markdown | json | openapi

  // 验证维度（八维优先级审查架构）
  // 按优先级排序：高优先级检查过的代码，低优先级不再检查
  const [dimensions, setDimensions] = useState({
    requirementMatching: true,    // 优先级 1: 需求匹配
    contractChecking: true,       // 优先级 2: 契约检查
    robustnessChecking: true,     // 优先级 3: 健壮性检查
    securityChecking: true,       // 优先级 4: 安全检查
    accessibility: true,          // 优先级 5: 可访问性【新增】
    compatibility: true,          // 优先级 6: 兼容性【新增】
    performance: true,            // 优先级 7: 性能优化【拆分】
    maintainability: true,        // 优先级 8: 可维护性【拆分】
  });

  // 审查设置
  const [segmentStrategy, setSegmentStrategy] = useState('by_feature');
  const [parallelSegments, setParallelSegments] = useState(2);
  const [maxFilesPerSegment, setMaxFilesPerSegment] = useState(10);
  const [incrementalMode, setIncrementalMode] = useState(false);
  const [reviewEntireProject, setReviewEntireProject] = useState(false); // 审查整个项目

  // 分段预览
  const [segments, setSegments] = useState([]);
  const [planSummary, setPlanSummary] = useState(null);

  // 重置状态
  useEffect(() => {
    if (isOpen) {
      // 重置所有状态到初始值
      resetModalState();
      // 加载项目默认设置
      loadProjectSettings();
      // 加载项目文件列表
      loadProjectFiles();
    }
  }, [isOpen]);

  // 调试：追踪 uiImageUrl 变化
  useEffect(() => {
    console.log('[QAReviewer] uiImageUrl 变化:', uiImageUrl);
    if (uiImageUrl) {
      console.log('[QAReviewer] URL 协议:', uiImageUrl.substring(0, 20));
    }
  }, [uiImageUrl]);

  /**
   * 重置弹窗状态
   */
  const resetModalState = () => {
    setActiveTab('upload');
    setRequirementText('');
    setRequirementFile(null);
    setPageNameInput('');
    setMatchedPageFiles([]);
    setExtractedModules([]);
    setSelectedModules([]);
    setSelectedFiles([]);
    setUIImage(null);
    setUiImageUrl(null);
    setFigmaUrl('');
    setApiDocFile(null);
    setApiDocContent('');
    setApiDocFormat('markdown');
    setSegments([]);
    setPlanSummary(null);
    setExecutionProgress(null);
    // 保持 dimensions 和其他设置不变
  };

  /**
   * 处理取消操作 - 关闭弹窗时取消后续 LLM 调用
   */
  const handleCancel = async () => {
    console.log('[QAReviewer] 用户关闭弹窗，取消后续 LLM 调用');

    // 设置本地取消标志
    setIsCancelled(true);

    // 通知后端取消
    try {
      await electronAPI.cancelQAReview();
      console.log('[QAReviewer] 后端已收到取消请求');
    } catch (error) {
      console.warn('[QAReviewer] 发送取消请求失败:', error);
    }

    // 调用原始关闭函数
    onClose();

    // 重置取消状态（下次打开时重置）
    setTimeout(() => setIsCancelled(false), 500);
  };

  /**
   * 加载项目设置
   */
  const loadProjectSettings = async () => {
    try {
      const settings = await electronAPI.getQAReviewerSettings();
      if (settings) {
        setSegmentStrategy(settings.segmentStrategy || 'by_feature');
        setParallelSegments(settings.parallelSegments || 2);
        setMaxFilesPerSegment(settings.maxFilesPerSegment || 10);
      }
    } catch (e) {
      console.warn('加载设置失败:', e);
    }
  };

  /**
   * 加载项目文件列表
   */
  const loadProjectFiles = async () => {
    try {
      console.log('[QA Reviewer Frontend] 加载项目文件列表...');
      const result = await electronAPI.getProjectFiles();
      console.log('[QA Reviewer Frontend] getProjectFiles 结果:', result);
      if (result.success && result.files) {
        console.log('[QA Reviewer Frontend] 加载了', result.files.length, '个文件');
        setAvailableFiles(result.files);
      } else {
        console.warn('[QA Reviewer Frontend] 加载文件失败:', result.error);
      }
    } catch (e) {
      console.warn('[QA Reviewer Frontend] 加载文件列表失败:', e);
    }
  };

  /**
   * 从需求文本中提取页面/模块
   */
  const extractModulesFromRequirement = async () => {
    console.log('[QA Reviewer Frontend] extractModulesFromRequirement 被调用');
    console.log('[QA Reviewer Frontend] requirementText 长度:', requirementText?.length || 0);

    if (!requirementText.trim()) {
      setExtractedModules([]);
      return;
    }

    const lines = requirementText.split('\n');
    const firstLine = lines[0] || '';
    console.log('[QA Reviewer Frontend] 第一行内容:', firstLine);

    // 第一行是模块/页面描述，用于匹配文件
    // DynamicFileMatcher 内部会去掉冒号，然后用 i18n 匹配、代码图搜索
    const allRelatedFiles = new Map();
    let bestMethod = '';

    try {
      console.log('[QA Reviewer] 调用 searchFilesByPageName, projectPath:', projectPath, ', pageName:', firstLine);
      const result = await electronAPI.searchFilesByPageName({
        projectPath: projectPath,
        pageName: firstLine,
      });
      console.log('[QA Reviewer] searchFilesByPageName 返回:', JSON.stringify(result).substring(0, 500));

      if (result.success && result.files && result.files.length > 0) {
        console.log(`[QA Reviewer] 完整需求匹配到 ${result.files.length} 个文件 (method: ${result.method})`);
        result.files.forEach(file => {
          const filePath = file.path || file;
          allRelatedFiles.set(filePath, file);
        });
        bestMethod = result.method || '';
      }
    } catch (error) {
      console.warn('[QA Reviewer] 完整需求匹配失败:', error);
    }

    const relatedFiles = Array.from(allRelatedFiles.values());
    console.log('[QA Reviewer] 最终找到相关文件:', relatedFiles.length, '匹配方式:', bestMethod);

    // 提取模块名用于显示（从匹配到的文件路径中提取）
    const moduleNames = [...new Set(relatedFiles.map(f => {
      const parts = (f.path || '').split(/[/\\]/);
      // 找到 lib/ 或 src/ 之后的第一个目录名
      const srcIdx = parts.findIndex(p => ['lib', 'src', 'app'].includes(p.toLowerCase()));
      if (srcIdx >= 0 && srcIdx + 1 < parts.length) {
        return parts[srcIdx + 1];
      }
      return null;
    }).filter(Boolean))];

    setExtractedModules(moduleNames);
    setSelectedModules(moduleNames);
    setSelectedFiles(relatedFiles);

    console.log('[QA Reviewer Frontend] 识别的模块:', moduleNames);

    // 切换到文件选择标签
    if (relatedFiles.length > 0) {
      setActiveTab('files');
    }
  };

  /**
   * 根据选中的模块查找相关文件（使用代码图）
   */
  const findFilesForModules = async (modules = null) => {
    const modulesToSearch = modules || selectedModules;

    // 安全检查：确保是数组
    if (!Array.isArray(modulesToSearch)) {
      console.warn('[QA Reviewer] modulesToSearch 不是数组:', modulesToSearch);
      return;
    }

    console.log('[QA Reviewer] 查找模块文件（使用代码图）:', modulesToSearch);
    console.log('[QA Reviewer] 可用文件数量:', availableFiles.length);

    if (modulesToSearch.length === 0) {
      // 如果没有选择模块，使用所有文件
      setSelectedFiles([...availableFiles.slice(0, 50)]);
      return;
    }

    // 优先使用后端的代码图查找功能
    // 逐个模块查找相关文件
    const allRelatedFiles = new Map(); // 使用 Map 去重

    for (const module of modulesToSearch) {
      try {
        console.log(`[QA Reviewer] 查找模块: ${module}`);

        // 调用后端基于代码图的查找
        const result = await electronAPI.searchFilesByPageName({
          projectPath: projectPath,
          pageName: module,
        });

        if (result.success && result.files && result.files.length > 0) {
          console.log(`[QA Reviewer] 找到 ${result.files.length} 个相关文件`);
          result.files.forEach(file => {
            const filePath = file.path || file;
            allRelatedFiles.set(filePath, file);
          });
        } else {
          console.log(`[QA Reviewer] 后端查找失败，回退到前端匹配: ${module}`);
          // 回退：使用前端简单的路径匹配
          await fallbackFileMatch(module, allRelatedFiles);
        }
      } catch (error) {
        console.warn(`[QA Reviewer] 查找模块失败: ${module}`, error);
        // 回退：使用前端简单的路径匹配
        await fallbackFileMatch(module, allRelatedFiles);
      }
    }

    // 转换为数组
    const relatedFiles = Array.from(allRelatedFiles.values());

    console.log('[QA Reviewer] 最终找到相关文件:', relatedFiles.length);
    relatedFiles.forEach(f => console.log('  -', f.name || f.path?.split(/[/\\]/).pop()));

    // 直接使用后端返回的文件列表，不再添加全局配置文件
    setSelectedFiles(relatedFiles);

    // 切换到文件选择标签
    setActiveTab('files');
  };

  /**
   * 回退方案：简单的文件名匹配
   */
  const fallbackFileMatch = async (module, fileMap) => {
    const moduleLower = module.toLowerCase();

    // 检查文件名是否包含模块名
    availableFiles.forEach(file => {
      const fileName = (file.name || '').toLowerCase();
      const filePath = (file.path || file || '').toLowerCase();

      // 文件名直接匹配或路径匹配
      if (fileName.includes(moduleLower) ||
          filePath.includes(`/${moduleLower}/`) ||
          filePath.includes(`\\${moduleLower}\\`)) {
        const filePath = file.path || file;
        fileMap.set(filePath, file);
      }
    });
  };

  /**
   * 添加全局配置文件（路由、多语言等）
   */
  const addGlobalConfigFiles = (currentFiles) => {
    const configPatterns = [
      { name: 'routes', patterns: ['route', 'page', 'navigation'] },
      { name: 'i18n', patterns: ['app_', 'lang', 'localization', 'i18n'] },
      { name: 'config', patterns: ['config', 'setting', 'env'] },
      { name: 'main', patterns: ['main.dart', 'main.js', 'app.dart', 'app.js'] },
    ];

    const addedFiles = new Set(currentFiles.map(f => f.path || f));

    for (const configType of configPatterns) {
      for (const file of availableFiles) {
        const filePath = file.path || file;
        if (addedFiles.has(filePath)) continue;

        const fileName = (file.name || '').toLowerCase();
        const matches = configType.patterns.some(p => fileName.includes(p));

        if (matches) {
          addedFiles.add(filePath);
          // 添加到文件列表开头
          currentFiles.unshift(file);
        }
      }
    }

    return currentFiles;
  };

  /**
   * 手动添加文件
   */
  const handleAddFile = async () => {
    try {
      const result = await electronAPI.selectFile({
        filters: [
          { name: '代码文件', extensions: ['dart', 'js', 'jsx', 'ts', 'tsx', 'vue'] },
          { name: '所有文件', extensions: ['*'] },
        ],
      });

      if (!result.canceled && result.filePath) {
        const newFile = {
          path: result.filePath,
          name: result.filePath.split(/[/\\]/).pop(),
        };

        if (!selectedFiles.find(f => f.path === newFile.path)) {
          setSelectedFiles([...selectedFiles, newFile]);
        }
      }
    } catch (error) {
      console.error('添加文件失败:', error);
    }
  };

  /**
   * 移除文件
   */
  const handleRemoveFile = (filePath) => {
    setSelectedFiles(selectedFiles.filter(f => f.path !== filePath));
  };

  /**
   * 通过页面名称匹配文件（使用多语言包）
   */
  const handleSearchByPageName = async () => {
    if (!pageNameInput.trim()) {
      alert('请输入页面名称');
      return;
    }

    setIsLoading(true);
    try {
      console.log('[QA Reviewer] 根据页面名称搜索文件:', pageNameInput);

      // 调用后端通过页面名称匹配文件
      const result = await electronAPI.searchFilesByPageName({
        projectPath,
        pageName: pageNameInput.trim(),
      });

      if (result.success && result.files && result.files.length > 0) {
        console.log('[QA Reviewer] 找到匹配文件:', result.files.length);
        result.files.forEach(f => console.log('  -', f.name || f.path));

        setMatchedPageFiles(result.files);
        setSelectedFiles(result.files);

        // 跳转到文件选择tab
        setActiveTab('files');
      } else {
        alert(`未找到与页面 "${pageNameInput}" 相关的文件\n\n请尝试：\n1. 检查页面名称是否正确\n2. 使用页面的英文名称\n3. 手动选择文件`);
        setMatchedPageFiles([]);
      }
    } catch (error) {
      console.error('[QA Reviewer] 搜索文件失败:', error);
      alert('搜索文件失败: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * 选择需求文档
   */
  const handleSelectRequirementFile = async () => {
    try {
      const result = await electronAPI.selectFile({
        filters: [
          { name: '文档', extensions: ['md', 'txt', 'docx', 'pdf'] },
          { name: '所有文件', extensions: ['*'] },
        ],
      });

      if (!result.canceled) {
        setRequirementFile(result.filePath);
        // 自动加载文件内容到文本框
        console.log('[QA Reviewer] 加载需求文件:', result.filePath);
        const contentResult = await electronAPI.readFile(result.filePath);
        if (contentResult.success) {
          setRequirementText(contentResult.content);
          console.log('[QA Reviewer] 需求内容已加载，长度:', contentResult.content.length);
        } else {
          console.error('[QA Reviewer] 加载需求文件失败:', contentResult.error);
        }
      }
    } catch (error) {
      console.error('选择文件失败:', error);
    }
  };

  /**
   * 选择 UI 图片
   */
  const handleSelectUIImage = async () => {
    try {
      const result = await electronAPI.selectFile({
        filters: [
          { name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] },
        ],
      });

      console.log('[QAReviewer] selectFile 返回结果:', JSON.stringify(result));

      if (!result.canceled) {
        setUIImage(result.filePath);
        // 创建预览 URL - 使用自定义协议避免 Electron 安全限制
        // 将反斜杠转换为正斜杠，并编码 URL
        const normalizedPath = result.filePath.replace(/\\/g, '/');
        const fullUrl = `local-resource://${normalizedPath}`;
        console.log('[QAReviewer] 图片预览 URL:', fullUrl);
        console.log('[QAReviewer] 原始路径:', result.filePath);
        console.log('[QAReviewer] 规范化路径:', normalizedPath);
        console.log('[QAReviewer] URL 长度:', fullUrl.length);
        setUiImageUrl(fullUrl);
      }
    } catch (error) {
      console.error('选择图片失败:', error);
    }
  };

  /**
   * 选择 API 文档文件
   */
  const handleSelectAPIDoc = async () => {
    try {
      const result = await electronAPI.selectFile({
        filters: [
          { name: 'API 文档', extensions: ['md', 'json', 'yaml', 'yml', 'txt'] },
          { name: '所有文件', extensions: ['*'] },
        ],
      });

      if (!result.canceled) {
        setApiDocFile(result.filePath);
        // 读取文件内容
        const fileResult = await electronAPI.readFile(result.filePath);
        if (fileResult.success) {
          setApiDocContent(fileResult.content);
          // 根据扩展名判断格式
          const ext = result.filePath.split('.').pop().toLowerCase();
          if (ext === 'json') {
            setApiDocFormat('json');
          } else if (ext === 'yaml' || ext === 'yml') {
            setApiDocFormat('openapi');
          } else {
            setApiDocFormat('markdown');
          }
        }
      }
    } catch (error) {
      console.error('选择 API 文档失败:', error);
    }
  };

  /**
   * 清除 API 文档
   */
  const handleClearAPIDoc = () => {
    setApiDocFile(null);
    setApiDocContent('');
  };

  /**
   * 解析需求并预览分段
   */
  const handleParseAndPreview = async () => {
    setIsLoading(true);

    try {
      // 获取需求内容
      let requirementContent = requirementText;
      if (requirementFile && !requirementText) {
        // 从文件读取
        const result = await electronAPI.readRequirementFile(requirementFile);
        requirementContent = result.content;
      }

      // 自动从需求中提取模块并查找相关文件
      await extractModulesFromRequirement();

      // 跳转到选择文件 tab，而不是预览确认 tab
      setActiveTab('files');
    } catch (error) {
      console.error('解析需求失败:', error);
      alert('解析需求失败: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * 开始审查
   */
  const handleStartReview = async () => {
    setIsLoading(true);
    setExecutionProgress({ status: 'starting', percent: 0, message: '正在启动...' });

    try {
      // 获取需求内容
      let requirementContent = requirementText;
      if (requirementFile) {
        const result = await electronAPI.readRequirementFile(requirementFile);
        requirementContent = result.content || requirementText;
      }

      // 调用后端执行审查
      const result = await electronAPI.executeQAReview({
        projectPath: projectPath,
        requirementText: requirementContent,
        requirementFile: requirementFile,
        uiImage: uiImage,
        figmaUrl: figmaUrl,
        apiDocContent: apiDocContent,
        apiDocFormat: apiDocFormat,
        dimensions: Object.keys(dimensions).filter(k => dimensions[k]),
        strategy: segmentStrategy,
        parallelSegments: parseInt(parallelSegments),
        maxFilesPerSegment: parseInt(maxFilesPerSegment),
        incrementalMode,
        selectedFiles: selectedFiles.length > 0 ? selectedFiles : null,
        selectedModules: selectedModules.length > 0 ? selectedModules : null,
        reviewEntireProject: reviewEntireProject || (selectedFiles.length === 0 && !requirementContent && selectedModules.length === 0),
      });

      if (result.success) {
        setExecutionProgress({
          status: 'completed',
          percent: 100,
          message: `审查完成 - 发现 ${result.result?.totalIssues || 0} 个问题`,
          result: result.result,
        });

        // 结果在进度区域下方内联展示，不再使用 alert

        // 如果有报告路径，询问是否打开
        if (result.reportPath) {
          if (window.confirm('\n审查已完成！是否查看详细报告？')) {
            await electronAPI.openReport(result.reportPath);
          }
        }
      } else {
        // 构建错误消息
        let errorMessage = '审查失败: ' + result.error;
        if (result.hint) {
          errorMessage += '\n\n💡 提示: ' + result.hint;
        }

        // 特殊处理冷却错误
        if (result.isCooldownError) {
          setExecutionProgress({
            status: 'cooldown',
            percent: 0,
            message: result.error,
          });
          alert('⏱️ ' + result.error);
          return;
        }

        setExecutionProgress({
          status: 'failed',
          percent: 0,
          message: errorMessage,
        });

        // 显示更详细的错误对话框
        alert(errorMessage);
      }
    } catch (error) {
      console.error('执行审查失败:', error);
      setExecutionProgress({
        status: 'failed',
        percent: 0,
        message: '执行失败: ' + error.message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * 监听执行进度
   */
  useEffect(() => {
    if (!isOpen) return;

    // 用于跟踪当前分段索引
    let currentSegmentIndex = 0;
    let totalSegments = 1;

    const cleanup = electronAPI.onQAReviewProgress((progress) => {
      // 更新分段信息
      if (progress.segmentIndex !== undefined) {
        currentSegmentIndex = progress.segmentIndex;
      }
      if (progress.totalSegments !== undefined) {
        totalSegments = progress.totalSegments;
      }

      // 计算总体进度百分比
      let overallPercent = progress.percent || 0;
      if (progress.type === 'progress' || progress.type === 'start') {
        // 基于分段进度计算总体进度
        const segmentProgress = progress.percent || 0;
        const segmentWeight = 100 / totalSegments;
        overallPercent = Math.round((currentSegmentIndex * segmentWeight) + (segmentProgress * segmentWeight / 100));
      } else if (progress.type === 'complete') {
        overallPercent = Math.round(((currentSegmentIndex + 1) / totalSegments) * 100);
      }

      // 构建详细的消息
      let message = progress.message || '';
      if (progress.segment) {
        const segmentInfo = `[${currentSegmentIndex + 1}/${totalSegments}] ${progress.segment.name}`;
        message = `${segmentInfo}: ${message}`;
      }

      // 根据阶段添加更友好的提示
      const stageMessages = {
        'starting': '🚀 正在初始化...',
        'quality-check': '🔍 正在进行代码质量检查...',
        'ai-analysis': '🤖 正在调用 AI 进行需求符合性分析...',
        'calling-ai': '📡 正在发送请求到 AI...',
        'parsing': '📝 AI 分析完成，正在解析结果...',
        'merging': '🔀 正在合并分析结果...',
        'complete': '✅ 完成',
        'error': '❌ 出错了',
        'rate-limit': '⏳ 遇到速率限制，等待重试...'
      };

      let displayMessage = stageMessages[progress.stage] || message || '处理中...';

      // 🔥 重要：保留之前的 results 和进度，避免被覆盖
      setExecutionProgress(prev => {
        // 如果是速率限制，保留之前的进度百分比，只更新消息
        const preservedPercent = (progress.type === 'rate-limit') ? (prev.percent || 0) : overallPercent;
        const preservedStatus = (progress.type === 'rate-limit') ? (prev.status || 'running') : (progress.status || prev.status || 'running');

        return {
          ...progress,
          percent: preservedPercent,
          status: preservedStatus,
          message: displayMessage,
          // 保留之前累积的结果
          result: progress.result || prev.result
        };
      });
    });

    return cleanup;
  }, [isOpen]);

  /**
   * 渲染八维优先级审查结果
   */
  const renderThreeDimensionalResults = (result) => {
    const {
      requirementMatching, contractChecking, robustnessChecking, securityChecking,
      accessibility, compatibility, performance, maintainability,
      dimensionScores, overallScore
    } = result || {};

    // 计算各维度的状态和颜色
    const getDimensionStatus = (dim) => {
      if (!dim) return { status: 'unknown', color: '#6b7280' };
      const status = dim.status || 'unknown';
      const score = dim.score || 0;
      if (status === 'passed' || score >= 80) return { status: 'passed', color: '#22c55e' };
      if (status === 'failed' || score < 60) return { status: 'failed', color: '#ef4444' };
      return { status: 'partial', color: '#eab308' };
    };

    const reqStatus = getDimensionStatus(requirementMatching);
    const contStatus = getDimensionStatus(contractChecking);
    const robStatus = getDimensionStatus(robustnessChecking);
    const secStatus = getDimensionStatus(securityChecking);
    const a11yStatus = getDimensionStatus(accessibility);
    const compStatus = getDimensionStatus(compatibility);
    const perfStatus = getDimensionStatus(performance);
    const mainStatus = getDimensionStatus(maintainability);

    // 计算检查项问题总数
    const countChecklistIssues = (dim) => {
      if (!dim?.checklist) return 0;
      return Object.values(dim.checklist).reduce((sum, item) => sum + (item.issuesCount || 0), 0);
    };

    // 维度配置
    const dimensions = [
      { key: 'requirementMatching', data: requirementMatching, status: reqStatus, icon: '🎯', label: '需求匹配', color: '#60a5fa' },
      { key: 'contractChecking', data: contractChecking, status: contStatus, icon: '📋', label: '契约检查', color: '#eab308' },
      { key: 'robustnessChecking', data: robustnessChecking, status: robStatus, icon: '🛡️', label: '健壮性', color: '#f97316' },
      { key: 'securityChecking', data: securityChecking, status: secStatus, icon: '🔒', label: '安全性', color: '#ef4444' },
      { key: 'accessibility', data: accessibility, status: a11yStatus, icon: '♿', label: '可访问性', color: '#ec4899' },
      { key: 'compatibility', data: compatibility, status: compStatus, icon: '🌐', label: '兼容性', color: '#14b8a6' },
      { key: 'performance', data: performance, status: perfStatus, icon: '⚡', label: '性能优化', color: '#a855f7' },
      { key: 'maintainability', data: maintainability, status: mainStatus, icon: '🔧', label: '可维护性', color: '#6b7280' },
    ];

    return (
      <div className="three-dimensional-results">
        <h4 style={{ marginBottom: '16px', color: '#fff' }}>📊 八维优先级审查结果</h4>

        {/* 总体评分 */}
        {overallScore !== undefined && (
          <div style={{
            background: 'rgba(59, 130, 246, 0.2)',
            border: '1px solid #3b82f6',
            borderRadius: '8px',
            padding: '12px 16px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <span style={{ color: '#fff' }}>总体评分</span>
            <span style={{
              fontSize: '24px',
              fontWeight: 'bold',
              color: overallScore >= 80 ? '#22c55e' : overallScore >= 60 ? '#eab308' : '#ef4444'
            }}>{overallScore}</span>
          </div>
        )}

        {/* 八维网格布局：4行 x 2列 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
          {dimensions.map(dim => (
            <div key={dim.key} style={{
              background: `rgba(${dim.status.color === '#22c55e' ? '34, 197, 94' : dim.status.color === '#ef4444' ? '239, 68, 68' : '234, 179, 8'}, 0.2)`,
              border: `1px solid ${dim.status.color}`,
              borderRadius: '8px',
              padding: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '18px', marginRight: '6px' }}>{dim.icon}</span>
                <span style={{ color: dim.color, fontWeight: 'bold', fontSize: '13px' }}>{dim.label}</span>
                {dim.data?.score !== undefined && (
                  <span style={{ marginLeft: 'auto', fontSize: '12px', color: dim.status.color }}>
                    {dim.data.score}分
                  </span>
                )}
              </div>

              {dim.key === 'requirementMatching' ? (
                <>
                  {dim.data?.covered?.length > 0 && (
                    <div style={{ color: '#22c55e', fontSize: '12px', marginBottom: '4px' }}>
                      ✓ 已覆盖 {dim.data.covered.length} 项
                    </div>
                  )}
                  {dim.data?.missing?.length > 0 && (
                    <div style={{ color: '#ef4444', fontSize: '12px' }}>
                      ✗ 缺失 {dim.data.missing.length} 项
                    </div>
                  )}
                </>
              ) : dim.data?.checklist ? (
                <div style={{ fontSize: '11px' }}>
                  {Object.entries(dim.data.checklist).slice(0, 2).map(([key, val]) => (
                    <div key={key} style={{ color: val.issuesCount === 0 ? '#22c55e' : '#ef4444', marginBottom: '2px' }}>
                      {val.issuesCount === 0 ? '✓' : `✗ ${val.issuesCount}`} {val.description}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ color: '#d1d5db', fontSize: '12px' }}>
                  {countChecklistIssues(dim.data) || 0} 个问题
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  /**
   * 构建详细结果消息（包含八维对齐）
   */
  const buildDetailedResultMessage = (result) => {
    const totalIssues = result?.totalIssues || 0;
    const todoResult = result?.todoResult;
    const issues = result?.issues || [];
    const invalidIssues = result?.invalidIssues || []; // 新增：无效问题
    const {
      requirementMatching, contractChecking, robustnessChecking, securityChecking,
      accessibility, compatibility, performance, maintainability, overallScore
    } = result || {};

    let message = `✅ 审查完成！\n\n`;

    // 总体评分
    if (overallScore !== undefined) {
      message += `📊 总体评分: ${overallScore}/100\n\n`;
    }

    // 八维对齐摘要
    message += `📊 八维优先级审查结果:\n`;

    // 维度配置
    const dimensions = [
      { key: 'requirementMatching', data: requirementMatching, icon: '🎯', label: '需求匹配' },
      { key: 'contractChecking', data: contractChecking, icon: '📋', label: '契约检查' },
      { key: 'robustnessChecking', data: robustnessChecking, icon: '🛡️', label: '健壮性' },
      { key: 'securityChecking', data: securityChecking, icon: '🔒', label: '安全性' },
      { key: 'accessibility', data: accessibility, icon: '♿', label: '可访问性' },
      { key: 'compatibility', data: compatibility, icon: '🌐', label: '兼容性' },
      { key: 'performance', data: performance, icon: '⚡', label: '性能优化' },
      { key: 'maintainability', data: maintainability, icon: '🔧', label: '可维护性' },
    ];

    dimensions.forEach(dim => {
      if (!dim.data) return;

      if (dim.key === 'requirementMatching') {
        const covered = dim.data.covered?.length || 0;
        const missing = dim.data.missing?.length || 0;
        const score = dim.data.score !== undefined ? ` (${dim.data.score}分)` : '';
        message += `  ${dim.icon} ${dim.label}: ✓ ${covered} 已覆盖 | ✗ ${missing} 缺失${score}\n`;
      } else {
        const status = dim.data.status === 'passed' ? '✓ 通过' : dim.data.status === 'failed' ? '✗ 失败' : '⚠️ 有问题';
        const score = dim.data.score !== undefined ? ` (${dim.data.score}分)` : '';
        message += `  ${dim.icon} ${dim.label}: ${status}${score}\n`;
      }
    });

    message += `\n`;

    // 问题统计
    message += `📊 发现问题: ${totalIssues} 个\n`;

    // 🔍 修改：无效问题提示（即使总问题为 0 也要显示）
    if (invalidIssues.length > 0) {
      message += `\n⚠️⚠️⚠️ 格式不正确的问题: ${invalidIssues.length} 个 ⚠️⚠️⚠️\n`;
      message += `   这些问题因缺少文件路径或行号而无法添加到 IDE。\n`;
      message += `   请查看下方详情或开发者控制台日志。\n\n`;

      // 显示无效问题详情
      message += `📋 无效问题详情:\n`;
      invalidIssues.slice(0, 10).forEach((issue, index) => {
        message += `\n${index + 1}. [${issue.ruleId || 'QA'}] ${issue.severity || 'medium'}\n`;
        message += `   原因: ${issue._invalidReason || '未知'}\n`;
        message += `   文件: ${issue.filePath || '未知'}:${issue.line || 0}\n`;
        message += `   问题描述: ${issue.message || '无描述'}\n`;
        if (issue.suggestion) {
          message += `   建议: ${issue.suggestion}\n`;
        }
      });

      if (invalidIssues.length > 10) {
        message += `\n... 还有 ${invalidIssues.length - 10} 个无效问题\n`;
      }
      message += `\n`;
    }

    // TODO 添加结果（更突出）
    if (todoResult) {
      message += `\n📝 === TODO 注释添加结果 ===\n`;
      if (todoResult.added > 0) {
        message += `✅ 已添加: ${todoResult.added} 个 TODO 注释到代码文件\n`;
      }
      if (todoResult.skipped > 0) {
        message += `⏭️ 已存在: ${todoResult.skipped} 个 TODO 未重复添加\n`;
      }
      if (todoResult.noLineNumber > 0) {
        message += `⚠️ 未添加: ${todoResult.noLineNumber} 个问题（AI 未返回行号，关键词匹配失败）\n`;
      }
      if (todoResult.added === 0 && totalIssues > 0) {
        message += `⚠️ 警告: ${totalIssues} 个问题未能添加 TODO（AI 未返回正确行号）\n`;
      }
      message += `💡 请在代码编辑器中查看已添加的 TODO 注释\n`;
    } else {
      message += `\n⚠️ TODO 生成结果未返回\n`;
    }

    // 显示前 5 个问题详情
    if (issues.length > 0) {
      message += `\n📋 问题详情（前 ${Math.min(5, issues.length)} 个）:\n`;
      issues.slice(0, 5).forEach((issue, index) => {
        message += `\n${index + 1}. [${issue.ruleId || 'QA'}] ${issue.severity || 'medium'}\n`;
        message += `   文件: ${issue.file || issue.filePath || '未知'}:${issue.line || 0}\n`;
        message += `   问题描述: ${issue.message || '无描述'}\n`;
      });

      if (issues.length > 5) {
        message += `\n... 还有 ${issues.length - 5} 个问题\n`;
      }
    } else if (totalIssues === 0 && invalidIssues.length === 0) {
      // 🔧 当完全没有发现任何问题时，提供诊断提示
      message += `\n🔍 诊断信息:\n`;
      message += `• 未发现任何问题（有效问题: 0，无效问题: 0）\n`;

      // 检查是否是 JSON 解析失败
      if (result?._parseError) {
        message += `\n⚠️ AI 响应解析失败！\n`;
        message += `• 解析方式: ${result._parseMethod === 'text-fallback' ? '文本回退（JSON 全部失败）' : '未知'}\n`;
        if (result._parseErrors?.length > 0) {
          message += `• 失败原因:\n`;
          result._parseErrors.forEach(err => {
            message += `  - ${err}\n`;
          });
        }
        message += `• 建议: 查看 DevTools 控制台 → 搜索 "原始响应" 查看 AI 实际返回内容\n`;
      } else {
        message += `• 可能原因：\n`;
        message += `  1. 代码完全符合需求（恭喜！）\n`;
        message += `  2. AI 模型返回了空结果\n`;
        message += `  3. 提示词理解问题\n`;
        message += `• 建议：查看开发者控制台日志了解详情\n`;
      }
    }

    message += `\n💡 提示: TODO 已添加到代码文件中，请检查代码文件`;

    return message;
  };

  if (!isOpen) return null;

  return (
    <div className="qa-reviewer-modal-overlay">
      <div className="qa-reviewer-modal">
        {/* Header */}
        <div className="qa-reviewer-header">
          <div className="qa-reviewer-title">
            <h2>🔍 AI QA Reviewer</h2>
            <p className="qa-reviewer-subtitle">需求符合性验证工具</p>
          </div>
          <button className="qa-reviewer-close" onClick={() => handleCancel()}>✕</button>
        </div>

        {/* Tabs */}
        <div className="qa-reviewer-tabs">
          <button
            className={`qa-reviewer-tab ${activeTab === 'upload' ? 'active' : ''}`}
            onClick={() => setActiveTab('upload')}
          >
            📄 输入需求
          </button>
          <button
            className={`qa-reviewer-tab ${activeTab === 'files' ? 'active' : ''}`}
            onClick={() => setActiveTab('files')}
            disabled={!requirementText && !requirementFile}
          >
            📁 选择文件
          </button>
          <button
            className={`qa-reviewer-tab ${activeTab === 'preview' ? 'active' : ''}`}
            onClick={() => setActiveTab('preview')}
            disabled={selectedFiles.length === 0}
          >
            📊 预览确认
          </button>
          <button
            className={`qa-reviewer-tab ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            ⚙️ 设置
          </button>
        </div>

        {/* Content */}
        <div className="qa-reviewer-content">
          {/* Upload Tab */}
          {activeTab === 'upload' && (
            <div className="qa-reviewer-upload-section">
              {/* 页面名称输入 */}
              <div className="qa-reviewer-section">
                <h3>🔍 页面匹配</h3>
                <div className="qa-reviewer-input-group">
                  <p className="qa-reviewer-hint">
                    输入页面名称（中英文皆可），系统将通过多语言包自动匹配相关文件
                  </p>
                  <div className="qa-reviewer-input-actions">
                    <input
                      type="text"
                      className="qa-reviewer-input"
                      placeholder="例如：账号管理、UserAccount、使用者帳號..."
                      value={pageNameInput}
                      onChange={(e) => setPageNameInput(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          handleSearchByPageName();
                        }
                      }}
                    />
                    <button
                      className="qa-reviewer-btn qa-reviewer-btn-primary"
                      onClick={handleSearchByPageName}
                      disabled={isLoading || !pageNameInput.trim()}
                    >
                      {isLoading ? '🔍 搜索中...' : '🔍 匹配文件'}
                    </button>
                  </div>
                  {matchedPageFiles.length > 0 && (
                    <div className="qa-reviewer-file-info">
                      ✅ 已找到 {matchedPageFiles.length} 个相关文件
                    </div>
                  )}
                </div>
              </div>

              {/* 需求文档 */}
              <div className="qa-reviewer-section">
                <h3>📄 需求文档</h3>
                <div className="qa-reviewer-input-group">
                  <div className="qa-reviewer-input-actions">
                    <button
                      className="qa-reviewer-btn qa-reviewer-btn-secondary"
                      onClick={handleSelectRequirementFile}
                    >
                      📁 上传文件
                    </button>
                    <span className="qa-reviewer-or">或</span>
                  </div>
                  {requirementFile && (
                    <div className="qa-reviewer-file-info">
                      📎 {requirementFile.split(/[/\\]/).pop()}
                      <button className="qa-reviewer-clear" onClick={() => setRequirementFile(null)}>清除</button>
                    </div>
                  )}
                  <textarea
                    className="qa-reviewer-textarea"
                    placeholder="在此粘贴需求描述，或上传文件..."
                    value={requirementText}
                    onChange={(e) => setRequirementText(e.target.value)}
                    rows={6}
                  />
                </div>
              </div>

              {/* UI 设计稿 */}
              <div className="qa-reviewer-section">
                <h3>🎨 UI 设计稿</h3>
                <div className="qa-reviewer-input-group">
                  <div className="qa-reviewer-input-actions">
                    <button
                      className="qa-reviewer-btn qa-reviewer-btn-secondary"
                      onClick={handleSelectUIImage}
                    >
                      📷 上传截图
                    </button>
                    <span className="qa-reviewer-or">或</span>
                    <input
                      type="text"
                      className="qa-reviewer-input"
                      placeholder="粘贴 Figma 链接..."
                      value={figmaUrl}
                      onChange={(e) => setFigmaUrl(e.target.value)}
                    />
                  </div>
                  {uiImage && (
                    <div className="qa-reviewer-ui-preview">
                      <img src={uiImageUrl} alt="UI 设计稿" />
                      <button className="qa-reviewer-clear" onClick={() => { setUIImage(null); setUiImageUrl(null); }}>清除</button>
                    </div>
                  )}
                </div>
              </div>

              {/* API 文档 */}
              <div className="qa-reviewer-section">
                <h3>🔌 API 文档</h3>
                <div className="qa-reviewer-input-group">
                  <div className="qa-reviewer-input-actions">
                    <button
                      className="qa-reviewer-btn qa-reviewer-btn-secondary"
                      onClick={handleSelectAPIDoc}
                    >
                      📄 上传 API 文档
                    </button>
                    <span className="qa-reviewer-hint">
                      支持 Markdown, JSON, OpenAPI 格式
                    </span>
                  </div>
                  {apiDocFile && (
                    <div className="qa-reviewer-file-info">
                      📎 {apiDocFile.split(/[/\\]/).pop()}
                      <button className="qa-reviewer-clear" onClick={handleClearAPIDoc}>清除</button>
                    </div>
                  )}
                  {apiDocContent && (
                    <div className="qa-reviewer-api-doc-preview">
                      <p className="qa-reviewer-api-doc-stats">
                        已加载 API 文档 ({apiDocContent.length} 字符)
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* 验证维度 */}
              <div className="qa-reviewer-section">
                <h3>🎯 验证维度 <span style={{ color: '#ef4444' }}>* 必填</span></h3>
                <p style={{ color: '#9ca3af', fontSize: '13px', marginBottom: '12px' }}>
                  按优先级从高到低检查，高优先级检查过的代码位置不再重复检查
                </p>
                <div className="qa-reviewer-dimensions" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                  {[
                    { key: 'requirementMatching', label: '需求匹配', icon: '🎯', priority: 1, desc: '功能正确性' },
                    { key: 'contractChecking', label: '契约检查', icon: '📋', priority: 2, desc: '接口规范性' },
                    { key: 'robustnessChecking', label: '健壮性', icon: '🛡️', priority: 3, desc: '防止崩溃/异常' },
                    { key: 'securityChecking', label: '安全性', icon: '🔒', priority: 4, desc: '防止攻击/漏洞' },
                    { key: 'accessibility', label: '可访问性', icon: '♿', priority: 5, desc: '用户体验包容性' },
                    { key: 'compatibility', label: '兼容性', icon: '🌐', priority: 6, desc: '多环境支持' },
                    { key: 'performance', label: '性能优化', icon: '⚡', priority: 7, desc: '性能效率' },
                    { key: 'maintainability', label: '可维护性', icon: '🔧', priority: 8, desc: '代码质量' },
                  ].map(dim => (
                    <label key={dim.key} className="qa-reviewer-dimension" style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '8px',
                      background: dimensions[dim.key] ? 'rgba(59, 130, 246, 0.1)' : 'rgba(75, 85, 99, 0.3)',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}>
                      <input
                        type="checkbox"
                        checked={dimensions[dim.key]}
                        onChange={(e) => setDimensions({ ...dimensions, [dim.key]: e.target.checked })}
                        style={{ marginRight: '8px' }}
                      />
                      <span style={{ fontSize: '16px', marginRight: '6px' }}>{dim.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '13px', fontWeight: dimensions[dim.key] ? 'bold' : 'normal' }}>
                          {dim.label}
                        </div>
                        <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                          P{dim.priority}: {dim.desc}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
                {Object.values(dimensions).filter(v => v).length === 0 && (
                  <div style={{ color: '#ef4444', fontSize: '14px', marginTop: '8px' }}>
                    ⚠️ 请至少选择一个验证维度
                  </div>
                )}
              </div>

              {/* 操作按钮 */}
              <div className="qa-reviewer-actions">
                <button
                  className="qa-reviewer-btn qa-reviewer-btn-primary"
                  onClick={handleParseAndPreview}
                  disabled={isLoading || (!requirementFile && !requirementText.trim()) || Object.values(dimensions).filter(v => v).length === 0}
                >
                  {isLoading ? '解析中...' : '解析并预览 →'}
                </button>
              </div>
            </div>
          )}

          {/* Files Tab */}
          {activeTab === 'files' && (
            <div className="qa-reviewer-files-section">
              {/* 从需求提取的模块 */}
              <div className="qa-reviewer-section">
                <h3>🔍 从需求中提取的页面/模块</h3>
                <div className="qa-reviewer-module-extraction">
                  <button
                    className="qa-reviewer-btn qa-reviewer-btn-secondary"
                    onClick={() => extractModulesFromRequirement()}
                    disabled={!requirementText}
                  >
                    🔄 从需求中提取模块
                  </button>
                  <p className="qa-reviewer-hint">
                    自动从需求文本中识别页面、模块和功能点
                  </p>
                </div>

                {extractedModules.length > 0 && (
                  <div className="qa-reviewer-modules-list">
                    <p className="qa-reviewer-modules-title">已识别的模块：</p>
                    <div className="qa-reviewer-modules-grid">
                      {extractedModules.map((module, index) => (
                        <label key={index} className="qa-reviewer-module-checkbox">
                          <input
                            type="checkbox"
                            checked={selectedModules.includes(module)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedModules([...selectedModules, module]);
                              } else {
                                setSelectedModules(selectedModules.filter(m => m !== module));
                              }
                            }}
                          />
                          <span>{module}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 文件列表 */}
              <div className="qa-reviewer-section">
                <div className="qa-reviewer-section-header">
                  <h3>📁 要审查的文件 ({selectedFiles.length})</h3>
                  <button
                    className="qa-reviewer-btn qa-reviewer-btn-secondary"
                    onClick={handleAddFile}
                  >
                    ➕ 添加文件
                  </button>
                </div>

                {/* 审查整个项目选项 */}
                <div className="qa-reviewer-option-row">
                  <label className="qa-reviewer-checkbox-label">
                    <input
                      type="checkbox"
                      checked={reviewEntireProject}
                      onChange={(e) => setReviewEntireProject(e.target.checked)}
                    />
                    <span>审查整个项目（不限制文件范围）</span>
                  </label>
                  <span className="qa-reviewer-hint">
                    如果勾选，将分析整个项目代码，可能需要较长时间
                  </span>
                </div>

                {selectedFiles.length === 0 ? (
                  <div className="qa-reviewer-empty-state">
                    <p>{reviewEntireProject ? '将审查整个项目' : '尚未选择任何文件'}</p>
                    {!reviewEntireProject && (
                      <button
                        className="qa-reviewer-btn qa-reviewer-btn-primary"
                        onClick={() => findFilesForModules()}
                        disabled={selectedModules.length === 0}
                      >
                        根据选择的模块自动匹配文件
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="qa-reviewer-files-list">
                    {selectedFiles.map((file, index) => {
                      const fileName = file.name || (file.path || '').split(/[/\\]/).pop();
                      const filePath = file.path || file;
                      return (
                        <div key={index} className="qa-reviewer-file-item">
                          <div className="qa-reviewer-file-info">
                            <span className="qa-reviewer-file-name">
                              {fileName}
                            </span>
                            <span
                              className="qa-reviewer-file-path"
                              title={filePath}
                            >
                              {filePath}
                            </span>
                          </div>
                          <button
                            className="qa-reviewer-file-remove"
                            onClick={() => handleRemoveFile(filePath)}
                          >
                            ✕
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 操作按钮 */}
              <div className="qa-reviewer-actions">
                <button
                  className="qa-reviewer-btn qa-reviewer-btn-secondary"
                  onClick={() => setActiveTab('upload')}
                >
                  ← 返回
                </button>
                <button
                  className="qa-reviewer-btn qa-reviewer-btn-primary"
                  onClick={() => setActiveTab('preview')}
                  disabled={selectedFiles.length === 0}
                >
                  下一步：预览确认 →
                </button>
              </div>
            </div>
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <div className="qa-reviewer-settings-section">
              <div className="qa-reviewer-section">
                <h3>⚙️ 分段策略</h3>
                <div className="qa-reviewer-form-group">
                  <label>分段方式</label>
                  <select
                    className="qa-reviewer-select"
                    value={segmentStrategy}
                    onChange={(e) => setSegmentStrategy(e.target.value)}
                  >
                    <option value="by_feature">按功能模块（推荐）</option>
                    <option value="by_file">按文件</option>
                    <option value="by_dependency">按依赖层级</option>
                  </select>
                </div>
                <div className="qa-reviewer-form-group">
                  <label>并行分段数: {parallelSegments}</label>
                  <input
                    type="range"
                    min="1"
                    max="4"
                    value={parallelSegments}
                    onChange={(e) => setParallelSegments(parseInt(e.target.value))}
                  />
                </div>
                <div className="qa-reviewer-form-group">
                  <label>每段最大文件数</label>
                  <input
                    type="number"
                    min="5"
                    max="50"
                    value={maxFilesPerSegment}
                    onChange={(e) => setMaxFilesPerSegment(parseInt(e.target.value))}
                  />
                </div>
              </div>

              <div className="qa-reviewer-section">
                <h3>🔄 其他选项</h3>
                <label className="qa-reviewer-checkbox">
                  <input
                    type="checkbox"
                    checked={incrementalMode}
                    onChange={(e) => setIncrementalMode(e.target.checked)}
                  />
                  <span>仅审查变更文件（Git diff）</span>
                </label>
              </div>

              <div className="qa-reviewer-actions">
                <button
                  className="qa-reviewer-btn qa-reviewer-btn-secondary"
                  onClick={() => setActiveTab('upload')}
                >
                  ← 返回
                </button>
              </div>
            </div>
          )}

          {/* Preview Tab */}
          {activeTab === 'preview' && (
            <div className="qa-reviewer-preview-section">
              {/* 审查摘要 */}
              <div className="qa-reviewer-summary">
                <h3>📋 审查摘要</h3>
                <div className="qa-reviewer-summary-stats">
                  <div className="qa-reviewer-stat">
                    <span className="qa-reviewer-stat-value">{selectedFiles.length}</span>
                    <span className="qa-reviewer-stat-label">文件数</span>
                  </div>
                  <div className="qa-reviewer-stat">
                    <span className="qa-reviewer-stat-value">{selectedModules.length}</span>
                    <span className="qa-reviewer-stat-label">模块数</span>
                  </div>
                  <div className="qa-reviewer-stat">
                    <span className="qa-reviewer-stat-value">
                      {Object.values(dimensions).filter(v => v).length}
                    </span>
                    <span className="qa-reviewer-stat-label">验证维度</span>
                  </div>
                </div>
              </div>

              {/* 需求预览 */}
              <div className="qa-reviewer-section">
                <h3>📄 需求内容</h3>
                <div className="qa-reviewer-requirement-preview">
                  {requirementText ? (
                    <div className="qa-reviewer-requirement-text">
                      {requirementText.length > 300
                        ? requirementText.substring(0, 300) + '...'
                        : requirementText}
                    </div>
                  ) : requirementFile ? (
                    <div className="qa-reviewer-file-info">
                      📎 {requirementFile.split(/[/\\]/).pop()}
                    </div>
                  ) : (
                    <p className="qa-reviewer-empty-text">未提供需求</p>
                  )}
                </div>
              </div>

              {/* 选择的文件列表 */}
              <div className="qa-reviewer-section">
                <div className="qa-reviewer-section-header">
                  <h3>📁 将要审查的文件 ({selectedFiles.length})</h3>
                </div>
                <div className="qa-reviewer-files-preview">
                  {selectedFiles.length === 0 ? (
                    <p className="qa-reviewer-empty-text">未选择任何文件</p>
                  ) : (
                    <>
                      <div className="qa-reviewer-files-grid">
                        {selectedFiles.map((file, index) => (
                          <div key={index} className="qa-reviewer-file-item-small">
                            <span className="qa-reviewer-file-icon">📄</span>
                            <span className="qa-reviewer-file-name-small" title={file.path || file}>
                              {file.name || file.path.split(/[/\\]/).pop()}
                            </span>
                          </div>
                        ))}
                      </div>
                      {selectedFiles.length > 50 && (
                        <p className="qa-reviewer-files-note">
                          💡 文件数量较多，将自动进行分段处理以提高效率
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* 执行进度 */}
              {executionProgress && (
                <div className="qa-reviewer-progress-section">
                  <h3>⏳ 执行进度</h3>
                  <div className="qa-reviewer-progress-bar">
                    <div
                      className={`qa-reviewer-progress-fill ${executionProgress.status === 'rate-limit' ? 'qa-reviewer-progress-warning' : ''} ${executionProgress.status === 'completed' ? 'qa-reviewer-progress-success' : ''}`}
                      style={{ width: `${executionProgress.percent || 0}%` }}
                    />
                  </div>
                  <p className="qa-reviewer-progress-message">
                    {executionProgress.percent || 0}% - {executionProgress.message || '准备中...'}
                    {executionProgress.status === 'rate-limit' && (
                      <span className="qa-reviewer-rate-limit-hint"> ⏳ 等待重试中...</span>
                    )}
                  </p>

                  {/* 审查完成后展示八维结果 */}
                  {executionProgress.status === 'completed' && executionProgress.result && (
                    <div style={{ marginTop: '16px' }}>
                      {renderThreeDimensionalResults(executionProgress.result)}

                      {/* 问题列表 */}
                      {executionProgress.result.issues?.length > 0 && (
                        <div style={{ marginTop: '16px' }}>
                          <h4 style={{ color: '#fff', marginBottom: '8px' }}>
                            问题详情 ({executionProgress.result.issues.length} 个)
                          </h4>
                          <div style={{ maxHeight: '200px', overflowY: 'auto', background: 'rgba(0,0,0,0.3)', borderRadius: '8px', padding: '12px' }}>
                            {executionProgress.result.issues.slice(0, 20).map((issue, index) => (
                              <div key={index} style={{
                                padding: '6px 0',
                                borderBottom: index < Math.min(20, executionProgress.result.issues.length) - 1 ? '1px solid rgba(255,255,255,0.1)' : 'none',
                                fontSize: '12px',
                              }}>
                                <span style={{
                                  color: issue.severity === 'high' ? '#ef4444' : issue.severity === 'low' ? '#22c55e' : '#eab308',
                                  marginRight: '8px',
                                  fontWeight: 'bold',
                                }}>
                                  [{issue.severity || 'medium'}]
                                </span>
                                <span style={{ color: '#d1d5db' }}>
                                  {issue.file || issue.filePath || '未知文件'}:{issue.line || 0}
                                </span>
                                <div style={{ color: '#9ca3af', marginTop: '2px' }}>{issue.message || '无描述'}</div>
                              </div>
                            ))}
                            {executionProgress.result.issues.length > 20 && (
                              <div style={{ color: '#6b7280', fontSize: '11px', textAlign: 'center', padding: '8px' }}>
                                ... 还有 {executionProgress.result.issues.length - 20} 个问题
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* TODO 结果 */}
                      {executionProgress.result.todoResult && (
                        <div style={{ marginTop: '12px', background: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '8px', padding: '10px', fontSize: '12px', color: '#d1d5db' }}>
                          TODO 注释: 已添加 {executionProgress.result.todoResult.added || 0} 个
                          {executionProgress.result.todoResult.noLineNumber > 0 && (
                            <span style={{ color: '#eab308' }}> | {executionProgress.result.todoResult.noLineNumber} 个缺少行号</span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="qa-reviewer-actions">
                {executionProgress?.status === 'completed' ? (
                  <button
                    className="qa-reviewer-btn qa-reviewer-btn-secondary"
                    onClick={onClose}
                  >
                    关闭
                  </button>
                ) : (
                  <>
                    <button
                      className="qa-reviewer-btn qa-reviewer-btn-secondary"
                      onClick={() => setActiveTab('files')}
                    >
                      ← 返回修改
                    </button>
                    <button
                      className="qa-reviewer-btn qa-reviewer-btn-success"
                      onClick={handleStartReview}
                      disabled={isLoading || executionProgress?.status === 'running' || executionProgress?.status === 'rate-limit'}
                    >
                      {executionProgress?.status === 'rate-limit' ? '⏳ 等待重试...' :
                       isLoading ? '执行中...' : '🚀 开始审查'}
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default QAReviewerModal;
