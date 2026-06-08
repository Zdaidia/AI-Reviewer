/**
 * Figma Integration Module
 *
 * 从 Figma 获取设计信息并生成测试用例
 * 功能：
 * - 解析 Figma URL 获取文件和节点信息
 * - 提取设计规范（颜色、字体、尺寸、布局）
 * - 下载设计截图
 * - 生成测试用例和验证规则
 * - 支持像素级对比
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

class FigmaIntegration {
  constructor() {
    this.apiUrl = 'api.figma.com';
    this.accessToken = null;
    this.cache = new Map();
  }

  /**
   * 设置访问令牌
   * @param {string} token - Figma 访问令牌
   */
  setAccessToken(token) {
    this.accessToken = token;
  }

  /**
   * 解析 Figma URL
   * @param {string} url - Figma URL
   * @returns {Object} 解析后的信息
   */
  parseFigmaUrl(url) {
    // 支持的 URL 格式：
    // https://www.figma.com/file/{fileKey}/{title}
    // https://www.figma.com/design/{fileKey}/{title}
    // https://www.figma.com/proto/{fileKey}/{title}

    const patterns = [
      /figma\.com\/file\/([a-zA-Z0-9]+)/,
      /figma\.com\/design\/([a-zA-Z0-9]+)/,
      /figma\.com\/proto\/([a-zA-Z0-9]+)/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return {
          fileKey: match[1],
          url,
        };
      }
    }

    throw new Error('Invalid Figma URL format');
  }

  /**
   * 获取 Figma 文件信息
   * @param {string} fileKey - 文件键
   * @returns {Promise<Object>} 文件信息
   */
  async getFile(fileKey) {
    if (!this.accessToken) {
      throw new Error('Figma access token is required');
    }

    const cacheKey = `file_${fileKey}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const path = `/v1/files/${fileKey}`;
    const data = await this.makeRequest(path);

    this.cache.set(cacheKey, data);
    return data;
  }

  /**
   * 获取文件节点
   * @param {string} fileKey - 文件键
   * @param {string} nodeId - 节点 ID
   * @returns {Promise<Object>} 节点信息
   */
  async getFileNode(fileKey, nodeId) {
    if (!this.accessToken) {
      throw new Error('Figma access token is required');
    }

    const path = `/v1/files/${fileKey}/nodes?ids=${nodeId}`;
    const data = await this.makeRequest(path);

    return data.nodes[nodeId];
  }

  /**
   * 获取组件信息
   * @param {string} componentKey - 组件键
   * @returns {Promise<Object>} 组件信息
   */
  async getComponent(componentKey) {
    if (!this.accessToken) {
      throw new Error('Figma access token is required');
    }

    const path = `/v1/components/${componentKey}`;
    return await this.makeRequest(path);
  }

  /**
   * 获取图片下载链接
   * @param {string} fileKey - 文件键
   * @param {Array} ids - 节点 ID 数组
   * @param {Object} options - 导出选项
   * @returns {Promise<Object>} 图片信息
   */
  async getImage(fileKey, ids, options = {}) {
    if (!this.accessToken) {
      throw new Error('Figma access token is required');
    }

    const {
      format = 'png',
      scale = 1,
      svgExportId = false,
    } = options;

    const idsParam = Array.isArray(ids) ? ids.join(',') : ids;
    const path = `/v1/images/${fileKey}?ids=${idsParam}&format=${format}&scale=${scale}&use_absolute_bounds=${svgExportId}`;

    return await this.makeRequest(path);
  }

  /**
   * 下载图片
   * @param {string} url - 图片 URL
   * @param {string} outputPath - 输出路径
   * @returns {Promise<void>}
   */
  async downloadImage(url, outputPath) {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(outputPath);

      https.get(url, (response) => {
        response.pipe(file);

        file.on('finish', () => {
          file.close();
          resolve();
        });
      }).on('error', (err) => {
        fs.unlink(outputPath, () => {});
        reject(err);
      });
    });
  }

  /**
   * 解析节点获取设计规范
   * @param {Object} node - Figma 节点
   * @returns {Object} 设计规范
   */
  parseNodeSpecs(node) {
    if (!node || !node.document) {
      return null;
    }

    const specs = {
      id: node.document.id,
      name: node.document.name,
      type: node.document.type,
      children: [],
    };

    // 解析当前节点的样式
    if (node.document.fills) {
      specs.fills = this.parseFills(node.document.fills);
    }

    if (node.document.strokes) {
      specs.strokes = this.parseStrokes(node.document.strokes);
    }

    if (node.document.effects) {
      specs.effects = this.parseEffects(node.document.effects);
    }

    // 解析尺寸和位置
    if (node.document.absoluteBoundingBox) {
      specs.boundingBox = {
        x: node.document.absoluteBoundingBox.x,
        y: node.document.absoluteBoundingBox.y,
        width: node.document.absoluteBoundingBox.width,
        height: node.document.absoluteBoundingBox.height,
      };
    }

    if (node.document.layoutAlign) {
      specs.layoutAlign = node.document.layoutAlign;
    }

    // 解析文本样式
    if (node.document.type === 'TEXT') {
      specs.textStyle = this.parseTextStyle(node.document);
    }

    // 递归解析子节点
    if (node.document.children) {
      for (const child of node.document.children) {
        const childSpec = this.parseNodeSpecs({ document: child });
        if (childSpec) {
          specs.children.push(childSpec);
        }
      }
    }

    return specs;
  }

  /**
   * 解析填充
   * @param {Array} fills - 填充数组
   * @returns {Array} 解析后的填充
   */
  parseFills(fills) {
    return fills.map(fill => {
      if (fill.type === 'SOLID' && fill.color) {
        return {
          type: 'solid',
          color: this.rgbToHex(
            fill.color.r,
            fill.color.g,
            fill.color.b,
            fill.opacity ?? 1
          ),
        };
      } else if (fill.type === 'GRADIENT_LINEAR') {
        return {
          type: 'linear-gradient',
          gradientStops: fill.gradientStops,
        };
      }
      return fill;
    });
  }

  /**
   * 解析描边
   * @param {Array} strokes - 描边数组
   * @returns {Array} 解析后的描边
   */
  parseStrokes(strokes) {
    return strokes.map(stroke => {
      if (stroke.type === 'SOLID' && stroke.color) {
        return {
          type: 'solid',
          color: this.rgbToHex(
            stroke.color.r,
            stroke.color.g,
            stroke.color.b,
            stroke.opacity ?? 1
          ),
          weight: stroke.weight,
        };
      }
      return stroke;
    });
  }

  /**
   * 解析效果
   * @param {Array} effects - 效果数组
   * @returns {Array} 解析后的效果
   */
  parseEffects(effects) {
    return effects.map(effect => {
      if (effect.type === 'DROP_SHADOW') {
        return {
          type: 'drop-shadow',
          color: this.rgbToHex(
            effect.color.r,
            effect.color.g,
            effect.color.b,
            effect.color.a ?? 1
          ),
          offset: {
            x: effect.offset.x,
            y: effect.offset.y,
          },
          radius: effect.radius,
        };
      } else if (effect.type === 'INNER_SHADOW') {
        return {
          type: 'inner-shadow',
          color: this.rgbToHex(
            effect.color.r,
            effect.color.g,
            effect.color.b,
            effect.color.a ?? 1
          ),
          offset: {
            x: effect.offset.x,
            y: effect.offset.y,
          },
          radius: effect.radius,
        };
      }
      return effect;
    });
  }

  /**
   * 解析文本样式
   * @param {Object} node - 文本节点
   * @returns {Object} 文本样式
   */
  parseTextStyle(node) {
    const style = {
      fontSize: node.style?.fontSize,
      fontFamily: node.style?.fontFamily,
      fontWeight: node.style?.fontWeight,
      lineHeight: node.style?.lineHeightPx ?? node.style?.lineHeightPercent,
      letterSpacing: node.style?.letterSpacing,
      textAlignHorizontal: node.style?.textAlignHorizontal,
      textAlignVertical: node.style?.textAlignVertical,
    };

    if (node.fills) {
      style.color = this.parseFills(node.fills)[0]?.color;
    }

    return style;
  }

  /**
   * 将 RGB 转换为十六进制
   * @param {number} r - Red (0-1)
   * @param {number} g - Green (0-1)
   * @param {number} b - Blue (0-1)
   * @param {number} a - Alpha (0-1)
   * @returns {string} 十六进制颜色
   */
  rgbToHex(r, g, b, a = 1) {
    const toHex = (n) => {
      const hex = Math.round(n * 255).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    };

    let hex = `#${toHex(r)}${toHex(g)}${toHex(b)}`;

    if (a < 1) {
      hex += toHex(a);
    }

    return hex;
  }

  /**
   * 从设计规范生成测试用例
   * @param {Object} specs - 设计规范
   * @param {Object} options - 选项
   * @returns {Array} 测试用例
   */
  generateTestCasesFromSpecs(specs, options = {}) {
    const testCases = [];

    if (!specs) return testCases;

    // 为当前节点生成测试用例
    if (specs.name && specs.type !== 'DOCUMENT' && specs.type !== 'PAGE') {
      const testCase = {
        id: `figma_${specs.id}`,
        name: `验证 ${specs.name} 的设计规范`,
        description: `从 Figma 生成：${specs.name}`,
        type: 'visual',

        // 自动生成选择器
        selector: this.generateSelectorFromName(specs.name),

        // 验证规则
        validations: [],

        // Figma 信息
        figma: {
          nodeId: specs.id,
          nodeName: specs.name,
        },

        priority: 'medium',
        tags: ['figma', 'visual', specs.type.toLowerCase()],
      };

      // 添加尺寸验证
      if (specs.boundingBox) {
        testCase.validations.push({
          type: 'size',
          selector: testCase.selector,
          expected: {
            width: `${specs.boundingBox.width}px`,
            height: `${specs.boundingBox.height}px`,
          },
          tolerance: options.sizeTolerance ?? 2,
        });
      }

      // 添加颜色验证
      if (specs.fills && specs.fills.length > 0) {
        const fill = specs.fills[0];
        if (fill.type === 'solid' && fill.color) {
          testCase.validations.push({
            type: 'css',
            selector: testCase.selector,
            expected: {
              backgroundColor: fill.color,
            },
          });
        }
      }

      // 添加文本样式验证
      if (specs.textStyle) {
        if (specs.textStyle.fontSize) {
          testCase.validations.push({
            type: 'css',
            selector: testCase.selector,
            expected: {
              fontSize: `${specs.textStyle.fontSize}px`,
            },
          });
        }

        if (specs.textStyle.fontFamily) {
          testCase.validations.push({
            type: 'css',
            selector: testCase.selector,
            expected: {
              fontFamily: specs.textStyle.fontFamily,
            },
          });
        }

        if (specs.textStyle.color) {
          testCase.validations.push({
            type: 'css',
            selector: testCase.selector,
            expected: {
              color: specs.textStyle.color,
            },
          });
        }
      }

      testCases.push(testCase);
    }

    // 递归处理子节点
    if (specs.children) {
      for (const child of specs.children) {
        const childTests = this.generateTestCasesFromSpecs(child, options);
        testCases.push(...childTests);
      }
    }

    return testCases;
  }

  /**
   * 从名称生成选择器
   * @param {string} name - 节点名称
   * @returns {string} CSS 选择器
   */
  generateSelectorFromName(name) {
    // 移除特殊字符和空格
    const cleanName = name
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
      .replace(/^-+|-+$/g, '');

    // 尝试生成合理的选择器
    const selectors = [
      `#${cleanName}`,           // ID
      `.${cleanName}`,           // Class
      `[data-testid="${cleanName}"]`,  // Test ID
      `[aria-label="${name}"]`,  // ARIA label
    ];

    return selectors[0]; // 返回第一个（最优先的）
  }

  /**
   * 批量下载设计稿截图
   * @param {string} fileKey - 文件键
   * @param {Array} nodeIds - 节点 ID 数组
   * @param {string} outputDir - 输出目录
   * @param {Object} options - 选项
   * @returns {Promise<Array>} 下载的文件路径
   */
  async batchDownloadScreenshots(fileKey, nodeIds, outputDir, options = {}) {
    const {
      format = 'png',
      scale = 2,
      useAbsoluteBounds = true,
    } = options;

    // 确保输出目录存在
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // 获取图片 URL
    const imagesResponse = await this.getImage(fileKey, nodeIds, {
      format,
      scale,
      svgExportId: useAbsoluteBounds,
    });

    const downloadedFiles = [];

    // 下载每个图片
    for (const [nodeId, imageUrl] of Object.entries(imagesResponse.images)) {
      const fileName = `${nodeId}.${format}`;
      const outputPath = path.join(outputDir, fileName);

      try {
        await this.downloadImage(imageUrl, outputPath);
        downloadedFiles.push({
          nodeId,
          path: outputPath,
          url: imageUrl,
        });
      } catch (error) {
        console.error(`Failed to download ${nodeId}:`, error.message);
      }
    }

    return downloadedFiles;
  }

  /**
   * 发起 HTTPS 请求
   * @param {string} path - 请求路径
   * @returns {Promise<Object>} 响应数据
   */
  makeRequest(path) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: this.apiUrl,
        path,
        method: 'GET',
        headers: {
          'X-Figma-Token': this.accessToken,
          'Content-Type': 'application/json',
        },
      };

      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const jsonData = JSON.parse(data);

            if (res.statusCode === 200) {
              resolve(jsonData);
            } else {
              reject(new Error(`Figma API error: ${jsonData.status} - ${jsonData.err}`));
            }
          } catch (error) {
            reject(new Error(`Failed to parse response: ${error.message}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.end();
    });
  }

  /**
   * 从 Figma URL 提取完整的设计规范
   * @param {string} figmaUrl - Figma URL
   * @param {string} nodeId - 节点 ID（可选）
   * @returns {Promise<Object>} 设计规范
   */
  async extractDesignSpecs(figmaUrl, nodeId = null) {
    const { fileKey } = this.parseFigmaUrl(figmaUrl);

    let node;
    if (nodeId) {
      node = await this.getFileNode(fileKey, nodeId);
    } else {
      const file = await this.getFile(fileKey);
      node = file;
    }

    return this.parseNodeSpecs(node);
  }

  /**
   * 生成 Excel 测试用例文件
   * @param {string} figmaUrl - Figma URL
   * @param {string} outputPath - 输出路径
   * @param {Object} options - 选项
   * @returns {Promise<Object>} 生成结果
   */
  async generateExcelFromFigma(figmaUrl, outputPath, options = {}) {
    const XLSX = require('xlsx');

    try {
      // 提取设计规范
      const specs = await this.extractDesignSpecs(
        figmaUrl,
        options.nodeId
      );

      // 生成测试用例
      const testCases = this.generateTestCasesFromSpecs(specs, options);

      if (testCases.length === 0) {
        return {
          success: false,
          error: 'No test cases generated from Figma',
        };
      }

      // 转换为 Excel 格式
      const excelData = testCases.map(tc => ({
        '测试ID': tc.id,
        '测试名称': tc.name,
        '描述': tc.description,
        'URL': options.baseUrl || '',
        '选择器': tc.selector,
        '验证类型': tc.validations.map(v => v.type).join(','),
        '期望值': JSON.stringify(
          tc.validations.map(v => v.expected).reduce((acc, val) => ({ ...acc, ...val }), {})
        ),
        '容差': tc.validations[0]?.tolerance || '',
        'Figma URL': figmaUrl,
        'Figma Node ID': tc.figma.nodeId,
        '优先级': tc.priority,
        '标签': tc.tags.join(','),
        '截图': 'yes',
      }));

      // 生成 Excel 文件
      const worksheet = XLSX.utils.json_to_sheet(excelData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, '测试用例');
      XLSX.writeFile(workbook, outputPath);

      return {
        success: true,
        outputPath,
        testCases: testCases.length,
        message: `成功从 Figma 生成 ${testCases.length} 个测试用例`,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 清除缓存
   */
  clearCache() {
    this.cache.clear();
  }
}

module.exports = FigmaIntegration;
