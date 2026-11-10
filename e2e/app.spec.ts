import { expect, test } from '@playwright/test';
import { E2E_USER_ID } from '../src/lib/supabase/e2eStub';
import { collectPageErrors, expectNoHorizontalOverflow, signIn } from './helpers';

const ROUTES = ['/', '/recovery', '/history', '/cardio', '/program'] as const;

test('signed-out / redirects to /login', async ({ page }) => {
  await page.goto('/');
  await page.waitForURL(/\/login/, { timeout: 20_000 });
});

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

  test('loads Today when getUser is offline and does not redirect', async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.addInitScript(() => {
      localStorage.setItem('e2e:auth-offline', '1');
    });
    await page.goto('/');
    const nav = page.getByRole('navigation');
    await expect(nav.getByRole('link', { name: 'Today' })).toBeVisible();
    await expect(page).not.toHaveURL(/\/login/);
    // The background getUser rejection must not navigate away after paint.
    await page.waitForTimeout(1_000);
    await expect(page).not.toHaveURL(/\/login/);
    await expect(nav.getByRole('link', { name: 'Today' })).toBeVisible();
    expect(errors.pageErrors, errors.pageErrors.join('\n')).toEqual([]);
  });

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

  test('keeps sets when set_logs uploads fail and shows the failed status', async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Skip readiness check' })).toBeVisible();
    await page.getByRole('button', { name: 'Skip readiness check' }).click();
    await expect(page.getByRole('button', { name: 'Start workout' })).toBeVisible();
    await page.getByRole('button', { name: 'Start workout' }).click();
    await expect(page.getByText('How recovered do you feel right now?')).toBeVisible();
    await page.getByRole('button', { name: '5', exact: true }).click();
    const logSet = page.getByRole('button', { name: 'Log set' });
    await expect(logSet.first()).toBeVisible();

    // Reject set_logs writes only. Selects still succeed, which is the wipe case.
    await page.evaluate(() => localStorage.setItem('e2e:fail', 'set_logs'));
    await logSet.first().click();
    await expect(page.getByText('Done', { exact: true })).toHaveCount(1);
    await logSet.first().click();
    await expect(page.getByText('Done', { exact: true })).toHaveCount(2);

    await page.reload();
    const status = page.getByRole('status');
    await expect(status).toContainText('failed to upload');
    await expect(status).toContainText('e2e injected');
    await expect(page.getByText('Done', { exact: true })).toHaveCount(2);
    await expect(page.getByRole('link', { name: 'Sync diagnostics' })).toHaveAttribute('href', '/program');

    await page.evaluate(() => localStorage.removeItem('e2e:fail'));
    await page.getByRole('link', { name: 'Sync diagnostics' }).click();
    await expect(page.getByRole('heading', { name: 'Program' })).toBeVisible();
    await page.getByRole('button', { name: 'Sync', exact: true }).click();
    await page.getByRole('navigation').getByRole('link', { name: 'Today' }).click();
    await expect(page.getByRole('status')).toContainText('Up to date', { timeout: 20_000 });
    await expect(page.getByText('Done', { exact: true })).toHaveCount(2);
    expect(errors.pageErrors, errors.pageErrors.join('\n')).toEqual([]);
  });

  test('pulls 2,500 set logs for one session past the 1,000 row cap', async ({ page }) => {
    const errors = collectPageErrors(page);
    const sessionId = 'e2e-paged-session';
    await page.addInitScript((seededSessionId: string) => {
      const rows = [];
      for (let i = 0; i < 2500; i++) {
        rows.push({
          id: `e2e-set-${String(i).padStart(4, '0')}`,
          session_log_id: seededSessionId,
          lift_id: 'bp',
          prescription_id: 'e2e-rx',
          set_index: i,
          weight: 100,
          reps: 5,
          status: 'completed',
          updated_at: '2026-01-01T00:00:00.000Z',
        });
      }
      localStorage.setItem('e2e:db:set_logs', JSON.stringify(rows));
    }, sessionId);

    await page.goto('/');
    await expect(page.getByRole('navigation').getByRole('link', { name: 'Today' })).toBeVisible();

    await expect.poll(async () => {
      return page.evaluate(async (args: { userId: string }) => {
        const name = `workout-${args.userId}`;
        const existing = await indexedDB.databases();
        if (!existing.some((db) => db.name === name)) {
          return { count: 0, sessionIds: [] as string[] };
        }
        return await new Promise<{ count: number; sessionIds: string[] }>((resolve, reject) => {
          const req = indexedDB.open(name);
          req.onerror = () => reject(req.error);
          req.onsuccess = () => {
            const db = req.result;
            const finish = (value: { count: number; sessionIds: string[] }) => {
              db.close();
              resolve(value);
            };
            if (!db.objectStoreNames.contains('set_logs')) {
              finish({ count: 0, sessionIds: [] });
              return;
            }
            const getReq = db.transaction('set_logs', 'readonly').objectStore('set_logs').getAll();
            getReq.onerror = () => {
              db.close();
              reject(getReq.error);
            };
            getReq.onsuccess = () => {
              const stored = getReq.result as Array<{ sessionLogId?: string }>;
              const sessionIds: string[] = [];
              const seen = new Set<string>();
              for (const row of stored) {
                const id = row?.sessionLogId;
                if (typeof id === 'string' && !seen.has(id)) {
                  seen.add(id);
                  sessionIds.push(id);
                }
              }
              finish({ count: stored.length, sessionIds });
            };
          };
        });
      }, { userId: E2E_USER_ID });
    }, { timeout: 30_000 }).toEqual({
      count: 2500,
      sessionIds: [sessionId],
    });

    expect(errors.pageErrors, errors.pageErrors.join('\n')).toEqual([]);
  });
});
