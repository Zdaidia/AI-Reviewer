/**
 * Scan Progress Modal Component
 *
 * 显示代码扫描进度
 */

import React, { useEffect, useRef, useState } from 'react';

// Generate unique ID for this modal instance
const modalId = `scan-progress-modal-${Math.random().toString(36).substr(2, 9)}`;

function ScanProgressModal({ isOpen, progress, onClose }) {
  const onCloseRef = useRef(onClose);
  const closeTimerRef = useRef(null);
  const hasScheduledCloseRef = useRef(false); // 跟踪是否已经安排了关闭

  // Debug: Track component renders
  console.log('[ScanProgressModal] Render called: modalId=', modalId, 'isOpen=', isOpen, 'progress.phase=', progress.phase);

  // Track mount/unmount
  useEffect(() => {
    console.log('[ScanProgressModal] MOUNTED: modalId=', modalId);
    return () => {
      console.log('[ScanProgressModal] UNMOUNTED: modalId=', modalId);
      // 清理 timer
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  // 更新 onClose ref
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // 当扫描完成时自动关闭弹窗（延迟 1 秒，让用户看到完成状态）
  // 注意：generating_test_context 状态不会触发自动关闭
  useEffect(() => {
    const currentPhase = progress.phase;

    console.log('[ScanProgressModal] Phase check:', currentPhase, 'isOpen:', isOpen, 'hasScheduledClose:', hasScheduledCloseRef.current);

    if (currentPhase === 'completed' && isOpen && !hasScheduledCloseRef.current) {
      console.log('[ScanProgressModal] ===== 扫描完成，1秒后自动关闭弹窗 =====');
      hasScheduledCloseRef.current = true;

      // 使用 requestIdleCallback 或双重 setTimeout 确保在浏览器空闲时执行
      const scheduleClose = () => {
        const timerId = setTimeout(() => {
          console.log('[ScanProgressModal] ===== Timer fired =====');
          console.log('[ScanProgressModal] onCloseRef.current:', typeof onCloseRef.current);

          // 直接使用 window.requestAnimationFrame 确保 DOM 更新后再关闭
          requestAnimationFrame(() => {
            console.log('[ScanProgressModal] Inside requestAnimationFrame');
            if (onCloseRef.current) {
              console.log('[ScanProgressModal] ===== Calling onClose =====');
              try {
                onCloseRef.current();
                console.log('[ScanProgressModal] ===== onClose called successfully =====');
              } catch (e) {
                console.error('[ScanProgressModal] Error calling onClose:', e);
              }
            } else {
              console.error('[ScanProgressModal] onCloseRef.current is null/undefined!');
            }
            hasScheduledCloseRef.current = false;
          });
        }, 1000);

        closeTimerRef.current = timerId;
        console.log('[ScanProgressModal] ===== Timer created, ID:', timerId);
      };

      // 使用 setTimeout 0 延迟执行，确保在下一个事件循环中
      setTimeout(scheduleClose, 0);
    }

    // 不返回 cleanup 函数，让 timer 独立运行
  }, [progress.phase, isOpen]);

  // 只在组件卸载时清理 timer
  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        console.log('[ScanProgressModal] Component unmount, clearing timer');
        clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  // 当 isOpen 变为 false 时，不清理 timer - 让它自然触发
  // Timer 只在组件真正卸载时清理
  // useEffect(() => {
  //   return () => {
  //     if (closeTimerRef.current) {
  //       console.log('[ScanProgressModal] Cleanup: 清理 timer');
  //       clearTimeout(closeTimerRef.current);
  //       closeTimerRef.current = null;
  //     }
  //   };
  // }, [isOpen]);

  // Important: Always render the modal, use CSS to hide it
  // This ensures the modal is properly removed from view even if React has issues
  const isVisible = isOpen;

  const percentage = progress.total > 0 ? Math.round((progress.scanned / progress.total) * 100) : 0;

  // 根据阶段显示不同的标题和提示
  const getPhaseInfo = () => {
    switch (progress.phase) {
      case 'completed':
        return {
          title: '全部完成！',
          tip: '代码扫描、代码图和测试上下文生成已完成',
          barColor: 'from-green-500 to-green-400',
          icon: '✅'
        };
      case 'generating_test_context':
        return {
          title: '正在生成测试上下文...',
          tip: 'AI 正在分析代码并生成测试上下文，可能需要几分钟时间...',
          barColor: 'from-yellow-500 to-orange-400',
          icon: '🤖'
        };
      case 'scan_complete':
        return {
          title: '扫描完成，正在生成代码图...',
          tip: '所有文件已扫描完成，正在分析代码结构...',
          barColor: 'from-blue-500 to-green-500',
          icon: '📊'
        };
      case 'generating_graph':
        return {
          title: '正在生成代码图...',
          tip: '正在分析代码结构、类关系、函数调用等...',
          barColor: 'from-purple-500 to-purple-400',
          icon: '🔗'
        };
      case 'scanning':
      default:
        return {
          title: '正在扫描代码...',
          tip: '正在分析代码质量和潜在问题，请稍候...',
          barColor: 'from-blue-500 to-blue-400',
          icon: '🔍'
        };
    }
  };

  const phaseInfo = getPhaseInfo();

  // Debug: Log the className
  const className = `fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50`;
  console.log('[ScanProgressModal] Rendering with className:', className, 'isVisible=', isVisible);

  // Always render but use inline style to hide (more reliable than CSS class)
  return (
    <div
      data-modal-id={modalId}
      className={className}
      style={{ display: isVisible ? 'flex' : 'none' }}
      onClick={() => {
        // 点击背景时也可以关闭（用于调试）
        if (progress.phase === 'completed') {
          console.log('[ScanProgressModal] 点击背景关闭');
          if (onCloseRef.current) onCloseRef.current();
        }
      }}
    >
      <div
        className="bg-gray-800 rounded-lg shadow-xl max-w-lg w-full mx-4 overflow-hidden"
        onClick={(e) => {
          // 阻止点击内容区域时关闭
          e.stopPropagation();
        }}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${progress.phase === 'completed' ? 'bg-green-600 bg-opacity-20' : 'bg-blue-600 bg-opacity-20'}`}>
                {progress.phase === 'completed' ? (
                  <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-blue-400 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 2m-15.356 2H15a1 1 0 102 0h3a1 1 0 102 0V5a1 1 0 102 0h-3.586m0 0a8.001 8.001 0 0015.357-2m15.357 2H15" />
                  </svg>
                )}
              </div>
              <h2 className="text-lg font-semibold text-white">{phaseInfo.title}</h2>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Progress Bar */}
          {progress.phase === 'completed' ? (
            <div>
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-gray-400">状态</span>
                <span className="text-white font-medium">{phaseInfo.icon} 完成</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-green-500 to-green-400 transition-all duration-300 ease-out"
                  style={{ width: '100%' }}
                />
              </div>
            </div>
          ) : progress.phase === 'generating_graph' ? (
            <div>
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-gray-400">处理状态</span>
                <span className="text-white font-medium">{phaseInfo.icon} 分析中</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-purple-500 to-purple-400 animate-pulse transition-all duration-300 ease-out"
                  style={{ width: '100%' }}
                />
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-gray-400">扫描进度</span>
                <span className="text-white font-medium">{percentage}%</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
                <div
                  className={`h-full bg-gradient-to-r ${phaseInfo.barColor} transition-all duration-300 ease-out`}
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-900 rounded-lg p-4 text-center">
              <div className="text-3xl font-bold text-blue-400">{progress.scanned}</div>
              <div className="text-sm text-gray-400 mt-1">已扫描文件</div>
            </div>
            <div className="bg-gray-900 rounded-lg p-4 text-center">
              <div className="text-3xl font-bold text-gray-300">{progress.total || '-'}</div>
              <div className="text-sm text-gray-400 mt-1">总文件数</div>
            </div>
          </div>

          {/* Current File / Status */}
          {progress.current && (
            <div className="bg-gray-900 rounded-lg p-3">
              <div className="text-xs text-gray-400 mb-1">
                {progress.phase === 'generating_test_context' ? '当前模块:' :
                 progress.phase === 'generating_graph' || progress.phase === 'completed' ? '状态:' : '正在扫描:'}
              </div>
              <div className="text-sm text-white truncate" title={progress.current}>
                {progress.current}
              </div>
            </div>
          )}

          {/* 模块进度条（仅在生成测试上下文时显示） */}
          {progress.phase === 'generating_test_context' && progress.moduleProgress && (
            <div className="bg-gray-900 rounded-lg p-3">
              <div className="text-xs text-gray-400 mb-2">
                模块进度: {progress.moduleProgress.current} / {progress.moduleProgress.total}
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div
                  className="h-full bg-gradient-to-r from-yellow-500 to-orange-400 transition-all duration-300"
                  style={{ width: `${(progress.moduleProgress.current / progress.moduleProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Tips */}
          <div className="bg-blue-900 bg-opacity-20 rounded-lg p-3 border border-blue-700 border-opacity-30">
            <div className="flex items-start gap-2">
              <span className="text-blue-400 text-lg">{phaseInfo.icon}</span>
              <p className="text-sm text-blue-200">
                {phaseInfo.tip}
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-gray-700 border-t border-gray-600">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">
              {progress.phase === 'completed' ? '全部已完成' :
               progress.phase === 'generating_test_context' ? '正在生成测试上下文（AI分析中）...' :
               progress.phase === 'generating_graph' ? '正在分析代码结构...' :
               percentage < 100 ? '正在处理...' : '扫描完成！'}
            </span>
            {progress.phase === 'completed' && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  console.log('[ScanProgressModal] 手动关闭按钮被点击, onCloseRef.current:', !!onCloseRef.current);
                  if (onCloseRef.current) {
                    console.log('[ScanProgressModal] 调用 onClose 函数');
                    onCloseRef.current();
                  } else {
                    console.error('[ScanProgressModal] onCloseRef.current 未定义！');
                  }
                }}
                className="px-3 py-1 text-sm bg-green-600 hover:bg-green-700 text-white rounded transition-colors cursor-pointer"
              >
                关闭
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ScanProgressModal;
