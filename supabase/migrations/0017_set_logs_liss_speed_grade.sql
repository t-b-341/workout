-- LISS intensity on set_logs (mirrors cardio_logs; powers PR detection).
-- Safe to run multiple times.

alter table public.set_logs
  add column if not exists speed_mph numeric;

alter table public.set_logs
  add column if not exists grade_pct numeric;
