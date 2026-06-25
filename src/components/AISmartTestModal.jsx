/**
 * AI Smart Test Modal - AI 智能测试
 *
 * 集成三种 AI 测试模式的完整功能：
 * 1. AI 生成测试用例
 * 2. 自动页面操作验证
 * 3. 视觉设计稿对比
 * 4. 实时智能决策
 */

import React, { useState, useEffect, useRef } from 'react';

/**
 * 解析单个 action 描述，生成完整的 action 对象
 * @param {Object} existingAction - 现有的 action 对象
 * @param {number} index - action 索引
 * @returns {Object} 完整的 action 对象
 */
function parseSingleAction(existingAction, index) {
  // 如果已经有完整的 type 和 target，直接返回
  if (existingAction.type && (existingAction.type === 'generic' || existingAction.target)) {
    return existingAction;
  }

  const desc = existingAction.description || existingAction.action || existingAction.text || '';

  // 匹配 "在XXX输入YYY" 格式
  const inputMatch = desc.match(/在(.{1,15}?)输入框?[输入填]*(.+)/);
  if (inputMatch) {
    return {
      type: 'input',
      step: index + 1,
      target: inputMatch[1].trim(),
      description: desc,
      value: inputMatch[2].trim()
    };
  }

  // 匹配 "输入YYY到XXX" 格式
  const inputMatch2 = desc.match(/输入(.{1,50}?)到(.{1,15}?)/);
  if (inputMatch2) {
    return {
      type: 'input',
      step: index + 1,
      target: inputMatch2[2].trim().replace(/输入框$/, ''),
      description: desc,
      value: inputMatch2[1].trim()
    };
  }

  // 匹配 "点击XXX" 格式
  const clickMatch = desc.match(/点击(.+)/);
  if (clickMatch) {
    let target = clickMatch[1].trim();
    // 移除常见的后缀
    target = target.replace(/按钮$/, '').replace(/Icon$/, '').replace(/图标$/, '').replace(/图标$/, '');
    return {
      type: 'click',
      step: index + 1,
      target: target,
      description: desc
    };
  }

  // 如果没有匹配到任何模式，返回 generic action
  return {
    type: 'generic',
    step: index + 1,
    description: desc,
    action: desc
  };
}

/**
 * 解析步骤描述，生成完整的 actions
 * @param {Object} step - 步骤对象
 * @returns {Array} 解析后的 actions 数组
 */
function parseStepActions(step) {
  // 如果没有 actions，尝试从 text 生成
  if (!step.actions || step.actions.length === 0) {
    const actions = [];
    const text = step.text || step.description || step.action || '';

    if (step.type === 'when' && text.trim()) {
      // 解析 when 步骤的描述
      const lines = text.split('\n').filter(line => line.trim());
      lines.forEach((line, index) => {
        const action = parseSingleAction({ description: line }, index);
        actions.push(action);
      });
    }
    return actions;
  }

  // 检查 actions 是否已经完整
  const hasValidActions = step.actions.every(action =>
    action.type && (action.type === 'generic' || action.target)
  );
  if (hasValidActions) {
    return step.actions;
  }

  // 解析每个 action，补全缺失的字段
  return step.actions.map((action, index) => parseSingleAction(action, index));
}

/**
 * 将 when_steps/given_steps/then_steps 转换为 steps 数组
 * @param {Object} scenario - 场景对象
 * @returns {Array} steps 数组
 */
function convertLegacyStepsToStandard(scenario) {
  // 如果已经有 steps 数组且不为空，直接返回
  if (scenario.steps && Array.isArray(scenario.steps) && scenario.steps.length > 0) {
    return scenario.steps;
  }

  const steps = [];

  // 处理 given_steps
  if (scenario.given_steps && Array.isArray(scenario.given_steps)) {
    scenario.given_steps.forEach((step, idx) => {
      const stepText = typeof step === 'string' ? step : (step.description || step.text || step.action || '');
      steps.push({
        type: 'given',
        description: stepText,
        action: stepText,
        text: stepText,
        actions: step.actions || [],
        step: idx + 1
      });
    });
  } else if (scenario.given) {
    steps.push({
      type: 'given',
      description: scenario.given,
      action: scenario.given,
      text: scenario.given,
      actions: []
    });
  }

  // 处理 when_steps
  if (scenario.when_steps && Array.isArray(scenario.when_steps)) {
    scenario.when_steps.forEach((step, idx) => {
      const stepText = typeof step === 'string' ? step : (step.description || step.text || step.action || '');
      const stepObj = {
        type: 'when',
        description: stepText,
        action: stepText,
        text: stepText,
        step: steps.length + 1
      };
      // 保留原始的 actions（如果有）
      if (typeof step === 'object' && step.actions) {
        stepObj.actions = step.actions;
      } else {
        stepObj.actions = [];
      }
      steps.push(stepObj);
    });
  } else if (scenario.when) {
    const whenText = typeof scenario.when === 'string' ? scenario.when : (scenario.when.description || scenario.when.text || '');
    if (scenario.when && typeof scenario.when === 'object' && scenario.when.steps) {
      scenario.when.steps.forEach((stepText, idx) => {
        steps.push({
          type: 'when',
          description: stepText,
          action: stepText,
          text: stepText,
          actions: [],
          step: steps.length + 1
        });
      });
    } else {
      steps.push({
        type: 'when',
        description: whenText,
        action: whenText,
        text: whenText,
        actions: scenario.when?.actions || []
      });
    }
  }

  // 处理 then_steps
  if (scenario.then_steps && Array.isArray(scenario.then_steps)) {
    scenario.then_steps.forEach((step, idx) => {
      const stepText = typeof step === 'string' ? step : (step.description || step.text || step.action || '');
      steps.push({
        type: 'then',
        description: stepText,
        action: stepText,
        text: stepText,
        verifications: step.verifications || [],
        actions: [],
        step: steps.length + 1
      });
    });
  } else if (scenario.then) {
    const thenText = typeof scenario.then === 'string' ? scenario.then : (scenario.then.description || scenario.then.text || '');
    steps.push({
      type: 'then',
      description: thenText,
      action: thenText,
      text: thenText,
      verifications: scenario.then?.verifications || [],
      actions: []
    });
  }

  return steps;
}

/**
 * 补全测试用例的步骤 actions
 * @param {Object} testPlan - 测试计划
 * @returns {Object} 补全后的测试计划
 */
function completeTestPlanActions(testPlan) {
  if (!testPlan || !testPlan.modules) return testPlan;

  return {
    ...testPlan,
    modules: testPlan.modules.map(module => ({
      ...module,
      scenarios: module.scenarios?.map(scenario => {
        // 首先确保有标准的 steps 数组
        const standardSteps = convertLegacyStepsToStandard(scenario);

        // 然后补全每个步骤的 actions
        const stepsWithActions = standardSteps.map(step => {
          const actions = parseStepActions(step);
          return {
            ...step,
            actions: actions.length > 0 ? actions : step.actions || []
          };
        });

        return {
          ...scenario,
          steps: stepsWithActions
        };
      }) || []
    }))
  };
}

/**
 * 将测试用例按页面分组
 * @param {Object} testPlan - 测试计划
 * @returns {Map} pageName -> { scenarios: [], count: number, module: Object }
 */
function groupTestCasesByPage(testPlan) {
  const pageGroups = new Map();

  testPlan?.modules?.forEach(module => {
    module.scenarios?.forEach(scenario => {
      const pageName = scenario.page || module.module || '未分类';

      if (!pageGroups.has(pageName)) {
        pageGroups.set(pageName, {
          scenarios: [],
          count: 0,
          module: module,
          moduleName: module.module
        });
      }

      pageGroups.get(pageName).scenarios.push({
        ...scenario,
        _moduleName: module.module,
        _modulePriority: module.priority
      });
      pageGroups.get(pageName).count++;
    });
  });

  return pageGroups;
}

/**
 * 获取所有页面名称列表
 * @param {Object} testPlan - 测试计划
 * @returns {Array<string>} 页面名称数组
 */
function getPageList(testPlan) {
  const pageSet = new Set();
  testPlan?.modules?.forEach(module => {
    module.scenarios?.forEach(scenario => {
      if (scenario.page) {
        pageSet.add(scenario.page);
      }
    });
  });
  return Array.from(pageSet).sort();
}

/**
 * 将页面分组数据转换回 testPlan 格式（用于保存）
 * @param {Map} pageGroups - 页面分组数据
 * @returns {Object} testPlan
 */
function pageGroupsToTestPlan(pageGroups) {
  const modules = [];

  pageGroups.forEach((pageData, pageName) => {
    modules.push({
      module: pageName,
      priority: pageData.module?.priority || 'High',
      scenarios: pageData.scenarios.map(s => {
      const { _moduleName, _modulePriority, ...cleanScenario } = s;
        return {
          ...cleanScenario,
          page: pageName
        };
      })
    });
  });

  return { modules };
}

/**
 * 页面管理组件 - 提供页面选择和新增功能
 */
function PageManager({ testPlan, selectedPage, onPageSelect, onPageAdd }) {
  const [showNewPageInput, setShowNewPageInput] = React.useState(false);
  const [newPageName, setNewPageName] = React.useState('');

  const pageList = getPageList(testPlan);

  const handleAddPage = () => {
    if (newPageName.trim()) {
      onPageAdd(newPageName.trim());
      setNewPageName('');
      setShowNewPageInput(false);
    }
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm text-gray-300 mb-1">
        所属页面 <span className="text-red-400">*</span>
      </label>
      <div className="flex gap-2">
        <select
          value={selectedPage || ''}
          onChange={(e) => onPageSelect(e.target.value)}
          className="flex-1"
        >
          <option value="">-- 请选择页面 --</option>
          {pageList.map(page => (
            <option key={page} value={page}>{page}</option>
          ))}
        </select>
        <button
          onClick={() => setShowNewPageInput(!showNewPageInput)}
          className="px-3 py-2 bg-green-600 hover:bg-green-500 rounded text-white text-sm"
        >
          + 新增页面
        </button>
      </div>
      {showNewPageInput && (
        <div className="flex gap-2 mt-2">
          <input
            type="text"
            value={newPageName}
            onChange={(e) => setNewPageName(e.target.value)}
            placeholder="输入新页面名称"
            className="flex-1"
            onKeyPress={(e) => e.key === 'Enter' && handleAddPage()}
          />
          <button
            onClick={handleAddPage}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded text-white text-sm"
          >
            确认
          </button>
          <button
            onClick={() => {
              setShowNewPageInput(false);
              setNewPageName('');
            }}
            className="px-3 py-2 bg-gray-600 hover:bg-gray-500 rounded text-white text-sm"
          >
            取消
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * 按页面分组的测试用例列表组件
 */
function PageGroupedTestList({
  testPlan,
  checkedPages,
  setCheckedPages,
  expandedPages,
  setExpandedPages,
  onScenarioEdit,
  onScenarioDelete,
  onPageRun,
  onPageAdd,
  pageLoginConfig,     // 页面登录配置 { pageName: { needLogin: true/false } }
  onPageLoginChange    // 登录状态变更回调 (pageName, needLogin) => void
}) {
  const pageGroups = groupTestCasesByPage(testPlan);

  const togglePage = (pageName) => {
    setExpandedPages(prev => ({ ...prev, [pageName]: !prev[pageName] }));
  };

  const handlePageCheck = (pageName, checked) => {
    const newChecked = new Set(checkedPages);
    if (checked) {
      newChecked.add(pageName);
    } else {
      newChecked.delete(pageName);
    }
    setCheckedPages(newChecked);
  };

  const handlePageDelete = async (pageName) => {
    if (!window.confirm(`确定要删除页面"${pageName}"及其所有测试用例吗？`)) {
      return;
    }
    await onScenarioDelete?.(pageName, null);
  };

  if (pageGroups.size === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-gray-400 mb-2">暂无测试用例</div>
        <button
          onClick={() => onPageAdd?.()}
          className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded text-white text-sm"
        >
          + 创建第一个测试用例
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-96 overflow-y-auto">
      {Array.from(pageGroups.entries()).map(([pageName, pageData]) => {
        const isExpanded = expandedPages[pageName];
        const isChecked = checkedPages.has(pageName);

        return (
          <div key={pageName} className={`border rounded-lg overflow-hidden transition-all ${
            isChecked ? 'border-green-600 bg-green-900/10' : 'border-gray-700'
          }`}>
            {/* 页面行 */}
            <div className="p-3 bg-gray-800 flex items-center gap-3">
              <input
                type="checkbox"
                checked={isChecked}
                onChange={(e) => handlePageCheck(pageName, e.target.checked)}
                className="w-4 h-4 accent-green-500 cursor-pointer"
              />
              <span
                className="text-gray-400 cursor-pointer hover:text-white"
                onClick={() => togglePage(pageName)}
              >
                {isExpanded ? '▼' : '▶'}
              </span>
              <span
                className="flex-1 font-medium text-white cursor-pointer hover:text-blue-300"
                onClick={() => togglePage(pageName)}
              >
                {pageName}
              </span>
              <span className="text-xs text-gray-400 bg-gray-700 px-2 py-1 rounded">
                {pageData.count} 条
              </span>

              {/* 登录开关 */}
              {onPageLoginChange && (
                <button
                  onClick={() => onPageLoginChange(pageName, !pageLoginConfig?.[pageName]?.needLogin)}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    pageLoginConfig?.[pageName]?.needLogin
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                  }`}
                  title={pageLoginConfig?.[pageName]?.needLogin ? '需要登录' : '不需要登录'}
                >
                  🔐
                </button>
              )}

              <div className="flex items-center gap-1">
                <button
                  onClick={() => onScenarioEdit?.(pageName, { action: 'edit-page' })}
                  className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-500 rounded text-white"
                  title="编辑此页面的用例"
                >
                  编辑
                </button>
                <button
                  onClick={() => handlePageDelete(pageName)}
                  className="px-2 py-1 text-xs bg-red-600 hover:bg-red-500 rounded text-white"
                  title="删除此页面及所有用例"
                >
                  删除
                </button>
                <button
                  onClick={() => onPageRun?.(pageName)}
                  className="px-2 py-1 text-xs bg-green-600 hover:bg-green-500 rounded text-white flex items-center gap-1"
                  title="运行此页面测试"
                >
                  <span className="text-white">▶</span>
                </button>
              </div>
            </div>

            {/* 用例列表 */}
            {isExpanded && (
              <div className="p-2 bg-gray-900/50 space-y-1">
                {pageData.scenarios.map((scenario) => (
                  <div
                    key={scenario.id}
                    className="p-2 bg-gray-800/50 rounded hover:bg-gray-700/50 cursor-pointer text-sm"
                    onClick={() => onScenarioEdit?.(pageName, scenario)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-yellow-400">{scenario.id}</span>
                      <span className="text-gray-300">{scenario.name}</span>
                      {scenario.priority && (
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          scenario.priority === 'High' ? 'bg-red-900/50 text-red-300' :
                          scenario.priority === 'Low' ? 'bg-gray-700 text-gray-300' :
                          'bg-yellow-900/50 text-yellow-300'
                        }`}>
                          {scenario.priority === 'High' ? '高' : scenario.priority === 'Low' ? '低' : '中'}
                        </span>
                      )}
                    </div>
                    {scenario.description && (
                      <div className="text-xs text-gray-500 mt-1 ml-6 truncate">
                        {scenario.description}
                      </div>
                    )}
                  </div>
                ))}
                {/* 快速添加用例按钮 */}
                <button
                  onClick={() => onScenarioEdit?.(pageName, null)}
                  className="w-full p-2 text-xs text-green-400 hover:text-green-300 border border-dashed border-gray-600 hover:border-green-500 rounded"
                >
                  + 添加用例
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * 嵌套测试用例列表组件
 * 显示 项目 → 模块 → 测试用例 的三层折叠结构
 */
function NestedTestCasesList({
  testCases,
  expandedProjects,
  setExpandedProjects,
  expandedModules,
  setExpandedModules,
  selectedScenario,
  onScenarioSelect,
  onScenarioEdit,
  onScenarioDelete
}) {
  // 切换项目展开状态
  const toggleProject = (projectPath) => {
    setExpandedProjects(prev => ({ ...prev, [projectPath]: !prev[projectPath] }));
  };

  // 切换模块展开状态
  const toggleModule = (projectPath, moduleName) => {
    const key = `${projectPath}-${moduleName}`;
    setExpandedModules(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // 选择测试用例
  const handleScenarioClick = async (projectPath, moduleName, scenario) => {
    if (onScenarioSelect) {
      onScenarioSelect(projectPath, moduleName, scenario);
    }
  };

  if (!testCases || testCases.length === 0) {
    return <div className="text-sm text-gray-400 text-center py-4">暂无保存的测试用例</div>;
  }

  return (
    <div className="space-y-2">
      {testCases.map((testCase) => {
        const isProjectExpanded = expandedProjects[testCase.projectPath];
        const isSelectedProject = selectedScenario?.projectPath === testCase.projectPath;

        return (
          <div key={testCase.projectPath} className="border border-gray-700 rounded-lg overflow-hidden">
            {/* 项目层 */}
            <div
              className={`p-3 cursor-pointer flex items-center justify-between ${
                isSelectedProject ? 'bg-green-900/30' : 'bg-gray-800 hover:bg-gray-750'
              }`}
              onClick={() => toggleProject(testCase.projectPath)}
            >
              <div className="flex items-center gap-2">
                <span className="text-gray-400">{isProjectExpanded ? '▼' : '▶'}</span>
                <span className="font-medium text-white">{testCase.projectName}</span>
                <span className="text-xs text-gray-400">
                  ({testCase.testPlan?.modules?.length || 0} 个模块)
                </span>
              </div>
              <div className="text-xs text-gray-500">
                {new Date(testCase.savedAt).toLocaleDateString('zh-CN')}
              </div>
            </div>

            {/* 模块层 */}
            {isProjectExpanded && testCase.testPlan?.modules && (
              <div className="bg-gray-900/30">
                {testCase.testPlan.modules.map((module) => {
                  const moduleKey = `${testCase.projectPath}-${module.module}`;
                  const isModuleExpanded = expandedModules[moduleKey];
                  const isSelectedModule = selectedScenario?.projectPath === testCase.projectPath &&
                                            selectedScenario?.moduleName === module.module;

                  return (
                    <div key={module.module} className="border-t border-gray-700/50">
                      {/* 模块头 */}
                      <div
                        className={`p-2 pl-6 cursor-pointer flex items-center justify-between ${
                          isSelectedModule ? 'bg-blue-900/20' : 'hover:bg-gray-800/50'
                        }`}
                        onClick={() => toggleModule(testCase.projectPath, module.module)}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-gray-400 text-xs">{isModuleExpanded ? '▼' : '▶'}</span>
                          <span className="text-sm text-gray-200">{module.module}</span>
                          <span className="text-xs text-gray-500">
                            ({module.scenarios?.length || 0} 条用例)
                          </span>
                          {module.priority && (
                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                              module.priority === 'High' ? 'bg-red-900/30 text-red-300' :
                              module.priority === 'Low' ? 'bg-gray-700 text-gray-300' :
                              'bg-yellow-900/30 text-yellow-300'
                            }`}>
                              {module.priority === 'High' ? '高' : module.priority === 'Low' ? '低' : '中'}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 测试用例层 */}
                      {isModuleExpanded && module.scenarios && (
                        <div className="bg-gray-900/50">
                          {module.scenarios.map((scenario, scenarioIndex) => {
                            const isScenarioSelected = selectedScenario?.projectPath === testCase.projectPath &&
                                                      selectedScenario?.moduleName === module.module &&
                                                      selectedScenario?.scenarioId === scenario.id;

                            return (
                              <div
                                key={scenario.id}
                                className={`p-2 pl-10 border-t border-gray-700/30 cursor-pointer ${
                                  isScenarioSelected ? 'bg-green-800/40' : 'hover:bg-gray-800/30'
                                }`}
                                onClick={() => handleScenarioClick(testCase.projectPath, module.module, scenario)}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2 flex-1 min-w-0">
                                    <span className="text-xs text-yellow-400 shrink-0">{scenario.id}</span>
                                    <span className="text-sm text-gray-300 truncate">{scenario.name}</span>
                                    {scenario.priority && (
                                      <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${
                                        scenario.priority === 'High' ? 'bg-red-900/30 text-red-300' :
                                        scenario.priority === 'Low' ? 'bg-gray-700 text-gray-300' :
                                        'bg-yellow-900/30 text-yellow-300'
                                      }`}>
                                        {scenario.priority === 'High' ? '高' : scenario.priority === 'Low' ? '低' : '中'}
                                      </span>
                                    )}
                                    {scenario.status && (
                                      <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${
                                          scenario.status === 'Approved' ? 'bg-green-900/30 text-green-300 border border-green-800' : 'bg-gray-800 text-gray-500 border border-gray-700'
                                      }`}>
                                        {scenario.status === 'Approved' ? '已批准' : '草稿'}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                                    {/* 编辑按钮 */}
                                    {onScenarioEdit && (
                                      <button
                                        onClick={() => onScenarioEdit(testCase, module, scenario)}
                                        className="p-1 text-gray-400 hover:text-blue-400 text-xs"
                                        title="编辑"
                                      >
                                        ✏️
                                      </button>
                                    )}
                                    {/* 删除按钮 */}
                                    {onScenarioDelete && (
                                      <button
                                        onClick={() => onScenarioDelete(testCase, module, scenario)}
                                        className="p-1 text-gray-400 hover:text-red-400 text-xs"
                                        title="删除"
                                      >
                                        🗑️
                                      </button>
                                    )}
                                  </div>
                                </div>
                                {scenario.description && (
                                  <div className="text-xs text-gray-500 mt-1 pl-12 truncate">
                                    {scenario.description}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * 测试用例编辑器组件
 * 用于编辑、删除、新增和排序测试用例
 */
function TestCaseEditor({ testPlan, onTestPlanChange, electronAPI, projectPath }) {
  const [expandedModules, setExpandedModules] = useState({});
  const [expandedScenarios, setExpandedScenarios] = useState({});
  const [editingScenario, setEditingScenario] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newScenario, setNewScenario] = useState({
    id: '',
    name: '',
    description: '',
    page: '',
    priority: 'Medium',
    steps: []
  });

  // 初始化展开第一个模块
  useEffect(() => {
    if (testPlan?.modules?.length > 0) {
      setExpandedModules({ [testPlan.modules[0].module]: true });
    }
  }, [testPlan]);

  // 切换模块展开状态
  const toggleModule = (moduleName) => {
    setExpandedModules(prev => ({ ...prev, [moduleName]: !prev[moduleName] }));
  };

  // 切换测试用例展开状态
  const toggleScenario = (moduleName, scenarioId) => {
    const key = `${moduleName}-${scenarioId}`;
    setExpandedScenarios(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // 删除测试用例
  const deleteScenario = (moduleName, scenarioId) => {
    if (!window.confirm('确定要删除这条测试用例吗？')) return;

    const updatedPlan = {
      ...testPlan,
      modules: testPlan.modules.map(module => {
        if (module.module === moduleName) {
          return {
            ...module,
            scenarios: module.scenarios.filter(s => s.id !== scenarioId)
          };
        }
        return module;
      })
    };
    onTestPlanChange(updatedPlan);
  };

  // 上移测试用例
  const moveScenarioUp = (moduleName, scenarioIndex) => {
    if (scenarioIndex === 0) return;

    const updatedPlan = {
      ...testPlan,
      modules: testPlan.modules.map(module => {
        if (module.module === moduleName) {
          const newScenarios = [...module.scenarios];
          [newScenarios[scenarioIndex - 1], newScenarios[scenarioIndex]] =
            [newScenarios[scenarioIndex], newScenarios[scenarioIndex - 1]];
          return { ...module, scenarios: newScenarios };
        }
        return module;
      })
    };
    onTestPlanChange(updatedPlan);
  };

  // 下移测试用例
  const moveScenarioDown = (moduleName, scenarioIndex) => {
    const module = testPlan.modules.find(m => m.module === moduleName);
    if (!module || scenarioIndex >= module.scenarios.length - 1) return;

    const updatedPlan = {
      ...testPlan,
      modules: testPlan.modules.map(module => {
        if (module.module === moduleName) {
          const newScenarios = [...module.scenarios];
          [newScenarios[scenarioIndex], newScenarios[scenarioIndex + 1]] =
            [newScenarios[scenarioIndex + 1], newScenarios[scenarioIndex]];
          return { ...module, scenarios: newScenarios };
        }
        return module;
      })
    };
    onTestPlanChange(updatedPlan);
  };

  // 编辑测试用例
  const startEditScenario = (moduleName, scenario) => {
    setEditingScenario({ ...scenario, moduleName });
  };

  // 保存编辑的测试用例
  const saveEditScenario = () => {
    // 深拷贝 editingScenario，确保所有嵌套数据都被保存
    const savedScenario = JSON.parse(JSON.stringify(editingScenario));
    const updatedPlan = {
      ...testPlan,
      modules: testPlan.modules.map(module => {
        if (module.module === editingScenario.moduleName) {
          return {
            ...module,
            scenarios: module.scenarios.map(s =>
              s.id === editingScenario.id ? savedScenario : s
            )
          };
        }
        return module;
      })
    };
    console.log('[TestCaseEditor] 保存编辑的测试用例:', {
      scenarioId: savedScenario.id,
      steps: savedScenario.steps?.map(s => ({ type: s.type, description: s.description }))
    });
    onTestPlanChange(updatedPlan);
    setEditingScenario(null);
  };

  // 新增测试用例
  const addNewScenario = () => {
    const moduleId = `TC${Date.now()}`;
    const newScenarioData = {
      ...newScenario,
      id: moduleId,
      estimatedTime: 2,
      steps: [
        {
          type: 'given',
          description: '前置条件',
          action: '前置条件',
          actions: [],
          text: '前置条件'
        },
        {
          type: 'when',
          description: '执行操作',
          action: '执行操作',
          actions: [],
          text: '执行操作'
        },
        {
          type: 'then',
          description: '验证结果',
          action: '验证结果',
          actions: [],
          text: '验证结果',
          verifications: []
        }
      ]
    };

    // 按页面组织：找到对应页面的模块，或创建新模块
    const targetPage = newScenario.page || '默认页面';
    let targetModule = testPlan.modules?.find(m => m.module === targetPage);

    if (!targetModule) {
      // 创建新的页面模块
      targetModule = {
        module: targetPage,
        priority: newScenario.priority || 'High',
        scenarios: []
      };
    }

    // 更新测试计划
    const updatedPlan = {
      ...testPlan,
      modules: [
        // 保留其他模块
        ...(testPlan.modules || []).filter(m => m.module !== targetPage),
        // 更新目标模块
        {
          ...targetModule,
          scenarios: [...(targetModule.scenarios || []), newScenarioData]
        }
      ]
    };

    onTestPlanChange(updatedPlan);
    setShowAddModal(false);
    setNewScenario({
      id: '',
      name: '',
      description: '',
      page: '',
      priority: 'Medium',
      steps: []
    });

    // 展开新添加的页面
    setExpandedModules({ [targetPage]: true });
  };

  // 渲染编辑表单
  const renderEditForm = () => {
    if (!editingScenario) return null;

    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
        <div className="bg-gray-800 rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          <h3 className="text-xl font-bold text-white mb-4">编辑测试用例</h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-300 mb-1">用例名称</label>
              <input
                type="text"
                value={editingScenario.name}
                onChange={(e) => setEditingScenario({ ...editingScenario, name: e.target.value })}
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-300 mb-1">描述</label>
              <textarea
                value={editingScenario.description}
                onChange={(e) => setEditingScenario({ ...editingScenario, description: e.target.value })}
                className="w-full"
                rows={3}
              />
            </div>

            <div>
              <label className="block text-sm text-gray-300 mb-1">页面</label>
              <input
                type="text"
                value={editingScenario.page || ''}
                onChange={(e) => setEditingScenario({ ...editingScenario, page: e.target.value })}
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-300 mb-1">优先级</label>
              <select
                value={editingScenario.priority || 'Medium'}
                onChange={(e) => setEditingScenario({ ...editingScenario, priority: e.target.value })}
                className="w-full"
              >
                <option value="High">高</option>
                <option value="Medium">中</option>
                <option value="Low">低</option>
              </select>
            </div>

            <div>
              <label className="block text-sm text-gray-300 mb-1">状态</label>
              <select
                value={editingScenario.status || 'Draft'}
                onChange={(e) => setEditingScenario({ ...editingScenario, status: e.target.value })}
                className="w-full"
              >
                <option value="Draft">草稿 (Draft)</option>
                <option value="Approved">已批准 (Approved)</option>
              </select>
            </div>

            {/* 步骤编辑 - 支持编辑步骤描述 */}
            <div>
              <label className="block text-sm text-gray-300 mb-2">测试步骤</label>
              <div className="space-y-2">
                {editingScenario.steps?.map((step, stepIndex) => (
                  <div key={stepIndex} className="p-3 bg-gray-700/50 rounded border border-gray-600">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-blue-300">
                        {String(step.type || 'step').toUpperCase()}
                      </span>
                    </div>
                    {/* 步骤描述编辑 */}
                    <div className="mb-2">
                      <label className="block text-xs text-gray-400 mb-1">描述</label>
                      <textarea
                        value={step.description || step.text || step.desc || ''}
                        onChange={(e) => {
                          const updatedSteps = [...editingScenario.steps];
                          updatedSteps[stepIndex] = {
                            ...updatedSteps[stepIndex],
                            description: e.target.value,
                            text: e.target.value,
                            desc: e.target.value
                          };
                          setEditingScenario({ ...editingScenario, steps: updatedSteps });
                        }}
                        className="w-full px-2 py-1 bg-gray-600 border border-gray-500 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
                        rows={2}
                        placeholder="输入步骤描述，例如：显示「ID不能为空」错误提示"
                      />
                    </div>
                    {/* 验证信息编辑（仅 then 步骤） */}
                    {step.type === 'then' && (
                      <div className="mb-2">
                        <label className="block text-xs text-gray-400 mb-1">验证列表</label>
                        <div className="space-y-1">
                          {(step.verifications || []).map((v, vIdx) => (
                            <div key={vIdx} className="flex items-center gap-2">
                              <input
                                type="text"
                                value={v.description || v.text || ''}
                                onChange={(e) => {
                                  const updatedSteps = [...editingScenario.steps];
                                  updatedSteps[stepIndex] = {
                                    ...updatedSteps[stepIndex],
                                    verifications: updatedSteps[stepIndex].verifications.map((ver, idx) =>
                                      idx === vIdx ? { ...ver, description: e.target.value, text: e.target.value } : ver
                                    )
                                  };
                                  setEditingScenario({ ...editingScenario, steps: updatedSteps });
                                }}
                                className="flex-1 text-xs"
                                placeholder="验证描述"
                              />
                            </div>
                          ))}
                          {(step.verifications || []).length === 0 && (
                            <div className="text-xs text-gray-500">暂无验证信息</div>
                          )}
                        </div>
                      </div>
                    )}
                    {step.actions && Array.isArray(step.actions) && step.actions.length > 0 && (
                      <div className="text-xs text-gray-400">
                        操作: {step.actions.map(a => `${String(a.type)} ${String(a.target || '')}`).join(', ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <button
              onClick={() => setEditingScenario(null)}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded text-white"
            >
              取消
            </button>
            <button
              onClick={saveEditScenario}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-white"
            >
              保存
            </button>
          </div>
        </div>
      </div>
    );
  };

  // 渲染新增弹窗
  const renderAddModal = () => {
    if (!showAddModal) return null;

    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
        <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full">
          <h3 className="text-xl font-bold text-white mb-4">新增测试用例</h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-300 mb-1">用例名称 *</label>
              <input
                type="text"
                value={newScenario.name}
                onChange={(e) => setNewScenario({ ...newScenario, name: e.target.value })}
                className="w-full"
                placeholder="例如: 用户登录功能测试"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-300 mb-1">描述</label>
              <textarea
                value={newScenario.description}
                onChange={(e) => setNewScenario({ ...newScenario, description: e.target.value })}
                className="w-full"
                rows={3}
                placeholder="描述测试用例的目的..."
              />
            </div>

            {/* 页面选择 - 使用 PageManager 组件 */}
            <PageManager
              testPlan={testPlan}
              selectedPage={newScenario.page}
              onPageSelect={(page) => setNewScenario({ ...newScenario, page })}
              onPageAdd={(page) => setNewScenario({ ...newScenario, page })}
            />

            <div>
              <label className="block text-sm text-gray-300 mb-1">优先级</label>
              <select
                value={newScenario.priority}
                onChange={(e) => setNewScenario({ ...newScenario, priority: e.target.value })}
                className="w-full"
              >
                <option value="High">高</option>
                <option value="Medium">中</option>
                <option value="Low">低</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm text-gray-300 mb-1">状态</label>
              <select
                value={newScenario.status || 'Draft'}
                onChange={(e) => setNewScenario({ ...newScenario, status: e.target.value })}
                className="w-full"
              >
                <option value="Draft">草稿 (Draft)</option>
                <option value="Approved">已批准 (Approved)</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <button
              onClick={() => {
                setShowAddModal(false);
                setNewScenario({
                  id: '',
                  name: '',
                  description: '',
                  page: '',
                  priority: 'Medium',
                  steps: []
                });
              }}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded text-white"
            >
              取消
            </button>
            <button
              onClick={() => {
                if (!newScenario.name.trim()) {
                  window.alert('请输入用例名称');
                  return;
                }
                if (!newScenario.page?.trim()) {
                  window.alert('请选择所属页面');
                  return;
                }
                addNewScenario();
              }}
              className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded text-white"
            >
              添加
            </button>
          </div>
        </div>
      </div>
    );
  };

  // 统计总用例数
  const totalScenarios = testPlan?.modules?.reduce((sum, m) => sum + (m.scenarios?.length || 0), 0) || 0;

  return (
    <div className="mt-4 flex flex-col max-h-[60vh]">
      {renderEditForm()}
      {renderAddModal()}

      {/* 工具栏 */}
      <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg border border-gray-700 shrink-0">
        <div className="text-sm text-gray-300">
          共 <span className="font-bold text-white">{testPlan?.modules?.length || 0}</span> 个模块，
          <span className="font-bold text-white">{totalScenarios}</span> 条用例 
          <span className="text-xs text-gray-500 ml-2">
            ({testPlan?.modules?.reduce((sum, m) => sum + (m.scenarios?.filter(s => s.status === 'Approved').length || 0), 0) || 0} 已批准)
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              if (!window.confirm('确定要将所有用例标记为已批准吗？')) return;
              const updatedPlan = {
                ...testPlan,
                modules: testPlan.modules.map(m => ({
                  ...m,
                  scenarios: m.scenarios.map(s => ({ ...s, status: 'Approved' }))
                }))
              };
              onTestPlanChange(updatedPlan);
            }}
            className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 rounded text-white flex items-center gap-1 shrink-0"
          >
            ✓ 全部批准
          </button>
          <button
            onClick={(() => setShowAddModal(true))}
            className="px-3 py-1.5 text-sm bg-green-600 hover:bg-green-500 rounded text-white flex items-center gap-1 shrink-0"
          >
            ➕ 新增用例
          </button>
        </div>
      </div>

      {/* 模块和用例列表 - 使用 flex-1 让它占据剩余空间 */}
      <div className="flex-1 overflow-y-auto space-y-2 min-h-0 pr-1">
        {testPlan?.modules?.map((module, moduleIndex) => (
          <div key={module.module} className="border border-gray-700 rounded-lg overflow-hidden">
            {/* 模块头 */}
            <div
              className="p-3 bg-gray-800 cursor-pointer hover:bg-gray-750 flex items-center justify-between shrink-0"
              onClick={() => toggleModule(module.module)}
            >
              <div className="flex items-center gap-2">
                <span className="text-gray-400">
                  {expandedModules[module.module] ? '▼' : '▶'}
                </span>
                <span className="font-medium text-white">{module.module}</span>
                <span className="text-xs text-gray-400">({module.scenarios?.length || 0} 条用例)</span>
              </div>
            </div>

            {/* 用例列表 */}
            {expandedModules[module.module] && (
              <div className="p-2 bg-gray-900/50 space-y-1">
                {module.scenarios?.map((scenario, scenarioIndex) => {
                  const isExpanded = expandedScenarios[`${module.module}-${scenario.id}`];
                  return (
                    <div key={scenario.id} className="border border-gray-700 rounded overflow-hidden">
                      {/* 用例头 */}
                      <div
                        className="p-2 bg-gray-800 cursor-pointer hover:bg-gray-750 flex items-center justify-between flex-wrap gap-2"
                        onClick={() => toggleScenario(module.module, scenario.id)}
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="text-gray-400 text-xs shrink-0">{isExpanded ? '▼' : '▶'}</span>
                          <span className="text-sm font-medium text-yellow-300 shrink-0">{scenario.id}</span>
                          <span className="text-sm text-white truncate">{scenario.name}</span>
                          {scenario.priority && (
                            <span className={`text-xs px-2 py-0.5 rounded shrink-0 ${
                              scenario.priority === 'High' ? 'bg-red-900/50 text-red-300' :
                              scenario.priority === 'Low' ? 'bg-gray-700 text-gray-300' :
                              'bg-yellow-900/50 text-yellow-300'
                            }`}>
                              {scenario.priority === 'High' ? '高' : scenario.priority === 'Low' ? '低' : '中'}
                            </span>
                          )}
                          <span className={`text-xs px-2 py-0.5 rounded shrink-0 cursor-pointer ${
                              scenario.status === 'Approved' ? 'bg-green-900/50 text-green-300 border border-green-700' : 'bg-gray-700 text-gray-400 border border-gray-600'
                            }`}
                            onClick={(e) => {
                                e.stopPropagation();
                                const updatedPlan = {
                                  ...testPlan,
                                  modules: testPlan.modules.map(m => {
                                    if (m.module === module.module) {
                                      return {
                                        ...m,
                                        scenarios: m.scenarios.map(s => 
                                           s.id === scenario.id ? { ...s, status: s.status === 'Approved' ? 'Draft' : 'Approved' } : s
                                        )
                                      };
                                    }
                                    return m;
                                  })
                                };
                                onTestPlanChange(updatedPlan);
                            }}
                            title="点击切换状态"
                          >
                            {scenario.status === 'Approved' ? '✓ 已批准' : '📝 草稿'}
                          </span>
                        </div>

                        {/* 操作按钮 */}
                        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => moveScenarioUp(module.module, scenarioIndex)}
                            disabled={scenarioIndex === 0}
                            className="p-1 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                            title="上移"
                          >
                            ↑
                          </button>
                          <button
                            onClick={() => moveScenarioDown(module.module, scenarioIndex)}
                            disabled={scenarioIndex >= module.scenarios.length - 1}
                            className="p-1 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                            title="下移"
                          >
                            ↓
                          </button>
                          <button
                            onClick={() => startEditScenario(module.module, scenario)}
                            className="p-1 text-blue-400 hover:text-blue-300"
                            title="编辑"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => deleteScenario(module.module, scenario.id)}
                            className="p-1 text-red-400 hover:text-red-300"
                            title="删除"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>

                      {/* 用例详情 */}
                      {isExpanded && (
                        <div className="p-3 bg-gray-900/80 text-sm">
                          <div className="text-gray-400 mb-2">{String(scenario.description || scenario.name || '')}</div>
                          {scenario.page && (
                            <div className="text-xs text-gray-500 mb-2">页面: {scenario.page}</div>
                          )}

                          {/* 步骤列表 */}
                          {scenario.steps?.length > 0 && (
                            <div className="space-y-1">
                              <div className="text-xs text-gray-500 font-medium">测试步骤:</div>
                              {scenario.steps.map((step, stepIndex) => (
                                <div key={stepIndex} className="p-2 bg-gray-800/50 rounded">
                                  <div className="flex items-center gap-2">
                                    <span className={`text-xs px-2 py-0.5 rounded ${
                                      step.type === 'given' ? 'bg-blue-900/50 text-blue-300' :
                                      step.type === 'when' ? 'bg-yellow-900/50 text-yellow-300' :
                                      'bg-green-900/50 text-green-300'
                                    }`}>
                                      {String(step.type || 'step').toUpperCase()}
                                    </span>
                                    <span className="text-white">{String(step.description || step.desc || step.text || '步骤')}</span>
                                  </div>
                                  {step.actions && Array.isArray(step.actions) && step.actions.length > 0 && (
                                    <div className="mt-1 text-xs text-gray-400 pl-2">
                                      操作: {step.actions.map(a => `${String(a.type)} ${String(a.target || a.value || '')}`).join('; ')}
                                    </div>
                                  )}
                                  {step.verifications && Array.isArray(step.verifications) && step.verifications.length > 0 && (
                                    <div className="mt-1 text-xs text-gray-400 pl-2">
                                      验证: {step.verifications.map(v => String(v.type || 'v')).join('; ')}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          <div className="text-xs text-gray-500 mt-2">
                            预计耗时: {scenario.estimatedTime || 2} 秒
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function AISmartTestModal({ isOpen, onClose, electronAPI, projectUrl, projectPath, preselectedTestCase, hideSavedCasesOption }) {
  const [activeStep, setActiveStep] = useState('input'); // input, analyzing, reviewing, testing, results
  const [isLoading, setIsLoading] = useState(false);

  // 输入资源
  const [testPage, setTestPage] = useState(''); // 测试页面（必填）
  const [requirements, setRequirements] = useState('');
  const [figmaUrl, setFigmaUrl] = useState('');
  const [uiScreenshots, setUiScreenshots] = useState([]);
  const [designFiles, setDesignFiles] = useState([]);
  const [codeFiles, setCodeFiles] = useState([]);

  // 输入模式：AI生成 或 BDD导入
  const [inputMode, setInputMode] = useState('ai'); // 'ai' 或 'bdd'
  const [selectedBDDFile, setSelectedBDDFile] = useState(null); // BDD Excel文件路径
  const [bddTestPlan, setBddTestPlan] = useState(null); // 从BDD导入的测试计划

  // 已保存的测试用例 - 改为列表支持分页
  const [allSavedTestCases, setAllSavedTestCases] = useState([]);
  const [selectedSavedTestCase, setSelectedSavedTestCase] = useState(null);
  const [useSavedTestCases, setUseSavedTestCases] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5; // 每页显示5个

  // 嵌套展开状态 - 用于项目-模块-用例三层结构
  const [expandedProjects, setExpandedProjects] = useState({});
  const [expandedModulesInList, setExpandedModulesInList] = useState({});
  const [selectedScenario, setSelectedScenario] = useState(null); // 当前选中的具体测试用例

  // 页面分组相关状态
  const [checkedPages, setCheckedPages] = useState(new Set()); // 选中的页面集合
  const [expandedPages, setExpandedPages] = useState({}); // 页面展开状态
  const [editingPage, setEditingPage] = useState(null); // 当前编辑的页面
  const [pageLoginConfig, setPageLoginConfig] = useState({}); // 页面登录配置 { pageName: { needLogin: true/false } }

  // 测试配置
  const [testConfig, setTestConfig] = useState({
    headless: false,
    slowMo: 100,
    includeFunctional: true,
    includeUI: true,
    includeVisual: true,
    includeBoundary: true,
    includeException: true,
  });

  // 登录配置（简化版）
  const [loginConfig, setLoginConfig] = useState({
    enabled: false,      // 是否启用登录
    mode: 'standard',    // 登录模式: 'standard' (标准登录) | 'step' (分步登录)
    username: '',        // 账号/ID
    password: '',        // 密码
  });

  // 测试用例语言选择
  const [testCaseLanguage, setTestCaseLanguage] = useState('traditional-chinese'); // 默认繁体中文

  // 测试结果
  const [analysisResult, setAnalysisResult] = useState(null);
  const [testPlan, setTestPlan] = useState(null); // 添加测试计划状态
  const [testResults, setTestResults] = useState(null);
  const [visualResults, setVisualResults] = useState(null);
  const [reportPaths, setReportPaths] = useState({});

  // 测试用例编辑状态
  const [editingTestCase, setEditingTestCase] = useState(null);
  const [editedTestPlan, setEditedTestPlan] = useState(null);

  // 测试用例编辑模式状态
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingScenario, setEditingScenario] = useState(null); // 当前正在编辑的测试用例
  const [showAddScenarioModal, setShowAddScenarioModal] = useState(false); // 显示新增用例弹窗
  const [newScenario, setNewScenario] = useState({
    id: '',
    name: '',
    description: '',
    page: '',
    priority: 'Medium',
    steps: []
  }); // 新增用例的临时数据

  // AI 智能测试日志
  const [testLogs, setTestLogs] = useState([]);

  // 使用 ref 跟踪是否已经初始化，防止重复执行
  const isInitializedRef = useRef(false);

  // 日志容器 ref，用于自动滚动
  const logContainerRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      // 只在首次打开时初始化
      if (!isInitializedRef.current) {
        resetState();
        isInitializedRef.current = true;

        // 设置日志监听
        if (electronAPI.onAISmartTestLog) {
          electronAPI.onAISmartTestLog((logData) => {
            setTestLogs(prev => [...prev, logData]);
            // 同时输出到浏览器控制台
            console.log(`[AI智能测试] ${logData.type} | ${logData.message}`, logData.data);
          });
        }
        // 检查是否有已保存的测试用例
        checkForSavedTestCases();
      }
    } else {
      // 关闭时重置初始化标记
      isInitializedRef.current = false;
    }

    // 清理监听
    return () => {
      if (electronAPI && electronAPI.removeAISmartTestLogListener) {
        electronAPI.removeAISmartTestLogListener();
      }
    };
  }, [isOpen, electronAPI, projectPath]);

  // 自动滚动日志到底部
  useEffect(() => {
    if (logContainerRef.current && testLogs.length > 0) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [testLogs]);

  // 当 preselectedTestCase 改变时，设置它
  const preselectedTestCaseRef = useRef(null);

  useEffect(() => {
    // 检查 preselectedTestCase 是否真的变化了（通过 projectPath 判断）
    const currentProjectPath = preselectedTestCase?.projectPath;
    const previousProjectPath = preselectedTestCaseRef.current?.projectPath;

    if (preselectedTestCase && isOpen) {
      // 只有当 projectPath 真正变化时才执行
      if (currentProjectPath !== previousProjectPath) {
        preselectedTestCaseRef.current = preselectedTestCase;

        // 如果是新增文档模式，不使用预选择的测试用例
        if (hideSavedCasesOption) {
          console.log('[AISmartTest] 新增文档模式，忽略预选择的测试用例');
          setSelectedSavedTestCase(null);
          setUseSavedTestCases(false);
          return;
        }
        setSelectedSavedTestCase(preselectedTestCase);
        setUseSavedTestCases(true);
        console.log('[AISmartTest] 使用预选择的测试用例:', preselectedTestCase.projectName);
      }
    } else if (!preselectedTestCase) {
      // 清空时也更新 ref
      preselectedTestCaseRef.current = null;
    }
  }, [preselectedTestCase, isOpen, hideSavedCasesOption]);

  /**
   * 加载项目的登录配置
   * 登录配置保存在项目级别的 metadata 中
   */
  const loadProjectLoginConfig = async () => {
    if (!projectPath || !electronAPI?.hasSavedTestCases) {
      return;
    }

    try {
      console.log('[loadProjectLoginConfig] 加载项目登录配置:', projectPath);
      const result = await electronAPI.hasSavedTestCases(projectPath);

      if (result.exists && result.metadata) {
        // 加载登录配置
        if (result.metadata.loginConfig) {
          console.log('[loadProjectLoginConfig] 找到登录配置:', result.metadata.loginConfig);
          setLoginConfig(result.metadata.loginConfig);
        }
        // 加载页面登录配置
        if (result.metadata.pageLoginConfig) {
          console.log('[loadProjectLoginConfig] 找到页面登录配置:', result.metadata.pageLoginConfig);
          setPageLoginConfig(result.metadata.pageLoginConfig);
        }
      } else {
        console.log('[loadProjectLoginConfig] 项目没有保存的登录配置，使用默认值');
      }
    } catch (error) {
      console.error('[loadProjectLoginConfig] 加载失败:', error);
    }
  };

  /**
   * 保存项目的登录配置
   * 将登录配置保存到项目级别的 metadata 中
   */
  const saveProjectLoginConfig = async () => {
    if (!projectPath || !electronAPI?.saveTestCases) {
      return;
    }

    try {
      console.log('[saveProjectLoginConfig] 保存项目登录配置');

      // 获取当前项目的测试用例
      const result = await electronAPI.hasSavedTestCases(projectPath);

      if (result.exists && result.testPlan) {
        // 更新 metadata 中的登录配置
        const updatedMetadata = {
          ...result.metadata,
          loginConfig: loginConfig,
          pageLoginConfig: pageLoginConfig
        };

        // 保存更新后的配置
        await electronAPI.saveTestCases(projectPath, result.testPlan, updatedMetadata, false);
        console.log('[saveProjectLoginConfig] 保存成功');
      }
    } catch (error) {
      console.error('[saveProjectLoginConfig] 保存失败:', error);
    }
  };

  // 当项目路径变化时，加载项目的登录配置
  useEffect(() => {
    if (isOpen && projectPath) {
      loadProjectLoginConfig();
    }
  }, [isOpen, projectPath]);

  // 当登录配置变化时，自动保存
  useEffect(() => {
    if (isOpen && projectPath) {
      // 延迟保存，避免频繁保存
      const timer = setTimeout(() => {
        saveProjectLoginConfig();
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [loginConfig, pageLoginConfig]);

  /**
   * 检查是否有已保存的测试用例
   */
  const checkForSavedTestCases = async () => {
    console.log('[checkForSavedTestCases] ========== 开始检查已保存的测试用例 ==========');
    try {
      // 检查 electronAPI 是否已加载
      if (!electronAPI || typeof electronAPI.listSavedTestCases !== 'function') {
        console.warn('[checkForSavedTestCases] electronAPI.listSavedTestCases 不可用，可能需要重启应用');
        return;
      }

      console.log('[checkForSavedTestCases] 调用 listSavedTestCases...');
      const result = await electronAPI.listSavedTestCases();
      console.log('[checkForSavedTestCases] listSavedTestCases 返回:', result);

      if (result.success && result.testCases && result.testCases.length > 0) {
        console.log('[checkForSavedTestCases] 找到', result.testCases.length, '个已保存的测试文档');
        result.testCases.forEach((tc, i) => {
          console.log(`[checkForSavedTestCases] 文档 ${i+1}:`, tc.projectName, '模块数:', tc.testPlan?.modules?.length || 0, '场景数:', tc.testPlan?.modules?.reduce((sum, m) => sum + (m.scenarios?.length || 0), 0) || 0);
        });
        setAllSavedTestCases(result.testCases);
        console.log('[AISmartTest] 发现已保存的测试用例:', result.testCases.length, '个');

        // 如果是新增文档模式（hideSavedCasesOption=true），不自动加载已保存的测试用例
        if (hideSavedCasesOption) {
          console.log('[AISmartTest] 新增文档模式，不自动加载已保存的测试用例');
          setSelectedSavedTestCase(null);
          setUseSavedTestCases(false);
          return;
        }

        // 如果当前项目有保存的测试用例，自动选中它
        if (projectPath) {
          const currentProjectCase = result.testCases.find(tc => tc.projectPath === projectPath);
          if (currentProjectCase) {
            // 加载完整的测试计划
            const detailResult = await electronAPI.hasSavedTestCases(projectPath);
            if (detailResult.hasSaved && detailResult.exists && detailResult.testPlan) {
              // 验证 testPlan 结构
              if (detailResult.testPlan.modules && detailResult.testPlan.modules.length > 0) {
                setSelectedSavedTestCase({
                  projectName: detailResult.projectName,
                  projectPath: detailResult.projectPath,
                  savedAt: detailResult.savedAt,
                  metadata: detailResult.metadata,
                  testPlan: detailResult.testPlan
                });
                setUseSavedTestCases(true);
                // 恢复登录配置
                if (detailResult.metadata?.loginConfig) {
                  setLoginConfig(detailResult.metadata.loginConfig);
                }
                if (detailResult.metadata?.pageLoginConfig) {
                  setPageLoginConfig(detailResult.metadata.pageLoginConfig);
                }
                console.log('[AISmartTest] 自动加载已保存的测试用例:', detailResult.projectName, '模块数:', detailResult.testPlan.modules.length);
              } else {
                console.warn('[AISmartTest] 已保存的测试用例中没有有效的测试模块');
              }
            } else if (!detailResult.testPlan) {
              console.warn('[AISmartTest] 已保存的测试用例中没有找到 testPlan，需要重新生成');
            }
          }
        }
      } else {
        setAllSavedTestCases([]);
        setSelectedSavedTestCase(null);
      }
    } catch (error) {
      console.error('检查已保存测试用例失败:', error);
      setAllSavedTestCases([]);
      setSelectedSavedTestCase(null);
    }
  };

  const resetState = () => {
    setActiveStep('input');
    setIsLoading(false);
    setTestPage(''); // 重置测试页面
    setRequirements('');
    setFigmaUrl('');
    setUiScreenshots([]);
    setDesignFiles([]);
    setAnalysisResult(null);
    setTestPlan(null);
    setTestResults(null);
    setVisualResults(null);
    setReportPaths({});
    setTestLogs([]);
    setUseSavedTestCases(false);
    setSelectedSavedTestCase(null);
    setCurrentPage(1);
    setEditingTestCase(null);
    setEditedTestPlan(null);
    setInputMode('ai');
    setSelectedBDDFile(null);
    setBddTestPlan(null);
    // 重置嵌套展开状态
    setExpandedProjects({});
    setExpandedModulesInList({});
    setSelectedScenario(null);
    // 注意：不重置 allSavedTestCases，保持已保存的测试用例列表
  };

  /**
   * 选择 UI 截图
   */
  const handleSelectScreenshots = async () => {
    try {
      const result = await electronAPI.selectFile({
        properties: ['openFile'],
        filters: [
          { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });
      if (!result.canceled) {
        setUiScreenshots([...uiScreenshots, result.filePath]);
      }
    } catch (error) {
      console.error('选择截图失败:', error);
      alert('选择截图失败: ' + error.message);
    }
  };

  /**
   * 选择代码文件
   */
  const handleSelectCodeFiles = async () => {
    try {
      // 允许选择多个文件
      const result = await electronAPI.selectFile({
         properties: ['openFile', 'multiSelections'],
         filters: [
            { name: 'Code Files', extensions: ['dart', 'js', 'jsx', 'ts', 'tsx', 'vue'] },
            { name: 'All Files', extensions: ['*'] }
         ]
      });
      if (!result.canceled) {
        // electronAPI.selectFile 返回 filePaths (多文件) 或 filePath (单文件)
        const selectedPaths = result.filePaths || (result.filePath ? [result.filePath] : []);
        // 追加，并去重
        setCodeFiles(prev => {
            const newFiles = [...prev, ...selectedPaths];
            return [...new Set(newFiles)];
        });
      }
    } catch (error) {
      console.error('选择代码文件失败:', error);
      alert('选择代码文件失败: ' + error.message);
    }
  };

  /**
   * 选择设计文件
   */
  const handleSelectDesign = async () => {
    try {
      const result = await electronAPI.selectFile();
      if (!result.canceled) {
        setDesignFiles([...designFiles, result.filePath]);
      }
    } catch (error) {
      console.error('选择设计文件失败:', error);
      alert('选择设计文件失败: ' + error.message);
    }
  };

  /**
   * 移除截图
   */
  const removeScreenshot = (index) => {
    setUiScreenshots(uiScreenshots.filter((_, i) => i !== index));
  };

  /**
   * 移除代码文件
   */
  const removeCodeFile = (index) => {
    setCodeFiles(codeFiles.filter((_, i) => i !== index));
  };

  /**
   * 移除设计文件
   */
  const removeDesign = (index) => {
    setDesignFiles(designFiles.filter((_, i) => i !== index));
  };

  /**
   * 获取总用例数
   */
  const getTotalTestCount = () => {
    const testPlanToUse = selectedSavedTestCase?.testPlan || editedTestPlan || testPlan;
    return testPlanToUse?.modules?.reduce((sum, m) => sum + (m.scenarios?.length || 0), 0) || 0;
  };

  /**
   * 切换页面选中状态
   */
  const togglePageCheck = (pageName) => {
    const newChecked = new Set(checkedPages);
    if (newChecked.has(pageName)) {
      newChecked.delete(pageName);
    } else {
      newChecked.add(pageName);
    }
    setCheckedPages(newChecked);
  };

  /**
   * 全选/取消全选页面
   */
  const toggleAllPages = (selectAll) => {
    const pageGroups = groupTestCasesByPage(selectedSavedTestCase?.testPlan || editedTestPlan || testPlan);
    if (selectAll) {
      setCheckedPages(new Set(pageGroups.keys()));
    } else {
      setCheckedPages(new Set());
    }
  };

  /**
   * 执行测试计划的通用函数
   */
  const executeTestPlan = async (testPlanToExecute) => {
    setIsLoading(true);
    setActiveStep('testing');
    setTestLogs([]);

    try {
      console.log('[AISmartTest] 执行测试计划:', testPlanToExecute);

      const testResult = await electronAPI.executeAgentTests(testPlanToExecute, {
        useSavedTestCases: true,
        projectPath: selectedSavedTestCase?.projectPath || projectPath,
        projectUrl: projectUrl,
        headless: testConfig.headless,
        slowMo: testConfig.slowMo,
      });

      if (!testResult?.testResult) {
        throw new Error(testResult?.error || '测试执行失败');
      }

      setTestResults(testResult.testResult);
      setActiveStep('results');

      const allReports = await electronAPI.generateAllTestReports(testResult.testResult);
      setReportPaths({
        html: allReports.html,
        pdf: allReports.pdf,
        excel: allReports.excel,
        markdown: allReports.markdown,
      });
    } catch (error) {
      console.error('测试执行失败:', error);
      alert(`测试执行失败: ${error.message}`);
      setActiveStep('input');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * 运行单个页面的测试
   */
  const runPageTests = async (pageName) => {
    const pageGroups = groupTestCasesByPage(selectedSavedTestCase?.testPlan || editedTestPlan || testPlan);
    const pageData = pageGroups.get(pageName);

    if (!pageData || pageData.scenarios.length === 0) {
      alert(`页面"${pageName}"没有可执行的测试用例`);
      return;
    }

    // 检查是否需要登录（页面级配置 > 项目级配置）
    const needLogin = pageLoginConfig?.[pageName]?.needLogin || loginConfig.enabled;
    console.log('[runPageTests] 页面:', pageName, '需要登录:', needLogin);

    // 构建只包含该页面用例的测试计划
    let filteredPlan = {
      modules: [{
        module: pageName,
        priority: pageData.module?.priority || 'High',
        scenarios: pageData.scenarios.map(s => {
          const { _moduleName, _modulePriority, ...cleanScenario } = s;
          return { ...cleanScenario, page: pageName };
        })
      }]
    };

    // 如果需要登录且配置了登录信息，在测试计划前添加登录步骤
    if (needLogin && loginConfig.username && loginConfig.password) {
      // 根据登录模式生成不同的步骤
      const isStepMode = loginConfig.mode === 'step';

      const loginModule = {
        module: '登录前置',
        priority: 'Critical',
        scenarios: [{
          id: `LOGIN_${Date.now()}`,
          name: '执行登录',
          description: isStepMode ? '分步登录：输入ID→下一步→密码→登录' : '在测试前先执行登录操作',
          type: 'precondition',
          priority: 'Critical',
          isLoginScenario: true,
          steps: [
            {
              type: 'given',
              description: '导航到登录页面',
              action: 'navigate',
              url: testConfig.baseUrl || window.location.href
            },
            // 分步模式：第一步输入ID
            ...(isStepMode ? [{
              type: 'when',
              description: `输入ID "${loginConfig.username}"`,
              action: 'input',
              actions: [
                { type: 'input', target: 'id', value: loginConfig.username, description: `输入ID ${loginConfig.username}` }
              ]
            }, {
              type: 'when',
              description: '点击下一步按钮',
              action: 'click',
              actions: [
                { type: 'click', target: '下一步', description: '点击下一步按钮' }
              ]
            }, {
              type: 'when',
              description: '等待页面切换',
              action: 'wait',
              actions: [
                { type: 'wait', duration: 1000, description: '等待页面切换' }
              ]
            }] : []),
            // 输入密码
            {
              type: 'when',
              description: `输入密码`,
              action: 'input',
              actions: [
                { type: 'input', target: 'password', value: loginConfig.password, description: '输入密码' }
              ]
            },
            // 标准模式：同时输入账号和密码（已在密码步骤前添加）
            ...(!isStepMode ? [{
              type: 'when',
              description: `输入账号 "${loginConfig.username}"`,
              action: 'input',
              actions: [
                { type: 'input', target: 'username', value: loginConfig.username, description: `输入账号 ${loginConfig.username}` }
              ]
            }] : []),
            // 点击登录按钮
            {
              type: 'when',
              description: '点击登录按钮',
              action: 'click',
              actions: [
                { type: 'click', target: '登录', description: '点击登录按钮' }
              ]
            },
            {
              type: 'then',
              description: '等待登录完成（页面跳转）',
              action: 'wait',
              actions: [
                { type: 'wait', duration: 5000, description: '等待登录完成和页面跳转' }
              ]
            }
          ]
        }]
      };
      // 将登录模块放在最前面
      filteredPlan.modules.unshift(loginModule);
      console.log('[runPageTests] 已添加登录前置步骤');
    }

    await executeTestPlan(filteredPlan);
  };

  /**
   * 运行选中页面的测试
   */
  const runCheckedPages = async () => {
    if (checkedPages.size === 0) {
      alert('请先勾选要运行的页面');
      return;
    }

    const pageGroups = groupTestCasesByPage(selectedSavedTestCase?.testPlan || editedTestPlan || testPlan);
    const modules = [];

    // 检查是否有页面需要登录
    let needLogin = false;
    checkedPages.forEach(pageName => {
      if (pageLoginConfig?.[pageName]?.needLogin || loginConfig.enabled) {
        needLogin = true;
      }
    });

    // 如果需要登录且配置了登录信息，添加登录前置模块
    if (needLogin && loginConfig.username && loginConfig.password) {
      // 根据登录模式生成不同的步骤
      const isStepMode = loginConfig.mode === 'step';

      modules.push({
        module: '登录前置',
        priority: 'Critical',
        scenarios: [{
          id: `LOGIN_${Date.now()}`,
          name: '执行登录',
          description: isStepMode ? '分步登录：输入ID→下一步→密码→登录' : '在测试前先执行登录操作',
          type: 'precondition',
          priority: 'Critical',
          isLoginScenario: true,
          steps: [
            {
              type: 'given',
              description: '导航到登录页面',
              action: 'navigate',
              url: testConfig.baseUrl || window.location.href
            },
            // 分步模式：第一步输入ID
            ...(isStepMode ? [{
              type: 'when',
              description: `输入ID "${loginConfig.username}"`,
              action: 'input',
              actions: [
                { type: 'input', target: 'id', value: loginConfig.username, description: `输入ID ${loginConfig.username}` }
              ]
            }, {
              type: 'when',
              description: '点击下一步按钮',
              action: 'click',
              actions: [
                { type: 'click', target: '下一步', description: '点击下一步按钮' }
              ]
            }, {
              type: 'when',
              description: '等待页面切换',
              action: 'wait',
              actions: [
                { type: 'wait', duration: 1000, description: '等待页面切换' }
              ]
            }] : []),
            // 输入密码
            {
              type: 'when',
              description: `输入密码`,
              action: 'input',
              actions: [
                { type: 'input', target: 'password', value: loginConfig.password, description: '输入密码' }
              ]
            },
            // 标准模式：同时输入账号和密码（已在密码步骤前添加）
            ...(!isStepMode ? [{
              type: 'when',
              description: `输入账号 "${loginConfig.username}"`,
              action: 'input',
              actions: [
                { type: 'input', target: 'username', value: loginConfig.username, description: `输入账号 ${loginConfig.username}` }
              ]
            }] : []),
            // 点击登录按钮
            {
              type: 'when',
              description: '点击登录按钮',
              action: 'click',
              actions: [
                { type: 'click', target: '登录', description: '点击登录按钮' }
              ]
            },
            {
              type: 'then',
              description: '等待登录完成（页面跳转）',
              action: 'wait',
              actions: [
                { type: 'wait', duration: 5000, description: '等待登录完成和页面跳转' }
              ]
            }
          ]
        }]
      });
      console.log('[runCheckedPages] 已添加登录前置步骤');
    }

    checkedPages.forEach(pageName => {
      const pageData = pageGroups.get(pageName);
      if (pageData && pageData.scenarios.length > 0) {
        modules.push({
          module: pageName,
          priority: pageData.module?.priority || 'High',
          scenarios: pageData.scenarios.map(s => {
            const { _moduleName, _modulePriority, ...cleanScenario } = s;
            return { ...cleanScenario, page: pageName };
          })
        });
      }
    });

    if (modules.length === 0) {
      alert('选中的页面没有可执行的测试用例');
      return;
    }

    await executeTestPlan({ modules });
  };

  /**
   * 处理嵌套列表中的测试用例选择
   */
  const handleScenarioSelect = async (projectPath, moduleName, scenario) => {
    try {
      // 加载完整的项目测试计划
      const detailResult = await electronAPI.hasSavedTestCases(projectPath);
      if (detailResult.hasSaved && detailResult.exists && detailResult.testPlan) {
        // 找到对应的模块和场景
        const targetModule = detailResult.testPlan.modules?.find(m => m.module === moduleName);
        if (targetModule) {
          const targetScenario = targetModule.scenarios?.find(s => s.id === scenario.id);
          if (targetScenario) {
            // 设置选中的测试用例（用于执行）
            setSelectedSavedTestCase({
              projectName: detailResult.projectName,
              projectPath: detailResult.projectPath,
              savedAt: detailResult.savedAt,
              metadata: detailResult.metadata,
              testPlan: detailResult.testPlan,
              selectedModule: moduleName,
              selectedScenario: scenario.id
            });
            setUseSavedTestCases(true);
            setSelectedScenario({
              projectPath,
              moduleName,
              scenarioId: scenario.id,
              scenario
            });
          }
        }
      }
    } catch (error) {
      console.error('加载测试用例失败:', error);
      alert('加载测试用例失败: ' + error.message);
    }
  };

  /**
   * 处理嵌套列表中的测试用例编辑
   */
  const handleScenarioEdit = (testCaseOrPageName, module, scenario) => {
    // 检测是否为页面分组模式（第一个参数是字符串，表示页面名称）
    if (typeof testCaseOrPageName === 'string') {
      // 页面分组模式：handleScenarioEdit(pageName, scenario)
      const pageName = testCaseOrPageName;
      const scenarioData = module; // 第二个参数实际上是 scenario

      // 检查是否是编辑页面的操作
      const isEditPageAction = scenarioData && typeof scenarioData === 'object' && scenarioData.action === 'edit-page';

      if (scenarioData && !isEditPageAction) {
        // 编辑单个用例
        setEditingPage(pageName);
        setEditingScenario({ ...scenarioData, page: pageName });
        setIsEditMode(true);
        setEditedTestPlan(JSON.parse(JSON.stringify(selectedSavedTestCase?.testPlan || testPlan)));
      } else if (isEditPageAction) {
        // 编辑整个页面的所有用例（只保留该页面的模块）
        console.log('[编辑页面] ========== 开始编辑页面 ==========');
        console.log('[编辑页面] 页面名称:', pageName);
        console.log('[编辑页面] selectedSavedTestCase?.testPlan 模块数:', selectedSavedTestCase?.testPlan?.modules?.length || 0);
        console.log('[编辑页面] testPlan 模块数:', testPlan?.modules?.length || 0);

        const currentTestPlan = selectedSavedTestCase?.testPlan || testPlan;
        console.log('[编辑页面] 使用的测试计划模块数:', currentTestPlan?.modules?.length || 0);

        if (currentTestPlan?.modules) {
          console.log('[编辑页面] 所有模块名称:', currentTestPlan.modules.map(m => m.module));

          // 使用 groupTestCasesByPage 来获取页面数据，然后只保留该页面的场景
          const pageGroups = groupTestCasesByPage(currentTestPlan);
          const targetPageData = pageGroups.get(pageName);

          console.log('[编辑页面] 页面分组中找到的页面数据:', !!targetPageData);
          if (targetPageData) {
            console.log('[编辑页面] 该页面场景数:', targetPageData.scenarios?.length || 0);
            console.log('[编辑页面] 该页面场景 IDs:', targetPageData.scenarios?.map(s => s.id) || []);
          }

          // 创建过滤后的测试计划，只包含该页面的模块
          // 注意：页面名称可能来自 scenario.page，需要找到对应的模块
          const filteredModules = currentTestPlan.modules
            .map(m => {
              // 过滤出属于该页面的场景
              const filteredScenarios = m.scenarios?.filter(s => (s.page || m.module) === pageName) || [];
              return {
                ...m,
                module: pageName, // 使用页面名称作为模块名
                scenarios: filteredScenarios
              };
            })
            .filter(m => m.scenarios.length > 0); // 只保留有场景的模块

          console.log('[编辑页面] 过滤后模块数:', filteredModules.length);
          if (filteredModules.length > 0) {
            console.log('[编辑页面] 过滤后模块场景数:', filteredModules[0].scenarios?.length || 0);
          }

          const filteredPlan = {
            ...currentTestPlan,
            modules: filteredModules
          };
          console.log('[编辑页面] 最终过滤计划模块数:', filteredPlan.modules.length);
          console.log('[编辑页面] ======================================');

          setEditingPage(pageName);
          setIsEditMode(true);
          setEditedTestPlan(JSON.parse(JSON.stringify(filteredPlan)));
        } else {
          console.error('[编辑页面] 错误：测试计划没有 modules 属性');
          alert('无法编辑：测试计划数据异常');
        }
      } else {
        // 新增用例到该页面
        setEditingPage(pageName);
        // 打开新增弹窗，预设页面
        setNewScenario({
          id: '',
          name: '',
          description: '',
          page: pageName,
          priority: 'Medium',
          steps: []
        });
        setShowAddScenarioModal(true);
      }
    } else {
      // 原有的嵌套列表模式：handleScenarioEdit(testCase, module, scenario)
      const testCase = testCaseOrPageName;
      setSelectedSavedTestCase({
        projectName: testCase.projectName,
        projectPath: testCase.projectPath,
        savedAt: testCase.savedAt,
        metadata: testCase.metadata,
        testPlan: testCase.testPlan
      });
      setIsEditMode(true);
      setEditedTestPlan(JSON.parse(JSON.stringify(testCase.testPlan)));

      // 恢复登录配置
      if (testCase.metadata?.loginConfig) {
        setLoginConfig(testCase.metadata.loginConfig);
      }
      if (testCase.metadata?.pageLoginConfig) {
        setPageLoginConfig(testCase.metadata.pageLoginConfig);
      }

      // 关闭已保存测试用例的展开状态
      setExpandedProjects({});
      setExpandedModulesInList({});
    }
  };

  /**
   * 处理嵌套列表中的测试用例删除（支持页面分组模式）
   */
  const handleScenarioDelete = async (testCaseOrPageName, module, scenario) => {
    // 检测是否为页面分组模式（第一个参数是字符串，表示页面名称）
    if (typeof testCaseOrPageName === 'string') {
      // 页面分组模式：handleScenarioDelete(pageName, scenario)
      const pageName = testCaseOrPageName;
      const scenarioData = module; // 第二个参数实际上是 scenario

      if (scenarioData) {
        // 删除单个用例 - 在编辑模式下处理
        if (!window.confirm(`确定要删除测试用例 "${scenarioData.name}" 吗？`)) {
          return;
        }

        const currentTestPlan = editedTestPlan || selectedSavedTestCase?.testPlan || testPlan;
        const updatedPlan = {
          ...currentTestPlan,
          modules: currentTestPlan.modules.map(m => {
            if (m.module === pageName) {
              return {
                ...m,
                scenarios: m.scenarios.filter(s => s.id !== scenarioData.id)
              };
            }
            return m;
          }).filter(m => m.scenarios && m.scenarios.length > 0)
        };

        setEditedTestPlan(updatedPlan);
        alert('测试用例删除成功！');
      } else {
        // 删除整个页面
        if (!window.confirm(`确定要删除页面"${pageName}"及其所有测试用例吗？`)) {
          return;
        }

        const currentTestPlan = selectedSavedTestCase?.testPlan || testPlan;
        const updatedPlan = {
          ...currentTestPlan,
          modules: currentTestPlan.modules.filter(m => m.module !== pageName)
        };

        try {
          const saveResult = await electronAPI.saveTestCases(
            selectedSavedTestCase?.projectPath || projectPath,
            updatedPlan,
            { ...selectedSavedTestCase?.metadata, lastTestRun: new Date().toISOString() },
            false
          );

          if (saveResult.success) {
            alert('页面删除成功！');
            await checkForSavedTestCases();
          }
        } catch (error) {
          console.error('删除页面失败:', error);
          alert('删除失败：' + error.message);
        }
      }
    } else {
      // 原有的嵌套列表模式：handleScenarioDelete(testCase, module, scenario)
      const testCase = testCaseOrPageName;

      if (!window.confirm(`确定要删除测试用例 "${scenario.name}" 吗？`)) {
        return;
      }

      try {
        // 创建更新后的测试计划
        const updatedTestPlan = {
          ...testCase.testPlan,
          modules: testCase.testPlan.modules.map(m => {
            if (m.module === module.module) {
              return {
                ...m,
                scenarios: m.scenarios.filter(s => s.id !== scenario.id)
              };
            }
            return m;
          })
        };

        // 如果模块没有场景了，也删除模块
        updatedTestPlan.modules = updatedTestPlan.modules.filter(
          m => m.scenarios && m.scenarios.length > 0
        );

        // 保存更新后的测试计划
        const saveResult = await electronAPI.saveTestCases(
          testCase.projectPath,
          updatedTestPlan,
          {
            ...testCase.metadata,
            lastTestRun: new Date().toISOString(),
          },
          false  // 编辑模式不合并
        );

        if (saveResult.success) {
          alert('测试用例删除成功！');
          // 重新加载测试用例列表
          checkForSavedTestCases();

          // 如果当前选中的是被删除的用例，清除选择
          if (selectedScenario?.scenarioId === scenario.id) {
            setSelectedScenario(null);
            setSelectedSavedTestCase(null);
            setUseSavedTestCases(false);
          }
        } else {
          alert('删除失败：' + saveResult.error);
        }
      } catch (error) {
        console.error('删除测试用例失败:', error);
        alert('删除失败：' + error.message);
      }
    }
  };

  /**
   * 选择 BDD Excel 文件
   */
  const handleSelectBDDFile = async () => {
    try {
      const result = await electronAPI.selectFile({
        properties: ['openFile'],
        filters: [
          { name: 'Excel Files', extensions: ['xlsx', 'xls'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });
      if (!result.canceled) {
        setSelectedBDDFile(result.filePath);
        setBddTestPlan(null); // 清空之前的测试计划
      }
    } catch (error) {
      console.error('选择BDD文件失败:', error);
      alert('选择文件失败: ' + error.message);
    }
  };

  /**
   * 导入 BDD 测试用例
   */
  const handleImportBDD = async () => {
    if (!selectedBDDFile) {
      alert('请先选择 BDD Excel 文件');
      return;
    }

    setIsLoading(true);

    try {
      // 调用后端解析 Excel 并生成测试计划
      const result = await electronAPI.importBDDTestCases(selectedBDDFile);

      if (result.success && result.testPlan) {
        setBddTestPlan(result.testPlan);
        setTestPlan(result.testPlan);

        // 跳转到审核步骤
        setActiveStep('reviewing');
        console.log('[BDD Import] 成功导入测试计划:', result.testPlan.totalSteps, '个步骤');
      } else {
        alert('导入失败: ' + (result.error || '未知错误'));
      }
    } catch (error) {
      console.error('导入BDD测试用例失败:', error);
      alert('导入失败: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * 开始 AI 智能测试
   */
  const handleStartSmartTest = async () => {
    // 清空日志
    setTestLogs([]);

    // 如果使用已保存的测试用例，直接跳到执行阶段
    if (useSavedTestCases && selectedSavedTestCase) {
      setIsLoading(true);
      setActiveStep('testing');

      try {
        console.log('[AISmartTest] 使用已保存的测试用例:', selectedSavedTestCase);
        console.log('[AISmartTest] 当前编辑模式:', isEditMode);
        console.log('[AISmartTest] editedTestPlan 是否存在:', !!editedTestPlan);

        // 确定要执行的测试计划：优先使用编辑后的版本
        let planToExecute = selectedSavedTestCase.testPlan;
        let dataSource = 'selectedSavedTestCase.testPlan (文件中的数据)';

        if (isEditMode && editedTestPlan) {
          // 用户在编辑模式下修改了测试用例，但未保存，使用编辑后的版本
          console.log('[AISmartTest] 检测到编辑模式，使用编辑后的测试计划');
          planToExecute = editedTestPlan;
          dataSource = 'editedTestPlan (内存中的编辑数据)';
        }

        // 验证测试计划是否存在
        if (!planToExecute) {
          throw new Error('测试计划不存在。请重新生成测试用例。');
        }

        // 验证测试计划中是否有模块
        if (!planToExecute.modules || planToExecute.modules.length === 0) {
          throw new Error('测试计划为空，没有可执行的测试模块。请重新生成测试用例。');
        }

        // 打印即将执行的测试计划详情
        console.log('[AISmartTest] ========== 即将执行测试 ==========');
        console.log('[AISmartTest] 数据来源:', dataSource);
        console.log('[AISmartTest] 测试计划:', planToExecute);
        planToExecute.modules?.forEach(module => {
          module.scenarios?.forEach(scenario => {
            console.log(`[AISmartTest] - 场景: ${scenario.id} ${scenario.name}`);
            scenario.steps?.forEach(step => {
              console.log(`[AISmartTest]   - 步骤 ${step.type}: "${step.description || step.text || step.desc || '无'}"`);
            });
          });
        });
        console.log('[AISmartTest] ========================================');

        // 执行测试计划
        const testResult = await electronAPI.executeAgentTests(planToExecute, {
          useSavedTestCases: true,
          projectPath: selectedSavedTestCase.projectPath,
          projectUrl: projectUrl,
          headless: testConfig.headless,
          slowMo: testConfig.slowMo,
        });

        console.log('[AISmartTest] executeAgentTests 返回结果:', testResult);
        console.log('[AISmartTest] 返回结果类型:', typeof testResult);
        console.log('[AISmartTest] 返回结果是否为null:', testResult === null);
        console.log('[AISmartTest] 返回结果的键:', testResult ? Object.keys(testResult) : 'N/A');

        // 验证返回结果 - 即使测试失败也要生成报告
        if (!testResult) {
          throw new Error('测试执行返回了空结果，请检查控制台日志了解详细信息');
        }

        // 如果有 error 字段且没有 testResult，说明是执行层面出错
        if (!testResult.testResult && testResult.error) {
          throw new Error(testResult.error);
        }

        setTestResults(testResult.testResult);

        // 如果有设计文件，执行视觉测试
        if (designFiles.length > 0) {
          setActiveStep('visual');
          const visualResult = await electronAPI.executeVisualTests(
            designFiles.map(df => ({
              designPath: df,
              url: projectUrl || 'http://localhost:8080',
            })),
            {
              threshold: 0.8,
              enableAIDetection: true,
            }
          );
          setVisualResults(visualResult);
        }

        // 生成测试报告（所有格式）
        setActiveStep('results');
        const allReports = await electronAPI.generateAllTestReports(testResult.testResult);

        setReportPaths({
          html: allReports.html,
          pdf: allReports.pdf,
          excel: allReports.excel,
          markdown: allReports.markdown,
        });
      } catch (error) {
        console.error('AI 智能测试失败:', error);
        console.error('当前日志:', testLogs);
        alert(`AI 智能测试失败: ${error.message}\n\n请查看控制台了解详细信息`);
        setActiveStep('input');
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // 新生成测试用例流程
    // 验证必填字段：页面
    if (!testPage.trim()) {
      alert('请输入测试页面');
      return;
    }
    // 验证至少有一个输入
    if (!requirements.trim() && !figmaUrl.trim() && uiScreenshots.length === 0 && designFiles.length === 0 && codeFiles.length === 0) {
      alert('请至少提供一种测试资料：需求描述、Figma 链接、UI 截图、设计文件或代码文件');
      return;
    }

    setIsLoading(true);
    setActiveStep('analyzing');

    try {
      // 步骤1: AI 分析需求并生成测试计划
      console.log('[AISmartTest] 开始分析需求...');
      const analysisResult = await electronAPI.analyzeAndGenerateTests({
        testPage: testPage.trim(), // 测试页面
        requirements: requirements.trim(),
        figmaUrl: figmaUrl.trim(),
        uiScreenshots,
        apiDocs: [], // 可扩展
        codeFiles,
        projectUrl,
        projectPath,
        language: testCaseLanguage, // 测试用例语言
      });

      console.log('[AISmartTest] 分析结果:', analysisResult);

      if (!analysisResult.success) {
        throw new Error(analysisResult.error || '分析失败');
      }

      setAnalysisResult(analysisResult.analysis);
      setTestPlan(analysisResult.testPlan);
      setEditedTestPlan(JSON.parse(JSON.stringify(analysisResult.testPlan))); // 深拷贝用于编辑
      setActiveStep('reviewing'); // 进入审查步骤，等待用户确认后再执行测试

      // 注意：测试执行已移至 handleExecuteReviewedTests 函数
      // 用户在审查步骤点击"执行测试"按钮后才会执行测试
      console.log('[AISmartTest] 测试用例生成完成，等待用户审查和确认...');
    } catch (error) {
      console.error('AI 智能测试失败:', error);
      console.error('当前日志:', testLogs);
      alert(`AI 智能测试失败: ${error.message}\n\n请查看控制台了解详细信息`);
      setActiveStep('input');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * 下载测试报告
   */
  const handleDownloadReport = async (format) => {
    if (!testResults) return;

    try {
      const result = await electronAPI.downloadTestReport(testResults, format);
      if (result.success) {
        console.log(`报告已下载: ${result.fileName}`);
      }
    } catch (error) {
      console.error('下载报告失败:', error);
      alert('下载报告失败: ' + error.message);
    }
  };

  /**
   * 下载测试用例（审查阶段）
   */
  const handleDownloadTestCases = async (format) => {
    const planToDownload = editedTestPlan || testPlan;
    if (!planToDownload) {
      alert('没有可下载的测试用例');
      return;
    }

    try {
      let content = '';
      let fileName = '';
      let mimeType = '';

      switch (format) {
        case 'json':
          content = JSON.stringify(planToDownload, null, 2);
          fileName = `test-cases-${Date.now()}.json`;
          mimeType = 'application/json';
          break;
        case 'markdown':
          content = generateMarkdownTestCases(planToDownload);
          fileName = `test-cases-${Date.now()}.md`;
          mimeType = 'text/markdown';
          break;
        case 'excel':
          // 使用已有的 Excel 生成功能
          const result = await electronAPI.generateTestCasesExcel(planToDownload);
          if (result.success) {
            console.log(`测试用例已下载: ${result.fileName}`);
          } else {
            alert('下载失败: ' + result.error);
          }
          return;
        default:
          alert('不支持的格式');
          return;
      }

      // 创建 Blob 并下载
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      console.log(`测试用例已下载: ${fileName}`);
    } catch (error) {
      console.error('下载测试用例失败:', error);
      alert('下载测试用例失败: ' + error.message);
    }
  };

  /**
   * 生成 Markdown 格式的测试用例
   */
  const generateMarkdownTestCases = (plan) => {
    let md = '# 测试用例\n\n';
    md += `生成时间: ${new Date().toLocaleString('zh-CN')}\n\n`;

    for (const module of plan.modules || []) {
      md += `## 模块: ${module.module}\n\n`;
      md += `优先级: ${module.priority}\n\n`;

      for (const scenario of module.scenarios || []) {
        md += `### 场景: ${scenario.name}\n\n`;

        // 添加页面信息
        if (scenario.page) {
          md += `- **页面**: ${scenario.page}\n`;
        }

        // 添加前置条件（支持多种格式）
        let givenText = '';
        if (scenario.preconditions) {
          givenText = Array.isArray(scenario.preconditions) ? scenario.preconditions.join('; ') : scenario.preconditions;
        } else if (scenario.given) {
          givenText = typeof scenario.given === 'object'
            ? (scenario.given.text || scenario.given.description || scenario.given.action || '')
            : scenario.given;
        } else if (scenario.steps && Array.isArray(scenario.steps)) {
          const givenStep = scenario.steps.find(s => s.type === 'given');
          if (givenStep) {
            givenText = givenStep.text || givenStep.description || givenStep.action || '';
          }
        }
        md += `- **前置条件**: ${givenText || '无'}\n`;

        // 添加操作步骤（支持多种格式）
        if (scenario.operations && Array.isArray(scenario.operations)) {
          md += `- **操作步骤**:\n`;
          for (const step of scenario.operations) {
            md += `  - ${step}\n`;
          }
        } else if (scenario.when) {
          if (typeof scenario.when === 'object') {
            if (scenario.when.steps && Array.isArray(scenario.when.steps)) {
              md += `- **操作步骤**:\n`;
              for (const step of scenario.when.steps) {
                const stepText = typeof step === 'string' ? step : (step.text || step.description || step);
                md += `  - ${stepText}\n`;
              }
            } else if (scenario.when.actions && Array.isArray(scenario.when.actions)) {
              md += `- **操作步骤**:\n`;
              for (const action of scenario.when.actions) {
                md += `  - ${action.description || action.text || action.type || '操作'}\n`;
              }
            } else {
              const whenText = scenario.when.text || scenario.when.description || scenario.when.action || '';
              md += `- **操作步骤**: ${whenText || '无'}\n`;
            }
          } else {
            md += `- **操作步骤**: ${scenario.when || '无'}\n`;
          }
        } else if (scenario.steps && Array.isArray(scenario.steps)) {
          const whenSteps = scenario.steps.filter(s => s.type === 'when' || s.type === 'when_step');
          if (whenSteps.length > 0) {
            md += `- **操作步骤**:\n`;
            for (const step of whenSteps) {
              const stepText = step.text || step.description || step.action || '操作';
              md += `  - ${stepText}\n`;
            }
          } else {
            md += `- **操作步骤**: 无\n`;
          }
        } else {
          md += `- **操作步骤**: 无\n`;
        }

        // 添加预期结果（支持多种格式）
        let thenText = '';
        if (scenario.expectedResults) {
          thenText = Array.isArray(scenario.expectedResults) ? scenario.expectedResults.join('; ') : scenario.expectedResults;
        } else if (scenario.then) {
          if (typeof scenario.then === 'object') {
            if (scenario.then.verifications && Array.isArray(scenario.then.verifications)) {
              md += `- **预期结果**:\n`;
              for (const v of scenario.then.verifications) {
                md += `  - ${v.description || v.text || v.type || '验证'}\n`;
              }
              thenText = null; // Mark as handled
            } else {
              thenText = scenario.then.text || scenario.then.description || scenario.then.action || '';
            }
          } else {
            thenText = scenario.then;
          }
        } else if (scenario.steps && Array.isArray(scenario.steps)) {
          const thenStep = scenario.steps.find(s => s.type === 'then');
          if (thenStep) {
            if (thenStep.verifications && Array.isArray(thenStep.verifications)) {
              md += `- **预期结果**:\n`;
              for (const v of thenStep.verifications) {
                md += `  - ${v.description || v.text || v.type || '验证'}\n`;
              }
              thenText = null; // Mark as handled
            } else {
              thenText = thenStep.text || thenStep.description || thenStep.action || '';
            }
          }
        }
        if (thenText !== null) {
          md += `- **预期结果**: ${thenText || '无'}\n`;
        }
        md += '\n';
      }
    }

    return md;
  };

  /**
   * 执行审查后的测试用例
   */
  const handleExecuteReviewedTests = async () => {
    setIsLoading(true);
    setActiveStep('testing');

    try {
      const planToExecute = editedTestPlan || testPlan;
      console.log('[AISmartTest] 执行审查后的测试用例:', planToExecute);

      // 详细日志：显示即将执行的测试用例及其步骤描述
      console.log('[AISmartTest] 即将执行的测试用例详情:');
      planToExecute.modules?.forEach(module => {
        module.scenarios?.forEach(scenario => {
          console.log(`[AISmartTest] - 场景: ${scenario.id} ${scenario.name}`);
          scenario.steps?.forEach(step => {
            console.log(`[AISmartTest]   - 步骤 ${step.type}: "${step.description || step.text || step.desc || '无'}"`);
            if (step.type === 'then' && step.verifications) {
              console.log(`[AISmartTest]     验证:`, step.verifications.map(v => v.description || v.text));
            }
          });
        });
      });

      // 执行测试
      const testResult = await electronAPI.executeAgentTests(planToExecute, {
        projectPath: projectPath,
        projectUrl: projectUrl,
        headless: testConfig.headless,
        slowMo: testConfig.slowMo,
      });

      console.log('[AISmartTest] 测试结果:', testResult);

      // 验证返回结果 - 即使测试失败也要生成报告
      if (!testResult) {
        throw new Error('测试执行返回了空结果');
      }

      // 如果有 error 字段且没有 testResult，说明是执行层面出错
      if (!testResult.testResult && testResult.error) {
        throw new Error(testResult.error);
      }

      setTestResults(testResult.testResult);

      // 如果有设计文件，执行视觉测试
      if (designFiles.length > 0) {
        setActiveStep('visual');
        const visualResult = await electronAPI.executeVisualTests(
          designFiles.map(df => ({
            designPath: df,
            url: projectUrl || 'http://localhost:8080',
          })),
          {
            threshold: 0.8,
            enableAIDetection: true,
          }
        );
        setVisualResults(visualResult);
      }

      // 生成测试报告
      setActiveStep('results');
      const allReports = await electronAPI.generateAllTestReports(testResult.testResult);

      setReportPaths({
        html: allReports.html,
        pdf: allReports.pdf,
        excel: allReports.excel,
        markdown: allReports.markdown,
      });
    } catch (error) {
      console.error('AI 智能测试失败:', error);
      alert(`AI 智能测试失败: ${error.message}\n\n请查看控制台了解详细信息`);
      setActiveStep('reviewing'); // 返回审查步骤
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  // 渲染输入步骤
  const renderInputStep = () => (
    <div className="space-y-6">
      <div className="text-center">
        <div className="text-5xl mb-4">🧠</div>
        <h3 className="text-2xl font-bold text-white mb-2">AI 智能测试</h3>
        <p className="text-gray-400">AI 全能测试：生成用例、操作验证、视觉对比一体化</p>
      </div>

      {/* 输入模式选择器 */}
      {!useSavedTestCases && (
        <div className="grid grid-cols-3 gap-4">
          <button
            onClick={() => setInputMode('ai')}
            className={`p-4 rounded-lg border-2 transition-all ${
              inputMode === 'ai'
                ? 'bg-purple-900/40 border-purple-500'
                : 'bg-gray-800 border-gray-700 hover:border-purple-500'
            }`}
          >
            <div className="text-center">
              <div className="text-3xl mb-2">🤖</div>
              <div className="font-semibold text-white">需求模式</div>
              <div className="text-xs text-gray-400 mt-1">输入需求，AI 自动生成用例</div>
            </div>
          </button>
          <button
            onClick={() => setInputMode('bdd')}
            className={`p-4 rounded-lg border-2 transition-all ${
              inputMode === 'bdd'
                ? 'bg-green-900/40 border-green-500'
                : 'bg-gray-800 border-gray-700 hover:border-green-500'
            }`}
          >
            <div className="text-center">
              <div className="text-3xl mb-2">📋</div>
              <div className="font-semibold text-white">导入模式</div>
              <div className="text-xs text-gray-400 mt-1">导入 Excel 用例，AI 辅助执行</div>
            </div>
          </button>
          <button
            onClick={() => setInputMode('code')}
            className={`p-4 rounded-lg border-2 transition-all ${
              inputMode === 'code'
                ? 'bg-blue-900/40 border-blue-500'
                : 'bg-gray-800 border-gray-700 hover:border-blue-500'
            }`}
          >
            <div className="text-center">
              <div className="text-3xl mb-2">💻</div>
              <div className="font-semibold text-white">代码模式</div>
              <div className="text-xs text-gray-400 mt-1">选择代码，AI 分析生成用例</div>
            </div>
          </button>
        </div>
      )}

      {/* 项目信息 */}
      {projectUrl && (
        <div className="p-4 bg-blue-900/20 border border-blue-700 rounded-lg">
          <p className="text-sm text-blue-300">
            <span className="font-semibold">项目地址：</span>{projectUrl}
          </p>
        </div>
      )}

      {/* 已保存的测试用例选项 */}
      {!hideSavedCasesOption && allSavedTestCases.length > 0 && (
        <div className="p-4 bg-green-900/20 border border-green-700 rounded-lg">
          {/* 已选择项目时：显示项目信息和操作按钮 */}
          {selectedSavedTestCase ? (
            <>
              {/* 顶部项目信息和主运行按钮 */}
              <div className="flex items-center justify-between mb-4 p-3 bg-gray-800 rounded-lg">
                <div className="flex items-center gap-3">
                  <span className="text-xl">📁</span>
                  <div>
                    <span className="font-semibold text-white">
                      {selectedSavedTestCase.projectName}
                    </span>
                    <span className="text-xs text-gray-400 ml-2">
                      (共 {getTotalTestCount()} 条用例)
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!isEditMode && (
                    <>
                      <button
                        onClick={() => toggleAllPages(checkedPages.size === 0)}
                        className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded text-white"
                      >
                        {checkedPages.size === 0 ? '☐ 全选' : '☑ 取消'}
                      </button>
                      <button
                        onClick={runCheckedPages}
                        disabled={checkedPages.size === 0 || isLoading}
                        className="px-3 py-1 text-xs bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed rounded text-white flex items-center gap-1"
                      >
                        <span className="text-white">▶</span>
                        运行选中 ({checkedPages.size})
                      </button>
                    </>
                  )}
                  {isEditMode && (
                    <button
                      onClick={async () => {
                        console.log('[保存修改] ========== 开始保存编辑 ==========');
                        console.log('[保存修改] editingPage:', editingPage);
                        console.log('[保存修改] editedTestPlan 模块数:', editedTestPlan?.modules?.length || 0);
                        console.log('[保存修改] selectedSavedTestCase 模块数:', selectedSavedTestCase?.testPlan?.modules?.length || 0);

                        // 检测是否是单页面编辑模式
                        let finalPlan = completeTestPlanActions(editedTestPlan);

                        if (editingPage && selectedSavedTestCase?.testPlan) {
                          // 单页面编辑模式：将编辑后的页面合并回原始完整计划
                          console.log('[保存修改] 单页面编辑模式，合并回完整计划');
                          const originalPlan = selectedSavedTestCase.testPlan;

                          // 找到编辑后的页面模块
                          const editedPageModule = finalPlan.modules?.find(m => m.module === editingPage);
                          console.log('[保存修改] 编辑的页面:', editingPage, '场景数:', editedPageModule?.scenarios?.length || 0);

                          // 合并：保留其他页面，更新编辑的页面（保持原有顺序）
                          finalPlan = {
                            ...originalPlan,
                            modules: originalPlan.modules.map(m => {
                              if (m.module === editingPage) {
                                // 使用编辑后的页面模块（保留用户修改的排序）
                                return editedPageModule || m;
                              }
                              return m;
                            })
                          };
                          console.log('[保存修改] 合并后总模块数:', finalPlan.modules?.length || 0);
                        } else {
                          // 完整编辑模式：直接使用编辑后的testPlan（保留用户修改的排序）
                          console.log('[保存修改] 完整编辑模式，直接保存');
                        }

                        // 直接保存 finalPlan，不再重新分组（避免改变用户设置的顺序）
                        const saveResult = await electronAPI.saveTestCases(
                          selectedSavedTestCase.projectPath,
                          finalPlan,
                          { ...selectedSavedTestCase.metadata, lastTestRun: new Date().toISOString() },
                          false
                        );

                        if (saveResult.success) {
                          setSelectedSavedTestCase({
                            ...selectedSavedTestCase,
                            testPlan: finalPlan
                          });
                          setEditedTestPlan(finalPlan);
                          setEditingPage(null);
                          setIsEditMode(false);
                          alert('保存成功！');
                          await checkForSavedTestCases();
                        }
                      }}
                      className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-white"
                    >
                      💾 保存修改
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (isEditMode) {
                        setIsEditMode(false);
                        setEditedTestPlan(null);
                      } else {
                        setSelectedSavedTestCase(null);
                        setUseSavedTestCases(false);
                        setCheckedPages(new Set());
                      }
                    }}
                    className="px-3 py-1.5 text-xs bg-gray-600 hover:bg-gray-500 rounded text-white"
                  >
                    {isEditMode ? '取消编辑' : '关闭'}
                  </button>
                </div>
              </div>

              {/* 登录配置 - 在页面列表上方显示 */}
              <div className="mb-3 p-3 bg-gray-800/50 border border-gray-700 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🔐</span>
                    <span className="text-sm font-medium text-gray-300">登录配置</span>
                  </div>
                  <button
                    onClick={() => setLoginConfig(prev => ({ ...prev, enabled: !prev.enabled }))}
                    className={`px-3 py-1 text-xs rounded transition-colors ${
                      loginConfig.enabled
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                    }`}
                  >
                    {loginConfig.enabled ? '☑ 已启用' : '☐ 未启用'}
                  </button>
                </div>

                {loginConfig.enabled && (
                  <div className="mt-2 space-y-3">
                    {/* 登录模式选择 */}
                    <div>
                      <label className="block text-xs text-gray-400 mb-2">登录方式</label>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setLoginConfig(prev => ({ ...prev, mode: 'standard' }))}
                          className={`flex-1 px-3 py-2 text-xs rounded transition-colors ${
                            loginConfig.mode === 'standard'
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                          }`}
                        >
                          标准登录
                          <div className="text-xs opacity-70 mt-1">账号+密码→登录</div>
                        </button>
                        <button
                          onClick={() => setLoginConfig(prev => ({ ...prev, mode: 'step' }))}
                          className={`flex-1 px-3 py-2 text-xs rounded transition-colors ${
                            loginConfig.mode === 'step'
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                          }`}
                        >
                          分步登录
                          <div className="text-xs opacity-70 mt-1">ID→下一步→密码→登录</div>
                        </button>
                      </div>
                    </div>

                    {/* 账号密码输入 */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">
                          {loginConfig.mode === 'step' ? 'ID' : '账号'}
                        </label>
                        <input
                          type="text"
                          value={loginConfig.username}
                          onChange={(e) => setLoginConfig(prev => ({ ...prev, username: e.target.value }))}
                          placeholder={loginConfig.mode === 'step' ? '输入ID' : '输入账号'}
                          className="w-full placeholder-gray-500 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">密码</label>
                        <input
                          type="password"
                          value={loginConfig.password}
                          onChange={(e) => setLoginConfig(prev => ({ ...prev, password: e.target.value }))}
                          placeholder="输入密码"
                          className="w-full placeholder-gray-500 text-sm"
                        />
                      </div>
                    </div>

                    {/* 说明文字 */}
                    <div className="text-xs text-gray-500">
                      {loginConfig.mode === 'standard'
                        ? '系统将自动定位：账号输入框、密码输入框、登录按钮'
                        : '系统将自动定位：ID输入框、下一步按钮、密码输入框、登录按钮'
                      }
                    </div>
                  </div>
                )}
              </div>

              {/* 按页面分组的测试用例列表 */}
              {!isEditMode ? (
                <PageGroupedTestList
                  testPlan={selectedSavedTestCase.testPlan}
                  checkedPages={checkedPages}
                  setCheckedPages={setCheckedPages}
                  expandedPages={expandedPages}
                  setExpandedPages={setExpandedPages}
                  onScenarioEdit={handleScenarioEdit}
                  onScenarioDelete={handleScenarioDelete}
                  onPageRun={runPageTests}
                  onPageAdd={() => {
                    setNewScenario({
                      id: '',
                      name: '',
                      description: '',
                      page: '',
                      priority: 'Medium',
                      steps: []
                    });
                    setShowAddScenarioModal(true);
                  }}
                  pageLoginConfig={pageLoginConfig}
                  onPageLoginChange={(pageName, needLogin) => {
                    setPageLoginConfig(prev => ({
                      ...prev,
                      [pageName]: { needLogin }
                    }));
                  }}
                />
              ) : (
                <TestCaseEditor
                  testPlan={editedTestPlan}
                  onTestPlanChange={setEditedTestPlan}
                  electronAPI={electronAPI}
                  projectPath={selectedSavedTestCase?.projectPath}
                />
              )}
            </>
          ) : (
            // 显示所有已保存的测试用例项目列表
            <div className="max-h-96 overflow-y-auto space-y-2">
              {allSavedTestCases.length > 0 ? (
                allSavedTestCases.map((testCase) => (
                  <div
                    key={testCase.projectPath}
                    className="p-3 bg-gray-800 rounded-lg border border-gray-700 hover:border-green-500 cursor-pointer transition-colors"
                    onClick={async () => {
                      const detailResult = await electronAPI.hasSavedTestCases(testCase.projectPath);
                      if (detailResult.hasSaved && detailResult.exists && detailResult.testPlan) {
                        setSelectedSavedTestCase({
                          projectName: detailResult.projectName,
                          projectPath: detailResult.projectPath,
                          savedAt: detailResult.savedAt,
                          metadata: detailResult.metadata,
                          testPlan: detailResult.testPlan
                        });
                        setUseSavedTestCases(true);
                      }
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">📁</span>
                        <span className="font-medium text-white">{testCase.projectName}</span>
                      </div>
                      <div className="text-xs text-gray-400">
                        {testCase.testPlan?.modules?.reduce((sum, m) => sum + (m.scenarios?.length || 0), 0) || 0} 条用例
                      </div>
                    </div>
                    {testCase.metadata?.requirements && (
                      <div className="text-xs text-gray-500 mt-2 truncate">
                        {testCase.metadata.requirements.substring(0, 100)}
                        {testCase.metadata.requirements.length > 100 ? '...' : ''}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-gray-400">
                  暂无已保存的测试用例
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* BDD 导入模式的文件选择 */}
      {inputMode === 'bdd' && !useSavedTestCases && (
        <div className="p-4 bg-green-900/20 border border-green-700 rounded-lg">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            <span className="flex items-center gap-2">
              <span className="text-xl">📊</span>
              选择 BDD Excel 测试文件
              <span className="text-xs text-green-400">(必填)</span>
            </span>
          </label>
          <button
            onClick={handleSelectBDDFile}
            disabled={isLoading}
            className="w-full px-4 py-3 bg-gray-900 border-2 border-dashed border-green-700 hover:border-green-500 disabled:border-gray-700 disabled:hover:border-gray-700 rounded-lg transition-colors text-gray-400 hover:text-green-400 disabled:text-gray-500"
          >
            {selectedBDDFile ? '📄 更换文件' : '+ 点击选择 Excel 文件'}
          </button>

          {selectedBDDFile && (
            <div className="mt-3 p-3 bg-gray-900 rounded-lg flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-xl">📄</span>
                <span className="text-sm text-gray-300 truncate max-w-md">{selectedBDDFile}</span>
              </div>
              <button
                onClick={() => {
                  setSelectedBDDFile(null);
                  setBddTestPlan(null);
                }}
                className="p-2 text-gray-400 hover:text-red-400 transition-colors"
              >
                ✕
              </button>
            </div>
          )}

          {/* Excel 格式说明 */}
          <div className="mt-3 p-3 bg-gray-900/50 rounded text-xs text-gray-400">
            <p className="font-semibold text-gray-300 mb-2">Excel 格式要求：</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="px-2 py-1 text-left text-gray-300">Function</th>
                    <th className="px-2 py-1 text-left text-gray-300">優先級</th>
                    <th className="px-2 py-1 text-left text-gray-300">Scenario</th>
                    <th className="px-2 py-1 text-left text-gray-300">Given</th>
                    <th className="px-2 py-1 text-left text-gray-300">When</th>
                    <th className="px-2 py-1 text-left text-gray-300">Then</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="px-2 py-1 text-gray-500">登录功能</td>
                    <td className="px-2 py-1 text-gray-500">High</td>
                    <td className="px-2 py-1 text-gray-500">成功登录</td>
                    <td className="px-2 py-1 text-gray-500">在登录页</td>
                    <td className="px-2 py-1 text-gray-500">输入账号密码</td>
                    <td className="px-2 py-1 text-gray-500">登录成功</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Code 导入模式 */}
      {inputMode === 'code' && !useSavedTestCases && (
        <div className="p-4 bg-blue-900/20 border border-blue-700 rounded-lg">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            <span className="flex items-center gap-2">
              <span className="text-xl">💻</span>
              选择需测试的代码文件
              <span className="text-xs text-blue-400">(系统自动提取上下文)</span>
            </span>
          </label>
          <button
            onClick={handleSelectCodeFiles}
            disabled={isLoading}
            className="w-full px-4 py-3 bg-gray-900 border-2 border-dashed border-blue-700 hover:border-blue-500 disabled:border-gray-700 disabled:hover:border-gray-700 rounded-lg transition-colors text-gray-400 hover:text-blue-400 disabled:text-gray-500"
          >
            + 点击添加代码文件 (多选)
          </button>

          {codeFiles.length > 0 && (
            <div className="mt-3 space-y-2">
              {codeFiles.map((file, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-gray-900 rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">📄</span>
                    <span className="text-sm text-gray-300 truncate max-w-md" title={file}>
                      {file.split(/[/\\]/).pop()}
                    </span>
                  </div>
                  <button
                    onClick={() => removeCodeFile(index)}
                    className="p-2 text-gray-400 hover:text-red-400 transition-colors"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          
          <div className="mt-3 p-3 bg-gray-900/50 rounded text-xs text-gray-400">
             <p className="font-semibold text-gray-300">支持的语言:</p>
             <p className="mt-1">Dart (Flutter), JavaScript/TypeScript (Vue/React)</p>
          </div>
        </div>
      )}

      {/* 测试用例语言选择 - 仅在 AI 模式下显示 */}
      {inputMode === 'ai' && !useSavedTestCases && (
        <div className="p-4 bg-purple-900/20 border border-purple-700 rounded-lg">
          <label className="block text-sm font-medium text-gray-300 mb-3">
            <span className="flex items-center gap-2">
              <span className="text-xl">🌐</span>
              测试用例语言 / Test Case Language
              <span className="text-xs text-purple-400">(生成后不可修改)</span>
            </span>
          </label>
          <div className="grid grid-cols-3 gap-3">
            {[
              { value: 'simplified-chinese', label: '简体中文', flag: '🇨🇳' },
              { value: 'traditional-chinese', label: '繁體中文', flag: '🇹🇼' },
              { value: 'english', label: 'English', flag: '🇺🇸' }
            ].map(lang => (
              <button
                key={lang.value}
                onClick={() => setTestCaseLanguage(lang.value)}
                disabled={isLoading}
                className={`px-4 py-3 rounded-lg border-2 transition-all flex items-center justify-center gap-2 ${
                  testCaseLanguage === lang.value
                    ? 'bg-purple-900/50 border-purple-500 text-white'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-purple-500 hover:text-gray-300'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <span className="text-xl">{lang.flag}</span>
                <span className="font-medium">{lang.label}</span>
                {testCaseLanguage === lang.value && (
                  <span className="ml-1 text-purple-400">✓</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* AI 生成模式的页面选择 - 必填 */}
      {inputMode === 'ai' && (
        <div className={useSavedTestCases ? 'opacity-50 pointer-events-none' : ''}>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            <span className="flex items-center gap-2">
              <span className="text-xl">📄</span>
              页面
              <span className="text-red-400">*</span>
              <span className="text-xs text-gray-500">
                {useSavedTestCases ? '(使用已保存用例)' : '(必填)'}
              </span>
            </span>
          </label>
          <input
            type="text"
            value={testPage}
            onChange={(e) => setTestPage(e.target.value)}
            placeholder="例如: 登录页、首页、商品列表页"
            disabled={isLoading || useSavedTestCases}
            className="w-full placeholder-gray-500 disabled:opacity-50"
          />
        </div>
      )}

      {/* AI 生成模式的需求描述 */}
      {inputMode === 'ai' && (
        <>
          {/* 登录配置 */}
          <div className={useSavedTestCases ? 'opacity-50 pointer-events-none' : ''}>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium text-gray-300">
                <span className="flex items-center gap-2">
                  <span className="text-xl">🔐</span>
                  登录配置
                  <span className="text-xs text-gray-500">(可选)</span>
                </span>
              </label>
              <button
                onClick={() => setLoginConfig(prev => ({ ...prev, enabled: !prev.enabled }))}
                disabled={isLoading || useSavedTestCases}
                className={`px-3 py-1 text-xs rounded transition-colors ${
                  loginConfig.enabled
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                } disabled:opacity-50`}
              >
                {loginConfig.enabled ? '☑ 已启用' : '☐ 未启用'}
              </button>
            </div>

            {loginConfig.enabled && (
              <div className="p-4 bg-gray-900/50 border border-gray-700 rounded-lg space-y-3">
                <div className="text-xs text-gray-500 mb-2">
                  系统将自动定位登录元素：账号输入框、密码输入框、登录按钮
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">账号</label>
                    <input
                      type="text"
                      value={loginConfig.username}
                      onChange={(e) => setLoginConfig(prev => ({ ...prev, username: e.target.value }))}
                      placeholder="输入账号"
                      disabled={isLoading || useSavedTestCases}
                      className="w-full placeholder-gray-500 text-sm disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">密码</label>
                    <input
                      type="password"
                      value={loginConfig.password}
                      onChange={(e) => setLoginConfig(prev => ({ ...prev, password: e.target.value }))}
                      placeholder="输入密码"
                      disabled={isLoading || useSavedTestCases}
                      className="w-full placeholder-gray-500 text-sm disabled:opacity-50"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 需求描述 */}
          <div className={useSavedTestCases ? 'opacity-50 pointer-events-none' : ''}>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              <span className="flex items-center gap-2">
                <span className="text-xl">📝</span>
                需求描述
                <span className="text-xs text-gray-500">
                  {useSavedTestCases ? '(使用已保存用例)' : allSavedTestCases.length > 0 ? '(可选)' : '(必填其一)'}
                </span>
              </span>
            </label>
            <textarea
              value={requirements}
              onChange={(e) => setRequirements(e.target.value)}
              placeholder="描述需要测试的功能需求，例如：
- 用户登录功能：支持用户名/邮箱登录，记住密码
- 商品列表：支持分页、排序、筛选
- 购物车：添加商品、修改数量、结算"
              rows={5}
              disabled={isLoading || useSavedTestCases}
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 caret-white focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none disabled:opacity-50"
            />
          </div>
        </>
      )}

      {/* Figma 链接 - 仅在 AI 模式下显示 */}
      {inputMode === 'ai' && (
        <div className={useSavedTestCases ? 'opacity-50 pointer-events-none' : ''}>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            <span className="flex items-center gap-2">
              <span className="text-xl">🎨</span>
              Figma 设计稿链接
              <span className="text-xs text-gray-500">(可选)</span>
            </span>
          </label>
          <input
            type="text"
            value={figmaUrl}
            onChange={(e) => setFigmaUrl(e.target.value)}
            placeholder="https://www.figma.com/file/..."
            disabled={isLoading || useSavedTestCases}
            className="w-full placeholder-gray-500 disabled:opacity-50"
          />
        </div>
      )}

      {/* UI 截图 - 仅在 AI 模式下显示 */}
      {inputMode === 'ai' && (
        <div className={useSavedTestCases ? 'opacity-50 pointer-events-none' : ''}>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            <span className="flex items-center gap-2">
              <span className="text-xl">📸</span>
              UI 界面截图
              <span className="text-xs text-gray-500">(可选)</span>
            </span>
          </label>
          <button
            onClick={handleSelectScreenshots}
            disabled={isLoading || useSavedTestCases}
            className="w-full px-4 py-3 bg-gray-900 border-2 border-dashed border-gray-700 hover:border-purple-500 disabled:border-gray-700 disabled:hover:border-gray-700 rounded-lg transition-colors text-gray-400 hover:text-purple-400 disabled:text-gray-500"
          >
            + 点击添加截图
          </button>

          {uiScreenshots.length > 0 && (
            <div className="mt-3 space-y-2">
              {uiScreenshots.map((screenshot, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-gray-900 rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">🖼️</span>
                    <span className="text-sm text-gray-300 truncate max-w-md">{screenshot}</span>
                  </div>
                  <button
                    onClick={() => removeScreenshot(index)}
                    className="p-2 text-gray-400 hover:text-red-400 transition-colors"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 设计文件 */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          <span className="flex items-center gap-2">
            <span className="text-xl">🎁</span>
            设计文件（Figma JSON/图片）
            <span className="text-xs text-gray-500">(用于视觉对比，始终可选)</span>
          </span>
        </label>
        <button
          onClick={handleSelectDesign}
          disabled={isLoading}
          className="w-full px-4 py-3 bg-gray-900 border-2 border-dashed border-gray-700 hover:border-purple-500 rounded-lg transition-colors text-gray-400 hover:text-purple-400"
        >
          + 点击添加设计文件
        </button>

        {designFiles.length > 0 && (
          <div className="mt-3 space-y-2">
            {designFiles.map((file, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-gray-900 rounded-lg">
                <div className="flex items-center gap-3">
                  <span className="text-xl">🎨</span>
                  <span className="text-sm text-gray-300 truncate max-w-md">{file}</span>
                </div>
                <button
                  onClick={() => removeDesign(index)}
                  className="p-2 text-gray-400 hover:text-red-400 transition-colors"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 测试配置 */}
      <div className="p-4 bg-gray-900 rounded-lg">
        <h4 className="text-sm font-semibold text-white mb-3">测试配置</h4>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={testConfig.includeFunctional}
              onChange={(e) => setTestConfig({ ...testConfig, includeFunctional: e.target.checked })}
              disabled={isLoading}
            />
            功能测试
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={testConfig.includeUI}
              onChange={(e) => setTestConfig({ ...testConfig, includeUI: e.target.checked })}
              disabled={isLoading}
            />
            UI 测试
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={testConfig.includeVisual}
              onChange={(e) => setTestConfig({ ...testConfig, includeVisual: e.target.checked })}
              disabled={isLoading}
            />
            视觉对比
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={testConfig.headless}
              onChange={(e) => setTestConfig({ ...testConfig, headless: e.target.checked })}
              disabled={isLoading}
            />
            无头模式
          </label>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex justify-between pt-4 border-t border-gray-700">
        <button
          onClick={onClose}
          className="px-6 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors text-white font-medium"
        >
          取消
        </button>
        {inputMode === 'bdd' && !useSavedTestCases ? (
          <button
            onClick={handleImportBDD}
            disabled={!selectedBDDFile || isLoading}
            className="px-8 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg transition-colors text-white font-medium flex items-center gap-2"
          >
            {isLoading ? (
              <>⏳ 导入中...</>
            ) : (
              <>
                <span>📥</span>
                导入 BDD 测试用例
              </>
            )}
          </button>
        ) : (
          <button
            onClick={handleStartSmartTest}
            disabled={isLoading}
            className="px-8 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg transition-colors text-white font-medium flex items-center gap-2"
          >
            {isLoading ? (
              <>⏳ 处理中...</>
            ) : useSavedTestCases ? (
              <>
                <span>▶️</span>
                执行已保存测试
              </>
            ) : (
              <>
                <span>🚀</span>
                开始 AI 智能测试
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );

  // 渲染分析中状态
  const renderAnalyzingStep = () => (
    <div className="space-y-4 py-4">
      <div className="text-center">
        <div className="text-6xl animate-pulse mb-4">🧠</div>
        <h3 className="text-2xl font-bold text-white">AI 正在分析需求...</h3>
      </div>

      {/* 日志显示区域 */}
      <div ref={logContainerRef} className="bg-gray-900 rounded-lg p-4 max-h-80 overflow-y-auto font-mono text-sm">
        <div className="text-gray-400 mb-2">=== AI 智能测试日志 ===</div>
        {testLogs.length === 0 ? (
          <div className="text-gray-500">正在初始化...</div>
        ) : (
          testLogs.map((log, idx) => (
            <div key={idx} className="mb-1 text-green-400">
              <span className="text-gray-500">[{String(log.timestamp || '')}]</span>{' '}
              <span className="text-yellow-400">[{String(log.type || '')}]</span>{' '}
              {String(log.message || '')}
            </div>
          ))
        )}
      </div>
    </div>
  );

  // 渲染测试中状态
  const renderTestingStep = () => (
    <div className="space-y-4 py-4">
      <div className="text-center">
        <div className="text-6xl animate-pulse mb-4">🧪</div>
        <h3 className="text-2xl font-bold text-white">AI 正在执行测试...</h3>
      </div>

      {/* 日志显示区域 */}
      <div ref={logContainerRef} className="bg-gray-900 rounded-lg p-4 max-h-80 overflow-y-auto font-mono text-sm">
        <div className="text-gray-400 mb-2">=== AI 智能测试日志 ===</div>
        {testLogs.length === 0 ? (
          <div className="text-gray-500">正在初始化...</div>
        ) : (
          testLogs.map((log, idx) => {
            const logType = String(log.type || '');
            return (
              <div key={idx} className={`mb-1 ${
                logType === '通过' ? 'text-green-400' :
                logType === '失败' || logType === '错误' ? 'text-red-400' :
                logType === '用例' ? 'text-cyan-400' :
                logType === '步骤' ? 'text-blue-300' :
                'text-green-400'
              }`}>
                <span className="text-gray-500">[{String(log.timestamp || '')}]</span>{' '}
                <span className={`${
                  logType === '通过' ? 'text-green-500' :
                  logType === '失败' || logType === '错误' ? 'text-red-500' :
                  logType === '用例' ? 'text-cyan-500' :
                  logType === '步骤' ? 'text-blue-400' :
                  'text-yellow-500'
                }`}>[{logType}]</span>{' '}
                {String(log.message || '')}
              </div>
            );
          })
        )}
        {/* 自动滚动到底部 */}
        <div ref={el => el && el.scrollIntoView({ behavior: 'smooth' })}></div>
      </div>
    </div>
  );

  // 渲染测试用例审查步骤
  const renderReviewingStep = () => {
    const planToReview = editedTestPlan || testPlan;
    if (!planToReview) {
      return (
        <div className="space-y-4 py-4">
          <div className="text-center text-red-400">没有找到测试用例</div>
        </div>
      );
    }

    const totalTestCases = (planToReview.modules || []).reduce((sum, m) => sum + (m.scenarios?.length || 0), 0);

    return (
      <div className="space-y-6 py-4">
        <div className="text-center">
          <div className="text-5xl mb-4">📋</div>
          <h3 className="text-2xl font-bold text-white mb-2">审查测试用例</h3>
          <p className="text-gray-400">共 {planToReview.modules?.length || 0} 个模块，{totalTestCases} 个测试用例</p>
        </div>

        {/* 确认提示横幅 */}
        <div className="p-4 bg-yellow-900/30 border border-yellow-600 rounded-lg">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚠️</span>
            <div className="flex-1">
              <div className="text-yellow-300 font-medium">请先审查测试用例，确认无误后再执行测试</div>
              <div className="text-yellow-400/70 text-sm mt-1">您可以编辑测试用例、下载查看，确认后点击下方"执行测试"按钮</div>
            </div>
          </div>
        </div>

        {/* 下载按钮 */}
        <div className="p-4 bg-gray-900 rounded-lg">
          <h4 className="text-sm font-semibold text-white mb-3">下载测试用例</h4>
          <div className="flex gap-3">
            <button
              onClick={() => handleDownloadTestCases('json')}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors text-white text-sm"
            >
              📄 JSON
            </button>
            <button
              onClick={() => handleDownloadTestCases('markdown')}
              className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg transition-colors text-white text-sm"
            >
              📝 Markdown
            </button>
            <button
              onClick={() => handleDownloadTestCases('excel')}
              className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg transition-colors text-white text-sm"
            >
              📊 Excel
            </button>
          </div>
        </div>

        {/* 测试用例列表 */}
        <div className="bg-gray-900 rounded-lg p-4 max-h-96 overflow-y-auto">
          {(planToReview.modules || []).map((module, mIdx) => (
            <div key={mIdx} className="mb-6 last:mb-0">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-lg font-semibold text-white">
                  {module.module}
                  <span className="ml-2 text-sm font-normal text-gray-400">
                    ({module.priority})
                  </span>
                </h4>
              </div>

              <div className="space-y-2">
                {(module.scenarios || []).map((scenario, sIdx) => (
                  <div
                    key={sIdx}
                    className="p-3 bg-gray-800 rounded-lg border border-gray-700 hover:border-purple-500 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="text-white font-medium mb-1">
                          {sIdx + 1}. {scenario.name}
                        </div>
                        <div className="text-sm text-gray-400 space-y-1">
                          {/* 显示页面信息 */}
                          {scenario.page && (
                            <div>📄 <span className="text-gray-500">页面:</span> <span className="text-blue-400">{scenario.page}</span></div>
                          )}
                          {/* 前置条件 - 支持新字段 preconditions 或旧字段 given */}
                          <div>
                            📌 <span className="text-gray-500">前置:</span> {
                              (() => {
                                // 1. Check new field preconditions
                                if (scenario.preconditions) {
                                  return Array.isArray(scenario.preconditions) ? scenario.preconditions.join('; ') : scenario.preconditions;
                                }
                                // 2. Check AI-generated given object
                                if (scenario.given) {
                                  if (typeof scenario.given === 'object') {
                                    return scenario.given.text || scenario.given.description || scenario.given.action || '无';
                                  }
                                  return scenario.given || '无';
                                }
                                // 3. Check steps array format (from saved test cases)
                                if (scenario.steps && Array.isArray(scenario.steps)) {
                                  const givenStep = scenario.steps.find(s => s.type === 'given');
                                  if (givenStep) {
                                    return String(givenStep.text || givenStep.description || givenStep.desc || givenStep.action || '无');
                                  }
                                }
                                return '无';
                              })()
                            }
                          </div>
                          {/* 操作步骤 - 支持新字段 operations 或旧字段 when */}
                          <div>
                            ⚡ <span className="text-gray-500">操作:</span>
                            {(() => {
                              // 1. Check new field operations
                              if (scenario.operations) {
                                if (Array.isArray(scenario.operations)) {
                                  return (
                                    <div className="mt-1 ml-4 space-y-1">
                                      {scenario.operations.map((step, stepIdx) => (
                                        <div key={stepIdx} className="text-gray-300 text-xs">
                                          {stepIdx + 1}. {String(step)}
                                        </div>
                                      ))}
                                    </div>
                                  );
                                }
                                // operations is object (from RequirementAnalyzer), convert to string
                                if (typeof scenario.operations === 'object') {
                                  return (
                                    <div className="mt-1 ml-4 space-y-1">
                                      {scenario.operations.map ? Object.entries(scenario.operations).map(([key, value], idx) => (
                                        <div key={key} className="text-gray-300 text-xs">
                                          {idx + 1}. {key}: {JSON.stringify(value)}
                                        </div>
                                      )) : (
                                        <div className="text-gray-300 text-xs">
                                          {JSON.stringify(scenario.operations)}
                                        </div>
                                      )}
                                    </div>
                                  );
                                }
                                return <span>{String(scenario.operations)}</span>;
                              }

                              // 2. Check AI-generated when object
                              if (scenario.when) {
                                if (typeof scenario.when === 'object') {
                                  // 安全检查：防止循环引用
                                  try {
                                    JSON.stringify(scenario.when);
                                  } catch (e) {
                                    return <span>数据格式错误</span>;
                                  }
                                  // Check if when has steps array
                                  if (scenario.when.steps && Array.isArray(scenario.when.steps)) {
                                    return (
                                      <div className="mt-1 ml-4 space-y-1">
                                        {scenario.when.steps.map((step, stepIdx) => (
                                          <div key={stepIdx} className="text-gray-300 text-xs">
                                            {stepIdx + 1}. {typeof step === 'string' ? step : (step.text || step.description || JSON.stringify(step) || String(step))}
                                          </div>
                                        ))}
                                      </div>
                                    );
                                  }
                                  // Check if when has actions array
                                  if (scenario.when.actions && Array.isArray(scenario.when.actions)) {
                                    return (
                                      <div className="mt-1 ml-4 space-y-1">
                                        {scenario.when.actions.map((action, stepIdx) => (
                                          <div key={stepIdx} className="text-gray-300 text-xs">
                                            {stepIdx + 1}. {action.description || action.text || action.type || JSON.stringify(action) || '操作'}
                                          </div>
                                        ))}
                                      </div>
                                    );
                                  }
                                  // Fallback to text/description
                                  const whenText = scenario.when.text || scenario.when.description || scenario.when.action || '无';
                                  return <span>{whenText}</span>;
                                }
                                return <span>{scenario.when}</span>;
                              }

                              // 3. Check steps array format (from saved test cases)
                              if (scenario.steps && Array.isArray(scenario.steps)) {
                                const whenSteps = scenario.steps.filter(s => s.type === 'when' || s.type === 'when_step');
                                if (whenSteps.length > 0) {
                                  return (
                                    <div className="mt-1 ml-4 space-y-1">
                                      {whenSteps.map((step, stepIdx) => {
                                        const stepText = String(step.text || step.description || step.desc || step.action || '操作');
                                        return (
                                          <div key={stepIdx} className="text-gray-300 untable-data">
                                            {stepIdx + 1}. {stepText}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  );
                                }
                              }

                              return <span>无</span>;
                            })()}
                          </div>
                          {/* 预期结果 - 支持新字段 expectedResults 或旧字段 then */}
                          <div>
                            ✅ <span className="text-gray-500">预期:</span> {
                              (() => {
                                // 1. Check new field expectedResults
                                if (scenario.expectedResults) {
                                  return Array.isArray(scenario.expectedResults) ? scenario.expectedResults.join('; ') : scenario.expectedResults;
                                }
                                // 2. Check AI-generated then object
                                if (scenario.then) {
                                  if (typeof scenario.then === 'object') {
                                    // 安全检查：防止循环引用
                                    try {
                                      JSON.stringify(scenario.then);
                                    } catch (e) {
                                      return <span>数据格式错误</span>;
                                    }
                                    // Check if then has verifications array
                                    if (scenario.then.verifications && Array.isArray(scenario.then.verifications)) {
                                      return (
                                        <div className="mt-1 ml-4 space-y-1">
                                          {scenario.then.verifications.map((v, vIdx) => (
                                            <div key={vIdx} className="text-gray-300 text-xs">
                                              {vIdx + 1}. {v.description || v.text || v.type || JSON.stringify(v) || '验证'}
                                            </div>
                                          ))}
                                        </div>
                                      );
                                    }
                                    return scenario.then.text || scenario.then.description || scenario.then.action || '无';
                                  }
                                  return scenario.then || '无';
                                }
                                // 3. Check steps array format (from saved test cases)
                                if (scenario.steps && Array.isArray(scenario.steps)) {
                                  const thenStep = scenario.steps.find(s => s.type === 'then');
                                  if (thenStep) {
                                    // Check for verifications
                                    if (thenStep.verifications && Array.isArray(thenStep.verifications)) {
                                      return (
                                        <div className="mt-1 ml-4 space-y-1">
                                          {thenStep.verifications.map((v, vIdx) => (
                                            <div key={vIdx} className="text-gray-300 text-xs">
                                              {vIdx + 1}. {v.description || v.text || v.type || JSON.stringify(v) || '验证'}
                                            </div>
                                          ))}
                                        </div>
                                      );
                                    }
                                    return String(thenStep.text || thenStep.description || thenStep.desc || thenStep.action || '无');
                                  }
                                }
                                return '无';
                              })()
                            }
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* 操作按钮 */}
        <div className="flex justify-between pt-4 border-t border-gray-700">
          <button
            onClick={() => setActiveStep('input')}
            className="px-6 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors text-white font-medium"
          >
            ← 返回修改
          </button>
          <div className="flex gap-3">
            <button
              onClick={async () => {
                // 保存测试用例
                if (electronAPI.saveTestCases) {
                  // 自动补全步骤的 actions
                  const completedTestPlan = completeTestPlanActions(planToReview);
                  // 新增测试用例时启用合并，将新用例添加到现有测试计划中
                  const saveResult = await electronAPI.saveTestCases(projectPath, completedTestPlan, {
                    requirements: requirements.trim(),
                    testPage: testPage.trim(),
                    loginConfig: loginConfig.enabled ? {
                      enabled: true,
                      username: loginConfig.username
                    } : undefined,
                    pageLoginConfig: pageLoginConfig
                  }, true);  // 启用合并模式

                  if (saveResult.success) {
                    // 保存成功后，更新内存中的 editedTestPlan，确保执行时使用最新数据
                    setEditedTestPlan(completedTestPlan);
                    // 重新加载已保存的测试用例列表
                    await checkForSavedTestCases();
                    alert('测试用例已保存（已自动补全步骤操作信息）');
                  } else {
                    alert('保存失败：' + saveResult.error);
                  }
                }
              }}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors text-white font-medium"
            >
              💾 保存用例
            </button>
            <button
              onClick={handleExecuteReviewedTests}
              className="px-6 py-2 bg-green-600 hover:bg-green-700 rounded-lg transition-colors text-white font-medium flex items-center gap-2"
            >
              <span className="text-white">▶</span>
              执行测试
            </button>
          </div>
        </div>
      </div>
    );
  };

  // 渲染视觉测试状态
  const renderVisualStep = () => (
    <div className="space-y-4 py-4">
      <div className="text-center">
        <div className="text-6xl animate-pulse mb-4">👁️</div>
        <h3 className="text-2xl font-bold text-white">AI 正在进行视觉对比...</h3>
      </div>

      {/* 日志显示区域 */}
      <div className="bg-gray-900 rounded-lg p-4 max-h-80 overflow-y-auto font-mono text-sm">
        <div className="text-gray-400 mb-2">=== AI 智能测试日志 ===</div>
        {testLogs.length === 0 ? (
          <div className="text-gray-500">正在初始化...</div>
        ) : (
          testLogs.map((log, idx) => {
            const logType = String(log.type || '');
            return (
              <div key={idx} className={`mb-1 ${
                logType === '通过' ? 'text-green-400' :
                logType === '失败' || logType === '错误' ? 'text-red-400' :
                'text-green-400'
              }`}>
                <span className="text-gray-500">[{String(log.timestamp || '')}]</span>{' '}
                <span className="text-yellow-400">[{logType}]</span>{' '}
                {String(log.message || '')}
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  // 渲染测试结果
  const renderResultsStep = () => {
    if (!testResults) return null;

    const total = testResults.totalScenarios || testResults.totalTests || 0;
    const passed = testResults.passedScenarios || testResults.passedTests || 0;
    const failed = testResults.failedScenarios || testResults.failedTests || 0;
    const passRate = total > 0 ? ((passed / total) * 100).toFixed(1) : 0;

    return (
      <div className="space-y-6">
        <div className="text-center">
          <div className="text-5xl mb-4">
            {failed === 0 ? '🎉' : passed > 0 ? '⚠️' : '❌'}
          </div>
          <h3 className="text-2xl font-bold text-white mb-2">AI 智能测试完成</h3>
          <p className="text-gray-400">
            {failed === 0 ? '所有测试通过！' : '部分测试失败，请查看详情'}
          </p>
        </div>

        {/* 测试摘要 */}
        <div className="grid grid-cols-4 gap-3">
          <div className="p-4 bg-gray-900 rounded-lg text-center">
            <div className="text-2xl font-bold text-white">{total}</div>
            <div className="text-xs text-gray-400">总测试</div>
          </div>
          <div className="p-4 bg-green-900/30 rounded-lg text-center">
            <div className="text-2xl font-bold text-green-400">{passed}</div>
            <div className="text-xs text-gray-400">通过</div>
          </div>
          <div className="p-4 bg-red-900/30 rounded-lg text-center">
            <div className="text-2xl font-bold text-red-400">{failed}</div>
            <div className="text-xs text-gray-400">失败</div>
          </div>
          <div className="p-4 bg-blue-900/30 rounded-lg text-center">
            <div className="text-2xl font-bold text-blue-400">{passRate}%</div>
            <div className="text-xs text-gray-400">通过率</div>
          </div>
        </div>

        {/* 下载报告按钮 */}
        <div className="p-4 bg-gray-900 rounded-lg">
          <h4 className="text-sm font-semibold text-white mb-3">下载测试报告</h4>
          <div className="flex gap-3">
            <button
              onClick={() => handleDownloadReport('html')}
              className="flex-1 px-4 py-2 bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors text-white text-sm"
            >
              📄 HTML
            </button>
            <button
              onClick={() => handleDownloadReport('pdf')}
              className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors text-white text-sm"
            >
              📕 PDF
            </button>
            <button
              onClick={() => handleDownloadReport('excel')}
              className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg transition-colors text-white text-sm"
            >
              📊 Excel
            </button>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex justify-between gap-3 pt-4 border-t border-gray-700">
          <button
            onClick={resetState}
            className="px-6 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors text-white font-medium"
          >
            🔄 重新测试
          </button>
          <div className="flex gap-3">
            {!useSavedTestCases && testPlan && (
              <button
                onClick={async () => {
                  console.log('[保存用例] ========== 开始保存测试用例 ==========');
                  console.log('[保存用例] 项目路径:', projectPath);
                  console.log('[保存用例] 测试计划模块数:', testPlan?.modules?.length || 0);
                  if (testPlan?.modules) {
                    testPlan.modules.forEach((m, i) => {
                      console.log(`[保存用例] 模块 ${i+1}: ${m.module}, 场景数: ${m.scenarios?.length || 0}`);
                    });
                  }

                  if (electronAPI.saveTestCases) {
                    // 补全测试计划的 actions
                    const completedTestPlan = completeTestPlanActions(testPlan);
                    console.log('[保存用例] 补全后的测试计划模块数:', completedTestPlan?.modules?.length || 0);

                    try {
                      const saveResult = await electronAPI.saveTestCases(
                        projectPath,
                        completedTestPlan,
                        {
                          requirements: requirements.trim(),
                          testPage: testPage.trim(),
                          lastTestRun: new Date().toISOString()
                        },
                        true  // 启用合并模式
                      );

                      console.log('[保存用例] 保存结果:', saveResult);
                      if (saveResult.success) {
                        console.log('[保存用例] 保存成功，开始刷新列表...');
                        await checkForSavedTestCases();
                        console.log('[保存用例] 列表刷新完成');
                        alert('测试用例已保存到项目！');
                      } else {
                        console.error('[保存用例] 保存失败:', saveResult.error);
                        alert('保存失败：' + saveResult.error);
                      }
                    } catch (error) {
                      console.error('[保存用例] 保存异常:', error);
                      alert('保存失败：' + error.message);
                    }
                  } else {
                    console.error('[保存用例] electronAPI.saveTestCases 不存在');
                  }
                  console.log('[保存用例] ========== 保存流程结束 ==========');
                }}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors text-white font-medium"
              >
                💾 保存用例到项目
              </button>
            )}
            <button
              onClick={onClose}
              className="px-6 py-2 bg-green-600 hover:bg-green-700 rounded-lg transition-colors text-white font-medium"
            >
              ✓ 完成
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70">
      <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-4xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">🧠 AI 智能测试</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeStep === 'input' && renderInputStep()}
          {activeStep === 'analyzing' && renderAnalyzingStep()}
          {activeStep === 'reviewing' && renderReviewingStep()}
          {activeStep === 'testing' && renderTestingStep()}
          {activeStep === 'visual' && renderVisualStep()}
          {activeStep === 'results' && renderResultsStep()}
        </div>
      </div>

      {/* 全局新增用例弹窗 */}
      {showAddScenarioModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full">
            <h3 className="text-xl font-bold text-white mb-4">新增测试用例</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-300 mb-1">用例名称 *</label>
                <input
                  type="text"
                  value={newScenario.name}
                  onChange={(e) => setNewScenario({ ...newScenario, name: e.target.value })}
                  className="w-full"
                  placeholder="例如: 用户登录功能测试"
                />
              </div>

              {/* 页面选择 - 独立的一栏，必填 */}
              <div>
                <label className="block text-sm text-gray-300 mb-1">
                  所属页面 <span className="text-red-400">*</span>
                </label>
                <div className="flex gap-2">
                  <select
                    value={newScenario.page || ''}
                    onChange={(e) => setNewScenario({ ...newScenario, page: e.target.value })}
                    className="flex-1"
                  >
                    <option value="">-- 请选择页面 --</option>
                    {getPageList(selectedSavedTestCase?.testPlan || testPlan).map(page => (
                      <option key={page} value={page}>{page}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={newScenario.page && !getPageList(selectedSavedTestCase?.testPlan || testPlan).includes(newScenario.page) ? newScenario.page : ''}
                    onChange={(e) => setNewScenario({ ...newScenario, page: e.target.value })}
                    placeholder="或输入新页面"
                    className="flex-1"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-300 mb-1">优先级</label>
                <select
                  value={newScenario.priority}
                  onChange={(e) => setNewScenario({ ...newScenario, priority: e.target.value })}
                  className="w-full"
                >
                  <option value="High">高</option>
                  <option value="Medium">中</option>
                  <option value="Low">低</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowAddScenarioModal(false);
                  setNewScenario({
                    id: '',
                    name: '',
                    description: '',
                    page: '',
                    priority: 'Medium',
                    steps: []
                  });
                }}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded text-white"
              >
                取消
              </button>
              <button
                onClick={() => {
                  if (!newScenario.name.trim()) {
                    alert('请输入用例名称');
                    return;
                  }
                  if (!newScenario.page?.trim()) {
                    alert('请选择所属页面');
                    return;
                  }

                  // 创建新用例
                  const moduleId = `TC${Date.now()}`;
                  const newScenarioData = {
                    ...newScenario,
                    id: moduleId,
                    estimatedTime: 2,
                    steps: [
                      {
                        type: 'given',
                        description: '前置条件',
                        action: '前置条件',
                        actions: [],
                        text: '前置条件'
                      },
                      {
                        type: 'when',
                        description: '执行操作',
                        action: '执行操作',
                        actions: [],
                        text: '执行操作'
                      },
                      {
                        type: 'then',
                        description: '验证结果',
                        action: '验证结果',
                        actions: [],
                        text: '验证结果',
                        verifications: []
                      }
                    ]
                  };

                  // 按页面组织
                  const targetPage = newScenario.page;
                  const currentTestPlan = selectedSavedTestCase?.testPlan || testPlan;
                  let targetModule = currentTestPlan?.modules?.find(m => m.module === targetPage);

                  if (!targetModule) {
                    targetModule = {
                      module: targetPage,
                      priority: newScenario.priority || 'High',
                      scenarios: []
                    };
                  }

                  const updatedPlan = {
                    ...currentTestPlan,
                    modules: [
                      ...(currentTestPlan.modules || []).filter(m => m.module !== targetPage),
                      {
                        ...targetModule,
                        scenarios: [...(targetModule.scenarios || []), newScenarioData]
                      }
                    ]
                  };

                  // 更新状态
                  if (selectedSavedTestCase) {
                    setSelectedSavedTestCase({
                      ...selectedSavedTestCase,
                      testPlan: updatedPlan
                    });
                  } else {
                    setTestPlan(updatedPlan);
                  }

                  // 保存
                  electronAPI.saveTestCases(
                    selectedSavedTestCase?.projectPath || projectPath,
                    updatedPlan,
                    { requirements: '' },
                    true
                  ).then(() => {
                    setShowAddScenarioModal(false);
                    setNewScenario({
                      id: '',
                      name: '',
                      description: '',
                      page: '',
                      priority: 'Medium',
                      steps: []
                    });
                    checkForSavedTestCases();
                    alert('测试用例添加成功！');
                  }).catch(error => {
                    console.error('保存失败:', error);
                    alert('保存失败：' + error.message);
                  });
                }}
                className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded text-white"
              >
                添加
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AISmartTestModal;

