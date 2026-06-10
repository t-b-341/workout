-- Named mesocycle blocks with explicit start/end dates (replaces reliance on
-- mathematical projection for analysis windows). Synced via Dexie dirty queue.
--
-- rollback:
--   drop table if exists public.named_mesocycles cascade;

create table if not exists public.named_mesocycles (
  id          text primary key,
  user_id     uuid not null default auth.uid()
              references auth.users(id) on delete cascade,
  label       text not null default '',
  start_date  date not null,
  end_date    date not null,
  notes       text not null default '',
  updated_at  timestamptz not null default now()
);

create index if not exists named_mesocycles_user_start_idx
  on public.named_mesocycles (user_id, start_date desc);

create index if not exists named_mesocycles_updated_at_idx
  on public.named_mesocycles (user_id, updated_at desc);

alter table public.named_mesocycles enable row level security;

drop policy if exists "own_select" on public.named_mesocycles;
drop policy if exists "own_modify" on public.named_mesocycles;

drop policy if exists "own_select" on public.named_mesocycles;
create policy "own_select" on public.named_mesocycles for select using (user_id = auth.uid());

drop policy if exists "own_modify" on public.named_mesocycles;
create policy "own_modify" on public.named_mesocycles for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop trigger if exists set_updated_at on public.named_mesocycles;
create trigger set_updated_at
  before update on public.named_mesocycles
  for each row execute function public.tg_set_updated_at();

alter publication supabase_realtime
  add table public.named_mesocycles;

grant select, insert, update, delete on public.named_mesocycles to authenticated, service_role;
