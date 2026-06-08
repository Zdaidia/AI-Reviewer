/**
 * Flutter Network Analyzer
 *
 * 职责:
 * - 提取 API Endpoint 信息
 * - 分析 API 与 Model 的关联关系
 * - 检测错误处理逻辑
 * - 分析网络请求模式
 * - 识别 RESTful API 规范
 *
 * 支持的 HTTP 客户端:
 * - dio (Dio)
 * - http (package:http)
 * - HttpRequest (自定义)
 * - ApiResponse (封装响应)
 *
 * 支持的功能:
 * - URL 模板解析
 * - 路径参数识别
 * - 查询参数提取
 * - 请求/响应类型推断
 * - 错误处理策略分析
 */

const path = require('path');

class FlutterNetworkAnalyzer {
  constructor() {
    this.endpoints = new Map(); // API 端点
    this.apiModelRelations = new Map(); // API-Model 关联
    this.errorHandlers = new Map(); // 错误处理器
    this.httpMethods = new Set(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']);
    this.statusCodes = {
      success: [200, 201, 202, 204],
      redirect: [301, 302, 303, 307, 308],
      clientError: [400, 401, 403, 404, 409, 422, 429],
      serverError: [500, 502, 503, 504],
    };
  }

  /**
   * 分析网络层
   * @param {Array} files - Dart 文件列表
   * @returns {Object} 网络层分析结果
   */
  analyzeNetwork(files) {
    this.clearCache();

    // 1. 提取 API Endpoint
    this.extractApiEndpoints(files);

    // 2. 分析 API-Model 关联
    this.analyzeApiModelRelations(files);

    // 3. 检测错误处理
    this.detectErrorHandling(files);

    // 4. 生成统计信息
    const statistics = this.generateStatistics();

    // 5. 分析网络请求模式
    const patterns = this.analyzeRequestPatterns();

    // 6. 健康检查
    const healthCheck = this.performHealthCheck();

    return {
      endpoints: this.getEndpointsList(),
      relations: this.getRelationsList(),
      errorHandlers: this.getErrorHandlersList(),
      statistics,
      patterns,
      healthCheck,
    };
  }

  /**
   * 清除缓存
   */
  clearCache() {
    this.endpoints.clear();
    this.apiModelRelations.clear();
    this.errorHandlers.clear();
  }

  /**
   * 提取 API Endpoint
   */
  extractApiEndpoints(files) {
    for (const file of files) {
      const content = file.content;
      const filePath = file.path;
      const fileName = path.basename(filePath);

      // 提取基础 URL
      const baseUrl = this.extractBaseUrl(content);
      const baseHeaders = this.extractBaseHeaders(content);

      // 查找各种 HTTP 客户端调用
      this.findDioCalls(content, fileName, baseUrl, baseHeaders);
      this.findHttpCalls(content, fileName, baseUrl);
      this.findCustomApiCalls(content, fileName);
    }
  }

  /**
   * 提取基础 URL
   */
  extractBaseUrl(content) {
    // 匹配模式: baseUrl = '...', BaseUrl = '...', _baseUrl = '...'
    const patterns = [
      /(?:baseUrl|BaseUrl|_baseUrl|BASE_URL|base_url)\s*=\s*['"]([^'"]+)['"]/g,
      /Dio\s*\(\s*[^)]*baseUrl\s*:\s*['"]([^'"]+)['"]/g,
      /BaseOptions\s*\([^)]*baseUrl\s*:\s*['"]([^'"]+)['"]/g,
    ];

    for (const pattern of patterns) {
      const match = pattern.exec(content);
      if (match) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * 提取基础请求头
   */
  extractBaseHeaders(content) {
    const headers = new Map();

    // 匹配模式: headers: { ... }
    const headerPattern = /headers\s*:\s*\{([^}]+)\}/g;
    let match;

    while ((match = headerPattern.exec(content)) !== null) {
      const headerContent = match[1];
      // 提取 key-value 对
      const kvPattern = /['"]([^'"]+)['"]\s*:\s*['"]([^'"]+)['"]/g;
      let kvMatch;

      while ((kvMatch = kvPattern.exec(headerContent)) !== null) {
        headers.set(kvMatch[1], kvMatch[2]);
      }
    }

    return headers;
  }

  /**
   * 查找 Dio 调用
   */
  findDioCalls(content, fileName, baseUrl, baseHeaders) {
    const dioMethods = ['get', 'post', 'put', 'delete', 'patch', 'head', 'download', 'upload'];

    for (const method of dioMethods) {
      // 匹配: dio.get(...), await dio.get(...)
      const pattern = new RegExp(`(?:await\\s+)?(?:dio\\.|_dio\\.|client\\.)${method}\\s*\\(`, 'gi');
      let match;

      while ((match = pattern.exec(content)) !== null) {
        const callStart = match.index;
        const line = this.getLineNumber(content, callStart);

        // 检查此调用是否在 try-catch 块中
        const isInTryCatch = this.checkIfInTryCatch(content, callStart);

        // 提取完整的调用
        const callEnd = this.findMatchingParen(content, callStart + match[0].length - 1);
        if (!callEnd) continue;

        const callContent = content.substring(callStart, callEnd + 1);

        // 解析 API 调用，传入上下文信息
        const endpoint = this.parseApiCallWithContext(callContent, method.toUpperCase(), baseUrl, fileName, line, isInTryCatch);

        if (endpoint) {
          // 合并基础请求头
          for (const [key, value] of baseHeaders) {
            if (!endpoint.headers.has(key)) {
              endpoint.headers.set(key, value);
            }
          }

          const key = `${fileName}:${line}:${method}`;
          this.endpoints.set(key, endpoint);
        }
      }
    }
  }

  /**
   * 检查调用是否在 try-catch 块中
   */
  checkIfInTryCatch(content, callIndex) {
    // 向前查找最近的 try 块
    let tryCount = 0;
    let catchCount = 0;

    // 检查调用位置之前是否有 try
    const beforeCall = content.substring(0, callIndex);

    // 计算未配对的 try-catch
    const tryMatches = beforeCall.match(/try\s*\{/g) || [];
    const catchMatches = beforeCall.match(/catch\s*\(/g) || [];

    tryCount = tryMatches.length;
    catchCount = catchMatches.length;

    return tryCount > catchCount;
  }

  /**
   * 解析 API 调用（带上下文）
   */
  parseApiCallWithContext(callContent, httpMethod, baseUrl, fileName, line, isInTryCatch) {
    // 提取 URL 参数
    const urlMatch = callContent.match(/[:\(\s](['"`])([^'"`]+)\1/);
    if (!urlMatch) return null;

    const url = urlMatch[2];

    // 提取查询参数 - 支持多行格式
    const queryParams = new Map();
    // 使用平衡括号查找 queryParameters 块
    if (callContent.includes('queryParameters')) {
      const queryStart = callContent.indexOf('queryParameters');
      const openBrace = callContent.indexOf('{', queryStart);
      if (openBrace > 0) {
        const closeBrace = this.findMatchingBraceInString(callContent, openBrace);
        if (closeBrace > 0) {
          const queryBody = callContent.substring(openBrace + 1, closeBrace);
          this.extractParamsFromString(queryBody, queryParams);
        }
      }
    }

    // 提取请求头
    const headers = new Map();
    if (callContent.includes('headers')) {
      const headerStart = callContent.indexOf('headers');
      const colonIndex = callContent.indexOf(':', headerStart);
      const openBrace = callContent.indexOf('{', colonIndex);
      if (openBrace > 0) {
        const closeBrace = this.findMatchingBraceInString(callContent, openBrace);
        if (closeBrace > 0) {
          const headerBody = callContent.substring(openBrace + 1, closeBrace);
          this.extractParamsFromString(headerBody, headers);
        }
      }
    }

    // 提取请求体
    const bodyMatch = callContent.match(/data\s*:\s*(\{[^}]*\}|[^,)\n]+)/);
    const requestBody = bodyMatch ? bodyMatch[1] : null;

    // 检测认证
    const hasAuth = callContent.includes('Bearer') ||
                    callContent.includes('Authorization') ||
                    (callContent.includes('headers') && callContent.includes('token'));

    // 检测错误处理
    const hasErrorHandling = isInTryCatch ||
                            callContent.includes('.catchError') ||
                            callContent.includes('DioException');

    // 构建完整 URL
    const fullUrl = baseUrl ? `${baseUrl}${url}` : url;

    return {
      id: `${fileName}:${line}`,
      httpMethod,
      url,
      fullUrl,
      method: null,
      fileName,
      line,
      pathParams: this.extractPathParams(url),
      queryParams,
      headers,
      requestBody,
      responseType: null,
      hasAuth,
      hasErrorHandling,
      isDeprecated: false,
    };
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
   * 查找 package:http 调用
   */
  findHttpCalls(content, fileName, baseUrl) {
    const httpMethods = ['get', 'post', 'put', 'delete', 'patch', 'head'];

    for (const method of httpMethods) {
      // 匹配: http.get(...), await http.get(...)
      const pattern = new RegExp(`(?:await\\s+)?http\\.${method}\\s*\\(`, 'gi');
      let match;

      while ((match = pattern.exec(content)) !== null) {
        const callStart = match.index;
        const line = this.getLineNumber(content, callStart);

        // 检查此调用是否在 try-catch 块中
        const isInTryCatch = this.checkIfInTryCatch(content, callStart);

        // 提取完整的调用
        const callEnd = this.findMatchingParen(content, callStart + match[0].length - 1);
        if (!callEnd) continue;

        const callContent = content.substring(callStart, callEnd + 1);

        // 解析 API 调用
        const endpoint = this.parseApiCallWithContext(callContent, method.toUpperCase(), baseUrl, fileName, line, isInTryCatch);

        if (endpoint) {
          const key = `${fileName}:${line}:${method}`;
          this.endpoints.set(key, endpoint);
        }
      }
    }
  }

  /**
   * 查找自定义 API 调用
   */
  findCustomApiCalls(content, fileName) {
    // 匹配自定义方法调用，如 api.getUser(), service.fetchData()
    const patterns = [
      /(?:await\s+)?(?:api|service|repository|_api|_service)\.(\w+)\s*\(/gi,
      /(?:await\s+)?(\w+Api|\w+Service|\w+Repository)\.(\w+)\s*\(/gi,
    ];

    for (const pattern of patterns) {
      let match;

      while ((match = pattern.exec(content)) !== null) {
        const methodName = match[1] || match[2];
        const callStart = match.index;
        const line = this.getLineNumber(content, callStart);

        // 通过方法名推断 HTTP 方法
        const httpMethod = this.inferHttpMethodFromName(methodName);

        // 查找方法定义以获取 URL
        const methodDef = this.findMethodDefinition(content, methodName);
        if (!methodDef) continue;

        // 从方法体中提取 URL
        const url = this.extractUrlFromMethodBody(methodDef.body);
        if (!url) continue;

        const endpoint = {
          id: `${fileName}:${line}`,
          httpMethod,
          url,
          fullUrl: url,
          method: methodName,
          fileName,
          line,
          pathParams: this.extractPathParams(url),
          queryParams: new Map(),
          headers: new Map(),
          requestBody: null,
          responseType: null,
          hasAuth: this.hasAuthentication(methodDef.body),
          hasErrorHandling: this.hasTryCatch(methodDef.body),
          isDeprecated: methodDef.body.includes('@deprecated'),
        };

        const key = `${fileName}:${line}:${httpMethod}`;
        this.endpoints.set(key, endpoint);
      }
    }
  }

  /**
   * 解析 API 调用
   */
  parseApiCall(callContent, httpMethod, baseUrl, fileName, line) {
    // 提取 URL 参数 - 支持多种格式
    const urlMatch = callContent.match(/[:\(\s](['"`])([^'"`]+)\1/);
    if (!urlMatch) return null;

    const url = urlMatch[2];

    // 提取查询参数 - 支持 queryParameters: 格式
    const queryParams = new Map();
    const queryMatch = callContent.match(/queryParameters\s*:\s*\{([^}]+)\}/);
    if (queryMatch) {
      this.extractParamsFromString(queryMatch[1], queryParams);
    }

    // 提取请求头 - 支持 headers: 格式和 options 中的 headers
    const headers = new Map();

    // 检查直接在调用中的 headers
    const directHeaderMatch = callContent.match(/headers\s*:\s*\{([^}]+)\}/);
    if (directHeaderMatch) {
      this.extractParamsFromString(directHeaderMatch[1], headers);
    }

    // 检查 options 中的 headers
    const optionsMatch = callContent.match(/options\s*:\s*Options\s*\([^)]*\)/);
    if (optionsMatch) {
      const optionsContent = optionsMatch[0];
      const headerInOptions = optionsContent.match(/headers\s*:\s*\{([^}]+)\}/);
      if (headerInOptions) {
        this.extractParamsFromString(headerInOptions[1], headers);
      }
    }

    // 提取请求体
    const bodyMatch = callContent.match(/data\s*:\s*(\{[^}]*\}|[^,)\n]+)/);
    const requestBody = bodyMatch ? bodyMatch[1] : null;

    // 检测认证
    const hasAuth = callContent.includes('Bearer') ||
                    callContent.includes('Authorization') ||
                    (callContent.includes('headers') && callContent.includes('token'));

    // 检测错误处理 - 在整个上下文中查找 try-catch
    const hasErrorHandling = callContent.includes('.catchError') ||
                            callContent.includes('try') ||
                            callContent.includes('onError') ||
                            callContent.includes('DioException');

    // 构建完整 URL
    const fullUrl = baseUrl ? `${baseUrl}${url}` : url;

    return {
      id: `${fileName}:${line}`,
      httpMethod,
      url,
      fullUrl,
      method: null,
      fileName,
      line,
      pathParams: this.extractPathParams(url),
      queryParams,
      headers,
      requestBody,
      responseType: null,
      hasAuth,
      hasErrorHandling,
      isDeprecated: false,
    };
  }

  /**
   * 从字符串中提取参数
   */
  extractParamsFromString(str, paramsMap) {
    // 匹配 'key': value 或 "key": value 格式
    // 支持各种值类型：字符串、数字、变量
    const pattern = /(['"])([\w.]+)\1\s*:\s*([^,\}]+)/g;
    let match;

    while ((match = pattern.exec(str)) !== null) {
      const key = match[2];
      let value = match[3].trim();

      // 移除尾部的注释
      const commentIndex = value.indexOf('//');
      if (commentIndex > 0) {
        value = value.substring(0, commentIndex).trim();
      }

      // 移除引号（如果是字符串值）
      if ((value.startsWith("'") && value.endsWith("'")) ||
          (value.startsWith('"') && value.endsWith('"'))) {
        value = value.slice(1, -1);
      }

      paramsMap.set(key, value);
    }
  }

  /**
   * 提取路径参数
   */
  extractPathParams(url) {
    const params = [];

    // 排除的变量名（这些不是路径参数）
    const excludeVars = new Set(['baseUrl', 'BASE_URL', 'base_url', 'endpoint', 'path', 'url']);

    // 匹配 :param, {param}, ${param}, $param 格式
    const patterns = [
      /:([a-zA-Z_]\w*)/g,
      /\{([a-zA-Z_]\w*)\}/g,
      /\$\{([a-zA-Z_]\w*)\}/g,
      /\$([a-zA-Z_]\w*)(?:\/|\$|{)/g,  // $userId/ or $userId or $userId{
    ];

    for (const pattern of patterns) {
      let match;
      // 重置 regex 的 lastIndex
      pattern.lastIndex = 0;
      while ((match = pattern.exec(url)) !== null) {
        const paramName = match[1];
        if (!excludeVars.has(paramName) && !params.includes(paramName)) {
          params.push(paramName);
        }
      }
    }

    return params;
  }

  /**
   * 从方法名推断 HTTP 方法
   */
  inferHttpMethodFromName(methodName) {
    const lowerName = methodName.toLowerCase();

    if (lowerName.startsWith('get') || lowerName.startsWith('fetch') || lowerName.startsWith('list') || lowerName.startsWith('query')) {
      return 'GET';
    }
    if (lowerName.startsWith('create') || lowerName.startsWith('add') || lowerName.startsWith('post') || lowerName.startsWith('insert')) {
      return 'POST';
    }
    if (lowerName.startsWith('update') || lowerName.startsWith('edit') || lowerName.startsWith('modify') || lowerName.startsWith('put') || lowerName.startsWith('patch')) {
      return lowerName.includes('full') ? 'PUT' : 'PATCH';
    }
    if (lowerName.startsWith('delete') || lowerName.startsWith('remove') || lowerName.startsWith('destroy')) {
      return 'DELETE';
    }

    return 'GET'; // 默认
  }

  /**
   * 查找方法定义
   */
  findMethodDefinition(content, methodName) {
    // 匹配方法定义
    const pattern = new RegExp(`(?:Future\\s*<[^>]*>\\s*)?${methodName}\\s*\\([^)]*\\)\\s*(?:async\\s*)?\\{`, 'g');
    const match = pattern.exec(content);

    if (!match) return null;

    const methodStart = match.index + match[0].length;
    const bodyEnd = this.findMatchingBrace(content, methodStart - 1);

    if (!bodyEnd) return null;

    return {
      name: methodName,
      body: content.substring(methodStart, bodyEnd),
    };
  }

  /**
   * 从方法体中提取 URL
   */
  extractUrlFromMethodBody(body) {
    const patterns = [
      /['"`]([/][^'"`]*?)['"`]/,  // 直接的 URL 字符串
      /endpoint\s*=\s*['"`]([^'"`]+)['"`]/,  // endpoint 变量
      /path\s*=\s*['"`]([^'"`]+)['"`]/,  // path 变量
      /url\s*=\s*['"`]([^'"`]+)['"`]/,  // url 变量
    ];

    for (const pattern of patterns) {
      const match = pattern.exec(body);
      if (match && match[1].startsWith('/')) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * 检查是否有认证
   */
  hasAuthentication(body) {
    return body.includes('Bearer') ||
           body.includes('Authorization') ||
           body.includes('token') ||
           body.includes('accessToken') ||
           body.includes('headers[\'Authorization\']') ||
           body.includes('options.headers');
  }

  /**
   * 检查是否有 try-catch
   */
  hasTryCatch(body) {
    return body.includes('try') && body.includes('catch');
  }

  /**
   * 查找匹配的括号
   */
  findMatchingParen(content, startIndex) {
    let count = 1;
    let i = startIndex + 1;

    while (i < content.length && count > 0) {
      if (content[i] === '(') count++;
      else if (content[i] === ')') count--;
      i++;
    }

    return count === 0 ? i - 1 : null;
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
   * 分析 API-Model 关联
   */
  analyzeApiModelRelations(files) {
    for (const [key, endpoint] of this.endpoints) {
      const relations = {
        requestModel: null,
        responseModel: null,
        responseType: null,
        serializationMethod: null,
        deserializationMethod: null,
      };

      // 分析请求体中的模型
      if (endpoint.requestBody) {
        relations.requestModel = this.extractModelFromJson(endpoint.requestBody);
      }

      // 分析响应类型
      if (endpoint.responseType) {
        relations.responseModel = endpoint.responseType;
        relations.responseType = this.classifyResponseType(endpoint.responseType);
      }

      // 查找序列化/反序列化调用
      const callContext = this.findCallContext(endpoint.fileName, endpoint.line);
      if (callContext) {
        relations.deserializationMethod = this.findDeserializationMethod(callContext);
        relations.serializationMethod = this.findSerializationMethod(callContext);
      }

      this.apiModelRelations.set(key, relations);
    }
  }

  /**
   * 从 JSON 字符串中提取模型
   */
  extractModelFromJson(jsonStr) {
    // 简单推断：查找类引用
    const match = jsonStr.match(/(\w+(?:Model|Entity|Dto|Request|Response)?)\./);
    return match ? match[1] : null;
  }

  /**
   * 分类响应类型
   */
  classifyResponseType(type) {
    if (!type) return 'unknown';

    const lowerType = type.toLowerCase();

    if (lowerType.includes('list') || lowerType.includes('[]')) {
      return 'array';
    }
    if (lowerType.includes('map') || lowerType.includes('object')) {
      return 'object';
    }
    if (lowerType.includes('string')) {
      return 'string';
    }
    if (lowerType.includes('int') || lowerType.includes('double') || lowerType.includes('num')) {
      return 'number';
    }
    if (lowerType.includes('bool')) {
      return 'boolean';
    }
    if (lowerType.includes('void') || lowerType === 'null') {
      return 'void';
    }

    return 'custom';
  }

  /**
   * 查找调用上下文
   */
  findCallContext(fileName, line) {
    // 这里需要读取原始文件内容
    // 简化实现：返回 null
    return null;
  }

  /**
   * 查找反序列化方法
   */
  findDeserializationMethod(context) {
    if (!context) return null;

    if (context.includes('.fromJson(')) return 'fromJson';
    if (context.includes('factory')) return 'factory_constructor';
    if (context.includes('jsonDecode')) return 'jsonDecode';

    return null;
  }

  /**
   * 查找序列化方法
   */
  findSerializationMethod(context) {
    if (!context) return null;

    if (context.includes('.toJson(')) return 'toJson';
    if (context.includes('jsonEncode')) return 'jsonEncode';

    return null;
  }

  /**
   * 检测错误处理
   */
  detectErrorHandling(files) {
    for (const file of files) {
      const content = file.content;
      const fileName = path.basename(file.path);

      // 查找 try-catch 块
      this.findTryCatchBlocks(content, fileName);

      // 查找 catchError
      this.findCatchErrorBlocks(content, fileName);

      // 查找错误状态码处理
      this.findStatusCodeHandling(content, fileName);

      // 查找超时处理
      this.findTimeoutHandling(content, fileName);
    }
  }

  /**
   * 查找 try-catch 块
   */
  findTryCatchBlocks(content, fileName) {
    // 匹配 try { 或 try( 格式
    const tryPattern = /try\s*\{/g;
    let match;
    let handlerId = 0;

    while ((match = tryPattern.exec(content)) !== null) {
      const tryStart = match.index;
      const line = this.getLineNumber(content, tryStart);

      // 查找对应的 }
      const tryBlockEnd = this.findMatchingBrace(content, tryStart + 3);
      if (!tryBlockEnd) continue;

      const afterTry = content.substring(tryBlockEnd + 1).trim();

      // 检查后面是否有 catch 或 on (Dart 语法: on Exception catch)
      // 跳过空白字符和注释
      let afterTryNormalized = afterTry.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();

      if (!afterTryNormalized.startsWith('on') &&
          !afterTryNormalized.startsWith('catch') &&
          !afterTryNormalized.startsWith('}')) {
        continue;
      }

      // 提取 catch/on 块
      const catchBlock = this.extractCatchBlock(afterTryNormalized);
      if (!catchBlock) continue;

      // 检查 try 块中是否有网络调用
      const tryBody = content.substring(tryStart + 4, tryBlockEnd);
      const hasNetworkCall = tryBody.includes('.get(') || tryBody.includes('.post(') ||
                          tryBody.includes('.put(') || tryBody.includes('.delete(') ||
                          tryBody.includes('.patch(') ||
                          tryBody.includes('_dio.') || tryBody.includes('http.');

      if (!hasNetworkCall) continue;

      const handler = {
        id: `${fileName}:${line}:trycatch_${handlerId++}`,
        type: 'try_catch',
        fileName,
        line,
        exceptionType: catchBlock.exceptionType,
        hasLogging: catchBlock.body.includes('print') || catchBlock.body.includes('log') || catchBlock.body.includes('debugPrint'),
        hasRethrow: catchBlock.body.includes('rethrow') || catchBlock.body.includes('throw'),
        hasUserMessage: catchBlock.body.includes('ScaffoldMessenger') || catchBlock.body.includes('showSnackBar') || catchBlock.body.includes('showDialog') || catchBlock.body.includes('throw Exception'),
        errorTypes: this.extractErrorTypes(tryBody + ' ' + catchBlock.body),
        statusCodeHandling: this.detectStatusCodeHandling(tryBody + ' ' + catchBlock.body),
      };

      this.errorHandlers.set(handler.id, handler);
    }
  }

  /**
   * 提取 catch 块
   */
  extractCatchBlock(afterTry) {
    // Dart 语法支持: on Exception catch (e), on Exception catch (e, s), catch (e)
    const patterns = [
      // on Exception catch (e) 或 on Exception catch (e, stackTrace)
      /on\s+(\w+(?:\.\w+)?)\s+catch\s*\(\s*(\w+)\s*(?:,\s*(\w+)\s*)?\)\s*\{/,
      // catch (Exception e) 或 catch (e)
      /catch\s*\(\s*(?:(\w+(?:\.\w+)?)\s+)?(\w+)\s*(?:,\s*(\w+)\s*)?\)\s*\{/,
    ];

    for (const pattern of patterns) {
      const match = pattern.exec(afterTry);
      if (!match) continue;

      let exceptionType, exceptionVar, stackTraceVar;

      if (pattern.source.startsWith('on')) {
        // on Exception catch (e) 格式
        exceptionType = match[1];
        exceptionVar = match[2];
        stackTraceVar = match[3];
      } else {
        // catch (e) 或 catch (Exception e) 格式
        exceptionType = match[1] || 'dynamic';
        exceptionVar = match[2];
        stackTraceVar = match[3];
      }

      const catchStart = match.index + match[0].length;
      const catchEnd = this.findMatchingBrace(afterTry, catchStart - 1);

      if (!catchEnd) continue;

      return {
        exceptionType,
        exceptionVar,
        stackTraceVar,
        body: afterTry.substring(catchStart, catchEnd),
      };
    }

    return null;
  }

  /**
   * 提取错误类型
   */
  extractErrorTypes(body) {
    const types = new Set();

    // 检查常见的错误类型判断
    const errorPatterns = [
      { type: 'DioException', pattern: /(?:is|isA|isType)<DioException>|DioException/i },
      { type: 'SocketException', pattern: /SocketException/i },
      { type: 'HttpException', pattern: /HttpException/i },
      { type: 'TimeoutException', pattern: /TimeoutException/i },
      { type: 'FormatException', pattern: /FormatException/i },
      { type: 'NetworkException', pattern: /NetworkException/i },
      { type: 'ApiException', pattern: /ApiException/i },
    ];

    for (const { type, pattern } of errorPatterns) {
      if (pattern.test(body)) {
        types.add(type);
      }
    }

    return Array.from(types);
  }

  /**
   * 检测状态码处理
   */
  detectStatusCodeHandling(body) {
    const codes = [];

    // 检查状态码判断
    const codePatterns = [
      { code: 401, patterns: ['401', 'unauthorized', 'UNAUTHORIZED'] },
      { code: 403, patterns: ['403', 'forbidden', 'FORBIDDEN'] },
      { code: 404, patterns: ['404', 'not found', 'NOT_FOUND'] },
      { code: 409, patterns: ['409', 'conflict', 'CONFLICT'] },
      { code: 422, patterns: ['422', 'unprocessable', 'UNPROCESSABLE'] },
      { code: 429, patterns: ['429', 'too many requests', 'TOO_MANY_REQUESTS'] },
      { code: 500, patterns: ['500', 'internal server error', 'INTERNAL_SERVER_ERROR'] },
      { code: 503, patterns: ['503', 'service unavailable', 'SERVICE_UNAVAILABLE'] },
    ];

    for (const { code, patterns } of codePatterns) {
      for (const pattern of patterns) {
        if (body.includes(pattern)) {
          codes.push(code);
          break;
        }
      }
    }

    return codes;
  }

  /**
   * 查找 catchError 块
   */
  findCatchErrorBlocks(content, fileName) {
    // 匹配 .catchError((error) { ... })
    const catchErrorPattern = /\.catchError\s*\(\s*\([^)]*\)\s*\{/g;
    let match;
    let handlerId = 0;

    while ((match = catchErrorPattern.exec(content)) !== null) {
      const line = this.getLineNumber(content, match.index);
      const blockStart = match.index + match[0].length;
      const blockEnd = this.findMatchingBrace(content, blockStart - 1);

      if (!blockEnd) continue;

      const blockBody = content.substring(blockStart, blockEnd);

      const handler = {
        id: `${fileName}:${line}:catcherror_${handlerId++}`,
        type: 'catch_error',
        fileName,
        line,
        exceptionType: 'dynamic',
        hasLogging: blockBody.includes('print') || blockBody.includes('log'),
        hasRethrow: blockBody.includes('throw'),
        hasUserMessage: false,
        errorTypes: [],
        statusCodeHandling: [],
      };

      this.errorHandlers.set(handler.id, handler);
    }
  }

  /**
   * 查找状态码处理
   */
  findStatusCodeHandling(content, fileName) {
    const patterns = [
      /response\.statusCode\s*==\s*(\d+)/g,
      /statusCode\s*==\s*(\d+)/g,
      /status\s*==\s*(\d+)/g,
      /case\s+(\d+):/g,
    ];

    for (const pattern of patterns) {
      let match;

      while ((match = pattern.exec(content)) !== null) {
        const code = parseInt(match[1]);
        const line = this.getLineNumber(content, match.index);

        const handler = {
          id: `${fileName}:${line}:status_${code}`,
          type: 'status_code',
          fileName,
          line,
          statusCode: code,
          category: this.categorizeStatusCode(code),
        };

        this.errorHandlers.set(handler.id, handler);
      }
    }
  }

  /**
   * 分类状态码
   */
  categorizeStatusCode(code) {
    if (this.statusCodes.success.includes(code)) return 'success';
    if (this.statusCodes.redirect.includes(code)) return 'redirect';
    if (this.statusCodes.clientError.includes(code)) return 'client_error';
    if (this.statusCodes.serverError.includes(code)) return 'server_error';
    return 'unknown';
  }

  /**
   * 查找超时处理
   */
  findTimeoutHandling(content, fileName) {
    const patterns = [
      /connectTimeout\s*:\s*(?:Duration\s*\(\s*)?(\w+)/g,
      /receiveTimeout\s*:\s*(?:Duration\s*\(\s*)?(\w+)/g,
      /sendTimeout\s*:\s*(?:Duration\s*\(\s*)?(\w+)/g,
    ];

    for (const pattern of patterns) {
      let match;

      while ((match = pattern.exec(content)) !== null) {
        const timeoutType = pattern.source.includes('connect') ? 'connect' :
                          pattern.source.includes('receive') ? 'receive' : 'send';
        const line = this.getLineNumber(content, match.index);

        const handler = {
          id: `${fileName}:${line}:timeout_${timeoutType}`,
          type: 'timeout',
          fileName,
          line,
          timeoutType,
          timeoutValue: match[1],
        };

        this.errorHandlers.set(handler.id, handler);
      }
    }
  }

  /**
   * 生成统计信息
   */
  generateStatistics() {
    const stats = {
      totalEndpoints: this.endpoints.size,
      totalRelations: this.apiModelRelations.size,
      totalErrorHandlers: this.errorHandlers.size,
      byMethod: {},
      byAuth: { withAuth: 0, withoutAuth: 0 },
      byErrorHandling: { withHandling: 0, withoutHandling: 0 },
      statusCodesCovered: new Set(),
      avgPathParams: 0,
    };

    let totalPathParams = 0;

    for (const endpoint of this.endpoints.values()) {
      // 按 HTTP 方法统计
      stats.byMethod[endpoint.httpMethod] = (stats.byMethod[endpoint.httpMethod] || 0) + 1;

      // 认证统计
      if (endpoint.hasAuth) {
        stats.byAuth.withAuth++;
      } else {
        stats.byAuth.withoutAuth++;
      }

      // 错误处理统计
      if (endpoint.hasErrorHandling) {
        stats.byErrorHandling.withHandling++;
      } else {
        stats.byErrorHandling.withoutHandling++;
      }

      totalPathParams += endpoint.pathParams.length;
    }

    stats.avgPathParams = this.endpoints.size > 0
      ? Math.round(totalPathParams / this.endpoints.size * 10) / 10
      : 0;

    // 状态码覆盖
    for (const handler of this.errorHandlers.values()) {
      if (handler.statusCodeHandling) {
        for (const code of handler.statusCodeHandling) {
          stats.statusCodesCovered.add(code);
        }
      }
    }

    stats.statusCodesCovered = Array.from(stats.statusCodesCovered);

    return stats;
  }

  /**
   * 分析请求模式
   */
  analyzeRequestPatterns() {
    const patterns = {
      restfulLevel: this.calculateRestfulLevel(),
      namingConventions: this.analyzeNamingConventions(),
      versioning: this.detectVersioning(),
      commonEndpoints: this.identifyCommonEndpoints(),
    };

    return patterns;
  }

  /**
   * 计算 RESTful 成熟度
   */
  calculateRestfulLevel() {
    let score = 0;
    let maxScore = 0;

    // 检查 HTTP 方法多样性
    const methodsUsed = new Set();
    for (const endpoint of this.endpoints.values()) {
      methodsUsed.add(endpoint.httpMethod);
    }
    score += Math.min(methodsUsed.size * 10, 40);
    maxScore += 40;

    // 检查资源命名规范
    let properResourceNames = 0;
    for (const endpoint of this.endpoints.values()) {
      if (this.isProperResourceName(endpoint.url)) {
        properResourceNames++;
      }
    }
    if (this.endpoints.size > 0) {
      score += Math.round(properResourceNames / this.endpoints.size * 30);
    }
    maxScore += 30;

    // 检查状态码使用
    const statusCodesUsed = new Set();
    for (const handler of this.errorHandlers.values()) {
      if (handler.statusCodeHandling) {
        for (const code of handler.statusCodeHandling) {
          statusCodesUsed.add(code);
        }
      }
    }
    score += Math.min(statusCodesUsed.size * 3, 20);
    maxScore += 20;

    // 检查 HATEOAS（超媒体）
    // 简化：检查是否有链接相关的响应字段
    maxScore += 10;

    return {
      score: Math.min(score, 100),
      level: this.getRestfulLevelName(score),
      maxScore,
      details: {
        methodsUsed: Array.from(methodsUsed),
        properResourceNames: `${properResourceNames}/${this.endpoints.size}`,
        statusCodesUsed: Array.from(statusCodesUsed),
      },
    };
  }

  /**
   * 检查是否是正确的资源名称
   */
  isProperResourceName(url) {
    // 应该是名词，复数形式，小写，用连字符分隔
    const pathParts = url.split('/').filter(p => p && !p.startsWith(':'));
    if (pathParts.length === 0) return false;

    const lastPart = pathParts[pathParts.length - 1];

    // 检查是否是小写名词（简化判断）
    return /^[a-z][a-z0-9-]*$/.test(lastPart) || lastPart.endsWith('s');
  }

  /**
   * 获取 RESTful 级别名称
   */
  getRestfulLevelName(score) {
    if (score >= 80) return 'Level 3 (HATEOAS)';
    if (score >= 60) return 'Level 2 (HTTP Verbs)';
    if (score >= 40) return 'Level 1 (Resources)';
    return 'Level 0 (RPC-style)';
  }

  /**
   * 分析命名约定
   */
  analyzeNamingConventions() {
    const conventions = {
      urlCase: [], // kebab-case, camelCase, snake_case
      pathParamStyle: [], // :id, {id}, ${id}
      queryParamStyle: [],
    };

    for (const endpoint of this.endpoints.values()) {
      // 分析 URL 命名风格
      if (endpoint.url.includes('-')) {
        conventions.urlCase.push('kebab-case');
      }
      if (/[a-z][A-Z]/.test(endpoint.url)) {
        conventions.urlCase.push('camelCase');
      }
      if (endpoint.url.includes('_')) {
        conventions.urlCase.push('snake_case');
      }

      // 分析路径参数风格
      if (endpoint.url.includes(':')) {
        conventions.pathParamStyle.push('colon');
      }
      if (endpoint.url.includes('{')) {
        conventions.pathParamStyle.push('brace');
      }
      if (endpoint.url.includes('${')) {
        conventions.pathParamStyle.push('template');
      }
    }

    // 去重
    for (const key in conventions) {
      conventions[key] = [...new Set(conventions[key])];
    }

    return conventions;
  }

  /**
   * 检测版本控制
   */
  detectVersioning() {
    const versions = new Set();

    for (const endpoint of this.endpoints.values()) {
      // 检查 URL 版本控制 /v1/, /v2/, /api/v1/
      const versionMatch = endpoint.url.match(/\/v(\d+)\//);
      if (versionMatch) {
        versions.add(versionMatch[1]);
      }

      // 检查 Header 版本控制
      for (const [key, value] of endpoint.headers) {
        if (key.toLowerCase().includes('version') || key.toLowerCase().includes('api-version')) {
          versions.add(value);
        }
      }
    }

    return {
      hasVersioning: versions.size > 0,
      versions: Array.from(versions),
      strategy: versions.size > 0 ? 'url_versioning' : 'none',
    };
  }

  /**
   * 识别通用端点
   */
  identifyCommonEndpoints() {
    const patterns = {
      authentication: [],
      userManagement: [],
      dataCRUD: [],
      search: [],
      pagination: [],
    };

    for (const endpoint of this.endpoints.values()) {
      const lowerUrl = endpoint.url.toLowerCase();

      // 认证相关
      if (lowerUrl.includes('/login') || lowerUrl.includes('/auth') || lowerUrl.includes('/token')) {
        patterns.authentication.push(endpoint);
      }

      // 用户管理
      if (lowerUrl.includes('/user')) {
        patterns.userManagement.push(endpoint);
      }

      // CRUD 操作
      if (endpoint.httpMethod === 'GET' || endpoint.httpMethod === 'POST' ||
          endpoint.httpMethod === 'PUT' || endpoint.httpMethod === 'DELETE') {
        patterns.dataCRUD.push(endpoint);
      }

      // 搜索
      if (lowerUrl.includes('/search') || lowerUrl.includes('/query')) {
        patterns.search.push(endpoint);
      }

      // 分页
      if (endpoint.queryParams.has('page') || endpoint.queryParams.has('limit') ||
          endpoint.queryParams.has('offset') || endpoint.queryParams.has('pageSize')) {
        patterns.pagination.push(endpoint);
      }
    }

    // 转换为计数
    for (const key in patterns) {
      patterns[key] = patterns[key].length;
    }

    return patterns;
  }

  /**
   * 健康检查
   */
  performHealthCheck() {
    const checks = [];

    // 检查认证覆盖
    const authCoverage = this.calculateAuthCoverage();
    checks.push({
      name: '认证覆盖',
      status: authCoverage.rate >= 0.8 ? 'good' : authCoverage.rate >= 0.5 ? 'warning' : 'error',
      value: authCoverage,
      recommendation: authCoverage.rate < 0.8 ? '建议为需要认证的 API 添加认证机制' : null,
    });

    // 检查错误处理覆盖
    const errorHandlingCoverage = this.calculateErrorHandlingCoverage();
    checks.push({
      name: '错误处理覆盖',
      status: errorHandlingCoverage.rate >= 0.8 ? 'good' : errorHandlingCoverage.rate >= 0.5 ? 'warning' : 'error',
      value: errorHandlingCoverage,
      recommendation: errorHandlingCoverage.rate < 0.8 ? '建议为所有网络请求添加错误处理' : null,
    });

    // 检查超时设置
    const timeoutCoverage = this.calculateTimeoutCoverage();
    checks.push({
      name: '超时设置',
      status: timeoutCoverage.hasTimeout ? 'good' : 'warning',
      value: timeoutCoverage,
      recommendation: timeoutCoverage.hasTimeout ? null : '建议为网络请求设置超时时间',
    });

    // 检查 HTTPS 使用
    const httpsUsage = this.calculateHttpsUsage();
    checks.push({
      name: 'HTTPS 使用',
      status: httpsUsage.rate === 1 ? 'good' : httpsUsage.rate > 0 ? 'warning' : 'error',
      value: httpsUsage,
      recommendation: httpsUsage.rate < 1 ? '生产环境应使用 HTTPS' : null,
    });

    return checks;
  }

  /**
   * 计算认证覆盖率
   */
  calculateAuthCoverage() {
    let withAuth = 0;
    let total = this.endpoints.size;

    for (const endpoint of this.endpoints.values()) {
      if (endpoint.hasAuth) {
        withAuth++;
      }
    }

    return {
      withAuth,
      total,
      rate: total > 0 ? Math.round(withAuth / total * 100) / 100 : 0,
    };
  }

  /**
   * 计算错误处理覆盖率
   */
  calculateErrorHandlingCoverage() {
    let withHandling = 0;
    let total = this.endpoints.size;

    for (const endpoint of this.endpoints.values()) {
      if (endpoint.hasErrorHandling) {
        withHandling++;
      }
    }

    return {
      withHandling,
      total,
      rate: total > 0 ? Math.round(withHandling / total * 100) / 100 : 0,
    };
  }

  /**
   * 计算超时覆盖率
   */
  calculateTimeoutCoverage() {
    const timeoutHandlers = Array.from(this.errorHandlers.values()).filter(h => h.type === 'timeout');

    return {
      hasTimeout: timeoutHandlers.length > 0,
      count: timeoutHandlers.length,
    };
  }

  /**
   * 计算 HTTPS 使用率
   */
  calculateHttpsUsage() {
    let httpsCount = 0;
    let total = 0;

    for (const endpoint of this.endpoints.values()) {
      if (endpoint.fullUrl && endpoint.fullUrl.startsWith('http')) {
        total++;
        if (endpoint.fullUrl.startsWith('https://')) {
          httpsCount++;
        }
      }
    }

    return {
      httpsCount,
      total,
      rate: total > 0 ? Math.round(httpsCount / total * 100) / 100 : 0,
    };
  }

  /**
   * 获取端点列表
   */
  getEndpointsList() {
    return Array.from(this.endpoints.values()).map(endpoint => ({
      method: endpoint.httpMethod,
      url: endpoint.url,
      fullUrl: endpoint.fullUrl,
      pathParams: endpoint.pathParams,
      queryParams: endpoint.queryParams,  // 保持为 Map
      queryParamsArray: Array.from(endpoint.queryParams.entries()),  // 同时提供 Array 版本
      hasAuth: endpoint.hasAuth,
      hasErrorHandling: endpoint.hasErrorHandling,
      file: endpoint.fileName,
      line: endpoint.line,
    }));
  }

  /**
   * 获取关联列表
   */
  getRelationsList() {
    const list = [];

    for (const [key, relation] of this.apiModelRelations) {
      const [file, line, method] = key.split(':');

      list.push({
        endpoint: `${method} ${this.endpoints.get(key)?.url || ''}`,
        requestModel: relation.requestModel,
        responseModel: relation.responseModel,
        responseType: relation.responseType,
        serializationMethod: relation.serializationMethod,
        deserializationMethod: relation.deserializationMethod,
        file,
        line,
      });
    }

    return list;
  }

  /**
   * 获取错误处理器列表
   */
  getErrorHandlersList() {
    return Array.from(this.errorHandlers.values());
  }

  /**
   * 生成 Mermaid 格式的 API 调用图
   */
  toMermaid() {
    const lines = ['graph TD'];

    // 按资源分组
    const resources = new Map();
    for (const endpoint of this.endpoints.values()) {
      const resource = this.extractResourceName(endpoint.url);
      if (!resources.has(resource)) {
        resources.set(resource, []);
      }
      resources.get(resource).push(endpoint);
    }

    // 添加资源节点
    let nodeId = 0;
    for (const [resource, endpoints] of resources) {
      const resourceNodeId = `resource_${nodeId++}`;
      lines.push(`  "${resourceNodeId}"["${resource}"]`);

      // 添加方法节点
      for (const endpoint of endpoints) {
        const methodNodeId = `method_${nodeId++}`;
        lines.push(`  "${methodNodeId}"["${endpoint.httpMethod}"]`);
        lines.push(`  "${resourceNodeId}" --> "${methodNodeId}"`);

        // 添加认证标记
        if (endpoint.hasAuth) {
          const authNodeId = `auth_${nodeId++}`;
          lines.push(`  "${authNodeId}"["🔒 Auth"]`);
          lines.push(`  "${methodNodeId}" -.-> "${authNodeId}"`);
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * 提取资源名称
   */
  extractResourceName(url) {
    // 移除路径参数和查询字符串
    let cleanUrl = url;
    cleanUrl = cleanUrl.replace(/:\w+/g, '');
    cleanUrl = cleanUrl.replace(/\{\w+\}/g, '');
    cleanUrl = cleanUrl.replace(/\$\{\w+\}/g, '');
    cleanUrl = cleanUrl.replace(/\$\w+/g, '');
    cleanUrl = cleanUrl.split('?')[0];

    const parts = cleanUrl.split('/').filter(p => p && !p.startsWith('v') && !/^\d+$/.test(p));

    return parts.length > 0 ? parts[parts.length - 1] : 'root';
  }

  /**
   * 获取行号
   */
  getLineNumber(content, index) {
    const before = content.substring(0, index);
    return before.split('\n').length;
  }
}

module.exports = FlutterNetworkAnalyzer;
