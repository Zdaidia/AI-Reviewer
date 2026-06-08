# AI 测试系统架构升级

## 架构对比

### 原始架构

```
Excel → Test DSL → Playwright → 结果
```

**问题：**
- ❌ 生成静态脚本
- ❌ 无法动态决策
- ❌ 应对意外能力差
- ❌ 维护成本高

### 新架构（AI Agent）

```
Excel / AI生成
    ↓
Test Intent（测试意图）
    ↓
AI Agent（智能决策）
    ↓
Playwright（执行器）
    ↓
AI分析结果（智能分析）
```

**优势：**
- ✅ 意图驱动，不是脚本
- ✅ AI 实时决策
- ✅ 动态应对变化
- ✅ 智能错误分析
- ✅ 自动修复建议

---

## 核心模块

### 1. 输入层

**支持多种输入源：**

```javascript
// Excel BDD 测试
const excelInput = {
  type: 'excel',
  path: './test-cases.xlsx',
  parser: 'BDDTestParser',
};

// AI 生成的测试
const aiInput = {
  type: 'ai-generation',
  source: 'requirement',
  content: '用户可以查看案件列表',
  generator: 'AITestGeneratorComplete',
};

// 混合输入
const hybridInput = {
  type: 'hybrid',
  excel: './test-cases.xlsx',
  ai: '用户需求描述',
};
```

### 2. Test Intent（测试意图）

**从输入提取测试意图：**

```javascript
const TestIntentBuilder = require('./test-intent-builder');

// 构建 Test Intent
const intent = await TestIntentBuilder.build({
  from: 'excel',
  data: excelData,
});

// Intent 结构
{
  goal: "用户成功登录系统",
  priority: "High",
  preconditions: [
    "用户在登录页面",
    "用户有有效账号"
  ],
  steps: [
    {
      intent: "输入用户名",
      not: "fill('#username', 'testuser')"
    },
    {
      intent: "输入密码",
      not: "fill('#password', '123456')"
    },
    {
      intent: "点击登录按钮",
      not: "click('#login-btn')"
    }
  ],
  expectedOutcome: {
    state: "logged_in",
    url: "/dashboard",
    elementVisible: ".welcome-message"
  }
}
```

**关键区别：**
- ❌ 旧方式：`fill('#username', 'testuser')` - 具体操作
- ✅ 新方式：`{ intent: "输入用户名" }` - 意图描述

### 3. AI Agent（智能决策）

**核心执行循环：**

```javascript
const AIExecutionEngine = require('./ai-execution-engine');

const engine = new AIExecutionEngine({
  memory: projectMemory,
  llm: llmRouter,
  enableSelfCorrection: true,
});

// 执行 Test Intent
const result = await engine.execute(intent);

// AI Agent 内部循环
while (!goal.completed && iterations < maxIterations) {
  // 1. 观察页面
  const observation = await observe();

  // 2. 理解状态
  const understanding = await understand(observation);

  // 3. 决定操作（AI 决策）
  const decision = await decide(understanding);

  // 4. 执行操作
  const action = await act(decision);

  // 5. 验证结果
  const verification = await verify(action);
}
```

**AI 决策示例：**

```javascript
// 场景：输入用户名

// 旧方式（固定脚本）
await page.fill('#username', 'testuser@example.com');

// 新方式（AI 决策）
const decision = await ai.decide({
  intent: '输入用户名',
  context: {
    currentUrl: 'https://example.com/login',
    page: 'LoginPage',
    components: {
      UsernameInput: {
        selector: '#username, [name="username"], .email-input'
      }
    }
  }
});

// AI 决策结果
{
  action: 'input',
  selector: '#username',  // AI 选择最佳选择器
  value: 'testuser@example.com',
  reasoning: '使用 ID 选择器 #username，最可靠',
  confidence: 0.95,
  alternatives: [
    { selector: '[name="username"]', confidence: 0.8 },
    { selector: '.email-input', confidence: 0.7 }
  ]
}

// 执行决策
await browserActions.input(decision.selector, decision.value);
```

### 4. Playwright（执行器）

**浏览器操作封装：**

```javascript
const BrowserActions = require('./browser-actions');

const actions = new BrowserActions(page);

// 支持的操作
await actions.goto('https://example.com');
await actions.click('#login-button');
await actions.input('#username', 'testuser');
await actions.scroll({ y: 500 });
await actions.wait(1000);
await actions.extract('.list-item', { multiple: true });
await actions.count('.list-item');
await actions.screenshot({ path: 'screenshot.png' });
```

### 5. AI 分析结果

**智能报告生成：**

```javascript
const EnhancedTestReporter = require('./enhanced-test-reporter');

const reporter = new EnhancedTestReporter({
  enableAIAnalysis: true,
  llm: llmRouter,
});

// 生成增强报告
const report = await reporter.generateReport({
  testCases: executionResults,
});

// 报告包含
{
  summary: { ... },
  overall: { passRate: '85%' },
  testCases: [
    {
      name: '案件列表',
      status: 'failed',
      steps: [ ... ],
      issues: [
        {
          step: 2,
          error: 'Expected 10 items, got 15',
          type: 'count_mismatch',
          severity: 'medium'
        }
      ],
      // AI 分析
      analysis: {
        rootCause: '前端分页逻辑错误',
        category: 'frontend',
        possibleCauses: [
          {
            cause: '后端返回了 15 条数据',
            likelihood: 'high',
            verification: '检查 Network 面板的 API 响应'
          },
          {
            cause: '前端分页 limit 设置为 15',
            likelihood: 'medium',
            verification: '检查前端代码中的 limit 变量'
          }
        ]
      },
      // AI 建议
      suggestions: [
        {
          what: '修复分页逻辑',
          how: `1. 检查 src/pages/CaseList.vue
2. 找到 limit 变量
3. 将其改为 10
4. 或从配置文件读取`,
          verify: '重新运行测试并验证列表显示 10 条'
        }
      ]
    }
  ]
}
```

---

## 完整执行流程

### 示例：用户登录测试

#### 1. 输入

```excel
Feature: 用户登录
  Scenario: 正常登录
    Given 用户在登录页面
    When 输入正确的用户名和密码
    And 点击登录按钮
    Then 成功登录并跳转到首页
```

#### 2. Test Intent

```javascript
{
  goal: "用户成功登录",
  steps: [
    { intent: "进入登录页面" },
    { intent: "输入用户名和密码" },
    { intent: "点击登录" }
  ],
  expected: {
    state: "logged_in",
    url: "/dashboard"
  }
}
```

#### 3. AI Agent 执行

```javascript
// 迭代 1
{
  observation: { url: "https://example.com" },
  understanding: { currentState: "not_in_login_page" },
  decision: {
    action: "goto",
    url: "https://example.com/login",
    reasoning: "需要先导航到登录页面"
  },
  action: { success: true },
  verification: { passed: true }
}

// 迭代 2
{
  observation: {
    url: "https://example.com/login",
    elements: [
      { id: "username", type: "input" },
      { id: "password", type: "input" },
      { id: "login-btn", type: "button" }
    ]
  },
  understanding: {
    currentState: "in_login_page",
    progress: 33
  },
  decision: {
    action: "input",
    selector: "#username",
    value: "testuser@example.com",
    reasoning: "找到用户名输入框"
  },
  action: { success: true },
  verification: { passed: true }
}

// 迭代 3
{
  observation: { ... },
  understanding: { progress: 66 },
  decision: {
    action: "input",
    selector: "#password",
    value: "********",
    reasoning: "输入密码"
  },
  action: { success: true },
  verification: { passed: true }
}

// 迭代 4
{
  observation: { ... },
  understanding: { progress: 100 },
  decision: {
    action: "click",
    selector: "#login-btn",
    reasoning: "点击登录按钮"
  },
  action: { success: true },
  verification: { passed: true },
  completed: true
}
```

#### 4. 结果

```javascript
{
  success: true,
  iterations: 4,
  duration: 3500,
  decisions: [ ... ],
  actions: [ ... ],
  verifications: [ ... ]
}
```

---

## Prompt 关键改动

### 系统提示词

```markdown
You are NOT generating test scripts.

You are an AI QA Agent.

You must:

- Understand the test case
- Interact with real browser
- Observe DOM after each step
- Decide next action dynamically
- Validate expected result
- Provide reasoning for failures

Current Context:
- URL: {url}
- Page: {page}
- Components: {components}
- Goal: {goal}

Previous Actions:
{actionHistory}

Current Observation:
{dom}
{screenshot}

Decide the next action. Return JSON format:
{
  "action": "goto|click|input|scroll|wait|assert",
  "selector": "...",
  "value": "...",
  "reasoning": "...",
  "confidence": 0.0-1.0,
  "critical": true|false
}
```

### 示例对话

**用户（系统）：**
```
Test Intent: 用户登录
Goal: 成功登录并跳转到首页
Current URL: https://example.com/login
```

**AI Agent:**
```json
{
  "action": "input",
  "selector": "#username",
  "value": "testuser@example.com",
  "reasoning": "检测到用户名输入框，开始输入测试账号",
  "confidence": 0.95,
  "critical": false
}
```

**执行后...**

**AI Agent:**
```json
{
  "action": "input",
  "selector": "#password",
  "value": "password123",
  "reasoning": "输入框已清空，输入测试密码",
  "confidence": 0.95,
  "critical": false
}
```

**继续...**

**AI Agent:**
```json
{
  "action": "click",
  "selector": "#login-btn",
  "reasoning": "用户名和密码已输入，点击登录按钮",
  "confidence": 0.98,
  "critical": true
}
```

**验证...**

**AI Agent:**
```json
{
  "action": "assert",
  "check": "url",
  "expected": "/dashboard",
  "actual": "https://example.com/dashboard",
  "reasoning": "验证是否跳转到首页",
  "confidence": 1.0,
  "critical": true,
  "completed": true
}
```

---

## 关键优势

### 1. 意图驱动
- 从"怎么做"变为"做什么"
- 更接近人类思维
- 更易维护

### 2. 动态决策
- 实时观察页面状态
- 根据实际情况调整
- 无需预定义脚本

### 3. 智能纠错
- 自动检测失败
- 分析失败原因
- 尝试自我纠正

### 4. 上下文感知
- 利用 Project Memory
- 理解页面结构
- 智能选择选择器

### 5. 深度分析
- 不只报告失败
- 分析根本原因
- 提供修复建议

---

## 迁移指南

### 从旧架构迁移

**旧代码：**
```javascript
// 生成脚本
const script = generateTestScript(excelData);

// 执行脚本
await executeScript(script, playwright);
```

**新代码：**
```javascript
// 构建 Intent
const intent = await TestIntentBuilder.build(excelData);

// AI 执行
const result = await AIExecutionEngine.execute(intent);

// AI 分析
const report = await EnhancedTestReporter.generate(result);
```

---

## 总结

这次架构升级是质的飞跃：

| 维度 | 旧架构 | 新架构 |
|------|--------|--------|
| 驱动方式 | 脚本 | 意图 |
| 决策机制 | 预定义 | AI 实时 |
| 执行能力 | 固定 | 动态 |
| 错误处理 | 简单 | 智能 |
| 分析能力 | 基础 | 深度 |
| 维护成本 | 高 | 低 |

**核心理念：从"脚本执行"到"智能 Agent"**
