-- Optional per-check-in meal timestamps (JSON array of ISO strings).
--
-- rollback:
--   alter table public.nutrition_logs drop column if exists meal_timestamps;

alter table public.nutrition_logs add column if not exists meal_timestamps jsonb default '[]'::jsonb;
