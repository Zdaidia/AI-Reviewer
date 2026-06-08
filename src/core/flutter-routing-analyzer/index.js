/**
 * Flutter Routing Analyzer
 *
 * 职责:
 * - 提取路由定义和配置
 * - 分析 Route → Page 映射关系
 * - 追踪路由导航调用
 * - 识别导航模式
 * - 检测路由参数传递
 * - 分析路由守卫和中间件
 *
 * 支持的路由方式:
 * - MaterialApp (routes, onGenerateRoute, onUnknownRoute)
 * - CupertinoPageRoute
 * - Navigator.push/pop
 * - GoRouter
 * - AutoRoute
 * - GetX 路由
 * - 命名路由
 * - 动态路由
 */

const path = require('path');

class FlutterRoutingAnalyzer {
  constructor() {
    this.routes = new Map(); // 路由定义
    this.routePageMapping = new Map(); // Route → Page 映射
    this.navigationCalls = new Map(); // 导航调用
    this.routeGuards = new Map(); // 路由守卫
    this.navigationPatterns = new Map(); // 导航模式
    this.routeParameters = new Map(); // 路由参数
  }

  /**
   * 分析路由层
   * @param {Array} files - Dart 文件列表
   * @returns {Object} 路由层分析结果
   */
  analyzeRouting(files) {
    this.clearCache();

    // 1. 提取路由定义
    this.extractRouteDefinitions(files);

    // 2. 分析 Route → Page 映射
    this.analyzeRoutePageMapping(files);

    // 3. 追踪导航调用
    this.trackNavigationCalls(files);

    // 4. 识别导航模式
    this.identifyNavigationPatterns(files);

    // 5. 分析路由参数
    this.analyzeRouteParameters(files);

    // 6. 检测路由守卫
    this.detectRouteGuards(files);

    // 7. 生成统计信息
    const statistics = this.generateStatistics();

    // 8. 生成路由图
    const routeGraph = this.generateRouteGraph();

    // 9. 健康检查
    const healthCheck = this.performHealthCheck();

    return {
      routes: this.getRoutesList(),
      mappings: this.getMappingList(),
      navigations: this.getNavigationsList(),
      patterns: this.getPatternsList(),
      guards: this.getGuardsList(),
      parameters: this.getParametersList(),
      statistics,
      routeGraph,
      healthCheck,
    };
  }

  /**
   * 清除缓存
   */
  clearCache() {
    this.routes.clear();
    this.routePageMapping.clear();
    this.navigationCalls.clear();
    this.routeGuards.clear();
    this.navigationPatterns.clear();
    this.routeParameters.clear();
  }

  /**
   * 提取路由定义
   */
  extractRouteDefinitions(files) {
    for (const file of files) {
      const content = file.content;
      const filePath = file.path;
      const fileName = path.basename(filePath);

      // 查找 MaterialApp 配置
      this.findMaterialAppRoutes(content, fileName, filePath);

      // 查找 CupertinoApp 配置
      this.findCupertinoAppRoutes(content, fileName, filePath);

      // 查找 GoRouter 配置
      this.findGoRouterRoutes(content, fileName, filePath);

      // 查找 AutoRoute 配置
      this.findAutoRouteAnnotations(content, fileName, filePath);

      // 查找 GetX 路由
      this.findGetXRoutes(content, fileName, filePath);

      // 查找自定义路由类
      this.findCustomRouteClasses(content, fileName, filePath);
    }
  }

  /**
   * 查找 MaterialApp 路由配置
   */
  findMaterialAppRoutes(content, fileName, filePath) {
    // 匹配 MaterialApp(routes: { ... })
    const routesPattern = /MaterialApp\s*\([^)]*routes\s*:\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/g;
    let match;
    let iterations = 0;
    const MAX_ITERATIONS = 1000;

    while ((match = routesPattern.exec(content)) !== null && iterations < MAX_ITERATIONS) {
      iterations++;
      const routesBody = match[1];
      const line = this.getLineNumber(content, match.index);

      // 提取路由条目
      this.extractRouteEntries(routesBody, fileName, filePath, line, 'material');
    }

    // 查找 onGenerateRoute
    const onGeneratePattern = /onGenerateRoute\s*:\s*(\w+)/g;
    iterations = 0;
    while ((match = onGeneratePattern.exec(content)) !== null && iterations < MAX_ITERATIONS) {
      iterations++;
      const methodName = match[1];
      const line = this.getLineNumber(content, match.index);

      this.routes.set(`${fileName}:onGenerateRoute`, {
        type: 'dynamic_route_generator',
        methodName,
        fileName,
        filePath,
        line,
      });
    }

    // 查找 onUnknownRoute
    const onUnknownPattern = /onUnknownRoute\s*:\s*(\w+)/g;
    iterations = 0;
    while ((match = onUnknownPattern.exec(content)) !== null && iterations < MAX_ITERATIONS) {
      iterations++;
      const methodName = match[1];
      const line = this.getLineNumber(content, match.index);

      this.routes.set(`${fileName}:onUnknownRoute`, {
        type: 'unknown_route_handler',
        methodName,
        fileName,
        filePath,
        line,
      });
    }

    // 查找 initialRoute
    const initialRoutePattern = /initialRoute\s*:\s*['"`]([^'"`]+)['"`]/g;
    iterations = 0;
    while ((match = initialRoutePattern.exec(content)) !== null && iterations < MAX_ITERATIONS) {
      iterations++;
      const route = match[1];
      const line = this.getLineNumber(content, match.index);

      this.routes.set(`${fileName}:initialRoute`, {
        type: 'initial_route',
        route,
        fileName,
        filePath,
        line,
      });
    }
  }

  /**
   * 提取路由条目
   */
  extractRouteEntries(routesBody, fileName, filePath, line, routeType) {
    // 匹配 '/route': (context) => Widget() 或 '/route': (context) => return Widget()
    const entryPattern = /['"`]([^'"`]+)['"`]\s*:\s*(?:\(\s*\w+\s*\)\s*=>?\s*)?\{?/g;
    let match;

    while ((match = entryPattern.exec(routesBody)) !== null) {
      const routePath = match[1];

      // 尝试查找对应的 Widget
      const afterRoute = routesBody.substring(match.index + match[0].length);
      const widgetMatch = this.extractWidgetFromRoute(afterRoute);

      const route = {
        type: 'named_route',
        routeType,
        path: routePath,
        fileName,
        filePath,
        line,
        parameters: this.extractPathParameters(routePath),
        widget: widgetMatch ? widgetMatch.widgetName : null,
        isAsync: widgetMatch ? widgetMatch.isAsync : false,
      };

      this.routes.set(`${fileName}:${line}:${routePath}`, route);
    }
  }

  /**
   * 从路由内容中提取 Widget
   */
  extractWidgetFromRoute(content) {
    // 匹配各种 Widget 创建模式
    const patterns = [
      // return WidgetName(...)
      /return\s+(\w+(?:<[^>]+>)?)\s*\(/,
      // new WidgetName(...)
      /new\s+(\w+(?:<[^>]+>)?)\s*\(/,
      // WidgetName(...); 或 WidgetName();
      /(\w+(?:<[^>]+>)?)\s*\([^)]*\)\s*(?:;|,)/,
      // 直接的 Widget 名称后跟 (
      /(\w+(?:<[^>]+>)?)\s*\(/,
    ];

    for (const pattern of patterns) {
      const match = pattern.exec(content);
      if (match) {
        const widgetName = match[1];
        // 过滤掉非 Widget 的关键字
        if (this.isWidgetClass(widgetName)) {
          return {
            widgetName,
            isAsync: content.includes('await'),
          };
        }
      }
    }

    return null;
  }

  /**
   * 判断是否是 Widget 类
   */
  isWidgetClass(name) {
    const nonWidgets = new Set([
      'if', 'else', 'for', 'while', 'switch', 'return', 'await',
      'print', 'debugPrint', 'showDialog', 'Navigator',
      'ScaffoldMessenger', 'Theme', 'MediaQuery', 'setState',
      'bool', 'int', 'double', 'String', 'List', 'Map', 'Set',
    ]);

    return !nonWidgets.has(name) &&
           !name.startsWith('_') &&
           name[0] === name[0].toUpperCase();
  }

  /**
   * 提取路径参数
   */
  extractPathParameters(routePath) {
    const params = [];

    // 匹配 :param, {param}, ${param} 格式
    const patterns = [
      /:([a-zA-Z_]\w*)/g,
      /\{([a-zA-Z_]\w*)\}/g,
      /\$\{([a-zA-Z_]\w*)\}/g,
    ];

    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(routePath)) !== null) {
        if (!params.includes(match[1])) {
          params.push(match[1]);
        }
      }
    }

    return params;
  }

  /**
   * 查找 CupertinoApp 路由配置
   */
  findCupertinoAppRoutes(content, fileName, filePath) {
    // CupertinoApp 使用类似的路由配置
    const routesPattern = /CupertinoApp\s*\([^)]*routes\s*:\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/g;
    let match;

    while ((match = routesPattern.exec(content)) !== null) {
      const routesBody = match[1];
      const line = this.getLineNumber(content, match.index);

      this.extractRouteEntries(routesBody, fileName, filePath, line, 'cupertino');
    }
  }

  /**
   * 查找 GoRouter 配置
   */
  findGoRouterRoutes(content, fileName, filePath) {
    // 匹配 GoRouter(routes: [...])
    const goRouterPattern = /GoRouter\s*\(\s*[^)]*routes\s*:\s*\[([^\]]*(?:\{[^}]*\}[^\]]*)*)\]/g;
    let match;

    while ((match = goRouterPattern.exec(content)) !== null) {
      const routesBody = match[1];
      const line = this.getLineNumber(content, match.index);

      // 提取 GoRoute 定义
      this.extractGoRoutes(routesBody, fileName, filePath, line);
    }
  }

  /**
   * 提取 GoRoute 定义
   */
  extractGoRoutes(routesBody, fileName, filePath, line) {
    // 匹配 GoRoute(path: '...', ...)
    const goRoutePattern = /GoRoute\s*\(\s*path\s*:\s*['"`]([^'"`]+)['"`]/g;
    let match;

    while ((match = goRoutePattern.exec(routesBody)) !== null) {
      const routePath = match[1];

      // 查找对应的 builder 或 pageBuilder
      const afterMatch = routesBody.substring(match.index + match[0].length);
      const endOfRoute = this.findEndOfGoRoute(afterMatch);
      const routeContent = afterMatch.substring(0, endOfRoute);

      const widgetMatch = routeContent.match(/builder\s*:\s*\([^)]*\)\s*=>?\s*(\w+)/);
      const pageWidgetMatch = routeContent.match(/pageBuilder\s*:\s*\([^)]*\)\s*=>?\s*(\w+)/);

      const route = {
        type: 'go_route',
        path: routePath,
        fileName,
        filePath,
        line,
        parameters: this.extractPathParameters(routePath),
        widget: widgetMatch ? widgetMatch[1] : pageWidgetMatch ? pageWidgetMatch[1] : null,
        routerType: 'go_router',
      };

      this.routes.set(`${fileName}:${line}:${routePath}`, route);

      // 检查子路由
      const routesMatch = routeContent.match(/routes\s*:\s*\[/);
      if (routesMatch) {
        const routesStart = routesMatch.index + routesMatch[0].length;
        const routesContent = routeContent.substring(routesStart);
        const childRoutes = this.extractGoRoutes(routesContent, fileName, filePath, line);
      }
    }
  }

  /**
   * 查找 GoRoute 定义的结束位置
   */
  findEndOfGoRoute(content) {
    let count = 0;
    for (let i = 0; i < content.length; i++) {
      if (content[i] === '(') count++;
      else if (content[i] === ')') {
        count--;
        if (count === 0) return i;
      }
    }
    return content.length;
  }

  /**
   * 查找 AutoRoute 注解
   */
  findAutoRouteAnnotations(content, fileName, filePath) {
    // 匹配 @AutoRoute(...) 或 @Route(...)
    const autoRoutePattern = /@(?:AutoRoute|Route)\s*\(([^)]*)\)/g;
    let match;

    while ((match = autoRoutePattern.exec(content)) !== null) {
      const annotation = match[1];
      const line = this.getLineNumber(content, match.index);

      // 提取 path 参数
      const pathMatch = annotation.match(/path\s*:\s*['"`]([^'"`]+)['"`]/);
      const path = pathMatch ? pathMatch[1] : '';

      // 查找对应的类名
      const afterAnnotation = content.substring(match.index + match[0].length);
      const classMatch = afterAnnotation.match(/class\s+(\w+)/);

      const route = {
        type: 'auto_route',
        path,
        fileName,
        filePath,
        line,
        parameters: this.extractPathParameters(path),
        widget: classMatch ? classMatch[1] : null,
        routerType: 'auto_route',
      };

      this.routes.set(`${fileName}:${line}:${path}`, route);
    }
  }

  /**
   * 查找 GetX 路由
   */
  findGetXRoutes(content, fileName, filePath) {
    // 匹配 GetPage(...)
    const getPageRoute = /GetPage\s*\(\s*name\s*:\s*['"`]([^'"`]+)['"`]/g;
    let match;

    while ((match = getPageRoute.exec(content)) !== null) {
      const routePath = match[1];
      const line = this.getLineNumber(content, match.index);

      // 查找 page 参数
      const afterMatch = content.substring(match.index + match[0].length);
      const pageMatch = afterMatch.match(/page\s*:\s*(\w+)/);

      const route = {
        type: 'getx_route',
        path: routePath,
        fileName,
        filePath,
        line,
        parameters: this.extractPathParameters(routePath),
        widget: pageMatch ? pageMatch[1] : null,
        routerType: 'getx',
      };

      this.routes.set(`${fileName}:${line}:${routePath}`, route);
    }
  }

  /**
   * 查找自定义路由类
   */
  findCustomRouteClasses(content, fileName, filePath) {
    // 匹配 class *Route 或 class *Router
    const classPattern = /class\s+(\w*(?:Route|Router|Routes)\w*)\s*(?:extends\s+\w+)?\s*\{/g;
    let match;

    while ((match = classPattern.exec(content)) !== null) {
      const className = match[1];
      const line = this.getLineNumber(content, match.index);

      // 检查是否有路由相关的字段
      const classEnd = this.findMatchingBrace(content, match.index + match[0].length - 1);
      if (!classEnd) continue;

      const classBody = content.substring(match.index + match[0].length, classEnd);

      // 检查是否包含路由定义
      if (classBody.includes('Map<String') || classBody.includes('Route')) {
        this.routes.set(`${fileName}:${line}:${className}`, {
          type: 'custom_router_class',
          className,
          fileName,
          filePath,
          line,
          hasRoutesMap: classBody.includes('routes') || classBody.includes('Routes'),
        });
      }
    }
  }

  /**
   * 分析 Route → Page 映射
   */
  analyzeRoutePageMapping(files) {
    for (const [key, route] of this.routes) {
      const mapping = {
        route: route.path || route.route,
        page: route.widget || route.className,
        routeType: route.type,
        parameters: route.parameters,
        fileName: route.fileName,
        line: route.line,
        isDirect: !!route.widget,
      };

      // 如果 Widget 未直接指定，尝试从其他文件推断
      if (!mapping.page && route.path) {
        mapping.page = this.inferPageFromRoute(route.path, files);
      }

      this.routePageMapping.set(key, mapping);
    }
  }

  /**
   * 从路由路径推断页面
   */
  inferPageFromRoute(routePath, files) {
    // 提取路径的最后部分
    const parts = routePath.split('/').filter(p => p && !p.startsWith(':'));
    if (parts.length === 0) return null;

    const lastPart = parts[parts.length - 1];

    // 尝试构建可能的页面名称
    const possibleNames = [
      `${this.capitalize(lastPart)}Page`,
      `${this.capitalize(lastPart)}Screen`,
      `${this.capitalize(lastPart)}View`,
      `${this.capitalize(lastPart)}`,
    ];

    // 这里可以扩展为在其他文件中搜索这些名称
    return possibleNames[0]; // 返回第一个可能的名字
  }

  /**
   * 首字母大写
   */
  capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * 追踪导航调用
   */
  trackNavigationCalls(files) {
    for (const file of files) {
      const content = file.content;
      const fileName = path.basename(file.path);

      // 查找 Navigator.push 调用
      this.findNavigatorPushCalls(content, fileName);

      // 查找 Navigator.pop 调用
      this.findNavigatorPopCalls(content, fileName);

      // 查找 pushNamed 调用
      this.findPushNamedCalls(content, fileName);

      // 查找 popUntil 调用
      this.findPopUntilCalls(content, fileName);

      // 查找 GoRouter 导航
      this.findGoRouterNavigation(content, fileName);

      // 查找 GetX 导航
      this.findGetXNavigation(content, fileName);
    }
  }

  /**
   * 查找 Navigator.push 调用
   */
  findNavigatorPushCalls(content, fileName) {
    // 匹配 Navigator.push(...) 或 Navigator.pushReplacementNamed(...)
    const patterns = [
      /Navigator\.push\s*\(/g,
      /Navigator\.pushReplacement\s*\(/g,
      /Navigator\.pushAndRemoveUntil\s*\(/g,
      /Navigator\.pushNamed\s*\(/g,
      /Navigator\.pushReplacementNamed\s*\(/g,
      /Navigator\.pushNamedAndRemoveUntil\s*\(/g,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const callType = pattern.source.split('.')[1].split('\\s')[0];
        const line = this.getLineNumber(content, match.index);

        // 提取目标页面
        const target = this.extractNavigationTarget(content, match.index);

        const navigation = {
          type: 'navigator_push',
          method: callType,
          target,
          fileName,
          line,
        };

        this.navigationCalls.set(`${fileName}:${line}:${callType}`, navigation);
      }
    }
  }

  /**
   * 查找 Navigator.pop 调用
   */
  findNavigatorPopCalls(content, fileName) {
    const patterns = [
      /Navigator\.pop\s*\(/g,
      /Navigator\.maybePop\s*\(/g,
      /Navigator\.popUntil\s*\(/g,
      /Navigator\.canPop\s*\(/g,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const callType = pattern.source.split('.')[1].split('\\s')[0];
        const line = this.getLineNumber(content, match.index);

        const navigation = {
          type: 'navigator_pop',
          method: callType,
          target: null, // pop 没有明确目标
          fileName,
          line,
        };

        this.navigationCalls.set(`${fileName}:${line}:${callType}`, navigation);
      }
    }
  }

  /**
   * 查找 pushNamed 调用
   */
  findPushNamedCalls(content, fileName) {
    const patterns = [
      /pushNamed\s*\(/g,
      /pushReplacementNamed\s*\(/g,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const line = this.getLineNumber(content, match.index);

        // 提取路由名称
        const routeMatch = content.substring(match.index).match(/['"`]([^'"`]+)['"`]/);
        const route = routeMatch ? routeMatch[1] : null;

        const navigation = {
          type: 'named_navigation',
          method: pattern.source.replace('\\s*', ''),
          target: route,
          fileName,
          line,
        };

        this.navigationCalls.set(`${fileName}:${line}:${route}`, navigation);
      }
    }
  }

  /**
   * 查找 popUntil 调用
   */
  findPopUntilCalls(content, fileName) {
    const pattern = /popUntil\s*\(/g;
    let match;

    while ((match = pattern.exec(content)) !== null) {
      const line = this.getLineNumber(content, match.index);

      // 提取路由条件
      const afterMatch = content.substring(match.index + match[0].length);
      const routeMatch = afterMatch.match(/ModalRoute\.withName\s*\(\s*['"`]([^'"`]+)['"`]/);
      const route = routeMatch ? routeMatch[1] : null;

      const navigation = {
        type: 'pop_until',
        method: 'popUntil',
        target: route,
        fileName,
        line,
      };

      this.navigationCalls.set(`${fileName}:${line}:popUntil`, navigation);
    }
  }

  /**
   * 查找 GoRouter 导航
   */
  findGoRouterNavigation(content, fileName) {
    // 匹配 context.go(...)
    const pattern = /context\.go\s*\(/g;
    let match;

    while ((match = pattern.exec(content)) !== null) {
      const line = this.getLineNumber(content, match.index);

      // 提取路由路径
      const routeMatch = content.substring(match.index).match(/['"`]([^'"`]+)['"`]/);
      const route = routeMatch ? routeMatch[1] : null;

      const navigation = {
        type: 'go_router_navigation',
        method: 'go',
        target: route,
        fileName,
        line,
      };

      this.navigationCalls.set(`${fileName}:${line}:go`, navigation);
    }
  }

  /**
   * 查找 GetX 导航
   */
  findGetXNavigation(content, fileName) {
    // 匹配 Get.toNamed(...), Get.offAllNamed(...), Get.back()
    const patterns = [
      /Get\.toNamed\s*\(/g,
      /Get\.to\s*\(/g,
      /Get\.offAllNamed\s*\(/g,
      /Get\.offAll\s*\(/g,
      /Get\.back\s*\(/g,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const callType = pattern.source.split('\\s*')[1];
        const line = this.getLineNumber(content, match.index);

        // 提取路由名称
        const routeMatch = content.substring(match.index).match(/['"`]([^'"`]+)['"`]/);
        const route = routeMatch ? routeMatch[1] : null;

        const navigation = {
          type: 'getx_navigation',
          method: callType,
          target: route,
          fileName,
          line,
        };

        this.navigationCalls.set(`${fileName}:${line}:${callType}`, navigation);
      }
    }
  }

  /**
   * 提取导航目标
   */
  extractNavigationTarget(content, startIndex) {
    const afterStart = content.substring(startIndex);

    // 查找 MaterialPageRoute
    const materialMatch = afterStart.match(/MaterialPageRoute\s*\(\s*builder\s*:\s*\([^)]*\)\s*=>?\s*(\w+)/);
    if (materialMatch) {
      return materialMatch[1];
    }

    // 查找 CupertinoPageRoute
    const cupertinoMatch = afterStart.match(/CupertinoPageRoute\s*\(\s*builder\s*:\s*\([^)]*\)\s*=>?\s*(\w+)/);
    if (cupertinoMatch) {
      return cupertinoMatch[1];
    }

    // 查找直接的路由名称字符串
    const routeMatch = afterStart.match(/['"`]([^'"`]+)['"`]/);
    if (routeMatch) {
      return routeMatch[1];
    }

    return null;
  }

  /**
   * 识别导航模式
   */
  identifyNavigationPatterns(files) {
    const patterns = {
      listToDetail: 0,
      masterDetail: 0,
      tabs: 0,
      drawer: 0,
      bottomNav: 0,
      nested: 0,
      modal: 0,
      dialog: 0,
    };

    // 统计导航模式
    for (const [key, nav] of this.navigationCalls) {
      if (nav.method === 'push' || nav.method === 'pushNamed') {
        // 推测模式
        if (nav.target && nav.target.includes('detail')) {
          patterns.listToDetail++;
        } else if (nav.target && nav.target.includes('tab')) {
          patterns.tabs++;
        } else if (nav.type === 'named_navigation') {
          patterns.modal++;
        }
      } else if (nav.method === 'pop') {
        // 返回操作
        continue;
      }
    }

    // 分析文件内容识别更复杂的模式
    for (const file of files) {
      const content = file.content;

      // 检查是否有 Drawer
      if (content.includes('Drawer(')) {
        patterns.drawer++;
      }

      // 检查是否有 BottomNavigationBar
      if (content.includes('BottomNavigationBar(')) {
        patterns.bottomNav++;
      }

      // 检查是否有 TabBar/TabController
      if (content.includes('TabBar(') || content.includes('TabController')) {
        patterns.tabs++;
      }

      // 检查是否有 Navigator 嵌套
      const navigatorCount = (content.match(/Navigator\s*\(/g) || []).length;
      if (navigatorCount > 1) {
        patterns.nested++;
      }
    }

    for (const [pattern, count] of Object.entries(patterns)) {
      if (count > 0) {
        this.navigationPatterns.set(pattern, { name: pattern, count });
      }
    }
  }

  /**
   * 分析路由参数
   */
  analyzeRouteParameters(files) {
    for (const [key, nav] of this.navigationCalls) {
      if (!nav.target) continue;

      // 查找参数传递
      const file = files.find(f => f.fileName === nav.fileName);
      if (!file) continue;

      const content = file.content;

      // 查找 arguments 传递
      const argsMatch = this.findArgumentsInCall(content, nav.line);
      if (argsMatch) {
        this.routeParameters.set(key, {
          route: nav.target,
          parameters: argsMatch,
          fileName: nav.fileName,
          line: nav.line,
        });
      }
    }
  }

  /**
   * 在调用中查找参数
   */
  findArgumentsInCall(content, line) {
    // 简化实现：查找附近的 arguments 参数
    const lines = content.split('\n');
    const callLineIndex = line - 1;

    // 检查前后几行
    const start = Math.max(0, callLineIndex - 2);
    const end = Math.min(lines.length, callLineIndex + 5);
    const contextLines = lines.slice(start, end).join('\n');

    // 匹配 arguments: { ... }
    const argsMatch = contextLines.match(/arguments\s*:\s*\{([^}]+)\}/);
    if (argsMatch) {
      return this.parseArguments(argsMatch[1]);
    }

    return null;
  }

  /**
   * 解析参数
   */
  parseArguments(argsStr) {
    const params = [];

    // 匹配 key: value
    const pattern = /(\w+)\s*:\s*([^,\n]+)/g;
    let match;

    while ((match = pattern.exec(argsStr)) !== null) {
      params.push({
        name: match[1],
        value: match[2].trim(),
      });
    }

    return params;
  }

  /**
   * 检测路由守卫
   */
  detectRouteGuards(files) {
    for (const file of files) {
      const content = file.content;
      const fileName = path.basename(file.path);

      // 查找导航守卫相关代码
      // 1. 检查认证守卫
      if (content.includes('Navigator') && content.includes('Auth') ||
          content.includes('loginCheck') || content.includes('isAuthenticated')) {
        this.routeGuards.set(`${fileName}:auth`, {
          type: 'auth_guard',
          fileName,
        });
      }

      // 2. 检查权限守卫
      if (content.includes('permission') || content.includes('Permission')) {
        this.routeGuards.set(`${fileName}:permission`, {
          type: 'permission_guard',
          fileName,
        });
      }

      // 3. 检查中间件
      if (content.includes('middleware') || content.includes('Middleware')) {
        this.routeGuards.set(`${fileName}:middleware`, {
          type: 'middleware',
          fileName,
        });
      }

      // 4. 检查路由重定向
      if (content.includes('redirect') || content.includes('Redirect')) {
        this.routeGuards.set(`${fileName}:redirect`, {
          type: 'redirect',
          fileName,
        });
      }
    }
  }

  /**
   * 生成统计信息
   */
  generateStatistics() {
    const stats = {
      totalRoutes: this.routes.size,
      totalNavigations: this.navigationCalls.size,
      totalGuards: this.routeGuards.size,
      totalParameters: this.routeParameters.size,
      byRouteType: {},
      byNavigationType: {},
      byRouterType: {},
      dynamicRoutes: 0,
      staticRoutes: 0,
    };

    // 按路由类型统计
    for (const route of this.routes.values()) {
      stats.byRouteType[route.type] = (stats.byRouteType[route.type] || 0) + 1;

      if (route.routerType) {
        stats.byRouterType[route.routerType] = (stats.byRouterType[route.routerType] || 0) + 1;
      }

      // 检查是否有动态参数
      if (route.parameters && route.parameters.length > 0) {
        stats.dynamicRoutes++;
      } else {
        stats.staticRoutes++;
      }
    }

    // 按导航类型统计
    for (const nav of this.navigationCalls.values()) {
      stats.byNavigationType[nav.type] = (stats.byNavigationType[nav.type] || 0) + 1;
    }

    return stats;
  }

  /**
   * 生成路由图
   */
  generateRouteGraph() {
    const nodes = [];
    const edges = [];

    // 添加路由节点
    for (const [key, route] of this.routes) {
      const nodeId = this.sanitizeNodeId(key);
      nodes.push({
        id: nodeId,
        label: route.path || route.route || route.className || key,
        type: route.type,
        widget: route.widget,
      });
    }

    // 添加导航边
    for (const [key, nav] of this.navigationCalls) {
      if (nav.target) {
        edges.push({
          from: nav.fileName,
          to: nav.target,
          type: nav.method,
        });
      }
    }

    return { nodes, edges };
  }

  /**
   * 清理节点 ID
   */
  sanitizeNodeId(id) {
    return id.replace(/[^a-zA-Z0-9_]/g, '_');
  }

  /**
   * 健康检查
   */
  performHealthCheck() {
    const checks = [];

    // 检查是否有初始路由
    const hasInitialRoute = Array.from(this.routes.values()).some(r => r.type === 'initial_route');
    checks.push({
      name: '初始路由',
      status: hasInitialRoute ? 'good' : 'warning',
      message: hasInitialRoute ? '已定义初始路由' : '未定义初始路由',
    });

    // 检查是否有未知路由处理
    const hasUnknownRoute = Array.from(this.routes.values()).some(r => r.type === 'unknown_route_handler');
    checks.push({
      name: '未知路由处理',
      status: hasUnknownRoute ? 'good' : 'warning',
      message: hasUnknownRoute ? '已定义未知路由处理' : '未定义未知路由处理',
    });

    // 检查路由命名规范
    const irregularRoutes = Array.from(this.routes.values()).filter(r =>
      r.path && !r.path.startsWith('/')
    );
    checks.push({
      name: '路由命名规范',
      status: irregularRoutes.length === 0 ? 'good' : 'warning',
      message: irregularRoutes.length === 0 ?
        '所有路由以 / 开头' :
        `${irregularRoutes.length} 个路由不以 / 开头`,
    });

    // 检查是否使用了现代路由库
    const usesModernRouter = Array.from(this.routes.values()).some(r =>
      r.routerType === 'go_router' || r.routerType === 'auto_route'
    );
    checks.push({
      name: '现代路由库',
      status: usesModernRouter ? 'good' : 'info',
      message: usesModernRouter ?
        '使用了现代路由库' :
        '使用传统 MaterialApp 路由',
    });

    // 检查路由守卫
    const hasGuards = this.routeGuards.size > 0;
    checks.push({
      name: '路由守卫',
      status: hasGuards ? 'good' : 'info',
      message: hasGuards ?
        `已配置 ${this.routeGuards.size} 个路由守卫` :
        '未配置路由守卫',
    });

    return checks;
  }

  /**
   * 获取路由列表
   */
  getRoutesList() {
    return Array.from(this.routes.values()).map(route => ({
      type: route.type,
      path: route.path || route.route,
      widget: route.widget || route.className,
      parameters: route.parameters || [],
      fileName: route.fileName,
      line: route.line,
      routerType: route.routerType,
    }));
  }

  /**
   * 获取映射列表
   */
  getMappingList() {
    return Array.from(this.routePageMapping.values()).map(mapping => ({
      route: mapping.route,
      page: mapping.page,
      parameters: mapping.parameters,
      isDirect: mapping.isDirect,
      fileName: mapping.fileName,
      line: mapping.line,
    }));
  }

  /**
   * 获取导航列表
   */
  getNavigationsList() {
    return Array.from(this.navigationCalls.values()).map(nav => ({
      type: nav.type,
      method: nav.method,
      target: nav.target,
      fileName: nav.fileName,
      line: nav.line,
    }));
  }

  /**
   * 获取模式列表
   */
  getPatternsList() {
    return Array.from(this.navigationPatterns.values());
  }

  /**
   * 获取守卫列表
   */
  getGuardsList() {
    return Array.from(this.routeGuards.values()).map(guard => ({
      type: guard.type,
      fileName: guard.fileName,
    }));
  }

  /**
   * 获取参数列表
   */
  getParametersList() {
    return Array.from(this.routeParameters.values());
  }

  /**
   * 生成 Mermaid 格式的路由图
   */
  toMermaid() {
    const lines = ['graph TD'];

    // 添加路由节点
    let nodeId = 0;
    const routeIds = new Map();

    for (const route of this.routes.values()) {
      const routeLabel = route.path || route.route || route.className || 'unknown';
      const id = `route_${nodeId++}`;
      routeIds.set(routeLabel, id);

      let label = routeLabel;
      if (route.widget) {
        label += `\\n(${route.widget})`;
      }

      lines.push(`  "${id}"["${label}"]`);
    }

    // 添加导航边
    for (const nav of this.navigationCalls.values()) {
      if (!nav.target) continue;

      const fromId = nav.fileName.replace(/\./g, '_');
      const toId = routeIds.get(nav.target);

      if (toId) {
        lines.push(`  "${fromId}" --> "${toId}"`);
      }
    }

    return lines.join('\n');
  }

  /**
   * 查找匹配的大括号
   */
  findMatchingBrace(content, startIndex) {
    let count = 1;
    let i = startIndex + 1;

    while (i < content.length && count > 0) {
      if (content[i] === '{') count++;
      else if (content[i] === '}') count--;
      i++;
    }

    return count === 0 ? i - 1 : null;
  }

  /**
   * 获取行号
   */
  getLineNumber(content, index) {
    const before = content.substring(0, index);
    return before.split('\n').length;
  }
}

module.exports = FlutterRoutingAnalyzer;
