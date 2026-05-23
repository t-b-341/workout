ALTER TABLE public.session_logs
  ADD COLUMN IF NOT EXISTS perceived_recovery integer
    CHECK (perceived_recovery BETWEEN 1 AND 5);
