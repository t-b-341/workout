-- Add prescriptions (and catalog tables when present) to supabase_realtime so
-- postgres_changes reach clients after desktop program edits.
--
-- rollback:
--   alter publication supabase_realtime drop table if exists prescriptions;
--   alter publication supabase_realtime drop table if exists templates;
--   alter publication supabase_realtime drop table if exists lifts;

do $$
declare
  t text;
begin
  foreach t in array array['prescriptions', 'templates', 'lifts']
  loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    if exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      continue;
    end if;
    execute format('alter publication supabase_realtime add table public.%I', t);
  end loop;
end $$;
