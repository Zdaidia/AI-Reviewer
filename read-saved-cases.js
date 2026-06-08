/**
 * 读取并显示保存在 localStorage 中的测试用例
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function readSavedTestCases() {
  console.log('[启动] 启动浏览器读取测试用例...\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // 导航到应用页面
    console.log('[导航] 访问 http://localhost:3003 ...');
    await page.goto('http://localhost:3003', { waitUntil: 'networkidle', timeout: 10000 });

    // 读取 localStorage 中的所有测试用例相关数据
    console.log('[读取] 读取 localStorage 数据...\n');
    const testCases = await page.evaluate(() => {
      const results = [];

      // 查找所有可能存储测试用例的键
      const possibleKeys = [
        'ai_test_cases',
        'saved_test_cases',
        'test_cases',
        'testPlans',
        'testplans',
        'selectedTestCase',
        'selectedTestPlan'
      ];

      // 读取预定义的键
      for (const key of possibleKeys) {
        const value = localStorage.getItem(key);
        if (value) {
          try {
            const parsed = JSON.parse(value);
            results.push({ key, data: parsed });
            console.log(`[找到] ${key}:`, Array.isArray(parsed) ? `${parsed.length} 项` : typeof parsed);
          } catch (e) {
            results.push({ key, value: value });
            console.log(`[找到] ${key}: (字符串)`, value.substring(0, 100));
          }
        }
      }

      // 查找所有 localStorage 键
      const allKeys = Object.keys(localStorage);
      const otherTestKeys = allKeys.filter(k =>
        k.includes('test') || k.includes('Test') || k.includes('case') || k.includes('Case') ||
        k.includes('plan') || k.includes('Plan') || k.includes('scenario') || k.includes('Scenario')
      );

      console.log(`\n[其他] 找到 ${otherTestKeys.length} 个相关键:`);
      otherTestKeys.forEach(k => {
        const value = localStorage.getItem(k);
        console.log(`  - ${k}: ${value ? value.substring(0, 50) : '(empty)'}`);
      });

      return results;
    });

    // 显示详细内容
    console.log('\n' + '='.repeat(70));
    console.log('测试用例详情');
    console.log('='.repeat(70) + '\n');

    testCases.forEach((item, index) => {
      console.log(`\n数据 ${index + 1}: ${item.key}\n`);
      console.log(JSON.stringify(item.data, null, 2).substring(0, 5000));

      if (item.data.length > 0) {
        console.log(`\n(共 ${item.data.length} 项)`);
      }
      console.log('');
    });

    // 保存到文件
    const outputPath = path.join(__dirname, 'saved-test-cases-dump.json');
    fs.writeFileSync(outputPath, JSON.stringify(testCases, null, 2), 'utf8');
    console.log(`\n[保存] 完整数据已保存到: ${outputPath}`);

    return testCases;

  } catch (error) {
    console.error('[错误]', error.message);
  } finally {
    await browser.close();
  }
}

readSavedTestCases().catch(console.error);
