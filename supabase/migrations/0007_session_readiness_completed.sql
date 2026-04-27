-- Timestamp when Today readiness was submitted or skipped (gates History until set).
-- Safe to run multiple times.

alter table public.session_logs
  add column if not exists readiness_completed_at timestamptz;
