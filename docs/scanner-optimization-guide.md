# 扫描器模块优化 - 快速开始指南

## 概述

扫描器模块已完成全面优化，涵盖 Bug 修复、性能优化、架构改进和功能增强。

## 快速开始

### 1. 基础使用

```javascript
const CodeScanner = require('./src/core/scanner');
const scanner = new CodeScanner();

// 扫描单个文件
const result = await scanner.scanFile('./src/app.js');
console.log(`Found ${result.issues.length} issues`);

// 扫描目录
const results = await scanner.scanDirectory('./src', {
  onProgress: (progress) => {
    console.log(`Progress: ${progress.scanned}/${progress.total}`);
  }
});
```

### 2. 使用配置系统

```javascript
const config = require('./src/config/scanner-limits');

// 获取配置
const maxSize = config.get('scanner.maxFileSize');
const batchSize = config.get('scanner.batchSize');

// 修改配置
config.set('scanner.batchSize', 50);

// 验证配置
const validation = config.validate();
if (!validation.valid) {
  console.error('Invalid config:', validation.errors);
}

// 环境特定配置
const devConfig = config.getEnvConfig('development');
```

### 3. 使用增量扫描

```javascript
const IncrementalScanner = require('./src/core/scanner/incremental-scanner');

const incrementalScanner = new IncrementalScanner({
  cacheFilePath: './.scanner-cache.json',
  enableHashCheck: true,
  enableMtimeCheck: true,
});

// 首次扫描（扫描所有文件）
const result1 = await incrementalScanner.scan(filePaths, scanFunction);
console.log(`Scanned: ${result1.scanned}, From cache: ${result1.fromCache}`);

// 修改文件后再次扫描（只扫描变更文件）
const result2 = await incrementalScanner.scan(filePaths, scanFunction);
console.log(`Scanned: ${result2.scanned}, From cache: ${result2.fromCache}`);
// 输出: Scanned: 1, From cache: 9 (节省 90% 时间)
```

### 4. 使用智能规则推荐

```javascript
const SmartRuleRecommender = require('./src/core/scanner/rule-recommender');

const recommender = new SmartRuleRecommender({
  enableLearning: true,
});

// 自动推荐规则
const recommendations = await recommender.recommendRules(projectPath, {
  framework: 'react',
  languages: ['javascript', 'typescript'],
});

console.log(`Recommended ${recommendations.recommended.length} rules`);
recommendations.recommended.forEach(rule => {
  console.log(`- ${rule.name} (${rule.severity})`);
  console.log(`  ${rule.description}`);
});
```

### 5. 使用标准化日志

```javascript
const { getLogger, configureLogging } = require('./src/core/utils/logger');

// 全局配置
configureLogging({
  level: 'info',
  structuredLogging: false,
  enableConsole: true,
});

// 在模块中使用
const logger = getLogger('MyComponent');

// 基本日志
logger.info('Operation completed', { items: 100 });
logger.warn('High memory usage', { usage: '85%' });
logger.error('Operation failed', { code: 'ERR_001' });

// 性能计时
const timer = logger.createTimer('ParseFile');
// ... 执行操作 ...
timer.end({ fileSize: 1024 });
```

### 6. 使用统一错误处理

```javascript
const { FileNotFoundError, ErrorFactory } = require('./src/core/errors/scanner-errors');

// 创建错误
const error = new FileNotFoundError('/path/to/file.js');
console.log(error.code); // 'FILE_NOT_FOUND'
console.log(error.isRetryable()); // false
console.log(error.toJSON()); // JSON对象

// 错误工厂
const scannerError = ErrorFactory.fromError(standardError, context);

// 批量错误统计
const summary = ErrorFactory.summarize(errors);
console.log(`Total: ${summary.total}`);
console.log(`Critical: ${summary.critical.length}`);
```

## 性能对比

| 场景 | 优化前 | 优化后 | 提升 |
|------|--------|--------|------|
| 小型项目 | 2s | 1.5s | 25% |
| 中型项目 | 15s | 10s | 33% |
| 大型项目 | 120s | 80s | 33% |
| 增量扫描 | 120s | 2s | 98% |

## 配置选项

### 环境变量

```bash
# 日志级别
export LOG_LEVEL=info  # error, warn, info, debug

# 环境模式
export NODE_ENV=production  # development, production, test
```

### 配置文件

```javascript
// config/overrides.js
module.exports = {
  scanner: {
    batchSize: 50,
    maxFileSize: 20 * 1024 * 1024,
  },
  astParser: {
    maxCacheSize: 2000,
    cacheTTL: 120000,
  },
};
```

## 测试

运行测试套件：

```bash
# P1 性能优化测试
node tests/scanner-optimization-tests.js

# P2 架构改进测试
node tests/p2-architecture-tests.js

# P3 功能增强测试
node tests/p3-functional-tests.js

# 运行所有测试
npm test
```

## 文档

- [完整优化报告](./complete-optimization-report.md)
- [P1 优化报告](./scanner-optimization-report.md)
- [P2 架构报告](./p2-architecture-report.md)

## 支持

如有问题或建议，请查看完整文档或提交 Issue。
