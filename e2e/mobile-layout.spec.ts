import { expect, test } from '@playwright/test';

/** `scrollWidth` noticeably wider than the layout viewport usually means horizontal scroll. */
async function expectNoHorizontalOverflow(page: import('@playwright/test').Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => {
    const root = document.documentElement;
    return { scrollWidth: root.scrollWidth, clientWidth: root.clientWidth };
  });
  expect(
    scrollWidth,
    `layout overflow: scrollWidth ${scrollWidth} > clientWidth ${clientWidth}`,
  ).toBeLessThanOrEqual(clientWidth + 1);
}

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
