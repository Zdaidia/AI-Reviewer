/**
 * AI Configuration Modal
 *
 * Allows user to configure AI provider, API key, and model
 */

import React, { useState, useEffect } from 'react';

function AiConfigModal({ isOpen, onClose, onSave, initialConfig }) {
  const [config, setConfig] = useState({
    provider: 'zhipu',
    apiKey: 'sk-IO4OtE6TEQGPAG9DIrs8ok0kOlZxXsWRiDdMNitCJQCoY7RG',
    apiEndpoint: 'https://newapi.cdskysoft.cn/v1',
    model: 'glm-5.1',
    temperature: 0.2,
    maxTokens: 2000,
    includeDependencies: true,
    maxDependencyDepth: 2,
  });

  const [validation, setValidation] = useState({ valid: true, errors: [] });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    if (initialConfig) {
      setConfig(initialConfig);
    }
  }, [initialConfig]);

  const handleChange = (field, value) => {
    setConfig(prev => ({ ...prev, [field]: value }));
    setTestResult(null);
  };

  const handleSave = () => {
    onSave(config);
    onClose();
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);

    try {
      // Validate config
      const errors = [];
      if (!config.apiKey) errors.push('API Key is required');
      if (!config.model) errors.push('Model is required');
      if (config.provider === 'custom' && !config.apiEndpoint) {
        errors.push('API Endpoint is required for custom provider');
      }

      if (errors.length > 0) {
        setValidation({ valid: false, errors });
        setTestResult({ success: false, message: errors.join(', ') });
        return;
      }

      // Test connection via IPC
      if (window.electronAPI) {
        const result = await window.electronAPI.aiFixInit(config);
        setTestResult(result);
      }
    } catch (error) {
      setTestResult({ success: false, message: error.message });
    } finally {
      setTesting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg shadow-2xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h2 className="text-xl font-semibold text-white">AI Configuration</h2>
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
          {/* Provider */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Provider
            </label>
            <select
              value={config.provider}
              onChange={(e) => handleChange('provider', e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="claude-code">Claude Code (推荐)</option>
              <option value="zhipu">智谱 AI</option>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="azure">Azure OpenAI</option>
              <option value="custom">Custom Endpoint</option>
            </select>
          </div>

          {/* API Key */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              API Key
            </label>
            <input
              type="password"
              value={config.apiKey}
              onChange={(e) => handleChange('apiKey', e.target.value)}
              placeholder="sk-..."
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* API Endpoint (for custom) */}
          {config.provider === 'custom' && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                API Endpoint
              </label>
              <input
                type="text"
                value={config.apiEndpoint}
                onChange={(e) => handleChange('apiEndpoint', e.target.value)}
                placeholder="https://api.example.com/v1/chat/completions"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          {/* Model */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Model
            </label>
            <select
              value={config.model}
              onChange={(e) => handleChange('model', e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="glm-5">GLM-5 (推荐)</option>
              <option value="glm-4-flash">GLM-4 Flash</option>
              <option value="glm-4">GLM-4</option>
              <option value="gpt-4-turbo">GPT-4 Turbo</option>
              <option value="gpt-4">GPT-4</option>
              <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
            </select>
          </div>

          {/* Temperature */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Temperature: {config.temperature}
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={config.temperature}
              onChange={(e) => handleChange('temperature', parseFloat(e.target.value))}
              className="w-full"
            />
            <p className="text-xs text-gray-500 mt-1">
              Lower = more focused, Higher = more creative
            </p>
          </div>

          {/* Max Tokens */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Max Tokens
            </label>
            <input
              type="number"
              min="100"
              max="8000"
              step="100"
              value={config.maxTokens}
              onChange={(e) => handleChange('maxTokens', parseInt(e.target.value))}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Include Dependencies */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="includeDeps"
              checked={config.includeDependencies}
              onChange={(e) => handleChange('includeDependencies', e.target.checked)}
              className="rounded"
            />
            <label htmlFor="includeDeps" className="text-sm text-gray-300">
              Include dependency context
            </label>
          </div>

          {/* Test Result */}
          {testResult && (
            <div className={`p-3 rounded-md ${testResult.success ? 'bg-green-900/30 text-green-300' : 'bg-red-900/30 text-red-300'
              }`}>
              <p className="text-sm">
                {testResult.success ? '✓ Connection successful!' : `✗ ${testResult.message || testResult.error}`}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-700">
          <button
            onClick={handleTest}
            disabled={testing}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-md transition-colors text-sm font-medium disabled:opacity-50"
          >
            {testing ? 'Testing...' : 'Test Connection'}
          </button>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-md transition-colors text-sm font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md transition-colors text-sm font-medium"
            >
              Save Configuration
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AiConfigModal;
