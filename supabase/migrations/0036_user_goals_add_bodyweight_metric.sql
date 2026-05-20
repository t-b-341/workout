ALTER TABLE public.user_goals
  DROP CONSTRAINT IF EXISTS user_goals_metric_check;

ALTER TABLE public.user_goals
  ADD CONSTRAINT user_goals_metric_check
    CHECK (metric IN (
      '1rm', 'working_set', 'reps', 'bodyweight'
    ));
