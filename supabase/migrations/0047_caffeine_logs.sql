create table if not exists public.caffeine_logs (
  id          text primary key,
  user_id     uuid not null default auth.uid()
              references auth.users(id) on delete cascade,
  date        date not null,
  logged_at   timestamptz not null default now(),
  amount_mg   integer not null default 125,
  pieces      integer not null default 1,
  notes       text,
  updated_at  timestamptz not null default now()
);

create index if not exists caffeine_logs_user_date_idx
  on public.caffeine_logs (user_id, date desc);

alter table public.caffeine_logs enable row level security;

drop policy if exists "own_select" on public.caffeine_logs;
create policy "own_select" on public.caffeine_logs for select using (user_id = auth.uid());

drop policy if exists "own_modify" on public.caffeine_logs;
create policy "own_modify" on public.caffeine_logs for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create trigger set_updated_at
  before update on public.caffeine_logs
  for each row execute function public.tg_set_updated_at();

alter publication supabase_realtime
  add table public.caffeine_logs;

grant select, insert, update, delete on public.caffeine_logs to authenticated, service_role;
