-- Round out the user-scoped-id migration set (0051/0052/0053) by covering
-- `block_templates` and `phase_goals`. Both use deterministic shared id
-- patterns (`block-${anchorDate}` and `${blockId}-p1` etc.), so two
-- accounts planning a block on the same anchor day hit the same RLS-blocked
-- upsert path that broke nutrition / session / readiness syncing earlier.
--
-- Idempotent: only rows whose id has no ':' yet are rewritten. No FK
-- cascades to handle here — block_templates ↔ phase_goals reference each
-- other only via convention (phase id starts with block id) and the
-- block_templates.phases jsonb snapshot, never via a Postgres FK.
--
-- rollback (single-user only, approximate):
--   update public.phase_goals
--      set id = split_part(id, ':', 2)
--    where strpos(id, ':') > 0;
--   update public.block_templates
--      set id = split_part(id, ':', 2)
--    where strpos(id, ':') > 0;

update public.block_templates
   set id = user_id::text || ':' || id
 where strpos(id, ':') = 0;

update public.phase_goals
   set id = user_id::text || ':' || id
 where strpos(id, ':') = 0;
