import { expect, type BrowserContext, type Page } from '@playwright/test';

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
