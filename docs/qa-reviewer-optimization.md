# QA Reviewer 审查逻辑优化文档

> **文档版本**: 1.0
> **更新日期**: 2026-04-15
> **相关文件**: `src/core/qa-reviewer/executor/segment-executor.js`

## 背景问题

当前 QA Reviewer 在审查代码时存在以下问题：

### 1. 通用组件被错误检查页面需求
- **问题**: `table.dart` 是通用组件，有排序功能但需要页面传参
- **错误行为**: 报告"表格组件未实现排序功能"的问题
- **根本原因**: 未区分通用组件和页面特定组件

### 2. 验证逻辑位置判断不明确
- **问题**: 表单验证在 view 页面，按规范可能在 Controller 更合理
- **错误行为**: 直接报"问题"而非"优化建议"
- **根本原因**: 缺乏架构最佳实践指导

### 3. Provider 层职责判断不准确
- **问题**: Provider 只处理 API 逻辑，不应该有参数格式校验
- **错误行为**: 如果 view 中已有验证，仍报问题
- **根本原因**: 各层验证职责定义不清晰

### 4. 需求明确性判断缺失
- **问题**: 'locked' 状态处理，需求未明确要求但仍报问题
- **错误行为**: 对未明确要求的功能报告"缺失"
- **根本原因**: 缺乏需求明确性判断原则

## 优化方案

### 1. 增强组件分类逻辑

**位置**: `segment-executor.js` 第 567-594 行

```javascript
// 通用组件识别函数
const isGenericComponent = (filePath, fileRole) => {
  const normalizedPath = filePath.replace(/\\/g, '/').toLowerCase();

  // 通用组件路径
  const genericPaths = [
    '/lib/components/',
    '/lib/widgets/',
    '/lib/elements/',
    '/lib/ui/',
    '/lib/shared/',
  ];

  // 通用组件名称关键词
  const genericNames = [
    'table', 'button', 'input', 'dropdown', 'card',
    'modal', 'dialog', 'tooltip', 'pagination',
    'breadcrumb', 'filter', 'search', 'form',
    'list', 'grid', 'container', 'wrapper'
  ];

  // 路径判断
  if (genericPaths.some(p => normalizedPath.includes(p))) {
    return true;
  }

  // 文件名判断
  const fileName = path.basename(filePath).toLowerCase();
  if (genericNames.some(n => fileName.includes(n))) {
    return true;
  }

  return false;
};
```

**识别标准**:
1. 路径判断：文件位于 `/lib/components/`、`/lib/widgets/` 等目录
2. 名称判断：文件名包含 table、button、input 等通用组件关键词

### 2. 架构验证最佳实践指南

**位置**: `segment-executor.js` 第 743-820 行

各层验证职责划分：

| 层级 | 职责 | 应包含的验证 | 不应包含 |
|------|------|-------------|---------|
| **View 层** | UI 显示正确性、用户交互响应 | 用户输入格式展示、UI 状态切换 | 复杂业务逻辑验证 |
| **Controller 层** | 业务规则验证、数据转换 | 业务逻辑校验、数据一致性检查 | - |
| **API/Service 层** | API 调用管理、错误处理 | - | 参数格式校验 |
| **Model 层** | 数据结构定义、类型约束 | 数据类型约束、必填字段定义 | - |
| **通用组件** | 可复用功能，通过参数控制 | 组件本身的 bug、参数定义 | 页面特定功能需求 |

### 3. 需求明确性判断原则

**位置**: `segment-executor.js` 第 821-845 行

只有满足以下条件时，才能报告"功能缺失"问题：

1. ✅ 需求中**明确提到**的功能（使用具体关键词）
   - 关键词："必须"、"需要"、"应该"、"要求"
   - 示例："必须支持排序"、"需要验证邮箱格式"

2. ✅ 需求中**明确列出**的状态或条件
   - 示例：状态列表包含 "locked"、"disabled"、"readonly"

3. ❌ 需求中**未提及**的功能，不应报"缺失"
   - 可以作为"优化建议"提出，severity 应为 "low"

4. ⚠️ 对于通用组件
   - 不应报告"缺少某功能"，因为功能通过参数传递
   - 只报告组件本身的 bug 或设计缺陷

### 4. 问题类型和严重程度标准

**位置**: `segment-executor.js` 第 875-920 行

#### ruleId 规则前缀

| 前缀 | 类型 | 说明 |
|------|------|------|
| `QA-FUNC-XXX` | 功能缺失 | 需求明确要求但缺失 |
| `QA-ARCH-XXX` | 架构优化 | 验证逻辑位置、代码组织等 |
| `QA-OPT-XXX` | 一般优化 | 代码风格、性能优化建议 |
| `QA-BUG-XXX` | 代码缺陷 | 逻辑错误、潜在 bug |
| `QA-SEC-XXX` | 安全问题 | 安全漏洞、敏感信息泄露 |

#### severity 选择标准

| 级别 | 适用场景 |
|------|---------|
| **high** | 需求明确要求但完全缺失，或存在安全漏洞 |
| **medium** | 需求明确要求但部分实现，或存在功能缺陷 |
| **low** | 优化建议、架构改进、代码风格（非需求不符） |

#### 问题描述格式

```javascript
// 功能缺失
{
  ruleId: "QA-FUNC-001",
  message: "功能缺失：XXX 功能未实现",
  severity: "high"
}

// 架构优化
{
  ruleId: "QA-ARCH-001",
  message: "验证逻辑位置建议：XXX 验证建议放在 YYY 层更合理",
  severity: "low"
}

// 一般优化
{
  ruleId: "QA-OPT-001",
  message: "优化建议：XXX 可以改进",
  severity: "low"
}
```

### 5. 通用组件特殊审查规则

**位置**: `segment-executor.js` 第 730-743 行

当检测到通用组件时，向 AI 添加特殊提示：

```
【通用组件审查说明】
本次审查包含以下通用组件：
   - table.dart (component)

通用组件审查原则：
1. 组件通过参数接收配置，不应假设页面特定需求
2. 只检查组件自身的 bug、参数定义、文档完整性
3. 不应报告"缺少排序"、"缺少筛选"等功能性问题
4. 如果发现参数不完整，应报告"参数定义"问题而非"功能缺失"
5. 通用组件的问题请使用 QA-OPT-XXX 前缀（优化建议）
```

### 6. parseResponse 响应解析增强

**位置**: `segment-executor.js` 第 940-965 行

```javascript
// 标记优化建议类问题
const ruleId = issue.ruleId || 'QA-UNKNOWN';
const isOptimization = ruleId.startsWith('QA-ARCH-') ||
                      ruleId.startsWith('QA-OPT-') ||
                      ruleId.startsWith('QA-REF-');

issues.push({
  ruleId: ruleId,
  severity: issue.severity || 'medium',
  filePath: cleanPath,
  line: issue.line || 0,
  message: issue.message || issue.description || '',
  suggestion: issue.suggestion || '',
  source: isOptimization ? 'architecture-optimization' : 'ai-requirement',
  category: isOptimization ? 'optimization' : 'issue'
});
```

**新增字段**:
- `source`: 标识问题来源
  - `ai-requirement`: AI 发现的需求不符问题
  - `architecture-optimization`: AI 发现的架构优化建议
- `category`: 问题分类
  - `issue`: 需求不符问题
  - `optimization`: 优化建议

## 修改记录

### 2026-04-15
- 添加通用组件识别函数 `isGenericComponent`
- 添加架构验证最佳实践指南
- 添加需求明确性判断原则
- 更新输出格式说明，区分问题类型
- 更新 parseResponse 方法，支持新的规则类型

## 后续优化方向

1. **通用组件识别增强**
   - 添加更多通用组件关键词
   - 支持从配置文件读取通用组件列表

2. **规则前缀扩展**
   - 根据实际审查需求添加更多规则前缀
   - 建立规则库，方便复用

3. **架构分析增强**
   - 集成代码图分析，自动识别调用关系
   - 基于调用关系提供更精准的架构建议

4. **需求分析增强**
   - 支持 NLP 解析需求文档，自动提取功能点
   - 建立需求-代码映射关系

## 相关文件

- `src/core/qa-reviewer/executor/segment-executor.js` - 主要实现文件
- `src/core/qa-reviewer/strategies/segment-strategy.js` - 分段策略
- `src/core/qa-reviewer/utils/code-slicer.js` - 代码切片工具

## 维护指南

### 如何添加新的通用组件关键词

编辑 `segment-executor.js` 中的 `genericNames` 数组：

```javascript
const genericNames = [
  'table', 'button', 'input', 'dropdown', 'card',
  // 添加新的关键词
  'your-component-name',
];
```

### 如何添加新的规则前缀

1. 在提示词的 `ruleId` 规则部分添加新前缀说明
2. 在 `parseResponse` 方法中更新 `isOptimization` 判断逻辑（如需要）

### 如何调整架构验证指南

编辑 `segment-executor.js` 中的【架构验证最佳实践】部分，添加或修改各层的职责说明。
