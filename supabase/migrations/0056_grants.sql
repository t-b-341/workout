-- 0056_grants.sql
-- Explicit grants required by Supabase Data API security change (effective Oct 30 2026).
-- Safe to re-run; IF EXISTS guards prevent errors on tables that may not exist in all envs.

do $$ 
declare
  t text;
  tables text[] := array[
    'prescriptions','session_logs','set_logs','cardio_logs','bodyweight_logs',
    'readiness_logs','nutrition_logs','hydration_logs','sleep_logs',
    'body_measurement_logs','stress_logs','injury_episodes','body_readiness_logs',
    'mindfulness_logs','supplement_logs','user_goals','cbt_thought_records',
    'stoic_checkins','stoic_moments','templates','phase_goals','block_templates',
    'relationship_checkins','caffeine_logs','oral_health_logs','training_checklist',
    'named_mesocycles'
  ];
begin
  foreach t in array tables loop
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = t
    ) then
      execute format(
        'grant select, insert, update, delete on public.%I to authenticated, service_role', t
      );
    end if;
  end loop;
end $$;
