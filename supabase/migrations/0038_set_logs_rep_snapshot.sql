ALTER TABLE public.set_logs
  ADD COLUMN IF NOT EXISTS prescribed_rep_min integer,
  ADD COLUMN IF NOT EXISTS prescribed_rep_max integer;
