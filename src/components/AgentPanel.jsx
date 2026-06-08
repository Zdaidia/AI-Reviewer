/**
 * Agent Panel Component
 *
 * Displays Agent tasks, execution status, and provides manual intervention controls.
 */

import React, { useState, useEffect } from 'react';

function AgentPanel({
  isOpen,
  onClose,
  agentStatus,
  currentPlan,
  executionHistory,
  onApproveTask,
  onDenyTask,
  onAbort,
  onViewHistory
}) {
  const [selectedTab, setSelectedTab] = useState('current');
  const [pendingApprovals, setPendingApprovals] = useState([]);

  useEffect(() => {
    if (currentPlan) {
      const pending = currentPlan.tasks.filter(
        t => t.requiresApproval && t.status === 'pending'
      );
      setPendingApprovals(pending);
    }
  }, [currentPlan]);

  const getTaskStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return (
          <svg className="w-4 h-4 text-green-400" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        );
      case 'failed':
        return (
          <svg className="w-4 h-4 text-red-400" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
        );
      case 'in_progress':
        return (
          <svg className="w-4 h-4 text-blue-400 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        );
      default:
        return (
          <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
          </svg>
        );
    }
  };

  const renderCurrentPlan = () => {
    if (!currentPlan) {
      return (
        <div className="text-center text-gray-400 py-8">
          <svg className="w-12 h-12 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p>No active plan</p>
        </div>
      );
    }

    const progress = agentStatus?.progress || {
      total: currentPlan.tasks.length,
      completed: 0,
      percentage: 0
    };

    return (
      <div className="space-y-4">
        {/* Plan Header */}
        <div className="bg-gray-700/50 rounded-lg p-4">
          <h3 className="text-white font-medium mb-2">{currentPlan.goal}</h3>

          {/* Progress Bar */}
          <div className="mb-2">
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>Progress</span>
              <span>{progress.percentage || 0}%</span>
            </div>
            <div className="h-2 bg-gray-600 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-300"
                style={{ width: `${progress.percentage || 0}%` }}
              />
            </div>
          </div>

          <div className="flex gap-4 text-xs text-gray-400">
            <span>{progress.completed || 0}/{progress.total} completed</span>
            {progress.failed > 0 && <span className="text-red-400">{progress.failed} failed</span>}
          </div>
        </div>

        {/* Tasks */}
        <div className="space-y-2">
          {currentPlan.tasks.map((task, index) => (
            <div
              key={task.id}
              className={`bg-gray-700/30 rounded-lg p-3 border-l-4 ${
                task.status === 'completed' ? 'border-green-500' :
                task.status === 'failed' ? 'border-red-500' :
                task.status === 'in_progress' ? 'border-blue-500' :
                'border-gray-600'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 flex-1">
                  <div className="text-gray-500 text-sm mt-0.5">{index + 1}.</div>
                  <div className="flex-1">
                    <div className="text-white text-sm font-medium">{task.description}</div>
                    <div className="text-xs text-gray-400 mt-1">
                      Tool: {task.tool} • Action: {task.action}
                    </div>
                    {task.error && (
                      <div className="text-xs text-red-400 mt-1">{task.error}</div>
                    )}
                  </div>
                </div>
                <div className="ml-2">{getTaskStatusIcon(task.status)}</div>
              </div>

              {/* Approval Buttons */}
              {task.requiresApproval && task.status === 'pending' && (
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => onApproveTask && onApproveTask(task.id)}
                    className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded transition-colors"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => onDenyTask && onDenyTask(task.id)}
                    className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded transition-colors"
                  >
                    Deny
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Abort Button */}
        {agentStatus?.isProcessing && (
          <button
            onClick={onAbort}
            className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
          >
            Abort Execution
          </button>
        )}
      </div>
    );
  };

  const renderHistory = () => {
    if (!executionHistory || executionHistory.length === 0) {
      return (
        <div className="text-center text-gray-400 py-8">
          <svg className="w-12 h-12 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p>No execution history</p>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {executionHistory.map((episode, index) => (
          <div
            key={episode.id || index}
            className="bg-gray-700/30 rounded-lg p-4 hover:bg-gray-700/50 transition-colors cursor-pointer"
            onClick={() => onViewHistory && onViewHistory(episode)}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-white text-sm font-medium truncate">
                {episode.userRequest || episode.goal}
              </span>
              <span className={`text-xs px-2 py-1 rounded ${
                episode.status === 'completed' ? 'bg-green-900/50 text-green-300' :
                episode.status === 'failed' ? 'bg-red-900/50 text-red-300' :
                'bg-gray-600 text-gray-300'
              }`}>
                {episode.status}
              </span>
            </div>
            <div className="text-xs text-gray-400">
              {new Date(episode.startTime || episode.timestamp).toLocaleString()}
              {episode.duration && ` • ${Math.round(episode.duration)}s`}
            </div>
            {episode.steps && (
              <div className="text-xs text-gray-500 mt-1">
                {episode.steps.length} steps
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed right-0 top-0 bottom-0 w-96 bg-gray-800 border-l border-gray-700 flex flex-col shadow-xl z-40">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${
            agentStatus?.isProcessing ? 'bg-green-500 animate-pulse' : 'bg-gray-500'
          }`} />
          <h2 className="text-white font-semibold">Agent Tasks</h2>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-700">
        <button
          onClick={() => setSelectedTab('current')}
          className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
            selectedTab === 'current'
              ? 'text-white border-b-2 border-purple-500'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Current Plan
        </button>
        <button
          onClick={() => setSelectedTab('history')}
          className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
            selectedTab === 'history'
              ? 'text-white border-b-2 border-purple-500'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          History
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {selectedTab === 'current' ? renderCurrentPlan() : renderHistory()}
      </div>

      {/* Footer - Status */}
      <div className="px-4 py-3 border-t border-gray-700 bg-gray-900/50">
        <div className="flex items-center justify-between text-xs text-gray-400">
          <span>
            {agentStatus?.isProcessing ? 'Processing...' : 'Idle'}
          </span>
          {agentStatus?.hasErrors && (
            <span className="text-red-400">Errors detected</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default AgentPanel;
