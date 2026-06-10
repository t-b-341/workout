-- Weekly body measurements: waist/abdomen/hips.
--
-- rollback:
--   drop table if exists public.body_measurement_logs cascade;

create table if not exists public.body_measurement_logs (
  id          text primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date        date not null,
  waist       numeric not null,
  abdomen     numeric not null,
  hips        numeric not null,
  updated_at  timestamptz not null default now()
);

create index if not exists body_measurement_logs_user_date_idx
  on public.body_measurement_logs (user_id, date desc);

drop trigger if exists set_updated_at on public.body_measurement_logs;
create trigger set_updated_at before update on public.body_measurement_logs
  for each row execute function public.tg_set_updated_at();

alter table public.body_measurement_logs enable row level security;

drop policy if exists "own_select" on public.body_measurement_logs;
drop policy if exists "own_modify" on public.body_measurement_logs;

create policy "own_select" on public.body_measurement_logs for select using (user_id = auth.uid());
create policy "own_modify" on public.body_measurement_logs for all using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on public.body_measurement_logs to authenticated, service_role;
