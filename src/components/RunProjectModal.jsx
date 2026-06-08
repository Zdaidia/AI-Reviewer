/**
 * Run Project Modal Component
 *
 * Allows user to select project and script to run
 */

import React, { useState, useEffect } from 'react';

function RunProjectModal({ isOpen, onClose, onRun }) {
  const [projectPath, setProjectPath] = useState('');
  const [projectInfo, setProjectInfo] = useState(null);
  const [selectedScript, setSelectedScript] = useState('');
  const [availableScripts, setAvailableScripts] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && window.electronAPI) {
      // Reset state
      setProjectPath('');
      setProjectInfo(null);
      setSelectedScript('');
      setAvailableScripts([]);
    }
  }, [isOpen]);

  const handleSelectProject = async () => {
    if (!window.electronAPI) return;

    setLoading(true);
    try {
      const result = await window.electronAPI.addFileFolder();
      if (!result.canceled && result.files && result.files.length > 0) {
        const folder = result.files.find(f => f.type === 'folder');
        if (folder) {
          setProjectPath(folder.path);

          // Detect project
          const info = await window.electronAPI.detectProject(folder.path);
          if (info.success) {
            setProjectInfo(info.info);

            // Get available scripts or commands
            const scripts = await window.electronAPI.getProjectScripts(folder.path);
            if (scripts.success) {
              // Handle both Node.js scripts and Flutter commands
              let scriptNames = [];

              if (scripts.projectType === 'flutter') {
                // Flutter commands: convert object keys to array
                scriptNames = Object.keys(scripts.scripts);
              } else {
                // Node.js scripts
                scriptNames = Object.keys(scripts.scripts);
              }

              setAvailableScripts(scriptNames);

              // Auto-select default script
              if (scriptNames.includes('Run Web')) {
                setSelectedScript('Run Web');  // Flutter default
              } else if (scriptNames.includes('dev')) {
                setSelectedScript('dev');
              } else if (scriptNames.includes('start')) {
                setSelectedScript('start');
              } else if (scriptNames.length > 0) {
                setSelectedScript(scriptNames[0]);
              }
            }
          } else {
            // Show error if project detection failed
            console.error('Project detection failed:', info.error);
          }
        }
      }
    } catch (error) {
      console.error('Error selecting project:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRun = () => {
    if (!projectPath || !selectedScript) return;
    onRun(projectPath, { script: selectedScript, openBrowser: true });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg shadow-2xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h2 className="text-xl font-semibold text-white">Run Project</h2>
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
        <div className="p-6 space-y-4">
          {/* Project Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Project Directory
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={projectPath}
                onChange={(e) => setProjectPath(e.target.value)}
                placeholder="Select a project folder..."
                className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                readOnly
              />
              <button
                onClick={handleSelectProject}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md transition-colors text-sm font-medium disabled:opacity-50"
              >
                {loading ? 'Loading...' : 'Browse'}
              </button>
            </div>
          </div>

          {/* Project Info */}
          {projectInfo && (
            <div className="p-3 bg-gray-900 rounded-md">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-400">Type:</span>
                <span className="text-white font-medium capitalize">
                  {projectInfo.type}
                  {projectInfo.type.startsWith('flutter') && ' 📱'}
                </span>
                {projectInfo.framework && (
                  <>
                    <span className="text-gray-600">|</span>
                    <span className="text-blue-400">{projectInfo.framework}</span>
                  </>
                )}
              </div>
              {projectInfo.description && (
                <div className="text-xs text-gray-500 mt-1">
                  {projectInfo.description}
                </div>
              )}
              {projectInfo.message && (
                <div className="text-xs text-yellow-500 mt-1">
                  ⚠️ {projectInfo.message}
                </div>
              )}
            </div>
          )}

          {/* No project info warning */}
          {!projectInfo && projectPath && (
            <div className="p-3 bg-yellow-900/20 rounded-md border border-yellow-700">
              <div className="text-xs text-yellow-400">
                ⚠️ Unable to detect project type. Make sure this is a valid project with package.json (Node.js) or pubspec.yaml (Flutter).
              </div>
            </div>
          )}

          {/* Script Selection */}
          {availableScripts.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Startup Script
              </label>
              <select
                value={selectedScript}
                onChange={(e) => setSelectedScript(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {availableScripts.map((script) => (
                  <option key={script} value={script}>
                    {script}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-md transition-colors text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleRun}
            disabled={!projectPath || !selectedScript}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-md transition-colors text-sm font-medium disabled:opacity-50 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Run Project
          </button>
        </div>
      </div>
    </div>
  );
}

export default RunProjectModal;
