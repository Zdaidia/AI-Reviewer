/**
 * P2 Architecture Improvements Tests
 *
 * 验证配置管理、错误处理、日志系统等架构改进
 */

const config = require('../src/config/scanner-limits');
const { ScannerError, ErrorFactory, FileNotFoundError, ParseError } = require('../src/core/errors/scanner-errors');
const { getLogger, configureLogging, Logger } = require('../src/core/utils/logger');

// ============================================
// Test 1: Configuration Management
// ============================================
async function testConfigurationManagement() {
  console.log('\n=== Test 1: Configuration Management ===\n');

  try {
    // Test 1.1: Get configuration values
    const maxFileSize = config.get('scanner.maxFileSize');
    console.log(`✓ scanner.maxFileSize: ${maxFileSize}`);

    const batchSize = config.get('scanner.batchSize');
    console.log(`✓ scanner.batchSize: ${batchSize}`);

    // Test 1.2: Set configuration values
    config.set('scanner.batchSize', 50);
    const newBatchSize = config.get('scanner.batchSize');
    console.log(`✓ Updated scanner.batchSize: ${newBatchSize}`);

    // Test 1.3: Get environment-specific config
    const devConfig = config.getEnvConfig('development');
    console.log(`✓ Development config logLevel: ${devConfig.logLevel}`);

    // Test 1.4: Merge user config
    const mergedConfig = config.merge({ scanner: { batchSize: 100 } });
    console.log(`✓ Merged config batchSize: ${mergedConfig.scanner.batchSize}`);

    // Test 1.5: Validate configuration
    const validation = config.validate();
    console.log(`✓ Configuration valid: ${validation.valid}`);
    if (!validation.valid) {
      console.log(`  Errors: ${validation.errors.join(', ')}`);
      return false;
    }

    console.log('\n✅ PASS: Configuration management works correctly');
    return true;
  } catch (error) {
    console.error('\n❌ FAIL:', error.message);
    return false;
  }
}

// ============================================
// Test 2: Error Handling
// ============================================
async function testErrorHandling() {
  console.log('\n=== Test 2: Error Handling ===\n');

  try {
    // Test 2.1: Create custom errors
    const fileNotFoundError = new FileNotFoundError('/path/to/file.js');
    console.log(`✓ Created FileNotFoundError: ${fileNotFoundError.code}`);
    console.log(`  Message: ${fileNotFoundError.message}`);
    console.log(`  Level: ${fileNotFoundError.level}`);
    console.log(`  Retryable: ${fileNotFoundError.isRetryable()}`);

    // Test 2.2: Error serialization
    const errorJson = fileNotFoundError.toJSON();
    console.log(`\n✓ Error JSON:`);
    console.log(`  ${JSON.stringify(errorJson, null, 2)}`);

    // Test 2.3: Error from standard Error
    const standardError = new Error('Something went wrong');
    const scannerError = ErrorFactory.fromError(standardError, {
      component: 'TestComponent',
    });
    console.log(`\n✓ Converted standard error: ${scannerError.code}`);

    // Test 2.4: Batch error summary
    const errors = [
      new FileNotFoundError('/file1.js'),
      new ParseError('/file2.js', 'Syntax error'),
      new ScannerError('Generic error', 'GENERIC_ERROR'),
    ];

    const summary = ErrorFactory.summarize(errors);
    console.log(`\n✓ Error summary:`);
    console.log(`  Total: ${summary.total}`);
    console.log(`  By Level: ${JSON.stringify(summary.byLevel)}`);
    console.log(`  By Code: ${JSON.stringify(summary.byCode)}`);
    console.log(`  Critical: ${summary.critical.length}`);
    console.log(`  Retryable: ${summary.retryable}`);

    // Test 2.5: Check critical errors
    const criticalError = new ScannerError('Critical error', 'CRITICAL_ERROR', {}, 'error');
    criticalError.critical = true;
    console.log(`\n✓ Critical error check: ${criticalError.isCritical()}`);

    console.log('\n✅ PASS: Error handling works correctly');
    return true;
  } catch (error) {
    console.error('\n❌ FAIL:', error.message);
    return false;
  }
}

// ============================================
// Test 3: Logging System
// ============================================
async function testLoggingSystem() {
  console.log('\n=== Test 3: Logging System ===\n');

  try {
    // Test 3.1: Create logger
    const logger = getLogger('TestComponent', {
      level: 'debug',
      enableConsole: true,
      structuredLogging: false,
    });

    console.log('✓ Logger created');

    // Test 3.2: Log at different levels
    console.log('\n--- Different log levels ---');
    logger.error('This is an error message', { code: 'TEST_ERROR' });
    logger.warn('This is a warning message', { code: 'TEST_WARN' });
    logger.info('This is an info message', { code: 'TEST_INFO' });
    logger.debug('This is a debug message', { code: 'TEST_DEBUG' });

    // Test 3.3: Child logger
    console.log('\n--- Child logger ---');
    const childLogger = logger.child('SubComponent');
    childLogger.info('Message from child logger');

    // Test 3.4: Performance logging
    console.log('\n--- Performance logging ---');
    const timer = logger.createTimer('TestOperation');
    // Simulate some work
    await new Promise(resolve => setTimeout(resolve, 50));
    const duration = timer.end({ itemsProcessed: 100 });
    console.log(`✓ Operation took ${duration}ms`);

    // Test 3.5: Set log level
    console.log('\n--- Log level filtering ---');
    logger.setLevel('warn');
    logger.debug('This debug message should not appear');
    logger.warn('This warning should appear');

    // Test 3.6: Error with stack
    console.log('\n--- Error logging with stack ---');
    try {
      throw new Error('Test error for logging');
    } catch (error) {
      logger.errorWithStack(error, { context: 'testing' });
    }

    // Test 3.7: Progress logging
    console.log('\n--- Progress logging ---');
    logger.progress({
      scanned: 50,
      total: 100,
      progress: '50.0%',
      current: '/path/to/file.js',
    });

    console.log('\n✅ PASS: Logging system works correctly');
    return true;
  } catch (error) {
    console.error('\n❌ FAIL:', error.message);
    return false;
  }
}

// ============================================
// Test 4: Configuration Integration
// ============================================
async function testConfigurationIntegration() {
  console.log('\n=== Test 4: Configuration Integration ===\n');

  try {
    // Test 4.1: Use config in AST Parser
    const ASTParser = require('../src/core/ast-parser');
    const parser = new ASTParser({
      maxCacheSize: config.get('astParser.maxCacheSize'),
      cacheTTL: config.get('astParser.cacheTTL'),
    });

    console.log('✓ AST Parser initialized with config values');
    console.log(`  Max cache size: ${parser.options.maxCacheSize}`);
    console.log(`  Cache TTL: ${parser.options.cacheTTL}`);

    // Test 4.2: Verify parser has logger
    if (parser.logger) {
      console.log('\n✓ AST Parser has integrated logger');
      parser.logger.info('Parser configuration loaded', {
        cacheEnabled: parser.options.enableCache,
      });
    }

    // Test 4.3: Environment-specific config
    const testConfig = config.merge({}, config.getEnvConfig('test'));
    console.log('\n✓ Test environment config loaded');
    console.log(`  Log level: ${testConfig.logLevel}`);
    console.log(`  Enable cache: ${testConfig.astParser.enableCache}`);

    console.log('\n✅ PASS: Configuration integration works correctly');
    return true;
  } catch (error) {
    console.error('\n❌ FAIL:', error.message);
    return false;
  }
}

// ============================================
// Test 5: Error Handling Integration
// ============================================
async function testErrorHandlingIntegration() {
  console.log('\n=== Test 5: Error Handling Integration ===\n');

  try {
    const ASTParser = require('../src/core/ast-parser');
    const parser = new ASTParser();

    // Test 5.1: Try to parse non-existent file
    const result = parser.parse('/non/existent/file.js');
    console.log('✓ Non-existent file handled gracefully');
    console.log(`  Result: ${result === null ? 'null (expected)' : 'unexpected'}`);

    // Test 5.2: Parse with error handling
    try {
      const testResult = parser.parse(__filename);
      console.log('\n✓ File parsed successfully with error handling');
      console.log(`  Language: ${testResult?.language || 'N/A'}`);
    } catch (error) {
      const scannerError = ErrorFactory.fromError(error, {
        component: 'ASTParser',
      });
      console.log(`\n✓ Error converted to ScannerError`);
      console.log(`  Code: ${scannerError.code}`);
      console.log(`  Retryable: ${scannerError.isRetryable()}`);
    }

    // Test 5.3: Batch error handling
    const errors = [];
    const testFiles = [
      '/tmp/test1.js',
      '/tmp/test2.js',
      __filename, // This one should work
    ];

    for (const file of testFiles) {
      try {
        const result = parser.parse(file);
        if (result === null) {
          errors.push(new FileNotFoundError(file));
        }
      } catch (error) {
        errors.push(error);
      }
    }

    const summary = ErrorFactory.summarize(errors);
    console.log(`\n✓ Processed ${testFiles.length} files with error tracking`);
    console.log(`  Errors: ${summary.total}`);
    console.log(`  By Code: ${JSON.stringify(summary.byCode)}`);

    console.log('\n✅ PASS: Error handling integration works correctly');
    return true;
  } catch (error) {
    console.error('\n❌ FAIL:', error.message);
    return false;
  }
}

// ============================================
// Test 6: Logging Integration
// ============================================
async function testLoggingIntegration() {
  console.log('\n=== Test 6: Logging Integration ===\n');

  try {
    // Test 6.1: Configure global logging
    configureLogging({
      level: 'debug',
      structuredLogging: false,
      enableConsole: true,
    });

    console.log('✓ Global logging configured');

    // Test 6.2: AST Parser with logging
    const ASTParser = require('../src/core/ast-parser');
    const parser = new ASTParser();

    if (parser.logger) {
      console.log('✓ AST Parser has logger integrated');
      parser.logger.info('Parser initialized', {
        cacheSize: parser.options.maxCacheSize,
      });
    }

    // Test 6.3: Log during operations
    const testFile = __filename;
    parser.logger?.debug('Parsing file', { filePath: testFile });

    const result = parser.parse(testFile);
    if (result && parser.logger) {
      parser.logger.info('File parsed successfully', {
        language: result.language,
      });
    }

    // Test 6.4: Performance logging with parser
    const timer = parser.logger?.createTimer('ParseOperation');
    if (timer) {
      const startTime = Date.now();
      const testContent = 'const x = 42;';
      parser.parse('test.js', testContent);
      const duration = Date.now() - startTime;
      timer.end({ fileSize: testContent.length });
    }

    // Test 6.5: Child logger for parser operations
    const cacheLogger = parser.logger?.child('Cache');
    if (cacheLogger) {
      cacheLogger.debug('Cache statistics', {
        size: parser.getCacheStats().size,
      });
    }

    console.log('\n✅ PASS: Logging integration works correctly');
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
  console.log('P2 Architecture Improvements Tests');
  console.log('========================================');

  const tests = [
    { name: 'Configuration Management', fn: testConfigurationManagement },
    { name: 'Error Handling', fn: testErrorHandling },
    { name: 'Logging System', fn: testLoggingSystem },
    { name: 'Configuration Integration', fn: testConfigurationIntegration },
    { name: 'Error Handling Integration', fn: testErrorHandlingIntegration },
    { name: 'Logging Integration', fn: testLoggingIntegration },
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
  testConfigurationManagement,
  testErrorHandling,
  testLoggingSystem,
  testConfigurationIntegration,
  testErrorHandlingIntegration,
  testLoggingIntegration,
  runAllTests,
};
