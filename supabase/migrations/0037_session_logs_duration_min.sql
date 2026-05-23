ALTER TABLE public.session_logs
  ADD COLUMN IF NOT EXISTS duration_min integer;
