-- Weightlifting complexes: saved ordered movement sequences performed at one
-- weight. Definition only; training a complex logs individual set rows.
-- Synced via Dexie dirty queue.
--
-- rollback:
--   drop table if exists public.complexes cascade;

create table if not exists public.complexes (
  id          text primary key,
  user_id     uuid not null default auth.uid()
              references auth.users(id) on delete cascade,
  label       text not null default '',
  elements    jsonb not null default '[]'::jsonb,
  notes       text not null default '',
  updated_at  timestamptz not null default now()
);

create index if not exists complexes_user_idx
  on public.complexes (user_id);

create index if not exists complexes_updated_at_idx
  on public.complexes (user_id, updated_at desc);

alter table public.complexes enable row level security;

drop policy if exists "own_select" on public.complexes;
create policy "own_select" on public.complexes for select using (user_id = auth.uid());

drop policy if exists "own_modify" on public.complexes;
create policy "own_modify" on public.complexes for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop trigger if exists set_updated_at on public.complexes;
create trigger set_updated_at
  before update on public.complexes
  for each row execute function public.tg_set_updated_at();

do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'complexes'
  ) then
    alter publication supabase_realtime add table public.complexes;
  end if;
end $$;

grant select, insert, update, delete on public.complexes to authenticated, service_role;
