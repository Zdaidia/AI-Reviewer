# 高级扫描功能稳定性修复报告

## 修复日期
2026-03-17

## 问题描述
"高级扫描"功能（AST 解析和代码图生成）在处理大型项目时可能导致应用程序崩溃，主要问题包括：
1. 栈溢出（递归深度过深）
2. 内存溢出（处理大量文件和数据）
3. 死循环（符号链接循环引用）
4. 缺少资源限制和错误处理

## 修复内容

### 1. 目录扫描优化 (`src/core/scanner/index.js`)

#### 问题
- 使用递归扫描深层嵌套目录
- 无文件数量限制
- 无符号链接循环引用检测
- 无内存释放机制

#### 解决方案

**1.1 迭代式目录遍历**
```javascript
// 使用栈代替递归
const scanStack = [{ dir: directoryPath, depth: 0 }];
const visitedDirs = new Set(); // 防止循环引用

while (scanStack.length > 0 && fileCount < maxFiles) {
  const { dir, depth } = scanStack.pop();
  // 处理目录...
}
```

**1.2 深度限制**
```javascript
const maxDepth = 50; // 最大嵌套深度
if (depth > maxDepth) {
  console.warn(`[AST Scan] 达到最大深度限制 ${maxDepth}，跳过 ${dir}`);
  continue;
}
```

**1.3 文件数量限制**
```javascript
const maxFiles = 5000; // 最多处理 5000 个文件
if (fileCount >= maxFiles) {
  console.warn(`[AST Scan] 达到最大文件数限制 ${maxFiles}，停止扫描`);
  break;
}
```

**1.4 符号链接循环检测**
```javascript
const visitedDirs = new Set();
visitedDirs.add(path.resolve(directoryPath));

// 检查是否已访问
if (visitedDirs.has(resolvedPath)) {
  console.warn(`[AST Scan] 检测到循环引用，跳过 ${fullPath}`);
  continue;
}
visitedDirs.add(resolvedPath);
```

**1.5 定期内存清理**
```javascript
// 每 50 个文件清理一次 AST 解析器缓存
if (fileCount % 50 === 0 && this.astParser) {
  this.astParser.clearCache();
  if (global.gc) {
    global.gc(); // 强制垃圾回收
  }
}
```

### 2. 单文件扫描限制 (`src/core/scanner/index.js`)

#### 问题
- 无文件大小限制
- 无行数限制
- 无问题数量限制

#### 解决方案

**2.1 文件大小限制**
```javascript
const maxFileSize = 10 * 1024 * 1024; // 10MB
if (stats.size > maxFileSize) {
  return {
    filePath,
    language: this.getLanguage(filePath),
    issues: [],
    error: `文件过大，超过最大限制`,
  };
}
```

**2.2 行数限制**
```javascript
const maxLines = 50000; // 最多处理 50000 行
const linesToProcess = lines.length > maxLines
  ? lines.slice(0, maxLines)
  : lines;
```

**2.3 问题数量限制**
```javascript
const maxIssuesPerFile = 1000; // 每个文件最多 1000 个问题
if (issueCount >= maxIssuesPerFile) {
  return; // 停止扫描此文件
}
```

### 3. AST 解析优化 (`src/core/ast-parser/index.js`)

#### 问题
- 使用递归遍历 AST 树
- 无节点数量限制
- 遍历所有属性（包括注释、tokens 等大量数据）
- 无循环引用检测

#### 解决方案

**3.1 迭代式 AST 遍历**
```javascript
const stack = [ast.program || ast];
const visited = new Set();
const maxNodes = 10000;
const maxStackSize = 50000;

while (stack.length > 0 && nodeCount < maxNodes) {
  if (stack.length > maxStackSize) {
    console.warn(`栈大小超过限制，停止遍历`);
    break;
  }
  const node = stack.pop();
  // 处理节点...
}
```

**3.2 白名单属性遍历**
```javascript
// 只遍历关键属性，避免处理注释、tokens 等
const TRAVERSE_KEYS = [
  'body', 'declaration', 'declarations', 'expression', 'callee',
  'arguments', 'left', 'right', 'object', 'property', 'init',
  // ... 其他关键属性
];

for (const key of TRAVERSE_KEYS) {
  if (key in node && node[key] != null) {
    stack.push(node[key]);
  }
}
```

**3.3 数组大小限制**
```javascript
if (Array.isArray(node)) {
  const maxArraySize = 1000;
  for (let i = Math.min(node.length - 1, maxArraySize - 1); i >= 0; i--) {
    stack.push(node[i]);
  }
}
```

**3.4 循环引用检测**
```javascript
const nodeId = `${node.type}_${node.start || 0}_${node.end || 0}_${node.loc?.start?.line || 0}`;
if (visited.has(fallbackId)) continue;
visited.add(fallbackId);
```

**3.5 内存清理**
```javascript
// 处理完成后清理 visited set
visited.clear();
```

### 4. 代码图生成限制 (`src/core/code-graph/index.js`)

#### 问题
- 无处理文件数量限制
- 无节点数量限制
- 缺少错误处理

#### 解决方案

**4.1 文件数量限制**
```javascript
const maxExtractions = this.options.maxNodes || 10000;
const limitedExtractions = extractions.slice(0, maxExtractions);
```

**4.2 节点数量检查**
```javascript
if (this.graph.nodes.size >= this.options.maxNodes) {
  console.warn(`达到最大节点数限制，停止处理`);
  break;
}
```

**4.3 错误处理**
```javascript
try {
  this.processFileExtraction(extraction, projectRoot);
} catch (error) {
  console.error(`处理文件失败:`, error.message);
  // 继续处理其他文件
}
```

### 5. 用户界面改进 (`src/components/App.jsx`)

#### 改进
- 添加 5 分钟超时保护
- 显示进度条
- 提供详细的错误消息和解决建议
- 所有异步操作都有错误处理

```javascript
const timeoutMs = 300000; // 5 分钟
const timeoutPromise = new Promise((_, reject) =>
  setTimeout(() => reject(new Error('AST 扫描超时')), timeoutMs)
);

result = await Promise.race([
  electronAPI.scanCodeWithAST(target, options),
  timeoutPromise
]);
```

## 安全限制总结

| 限制类型 | 限制值 | 说明 |
|---------|-------|------|
| 最大目录深度 | 50 层 | 防止深层嵌套导致栈溢出 |
| 最大文件数 | 5,000 个 | 防止处理过多文件导致内存溢出 |
| 代码图最大文件 | 1,000 个 | 代码图生成的文件数量限制 |
| 单文件最大大小 | 10 MB | 防止读取过大文件 |
| 单文件最大行数 | 50,000 行 | 防止处理过多行 |
| 每文件最大问题数 | 1,000 个 | 防止问题数组过大 |
| AST 最大节点数 | 10,000 个 | 防止 AST 遍历过久 |
| AST 最大栈大小 | 50,000 个 | 防止栈内存溢出 |
| 数组最大元素 | 1,000 个 | 防止处理过大数组 |
| 扫描超时时间 | 300 秒 (5 分钟) | 防止扫描挂起 |

## 循环检测机制

### 1. 目录循环检测
```javascript
const visitedDirs = new Set();
// 检查是否已访问（解析符号链接）
if (visitedDirs.has(resolvedPath)) {
  console.warn(`检测到循环引用，跳过`);
  continue;
}
```

### 2. AST 节点循环检测
```javascript
const visited = new Set();
const nodeId = `${node.type}_${node.start}_${node.end}_${line}`;
if (visited.has(nodeId)) continue;
visited.add(nodeId);
```

## 内存管理

### 1. 定期清理
- 每 50 个文件清理 AST 解析器缓存
- 使用 `visited.clear()` 释放 Set 内存
- 可选的 `global.gc()` 强制垃圾回收

### 2. 数据分片
- 代码图生成限制在 1000 个文件
- 统计数据限制在 1000 个文件
- 使用 `.slice()` 限制数组大小

## 错误处理

### 1. 多层 try-catch
- 文件级错误处理
- 目录级错误处理
- AST 解析错误处理
- 代码图生成错误处理

### 2. 优雅降级
- 单个文件失败不影响其他文件
- AST 解析失败回退到基础扫描
- 代码图生成失败不影响扫描结果

## 性能优化

### 1. 进度报告
```javascript
if (onProgress && fileCount % 10 === 0) {
  onProgress({ scanned: fileCount, total: maxFiles, current: fullPath });
}
```

### 2. 批处理
- 使用栈迭代代替递归
- 定期清理缓存
- 限制处理的数据量

## 测试建议

### 1. 极限测试
- 测试深度嵌套目录（> 50 层）
- 测试大量文件（> 5000 个）
- 测试大文件（> 10 MB）
- 测试符号链接循环

### 2. 性能测试
- 测试扫描速度
- 测试内存使用情况
- 测试 CPU 使用率

### 3. 稳定性测试
- 测试超时机制
- 测试错误恢复
- 测试资源清理

## 兼容性

### 保持的功能
- ✓ 所有原有的扫描功能
- ✓ AST 解析功能
- ✓ 代码图生成
- ✓ 进度显示

### 新增的限制
- ⚠ 深度嵌套目录可能不会被完全扫描
- ⚠ 超大文件可能被跳过
- ⚠ 超多文件的项目可能只处理部分

## 后续改进建议

1. **可配置限制**
   - 将所有硬编码的限制值改为可配置项
   - 允许用户根据机器性能调整限制

2. **增量扫描**
   - 支持增量扫描，只扫描变更的文件
   - 缓存扫描结果

3. **并行处理**
   - 使用 Worker 线程并行处理文件
   - 提高扫描速度

4. **智能限制**
   - 根据可用内存动态调整限制
   - 根据系统负载调整扫描速度

## 总结

通过以上修复，"高级扫描"功能现在具有：
- ✓ **防止栈溢出**：所有递归改为迭代
- ✓ **防止内存溢出**：多层资源限制和定期清理
- ✓ **防止死循环**：符号链接和循环引用检测
- ✓ **优雅降级**：错误不会导致崩溃
- ✓ **用户友好**：清晰的错误消息和进度反馈

现在可以安全地处理大型项目，而不会导致应用程序崩溃。
