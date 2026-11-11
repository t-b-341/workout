import { defineConfig, devices } from '@playwright/test';

/**
 * Mobile-sized browsers on your desktop machine — catches layout overflow
 * and broken tap targets without a physical phone.
 *
 * @see https://playwright.dev/docs/test-projects
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:3100',
    trace: 'on-first-retry',
    // Gym-local calendar. CI is UTC; without this, Wednesday/Sunday differ from a phone in Chicago.
    timezoneId: 'America/Chicago',
  },
  projects: [
    { name: 'Mobile Chrome', use: { ...devices['Pixel 5'] } },
    { name: 'Mobile Safari', use: { ...devices['iPhone 12'] } },
  ],
  webServer: {
    // Port 3100 so a normal dev server on 3000 is never reused.
    command: 'npm run dev -- --hostname 127.0.0.1 --port 3100',
    url: 'http://127.0.0.1:3100',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      NEXT_PUBLIC_E2E_STUB: '1',
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'e2e-anon-key',
    },
  },
});
