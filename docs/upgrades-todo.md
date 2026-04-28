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

- [ ] Sticky session context: elapsed time, rest state, “jump to current” while scrolling long Today lists
- [ ] Glanceable day progress (e.g. sets done / total, or per-block ring) on Today
- [ ] Per-lift “last time here” line (top set + reps from last session or last week)
- [x] Global sync/offline strip on Today: pending count + link to Program sync (last-sync timestamp deferred)
- [ ] Rest timer: larger tap targets, optional sound/haptic toggles (respect `prefers-reduced-motion`)
- [ ] Optional: expandable one-line **set notes** without leaving the row
- [ ] Optional: week-at-a-glance row (Mon–Sun) on Today for consistency motivation
- [ ] Optional: first-run checklist (install PWA, log first set) with dismiss
- [ ] Optional: high-contrast or “sunlight” theme / larger type scale in settings
- [x] Silence Next dev **HMR cross-origin** warning when using `127.0.0.1` (`allowedDevOrigins` in `next.config.ts`)

---

## Desktop (analysis & editing)

- [ ] History: wider layout at `md+` (side-by-side chart + table where useful)
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
