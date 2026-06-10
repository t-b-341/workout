create table if not exists public.block_templates (
  id          text primary key,
  user_id     uuid not null default auth.uid()
              references auth.users(id) on delete cascade,
  label       text not null default '',
  anchor_date date not null,
  total_weeks integer not null default 10,
  phases      jsonb not null default '[]',
  updated_at  timestamptz not null default now()
);

create index if not exists block_templates_user_idx
  on public.block_templates (user_id, anchor_date desc);

alter table public.block_templates enable row level security;

create policy "own_select" on public.block_templates for select using (user_id = auth.uid());

create policy "own_modify" on public.block_templates for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create trigger set_updated_at
  before update on public.block_templates
  for each row execute function public.tg_set_updated_at();

alter publication supabase_realtime
  add table public.block_templates;

grant select, insert, update, delete on public.block_templates to authenticated, service_role;
