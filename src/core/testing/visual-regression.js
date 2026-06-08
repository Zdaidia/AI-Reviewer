/**
 * Visual Regression Testing Module
 *
 * 视觉回归测试功能：
 * - 像素级对比
 * - 差异热图生成
 * - 布局差异检测
 * - 颜色差异分析
 * - 自动截图对比
 */

const fs = require('fs');
const path = require('path');

// Canvas 是可选依赖
let createCanvas, loadImage;
try {
  const canvas = require('canvas');
  createCanvas = canvas.createCanvas;
  loadImage = canvas.loadImage;
} catch (error) {
  console.warn('Canvas module not available. Visual regression testing will be limited.');
  console.warn('Install with: npm install canvas');
}

class VisualRegressionTester {
  constructor() {
    this.threshold = {
      pixel: 0.1,        // 像素差异阈值 (0-1)
      layout: 2,         // 布局差异阈值 (px)
      color: 5,          // 颜色差异阈值 (0-255)
    };
    this.comparisonMethods = [
      'pixelmatch',      // 像素匹配
      'ssim',           // 结构相似性
      'layout',         // 布局对比
      'color',          // 颜色对比
    ];
  }

  /**
   * 比较两个图片
   * @param {string} image1Path - 图片1路径
   * @param {string} image2Path - 图片2路径
   * @param {Object} options - 选项
   * @returns {Promise<Object>} 对比结果
   */
  async compareImages(image1Path, image2Path, options = {}) {
    // 检查 canvas 是否可用
    if (!createCanvas || !loadImage) {
      return {
        success: false,
        error: 'Canvas module not installed. Install with: npm install canvas',
        suggestion: 'Visual regression testing requires canvas module',
      };
    }

    const {
      method = 'pixelmatch',
      threshold = this.threshold.pixel,
      generateDiff = true,
      generateHeatmap = true,
      outputDir = null,
    } = options;

    try {
      // 加载图片
      const img1 = await loadImage(image1Path);
      const img2 = await loadImage(image2Path);

      // 检查尺寸
      if (img1.width !== img2.width || img1.height !== img2.height) {
        return {
          success: false,
          error: 'Image dimensions do not match',
          image1: { width: img1.width, height: img1.height },
          image2: { width: img2.width, height: img2.height },
        };
      }

      // 根据方法对比
      let result;
      switch (method) {
        case 'pixelmatch':
          result = await this.pixelMatch(img1, img2, threshold);
          break;
        case 'ssim':
          result = await this.calculateSSIM(img1, img2);
          break;
        case 'layout':
          result = await this.compareLayout(img1, img2);
          break;
        case 'color':
          result = await this.compareColor(img1, img2);
          break;
        default:
          result = await this.pixelMatch(img1, img2, threshold);
      }

      // 生成差异图
      if (generateDiff && result.different && outputDir) {
        const diffPath = path.join(outputDir, `diff-${Date.now()}.png`);
        await this.generateDiffImage(img1, img2, diffPath, result.diffPixels);
        result.diffImagePath = diffPath;
      }

      // 生成热图
      if (generateHeatmap && result.different && outputDir) {
        const heatmapPath = path.join(outputDir, `heatmap-${Date.now()}.png`);
        await this.generateHeatmap(img1, img2, heatmapPath, result.diffPixels);
        result.heatmapPath = heatmapPath;
      }

      return {
        success: true,
        ...result,
        method,
        image1: image1Path,
        image2: image2Path,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 像素匹配对比
   * @param {Image} img1 - 图片1
   * @param {Image} img2 - 图片2
   * @param {number} threshold - 阈值
   * @returns {Promise<Object>} 对比结果
   */
  async pixelMatch(img1, img2, threshold) {
    const width = img1.width;
    const height = img1.height;

    // 创建画布
    const canvas1 = createCanvas(width, height);
    const ctx1 = canvas1.getContext('2d');
    ctx1.drawImage(img1, 0, 0);

    const canvas2 = createCanvas(width, height);
    const ctx2 = canvas2.getContext('2d');
    ctx2.drawImage(img2, 0, 0);

    // 获取像素数据
    const data1 = ctx1.getImageData(0, 0, width, height);
    const data2 = ctx2.getImageData(0, 0, width, height);

    let diffPixels = [];
    let totalDiff = 0;
    let maxDiff = 0;

    // 对比每个像素
    for (let i = 0; i < data1.data.length; i += 4) {
      const r1 = data1.data[i];
      const g1 = data1.data[i + 1];
      const b1 = data1.data[i + 2];
      const a1 = data1.data[i + 3];

      const r2 = data2.data[i];
      const g2 = data2.data[i + 1];
      const b2 = data2.data[i + 2];
      const a2 = data2.data[i + 3];

      // 计算差异
      const diff = this.calculatePixelDifference(r1, g1, b1, a1, r2, g2, b2, a2);
      totalDiff += diff;
      maxDiff = Math.max(maxDiff, diff);

      // 记录差异像素
      if (diff > threshold * 255 * 3) {
        const x = (i / 4) % width;
        const y = Math.floor((i / 4) / width);
        diffPixels.push({ x, y, diff });
      }
    }

    const totalPixels = width * height;
    const diffPercentage = (diffPixels.length / totalPixels) * 100;
    const different = diffPixels.length > 0;

    return {
      different,
      diffPercentage: diffPercentage.toFixed(2),
      diffPixels,
      totalDiff,
      maxDiff,
      totalPixels,
      passed: !different,
    };
  }

  /**
   * 计算结构相似性 (SSIM)
   * @param {Image} img1 - 图片1
   * @param {Image} img2 - 图片2
   * @returns {Promise<Object>} SSIM 结果
   */
  async calculateSSIM(img1, img2) {
    const width = img1.width;
    const height = img1.height;

    const canvas1 = createCanvas(width, height);
    const ctx1 = canvas1.getContext('2d');
    ctx1.drawImage(img1, 0, 0);

    const canvas2 = createCanvas(width, height);
    const ctx2 = canvas2.getContext('2d');
    ctx2.drawImage(img2, 0, 0);

    const data1 = ctx1.getImageData(0, 0, width, height);
    const data2 = ctx2.getImageData(0, 0, width, height);

    // 转换为灰度
    const gray1 = this.toGrayscale(data1.data);
    const gray2 = this.toGrayscale(data2.data);

    // 计算 SSIM
    const C1 = 6.5025;
    const C2 = 58.5225;

    const mu1 = this.mean(gray1);
    const mu2 = this.mean(gray2);

    const sigma1 = this.standardDeviation(gray1, mu1);
    const sigma2 = this.standardDeviation(gray2, mu2);
    const sigma12 = this.covariance(gray1, gray2, mu1, mu2);

    const ssim = ((2 * mu1 * mu2 + C1) * (2 * sigma12 + C2)) /
                  ((mu1 * mu1 + mu2 * mu2 + C1) * (sigma1 * sigma1 + sigma2 * sigma2 + C2));

    return {
      different: ssim < 0.95,
      ssim: ssim.toFixed(4),
      passed: ssim >= 0.95,
      similarity: (ssim * 100).toFixed(2) + '%',
    };
  }

  /**
   * 对比布局
   * @param {Image} img1 - 图片1
   * @param {Image} img2 - 图片2
   * @returns {Promise<Object>} 布局对比结果
   */
  async compareLayout(img1, img2) {
    const width = img1.width;
    const height = img1.height;

    // 检测边缘
    const edges1 = await this.detectEdges(img1);
    const edges2 = await this.detectEdges(img2);

    // 对比边缘位置
    const layoutDiff = this.compareEdgePositions(edges1, edges2);

    return {
      different: layoutDiff.differences > 0,
      layoutDifferences: layoutDiff.differences,
      layoutChanges: layoutDiff.changes,
      passed: layoutDiff.differences === 0,
    };
  }

  /**
   * 对比颜色
   * @param {Image} img1 - 图片1
   * @param {Image} img2 - 图片2
   * @returns {Promise<Object>} 颜色对比结果
   */
  async compareColor(img1, img2) {
    const width = img1.width;
    const height = img1.height;

    const canvas1 = createCanvas(width, height);
    const ctx1 = canvas1.getContext('2d');
    ctx1.drawImage(img1, 0, 0);

    const canvas2 = createCanvas(width, height);
    const ctx2 = canvas2.getContext('2d');
    ctx2.drawImage(img2, 0, 0);

    const data1 = ctx1.getImageData(0, 0, width, height);
    const data2 = ctx2.getImageData(0, 0, width, height);

    // 计算颜色直方图
    const hist1 = this.calculateColorHistogram(data1.data);
    const hist2 = this.calculateColorHistogram(data2.data);

    // 对比直方图
    const histogramDiff = this.compareHistograms(hist1, hist2);

    return {
      different: histogramDiff.maxDifference > this.threshold.color,
      histogramDifference: histogramDiff.maxDifference,
      colorChanges: histogramDiff.changes,
      passed: histogramDiff.maxDifference <= this.threshold.color,
    };
  }

  /**
   * 检测边缘
   * @param {Image} img - 图片
   * @returns {Promise<Array>} 边缘点数组
   */
  async detectEdges(img) {
    const width = img.width;
    const height = img.height;

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    const imageData = ctx.getImageData(0, 0, width, height);
    const gray = this.toGrayscale(imageData.data);

    // Sobel 算子
    const edges = [];
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;

        // Sobel 卷积核
        const gx =
          -1 * gray[idx - width - 1] + 1 * gray[idx - width + 1] +
          -2 * gray[idx - 1] + 2 * gray[idx + 1] +
          -1 * gray[idx + width - 1] + 1 * gray[idx + width + 1];

        const gy =
          -1 * gray[idx - width - 1] - 2 * gray[idx - width] - 1 * gray[idx - width + 1] +
          1 * gray[idx + width - 1] + 2 * gray[idx + width] + 1 * gray[idx + width + 1];

        const magnitude = Math.sqrt(gx * gx + gy * gy);

        if (magnitude > 50) {
          edges.push({ x, y, magnitude });
        }
      }
    }

    return edges;
  }

  /**
   * 对比边缘位置
   * @param {Array} edges1 - 边缘1
   * @param {Array} edges2 - 边缘2
   * @returns {Object} 对比结果
   */
  compareEdgePositions(edges1, edges2) {
    const threshold = this.threshold.layout;
    const changes = [];

    // 简化对比：检查边缘数量的差异
    const countDiff = Math.abs(edges1.length - edges2.length);
    const differences = countDiff > threshold ? countDiff : 0;

    return {
      differences,
      changes,
    };
  }

  /**
   * 计算颜色直方图
   * @param {Uint8ClampedArray} data - 像素数据
   * @returns {Object} 直方图
   */
  calculateColorHistogram(data) {
    const histogram = {
      red: new Array(256).fill(0),
      green: new Array(256).fill(0),
      blue: new Array(256).fill(0),
    };

    for (let i = 0; i < data.length; i += 4) {
      histogram.red[data[i]]++;
      histogram.green[data[i + 1]]++;
      histogram.blue[data[i + 2]]++;
    }

    return histogram;
  }

  /**
   * 对比直方图
   * @param {Object} hist1 - 直方图1
   * @param {Object} hist2 - 直方图2
   * @returns {Object} 对比结果
   */
  compareHistograms(hist1, hist2) {
    let maxDifference = 0;
    const changes = [];

    for (let i = 0; i < 256; i++) {
      const redDiff = Math.abs(hist1.red[i] - hist2.red[i]);
      const greenDiff = Math.abs(hist1.green[i] - hist2.green[i]);
      const blueDiff = Math.abs(hist1.blue[i] - hist2.blue[i]);

      const diff = (redDiff + greenDiff + blueDiff) / 3;

      if (diff > maxDifference) {
        maxDifference = diff;
      }

      if (diff > this.threshold.color) {
        changes.push({ bin: i, diff });
      }
    }

    return {
      maxDifference,
      changes,
    };
  }

  /**
   * 生成差异图
   * @param {Image} img1 - 图片1
   * @param {Image} img2 - 图片2
   * @param {string} outputPath - 输出路径
   * @param {Array} diffPixels - 差异像素
   * @returns {Promise<void>}
   */
  async generateDiffImage(img1, img2, outputPath, diffPixels) {
    const width = img1.width;
    const height = img1.height;

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // 绘制第一张图
    ctx.drawImage(img1, 0, 0);

    // 在差异位置绘制红色半透明矩形
    ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
    for (const pixel of diffPixels) {
      ctx.fillRect(pixel.x, pixel.y, 1, 1);
    }

    // 保存
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(outputPath, buffer);
  }

  /**
   * 生成热图
   * @param {Image} img1 - 图片1
   * @param {Image} img2 - 图片2
   * @param {string} outputPath - 输出路径
   * @param {Array} diffPixels - 差异像素
   * @returns {Promise<void>}
   */
  async generateHeatmap(img1, img2, outputPath, diffPixels) {
    const width = img1.width;
    const height = img1.height;

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // 绘制第一张图（灰度）
    ctx.drawImage(img1, 0, 0);

    // 获取图像数据
    const imageData = ctx.getImageData(0, 0, width, height);

    // 创建热图数据
    const heatMap = new Map();
    for (const pixel of diffPixels) {
      const key = `${pixel.x},${pixel.y}`;
      heatMap.set(key, pixel.diff);
    }

    // 应用热图颜色
    for (let i = 0; i < imageData.data.length; i += 4) {
      const x = (i / 4) % width;
      const y = Math.floor((i / 4) / width);
      const key = `${x},${y}`;

      if (heatMap.has(key)) {
        const diff = heatMap.get(key);
        const normalizedDiff = Math.min(diff / (255 * 3), 1);

        // 从蓝色（低差异）到红色（高差异）
        imageData.data[i] = Math.floor(normalizedDiff * 255);     // R
        imageData.data[i + 1] = 0;                               // G
        imageData.data[i + 2] = Math.floor((1 - normalizedDiff) * 255); // B
        imageData.data[i + 3] = 200;                             // A
      }
    }

    ctx.putImageData(imageData, 0, 0);

    // 保存
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(outputPath, buffer);
  }

  /**
   * 计算像素差异
   * @param {number} r1 - Red 1
   * @param {number} g1 - Green 1
   * @param {number} b1 - Blue 1
   * @param {number} a1 - Alpha 1
   * @param {number} r2 - Red 2
   * @param {number} g2 - Green 2
   * @param {number} b2 - Blue 2
   * @param {number} a2 - Alpha 2
   * @returns {number} 差异值
   */
  calculatePixelDifference(r1, g1, b1, a1, r2, g2, b2, a2) {
    const rDiff = Math.abs(r1 - r2);
    const gDiff = Math.abs(g1 - g2);
    const bDiff = Math.abs(b1 - b2);
    const aDiff = Math.abs(a1 - a2);

    return rDiff + gDiff + bDiff + aDiff;
  }

  /**
   * 转换为灰度
   * @param {Uint8ClampedArray} data - 像素数据
   * @returns {Array} 灰度值数组
   */
  toGrayscale(data) {
    const gray = new Array(data.length / 4);

    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      gray[j] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }

    return gray;
  }

  /**
   * 计算平均值
   * @param {Array} data - 数据数组
   * @returns {number} 平均值
   */
  mean(data) {
    const sum = data.reduce((acc, val) => acc + val, 0);
    return sum / data.length;
  }

  /**
   * 计算标准差
   * @param {Array} data - 数据数组
   * @param {number} mean - 平均值
   * @returns {number} 标准差
   */
  standardDeviation(data, mean) {
    const squareDiffs = data.map(value => Math.pow(value - mean, 2));
    const avgSquareDiff = squareDiffs.reduce((acc, val) => acc + val, 0) / data.length;
    return Math.sqrt(avgSquareDiff);
  }

  /**
   * 计算协方差
   * @param {Array} data1 - 数据1
   * @param {Array} data2 - 数据2
   * @param {number} mean1 - 平均值1
   * @param {number} mean2 - 平均值2
   * @returns {number} 协方差
   */
  covariance(data1, data2, mean1, mean2) {
    let sum = 0;
    for (let i = 0; i < data1.length; i++) {
      sum += (data1[i] - mean1) * (data2[i] - mean2);
    }
    return sum / data1.length;
  }

  /**
   * 设置阈值
   * @param {Object} threshold - 阈值配置
   */
  setThreshold(threshold) {
    this.threshold = { ...this.threshold, ...threshold };
  }

  /**
   * 批量对比截图
   * @param {Array} screenshotPairs - 截图对数组
   * @param {Object} options - 选项
   * @returns {Promise<Array>} 对比结果数组
   */
  async batchCompareScreenshots(screenshotPairs, options = {}) {
    const results = [];

    for (const pair of screenshotPairs) {
      const result = await this.compareImages(
        pair.actual,
        pair.expected,
        {
          ...options,
          outputDir: pair.outputDir || options.outputDir,
        }
      );

      results.push({
        name: pair.name || 'Unnamed',
        actual: pair.actual,
        expected: pair.expected,
        ...result,
      });
    }

    return results;
  }

  /**
   * 生成视觉回归报告
   * @param {Array} comparisonResults - 对比结果数组
   * @param {string} outputPath - 输出路径
   * @returns {Promise<Object>} 报告结果
   */
  async generateVisualReport(comparisonResults, outputPath) {
    const total = comparisonResults.length;
    const passed = comparisonResults.filter(r => r.passed).length;
    const failed = total - passed;

    const report = {
      summary: {
        total,
        passed,
        failed,
        passRate: ((passed / total) * 100).toFixed(2) + '%',
      },
      results: comparisonResults,
      timestamp: new Date().toISOString(),
    };

    // 保存 JSON 报告
    const jsonPath = outputPath.replace('.html', '.json');
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

    return {
      success: true,
      reportPath: outputPath,
      jsonPath,
      summary: report.summary,
    };
  }
}

module.exports = VisualRegressionTester;
