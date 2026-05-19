-- Adds supplement_logs table for cross-device sync.
-- One row per user per date. Columns mirror supplement IDs.
-- rollback: drop table if exists public.supplement_logs;

create table if not exists public.supplement_logs (
  id          text primary key,
  user_id     uuid not null default auth.uid()
              references auth.users(id) on delete cascade,
  date        date not null,
  zma         boolean not null default false,
  d3k2        boolean not null default false,
  multi       boolean not null default false,
  creatine    boolean not null default false,
  all_taken   boolean not null default false,
  updated_at  timestamptz not null default now()
);

create unique index if not exists supplement_logs_user_date_idx
  on public.supplement_logs (user_id, date);

create index if not exists supplement_logs_updated_at_idx
  on public.supplement_logs (user_id, updated_at desc);

alter table public.supplement_logs enable row level security;

create policy "own_select" on public.supplement_logs
  for select using (user_id = auth.uid());

create policy "own_modify" on public.supplement_logs
  for all
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

create trigger set_updated_at
  before update on public.supplement_logs
  for each row execute function public.tg_set_updated_at();

alter publication supabase_realtime
  add table public.supplement_logs;
