-- Migrate session_logs.id and readiness_logs.id to user-scoped primary
-- keys. Same root cause as 0051/0052: the existing client builds
-- session_logs.id from `${date}-${templateId}` (e.g. '2026-05-27-U1'),
-- which is identical across users on the same day/template. The second
-- user's upsert hits ON CONFLICT DO UPDATE, RLS rejects the UPDATE, and
-- the push silently no-ops. Set / cardio / readiness logs then either
-- never push (FK to a session_log that never landed) or land orphaned.
--
-- Three tables carry FKs to session_logs.id (set_logs, cardio_logs,
-- readiness_logs). We add ON UPDATE CASCADE to each FK before renaming
-- session_logs.id so existing relationships follow the new ids.
-- readiness_logs.id is itself `readiness-${session.id}` and so is also
-- collision-prone — prefix that separately as a final step.
--
-- Idempotent: only rows whose id has no ':' yet are rewritten. The FK
-- drop/recreate is also idempotent (drop is `if exists`, the add always
-- runs with the same target shape).
--
-- rollback:
--   -- Unsafe once multiple users share a bare id suffix. Approximate
--   -- restore (single-user only):
--   --
--   -- update public.readiness_logs
--   --    set id = split_part(id, ':', 2)
--   --  where strpos(id, ':') > 0;
--   -- update public.session_logs
--   --    set id = split_part(id, ':', 2)
--   --  where strpos(id, ':') > 0;
--   --
--   -- And revert the FKs to drop ON UPDATE CASCADE if desired.

-- 1. Recreate FKs to session_logs.id with ON UPDATE CASCADE so the
--    rename below propagates automatically.
alter table public.set_logs drop constraint if exists set_logs_session_log_id_fkey;
alter table public.set_logs
  add constraint set_logs_session_log_id_fkey
  foreign key (session_log_id) references public.session_logs(id)
  on delete cascade on update cascade;

alter table public.cardio_logs drop constraint if exists cardio_logs_session_log_id_fkey;
alter table public.cardio_logs
  add constraint cardio_logs_session_log_id_fkey
  foreign key (session_log_id) references public.session_logs(id)
  on delete set null on update cascade;

alter table public.readiness_logs drop constraint if exists readiness_logs_session_log_id_fkey;
alter table public.readiness_logs
  add constraint readiness_logs_session_log_id_fkey
  foreign key (session_log_id) references public.session_logs(id)
  on delete cascade on update cascade;

-- 2. Prefix bare session_logs.id with user_id. FK columns in
--    set_logs / cardio_logs / readiness_logs follow automatically via
--    the cascade.
update public.session_logs
   set id = user_id::text || ':' || id
 where strpos(id, ':') = 0;

-- 3. Prefix readiness_logs.id (its own PK is also derived from
--    session.id — `readiness-${date}-${templateId}` — so it collides
--    the same way). This UPDATE doesn't touch session_log_id, which
--    was already migrated by the cascade.
update public.readiness_logs
   set id = user_id::text || ':' || id
 where strpos(id, ':') = 0;
