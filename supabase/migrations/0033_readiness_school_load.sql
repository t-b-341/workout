-- Subjective school/study workload on readiness check-ins (0 = none, 1–3 = light–heavy).
--
-- rollback:
--   alter table if exists public.readiness_logs
--     drop constraint if exists readiness_logs_school_load_check;
--   alter table if exists public.readiness_logs drop column if exists school_load;

alter table if exists public.readiness_logs
  add column if not exists school_load int;

alter table if exists public.readiness_logs
  drop constraint if exists readiness_logs_school_load_check;

alter table if exists public.readiness_logs
  add constraint readiness_logs_school_load_check
  check (school_load is null or school_load between 0 and 3);
