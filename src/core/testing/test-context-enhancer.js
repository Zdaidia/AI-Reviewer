/**
 * Test Context Enhancer
 *
 * 职责：
 * - 后处理步骤：在 Code Graph 和 AI_CONTEXT.md 生成后执行
 * - 调用 AI 作为"代码语义提炼器"，生成精简的测试上下文
 * - 输出格式专为 AI 测试生成优化
 *
 * 输出：TEST_CONTEXT.json - AI 可以直接基于此文件编写测试用例
 */

const fs = require('fs');
const path = require('path');

class TestContextEnhancer {
  constructor(llmRouter) {
    this.llmRouter = llmRouter;
  }

  /**
   * 主入口：生成测试上下文
   */
  async enhance(projectPath, codeGraph, aiContextPath, options = {}) {
    console.log('[Test Context Enhancer] 开始提炼测试上下文...');

    const log = options.log || ((type, msg) => console.log(`[${type}] ${msg}`));
    const progressCallback = options.onProgress; // 新增：进度回调

    // 1. 读取 AI_CONTEXT.md
    const aiContext = await this.loadAIContext(aiContextPath, log);

    // 2. 提取 Code Graph 的关键信息
    const codeGraphSummary = this.summarizeCodeGraph(codeGraph, log);

    // 3. 判断是否需要分批处理
    const useBatchProcessing = codeGraphSummary.pages.length > 10 ||
                                codeGraphSummary.controllers.length > 15;

    let refined;

    if (useBatchProcessing) {
      log('分批处理', `页面数(${codeGraphSummary.pages.length})或控制器数(${codeGraphSummary.controllers.length})过多，启用分批处理`);
      refined = await this.batchProcess(aiContext, codeGraphSummary, projectPath, log, progressCallback);
    } else {
      const prompt = this.buildRefinerPrompt(aiContext, codeGraphSummary, projectPath);
      log('AI提炼', '正在调用 AI 提炼代码语义...');
      refined = await this.callLLMRefiner(prompt, log);
    }

    // 4. 保存结果（文件名不再带项目名前缀，因为已保存在项目专属目录 .dev-qa/）
    const outputPath = options.outputPath || path.join(
      path.dirname(aiContextPath),
      'TEST_CONTEXT.json'
    );

    fs.writeFileSync(outputPath, JSON.stringify(refined, null, 2), 'utf-8');
    log('保存成功', `测试上下文已保存到: ${outputPath}`);

    return {
      success: true,
      outputPath,
      context: refined,
    };
  }

  /**
   * 加载 AI_CONTEXT.md
   */
  async loadAIContext(aiContextPath, log) {
    if (!fs.existsSync(aiContextPath)) {
      log('警告', 'AI_CONTEXT.md 不存在');
      return '';
    }
    const content = fs.readFileSync(aiContextPath, 'utf-8');
    log('加载', `已加载 AI_CONTEXT.md (${content.length} 字符)`);
    return content;
  }

  /**
   * 分批处理：按模块分组逐个生成
   * 优化版本：优先直接从 AST 生成，减少 LLM 调用
   */
  async batchProcess(aiContext, codeGraphSummary, projectPath, log, progressCallback) {
    const allFeatures = [];
    const allTestTargets = [];

    const pageGroups = this.groupPagesByModule(codeGraphSummary.pages);
    log('分批处理', `已将 ${codeGraphSummary.pages.length} 个页面分组为 ${pageGroups.length} 个模块`);

    let successCount = 0;
    let timeoutCount = 0;

    // 新增：直接从 AST 生成功能（不使用 LLM）
    for (let i = 0; i < pageGroups.length; i++) {
      const group = pageGroups[i];
      const moduleName = `${group.name} (${group.pages.length}页)`;
      log('处理模块', `正在处理模块: ${group.name} (${group.pages.length} 个页面)`);

      // 发送进度更新到前端
      if (progressCallback) {
        progressCallback({
          current: moduleName,
          total: pageGroups.length,
          index: i + 1
        });
      }

      const relatedControllers = this.getRelatedControllers(group.pages, codeGraphSummary.controllers);

      // 优先尝试直接生成（传递所有类信息以提取 Provider API）
      const allClasses = [
        ...codeGraphSummary.controllers,
        ...codeGraphSummary.services,
        ...(codeGraphSummary.allClasses || [])
      ];
      const directFeatures = this.generateFeaturesDirectly(group, relatedControllers, codeGraphSummary.apiCalls, projectPath, allClasses);
      if (directFeatures.length > 0) {
        allFeatures.push(...directFeatures);
        successCount++;
        log('模块直接生成', `${group.name}: 已生成 ${directFeatures.length} 个功能点（无需 LLM）`);
        continue;
      }

      // 如果直接生成失败，使用 LLM
      const prompt = this.buildModulePrompt(group, relatedControllers, codeGraphSummary.services, codeGraphSummary.routes, codeGraphSummary.apiCalls, projectPath);

      try {
        const result = await this.callLLMRefiner(prompt, log);
        if (result.features && result.features.length > 0) {
          allFeatures.push(...result.features);
          successCount++;
          log('模块成功', `${group.name}: 已生成 ${result.features.length} 个功能点`);
        } else {
          log('模块空结果', `${group.name}: AI 返回空结果`);
        }
        if (result.test_targets) {
          allTestTargets.push(...result.test_targets);
        }
      } catch (error) {
        if (error.message.includes('超时')) {
          timeoutCount++;
        }
        log('模块失败', `${group.name}: ${error.message}，跳过此模块`);
      }
    }

    log('分批处理总结', `成功: ${successCount}/${pageGroups.length} 个模块, 超时: ${timeoutCount}, 总功能点: ${allFeatures.length}`);

    return {
      features: allFeatures,
      test_targets: allTestTargets,
    };
  }

  /**
   * 直接从 AST 生成功能点（不使用 LLM）
   * @param {Object} group - 页面分组
   * @param {Array} controllers - 相关控制器列表
   * @param {Array} apiCalls - 全局 API 调用
   * @param {string} projectPath - 项目路径
   * @param {Array} allClasses - 所有类（包含 Provider 类）
   */
  generateFeaturesDirectly(group, controllers, apiCalls, projectPath, allClasses = []) {
    const features = [];

    for (const page of group.pages) {
      // 使用页面类名作为功能名称（英文）
      const featureName = page.name.replace(/Page|Screen|View$/g, '');
      const pageNameBase = page.name.replace(/Page|Screen|View$/g, '').toLowerCase();

      // 查找相关的控制器
      const pageControllers = controllers.filter(c => {
        const controllerName = c.name.replace(/Controller$/, '').toLowerCase();
        const pageName = page.name.replace(/Page|Screen|View$/g, '').toLowerCase();
        return controllerName.includes(pageName) || pageName.includes(controllerName);
      });

      // 查找相关的 Provider（只提取与页面相关的）
      const relatedProviders = this.findRelatedProviders(page.name, pageControllers, allClasses, projectPath);

      // 提取 UI 元素
      const uiElements = { inputs: [], buttons: [], lists: [], dialogs: [], others: [] };

      for (const controller of pageControllers) {
        const uiProps = controller.uiProperties || { inputs: [], dropdowns: [], checkboxes: [], lists: [], others: [] };
        const actions = controller.actionMethods || { add: [], edit: [], delete: [], save: [], submit: [], cancel: [], search: [], reset: [], load: [], other: [] };

        // 提取输入框
        if (uiProps.inputs && uiProps.inputs.length > 0) {
          uiProps.inputs.forEach(input => {
            uiElements.inputs.push({
              name: input.name,
              type: input.type || 'text_field',
              placeholder: input.name
            });
          });
        }

        // 提取下拉框
        if (uiProps.dropdowns && uiProps.dropdowns.length > 0) {
          uiProps.dropdowns.forEach(dropdown => {
            uiElements.inputs.push({
              name: dropdown.name,
              type: 'dropdown',
              placeholder: dropdown.name
            });
          });
        }

        // 提取列表
        if (uiProps.lists && uiProps.lists.length > 0) {
          uiProps.lists.forEach(list => {
            uiElements.lists.push({
              name: list.name,
              type: 'list'
            });
          });
        }

        // 提取操作按钮
        const buttonTypes = [
          { key: 'save', type: 'submit_button' },
          { key: 'submit', type: 'submit_button' },
          { key: 'add', type: 'button' },
          { key: 'edit', type: 'edit_button' },
          { key: 'delete', type: 'delete_button' },
          { key: 'cancel', type: 'cancel_button' },
          { key: 'search', type: 'button' },
          { key: 'reset', type: 'button' },
        ];

        for (const { key, type } of buttonTypes) {
          if (actions[key] && actions[key].length > 0) {
            actions[key].forEach(method => {
              const methodName = typeof method === 'string' ? method : method.name;
              uiElements.buttons.push({
                name: methodName,
                type: type,
                action: methodName
              });
            });
          }
        }
      }

      // 提取 API 调用（只提取与页面相关的 Provider API）
      const extractedApiCalls = this.extractApiCallsFromProviders(relatedProviders);

      // 提取 core_methods 并去重
      const allMethods = pageControllers.flatMap(c => (c.methods || []).map(m => typeof m === 'string' ? m : m.name));
      const uniqueMethods = [...new Set(allMethods)];

      features.push({
        name: featureName,
        entry_points: [page.name],
        controllers: pageControllers.map(c => c.name),
        core_methods: uniqueMethods,
        api_calls: extractedApiCalls,
        ui_elements: uiElements,
        route: this.generateRouteName(page.name),
        state: ['idle', 'loading', 'success', 'error']
      });
    }

    return features;
  }

  /**
   * 缓存路由到 Provider 的映射表
   * 格式：{ "LoginPage": ["AccountLoginProvider"], "Basic24Page": ["Basic24Provider"] }
   */
  _routeProviderCache = null;

  /**
   * 解析路由配置文件，建立页面到 Provider 的映射
   * @param {string} projectPath - 项目路径
   * @returns {Object} 页面到 Provider 的映射表
   */
  parseRouteProviderMapping(projectPath) {
    // 如果已经解析过，直接返回缓存
    if (this._routeProviderCache) {
      return this._routeProviderCache;
    }

    const mapping = {};
    const appPagesPath = path.join(projectPath, 'lib/routes/app_pages.dart');

    if (!fs.existsSync(appPagesPath)) {
      console.log('[Route Parser] app_pages.dart not found, will use name-based matching');
      this._routeProviderCache = mapping;
      return mapping;
    }

    try {
      const content = fs.readFileSync(appPagesPath, 'utf-8');

      // 1. 解析所有的 binding 类名和对应的路由变量
      // 匹配格式：binding: SomeBinding()
      const bindingRegex = /binding:\s*([A-Z][a-zA-Z0-9_]*)\(\)/g;
      const bindings = [];
      let match;

      while ((match = bindingRegex.exec(content)) !== null) {
        bindings.push(match[1]);
      }

      // 2. 解析路由定义，获取页面类名和 binding 的对应关系
      // 匹配格式：GetPage(name: AppRoutes.xxx, page: () => const SomePage(), binding: SomeBinding())
      // 使用 [\s\S]*? 来匹配跨行内容
      const routeRegex = /GetPage\s*\([\s\S]*?\)/g;
      let routeMatch;

      while ((routeMatch = routeRegex.exec(content)) !== null) {
        const routeContent = routeMatch[1];

        // 提取页面类名: page: () => const Basic24()
        const pageMatch = /page:\s*\(\)\s*=>\s*const\s+([A-Z][a-zA-Z0-9_]*)\s*\(/.exec(routeContent);
        // 提取 binding 类名: binding: Basic24Bindings()
        const bindingMatch = /binding:\s*([A-Z][a-zA-Z0-9_]*Bindings?)\s*\(/.exec(routeContent);

        if (pageMatch && bindingMatch) {
          const pageClassName = pageMatch[1];
          const bindingClassName = bindingMatch[1];
          mapping[pageClassName] = { binding: bindingClassName, providers: [] };
        }
      }

      // 3. 解析每个 binding 文件，提取 Provider 类名
      for (const pageClass in mapping) {
        const bindingClass = mapping[pageClass].binding;
        const providers = this.parseBindingFile(projectPath, bindingClass);
        mapping[pageClass].providers = providers;
      }

      console.log(`[Route Parser] 解析了 ${Object.keys(mapping).length} 个路由到 Provider 的映射`);
      this._routeProviderCache = mapping;
      return mapping;

    } catch (error) {
      console.error('[Route Parser] 解析路由配置失败:', error.message);
      this._routeProviderCache = mapping;
      return mapping;
    }
  }

  /**
   * 解析 binding 文件，提取 Provider 类名
   * @param {string} projectPath - 项目路径
   * @param {string} bindingClassName - Binding 类名
   * @returns {Array} Provider 类名列表
   */
  parseBindingFile(projectPath, bindingClassName) {
    const providers = [];

    // 首先尝试通过 glob 搜索所有 binding 文件
    try {
      const glob = require('glob');

      // 搜索所有 _binding.dart 文件
      const bindingFiles = glob.sync('**/*_binding.dart', {
        cwd: path.join(projectPath, 'lib'),
        ignore: ['**/node_modules/**']
      });

      console.log(`[parseBindingFile] 搜索 Binding: ${bindingClassName}, 找到 ${bindingFiles.length} 个 binding 文件`);

      // 根据绑定类名推断可能的文件名
      // Basic24Bindings -> 可能是 basic_2_4_binding.dart, basic24_binding.dart 等
      const bindingBaseName = bindingClassName.replace('Bindings', '').replace('Binding', '');

      // 对每个 binding 文件进行检查
      for (const bindingFile of bindingFiles) {
        const fullPath = path.join(projectPath, 'lib', bindingFile);
        const fileName = path.basename(bindingFile);

        // 检查文件名是否与绑定类名相关
        // 1. 完全匹配（Basic24Bindings -> basic24_binding.dart）
        // 2. 包含匹配（Basic24Bindings -> basic_2_4_binding.dart）
        const fileNameBase = fileName.replace('_binding.dart', '').toLowerCase();
        const bindingBaseLower = bindingBaseName.toLowerCase();

        // 检查是否匹配
        const isMatch = fileNameBase === bindingBaseLower ||
                       fileNameBase.includes(bindingBaseLower) ||
                       bindingBaseLower.includes(fileNameBase.replace(/_/g, ''));

        if (isMatch) {
          try {
            const bindingContent = fs.readFileSync(fullPath, 'utf-8');

            // 检查文件内容是否包含这个 Binding 类
            if (bindingContent.includes(bindingClassName)) {
              console.log(`[parseBindingFile] 找到匹配的 binding 文件: ${bindingFile}`);

              // 解析 Get.lazyPut(() => ProviderName())
              const lazyPutRegex = /Get\.lazyPut\s*\(\s*\(\)\s*=>\s*([A-Z][a-zA-Z0-9_]*)\(\)/g;
              let providerMatch;

              while ((providerMatch = lazyPutRegex.exec(bindingContent)) !== null) {
                const providerName = providerMatch[1];
                if (providerName.endsWith('Provider')) {
                  providers.push(providerName);
                  console.log(`[parseBindingFile] 找到 Provider: ${providerName}`);
                }
              }

              // 找到匹配后就停止
              break;
            }
          } catch (e) {
            // 继续尝试下一个文件
          }
        }
      }
    } catch (e) {
      console.log(`[parseBindingFile] glob 搜索失败: ${e.message}`);
    }

    return providers;
  }

  /**
   * 将 PascalCase 转换为 snake_case
   * @param {string} str - PascalCase 字符串
   * @returns {string} snake_case 字符串
   */
  convertToSnakeCase(str) {
    return str
      .replace(/([A-Z])/g, '_$1')
      .toLowerCase()
      .replace(/^_/, '');
  }

  /**
   * 查找与页面相关的 Provider 类
   * 优化版：优先使用路由配置中的映射，其次使用 Controller 属性引用，最后使用名称匹配
   * @param {string} pageClassName - 页面类名
   * @param {Array} pageControllers - 页面相关的 Controller
   * @param {Array} allClasses - 所有类
   * @param {string} projectPath - 项目路径
   * @returns {Array} 相关的 Provider 类列表
   */
  findRelatedProviders(pageClassName, pageControllers, allClasses, projectPath = null) {
    const relatedProviders = [];
    const pageNameBase = pageClassName.replace(/Page|Screen|View$/g, '');
    const pageNameLower = pageNameBase.toLowerCase();

    console.log(`[findRelatedProviders] 页面: ${pageClassName} (基础名: ${pageNameBase})`);

    // 1. 优先使用路由配置中的映射（最准确）
    if (projectPath) {
      const routeMapping = this.parseRouteProviderMapping(projectPath);
      if (routeMapping[pageClassName] && routeMapping[pageClassName].providers.length > 0) {
        const providerNames = routeMapping[pageClassName].providers;
        console.log(`[findRelatedProviders] 通过路由找到 Providers: ${providerNames.join(', ')}`);
        for (const providerName of providerNames) {
          const provider = allClasses.find(c => c.name === providerName);
          if (provider && !relatedProviders.includes(provider)) {
            relatedProviders.push(provider);
          }
        }
        // 如果通过路由找到了 Provider，直接返回
        if (relatedProviders.length > 0) {
          return relatedProviders;
        }
      }
    }

    // 2. 通过 Controller 的属性引用查找（次选）
    // 例如：Controller 中有 `final AccountLoginProvider _apiConnect`
    // 扩展：也支持 Service、Repository、Api 等类型
    for (const controller of pageControllers) {
      if (controller.properties) {
        for (const prop of controller.properties) {
          // 检查属性类型是否是 API 相关类
          if (prop.type && (
            prop.type.endsWith('Provider') ||
            prop.type.endsWith('Service') ||
            prop.type.endsWith('Repository') ||
            prop.type.includes('Api') ||
            prop.type.includes('Http') ||
            prop.type.includes('Client')
          )) {
            const apiClass = allClasses.find(c => c.name === prop.type);
            if (apiClass && !relatedProviders.includes(apiClass)) {
              console.log(`[findRelatedProviders] 通过属性找到: ${apiClass.name} (来自 ${controller.name}.${prop.name})`);
              relatedProviders.push(apiClass);
            }
          }
        }
      }
    }

    // 3. 如果 Controller 中没有找到，按名称匹配（兜底）
    if (relatedProviders.length === 0) {
      // 扩展：也匹配 Service、Repository、Api 等类
      const apiClasses = allClasses.filter(c =>
        c.name && (
          c.name.endsWith('Provider') ||
          c.name.endsWith('Service') ||
          c.name.endsWith('Repository') ||
          c.name.includes('Api') ||
          c.name.includes('Http') ||
          c.name.includes('Client')
        )
      );

      console.log(`[findRelatedProviders] 尝试名称匹配，找到 ${apiClasses.length} 个 API 类`);

      for (const apiClass of apiClasses) {
        // 移除后缀进行名称匹配
        const apiNameBase = apiClass.name
          .replace(/Provider|Service|Repository|Api|Http|Client/g, '')
          .toLowerCase();

        // 完全匹配
        if (apiNameBase === pageNameLower) {
          console.log(`[findRelatedProviders] 完全匹配: ${apiClass.name} (${apiNameBase} === ${pageNameLower})`);
          relatedProviders.push(apiClass);
          continue;
        }

        // 更严格的包含匹配：限制匹配长度，避免过度匹配
        // 只有当 apiNameBase 的长度 >= pageNameLower 的 50% 时才进行包含匹配
        // 并且 apiNameBase 必须是 pageNameLower 的子串，或者反之
        const minMatchLength = Math.max(pageNameLower.length * 0.5, 3);
        if (apiNameBase.length >= minMatchLength) {
          // 检查是否是有效的包含关系
          if (pageNameLower.includes(apiNameBase) && apiNameBase.length > 2) {
            console.log(`[findRelatedProviders] 包含匹配: ${apiClass.name} (${pageNameLower} 包含 ${apiNameBase})`);
            relatedProviders.push(apiClass);
          }
        }
      }
    }

    console.log(`[findRelatedProviders] 最终匹配结果: ${relatedProviders.map(p => p.name).join(', ') || '无'}`);

    return relatedProviders;
  }

  /**
   * 从指定的 Provider/Service/Repository 类中提取 API 调用
   * @param {Array} providers - API 类列表（Provider、Service、Repository 等）
   * @returns {Array} API 调用列表（格式：METHOD URL）
   */
  extractApiCallsFromProviders(providers) {
    const apiCalls = [];

    console.log(`[extractApiCallsFromProviders] 输入 Providers 数量: ${providers.length}`);
    for (const provider of providers) {
      console.log(`[extractApiCallsFromProviders] 处理 Provider: ${provider.name}, apiMethods 数量: ${provider.apiMethods?.length || 0}`);
    }

    for (const provider of providers) {
      if (provider.apiMethods && provider.apiMethods.length > 0) {
        for (const apiMethod of provider.apiMethods) {
          if (apiMethod.url) {
            apiCalls.push(`${apiMethod.method} ${apiMethod.url}`);
          }
        }
      }
      // 也检查 rawApiMethods（如果有）
      if (provider.rawApiMethods && provider.rawApiMethods.length > 0) {
        for (const apiMethod of provider.rawApiMethods) {
          if (apiMethod.url) {
            const callStr = `${apiMethod.method} ${apiMethod.url}`;
            if (!apiCalls.includes(callStr)) {
              apiCalls.push(callStr);
            }
          }
        }
      }
    }

    console.log(`[extractApiCallsFromProviders] 输出 API Calls 数量: ${apiCalls.length}`);
    if (apiCalls.length > 0) {
      console.log(`[extractApiCallsFromProviders] API Calls: ${apiCalls.slice(0, 5).join(', ')}${apiCalls.length > 5 ? '...' : ''}`);
    }

    return apiCalls;
  }

  /**
   * 从控制器、Provider、Service、Repository 类中提取 API 调用
   * 优先使用提取的实际 API 方法和 URL
   */
  extractApiCallsFromControllers(controllers, globalApiCalls, allClasses = []) {
    const apiCalls = [];

    // 1. 首先尝试从 Provider、Service、Repository 类中提取 API 方法
    const apiClasses = allClasses.filter(c =>
      c.name.endsWith('Provider') ||
      c.name.endsWith('Service') ||
      c.name.endsWith('Repository') ||
      c.name.includes('Api') ||
      c.name.includes('Http') ||
      c.name.includes('Client') ||
      c.superClass === 'BaseConnect'
    );

    for (const apiClass of apiClasses) {
      if (apiClass.apiMethods && apiClass.apiMethods.length > 0) {
        for (const apiMethod of apiClass.apiMethods) {
          if (apiMethod.url) {
            apiCalls.push(`${apiMethod.method} ${apiMethod.url}`);
          }
        }
      }
    }

    // 2. 如果找到 API 调用，直接返回
    if (apiCalls.length > 0) {
      return apiCalls;
    }

    // 3. 从控制器的相关 API 类中查找
    for (const controller of controllers) {
      const controllerName = controller.name.replace('Controller', '').toLowerCase();

      // 查找匹配的 API 类（Provider、Service、Repository）
      const matchingApiClass = apiClasses.find(c => {
        const apiClassName = c.name
          .replace(/Provider|Service|Repository|Api|Http|Client/g, '')
          .toLowerCase();
        return apiClassName.includes(controllerName) || controllerName.includes(apiClassName);
      });

      if (matchingApiClass && matchingApiClass.apiMethods) {
        for (const apiMethod of matchingApiClass.apiMethods) {
          if (apiMethod.url) {
            apiCalls.push(`${apiMethod.method} ${apiMethod.url}`);
          }
        }
      }
    }

    // 4. 如果有 API 调用，直接返回
    if (apiCalls.length > 0) {
      return apiCalls;
    }

    // 5. 如果有全局 API 调用且有 URL，优先使用
    if (globalApiCalls && globalApiCalls.length > 0) {
      const validApiCalls = globalApiCalls
        .filter(api => api.url)
        .map(api => `${api.method || 'GET'} ${api.url}`);
      if (validApiCalls.length > 0) {
        return validApiCalls;
      }
    }

    // 6. 最后回退：从控制器方法名推断
    for (const controller of controllers) {
      const methods = controller.methods || [];

      for (const method of methods) {
        const methodName = typeof method === 'string' ? method : (method.name || '');
        const lowerName = methodName.toLowerCase();

        // 根据方法名推断 API 调用
        if (lowerName.includes('get') || lowerName.includes('fetch') || lowerName.includes('load')) {
          apiCalls.push(`GET /api/${methodName.replace(/get|fetch|load/gi, '').toLowerCase()}`);
        } else if (lowerName.includes('save') || lowerName.includes('create') || lowerName.includes('add')) {
          apiCalls.push(`POST /api/${methodName.replace(/save|create|add/gi, '').toLowerCase()}`);
        } else if (lowerName.includes('update') || lowerName.includes('edit') || lowerName.includes('modify')) {
          apiCalls.push(`PUT /api/${methodName.replace(/update|edit|modify/gi, '').toLowerCase()}`);
        } else if (lowerName.includes('delete') || lowerName.includes('remove')) {
          apiCalls.push(`DELETE /api/${methodName.replace(/delete|remove/gi, '').toLowerCase()}`);
        }
      }
    }

    return apiCalls.length > 0 ? apiCalls : [];
  }

  /**
   * 按页面名称前缀分组，大模块自动拆分
   */
  groupPagesByModule(pages) {
    const groups = new Map();

    for (const page of pages) {
      let coreName = page.name.replace(/Page|Screen|View|Widget$/g, '').toLowerCase();
      let groupName = 'other';

      if (coreName.includes('login') || coreName.includes('auth')) {
        groupName = 'auth';
      } else if (coreName.includes('home') || coreName.includes('main') || coreName.includes('dashboard')) {
        groupName = 'main';
      } else if (coreName.includes('menu') || coreName.includes('navigation')) {
        groupName = 'navigation';
      } else if (coreName.includes('list') || coreName.includes('search') || coreName.includes('query')) {
        groupName = 'list';
      } else if (coreName.includes('detail') || coreName.includes('info')) {
        groupName = 'detail';
      } else if (coreName.includes('form') || coreName.includes('edit') || coreName.includes('create') || coreName.includes('add')) {
        groupName = 'form';
      } else if (coreName.includes('setting') || coreName.includes('config') || coreName.includes('profile')) {
        groupName = 'settings';
      } else {
        groupName = coreName.charAt(0) || 'other';
      }

      if (!groups.has(groupName)) {
        groups.set(groupName, { name: groupName, pages: [] });
      }
      groups.get(groupName).pages.push(page);
    }

    // 拆分大模块：超过 10 个页面的模块进一步拆分
    const result = [];
    for (const [name, group] of groups) {
      if (group.pages.length > 10) {
        // 按首字母进一步拆分
        const subGroups = new Map();
        for (const page of group.pages) {
          const subName = page.name.charAt(0).toLowerCase();
          if (!subGroups.has(subName)) {
            subGroups.set(subName, { name: `${name}-${subName}`, pages: [] });
          }
          subGroups.get(subName).pages.push(page);
        }
        // 添加子分组到结果
        for (const subGroup of subGroups.values()) {
          result.push(subGroup);
        }
      } else {
        result.push(group);
      }
    }

    return result;
  }

  /**
   * 获取与页面相关的控制器
   */
  getRelatedControllers(pages, controllers) {
    const pageNames = pages.map(p => p.name.toLowerCase());
    const related = [];

    for (const controller of controllers) {
      const controllerName = controller.name.toLowerCase().replace('controller', '');
      for (const pageName of pageNames) {
        if (pageName.includes(controllerName) || controllerName.includes(pageName)) {
          related.push(controller);
          break;
        }
      }
    }

    return related;
  }

  /**
   * 生成路由名称（从页面类名转换）
   * MainApp -> main_app
   * OffsetComparisonExclusionMaintenance -> offset_comparison_exclusion_maintenance
   */
  generateRouteName(pageName) {
    // 移除常见后缀
    let route = pageName.replace(/Page|Screen|View|Widget$/g, '');

    // 转换为小写
    route = route.toLowerCase();

    // 将驼峰命名转换为下划线分隔
    route = route.replace(/([a-z])([A-Z])/g, '$1_$2');

    // 处理连续的大写字母（如 API -> a_p_i，保持简单处理）
    route = route.replace(/([A-Z]+)(?=[a-z]|$)/g, (match) => match.toLowerCase() + '_');
    // 清理多余的下划线
    route = route.replace(/_+/g, '_').replace(/^_|_$/g, '');

    return route || pageName.toLowerCase();
  }

  /**
   * 构建单个模块的提示词
   */
  buildModulePrompt(group, controllers, services, routes, apiCalls, projectPath) {
    // 使用增强的 uiProperties 和 actionMethods（AST 直接提取的结构化信息）
    const controllerInfo = controllers.map(c => {
      // 优先使用 uiProperties（AST 直接提取的 UI 元素）
      const uiProps = c.uiProperties || { inputs: [], dropdowns: [], checkboxes: [], lists: [], others: [] };
      const actions = c.actionMethods || { add: [], edit: [], delete: [], save: [], submit: [], cancel: [], search: [], reset: [], load: [], other: [] };

      // 提取 UI 元素详情
      const inputs = uiProps.inputs || [];
      const dropdowns = uiProps.dropdowns || [];
      const checkboxes = uiProps.checkboxes || [];
      const lists = uiProps.lists || [];
      const others = uiProps.others || [];

      // 提取操作方法
      const actionButtons = [
        ...(actions.save || []).map(m => typeof m === 'string' ? { name: m, type: 'save' } : { ...m, type: 'save' }),
        ...(actions.submit || []).map(m => typeof m === 'string' ? { name: m, type: 'submit' } : { ...m, type: 'submit' }),
        ...(actions.add || []).map(m => typeof m === 'string' ? { name: m, type: 'add' } : { ...m, type: 'add' }),
        ...(actions.edit || []).map(m => typeof m === 'string' ? { name: m, type: 'edit' } : { ...m, type: 'edit' }),
        ...(actions.delete || []).map(m => typeof m === 'string' ? { name: m, type: 'delete' } : { ...m, type: 'delete' }),
        ...(actions.cancel || []).map(m => typeof m === 'string' ? { name: m, type: 'cancel' } : { ...m, type: 'cancel' }),
        ...(actions.search || []).map(m => typeof m === 'string' ? { name: m, type: 'search' } : { ...m, type: 'search' }),
        ...(actions.reset || []).map(m => typeof m === 'string' ? { name: m, type: 'reset' } : { ...m, type: 'reset' }),
      ];

      return {
        name: c.name,
        inputs,        // AST 提取的输入框
        dropdowns,     // AST 提取的下拉框
        checkboxes,    // AST 提取的复选框
        lists,         // AST 提取的列表
        actionButtons, // AST 提取的操作方法
        others         // 其他 UI 元素
      };
    });

    const pagesList = group.pages.map(p => p.name).join(', ');
    const controllersList = controllers.map(c => c.name).join(', ') || '无';

    // 构建 AST 提取信息的详细描述
    const astInfoDetails = controllerInfo.map(c => {
      const parts = [];
      parts.push(`## ${c.name}`);

      if (c.inputs.length > 0) {
        parts.push(`  输入框: ${c.inputs.map(i => `${i.name}(${i.type || 'text_field'})`).join(', ')}`);
      }
      if (c.dropdowns.length > 0) {
        parts.push(`  下拉框: ${c.dropdowns.map(d => d.name).join(', ')}`);
      }
      if (c.checkboxes.length > 0) {
        parts.push(`  复选框: ${c.checkboxes.map(ch => ch.name).join(', ')}`);
      }
      if (c.lists.length > 0) {
        parts.push(`  列表: ${c.lists.map(l => l.name).join(', ')}`);
      }
      if (c.actionButtons.length > 0) {
        parts.push(`  操作方法: ${c.actionButtons.map(b => `${b.name}(${b.type})`).join(', ')}`);
      }
      return parts.join('\n');
    }).join('\n\n');

    // 添加 API 调用信息（从代码中实际提取的）
    const apiCallDetails = apiCalls && apiCalls.length > 0
      ? apiCalls
          .filter(api => api.url) // 只包含有实际 URL 的 API 调用
          .map(api => `  ${api.method || 'GET'} ${api.url}`)
          .join('\n')
      : '未检测到明确的 API 调用';

    return `你是测试上下文生成器，专门为自动化测试生成结构化的功能描述。

# 当前模块页面
${pagesList}

# AST 代码分析结果（直接从源代码提取的 UI 元素）
${astInfoDetails || '未检测到明确的 UI 元素'}

# 实际 API 调用（从代码中直接提取，必须使用这些 URL）
${apiCallDetails}

# ⚠️ 输出格式要求（必须严格遵守）

## 关键约束
1. ui_elements.inputs 必须是对象数组，每个对象包含 name/type/placeholder 字段
2. ui_elements.buttons 必须是对象数组，每个对象包含 name/type/action 字段
3. ui_elements 不能是字符串数组！
4. user_flow.steps 必须是对象数组，每个对象包含 action/details 字段

## 正确示例（必须照此格式输出）

\`\`\`json
{
  "features": [
    {
      "name": "登录功能",
      "entry_points": ["LoginPage"],
      "controllers": ["LoginController"],
      "core_methods": ["login"],
      "api_calls": ["/api/login"],
      "ui_elements": {
        "inputs": [
          {"name": "username_field", "type": "text_field", "placeholder": "用户名"},
          {"name": "password_field", "type": "password_field", "placeholder": "密码"}
        ],
        "buttons": [
          {"name": "login_button", "type": "submit_button", "action": "onLogin"}
        ],
        "lists": [],
        "dialogs": [],
        "others": []
      },
      "navigation": {"from": "MainPage", "to": "LoginPage", "trigger": "点击登录"},
      "state": ["loading", "success", "error"],
      "user_flow": {
        "steps": [
          {"action": "用户输入", "details": "在username_field输入用户名"},
          {"action": "用户输入", "details": "在password_field输入密码"},
          {"action": "用户点击", "details": "点击login_button"},
          {"action": "系统调用API", "details": "调用 /api/login 接口"},
          {"action": "成功路径", "details": "登录成功，跳转到首页，显示用户信息"},
          {"action": "失败路径", "details": "登录失败，显示错误提示，停留在登录页"}
        ]
      }
    }
  ],
  "test_targets": ["验证用户名密码正确时能成功登录", "验证用户名密码错误时显示错误提示"]
}
\`\`\`

## 错误示例（禁止使用）

❌ 错误: "inputs": ["用户名输入框", "密码输入框"]
✅ 正确: "inputs": [{"name": "username_field", "type": "text_field", "placeholder": "用户名"}]

❌ 错误: "buttons": ["登录按钮", "取消按钮"]
✅ 正确: "buttons": [{"name": "login_button", "type": "submit_button", "action": "onLogin"}]

❌ 错误: "user_flow": {"steps": ["用户输入→系统验证"]}
✅ 正确: "user_flow": {"steps": [{"action": "用户输入", "details": "在username_field输入用户名"}]}

# ui_elements 结构化要求

**inputs 类型**：
- text_field: 文本输入框
- password_field: 密码输入框
- email_field: 邮箱输入框
- number_field: 数字输入框
- dropdown: 下拉选择框
- checkbox: 复选框
- radio: 单选框
- date_picker: 日期选择器
- search_field: 搜索框

**buttons 类型**：
- button: 普通按钮
- submit_button: 提交按钮
- cancel_button: 取消按钮
- delete_button: 删除按钮
- edit_button: 编辑按钮
- link: 链接按钮
- icon_button: 图标按钮

**每个元素必须包含**：
- name: 英文命名（如: username_field, submit_button）
- type: 元素类型
- placeholder/label: 显示文本（如果有）
- action: 触发方法（仅按钮需要）

# user_flow 步骤要求

**每个步骤必须包含**：
1. action: 操作类型（用户输入/系统调用API/可验证结果）
2. details: 详细描述

# API 调用要求（重要）

**必须使用上面"实际 API 调用"部分列出的 URL，不要推断！**
- 如果检测到 API 调用（如 "GET /api/users"），则 api_calls 字段必须使用这些 URL
- 如果没有检测到明确的 API 调用，可以留空数组或根据功能合理推断
- api_calls 格式: ["方法 URL", ...] 例如: ["GET /api/users", "POST /api/login"]


**必须包含**：
- 至少 1 个成功路径（所有步骤都成功）
- 至少 1 个失败路径（在某一步失败）

**示例**：
\`\`\`json
"user_flow": {
  "steps": [
    {"action": "用户输入", "details": "在username_field输入 'admin'"},
    {"action": "用户输入", "details": "在password_field输入 '123456'"},
    {"action": "用户点击", "details": "点击submit_button"},
    {"action": "系统调用API", "details": "调用 /api/login 接口"},
    {"action": "成功路径", "details": "返回200，跳转到首页，显示欢迎信息"},
    {"action": "失败路径", "details": "返回401，显示'用户名或密码错误'，停留在登录页"}
  ]
}
\`\`\`

# ⚠️ 重要：使用 AST 代码分析结果

**你必须优先使用上面 "AST 代码分析结果" 部分的信息！**

1. 如果 AST 已提取输入框（inputs），直接使用，不要推断
2. 如果 AST 已提取操作方法（actionButtons），直接使用，不要推断
3. 只有当 AST 信息不足时，才根据控制器名称推断

## UI 元素映射规则

将 AST 提取的元素转换为测试用例格式：

| AST 元素类型 | 转换为 ui_elements 类型 |
|-------------|------------------------|
| TextEditingController | inputs: {name, type: "text_field"} |
| Rx<String>, Rx<int> 等 | inputs: {name, type: 根据变量名推断} |
| save/submit 方法 | buttons: {name: 方法名, type: "submit_button", action: 方法名} |
| add 方法 | buttons: {name: 方法名, type: "button", action: 方法名} |
| edit 方法 | buttons: {name: 方法名, type: "edit_button", action: 方法名} |
| delete 方法 | buttons: {name: 方法名, type: "delete_button", action: 方法名} |
| cancel 方法 | buttons: {name: 方法名, type: "cancel_button", action: 方法名} |
| search 方法 | buttons: {name: 方法名, type: "button", action: 方法名} |

## 命名规则
- **name**: 使用变量/方法的原始名称（如 usernameController → username_field）
- **type**: 从预定义类型选择（text_field, password_field, dropdown, submit_button 等）
- **action**: 使用方法名（如 onLogin, handleSubmit）

## API 推断规则
只有当代码没有明确 API 时才根据功能名推断：
- login → /api/login
- getList → /api/list
- getData → /api/get
- save, create → /api/save
- update → /api/update
- delete → /api/delete

## 输出要求
1. 每个页面至少生成 1 个功能
2. 按用户行为拆分功能，不要把多个操作合并
3. name 字段使用英文 snake_case（如 username_field）
4. **优先使用 AST 分析结果，不要凭空推断不存在的 UI 元素**

请直接输出 JSON，不要包含其他说明：`;
  }

  /**
   * 提炼 Code Graph 关键信息
   */
  summarizeCodeGraph(codeGraph, log) {
    const summary = {
      metadata: codeGraph.metadata || {},
      totalNodes: codeGraph.nodes?.length || codeGraph.nodes?.size || 0,
      totalEdges: codeGraph.edges?.length || codeGraph.edges?.size || 0,
      pages: [],
      controllers: [],
      services: [],
      repositories: [],
      routes: [],
      widgets: [],
    };

    // 处理 nodes - 支持数组格式
    let nodesArray = [];
    if (Array.isArray(codeGraph.nodes)) {
      nodesArray = codeGraph.nodes;
    } else if (codeGraph.nodes instanceof Map) {
      nodesArray = Array.from(codeGraph.nodes.values());
    } else if (typeof codeGraph.nodes === 'object') {
      nodesArray = Object.values(codeGraph.nodes || {});
    }

    // 处理 edges - 支持数组格式
    let edgesArray = [];
    if (Array.isArray(codeGraph.edges)) {
      edgesArray = codeGraph.edges;
    } else if (codeGraph.edges instanceof Map) {
      edgesArray = Array.from(codeGraph.edges.values());
    } else if (typeof codeGraph.edges === 'object') {
      edgesArray = Object.values(codeGraph.edges || {});
    }

    // 创建节点查找映射
    const nodesMap = new Map();
    for (const node of nodesArray) {
      nodesMap.set(node.id || node.name, node);
    }

    for (const node of nodesArray) {
      if (node.type !== 'class') continue;

      const superClass = node.superClass || node.extends || node.pendingInheritance || '';
      const body = node.body || '';
      const filePath = node.fileName ? `lib/${node.fileName}` : (node.filePath || '');

      // Controllers
      if (node.name && node.name.endsWith('Controller')) {
        // 使用新提取的信息（如果可用）
        const uiProps = node.uiProperties || { inputs: [], dropdowns: [], checkboxes: [], lists: [], others: [] };
        const actions = node.actionMethods || { add: [], edit: [], delete: [], save: [], submit: [], cancel: [], search: [], reset: [], load: [], other: [] };
        const properties = node.properties || [];
        const methods = node.methods || [];

        // 提取 obs 变量
        const obsVars = properties
          .filter(p => p.type && (p.type.startsWith('Rx<') || p.type === 'RxBool'))
          .map(p => p.name);

        // 提取输入变量
        const inputVars = properties
          .filter(p => p.type && (
            p.type.includes('TextEditingController') ||
            p.type.includes('TextField') ||
            p.type === 'String' && p.name.toLowerCase().includes('controller')
          ))
          .map(p => p.name);

        // 提取按钮方法
        const buttonMethods = [
          ...actions.add,
          ...actions.edit,
          ...actions.delete,
          ...actions.save,
          ...actions.submit,
          ...actions.cancel,
          ...actions.search,
        ].map(m => typeof m === 'string' ? m : m.name);

        // 公共方法
        const publicMethods = methods
          .filter(m => {
            const methodName = typeof m === 'string' ? m : m.name || '';
            return methodName && !methodName.startsWith('_');
          })
          .map(m => ({
            name: typeof m === 'string' ? m : m.name,
            returnType: (typeof m === 'object' ? m.returnType : 'void') || 'void',
          }));

        summary.controllers.push({
          name: node.name,
          filePath,
          obsVariables: obsVars,
          inputVariables: inputVars,
          buttonMethods: buttonMethods,
          publicMethods,
          // 新增：UI 属性信息
          uiProperties: uiProps,
          actionMethods: actions,
          properties: properties,
          methods: methods,
        });
      }

      // Pages
      else if (this.isPageClass(node, superClass)) {
        summary.pages.push({
          name: node.name,
          filePath,
          baseClass: superClass,
        });
      }

      // Services
      else if (node.name && node.name.endsWith('Service')) {
        const apiMethods = [];
        if (node.methods && Array.isArray(node.methods)) {
          for (const method of node.methods) {
            const methodName = typeof method === 'string' ? method : method.name;
            if (methodName) {
              const lower = methodName.toLowerCase();
              if (lower.includes('fetch') || lower.includes('get') || lower.includes('post') ||
                  lower.includes('api')) {
                apiMethods.push(methodName);
              }
            }
          }
        }

        summary.services.push({
          name: node.name,
          filePath,
          apiMethods,
          allMethods: (node.methods || []).map(m => typeof m === 'string' ? m : m.name),
        });
      }

      // Providers, Services, Repositories - 使用直接提取的 apiMethods（包含实际 URL）
      // 扩展检测范围：Provider、Service、Repository、Api 等类都包含 API 调用
      else if (node.name && (
        node.name.endsWith('Provider') ||
        node.name.endsWith('Service') ||
        node.name.endsWith('Repository') ||
        node.name.includes('Api') ||
        node.name.includes('Http') ||
        node.name.includes('Client') ||
        superClass === 'BaseConnect'
      )) {
        // 优先使用提取的 apiMethods（包含实际 HTTP 方法和 URL）
        const apiMethods = node.apiMethods || [];

        summary.services.push({
          name: node.name,
          filePath,
          apiMethods: apiMethods.map(m => `${m.method} ${m.url}`),
          allMethods: (node.methods || []).map(m => typeof m === 'string' ? m : m.name),
          // 保留原始 apiMethods 供后续使用
          rawApiMethods: apiMethods,
          // 标记类型
          type: node.name.endsWith('Provider') ? 'Provider' :
                 node.name.endsWith('Service') ? 'Service' :
                 node.name.endsWith('Repository') ? 'Repository' : 'Other',
        });
      }

      // Widgets
      if (superClass && (superClass.includes('Widget') || superClass.includes('StatelessWidget') ||
          superClass.includes('StatefulWidget') || superClass.includes('GetView'))) {
        summary.widgets.push({
          name: node.name,
          filePath,
          baseClass: superClass,
        });
      }
    }

    // 提取路由信息
    for (const node of nodesArray) {
      if (!node.body) continue;
      const routeMatches = node.body.matchAll(/GetPage\(\s*name:\s*['"]([^'"]+)['"]\s*,\s*page:\s*=>(\w+)/g);
      for (const match of routeMatches) {
        summary.routes.push({
          routeName: match[1],
          pageClass: match[2],
          definedIn: node.fileName || node.filePath,
        });
      }
    }

    // API 调用关系 - 从文件节点提取实际 API URL
    const apiCalls = [];
    const apiUrlSet = new Set(); // 用于去重

    // 1. 从文件的 AST 信息中提取实际 API 调用
    for (const node of nodesArray) {
      if (node.type === 'file' && node.apiCalls) {
        for (const apiCall of node.apiCalls) {
          if (apiCall.url) {
            const key = `${apiCall.method || apiCall.type}-${apiCall.url}`;
            if (!apiUrlSet.has(key)) {
              apiUrlSet.add(key);
              apiCalls.push({
                method: apiCall.method || 'GET',
                url: apiCall.url,
                type: apiCall.type || 'unknown',
                from: node.name || node.fileName,
              });
            }
          }
        }
      }
      // 也检查类节点中的 API 调用
      if (node.type === 'class' && node.apiCalls) {
        for (const apiCall of node.apiCalls) {
          if (apiCall.url) {
            const key = `${apiCall.method || apiCall.type}-${apiCall.url}`;
            if (!apiUrlSet.has(key)) {
              apiUrlSet.add(key);
              apiCalls.push({
                method: apiCall.method || 'GET',
                url: apiCall.url,
                type: apiCall.type || 'unknown',
                from: node.name,
              });
            }
          }
        }
      }
    }

    // 2. 保留原有的服务调用关系（作为补充）
    for (const edge of edgesArray) {
      if (edge.type === 'calls' || edge.label === 'calls') {
        const targetNode = nodesMap.get(edge.to);
        if (targetNode) {
          const serviceName = targetNode.name || '';
          if (serviceName.includes('Service') || serviceName.includes('Repository')) {
            // 只有当没有实际 URL 时才添加服务调用关系
            apiCalls.push({
              method: edge.label || 'unknown',
              service: serviceName,
              from: edge.from,
              to: edge.to,
              type: 'service_call',
            });
          }
        }
      }
    }

    summary.apiCalls = apiCalls;

    // 添加所有类信息（用于提取 Provider API）
    summary.allClasses = nodesArray.filter(node => node.type === 'class');

    log('代码图', `已总结: ${summary.pages.length} 页, ${summary.controllers.length} 控制器, ${summary.services.length} 服务, ${summary.routes.length} 路由`);

    return summary;
  }

  /**
   * 判断是否是页面类
   */
  isPageClass(node, superClass) {
    const name = node.name || '';
    if (name.startsWith('_')) return false;

    const baseClass = superClass || node.superClass || node.extends || node.pendingInheritance || '';

    const isWidget = baseClass.includes('StatefulWidget') ||
                     baseClass.includes('StatelessWidget') ||
                     baseClass.includes('GetView');

    if (!isWidget) return false;

    const pageKeywords = ['Page', 'Screen', 'View', 'Home', 'Login', 'Main', 'Dashboard',
                          'List', 'Detail', 'Form', 'Search', 'Settings', 'Profile',
                          'Menu', 'Navigation', 'Update', 'Create', 'Edit', 'Add'];

    if (pageKeywords.some(k => name.includes(k))) {
      return true;
    }

    const fileName = (node.fileName || '').toLowerCase();
    if (pageKeywords.some(k => fileName.includes(k.toLowerCase()))) {
      return true;
    }

    return false;
  }

  /**
   * 构建 AI 提示词
   */
  buildRefinerPrompt(aiContext, codeGraphSummary, projectPath) {
    const maxContextLength = 5000;
    const trimmedContext = aiContext.length > maxContextLength
      ? aiContext.substring(0, maxContextLength) + '\n...(已截断)'
      : aiContext;

    // 页面-控制器映射（包含 AST 增强信息）
    const pageControllerMap = [];
    for (const page of codeGraphSummary.pages) {
      const relatedControllers = codeGraphSummary.controllers.filter(c =>
        page.name.toLowerCase().includes(c.name.replace('Controller', '').toLowerCase()) ||
        c.name.replace('Controller', '').toLowerCase().includes(page.name.toLowerCase())
      );
      if (relatedControllers.length > 0) {
        pageControllerMap.push({
          page: page.name,
          controllers: relatedControllers.map(c => ({
            name: c.name,
            // AST 提取的 UI 元素
            uiProperties: c.uiProperties || { inputs: [], dropdowns: [], checkboxes: [], lists: [], others: [] },
            actionMethods: c.actionMethods || { add: [], edit: [], delete: [], save: [], submit: [], cancel: [], search: [], reset: [], load: [], other: [] }
          }))
        });
      }
    }

    // 构建 AST UI 元素摘要
    const astUISummary = codeGraphSummary.controllers.slice(0, 15).map(c => {
      const uiProps = c.uiProperties || { inputs: [], dropdowns: [], checkboxes: [], lists: [], others: [] };
      const actions = c.actionMethods || {};
      const parts = [`### ${c.name}`];

      if (uiProps.inputs?.length) {
        parts.push(`  输入框: ${uiProps.inputs.map(i => `${i.name}(${i.type || 'text'})`).join(', ')}`);
      }
      if (uiProps.dropdowns?.length) {
        parts.push(`  下拉框: ${uiProps.dropdowns.map(d => d.name).join(', ')}`);
      }
      if (uiProps.checkboxes?.length) {
        parts.push(`  复选框: ${uiProps.checkboxes.map(ch => ch.name).join(', ')}`);
      }
      if (uiProps.lists?.length) {
        parts.push(`  列表: ${uiProps.lists.map(l => l.name).join(', ')}`);
      }
      if (actions.save?.length || actions.submit?.length || actions.add?.length ||
          actions.edit?.length || actions.delete?.length || actions.cancel?.length) {
        const allActions = [
          ...(actions.save || []).map(m => `save(${typeof m === 'string' ? m : m.name})`),
          ...(actions.submit || []).map(m => `submit(${typeof m === 'string' ? m : m.name})`),
          ...(actions.add || []).map(m => `add(${typeof m === 'string' ? m : m.name})`),
          ...(actions.edit || []).map(m => `edit(${typeof m === 'string' ? m : m.name})`),
          ...(actions.delete || []).map(m => `delete(${typeof m === 'string' ? m : m.name})`),
          ...(actions.cancel || []).map(m => `cancel(${typeof m === 'string' ? m : m.name})`)
        ];
        parts.push(`  操作方法: ${allActions.join(', ')}`);
      }
      return parts.join('\n');
    }).join('\n\n');

    return `你是一个"测试上下文提炼器"，专门为自动化测试生成业务上下文。

# 任务目标
从代码图和项目文档中提炼出**可直接用于生成测试用例**的结构化上下文。

# ⚠️ 重要：优先使用 AST 代码分析结果

以下 UI 元素是通过 AST 直接从源代码提取的，**请优先使用这些信息而不是推断**：

# AST UI 元素分析结果
${astUISummary || '无 AST 分析结果'}

# 输入信息

## 项目路径
${projectPath}

## AI_CONTEXT.md
${trimmedContext}

# 输出格式

\`\`\`json
{
  "features": [
    {
      "name": "功能名称（使用页面名或控制器名，不要使用中文）",
      "entry_points": ["页面类名"],
      "controllers": ["相关控制器"],
      "core_methods": ["核心方法名"],
      "api_calls": ["API端点"],
      "ui_elements": {
        "inputs": [
          {"name": "username_field", "type": "text_field", "placeholder": "用户名"}
        ],
        "buttons": [
          {"name": "submit_button", "type": "submit_button", "action": "onSubmit"}
        ],
        "lists": [],
        "dialogs": [],
        "others": []
      },
      "navigation": {
        "from": "来源页面",
        "to": "目标页面",
        "trigger": "触发条件"
      },
      "state": ["状态列表"],
      "user_flow": {
        "steps": [
          {"action": "用户输入", "details": "在username_field输入用户名"},
          {"action": "系统调用API", "details": "调用 /api/login"},
          {"action": "成功路径", "details": "登录成功，跳转首页"},
          {"action": "失败路径", "details": "登录失败，显示错误"}
        ]
      }
    }
  ],
  "test_targets": ["测试点"]
}
\`\`\`

# 强制规则

1. **name 字段**: 使用英文类名（如 LoginFeature, HomePage），不要使用中文名称如"登录功能"
2. **功能拆分**: 按用户行为拆分，每个页面至少 1 个 feature
3. **ui_elements 必须是对象数组**: 不要使用字符串数组
4. **优先使用 AST 分析结果**: 直接使用上面提取的 inputs/buttons/lists
5. **user_flow 必须包含成功/失败路径**

请输出提炼后的 JSON：`;
  }

  /**
   * 调用 LLM 进行提炼
   */
  async callLLMRefiner(prompt, log) {
    try {
      log('LLM调用', '开始调用 LLM...');

      // 增加超时时间到 240 秒
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('LLM 请求超时 (240秒)')), 240000);
      });

      const llmPromise = this.llmRouter.chat('test_context_refiner', [
        { role: 'user', content: prompt }
      ], {
        temperature: 0.3,
        maxTokens: 8000,
      });

      const response = await Promise.race([llmPromise, timeoutPromise]);

      log('LLM响应', `收到响应，长度: ${response?.content?.length || 0}`);

      if (!response || !response.content) {
        throw new Error('LLM 返回为空');
      }

      let content = response.content.trim();
      log('LLM解析', `原始内容前100字符: ${content.substring(0, 100)}`);

      content = content.replace(/```json\s*/g, '').replace(/```\s*/g, '');

      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('响应中未找到 JSON');
      }

      const result = JSON.parse(jsonMatch[0]);
      log('提炼成功', `已识别 ${result.features?.length || 0} 个功能点`);
      return result;

    } catch (error) {
      log('提炼失败', `LLM 提炼失败: ${error.message}`);
      // 返回空结果而不是抛出异常
      return {
        features: [],
        test_targets: [],
      };
    }
  }
}

module.exports = TestContextEnhancer;
