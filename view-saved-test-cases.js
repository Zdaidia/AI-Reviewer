/**
 * 读取并显示保存在 localStorage 中的测试用例
 */

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

// 模拟 localStorage 来读取保存的测试用例
async function getSavedTestCases() {
  // 在 Node.js 环境中读取 Chromium 的 localStorage
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      // 导航到应用页面
      await page.goto('http://localhost:3003', { waitUntil: 'networkidle', timeout: 10000 });

      // 读取 localStorage 中的测试用例
      const testCases = await page.evaluate(() => {
        const keys = Object.keys(localStorage);
        const testCases = [];

        for (const key of keys) {
          if (key.includes('testCase') || key.includes('test_plan') || key.includes('testPlan')) {
            try {
              const value = localStorage.getItem(key);
              if (value) {
                const parsed = JSON.parse(value);
                testCases.push({
                  key: key,
                  data: parsed
                });
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }

        // 查找 AI Test Agent 保存的测试用例
        const aiTestCases = localStorage.getItem('ai_test_cases');
        if (aiTestCases) {
          try {
            const parsed = JSON.parse(aiTestCases);
            testCases.push({
              key: 'ai_test_cases',
              data: parsed
            });
          } catch (e) {
            // 忽略解析错误
          }
        }

        return testCases;
      });

      return testCases;
    } finally {
      await browser.close();
    }
  }

  readTestCases().then(testCases => {
    console.log('[找到] 找到', testCases.length, '个保存的测试用例相关数据:\n');

    testCases.forEach((item, index) => {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`数据 ${index + 1}: ${item.key}`);
      console.log('='.repeat(60));

      if (item.data && typeof item.data === 'object') {
        if (Array.isArray(item.data)) {
          console.log(`类型: 数组，长度: ${item.data.length}`);
          console.log(`内容预览:`, JSON.stringify(item.data.slice(0, 3), null, 2));
        } else if (item.data.modules) {
          console.log(`类型: 测试计划`);
          console.log(`模块数: ${item.data.modules?.length || 0}`);
          console.log(`总场景数: ${item.data.totalScenarios || 0}`);
          console.log(`总步骤数: ${item.data.totalSteps || 0}`);

          // 显示每个模块的概要
          if (item.data.modules) {
            item.data.modules.forEach((mod, i) => {
              console.log(`\n  模块 ${i + 1}: ${mod.module}`);
              console.log(`    场景数: ${mod.scenarios?.length || 0}`);
              if (mod.scenarios) {
                mod.scenarios.forEach((sc, j) => {
                  console.log(`      场景 ${j + 1}: ${sc.name || sc.id}`);
                  console.log(`        步骤数: ${sc.steps?.length || 0}`);
                });
              }
            });
          }
        } else {
          console.log(`类型: 对象`);
          console.log(`预览:`, JSON.stringify(item.data, null, 2).substring(0, 500));
        }
      }
    });

    // 保存完整的测试用例到文件
    if (testCases.length > 0) {
      const outputPath = path.join(__dirname, 'saved-test-cases-dump.json');
      fs.writeFileSync(outputPath, JSON.stringify(testCases, null, 2), 'utf8');
      console.log(`\n\n[保存] 完整数据已保存到: ${outputPath}`);
    }

  }).catch(error => {
    console.error('[错误]', error.message);
  });
}

// 如果在浏览器环境中运行，直接读取 localStorage
if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
  console.log('[浏览器] 直接读取 localStorage...');

  const keys = Object.keys(localStorage);
  const testCases = [];

  for (const key of keys) {
    if (key.includes('test') || key.includes('Test') || key.includes('case') || key.includes('Case')) {
      try {
        const value = localStorage.getItem(key);
        if (value) {
          testCases.push({ key, value });
        }
      } catch (e) {}
    }
  }

  console.log('[找到] 找到', testCases.length, '个测试相关数据:');
  testCases.forEach(item => {
    console.log(`  ${item.key}:`, item.value.substring(0, 100));
  });
} else {
  // Node.js 环境
  getSavedTestCases();
}
