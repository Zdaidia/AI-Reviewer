/**
 * AI Test Modal - Streamlined BDD Testing
 *
 * 直接导入 Excel 测试用例，执行测试并生成报告
 */

import React, { useState, useEffect } from 'react';

function AITestModal({ isOpen, onClose, electronAPI, projectUrl }) {
  const [activeStep, setActiveStep] = useState('select'); // select, import, running, results
  const [selectedFile, setSelectedFile] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [testResults, setTestResults] = useState(null);
  const [reportUrl, setReportUrl] = useState(null);
  const [executionLogs, setExecutionLogs] = useState([]);

  useEffect(() => {
    if (isOpen) {
      resetState();
    }
    return () => {
      if (reportUrl) {
        URL.revokeObjectURL(reportUrl);
      }
    };
  }, [isOpen]);

  const resetState = () => {
    setActiveStep('select');
    setSelectedFile(null);
    setIsLoading(false);
    setTestResults(null);
    setReportUrl(null);
    setExecutionLogs([]);
  };

  /**
   * 步骤1: 选择测试模式
   */
  const handleSelectMode = (mode) => {
    if (mode === 'bdd') {
      setActiveStep('import');
    } else if (mode === 'aiAgent') {
      // AI Agent 模式需要另一个模态框
      onClose();
      // 触发 AI Agent 模式
      if (window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('open-ai-agent-test'));
      }
    }
  };

  /**
   * 步骤2: 导入 Excel 文件
   */
  const handleSelectFile = async () => {
    try {
      const result = await electronAPI.selectFile();
      if (!result.canceled) {
        setSelectedFile(result.filePath);
      }
    } catch (error) {
      console.error('选择文件失败:', error);
      alert('选择文件失败: ' + error.message);
    }
  };

  /**
   * 步骤3: 执行 BDD 测试
   */
  const handleExecuteTest = async () => {
    if (!selectedFile) {
      alert('请先选择测试文件');
      return;
    }

    setIsLoading(true);
    setActiveStep('running');

    try {
      // 调用 IPC 执行测试
      const result = await electronAPI.executeBDTest(selectedFile, {
        headless: false,
        slowMo: 100,
      });

      if (result.success) {
        setTestResults(result.testResult);
        setExecutionLogs(result.logs || []);

        // 生成报告
        const reportPath = await generateReport(result.testResult);
        if (reportPath) {
          setReportUrl(reportPath);
        }

        setActiveStep('results');
      } else {
        alert('测试执行失败: ' + result.error);
        setActiveStep('import');
        setIsLoading(false);
      }
    } catch (error) {
      console.error('执行测试失败:', error);
      alert('执行测试失败: ' + error.message);
      setActiveStep('import');
      setIsLoading(false);
    }
  };

  /**
   * 生成测试报告
   */
  const generateReport = async (testResult) => {
    try {
      const result = await electronAPI.generateTestReport(testResult, 'html');
      if (result.success) {
        return result.reportPath;
      } else {
        console.error('生成报告失败:', result.error);
        return null;
      }
    } catch (error) {
      console.error('生成报告失败:', error);
      return null;
    }
  };

  /**
   * 打开测试报告
   */
  const handleOpenReport = async () => {
    if (reportUrl) {
      await electronAPI.openTestReport(reportUrl);
    }
  };

  /**
   * 重新测试
   */
  const handleRetest = () => {
    resetState();
  };

  if (!isOpen) return null;

  // 渲染测试模式选择
  const renderModeSelection = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-2xl font-bold text-white mb-2">选择测试模式</h3>
        <p className="text-gray-400">选择适合您的测试方式</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* BDD 测试模式 */}
        <button
          onClick={() => handleSelectMode('bdd')}
          className="group relative p-6 bg-gradient-to-br from-green-900 to-green-800 hover:from-green-800 hover:to-green-700 rounded-xl border-2 border-green-600 transition-all hover:scale-105 hover:shadow-xl"
        >
          <div className="text-center">
            <div className="text-5xl mb-4">📋</div>
            <h4 className="text-xl font-bold text-white mb-3">BDD 测试</h4>
            <p className="text-sm text-gray-300 mb-4">
              从 Excel 导入 BDD 格式测试用例并执行
            </p>
            <div className="text-left bg-green-950/50 rounded-lg p-3">
              <p className="text-xs text-green-300 font-semibold mb-2">工作流程：</p>
              <ul className="text-xs text-gray-300 space-y-1">
                <li>1. 导入 Excel 测试用例</li>
                <li>2. 自动执行测试步骤</li>
                <li>3. 生成详细测试报告</li>
              </ul>
            </div>
          </div>
        </button>

        {/* AI Agent 测试模式 */}
        <button
          onClick={() => handleSelectMode('aiAgent')}
          className="group relative p-6 bg-gradient-to-br from-purple-900 to-purple-800 hover:from-purple-800 hover:to-purple-700 rounded-xl border-2 border-purple-600 transition-all hover:scale-105 hover:shadow-xl"
        >
          <div className="text-center">
            <div className="text-5xl mb-4">🤖</div>
            <h4 className="text-xl font-bold text-white mb-3">AI Agent 测试</h4>
            <p className="text-sm text-gray-300 mb-4">
              AI 智能分析需求并自动执行测试
            </p>
            <div className="text-left bg-purple-950/50 rounded-lg p-3">
              <p className="text-xs text-purple-300 font-semibold mb-2">工作流程：</p>
              <ul className="text-xs text-gray-300 space-y-1">
                <li>1. 上传需求/Figma/UI截图</li>
                <li>2. AI 分析并生成测试计划</li>
                <li>3. 自动执行并生成报告</li>
              </ul>
            </div>
          </div>
        </button>
      </div>
    </div>
  );

  // 渲染 Excel 导入步骤
  const renderImportStep = () => (
    <div className="space-y-6">
      <div className="text-center">
        <div className="text-5xl mb-4">📋</div>
        <h3 className="text-2xl font-bold text-white mb-2">BDD 测试</h3>
        <p className="text-gray-400">导入 Excel 测试用例并执行</p>
      </div>

      {/* 项目信息 */}
      {projectUrl && (
        <div className="p-4 bg-blue-900/20 border border-blue-700 rounded-lg">
          <p className="text-sm text-blue-300">
            <span className="font-semibold">项目地址：</span>{projectUrl}
          </p>
        </div>
      )}

      {/* 文件选择 */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          选择 Excel 测试文件
        </label>
        <div className="flex gap-2">
          <button
            onClick={handleSelectFile}
            disabled={isLoading}
            className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors text-white font-medium flex items-center justify-center gap-2"
          >
            <span className="text-xl">📁</span>
            选择 Excel 文件
          </button>
        </div>

        {selectedFile && (
          <div className="mt-4 p-4 bg-gray-900 rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">📄</span>
              <span className="text-sm text-gray-300 truncate max-w-md">{selectedFile}</span>
            </div>
            <button
              onClick={() => setSelectedFile(null)}
              className="p-2 text-gray-400 hover:text-red-400 transition-colors"
              title="清除"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* Excel 格式说明 */}
      <div className="p-4 bg-gray-900 rounded-lg">
        <p className="text-sm font-semibold text-gray-300 mb-3">Excel 格式说明：</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-800">
                <th className="px-3 py-2 text-left text-gray-300">Function</th>
                <th className="px-3 py-2 text-left text-gray-300">Scenario</th>
                <th className="px-3 py-2 text-left text-gray-300">Given</th>
                <th className="px-3 py-2 text-left text-gray-300">When</th>
                <th className="px-3 py-2 text-left text-gray-300">Then</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-gray-700">
                <td className="px-3 py-2 text-gray-400">用户登录</td>
                <td className="px-3 py-2 text-gray-400">成功登录</td>
                <td className="px-3 py-2 text-gray-400">用户在登录页</td>
                <td className="px-3 py-2 text-gray-400">输入用户名密码</td>
                <td className="px-3 py-2 text-gray-400">登录成功</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex justify-between">
        <button
          onClick={() => setActiveStep('select')}
          className="px-6 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors text-white font-medium"
        >
          ← 返回
        </button>
        <button
          onClick={handleExecuteTest}
          disabled={!selectedFile || isLoading}
          className="px-8 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg transition-colors text-white font-medium flex items-center gap-2"
        >
          {isLoading ? (
            <>⏳ 执行中...</>
          ) : (
            <>▶️ 执行测试</>
          )}
        </button>
      </div>
    </div>
  );

  // 渲染运行中状态
  const renderRunningStep = () => (
    <div className="space-y-6 text-center">
      <div className="text-8xl animate-pulse">🧪</div>
      <h3 className="text-2xl font-bold text-white">正在执行测试...</h3>
      <p className="text-gray-400">请稍候，测试正在运行中</p>

      {/* 进度指示器 */}
      <div className="w-full bg-gray-700 rounded-full h-2">
        <div className="bg-blue-600 h-2 rounded-full animate-pulse" style={{ width: '60%' }}></div>
      </div>

      <p className="text-xs text-gray-500">测试将在浏览器中执行，请勿关闭窗口</p>
    </div>
  );

  // 渲染测试结果
  const renderResultsStep = () => {
    if (!testResults) return null;

    const summary = {
      total: testResults.totalScenarios || 0,
      passed: testResults.passedScenarios || 0,
      failed: testResults.failedScenarios || 0,
      skipped: testResults.skippedScenarios || 0,
      duration: testResults.duration || 0,
      passRate: testResults.totalScenarios > 0
        ? ((testResults.passedScenarios / testResults.totalScenarios) * 100).toFixed(1)
        : 0,
    };

    return (
      <div className="space-y-6">
        <div className="text-center">
          <div className="text-5xl mb-4">
            {summary.failed === 0 ? '🎉' : summary.passed > 0 ? '⚠️' : '❌'}
          </div>
          <h3 className="text-2xl font-bold text-white mb-2">测试完成</h3>
          <p className="text-gray-400">
            {summary.failed === 0 ? '所有测试通过！' : '部分测试失败，请查看详情'}
          </p>
        </div>

        {/* 测试摘要 */}
        <div className="grid grid-cols-5 gap-3">
          <div className="p-4 bg-gray-900 rounded-lg text-center">
            <div className="text-2xl font-bold text-white">{summary.total}</div>
            <div className="text-xs text-gray-400">总场景</div>
          </div>
          <div className="p-4 bg-green-900/30 rounded-lg text-center">
            <div className="text-2xl font-bold text-green-400">{summary.passed}</div>
            <div className="text-xs text-gray-400">通过</div>
          </div>
          <div className="p-4 bg-red-900/30 rounded-lg text-center">
            <div className="text-2xl font-bold text-red-400">{summary.failed}</div>
            <div className="text-xs text-gray-400">失败</div>
          </div>
          <div className="p-4 bg-gray-900/50 rounded-lg text-center">
            <div className="text-2xl font-bold text-gray-400">{summary.skipped}</div>
            <div className="text-xs text-gray-400">跳过</div>
          </div>
          <div className="p-4 bg-blue-900/30 rounded-lg text-center">
            <div className="text-2xl font-bold text-blue-400">{summary.passRate}%</div>
            <div className="text-xs text-gray-400">通过率</div>
          </div>
        </div>

        {/* 详细结果 */}
        {testResults.modules && testResults.modules.length > 0 && (
          <div className="max-h-60 overflow-y-auto">
            {testResults.modules.map((module, mIndex) => (
              <div key={mIndex} className="mb-4">
                <h4 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                  <span>{module.module}</span>
                  <span className={`px-2 py-0.5 text-xs rounded ${
                    module.priority === 'High' ? 'bg-red-900 text-red-300' :
                    module.priority === 'Medium' ? 'bg-yellow-900 text-yellow-300' :
                    'bg-gray-700 text-gray-300'
                  }`}>
                    {module.priority}
                  </span>
                </h4>

                {module.scenarios && module.scenarios.map((scenario, sIndex) => {
                  const statusIcon = scenario.status === 'passed' ? '✅' :
                    scenario.status === 'failed' ? '❌' : '⏭️';
                  const statusClass = scenario.status === 'passed' ? 'text-green-400' :
                    scenario.status === 'failed' ? 'text-red-400' : 'text-gray-400';

                  return (
                    <div key={sIndex} className="flex items-center justify-between p-2 bg-gray-900 rounded mb-1">
                      <div className="flex items-center gap-2">
                        <span>{statusIcon}</span>
                        <span className="text-sm text-gray-300">{scenario.name}</span>
                      </div>
                      <span className={`text-xs ${statusClass}`}>{scenario.status}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {/* 操作按钮 */}
        <div className="flex justify-between">
          <button
            onClick={handleRetest}
            className="px-6 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors text-white font-medium"
          >
            🔄 重新测试
          </button>
          <div className="flex gap-3">
            {reportUrl && (
              <button
                onClick={handleOpenReport}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors text-white font-medium"
              >
                📊 查看报告
              </button>
            )}
            <button
              onClick={onClose}
              className="px-6 py-2 bg-green-600 hover:bg-green-700 rounded-lg transition-colors text-white font-medium"
            >
              ✓ 完成
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70">
      <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-4xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">🧪 AI 测试</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeStep === 'select' && renderModeSelection()}
          {activeStep === 'import' && renderImportStep()}
          {activeStep === 'running' && renderRunningStep()}
          {activeStep === 'results' && renderResultsStep()}
        </div>

        {/* Progress Steps */}
        <div className="px-6 py-4 border-t border-gray-700">
          <div className="flex items-center justify-center gap-2">
            <div className={`flex items-center gap-2 ${activeStep === 'select' ? 'text-blue-400' : 'text-gray-500'}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${activeStep === 'select' ? 'bg-blue-600 text-white' : 'bg-gray-700'}`}>
                1
              </div>
              <span className="text-xs">选择模式</span>
            </div>
            <div className={`w-8 h-0.5 ${['import', 'running', 'results'].includes(activeStep) ? 'bg-blue-600' : 'bg-gray-700'}`}></div>
            <div className={`flex items-center gap-2 ${['import', 'running', 'results'].includes(activeStep) ? 'text-blue-400' : 'text-gray-500'}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${['import', 'running', 'results'].includes(activeStep) ? 'bg-blue-600 text-white' : 'bg-gray-700'}`}>
                2
              </div>
              <span className="text-xs">配置/导入</span>
            </div>
            <div className={`w-8 h-0.5 ${['running', 'results'].includes(activeStep) ? 'bg-blue-600' : 'bg-gray-700'}`}></div>
            <div className={`flex items-center gap-2 ${['running', 'results'].includes(activeStep) ? 'text-blue-400' : 'text-gray-500'}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${['running', 'results'].includes(activeStep) ? 'bg-blue-600 text-white' : 'bg-gray-700'}`}>
                3
              </div>
              <span className="text-xs">执行测试</span>
            </div>
            <div className={`w-8 h-0.5 ${activeStep === 'results' ? 'bg-blue-600' : 'bg-gray-700'}`}></div>
            <div className={`flex items-center gap-2 ${activeStep === 'results' ? 'text-blue-400' : 'text-gray-500'}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${activeStep === 'results' ? 'bg-blue-600 text-white' : 'bg-gray-700'}`}>
                4
              </div>
              <span className="text-xs">查看结果</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AITestModal;
