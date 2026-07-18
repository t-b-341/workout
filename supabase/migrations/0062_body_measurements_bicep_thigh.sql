-- Add optional bicep and thigh measurements (inches).
--
-- rollback:
--   alter table if exists public.body_measurement_logs drop column if exists bicep;
--   alter table if exists public.body_measurement_logs drop column if exists thigh;

alter table if exists public.body_measurement_logs
  add column if not exists bicep numeric,
  add column if not exists thigh numeric;
