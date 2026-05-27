-- Migrate bare template IDs (e.g. 'L1', 'U1') to user-scoped IDs
-- (e.g. '<uuid>:L1') so that multiple users no longer collide on the same
-- primary key. Without this, a second user's upsert on id='L1' silently
-- no-ops under RLS because the existing row belongs to another user — the
-- client sees no error but the server stays unchanged.
--
-- Idempotent: only rows whose id has no ':' yet are rewritten. Re-running
-- this migration is a no-op.
--
-- rollback:
--   -- Lossy and unsafe if multiple users now share id suffixes (their
--   -- rows would collide on the bare id). Only valid if exactly one
--   -- user's templates were ever migrated.
--   update public.templates
--      set id = split_part(id, ':', 2)
--    where strpos(id, ':') > 0;

update public.templates
   set id = user_id::text || ':' || id
 where strpos(id, ':') = 0;
