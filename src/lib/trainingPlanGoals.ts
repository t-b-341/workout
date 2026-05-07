/** Overall strength-program goals + narrative detail for exports (`docs/program.md` § Goals). */

export type TrainingPlanGoalRow = {
  goal: string;
  detail: string;
};

export const TRAINING_PLAN_GOALS: readonly TrainingPlanGoalRow[] = [
  {
    goal:
      'General strength development across all major patterns (vertical/horizontal push/pull, hinge, squat)',
    detail:
      'Raise baseline strength across vertical and horizontal pressing and pulling, hip hinge, and squat patterns so progress is balanced rather than over-emphasizing a single lift or pattern.',
  },
  {
    goal: 'Upper body strength priority > lower body strength',
    detail:
      'When volume, intensity, or recovery must be traded off, bias programming and progression toward upper-body strength over lower-body strength.',
  },
  {
    goal: 'Muscle growth in weak areas',
    detail:
      'Use targeted hypertrophy work so lagging muscles and weak links improve and stop limiting compound lifts.',
  },
  {
    goal: 'Shoulder health and balance',
    detail:
      'Preserve shoulders long-term with balanced pressing and pulling and appropriate accessories; heavy pressing assumes wrist-wrap use where applicable.',
  },
  {
    goal: 'General health (cardiovascular + metabolic)',
    detail:
      'Include conditioning for metabolic health and work capacity alongside barbell strength — not lifting numbers alone.',
  },
  {
    goal: 'Maintain bodyweight, improve composition',
    detail:
      'Keep scale weight roughly stable while shifting toward more lean mass and favorable body composition, aligned with maintenance-to-slight-surplus nutrition and high protein intake.',
  },
];
