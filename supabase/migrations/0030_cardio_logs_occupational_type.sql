-- Allow occupational ("on feet") cardio type added in the app.
ALTER TABLE public.cardio_logs DROP CONSTRAINT IF EXISTS cardio_logs_type_check;
ALTER TABLE public.cardio_logs ADD CONSTRAINT cardio_logs_type_check
  CHECK (type IN ('liss', 'intervals', 'occupational'));
