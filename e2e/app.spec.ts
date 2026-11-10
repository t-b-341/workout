import { expect, test, type Page } from '@playwright/test';
import { E2E_USER_ID } from '../src/lib/supabase/e2eStub';
import { collectPageErrors, countDexieRows, expectNoHorizontalOverflow, signIn } from './helpers';

const ROUTES = ['/', '/recovery', '/history', '/cardio', '/program', '/program/meso-analysis'] as const;

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

  test('/program/meso-analysis keeps the bottom nav after reload', async ({ page }) => {
    const errors = collectPageErrors(page);

    async function expectAnalysisShell() {
      const nav = page.getByRole('navigation');
      await expect(nav.getByRole('link', { name: 'Today' })).toBeVisible();
      await expect(nav.getByRole('link', { name: 'Daily Check-In' })).toBeVisible();
      await expect(nav.getByRole('link', { name: 'History' })).toBeVisible();
      await expect(nav.getByRole('link', { name: 'Cardio' })).toBeVisible();
      await expect(nav.getByRole('link', { name: 'Program' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Mesocycle analysis' })).toBeVisible();
      await expect(page.getByText('DB not initialized')).toHaveCount(0);
      await expectNoHorizontalOverflow(page);
    }

    await page.goto('/program/meso-analysis');
    await expectAnalysisShell();
    await page.reload();
    await expectAnalysisShell();
    expect(errors.pageErrors, errors.pageErrors.join('\n')).toEqual([]);
  });

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

  test('does not create a session or supplement row until the user acts', async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'L1', exact: true })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'ZMA' })).toBeVisible();
    // The old supplement effect wrote an all-false row about 300ms after paint.
    await page.waitForTimeout(500);
    expect(await countDexieRows(page, 'supplement_logs')).toBe(0);

    for (const id of ['L1', 'U2', 'L2']) {
      await page.getByRole('button', { name: id, exact: true }).click();
    }
    await page.waitForTimeout(500);
    expect(await countDexieRows(page, 'session_logs')).toBe(0);
    expect(await countDexieRows(page, 'supplement_logs')).toBe(0);
    await expect(page.getByText('Did you train')).toHaveCount(0);

    await page.getByRole('button', { name: 'Skip readiness check' }).click();
    await expect.poll(() => countDexieRows(page, 'session_logs')).toBe(1);

    await page.getByRole('button', { name: 'Start workout' }).click();
    await expect(page.getByText('How recovered do you feel right now?')).toBeVisible();
    await expect(page.getByText('Did you train')).toHaveCount(0);
    await expect(page.getByText('Up next:')).toHaveCount(0);

    await page.getByRole('checkbox', { name: 'ZMA' }).check();
    await expect.poll(() => countDexieRows(page, 'supplement_logs')).toBe(1);
    expect(errors.pageErrors, errors.pageErrors.join('\n')).toEqual([]);
  });

  test('skipped readiness stays dismissed after leaving Today and after reload', async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'L1', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'L1', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Skip readiness check' })).toBeVisible();
    await page.getByRole('button', { name: 'Skip readiness check' }).click();
    await expect(page.getByRole('button', { name: 'Start workout' })).toBeVisible();
    await expect(page.getByText('How are you walking in?')).toHaveCount(0);

    await page.getByRole('navigation').getByRole('link', { name: 'History' }).click();
    await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();
    await page.getByRole('navigation').getByRole('link', { name: 'Today' }).click();
    await expect(page.getByRole('button', { name: 'Start workout' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Skip readiness check' })).toHaveCount(0);
    await expect(page.getByText('How are you walking in?')).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole('navigation').getByRole('link', { name: 'Today' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start workout' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Skip readiness check' })).toHaveCount(0);
    await expect(page.getByText('How are you walking in?')).toHaveCount(0);
    // pullAll({ full: true }) clears local rows and writes them back from the stub.
    await page.waitForTimeout(2_000);
    await expect(page.getByRole('button', { name: 'Start workout' })).toBeVisible();
    await expect(page.getByText('How are you walking in?')).toHaveCount(0);

    // The prompt is per session: a template with no readinessCompletedAt still asks.
    await page.getByRole('button', { name: 'U2', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Skip readiness check' })).toBeVisible();
    await expect(page.getByText('How are you walking in?')).toBeVisible();
    await page.getByRole('button', { name: 'L1', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Start workout' })).toBeVisible();
    await expect(page.getByText('How are you walking in?')).toHaveCount(0);

    expect(errors.pageErrors, errors.pageErrors.join('\n')).toEqual([]);
  });

  test('prescription rows stack on a phone and keep the column header when wide', async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto('/program');
    await expect(page.getByRole('heading', { name: 'Program' })).toBeVisible();
    await page.getByRole('button', { name: /^U1 ·/ }).click();
    await expect(page.getByRole('combobox', { name: 'Lift for Push Press' })).toBeVisible();
    const rows = page.locator('[data-prescription-row]');
    await expect(rows.first()).toBeVisible();
    await expect(page.locator('[data-prescription-header]')).toBeHidden();

    const phone = await page.evaluate(() => {
      const viewportWidth = window.innerWidth;
      const rowEls = [...document.querySelectorAll<HTMLElement>('[data-prescription-row]')];
      return {
        viewportWidth,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        rows: rowEls.map((row) => {
          const select = row.querySelector('select');
          const weight = row.querySelector<HTMLElement>('input[aria-label^="Weight for "]');
          const sets = row.querySelector<HTMLElement>('input[aria-label^="Sets for "]');
          const repMin = row.querySelector<HTMLElement>('input[aria-label^="Rep min for "]');
          const notes = row.querySelector<HTMLElement>('input[aria-label^="Notes for "]');
          const remove = [...row.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Remove');
          const star = row.querySelector<HTMLElement>('button[aria-label="Pin lift"], button[aria-label="Unpin lift"]');
          const up = row.querySelector<HTMLElement>('button[aria-label="Move exercise up"]');
          const down = row.querySelector<HTMLElement>('button[aria-label="Move exercise down"]');
          const liftName = select?.selectedOptions[0]?.textContent?.trim() ?? '';
          const controls = [...row.querySelectorAll('input, select')].map((el) => ({
            tag: el.tagName.toLowerCase(),
            name: el.getAttribute('aria-label')?.trim() ?? '',
          }));
          const box = (el: Element | null | undefined) => {
            const rect = el?.getBoundingClientRect();
            return rect ? { width: rect.width, height: rect.height, top: rect.top, right: rect.right } : null;
          };
          return {
            liftName,
            select: box(select),
            weight: box(weight),
            sets: box(sets),
            repMin: box(repMin),
            notes: box(notes),
            remove: box(remove),
            star: box(star),
            up: box(up),
            down: box(down),
            controls,
          };
        }),
      };
    });

    expect(phone.rows.length).toBeGreaterThan(0);
    for (const row of phone.rows) {
      expect(row.liftName.length).toBeGreaterThan(0);
      expect(row.select?.width ?? 0).toBeGreaterThanOrEqual(160);
      expect(row.remove, 'Remove button').not.toBeNull();
      expect(row.remove!.right).toBeLessThanOrEqual(phone.viewportWidth + 1);
      expect(row.star!.width).toBeGreaterThanOrEqual(44);
      expect(row.star!.height).toBeGreaterThanOrEqual(44);
      expect(row.up!.width).toBeGreaterThanOrEqual(44);
      expect(row.up!.height).toBeGreaterThanOrEqual(44);
      expect(row.down!.width).toBeGreaterThanOrEqual(44);
      expect(row.down!.height).toBeGreaterThanOrEqual(44);
      expect(row.remove!.width).toBeGreaterThanOrEqual(44);
      expect(row.remove!.height).toBeGreaterThanOrEqual(44);
      expect(row.select!.top).toBeLessThan(row.weight!.top);
      expect(Math.abs(row.weight!.top - row.sets!.top)).toBeLessThan(12);
      expect(Math.abs(row.weight!.top - row.repMin!.top)).toBeLessThan(12);
      expect(row.weight!.top).toBeLessThan(row.notes!.top);
      expect(row.notes!.top).toBeLessThan(row.remove!.top);
      expect(row.controls).toHaveLength(6);
      for (const control of row.controls) {
        expect(control.name, `${control.tag} accessible name`).toMatch(new RegExp(` for ${row.liftName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
      }
    }
    await expectNoHorizontalOverflow(page);

    const viewport = page.viewportSize();
    await page.setViewportSize({ width: 1280, height: viewport?.height ?? 851 });
    await expect(page.locator('[data-prescription-header]')).toBeVisible();

    const wide = await page.evaluate(() => {
      const row = document.querySelector('[data-prescription-row]');
      if (!row) return null;
      const top = (selector: string) => row.querySelector(selector)?.getBoundingClientRect().top ?? Number.NaN;
      const selectTop = top('select');
      const weightTop = top('input[aria-label^="Weight for "]');
      const notesTop = top('input[aria-label^="Notes for "]');
      return { selectTop, weightTop, notesTop };
    });
    expect(wide, 'prescription row on a wide viewport').not.toBeNull();
    expect(Math.abs(wide!.selectTop - wide!.weightTop)).toBeLessThan(16);
    expect(Math.abs(wide!.selectTop - wide!.notesTop)).toBeLessThan(16);

    expect(errors.pageErrors, errors.pageErrors.join('\n')).toEqual([]);
  });

  test('overwhelm trigger stays clear of the session Jump button', async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Skip readiness check' })).toBeVisible();
    await page.getByRole('button', { name: 'Skip readiness check' }).click();
    await expect(page.getByRole('button', { name: 'Start workout' })).toBeVisible();
    await page.getByRole('button', { name: 'Start workout' }).click();
    await expect(page.getByText('How recovered do you feel right now?')).toBeVisible();
    await page.getByRole('button', { name: '5', exact: true }).click();

    await expectOverwhelmClearOfJump(page);

    const viewport = page.viewportSize();
    await page.setViewportSize({ width: 360, height: viewport?.height ?? 851 });
    await expectOverwhelmClearOfJump(page);

    expect(errors.pageErrors, errors.pageErrors.join('\n')).toEqual([]);
  });
});

/** Jump and the overwhelm trigger must each win a hit-test at their centres, and stay at least 8px apart. */
async function expectOverwhelmClearOfJump(page: Page) {
  const jump = page.getByRole('button', { name: 'Jump' });
  const overwhelm = page.getByRole('button', { name: 'Open Overwhelm Protocol' });
  await expect(jump).toBeVisible();
  await expect(overwhelm).toBeVisible();

  const hit = await page.evaluate(() => {
    const jumpEl = [...document.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'Jump',
    );
    const overwhelmEl = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Open Overwhelm Protocol"]',
    );
    if (!jumpEl || !overwhelmEl) return { found: false as const };

    const jumpRect = jumpEl.getBoundingClientRect();
    const overwhelmRect = overwhelmEl.getBoundingClientRect();
    const jumpHit = document.elementFromPoint(
      jumpRect.left + jumpRect.width / 2,
      jumpRect.top + jumpRect.height / 2,
    );
    const overwhelmHit = document.elementFromPoint(
      overwhelmRect.left + overwhelmRect.width / 2,
      overwhelmRect.top + overwhelmRect.height / 2,
    );
    const overlapX = Math.min(jumpRect.right, overwhelmRect.right) - Math.max(jumpRect.left, overwhelmRect.left);
    const overlapY = Math.min(jumpRect.bottom, overwhelmRect.bottom) - Math.max(jumpRect.top, overwhelmRect.top);
    let gap = 0;
    if (overlapX > 0 && overlapY > 0) {
      gap = 0;
    } else if (overlapX > 0) {
      gap = Math.max(jumpRect.top, overwhelmRect.top) - Math.min(jumpRect.bottom, overwhelmRect.bottom);
    } else if (overlapY > 0) {
      gap = Math.max(jumpRect.left, overwhelmRect.left) - Math.min(jumpRect.right, overwhelmRect.right);
    } else {
      const dx = Math.max(jumpRect.left, overwhelmRect.left) - Math.min(jumpRect.right, overwhelmRect.right);
      const dy = Math.max(jumpRect.top, overwhelmRect.top) - Math.min(jumpRect.bottom, overwhelmRect.bottom);
      gap = Math.hypot(dx, dy);
    }

    return {
      found: true as const,
      jumpOwnsHit: jumpHit === jumpEl || (jumpHit != null && jumpEl.contains(jumpHit)),
      overwhelmOwnsHit: overwhelmHit === overwhelmEl,
      intersects: overlapX > 0 && overlapY > 0,
      gap,
      overwhelmWidth: overwhelmRect.width,
      overwhelmHeight: overwhelmRect.height,
      jumpHit: jumpHit instanceof Element ? jumpHit.getAttribute('aria-label') ?? jumpHit.textContent?.trim() : null,
      overwhelmHit:
        overwhelmHit instanceof Element
          ? overwhelmHit.getAttribute('aria-label') ?? overwhelmHit.textContent?.trim()
          : null,
    };
  });

  expect(hit.found, 'Jump and Overwhelm controls should be in the document').toBe(true);
  if (!hit.found) return;
  expect(hit.jumpOwnsHit, `Jump centre hit ${String(hit.jumpHit)}`).toBe(true);
  expect(hit.overwhelmOwnsHit, `Overwhelm centre hit ${String(hit.overwhelmHit)}`).toBe(true);
  expect(hit.intersects, `bounding boxes intersect (gap ${hit.gap})`).toBe(false);
  expect(hit.gap, `gap between Jump and Overwhelm is ${hit.gap}px`).toBeGreaterThanOrEqual(8);
  expect(hit.overwhelmWidth).toBeGreaterThanOrEqual(44);
  expect(hit.overwhelmHeight).toBeGreaterThanOrEqual(44);
}
