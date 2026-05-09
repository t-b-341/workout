-- Optional persisted classification (usually derived at export from set_logs).
alter table if exists public.session_logs
  add column if not exists session_status text;

alter table if exists public.session_logs
  drop constraint if exists session_logs_session_status_check;

alter table if exists public.session_logs
  add constraint session_logs_session_status_check
  check (
    session_status is null
    or session_status in ('completed', 'skipped', 'partial', 'ghost')
  );
