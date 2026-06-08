/**
 * Browser Actions
 *
 * 提供完整的浏览器操作能力
 * 供 AI Agent 控制浏览器执行测试
 *
 * 支持的操作：
 * - goto(url) - 导航到 URL
 * - click(selector) - 点击元素
 * - input(selector, text) - 输入文本
 * - scroll(options) - 滚动页面
 * - wait(duration) - 等待
 * - extract(selector) - 提取文本
 * - count(selector) - 计数元素
 * - screenshot(options) - 截图
 */

class BrowserActions {
  constructor(page) {
    this.page = page;
    this.actionHistory = [];
  }

  /**
   * 导航到 URL
   * @param {string} url - 目标 URL
   * @param {Object} options - 选项
   * @returns {Object} 操作结果
   */
  async goto(url, options = {}) {
    const startTime = Date.now();
    const action = {
      type: 'goto',
      url,
      options,
      timestamp: startTime,
    };

    try {
      const defaultOptions = {
        // 使用 load 而不是 networkidle，避免 Flutter Web 的 DWDS SSE 连接导致永久等待
        waitUntil: 'load',
        timeout: 30000,
      };

      const response = await this.page.goto(url, { ...defaultOptions, ...options });

      const duration = Date.now() - startTime;

      const result = {
        success: true,
        action,
        duration,
        finalUrl: this.page.url(),
        status: response?.status(),
        timestamp: Date.now(),
      };

      this.actionHistory.push(result);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const result = {
        success: false,
        action,
        duration,
        error: error.message,
        timestamp: Date.now(),
      };

      this.actionHistory.push(result);
      return result;
    }
  }

  /**
   * 点击元素
   * @param {string} selector - CSS 选择器
   * @param {Object} options - 选项
   * @returns {Object} 操作结果
   */
  async click(selector, options = {}) {
    const startTime = Date.now();
    const action = {
      type: 'click',
      selector,
      options,
      timestamp: startTime,
    };

    try {
      const defaultOptions = {
        timeout: 5000,
        force: false,
      };

      // 先检查元素是否存在
      const elementExists = await this.page.locator(selector).count() > 0;
      if (!elementExists) {
        throw new Error(`Element not found: ${selector}`);
      }

      // 检查元素是否可见
      const isVisible = await this.page.locator(selector).isVisible();
      if (!isVisible && !options.force) {
        throw new Error(`Element not visible: ${selector}`);
      }

      // 滚动到元素
      await this.page.locator(selector).scrollIntoViewIfNeeded();

      // 点击
      await this.page.click(selector, { ...defaultOptions, ...options });

      const duration = Date.now() - startTime;

      const result = {
        success: true,
        action,
        duration,
        timestamp: Date.now(),
      };

      this.actionHistory.push(result);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const result = {
        success: false,
        action,
        duration,
        error: error.message,
        timestamp: Date.now(),
      };

      this.actionHistory.push(result);
      return result;
    }
  }

  /**
   * 输入文本
   * @param {string} selector - CSS 选择器
   * @param {string} text - 输入文本
   * @param {Object} options - 选项
   * @returns {Object} 操作结果
   */
  async input(selector, text, options = {}) {
    const startTime = Date.now();
    const action = {
      type: 'input',
      selector,
      text,
      options,
      timestamp: startTime,
    };

    try {
      const defaultOptions = {
        timeout: 5000,
        delay: 50, // 输入延迟，模拟真实输入
      };

      // 先检查元素是否存在
      const elementExists = await this.page.locator(selector).count() > 0;
      if (!elementExists) {
        throw new Error(`Element not found: ${selector}`);
      }

      // 清空现有内容
      if (options.clear !== false) {
        await this.page.fill(selector, '');
      }

      // 输入文本
      await this.page.fill(selector, text, { ...defaultOptions, ...options });

      const duration = Date.now() - startTime;

      const result = {
        success: true,
        action,
        duration,
        timestamp: Date.now(),
      };

      this.actionHistory.push(result);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const result = {
        success: false,
        action,
        duration,
        error: error.message,
        timestamp: Date.now(),
      };

      this.actionHistory.push(result);
      return result;
    }
  }

  /**
   * 滚动页面
   * @param {Object} options - 滚动选项
   * @returns {Object} 操作结果
   */
  async scroll(options = {}) {
    const startTime = Date.now();
    const action = {
      type: 'scroll',
      options,
      timestamp: startTime,
    };

    try {
      const scrollOptions = {
        x: options.x || 0,
        y: options.y || 0,
        behavior: options.behavior || 'smooth',
      };

      await this.page.evaluate((opts) => {
        window.scrollBy({
          left: opts.x,
          top: opts.y,
          behavior: opts.behavior,
        });
      }, scrollOptions);

      // 等待滚动完成
      await this.page.waitForTimeout(500);

      const duration = Date.now() - startTime;

      const scrollPosition = await this.page.evaluate(() => {
        return {
          scrollX: window.scrollX,
          scrollY: window.scrollY,
          scrollHeight: document.documentElement.scrollHeight,
        };
      });

      const result = {
        success: true,
        action,
        duration,
        scrollPosition,
        timestamp: Date.now(),
      };

      this.actionHistory.push(result);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const result = {
        success: false,
        action,
        duration,
        error: error.message,
        timestamp: Date.now(),
      };

      this.actionHistory.push(result);
      return result;
    }
  }

  /**
   * 等待
   * @param {number} duration - 等待时间（毫秒）
   * @returns {Object} 操作结果
   */
  async wait(duration) {
    const startTime = Date.now();
    const action = {
      type: 'wait',
      duration,
      timestamp: startTime,
    };

    try {
      await this.page.waitForTimeout(duration);

      const actualDuration = Date.now() - startTime;

      const result = {
        success: true,
        action,
        duration: actualDuration,
        timestamp: Date.now(),
      };

      this.actionHistory.push(result);
      return result;
    } catch (error) {
      const actualDuration = Date.now() - startTime;
      const result = {
        success: false,
        action,
        duration: actualDuration,
        error: error.message,
        timestamp: Date.now(),
      };

      this.actionHistory.push(result);
      return result;
    }
  }

  /**
   * 提取文本
   * @param {string} selector - CSS 选择器
   * @param {Object} options - 选项
   * @returns {Object} 操作结果
   */
  async extract(selector, options = {}) {
    const startTime = Date.now();
    const action = {
      type: 'extract',
      selector,
      options,
      timestamp: startTime,
    };

    try {
      const defaultOptions = {
        timeout: 5000,
        attribute: null, // 如果指定，提取属性值而不是文本
        multiple: false, // 是否提取多个元素
      };

      const opts = { ...defaultOptions, ...options };

      // 等待元素出现
      await this.page.waitForSelector(selector, { timeout: opts.timeout });

      let extractedData;

      if (opts.attribute) {
        // 提取属性值
        if (opts.multiple) {
          extractedData = await this.page.locator(selector).allTextContents();
        } else {
          extractedData = await this.page.getAttribute(selector, opts.attribute);
        }
      } else {
        // 提取文本内容
        if (opts.multiple) {
          extractedData = await this.page.locator(selector).allTextContents();
        } else {
          extractedData = await this.page.textContent(selector);
        }
      }

      const duration = Date.now() - startTime;

      const result = {
        success: true,
        action,
        duration,
        data: extractedData,
        dataType: opts.attribute ? 'attribute' : 'text',
        count: Array.isArray(extractedData) ? extractedData.length : 1,
        timestamp: Date.now(),
      };

      this.actionHistory.push(result);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const result = {
        success: false,
        action,
        duration,
        error: error.message,
        timestamp: Date.now(),
      };

      this.actionHistory.push(result);
      return result;
    }
  }

  /**
   * 计数元素
   * @param {string} selector - CSS 选择器
   * @param {Object} options - 选项
   * @returns {Object} 操作结果
   */
  async count(selector, options = {}) {
    const startTime = Date.now();
    const action = {
      type: 'count',
      selector,
      options,
      timestamp: startTime,
    };

    try {
      const defaultOptions = {
        timeout: 5000,
        visible: false, // 只计数可见元素
      };

      const opts = { ...defaultOptions, ...options };

      let count;

      if (opts.visible) {
        count = await this.page.locator(selector).filter({ hasNotText: '' }).count();
      } else {
        count = await this.page.locator(selector).count();
      }

      const duration = Date.now() - startTime;

      const result = {
        success: true,
        action,
        duration,
        count,
        timestamp: Date.now(),
      };

      this.actionHistory.push(result);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const result = {
        success: false,
        action,
        duration,
        error: error.message,
        timestamp: Date.now(),
      };

      this.actionHistory.push(result);
      return result;
    }
  }

  /**
   * 截图
   * @param {Object} options - 截图选项
   * @returns {Object} 操作结果
   */
  async screenshot(options = {}) {
    const startTime = Date.now();
    const action = {
      type: 'screenshot',
      options,
      timestamp: startTime,
    };

    try {
      const defaultOptions = {
        fullPage: false,
        type: 'png',
        quality: 80, // 仅对 jpeg 有效
      };

      const opts = { ...defaultOptions, ...options };

      // 如果没有指定路径，生成一个
      if (!opts.path) {
        const timestamp = Date.now();
        const filename = `screenshot-${timestamp}.png`;
        opts.path = options.screenshotDir
          ? `${options.screenshotDir}/${filename}`
          : `./test-screenshots/${filename}`;
      }

      const screenshotBuffer = await this.page.screenshot(opts);

      const duration = Date.now() - startTime;

      const result = {
        success: true,
        action,
        duration,
        path: opts.path,
        size: screenshotBuffer.length,
        timestamp: Date.now(),
      };

      this.actionHistory.push(result);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const result = {
        success: false,
        action,
        duration,
        error: error.message,
        timestamp: Date.now(),
      };

      this.actionHistory.push(result);
      return result;
    }
  }

  /**
   * 获取页面信息
   * @returns {Object} 页面信息
   */
  async getPageInfo() {
    const info = await this.page.evaluate(() => {
      return {
        url: window.location.href,
        title: document.title,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
        },
        scroll: {
          x: window.scrollX,
          y: window.scrollY,
          maxHeight: document.documentElement.scrollHeight,
        },
      };
    });

    return info;
  }

  /**
   * 获取元素信息
   * @param {string} selector - CSS 选择器
   * @returns {Object} 元素信息
   */
  async getElementInfo(selector) {
    try {
      const info = await this.page.locator(selector).evaluate((el) => {
        return {
          tagName: el.tagName,
          id: el.id,
          className: el.className,
          textContent: el.textContent?.substring(0, 100),
          visible: el.offsetParent !== null,
          position: {
            x: el.offsetLeft,
            y: el.offsetTop,
            width: el.offsetWidth,
            height: el.offsetHeight,
          },
        };
      });

      return {
        success: true,
        selector,
        info,
      };
    } catch (error) {
      return {
        success: false,
        selector,
        error: error.message,
      };
    }
  }

  /**
   * 执行 JavaScript
   * @param {Function} script - JavaScript 函数
   * @param {Object} args - 参数
   * @returns {Object} 执行结果
   */
  async executeScript(script, args = {}) {
    const startTime = Date.now();
    const action = {
      type: 'executeScript',
      timestamp: startTime,
    };

    try {
      const result = await this.page.evaluate(script, args);

      const duration = Date.now() - startTime;

      return {
        success: true,
        action,
        duration,
        result,
        timestamp: Date.now(),
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      return {
        success: false,
        action,
        duration,
        error: error.message,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * 获取操作历史
   * @returns {Array} 操作历史
   */
  getActionHistory() {
    return this.actionHistory;
  }

  /**
   * 清除操作历史
   */
  clearActionHistory() {
    this.actionHistory = [];
  }

  /**
   * 获取操作统计
   * @returns {Object} 操作统计
   */
  getActionStats() {
    const stats = {
      total: this.actionHistory.length,
      successful: 0,
      failed: 0,
      byType: {},
      totalDuration: 0,
    };

    for (const action of this.actionHistory) {
      if (action.success) {
        stats.successful++;
      } else {
        stats.failed++;
      }

      const type = action.action?.type || 'unknown';
      stats.byType[type] = (stats.byType[type] || 0) + 1;

      stats.totalDuration += action.duration || 0;
    }

    return stats;
  }
}

module.exports = BrowserActions;
