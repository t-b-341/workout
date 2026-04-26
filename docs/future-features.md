# Future features

Ideas that are deliberately deferred. Add to this file when the answer to "do
we need this in the next iteration?" is "no, but we should remember it."

---

## LLM-powered weekly review

**Status:** deferred — wait until readiness, muscle-group tags, PRs, and
bodyweight trends are mature so a model has interesting data to summarize.

**What:** a button on `History → Weeks` that generates a structured natural-language
summary of the past ISO week, plus per-prescription change suggestions the user
can apply with one tap.

**Sketch of the implementation:**

- New API route `app/api/weekly-review/route.ts` (server-side; uses
  `createClient()` from `lib/supabase/server.ts` so the user is authenticated
  via cookie, never via the browser sending a model API key).
- New table `weekly_reviews` (migration `0005_weekly_reviews.sql`):

  ```sql
  create table public.weekly_reviews (
    id           text primary key,           -- e.g. "2026-W17"
    user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
    iso_week     text not null,
    summary      text not null,
    flags        jsonb not null default '[]',
    suggestions  jsonb not null default '[]', -- [{prescriptionId, patch, reason}]
    model        text,                        -- e.g. "claude-sonnet-4.5"
    generated_at timestamptz not null default now()
  );
  ```

- Server pulls last 7 days of `session_logs`, `set_logs`, `cardio_logs`,
  `bodyweight_logs`, and `readiness_logs`; serializes to a compact JSON
  payload (strip ids, redact `notes` if too long).
- Prompt asks for structured JSON:
  ```ts
  type ReviewResponse = {
    summary: string;       // 3–6 sentences
    flags: Array<{
      severity: 'info' | 'warn' | 'concern';
      message: string;
    }>;
    suggestions: Array<{
      prescriptionId: string;
      patch: Partial<Prescription>;
      reason: string;
    }>;
  };
  ```
- Cache one row per `iso_week` so visiting the page doesn't regenerate.
- Provider is swappable via env: read `OPENAI_API_KEY` *or*
  `ANTHROPIC_API_KEY`. Never expose the key client-side.
- UI on `HistoryView`'s `Weeks` tab: a "Generate review" button on the most
  recent week, then a card with summary + flag chips + a list of
  `[Apply] reason` rows that call `localUpsert('prescriptions', { ...p, ...patch })`
  on click.

**Why we're skipping it for now:**

1. The data model gets significantly richer in the current iteration (timestamps,
   muscle groups, readiness, PRs). Running an LLM against the *current* schema
   is a strictly worse demo than running it against the post-iteration schema.
2. It introduces an outbound dependency (and an API key) — best to land it
   when there's an obvious "yes this is useful" moment to point at.
3. The structured-suggestions pattern needs a proper safety net (preview /
   undo) that's easier to build once `prescriptions` has a per-field merge
   policy from sync hardening.
