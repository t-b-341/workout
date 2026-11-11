import { expect, test } from '@playwright/test';
import { expectNoHorizontalOverflow } from './helpers';

test.describe('mobile layout (unauthenticated)', () => {
  test('login page fits and primary actions are visible', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Workout' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Sign in with GitHub/i })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('home sends anonymous users to login without horizontal overflow', async ({ page }) => {
    await page.goto('/');
    await page.waitForURL(/\/login/, { timeout: 20_000 });
    await expectNoHorizontalOverflow(page);
  });
});
