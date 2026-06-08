# Windows 环境下 Canvas 模块限制说明

## 问题描述

在 Windows 环境下，`canvas` npm 模块需要 GTK (GIMP Toolkit) 库才能编译和使用。GTK 是一个复杂的跨平台 UI 工具包，在 Windows 上安装需要：

1. 安装 GTK 开发库（~100MB）
2. 配置环境变量
3. 可能需要其他系统依赖

## 不建议安装 Canvas 的原因

1. **依赖复杂** - 需要 GTK 和多个系统库
2. **安装困难** - Windows 上配置 GTK 容易出错
3. **维护成本高** - 可能影响系统稳定性
4. **有替代方案** - Playwright 内置了截图对比功能

## 受限的功能

以下功能需要 Canvas 模块：

### ❌ 像素级视觉回归测试
- `pixelmatch` - 逐像素对比
- `ssim` - 结构相似性指数
- 差异热图生成
- 差异图生成

## ✅ 可用的替代方案

### 1. Playwright 内置截图对比
```javascript
// 使用 Playwright 的内置截图对比
await expect(page).toHaveScreenshot('baseline.png');

// 或使用自定义对比
const screenshot = await page.screenshot();
// 使用其他工具对比
```

### 2. 布局对比
- 通过 DOM 结构分析
- CSS 属性验证
- 元素位置和尺寸检查

### 3. 颜色对比
- 通过 CSS 属性验证
- Figma 设计规范对比
- 计算颜色差异（不需要 Canvas）

### 4. 功能验证
- 所有 30+ 种验证类型都可用
- Excel 测试用例完全支持
- Figma 集成完全可用
- AI 测试生成完全可用

## 完全可用的功能列表

### ✅ 核心测试功能
1. **Excel 高级测试用例** - 支持所有验证类型
2. **Figma API 集成** - 设计规范提取和对比
3. **AI 智能测试生成** - GLM-5 驱动
4. **Playwright E2E 测试** - 完整的功能测试
5. **增强测试报告** - HTML/JSON/JUnit 格式

### ✅ 支持的验证类型（30+）

#### 视觉验证（不需要 Canvas）
- `visible` - 元素可见性
- `hidden` - 元素隐藏
- `text` - 文本内容
- `textContains` - 文本包含
- `textMatches` - 文本正则匹配
- `attribute` - 属性值
- `css` - CSS 属性（颜色、字体、尺寸）
- `position` - 位置验证
- `size` - 尺寸验证
- `screenshot` - 截图（使用 Playwright）

#### 功能验证
- `enabled` - 可用状态
- `disabled` - 禁用状态
- `checked` - 选中状态
- `selected` - 选择状态
- `focus` - 焦点状态
- `click` - 点击操作
- `fill` - 填写表单
- `type` - 输入文本
- `select` - 下拉选择
- `check` - 勾选
- `hover` - 悬停
- `dragAndDrop` - 拖拽

#### 数据验证
- `value` - 值验证
- `count` - 数量验证
- `tableData` - 表格数据
- `listItems` - 列表项
- `apiResponse` - API 响应

#### Figma 对比（不需要 Canvas）
- `figmaColor` - 颜色对比（通过 CSS）
- `figmaSize` - 尺寸对比
- `figmaFont` - 字体对比
- `figmaLayout` - 布局对比

#### 性能测试
- `maxLoadTime` - 最大加载时间
- `maxResponseTime` - 最大响应时间
- `checkMemory` - 内存检查
- `checkLCP` - LCP 检查
- `checkCLS` - CLS 检查

## 推荐方案

对于视觉回归测试，建议使用以下方案：

### 方案 1：Playwright 内置对比（推荐）
```javascript
// 在测试用例中使用
test('Visual regression test', async ({ page }) => {
  await page.goto('http://localhost:3000');
  await expect(page).toHaveScreenshot();
});
```

### 方案 2：第三方服务
- **Percy** - https://percy.io
- **Applitools** - https://applitools.com
- **Chromatic** - https://www.chromatic.com

这些服务提供云端视觉回归测试，无需本地安装复杂依赖。

### 方案 3：使用 Sharp 或 Jimp
这些库的 Windows 依赖比 Canvas 少：
```bash
npm install sharp
# 或
npm install jimp
```

## 总结

Canvas 模块在 Windows 上的安装成本很高，但：

1. **所有核心测试功能都完全可用**
2. **有多种替代方案可以实现视觉回归测试**
3. **Playwright 内置功能已足够强大**

建议使用 Playwright 内置的截图对比功能，或考虑第三方视觉测试服务。
