-- Injury episodes (open until ended_at set) + daily subjective body readiness.
--
-- rollback:
--   drop table if exists public.body_readiness_logs cascade;
--   drop table if exists public.injury_episodes cascade;

create table if not exists public.injury_episodes (
  id          text primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  site_key    text not null,
  kind        text not null check (kind in ('acute', 'chronic')),
  notes       text,
  started_at  timestamptz not null,
  ended_at    timestamptz,
  updated_at  timestamptz not null default now()
);

create index if not exists injury_episodes_user_started_idx
  on public.injury_episodes (user_id, started_at desc);

create index if not exists injury_episodes_site_idx
  on public.injury_episodes (user_id, site_key);

drop trigger if exists set_updated_at on public.injury_episodes;
create trigger set_updated_at before update on public.injury_episodes
  for each row execute function public.tg_set_updated_at();

alter table public.injury_episodes enable row level security;

drop policy if exists "own_select" on public.injury_episodes;
drop policy if exists "own_modify" on public.injury_episodes;

create policy "own_select" on public.injury_episodes
  for select using (user_id = auth.uid());
create policy "own_modify" on public.injury_episodes
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create table if not exists public.body_readiness_logs (
  id          text primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date        date not null,
  score       int not null check (score between 1 and 5),
  updated_at  timestamptz not null default now()
);

create unique index if not exists body_readiness_logs_user_date_unique
  on public.body_readiness_logs (user_id, date);

create index if not exists body_readiness_logs_user_updated_idx
  on public.body_readiness_logs (user_id, updated_at desc);

drop trigger if exists set_updated_at on public.body_readiness_logs;
create trigger set_updated_at before update on public.body_readiness_logs
  for each row execute function public.tg_set_updated_at();

alter table public.body_readiness_logs enable row level security;

drop policy if exists "own_select" on public.body_readiness_logs;
drop policy if exists "own_modify" on public.body_readiness_logs;

create policy "own_select" on public.body_readiness_logs
  for select using (user_id = auth.uid());
  with check (user_id = auth.uid());

grant select, insert, update, delete on public.injury_episodes to authenticated, service_role;
grant select, insert, update, delete on public.body_readiness_logs to authenticated, service_role;
