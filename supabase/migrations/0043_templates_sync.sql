create table if not exists public.templates (
  id          text primary key,
  user_id     uuid not null default auth.uid()
              references auth.users(id) on delete cascade,
  name        text not null default '',
  day_of_week int  not null default 1,
  "group"     text not null default 'upper'
              check ("group" in ('upper', 'lower')),
  intensity   text not null default 'heavy'
              check (intensity in ('heavy', 'light', 'moderate')),
  updated_at  timestamptz not null default now()
);

create index if not exists templates_user_dow_idx
  on public.templates (user_id, day_of_week);

create index if not exists templates_updated_at_idx
  on public.templates (user_id, updated_at desc);

alter table public.templates enable row level security;

drop policy if exists "own_select" on public.templates;
create policy "own_select" on public.templates for select using (user_id = auth.uid());

drop policy if exists "own_modify" on public.templates;
create policy "own_modify" on public.templates for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop trigger if exists set_updated_at on public.templates;
create trigger set_updated_at
  before update on public.templates
  for each row execute function public.tg_set_updated_at();

do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'templates'
  ) then
    alter publication supabase_realtime add table public.templates;
  end if;
end $$;

grant select, insert, update, delete on public.templates to authenticated, service_role;
