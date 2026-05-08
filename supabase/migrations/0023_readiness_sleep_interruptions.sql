-- Add optional sleep interruption count to readiness check-ins.
--
-- rollback:
--   alter table if exists public.readiness_logs
--     drop constraint if exists readiness_logs_sleep_interruptions_check;
--   alter table if exists public.readiness_logs
--     drop column if exists sleep_interruptions;

alter table if exists public.readiness_logs
  add column if not exists sleep_interruptions int;

alter table if exists public.readiness_logs
  drop constraint if exists readiness_logs_sleep_interruptions_check;

alter table if exists public.readiness_logs
  add constraint readiness_logs_sleep_interruptions_check
  check (sleep_interruptions is null or sleep_interruptions between 0 and 20);
