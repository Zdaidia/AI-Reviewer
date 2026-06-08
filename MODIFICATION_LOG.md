# 修改记录

## 2025-03-26 修复编辑时用例详情为空的问题

### 问题描述
点击编辑按钮后，前置条件、执行步骤、预期结果的输入框都是空的，没有显示生成的用例数据。

### 修改文件
- `E:\AI\dev-quality-inspector\src\components\RightPanel.jsx`

### 具体修改

**修改 1: 添加辅助函数提取文本值 (行 757-793)**

```javascript
// 辅助函数：提取 given 的文本值
const getGivenText = () => {
  if (!scenario.given) return '';
  if (typeof scenario.given === 'string') return scenario.given;
  if (typeof scenario.given === 'object') {
    return scenario.given.text || scenario.given.description || scenario.given.value || JSON.stringify(scenario.given);
  }
  return '';
};

// 同样添加 getWhenText() 和 getThenText()
```

**修改 2: 更新数据绑定使用辅助函数**

修改前：
```jsx
<textarea
  value={
    typeof scenario.given === 'object'
      ? (scenario.given.text || scenario.given.description || '')
      : (scenario.given || scenario.preconditions || '')
  }
/>
```

修改后：
```jsx
<textarea
  value={getGivenText()}
  onChange={(e) => updateScenario(mIdx, sIdx, 'given', e.target.value)}
/>
```

**修改 3: 改进 updateScenario 函数 (行 658-700)**

```javascript
const updateScenario = (mIdx, sIdx, field, value) => {
  // ... 深拷贝操作 ...

  // 根据字段类型进行特殊处理
  if (field === 'given') {
    if (typeof scenario.given === 'object' && scenario.given !== null) {
      scenario.given = {
        ...scenario.given,
        text: value,
        description: value
      };
    } else {
      scenario.given = value;
    }
  }
  // ... when/then 同样处理 ...
}
```

**添加调试日志**：
```javascript
console.log(`[RightPanel] 场景 ${scenario.id}:`, {
  given: scenario.given,
  when: scenario.when,
  then: scenario.then,
  givenType: typeof scenario.given,
  // ...
});
```

### 预期效果

- 点击编辑后，输入框会自动填充生成的用例数据
- 支持多种数据格式（字符串、对象、对象嵌套）
- 添加调试日志方便排查问题

### 测试验证

刷新浏览器后：
1. 点击某个测试文档的编辑按钮
2. 查看控制台日志，确认数据结构
3. 检查前置条件、执行步骤、预期结果是否正确显示

---

## 2025-03-26 测试文档列表响应式优化

### 问题描述
1. 窗口较小时，测试文档列表的文字被遮挡，看不到后面的操作按钮和图标
2. 展开时显示了详细的每条用例信息和"注:xxx"描述，占用太多空间

### 修改文件
- `E:\AI\dev-quality-inspector\src\components\RightPanel.jsx`

### 具体修改

**修改 1: 紧凑化头部布局 (行 946-980)**

修改前：
- 标题文字较长时按钮被遮挡
- 按钮尺寸较大 (w-8 h-8)
- "新增文档"按钮文字较长

修改后：
```jsx
{/* Header - 更紧凑 */}
<div className="p-2 ..."> {/* p-3 → p-2 */}
  <h3 className="text-sm ... truncate">测试文档</h3>
  <button className="px-2 py-1 ...">+ 新增</button> {/* 缩短文字 */}
</div>

{/* 文档项 - 紧凑布局 */}
<div className="flex items-center justify-between gap-2">
  {/* 左侧 */}
  <div className="flex items-center gap-1.5 min-w-0 flex-1">
    <span className="text-sm ... w-4 text-center">▶</span>
    <h4 className="text-xs ... truncate">{doc.projectName}</h4> {/* text-sm → text-xs */}
    <span className="... px-1.5 py-0.5 ...">{totalCases}</span> {/* 减少内边距 */}
  </div>

  {/* 右侧按钮 - 固定尺寸 */}
  <div className="flex items-center gap-1 flex-shrink-0">
    <button className="w-7 h-7 ...">▶</button> {/* w-8 h-8 → w-7 h-7 */}
    <button className="w-7 h-7 ...">✎</button>
    <button className="w-7 h-7 ...">×</button>
  </div>
</div>
```

**修改 2: 移除不必要的显示 (行 989-1020)**

移除内容：
- "注: {doc.metadata.requirements}" 描述
- 展开时的详细用例列表 (scenario.id + scenario.name)

替换为简化提示：
```jsx
{/* 展开时只显示摘要 */}
{isExpanded && (
  <div className="p-2 bg-gray-900/50">
    <p className="text-xs text-gray-400 pl-6">
      共 {totalCases} 个测试用例，点击编辑查看详情
    </p>
  </div>
)}
```

**修改 3: 调整间距和字体大小**

| 元素 | 修改前 | 修改后 |
|------|--------|--------|
| 列表项间距 | space-y-3 | space-y-2 |
| 列表内边距 | p-3 | p-2 |
| 标题字体 | text-sm | text-xs |
| 按钮尺寸 | w-8 h-8 | w-7 h-7 |
| 图标间距 | gap-2 | gap-1.5 |

### 预期效果
- 窗口较小时也能看到所有操作按钮
- 列表更紧凑，显示更多内容
- 展开时只显示摘要，点击编辑查看详情

---

## 2025-03-26 修复新增文档和编辑功能问题

### 问题描述
1. **新增文档按钮被禁用**：点击"新增文档"时，输入框无法使用，被错误地禁用
2. **编辑时缺少详细数据**：编辑测试用例时，只显示标题，没有显示完整的执行步骤和验证步骤

### 修改文件
- `E:\AI\dev-quality-inspector\src\components\AISmartTestModal.jsx`
- `E:\AI\dev-quality-inspector\src\components\RightPanel.jsx`

### 具体修改

**修改 1: AISmartTestModal - 新增文档模式不自动加载已保存用例 (行 87-134)**

修改前：即使新增文档，也会自动加载已保存的测试用例并禁用输入框

修改后：
```javascript
// 如果是新增文档模式（hideSavedCasesOption=true），不自动加载已保存的测试用例
if (hideSavedCasesOption) {
  console.log('[AISmartTest] 新增文档模式，不自动加载已保存的测试用例');
  setSelectedSavedTestCase(null);
  setUseSavedTestCases(false);
  return;
}
```

**修改 2: AISmartTestModal - 修复 preselectedTestCase 逻辑 (行 78-93)**

修改前：preselectedTestCase 改变时总是设置 useSavedTestCases=true

修改后：
```javascript
// 如果是新增文档模式，不使用预选择的测试用例
if (hideSavedCasesOption) {
  console.log('[AISmartTest] 新增文档模式，忽略预选择的测试用例');
  setSelectedSavedTestCase(null);
  setUseSavedTestCases(false);
  return;
}
```

**修改 3: RightPanel - 添加编辑调试日志和错误提示 (行 575-620)**

```javascript
// 添加调试日志
console.log('[RightPanel] 编辑文档:', {
  projectName: editingDocument.projectName,
  hasTestPlan: !!editingDocument.testPlan,
  modulesCount: editingDocument.testPlan?.modules?.length || 0
});

// 如果没有 testPlan，显示警告
if (!editingDocument.testPlan || !editingDocument.testPlan.modules) {
  return (
    <div className="...">
      <p className="text-yellow-400">⚠️ 测试计划数据不完整</p>
      <p className="text-xs text-gray-400">请重启应用后重试</p>
    </div>
  );
}
```

### 注意事项

**编辑功能需要重启 Electron 主进程**
- `test-case-storage.js` 的修改（返回完整 testPlan）在 Electron 主进程中
- 需要完全重启应用才能生效
- 重启后编辑界面会显示完整的测试用例信息

### 预期效果
- 点击"新增文档"可以正常输入需求
- 编辑时显示完整的测试用例结构（需重启应用）

---

## 2025-03-26 修复测试用例列表文字溢出问题

### 问题描述
测试用例列表中，项目名称或需求描述太长时，后面的操作按钮（运行、编辑、删除）被挤出屏幕看不到。

### 修改文件
- `E:\AI\dev-quality-inspector\src\components\RightPanel.jsx`

### 具体修改

**修改测试文档列表头部样式 (行 940-960)**

修改前（文字溢出，按钮被遮挡）:
```jsx
<div className="flex-1 min-w-0">
  <div className="flex items-center gap-2">
    <span className="text-lg text-white">...</span>
    <h4 className="text-sm font-medium text-white truncate">{doc.projectName}</h4>
    <span className="text-xs bg-blue-900 ...">{totalCases} 个用例</span>
  </div>
</div>
```

修改后（文字正确截断，按钮始终可见）:
```jsx
<div className="flex-1 min-w-0 overflow-hidden">
  <div className="flex items-center gap-2 min-w-0">
    <span className="text-lg text-white flex-shrink-0">...</span>
    <h4 className="text-sm font-medium text-white truncate min-w-0" title={doc.projectName}>
      {doc.projectName}
    </h4>
    <span className="text-xs bg-blue-900 ... flex-shrink-0">
      {totalCases} 个用例
    </span>
  </div>
</div>
```

### 关键修改点

| 元素 | 修改 | 说明 |
|------|------|------|
| 父容器 | 添加 `overflow-hidden` | 防止内容溢出 |
| 图标 | 添加 `flex-shrink-0` | 保持图标大小不变 |
| 标题 | 添加 `min-w-0` 和 `title` | 确保截断生效，hover 显示完整名称 |
| 徽章 | 添加 `flex-shrink-0` | 保持徽章大小不变 |

### 预期效果
- 长项目名称会显示省略号（...）
- hover 时显示完整项目名称
- 操作按钮始终可见，不会被遮挡

---

## 2025-03-26 修改 AI 测试生成提示词，从源头解决复合操作问题

### 问题分析

之前的修复（step-executor.js 中的复合操作解析）可以处理已存在的测试用例，但更好的方案是**从源头解决**：让 AI 在生成测试用例时就拆分复合操作。

### 修改文件
- `E:\AI\dev-quality-inspector\src\core\testing\ai-test-generator-complete.js`

### 具体修改

**修改 1: 更新 AI 测试生成提示词 (行 540-575)**

添加 `when_steps` 数组要求，让 AI 主动拆分复合操作：

```javascript
要求:
1. 每个用例包含: id, type, name, page, description, given, when, when_steps, then, priority
2. given: 前置条件（用户位置和状态）
3. when: 操作概述（简洁描述）
4. when_steps: 重要！必须将复合操作拆分成独立的步骤数组
   - 如果操作包含多个动作（如"输入ID并点击下一步"），必须拆分为多个步骤
   - 每个步骤只包含一个原子操作（输入、点击、选择等）
   - 例如: ["在ID输入框输入 amyTest", "点击下一步按钮"]
```

**修改 2: 确保 when_steps 保存到场景顶层 (行 1099-1115)**

```javascript
if (whenSteps && Array.isArray(whenSteps) && whenSteps.length > 0) {
  scenario.when = {
    description: whenText.trim() || '执行测试步骤',
    action: whenText.trim() || '执行操作',
    text: whenSteps.join('\n'),
    steps: whenSteps,
    actions: this.extractActionsFromSteps(whenSteps),
  };
  // 重要：同时保存 when_steps 到顶层，供执行逻辑使用
  scenario.when_steps = whenSteps;
}
```

**修改 3: 添加 splitWhenText 方法 (行 1286-1347)**

用于将已有的 When 文本自动拆分成步骤：

```javascript
splitWhenText(text) {
  // 检查是否有分隔符（逗号、顿号、分号、"并"等）
  const hasSeparator = /[，,、；;并]/.test(trimmedText);
  if (hasSeparator) {
    const parts = trimmedText.split(/[，,、；;并]/).filter(p => p.trim());
    // ...
  }
}
```

### 方案优势

1. **从源头统一格式**：新生成的测试用例格式规范，每个操作独立
2. **向后兼容**：保留代码兼容性，处理已有的和可能的变体格式
3. **减少执行时解析**：AI 已拆分好步骤，执行时无需复杂解析

### 预期效果

新生成的测试用例：
```json
{
  "id": "TC002",
  "when": "输入账号密码并登录",
  "when_steps": [
    "在用户名输入框输入 testuser",
    "在密码输入框输入 Test123",
    "点击登录按钮"
  ]
}
```

执行时：
1. 检测到 `when_steps` 数组
2. 按顺序执行每个步骤
3. 每个步骤都是原子操作，不会遗漏

### 代码兼容性

- step-executor.js 的修改保留，处理已有测试用例
- 新生成的测试用例使用 `when_steps` 格式
- 两种方式可以共存

---

## 2025-03-26 修复 AI 智能测试复合操作解析问题

### 问题描述
测试步骤 "ID输入框填入amyTest，点击下一步按钮" 执行时：
1. 只执行了输入操作（在ID输入框填入 amyTest）
2. 没有执行点击操作（点击下一步按钮）
3. 然后验证失败，进入下一个用例

### 根本原因

**问题 1：复合操作检测条件过于严格**
- 原代码只检查描述中是否包含"并"字：`if (desc.includes('并'))`
- 但实际描述 "ID输入框填入amyTest，点击下一步按钮" 使用的是逗号，不是"并"
- 导致复合操作拆分逻辑根本没有执行

**问题 2：输入操作正则表达式不支持 "XXX填入YYY" 格式**
- 原正则 `/(?:输入|填写|填)\s*([^，,。:为]+?)\s*[为:]\s*([^，,。]+)/` 期望格式是 "输入ID为amyTest"
- 但实际格式是 "ID输入框填入amyTest"（目标在前，动词在后）
- 导致即使拆分了，也无法正确解析输入值

### 修改文件
- `E:\AI\dev-quality-inspector\src\core\testing\step-executor.js`

### 具体修改

**修改 1: 改进复合操作检测 (行 3167-3169)**

修改前:
```javascript
// 先处理复合操作（包含"并"的描述）
if (desc.includes('并')) {
  const parts = description.split(/并|，|,|。/).filter(p => p.trim());
```

修改后:
```javascript
// 修复：先处理复合操作（包含"并"、"，"、","、"。"等分隔符的描述）
// 检查是否有任何分隔符，不只是"并"
const hasSeparator = /并|，|,|。|；|;/.test(description);

if (hasSeparator) {
  // 拆分复合操作
  const parts = description.split(/并|，|,|。|；|;/).filter(p => p.trim());

  this.log('info', `[ruleBasedActions] 检测到复合操作，拆分为 ${parts.length} 个部分`, { parts });
```

**修改 2: 添加 "XXX填入YYY" 格式支持 (行 3177-3188)**

修改前:
```javascript
// 格式1: "输入XXX为YYY" 或 "输入XXX:YYY"
const inputWithValue = partTrimmed.match(/(?:输入|填写|填)\s*([^，,。:为]+?)\s*[为:]\s*([^，,。]+)/);
```

修改后:
```javascript
// 格式1: "输入XXX为YYY" 或 "输入XXX:YYY"（动词在前）
let inputWithValue = partTrimmed.match(/(?:输入|填写|填)\s*([^，,。:为]+?)\s*[为:]\s*([^，,。]+)/);

// 格式2: "XXX填入YYY" 或 "XXX输入YYY"（目标在前，动词在后）
if (!inputWithValue) {
  inputWithValue = partTrimmed.match(/([^，,。]+?)(?:输入框|输入|框)?(?:填入|填写|填)\s*([^，,。]+)/);
}

if (inputWithValue) {
  const target = inputWithValue[1].trim()
    .replace(/输入框|输入|框/g, '') // 清理掉"输入框"等后缀
    .trim();
  const value = inputWithValue[2].trim();
  // ...
```

**修改 3: 单独输入操作也支持 "XXX填入YYY" 格式 (行 3276-3325)**

在单独输入操作的处理中也添加了相同的格式支持：
```javascript
// 格式2: "XXX填入YYY" 或 "XXX输入YYY"（目标在前，动词在后）
if (!hasMatch) {
  const inputMatches2 = description.matchAll(/([^，,。]+?)(?:输入框|输入|框)?(?:填入|填写|填)\s*([^，,。]+)/g);
  // ...
}
```

**修改 4: 添加详细的调试日志**

在解析成功后添加日志输出：
```javascript
this.log('info', `[ruleBasedActions] 解析输入操作`, { target, value, original: partTrimmed });
this.log('info', `[ruleBasedActions] 解析点击操作`, { target, original: partTrimmed });
```

### 预期效果
- "ID输入框填入amyTest，点击下一步按钮" 会被正确拆分为两个操作：
  1. 输入操作：target="ID", value="amyTest"
  2. 点击操作：target="下一步按钮"
- 两个操作会按顺序执行，不会跳过点击操作

### 测试验证
重启应用后运行测试，检查日志：
```
[ruleBasedActions] 检测到复合操作，拆分为 2 个部分
[ruleBasedActions] 解析输入操作 { target: 'ID', value: 'amyTest', ... }
[ruleBasedActions] 解析点击操作 { target: '下一步按钮', ... }
```

---

## 2025-03-26 修复测试用例列表显示和编辑问题

### 问题描述
1. 测试用例列表显示的用例条数为 0
2. 点击编辑按钮时，没有显示完整的用例信息

### 根本原因
`TestCaseStorage.listSavedTestCases()` 方法返回的数据中**缺少 `testPlan` 对象**，只返回了基本的项目信息。
- 前端调用 `getTotalTestCases(doc)` 时，`doc.testPlan` 是 `undefined`，导致用例数计算为 0
- 点击编辑时，设置的是不完整的文档对象，无法显示完整的用例结构

### 修改文件
- `E:\AI\dev-quality-inspector\src\core\testing\test-case-storage.js`

### 具体修改

**修改 `listSavedTestCases()` 方法 (行 130-165)**

修改前（缺少 testPlan）:
```javascript
testCases.push({
  fileName: file,
  projectName: data.projectName,
  projectPath: data.projectPath,
  savedAt: data.savedAt,
  totalTestCases: data.metadata?.totalTestCases || 0
});
```

修改后（添加 testPlan 和 metadata）:
```javascript
// 修复：返回完整的测试计划数据，包括 testPlan，这样前端可以正确计算用例数量和显示完整信息
testCases.push({
  fileName: file,
  projectName: data.projectName,
  projectPath: data.projectPath,
  savedAt: data.savedAt,
  metadata: data.metadata,      // 新增：元数据
  testPlan: data.testPlan,      // 新增：完整的测试计划
  totalTestCases: data.metadata?.totalTestCases || 0
});
```

### 预期效果
- 测试用例列表正确显示每个文档的用例条数
- 点击编辑按钮时，显示完整的测试用例结构（模块、场景、前置条件、执行步骤、预期结果）

### 测试验证
需要重启应用后验证：
1. 打开测试文档列表，检查用例条数是否正确显示
2. 点击编辑按钮，检查是否显示完整的用例信息

---

## 2025-03-26 修复 AI Test 输入框匹配和输入问题

### 问题描述
1. 输入框没有被正确检测（显示 0 个输入框）
2. 输入框获得焦点后，键盘输入事件没有执行
3. 系统使用固定的关键词匹配，而不是根据测试用例描述动态匹配

### 修改文件
- `E:\AI\dev-quality-inspector\src\core\testing\step-executor.js`

### 具体修改

#### 修改 1: 改进目标类型识别 (行 ~2514-2518)
**问题**: 原代码使用 `$` 结尾符，要求关键词必须在描述的结尾，如 "ID 输入框" 可以匹配但 "输入用户ID" 不能匹配。

**修改前**:
```javascript
const isInputTarget = /输入框|输入|input|填入|填写|框$/i.test(targetName);
const isButtonTarget = /按钮|button|点击|click$/i.test(targetName);
const isLinkTarget = /链接|link$/i.test(targetName);
```

**修改后**:
```javascript
// 判断目标类型 - 修复：关键词可以在字符串的任何位置，不只是在结尾
const isInputTarget = /输入框|输入|input|填入|填写|框|ID|id|账号|密码|邮箱|email|用户|密码|password|手机|姓名|name/i.test(targetName);
const isButtonTarget = /按钮|button|点击|click|下一步|确认|提交|取消|关闭|login|submit|cancel|close/i.test(targetName);
const isLinkTarget = /链接|link|連結/i.test(targetName);
```

#### 修改 2: 改进核心关键词提取 (行 ~2520-2526)
**问题**: 只去掉结尾的类型词，没有去掉开头的动作词。

**修改前**:
```javascript
let coreKeyword = targetName
  .replace(/(输入框|输入|填入|填写|框|按钮|鏈接|链接)$/gi, '')
  .replace(/\([^)]*\)/g, '')
  .trim();
```

**修改后**:
```javascript
let coreKeyword = targetName
  .replace(/^(输入|填入|填写|input|enter)\s*/gi, '') // 去掉开头的动作词
  .replace(/(输入框|输入|填入|填写|框|按钮|鏈接|链接|button|input)$/gi, '') // 去掉结尾的类型词
  .replace(/\([^)]*\)/g, '') // 去掉括号内容
  .trim();
```

#### 修改 3: 修复空值安全问题 (行 ~2537-2545)
**问题**: `getAttribute` 可能返回 `null`，直接调用 `.toLowerCase()` 会崩溃。

**修改前**:
```javascript
const placeholder = (element.getAttribute ? element.getAttribute('placeholder') : '').toLowerCase();
const ariaLabel = (element.getAttribute ? element.getAttribute('aria-label') : '').toLowerCase();
const role = (element.getAttribute ? element.getAttribute('role') : '').toLowerCase();
```

**修改后**:
```javascript
const placeholder = (element.getAttribute ? (element.getAttribute('placeholder') || '') : '').toLowerCase();
const ariaLabel = (element.getAttribute ? (element.getAttribute('aria-label') || '') : '').toLowerCase();
const role = (element.getAttribute ? (element.getAttribute('role') || '') : '').toLowerCase();
```

### 预期效果
- "输入用户ID" 可以正确识别为输入目标
- "输入邮箱ID的文本框" 可以正确提取关键词 "邮箱ID的文本框" → "邮箱ID"
- 不会因为 `getAttribute` 返回 `null` 而崩溃

### 测试结果 (2025-03-26 11:45)
✅ **输入功能已修复！** 日志显示：
- `[findDynamicSelector] 找到匹配: "#email" { score: 30 }`
- `[Input] 坐标点击聚焦成功: (1084, 372)`
- `[Input] 开始键入: "testuser@example.com" (20 字符)`
- `[Input] 输入验证: 当前值="amyTest", 期望值="amyTest"` ✅

### 待优化问题
- "未检测到 Flutter 创建的输入元素" - 虽然输入成功，但隐藏输入元素检测逻辑可以改进
- 部分测试步骤的 target 为空，导致使用 fallback selector `[data-testid="unknown"]`

---

## 2025-03-26 修复 URL 检测错误 (CDP 端点被误识别为应用 URL)

### 问题描述
第二次测试运行时，系统错误地将 CDP 调试端点 `http://127.0.0.1:49708` 识别为应用 URL，导致测试访问错误的地址。

日志显示：
```
[Flutter Runner] 检测到应用 URL: http://127.0.0.1:49708
[Flutter Runner] 更新端口号为: 49708  ❌ 错误！
[AI智能测试] 项目地址 | 使用检测到的实际地址: http://127.0.0.1:49708  ❌ 错误！
```

### 修改文件
- `E:\AI\dev-quality-inspector\src\core\runner\index.js` (行 ~899-946)

### 具体修改

**修改 1: 改进 CDP 端点过滤逻辑**
- 添加对 base64 编码路径的检测（如 `/kSiC2a6dMi8=`）
- 将端口阈值从 50000 降低到 40000
- CDP 端点通常使用高位端口（40000-65000）

**修改 2: 不再从检测到的 URL 更新端口号**
```javascript
// 修改前：会更新端口号
if (portMatch) {
  procInfo.port = parseInt(portMatch[1], 10);
  console.log(`[Flutter Runner] 更新端口号为: ${procInfo.port}`);
}

// 修改后：只存储 URL，保持固定端口
procInfo.actualUrl = detectedUrl;
console.log(`[Flutter Runner] 存储检测到的 URL，但保持端口号为: ${procInfo.port}`);
```

### 预期效果
- 始终使用固定的 Web 服务器端口 8080
- CDP 调试端点不会被误识别为应用 URL
- 第二次及后续测试运行使用正确的 URL

---

## 自动启动被测应用逻辑位置
- 文件: `E:\AI\dev-quality-inspector\src\core/electron/main.js`
- 函数: `executeAgentTests` (行 ~3620-3720)
- 文件: `E:\AI\dev-quality-inspector/src/core/runner/index.js`
- 函数: `runFlutterProject` (行 ~756-1013)

### 启动流程
1. 检查端口 8080 是否被占用
2. 如果被占用且可以连接 → 使用现有服务
3. 如果被占用但无法连接 → 清理僵尸进程并启动新服务
4. 如果没有被占用 → 自动启动 Flutter 项目 (`flutter run -d web-server --web-port=8080`)

---

## 2025-03-26 添加输入诊断日志

### 问题描述
输入操作没有生效，需要添加更详细的诊断日志来定位问题。

### 修改文件
- `E:\AI\dev-quality-inspector\src\core\testing\step-executor.js`

### 具体修改

**修改 1: 添加输入前焦点元素日志**
```javascript
// 在输入前再次确认焦点在正确的元素上
const focusedBeforeType = await this.page.evaluate(() => {
  const active = document.activeElement;
  if (!active) return { tag: null, id: null };
  return {
    tag: active.tagName,
    id: active.id,
    className: active.className,
    value: active.value || '',
  };
});
this.log('info', `[Input] 输入前焦点元素: ${JSON.stringify(focusedBeforeType)}`);
```

**修改 2: 改进输入后验证日志**
```javascript
// 返回更详细的信息
const verifyValue = await this.page.evaluate(() => {
  // ... 返回 { tag, value } 而不是仅仅返回值
});

this.log('info', `[Input] 输入后验证: ${JSON.stringify(verifyValue)}`);

if (verifyValue.value !== null) {
  this.log('info', `[Input] 输入验证: 当前值="${verifyValue.value}", 期望值="${inputValue}"`);
} else {
  this.log('warn', `[Input] 无法验证输入值 - 未找到输入元素`);
}
```

### 预期效果
- 可以看到输入前哪个元素有焦点
- 可以看到输入后输入元素的值是否改变
- 帮助诊断输入不生效的原因

---

## 2025-03-26 改进用例编辑界面

### 问题描述
用户要求改进测试用例列表的编辑功能：
1. 点击编辑时，应显示完整的测试用例结构（前置条件、执行步骤、预期结果）
2. 编辑保存后，运行测试应使用修改后的用例
3. 运行按钮只显示图标，不显示文字
4. 三个操作图标（运行、编辑、删除）都放大

### 修改文件
- `E:\AI\dev-quality-inspector\src\components\RightPanel.jsx`

### 具体修改

#### 修改 1: 移除不再使用的状态变量 (行 ~258)
**修改前**:
```javascript
const [editingDocument, setEditingDocument] = useState(null);
const [editedDocumentContent, setEditedDocumentContent] = useState('');
```

**修改后**:
```javascript
const [editingDocument, setEditingDocument] = useState(null);
// 不再需要 editedDocumentContent，因为不再使用 JSON 文本编辑
```

#### 修改 2: 替换 JSON 编辑器为结构化表单 (行 ~573-257)
**修改前**: 简单的 JSON 文本框编辑器
```javascript
<textarea
  value={editedDocumentContent}
  onChange={(e) => setEditedDocumentContent(e.target.value)}
  className="w-full h-full bg-gray-800 border border-gray-700 rounded text-gray-300 text-xs p-3 font-mono resize-none"
  placeholder="输入测试文档内容（JSON格式）..."
/>
```

**修改后**: 结构化的编辑界面，支持：
- 模块级展开/折叠
- 场景级展开/折叠
- 前置条件 (Given) 可编辑
- 执行步骤 (When) 可编辑（支持 steps 数组和 actions 数组）
- 预期结果 (Then) 可编辑（支持 verifications 数组）
- 模块名称和优先级可编辑
- 场景 ID 和名称可编辑

关键代码结构：
```javascript
// 模块展开控制
const [expandedModules, setExpandedModules] = React.useState(new Set([0]));
const [expandedScenarios, setExpandedScenarios] = React.useState(new Set());

// 更新模块字段
const updateModule = (mIdx, field, value) => {
  const updated = { ...editingDocument };
  updated.testPlan.modules[mIdx][field] = value;
  setEditingDocument(updated);
};

// 更新场景字段
const updateScenario = (mIdx, sIdx, field, value) => {
  const updated = { ...editingDocument };
  updated.testPlan.modules[mIdx].scenarios[sIdx][field] = value;
  setEditingDocument(updated);
};
```

#### 修改 3: 更新操作按钮样式 (行 ~709-744)
**修改前**:
```javascript
// 运行按钮 - 带文字
<button className="px-3 py-1 text-xs bg-green-600 hover:bg-green-700 rounded text-white">
  ▶ 运行
</button>
// 编辑按钮
<button className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 rounded text-white">
  ✎
</button>
// 删除按钮
<button className="px-2 py-1 text-xs bg-red-600 hover:bg-red-700 rounded text-white">
  ×
</button>
```

**修改后**:
```javascript
// 运行按钮 - 只显示图标，更大
<button className="px-3 py-1 text-sm bg-green-600 hover:bg-green-700 rounded text-white flex items-center justify-center w-8 h-8">
  ▶
</button>
// 编辑按钮 - 更大
<button className="px-2 py-1 text-sm bg-blue-600 hover:bg-blue-700 rounded text-white flex items-center justify-center w-8 h-8">
  ✎
</button>
// 删除按钮 - 更大
<button className="px-2 py-1 text-base bg-red-600 hover:bg-red-700 rounded text-white flex items-center justify-center w-8 h-8">
  ×
</button>
```

### 改进点
1. **结构化编辑**: 不再需要用户手动编辑 JSON，降低了出错风险
2. **可视化层级**: 模块和场景可展开/折叠，便于导航
3. **直接编辑**: 每个字段都可以直接在界面上编辑
4. **更大图标**: 按钮从 `text-xs` 改为 `text-sm` 或 `text-base`，固定尺寸 `w-8 h-8`
5. **移除文字**: 运行按钮不再显示"运行"文字，只显示 ▶ 图标
6. **数据保存**: 编辑后的数据直接保存到 `editingDocument`，点击保存后通过 `onEditTestDocument` 回调更新

### 数据结构支持
编辑器支持多种数据格式：
- **Given**: `scenario.given` (字符串或对象) 或 `scenario.preconditions` (数组)
- **When**: `scenario.when` (字符串或对象) 或 `scenario.when.steps` / `scenario.when.actions` (数组)
- **Then**: `scenario.then` (字符串或对象) 或 `scenario.then.verifications` (数组)

### 预期效果
- 用户可以直观地查看和编辑测试用例
- 编辑后的用例会被保存，运行时使用修改后的用例
- 按钮图标更大，更容易点击
- 界面更简洁专业

### 实际测试结果
✅ 项目编译成功，界面加载正常

---

## 2025-03-26 修复编辑按钮报错问题

### 问题描述
点击编辑按钮后报错，应用崩溃。

### 根本原因
在 `renderTests()` 函数内部使用了 `React.useState` 和 `React.useEffect`，违反了 React Hooks 的使用规则。Hooks 只能在组件顶层调用，不能在普通函数或嵌套函数中调用。

### 修改文件
- `E:\AI\dev-quality-inspector\src\components\RightPanel.jsx`

### 具体修改

**修改 1: 将状态移到组件顶层 (行 ~258-260)**
```javascript
// 在组件顶层添加编辑模式状态
const [editingDocument, setEditingDocument] = useState(null);
const [expandedModules, setExpandedModules] = useState(new Set());
const [expandedScenarios, setExpandedScenarios] = useState(new Set());
```

**修改 2: 在渲染时初始化状态 (行 ~573-586)**
```javascript
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
}
```

**修改 3: 退出编辑模式时重置状态**
```javascript
const cancelEdit = () => {
  setEditingDocument(null);
  setExpandedModules(new Set());
  setExpandedScenarios(new Set());
};

const saveEditedDocument = () => {
  if (onEditTestDocument) {
    onEditTestDocument(editingDocument.projectPath, editingDocument);
  }
  setEditingDocument(null);
  setExpandedModules(new Set());
  setExpandedScenarios(new Set());
};
```

### 预期效果
- 点击编辑按钮不再报错
- 编辑界面正常显示
- 退出编辑模式后状态正确重置

---
## 2025-03-26 修复测试用例执行顺序问题

### 问题描述
用户报告：第一条用例是"输入ID并点击下一步按钮"，但实际执行时：
1. 只输入了ID（甚至还没输入完成）
2. 就已经验证结束进入下一步（密码验证用例）
3. 下一步按钮一直没有被点击
4. 直到后面的用例验证ID不为空时，才点击了下一步按钮

### 根本原因
1. **数据结构不匹配**：生成的测试用例使用 given/when/then 格式，但 executeScenario 函数期望 steps 数组格式
2. **复合操作解析问题**："输入ID并点击下一步"这样的复合操作没有被正确拆分成多个子操作

### 修改文件
- `E:\AI\dev-quality-inspector\src\core\testing\ai-test-agent.js`
- `E:\AI\dev-quality-inspector\src\core\testing\step-executor.js`

### 具体修改

**修改 1: ai-test-agent.js - 添加数据结构转换**
在 executeScenario 函数中添加将 given/when/then 格式转换为 steps 数组的逻辑

**修改 2: step-executor.js - 改进复合操作解析**
更新 ruleBasedActions 函数，添加对复合操作（包含"并"的描述）的支持：
- 拆分"输入ID并点击下一步"为两个操作
- 第一步：输入操作（填入ID）
- 第二步：点击操作（点击下一步按钮）

**修改 3: step-executor.js - 添加测试值映射**
添加 getTestValueForTarget 方法，为常见字段提供默认测试值：
- ID: amyTest
- 用户名: testuser
- 邮箱: test@example.com
- 密码: Test123456

### 预期效果
1. 测试用例的 given/when/then 格式会被正确转换为 steps 数组
2. "输入ID并点击下一步"会被正确拆分为两个操作并按顺序执行
3. 操作按顺序执行，不会跳过

---

## 2025-03-26 修复 when_steps 执行链路问题

### 问题描述
修改 AI 测试生成提示词后，添加了 `when_steps` 数组要求，但测试执行时 ID 输入又不工作了。
根本原因：
1. LLM 生成 `when_steps` 数组后，`extractActionsFromSteps` 无法正确解析"在ID输入框输入 amyTest"格式
2. BDD parser 创建了 `type: 'when_step'` 的独立步骤，但 step-executor 不处理此类型

### 修改文件
1. `E:\AI\dev-quality-inspector\src\core\testing\ai-test-generator-complete.js`
2. `E:\AI\dev-quality-inspector\src\core\testing\bdd-test-parser.js`

### 具体修改

**修改 1: 改进 extractActionsFromSteps 的输入值提取 (ai-test-generator-complete.js 行 1389-1422)**

添加了更多输入格式的支持：
- 格式3: "在XXX输入 YYY" (空格分隔)
- 格式4: "XXX填入YYY" (目标在前，动词在后)

```javascript
// 格式3: "在XXX输入 YYY" 或 "在XXX填入 YYY" (空格分隔)
else {
  const spaceMatch = cleanStep.match(/在(.+?)(?:输入框|输入|填入|填写|填)\s+([^\s，。]+)/);
  if (spaceMatch) {
    extractedTarget = spaceMatch[1].trim().replace(/输入框|框/g, '');
    extractedValue = spaceMatch[2].trim();
  }
  // 格式4: "XXX填入YYY" (目标在前，动词在后)
  else {
    const fillMatch = cleanStep.match(/(.+?)(?:输入框|输入)?(?:填入|填写|填)\s+([^\s，。]+)/);
    if (fillMatch) {
      extractedTarget = fillMatch[1].trim().replace(/输入框|框/g, '');
      extractedValue = fillMatch[2].trim();
    }
  }
}
```

**修改 2: 更新提示词格式 (ai-test-generator-complete.js 行 582-586)**

明确输入操作格式要求：
```javascript
重要：
- 复合操作必须拆分到 when_steps 数组中
- 每个步骤只包含一个动作
- 输入操作格式："在[元素名]输入 [值]"（值用空格分隔）
- 点击操作格式："点击[按钮名]"
- 只返回 JSON 数组，不要其他文字。
```

**修改 3: 修复 BDD parser 的 when_steps 处理 (bdd-test-parser.js 行 654-688)**

不再创建独立的 `when_step` 步骤，而是：
1. 优先保留 `scenario.when.actions`（由 ai-test-generator-complete.js 创建）
2. 仅当 actions 为空时，才从 when_steps 生成 generic actions

```javascript
// 如果 when 包含详细步骤数组（when_steps），但 actions 为空或未定义，则从 when_steps 生成 actions
const whenStepIndex = 1; // when 步骤的索引

if ((!scenarioPlan.steps[whenStepIndex].actions || scenarioPlan.steps[whenStepIndex].actions.length === 0)) {
  // 尝试从 scenario.when.steps 或 scenario.when_steps 生成 actions
  const stepsToConvert = (scenario.when && scenario.when.steps && Array.isArray(scenario.when.steps))
    ? scenario.when.steps
    : (scenario.when_steps && Array.isArray(scenario.when_steps) ? scenario.when_steps : null);

  if (stepsToConvert && stepsToConvert.length > 0) {
    scenarioPlan.steps[whenStepIndex].actions = stepsToConvert.map((stepText, idx) => ({
      type: 'generic',
      description: stepText.trim(),
      text: stepText.trim(),
      stepNumber: idx + 1,
    }));
  }
} else {
  // actions 已存在，记录调试信息
  console.log('[BDDParser] Preserved existing actions:', {
    actionsCount: scenarioPlan.steps[whenStepIndex].actions.length,
    actionTypes: scenarioPlan.steps[whenStepIndex].actions.map(a => a.type)
  });
}
```

### 预期效果
1. LLM 生成 `when_steps: ["在ID输入框输入 amyTest", "点击下一步按钮"]`
2. `extractActionsFromSteps` 正确解析为：
   - `{type: 'input', target: 'ID', value: 'amyTest', description: '在ID输入框输入 amyTest'}`
   - `{type: 'click', target: '下一步按钮', description: '点击下一步按钮'}`
3. step-executor 执行这些 actions 时能正确填入值和点击

### 相关任务
- 任务 #2: 修复 when_steps 执行链路 [进行中]

## 2025-03-26 调查并修复测试用例未重新生成问题

### 问题描述
修改需求后，生成的测试用例还是跟之前一样。

### 可能原因分析
1. LLM temperature 设置过低 (0.3)，导致响应过于确定性
2. 没有足够的调试信息来追踪实际传入的需求
3. 可能存在 LLM 响应缓存

### 修改文件
1. `E:\AI\dev-quality-inspector\src\core/testing\ai-test-agent.js`
2. `E:\AI\dev-quality-inspector\src\core/testing\ai-test-generator-complete.js`

### 具体修改

**修改 1: 添加输入参数调试日志 (ai-test-agent.js 行 493-498)**

```javascript
// 调试：记录输入参数
log('调试', `输入参数: requirements="${input.requirements || '(空)'}" (长度: ${(input.requirements || '').length})`);
log('调试', `输入参数: figmaUrl="${input.figmaUrl || '(空)'}"`);
log('调试', `输入参数: projectUrl="${input.projectUrl || '(空)'}"`);
```

**修改 2: 添加需求内容调试日志 (ai-test-generator-complete.js 行 591-592)**

```javascript
log('调试', `需求内容: "${requirement.substring(0, 200)}${requirement.length > 200 ? '...' : ''}"`);
log('调试', `提示词长度: ${prompt.length} 字符`);
```

**修改 3: 提高 temperature 并添加请求ID (ai-test-generator-complete.js 行 607-617)**

```javascript
const timestamp = Date.now(); // 添加时间戳避免缓存
const llmPromise = this.llm.chat('test_generation', [
  { role: 'user', content: `${prompt}\n\n[请求ID: ${timestamp}]` }
], {
  temperature: 0.7, // 提高温度以获得更多样化的响应（从 0.3 提高到 0.7）
  maxTokens: 8000
});
```

### 预期效果
1. 每次请求都有唯一的请求ID，避免可能的缓存问题
2. 更高的 temperature (0.7) 会让 LLM 生成更多样化的测试用例
3. 调试日志会显示实际传入的需求内容，便于排查问题

### 相关任务
- 任务 #3: 调查测试用例未重新生成问题 [完成]

## 2025-03-26 实现测试结果自动保存和显示功能

### 问题描述
测试执行完成后，结果没有自动保存到测试用例存储中，导致用户无法在测试用例列表中查看历史测试结果。

### 修改文件
1. `E:\AI\dev-quality-inspector\src\core\electron\main.js`
2. `E:\AI\dev-quality-inspector\src\components\RightPanel.jsx`

### 具体修改

**修改 1: 添加测试结果自动保存 (main.js 行 3903-3945)**

在 `execute-agent-tests` IPC 处理器中，测试执行成功后自动保存结果：

```javascript
// 自动保存测试结果到测试用例存储
if (options.projectPath && testCaseStorage) {
  try {
    log('保存结果', '正在保存测试结果...');

    // 加载现有的测试用例数据
    const existingData = testCaseStorage.loadTestCases(options.projectPath);

    if (existingData.exists) {
      // 更新每个场景的测试结果
      let updatedCount = 0;

      testResult.moduleResults?.forEach(moduleResult => {
        moduleResult.scenarioResults?.forEach(scenarioResult => {
          // 查找对应的场景并更新结果
          const module = existingData.testPlan.modules?.find(m => m.module === moduleResult.moduleName);
          if (module) {
            const scenario = module.scenarios?.find(s => s.id === scenarioResult.scenarioId || s.name === scenarioResult.scenarioName);
            if (scenario) {
              // 更新场景的测试结果
              scenario.lastResult = {
                status: scenarioResult.success ? 'passed' : 'failed',
                executedAt: new Date().toISOString(),
                duration: scenarioResult.duration,
                stepsPassed: scenarioResult.stepsPassed,
                stepsFailed: scenarioResult.stepsFailed,
                error: scenarioResult.error,
              };
              updatedCount++;
            }
          }
        });
      });

      // 保存更新后的测试计划
      const saveResult = testCaseStorage.saveTestCases(
        options.projectPath,
        existingData.testPlan,
        {
          ...existingData.metadata,
          lastTestRun: new Date().toISOString(),
          lastTestSummary: {
            total: testResult.totalScenarios,
            passed: testResult.passedScenarios,
            failed: testResult.failedScenarios,
            skipped: testResult.skippedScenarios,
          }
        }
      );
    }
  } catch (error) {
    log('保存异常', `保存测试结果时出错: ${error.message}`);
  }
}
```

**修改 2: 添加测试状态摘要计算函数 (RightPanel.jsx 行 1005-1033)**

```javascript
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

  return { total, passed, failed, notRun, lastRun };
};
```

**修改 3: 在展开内容中显示测试结果状态 (RightPanel.jsx 行 1139-1170)**

```javascript
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
          {statusSummary.passed > 0 && (
            <span className="text-green-400">✓ {statusSummary.passed} 通过</span>
          )}
          {statusSummary.failed > 0 && (
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
```

### 预期效果
1. 测试执行完成后，结果自动保存到测试用例存储
2. 每个场景的 `lastResult` 字段包含：状态、执行时间、耗时、通过/失败步骤数
3. 测试用例列表展开后显示测试结果摘要（通过数、失败数、未运行数、上次运行时间）
4. 测试文档的 metadata 包含 `lastTestRun` 和 `lastTestSummary`

### 相关任务
- 任务 #1: 实现测试结果自动保存功能 [完成]
