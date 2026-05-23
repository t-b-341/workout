create table if not exists public.cbt_thought_records (
  id                  text primary key,
  user_id             uuid not null default auth.uid()
                      references auth.users(id)
                      on delete cascade,
  date                date not null,
  created_at          timestamptz not null default now(),
  situation           text not null default '',
  automatic_thought   text not null default '',
  emotion             text not null default '',
  emotion_intensity   integer not null default 5
                      check (emotion_intensity between 1 and 10),
  evidence            text not null default '',
  alternative_thought text not null default '',
  stress_log_id       text,
  updated_at          timestamptz not null default now()
);

create index if not exists cbt_thought_records_user_date_idx
  on public.cbt_thought_records (user_id, date desc);

alter table public.cbt_thought_records
  enable row level security;

create policy "own_select" on public.cbt_thought_records
  for select using (user_id = auth.uid());

create policy "own_modify" on public.cbt_thought_records
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

create trigger set_updated_at
  before update on public.cbt_thought_records
  for each row execute function public.tg_set_updated_at();

alter publication supabase_realtime
  add table public.cbt_thought_records;
