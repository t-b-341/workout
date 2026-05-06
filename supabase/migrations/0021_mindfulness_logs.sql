-- Timestamped mindfulness entries: optional duration (1–60 min) or time-only (frequency).
--
-- rollback:
--   drop table if exists public.mindfulness_logs cascade;

create table if not exists public.mindfulness_logs (
  id              text primary key,
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date            date not null,
  logged_at       timestamptz not null,
  duration_min    int,
  updated_at      timestamptz not null default now(),
  constraint mindfulness_logs_duration_min_check
    check (duration_min is null or duration_min between 1 and 60)
);

create index if not exists mindfulness_logs_user_date_idx
  on public.mindfulness_logs (user_id, date desc);

create index if not exists mindfulness_logs_user_updated_idx
  on public.mindfulness_logs (user_id, updated_at desc);

drop trigger if exists set_updated_at on public.mindfulness_logs;
create trigger set_updated_at before update on public.mindfulness_logs
  for each row execute function public.tg_set_updated_at();

alter table public.mindfulness_logs enable row level security;

drop policy if exists "own_select" on public.mindfulness_logs;
drop policy if exists "own_modify" on public.mindfulness_logs;

create policy "own_select" on public.mindfulness_logs
  for select using (user_id = auth.uid());
create policy "own_modify" on public.mindfulness_logs
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
