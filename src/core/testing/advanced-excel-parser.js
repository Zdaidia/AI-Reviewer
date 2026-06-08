/**
 * Advanced Excel Parser
 *
 * 支持高级测试用例定义，包括：
 * - 视觉验证（颜色、字体、尺寸、位置）
 * - 功能验证（交互、导航、表单）
 * - 数据验证（内容、数值、状态）
 * - 截图对比（像素级、布局）
 * - 数据驱动测试
 * - Figma 设计对比
 * - AI 辅助测试生成
 */

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

class AdvancedExcelParser {
  constructor() {
    // 验证类型定义
    this.validationTypes = {
      // 视觉验证
      visible: '检查元素是否可见',
      hidden: '检查元素是否隐藏',
      text: '验证文本内容',
      textContains: '验证文本包含',
      textMatches: '验证文本匹配正则',
      attribute: '验证属性值',
      css: '验证CSS属性（颜色、字体、尺寸）',
      style: '验证样式',

      // 布局验证
      position: '验证元素位置',
      size: '验证元素尺寸',
      boundingBox: '验证边界框',
      layout: '验证布局关系',
      zIndex: '验证层级',

      // 功能验证
      enabled: '检查元素是否可用',
      disabled: '检查元素是否禁用',
      checked: '检查复选框是否选中',
      selected: '检查选项是否选中',
      focus: '检查元素是否获得焦点',

      // 数据验证
      value: '验证输入值',
      count: '验证元素数量',
      tableData: '验证表格数据',
      listItems: '验证列表项',

      // 截图对比
      screenshot: '截图保存',
      screenshotMatch: '截图对比（像素级）',
      screenshotMatchPercentage: '截图对比（百分比）',

      // Figma 对比
      figmaColor: '对比 Figma 颜色',
      figmaSize: '对比 Figma 尺寸',
      figmaFont: '对比 Figma 字体',
      figmaLayout: '对比 Figma 布局',

      // 高级验证
      customScript: '自定义脚本验证',
      apiResponse: 'API 响应验证',
      performance: '性能指标验证',
    };

    // 操作类型定义
    this.actionTypes = {
      // 导航操作
      goto: '导航到URL',
      reload: '重新加载',
      goBack: '后退',
      goForward: '前进',

      // 交互操作
      click: '点击',
      dblClick: '双击',
      rightClick: '右键点击',
      hover: '悬停',
      dragAndDrop: '拖拽',

      // 输入操作
      fill: '填写',
      type: '输入',
      clear: '清空',
      selectOption: '选择选项',
      check: '勾选',
      uncheck: '取消勾选',

      // 等待操作
      waitFor: '等待元素',
      waitForTimeout: '等待时间',
      waitForNavigation: '等待导航',
      waitForResponse: '等待响应',

      // 信息获取
      screenshot: '截图',
      getText: '获取文本',
      getAttribute: '获取属性',
      getHTML: '获取HTML',

      // 表单操作
      submit: '提交表单',
      upload: '上传文件',
      download: '下载文件',

      // 高级操作
      evaluate: '执行脚本',
      press: '按键',
      scroll: '滚动',
    };
  }

  /**
   * 解析高级 Excel 测试用例
   * @param {string} filePath - Excel 文件路径
   * @returns {Object} 解析结果
   */
  parseAdvancedExcel(filePath) {
    try {
      const workbook = XLSX.readFile(filePath);
      const result = {
        success: true,
        fileName: path.basename(filePath),
        sheets: {},
      };

      // 解析每个 sheet
      for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName];
        const rawData = XLSX.utils.sheet_to_json(worksheet);

        if (rawData.length === 0) continue;

        // 根据 sheet 名称判断类型
        if (sheetName.toLowerCase().includes('test') || sheetName.toLowerCase().includes('用例')) {
          result.sheets[sheetName] = this.parseTestCases(rawData);
        } else if (sheetName.toLowerCase().includes('data') || sheetName.toLowerCase().includes('数据')) {
          result.sheets[sheetName] = this.parseTestData(rawData);
        } else if (sheetName.toLowerCase().includes('figma') || sheetName.toLowerCase().includes('设计')) {
          result.sheets[sheetName] = this.parseFigmaSpecs(rawData);
        } else if (sheetName.toLowerCase().includes('config') || sheetName.toLowerCase().includes('配置')) {
          result.sheets[sheetName] = this.parseConfig(rawData);
        } else {
          // 默认为测试用例
          result.sheets[sheetName] = this.parseTestCases(rawData);
        }
      }

      return result;
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 解析测试用例（支持高级格式）
   * @param {Array} rawData - 原始数据
   * @returns {Object} 测试用例
   */
  parseTestCases(rawData) {
    const testCases = [];

    for (const row of rawData) {
      const testCase = {
        // 基本信息
        id: this.getValue(row, ['测试ID', 'Test ID', 'ID', 'id']),
        name: this.getValue(row, ['测试名称', 'Test Name', 'Test Case', 'name']),
        description: this.getValue(row, ['描述', 'Description', 'Desc']),
        priority: this.getValue(row, ['优先级', 'Priority']) || 'medium',
        tags: this.parseTags(this.getValue(row, ['标签', 'Tags'])),

        // 测试环境
        url: this.getValue(row, ['URL', '页面地址', 'Page URL']),
        baseUrl: this.getValue(row, ['Base URL', '基础URL']),

        // 测试步骤（支持 JSON 格式）
        steps: this.parseSteps(this.getValue(row, ['步骤', 'Steps', '测试步骤'])),

        // 高级验证配置
        validations: this.parseValidations(row),

        // 测试数据
        testData: this.parseTestDataValue(this.getValue(row, ['测试数据', 'Test Data'])),

        // 截图配置
        screenshotConfig: this.parseScreenshotConfig(row),

        // Figma 对比配置
        figmaConfig: this.parseFigmaConfig(row),

        // 性能配置
        performanceConfig: this.parsePerformanceConfig(row),

        // 重试和超时
        retry: parseInt(this.getValue(row, ['重试', 'Retry'])) || 0,
        timeout: parseInt(this.getValue(row, ['超时', 'Timeout'])) || 30000,
      };

      if (testCase.name || (testCase.steps && testCase.steps.length > 0)) {
        testCases.push(testCase);
      }
    }

    return {
      type: 'testCases',
      data: testCases,
      total: testCases.length,
    };
  }

  /**
   * 解析验证配置（支持多种格式）
   * @param {Object} row - 数据行
   * @returns {Array} 验证配置列表
   */
  parseValidations(row) {
    const validations = [];

    // 方式1：从单独的列解析
    const validationColumns = {
      selector: this.getValue(row, ['选择器', 'Selector', '元素']),
      type: this.getValue(row, ['验证类型', 'Validation Type', '验证方式']),
      expected: this.getValue(row, ['期望值', 'Expected', '预期']),
      actual: this.getValue(row, ['实际值', 'Actual']),
      tolerance: this.getValue(row, ['容差', 'Tolerance']),
    };

    if (validationColumns.selector && validationColumns.type) {
      validations.push({
        selector: validationColumns.selector,
        type: this.normalizeValidationType(validationColumns.type),
        expected: this.parseExpectedValue(validationColumns.expected),
        tolerance: validationColumns.tolerance ? parseFloat(validationColumns.tolerance) : null,
      });
    }

    // 方式2：从 JSON 字符串解析
    const validationsJson = this.getValue(row, ['验证配置', 'Validations', '验证列表']);
    if (validationsJson) {
      try {
        const parsed = JSON.parse(validationsJson);
        if (Array.isArray(parsed)) {
          validations.push(...parsed);
        }
      } catch (e) {
        // 不是 JSON，忽略
      }
    }

    // 方式3：从简化格式解析（例如：visible|#login-button）
    const simpleValidation = this.getValue(row, ['验证', 'Verify']);
    if (simpleValidation) {
      const parsed = this.parseSimpleValidation(simpleValidation);
      if (parsed) {
        validations.push(parsed);
      }
    }

    return validations;
  }

  /**
   * 解析简化验证格式
   * @param {string} validation - 验证字符串（例如：visible|#login-button）
   * @returns {Object|null} 验证配置
   */
  parseSimpleValidation(validation) {
    // 支持格式：
    // visible|#button
    // text|#title|Welcome
    // color|#header|#ff0000
    const parts = validation.split('|').map(s => s.trim());
    if (parts.length < 2) return null;

    const [type, selector, ...args] = parts;

    return {
      selector,
      type: this.normalizeValidationType(type),
      expected: args[0] || null,
      args: args.slice(1),
    };
  }

  /**
   * 标准化验证类型
   * @param {string} type - 验证类型
   * @returns {string} 标准化后的类型
   */
  normalizeValidationType(type) {
    const typeMap = {
      // 中英文映射
      '可见': 'visible',
      '可见性': 'visible',
      '文本': 'text',
      '文本包含': 'textContains',
      '文本匹配': 'textMatches',
      '属性': 'attribute',
      'CSS': 'css',
      '样式': 'style',
      '位置': 'position',
      '尺寸': 'size',
      '布局': 'layout',
      '可用': 'enabled',
      '禁用': 'disabled',
      '选中': 'checked',
      '焦点': 'focus',
      '值': 'value',
      '数量': 'count',
      '截图': 'screenshot',
      '截图对比': 'screenshotMatch',
    };

    const normalized = type.toLowerCase().trim();
    return typeMap[normalized] || normalized;
  }

  /**
   * 解析期望值（支持多种格式）
   * @param {string} expected - 期望值字符串
   * @returns {*} 解析后的期望值
   */
  parseExpectedValue(expected) {
    if (!expected) return null;

    // 尝试解析为 JSON
    try {
      return JSON.parse(expected);
    } catch (e) {
      // 不是 JSON，返回字符串
      return expected;
    }
  }

  /**
   * 解析步骤（支持 JSON 和简化格式）
   * @param {string} stepsString - 步骤字符串
   * @returns {Array} 步骤列表
   */
  parseSteps(stepsString) {
    if (!stepsString) return [];

    // 尝试解析为 JSON
    try {
      const parsed = JSON.parse(stepsString);
      if (Array.isArray(parsed)) {
        return parsed.map(step => ({
          action: step.action || step.type,
          selector: step.selector,
          value: step.value || step.data,
          description: step.description || step.desc,
          waitFor: step.waitFor || step.wait,
        }));
      }
    } catch (e) {
      // 不是 JSON，使用默认解析
    }

    // 默认解析（换行或管道分隔）
    const steps = [];
    const separators = ['\n\n', '\n', '|', '；', ';'];

    for (const sep of separators) {
      if (stepsString.includes(sep)) {
        const parts = stepsString.split(sep);
        for (const part of parts) {
          const trimmed = part.trim();
          if (trimmed) {
            steps.push({
              description: trimmed,
              action: 'todo', // 需要手动实现
            });
          }
        }
        break;
      }
    }

    return steps.length > 0 ? steps : [{ description: stepsString }];
  }

  /**
   * 解析测试数据值
   * @param {string} dataString - 数据字符串
   * @returns {*} 解析后的数据
   */
  parseTestDataValue(dataString) {
    if (!dataString) return null;

    // 尝试解析为 JSON
    try {
      return JSON.parse(dataString);
    } catch (e) {
      // 返回字符串
      return dataString;
    }
  }

  /**
   * 解析截图配置
   * @param {Object} row - 数据行
   * @returns {Object} 截图配置
   */
  parseScreenshotConfig(row) {
    const enabled = this.getValue(row, ['截图', 'Screenshot']);
    const compare = this.getValue(row, ['截图对比', 'Screenshot Compare']);
    const threshold = this.getValue(row, ['对比阈值', 'Compare Threshold']);

    if (!enabled && !compare) return null;

    return {
      enabled: enabled === 'true' || enabled === 'yes' || enabled === '是',
      compareWith: compare || null,
      threshold: threshold ? parseFloat(threshold) : 0.1,
      fullPage: this.getValue(row, ['全页截图', 'Full Page']) === 'true',
    };
  }

  /**
   * 解析 Figma 配置
   * @param {Object} row - 数据行
   * @returns {Object} Figma 配置
   */
  parseFigmaConfig(row) {
    const url = this.getValue(row, ['Figma URL', 'Figma链接']);
    const nodeId = this.getValue(row, ['Figma Node ID', 'Figma节点ID']);
    const compareColor = this.getValue(row, ['对比颜色', 'Compare Color']);
    const compareSize = this.getValue(row, ['对比尺寸', 'Compare Size']);
    const compareFont = this.getValue(row, ['对比字体', 'Compare Font']);

    if (!url && !nodeId) return null;

    return {
      url,
      nodeId,
      accessToken: this.getValue(row, ['Figma Token', 'Figma令牌']),
      compare: {
        color: compareColor === 'true' || compareColor === 'yes',
        size: compareSize === 'true' || compareSize === 'yes',
        font: compareFont === 'true' || compareFont === 'yes',
        layout: this.getValue(row, ['对比布局', 'Compare Layout']) === 'true',
      },
    };
  }

  /**
   * 解析性能配置
   * @param {Object} row - 数据行
   * @returns {Object} 性能配置
   */
  parsePerformanceConfig(row) {
    const maxLoadTime = this.getValue(row, ['最大加载时间', 'Max Load Time']);
    const maxResponseTime = this.getValue(row, ['最大响应时间', 'Max Response Time']);
    const checkMemory = this.getValue(row, ['检查内存', 'Check Memory']);

    if (!maxLoadTime && !maxResponseTime && !checkMemory) return null;

    return {
      maxLoadTime: maxLoadTime ? parseInt(maxLoadTime) : null,
      maxResponseTime: maxResponseTime ? parseInt(maxResponseTime) : null,
      checkMemory: checkMemory === 'true' || checkMemory === 'yes',
      checkLCP: this.getValue(row, ['检查LCP', 'Check LCP']) === 'true',
      checkCLS: this.getValue(row, ['检查CLS', 'Check CLS']) === 'true',
    };
  }

  /**
   * 解析测试数据（数据驱动测试）
   * @param {Array} rawData - 原始数据
   * @returns {Object} 测试数据
   */
  parseTestData(rawData) {
    const dataSets = [];

    for (const row of rawData) {
      const dataSet = {
        name: this.getValue(row, ['数据集名称', 'Data Set Name', 'Name']),
        description: this.getValue(row, ['描述', 'Description']),
        data: this.parseTestDataValue(JSON.stringify(row)),
      };

      dataSets.push(dataSet);
    }

    return {
      type: 'testData',
      data: dataSets,
      total: dataSets.length,
    };
  }

  /**
   * 解析 Figma 设计规范
   * @param {Array} rawData - 原始数据
   * @returns {Object} Figma 规范
   */
  parseFigmaSpecs(rawData) {
    const specs = [];

    for (const row of rawData) {
      const spec = {
        elementId: this.getValue(row, ['元素ID', 'Element ID', 'ID']),
        selector: this.getValue(row, ['选择器', 'Selector']),
        nodeName: this.getValue(row, ['组件名称', 'Node Name']),

        // 样式规范
        styles: {
          width: this.getValue(row, ['宽度', 'Width']),
          height: this.getValue(row, ['高度', 'Height']),
          x: this.getValue(row, ['X坐标', 'X']),
          y: this.getValue(row, ['Y坐标', 'Y']),
          backgroundColor: this.getValue(row, ['背景色', 'Background Color']),
          color: this.getValue(row, ['文字颜色', 'Text Color']),
          fontSize: this.getValue(row, ['字号', 'Font Size']),
          fontFamily: this.getValue(row, ['字体', 'Font Family']),
          fontWeight: this.getValue(row, ['字重', 'Font Weight']),
          lineHeight: this.getValue(row, ['行高', 'Line Height']),
          letterSpacing: this.getValue(row, ['字间距', 'Letter Spacing']),
          padding: this.getValue(row, ['内边距', 'Padding']),
          margin: this.getValue(row, ['外边距', 'Margin']),
          borderRadius: this.getValue(row, ['圆角', 'Border Radius']),
          borderWidth: this.getValue(row, ['边框宽度', 'Border Width']),
          borderColor: this.getValue(row, ['边框颜色', 'Border Color']),
          opacity: this.getValue(row, ['透明度', 'Opacity']),
          zIndex: this.getValue(row, ['层级', 'Z-Index']),
        },

        // Figma 元信息
        figma: {
          url: this.getValue(row, ['Figma URL']),
          nodeId: this.getValue(row, ['Node ID']),
          frameId: this.getValue(row, ['Frame ID']),
        },
      };

      specs.push(spec);
    }

    return {
      type: 'figmaSpecs',
      data: specs,
      total: specs.length,
    };
  }

  /**
   * 解析配置
   * @param {Array} rawData - 原始数据
   * @returns {Object} 配置
   */
  parseConfig(rawData) {
    const config = {};

    for (const row of rawData) {
      const key = this.getValue(row, ['配置项', 'Key', 'Config Key']);
      const value = this.getValue(row, ['配置值', 'Value', 'Config Value']);

      if (key) {
        config[key] = this.parseTestDataValue(value);
      }
    }

    return {
      type: 'config',
      data: config,
    };
  }

  /**
   * 获取值（支持多个键名）
   * @param {Object} row - 数据行
   * @param {Array} keys - 可能的键名
   * @returns {string} 值
   */
  getValue(row, keys) {
    for (const key of keys) {
      if (row[key] !== undefined && row[key] !== null) {
        return String(row[key]).trim();
      }
    }
    return '';
  }

  /**
   * 解析标签
   * @param {string} tagsString - 标签字符串
   * @returns {Array} 标签数组
   */
  parseTags(tagsString) {
    if (!tagsString) return [];

    return tagsString
      .split(/[,，、]/)
      .map(t => t.trim())
      .filter(t => t.length > 0);
  }

  /**
   * 生成高级 Excel 模板
   * @param {string} outputPath - 输出路径
   * @returns {Object} 结果
   */
  generateAdvancedTemplate(outputPath) {
    try {
      const workbook = XLSX.utils.book_new();

      // 测试用例 sheet
      const testCasesData = [
        {
          '测试ID': 'TC001',
          '测试名称': '登录按钮视觉验证',
          '描述': '验证登录按钮的颜色、尺寸、字体是否符合设计稿',
          'URL': 'http://localhost:3000/login',
          '优先级': 'high',
          '标签': 'visual,login',
          '选择器': '#login-button',
          '验证类型': 'css',
          '期望值': '{"backgroundColor": "#1890ff", "fontSize": "16px", "padding": "8px 16px"}',
          '容差': '5',
          'Figma URL': 'https://www.figma.com/file/xxx',
          'Figma Node ID': '1:2',
          '对比颜色': 'yes',
          '对比尺寸': 'yes',
          '对比字体': 'yes',
          '截图': 'yes',
          '截图对比': 'expected/login-button.png',
          '步骤': '[{"action": "goto", "selector": null, "value": "http://localhost:3000/login", "description": "打开登录页面"}]',
          '测试数据': '{"username": "test@example.com", "password": "password123"}',
          '重试': '2',
          '超时': '30000',
        },
        {
          '测试ID': 'TC002',
          '测试名称': '用户数据显示验证',
          '描述': '验证用户列表中的数据是否正确显示',
          'URL': 'http://localhost:3000/users',
          '优先级': 'high',
          '标签': 'data,users',
          '选择器': '.user-list',
          '验证类型': 'tableData',
          '期望值': '[{"name": "张三", "email": "zhangsan@example.com"}, {"name": "李四", "email": "lisi@example.com"}]',
          '步骤': '打开用户列表页面 | 等待数据加载 | 验证列表数据',
        },
        {
          '测试ID': 'TC003',
          '测试名称': '表单提交功能',
          '描述': '验证表单提交后数据正确保存',
          'URL': 'http://localhost:3000/form',
          '优先级': 'critical',
          '标签': 'form,smoke',
          '选择器': '#submit-button',
          '验证类型': 'apiResponse',
          '期望值': '{"status": "success", "message": "提交成功"}',
          '步骤': '填写表单 | 点击提交 | 验证响应',
          '最大响应时间': '2000',
        },
      ];

      const testCasesSheet = XLSX.utils.json_to_sheet(testCasesData);
      XLSX.utils.book_append_sheet(workbook, testCasesSheet, '测试用例');

      // Figma 设计规范 sheet
      const figmaSpecsData = [
        {
          '元素ID': 'EL001',
          '选择器': '#login-button',
          '组件名称': 'Login Button',
          '宽度': '120px',
          '高度': '40px',
          'X坐标': '100',
          'Y坐标': '200',
          '背景色': '#1890ff',
          '文字颜色': '#ffffff',
          '字号': '16px',
          '字体': 'Arial, sans-serif',
          '字重': '500',
          '行高': '1.5',
          '内边距': '8px 16px',
          '圆角': '4px',
          '边框宽度': '0',
          '边框颜色': 'transparent',
          '透明度': '1',
          '层级': '1',
          'Figma URL': 'https://www.figma.com/file/xxx',
          'Node ID': '1:2',
          'Frame ID': '1:1',
        },
        {
          '元素ID': 'EL002',
          '选择器': '#username-input',
          '组件名称': 'Username Input',
          '宽度': '300px',
          '高度': '40px',
          '背景色': '#ffffff',
          '边框宽度': '1px',
          '边框颜色': '#d9d9d9',
          '字号': '14px',
          '内边距': '8px 12px',
          '圆角': '4px',
        },
      ];

      const figmaSpecsSheet = XLSX.utils.json_to_sheet(figmaSpecsData);
      XLSX.utils.book_append_sheet(workbook, figmaSpecsSheet, 'Figma设计规范');

      // 测试数据 sheet
      const testDataSheet = XLSX.utils.json_to_sheet([
        {
          '数据集名称': '有效用户',
          '描述': '使用有效凭据登录',
          'username': 'test@example.com',
          'password': 'password123',
          'expectedResult': 'success',
        },
        {
          '数据集名称': '无效密码',
          '描述': '使用无效密码登录',
          'username': 'test@example.com',
          'password': 'wrongpassword',
          'expectedResult': 'error',
        },
      ]);
      XLSX.utils.book_append_sheet(workbook, testDataSheet, '测试数据');

      // 配置 sheet
      const configSheet = XLSX.utils.json_to_sheet([
        { '配置项': 'baseUrl', '配置值': 'http://localhost:3000' },
        { '配置项': 'timeout', '配置值': '30000' },
        { '配置项': 'retries', '配置值': '2' },
        { '配置项': 'screenshotOnFailure', '配置值': 'true' },
        { '配置项': 'video', '配置值': 'false' },
        { '配置项': 'trace', '配置值': 'on-first-retry' },
      ]);
      XLSX.utils.book_append_sheet(workbook, configSheet, '配置');

      // 写入文件
      XLSX.writeFile(workbook, outputPath);

      return {
        success: true,
        outputPath,
        message: '高级 Excel 模板已生成，包含 4 个 sheet：测试用例、Figma设计规范、测试数据、配置',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 导出为 JSON
   * @param {Object} parsedData - 解析后的数据
   * @param {string} outputPath - 输出路径
   * @returns {Object} 结果
   */
  exportToJSON(parsedData, outputPath) {
    try {
      const json = JSON.stringify(parsedData, null, 2);
      fs.writeFileSync(outputPath, json, 'utf8');
      return { success: true, outputPath };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 获取验证类型说明
   * @returns {Object} 验证类型说明
   */
  getValidationTypesInfo() {
    return this.validationTypes;
  }

  /**
   * 获取操作类型说明
   * @returns {Object} 操作类型说明
   */
  getActionTypesInfo() {
    return this.actionTypes;
  }
}

module.exports = AdvancedExcelParser;
