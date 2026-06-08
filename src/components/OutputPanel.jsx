/**
 * Output Panel Component
 *
 * Displays:
 * - Scan results
 * - Test results
 * - Logs
 * - Error messages
 */

import React from 'react';

function OutputPanel({ output }) {
  const getOutputIcon = (type) => {
    switch (type) {
      case 'error':
        return '❌';
      case 'warning':
        return '⚠️';
      case 'success':
        return '✅';
      default:
        return 'ℹ️';
    }
  };

  const getOutputColor = (type) => {
    switch (type) {
      case 'error':
        return 'text-red-400';
      case 'warning':
        return 'text-yellow-400';
      case 'success':
        return 'text-green-400';
      default:
        return 'text-blue-400';
    }
  };

  return (
    <div className="h-40 bg-gray-900 border-t border-gray-700 flex flex-col">
      {/* Output Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-300">Output</span>
          <span className={getOutputColor(output.type)}>{getOutputIcon(output.type)}</span>
        </div>
        <div className="flex items-center gap-2">
          <button className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded hover:bg-gray-700">
            Clear
          </button>
        </div>
      </div>

      {/* Output Content */}
      <div className="flex-1 p-3 overflow-y-auto">
        <div className={`font-mono text-sm ${getOutputColor(output.type)}`}>
          {output.message}
        </div>

        {/* Sample output lines */}
        {output.type === 'info' && (
          <div className="mt-3 space-y-1 font-mono text-xs text-gray-400">
            <div>[10:23:45] System initialized</div>
            <div>[10:23:46] Loaded project configuration</div>
            <div>[10:23:46] Scanning for dependencies...</div>
            <div>[10:23:47] Found 4 dependencies</div>
            <div className="text-green-400">[10:23:47] Ready</div>
          </div>
        )}
      </div>
    </div>
  );
}

export default OutputPanel;
