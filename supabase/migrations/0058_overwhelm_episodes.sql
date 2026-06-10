-- Overwhelm Protocol episode logs.
--
-- rollback:
--   drop table if exists public.overwhelm_episodes cascade;

create table if not exists public.overwhelm_episodes (
  id                    text primary key,
  user_id               uuid not null default auth.uid()
                        references auth.users(id) on delete cascade,
  date                  date not null,
  started_at            timestamptz not null,
  ended_at              timestamptz,
  tier                  smallint not null check (tier between 1 and 3),
  distress_before       smallint not null check (distress_before between 1 and 10),
  distress_after        smallint check (distress_after between 1 and 10),
  tipp_steps_completed  text[] not null default '{}',
  note                  text,
  updated_at            timestamptz not null default now()
);

create index if not exists overwhelm_episodes_user_date_idx
  on public.overwhelm_episodes (user_id, date desc);

create index if not exists overwhelm_episodes_updated_at_idx
  on public.overwhelm_episodes (user_id, updated_at desc);

alter table public.overwhelm_episodes enable row level security;

drop policy if exists "own_select" on public.overwhelm_episodes;
drop policy if exists "own_modify" on public.overwhelm_episodes;

drop policy if exists "own_select" on public.overwhelm_episodes;
create policy "own_select" on public.overwhelm_episodes for select using (user_id = auth.uid());

drop policy if exists "own_modify" on public.overwhelm_episodes;
create policy "own_modify" on public.overwhelm_episodes for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop trigger if exists set_updated_at on public.overwhelm_episodes;
create trigger set_updated_at
  before update on public.overwhelm_episodes
  for each row execute function public.tg_set_updated_at();

alter publication supabase_realtime
  add table public.overwhelm_episodes;

grant select, insert, update, delete on public.overwhelm_episodes to authenticated, service_role;
