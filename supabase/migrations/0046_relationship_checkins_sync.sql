create table if not exists public.relationship_checkins (
  id                        text primary key,
  user_id                   uuid not null default auth.uid()
                            references auth.users(id)
                            on delete cascade,
  date                      date not null,
  mood_state                integer check (mood_state between 1 and 5),
  anxiety_level             integer check (anxiety_level between 1 and 5),
  connection_rating         integer check (connection_rating between 1 and 5),
  turned_toward             boolean,
  expressed_appreciation    boolean,
  physical_affection        boolean,
  horsemen_audited          boolean not null default false,
  used_criticism            boolean,
  felt_contempt             boolean,
  was_defensive             boolean,
  stonewalled               boolean,
  horsemen_note             text not null default '',
  partner_seemed_distressed boolean,
  responded_with_calm       boolean,
  had_conflict              boolean,
  conflict_repaired         boolean,
  took_responsibility       boolean,
  is_weekly_reflection      boolean not null default false,
  knows_her_inner_world     boolean,
  asked_about_her_world     boolean,
  one_thing_differently     text not null default '',
  notes                     text not null default '',
  updated_at                timestamptz not null default now()
);

create unique index if not exists rel_checkins_user_date_idx
  on public.relationship_checkins (user_id, date);

create index if not exists rel_checkins_updated_at_idx
  on public.relationship_checkins (user_id, updated_at desc);

alter table public.relationship_checkins
  enable row level security;

create policy "own_select" on public.relationship_checkins for select using (user_id = auth.uid());

create policy "own_modify" on public.relationship_checkins for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create trigger set_updated_at
  before update on public.relationship_checkins
  for each row execute function public.tg_set_updated_at();

alter publication supabase_realtime
  add table public.relationship_checkins;

grant select, insert, update, delete on public.relationship_checkins to authenticated, service_role;
