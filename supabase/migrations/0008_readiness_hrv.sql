-- Add optional HRV signal fields to readiness check-ins.
--
-- rollback:
--   alter table if exists public.readiness_logs drop column if exists hrv_skipped;
--   alter table if exists public.readiness_logs drop column if exists hrv_measured_min;
--   alter table if exists public.readiness_logs drop column if exists hrv_rmssd;

alter table if exists public.readiness_logs
  add column if not exists hrv_rmssd numeric,
  add column if not exists hrv_measured_min int,
  add column if not exists hrv_skipped boolean;

alter table if exists public.readiness_logs
  drop constraint if exists readiness_logs_hrv_measured_min_check;

alter table if exists public.readiness_logs
  add constraint readiness_logs_hrv_measured_min_check
  check (hrv_measured_min is null or hrv_measured_min between 1 and 10);
