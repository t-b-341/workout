-- Persist workout timer pause (stopwatch excludes paused wall time).
-- Safe to run multiple times.

alter table public.session_logs
  add column if not exists workout_paused_accum_ms integer not null default 0;

alter table public.session_logs
  add column if not exists workout_paused_at timestamptz;
