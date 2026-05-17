-- Work-shift flag per stress check-in row (app field workDay).
--
-- rollback:
--   alter table if exists public.stress_logs drop column if exists work_day;

alter table if exists public.stress_logs
  add column if not exists work_day boolean;
