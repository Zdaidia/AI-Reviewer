/**
 * Flutter State Management Analyzer
 *
 * 职责:
 * - 识别状态管理框架
 * - 分析 State 类结构
 * - 分析 Event 和 State 转换
 * - 识别状态依赖关系
 * - 检测状态管理最佳实践
 * - 分析状态生命周期
 *
 * 支持的状态管理框架:
 * - Provider / ChangeNotifier
 * - Bloc / Cubit
 * - GetX / GetxController
 * - Riverpod
 * - Redux
 * - MobX
 * - setState (内置)
 */

const path = require('path');

class FlutterStateAnalyzer {
  constructor() {
    this.states = new Map(); // 状态类注册表
    this.events = new Map(); // 事件注册表
    this.stateTransitions = new Map(); // 状态转换
    this.stateDependencies = new Map(); // 状态依赖
    this.stateProviders = new Map(); // 状态提供者
    this.stateConsumers = new Map(); // 状态消费者
  }

  /**
   * 初始化状态管理框架注册表
   */
  initStateRegistry() {
    // 状态管理框架模式
    this.frameworkPatterns = {
      provider: {
        name: 'Provider',
        patterns: ['ChangeNotifier', 'Notifier', 'ChangeNotifierProvider', 'ListenableBuilder'],
        stateClass: ['ChangeNotifier', 'ValueNotifier'],
        commonMethods: ['notifyListeners', 'dispose', 'addListener'],
        commonFields: ['hasListeners'],
      },
      bloc: {
        name: 'Bloc',
        patterns: ['Bloc', 'BlocBase', 'BlocProvider', 'BlocBuilder', 'BlocListener'],
        stateClass: ['Bloc', 'Cubit'],
        commonMethods: ['emit', 'close', 'onChange'],
        commonFields: ['state', 'stream'],
      },
      cubit: {
        name: 'Cubit',
        patterns: ['Cubit', 'CubitProvider', 'BlocBuilder'],
        stateClass: ['Cubit'],
        commonMethods: ['emit', 'close'],
        commonFields: ['state', 'stream'],
      },
      getx: {
        name: 'GetX',
        patterns: ['GetxController', 'GetView', 'Obx', 'GetX', 'GetBuilder'],
        stateClass: ['GetxController'],
        commonMethods: ['update', 'onInit', 'onClose', 'onChange'],
        commonFields: ['rx', 'obs'],
      },
      riverpod: {
        name: 'Riverpod',
        patterns: ['StateNotifier', 'StateProvider', 'ConsumerWidget', 'ConsumerStatefulWidget', 'Ref', 'WidgetRef'],
        stateClass: ['StateNotifier', 'Notifier'],
        commonMethods: ['state', 'notifyListeners', 'read', 'watch'],
        commonFields: ['state'],
      },
      redux: {
        name: 'Redux',
        patterns: ['Store', 'Middleware', 'Reducer', 'StoreConnector', 'StoreProvider'],
        stateClass: ['Store'],
        commonMethods: ['dispatch', 'getState'],
        commonFields: ['state'],
      },
      mobx: {
        name: 'MobX',
        patterns: ['Observable', 'Computed', 'Action', 'Observer', 'MobXProvider'],
        stateClass: ['Observable'],
        commonMethods: ['runInAction'],
        commonFields: [],
      },
      setState: {
        name: 'setState',
        patterns: ['setState'],
        stateClass: ['State'],
        commonMethods: ['setState', 'initState', 'dispose'],
        commonFields: ['widget'],
      },
    };

    // 状态类命名模式
    this.stateNamingPatterns = {
      bloc: ['Bloc', 'Cubit'],
      event: ['Event', 'BlocEvent', 'CubitEvent'],
      state: ['State', 'BlocState'],
      provider: ['Provider', 'Notifier', 'Controller'],
      model: ['Model', 'Entity'],
    };
  }

  /**
   * 分析项目中的状态管理
   * @param {Array} files - Dart 文件列表
   * @returns {Object} 状态管理分析结果
   */
  analyzeStateManagement(files) {
    this.clearCache();
    this.initStateRegistry();

    // 1. 识别所有状态类
    this.identifyStates(files);

    // 2. 识别事件类
    this.identifyEvents(files);

    // 3. 分析状态转换
    this.analyzeStateTransitions(files);

    // 4. 分析状态依赖
    this.analyzeStateDependencies(files);

    // 5. 识别状态提供者
    this.identifyStateProviders(files);

    // 6. 识别状态消费者
    this.identifyStateConsumers(files);

    // 7. 生成统计信息
    const statistics = this.generateStatistics();

    return {
      states: Array.from(this.states.values()),
      events: this.getEventsList(),
      transitions: this.getTransitionsList(),
      providers: this.getProvidersList(),
      consumers: this.getConsumersList(),
      frameworkUsage: this.getFrameworkUsage(),
      statistics,
    };
  }

  /**
   * 识别所有状态类
   */
  identifyStates(files) {
    let stateId = 0;

    for (const file of files) {
      const content = file.content;
      const filePath = file.path;

      // 匹配类定义
      const classPattern = /class\s+(\w+)\s*(?:extends\s+(\w+)(?:<[^>]+>)?)?(?:\s+with\s+([\w\s<>,]+))?\s*\{/g;
      let match;

      while ((match = classPattern.exec(content)) !== null) {
        const className = match[1];
        const superClass = match[2] || null;
        const mixins = match[3] || null;

        const framework = this.identifyFramework(className, superClass, mixins, content);

        if (framework) {
          const line = this.getLineNumber(content, match.index);
          const classBody = this.extractClassBody(content, match.index);

          const state = {
            id: `st_${stateId++}`,
            name: className,
            superClass,
            mixins,
            framework,
            filePath,
            fileName: path.basename(filePath),
            line,
            body: classBody,
            stateType: this.classifyStateType(className, superClass),
            isStateClass: true,
            methods: this.extractStateMethods(content, className, classBody),
            fields: this.extractStateFields(classBody),
          };

          this.states.set(className, state);
        }
      }
    }
  }

  /**
   * 识别状态管理框架
   */
  identifyFramework(className, superClass, mixins, content) {
    const name = className.toLowerCase();
    const parent = superClass ? superClass.toLowerCase() : '';
    const mixin = mixins ? mixins.toLowerCase() : '';
    const contentLower = content.toLowerCase();

    // 只识别真正继承自状态管理框架的类
    // 纯数据类（State、Event 等）不应该被识别为框架

    // 1. 检查 Bloc/Cubit（通过父类）
    if (parent.includes('bloc<') || parent.includes('cubit<')) {
      return parent.includes('cubit') ? 'cubit' : 'bloc';
    }
    if (name.endsWith('bloc') && parent && parent.includes('bloc')) {
      return 'bloc';
    }
    if (name.endsWith('cubit') && parent && parent.includes('cubit')) {
      return 'cubit';
    }

    // 2. 检查 GetX（必须继承 GetxController 或有 .obs 字段）
    if (parent.includes('getxcontroller')) {
      return 'getx';
    }
    if (name.endsWith('controller') && contentLower.includes('.obs')) {
      return 'getx';
    }

    // 3. 检查 Provider（必须继承 ChangeNotifier 或 ValueNotifier）
    if (parent.includes('changenotifier')) {
      return 'provider';
    }
    if (parent.includes('valuenotifier')) {
      return 'provider';
    }
    if (name.endsWith('notifier') && parent && parent.includes('notifier')) {
      return 'provider';
    }

    // 4. 检查 Riverpod
    if (parent.includes('statenotifier')) {
      return 'riverpod';
    }

    // 5. 检查 setState
    if (parent.includes('state<') && name.endsWith('state')) {
      return 'setState';
    }

    // 通过特征方法进一步确认（仅当有明确的父类时）
    if (parent && parent.length > 0) {
      if (contentLower.includes('emit(') && (parent.includes('bloc') || parent.includes('cubit'))) {
        return parent.includes('cubit') ? 'cubit' : 'bloc';
      }
      if (contentLower.includes('notifylisteners()') && parent.includes('notifier')) {
        return 'provider';
      }
      if (contentLower.includes('update()') && parent.includes('controller')) {
        return 'getx';
      }
    }

    return null; // 不识别为状态管理框架
  }

  /**
   * 分类状态类型
   */
  classifyStateType(className, superClass) {
    const name = className.toLowerCase();
    const parent = superClass ? superClass.toLowerCase() : '';

    // Bloc 相关
    if (name.endsWith('bloc') || name.endsWith('cubit')) {
      return 'bloc';
    }
    if (parent.includes('bloc') || parent.includes('cubit')) {
      return 'bloc';
    }

    // Provider 相关
    if (name.endsWith('provider') || name.endsWith('notifier')) {
      return 'provider';
    }
    if (parent.includes('changenotifier') || parent.includes('statenotifier')) {
      return 'provider';
    }

    // GetX 相关
    if (name.endsWith('controller')) {
      return 'getx';
    }
    if (parent.includes('getxcontroller')) {
      return 'getx';
    }

    // Event 相关
    if (name.endsWith('event')) {
      return 'event';
    }

    // State 相关
    if (name.endsWith('state')) {
      return 'state';
    }

    // Model 相关
    if (name.endsWith('model') || name.endsWith('entity')) {
      return 'model';
    }

    return 'state_class';
  }

  /**
   * 提取状态方法
   */
  extractStateMethods(content, className, classBody) {
    const methods = [];

    // 提取方法定义
    const methodPattern = /(?:static|final)?\s*\w+\s+(?:<[^>]+>)?\s+(\w+)\s*\([^)]*\)\s*(?:async\*)?\s*(?:async)?\s*\{/g;
    let match;

    while ((match = methodPattern.exec(classBody)) !== null) {
      const methodName = match[1];

      // 跳过构造函数和私有方法（可选）
      if (methodName === className) continue;

      methods.push({
        name: methodName,
        isStateUpdater: this.isStateUpdater(methodName),
        isEvent: methodName.toLowerCase().startsWith('on'),
      });
    }

    return methods;
  }

  /**
   * 判断是否是状态更新方法
   */
  isStateUpdater(methodName) {
    const updatePatterns = [
      'set', 'update', 'add', 'remove', 'delete', 'clear',
      'change', 'toggle', 'increment', 'decrement',
      'emit', 'notify',
    ];

    const lower = methodName.toLowerCase();
    return updatePatterns.some(p => lower.includes(p));
  }

  /**
   * 提取状态字段
   */
  extractStateFields(classBody) {
    const fields = [];

    // 匹配字段定义
    const fieldPattern = /(?:final|late)\s+(\w+(?:<[^>]+>)?)\s+(?:_\s*)?(\w+)\s*(?:=)?\s*([^;]+);?/g;
    let match;

    while ((match = fieldPattern.exec(classBody)) !== null) {
      const fieldType = match[1];
      const fieldName = match[2];

      // 检查是否是响应式字段
      const isObservable = fieldType.toLowerCase().includes('observable') ||
                          fieldName.toLowerCase().startsWith('_') === false;

      fields.push({
        name: fieldName,
        type: fieldType,
        isObservable,
        isPrivate: fieldName.startsWith('_'),
      });
    }

    return fields;
  }

  /**
   * 识别事件类
   */
  identifyEvents(files) {
    let eventId = 0;

    for (const file of files) {
      const content = file.content;

      // 匹配抽象类或继承自 Event 的类
      const classPattern = /(?:abstract\s+)?class\s+(\w+)\s+(?:extends\s+(\w+)?\s+)?(?:implements\s+([\w\s<>,]+))?\s*\{/g;
      let match;

      while ((match = classPattern.exec(content)) !== null) {
        const className = match[1];
        const superClass = match[2] || null;

        // 检查是否是事件类
        if (this.isEventClass(className, superClass, content)) {
          const line = this.getLineNumber(content, match.index);
          const classBody = this.extractClassBody(content, match.index);

          const event = {
            id: `evt_${eventId++}`,
            name: className,
            superClass,
            filePath: file.path,
            fileName: path.basename(file.path),
            line,
            body: classBody,
            fields: this.extractEventFields(classBody),
          };

          this.events.set(className, event);
        }
      }
    }
  }

  /**
   * 判断是否是事件类
   */
  isEventClass(className, superClass, content) {
    const name = className.toLowerCase();

    // 检查命名模式
    if (name.endsWith('event') || name.endsWith('bloc_event')) {
      return true;
    }

    // 检查父类
    if (superClass) {
      const parent = superClass.toLowerCase();
      if (parent.endsWith('event')) {
        return true;
      }
    }

    return false;
  }

  /**
   * 提取事件字段
   */
  extractEventFields(classBody) {
    const fields = [];
    const fieldPattern = /final\s+(\w+(?:<[^>]+>)?)\s+(\w+)\s*;/g;
    let match;

    while ((match = fieldPattern.exec(classBody)) !== null) {
      fields.push({
        type: match[1],
        name: match[2],
      });
    }

    return fields;
  }

  /**
   * 分析状态转换
   */
  analyzeStateTransitions(files) {
    for (const [stateName, state] of this.states) {
      const transitions = this.extractTransitions(state);
      this.stateTransitions.set(stateName, transitions);
    }
  }

  /**
   * 提取状态转换
   */
  extractTransitions(state) {
    const transitions = [];
    const body = state.body;

    // 对于 Bloc/Cubit，查找 emit 调用
    if (state.framework === 'bloc' || state.framework === 'cubit') {
      const emitPattern = /emit\s*\(\s*(\w+)/g;
      let match;

      while ((match = emitPattern.exec(body)) !== null) {
        const targetState = match[1];
        transitions.push({
          type: 'emit',
          targetState,
          method: this.findContainingMethod(body, match.index),
        });
      }
    }

    // 对于 Provider，查找 notifyListeners 调用
    if (state.framework === 'provider') {
      const notifyPattern = /notifyListeners\s*\(\s*\)/g;
      let match;
      let count = 0;

      while ((match = notifyPattern.exec(body)) !== null) {
        count++;
      }

      if (count > 0) {
        transitions.push({
          type: 'notify',
          count,
        });
      }
    }

    // 对于 GetX，查找 update 调用
    if (state.framework === 'getx') {
      const updatePattern = /update\s*\(\s*(?:\[([^\]]*)\])?\s*\)/g;
      let match;
      let count = 0;

      while ((match = updatePattern.exec(body)) !== null) {
        count++;
      }

      if (count > 0) {
        transitions.push({
          type: 'update',
          count,
        });
      }
    }

    return transitions;
  }

  /**
   * 查找包含某个位置的方法名
   */
  findContainingMethod(body, position) {
    // 简化实现：查找位置前面的方法定义
    const before = body.substring(0, position);
    const methodMatch = before.match(/(\w+)\s*\([^)]*\)\s*(?:async\s*)?\{[^}]*$/);
    return methodMatch ? methodMatch[1] : 'unknown';
  }

  /**
   * 分析状态依赖
   */
  analyzeStateDependencies(files) {
    for (const [stateName, state] of this.states) {
      const dependencies = this.extractStateDependencies(state);
      if (dependencies.length > 0) {
        this.stateDependencies.set(stateName, dependencies);
      }
    }
  }

  /**
   * 提取状态依赖
   */
  extractStateDependencies(state) {
    const dependencies = [];
    const body = state.body;

    // 查找对其他状态的引用
    for (const [otherStateName, otherState] of this.states) {
      if (otherStateName === state.name) continue;

      // 检查字段引用
      if (body.includes(otherStateName)) {
        dependencies.push({
          state: otherStateName,
          type: 'reference',
        });
      }
    }

    return dependencies;
  }

  /**
   * 识别状态提供者
   */
  identifyStateProviders(files) {
    for (const file of files) {
      const content = file.content;
      const fileName = path.basename(file.path);

      // 查找 Provider 定义
      for (const [framework, config] of Object.entries(this.frameworkPatterns)) {
        for (const pattern of config.patterns) {
          const providerPattern = new RegExp(`${pattern}\\s*<\\s*([^>]+)\\s*>`, 'g');
          let match;

          while ((match = providerPattern.exec(content)) !== null) {
            const stateType = match[1];
            const line = this.getLineNumber(content, match.index);

            if (!this.stateProviders.has(fileName)) {
              this.stateProviders.set(fileName, []);
            }

            this.stateProviders.get(fileName).push({
              framework,
              providerType: pattern,
              stateType,
              line,
            });
          }
        }
      }
    }
  }

  /**
   * 识别状态消费者
   */
  identifyStateConsumers(files) {
    for (const file of files) {
      const content = file.content;
      const fileName = path.basename(file.path);

      // 查找 Consumer/BlocBuilder 等
      for (const [framework, config] of Object.entries(this.frameworkPatterns)) {
        for (const pattern of config.patterns) {
          if (!pattern.includes('Provider') && pattern !== pattern.toLowerCase()) {
            const consumerPattern = new RegExp(`${pattern}\\s*<\\s*([^>]+)\\s*>`, 'g');
            let match;

            while ((match = consumerPattern.exec(content)) !== null) {
              const stateType = match[1];
              const line = this.getLineNumber(content, match.index);

              if (!this.stateConsumers.has(fileName)) {
                this.stateConsumers.set(fileName, []);
              }

              this.stateConsumers.get(fileName).push({
                framework,
                consumerType: pattern,
                stateType,
                line,
              });
            }
          }
        }
      }
    }
  }

  /**
   * 生成统计信息
   */
  generateStatistics() {
    const stats = {
      totalStates: this.states.size,
      totalEvents: this.events.size,
      totalTransitions: 0,
      byFramework: {},
      byStateType: {},
      avgMethodsPerState: 0,
      avgFieldsPerState: 0,
    };

    let totalMethods = 0;
    let totalFields = 0;

    for (const state of this.states.values()) {
      // 按框架统计
      stats.byFramework[state.framework] = (stats.byFramework[state.framework] || 0) + 1;

      // 按状态类型统计
      stats.byStateType[state.stateType] = (stats.byStateType[state.stateType] || 0) + 1;

      totalMethods += state.methods.length;
      totalFields += state.fields.length;
    }

    // 统计转换数
    for (const transitions of this.stateTransitions.values()) {
      stats.totalTransitions += transitions.length;
    }

    stats.avgMethodsPerState = this.states.size > 0
      ? Math.round(totalMethods / this.states.size)
      : 0;
    stats.avgFieldsPerState = this.states.size > 0
      ? Math.round(totalFields / this.states.size)
      : 0;

    return stats;
  }

  /**
   * 获取事件列表
   */
  getEventsList() {
    return Array.from(this.events.values());
  }

  /**
   * 获取转换列表
   */
  getTransitionsList() {
    const list = [];

    for (const [stateName, transitions] of this.stateTransitions) {
      for (const transition of transitions) {
        list.push({
          state: stateName,
          ...transition,
        });
      }
    }

    return list;
  }

  /**
   * 获取提供者列表
   */
  getProvidersList() {
    const list = [];

    for (const [fileName, providers] of this.stateProviders) {
      for (const provider of providers) {
        list.push({
          file: fileName,
          ...provider,
        });
      }
    }

    return list;
  }

  /**
   * 获取消费者列表
   */
  getConsumersList() {
    const list = [];

    for (const [fileName, consumers] of this.stateConsumers) {
      for (const consumer of consumers) {
        list.push({
          file: fileName,
          ...consumer,
        });
      }
    }

    return list;
  }

  /**
   * 获取框架使用情况
   */
  getFrameworkUsage() {
    const usage = {};

    for (const state of this.states.values()) {
      const framework = this.frameworkPatterns[state.framework];
      if (framework) {
        if (!usage[state.framework]) {
          usage[state.framework] = {
            name: framework.name,
            count: 0,
            states: [],
          };
        }
        usage[state.framework].count++;
        usage[state.framework].states.push(state.name);
      }
    }

    return usage;
  }

  /**
   * 生成 Mermaid 格式的状态转换图
   */
  toMermaid() {
    const lines = ['graph TD'];

    // 添加状态节点
    for (const [name, state] of this.states) {
      let label = name;
      let style = '';

      // 根据框架设置样式
      switch (state.framework) {
        case 'bloc':
        case 'cubit':
          style = ':::bloc';
          break;
        case 'provider':
          style = ':::provider';
          break;
        case 'getx':
          style = ':::getx';
          break;
        case 'riverpod':
          style = ':::riverpod';
          break;
        case 'redux':
          style = ':::redux';
          break;
        default:
          style = ':::default';
      }

      lines.push(`  "${name}"[${label}]${style}`);
    }

    // 添加事件节点
    for (const [name, event] of this.events) {
      lines.push(`  "${name}"[${name}]:::event`);
    }

    // 添加状态转换边
    for (const [stateName, transitions] of this.stateTransitions) {
      for (const transition of transitions) {
        if (transition.type === 'emit' && transition.targetState) {
          lines.push(`  "${stateName}" -->|"${transition.method}"| "${transition.targetState}"`);
        }
      }
    }

    // 添加样式定义
    lines.push('');
    lines.push('classDef bloc fill:#e6f7ff,stroke:#1890ff,stroke-width:2px');
    lines.push('classDef provider fill:#f6ffed,stroke:#52c41a,stroke-width:2px');
    lines.push('classDef getx fill:#fff7e6,stroke:#fa8c16,stroke-width:2px');
    lines.push('classDef riverpod fill:#f9f0ff,stroke:#722ed1,stroke-width:2px');
    lines.push('classDef redux fill:#fff1f0,stroke:#f5222d,stroke-width:2px');
    lines.push('classDef event fill:#f0f0f0,stroke:#999,stroke-width:1px,stroke-dasharray: 5 5');
    lines.push('classDef default fill:#f0f0f0,stroke:#999,stroke-width:1px');

    return lines.join('\n');
  }

  /**
   * 提取类体
   */
  extractClassBody(content, startPos) {
    let braceCount = 0;
    let foundStart = false;
    let endPos = startPos;
    let firstBrace = -1;

    for (let i = startPos; i < content.length; i++) {
      if (content[i] === '{') {
        if (firstBrace === -1) {
          firstBrace = i; // 找到第一个 {
        }
        foundStart = true;
        braceCount++;
      } else if (content[i] === '}') {
        braceCount--;
        if (braceCount === 0 && foundStart) {
          endPos = i + 1;
          break;
        }
      }
    }

    // 从第一个 { 开始提取
    const start = firstBrace >= 0 ? firstBrace + 1 : startPos;
    return content.substring(start, endPos);
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
    this.states.clear();
    this.events.clear();
    this.stateTransitions.clear();
    this.stateDependencies.clear();
    this.stateProviders.clear();
    this.stateConsumers.clear();
  }
}

module.exports = FlutterStateAnalyzer;
