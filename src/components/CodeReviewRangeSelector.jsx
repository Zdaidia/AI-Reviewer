/**
 * Code Review Range Selector Modal
 *
 * 用于传统 Code Review 时选择审查范围：
 * - 全部问题（所有已扫描的问题）
 * - 部分审查：
 *   - 模块名输入（筛选相关文件的问题）
 *   - 手动选择文件（只 Review 选中的文件）
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';

function CodeReviewRangeSelector({
  isOpen,
  onClose,
  onReview,
  projectPath,
  electronAPI,
  problems // 当前已扫描的所有问题列表
}) {
  // 审查范围选择
  const [reviewScope, setReviewScope] = useState('all'); // 'all' | 'partial'

  // 是否使用最新规则重新扫描
  const [rescanWithLatestRules, setRescanWithLatestRules] = useState(true); // 默认重新扫描

  // 模块搜索
  const [moduleName, setModuleName] = useState('');
  const [moduleSearchResults, setModuleSearchResults] = useState([]);
  const [selectedModuleFiles, setSelectedModuleFiles] = useState(new Set());
  const [isSearchingModule, setIsSearchingModule] = useState(false);

  // 手动选择文件
  const [manualSelectedFiles, setManualSelectedFiles] = useState([]);

  // 统计各文件的问题数量
  const problemsByFile = useMemo(() => {
    const map = new Map();
    if (!problems || !Array.isArray(problems)) return map;

    problems.forEach(issue => {
      if (!issue || !issue.filePath) return;
      const count = map.get(issue.filePath) || 0;
      map.set(issue.filePath, count + 1);
    });
    return map;
  }, [problems]);

  // 有问题的文件列表
  const filesWithProblems = useMemo(() => {
    return Array.from(problemsByFile.keys());
  }, [problemsByFile]);

  // 筛选后的文件列表（用于部分审查）
  const filteredFiles = useMemo(() => {
    if (reviewScope === 'all') {
      return filesWithProblems;
    }

    const selected = new Set([...selectedModuleFiles, ...manualSelectedFiles]);
    return filesWithProblems.filter(f => selected.has(f));
  }, [reviewScope, filesWithProblems, selectedModuleFiles, manualSelectedFiles]);

  // 筛选后的 problems 数量
  const filteredProblemCount = useMemo(() => {
    if (reviewScope === 'all') {
      return problems?.length || 0;
    }

    return filteredFiles.reduce((sum, f) => sum + (problemsByFile.get(f) || 0), 0);
  }, [reviewScope, problems, filteredFiles, problemsByFile]);

  // 搜索模块相关文件
  const handleSearchModule = useCallback(async () => {
    if (!moduleName.trim() || !projectPath || !electronAPI) {
      return;
    }

    setIsSearchingModule(true);
    setModuleSearchResults([]);
    setSelectedModuleFiles(new Set());

    try {
      const result = await electronAPI.searchFilesByPageName({
        projectPath,
        pageName: moduleName.trim(),
      });

      if (result.success && result.files && result.files.length > 0) {
        // 只保留有问题的文件
        const filesWithIssues = result.files.filter(f => {
          const filePath = f.path || f;
          return problemsByFile.has(filePath);
        });
        setModuleSearchResults(filesWithIssues);
        // 默认全选有问题的文件
        const allPaths = filesWithIssues.map(f => f.path || f);
        setSelectedModuleFiles(new Set(allPaths));
      } else {
        setModuleSearchResults([]);
      }
    } catch (error) {
      console.error('[CodeReviewRangeSelector] 搜索模块失败:', error);
      setModuleSearchResults([]);
    } finally {
      setIsSearchingModule(false);
    }
  }, [moduleName, projectPath, electronAPI, problemsByFile]);

  // 选择文件
  const handleSelectFiles = useCallback(async () => {
    if (!electronAPI) return;
    try {
      const result = await electronAPI.selectFile({
        title: '选择要 Review 的文件',
        filters: [
          { name: '代码文件', extensions: ['dart', 'js', 'jsx', 'ts', 'tsx', 'vue', 'html', 'css'] },
          { name: '所有文件', extensions: ['*'] },
        ],
        properties: ['openFile', 'multiSelections'],
      });

      if (result && result.filePaths) {
        // 只保留有问题的文件
        const validFiles = result.filePaths.filter(p => problemsByFile.has(p));
        const newFiles = validFiles.filter(p => !manualSelectedFiles.includes(p));
        setManualSelectedFiles(prev => [...prev, ...newFiles]);
      }
    } catch (error) {
      console.error('[CodeReviewRangeSelector] 选择文件失败:', error);
    }
  }, [electronAPI, manualSelectedFiles, problemsByFile]);

  // 从问题列表中选择文件
  const handleSelectFromProblems = useCallback((filePath) => {
    setManualSelectedFiles(prev => {
      if (prev.includes(filePath)) {
        return prev.filter(p => p !== filePath);
      }
      return [...prev, filePath];
    });
  }, []);

  // 切换模块文件的选中状态
  const handleToggleModuleFile = useCallback((filePath) => {
    setSelectedModuleFiles(prev => {
      const newSet = new Set(prev);
      if (newSet.has(filePath)) {
        newSet.delete(filePath);
      } else {
        newSet.add(filePath);
      }
      return newSet;
    });
  }, []);

  // 移除选中的文件
  const handleRemoveFile = useCallback((path) => {
    setManualSelectedFiles(prev => prev.filter(p => p !== path));
  }, []);

  // 开始 Review
  const handleStartReview = useCallback(() => {
    if (reviewScope === 'all') {
      // 全部审查
      onReview({
        scope: 'all',
        files: filesWithProblems,
        problems: problems,
        rescanWithLatestRules: rescanWithLatestRules // 是否重新扫描
      });
    } else {
      // 部分审查
      if (filteredFiles.length === 0) {
        alert('请先选择要 Review 的文件');
        return;
      }

      // 篮选只保留选定文件的 problems
      const filteredProblems = problems.filter(p => filteredFiles.includes(p.filePath));

      onReview({
        scope: 'partial',
        files: filteredFiles,
        problems: filteredProblems,
        rescanWithLatestRules: rescanWithLatestRules // 是否重新扫描
      });
    }

    onClose();
  }, [reviewScope, filesWithProblems, problems, filteredFiles, onReview, onClose, rescanWithLatestRules]);

  // 获取文件类型图标
  const getFileIcon = (filePath) => {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const icons = {
      dart: '📄',
      js: '📄',
      jsx: '📄',
      ts: '📄',
      tsx: '📄',
      vue: '📄',
      html: '🌐',
      css: '🎨',
    };
    return icons[ext] || '📄';
  };

  // 获取文件名
  const getFileName = (filePath) => {
    return filePath.split('/').pop() || filePath.split('\\').pop() || filePath;
  };

  // 如果未打开，不渲染
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl border border-gray-700 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 flex-shrink-0">
          <div>
            <h3 className="text-lg font-semibold text-white">选择 Code Review 范围</h3>
            <p className="text-sm text-gray-400 mt-1">
              当前共 {problems?.length || 0} 个问题，分布在 {filesWithProblems.length} 个文件
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {/* 审查范围选择 */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-300 mb-3">审查范围</label>
            <div className="space-y-2">
              <button
                onClick={() => setReviewScope('all')}
                className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                  reviewScope === 'all'
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-gray-700 bg-gray-700/30 hover:bg-gray-700/50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">📋</span>
                  <div>
                    <div className="font-medium text-white">全部审查</div>
                    <div className="text-sm text-gray-400">审查所有已扫描的问题（{problems?.length || 0} 个）</div>
                  </div>
                  {reviewScope === 'all' && (
                    <div className="ml-auto w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  )}
                </div>
              </button>

              <button
                onClick={() => setReviewScope('partial')}
                className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                  reviewScope === 'partial'
                    ? 'border-purple-500 bg-purple-500/10'
                    : 'border-gray-700 bg-gray-700/30 hover:bg-gray-700/50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">🎯</span>
                  <div>
                    <div className="font-medium text-white">部分审查</div>
                    <div className="text-sm text-gray-400">只审查指定文件或模块的问题</div>
                  </div>
                  {reviewScope === 'partial' && (
                    <div className="ml-auto w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  )}
                </div>
              </button>
            </div>
          </div>

          {/* 部分审查选项 */}
          {reviewScope === 'partial' && (
            <div className="space-y-6">
              {/* 模块名称输入 */}
              <div className="bg-gray-700/30 rounded-lg p-4 border border-gray-700">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-3">
                  <span className="text-lg">🔍</span>
                  模块名称输入
                  <span className="text-xs text-gray-500">（自动筛选有问题的相关文件）</span>
                </label>

                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    value={moduleName}
                    onChange={(e) => setModuleName(e.target.value)}
                    placeholder="输入功能模块名称，如：登录、账号、首页..."
                    className="flex-1 px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none"
                  />
                  <button
                    onClick={handleSearchModule}
                    disabled={!moduleName.trim() || isSearchingModule}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                  >
                    {isSearchingModule ? '搜索中...' : '查找'}
                  </button>
                </div>

                {/* 搜索结果 */}
                {moduleSearchResults.length > 0 && (
                  <div className="mt-3">
                    <div className="text-xs text-gray-400 mb-2">
                      找到 {moduleSearchResults.length} 个有问题的相关文件：
                    </div>
                    <div className="bg-gray-900 rounded-lg p-2 max-h-48 overflow-y-auto">
                      {moduleSearchResults.map((file) => {
                        const filePath = file.path || file;
                        const isSelected = selectedModuleFiles.has(filePath);
                        const problemCount = problemsByFile.get(filePath) || 0;

                        return (
                          <div
                            key={filePath}
                            onClick={() => handleToggleModuleFile(filePath)}
                            className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${
                              isSelected ? 'bg-purple-500/20' : 'hover:bg-gray-700/50'
                            }`}
                          >
                            <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                              isSelected ? 'bg-purple-500 border-purple-500' : 'border-gray-500'
                            }`}>
                              {isSelected && (
                                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              )}
                            </div>
                            <span className="text-lg">{getFileIcon(filePath)}</span>
                            <span className="text-sm text-white truncate flex-1">{getFileName(filePath)}</span>
                            <span className="text-xs px-2 py-1 bg-red-500/20 text-red-400 rounded">
                              {problemCount} 个问题
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* 从问题列表选择 */}
              <div className="bg-gray-700/30 rounded-lg p-4 border border-gray-700">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-3">
                  <span className="text-lg">📂</span>
                  从问题列表选择文件
                  <span className="text-xs text-gray-500">（点击选中/取消）</span>
                </label>

                {/* 已选择的文件 */}
                {manualSelectedFiles.length > 0 && (
                  <div className="mb-3 bg-gray-900 rounded-lg p-2">
                    <div className="text-xs text-gray-400 mb-2">已选择 {manualSelectedFiles.length} 个文件：</div>
                    {manualSelectedFiles.map((path) => (
                      <div key={path} className="flex items-center gap-2 p-2 hover:bg-gray-700/50 rounded">
                        <span className="text-lg">{getFileIcon(path)}</span>
                        <span className="text-sm text-white truncate flex-1">{getFileName(path)}</span>
                        <span className="text-xs px-2 py-1 bg-red-500/20 text-red-400 rounded">
                          {problemsByFile.get(path) || 0} 个问题
                        </span>
                        <button
                          onClick={() => handleRemoveFile(path)}
                          className="text-gray-400 hover:text-red-400 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* 所有有问题的文件列表 */}
                <div className="bg-gray-900 rounded-lg p-2 max-h-48 overflow-y-auto">
                  <div className="text-xs text-gray-400 mb-2">所有有问题的文件（点击选中）：</div>
                  {filesWithProblems.map((filePath) => {
                    const isSelected = manualSelectedFiles.includes(filePath) || selectedModuleFiles.has(filePath);
                    const problemCount = problemsByFile.get(filePath) || 0;

                    return (
                      <div
                        key={filePath}
                        onClick={() => handleSelectFromProblems(filePath)}
                        className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${
                          isSelected ? 'bg-purple-500/20 opacity-60' : 'hover:bg-gray-700/50'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                          isSelected ? 'bg-purple-500 border-purple-500' : 'border-gray-500'
                        }`}>
                          {isSelected && (
                            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </div>
                        <span className="text-lg">{getFileIcon(filePath)}</span>
                        <span className="text-sm text-white truncate flex-1">{getFileName(filePath)}</span>
                        <span className="text-xs px-2 py-1 bg-red-500/20 text-red-400 rounded">
                          {problemCount} 个问题
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-700 bg-gray-900/50 flex-shrink-0">
          {/* 重新扫描选项 */}
          <div className="flex items-center gap-2 mb-3">
            <div
              onClick={() => setRescanWithLatestRules(!rescanWithLatestRules)}
              className={`w-5 h-5 rounded border flex items-center justify-center cursor-pointer transition-colors ${
                rescanWithLatestRules
                  ? 'bg-green-500 border-green-500'
                  : 'border-gray-500 hover:border-gray-400'
              }`}
            >
              {rescanWithLatestRules && (
                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </div>
            <label
              onClick={() => setRescanWithLatestRules(!rescanWithLatestRules)}
              className="text-sm text-gray-300 cursor-pointer select-none"
            >
              使用最新规则重新扫描
            </label>
            <span className="text-xs text-gray-500">
              （推荐：确保使用最新的规则配置）
            </span>
          </div>

          <div className="flex items-center justify-between mb-3">
            <div className="text-sm text-gray-400">
              {reviewScope === 'all'
                ? `将审查全部 ${problems?.length || 0} 个问题`
                : `将审查 ${filteredProblemCount} 个问题（${filteredFiles.length} 个文件）`}
              {rescanWithLatestRules && (
                <span className="text-green-400 ml-2">（重新扫描）</span>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-300 hover:text-white transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleStartReview}
              disabled={reviewScope === 'partial' && filteredProblemCount === 0}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
            >
              开始 Review
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CodeReviewRangeSelector;