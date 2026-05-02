-- Mindfulness minutes logged with daily readiness check-in.
--
-- rollback:
--   alter table if exists public.readiness_logs drop constraint if exists readiness_logs_mindfulness_minutes_check;
--   alter table if exists public.readiness_logs drop column if exists mindfulness_minutes;

alter table if exists public.readiness_logs
  add column if not exists mindfulness_minutes int;

alter table if exists public.readiness_logs
  drop constraint if exists readiness_logs_mindfulness_minutes_check;

alter table if exists public.readiness_logs
  add constraint readiness_logs_mindfulness_minutes_check
  check (mindfulness_minutes is null or mindfulness_minutes between 0 and 180);
