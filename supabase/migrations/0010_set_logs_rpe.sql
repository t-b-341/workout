-- Add optional RIR/RPE effort fields on set logs.
--
-- rollback:
--   alter table if exists public.set_logs drop column if exists rpe;
--   alter table if exists public.set_logs drop column if exists rir;

alter table if exists public.set_logs
  add column if not exists rir numeric,
  add column if not exists rpe numeric;
