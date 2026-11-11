# Workout

Personal strength + cardio tracker. Local-first PWA with Supabase sync, designed
to be planned on Windows and tracked on Android.

## Stack

- **Next.js 16** (App Router, Turbopack) + **TypeScript** + **Tailwind v4**
- **Supabase** (Postgres + GitHub OAuth + RLS) for sync, with realtime
  fan-in via `postgres_changes`
- **Dexie** (IndexedDB) for offline cache, with an incremental `updated_at`
  watermark and a dirty queue that survives reloads — works in the gym
  with no signal
- **PWA** — install to your phone home screen; a service worker caches
  the app shell so it boots offline
- **Vitest** for unit tests (`npm test`)

## Getting started

### 1. Install Node.js (already done if you ran the agent)

### 2. Install dependencies

```bash
npm install
```

### 3. Set up Supabase

Create a project at [supabase.com](https://supabase.com), then:

1. Copy `.env.example` → `.env.local` and paste your project URL + anon key
2. In the Supabase dashboard, go to **SQL Editor** and run every file in
   `supabase/migrations/` in filename order. See
   `supabase/migrations/README.md` for the rules around adding new ones.
3. **Authentication → Providers → GitHub** — enable it
   - Register a GitHub OAuth app at
     [github.com/settings/developers](https://github.com/settings/developers)
     - Homepage: `http://localhost:3000` (and your Vercel URL once deployed)
     - Callback: `https://<your-project-ref>.supabase.co/auth/v1/callback`
   - Paste the GitHub Client ID + Secret back into Supabase

### 4. Run

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000), sign in with GitHub. The
seed program loads on first run.

## Architecture

- `src/lib/types.ts` — domain types (Lift, Prescription, SessionLog, SetLog,
  CardioLog, BodyweightLog, ReadinessLog, MuscleGroup, MovementPattern)
- `src/lib/seed.ts` — the actual training program (lifts with muscle-group +
  movement-pattern tags, templates, prescriptions). Edit here to change the
  starting state for new users.
- `src/lib/db.ts` — Dexie schema (offline cache). Versioned — `SCHEMA_VERSION`
  bumps in lockstep with new `this.version(N)` blocks.
- `src/lib/sync.ts` — push/pull between Dexie and Supabase. Incremental pull
  via per-table `updated_at` watermarks, 401 → refresh-and-retry, realtime
  fan-in via `postgres_changes`.
- `src/lib/progression.ts` — double-progression engine, fully tested in
  `tests/progression.test.ts`
- `src/lib/stats.ts` — derived analytics: lift history, weekly summaries,
  PR detection / feed, weekly muscle-group volume, weekly pattern coverage,
  bodyweight rolling average, session duration
- `src/lib/supabase/{client,server}.ts` — Supabase clients
- `src/proxy.ts` — auth guard for all routes
- `src/components/*` — UI
- `public/sw.js` — service worker (cache-first shell, stale-while-revalidate
  for assets, network-only for Supabase)
- `supabase/migrations/*.sql` — append-only, idempotent SQL migrations

## Routes

- `/` — Today (auto-suggests session by day-of-week; readiness check at
  start; rest timer between sets; PR badges flash on save; live session
  duration)
- `/recovery` — Daily Check-In (sleep, intake, stress, and the other daily logs)
- `/cardio` — log LISS / intervals + weekly 150-min rollup
- `/history` — sixteen tabs:
  - **Sessions** — every session with sets, reasons, watch-flags
  - **Trends** — per-lift e1RM + volume sparklines
  - **Types** — each program day compared only to itself
  - **Weeks** — weekly volume / cardio / mode counts / pattern coverage /
    sets-per-muscle-group / top sets
  - **PRs** — chronological PR feed (per-rep weight PRs)
  - **Goals** — lifting and bodyweight goals
  - **Muscle** — last-12-weeks pattern + muscle-group set counts
  - **BW** — bodyweight chart with raw + 4-week rolling average
  - **Measure** — body measurements
  - **Diet** — nutrition logs
  - **Supplements** — supplement logs
  - **Caffeine** — caffeine logs
  - **Hydration** — hydration logs
  - **Injuries** — injury episodes
  - **HRV** — HRV readings and variability
  - **Strength Balance** — main-lift strength ratios
- `/lifts/[liftId]` — movement-specific dashboard (active prescriptions,
  e1RM trend, top-set + volume bars, PR table by rep range, full session log)
- `/program` — editor for prescriptions, schedule, and mesocycles
- `/program/meso-analysis` — mesocycle analysis for a named block or a custom
  date range
- `/settings` — reminders, wellness targets, Today display prefs, visible
  measurements, and the wide/phone layout choice
- `/login` — GitHub sign-in
- `/auth/callback` — OAuth code exchange

## Access

`NEXT_PUBLIC_ALLOWED_USER_IDS` is an extra gate after GitHub sign-in. It is a
comma-separated list of Supabase user UUIDs. When the variable is empty, the
gate is off (`src/lib/authAllowlist.ts`). Set it in Vercel for a deployed app.
Row-level security in Supabase is the real protection; this variable only
limits which signed-in users see the app UI.

## Deploy

Push to GitHub, import in [Vercel](https://vercel.com), and set
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Set
`NEXT_PUBLIC_ALLOWED_USER_IDS` there too if you want the allowlist on (see
Access). Add the Vercel URL to the GitHub OAuth app redirect URIs.

GitHub Actions runs **lint, typecheck, unit tests, Playwright mobile smoke, and
production build** on every push and pull request (`.github/workflows/ci.yml`).
Before a meaningful release, see `docs/release-checklist.md`.

## Tests

```bash
npm test              # Vitest, one-shot
npm run test:watch    # rerun on change
npm run test:e2e      # Playwright mobile smoke (headless)
npm run test:e2e:ui   # interactive runner + trace viewer
npm run typecheck     # tsc --noEmit, including test files
```

The progression engine is the highest-leverage piece of logic. It is covered
in `tests/progression.test.ts` (standard / light / skip / deload, per-side
lifts, increment overrides, snapping helpers).

### Mobile layout from desktop

- **Chrome DevTools** — Toggle the device toolbar (Ctrl+Shift+M / Cmd+Shift+M),
  pick a phone preset, and throttle CPU/network if you want a closer gym
  simulation.
- **Playwright (automated)** — Runs the dev server and loads key routes in
  **Pixel 5** and **iPhone 12** viewports (no GitHub login required for the
  current checks):

  ```bash
  npm run test:e2e        # headless
  npm run test:e2e:ui     # interactive runner + trace viewer
  ```

  First-time setup on a new machine: `npx playwright install chromium webkit`.

  To extend coverage after signing in once, use
  [`storageState`](https://playwright.dev/docs/auth#reuse-signed-in-authentication)
  and add specs for Today / History at mobile width.

## Future work

`docs/future-features.md` lists deferred ideas (currently: LLM-powered
weekly review).

## Source program

See `docs/program.md` for the original spec.
