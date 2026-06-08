/**
 * Testing Module
 *
 * Responsibilities:
 * - Parse Excel test cases
 * - Generate Playwright test scripts
 * - Execute tests and report results
 * - Run Playwright tests directly on any running project
 *
 * Excel Format:
 * | Test Case | Description | Steps | Expected Result |
 */

const ExcelParser = require('./excel-parser');
const TestGenerator = require('./test-generator');
const TestRunner = require('./test-runner');
const ReportGenerator = require('./report-generator');
const PlaywrightTester = require('./playwright-tester');

// 新增高级模块
const AdvancedExcelParser = require('./advanced-excel-parser');
const AdvancedTestGenerator = require('./advanced-test-generator');
const FigmaIntegration = require('./figma-integration');
const AITestGenerator = require('./ai-test-generator');
const VisualRegressionTester = require('./visual-regression');
const AdvancedReportGenerator = require('./advanced-report-generator');

class TestingManager {
  constructor(llmRouter = null) {
    this.excelParser = new ExcelParser();
    this.testGenerator = new TestGenerator();
    this.testRunner = new TestRunner();
    this.reportGenerator = new ReportGenerator();
    this.playwrightTester = new PlaywrightTester();
    this.runningTests = new Map();

    // 新增高级模块
    this.advancedExcelParser = new AdvancedExcelParser();
    this.advancedTestGenerator = new AdvancedTestGenerator();
    this.figmaIntegration = new FigmaIntegration();
    this.aiTestGenerator = new AITestGenerator(llmRouter);
    this.visualRegressionTester = new VisualRegressionTester();
    this.advancedReportGenerator = new AdvancedReportGenerator();
  }

  /**
   * Parse Excel test file
   * @param {string} filePath - Path to Excel file
   * @returns {Object} Parsed test data
   */
  parseExcel(filePath) {
    return this.excelParser.parseExcel(filePath);
  }

  /**
   * Generate test script from Excel
   * @param {string} excelPath - Path to Excel file
   * @param {Object} options - Generation options
   * @returns {Object} Generation result
   */
  generateTest(excelPath, options = {}) {
    return this.testGenerator.generateFromExcel(excelPath, options);
  }

  /**
   * Run test file
   * @param {string} testPath - Path to test file
   * @param {Object} options - Run options
   * @returns {Promise<Object>} Test result
   */
  async runTest(testPath, options = {}) {
    const {
      onOutput = null,
      onResult = null,
      generateReport = true,
      outputDir = null,
    } = options;

    try {
      // Run test
      const result = await this.testRunner.run(testPath, {
        ...options,
        onOutput: (testId, output) => {
          this.runningTests.set(testId, {
            ...this.runningTests.get(testId),
            lastOutput: output,
          });
          if (onOutput) onOutput(testId, output);
        },
        onResult: (testId, result) => {
          this.runningTests.delete(testId);

          // Generate report if requested
          if (generateReport && outputDir) {
            const reportResult = this.reportGenerator.generateAllReports(result, outputDir);
            result.reportPaths = reportResult.reports;
          }

          if (onResult) onResult(testId, result);
        },
      });

      return result;
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Stop running test
   * @param {string} testId - Test ID
   * @returns {Object} Result
   */
  stopTest(testId) {
    return this.testRunner.stop(testId);
  }

  /**
   * Get test status
   * @param {string} testId - Test ID
   * @returns {Object} Status
   */
  getTestStatus(testId) {
    return this.testRunner.getStatus(testId);
  }

  /**
   * Get running tests
   * @returns {Array} Running tests
   */
  getRunningTests() {
    return this.testRunner.getRunningTests();
  }

  /**
   * Generate test report
   * @param {Object} testResult - Test result
   * @param {string} format - Report format (html, json, junit, all)
   * @param {string} outputPath - Output file path
   * @returns {Object} Result
   */
  generateReport(testResult, format = 'html', outputPath) {
    try {
      let report;

      switch (format) {
        case 'html':
          report = this.reportGenerator.generateHTMLReport(testResult);
          break;
        case 'json':
          report = this.reportGenerator.generateJSONReport(testResult);
          break;
        case 'junit':
          report = this.reportGenerator.generateJUnitReport(testResult);
          break;
        case 'all':
          return this.reportGenerator.generateAllReports(
            testResult,
            path.dirname(outputPath),
            { projectName: 'Test Report' }
          );
        default:
          return { success: false, error: `Unknown format: ${format}` };
      }

      return this.reportGenerator.saveReport(report, outputPath);
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Open report in browser
   * @param {string} reportPath - Path to report
   * @returns {Promise<Object>} Result
   */
  async openReport(reportPath) {
    return this.reportGenerator.openReport(reportPath);
  }

  /**
   * Create Excel template
   * @param {string} outputPath - Output path
   * @returns {Object} Result
   */
  createTemplate(outputPath) {
    return this.excelParser.createTemplate(outputPath);
  }

  /**
   * Check if Playwright is installed
   * @param {string} projectPath - Project path
   * @returns {boolean} True if installed
   */
  isPlaywrightInstalled(projectPath) {
    return this.testRunner.isPlaywrightInstalled(projectPath);
  }

  /**
   * Install Playwright
   * @param {string} projectPath - Project path
   * @returns {Promise<Object>} Result
   */
  async installPlaywright(projectPath) {
    return this.testRunner.installPlaywright(projectPath);
  }

  // ============================================
  // Playwright Direct Testing Methods
  // ============================================

  /**
   * Generate Playwright test from URL
   * @param {string} url - Application URL
   * @param {Object} options - Test options
   * @returns {Object} Result
   */
  generatePlaywrightTest(url, options = {}) {
    return this.playwrightTester.generateTestFromUrl(url, options);
  }

  /**
   * Run Playwright test
   * @param {string} url - Application URL
   * @param {Object} options - Test options
   * @returns {Promise<Object>} Result
   */
  async runPlaywrightTest(url, options = {}) {
    const {
      testType = 'basic',
      browser = 'chromium',
      headed = false,
      onOutput = null,
      onResult = null,
    } = options;

    // Generate test first
    const genResult = this.generatePlaywrightTest(url, {
      testType,
    });

    if (!genResult.success) {
      return genResult;
    }

    // Run the test
    return this.playwrightTester.runTest(genResult.testPath, {
      url,
      browser,
      headed,
      onOutput,
      onResult,
    });
  }

  /**
   * Stop Playwright test
   * @param {string} testId - Test ID
   * @returns {Object} Result
   */
  stopPlaywrightTest(testId) {
    return this.playwrightTester.stopTest(testId);
  }

  /**
   * Get Playwright test status
   * @param {string} testId - Test ID
   * @returns {Object} Status
   */
  getPlaywrightTestStatus(testId) {
    return this.playwrightTester.getTestStatus(testId);
  }

  /**
   * Get running Playwright tests
   * @returns {Array} Running tests
   */
  getRunningPlaywrightTests() {
    return this.playwrightTester.getRunningTests();
  }

  // ============================================
  // Advanced Excel Testing Methods
  // ============================================

  /**
   * 解析高级 Excel 测试用例
   * @param {string} filePath - Excel 文件路径
   * @returns {Object} 解析结果
   */
  parseAdvancedExcel(filePath) {
    return this.advancedExcelParser.parseAdvancedExcel(filePath);
  }

  /**
   * 从高级 Excel 生成测试代码
   * @param {string} excelPath - Excel 文件路径
   * @param {Object} options - 生成选项
   * @returns {Object} 生成结果
   */
  generateAdvancedTest(excelPath, options = {}) {
    try {
      const parsed = this.parseAdvancedExcel(excelPath);

      if (!parsed.success) {
        return parsed;
      }

      const testCode = this.advancedTestGenerator.generateFromAdvancedExcel(
        parsed,
        options
      );

      return {
        success: true,
        testCode,
        parsedData: parsed,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 生成高级 Excel 模板
   * @param {string} outputPath - 输出路径
   * @returns {Object} 生成结果
   */
  generateAdvancedTemplate(outputPath) {
    return this.advancedExcelParser.generateAdvancedTemplate(outputPath);
  }

  /**
   * 获取验证类型说明
   * @returns {Object} 验证类型说明
   */
  getValidationTypesInfo() {
    return this.advancedExcelParser.getValidationTypesInfo();
  }

  /**
   * 获取操作类型说明
   * @returns {Object} 操作类型说明
   */
  getActionTypesInfo() {
    return this.advancedExcelParser.getActionTypesInfo();
  }

  // ============================================
  // Figma Integration Methods
  // ============================================

  /**
   * 设置 Figma 访问令牌
   * @param {string} token - Figma 访问令牌
   */
  setFigmaAccessToken(token) {
    this.figmaIntegration.setAccessToken(token);
  }

  /**
   * 从 Figma URL 提取设计规范
   * @param {string} figmaUrl - Figma URL
   * @param {string} nodeId - 节点 ID（可选）
   * @returns {Promise<Object>} 设计规范
   */
  async extractFigmaDesignSpecs(figmaUrl, nodeId = null) {
    return await this.figmaIntegration.extractDesignSpecs(figmaUrl, nodeId);
  }

  /**
   * 从 Figma 生成测试用例
   * @param {string} figmaUrl - Figma URL
   * @param {string} outputPath - 输出路径
   * @param {Object} options - 选项
   * @returns {Promise<Object>} 生成结果
   */
  async generateExcelFromFigma(figmaUrl, outputPath, options = {}) {
    return await this.figmaIntegration.generateExcelFromFigma(
      figmaUrl,
      outputPath,
      options
    );
  }

  /**
   * 批量下载 Figma 设计稿截图
   * @param {string} fileKey - 文件键
   * @param {Array} nodeIds - 节点 ID 数组
   * @param {string} outputDir - 输出目录
   * @param {Object} options - 选项
   * @returns {Promise<Array>} 下载的文件路径
   */
  async batchDownloadFigmaScreenshots(fileKey, nodeIds, outputDir, options = {}) {
    return await this.figmaIntegration.batchDownloadScreenshots(
      fileKey,
      nodeIds,
      outputDir,
      options
    );
  }

  /**
   * 获取 Figma 文件信息
   * @param {string} fileKey - 文件键
   * @returns {Promise<Object>} 文件信息
   */
  async getFigmaFile(fileKey) {
    return await this.figmaIntegration.getFile(fileKey);
  }

  /**
   * 获取 Figma 文件节点
   * @param {string} fileKey - 文件键
   * @param {string} nodeId - 节点 ID
   * @returns {Promise<Object>} 节点信息
   */
  async getFigmaFileNode(fileKey, nodeId) {
    return await this.figmaIntegration.getFileNode(fileKey, nodeId);
  }

  // ============================================
  // AI Test Generation Methods
  // ============================================

  /**
   * 设置 LLM 路由器
   * @param {Object} llmRouter - LLM 路由器实例
   */
  setLLMRouter(llmRouter) {
    this.aiTestGenerator.setLLMRouter(llmRouter);
  }

  /**
   * 从需求文档生成测试用例
   * @param {string} requirementText - 需求文档文本
   * @param {Object} options - 选项
   * @returns {Promise<Object>} 生成的测试用例
   */
  async generateTestsFromRequirement(requirementText, options = {}) {
    return await this.aiTestGenerator.generateFromRequirement(requirementText, options);
  }

  /**
   * 从 Figma 设计生成测试用例
   * @param {Object} figmaSpecs - Figma 设计规范
   * @param {Object} options - 选项
   * @returns {Promise<Object>} 生成的测试用例
   */
  async generateTestsFromFigma(figmaSpecs, options = {}) {
    return await this.aiTestGenerator.generateFromFigma(figmaSpecs, options);
  }

  /**
   * 从自然语言描述生成测试
   * @param {string} description - 自然语言描述
   * @param {Object} options - 选项
   * @returns {Promise<Object>} 生成的测试用例
   */
  async generateTestsFromDescription(description, options = {}) {
    return await this.aiTestGenerator.generateFromDescription(description, options);
  }

  /**
   * 生成选择器
   * @param {string} elementDescription - 元素描述
   * @param {string} context - 上下文
   * @returns {Promise<Object>} 选择器建议
   */
  async generateSelector(elementDescription, context = '') {
    return await this.aiTestGenerator.generateSelector(elementDescription, context);
  }

  // ============================================
  // Visual Regression Testing Methods
  // ============================================

  /**
   * 对比两个图片
   * @param {string} image1Path - 图片1路径
   * @param {string} image2Path - 图片2路径
   * @param {Object} options - 选项
   * @returns {Promise<Object>} 对比结果
   */
  async compareImages(image1Path, image2Path, options = {}) {
    return await this.visualRegressionTester.compareImages(image1Path, image2Path, options);
  }

  /**
   * 批量对比截图
   * @param {Array} screenshotPairs - 截图对数组
   * @param {Object} options - 选项
   * @returns {Promise<Array>} 对比结果数组
   */
  async batchCompareScreenshots(screenshotPairs, options = {}) {
    return await this.visualRegressionTester.batchCompareScreenshots(screenshotPairs, options);
  }

  /**
   * 生成视觉回归报告
   * @param {Array} comparisonResults - 对比结果数组
   * @param {string} outputPath - 输出路径
   * @returns {Promise<Object>} 报告结果
   */
  async generateVisualReport(comparisonResults, outputPath) {
    return await this.visualRegressionTester.generateVisualReport(comparisonResults, outputPath);
  }

  /**
   * 设置视觉回归阈值
   * @param {Object} threshold - 阈值配置
   */
  setVisualThreshold(threshold) {
    this.visualRegressionTester.setThreshold(threshold);
  }

  // ============================================
  // Advanced Report Generation Methods
  // ============================================

  /**
   * 生成高级 HTML 报告
   * @param {Object} testResult - 测试结果
   * @param {string} outputPath - 输出路径
   * @returns {Promise<Object>} 生成结果
   */
  async generateAdvancedHTMLReport(testResult, outputPath) {
    return await this.advancedReportGenerator.generateHTMLReport(testResult, outputPath);
  }

  /**
   * 生成趋势报告
   * @param {Array} historyResults - 历史测试结果
   * @param {string} outputPath - 输出路径
   * @returns {Promise<Object>} 生成结果
   */
  async generateTrendReport(historyResults, outputPath) {
    return await this.advancedReportGenerator.generateTrendReport(historyResults, outputPath);
  }

  /**
   * 生成所有格式的报告
   * @param {Object} testResult - 测试结果
   * @param {string} outputDir - 输出目录
   * @param {Object} options - 选项
   * @returns {Promise<Object>} 生成结果
   */
  async generateAdvancedAllReports(testResult, outputDir, options = {}) {
    return await this.advancedReportGenerator.generateAllReports(testResult, outputDir, options);
  }
}

module.exports = TestingManager;
