# Supabase migrations

Versioned, ordered, append-only. To add a column, table, index, RLS policy
or trigger:

1. Create a new file `NNNN_<short-feature>.sql` where `NNNN` is the next
   four-digit serial. **Never edit a previously committed migration.**
2. At the top of the file, add a comment block explaining the change and a
   rollback hint (the SQL you would run if you needed to back out, even if
   it's destructive — it's a forcing function for you to think about it):

   ```sql
   -- Adds X to enable Y.
   --
   -- rollback:
   --   alter table public.<table> drop column if exists <col>;
   ```
3. Make every statement idempotent (`if not exists`, `drop … if exists`,
   `or replace`, `do $$ … $$`) so re-running the file is safe.
4. If you bump the schema in a way clients must understand, also bump
   `SCHEMA_VERSION` in `src/lib/db.ts` and add a matching `this.version(N)`
   block to `WorkoutDB`.
5. To apply locally, paste the file into the Supabase SQL editor (or
   `supabase db push` if you've set up the CLI). The CLI workflow is the
   long-term plan; for now, manual paste is fine because there's only
   one human running these.

## Order of application

`0001_init.sql` → `0002_timestamps.sql` → `0003_readiness.sql` → ...

Filenames are the source of truth for ordering.
