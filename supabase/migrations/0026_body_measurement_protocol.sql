-- Optional logging conditions for comparable circumference trends.

alter table if exists public.body_measurement_logs
  add column if not exists protocol text;

alter table if exists public.body_measurement_logs
  add column if not exists time_of_day text;

alter table if exists public.body_measurement_logs
  drop constraint if exists body_measurement_logs_time_of_day_check;

alter table if exists public.body_measurement_logs
  add constraint body_measurement_logs_time_of_day_check
  check (
    time_of_day is null
    or time_of_day in ('morning', 'afternoon', 'evening')
  );
