/**
 * AI 提示词模板
 *
 * 为 QA Reviewer 提供专业的 AI 提示词模板
 */

const PromptTemplates = {
  /**
   * 需求符合性验证提示词
   */
  requirementCompliance: {
    system: `你是一个资深的 QA 工程师，专门负责验证代码实现是否符合产品需求。

你的职责：
1. 理解需求文档的完整意图
2. 分析代码实现是否满足需求
3. 识别需求与实现之间的差异
4. 提供具体、可操作的修复建议

输出要求：
- 客观、准确，基于事实进行分析
- 问题描述清晰，指出具体文件和行号
- 修复建议具体可行，避免泛泛而谈
- 使用 JSON 格式输出，便于程序解析`,

    user: (params) => {
      const { requirements, uiDesign, codeContext, dimensions } = params;

      let dimensionDesc = '';
      if (dimensions && dimensions.length > 0) {
        const descMap = {
          functionality: '功能完整性：需求中的所有功能是否都已实现',
          uiConsistency: 'UI 一致性：界面样式、布局、交互是否与设计稿一致',
          dataValidation: '数据验证：输入验证、边界条件是否符合需求',
          exceptionHandling: '异常处理：错误场景是否按需求处理',
          optimization: '代码优化：性能优化、重构建议',
          quality: '代码质量：内存泄漏、死循环、潜在崩溃等',
        };
        dimensionDesc = dimensions.map(d => `- ${descMap[d] || d}`).join('\n');
      }

      return `# 需求符合性验证

## 需求文档
\`\`\`
${typeof requirements === 'string' ? requirements : JSON.stringify(requirements, null, 2)}
\`\`\`

${uiDesign ? `
## UI 设计稿
${uiDesign}
` : ''}

${codeContext ? `
## 代码上下文
相关文件：${codeContext.files?.slice(0, 10).join(', ') || '未提供'}
功能点：${codeContext.features?.join(', ') || '未提供'}
` : ''}

## 验证维度
${dimensionDesc || '- 功能完整性\n- UI 一致性\n- 数据验证\n- 异常处理'}

## 分析要求

请仔细分析以上代码是否符合需求，对于每个发现的问题：

1. **明确标识问题类型**：
   - QA-FUNC: 功能缺失/不完整
   - QA-UI: UI 不一致
   - QA-DATA: 数据验证问题
   - QA-EXCEPT: 异常处理缺失
   - QA-OPT: 优化建议
   - QA-QUAL: 代码质量问题

2. **评估严重程度**：
   - high: 阻塞功能使用、数据丢失风险、安全漏洞
   - medium: 功能部分不可用、用户体验差
   - low: 优化建议、代码风格

3. **提供具体信息**：
   - 文件路径和行号（如能确定）
   - 具体问题描述
   - 对应的需求原文
   - 可操作的修复建议

## 输出格式

请按以下 JSON 格式输出：

\`\`\`json
{
  "summary": {
    "overallStatus": "passed|failed|partial",
    "totalIssues": 0,
    "bySeverity": { "high": 0, "medium": 0, "low": 0 },
    "byDimension": {
      "functionality": { "passed": true, "issues": 0 },
      "uiConsistency": { "passed": true, "issues": 0 },
      "dataValidation": { "passed": true, "issues": 0 },
      "exceptionHandling": { "passed": true, "issues": 0 }
    }
  },
  "issues": [
    {
      "ruleId": "QA-FUNC-001",
      "dimension": "functionality",
      "severity": "high",
      "file": "lib/pages/login.dart",
      "line": 45,
      "message": "缺少用户名长度验证",
      "requirement": "需求要求用户名长度为3-20字符",
      "suggestion": "在用户名输入框添加长度验证：if (username.length < 3 || username.length > 20) { return '用户名长度必须在3-20个字符之间'; }"
    }
  ]
}
\`\`\`

如果代码完全符合需求，返回：
\`\`\`json
{
  "summary": {
    "overallStatus": "passed",
    "totalIssues": 0,
    "comment": "代码实现完全符合需求"
  },
  "issues": []
}
\`\`\`
`;
    },
  },

  /**
   * UI 一致性检查提示词
   */
  uiConsistency: {
    system: `你是一个 UI/UX 专家，专门负责对比设计稿和实际代码实现的一致性。

你的职责：
1. 理解设计稿中的 UI 规范
2. 分析代码实现的 UI 组件
3. 识别视觉差异和交互差异
4. 提供具体的修复建议

输出要求：
- 准确识别颜色、尺寸、间距、字体等视觉差异
- 检查交互逻辑是否与设计一致
- 使用 Flutter Widget 术语描述代码`,

    user: (params) => {
      const { uiDesign, codeComponents, platform = 'flutter' } = params;

      return `# UI 一致性验证

## 设计稿描述
${uiDesign}

## 已实现的 UI 组件
${codeComponents.map(c => `- ${c.name}: ${c.description || '无描述'}`).join('\n')}

## 平台技术
${platform === 'flutter' ? 'Flutter (Dart)' : platform}

## 检查项目

请对比设计稿和代码实现，检查以下方面：

### 视觉要素
- 颜色：主色、辅助色、文字颜色是否一致
- 字体：字号、字重、行高是否符合设计
- 间距：内边距、外边距、组件间距
- 圆角：按钮、卡片、输入框的圆角半径
- 阴影： elevation、box-shadow 效果

### 布局
- 组件排列方式（Row/Column/Stack）
- 对齐方式（对齐到顶部/居中/底部）
- 权重分配（flex/Expanded 比例）
- 响应式布局（不同屏幕尺寸）

### 交互
- 点击事件响应
- 状态变化（禁用、加载、错误）
- 动画效果
- 手势支持

## 输出格式

\`\`\`json
{
  "summary": {
    "overallMatch": true/false,
    "matchScore": 85,
    "differences": 5
  },
  "issues": [
    {
      "ruleId": "QA-UI-001",
      "severity": "medium",
      "widget": "LoginButton",
      "property": "color",
      "expected": "蓝色 #4F9EFF",
      "actual": "灰色 #888888",
      "message": "登录按钮颜色与设计稿不符",
      "suggestion": "将按钮颜色修改为 Color(0xFF4F9EFF) 或主题色 blueAccent"
    }
  ]
}
\`\`\`
`;
    },
  },

  /**
   * 代码优化建议提示词
   */
  optimization: {
    system: `你是一个资深的代码审查专家，专门负责识别代码中的优化机会。

你的职责：
1. 识别性能瓶颈
2. 识别可重构的代码
3. 识别不遵循最佳实践的代码
4. 提供具体的优化建议

输出要求：
- 优先关注影响较大的优化点
- 提供量化的优化效果说明
- 给出具体的代码示例`,

    user: (params) => {
      const { codeContext, targetFiles = [] } = params;

      return `# 代码优化建议

## 目标文件
${targetFiles.slice(0, 20).join('\n')}

## 分析重点

请从以下方面分析代码并提供优化建议：

### 性能优化
- **避免不必要的重建**：使用 const 构造函数、提取子组件
- **懒加载**：延迟加载非首屏内容
- **缓存优化**：缓存计算结果、网络请求
- **列表优化**：使用 ListView.builder、itemExtent

### 代码质量
- **代码重复**：提取公共逻辑到函数/组件
- **命名规范**：使用语义化的变量/函数名
- **注释文档**：为复杂逻辑添加注释
- **类型安全**：使用 Dart 的 null safety

### 架构设计
- **状态管理**：是否合理使用 Provider/Riverpod
- **依赖注入**：是否减少耦合
- **单一职责**：类/函数是否职责单一

## 输出格式

\`\`\`json
{
  "summary": {
    "optimizationCount": 5,
    "potentialImprovements": "性能可提升约 30%"
  },
  "suggestions": [
    {
      "ruleId": "QA-OPT-001",
      "severity": "low",
      "category": "performance",
      "file": "lib/pages/home_page.dart",
      "line": 45,
      "message": "ListView 未使用 builder 模式",
      "impact": "当列表项超过 20 个时会出现卡顿",
      "suggestion": "将 ListView(...) 替换为 ListView.builder(...)"
    }
  ]
}
\`\`\`
`;
    },
  },

  /**
   * 代码质量检查提示词
   */
  codeQuality: {
    system: `你是一个代码质量分析专家，专门负责识别代码中的质量问题。

你的职责：
1. 识别潜在的运行时错误
2. 识别内存泄漏风险
3. 识别死循环或无限递归
4. 识别空指针解引用风险

输出要求：
- 优先关注会导致崩溃的问题
- 指出具体的代码行
- 给出修复代码示例`,

    user: (params) => {
      const { codeFiles = [] } = params;

      return `# 代码质量检查

## 目标文件
${codeFiles.slice(0, 10).join('\n')}

## 检查项目

### 运行时错误
- **空指针解引用**：在使用对象前检查 null
- **数组越界**：访问数组前检查长度
- **类型转换错误**：避免不安全的类型转换

### 内存问题
- **内存泄漏**：监听器未移除、控制器未释放
- **大对象常驻内存**：及时释放大对象

### 逻辑错误
- **死循环**：避免无条件递归
- **条件永远不满足**：检查 if/while 条件
- **break/return 缺失**：switch 缺少 break

### Flutter 特定问题
- **Build 方法包含复杂逻辑**：影响性能
- **setState 在 dispose 后调用**：检查 mounted 状态
- **async/await 错误使用**：正确处理异常

## 输出格式

\`\`\`json
{
  "summary": {
    "criticalIssues": 1,
    "warnings": 3,
    "totalIssues": 4
  },
  "issues": [
    {
      "ruleId": "QA-QUAL-001",
      "severity": "high",
      "category": "crash",
      "file": "lib/controllers/auth_controller.dart",
      "line": 78,
      "message": "可能存在空指针解引用风险",
      "code": "user.name.toLowerCase()",
      "fix": "改为: user?.name?.toLowerCase() ?? ''"
    }
  ]
}
\`\`\`
`;
    },
  },

  /**
   * 构建需求符合性验证提示词
   */
  buildCompliancePrompt: function(params) {
    return this.requirementCompliance.user(params);
  },

  /**
   * 构建优化建议提示词
   */
  buildOptimizationPrompt: function(params) {
    return this.optimization.user(params);
  },

  /**
   * 构建代码质量检查提示词
   */
  buildQualityPrompt: function(params) {
    return this.codeQuality.user(params);
  },
};

module.exports = PromptTemplates;
