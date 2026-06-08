/**
 * AI Test Selector Modal Component
 *
 * Displayed after code scanning completes, allows user to select testing mode
 */

import React from 'react';

function AITestSelectorModal({ isOpen, onClose, onSelect, scanResult }) {
  if (!isOpen) return null;

  const testModes = [
    {
      id: 'bdd',
      title: 'BDD 测试',
      icon: '📋',
      description: '从 Excel 导入 BDD 测试用例并执行',
      features: ['Excel 导入', 'Given-When-Then 格式', '逐步执行验证'],
      color: 'hover:border-green-500',
    },
    {
      id: 'aiSmart',
      title: 'AI 智能测试',
      icon: '🧠',
      description: 'AI 全能测试：生成用例、视觉对比、智能执行一体化',
      features: [
        '智能生成测试用例',
        '自动页面操作验证',
        '视觉设计稿对比',
        '实时智能决策',
        '多维度质量检查'
      ],
      color: 'hover:border-purple-500',
      recommended: true,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-gray-800 rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div>
            <h2 className="text-2xl font-bold text-white">选择测试模式</h2>
            {scanResult && (
              <p className="text-sm text-gray-400 mt-1">
                扫描完成：{scanResult.totalIssues} 个问题 | {scanResult.errorCount} 个错误 | {scanResult.warningCount} 个警告
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Test Mode Options */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {testModes.map((mode) => (
              <button
                key={mode.id}
                onClick={() => onSelect(mode.id)}
                className={`bg-gray-700 hover:bg-gray-600 rounded-lg p-6 text-left transition-all duration-200 hover:scale-105 hover:shadow-lg border-2 border-transparent ${mode.color} relative`}
              >
                {mode.recommended && (
                  <div className="absolute top-2 right-2 bg-purple-600 text-white text-xs px-2 py-1 rounded">
                    推荐
                  </div>
                )}
                <div className="flex items-start gap-4">
                  <span className="text-5xl">{mode.icon}</span>
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-white mb-2">{mode.title}</h3>
                    <p className="text-gray-400 text-sm mb-3">{mode.description}</p>
                    <ul className="space-y-1">
                      {mode.features.map((feature, idx) => (
                        <li key={idx} className="text-xs text-gray-500 flex items-center gap-2">
                          <span className="text-blue-400">✓</span>
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-md transition-colors"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}

export default AITestSelectorModal;
