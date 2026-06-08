# AI Context Builder 使用指南

## 概述

AI Context Builder 是 AI QA Agent 的核心组件，负责构建结构化的上下文供 AI 理解和分析 Flutter 项目。

## 核心输出：AIContext

AIContext 整合了五个维度的上下文信息：

### 1. FileContext（文件上下文）
**AI 理解：** 项目的文件组织结构、模块划分、文件依赖关系

```javascript
{
  structure: {
    directories: [],      // 目录结构
    files: [],            // 文件列表
    entryPoints: [],      // 入口文件
  },
  dependencies: {
    imports: [],          // import 关系
    modules: [],          // 模块/包
  },
  metadata: {
    totalFiles: 0,
    totalLines: 0,
    language: 'dart',
    framework: 'flutter',
  }
}
```

### 2. CodeContext（代码逻辑上下文）
**AI 理解：** 数据流向、函数调用链、模块间的依赖关系（从 Call Graph 提取）

```javascript
{
  callGraph: {
    nodes: [],            // 函数/方法节点
    edges: [],            // 调用关系边
    entryPoints: [],      // 调用入口点
  },
  dataFlow: {
    sources: [],          // 数据来源点（如 UI 动作）
    sinks: [],            // 数据消耗点（如 Repository 调用）
    transformations: [],   // 数据转换点（如 API 调用）
  },
  complexity: {
    cyclomaticComplexity: {}, // 圈复杂度
    nestingDepth: {},         // 嵌套深度
    functionLength: {},       // 函数长度
  }
}
```

### 3. UIContext（UI 结构上下文）
**AI 理解：** 这是页面、组件层次结构、页面间关系（从 Widget Tree 提取）

```javascript
{
  pages: [               // 页面列表
    {
      name: 'HomePage',
      type: 'StatefulWidget',
      file: 'lib/pages/home.dart',
      line: 10,
      isStateful: true,
    }
  ],
  widgets: [],           // 所有 Widget
  componentTree: {},     // 组件树结构
  navigation: {
    routes: [],          // 路由定义
    transitions: [],     // 页面跳转关系
  }
}
```

### 4. DataContext（数据结构上下文）
**AI 理解：** 数据结构是否匹配、序列化是否正确、API 响应类型是否一致

```javascript
{
  models: [              // 数据模型
    {
      name: 'User',
      fields: [{ name: 'id', type: 'int' }],
      hasSerialization: true,
      file: 'lib/models/user.dart',
    }
  ],
  apis: [                // API 接口
    {
      method: 'GET',
      path: '/api/users',
      responseType: 'List<User>',
    }
  ],
  mappings: {
    modelToAPI: [],      // 模型 → 使用的 API
    apiToModel: [],      // API → 返回的模型
  },
  validation: {
    missingSerialization: [], // 缺少序列化的模型
    typeMismatches: [],       // 类型不匹配
    unusedModels: [],         // 未使用的模型
  }
}
```

### 5. BusinessContext（业务流程上下文）
**AI 理解：** 业务流程、用户交互路径、页面跳转逻辑

```javascript
{
  routes: [              // 路由定义
    {
      path: '/',
      page: 'HomePage',
      type: 'named',
      parameters: [],
    }
  ],
  userFlows: [           // 用户流程
    {
      name: '浏览产品',
      trigger: '点击产品卡片',
      steps: [
        { type: 'tap', description: '点击产品列表项' },
        { type: 'navigate', description: '跳转到详情页' },
      ],
      pages: ['HomePage', 'DetailPage'],
    }
  ],
  states: {
    managed: [],         // 被管理的状态
    unmanaged: [],       // 未管理的状态
  }
}
```

## 使用方法

### 基本用法

```javascript
const AIContextBuilder = require('./src/core/agent/context-builder');

// 创建 Context Builder
const builder = new AIContextBuilder();

// 注册分析器（如果需要）
builder.registerAnalyzer('flutter-ui-analyzer', uiAnalyzerInstance);

// 构建上下文
const question = '这个应用的 UI 结构怎么样？';
const projectInfo = {
  name: 'MyApp',
  type: 'flutter',
  path: '/path/to/project',
};

const aiContext = builder.buildQuestionContext(question, projectInfo, {
  maxTokens: 10000,
});

// 生成 AI 提示词
const prompt = aiContext.toAIPrompt();

// 或导出为 JSON
const json = aiContext.toJSON();
```

### 直接使用 AIContext

```javascript
const { AIContext } = require('./src/core/agent/context-builder');

// 从分析器数据构建
const aiContext = AIContext.build(
  question,
  projectInfo,
  analyzers,  // Map<string, Analyzer>
  questionAnalysis
);

// 访问各个维度
console.log(aiContext.ui.pages);        // 所有页面
console.log(aiContext.data.models);     // 所有数据模型
console.log(aiContext.business.routes); // 所有路由
```

### 生成 AI 友好的提示词

```javascript
// 自动生成结构化的提示词
const prompt = aiContext.toAIPrompt();

/* 输出示例：

## 用户问题
这个应用的 UI 结构怎么样？

## 项目结构
项目包含 50 个 Dart 文件，使用 Flutter 框架。

## UI 结构
应用包含 15 个页面，234 个组件。

页面列表:
- HomePage: 页面：HomePage (lib/pages/home.dart)
- DetailPage: 页面：DetailPage (lib/pages/detail.dart)
...

## 数据模型
定义了 35 个数据模型，24 个 API 接口。

数据模型:
- User: 8 个字段
- Product: 12 个字段
...

*/
```

## 相关性评分系统

Context Builder 使用多维度相关性评分来选择最相关的上下文：

1. **名称匹配** (权重 1.0)：分析器名称与问题类别匹配
2. **类别匹配** (权重 0.8)：基于预定义的类别映射
3. **语义匹配** (权重 1.2)：深度分析数据与问题的语义关系
4. **关键词匹配** (权重 0.6)：中文关键词到英文概念的映射
5. **数据质量** (权重 0.3)：评估数据的完整性
6. **历史连续性** (权重 0.4)：后续问题优先考虑之前使用的分析器

## 问题类型支持

系统支持以下问题类型：

| 类型 | 关键词示例 | 意图 | 优先使用的分析器 |
|------|-----------|------|----------------|
| UI 相关 | 页面、组件、布局、按钮 | ui_analysis | UI、Component |
| 数据相关 | 模型、字段、序列化 | data_analysis | Model |
| 业务逻辑 | 服务、方法、调用 | business_logic_analysis | Service、Repository |
| 状态管理 | 状态、Provider、Bloc | state_management_analysis | State |
| 网络相关 | API、请求、接口 | network_analysis | Network |
| 路由相关 | 路由、导航、跳转 | routing_analysis | Routing |
| 测试相关 | 测试、覆盖、用例 | testing_analysis | Test |

## 上下文优化

当上下文超过 token 限制时，系统会自动优化：

1. 根据问题类型确定相关维度
2. 对不相关的维度进行压缩
3. 保留最相关的详细信息

```javascript
// 示例：对于 UI 问题，数据上下文会被压缩
const options = {
  maxTokens: 5000,  // 限制 token 数量
};

const context = builder.buildQuestionContext(
  '这个应用的 UI 结构怎么样？',
  projectInfo,
  options
);
// 结果：UI 上下文完整，数据上下文被压缩
```

## 扩展性

可以轻松添加新的分析器：

```javascript
class CustomAnalyzer {
  constructor() {
    this.name = 'custom-analyzer';
  }

  analyze(files) {
    return {
      data: {
        // 分析结果
      },
    };
  }
}

// 注册到 Context Builder
builder.registerAnalyzer('custom-analyzer', new CustomAnalyzer());
```

## 最佳实践

1. **问题描述要具体**：
   - ✅ "HomePage 页面有哪些按钮？"
   - ❌ "页面怎么样？"

2. **利用上下文连续性**：
   ```javascript
   // 第一个问题
   builder.buildQuestionContext('UI 结构怎么样？', projectInfo);
   // 后续问题会利用上下文
   builder.buildQuestionContext('有哪些按钮？', projectInfo);
   ```

3. **合理设置 Token 限制**：
   - 简单问题：3000-5000 tokens
   - 复杂问题：8000-12000 tokens
   - 全局分析：15000+ tokens

4. **检查验证结果**：
   ```javascript
   const context = builder.buildQuestionContext(...);

   // 检查数据验证结果
   console.log(context.data.validation.missingSerialization);
   console.log(context.data.validation.typeMismatches);
   ```
