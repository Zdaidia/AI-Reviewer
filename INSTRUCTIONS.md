# Dev Quality Inspector - 项目指南

> 本文档为 AI 助手提供项目结构和规范参考，确保所有代码修改都遵循统一标准。

## 📋 项目概览

**Dev Quality Inspector** 是一个基于 React + Electron + Playwright 的代码质量检测和自动化测试桌面工具。

**核心功能**：
- 代码质量扫描（支持多语言、多框架）
- AI 智能修复
- AI 测试用例生成
- QA 审查（基于需求文档验证）
- 项目运行和测试执行

**目标支持的项目类型**：
- Flutter Web 项目
- Vue 项目
- React 项目
- Angular 项目
- 传统 HTML+CSS+JS 项目

---

## 🏗️ 技术栈

### 前端技术
| 技术 | 版本 | 用途 |
|------|------|------|
| React | 18.2.0 | UI 框架 |
| TailwindCSS | 3.4.0 | 样式框架 |
| Monaco Editor | 0.45.0 | 代码编辑器 |

### 桌面端技术
| 技术 | 版本 | 用途 |
|------|------|------|
| Electron | 28 | 桌面应用框架 |
| Node.js | - | 运行时环境 |

### 测试引擎
| 技术 | 版本 | 用途 |
|------|------|------|
| Playwright | 1.40.0 | 浏览器自动化测试 |
| Puppeteer | 24.40.0 | 备用测试引擎 |

### AI 集成
| 技术 | 版本 | 用途 |
|------|------|------|
| @anthropic-ai/sdk | 0.90.0 | Claude API |
| openai | 4.20.0 | OpenAI API 兼容层 |

### 代码分析工具
| 技术 | 版本 | 用途 |
|------|------|------|
| @babel/parser | 7.23.0 | JS/TS AST 解析 |
| @vue/compiler-dom | 3.3.0 | Vue 模板解析 |
| js-yaml | 4.1.0 | YAML 配置解析 |

---

## 📁 核心目录结构

```
dev-quality-inspector/
├── src/
│   ├── components/           # React 组件（UI 层）
│   │   ├── App.jsx                          # 主应用组件
│   │   ├── SettingsPanel.jsx                # 设置面板
│   │   ├── AIFixModal.jsx                   # AI 修复弹窗
│   │   ├── AISmartTestModal.jsx             # AI 智能测试弹窗
│   │   ├── QAReviewerModal.jsx              # QA 审查弹窗
│   │   ├── ScanRangeSelector.jsx            # 扫描范围选择器
│   │   └── ...                              # 其他 UI 组件
│   │
│   ├── core/
│   │   ├── electron/           # Electron 主进程
│   │   │   ├── main.js                        # 主进程入口（IPC handlers）
│   │   │   └── preload.js                     # 预加载脚本（API 桥接）
│   │   │
│   │   ├── scanner/            # 代码扫描器
│   │   │   ├── index.js                       # 扫描器主入口
│   │   │   ├── parallel-scanner.js           # 并行扫描器
│   │   │   ├── scan-worker.js                # Worker 线程
│   │   │   └── ai-context-generator.js       # AI 上下文生成器
│   │   │
│   │   ├── ai-fixer/           # AI 智能修复
│   │   │   ├── index.js                       # AI Fixer 主入口
│   │   │   ├── config.js                      # AI 配置管理
│   │   │   └── fixer.js                       # 修复执行器
│   │   │
│   │   ├── testing/            # 测试引擎
│   │   │   ├── index.js                       # 测试管理器
│   │   │   ├── ai-test-generator.js          # AI 测试生成器
│   │   │   ├── ai-test-agent.js              # AI 测试 Agent
│   │   │   ├── test-case-storage.js          # 测试用例存储
│   │   │   ├── test-reporter.js              # 测试报告生成器
│   │   │   └── bdd-test-parser.js            # BDD 测试解析器
│   │   │
│   │   ├── qa-reviewer/         # QA 审查系统
│   │   │   ├── executor/
│   │   │   │   └── segment-executor.js       # 分段审查执行器
│   │   │   ├── config/
│   │   │   │   └── model-config.js           # 模型配置
│   │   │   ├── prompts/                      # 提示词模板
│   │   │   ├── strategies/                   # 审查策略
│   │   │   └── utils/                        # 工具函数
│   │   │
│   │   ├── agent/              # AI Agent 系统
│   │   │   ├── core/
│   │   │   │   └── orchestrator.js           # Agent 编排器
│   │   │   ├── llm/
│   │   │   │   └── router.js                 # LLM 路由器
│   │   │   ├── tools/                        # Agent 工具集
│   │   │   ├── memory/
│   │   │   │   └── memory-manager.js         # 记忆管理器
│   │   │   └── context-builder/              # 上下文构建器
│   │   │
│   │   ├── code-graph/          # 代码图分析
│   │   │   └── index.js                       # 代码图构建器
│   │   │
│   │   ├── dependency/          # 依赖分析器
│   │   │   ├── index.js                       # 依赖分析主入口
│   │   │   └── language-parsers/             # 各语言解析器
│   │   │
│   │   ├── flutter-*-analyzer/ # Flutter 专项分析器
│   │   │   ├── flutter-component-analyzer/   # 组件分析
│   │   │   ├── flutter-model-analyzer/       # Model 分析
│   │   │   ├── flutter-service-analyzer/     # Service 分析
│   │   │   ├── flutter-repository-analyzer/  # Repository 分析
│   │   │   ├── flutter-state-analyzer/       # 状态分析
│   │   │   ├── flutter-ui-analyzer/          # UI 分析
│   │   │   └── ...                           # 其他 Flutter 分析器
│   │   │
│   │   ├── ast-parser/          # AST 解析器
│   │   ├── call-graph-analyzer/ # 调用图分析
│   │   ├── project-scanner/     # 项目扫描器
│   │   ├── runner/              # 项目运行器
│   │   └── utils/               # 通用工具
│   │
│   ├── config/                # 配置文件
│   ├── utils/                 # 前端工具函数
│   ├── index.js               # React 入口
│   └── index.css              # 全局样式
│
├── rules.yaml                 # 代码扫描规则配置
├── rules-fix.yaml             # 自动修复规则配置
├── agent-config.yaml          # Agent 配置
├── package.json               # 项目依赖和脚本
├── tailwind.config.js         # TailwindCSS 配置
└── .eslintrc.json             # ESLint 配置
```

---

## 🎯 代码规范和命名风格

### 文件命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| React 组件 | PascalCase.jsx | `SettingsPanel.jsx` |
| 工具函数 | camelCase.js | `formatUtils.js` |
| 主进程文件 | kebab-case.js | `main.js`, `preload.js` |
| 配置文件 | kebab-case | `rules.yaml`, `tailwind.config.js` |
| 测试文件 | `.test.js` 或 `.spec.js` `scanner.test.js` |

### 代码风格

#### JavaScript/JSX
- **缩进**：2 空格
- **字符串**：优先使用单引号，JSX 属性使用双引号
- **分号**：不使用分号（ESLint 规则）
- **命名**：
  - 组件：PascalCase
  - 函数/变量：camelCase
  - 常量：UPPER_SNAKE_CASE
  - 私有变量：_prefix（如 `_internalState`）

#### 注释规范
```javascript
/**
 * 函数功能说明（多行注释风格）
 * @param {string} filePath - 文件路径
 * @returns {Promise<Object>} 返回值说明
 */
function analyzeFile(filePath) {
  // 单行注释：解释复杂逻辑
  const result = processFile(filePath);
  return result;
}
```

### React 组件规范

```jsx
// ✅ 正确示例
function MyComponent({ isOpen, onClose, data }) {
  const [state, setState] = useState(null);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const handleClick = async () => {
    try {
      await saveData();
    } catch (error) {
      console.error('保存失败:', error);
    }
  };

  return (
    <div className="p-4">
      {/* JSX 注释 */}
      <button onClick={handleClick}>保存</button>
    </div>
  );
}

// ❌ 错误示例
function my_component(props) {  // 命名不规范
  var data = [];  // 使用 var 而非 const/let
  return <div>...</div>
}
```

### Electron IPC 规范

#### 主进程（main.js）
```javascript
// ✅ IPC Handler 命名规范
ipcMain.handle('ai-fix-config', async (event) => {
  try {
    const config = await loadAIConfig();
    return { success: true, config };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
```

#### 渲染进程（preload.js）
```javascript
// ✅ API 暴露规范
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  aiFixConfig: () => ipcRenderer.invoke('ai-fix-config'),
  saveAIConfig: (config) => ipcRenderer.invoke('save-ai-config', config),
});
```

---

## 🔧 关键启动和构建命令

### 开发模式
```bash
npm run dev
```
启动 React 开发服务器（http://localhost:3003）和 Electron 窗口

### 生产构建
```bash
# 仅构建 React 前端
npm run build:react

# 完整构建（React + Electron 打包）
npm run build

# 仅打包（不构建，用于快速测试）
npm run pack
```

### 启动应用
```bash
npm start
```

### 进程管理（Windows）
```bash
# 强制终止所有 Electron 进程
taskkill /F /IM electron.exe /T

# 强制终止所有 Node 进程
taskkill /F /IM node.exe /T

# 检查端口占用
netstat -ano | findstr :3003
```

---

## ⚠️ 架构原则（最高优先级）

### 通用架构要求
**本项目所有功能必须支持多种项目类型，禁止硬编码特定项目的路径结构。**

#### ❌ 禁止硬编码
```javascript
// 错误示例：硬编码 Flutter 特定路径
if (filePath.includes('/lib/views/') || filePath.includes('/lib/controller/'))
if (filePath.endsWith('.dart'))
```

#### ✅ 正确做法
```javascript
// 正确：自动检测项目类型
const projectType = detectProjectType(projectPath, codeGraph);
// 根据文件类型推断，而非路径
const fileType = inferFileType(filePath, projectType);
if (['view', 'controller'].includes(fileType))
```

### 可用的通用函数（在 `src/core/electron/main.js` 中）

| 函数 | 功能 |
|------|------|
| `detectProjectType(projectPath, codeGraph)` | 自动检测项目类型 |
| `inferFileType(filePath, projectType)` | 推断文件角色（view/controller/model/service等） |
| `parseImports(filePath, content)` | 跨语言解析 import 语句 |

---

## 📌 常见模式和约定

### 错误处理模式
```javascript
// ✅ 标准 IPC 错误处理
try {
  const result = await operation();
  return { success: true, data: result };
} catch (error) {
  console.error('操作失败:', error);
  return { success: false, error: error.message };
}
```

### 状态管理模式
```javascript
// ✅ React 组件状态管理
const [loading, setLoading] = useState(false);
const [data, setData] = useState(null);
const [error, setError] = useState(null);
```

### 配置管理模式
```javascript
// ✅ 配置文件路径兼容开发/打包模式
function getAppRoot() {
  if (app.isPackaged) {
    return app.getAppPath();  // 打包后
  }
  return path.join(__dirname, '../../..');  // 开发模式
}
```

---

## 🔍 已知问题和限制

1. **flutterEnabled 未设置**：`this.flutterEnabled` 变量从未被初始化
2. **简繁体差异**：测试用例使用"登录"但页面显示"登入"时无法匹配
3. **导航点击延迟**：导航类点击后需要等待 5000-7000ms 让 Flutter 页面更新

详细修改记录请查看 `MEMORY.md`。

---

## 📝 修改前必读

1. **所有修改前必须建立修改任务**（在 MEMORY.md 中记录）
2. **修改后必须更新 MEMORY.md**
3. **遵循本文档的代码规范**
4. **不得硬编码特定项目路径**
5. **必须进行空值检查和错误处理**

---

## 🔄 文档更新机制

**本文档（INSTRUCTIONS.md）是所有代码修改的基础参考。**

- 任何新增功能或重大修改都应更新本文档
- 如果目录结构、技术栈、代码规范发生变化，立即同步更新
- 每次修改前先阅读本文档，确保符合规范
