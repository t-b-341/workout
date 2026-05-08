-- Optional comment and kids-day flag per stress check-in row.
--
-- rollback:
--   alter table if exists public.stress_logs drop column if exists comment;
--   alter table if exists public.stress_logs drop column if exists kids_day;

alter table if exists public.stress_logs
  add column if not exists comment text,
  add column if not exists kids_day boolean;
