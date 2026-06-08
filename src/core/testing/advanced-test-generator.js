/**
 * Advanced Test Generator
 *
 * 根据增强的 Excel 测试用例生成强大的 Playwright 测试代码
 * 支持：
 * - 视觉验证（颜色、字体、尺寸、位置）
 * - 功能验证（交互、导航、表单）
 * - 数据验证（内容、数值、状态）
 * - 截图对比
 * - Figma 设计对比
 * - 性能测试
 * - 数据驱动测试
 */

class AdvancedTestGenerator {
  constructor() {
    this.imports = new Set();
    this.beforeEachHooks = [];
    this.afterEachHooks = [];
  }

  /**
   * 从增强的 Excel 生成测试代码
   * @param {Object} parsedData - 解析后的 Excel 数据
   * @param {Object} options - 生成选项
   * @returns {string} 生成的测试代码
   */
  generateFromAdvancedExcel(parsedData, options = {}) {
    const {
      language = 'javascript',
      includeComments = true,
      includeScreenshots = true,
      includeFigmaComparison = false,
    } = options;

    this.reset();

    // 获取配置
    const config = this.extractConfig(parsedData);

    // 获取 Figma 规范
    const figmaSpecs = this.extractFigmaSpecs(parsedData);

    // 获取测试用例
    const testCases = this.extractTestCases(parsedData);

    // 生成导入语句
    const imports = this.generateImports(language, config, includeFigmaComparison);

    // 生成测试套件
    const testSuite = this.generateTestSuite(
      testCases,
      figmaSpecs,
      config,
      language,
      includeComments,
      includeScreenshots,
      includeFigmaComparison
    );

    return `${imports}\n\n${testSuite}`;
  }

  /**
   * 重置生成器状态
   */
  reset() {
    this.imports = new Set(['test', 'expect']);
    this.beforeEachHooks = [];
    this.afterEachHooks = [];
  }

  /**
   * 提取配置
   * @param {Object} parsedData - 解析后的数据
   * @returns {Object} 配置
   */
  extractConfig(parsedData) {
    const configSheet = Object.values(parsedData.sheets || {}).find(
      sheet => sheet.type === 'config'
    );

    return configSheet?.data || {};
  }

  /**
   * 提取 Figma 规范
   * @param {Object} parsedData - 解析后的数据
   * @returns {Array} Figma 规范数组
   */
  extractFigmaSpecs(parsedData) {
    const figmaSheet = Object.values(parsedData.sheets || {}).find(
      sheet => sheet.type === 'figmaSpecs'
    );

    return figmaSheet?.data || [];
  }

  /**
   * 提取测试用例
   * @param {Object} parsedData - 解析后的数据
   * @returns {Array} 测试用例数组
   */
  extractTestCases(parsedData) {
    const testSheet = Object.values(parsedData.sheets || {}).find(
      sheet => sheet.type === 'testCases'
    );

    return testSheet?.data || [];
  }

  /**
   * 生成导入语句
   * @param {string} language - 编程语言
   * @param {Object} config - 配置
   * @param {boolean} includeFigma - 是否包含 Figma
   * @returns {string} 导入语句
   */
  generateImports(language, config, includeFigma) {
    let imports = '';

    if (language === 'typescript') {
      imports += `import { test, expect } from '@playwright/test';\n`;

      if (includeFigma) {
        imports += `import { FigmaComparer } from './figma-comparer';\n`;
      }

      imports += '\n';
    } else {
      imports += `const { test, expect } = require('@playwright/test');\n`;

      if (includeFigma) {
        imports += `const { FigmaComparer } = require('./figma-comparer');\n`;
      }

      imports += '\n';
    }

    return imports;
  }

  /**
   * 生成测试套件
   * @param {Array} testCases - 测试用例
   * @param {Array} figmaSpecs - Figma 规范
   * @param {Object} config - 配置
   * @param {string} language - 编程语言
   * @param {boolean} includeComments - 是否包含注释
   * @param {boolean} includeScreenshots - 是否包含截图
   * @param {boolean} includeFigmaComparison - 是否包含 Figma 对比
   * @returns {string} 测试套件代码
   */
  generateTestSuite(
    testCases,
    figmaSpecs,
    config,
    language,
    includeComments,
    includeScreenshots,
    includeFigmaComparison
  ) {
    let code = '';

    // 生成测试描述块
    code += this.generateTestSuiteHeader(testCases, config, includeComments);

    // 为每个测试用例生成测试
    for (const testCase of testCases) {
      code += '\n' + this.generateSingleTest(
        testCase,
        figmaSpecs,
        config,
        language,
        includeComments,
        includeScreenshots,
        includeFigmaComparison
      );
    }

    return code;
  }

  /**
   * 生成测试套件头部
   * @param {Array} testCases - 测试用例
   * @param {Object} config - 配置
   * @param {boolean} includeComments - 是否包含注释
   * @returns {string} 头部代码
   */
  generateTestSuiteHeader(testCases, config, includeComments) {
    let code = '';

    if (includeComments) {
      code += '/**\n';
      code += ` * 自动生成的测试套件\n`;
      code += ` * 测试用例数量: ${testCases.length}\n`;
      code += ` * 生成时间: ${new Date().toISOString()}\n`;

      if (config.baseUrl) {
        code += ` * 基础 URL: ${config.baseUrl}\n`;
      }

      code += ' */\n\n';
    }

    return code;
  }

  /**
   * 生成单个测试
   * @param {Object} testCase - 测试用例
   * @param {Array} figmaSpecs - Figma 规范
   * @param {Object} config - 配置
   * @param {string} language - 编程语言
   * @param {boolean} includeComments - 是否包含注释
   * @param {boolean} includeScreenshots - 是否包含截图
   * @param {boolean} includeFigmaComparison - 是否包含 Figma 对比
   * @returns {string} 测试代码
   */
  generateSingleTest(
    testCase,
    figmaSpecs,
    config,
    language,
    includeComments,
    includeScreenshots,
    includeFigmaComparison
  ) {
    let code = '';

    const { id, name, description, priority, tags, retry, timeout } = testCase;

    // 测试注释
    if (includeComments) {
      code += '/**\n';
      if (id) code += ` * 测试 ID: ${id}\n`;
      if (description) code += ` * 描述: ${description}\n`;
      if (priority) code += ` * 优先级: ${priority}\n`;
      if (tags && tags.length > 0) code += ` * 标签: ${tags.join(', ')}\n`;
      code += ' */\n';
    }

    // 测试声明
    const sanitizedName = this.sanitizeTestName(name || id || 'unnamed_test');
    const displayName = name || id || 'Unnamed Test';

    code += `test('${displayName}', async ({ page }) => {\n`;

    // 添加测试配置
    if (retry) {
      code = code.replace(
        `test('${displayName}'`,
        `test('${displayName}', { retry: ${retry} }`
      );
    }

    // 导航到 URL
    if (testCase.url) {
      code += `  // 导航到测试页面\n`;
      code += `  await page.goto('${testCase.url}');\n\n`;
    }

    // 生成步骤代码
    if (testCase.steps && testCase.steps.length > 0) {
      code += this.generateStepsCode(testCase.steps, includeComments);
    }

    // 生成验证代码
    if (testCase.validations && testCase.validations.length > 0) {
      code += this.generateValidationsCode(
        testCase.validations,
        includeComments
      );
    }

    // 生成 Figma 对比代码
    if (includeFigmaComparison && testCase.figmaConfig) {
      code += this.generateFigmaComparisonCode(
        testCase,
        figmaSpecs,
        includeComments
      );
    }

    // 生成截图代码
    if (includeScreenshots && testCase.screenshotConfig) {
      code += this.generateScreenshotCode(testCase, includeComments);
    }

    // 生成性能测试代码
    if (testCase.performanceConfig) {
      code += this.generatePerformanceTestCode(testCase, includeComments);
    }

    code += `});\n`;

    return code;
  }

  /**
   * 生成步骤代码
   * @param {Array} steps - 步骤数组
   * @param {boolean} includeComments - 是否包含注释
   * @returns {string} 步骤代码
   */
  generateStepsCode(steps, includeComments) {
    let code = '';

    for (const step of steps) {
      if (includeComments && step.description) {
        code += `  // ${step.description}\n`;
      }

      if (step.action === 'todo') {
        code += `  // TODO: ${step.description}\n\n`;
      } else {
        code += this.generateActionCode(step, includeComments) + '\n';
      }
    }

    return code;
  }

  /**
   * 生成操作代码
   * @param {Object} step - 步骤对象
   * @param {boolean} includeComments - 是否包含注释
   * @returns {string} 操作代码
   */
  generateActionCode(step, includeComments) {
    const { action, selector, value, waitFor } = step;
    let code = '';

    switch (action) {
      case 'goto':
        code += `  await page.goto('${value}');`;
        break;

      case 'click':
        code += `  await page.click('${selector}');`;
        break;

      case 'fill':
      case 'type':
        code += `  await page.fill('${selector}', '${value}');`;
        break;

      case 'select':
        code += `  await page.selectOption('${selector}', '${value}');`;
        break;

      case 'check':
        code += `  await page.check('${selector}');`;
        break;

      case 'uncheck':
        code += `  await page.uncheck('${selector}');`;
        break;

      case 'hover':
        code += `  await page.hover('${selector}');`;
        break;

      case 'waitFor':
        code += `  await page.waitForSelector('${selector}'${waitFor ? `, { timeout: ${waitFor} }` : ''});`;
        break;

      case 'waitForTimeout':
        code += `  await page.waitForTimeout(${value || 1000});`;
        break;

      case 'screenshot':
        code += `  await page.screenshot({ path: '${selector || 'screenshot'}-${Date.now()}.png' });`;
        break;

      case 'press':
        code += `  await page.press('${selector}', '${value}');`;
        break;

      case 'scroll':
        code += `  await page.evaluate(() => window.scrollBy(0, ${value || 500}));`;
        break;

      default:
        code += `  // 未知操作: ${action}`;
    }

    return code;
  }

  /**
   * 生成验证代码
   * @param {Array} validations - 验证数组
   * @param {boolean} includeComments - 是否包含注释
   * @returns {string} 验证代码
   */
  generateValidationsCode(validations, includeComments) {
    let code = '';

    code += `  // 验证测试结果\n`;

    for (const validation of validations) {
      code += this.generateValidationCode(validation, includeComments) + '\n';
    }

    return code;
  }

  /**
   * 生成单个验证代码
   * @param {Object} validation - 验证对象
   * @param {boolean} includeComments - 是否包含注释
   * @returns {string} 验证代码
   */
  generateValidationCode(validation, includeComments) {
    const { selector, type, expected, tolerance } = validation;
    let code = '';

    if (includeComments) {
      code += `  // 验证: ${type}`;
      if (selector) code += ` | 选择器: ${selector}`;
      if (expected) code += ` | 期望: ${JSON.stringify(expected)}`;
      code += '\n';
    }

    switch (type) {
      case 'visible':
        code += `  await expect(page.locator('${selector}')).toBeVisible();`;
        break;

      case 'hidden':
        code += `  await expect(page.locator('${selector}')).toBeHidden();`;
        break;

      case 'text':
        code += `  await expect(page.locator('${selector}')).toHaveText('${expected}');`;
        break;

      case 'textContains':
        code += `  await expect(page.locator('${selector}')).toContainText('${expected}');`;
        break;

      case 'textMatches':
        code += `  await expect(page.locator('${selector}')).toMatchText(/${expected}/);`;
        break;

      case 'attribute':
        const attrName = validation.attributeName || 'value';
        code += `  await expect(page.locator('${selector}')).toHaveAttribute('${attrName}', '${expected}');`;
        break;

      case 'css':
        code += this.generateCssValidation(selector, expected, tolerance);
        break;

      case 'style':
        code += this.generateStyleValidation(selector, expected, tolerance);
        break;

      case 'position':
        code += this.generatePositionValidation(selector, expected, tolerance);
        break;

      case 'size':
        code += this.generateSizeValidation(selector, expected, tolerance);
        break;

      case 'enabled':
        code += `  await expect(page.locator('${selector}')).toBeEnabled();`;
        break;

      case 'disabled':
        code += `  await expect(page.locator('${selector}')).toBeDisabled();`;
        break;

      case 'checked':
        code += `  await expect(page.locator('${selector}')).toBeChecked();`;
        break;

      case 'value':
        code += `  await expect(page.locator('${selector}')).toHaveValue('${expected}');`;
        break;

      case 'count':
        code += `  await expect(page.locator('${selector}')).toHaveCount(${expected});`;
        break;

      case 'tableData':
        code += this.generateTableDataValidation(selector, expected);
        break;

      case 'listItems':
        code += this.generateListItemsValidation(selector, expected);
        break;

      case 'screenshot':
        code += `  await expect(page.locator('${selector}')).toHaveScreenshot('${expected || selector}.png');`;
        break;

      case 'screenshotMatch':
        const threshold = tolerance || 0.1;
        code += `  await expect(page.locator('${selector}')).toHaveScreenshot('${expected || selector}.png', { threshold: ${threshold} });`;
        break;

      case 'apiResponse':
        code += this.generateApiResponseValidation(expected);
        break;

      default:
        code += `  // TODO: 实现验证类型 '${type}'`;
    }

    return code;
  }

  /**
   * 生成 CSS 验证代码
   * @param {string} selector - 选择器
   * @param {Object} expected - 期望值
   * @param {number} tolerance - 容差
   * @returns {string} 验证代码
   */
  generateCssValidation(selector, expected, tolerance) {
    let code = '';

    if (typeof expected === 'string') {
      // 单个 CSS 属性
      code += `  const element = await page.locator('${selector}');\n`;
      code += `  const css = await element.evaluate((el) => window.getComputedStyle(el));\n`;
      code += `  // 验证 CSS: ${expected}\n`;
      code += `  // TODO: 添加具体的 CSS 属性验证\n`;
    } else if (typeof expected === 'object') {
      // 多个 CSS 属性
      code += `  const element = await page.locator('${selector}');\n`;
      code += `  const css = await element.evaluate((el) => window.getComputedStyle(el));\n\n`;

      for (const [property, value] of Object.entries(expected)) {
        const camelProperty = this.kebabToCamel(property);
        code += `  expect(css['${camelProperty}']).toBe('${value}');\n`;
      }
    }

    return code;
  }

  /**
   * 生成样式验证代码
   * @param {string} selector - 选择器
   * @param {Object} expected - 期望值
   * @param {number} tolerance - 容差
   * @returns {string} 验证代码
   */
  generateStyleValidation(selector, expected, tolerance) {
    let code = '';

    code += `  const element = await page.locator('${selector}');\n`;
    code += `  const box = await element.boundingBox();\n\n`;

    if (expected.width) {
      code += `  expect(box.width).toBeCloseTo(${parseInt(expected.width)}, ${tolerance || 0});\n`;
    }

    if (expected.height) {
      code += `  expect(box.height).toBeCloseTo(${parseInt(expected.height)}, ${tolerance || 0});\n`;
    }

    return code;
  }

  /**
   * 生成位置验证代码
   * @param {string} selector - 选择器
   * @param {Object} expected - 期望值
   * @param {number} tolerance - 容差
   * @returns {string} 验证代码
   */
  generatePositionValidation(selector, expected, tolerance) {
    let code = '';

    code += `  const element = await page.locator('${selector}');\n`;
    code += `  const box = await element.boundingBox();\n\n`;

    if (expected.x !== undefined) {
      code += `  expect(box.x).toBeCloseTo(${parseInt(expected.x)}, ${tolerance || 0});\n`;
    }

    if (expected.y !== undefined) {
      code += `  expect(box.y).toBeCloseTo(${parseInt(expected.y)}, ${tolerance || 0});\n`;
    }

    return code;
  }

  /**
   * 生成尺寸验证代码
   * @param {string} selector - 选择器
   * @param {Object} expected - 期望值
   * @param {number} tolerance - 容差
   * @returns {string} 验证代码
   */
  generateSizeValidation(selector, expected, tolerance) {
    let code = '';

    code += `  const element = await page.locator('${selector}');\n`;
    code += `  const box = await element.boundingBox();\n\n`;

    if (expected.width) {
      code += `  expect(box.width).toBeCloseTo(${parseInt(expected.width)}, ${tolerance || 0});\n`;
    }

    if (expected.height) {
      code += `  expect(box.height).toBeCloseTo(${parseInt(expected.height)}, ${tolerance || 0});\n`;
    }

    return code;
  }

  /**
   * 生成表格数据验证代码
   * @param {string} selector - 选择器
   * @param {Array} expected - 期望数据
   * @returns {string} 验证代码
   */
  generateTableDataValidation(selector, expected) {
    let code = '';

    code += `  const tableData = await page.locator('${selector}').allTextContents();\n`;
    code += `  const expectedData = ${JSON.stringify(expected)};\n`;
    code += `  expect(tableData).toEqual(expectedData);\n`;

    return code;
  }

  /**
   * 生成列表项验证代码
   * @param {string} selector - 选择器
   * @param {Array} expected - 期望数据
   * @returns {string} 验证代码
   */
  generateListItemsValidation(selector, expected) {
    let code = '';

    code += `  const items = await page.locator('${selector}').allTextContents();\n`;
    code += `  expect(items.length).toBeGreaterThan(0);\n`;

    if (Array.isArray(expected)) {
      code += `  const expectedItems = ${JSON.stringify(expected)};\n`;
      code += `  expect(items).toEqual(expect.arrayContaining(expectedItems));\n`;
    }

    return code;
  }

  /**
   * 生成 API 响应验证代码
   * @param {Object} expected - 期望响应
   * @returns {string} 验证代码
   */
  generateApiResponseValidation(expected) {
    let code = '';

    code += `  // 监听 API 响应\n`;
    code += `  const [response] = await Promise.all([\n`;
    code += `    page.waitForResponse(res => res.status() === 200),\n`;
    code += `    // 触发 API 请求的操作\n`;
    code += `  ]);\n\n`;
    code += `  const data = await response.json();\n`;
    code += `  expect(data).toMatchObject(${JSON.stringify(expected)});\n`;

    return code;
  }

  /**
   * 生成 Figma 对比代码
   * @param {Object} testCase - 测试用例
   * @param {Array} figmaSpecs - Figma 规范
   * @param {boolean} includeComments - 是否包含注释
   * @returns {string} 对比代码
   */
  generateFigmaComparisonCode(testCase, figmaSpecs, includeComments) {
    let code = '';

    const { figmaConfig, validations } = testCase;

    if (!figmaConfig) return code;

    if (includeComments) {
      code += `\n  // Figma 设计对比\n`;
    }

    // 查找对应的 Figma 规范
    const matchingSpec = figmaSpecs.find(spec =>
      spec.selector === validations[0]?.selector ||
      spec.elementId === testCase.id
    );

    if (matchingSpec) {
      code += `  const figmaSpec = ${JSON.stringify(matchingSpec, null, 2).replace(/\n/g, '\n  ')};\n\n`;

      // 颜色对比
      if (figmaConfig.compare?.color) {
        code += this.generateFigmaColorComparison(matchingSpec);
      }

      // 尺寸对比
      if (figmaConfig.compare?.size) {
        code += this.generateFigmaSizeComparison(matchingSpec);
      }

      // 字体对比
      if (figmaConfig.compare?.font) {
        code += this.generateFigmaFontComparison(matchingSpec);
      }

      // 布局对比
      if (figmaConfig.compare?.layout) {
        code += this.generateFigmaLayoutComparison(matchingSpec);
      }
    } else {
      code += `  // TODO: 从 Figma 获取设计规范\n`;
      code += `  // Figma URL: ${figmaConfig.url}\n`;
      code += `  // Node ID: ${figmaConfig.nodeId}\n`;
    }

    return code;
  }

  /**
   * 生成 Figma 颜色对比代码
   * @param {Object} spec - Figma 规范
   * @returns {string} 对比代码
   */
  generateFigmaColorComparison(spec) {
    let code = '';

    code += `  // 颜色对比\n`;
    code += `  const element = await page.locator('${spec.selector}');\n`;
    code += `  const styles = await element.evaluate((el) => window.getComputedStyle(el));\n\n`;

    if (spec.styles.backgroundColor) {
      code += `  expect(this.rgbToHex(styles.backgroundColor)).toBe('${spec.styles.backgroundColor}');\n`;
    }

    if (spec.styles.color) {
      code += `  expect(this.rgbToHex(styles.color)).toBe('${spec.styles.color}');\n`;
    }

    if (spec.styles.borderColor) {
      code += `  expect(this.rgbToHex(styles.borderColor)).toBe('${spec.styles.borderColor}');\n`;
    }

    return code;
  }

  /**
   * 生成 Figma 尺寸对比代码
   * @param {Object} spec - Figma 规范
   * @returns {string} 对比代码
   */
  generateFigmaSizeComparison(spec) {
    let code = '';

    code += `  // 尺寸对比\n`;
    code += `  const box = await page.locator('${spec.selector}').boundingBox();\n\n`;

    if (spec.styles.width) {
      code += `  expect(box.width).toBe(${parseInt(spec.styles.width)});\n`;
    }

    if (spec.styles.height) {
      code += `  expect(box.height).toBe(${parseInt(spec.styles.height)});\n`;
    }

    return code;
  }

  /**
   * 生成 Figma 字体对比代码
   * @param {Object} spec - Figma 规范
   * @returns {string} 对比代码
   */
  generateFigmaFontComparison(spec) {
    let code = '';

    code += `  // 字体对比\n`;
    code += `  const styles = await page.locator('${spec.selector}').evaluate((el) => window.getComputedStyle(el));\n\n`;

    if (spec.styles.fontSize) {
      code += `  expect(styles.fontSize).toBe('${spec.styles.fontSize}');\n`;
    }

    if (spec.styles.fontFamily) {
      code += `  expect(styles.fontFamily).toContain('${spec.styles.fontFamily}');\n`;
    }

    if (spec.styles.fontWeight) {
      code += `  expect(styles.fontWeight).toBe('${spec.styles.fontWeight}');\n`;
    }

    if (spec.styles.lineHeight) {
      code += `  expect(styles.lineHeight).toBe('${spec.styles.lineHeight}');\n`;
    }

    return code;
  }

  /**
   * 生成 Figma 布局对比代码
   * @param {Object} spec - Figma 规范
   * @returns {string} 对比代码
   */
  generateFigmaLayoutComparison(spec) {
    let code = '';

    code += `  // 布局对比\n`;
    code += `  const box = await page.locator('${spec.selector}').boundingBox();\n\n`;

    if (spec.styles.x) {
      code += `  expect(box.x).toBe(${parseInt(spec.styles.x)});\n`;
    }

    if (spec.styles.y) {
      code += `  expect(box.y).toBe(${parseInt(spec.styles.y)});\n`;
    }

    if (spec.styles.padding) {
      code += `  // TODO: 验证 padding: ${spec.styles.padding}\n`;
    }

    if (spec.styles.margin) {
      code += `  // TODO: 验证 margin: ${spec.styles.margin}\n`;
    }

    return code;
  }

  /**
   * 生成截图代码
   * @param {Object} testCase - 测试用例
   * @param {boolean} includeComments - 是否包含注释
   * @returns {string} 截图代码
   */
  generateScreenshotCode(testCase, includeComments) {
    let code = '';

    const { screenshotConfig } = testCase;

    if (!screenshotConfig || !screenshotConfig.enabled) return code;

    if (includeComments) {
      code += `\n  // 截图\n`;
    }

    if (screenshotConfig.fullPage) {
      code += `  await page.screenshot({ path: '${testCase.id || 'test'}-${Date.now()}.png', fullPage: true });\n`;
    } else {
      code += `  await page.screenshot({ path: '${testCase.id || 'test'}-${Date.now()}.png' });\n`;
    }

    return code;
  }

  /**
   * 生成性能测试代码
   * @param {Object} testCase - 测试用例
   * @param {boolean} includeComments - 是否包含注释
   * @returns {string} 性能测试代码
   */
  generatePerformanceTestCode(testCase, includeComments) {
    let code = '';

    const { performanceConfig } = testCase;

    if (!performanceConfig) return code;

    if (includeComments) {
      code += `\n  // 性能测试\n`;
    }

    if (performanceConfig.maxLoadTime) {
      code += `  const loadStart = Date.now();\n`;
      code += `  await page.waitForLoadState('networkidle');\n`;
      code += `  const loadTime = Date.now() - loadStart;\n`;
      code += `  expect(loadTime).toBeLessThan(${performanceConfig.maxLoadTime});\n\n`;
    }

    if (performanceConfig.maxResponseTime) {
      code += `  // TODO: 验证 API 响应时间 < ${performanceConfig.maxResponseTime}ms\n`;
    }

    if (performanceConfig.checkLCP) {
      code += `  const lcp = await page.evaluate(() => {\n`;
      code += `    return new PerformanceObserver((list) => {\n`;
      code += `      const entries = list.getEntries();\n`;
      code += `      const lastEntry = entries[entries.length - 1];\n`;
      code += `      return lastEntry.renderTime || lastEntry.loadTime;\n`;
      code += `    });\n`;
      code += `  });\n`;
      code += `  // TODO: 验证 LCP < 2.5s\n\n`;
    }

    if (performanceConfig.checkMemory) {
      code += `  const metrics = await page.metrics();\n`;
      code += `  console.log('JSHeapUsedSize:', metrics.JSHeapUsedSize);\n`;
      code += `  // TODO: 添加内存使用阈值验证\n\n`;
    }

    return code;
  }

  /**
   * 将 kebab-case 转换为 camelCase
   * @param {string} str - kebab-case 字符串
   * @returns {string} camelCase 字符串
   */
  kebabToCamel(str) {
    return str.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
  }

  /**
   * 清理测试名称
   * @param {string} name - 测试名称
   * @returns {string} 清理后的名称
   */
  sanitizeTestName(name) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'unnamed_test';
  }
}

module.exports = AdvancedTestGenerator;
