/**
 * AI Test Panel Component
 *
 * AI 测试面板组件
 * 提供两种测试模式：
 * 1. 用户提供测试用例（Excel BDD 格式）
 * 2. AI 生成测试用例
 */

import React, { useState, useEffect } from 'react';
import './AITestPanel.css';

function AITestPanel({ electronAPI, onClose }) {
  const [activeTab, setActiveTab] = useState('upload'); // 'upload' or 'generate'
  const [testMode, setTestMode] = useState('bdd'); // 'bdd' or 'ai'
  const [isLoading, setIsLoading] = useState(false);
  const [testResults, setTestResults] = useState(null);
  const [executionLogs, setExecutionLogs] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [requirementText, setRequirementText] = useState('');
  const [reportUrl, setReportUrl] = useState(null);
  const [isDownloading, setIsDownloading] = useState(false);

  // 清理资源
  useEffect(() => {
    return () => {
      if (reportUrl) {
        URL.revokeObjectURL(reportUrl);
      }
    };
  }, [reportUrl]);

  /**
   * 选择 Excel 文件
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
   * 执行 BDD 测试
   */
  const handleExecuteBDCTest = async () => {
    if (!selectedFile) {
      alert('请先选择测试文件');
      return;
    }

    setIsLoading(true);
    setTestResults(null);
    setExecutionLogs([]);
    setReportUrl(null);

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
      } else {
        alert('测试执行失败: ' + result.error);
      }
    } catch (error) {
      console.error('执行测试失败:', error);
      alert('执行测试失败: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * AI 生成测试用例
   */
  const handleGenerateTests = async () => {
    if (!requirementText.trim()) {
      alert('请输入需求描述');
      return;
    }

    setIsLoading(true);

    try {
      const result = await electronAPI.generateAITests(requirementText, {
        framework: 'react',
        includeErrorCases: true,
      });

      if (result.success) {
        setTestResults(result.generatedTests);
        setExecutionLogs([]);

        // 询问是否立即执行
        const shouldExecute = confirm('测试用例生成成功！是否立即执行？');
        if (shouldExecute) {
          await executeGeneratedTests(result.generatedTests);
        }
      } else {
        alert('生成测试用例失败: ' + result.error);
      }
    } catch (error) {
      console.error('生成测试失败:', error);
      alert('生成测试失败: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * 执行生成的测试
   */
  const executeGeneratedTests = async (generatedTests) => {
    setIsLoading(true);

    try {
      const result = await electronAPI.executeGeneratedTests(generatedTests, {
        headless: false,
        slowMo: 100,
      });

      if (result.success) {
        setTestResults(result.testResult);
        setExecutionLogs(result.logs || []);

        const reportPath = await generateReport(result.testResult);
        if (reportPath) {
          setReportUrl(reportPath);
        }
      } else {
        alert('执行测试失败: ' + result.error);
      }
    } catch (error) {
      console.error('执行测试失败:', error);
      alert('执行测试失败: ' + error.message);
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
   * 下载测试报告
   */
  const handleDownloadReport = async (format) => {
    if (!testResults) return;

    setIsDownloading(true);
    try {
      const result = await electronAPI.downloadTestReport(testResults, format);
      if (result.success) {
        console.log(`报告已下载: ${result.fileName}`);
      } else {
        alert('下载报告失败: ' + result.error);
      }
    } catch (error) {
      console.error('下载报告失败:', error);
      alert('下载报告失败: ' + error.message);
    } finally {
      setIsDownloading(false);
    }
  };

  /**
   * 渲染上传测试模式
   */
  const renderUploadMode = () => (
    <div className="upload-mode">
      <h3>上传测试用例</h3>
      <p className="description">
        从 Excel 文件导入 BDD 格式测试用例并执行
      </p>

      <div className="file-selector">
        <button
          onClick={handleSelectFile}
          disabled={isLoading}
          className="btn btn-secondary"
        >
          📁 选择 Excel 文件
        </button>

        {selectedFile && (
          <div className="selected-file">
            <span className="file-icon">📄</span>
            <span className="file-name">{selectedFile}</span>
            <button
              onClick={() => setSelectedFile(null)}
              className="btn-icon"
              title="清除"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      <div className="format-info">
        <h4>Excel 格式说明：</h4>
        <table className="format-table">
          <thead>
            <tr>
              <th>Function</th>
              <th>優先級</th>
              <th>Scenario</th>
              <th>Given</th>
              <th>When</th>
              <th>Then</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>案件列表</td>
              <td>High</td>
              <td>查看默认案件列表</td>
              <td>用户已登录</td>
              <td>进入案件列表页面</td>
              <td>默认显示10条</td>
            </tr>
          </tbody>
        </table>
      </div>

      <button
        onClick={handleExecuteBDCTest}
        disabled={!selectedFile || isLoading}
        className="btn btn-primary"
      >
        {isLoading ? '⏳ 执行中...' : '▶️ 执行测试'}
      </button>
    </div>
  );

  /**
   * 渲染 AI 生成模式
   */
  const renderGenerateMode = () => (
    <div className="generate-mode">
      <h3>AI 生成测试用例</h3>
      <p className="description">
        输入需求描述，AI 自动生成测试用例
      </p>

      <div className="requirement-input">
        <label htmlFor="requirement">需求描述：</label>
        <textarea
          id="requirement"
          value={requirementText}
          onChange={(e) => setRequirementText(e.target.value)}
          placeholder="例如：实现用户登录功能，包括用户名密码验证、记住密码、错误提示等"
          rows={6}
          disabled={isLoading}
        />
      </div>

      <div className="options">
        <label>
          <input type="checkbox" defaultChecked />
          包含错误场景
        </label>
        <label>
          <input type="checkbox" defaultChecked />
          包含边界条件
        </label>
      </div>

      <button
        onClick={handleGenerateTests}
        disabled={!requirementText.trim() || isLoading}
        className="btn btn-primary"
      >
        {isLoading ? '🤖 生成中...' : '✨ 生成测试用例'}
      </button>
    </div>
  );

  /**
   * 渲染测试结果
   */
  const renderTestResults = () => {
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
      failRate: testResults.totalScenarios > 0
        ? ((testResults.failedScenarios / testResults.totalScenarios) * 100).toFixed(1)
        : 0,
    };

    return (
      <div className="test-results">
        <h3>测试结果</h3>

        <div className="summary">
          <div className="summary-card summary-total">
            <div className="summary-label">总用例数</div>
            <div className="summary-value">{summary.total}</div>
          </div>
          <div className="summary-card summary-passed">
            <div className="summary-label">通过条数</div>
            <div className="summary-value">{summary.passed}</div>
          </div>
          <div className="summary-card summary-failed">
            <div className="summary-label">失败条数</div>
            <div className="summary-value">{summary.failed}</div>
          </div>
          <div className="summary-card summary-rate">
            <div className="summary-label">通过率</div>
            <div className="summary-value">{summary.passRate}%</div>
          </div>
          <div className="summary-card summary-fail-rate">
            <div className="summary-label">失败率</div>
            <div className="summary-value">{summary.failRate}%</div>
          </div>
          <div className="summary-card summary-duration">
            <div className="summary-label">耗时</div>
            <div className="summary-value">{(summary.duration / 1000).toFixed(1)}s</div>
          </div>
        </div>

        {/* 下载报告按钮区域 */}
        <div className="report-download-section">
          <h4>下载测试报告</h4>
          <div className="download-buttons">
            <button
              onClick={() => handleDownloadReport('excel')}
              disabled={isDownloading}
              className="btn btn-download btn-excel"
              title="下载 Excel 格式报告（包含详细 BDD 格式和失败描述）"
            >
              {isDownloading ? '⏳ 下载中...' : '📊 下载 Excel'}
            </button>
            <button
              onClick={() => handleDownloadReport('html')}
              disabled={isDownloading}
              className="btn btn-download btn-html"
              title="下载 HTML 格式报告（可在浏览器中查看）"
            >
              {isDownloading ? '⏳ 下载中...' : '🌐 下载 HTML'}
            </button>
            <button
              onClick={() => handleDownloadReport('pdf')}
              disabled={isDownloading}
              className="btn btn-download btn-pdf"
              title="下载 PDF 格式报告（适合打印和分享）"
            >
              {isDownloading ? '⏳ 下载中...' : '📄 下载 PDF'}
            </button>
          </div>
        </div>

        {reportUrl && (
          <button onClick={handleOpenReport} className="btn btn-secondary">
            📊 在浏览器中查看报告
          </button>
        )}

        {testResults.modules && testResults.modules.map((module, mIndex) => (
          <div key={mIndex} className="module-results">
            <h4>
              {module.module}
              <span className={`priority priority-${module.priority.toLowerCase()}`}>
                {module.priority}
              </span>
            </h4>

            {module.scenarios && module.scenarios.map((scenario, sIndex) => {
              const statusIcon = scenario.status === 'passed' ? '✅' : scenario.status === 'failed' ? '❌' : '⏭️';
              const statusClass = scenario.status === 'passed' ? 'passed' : scenario.status === 'failed' ? 'failed' : 'skipped';

              return (
                <div key={sIndex} className={`scenario scenario-${statusClass}`}>
                  <div className="scenario-header">
                    <span className="scenario-icon">{statusIcon}</span>
                    <span className="scenario-name">{scenario.name}</span>
                    <span className="scenario-status">{scenario.status}</span>
                    <span className="scenario-duration">{(scenario.duration / 1000).toFixed(1)}s</span>
                  </div>

                  {scenario.errors && scenario.errors.length > 0 && (
                    <div className="scenario-errors">
                      <strong>错误：</strong>
                      <ul>
                        {scenario.errors.map((error, eIndex) => (
                          <li key={eIndex}>{error.error || JSON.stringify(error)}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}

        {executionLogs.length > 0 && (
          <details className="execution-logs">
            <summary>执行日志 ({executionLogs.length})</summary>
            <pre>{JSON.stringify(executionLogs, null, 2)}</pre>
          </details>
        )}
      </div>
    );
  };

  return (
    <div className="ai-test-panel">
      <div className="panel-header">
        <h2>AI 测试</h2>
        <button onClick={onClose} className="btn-icon close-btn" title="关闭">
          ✕
        </button>
      </div>

      <div className="panel-tabs">
        <button
          className={`tab ${activeTab === 'upload' ? 'active' : ''}`}
          onClick={() => setActiveTab('upload')}
        >
          📤 上传测试
        </button>
        <button
          className={`tab ${activeTab === 'generate' ? 'active' : ''}`}
          onClick={() => setActiveTab('generate')}
        >
          ✨ AI 生成
        </button>
      </div>

      <div className="panel-content">
        {activeTab === 'upload' ? renderUploadMode() : renderGenerateMode()}
        {renderTestResults()}
      </div>

      {isLoading && (
        <div className="loading-overlay">
          <div className="spinner"></div>
          <p>测试执行中...</p>
        </div>
      )}
    </div>
  );
}

export default AITestPanel;
