/**
 * Review Mode Selector Component
 *
 * Allows users to choose between Traditional and Agent code review modes.
 */

import React from 'react';

function ReviewModeSelector({ isOpen, onClose, onModeSelect }) {
  if (!isOpen) return null;

  const handleModeSelect = (modeId) => {
    onModeSelect(modeId);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-700 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">选择 Code Review 模式</h2>
              <p className="text-gray-400 text-sm mt-1">选择适合您当前需求的审查方式</p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Mode Cards */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 flex-1 overflow-y-auto">
          {/* Traditional Mode */}
          <button
            onClick={() => handleModeSelect('traditional')}
            className="text-left group"
          >
            <div className="bg-gray-700 rounded-lg p-6 border-2 border-transparent hover:border-blue-500 transition-all duration-200 group-hover:bg-gray-600">
              {/* Icon and Name */}
              <div className="flex items-center mb-4">
                <div className="w-12 h-12 rounded-lg bg-blue-500 bg-opacity-20 flex items-center justify-center text-2xl mr-4">
                  ⚡
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white group-hover:text-blue-400 transition-colors">
                    传统模式
                  </h3>
                </div>
              </div>

              {/* Description */}
              <p className="text-gray-300 text-sm mb-4">
                使用规则引擎扫描代码问题并添加 TODO 注释
              </p>

              {/* Features */}
              <ul className="space-y-2">
                <li className="flex items-start text-sm text-gray-400">
                  <svg className="w-4 h-4 text-green-400 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  快速扫描，即时反馈
                </li>
                <li className="flex items-start text-sm text-gray-400">
                  <svg className="w-4 h-4 text-green-400 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  基于预定义规则
                </li>
                <li className="flex items-start text-sm text-gray-400">
                  <svg className="w-4 h-4 text-green-400 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  添加代码注释标记
                </li>
                <li className="flex items-start text-sm text-gray-400">
                  <svg className="w-4 h-4 text-green-400 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  适合快速检查
                </li>
              </ul>
            </div>
          </button>

          {/* Agent Mode */}
          <button
            onClick={() => handleModeSelect('agent')}
            className="text-left group"
          >
            <div className="bg-gray-700 rounded-lg p-6 border-2 border-transparent hover:border-purple-500 transition-all duration-200 group-hover:bg-gray-600">
              {/* Icon and Name */}
              <div className="flex items-center mb-4">
                <div className="w-12 h-12 rounded-lg bg-purple-500 bg-opacity-20 flex items-center justify-center text-2xl mr-4">
                  🤖
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white group-hover:text-purple-400 transition-colors">
                    Agent 模式
                  </h3>
                </div>
              </div>

              {/* Description */}
              <p className="text-gray-300 text-sm mb-4">
                使用 AI Agent 智能检测额外问题并添加 TODO 注释
              </p>

              {/* Features */}
              <ul className="space-y-2">
                <li className="flex items-start text-sm text-gray-400">
                  <svg className="w-4 h-4 text-green-400 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  AI 智能检测未定义方法、潜在崩溃
                </li>
                <li className="flex items-start text-sm text-gray-400">
                  <svg className="w-4 h-4 text-green-400 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  自动添加 TODO 注释到代码
                </li>
                <li className="flex items-start text-sm text-gray-400">
                  <svg className="w-4 h-4 text-green-400 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  提供优先级排序和改进建议
                </li>
                <li className="flex items-start text-sm text-gray-400">
                  <svg className="w-4 h-4 text-green-400 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  检测内存泄漏和无效代码
                </li>
              </ul>
            </div>
          </button>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-700 border-t border-gray-700 flex-shrink-0">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-400">
              💡 提示：首次使用建议先尝试传统模式，了解项目基本问题后再使用 Agent 模式进行深度分析
            </p>
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-300 hover:text-white transition-colors"
            >
              取消
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ReviewModeSelector;
