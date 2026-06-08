/**
 * Agent Chat Component
 *
 * Conversational interface for interacting with the AI Agent.
 * Displays Agent thinking process and execution progress.
 */

import React, { useState, useEffect, useRef } from 'react';

const electronAPI = window.electronAPI;

function AgentChat({
  isOpen,
  onClose,
  onProcessRequest,
  agentStatus,
  currentPlan,
  messages = [],
  currentFile = null,
  projectPath = null
}) {
  const [inputValue, setInputValue] = useState('');
  const [chatMessages, setChatMessages] = useState(messages);
  const [isProcessing, setIsProcessing] = useState(false);
  const [thinking, setThinking] = useState('');
  const [hasLLM, setHasLLM] = useState(true);
  const messagesEndRef = useRef(null);

  // Check LLM availability on mount
  useEffect(() => {
    const checkLLMAvailability = async () => {
      try {
        if (electronAPI) {
          const result = await electronAPI.agentGetStatus();
          if (result.success) {
            // Check if we have LLM models available
            setHasLLM(result.hasLLM || (result.availableModels && result.availableModels.length > 0));
          }
        }
      } catch (error) {
        console.error('Error checking LLM availability:', error);
        // Default to true since we have GLM-5 configured on backend
        setHasLLM(true);
      }
    };
    checkLLMAvailability();
  }, []);

  useEffect(() => {
    setChatMessages(messages);
  }, [messages]);

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages, thinking]);

  useEffect(() => {
    setIsProcessing(agentStatus?.isProcessing || false);
  }, [agentStatus]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  /**
   * Handle scan action with specific target
   */
  const handleScan = async (scanType) => {
    if (isProcessing) return;

    let targetPath = null;
    let targetType = 'auto';
    let description = '';

    // Helper to get parent directory
    const getParentDir = (filePath) => {
      if (!filePath) return null;
      const parts = filePath.replace(/\\/g, '/').split('/');
      parts.pop();
      return parts.join('/');
    };

    switch (scanType) {
      case 'project':
        // Use projectPath (first added file/folder)
        targetPath = projectPath;
        targetType = 'directory';
        description = '扫描整个项目文件夹';
        break;
      case 'folder':
        // Use current file's parent directory
        targetPath = currentFile?.path ? getParentDir(currentFile.path) : projectPath;
        targetType = 'directory';
        description = '扫描当前文件夹';
        break;
      case 'file':
        // Use exactly the current file
        targetPath = currentFile?.path;
        targetType = 'file';
        description = '扫描当前文件';
        break;
    }

    if (!targetPath) {
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: '请先添加文件或文件夹到项目中',
        timestamp: new Date().toISOString(),
        isError: true
      }]);
      return;
    }

    const userMessage = {
      role: 'user',
      content: description,
      timestamp: new Date().toISOString()
    };

    setChatMessages(prev => [...prev, userMessage]);
    setIsProcessing(true);
    setThinking('正在扫描代码...');

    try {
      // Pass context with target path
      const request = {
        userRequest: `扫描代码质量 - 目标: ${targetPath}`,
        currentFile: currentFile?.path,
        currentProject: targetPath
      };

      if (onProcessRequest) {
        await onProcessRequest(request);
      } else if (electronAPI) {
        const result = await electronAPI.agentProcess(request);
        handleAgentResult(result);
      }
    } catch (error) {
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: `错误: ${error.message}`,
        timestamp: new Date().toISOString(),
        isError: true
      }]);
    } finally {
      setIsProcessing(false);
      setThinking('');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!inputValue.trim() || isProcessing) {
      return;
    }

    const userMessage = {
      role: 'user',
      content: inputValue,
      timestamp: new Date().toISOString()
    };

    setChatMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsProcessing(true);
    setThinking('Analyzing your request...');

    try {
      if (onProcessRequest) {
        await onProcessRequest(inputValue);
      } else if (electronAPI) {
        const result = await electronAPI.agentProcess(inputValue);
        handleAgentResult(result);
      }
    } catch (error) {
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: `Error: ${error.message}`,
        timestamp: new Date().toISOString(),
        isError: true
      }]);
    } finally {
      setIsProcessing(false);
      setThinking('');
    }
  };

  const handleAgentResult = (result) => {
    if (result.success) {
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: formatAgentResponse(result),
        timestamp: new Date().toISOString(),
        plan: result.plan,
        result: result.result
      }]);
    } else {
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: `Sorry, I encountered an error: ${result.error}`,
        timestamp: new Date().toISOString(),
        isError: true
      }]);
    }
  };

  const formatAgentResponse = (result) => {
    let response = '';

    if (result.plan) {
      response += `I'll help you with: **${result.plan.goal}**\n\n`;
      response += `Plan:\n`;
      for (const task of result.plan.tasks) {
        response += `- ${task.description}\n`;
      }
    }

    if (result.result) {
      response += `\n\nResult: ${result.result.summary || 'Completed'}`;
    }

    return response;
  };

  const renderMessage = (message, index) => {
    const isUser = message.role === 'user';
    const isError = message.isError;

    return (
      <div
        key={index}
        className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}
      >
        <div
          className={`max-w-[80%] rounded-lg px-4 py-2 ${
            isUser
              ? 'bg-blue-600 text-white'
              : isError
              ? 'bg-red-900/50 text-red-200 border border-red-700'
              : 'bg-gray-700 text-gray-100'
          }`}
        >
          {!isUser && (
            <div className="flex items-center gap-2 mb-1">
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-xs font-bold">
                AI
              </div>
              <span className="text-xs text-gray-400">Agent</span>
            </div>
          )}
          <div className="text-sm whitespace-pre-wrap">{message.content}</div>
          {message.reviewResult && (
            <div className="mt-3 space-y-3">
              {/* AI Analysis Summary */}
              {message.reviewResult.enhancedAnalysis && (
                <div className="p-3 bg-purple-500/10 rounded-lg border border-purple-500/30">
                  <div className="text-xs text-purple-400 mb-2 font-semibold">🤖 AI 智能分析</div>
                  {message.reviewResult.enhancedAnalysis.aiAnalysis && (
                    <div className="space-y-2">
                      {Object.entries(message.reviewResult.enhancedAnalysis.aiAnalysis.categories || {}).map(([category, data]) => (
                        data.count > 0 && (
                          <div key={category} className="flex items-center justify-between text-xs">
                            <span className="text-gray-300 capitalize">
                              {category === 'undefined' && '🔍 未定义方法'}
                              {category === 'crashes' && '💥 潜在崩溃'}
                              {category === 'memory' && '🧠 内存风险'}
                              {category === 'deadCode' && '💀 无效代码'}
                              {category === 'loops' && '🔄 循环风险'}
                              {category === 'other' && '📋 其他问题'}
                            </span>
                            <span className="text-purple-400 font-semibold">{data.count} 个</span>
                          </div>
                        )
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Priority List */}
              {message.reviewResult.enhancedAnalysis?.priority && (
                <div className="p-3 bg-yellow-500/10 rounded-lg border border-yellow-500/30">
                  <div className="text-xs text-yellow-400 mb-2 font-semibold">🎯 优先级排序</div>
                  <div className="space-y-1">
                    {message.reviewResult.enhancedAnalysis.priority.slice(0, 5).map((p, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className="text-yellow-400 font-bold">#{p.order}</span>
                        <span className="text-gray-300 flex-1">{p.issue}</span>
                        <span className="text-gray-500">({p.score}分)</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TODO Count */}
              {message.reviewResult.addedTodos !== undefined && (
                <div className="p-3 bg-green-500/10 rounded-lg border border-green-500/30">
                  <div className="text-xs text-green-400 font-semibold">✅ TODO 注释</div>
                  <div className="text-xs text-gray-300 mt-1">
                    已添加 {message.reviewResult.addedTodos} 个注释到代码文件
                    {message.reviewResult.skippedTodos > 0 && `（跳过 ${message.reviewResult.skippedTodos} 个已存在）`}
                  </div>
                </div>
              )}
            </div>
          )}
          {message.plan && (
            <div className="mt-3 p-3 bg-black/20 rounded-lg">
              <div className="text-xs text-gray-400 mb-2">Execution Plan</div>
              {message.plan.tasks.map((task, i) => (
                <div key={i} className="text-xs py-1 px-2 bg-white/5 rounded mb-1">
                  {i + 1}. {task.description}
                </div>
              ))}
            </div>
          )}
          <div className="text-xs text-gray-500 mt-1">
            {new Date(message.timestamp).toLocaleTimeString()}
          </div>
        </div>
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-3xl h-[600px] flex flex-col border border-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-white font-semibold">AI Agent</h2>
              <p className="text-xs text-gray-400">
                {agentStatus?.isProcessing ? 'Working...' : 'Ready to help'}
              </p>
            </div>
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

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4">
          {chatMessages.length === 0 && (
            <div className="text-center text-gray-400 py-8">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-purple-500/20 to-blue-500/20 flex items-center justify-center">
                <svg className="w-8 h-8 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </div>
              <p className="text-lg font-medium text-white mb-2">Hello! I'm your AI Agent</p>
              <p className="text-sm mb-1">I can help you scan code, fix issues, run tests, and manage your project.</p>

              {!hasLLM && (
                <div className="mx-auto max-w-md mt-3 p-3 bg-yellow-900/30 border border-yellow-700/50 rounded-lg">
                  <p className="text-xs text-yellow-300">
                    ⚠️ <strong>离线模式</strong> - 未检测到 API Key，使用规则模式
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    配置 OPENAI_API_KEY 或 ANTHROPIC_API_KEY 环境变量以启用完整 AI 功能
                  </p>
                </div>
              )}

              <div className="mt-6">
                <p className="text-xs text-gray-500 mb-3">快捷操作</p>

                {/* Scan Options */}
                <div className="mb-4">
                  <p className="text-xs text-purple-400 mb-2 flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    扫描代码
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => handleScan('project')}
                      disabled={isProcessing}
                      className="text-left px-3 py-3 bg-gradient-to-br from-purple-600/20 to-blue-600/20 hover:from-purple-600/30 hover:to-blue-600/30 border border-purple-500/30 rounded-lg text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <div className="font-medium text-purple-300">整个项目</div>
                      <div className="text-gray-500 mt-1">扫描项目文件夹</div>
                    </button>
                    <button
                      onClick={() => handleScan('folder')}
                      disabled={isProcessing || !currentFile}
                      className="text-left px-3 py-3 bg-gradient-to-br from-purple-600/20 to-blue-600/20 hover:from-purple-600/30 hover:to-blue-600/30 border border-purple-500/30 rounded-lg text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <div className="font-medium text-purple-300">当前文件夹</div>
                      <div className="text-gray-500 mt-1">扫描打开的文件夹</div>
                    </button>
                    <button
                      onClick={() => handleScan('file')}
                      disabled={isProcessing || !currentFile}
                      className="text-left px-3 py-3 bg-gradient-to-br from-purple-600/20 to-blue-600/20 hover:from-purple-600/30 hover:to-blue-600/30 border border-purple-500/30 rounded-lg text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <div className="font-medium text-purple-300">当前文件</div>
                      <div className="text-gray-500 mt-1">扫描选中的文件</div>
                    </button>
                  </div>
                </div>

                {/* Other Actions */}
                <div className="grid grid-cols-2 gap-2 max-w-md mx-auto">
                  <button
                    onClick={() => setInputValue('修复发现的问题')}
                    disabled={isProcessing}
                    className="text-left px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors disabled:opacity-50"
                  >
                    🔧 修复问题
                  </button>
                  <button
                    onClick={() => setInputValue('运行测试')}
                    disabled={isProcessing}
                    className="text-left px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors disabled:opacity-50"
                  >
                    🧪 运行测试
                  </button>
                  <button
                    onClick={() => setInputValue('启动开发服务器')}
                    disabled={isProcessing}
                    className="text-left px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors disabled:opacity-50"
                  >
                    🚀 运行项目
                  </button>
                  <button
                    onClick={() => setInputValue('分析项目结构')}
                    disabled={isProcessing}
                    className="text-left px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors disabled:opacity-50"
                  >
                    📊 项目结构
                  </button>
                </div>
              </div>
            </div>
          )}

          {chatMessages.map(renderMessage)}

          {thinking && (
            <div className="flex justify-start mb-4">
              <div className="bg-gray-700 rounded-lg px-4 py-2 max-w-[80%]">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" />
                  <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                  <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                  <span className="text-sm text-gray-300 ml-2">{thinking}</span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} className="p-4 border-t border-gray-700">
          <div className="flex gap-2">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Tell me what to do..."
              disabled={isProcessing}
              className="flex-1 bg-gray-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isProcessing || !inputValue.trim()}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
            >
              {isProcessing ? (
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              )}
            </button>
          </div>
          {currentPlan && (
            <div className="mt-2 text-xs text-gray-400">
              Plan: {currentPlan.goal} ({currentPlan.tasks.length} steps)
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

export default AgentChat;
