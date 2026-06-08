/**
 * Test Case Storage Module
 *
 * 负责保存和加载 AI 生成的测试用例
 * 测试用例按项目路径组织存储
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class TestCaseStorage {
  constructor() {
    this.storageDir = path.join(app.getPath('userData'), 'saved-test-cases');
    this.ensureStorageDir();
  }

  /**
   * 确保存储目录存在
   */
  ensureStorageDir() {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  /**
   * 获取项目对应的存储文件路径
   * @param {string} projectPath - 项目路径
   * @returns {string} 存储文件路径
   */
  getStorageFilePath(projectPath) {
    // 使用项目路径的哈希作为文件名，避免路径中的特殊字符
    const crypto = require('crypto');
    const hash = crypto.createHash('md5').update(projectPath).digest('hex');
    return path.join(this.storageDir, `test-cases-${hash}.json`);
  }

  /**
   * 获取项目名称
   * @param {string} projectPath - 项目路径
   * @returns {string} 项目名称
   */
  getProjectName(projectPath) {
    return path.basename(projectPath);
  }

  /**
   * 保存测试用例
   * @param {string} projectPath - 项目路径
   * @param {Object} testPlan - 测试计划
   * @param {Object} metadata - 元数据
   * @param {boolean} merge - 是否合并到现有测试用例（默认 true）
   * @returns {Object} 保存结果
   */
  saveTestCases(projectPath, testPlan, metadata = {}, merge = true) {
    try {
      const filePath = this.getStorageFilePath(projectPath);
      const projectName = this.getProjectName(projectPath);

      let finalTestPlan = testPlan;
      let finalMetadata = metadata;

      // 如果启用合并且存在已保存的测试用例，则合并
      if (merge && this.hasSavedTestCases(projectPath)) {
        const loadResult = this.loadTestCases(projectPath);
        if (loadResult.exists && loadResult.testPlan) {
          finalTestPlan = this.mergeTestPlans(loadResult.testPlan, testPlan);

          // 合并元数据
          finalMetadata = {
            ...loadResult.metadata,
            ...metadata,
            // 保留原有的 requirements，如果有新的 requirements 则追加
            requirements: metadata.requirements
              ? (loadResult.metadata?.requirements
                  ? loadResult.metadata.requirements + '\n\n' + metadata.requirements
                  : metadata.requirements)
              : (loadResult.metadata?.requirements || '')
          };
        }
      }

      const saveData = {
        projectName,
        projectPath,
        savedAt: new Date().toISOString(),
        metadata: {
          requirements: finalMetadata.requirements || '',
          totalTestCases: finalTestPlan.modules?.reduce((sum, m) => sum + (m.scenarios?.length || 0), 0) || 0,
          ...finalMetadata
        },
        testPlan: finalTestPlan
      };

      fs.writeFileSync(filePath, JSON.stringify(saveData, null, 2), 'utf-8');

      return {
        success: true,
        filePath,
        projectName,
        savedAt: saveData.savedAt
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 合并两个测试计划
   * @param {Object} existingPlan - 现有测试计划
   * @param {Object} newPlan - 新测试计划
   * @returns {Object} 合并后的测试计划
   */
  mergeTestPlans(existingPlan, newPlan) {
    console.log('[mergeTestPlans] ========== 开始合并测试计划 ==========');
    console.log('[mergeTestPlans] 现有模块数:', existingPlan.modules?.length || 0);
    console.log('[mergeTestPlans] 新增模块数:', newPlan.modules?.length || 0);

    const merged = {
      ...existingPlan,
      modules: [...(existingPlan.modules || [])]
    };

    if (!newPlan.modules || newPlan.modules.length === 0) {
      console.log('[mergeTestPlans] 新测试计划没有模块，直接返回现有计划');
      return merged;
    }

    // 遍历新测试计划的每个模块
    for (const newModule of newPlan.modules) {
      console.log('[mergeTestPlans] 处理新模块:', newModule.module, '场景数:', newModule.scenarios?.length || 0);
      // 查找现有计划中是否存在同名模块
      const existingModuleIndex = merged.modules.findIndex(
        m => m.module === newModule.module
      );

      if (existingModuleIndex !== -1) {
        // 模块已存在，合并场景
        console.log('[mergeTestPlans] 模块已存在，开始合并场景');
        const existingModule = merged.modules[existingModuleIndex];
        const existingScenarioIds = new Set(
          (existingModule.scenarios || []).map(s => s.id)
        );
        console.log('[mergeTestPlans] 现有场景 IDs:', Array.from(existingScenarioIds));

        // 只添加不重复的场景
        const newScenarios = (newModule.scenarios || []).filter(
          s => !existingScenarioIds.has(s.id)
        );
        console.log('[mergeTestPlans] 新场景中被过滤掉（ID重复）的数量:', (newModule.scenarios?.length || 0) - newScenarios.length);
        console.log('[mergeTestPlans] 将要添加的新场景数量:', newScenarios.length);
        newScenarios.forEach(s => console.log('[mergeTestPlans]   新场景:', s.id, s.name));

        existingModule.scenarios = [
          ...(existingModule.scenarios || []),
          ...newScenarios
        ];

        console.log('[mergeTestPlans] 合并后模块场景总数:', existingModule.scenarios?.length || 0);

        // 更新模块的优先级（取最高优先级）
        if (newModule.priority) {
          const priorityOrder = { 'Critical': 0, 'High': 1, 'Medium': 2, 'Low': 3 };
          const existingPriorityValue = priorityOrder[existingModule.priority] ?? 999;
          const newPriorityValue = priorityOrder[newModule.priority] ?? 999;
          if (newPriorityValue < existingPriorityValue) {
            existingModule.priority = newModule.priority;
          }
        }
      } else {
        // 模块不存在，直接添加
        console.log('[mergeTestPlans] 模块不存在，直接添加新模块');
        merged.modules.push({ ...newModule });
      }
    }

    // 重新计算总步骤数和预估时间
    merged.totalSteps = merged.modules.reduce((sum, m) =>
      sum + (m.scenarios?.reduce((s, sc) => s + (sc.steps?.length || 0), 0) || 0), 0
    );
    merged.estimatedTime = merged.totalSteps * 0.5;

    return merged;
  }

  /**
   * 规范化测试用例中的 action 数据
   * 修复历史数据中存在的问题，如 value 被错误提取为单个字符等
   * @param {Object} testPlan - 测试计划
   */
  normalizeTestPlanActions(testPlan) {
    if (!testPlan || !testPlan.modules) {
      return;
    }

    for (const module of testPlan.modules) {
      if (!module.scenarios) continue;

      for (const scenario of module.scenarios) {
        // 新格式：steps 数组
        if (scenario.steps && Array.isArray(scenario.steps)) {
          for (const step of scenario.steps) {
            if (step.actions && Array.isArray(step.actions)) {
              step.actions = this.normalizeActions(step.actions);
            }
            // 如果步骤本身就是 input 类型，也需要修复
            if (step.type === 'input' || step.action === 'input') {
              // 修复错误的 value
              if (step.value && typeof step.value === 'string') {
                const valueStr = step.value.trim();
                // 检查 value 是否只是输入动词
                if (valueStr === '輸入' || valueStr === '输入' || valueStr === '填' || valueStr === '填入') {
                  // 从 description 中正确提取值
                  // 格式：在 XXX 输入框/輸入框/框 动词 值
                  const valueExtractMatch = step.description.match(
                    /(?:在|[^在])(.+?)(?:输入框|輸入框|框)?(?:輸入|输入|填写|填寫|填入|填|键入|鍵入)\s+([^'"''，,。]+)/
                  );
                  if (valueExtractMatch && valueExtractMatch[2]) {
                    const correctValue = valueExtractMatch[2].trim();
                    console.log(`[normalizeTestPlanActions] 修复步骤 value: "${valueStr}" -> "${correctValue}"`);
                    step.value = correctValue;
                  }
                }
              }
            }
          }
        }

        // 旧格式：given_steps
        if (scenario.given_steps && Array.isArray(scenario.given_steps)) {
          for (const step of scenario.given_steps) {
            if (step.actions && Array.isArray(step.actions)) {
              step.actions = this.normalizeActions(step.actions);
            }
          }
        }

        // 旧格式：when_steps
        if (scenario.when_steps && Array.isArray(scenario.when_steps)) {
          for (const step of scenario.when_steps) {
            if (step.actions && Array.isArray(step.actions)) {
              step.actions = this.normalizeActions(step.actions);
            }
          }
        }

        // 旧格式：then_steps
        if (scenario.then_steps && Array.isArray(scenario.then_steps)) {
          for (const step of scenario.then_steps) {
            if (step.verifications && Array.isArray(step.verifications)) {
              step.verifications = this.normalizeActions(step.verifications);
            }
          }
        }
      }
    }
  }

  /**
   * 规范化 actions 数组
   * @param {Array} actions - 原始 actions
   * @returns {Array} 规范化后的 actions
   */
  normalizeActions(actions) {
    return actions.map(action => {
      // 如果 action 是字符串，转换为对象格式
      if (typeof action === 'string') {
        return { type: 'generic', description: action };
      }

      // 检查是否是无效的 input action
      if (action.type === 'input' && action.value) {
        const valueStr = String(action.value).trim();

        // 情况1: value 是单个字符（如 "页"、"面" 等），这是从描述中错误提取的
        if (valueStr.length === 1 && !/\d/.test(valueStr)) {
          // 检查描述是否包含"用户在.*页"等前置条件模式
          if (action.description &&
              (action.description.includes('用户在') ||
               action.description.includes('用户已') ||
               action.description.includes('进入'))) {
            // 这是一个前置条件描述，不是输入操作
            return {
              ...action,
              type: 'generic',
              value: null,
              target: undefined
            };
          }
        }

        // 情况2: value 看起来像是从描述中间错误提取的片段
        // 例如："用户在密码输入页，ID为 amyTest" → value="页"
        if (action.description && action.value) {
          // 如果 description 包含 "输入页" 或类似模式，但 value 不是有效输入值
          const descLower = action.description.toLowerCase();
          if ((descLower.includes('输入页') || descLower.includes('页面')) &&
              !action.description.includes(action.value + ' ') &&
              !action.description.endsWith(action.value)) {
            // value 不在 description 的正确位置，可能是错误提取
            return {
              ...action,
              type: 'generic',
              value: null,
              target: undefined
            };
          }
        }

        // 情况3: 修复 "輸入"/"输入" 这样的错误值
        // 问题：当 description 是 "在 密码输入框 輸入 A!123456" 时，
        // value 被错误提取为 "輸入"（动词）而不是 "A!123456"
        if (action.description && action.value) {
          const valueStr = String(action.value).trim();
          // 检查 value 是否只是输入动词
          if (valueStr === '輸入' || valueStr === '输入' || valueStr === '填' || valueStr === '填入') {
            // 从 description 中正确提取值
            // 格式：在 XXX 输入框/輸入框/框 动词 值
            const valueExtractMatch = action.description.match(
              /(?:在|[^在])(.+?)(?:输入框|輸入框|框)?(?:輸入|输入|填写|填寫|填入|填|键入|鍵入)\s+([^'"''，,。]+)/
            );
            if (valueExtractMatch && valueExtractMatch[2]) {
              const correctValue = valueExtractMatch[2].trim();
              // 修复 value
              return {
                ...action,
                value: correctValue
              };
            }
          }
        }
      }

      // 确保 click action 有 target 属性
      if (action.type === 'click' && !action.target && action.description) {
        // 从 description 中提取 target
        const targetMatch = action.description.match(/(?:点击|选择|按下)\s*(.+?)(?:按钮)?$/);
        if (targetMatch) {
          action.target = targetMatch[1].trim();
        }
      }

      return action;
    });
  }

  /**
   * 加载测试用例
   * @param {string} projectPath - 项目路径
   * @returns {Object} 加载结果
   */
  loadTestCases(projectPath) {
    try {
      const filePath = this.getStorageFilePath(projectPath);

      if (!fs.existsSync(filePath)) {
        return {
          success: false,
          exists: false,
          error: 'No saved test cases found for this project'
        };
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content);

      // 规范化测试用例数据，修复历史数据问题
      this.normalizeTestPlanActions(data.testPlan);

      return {
        success: true,
        exists: true,
        projectName: data.projectName,
        projectPath: data.projectPath,
        savedAt: data.savedAt,
        metadata: data.metadata,
        testPlan: data.testPlan
      };
    } catch (error) {
      return {
        success: false,
        exists: true,
        error: error.message
      };
    }
  }

  /**
   * 获取所有已保存的测试用例列表
   * @returns {Array} 测试用例列表
   */
  listSavedTestCases() {
    try {
      const files = fs.readdirSync(this.storageDir);
      const testCases = [];

      for (const file of files) {
        if (file.startsWith('test-cases-') && file.endsWith('.json')) {
          const filePath = path.join(this.storageDir, file);
          try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const data = JSON.parse(content);
            // 规范化测试用例数据，修复历史数据问题
            this.normalizeTestPlanActions(data.testPlan);
            // 修复：返回完整的测试计划数据，包括 testPlan，这样前端可以正确计算用例数量和显示完整信息
            testCases.push({
              fileName: file,
              projectName: data.projectName,
              projectPath: data.projectPath,
              savedAt: data.savedAt,
              metadata: data.metadata,
              testPlan: data.testPlan,  // 关键修复：添加 testPlan
              totalTestCases: data.metadata?.totalTestCases || 0
            });
          } catch (error) {
            console.error(`Error reading test case file ${file}:`, error.message);
          }
        }
      }

      return {
        success: true,
        testCases
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        testCases: []
      };
    }
  }

  /**
   * 删除保存的测试用例
   * @param {string} projectPath - 项目路径
   * @returns {Object} 删除结果
   */
  deleteTestCases(projectPath) {
    try {
      const filePath = this.getStorageFilePath(projectPath);

      if (!fs.existsSync(filePath)) {
        return {
          success: false,
          error: 'No saved test cases found for this project'
        };
      }

      fs.unlinkSync(filePath);

      return {
        success: true,
        message: 'Test cases deleted successfully'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 检查是否有已保存的测试用例
   * @param {string} projectPath - 项目路径
   * @returns {boolean} 是否存在
   */
  hasSavedTestCases(projectPath) {
    const filePath = this.getStorageFilePath(projectPath);
    return fs.existsSync(filePath);
  }

  /**
   * 更新单个测试用例
   * @param {string} projectPath - 项目路径
   * @param {string} testCaseId - 测试用例ID
   * @param {Object} updatedData - 更新的数据
   * @returns {Object} 更新结果
   */
  updateTestCase(projectPath, testCaseId, updatedData) {
    try {
      const loadResult = this.loadTestCases(projectPath);

      if (!loadResult.exists) {
        return {
          success: false,
          error: 'No saved test cases found for this project'
        };
      }

      // Find and update the test case
      let found = false;
      const { testPlan } = loadResult;

      if (testPlan && testPlan.modules) {
        for (const module of testPlan.modules) {
          if (module.scenarios) {
            const index = module.scenarios.findIndex(s => s.id === testCaseId);
            if (index !== -1) {
              module.scenarios[index] = { ...module.scenarios[index], ...updatedData };
              found = true;
              break;
            }
          }
        }
      }

      if (!found) {
        return {
          success: false,
          error: `Test case with ID "${testCaseId}" not found`
        };
      }

      // Save the updated test plan
      const saveResult = this.saveTestCases(projectPath, testPlan, loadResult.metadata);

      if (saveResult.success) {
        return {
          success: true,
          message: 'Test case updated successfully',
          testCaseId
        };
      } else {
        return {
          success: false,
          error: saveResult.error
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 删除单个测试用例
   * @param {string} projectPath - 项目路径
   * @param {string} testCaseId - 测试用例ID
   * @returns {Object} 删除结果
   */
  deleteTestCase(projectPath, testCaseId) {
    try {
      const loadResult = this.loadTestCases(projectPath);

      if (!loadResult.exists) {
        return {
          success: false,
          error: 'No saved test cases found for this project'
        };
      }

      // Find and remove the test case
      let found = false;
      const { testPlan } = loadResult;

      if (testPlan && testPlan.modules) {
        for (const module of testPlan.modules) {
          if (module.scenarios) {
            const index = module.scenarios.findIndex(s => s.id === testCaseId);
            if (index !== -1) {
              module.scenarios.splice(index, 1);
              found = true;
              break;
            }
          }
        }
      }

      if (!found) {
        return {
          success: false,
          error: `Test case with ID "${testCaseId}" not found`
        };
      }

      // Update metadata count
      const totalCount = testPlan.modules?.reduce((sum, m) => sum + (m.scenarios?.length || 0), 0) || 0;
      loadResult.metadata.totalTestCases = totalCount;

      // Save the updated test plan
      const saveResult = this.saveTestCases(projectPath, testPlan, loadResult.metadata);

      if (saveResult.success) {
        return {
          success: true,
          message: 'Test case deleted successfully',
          testCaseId,
          remainingCount: totalCount
        };
      } else {
        return {
          success: false,
          error: saveResult.error
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = TestCaseStorage;
