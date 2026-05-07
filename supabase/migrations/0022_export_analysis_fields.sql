-- Adds set intent, session label type, and nutrition day classification for richer exports / analysis.
--
-- Defaults applied on add (existing rows picked up automatically by NOT NULL DEFAULT):
--   set_logs.intent → 'working'
--   session_logs.session_type → 'standard'
--   nutrition_logs.day_type → 'rest' (client backfill infers training where a completed non-skip session exists)
--
-- rollback:
--   alter table public.set_logs drop column if exists intent;
--   alter table public.session_logs drop column if exists session_type;
--   alter table public.nutrition_logs drop column if exists day_type;

alter table public.set_logs
  add column if not exists intent text not null default 'working';

alter table public.session_logs
  add column if not exists session_type text not null default 'standard';

alter table public.nutrition_logs
  add column if not exists day_type text not null default 'rest';

update public.set_logs set intent = 'working' where coalesce(trim(intent), '') = '';
update public.session_logs set session_type = 'standard' where coalesce(trim(session_type), '') = '';
update public.nutrition_logs set day_type = 'rest' where coalesce(trim(day_type), '') = '';
