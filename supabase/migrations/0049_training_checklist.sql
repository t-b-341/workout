create table if not exists public.training_checklist (
  id           text primary key,
  user_id      uuid not null default auth.uid()
               references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  text         text not null default '',
  completed    boolean not null default false,
  completed_at timestamptz,
  comments     jsonb not null default '[]',
  updated_at   timestamptz not null default now()
);

create index if not exists training_checklist_user_idx
  on public.training_checklist (user_id, completed, created_at desc);

alter table public.training_checklist enable row level security;

drop policy if exists "own_select" on public.training_checklist;
create policy "own_select" on public.training_checklist for select using (user_id = auth.uid());

drop policy if exists "own_modify" on public.training_checklist;
create policy "own_modify" on public.training_checklist for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create trigger set_updated_at before update
  on public.training_checklist
  for each row execute function public.tg_set_updated_at();

alter publication supabase_realtime
  add table public.training_checklist;

grant select, insert, update, delete on public.training_checklist to authenticated, service_role;
