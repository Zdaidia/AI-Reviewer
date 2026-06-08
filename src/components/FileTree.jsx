/**
 * File Tree Component
 *
 * Displays project files and folders like an IDE
 * Supports expand/collapse for folders
 * Shows file icons based on type
 * Supports removing files/folders
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';

function FileTree({ files, selectedFile, onSelectFile, onRemoveFile, onClearAll }) {
  // 使用 Map 来跟踪展开的文件夹
  const [expandedFolders, setExpandedFolders] = useState(new Set());

  // 添加唯一ID到文件，保留原始路径
  const treeWithIds = useMemo(() => {
    let idCounter = 0;
    const addId = (item) => {
      return {
        ...item,
        id: item.id || `file-${idCounter++}`,
        // 保留原始的绝对路径，不要覆盖
        children: item.children?.map(child => addId(child))
      };
    };
    return files.map(file => addId(file));
  }, [files]);

  // 自动展开根文件夹 - 只执行一次
  useEffect(() => {
    if (treeWithIds.length > 0 && expandedFolders.size === 0) {
      const rootFolders = treeWithIds
        .filter(f => f.type === 'folder')
        .map(f => f.id);
      setExpandedFolders(new Set(rootFolders));
    }
  }, []); // 移除依赖，只执行一次

  const toggleFolder = useCallback((folderId) => {
    setExpandedFolders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(folderId)) {
        newSet.delete(folderId);
      } else {
        newSet.add(folderId);
      }
      return newSet;
    });
  }, []);

  const getFileIcon = useCallback((fileName, fileType, isExpanded) => {
    if (fileType === 'folder') {
      return isExpanded ? '📂' : '📁';
    }
    const ext = fileName.split('.').pop();
    const iconMap = {
      'js': '📜',
      'jsx': '⚛️',
      'ts': '📘',
      'tsx': '⚛️',
      'vue': '💚',
      'dart': '🎯',
      'json': '📋',
      'md': '📖',
      'html': '🌐',
      'css': '🎨',
      'scss': '🎨',
      'less': '🎨',
      'yaml': '⚙️',
      'yml': '⚙️',
      'xml': '📄',
      'txt': '📄',
    };
    return iconMap[ext] || '📄';
  }, []);

  const getFileColor = useCallback((fileName) => {
    const ext = fileName.split('.').pop();
    const colorMap = {
      'js': 'text-yellow-400',
      'jsx': 'text-yellow-400',
      'ts': 'text-blue-400',
      'tsx': 'text-blue-400',
      'vue': 'text-green-400',
      'dart': 'text-blue-300',
      'json': 'text-yellow-300',
      'md': 'text-gray-400',
      'html': 'text-orange-400',
      'css': 'text-purple-400',
      'scss': 'text-pink-400',
      'yaml': 'text-red-300',
      'yml': 'text-red-300',
    };
    return colorMap[ext] || 'text-gray-400';
  }, []);

  const renderFile = (file, level = 0) => {
    const isSelected = selectedFile?.path === file.path;
    const isFolder = file.type === 'folder';
    const isExpanded = expandedFolders.has(file.id);
    const hasChildren = file.children && file.children.length > 0;
    const paddingLeft = `${level * 16 + 8}px`;

    return (
      <div key={file.id}>
        {/* 文件/文件夹行 */}
        <div
          className={`flex items-center gap-1.5 py-1 pr-2 cursor-pointer transition-colors group ${
            isSelected ? 'bg-blue-600/30 border-l-2 border-blue-500' : 'hover:bg-gray-700/50'
          } ${isFolder ? 'hover:bg-gray-700' : ''}`}
          style={{ paddingLeft }}
        >
          {/* 文件/文件夹内容 - 可点击 */}
          <div
            className="flex items-center gap-1.5 flex-1 min-w-0"
            onClick={() => {
              if (isFolder) {
                toggleFolder(file.id);
              } else {
                onSelectFile(file);
              }
            }}
          >
            {/* 展开/折叠箭头 */}
            {isFolder && (
              <span className={`w-4 h-4 flex items-center justify-center text-xs transition-transform ${
                isExpanded ? 'transform rotate-90' : ''
              }`}>
                ▶
              </span>
            )}
            {!isFolder && <span className="w-4"></span>}

            {/* 文件图标 */}
            <span className="text-sm flex-shrink-0">{getFileIcon(file.name, file.type, isExpanded)}</span>

            {/* 文件名 */}
            <span className={`text-sm truncate ${isFolder ? 'text-gray-200' : getFileColor(file.name)}`}>
              {file.name}
            </span>

            {/* 文件夹中的文件数量 */}
            {isFolder && hasChildren && (
              <span className="ml-auto text-xs text-gray-500 flex-shrink-0">
                {file.children.length}
              </span>
            )}
          </div>

          {/* 删除按钮 - 只在顶层项目显示 */}
          {level === 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemoveFile(file);
              }}
              className="opacity-0 group-hover:opacity-100 flex-shrink-0 w-5 h-5 flex items-center justify-center rounded hover:bg-red-600 hover:text-white text-gray-400 transition-all"
              title="移除此项目"
            >
              ×
            </button>
          )}
        </div>

        {/* 子文件/文件夹 */}
        {isFolder && isExpanded && hasChildren && (
          <div>
            {file.children.map(child => renderFile(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  const getFileCount = () => {
    const count = { files: 0, folders: 0 };
    const countItems = (items) => {
      items.forEach(item => {
        if (item.type === 'folder') {
          count.folders++;
          if (item.children) countItems(item.children);
        } else {
          count.files++;
        }
      });
    };
    countItems(treeWithIds);
    return count;
  };

  const fileCount = getFileCount();

  return (
    <div className="w-64 bg-gray-850 border-r border-gray-700 flex flex-col">
      {/* 标题栏 */}
      <div className="px-3 py-2 bg-gray-800 border-b border-gray-700 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-300">Explorer</h3>
        <div className="flex items-center gap-2">
          {fileCount.files > 0 && (
            <span className="text-xs text-gray-500">
              {fileCount.files} {fileCount.files === 1 ? 'file' : 'files'}
            </span>
          )}
          {treeWithIds.length > 0 && (
            <button
              onClick={onClearAll}
              className="text-xs text-gray-500 hover:text-red-400 transition-colors"
              title="清空所有项目"
            >
              清空
            </button>
          )}
        </div>
      </div>

      {/* 文件树 */}
      <div className="flex-1 overflow-y-auto py-1">
        {treeWithIds.length === 0 ? (
          <div className="px-4 py-8 text-center text-gray-500 text-sm">
            <p className="mb-2">📁 No projects added</p>
            <p className="text-xs">Projects will be saved automatically</p>
          </div>
        ) : (
          <div>
            {treeWithIds.map(file => renderFile(file))}
          </div>
        )}
      </div>

      {/* 底部统计 */}
      {fileCount.folders > 0 && (
        <div className="px-3 py-2 bg-gray-800 border-t border-gray-700 text-xs text-gray-500 flex items-center justify-between">
          <span>
            {fileCount.folders} {fileCount.folders === 1 ? 'folder' : 'folders'}, {fileCount.files} {fileCount.files === 1 ? 'file' : 'files'}
          </span>
          <span className="text-green-500">✓ 已保存</span>
        </div>
      )}
    </div>
  );
}

// 使用 React.memo 优化性能，只在 props 变化时重新渲染
export default React.memo(FileTree);
