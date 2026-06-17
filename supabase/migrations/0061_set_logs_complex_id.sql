-- Add optional complex_id on set logs to group sets performed as part of a
-- weightlifting complex.
--
-- rollback:
--   alter table if exists public.set_logs drop column if exists complex_id;

alter table if exists public.set_logs
  add column if not exists complex_id text;
