import { expect, test, type Page } from '@playwright/test';
import { E2E_USER_ID } from '../src/lib/supabase/e2eStub';
import { collectPageErrors, countDexieRows, expectNoHorizontalOverflow, signIn } from './helpers';

const ROUTES = ['/', '/recovery', '/history', '/cardio', '/program', '/program/meso-analysis', '/settings'] as const;

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
    await expectLoggedSetCount(page, 1);
    await logSet.first().click();
    await expectLoggedSetCount(page, 2);

    await page.reload();
    const status = page.getByRole('status');
    await expect(status).toContainText('failed to upload');
    await expect(status).toContainText('e2e injected');
    await expectLoggedSetCount(page, 2);
    await expect(page.getByRole('link', { name: 'Sync diagnostics' })).toHaveAttribute('href', '/program');

    await page.evaluate(() => localStorage.removeItem('e2e:fail'));
    await page.getByRole('link', { name: 'Sync diagnostics' }).click();
    await expect(page.getByRole('heading', { name: 'Program' })).toBeVisible();
    await page.getByRole('button', { name: 'Sync', exact: true }).click();
    await page.getByRole('navigation').getByRole('link', { name: 'Today' }).click();
    await expect(page.getByRole('status')).toContainText('Up to date', { timeout: 20_000 });
    await expectLoggedSetCount(page, 2);
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
    // Collapsed trackers do not mount, so viewing Today cannot write a supplement row.
    await expect(page.getByRole('checkbox', { name: 'ZMA' })).toHaveCount(0);
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

    await page.getByRole('button', { name: /^Supplements\b/ }).click();
    await expect(page.getByRole('checkbox', { name: 'ZMA' })).toBeVisible();
    await page.waitForTimeout(500);
    expect(await countDexieRows(page, 'supplement_logs')).toBe(0);
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

  test('keeps the workout in the first viewport and remembers an open tracker', async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto('/');

    const readiness = page.getByText('How are you walking in?', { exact: true });
    await expect(readiness).toBeVisible();
    const readinessBox = await documentBox(readiness);
    expect(readinessBox.scrollY).toBe(0);
    expect(readinessBox.top).toBeGreaterThanOrEqual(0);
    expect(readinessBox.top).toBeLessThan(readinessBox.viewportHeight);

    const trackerNames = [
      /^Cardio this week/,
      /^Pull-ups this week/,
      /^Mindfulness\b/,
      /^Work day\b/,
      /^Supplements\b/,
      /^Day's notes/,
      /^Bodyweight ·/,
      /^Body measurements/,
      /^Weekly tracking reminder/,
      /^Macro trend hint/,
    ];
    for (const name of trackerNames) {
      const row = page.getByRole('button', { name });
      await expect(row).toHaveCount(1);
      await expect(row).toHaveAttribute('aria-expanded', 'false');
      await expect(row).toHaveAttribute('aria-controls', /.+/);
    }
    const cardioHeight = await page.getByRole('button', { name: /^Cardio this week/ }).evaluate((el) => {
      return el.getBoundingClientRect().height;
    });
    expect(cardioHeight).toBeGreaterThanOrEqual(44);

    await page.getByRole('button', { name: 'Skip readiness check' }).click();
    const start = page.getByRole('button', { name: 'Start workout' });
    await expect(start).toBeVisible();
    const startBox = await documentBox(start);
    expect(startBox.top).toBeGreaterThanOrEqual(0);
    expect(startBox.bottom).toBeLessThanOrEqual(startBox.viewportHeight);

    await start.click();
    await expect(page.getByText('How recovered do you feel right now?')).toBeVisible();
    await page.getByRole('button', { name: '5', exact: true }).click();
    const logSet = page.getByRole('button', { name: 'Log set' }).first();
    await expect(logSet).toBeVisible();
    const logBox = await documentBox(logSet);
    expect(logBox.top).toBeLessThan(1200);

    const supplements = page.getByRole('button', { name: /^Supplements\b/ });
    await supplements.click();
    for (const name of ['ZMA', 'D3 + K2', 'Multivitamin', 'Creatine']) {
      await expect(page.getByRole('checkbox', { name })).toBeVisible();
    }
    await expect(supplements).toHaveAttribute('aria-expanded', 'true');

    await page.reload();
    await expect(page.getByRole('navigation').getByRole('link', { name: 'Today' })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'ZMA' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Supplements\b/ })).toHaveAttribute('aria-expanded', 'true');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('workout:todaySections:v1'))).toContain('"supplements":true');

    expect(errors.pageErrors, errors.pageErrors.join('\n')).toEqual([]);
  });

  test('collapses each lift to the current set on a seeded U1 session', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = collectPageErrors(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'U1', exact: true }).click();
    await page.getByRole('button', { name: 'Skip readiness check' }).click();
    await page.getByRole('button', { name: 'Start workout' }).click();
    await page.getByRole('button', { name: '5', exact: true }).click();

    const logButtons = page.getByRole('button', { name: 'Log set', exact: true });
    const cards = page.locator('[id^="lift-"]');
    await expect(logButtons.first()).toBeVisible();
    await expect(logButtons).toHaveCount(await cards.count());

    const metrics = await page.evaluate(() => {
      const inputs = [...document.querySelectorAll('[id^="lift-"] input')];
      const unnamed = inputs.flatMap((el) => {
        const input = el as HTMLInputElement;
        const name = input.getAttribute('aria-label')?.trim()
          || [...(input.labels ?? [])].map((label) => label.textContent?.trim() ?? '').filter(Boolean).join(' ');
        if (name && /set \d+/.test(name)) return [];
        return [name || input.outerHTML.slice(0, 140)];
      });
      return {
        scrollHeight: document.documentElement.scrollHeight,
        controls: document.querySelectorAll('button, input, select, textarea, a[href]').length,
        inputs: document.querySelectorAll('input').length,
        unnamed,
      };
    });
    console.log(`U1 collapsed session: ${metrics.scrollHeight}px, ${metrics.controls} controls, ${metrics.inputs} inputs`);
    expect(metrics.scrollHeight).toBeLessThan(7000);
    expect(metrics.unnamed, metrics.unnamed.join('\n')).toEqual([]);

    const stepperButtons = await page.locator('[id^="lift-"] button[aria-label*="decrease"], [id^="lift-"] button[aria-label*="increase"]').evaluateAll((els) =>
      els.map((el) => {
        const rect = el.getBoundingClientRect();
        return { name: el.getAttribute('aria-label'), width: rect.width, height: rect.height };
      }),
    );
    expect(stepperButtons.length).toBeGreaterThan(0);
    for (const button of stepperButtons) {
      expect(button.width, button.name ?? 'stepper').toBeGreaterThanOrEqual(48);
      expect(button.height, button.name ?? 'stepper').toBeGreaterThanOrEqual(48);
    }

    const remove = page.getByRole('button', { name: 'Remove Push Press from session' });
    const removeBox = await remove.boundingBox();
    expect(removeBox?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(removeBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    await expectNoHorizontalOverflow(page);

    const firstCard = cards.first();
    await firstCard.locator('[data-set-index="1"][data-expanded="false"]').click();
    await expect(
      firstCard.locator('[data-set-index="1"][data-expanded="true"]').getByRole('button', { name: 'Log set', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Jump' }).click();
    await expect(
      firstCard.locator('[data-set-index="0"][data-expanded="true"]').getByRole('button', { name: 'Log set', exact: true }),
    ).toBeVisible();

    await logButtons.first().click();
    const set1 = firstCard.locator('[data-set-index="0"][data-expanded="false"]');
    await expect(set1).toBeVisible();
    await expect(set1).toContainText('Done');
    const set1Height = await set1.evaluate((el) => el.getBoundingClientRect().height);
    expect(set1Height).toBeGreaterThanOrEqual(48);
    expect(set1Height).toBeLessThanOrEqual(64);
    await expect(
      firstCard.locator('[data-set-index="1"][data-expanded="true"]').getByRole('button', { name: 'Log set', exact: true }),
    ).toBeVisible();

    await set1.click();
    const update = firstCard.getByRole('button', { name: 'Update set', exact: true });
    await expect(update).toBeVisible();
    await update.click();

    for (let logged = 1; logged < 19; logged++) {
      const button = logButtons.first();
      await expect(button).toBeVisible();
      await button.evaluate((el: HTMLButtonElement) => el.click());
      await expectLoggedSetCount(page, logged + 1);
    }
    await expect(logButtons).toHaveCount(0);
    await expectLoggedSetCount(page, 19);

    await page.getByRole('button', { name: 'Finish session' }).click();
    await expect(page.getByRole('heading', { name: 'Workout complete!' })).toBeVisible();
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

  test('/settings loads with the bottom nav and shows all four groups', async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto('/settings');
    const nav = page.getByRole('navigation');
    await expect(nav.getByRole('link', { name: 'Today' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Daily Check-In' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'History' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Cardio' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Program' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Settings' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await expect(page.getByText('Reminders', { exact: true })).toBeVisible();
    await expect(page.getByText('Mindfulness & cardio goals')).toBeVisible();
    await expect(page.getByText('Today tab', { exact: true })).toBeVisible();
    await expect(page.getByText('Visible measurements', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Phone', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Wide', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sync diagnostics' })).toHaveAttribute(
      'href',
      '/program#sync-diagnostics',
    );
    await expectNoHorizontalOverflow(page);
    expect(errors.pageErrors, errors.pageErrors.join('\n')).toEqual([]);
  });

  test('hide prescribed sessions from Settings, then show them again', async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Hide prescribed sessions on Today' }).click();
    await expect(page.getByRole('button', { name: 'Show prescribed sessions on Today' })).toBeVisible();

    await page.getByRole('navigation').getByRole('link', { name: 'Today' }).click();
    await expect(page.getByText("Today's workout")).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Skip readiness check' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Quick Session/ })).toBeVisible();

    await page.getByRole('link', { name: 'Settings' }).click();
    await page.getByRole('button', { name: 'Show prescribed sessions on Today' }).click();
    await expect(page.getByRole('button', { name: 'Hide prescribed sessions on Today' })).toBeVisible();
    await page.getByRole('navigation').getByRole('link', { name: 'Today' }).click();
    await expect(page.getByText("Today's workout")).toBeVisible();
    expect(errors.pageErrors, errors.pageErrors.join('\n')).toEqual([]);
  });

  test('/recovery stays short when every daily card is collapsed', async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.setViewportSize({ width: 412, height: 915 });
    await page.goto('/recovery');
    await expect(page.getByRole('heading', { name: 'Daily Check-In' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible();
    await expect(page.getByText('Visible templates')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Save sleep' })).toHaveCount(0);
    await expect(page.getByText('Daily recovery')).toBeVisible();
    await expect(page.getByText("Today's recommendations")).toBeVisible();

    const morning = page.getByRole('heading', { name: 'Morning', exact: true });
    const intake = page.getByRole('heading', { name: 'Intake', exact: true });
    const mind = page.getByRole('heading', { name: 'Mind', exact: true });
    const body = page.getByRole('heading', { name: 'Body', exact: true });
    await expect(morning).toBeVisible();
    await expect(intake).toBeVisible();
    await expect(mind).toBeVisible();
    await expect(body).toBeVisible();

    const scoreBox = await documentBox(page.getByText('Daily recovery'));
    const recBox = await documentBox(page.getByText("Today's recommendations"));
    const morningBox = await documentBox(morning);
    const intakeBox = await documentBox(intake);
    const mindBox = await documentBox(mind);
    const bodyBox = await documentBox(body);
    expect(scoreBox.top).toBeLessThan(recBox.top);
    expect(recBox.top).toBeLessThan(morningBox.top);
    expect(morningBox.top).toBeLessThan(intakeBox.top);
    expect(intakeBox.top).toBeLessThan(mindBox.top);
    expect(mindBox.top).toBeLessThan(bodyBox.top);

    const metrics = await page.evaluate(() => ({
      height: document.documentElement.scrollHeight,
      controls: document.querySelectorAll('button, input, select, textarea, a[href]').length,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
    }));
    console.log(`recovery-collapsed ${JSON.stringify(metrics)}`);
    expect(metrics.height).toBeLessThan(2500);
    await expectNoHorizontalOverflow(page);
    expect(errors.pageErrors, errors.pageErrors.join('\n')).toEqual([]);
  });

  test('sleep row summary keeps the saved hours and quality', async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto('/recovery');
    const sleepRow = page.getByRole('button', { name: /^Sleep/ });
    await expect(sleepRow).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save sleep' })).toHaveCount(0);
    await sleepRow.click();
    await expect(page.getByRole('button', { name: 'Save sleep' })).toBeVisible();
    await page.getByLabel('Hours').fill('7.5');
    await page.getByLabel(/Quality/).fill('4');
    await page.getByRole('button', { name: 'Save sleep' }).click();
    await expect(sleepRow).toContainText('7.5 h, quality 4');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('e2e:db:sleep_logs') ?? '')).toContain('7.5');
    await page.reload();
    await expect(page.getByRole('button', { name: /^Sleep/ })).toContainText('7.5 h, quality 4');
    expect(errors.pageErrors, errors.pageErrors.join('\n')).toEqual([]);
  });

  test('the gear link on Today opens /settings', async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto('/');
    const gear = page.getByRole('link', { name: 'Settings' });
    await expect(gear).toBeVisible();
    const box = await gear.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    await gear.click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    expect(errors.pageErrors, errors.pageErrors.join('\n')).toEqual([]);
  });
});

/** Done badges, plus sets folded into a finished lift's "N sets done" summary. */
async function loggedSetCount(page: Page): Promise<number> {
  const badges = await page.getByText('Done', { exact: true }).count();
  let summarized = 0;
  const summaries = page.locator('[data-set-summary]');
  const summaryCount = await summaries.count();
  for (let i = 0; i < summaryCount; i++) {
    const match = /(\d+) sets? done/.exec(await summaries.nth(i).innerText());
    if (match) summarized += Number(match[1]);
  }
  return badges + summarized;
}

async function expectLoggedSetCount(page: Page, n: number) {
  await expect.poll(() => loggedSetCount(page)).toBe(n);
}

/** Document position of an element, plus the layout viewport height. */
async function documentBox(locator: ReturnType<Page['locator']>) {
  return locator.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return {
      top: rect.top + window.scrollY,
      bottom: rect.bottom + window.scrollY,
      viewportHeight: window.innerHeight,
      scrollY: window.scrollY,
    };
  });
}

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
