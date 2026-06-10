-- Daily stress tracking (start, mid, end, average).
--
-- rollback:
--   drop table if exists public.stress_logs cascade;

create table if not exists public.stress_logs (
  id            text primary key,
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date          date not null,
  start_of_day  int not null check (start_of_day between 1 and 5),
  mid_day       int not null check (mid_day between 1 and 5),
  end_of_day    int not null check (end_of_day between 1 and 5),
  average       numeric not null,
  updated_at    timestamptz not null default now()
);

create index if not exists stress_logs_user_date_idx
  on public.stress_logs (user_id, date desc);

drop trigger if exists set_updated_at on public.stress_logs;
create trigger set_updated_at before update on public.stress_logs
  for each row execute function public.tg_set_updated_at();

alter table public.stress_logs enable row level security;

drop policy if exists "own_select" on public.stress_logs;
drop policy if exists "own_modify" on public.stress_logs;

drop policy if exists "own_select" on public.stress_logs;
create policy "own_select" on public.stress_logs for select using (user_id = auth.uid());
drop policy if exists "own_modify" on public.stress_logs;
create policy "own_modify" on public.stress_logs for all using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on public.stress_logs to authenticated, service_role;
