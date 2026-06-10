-- Workout tracker initial schema.
-- Single-user-per-row model: every table has user_id (auth.uid()) and RLS scoped to it.

-- ============== prescriptions ==============
create table if not exists public.prescriptions (
  id            text primary key,
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  template_id   text not null,
  lift_id       text not null,
  "order"       int  not null default 0,
  weight        numeric not null default 0,
  sets          int  not null default 1,
  rep_min       int  not null default 1,
  rep_max       int  not null default 1,
  increment     numeric,
  per_side      boolean,
  tempo         text,
  notes         text,
  updated_at    timestamptz not null default now()
);
create index if not exists prescriptions_user_template_idx
  on public.prescriptions (user_id, template_id, "order");

-- ============== session_logs ==============
create table if not exists public.session_logs (
  id            text primary key,
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date          date not null,
  template_id   text not null,
  mode          text not null default 'standard' check (mode in ('standard','light','skip')),
  deload        boolean not null default false,
  reason        text,
  watch_flags   text[] not null default '{}',
  notes         text,
  completed_at  timestamptz,
  updated_at    timestamptz not null default now()
);
create index if not exists session_logs_user_date_idx
  on public.session_logs (user_id, date desc);

-- ============== set_logs ==============
create table if not exists public.set_logs (
  id                  text primary key,
  user_id             uuid not null default auth.uid() references auth.users(id) on delete cascade,
  session_log_id      text not null references public.session_logs(id) on delete cascade,
  lift_id             text not null,
  prescription_id     text not null,
  set_index           int  not null,
  weight              numeric not null,
  reps                int  not null,
  status              text not null default 'completed' check (status in ('completed','reduced','skipped','substituted')),
  substitute_lift_id  text,
  reason              text,
  side                text check (side in ('L','R')),
  updated_at          timestamptz not null default now()
);
create index if not exists set_logs_user_session_idx
  on public.set_logs (user_id, session_log_id);
create index if not exists set_logs_user_lift_idx
  on public.set_logs (user_id, lift_id);

-- ============== cardio_logs ==============
create table if not exists public.cardio_logs (
  id              text primary key,
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  session_log_id  text references public.session_logs(id) on delete set null,
  date            date not null,
  type            text not null check (type in ('liss','intervals')),
  duration_min    numeric not null,
  speed_mph       numeric,
  grade_pct       numeric,
  avg_hr          int,
  peak_hr         int,
  notes           text,
  updated_at      timestamptz not null default now()
);
create index if not exists cardio_logs_user_date_idx
  on public.cardio_logs (user_id, date desc);

-- ============== bodyweight_logs ==============
create table if not exists public.bodyweight_logs (
  id          text primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date        date not null,
  iso_week    text not null,
  bodyweight  numeric not null,
  updated_at  timestamptz not null default now()
);
-- Deduplicate before creating the unique index so this migration is safe
-- to run against existing data that may have multiple rows per week.
-- Migration 0006 drops this index anyway in favour of per-day uniqueness.
delete from public.bodyweight_logs
where id not in (
  select distinct on (user_id, iso_week) id
  from public.bodyweight_logs
  order by user_id, iso_week, updated_at desc, id desc
);

create unique index if not exists bodyweight_logs_user_week_unique
  on public.bodyweight_logs (user_id, iso_week);

-- ============== updated_at triggers ==============
create or replace function public.tg_set_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

do $$
declare t text;
begin
  for t in
    select unnest(array['prescriptions','session_logs','set_logs','cardio_logs','bodyweight_logs'])
  loop
    execute format(
      'drop trigger if exists set_updated_at on public.%I;
       create trigger set_updated_at before update on public.%I
       for each row execute function public.tg_set_updated_at();', t, t);
  end loop;
end$$;

-- ============== RLS ==============
alter table public.prescriptions    enable row level security;
alter table public.session_logs     enable row level security;
alter table public.set_logs         enable row level security;
alter table public.cardio_logs      enable row level security;
alter table public.bodyweight_logs  enable row level security;

do $$
declare t text;
begin
  for t in
    select unnest(array['prescriptions','session_logs','set_logs','cardio_logs','bodyweight_logs'])
  loop
    execute format('drop policy if exists "own_select" on public.%I;', t);
    execute format('drop policy if exists "own_modify" on public.%I;', t);
    execute format(
      'create policy "own_select" on public.%I for select using (user_id = auth.uid());', t);
    execute format(
      'create policy "own_modify" on public.%I for all
         using (user_id = auth.uid())
         with check (user_id = auth.uid());', t);
  end loop;
end$$;

grant select, insert, update, delete on public.prescriptions to authenticated, service_role;
grant select, insert, update, delete on public.session_logs to authenticated, service_role;
grant select, insert, update, delete on public.set_logs to authenticated, service_role;
grant select, insert, update, delete on public.cardio_logs to authenticated, service_role;
grant select, insert, update, delete on public.bodyweight_logs to authenticated, service_role;
