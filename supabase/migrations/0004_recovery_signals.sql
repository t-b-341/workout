-- Daily recovery signal logs for nutrition, hydration, and sleep.
-- Safe to run multiple times.
--
-- rollback:
--   drop table if exists public.sleep_logs cascade;
--   drop table if exists public.hydration_logs cascade;
--   drop table if exists public.nutrition_logs cascade;

create table if not exists public.nutrition_logs (
  id                  text primary key,
  user_id             uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date                date not null,
  calories_target     numeric not null default 0,
  calories_actual     numeric not null default 0,
  protein_target_g    numeric not null default 0,
  protein_actual_g    numeric not null default 0,
  carbs_target_g      numeric not null default 0,
  carbs_actual_g      numeric not null default 0,
  fat_target_g        numeric not null default 0,
  fat_actual_g        numeric not null default 0,
  meals_logged_count  int not null default 0 check (meals_logged_count >= 0),
  updated_at          timestamptz not null default now()
);
create unique index if not exists nutrition_logs_user_date_unique
  on public.nutrition_logs (user_id, date);
create index if not exists nutrition_logs_user_updated_idx
  on public.nutrition_logs (user_id, updated_at desc);

create table if not exists public.hydration_logs (
  id               text primary key,
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date             date not null,
  water_target_ml  numeric not null default 0,
  water_actual_ml  numeric not null default 0,
  electrolytes     boolean not null default false,
  urine_color      int check (urine_color between 1 and 8),
  updated_at       timestamptz not null default now()
);
create unique index if not exists hydration_logs_user_date_unique
  on public.hydration_logs (user_id, date);
create index if not exists hydration_logs_user_updated_idx
  on public.hydration_logs (user_id, updated_at desc);

create table if not exists public.sleep_logs (
  id                        text primary key,
  user_id                   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date                      date not null,
  sleep_hours               numeric not null default 0,
  sleep_quality             int not null check (sleep_quality between 1 and 5),
  sleep_onset_latency_min   int check (sleep_onset_latency_min >= 0),
  wake_count                int check (wake_count >= 0),
  updated_at                timestamptz not null default now()
);
create unique index if not exists sleep_logs_user_date_unique
  on public.sleep_logs (user_id, date);
create index if not exists sleep_logs_user_updated_idx
  on public.sleep_logs (user_id, updated_at desc);

drop trigger if exists set_updated_at on public.nutrition_logs;
create trigger set_updated_at before update on public.nutrition_logs
  for each row execute function public.tg_set_updated_at();

drop trigger if exists set_updated_at on public.hydration_logs;
create trigger set_updated_at before update on public.hydration_logs
  for each row execute function public.tg_set_updated_at();

drop trigger if exists set_updated_at on public.sleep_logs;
create trigger set_updated_at before update on public.sleep_logs
  for each row execute function public.tg_set_updated_at();

alter table public.nutrition_logs enable row level security;
alter table public.hydration_logs enable row level security;
alter table public.sleep_logs enable row level security;

drop policy if exists "own_select" on public.nutrition_logs;
drop policy if exists "own_modify" on public.nutrition_logs;
create policy "own_select" on public.nutrition_logs
  for select using (user_id = auth.uid());
create policy "own_modify" on public.nutrition_logs
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "own_select" on public.hydration_logs;
drop policy if exists "own_modify" on public.hydration_logs;
create policy "own_select" on public.hydration_logs
  for select using (user_id = auth.uid());
create policy "own_modify" on public.hydration_logs
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "own_select" on public.sleep_logs;
drop policy if exists "own_modify" on public.sleep_logs;
create policy "own_select" on public.sleep_logs
  for select using (user_id = auth.uid());
  with check (user_id = auth.uid());

grant select, insert, update, delete on public.nutrition_logs to authenticated, service_role;
grant select, insert, update, delete on public.hydration_logs to authenticated, service_role;
grant select, insert, update, delete on public.sleep_logs to authenticated, service_role;
