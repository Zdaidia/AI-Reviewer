/**
 * AI Agent Test Modal - Intelligent Testing
 *
 * 接受 Figma/UI截图/需求文档/API文档
 * AI 自动分析并执行测试，生成报告
 */

import React, { useState, useEffect } from 'react';

function AIAgentTestModal({ isOpen, onClose, electronAPI, projectUrl }) {
  const [activeStep, setActiveStep] = useState('upload'); // upload, analyzing, testing, results
  const [isLoading, setIsLoading] = useState(false);

  // 输入资源
  const [requirements, setRequirements] = useState('');
  const [figmaUrl, setFigmaUrl] = useState('');
  const [uiScreenshots, setUiScreenshots] = useState([]);
  const [apiDocs, setApiDocs] = useState([]);

  // 分析和测试结果
  const [analysisResult, setAnalysisResult] = useState(null);
  const [testResults, setTestResults] = useState(null);
  const [reportUrl, setReportUrl] = useState(null);

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
    setActiveStep('upload');
    setIsLoading(false);
    setRequirements('');
    setFigmaUrl('');
    setUiScreenshots([]);
    setApiDocs([]);
    setAnalysisResult(null);
    setTestResults(null);
    setReportUrl(null);
  };

  /**
   * 选择 UI 截图
   */
  const handleSelectScreenshots = async () => {
    try {
      const result = await electronAPI.selectFile();
      if (!result.canceled) {
        setUiScreenshots([...uiScreenshots, result.filePath]);
      }
    } catch (error) {
      console.error('选择截图失败:', error);
      alert('选择截图失败: ' + error.message);
    }
  };

  /**
   * 选择 API 文档
   */
  const handleSelectApiDocs = async () => {
    try {
      const result = await electronAPI.selectFile();
      if (!result.canceled) {
        setApiDocs([...apiDocs, result.filePath]);
      }
    } catch (error) {
      console.error('选择文档失败:', error);
      alert('选择文档失败: ' + error.message);
    }
  };

  /**
   * 移除截图
   */
  const removeScreenshot = (index) => {
    setUiScreenshots(uiScreenshots.filter((_, i) => i !== index));
  };

  /**
   * 移除 API 文档
   */
  const removeApiDoc = (index) => {
    setApiDocs(apiDocs.filter((_, i) => i !== index));
  };

  /**
   * 开始 AI 分析和测试
   */
  const handleStartAITest = async () => {
    // 验证至少有一个输入
    if (!requirements.trim() && !figmaUrl.trim() && uiScreenshots.length === 0 && apiDocs.length === 0) {
      alert('请至少提供一种测试资料：需求描述、Figma 链接、UI 截图或 API 文档');
      return;
    }

    setIsLoading(true);
    setActiveStep('analyzing');

    try {
      // 步骤1: AI 分析需求并生成测试计划
      const analysisResult = await electronAPI.analyzeAndGenerateTests({
        requirements: requirements.trim(),
        figmaUrl: figmaUrl.trim(),
        uiScreenshots,
        apiDocs,
        projectUrl,
      });

      if (!analysisResult.success) {
        throw new Error(analysisResult.error || '分析失败');
      }

      setAnalysisResult(analysisResult.analysis);
      setActiveStep('testing');

      // 步骤2: 执行 AI 生成的测试
      const testResult = await electronAPI.executeAgentTests(analysisResult.testPlan, {
        headless: false,
        slowMo: 100,
      });

      if (testResult.success) {
        setTestResults(testResult.testResult);

        // 生成报告
        const reportPath = await generateReport(testResult.testResult);
        if (reportPath) {
          setReportUrl(reportPath);
        }

        setActiveStep('results');
      } else {
        throw new Error(testResult.error || '测试执行失败');
      }
    } catch (error) {
      console.error('AI 测试失败:', error);
      alert('AI 测试失败: ' + error.message);
      setActiveStep('upload');
    } finally {
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
      }
      return null;
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

  if (!isOpen) return null;

  // 渲染上传步骤
  const renderUploadStep = () => (
    <div className="space-y-6">
      <div className="text-center">
        <div className="text-5xl mb-4">🤖</div>
        <h3 className="text-2xl font-bold text-white mb-2">AI Agent 智能测试</h3>
        <p className="text-gray-400">提供测试资料，AI 自动分析并执行测试</p>
      </div>

      {/* 项目信息 */}
      {projectUrl && (
        <div className="p-4 bg-blue-900/20 border border-blue-700 rounded-lg">
          <p className="text-sm text-blue-300">
            <span className="font-semibold">项目地址：</span>{projectUrl}
          </p>
        </div>
      )}

      {/* 需求描述 */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          <span className="flex items-center gap-2">
            <span className="text-xl">📝</span>
            需求描述
            <span className="text-xs text-gray-500">(必填其一)</span>
          </span>
        </label>
        <textarea
          value={requirements}
          onChange={(e) => setRequirements(e.target.value)}
          placeholder="描述需要测试的功能需求，例如：
- 用户登录功能：支持用户名/邮箱登录，记住密码
- 商品列表：支持分页、排序、筛选
- 购物车：添加商品、修改数量、结算"
          rows={5}
          disabled={isLoading}
          className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
        />
      </div>

      {/* Figma 链接 */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          <span className="flex items-center gap-2">
            <span className="text-xl">🎨</span>
            Figma 设计稿链接
            <span className="text-xs text-gray-500">(可选)</span>
          </span>
        </label>
        <input
          type="text"
          value={figmaUrl}
          onChange={(e) => setFigmaUrl(e.target.value)}
          placeholder="https://www.figma.com/file/..."
          disabled={isLoading}
          className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>

      {/* UI 截图 */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          <span className="flex items-center gap-2">
            <span className="text-xl">📸</span>
            UI 界面截图
            <span className="text-xs text-gray-500">(可选)</span>
          </span>
        </label>
        <button
          onClick={handleSelectScreenshots}
          disabled={isLoading}
          className="w-full px-4 py-3 bg-gray-900 border-2 border-dashed border-gray-700 hover:border-purple-500 rounded-lg transition-colors text-gray-400 hover:text-purple-400"
        >
          + 点击添加截图
        </button>

        {uiScreenshots.length > 0 && (
          <div className="mt-3 space-y-2">
            {uiScreenshots.map((screenshot, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-gray-900 rounded-lg">
                <div className="flex items-center gap-3">
                  <span className="text-xl">🖼️</span>
                  <span className="text-sm text-gray-300 truncate max-w-md">{screenshot}</span>
                </div>
                <button
                  onClick={() => removeScreenshot(index)}
                  className="p-2 text-gray-400 hover:text-red-400 transition-colors"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* API 文档 */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          <span className="flex items-center gap-2">
            <span className="text-xl">📚</span>
            API 文档
            <span className="text-xs text-gray-500">(可选)</span>
          </span>
        </label>
        <button
          onClick={handleSelectApiDocs}
          disabled={isLoading}
          className="w-full px-4 py-3 bg-gray-900 border-2 border-dashed border-gray-700 hover:border-purple-500 rounded-lg transition-colors text-gray-400 hover:text-purple-400"
        >
          + 点击添加 API 文档
        </button>

        {apiDocs.length > 0 && (
          <div className="mt-3 space-y-2">
            {apiDocs.map((doc, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-gray-900 rounded-lg">
                <div className="flex items-center gap-3">
                  <span className="text-xl">📄</span>
                  <span className="text-sm text-gray-300 truncate max-w-md">{doc}</span>
                </div>
                <button
                  onClick={() => removeApiDoc(index)}
                  className="p-2 text-gray-400 hover:text-red-400 transition-colors"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 操作按钮 */}
      <div className="flex justify-between pt-4 border-t border-gray-700">
        <button
          onClick={onClose}
          className="px-6 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors text-white font-medium"
        >
          取消
        </button>
        <button
          onClick={handleStartAITest}
          disabled={isLoading}
          className="px-8 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg transition-colors text-white font-medium flex items-center gap-2"
        >
          {isLoading ? (
            <>⏳ 处理中...</>
          ) : (
            <>
              <span>🚀</span>
              开始 AI 测试
            </>
          )}
        </button>
      </div>
    </div>
  );

  // 渲染分析中状态
  const renderAnalyzingStep = () => (
    <div className="space-y-6 text-center py-8">
      <div className="text-8xl animate-pulse">🧠</div>
      <h3 className="text-2xl font-bold text-white">AI 正在分析需求...</h3>
      <p className="text-gray-400">理解功能需求并生成测试计划</p>

      <div className="w-full bg-gray-700 rounded-full h-2 max-w-md mx-auto">
        <div className="bg-purple-600 h-2 rounded-full animate-pulse" style={{ width: '40%' }}></div>
      </div>

      <div className="space-y-2 text-left max-w-md mx-auto">
        <div className="flex items-center gap-2 text-gray-400">
          <span className="text-green-400">✓</span>
          <span className="text-sm">解析需求文档</span>
        </div>
        <div className="flex items-center gap-2 text-gray-400">
          <span className="text-purple-400 animate-pulse">→</span>
          <span className="text-sm">分析 Figma 设计稿...</span>
        </div>
        <div className="flex items-center gap-2 text-gray-500">
          <span>○</span>
          <span className="text-sm">生成测试用例</span>
        </div>
      </div>
    </div>
  );

  // 渲染测试中状态
  const renderTestingStep = () => (
    <div className="space-y-6 text-center py-8">
      <div className="text-8xl animate-pulse">🧪</div>
      <h3 className="text-2xl font-bold text-white">AI 正在执行测试...</h3>
      <p className="text-gray-400">逐步验证功能是否符合预期</p>

      <div className="w-full bg-gray-700 rounded-full h-2 max-w-md mx-auto">
        <div className="bg-blue-600 h-2 rounded-full animate-pulse" style={{ width: '60%' }}></div>
      </div>

      <div className="space-y-2 text-left max-w-md mx-auto">
        <div className="flex items-center gap-2 text-gray-400">
          <span className="text-green-400">✓</span>
          <span className="text-sm">启动浏览器</span>
        </div>
        <div className="flex items-center gap-2 text-gray-400">
          <span className="text-green-400">✓</span>
          <span className="text-sm">导航到项目页面</span>
        </div>
        <div className="flex items-center gap-2 text-gray-400">
          <span className="text-blue-400 animate-pulse">→</span>
          <span className="text-sm">执行测试步骤...</span>
        </div>
        <div className="flex items-center gap-2 text-gray-500">
          <span>○</span>
          <span className="text-sm">生成测试报告</span>
        </div>
      </div>
    </div>
  );

  // 渲染测试结果
  const renderResultsStep = () => {
    if (!testResults) return null;

    const total = testResults.totalScenarios || testResults.totalTests || 0;
    const passed = testResults.passedScenarios || testResults.passedTests || 0;
    const failed = testResults.failedScenarios || testResults.failedTests || 0;

    const summary = {
      total,
      passed,
      failed,
      passRate: total > 0
        ? ((passed / total) * 100).toFixed(1)
        : 0,
    };

    return (
      <div className="space-y-6">
        <div className="text-center">
          <div className="text-5xl mb-4">
            {summary.failed === 0 ? '🎉' : summary.passed > 0 ? '⚠️' : '❌'}
          </div>
          <h3 className="text-2xl font-bold text-white mb-2">AI 测试完成</h3>
          <p className="text-gray-400">
            {summary.failed === 0 ? '所有测试通过！' : '部分测试失败，请查看详情'}
          </p>
        </div>

        {/* AI 分析摘要 */}
        {analysisResult && (
          <div className="p-4 bg-purple-900/20 border border-purple-700 rounded-lg">
            <h4 className="text-sm font-semibold text-purple-300 mb-2">🧠 AI 分析摘要</h4>
            <p className="text-xs text-gray-300">{analysisResult.summary || '分析完成'}</p>
          </div>
        )}

        {/* 测试摘要 */}
        <div className="grid grid-cols-4 gap-3">
          <div className="p-4 bg-gray-900 rounded-lg text-center">
            <div className="text-2xl font-bold text-white">{summary.total}</div>
            <div className="text-xs text-gray-400">总测试</div>
          </div>
          <div className="p-4 bg-green-900/30 rounded-lg text-center">
            <div className="text-2xl font-bold text-green-400">{summary.passed}</div>
            <div className="text-xs text-gray-400">通过</div>
          </div>
          <div className="p-4 bg-red-900/30 rounded-lg text-center">
            <div className="text-2xl font-bold text-red-400">{summary.failed}</div>
            <div className="text-xs text-gray-400">失败</div>
          </div>
          <div className="p-4 bg-blue-900/30 rounded-lg text-center">
            <div className="text-2xl font-bold text-blue-400">{summary.passRate}%</div>
            <div className="text-xs text-gray-400">通过率</div>
          </div>
        </div>

        {/* 详细结果 */}
        {testResults.modules && testResults.modules.length > 0 && (
          <div className="max-h-48 overflow-y-auto">
            {testResults.modules.map((module, mIndex) => (
              <div key={mIndex} className="mb-3">
                <h4 className="text-sm font-semibold text-white mb-2">{module.module}</h4>
                {module.scenarios && module.scenarios.map((scenario, sIndex) => {
                  const statusIcon = scenario.status === 'passed' ? '✅' :
                    scenario.status === 'failed' ? '❌' : '⏭️';
                  return (
                    <div key={sIndex} className="flex items-center justify-between p-2 bg-gray-900 rounded mb-1">
                      <div className="flex items-center gap-2">
                        <span>{statusIcon}</span>
                        <span className="text-sm text-gray-300">{scenario.name}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {/* 操作按钮 */}
        <div className="flex justify-between pt-4 border-t border-gray-700">
          <button
            onClick={resetState}
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
      <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-3xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">🤖 AI Agent 测试</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeStep === 'upload' && renderUploadStep()}
          {activeStep === 'analyzing' && renderAnalyzingStep()}
          {activeStep === 'testing' && renderTestingStep()}
          {activeStep === 'results' && renderResultsStep()}
        </div>
      </div>
    </div>
  );
}

export default AIAgentTestModal;
