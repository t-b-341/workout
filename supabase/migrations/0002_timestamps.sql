-- Adds session/set timestamps used by rest timer + session-duration UI.
-- Safe to run multiple times.
--
-- rollback:
--   alter table public.session_logs drop column if exists started_at;
--   alter table public.set_logs     drop column if exists logged_at;

alter table public.session_logs
  add column if not exists started_at timestamptz;

alter table public.set_logs
  add column if not exists logged_at timestamptz;
