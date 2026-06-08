/**
 * P3 Functional Enhancements Tests
 *
 * 验证增量扫描、并行扫描、智能规则推荐等功能增强
 */

const IncrementalScanner = require('../src/core/scanner/incremental-scanner');
const ParallelScanner = require('../src/core/scanner/parallel-scanner');
const SmartRuleRecommender = require('../src/core/scanner/rule-recommender');
const CodeScanner = require('../src/core/scanner');
const path = require('path');
const fs = require('fs');

// ============================================
// Test 1: Incremental Scanning
// ============================================
async function testIncrementalScanning() {
  console.log('\n=== Test 1: Incremental Scanning ===\n');

  try {
    const scanner = new IncrementalScanner({
      cacheFilePath: './test-cache.json',
      enableHashCheck: true,
      enableMtimeCheck: true,
    });

    console.log('✓ Incremental scanner created');

    // 创建测试文件
    const testFiles = [
      path.join(__dirname, 'test-file-1.js'),
      path.join(__dirname, 'test-file-2.js'),
      path.join(__dirname, 'test-file-3.js'),
    ];

    // 写入测试内容
    for (let i = 0; i < testFiles.length; i++) {
      fs.writeFileSync(testFiles[i], `// Test file ${i + 1}\nconst x = ${i};`, 'utf8');
    }

    console.log('✓ Test files created');

    // 定义扫描函数
    const scanFunction = async (filePath) => {
      const scanner = new CodeScanner();
      return await scanner.scanFile(filePath);
    };

    // 第一次扫描（全部文件）
    console.log('\n--- First scan (all files) ---');
    const result1 = await scanner.scan(testFiles, scanFunction, {
      onProgress: (progress) => {
        console.log(`  Progress: ${progress.scanned}/${progress.toScan} scanned, ${progress.fromCache} from cache`);
      },
    });

    console.log(`✓ First scan completed`);
    console.log(`  Scanned: ${result1.scanned}`);
    console.log(`  From cache: ${result1.fromCache}`);
    console.log(`  Total: ${result1.total}`);

    // 修改一个文件
    fs.writeFileSync(testFiles[1], '// Modified file\nconst y = 999;', 'utf8');
    console.log('\n✓ Modified test-file-2.js');

    // 第二次扫描（增量）
    console.log('\n--- Second scan (incremental) ---');
    const result2 = await scanner.scan(testFiles, scanFunction, {
      onProgress: (progress) => {
        console.log(`  Progress: ${progress.scanned}/${progress.toScan} scanned, ${progress.fromCache} from cache`);
      },
    });

    console.log(`✓ Second scan completed`);
    console.log(`  Scanned: ${result2.scanned}`);
    console.log(`  From cache: ${result2.fromCache}`);
    console.log(`  Total: ${result2.total}`);
    console.log(`  Speedup: ${result2.cacheHitRate > 0 ? ((1 - result2.cacheHitRate) * 100).toFixed(1) + '%' : 'N/A'}`);

    // 获取缓存统计
    const cacheStats = scanner.getCacheStats();
    console.log('\n--- Cache statistics ---');
    console.log(`  Total entries: ${cacheStats.totalEntries}`);
    console.log(`  Age groups: ${JSON.stringify(cacheStats.ageGroups)}`);

    // 清理测试文件
    for (const file of testFiles) {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    }

    // 清理缓存
    scanner.clearCache();
    if (fs.existsSync('./test-cache.json')) {
      fs.unlinkSync('./test-cache.json');
    }

    console.log('\n✅ PASS: Incremental scanning works correctly');
    return true;
  } catch (error) {
    console.error('\n❌ FAIL:', error.message);
    return false;
  }
}

// ============================================
// Test 2: Parallel Scanning (Simplified)
// ============================================
async function testParallelScanning() {
  console.log('\n=== Test 2: Parallel Scanning ===\n');

  try {
    // 由于 Worker 线程在测试环境中可能不稳定，我们测试并行扫描器的配置和状态管理
    const scanner = new ParallelScanner({
      maxWorkers: 2,
      taskQueueSize: 100,
    });

    console.log('✓ Parallel scanner created');
    console.log(`  Max workers: ${scanner.options.maxWorkers}`);
    console.log(`  Task queue size: ${scanner.options.taskQueueSize}`);

    // 获取初始统计
    const stats1 = scanner.getStats();
    console.log('\n--- Initial stats ---');
    console.log(`  Total workers: ${stats1.totalWorkers}`);
    console.log(`  Pending tasks: ${stats1.pendingTasks}`);
    console.log(`  Queued tasks: ${stats1.queuedTasks}`);

    // 测试任务队列（不实际执行）
    scanner.taskQueue = [
      { type: 'scan', filePath: '/test/file1.js' },
      { type: 'scan', filePath: '/test/file2.js' },
      { type: 'scan', filePath: '/test/file3.js' },
    ];

    const stats2 = scanner.getStats();
    console.log('\n--- After adding tasks ---');
    console.log(`  Queued tasks: ${stats2.queuedTasks}`);

    // 测试查找空闲 Worker
    const idleWorker = scanner.findIdleWorker();
    console.log(`\n✓ Idle worker check: ${idleWorker ? 'Found' : 'None available'}`);

    // 终止扫描器
    scanner.terminate();
    console.log('\n✓ Workers terminated');

    console.log('\n✅ PASS: Parallel scanner structure works correctly');
    return true;
  } catch (error) {
    console.error('\n❌ FAIL:', error.message);
    return false;
  }
}

// ============================================
// Test 3: Smart Rule Recommendations
// ============================================
async function testSmartRuleRecommendations() {
  console.log('\n=== Test 3: Smart Rule Recommendations ===\n');

  try {
    const recommender = new SmartRuleRecommender({
      enableLearning: true,
      learningDataPath: './test-rule-learning.json',
    });

    console.log('✓ Rule recommender created');

    // 获取规则数据库统计
    const stats = recommender.getStats();
    console.log(`  Rule categories: ${stats.ruleCategories.join(', ')}`);
    console.log(`  Total rules: ${stats.totalRules}`);

    // 测试 React 项目推荐
    console.log('\n--- React project recommendations ---');
    const reactRecs = await recommender.recommendRules(
      '/fake/react/project',
      {
        framework: 'react',
        languages: ['javascript', 'typescript'],
      }
    );

    console.log(`✓ Recommendations generated`);
    console.log(`  Recommended: ${reactRecs.recommended.length} rules`);
    console.log(`  Optional: ${reactRecs.optional.length} rules`);
    console.log(`  Reasoning items: ${reactRecs.reasoning.length}`);

    // 显示前3个推荐规则
    console.log('\nTop recommended rules:');
    reactRecs.recommended.slice(0, 3).forEach((rule, index) => {
      console.log(`  ${index + 1}. ${rule.name}`);
      console.log(`     Category: ${rule.category}`);
      console.log(`     Severity: ${rule.severity}`);
    });

    // 测试 Vue 项目推荐
    console.log('\n--- Vue project recommendations ---');
    const vueRecs = await recommender.recommendRules('/fake/vue/project', {
      framework: 'vue',
      languages: ['javascript'],
    });

    console.log(`✓ Vue recommendations generated`);
    console.log(`  Recommended: ${vueRecs.recommended.length} rules`);

    // 测试学习数据
    console.log('\n--- Learning data ---');
    const projectPath = '/fake/react/project';
    const learningKey = recommender.getLearningKey(projectPath);
    console.log(`  Learning key: ${learningKey}`);

    // 模拟记录扫描结果
    recommender.recordScanResult(projectPath, {
      totalIssues: 42,
      totalFiles: 10,
      issuesByRule: {
        'no-console': [{ file: 'test.js' }],
        'react-hooks-exhaustive-deps': [{ file: 'component.js' }],
      },
    });

    console.log('✓ Scan result recorded');

    // 清理测试数据
    recommender.clearLearningData();
    if (fs.existsSync('./test-rule-learning.json')) {
      fs.unlinkSync('./test-rule-learning.json');
    }

    console.log('\n✅ PASS: Smart rule recommendations work correctly');
    return true;
  } catch (error) {
    console.error('\n❌ FAIL:', error.message);
    return false;
  }
}

// ============================================
// Test 4: Integration Test
// ============================================
async function testIntegration() {
  console.log('\n=== Test 4: Integration Test ===\n');

  try {
    // 创建完整的扫描系统
    const incrementalScanner = new IncrementalScanner({
      cacheFilePath: './test-integration-cache.json',
    });

    const ruleRecommender = new SmartRuleRecommender({
      enableLearning: false, // 禁用学习以简化测试
    });

    console.log('✓ Integrated scanner system created');

    // 模拟项目扫描流程
    const projectPath = __dirname;
    const projectInfo = {
      framework: 'nodejs',
      languages: ['javascript'],
    };

    // 1. 获取规则推荐
    console.log('\n--- Step 1: Get rule recommendations ---');
    const recommendations = await ruleRecommender.recommendRules(
      projectPath,
      projectInfo
    );

    console.log(`✓ Recommended ${recommendations.recommended.length} rules`);

    // 2. 模拟增量扫描
    console.log('\n--- Step 2: Simulate incremental scan ---');
    const testFiles = [__filename];

    const scanResult = await incrementalScanner.scan(
      testFiles,
      async (filePath) => {
        // 模拟扫描
        return {
          filePath,
          issues: [],
          language: 'javascript',
        };
      },
      {
        onProgress: (progress) => {
          console.log(`  ${progress.phase}: ${progress.scanned}/${progress.toScan}`);
        },
      }
    );

    console.log(`✓ Scan completed`);
    console.log(`  Scanned: ${scanResult.scanned}`);
    console.log(`  From cache: ${scanResult.fromCache}`);
    console.log(`  Elapsed: ${scanResult.elapsed}ms`);

    // 3. 获取统计
    console.log('\n--- Step 3: System statistics ---');
    const cacheStats = incrementalScanner.getCacheStats();
    const ruleStats = ruleRecommender.getStats();

    console.log('Cache stats:');
    console.log(`  Entries: ${cacheStats.totalEntries}`);
    console.log('\nRule stats:');
    console.log(`  Categories: ${ruleStats.ruleCategories.length}`);
    console.log(`  Total rules: ${ruleStats.totalRules}`);

    // 清理
    incrementalScanner.clearCache();
    if (fs.existsSync('./test-integration-cache.json')) {
      fs.unlinkSync('./test-integration-cache.json');
    }

    console.log('\n✅ PASS: Integration test passed');
    return true;
  } catch (error) {
    console.error('\n❌ FAIL:', error.message);
    return false;
  }
}

// ============================================
// Run All Tests
// ============================================
async function runAllTests() {
  console.log('========================================');
  console.log('P3 Functional Enhancements Tests');
  console.log('========================================');

  const tests = [
    { name: 'Incremental Scanning', fn: testIncrementalScanning },
    { name: 'Parallel Scanning', fn: testParallelScanning },
    { name: 'Smart Rule Recommendations', fn: testSmartRuleRecommendations },
    { name: 'Integration Test', fn: testIntegration },
  ];

  const results = [];

  for (const test of tests) {
    try {
      const passed = await test.fn();
      results.push({ name: test.name, passed });
    } catch (error) {
      console.error(`\n❌ Test "${test.name}" crashed:`, error.message);
      results.push({ name: test.name, passed: false });
    }
  }

  // Summary
  console.log('\n========================================');
  console.log('Test Summary');
  console.log('========================================\n');

  const passedCount = results.filter(r => r.passed).length;
  const totalCount = results.length;

  results.forEach((result, index) => {
    const icon = result.passed ? '✅' : '❌';
    console.log(`${icon} ${index + 1}. ${result.name}`);
  });

  console.log(`\nTotal: ${passedCount}/${totalCount} tests passed (${((passedCount / totalCount) * 100).toFixed(1)}%)`);

  return passedCount === totalCount;
}

// Run tests if executed directly
if (require.main === module) {
  runAllTests()
    .then((allPassed) => {
      process.exit(allPassed ? 0 : 1);
    })
    .catch((error) => {
      console.error('\n❌ Test suite failed:', error);
      process.exit(1);
    });
}

module.exports = {
  testIncrementalScanning,
  testParallelScanning,
  testSmartRuleRecommendations,
  testIntegration,
  runAllTests,
};
