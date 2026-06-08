/**
 * Scan Options Modal
 *
 * Allows users to select what to scan:
 * - Entire project folder
 * - Current folder
 * - Current file
 */

import React, { useState } from 'react';

function ScanModal({ isOpen, onClose, onScan, selectedFile, projectPath }) {
  const [selectedOption, setSelectedOption] = useState('project');
  const [useAST, setUseAST] = useState(true);
  const [saveGraph, setSaveGraph] = useState(true);  // 默认保存代码图，以便生成 AI Context

  if (!isOpen) return null;

  const handleScan = () => {
    let targetPath = null;
    let targetType = 'auto';

    switch (selectedOption) {
      case 'project':
        targetPath = projectPath;
        targetType = 'directory';
        break;
      case 'folder':
        // Get parent directory of current file
        if (selectedFile?.path) {
          const parts = selectedFile.path.replace(/\\/g, '/').split('/');
          parts.pop();
          targetPath = parts.join('/');
        } else {
          targetPath = projectPath;
        }
        targetType = 'directory';
        break;
      case 'file':
        targetPath = selectedFile?.path;
        targetType = 'file';
        break;
    }

    if (!targetPath) {
      onScan({ error: '请先添加文件或文件夹' });
      return;
    }

    onScan({
      type: targetType,
      path: targetPath,
      options: {
        useAST,
        saveGraph,
        graphOutputPath: null  // 不再保存到项目目录，只保存在工具目录
      }
    });
    onClose();
  };

  const getParentDir = (filePath) => {
    if (!filePath) return null;
    const parts = filePath.replace(/\\/g, '/').split('/');
    parts.pop();
    return parts.join('/');
  };

  const options = [
    {
      id: 'project',
      icon: '📁',
      title: '扫描整个项目',
      description: '扫描项目根目录下的所有文件',
      path: projectPath,
      available: !!projectPath
    },
    {
      id: 'folder',
      icon: '📂',
      title: '扫描当前文件夹',
      description: '扫描当前选中文件所在的文件夹',
      path: selectedFile?.path ? getParentDir(selectedFile.path) : null,
      available: !!(selectedFile?.path)
    },
    {
      id: 'file',
      icon: '📄',
      title: '扫描当前文件',
      description: '仅扫描当前选中的文件',
      path: selectedFile?.path,
      available: !!(selectedFile?.path)
    }
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg border border-gray-700">
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

        {/* Options */}
        <div className="p-4 space-y-2">
          {options.map((option) => (
            <button
              key={option.id}
              onClick={() => option.available && setSelectedOption(option.id)}
              disabled={!option.available}
              className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                selectedOption === option.id
                  ? 'border-purple-500 bg-purple-500/10'
                  : 'border-gray-700 bg-gray-700/30 hover:bg-gray-700/50'
              } ${!option.available ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl">{option.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-white">{option.title}</div>
                  <div className="text-sm text-gray-400 mt-1">{option.description}</div>
                  {option.path && (
                    <div className="text-xs text-gray-500 mt-2 truncate">
                      路径: {option.path}
                    </div>
                  )}
                  {!option.available && (
                    <div className="text-xs text-yellow-500 mt-2">
                      请先添加文件或文件夹
                    </div>
                  )}
                </div>
                {selectedOption === option.id && (
                  <div className="w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center">
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>

        {/* Footer with Options */}
        <div className="px-6 py-4 border-t border-gray-700">
          {/* AST Options */}
          <div className="mb-4 p-3 bg-gray-700/30 rounded-lg border border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-white">🧠 高级扫描选项</span>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useAST}
                  onChange={(e) => setUseAST(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-600 text-purple-600 focus:ring-purple-500 focus:ring-offset-gray-800"
                />
                <span className="text-sm text-gray-300">启用 AST 解析和代码图生成</span>
              </label>
            </div>

            {useAST && (
              <div className="ml-6 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={saveGraph}
                    onChange={(e) => setSaveGraph(e.target.checked)}
                    disabled={!useAST}
                    className="w-4 h-4 rounded border-gray-600 text-purple-600 focus:ring-purple-500 focus:ring-offset-gray-800 disabled:opacity-50"
                  />
                  <span className="text-xs text-gray-400">保存代码图到项目文件 (.code-graph.json)</span>
                </label>
                <div className="text-xs text-gray-500">
                  启用后将解析代码结构，生成包含函数、类、导入导出、API调用和路由的代码图
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-300 hover:text-white transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleScan}
              disabled={!options.find(o => o.id === selectedOption)?.available}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
            >
              开始扫描
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ScanModal;
