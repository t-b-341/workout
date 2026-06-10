create table if not exists public.oral_health_logs (
  id            text primary key,
  user_id       uuid not null default auth.uid()
                references auth.users(id) on delete cascade,
  date          date not null,
  tongue_scrape boolean not null default false,
  brush         boolean not null default false,
  floss         boolean not null default false,
  mouthwash     boolean not null default false,
  all_done      boolean not null default false,
  updated_at    timestamptz not null default now()
);

create unique index if not exists oral_health_logs_user_date
  on public.oral_health_logs (user_id, date);

alter table public.oral_health_logs enable row level security;

create policy "own_select" on public.oral_health_logs for select using (user_id = auth.uid());

create policy "own_modify" on public.oral_health_logs for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create trigger set_updated_at before update
  on public.oral_health_logs
  for each row execute function public.tg_set_updated_at();

alter publication supabase_realtime
  add table public.oral_health_logs;

grant select, insert, update, delete on public.oral_health_logs to authenticated, service_role;
