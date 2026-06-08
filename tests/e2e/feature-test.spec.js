const { test, expect } = require('@playwright/test');

test.describe('新功能测试', () => {
  test('基础功能验证', async ({ page }) => {
    await page.goto('https://example.com');
    await expect(page).toHaveTitle(/Example/);
    console.log('✓ 页面标题正确');
  });

  test('元素可见性', async ({ page }) => {
    await page.goto('https://example.com');
    const h1 = page.locator('h1');
    await expect(h1).toBeVisible();
    console.log('✓ H1 元素可见');
  });
});
