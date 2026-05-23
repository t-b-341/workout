create table if not exists public.stoic_checkins (
  id              text primary key,
  user_id         uuid not null default auth.uid()
                  references auth.users(id)
                  on delete cascade,
  date            date not null,
  tension         text not null default '',
  within_control  text not null default '',
  intention       text not null default '',
  updated_at      timestamptz not null default now()
);

create unique index if not exists stoic_checkins_user_date_idx
  on public.stoic_checkins (user_id, date);

create index if not exists stoic_checkins_updated_at_idx
  on public.stoic_checkins (user_id, updated_at desc);

alter table public.stoic_checkins
  enable row level security;

create policy "own_select" on public.stoic_checkins
  for select using (user_id = auth.uid());

create policy "own_modify" on public.stoic_checkins
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

create trigger set_updated_at
  before update on public.stoic_checkins
  for each row execute function public.tg_set_updated_at();

alter publication supabase_realtime
  add table public.stoic_checkins;
