/**
 * Runner Panel Component
 *
 * Displays running projects and their output
 * Allows starting/stopping projects
 */

import React, { useState, useEffect } from 'react';

function RunnerPanel({
  runningProjects,
  projectOutputs,
  onStopProject,
  onStopAll,
  onSelectProject
}) {
  const [selectedProjectId, setSelectedProjectId] = useState(null);

  const selectedProject = runningProjects?.find(p => p.projectId === selectedProjectId);
  const selectedOutput = projectOutputs?.get(selectedProjectId) || [];

  const formatUptime = (ms) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  };

  const getOutputColor = (type) => {
    switch (type) {
      case 'stderr':
        return 'text-red-400';
      case 'stdout':
      default:
        return 'text-gray-300';
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <h3 className="text-sm font-semibold text-gray-300">Running Projects</h3>
        {runningProjects && runningProjects.length > 0 && (
          <button
            onClick={onStopAll}
            className="px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-xs transition-colors"
          >
            Stop All
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Project List */}
        <div className="w-1/3 border-r border-gray-700 overflow-y-auto">
          {runningProjects && runningProjects.length > 0 ? (
            runningProjects.map((project) => (
              <div
                key={project.projectId}
                className={`p-3 border-b border-gray-700 cursor-pointer hover:bg-gray-700 transition-colors ${
                  selectedProjectId === project.projectId ? 'bg-gray-700' : ''
                }`}
                onClick={() => {
                  setSelectedProjectId(project.projectId);
                  onSelectProject?.(project);
                }}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium truncate">
                    {project.projectPath.split('/').pop()}
                  </span>
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                </div>
                <div className="text-xs text-gray-400 space-y-0.5">
                  <div>Script: {project.script}</div>
                  <div>Port: {project.port}</div>
                  <div>Uptime: {formatUptime(project.uptime)}</div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onStopProject(project.projectId);
                  }}
                  className="mt-2 w-full px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-xs transition-colors"
                >
                  Stop
                </button>
              </div>
            ))
          ) : (
            <div className="p-4 text-center text-gray-500 text-sm">
              No running projects
            </div>
          )}
        </div>

        {/* Output */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selectedProject ? (
            <>
              <div className="px-4 py-2 bg-gray-800 border-b border-gray-700">
                <span className="text-sm text-gray-300">
                  Output: {selectedProject.projectPath.split('/').pop()} ({selectedProject.script})
                </span>
              </div>
              <div className="flex-1 overflow-y-auto p-4 bg-gray-900 font-mono text-xs">
                {selectedOutput.length > 0 ? (
                  selectedOutput.map((line, index) => (
                    <div
                      key={index}
                      className={`${getOutputColor(line.type)} whitespace-pre-wrap break-words`}
                    >
                      {line.data}
                    </div>
                  ))
                ) : (
                  <div className="text-gray-500">Waiting for output...</div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
              Select a project to view output
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default RunnerPanel;
