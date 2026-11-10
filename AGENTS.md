<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Workout app — agent notes

Personal strength + cardio tracker: **Next.js 16** (App Router), **TypeScript**, **Tailwind v4**, **Supabase** (sync + GitHub OAuth), **Dexie** (IndexedDB offline cache + dirty queue), **PWA** (`public/sw.js`).

## Invariants

- **Dexie**: Never edit a released `this.version(N).stores({...})` block in `src/lib/db.ts`. Add a new `this.version(N+1)` when indexes change. Bump `SCHEMA_VERSION` to match the latest version number. Call `resetSyncState()` from the app when you intentionally need a full re-pull after a schema bump (see existing patterns).
- **Postgres**: Migrations in `supabase/migrations/` are append-only and idempotent; run in filename order (see `supabase/migrations/README.md`).
- **Sync**: Row shape conversion lives in `src/lib/syncCodec.ts` (`toRemote` / `fromRemote`). `src/lib/sync.ts` owns I/O (pull, push, realtime). Optional fields round-trip as `undefined` locally, not `null` — tests in `tests/syncCodec.test.ts` lock this in.
- **Env**: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are required for auth and sync. Copy from `.env.example` → `.env.local` (not committed).
- **Layout**: `LayoutModeProvider` (`src/lib/layoutMode.tsx`, wired in `src/app/providers.tsx`) persists `workout:layout-mode` in `localStorage` — default **phone** (`mobile`); **wide** (`desktop`) widens `PageShell` max-widths. Bottom nav has a **Wide / Phone** toggle.
- **Macro trend hints**: `src/lib/macroTrend.ts` + `useMacroTrendAdvice` scan **nutrition/hydration logs for the 7 calendar days before** a reference date (excludes that day). Shown on **Today** (dismissible) and **Daily Check-In** — text only; **never** changes prescriptions or progression.

## E2E stub

Playwright boots the dev server with `NEXT_PUBLIC_E2E_STUB=1` (and `NODE_ENV` is not production). `src/lib/supabase/e2eStub.ts` then replaces the browser Supabase client, and `src/proxy.ts` skips the real auth call. The stub signs in only when the `e2e-user=1` cookie is present. Table rows are stored in `localStorage` under `e2e:db:<table>`. Set `localStorage` key `e2e:fail` to a comma-separated list of table names to make `upsert` and `delete` on those tables fail. A production build throws if `NEXT_PUBLIC_E2E_STUB=1`.

## Commands

- `npm run dev` — dev server
- `npm test` / `npm run test:watch` — Vitest (`tests/*.test.ts`)
- `npm run test:e2e` / `npm run test:e2e:ui` — Playwright mobile smoke (`e2e/`)
- `npm run lint` / `npm run build`

**After code changes:** run the full test suite before finishing — `npm test` then `npm run test:e2e` (both must pass). Do not report work complete after unit tests only.

## Docs

- Architecture overview: `README.md`
- Deferred product ideas: `docs/future-features.md`
- Backlog checkboxes: `docs/upgrades-todo.md`
- Ship checklist: `docs/release-checklist.md`
