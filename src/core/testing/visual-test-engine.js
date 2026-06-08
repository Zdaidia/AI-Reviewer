/**
 * Visual Test Engine
 *
 * 视觉测试引擎 - 整合 AI 视觉分析能力
 *
 * 功能：
 * - 读取设计稿（Figma/图片）
 * - 截取页面截图
 * - AI 对比分析
 * - 检查结构、元素、布局、缺失
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { getLogger } = require('../utils/logger');
const { ScannerError } = require('../errors/scanner-errors');

class VisualTestEngine {
  constructor(options = {}) {
    this.options = {
      screenshotDir: options.screenshotDir || './test-screenshots',
      designDir: options.designDir || './designs',
      comparisonThreshold: options.comparisonThreshold || 0.95,
      enableAIDetection: options.enableAIDetection !== false,
      ...options,
    };

    this.logger = getLogger('VisualTestEngine');
    this.browser = null;
    this.page = null;
    this.aiAnalyzer = options.aiAnalyzer || null;
  }

  /**
   * 初始化浏览器
   */
  async initialize() {
    if (this.browser) {
      return;
    }

    this.logger.info('Initializing browser for visual testing');

    this.browser = await chromium.launch({
      headless: this.options.headless !== false,
      slowMo: this.options.slowMo || 50,
    });

    this.page = await this.browser.newPage();
    await this.page.setViewportSize({
      width: 1920,
      height: 1080,
    });

    this.logger.info('Browser initialized');
  }

  /**
   * 执行视觉测试
   * @param {Object} input - 输入数据
   * @param {string} input.designPath - 设计稿路径
   * @param {string} input.url - 要测试的页面URL
   * @param {Object} options - 选项
   * @returns {Object} 测试结果
   */
  async executeVisualTest(input, options = {}) {
    await this.initialize();

    const {
      designPath = input.designPath,
      url = input.url,
      testType = input.testType || 'layout', // layout, element, content, missing
      waitForSelector = options.waitForSelector,
      screenshotPath = options.screenshotPath,
    } = input;

    this.logger.info('Starting visual test', {
      designPath,
      url,
      testType,
    });

    try {
      // 步骤1: 加载设计稿
      const designInfo = await this.loadDesign(designPath);
      this.logger.info('Design loaded', {
        type: designInfo.type,
        elements: designInfo.elements?.length || 0,
      });

      // 步骤2: 访问页面并截图
      const screenshotInfo = await this.captureScreenshot(url, {
        waitForSelector,
        screenshotPath,
      });
      this.logger.info('Screenshot captured', {
        path: screenshotInfo.path,
        size: screenshotInfo.size,
      });

      // 步骤3: AI 分析对比
      const comparison = await this.compareDesignAndScreenshot(designInfo, screenshotInfo, {
        testType,
        useAI: this.options.enableAIDetection,
      });

      // 步骤4: 生成测试报告
      const report = this.generateVisualTestReport({
        designInfo,
        screenshotInfo,
        comparison,
        testType,
      });

      return {
        success: true,
        designPath,
        url,
        testType,
        report,
      };
    } catch (error) {
      this.logger.error('Visual test failed', {
        error: error.message,
        designPath,
        url,
      });

      return {
        success: false,
        error: error.message,
        designPath,
        url,
      };
    }
  }

  /**
   * 加载设计稿
   * @param {string} designPath - 设计稿路径
   * @returns {Object} 设计信息
   */
  async loadDesign(designPath) {
    const ext = path.extname(designPath).toLowerCase();

    this.logger.debug('Loading design', { designPath, ext });

    if (ext === '.json') {
      // Figma 导出的 JSON
      return await this.loadFigmaDesign(designPath);
    } else if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
      // 图片设计稿
      return await this.loadImageDesign(designPath);
    } else if (ext === '.fig') {
      // Figma 文件（需要转换）
      return await this.loadFigmaFile(designPath);
    } else {
      throw new ScannerError(
        `Unsupported design format: ${ext}`,
        'UNSUPPORTED_DESIGN_FORMAT'
      );
    }
  }

  /**
   * 加载 Figma 设计（JSON）
   * @param {string} jsonPath - JSON 文件路径
   * @returns {Object} 设计信息
   */
  async loadFigmaDesign(jsonPath) {
    try {
      const content = fs.readFileSync(jsonPath, 'utf8');
      const figmaData = JSON.parse(content);

      const elements = this.extractFigmaElements(figmaData);

      return {
        type: 'figma',
        format: 'json',
        elements,
        metadata: {
          name: figmaData.name || 'Untitled',
          lastModified: figmaData.lastModified,
          version: figmaData.version,
        },
      };
    } catch (error) {
      this.logger.error('Failed to load Figma design', {
        jsonPath,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * 从 Figma 数据提取元素
   * @param {Object} figmaData - Figma 数据
   * @returns {Array} 元素列表
   */
  extractFigmaElements(figmaData) {
    const elements = [];

    const traverse = (node, parentPath = '') => {
      if (!node) return;

      const currentPath = parentPath ? `${parentPath}/${node.name}` : node.name;

      // 提取元素信息
      if (node.type === 'FRAME' || node.type === 'INSTANCE' || node.type === 'COMPONENT') {
        const element = {
          id: node.id,
          name: node.name,
          type: node.type,
          path: currentPath,
          visible: node.visible !== false,
          locked: node.locked || false,
          // 位置和尺寸
          position: {
            x: node.absoluteBoundingBox?.x || node.x,
            y: node.absoluteBoundingBox?.y || node.y,
            width: node.width,
            height: node.height,
          },
          // 样式
          style: {
            fills: node.fills,
            strokes: node.strokes,
            effects: node.effects,
            opacity: node.opacity,
            cornerRadius: node.cornerRadius,
          },
          // 内容
          content: this.extractTextContent(node),
          // 子元素
          children: node.children?.map(c => c.name) || [],
        };

        elements.push(element);
      }

      // 递归遍历子节点
      if (node.children) {
        for (const child of node.children) {
          traverse(child, currentPath);
        }
      }
    };

    // 从 document 开始遍历
    if (figmaData.document) {
      traverse(figmaData.document);
    } else if (figmaData.children) {
      for (const child of figmaData.children) {
        traverse(child);
      }
    }

    return elements;
  }

  /**
   * 提取文本内容
   * @param {Object} node - 节点
   * @returns {string} 文本内容
   */
  extractTextContent(node) {
    if (node.characters) {
      return node.characters;
    }

    if (node.children) {
      return node.children
        .map(child => this.extractTextContent(child))
        .filter(text => text)
        .join(' ');
    }

    return '';
  }

  /**
   * 加载图片设计稿
   * @param {string} imagePath - 图片路径
   * @returns {Object} 设计信息
   */
  async loadImageDesign(imagePath) {
    try {
      const stats = fs.statSync(imagePath);
      const buffer = fs.readFileSync(imagePath);

      // 如果有 AI 分析器，使用 AI 分析图片
      let elements = [];
      if (this.aiAnalyzer && this.options.enableAIDetection) {
        elements = await this.analyzeDesignImage(imagePath);
      }

      return {
        type: 'image',
        format: path.extname(imagePath).substring(1),
        elements,
        metadata: {
          path: imagePath,
          size: stats.size,
          modified: stats.mtime,
        },
      };
    } catch (error) {
      this.logger.error('Failed to load image design', {
        imagePath,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * 加载 Figma 文件（占位符）
   * @param {string} figPath - Figma 文件路径
   * @returns {Object} 设计信息
   */
  async loadFigmaFile(figPath) {
    // TODO: 实现 Figma API 集成
    this.logger.warn('Figma file format not yet supported', { figPath });
    throw new ScannerError(
      'Figma file format requires Figma API integration',
      'FIGMA_API_REQUIRED'
    );
  }

  /**
   * 截取页面截图
   * @param {string} url - 页面 URL
   * @param {Object} options - 选项
   * @returns {Object} 截图信息
   */
  async captureScreenshot(url, options = {}) {
    const {
      waitForSelector = null,
      screenshotPath = null,
      fullPage = true,
    } = options;

    this.logger.info('Navigating to page', { url });

    await this.page.goto(url, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    // 等待特定元素
    if (waitForSelector) {
      this.logger.debug('Waiting for selector', { waitForSelector });
      await this.page.waitForSelector(waitForSelector, {
        timeout: 10000,
      });
    }

    // 等待页面稳定
    await this.page.waitForTimeout(1000);

    // 生成截图路径
    const timestamp = Date.now();
    const defaultPath = path.join(
      this.options.screenshotDir,
      `screenshot-${timestamp}.png`
    );
    const finalPath = screenshotPath || defaultPath;

    // 确保目录存在
    const dir = path.dirname(finalPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // 截图
    this.logger.debug('Taking screenshot', { path: finalPath });
    await this.page.screenshot({
      path: finalPath,
      fullPage,
    });

    const stats = fs.statSync(finalPath);

    return {
      path: finalPath,
      size: stats.size,
      timestamp,
      url,
    };
  }

  /**
   * 对比设计和截图
   * @param {Object} designInfo - 设计信息
   * @param {Object} screenshotInfo - 截图信息
   * @param {Object} options - 选项
   * @returns {Object} 对比结果
   */
  async compareDesignAndScreenshot(designInfo, screenshotInfo, options = {}) {
    const { testType = 'layout', useAI = true } = options;

    this.logger.info('Comparing design with screenshot', {
      testType,
      useAI,
    });

    const comparison = {
      testType,
      timestamp: Date.now(),
      structure: null,
      elements: null,
      layout: null,
      missing: null,
      overallScore: 0,
    };

    switch (testType) {
      case 'structure':
        comparison.structure = await this.compareStructure(designInfo, screenshotInfo, useAI);
        break;
      case 'element':
        comparison.elements = await this.compareElements(designInfo, screenshotInfo, useAI);
        break;
      case 'layout':
        comparison.layout = await this.compareLayout(designInfo, screenshotInfo, useAI);
        break;
      case 'missing':
        comparison.missing = await this.checkMissing(designInfo, screenshotInfo, useAI);
        break;
      case 'comprehensive':
        comparison.structure = await this.compareStructure(designInfo, screenshotInfo, useAI);
        comparison.elements = await this.compareElements(designInfo, screenshotInfo, useAI);
        comparison.layout = await this.compareLayout(designInfo, screenshotInfo, useAI);
        comparison.missing = await this.checkMissing(designInfo, screenshotInfo, useAI);
        break;
    }

    // 计算总体评分
    comparison.overallScore = this.calculateOverallScore(comparison);

    return comparison;
  }

  /**
   * 对比结构
   */
  async compareStructure(designInfo, screenshotInfo, useAI) {
    this.logger.info('Comparing structure');

    const structure = {
      designElements: designInfo.elements?.length || 0,
      matched: [],
      unmatched: [],
      score: 0,
    };

    if (useAI && this.aiAnalyzer) {
      // 使用 AI 分析截图结构
      const screenshotAnalysis = await this.analyzeScreenshotStructure(screenshotInfo.path);

      // 对比元素
      for (const designEl of designInfo.elements) {
        const match = screenshotAnalysis.elements.find(se =>
          this.isElementMatch(designEl, se)
        );

        if (match) {
          structure.matched.push({
            design: designEl,
            screenshot: match,
            confidence: match.confidence || 0.9,
          });
        } else {
          structure.unmatched.push({
            design: designEl,
            reason: 'Not found in screenshot',
          });
        }
      }

      // 检查额外的元素（设计稿中没有的）
      for (const screenshotEl of screenshotAnalysis.elements) {
        const exists = designInfo.elements.find(de =>
          this.isElementMatch(de, screenshotEl)
        );

        if (!exists) {
          structure.unmatched.push({
            screenshot: screenshotEl,
            reason: 'Extra element not in design',
          });
        }
      }

      structure.score = structure.matched.length / Math.max(structure.designElements, 1);
    }

    this.logger.info('Structure comparison completed', {
      matched: structure.matched.length,
      unmatched: structure.unmatched.length,
      score: structure.score.toFixed(2),
    });

    return structure;
  }

  /**
   * 对比元素
   */
  async compareElements(designInfo, screenshotInfo, useAI) {
    this.logger.info('Comparing elements');

    const elements = {
      byType: {},
      issues: [],
      score: 0,
    };

    if (useAI && this.aiAnalyzer) {
      const screenshotAnalysis = await this.analyzeScreenshotElements(screenshotInfo.path);

      // 按类型分组对比
      for (const designEl of designInfo.elements) {
        const type = this.getElementType(designEl);
        if (!elements.byType[type]) {
          elements.byType[type] = {
            design: [],
            screenshot: [],
            matched: [],
            missing: [],
          };
        }

        elements.byType[type].design.push(designEl);

        const screenshotEls = screenshotAnalysis.elements.filter(se =>
          this.getElementType(se) === type
        );
        elements.byType[type].screenshot = screenshotEls;

        // 检查是否存在
        const exists = screenshotEls.some(se =>
          this.isElementMatch(designEl, se)
        );

        if (exists) {
          elements.byType[type].matched.push(designEl);
        } else {
          elements.byType[type].missing.push(designEl);
          elements.issues.push({
            type: 'missing',
            element: designEl,
            message: `Element "${designEl.name}" not found in screenshot`,
          });
        }
      }

      // 计算分数
      let totalMatched = 0;
      let totalElements = 0;

      for (const type in elements.byType) {
        const typeData = elements.byType[type];
        totalElements += typeData.design.length;
        totalMatched += typeData.matched.length;
      }

      elements.score = totalElements > 0 ? totalMatched / totalElements : 1;
    }

    this.logger.info('Elements comparison completed', {
      byType: Object.keys(elements.byType),
      issues: elements.issues.length,
      score: elements.score.toFixed(2),
    });

    return elements;
  }

  /**
   * 对比布局
   */
  async compareLayout(designInfo, screenshotInfo, useAI) {
    this.logger.info('Comparing layout');

    const layout = {
      alignment: [],
      spacing: [],
      size: [],
      issues: [],
      score: 0,
    };

    if (useAI && this.aiAnalyzer) {
      const screenshotAnalysis = await this.analyzeScreenshotLayout(screenshotInfo.path);

      // 对比每个设计元素的布局
      for (const designEl of designInfo.elements) {
        const match = screenshotAnalysis.elements.find(se =>
          se.name === designEl.name || se.id === designEl.id
        );

        if (match) {
          // 检查对齐
          if (Math.abs(designEl.position.x - match.position.x) > 10) {
            layout.alignment.push({
              element: designEl.name,
              design: designEl.position.x,
              screenshot: match.position.x,
              diff: Math.abs(designEl.position.x - match.position.x),
            });
          }

          // 检查尺寸
          if (Math.abs(designEl.position.width - match.position.width) > 10) {
            layout.size.push({
              element: designEl.name,
              design: designEl.position.width,
              screenshot: match.position.width,
              diff: Math.abs(designEl.position.width - match.position.width),
            });
          }

          // 检查高度
          if (Math.abs(designEl.position.height - match.position.height) > 10) {
            layout.size.push({
              element: designEl.name,
              design: designEl.position.height,
              screenshot: match.position.height,
              diff: Math.abs(designEl.position.height - match.position.height),
            });
          }
        }
      }

      // 计算布局分数
      const totalElements = designInfo.elements.length;
      const issues = layout.alignment.length + layout.spacing.length + layout.size.length;
      layout.score = 1 - (issues / Math.max(totalElements * 3, 1));

      // 生成布局问题
      layout.issues = [
        ...layout.alignment.map(a => ({
          type: 'alignment',
          message: `Element "${a.element}" X position mismatch (diff: ${a.diff}px)`,
        })),
        ...layout.size.map(s => ({
          type: 'size',
          message: `Element "${s.element}" size mismatch (width: ${s.diff}px, height: ${s.diff}px)`,
        })),
      ];
    }

    this.logger.info('Layout comparison completed', {
      alignment: layout.alignment.length,
      size: layout.size.length,
      issues: layout.issues.length,
      score: layout.score.toFixed(2),
    });

    return layout;
  }

  /**
   * 检查缺失元素
   */
  async checkMissing(designInfo, screenshotInfo, useAI) {
    this.logger.info('Checking for missing elements');

    const missing = {
      missing: [],
      extra: [],
      score: 0,
    };

    if (useAI && this.aiAnalyzer) {
      const screenshotAnalysis = await this.analyzeScreenshotElements(screenshotInfo.path);

      // 检查设计中的元素是否都在截图中
      for (const designEl of designInfo.elements) {
        const found = screenshotAnalysis.elements.some(se =>
          this.isElementMatch(designEl, se)
        );

        if (!found && designEl.visible !== false) {
          missing.missing.push({
            element: designEl.name,
            type: this.getElementType(designEl),
            reason: 'Not found in screenshot',
            design: designEl,
          });
        }
      }

      // 检查截图中是否有额外的元素
      for (const screenshotEl of screenshotAnalysis.elements) {
        const found = designInfo.elements.some(de =>
          this.isElementMatch(de, screenshotEl)
        );

        if (!found) {
          missing.extra.push({
            element: screenshotEl.name,
            type: screenshotEl.type,
            reason: 'Extra element not in design',
            screenshot: screenshotEl,
          });
        }
      }

      // 计算分数
      const total = designInfo.elements.length;
      missing.score = 1 - (missing.missing.length / Math.max(total, 1));
    }

    this.logger.info('Missing elements check completed', {
      missing: missing.missing.length,
      extra: missing.extra.length,
      score: missing.score.toFixed(2),
    });

    return missing;
  }

  /**
   * 分析设计图片（AI）
   */
  async analyzeDesignImage(imagePath) {
    if (!this.aiAnalyzer) {
      this.logger.warn('No AI analyzer available, skipping design image analysis');
      return [];
    }

    try {
      this.logger.debug('Analyzing design image', { imagePath });

      // 调用 AI 分析器
      const result = await this.aiAnalyzer.analyzeImage({
        imageSource: imagePath,
        prompt: `分析这个UI设计稿，提取以下信息：
1. 所有可见的UI元素（按钮、文本、图片等）
2. 每个元素的位置（x, y, width, height）
3. 每个元素的类型（button, text, image, container等）
4. 每个元素的文本内容（如果有）
5. 元素的层级结构

请以JSON格式返回结果。`,
      });

      if (result.success) {
        return this.parseAIAnalysisResult(result.content);
      }

      return [];
    } catch (error) {
      this.logger.error('Failed to analyze design image', {
        imagePath,
        error: error.message,
      });
      return [];
    }
  }

  /**
   * 分析截图结构（AI）
   */
  async analyzeScreenshotStructure(screenshotPath) {
    if (!this.aiAnalyzer) {
      return { elements: [] };
    }

    try {
      this.logger.debug('Analyzing screenshot structure', { screenshotPath });

      const result = await this.aiAnalyzer.analyzeImage({
        imageSource: screenshotPath,
        prompt: `分析这个网页截图，提取页面结构信息：
1. 识别所有主要的UI元素
2. 每个元素的类型和名称
3. 元素的位置和尺寸
4. 元素的可见性

请以JSON格式返回，包含 elements 数组。`,
      });

      if (result.success) {
        return this.parseAIAnalysisResult(result.content);
      }

      return { elements: [] };
    } catch (error) {
      this.logger.error('Failed to analyze screenshot structure', {
        screenshotPath,
        error: error.message,
      });
      return { elements: [] };
    }
  }

  /**
   * 分析截图元素（AI）
   */
  async analyzeScreenshotElements(screenshotPath) {
    return await this.analyzeScreenshotStructure(screenshotPath);
  }

  /**
   * 分析截图布局（AI）
   */
  async analyzeScreenshotLayout(screenshotPath) {
    return await this.analyzeScreenshotStructure(screenshotPath);
  }

  /**
   * 解析 AI 分析结果
   */
  parseAIAnalysisResult(content) {
    try {
      // 尝试提取 JSON
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const jsonStr = jsonMatch[1] || jsonMatch[0];
        const parsed = JSON.parse(jsonStr);

        if (parsed.elements) {
          return parsed;
        }
      }

      return { elements: [] };
    } catch (error) {
      this.logger.warn('Failed to parse AI analysis result', {
        error: error.message,
      });
      return { elements: [] };
    }
  }

  /**
   * 判断两个元素是否匹配
   */
  isElementMatch(el1, el2) {
    // 按名称匹配
    if (el1.name && el2.name && el1.name === el2.name) {
      return true;
    }

    // 按 ID 匹配
    if (el1.id && el2.id && el1.id === el2.id) {
      return true;
    }

    // 按位置匹配（容差10px）
    const posMatch =
      Math.abs((el1.position?.x || 0) - (el2.position?.x || 0)) < 10 &&
      Math.abs((el1.position?.y || 0) - (el2.position?.y || 0)) < 10;

    return posMatch;
  }

  /**
   * 获取元素类型
   */
  getElementType(element) {
    if (element.type) {
      return element.type.toLowerCase();
    }

    // 基于 name 推断类型
    const name = element.name?.toLowerCase() || '';
    if (name.includes('button')) return 'button';
    if (name.includes('input') || name.includes('field')) return 'input';
    if (name.includes('text')) return 'text';
    if (name.includes('image')) return 'image';
    if (name.includes('container') || name.includes('wrapper')) return 'container';

    return 'element';
  }

  /**
   * 计算总体评分
   */
  calculateOverallScore(comparison) {
    const scores = [];

    if (comparison.structure?.score !== undefined) {
      scores.push(comparison.structure.score);
    }

    if (comparison.elements?.score !== undefined) {
      scores.push(comparison.elements.score);
    }

    if (comparison.layout?.score !== undefined) {
      scores.push(comparison.layout.score);
    }

    if (comparison.missing?.score !== undefined) {
      scores.push(comparison.missing.score);
    }

    if (scores.length === 0) {
      return 0;
    }

    return scores.reduce((a, b) => a + b, 0) / scores.length;
  }

  /**
   * 生成视觉测试报告
   */
  generateVisualTestReport(data) {
    const { designInfo, screenshotInfo, comparison, testType } = data;

    const report = {
      timestamp: new Date().toISOString(),
      testType,
      designPath: designInfo.metadata?.path || 'N/A',
      screenshotPath: screenshotInfo.path,
      url: screenshotInfo.url,
      overallScore: comparison.overallScore,
      status: this.getStatus(comparison.overallScore),
      summary: this.generateSummary(comparison),
      details: comparison,
    };

    return report;
  }

  /**
   * 获取状态
   */
  getStatus(score) {
    if (score >= 0.9) return 'passed';
    if (score >= 0.7) return 'acceptable';
    return 'failed';
  }

  /**
   * 生成摘要
   */
  generateSummary(comparison) {
    const summary = [];

    if (comparison.structure) {
      summary.push({
        category: 'Structure',
        score: comparison.structure.score.toFixed(2),
        matched: comparison.structure.matched.length,
        unmatched: comparison.structure.unmatched.length,
      });
    }

    if (comparison.elements) {
      summary.push({
        category: 'Elements',
        score: comparison.elements.score.toFixed(2),
        issues: comparison.elements.issues.length,
      });
    }

    if (comparison.layout) {
      summary.push({
        category: 'Layout',
        score: comparison.layout.score.toFixed(2),
        issues: comparison.layout.issues.length,
      });
    }

    if (comparison.missing) {
      summary.push({
        category: 'Missing',
        score: comparison.missing.score.toFixed(2),
        missing: comparison.missing.missing.length,
        extra: comparison.missing.extra.length,
      });
    }

    return summary;
  }

  /**
   * 清理资源
   */
  async cleanup() {
    if (this.page) {
      await this.page.close();
      this.page = null;
    }

    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }

    this.logger.info('Resources cleaned up');
  }
}

module.exports = VisualTestEngine;
