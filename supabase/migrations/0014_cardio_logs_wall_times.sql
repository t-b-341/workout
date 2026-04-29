-- Wall-clock cardio block boundaries (optional; derived client-side when absent).
--
-- rollback:
--   alter table public.cardio_logs drop column if exists started_at;
--   alter table public.cardio_logs drop column if exists ended_at;

alter table public.cardio_logs add column if not exists started_at timestamptz;
alter table public.cardio_logs add column if not exists ended_at timestamptz;
