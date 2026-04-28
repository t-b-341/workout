# Upgrades to-do list

Consolidated backlog from product, UX, engineering, and testing discussions. Reorder or delete rows as priorities change.

---

## Engineering & quality

- [x] Add CI (e.g. GitHub Actions): `npm run lint`, `npm test`, `npm run build` on PR/push
- [x] Add targeted tests for sync row codec (`src/lib/syncCodec.ts`, exercised by `sync.ts`)
- [ ] Extend Playwright e2e with **auth `storageState`** (or test user) for Today / History at mobile width
- [ ] Optional: Playwright smoke on `/history`, `/program` breakpoints (desktop vs mobile projects)
- [x] Dependabot weekly npm updates (`.github/dependabot.yml`)
- [x] Expand `AGENTS.md` with project-specific rules (Dexie `SCHEMA_VERSION`, migration order, env vars)

---

## Mobile (primary use)

- [x] Sticky session context: **SessionContextDock** — sets done / total, live session length while in progress, “Since log” rest line, **Jump** to first open lift (`scroll-mt` on `LiftCard`)
- [x] Glanceable day progress — same dock shows `done/total` working slots for today’s template
- [x] Per-lift **Last time** pill on `LiftCard` (prior session sets + date)
- [x] Global sync/offline strip on Today (`SyncStatusBar`) + link to Program
- [ ] Rest timer: larger tap targets, optional sound/haptic toggles (respect `prefers-reduced-motion`)
- [ ] Optional: expandable one-line **set notes** without leaving the row
- [x] Week-at-a-glance — **WeekActivityStrip** (Mon–Sun, ISO week; green dot = strength session or cardio that day)
- [ ] Optional: first-run checklist (install PWA, log first set) with dismiss
- [ ] Optional: high-contrast or “sunlight” theme / larger type scale in settings
- [x] Silence Next dev **HMR cross-origin** warning when using `127.0.0.1` (`allowedDevOrigins` in `next.config.ts`)

## Layout (phone vs wide column)

- [x] **Phone layout (default)** — narrow content column via `PageShell` + nav chrome; persisted as `workout:layout-mode` in `localStorage` (`LayoutModeProvider` in `src/app/providers.tsx`)
- [x] **Wide layout** — wider `max-w-*` for History / Program / etc.; toggle last cell in bottom nav (**Wide** / **Phone**)

---

## Desktop (analysis & editing)

- [x] History: wider layout when **Wide** mode — `PageShell` uses `max-w-5xl` vs `max-w-2xl` in phone mode (not yet side-by-side chart + table)
- [ ] History Trends: **compare** two ranges or two lifts (overlay or toggle)
- [ ] Export: CSV or “copy table” from Weeks / Trends for spreadsheets
- [ ] Keyboard navigation and density pass on History tabs and tables
- [ ] Keep complex program editing desktop-first; mobile only “view + quick tweak” if needed

---

## UX / polish (cross-cutting)

- [ ] Undo snackbar for destructive actions (delete set, clear session)
- [ ] Optional: micro-celebration on session complete / weekly goal (with reduced-motion path)
- [ ] Optional: command palette / search — jump to lift, route, or “log BW”
- [ ] Optional: “recent lifts” chips for fast return to `/lifts/[id]`
- [ ] Optional: share card / image for a week summary or PR (client-side)
- [ ] Accessibility pass: labels, focus order, touch targets on forms and steppers
- [ ] Optional: light / dark / OLED-black theme toggle

---

## Product (already sketched elsewhere)

- [ ] `docs/future-features.md` — LLM weekly review when data + merge/undo story are ready
- [ ] Prescription merge **preview / undo** before automated suggestions (safety net for sync + future LLM)

---

## Observability & PWA

- [ ] Optional: client error reporting (e.g. Sentry) or “copy debug info” for sync/auth failures
- [x] Release checklist for `CACHE_VERSION` / Dexie / migrations — `docs/release-checklist.md`

---

## Done (reference)

- [x] Playwright mobile viewport smoke (`npm run test:e2e`) — login + redirect, no horizontal overflow (`e2e/mobile-layout.spec.ts`)
