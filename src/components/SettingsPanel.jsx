/**
 * Settings Panel Component
 *
 * 统一配置界面：
 * - AI Fixer 配置
 * - Code Review 规则配置
 */

import React, { useState, useEffect, useRef } from 'react';

function SettingsPanel({ isOpen, onClose, electronAPI }) {
  const [activeTab, setActiveTab] = useState('ai'); // 'ai' | 'rules'
  const [aiConfig, setAiConfig] = useState(null);
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  // 新增规则相关状态
  const [addRuleModalOpen, setAddRuleModalOpen] = useState(false);
  const [newRule, setNewRule] = useState({
    id: '',
    name: '',
    severity: 'warning',
    languages: [],
    message: '',
    suggestion: '',
    pattern: '',
    autoFix: false,
    enabled: true,
    category: '',
  });
  const fileInputRef = useRef(null);

  // Load configurations on mount
  useEffect(() => {
    if (isOpen) {
      loadAIConfig();
      loadRulesConfig();
    }
  }, [isOpen]);

  // 每个 provider 的默认配置（同 AIConfigTab 中定义，此处用于加载时补全）
  const PROVIDER_DEFAULTS_LOAD = {
    'claude-code': {
      apiKey: 'sk-GhM2nKkY7mzEUHviI65lHkHLnBUgpt0j2I7NVN14j0KMxb5H',
      apiEndpoint: 'https://ai.router.team',
      model: 'glm-5',
    },
    'deepseek': {
      apiKey: 'sk-0a91440a6a7d49f4ac6175ef278f6c91',
      apiEndpoint: 'https://api.deepseek.com/anthropic',
      model: 'deepseek-v4-pro',
    },
    'zhipu': {
      apiKey: 'sk-IO4OtE6TEQGPAG9DIrs8ok0kOlZxXsWRiDdMNitCJQCoY7RG',
      apiEndpoint: 'https://newapi.cdskysoft.cn/v1',
      model: 'glm-5.1',
    },
    'openai': {
      apiKey: '',
      apiEndpoint: 'https://api.openai.com/v1',
      model: 'gpt-4',
    },
    'anthropic': {
      apiKey: '',
      apiEndpoint: 'https://api.anthropic.com',
      model: 'claude-sonnet-4-6',
    },
    'custom': {
      apiKey: '',
      apiEndpoint: '',
      model: '',
    },
  };

  // Load AI Configuration
  const loadAIConfig = async () => {
    if (!electronAPI) return;
    setLoading(true);
    try {
      const result = await electronAPI.aiFixConfig();
      if (result.success) {
        let config = result.config;

        // 根据 apiKey 和 apiEndpoint 反推匹配的 provider
        let matchedProvider = null;
        if (config.apiKey || config.apiEndpoint) {
          for (const [name, defaults] of Object.entries(PROVIDER_DEFAULTS_LOAD)) {
            if (defaults.apiKey && config.apiKey === defaults.apiKey) {
              matchedProvider = name;
              break;
            }
            if (defaults.apiEndpoint && config.apiEndpoint === defaults.apiEndpoint) {
              matchedProvider = name;
              break;
            }
          }
        }

        // 用匹配到的 provider，否则用保存的 provider，否则默认第一个
        config.provider = matchedProvider || config.provider || 'zhipu';

        // 用 provider 默认值补全缺失字段（但优先使用用户保存的配置）
        const defaults = PROVIDER_DEFAULTS_LOAD[config.provider] || PROVIDER_DEFAULTS_LOAD['zhipu'];

        // 检查是否有该 provider 的用户保存配置
        const savedProviderConfig = config.providerConfigs?.[config.provider];
        if (savedProviderConfig) {
          // 用户保存的配置优先
          if (savedProviderConfig.apiKey) config.apiKey = savedProviderConfig.apiKey;
          if (savedProviderConfig.apiEndpoint) config.apiEndpoint = savedProviderConfig.apiEndpoint;
          if (savedProviderConfig.model) config.model = savedProviderConfig.model;
        } else {
          // 没有用户保存配置，使用默认值补全
          if (!config.apiKey) config.apiKey = defaults.apiKey;
          if (!config.apiEndpoint) config.apiEndpoint = defaults.apiEndpoint;
          if (!config.model) config.model = defaults.model;
        }

        setAiConfig(config);
      }
    } catch (error) {
      setMessage({ type: 'error', text: '加载 AI 配置失败: ' + error.message });
    } finally {
      setLoading(false);
    }
  };

  // Load Rules Configuration
  const loadRulesConfig = async () => {
    // 规则列表 - 从 scanner 获取
    if (!electronAPI) return;
    try {
      const result = await electronAPI.getRulesConfig();
      if (result.success) {
        setRules(result.rules);
      } else {
        setRules(getDefaultRules());
      }
    } catch (error) {
      console.error('加载规则配置失败:', error);
      setRules(getDefaultRules());
    }
  };

  // Save AI Configuration
  const saveAIConfig = async () => {
    if (!electronAPI) return;
    setSaving(true);
    try {
      const result = await electronAPI.aiFixUpdateConfig(aiConfig);
      if (result.success) {
        setMessage({ type: 'success', text: 'AI 配置已保存' });
        setTimeout(() => {
          setMessage(null);
          onClose();  // 保存成功后关闭弹窗
        }, 1000);
      } else {
        setMessage({ type: 'error', text: result.error });
      }
    } catch (error) {
      setMessage({ type: 'error', text: '保存失败: ' + error.message });
    } finally {
      setSaving(false);
    }
  };

  // Toggle rule enabled state
  const toggleRule = (ruleId) => {
    setRules(rules.map(rule =>
      rule.id === ruleId ? { ...rule, enabled: !rule.enabled } : rule
    ));
  };

  // Delete rule
  const deleteRule = (ruleId) => {
    setRules(rules.filter(rule => rule.id !== ruleId));
    setMessage({ type: 'info', text: `规则 ${ruleId} 已删除` });
    setTimeout(() => setMessage(null), 2000);
  };

  // Delete all rules in a category (by language key)
  // 真正删除，删除后规则不再可用
  const deleteCategoryRules = (langKey, categoryRules) => {
    const ruleIdsToDelete = categoryRules.map(r => r.id);
    setRules(prev => prev.filter(rule => !ruleIdsToDelete.includes(rule.id)));
    setMessage({ type: 'info', text: `已删除 ${ruleIdsToDelete.length} 条规则` });
    setTimeout(() => setMessage(null), 2000);
  };

  // Edit rule
  const editRule = (updatedRule) => {
    setRules(rules.map(rule =>
      rule.id === updatedRule.id ? { ...rule, ...updatedRule } : rule
    ));
    setMessage({ type: 'success', text: `规则 ${updatedRule.id} 已更新` });
    setTimeout(() => setMessage(null), 2000);
  };

  // Add new rule
  const addNewRule = () => {
    // 验证必填字段
    if (!newRule.id || !newRule.name || !newRule.message) {
      setMessage({ type: 'error', text: '请填写规则 ID、名称和描述' });
      setTimeout(() => setMessage(null), 3000);
      return;
    }

    // 检查 ID 是否已存在
    if (rules.some(r => r.id === newRule.id)) {
      setMessage({ type: 'error', text: `规则 ID ${newRule.id} 已存在` });
      setTimeout(() => setMessage(null), 3000);
      return;
    }

    setRules([...rules, { ...newRule }]);
    setAddRuleModalOpen(false);
    setNewRule({
      id: '',
      name: '',
      severity: 'warning',
      languages: [],
      message: '',
      suggestion: '',
      pattern: '',
      autoFix: false,
      enabled: true,
      category: '',
    });
    setMessage({ type: 'success', text: '规则已添加' });
    setTimeout(() => setMessage(null), 2000);
  };

  // Import rules from file
  const importRules = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      let importedRules = [];

      // 判断文件类型并解析
      if (file.name.endsWith('.json')) {
        importedRules = JSON.parse(text);
      } else if (file.name.endsWith('.yaml') || file.name.endsWith('.yml')) {
        // 通过 IPC 调用后端解析 YAML
        if (!electronAPI) {
          setMessage({ type: 'error', text: 'Electron API 未初始化' });
          setTimeout(() => setMessage(null), 3000);
          return;
        }
        const result = await electronAPI.parseYamlRules(text);
        if (!result.success) {
          setMessage({ type: 'error', text: result.error || 'YAML 解析失败' });
          setTimeout(() => setMessage(null), 3000);
          return;
        }
        importedRules = result.rules;
      } else {
        setMessage({ type: 'error', text: '不支持的文件格式，请使用 .json 或 .yaml' });
        setTimeout(() => setMessage(null), 3000);
        return;
      }

      // 确保是数组
      if (!Array.isArray(importedRules)) {
        importedRules = [importedRules];
      }

      // 根据规则 ID 推断默认语言
      const inferLanguageFromRuleId = (ruleId) => {
        if (ruleId.startsWith('FLUT-') || ruleId.startsWith('DART-')) {
          return ['dart'];
        } else if (ruleId.startsWith('JS-') || ruleId.startsWith('JS-NULL-')) {
          return ['javascript', 'typescript'];
        } else if (ruleId.startsWith('TS-')) {
          return ['typescript'];
        } else if (ruleId.startsWith('VUE-')) {
          return ['vue'];
        } else if (ruleId.startsWith('GEN-')) {
          return ['javascript', 'typescript', 'vue', 'dart'];
        } else if (ruleId.startsWith('CSS-')) {
          return ['css'];
        } else if (ruleId.startsWith('HTML-')) {
          return ['html'];
        }
        // 默认返回通用语言
        return ['javascript', 'typescript', 'vue', 'dart'];
      };

      // 根据规则 ID 或 languages 推断目标分类
      const inferCategory = (ruleId, languages) => {
        if (ruleId.startsWith('JS-') || ruleId.startsWith('JS-NULL-') || ruleId.startsWith('TS-')) return 'js-ts';
        if (ruleId.startsWith('DART-') || ruleId.startsWith('DART-NULL-') || ruleId.startsWith('FLUT-')) return 'dart';
        if (ruleId.startsWith('VUE-')) return 'vue';
        if (ruleId.startsWith('CSS-')) return 'css';
        if (ruleId.startsWith('GEN-')) return 'general';
        // 根据 languages 推断
        if (languages?.length) {
          if (languages.includes('dart')) return 'dart';
          if (languages.includes('vue')) return 'vue';
          if (languages.includes('css')) return 'css';
          if (languages.some(l => ['javascript', 'typescript', 'jsx', 'tsx'].includes(l))) return 'js-ts';
        }
        return '';
      };

      // 检查规则 pattern 是否过于宽泛（会导致误报）
      const isPatternTooBroad = (rule) => {
        // 如果规则使用 AST 模板检测，不会误报
        if (rule.detectionType === 'ast-template' || rule.template) {
          return false;
        }

        // 只有使用正则 pattern 的规则才检查
        if (!rule.pattern) return false;

        // 检查 pattern 是否过于简单（会导致误报）
        const problematicPatterns = [
          // 导入检查 - 无法准确判断未使用/重复（除非使用 AST 模板）
          { id: 'FLUT-DEP-001', reason: '无法通过单行正则判断导入是否未使用，请使用 detectionType: "ast-template" 和 template: "unused-import"' },
          { id: 'FLUT-DEP-002', reason: '无法通过单行正则判断导入是否重复，请使用 detectionType: "ast-template" 和 template: "duplicate-import"' },
          // Future 检查 - pattern 过于宽泛
          { id: 'FLUT-ERR-004', reason: 'pattern 过于宽泛，会误报正常代码' },
        ];

        const problematic = problematicPatterns.find(p => p.id === rule.id);
        if (problematic) {
          console.warn(`[导入规则] 规则 ${rule.id} 已禁用: ${problematic.reason}`);
          return true;
        }
        return false;
      };

      // 检查规则是否可以使用 AST 模板替代正则
      const suggestASTTemplate = (rule) => {
        const astSuggestions = {
          'FLUT-DEP-001': 'unused-import',
          'FLUT-DEP-002': 'duplicate-import',
          'FLUT-ERR-001': 'empty-catch',
          'DART-002': 'empty-catch',
          'FLUT-MEM-001': 'missing-dispose',
          'FLUT-NUL-002': 'unsafe-first-last',
          'FLUT-WID-001': 'missing-return',
          'FLUT-NAM-004': 'class-naming',
          'FLUT-NAM-005': 'method-naming',
          'FLUT-NUL-005': 'required-nullable',
        };

        if (astSuggestions[rule.id] && !rule.detectionType && !rule.template) {
          console.warn(`[导入规则] 建议: 规则 ${rule.id} 可使用 AST 模板 "${astSuggestions[rule.id]}" 替代正则，提高检测准确度`);
        }
      };

      // 验证并合并规则
      let addedCount = 0;
      let skippedCount = 0;
      let duplicateCount = 0;
      let disabledCount = 0;
      const updatedRules = [...rules];

      for (const rule of importedRules) {
        if (!rule.id || !rule.name) {
          skippedCount++;
          console.warn('[导入规则] 跳过无效规则（缺少 id 或 name）:', rule);
          continue;
        }

        // 检查是否已存在
        const existingIndex = updatedRules.findIndex(r => r.id === rule.id);
        if (existingIndex >= 0) {
          duplicateCount++;
          console.warn('[导入规则] 规则已存在，跳过:', rule.id);
          continue; // 跳过已存在的规则，不重复导入
        }

        // 检查 pattern 是否过于宽泛
        if (isPatternTooBroad(rule)) {
          disabledCount++;
          continue; // 跳过不准确的规则
        }

        // 建议 AST 模板替代
        suggestASTTemplate(rule);

        // 使用规则指定的 languages，如果没有则根据 ID 推断
        const ruleLanguages = rule.languages || inferLanguageFromRuleId(rule.id);

        // 添加新规则，设置默认值和 source 标记
        const ruleCategory = rule.category || inferCategory(rule.id, rule.languages || ruleLanguages);
        updatedRules.push({
          severity: 'warning',
          languages: ruleLanguages,
          autoFix: false,
          enabled: true,
          source: 'user-imported',
          category: ruleCategory,
          ...rule,
          ...(rule.languages ? {} : { languages: ruleLanguages }),
          // category 不被 rule 覆盖（除非 rule 显式指定了 category）
          ...(rule.category ? {} : { category: ruleCategory }),
        });
        addedCount++;
      }

      setRules(updatedRules);
      setMessage({
        type: 'success',
        text: `导入成功：新增 ${addedCount} 条，跳过 ${skippedCount} 条无效，${duplicateCount} 条已存在，${disabledCount} 条因 pattern 不准确已禁用`
      });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      setMessage({ type: 'error', text: '导入失败: ' + error.message });
      setTimeout(() => setMessage(null), 3000);
    } finally {
      // 重置文件输入
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Export rules to file
  const exportRules = () => {
    const dataStr = JSON.stringify(rules, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'code-review-rules.json';
    link.click();
    URL.revokeObjectURL(url);
    setMessage({ type: 'success', text: '规则已导出' });
    setTimeout(() => setMessage(null), 2000);
  };

  // Save rules configuration
  const saveRulesConfig = async () => {
    if (!electronAPI) return;
    try {
      const result = await electronAPI.updateRulesConfig(rules);
      if (result.success) {
        setMessage({ type: 'success', text: '规则配置已保存' });
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage({ type: 'error', text: result.error });
      }
    } catch (error) {
      setMessage({ type: 'error', text: '保存失败: ' + error.message });
      setTimeout(() => setMessage(null), 3000);
    }
  };

  // Reset rules configuration to default
  const resetRulesConfig = () => {
    setRules(getDefaultRules());
    setMessage({ type: 'info', text: '规则已重置为默认配置' });
    setTimeout(() => setMessage(null), 2000);
  };

  // Reset to defaults
  const resetToDefaults = () => {
    if (activeTab === 'ai') {
      setAiConfig(getDefaultAIConfig());
    } else {
      setRules(getDefaultRules());
    }
    setMessage({ type: 'info', text: '已重置为默认配置' });
    setTimeout(() => setMessage(null), 3000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <h2 className="text-xl font-semibold text-white">设置</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700">
          <button
            onClick={() => setActiveTab('ai')}
            className={`flex-1 px-6 py-3 text-sm font-medium transition-colors ${
              activeTab === 'ai'
                ? 'text-blue-400 border-b-2 border-blue-400 bg-gray-700/50'
                : 'text-gray-400 hover:text-white hover:bg-gray-700/30'
            }`}
          >
            <span className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              AI 配置
            </span>
          </button>
          <button
            onClick={() => setActiveTab('rules')}
            className={`flex-1 px-6 py-3 text-sm font-medium transition-colors ${
              activeTab === 'rules'
                ? 'text-blue-400 border-b-2 border-blue-400 bg-gray-700/50'
                : 'text-gray-400 hover:text-white hover:bg-gray-700/30'
            }`}
          >
            <span className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              审查规则
            </span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Message */}
          {message && (
            <div className={`mb-4 px-4 py-2 rounded-lg ${
              message.type === 'success' ? 'bg-green-900/50 text-green-300' :
              message.type === 'error' ? 'bg-red-900/50 text-red-300' :
              'bg-blue-900/50 text-blue-300'
            }`}>
              {message.text}
            </div>
          )}

          {activeTab === 'ai' && aiConfig && (
            <AIConfigTab
              config={aiConfig}
              onChange={setAiConfig}
              onSave={saveAIConfig}
              onReset={resetToDefaults}
              saving={saving}
              electronAPI={electronAPI}
            />
          )}

          {activeTab === 'rules' && (
            <RulesConfigTab
              rules={rules}
              onToggle={toggleRule}
              onDelete={deleteRule}
              onDeleteCategory={deleteCategoryRules}
              onAddRule={() => setAddRuleModalOpen(true)}
              onImport={importRules}
              onExport={exportRules}
              onSave={saveRulesConfig}
              onReset={resetRulesConfig}
              fileInputRef={fileInputRef}
              onEditRule={editRule}
            />
          )}
        </div>
      </div>

      {/* Add Rule Modal */}
      {addRuleModalOpen && (
        <AddRuleModal
          isOpen={addRuleModalOpen}
          onClose={() => setAddRuleModalOpen(false)}
          onAdd={addNewRule}
          newRule={newRule}
          setNewRule={setNewRule}
        />
      )}
    </div>
  );
}

/**
 * AI Configuration Tab
 *
 * 统一配置入口：所有 AI 调用（AI Fix、Agent、QA Reviewer、AI Test）使用此配置
 */
function AIConfigTab({ config, onChange, onSave, onReset, saving, electronAPI }) {
  const [localConfig, setLocalConfig] = useState(config);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [showApiKey, setShowApiKey] = useState(false);

  useEffect(() => {
    setLocalConfig(config);
  }, [config]);

  // 每个 provider 的默认配置
  const PROVIDER_DEFAULTS = {
    'claude-code': {
      apiKey: 'sk-GhM2nKkY7mzEUHviI65lHkHLnBUgpt0j2I7NVN14j0KMxb5H',
      endpoint: 'https://ai.router.team',
      model: 'glm-5',
      models: ['glm-5', 'deepseek-v4-pro', 'claude-opus-4-6', 'claude-sonnet-4-6']
    },
    'deepseek': {
      apiKey: 'sk-0a91440a6a7d49f4ac6175ef278f6c91',
      endpoint: 'https://api.deepseek.com/anthropic',
      model: 'deepseek-v4-pro',
      models: ['deepseek-v4-pro', 'deepseek-chat']
    },
    'zhipu': {
      apiKey: 'sk-IO4OtE6TEQGPAG9DIrs8ok0kOlZxXsWRiDdMNitCJQCoY7RG',
      endpoint: 'https://newapi.cdskysoft.cn/v1',
      model: 'glm-5.1',
      models: ['glm-5.1', 'glm-5', 'glm-4', 'glm-4-flash']
    },
    'openai': {
      apiKey: '',
      endpoint: 'https://api.openai.com/v1',
      model: 'gpt-4',
      models: ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo']
    },
    'anthropic': {
      apiKey: '',
      endpoint: 'https://api.anthropic.com',
      model: 'claude-sonnet-4-6',
      models: ['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5']
    },
    'custom': {
      apiKey: '',
      endpoint: '',
      model: '',
      models: []
    },
  };

  const updateField = (field, value) => {
    onChange({ ...localConfig, [field]: value });
  };

  // 切换 provider 时自动更新 apiKey、endpoint、model
  const switchProvider = (provider) => {
    const defaults = PROVIDER_DEFAULTS[provider];
    const updates = { provider };

    // 检查是否有该 provider 的用户保存配置
    const savedProviderConfig = localConfig.providerConfigs?.[provider];

    if (savedProviderConfig) {
      // 用户保存的配置优先
      updates.apiKey = savedProviderConfig.apiKey || defaults.apiKey;
      updates.apiEndpoint = savedProviderConfig.apiEndpoint || defaults.endpoint;
      updates.model = savedProviderConfig.model || defaults.model;
    } else {
      // 没有用户保存配置，直接使用新 provider 的默认值
      updates.apiKey = defaults.apiKey;
      updates.apiEndpoint = defaults.endpoint;
      updates.model = defaults.model;
    }

    onChange({ ...localConfig, ...updates });
  };

  // 测试连接
  const testConnection = async () => {
    setTestingConnection(true);
    setTestResult(null);
    try {
      const result = await electronAPI.testLLMConnection({
        provider: localConfig.provider,
        apiKey: localConfig.apiKey,
        apiEndpoint: localConfig.apiEndpoint,
        model: localConfig.model
      });
      setTestResult(result);
    } catch (error) {
      setTestResult({ success: false, error: error.message });
    } finally {
      setTestingConnection(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 提示 */}
      <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-blue-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="text-sm text-gray-300">
            此处配置为全局生效，所有 AI 功能（AI 修复、代码审查、QA 审查、AI 测试）将统一使用以下模型和 API 配置。
          </div>
        </div>
      </div>

      {/* Provider Selection */}
      <div className="bg-gray-900 rounded-lg p-4">
        <h3 className="text-white font-medium mb-3">AI 提供商</h3>
        <div className="grid grid-cols-3 gap-2">
          {[
            { value: 'zhipu', label: '智谱 AI (推荐)', icon: '🇨🇳' },
            { value: 'deepseek', label: 'DeepSeek', icon: '🐋' },
            { value: 'claude-code', label: 'Router Team', icon: '🤖' },
            { value: 'openai', label: 'OpenAI', icon: '🌐' },
            { value: 'anthropic', label: 'Anthropic', icon: '🧠' },
            { value: 'custom', label: '自定义', icon: '🔧' },
          ].map(provider => (
            <button
              key={provider.value}
              onClick={() => switchProvider(provider.value)}
              className={`px-3 py-2 rounded-lg text-sm transition-all ${
                localConfig.provider === provider.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              <span className="mr-1">{provider.icon}</span>
              {provider.label}
            </button>
          ))}
        </div>
      </div>

      {/* API Configuration */}
      <div className="bg-gray-900 rounded-lg p-4 space-y-4">
        <h3 className="text-white font-medium">API 配置</h3>

        <div>
          <label className="block text-sm text-gray-400 mb-1">API Key</label>
          <div className="relative">
            <input
              type={showApiKey ? 'text' : 'password'}
              value={localConfig.apiKey || ''}
              onChange={(e) => updateField('apiKey', e.target.value)}
              placeholder="输入 API Key"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 pr-10 text-white text-sm focus:outline-none focus:border-blue-500"
            />
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 p-1"
              title={showApiKey ? '隐藏 API Key' : '显示 API Key'}
            >
              {showApiKey ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">API 端点</label>
          <input
            type="text"
            value={localConfig.apiEndpoint || ''}
            onChange={(e) => updateField('apiEndpoint', e.target.value)}
            placeholder="https://api.example.com/v1"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
          />
          {PROVIDER_DEFAULTS[localConfig.provider]?.endpoint && (
            <div className="mt-1 text-xs text-gray-500">
              默认: {PROVIDER_DEFAULTS[localConfig.provider].endpoint}
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">模型</label>
          <input
            type="text"
            value={localConfig.model || ''}
            onChange={(e) => updateField('model', e.target.value)}
            placeholder="glm-5.1, glm-5, deepseek-v4-pro, gpt-4, etc."
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
          />
          {/* 模型建议 */}
          {PROVIDER_DEFAULTS[localConfig.provider]?.models.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {PROVIDER_DEFAULTS[localConfig.provider].models.map(model => (
                <button
                  key={model}
                  onClick={() => updateField('model', model)}
                  className={`px-2 py-1 rounded text-xs transition-colors ${
                    localConfig.model === model
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {model}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Connection Test */}
      <div className="bg-gray-900 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-white font-medium">连接测试</h3>
          <button
            onClick={testConnection}
            disabled={testingConnection}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              testingConnection
                ? 'bg-gray-700 text-gray-400 cursor-wait'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {testingConnection ? '测试中...' : '测试连接'}
          </button>
        </div>
        {testResult && (
          <div className={`mt-3 p-3 rounded-lg ${
            testResult.success
              ? 'bg-green-900/30 text-green-300'
              : 'bg-red-900/30 text-red-300'
          }`}>
            <div className="font-medium">
              {testResult.success ? '✓ ' : '✗ '}
              {testResult.message || (testResult.success ? '连接成功' : '连接失败')}
            </div>
            {!testResult.success && testResult.error && (
              <div className="mt-1.5 text-sm opacity-90 break-all">{testResult.error}</div>
            )}
            {testResult.response && (
              <div className="mt-1.5 text-sm opacity-75">响应: {testResult.response}</div>
            )}
          </div>
        )}
      </div>

      {/* Generation Settings */}
      <div className="bg-gray-900 rounded-lg p-4 space-y-4">
        <h3 className="text-white font-medium">生成设置</h3>

        <div>
          <label className="block text-sm text-gray-400 mb-1">
            Temperature: {localConfig.temperature?.toFixed(1) || 0.2}
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={localConfig.temperature || 0.2}
            onChange={(e) => updateField('temperature', parseFloat(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>精确</span>
            <span>创造</span>
          </div>
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">最大 Token 数</label>
          <input
            type="number"
            value={localConfig.maxTokens || 2000}
            onChange={(e) => updateField('maxTokens', parseInt(e.target.value))}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Context Settings */}
      <div className="bg-gray-900 rounded-lg p-4 space-y-4">
        <h3 className="text-white font-medium">上下文设置</h3>

        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-white">包含依赖分析</div>
            <div className="text-xs text-gray-400">分析文件依赖关系以提供更准确的修复</div>
          </div>
          <button
            onClick={() => updateField('includeDependencies', !localConfig.includeDependencies)}
            className={`w-12 h-6 rounded-full transition-colors ${
              localConfig.includeDependencies ? 'bg-blue-600' : 'bg-gray-700'
            }`}
          >
            <div className={`w-5 h-5 bg-white rounded-full transition-transform ${
              localConfig.includeDependencies ? 'translate-x-6' : 'translate-x-0.5'
            }`} />
          </button>
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">上下文行数</label>
          <input
            type="number"
            value={localConfig.maxContextLines || 50}
            onChange={(e) => updateField('maxContextLines', parseInt(e.target.value))}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">依赖深度</label>
          <input
            type="number"
            min="0"
            max="5"
            value={localConfig.maxDependencyDepth || 2}
            onChange={(e) => updateField('maxDependencyDepth', parseInt(e.target.value))}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* UI Settings */}
      <div className="bg-gray-900 rounded-lg p-4 space-y-4">
        <h3 className="text-white font-medium">界面设置</h3>

        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-white">自动应用修复</div>
            <div className="text-xs text-gray-400">自动应用 AI 生成的修复（谨慎使用）</div>
          </div>
          <button
            onClick={() => updateField('autoApply', !localConfig.autoApply)}
            className={`w-12 h-6 rounded-full transition-colors ${
              localConfig.autoApply ? 'bg-blue-600' : 'bg-gray-700'
            }`}
          >
            <div className={`w-5 h-5 bg-white rounded-full transition-transform ${
              localConfig.autoApply ? 'translate-x-6' : 'translate-x-0.5'
            }`} />
          </button>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-white">显示差异对比</div>
            <div className="text-xs text-gray-400">在应用前显示修改差异</div>
          </div>
          <button
            onClick={() => updateField('showDiff', !localConfig.showDiff)}
            className={`w-12 h-6 rounded-full transition-colors ${
              localConfig.showDiff ? 'bg-blue-600' : 'bg-gray-700'
            }`}
          >
            <div className={`w-5 h-5 bg-white rounded-full transition-transform ${
              localConfig.showDiff ? 'translate-x-6' : 'translate-x-0.5'
            }`} />
          </button>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-700">
        <button
          onClick={onReset}
          className="px-4 py-2 text-gray-400 hover:text-white transition-colors text-sm"
        >
          重置为默认
        </button>
        <button
          onClick={onSave}
          disabled={saving}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg transition-colors text-white font-medium"
        >
          {saving ? '保存中...' : '保存配置'}
        </button>
      </div>
    </div>
  );
}

/**
 * Rules Configuration Tab - 卡片式折叠面板
 */
function RulesConfigTab({ rules, onToggle, onDelete, onDeleteCategory, onAddRule, onImport, onExport, onSave, onReset, fileInputRef, onEditRule }) {
  const [filter, setFilter] = useState('all'); // 'all' | 'enabled' | 'disabled'
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedLanguages, setExpandedLanguages] = useState({});
  const [expandedTypes, setExpandedTypes] = useState({});
  const [selectedRule, setSelectedRule] = useState(null); // 用于详情/编辑弹窗
  const [deleteConfirm, setDeleteConfirm] = useState(null); // 删除确认弹窗状态

  // 规则分类配置
  const languageConfig = {
    'JavaScript/TypeScript': {
      icon: '📜',
      key: 'js-ts',
      rulePrefixes: ['JS-', 'TS-'],
      languages: ['javascript', 'typescript', 'jsx', 'tsx'],
      types: {
        'code-style': { name: '代码风格', icon: '🎨', ruleIds: ['JS-001', 'JS-002'] },
        'type-safety': { name: '类型安全', icon: '🔒', ruleIds: ['TS-002'] },
        'error-handling': { name: '错误处理', icon: '⚠️', ruleIds: ['JS-003'] },
        'general': { name: '通用规则', icon: '📦', isGeneral: true },
        'user-imported': { name: '用户导入规则', icon: '📥', isUserImported: true },
      }
    },
    'Dart/Flutter': {
      icon: '📱',
      key: 'dart',
      rulePrefixes: ['DART-', 'DART-NULL-'],
      languages: ['dart'],
      types: {
        'code-style': { name: '代码风格', icon: '🎨', ruleIds: ['DART-004'] },
        'null-safety': { name: '空值安全', icon: '🛡️', ruleIds: ['DART-NULL-001', 'DART-NULL-002', 'DART-NULL-003', 'DART-NULL-004', 'DART-NULL-005', 'DART-NULL-006'] },
        'error-handling': { name: '错误处理', icon: '⚠️', ruleIds: ['DART-002'] },
        'general': { name: '通用规则', icon: '📦', isGeneral: true },
        'user-imported': { name: '用户导入规则', icon: '📥', isUserImported: true },
      }
    },
    'Vue': {
      icon: '💚',
      key: 'vue',
      rulePrefixes: ['VUE-'],
      languages: ['vue'],
      types: {
        'code-style': { name: '代码风格', icon: '🎨', ruleIds: ['VUE-003'] },
        'general': { name: '通用规则', icon: '📦', isGeneral: true },
        'user-imported': { name: '用户导入规则', icon: '📥', isUserImported: true },
      }
    },
    'CSS': {
      icon: '🎨',
      key: 'css',
      rulePrefixes: ['CSS-'],
      languages: ['css'],
      types: {
        'general': { name: '通用规则', icon: '📦', isGeneral: true },
        'user-imported': { name: '用户导入规则', icon: '📥', isUserImported: true },
      }
    },
    '通用': {
      icon: '📦',
      key: 'general',
      rulePrefixes: ['GEN-'],
      languages: ['javascript', 'typescript', 'vue', 'dart', 'jsx', 'tsx'],
      types: {
        'user-imported': { name: '用户导入规则', icon: '📥', isUserImported: true },
      }
    },
    '自定义': {
      icon: '⚡',
      key: 'custom',
      rulePrefixes: [],
      languages: [],
      isCustom: true,
      types: {}
    },
  };

  // 判断规则是否通过 ID 前缀匹配到某个语言分组
  const matchByPrefix = (rule) => {
    for (const c of Object.values(languageConfig)) {
      if (c.isCustom || !c.rulePrefixes) continue;
      if (c.rulePrefixes.some(prefix => rule.id.startsWith(prefix))) {
        return c.key;
      }
    }
    return null;
  };

  // 判断规则通过 languages 字段匹配到哪个语言分组
  const matchByLanguages = (rule) => {
    const ruleLangs = rule.languages || [];
    if (ruleLangs.length === 0) return 'custom';

    // 检查是否匹配通用（包含多种语言或全部语言）
    const generalLangs = ['javascript', 'typescript', 'vue', 'dart', 'jsx', 'tsx'];
    const isGeneral = ruleLangs.length >= 3 || ruleLangs.every(l => generalLangs.includes(l));
    if (isGeneral && ruleLangs.length >= 2) return 'general';

    // 单语言精确匹配
    if (ruleLangs.includes('dart')) return 'dart';
    if (ruleLangs.includes('vue')) return 'vue';
    if (ruleLangs.includes('css')) return 'css';
    if (ruleLangs.some(l => ['javascript', 'typescript', 'jsx', 'tsx'].includes(l))) return 'js-ts';

    return 'custom';
  };

  // 根据配置分组规则
  const getRulesForLanguage = (langKey) => {
    const config = Object.values(languageConfig).find(c => c.key === langKey);
    if (!config) return [];

    return rules.filter(r => {
      // 优先使用 category 字段（用户明确指定）
      if (r.category) return r.category === langKey;
      // 其次 ID 前缀匹配
      const prefixMatch = matchByPrefix(r);
      if (prefixMatch) return prefixMatch === langKey;
      // 再次 languages 字段匹配
      const langMatch = matchByLanguages(r);
      return langMatch === langKey;
    });
  };

  // 根据类型获取规则
  const getRulesForType = (langKey, typeKey) => {
    const langRules = getRulesForLanguage(langKey);
    const config = Object.values(languageConfig).find(c => c.key === langKey);
    const typeConfig = config?.types?.[typeKey];
    if (!typeConfig) return [];

    // 用户导入规则类型
    if (typeConfig.isUserImported) {
      return langRules.filter(r => r.source === 'user-imported');
    }

    // 通用规则类型（未分类到内置类型的非导入规则）
    if (typeConfig.isGeneral) {
      return getUncategorizedRules(langKey);
    }

    // 内置规则类型（有明确 ruleIds）
    if (typeConfig.ruleIds) {
      return langRules.filter(r => typeConfig.ruleIds.includes(r.id));
    }

    return [];
  };

  // 获取语言下未分类的规则（用于 general 类型）
  const getUncategorizedRules = (langKey) => {
    const langRules = getRulesForLanguage(langKey);
    const config = Object.values(languageConfig).find(c => c.key === langKey);
    const typeConfigs = config?.types || {};
    // 收集所有有明确 ruleIds 的类型中的 ID
    const categorizedIds = Object.values(typeConfigs)
      .filter(t => t.ruleIds)
      .flatMap(t => t.ruleIds);
    // 未分类 = 不在内置 ruleIds 中 且 不是 user-imported 来源
    return langRules.filter(r => !categorizedIds.includes(r.id) && r.source !== 'user-imported');
  };

  // 过滤规则
  const filterRule = (rule) => {
    const matchesFilter = filter === 'all' || (filter === 'enabled' && rule.enabled) || (filter === 'disabled' && !rule.enabled);
    const matchesSearch = rule.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         rule.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         rule.message?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  };

  // 展开/折叠语言
  const toggleLanguage = (langKey) => {
    setExpandedLanguages(prev => ({
      ...prev,
      [langKey]: !prev[langKey]
    }));
  };

  // 展开/折叠类型
  const toggleType = (langKey, typeKey) => {
    const key = `${langKey}-${typeKey}`;
    setExpandedTypes(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // 全部展开
  const expandAll = () => {
    const allLangs = {};
    const allTypes = {};
    Object.keys(languageConfig).forEach(langKey => {
      allLangs[langKey] = true;
      Object.keys(languageConfig[langKey].types || {}).forEach(typeKey => {
        allTypes[`${langKey}-${typeKey}`] = true;
      });
    });
    setExpandedLanguages(allLangs);
    setExpandedTypes(allTypes);
  };

  // 全部折叠
  const collapseAll = () => {
    setExpandedLanguages({});
    setExpandedTypes({});
  };

  // 打开规则详情/编辑弹窗
  const openRuleDetail = (rule) => {
    setSelectedRule(rule);
  };

  // 关闭规则详情弹窗
  const closeRuleDetail = () => {
    setSelectedRule(null);
  };

  // 保存规则编辑
  const saveRuleEdit = (updatedRule) => {
    onEditRule(updatedRule);
    closeRuleDetail();
  };

  // 统计启用规则数
  const enabledCount = rules.filter(r => r.enabled).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-400">
          已启用 <span className="text-blue-400 font-medium">{enabledCount}</span> / {rules.length} 条规则
        </div>
        <div className="flex gap-2">
          <button onClick={expandAll} className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs text-gray-300 transition-colors">
            全部展开
          </button>
          <button onClick={collapseAll} className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs text-gray-300 transition-colors">
            全部折叠
          </button>
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1 rounded text-xs transition-colors ${
              filter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'
            }`}
          >
            全部
          </button>
          <button
            onClick={() => setFilter('enabled')}
            className={`px-3 py-1 rounded text-xs transition-colors ${
              filter === 'enabled' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'
            }`}
          >
            已启用
          </button>
          <button
            onClick={() => setFilter('disabled')}
            className={`px-3 py-1 rounded text-xs transition-colors ${
              filter === 'disabled' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'
            }`}
          >
            已禁用
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="🔍 搜索规则..."
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 pl-10 text-white text-sm focus:outline-none focus:border-blue-500"
        />
        <svg className="w-4 h-4 text-gray-400 absolute left-3 top-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={onAddRule}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg transition-colors text-white text-sm font-medium"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          新增规则
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors text-white text-sm font-medium"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          导入规则
        </button>
        <button
          onClick={onExport}
          className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors text-white text-sm font-medium"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          导出规则
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.yaml,.yml"
          onChange={onImport}
          className="hidden"
        />
      </div>

      {/* Language Cards */}
      <div className="space-y-3">
        {Object.entries(languageConfig).map(([langName, langConfig]) => {
          const langRules = getRulesForLanguage(langConfig.key);
          const filteredLangRules = langRules.filter(filterRule);
          const enabledLangCount = langRules.filter(r => r.enabled).length;

          if (filteredLangRules.length === 0 && !searchTerm) return null;

          const isExpanded = expandedLanguages[langConfig.key];

          return (
            <div key={langConfig.key} className="bg-gray-800/50 rounded-lg border border-gray-700">
              {/* Language Header */}
              <div
                className="flex items-center justify-between px-4 py-3 hover:bg-gray-700/30 transition-colors"
              >
                <div
                  onClick={() => toggleLanguage(langConfig.key)}
                  className="flex items-center gap-3 cursor-pointer flex-1"
                >
                  <span className="text-lg">{langConfig.icon}</span>
                  <span className="text-sm font-medium text-white">{langName}</span>
                  <span className="text-xs text-gray-400">
                    {enabledLangCount}/{langRules.length} 条启用
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {/* 删除分类按钮 */}
                  {langRules.length > 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirm({
                          langKey: langConfig.key,
                          langName: langName,
                          rules: langRules,
                          count: langRules.length
                        });
                      }}
                      className="px-2 py-1 bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded text-xs transition-colors flex items-center gap-1"
                      title="删除该分类下所有规则"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      删除全部
                    </button>
                  )}
                  <svg
                    onClick={() => toggleLanguage(langConfig.key)}
                    className={`w-5 h-5 text-gray-400 transition-transform cursor-pointer ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              {/* Language Content */}
              {isExpanded && (
                <div className="border-t border-gray-700 px-4 py-3 space-y-3">
                  {/* Type Categories */}
                  {Object.entries(langConfig.types || {}).map(([typeKey, typeConfig]) => {
                    const typeRules = getRulesForType(langConfig.key, typeKey);
                    const filteredTypeRules = typeRules.filter(filterRule);

                    if (filteredTypeRules.length === 0) return null;

                    const typeExpandedKey = `${langConfig.key}-${typeKey}`;
                    const isTypeExpanded = expandedTypes[typeExpandedKey];

                    return (
                      <div key={typeKey} className="bg-gray-900/50 rounded-lg">
                        {/* Type Header */}
                        <div
                          onClick={() => toggleType(langConfig.key, typeKey)}
                          className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-gray-700/20 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-sm">{typeConfig.icon}</span>
                            <span className="text-sm text-gray-300">{typeConfig.name}</span>
                            <span className="text-xs text-gray-500">{filteredTypeRules.length} 条</span>
                          </div>
                          <svg
                            className={`w-4 h-4 text-gray-500 transition-transform ${isTypeExpanded ? 'rotate-180' : ''}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>

                        {/* Type Rules */}
                        {isTypeExpanded && (
                          <div className="border-t border-gray-700/50 px-3 py-2 space-y-2">
                            {filteredTypeRules.map(rule => (
                              <RuleItem
                                key={rule.id}
                                rule={rule}
                                onToggle={onToggle}
                                onDelete={onDelete}
                                onViewDetail={() => openRuleDetail(rule)}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Uncategorized Rules (仅用于没有 general 类型的语言分组) */}
                  {(() => {
                    const hasGeneralType = Object.keys(langConfig.types || {}).some(tk => langConfig.types[tk].isGeneral);
                    if (hasGeneralType) return null;
                    const uncategorized = getUncategorizedRules(langConfig.key);
                    const filteredUncategorized = uncategorized.filter(filterRule);
                    if (filteredUncategorized.length === 0) return null;

                    const otherExpandedKey = `${langConfig.key}-other`;
                    const isOtherExpanded = expandedTypes[otherExpandedKey];

                    return (
                      <div className="bg-gray-900/50 rounded-lg">
                        {/* Other Header */}
                        <div
                          onClick={() => toggleType(langConfig.key, 'other')}
                          className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-gray-700/20 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-sm">📋</span>
                            <span className="text-sm text-gray-300">其他规则</span>
                            <span className="text-xs text-gray-500">{filteredUncategorized.length} 条</span>
                          </div>
                          <svg
                            className={`w-4 h-4 text-gray-500 transition-transform ${isOtherExpanded ? 'rotate-180' : ''}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>

                        {/* Other Rules Content */}
                        {isOtherExpanded && (
                          <div className="border-t border-gray-700/50 px-3 py-2 space-y-2">
                            {filteredUncategorized.map(rule => (
                              <RuleItem
                                key={rule.id}
                                rule={rule}
                                onToggle={onToggle}
                                onDelete={onDelete}
                                onViewDetail={() => openRuleDetail(rule)}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-700">
        <button
          onClick={onReset}
          className="px-4 py-2 text-gray-400 hover:text-white transition-colors text-sm"
        >
          重置为默认
        </button>
        <button
          onClick={onSave}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors text-white font-medium"
        >
          保存配置
        </button>
      </div>

      {/* Rule Detail/Edit Modal */}
      {selectedRule && (
        <RuleDetailModal
          rule={selectedRule}
          onClose={closeRuleDetail}
          onSave={saveRuleEdit}
          onDelete={() => {
            onDelete(selectedRule.id);
            closeRuleDetail();
          }}
        />
      )}

      {/* 删除确认弹窗 */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4 border border-gray-700">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-600/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">确认删除规则</h3>
                <p className="text-sm text-gray-400">删除后规则将不再可用</p>
              </div>
            </div>

            <div className="bg-gray-900 rounded-lg p-4 mb-4">
              <p className="text-sm text-gray-300">
                即将删除 <span className="text-red-400 font-medium">{deleteConfirm.langName}</span> 分类下的
                <span className="text-red-400 font-medium"> {deleteConfirm.count} </span> 条规则：
              </p>
              <div className="mt-2 text-xs text-gray-400 max-h-32 overflow-y-auto">
                {deleteConfirm.rules.slice(0, 5).map(r => (
                  <div key={r.id} className="py-1">{r.id} - {r.name}</div>
                ))}
                {deleteConfirm.rules.length > 5 && (
                  <div className="py-1 text-gray-500">... 还有 {deleteConfirm.rules.length - 5} 条规则</div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-gray-300 transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => {
                  onDeleteCategory(deleteConfirm.langKey, deleteConfirm.rules);
                  setDeleteConfirm(null);
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-white transition-colors"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Single Rule Item - 可点击查看详情
 */
function RuleItem({ rule, onToggle, onDelete, onViewDetail }) {
  const severityColors = {
    error: 'bg-red-600',
    warning: 'bg-yellow-600',
    info: 'bg-blue-600',
  };

  const severityText = {
    error: 'error',
    warning: 'warning',
    info: 'info',
  };

  return (
    <div
      className={`bg-gray-900 rounded-lg p-3 cursor-pointer hover:bg-gray-800 transition-colors ${rule.enabled ? '' : 'opacity-60'}`}
      onClick={onViewDetail}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 font-mono">{rule.id}</span>
            <span className={`px-1.5 py-0.5 rounded text-xs ${severityColors[rule.severity]} text-white`}>
              {severityText[rule.severity]}
            </span>
          </div>
          <h5 className="text-sm text-white font-medium mt-1 truncate">{rule.name}</h5>
          <p className="text-xs text-gray-400 mt-1 line-clamp-2">{rule.message}</p>
        </div>
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => onDelete(rule.id)}
            className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded transition-colors"
            title="删除规则"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
          <button
            onClick={() => onToggle(rule.id)}
            className={`w-12 h-6 rounded-full transition-colors flex-shrink-0 ${
              rule.enabled ? 'bg-blue-600' : 'bg-gray-700'
            }`}
            title={rule.enabled ? '禁用规则' : '启用规则'}
          >
            <div className={`w-5 h-5 bg-white rounded-full transition-transform ${
              rule.enabled ? 'translate-x-6' : 'translate-x-0.5'
            }`} />
          </button>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
        <span>📝 {rule.languages?.join(', ')}</span>
        {rule.autoFix && <span className="text-green-500">✨ 可自动修复</span>}
      </div>
    </div>
  );
}

/**
 * Rule Detail/Edit Modal
 */
function RuleDetailModal({ rule, onClose, onSave, onDelete }) {
  const [editedRule, setEditedRule] = useState({ ...rule });
  const severityColors = {
    error: 'bg-red-600',
    warning: 'bg-yellow-600',
    info: 'bg-blue-600',
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-800 rounded-lg w-full max-w-lg mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <span className="text-lg">📝</span>
            <h3 className="text-lg font-medium text-white">规则详情 - {rule.id}</h3>
          </div>
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
        <div className="px-6 py-4 space-y-4">
          {/* Rule ID */}
          <div>
            <label className="text-xs text-gray-400 block mb-1">规则 ID</label>
            <input
              type="text"
              value={editedRule.id}
              disabled
              className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-gray-400 text-sm font-mono"
            />
          </div>

          {/* Rule Name */}
          <div>
            <label className="text-xs text-gray-400 block mb-1">规则名称</label>
            <input
              type="text"
              value={editedRule.name}
              onChange={(e) => setEditedRule({ ...editedRule, name: e.target.value })}
              className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Severity */}
          <div>
            <label className="text-xs text-gray-400 block mb-1">严重级别</label>
            <select
              value={editedRule.severity}
              onChange={(e) => setEditedRule({ ...editedRule, severity: e.target.value })}
              className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="error">error - 错误</option>
              <option value="warning">warning - 警告</option>
              <option value="info">info - 信息</option>
            </select>
          </div>

          {/* Languages */}
          <div>
            <label className="text-xs text-gray-400 block mb-1">适用语言</label>
            <input
              type="text"
              value={editedRule.languages?.join(', ')}
              onChange={(e) => setEditedRule({ ...editedRule, languages: e.target.value.split(',').map(s => s.trim()) })}
              className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              placeholder="javascript, typescript, dart"
            />
          </div>

          {/* Pattern */}
          <div>
            <label className="text-xs text-gray-400 block mb-1">正则表达式</label>
            <input
              type="text"
              value={editedRule.pattern || ''}
              onChange={(e) => setEditedRule({ ...editedRule, pattern: e.target.value })}
              className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-blue-500"
              placeholder="console\\.log\\("
            />
          </div>

          {/* Message */}
          <div>
            <label className="text-xs text-gray-400 block mb-1">问题描述</label>
            <textarea
              value={editedRule.message}
              onChange={(e) => setEditedRule({ ...editedRule, message: e.target.value })}
              className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 resize-none h-20"
            />
          </div>

          {/* Suggestion */}
          <div>
            <label className="text-xs text-gray-400 block mb-1">修复建议</label>
            <textarea
              value={editedRule.suggestion || ''}
              onChange={(e) => setEditedRule({ ...editedRule, suggestion: e.target.value })}
              className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 resize-none h-20"
            />
          </div>

          {/* AutoFix */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={editedRule.autoFix || false}
              onChange={(e) => setEditedRule({ ...editedRule, autoFix: e.target.checked })}
              className="w-4 h-4 rounded"
            />
            <label className="text-sm text-gray-300">支持自动修复</label>
          </div>

          {/* Enabled */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={editedRule.enabled}
              onChange={(e) => setEditedRule({ ...editedRule, enabled: e.target.checked })}
              className="w-4 h-4 rounded"
            />
            <label className="text-sm text-gray-300">启用规则</label>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-700">
          <button
            onClick={onDelete}
            className="px-4 py-2 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded transition-colors text-sm"
          >
            删除规则
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded transition-colors text-white text-sm"
            >
              取消
            </button>
            <button
              onClick={() => onSave(editedRule)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded transition-colors text-white text-sm font-medium"
            >
              保存修改
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Get default AI configuration
 */
function getDefaultAIConfig() {
  return {
    provider: 'zhipu',
    apiKey: 'sk-IO4OtE6TEQGPAG9DIrs8ok0kOlZxXsWRiDdMNitCJQCoY7RG',
    apiEndpoint: 'https://newapi.cdskysoft.cn/v1',
    model: 'glm-5.1',
    temperature: 0.2,
    maxTokens: 2000,
    maxContextLines: 50,
    includeDependencies: true,
    maxDependencyDepth: 2,
    autoApply: false,
    showDiff: true,
  };
}

/**
 * Get default rules list (fallback)
 */
function getDefaultRules() {
  // Default rules from rules.yaml
  return [
    // JavaScript/TypeScript
    { id: 'JS-001', name: 'No console.log in production', severity: 'warning', languages: ['javascript', 'typescript'], message: '生产代码中使用了 console.log', suggestion: '移除 console.log 或使用适当的日志库', autoFix: true, enabled: true },
    { id: 'JS-002', name: 'No var declarations', severity: 'error', languages: ['javascript', 'typescript'], message: '使用了 var 声明变量', suggestion: '使用 let 或 const 替代 var', autoFix: true, enabled: true },
    { id: 'TS-002', name: 'Any type usage', severity: 'warning', languages: ['typescript'], message: '使用了 any 类型', suggestion: '使用具体类型替代 any', autoFix: false, enabled: true },
    // Vue
    { id: 'VUE-003', name: 'Console statement in template', severity: 'warning', languages: ['vue'], message: '模板中有 console 语句', suggestion: '从模板中移除 console 语句', autoFix: true, enabled: true },
    // Dart
    { id: 'DART-002', name: 'Empty catch block', severity: 'error', languages: ['dart'], message: '空的 catch 块', suggestion: '在 catch 块中添加错误处理或日志', autoFix: false, enabled: true },
    { id: 'DART-004', name: 'Print statement in production', severity: 'warning', languages: ['dart'], message: '发现 print 语句', suggestion: '移除 print 或使用适当的日志框架', autoFix: true, enabled: true },
    // Dart 空值安全
    { id: 'DART-NULL-001', name: 'Nullable generic list declaration', severity: 'warning', languages: ['dart'], message: '列表元素类型为 nullable，访问时需进行空值检查', suggestion: '使用 ?.firstOrNull 或在访问前检查列表是否为空', autoFix: false, enabled: true },
    { id: 'DART-NULL-002', name: 'Unsafe list first/last access', severity: 'error', languages: ['dart'], message: '.first/.last 在空列表上会抛出异常，且元素可能为 null', suggestion: '使用 firstOrNull/lastOrNull 或先检查 isEmpty/length', autoFix: false, enabled: true },
    { id: 'DART-NULL-003', name: 'RxList empty initialization', severity: 'warning', languages: ['dart'], message: 'RxList.empty() 创建空列表，后续 .first/.last 访问会抛出异常', suggestion: '初始化时添加默认元素或使用 .firstOrNull/.lastOrNull', autoFix: false, enabled: true },
    { id: 'DART-NULL-004', name: 'Force unwrap operator', severity: 'warning', languages: ['dart'], message: '使用 ! 强制解包可能导致运行时空指针异常', suggestion: '使用 ?. 或 ?? 操作符进行安全的空值处理', autoFix: false, enabled: true },
    { id: 'DART-NULL-005', name: 'Unsafe nullable property chain', severity: 'warning', languages: ['dart'], message: '多层属性访问缺少空值保护，中间属性可能为 null', suggestion: '使用可选链 ?. 保护中间属性访问', autoFix: false, enabled: true },
    { id: 'DART-NULL-006', name: 'Late variable potential null access', severity: 'warning', languages: ['dart'], message: 'late 变量在初始化前访问会抛出 LateInitializationError', suggestion: '确保在使用前完成初始化，或考虑使用 nullable 类型', autoFix: false, enabled: true },
  ];
}

/**
 * Add Rule Modal Component
 */
function AddRuleModal({ isOpen, onClose, onAdd, newRule, setNewRule }) {
  if (!isOpen) return null;

  const updateField = (field, value) => {
    setNewRule(prev => ({ ...prev, [field]: value }));
  };

  const toggleLanguage = (lang) => {
    setNewRule(prev => ({
      ...prev,
      languages: prev.languages.includes(lang)
        ? prev.languages.filter(l => l !== lang)
        : [...prev.languages, lang]
    }));
  };

  const availableLanguages = [
    'javascript', 'typescript', 'jsx', 'tsx',
    'vue', 'dart', 'python', 'java', 'go', 'rust'
  ];

  // 分类选项：联动 languages 和 ID 前缀
  const categoryOptions = [
    { value: '', label: '自动选择', languages: null, prefix: '' },
    { value: 'js-ts', label: 'JavaScript/TypeScript', languages: ['javascript', 'typescript', 'jsx', 'tsx'], prefix: 'JS-' },
    { value: 'dart', label: 'Dart/Flutter', languages: ['dart'], prefix: 'DART-' },
    { value: 'vue', label: 'Vue', languages: ['vue'], prefix: 'VUE-' },
    { value: 'css', label: 'CSS', languages: ['css'], prefix: 'CSS-' },
    { value: 'general', label: '通用规则', languages: ['javascript', 'typescript', 'vue', 'dart'], prefix: 'GEN-' },
    { value: 'custom', label: '自定义', languages: [], prefix: '' },
  ];

  const handleCategoryChange = (catValue) => {
    const cat = categoryOptions.find(c => c.value === catValue);
    if (!cat) return;
    const updates = { category: catValue };
    if (cat.languages !== null) {
      updates.languages = [...cat.languages];
    }
    updateField('category', catValue);
    // 同步 languages
    setNewRule(prev => ({ ...prev, ...updates }));
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">新增审查规则</h2>
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
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Rule ID */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">规则 ID *</label>
            <input
              type="text"
              value={newRule.id}
              onChange={(e) => updateField('id', e.target.value.toUpperCase())}
              placeholder="例如: CUSTOM-001"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Rule Name */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">规则名称 *</label>
            <input
              type="text"
              value={newRule.name}
              onChange={(e) => updateField('name', e.target.value)}
              placeholder="例如: No magic numbers"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Severity */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">严重程度</label>
            <div className="flex gap-2">
              {['error', 'warning', 'info'].map(sev => (
                <button
                  key={sev}
                  onClick={() => updateField('severity', sev)}
                  className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                    newRule.severity === sev
                      ? sev === 'error' ? 'bg-red-600 text-white'
                        : sev === 'warning' ? 'bg-yellow-600 text-white'
                        : 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {sev === 'error' ? '❌ 错误' : sev === 'warning' ? '⚠️ 警告' : 'ℹ️ 信息'}
                </button>
              ))}
            </div>
          </div>

          {/* Target Category */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">目标分类</label>
            <div className="flex flex-wrap gap-2">
              {categoryOptions.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => handleCategoryChange(opt.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                    (newRule.category || '') === opt.value
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="mt-1 text-xs text-gray-500">
              {newRule.category ? `将添加到「${categoryOptions.find(c => c.value === newRule.category)?.label}」分类下` : '根据规则 ID 和适用语言自动归类'}
            </div>
          </div>

          {/* Languages */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">适用语言</label>
            <div className="flex flex-wrap gap-2">
              {availableLanguages.map(lang => (
                <button
                  key={lang}
                  onClick={() => toggleLanguage(lang)}
                  className={`px-3 py-1 rounded text-xs transition-colors ${
                    newRule.languages.includes(lang)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {lang}
                </button>
              ))}
            </div>
          </div>

          {/* Pattern */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">匹配模式 (正则表达式)</label>
            <input
              type="text"
              value={newRule.pattern}
              onChange={(e) => updateField('pattern', e.target.value)}
              placeholder="例如: \\bvar\\s+[a-zA-Z]"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Message */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">问题描述 *</label>
            <textarea
              value={newRule.message}
              onChange={(e) => updateField('message', e.target.value)}
              placeholder="例如: 使用了 var 声明变量"
              rows={2}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Suggestion */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">修改建议</label>
            <textarea
              value={newRule.suggestion}
              onChange={(e) => updateField('suggestion', e.target.value)}
              placeholder="例如: 使用 let 或 const 替代 var"
              rows={2}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Auto Fix */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-white">支持自动修复</div>
              <div className="text-xs text-gray-400">该规则是否支持 AI 自动修复</div>
            </div>
            <button
              onClick={() => updateField('autoFix', !newRule.autoFix)}
              className={`w-12 h-6 rounded-full transition-colors ${
                newRule.autoFix ? 'bg-blue-600' : 'bg-gray-700'
              }`}
            >
              <div className={`w-5 h-5 bg-white rounded-full transition-transform ${
                newRule.autoFix ? 'translate-x-6' : 'translate-x-0.5'
              }`} />
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-700 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-400 hover:text-white transition-colors text-sm"
          >
            取消
          </button>
          <button
            onClick={onAdd}
            className="px-6 py-2 bg-green-600 hover:bg-green-700 rounded-lg transition-colors text-white font-medium"
          >
            添加规则
          </button>
        </div>
      </div>
    </div>
  );
}

export default SettingsPanel;
