-- Add simple non-RPE effort scaling to session logs.
-- Safe to run multiple times.
--
-- rollback:
--   alter table public.session_logs drop column if exists effort_scale;

alter table public.session_logs
  add column if not exists effort_scale int not null default 0
  check (effort_scale in (-1, 0, 1));
