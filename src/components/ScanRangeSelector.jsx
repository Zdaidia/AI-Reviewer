/**
 * Scan Range Selector Modal
 *
 * Allows users to select scan scope:
 * - Entire project (all files)
 * - Partial scan:
 *   - Module name input (auto-find related files via code graph)
 *   - Manual file/folder selection
 *   - Include dependencies option
 */

import React, { useState, useEffect, useCallback } from 'react';

function ScanRangeSelector({
  isOpen,
  onClose,
  onScan,
  projectPath,
  electronAPI
}) {
  // 扫描范围选择
  const [scanScope, setScanScope] = useState('all'); // 'all' | 'partial'

  // 模块搜索
  const [moduleName, setModuleName] = useState('');
  const [moduleSearchResults, setModuleSearchResults] = useState([]);
  const [selectedModuleFiles, setSelectedModuleFiles] = useState(new Set());
  const [isSearchingModule, setIsSearchingModule] = useState(false);

  // 手动选择
  const [manualSelectedFiles, setManualSelectedFiles] = useState([]);
  const [manualSelectedFolders, setManualSelectedFolders] = useState([]);

  // 依赖扩展选项
  const [includeDependencies, setIncludeDependencies] = useState(true);
  const [includeReferencedBy, setIncludeReferencedBy] = useState(false);

  // 最终文件列表
  const [finalFileList, setFinalFileList] = useState([]);
  const [isLoadingDependencies, setIsLoadingDependencies] = useState(false);

  // 原始文件数量（不含依赖扩展），用于显示扩展效果
  const [baseFileCount, setBaseFileCount] = useState(0);

  // 计算最终扫描文件列表（含依赖扩展）
  useEffect(() => {
    if (!isOpen) return;
    if (scanScope === 'all') {
      setFinalFileList([]);
      setBaseFileCount(0);
      return;
    }

    // 合并所有选择的文件
    let baseFiles = [];

    // 模块搜索结果中选中的文件
    if (selectedModuleFiles.size > 0) {
      baseFiles = [...baseFiles, ...Array.from(selectedModuleFiles)];
    }

    // 手动选择的文件
    if (manualSelectedFiles.length > 0) {
      baseFiles = [...baseFiles, ...manualSelectedFiles];
    }

    // 去重
    baseFiles = [...new Set(baseFiles)];

    // 记录原始文件数量
    setBaseFileCount(baseFiles.length);

    // 如果没有选中文件，清空列表
    if (baseFiles.length === 0) {
      setFinalFileList([]);
      return;
    }

    // 如果需要依赖扩展，调用异步 API
    if (includeDependencies || includeReferencedBy) {
      setIsLoadingDependencies(true);

      // 根据选项决定查询方向
      // 如果同时选择两个，需要分别查询然后合并
      const fetchPromises = [];

      if (includeDependencies) {
        fetchPromises.push(
          electronAPI.getFileDependencies(projectPath, baseFiles, 'imports')
            .then(result => result.success ? result.dependencies || [] : [])
            .catch(() => [])
        );
      }

      if (includeReferencedBy) {
        fetchPromises.push(
          electronAPI.getFileDependencies(projectPath, baseFiles, 'referencedBy')
            .then(result => result.success ? result.dependencies || [] : [])
            .catch(() => [])
        );
      }

      // 并行获取所有依赖
      Promise.all(fetchPromises)
        .then(results => {
          setIsLoadingDependencies(false);

          // 合并所有依赖文件
          const allDependencies = results.flat();
          const extendedFiles = [...baseFiles, ...allDependencies];
          const uniqueFiles = [...new Set(extendedFiles)];

          console.log('[ScanRangeSelector] 依赖扩展完成，原始文件:', baseFiles.length, '依赖文件:', allDependencies.length, '总计:', uniqueFiles.length);
          setFinalFileList(uniqueFiles);
        })
        .catch(error => {
          console.error('[ScanRangeSelector] 获取依赖失败:', error);
          setIsLoadingDependencies(false);
          // 失败时只使用基础文件列表
          setFinalFileList(baseFiles);
        });
    } else {
      // 不需要依赖扩展，直接使用基础文件列表
      setFinalFileList(baseFiles);
    }
  }, [isOpen, scanScope, selectedModuleFiles, manualSelectedFiles, manualSelectedFolders, includeDependencies, includeReferencedBy, projectPath, electronAPI]);

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
        setModuleSearchResults(result.files);
        // 默认全选搜索结果
        const allPaths = result.files.map(f => f.path || f);
        setSelectedModuleFiles(new Set(allPaths));
      } else {
        setModuleSearchResults([]);
      }
    } catch (error) {
      console.error('[ScanRangeSelector] 搜索模块失败:', error);
      setModuleSearchResults([]);
    } finally {
      setIsSearchingModule(false);
    }
  }, [moduleName, projectPath, electronAPI]);

  // 选择文件
  const handleSelectFiles = useCallback(async () => {
    if (!electronAPI) return;
    try {
      const result = await electronAPI.selectFile({
        title: '选择要扫描的文件',
        filters: [
          { name: '代码文件', extensions: ['dart', 'js', 'jsx', 'ts', 'tsx', 'vue', 'html', 'css'] },
          { name: '所有文件', extensions: ['*'] },
        ],
        properties: ['openFile', 'multiSelections'],
      });

      if (result && result.filePaths) {
        const newFiles = result.filePaths.filter(p => !manualSelectedFiles.includes(p));
        setManualSelectedFiles(prev => [...prev, ...newFiles]);
      }
    } catch (error) {
      console.error('[ScanRangeSelector] 选择文件失败:', error);
    }
  }, [electronAPI, manualSelectedFiles]);

  // 选择文件夹
  const handleSelectFolder = useCallback(async () => {
    if (!electronAPI) return;
    try {
      const result = await electronAPI.selectFolder();

      if (result && result.filePaths) {
        const newFolders = result.filePaths.filter(p => !manualSelectedFolders.includes(p));
        setManualSelectedFolders(prev => [...prev, ...newFolders]);
      }
    } catch (error) {
      console.error('[ScanRangeSelector] 选择文件夹失败:', error);
    }
  }, [electronAPI, manualSelectedFolders]);

  // 移除选中的文件/文件夹
  const handleRemoveFile = useCallback((path) => {
    setManualSelectedFiles(prev => prev.filter(p => p !== path));
  }, []);

  const handleRemoveFolder = useCallback((path) => {
    setManualSelectedFolders(prev => prev.filter(p => p !== path));
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

  // 开始扫描
  const handleStartScan = useCallback(() => {
    if (scanScope === 'all') {
      // 全部扫描
      onScan({
        type: 'directory',
        path: projectPath,
        scope: 'all',
        options: {
          useAST: true,
          saveGraph: true,
        }
      });
    } else {
      // 部分扫描
      if (finalFileList.length === 0 && manualSelectedFolders.length === 0) {
        alert('请先选择要扫描的文件或文件夹');
        return;
      }

      onScan({
        type: 'partial',
        files: finalFileList,
        folders: manualSelectedFolders,
        scope: 'partial',
        options: {
          useAST: true,
          saveGraph: false,
        }
      });
    }

    onClose();
  }, [scanScope, projectPath, finalFileList, manualSelectedFolders, onScan, onClose]);

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

  // 获取文件类型标签
  const getFileTypeLabel = (file) => {
    if (file.fileType) {
      const typeLabels = {
        view: '视图',
        controller: '控制器',
        service: '服务',
        model: '模型',
        api: 'API',
        util: '工具',
        widget: '组件',
      };
      return typeLabels[file.fileType] || '';
    }
    return '';
  };

  // 如果未打开，不渲染
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl border border-gray-700 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h3 className="text-lg font-semibold text-white">选择扫描范围</h3>
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
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
          {/* 扫描范围选择 */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-300 mb-3">扫描范围</label>
            <div className="space-y-2">
              <button
                onClick={() => setScanScope('all')}
                className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                  scanScope === 'all'
                    ? 'border-purple-500 bg-purple-500/10'
                    : 'border-gray-700 bg-gray-700/30 hover:bg-gray-700/50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">📁</span>
                  <div>
                    <div className="font-medium text-white">全部项目</div>
                    <div className="text-sm text-gray-400">扫描项目根目录下所有代码文件</div>
                  </div>
                  {scanScope === 'all' && (
                    <div className="ml-auto w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  )}
                </div>
              </button>

              <button
                onClick={() => setScanScope('partial')}
                className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                  scanScope === 'partial'
                    ? 'border-purple-500 bg-purple-500/10'
                    : 'border-gray-700 bg-gray-700/30 hover:bg-gray-700/50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">🎯</span>
                  <div>
                    <div className="font-medium text-white">部分扫描</div>
                    <div className="text-sm text-gray-400">只扫描指定的模块或文件</div>
                  </div>
                  {scanScope === 'partial' && (
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

          {/* 部分扫描选项 */}
          {scanScope === 'partial' && (
            <div className="space-y-6">
              {/* 模块名称输入 */}
              <div className="bg-gray-700/30 rounded-lg p-4 border border-gray-700">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-3">
                  <span className="text-lg">🔍</span>
                  模块名称输入
                  <span className="text-xs text-gray-500">（自动识别相关文件）</span>
                </label>

                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    value={moduleName}
                    onChange={(e) => setModuleName(e.target.value)}
                    placeholder="输入功能模块名称，如：登录、账号、首页..."
                    className="flex-1 placeholder-gray-500"
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
                      找到 {moduleSearchResults.length} 个相关文件，点击勾选：
                    </div>
                    <div className="bg-gray-900 rounded-lg p-2 max-h-48 overflow-y-auto">
                      {moduleSearchResults.map((file) => {
                        const filePath = file.path || file;
                        const fileName = filePath.split('/').pop() || filePath.split('\\').pop();
                        const isSelected = selectedModuleFiles.has(filePath);
                        const typeLabel = getFileTypeLabel(file);

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
                            <span className="text-sm text-white truncate flex-1">{fileName}</span>
                            {typeLabel && (
                              <span className="text-xs px-2 py-1 bg-gray-700 rounded text-gray-300">{typeLabel}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* 手动选择文件/文件夹 */}
              <div className="bg-gray-700/30 rounded-lg p-4 border border-gray-700">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-3">
                  <span className="text-lg">📂</span>
                  手动选择文件/文件夹
                </label>

                {/* 已选择的列表 */}
                {(manualSelectedFiles.length > 0 || manualSelectedFolders.length > 0) && (
                  <div className="mb-3 bg-gray-900 rounded-lg p-2">
                    <div className="text-xs text-gray-400 mb-2">已选择 {manualSelectedFiles.length + manualSelectedFolders.length} 项：</div>

                    {manualSelectedFolders.map((path) => (
                      <div key={path} className="flex items-center gap-2 p-2 hover:bg-gray-700/50 rounded">
                        <span className="text-lg">📁</span>
                        <span className="text-sm text-white truncate flex-1">{path}</span>
                        <button
                          onClick={() => handleRemoveFolder(path)}
                          className="text-gray-400 hover:text-red-400 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}

                    {manualSelectedFiles.map((path) => (
                      <div key={path} className="flex items-center gap-2 p-2 hover:bg-gray-700/50 rounded">
                        <span className="text-lg">{getFileIcon(path)}</span>
                        <span className="text-sm text-white truncate flex-1">{path.split('/').pop() || path.split('\\').pop()}</span>
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

                {/* 添加按钮 */}
                <div className="flex gap-2">
                  <button
                    onClick={handleSelectFiles}
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors flex items-center gap-2"
                  >
                    <span>📄</span>
                    添加文件
                  </button>
                  <button
                    onClick={handleSelectFolder}
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors flex items-center gap-2"
                  >
                    <span>📁</span>
                    添加文件夹
                  </button>
                </div>
              </div>

              {/* 依赖扩展选项 */}
              <div className="bg-gray-700/30 rounded-lg p-4 border border-gray-700">
                <label className="block text-sm font-medium text-gray-300 mb-3">依赖扩展</label>

                <div className="space-y-2">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeDependencies}
                      onChange={(e) => setIncludeDependencies(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-600 text-purple-600 focus:ring-purple-500"
                    />
                    <span className="text-sm text-gray-300">自动包含依赖文件</span>
                    <span className="text-xs text-gray-500">（解析 import，添加相关文件）</span>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeReferencedBy}
                      onChange={(e) => setIncludeReferencedBy(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-600 text-purple-600 focus:ring-purple-500"
                    />
                    <span className="text-sm text-gray-300">包含被引用文件</span>
                    <span className="text-xs text-gray-500">（其他文件引用了选中文件）</span>
                  </label>
                </div>

                {isLoadingDependencies && (
                  <div className="mt-2 text-xs text-yellow-500">正在分析依赖关系...</div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-700 bg-gray-900/50">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm text-gray-400">
              {scanScope === 'all'
                ? '将扫描整个项目'
                : isLoadingDependencies
                  ? '正在分析依赖关系...'
                  : (() => {
                      const total = finalFileList.length + manualSelectedFolders.length;
                      const expanded = finalFileList.length - baseFileCount;
                      if (expanded > 0) {
                        return `当前扫描范围：${baseFileCount} 个选定文件 + ${expanded} 个依赖文件，共 ${total} 个`;
                      }
                      return `当前扫描范围：共 ${total} 个文件/文件夹`;
                    })()}
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
              onClick={handleStartScan}
              disabled={isLoadingDependencies || (scanScope === 'partial' && (finalFileList.length === 0 && manualSelectedFolders.length === 0))}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
            >
              {isLoadingDependencies ? '分析依赖中...' : '开始扫描'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ScanRangeSelector;