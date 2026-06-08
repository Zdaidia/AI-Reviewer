/**
 * Scanner Module Optimization Tests
 *
 * 验证扫描器模块优化效果
 */

const CodeScanner = require('../src/core/scanner');
const ASTParser = require('../src/core/ast-parser');
const path = require('path');

// ============================================
// Test 1: Vue SFC Parsing Fix
// ============================================
async function testVueSFCParsing() {
  console.log('\n=== Test 1: Vue SFC Scoped Style Detection ===\n');

  const parser = new ASTParser();
  const vueContent = `
<template>
  <div>{{ message }}</div>
</template>

<script>
export default {
  data() {
    return { message: 'Hello' }
  }
}
</script>

<style scoped>
.container {
  color: red;
}
</style>
  `.trim();

  try {
    const result = parser.parseVue(vueContent, 'test.vue');

    if (result.style && result.style.scoped) {
      console.log('✅ PASS: Scoped style detected correctly');
      console.log(`   Style scoped: ${result.style.scoped}`);
    } else {
      console.log('❌ FAIL: Scoped style not detected');
      console.log(`   Result:`, result.style);
    }

    return result.style?.scoped === true;
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    return false;
  }
}

// ============================================
// Test 2: TODO Generation
// ============================================
async function testTODOGeneration() {
  console.log('\n=== Test 2: TODO Generation ===\n');

  const scanner = new CodeScanner();
  const mockIssue = {
    ruleId: 'no-console',
    severity: 'warning',
    message: 'Unexpected console statement',
    suggestion: 'Use a logging library instead',
    line: 42,
  };

  try {
    const todo = scanner.generateTodo(mockIssue);
    console.log('Generated TODO:');
    console.log(`  ${todo}`);

    const hasSeverity = todo.includes('[WARNING]');
    const hasRuleId = todo.includes('[no-console]');
    const hasMessage = todo.includes('Unexpected console statement');
    const hasSuggestion = todo.includes('Use a logging library');

    if (hasSeverity && hasRuleId && hasMessage && hasSuggestion) {
      console.log('\n✅ PASS: TODO generation includes all required fields');
      return true;
    } else {
      console.log('\n❌ FAIL: TODO generation missing fields');
      console.log(`  Severity: ${hasSeverity}`);
      console.log(`  Rule ID: ${hasRuleId}`);
      console.log(`  Message: ${hasMessage}`);
      console.log(`  Suggestion: ${hasSuggestion}`);
      return false;
    }
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    return false;
  }
}

// ============================================
// Test 3: TODO Insertion
// ============================================
async function testTODOInsertion() {
  console.log('\n=== Test 3: TODO Insertion ===\n');

  const scanner = new CodeScanner();
  const fs = require('fs');
  const os = require('os');
  const tmpDir = os.tmpdir();
  const testFile = path.join(tmpDir, 'test-todo-insertion.js');

  // Create test file
  const originalContent = [
    'function test() {',
    '  console.log("hello");',
    '}',
  ].join('\n');

  try {
    fs.writeFileSync(testFile, originalContent, 'utf8');
    console.log(`Created test file: ${testFile}`);

    // Insert TODO at line 2
    const todo = '// TODO [WARNING]: Fix this issue';
    const success = scanner.insertTodo(testFile, 2, todo);

    if (success) {
      const newContent = fs.readFileSync(testFile, 'utf8');
      const lines = newContent.split('\n');

      console.log('File content after insertion:');
      lines.forEach((line, index) => {
        console.log(`  ${index + 1}: ${line}`);
      });

      if (lines[1] === todo && lines.length === 4) {
        console.log('\n✅ PASS: TODO inserted at correct line');
        return true;
      } else {
        console.log('\n❌ FAIL: TODO not inserted correctly');
        return false;
      }
    } else {
      console.log('❌ FAIL: TODO insertion returned false');
      return false;
    }
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    return false;
  } finally {
    // Cleanup
    try {
      if (fs.existsSync(testFile)) {
        fs.unlinkSync(testFile);
        console.log(`\nCleaned up test file: ${testFile}`);
      }
    } catch (error) {
      console.error('Failed to cleanup test file:', error.message);
    }
  }
}

// ============================================
// Test 4: AST Cache Management
// ============================================
async function testASTCacheManagement() {
  console.log('\n=== Test 4: AST Cache Management ===\n');

  const parser = new ASTParser({
    maxCacheSize: 5, // Small size for testing
    cacheTTL: 1000, // 1 second TTL
  });

  const testContent = 'const x = 42;';
  const testFile = 'test.js';

  try {
    // Parse multiple times to fill cache
    for (let i = 0; i < 7; i++) {
      parser.parse(`${testFile}${i}`, testContent);
    }

    const stats = parser.getCacheStats();
    console.log('Cache statistics:');
    console.log(`  Size: ${stats.size}`);
    console.log(`  Max size: ${stats.maxSize}`);
    console.log(`  Utilization: ${stats.utilization}`);
    console.log(`  Expired count: ${stats.expiredCount}`);

    if (stats.size <= stats.maxSize) {
      console.log('\n✅ PASS: Cache size respected max limit');
      return true;
    } else {
      console.log('\n❌ FAIL: Cache exceeded max limit');
      return false;
    }
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    return false;
  }
}

// ============================================
// Test 5: AST Cache Cleanup
// ============================================
async function testASTCacheCleanup() {
  console.log('\n=== Test 5: AST Cache Cleanup ===\n');

  const parser = new ASTParser({
    maxCacheSize: 100,
    cacheTTL: 100, // Short TTL for testing
  });

  const testContent = 'const x = 42;';

  try {
    // Add entries to cache
    for (let i = 0; i < 5; i++) {
      parser.parse(`test${i}.js`, testContent);
    }

    const beforeStats = parser.getCacheStats();
    console.log(`Before cleanup: ${beforeStats.size} entries`);

    // Wait for entries to expire
    await new Promise(resolve => setTimeout(resolve, 150));

    // Clear expired entries
    parser.clearCache({ expired: true });

    const afterStats = parser.getCacheStats();
    console.log(`After cleanup: ${afterStats.size} entries`);

    if (afterStats.size < beforeStats.size || afterStats.expiredCount === 0) {
      console.log('\n✅ PASS: Cache cleanup removed expired entries');
      return true;
    } else {
      console.log('\n❌ FAIL: Cache cleanup did not remove expired entries');
      return false;
    }
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    return false;
  }
}

// ============================================
// Test 6: Single-Pass Directory Scanning
// ============================================
async function testSinglePassScanning() {
  console.log('\n=== Test 6: Single-Pass Directory Scanning ===\n');

  const scanner = new CodeScanner();
  const testDir = path.join(__dirname, '../examples');

  try {
    console.log(`Scanning directory: ${testDir}`);
    const startTime = Date.now();

    const results = await scanner.scanDirectory(testDir, {
      recursive: false, // Only scan top level for faster test
      onProgress: (progress) => {
        console.log(`  Progress: ${progress.scanned}/${progress.total} (${progress.progress}%)`);
      },
    });

    const elapsed = Date.now() - startTime;
    console.log(`\nScanned ${results.length} files in ${elapsed}ms`);
    console.log(`Issues found: ${results.reduce((sum, r) => sum + (r.issues?.length || 0), 0)}`);

    console.log('\n✅ PASS: Single-pass scanning completed');
    return true;
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    return false;
  }
}

// ============================================
// Run All Tests
// ============================================
async function runAllTests() {
  console.log('========================================');
  console.log('Scanner Module Optimization Tests');
  console.log('========================================');

  const tests = [
    { name: 'Vue SFC Parsing', fn: testVueSFCParsing },
    { name: 'TODO Generation', fn: testTODOGeneration },
    { name: 'TODO Insertion', fn: testTODOInsertion },
    { name: 'AST Cache Management', fn: testASTCacheManagement },
    { name: 'AST Cache Cleanup', fn: testASTCacheCleanup },
    { name: 'Single-Pass Scanning', fn: testSinglePassScanning },
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
  testVueSFCParsing,
  testTODOGeneration,
  testTODOInsertion,
  testASTCacheManagement,
  testASTCacheCleanup,
  testSinglePassScanning,
  runAllTests,
};
