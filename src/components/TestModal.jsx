/**
 * Test Operations Modal
 *
 * Modal for test operations with two modes:
 * 1. Excel Mode - Import Excel test cases and generate tests
 * 2. Playwright Mode - Directly run Playwright tests on running project
 */

import React, { useState, useEffect } from 'react';

function TestModal({ isOpen, onClose, onImport, onGenerate, onRun }) {
  const [activeTab, setActiveTab] = useState('mode'); // mode, excel-import, playwright-run
  const [testMode, setTestMode] = useState('playwright'); // playwright, excel

  // Excel Mode state
  const [importFile, setImportFile] = useState('');
  const [testCases, setTestCases] = useState(null);
  const [generatedPath, setGeneratedPath] = useState('');
  const [testPath, setTestPath] = useState('');

  // Playwright Mode state
  const [projectUrl, setProjectUrl] = useState('http://localhost:3000');
  const [testType, setTestType] = useState('basic'); // basic, navigation, forms
  const [browser, setBrowser] = useState('chromium');
  const [headless, setHeadless] = useState(false); // Default to headed for better UX
  const [loading, setLoading] = useState(false);

  const resetState = () => {
    setImportFile('');
    setTestCases(null);
    setGeneratedPath('');
    setTestPath('');
    setLoading(false);
    setProjectUrl('http://localhost:3000');
  };

  useEffect(() => {
    if (isOpen) {
      resetState();
      setActiveTab('mode');
    }
  }, [isOpen]);

  // Excel Mode handlers
  const handleSelectFile = async () => {
    if (!window.electronAPI) return;
    setLoading(true);
    try {
      const result = await window.electronAPI.selectFile();
      if (!result.canceled && result.filePath) {
        setImportFile(result.filePath);
        const parsed = await window.electronAPI.importExcelTest(result.filePath);
        if (parsed.success) {
          setTestCases(parsed.testCases);
        } else {
          alert(`Failed to parse Excel: ${parsed.error}`);
        }
      }
    } catch (error) {
      console.error('Error selecting file:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectFolder = async () => {
    if (!window.electronAPI) return;
    setLoading(true);
    try {
      const result = await window.electronAPI.selectFolder();
      if (!result.canceled && result.folderPath) {
        const filesResult = await window.electronAPI.findExcelFiles(result.folderPath);
        if (filesResult.success && filesResult.files.length > 0) {
          const excelFiles = filesResult.files;
          if (excelFiles.length === 1) {
            setImportFile(excelFiles[0]);
            const parsed = await window.electronAPI.importExcelTest(excelFiles[0]);
            if (parsed.success) {
              setTestCases(parsed.testCases);
            } else {
              alert(`Failed to parse Excel: ${parsed.error}`);
            }
          } else {
            const fileName = prompt(
              `Found ${excelFiles.length} Excel files:\n${excelFiles.map(f => `- ${f.split('\\').pop()}`).join('\n')}\n\nEnter the file name to use:`,
              excelFiles[0].split('\\').pop()
            );
            if (fileName) {
              const selectedFile = excelFiles.find(f => f.endsWith(fileName));
              if (selectedFile) {
                setImportFile(selectedFile);
                const parsed = await window.electronAPI.importExcelTest(selectedFile);
                if (parsed.success) {
                  setTestCases(parsed.testCases);
                } else {
                  alert(`Failed to parse Excel: ${parsed.error}`);
                }
              }
            }
          }
        } else {
          alert('No Excel files found in the selected folder');
        }
      }
    } catch (error) {
      console.error('Error selecting folder:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateFromExcel = async () => {
    if (!importFile) return;
    setLoading(true);
    try {
      const result = await window.electronAPI.generateTestCase(importFile, {
        language: 'typescript',
        includeAssertions: true,
        includeComments: true,
      });
      if (result.success) {
        setGeneratedPath(result.outputPath);
        setTestPath(result.outputPath);
        setActiveTab('excel-run');
      } else {
        alert(`Failed to generate test: ${result.error}`);
      }
    } catch (error) {
      console.error('Error generating test:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRunExcelTest = async () => {
    if (!testPath) return;
    setLoading(true);
    try {
      const result = await window.electronAPI.runTest(testPath, {
        headed: !headless,
        browser,
        reportDir: null,
      });
      if (result.success) {
        // Close modal immediately after starting test
        onClose();
      } else {
        alert(`Failed to run test: ${result.error}`);
        setLoading(false);
      }
    } catch (error) {
      console.error('Error running test:', error);
      setLoading(false);
    }
  };

  // Playwright Mode handlers
  const handleRunPlaywrightTest = async () => {
    setLoading(true);
    try {
      console.log('[TestModal] Running Playwright test:', { projectUrl, testType, browser, headless });

      const result = await window.electronAPI.runPlaywrightTest(projectUrl, {
        testType,
        browser,
        headed: !headless,
      });

      if (result.success) {
        // Close modal immediately after starting test
        onClose();
      } else {
        alert(`Failed to run test: ${result.error}`);
        setLoading(false);
      }
    } catch (error) {
      console.error('Error running Playwright test:', error);
      alert(`Error: ${error.message}`);
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h2 className="text-xl font-semibold text-white">🧪 Test Project</h2>
          <button
            onClick={() => { onClose(); }}
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
              <h3 className="text-lg font-medium text-white mb-4">Select Test Mode</h3>

              <div className="grid grid-cols-2 gap-4">
                {/* Playwright Mode */}
                <button
                  onClick={() => { setTestMode('playwright'); setActiveTab('playwright-run'); }}
                  className="p-6 bg-gradient-to-br from-blue-900 to-blue-800 hover:from-blue-800 hover:to-blue-700 rounded-lg border-2 border-blue-600 transition-all"
                >
                  <div className="text-center">
                    <div className="text-4xl mb-3">⚡</div>
                    <h4 className="text-lg font-semibold text-white mb-2">Playwright Test</h4>
                    <p className="text-sm text-gray-300">
                      Directly test any running project with Playwright
                    </p>
                    <div className="mt-3 text-xs text-blue-300">
                      ✅ Fast & Easy<br/>
                      ✅ No Excel needed<br/>
                      ✅ Test any URL
                    </div>
                  </div>
                </button>

                {/* Excel Mode */}
                <button
                  onClick={() => { setTestMode('excel'); setActiveTab('excel-import'); }}
                  className="p-6 bg-gradient-to-br from-green-900 to-green-800 hover:from-green-800 hover:to-green-700 rounded-lg border-2 border-green-600 transition-all"
                >
                  <div className="text-center">
                    <div className="text-4xl mb-3">📊</div>
                    <h4 className="text-lg font-semibold text-white mb-2">Excel Test Cases</h4>
                    <p className="text-sm text-gray-300">
                      Import test cases from Excel and run them
                    </p>
                    <div className="mt-3 text-xs text-green-300">
                      ✅ Organized test cases<br/>
                      ✅ Detailed documentation<br/>
                      ✅ Team collaboration
                    </div>
                  </div>
                </button>
              </div>

              <div className="flex justify-end mt-6">
                <button
                  onClick={() => { onClose(); }}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-md transition-colors text-sm font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Playwright Run Mode */}
          {activeTab === 'playwright-run' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-white">Playwright Test Configuration</h3>
                <button
                  onClick={() => setActiveTab('mode')}
                  className="text-sm text-blue-400 hover:text-blue-300"
                >
                  ← Change Mode
                </button>
              </div>

              {/* Project URL */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Project URL
                </label>
                <input
                  type="text"
                  value={projectUrl}
                  onChange={(e) => setProjectUrl(e.target.value)}
                  placeholder="http://localhost:3000"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Make sure your project is running at this URL
                </p>
              </div>

              {/* Test Type */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Test Type
                </label>
                <select
                  value={testType}
                  onChange={(e) => setTestType(e.target.value)}
                  className="w-full"
                >
                  <option value="basic">Basic Test (Homepage Load, Console Errors)</option>
                  <option value="navigation">Navigation Test (Click Elements)</option>
                  <option value="forms">Form Test (Input Fields)</option>
                </select>
              </div>

              {/* Browser Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Browser
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {['chromium', 'firefox', 'webkit'].map((b) => (
                    <button
                      key={b}
                      onClick={() => setBrowser(b)}
                      className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                        browser === b
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      {b.charAt(0).toUpperCase() + b.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Headless Mode */}
              <div className="flex items-center justify-between p-3 bg-gray-900 rounded-md">
                <div>
                  <label className="text-sm font-medium text-white">Headless Mode</label>
                  <p className="text-xs text-gray-400">Run browser in background (no visible window)</p>
                </div>
                <button
                  onClick={() => setHeadless(!headless)}
                  className={`w-12 h-6 rounded-full transition-colors ${
                    headless ? 'bg-blue-600' : 'bg-gray-600'
                  }`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full transition-transform ${
                    headless ? 'translate-x-6' : 'translate-x-0.5'
                  }`} />
                </button>
              </div>

              {/* Info Box */}
              <div className="p-3 bg-blue-900/20 border border-blue-700 rounded-md">
                <p className="text-sm text-blue-300">
                  ℹ️ <strong>Playwright</strong> will automatically generate tests and run them against your running project.
                  Tests will be created in the tool directory, not in your project.
                </p>
              </div>

              {/* Footer */}
              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setActiveTab('mode')}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-md transition-colors text-sm font-medium"
                >
                  Back
                </button>
                <button
                  onClick={handleRunPlaywrightTest}
                  disabled={loading}
                  className="px-6 py-2 bg-green-600 hover:bg-green-700 rounded-md transition-colors text-sm font-medium disabled:opacity-50 flex items-center gap-2"
                >
                  {loading ? (
                    'Running...'
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Run Playwright Test
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Excel Import Mode */}
          {activeTab === 'excel-import' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-white">Import Excel Test Cases</h3>
                <button
                  onClick={() => setActiveTab('mode')}
                  className="text-sm text-blue-400 hover:text-blue-300"
                >
                  ← Change Mode
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Select Excel Test File or Folder
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={importFile}
                    onChange={(e) => setImportFile(e.target.value)}
                    placeholder="Path to Excel file or folder..."
                    className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    readOnly
                  />
                  <button
                    onClick={handleSelectFile}
                    disabled={loading}
                    className="px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded-md transition-colors text-sm font-medium disabled:opacity-50"
                    title="Select Excel file"
                  >
                    📄 File
                  </button>
                  <button
                    onClick={handleSelectFolder}
                    disabled={loading}
                    className="px-3 py-2 bg-green-600 hover:bg-green-700 rounded-md transition-colors text-sm font-medium disabled:opacity-50"
                    title="Select folder with Excel files"
                  >
                    📁 Folder
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Choose a specific Excel file, or select a folder to search for Excel files
                </p>
              </div>

              {testCases && (
                <div className="p-3 bg-green-900/20 border border-green-700 rounded-md">
                  <p className="text-sm text-green-400">
                    ✓ Found {testCases.length} test case(s)
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => { onClose(); }}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-md transition-colors text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleGenerateFromExcel}
                  disabled={!importFile || !testCases || loading}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md transition-colors text-sm font-medium disabled:opacity-50"
                >
                  {loading ? 'Processing...' : 'Generate Test →'}
                </button>
              </div>
            </div>
          )}

          {/* Excel Run Mode */}
          {activeTab === 'excel-run' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-white">Run Generated Test</h3>
                <button
                  onClick={() => setActiveTab('mode')}
                  className="text-sm text-blue-400 hover:text-blue-300"
                >
                  ← Change Mode
                </button>
              </div>

              <div className="p-4 bg-gray-900 rounded-md space-y-2">
                <p className="text-sm text-gray-300">
                  <span className="text-gray-500">Test File:</span> {testPath}
                </p>
                <p className="text-sm text-gray-300">
                  <span className="text-gray-500">Source Excel:</span> {importFile}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Browser
                </label>
                <select
                  value={browser}
                  onChange={(e) => setBrowser(e.target.value)}
                  className="w-full"
                >
                  <option value="chromium">Chromium</option>
                  <option value="firefox">Firefox</option>
                  <option value="webkit">WebKit</option>
                </select>
              </div>

              <div className="flex items-center justify-between p-3 bg-gray-900 rounded-md">
                <div>
                  <label className="text-sm font-medium text-white">Headless Mode</label>
                  <p className="text-xs text-gray-400">Hide browser window</p>
                </div>
                <button
                  onClick={() => setHeadless(!headless)}
                  className={`w-12 h-6 rounded-full transition-colors ${
                    headless ? 'bg-blue-600' : 'bg-gray-600'
                  }`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full transition-transform ${
                    headless ? 'translate-x-6' : 'translate-x-0.5'
                  }`} />
                </button>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setActiveTab('excel-import')}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-md transition-colors text-sm font-medium"
                >
                  Back
                </button>
                <button
                  onClick={handleRunExcelTest}
                  disabled={loading}
                  className="px-6 py-2 bg-green-600 hover:bg-green-700 rounded-md transition-colors text-sm font-medium disabled:opacity-50 flex items-center gap-2"
                >
                  {loading ? 'Running...' : 'Run Test'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default TestModal;
