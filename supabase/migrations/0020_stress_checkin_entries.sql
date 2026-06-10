-- Timestamped stress check-ins (1–5); multiple rows per user per day.
--
-- rollback: restore from backup / snapshot; in-place rollback is lossy.

alter table if exists public.stress_logs
  add column if not exists logged_at timestamptz,
  add column if not exists rating int;

do $$
begin
  -- Legacy rows from average column
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'stress_logs' and column_name = 'average'
  ) then
    update public.stress_logs set logged_at = coalesce(logged_at, (date::text || 'T12:00:00Z')::timestamptz), rating = coalesce(rating, least(5, greatest(1, round(average)::int))) where logged_at is null and average is not null;
  end if;
  -- Fallback from triple ratings
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'stress_logs' and column_name = 'start_of_day'
  ) then
    update public.stress_logs set logged_at = coalesce(logged_at, (date::text || 'T12:00:00Z')::timestamptz), rating = coalesce(rating, least(5, greatest(1, round((start_of_day + mid_day + end_of_day) / 3.0)::int))) where logged_at is null and start_of_day is not null and mid_day is not null and end_of_day is not null;
  end if;
end $$;

delete from public.stress_logs where logged_at is null or rating is null;

alter table public.stress_logs drop column if exists start_of_day;
alter table public.stress_logs drop column if exists mid_day;
alter table public.stress_logs drop column if exists end_of_day;
alter table public.stress_logs drop column if exists average;
alter table public.stress_logs drop column if exists management_effectiveness;

alter table public.stress_logs alter column logged_at set not null;
alter table public.stress_logs alter column rating set not null;

alter table public.stress_logs drop constraint if exists stress_logs_rating_check;
alter table public.stress_logs add constraint stress_logs_rating_check check (rating between 1 and 5);
