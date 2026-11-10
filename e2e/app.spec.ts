import { expect, test } from '@playwright/test';
import { collectPageErrors, expectNoHorizontalOverflow, signIn } from './helpers';

const ROUTES = ['/', '/recovery', '/history', '/cardio', '/program'] as const;

test.describe('signed-in app (Pixel 5)', () => {
  test.describe.configure({ timeout: 90_000 });

  test.beforeEach(async ({ context }, testInfo) => {
    const userAgent = testInfo.project.use.userAgent ?? '';
    test.skip(!userAgent.includes('Pixel 5'), 'Signed-in coverage runs on the Pixel 5 project');
    await signIn(context);
  });

  for (const path of ROUTES) {
    test(`${path} loads with the bottom nav and no horizontal overflow`, async ({ page }) => {
      const errors = collectPageErrors(page);
      await page.goto(path);
      const nav = page.getByRole('navigation');
      await expect(nav.getByRole('link', { name: 'Today' })).toBeVisible();
      await expect(nav.getByRole('link', { name: 'Daily Check-In' })).toBeVisible();
      await expect(nav.getByRole('link', { name: 'History' })).toBeVisible();
      await expect(nav.getByRole('link', { name: 'Cardio' })).toBeVisible();
      await expect(nav.getByRole('link', { name: 'Program' })).toBeVisible();
      await expectNoHorizontalOverflow(page);
      expect(errors.pageErrors, errors.pageErrors.join('\n')).toEqual([]);
    });
  }

  test('logs a set, finishes the session, and keeps Done after reload', async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Skip readiness check' })).toBeVisible();
    await page.getByRole('button', { name: 'Skip readiness check' }).click();
    await expect(page.getByRole('button', { name: 'Start workout' })).toBeVisible();
    await page.getByRole('button', { name: 'Start workout' }).click();
    await expect(page.getByText('How recovered do you feel right now?')).toBeVisible();
    await page.getByRole('button', { name: '5', exact: true }).click();
    const logSet = page.getByRole('button', { name: 'Log set' }).first();
    await expect(logSet).toBeVisible();
    await logSet.click();
    await expect(page.getByText('Done', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Finish session' }).click();
    await expect(page.getByRole('heading', { name: 'Workout complete!' })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('navigation').getByRole('link', { name: 'Today' })).toBeVisible();
    await expect(page.getByText('Done', { exact: true }).first()).toBeVisible();
    // pullAll({ full: true }) clears local rows and writes them back from the stub.
    // Give that round-trip time to finish, then confirm the badge is still there.
    await page.waitForTimeout(2_000);
    await expect(page.getByText('Done', { exact: true }).first()).toBeVisible();
    expect(errors.pageErrors, errors.pageErrors.join('\n')).toEqual([]);
  });
});
