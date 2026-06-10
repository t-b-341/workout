-- Quick session saved loadouts per tier. Synced via Dexie dirty queue.
--
-- rollback:
--   drop table if exists public.quick_loadouts cascade;

create table if not exists public.quick_loadouts (
  id          text primary key,
  user_id     uuid not null default auth.uid()
              references auth.users(id) on delete cascade,
  tier        text not null,
  label       text not null default '',
  lift_ids    text[] not null default '{}',
  updated_at  timestamptz not null default now()
);

create index if not exists quick_loadouts_user_tier_idx
  on public.quick_loadouts (user_id, tier);

create index if not exists quick_loadouts_updated_at_idx
  on public.quick_loadouts (user_id, updated_at desc);

alter table public.quick_loadouts enable row level security;

drop policy if exists "own_select" on public.quick_loadouts;
drop policy if exists "own_modify" on public.quick_loadouts;

drop policy if exists "own_select" on public.quick_loadouts;
create policy "own_select" on public.quick_loadouts for select using (user_id = auth.uid());

drop policy if exists "own_modify" on public.quick_loadouts;
create policy "own_modify" on public.quick_loadouts for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop trigger if exists set_updated_at on public.quick_loadouts;
create trigger set_updated_at
  before update on public.quick_loadouts
  for each row execute function public.tg_set_updated_at();

do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'quick_loadouts'
  ) then
    alter publication supabase_realtime add table public.quick_loadouts;
  end if;
end $$;

grant select, insert, update, delete on public.quick_loadouts to authenticated, service_role;
