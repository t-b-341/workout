# Release checklist

Short list before tagging or deploying a meaningful change.

- [ ] `npm run lint` and `npm test` pass locally (CI runs these too).
- [ ] `npm run test:e2e` if you touched routes, layout, or auth redirects.
- [ ] If you changed **service worker caching** (shell URLs, strategies, or precache list), bump `CACHE_VERSION` in `public/sw.js` so existing installs drop stale caches.
- [ ] If you changed **Dexie** shape or indexes, bump `SCHEMA_VERSION` in `src/lib/db.ts` and add a new `this.version(N)` block (never edit old version blocks).
- [ ] If you changed **Postgres** shape, add an append-only file under `supabase/migrations/` (see `supabase/migrations/README.md`).
