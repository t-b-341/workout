-- Optional future tables from multi-device roadmap: add updated_at + trigger when present.
-- Skips cleanly when relations do not exist (to_regclass).

do $$
begin
  if to_regclass('public.workday_logs') is not null then
    execute
      'alter table public.workday_logs add column if not exists updated_at timestamptz not null default now()';
    execute 'drop trigger if exists set_updated_at on public.workday_logs';
    execute
      'create trigger set_updated_at before update on public.workday_logs for each row execute function public.tg_set_updated_at()';
  end if;
end$$;

do $$
begin
  if to_regclass('public.supplement_logs') is not null then
    execute
      'alter table public.supplement_logs add column if not exists updated_at timestamptz not null default now()';
    execute 'drop trigger if exists set_updated_at on public.supplement_logs';
    execute
      'create trigger set_updated_at before update on public.supplement_logs for each row execute function public.tg_set_updated_at()';
  end if;
end$$;
