create table if not exists public.pullup_logs (
  id          text primary key,
  user_id     uuid not null default auth.uid()
              references auth.users(id) on delete cascade,
  date        date not null,
  logged_at   timestamptz not null default now(),
  reps        integer not null default 1 check (reps >= 1),
  notes       text,
  updated_at  timestamptz not null default now()
);

create index if not exists pullup_logs_user_date_idx
  on public.pullup_logs (user_id, date desc);

create index if not exists pullup_logs_updated_at_idx
  on public.pullup_logs (user_id, updated_at desc);

alter table public.pullup_logs enable row level security;

drop policy if exists "own_select" on public.pullup_logs;
drop policy if exists "own_modify" on public.pullup_logs;

create policy "own_select" on public.pullup_logs for select using (user_id = auth.uid());

create policy "own_modify" on public.pullup_logs for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop trigger if exists set_updated_at on public.pullup_logs;
create trigger set_updated_at
  before update on public.pullup_logs
  for each row execute function public.tg_set_updated_at();

alter publication supabase_realtime
  add table public.pullup_logs;

grant select, insert, update, delete on public.pullup_logs to authenticated, service_role;
