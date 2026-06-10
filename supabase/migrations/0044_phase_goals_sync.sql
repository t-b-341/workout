create table if not exists public.phase_goals (
  id              text primary key,
  user_id         uuid not null default auth.uid()
                  references auth.users(id) on delete cascade,
  label           text not null default '',
  training_mode   text not null default 'accumulation'
                  check (training_mode in (
                    'accumulation','maintenance','deload')),
  nutrition_mode  text not null default 'maintenance'
                  check (nutrition_mode in (
                    'surplus','maintenance','deficit')),
  start_date      date not null,
  end_date        date not null,
  calories_training integer,
  calories_rest     integer,
  protein_g         integer,
  notes           text not null default '',
  active          boolean not null default true,
  updated_at      timestamptz not null default now()
);

create index if not exists phase_goals_user_date_idx
  on public.phase_goals (user_id, start_date);

create index if not exists phase_goals_updated_at_idx
  on public.phase_goals (user_id, updated_at desc);

alter table public.phase_goals enable row level security;

drop policy if exists "own_select" on public.phase_goals;
create policy "own_select" on public.phase_goals for select using (user_id = auth.uid());

drop policy if exists "own_modify" on public.phase_goals;
create policy "own_modify" on public.phase_goals for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create trigger set_updated_at
  before update on public.phase_goals
  for each row execute function public.tg_set_updated_at();

alter publication supabase_realtime
  add table public.phase_goals;

grant select, insert, update, delete on public.phase_goals to authenticated, service_role;
