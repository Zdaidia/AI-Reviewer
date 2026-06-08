/**
 * AI Fix Modal Component
 *
 * 显示 AI 生成的代码修复差异预览
 * 允许用户应用或跳过修复
 */

import React, { useState, useEffect } from 'react';

function AiFixModal({ isOpen, onClose, fixData, onApply }) {
  const [diffLines, setDiffLines] = useState([]);
  const [selectedChange, setSelectedChange] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (fixData && fixData.diff) {
      formatDiffForDisplay(fixData.diff);
    }
  }, [fixData]);

  const formatDiffForDisplay = (diff) => {
    const lines = [];

    for (const hunk of diff.hunks || []) {
      // 添加代码块标题
      lines.push({
        type: 'hunk-header',
        content: `@@ -${hunk.originalStart},${hunk.originalLength} +${hunk.modifiedStart},${hunk.modifiedLength} @@`,
      });

      for (const line of hunk.lines || []) {
        lines.push(line);
      }
    }

    setDiffLines(lines);
  };

  const getLineClass = (line) => {
    switch (line.type) {
      case 'add':
        return 'bg-green-600/40 border-l-4 border-green-500';
      case 'delete':
        return 'bg-red-600/40 border-l-4 border-red-500';
      case 'modify':
        return 'bg-yellow-600/30 border-l-4 border-yellow-500';
      case 'context':
        return 'bg-gray-800/50';
      case 'hunk-header':
        return 'bg-purple-900/40 text-purple-300 font-semibold';
      default:
        return 'bg-gray-800/50';
    }
  };

  const getLineIcon = (line) => {
    switch (line.type) {
      case 'add':
        return <span className="text-green-400 font-bold">+</span>;
      case 'delete':
        return <span className="text-red-400 font-bold">-</span>;
      case 'modify':
        return <span className="text-yellow-400 font-bold">~</span>;
      case 'context':
        return <span className="text-gray-600"> </span>;
      case 'hunk-header':
        return <span className="text-purple-400">@</span>;
      default:
        return <span className="text-gray-600"> </span>;
    }
  };

  const handleApply = async () => {
    setLoading(true);
    try {
      await onApply(fixData.fixId, true);
      onClose();
    } catch (error) {
      console.error('应用修复时出错:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    setLoading(true);
    try {
      await onApply(fixData.fixId, false);
      onClose();
    } catch (error) {
      console.error('跳过修复时出错:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-xl shadow-2xl w-4/5 max-w-6xl max-h-[90vh] flex flex-col border border-gray-700">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 bg-gray-900/50">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              AI 修复预览
            </h2>
            {fixData && (
              <p className="text-sm text-gray-400 mt-1">
                📄 {fixData.filePath}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-1 hover:bg-gray-700 rounded"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-auto p-6">
          {/* 统计摘要 */}
          {fixData && fixData.diff && (
            <div className="mb-4 p-4 bg-gradient-to-r from-gray-900 to-gray-800 rounded-lg border border-gray-700">
              <h3 className="text-sm font-bold text-gray-300 mb-3 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                变更统计
              </h3>
              <div className="flex gap-6 text-sm">
                <span className="flex items-center gap-2 bg-green-900/30 px-3 py-1 rounded-full border border-green-700/50">
                  <span className="text-green-400 font-bold">+{fixData.diff.stats?.additions || 0}</span>
                  <span className="text-gray-300">新增</span>
                </span>
                <span className="flex items-center gap-2 bg-red-900/30 px-3 py-1 rounded-full border border-red-700/50">
                  <span className="text-red-400 font-bold">-{fixData.diff.stats?.deletions || 0}</span>
                  <span className="text-gray-300">删除</span>
                </span>
                <span className="flex items-center gap-2 bg-yellow-900/30 px-3 py-1 rounded-full border border-yellow-700/50">
                  <span className="text-yellow-400 font-bold">~{fixData.diff.stats?.modifications || 0}</span>
                  <span className="text-gray-300">修改</span>
                </span>
              </div>
            </div>
          )}

          {/* 差异视图 */}
          <div className="bg-gray-900 rounded-xl overflow-hidden border border-gray-700">
            <div className="px-4 py-3 bg-gray-850 border-b border-gray-700 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
                代码差异
              </span>
              <div className="flex gap-4 text-xs">
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 bg-red-600/40 border-l-2 border-red-500 rounded"></span>
                  <span className="text-gray-400">删除</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 bg-green-600/40 border-l-2 border-green-500 rounded"></span>
                  <span className="text-gray-400">新增</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 bg-yellow-600/30 border-l-2 border-yellow-500 rounded"></span>
                  <span className="text-gray-400">修改</span>
                </span>
              </div>
            </div>
            <div className="overflow-auto max-h-96">
              <table className="w-full text-sm">
                <tbody>
                  {diffLines.map((line, index) => (
                    <tr
                      key={index}
                      className={`transition-all ${getLineClass(line)}`}
                      onClick={() => line.type !== 'hunk-header' && line.type !== 'context' && setSelectedChange(line)}
                    >
                      <td className="px-3 py-2 text-right text-gray-600 w-14 text-xs font-mono">
                        {line.originalNumber || ''}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-600 w-14 text-xs font-mono">
                        {line.modifiedNumber || ''}
                      </td>
                      <td className="px-2 py-2 w-10 text-center">
                        {getLineIcon(line)}
                      </td>
                      <td className={`px-4 py-2 font-mono ${
                        line.type === 'add' ? 'text-green-100' :
                        line.type === 'delete' ? 'text-red-100' :
                        line.type === 'modify' ? 'text-yellow-100' :
                        'text-gray-400'
                      }`}>
                        {line.type === 'hunk-header' ? line.content :
                         line.type === 'add' ? line.modified :
                         line.type === 'delete' ? line.original :
                         line.type === 'modify' ? (
                           <div className="flex flex-col gap-1">
                             <div className="text-red-300 line-through opacity-70">{line.original}</div>
                             <div className="text-green-300">{line.modified}</div>
                           </div>
                         ) :
                         line.original || ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 选中的变更详情 */}
          {selectedChange && selectedChange.type !== 'hunk-header' && selectedChange.type !== 'context' && (
            <div className="mt-4 p-4 bg-gray-900 rounded-lg border border-gray-700">
              <h4 className="text-sm font-bold text-gray-300 mb-3 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                变更详情
              </h4>
              <div className="space-y-3 text-sm bg-gray-800 rounded p-3">
                {selectedChange.original && (
                  <div className="flex items-start gap-2">
                    <span className="text-red-400 font-bold mt-0.5">-</span>
                    <code className="text-red-200 bg-red-900/30 px-2 py-1 rounded flex-1">{selectedChange.original}</code>
                  </div>
                )}
                {selectedChange.modified && (
                  <div className="flex items-start gap-2">
                    <span className="text-green-400 font-bold mt-0.5">+</span>
                    <code className="text-green-200 bg-green-900/30 px-2 py-1 rounded flex-1">{selectedChange.modified}</code>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-700 bg-gray-900/50">
          <button
            onClick={handleSkip}
            disabled={loading}
            className="px-6 py-2.5 bg-gray-700 hover:bg-gray-600 rounded-lg transition-all text-sm font-medium disabled:opacity-50 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            跳过
          </button>
          <button
            onClick={handleApply}
            disabled={loading}
            className="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 rounded-lg transition-all text-sm font-medium disabled:opacity-50 flex items-center gap-2 shadow-lg"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                应用中...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                应用修复
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default AiFixModal;
