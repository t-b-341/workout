# Workout

Personal strength + cardio tracker. Local-first PWA with Supabase sync, designed
to be planned on Windows and tracked on Android.

## Stack

- **Next.js 15** (App Router) + **TypeScript** + **Tailwind v4**
- **Supabase** (Postgres + GitHub OAuth + RLS) for sync
- **Dexie** (IndexedDB) for offline cache — works in the gym with no signal
- **PWA** — install to your phone home screen

## Getting started

### 1. Install Node.js (already done if you ran the agent)

### 2. Install dependencies

```bash
npm install
```

### 3. Set up Supabase

Create a project at [supabase.com](https://supabase.com), then:

1. Copy `.env.example` → `.env.local` and paste your project URL + anon key
2. In the Supabase dashboard, go to **SQL Editor** and run
   `supabase/migrations/0001_init.sql`
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

- `src/lib/types.ts` — domain types
- `src/lib/seed.ts` — the actual training program (lifts, templates,
  prescriptions). Edit here to change starting state for new users.
- `src/lib/db.ts` — Dexie schema (offline cache)
- `src/lib/sync.ts` — push/pull between Dexie and Supabase
- `src/lib/progression.ts` — double-progression engine
- `src/lib/supabase/{client,server}.ts` — Supabase clients
- `src/middleware.ts` — auth guard for all routes
- `src/components/*` — UI

## Routes

- `/` — Today (auto-suggests session by day-of-week, override possible)
- `/cardio` — log LISS / intervals + weekly 150-min rollup
- `/history` — every session with sets, reasons, watch-flags
- `/program` — desktop-friendly editor for prescriptions

## Deploy

Push to GitHub, import in [Vercel](https://vercel.com), set the same two env
vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`). Add the
Vercel URL to GitHub OAuth app redirect URIs.

## Source program

See `docs/program.md` for the original spec.
