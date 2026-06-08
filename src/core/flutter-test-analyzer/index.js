/**
 * Flutter Test Analyzer
 *
 * 职责:
 * - 识别页面测试入口点
 * - 提取可测试的关键元素
 * - 推断用户操作流程
 * - 生成测试用例建议
 * - 分析测试覆盖率
 *
 * 支持的测试类型:
 * - Widget 测试
 * - 单元测试
 * - 集成测试
 * - E2E 测试
 *
 * 测试框架支持:
 * - flutter_test
 * - mockito
 * - mocktail
 * - fake_async
 * - golden tests
 * - integration_test
 */

const path = require('path');

class FlutterTestAnalyzer {
  constructor() {
    this.entryPoints = new Map(); // 测试入口点
    this.testableElements = new Map(); // 可测试元素
    this.userFlows = new Map(); // 用户流程
    this.testSuggestions = new Map(); // 测试建议
    this.pageInteractions = new Map(); // 页面交互
    this.testFiles = new Map(); // 测试文件
  }

  /**
   * 分析测试能力
   * @param {Array} files - Dart 文件列表
   * @returns {Object} 测试能力分析结果
   */
  analyzeTestCapabilities(files) {
    this.clearCache();

    // 1. 识别页面入口点
    this.identifyEntryPoints(files);

    // 2. 提取可测试元素
    this.extractTestableElements(files);

    // 3. 推断用户流程
    this.inferUserFlows(files);

    // 4. 分析页面交互
    this.analyzePageInteractions(files);

    // 5. 生成测试建议
    this.generateTestSuggestions(files);

    // 6. 分析测试覆盖率
    this.analyzeTestCoverage(files);

    // 7. 生成统计信息
    const statistics = this.generateStatistics();

    // 8. 健康检查
    const healthCheck = this.performHealthCheck();

    return {
      entryPoints: this.getEntryPointsList(),
      testableElements: this.getTestableElementsList(),
      userFlows: this.getUserFlowsList(),
      interactions: this.getInteractionsList(),
      suggestions: this.getSuggestionsList(),
      statistics,
      healthCheck,
    };
  }

  /**
   * 清除缓存
   */
  clearCache() {
    this.entryPoints.clear();
    this.testableElements.clear();
    this.userFlows.clear();
    this.testSuggestions.clear();
    this.pageInteractions.clear();
    this.testFiles.clear();
  }

  /**
   * 识别页面入口点
   */
  identifyEntryPoints(files) {
    for (const file of files) {
      const content = file.content;
      const filePath = file.path;
      const fileName = path.basename(filePath);

      // 检查是否是主入口文件
      if (fileName === 'main.dart') {
        this.findMainEntryPoints(content, fileName, filePath);
      }

      // 检查是否是测试文件
      if (fileName.endsWith('_test.dart') || fileName.includes('.test.')) {
        this.findTestEntryPoints(content, fileName, filePath);
      }

      // 检查是否是页面文件
      const isPageFile = this.isPageFile(content, fileName);
      if (isPageFile) {
        this.findPageEntryPoints(content, fileName, filePath);
      }
    }
  }

  /**
   * 查找主入口点
   */
  findMainEntryPoints(content, fileName, filePath) {
    // 匹配 main() 函数
    const mainPattern = /void\s+main\s*\(\s*(?:List<String>\s+)?\w+\s*\)\s*\{/g;
    const mainMatch = mainPattern.exec(content);

    if (mainMatch) {
      const line = this.getLineNumber(content, mainMatch.index);

      this.entryPoints.set(`${fileName}:main`, {
        type: 'main_entry',
        fileName,
        filePath,
        line,
        runApp: content.includes('runApp('),
        title: this.extractAppTitle(content),
      });
    }

    // 查找类定义
    const classPattern = /class\s+(\w+(?:App|Page)?)\s*(?:extends\s+(\w+))?\s*\{/g;
    let classMatch;

    while ((classMatch = classPattern.exec(content)) !== null) {
      const className = classMatch[1];
      const parentClass = classMatch[2];
      const line = this.getLineNumber(content, classMatch.index);

      this.entryPoints.set(`${fileName}:${className}`, {
        type: 'app_class',
        className,
        parentClass,
        fileName,
        filePath,
        line,
        isStateless: parentClass === 'StatelessWidget',
        isStateful: parentClass === 'StatefulWidget',
      });
    }
  }

  /**
   * 提取应用标题
   */
  extractAppTitle(content) {
    const titlePattern = /title\s*:\s*['"`]([^'"`]+)['"`]/;
    const match = titlePattern.exec(content);
    return match ? match[1] : null;
  }

  /**
   * 查找测试入口点
   */
  findTestEntryPoints(content, fileName, filePath) {
    // 匹配 testWidgets
    const testWidgetsPattern = /testWidgets\s*\(\s*['"`]([^'"`]+)['"`]/g;
    let match;

    while ((match = testWidgetsPattern.exec(content)) !== null) {
      const testName = match[1];
      const line = this.getLineNumber(content, match.index);

      // 提取测试体内容
      const afterMatch = content.substring(match.index + match[0].length);
      const testBody = this.extractTestBody(afterMatch);

      // 分析测试类型
      const testType = this.analyzeTestType(testBody);

      this.entryPoints.set(`${fileName}:${line}:${testName}`, {
        type: 'widget_test',
        testName,
        fileName,
        filePath,
        line,
        testType,
        body: testBody,
      });
    }

    // 匹配 group 和 test
    const groupPattern = /group\s*\(\s*['"`]([^'"`]+)['"`]/g;
    while ((match = groupPattern.exec(content)) !== null) {
      const groupName = match[1];
      const line = this.getLineNumber(content, match.index);

      this.entryPoints.set(`${fileName}:${line}:${groupName}`, {
        type: 'test_group',
        groupName,
        fileName,
        filePath,
        line,
      });
    }

    // 匹配 test() 函数
    const testPattern = /test\s*\(\s*['"`]([^'"`]+)['"`]/g;
    while ((match = testPattern.exec(content)) !== null) {
      const testName = match[1];
      const line = this.getLineNumber(content, match.index);

      this.entryPoints.set(`${fileName}:${line}:${testName}`, {
        type: 'unit_test',
        testName,
        fileName,
        filePath,
        line,
      });
    }
  }

  /**
   * 提取测试体
   */
  extractTestBody(content) {
    const braceIndex = content.indexOf('{');
    if (braceIndex === -1) return '';

    const bodyEnd = this.findMatchingBraceInString(content, braceIndex);
    if (bodyEnd === -1) return '';

    return content.substring(braceIndex + 1, bodyEnd);
  }

  /**
   * 在字符串中查找匹配的大括号
   */
  findMatchingBraceInString(str, startIndex) {
    let count = 1;
    let i = startIndex + 1;

    while (i < str.length && count > 0) {
      if (str[i] === '{') count++;
      else if (str[i] === '}') count--;
      i++;
    }

    return count === 0 ? i - 1 : -1;
  }

  /**
   * 分析测试类型
   */
  analyzeTestType(testBody) {
    const types = [];

    if (testBody.includes('pumpWidget') || testBody.includes('testWidgets')) {
      types.push('widget_test');
    }
    if (testBody.includes('find.') || testBody.includes('getByText')) {
      types.push('finder_test');
    }
    if (testBody.includes('verify') || testBody.includes('expect')) {
      types.push('assertion_test');
    }
    if (testBody.includes('Mock') || testBody.includes('fake')) {
      types.push('mock_test');
    }
    if (testBody.includes('golden') || testBody.includes('matchesGolden')) {
      types.push('golden_test');
    }

    return types;
  }

  /**
   * 检查是否是页面文件
   */
  isPageFile(content, fileName) {
    // 检查文件名
    const pagePatterns = [
      /page\.dart$/i,
      /screen\.dart$/i,
      /view\.dart$/i,
      /home\.dart$/i,
      /main\.dart$/i,
      /app\.dart$/i,
    ];

    for (const pattern of pagePatterns) {
      if (pattern.test(fileName)) {
        return true;
      }
    }

    // 检查内容是否包含 Scaffold 或页面相关结构
    if (content.includes('Scaffold(') ||
        content.includes('MaterialApp(') ||
        content.includes('CupertinoApp(')) {
      return true;
    }

    // 检查是否继承自 StatefulWidget 或 StatelessWidget
    const classPattern = /class\s+\w+\s*(?:extends\s+)?(?:StatefulWidget|StatelessWidget)/;
    if (classPattern.test(content)) {
      return true;
    }

    return false;
  }

  /**
   * 查找页面入口点
   */
  findPageEntryPoints(content, fileName, filePath) {
    // 查找 Widget 类
    const classPattern = /class\s+(\w+)\s*(?:extends\s+)?(?:StatefulWidget|StatelessWidget)\s*\{/g;
    let match;

    while ((match = classPattern.exec(content)) !== null) {
      const className = match[1];
      const line = this.getLineNumber(content, match.index);

      // 查找 build 方法
      const buildMethod = this.findBuildMethod(content, match.index + match[0].length);

      this.entryPoints.set(`${fileName}:${className}`, {
        type: 'page_widget',
        className,
        fileName,
        filePath,
        line,
        buildMethod: buildMethod ? buildMethod.hasBuild : false,
      });
    }
  }

  /**
   * 查找 build 方法
   */
  findBuildMethod(content, startIndex) {
    // 在类定义后查找 build 方法
    const searchContent = content.substring(startIndex, startIndex + 2000); // 限制搜索范围

    const buildPattern = /Widget\s+build\s*\([^)]*\)\s*(?:async\s*)?\{/;
    const buildMatch = buildPattern.exec(searchContent);

    return {
      hasBuild: !!buildMatch,
      position: buildMatch ? startIndex + buildMatch.index : null,
    };
  }

  /**
   * 提取可测试元素
   */
  extractTestableElements(files) {
    for (const file of files) {
      const content = file.content;
      const fileName = path.basename(file.path);

      // 如果是页面文件，提取可测试元素
      if (this.isPageFile(content, fileName)) {
        this.extractPageTestableElements(content, fileName, file.path);
      }
    }
  }

  /**
   * 提取页面可测试元素
   */
  extractPageTestableElements(content, fileName, filePath) {
    // 提取可测试的按钮
    this.extractTestableButtons(content, fileName, filePath);

    // 提取可测试的输入框
    this.extractTestableInputs(content, fileName, filePath);

    // 提取可测试的文本
    this.extractTestableText(content, fileName, filePath);

    // 提取可测试的列表项
    this.extractTestableListItems(content, fileName, filePath);

    // 提取 Key 值
    this.extractKeys(content, fileName, filePath);
  }

  /**
   * 提取可测试的按钮
   */
  extractTestableButtons(content, fileName, filePath) {
    const buttonWidgets = [
      'ElevatedButton',
      'TextButton',
      'OutlinedButton',
      'IconButton',
      'FloatingActionButton',
      'InkWell',
      'GestureDetector',
    ];

    for (const widget of buttonWidgets) {
      const pattern = new RegExp(`${widget}\\s*\\(`, 'g');
      let match;

      while ((match = pattern.exec(content)) !== null) {
        const line = this.getLineNumber(content, match.index);

        // 提取 Key
        const key = this.extractKeyFromWidget(content, match.index);

        // 提取按钮文本
        const text = this.extractButtonText(content, match.index, widget);

        const element = {
          type: 'button',
          widgetType: widget,
          key,
          text,
          fileName,
          filePath,
          line,
          testable: !!key || !!text,
          testSelector: key ? key : text ? `text="${text}"` : null,
        };

        this.testableElements.set(`${fileName}:${line}:${widget}`, element);
      }
    }
  }

  /**
   * 提取按钮文本
   */
  extractButtonText(content, startIndex, widgetType) {
    // 在按钮定义中查找文本
    const searchContent = content.substring(startIndex, startIndex + 500);

    if (widgetType === 'IconButton' || widgetType === 'FloatingActionButton') {
      // 这些按钮使用 icon 属性
      const iconMatch = searchContent.match(/icon\s*:\s*(?:const\s+)?Icon\s*\(\s*['"`]([^'"`]+)['"`]/);
      return iconMatch ? iconMatch[1] : null;
    }

    // 其他按钮使用 child 属性
    const childMatch = searchContent.match(/child\s*:\s*(?:const\s+)?(?:Text|Center)\s*\(\s*['"`]([^'"`]+)['"`]/);
    return childMatch ? childMatch[1] : null;
  }

  /**
   * 提取可测试的输入框
   */
  extractTestableInputs(content, fileName, filePath) {
    const inputWidgets = [
      'TextField',
      'TextFormField',
      'DropdownButton',
      'Checkbox',
      'Switch',
      'Slider',
      'Radio',
    ];

    for (const widget of inputWidgets) {
      const pattern = new RegExp(`${widget}\\s*\\(`, 'g');
      let match;

      while ((match = pattern.exec(content)) !== null) {
        const line = this.getLineNumber(content, match.index);

        // 提取 Key
        const key = this.extractKeyFromWidget(content, match.index);

        // 提取标签/提示文本
        const label = this.extractInputLabel(content, match.index, widget);

        const element = {
          type: 'input',
          widgetType: widget,
          key,
          label,
          hint: label, // 简化处理
          fileName,
          filePath,
          line,
          testable: !!key || !!label,
          testSelector: key ? key : label ? `hint="${label}"` : null,
        };

        this.testableElements.set(`${fileName}:${line}:${widget}`, element);
      }
    }
  }

  /**
   * 提取输入框标签
   */
  extractInputLabel(content, startIndex, widgetType) {
    const searchContent = content.substring(startIndex, startIndex + 500);

    // 查找 decoration 或 label 属性
    const labelMatch = searchContent.match(/label\s*:\s*(?:const\s+)?(?:Text)?\s*['"`]([^'"`]+)['"`]/);
    if (labelMatch) {
      return labelMatch[1];
    }

    // 查找 hintText
    const hintMatch = searchContent.match(/hintText\s*:\s*(?:const\s+)?(?:Text)?\s*['"`]([^'"`]+)['"`]/);
    if (hintMatch) {
      return hintMatch[1];
    }

    return null;
  }

  /**
   * 提取可测试的文本
   */
  extractTestableText(content, fileName, filePath) {
    // 查找带有 Key 的 Text Widget
    const pattern = /Text\s*\(\s*key\s*:\s*(?:const\s+)?Key\s*\(\s*['"`]([^'"`]+)['"`]/g;
    let match;

    while ((match = pattern.exec(content)) !== null) {
      const key = match[1];
      const line = this.getLineNumber(content, match.index);

      // 提取文本内容
      const afterKey = content.substring(match.index + match[0].length);
      const textMatch = afterKey.match(/['"`]([^'"`]+)['"`]/);
      const text = textMatch ? textMatch[1] : null;

      const element = {
        type: 'text',
        widgetType: 'Text',
        key,
        text,
        fileName,
        filePath,
        line,
        testable: true,
        testSelector: `key="${key}"`,
      };

      this.testableElements.set(`${fileName}:${line}:text:${key}`, element);
    }
  }

  /**
   * 提取可测试的列表项
   */
  extractTestableListItems(content, fileName, filePath) {
    const listPatterns = [
      /ListTile\s*\(\s*key\s*:\s*(?:const\s+)?Key\s*\(\s*['"`]([^'"`]+)['"`]/g,
      /Card\s*\(\s*key\s*:\s*(?:const\s+)?Key\s*\(\s*['"`]([^'"`]+)['"`]/g,
    ];

    for (const pattern of listPatterns) {
      let match;

      while ((match = pattern.exec(content)) !== null) {
        const key = match[1];
        const line = this.getLineNumber(content, match.index);

        // 确定列表项类型
        const widgetType = pattern.source.includes('ListTile') ? 'ListTile' : 'Card';

        const element = {
          type: 'list_item',
          widgetType,
          key,
          fileName,
          filePath,
          line,
          testable: true,
          testSelector: `key="${key}"`,
        };

        this.testableElements.set(`${fileName}:${line}:${widgetType}:${key}`, element);
      }
    }
  }

  /**
   * 提取 Key 值
   */
  extractKeys(content, fileName, filePath) {
    // 查找所有 Key 定义
    const keyPattern = /key\s*:\s*(?:const\s+)?Key\s*\(\s*['"`]([^'"`]+)['"`]/g;
    let match;

    while ((match = keyPattern.exec(content)) !== null) {
      const keyValue = match[1];
      const line = this.getLineNumber(content, match.index);

      // 查找所属 Widget
      const beforeMatch = content.substring(0, match.index);
      const widgetMatch = beforeMatch.match(/(\w+)\s*\(\s*[^}]*key\s*:/);
      const widget = widgetMatch ? widgetMatch[1] : null;

      const element = {
        type: 'key',
        keyValue,
        widget,
        fileName,
        filePath,
        line,
      };

      this.testableElements.set(`${fileName}:${line}:key:${keyValue}`, element);
    }
  }

  /**
   * 从 Widget 中提取 Key
   */
  extractKeyFromWidget(content, startIndex) {
    // 在 Widget 定义后查找 key 参数
    const searchContent = content.substring(startIndex, startIndex + 300);

    const keyMatch = searchContent.match(/key\s*:\s*(?:const\s+)?Key\s*\(\s*['"`]([^'"`]+)['"`]/);
    return keyMatch ? keyMatch[1] : null;
  }

  /**
   * 推断用户流程
   */
  inferUserFlows(files) {
    for (const file of files) {
      const content = file.content;
      const fileName = path.basename(file.path);

      // 如果是页面文件，推断用户流程
      if (this.isPageFile(content, fileName)) {
        this.inferFlowsFromPage(content, fileName, file.path);
      }
    }
  }

  /**
   * 从页面推断用户流程
   */
  inferFlowsFromPage(content, fileName, filePath) {
    // 查找 onPressed/onTap 等事件处理器
    const eventPatterns = [
      { event: 'onPressed', action: 'click' },
      { event: 'onTap', action: 'tap' },
      { event: 'onLongPress', action: 'long_press' },
      { event: 'onSubmitted', action: 'submit' },
      { event: 'onChanged', action: 'input' },
    ];

    const flows = [];

    for (const { event, action } of eventPatterns) {
      const pattern = new RegExp(`${event}\\s*:\\s*\\(`, 'g');
      let match;

      while ((match = pattern.exec(content)) !== null) {
        const line = this.getLineNumber(content, match.index);

        // 提取事件处理体
        const afterMatch = content.substring(match.index + match[0].length);
        const eventBody = this.extractEventBody(afterMatch);

        // 分析流程
        const flow = this.analyzeEventFlow(eventBody, action, fileName, line);

        if (flow) {
          flows.push(flow);
        }
      }
    }

    // 按页面组织流程
    if (flows.length > 0) {
      const pageName = this.getPageNameFromFileName(fileName);
      this.userFlows.set(`${fileName}:flows`, {
        page: pageName,
        fileName,
        flows,
      });
    }
  }

  /**
   * 提取事件体
   */
  extractEventBody(content) {
    const braceIndex = content.indexOf('{');
    if (braceIndex === -1) return null;

    const bodyEnd = this.findMatchingBraceInString(content, braceIndex);
    if (bodyEnd === -1) return null;

    return content.substring(braceIndex + 1, bodyEnd);
  }

  /**
   * 分析事件流程
   */
  analyzeEventFlow(eventBody, action, fileName, line) {
    // 如果事件体为空，返回基本流程
    if (!eventBody) {
      return {
        trigger: action,
        fileName,
        line,
        steps: [{
          type: 'action',
          action: action,
          description: `执行 ${action} 操作`,
        }],
        targetPage: null,
        hasNavigation: false,
        hasDialog: false,
        hasForm: false,
      };
    }

    const steps = [];
    let targetPage = null;

    // 查找导航操作
    const navPatterns = [
      { pattern: /Navigator\.push\s*\(/, target: 'navigation', type: 'push' },
      { pattern: /Navigator\.pushNamed\s*\(\s*['"`]([^'"`]+)['"`]/, target: 'navigation', type: 'push_named' },
      { pattern: /context\.go\s*\(/, target: 'navigation', type: 'go_router' },
      { pattern: /Get\.to\s*\(/, target: 'navigation', type: 'getx_to' },
      { pattern: /Get\.toNamed\s*\(\s*['"`]([^'"`]+)['"`]/, target: 'navigation', type: 'getx_to_named' },
    ];

    for (const { pattern, target, type } of navPatterns) {
      const match = pattern.exec(eventBody);
      if (match) {
        if (match[1]) {
          targetPage = match[1];
        }
        steps.push({
          type: target,
          action: type,
          target: targetPage,
          description: targetPage ? `导航到 ${targetPage}` : '执行导航',
        });
        break;
      }
    }

    // 查找对话框操作
    if (eventBody.includes('showDialog') || eventBody.includes('showModalBottomSheet')) {
      steps.push({
        type: 'dialog',
        action: 'show_dialog',
        description: '显示对话框',
      });
    }

    // 查找表单提交
    if (action === 'submit' || eventBody.includes('validate') || eventBody.includes('save')) {
      steps.push({
        type: 'form',
        action: 'submit',
        description: '提交表单',
      });
    }

    // 查找状态更新
    if (eventBody.includes('setState') || eventBody.includes('notifyListeners')) {
      steps.push({
        type: 'state',
        action: 'update',
        description: '更新状态',
      });
    }

    // 如果没有找到任何步骤，创建一个基本步骤
    if (steps.length === 0) {
      steps.push({
        type: 'action',
        action: action,
        description: `执行 ${action} 操作`,
      });
    }

    return {
      trigger: action,
      fileName,
      line,
      steps,
      targetPage,
      hasNavigation: !!targetPage,
      hasDialog: steps.some(s => s.type === 'dialog'),
      hasForm: steps.some(s => s.type === 'form'),
    };
  }

  /**
   * 从文件名获取页面名称
   */
  getPageNameFromFileName(fileName) {
    const name = fileName.replace('.dart', '');
    return name.split('_').map(this.capitalize).join('');
  }

  /**
   * 首字母大写
   */
  capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * 分析页面交互
   */
  analyzePageInteractions(files) {
    for (const file of files) {
      const content = file.content;
      const fileName = path.basename(file.path);

      if (this.isPageFile(content, fileName)) {
        const interactions = this.analyzePageInteractionsInternal(content, fileName);

        if (interactions.length > 0) {
          this.pageInteractions.set(fileName, {
            fileName,
            interactions,
          });
        }
      }
    }
  }

  /**
   * 内部分析页面交互
   */
  analyzePageInteractionsInternal(content, fileName) {
    const interactions = [];

    // 查找 AppBar 操作
    if (content.includes('AppBar(')) {
      const appBarActions = this.extractAppBarActions(content, fileName);
      interactions.push(...appBarActions);
    }

    // 查找 FloatingActionButtons
    const fabActions = this.extractFABActions(content, fileName);
    interactions.push(...fabActions);

    // 查找 BottomNavigationBar
    if (content.includes('BottomNavigationBar(')) {
      interactions.push({
        type: 'bottom_nav',
        description: '底部导航栏',
        testable: true,
      });
    }

    // 查找 Drawer
    if (content.includes('Drawer(')) {
      interactions.push({
        type: 'drawer',
        description: '抽屉菜单',
        testable: true,
      });
    }

    // 查找 TabBar
    if (content.includes('TabBar(') || content.includes('TabController')) {
      interactions.push({
        type: 'tabs',
        description: '标签页',
        testable: true,
      });
    }

    return interactions;
  }

  /**
   * 提取 AppBar 操作
   */
  extractAppBarActions(content, fileName) {
    const actions = [];

    // 查找 AppBar 中的 actions
    const appBarPattern = /AppBar\s*\([^)]*actions\s*:\s*\[([^\]]*)\]/g;
    let match;

    while ((match = appBarPattern.exec(content)) !== null) {
      const actionsBody = match[1];

      // 查找 IconButton
      const iconPattern = /IconButton\s*\([^)]*icon\s*:\s*(?:const\s+)?Icon\s*\(\s*['"`]([^'"`]+)['"`]/g;
      let iconMatch;

      while ((iconMatch = iconPattern.exec(actionsBody)) !== null) {
        actions.push({
          type: 'app_bar_action',
          icon: iconMatch[1],
          description: `AppBar 操作: ${iconMatch[1]}`,
          testable: true,
        });
      }
    }

    return actions;
  }

  /**
   * 提取 FAB 操作
   */
  extractFABActions(content, fileName) {
    const actions = [];

    const fabPattern = /FloatingActionButton\s*\(\s*onPressed\s*:\s*\(\s*(?:\([^)]*\)\s*=>?)?\s*\{/g;
    let match;

    while ((match = fabPattern.exec(content)) !== null) {
      const line = this.getLineNumber(content, match.index);

      // 提取图标
      const afterMatch = content.substring(match.index);
      const iconMatch = afterMatch.match(/icon\s*:\s*(?:const\s+)?Icon\s*\(\s*['"`]([^'"`]+)['"`]/);
      const icon = iconMatch ? iconMatch[1] : 'add';

      actions.push({
        type: 'fab',
        icon,
        description: `FAB 操作: ${icon}`,
        testable: true,
        line,
      });
    }

    return actions;
  }

  /**
   * 生成测试建议
   */
  generateTestSuggestions(files) {
    for (const [key, pageData] of this.userFlows) {
      const pageName = pageData.page;
      const fileName = pageData.fileName;

      // 为每个用户流程生成测试建议
      for (const flow of pageData.flows) {
        const suggestion = this.generateTestSuggestionForFlow(flow, pageName, fileName);
        if (suggestion) {
          this.testSuggestions.set(`${key}:${flow.trigger}`, suggestion);
        }
      }
    }

    // 为可测试元素生成测试建议
    for (const [key, element] of this.testableElements) {
      if (!element.testable) {
        // 为没有 Key 或文本的元素生成建议
        const suggestion = {
          type: 'add_test_key',
          element: element.widgetType,
          fileName: element.fileName,
          line: element.line,
          suggestion: `添加 Key 属性以提高可测试性`,
          example: `key: '${element.widgetType}_${element.line}',`,
        };

        this.testSuggestions.set(`add_key:${key}`, suggestion);
      }
    }
  }

  /**
   * 为流程生成测试建议
   */
  generateTestSuggestionForFlow(flow, pageName, fileName) {
    const testCases = [];

    // 主流程测试
    if (flow.hasNavigation) {
      testCases.push({
        name: `测试${pageName}${flow.targetPage}导航`,
        description: `验证从 ${pageName} 导航到 ${flow.targetPage}`,
        type: 'navigation_test',
        priority: 'high',
      });
    }

    // 对话框测试
    if (flow.hasDialog) {
      testCases.push({
        name: `测试${pageName}对话框显示`,
        description: `验证${pageName}的对话框操作`,
        type: 'interaction_test',
        priority: 'medium',
      });
    }

    // 表单测试
    if (flow.hasForm) {
      testCases.push({
        name: `测试${pageName}表单提交`,
        description: `验证${pageName}的表单提交流程`,
        type: 'form_test',
        priority: 'high',
      });
    }

    if (testCases.length === 0) {
      testCases.push({
        name: `测试${pageName}${flow.trigger}操作`,
        description: `验证${pageName}的${flow.trigger}功能`,
        type: 'widget_test',
        priority: 'medium',
      });
    }

    return {
      page: pageName,
      trigger: flow.trigger,
      fileName,
      testCases,
    };
  }

  /**
   * 分析测试覆盖率
   */
  analyzeTestCoverage(files) {
    // 统计页面文件和测试文件
    let pageFiles = 0;
    let testFiles = 0;
    const testedPages = new Set();

    for (const file of files) {
      const fileName = path.basename(file.path);

      if (this.isPageFile(file.content, fileName)) {
        pageFiles++;

        // 检查是否有对应的测试文件
        const testName = fileName.replace('.dart', '_test.dart');
        const hasTest = files.some(f => f.fileName === testName);

        if (hasTest) {
          testedPages.add(fileName);
        }
      } else if (fileName.endsWith('_test.dart')) {
        testFiles++;
      }
    }

    return {
      totalPageFiles: pageFiles,
      totalTestFiles: testFiles,
      testedPages: testedPages.size,
      coverageRate: pageFiles > 0 ? Math.round(testedPages.size / pageFiles * 100) / 100 : 0,
      untestedPages: pageFiles - testedPages.size,
    };
  }

  /**
   * 生成统计信息
   */
  generateStatistics() {
    const stats = {
      totalEntryPoints: this.entryPoints.size,
      totalTestableElements: this.testableElements.size,
      totalUserFlows: this.userFlows.size,
      totalInteractions: this.pageInteractions.size,
      totalSuggestions: this.testSuggestions.size,
      byEntryPointType: {},
      byElementType: {},
      byFlowType: {},
      testableElements: 0,
      nonTestableElements: 0,
    };

    // 按入口点类型统计
    for (const entry of this.entryPoints.values()) {
      stats.byEntryPointType[entry.type] = (stats.byEntryPointType[entry.type] || 0) + 1;
    }

    // 按元素类型统计
    for (const element of this.testableElements.values()) {
      stats.byElementType[element.type] = (stats.byElementType[element.type] || 0) + 1;
      if (element.testable) {
        stats.testableElements++;
      } else {
        stats.nonTestableElements++;
      }
    }

    // 按流程类型统计
    for (const pageData of this.userFlows.values()) {
      for (const flow of pageData.flows) {
        if (flow.hasNavigation) {
          stats.byFlowType['navigation'] = (stats.byFlowType['navigation'] || 0) + 1;
        }
        if (flow.hasDialog) {
          stats.byFlowType['dialog'] = (stats.byFlowType['dialog'] || 0) + 1;
        }
        if (flow.hasForm) {
          stats.byFlowType['form'] = (stats.byFlowType['form'] || 0) + 1;
        }
      }
    }

    return stats;
  }

  /**
   * 健康检查
   */
  performHealthCheck() {
    const checks = [];

    // 检查可测试元素覆盖率
    const totalElements = this.testableElements.size;
    const testableElements = Array.from(this.testableElements.values()).filter(e => e.testable).length;
    const testableRate = totalElements > 0 ? testableElements / totalElements : 1;

    checks.push({
      name: '可测试元素覆盖率',
      status: testableRate >= 0.5 ? 'good' : testableRate >= 0.3 ? 'warning' : 'error',
      value: { testable: testableElements, total: totalElements, rate: testableRate },
      message: `${testableElements}/${totalElements} 元素可测试 (${Math.round(testableRate * 100)}%)`,
    });

    // 检查是否有测试文件
    const hasTests = Array.from(this.entryPoints.values()).some(e => e.type === 'widget_test' || e.type === 'unit_test');

    checks.push({
      name: '测试文件',
      status: hasTests ? 'good' : 'warning',
      message: hasTests ? '已检测到测试文件' : '未检测到测试文件',
    });

    // 检查 Key 使用
    const withKeys = Array.from(this.testableElements.values()).filter(e => e.key).length;
    const keyUsageRate = totalElements > 0 ? withKeys / totalElements : 1;

    checks.push({
      name: 'Key 使用率',
      status: keyUsageRate >= 0.5 ? 'good' : keyUsageRate >= 0.3 ? 'warning' : 'info',
      message: `${Math.round(keyUsageRate * 100)}% 的元素有 Key`,
    });

    return checks;
  }

  /**
   * 获取入口点列表
   */
  getEntryPointsList() {
    return Array.from(this.entryPoints.values()).map(entry => ({
      type: entry.type,
      name: entry.className || entry.testName || entry.groupName || entry.pageName || entry.route || 'unknown',
      fileName: entry.fileName,
      line: entry.line,
      details: entry,
    }));
  }

  /**
   * 获取可测试元素列表
   */
  getTestableElementsList() {
    return Array.from(this.testableElements.values()).map(element => ({
      type: element.type,
      widget: element.widgetType,
      key: element.key,
      text: element.text || element.label,
      testable: element.testable,
      testSelector: element.testSelector,
      fileName: element.fileName,
      line: element.line,
    }));
  }

  /**
   * 获取用户流程列表
   */
  getUserFlowsList() {
    const flows = [];

    for (const [key, pageData] of this.userFlows) {
      for (const flow of pageData.flows) {
        flows.push({
          page: pageData.page,
          trigger: flow.trigger,
          targetPage: flow.targetPage,
          steps: flow.steps,
          fileName: pageData.fileName,
          line: flow.line,
        });
      }
    }

    return flows;
  }

  /**
   * 获取交互列表
   */
  getInteractionsList() {
    const interactions = [];

    for (const [fileName, data] of this.pageInteractions) {
      for (const interaction of data.interactions) {
        interactions.push({
          ...interaction,
          fileName,
        });
      }
    }

    return interactions;
  }

  /**
   * 获取建议列表
   */
  getSuggestionsList() {
    return Array.from(this.testSuggestions.values());
  }

  /**
   * 生成 Mermaid 格式的用户流程图
   */
  toMermaid() {
    const lines = ['graph TD'];

    let nodeId = 0;
    const pageNodes = new Map();

    // 添加页面节点
    for (const [key, pageData] of this.userFlows) {
      const pageId = `page_${nodeId++}`;
      pageNodes.set(pageData.page, pageId);

      lines.push(`  "${pageId}"["${pageData.page}"]`);
    }

    // 添加流程边
    for (const [key, pageData] of this.userFlows) {
      const sourceId = pageNodes.get(pageData.page);

      for (const flow of pageData.flows) {
        if (flow.targetPage && pageNodes.has(flow.targetPage)) {
          const targetId = pageNodes.get(flow.targetPage);
          lines.push(`  "${sourceId}" -->|"${flow.trigger}"| "${targetId}"`);
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * 获取行号
   */
  getLineNumber(content, index) {
    const before = content.substring(0, index);
    return before.split('\n').length;
  }
}

module.exports = FlutterTestAnalyzer;
