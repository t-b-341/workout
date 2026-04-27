-- Allow one bodyweight row per calendar day (log on any day, not only "weigh-in" day).
-- Replaces per-ISO-week uniqueness. Safe to run multiple times.
--
-- rollback:
--   drop index if exists public.bodyweight_logs_user_date_unique;
--   create unique index if not exists bodyweight_logs_user_week_unique
--     on public.bodyweight_logs (user_id, iso_week);

drop index if exists public.bodyweight_logs_user_week_unique;

create unique index if not exists bodyweight_logs_user_date_unique
  on public.bodyweight_logs (user_id, date);
