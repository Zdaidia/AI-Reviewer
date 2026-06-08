/**
 * 记录 2026-04-01 的任务修改
 */

const fs = require('fs');
const path = require('path');

// 确保 D 盘目录存在
const tasksDir = 'D:/dev-quality-inspector/tasks';
if (!fs.existsSync(tasksDir)) {
  fs.mkdirSync(tasksDir, { recursive: true });
}

// 创建任务记录
const taskId = 'TASK-20260401-test-context-enhancer';
const taskData = {
  id: taskId,
  title: 'AI 测试上下文提炼功能 + 任务记录系统',
  description: '实现将代码图和 AI_CONTEXT.md 整合生成测试专用的 JSON 上下文文件，并创建任务记录系统保存到 D 盘',
  status: 'completed',
  priority: 'high',
  createdAt: '2026-04-01T08:30:00.000Z',
  updatedAt: '2026-04-01T09:00:00.000Z',
  completedAt: '2026-04-01T09:00:00.000Z',
  tags: ['test-generation', 'ai-context', 'task-record', 'refactor'],
  relatedFiles: [
    'src/core/testing/test-context-enhancer.js',
    'src/core/task-record-manager.js',
    'src/core/electron/main.js',
    'src/core/electron/preload.js',
    'src/components/RightPanel.jsx',
  ],
  modifications: [
    {
      timestamp: '2026-04-01T08:35:00.000Z',
      file: 'src/core/testing/test-context-enhancer.js',
      action: 'create',
      description: '创建测试上下文增强器，使用 AI 作为"代码语义提炼器"生成测试专用上下文',
      changes: [
        '实现 summarizeCodeGraph 方法提取关键类信息',
        '实现 buildRefinerPrompt 构建提示词',
        '实现 callLLMRefiner 调用 LLM 进行提炼',
        '实现 fallbackRefine 回退方案'
      ]
    },
    {
      timestamp: '2026-04-01T08:40:00.000Z',
      file: 'src/core/task-record-manager.js',
      action: 'create',
      description: '创建任务记录管理器，保存任务和变更日志到 D 盘',
      changes: [
        '实现 createTask/updateTask/getTask/listTasks 基本操作',
        '实现 addModification 记录文件修改',
        '实现 addChangelogEntry 记录变更日志',
        '实现 generateTaskReport/generateDailyReport 报告生成'
      ]
    },
    {
      timestamp: '2026-04-01T08:45:00.000Z',
      file: 'src/core/electron/main.js',
      action: 'update',
      description: '集成测试上下文增强器和任务记录管理器',
      changes: [
        '导入 TaskRecordManager 和 TestContextEnhancer',
        '初始化 taskRecordManager 实例',
        '在扫描流程中调用 TestContextEnhancer 生成 TEST_CONTEXT.json',
        '修复 llmRouter 作用域问题（改用 agentLLM）',
        '添加 download-test-context IPC 处理器',
        '添加任务记录相关 IPC 处理器'
      ]
    },
    {
      timestamp: '2026-04-01T08:50:00.000Z',
      file: 'src/core/electron/preload.js',
      action: 'update',
      description: '添加 downloadTestContext API 暴露',
      changes: [
        '添加 downloadTestContext: (projectPath) => ipcRenderer.invoke(...)'
      ]
    },
    {
      timestamp: '2026-04-01T08:55:00.000Z',
      file: 'src/components/RightPanel.jsx',
      action: 'update',
      description: '添加测试上下文下载按钮',
      changes: [
        '添加 handleDownloadTestContext 处理函数',
        '添加 hasTestContext 检查',
        '添加下载按钮 UI'
      ]
    }
  ],
  notes: `

## 功能说明

### 1. 测试上下文增强器 (TestContextEnhancer)
- 在代码扫描完成后自动运行
- 读取 Code Graph 和 AI_CONTEXT.md
- 调用 AI 提炼出测试专用的最小业务上下文
- 输出 TEST_CONTEXT.json，包含：
  - features: 功能列表（入口点、控制器、API、用户流程）
  - test_targets: 测试目标列表

### 2. 任务记录系统 (TaskRecordManager)
- 保存位置：D:/dev-quality-inspector/tasks/
- 支持任务的 CRUD 操作
- 支持记录文件修改历史
- 支持生成 Markdown 格式的报告
- 支持按日期记录变更日志

### 3. 下载功能
- 用户可以在扫描结果面板下载三个文件：
  - AI_CONTEXT.md: 项目上下文文档
  - .code-graph.json: 代码结构图
  - TEST_CONTEXT.json: 测试专用上下文（新增）

## 输出格式

TEST_CONTEXT.json 示例：
\`\`\`json
{
  "features": [
    {
      "name": "登录功能",
      "entry_points": ["LoginPage"],
      "controllers": ["LoginController"],
      "core_methods": ["login", "validateCredentials"],
      "api_calls": ["/api/auth/login"],
      "state": ["isLoading", "isError", "isLoggedIn"],
      "user_flow": "用户输入账号和密码，点击登录按钮，进入首页"
    }
  ],
  "test_targets": [
    "验证登录成功后跳转到首页",
    "验证登录失败时显示错误提示",
    "验证空输入时的验证"
  ]
}
\`\`\`

## 已知问题
- GLM-5 API 可能返回 429 错误，已实现重试机制
- 如果 LLM 失败，会使用回退方案返回空结构
`
};

// 保存任务
const taskPath = path.join(tasksDir, `${taskId}.json`);
fs.writeFileSync(taskPath, JSON.stringify(taskData, null, 2), 'utf-8');

// 创建变更日志
const changelogDir = path.join(tasksDir, 'changelog');
if (!fs.existsSync(changelogDir)) {
  fs.mkdirSync(changelogDir, { recursive: true });
}

const changelogPath = path.join(changelogDir, '2026-04-01.jsonl');
const changelogEntry = {
  timestamp: new Date().toISOString(),
  type: 'feature',
  summary: '实现 AI 测试上下文提炼功能',
  details: '创建 TestContextEnhancer 和 TaskRecordManager，实现测试专用上下文生成和任务记录系统',
  files: [
    'src/core/testing/test-context-enhancer.js',
    'src/core/task-record-manager.js',
    'src/core/electron/main.js',
    'src/core/electron/preload.js',
    'src/components/RightPanel.jsx'
  ],
  taskId: taskId
};

fs.appendFileSync(changelogPath, JSON.stringify(changelogEntry) + '\n', 'utf-8');

console.log('任务记录已保存到:', taskPath);
console.log('变更日志已保存到:', changelogPath);
