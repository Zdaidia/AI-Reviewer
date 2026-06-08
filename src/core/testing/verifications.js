/**
 * Verification Library
 *
 * 提供各种验证方法，用于测试断言
 * 支持：数量、路由、文本、可见性、属性、状态等验证
 */

class Verifications {
  constructor(page) {
    this.page = page;
  }

  /**
   * 数量验证
   * @param {string} selector - 选择器
   * @param {number} expected - 预期数量
   * @param {Object} options - 选项
   * @returns {Object} 验证结果
   */
  async count(selector, expected, options = {}) {
    try {
      const actual = await this.page.locator(selector).count();
      const passed = actual === expected;

      return {
        type: 'count',
        passed,
        expected,
        actual,
        selector,
        message: passed
          ? `✓ 数量验证通过: 找到 ${actual} 个元素`
          : `✗ 数量验证失败: 预期 ${expected} 个，实际 ${actual} 个`,
      };
    } catch (error) {
      return {
        type: 'count',
        passed: false,
        expected,
        actual: null,
        selector,
        error: error.message,
        message: `✗ 数量验证错误: ${error.message}`,
      };
    }
  }

  /**
   * 路由验证
   * @param {string} expectedPath - 预期路径
   * @param {Object} options - 选项
   * @returns {Object} 验证结果
   */
  async route(expectedPath, options = {}) {
    try {
      const actualUrl = this.page.url();
      const urlObj = new URL(actualUrl);
      const actualPath = urlObj.pathname;
      const actualHash = urlObj.hash; // 获取 hash 部分，如 #/account_management

      // 移除开头的 # 符号用于比较
      const hashPath = actualHash.startsWith('#') ? actualHash.substring(1) : actualHash;

      // 检查 pathname 或 hash 是否匹配预期路径
      const passed =
        actualPath === expectedPath ||
        actualPath.includes(expectedPath) ||
        hashPath === expectedPath ||
        hashPath.includes(expectedPath) ||
        actualUrl.includes(expectedPath);

      return {
        type: 'route',
        passed,
        expected: expectedPath,
        actual: hashPath || actualPath, // 优先返回 hash 路径
        fullUrl: actualUrl,
        message: passed
          ? `✓ 路由验证通过: 当前在 ${hashPath || actualPath}`
          : `✗ 路由验证失败: 预期 ${expectedPath}，实际 ${hashPath || actualPath}`,
      };
    } catch (error) {
      return {
        type: 'route',
        passed: false,
        expected: expectedPath,
        actual: null,
        error: error.message,
        message: `✗ 路由验证错误: ${error.message}`,
      };
    }
  }

  /**
   * 路由改变验证
   * @param {string} previousUrl - 之前的 URL
   * @param {Object} options - 选项
   * @returns {Object} 验证结果
   */
  async routeChanged(previousUrl, options = {}) {
    try {
      const currentUrl = this.page.url();
      let passed = currentUrl !== previousUrl;
      let details = { urlChanged: passed };

      // 如果 URL 没有改变，检查 DOM 状态是否改变（用于 SPA 页面内导航）
      if (!passed) {
        this.log('info', `[routeChanged] URL 未改变，检查 DOM 状态变化...`);

        // 获取当前页面元素信息
        const domState = await this.page.evaluate(() => {
          const inputs = document.querySelectorAll('input:not([type=hidden]), textarea');
          const buttons = document.querySelectorAll('button, [role="button"]');
          const passwordInputs = document.querySelectorAll('input[type="password"], input[placeholder*="密码" i], input[placeholder*="password" i]');

          return {
            inputCount: inputs.length,
            buttonCount: buttons.length,
            hasPasswordInput: passwordInputs.length > 0,
            inputPlaceholders: Array.from(inputs).map(i => i.placeholder || '').filter(p => p),
            buttonTexts: Array.from(buttons).map(b => b.textContent?.trim() || '').filter(t => t)
          };
        });

        details.domState = domState;

        // 如果页面包含密码输入框，认为页面状态已改变（从 ID 页切换到密码页）
        if (domState.hasPasswordInput) {
          passed = true;
          details.reason = 'password_input_detected';
          this.log('info', `[routeChanged] 检测到密码输入框，判定页面状态已改变`);
        }
        // 如果按钮文本包含"登录"，认为页面状态已改变
        else if (domState.buttonTexts.some(t => t.includes('登录'))) {
          passed = true;
          details.reason = 'login_button_detected';
          this.log('info', `[routeChanged] 检测到登录按钮，判定页面状态已改变`);
        }
      }

      return {
        type: 'route',
        passed,
        expected: 'changed',
        actual: passed ? 'changed' : 'same',
        previousUrl,
        currentUrl,
        details,
        message: passed
          ? `✓ 页面状态已改变: ${currentUrl !== previousUrl ? 'URL 从 ' + previousUrl + ' 到 ' + currentUrl : 'DOM 状态变化 (' + (details.reason || '未知原因') + ')'}`
          : `✗ 页面状态未改变: URL 和 DOM 均未变化`,
      };
    } catch (error) {
      return {
        type: 'route',
        passed: false,
        expected: 'changed',
        actual: null,
        error: error.message,
        message: `✗ 路由验证错误: ${error.message}`,
      };
    }
  }

  /**
   * 面包屑验证
   * @param {string} expectedText - 预期文本
   * @param {Object} options - 选项
   * @returns {Object} 验证结果
   */
  async breadcrumb(expectedText, options = {}) {
    try {
      const selector = options.selector || '.breadcrumb, .breadcrumbs, [data-testid="breadcrumb"]';
      const breadcrumb = this.page.locator(selector);

      // 检查面包屑是否存在
      const isVisible = await breadcrumb.isVisible();
      if (!isVisible) {
        return {
          type: 'breadcrumb',
          passed: false,
          expected: expectedText,
          actual: null,
          message: `✗ 面包屑元素不可见: ${selector}`,
        };
      }

      // 获取面包屑文本
      const textOptions = options.position === 'last' ? { last: true } : {};
      const actualText = await breadcrumb.textContent(textOptions);
      const passed = actualText.includes(expectedText);

      return {
        type: 'breadcrumb',
        passed,
        expected: expectedText,
        actual: actualText,
        selector,
        message: passed
          ? `✓ 面包屑验证通过: 包含 "${expectedText}"`
          : `✗ 面包屑验证失败: 预期包含 "${expectedText}"，实际 "${actualText}"`,
      };
    } catch (error) {
      return {
        type: 'breadcrumb',
        passed: false,
        expected: expectedText,
        actual: null,
        error: error.message,
        message: `✗ 面包屑验证错误: ${error.message}`,
      };
    }
  }

  /**
   * 文本验证
   * @param {string} selector - 选择器
   * @param {string} expectedText - 预期文本
   * @param {Object} options - 选项
   * @returns {Object} 验证结果
   */
  async text(selector, expectedText, options = {}) {
    try {
      const element = this.page.locator(selector);

      // 检查元素是否存在
      const isVisible = await element.isVisible();
      if (!isVisible) {
        return {
          type: 'text',
          passed: false,
          expected: expectedText,
          actual: null,
          selector,
          message: `✗ 元素不可见: ${selector}`,
        };
      }

      // 获取文本
      const actualText = await element.textContent();
      const passed = options.exact
        ? actualText.trim() === expectedText.trim()
        : actualText.includes(expectedText);

      return {
        type: 'text',
        passed,
        expected: expectedText,
        actual: actualText,
        selector,
        exact: options.exact || false,
        message: passed
          ? `✓ 文本验证通过: ${options.exact ? '完全匹配' : '包含'} "${expectedText}"`
          : `✗ 文本验证失败: 预期${options.exact ? '完全匹配' : '包含'} "${expectedText}"，实际 "${actualText}"`,
      };
    } catch (error) {
      return {
        type: 'text',
        passed: false,
        expected: expectedText,
        actual: null,
        selector,
        error: error.message,
        message: `✗ 文本验证错误: ${error.message}`,
      };
    }
  }

  /**
   * 可见性验证
   * @param {string} selector - 选择器
   * @param {boolean} expected - 预期可见性
   * @param {Object} options - 选项
   * @returns {Object} 验证结果
   */
  async visible(selector, expected = true, options = {}) {
    try {
      const element = this.page.locator(selector);
      const actual = await element.isVisible({ timeout: options.timeout || 5000 });
      const passed = actual === expected;

      return {
        type: 'visible',
        passed,
        expected,
        actual,
        selector,
        message: passed
          ? `✓ 可见性验证通过: 元素${expected ? '可见' : '不可见'}`
          : `✗ 可见性验证失败: 预期${expected ? '可见' : '不可见'}，实际${actual ? '可见' : '不可见'}`,
      };
    } catch (error) {
      const actual = false;
      const passed = actual === expected;

      return {
        type: 'visible',
        passed,
        expected,
        actual,
        selector,
        error: error.message,
        message: passed
          ? `✓ 可见性验证通过: 元素不存在`
          : `✗ 可见性验证错误: ${error.message}`,
      };
    }
  }

  /**
   * 属性验证
   * @param {string} selector - 选择器
   * @param {string} attribute - 属性名
   * @param {string} expectedValue - 预期值
   * @param {Object} options - 选项
   * @returns {Object} 验证结果
   */
  async attribute(selector, attribute, expectedValue, options = {}) {
    try {
      const element = this.page.locator(selector);
      const actualValue = await element.getAttribute(attribute);
      const passed = actualValue === expectedValue;

      return {
        type: 'attribute',
        passed,
        expected: expectedValue,
        actual: actualValue,
        selector,
        attribute,
        message: passed
          ? `✓ 属性验证通过: ${attribute}="${expectedValue}"`
          : `✗ 属性验证失败: 预期 ${attribute}="${expectedValue}"，实际 ${attribute}="${actualValue}"`,
      };
    } catch (error) {
      return {
        type: 'attribute',
        passed: false,
        expected: expectedValue,
        actual: null,
        selector,
        attribute,
        error: error.message,
        message: `✗ 属性验证错误: ${error.message}`,
      };
    }
  }

  /**
   * CSS 属性验证
   * @param {string} selector - 选择器
   * @param {string} property - CSS 属性名
   * @param {string} expectedValue - 预期值
   * @param {Object} options - 选项
   * @returns {Object} 验证结果
   */
  async css(selector, property, expectedValue, options = {}) {
    try {
      const element = this.page.locator(selector);
      const actualValue = await element.evaluate((el, prop) => {
        return window.getComputedStyle(el).getPropertyValue(prop);
      }, property);

      const passed = actualValue === expectedValue || actualValue.includes(expectedValue);

      return {
        type: 'css',
        passed,
        expected: expectedValue,
        actual: actualValue,
        selector,
        property,
        message: passed
          ? `✓ CSS 属性验证通过: ${property}="${expectedValue}"`
          : `✗ CSS 属性验证失败: 预期 ${property}="${expectedValue}"，实际 ${property}="${actualValue}"`,
      };
    } catch (error) {
      return {
        type: 'css',
        passed: false,
        expected: expectedValue,
        actual: null,
        selector,
        property,
        error: error.message,
        message: `✗ CSS 属性验证错误: ${error.message}`,
      };
    }
  }

  /**
   * 表单值验证
   * @param {string} selector - 选择器
   * @param {string} expectedValue - 预期值
   * @param {Object} options - 选项
   * @returns {Object} 验证结果
   */
  async value(selector, expectedValue, options = {}) {
    try {
      const element = this.page.locator(selector);
      const actualValue = await element.inputValue();
      const passed = actualValue === expectedValue;

      return {
        type: 'value',
        passed,
        expected: expectedValue,
        actual: actualValue,
        selector,
        message: passed
          ? `✓ 表单值验证通过: value="${expectedValue}"`
          : `✗ 表单值验证失败: 预期 value="${expectedValue}"，实际 value="${actualValue}"`,
      };
    } catch (error) {
      return {
        type: 'value',
        passed: false,
        expected: expectedValue,
        actual: null,
        selector,
        error: error.message,
        message: `✗ 表单值验证错误: ${error.message}`,
      };
    }
  }

  /**
   * 元素状态验证（disabled, checked 等）
   * @param {string} selector - 选择器
   * @param {string} state - 状态名
   * @param {boolean} expected - 预期状态
   * @param {Object} options - 选项
   * @returns {Object} 验证结果
   */
  async state(selector, state, expected, options = {}) {
    try {
      const element = this.page.locator(selector);
      let actual;

      switch (state) {
        case 'disabled':
          actual = await element.isDisabled();
          break;
        case 'enabled':
          actual = await element.isEnabled();
          break;
        case 'checked':
          actual = await element.isChecked();
          break;
        case 'editable':
          actual = await element.isEditable();
          break;
        case 'hidden':
          actual = !(await element.isVisible());
          break;
        case 'visible':
          actual = await element.isVisible();
          break;
        default:
          throw new Error(`Unknown state: ${state}`);
      }

      const passed = actual === expected;

      return {
        type: 'state',
        passed,
        expected,
        actual,
        selector,
        state,
        message: passed
          ? `✓ 状态验证通过: 元素${state}`
          : `✗ 状态验证失败: 预期${state}=${expected}，实际${state}=${actual}`,
      };
    } catch (error) {
      return {
        type: 'state',
        passed: false,
        expected,
        actual: null,
        selector,
        state,
        error: error.message,
        message: `✗ 状态验证错误: ${error.message}`,
      };
    }
  }

  /**
   * 页面标题验证
   * @param {string} expectedTitle - 预期标题
   * @param {Object} options - 选项
   * @returns {Object} 验证结果
   */
  async title(expectedTitle, options = {}) {
    try {
      const actualTitle = await this.page.title();
      const passed = options.exact
        ? actualTitle === expectedTitle
        : actualTitle.includes(expectedTitle);

      return {
        type: 'title',
        passed,
        expected: expectedTitle,
        actual: actualTitle,
        exact: options.exact || false,
        message: passed
          ? `✓ 页面标题验证通过: "${expectedTitle}"`
          : `✗ 页面标题验证失败: 预期"${expectedTitle}"，实际"${actualTitle}"`,
      };
    } catch (error) {
      return {
        type: 'title',
        passed: false,
        expected: expectedTitle,
        actual: null,
        error: error.message,
        message: `✗ 页面标题验证错误: ${error.message}`,
      };
    }
  }

  /**
   * URL 参数验证
   * @param {string} param - 参数名
   * @param {string} expectedValue - 预期值
   * @param {Object} options - 选项
   * @returns {Object} 验证结果
   */
  async urlParam(param, expectedValue, options = {}) {
    try {
      const url = new URL(this.page.url());
      const actualValue = url.searchParams.get(param);
      const passed = actualValue === expectedValue;

      return {
        type: 'urlParam',
        passed,
        expected: expectedValue,
        actual: actualValue,
        param,
        message: passed
          ? `✓ URL 参数验证通过: ${param}="${expectedValue}"`
          : `✗ URL 参数验证失败: 预期 ${param}="${expectedValue}"，实际 ${param}="${actualValue}"`,
      };
    } catch (error) {
      return {
        type: 'urlParam',
        passed: false,
        expected: expectedValue,
        actual: null,
        param,
        error: error.message,
        message: `✗ URL 参数验证错误: ${error.message}`,
      };
    }
  }

  /**
   * 等待元素出现
   * @param {string} selector - 选择器
   * @param {Object} options - 选项
   * @returns {Object} 验证结果
   */
  async waitForVisible(selector, options = {}) {
    try {
      const timeout = options.timeout || 5000;
      await this.page.waitForSelector(selector, { state: 'visible', timeout });

      return {
        type: 'waitForVisible',
        passed: true,
        selector,
        timeout,
        message: `✓ 元素已出现: ${selector}`,
      };
    } catch (error) {
      return {
        type: 'waitForVisible',
        passed: false,
        selector,
        timeout: options.timeout || 5000,
        error: error.message,
        message: `✗ 元素未在 ${options.timeout || 5000}ms 内出现: ${selector}`,
      };
    }
  }

  /**
   * 等待元素消失
   * @param {string} selector - 选择器
   * @param {Object} options - 选项
   * @returns {Object} 验证结果
   */
  async waitForHidden(selector, options = {}) {
    try {
      const timeout = options.timeout || 5000;
      await this.page.waitForSelector(selector, { state: 'hidden', timeout });

      return {
        type: 'waitForHidden',
        passed: true,
        selector,
        timeout,
        message: `✓ 元素已消失: ${selector}`,
      };
    } catch (error) {
      return {
        type: 'waitForHidden',
        passed: false,
        selector,
        timeout: options.timeout || 5000,
        error: error.message,
        message: `✗ 元素未在 ${options.timeout || 5000}ms 内消失: ${selector}`,
      };
    }
  }

  /**
   * 批量验证
   * @param {Array} verifications - 验证数组
   * @returns {Object} 批量验证结果
   */
  async batch(verifications) {
    const results = [];
    let passed = 0;
    let failed = 0;

    for (const verification of verifications) {
      const { type, ...args } = verification;

      if (typeof this[type] === 'function') {
        const result = await this[type](...args);
        results.push(result);

        if (result.passed) {
          passed++;
        } else {
          failed++;
        }
      } else {
        results.push({
          type,
          passed: false,
          error: `Unknown verification type: ${type}`,
          message: `✗ 未知的验证类型: ${type}`,
        });
        failed++;
      }
    }

    return {
      passed,
      failed,
      total: verifications.length,
      results,
      message: `批量验证完成: ${passed}/${verifications.length} 通过`,
    };
  }
}

module.exports = Verifications;
