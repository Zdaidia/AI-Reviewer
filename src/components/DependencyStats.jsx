/**
 * Dependency Stats Component
 *
 * Displays dependency statistics
 */

import React from 'react';

function DependencyStats({ stats }) {
  if (!stats) {
    return (
      <div className="p-4 text-center text-gray-500 text-sm">
        No dependency stats available.
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="bg-gray-800 rounded-lg p-4">
        <h4 className="text-sm font-semibold mb-3">Project Type</h4>
        <div className="flex items-center gap-2">
          <span className="text-2xl">
            {stats.type === 'javascript' && '📜'}
            {stats.type === 'typescript' && '📘'}
            {stats.type === 'dart' && '🎯'}
            {stats.type === 'vue' && '💚'}
            {stats.type === 'unknown' && '❓'}
          </span>
          <span className="text-lg font-medium capitalize">{stats.type}</span>
        </div>
      </div>

      <div className="bg-gray-800 rounded-lg p-4">
        <h4 className="text-sm font-semibold mb-3">Files & Dependencies</h4>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Source Files</span>
            <span>{stats.sourceFiles}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Total Dependencies</span>
            <span>{stats.totalDependencies}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Installed</span>
            <span className="text-green-400">{stats.installedDependencies}</span>
          </div>
        </div>
      </div>

      {stats.configFiles && stats.configFiles.length > 0 && (
        <div className="bg-gray-800 rounded-lg p-4">
          <h4 className="text-sm font-semibold mb-3">Config Files</h4>
          <div className="flex flex-wrap gap-2">
            {stats.configFiles.map(config => (
              <span
                key={config}
                className="px-2 py-1 bg-gray-700 rounded text-xs text-gray-300"
              >
                {config}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default DependencyStats;
