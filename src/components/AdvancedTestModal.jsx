/**
 * Advanced Test Modal
 *
 * 增强的测试弹窗，支持：
 * - 高级 Excel 测试用例
 * - Figma 设计集成
 * - AI 智能测试生成
 * - 多种验证类型
 */

import React, { useState, useEffect } from 'react';

function AdvancedTestModal({ isOpen, onClose, onGenerateTests, onRunTests }) {
  const [activeTab, setActiveTab] = useState('mode');
  const [testMode, setTestMode] = useState('');

  // Excel 模式状态
  const [excelFile, setExcelFile] = useState('');
  const [parsedData, setParsedData] = useState(null);
  const [loading, setLoading] = useState(false);

  // Figma 模式状态
  const [figmaUrl, setFigmaUrl] = useState('');
  const [figmaToken, setFigmaToken] = useState('');
  const [figmaSpecs, setFigmaSpecs] = useState(null);

  // AI 生成模式状态
  const [requirementText, setRequirementText] = useState('');
  const [description, setDescription] = useState('');
  const [generatedTests, setGeneratedTests] = useState([]);

  // 测试配置
  const [testConfig, setTestConfig] = useState({
    baseUrl: 'http://localhost:3000',
    testType: 'comprehensive',
    includeVisualTests: true,
    includeFunctionalTests: true,
    includeDataTests: true,
    includePerformanceTests: false,
  });

  const resetState = () => {
    setExcelFile('');
    setParsedData(null);
    setFigmaUrl('');
    setFigmaToken('');
    setFigmaSpecs(null);
    setRequirementText('');
    setDescription('');
    setGeneratedTests([]);
    setLoading(false);
  };

  useEffect(() => {
    if (isOpen) {
      resetState();
      setActiveTab('mode');
    }
  }, [isOpen]);

  // Excel 模式处理
  const handleImportExcel = async () => {
    if (!window.electronAPI) return;
    setLoading(true);
    try {
      const result = await window.electronAPI.selectFile();
      if (!result.canceled && result.filePath) {
        setExcelFile(result.filePath);
        const parsed = await window.electronAPI.parseAdvancedExcel(result.filePath);
        if (parsed.success) {
          setParsedData(parsed);
        } else {
          alert(`解析失败: ${parsed.error}`);
        }
      }
    } catch (error) {
      console.error('Error:', error);
      alert(`错误: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateFromExcel = async () => {
    if (!excelFile) return;
    setLoading(true);
    try {
      const result = await window.electronAPI.generateAdvancedTest(excelFile, testConfig);
      if (result.success) {
        setGeneratedTests(result.parsedData?.sheets?.['测试用例']?.data || []);
        setActiveTab('results');
      } else {
        alert(`生成失败: ${result.error}`);
      }
    } catch (error) {
      console.error('Error:', error);
      alert(`错误: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Figma 模式处理
  const handleExtractFigma = async () => {
    if (!figmaUrl) return;
    setLoading(true);
    try {
      // 设置 token
      if (figmaToken) {
        await window.electronAPI.setFigmaToken(figmaToken);
      }

      // 提取设计规范
      const result = await window.electronAPI.extractFigmaSpecs(figmaUrl);
      if (result.success || result) {
        setFigmaSpecs(result);
      } else {
        alert(`提取失败: ${result.error || '未知错误'}`);
      }
    } catch (error) {
      console.error('Error:', error);
      alert(`错误: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateFromFigma = async () => {
    if (!figmaSpecs) return;
    setLoading(true);
    try {
      const result = await window.electronAPI.generateTestsFromFigma(figmaSpecs, testConfig);
      if (result.success) {
        setGeneratedTests(result.testCases || []);
        setActiveTab('results');
      } else {
        alert(`生成失败: ${result.error}`);
      }
    } catch (error) {
      console.error('Error:', error);
      alert(`错误: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // AI 生成模式处理
  const handleGenerateFromRequirement = async () => {
    if (!requirementText) return;
    setLoading(true);
    try {
      const result = await window.electronAPI.generateTestsFromRequirement(
        requirementText,
        testConfig
      );
      if (result.success) {
        setGeneratedTests(result.testCases || []);
        setActiveTab('results');
      } else {
        alert(`生成失败: ${result.error}`);
      }
    } catch (error) {
      console.error('Error:', error);
      alert(`错误: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateFromDescription = async () => {
    if (!description) return;
    setLoading(true);
    try {
      const result = await window.electronAPI.generateTestsFromDescription(
        description,
        testConfig
      );
      if (result.success) {
        setGeneratedTests(result.testCases || []);
        setActiveTab('results');
      } else {
        alert(`生成失败: ${result.error}`);
      }
    } catch (error) {
      console.error('Error:', error);
      alert(`错误: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h2 className="text-xl font-semibold text-white">🧪 高级测试生成</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Mode Selection */}
          {activeTab === 'mode' && (
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-white mb-4">选择测试生成方式</h3>

              <div className="grid grid-cols-3 gap-4">
                {/* Excel Mode */}
                <button
                  onClick={() => {
                    setTestMode('excel');
                    setActiveTab('excel-import');
                  }}
                  className="p-6 bg-gradient-to-br from-green-900 to-green-800 hover:from-green-800 hover:to-green-700 rounded-lg border-2 border-green-600 transition-all"
                >
                  <div className="text-center">
                    <div className="text-4xl mb-3">📊</div>
                    <h4 className="text-lg font-semibold text-white mb-2">Excel 测试用例</h4>
                    <p className="text-sm text-gray-300">
                      使用高级 Excel 模板定义详细测试
                    </p>
                    <div className="mt-3 text-xs text-green-300">
                      ✅ 30+ 验证类型<br/>
                      ✅ 数据驱动测试<br/>
                      ✅ Figma 对比
                    </div>
                  </div>
                </button>

                {/* Figma Mode */}
                <button
                  onClick={() => {
                    setTestMode('figma');
                    setActiveTab('figma-import');
                  }}
                  className="p-6 bg-gradient-to-br from-purple-900 to-purple-800 hover:from-purple-800 hover:to-purple-700 rounded-lg border-2 border-purple-600 transition-all"
                >
                  <div className="text-center">
                    <div className="text-4xl mb-3">🎨</div>
                    <h4 className="text-lg font-semibold text-white mb-2">Figma 设计规范</h4>
                    <p className="text-sm text-gray-300">
                      从 Figma 设计自动生成测试
                    </p>
                    <div className="mt-3 text-xs text-purple-300">
                      ✅ 自动提取设计<br/>
                      ✅ 颜色/尺寸对比<br/>
                      ✅ 视觉回归测试
                    </div>
                  </div>
                </button>

                {/* AI Generation Mode */}
                <button
                  onClick={() => {
                    setTestMode('ai');
                    setActiveTab('ai-generate');
                  }}
                  className="p-6 bg-gradient-to-br from-blue-900 to-blue-800 hover:from-blue-800 hover:to-blue-700 rounded-lg border-2 border-blue-600 transition-all"
                >
                  <div className="text-center">
                    <div className="text-4xl mb-3">🤖</div>
                    <h4 className="text-lg font-semibold text-white mb-2">AI 智能生成</h4>
                    <p className="text-sm text-gray-300">
                      AI 分析需求自动生成测试
                    </p>
                    <div className="mt-3 text-xs text-blue-300">
                      ✅ 需求文档分析<br/>
                      ✅ 自然语言描述<br/>
                      ✅ 自动选择器生成
                    </div>
                  </div>
                </button>
              </div>

              {/* Test Configuration */}
              <div className="mt-6 bg-gray-900 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-white mb-3">测试配置</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">基础 URL</label>
                    <input
                      type="text"
                      value={testConfig.baseUrl}
                      onChange={(e) => setTestConfig({ ...testConfig, baseUrl: e.target.value })}
                      className="w-full text-sm"
                      placeholder="http://localhost:3000"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">测试类型</label>
                    <select
                      value={testConfig.testType}
                      onChange={(e) => setTestConfig({ ...testConfig, testType: e.target.value })}
                      className="w-full text-sm"
                    >
                      <option value="basic">基础测试</option>
                      <option value="smoke">冒烟测试</option>
                      <option value="comprehensive">综合测试</option>
                      <option value="regression">回归测试</option>
                    </select>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <label className="flex items-center text-gray-300">
                    <input
                      type="checkbox"
                      checked={testConfig.includeVisualTests}
                      onChange={(e) => setTestConfig({ ...testConfig, includeVisualTests: e.target.checked })}
                      className="mr-2"
                    />
                    包含视觉测试
                  </label>
                  <label className="flex items-center text-gray-300">
                    <input
                      type="checkbox"
                      checked={testConfig.includeFunctionalTests}
                      onChange={(e) => setTestConfig({ ...testConfig, includeFunctionalTests: e.target.checked })}
                      className="mr-2"
                    />
                    包含功能测试
                  </label>
                  <label className="flex items-center text-gray-300">
                    <input
                      type="checkbox"
                      checked={testConfig.includeDataTests}
                      onChange={(e) => setTestConfig({ ...testConfig, includeDataTests: e.target.checked })}
                      className="mr-2"
                    />
                    包含数据测试
                  </label>
                  <label className="flex items-center text-gray-300">
                    <input
                      type="checkbox"
                      checked={testConfig.includePerformanceTests}
                      onChange={(e) => setTestConfig({ ...testConfig, includePerformanceTests: e.target.checked })}
                      className="mr-2"
                    />
                    包含性能测试
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Excel Import Mode */}
          {activeTab === 'excel-import' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-white">导入高级 Excel 测试用例</h3>
                <button
                  onClick={() => setActiveTab('mode')}
                  className="text-sm text-blue-400 hover:text-blue-300"
                >
                  ← 返回
                </button>
              </div>

              <button
                onClick={handleImportExcel}
                disabled={loading}
                className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 rounded-md transition-colors text-sm font-medium disabled:opacity-50"
              >
                {loading ? '解析中...' : '📄 选择 Excel 文件'}
              </button>

              {parsedData && (
                <div className="p-4 bg-green-900/20 border border-green-700 rounded-md">
                  <p className="text-sm text-green-400">
                    ✓ 成功解析 {Object.keys(parsedData.sheets || {}).length} 个 sheet
                  </p>
                  {Object.keys(parsedData.sheets || {}).map(sheetName => (
                    <p key={sheetName} className="text-xs text-gray-400 mt-1">
                      • {sheetName}: {parsedData.sheets[sheetName].total || 0} 项
                    </p>
                  ))}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setActiveTab('mode')}
                  className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-md transition-colors text-sm"
                >
                  取消
                </button>
                <button
                  onClick={handleGenerateFromExcel}
                  disabled={!parsedData || loading}
                  className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 rounded-md transition-colors text-sm disabled:opacity-50"
                >
                  {loading ? '生成中...' : '生成测试'}
                </button>
              </div>
            </div>
          )}

          {/* Figma Import Mode */}
          {activeTab === 'figma-import' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-white">导入 Figma 设计规范</h3>
                <button
                  onClick={() => setActiveTab('mode')}
                  className="text-sm text-blue-400 hover:text-blue-300"
                >
                  ← 返回
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Figma URL
                </label>
                <input
                  type="text"
                  value={figmaUrl}
                  onChange={(e) => setFigmaUrl(e.target.value)}
                  placeholder="https://www.figma.com/file/..."
                  className="w-full placeholder-gray-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Figma Access Token（可选）
                </label>
                <input
                  type="password"
                  value={figmaToken}
                  onChange={(e) => setFigmaToken(e.target.value)}
                  placeholder="figd_..."
                  className="w-full placeholder-gray-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  从 Figma 账户设置中获取个人访问令牌
                </p>
              </div>

              <button
                onClick={handleExtractFigma}
                disabled={!figmaUrl || loading}
                className="w-full px-4 py-3 bg-purple-600 hover:bg-purple-700 rounded-md transition-colors text-sm font-medium disabled:opacity-50"
              >
                {loading ? '提取中...' : '🎨 提取设计规范'}
              </button>

              {figmaSpecs && (
                <div className="p-4 bg-green-900/20 border border-green-700 rounded-md">
                  <p className="text-sm text-green-400">
                    ✓ 成功提取设计规范
                  </p>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setActiveTab('mode')}
                  className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-md transition-colors text-sm"
                >
                  取消
                </button>
                <button
                  onClick={handleGenerateFromFigma}
                  disabled={!figmaSpecs || loading}
                  className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 rounded-md transition-colors text-sm disabled:opacity-50"
                >
                  {loading ? '生成中...' : '生成测试'}
                </button>
              </div>
            </div>
          )}

          {/* AI Generate Mode */}
          {activeTab === 'ai-generate' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-white">AI 智能测试生成</h3>
                <button
                  onClick={() => setActiveTab('mode')}
                  className="text-sm text-blue-400 hover:text-blue-300"
                >
                  ← 返回
                </button>
              </div>

              {/* Tab 1: Requirement Document */}
              <div className="bg-gray-900 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-white mb-3">方式 1: 需求文档分析</h4>
                <textarea
                  value={requirementText}
                  onChange={(e) => setRequirementText(e.target.value)}
                  placeholder="粘贴您的需求文档...
功能要求：
1. 用户登录功能
2. 数据列表展示
3. 表单提交验证..."
                  className="w-full h-32 px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-500 text-sm resize-none"
                />
                <button
                  onClick={handleGenerateFromRequirement}
                  disabled={!requirementText || loading}
                  className="w-full mt-3 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md transition-colors text-sm disabled:opacity-50"
                >
                  {loading ? '分析中...' : '📄 分析需求文档'}
                </button>
              </div>

              {/* Tab 2: Natural Language */}
              <div className="bg-gray-900 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-white mb-3">方式 2: 自然语言描述</h4>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="简单描述您想测试的功能...
例如：我想测试登录页面，包括用户名和密码输入框，以及登录按钮的点击功能"
                  className="w-full h-24 px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-500 text-sm resize-none"
                />
                <button
                  onClick={handleGenerateFromDescription}
                  disabled={!description || loading}
                  className="w-full mt-3 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md transition-colors text-sm disabled:opacity-50"
                >
                  {loading ? '生成中...' : '💬 从描述生成'}
                </button>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setActiveTab('mode')}
                  className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-md transition-colors text-sm"
                >
                  取消
                </button>
              </div>
            </div>
          )}

          {/* Results Tab */}
          {activeTab === 'results' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-white">生成的测试用例</h3>
                <button
                  onClick={() => setActiveTab('mode')}
                  className="text-sm text-blue-400 hover:text-blue-300"
                >
                  ← 重新生成
                </button>
              </div>

              <div className="bg-gray-900 rounded-lg p-4">
                <div className="flex justify-between text-sm mb-4">
                  <span className="text-gray-400">共生成</span>
                  <span className="text-white font-semibold">{generatedTests.length} 个测试用例</span>
                </div>

                <div className="max-h-96 overflow-y-auto space-y-2">
                  {generatedTests.map((test, index) => (
                    <div
                      key={`test-${index}-${test.id || index}`}
                      className="p-3 bg-gray-800 rounded border border-gray-700"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs bg-blue-900 text-blue-300 px-2 py-0.5 rounded">
                              {test.id || `TC${String(index + 1).padStart(3, '0')}`}
                            </span>
                            {test.type && (
                              <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded">
                                {test.type}
                              </span>
                            )}
                            {test.priority && (
                              <span className={`text-xs px-2 py-0.5 rounded ${
                                test.priority === 'critical' ? 'bg-red-900 text-red-300' :
                                test.priority === 'high' ? 'bg-orange-900 text-orange-300' :
                                'bg-gray-700 text-gray-300'
                              }`}>
                                {test.priority}
                              </span>
                            )}
                          </div>
                          <h4 className="text-sm font-medium text-white">{test.name}</h4>
                          {test.description && (
                            <p className="text-xs text-gray-400 mt-1">{test.description}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={async () => {
                    // 导出为 Excel - 使用 electronAPI 而不是直接 require
                    try {
                      const outputPath = 'generated-tests.xlsx';
                      await window.electronAPI.generateAdvancedExcelTemplate(outputPath);
                      alert(`已导出到: ${outputPath}`);
                    } catch (error) {
                      alert(`导出失败: ${error.message}`);
                    }
                  }}
                  className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 rounded-md transition-colors text-sm"
                >
                  📊 导出 Excel
                </button>
                <button
                  onClick={() => {
                    // 运行测试
                    onRunTests && onRunTests(generatedTests);
                    onClose();
                  }}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md transition-colors text-sm"
                >
                  ▶️ 运行测试
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AdvancedTestModal;
