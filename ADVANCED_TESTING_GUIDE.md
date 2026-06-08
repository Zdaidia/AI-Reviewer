# 高级测试功能使用指南

## 🎯 概述

Dev Quality Inspector 现在支持三种强大的测试生成方式：

1. **高级 Excel 测试用例** - 使用 Excel 定义详细测试
2. **Figma 设计集成** - 从设计稿自动生成测试
3. **AI 智能生成** - AI 分析需求自动生成测试

---

## 📊 方式 1: 高级 Excel 测试用例

### 功能特性

- ✅ 支持 **30+ 种验证类型**
- ✅ 中英文 Excel 格式
- ✅ 多 Sheet 支持（测试用例、数据、Figma 规范、配置）
- ✅ JSON 格式的复杂配置
- ✅ 数据驱动测试
- ✅ Figma 设计对比

### 支持的验证类型

#### 视觉验证
- `visible` - 检查元素是否可见
- `hidden` - 检查元素是否隐藏
- `text` - 验证文本内容
- `textContains` - 验证文本包含
- `css` - 验证 CSS 属性（颜色、字体、尺寸）
- `position` - 验证元素位置
- `size` - 验证元素尺寸
- `screenshot` - 截图保存
- `screenshotMatch` - 截图对比

#### 功能验证
- `enabled` - 检查元素是否可用
- `disabled` - 检查元素是否禁用
- `checked` - 检查复选框是否选中
- `click` - 点击操作
- `fill` - 填写输入框
- `select` - 选择下拉选项

#### 数据验证
- `value` - 验证输入值
- `count` - 验证元素数量
- `tableData` - 验证表格数据
- `listItems` - 验证列表项

#### Figma 对比
- `figmaColor` - 对比 Figma 颜色
- `figmaSize` - 对比 Figma 尺寸
- `figmaFont` - 对比 Figma 字体
- `figmaLayout` - 对比 Figma 布局

### Excel Sheet 结构

#### Sheet 1: 测试用例
| 测试ID | 测试名称 | 描述 | URL | 选择器 | 验证类型 | 期望值 | 容差 | Figma URL | 优先级 | 标签 |
|--------|---------|------|-----|--------|----------|--------|------|-----------|--------|------|
| TC001 | 登录按钮视觉验证 | 验证颜色、尺寸、字体 | http://localhost:3000/login | #login-button | css | {"backgroundColor": "#1890ff", "fontSize": "16px"} | 5 | https://figma.com/file/xxx | high | visual,login |

#### Sheet 2: Figma 设计规范
| 元素ID | 选择器 | 组件名称 | 宽度 | 高度 | 背景色 | 文字颜色 | 字号 | 字体 | Figma URL | Node ID |
|--------|--------|----------|------|------|--------|----------|------|------|-----------|---------|
| EL001 | #login-button | Login Button | 120px | 40px | #1890ff | #ffffff | 16px | Arial | https://figma.com/file/xxx | 1:2 |

#### Sheet 3: 测试数据
| 数据集名称 | 描述 | username | password | expectedResult |
|-----------|------|----------|----------|---------------|
| 有效用户 | 使用有效凭据登录 | test@example.com | password123 | success |

#### Sheet 4: 配置
| 配置项 | 配置值 |
|--------|--------|
| baseUrl | http://localhost:3000 |
| timeout | 30000 |
| retries | 2 |

### 使用步骤

1. **生成模板**
```javascript
await window.electronAPI.generateAdvancedExcelTemplate('./test-template.xlsx');
```

2. **填写测试用例**
   - 打开生成的 Excel 文件
   - 在各个 Sheet 中填写测试信息
   - 支持中英文列名

3. **导入并生成测试**
```javascript
// 解析 Excel
const parsed = await window.electronAPI.parseAdvancedExcel('./test-cases.xlsx');

// 生成测试代码
const result = await window.electronAPI.generateAdvancedTest('./test-cases.xlsx', {
  language: 'javascript',
  includeComments: true,
});
```

---

## 🎨 方式 2: Figma 设计集成

### 功能特性

- ✅ 从 Figma URL 提取设计规范
- ✅ 自动生成测试用例
- ✅ 颜色、尺寸、字体、布局对比
- ✅ 批量下载设计截图
- ✅ 自动生成选择器

### 使用步骤

1. **获取 Figma 访问令牌**
   - 登录 Figma
   - 进入 Settings > Account > Personal Access Tokens
   - 创建新令牌并复制

2. **设置令牌**
```javascript
await window.electronAPI.setFigmaToken('figd_xxxxx');
```

3. **提取设计规范**
```javascript
const specs = await window.electronAPI.extractFigmaSpecs(
  'https://www.figma.com/file/xxxxx',
  '1:2'  // 可选：节点 ID
);
```

4. **生成测试用例**
```javascript
const result = await window.electronAPI.generateExcelFromFigma(
  'https://www.figma.com/file/xxxxx',
  './figma-tests.xlsx',
  {
    baseUrl: 'http://localhost:3000',
    includeColorTests: true,
    includeSizeTests: true,
    includeFontTests: true,
  }
);
```

5. **下载设计截图**
```javascript
const screenshots = await window.electronAPI.downloadFigmaScreenshots(
  'xxxxx',  // file key
  ['1:2', '1:3'],  // node IDs
  './screenshots',
  { format: 'png', scale: 2 }
);
```

---

## 🤖 方式 3: AI 智能测试生成

### 功能特性

- ✅ 分析需求文档提取功能点
- ✅ 自然语言描述生成测试
- ✅ 自动生成选择器
- ✅ 智能推断验证规则

### 使用方式

#### 方式 A: 需求文档分析

```javascript
const requirementText = `
功能要求：
1. 用户登录功能
   - 用户名输入框
   - 密码输入框
   - 登录按钮
   - 验证错误提示

2. 数据列表展示
   - 表格显示用户数据
   - 支持分页
   - 支持搜索

3. 性能要求
   - 页面加载时间 < 2s
   - API 响应时间 < 500ms
`;

const result = await window.electronAPI.generateTestsFromRequirement(requirementText, {
  projectName: 'My Project',
  baseUrl: 'http://localhost:3000',
  testType: 'comprehensive',
  includeVisualTests: true,
  includeFunctionalTests: true,
  includeDataTests: true,
  includePerformanceTests: true,
});
```

#### 方式 B: 自然语言描述

```javascript
const description = '我想测试登录页面，包括用户名和密码输入框，以及登录按钮。登录成功后应该跳转到首页，失败应该显示错误提示';

const result = await window.electronAPI.generateTestsFromDescription(description, {
  baseUrl: 'http://localhost:3000',
});
```

#### 方式 C: 选择器生成

```javascript
const result = await window.electronAPI.generateSelector(
  '登录页面中的登录按钮',
  '按钮通常是蓝色的，位于表单底部'
);
```

---

## 🔧 验证类型详解

### CSS 属性验证
```javascript
{
  selector: '#login-button',
  type: 'css',
  expected: {
    backgroundColor: '#1890ff',
    fontSize: '16px',
    padding: '8px 16px',
  }
}
```

### 尺寸验证
```javascript
{
  selector: '.header',
  type: 'size',
  expected: {
    width: '1200px',
    height: '60px',
  },
  tolerance: 2,  // 允许 ±2px 误差
}
```

### 位置验证
```javascript
{
  selector: '.logo',
  type: 'position',
  expected: {
    x: 100,
    y: 20,
  },
  tolerance: 2,
}
```

### 文本验证
```javascript
{
  selector: '.title',
  type: 'text',
  expected: '欢迎来到我的网站',
}
```

### 表格数据验证
```javascript
{
  selector: '.user-table',
  type: 'tableData',
  expected: [
    { name: '张三', email: 'zhangsan@example.com' },
    { name: '李四', email: 'lisi@example.com' },
  ],
}
```

---

## 📝 API 参考

### 高级 Excel 测试

```javascript
// 解析 Excel
window.electronAPI.parseAdvancedExcel(filePath)

// 生成测试
window.electronAPI.generateAdvancedTest(excelPath, options)

// 生成模板
window.electronAPI.generateAdvancedExcelTemplate(outputPath)

// 获取验证类型说明
window.electronAPI.getValidationTypesInfo()

// 获取操作类型说明
window.electronAPI.getActionTypesInfo()
```

### Figma 集成

```javascript
// 设置访问令牌
window.electronAPI.setFigmaToken(token)

// 提取设计规范
window.electronAPI.extractFigmaSpecs(figmaUrl, nodeId)

// 从 Figma 生成 Excel
window.electronAPI.generateExcelFromFigma(figmaUrl, outputPath, options)

// 下载截图
window.electronAPI.downloadFigmaScreenshots(fileKey, nodeIds, outputDir, options)

// 获取文件信息
window.electronAPI.getFigmaFile(fileKey)

// 获取节点信息
window.electronAPI.getFigmaNode(fileKey, nodeId)
```

### AI 测试生成

```javascript
// 从需求文档生成
window.electronAPI.generateTestsFromRequirement(requirementText, options)

// 从 Figma 生成
window.electronAPI.generateTestsFromFigma(figmaSpecs, options)

// 从描述生成
window.electronAPI.generateTestsFromDescription(description, options)

// 生成选择器
window.electronAPI.generateSelector(elementDescription, context)
```

---

## 🎨 UI 使用

### 打开高级测试弹窗

在主界面点击 "🧪 高级测试" 按钮，选择测试生成方式：

1. **Excel 测试用例** - 上传 Excel 文件
2. **Figma 设计规范** - 输入 Figma URL
3. **AI 智能生成** - 粘贴需求或描述

### 配置测试选项

- **基础 URL** - 项目地址
- **测试类型** - 基础/冒烟/综合/回归
- **包含测试** - 视觉/功能/数据/性能

### 查看生成的测试

生成的测试用例会显示：
- 测试 ID
- 测试名称
- 测试类型
- 优先级
- 描述
- 验证规则

### 导出和运行

- **导出 Excel** - 保存为 Excel 文件
- **运行测试** - 立即执行测试

---

## 💡 最佳实践

### 1. 选择合适的验证类型

- **视觉测试**：使用 `css`, `size`, `position`, `screenshot`
- **功能测试**：使用 `enabled`, `visible`, `click`, `fill`
- **数据测试**：使用 `text`, `value`, `tableData`, `count`
- **性能测试**：设置 `maxLoadTime`, `maxResponseTime`

### 2. 设置合理的容差

```javascript
{
  tolerance: 2,  // 尺寸和位置允许 ±2px
  colorTolerance: 5,  // 颜色允许 ±5 差异
}
```

### 3. 使用数据驱动测试

在 Excel 的"测试数据" Sheet 中定义多组数据：
```javascript
{
  "数据集名称": ["有效用户", "无效密码", "空用户名"],
  "username": ["test@example.com", "test@example.com", ""],
  "password": ["password123", "wrong", "password123"],
  "expectedResult": ["success", "error", "error"]
}
```

### 4. 结合 Figma 设计

1. 在 Figma 中命名图层（会成为选择器）
2. 使用 Figma URL 生成测试
3. 自动对比颜色、尺寸、字体

### 5. AI 生成提示词技巧

**好的需求描述：**
```
用户登录功能：
- 输入框：用户名（必填）、密码（必填，最少6位）
- 按钮：登录（蓝色，居中）
- 验证：空值提示、格式检查、登录失败提示
- 成功：跳转到首页
- 性能：登录响应 < 1s
```

**避免的描述：**
```
测试登录  // 太简单，AI 无法生成详细测试
```

---

## 🐛 常见问题

### Q: Excel 解析失败？
A: 检查列名是否正确，支持中英文。使用 `generateAdvancedExcelTemplate()` 生成标准模板。

### Q: Figma 访问被拒绝？
A: 确保访问令牌有效，且有文件的查看权限。

### Q: AI 生成的测试不准确？
A: 提供更详细的需求描述，包括具体的元素位置、预期行为等。

### Q: 选择器找不到元素？
A: 检查选择器是否正确，可以在浏览器开发者工具中验证。

### Q: 截图对比失败？
A: 确保 Figma 节点 ID 正确，网络可以访问 Figma API。

---

## 📚 示例

### 完整示例：用户登录测试

#### Excel 配置

**测试用例 Sheet:**

| 测试ID | 测试名称 | 描述 | URL | 选择器 | 验证类型 | 期望值 | 容差 | 优先级 |
|--------|---------|------|-----|--------|----------|--------|------|--------|
| TC001 | 登录按钮样式 | 验证按钮符合设计 | http://localhost:3000/login | #login-btn | css | {"backgroundColor":"#1890ff","color":"#fff"} | 5 | high |
| TC002 | 用户名输入 | 验证用户名输入框 | http://localhost:3000/login | #username | visible | true | - | high |
| TC003 | 密码输入 | 验证密码输入框 | http://localhost:3000/login | #password | visible | true | - | high |
| TC004 | 登录功能 | 测试登录流程 | http://localhost:3000/login | - | - | - | - | critical |

**测试数据 Sheet:**

| 数据集名称 | 描述 | username | password | expectedResult |
|-----------|------|----------|----------|---------------|
| 有效用户 | 正常登录 | test@example.com | password123 | success |
| 错误密码 | 密码错误 | test@example.com | wrong | error |
| 空用户名 | 用户名为空 | | password123 | error |

#### 使用代码

```javascript
// 1. 生成模板
await window.electronAPI.generateAdvancedExcelTemplate('./login-tests.xlsx');

// 2. 填写 Excel（手动或通过程序）

// 3. 导入并生成测试
const result = await window.electronAPI.generateAdvancedTest('./login-tests.xlsx', {
  baseUrl: 'http://localhost:3000',
  testType: 'comprehensive',
});

// 4. 运行测试
if (result.success) {
  await onRunTests(result.testCases);
}
```

---

## 🚀 下一步

- ✅ 尝试生成 Excel 模板
- ✅ 测试 Figma 集成
- ✅ 使用 AI 生成测试
- ✅ 运行并查看测试报告

祝测试愉快！🎉
