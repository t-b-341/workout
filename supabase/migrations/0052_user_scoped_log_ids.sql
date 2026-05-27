-- Migrate the rest of the per-day-keyed log tables to user-scoped primary
-- keys, same pattern as 0051_templates_user_scoped_ids.sql.
--
-- Background: these tables all build their primary key from `date` (or
-- equivalent), e.g. 'nutrition-2026-05-27' or 'bw-2026-05-27'. Because
-- the bare id is identical across users, a second user's upsert on the
-- same date falls into `ON CONFLICT DO UPDATE` against the first user's
-- row, RLS rejects the UPDATE (existing row's user_id ≠ auth.uid()),
-- and the upsert silently no-ops with zero rows affected. The client
-- sees no error and the dirty queue entry is removed, so writes look
-- successful but never land.
--
-- Idempotent: only rows whose id has no ':' yet are rewritten. Safe to
-- re-run.
--
-- rollback:
--   -- Lossy and unsafe once multiple users have rows sharing a bare id.
--   -- Only valid if exactly one user's data was ever migrated for a
--   -- given table.
--   --
--   -- update public.<table>
--   --    set id = split_part(id, ':', 2)
--   --  where strpos(id, ':') > 0;

do $$
declare t text;
begin
  for t in select unnest(array[
    'nutrition_logs',
    'hydration_logs',
    'bodyweight_logs',
    'oral_health_logs',
    'sleep_logs',
    'stoic_checkins',
    'relationship_checkins',
    'body_measurement_logs',
    'supplement_logs'
  ])
  loop
    execute format(
      'update public.%I
          set id = user_id::text || '':'' || id
        where strpos(id, '':'') = 0;',
      t
    );
  end loop;
end$$;
