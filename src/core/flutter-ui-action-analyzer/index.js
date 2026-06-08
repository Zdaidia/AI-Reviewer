/**
 * Flutter UI Action Analyzer
 *
 * 职责:
 * - 识别 Widget 中的事件处理器
 * - 分析用户交互操作
 * - 提取 Action 类型和参数
 * - 追踪 Action 链
 * - 识别 UI 操作模式
 * - 检测事件处理逻辑
 *
 * 支持的 Action 类型:
 * - 点击: onPressed, onTap
 * - 输入: onChanged, onSubmitted, onSaved
 * - 滑动: onScroll, onRefresh, onLoadMore
 * - 手势: GestureDetector, InkWell
 * - 导航: Navigator, push, pop
 * - 表单: onSubmit, onSaved, onFieldSubmitted
 * - 生命周期: initState, dispose
 * - 其他: Builder, FutureBuilder, StreamBuilder
 */

const path = require('path');

class FlutterUIActionAnalyzer {
  constructor() {
    this.actions = new Map(); // 操作注册表
    this.actionChains = new Map(); // 操作链
    this.actionPatterns = new Map(); // 操作模式
    this.eventHandlers = new Map(); // 事件处理器
  }

  /**
   * 初始化 Action 模式注册表
   */
  initActionRegistry() {
    // 事件处理模式
    this.eventPatterns = {
      // 点击事件
      onPressed: {
        widget: ['ElevatedButton', 'TextButton', 'OutlinedButton', 'IconButton', 'FloatingActionButton'],
        event: 'onPressed',
        actionType: 'click',
        commonActions: ['submit', 'confirm', 'cancel', 'delete', 'edit', 'add', 'remove'],
      },
      onTap: {
        widget: ['GestureDetector', 'InkWell', 'ListTile', 'Card'],
        event: 'onTap',
        actionType: 'click',
        commonActions: ['navigate', 'select', 'expand', 'collapse'],
      },
      onLongPress: {
        widget: ['GestureDetector', 'InkWell'],
        event: 'onLongPress',
        actionType: 'longPress',
        commonActions: ['showMenu', 'delete', 'edit'],
      },

      // 输入事件
      onChanged: {
        widget: ['TextField', 'TextFormField', 'Checkbox', 'Switch', 'Slider', 'DropdownButton'],
        event: 'onChanged',
        actionType: 'input',
        commonActions: ['update', 'filter', 'search', 'toggle'],
      },
      onSubmitted: {
        widget: ['TextField', 'TextFormField'],
        event: 'onSubmitted',
        actionType: 'submit',
        commonActions: ['search', 'login', 'confirm'],
      },
      onSaved: {
        widget: ['TextFormField'],
        event: 'onSaved',
        actionType: 'save',
        commonActions: ['save', 'persist'],
      },

      // 滚动事件
      onScroll: {
        widget: ['ListView', 'GridView', 'CustomScrollView', 'SingleChildScrollView'],
        event: 'onScroll',
        actionType: 'scroll',
        commonActions: ['loadMore', 'hideHeader', 'showHeader'],
      },
      onRefresh: {
        widget: ['RefreshIndicator'],
        event: 'onRefresh',
        actionType: 'refresh',
        commonActions: ['reload', 'sync'],
      },
      onLoadMore: {
        widget: ['ScrollController'],
        event: 'loadMore',
        actionType: 'loadMore',
        commonActions: ['paginate', 'loadNextPage'],
      },

      // 导航事件
      push: {
        widget: ['Navigator'],
        event: 'push',
        actionType: 'navigation',
        commonActions: ['open', 'goto', 'detail'],
      },
      pop: {
        widget: ['Navigator'],
        event: 'pop',
        actionType: 'navigation',
        commonActions: ['back', 'close', 'return'],
      },

      // 表单事件
      onSubmit: {
        widget: ['Form'],
        event: 'onSubmit',
        actionType: 'submit',
        commonActions: ['submit', 'save', 'create', 'update'],
      },

      // 对话框事件
      showDialog: {
        widget: ['showDialog'],
        event: 'showDialog',
        actionType: 'dialog',
        commonActions: ['confirm', 'alert', 'prompt'],
      },

      // 生命周期
      initState: {
        widget: ['State'],
        event: 'initState',
        actionType: 'lifecycle',
        commonActions: ['init', 'load', 'setup'],
      },
      dispose: {
        widget: ['State'],
        event: 'dispose',
        actionType: 'lifecycle',
        commonActions: ['cleanup', 'close', 'dispose'],
      },
    };

    // 操作模式
    this.actionModePatterns = {
      navigation: ['Navigator.', 'push(', 'pop(', 'GoRouter.', 'context.go'],
      dialog: ['showDialog', 'showCupertinoDialog', 'showModalBottomSheet'],
      snackbar: ['ScaffoldMessenger.', 'showSnackBar', 'hideSnackBar'],
      sheet: ['showModalBottomSheet', 'showCupertinoModalPopup'],
      validation: ['formKey.currentState.validate', 'validate', 'save'],
      async: ['FutureBuilder', 'StreamBuilder', 'await'],
    };
  }

  /**
   * 分析项目中的 UI Action
   * @param {Array} files - Dart 文件列表
   * @returns {Object} UI Action 分析结果
   */
  analyzeUIActions(files) {
    this.clearCache();
    this.initActionRegistry();

    // 1. 识别 Widget 事件处理
    this.identifyEventHandlers(files);

    // 2. 分析 Action 类型
    this.analyzeActionTypes(files);

    // 3. 构建 Action 链
    this.buildActionChains(files);

    // 4. 识别操作模式
    this.identifyActionPatterns(files);

    // 5. 生成统计信息
    const statistics = this.generateStatistics();

    return {
      actions: this.getActionsList(),
      chains: this.getActionChainsList(),
      patterns: this.getActionPatternsList(),
      eventHandlers: this.getEventHandlersList(),
      statistics,
    };
  }

  /**
   * 识别事件处理器
   */
  identifyEventHandlers(files) {
    let actionId = 0;

    // 常见的 Widget 类型
    const commonWidgets = [
      'ElevatedButton', 'TextButton', 'OutlinedButton', 'IconButton', 'FloatingActionButton',
      'GestureDetector', 'InkWell', 'ListTile', 'Card',
      'TextField', 'TextFormField', 'Checkbox', 'Switch', 'Slider', 'DropdownButton',
      'ListView', 'GridView', 'CustomScrollView', 'SingleChildScrollView', 'RefreshIndicator',
      'Form', 'ScrollController',
    ];

    // 事件名称
    const eventNames = [
      'onPressed', 'onTap', 'onLongPress', 'onDoubleTap',
      'onChanged', 'onSubmitted', 'onSaved', 'onFieldSubmitted',
      'onScroll', 'onRefresh', 'onScrollNotification',
      'onSubmit', 'onCancel',
    ];

    // 非事件回调的命名参数
    const nonEventParams = [
      'builder', 'itemBuilder', 'separatorBuilder', 'transitionBuilder',
      'itemCount', 'itemExtent', 'padding', 'margin', 'decoration',
      'child', 'children', 'title', 'subtitle', 'leading', 'trailing',
      'icon', 'label', 'hint', 'key', 'controller',
    ];

    for (const file of files) {
      const content = file.content;
      const filePath = file.path;
      const fileName = path.basename(filePath);

      // 方法：查找 Widget(...) 块，然后在其中查找事件处理器
      for (const widgetName of commonWidgets) {
        // 匹配 Widget 名称后跟 (
        const widgetPattern = new RegExp(`${widgetName}\\s*\\(`, 'g');
        let widgetMatch;

        while ((widgetMatch = widgetPattern.exec(content)) !== null) {
          const widgetStart = widgetMatch.index;

          // 提取 Widget 的参数块（平衡括号）
          const widgetBlock = this.extractBalancedParens(content, widgetStart + widgetMatch[0].length - 1);
          if (!widgetBlock) continue;

          // 在 Widget 块中查找事件处理器
          for (const eventName of eventNames) {
            // 在块中查找 eventName:
            const eventPattern = new RegExp(`${eventName}\\s*:`, 'g');
            let eventMatch;

            // 只在当前 Widget 块内搜索
            eventPattern.lastIndex = 0;
            const blockStart = widgetStart + widgetMatch[0].length;
            const blockContent = content.substring(blockStart, blockStart + widgetBlock.length);

            while ((eventMatch = eventPattern.exec(blockContent)) !== null) {
              // 检查是否紧接着函数定义
              const afterEvent = blockContent.substring(eventMatch.index + eventMatch[0].length).trim();

              // 匹配 () { 或 (param) { 或 () => { 或 (param) => {
              if (afterEvent.startsWith('(')) {
                const eventStartInContent = blockStart + eventMatch.index;
                const line = this.getLineNumber(content, eventStartInContent);

                // 找到函数体的开始 {
                const braceMatch = afterEvent.match(/\{/);
                if (!braceMatch) continue;

                const bodyStart = blockStart + eventMatch.index + eventMatch[0].length + braceMatch.index + 1;

                // 提取函数体
                const eventBody = this.extractBalancedBraces(content, bodyStart - 1);
                if (!eventBody) continue;

                // 分析事件体中的操作
                const innerActions = this.extractInnerActions(content, bodyStart, eventBody);

                const action = {
                  id: `act_${actionId++}`,
                  widgetType: widgetName,
                  eventType: eventName,
                  eventParams: '',
                  filePath,
                  fileName,
                  line,
                  body: eventBody,
                  actions: innerActions,
                  actionType: this.inferActionType(eventName, widgetName, eventBody),
                };

                // 生成唯一键
                const key = `${fileName}:${line}:${widgetName}.${eventName}`;
                                        this.actions.set(key, action);
              }
            }
          }
        }
      }

      // 查找 Navigator 调用（导航操作）
      this.findNavigatorCalls(content, fileName, actionId);
    }
  }

  /**
   * 提取平衡的括号内容
   */
  extractBalancedParens(content, startPos) {
    let parenCount = 1; // 已经有一个开括号
    let endPos = startPos;

    for (let i = startPos + 1; i < content.length; i++) {
      const char = content[i];

      if (char === '(') {
        parenCount++;
      } else if (char === ')') {
        parenCount--;
        if (parenCount === 0) {
          endPos = i;
          break;
        }
      }
    }

    if (endPos > startPos) {
      return content.substring(startPos, endPos + 1);
    }
    return null;
  }

  /**
   * 提取平衡的大括号内容
   */
  extractBalancedBraces(content, startPos) {
    let braceCount = 0;
    let foundFirstBrace = false;
    let endPos = startPos;

    for (let i = startPos; i < content.length; i++) {
      const char = content[i];

      if (char === '{') {
        braceCount++;
        foundFirstBrace = true;
      } else if (char === '}') {
        braceCount--;
        if (foundFirstBrace && braceCount === 0) {
          endPos = i + 1;
          break;
        }
      }
    }

    if (endPos > startPos) {
      return content.substring(startPos, endPos);
    }
    return null;
  }

  /**
   * 向前查找 Widget 类型
   */
  findWidgetType(content, pos) {
    // 向前搜索，找到 Widget 名称
    const before = content.substring(0, pos);

    // 查找最近的构造函数调用模式
    // 匹配: WidgetName( 或 WidgetName<...>(
    const widgetPattern = /(\w+(?:<[^>]+>)?)\s*\([^)]*$/g;
    let match;

    // 从位置向前搜索
    const searchLimit = Math.max(0, pos - 500);
    const searchContent = content.substring(searchLimit, pos);

    // 查找最后一个匹配的 Widget
    let lastMatch = null;
    while ((match = widgetPattern.exec(searchContent)) !== null) {
      lastMatch = match;
    }

    if (lastMatch) {
      return lastMatch[1];
    }

    // 特殊处理：检查是否在某个已知 Widget 的上下文中
    const commonWidgets = [
      'ElevatedButton', 'TextButton', 'OutlinedButton', 'IconButton',
      'FloatingActionButton', 'GestureDetector', 'InkWell', 'ListTile',
      'TextField', 'TextFormField', 'Checkbox', 'Switch', 'Slider',
      'ListView', 'GridView', 'RefreshIndicator', 'Form', 'Card',
    ];

    for (const widget of commonWidgets) {
      if (before.includes(widget + '(')) {
        return widget;
      }
    }

    return 'UnknownWidget';
  }

  /**
   * 判断是否是命名参数（非事件回调）
   */
  isNamedParameter(eventName) {
    const namedParams = [
      'builder', 'itemBuilder', 'separatorBuilder', 'transitionBuilder',
      'itemCount', 'itemExtent', 'padding', 'margin', 'decoration',
    ];
    return namedParams.includes(eventName);
  }

  /**
   * 查找 Navigator 调用
   */
  findNavigatorCalls(content, fileName, actionId) {
    const navigatorPattern = /Navigator\.(\w+)\s*\(/g;
    let match;

    while ((match = navigatorPattern.exec(content)) !== null) {
      const method = match[1];
      const line = this.getLineNumber(content, match.index);

      // 创建导航 Action
      const key = `${fileName}:${line}:Navigator.${method}`;
      if (!this.actions.has(key)) {
        this.actions.set(key, {
          id: `nav_${actionId++}`,
          widgetType: 'Navigator',
          eventType: method,
          eventParams: '',
          filePath: '',
          fileName,
          line,
          body: '',
          actions: [{
            type: 'navigation',
            method: method,
          }],
          actionType: 'navigation',
        });
      }
    }
  }

  /**
   * 提取内部操作
   */
  extractInnerActions(content, startIndex, eventBody) {
    const actions = [];
    const body = eventBody || '';

    // 查找 Navigator 调用
    const navigatorPattern = /Navigator\.(\w+)\s*\(/g;
    let match;
    while ((match = navigatorPattern.exec(body)) !== null) {
      actions.push({
        type: 'navigation',
        method: match[1],
        detail: this.extractNavigatorDetail(body, match.index),
      });
    }

    // 查找对话框调用
    const dialogPattern = /(showDialog|showCupertinoDialog|showModalBottomSheet)\s*\(/g;
    while ((match = dialogPattern.exec(body)) !== null) {
      actions.push({
        type: 'dialog',
        method: match[1],
      });
    }

    // 查找 ScaffoldMessenger 调用
    const snackbarPattern = /ScaffoldMessenger\.(showSnackBar|hideSnackBar|removeCurrentSnackBar)\s*\(/g;
    while ((match = snackbarPattern.exec(body)) !== null) {
      actions.push({
        type: 'snackbar',
        method: match[1],
      });
    }

    // 查找表单操作
    const formPattern = /formKey\.currentState\.(\w+)\s*\(/g;
    while ((match = formPattern.exec(body)) !== null) {
      actions.push({
        type: 'form',
        method: match[1],
      });
    }

    // 查找 Provider 调用
    const providerPattern = /(Provider\.of<[^>]+>\s*\(|context\.read\s*<|context\.watch\s*<)/g;
    while ((match = providerPattern.exec(body)) !== null) {
      actions.push({
        type: 'state_access',
        method: 'read',
      });
    }

    // 查找 setState 调用
    if (body.includes('setState(')) {
      actions.push({
        type: 'state_update',
        method: 'setState',
      });
    }

    return actions;
  }

  /**
   * 提取 Navigator 详情
   */
  extractNavigatorDetail(body, matchIndex) {
    // 查找 Navigator 调用的参数
    const afterMatch = body.substring(matchIndex);
    const parenPattern = /\(([^)]{0,100})\)/;
    const parenMatch = afterMatch.match(parenPattern);

    if (parenMatch) {
      const params = parenMatch[1].trim();
      // 检查是否是路由名称
      if (params.includes("'") || params.includes('"')) {
        const routeMatch = params.match(/["']([^"']+)["']/);
        if (routeMatch) {
          return { route: routeMatch[1] };
        }
      }
    }

    return {};
  }

  /**
   * 推断 Action 类型
   */
  inferActionType(eventType, widgetType, eventBody) {
    const eventLower = eventType.toLowerCase();
    const widgetLower = widgetType.toLowerCase();
    const bodyLower = eventBody.toLowerCase();

    // 明确的点击操作
    if (eventLower.includes('onpressed') || eventLower.includes('ontap')) {
      return 'click';
    }

    // 明确的输入操作
    if (eventLower.includes('onchanged') || eventLower.includes('onsubmitted')) {
      return 'input';
    }

    // 滚动操作
    if (eventLower.includes('onscroll')) {
      return 'scroll';
    }

    // 刷新操作
    if (eventLower.includes('onrefresh')) {
      return 'refresh';
    }

    // 长按操作
    if (eventLower.includes('onlongpress')) {
      return 'longPress';
    }

    // 生命周期
    if (eventLower.includes('initstate') || eventLower.includes('dispose')) {
      return 'lifecycle';
    }

    return 'unknown';
  }

  /**
   * 分析 Action 类型
   */
  analyzeActionTypes(files) {
    for (const [key, action] of this.actions) {
      // 根据事件体进一步分类
      const bodyLower = action.body.toLowerCase();

      // 导航操作
      if (bodyLower.includes('navigator.') || bodyLower.includes('push(') || bodyLower.includes('pop(')) {
        action.category = 'navigation';
      }
      // 对话框操作
      else if (bodyLower.includes('showdialog') || bodyLower.includes('showbottomsheet')) {
        action.category = 'dialog';
      }
      // 表单操作
      else if (bodyLower.includes('validate') || bodyLower.includes('save')) {
        action.category = 'form';
      }
      // 状态访问
      else if (bodyLower.includes('context.read') || bodyLower.includes('provider.of')) {
        action.category = 'state_access';
      }
      // 网络请求
      else if (bodyLower.includes('await') && (bodyLower.includes('.get') || bodyLower.includes('.post'))) {
        action.category = 'network';
      }
      // 本地操作
      else if (bodyLower.includes('setstate') || bodyLower.includes('notifylisteners')) {
        action.category = 'state_update';
      }
      else {
        action.category = 'general';
      }
    }
  }

  /**
   * 构建 Action 链
   */
  buildActionChains(files) {
    for (const [key, action] of this.actions) {
      const chain = [];

      // 添加当前 Action
      chain.push({
        type: action.eventType,
        widget: action.widgetType,
        file: action.fileName,
        line: action.line,
      });

      // 添加内部操作
      for (const innerAction of action.actions) {
        chain.push({
          type: innerAction.type,
          method: innerAction.method,
          detail: innerAction.detail,
        });
      }

      if (chain.length > 0) {
        this.actionChains.set(key, chain);
      }
    }
  }

  /**
   * 识别操作模式
   */
  identifyActionPatterns(files) {
    const patterns = [];

    // 识别常见的操作模式
    for (const [key, action] of this.actions) {
      const chain = this.actionChains.get(key);
      if (!chain) continue;

      // 列表项点击模式
      if (action.widgetType === 'ListTile' && action.eventType === 'onTap') {
        const hasNavigation = chain.some(a => a.type === 'navigation' && a.method === 'push');
        if (hasNavigation) {
          patterns.push({
            pattern: 'list_to_detail',
            description: '列表项点击跳转到详情页',
            file: action.fileName,
            line: action.line,
          });
        }
      }

      // 按钮提交模式
      if (action.widgetType === 'ElevatedButton' && action.eventType === 'onPressed') {
        const hasValidation = chain.some(a => a.type === 'form' && a.method === 'validate');
        const hasNetwork = chain.some(a => a.category === 'network');
        if (hasValidation && hasNetwork) {
          patterns.push({
            pattern: 'button_submit',
            description: '按钮触发表单验证和网络请求',
            file: action.fileName,
            line: action.line,
          });
        }
      }

      // 下拉刷新模式
      if (action.eventType === 'onRefresh') {
        patterns.push({
          pattern: 'pull_to_refresh',
          description: '下拉刷新数据',
          file: action.fileName,
          line: action.line,
        });
      }

      // 对话框确认模式
      if (chain.some(a => a.type === 'dialog')) {
        patterns.push({
          pattern: 'dialog_confirmation',
          description: '对话框确认操作',
          file: action.fileName,
          line: action.line,
        });
      }

      // 滚动加载模式
      if (action.eventType === 'onScroll') {
        const hasPagination = chain.some(a => a.method === 'loadMore');
        if (hasPagination) {
          patterns.push({
            pattern: 'scroll_pagination',
            description: '滚动分页加载',
            file: action.fileName,
            line: action.line,
          });
        }
      }
    }

    for (const pattern of patterns) {
      const key = `${pattern.pattern}_${pattern.file}_${pattern.line}`;
      this.actionPatterns.set(key, pattern);
    }
  }

  /**
   * 生成统计信息
   */
  generateStatistics() {
    const stats = {
      totalActions: this.actions.size,
      totalChains: this.actionChains.size,
      totalPatterns: this.actionPatterns.size,
      byEventType: {},
      byWidgetType: {},
      byCategory: {},
      avgActionsPerChain: 0,
    };

    let totalInnerActions = 0;

    for (const action of this.actions.values()) {
      // 按事件类型统计
      stats.byEventType[action.eventType] = (stats.byEventType[action.eventType] || 0) + 1;

      // 按 Widget 类型统计
      stats.byWidgetType[action.widgetType] = (stats.byWidgetType[action.widgetType] || 0) + 1;

      // 按类别统计
      if (action.category) {
        stats.byCategory[action.category] = (stats.byCategory[action.category] || 0) + 1;
      }

      totalInnerActions += action.actions.length;
    }

    stats.avgActionsPerChain = this.actionChains.size > 0
      ? Math.round(totalInnerActions / this.actionChains.size)
      : 0;

    return stats;
  }

  /**
   * 获取 Action 列表
   */
  getActionsList() {
    return Array.from(this.actions.values()).map(action => ({
      widget: action.widgetType,
      event: action.eventType,
      eventType: action.actionType,
      category: action.category,
      file: action.fileName,
      line: action.line,
      innerActionsCount: action.actions.length,
      innerActions: action.actions,
    }));
  }

  /**
   * 获取 Action 链列表
   */
  getActionChainsList() {
    const list = [];

    for (const [key, chain] of this.actionChains) {
      list.push({
        id: key,
        chain,
        length: chain.length,
      });
    }

    return list;
  }

  /**
   * 获取操作模式列表
   */
  getActionPatternsList() {
    return Array.from(this.actionPatterns.values());
  }

  /**
   * 获取事件处理器列表
   */
  getEventHandlersList() {
    return Array.from(this.actions.values()).map(action => ({
      widget: action.widgetType,
      event: action.eventType,
      file: action.fileName,
      line: action.line,
      hasInnerActions: action.actions.length > 0,
      innerActions: action.actions,
    }));
  }

  /**
   * 生成 Action 报告
   */
  generateActionReport() {
    const report = {
      summary: {},
      byWidget: {},
      commonPatterns: [],
      recommendations: [],
    };

    // 按Widget类型统计
    for (const action of this.actions.values()) {
      const widget = action.widgetType;
      if (!report.byWidget[widget]) {
        report.byWidget[widget] = {
          count: 0,
          events: [],
        };
      }
      report.byWidget[widget].count++;
      report.byWidget[widget].events.push(action.eventType);
    }

    // 识别常见模式
    const patterns = Array.from(this.actionPatterns.values());
    const patternCounts = {};

    for (const pattern of patterns) {
      patternCounts[pattern.pattern] = (patternCounts[pattern.pattern] || 0) + 1;
    }

    report.commonPatterns = Object.entries(patternCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([pattern, count]) => ({ pattern, count }));

    // 生成建议
    if (this.actions.size === 0) {
      report.recommendations.push({
        type: 'warning',
        message: '未检测到 UI Action，请检查文件是否包含 UI 组件',
      });
    }

    // 检查导航操作
    const navigationActions = Array.from(this.actions.values()).filter(a =>
      a.category === 'navigation'
    );

    if (navigationActions.length > 0) {
      const usesNamedRoutes = navigationActions.some(a =>
        a.actions.some(inner => inner.detail && inner.detail.route)
      );

      report.routing = {
        hasRouting: true,
        usesNamedRoutes,
        routeCount: navigationActions.length,
      };

      if (!usesNamedRoutes && navigationActions.length > 3) {
        report.recommendations.push({
          type: 'suggestion',
          message: '考虑使用命名路由以提高可维护性',
        });
      }
    }

    return report;
  }

  /**
   * 生成 Mermaid 格式的 Action 流图
   */
  toMermaid(options = {}) {
    const {
      groupByWidget = true,
      showInnerActions = true,
    } = options;

    const lines = ['graph TD'];

    // 添加节点和边
    const processed = new Set();

    for (const [key, chain] of this.actionChains) {
      const sourceNode = this.sanitizeNodeId(`${key}_source`);

      for (let i = 0; i < chain.length; i++) {
        const step = chain[i];
        let nodeKey;

        if (i === 0) {
          // 第一个节点是事件源
          nodeKey = sourceNode;
          const label = `${step.widget}\\n${step.event}`;
          if (!processed.has(nodeKey)) {
            lines.push(`  "${nodeKey}"[${label}]`);
            processed.add(nodeKey);
          }
        }

        // 后续节点是内部操作
        if (i > 0 && showInnerActions) {
          nodeKey = this.sanitizeNodeId(`${key}_${i}_${step.type}_${step.method || 'unknown'}`);
          let label = step.type;
          if (step.method) {
            label += `\\n${step.method}`;
          }
          if (step.detail && step.detail.route) {
            label += `\\n"${step.detail.route}"`;
          }

          if (!processed.has(nodeKey)) {
            lines.push(`  "${nodeKey}"[${label}]`);
            processed.add(nodeKey);
          }

          // 添加边
          const prevNodeKey = i === 1 ? sourceNode : this.sanitizeNodeId(`${key}_${i-1}_unknown`);
          lines.push(`  "${prevNodeKey}" --> "${nodeKey}"`);
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * 清理节点 ID
   */
  sanitizeNodeId(id) {
    return id.replace(/[^a-zA-Z0-9_]/g, '_');
  }

  /**
   * 获取行号
   */
  getLineNumber(content, index) {
    const before = content.substring(0, index);
    return before.split('\n').length;
  }

  /**
   * 清除缓存
   */
  clearCache() {
    this.actions.clear();
    this.actionChains.clear();
    this.actionPatterns.clear();
    this.eventHandlers.clear();
  }
}

module.exports = FlutterUIActionAnalyzer;
