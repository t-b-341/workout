-- User-defined lifting goals (replaces hardcoded Goals 2026 / Accessories snapshots).
-- rollback: drop table if exists public.user_goals;

create table if not exists public.user_goals (
  id            text primary key,
  user_id       uuid not null default auth.uid()
                references auth.users(id) on delete cascade,
  lift_id       text not null,
  label         text not null,
  metric        text not null check (metric in
                  ('1rm', 'working_set', 'reps')),
  target_value  numeric not null,
  target_reps   integer,
  deadline      date,
  created_at    timestamptz not null default now(),
  achieved_at   timestamptz,
  baseline_value numeric not null default 0,
  active        boolean not null default true,
  updated_at    timestamptz not null default now()
);

create index if not exists user_goals_user_active_idx
  on public.user_goals (user_id, active);

alter table public.user_goals enable row level security;

drop policy if exists "own_select" on public.user_goals;
create policy "own_select" on public.user_goals for select using (user_id = auth.uid());

drop policy if exists "own_modify" on public.user_goals;
create policy "own_modify" on public.user_goals for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop trigger if exists set_updated_at on public.user_goals;
create trigger set_updated_at
  before update on public.user_goals
  for each row execute function public.tg_set_updated_at();

do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'user_goals'
  ) then
    alter publication supabase_realtime add table public.user_goals;
  end if;
end $$;

grant select, insert, update, delete on public.user_goals to authenticated, service_role;
