ALTER TABLE public.set_logs
  ADD COLUMN IF NOT EXISTS bar_speed text
    CHECK (bar_speed IN ('fast', 'normal', 'slow'));
