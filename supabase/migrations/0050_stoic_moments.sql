create table if not exists public.stoic_moments (
  id          text primary key,
  user_id     uuid not null default auth.uid()
              references auth.users(id) on delete cascade,
  date        date not null,
  created_at  timestamptz not null default now(),
  reflection  text not null default '',
  action      text,
  updated_at  timestamptz not null default now()
);

create index if not exists stoic_moments_user_date_idx
  on public.stoic_moments (user_id, date desc);

create index if not exists stoic_moments_updated_at_idx
  on public.stoic_moments (user_id, updated_at desc);

alter table public.stoic_moments
  enable row level security;

drop policy if exists "own_select" on public.stoic_moments;
create policy "own_select" on public.stoic_moments for select using (user_id = auth.uid());

drop policy if exists "own_modify" on public.stoic_moments;
create policy "own_modify" on public.stoic_moments for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop trigger if exists set_updated_at on public.stoic_moments;
create trigger set_updated_at
  before update on public.stoic_moments
  for each row execute function public.tg_set_updated_at();

do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'stoic_moments'
  ) then
    alter publication supabase_realtime add table public.stoic_moments;
  end if;
end $$;

grant select, insert, update, delete on public.stoic_moments to authenticated, service_role;
