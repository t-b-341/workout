-- Readiness check captured at session start (sleep / soreness / motivation /
-- optional bodyweight). One row per session_log normally; created_at lets
-- us tolerate duplicates safely.
--
-- rollback:
--   drop table if exists public.readiness_logs cascade;

create table if not exists public.readiness_logs (
  id              text primary key,
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  session_log_id  text not null references public.session_logs(id) on delete cascade,
  date            date not null,
  sleep_hours     numeric not null,
  soreness        int not null check (soreness between 1 and 5),
  motivation      int not null check (motivation between 1 and 5),
  bodyweight      numeric,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists readiness_logs_user_session_idx
  on public.readiness_logs (user_id, session_log_id);
create index if not exists readiness_logs_user_date_idx
  on public.readiness_logs (user_id, date desc);

-- Reuse the trigger function defined in 0001_init.sql.
drop trigger if exists set_updated_at on public.readiness_logs;
create trigger set_updated_at before update on public.readiness_logs
  for each row execute function public.tg_set_updated_at();

-- RLS — match the pattern from 0001.
alter table public.readiness_logs enable row level security;

drop policy if exists "own_select" on public.readiness_logs;
drop policy if exists "own_modify" on public.readiness_logs;

drop policy if exists "own_select" on public.readiness_logs;
create policy "own_select" on public.readiness_logs for select using (user_id = auth.uid());
drop policy if exists "own_modify" on public.readiness_logs;
create policy "own_modify" on public.readiness_logs for all using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on public.readiness_logs to authenticated, service_role;
