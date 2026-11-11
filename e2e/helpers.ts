import { expect, type BrowserContext, type Page } from '@playwright/test';
import { E2E_USER_ID } from '../src/lib/supabase/e2eStub';

/**
 * Monday 2026-11-09 10:00 in America/Chicago.
 * That week is CST (UTC−6), so 10:00 local is 16:00 UTC. An absolute instant
 * keeps the browser's calendar day stable when the runner itself is on UTC.
 */
export const FIXED_NOW = new Date('2026-11-09T16:00:00.000Z');

/** Same Chicago morning, `days` after `FIXED_NOW`. Sunday of that week is +6. */
export function fixedNowPlusDays(days: number): Date {
  return new Date(FIXED_NOW.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Freeze `Date.now()` and `new Date()` before the first navigation.
 * `setFixedTime` leaves timers running. Call again to move the frozen instant;
 * do not resume the wall clock.
 */
export async function installFixedClock(page: Page, at: Date = FIXED_NOW): Promise<void> {
  await page.clock.setFixedTime(at);
}

/** Sets the cookie the E2E stub treats as a signed-in session. */
export async function signIn(context: BrowserContext) {
  await context.addCookies([
    {
      name: 'e2e-user',
      value: '1',
      domain: '127.0.0.1',
      path: '/',
      sameSite: 'Lax',
    },
  ]);
}

/** `scrollWidth` noticeably wider than the layout viewport usually means horizontal scroll. */
export async function expectNoHorizontalOverflow(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => {
    const root = document.documentElement;
    return { scrollWidth: root.scrollWidth, clientWidth: root.clientWidth };
  });
  expect(
    scrollWidth,
    `layout overflow: scrollWidth ${scrollWidth} > clientWidth ${clientWidth}`,
  ).toBeLessThanOrEqual(clientWidth + 1);
}

/** Records uncaught page errors and `console.error` lines for the rest of the test. */
export function collectPageErrors(page: Page) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => {
    pageErrors.push(error instanceof Error ? error.message : String(error));
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  return { pageErrors, consoleErrors };
}

/** Row count in the signed-in Dexie database. Missing database or table counts as 0. */
export async function countDexieRows(page: Page, table: string): Promise<number> {
  return page.evaluate(
    async ({ userId, tableName }: { userId: string; tableName: string }) => {
      const name = `workout-${userId}`;
      const existing = await indexedDB.databases();
      if (!existing.some((db) => db.name === name)) return 0;
      return await new Promise<number>((resolve, reject) => {
        const req = indexedDB.open(name);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(tableName)) {
            db.close();
            resolve(0);
            return;
          }
          const getReq = db.transaction(tableName, 'readonly').objectStore(tableName).count();
          getReq.onerror = () => {
            db.close();
            reject(getReq.error);
          };
          getReq.onsuccess = () => {
            const count = getReq.result;
            db.close();
            resolve(count);
          };
        };
      });
    },
    { userId: E2E_USER_ID, tableName: table },
  );
}
