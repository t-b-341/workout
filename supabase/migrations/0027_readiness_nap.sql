-- Optional day-before nap duration and timing on readiness check-ins (matches
-- `ReadinessLog` / `syncCodec` snake_case).
--
-- rollback:
--   alter table if exists public.readiness_logs
--     drop constraint if exists readiness_logs_nap_duration_min_check;
--   alter table if exists public.readiness_logs
--     drop constraint if exists readiness_logs_nap_timing_check;
--   alter table if exists public.readiness_logs drop column if exists nap_duration_min;
--   alter table if exists public.readiness_logs drop column if exists nap_timing;

alter table if exists public.readiness_logs
  add column if not exists nap_duration_min int;

alter table if exists public.readiness_logs
  add column if not exists nap_timing text;

alter table if exists public.readiness_logs
  drop constraint if exists readiness_logs_nap_duration_min_check;

alter table if exists public.readiness_logs
  add constraint readiness_logs_nap_duration_min_check
  check (
    nap_duration_min is null
    or nap_duration_min in (20, 30, 60, 90)
  );

alter table if exists public.readiness_logs
  drop constraint if exists readiness_logs_nap_timing_check;

alter table if exists public.readiness_logs
  add constraint readiness_logs_nap_timing_check
  check (
    nap_timing is null
    or nap_timing in ('early', 'late')
  );
