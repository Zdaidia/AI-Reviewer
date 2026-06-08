/**
 * Test Panel Component
 *
 * Displays test cases, results, and test execution controls
 */

import React, { useState, useEffect } from 'react';

function TestPanel({
  testCases,
  testResult,
  runningTests,
  onStopTest,
  onGenerateReport,
  onOpenReport,
  onClose,
}) {
  const [selectedTab, setSelectedTab] = useState('running'); // Start with running tab to show active tests

  const renderTestCases = () => (
    <div className="p-4 space-y-2">
      {!testCases || testCases.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-4">
          No test cases. Import Excel test file to get started.
        </p>
      ) : (
        testCases.map((testCase, index) => (
          <div
            key={testCase.id || index}
            className="p-3 bg-gray-800 rounded-md border border-gray-700 hover:border-gray-600"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs bg-blue-900 text-blue-300 px-2 py-0.5 rounded">
                    {testCase.id || `TC${index + 1}`}
                  </span>
                  {testCase.priority && (
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      testCase.priority === 'high' ? 'bg-red-900 text-red-300' :
                      testCase.priority === 'medium' ? 'bg-yellow-900 text-yellow-300' :
                      'bg-gray-700 text-gray-300'
                    }`}>
                      {testCase.priority}
                    </span>
                  )}
                </div>
                <h4 className="text-sm font-medium">{testCase.name || 'Unnamed Test'}</h4>
                {testCase.description && (
                  <p className="text-xs text-gray-400 mt-1">{testCase.description}</p>
                )}
                {testCase.url && (
                  <p className="text-xs text-gray-500 mt-1">
                    URL: <span className="font-mono">{testCase.url}</span>
                  </p>
                )}
              </div>
            </div>
            {testCase.steps && testCase.steps.length > 0 && (
              <div className="mt-2 pt-2 border-t border-gray-700">
                <p className="text-xs text-gray-400 mb-1">Steps:</p>
                <ol className="text-xs text-gray-300 space-y-1">
                  {testCase.steps.map((step, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-gray-500">{i + 1}.</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );

  const renderTestResults = () => (
    <div className="p-4">
      {!testResult ? (
        <p className="text-gray-500 text-sm text-center py-4">
          No test results. Run a test to see results.
        </p>
      ) : (
        <div className="space-y-4">
          {/* Summary */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-sm font-semibold mb-3">Test Summary</h3>
            <div className="grid grid-cols-4 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-blue-400">{testResult.total || 0}</p>
                <p className="text-xs text-gray-400">Total</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-green-400">{testResult.passed || 0}</p>
                <p className="text-xs text-gray-400">Passed</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-red-400">{testResult.failed || 0}</p>
                <p className="text-xs text-gray-400">Failed</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-yellow-400">{testResult.skipped || 0}</p>
                <p className="text-xs text-gray-400">Skipped</p>
              </div>
            </div>
            {/* Progress Bar */}
            <div className="mt-4 w-full h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500"
                style={{ width: `${(testResult.total > 0 ? (testResult.passed / testResult.total) * 100 : 0)}%` }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Pass Rate: {testResult.total > 0 ? ((testResult.passed / testResult.total) * 100).toFixed(1) : 0}%
            </p>
          </div>

          {/* Duration */}
          {testResult.duration && (
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Duration</span>
                <span>{Math.round(testResult.duration / 1000)}s</span>
              </div>
            </div>
          )}

          {/* Report Actions */}
          {testResult.reportPaths && (
            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="text-sm font-semibold mb-3">Reports Generated</h3>
              <div className="space-y-2">
                {testResult.reportPaths.html && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-300">HTML Report</span>
                    <button
                      onClick={() => onOpenReport(testResult.reportPaths.html)}
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs transition-colors"
                    >
                      Open
                    </button>
                  </div>
                )}
                {testResult.reportPaths.json && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-300">JSON Report</span>
                    <span className="text-xs text-gray-500">{testResult.reportPaths.json.split('/').pop()}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  const renderReportTab = () => (
    <div className="p-4">
      <div className="bg-gray-800 rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-3">Generate Test Report</h3>
        <p className="text-xs text-gray-400 mb-4">
          Generate a detailed test report in various formats.
        </p>
        <div className="space-y-2">
          <button
            onClick={() => onGenerateReport('html')}
            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm transition-colors"
          >
            Generate HTML Report
          </button>
          <button
            onClick={() => onGenerateReport('json')}
            className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
          >
            Generate JSON Report
          </button>
          <button
            onClick={() => onGenerateReport('junit')}
            className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
          >
            Generate JUnit XML
          </button>
        </div>
      </div>

      {testResult && testResult.reportPaths && testResult.reportPaths.html && (
        <div className="mt-4 bg-gray-800 rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-3">Latest Report</h3>
          <button
            onClick={() => onOpenReport(testResult.reportPaths.html)}
            className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 rounded text-sm transition-colors"
          >
            Open HTML Report
          </button>
        </div>
      )}
    </div>
  );

  const renderRunningTests = () => (
    <div className="p-4 space-y-2">
      {runningTests && runningTests.length > 0 ? (
        runningTests.map((test) => (
          <div
            key={test.testId}
            className="p-3 bg-gray-800 rounded-md border border-green-700"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{test.target.split('/').pop()}</p>
                <p className="text-xs text-gray-400">
                  Running for {Math.round(test.uptime / 1000)}s
                </p>
              </div>
              <button
                onClick={() => onStopTest(test.testId)}
                className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-xs transition-colors"
              >
                Stop
              </button>
            </div>
          </div>
        ))
      ) : (
        <p className="text-gray-500 text-sm text-center py-4">No tests running</p>
      )}
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header with tabs */}
      <div className="flex items-center bg-gray-800 border-b border-gray-700">
        <button
          onClick={() => setSelectedTab('cases')}
          className={`px-4 py-2 text-sm transition-colors ${
            selectedTab === 'cases'
              ? 'bg-gray-700 text-white border-b-2 border-blue-500'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Test Cases ({testCases?.length || 0})
        </button>
        <button
          onClick={() => setSelectedTab('results')}
          className={`px-4 py-2 text-sm transition-colors ${
            selectedTab === 'results'
              ? 'bg-gray-700 text-white border-b-2 border-blue-500'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Results
        </button>
        <button
          onClick={() => setSelectedTab('report')}
          className={`px-4 py-2 text-sm transition-colors ${
            selectedTab === 'report'
              ? 'bg-gray-700 text-white border-b-2 border-blue-500'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Report
        </button>
        {runningTests && runningTests.length > 0 && (
          <button
            onClick={() => setSelectedTab('running')}
            className={`px-4 py-2 text-sm transition-colors ${
              selectedTab === 'running'
                ? 'bg-gray-700 text-white border-b-2 border-green-500'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Running ({runningTests.length})
          </button>
        )}
        <div className="flex-1" /> {/* Spacer */}
        {onClose && (
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors flex items-center gap-2"
            title="Close Test Panel"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Close
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {selectedTab === 'cases' && renderTestCases()}
        {selectedTab === 'results' && renderTestResults()}
        {selectedTab === 'report' && renderReportTab()}
        {selectedTab === 'running' && renderRunningTests()}
      </div>
    </div>
  );
}

export default TestPanel;
