-- Add perceived stress-management effectiveness to daily stress logs.
--
-- rollback:
--   alter table if exists public.stress_logs drop column if exists management_effectiveness;

alter table if exists public.stress_logs
  add column if not exists management_effectiveness int;

alter table if exists public.stress_logs
  drop constraint if exists stress_logs_management_effectiveness_check;

alter table if exists public.stress_logs
  add constraint stress_logs_management_effectiveness_check
  check (
    management_effectiveness is null
    or management_effectiveness between 1 and 5
  );
