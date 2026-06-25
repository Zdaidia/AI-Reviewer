/**
 * Right Panel Component
 *
 * Contains multiple tabs:
 * - Problems (with pagination and filtering)
 * - TODO (with pagination)
 * - Reports
 * - AI Fix Preview
 * - Dependencies
 * - Tests
 */

import React, { useState, useEffect, useMemo } from 'react';
import DependencyTree from './DependencyTree';
import DependencyStats from './DependencyStats';

const tabs = [
  { id: 'problems', label: 'Problems', icon: '⚠️' },
  { id: 'reports', label: 'Reports', icon: '📊' },
  { id: 'aiPreview', label: 'AI Fix Preview', icon: '🤖' },
  { id: 'dependencies', label: 'Dependencies', icon: '📦' },
  { id: 'tests', label: 'Tests', icon: '🧪' },
];

// 规则ID到中文描述的映射
const ruleDescriptions = {
  // JavaScript/TypeScript
  'JS-001': '生产代码中使用了 console.log',
  'JS-002': '使用了 var 声明变量',
  'JS-003': '异步函数缺少错误处理',
  'JS-004': '列表渲染缺少 key 属性',
  'TS-001': '函数缺少返回类型注解',
  'TS-002': '使用了 any 类型',
  // Vue
  'VUE-001': 'v-for 缺少 :key 绑定',
  'VUE-002': 'Props 应使用对象形式并添加验证',
  'VUE-003': '模板中包含 console 语句',
  // Dart
  'DART-001': '变量声明缺少类型注解',
  'DART-002': '空的 catch 块',
  'DART-003': '使用 .then() 而非 async/await',
  'DART-004': '使用了 print 语句',
  'DART-005': 'build 方法可使用 const 构造函数',
  'DART-006': 'Widget 可声明为 const',
  'DART-007': '函数缺少返回类型注解',
  'DART-008': '使用了忽略注解',
  // 通用
  'GEN-001': '文件过长（超过300行）',
  'GEN-002': '缺少文件头注释',
  'GEN-003': '行过长（超过120字符）',
  'GEN-004': 'TODO 格式不规范',
};

// 规则ID到修复建议的映射
const ruleSuggestions = {
  'JS-001': '移除或替换为适当的日志框架',
  'JS-002': '使用 let 或 const 代替 var',
  'JS-003': '添加 try-catch 或 .catch() 处理错误',
  'JS-004': '为列表中的元素添加唯一的 key 属性',
  'TS-001': '为函数添加返回类型注解',
  'TS-002': '使用具体类型代替 any',
  'VUE-001': '为 v-for 指令添加 :key 属性',
  'VUE-002': '使用对象形式定义 props 并添加类型验证',
  'VUE-003': '从模板中移除 console 语句',
  'DART-001': '考虑使用显式类型注解',
  'DART-002': '在 catch 块中添加错误处理或日志',
  'DART-003': '考虑使用 async/await 提高可读性',
  'DART-004': '移除 print 或使用适当的日志框架',
  'DART-005': '考虑使用 const 构造函数提高性能',
  'DART-006': '考虑使用 const 提高性能',
  'DART-007': '为函数添加返回类型注解',
  'DART-008': '审查是否必须忽略此警告',
  'GEN-001': '考虑将文件拆分为更小的模块',
  'GEN-002': '添加文件头说明和作者信息',
  'GEN-003': '拆分长行以提高可读性',
  'GEN-004': '使用格式：// TODO: [代码ID] 描述',
};

// 分页组件
const Pagination = ({ currentPage, totalPages, onPageChange, totalItems }) => {
  if (totalPages <= 1) return null;

  const pages = [];
  const maxVisiblePages = 5;

  let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
  let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

  if (endPage - startPage < maxVisiblePages - 1) {
    startPage = Math.max(1, endPage - maxVisiblePages + 1);
  }

  for (let i = startPage; i <= endPage; i++) {
    pages.push(i);
  }

  return (
    <div className="flex items-center justify-between px-3 py-2 bg-gray-800 border-t border-gray-700">
      <div className="text-xs text-gray-400">
        共 {totalItems} 项，第 {currentPage} / {totalPages} 页
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors"
        >
          上一页
        </button>
        {startPage > 1 && (
          <>
            <button
              onClick={() => onPageChange(1)}
              className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded transition-colors"
            >
              1
            </button>
            {startPage > 2 && <span className="px-1 text-gray-500">...</span>}
          </>
        )}
        {pages.map(page => (
          <button
            key={page}
            onClick={() => onPageChange(page)}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              currentPage === page
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 hover:bg-gray-600'
            }`}
          >
            {page}
          </button>
        ))}
        {endPage < totalPages && (
          <>
            {endPage < totalPages - 1 && <span className="px-1 text-gray-500">...</span>}
            <button
              onClick={() => onPageChange(totalPages)}
              className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded transition-colors"
            >
              {totalPages}
            </button>
          </>
        )}
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors"
        >
          下一页
        </button>
      </div>
    </div>
  );
};

// 问题过滤器组件
const ProblemFilters = ({ filters, onFilterChange, availableSeverities, availableRules }) => {
  return (
    <div className="p-3 bg-gray-800 border-b border-gray-700 space-y-2">
      <div className="flex flex-wrap gap-2">
        {/* 严重程度过滤 */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-400">严重程度:</span>
          {['error', 'warning', 'info'].map(severity => (
            <button
              key={severity}
              onClick={() => onFilterChange('severity', severity)}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                filters.severity === severity
                  ? severity === 'error' ? 'bg-red-600 text-white' :
                    severity === 'warning' ? 'bg-yellow-600 text-white' :
                    'bg-blue-600 text-white'
                  : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
              }`}
            >
              {severity === 'error' ? '❌' : severity === 'warning' ? '⚠️' : 'ℹ️'}
            </button>
          ))}
          {filters.severity !== 'all' && (
            <button
              onClick={() => onFilterChange('severity', 'all')}
              className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300"
            >
              全部
            </button>
          )}
        </div>

        {/* 每页显示数量 */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-400">每页:</span>
          <select
            value={filters.pageSize}
            onChange={(e) => onFilterChange('pageSize', parseInt(e.target.value))}
            className="text-xs"
          >
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
          </select>
        </div>
      </div>

      {/* 文件名搜索 */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          placeholder="搜索文件名..."
          value={filters.fileName}
          onChange={(e) => onFilterChange('fileName', e.target.value)}
          className="flex-1 px-2 py-1 text-xs bg-gray-700 border border-gray-600 rounded text-gray-300 placeholder-gray-500"
        />
        {filters.fileName && (
          <button
            onClick={() => onFilterChange('fileName', '')}
            className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300"
          >
            清除
          </button>
        )}
      </div>

      {/* 规则ID搜索 */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          placeholder="搜索规则ID (如 JS-001)..."
          value={filters.ruleId}
          onChange={(e) => onFilterChange('ruleId', e.target.value.toUpperCase())}
          className="flex-1 px-2 py-1 text-xs bg-gray-700 border border-gray-600 rounded text-gray-300 placeholder-gray-500"
        />
        {filters.ruleId && (
          <button
            onClick={() => onFilterChange('ruleId', '')}
            className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300"
          >
            清除
          </button>
        )}
      </div>

      {/* 统计信息 */}
      <div className="text-xs text-gray-400 border-t border-gray-700 pt-2">
        筛选结果: <span className="text-white">{filters.filteredCount}</span> 个问题
        {filters.totalCount > filters.filteredCount && (
          <span className="text-gray-500"> (共 {filters.totalCount} 个)</span>
        )}
      </div>
    </div>
  );
};

function RightPanel({ activeTab, onTabChange, problems, todos, dependencies, onAiFixIssue, testCases, dependencyTree, dependencyStats, onProblemClick, onNewTestCase, onRunTestDocument, onEditTestDocument, onDeleteTestDocument, scanResults }) {
  const [localTree, setLocalTree] = useState(null);
  const [expandedNodes, setExpandedNodes] = useState(new Set());
  const [editingDocument, setEditingDocument] = useState(null);
  const [expandedDocuments, setExpandedDocuments] = useState(new Set());

  // 编辑模式状态
  const [expandedModules, setExpandedModules] = useState(new Set());
  const [expandedScenarios, setExpandedScenarios] = useState(new Set());

  // 问题分页和过滤状态
  const [problemFilters, setProblemFilters] = useState({
    severity: 'all',
    fileName: '',
    ruleId: '',
    pageSize: 50,
    currentPage: 1,
  });

  // TODO 分页状态
  const [todoPagination, setTodoPagination] = useState({
    currentPage: 1,
    pageSize: 50,
  });

  useEffect(() => {
    if (dependencyTree) {
      setLocalTree(dependencyTree);
    }
  }, [dependencyTree]);

  // 调试：监听 scanResults 变化
  useEffect(() => {
    console.log('[RightPanel] scanResults changed:', {
      hasScanResults: !!scanResults,
      savedPaths: scanResults?.savedPaths,
      hasAIContext: !!scanResults?.savedPaths?.aiContext,
      hasCodeGraph: !!scanResults?.savedPaths?.codeGraph,
      scanResultsKeys: scanResults ? Object.keys(scanResults) : [],
    });
  }, [scanResults]);

  // 当问题列表变化时，重置到第一页
  useEffect(() => {
    setProblemFilters(prev => ({ ...prev, currentPage: 1 }));
  }, [problems.length]);

  // 过滤问题
  const filteredProblems = useMemo(() => {
    return problems.filter(problem => {
      // 严重程度过滤
      if (problemFilters.severity !== 'all' && problem.severity !== problemFilters.severity) {
        return false;
      }
      // 文件名过滤
      if (problemFilters.fileName) {
        const fileName = problem.filePath?.split(/[/\\]/).pop() || problem.file || '';
        if (!fileName.toLowerCase().includes(problemFilters.fileName.toLowerCase())) {
          return false;
        }
      }
      // 规则ID过滤
      if (problemFilters.ruleId) {
        if (!problem.ruleId?.includes(problemFilters.ruleId)) {
          return false;
        }
      }
      return true;
    });
  }, [problems, problemFilters.severity, problemFilters.fileName, problemFilters.ruleId]);

  // 计算分页
  const problemTotalPages = Math.ceil(filteredProblems.length / problemFilters.pageSize);
  const paginatedProblems = filteredProblems.slice(
    (problemFilters.currentPage - 1) * problemFilters.pageSize,
    problemFilters.currentPage * problemFilters.pageSize
  );

  // TODO 分页
  const todoTotalPages = Math.ceil(todos.length / todoPagination.pageSize);
  const paginatedTodos = todos.slice(
    (todoPagination.currentPage - 1) * todoPagination.pageSize,
    todoPagination.currentPage * todoPagination.pageSize
  );

  const handleToggle = (nodeId) => {
    setExpandedNodes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
      } else {
        newSet.add(nodeId);
      }
      return newSet;
    });
  };

  // 处理过滤器变化
  const handleProblemFilterChange = (type, value) => {
    setProblemFilters(prev => ({
      ...prev,
      [type]: value,
      currentPage: type === 'currentPage' ? value : 1, // 重置到第一页
    }));
  };

  const renderProblems = () => (
    <div className="flex flex-col h-full">
      {/* 过滤器 */}
      <ProblemFilters
        filters={{
          ...problemFilters,
          filteredCount: filteredProblems.length,
          totalCount: problems.length,
        }}
        onFilterChange={handleProblemFilterChange}
      />

      {/* 问题列表 */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {filteredProblems.length === 0 ? (
          <p className="text-gray-500 text-sm">
            {problems.length === 0 ? 'No problems found' : '没有符合筛选条件的问题'}
          </p>
        ) : (
          paginatedProblems.map((problem, index) => {
            const chineseMessage = ruleDescriptions[problem.ruleId] || problem.message;
            const chineseSuggestion = ruleSuggestions[problem.ruleId] || problem.suggestion || '';
            const actualIndex = problems.indexOf(problem);

            return (
              <div
                key={problem.id || actualIndex}
                className={`p-2 rounded-md cursor-pointer transition-all hover:bg-gray-700/50 ${
                  problem.severity === 'error'
                    ? 'bg-red-900/30 border-l-2 border-red-500'
                    : problem.severity === 'warning'
                    ? 'bg-yellow-900/30 border-l-2 border-yellow-500'
                    : 'bg-blue-900/30 border-l-2 border-blue-500'
                }`}
                onClick={() => {
                  if (onProblemClick && problem.filePath && problem.line) {
                    onProblemClick({
                      filePath: problem.filePath,
                      line: problem.line,
                      ruleId: problem.ruleId
                    });
                  }
                }}
                title={`点击跳转到 ${problem.filePath?.split(/[/\\]/).pop()}:${problem.line}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 flex-1">
                    <span className="text-xs flex-shrink-0 mt-0.5">
                      {problem.severity === 'error' ? '❌' : problem.severity === 'warning' ? '⚠️' : 'ℹ️'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white break-words">{chineseMessage}</p>
                      {chineseSuggestion && (
                        <p className="text-xs text-gray-400 mt-1 break-words">💡 {chineseSuggestion}</p>
                      )}
                      <p className="text-xs text-gray-500 mt-1">
                        <span className="bg-gray-700 px-1.5 py-0.5 rounded">{problem.ruleId}</span>
                        {' '}{problem.filePath ? problem.filePath.split(/[/\\]/).pop() : problem.file}:{problem.line}
                      </p>
                    </div>
                  </div>
                  {onAiFixIssue && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onAiFixIssue(problem);
                      }}
                      className="px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs transition-colors flex-shrink-0"
                      title="AI Fix"
                    >
                      🤖 修复
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 分页 */}
      <Pagination
        currentPage={problemFilters.currentPage}
        totalPages={problemTotalPages}
        onPageChange={(page) => handleProblemFilterChange('currentPage', page)}
        totalItems={filteredProblems.length}
      />
    </div>
  );

  const renderTodos = () => (
    <div className="flex flex-col h-full">
      {/* TODO 分页控制 */}
      <div className="p-3 bg-gray-800 border-b border-gray-700 flex items-center justify-between">
        <div className="text-xs text-gray-400">
          共 {todos.length} 个 TODO
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">每页:</span>
          <select
            value={todoPagination.pageSize}
            onChange={(e) => setTodoPagination({ currentPage: 1, pageSize: parseInt(e.target.value) })}
            className="text-xs"
          >
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
          </select>
        </div>
      </div>

      {/* TODO 列表 */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {todos.length === 0 ? (
          <p className="text-gray-500 text-sm">No TODOs found</p>
        ) : (
          paginatedTodos.map((todo) => {
            // 安全处理 description 字段
            const description = todo.description || todo.message || '';
            const descMatch = description ? description.match(/\[([^\]]+)\]\s*(.+)/) : null;
            const ruleId = descMatch ? descMatch[1] : todo.code || todo.ruleId || 'UNKNOWN';
            const desc = descMatch ? descMatch[2] : description;
            const chineseDesc = ruleDescriptions[ruleId] || desc;

            return (
              <div
                key={todo.id}
                className="p-2 bg-gray-800 rounded-md border border-gray-700 hover:border-gray-600 transition-colors cursor-pointer"
                onClick={() => {
                  if (onProblemClick && todo.file && todo.line) {
                    onProblemClick({
                      filePath: todo.file,
                      line: todo.line,
                      ruleId: ruleId
                    });
                  }
                }}
                title={`点击跳转到 ${todo.file?.split(/[/\\]/).pop()}:${todo.line}`}
              >
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={todo.status === 'completed'}
                    className="mt-1"
                    readOnly
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs bg-orange-900 text-orange-300 px-2 py-0.5 rounded">
                        {ruleId}
                      </span>
                    </div>
                    <p className="text-sm mt-1 text-white break-words">{chineseDesc}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {todo.file?.split(/[/\\]/).pop()}:{todo.line}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* TODO 分页 */}
      <Pagination
        currentPage={todoPagination.currentPage}
        totalPages={todoTotalPages}
        onPageChange={(page) => setTodoPagination({ ...todoPagination, currentPage: page })}
        totalItems={todos.length}
      />
    </div>
  );

  const renderReports = () => {
    // 检查是否有可下载的文件
    const hasAIContext = scanResults?.savedPaths?.aiContext;
    const hasCodeGraph = scanResults?.savedPaths?.codeGraph;
    const hasTestContext = scanResults?.savedPaths?.testContext;
    const hasDownloadableFiles = hasAIContext || hasCodeGraph || hasTestContext;

    // 调试日志
    console.log('[RightPanel] renderReports savedPaths:', scanResults?.savedPaths);
    console.log('[RightPanel] hasTestContext:', hasTestContext, 'value:', hasTestContext);

    // 获取项目路径 - 优先从 scanResults 获取
    const projectPath = scanResults?.summary?.projectPath ||
      (problems.length > 0 && problems[0].filePath
        ? problems[0].filePath.split(/[/\\]/).slice(0, -1).join('/')
        : null);

    // 下载处理函数
    const handleDownloadAIContext = async () => {
      try {
        if (!window.electronAPI) {
          alert('electronAPI 不可用');
          return;
        }
        const result = await window.electronAPI.downloadAIContext(projectPath);
        if (result.success) {
          alert(`AI Context 文件已保存到:\n${result.savedPath}`);
        } else if (!result.canceled) {
          alert(`下载失败: ${result.error || '未知错误'}`);
        }
      } catch (error) {
        console.error('下载 AI Context 失败:', error);
        alert(`下载失败: ${error.message}`);
      }
    };

    const handleDownloadCodeGraph = async () => {
      try {
        if (!window.electronAPI) {
          alert('electronAPI 不可用');
          return;
        }
        const result = await window.electronAPI.downloadCodeGraph(projectPath);
        if (result.success) {
          alert(`代码图文件已保存到:\n${result.savedPath}`);
        } else if (!result.canceled) {
          alert(`下载失败: ${result.error || '未知错误'}`);
        }
      } catch (error) {
        console.error('下载代码图失败:', error);
        alert(`下载失败: ${error.message}`);
      }
    };

    const handleDownloadTestContext = async () => {
      try {
        if (!window.electronAPI) {
          alert('electronAPI 不可用');
          return;
        }
        const result = await window.electronAPI.downloadTestContext(projectPath);
        if (result.success) {
          alert(`测试上下文文件已保存到:\n${result.savedPath}`);
        } else if (!result.canceled) {
          alert(`下载失败: ${result.error || '未知错误'}`);
        }
      } catch (error) {
        console.error('下载测试上下文失败:', error);
        alert(`下载失败: ${error.message}`);
      }
    };

    // 调试信息
    console.log('[RightPanel] renderReports:', {
      hasAIContext,
      hasCodeGraph,
      hasTestContext,
      hasDownloadableFiles,
      savedPaths: scanResults?.savedPaths,
      projectPath,
      problemsCount: problems.length,
      scanResultsKeys: scanResults ? Object.keys(scanResults) : 'no scanResults',
    });

    return (
      <div className="h-full overflow-y-auto p-3">
        <div className="space-y-4">
          {/* 下载区域 - 只要有扫描结果就显示 */}
          {(scanResults || problems.length > 0) && projectPath && (
            <div className="bg-gray-800 rounded-lg p-4">
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <span>📥</span>
                <span>下载扫描结果</span>
              </h4>

              {hasDownloadableFiles ? (
                <div className="grid grid-cols-1 gap-2">
                  {hasAIContext && (
                    <button
                      onClick={handleDownloadAIContext}
                      className="flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm text-gray-200 transition-colors text-left"
                    >
                      <span className="text-base">📄</span>
                      <div className="flex-1">
                        <div className="font-medium">AI Context (AI_CONTEXT.md)</div>
                        <div className="text-xs text-gray-400">项目上下文文档，供 AI 参考</div>
                      </div>
                      <span className="text-gray-400">↓</span>
                    </button>
                  )}
                  {hasCodeGraph && (
                    <button
                      onClick={handleDownloadCodeGraph}
                      className="flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm text-gray-200 transition-colors text-left"
                    >
                      <span className="text-base">🕸️</span>
                      <div className="flex-1">
                        <div className="font-medium">代码图 (.code-graph.json)</div>
                        <div className="text-xs text-gray-400">代码结构和依赖关系</div>
                      </div>
                      <span className="text-gray-400">↓</span>
                    </button>
                  )}
                  {hasTestContext && (
                    <button
                      onClick={handleDownloadTestContext}
                      className="flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm text-gray-200 transition-colors text-left"
                    >
                      <span className="text-base">🧪</span>
                      <div className="flex-1">
                        <div className="font-medium">测试上下文 (TEST_CONTEXT.json)</div>
                        <div className="text-xs text-gray-400">AI 提炼的测试上下文，用于生成测试用例</div>
                      </div>
                      <span className="text-gray-400">↓</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-sm text-yellow-400 p-2 bg-yellow-900/20 rounded border border-yellow-700/30 flex items-start gap-2">
                    <span>ℹ️</span>
                    <div>
                      <div className="font-medium">当前扫描未生成完整文件</div>
                      <div className="text-xs text-gray-400 mt-1">
                        点击下方按钮尝试下载历史生成的文件
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-2">
                    <button
                      onClick={handleDownloadAIContext}
                      className="flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm text-gray-200 transition-colors text-left opacity-80 hover:opacity-100"
                    >
                      <span className="text-base">📄</span>
                      <div className="flex-1">
                        <div className="font-medium">下载 AI Context (历史文件)</div>
                        <div className="text-xs text-gray-400">尝试获取之前生成的项目文档</div>
                      </div>
                      <span className="text-gray-400">↓</span>
                    </button>

                    <button
                      onClick={handleDownloadCodeGraph}
                      className="flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm text-gray-200 transition-colors text-left opacity-80 hover:opacity-100"
                    >
                      <span className="text-base">🕸️</span>
                      <div className="flex-1">
                        <div className="font-medium">下载代码图 (历史文件)</div>
                        <div className="text-xs text-gray-400">尝试获取之前生成的代码结构</div>
                      </div>
                      <span className="text-gray-400">↓</span>
                    </button>
                  </div>

                  <div className="text-xs text-gray-500 text-center">
                    💡 提示：使用 "AST 扫描" 可生成完整的项目文档和代码图
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 代码质量评分 */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h4 className="text-sm font-semibold mb-2">Code Quality Score</h4>
            <div className="flex items-center gap-3">
              <div className="text-3xl font-bold text-green-400">85</div>
              <div className="text-sm text-gray-400">
                <p>Good</p>
                <p className="text-xs">+5 from last scan</p>
              </div>
            </div>
          </div>

          {/* 问题统计 */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h4 className="text-sm font-semibold mb-2">Issues Summary</h4>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-red-400">Errors</span>
                <span>{problems.filter(p => p.severity === 'error').length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-yellow-400">Warnings</span>
                <span>{problems.filter(p => p.severity === 'warning').length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-blue-400">Info</span>
                <span>{problems.filter(p => p.severity === 'info').length}</span>
              </div>
            </div>
          </div>

          {/* 扫描文件统计 */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h4 className="text-sm font-semibold mb-2">Files Scanned</h4>
            <div className="text-2xl font-bold text-white">
              {new Set(problems.map(p => p.filePath || p.file)).size}
            </div>
          </div>

          {/* AST 统计信息 */}
          {scanResults?.astStats && (
            <div className="bg-gray-800 rounded-lg p-4">
              <h4 className="text-sm font-semibold mb-2">AST 分析统计</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="text-gray-400">解析文件数:</div>
                <div className="text-white text-right">{scanResults.astStats.filesParsed || 0}</div>
                <div className="text-gray-400">函数总数:</div>
                <div className="text-white text-right">{scanResults.astStats.totalFunctions || 0}</div>
                <div className="text-gray-400">类总数:</div>
                <div className="text-white text-right">{scanResults.astStats.totalClasses || 0}</div>
                <div className="text-gray-400">API 调用:</div>
                <div className="text-white text-right">{scanResults.astStats.totalApiCalls || 0}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderAIPreview = () => (
    <div className="p-3">
      <div className="bg-gray-800 rounded-lg p-4">
        <h4 className="text-sm font-semibold mb-2">AI Fix Preview</h4>
        <p className="text-sm text-gray-400">Select an issue and click "🤖 修复" to see AI-generated fix suggestions.</p>
      </div>
    </div>
  );

  const renderTests = () => {
    // 处理编辑模式 - 结构化表单
    if (editingDocument) {
      // 添加调试日志
      console.log('[RightPanel] 编辑文档:', {
        projectName: editingDocument.projectName,
        hasTestPlan: !!editingDocument.testPlan,
        modulesCount: editingDocument.testPlan?.modules?.length || 0,
        testPlan: editingDocument.testPlan
      });

      // 初始化展开所有模块和场景（在首次渲染时）
      if (expandedModules.size === 0 && editingDocument.testPlan?.modules) {
        const newModules = new Set(editingDocument.testPlan.modules.map((_, i) => i));
        const newScenarios = new Set();
        editingDocument.testPlan.modules.forEach((mod, mIdx) => {
          if (mod.scenarios) {
            mod.scenarios.forEach((_, sIdx) => newScenarios.add(`${mIdx}-${sIdx}`));
          }
        });
        setExpandedModules(newModules);
        setExpandedScenarios(newScenarios);
        console.log('[RightPanel] 展开模块和场景:', {
          modules: Array.from(newModules),
          scenarios: Array.from(newScenarios)
        });
      }

      // 定义 cancelEdit 函数（需要在渲染之前定义）
      const cancelEdit = () => {
        setEditingDocument(null);
        setExpandedModules(new Set());
        setExpandedScenarios(new Set());
      };

      // 如果没有 testPlan，显示警告
      if (!editingDocument.testPlan || !editingDocument.testPlan.modules) {
        console.warn('[RightPanel] 编辑文档缺少 testPlan 数据，可能需要重启 Electron 主进程');
        return (
          <div className="flex flex-col h-full">
            <div className="p-3 bg-gray-800 border-b border-gray-700 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">编辑测试文档 - {editingDocument.projectName}</h3>
              <button
                onClick={cancelEdit}
                className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300"
              >
                ✕ 取消
              </button>
            </div>
            <div className="flex-1 flex items-center justify-center p-6">
              <div className="text-center">
                <p className="text-yellow-400 mb-2">⚠️ 测试计划数据不完整</p>
                <p className="text-xs text-gray-400">请重启应用后重试，或重新生成测试用例</p>
              </div>
            </div>
          </div>
        );
      }

      const toggleModule = (idx) => {
        setExpandedModules(prev => {
          const newSet = new Set(prev);
          if (newSet.has(idx)) {
            newSet.delete(idx);
          } else {
            newSet.add(idx);
          }
          return newSet;
        });
      };

      const toggleScenario = (key) => {
        setExpandedScenarios(prev => {
          const newSet = new Set(prev);
          if (newSet.has(key)) {
            newSet.delete(key);
          } else {
            newSet.add(key);
          }
          return newSet;
        });
      };

      const updateModule = (mIdx, field, value) => {
        const updated = JSON.parse(JSON.stringify(editingDocument));
        updated.testPlan.modules[mIdx][field] = value;
        setEditingDocument(updated);
      };

      const updateScenario = (mIdx, sIdx, field, value) => {
        console.log(`[RightPanel] ========== updateScenario 开始 ==========`);
        console.log(`[RightPanel] 参数 - mIdx: ${mIdx}, sIdx: ${sIdx}, field: ${field}, value: ${value}`);
        console.log(`[RightPanel] 更新前完整 scenario:`, JSON.stringify(editingDocument.testPlan.modules[mIdx].scenarios[sIdx], null, 2));

        // 使用 JSON 方法进行深拷贝，确保不修改原始数据
        const updated = JSON.parse(JSON.stringify(editingDocument));
        const scenario = updated.testPlan.modules[mIdx].scenarios[sIdx];

        console.log(`[RightPanel] 深拷贝后 scenario:`, JSON.stringify(scenario, null, 2));

        // 检查是否使用 steps 数组格式
        const usesStepsFormat = scenario.steps && Array.isArray(scenario.steps);
        console.log(`[RightPanel] usesStepsFormat: ${usesStepsFormat}`);
        if (usesStepsFormat) {
          console.log(`[RightPanel] steps 数组:`, JSON.stringify(scenario.steps, null, 2));
        }
        console.log(`[RightPanel] scenario.given:`, JSON.stringify(scenario.given, null, 2));
        console.log(`[RightPanel] scenario.when:`, JSON.stringify(scenario.when, null, 2));
        console.log(`[RightPanel] scenario.then:`, JSON.stringify(scenario.then, null, 2));

        // 辅助函数：从 steps 数组同步所有直接属性
        // 注意：由于 normalizedScenario 现在总是从 steps 重建，这个函数主要用于调试
        const syncDirectPropertiesFromSteps = () => {
          console.log(`[RightPanel] === syncDirectPropertiesFromSteps 开始 ===`);
          if (!usesStepsFormat) {
            console.log(`[RightPanel] 不是 steps 格式，跳过同步`);
            return;
          }

          // 清除旧的直接属性，让 normalizedScenario 重新从 steps 读取
          delete scenario.given;
          delete scenario.when;
          delete scenario.then;

          console.log(`[RightPanel] 清除直接属性，将依赖 normalizedScenario 从 steps 重建`);
          console.log(`[RightPanel] 当前 steps:`, JSON.stringify(scenario.steps, null, 2));
          console.log(`[RightPanel] === syncDirectPropertiesFromSteps 结束 ===`);
        };

        // 根据字段类型进行特殊处理
        if (field === 'given') {
          console.log(`[RightPanel] 处理 given 字段`);
          if (usesStepsFormat) {
            // 更新 steps 数组中的 given 步骤
            const givenStepIndex = scenario.steps.findIndex(s => s.type === 'given');
            console.log(`[RightPanel] givenStepIndex: ${givenStepIndex}`);
            if (givenStepIndex >= 0) {
              scenario.steps[givenStepIndex] = {
                ...scenario.steps[givenStepIndex],
                text: value,
                description: value,
                action: value
              };
              console.log(`[RightPanel] 更新后 steps[${givenStepIndex}]:`, JSON.stringify(scenario.steps[givenStepIndex], null, 2));
            }
            // 同步所有直接属性
            syncDirectPropertiesFromSteps();
          } else {
            // 使用直接属性格式
            const currentGiven = scenario.given || {};
            scenario.given = {
              ...currentGiven,
              text: value,
              description: value
            };
          }
        } else if (field === 'when') {
          console.log(`[RightPanel] 处理 when 字段`);
          if (usesStepsFormat) {
            // 更新 steps 数组中的 when 步骤
            const whenStepIndex = scenario.steps.findIndex(s => s.type === 'when');
            console.log(`[RightPanel] whenStepIndex: ${whenStepIndex}`);
            console.log(`[RightPanel] 更新前 steps:`, JSON.stringify(scenario.steps, null, 2));
            if (whenStepIndex >= 0) {
              scenario.steps[whenStepIndex] = {
                ...scenario.steps[whenStepIndex],
                text: value,
                description: value,
                action: value
              };
              console.log(`[RightPanel] 更新后 steps[${whenStepIndex}]:`, JSON.stringify(scenario.steps[whenStepIndex], null, 2));
            }
            console.log(`[RightPanel] 调用 syncDirectPropertiesFromSteps 前 steps:`, JSON.stringify(scenario.steps, null, 2));
            // 同步所有直接属性
            syncDirectPropertiesFromSteps();
            console.log(`[RightPanel] 调用 syncDirectPropertiesFromSteps 后 steps:`, JSON.stringify(scenario.steps, null, 2));
          } else {
            // 使用直接属性格式 - 保留所有现有属性，包括 actions
            const currentWhen = scenario.when || {};
            console.log(`[RightPanel] currentWhen:`, JSON.stringify(currentWhen, null, 2));
            scenario.when = {
              ...currentWhen,
              text: value,
              description: value
            };
            // 如果原本有 actions，确保保留
            if (currentWhen.actions) {
              scenario.when.actions = currentWhen.actions;
            }
          }
        } else if (field === 'then') {
          console.log(`[RightPanel] 处理 then 字段`);
          if (usesStepsFormat) {
            // 更新 steps 数组中的 then 步骤
            const thenStepIndex = scenario.steps.findIndex(s => s.type === 'then');
            console.log(`[RightPanel] thenStepIndex: ${thenStepIndex}`);
            if (thenStepIndex >= 0) {
              scenario.steps[thenStepIndex] = {
                ...scenario.steps[thenStepIndex],
                text: value,
                description: value,
                action: value
              };
              console.log(`[RightPanel] 更新后 steps[${thenStepIndex}]:`, JSON.stringify(scenario.steps[thenStepIndex], null, 2));
            }
            // 同步所有直接属性
            syncDirectPropertiesFromSteps();
          } else {
            // 使用直接属性格式 - 保留所有现有属性，包括 verifications
            const currentThen = scenario.then || {};
            scenario.then = {
              ...currentThen,
              text: value,
              description: value
            };
            // 如果原本有 verifications，确保保留
            if (currentThen.verifications) {
              scenario.then.verifications = currentThen.verifications;
            }
          }
        } else {
          scenario[field] = value;
        }

        console.log(`[RightPanel] 更新后完整 scenario:`, JSON.stringify(scenario, null, 2));
        setEditingDocument(updated);
        console.log(`[RightPanel] ========== updateScenario 结束 ==========`);
      };

      const saveEditedDocument = () => {
        if (onEditTestDocument) {
          onEditTestDocument(editingDocument.projectPath, editingDocument);
        }
        setEditingDocument(null);
        setExpandedModules(new Set());
        setExpandedScenarios(new Set());
      };

      // 删除场景
      const deleteScenario = (mIdx, sIdx) => {
        console.log('[RightPanel] deleteScenario called with mIdx:', mIdx, 'sIdx:', sIdx);
        const scenarioName = editingDocument.testPlan.modules[mIdx].scenarios[sIdx]?.name || '未知';
        if (!window.confirm(`确定要删除测试用例 "${scenarioName}" 吗？`)) {
          console.log('[RightPanel] 用户取消删除');
          return;
        }
        console.log('[RightPanel] 用户确认删除');
        const updated = JSON.parse(JSON.stringify(editingDocument));
        updated.testPlan.modules[mIdx].scenarios = updated.testPlan.modules[mIdx].scenarios.filter((_, idx) => idx !== sIdx);
        setEditingDocument(updated);

        // 更新展开的场景集合
        const newScenarios = new Set();
        updated.testPlan.modules.forEach((mod, modIdx) => {
          if (mod.scenarios) {
            mod.scenarios.forEach((_, scnIdx) => newScenarios.add(`${modIdx}-${scnIdx}`));
          }
        });
        setExpandedScenarios(newScenarios);
        console.log('[RightPanel] 删除完成，剩余场景数:', updated.testPlan.modules[mIdx].scenarios.length);
      };

      // 上移场景
      const moveScenarioUp = (mIdx, sIdx) => {
        if (sIdx === 0) return;
        const updated = JSON.parse(JSON.stringify(editingDocument));
        const scenarios = updated.testPlan.modules[mIdx].scenarios;
        [scenarios[sIdx - 1], scenarios[sIdx]] = [scenarios[sIdx], scenarios[sIdx - 1]];
        setEditingDocument(updated);

        // 更新展开的场景集合
        const newScenarios = new Set();
        updated.testPlan.modules.forEach((mod, modIdx) => {
          if (mod.scenarios) {
            mod.scenarios.forEach((_, scnIdx) => newScenarios.add(`${modIdx}-${scnIdx}`));
          }
        });
        setExpandedScenarios(newScenarios);
      };

      // 下移场景
      const moveScenarioDown = (mIdx, sIdx) => {
        const updated = JSON.parse(JSON.stringify(editingDocument));
        const scenarios = updated.testPlan.modules[mIdx].scenarios;
        if (sIdx >= scenarios.length - 1) return;
        [scenarios[sIdx], scenarios[sIdx + 1]] = [scenarios[sIdx + 1], scenarios[sIdx]];
        setEditingDocument(updated);

        // 更新展开的场景集合
        const newScenarios = new Set();
        updated.testPlan.modules.forEach((mod, modIdx) => {
          if (mod.scenarios) {
            mod.scenarios.forEach((_, scnIdx) => newScenarios.add(`${modIdx}-${scnIdx}`));
          }
        });
        setExpandedScenarios(newScenarios);
      };

      // 添加新场景
      const addNewScenario = (mIdx) => {
        const updated = JSON.parse(JSON.stringify(editingDocument));
        const module = updated.testPlan.modules[mIdx];

        // 生成新的用例ID
        const existingIds = module.scenarios?.map(s => s.id) || [];
        const maxId = existingIds.reduce((max, id) => {
          const num = parseInt(id.replace(/\D/g, '')) || 0;
          return Math.max(max, num);
        }, 0);
        const newId = `TC${String(maxId + 1).padStart(3, '0')}`;

        const newScenario = {
          id: newId,
          name: `新测试用例 ${newId}`,
          given: { text: '描述前置条件...', description: '描述前置条件...' },
          when: {
            text: '描述执行步骤...',
            description: '描述执行步骤...',
            actions: [
              { description: '步骤1：...', action: '步骤1：...' }
            ]
          },
          then: {
            text: '描述预期结果...',
            description: '描述预期结果...',
            verifications: [
              { description: '验证：...', expected: '验证：...' }
            ]
          },
          steps: [
            { type: 'given', text: '描述前置条件...', description: '描述前置条件...', action: '描述前置条件...' },
            { type: 'when', text: '描述执行步骤...', description: '描述执行步骤...', action: '描述执行步骤...' },
            { type: 'then', text: '描述预期结果...', description: '描述预期结果...', action: '描述预期结果...' }
          ]
        };

        if (!module.scenarios) {
          module.scenarios = [];
        }
        module.scenarios.push(newScenario);
        setEditingDocument(updated);

        // 展开新添加的场景
        const newScenarios = new Set(expandedScenarios);
        newScenarios.add(`${mIdx}-${module.scenarios.length - 1}`);
        setExpandedScenarios(newScenarios);
      };

      // 添加多个新场景
      const addMultipleScenarios = (mIdx, count) => {
        for (let i = 0; i < count; i++) {
          addNewScenario(mIdx);
        }
      };

      // 更新执行步骤（actions数组）
      const updateWhenAction = (mIdx, sIdx, actionIdx, field, value) => {
        const updated = JSON.parse(JSON.stringify(editingDocument));
        const scenario = updated.testPlan.modules[mIdx].scenarios[sIdx];

        // 检查是否使用 steps 数组格式
        const usesStepsFormat = scenario.steps && Array.isArray(scenario.steps);

        if (usesStepsFormat) {
          // 从 steps 数组中找到 when 步骤并更新其 actions 数组
          const whenStepIndex = scenario.steps.findIndex(s => s.type === 'when');
          if (whenStepIndex >= 0) {
            // 确保 actions 数组存在
            if (!scenario.steps[whenStepIndex].actions) {
              scenario.steps[whenStepIndex].actions = [];
            }
            // 更新指定索引的 action
            scenario.steps[whenStepIndex].actions[actionIdx] = {
              ...(scenario.steps[whenStepIndex].actions[actionIdx] || {}),
              [field]: value
            };
            // 清除直接属性，让 normalizedScenario 从 steps 重建
            delete scenario.given;
            delete scenario.when;
            delete scenario.then;
            console.log(`[RightPanel] updateWhenAction: 从 steps 数组更新 when.actions[${actionIdx}]`);
          }
        } else {
          // 使用直接属性格式
          // 确保 when 是对象
          if (!scenario.when || typeof scenario.when !== 'object') {
            scenario.when = {};
          }
          // 确保 actions 数组存在
          if (!scenario.when.actions || !Array.isArray(scenario.when.actions)) {
            scenario.when.actions = [];
          }
          // 更新指定索引的 action
          scenario.when.actions[actionIdx] = {
            ...(scenario.when.actions[actionIdx] || {}),
            [field]: value
          };
          console.log(`[RightPanel] updateWhenAction: 从直接属性更新 when.actions[${actionIdx}]`);
        }

        setEditingDocument(updated);
        console.log(`[RightPanel] updateWhenAction: actionIdx=${actionIdx}, field=${field}, value=${value}`);
      };

      // 添加新的执行步骤
      const addWhenAction = (mIdx, sIdx) => {
        const updated = JSON.parse(JSON.stringify(editingDocument));
        const scenario = updated.testPlan.modules[mIdx].scenarios[sIdx];

        // 检查是否使用 steps 数组格式
        const usesStepsFormat = scenario.steps && Array.isArray(scenario.steps);

        if (usesStepsFormat) {
          // 从 steps 数组中找到 when 步骤并添加 action
          const whenStepIndex = scenario.steps.findIndex(s => s.type === 'when');
          if (whenStepIndex >= 0) {
            // 确保 actions 数组存在
            if (!scenario.steps[whenStepIndex].actions) {
              scenario.steps[whenStepIndex].actions = [];
            }
            scenario.steps[whenStepIndex].actions.push({
              description: `新步骤 ${scenario.steps[whenStepIndex].actions.length + 1}`,
              action: `新步骤 ${scenario.steps[whenStepIndex].actions.length + 1}`
            });
            // 清除直接属性，让 normalizedScenario 从 steps 重建
            delete scenario.given;
            delete scenario.when;
            delete scenario.then;
            console.log(`[RightPanel] addWhenAction: 从 steps 数组添加，actions数量=`, scenario.steps[whenStepIndex].actions.length);
          }
        } else {
          // 使用直接属性格式
          // 确保 when 是对象
          if (!scenario.when || typeof scenario.when !== 'object') {
            scenario.when = {};
          }
          // 确保 actions 数组存在
          if (!scenario.when.actions || !Array.isArray(scenario.when.actions)) {
            scenario.when.actions = [];
          }
          scenario.when.actions.push({
            description: `新步骤 ${scenario.when.actions.length + 1}`,
            action: `新步骤 ${scenario.when.actions.length + 1}`
          });
          console.log(`[RightPanel] addWhenAction: 从直接属性添加，actions数量=`, scenario.when.actions.length);
        }

        setEditingDocument(updated);
      };

      // 删除执行步骤
      const deleteWhenAction = (mIdx, sIdx, actionIdx) => {
        console.log(`[RightPanel] deleteWhenAction called: mIdx=${mIdx}, sIdx=${sIdx}, actionIdx=${actionIdx}`);
        const updated = JSON.parse(JSON.stringify(editingDocument));
        const scenario = updated.testPlan.modules[mIdx].scenarios[sIdx];

        // 检查是否使用 steps 数组格式
        const usesStepsFormat = scenario.steps && Array.isArray(scenario.steps);

        let action;
        if (usesStepsFormat) {
          // 从 steps 数组中找到 when 步骤
          const whenStepIndex = scenario.steps.findIndex(s => s.type === 'when');
          if (whenStepIndex >= 0 && scenario.steps[whenStepIndex].actions) {
            action = scenario.steps[whenStepIndex].actions[actionIdx];
          }
        } else {
          action = scenario.when?.actions?.[actionIdx];
        }

        if (action && !window.confirm(`确定要删除步骤 "${action.description || action.text || ''}" 吗？`)) {
          console.log(`[RightPanel] 用户取消删除步骤`);
          return;
        }

        if (usesStepsFormat) {
          // 从 steps 数组中找到 when 步骤并删除 action
          const whenStepIndex = scenario.steps.findIndex(s => s.type === 'when');
          if (whenStepIndex >= 0 && scenario.steps[whenStepIndex].actions) {
            scenario.steps[whenStepIndex].actions = scenario.steps[whenStepIndex].actions.filter((_, idx) => idx !== actionIdx);
            // 清除直接属性，让 normalizedScenario 从 steps 重建
            delete scenario.given;
            delete scenario.when;
            delete scenario.then;
            console.log(`[RightPanel] deleteWhenAction: 从 steps 数组删除`);
          }
        } else {
          // 使用直接属性格式
          if (scenario.when && scenario.when.actions) {
            scenario.when.actions = scenario.when.actions.filter((_, idx) => idx !== actionIdx);
            console.log(`[RightPanel] deleteWhenAction: 从直接属性删除`);
          }
        }

        setEditingDocument(updated);
        console.log(`[RightPanel] deleteWhenAction: actionIdx=${actionIdx}, 完成`);
      };

      // 更新验证步骤（verifications数组）
      const updateThenVerification = (mIdx, sIdx, vIdx, field, value) => {
        const updated = JSON.parse(JSON.stringify(editingDocument));
        const scenario = updated.testPlan.modules[mIdx].scenarios[sIdx];

        // 检查是否使用 steps 数组格式
        const usesStepsFormat = scenario.steps && Array.isArray(scenario.steps);

        if (usesStepsFormat) {
          // 从 steps 数组中找到 then 步骤并更新其 verifications 数组
          const thenStepIndex = scenario.steps.findIndex(s => s.type === 'then');
          if (thenStepIndex >= 0) {
            // 确保 verifications 数组存在
            if (!scenario.steps[thenStepIndex].verifications) {
              scenario.steps[thenStepIndex].verifications = [];
            }
            // 更新指定索引的 verification
            scenario.steps[thenStepIndex].verifications[vIdx] = {
              ...(scenario.steps[thenStepIndex].verifications[vIdx] || {}),
              [field]: value
            };
            // 清除直接属性，让 normalizedScenario 从 steps 重建
            delete scenario.given;
            delete scenario.when;
            delete scenario.then;
            console.log(`[RightPanel] updateThenVerification: 从 steps 数组更新 then.verifications[${vIdx}]`);
          }
        } else {
          // 使用直接属性格式
          // 确保 then 是对象
          if (!scenario.then || typeof scenario.then !== 'object') {
            scenario.then = {};
          }
          // 确保 verifications 数组存在
          if (!scenario.then.verifications || !Array.isArray(scenario.then.verifications)) {
            scenario.then.verifications = [];
          }
          // 更新指定索引的 verification
          scenario.then.verifications[vIdx] = {
            ...(scenario.then.verifications[vIdx] || {}),
            [field]: value
          };
          console.log(`[RightPanel] updateThenVerification: 从直接属性更新 then.verifications[${vIdx}]`);
        }

        setEditingDocument(updated);
        console.log(`[RightPanel] updateThenVerification: vIdx=${vIdx}, field=${field}, value=${value}`);
      };

      // 添加新的验证步骤
      const addThenVerification = (mIdx, sIdx) => {
        const updated = JSON.parse(JSON.stringify(editingDocument));
        const scenario = updated.testPlan.modules[mIdx].scenarios[sIdx];

        // 检查是否使用 steps 数组格式
        const usesStepsFormat = scenario.steps && Array.isArray(scenario.steps);

        if (usesStepsFormat) {
          // 从 steps 数组中找到 then 步骤并添加 verification
          const thenStepIndex = scenario.steps.findIndex(s => s.type === 'then');
          if (thenStepIndex >= 0) {
            // 确保 verifications 数组存在
            if (!scenario.steps[thenStepIndex].verifications) {
              scenario.steps[thenStepIndex].verifications = [];
            }
            scenario.steps[thenStepIndex].verifications.push({
              description: `新验证 ${scenario.steps[thenStepIndex].verifications.length + 1}`,
              expected: `新验证 ${scenario.steps[thenStepIndex].verifications.length + 1}`
            });
            // 清除直接属性，让 normalizedScenario 从 steps 重建
            delete scenario.given;
            delete scenario.when;
            delete scenario.then;
            console.log(`[RightPanel] addThenVerification: 从 steps 数组添加，verifications数量=`, scenario.steps[thenStepIndex].verifications.length);
          }
        } else {
          // 使用直接属性格式
          // 确保 then 是对象
          if (!scenario.then || typeof scenario.then !== 'object') {
            scenario.then = {};
          }
          // 确保 verifications 数组存在
          if (!scenario.then.verifications || !Array.isArray(scenario.then.verifications)) {
            scenario.then.verifications = [];
          }
          scenario.then.verifications.push({
            description: `新验证 ${scenario.then.verifications.length + 1}`,
            expected: `新验证 ${scenario.then.verifications.length + 1}`
          });
          console.log(`[RightPanel] addThenVerification: 从直接属性添加，verifications数量=`, scenario.then.verifications.length);
        }

        setEditingDocument(updated);
      };

      // 删除验证步骤
      const deleteThenVerification = (mIdx, sIdx, vIdx) => {
        console.log(`[RightPanel] deleteThenVerification called: mIdx=${mIdx}, sIdx=${sIdx}, vIdx=${vIdx}`);
        const updated = JSON.parse(JSON.stringify(editingDocument));
        const scenario = updated.testPlan.modules[mIdx].scenarios[sIdx];

        // 检查是否使用 steps 数组格式
        const usesStepsFormat = scenario.steps && Array.isArray(scenario.steps);

        let verification;
        if (usesStepsFormat) {
          // 从 steps 数组中找到 then 步骤
          const thenStepIndex = scenario.steps.findIndex(s => s.type === 'then');
          if (thenStepIndex >= 0 && scenario.steps[thenStepIndex].verifications) {
            verification = scenario.steps[thenStepIndex].verifications[vIdx];
          }
        } else {
          verification = scenario.then?.verifications?.[vIdx];
        }

        if (verification && !window.confirm(`确定要删除验证 "${verification.description || verification.text || ''}" 吗？`)) {
          console.log(`[RightPanel] 用户取消删除验证`);
          return;
        }

        if (usesStepsFormat) {
          // 从 steps 数组中找到 then 步骤并删除 verification
          const thenStepIndex = scenario.steps.findIndex(s => s.type === 'then');
          if (thenStepIndex >= 0 && scenario.steps[thenStepIndex].verifications) {
            scenario.steps[thenStepIndex].verifications = scenario.steps[thenStepIndex].verifications.filter((_, idx) => idx !== vIdx);
            // 清除直接属性，让 normalizedScenario 从 steps 重建
            delete scenario.given;
            delete scenario.when;
            delete scenario.then;
            console.log(`[RightPanel] deleteThenVerification: 从 steps 数组删除`);
          }
        } else {
          // 使用直接属性格式
          if (scenario.then && scenario.then.verifications) {
            scenario.then.verifications = scenario.then.verifications.filter((_, idx) => idx !== vIdx);
            console.log(`[RightPanel] deleteThenVerification: 从直接属性删除`);
          }
        }

        setEditingDocument(updated);
        console.log(`[RightPanel] deleteThenVerification: vIdx=${vIdx}, 完成`);
      };

      return (
        <div className="flex flex-col h-full">
          <div className="p-3 bg-gray-800 border-b border-gray-700 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">编辑测试文档 - {editingDocument.projectName}</h3>
            <button
              onClick={cancelEdit}
              className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300"
            >
              ✕ 取消
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {editingDocument.testPlan?.modules?.map((module, mIdx) => (
              <div key={mIdx} className="mb-4 bg-gray-800 rounded-lg overflow-hidden">
                {/* 模块头部 */}
                <div
                  className="p-3 bg-gray-700 cursor-pointer flex items-center justify-between"
                  onClick={() => toggleModule(mIdx)}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-white">{expandedModules.has(mIdx) ? '▼' : '▶'}</span>
                    <input
                      type="text"
                      value={module.module}
                      onChange={(e) => {
                        e.stopPropagation();
                        updateModule(mIdx, 'module', e.target.value);
                      }}
                      className="bg-transparent text-sm font-medium text-white border-b border-gray-600 focus:border-blue-500 outline-none"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <select
                      value={module.priority || 'Medium'}
                      onChange={(e) => {
                        e.stopPropagation();
                        updateModule(mIdx, 'priority', e.target.value);
                      }}
                      className="text-xs"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <option value="High">High</option>
                      <option value="Medium">Medium</option>
                      <option value="Low">Low</option>
                    </select>
                  </div>
                  <span className="text-xs text-gray-400">{module.scenarios?.length || 0} 个用例</span>
                </div>

                {/* 场景列表 */}
                {expandedModules.has(mIdx) && (
                  <div className="p-2">
                    {module.scenarios?.map((scenario, sIdx) => {
                      const scenarioKey = `${mIdx}-${sIdx}`;
                      const isExpanded = expandedScenarios.has(scenarioKey);

                      // 规范化场景数据 - 总是从 steps 数组重建，确保数据一致性
                      const normalizedScenario = (() => {
                        console.log(`[RightPanel] === normalizedScenario 计算 ${scenario.id} ===`);

                        // 如果有 steps 数组，总是从 steps 重建直接属性（确保数据一致性）
                        if (scenario.steps && Array.isArray(scenario.steps) && scenario.steps.length > 0) {
                          const normalized = { ...scenario };
                          // 清除旧的直接属性，完全从 steps 重建
                          delete normalized.given;
                          delete normalized.when;
                          delete normalized.then;

                          scenario.steps.forEach((step) => {
                            if (step.type === 'given') {
                              normalized.given = step;
                            } else if (step.type === 'when') {
                              normalized.when = step;
                            } else if (step.type === 'then') {
                              normalized.then = step;
                            }
                          });

                          console.log(`[RightPanel] 从 steps 重建 - given:`, !!normalized.given, `when:`, !!normalized.when, `then:`, !!normalized.then);
                          return normalized;
                        }

                        // 如果没有 steps 数组，使用直接属性格式
                        console.log(`[RightPanel] 使用直接属性 - given:`, !!scenario.given, `when:`, !!scenario.when, `then:`, !!scenario.then);
                        return scenario;
                      })();

                      // 调试日志
                      console.log(`[RightPanel] 场景 ${scenario.id}:`, {
                        original: scenario,
                        normalized: normalizedScenario,
                        given: normalizedScenario.given,
                        when: normalizedScenario.when,
                        then: normalizedScenario.then,
                        givenType: typeof normalizedScenario.given,
                        whenType: typeof normalizedScenario.when,
                        thenType: typeof normalizedScenario.then
                      });

                      // 辅助函数：提取 given 的文本值
                      const getGivenText = () => {
                        const given = normalizedScenario.given;
                        console.log(`[RightPanel] getGivenText - given:`, JSON.stringify(given, null, 2));
                        if (!given) return '';
                        if (typeof given === 'string') return given;
                        if (typeof given === 'object') {
                          const result = given.text || given.description || given.value || given.action || '';
                          console.log(`[RightPanel] getGivenText - result: "${result}"`);
                          return result;
                        }
                        return '';
                      };

                      // 辅助函数：提取 when 的文本值
                      const getWhenText = () => {
                        const when = normalizedScenario.when;
                        console.log(`[RightPanel] getWhenText - when:`, JSON.stringify(when, null, 2));
                        if (!when) return '';
                        if (typeof when === 'string') return when;
                        if (typeof when === 'object') {
                          const result = when.text || when.description || when.value || when.action || '';
                          console.log(`[RightPanel] getWhenText - result: "${result}"`);
                          return result;
                        }
                        return '';
                      };

                      // 辅助函数：提取 then 的文本值
                      const getThenText = () => {
                        const then = normalizedScenario.then;
                        console.log(`[RightPanel] getThenText - then:`, JSON.stringify(then, null, 2));
                        if (!then) return '';
                        if (typeof then === 'string') return then;
                        if (typeof then === 'object') {
                          const result = then.text || then.description || then.value || then.action || '';
                          console.log(`[RightPanel] getThenText - result: "${result}"`);
                          return result;
                        }
                        return '';
                      };

                      // 辅助函数：获取 when 的 actions 数组
                      const getWhenActions = () => {
                        const when = normalizedScenario.when;
                        if (!when) return [];
                        if (when.actions && Array.isArray(when.actions) && when.actions.length > 0) {
                          return when.actions;
                        }
                        if (when.steps && Array.isArray(when.steps) && when.steps.length > 0) {
                          return when.steps;
                        }
                        // 如果 when 是一个简单的步骤对象（有 text/description），将其作为单元素数组返回
                        if (when.text || when.description) {
                          return [when];
                        }
                        return [];
                      };

                      // 辅助函数：获取 then 的 verifications 数组
                      const getThenVerifications = () => {
                        const then = normalizedScenario.then;
                        if (!then) return [];
                        if (then.verifications && Array.isArray(then.verifications) && then.verifications.length > 0) {
                          return then.verifications;
                        }
                        // 如果 then 是一个简单的步骤对象（有 text/description），将其作为单元素数组返回
                        if (then.text || then.description) {
                          return [then];
                        }
                        return [];
                      };

                      return (
                        <div key={sIdx} className="mb-2 bg-gray-900 rounded overflow-hidden">
                          {/* 场景头部 */}
                          <div
                            className="p-2 bg-gray-800 cursor-pointer flex items-center justify-between"
                            onClick={() => toggleScenario(scenarioKey)}
                          >
                            <div className="flex items-center gap-2 flex-1">
                              <span className="text-gray-400 text-xs">{isExpanded ? '▼' : '▶'}</span>
                              <input
                                type="text"
                                value={scenario.id}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  updateScenario(mIdx, sIdx, 'id', e.target.value);
                                }}
                                className="w-16 bg-gray-700 text-xs text-blue-300 px-1 rounded border border-gray-600"
                                onClick={(e) => e.stopPropagation()}
                              />
                              <input
                                type="text"
                                value={scenario.name}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  updateScenario(mIdx, sIdx, 'name', e.target.value);
                                }}
                                className="flex-1 bg-transparent text-sm text-white border-b border-gray-600 focus:border-blue-500 outline-none min-w-0"
                                onClick={(e) => e.stopPropagation()}
                                style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                              />
                            </div>
                            {/* 操作按钮 */}
                            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => moveScenarioUp(mIdx, sIdx)}
                                disabled={sIdx === 0}
                                className={`w-6 h-6 flex items-center justify-center rounded text-xs ${sIdx === 0 ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                                title="上移"
                              >
                                ↑
                              </button>
                              <button
                                onClick={() => moveScenarioDown(mIdx, sIdx)}
                                disabled={sIdx >= (module.scenarios?.length || 0) - 1}
                                className={`w-6 h-6 flex items-center justify-center rounded text-xs ${sIdx >= (module.scenarios?.length || 0) - 1 ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                                title="下移"
                              >
                                ↓
                              </button>
                              <button
                                onClick={() => deleteScenario(mIdx, sIdx)}
                                className="w-6 h-6 flex items-center justify-center bg-red-600 hover:bg-red-700 rounded text-xs text-white"
                                title="删除"
                              >
                                ✕
                              </button>
                            </div>
                          </div>

                          {/* 场景详情 - 可编辑字段 */}
                          {isExpanded && (
                            <div className="p-3 space-y-3">
                              {/* 前置条件 (Given) */}
                              <div>
                                <label className="text-xs text-gray-400 block mb-1">前置条件 (Given)</label>
                                <textarea
                                  value={getGivenText()}
                                  onChange={(e) => updateScenario(mIdx, sIdx, 'given', e.target.value)}
                                  className="w-full bg-gray-800 border border-gray-700 rounded text-xs text-gray-300 p-2 resize-none"
                                  rows={2}
                                  placeholder="描述前置条件..."
                                />
                              </div>

                              {/* 执行步骤 (When) */}
                              <div>
                                <label className="text-xs text-gray-400 block mb-1">执行步骤 (When)</label>
                                {(() => {
                                  const whenActions = getWhenActions();
                                  // 过滤掉 undefined 的 action
                                  const validActions = whenActions.filter(a => a != null);
                                  if (validActions.length > 0) {
                                    return (
                                      <div className="space-y-2">
                                        {validActions.map((action, stepIdx) => {
                                          // 找到原始数组中对应的索引
                                          const originalIdx = whenActions.indexOf(action);
                                          return (
                                            <div key={originalIdx >= 0 ? originalIdx : stepIdx} className="flex items-center gap-2">
                                              <input
                                                type="text"
                                                value={action?.description || action?.text || ''}
                                                onChange={(e) => {
                                                  updateWhenAction(mIdx, sIdx, originalIdx >= 0 ? originalIdx : stepIdx, 'description', e.target.value);
                                                }}
                                                className="flex-1 bg-gray-800 border border-gray-700 rounded text-xs text-gray-300 p-2"
                                                placeholder={`步骤 ${stepIdx + 1}...`}
                                              />
                                              <button
                                                onClick={() => deleteWhenAction(mIdx, sIdx, originalIdx >= 0 ? originalIdx : stepIdx)}
                                                className="w-6 h-6 flex items-center justify-center bg-red-600 hover:bg-red-700 rounded text-xs text-white flex-shrink-0"
                                                title="删除此步骤"
                                              >
                                                ✕
                                              </button>
                                            </div>
                                          );
                                        })}
                                        <button
                                          onClick={() => addWhenAction(mIdx, sIdx)}
                                          className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300"
                                        >
                                          + 添加步骤
                                        </button>
                                      </div>
                                    );
                                  }
                                  return (
                                    <div className="space-y-2">
                                      <textarea
                                        value={getWhenText()}
                                        onChange={(e) => updateScenario(mIdx, sIdx, 'when', e.target.value)}
                                        className="w-full bg-gray-800 border border-gray-700 rounded text-xs text-gray-300 p-2 resize-none"
                                        rows={3}
                                        placeholder="描述执行步骤..."
                                      />
                                      <button
                                        onClick={() => addWhenAction(mIdx, sIdx)}
                                        className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300"
                                      >
                                        + 切换到多步骤模式
                                      </button>
                                    </div>
                                  );
                                })()}
                              </div>

                              {/* 预期结果 (Then) */}
                              <div>
                                <label className="text-xs text-gray-400 block mb-1">预期结果 (Then)</label>
                                {(() => {
                                  const thenVerifications = getThenVerifications();
                                  // 过滤掉 undefined 的 verification
                                  const validVerifications = thenVerifications.filter(v => v != null);
                                  if (validVerifications.length > 0) {
                                    return (
                                      <div className="space-y-2">
                                        {validVerifications.map((v, stepIdx) => {
                                          // 找到原始数组中对应的索引
                                          const originalIdx = thenVerifications.indexOf(v);
                                          return (
                                            <div key={originalIdx >= 0 ? originalIdx : stepIdx} className="flex items-center gap-2">
                                              <input
                                                type="text"
                                                value={v?.description || v?.text || ''}
                                                onChange={(e) => {
                                                  updateThenVerification(mIdx, sIdx, originalIdx >= 0 ? originalIdx : stepIdx, 'description', e.target.value);
                                                }}
                                                className="flex-1 bg-gray-800 border border-gray-700 rounded text-xs text-gray-300 p-2"
                                                placeholder={`验证 ${stepIdx + 1}...`}
                                              />
                                              <button
                                                onClick={() => deleteThenVerification(mIdx, sIdx, originalIdx >= 0 ? originalIdx : stepIdx)}
                                                className="w-6 h-6 flex items-center justify-center bg-red-600 hover:bg-red-700 rounded text-xs text-white flex-shrink-0"
                                                title="删除此验证"
                                              >
                                                ✕
                                              </button>
                                            </div>
                                          );
                                        })}
                                        <button
                                          onClick={() => addThenVerification(mIdx, sIdx)}
                                          className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300"
                                        >
                                          + 添加验证
                                        </button>
                                      </div>
                                    );
                                  }
                                  return (
                                    <div className="space-y-2">
                                      <textarea
                                        value={getThenText()}
                                        onChange={(e) => updateScenario(mIdx, sIdx, 'then', e.target.value)}
                                        className="w-full bg-gray-800 border border-gray-700 rounded text-xs text-gray-300 p-2 resize-none"
                                        rows={2}
                                        placeholder="描述预期结果..."
                                      />
                                      <button
                                        onClick={() => addThenVerification(mIdx, sIdx)}
                                        className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300"
                                      >
                                        + 切换到多步骤验证模式
                                      </button>
                                    </div>
                                  );
                                })()}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {/* 添加新用例按钮 */}
                    <div className="mt-3 pt-2 border-t border-gray-700 flex items-center gap-2">
                      <button
                        onClick={() => addNewScenario(mIdx)}
                        className="px-3 py-1.5 text-xs bg-green-600 hover:bg-green-700 rounded text-white flex items-center gap-1"
                      >
                        + 新增单条用例
                      </button>
                      <button
                        onClick={() => {
                          const count = window.prompt('请输入要添加的用例数量:', '3');
                          if (count && !isNaN(parseInt(count))) {
                            addMultipleScenarios(mIdx, parseInt(count));
                          }
                        }}
                        className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 rounded text-white flex items-center gap-1"
                      >
                        + 批量新增
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="p-3 bg-gray-800 border-t border-gray-700 flex justify-end gap-2">
            <button
              onClick={cancelEdit}
              className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300"
            >
              取消
            </button>
            <button
              onClick={saveEditedDocument}
              className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 rounded text-white"
            >
              保存修改
            </button>
          </div>
        </div>
      );
    }

    // 切换文档展开/折叠
    const toggleDocument = (projectPath) => {
      setExpandedDocuments(prev => {
        const newSet = new Set(prev);
        if (newSet.has(projectPath)) {
          newSet.delete(projectPath);
        } else {
          newSet.add(projectPath);
        }
        return newSet;
      });
    };

    // 计算总用例数
    const getTotalTestCases = (doc) => {
      if (!doc.testPlan || !doc.testPlan.modules) return 0;
      return doc.testPlan.modules.reduce((sum, m) => sum + (m.scenarios?.length || 0), 0);
    };

    // 获取测试状态摘要
    const getTestStatusSummary = (doc) => {
      if (!doc.testPlan || !doc.testPlan.modules) return null;

      let passed = 0;
      let failed = 0;
      let notRun = 0;
      let lastRun = null;

      doc.testPlan.modules.forEach(module => {
        module.scenarios?.forEach(scenario => {
          if (scenario.lastResult) {
            if (scenario.lastResult.status === 'passed') passed++;
            else if (scenario.lastResult.status === 'failed') failed++;

            if (!lastRun || new Date(scenario.lastResult.executedAt) > new Date(lastRun)) {
              lastRun = scenario.lastResult.executedAt;
            }
          } else {
            notRun++;
          }
        });
      });

      const total = passed + failed + notRun;

      return {
        total,
        passed,
        failed,
        notRun,
        lastRun
      };
    };

    // 格式化时间
    const formatTime = (timestamp) => {
      if (!timestamp) return '';
      const date = new Date(timestamp);
      return date.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    };

    return (
      <div className="flex flex-col h-full">
        {/* Header with New Test Case button */}
        <div className="p-2 bg-gray-800 border-b border-gray-700 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-white truncate">测试文档</h3>
          {onNewTestCase && (
            <button
              onClick={onNewTestCase}
              className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 rounded text-white flex-shrink-0"
            >
              + 新增
            </button>
          )}
        </div>

        {/* Test Documents List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {testCases && Array.isArray(testCases) && testCases.length > 0 ? (
            testCases.map((doc, index) => {
              const isExpanded = expandedDocuments.has(doc.projectPath);
              const totalCases = getTotalTestCases(doc);

              return (
                <div key={index} className="bg-gray-800 rounded-lg overflow-hidden">
                  {/* Document Header - 紧凑布局 */}
                  <div
                    className="p-2 border-b border-gray-700 hover:bg-gray-700/50 transition-colors cursor-pointer"
                    onClick={() => toggleDocument(doc.projectPath)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      {/* 左侧：展开图标和标题 */}
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <span className="text-sm text-white flex-shrink-0 w-4 text-center">
                          {isExpanded ? '▼' : '▶'}
                        </span>
                        <h4
                          className="text-xs font-medium text-white truncate"
                          title={doc.projectName}
                        >
                          {doc.projectName}
                        </h4>
                        <span className="text-xs bg-blue-900 text-blue-300 px-1.5 py-0.5 rounded flex-shrink-0 whitespace-nowrap">
                          {totalCases}
                        </span>
                      </div>

                      {/* 右侧：操作按钮 */}
                      <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                        {onRunTestDocument && (
                          <button
                            onClick={() => onRunTestDocument(doc)}
                            className="w-7 h-7 flex items-center justify-center bg-green-600 hover:bg-green-700 rounded text-white"
                            title="运行"
                          >
                            ▶
                          </button>
                        )}
                        {onEditTestDocument && (
                          <button
                            onClick={() => {
                              // 创建深拷贝，避免修改原始数据
                              const docCopy = JSON.parse(JSON.stringify(doc));
                              setEditingDocument(docCopy);
                            }}
                            className="w-7 h-7 flex items-center justify-center bg-blue-600 hover:bg-blue-700 rounded text-white"
                            title="编辑"
                          >
                            ✎
                          </button>
                        )}
                        {onDeleteTestDocument && (
                          <button
                            onClick={() => {
                              if (window.confirm(`确定要删除测试文档 "${doc.projectName}" 吗？`)) {
                                onDeleteTestDocument(doc.projectPath);
                              }
                            }}
                            className="w-7 h-7 flex items-center justify-center bg-red-600 hover:bg-red-700 rounded text-white text-base"
                            title="删除"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </div>
                    {/* 时间信息 - 简化为一行 */}
                    <p className="text-xs text-gray-500 mt-1 pl-6">
                      {formatTime(doc.savedAt)}
                    </p>
                  </div>

                  {/* Expanded Content - 简化版，不显示详细用例 */}
                  {isExpanded && (() => {
                    const statusSummary = getTestStatusSummary(doc);
                    return (
                      <div className="p-2 bg-gray-900/50">
                        <p className="text-xs text-gray-400 pl-6 mb-2">
                          共 {totalCases} 个测试用例，点击编辑查看详情
                        </p>
                        {statusSummary && (
                          <div className="pl-6 flex items-center gap-3 text-xs">
                            <span className="text-gray-400">测试结果:</span>
                            {statusSummary.total > 0 && statusSummary.passed > 0 && (
                              <span className="text-green-400">✓ {statusSummary.passed} 通过</span>
                            )}
                            {statusSummary.total > 0 && statusSummary.failed > 0 && (
                              <span className="text-red-400">✗ {statusSummary.failed} 失败</span>
                            )}
                            {statusSummary.notRun > 0 && (
                              <span className="text-gray-500">○ {statusSummary.notRun} 未运行</span>
                            )}
                            {statusSummary.lastRun && (
                              <span className="text-gray-500 ml-auto">
                                上次运行: {formatTime(statusSummary.lastRun)}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              );
            })
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center py-8">
              <p className="text-gray-500 text-sm mb-4">暂无测试文档</p>
              {onNewTestCase && (
                <button
                  onClick={onNewTestCase}
                  className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 rounded text-white"
                >
                  + 新增第一个测试文档
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer with count */}
        {testCases && Array.isArray(testCases) && testCases.length > 0 && (
          <div className="p-2 bg-gray-800 border-t border-gray-700 text-xs text-gray-400">
            共 {testCases.length} 个测试文档，{testCases.reduce((sum, doc) => sum + getTotalTestCases(doc), 0)} 个用例
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-gray-900">
      {/* Tabs */}
      <div className="flex border-b border-gray-700">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex items-center gap-1 px-4 py-2 text-sm transition-colors ${
              activeTab === tab.id
                ? 'bg-gray-800 text-white border-b-2 border-blue-500'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'problems' && renderProblems()}
        {activeTab === 'todo' && renderTodos()}
        {activeTab === 'reports' && renderReports()}
        {activeTab === 'aiPreview' && renderAIPreview()}
        {activeTab === 'dependencies' && (
          <div className="h-full overflow-auto p-3">
            {dependencyStats && <DependencyStats stats={dependencyStats} />}
            {localTree && (
              <DependencyTree
                tree={localTree}
                expandedNodes={expandedNodes}
                onToggle={handleToggle}
              />
            )}
            {!localTree && (
              <p className="text-gray-500 text-sm">
                No dependency data available. Run a scan with AST enabled to generate dependency information.
              </p>
            )}
          </div>
        )}
        {activeTab === 'tests' && renderTests()}
      </div>
    </div>
  );
}

export default RightPanel;
