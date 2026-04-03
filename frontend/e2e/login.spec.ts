import { test, expect } from '@playwright/test';

test.describe('Login Page', () => {
  test('shows login form', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('text=Sign In')).toBeVisible();
    await expect(page.locator('input[type="text"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('redirects unauthenticated users to login', async ({ page }) => {
    await page.goto('/patient');
    await page.waitForURL('**/login');
    await expect(page).toHaveURL(/\/login/);
  });

  test('shows error on bad credentials', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="text"]', 'wrong');
    await page.fill('input[type="password"]', 'wrong');
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/\/login/);
  });
});
